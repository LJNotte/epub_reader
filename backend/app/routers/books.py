import shutil
import uuid
import re
import hashlib
from pathlib import Path
from posixpath import normpath
from urllib.parse import unquote
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload
from app.config import settings
from app.database import get_db
from app.models.book import Book, Chapter, RagIndex, ReadingProgress
from app.models.note import Tag
from app.services.epub_service import extract_epub

router = APIRouter(prefix="/api/books", tags=["books"])


def file_digest(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

class ProgressPayload(BaseModel):
    current_chapter_id: uuid.UUID | None = None
    scroll_position: int = 0
    tts_chapter_id: uuid.UUID | None = None
    tts_paragraph_index: int = 0
    tts_char_offset: int = 0
    tts_speed: float = 1.0

@router.post("/upload", status_code=201)
def upload_book(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename or not file.filename.lower().endswith(".epub"):
        raise HTTPException(400, "仅支持 .epub 文件")
    original_filename = Path(file.filename).name
    duplicate = db.scalar(select(Book).where(func.lower(Book.original_filename) == original_filename.lower()))
    if duplicate:
        raise HTTPException(409, f"《{duplicate.title}》已通过同名文件“{original_filename}”导入，请勿重复导入。")
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    stored_path = settings.upload_dir / f"{uuid.uuid4()}.epub"
    with stored_path.open("wb") as output:
        shutil.copyfileobj(file.file, output)
    incoming_digest = file_digest(stored_path)
    for legacy_book in db.scalars(select(Book).where(Book.original_filename.is_(None))).all():
        legacy_path = Path(legacy_book.file_path)
        if legacy_path.exists() and file_digest(legacy_path) == incoming_digest:
            stored_path.unlink(missing_ok=True)
            legacy_book.original_filename = original_filename
            db.commit()
            raise HTTPException(409, f"《{legacy_book.title}》已导入（检测到相同 EPUB 文件），请勿重复导入。")
    try:
        parsed = extract_epub(stored_path)
    except Exception as error:
        stored_path.unlink(missing_ok=True)
        raise HTTPException(422, f"无法解析 EPUB：{error}") from error
    book = Book(title=parsed["title"], author=parsed["author"], original_filename=original_filename, file_path=str(stored_path))
    db.add(book); db.flush()
    persist_parsed_book(book, parsed, db)
    db.add(ReadingProgress(book_id=book.id))
    db.commit(); db.refresh(book)
    return serialize_book(book)

@router.post("/{book_id}/reparse")
def reparse_book(book_id: uuid.UUID, db: Session = Depends(get_db)):
    book = db.scalar(select(Book).where(Book.id == book_id))
    if not book:
        raise HTTPException(404, "书籍不存在")
    try:
        parsed = extract_epub(Path(book.file_path))
    except Exception as error:
        raise HTTPException(422, f"无法重新解析 EPUB：{error}") from error
    db.query(Chapter).filter(Chapter.book_id == book.id).delete(synchronize_session=False)
    db.query(RagIndex).filter(RagIndex.book_id == book.id).delete(synchronize_session=False)
    persist_parsed_book(book, parsed, db)
    db.commit(); db.refresh(book)
    return serialize_book(book)

@router.delete("/{book_id}", status_code=204)
def delete_book(book_id: uuid.UUID, db: Session = Depends(get_db)):
    book = db.scalar(select(Book).where(Book.id == book_id))
    if not book:
        raise HTTPException(404, "书籍不存在")
    file_path = book.file_path
    cover_url = book.cover_url
    db.delete(book)
    db.commit()
    if file_path:
        Path(file_path).unlink(missing_ok=True)
    if cover_url:
        (settings.upload_dir / cover_url.removeprefix("/media/")).unlink(missing_ok=True)
    shutil.rmtree(settings.upload_dir / "assets" / str(book_id), ignore_errors=True)

@router.get("")
def list_books(tag: uuid.UUID | None = None, db: Session = Depends(get_db)):
    statement = select(Book).options(selectinload(Book.progress), selectinload(Book.tags)).order_by(Book.updated_at.desc())
    if tag:
        statement = statement.join(Book.tags).where(Tag.id == tag)
    books = db.scalars(statement).unique().all()
    return [serialize_book(book) for book in books]

@router.get("/{book_id}")
def get_book(book_id: uuid.UUID, db: Session = Depends(get_db)):
    book = db.scalar(select(Book).where(Book.id == book_id).options(selectinload(Book.chapters), selectinload(Book.progress), selectinload(Book.tags)))
    if not book: raise HTTPException(404, "书籍不存在")
    result = serialize_book(book); result["chapters"] = serialize_chapters(book.chapters)
    try:
        result["toc"] = serialize_toc(extract_epub(Path(book.file_path))["toc"], book.chapters)
    except Exception:
        result["toc"] = []
    return result

@router.get("/{book_id}/chapters/{chapter_id}")
def get_chapter(book_id: uuid.UUID, chapter_id: uuid.UUID, db: Session = Depends(get_db)):
    chapter = db.scalar(select(Chapter).where(Chapter.id == chapter_id, Chapter.book_id == book_id))
    if not chapter: raise HTTPException(404, "章节不存在")
    return {"id": str(chapter.id), "index": chapter.index, "title": chapter.title, "display_title": chapter_display_title(chapter), "raw_html": chapter.raw_html, "plain_text": chapter.plain_text}

@router.get("/{book_id}/progress")
def get_progress(book_id: uuid.UUID, db: Session = Depends(get_db)):
    progress = db.scalar(select(ReadingProgress).where(ReadingProgress.book_id == book_id))
    if not progress: raise HTTPException(404, "进度不存在")
    return serialize_progress(progress)

@router.put("/{book_id}/progress")
def save_progress(book_id: uuid.UUID, payload: ProgressPayload, db: Session = Depends(get_db)):
    progress = db.scalar(select(ReadingProgress).where(ReadingProgress.book_id == book_id))
    if not progress: raise HTTPException(404, "书籍不存在")
    for field, value in payload.model_dump(exclude_unset=True).items(): setattr(progress, field, value)
    db.commit(); db.refresh(progress)
    return serialize_progress(progress)

def serialize_book(book: Book) -> dict:
    return {"id": str(book.id), "title": book.title, "author": book.author, "original_filename": book.original_filename, "cover_url": book.cover_url, "total_chapters": book.total_chapters, "total_characters": book.total_characters, "progress": serialize_progress(book.progress) if book.progress else None, "tags": [{"id": str(tag.id), "name": tag.name, "color": tag.color} for tag in book.tags]}

def serialize_progress(progress: ReadingProgress) -> dict:
    return {"current_chapter_id": str(progress.current_chapter_id) if progress.current_chapter_id else None, "scroll_position": progress.scroll_position, "tts_chapter_id": str(progress.tts_chapter_id) if progress.tts_chapter_id else None, "tts_paragraph_index": progress.tts_paragraph_index, "tts_char_offset": progress.tts_char_offset, "tts_speed": progress.tts_speed, "last_read_at": progress.last_read_at.isoformat() if progress.last_read_at else None}


def persist_parsed_book(book: Book, parsed: dict, db: Session) -> None:
    book.title = parsed["title"]
    book.author = parsed["author"]
    book.total_chapters = len(parsed["chapters"])
    book.total_tokens = sum(len(item["plain_text"].split()) for item in parsed["chapters"])
    book.total_characters = sum(len(item["plain_text"].strip()) for item in parsed["chapters"])
    if parsed["cover"]:
        content, suffix = parsed["cover"]
        cover_dir = settings.upload_dir / "covers"
        cover_dir.mkdir(parents=True, exist_ok=True)
        cover_path = cover_dir / f"{book.id}{suffix}"
        cover_path.write_bytes(content)
        book.cover_url = f"/media/covers/{cover_path.name}"
    asset_urls: dict[str, str] = {}
    asset_dir = settings.upload_dir / "assets" / str(book.id)
    asset_dir.mkdir(parents=True, exist_ok=True)
    for asset_name, content in parsed.get("assets", {}).items():
        suffix = Path(asset_name).suffix.lower() or ".bin"
        filename = f"{hashlib.sha256(asset_name.encode()).hexdigest()}{suffix}"
        (asset_dir / filename).write_bytes(content)
        asset_urls[f"asset://{asset_name}"] = f"/media/assets/{book.id}/{filename}"
    for index, chapter in enumerate(parsed["chapters"]):
        chapter = dict(chapter)
        for placeholder, url in asset_urls.items():
            chapter["raw_html"] = chapter["raw_html"].replace(placeholder, url)
        db.add(Chapter(book_id=book.id, index=index, token_count=len(chapter["plain_text"].split()), **chapter))


def chapter_display_title(chapter: Chapter) -> str:
    """Prefer the navigation/heading title; never expose XHTML filenames as UI."""
    title = re.sub(r"\s+", " ", (chapter.title or "").strip())
    if not title or re.search(r"\.(?:x?html?)$", title, re.IGNORECASE):
        return f"正文第 {chapter.index + 1} 节"
    return title


def serialize_chapters(chapters: list[Chapter]) -> list[dict]:
    items = []
    for chapter in chapters:
        part = chapter.index + 1
        items.append({"id": str(chapter.id), "index": chapter.index, "title": chapter.title, "display_title": chapter_display_title(chapter), "part": part, "group": chapter.chapter_group})
    return items


def serialize_toc(toc: list[dict], chapters: list[Chapter]) -> list[dict]:
    source_to_chapter: dict[str, Chapter] = {}
    for chapter in chapters:
        for source in re.findall(r'data-epub-source="([^"]+)"', chapter.raw_html):
            source_to_chapter.setdefault(source, chapter)

    def normalize_href(href: str) -> str:
        path = unquote(href).split("#", 1)[0].replace("\\", "/")
        return normpath(path).lstrip("./") if path else ""

    def anchor_from_href(href: str) -> str | None:
        return unquote(href).split("#", 1)[1] if "#" in href else None

    def has_anchor(chapter: Chapter, anchor: str) -> bool:
        quoted = re.escape(anchor)
        return bool(re.search(rf'(?:id|name)=["\']{quoted}["\']', chapter.raw_html))

    def chapter_for_href(href: str) -> Chapter | None:
        """Resolve a TOC href without falling back to a guessed title.

        EPUB navigation documents commonly use a path relative to nav.xhtml,
        while manifest items use an OPF-relative path.  A suffix match is safe
        only if it leads to exactly one stored reader chapter.
        """
        path = normalize_href(href)
        if not path:
            return None
        exact = source_to_chapter.get(path)
        if exact:
            return exact
        candidates = {
            chapter.id: chapter
            for source, chapter in source_to_chapter.items()
            if source.endswith(f"/{path}") or path.endswith(f"/{source}")
        }
        return next(iter(candidates.values())) if len(candidates) == 1 else None

    def build(items: list[dict]) -> list[dict]:
        entries = []
        for item in items:
            # Only expose a link when the EPUB itself supplies a target that we
            # can verify in the extracted reader content.  In particular, do
            # not turn a volume/part parent into a link by guessing its first
            # child: that feels like a broken jump when publishers omit hrefs.
            href = item["href"]
            chapter = chapter_for_href(href) if href else None
            children = build(item["children"])
            anchor = anchor_from_href(href)
            chapter_id = str(chapter.id) if chapter else None
            if chapter and anchor and not has_anchor(chapter, anchor):
                chapter_id = None
                anchor = None
            entries.append({"title": item["title"], "chapter_id": chapter_id, "anchor": anchor, "children": children})
        return entries

    def grouped_entries(group: str) -> list[dict]:
        return [{"title": chapter.title, "chapter_id": str(chapter.id), "anchor": None, "children": []} for chapter in chapters if chapter.chapter_group == group]

    navigation: list[dict] = []
    before = grouped_entries("before") + grouped_entries("toc")
    content = build(toc)
    used_chapter_ids = {
        entry["chapter_id"]
        for entry in walk_entries(content)
        if entry["chapter_id"]
    }
    all_chapters = [
        {"title": chapter_display_title(chapter), "chapter_id": str(chapter.id), "anchor": None, "children": []}
        for chapter in chapters
    ]
    unlinked_chapters = [entry for entry in all_chapters if entry["chapter_id"] not in used_chapter_ids]
    # A malformed or partial nav document must never hide readable content.
    # Treat it as a secondary aid unless it covers at least half the stored
    # reader chapters; the flat chapter list is always complete and clickable.
    toc_is_reliable = bool(chapters) and len(used_chapter_ids) / len(chapters) >= 0.5
    if before:
        navigation.append({"title": "前置内容", "chapter_id": None, "anchor": None, "children": before})
    if content and toc_is_reliable:
        navigation.append({"title": "正文目录", "chapter_id": None, "anchor": None, "children": content})
    if not toc_is_reliable and all_chapters:
        navigation.append({"title": "全部章节", "chapter_id": None, "anchor": None, "children": all_chapters})
    elif unlinked_chapters:
        navigation.append({"title": "未编入目录章节", "chapter_id": None, "anchor": None, "children": unlinked_chapters})
    return navigation


def walk_entries(entries: list[dict]):
    for entry in entries:
        yield entry
        yield from walk_entries(entry["children"])

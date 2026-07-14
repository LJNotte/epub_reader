import hashlib
import re
import uuid
from datetime import datetime, timezone

from sqlalchemy import select

from app.database import SessionLocal
from app.models.book import Book, Chapter, RagChunk, RagIndex

MAX_RAG_CHARACTERS = 1_000_000


def fingerprint(chapters: list[Chapter]) -> str:
    digest = hashlib.sha256()
    for chapter in chapters:
        digest.update(str(chapter.id).encode())
        digest.update(chapter.plain_text.encode())
    return digest.hexdigest()


def split_for_rag(text: str, limit: int = 700) -> list[tuple[str, int, int]]:
    """Keep paragraph boundaries where possible and retain source offsets for citations."""
    output: list[tuple[str, int, int]] = []
    cursor = 0
    for paragraph in re.split(r"(\n\s*\n+)", text):
        start = cursor
        cursor += len(paragraph)
        cleaned = re.sub(r"\s+", " ", paragraph).strip()
        if not cleaned:
            continue
        raw_start = start + paragraph.find(cleaned.split(" ", 1)[0])
        if len(cleaned) <= limit:
            output.append((cleaned, raw_start, raw_start + len(paragraph)))
            continue
        sentence_start = 0
        for piece in re.split(r"(?<=[。！？!?；;])", cleaned):
            if not piece:
                continue
            if len(piece) > limit:
                for offset in range(0, len(piece), limit):
                    chunk = piece[offset:offset + limit].strip()
                    if chunk:
                        output.append((chunk, raw_start + sentence_start + offset, raw_start + sentence_start + offset + len(chunk)))
            else:
                output.append((piece.strip(), raw_start + sentence_start, raw_start + sentence_start + len(piece)))
            sentence_start += len(piece)
    return output


def estimate_seconds(total_chars: int) -> int:
    # Current ingestion only cleans and chunks locally; keep the UX estimate honest.
    return max(1, min(12, round(total_chars / 120_000)))


def build_rag_index(book_id: uuid.UUID) -> None:
    """Background, restart-safe book digestion. Embeddings plug in after this chunk layer."""
    db = SessionLocal()
    try:
        book = db.scalar(select(Book).where(Book.id == book_id))
        index = db.scalar(select(RagIndex).where(RagIndex.book_id == book_id))
        if not book or not index:
            return
        chapters = db.scalars(select(Chapter).where(Chapter.book_id == book_id).order_by(Chapter.index)).all()
        index.status = "digesting"
        index.error_message = None
        db.commit()

        db.query(RagChunk).filter(RagChunk.rag_index_id == index.id).delete(synchronize_session=False)
        chunk_index = 0
        for chapter in chapters:
            for text, start, end in split_for_rag(chapter.plain_text):
                db.add(RagChunk(rag_index_id=index.id, chapter_id=chapter.id, index=chunk_index, text=text, start_offset=start, end_offset=end))
                chunk_index += 1
        index.chunk_count = chunk_index
        index.status = "digested"
        index.completed_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as error:
        db.rollback()
        index = db.scalar(select(RagIndex).where(RagIndex.book_id == book_id))
        if index:
            index.status = "failed"
            index.error_message = str(error)[:500]
            db.commit()
    finally:
        db.close()

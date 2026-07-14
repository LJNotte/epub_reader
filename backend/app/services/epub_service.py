from pathlib import Path
from posixpath import normpath
from posixpath import dirname, join
import re
from urllib.parse import unquote, urlsplit
from bs4 import BeautifulSoup
from ebooklib import ITEM_DOCUMENT, ITEM_IMAGE, epub


def extract_cover(book) -> tuple[bytes, str] | None:
    """Prefer the EPUB-declared cover, then fall back to an image named cover."""
    cover_ids = [value[1].get("content") for value in book.get_metadata("OPF", "cover") if len(value) > 1]
    images = list(book.get_items_of_type(ITEM_IMAGE))
    cover = next((item for item in images if item.get_id() in cover_ids), None)
    cover = cover or next((item for item in images if "cover" in item.get_name().lower()), None)
    if not cover:
        return None
    suffix = Path(cover.get_name()).suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        suffix = ".jpg" if "jpeg" in cover.media_type else ".png"
    return cover.get_content(), suffix


def rewrite_embedded_images(body_html: str, document_name: str, asset_names: set[str]) -> str:
    """Turn EPUB-relative image paths into stable asset placeholders."""
    soup = BeautifulSoup(body_html, "html.parser")
    for image in soup.find_all("img"):
        source = image.get("src")
        if not source or source.startswith(("data:", "http:", "https:")):
            continue
        path = source.split("?", 1)[0].split("#", 1)[0]
        resolved = normpath(join(dirname(document_name), path)).lstrip("./")
        if resolved in asset_names:
            image["src"] = f"asset://{resolved}"
    return str(soup)


NUMBERED_CHAPTER_RE = re.compile(r"^(?:第\s*[0-9一二三四五六七八九十百千]+\s*章|[0-9]{1,3}\s*[　.、]\s*\S+)")
STANDALONE_BOUNDARY_RE = re.compile(r"^(?:版权|总目录|目录|推荐序|中文版序|序言|前言|引言|作者后记|译者后记|后记|第[一二三四五六七八九十]+部分)")


def chapter_title(soup: BeautifulSoup, fallback: str) -> str:
    heading = soup.find(["h1", "h2", "h3"])
    return heading.get_text(" ", strip=True) if heading else fallback


def combine_documents(documents: list[dict]) -> list[dict]:
    """Merge title + continuation XHTML files into reader-facing logical chapters.

    Many commercial EPUBs split one numbered chapter across several files. A title
    such as `01　产品设计中的经济学` starts a logical chapter; following untitled
    XHTML documents remain in that chapter until the next numbered title.
    """
    chapters: list[dict] = []
    current: list[dict] = []

    def flush() -> None:
        if not current:
            return
        first = current[0]
        chapters.append({
            "title": first["title"],
            "raw_html": "\n".join(f'<section data-epub-source="{item["name"]}">{item["body_html"]}</section>' for item in current),
            "plain_text": "\n\n".join(item["plain_text"] for item in current),
            "chapter_group": "else",
        })
        current.clear()

    for document in documents:
        starts_numbered_chapter = bool(NUMBERED_CHAPTER_RE.match(document["title"]))
        starts_standalone_section = bool(STANDALONE_BOUNDARY_RE.match(document["title"]))
        if starts_numbered_chapter:
            flush()
            current.append(document)
        elif starts_standalone_section:
            flush()
            chapters.append({"title": document["title"], "raw_html": f'<section data-epub-source="{document["name"]}">{document["body_html"]}</section>', "plain_text": document["plain_text"], "chapter_group": "else"})
        elif current:
            current.append(document)
        else:
            # Front matter and standalone articles remain independently readable.
            chapters.append({"title": document["title"], "raw_html": f'<section data-epub-source="{document["name"]}">{document["body_html"]}</section>', "plain_text": document["plain_text"], "chapter_group": "else"})
    flush()
    return chapters


def extract_toc(entries) -> list[dict]:
    """Preserve the EPUB navigation tree while keeping only serializable fields."""
    result = []
    for entry in entries:
        node, children = entry if isinstance(entry, tuple) else (entry, [])
        title = getattr(node, "title", "") or "未命名目录"
        href = getattr(node, "href", "") or ""
        result.append({"title": str(title).strip(), "href": str(href), "children": extract_toc(children)})
    return result


def href_path(href: str) -> str:
    """Return a normalized OPF-relative document path from a navigation href."""
    path = unquote(urlsplit(href).path).replace("\\", "/")
    return normpath(path).lstrip("./") if path else ""


def toc_leaf_targets(entries: list[dict]) -> dict[str, str]:
    """Return the first leaf title for every document referenced by the TOC.

    A TOC can link to several anchors inside a single XHTML file.  That does not
    make the file several stored chapters; the individual anchors remain
    navigation targets in ``serialize_toc``.  The first leaf title gives the
    resulting reader chapter a human label instead of its internal filename.
    """
    targets: dict[str, str] = {}
    for entry in entries:
        if entry["children"]:
            targets.update(toc_leaf_targets(entry["children"]))
        elif entry["href"]:
            targets.setdefault(href_path(entry["href"]), entry["title"])
    return targets


def combine_documents_by_toc(documents: list[dict], toc: list[dict]) -> list[dict]:
    """Create reader chapters from TOC document boundaries.

    Navigation hierarchy is deliberately kept separate from storage: a TOC item
    may point at an anchor in a chapter, and several items may point into one
    XHTML file.  This makes a chapter label readable while keeping every TOC
    jump precise.
    """
    target_titles = toc_leaf_targets(toc)
    target_indexes = [index for index, document in enumerate(documents) if document["name"] in target_titles]
    if not target_indexes:
        return combine_documents(documents)

    first_target = min(target_indexes)
    chapters: list[dict] = []
    current: list[dict] = []
    current_title = ""

    def single(document: dict, group: str) -> None:
        chapters.append({"title": document["title"], "raw_html": f'<section data-epub-source="{document["name"]}">{document["body_html"]}</section>', "plain_text": document["plain_text"], "chapter_group": group})

    def flush() -> None:
        nonlocal current, current_title
        if current:
            chapters.append({"title": current_title or current[0]["title"], "raw_html": "\n".join(f'<section data-epub-source="{item["name"]}">{item["body_html"]}</section>' for item in current), "plain_text": "\n\n".join(item["plain_text"] for item in current), "chapter_group": "content"})
        current = []
        current_title = ""

    for index, document in enumerate(documents):
        if document["name"] in target_titles:
            flush()
            current = [document]
            current_title = target_titles[document["name"]]
        elif current:
            current.append(document)
        elif index < first_target:
            single(document, "toc" if re.search(r"(?:^|[/_])(nav|toc)(?:[._]|$)", document["name"], re.IGNORECASE) else "before")
        else:
            single(document, "else")
    flush()
    return chapters


def extract_epub(path: Path) -> dict:
    book = epub.read_epub(str(path), options={"ignore_ncx": True})
    metadata = book.get_metadata("DC", "title")
    creators = book.get_metadata("DC", "creator")
    items_by_id = {item.get_id(): item for item in book.get_items_of_type(ITEM_DOCUMENT)}
    spine_items = [items_by_id[item_id] for item_id, _ in book.spine if item_id in items_by_id]
    remaining_items = [item for item_id, item in items_by_id.items() if item_id not in {item.get_id() for item in spine_items}]
    assets = {item.get_name(): item.get_content() for item in book.get_items_of_type(ITEM_IMAGE)}
    documents = []
    for item in spine_items + remaining_items:
        html = item.get_content().decode("utf-8", errors="replace")
        content_soup = BeautifulSoup(html, "html.parser")
        body = content_soup.body or content_soup
        body_html = rewrite_embedded_images(body.decode_contents(), item.get_name(), set(assets))
        text_soup = BeautifulSoup(html, "html.parser")
        for ignored in text_soup(["script", "style", "img", "svg", "picture", "figure", "audio", "video", "canvas"]):
            ignored.decompose()
        text = text_soup.get_text("\n", strip=True)
        if text:
            documents.append({"name": item.get_name(), "title": chapter_title(content_soup, item.get_name()), "body_html": body_html, "plain_text": text})
    toc = extract_toc(book.toc)
    chapters = combine_documents_by_toc(documents, toc)
    return {"title": metadata[0][0] if metadata else path.stem, "author": creators[0][0] if creators else None, "chapters": chapters, "toc": toc, "cover": extract_cover(book), "assets": assets}

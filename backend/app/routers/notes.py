import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload
from app.database import get_db
from app.models.book import Book, Chapter
from app.models.note import Note, Tag

router = APIRouter(tags=["notes"])


class NoteCreate(BaseModel):
    book_id: uuid.UUID
    chapter_id: uuid.UUID
    selected_text: str = Field(min_length=1)
    start_offset: int = Field(ge=0)
    end_offset: int = Field(gt=0)
    user_note: str | None = None
    color: str = "#F6D86B"
    tag_ids: list[uuid.UUID] = []


class NoteUpdate(BaseModel):
    user_note: str | None = None
    color: str | None = None
    tag_ids: list[uuid.UUID] | None = None


def resolve_tags(tag_ids: list[uuid.UUID], db: Session) -> list[Tag]:
    if not tag_ids:
        return []
    tags = list(db.scalars(select(Tag).where(Tag.id.in_(tag_ids))).all())
    if len(tags) != len(set(tag_ids)):
        raise HTTPException(400, "包含不存在的标签")
    return tags


def serialize_note(note: Note) -> dict:
    return {
        "id": str(note.id), "book_id": str(note.book_id), "chapter_id": str(note.chapter_id),
        "selected_text": note.selected_text, "start_offset": note.start_offset,
        "end_offset": note.end_offset, "user_note": note.user_note, "color": note.color,
        "tags": [{"id": str(tag.id), "name": tag.name, "color": tag.color} for tag in note.tags],
        "created_at": note.created_at, "updated_at": note.updated_at,
    }


@router.post("/api/notes", status_code=201)
def create_note(payload: NoteCreate, db: Session = Depends(get_db)):
    chapter = db.scalar(select(Chapter).where(Chapter.id == payload.chapter_id, Chapter.book_id == payload.book_id))
    if not chapter:
        raise HTTPException(400, "章节不属于当前书籍")
    if payload.end_offset <= payload.start_offset:
        raise HTTPException(400, "文本偏移范围无效")
    note = Note(**payload.model_dump(exclude={"tag_ids"}))
    note.tags = resolve_tags(payload.tag_ids, db)
    db.add(note); db.commit(); db.refresh(note)
    return serialize_note(note)


@router.get("/api/books/{book_id}/notes")
def list_notes(book_id: uuid.UUID, tag: uuid.UUID | None = Query(None), q: str | None = Query(None), db: Session = Depends(get_db)):
    if not db.scalar(select(Book.id).where(Book.id == book_id)):
        raise HTTPException(404, "书籍不存在")
    statement = select(Note).where(Note.book_id == book_id).options(selectinload(Note.tags)).order_by(Note.created_at.desc())
    if tag:
        statement = statement.join(Note.tags).where(Tag.id == tag)
    if q:
        pattern = f"%{q.strip()}%"
        statement = statement.where(Note.selected_text.ilike(pattern) | Note.user_note.ilike(pattern))
    return [serialize_note(note) for note in db.scalars(statement).unique().all()]


@router.put("/api/notes/{note_id}")
def update_note(note_id: uuid.UUID, payload: NoteUpdate, db: Session = Depends(get_db)):
    note = db.scalar(select(Note).where(Note.id == note_id).options(selectinload(Note.tags)))
    if not note:
        raise HTTPException(404, "笔记不存在")
    changes = payload.model_dump(exclude_unset=True, exclude={"tag_ids"})
    for field, value in changes.items():
        setattr(note, field, value)
    if payload.tag_ids is not None:
        note.tags = resolve_tags(payload.tag_ids, db)
    db.commit(); db.refresh(note)
    return serialize_note(note)


@router.delete("/api/notes/{note_id}", status_code=204)
def delete_note(note_id: uuid.UUID, db: Session = Depends(get_db)):
    note = db.get(Note, note_id)
    if not note:
        raise HTTPException(404, "笔记不存在")
    db.delete(note); db.commit()

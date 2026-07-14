import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload
from app.database import get_db
from app.models.book import Book
from app.models.note import Note, Tag

router = APIRouter(prefix="/api/tags", tags=["tags"])


class TagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=15)
    color: str = "#5B7C6C"


class TagUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=15)
    color: str | None = None


def serialize_tag(tag: Tag) -> dict:
    return {"id": str(tag.id), "name": tag.name, "color": tag.color, "created_at": tag.created_at}


def unique_name(name: str, db: Session, exclude_id: uuid.UUID | None = None) -> str:
    value = name.strip()
    statement = select(Tag).where(func.lower(Tag.name) == value.lower())
    if exclude_id:
        statement = statement.where(Tag.id != exclude_id)
    if db.scalar(statement):
        raise HTTPException(409, "标签名称已存在")
    return value


@router.post("", status_code=201)
def create_tag(payload: TagCreate, db: Session = Depends(get_db)):
    tag = Tag(name=unique_name(payload.name, db), color=payload.color)
    db.add(tag); db.commit(); db.refresh(tag)
    return serialize_tag(tag)


@router.get("")
def list_tags(db: Session = Depends(get_db)):
    return [serialize_tag(tag) for tag in db.scalars(select(Tag).order_by(Tag.name)).all()]


@router.put("/{tag_id}")
def update_tag(tag_id: uuid.UUID, payload: TagUpdate, db: Session = Depends(get_db)):
    tag = db.get(Tag, tag_id)
    if not tag:
        raise HTTPException(404, "标签不存在")
    if payload.name is not None:
        tag.name = unique_name(payload.name, db, tag_id)
    if payload.color is not None:
        tag.color = payload.color
    db.commit(); db.refresh(tag)
    return serialize_tag(tag)


@router.delete("/{tag_id}", status_code=204)
def delete_tag(tag_id: uuid.UUID, db: Session = Depends(get_db)):
    tag = db.get(Tag, tag_id)
    if not tag:
        raise HTTPException(404, "标签不存在")
    db.delete(tag); db.commit()


@router.put("/{tag_id}/books/{book_id}")
def attach_book_tag(tag_id: uuid.UUID, book_id: uuid.UUID, db: Session = Depends(get_db)):
    tag = db.get(Tag, tag_id); book = db.scalar(select(Book).where(Book.id == book_id).options(selectinload(Book.tags)))
    if not tag or not book:
        raise HTTPException(404, "书籍或标签不存在")
    if tag not in book.tags:
        if len(book.tags) >= 5:
            raise HTTPException(400, "每本书最多绑定 5 个标签")
        book.tags.append(tag); db.commit()
    return {"ok": True}


@router.delete("/{tag_id}/books/{book_id}", status_code=204)
def detach_book_tag(tag_id: uuid.UUID, book_id: uuid.UUID, db: Session = Depends(get_db)):
    book = db.scalar(select(Book).where(Book.id == book_id).options(selectinload(Book.tags)))
    if not book:
        raise HTTPException(404, "书籍不存在")
    book.tags = [tag for tag in book.tags if tag.id != tag_id]
    db.commit()

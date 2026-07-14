import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.book import AskMessage, AskThread, Book, Chapter, RagIndex
from app.services.rag_service import MAX_RAG_CHARACTERS, build_rag_index, estimate_seconds, fingerprint
from app.services.ask_service import answer_thread
from app.config import settings
from app.services.model_settings_service import resolve_model_config
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/books", tags=["rag"])


def serialize(index: RagIndex | None) -> dict:
    if not index:
        return {"status": "unfed", "chunk_count": 0, "estimated_seconds": 0, "total_characters": 0, "max_characters": MAX_RAG_CHARACTERS, "error_message": None}
    return {
        "status": index.status,
        "chunk_count": index.chunk_count,
        "estimated_seconds": index.estimated_seconds,
        "total_characters": index.total_characters,
        "max_characters": MAX_RAG_CHARACTERS,
        "error_message": index.error_message,
        "started_at": index.started_at.isoformat() if index.started_at else None,
        "completed_at": index.completed_at.isoformat() if index.completed_at else None,
    }


@router.get("/{book_id}/rag")
def rag_status(book_id: uuid.UUID, db: Session = Depends(get_db)):
    if not db.scalar(select(Book.id).where(Book.id == book_id)):
        raise HTTPException(404, "书籍不存在")
    return serialize(db.scalar(select(RagIndex).where(RagIndex.book_id == book_id)))


@router.post("/{book_id}/rag/ingest", status_code=202)
def ingest_book(book_id: uuid.UUID, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    book = db.scalar(select(Book).where(Book.id == book_id))
    if not book:
        raise HTTPException(404, "书籍不存在")
    chapters = db.scalars(select(Chapter).where(Chapter.book_id == book_id).order_by(Chapter.index)).all()
    if not chapters:
        raise HTTPException(422, "本书没有可投喂的正文")
    total_characters = sum(len(chapter.plain_text.strip()) for chapter in chapters)
    if total_characters > MAX_RAG_CHARACTERS:
        index = db.scalar(select(RagIndex).where(RagIndex.book_id == book_id))
        if not index:
            index = RagIndex(book_id=book_id)
            db.add(index)
        index.status = "too_large"
        index.chunk_count = 0
        index.total_characters = total_characters
        index.estimated_seconds = 0
        index.error_message = f"本书正文约 {total_characters:,} 字，超过全书索引上限 {MAX_RAG_CHARACTERS:,} 字"
        db.commit(); db.refresh(index)
        return serialize(index)
    content_hash = fingerprint(chapters)
    index = db.scalar(select(RagIndex).where(RagIndex.book_id == book_id))
    if index and index.status == "digested" and index.content_hash == content_hash:
        return serialize(index)
    if index and index.status in {"feeding", "digesting"}:
        return serialize(index)
    if not index:
        index = RagIndex(book_id=book_id)
        db.add(index)
    index.status = "feeding"
    index.content_hash = content_hash
    index.chunk_count = 0
    index.error_message = None
    index.started_at = datetime.now(timezone.utc)
    index.completed_at = None
    index.estimated_seconds = estimate_seconds(sum(len(chapter.plain_text) for chapter in chapters))
    index.total_characters = total_characters
    db.commit(); db.refresh(index)
    background_tasks.add_task(build_rag_index, book_id)
    return serialize(index)


class AskPayload(BaseModel):
    question: str = Field(min_length=1, max_length=settings.ai_max_question_characters)
    chapter_id: uuid.UUID | None = None
    selected_text: str | None = Field(default=None, max_length=settings.ai_max_selected_characters)
    scope: str = Field(default="selection", pattern="^(selection|book)$")
    thread_id: uuid.UUID | None = None


def serialize_thread(thread: AskThread) -> dict:
    return {
        "id": str(thread.id), "book_id": str(thread.book_id), "chapter_id": str(thread.chapter_id) if thread.chapter_id else None,
        "selected_text": thread.selected_text, "scope": thread.scope, "status": thread.status,
        "created_at": thread.created_at.isoformat() if thread.created_at else None,
        "updated_at": thread.updated_at.isoformat() if thread.updated_at else None,
        "messages": [{"id": str(message.id), "role": message.role, "content": message.content, "created_at": message.created_at.isoformat() if message.created_at else None} for message in thread.messages],
    }


@router.get("/{book_id}/questions")
def list_questions(book_id: uuid.UUID, db: Session = Depends(get_db)):
    if not db.scalar(select(Book.id).where(Book.id == book_id)):
        raise HTTPException(404, "书籍不存在")
    threads = db.scalars(select(AskThread).where(AskThread.book_id == book_id).order_by(AskThread.updated_at.desc())).unique().all()
    return [serialize_thread(thread) for thread in threads]


@router.post("/{book_id}/questions", status_code=201)
def ask_book(book_id: uuid.UUID, payload: AskPayload, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    if not db.scalar(select(Book.id).where(Book.id == book_id)):
        raise HTTPException(404, "书籍不存在")
    if payload.scope == "book":
        index = db.scalar(select(RagIndex).where(RagIndex.book_id == book_id))
        if not index or index.status != "digested":
            raise HTTPException(409, "请先完成全书投喂，才能基于整本书追问")
    thread = db.scalar(select(AskThread).where(AskThread.id == payload.thread_id, AskThread.book_id == book_id)) if payload.thread_id else None
    if thread:
        if thread.status == "answering":
            raise HTTPException(409, "请等待上一轮回答完成后再追问")
        asked_count = len([message for message in thread.messages if message.role == "user"])
        if asked_count >= settings.ai_max_turns_per_thread:
            raise HTTPException(409, f"单个问答最多 {settings.ai_max_turns_per_thread} 轮，请新建问题")
    if not thread:
        thread = AskThread(book_id=book_id, chapter_id=payload.chapter_id, selected_text=payload.selected_text, scope=payload.scope, status="waiting_for_model")
        db.add(thread); db.flush()
    db.add(AskMessage(thread_id=thread.id, role="user", content=payload.question.strip()))
    api_key, _, _, _ = resolve_model_config(db)
    thread.status = "answering" if api_key else "waiting_for_model"
    db.commit(); db.refresh(thread)
    if api_key:
        background_tasks.add_task(answer_thread, thread.id)
    return serialize_thread(thread)

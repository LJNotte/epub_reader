import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.book import Chapter, ReadingProgress
from app.services.tts_service import cached_audio, resolve_provider, split_for_tts

router = APIRouter(prefix="/api/books", tags=["tts"])


class TtsRequest(BaseModel):
    chapter_id: uuid.UUID
    rate: str = Field(default="+0%", pattern=r"^[+-]\d+%$")


class TtsProgressPayload(BaseModel):
    tts_chapter_id: uuid.UUID | None = None
    tts_paragraph_index: int = Field(default=0, ge=0)
    tts_char_offset: int = Field(default=0, ge=0)
    tts_speed: float = Field(default=1.0, ge=0.5, le=2.0)


@router.post("/{book_id}/tts")
async def chapter_tts(book_id: uuid.UUID, payload: TtsRequest, db: Session = Depends(get_db)):
    chapter = db.scalar(select(Chapter).where(Chapter.id == payload.chapter_id, Chapter.book_id == book_id))
    if not chapter:
        raise HTTPException(404, "章节不存在")
    chunks = split_for_tts(chapter.plain_text)
    if not chunks:
        raise HTTPException(422, "本章节没有可朗读的文字")
    try:
        provider = resolve_provider(settings.tts_provider)
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from error
    urls = []
    for index, text in enumerate(chunks):
        try:
            path = await cached_audio(settings.tts_cache_dir, provider, str(chapter.id), index, text, payload.rate)
        except Exception as error:
            raise HTTPException(503, f"{provider.name} 朗读服务暂不可用，请稍后重试") from error
        urls.append({"index": index, "text": text, "audio_url": f"/tts/{path.name}"})
    return {"chapter_id": str(chapter.id), "provider": provider.name, "segments": urls}


@router.put("/{book_id}/tts-progress")
def save_tts_progress(book_id: uuid.UUID, payload: TtsProgressPayload, db: Session = Depends(get_db)):
    progress = db.scalar(select(ReadingProgress).where(ReadingProgress.book_id == book_id))
    if not progress:
        raise HTTPException(404, "书籍不存在")
    for field, value in payload.model_dump().items():
        setattr(progress, field, value)
    db.commit(); db.refresh(progress)
    return {"tts_chapter_id": str(progress.tts_chapter_id) if progress.tts_chapter_id else None, "tts_paragraph_index": progress.tts_paragraph_index, "tts_char_offset": progress.tts_char_offset, "tts_speed": progress.tts_speed}

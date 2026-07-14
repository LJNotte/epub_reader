from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from app.config import settings
from app.database import Base, engine
from app import models  # noqa: F401 - registers tables
from app.routers.books import router as books_router
from app.routers.notes import router as notes_router
from app.routers.tags import router as tags_router
from app.routers.tts import router as tts_router
from app.routers.rag import router as rag_router
from app.routers.settings import router as settings_router

app = FastAPI(title="笃笃 API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=settings.allowed_origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.include_router(books_router)
app.include_router(notes_router)
app.include_router(tags_router)
app.include_router(tts_router)
app.include_router(rag_router)
app.include_router(settings_router)
settings.upload_dir.mkdir(parents=True, exist_ok=True)
settings.tts_cache_dir.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=settings.upload_dir), name="media")
app.mount("/tts", StaticFiles(directory=settings.tts_cache_dir), name="tts")

@app.on_event("startup")
def create_tables() -> None:
    Base.metadata.create_all(bind=engine)
    # MVP starts without Alembic; keep local databases forward-compatible.
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE books ADD COLUMN IF NOT EXISTS original_filename VARCHAR(500)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_books_original_filename ON books (original_filename)"))
        connection.execute(text("ALTER TABLE chapters ADD COLUMN IF NOT EXISTS chapter_group VARCHAR(20) DEFAULT 'else'"))
        connection.execute(text("ALTER TABLE books ADD COLUMN IF NOT EXISTS total_characters INTEGER DEFAULT 0"))
        connection.execute(text("ALTER TABLE rag_indexes ADD COLUMN IF NOT EXISTS total_characters INTEGER DEFAULT 0"))

@app.get("/health")
def health() -> dict:
    return {"status": "ok"}

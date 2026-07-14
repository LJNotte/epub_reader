import uuid
from datetime import datetime
from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Book(Base):
    __tablename__ = "books"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    title: Mapped[str] = mapped_column(String(500))
    author: Mapped[str | None] = mapped_column(String(500), nullable=True)
    cover_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    isbn: Mapped[str | None] = mapped_column(String(20), nullable=True)
    total_chapters: Mapped[int] = mapped_column(Integer, default=0)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0)
    total_characters: Mapped[int] = mapped_column(Integer, default=0)
    original_filename: Mapped[str | None] = mapped_column(String(500), nullable=True, index=True)
    file_path: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    chapters: Mapped[list["Chapter"]] = relationship(back_populates="book", cascade="all, delete-orphan", order_by="Chapter.index")
    progress: Mapped["ReadingProgress | None"] = relationship(back_populates="book", cascade="all, delete-orphan", uselist=False)
    tags: Mapped[list["Tag"]] = relationship(secondary="book_tags", back_populates="books")
    ask_threads: Mapped[list["AskThread"]] = relationship(back_populates="book", cascade="all, delete-orphan", order_by="AskThread.updated_at.desc()")


class Chapter(Base):
    __tablename__ = "chapters"
    __table_args__ = (UniqueConstraint("book_id", "index", name="uq_chapters_book_index"),)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    book_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("books.id", ondelete="CASCADE"))
    index: Mapped[int] = mapped_column(Integer)
    title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    raw_html: Mapped[str] = mapped_column(Text)
    plain_text: Mapped[str] = mapped_column(Text)
    chapter_group: Mapped[str] = mapped_column(String(20), default="else")
    token_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    book: Mapped[Book] = relationship(back_populates="chapters")


class ReadingProgress(Base):
    __tablename__ = "reading_progress"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    book_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("books.id", ondelete="CASCADE"), unique=True)
    current_chapter_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    scroll_position: Mapped[int] = mapped_column(Integer, default=0)
    tts_chapter_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    tts_paragraph_index: Mapped[int] = mapped_column(Integer, default=0)
    tts_char_offset: Mapped[int] = mapped_column(Integer, default=0)
    tts_speed: Mapped[float] = mapped_column(Float, default=1.0)
    last_read_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    book: Mapped[Book] = relationship(back_populates="progress")


class RagIndex(Base):
    __tablename__ = "rag_indexes"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    book_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("books.id", ondelete="CASCADE"), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(20), default="unfed")
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    estimated_seconds: Mapped[int] = mapped_column(Integer, default=0)
    total_characters: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    chunks: Mapped[list["RagChunk"]] = relationship(back_populates="rag_index", cascade="all, delete-orphan", order_by="RagChunk.index")


class RagChunk(Base):
    __tablename__ = "rag_chunks"
    __table_args__ = (UniqueConstraint("rag_index_id", "index", name="uq_rag_chunks_index"),)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rag_index_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("rag_indexes.id", ondelete="CASCADE"), index=True)
    chapter_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("chapters.id", ondelete="CASCADE"), index=True)
    index: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)
    start_offset: Mapped[int] = mapped_column(Integer, default=0)
    end_offset: Mapped[int] = mapped_column(Integer, default=0)
    rag_index: Mapped[RagIndex] = relationship(back_populates="chunks")


class AskThread(Base):
    __tablename__ = "ask_threads"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    book_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("books.id", ondelete="CASCADE"), index=True)
    chapter_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    selected_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    scope: Mapped[str] = mapped_column(String(20), default="selection")
    status: Mapped[str] = mapped_column(String(30), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    book: Mapped[Book] = relationship(back_populates="ask_threads")
    messages: Mapped[list["AskMessage"]] = relationship(back_populates="thread", cascade="all, delete-orphan", order_by="AskMessage.created_at")


class AskMessage(Base):
    __tablename__ = "ask_messages"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    thread_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("ask_threads.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(20))
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    thread: Mapped[AskThread] = relationship(back_populates="messages")


class ModelProviderSetting(Base):
    """Singleton local model configuration; API secrets are encrypted, never serialized."""
    __tablename__ = "model_provider_settings"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    provider: Mapped[str] = mapped_column(String(40), default="deepseek")
    api_key_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    base_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

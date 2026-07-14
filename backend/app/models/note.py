import uuid
from datetime import datetime
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Table, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

book_tags = Table("book_tags", Base.metadata, Column("book_id", UUID(as_uuid=True), ForeignKey("books.id", ondelete="CASCADE"), primary_key=True), Column("tag_id", UUID(as_uuid=True), ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True))
note_tags = Table("note_tags", Base.metadata, Column("note_id", UUID(as_uuid=True), ForeignKey("notes.id", ondelete="CASCADE"), primary_key=True), Column("tag_id", UUID(as_uuid=True), ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True))


class Tag(Base):
    __tablename__ = "tags"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    color: Mapped[str] = mapped_column(String(20), default="#6366F1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    books: Mapped[list["Book"]] = relationship(secondary=book_tags, back_populates="tags")
    notes: Mapped[list["Note"]] = relationship(secondary=note_tags, back_populates="tags")


class Note(Base):
    __tablename__ = "notes"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    book_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("books.id", ondelete="CASCADE"))
    chapter_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("chapters.id", ondelete="CASCADE"))
    chunk_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    selected_text: Mapped[str] = mapped_column(Text)
    start_offset: Mapped[int] = mapped_column(Integer)
    end_offset: Mapped[int] = mapped_column(Integer)
    user_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    color: Mapped[str] = mapped_column(String(20), default="#FFEB3B")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    tags: Mapped[list[Tag]] = relationship(secondary=note_tags, back_populates="notes")

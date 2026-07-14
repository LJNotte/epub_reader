import re
import uuid

import httpx
from sqlalchemy import select

from app.config import settings
from app.database import SessionLocal
from app.models.book import AskMessage, AskThread, Chapter, RagChunk, RagIndex
from app.services.model_settings_service import resolve_model_config


def _clean_answer(value: str) -> str:
    """Keep normal Chinese prose and limited Markdown, removing emoji-like decoration."""
    return re.sub(r"[\U0001F000-\U0001FAFF\U00002700-\U000027BF\U0000FE0F]", "", value).strip()


def _terms(value: str) -> set[str]:
    normalized = re.sub(r"\s+", "", value.lower())
    # Chinese has no word boundary: use overlapping bigrams plus meaningful latin words.
    grams = {normalized[index:index + 2] for index in range(max(0, len(normalized) - 1))}
    grams.update(re.findall(r"[a-z0-9_]{2,}", value.lower()))
    return {item for item in grams if item.strip()}


def retrieve_context(db, book_id: uuid.UUID, question: str, selected_text: str | None, limit: int | None = None) -> list[tuple[RagChunk, Chapter]]:
    index = db.scalar(select(RagIndex).where(RagIndex.book_id == book_id, RagIndex.status == "digested"))
    if not index:
        return []
    terms = _terms(f"{question} {selected_text or ''}")
    rows = db.execute(select(RagChunk, Chapter).join(Chapter, Chapter.id == RagChunk.chapter_id).where(RagChunk.rag_index_id == index.id)).all()
    ranked = []
    for chunk, chapter in rows:
        text = chunk.text.lower()
        score = sum(text.count(term) for term in terms)
        if selected_text and selected_text[:80] in chunk.text:
            score += 8
        if score:
            ranked.append((score, chunk, chapter))
    ranked.sort(key=lambda item: (-item[0], item[1].index))
    return [(chunk, chapter) for _, chunk, chapter in ranked[:limit or settings.ai_context_chunk_limit]]


def _bounded_context(rows: list[tuple[RagChunk, Chapter]]) -> str:
    """Build a bounded, chapter-labelled context without exceeding the request budget."""
    remaining = settings.ai_max_context_characters
    parts: list[str] = []
    for chunk, chapter in rows:
        if remaining <= 0:
            break
        chapter_title = (chapter.title or f"第 {chapter.index + 1} 章").strip()
        prefix = f"[书中章节：《{chapter_title}》] "
        available = max(0, remaining - len(prefix))
        if not available:
            break
        text = chunk.text[:available]
        parts.append(f"{prefix}{text}")
        remaining -= len(prefix) + len(text)
    return "\n\n".join(parts)


def answer_thread(thread_id: uuid.UUID) -> None:
    """Call an explicitly configured model and persist one assistant response.

    No network request is made unless the user has supplied DEEPSEEK_API_KEY.
    """
    db = SessionLocal()
    try:
        thread = db.scalar(select(AskThread).where(AskThread.id == thread_id))
        if not thread:
            return
        question = db.scalar(select(AskMessage.content).where(AskMessage.thread_id == thread.id, AskMessage.role == "user").order_by(AskMessage.created_at.desc()))
        if not question:
            return
        context_rows = retrieve_context(db, thread.book_id, question, thread.selected_text)
        context = _bounded_context(context_rows)
        selected = thread.selected_text or "（未提供选文）"
        history = db.scalars(select(AskMessage).where(AskMessage.thread_id == thread.id).order_by(AskMessage.created_at)).all()
        conversation = "\n".join(f"{'读者' if message.role == 'user' else '助手'}：{message.content}" for message in history[:-1]) or "（这是第一轮问题）"
        prompt = f"""你是 EPUB 阅读助手。请用中文回答，并严格采用两部分结构：
一、书中依据：先基于用户选文与书中检索片段解释；引用时使用书中真实章节名，例如《判断力》指出……，不要说“第 N 章讲了什么”。若书中无依据，要明确说明。
二、AI 延伸回答：在不改变书中原意的前提下，基于你的通用知识和推理，补充背景、例子、反例或可执行的理解方式；明确这是 AI 的延伸，不要伪造成书中原文、实时网页结论或外部引用。
不要编造书中来源，保持简洁、具体、可读。可以使用少量 Markdown 标题、列表、加粗帮助阅读；不要使用表情、颜文字、装饰性符号、分隔线、引用块、代码块或无意义的特殊字符。只使用正常中文文字和必要标点。

此前对话：
{conversation}

用户选文：
{selected}

书中检索片段：
{context or '没有命中片段'}

问题：{question}
"""
        api_key, base_url, model, _ = resolve_model_config(db)
        if not api_key:
            thread.status = "waiting_for_model"
            db.commit()
            return
        response = httpx.post(
            f"{base_url.rstrip('/')}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.25,
                "max_tokens": settings.deepseek_max_output_tokens,
            },
            timeout=45,
        )
        response.raise_for_status()
        answer = _clean_answer(response.json()["choices"][0]["message"]["content"])
        db.add(AskMessage(thread_id=thread.id, role="assistant", content=answer))
        thread.status = "answered"
        db.commit()
    except Exception:
        db.rollback()
        thread = db.scalar(select(AskThread).where(AskThread.id == thread_id))
        if thread:
            thread.status = "failed"
            db.add(AskMessage(thread_id=thread.id, role="assistant", content="模型暂时无法完成回答，请稍后重试。"))
            db.commit()
    finally:
        db.close()

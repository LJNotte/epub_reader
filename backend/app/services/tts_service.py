import hashlib
import re
from pathlib import Path
from typing import Protocol

import edge_tts


class TtsProvider(Protocol):
    name: str

    async def synthesize(self, text: str, rate: str, target: Path) -> None: ...


class EdgeTtsProvider:
    name = "edge"

    async def synthesize(self, text: str, rate: str, target: Path) -> None:
        await edge_tts.Communicate(text, voice="zh-CN-XiaoxiaoNeural", rate=rate).save(str(target))


class LocalTtsProvider:
    """Provider seam for Piper/Kokoro/etc.; no online text transfer when implemented."""
    name = "local"

    async def synthesize(self, text: str, rate: str, target: Path) -> None:
        raise RuntimeError("本地 TTS Provider 尚未安装模型")


def resolve_provider(name: str) -> TtsProvider:
    providers: dict[str, TtsProvider] = {"edge": EdgeTtsProvider(), "local": LocalTtsProvider()}
    if name not in providers:
        raise RuntimeError(f"未知 TTS Provider：{name}")
    return providers[name]


def split_for_tts(text: str, limit: int = 260) -> list[str]:
    """Use stored plain text only: EPUB images and markup never enter TTS."""
    normalized = re.sub(r"\s+", " ", text).strip()
    pieces = [piece.strip() for piece in re.split(r"(?<=[。！？!?；;])", normalized) if piece.strip()]
    chunks: list[str] = []; current = ""
    for piece in pieces:
        if current and len(current) + len(piece) > limit:
            chunks.append(current); current = ""
        while len(piece) > limit:
            chunks.append(piece[:limit]); piece = piece[limit:]
        current += piece
    if current: chunks.append(current)
    return chunks or ([normalized] if normalized else [])


async def cached_audio(cache_dir: Path, provider: TtsProvider, chapter_id: str, index: int, text: str, rate: str) -> Path:
    digest = hashlib.sha256(f"{provider.name}:{chapter_id}:{index}:{rate}:{text}".encode()).hexdigest()
    target = cache_dir / f"{digest}.mp3"
    if target.exists() and target.stat().st_size > 0:
        return target
    cache_dir.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(".tmp.mp3")
    await provider.synthesize(text, rate, temporary)
    temporary.replace(target)
    return target

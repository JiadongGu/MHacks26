"""Spoken morning briefing. Turns today's `briefings.text` into mp3 with ElevenLabs.

Cache: a process-local dict and a file under the temp dir, both keyed by (user, day, sha1(text)).
No Neon column is added. `briefings.audio_url` is set to `/voice/briefing` once audio exists.
"""

import asyncio
import hashlib
import logging
import tempfile
import time
from datetime import date
from pathlib import Path
from typing import Any
from uuid import UUID

import httpx

from app.agents import compass
from app.core import db
from app.core.config import settings
from app.twin.tz import DEFAULT_TIMEZONE, local_now
from app.voice.speech import speakable

log = logging.getLogger("pulse.voice")

DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"
MODEL_ID = "eleven_flash_v2_5"
OUTPUT_FORMAT = "mp3_44100_64"
API_BASE = "https://api.elevenlabs.io"
TTS_TIMEOUT_S = 20.0
AUDIO_URL = "/voice/briefing"

CacheKey = tuple[UUID, date, str]

_memory: dict[CacheKey, bytes] = {}
_locks: dict[CacheKey, asyncio.Lock] = {}


class ElevenLabsError(Exception):
    """Text-to-speech failed. The router answers 503."""


def cache_dir() -> Path:
    return Path(tempfile.gettempdir()) / "pulse-briefings"


def text_digest(text: str) -> str:
    return hashlib.sha1(text.encode()).hexdigest()


def cache_key(user_id: UUID, day: date, text: str) -> CacheKey:
    return (user_id, day, text_digest(text))


def cache_path(key: CacheKey) -> Path:
    user_id, day, digest = key
    return cache_dir() / f"{user_id}-{day.isoformat()}-{digest}.mp3"


def clear_memory_cache() -> None:
    _memory.clear()
    _locks.clear()


# ------------------------------------------------------------------ data access (patched in tests)


async def load_briefing(user_id: UUID, day: date) -> dict[str, Any] | None:
    async with db.neon() as conn:
        cur = await conn.execute(
            "select text, audio_url from briefings where user_id = %s and day = %s", (user_id, day))
        return await cur.fetchone()


async def mark_audio(user_id: UUID, day: date, text: str) -> None:
    """Set audio_url only while the stored text is the text we voiced."""
    async with db.neon() as conn:
        await conn.execute(
            "update briefings set audio_url = %s where user_id = %s and day = %s and text = %s",
            (AUDIO_URL, user_id, day, text))


async def user_today(user_id: UUID) -> date:
    tz = (await compass.load_profile(user_id)).get("timezone") or DEFAULT_TIMEZONE
    return local_now(tz).date()


# ------------------------------------------------------------------ cache


def _read_file(path: Path) -> bytes | None:
    try:
        data = path.read_bytes()
    except OSError:
        return None
    return data or None


def _write_file(path: Path, data: bytes) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_bytes(data)
        tmp.replace(path)
    except OSError as exc:
        log.warning("voice.disk_write_failed err=%s", type(exc).__name__)


async def cached_audio(key: CacheKey) -> bytes | None:
    hit = _memory.get(key)
    if hit is not None:
        return hit
    data = await asyncio.to_thread(_read_file, cache_path(key))
    if data is not None:
        _memory[key] = data
    return data


async def store_audio(key: CacheKey, data: bytes) -> None:
    _memory[key] = data
    await asyncio.to_thread(_write_file, cache_path(key), data)


# ------------------------------------------------------------------ ElevenLabs


async def synthesize(text: str) -> bytes:
    s = settings()
    if not s.elevenlabs_api_key:
        raise ElevenLabsError("ELEVENLABS_API_KEY is not set")
    voice = s.elevenlabs_voice_id or DEFAULT_VOICE_ID
    url = f"{API_BASE}/v1/text-to-speech/{voice}"
    try:
        async with httpx.AsyncClient(timeout=TTS_TIMEOUT_S) as client:
            res = await client.post(
                url, params={"output_format": OUTPUT_FORMAT},
                headers={"xi-api-key": s.elevenlabs_api_key},
                json={"text": speakable(text), "model_id": MODEL_ID})
    except httpx.HTTPError as exc:
        raise ElevenLabsError(f"request failed ({type(exc).__name__})") from exc
    if res.status_code != 200 or not res.content:
        raise ElevenLabsError(f"status {res.status_code}")
    return res.content


# ------------------------------------------------------------------ public


async def todays_briefing(user_id: UUID, day: date | None = None,
                          generate: bool = True) -> tuple[date, dict[str, Any]] | None:
    """The briefing row for the user's local day. Runs the briefing job once if the row is missing."""
    day = day or await user_today(user_id)
    row = await load_briefing(user_id, day)
    if row is None and generate:
        await compass.run_briefing(user_id, force=True)
        row = await load_briefing(user_id, day)
    return (day, row) if row else None


async def briefing_audio(user_id: UUID, day: date | None = None) -> bytes | None:
    """mp3 bytes of the briefing, or None when no briefing can be made. Raises ElevenLabsError."""
    started = time.monotonic()
    found = await todays_briefing(user_id, day)
    if found is None:
        log.info("voice.no_briefing user=%s", user_id)
        return None
    day, row = found
    text = row["text"]
    key = cache_key(user_id, day, text)
    audio = await cached_audio(key)
    source = "cache"
    if audio is None:
        async with _locks.setdefault(key, asyncio.Lock()):
            audio = await cached_audio(key)
            if audio is None:
                source = "elevenlabs"
                try:
                    audio = await synthesize(text)
                except ElevenLabsError as exc:
                    log.warning("voice.tts_failed user=%s err=%s", user_id, exc)
                    raise
                await store_audio(key, audio)
    if row.get("audio_url") != AUDIO_URL:
        try:
            await mark_audio(user_id, day, text)
        except Exception as exc:
            log.warning("voice.mark_audio_failed user=%s err=%s", user_id, type(exc).__name__)
    log.info("voice.briefing user=%s source=%s bytes=%d ms=%d", user_id, source, len(audio),
             (time.monotonic() - started) * 1000)
    return audio

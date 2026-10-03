from datetime import date
from uuid import UUID

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.agents import compass
from app.core.config import settings
from app.main import app
from app.voice import service

USER = UUID("00000000-0000-0000-0000-000000000002")
DAY = date(2026, 10, 3)
HEADERS = {"X-Internal-Token": "dev-internal-token"}
MP3 = b"ID3" + b"\x00" * 64
TTS_URL = f"https://api.elevenlabs.io/v1/text-to-speech/{service.DEFAULT_VOICE_ID}"


@pytest.fixture(autouse=True)
def _env(monkeypatch, tmp_path):
    monkeypatch.setenv("ELEVENLABS_API_KEY", "test-key")
    monkeypatch.setenv("ELEVENLABS_VOICE_ID", "")
    settings.cache_clear()
    service.clear_memory_cache()
    monkeypatch.setattr(service, "cache_dir", lambda: tmp_path / "pulse-briefings")
    yield
    settings.cache_clear()
    service.clear_memory_cache()


@pytest.fixture
def store(monkeypatch):
    """In-memory briefings table. `rows` maps (user, day) to a row dict."""
    rows: dict[tuple[UUID, date], dict] = {}
    runs: list[tuple[UUID, bool]] = []

    async def user_today(user_id):
        return DAY

    async def load_briefing(user_id, day):
        return rows.get((user_id, day))

    async def mark_audio(user_id, day, text):
        row = rows.get((user_id, day))
        if row and row["text"] == text:
            row["audio_url"] = service.AUDIO_URL

    async def run_briefing(user_id, force=False):
        runs.append((user_id, force))
        rows[(user_id, DAY)] = {"text": "Good morning. You slept 8 h.", "audio_url": None}
        return True

    monkeypatch.setattr(service, "user_today", user_today)
    monkeypatch.setattr(service, "load_briefing", load_briefing)
    monkeypatch.setattr(service, "mark_audio", mark_audio)
    monkeypatch.setattr(compass, "run_briefing", run_briefing)
    return rows, runs


@respx.mock
async def test_success_sends_expected_request_and_caches(store):
    rows, _ = store
    rows[(USER, DAY)] = {"text": "Hello there.", "audio_url": None}
    route = respx.post(TTS_URL).mock(return_value=httpx.Response(200, content=MP3))
    audio = await service.briefing_audio(USER)
    assert audio == MP3
    req = route.calls.last.request
    assert req.headers["xi-api-key"] == "test-key"
    assert req.url.params["output_format"] == "mp3_44100_64"
    assert req.read() == b'{"text":"Hello there.","model_id":"eleven_flash_v2_5"}'
    assert rows[(USER, DAY)]["audio_url"] == "/voice/briefing"


@respx.mock
async def test_cache_hit_does_not_call_twice(store):
    rows, _ = store
    rows[(USER, DAY)] = {"text": "Hello there.", "audio_url": None}
    route = respx.post(TTS_URL).mock(return_value=httpx.Response(200, content=MP3))
    assert await service.briefing_audio(USER) == MP3
    assert await service.briefing_audio(USER) == MP3
    assert route.call_count == 1


@respx.mock
async def test_disk_cache_survives_memory_clear(store):
    rows, _ = store
    rows[(USER, DAY)] = {"text": "Hello there.", "audio_url": None}
    route = respx.post(TTS_URL).mock(return_value=httpx.Response(200, content=MP3))
    await service.briefing_audio(USER)
    service.clear_memory_cache()
    assert await service.briefing_audio(USER) == MP3
    assert route.call_count == 1


@respx.mock
async def test_changed_text_makes_new_audio(store):
    rows, _ = store
    rows[(USER, DAY)] = {"text": "First.", "audio_url": None}
    route = respx.post(TTS_URL).mock(return_value=httpx.Response(200, content=MP3))
    await service.briefing_audio(USER)
    rows[(USER, DAY)] = {"text": "Second.", "audio_url": None}
    await service.briefing_audio(USER)
    assert route.call_count == 2


@respx.mock
async def test_missing_briefing_runs_job_once(store):
    _, runs = store
    respx.post(TTS_URL).mock(return_value=httpx.Response(200, content=MP3))
    assert await service.briefing_audio(USER) == MP3
    assert runs == [(USER, True)]


async def test_no_briefing_after_job_gives_none(store, monkeypatch):
    async def run_briefing(user_id, force=False):
        return False

    monkeypatch.setattr(compass, "run_briefing", run_briefing)
    assert await service.briefing_audio(USER) is None


@respx.mock
@pytest.mark.parametrize("status", [401, 500])
async def test_upstream_error_raises(store, status):
    rows, _ = store
    rows[(USER, DAY)] = {"text": "Hello there.", "audio_url": None}
    respx.post(TTS_URL).mock(return_value=httpx.Response(status, json={"detail": "x"}))
    with pytest.raises(service.ElevenLabsError):
        await service.briefing_audio(USER)
    assert rows[(USER, DAY)]["audio_url"] is None


@respx.mock
async def test_timeout_raises(store):
    rows, _ = store
    rows[(USER, DAY)] = {"text": "Hello there.", "audio_url": None}
    respx.post(TTS_URL).mock(side_effect=httpx.ConnectTimeout("slow"))
    with pytest.raises(service.ElevenLabsError):
        await service.briefing_audio(USER)


@respx.mock
async def test_voice_id_from_env(store, monkeypatch):
    rows, _ = store
    rows[(USER, DAY)] = {"text": "Hello there.", "audio_url": None}
    monkeypatch.setenv("ELEVENLABS_VOICE_ID", "custom")
    settings.cache_clear()
    route = respx.post("https://api.elevenlabs.io/v1/text-to-speech/custom").mock(
        return_value=httpx.Response(200, content=MP3))
    await service.briefing_audio(USER)
    assert route.call_count == 1


# ------------------------------------------------------------------ router


@respx.mock
def test_router_audio_ok(store):
    rows, _ = store
    rows[(USER, DAY)] = {"text": "Hello there.", "audio_url": None}
    respx.post(TTS_URL).mock(return_value=httpx.Response(200, content=MP3))
    res = TestClient(app).get(f"/voice/briefing?user_id={USER}", headers=HEADERS)
    assert res.status_code == 200
    assert res.headers["content-type"] == "audio/mpeg"
    assert res.content == MP3


@respx.mock
@pytest.mark.parametrize("status", [401, 500])
def test_router_upstream_error_is_503(store, status):
    rows, _ = store
    rows[(USER, DAY)] = {"text": "Hello there.", "audio_url": None}
    respx.post(TTS_URL).mock(return_value=httpx.Response(status))
    res = TestClient(app).get(f"/voice/briefing?user_id={USER}", headers=HEADERS)
    assert res.status_code == 503


def test_router_no_briefing_is_404(store, monkeypatch):
    async def run_briefing(user_id, force=False):
        return False

    monkeypatch.setattr(compass, "run_briefing", run_briefing)
    res = TestClient(app).get(f"/voice/briefing?user_id={USER}", headers=HEADERS)
    assert res.status_code == 404


def test_router_requires_internal_token(store):
    assert TestClient(app).get(f"/voice/briefing?user_id={USER}").status_code == 401
    assert TestClient(app).get(f"/voice/briefing/text?user_id={USER}").status_code == 401


def test_router_text(store):
    rows, runs = store
    client = TestClient(app)
    assert client.get(f"/voice/briefing/text?user_id={USER}", headers=HEADERS).status_code == 404
    assert runs == []
    rows[(USER, DAY)] = {"text": "Hello there.", "audio_url": None}
    res = client.get(f"/voice/briefing/text?user_id={USER}", headers=HEADERS)
    assert res.json() == {"day": "2026-10-03", "text": "Hello there.", "has_audio": False}
    rows[(USER, DAY)]["audio_url"] = "/voice/briefing"
    assert client.get(f"/voice/briefing/text?user_id={USER}", headers=HEADERS).json()["has_audio"] is True

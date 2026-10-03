import pytest

from app.core import spacetime
from app.core.config import settings


@pytest.fixture
def owner_token(monkeypatch):
    """Pin the setting so a developer's local .env (SPACETIME_ADMIN_VIEWS=1) cannot change these tests."""
    monkeypatch.setenv("SPACETIME_ADMIN_VIEWS", "0")
    settings.cache_clear()
    yield
    settings.cache_clear()


@pytest.fixture
def admin_views(monkeypatch):
    monkeypatch.setenv("SPACETIME_ADMIN_VIEWS", "1")
    settings.cache_clear()
    spacetime._watched.clear()
    yield
    settings.cache_clear()
    spacetime._watched.clear()


def test_table_names_are_unchanged_for_the_owner_token(owner_token):
    assert spacetime.table("minute_agg") == "minute_agg"
    assert spacetime.table("sample") == "sample"


def test_table_names_switch_to_admin_views(admin_views):
    assert spacetime.table("minute_agg") == "admin_minute_agg"
    assert spacetime.table("sample") == "admin_sample"


async def test_ensure_watching_is_a_noop_with_the_owner_token(owner_token, monkeypatch):
    calls = []

    async def fake_call(reducer, args):
        calls.append((reducer, args))

    monkeypatch.setattr(spacetime, "call", fake_call)
    await spacetime.ensure_watching("u1")
    assert calls == []


async def test_ensure_watching_registers_each_user_once(admin_views, monkeypatch):
    calls = []

    async def fake_call(reducer, args):
        calls.append((reducer, args))

    monkeypatch.setattr(spacetime, "call", fake_call)
    await spacetime.ensure_watching("u1")
    await spacetime.ensure_watching("u1")
    await spacetime.ensure_watching("u2")
    assert calls == [("watch_user", ["u1"]), ("watch_user", ["u2"])]


async def test_failed_watch_is_retried_next_time(admin_views, monkeypatch):
    attempts = []

    async def flaky(reducer, args):
        attempts.append(args)
        if len(attempts) == 1:
            raise RuntimeError("down")

    monkeypatch.setattr(spacetime, "call", flaky)
    with pytest.raises(RuntimeError):
        await spacetime.ensure_watching("u1")
    await spacetime.ensure_watching("u1")
    assert len(attempts) == 2

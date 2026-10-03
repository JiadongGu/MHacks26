from contextlib import asynccontextmanager
from datetime import date

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.auth import require_internal
from app.vitals import router as vr
from app.vitals import service

UID = "00000000-0000-0000-0000-000000000001"
T0 = 1_791_052_200_000  # 2026-10-03T18:30:00Z


def row(minute, metric="heart_rate", s=70.0, n=1, lo=None, hi=None):
    return {
        "metric": metric,
        "minute_ms": T0 + minute * 60_000,
        "sum": s,
        "n": n,
        "min": lo or s,
        "max": hi or s,
    }


def test_series_one_minute_buckets_are_oldest_first():
    out = service.series([row(2, s=72), row(0, s=70)], "heart_rate", "1m")
    assert out == [
        {"ts": "2026-10-03T18:30:00+00:00", "value": 70.0},
        {"ts": "2026-10-03T18:32:00+00:00", "value": 72.0},
    ]


def test_series_hourly_average_is_weighted_by_sample_count():
    rows = [row(0, s=700, n=10), row(1, s=80, n=1)]  # avg 70 for 10 samples, 80 for 1
    (p,) = service.series(rows, "heart_rate", "1h")
    assert p["value"] == pytest.approx(780 / 11, abs=0.01)
    assert p["ts"] == "2026-10-03T18:00:00+00:00"


def test_series_steps_are_summed_and_empty_minutes_skipped():
    rows = [row(0, "steps", s=10), row(1, "steps", s=15), row(2, "steps", s=0, n=0)]
    assert [p["value"] for p in service.series(rows, "steps", "1h")] == [25.0]


def test_latest_picks_newest_minute_per_metric():
    rows = [
        row(0, "heart_rate", s=70),
        row(5, "heart_rate", s=90),
        row(3, "spo2", s=97),
        row(9, "steps", s=12),
    ]
    out = service.latest(rows)
    assert (
        out["heart_rate"]["value"] == 90.0 and out["spo2"]["value"] == 97.0 and out["steps"]["value"] == 12.0
    )
    assert out["heart_rate"]["ts"] == "2026-10-03T18:35:00+00:00"


class Fake:
    def __init__(self, rows=None, configured=True, error=None):
        self.rows, self.on, self.error, self.queries = rows or [], configured, error, []

    def configured(self):
        return self.on

    async def sql(self, q):
        self.queries.append(q)
        if self.error:
            raise self.error
        return self.rows


@pytest.fixture
def client(monkeypatch):
    app = FastAPI()
    app.include_router(vr.router)
    app.dependency_overrides[require_internal] = lambda: None
    fake = Fake()
    monkeypatch.setattr(vr.spacetime, "configured", fake.configured)
    monkeypatch.setattr(vr.spacetime, "sql", fake.sql)
    return TestClient(app), fake


def test_series_endpoint_queries_the_window_and_formats_points(client):
    c, fake = client
    fake.rows = [row(0, s=70), row(1, s=71)]
    r = c.get(
        "/vitals/series",
        params={
            "user_id": UID,
            "metric": "heart_rate",
            "from": "2026-10-03T18:00:00Z",
            "to": "2026-10-03T19:00:00Z",
        },
    )
    assert r.status_code == 200 and [p["value"] for p in r.json()] == [70.0, 71.0]
    (q,) = fake.queries
    assert f"user_id = '{UID}'" in q and "metric = 'heart_rate'" in q
    assert f"minute_ms >= {T0 - 30 * 60_000} AND minute_ms < {T0 + 30 * 60_000}" in q


def test_series_is_empty_when_spacetime_not_configured(client):
    c, fake = client
    fake.on = False
    assert c.get("/vitals/series", params={"user_id": UID, "metric": "heart_rate"}).json() == []
    assert fake.queries == []


def test_series_rejects_bad_windows_and_metrics(client):
    c, _ = client
    base = {"user_id": UID, "metric": "heart_rate"}
    assert (
        c.get(
            "/vitals/series", params={**base, "from": "2026-10-01T00:00:00Z", "to": "2026-10-03T12:00:00Z"}
        ).status_code
        == 422
    )
    assert (
        c.get(
            "/vitals/series", params={**base, "from": "2026-10-03T12:00:00Z", "to": "2026-10-03T11:00:00Z"}
        ).status_code
        == 422
    )
    assert c.get("/vitals/series", params={"user_id": UID, "metric": "'; DROP"}).status_code == 422
    assert c.get("/vitals/series", params={**base, "bucket": "5m"}).status_code == 422


def test_series_503_when_live_pool_fails(client):
    c, fake = client
    fake.error = httpx.HTTPError("boom")
    assert c.get("/vitals/series", params={"user_id": UID, "metric": "heart_rate"}).status_code == 503


def test_latest_endpoint(client):
    c, fake = client
    fake.rows = [row(0, "heart_rate", s=70), row(2, "spo2", s=97)]
    r = c.get("/vitals/latest", params={"user_id": UID, "metrics": "heart_rate,spo2"})
    assert r.status_code == 200 and set(r.json()) == {"heart_rate", "spo2"}
    assert "(metric = 'heart_rate' OR metric = 'spo2')" in fake.queries[0]
    assert c.get("/vitals/latest", params={"user_id": UID, "metrics": "heart_rate,evil"}).status_code == 422
    assert c.get("/vitals/latest", params={"user_id": UID, "metrics": ""}).status_code == 422


def test_daily_endpoint_reads_neon(client, monkeypatch):
    c, _ = client
    seen = []

    class Cur:
        async def fetchall(self):
            return [
                {
                    "day": date(2026, 10, 3),
                    "metric": "steps",
                    "avg": 5.0,
                    "min": 0.0,
                    "max": 30.0,
                    "sum": 9000.0,
                    "n": 1800,
                }
            ]

        async def fetchone(self):
            return {"timezone": "America/Detroit"}

    @asynccontextmanager
    async def neon():
        class Conn:
            async def execute(self, sql, params=()):
                seen.append((sql, params))
                return Cur()

        yield Conn()

    monkeypatch.setattr(vr.db, "neon", neon)
    monkeypatch.setattr("app.ingest.writer.db.neon", neon)
    r = c.get("/vitals/daily", params={"user_id": UID, "days": 3})
    assert r.status_code == 200
    assert r.json()[0]["metric"] == "steps" and r.json()[0]["sum"] == 9000.0
    assert str(seen[-1][1][0]) == UID and isinstance(seen[-1][1][1], date)
    assert c.get("/vitals/daily", params={"user_id": UID, "days": 0}).status_code == 422


def test_admin_token_series_reads_the_view_after_watching(client, monkeypatch):
    from app.core import spacetime
    from app.core.config import settings

    c, fake = client
    watched = []

    async def call(reducer, args):
        watched.append((reducer, args))

    monkeypatch.setattr(vr.spacetime, "call", call)
    monkeypatch.setenv("SPACETIME_ADMIN_VIEWS", "1")
    settings.cache_clear()
    spacetime._watched.clear()
    try:
        assert c.get("/vitals/series", params={"user_id": UID, "metric": "heart_rate"}).status_code == 200
    finally:
        settings.cache_clear()
        spacetime._watched.clear()
    assert watched == [("watch_user", [UID])]
    assert "FROM admin_minute_agg" in fake.queries[0]


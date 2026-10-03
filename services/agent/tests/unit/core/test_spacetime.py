from datetime import UTC, datetime
from uuid import UUID

import httpx
import respx

from app.agents import live
from app.core import spacetime
from app.core.config import settings

U = UUID("00000000-0000-0000-0000-000000000001")


def _env(monkeypatch):
    monkeypatch.setenv("SPACETIME_HOST", "https://st.test")
    monkeypatch.setenv("SPACETIME_DB", "pulse-live")
    monkeypatch.setenv("SPACETIME_TOKEN", "tok")
    settings.cache_clear()


def _resp(rows):
    cols = ["key", "user_id", "metric", "minute_ms", "avg", "min", "max", "sum", "n"]
    return httpx.Response(
        200, json=[{"schema": {"elements": [{"name": {"some": c}} for c in cols]}, "rows": rows}]
    )


@respx.mock
async def test_sql_parses_rows_and_sends_auth(monkeypatch):
    _env(monkeypatch)
    route = respx.post("https://st.test/v1/database/pulse-live/sql").mock(
        return_value=_resp([["k", str(U), "heart_rate", 1000, 70.0, 60.0, 80.0, 140.0, 2]])
    )
    rows = await spacetime.sql("SELECT * FROM minute_agg")
    assert rows == [
        {
            "key": "k",
            "user_id": str(U),
            "metric": "heart_rate",
            "minute_ms": 1000,
            "avg": 70.0,
            "min": 60.0,
            "max": 80.0,
            "sum": 140.0,
            "n": 2,
        }
    ]
    assert route.calls[0].request.headers["authorization"] == "Bearer tok"


@respx.mock
async def test_series_uses_sum_for_steps_and_sorts(monkeypatch):
    _env(monkeypatch)
    now = datetime(2026, 10, 3, 12, tzinfo=UTC)
    m = int(now.timestamp() * 1000)
    respx.post("https://st.test/v1/database/pulse-live/sql").mock(
        side_effect=[
            _resp(
                [
                    ["a", str(U), "steps", m, 10.0, 0, 0, 40.0, 4],
                    ["b", str(U), "heart_rate", m - 60000, 72.0, 0, 0, 72.0, 1],
                ]
            ),
            _resp([]),
        ]
    )
    rows = await live._series(U, now)
    assert [(r["metric"], r["v"]) for r in rows] == [("heart_rate", 72.0), ("steps", 40.0)]

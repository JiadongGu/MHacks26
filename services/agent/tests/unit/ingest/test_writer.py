from contextlib import asynccontextmanager
from datetime import UTC, datetime
from uuid import UUID
from zoneinfo import ZoneInfo

import pytest

from app.contracts import IngestBatch, VitalsSample
from app.ingest import writer
from app.ingest.daily import day_bounds_ms

U1 = UUID("00000000-0000-0000-0000-000000000001")
U2 = UUID("00000000-0000-0000-0000-000000000002")
TS = datetime(2026, 10, 3, 18, 30, tzinfo=UTC)  # 14:30 in Detroit


class Cur:
    def __init__(self, row):
        self.row = row

    async def fetchone(self):
        return self.row


class Recorder:
    def __init__(self, minute_rows=None, spacetime_on=True):
        self.minute_rows = minute_rows or []
        self.spacetime_on = spacetime_on
        self.sql_calls, self.calls, self.hooks, self.sql_queries = [], [], [], []

    @asynccontextmanager
    async def neon(self):
        rec = self

        class Conn:
            async def execute(self, sql, params=()):
                rec.sql_calls.append((sql, params))
                return Cur({"timezone": "America/Detroit"} if "from profiles" in sql else None)

        yield Conn()

    def configured(self):
        return self.spacetime_on

    async def call(self, reducer, args):
        self.calls.append((reducer, args))

    async def sql(self, query):
        self.sql_queries.append(query)
        return self.minute_rows

    async def hook(self, user_id, metrics):
        self.hooks.append((user_id, metrics))

    def daily_upserts(self):
        return [p for s, p in self.sql_calls if "insert into daily_summary" in s]

    def logged(self):
        return [p for s, p in self.sql_calls if "insert into ingest_log" in s]


@pytest.fixture
def rec(monkeypatch):
    r = Recorder()
    monkeypatch.setattr(writer.db, "neon", r.neon)
    monkeypatch.setattr(writer.spacetime, "configured", r.configured)
    monkeypatch.setattr(writer.spacetime, "call", r.call)
    monkeypatch.setattr(writer.spacetime, "sql", r.sql)
    monkeypatch.setattr(writer, "on_samples_ingested", r.hook)
    return r


def sample(metric, value, user=U1, ts=TS, source="apple_watch_sim"):
    return VitalsSample(user_id=user, metric=metric, value=value, unit="u", ts=ts, source=source)


async def test_point_metric_replaces_daily_row_without_spacetime_query(rec):
    n = await writer.ingest_batch(
        IngestBatch(source="apple_watch_sim", samples=[sample("sleep_total_min", 300)])
    )
    assert n == 1 and rec.sql_queries == []
    (params,) = rec.daily_upserts()
    assert params[:3] == (U1, datetime(2026, 10, 3).date(), "sleep_total_min")
    assert params[3:] == (300.0, 300.0, 300.0, 300.0, 1)
    assert rec.hooks == [(U1, ["sleep_total_min"])]
    assert rec.logged() == [(U1, "apple_watch_sim", 1)]


async def test_minute_metric_daily_comes_from_spacetime_minute_agg(rec):
    rec.minute_rows = [
        {"sum": 100.0, "min": 5, "max": 30, "n": 10},
        {"sum": 50.0, "min": 0, "max": 20, "n": 5},
    ]
    await writer.ingest_batch(IngestBatch(source="fitbit", samples=[sample("steps", 8, source="fitbit")]))
    (query,) = rec.sql_queries
    assert f"user_id = '{U1}'" in query and "metric = 'steps'" in query
    start, end = day_bounds_ms(TS.astimezone(ZoneInfo("America/Detroit")).date(), "America/Detroit")
    assert f"minute_ms >= {start} AND minute_ms < {end}" in query
    (params,) = rec.daily_upserts()
    assert params[3:] == (10.0, 0.0, 30.0, 150.0, 15)


async def test_resend_is_idempotent_for_daily_rows(rec):
    rec.minute_rows = [{"sum": 150.0, "min": 0, "max": 30, "n": 15}]
    batch = IngestBatch(source="fitbit", samples=[sample("steps", 8, source="fitbit")])
    await writer.ingest_batch(batch)
    await writer.ingest_batch(batch)
    first, second = rec.daily_upserts()
    assert first == second


async def test_without_spacetime_skips_live_pool_and_minute_daily_but_keeps_point_daily(rec):
    rec.spacetime_on = False
    batch = IngestBatch(source="apple_watch_sim", samples=[sample("steps", 8), sample("hrv_sdnn", 50)])
    await writer.ingest_batch(batch)
    assert rec.calls == []
    assert [p[2] for p in rec.daily_upserts()] == ["hrv_sdnn"]
    assert rec.hooks == [(U1, ["hrv_sdnn", "steps"])]


def test_spacetime_rows_use_epoch_ms_and_contract_names():
    (row,) = writer.spacetime_rows([sample("heart_rate", 72, source="fitbit")])
    assert row == {
        "user_id": str(U1), "metric": "heart_rate", "value": 72.0, "unit": "u",
        "source": "fitbit", "ts_ms": 1791052200000, "meta_json": "",
    }


async def test_rows_are_chunked(rec):
    samples = [sample("heart_rate", 70, ts=datetime.fromtimestamp(1790000000 + i, UTC)) for i in range(2500)]
    await writer.ingest_batch(IngestBatch(source="fitbit", samples=samples))
    assert [len(args[0]) for _, args in rec.calls] == [1000, 1000, 500]
    assert all(r == "ingest" for r, _ in rec.calls)


async def test_workout_event_is_not_summarised_but_still_notifies(rec):
    await writer.ingest_batch(IngestBatch(source="apple_watch_sim", samples=[sample("workout", 30)]))
    assert rec.daily_upserts() == []
    assert rec.hooks == [(U1, ["workout"])]


async def test_each_user_gets_own_log_and_hook(rec):
    batch = IngestBatch(
        source="apple_watch_sim", samples=[sample("hrv_sdnn", 50, U1), sample("hrv_sdnn", 40, U2)]
    )
    await writer.ingest_batch(batch)
    assert {p[0] for p in rec.logged()} == {U1, U2}
    assert {u for u, _ in rec.hooks} == {U1, U2}


async def test_empty_batch_does_nothing(rec):
    assert await writer.ingest_batch(IngestBatch(source="fitbit", samples=[])) == 0
    assert rec.calls == rec.hooks == []


async def test_daily_failure_does_not_block_hook(rec, monkeypatch):
    async def boom(*_):
        raise RuntimeError("db down")

    monkeypatch.setattr(writer, "_upsert_daily", boom)
    await writer.ingest_batch(IngestBatch(source="fitbit", samples=[sample("heart_rate", 70)]))
    assert len(rec.calls) == 1 and rec.hooks == [(U1, ["heart_rate"])]

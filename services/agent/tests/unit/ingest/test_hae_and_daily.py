import json
from datetime import UTC, date, datetime
from pathlib import Path
from uuid import UUID

import pytest

from app.ingest.daily import aggregate_minutes, aggregate_values, day_bounds_ms, local_day
from app.ingest.hae import parse_date, parse_hae

UID = UUID("00000000-0000-0000-0000-000000000001")
FIXTURE = Path(__file__).parents[5] / "contracts" / "fixtures" / "hae_sample.json"


def _by_metric(batch):
    out = {}
    for s in batch.samples:
        out.setdefault(s.metric, []).append(s)
    return out


def test_parse_fixture():
    batch = parse_hae(json.loads(FIXTURE.read_text()), UID)
    m = _by_metric(batch)
    assert batch.source == "apple_watch_sim"
    assert [s.value for s in m["heart_rate"]] == [72.0, 74.0]
    assert m["heart_rate"][0].meta == {"min": 65, "max": 85}
    assert m["heart_rate"][0].ts == datetime(2026, 10, 3, 18, 30, tzinfo=UTC)
    assert m["steps"][0].value == 18
    assert m["spo2"][0].value == pytest.approx(97.0)
    assert m["hrv_sdnn"][0].value == 52.4
    assert m["sleep_total_min"][0].value == pytest.approx(450)
    assert m["sleep_deep_min"][0].value == pytest.approx(78)
    assert "unknown_metric" not in m
    (w,) = m["workout"]
    assert w.value == 30 and w.meta == {"name": "Running", "end": "2026-10-03 13:30:00 -0400", "kcal": 320}


def test_lowercase_keys_and_both_date_formats():
    payload = {
        "data": {
            "metrics": [
                {
                    "name": "heart_rate",
                    "data": [
                        {"date": "2026-10-03 14:30:00 -0400", "min": 60, "avg": 70, "max": 80},
                        {"date": "2026-10-03T14:31:00-04:00", "avg": 71},
                    ],
                }
            ],
            "workouts": [],
        }
    }
    vals = [s.value for s in parse_hae(payload, UID).samples]
    assert vals == [70.0, 71.0]


def test_naive_iso_date_is_utc():
    assert parse_date("2026-10-03T12:00:00") == datetime(2026, 10, 3, 12, tzinfo=UTC)


def test_bad_payload_raises():
    with pytest.raises(KeyError):
        parse_hae({"data": {"metrics": [{"name": "heart_rate", "data": [{"avg": 70}]}]}}, UID)


def test_aggregate_values():
    assert aggregate_values([]) is None
    assert aggregate_values([60, 64]) == {"avg": 62.0, "min": 60, "max": 64, "sum": 124, "n": 2}


def test_aggregate_minutes_is_weighted_by_n():
    rows = [
        {"sum": 100.0, "min": 8, "max": 20, "n": 10},
        {"sum": 300.0, "min": 5, "max": 40, "n": 10},
    ]
    assert aggregate_minutes(rows) == {"avg": 20.0, "min": 5.0, "max": 40.0, "sum": 400.0, "n": 20}
    assert aggregate_minutes([]) is None
    assert aggregate_minutes([{"sum": 0, "min": 0, "max": 0, "n": 0}]) is None


def test_local_day_and_bounds_follow_timezone():
    ts = datetime(2026, 10, 4, 2, 0, tzinfo=UTC)  # 22:00 on Oct 3 in Detroit
    assert local_day(ts, "America/Detroit") == date(2026, 10, 3)
    start, end = day_bounds_ms(date(2026, 10, 3), "America/Detroit")
    assert end - start == 24 * 3600 * 1000
    assert start == int(datetime(2026, 10, 3, 4, tzinfo=UTC).timestamp() * 1000)


def test_dst_day_is_not_24_hours():
    start, end = day_bounds_ms(date(2026, 11, 1), "America/Detroit")
    assert end - start == 25 * 3600 * 1000

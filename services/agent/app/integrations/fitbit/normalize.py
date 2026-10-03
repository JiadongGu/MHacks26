from datetime import date, datetime, time
from zoneinfo import ZoneInfo

SOURCE = "fitbit"


def _sample(user_id: str, metric: str, value: float, unit: str, ts: datetime) -> dict:
    return {
        "user_id": user_id,
        "metric": metric,
        "value": float(value),
        "unit": unit,
        "ts": ts.isoformat(),
        "source": SOURCE,
    }


def heart_rate_samples(user_id: str, points: list[dict]) -> list[dict]:
    out = []
    for p in points:
        hr = p["heartRate"]
        ts = datetime.fromisoformat(hr["sampleTime"]["physicalTime"].replace("Z", "+00:00"))
        out.append(_sample(user_id, "heart_rate", int(hr["beatsPerMinute"]), "bpm", ts))
    return out


def steps_samples(user_id: str, rollup: dict, tz: str) -> list[dict]:
    out = []
    for p in rollup.get("rollupDataPoints", []):
        d = p["civilStartTime"]["date"]
        ts = datetime.combine(date(d["year"], d["month"], d["day"]), time(23, 59), tzinfo=ZoneInfo(tz))
        out.append(_sample(user_id, "steps", int(p["steps"]["countSum"]), "count", ts))
    return out


def to_batch(samples: list[dict]) -> dict:
    return {"source": SOURCE, "samples": samples}

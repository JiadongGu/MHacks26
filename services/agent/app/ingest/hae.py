"""Health Auto Export JSON to IngestBatch. Keys match case-insensitively (Min/Avg/Max or min/avg/max)."""

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from app.contracts import IngestBatch, VitalsSample

# HAE metric name -> (our metric, unit). Units are ours, not HAE's.
METRICS: dict[str, tuple[str, str]] = {
    "heart_rate": ("heart_rate", "bpm"),
    "resting_heart_rate": ("resting_heart_rate", "bpm"),
    "heart_rate_variability": ("hrv_sdnn", "ms"),
    "step_count": ("steps", "count"),
    "blood_oxygen_saturation": ("spo2", "%"),
    "respiratory_rate": ("respiratory_rate", "br/min"),
    "active_energy": ("active_energy_kcal", "kcal"),
    "apple_exercise_time": ("active_minutes", "min"),
    "blood_pressure_systolic": ("bp_systolic", "mmHg"),
    "blood_pressure_diastolic": ("bp_diastolic", "mmHg"),
    "skin_temp_delta": ("skin_temp_delta", "degC"),
}
# sleep_analysis reports hours.
SLEEP_FIELDS = {
    "totalsleep": "sleep_total_min",
    "deep": "sleep_deep_min",
    "rem": "sleep_rem_min",
    "core": "sleep_core_min",
    "awake": "sleep_awake_min",
}


def parse_date(value: str) -> datetime:
    try:
        dt = datetime.strptime(value, "%Y-%m-%d %H:%M:%S %z")
    except ValueError:
        dt = datetime.fromisoformat(value)
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def _lower(d: dict[str, Any]) -> dict[str, Any]:
    return {k.lower(): v for k, v in d.items()}


def _sample(
    user_id: UUID,
    metric: str,
    value: float,
    unit: str,
    ts: datetime,
    source: str,
    meta: dict[str, Any] | None = None,
) -> VitalsSample:
    return VitalsSample(
        user_id=user_id, metric=metric, value=value, unit=unit, ts=ts, source=source, meta=meta
    )


def parse_hae(payload: dict[str, Any], user_id: UUID, source: str = "apple_watch_sim") -> IngestBatch:
    data = payload.get("data", payload)
    out: list[VitalsSample] = []
    for m in data.get("metrics", []):
        name = str(m.get("name", "")).lower()
        for raw in m.get("data", []):
            p = _lower(raw)
            if name == "sleep_analysis":
                ts = parse_date(raw.get("sleepEnd") or raw.get("sleepend") or p["date"])
                for key, metric in SLEEP_FIELDS.items():
                    if key in p:
                        out.append(_sample(user_id, metric, float(p[key]) * 60, "min", ts, source))
                continue
            if name not in METRICS:
                continue
            metric, unit = METRICS[name]
            value = p.get("qty", p.get("avg"))
            if value is None:
                continue
            value = float(value)
            if metric == "spo2" and 0 < value <= 1:
                value *= 100
            meta = {k: p[k] for k in ("min", "max") if k in p} or None
            out.append(_sample(user_id, metric, value, unit, parse_date(p["date"]), source, meta))
    for w in data.get("workouts", []):
        meta = {"name": w.get("name"), "end": w.get("end")}
        kcal = (w.get("activeEnergyBurned") or {}).get("qty")
        if kcal is not None:
            meta["kcal"] = kcal
        out.append(
            _sample(
                user_id,
                "workout",
                float(w.get("duration", 0)) / 60,
                "min",
                parse_date(w["start"]),
                source,
                meta,
            )
        )
    return IngestBatch(source=source, samples=out)

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from app.contracts import VitalsSample


def heart_rate_samples(user_id: UUID, points: list[dict[str, Any]]) -> list[VitalsSample]:
    return [
        VitalsSample(
            user_id=user_id,
            metric="heart_rate",
            unit="bpm",
            source="fitbit",
            value=int(p["heartRate"]["beatsPerMinute"]),
            ts=datetime.fromisoformat(p["heartRate"]["sampleTime"]["physicalTime"]),
        )
        for p in points
    ]


def steps_samples(user_id: UUID, points: list[dict[str, Any]]) -> list[VitalsSample]:
    """Each point is one minute's step count, so samples are per-interval deltas."""
    return [
        VitalsSample(
            user_id=user_id,
            metric="steps",
            unit="count",
            source="fitbit",
            value=int(p["steps"]["count"]),
            ts=datetime.fromisoformat(p["steps"]["interval"]["startTime"]),
        )
        for p in points
    ]


def _civil_noon(d: dict[str, int]) -> datetime:
    """A civil date as noon UTC, which falls on the same local day in every zone from UTC-12 to UTC+11."""
    return datetime(d["year"], d["month"], d["day"], 12, tzinfo=UTC)


def resting_hr_samples(user_id: UUID, points: list[dict[str, Any]]) -> list[VitalsSample]:
    return [
        VitalsSample(
            user_id=user_id,
            metric="resting_heart_rate",
            unit="bpm",
            source="fitbit",
            value=int(p["dailyRestingHeartRate"]["beatsPerMinute"]),
            ts=_civil_noon(p["dailyRestingHeartRate"]["date"]),
        )
        for p in points
    ]


def hrv_samples(user_id: UUID, points: list[dict[str, Any]]) -> list[VitalsSample]:
    """Fitbit reports RMSSD; the contract has only hrv_sdnn, so the measure is kept in meta."""
    return [
        VitalsSample(
            user_id=user_id,
            metric="hrv_sdnn",
            unit="ms",
            source="fitbit",
            meta={"measure": "rmssd"},
            value=float(p["dailyHeartRateVariability"]["averageHeartRateVariabilityMilliseconds"]),
            ts=_civil_noon(p["dailyHeartRateVariability"]["date"]),
        )
        for p in points
    ]


def spo2_samples(user_id: UUID, points: list[dict[str, Any]]) -> list[VitalsSample]:
    return [
        VitalsSample(
            user_id=user_id,
            metric="spo2",
            unit="%",
            source="fitbit",
            value=float(p["oxygenSaturation"]["percentage"]),
            ts=datetime.fromisoformat(p["oxygenSaturation"]["sampleTime"]["physicalTime"]),
        )
        for p in points
    ]


def active_minutes_samples(user_id: UUID, points: list[dict[str, Any]]) -> list[VitalsSample]:
    """Minutes of moderate or vigorous activity. Light-only minutes are skipped."""
    out = []
    for p in points:
        minutes = sum(
            int(lv["activeMinutes"])
            for lv in p["activeMinutes"].get("activeMinutesByActivityLevel", [])
            if lv.get("activityLevel") in ("MODERATE", "VIGOROUS")
        )
        if minutes:
            out.append(
                VitalsSample(
                    user_id=user_id,
                    metric="active_minutes",
                    unit="min",
                    source="fitbit",
                    value=minutes,
                    ts=datetime.fromisoformat(p["activeMinutes"]["interval"]["startTime"]),
                )
            )
    return out


SLEEP_STAGE_METRICS = {
    "LIGHT": "sleep_core_min",
    "DEEP": "sleep_deep_min",
    "REM": "sleep_rem_min",
    "AWAKE": "sleep_awake_min",
}


def _stage_minutes(sleep: dict[str, Any]) -> dict[str, int]:
    summary = sleep.get("summary") or {}
    if summary.get("stagesSummary"):
        return {str(s["type"]).upper(): int(s["minutes"]) for s in summary["stagesSummary"]}
    out: dict[str, int] = {}
    for g in sleep.get("stages", []):
        secs = (datetime.fromisoformat(g["endTime"]) - datetime.fromisoformat(g["startTime"])).total_seconds()
        out[str(g["type"]).upper()] = out.get(str(g["type"]).upper(), 0) + round(secs / 60)
    return out


def sleep_samples(user_id: UUID, points: list[dict[str, Any]]) -> list[VitalsSample]:
    """One set of samples per sleep session, stamped at wake time so the session lands on the wake day."""
    out = []
    for p in points:
        sleep = p["sleep"]
        stages = _stage_minutes(sleep)
        asleep = (sleep.get("summary") or {}).get("minutesAsleep")
        asleep = (
            int(asleep) if asleep is not None else sum(stages.get(k, 0) for k in ("LIGHT", "DEEP", "REM"))
        )
        ts = datetime.fromisoformat(sleep["interval"]["endTime"])
        out.append(
            VitalsSample(
                user_id=user_id, metric="sleep_total_min", unit="min", source="fitbit", value=asleep, ts=ts
            )
        )
        for stage, metric in SLEEP_STAGE_METRICS.items():
            if stage in stages:
                out.append(
                    VitalsSample(
                        user_id=user_id,
                        metric=metric,
                        unit="min",
                        source="fitbit",
                        value=stages[stage],
                        ts=ts,
                    )
                )
    return out

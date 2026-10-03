from datetime import datetime
from typing import Any
from uuid import UUID

from app.contracts import VitalsSample


def heart_rate_samples(user_id: UUID, points: list[dict[str, Any]]) -> list[VitalsSample]:
    return [
        VitalsSample(
            user_id=user_id, metric="heart_rate", unit="bpm", source="fitbit",
            value=int(p["heartRate"]["beatsPerMinute"]),
            ts=datetime.fromisoformat(p["heartRate"]["sampleTime"]["physicalTime"]),
        )
        for p in points
    ]


def steps_samples(user_id: UUID, points: list[dict[str, Any]]) -> list[VitalsSample]:
    """Each point is one minute's step count, so samples are per-interval deltas."""
    return [
        VitalsSample(
            user_id=user_id, metric="steps", unit="count", source="fitbit",
            value=int(p["steps"]["count"]),
            ts=datetime.fromisoformat(p["steps"]["interval"]["startTime"]),
        )
        for p in points
    ]

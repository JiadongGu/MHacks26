"""Deterministic Apple Watch persona. Pure functions: same seed + time + scenario gives the same numbers."""

import math
import random
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

WORKOUT_PEAK_HR = 150
WORKOUT_MIN = 20


@dataclass(frozen=True)
class Baselines:
    resting_hr: float = 60
    hrv_sdnn: float = 55
    sleep_min: float = 450


def _rng(seed: str, *key: Any) -> random.Random:
    return random.Random(":".join([seed, *map(str, key)]))


def _steps_mean(hour: float) -> float:
    for lo, hi, mean in ((7, 9, 12), (9, 12, 4), (12, 13, 10), (13, 17, 4), (17, 19, 9), (19, 22, 3)):
        if lo <= hour < hi:
            return mean
    return 1 if 6.5 <= hour < 23 else 0


def minute_values(
    seed: str, base: Baselines, scenario: str, t: datetime, tz: str, started: datetime
) -> dict[str, Any]:
    """HAE-named values for the minute starting at `t`. The scenario only applies from `started` onward."""
    local = t.astimezone(ZoneInfo(tz))
    hour = local.hour + local.minute / 60
    asleep = hour >= 23 or hour < 6.5
    rng = _rng(seed, int(t.timestamp() // 60))
    active = scenario if t >= started else "normal"
    elapsed = (t - started).total_seconds() / 60

    steps = 0 if asleep else max(0, round(rng.gauss(_steps_mean(hour), _steps_mean(hour) * 0.8)))
    awake_hr = base.resting_hr + 10 + rng.gauss(0, 3)
    hr = base.resting_hr - 5 + rng.gauss(0, 1.5) if asleep else awake_hr + min(steps, 100) * 0.25
    spo2 = min(99, max(94, rng.gauss(96 if asleep else 97, 0.7)))
    resp = rng.gauss(14 if asleep else 16, 0.8)

    if active == "illness_onset":
        hr += 8
    elif active == "sedentary_day":
        steps = rng.choice([0, 0, 0, 0, 0, 1])
        hr = base.resting_hr + 6 + rng.gauss(0, 2) if not asleep else hr
    elif active == "low_spo2":
        spo2 = rng.gauss(89, 0.8)
    elif active == "workout_now":
        if 0 <= elapsed < WORKOUT_MIN:
            hr = awake_hr + (WORKOUT_PEAK_HR - awake_hr) * min(1, (elapsed + 1) / 3) + rng.gauss(0, 2)
            steps = rng.randint(140, 170)
        elif WORKOUT_MIN <= elapsed < 2 * WORKOUT_MIN:
            hr = awake_hr + (WORKOUT_PEAK_HR - awake_hr) * math.exp(-(elapsed - WORKOUT_MIN) / 6)
            steps = rng.randint(0, 8)

    return {
        "heart_rate": {
            "Min": round(hr - rng.uniform(1, 4), 1),
            "Avg": round(hr, 1),
            "Max": round(hr + rng.uniform(1, 5), 1),
        },
        "step_count": steps,
        "blood_oxygen_saturation": round(spo2, 1),
        "respiratory_rate": round(resp, 1),
    }


def daily_values(seed: str, base: Baselines, scenario: str, day: date, is_today: bool) -> dict[str, float]:
    rng = _rng(seed, "daily", day.isoformat())
    out = {
        "resting_heart_rate": base.resting_hr + rng.uniform(-1, 1),
        "heart_rate_variability": base.hrv_sdnn + rng.uniform(-4, 4),
        "sleep_minutes": base.sleep_min + rng.uniform(-25, 25),
    }
    if is_today and scenario == "illness_onset":
        out.update(
            resting_heart_rate=base.resting_hr + 10,
            heart_rate_variability=0.7 * base.hrv_sdnn,
            sleep_minutes=300,
            skin_temp_delta=0.6,
        )
    elif is_today and scenario == "great_sleep":
        out.update(
            resting_heart_rate=base.resting_hr - 2,
            heart_rate_variability=1.15 * base.hrv_sdnn,
            sleep_minutes=510,
        )
    return out


def sleep_entry(ts: datetime, minutes: float) -> dict[str, Any]:
    hours = minutes / 60
    return {
        "date": ts.isoformat(),
        "sleepEnd": ts.isoformat(),
        "totalSleep": round(hours, 2),
        "deep": round(0.18 * hours, 2),
        "rem": round(0.22 * hours, 2),
        "core": round(0.60 * hours, 2),
        "awake": round(0.05 * hours, 2),
    }

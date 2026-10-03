"""What a person can choose to focus on. Pure data and helpers, no I/O.

People pick areas, not numbers. A few areas map to something a wearable can measure; for those the system
chooses the target itself from the person's own baseline, so nobody is asked to type a number that can feel
like a verdict. The other areas are calendar and habit based and have no target at all.
"""

from dataclasses import dataclass
from typing import Any

MAX_PICKS = 3


@dataclass(frozen=True)
class Focus:
    key: str
    label: str
    blurb: str
    area: str  # body | mind | habits
    metric: str | None = None  # the measurable goal this focus maps to, if any
    period: str = "day"
    direction: str = "at_least"


CATALOG: list[Focus] = [
    Focus("sleep", "Sleep better", "Wind down earlier and wake up rested.", "body", "sleep_total_min"),
    Focus("steps", "Move more", "Fit more walking into your day.", "body", "steps"),
    Focus("workouts", "Work out more", "Build a regular exercise habit.", "body", "active_minutes", "week"),
    Focus("heart", "Look after my heart", "Keep resting heart rate and blood pressure steady.", "body"),
    Focus("stress", "Feel less stressed", "Short breaks to reset during the day.", "mind"),
    Focus("unplug", "Wind down at night", "Screens off and a calm evening routine.", "mind"),
    Focus("study", "Build better study habits", "Protect focused time for the work that matters.", "habits"),
    Focus("balance", "Balance work and rest", "Space out busy stretches with real breaks.", "habits"),
    Focus("routine", "Keep a steady routine", "Go to bed and wake up at consistent times.", "habits"),
    Focus("hydration", "Drink more water", "Gentle reminders through the day.", "habits"),
]
BY_KEY = {f.key: f for f in CATALOG}


def validate_keys(keys: list[str]) -> list[str]:
    """Drops repeats, keeps order, and rejects unknown keys or more than MAX_PICKS."""
    seen: list[str] = []
    for k in keys:
        if k not in BY_KEY:
            raise ValueError(f"unknown focus area: {k}")
        if k not in seen:
            seen.append(k)
    if len(seen) > MAX_PICKS:
        raise ValueError(f"pick at most {MAX_PICKS} focus areas")
    return seen


def _round_to(value: float, step: int) -> int:
    return int(round(value / step) * step)


def adaptive_target(metric: str, baselines: dict[str, Any], age: int | None) -> float:
    """A gentle starting target from the person's own baseline. Never asked of the user."""
    if metric == "sleep_total_min":
        base = baselines.get("sleep_min") or 450
        return float(_round_to(min(max(base, 420), 540), 15))
    if metric == "steps":
        base = baselines.get("steps")
        if not base:
            return 4500.0 if (age or 0) >= 65 else 7000.0
        return float(min(12000, max(3000, _round_to(max(base * 1.15, base + 500), 500))))
    if metric == "active_minutes":
        return 150.0
    raise ValueError(f"no adaptive target for {metric}")

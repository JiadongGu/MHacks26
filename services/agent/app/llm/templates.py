from collections.abc import Callable
from typing import Any

MAX_CHARS = 320


def _workout(f: dict[str, Any]) -> str:
    return (f"Nice workout! Your heart rate stayed at {f.get('threshold')} bpm or above for "
            f"{f.get('duration_min')} minutes, with a peak of {f.get('peak_hr')} bpm. "
            "Remember to cool down and drink water.")


def _illness(f: dict[str, Any]) -> str:
    text = (f"Your resting heart rate is {f.get('rhr_today')} bpm, {f.get('rhr_delta')} above your "
            f"baseline of {f.get('rhr_baseline')}.")
    if f.get("sleep_min") is not None:
        text += f" You slept {round(f['sleep_min'] / 60, 1)} h."
    text += " Your body may be fighting something. Rest and fluids can help."
    if f.get("event_title"):
        text += f" You have '{f['event_title']}' soon. Consider a sleep block tonight."
    return text


def _spo2(f: dict[str, Any]) -> str:
    readings = " and ".join(str(r) for r in f.get("readings", []))
    text = (f"Your last two blood oxygen readings were {readings}%, below your {f.get('threshold')}% limit. "
            "Sit down, breathe slowly, and re-check in a few minutes.")
    if (f.get("min_spo2") or 100) < 88:
        text += " If it stays this low or you feel unwell, seek medical care now."
    return text


def _inactivity(f: dict[str, Any]) -> str:
    return (f"You took {f.get('steps_3h')} steps in the last 3 hours. "
            "A short 5 to 10 minute walk can help you reset.")


def _goal_pace(f: dict[str, Any]) -> str:
    return (f"You have {f.get('steps')} steps today, {f.get('pct')}% of your {f.get('goal')} goal. "
            f"{f.get('remaining')} more steps to go. An evening walk would close the gap.")


def _bp(f: dict[str, Any]) -> str:
    text = (f"{f.get('count')} blood pressure readings in the last 24 hours were high, up to "
            f"{f.get('max_systolic')}/{f.get('max_diastolic')} mmHg.")
    if f.get("hypertension"):
        text += " With your hypertension, this matters."
    return text + " Rest, then re-check in 10 minutes. If it stays high, contact your clinician."


def _sleep_debt(f: dict[str, Any]) -> str:
    return (f"Your 3-day sleep average is {f.get('avg_sleep_min')} min, {f.get('debt_min')} min under your "
            f"{f.get('target_min')} min goal. An earlier bedtime tonight can help.")


def _recovery(f: dict[str, Any]) -> str:
    return (f"Good news. Your resting heart rate is back to {f.get('rhr_today')} bpm, near your baseline of "
            f"{f.get('rhr_baseline')}. You look recovered.")


def _low_hr(f: dict[str, Any]) -> str:
    return (f"Your heart rate was {f.get('min_hr')} bpm or lower for {f.get('minutes')} minutes. "
            "If you feel dizzy or faint, sit down and seek medical advice.")


TEMPLATES: dict[str, Callable[[dict[str, Any]], str]] = {
    "workout_detected": _workout,
    "illness_onset": _illness,
    "low_spo2": _spo2,
    "inactivity": _inactivity,
    "goal_pace": _goal_pace,
    "high_bp": _bp,
    "sleep_debt": _sleep_debt,
    "recovery": _recovery,
    "low_hr": _low_hr,
}


def render(kind: str, facts: dict[str, Any]) -> str:
    fn = TEMPLATES.get(kind)
    try:
        text = fn(facts) if fn else "Pulse has an update for you. Open the app for details."
    except Exception:
        text = "Pulse has an update for you. Open the app for details."
    return text[:MAX_CHARS]

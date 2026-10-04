"""Explain why a rule fired. Pure and deterministic: no database, no network, no LLM.

Shape of the result (stored at alerts.payload.explain):
    rule: the finding kind
    summary: one plain sentence
    comparisons: [{label, today, baseline_or_threshold, unit, delta, flagged}]
    twin_rules: plain strings that name the twin-derived thresholds that applied
    data_used: [{metric, window, source}]   source is wearable | baseline | goal | calendar
    watch_next: one sentence
"""

from typing import Any

from app.rules.engine import is_beta_blocker_user, is_hypertensive, thresholds
from app.rules.types import TITLES, Finding, RuleContext

DEFAULT_RHR_DELTA = 8
DEFAULT_SPO2 = 92
DEFAULT_WORKOUT_HR = 135
SHORT_SLEEP_MIN = 360
HRV_RATIO = 0.8
WORKOUT_MINUTES = 10
LOW_HR_MINUTES = 10
BP_READINGS = 2
GOAL_PACE_PCT = 60
SLEEP_DEBT_SLACK_MIN = 60


def _num(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)


def _clean(value: float | None) -> int | float | None:
    if value is None:
        return None
    return int(value) if float(value).is_integer() else round(value, 1)


def _cmp(label: str, today: float | None, ref: float | None, unit: str, flagged: bool) -> dict[str, Any]:
    delta = None if today is None or ref is None else today - ref
    return {"label": label, "today": _clean(today), "baseline_or_threshold": _clean(ref), "unit": unit,
            "delta": _clean(delta), "flagged": bool(flagged) and today is not None}


def _use(metric: str, window: str, source: str) -> dict[str, str]:
    return {"metric": metric, "window": window, "source": source}


def _fmt(value: float | None, unit: str = "") -> str:
    if value is None:
        return "n/a"
    return f"{_clean(value)}{unit}"


def _age(twin: dict[str, Any]) -> float | None:
    return _num((twin.get("profile") or {}).get("age"))


def _flags(twin: dict[str, Any]) -> set[str]:
    return {str(f).lower() for f in twin.get("risk_flags") or []}


def _rhr_rules(ctx: RuleContext) -> list[str]:
    warn = thresholds(ctx.twin)["rhr_delta_warn"]
    if is_hypertensive(ctx.twin):
        return [f"Hypertension on your record → resting heart rate alert at +{warn:g} bpm "
                "(tightened for hypertension)"]
    if warn != DEFAULT_RHR_DELTA:
        return [f"Resting heart rate alert at +{warn:g} bpm (set from your health record)"]
    return []


def _spo2_rules(ctx: RuleContext, warn: float) -> list[str]:
    age = _age(ctx.twin)
    if "asthma" in _flags(ctx.twin) and warn >= 93:
        return [f"Asthma on your record → blood oxygen alert below {warn:g}%"]
    if age is not None and age >= 65 and warn < DEFAULT_SPO2:
        return [f"Age 65 or older on your record → blood oxygen alert below {warn:g}%"]
    if age is not None and age < 18 and warn > DEFAULT_SPO2:
        return [f"Age under 18 on your record → blood oxygen alert below {warn:g}%"]
    if warn != DEFAULT_SPO2:
        return [f"Blood oxygen alert below {warn:g}% (set from your health record)"]
    return []


def _workout_rules(ctx: RuleContext, thr: float) -> list[str]:
    if is_beta_blocker_user(ctx.twin):
        return [f"Beta blocker on your record → workout heart rate alert at {thr:g} bpm "
                "(lowered because a beta blocker keeps heart rate down)"]
    age = _age(ctx.twin)
    if age is not None and age >= 65 and thr < DEFAULT_WORKOUT_HR:
        return [f"Age 65 or older on your record → workout heart rate alert at {thr:g} bpm"]
    if thr != DEFAULT_WORKOUT_HR:
        return [f"Workout heart rate alert at {thr:g} bpm (set from your health record)"]
    return []


def _bp_rules(ctx: RuleContext, sys_warn: float, dia_warn: float) -> list[str]:
    if is_hypertensive(ctx.twin):
        return [f"Hypertension on your record → blood pressure alert at {sys_warn:g}/{dia_warn:g}"]
    return []


def _workout(f: Finding, ctx: RuleContext) -> dict[str, Any]:
    peak, thr, minutes = (_num(f.facts.get(k)) for k in ("peak_hr", "threshold", "duration_min"))
    if thr is None:
        thr = float(thresholds(ctx.twin)["workout_hr"])
    return {
        "summary": (f"Your heart rate stayed at or above {_fmt(thr)} bpm for {_fmt(minutes)} minutes, "
                    "so Pulse treats it as a workout."),
        "comparisons": [
            _cmp("Peak heart rate", peak, thr, "bpm", True),
            _cmp("Minutes above the threshold", minutes, WORKOUT_MINUTES, "min", False),
        ],
        "twin_rules": _workout_rules(ctx, thr),
        "data_used": [_use("heart_rate", "last 15 minutes", "wearable")],
        "watch_next": "Pulse watches your heart rate as it settles after the workout.",
    }


def _illness(f: Finding, ctx: RuleContext) -> dict[str, Any]:
    warn = thresholds(ctx.twin)["rhr_delta_warn"]
    rhr, base, delta = (_num(f.facts.get(k)) for k in ("rhr_today", "rhr_baseline", "rhr_delta"))
    sleep, hrv, hrv_base = (_num(f.facts.get(k)) for k in ("sleep_min", "hrv", "hrv_baseline"))
    triggers = [str(t) for t in f.facts.get("triggers") or []]
    comparisons = [_cmp("Resting heart rate", rhr, base, "bpm", delta is not None and delta >= warn)]
    data = [_use("resting_heart_rate", "today", "wearable"),
            _use("resting_hr baseline", "your usual level", "baseline")]
    if sleep is not None:
        comparisons.append(_cmp("Sleep", sleep, SHORT_SLEEP_MIN, "min", "short_sleep" in triggers))
        data.append(_use("sleep_total_min", "last night", "wearable"))
    if hrv is not None and hrv_base is not None:
        comparisons.append(_cmp("Heart rate variability", hrv, round(HRV_RATIO * hrv_base, 1), "ms",
                                "low_hrv" in triggers))
        data.append(_use("hrv_sdnn", "today", "wearable"))
    reasons = " and ".join({"short_sleep": "short sleep", "low_hrv": "low heart rate variability"}[t]
                           for t in triggers if t in ("short_sleep", "low_hrv"))
    summary = (f"Your resting heart rate is {_fmt(delta)} bpm above your baseline"
               + (f", together with {reasons}." if reasons else "."))
    if f.facts.get("event_title"):
        data.append(_use("important event", "next 48 hours", "calendar"))
    return {
        "summary": summary,
        "comparisons": comparisons,
        "twin_rules": _rhr_rules(ctx),
        "data_used": data,
        "watch_next": "Pulse checks whether your resting heart rate returns to baseline after more rest.",
    }


def _spo2(f: Finding, ctx: RuleContext) -> dict[str, Any]:
    low = _num(f.facts.get("min_spo2"))
    warn = _num(f.facts.get("threshold"))
    if warn is None:
        warn = float(thresholds(ctx.twin)["spo2_warn"])
    return {
        "summary": (f"Your last two blood oxygen readings were both below {_fmt(warn)}%, "
                    f"and the lowest was {_fmt(low)}%."),
        "comparisons": [_cmp("Lowest blood oxygen", low, warn, "%", True)],
        "twin_rules": _spo2_rules(ctx, warn),
        "data_used": [_use("spo2", "last 30 minutes", "wearable")],
        "watch_next": "Pulse checks your next blood oxygen readings. A reading below 88% is urgent.",
    }


def _inactivity(f: Finding, ctx: RuleContext) -> dict[str, Any]:
    steps, thr = _num(f.facts.get("steps_3h")), _num(f.facts.get("threshold"))
    if thr is None:
        thr = float(thresholds(ctx.twin)["inactivity_steps_3h"])
    return {
        "summary": f"You took {_fmt(steps)} steps in the last 3 hours, which is under {_fmt(thr)}.",
        "comparisons": [_cmp("Steps in 3 hours", steps, thr, "steps", True)],
        "twin_rules": [],
        "data_used": [_use("steps", "last 3 hours", "wearable")],
        "watch_next": "Pulse stays quiet while you move. It sends at most 2 move reminders a day.",
    }


def _goal_pace(f: Finding, ctx: RuleContext) -> dict[str, Any]:
    steps, goal, pct = (_num(f.facts.get(k)) for k in ("steps", "goal", "pct"))
    remaining = _num(f.facts.get("remaining"))
    return {
        "summary": (f"You are at {_fmt(pct)}% of your {_fmt(goal)} step goal this evening, "
                    f"with {_fmt(remaining)} steps to go."),
        "comparisons": [
            _cmp("Steps today", steps, goal, "steps", True),
            _cmp("Progress toward goal", pct, GOAL_PACE_PCT, "%", True),
        ],
        "twin_rules": [],
        "data_used": [_use("steps", "today", "wearable"),
                      _use("daily step goal", "your active goal", "goal")],
        "watch_next": "Pulse checks your steps again tomorrow evening.",
    }


def _high_bp(f: Finding, ctx: RuleContext) -> dict[str, Any]:
    thr = f.facts.get("threshold")
    if isinstance(thr, list) and len(thr) == 2 and all(_num(x) is not None for x in thr):
        sys_warn, dia_warn = float(thr[0]), float(thr[1])
    else:
        sys_warn, dia_warn = (float(x) for x in thresholds(ctx.twin)["bp_warn"])
    sys_max, dia_max = _num(f.facts.get("max_systolic")), _num(f.facts.get("max_diastolic"))
    count = _num(f.facts.get("count"))
    return {
        "summary": (f"{_fmt(count)} blood pressure readings in the last 24 hours were at or above "
                    f"{_fmt(sys_warn)}/{_fmt(dia_warn)}."),
        "comparisons": [
            _cmp("Highest systolic", sys_max, sys_warn, "mmHg", sys_max is not None and sys_max >= sys_warn),
            _cmp("Highest diastolic", dia_max, dia_warn, "mmHg", dia_max is not None and dia_max >= dia_warn),
            _cmp("Readings at or above the limit", count, BP_READINGS, "readings", False),
        ],
        "twin_rules": _bp_rules(ctx, sys_warn, dia_warn),
        "data_used": [_use("bp_systolic", "last 24 hours", "wearable"),
                      _use("bp_diastolic", "last 24 hours", "wearable")],
        "watch_next": "Pulse checks your next readings. Talk to your clinician if they stay high.",
    }


def _sleep_debt(f: Finding, ctx: RuleContext) -> dict[str, Any]:
    avg, target, debt = (_num(f.facts.get(k)) for k in ("avg_sleep_min", "target_min", "debt_min"))
    has_goal = any(g.active and g.metric == "sleep_total_min" and g.period == "day" for g in ctx.goals)
    return {
        "summary": (f"Your 3-night average sleep is {_fmt(avg)} minutes, which is {_fmt(debt)} minutes "
                    f"under your target of {_fmt(target)}."),
        "comparisons": [_cmp("Average sleep (3 nights)", avg, target, "min", True)],
        "twin_rules": [],
        "data_used": [_use("sleep_total_min", "last 3 nights", "wearable"),
                      _use("sleep target", "your sleep goal" if has_goal else "your usual sleep",
                           "goal" if has_goal else "baseline")],
        "watch_next": "Pulse alerts again only if your sleep stays short after 48 hours.",
    }


def _recovery(f: Finding, ctx: RuleContext) -> dict[str, Any]:
    today, yesterday, base = (_num(f.facts.get(k)) for k in ("rhr_today", "rhr_yesterday", "rhr_baseline"))
    return {
        "summary": (f"Your resting heart rate was {_fmt(today)} bpm today and {_fmt(yesterday)} bpm "
                    f"yesterday, both within 3 bpm of your baseline of {_fmt(base)}."),
        "comparisons": [
            _cmp("Resting heart rate today", today, base, "bpm", False),
            _cmp("Resting heart rate yesterday", yesterday, base, "bpm", False),
        ],
        "twin_rules": [],
        "data_used": [_use("resting_heart_rate", "today and yesterday", "wearable"),
                      _use("resting_hr baseline", "your usual level", "baseline")],
        "watch_next": "Pulse marks your status as normal and keeps watching your resting heart rate.",
    }


def _low_hr(f: Finding, ctx: RuleContext) -> dict[str, Any]:
    low, minutes, thr = (_num(f.facts.get(k)) for k in ("min_hr", "minutes", "threshold"))
    if thr is None:
        thr = float(thresholds(ctx.twin)["low_hr"])
    rules = ["No beta blocker on your record → low heart rate alerts are on"]
    if thr != 40:
        rules.append(f"Low heart rate alert below {thr:g} bpm (set from your health record)")
    return {
        "summary": f"Your heart rate stayed below {_fmt(thr)} bpm for {_fmt(minutes)} minutes.",
        "comparisons": [
            _cmp("Lowest heart rate", low, thr, "bpm", True),
            _cmp("Minutes below the threshold", minutes, LOW_HR_MINUTES, "min", False),
        ],
        "twin_rules": rules,
        "data_used": [_use("heart_rate", "last 15 minutes", "wearable")],
        "watch_next": "Pulse checks your heart rate again. Seek care if you feel faint or unwell.",
    }


_BUILDERS = {
    "workout_detected": _workout, "illness_onset": _illness, "low_spo2": _spo2, "inactivity": _inactivity,
    "goal_pace": _goal_pace, "high_bp": _high_bp, "sleep_debt": _sleep_debt, "recovery": _recovery,
    "low_hr": _low_hr,
}


def explain_kinds() -> list[str]:
    return list(_BUILDERS)


def explain(finding: Finding, ctx: RuleContext) -> dict[str, Any]:
    """Build the explain object for one finding. Unknown kinds get a generic, empty explanation."""
    build = _BUILDERS.get(finding.kind)
    if build is None:
        body: dict[str, Any] = {
            "summary": f"Pulse wrote this alert: {TITLES.get(finding.kind, finding.kind)}.",
            "comparisons": [], "twin_rules": [], "data_used": [],
            "watch_next": "Pulse keeps watching your data.",
        }
    else:
        body = build(finding, ctx)
    return {"rule": finding.kind, **body}

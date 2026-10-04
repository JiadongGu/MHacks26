from collections.abc import Callable
from datetime import date, datetime, time, timedelta
from typing import Any

from app.contracts import Goal
from app.rules.types import Finding, RuleContext

BETA_BLOCKERS = ("metoprolol", "atenolol", "propranolol", "carvedilol", "bisoprolol")
BETA_WORKOUT_HR = 115

COOLDOWNS: dict[str, timedelta] = {
    "workout_detected": timedelta(hours=2),
    "illness_onset": timedelta(hours=24),
    "low_spo2": timedelta(hours=6),
    "inactivity": timedelta(hours=3),
    "goal_pace": timedelta(hours=20),
    "high_bp": timedelta(hours=24),
    "sleep_debt": timedelta(hours=48),
    "recovery": timedelta(hours=24),
    "low_hr": timedelta(hours=6),
}
MAX_PER_DAY: dict[str, int] = {"inactivity": 2}


def is_beta_blocker_user(twin: dict[str, Any]) -> bool:
    for med in twin.get("medications") or []:
        text = f"{med.get('class', '')} {med.get('display', '')} {med.get('name', '')}".lower()
        if any(n in text for n in BETA_BLOCKERS) or "beta blocker" in text or "beta-blocker" in text:
            return True
    return False


def is_hypertensive(twin: dict[str, Any]) -> bool:
    if "hypertension" in [str(f).lower() for f in twin.get("risk_flags") or []]:
        return True
    return any("hypertens" in str(c.get("display", "")).lower() for c in twin.get("conditions") or [])


def thresholds(twin: dict[str, Any]) -> dict[str, Any]:
    t = twin.get("thresholds") or {}
    workout_hr = t.get("workout_hr", 135)
    if is_beta_blocker_user(twin):
        workout_hr = min(workout_hr, BETA_WORKOUT_HR)
    return {
        "rhr_delta_warn": t.get("rhr_delta_warn", 6 if is_hypertensive(twin) else 8),
        "spo2_warn": t.get("spo2_warn", 92),
        "bp_warn": list(t.get("bp_warn") or (130, 80)),
        "workout_hr": workout_hr,
        "inactivity_steps_3h": t.get("inactivity_steps_3h", 200),
        "low_hr": t.get("low_hr", 40),
    }


def _window(ctx: RuleContext, metric: str, minutes: int) -> list[float]:
    start = ctx.now - timedelta(minutes=minutes)
    return [v for ts, v in ctx.series.get(metric, []) if start < ts <= ctx.now]


def _daily(ctx: RuleContext, metric: str, day: date, field: str = "avg") -> float | None:
    row = ctx.daily.get(metric, {}).get(day)
    if row is None:
        return None
    value = getattr(row, field)
    if value is None and field == "sum":
        value = row.avg
    return value


def _goal(ctx: RuleContext, metric: str, period: str = "day") -> Goal | None:
    for g in ctx.goals:
        if g.active and g.metric == metric and g.period == period:
            return g
    return None


def _baseline(ctx: RuleContext, key: str) -> float | None:
    return (ctx.twin.get("baselines") or {}).get(key)


def _earlier(t: time, minutes: int = 60) -> time:
    return (datetime.combine(datetime(2000, 1, 1), t) - timedelta(minutes=minutes)).time()


def _block(ctx: RuleContext, start: time, end: time, step_min: int = 15) -> tuple[datetime, datetime]:
    """Next block from start to end in local time. If the block began already, it starts at the next step."""
    now = ctx.local_now
    s = datetime.combine(now.date(), start, tzinfo=ctx.zone)
    dur = (datetime.combine(now.date(), end) - datetime.combine(now.date(), start)) % timedelta(hours=24)
    if dur == timedelta(0):
        dur = timedelta(hours=8)
    e = s + dur
    if e <= now:
        s, e = s + timedelta(days=1), e + timedelta(days=1)
    if s < now:
        s = now.replace(second=0, microsecond=0)
        s += timedelta(minutes=step_min - s.minute % step_min)
    return s, e


def r1_workout(ctx: RuleContext) -> Finding | None:
    thr = thresholds(ctx.twin)["workout_hr"]
    high = [v for v in _window(ctx, "heart_rate", 15) if v >= thr]
    if len(high) < 10:
        return None
    return Finding("workout_detected", "nudge", {
        "duration_min": len(high), "peak_hr": round(max(high)), "threshold": thr,
        "beta_blocker": is_beta_blocker_user(ctx.twin)})


def r_low_hr(ctx: RuleContext) -> Finding | None:
    if is_beta_blocker_user(ctx.twin):
        return None
    thr = thresholds(ctx.twin)["low_hr"]
    low = [v for v in _window(ctx, "heart_rate", 15) if v < thr]
    if len(low) < 10:
        return None
    return Finding("low_hr", "warning", {"min_hr": round(min(low)), "minutes": len(low), "threshold": thr})


def _when(ctx: RuleContext, dt: datetime) -> str:
    """Local time in words, e.g. 'tomorrow at 2:00 PM', so the LLM never does date math."""
    local = dt.astimezone(ctx.zone)
    days = (local.date() - ctx.local_now.date()).days
    day = {0: "today", 1: "tomorrow"}.get(days, local.strftime("%A"))
    if days == 0 and local.hour >= 18:
        day = "tonight"
    return f"{day} at {local.strftime('%I:%M %p').lstrip('0')}"


def r2_illness(ctx: RuleContext) -> Finding | None:
    base = _baseline(ctx, "resting_hr")
    today = ctx.local_now.date()
    rhr = _daily(ctx, "resting_heart_rate", today)
    if base is None or rhr is None:
        return None
    delta = rhr - base
    if delta < thresholds(ctx.twin)["rhr_delta_warn"]:
        return None
    sleep = None
    for d in (today, today - timedelta(days=1)):
        sleep = _daily(ctx, "sleep_total_min", d, "sum")
        if sleep is not None:
            break
    hrv = _daily(ctx, "hrv_sdnn", today)
    hrv_base = _baseline(ctx, "hrv_sdnn")
    short_sleep = sleep is not None and sleep < 360
    low_hrv = hrv is not None and hrv_base is not None and hrv < 0.8 * hrv_base
    if not (short_sleep or low_hrv):
        return None
    facts: dict[str, Any] = {
        "rhr_today": round(rhr), "rhr_baseline": round(base), "rhr_delta": round(delta),
        "sleep_min": None if sleep is None else round(sleep),
        "hrv": None if hrv is None else round(hrv), "hrv_baseline": hrv_base,
        "triggers": [n for n, on in (("short_sleep", short_sleep), ("low_hrv", low_hrv)) if on]}
    events = sorted((e for e in ctx.events
                     if e.is_important and ctx.now <= e.starts_at <= ctx.now + timedelta(hours=48)),
                    key=lambda e: e.starts_at)
    proposal = None
    if events:
        ev = events[0]
        hours = round((ev.starts_at - ctx.now).total_seconds() / 3600)
        facts.update(event_title=ev.title, event_in_h=hours, event_when=_when(ctx, ev.starts_at))
        s, e = _block(ctx, ctx.bed_time or time(22, 0), ctx.wake_time or time(6, 0))
        facts["block_when"] = f"{_when(ctx, s)} to {e.astimezone(ctx.zone).strftime('%I:%M %p').lstrip('0')}"
        proposal = {
            "title": "Sleep block (Pulse)", "starts_at": s.isoformat(), "ends_at": e.isoformat(),
            "rationale": (f"Resting heart rate is {facts['rhr_today']} bpm, {facts['rhr_delta']} above your "
                          f"baseline of {facts['rhr_baseline']}. You have '{ev.title}' in {hours} h. "
                          "A full night of sleep can help you recover.")}
    return Finding("illness_onset", "warning", facts, proposal)


def r3_spo2(ctx: RuleContext) -> Finding | None:
    warn = thresholds(ctx.twin)["spo2_warn"]
    last = _window(ctx, "spo2", 30)[-2:]
    if len(last) < 2 or not all(v < warn for v in last):
        return None
    low = min(last)
    return Finding("low_spo2", "urgent" if low < 88 else "warning", {
        "readings": [round(v) for v in last], "min_spo2": round(low), "threshold": warn})


def r4_inactivity(ctx: RuleContext) -> Finding | None:
    if not (time(9, 0) <= ctx.local_now.time() < time(20, 0)):
        return None
    covered = [ts for m in ("heart_rate", "steps") for ts, _ in ctx.series.get(m, [])]
    if not covered or min(covered) > ctx.now - timedelta(minutes=150):
        return None
    steps = sum(_window(ctx, "steps", 180))
    thr = thresholds(ctx.twin)["inactivity_steps_3h"]
    if steps >= thr:
        return None
    return Finding("inactivity", "nudge", {"steps_3h": round(steps), "threshold": thr})


def r5_goal_pace(ctx: RuleContext) -> Finding | None:
    local = ctx.local_now
    if not (time(18, 0) <= local.time() < time(22, 0)):
        return None
    goal = _goal(ctx, "steps")
    steps = _daily(ctx, "steps", local.date(), "sum")
    if goal is None or goal.direction != "at_least" or steps is None or goal.target <= 0:
        return None
    pct = steps / goal.target
    if pct >= 0.6:
        return None
    return Finding("goal_pace", "nudge", {
        "steps": round(steps), "goal": round(goal.target), "remaining": round(goal.target - steps),
        "pct": round(pct * 100)})


def r6_high_bp(ctx: RuleContext) -> Finding | None:
    sys_warn, dia_warn = thresholds(ctx.twin)["bp_warn"]
    start = ctx.now - timedelta(hours=24)
    sys_by_ts = {ts: v for ts, v in ctx.series.get("bp_systolic", []) if start < ts <= ctx.now}
    dia_by_ts = {ts: v for ts, v in ctx.series.get("bp_diastolic", []) if start < ts <= ctx.now}
    high = [ts for ts in sorted(set(sys_by_ts) | set(dia_by_ts))
            if sys_by_ts.get(ts, 0) >= sys_warn or dia_by_ts.get(ts, 0) >= dia_warn]
    if len(high) < 2:
        return None
    sys_vals = [sys_by_ts[ts] for ts in high if ts in sys_by_ts]
    dia_vals = [dia_by_ts[ts] for ts in high if ts in dia_by_ts]
    return Finding("high_bp", "warning", {
        "count": len(high), "max_systolic": round(max(sys_vals)) if sys_vals else None,
        "max_diastolic": round(max(dia_vals)) if dia_vals else None, "threshold": [sys_warn, dia_warn],
        "hypertension": is_hypertensive(ctx.twin)})


def r7_sleep_debt(ctx: RuleContext) -> Finding | None:
    goal = _goal(ctx, "sleep_total_min")
    target = goal.target if goal is not None else _baseline(ctx, "sleep_min")
    if target is None:
        return None
    today = ctx.local_now.date()
    vals: list[float] = []
    for back in range(5):
        v = _daily(ctx, "sleep_total_min", today - timedelta(days=back), "sum")
        if v is not None:
            vals.append(v)
        if len(vals) == 3:
            break
    if len(vals) < 3:
        return None
    avg = sum(vals) / 3
    if avg >= target - 60:
        return None
    s, e = _block(ctx, _earlier(ctx.bed_time or time(22, 0)), ctx.wake_time or time(6, 0))
    facts = {"avg_sleep_min": round(avg), "target_min": round(target), "debt_min": round(target - avg)}
    return Finding("sleep_debt", "nudge", facts, {
        "title": "Earlier bedtime (Pulse)", "starts_at": s.isoformat(), "ends_at": e.isoformat(),
        "rationale": (f"Your 3-day average sleep is {facts['avg_sleep_min']} min against a goal of "
                      f"{facts['target_min']} min. An earlier bedtime tonight can close the gap.")})


def r8_recovery(ctx: RuleContext) -> Finding | None:
    base = _baseline(ctx, "resting_hr")
    if ctx.twin.get("status") != "possibly_ill" or base is None:
        return None
    today = ctx.local_now.date()
    if any(k == "illness_onset" and at.astimezone(ctx.zone).date() >= today - timedelta(days=1)
           for k, at in ctx.recent_alerts):
        return None
    now_v = _daily(ctx, "resting_heart_rate", today)
    prev_v = _daily(ctx, "resting_heart_rate", today - timedelta(days=1))
    if now_v is None or prev_v is None or now_v > base + 3 or prev_v > base + 3:
        return None
    return Finding("recovery", "info", {
        "rhr_today": round(now_v), "rhr_yesterday": round(prev_v), "rhr_baseline": round(base)})


RULES: list[Callable[[RuleContext], Finding | None]] = [
    r1_workout, r2_illness, r3_spo2, r4_inactivity, r5_goal_pace, r6_high_bp, r7_sleep_debt, r8_recovery,
    r_low_hr,
]


def _cooling(ctx: RuleContext, kind: str) -> bool:
    cd = COOLDOWNS[kind]
    if any(k == kind and ctx.now - ts < cd for k, ts in ctx.recent_alerts):
        return True
    cap = MAX_PER_DAY.get(kind)
    if cap is not None:
        today = ctx.local_now.date()
        n = sum(1 for k, ts in ctx.recent_alerts if k == kind and ts.astimezone(ctx.zone).date() == today)
        return n >= cap
    return False


def evaluate(ctx: RuleContext) -> list[Finding]:
    findings = []
    for rule in RULES:
        f = rule(ctx)
        if f is not None and not _cooling(ctx, f.kind):
            findings.append(f)
    return findings

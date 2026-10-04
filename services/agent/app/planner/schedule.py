"""Fit a person's chosen focus areas into the free windows of a day, and pick a bedtime. Pure code."""

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from .shape import MIN_FREE_MIN, Slot

GAP_MIN = 10  # space left between two planned items
SAME_KIND_APART_MIN = 60  # repeat blocks of one kind are spread out when the day allows it
WIND_DOWN_MIN = 30
FALL_ASLEEP_MIN = 15
PREP_BEFORE_FIRST_EVENT_MIN = 90
DEFAULT_SLEEP_NEED_MIN = 450
EARLIEST_WAKE = time(5, 0)
WIND_DOWN_FOCUS = ("sleep", "unplug", "routine")


@dataclass(frozen=True)
class Template:
    title: str
    minutes: dict[str, int]  # by load; 0 means skip on that kind of day
    prefer: tuple[tuple[int, int], ...]  # local hour ranges, best first
    why: str
    repeat: dict[str, int]  # blocks per day, by load
    strict: bool = False  # only inside the preferred hours; skip the day rather than place it elsewhere


def _t(
    title: str, light: int, normal: int, packed: int, prefer, why: str, repeat=(1, 1, 1), strict=False
) -> Template:
    return Template(
        title,
        {"light": light, "normal": normal, "packed": packed},
        tuple(prefer),
        why,
        {"light": repeat[0], "normal": repeat[1], "packed": repeat[2]},
        strict,
    )


TEMPLATES: dict[str, Template] = {
    "steps": _t(
        "Walk", 30, 20, 10, [(12, 14), (15, 17), (8, 10)], "Steps add up, and fresh air clears your head."
    ),
    "workouts": _t(
        "Workout",
        45,
        30,
        15,
        [(16, 19), (7, 9), (12, 14)],
        "Regular movement is the habit you picked. Shorter is fine on a busy day.",
    ),
    "study": _t(
        "Study block",
        50,
        45,
        30,
        [(9, 12), (14, 17), (19, 21)],
        "Focused time, protected before the day fills up.",
        repeat=(3, 2, 1),
    ),
    "stress": _t(
        "Breathing break",
        10,
        10,
        10,
        [(14, 16), (10, 12)],
        "Five slow minutes between things resets your stress.",
    ),
    "balance": _t(
        "Take a real break",
        20,
        20,
        20,
        [(12, 14), (15, 17)],
        "Rest between busy stretches keeps the rest of the day sharper.",
    ),
    "heart": _t(
        "Easy heart-health walk",
        20,
        15,
        10,
        [(12, 14), (17, 19)],
        "A gentle walk is good for your heart without wearing you out.",
    ),
    "hydration": _t(
        "Drink a glass of water",
        5,
        5,
        5,
        [(9, 11), (13, 15), (16, 18)],
        "Small sips through the day beat catching up at night.",
        repeat=(4, 3, 2),
        strict=True,
    ),
    "sun": _t(
        "Put on sunscreen (SPF 30 or higher)",
        10,
        10,
        10,
        [(8, 10)],
        "Daily sun protection is the habit that matters most for your skin.",
    ),
    "sun_reapply": _t(
        "Reapply sunscreen if you are outside",
        5,
        5,
        5,
        [(12, 15)],
        "Sunscreen wears off in about two hours outdoors. Shade and a hat help too.",
        strict=True,
    ),
    "skin_check": _t(
        "Monthly skin check, head to toe",
        15,
        15,
        15,
        [(18, 21), (9, 12)],
        "Look for new or changing spots, and tell your dermatologist about anything that is different.",
    ),
}

# Hydration reminders are left out for people who are told to limit fluids.
FLUID_LIMITED = {"heart_failure", "ckd"}
SUN_KEYS = ("sun", "sun_reapply")


def planned_keys(picks: list[str], flags: set[str], day: date) -> list[str]:
    """The person's picks, plus the sun items for anyone with a history of skin cancer.

    Sun protection is standing care for that history whether or not it was picked. A skin check is added on
    the first Sunday of the month.
    """
    keys = [k for k in picks if not (k == "hydration" and flags & FLUID_LIMITED)]
    sun_on = "sun" in picks or "skin_cancer" in flags
    if sun_on:
        keys += [k for k in SUN_KEYS if k not in keys]
        if day.weekday() == 6 and day.day <= 7:
            keys.append("skin_check")
    return keys


@dataclass(frozen=True)
class PlanItem:
    key: str
    title: str
    start: datetime
    end: datetime
    why: str


def _subtract(slots: list[Slot], start: datetime, end: datetime, pad_min: int = GAP_MIN) -> list[Slot]:
    pad = timedelta(minutes=pad_min)
    lo, hi = start - pad, end + pad
    out: list[Slot] = []
    for s in slots:
        if s.end <= lo or s.start >= hi:
            out.append(s)
            continue
        if s.start < lo:
            out.append(Slot(s.start, lo))
        if s.end > hi:
            out.append(Slot(hi, s.end))
    return [s for s in out if s.minutes >= MIN_FREE_MIN]


def _choose(
    slots: list[Slot], minutes: int, prefer: tuple[tuple[int, int], ...], strict: bool = False
) -> tuple[datetime, datetime] | None:
    """Earliest fit inside the best preferred hour range, else (unless strict) the earliest slot that fits."""
    need = timedelta(minutes=minutes)
    for lo_h, hi_h in prefer:
        for s in slots:
            lo = max(s.start, s.start.replace(hour=lo_h, minute=0, second=0, microsecond=0))
            hi = min(s.end, s.start.replace(hour=hi_h, minute=0, second=0, microsecond=0))
            if hi - lo >= need:
                return lo, lo + need
    if strict:
        return None
    for s in slots:
        if s.end - s.start >= need:
            return s.start, s.start + need
    return None


def place(focus: list[str], slots: list[Slot], load: str) -> list[PlanItem]:
    """Greedy: the person's first pick gets first choice of time. Skips what does not fit."""
    items: list[PlanItem] = []
    free = list(slots)
    for key in focus:
        tpl = TEMPLATES.get(key)
        if tpl is None:
            continue
        minutes = tpl.minutes[load]
        spread = list(free)  # the same free time, with room kept around blocks of this kind already placed
        for _ in range(tpl.repeat[load]):
            spot = _choose(spread, minutes, tpl.prefer, tpl.strict) or _choose(
                free, minutes, tpl.prefer, tpl.strict
            )
            if spot is None:
                break
            start, end = spot
            items.append(PlanItem(key, tpl.title, start, end, tpl.why))
            free = _subtract(free, start, end)
            spread = _subtract(spread, start, end, SAME_KIND_APART_MIN)
    return sorted(items, key=lambda i: i.start)


@dataclass(frozen=True)
class Night:
    bed: datetime
    wake: datetime
    shifted_min: int  # how much earlier than usual
    reason: str


def _round_down(dt: datetime, step: int = 15) -> datetime:
    return dt.replace(minute=dt.minute - dt.minute % step, second=0, microsecond=0)


def night_plan(
    day: date,
    tz: str,
    first_start: datetime | None,
    usual_bed: time,
    usual_wake: time,
    sleep_need_min: int | None,
) -> Night:
    """Bedtime for the night that ends day `day`, given the first timed event of the next morning.

    A late start keeps the usual bedtime; an early start moves bedtime earlier so the sleep need still fits.
    """
    zone = ZoneInfo(tz)
    need = sleep_need_min or DEFAULT_SLEEP_NEED_MIN
    next_day = day + timedelta(days=1)
    wake = datetime.combine(next_day, usual_wake, tzinfo=zone)
    reason = "Nothing early tomorrow."
    if first_start is not None and first_start.time() < time(11, 0):
        needed_wake = first_start - timedelta(minutes=PREP_BEFORE_FIRST_EVENT_MIN)
        floor = datetime.combine(next_day, EARLIEST_WAKE, tzinfo=zone)
        if needed_wake < wake:
            wake = max(needed_wake, floor)
        reason = f"You start at {first_start.strftime('%-I:%M %p').lower()} tomorrow."
    usual_bed_day = next_day if usual_bed < time(12, 0) else day
    usual = datetime.combine(usual_bed_day, usual_bed, tzinfo=zone)
    wanted = _round_down(wake - timedelta(minutes=need + FALL_ASLEEP_MIN))
    bed = min(usual, wanted)
    return Night(bed, wake, max(0, int((usual - bed).total_seconds() // 60)), reason)


def wind_down(focus: list[str], night: Night) -> PlanItem | None:
    """One evening event when the person picked sleep, unplug, or routine."""
    if not any(k in focus for k in WIND_DOWN_FOCUS):
        return None
    start = night.bed - timedelta(minutes=WIND_DOWN_MIN)
    clock = night.bed.strftime("%-I:%M %p").lower()
    parts = []
    if "unplug" in focus:
        parts.append("Screens off.")
    if "routine" in focus:
        parts.append("Same time as always keeps your body clock steady.")
    parts.append(f"Lights out by {clock}. {night.reason}")
    return PlanItem("wind_down", f"Wind down, lights out {clock}", start, night.bed, " ".join(parts))

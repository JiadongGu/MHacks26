"""Plain-language text for a plan. Pure code. No targets or scores, just what to do and when."""

from datetime import datetime

from app.focus.catalog import BY_KEY

HEADLINES = {
    "light": "{when} looks open.",
    "normal": "{when} is a steady day.",
    "packed": "{when} is a busy one with few gaps.",
}
PACKED_NOTE = "Keep it light: a short walk or a few slow breaths counts."


def clock(dt: datetime) -> str:
    return dt.strftime("%-I:%M %p").lower()


def headline(load: str, when: str) -> str:
    return HEADLINES[load].format(when=when.capitalize())


def item_line(title: str, start: datetime) -> str:
    return f"• {clock(start)} {title[0].lower()}{title[1:]}"


WHY = {
    "light": "Your day is open, so there is room to fit things in comfortably.",
    "normal": "Your day has a few events, so everything is fitted around them.",
    "packed": "Your day is packed, so I kept it short.",
}


def why_text(load: str, shifted_min: int, reason: str) -> str:
    """One or two sentences on why the plan looks the way it does."""
    parts = [WHY[load]]
    if shifted_min > 0 and reason:
        parts.append(f"Lights out is {shifted_min} minutes earlier than usual. {reason}")
    return " ".join(parts)


def plan_text(
    when: str, load: str, items: list[dict], bed: datetime | None, shifted_min: int, calendar_written: bool
) -> str:
    """Plain lines: a headline, one bullet per item, then bedtime and where it was saved. No scores."""
    day_items = [i for i in items if i["key"] != "wind_down"]
    lines = [headline(load, when) + (" Here is the plan:" if day_items else "")]
    lines += [item_line(i["title"], i["start"]) for i in day_items]
    if load == "packed":
        lines.append(PACKED_NOTE)
    if bed is not None and (shifted_min > 0 or any(i["key"] == "wind_down" for i in items)):
        lines.append(f"Lights out by {clock(bed)}.")
    if calendar_written and items:
        lines.append("Added to your Pulse Health calendar.")
    return "\n".join(lines)


def _count(n: int, one: str, many: str) -> str:
    return one if n == 1 else f"{n} {many}"


def _plural_has(keys: list[str], items: list[dict]) -> int:
    return sum(1 for i in items if i["key"] in keys)


# What each focus area looks like today, with no clock times. The calendar and Today's plan hold the times.
def _summary(key: str, items: list[dict], bed: datetime | None) -> str | None:
    n = lambda *keys: _plural_has(list(keys), items)  # noqa: E731
    if key in ("sleep", "unplug", "routine"):
        has_wind = any(i["key"] == "wind_down" for i in items)
        if bed is not None and has_wind:
            return f"a wind-down, lights out around {clock(bed)}"
        return None
    if key == "steps" and n("steps"):
        return _count(n("steps"), "a walk", "walks")
    if key == "workouts" and n("workouts"):
        return _count(n("workouts"), "a workout", "workouts")
    if key == "heart" and n("heart"):
        return "an easy heart-health walk"
    if key == "stress" and n("stress"):
        return "a breathing break"
    if key == "balance" and n("balance"):
        return "a real break"
    if key == "study" and n("study"):
        return _count(n("study"), "a study block", "study blocks")
    if key == "hydration" and n("hydration"):
        return _count(n("hydration"), "a water reminder", "water reminders")
    if key == "sun":
        parts = []
        if n("sun"):
            parts.append("sunscreen")
        if n("sun_reapply"):
            parts.append("a reapply")
        if n("skin_check"):
            parts.append("a skin check")
        return ", ".join(parts) if parts else None
    return None


def focus_lines(picks: list[str], items: list[dict], bed: datetime | None) -> list[str]:
    """One bullet per focus area: its name and what is planned for it, in broad terms. Sun care is added
    when the plan holds sun items even if it was not picked."""
    keys = [k for k in picks if k in BY_KEY]
    if "sun" not in keys and any(i["key"] in ("sun", "sun_reapply", "skin_check") for i in items):
        keys.append("sun")
    out = []
    for key in keys:
        what = _summary(key, items, bed)
        out.append(f"• {BY_KEY[key].label}: {what if what else 'nothing scheduled today'}")
    extras = [i["key"] for i in items if i["key"] in ("move", "break")]
    if "move" in extras:
        out.append("• Also: a short workout to break up the day")
    elif "break" in extras:
        out.append("• Also: a stretch and water break between blocks")
    return out

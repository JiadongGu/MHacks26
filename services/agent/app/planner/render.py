"""Plain-language text for a plan. Pure code. No targets or scores, just what to do and when."""

from datetime import datetime

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

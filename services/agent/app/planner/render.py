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
    return f"{clock(start)} {title[0].lower()}{title[1:]}"


def plan_text(
    when: str, load: str, items: list[dict], bed: datetime | None, shifted_min: int, calendar_written: bool
) -> str:
    """`items` hold title, start (datetime) and key. The wind-down item is covered by the bedtime line."""
    parts = [headline(load, when)]
    day_items = [i for i in items if i["key"] != "wind_down"]
    if day_items:
        parts.append("Plan: " + "; ".join(item_line(i["title"], i["start"]) for i in day_items) + ".")
    if load == "packed":
        parts.append(PACKED_NOTE)
    if bed is not None and (shifted_min > 0 or any(i["key"] == "wind_down" for i in items)):
        parts.append(f"Aim for lights out by {clock(bed)}.")
    if calendar_written and items:
        parts.append("I added these to your Pulse Health calendar.")
    return " ".join(parts)

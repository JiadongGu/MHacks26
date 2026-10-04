"""Pulse's calendar color scheme. Every planned item belongs to one category, and each category has one color.

The Google color ids and the hex values below are Google Calendar's own event palette, so the dashboard shows
the same color a person sees in their calendar. Yellow (banana) is never used.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Category:
    label: str
    color_id: str  # Google Calendar event colorId
    hex: str  # that color as Google draws it
    blurb: str


CATEGORIES: dict[str, Category] = {
    "mental": Category("Mental focus", "9", "#5484ed", "Study and deep work."),
    "physical": Category("Physical", "10", "#51b749", "Walks, workouts and movement."),
    "calm": Category("Calm and rest", "1", "#a4bdfc", "Breaks, breathing and downtime."),
    "sleep": Category("Sleep", "3", "#dbadff", "Wind-down and lights out."),
    "health": Category("Skin and health", "6", "#ffb878", "Sunscreen and skin checks."),
    "self_care": Category("Self-care", "7", "#46d6db", "Water and everyday upkeep."),
}

KEY_CATEGORY: dict[str, str] = {
    "study": "mental",
    "steps": "physical",
    "workouts": "physical",
    "heart": "physical",
    "move": "physical",
    "stress": "calm",
    "balance": "calm",
    "break": "calm",
    "wind_down": "sleep",
    "sun": "health",
    "sun_reapply": "health",
    "skin_check": "health",
    "hydration": "self_care",
}
DEFAULT_CATEGORY = "self_care"


def category_of(key: str) -> str:
    return KEY_CATEGORY.get(key, DEFAULT_CATEGORY)


def color_id_for(key: str) -> str:
    return CATEGORIES[category_of(key)].color_id

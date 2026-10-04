"""Mark a planned item as done. Pure code, no I/O."""

from datetime import datetime
from typing import Any


def mark_done(items: list[dict[str, Any]], start: datetime, done: bool) -> tuple[list[dict[str, Any]], bool]:
    """Set `done` on the item that starts at `start`. Returns the new list and whether one matched.

    Items are matched by start time, not position, because a replan can reorder or replace the list.
    """
    out: list[dict[str, Any]] = []
    found = False
    for item in items:
        try:
            same = datetime.fromisoformat(item["start"]) == start
        except (KeyError, ValueError, TypeError):
            same = False
        if same and not found:
            found = True
            out.append({**item, "done": done})
        else:
            out.append(item)
    return out, found

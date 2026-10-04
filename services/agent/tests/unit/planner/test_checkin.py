from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from app.planner import checkin

A = {"key": "study", "title": "Study", "start": "2026-10-04T14:10:00+00:00",
     "end": "2026-10-04T15:00:00+00:00"}
B = {"key": "steps", "title": "Walk", "start": "2026-10-04T16:00:00+00:00",
     "end": "2026-10-04T16:30:00+00:00"}


def test_marks_only_the_item_that_starts_then_and_matches_across_offsets():
    detroit = datetime(2026, 10, 4, 10, 10, tzinfo=ZoneInfo("America/Detroit"))
    items, found = checkin.mark_done([A, B], detroit, True)
    assert found and items[0]["done"] is True and "done" not in items[1]
    items, found = checkin.mark_done(items, datetime(2026, 10, 4, 14, 10, tzinfo=UTC), False)
    assert found and items[0]["done"] is False


def test_no_match_changes_nothing():
    items, found = checkin.mark_done([A], datetime(2026, 10, 4, 9, 0, tzinfo=UTC), True)
    assert not found and items == [A]


def test_odd_items_do_not_break_it():
    odd = [{"title": "no start"}, A]
    items, found = checkin.mark_done(odd, datetime(2026, 10, 4, 14, 10, tzinfo=UTC), True)
    assert found and items[1]["done"] is True

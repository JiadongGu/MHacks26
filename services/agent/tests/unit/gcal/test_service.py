from datetime import UTC, datetime

from app.integrations.gcal.service import is_important, proposal_to_event_body, to_event


def test_importance_by_title():
    assert is_important("CS Midterm Exam")
    assert not is_important("Lunch")


def test_importance_by_attendees():
    assert is_important("Sync", attendee_count=3)
    assert not is_important("Sync", attendee_count=2)


def test_to_event_timed_and_all_day():
    timed = to_event(
        {
            "id": "a",
            "summary": "Flight",
            "start": {"dateTime": "2026-10-05T09:00:00+00:00"},
            "end": {"dateTime": "2026-10-05T11:00:00+00:00"},
        }
    )
    assert timed.is_important and not timed.all_day
    day = to_event({"id": "b", "start": {"date": "2026-10-05"}, "end": {"date": "2026-10-06"}})
    assert day.all_day and day.title == "(no title)"


def test_proposal_body():
    s = datetime(2026, 10, 5, 22, tzinfo=UTC)
    e = datetime(2026, 10, 6, 6, tzinfo=UTC)
    body = proposal_to_event_body("Sleep block", s, e, "RHR up")
    assert body["summary"] == "Sleep block"
    assert "Created by Pulse with your approval." in body["description"]
    assert body["start"]["dateTime"] == s.isoformat()

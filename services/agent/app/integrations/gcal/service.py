import re
from datetime import UTC, datetime, timedelta

from googleapiclient.discovery import build

from app.contracts import CalendarEvent
from app.planner.categories import color_id_for

HEALTH_CALENDAR_NAME = "Pulse Health"
IMPORTANT_RE = re.compile(r"exam|interview|flight|presentation|race|final|midterm|deadline|wedding", re.I)


def is_important(title: str, attendee_count: int = 0) -> bool:
    return bool(IMPORTANT_RE.search(title)) or attendee_count >= 3


def _parse(value: dict) -> tuple[datetime, bool]:
    if "dateTime" in value:
        return datetime.fromisoformat(value["dateTime"]), False
    return datetime.fromisoformat(value["date"]).replace(tzinfo=UTC), True


def to_event(item: dict) -> CalendarEvent:
    starts_at, all_day = _parse(item["start"])
    ends_at, _ = _parse(item["end"])
    title = item.get("summary", "(no title)")
    return CalendarEvent(
        event_id=item["id"],
        title=title,
        starts_at=starts_at,
        ends_at=ends_at,
        is_important=is_important(title, len(item.get("attendees", []))),
        all_day=all_day,
    )


def proposal_to_event_body(title: str, starts_at: datetime, ends_at: datetime, rationale: str) -> dict:
    return {
        "summary": title,
        "description": f"{rationale}\n\nCreated by Pulse with your approval.",
        "start": {"dateTime": starts_at.isoformat()},
        "end": {"dateTime": ends_at.isoformat()},
    }


def _svc(creds):
    return build("calendar", "v3", credentials=creds, cache_discovery=False)


def primary_email(creds) -> str:
    return _svc(creds).calendars().get(calendarId="primary").execute()["id"]


def ensure_health_calendar(creds) -> str:
    svc = _svc(creds)
    for cal in svc.calendarList().list().execute().get("items", []):
        if cal.get("summary") == HEALTH_CALENDAR_NAME:
            return cal["id"]
    return svc.calendars().insert(body={"summary": HEALTH_CALENDAR_NAME}).execute()["id"]


def list_upcoming(creds, hours: int = 48) -> list[CalendarEvent]:
    now = datetime.now(UTC)
    resp = (
        _svc(creds)
        .events()
        .list(
            calendarId="primary",
            timeMin=now.isoformat(),
            timeMax=(now + timedelta(hours=hours)).isoformat(),
            singleEvents=True,
            orderBy="startTime",
        )
        .execute()
    )
    return [to_event(i) for i in resp.get("items", []) if i.get("status") != "cancelled"]


def freebusy(creds, start: datetime, end: datetime) -> list[dict]:
    body = {"timeMin": start.isoformat(), "timeMax": end.isoformat(), "items": [{"id": "primary"}]}
    return _svc(creds).freebusy().query(body=body).execute()["calendars"]["primary"]["busy"]


def insert_proposal_event(
    creds, calendar_id: str, title: str, starts_at: datetime, ends_at: datetime, rationale: str
) -> str:
    body = proposal_to_event_body(title, starts_at, ends_at, rationale)
    return _svc(creds).events().insert(calendarId=calendar_id, body=body).execute()["id"]


def delete_event(creds, calendar_id: str, event_id: str) -> None:
    _svc(creds).events().delete(calendarId=calendar_id, eventId=event_id).execute()


PLAN_PROP = "pulse_plan"


def replace_plan_events(
    creds, calendar_id: str, day_key: str, keep_before: datetime, items: list[dict]
) -> list[str]:
    """Replace one day's planned events that have not started yet. Events already in the past stay.

    Each event carries a private `pulse_plan=<day>` property so only Pulse's own events are ever touched.
    """
    svc = _svc(creds)
    page = None
    while True:
        resp = (
            svc.events()
            .list(
                calendarId=calendar_id,
                privateExtendedProperty=f"{PLAN_PROP}={day_key}",
                singleEvents=True,
                maxResults=250,
                pageToken=page,
            )
            .execute()
        )
        for e in resp.get("items", []):
            start = e.get("start", {}).get("dateTime")
            if start and datetime.fromisoformat(start) >= keep_before:
                svc.events().delete(calendarId=calendar_id, eventId=e["id"]).execute()
        page = resp.get("nextPageToken")
        if not page:
            break
    ids = []
    for it in items:
        body = {
            "summary": it["title"],
            "description": f"{it['why']}\n\nPlanned by Pulse around your calendar. Delete it any time.",
            "start": {"dateTime": it["start"].isoformat()},
            "end": {"dateTime": it["end"].isoformat()},
            "colorId": color_id_for(it["key"]),
            "reminders": {"useDefault": False, "overrides": [{"method": "popup", "minutes": 10}]},
            "extendedProperties": {"private": {PLAN_PROP: day_key, "pulse_kind": it["key"]}},
        }
        ids.append(svc.events().insert(calendarId=calendar_id, body=body).execute()["id"])
    return ids

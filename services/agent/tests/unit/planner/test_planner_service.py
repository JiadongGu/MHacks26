from datetime import UTC, date, datetime, time, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from app.integrations.gcal import service as gcal_service
from app.planner import render, service

UID = UUID("00000000-0000-0000-0000-000000000001")
TZ = "America/Detroit"
Z = ZoneInfo(TZ)
MON = date(2026, 10, 5)
NOW = datetime(2026, 10, 5, 12, 0, tzinfo=UTC)  # 08:00 Monday in Detroit


def at(h, m=0, day=MON):
    return datetime.combine(day, time(h, m), tzinfo=Z)


def ev(start, end, title="Meeting"):
    return {
        "title": title,
        "starts_at": start.astimezone(UTC),
        "ends_at": end.astimezone(UTC),
        "is_important": False,
    }


class World:
    """Fakes for every outside call build_plan makes."""

    def __init__(
        self,
        monkeypatch,
        picks=("steps", "study", "sleep"),
        events=None,
        tomorrow=None,
        connected=True,
        flags=(),
    ):
        self.events, self.tomorrow = events or [], tomorrow or []
        self.picks, self.connected = list(picks), connected
        self.saved, self.written, self.fail_calendar, self.previous = None, None, False, None
        self.refreshed = False
        self.flags = set(flags)

        async def load_profile(user_id):
            return {"timezone": TZ, "bed_time": time(23, 0), "wake_time": time(7, 0), "display_name": "Ada"}

        async def events_between(user_id, start, end):
            return self.events if start.date() == MON else self.tomorrow

        async def get_plan(user_id, day):
            return self.previous

        async def save_plan(user_id, day, load, headline, bed, wake, items):
            self.saved = {
                "day": day,
                "load": load,
                "headline": headline,
                "bed": bed,
                "wake": wake,
                "items": items,
            }

        async def list_picks(user_id):
            return self.picks

        async def risk_flags(user_id):
            return self.flags

        async def list_goals(user_id, include_inactive=False):
            return []

        async def refresh_user(user_id):
            self.refreshed = True
            return 0

        async def cal_load(user_id):
            return {"refresh_token": "r", "health_calendar_id": "cal-1"} if self.connected else None

        def credentials_for(refresh_token):
            return object()

        def replace_plan_events(creds, calendar_id, day_key, keep_before, items):
            if self.fail_calendar:
                raise RuntimeError("calendar down")
            self.written = {
                "calendar_id": calendar_id,
                "day_key": day_key,
                "keep_before": keep_before,
                "items": items,
            }
            return [f"evt-{n}" for n in range(len(items))]

        monkeypatch.setattr(service.store, "load_profile", load_profile)
        monkeypatch.setattr(service.store, "events_between", events_between)
        monkeypatch.setattr(service.store, "get_plan", get_plan)
        monkeypatch.setattr(service.store, "save_plan", save_plan)
        monkeypatch.setattr(service.focus_store, "list_picks", list_picks)
        monkeypatch.setattr(service, "_risk_flags", risk_flags)
        monkeypatch.setattr(service.goals_store, "list_goals", list_goals)
        monkeypatch.setattr(service.gcal_sync, "refresh_user", refresh_user)
        monkeypatch.setattr(service.gcal_store, "load", cal_load)
        monkeypatch.setattr(service.gcal_oauth, "credentials_for", credentials_for)
        monkeypatch.setattr(service.gcal_service, "replace_plan_events", replace_plan_events)


async def test_a_normal_day_is_planned_around_meetings_and_written_to_the_calendar(monkeypatch):
    w = World(monkeypatch, events=[ev(at(10), at(11)), ev(at(11, 30), at(12, 30)), ev(at(15), at(16))])
    plan = await service.build_plan(UID, MON, NOW)
    assert plan.load == "normal" and w.refreshed
    keys = [i["key"] for i in plan.items]
    assert keys.count("steps") == 1 and keys.count("study") == 2 and keys[-1] == "wind_down"
    meetings = [(at(10), at(11)), (at(11, 30), at(12, 30)), (at(15), at(16))]
    for item in plan.items:
        for m_start, m_end in meetings:
            assert item["end"] <= m_start or item["start"] >= m_end
    assert (
        plan.calendar_written and w.written["day_key"] == "2026-10-05" and w.written["calendar_id"] == "cal-1"
    )
    assert [i["event_id"] for i in plan.items] == [f"evt-{n}" for n in range(len(plan.items))]
    assert "I added these to your Pulse Health calendar." in plan.text
    assert w.saved["load"] == "normal" and len(w.saved["items"]) == len(plan.items)
    assert all(isinstance(i["start"], str) for i in w.saved["items"])  # stored as ISO text


async def test_all_day_events_do_not_block_the_day(monkeypatch):
    midnight = datetime(2026, 10, 5, tzinfo=UTC)
    holiday = {
        "title": "Holiday",
        "starts_at": midnight,
        "ends_at": midnight + timedelta(days=1),
        "is_important": False,
    }
    World(monkeypatch, events=[holiday])
    plan = await service.build_plan(UID, MON, NOW)
    assert plan.load == "light" and any(i["key"] == "steps" for i in plan.items)


async def test_an_early_start_tomorrow_brings_bedtime_forward(monkeypatch):
    tomorrow = MON + timedelta(days=1)
    w = World(monkeypatch, tomorrow=[ev(at(7, 0, tomorrow), at(8, 0, tomorrow), "Flight")])
    plan = await service.build_plan(UID, MON, NOW)
    assert plan.bed == at(21, 45) and plan.shifted_min == 75 and "7:00 am" in plan.reason
    assert "lights out by 9:45 pm" in plan.text.lower()
    wind = next(i for i in plan.items if i["key"] == "wind_down")
    assert (wind["start"], wind["end"]) == (at(21, 15), at(21, 45))
    assert w.saved["bed"] == "21:45" and w.saved["wake"] == "05:30"


async def test_a_busy_day_gets_a_lighter_plan_and_says_so(monkeypatch):
    meetings = [ev(at(9 + n, 0), at(9 + n, 50)) for n in range(7)]
    World(monkeypatch, events=meetings)
    plan = await service.build_plan(UID, MON, NOW)
    assert plan.load == "packed" and "busy one" in plan.text
    assert "Keep it light" in plan.text
    assert sum(1 for i in plan.items if i["key"] == "study") <= 1


async def test_planning_mid_day_only_uses_time_from_now_and_keeps_what_already_happened(monkeypatch):
    w = World(monkeypatch, picks=["steps", "study"])
    w.previous = {
        "items": [
            {
                "key": "study",
                "title": "Study block",
                "start": at(9).isoformat(),
                "end": at(9, 45).isoformat(),
                "why": "x",
            }
        ]
    }
    now = at(13, 0).astimezone(UTC)
    plan = await service.build_plan(UID, MON, now)
    assert all(i["start"] >= at(13, 20) for i in plan.items)
    saved = w.saved["items"]
    assert saved[0]["start"] == at(9).isoformat()  # the morning block is kept
    assert w.written["keep_before"] == now  # only events that have not started are replaced


async def test_without_a_calendar_connection_the_plan_is_still_made_and_saved(monkeypatch):
    w = World(monkeypatch, connected=False)
    plan = await service.build_plan(UID, MON, NOW)
    assert plan.items and not plan.calendar_written and w.written is None
    assert "Pulse Health calendar" not in plan.text and w.saved is not None


async def test_a_calendar_failure_never_stops_the_plan(monkeypatch):
    w = World(monkeypatch)
    w.fail_calendar = True
    plan = await service.build_plan(UID, MON, NOW)
    assert plan.items and not plan.calendar_written and w.saved is not None
    assert all(i.get("event_id") is None for i in plan.items)


async def test_write_calendar_false_plans_without_touching_the_calendar(monkeypatch):
    w = World(monkeypatch)
    plan = await service.build_plan(UID, MON, NOW, write_calendar=False)
    assert plan.items and w.written is None and not plan.calendar_written


async def test_no_focus_areas_means_no_events_but_a_saved_plan(monkeypatch):
    w = World(monkeypatch, picks=[])
    plan = await service.build_plan(UID, MON, NOW)
    assert plan.items == [] and w.saved["items"] == []


def test_plan_text_is_plain_and_has_no_scores():
    items = [
        {"key": "steps", "title": "Walk", "start": at(12, 40)},
        {"key": "study", "title": "Study block", "start": at(14)},
        {"key": "wind_down", "title": "Wind down", "start": at(22, 15)},
    ]
    text = render.plan_text("tomorrow", "normal", items, at(22, 45), 15, True)
    assert text == (
        "Tomorrow is a steady day. Plan: 12:40 pm walk; 2:00 pm study block. "
        "Aim for lights out by 10:45 pm. I added these to your Pulse Health calendar."
    )
    assert render.plan_text("today", "light", [], at(23), 0, False) == "Today looks open."


class FakeCalendar:
    """Just enough of the Google Calendar client to see what replace_plan_events asks for."""

    def __init__(self, existing):
        self.existing, self.deleted, self.inserted, self.list_args = existing, [], [], None

    def events(self):
        return self

    def list(self, **kw):
        self.list_args = kw
        return type("R", (), {"execute": lambda s: {"items": self.existing}})()

    def delete(self, calendarId, eventId):
        self.deleted.append(eventId)
        return type("R", (), {"execute": lambda s: None})()

    def insert(self, calendarId, body):
        self.inserted.append(body)
        event_id = f"new-{len(self.inserted)}"
        return type("R", (), {"execute": lambda s: {"id": event_id}})()


def test_replace_plan_events_deletes_only_unstarted_plan_events_and_inserts_the_new_ones(monkeypatch):
    now = at(13, 0)
    existing = [
        {"id": "past", "start": {"dateTime": at(9).isoformat()}},
        {"id": "future", "start": {"dateTime": at(15).isoformat()}},
        {"id": "allday", "start": {"date": "2026-10-05"}},
    ]
    cal = FakeCalendar(existing)
    monkeypatch.setattr(gcal_service, "_svc", lambda creds: cal)
    item = {"key": "steps", "title": "Walk", "why": "Fresh air.", "start": at(16), "end": at(16, 20)}
    ids = gcal_service.replace_plan_events(object(), "cal-1", "2026-10-05", now, [item])
    assert cal.deleted == ["future"]  # not the one in the past, not the all-day entry
    assert (
        cal.list_args["privateExtendedProperty"] == "pulse_plan=2026-10-05"
        and cal.list_args["calendarId"] == "cal-1"
    )
    assert ids == ["new-1"]
    body = cal.inserted[0]
    assert body["summary"] == "Walk" and body["start"]["dateTime"] == at(16).isoformat()
    assert body["extendedProperties"]["private"] == {"pulse_plan": "2026-10-05", "pulse_kind": "steps"}
    assert "Delete it any time" in body["description"] and body["reminders"]["useDefault"] is False


async def test_a_skin_cancer_history_adds_sunscreen_even_when_nothing_was_picked(monkeypatch):
    w = World(monkeypatch, picks=(), flags=("skin_cancer",))
    plan = await service.build_plan(UID, MON, NOW)
    titles = [i["title"] for i in plan.items]
    assert any(t.startswith("Put on sunscreen") for t in titles)
    assert any(t.startswith("Reapply sunscreen") for t in titles)
    morning = next(i for i in plan.items if i["key"] == "sun")
    reapply = next(i for i in plan.items if i["key"] == "sun_reapply")
    assert (reapply["start"] - morning["end"]).total_seconds() >= 2 * 3600
    assert w.saved is not None


async def test_hydration_is_left_out_for_someone_told_to_limit_fluids(monkeypatch):
    World(monkeypatch, picks=("hydration",), flags=("heart_failure",))
    assert (await service.build_plan(UID, MON, NOW)).items == []
    World(monkeypatch, picks=("hydration",))
    assert any(i["key"] == "hydration" for i in (await service.build_plan(UID, MON, NOW)).items)


def test_plan_events_are_coloured_and_never_the_default_yellow(monkeypatch):
    cal = FakeCalendar([])
    monkeypatch.setattr(gcal_service, "_svc", lambda creds: cal)
    items = [
        {"key": "study", "title": "Study", "why": "x", "start": at(10), "end": at(11)},
        {"key": "wind_down", "title": "Wind down", "why": "x", "start": at(22), "end": at(23)},
        {"key": "sun", "title": "Sunscreen", "why": "x", "start": at(8), "end": at(9)},
    ]
    gcal_service.replace_plan_events(object(), "cal-1", "2026-10-05", at(0), items)
    assert [b["colorId"] for b in cal.inserted] == ["7", "1", "6"]
    assert "5" not in {b["colorId"] for b in cal.inserted}  # 5 is banana yellow


async def test_build_plans_covers_today_and_tomorrow(monkeypatch):
    next_day = MON + timedelta(days=1)
    tomorrow = [ev(at(9, day=next_day), at(10, day=next_day))]
    w = World(monkeypatch, events=[ev(at(10), at(11))], tomorrow=tomorrow)
    plans = await service.build_plans(UID, NOW)
    assert [p.day for p in plans] == [MON, MON + timedelta(days=1)]
    assert w.saved["day"] == MON + timedelta(days=1)

from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from fastapi import HTTPException

from app.agents import compass
from app.agents.compass import UserRef

A = UUID(int=1)
B = UUID(int=2)
DETROIT = "America/Detroit"  # UTC-4 on 2026-10-14
TOKYO = "Asia/Tokyo"  # UTC+9


def utc(s: str) -> datetime:
    return datetime.fromisoformat(s).astimezone(UTC)


# ------------------------------------------------------------------ pure window logic


@pytest.mark.parametrize(("clock", "expected"), [
    ("2026-10-14T06:59:00", []), ("2026-10-14T07:00:00", ["briefing"]),
    ("2026-10-14T07:09:59", ["briefing"]), ("2026-10-14T07:10:00", []),
    ("2026-10-14T21:05:00", ["evening"]), ("2026-10-14T03:00:00", ["rebuild"]),
    ("2026-10-14T12:00:00", []),
])
def test_due_jobs_windows(clock, expected):
    assert compass.due_jobs(datetime.fromisoformat(clock)) == expected


def test_pending_runs_respects_each_users_time_zone():
    users = [UserRef(A, DETROIT), UserRef(B, TOKYO)]
    now = utc("2026-10-14T11:05:00+00:00")  # 07:05 Detroit, 20:05 Tokyo
    assert compass.pending_runs(users, now, set()) == [("briefing", A, "2026-10-14")]
    now = utc("2026-10-14T12:03:00+00:00")  # 21:03 Tokyo
    assert compass.pending_runs(users, now, set()) == [("evening", B, "2026-10-14")]


def test_pending_runs_is_idempotent_per_day():
    users = [UserRef(A, DETROIT)]
    now = utc("2026-10-14T11:05:00+00:00")
    done = {("briefing", A, "2026-10-14")}
    assert compass.pending_runs(users, now, done) == []
    # The next day has a new key.
    assert compass.pending_runs(users, now + timedelta(days=1), done) == [("briefing", A, "2026-10-15")]
    # Other users and other jobs do not block.
    assert compass.pending_runs(users, now, {("briefing", B, "2026-10-14")}) != []


def test_unknown_time_zone_uses_default():
    now = utc("2026-10-14T11:05:00+00:00")
    assert compass.pending_runs([UserRef(A, "Mars/Base")], now, set()) == [("briefing", A, "2026-10-14")]


def test_tomorrow_bounds():
    start, end = compass.tomorrow_bounds(compass.local_now(DETROIT, utc("2026-10-14T01:30:00+00:00")))
    assert start.isoformat() == "2026-10-14T00:00:00-04:00"  # local date is Oct 13
    assert end - start == timedelta(days=1)


# ------------------------------------------------------------------ pure text


FACTS = {
    "name": "Ada", "status": "possibly_ill", "sleep_min": 312.0, "sleep_goal_min": 450.0, "bed_time": "22:30",
    "goals": [{"metric": "steps", "period": "day", "direction": "at_least", "target": 8000.0,
               "current": 8200.0, "pct": 102.5, "on_track": True},
              {"metric": "sleep_total_min", "period": "day", "direction": "at_least", "target": 450.0,
               "current": 312.0, "pct": 69.3, "on_track": False}],
    "events": [{"title": "Board presentation", "when": "Thu Oct 15, 9:00 AM", "important": True},
               {"title": "Lunch", "when": "Thu Oct 15, 12:00 PM", "important": False}],
    "tomorrow_events": [{"title": "Board presentation", "when": "Thu Oct 15, 9:00 AM"}],
    "pending_proposal": False,
}


def test_briefing_text():
    text = compass.compose_briefing(FACTS)
    assert text.startswith("Good morning, Ada.")
    assert "5.2 h" in text and "possibly ill" in text and "Board presentation" in text
    assert "Lunch" not in text
    assert "Take it easy" in text
    assert len(text) <= compass.MAX_BRIEFING_CHARS and "None" not in text


def test_briefing_without_data():
    text = compass.compose_briefing({"status": "normal", "goals": [], "events": []})
    assert text.startswith("Good morning.") and "no sleep data" in text


def test_evening_text_is_kind_about_goals_and_shows_no_targets():
    text = compass.compose_evening(FACTS)
    assert "steps goal reached" in text
    assert "sleep 5.2 h so far" in text
    assert "not met" not in text and "8,000" not in text and "/450" not in text
    assert "Tomorrow: Board presentation" in text
    assert "Lights out by 22:30" in text


def test_evening_text_uses_the_plan_and_tonights_bedtime_when_there_is_one():
    facts = {**FACTS, "plan_text": "Tomorrow is a busy one with few gaps. Plan: 12:40 pm walk.",
             "tonight_bed": "10:15 pm", "tonight_reason": "You start at 8:00 am tomorrow."}
    text = compass.compose_evening(facts)
    assert "Plan: 12:40 pm walk." in text
    assert "Aim for lights out by 10:15 pm. You start at 8:00 am tomorrow." in text
    assert "Lights out by 22:30" not in text


def test_briefing_names_the_focus_instead_of_numbers_and_uses_the_plan():
    facts = {**FACTS, "focus": ["sleep better", "move more"],
             "plan_text": "Today looks open. Plan: 12:30 pm walk; 2:00 pm study block."}
    text = compass.compose_briefing(facts)
    assert "Your focus: sleep better, move more." in text
    assert "Plan: 12:30 pm walk; 2:00 pm study block." in text
    assert "8,000" not in text and "Today's goals" not in text
    assert "Take it easy" not in text  # the plan replaces the generic tip
    assert len(text) <= compass.MAX_BRIEFING_CHARS


def test_briefing_without_a_plan_keeps_the_generic_tip_and_no_goal_numbers():
    text = compass.compose_briefing({**FACTS, "status": "normal", "sleep_min": 480.0})
    assert "easy way to add steps" in text
    assert "8,000" not in text


def test_wants_sleep_block_only_when_ill_and_nothing_pending():
    assert compass.wants_sleep_block(FACTS)
    assert not compass.wants_sleep_block({**FACTS, "pending_proposal": True})
    assert not compass.wants_sleep_block({**FACTS, "status": "normal"})


def test_sleep_block_uses_bed_and_wake_time():
    block = compass.sleep_block({"tz": DETROIT, "bed_time": "22:30", "wake_time": "06:30"},
                                utc("2026-10-14T18:00:00+00:00"))
    assert block["starts_at"].isoformat() == "2026-10-14T22:30:00-04:00"
    assert block["ends_at"].isoformat() == "2026-10-15T06:30:00-04:00"


# ------------------------------------------------------------------ runner with fakes


class Runs:
    def __init__(self, monkeypatch):
        self.rows: list[dict] = []
        self.done: set = set()
        self.bodies: list[tuple] = []
        self.users: list[UserRef] = []
        self.fail = False

        async def start(job, user_id, detail):
            self.rows.append({"job": job, "user": user_id, "status": "running", "detail": detail})
            return len(self.rows) - 1

        async def finish(run_id, status, detail):
            self.rows[run_id].update(status=status, detail=detail)

        async def done_runs(user_ids):
            return set(self.done)

        async def profile(user_id):
            return {"timezone": DETROIT}

        async def list_users():
            return self.users

        def body(job):
            async def run(user_id, now):
                self.bodies.append((job, user_id))
                if self.fail:
                    raise RuntimeError("boom")
            return run

        monkeypatch.setattr(compass, "start_run", start)
        monkeypatch.setattr(compass, "finish_run", finish)
        monkeypatch.setattr(compass, "done_runs", done_runs)
        monkeypatch.setattr(compass, "load_profile", profile)
        monkeypatch.setattr(compass, "list_users", list_users)
        monkeypatch.setattr(compass, "BODIES", {j: body(j) for j in compass.JOB_HOURS})


@pytest.fixture
def runs(monkeypatch):
    return Runs(monkeypatch)


async def test_run_writes_ok_row(runs):
    assert await compass.run_briefing(A) is True
    assert runs.bodies == [("briefing", A)]
    assert runs.rows[0]["status"] == "ok"
    assert runs.rows[0]["detail"] == compass.period_key(compass.local_now(DETROIT))


async def test_run_skips_when_done_unless_forced(runs):
    key = compass.period_key(compass.local_now(DETROIT))
    runs.done = {("briefing", A, key)}
    assert await compass.run_briefing(A) is False
    assert runs.bodies == []
    assert await compass.run_briefing(A, force=True) is True
    assert runs.bodies == [("briefing", A)]


async def test_failed_job_is_recorded_as_error_and_never_raises(runs):
    runs.fail = True
    assert await compass.run_rebuild(A) is False
    assert runs.rows[0]["status"] == "error"
    assert "RuntimeError" in runs.rows[0]["detail"]


async def test_tick_runs_due_jobs_once_and_writes_heartbeat(runs, monkeypatch):
    runs.users = [UserRef(A, DETROIT), UserRef(B, TOKYO)]
    monkeypatch.setattr(compass, "datetime", _FrozenDatetime)
    _FrozenDatetime.fixed = utc("2026-10-14T11:05:00+00:00")
    await compass.tick()
    assert runs.bodies == [("briefing", A)]
    assert [r["job"] for r in runs.rows] == ["briefing", "compass_tick"]
    assert runs.rows[-1]["status"] == "ok" and runs.rows[-1]["detail"] == "ran=1"
    runs.done = {("briefing", A, "2026-10-14")}
    await compass.tick()
    assert runs.bodies == [("briefing", A)]
    assert runs.rows[-1]["detail"] == "ran=0"


async def test_tick_outside_windows_only_heartbeat(runs, monkeypatch):
    runs.users = [UserRef(A, DETROIT)]
    monkeypatch.setattr(compass, "datetime", _FrozenDatetime)
    _FrozenDatetime.fixed = utc("2026-10-14T18:00:00+00:00")
    await compass.tick()
    assert runs.bodies == []
    assert [r["job"] for r in runs.rows] == ["compass_tick"]


async def test_tick_survives_database_failure(runs, monkeypatch):
    async def boom():
        raise RuntimeError("db down")

    monkeypatch.setattr(compass, "list_users", boom)
    await compass.tick()
    assert runs.rows[-1]["status"] == "error"


class _FrozenDatetime(datetime):
    fixed = datetime(2026, 10, 14, tzinfo=UTC)

    @classmethod
    def now(cls, tz=None):
        return cls.fixed


# ------------------------------------------------------------------ proposal sweep


async def test_sweep_expires_retries_and_notifies_success_once(runs, monkeypatch):
    applied, reopened, alerts, dispatched = [], [], [], []
    candidates = [{"id": UUID(int=10), "user_id": A, "title": "Sleep block", "status": "failed"},
                  {"id": UUID(int=11), "user_id": B, "title": "Nap", "status": "approved"}]

    async def expire():
        return 3

    async def cands():
        return candidates

    async def reopen(pid):
        reopened.append(pid)

    async def apply(pid):
        if pid == UUID(int=11):
            raise HTTPException(502, "calendar insert failed")
        applied.append(pid)
        return "evt"

    async def persist(user_id, kind, title, body, payload, proposal=None):
        alerts.append((user_id, kind, body))
        return {"id": UUID(int=99), "user_id": user_id}

    async def dispatch(user_id, alert):
        dispatched.append(user_id)

    monkeypatch.setattr(compass, "expire_pending", expire)
    monkeypatch.setattr(compass, "retry_candidates", cands)
    monkeypatch.setattr(compass, "reopen", reopen)
    monkeypatch.setattr(compass.gcal_sync, "apply_proposal", apply)
    monkeypatch.setattr(compass, "persist_alert", persist)
    monkeypatch.setattr(compass.notify, "dispatch", dispatch)
    await compass.sweep_proposals()
    assert reopened == [UUID(int=10)]  # only the failed one is reopened
    assert applied == [UUID(int=10)]
    assert alerts == [(A, "proposal_applied", 'Added "Sleep block" to your calendar.')]
    assert dispatched == [A]
    assert runs.rows[-1]["job"] == "proposal_sweep"
    assert runs.rows[-1]["detail"] == "expired=3 applied=1"


async def test_sweep_survives_database_failure(runs, monkeypatch):
    async def boom():
        raise RuntimeError("db down")

    monkeypatch.setattr(compass, "expire_pending", boom)
    await compass.sweep_proposals()
    assert runs.rows[-1]["status"] == "error"


# ------------------------------------------------------------------ job bodies with fakes


@pytest.fixture
def bodies(monkeypatch):
    rec = {"briefings": [], "alerts": [], "dispatched": []}
    now = utc("2026-10-14T11:05:00+00:00")

    async def facts(user_id, when):
        return {**FACTS, "tz": DETROIT, "local": compass.local_now(DETROIT, now), "wake_time": "06:30"}

    async def save(user_id, day, text):
        rec["briefings"].append((user_id, day.isoformat(), text))

    async def persist(user_id, kind, title, body, payload, proposal=None):
        rec["alerts"].append((kind, body, proposal))
        return {"id": UUID(int=5), "user_id": user_id, "severity": "info", "body": body}

    async def dispatch(user_id, alert):
        rec["dispatched"].append(alert["id"])

    monkeypatch.setattr(compass, "_facts", facts)
    monkeypatch.setattr(compass, "save_briefing", save)
    monkeypatch.setattr(compass, "persist_alert", persist)
    monkeypatch.setattr(compass.notify, "dispatch", dispatch)
    return rec


async def test_briefing_body_saves_row_and_alert(bodies):
    await compass._briefing_body(A, utc("2026-10-14T11:05:00+00:00"))
    assert bodies["briefings"][0][:2] == (A, "2026-10-14")
    assert bodies["alerts"][0][0] == "morning_briefing"
    assert bodies["alerts"][0][1] == bodies["briefings"][0][2]
    assert bodies["dispatched"] == [UUID(int=5)]


async def test_evening_body_proposes_sleep_block_when_ill(bodies):
    await compass._evening_body(A, utc("2026-10-14T01:05:00+00:00"))
    kind, _, proposal = bodies["alerts"][0]
    assert kind == "evening_check" and proposal["title"] == "Sleep block (Pulse)"


def test_goal_line_reads_naturally():
    from app.agents.compass import goal_line

    def g(metric, target, period, direction="at_least"):
        return {"metric": metric, "target": target, "period": period, "direction": direction}

    assert goal_line(g("steps", 8000, "day")) == "8,000 steps a day"
    assert goal_line(g("sleep_total_min", 450, "day")) == "7.5 h of sleep a night"
    assert goal_line(g("active_minutes", 150, "week")) == "150 active minutes a week"
    assert goal_line(g("workout", 3, "week")) == "3 workouts a week"

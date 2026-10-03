from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace
from uuid import UUID

import pytest
from fastapi import HTTPException
from google.genai import types

import app.llm as llm_budget
from app.agents import chat
from app.channels import link
from app.contracts import CalendarProposal, InboundMessage
from app.core.config import settings
from app.twin import store as twin_store

USER = UUID("00000000-0000-0000-0000-000000000001")
OTHER = UUID("00000000-0000-0000-0000-000000000002")
PID = UUID(int=7)
TZ = "America/Detroit"
TODAY = date(2026, 10, 14)


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("LLM_FAKE", "true")
    monkeypatch.setenv("GEMINI_API_KEY", "")
    settings.cache_clear()
    llm_budget._calls.clear()
    yield
    settings.cache_clear()


class Store:
    """In-memory replacement for the data access functions of chat.py."""

    def __init__(self, monkeypatch):
        self.saved: list[tuple] = []
        self.pending = {"id": PID, "title": "Sleep block (Pulse)",
                        "starts_at": datetime(2026, 10, 15, 2, 0, tzinfo=UTC),
                        "ends_at": datetime(2026, 10, 15, 10, 0, tzinfo=UTC)}
        self.decide_status = "applied"
        self.decide_calls: list[tuple] = []
        self.symptoms: list[tuple] = []
        self.goals: list[dict] = []
        self.created_goals: list[tuple] = []
        self.twin = {"version": 1, "summary": "", "model": {"status": "normal", "baselines": {"steps": 7800},
                                                           "insights": []}}
        self.daily: list[dict] = [
            {"day": TODAY, "metric": "steps", "avg": None, "min": None, "max": None, "sum": 4210.0, "n": 5},
            {"day": TODAY, "metric": "sleep_total_min", "avg": None, "min": None, "max": None, "sum": 372.0,
             "n": 1},
        ]
        self.events: list[dict] = []
        self.minutes: list[dict] = []
        self.history: list[dict] = []

        async def resolve(channel, external_id):
            return USER if external_id == "+1555" else None

        async def history(user_id):
            return self.history

        async def save(user_id, channel, direction, text, tool_calls, external_id):
            self.saved.append((user_id, channel, direction, text, tool_calls, external_id))

        async def tz_of(user_id):
            return TZ

        async def pending(user_id):
            return self.pending

        async def decide(proposal_id, body, user_id=None):
            self.decide_calls.append((proposal_id, body.decision, body.via, user_id))
            if self.decide_status == "http_error":
                raise HTTPException(404, "proposal not found")
            return CalendarProposal(
                id=proposal_id, user_id=USER, title="Sleep block (Pulse)",
                starts_at=self.pending["starts_at"],
                ends_at=self.pending["ends_at"], rationale="r",
                status="rejected" if body.decision == "rejected" else self.decide_status)

        async def symptom(user_id, text):
            self.symptoms.append((user_id, text))

        async def latest_twin(user_id):
            return self.twin

        async def daily_rows(user_id, start, end, metrics):
            return [r for r in self.daily if r["metric"] in metrics]

        async def list_goals(user_id, include_inactive=False):
            return self.goals

        async def create_goal(user_id, metric, target, period, direction, active):
            self.created_goals.append((user_id, metric, target, period, direction))

        async def events(user_id, hours):
            return self.events

        async def minute_rows(user_id, metric, hours):
            return [r for r in self.minutes if r["metric"] == metric]

        async def progress(user_id, now_utc=None):
            return []

        for name, fn in [("resolve_user", resolve), ("load_history", history), ("save_message", save),
                         ("tz_of", tz_of), ("pending_proposal", pending), ("insert_symptom", symptom),
                         ("upcoming_events", events), ("minute_rows", minute_rows)]:
            monkeypatch.setattr(chat, name, fn)
        monkeypatch.setattr(chat.proposals_api, "decide", decide)
        monkeypatch.setattr(twin_store, "latest_twin", latest_twin)
        monkeypatch.setattr(twin_store, "daily_rows", daily_rows)
        monkeypatch.setattr(chat.goals_store, "list_goals", list_goals)
        monkeypatch.setattr(chat.goals_store, "create_goal", create_goal)
        monkeypatch.setattr(chat.goals_service, "compute_for_user", progress)
        monkeypatch.setattr(chat, "local_now", _local_now)


def _local_now(tz, now=None):
    from app.twin.tz import local_now as real

    return real(tz, now or datetime(2026, 10, 14, 18, 0, tzinfo=UTC))


@pytest.fixture
def store(monkeypatch):
    return Store(monkeypatch)


def msg(text, external_id="+1555", channel="imessage"):
    return InboundMessage(channel=channel, external_id=external_id, text=text, message_id="m1")


# ------------------------------------------------------------------ fast-path regexes


@pytest.mark.parametrize("text", ["yes", "Y", "approve", "ok", "Do it", "sure!", "yes please", "OK."])
def test_classify_approve(text):
    assert chat.classify(text) == "approve"


@pytest.mark.parametrize("text", ["no", "N", "reject", "skip", "nah", "No thanks", "skip it"])
def test_classify_reject(text):
    assert chat.classify(text) == "reject"


def test_classify_status_and_llm_cases():
    assert chat.classify("status") == "status"
    assert chat.classify("STATUS!") == "status"
    assert chat.classify("how many steps do I have") is None
    assert chat.classify("not sure") is None
    assert chat.classify("yesterday I slept badly") is None
    assert chat.classify("ok so what is my heart rate?") is None
    assert chat.classify("sure, but only if the event is not at noon tomorrow") is None
    assert chat.classify("nope") is None


# ------------------------------------------------------------------ pure helpers


def test_clip_limits_length():
    assert len(chat.clip("word " * 300)) <= chat.MAX_REPLY
    assert chat.clip("short") == "short"
    assert chat.clip("a\n\nb   c") == "a b c"


def test_build_contents_merges_and_drops_leading_model():
    hist = [{"direction": "out", "text": "alert"}, {"direction": "out", "text": "alert2"},
            {"direction": "in", "text": "hi"}, {"direction": "out", "text": "hello"}]
    assert chat.build_contents(hist, "steps?") == [("user", "hi"), ("model", "hello"), ("user", "steps?")]
    assert chat.build_contents([], "x") == [("user", "x")]


def test_detect_intent():
    assert chat.detect_intent("what's on my calendar") == "calendar"
    assert chat.detect_intent("how's my step goal") == "goal"
    assert chat.detect_intent("how did I sleep") == "sleep"
    assert chat.detect_intent("what is my heart rate") == "heart"
    assert chat.detect_intent("how many steps") == "steps"
    assert chat.detect_intent("blah") is None


def test_aggregate_minutes_weights_by_count():
    rows = [{"n": 1, "sum": 60.0, "min": 60.0, "max": 60.0, "avg": 60.0, "minute_ms": 1},
            {"n": 3, "sum": 300.0, "min": 90.0, "max": 110.0, "avg": 100.0, "minute_ms": 2}]
    agg = chat.aggregate_minutes(rows)
    assert agg["avg"] == 90.0
    assert (agg["min"], agg["max"], agg["latest"]) == (60.0, 110.0, 100.0)
    assert chat.aggregate_minutes([]) is None


def test_build_status_and_format():
    rows = [{"day": TODAY, "metric": "steps", "sum": 4000.0, "avg": None},
            {"day": TODAY - timedelta(days=1), "metric": "sleep_total_min", "sum": 420.0, "avg": None},
            {"day": TODAY, "metric": "resting_heart_rate", "sum": None, "avg": 61.6}]
    goals = [{"metric": "steps", "period": "day", "target": 8000.0}]
    s = chat.build_status({"model": {"status": "possibly_ill"}}, rows, goals, TODAY)
    assert s["steps_pct"] == 50
    assert s["sleep_min"] == 420.0
    text = chat.fmt_status(s)
    assert "possibly ill" in text and "4,000 of 8,000 (50%)" in text and "7.0 h" in text
    assert "None" not in chat.fmt_status(chat.build_status(None, [], [], TODAY))


# ------------------------------------------------------------------ inbound handler


async def test_unknown_sender_gets_link_reply_and_nothing_is_saved(store):
    reply = await chat.handle(msg("hello", external_id="+999"))
    assert "PULSE-XXXX" in reply.reply
    assert store.saved == []


async def test_unknown_sender_with_code_is_linked(store, monkeypatch):
    async def claim(channel, external_id, code):
        return USER if code == "PULSE-7QK2" else None

    async def name(user_id):
        return "Ada"

    monkeypatch.setattr(link, "claim_code", claim)
    monkeypatch.setattr(link, "display_name", name)
    reply = await chat.handle(msg("PULSE-7QK2", external_id="+999"))
    assert "Welcome to Pulse, Ada" in reply.reply


async def test_yes_approves_newest_pending_and_replies_with_local_time(store):
    reply = await chat.handle(msg("yes"))
    assert store.decide_calls == [(PID, "approved", "imessage", USER)]
    assert reply.reply.startswith("Done.")
    assert "Wed Oct 14, 10:00 PM" in reply.reply
    assert reply.actions[0].type == "proposal_decided"
    assert [s[2] for s in store.saved] == ["in", "out"]
    assert all(s[0] == USER and s[5] == "+1555" for s in store.saved)


async def test_approve_with_failed_calendar_uses_exact_message(store):
    store.decide_status = "failed"
    reply = await chat.handle(msg("ok"))
    assert reply.reply == ("Approved, but I couldn't add it to your calendar — connect Google Calendar "
                           "in settings")


async def test_no_rejects_and_missing_pending_is_handled(store):
    reply = await chat.handle(msg("no"))
    assert store.decide_calls[0][1] == "rejected"
    assert "Skipped" in reply.reply
    store.pending = None
    assert "Nothing is waiting" in (await chat.handle(msg("yes"))).reply


async def test_decide_http_error_does_not_leak(store):
    store.decide_status = "http_error"
    reply = await chat.handle(msg("yes"))
    assert "could not update" in reply.reply


async def test_status_fast_path_uses_template(store):
    reply = await chat.handle(msg("status"))
    assert reply.reply.startswith("Status: normal.")
    assert "4,210 of 7,800" in reply.reply


async def test_handler_never_raises(store, monkeypatch):
    async def boom(channel, external_id):
        raise RuntimeError("db down")

    monkeypatch.setattr(chat, "resolve_user", boom)
    reply = await chat.handle(msg("hello"))
    assert reply.reply == chat.GENERIC_ERROR


async def test_save_failure_does_not_block_reply(store, monkeypatch):
    async def boom(*args):
        raise RuntimeError("db down")

    monkeypatch.setattr(chat, "save_message", boom)
    assert (await chat.handle(msg("status"))).reply.startswith("Status")


# ------------------------------------------------------------------ fallback


@pytest.mark.parametrize(("text", "expected"), [
    ("how many steps do I have", "Steps today: 4,210 of 7,800 (54%)."),
    ("how did I sleep", "Sleep (last 24 h): 6.2 h."),
    ("what's my heart rate", "no resting heart rate data"),
    ("how am I doing on my goals", "no active goals"),
    ("what's on my calendar", "No events on your calendar"),
    ("tell me a joke", chat.HELP_TEXT),
])
async def test_fallback_answers_common_intents(store, text, expected):
    reply = await chat.handle(msg(text))
    assert expected in reply.reply
    assert len(reply.reply) <= chat.MAX_REPLY


async def test_fallback_heart_rate_from_minutes(store):
    store.minutes = [{"metric": "heart_rate", "n": 2, "sum": 140.0, "min": 68.0, "max": 72.0, "avg": 70.0,
                      "minute_ms": 5}]
    reply = await chat.handle(msg("heart rate?"))
    assert "average 70 bpm" in reply.reply


async def test_fallback_events(store):
    store.events = [{"title": "Board presentation", "starts_at": datetime(2026, 10, 15, 13, 0, tzinfo=UTC),
                     "ends_at": datetime(2026, 10, 15, 14, 0, tzinfo=UTC), "is_important": True}]
    reply = await chat.handle(msg("any meetings?"))
    assert "Board presentation (Thu Oct 15, 9:00 AM)" in reply.reply


# ------------------------------------------------------------------ tools


async def test_tool_isolation_and_validation(store):
    tools = chat.Toolbox(USER, "imessage", TZ)
    assert (await tools.call("nope", {}))["error"] == "unknown tool nope"
    assert (await tools.call("get_status", {"user_id": str(OTHER)}))["error"] == "bad arguments"
    assert "unknown metric" in (await tools.call("get_vitals_summary", {"metric": "x; DROP"}))["error"]
    assert "error" in await tools.call("set_goal", {"metric": "steps", "target": -5, "period": "day"})
    assert "error" in await tools.call("set_goal", {"metric": "steps", "target": 5, "period": "year"})
    assert "error" in await tools.call("set_goal", {"metric": "bogus", "target": 5, "period": "day"})
    assert store.created_goals == []


async def test_set_goal_creates_with_direction(store):
    tools = chat.Toolbox(USER, "imessage", TZ)
    assert (await tools.call("set_goal", {"metric": "steps", "target": 9000, "period": "day"}))["ok"]
    rhr = {"metric": "resting_heart_rate", "target": 60, "period": "day"}
    assert (await tools.call("set_goal", rhr))["ok"]
    assert store.created_goals == [(USER, "steps", 9000.0, "day", "at_least"),
                                   (USER, "resting_heart_rate", 60.0, "day", "at_most")]


async def test_log_symptom_stores_for_this_user_only(store):
    tools = chat.Toolbox(USER, "imessage", TZ)
    assert (await tools.call("log_symptom", {"text": "  sore   throat "}))["ok"]
    assert store.symptoms == [(USER, "sore throat")]
    assert "error" in await tools.call("log_symptom", {"text": "   "})


async def test_propose_block_validates_and_uses_local_zone(store, monkeypatch):
    made = []

    async def create(body):
        made.append(body)
        return CalendarProposal(id=PID, user_id=body.user_id, title=body.title, starts_at=body.starts_at,
                                ends_at=body.ends_at, rationale=body.rationale)

    monkeypatch.setattr(chat.proposals_api, "create", create)
    tools = chat.Toolbox(USER, "imessage", TZ)
    ok = await tools.call("propose_calendar_block", {
        "title": "Nap", "start_iso": "2026-10-14T22:00:00", "end_iso": "2026-10-15T06:00:00",
        "rationale": "rest"})
    assert ok["ok"] and "YES" in ok["next"]
    assert made[0].starts_at.utcoffset() == timedelta(hours=-4)
    assert made[0].user_id == USER
    for args in ({"title": "x", "start_iso": "bad", "end_iso": "bad"},
                 {"title": "x", "start_iso": "2026-10-15T06:00:00", "end_iso": "2026-10-14T22:00:00"},
                 {"title": "x", "start_iso": "2026-10-14T20:00:00", "end_iso": "2026-10-15T20:00:00"},
                 {"title": "", "start_iso": "2026-10-14T20:00:00", "end_iso": "2026-10-14T21:00:00"}):
        assert "error" in await tools.call("propose_calendar_block", args)
    assert len(made) == 1


# ------------------------------------------------------------------ scripted LLM loop


class ScriptedModel:
    def __init__(self, turns):
        self.turns = list(turns)
        self.seen: list[tuple] = []

    async def turn(self, results, allow_tools):
        self.seen.append((results, allow_tools))
        return self.turns.pop(0)


def call(name, **args):
    return chat.ToolCall(name, args)


async def test_loop_dispatches_scripted_calls(store):
    model = ScriptedModel([
        chat.Turn(calls=[call("set_goal", metric="steps", target=9000.0, period="day"),
                         call("get_status")]),
        chat.Turn(text="Done, your step goal is 9,000."),
    ])
    tools = chat.Toolbox(USER, "imessage", TZ)
    text, calls = await chat.run_loop(model, tools)
    assert text == "Done, your step goal is 9,000."
    assert [c["name"] for c in calls] == ["set_goal", "get_status"]
    assert store.created_goals == [(USER, "steps", 9000.0, "day", "at_least")]
    results = model.seen[1][0]
    assert [n for n, _ in results] == ["set_goal", "get_status"]
    assert results[1][1]["steps_today"] == 4210.0


async def test_loop_stops_after_four_rounds_and_forces_text(store):
    turns = [chat.Turn(calls=[call("get_status")]) for _ in range(4)] + [chat.Turn(text="final")]
    model = ScriptedModel(turns)
    text, calls = await chat.run_loop(model, chat.Toolbox(USER, "imessage", TZ))
    assert text == "final" and len(calls) == 4
    assert [allowed for _, allowed in model.seen] == [True, True, True, True, False]


async def test_loop_that_never_answers_raises(store):
    model = ScriptedModel([chat.Turn(calls=[call("get_status")]) for _ in range(5)])
    with pytest.raises(RuntimeError):
        await chat.run_loop(model, chat.Toolbox(USER, "imessage", TZ))
    with pytest.raises(ValueError):
        await chat.run_loop(ScriptedModel([chat.Turn(text=" ")]), chat.Toolbox(USER, "imessage", TZ))


async def test_answer_uses_model_and_persists_tool_log(store, monkeypatch):
    model = ScriptedModel([chat.Turn(calls=[call("get_status")]), chat.Turn(text="You are at 54% of steps.")])
    monkeypatch.setenv("LLM_FAKE", "false")
    monkeypatch.setenv("GEMINI_API_KEY", "key")
    settings.cache_clear()
    monkeypatch.setattr(chat, "GeminiChat", lambda pairs, tz: model)
    reply = await chat.handle(msg("how am I doing today, in detail please?"))
    assert reply.reply == "You are at 54% of steps."
    assert store.saved[-1][4] == [{"name": "get_status", "args": {}}]


async def test_llm_error_falls_back_to_keywords(store, monkeypatch):
    class Failing:
        def __init__(self, pairs, tz):
            pass

        async def turn(self, results, allow_tools):
            raise TimeoutError("429")

    monkeypatch.setenv("LLM_FAKE", "false")
    monkeypatch.setenv("GEMINI_API_KEY", "key")
    settings.cache_clear()
    monkeypatch.setattr(chat, "GeminiChat", Failing)
    reply = await chat.handle(msg("how many steps do I have today?"))
    assert "Steps today: 4,210" in reply.reply


async def test_budget_exceeded_uses_fallback(store, monkeypatch):
    monkeypatch.setenv("LLM_FAKE", "false")
    monkeypatch.setenv("GEMINI_API_KEY", "key")
    settings.cache_clear()
    monkeypatch.setitem(llm_budget._calls, datetime.now(UTC).date(), llm_budget.DAILY_LIMIT)
    assert not chat.llm_enabled()


# ------------------------------------------------------------------ Gemini adapter with a fake client


def fn_call_response(name, args):
    part = types.Part(function_call=types.FunctionCall(name=name, args=args))
    return types.GenerateContentResponse(candidates=[types.Candidate(
        content=types.Content(role="model", parts=[part]))])


def text_response(text):
    return types.GenerateContentResponse(candidates=[types.Candidate(
        content=types.Content(role="model", parts=[types.Part(text=text)]))])


async def test_gemini_adapter_manual_loop(store, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "key")
    settings.cache_clear()
    responses = [fn_call_response("get_status", {}), text_response("All good.")]
    requests = []

    async def generate_content(model, contents, config):
        requests.append((model, list(contents), config))
        return responses.pop(0)

    g = chat.GeminiChat(chat.build_contents([], "status please?"), TZ)
    models = SimpleNamespace(generate_content=generate_content)
    g._client = SimpleNamespace(aio=SimpleNamespace(models=models))
    text, calls = await chat.run_loop(g, chat.Toolbox(USER, "imessage", TZ))
    assert text == "All good." and calls == [{"name": "get_status", "args": {}}]
    cfg = requests[0][2]
    assert cfg.automatic_function_calling.disable is True
    assert cfg.tools and {d.name for d in cfg.tools[0].function_declarations} == chat.TOOL_NAMES
    second = requests[1][1]
    assert [c.role for c in second] == ["user", "model", "user"]
    assert second[2].parts[0].function_response.name == "get_status"
    assert llm_budget.calls_today() == 2

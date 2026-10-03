import pytest
from google.genai import errors

import app.llm as llm
from app.core.config import settings
from app.llm.templates import TEMPLATES, render
from app.rules import TITLES

FACTS = {
    "workout_detected": {"duration_min": 13, "peak_hr": 166, "threshold": 135},
    "illness_onset": {"rhr_today": 72, "rhr_delta": 10, "rhr_baseline": 62, "sleep_min": 312,
                      "event_title": "Board presentation"},
    "low_spo2": {"readings": [91, 89], "min_spo2": 89, "threshold": 92},
    "inactivity": {"steps_3h": 25},
    "goal_pace": {"steps": 3900, "goal": 10000, "remaining": 6100, "pct": 39},
    "high_bp": {"count": 3, "max_systolic": 142, "max_diastolic": 90, "hypertension": True},
    "sleep_debt": {"avg_sleep_min": 360, "debt_min": 90, "target_min": 450},
    "recovery": {"rhr_today": 64, "rhr_baseline": 62},
    "low_hr": {"min_hr": 36, "minutes": 15},
}


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("LLM_FAKE", "false")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    settings.cache_clear()
    llm._calls.clear()
    yield
    settings.cache_clear()


def test_every_rule_kind_has_template_and_fits():
    assert set(FACTS) == set(TEMPLATES) == set(TITLES)
    for kind, facts in FACTS.items():
        text = render(kind, facts)
        assert 0 < len(text) <= 320
        assert "None" not in text


def test_templates_cite_numbers():
    assert "166" in render("workout_detected", FACTS["workout_detected"])
    assert "6100" in render("goal_pace", FACTS["goal_pace"])


def test_unknown_kind_and_missing_facts_do_not_raise():
    assert render("mystery", {})
    assert render("goal_pace", {})


async def test_fake_mode_uses_template_without_client(monkeypatch):
    monkeypatch.setenv("LLM_FAKE", "true")
    settings.cache_clear()

    async def boom(*a, **k):
        raise AssertionError("must not call Gemini")

    monkeypatch.setattr(llm, "_generate", boom)
    assert await llm.phrase("low_spo2", FACTS["low_spo2"], "") == render("low_spo2", FACTS["low_spo2"])


async def test_no_api_key_uses_template(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "")
    settings.cache_clear()
    out = await llm.phrase("inactivity", FACTS["inactivity"], "")
    assert out == render("inactivity", FACTS["inactivity"])


async def test_success_path_truncates_to_320(monkeypatch):
    async def ok(kind, facts, twin_summary, persona):
        return llm.Phrasing(text="x" * 500, tone="warm")

    monkeypatch.setattr(llm, "_generate", ok)
    out = await llm.phrase("inactivity", FACTS["inactivity"], "")
    assert out == "x" * 320
    assert llm.calls_today() == 1


async def test_api_error_429_falls_back(monkeypatch):
    async def limited(*a, **k):
        raise errors.APIError(429, {"error": {"message": "quota", "status": "RESOURCE_EXHAUSTED"}})

    monkeypatch.setattr(llm, "_generate", limited)
    assert await llm.phrase("high_bp", FACTS["high_bp"], "") == render("high_bp", FACTS["high_bp"])


async def test_any_exception_falls_back(monkeypatch):
    async def broken(*a, **k):
        raise RuntimeError("network down")

    monkeypatch.setattr(llm, "_generate", broken)
    assert await llm.phrase("recovery", FACTS["recovery"], "") == render("recovery", FACTS["recovery"])


async def test_generate_builds_structured_request(monkeypatch):
    seen = {}

    class FakeModels:
        async def generate_content(self, *, model, contents, config):
            seen.update(model=model, contents=contents, config=config)

            class R:
                parsed = None
                text = '{"text": "Great job, 13 minutes at 166 bpm.", "tone": "celebratory"}'

            return R()

    class FakeClient:
        def __init__(self, api_key):
            self.aio = type("A", (), {"models": FakeModels()})()

    monkeypatch.setattr(llm.genai, "Client", FakeClient)
    out = await llm.phrase("workout_detected", FACTS["workout_detected"], "Active adult")
    assert out.startswith("Great job")
    cfg = seen["config"]
    assert cfg.response_mime_type == "application/json"
    assert cfg.response_schema is llm.Phrasing
    assert cfg.http_options.timeout == 10000
    assert "166" in seen["contents"] and "Active adult" in seen["contents"]


async def test_daily_budget_switches_to_templates(monkeypatch):
    async def ok(*a, **k):
        return llm.Phrasing(text="from gemini", tone="warm")

    monkeypatch.setattr(llm, "_generate", ok)
    assert await llm.phrase("recovery", FACTS["recovery"], "") == "from gemini"
    llm._calls[next(iter(llm._calls))] = llm.DAILY_LIMIT
    assert await llm.phrase("recovery", FACTS["recovery"], "") == render("recovery", FACTS["recovery"])


def test_for_llm_turns_sleep_minutes_into_hours():
    from app.llm import _for_llm

    out = _for_llm({"sleep_min": 300, "sleep_total_min": 450, "duration_min": 20, "rhr_today": 84})
    assert out == {"sleep_hours": 5.0, "sleep_total_hours": 7.5, "duration_min": 20, "rhr_today": 84}


async def test_generate_with_fallback_moves_on_429_only(monkeypatch):
    from google.genai import errors as genai_errors

    import app.llm as llm

    tried = []

    class Models:
        async def generate_content(self, model, **kw):
            tried.append(model)
            if model == "m1":
                body = {"error": {"code": 429, "message": "quota", "status": "x"}}
                raise genai_errors.ClientError(429, body)
            return f"ok:{model}"

    client = type("C", (), {"aio": type("A", (), {"models": Models()})()})()
    monkeypatch.setattr(llm, "models_to_try", lambda primary: ["m1", "m2", "m3"])
    assert await llm.generate_with_fallback(client, "m1", contents="x") == "ok:m2"
    assert tried == ["m1", "m2"]

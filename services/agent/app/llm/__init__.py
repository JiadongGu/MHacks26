import asyncio
import json
import logging
import re
import time
from datetime import UTC, date, datetime
from typing import Any

from google import genai
from google.genai import errors as genai_errors
from google.genai import types
from pydantic import BaseModel

from app.core.config import settings
from app.llm.templates import MAX_CHARS, render

log = logging.getLogger("pulse.llm")

DAILY_LIMIT = 800
TIMEOUT_MS = 10_000

SYSTEM_PROMPT = (
    "You are {persona}, a warm personal health companion that texts the user. "
    "Give wellness guidance, never a diagnosis. Be concise and kind. "
    "Cite the exact numbers from the facts. Use at most 320 characters, in iMessage style, "
    "with no markdown and no emoji spam. If a fact suggests danger, advise medical care. "
    "For timing, copy any *_when phrase exactly (e.g. 'tomorrow at 2:00 PM'); never work out dates yourself. "
    "Say sleep in hours, not minutes. Only cite numbers that appear in the Facts; never quote thresholds, "
    "goals or values from the twin summary. Never state or suggest a diagnosis or that the user 'has' an "
    "illness."
)

DIAGNOSIS_RE = re.compile(r"\byou (definitely |probably |likely )?(have|'ve got) (a |an |the )?"
                          r"(flu|covid|infection|cold|virus|disease|pneumonia|diabetes|heart attack)|diagnos|"
                          r"\bdefinitely\b", re.IGNORECASE)


def _for_llm(facts: dict[str, Any]) -> dict[str, Any]:
    """Facts as a person reads them: sleep minutes become hours."""
    out: dict[str, Any] = {}
    for k, v in facts.items():
        if "sleep" in k and k.endswith("_min") and isinstance(v, int | float):
            out[k.removesuffix("_min") + "_hours"] = round(v / 60, 1)
        else:
            out[k] = v
    return out


class Phrasing(BaseModel):
    text: str
    tone: str


_calls: dict[date, int] = {}


def calls_today() -> int:
    return _calls.get(datetime.now(UTC).date(), 0)


def _count_call() -> None:
    today = datetime.now(UTC).date()
    for day in [d for d in _calls if d != today]:
        del _calls[day]
    _calls[today] = _calls.get(today, 0) + 1


RETRY_NEXT_MODEL = {429, 500, 503}


def models_to_try(primary: str) -> list[str]:
    extra = [m.strip() for m in settings().gemini_fallback_models.split(",") if m.strip()]
    return [primary] + [m for m in extra if m != primary]


async def generate_with_fallback(client: Any, primary: str, **kwargs: Any) -> Any:
    """generate_content on the primary model; on 429 (quota) or 500/503 (overloaded) try the next model."""
    last: Exception | None = None
    for model in models_to_try(primary):
        try:
            return await client.aio.models.generate_content(model=model, **kwargs)
        except genai_errors.APIError as exc:
            if getattr(exc, "code", None) not in RETRY_NEXT_MODEL:
                raise
            log.warning("llm.model_unavailable model=%s code=%s; trying next", model, exc.code)
            last = exc
    raise last or RuntimeError("no model available")


async def _generate(kind: str, facts: dict[str, Any], twin_summary: str, persona: str) -> Phrasing:
    client = genai.Client(api_key=settings().gemini_api_key)
    prompt = (f"Twin summary: {twin_summary or 'none'}\nAlert kind: {kind}\n"
              f"Facts: {json.dumps(_for_llm(facts), default=str)}\nWrite the message.")
    resp = await generate_with_fallback(
        client, settings().gemini_model_fast,
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT.format(persona=persona),
            response_mime_type="application/json",
            response_schema=Phrasing,
            temperature=0.4,
            http_options=types.HttpOptions(timeout=TIMEOUT_MS),
        ),
    )
    parsed = resp.parsed
    if not isinstance(parsed, Phrasing):
        parsed = Phrasing.model_validate_json(resp.text or "")
    if not parsed.text.strip():
        raise ValueError("empty text")
    return parsed


async def phrase(kind: str, facts: dict[str, Any], twin_summary: str, persona: str = "Pulse") -> str:
    """Return the alert text. Never raises. Falls back to a template on any failure."""
    s = settings()
    if s.llm_fake or not s.gemini_api_key:
        return render(kind, facts)
    if calls_today() >= DAILY_LIMIT:
        log.warning("llm.budget_exceeded kind=%s", kind)
        return render(kind, facts)
    started = time.monotonic()
    _count_call()
    try:
        out = await asyncio.wait_for(
            _generate(kind, facts, twin_summary, persona), timeout=TIMEOUT_MS / 1000 + 2)
        log.info("llm.phrase kind=%s ok=1 ms=%d", kind, (time.monotonic() - started) * 1000)
        text = out.text.strip()[:MAX_CHARS]
        if DIAGNOSIS_RE.search(text):
            log.warning("llm.phrase kind=%s diagnosis_language=1; using template", kind)
            return render(kind, facts)
        return text
    except Exception as exc:
        log.warning("llm.phrase kind=%s ok=0 err=%s ms=%d", kind, type(exc).__name__,
                    (time.monotonic() - started) * 1000)
        return render(kind, facts)

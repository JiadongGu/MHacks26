"""Twin use cases. The router validates, calls one function here, and returns."""

from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from app.contracts import DigitalTwin
from app.core.logging import log
from app.twin import builder, finchnode, store
from app.twin.tz import local_now

DAILY_METRICS = ["resting_heart_rate", "hrv_sdnn", "sleep_total_min", "steps"]


class TwinNotFound(Exception):
    """The user has no twin yet."""


async def _daily(user_id: UUID, today: Any) -> list[dict[str, Any]]:
    start = today - timedelta(days=builder.BASELINE_DAYS - 1)
    return await store.daily_rows(user_id, start, today, DAILY_METRICS)


def _result(user_id: UUID, version: int, model: dict[str, Any], summary: str) -> DigitalTwin:
    return DigitalTwin(user_id=user_id, version=version, model=model, summary=summary)


async def get_latest(user_id: UUID) -> DigitalTwin:
    row = await store.latest_twin(user_id)
    if row is None:
        raise TwinNotFound(str(user_id))
    return _result(user_id, row["version"], row["model"], row["summary"])


async def import_from_finchnode(user_id: UUID, scenario: str | None, patient_id: str | None) -> DigitalTwin:
    started = time.monotonic()
    if patient_id is None:
        patient_id = await finchnode.resolve_patient_id(scenario or "")
    body, origin = await finchnode.fetch_records(patient_id)
    return await save_records(user_id, body, origin, scenario or body.get("scenario"), started)


async def save_records(
    user_id: UUID,
    body: dict[str, Any],
    origin: str,
    scenario_id: str | None,
    started: float | None = None,
    provenance: dict[str, Any] | None = None,
) -> DigitalTwin:
    """Build the twin from a FinchNode records body, replace the stored records, and save a new version."""
    started = started if started is not None else time.monotonic()
    profile = await store.profile_row(user_id)
    now = datetime.now(UTC)
    today = local_now((profile or {}).get("timezone"), now).date()

    twin = builder.from_finchnode(body, today=today)
    twin["provenance"]["finchnode_source"] = origin
    twin["provenance"]["imported_at"] = now.isoformat()
    twin["provenance"].update(provenance or {})
    previous = await store.latest_twin(user_id)
    if previous:
        old = previous["model"]
        twin["family_history"] = old.get("family_history", [])
        if old.get("provenance", {}).get("onboarding_at"):
            twin["provenance"]["onboarding_at"] = old["provenance"]["onboarding_at"]
    # The user's own profile row wins over the demographics of the demo patient.
    twin = builder.apply_profile(twin, profile, today=today)
    twin = builder.finalize(twin, await _daily(user_id, today), today=today)

    summary = builder.summarize(twin)
    categories = {k: v for k, v in body["record"].items() if isinstance(v, list)}
    version = await store.save_import(user_id, scenario_id, categories, twin, summary)
    log.info(
        "event=twin_import user=%s version=%d origin=%s ms=%d",
        user_id,
        version,
        origin,
        int((time.monotonic() - started) * 1000),
    )
    return _result(user_id, version, twin, summary)


async def apply_onboarding(
    user_id: UUID, profile: dict[str, Any], family_history: list[dict[str, Any]], edits: dict[str, Any]
) -> DigitalTwin:
    started = time.monotonic()
    previous = await store.latest_twin(user_id)
    if previous:
        base = previous["model"]
    else:
        row = await store.profile_row(user_id)
        base = builder.empty_twin((row or {}).get("timezone") or builder.DEFAULT_TIMEZONE)
    now = datetime.now(UTC)
    twin = builder.merge_onboarding(base, profile, family_history, edits, now=now)
    today = local_now(twin["profile"].get("timezone"), now).date()
    twin = builder.finalize(twin, await _daily(user_id, today), today=today)
    summary = builder.summarize(twin)
    version = await store.insert_twin(user_id, twin, summary)
    log.info(
        "event=twin_onboarding user=%s version=%d ms=%d",
        user_id,
        version,
        int((time.monotonic() - started) * 1000),
    )
    return _result(user_id, version, twin, summary)


async def rebuild(user_id: UUID) -> DigitalTwin:
    started = time.monotonic()
    previous = await store.latest_twin(user_id)
    if previous is None:
        raise TwinNotFound(str(user_id))
    now = datetime.now(UTC)
    profile = await store.profile_row(user_id)
    today = local_now((profile or {}).get("timezone") or previous["model"].get("profile", {}).get("timezone"),
                      now).date()
    # Profile edits made in setup reach the twin on the next rebuild.
    model = builder.apply_profile(previous["model"], profile, today=today)
    twin = builder.finalize(model, await _daily(user_id, today), today=today, now=now, rebuild=True)
    summary = builder.summarize(twin)
    version = await store.insert_twin(user_id, twin, summary)
    log.info(
        "event=twin_rebuild user=%s version=%d ms=%d",
        user_id,
        version,
        int((time.monotonic() - started) * 1000),
    )
    return _result(user_id, version, twin, summary)

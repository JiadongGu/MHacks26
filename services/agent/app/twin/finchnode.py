"""FinchNode demo API client. Outbound calls use a 10 second timeout and one retry."""

from __future__ import annotations

import asyncio
import json
import re
import time
from pathlib import Path
from typing import Any

import httpx

from app.core.logging import log

BASE_URL = "https://api.finchnode.com/demo/v1"
TIMEOUT = httpx.Timeout(10.0)
ATTEMPTS = 2
RETRY_DELAY_S = 0.3
PATIENT_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
FIXTURE_DIR = Path(__file__).resolve().parents[4] / "contracts" / "fixtures"

# Scenario names from the list endpoint, mapped to patient ids.
SCENARIO_PATIENTS: dict[str, str] = {
    "baseline-adult": "patient-demo-001",
    "polypharmacy-senior": "patient-demo-polypharmacy",
    "pediatric-asthma": "patient-demo-pediatric-asthma",
    "sparse-record": "patient-demo-sparse",
    "multi-source-overlap": "patient-demo-multi-source",
    "messy-coding": "patient-demo-messy-coding",
}

# Shown when the list endpoint is down, so the onboarding picker still works.
STATIC_PATIENTS: list[dict[str, Any]] = [
    {
        "id": "patient-demo-001",
        "scenario": "baseline-adult",
        "displayName": "Morgan Rivera",
        "birthDate": "1988-04-17",
    },
    {
        "id": "patient-demo-polypharmacy",
        "scenario": "polypharmacy-senior",
        "displayName": "Harriet Lindqvist (synthetic)",
        "birthDate": "1948-03-02",
    },
    {
        "id": "patient-demo-pediatric-asthma",
        "scenario": "pediatric-asthma",
        "displayName": "Theo Abernathy (synthetic)",
        "birthDate": "2017-06-11",
    },
    {
        "id": "patient-demo-sparse",
        "scenario": "sparse-record",
        "displayName": "Jonah Okoye (synthetic)",
        "birthDate": "1996-02-14",
    },
    {
        "id": "patient-demo-multi-source",
        "scenario": "multi-source-overlap",
        "displayName": "Priya Ramaswamy (synthetic)",
        "birthDate": "1985-11-23",
    },
    {
        "id": "patient-demo-messy-coding",
        "scenario": "messy-coding",
        "displayName": "Dolores Marchetti (synthetic)",
        "birthDate": "1963-07-30",
    },
]


class FinchNodeError(Exception):
    """FinchNode is unreachable or returned a bad payload."""


class FinchNodeNotFound(FinchNodeError):
    """FinchNode has no such patient."""


async def _send(path: str, client: httpx.AsyncClient | None) -> httpx.Response:
    if client is not None:
        return await client.get(f"{BASE_URL}{path}")
    async with httpx.AsyncClient(timeout=TIMEOUT) as c:
        return await c.get(f"{BASE_URL}{path}")


async def _get_json(path: str, client: httpx.AsyncClient | None = None) -> Any:
    last: Exception | None = None
    for attempt in range(ATTEMPTS):
        started = time.monotonic()
        try:
            resp = await _send(path, client)
        except httpx.HTTPError as exc:
            log.warning("event=finchnode_get_failed error=%s attempt=%d", type(exc).__name__, attempt + 1)
            last = exc
        else:
            ms = int((time.monotonic() - started) * 1000)
            log.info("event=finchnode_get status=%s ms=%d attempt=%d", resp.status_code, ms, attempt + 1)
            if resp.status_code == 404:
                raise FinchNodeNotFound(path)
            if resp.is_success:
                try:
                    return resp.json()
                except ValueError as exc:
                    raise FinchNodeError("bad json") from exc
            if resp.status_code < 500 and resp.status_code != 429:
                raise FinchNodeError(f"status {resp.status_code}")
            last = FinchNodeError(f"status {resp.status_code}")
        if attempt + 1 < ATTEMPTS:
            await asyncio.sleep(RETRY_DELAY_S)
    raise FinchNodeError(f"finchnode unavailable: {type(last).__name__}") from last


async def list_patients(client: httpx.AsyncClient | None = None) -> list[dict[str, Any]]:
    """GET /patients. Returns the `data` list. Raises FinchNodeError on failure."""
    body = await _get_json("/patients", client)
    data = body.get("data") if isinstance(body, dict) else None
    if not isinstance(data, list):
        raise FinchNodeError("bad patients payload")
    return [p for p in data if isinstance(p, dict) and isinstance(p.get("id"), str)]


async def get_records(patient_id: str, client: httpx.AsyncClient | None = None) -> dict[str, Any]:
    """GET /patients/{id}/records. Returns the response body with its `record` object."""
    if not PATIENT_ID_RE.match(patient_id):
        raise ValueError("invalid patient id")
    body = await _get_json(f"/patients/{patient_id}/records", client)
    if not isinstance(body, dict) or not isinstance(body.get("record"), dict):
        raise FinchNodeError("bad records payload")
    return body


def load_fixture(patient_id: str) -> dict[str, Any] | None:
    """Recorded response from contracts/fixtures. Used when the live API fails."""
    if not PATIENT_ID_RE.match(patient_id):
        return None
    path = FIXTURE_DIR / f"finchnode_{patient_id}.json"
    try:
        body = json.loads(path.read_text())
    except (OSError, ValueError):
        return None
    return body if isinstance(body, dict) and isinstance(body.get("record"), dict) else None


async def resolve_patient_id(scenario: str, client: httpx.AsyncClient | None = None) -> str:
    """Scenario name to patient id. Uses the static map, then the live list. Raises FinchNodeNotFound."""
    if scenario in SCENARIO_PATIENTS:
        return SCENARIO_PATIENTS[scenario]
    try:
        for p in await list_patients(client):
            if p.get("scenario") == scenario:
                return str(p["id"])
    except FinchNodeError:
        pass
    raise FinchNodeNotFound(scenario)


async def fetch_records(
    patient_id: str, client: httpx.AsyncClient | None = None
) -> tuple[dict[str, Any], str]:
    """Live records with a fixture fallback. Returns (body, "live" | "fixture")."""
    try:
        return await get_records(patient_id, client), "live"
    except FinchNodeNotFound:
        raise
    except FinchNodeError:
        fixture = load_fixture(patient_id)
        if fixture is None:
            raise
        log.warning("event=finchnode_fallback_fixture patient=%s", patient_id)
        return fixture, "fixture"

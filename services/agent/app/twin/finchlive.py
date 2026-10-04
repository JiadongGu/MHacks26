"""FinchNode Connect: a patient approves sharing, then their own records are read with the app key.

Sandbox keys (`ck_test_`) and production keys (`ck_live_`) use the same base URL. The key decides which.
The key stays on the server. Subjects and record bodies are never logged.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import re
import time
from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import log

BASE_URL = "https://api.finchnode.com/api/v1"
TIMEOUT = httpx.Timeout(15.0)
CATEGORIES = ("conditions", "medications", "allergies", "labs")
PAGE = 100
MAX_PAGES = 20
SIGNATURE_TOLERANCE_S = 300


class LiveError(Exception):
    """FinchNode is unreachable, refused, or returned something unexpected."""


class NotConfigured(LiveError):
    """No FINCHNODE_API_KEY."""


class ConsentInactive(LiveError):
    """The patient revoked sharing, or it expired (410)."""


class SubjectGone(LiveError):
    """FinchNode no longer has this subject (404)."""


def _headers() -> dict[str, str]:
    key = settings().finchnode_api_key
    if not key.startswith("ck_"):
        raise NotConfigured("FINCHNODE_API_KEY is not set")
    return {"Authorization": f"Bearer {key}"}


async def _request(method: str, path: str, **kw: Any) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as c:
            resp = await c.request(method, f"{BASE_URL}{path}", headers=_headers(), **kw)
    except httpx.HTTPError as exc:
        log.warning("event=finchlive_request_failed error=%s", type(exc).__name__)
        raise LiveError("FinchNode unreachable") from exc
    if resp.status_code == 410:
        raise ConsentInactive(path.split("/")[1] if path.startswith("/users") else "consent")
    if resp.status_code == 404:
        raise SubjectGone("not found")
    if not resp.is_success:
        log.warning("event=finchlive_status status=%s", resp.status_code)
        raise LiveError(f"FinchNode status {resp.status_code}")
    try:
        body = resp.json()
    except ValueError as exc:
        raise LiveError("bad json") from exc
    if not isinstance(body, dict):
        raise LiveError("bad payload")
    return body


async def create_session(external_id: str, return_url: str) -> dict[str, Any]:
    body = await _request(
        "POST",
        "/connect/sessions",
        json={
            "externalId": external_id,
            "categories": ["demographics", *CATEGORIES],
            "returnUrl": return_url,
        },
    )
    if not body.get("id") or not body.get("url"):
        raise LiveError("bad session payload")
    return body


async def get_session(session_id: str) -> dict[str, Any]:
    return await _request("GET", f"/connect/sessions/{session_id}")


async def get_consent(receipt_id: str) -> dict[str, Any]:
    return await _request("GET", f"/consents/{receipt_id}")


async def read_category(subject: str, category: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Follow the cursor until hasMore is false. Returns the records and the first page's meta."""
    records: list[dict[str, Any]] = []
    meta: dict[str, Any] = {}
    cursor: str | None = None
    for page_no in range(MAX_PAGES):
        params: dict[str, Any] = {"limit": PAGE}
        if cursor:
            params["cursor"] = cursor
        page = await _request("GET", f"/users/{subject}/records/{category}", params=params)
        if page_no == 0:
            meta = page.get("meta") if isinstance(page.get("meta"), dict) else {}
        records += [r for r in page.get("data", []) if isinstance(r, dict)]
        if not page.get("hasMore"):
            break
        cursor = page.get("nextCursor")
        if not cursor:
            break
    return records, meta


async def read_demographics(subject: str) -> dict[str, Any] | None:
    try:
        body = await _request("GET", f"/users/{subject}/records", params={"categories": "demographics"})
    except (SubjectGone, ConsentInactive):
        raise
    except LiveError:
        return None  # age and sex also come from the profile, so this is not fatal
    demo = (body.get("data") or {}).get("demographics")
    return demo if isinstance(demo, dict) else None


async def read_all(subject: str) -> dict[str, Any]:
    """Every shared category, as normalized records plus how complete the import was."""
    data: dict[str, Any] = {"demographics": await read_demographics(subject)}
    status = "complete"
    for category in CATEGORIES:
        try:
            data[category], meta = await read_category(subject, category)
        except SubjectGone:
            raise
        except ConsentInactive:
            raise
        sync = meta.get("syncStatus")
        if sync and sync != "complete":
            status = str(sync)
        if category in (meta.get("missingCategories") or []):
            status = "partial"
    data["_sync_status"] = status
    return data


def _concept(name: Any, codes: Any) -> dict[str, Any]:
    coding = [
        {"system": c.get("system"), "code": c.get("code"), "display": c.get("display")}
        for c in (codes if isinstance(codes, list) else [])
        if isinstance(c, dict)
    ]
    return {"coding": coding, "text": name}


def _status(value: Any) -> dict[str, Any]:
    return {"coding": [{"code": value}]} if value else {}


def to_fhir_record(data: dict[str, Any]) -> dict[str, Any]:
    """Turn normalized records into the FHIR-like shape that builder.from_finchnode reads."""
    demo = data.get("demographics") or {}
    out: dict[str, Any] = {
        "demographics": [{"gender": demo.get("gender"), "birthDate": demo.get("birthDate")}] if demo else [],
        "conditions": [
            {
                "resourceType": "Condition",
                "code": _concept(r.get("name"), r.get("codes")),
                "clinicalStatus": _status(r.get("status")),
                "verificationStatus": _status(r.get("verificationStatus")),
            }
            for r in data.get("conditions", [])
        ],
        "medications": [
            {
                "resourceType": "MedicationRequest",
                "status": r.get("status"),
                "medicationCodeableConcept": _concept(r.get("name"), r.get("codes")),
            }
            for r in data.get("medications", [])
        ],
        "allergies": [
            {
                "resourceType": "AllergyIntolerance",
                "code": _concept(r.get("substance"), r.get("codes")),
                "clinicalStatus": _status(r.get("status")),
            }
            for r in data.get("allergies", [])
        ],
        "labs": [
            {
                "resourceType": "Observation",
                "code": _concept(r.get("name"), r.get("codes")),
                "valueQuantity": {"value": r.get("value"), "unit": r.get("unit")},
                "effectiveDateTime": r.get("date"),
            }
            for r in data.get("labs", [])
        ],
    }
    return {"record": out, "scenario": None, "patientId": None, "source": "FinchNode", "synthetic": False}


_SIG_PART = re.compile(r"^[a-f0-9]{64}$")


def verify_webhook(
    raw: bytes, signature: str, event_id: str, *, now: float | None = None
) -> dict[str, Any] | None:
    """Return the event if the request is genuinely from FinchNode, else None."""
    secret = settings().finchnode_webhook_secret
    if not secret:
        return None
    pairs = [p.strip().partition("=") for p in (signature or "").split(",")]
    times = [v for k, _, v in pairs if k == "t"]
    sigs = [v for k, _, v in pairs if k == "v1"]
    if len(times) != 1 or not re.fullmatch(r"[0-9]{1,12}", times[0]):
        return None
    if not sigs or not all(_SIG_PART.match(s) for s in sigs):
        return None
    if abs((now if now is not None else time.time()) - int(times[0])) > SIGNATURE_TOLERANCE_S:
        return None
    expected = hmac.new(secret.encode(), times[0].encode() + b"." + raw, hashlib.sha256).hexdigest()
    if not any(hmac.compare_digest(s, expected) for s in sigs):
        return None
    try:
        event = json.loads(raw)
    except ValueError:
        return None
    return event if isinstance(event, dict) and event.get("id") and event["id"] == event_id else None

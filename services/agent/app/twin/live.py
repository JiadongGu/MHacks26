"""Live FinchNode flow: start a Connect session, import when sharing is approved, remove on revocation."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from app.core import db
from app.core.config import settings
from app.core.logging import log
from app.twin import finchlive, live_store, service, store


async def start(user_id: UUID) -> dict[str, str]:
    return_url = f"{settings().public_web_url.rstrip('/')}/onboarding?finchnode=returned"
    session = await finchlive.create_session(str(user_id), return_url)
    await live_store.upsert_pending(user_id, session["id"])
    return {"session_id": session["id"], "url": session["url"]}


async def import_now(user_id: UUID, subject: str) -> None:
    data = await finchlive.read_all(subject)
    sync_status = data.pop("_sync_status", "complete")
    await service.save_records(
        user_id,
        finchlive.to_fhir_record(data),
        "live",
        None,
        provenance={"finchnode_live": True, "finchnode_sync_status": sync_status},
    )
    await live_store.mark_imported(user_id)
    log.info("event=finchnode_live_imported user=%s sync=%s", user_id, sync_status)


async def status(user_id: UUID) -> dict[str, Any]:
    """Where the person is in the flow. Imports as soon as sharing is approved, so the webhook is optional."""
    row = await live_store.load(user_id)
    if row is None:
        return {"status": "none", "imported": False}
    if row["status"] == "pending":
        session = await finchlive.get_session(row["session_id"])
        if session.get("status") == "completed" and session.get("subject"):
            await live_store.set_connected(user_id, session["subject"])
            row = {**row, "status": "connected", "subject": session["subject"]}
        elif session.get("status") in ("canceled", "expired", "failed", "abandoned"):
            await live_store.set_status(user_id, "expired")
            return {"status": "expired", "imported": False}
    if row["status"] == "connected" and row["subject"] and row["imported_at"] is None:
        try:
            await import_now(user_id, row["subject"])
            row = {**row, "imported_at": True}
        except finchlive.ConsentInactive:
            await purge(user_id, "revoked")
            return {"status": "revoked", "imported": False}
    return {"status": row["status"], "imported": row["imported_at"] is not None}


async def purge(user_id: UUID, new_status: str | None) -> None:
    """Remove the stored FinchNode records and drop what they put in the twin. None deletes the link row."""
    async with db.neon() as conn:
        await conn.execute("delete from ehr_records where user_id = %s and source = 'finchnode'", (user_id,))
    previous = await store.latest_twin(user_id)
    if previous:
        await service.save_records(
            user_id,
            {"record": {}, "scenario": None, "patientId": None, "source": "FinchNode", "synthetic": False},
            "removed",
            None,
            provenance={"finchnode_live": False, "finchnode_sync_status": "removed"},
        )
    if new_status is None:
        await live_store.delete(user_id)
    else:
        await live_store.set_status(user_id, new_status)
    log.info("event=finchnode_live_purged user=%s status=%s", user_id, new_status)


async def handle_event(event: dict[str, Any]) -> None:
    """Act on a verified, first-seen webhook event."""
    kind = event.get("type")
    data = event.get("data") if isinstance(event.get("data"), dict) else {}
    if kind == "consent.granted":
        row = await live_store.by_session(str(data.get("sessionId") or ""))
        if row and data.get("subject"):
            await live_store.set_connected(row["user_id"], data["subject"])
            await import_now(row["user_id"], data["subject"])
        return
    if kind in ("consent.revoked", "consent.expired", "deletion.requested"):
        subject = data.get("subject")
        if not subject and data.get("receiptId"):
            subject = (await finchlive.get_consent(data["receiptId"])).get("subject")
        row = await live_store.by_subject(str(subject or ""))
        if row is None:
            return
        if kind == "deletion.requested":
            await purge(row["user_id"], None)
        else:
            await purge(row["user_id"], "revoked" if kind == "consent.revoked" else "expired")

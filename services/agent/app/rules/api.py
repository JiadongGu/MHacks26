from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.core import db
from app.core.auth import require_internal
from app.rules.explain import explain
from app.rules.types import Finding, RuleContext

router = APIRouter(prefix="/alerts", tags=["alerts"], dependencies=[Depends(require_internal)])


def explain_for_alert(alert: dict[str, Any], twin: dict[str, Any]) -> dict[str, Any]:
    """The stored explain object, or a best-effort one rebuilt from the saved facts and the current twin."""
    payload = alert.get("payload") if isinstance(alert.get("payload"), dict) else {}
    stored = payload.get("explain")
    if isinstance(stored, dict) and stored.get("rule"):
        return stored
    facts = payload.get("facts") if isinstance(payload.get("facts"), dict) else {}
    finding = Finding(kind=alert["kind"], severity=alert["severity"], facts=facts)
    ctx = RuleContext(now=alert["created_at"], twin=twin)
    return {**explain(finding, ctx), "estimated": True}


@router.get("/{alert_id}/explain")
async def get_explain(alert_id: UUID, user_id: UUID) -> dict[str, Any]:
    async with db.neon() as conn:
        cur = await conn.execute(
            "select kind, severity, payload, created_at from alerts where id = %s and user_id = %s",
            (alert_id, user_id))
        alert = await cur.fetchone()
        if alert is None:
            raise HTTPException(404, "alert not found")
        payload = alert["payload"] if isinstance(alert["payload"], dict) else {}
        twin: dict[str, Any] = {}
        if not isinstance(payload.get("explain"), dict):
            cur = await conn.execute(
                "select model from digital_twin where user_id = %s order by version desc limit 1", (user_id,))
            row = await cur.fetchone()
            twin = (row or {}).get("model") or {}
    return explain_for_alert(alert, twin)

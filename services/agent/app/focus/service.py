from typing import Any
from uuid import UUID

from app.core.logging import log
from app.goals import store as goals_store
from app.twin import store as twin_store

from . import store
from .catalog import CATALOG, adaptive_target, validate_keys


async def _baselines_and_age(user_id: UUID) -> tuple[dict[str, Any], int | None]:
    twin = await twin_store.latest_twin(user_id)
    model = (twin or {}).get("model") or {}
    return model.get("baselines") or {}, (model.get("profile") or {}).get("age")


async def sync_goals(user_id: UUID, keys: list[str]) -> None:
    """Keep the measurable goals in step with the picks.

    Picking creates or reactivates a goal with a target the system chose; un-picking switches it off.
    A target the user already has is never overwritten.
    """
    baselines, age = await _baselines_and_age(user_id)
    existing = await goals_store.list_goals(user_id, include_inactive=True)
    for focus in (f for f in CATALOG if f.metric):
        rows = [g for g in existing if g["metric"] == focus.metric and g["period"] == focus.period]
        if focus.key in keys:
            if not rows:
                target = adaptive_target(focus.metric, baselines, age)
                await goals_store.create_goal(
                    user_id, focus.metric, target, focus.period, focus.direction, True
                )
            elif not any(g["active"] for g in rows):
                await goals_store.update_goal(rows[0]["id"], user_id, None, None, None, True)
        else:
            for g in rows:
                if g["active"]:
                    await goals_store.update_goal(g["id"], user_id, None, None, None, False)


async def set_focus(user_id: UUID, keys: list[str]) -> list[str]:
    keys = validate_keys(keys)
    await store.replace_picks(user_id, keys)
    await sync_goals(user_id, keys)
    log.info("event=focus_set user=%s keys=%s", user_id, ",".join(keys))
    return keys

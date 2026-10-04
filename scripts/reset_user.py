"""Wipe one person's Pulse data so they can go through onboarding again.

    uv run --directory services/agent python ../../scripts/reset_user.py --user-id <uuid>        # dry run
    uv run --directory services/agent python ../../scripts/reset_user.py --user-id <uuid> --yes  # really delete

Needs DATABASE_URL and SECRET_KEY (and the Google client id and secret to clean up the calendar). The
login account itself stays, so the person can sign in and start onboarding from the first step.

What goes: every row keyed to the user in Neon, Pulse's own events in their Pulse Health calendar, and the
Google grants for Calendar and Fitbit (revoked, so reconnecting asks for consent again).
What stays: their sign-in, and readings in the live pool (Spacetime), which expire by themselves after 48
hours (raw) and 30 days (per-minute rollups).
"""

# ruff: noqa: E501
import argparse
import asyncio
import sys
from pathlib import Path
from uuid import UUID

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "services" / "agent"))

import httpx  # noqa: E402
from cryptography.fernet import InvalidToken  # noqa: E402

from app.core import db  # noqa: E402
from app.integrations.fitbit import store as fitbit_store  # noqa: E402
from app.integrations.gcal import oauth as gcal_oauth  # noqa: E402
from app.integrations.gcal import service as gcal_service  # noqa: E402
from app.integrations.gcal import store as gcal_store  # noqa: E402

# Every table with a user_id column (see apps/web/drizzle/migrations). goal_progress is keyed by goal_id.
USER_TABLES = [
    "alerts", "briefings", "calendar_connections", "calendar_events_cache", "calendar_proposals",
    "channel_links", "daily_plans", "daily_summary", "digital_twin", "ehr_records", "fitbit_connections",
    "focus_areas", "goals", "ingest_log", "job_runs", "messages", "profiles",
]
REVOKE_URL = "https://oauth2.googleapis.com/revoke"


async def existing_tables(conn) -> list[str]:
    """Tables from USER_TABLES that exist in this database (daily_plans only arrives with the planner migration)."""
    found = []
    for t in USER_TABLES:
        cur = await conn.execute("select to_regclass(%s) is not null as ok", (t,))
        if (await cur.fetchone())["ok"]:
            found.append(t)
    return found


async def counts(uid: UUID) -> dict[str, int]:
    out: dict[str, int] = {}
    async with db.neon() as conn:
        for t in await existing_tables(conn):
            cur = await conn.execute(f"select count(*) as n from {t} where user_id = %s", (uid,))  # noqa: S608
            out[t] = (await cur.fetchone())["n"]
        cur = await conn.execute(
            "select count(*) as n from goal_progress where goal_id in (select id from goals where user_id = %s)", (uid,)
        )
        out["goal_progress"] = (await cur.fetchone())["n"]
    return out


async def who(uid: UUID) -> str:
    try:
        async with db.neon() as conn:
            cur = await conn.execute('select name, email from neon_auth."user" where id = %s', (uid,))
            row = await cur.fetchone()
        return f"{row['name']} <{row['email']}>" if row else "no sign-in account with this id"
    except Exception:
        return "sign-in account not readable"


def _clean_calendar(creds, calendar_id: str, event_ids: list[str]) -> int:
    """Delete Pulse's own plan events and the events of applied proposals. Returns how many were removed."""
    svc = gcal_service._svc(creds)
    removed, page = 0, None
    while True:
        resp = svc.events().list(calendarId=calendar_id, singleEvents=True, maxResults=250, pageToken=page).execute()
        for e in resp.get("items", []):
            private = (e.get("extendedProperties") or {}).get("private") or {}
            if gcal_service.PLAN_PROP in private or e["id"] in event_ids:
                svc.events().delete(calendarId=calendar_id, eventId=e["id"]).execute()
                removed += 1
        page = resp.get("nextPageToken")
        if not page:
            return removed


def _revoke(token: str) -> bool:
    return httpx.post(REVOKE_URL, params={"token": token}, timeout=15).status_code == 200


async def google_cleanup(uid: UUID) -> list[str]:
    notes: list[str] = []
    cal = await gcal_store.load(uid)
    if cal:
        try:
            async with db.neon() as conn:
                cur = await conn.execute(
                    "select google_event_id from calendar_proposals where user_id = %s and google_event_id is not null",
                    (uid,),
                )
                proposal_events = [r["google_event_id"] for r in await cur.fetchall()]
            creds = await asyncio.to_thread(gcal_oauth.credentials_for, cal["refresh_token"])
            if cal.get("health_calendar_id"):
                n = await asyncio.to_thread(_clean_calendar, creds, cal["health_calendar_id"], proposal_events)
                notes.append(f"removed {n} Pulse event(s) from the Pulse Health calendar")
            notes.append("revoked the Calendar grant" if await asyncio.to_thread(_revoke, cal["refresh_token"])
                         else "could not revoke the Calendar grant")
        except (InvalidToken, Exception) as e:  # best effort: never block the wipe on Google
            notes.append(f"calendar cleanup skipped ({type(e).__name__})")
    fit = await fitbit_store.load(uid)
    if fit:
        try:
            notes.append("revoked the Fitbit grant" if await asyncio.to_thread(_revoke, fit["refresh_token"])
                         else "could not revoke the Fitbit grant")
        except Exception as e:
            notes.append(f"fitbit revoke skipped ({type(e).__name__})")
    return notes


async def wipe(uid: UUID) -> None:
    async with db.neon() as conn, conn.transaction():
        await conn.execute(
            "delete from goal_progress where goal_id in (select id from goals where user_id = %s)", (uid,)
        )
        for t in await existing_tables(conn):
            await conn.execute(f"delete from {t} where user_id = %s", (uid,))  # noqa: S608


async def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--user-id", required=True, type=UUID)
    ap.add_argument("--yes", action="store_true", help="really delete (default is a dry run)")
    args = ap.parse_args()
    uid: UUID = args.user_id

    await db.open_pools()
    try:
        before = await counts(uid)
        total = sum(before.values())
        print(f"user {uid}: {await who(uid)}")
        for table, n in before.items():
            if n:
                print(f"  {table:24s} {n}")
        print(f"  {'total rows':24s} {total}")
        if total == 0:
            print("nothing to delete.")
            return 0
        if not args.yes:
            print("\nDRY RUN. Nothing was changed. Add --yes to delete the rows above, clean the calendar and "
                  "revoke the Google grants.")
            return 0
        for note in await google_cleanup(uid):
            print("  google:", note)
        await wipe(uid)
        after = await counts(uid)
        left = {t: n for t, n in after.items() if n}
        print("done." if not left else f"WARNING rows remain: {left}")
        print("Readings in the live pool expire by themselves (raw after 48 hours, rollups after 30 days).")
        return 0 if not left else 1
    finally:
        await db.close_pools()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

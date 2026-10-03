"""SpacetimeDB HTTP client (no maintained Python SDK). Contract: contracts/SPACETIME.md."""
from typing import Any

import httpx

from app.core.config import settings


def _url(path: str) -> str:
    s = settings()
    return f"{s.spacetime_host.rstrip('/')}/v1/database/{s.spacetime_db}/{path}"


def _headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {settings().spacetime_token}"}


def configured() -> bool:
    s = settings()
    return bool(s.spacetime_host and s.spacetime_db and s.spacetime_token)


async def call(reducer: str, args: list[Any]) -> None:
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.post(_url(f"call/{reducer}"), json=args, headers=_headers())
        r.raise_for_status()


async def sql(query: str) -> list[dict[str, Any]]:
    """Run one SELECT; returns rows as dicts keyed by column name."""
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.post(_url("sql"), content=query, headers={**_headers(), "Content-Type": "text/plain"})
        r.raise_for_status()
    out: list[dict[str, Any]] = []
    for stmt in r.json():
        cols = [e["name"]["some"] if isinstance(e.get("name"), dict) else e.get("name")
                for e in stmt["schema"]["elements"]]
        out.extend(dict(zip(cols, row, strict=False)) for row in stmt["rows"])
    return out


async def ping() -> bool:
    if not configured():
        return False
    try:
        await sql("SELECT * FROM minute_agg LIMIT 1")
        return True
    except (httpx.HTTPError, KeyError, ValueError):
        return False

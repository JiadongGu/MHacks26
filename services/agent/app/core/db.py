from contextlib import asynccontextmanager

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from app.core.config import settings

_neon: AsyncConnectionPool | None = None
_tiger: AsyncConnectionPool | None = None


def _pool(url: str) -> AsyncConnectionPool:
    # Neon scales to zero and drops idle connections: check before handing one out, recycle idle ones.
    return AsyncConnectionPool(
        url, min_size=1, max_size=5, open=False, max_idle=240,
        check=AsyncConnectionPool.check_connection, kwargs={"row_factory": dict_row},
    )


async def open_pools() -> None:
    global _neon, _tiger
    s = settings()
    if s.database_url:
        _neon = _pool(s.database_url)
        await _neon.open(wait=False)
    if s.tiger_database_url:
        _tiger = _pool(s.tiger_database_url)
        await _tiger.open(wait=False)


async def close_pools() -> None:
    for p in (_neon, _tiger):
        if p:
            await p.close()


def has_tiger() -> bool:
    return _tiger is not None


@asynccontextmanager
async def neon():
    if _neon is None:
        raise RuntimeError("DATABASE_URL not configured")
    async with _neon.connection() as conn:
        yield conn


@asynccontextmanager
async def tiger():
    """Live vitals pool. Falls back to Neon when TIGER_DATABASE_URL is unset."""
    pool = _tiger or _neon
    if pool is None:
        raise RuntimeError("no database configured")
    async with pool.connection() as conn:
        yield conn


async def ping(which: str) -> bool:
    try:
        ctx = neon() if which == "neon" else tiger()
        async with ctx as conn:
            await conn.execute("select 1")
        return True
    except Exception:
        return False

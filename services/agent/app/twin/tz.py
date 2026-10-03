from datetime import UTC, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.core.logging import log

DEFAULT_TIMEZONE = "America/Detroit"


def local_now(tz_name: str | None, now_utc: datetime | None = None) -> datetime:
    """Current time in the user's timezone. Falls back to the default zone, then to UTC."""
    now = (now_utc or datetime.now(UTC)).astimezone(UTC)
    for name in (tz_name, DEFAULT_TIMEZONE):
        if not name:
            continue
        try:
            return now.astimezone(ZoneInfo(name))
        except (ZoneInfoNotFoundError, ValueError):
            log.warning("event=tz_unknown tz=%s", name)
    return now

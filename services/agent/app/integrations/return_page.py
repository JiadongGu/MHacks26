"""Where an OAuth connect sends the person afterwards: the setup page or settings. Never an arbitrary URL."""

import json

from app.integrations.gcal.store import fernet

ALLOWED = {"onboarding", "settings"}


def clean(value: str | None) -> str:
    return value if value in ALLOWED else "settings"


def from_state(state: str | None) -> str:
    """The page recorded in the encrypted OAuth state. Settings if the state is missing or unreadable."""
    if not state:
        return "settings"
    try:
        return clean(json.loads(fernet().decrypt(state.encode())).get("r"))
    except Exception:
        return "settings"

"""Register a person with Photon so Pulse's iMessage line can talk to them.

On Photon's free and Pro plans a shared line only messages people registered as users of the project, and
each user is assigned the line they must text. Creating a user is idempotent on the phone number, so asking
again just returns the same line.
"""

import re

import httpx

from app.core.config import settings
from app.core.logging import log

BASE_URL = "https://spectrum.photon.codes"
E164_RE = re.compile(r"^\+[1-9]\d{6,14}$")
TIMEOUT = httpx.Timeout(15.0)


class PhotonError(Exception):
    """Photon is unreachable or refused."""


class NotConfigured(PhotonError):
    """No Spectrum project credentials on this service."""


class LineFull(PhotonError):
    """The project has reached its limit of shared users."""


def clean_phone(raw: str) -> str:
    """Strips spaces, dashes, dots and brackets. The result may still be invalid; check with E164_RE."""
    return re.sub(r"[\s\-.()]", "", raw or "")


async def register_user(phone: str, first_name: str | None = None, email: str | None = None) -> str:
    """Create (or fetch) the shared user for `phone`. Returns the number they should text, in E.164."""
    s = settings()
    if not s.spectrum_project_id or not s.spectrum_project_secret:
        raise NotConfigured("SPECTRUM_PROJECT_ID / SPECTRUM_PROJECT_SECRET not set")
    phone = clean_phone(phone)
    if not E164_RE.match(phone):
        raise ValueError("phone must be in international format, like +13135550123")
    body: dict[str, str] = {"type": "shared", "phoneNumber": phone}
    if first_name:
        body["firstName"] = first_name
    if email:
        body["email"] = email
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as c:
            resp = await c.post(
                f"{BASE_URL}/projects/{s.spectrum_project_id}/users/",
                json=body,
                auth=(s.spectrum_project_id, s.spectrum_project_secret),
            )
    except httpx.HTTPError as exc:
        log.warning("event=photon_register_failed error=%s", type(exc).__name__)
        raise PhotonError("Photon unreachable") from exc
    if not resp.is_success:
        text = resp.text.lower()
        log.warning("event=photon_register_status status=%s", resp.status_code)
        if resp.status_code in (402, 403, 409, 422) and ("max" in text or "limit" in text):
            raise LineFull("shared user limit reached")
        raise PhotonError(f"Photon status {resp.status_code}")
    try:
        line = str(resp.json()["data"]["assignedPhoneNumber"])
    except (ValueError, KeyError, TypeError) as exc:
        raise PhotonError("unexpected Photon response") from exc
    if not E164_RE.match(line):
        raise PhotonError("unexpected line number")
    return line

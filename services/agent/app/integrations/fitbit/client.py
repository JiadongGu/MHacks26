import time
from datetime import UTC, date, datetime, timedelta
from typing import Any

import httpx

from . import oauth

API = "https://health.googleapis.com/v4/users/me"


def _z(dt: datetime) -> str:
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


class HealthClient:
    """Synchronous; run in a thread. If `refreshed` is set afterwards, persist `row`."""

    def __init__(self, row: dict[str, Any]):
        self.row = row
        self.refreshed = False

    def _refresh(self) -> None:
        self.row = oauth.refresh(self.row)
        self.refreshed = True

    def _request(self, path: str, params: dict[str, Any]) -> dict[str, Any]:
        if self.row["expires_at"] - time.time() < 60:
            self._refresh()
        for attempt in (1, 2):
            r = httpx.get(
                API + path,
                params=params,
                timeout=15,
                headers={"Authorization": f"Bearer {self.row['access_token']}"},
            )
            if r.status_code == 401 and attempt == 1:
                self._refresh()
                continue
            r.raise_for_status()
            return r.json()
        raise AssertionError("unreachable")

    def list_points(self, data_type: str, filter_expr: str) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        token = None
        while True:
            params = {"filter": filter_expr, "pageSize": 10000, **({"pageToken": token} if token else {})}
            resp = self._request(f"/dataTypes/{data_type}/dataPoints", params)
            out += resp.get("dataPoints", [])
            token = resp.get("nextPageToken")
            if not token:
                return out

    def heart_rate(self, start: datetime, end: datetime) -> list[dict[str, Any]]:
        f = "heart_rate.sample_time.physical_time"
        return self.list_points("heart-rate", f'{f} >= "{_z(start)}" AND {f} < "{_z(end)}"')

    def steps(self, start: datetime, end: datetime) -> list[dict[str, Any]]:
        f = "steps.interval.start_time"
        return self.list_points("steps", f'{f} >= "{_z(start)}" AND {f} < "{_z(end)}"')

    def spo2(self, start: datetime, end: datetime) -> list[dict[str, Any]]:
        f = "oxygen_saturation.sample_time.physical_time"
        return self.list_points("oxygen-saturation", f'{f} >= "{_z(start)}" AND {f} < "{_z(end)}"')

    def active_minutes(self, start: datetime, end: datetime) -> list[dict[str, Any]]:
        f = "active_minutes.interval.start_time"
        return self.list_points("active-minutes", f'{f} >= "{_z(start)}" AND {f} < "{_z(end)}"')

    def daily(self, data_type: str, since: date, until: date) -> list[dict[str, Any]]:
        """Daily data types (resting heart rate, HRV): one point per civil day, `since` through `until`."""
        f = data_type.replace("-", "_") + ".date"
        return self.list_points(data_type, f'{f} >= "{since}" AND {f} < "{until + timedelta(days=1)}"')

    def sleep(self, since: date, until: date) -> list[dict[str, Any]]:
        """Sleep sessions that ended on a civil day from `since` through `until`."""
        f = "sleep.interval.civil_end_time"
        return self.list_points(
            "sleep", f'{f} >= "{since}T00:00:00" AND {f} < "{until + timedelta(days=1)}T00:00:00"'
        )

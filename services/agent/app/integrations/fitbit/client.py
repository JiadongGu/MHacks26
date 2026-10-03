import time
from datetime import date, datetime, timedelta

import httpx

from app.integrations.gcal.store import TokenStore

from . import oauth

API = "https://health.googleapis.com/v4/users/me"


class HealthClient:
    def __init__(self, user_id: str, store: TokenStore):
        self.user_id = user_id
        self.store = store

    def _row(self) -> dict:
        row = self.store.load(self.user_id)
        if not row:
            raise LookupError("fitbit not connected")
        if row["expires_at"] - time.time() < 60:
            row = oauth.refresh(self.user_id, self.store)
        return row

    def _request(self, method: str, path: str, **kw) -> dict:
        row = self._row()
        r = httpx.request(method, API + path, headers={"Authorization": f"Bearer {row['access_token']}"}, timeout=15, **kw)
        if r.status_code == 401:
            row = oauth.refresh(self.user_id, self.store)
            r = httpx.request(method, API + path, headers={"Authorization": f"Bearer {row['access_token']}"}, timeout=15, **kw)
        r.raise_for_status()
        return r.json()

    def list_points(self, data_type: str, filter_expr: str) -> list[dict]:
        out, token = [], None
        while True:
            params = {"filter": filter_expr, "pageSize": 10000, **({"pageToken": token} if token else {})}
            resp = self._request("GET", f"/dataTypes/{data_type}/dataPoints", params=params)
            out += resp.get("dataPoints", [])
            token = resp.get("nextPageToken")
            if not token:
                return out

    def heart_rate(self, start: datetime, end: datetime) -> list[dict]:
        field = "heart_rate.sample_time.physical_time"
        return self.list_points("heart-rate", f'{field} >= "{start.isoformat()}" AND {field} < "{end.isoformat()}"')

    def daily_rollup(self, data_type: str, day: date) -> dict:
        def civil(d: date) -> dict:
            return {"date": {"year": d.year, "month": d.month, "day": d.day}, "time": {"hours": 0, "minutes": 0}}

        body = {"range": {"start": civil(day), "end": civil(day + timedelta(days=1))}, "windowSizeDays": 1}
        return self._request("POST", f"/dataTypes/{data_type}/dataPoints:dailyRollUp", json=body)

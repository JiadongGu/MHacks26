from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.goals import api, service, store
from app.twin import store as twin_store

HEADERS = {"X-Internal-Token": "dev-internal-token"}


class FakeGoals:
    def __init__(self):
        self.goals: dict[UUID, dict] = {}
        self.daily: list[dict] = []
        self.timezone = "America/Detroit"
        self.cached: list = []

    async def list_goals(self, user_id, include_inactive=False):
        return [
            g for g in self.goals.values() if g["user_id"] == user_id and (include_inactive or g["active"])
        ]

    async def create_goal(self, user_id, metric, target, period, direction, active):
        row = {
            "id": uuid4(),
            "user_id": user_id,
            "metric": metric,
            "target": target,
            "period": period,
            "direction": direction,
            "active": active,
        }
        self.goals[row["id"]] = row
        return row

    async def update_goal(self, goal_id, user_id, target, period, direction, active):
        row = self.goals.get(goal_id)
        if row is None or (user_id is not None and row["user_id"] != user_id):
            return None
        for key, value in (
            ("target", target),
            ("period", period),
            ("direction", direction),
            ("active", active),
        ):
            if value is not None:
                row[key] = value
        return row

    async def upsert_progress(self, rows):
        self.cached = rows

    async def profile_row(self, user_id):
        return {"timezone": self.timezone}

    async def daily_rows(self, user_id, start, end, metrics):
        return [r for r in self.daily if start <= r["day"] <= end and r["metric"] in metrics]


@pytest.fixture
def fake(monkeypatch):
    f = FakeGoals()
    for name in ("list_goals", "create_goal", "update_goal", "upsert_progress"):
        monkeypatch.setattr(store, name, getattr(f, name))
    monkeypatch.setattr(twin_store, "profile_row", f.profile_row)
    monkeypatch.setattr(twin_store, "daily_rows", f.daily_rows)
    return f


@pytest.fixture
def client(fake):
    app = FastAPI()
    app.include_router(api.router)
    return TestClient(app, headers=HEADERS)


def test_requires_internal_token(fake):
    app = FastAPI()
    app.include_router(api.router)
    anon = TestClient(app)
    uid = uuid4()
    assert anon.get(f"/goals?user_id={uid}").status_code == 401
    assert anon.get(f"/goals/progress?user_id={uid}").status_code == 401
    assert anon.post("/goals", json={}).status_code == 401
    assert anon.patch(f"/goals/{uid}", json={"target": 1}).status_code == 401


def test_create_list_and_patch(client):
    uid = str(uuid4())
    body = {"user_id": uid, "metric": "steps", "target": 8000, "period": "day", "direction": "at_least"}
    created = client.post("/goals", json=body)
    assert created.status_code == 201, created.text
    goal = created.json()
    assert goal["active"] is True and goal["target"] == 8000
    assert client.get(f"/goals?user_id={uid}").json() == [goal]

    patched = client.patch(f"/goals/{goal['id']}", json={"target": 10000})
    assert patched.status_code == 200 and patched.json()["target"] == 10000
    client.patch(f"/goals/{goal['id']}", json={"active": False})
    assert client.get(f"/goals?user_id={uid}").json() == []
    assert len(client.get(f"/goals?user_id={uid}&include_inactive=true").json()) == 1


def test_validation(client):
    uid = str(uuid4())
    ok = {"user_id": uid, "metric": "steps", "target": 8000, "period": "day", "direction": "at_least"}
    for change in (
        {"metric": "mood"},
        {"target": 0},
        {"target": -5},
        {"period": "month"},
        {"direction": "equal"},
        {"user_id": "x"},
    ):
        assert client.post("/goals", json={**ok, **change}).status_code == 422, change
    assert client.patch(f"/goals/{uuid4()}", json={}).status_code == 422
    assert client.patch("/goals/not-a-uuid", json={"target": 1}).status_code == 422


def test_patch_unknown_or_foreign_goal_is_404(client):
    uid = uuid4()
    goal = client.post(
        "/goals",
        json={"user_id": str(uid), "metric": "steps", "target": 1, "period": "day", "direction": "at_least"},
    ).json()
    assert client.patch(f"/goals/{uuid4()}", json={"target": 2}).status_code == 404
    assert client.patch(f"/goals/{goal['id']}?user_id={uuid4()}", json={"target": 2}).status_code == 404
    assert client.patch(f"/goals/{goal['id']}?user_id={uid}", json={"target": 2}).status_code == 200


async def test_compute_for_user_uses_user_timezone_and_caches(fake):
    uid = uuid4()
    await fake.create_goal(uid, "steps", 8000, "day", "at_least", True)
    await fake.create_goal(uid, "active_minutes", 150, "week", "at_least", True)
    # 2026-10-01 03:00 UTC is 2026-09-30 23:00 in Detroit, so the user's day is still 09-30.
    now = datetime(2026, 10, 1, 3, 0, tzinfo=UTC)
    from datetime import date

    fake.daily = [
        {"day": date(2026, 9, 30), "metric": "steps", "sum": 8200.0, "n": 1, "avg": None},
        {"day": date(2026, 10, 1), "metric": "steps", "sum": 50.0, "n": 1, "avg": None},
        {"day": date(2026, 9, 28), "metric": "active_minutes", "sum": 60.0, "n": 1, "avg": None},
    ]
    results = await service.compute_for_user(uid, now)
    by_metric = {g["metric"]: p for g, p in zip(await fake.list_goals(uid), results, strict=True)}
    assert by_metric["steps"].period_start == date(2026, 9, 30) and by_metric["steps"].current == 8200
    assert by_metric["steps"].on_track is True
    assert by_metric["active_minutes"].period_start == date(2026, 9, 28)
    assert by_metric["active_minutes"].current == 60
    assert fake.cached == results


async def test_compute_for_user_without_goals(fake):
    assert await service.compute_for_user(uuid4()) == []
    assert fake.cached == []


def test_progress_endpoint(client, fake):
    uid = str(uuid4())
    client.post(
        "/goals",
        json={"user_id": uid, "metric": "steps", "target": 8000, "period": "day", "direction": "at_least"},
    )
    r = client.get(f"/goals/progress?user_id={uid}")
    assert r.status_code == 200
    item = r.json()[0]
    assert set(item) == {"goal_id", "period_start", "current", "pct", "on_track"}
    assert client.get("/goals/progress").status_code == 422


async def test_cache_failure_does_not_fail_the_request(fake, monkeypatch):
    uid = uuid4()
    await fake.create_goal(uid, "steps", 8000, "day", "at_least", True)

    async def boom(rows):
        raise RuntimeError("db down")

    monkeypatch.setattr(store, "upsert_progress", boom)
    assert len(await service.compute_for_user(uid)) == 1

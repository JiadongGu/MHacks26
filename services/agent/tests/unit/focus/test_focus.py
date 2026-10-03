from uuid import UUID

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.auth import require_internal
from app.focus import api, service
from app.focus.catalog import BY_KEY, CATALOG, MAX_PICKS, adaptive_target, validate_keys

UID = UUID("00000000-0000-0000-0000-000000000001")


def test_catalog_has_ten_unique_areas_across_body_mind_and_habits():
    assert len(CATALOG) == 10 and len({f.key for f in CATALOG}) == 10
    assert {f.area for f in CATALOG} == {"body", "mind", "habits"}
    assert MAX_PICKS == 3


def test_measurable_areas_map_to_real_metrics_only_where_a_wearable_can_see_them():
    assert {f.key: f.metric for f in CATALOG if f.metric} == {
        "sleep": "sleep_total_min",
        "steps": "steps",
        "workouts": "active_minutes",
    }
    assert BY_KEY["workouts"].period == "week" and BY_KEY["sleep"].period == "day"


def test_validate_keys_drops_repeats_keeps_order_and_enforces_the_limit():
    assert validate_keys(["steps", "sleep", "steps"]) == ["steps", "sleep"]
    assert validate_keys([]) == []
    with pytest.raises(ValueError, match="unknown"):
        validate_keys(["sleep", "nope"])
    with pytest.raises(ValueError, match="at most 3"):
        validate_keys(["sleep", "steps", "study", "stress"])


@pytest.mark.parametrize(
    ("baseline", "expected"),
    [({"sleep_min": 300}, 420.0), ({"sleep_min": 450}, 450.0), ({"sleep_min": 600}, 540.0), ({}, 450.0)],
)
def test_sleep_target_is_a_healthy_range_not_the_persons_own_short_nights(baseline, expected):
    assert adaptive_target("sleep_total_min", baseline, 30) == expected


@pytest.mark.parametrize(
    ("baseline", "age", "expected"),
    [
        ({}, 30, 7000.0),
        ({}, 70, 4500.0),
        ({"steps": 3000}, 30, 3500.0),
        ({"steps": 8000}, 30, 9000.0),
        ({"steps": 20000}, 30, 12000.0),
        ({"steps": 1000}, 30, 3000.0),
    ],
)
def test_steps_target_is_a_gentle_step_above_the_persons_own_baseline(baseline, age, expected):
    assert adaptive_target("steps", baseline, age) == expected


def test_active_minutes_target_is_the_weekly_guideline_and_unknown_metrics_fail():
    assert adaptive_target("active_minutes", {}, None) == 150.0
    with pytest.raises(ValueError):
        adaptive_target("heart_rate", {}, None)


class Fakes:
    def __init__(self, goals=None, baselines=None, age=30):
        self.goals = goals or []
        self.baselines, self.age = baselines or {}, age
        self.created, self.updated, self.picks = [], [], None

    async def latest_twin(self, user_id):
        return {"model": {"baselines": self.baselines, "profile": {"age": self.age}}}

    async def list_goals(self, user_id, include_inactive=False):
        return self.goals

    async def create_goal(self, user_id, metric, target, period, direction, active):
        self.created.append((metric, target, period, direction, active))

    async def update_goal(self, goal_id, user_id, target, period, direction, active):
        self.updated.append((goal_id, active))

    async def replace_picks(self, user_id, keys):
        self.picks = keys


@pytest.fixture
def fakes(monkeypatch):
    f = Fakes()
    monkeypatch.setattr(service.twin_store, "latest_twin", f.latest_twin)
    monkeypatch.setattr(service.goals_store, "list_goals", f.list_goals)
    monkeypatch.setattr(service.goals_store, "create_goal", f.create_goal)
    monkeypatch.setattr(service.goals_store, "update_goal", f.update_goal)
    monkeypatch.setattr(service.store, "replace_picks", f.replace_picks)
    return f


async def test_picking_a_measurable_area_creates_a_goal_with_a_system_chosen_target(fakes):
    fakes.baselines = {"steps": 6000, "sleep_min": 400}
    assert await service.set_focus(UID, ["steps", "sleep", "study"]) == ["steps", "sleep", "study"]
    assert fakes.picks == ["steps", "sleep", "study"]
    assert sorted(fakes.created) == [
        ("sleep_total_min", 420.0, "day", "at_least", True),
        ("steps", 7000.0, "day", "at_least", True),
    ]


async def test_an_area_with_no_metric_creates_no_goal(fakes):
    await service.set_focus(UID, ["study", "stress"])
    assert fakes.created == [] and fakes.updated == []


async def test_unpicking_switches_the_goal_off_and_repicking_switches_it_back_on(fakes):
    gid = UUID("00000000-0000-0000-0000-0000000000aa")
    fakes.goals = [{"id": gid, "metric": "steps", "period": "day", "target": 9000, "active": True}]
    await service.set_focus(UID, ["sleep"])
    assert fakes.updated == [(gid, False)]

    fakes.updated.clear()
    fakes.goals = [{"id": gid, "metric": "steps", "period": "day", "target": 9000, "active": False}]
    await service.set_focus(UID, ["steps"])
    assert fakes.updated == [(gid, True)] and all(c[0] != "steps" for c in fakes.created)


async def test_an_existing_active_goal_is_left_alone(fakes):
    fakes.goals = [{"id": UUID(int=1), "metric": "steps", "period": "day", "target": 9000, "active": True}]
    await service.set_focus(UID, ["steps"])
    assert fakes.updated == [] and all(c[0] != "steps" for c in fakes.created)


@pytest.fixture
def client(monkeypatch, fakes):
    app = FastAPI()
    app.include_router(api.router)
    app.dependency_overrides[require_internal] = lambda: None

    async def list_picks(user_id):
        return ["sleep"]

    monkeypatch.setattr(api.store, "list_picks", list_picks)
    return TestClient(app)


def test_catalog_endpoint_lists_every_area_and_the_limit(client):
    body = client.get("/focus/catalog").json()
    assert body["max_picks"] == 3 and len(body["items"]) == 10
    steps = next(i for i in body["items"] if i["key"] == "steps")
    assert (
        steps["measurable"] is True
        and next(i for i in body["items"] if i["key"] == "study")["measurable"] is False
    )


def test_get_and_put_focus(client, fakes):
    assert client.get("/focus", params={"user_id": str(UID)}).json() == {"keys": ["sleep"]}
    r = client.put("/focus", json={"user_id": str(UID), "keys": ["study", "steps"]})
    assert r.status_code == 200 and r.json() == {"keys": ["study", "steps"]}
    assert fakes.picks == ["study", "steps"]


def test_put_focus_rejects_too_many_or_unknown_areas(client):
    too_many = client.put("/focus", json={"user_id": str(UID), "keys": ["sleep", "steps", "study", "stress"]})
    assert too_many.status_code == 422 and "at most 3" in too_many.json()["detail"]
    assert client.put("/focus", json={"user_id": str(UID), "keys": ["nope"]}).status_code == 422

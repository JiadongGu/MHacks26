import copy
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.twin import api, finchnode, store

from .conftest import load

HEADERS = {"X-Internal-Token": "dev-internal-token"}


class FakeDb:
    def __init__(self):
        self.twins: dict = {}
        self.ehr: dict = {}
        self.profile = None
        self.daily: list = []

    async def profile_row(self, user_id):
        return self.profile

    async def latest_twin(self, user_id):
        rows = self.twins.get(user_id, [])
        return copy.deepcopy(rows[-1]) if rows else None

    async def list_versions(self, user_id):
        return [
            {"version": r["version"], "created_at": r["created_at"], "summary": r["summary"]}
            for r in reversed(self.twins.get(user_id, []))
        ]

    async def daily_rows(self, user_id, start, end, metrics):
        return [r for r in self.daily if start <= r["day"] <= end and r["metric"] in metrics]

    async def insert_twin(self, user_id, model, summary):
        rows = self.twins.setdefault(user_id, [])
        rows.append(
            {
                "version": len(rows) + 1,
                "model": copy.deepcopy(model),
                "summary": summary,
                "created_at": datetime.now(UTC),
            }
        )
        return len(rows)

    async def save_import(self, user_id, scenario_id, categories, model, summary):
        self.ehr[user_id] = (scenario_id, categories)
        return await self.insert_twin(user_id, model, summary)


@pytest.fixture
def fake(monkeypatch):
    f = FakeDb()
    for name in ("profile_row", "latest_twin", "list_versions", "daily_rows", "insert_twin", "save_import"):
        monkeypatch.setattr(store, name, getattr(f, name))

    async def fetch(patient_id, client=None):
        if patient_id == "patient-demo-down":
            raise finchnode.FinchNodeError("down")
        if patient_id == "patient-demo-missing":
            raise finchnode.FinchNodeNotFound(patient_id)
        return load(patient_id), "live"

    monkeypatch.setattr(finchnode, "fetch_records", fetch)
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
    assert anon.get(f"/twin/{uid}").status_code == 401
    assert anon.get("/twin/finchnode/patients").status_code == 401
    assert (
        anon.post("/twin/import", json={"user_id": str(uid), "scenario": "baseline-adult"}).status_code == 401
    )
    assert anon.post(f"/twin/{uid}/rebuild").status_code == 401
    assert anon.post(f"/twin/{uid}/onboarding", json={}).status_code == 401
    assert anon.get(f"/twin/{uid}/versions").status_code == 401


def test_import_scenario_creates_version_one(client, fake):
    uid = uuid4()
    r = client.post("/twin/import", json={"user_id": str(uid), "scenario": "baseline-adult"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["user_id"] == str(uid) and body["version"] == 1
    assert set(body["model"]["risk_flags"]) == {"t2dm", "hypertension"}
    assert body["model"]["provenance"]["finchnode_source"] == "live"
    assert "Hypertensive disorder" in body["summary"]
    scenario_id, categories = fake.ehr[uid]
    assert scenario_id == "baseline-adult"
    assert set(categories) == {
        "demographics",
        "medications",
        "conditions",
        "labs",
        "vitals",
        "allergies",
        "immunizations",
        "encounters",
    }
    assert client.get(f"/twin/{uid}").json()["version"] == 1


def test_import_by_patient_id_and_user_profile_wins(client, fake):
    uid = uuid4()
    fake.profile = {
        "dob": datetime(1990, 1, 1).date(),
        "sex": "male",
        "height_cm": 180,
        "weight_kg": 80,
        "timezone": "America/Chicago",
    }
    r = client.post("/twin/import", json={"user_id": str(uid), "patient_id": "patient-demo-polypharmacy"})
    prof = r.json()["model"]["profile"]
    assert prof["sex"] == "male" and prof["height_cm"] == 180 and prof["timezone"] == "America/Chicago"
    assert prof["age"] != 78
    assert r.json()["model"]["thresholds"]["suppress_low_hr"] is True


def test_import_validation_and_failures(client):
    uid = str(uuid4())
    assert client.post("/twin/import", json={"user_id": uid}).status_code == 422
    both = {"user_id": uid, "scenario": "baseline-adult", "patient_id": "patient-demo-001"}
    assert client.post("/twin/import", json=both).status_code == 422
    assert client.post("/twin/import", json={"user_id": uid, "patient_id": "../etc"}).status_code == 422
    assert (
        client.post("/twin/import", json={"user_id": "nope", "scenario": "baseline-adult"}).status_code == 422
    )
    assert (
        client.post("/twin/import", json={"user_id": uid, "patient_id": "patient-demo-down"}).status_code
        == 502
    )
    missing = client.post("/twin/import", json={"user_id": uid, "patient_id": "patient-demo-missing"})
    assert missing.status_code == 404


def test_onboarding_creates_new_version(client):
    uid = uuid4()
    client.post("/twin/import", json={"user_id": str(uid), "scenario": "baseline-adult"})
    r = client.post(
        f"/twin/{uid}/onboarding",
        json={
            "profile": {
                "dob": "1988-04-17",
                "sex": "female",
                "height_cm": 168,
                "weight_kg": 71,
                "display_name": "ignored",
            },
            "family_history": [{"relation": "father", "condition": "type 2 diabetes"}],
            "edits": {"allergies": {"add": ["Shellfish"]}},
        },
    )
    assert r.status_code == 200, r.text
    model = r.json()["model"]
    assert r.json()["version"] == 2
    assert model["family_history"][0]["source"] == "self_reported"
    assert model["allergies"] == ["penicillin", "shellfish"]
    assert model["profile"]["height_cm"] == 168
    assert "Family history (self-reported)" in r.json()["summary"]


def test_onboarding_without_import_and_validation(client):
    uid = uuid4()
    r = client.post(f"/twin/{uid}/onboarding", json={"profile": {"sex": "female", "height_cm": 168}})
    assert r.status_code == 200 and r.json()["version"] == 1
    assert r.json()["model"]["conditions"] == []
    assert client.post(f"/twin/{uid}/onboarding", json={"profile": {"height_cm": 5}}).status_code == 422
    assert (
        client.post(
            f"/twin/{uid}/onboarding", json={"family_history": [{"relation": "", "condition": "x"}]}
        ).status_code
        == 422
    )
    assert (
        client.post(f"/twin/{uid}/onboarding", json={"profile": {"timezone": "../../etc"}}).status_code == 422
    )


def test_rebuild_uses_last_seven_days_of_daily_summary(client, fake):
    uid = uuid4()
    client.post("/twin/import", json={"user_id": str(uid), "scenario": "baseline-adult"})
    today = datetime.now(UTC).date()
    for i in range(10):
        fake.daily.append(
            {
                "day": today - timedelta(days=i),
                "metric": "resting_heart_rate",
                "avg": 60.0 if i < 7 else 99.0,
                "min": None,
                "max": None,
                "sum": None,
                "n": 9,
            }
        )
    r = client.post(f"/twin/{uid}/rebuild")
    assert r.status_code == 200 and r.json()["version"] == 2
    model = r.json()["model"]
    assert model["baselines"]["resting_hr"] == 60
    assert model["baselines"]["sources"]["resting_hr"] == "daily_summary"
    assert model["baselines"]["clinical_bp"] == "124/78"
    assert "last_rebuild" in model["provenance"]
    assert model["thresholds"]["bp_warn"] == [130, 80]


def test_rebuild_applies_profile_edits(client, fake):
    uid = uuid4()
    client.post("/twin/import", json={"user_id": str(uid), "scenario": "baseline-adult"})
    fake.profile = {"dob": None, "sex": "female", "height_cm": 170.0, "weight_kg": 81.6,
                    "timezone": "America/Detroit"}
    model = client.post(f"/twin/{uid}/rebuild").json()["model"]
    assert model["profile"]["weight_kg"] == 81.6
    assert model["profile"]["height_cm"] == 170.0
    assert model["profile"]["timezone"] == "America/Detroit"


def test_rebuild_and_get_without_twin_return_404(client):
    uid = uuid4()
    assert client.post(f"/twin/{uid}/rebuild").status_code == 404
    assert client.get(f"/twin/{uid}").status_code == 404


def test_versions_list(client):
    uid = uuid4()
    client.post("/twin/import", json={"user_id": str(uid), "scenario": "sparse-record"})
    client.post(f"/twin/{uid}/rebuild")
    versions = client.get(f"/twin/{uid}/versions").json()
    assert [v["version"] for v in versions] == [2, 1]
    assert set(versions[0]) == {"version", "created_at", "summary"}


def test_patient_picker_live_and_fallback(client, monkeypatch):
    async def live():
        return [
            {
                "id": "patient-demo-001",
                "scenario": "baseline-adult",
                "displayName": "Morgan Rivera",
                "birthDate": "1988-04-17",
                "recordsUrl": "https://x",
            }
        ]

    monkeypatch.setattr(finchnode, "list_patients", live)
    assert client.get("/twin/finchnode/patients").json() == [
        {
            "id": "patient-demo-001",
            "scenario": "baseline-adult",
            "displayName": "Morgan Rivera",
            "birthDate": "1988-04-17",
        }
    ]

    async def down():
        raise finchnode.FinchNodeError("down")

    monkeypatch.setattr(finchnode, "list_patients", down)
    fallback = client.get("/twin/finchnode/patients").json()
    assert "baseline-adult" in {p["scenario"] for p in fallback}

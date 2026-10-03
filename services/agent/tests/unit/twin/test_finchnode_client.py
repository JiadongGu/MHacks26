import httpx
import pytest
import respx

from app.twin import finchnode

from .conftest import load

BASE = finchnode.BASE_URL


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    monkeypatch.setattr(finchnode, "RETRY_DELAY_S", 0)


@respx.mock
async def test_list_patients():
    route = respx.get(f"{BASE}/patients").respond(
        json={"object": "list", "data": [{"id": "patient-demo-001", "scenario": "baseline-adult"}, {"x": 1}]}
    )
    patients = await finchnode.list_patients()
    assert route.called
    assert [p["id"] for p in patients] == ["patient-demo-001"]


@respx.mock
async def test_get_records_returns_body():
    respx.get(f"{BASE}/patients/patient-demo-001/records").respond(json=load("patient-demo-001"))
    body = await finchnode.get_records("patient-demo-001")
    assert body["scenario"] == "baseline-adult"


@respx.mock
async def test_retry_once_on_server_error():
    route = respx.get(f"{BASE}/patients/patient-demo-001/records").mock(
        side_effect=[httpx.Response(503), httpx.Response(200, json=load("patient-demo-001"))]
    )
    await finchnode.get_records("patient-demo-001")
    assert route.call_count == 2


@respx.mock
async def test_gives_up_after_retry_limit():
    route = respx.get(f"{BASE}/patients/patient-demo-001/records").mock(
        side_effect=httpx.ConnectTimeout("slow")
    )
    with pytest.raises(finchnode.FinchNodeError):
        await finchnode.get_records("patient-demo-001")
    assert route.call_count == finchnode.ATTEMPTS


@respx.mock
async def test_404_is_not_found_and_not_retried():
    route = respx.get(f"{BASE}/patients/nobody/records").respond(404)
    with pytest.raises(finchnode.FinchNodeNotFound):
        await finchnode.get_records("nobody")
    assert route.call_count == 1


@respx.mock
async def test_bad_payload_is_an_error():
    respx.get(f"{BASE}/patients/patient-demo-001/records").respond(json={"record": "no"})
    with pytest.raises(finchnode.FinchNodeError):
        await finchnode.get_records("patient-demo-001")


async def test_patient_id_is_validated_before_any_request():
    for bad in ("../x", "a/b", "", "a b", "x" * 100):
        with pytest.raises(ValueError):
            await finchnode.get_records(bad)


async def test_scenario_map_needs_no_network():
    assert await finchnode.resolve_patient_id("baseline-adult") == "patient-demo-001"
    assert await finchnode.resolve_patient_id("polypharmacy-senior") == "patient-demo-polypharmacy"
    assert await finchnode.resolve_patient_id("pediatric-asthma") == "patient-demo-pediatric-asthma"
    assert await finchnode.resolve_patient_id("sparse-record") == "patient-demo-sparse"


@respx.mock
async def test_unknown_scenario_uses_live_list_then_fails():
    respx.get(f"{BASE}/patients").respond(json={"data": [{"id": "patient-demo-new", "scenario": "new-one"}]})
    assert await finchnode.resolve_patient_id("new-one") == "patient-demo-new"
    with pytest.raises(finchnode.FinchNodeNotFound):
        await finchnode.resolve_patient_id("missing")


@respx.mock
async def test_fetch_records_falls_back_to_recorded_fixture():
    respx.get(f"{BASE}/patients/patient-demo-001/records").mock(side_effect=httpx.ConnectError("down"))
    body, origin = await finchnode.fetch_records("patient-demo-001")
    assert origin == "fixture" and body["patientId"] == "patient-demo-001"


@respx.mock
async def test_fetch_records_live_origin_and_no_fixture_means_error():
    respx.get(f"{BASE}/patients/patient-demo-001/records").respond(json=load("patient-demo-001"))
    assert (await finchnode.fetch_records("patient-demo-001"))[1] == "live"
    respx.get(f"{BASE}/patients/patient-demo-unrecorded/records").respond(500)
    with pytest.raises(finchnode.FinchNodeError):
        await finchnode.fetch_records("patient-demo-unrecorded")


def test_every_known_scenario_has_an_offline_fixture():
    for patient_id in finchnode.SCENARIO_PATIENTS.values():
        assert finchnode.load_fixture(patient_id) is not None, patient_id
    assert {p["id"] for p in finchnode.STATIC_PATIENTS} == set(finchnode.SCENARIO_PATIENTS.values())

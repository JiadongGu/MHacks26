import copy
import json
from datetime import UTC, datetime

from app.twin import builder

from .conftest import TODAY, load


def build(records: dict) -> dict:
    return builder.finalize(builder.from_finchnode(records, today=TODAY), today=TODAY)


def by_display(items: list[dict], text: str) -> dict:
    return next(i for i in items if text.lower() in i["display"].lower())


def test_morgan_profile_and_conditions(morgan):
    twin = build(morgan)
    assert twin["profile"]["age"] == 38
    assert twin["profile"]["sex"] == "female"
    assert twin["provenance"]["finchnode_scenario"] == "baseline-adult"
    assert {(c["system"], c["code"], c["status"], c["source"]) for c in twin["conditions"]} == {
        ("SNOMED", "44054006", "active", "finchnode"),
        ("SNOMED", "38341003", "active", "finchnode"),
    }
    assert set(twin["risk_flags"]) == {"t2dm", "hypertension"}


def test_morgan_medications_labs_allergies_bp(morgan):
    twin = build(morgan)
    assert {(m["rxnorm"], m["class"]) for m in twin["medications"]} == {
        ("861007", "biguanide"),
        ("314076", "ACE inhibitor"),
    }
    a1c = next(lab for lab in twin["labs"] if lab["loinc"] == "4548-4")
    assert (a1c["display"], a1c["value"], a1c["unit"], a1c["date"]) == ("HbA1c", 6.4, "%", "2026-07-18")
    assert next(lab for lab in twin["labs"] if lab["loinc"] == "13457-7")["value"] == 92
    assert all("DiagnosticReport" not in json.dumps(lab) for lab in twin["labs"])
    assert twin["allergies"] == ["penicillin"]
    assert twin["baselines"]["clinical_bp"] == "124/78"


def test_morgan_thresholds_tightened(morgan):
    t = build(morgan)["thresholds"]
    assert t["bp_warn"] == [130, 80]
    assert t["rhr_delta_warn"] == 6
    assert "suppress_low_hr" not in t


def test_polypharmacy_senior(harriet):
    twin = build(harriet)
    assert twin["profile"]["age"] == 78
    assert {"afib", "ckd", "heart_failure", "hypertension", "t2dm"} <= set(twin["risk_flags"])
    # MedicationDispense rows duplicate MedicationRequest rows and must not be counted twice.
    assert len(twin["medications"]) == 14
    assert by_display(twin["medications"], "metoprolol")["class"] == "beta blocker"
    t = twin["thresholds"]
    assert t["suppress_low_hr"] is True
    assert t["workout_hr"] == 120
    assert t["spo2_warn"] == 91
    assert t["irregular_rhythm_wording"] is True
    assert twin["baselines"]["clinical_bp"] == "133/75"
    # latest value per LOINC only
    assert len({lab["loinc"] for lab in twin["labs"]}) == len(twin["labs"])


def test_pediatric_asthma(theo):
    twin = build(theo)
    assert twin["profile"]["age"] == 9
    assert twin["profile"]["height_cm"] == 128.4
    assert twin["profile"]["weight_kg"] == 26.8
    assert twin["risk_flags"] == ["asthma"]
    classes = {m["class"] for m in twin["medications"]}
    assert {"SABA", "ICS"} <= classes
    assert twin["thresholds"]["workout_hr"] == 160
    assert twin["baselines"]["clinical_bp"] is None


def test_sparse_record_does_not_fail(jonah):
    twin = build(jonah)
    assert twin["profile"]["age"] == 30
    assert twin["conditions"] == [] and twin["medications"] == [] and twin["labs"] == []
    assert twin["allergies"] == [] and twin["risk_flags"] == []
    assert twin["baselines"]["sources"]["resting_hr"] == "default"
    assert "No active conditions" in builder.summarize(twin)


def test_messy_coding_record():
    twin = build(load("patient-demo-messy-coding"))
    displays = {c["display"]: c for c in twin["conditions"]}
    assert displays["high cholesterol"]["code"] is None
    assert displays["high cholesterol"]["system"] == "TEXT"
    assert displays["Essential hypertension"]["status"] == "unknown"
    assert {"hypertension", "t2dm", "hyperlipidemia"} <= set(twin["risk_flags"])
    assert any(
        m["display"].startswith("blood pressure pill") and m["rxnorm"] is None for m in twin["medications"]
    )
    assert twin["allergies"] == ["seasonal", "amoxicillin"]
    assert twin["profile"]["weight_kg"] == 76.2  # 168 lb converted to kg
    assert twin["baselines"]["clinical_bp"] is None  # systolic only
    assert all(lab["value"] is not None for lab in twin["labs"])
    assert twin["thresholds"]["suppress_low_hr"] is True


def test_multi_source_deduplicates():
    twin = build(load("patient-demo-multi-source"))
    assert [c["display"] for c in twin["conditions"]].count("Hypothyroidism") == 1
    assert [m["rxnorm"] for m in twin["medications"]].count("966221") == 1
    assert twin["allergies"] == ["latex"]  # "No known allergy" is dropped
    assert twin["baselines"]["clinical_bp"] == "121/78"  # latest reading
    assert next(lab for lab in twin["labs"] if lab["loinc"] == "3016-3")["value"] == 3.4


def test_accepts_inner_record_and_garbage():
    inner = load("patient-demo-001")["record"]
    assert builder.from_finchnode(inner, today=TODAY)["risk_flags"]
    assert builder.from_finchnode({}, today=TODAY)["conditions"] == []
    junk = {
        "record": {
            "conditions": "nope",
            "medications": [None, 3, {}],
            "labs": [{"code": 5}],
            "vitals": [{"component": "x"}],
            "demographics": [{"birthDate": "garbage"}],
        }
    }
    twin = builder.from_finchnode(junk, today=TODAY)
    assert twin["profile"]["age"] is None and twin["medications"] == []


def test_resolved_condition_is_not_a_risk_flag(morgan):
    data = copy.deepcopy(morgan)
    data["record"]["conditions"][1]["clinicalStatus"]["coding"][0]["code"] = "resolved"
    twin = build(data)
    assert twin["risk_flags"] == ["t2dm"]
    assert twin["thresholds"]["bp_warn"] == [140, 90]


def test_twin_is_json_serializable(morgan, harriet):
    for rec in (morgan, harriet):
        json.dumps(build(rec))


def test_classify_medication():
    cases = {
        "Lisinopril 10 mg": "ACE inhibitor",
        "losartan 50 MG": "ARB",
        "atenolol 25 MG": "beta blocker",
        "carvedilol 6.25": "beta blocker",
        "Metformin 500": "biguanide",
        "rosuvastatin 10": "statin",
        "albuterol inhaler": "SABA",
        "fluticasone propionate inhaler": "ICS",
        "mystery drug": None,
    }
    for text, expected in cases.items():
        assert builder.classify_medication(text) == expected, text
    assert builder.classify_medication("nystatin cream") is None


def test_immunizations_latest_dose_per_vaccine_newest_first(harriet):
    items = builder.from_finchnode(harriet, today=TODAY)["immunizations"]
    assert len(items) == 3  # four doses, but the high-dose flu shot appears twice
    assert next(i for i in items if i["code"] == "135")["date"] == "2025-10-14"
    assert [i["date"] for i in items] == sorted((i["date"] for i in items), reverse=True)
    assert {"display", "code", "date"} == set(items[0])


def test_immunizations_skip_not_done_and_keep_newest_dose():
    def shot(code, day, status="completed"):
        return {
            "status": status,
            "vaccineCode": {"coding": [{"code": code, "display": "Flu"}]},
            "occurrenceDateTime": day,
        }

    doses = [shot("88", "2023-10-01"), shot("88", "2024-10-02"), shot("21", "2025-01-01", "not-done")]
    rec = {"immunizations": doses}
    assert builder.from_finchnode(rec, today=TODAY)["immunizations"] == [
        {"display": "Flu", "code": "88", "date": "2024-10-02"}
    ]


def test_encounters_are_the_five_most_recent(harriet):
    items = builder.from_finchnode(harriet, today=TODAY)["encounters"]
    assert len(items) == 5  # the record has 10
    assert [e["date"] for e in items] == sorted((e["date"] for e in items), reverse=True)
    assert {"type", "class", "date"} == set(items[0])


def test_encounter_without_date_or_cancelled_is_dropped():
    rec = {
        "encounters": [
            {"status": "finished", "type": [{"text": "Visit"}]},
            {"status": "cancelled", "type": [{"text": "V"}], "period": {"start": "2025-01-01T10:00:00Z"}},
            {"status": "finished","type": [{"text": "Checkup"}], "period": {"start": "2025-02-01T10:00:00Z"}},
        ]
    }
    assert [e["type"] for e in builder.from_finchnode(rec, today=TODAY)["encounters"]] == ["Checkup"]


def test_provenance_records_source_system_and_category_counts(morgan, jonah):
    prov = builder.from_finchnode(morgan, today=TODAY)["provenance"]
    assert prov["finchnode_system"] == "northstar-health"
    assert prov["finchnode_synthetic"] is True
    assert prov["finchnode_categories"]["medications"] == 6
    sparse = builder.from_finchnode(jonah, today=TODAY)
    assert sparse["immunizations"] == [] and sparse["encounters"][0]["date"]


def test_new_keys_survive_onboarding_merge_and_empty_twin_has_them(morgan):
    merged = builder.merge_onboarding(build(morgan), {}, [], {})
    assert merged["immunizations"] and merged["encounters"]
    empty = builder.empty_twin()
    assert empty["immunizations"] == [] and empty["encounters"] == []


def test_merge_onboarding(morgan):
    base = build(morgan)
    now = datetime(2026, 10, 3, 12, tzinfo=UTC)
    merged = builder.merge_onboarding(
        base,
        {
            "dob": "1990-10-04",
            "sex": "F",
            "height_cm": 168,
            "weight_kg": 71,
            "timezone": "America/Chicago",
            "display_name": "ignored",
        },
        [{"relation": "father", "condition": "type 2 diabetes"}, {"relation": "", "condition": "x"}],
        {
            "allergies": {"add": ["Shellfish"], "remove": ["PENICILLIN"]},
            "conditions": {"add": [{"display": "Migraine"}], "remove": ["38341003"]},
            "medications": {"add": [{"display": "Atenolol 25 mg"}], "remove": ["metformin 500 mg tablet"]},
        },
        now=now,
    )
    assert merged["profile"] == {
        "age": 35,
        "sex": "female",
        "height_cm": 168,
        "weight_kg": 71,
        "timezone": "America/Chicago",
    }
    assert merged["family_history"] == [
        {"relation": "father", "condition": "type 2 diabetes", "source": "self_reported"}
    ]
    assert merged["allergies"] == ["shellfish"]
    assert {c["display"] for c in merged["conditions"]} == {"Type 2 diabetes mellitus", "Migraine"}
    assert next(c for c in merged["conditions"] if c["display"] == "Migraine")["source"] == "self_reported"
    assert [m["display"] for m in merged["medications"]] == ["Lisinopril 10 mg tablet", "Atenolol 25 mg"]
    assert merged["risk_flags"] == ["t2dm"]
    assert merged["thresholds"]["bp_warn"] == [140, 90]
    assert merged["thresholds"]["suppress_low_hr"] is True
    assert merged["provenance"]["onboarding_at"] == now.isoformat()
    assert base["allergies"] == ["penicillin"]  # input is not mutated


def test_summarize_is_deterministic_and_mentions_key_facts(morgan):
    twin = build(morgan)
    text = builder.summarize(twin)
    assert text == builder.summarize(copy.deepcopy(twin))
    assert "\n" not in text
    for needle in (
        "38-year-old female",
        "Hypertensive disorder",
        "Lisinopril",
        "HbA1c 6.4",
        "130/80",
        "124/78",
    ):
        assert needle in text

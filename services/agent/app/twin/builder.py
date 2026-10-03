"""Pure functions that build and update the digital twin. No I/O. A missing clock argument means now."""

from __future__ import annotations

import copy
import re
import statistics
from collections.abc import Iterable, Mapping
from datetime import UTC, date, datetime
from typing import Any

DEFAULT_TIMEZONE = "America/Detroit"
BASELINE_DAYS = 7

LOINC_BP_PANEL = "85354-9"
LOINC_SYSTOLIC = "8480-6"
LOINC_DIASTOLIC = "8462-4"
LOINC_HEART_RATE = "8867-4"
LOINC_WEIGHT = "29463-7"
LOINC_HEIGHT = "8302-2"

# Short display names for common labs. Unknown codes keep the source text.
LAB_NAMES: dict[str, str] = {
    "4548-4": "HbA1c",
    "13457-7": "LDL cholesterol",
    "2085-9": "HDL cholesterol",
    "2093-3": "Total cholesterol",
    "2571-8": "Triglycerides",
    "2160-0": "Creatinine",
    "98979-8": "eGFR",
    "2823-3": "Potassium",
    "2951-2": "Sodium",
    "3094-0": "Blood urea nitrogen",
    "3016-3": "TSH",
    "718-7": "Hemoglobin",
    "6690-2": "White blood cells",
    "777-3": "Platelets",
    "14749-6": "Glucose",
    "2276-4": "Ferritin",
}

# Labs that the summary shows first.
LAB_PRIORITY = ["4548-4", "98979-8", "13457-7", "2160-0", "3016-3", "14749-6"]

# Ordered. The first match wins, so put specific patterns before general ones.
MED_CLASSES: list[tuple[re.Pattern[str], str]] = [
    (
        re.compile(
            r"\bnasal\b.*\b(fluticasone|budesonide|mometasone)|"
            r"\b(fluticasone|budesonide|mometasone)\b.*\bnasal\b",
            re.I,
        ),
        "nasal corticosteroid",
    ),
    (re.compile(r"\b(salmeterol|formoterol|vilanterol)\b", re.I), "ICS/LABA"),
    (re.compile(r"\b(albuterol|salbutamol|levalbuterol)\b", re.I), "SABA"),
    (re.compile(r"\b(fluticasone|budesonide|beclomethasone|mometasone|ciclesonide)\b", re.I), "ICS"),
    (
        re.compile(
            r"\b(lisinopril|enalapril|ramipril|benazepril|captopril|quinapril|fosinopril|"
            r"perindopril)\b",
            re.I,
        ),
        "ACE inhibitor",
    ),
    (re.compile(r"\b\w{2,}sartan\b", re.I), "ARB"),
    (re.compile(r"\b\w{3,}olol\b|\b(carvedilol|labetalol)\b", re.I), "beta blocker"),
    (
        re.compile(r"\b(amlodipine|nifedipine|diltiazem|verapamil|felodipine)\b", re.I),
        "calcium channel blocker",
    ),
    (re.compile(r"\b(hydrochlorothiazide|chlorthalidone|indapamide)\b", re.I), "thiazide diuretic"),
    (re.compile(r"\b(furosemide|bumetanide|torsemide)\b", re.I), "loop diuretic"),
    (re.compile(r"\bmetformin\b", re.I), "biguanide"),
    (re.compile(r"\b(glipizide|glyburide|glimepiride)\b", re.I), "sulfonylurea"),
    (re.compile(r"\b\w{3,}gliflozin\b", re.I), "SGLT2 inhibitor"),
    (re.compile(r"\b\w{3,}glutide\b|\btirzepatide\b", re.I), "GLP-1 agonist"),
    (re.compile(r"\b\w{3,}gliptin\b", re.I), "DPP-4 inhibitor"),
    (re.compile(r"\binsulin\b", re.I), "insulin"),
    (re.compile(r"\b\w{3,}statin\b", re.I), "statin"),
    (re.compile(r"\b(apixaban|rivaroxaban|warfarin|dabigatran|edoxaban)\b", re.I), "anticoagulant"),
    (re.compile(r"\b(aspirin|clopidogrel|ticagrelor|prasugrel)\b", re.I), "antiplatelet"),
    (re.compile(r"\blevothyroxine\b", re.I), "thyroid hormone"),
    (re.compile(r"\b\w{3,}prazole\b", re.I), "PPI"),
    (re.compile(r"\b(sertraline|fluoxetine|escitalopram|citalopram|paroxetine)\b", re.I), "SSRI"),
    (re.compile(r"\b(trazodone|bupropion|mirtazapine|venlafaxine|duloxetine)\b", re.I), "antidepressant"),
    (re.compile(r"\bmontelukast\b", re.I), "leukotriene antagonist"),
    (re.compile(r"\b(cetirizine|loratadine|fexofenadine|diphenhydramine)\b", re.I), "antihistamine"),
    (re.compile(r"\b(ibuprofen|naproxen|meloxicam|diclofenac)\b", re.I), "NSAID"),
    (re.compile(r"\bacetaminophen\b|\bparacetamol\b", re.I), "analgesic"),
    (re.compile(r"\b\w{3,}triptan\b", re.I), "triptan"),
    (re.compile(r"\bpotassium chloride\b", re.I), "potassium supplement"),
    (re.compile(r"\b(cholecalciferol|vitamin d)\b", re.I), "vitamin D"),
    (re.compile(r"\bferrous\b", re.I), "iron supplement"),
    (re.compile(r"\bblood pressure\b", re.I), "antihypertensive"),
]

# flag -> (snomed codes, icd-10 prefixes, text regex)
RISK_RULES: dict[str, tuple[set[str], tuple[str, ...], re.Pattern[str]]] = {
    "hypertension": (
        {"38341003", "59621000", "1201005"},
        ("I10", "I11", "I12", "I13"),
        re.compile(r"(?<!pulmonary )(?<!ocular )(?<!portal )hypertens|high blood pressure", re.I),
    ),
    "t2dm": (
        {"44054006"},
        ("E11",),
        re.compile(r"type\s*(2|ii)\s*diabet|diabetes mellitus type 2|\bt2dm\b", re.I),
    ),
    "t1dm": ({"46635009"}, ("E10",), re.compile(r"type\s*(1|i)\s*diabet|\bt1dm\b", re.I)),
    "asthma": ({"426979002", "195967001"}, ("J45",), re.compile(r"asthma", re.I)),
    "afib": ({"49436004"}, ("I48",), re.compile(r"atrial fibrillation|\ba-?fib\b", re.I)),
    "ckd": ({"433144002", "709044004"}, ("N18",), re.compile(r"chronic kidney disease|\bckd\b", re.I)),
    "heart_failure": ({"84114007"}, ("I50",), re.compile(r"heart failure|\bchf\b", re.I)),
    "hyperlipidemia": (
        {"55822004"},
        ("E78",),
        re.compile(r"hyperlipid|dyslipid|high cholesterol|hypercholesterol", re.I),
    ),
    "hypothyroidism": ({"40930008"}, ("E03",), re.compile(r"hypothyroid", re.I)),
}

INACTIVE_STATUSES = {"inactive", "resolved", "remission"}
SKIP_MED_STATUSES = {"stopped", "cancelled", "completed", "entered-in-error", "draft"}
SKIP_RESOURCE_TYPES = {"MedicationDispense"}


# ---------------------------------------------------------------- small helpers


def _list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _num(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)


def _clean(text: Any) -> str | None:
    if not isinstance(text, str):
        return None
    text = " ".join(text.split())
    return text or None


def _coding(concept: Any, system_hint: str | None = None) -> dict[str, Any]:
    """First coding that matches system_hint (substring), else the first coding."""
    codings = [c for c in _list(_dict(concept).get("coding")) if isinstance(c, dict)]
    if system_hint:
        for c in codings:
            if system_hint in str(c.get("system", "")):
                return c
    return codings[0] if codings else {}


def _label(concept: Any) -> str | None:
    c = _dict(concept)
    return _clean(c.get("text")) or _clean(_coding(c).get("display"))


def _system_name(system: Any) -> str:
    s = str(system or "").lower()
    if "snomed" in s:
        return "SNOMED"
    if "icd-10" in s or "icd10" in s:
        return "ICD-10"
    if "loinc" in s:
        return "LOINC"
    return "TEXT" if not s else "OTHER"


def _status_code(resource: Mapping[str, Any], field: str) -> str | None:
    code = _coding(resource.get(field)).get("code")
    return str(code).lower() if code else None


def _date_str(resource: Mapping[str, Any]) -> str | None:
    for key in ("effectiveDateTime", "issued", "recordedDate", "authoredOn"):
        value = resource.get(key)
        if isinstance(value, str) and len(value) >= 10:
            return value[:10]
    return None


def _sort_key(resource: Mapping[str, Any]) -> str:
    for key in ("effectiveDateTime", "issued"):
        value = resource.get(key)
        if isinstance(value, str):
            return value
    return ""


def _parse_date(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if not isinstance(value, str) or len(value) < 4:
        return None
    try:
        if len(value) >= 10:
            return date.fromisoformat(value[:10])
        if len(value) == 7:
            return date.fromisoformat(value + "-01")
        return date(int(value[:4]), 7, 1)
    except ValueError:
        return None


def age_on(birth: Any, today: date) -> int | None:
    b = _parse_date(birth)
    if b is None or b > today:
        return None
    return today.year - b.year - ((today.month, today.day) < (b.month, b.day))


def _to_kg(value: float, unit: str) -> float | None:
    u = unit.lower()
    if u in {"kg", "kilogram"}:
        return value
    if u in {"[lb_av]", "lb", "lbs", "pound"}:
        return value * 0.45359237
    if u == "g":
        return value / 1000
    return None


def _to_cm(value: float, unit: str) -> float | None:
    u = unit.lower()
    if u == "cm":
        return value
    if u in {"[in_i]", "in", "inch"}:
        return value * 2.54
    if u == "m":
        return value * 100
    return None


def _latest(items: Iterable[dict[str, Any]]) -> dict[str, Any] | None:
    best: dict[str, Any] | None = None
    for item in items:
        if best is None or _sort_key(item) >= _sort_key(best):
            best = item
    return best


def _vitals_with_code(vitals: list[dict[str, Any]], loinc: str) -> list[dict[str, Any]]:
    out = []
    for v in vitals:
        codings = [c for c in _list(_dict(v.get("code")).get("coding")) if isinstance(c, dict)]
        if any(c.get("code") == loinc for c in codings):
            out.append(v)
    return out


def _quantity(resource: Mapping[str, Any]) -> tuple[float | None, str]:
    q = _dict(resource.get("valueQuantity"))
    return _num(q.get("value")), str(q.get("unit") or q.get("code") or "")


def _clinical_bp(vitals: list[dict[str, Any]]) -> str | None:
    best: tuple[str, str] | None = None
    for v in vitals:
        parts: dict[str, float] = {}
        for comp in _list(v.get("component")):
            code = _coding(_dict(comp).get("code"), "loinc").get("code")
            val = _num(_dict(_dict(comp).get("valueQuantity")).get("value"))
            if code in (LOINC_SYSTOLIC, LOINC_DIASTOLIC) and val is not None:
                parts[code] = val
        if LOINC_SYSTOLIC in parts and LOINC_DIASTOLIC in parts:
            key = _sort_key(v)
            if best is None or key >= best[0]:
                best = (key, f"{round(parts[LOINC_SYSTOLIC])}/{round(parts[LOINC_DIASTOLIC])}")
    return best[1] if best else None


def classify_medication(text: str) -> str | None:
    for pattern, name in MED_CLASSES:
        if pattern.search(text):
            return name
    return None


# ---------------------------------------------------------------- FinchNode import


def _conditions(items: list[Any]) -> list[dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for r in items:
        r = _dict(r)
        if r.get("resourceType") not in (None, "Condition"):
            continue
        if _status_code(r, "verificationStatus") in {"entered-in-error", "refuted"}:
            continue
        coding = _coding(r.get("code"))
        display = _clean(coding.get("display")) or _label(r.get("code"))
        if display is None:
            continue
        code = _clean(coding.get("code"))
        status_code = _status_code(r, "clinicalStatus")
        if status_code in INACTIVE_STATUSES:
            status = status_code
        elif status_code in {"active", "recurrence", "relapse"}:
            status = "active"
        else:
            status = "unknown"
        entry = {
            "code": code,
            "system": _system_name(coding.get("system")) if code else "TEXT",
            "display": display,
            "status": status,
            "source": "finchnode",
        }
        key = f"{entry['system']}:{code}" if code else f"text:{display.lower()}"
        if key not in out or (out[key]["status"] != "active" and status == "active"):
            out[key] = entry
    return list(out.values())


def _medications(items: list[Any]) -> list[dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for r in items:
        r = _dict(r)
        if r.get("resourceType") in SKIP_RESOURCE_TYPES:
            continue
        if str(r.get("status", "")).lower() in SKIP_MED_STATUSES:
            continue
        concept = _dict(r.get("medicationCodeableConcept"))
        display = _label(concept)
        if display is None:
            continue
        rx_coding = _coding(concept, "rxnorm")
        rx = _clean(rx_coding.get("code")) if "rxnorm" in str(rx_coding.get("system", "")) else None
        key = f"rx:{rx}" if rx else f"text:{display.lower()}"
        out.setdefault(key, {"rxnorm": rx, "display": display, "class": classify_medication(display)})
    return list(out.values())


def _allergy_name(text: str) -> str | None:
    name = re.sub(r"^allergy to\s+", "", text.strip(), flags=re.I)
    name = re.sub(r"\s+allergy$", "", name, flags=re.I).strip().lower()
    if not name or name.startswith("no known"):
        return None
    return name


def _allergies(items: list[Any]) -> list[str]:
    out: list[str] = []
    for r in items:
        r = _dict(r)
        if _status_code(r, "clinicalStatus") in INACTIVE_STATUSES:
            continue
        label = _label(r.get("code"))
        name = _allergy_name(label) if label else None
        if name and name not in out:
            out.append(name)
    return out


def _labs(items: list[Any]) -> list[dict[str, Any]]:
    latest: dict[str, dict[str, Any]] = {}
    for r in items:
        r = _dict(r)
        if r.get("resourceType") not in (None, "Observation"):
            continue
        value, unit = _quantity(r)
        if value is None:
            continue
        coding = _coding(r.get("code"), "loinc")
        loinc = _clean(coding.get("code"))
        display = LAB_NAMES.get(loinc or "") or _label(r.get("code"))
        if display is None:
            continue
        key = loinc or display.lower()
        if key not in latest or _sort_key(r) >= latest[key]["_k"]:
            latest[key] = {
                "loinc": loinc,
                "display": display,
                "value": value,
                "unit": unit,
                "date": _date_str(r),
                "_k": _sort_key(r),
            }
    rows = sorted(latest.values(), key=lambda x: (x["_k"], x["display"]), reverse=True)
    for row in rows:
        del row["_k"]
    return rows


SKIP_IMMUNIZATION_STATUSES = {"not-done", "entered-in-error"}
SKIP_ENCOUNTER_STATUSES = {"cancelled", "entered-in-error", "planned"}
RECENT_ENCOUNTERS = 5


def _immunizations(items: list[Any]) -> list[dict[str, Any]]:
    """Latest dose per vaccine, newest first."""
    latest: dict[str, dict[str, Any]] = {}
    for r in items:
        r = _dict(r)
        if str(r.get("status", "")).lower() in SKIP_IMMUNIZATION_STATUSES:
            continue
        concept = _dict(r.get("vaccineCode"))
        display = _label(concept)
        if display is None:
            continue
        when = _clean(r.get("occurrenceDateTime"))
        code = _clean(_coding(concept).get("code"))
        entry = {"display": display, "code": code, "date": when[:10] if when else None}
        key = (entry["code"] or display).lower()
        if key not in latest or (entry["date"] or "") >= (latest[key]["date"] or ""):
            latest[key] = entry
    return sorted(latest.values(), key=lambda e: (e["date"] or "", e["display"]), reverse=True)


def _encounters(items: list[Any]) -> list[dict[str, Any]]:
    """The most recent visits, newest first."""
    out: list[dict[str, Any]] = []
    for r in items:
        r = _dict(r)
        if str(r.get("status", "")).lower() in SKIP_ENCOUNTER_STATUSES:
            continue
        start = _clean(_dict(r.get("period")).get("start"))
        kind = _label(next(iter(_list(r.get("type"))), None)) or _clean(_dict(r.get("class")).get("display"))
        if start is None or kind is None:
            continue
        out.append({"type": kind, "class": _clean(_dict(r.get("class")).get("display")), "date": start[:10]})
    return sorted(out, key=lambda e: e["date"], reverse=True)[:RECENT_ENCOUNTERS]


def risk_flags_for(twin: Mapping[str, Any]) -> list[str]:
    flags: list[str] = []
    for c in _list(twin.get("conditions")):
        c = _dict(c)
        if c.get("status") in INACTIVE_STATUSES:
            continue
        code = str(c.get("code") or "")
        text = str(c.get("display") or "")
        for flag, (snomed, icd, pattern) in RISK_RULES.items():
            if flag in flags:
                continue
            if code in snomed or (code and code.startswith(icd)) or pattern.search(text):
                flags.append(flag)
    return flags


def from_finchnode(records: Mapping[str, Any], *, today: date | None = None) -> dict[str, Any]:
    """Build a partial twin from a FinchNode records response (or its inner `record` object)."""
    today = today or datetime.now(UTC).date()
    envelope = _dict(records)
    rec = _dict(envelope.get("record")) if "record" in envelope else envelope
    demo = _dict(next(iter(_list(rec.get("demographics"))), {}))
    vitals = [v for v in _list(rec.get("vitals")) if isinstance(v, dict)]

    gender = str(demo.get("gender") or "").lower()
    sex = gender if gender in {"male", "female", "other"} else None

    height_cm = weight_kg = None
    h = _latest(_vitals_with_code(vitals, LOINC_HEIGHT))
    if h:
        v, u = _quantity(h)
        height_cm = _to_cm(v, u) if v is not None else None
    w = _latest(_vitals_with_code(vitals, LOINC_WEIGHT))
    if w:
        v, u = _quantity(w)
        weight_kg = _to_kg(v, u) if v is not None else None

    hr_values = []
    for v in sorted(_vitals_with_code(vitals, LOINC_HEART_RATE), key=_sort_key, reverse=True)[:3]:
        val, _ = _quantity(v)
        if val is not None and 30 <= val <= 200:
            hr_values.append(val)
    baselines: dict[str, Any] = {"clinical_bp": _clinical_bp(vitals)}
    if hr_values:
        baselines["resting_hr"] = round(statistics.median(hr_values))

    twin: dict[str, Any] = {
        "profile": {
            "age": age_on(demo.get("birthDate"), today),
            "sex": sex,
            "height_cm": round(height_cm, 1) if height_cm else None,
            "weight_kg": round(weight_kg, 1) if weight_kg else None,
            "timezone": DEFAULT_TIMEZONE,
        },
        "conditions": _conditions(_list(rec.get("conditions"))),
        "medications": _medications(_list(rec.get("medications"))),
        "allergies": _allergies(_list(rec.get("allergies"))),
        "family_history": [],
        "labs": _labs(_list(rec.get("labs"))),
        "immunizations": _immunizations(_list(rec.get("immunizations"))),
        "encounters": _encounters(_list(rec.get("encounters"))),
        "baselines": baselines,
        "provenance": {
            "finchnode_scenario": envelope.get("scenario"),
            "finchnode_patient_id": envelope.get("patientId"),
            "finchnode_system": envelope.get("source"),
            "finchnode_synthetic": envelope.get("synthetic"),
            "finchnode_categories": {k: len(v) for k, v in rec.items() if isinstance(v, list)},
        },
    }
    twin["risk_flags"] = risk_flags_for(twin)
    return twin


def empty_twin(timezone: str = DEFAULT_TIMEZONE) -> dict[str, Any]:
    twin: dict[str, Any] = {
        "profile": {"age": None, "sex": None, "height_cm": None, "weight_kg": None, "timezone": timezone},
        "conditions": [],
        "medications": [],
        "allergies": [],
        "family_history": [],
        "labs": [],
        "immunizations": [],
        "encounters": [],
        "baselines": {},
        "provenance": {},
    }
    twin["risk_flags"] = []
    return twin


# ---------------------------------------------------------------- onboarding merge

_SEX_ALIASES = {"male": "male", "m": "male", "female": "female", "f": "female", "other": "other"}


def normalize_sex(value: Any) -> str | None:
    return _SEX_ALIASES.get(str(value).strip().lower()) if value is not None else None


def apply_profile(
    twin: Mapping[str, Any], profile: Mapping[str, Any] | None, *, today: date | None = None
) -> dict[str, Any]:
    """Return a copy of the twin with non-empty profile fields applied.

    Accepts dob (date or ISO string) or age, sex, height_cm, weight_kg, timezone. Other keys are ignored.
    """
    today = today or datetime.now(UTC).date()
    out = copy.deepcopy(dict(twin))
    prof = out.setdefault("profile", {})
    given = dict(profile or {})
    age = age_on(given.get("dob"), today) if given.get("dob") else given.get("age")
    if age is not None:
        prof["age"] = age
    sex = normalize_sex(given.get("sex"))
    if sex:
        prof["sex"] = sex
    for field in ("height_cm", "weight_kg", "timezone"):
        if given.get(field) is not None:
            prof[field] = given[field]
    return out


def _remove_matching(items: list[Any], keys: list[str], fields: tuple[str, ...]) -> list[Any]:
    wanted = {k.strip().lower() for k in keys if isinstance(k, str) and k.strip()}
    if not wanted:
        return items
    kept = []
    for item in items:
        values = [item] if isinstance(item, str) else [_dict(item).get(f) for f in fields]
        if not any(isinstance(v, str) and v.strip().lower() in wanted for v in values):
            kept.append(item)
    return kept


def merge_onboarding(
    twin: Mapping[str, Any],
    profile: Mapping[str, Any] | None,
    family_history: list[Mapping[str, Any]] | None,
    edits: Mapping[str, Any] | None,
    *,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Return a new twin with the user's profile, family history and edits applied.

    edits shape: {"conditions"|"medications"|"allergies": {"add": [...], "remove": [str]}}.
    Added entries carry source "self_reported". `remove` matches code, rxnorm, or display (case-insensitive).
    """
    now = now or datetime.now(UTC)
    out = apply_profile(twin, profile, today=now.date())

    if family_history is not None:
        out["family_history"] = [
            {
                "relation": _clean(f.get("relation")),
                "condition": _clean(f.get("condition")),
                "source": "self_reported",
            }
            for f in family_history
            if _clean(f.get("relation")) and _clean(f.get("condition"))
        ]

    e = _dict(edits)
    cond = _dict(e.get("conditions"))
    conditions = _remove_matching(out.get("conditions", []), _list(cond.get("remove")), ("code", "display"))
    for add in _list(cond.get("add")):
        display = _clean(_dict(add).get("display"))
        if display:
            code = _clean(_dict(add).get("code"))
            system = _clean(_dict(add).get("system")) or ("OTHER" if code else "TEXT")
            conditions.append(
                {
                    "code": code,
                    "system": system,
                    "display": display,
                    "status": "active",
                    "source": "self_reported",
                }
            )
    out["conditions"] = conditions

    med = _dict(e.get("medications"))
    meds = _remove_matching(out.get("medications", []), _list(med.get("remove")), ("rxnorm", "display"))
    for add in _list(med.get("add")):
        display = _clean(_dict(add).get("display"))
        if display:
            meds.append(
                {
                    "rxnorm": _clean(_dict(add).get("rxnorm")),
                    "display": display,
                    "class": classify_medication(display),
                }
            )
    out["medications"] = meds

    alg = _dict(e.get("allergies"))
    allergies = _remove_matching(out.get("allergies", []), _list(alg.get("remove")), ())
    for add in _list(alg.get("add")):
        name = _clean(add)
        if name and name.lower() not in allergies:
            allergies.append(name.lower())
    out["allergies"] = allergies

    out.setdefault("provenance", {})["onboarding_at"] = now.isoformat()
    out["risk_flags"] = risk_flags_for(out)
    out["thresholds"] = derive_thresholds(out)
    return out


# ---------------------------------------------------------------- baselines


def population_defaults(age: int | None, sex: str | None) -> dict[str, int]:
    """Population defaults by age and sex. Used only when no data exists."""
    if age is None:
        age = 35
    if age < 13:
        rhr, sleep, steps = 85, 600, 9000
    elif age < 18:
        rhr, sleep, steps = 75, 540, 8000
    elif age >= 65:
        rhr, sleep, steps = 72, 420, 4500
    else:
        rhr, sleep, steps = 70, 420, 7000
    if sex == "female" and age >= 18:
        rhr += 2
    if age < 18:
        hrv = 70
    elif age < 30:
        hrv = 60
    elif age < 40:
        hrv = 50
    elif age < 50:
        hrv = 42
    elif age < 60:
        hrv = 35
    elif age < 70:
        hrv = 30
    else:
        hrv = 25
    return {"resting_hr": rhr, "hrv_sdnn": hrv, "sleep_min": sleep, "steps": steps}


def _get(row: Any, key: str) -> Any:
    return row.get(key) if isinstance(row, Mapping) else getattr(row, key, None)


# metric in daily_summary -> (baseline key, preferred stat, fallback stat)
_DAILY_SOURCES = {
    "resting_heart_rate": ("resting_hr", "avg", "min"),
    "hrv_sdnn": ("hrv_sdnn", "avg", "min"),
    "sleep_total_min": ("sleep_min", "sum", "avg"),
    "steps": ("steps", "sum", "avg"),
}


def compute_baselines(
    daily: Iterable[Any] | None,
    fallback: Mapping[str, Any] | None = None,
    *,
    age: int | None = None,
    sex: str | None = None,
    days: int = BASELINE_DAYS,
    today: date | None = None,
) -> dict[str, Any]:
    """7-day median per metric. Order of trust: daily_summary, then `fallback`, then population defaults.

    `daily` rows are DailySummary-like (dict or object with day, metric, avg, min, max, sum, n).
    When `today` is given, today's partial `steps` is ignored if other days exist.
    """
    fb = dict(fallback or {})
    fb_sources = _dict(fb.get("sources"))
    per_metric: dict[str, dict[date, float]] = {}
    for row in daily or []:
        spec = _DAILY_SOURCES.get(_get(row, "metric"))
        day = _parse_date(_get(row, "day"))
        if spec is None or day is None:
            continue
        value = _num(_get(row, spec[1]))
        if value is None:
            value = _num(_get(row, spec[2]))
        if value is None:
            continue
        per_metric.setdefault(spec[0], {})[day] = value

    defaults = population_defaults(age, sex)
    result: dict[str, Any] = {}
    sources: dict[str, str] = {}
    used_days = 0
    for key in ("resting_hr", "hrv_sdnn", "sleep_min", "steps"):
        series = per_metric.get(key, {})
        if key == "steps" and today is not None and len(series) > 1:
            series = {d: v for d, v in series.items() if d != today}
        recent = [series[d] for d in sorted(series, reverse=True)[:days]]
        if recent:
            result[key] = round(statistics.median(recent))
            sources[key] = "daily_summary"
            used_days = max(used_days, len(recent))
        elif _num(fb.get(key)) is not None:
            result[key] = round(float(fb[key]))
            sources[key] = str(fb_sources.get(key) or "finchnode")
        else:
            result[key] = defaults[key]
            sources[key] = "default"
    result["computed_from_days"] = used_days
    result["clinical_bp"] = fb.get("clinical_bp")
    result["sources"] = sources
    return result


# ---------------------------------------------------------------- thresholds

DEFAULT_THRESHOLDS: dict[str, Any] = {
    "rhr_delta_warn": 8,
    "spo2_warn": 92,
    "bp_warn": [140, 90],
    "workout_hr": 135,
    "inactivity_steps_3h": 200,
}


def derive_thresholds(twin: Mapping[str, Any]) -> dict[str, Any]:
    """Alert thresholds from the twin. Rules follow PLAN section 5.3."""
    t: dict[str, Any] = copy.deepcopy(DEFAULT_THRESHOLDS)
    flags = set(twin.get("risk_flags") if twin.get("risk_flags") is not None else risk_flags_for(twin))
    age = _dict(twin.get("profile")).get("age")

    if "hypertension" in flags:
        t["bp_warn"] = [130, 80]
        t["rhr_delta_warn"] = 6
    if isinstance(age, int | float):
        if age >= 65:
            t["spo2_warn"] = 91
            t["workout_hr"] = min(t["workout_hr"], 120)
        elif age < 18:
            t["workout_hr"] = 160
            t["spo2_warn"] = 94
            t["rhr_delta_warn"] = max(t["rhr_delta_warn"], 10)
    if "asthma" in flags:
        t["spo2_warn"] = max(t["spo2_warn"], 93)
    if any(_dict(m).get("class") == "beta blocker" for m in _list(twin.get("medications"))):
        t["suppress_low_hr"] = True
        t["workout_hr"] = min(t["workout_hr"], 120)
    if "afib" in flags:
        t["irregular_rhythm_wording"] = True
    return t


# ---------------------------------------------------------------- finalize + summary


def finalize(
    twin: Mapping[str, Any],
    daily: Iterable[Any] | None = None,
    *,
    today: date | None = None,
    now: datetime | None = None,
    rebuild: bool = False,
) -> dict[str, Any]:
    """Recompute baselines, risk flags, and thresholds. Keeps status and insights already in the twin."""
    out = copy.deepcopy(dict(twin))
    prof = _dict(out.get("profile"))
    out["baselines"] = compute_baselines(
        daily, out.get("baselines"), age=prof.get("age"), sex=prof.get("sex"), today=today
    )
    out["risk_flags"] = risk_flags_for(out)
    out["thresholds"] = derive_thresholds(out)
    out.setdefault("status", "normal")
    out.setdefault("insights", [])
    if rebuild:
        out.setdefault("provenance", {})["last_rebuild"] = (now or datetime.now(UTC)).isoformat()
    return out


def _fmt_num(value: Any) -> str:
    return f"{value:g}" if isinstance(value, int | float) else str(value)


def _join(items: list[str]) -> str:
    return ", ".join(items)


def summarize(twin: Mapping[str, Any]) -> str:
    """Deterministic one-paragraph summary. No LLM."""
    prof = _dict(twin.get("profile"))
    parts: list[str] = []
    who = []
    if prof.get("age") is not None:
        who.append(f"{prof['age']}-year-old")
    if prof.get("sex"):
        who.append(str(prof["sex"]))
    parts.append((" ".join(who) if who else "Person of unknown age and sex") + ".")

    conditions = [_dict(c) for c in _list(twin.get("conditions"))]
    active = [c for c in conditions if c.get("status") not in INACTIVE_STATUSES]
    if active:
        names = [str(c.get("display")) for c in active]
        shown = _join(names[:6]) + (f" and {len(names) - 6} more" if len(names) > 6 else "")
        parts.append(f"Active conditions: {shown}.")
    else:
        parts.append("No active conditions on record.")

    meds = [_dict(m) for m in _list(twin.get("medications"))]
    if meds:
        classes = sorted({str(m["class"]) for m in meds if m.get("class")})
        text = f"Takes {len(meds)} medication{'s' if len(meds) != 1 else ''}"
        if len(meds) <= 4:
            text += f": {_join([str(m.get('display')) for m in meds])}"
        elif classes:
            text += f", including {_join(classes[:6])}"
        parts.append(text + ".")
    else:
        parts.append("No medications on record.")

    allergies = _list(twin.get("allergies"))
    if allergies:
        parts.append(f"Allergies: {_join([str(a) for a in allergies])}.")
    else:
        parts.append("No known allergies on record.")

    fam = [_dict(f) for f in _list(twin.get("family_history"))]
    if fam:
        parts.append(
            "Family history (self-reported): "
            + _join([f"{f.get('relation')}: {f.get('condition')}" for f in fam])
            + "."
        )

    all_labs = [_dict(lab) for lab in _list(twin.get("labs"))]
    rank = {code: i for i, code in enumerate(LAB_PRIORITY)}
    labs = sorted(all_labs, key=lambda lab: rank.get(lab.get("loinc"), len(rank)))[:3]
    if labs:
        parts.append(
            "Recent labs: "
            + _join(
                [
                    f"{lab.get('display')} {_fmt_num(lab.get('value'))} {lab.get('unit')}".strip()
                    + (f" ({lab['date']})" if lab.get("date") else "")
                    for lab in labs
                ]
            )
            + "."
        )

    b = _dict(twin.get("baselines"))
    base = []
    if b.get("resting_hr") is not None:
        base.append(f"resting heart rate {_fmt_num(b['resting_hr'])} bpm")
    if b.get("hrv_sdnn") is not None:
        base.append(f"HRV {_fmt_num(b['hrv_sdnn'])} ms")
    if b.get("sleep_min") is not None:
        base.append(f"sleep {b['sleep_min'] / 60:.1f} h")
    if b.get("steps") is not None:
        base.append(f"{_fmt_num(b['steps'])} steps a day")
    if base:
        parts.append("Baselines: " + _join(base) + ".")
    if b.get("clinical_bp"):
        parts.append(f"Last clinic blood pressure {b['clinical_bp']}.")

    t = _dict(twin.get("thresholds"))
    if t:
        bp = _list(t.get("bp_warn"))
        text = (
            f"Alerts: resting heart rate {_fmt_num(t.get('rhr_delta_warn'))} bpm above baseline, "
            f"SpO2 below {_fmt_num(t.get('spo2_warn'))}%"
        )
        if len(bp) == 2:
            text += f", blood pressure above {bp[0]}/{bp[1]}"
        parts.append(text + ".")
        if t.get("suppress_low_hr"):
            parts.append("Low heart rate alerts are off because of a beta blocker.")
        if t.get("irregular_rhythm_wording"):
            parts.append("Heart rhythm messages use irregular rhythm wording because of atrial fibrillation.")
    return " ".join(parts)

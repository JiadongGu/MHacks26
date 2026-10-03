import json
from datetime import date
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[5]
FIXTURES = ROOT / "contracts" / "fixtures"
LOCAL = Path(__file__).parent / "data"
TODAY = date(2026, 10, 3)


def load(patient_id: str) -> dict:
    for folder in (FIXTURES, LOCAL):
        path = folder / f"finchnode_{patient_id}.json"
        if path.exists():
            return json.loads(path.read_text())
    raise FileNotFoundError(patient_id)


@pytest.fixture
def morgan() -> dict:
    return load("patient-demo-001")


@pytest.fixture
def harriet() -> dict:
    return load("patient-demo-polypharmacy")


@pytest.fixture
def theo() -> dict:
    return load("patient-demo-pediatric-asthma")


@pytest.fixture
def jonah() -> dict:
    return load("patient-demo-sparse")

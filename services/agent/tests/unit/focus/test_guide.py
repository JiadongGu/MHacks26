from app.focus.catalog import CATALOG
from app.focus.guide import GUIDES, guide_for
from app.twin import builder


def test_every_focus_area_has_a_guide_with_all_four_parts():
    assert {f.key for f in CATALOG} == set(GUIDES)
    for g in GUIDES.values():
        assert g.means and g.plan and g.coach and g.avoid


def test_guide_for_lists_the_picks_and_adds_sun_care_for_a_skin_cancer_history():
    plain = guide_for(["stress", "study"], set())
    assert [a["area"] for a in plain["focus_areas"]] == ["Feel less stressed", "Build better study habits"]
    assert plain["health_notes"] == []
    care = guide_for(["stress"], {"skin_cancer"})
    assert care["focus_areas"][-1]["area"].endswith("(standing care)")
    assert "dermatologist" in care["health_notes"][0]
    picked = guide_for(["sun"], {"skin_cancer"})["focus_areas"]
    assert not any(a["area"].endswith("(standing care)") for a in picked)


def test_skin_cancer_is_flagged_by_name_or_code_and_stays_on_after_remission():
    def flags(display, status="active", code=""):
        return builder.risk_flags_for({"conditions": [{"display": display, "status": status, "code": code}]})

    assert flags("Malignant melanoma of skin") == ["skin_cancer"]
    assert flags("Basal cell carcinoma") == ["skin_cancer"]
    assert flags("Personal history of melanoma", "resolved") == ["skin_cancer"]
    assert flags("x", code="Z85.820") == ["skin_cancer"]
    assert flags("Seasonal allergies") == []
    assert flags("Asthma", "resolved") == []

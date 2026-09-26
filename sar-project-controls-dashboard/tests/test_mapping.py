import pytest

from conftest import load_text
from sar_pcd.demo.rail_demo import expected_phases
from sar_pcd.mapping.classifier import HIGH, LOW, NONE, OVERRIDE, SemanticClassifier
from sar_pcd.mapping.profile import MappingProfile, default_profile
from sar_pcd.mapping.text import normalize, tokens


@pytest.mark.parametrize("scheme", ["A", "B", "C"])
def test_equivalent_concepts_map_across_naming_conventions(variants, scheme):
    """Project A: Engineering/Procurement/Construction; B: Design/Supply Chain/Site Execution;
    C: ENG/MAT/CIVIL - all must map to the same phases."""
    _bl, cu = variants[scheme]
    s = load_text(cu)
    res = SemanticClassifier(default_profile()).classify_schedule(s)
    truth = expected_phases(scheme)
    wrong = [(s.activities[t].name, c.category) for t, c in res.items()
             if truth[s.activities[t].name] and truth[s.activities[t].name] != c.category]
    assert wrong == []
    non_ms = [c for t, c in res.items() if not s.activities[t].is_milestone]
    assert sum(c.level == HIGH for c in non_ms) / len(non_ms) > 0.9


def test_uncertain_key_milestones_are_flagged_not_guessed(variants):
    s = load_text(variants["A"][1])
    res = SemanticClassifier(default_profile()).classify_schedule(s)
    ntp = next(c for t, c in res.items() if s.activities[t].name == "Notice to Proceed")
    assert ntp.level in (LOW, NONE)
    assert ntp.needs_review


def test_design_material_support_is_not_procurement(variants):
    s = load_text(variants["A"][1])
    res = SemanticClassifier(default_profile()).classify_schedule(s)
    c = next(c for t, c in res.items() if s.activities[t].name == "Design Material Support")
    assert c.category == "Engineering"
    # even without WBS/code context the suppression rule prevents 'material' -> Procurement
    raw, _ = SemanticClassifier(default_profile()).m.score("Design Material Support")
    assert "Procurement" not in raw


def test_context_decides_ambiguous_names(variants):
    s = load_text(variants["A"][1])
    res = SemanticClassifier(default_profile()).classify_schedule(s)
    by_name = {s.activities[t].name: c for t, c in res.items()}
    assert by_name["Concrete Supply Contract"].category == "Procurement"
    assert by_name["Ballast Supply - Batch 1"].category == "Procurement"
    assert by_name["Track Installation - Section A"].category == "Construction"
    assert by_name["Rails - Manufacturing"].category == "Procurement"


def test_confidence_scores_and_evidence(variants):
    s = load_text(variants["A"][1])
    res = SemanticClassifier(default_profile()).classify_schedule(s)
    c = next(c for t, c in res.items() if s.activities[t].name == "Detailed Design - Section A")
    assert c.category == "Engineering" and c.confidence >= 0.85
    assert abs(sum(c.scores.values()) - 1.0) < 1e-6
    assert any("WBS" in e for e in c.evidence)


def test_fuzzy_typo_and_abbreviations():
    clf = SemanticClassifier(default_profile())
    raw, _ = clf.m.score("Comissioning of substation")
    assert max(raw, key=raw.get) == "Testing & Commissioning"
    raw, _ = clf.m.score("T&C - Signalling")
    assert "Testing & Commissioning" in raw
    raw, _ = clf.m.score("O&M Manuals")
    assert "Handover" in raw
    assert normalize("ENG1000 DesignReview") == "eng 1000 design review"
    assert tokens("Drawings Testing") == ("draw", "test")


def test_unknown_text_is_not_mapped():
    clf = SemanticClassifier(default_profile())
    raw, _ = clf.m.score("Zyxw qwerty")
    assert raw == {}


def test_manual_overrides_win(variants):
    s = load_text(variants["A"][1])
    p = default_profile()
    act = next(a for a in s.activities.values() if a.name == "Design Material Support")
    p.activity_overrides[act.code] = "Procurement"
    p.wbs_overrides["3.3"] = "Handover"      # Stations & Structures WBS
    p.code_value_overrides["Discipline:TNC"] = "Construction"
    res = SemanticClassifier(p).classify_schedule(s)
    assert res[act.task_id].category == "Procurement" and res[act.task_id].level == OVERRIDE
    st = next(a for a in s.activities.values() if a.name == "Foundations - North Station")
    assert res[st.task_id].category == "Handover"
    tnc = next(a for a in s.activities.values() if a.name == "Energization")
    assert res[tnc.task_id].category == "Construction"


def test_profile_editing_and_json_roundtrip(tmp_path):
    p = default_profile()
    p.add_category("Enabling Works", "#123456")
    p.add_keyword("Enabling Works", "utility diversion", 1.5)
    p.synonyms["udiv"] = "utility diversion"
    path = tmp_path / "profile.json"
    p.save(path)
    q = MappingProfile.load(path)
    assert "Enabling Works" in q.category_names
    clf = SemanticClassifier(q)
    raw, _ = clf.m.score("UDIV km 12")
    assert "Enabling Works" in raw
    q.remove_keyword("Enabling Works", "utility diversion")
    assert not q.category("Enabling Works").keywords


def test_dimension_detection_uses_code_type_names(variants):
    from sar_pcd.mapping.classifier import resolve_dimensions
    for scheme in "AC":
        s = load_text(variants[scheme][1])
        dims = resolve_dimensions(s, default_profile())
        names = {s.code_types[t].name: d for t, d in dims.items()}
        if scheme == "A":
            assert names == {"Discipline": "Discipline", "Location": "Location", "Contractor": "Contractor",
                             "Work Package": "Work Package"}
        else:
            assert names == {"DISC": "Discipline", "AREA": "Location", "SUBCON": "Contractor", "PKG": "Work Package"}


def test_stage_detection():
    clf = SemanticClassifier(default_profile())
    assert clf.stage("Procurement", "Rails - Factory Acceptance Test") == "FAT"
    assert clf.stage("Procurement", "Turnouts - Submittal Approval") == "Approval"
    assert clf.stage("Procurement", "Signalling - Purchase Order") == "PO"
    assert clf.stage("Engineering", "IFC Drawings - Section A") == "IFC"
    assert clf.stage("Procurement", "Something else") is None

from conftest import load_text
from sar_pcd.analysis import matching as M


def _recon(variants, scheme="A", overrides=None):
    bl, cu = variants[scheme]
    b, c = load_text(bl), load_text(cu)
    return b, c, M.reconcile(b, c, overrides)


def test_reconciliation_statuses(variants):
    for scheme in "ABC":
        b, c, r = _recon(variants, scheme)
        st = r.stats()
        assert st[M.ADDED] == 1
        assert st[M.DELETED] == 1
        assert st[M.RENAMED] == 1
        assert st[M.SPLIT] == 3          # parent + 2 parts
        assert st.get(M.UNMATCHED, 0) == 0
        assert st[M.MODIFIED] >= 2


def test_renamed_activity_has_confidence_and_id_change(variants):
    b, c, r = _recon(variants)
    m = next(m for m in r.matches if m.status == M.RENAMED)
    assert b.activities[m.baseline_id].code == "ENG-1210"
    assert c.activities[m.current_id].code == "ENG-1215"
    assert 0.8 <= m.confidence <= 1.0
    assert m.changes[0].startswith("Activity ID")


def test_duration_change_detected(variants):
    b, c, r = _recon(variants)
    m = next(m for m in r.matches if m.current_id and c.activities[m.current_id].name == "Earthworks - Section B")
    assert m.status == M.MODIFIED
    assert any(ch.startswith("Duration: 80d -> 95d") for ch in m.changes)


def test_user_override_forces_decision(variants):
    b, c, r = _recon(variants, overrides={"ENG-1215": ""})
    m = r.by_current[c.by_code("ENG-1215").task_id]
    assert m.status == M.ADDED
    assert r.by_baseline[b.by_code("ENG-1210").task_id].status in (M.DELETED, M.UNMATCHED)
    b, c, r = _recon(variants, overrides={"CNS-1995": "PRC-1390"})
    m = r.by_current[c.by_code("CNS-1995").task_id]
    assert m.status == M.USER and b.activities[m.baseline_id].code == "PRC-1390"


def test_uncertain_matches_are_not_forced():
    """Two near-identical baseline candidates for one renamed activity -> Unmatched, with candidates."""
    from datetime import date
    from sar_pcd.demo.generator import GA, GenProject, build_xer
    wbs = [("W", None, "1", "Construction")]
    base = GenProject("P", "P", date(2025, 1, 6), wbs, [
        GA("X-1", "Pour concrete slab level 1", "W", 5), GA("X-2", "Pour concrete slab level 2", "W", 5)],
        {}, "monfri")
    cur = GenProject("P", "P", date(2025, 1, 6), wbs, [GA("Y-9", "Pour concrete slab level", "W", 5)], {}, "monfri")
    b = load_text(build_xer(base, proj_id=1, task_base=1))
    c = load_text(build_xer(cur, proj_id=2, task_base=50))
    r = M.reconcile(b, c)
    m = r.by_current[c.by_code("Y-9").task_id]
    assert m.status == M.UNMATCHED
    assert len(m.candidates) == 2

"""Progress, SPI/CPI, float, critical path and lookahead calculations on
small hand-checkable schedules."""
from datetime import timedelta

import pytest

from sar_pcd.analysis import metrics as MX
from sar_pcd.analysis.settings import AnalysisSettings
from sar_pcd.services.dashboard import build


def test_planned_and_actual_progress_are_weighted_not_averaged(small):
    # Data date = working day 5; A (10d, cost 10,000) 50% physical; B (10d, cost 30,000) not started
    ctx = small(progress={"MS-1": {"as": 0, "af": 0, "rem": 0, "pct": 100}, "A-1": {"as": 0, "af": None, "rem": 5, "pct": 50.0}}, dd=5)
    assert ctx.weighting == "Cost"
    p = MX.progress(ctx, ctx.rows)
    assert p["planned"] == pytest.approx(12.5)     # 10,000 × 0.5 / 40,000
    assert p["actual"] == pytest.approx(12.5)
    assert p["variance"] == pytest.approx(0.0)
    # A complete, B 0% -> cost-weighted 25% (a simple average would give 50%)
    ctx = small(progress={"MS-1": {"as": 0, "af": 0, "rem": 0, "pct": 100}, "A-1": {"as": 0, "af": 10, "rem": 0, "pct": 100.0}}, dd=10)
    p = MX.progress(ctx, ctx.rows)
    assert p["actual"] == pytest.approx(25.0)
    assert p["planned"] == pytest.approx(25.0)


def test_milestones_carry_zero_weight(small):
    ctx = small()
    ms = [r for r in ctx.rows if r.is_milestone]
    assert ms and all(r.weight == 0 and r.bl_weight == 0 for r in ms)


def test_duration_weighting_when_selected(small):
    ctx = small(progress={"MS-1": {"as": 0, "af": 0, "rem": 0, "pct": 100}, "A-1": {"as": 0, "af": 10, "rem": 0, "pct": 100.0}}, dd=10)
    ctx.settings.weighting = "Original Duration"
    from sar_pcd.analysis.context import ProjectContext
    ctx2 = ProjectContext(ctx.bl, ctx.cur, ctx.profile, AnalysisSettings(weighting="Original Duration"))
    assert MX.progress(ctx2, ctx2.rows)["actual"] == pytest.approx(50.0)


def test_spi_cpi_from_earned_value(small):
    # A done at day 10 with actual cost 10% over budget
    prog = {"MS-1": {"as": 0, "af": 0, "rem": 0, "pct": 100}, "A-1": {"as": 0, "af": 10, "rem": 0, "pct": 100.0}}
    ctx = small(progress=prog, dd=10, cost_factor={"A-1": 1.1})
    d = build(ctx)
    e = d.evm
    assert e["BAC"] == pytest.approx(40000)
    assert e["PV"] == pytest.approx(10000)
    assert e["EV"] == pytest.approx(10000)
    assert e["AC"] == pytest.approx(11000)
    assert d.kpis["spi"].value == pytest.approx(1.0)
    assert d.kpis["cpi"].value == pytest.approx(10000 / 11000)
    assert e["EAC"] == pytest.approx(40000 / (10000 / 11000))
    assert e["VAC"] == pytest.approx(40000 - e["EAC"])
    assert "EV / AC" in d.kpis["cpi"].formula


def test_cpi_not_available_without_actual_cost(small):
    prog = {"MS-1": {"as": 0, "af": 0, "rem": 0, "pct": 100}, "A-1": {"as": 0, "af": 10, "rem": 0, "pct": 100.0}}
    ctx = small(progress=prog, dd=10, include_actual_cost=False)
    d = build(ctx)
    assert d.kpis["cpi"].available is False
    assert d.kpis["cpi"].display == "N/A"
    assert "Actual Cost Not Available" in d.kpis["cpi"].notes[0]
    assert d.kpis["spi"].available  # SPI still valid from EV/PV


def test_cpi_not_available_without_cost_data(small):
    ctx = small(rate_a=0, rate_b=0)
    d = build(ctx)
    assert d.kpis["cpi"].available is False
    assert "Cost Data Not Available" in d.kpis["cpi"].notes[0]
    assert ctx.weighting == "Original Duration"  # auto fallback, documented
    assert any("Weighting (Auto): Original Duration" in n for n in ctx.method_notes)


def test_float_and_critical_selection(small, demo_ctx):
    ctx = small()
    crit = {r.code for r in ctx.rows if r.is_critical}
    assert crit == {"MS-1", "A-1", "B-1", "MS-2"}  # single chain, TF = 0
    # Demo: must-finish date creates negative float; critical = TF <= 0 per P6 setting
    rows = [r for r in demo_ctx.rows if r.cur is not None and r.status != "Completed"]
    assert all(r.is_critical == (r.tf_d is not None and r.tf_d <= 0) for r in rows if not r.is_loe)
    near = [r for r in rows if r.is_near_critical]
    assert all(0 < r.tf_d <= 10 for r in near)
    assert "Total Float" in demo_ctx.critical_info["source"]


def test_longest_path_is_not_simply_zero_float(demo_ctx):
    lp = {r.code for r in demo_ctx.rows if r.is_longest_path}
    zero_or_less = {r.code for r in demo_ctx.rows if r.is_critical}
    assert lp and lp < zero_or_less  # longest path is a strict subset of TF<=0 activities


def test_computed_longest_path_matches_p6_flag(variants):
    """With the P6 flag removed, the traced longest path must equal P6's."""
    from conftest import load_text
    from sar_pcd.demo.rail_demo import build_variant
    from sar_pcd.mapping.profile import default_profile
    from sar_pcd.services.pipeline import build_context
    bl, cu = variants["A"]
    with_flag = build_context(load_text(bl), load_text(cu), default_profile(), AnalysisSettings())
    bl2, cu2 = build_variant("A", driving_flag=False)
    without = build_context(load_text(bl2), load_text(cu2), default_profile(), AnalysisSettings())
    assert "Computed" in without.critical_info["longest_path_source"]
    assert {r.code for r in with_flag.rows if r.is_longest_path} == {r.code for r in without.rows if r.is_longest_path}


def test_lookahead_window(demo_ctx):
    dd = demo_ctx.data_date
    la = MX.lookahead(demo_ctx, demo_ctx.rows, 6)
    end = dd + timedelta(weeks=6)
    assert la
    for r in la:
        assert r.status != "Completed"
        overdue = r.bl_finish and r.bl_finish < dd
        assert overdue or (r.start <= end and r.finish >= dd)
    la2 = MX.lookahead(demo_ctx, demo_ctx.rows, 2)
    assert len(la2) <= len(la)


def test_schedule_variance(demo_ctx):
    d = build(demo_ctx)
    k = d.kpis["sched_var"]
    days_late = (demo_ctx.forecast_finish.date() - demo_ctx.baseline_finish.date()).days
    assert k.extra["days_late"] == days_late
    assert k.extra["label"] == ("Days Behind" if days_late > 0 else "Days Ahead")
    assert k.keys  # drill-down to driving activities


def test_s_curve_consistent_with_kpis(demo_ctx):
    d = build(demo_ctx)
    sc = d.s_curve
    i = sc["dates"].index(demo_ctx.data_date.date())
    assert sc["planned"][i] == pytest.approx(d.kpis["progress_planned"].value, abs=0.01)
    assert sc["actual"][i] == pytest.approx(d.kpis["progress_actual"].value, abs=0.01)
    assert sc["forecast"][-1] == pytest.approx(100.0, abs=0.01)
    assert sc["planned"][-1] == pytest.approx(100.0, abs=0.01)
    planned = [p for p in sc["planned"] if p is not None]
    assert planned == sorted(planned)


def test_partial_cost_loading_does_not_drive_spi_cpi(small):
    """Only activity A is cost-loaded (50% coverage < 80%): SPI must be progress-based, CPI N/A."""
    prog = {"MS-1": {"as": 0, "af": 0, "rem": 0, "pct": 100}, "A-1": {"as": 0, "af": None, "rem": 5, "pct": 50.0}}
    ctx = small(progress=prog, dd=5, rate_b=0)
    d = build(ctx)
    assert d.evm["cost_reliable"] is False and d.evm["cost_coverage"] == pytest.approx(0.5)
    assert "progress-based" in d.kpis["spi"].formula
    assert d.kpis["cpi"].available is False and "Cost Loading Incomplete" in d.kpis["cpi"].notes[0]

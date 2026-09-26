"""Assembles every dashboard dataset for a filter state (single entry point
used by the UI, the PDF/Excel reports and the command line)."""
from __future__ import annotations

from dataclasses import dataclass, field

from ..analysis import filters as FL
from ..analysis import metrics as MX
from ..analysis.changes import change_analysis
from ..analysis.context import ActRow, ProjectContext
from ..analysis.health import run_health
from ..analysis.kpi import BAD, GOOD, KPI, NA, NEUTRAL, WARN
from ..analysis.risk import RiskItem, heatmap
from ..analysis.validation import validate


@dataclass
class DashboardData:
    ctx: ProjectContext
    filt: FL.FilterState
    rows: list
    kpis: dict = field(default_factory=dict)
    evm: dict = field(default_factory=dict)
    s_curve: dict = field(default_factory=dict)
    lookahead: list = field(default_factory=list)
    phases: dict = field(default_factory=dict)
    milestones: list = field(default_factory=list)
    cost: dict = field(default_factory=dict)
    risk: dict = field(default_factory=dict)
    top_delayed: list = field(default_factory=list)
    top_delayed_ms: list = field(default_factory=list)
    wbs_variance: list = field(default_factory=list)
    workfronts: list = field(default_factory=list)


class ContextCache:
    """Filter-independent results computed once per context."""

    def __init__(self, ctx: ProjectContext):
        self.ctx = ctx
        self._health = None
        self._validation = None
        self._changes = None
        self._cp_changes = None

    @property
    def health(self):
        if self._health is None:
            self._health = run_health(self.ctx)
        return self._health

    @property
    def validation(self):
        if self._validation is None:
            self._validation = validate(self.ctx)
        return self._validation

    @property
    def changes(self):
        if self._changes is None:
            self._changes = change_analysis(self.ctx)
        return self._changes

    @property
    def cp_changes(self):
        if self._cp_changes is None:
            self._cp_changes = MX.critical_path_changes(self.ctx)
        return self._cp_changes


def risk_summary(risks: list[RiskItem], bands: dict, source: str = "") -> dict:
    if not risks:
        return {"available": False, "message": "Risk Data Not Available",
                "note": "No risk register has been imported. Risks are never derived from schedule activities."}
    hm = heatmap(risks, bands)
    hm.update(available=True, source=source, items=risks)
    return hm


def build(ctx: ProjectContext, filt: FL.FilterState | None = None, risks: list[RiskItem] | None = None,
          risk_source: str = "") -> DashboardData:
    filt = filt or FL.FilterState()
    rows = FL.apply(ctx, filt) if filt.active else list(ctx.rows)
    d = DashboardData(ctx, filt, rows)
    pk = MX.progress_kpis(ctx, rows)
    prog_raw = pk.pop("_raw")
    d.kpis.update({f"progress_{k}": v for k, v in pk.items()})
    spi, cpi, e = MX.spi_cpi_kpis(ctx, rows, prog_raw)
    d.kpis["spi"], d.kpis["cpi"] = spi, cpi
    d.evm = e
    d.kpis.update(MX.schedule_summary(ctx, rows, filtered=filt.active))
    d.kpis.update({f"cp_{k}": v for k, v in MX.critical_kpis(ctx, rows).items()})
    d.s_curve = MX.s_curve(ctx, rows)
    d.lookahead = MX.lookahead(ctx, rows)
    for ph in ctx.profile.category_names:
        d.phases[ph] = MX.phase_summary(ctx, rows, ph)
    d.milestones = MX.milestones(ctx, rows)
    d.cost = MX.cost_by_group(ctx, rows)
    d.risk = risk_summary(risks or [], ctx.settings.risk_bands, risk_source)
    d.top_delayed = MX.top_delayed(rows, 25, milestones=False)
    d.top_delayed_ms = MX.top_delayed(rows, 15, milestones=True)
    d.wbs_variance = MX.wbs_variance(ctx, rows, 1)
    d.workfronts = MX.workfronts(ctx, rows)
    if d.risk.get("available"):
        c = d.risk["counts"]
        d.kpis["risks"] = KPI("risks", "Risks", d.risk["total"], str(d.risk["total"]), NEUTRAL,
                              formula="Open risks in the imported register, level from Probability × Impact bands",
                              source=risk_source, extra=c)
    else:
        d.kpis["risks"] = KPI.unavailable("risks", "Risks", d.risk["message"])
    return d


def rows_for_keys(d: DashboardData, keys: list[str]) -> list[ActRow]:
    idx = d.ctx.row_by_key()
    return [idx[k] for k in keys if k in idx]

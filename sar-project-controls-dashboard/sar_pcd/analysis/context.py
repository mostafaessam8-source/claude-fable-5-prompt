"""Analysis context: merges Current, Baseline, reconciliation and mapping into
one row per activity. All KPI modules operate on (filtered) lists of rows."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime

from ..core.model import COMPLETED, IN_PROGRESS, NOT_STARTED, Activity, Calendar, Schedule
from ..mapping.classifier import Classification, SemanticClassifier, resolve_dimensions, resolve_udf_dimensions
from ..mapping.profile import MappingProfile
from . import matching as M
from .calindex import CalIndex
from .settings import AnalysisSettings

DIMENSIONS = ("Discipline", "Location", "Contractor", "Work Package", "Phase")


@dataclass(slots=True)
class ActRow:
    key: str
    code: str
    name: str
    cur: Activity | None
    bl: Activity | None                  # 1:1 baseline counterpart (used for planned %)
    bl_ref: Activity | None              # baseline reference for display (includes split parents)
    match_status: str
    match_conf: float
    match_changes: list
    phase: str | None = None
    phase_conf: float = 0.0
    phase_level: str = ""
    phase_evidence: list = field(default_factory=list)
    stage: str | None = None
    dims: dict = field(default_factory=dict)
    wbs_path: str = ""
    wbs_code: str = ""
    wbs_ids: tuple = ()
    status: str = NOT_STARTED
    pct: float = 0.0
    orig_dur_d: float | None = None
    rem_dur_d: float | None = None
    bl_dur_d: float | None = None
    start: datetime | None = None
    finish: datetime | None = None
    bl_start: datetime | None = None
    bl_finish: datetime | None = None
    tf_d: float | None = None
    ff_d: float | None = None
    is_milestone: bool = False
    is_loe: bool = False
    is_critical: bool = False
    is_longest_path: bool = False
    is_near_critical: bool = False
    start_var_d: float | None = None
    finish_var_d: float | None = None
    dur_var_d: float | None = None
    weight: float = 0.0
    bl_weight: float = 0.0
    cal_id: str = ""
    bl_cal_id: str = ""

    @property
    def in_current(self) -> bool:
        return self.cur is not None

    @property
    def is_delayed(self) -> bool:
        return self.status != COMPLETED and self.finish_var_d is not None and self.finish_var_d > 0

    def display_status(self, data_date: datetime | None, tol: float = 0.0) -> str:
        if self.cur is None:
            return "Not in Current"
        if self.status == COMPLETED:
            return "Completed"
        if data_date and self.bl_finish and self.bl_finish < data_date:
            return "Overdue"
        if self.is_critical:
            return "Critical"
        if self.finish_var_d is not None and self.finish_var_d > tol:
            return "Delayed"
        if self.status == IN_PROGRESS:
            return "In Progress"
        return "Planned"


def _weightable(a: Activity) -> bool:
    return not (a.is_milestone or a.is_loe or a.is_wbs_summary)


class ProjectContext:
    def __init__(self, baseline: Schedule, current: Schedule, profile: MappingProfile,
                 settings: AnalysisSettings, recon: M.Reconciliation | None = None,
                 cls_cur: dict | None = None, cls_bl: dict | None = None):
        self.bl = baseline
        self.cur = current
        self.profile = profile
        self.settings = settings
        self.data_date: datetime | None = current.project.data_date
        self.bl_data_date: datetime | None = baseline.project.data_date
        self.recon = recon or M.reconcile(baseline, current, profile.match_overrides)
        clf = SemanticClassifier(profile)
        self.classifier = clf
        self.cls_cur: dict[str, Classification] = cls_cur or clf.classify_schedule(current)
        self.cls_bl: dict[str, Classification] = cls_bl or clf.classify_schedule(baseline)
        self.dims_cur = resolve_dimensions(current, profile)
        self.dims_bl = resolve_dimensions(baseline, profile)
        self.udf_dims_cur = resolve_udf_dimensions(current, profile)
        self.method_notes: list[str] = []
        self.measure, self.weighting = self._resolve_method()
        self._build_index()
        self.rows: list[ActRow] = self._build_rows()
        from .critical import apply_critical
        self.critical_info = apply_critical(self)

    # ------------------------------------------------------------------ method
    def _resolve_method(self) -> tuple[str, str]:
        s = self.settings
        acts = [a for a in self.cur.activities.values() if _weightable(a)]
        bl_acts = [a for a in self.bl.activities.values() if _weightable(a)]
        n = max(1, len(acts))
        nb = max(1, len(bl_acts))
        measure = s.progress_measure
        if measure == "Auto":
            measure = "P6"
            types = {}
            for a in acts:
                types[a.pct_type] = types.get(a.pct_type, 0) + 1
            desc = ", ".join(f"{k} {v}" for k, v in sorted(types.items(), key=lambda kv: -kv[1]))
            self.method_notes.append(f"Progress measure: each activity's P6 % complete type ({desc}).")
        else:
            self.method_notes.append(f"Progress measure selected by user: {measure}.")
        if measure == "Units" and not self.cur.availability.get("resources"):
            self.method_notes.append("Units % requested but no resource units exist; Duration % is used as fallback per activity.")
        w = s.weighting
        cov = s.weighting_coverage
        cost_cov = sum(1 for a in acts if a.budget_cost > 0) / n
        bl_cost_cov = sum(1 for a in bl_acts if a.budget_cost > 0) / nb
        unit_cov = sum(1 for a in acts if a.budget_units > 0) / n
        bl_unit_cov = sum(1 for a in bl_acts if a.budget_units > 0) / nb
        self.cost_coverage = (cost_cov, bl_cost_cov)
        if w == "Auto":
            # A cost-loaded schedule normally leaves admin / approval / milestone activities without cost:
            # they simply carry zero weight. Cost is therefore used whenever BOTH schedules are cost-loaded.
            if cost_cov > 0 and bl_cost_cov > 0:
                w = "Cost"
            elif unit_cov > 0 and bl_unit_cov > 0:
                w = "Resource Units"
            else:
                w = "Original Duration"
            self.method_notes.append(
                f"Weighting (Auto): {w}. Budget cost on {cost_cov:.0%} of current / {bl_cost_cov:.0%} of baseline activities, "
                f"resource units on {unit_cov:.0%} / {bl_unit_cov:.0%}. Order: Cost, then Resource Units (when both "
                "schedules carry them), otherwise Original Duration.")
            if w == "Cost" and min(cost_cov, bl_cost_cov) < cov:
                self.method_notes.append(
                    f"NOTE: activities without budget cost ({1 - cost_cov:.0%} of current activities) carry zero weight. "
                    "Choose another weighting in Settings if that is not intended.")
        else:
            self.method_notes.append(f"Weighting selected by user: {w}.")
            if w == "Cost" and cost_cov < cov:
                self.method_notes.append(f"WARNING: only {cost_cov:.0%} of activities carry budget cost; unloaded activities have zero weight.")
            if w == "Custom UDF" and not s.custom_weight_udf:
                self.method_notes.append("WARNING: Custom UDF weighting selected but no UDF chosen; all weights are zero.")
        self.method_notes.append("Milestones, Level-of-Effort and WBS Summary activities carry zero weight.")
        return measure, w

    def weight_of(self, a: Activity | None, sched: Schedule) -> float:
        if a is None or not _weightable(a):
            return 0.0
        w = self.weighting
        if w == "Cost":
            return a.budget_cost
        if w == "Resource Units":
            return a.budget_units
        if w == "Original Duration":
            return sched.hours_to_days(a.orig_dur_hours, a) or 0.0
        if w == "Activity Count":
            return 1.0
        if w == "Custom UDF":
            v = a.udfs.get(self.settings.custom_weight_udf)
            return float(v) if isinstance(v, (int, float)) else 0.0
        return 0.0

    # ------------------------------------------------------------------ rows
    def _build_index(self) -> None:
        dates: list[date] = []
        for sch in (self.bl, self.cur):
            for a in sch.activities.values():
                for d in (a.start, a.finish, a.act_start, a.act_finish):
                    if d:
                        dates.append(d.date())
        if self.data_date:
            dates.append(self.data_date.date())
        if not dates:
            dates = [date.today()]
        self.ci = CalIndex([], min(dates), max(dates))
        self._cal_keys: dict[tuple[int, str], str] = {}
        for sch_no, sch in enumerate((self.bl, self.cur)):
            for c in sch.calendars.values():
                key = f"{sch_no}:{c.id}"
                self._cal_keys[(sch_no, c.id)] = key
                cc = Calendar(key, c.name, c.hours_per_day, list(c.workdays), set(c.holidays), set(c.extra_workdays))
                self.ci.ensure(cc)
        self.ci.ensure(Calendar("__default__", "Default Mon-Fri"))

    def cal_key(self, sched: Schedule, a: Activity) -> str:
        sch_no = 0 if sched is self.bl else 1
        cal = sched.calendar(a)
        return self._cal_keys.get((sch_no, cal.id), "__default__")

    def _var_days(self, sched: Schedule, a: Activity, b: datetime | None, c: datetime | None) -> float | None:
        if b is None or c is None:
            return None
        if self.settings.variance_basis == "Working Days":
            key = self.cal_key(sched, a)
            i, j = self.ci.idx(b), self.ci.idx(c)
            return float(self.ci.workdays(key, i, j) if j >= i else -self.ci.workdays(key, j, i))
        return float((c.date() - b.date()).days)

    def _build_rows(self) -> list[ActRow]:
        cur, bl = self.cur, self.bl
        rows: list[ActRow] = []
        tol = self.settings.delay_tolerance_days
        for m in self.recon.matches:
            c = cur.activities.get(m.current_id) if m.current_id else None
            b = bl.activities.get(m.baseline_id) if m.baseline_id else None
            if c is None and b is None:
                continue
            one_to_one = c is not None and b is not None and m.status != M.SPLIT
            src, sched = (c, cur) if c is not None else (b, bl)
            cl = (self.cls_cur if c is not None else self.cls_bl).get(src.task_id)
            dims_map = self.dims_cur if c is not None else self.dims_bl
            dims = {}
            for type_id, dim in dims_map.items():
                if dim in DIMENSIONS and dim not in dims:
                    lab = sched.code_label(src, type_id)
                    if lab:
                        dims[dim] = lab
            if c is not None:
                for lab, dim in self.udf_dims_cur.items():
                    v = c.udfs.get(lab)
                    if isinstance(v, str) and v and dim not in dims:
                        dims[dim] = v
            path = sched.wbs_path(src.wbs_id)
            r = ActRow(
                key=(c.task_id if c is not None else "BL:" + b.task_id),
                code=src.code, name=src.name, cur=c, bl=b if (one_to_one or c is None) else None,
                bl_ref=b, match_status=m.status, match_conf=m.confidence, match_changes=list(m.changes) + list(m.date_changes),
                phase=cl.category if cl else None, phase_conf=cl.confidence if cl else 0.0,
                phase_level=cl.level if cl else "", phase_evidence=cl.evidence if cl else [],
                dims=dims, wbs_path=" / ".join(w.name for w in path), wbs_code=".".join(w.code for w in path),
                wbs_ids=tuple(w.id for w in path),
                is_milestone=src.is_milestone, is_loe=src.is_loe,
            )
            if r.phase:
                r.stage = self.classifier.stage(r.phase, r.name)
            if c is not None:
                r.status = c.status
                r.pct = c.pct_by(self.measure)
                r.orig_dur_d = cur.hours_to_days(c.orig_dur_hours, c)
                r.rem_dur_d = cur.hours_to_days(c.rem_dur_hours, c)
                r.start, r.finish = c.start, c.finish
                if c.status != COMPLETED:
                    r.tf_d = cur.hours_to_days(c.total_float_hours, c)
                    r.ff_d = cur.hours_to_days(c.free_float_hours, c)
                r.weight = self.weight_of(c, cur)
                r.cal_id = self.cal_key(cur, c)
            if b is not None:
                r.bl_start, r.bl_finish = b.start, b.finish
                r.bl_dur_d = bl.hours_to_days(b.orig_dur_hours, b)
                r.bl_cal_id = self.cal_key(bl, b)
                if r.bl is not None:
                    r.bl_weight = self.weight_of(b, bl)
                if c is not None:
                    r.start_var_d = self._var_days(cur, c, b.start, c.start)
                    r.finish_var_d = self._var_days(cur, c, b.finish, c.finish)
                    if r.orig_dur_d is not None and r.bl_dur_d is not None:
                        r.dur_var_d = r.orig_dur_d - r.bl_dur_d
            rows.append(r)
        return rows

    # ------------------------------------------------------------------ helpers
    @property
    def baseline_finish(self) -> datetime | None:
        fins = [a.finish for a in self.bl.activities.values() if a.finish]
        return max(fins) if fins else None

    @property
    def forecast_finish(self) -> datetime | None:
        fins = [a.finish for a in self.cur.activities.values() if a.finish]
        return max(fins) if fins else None

    @property
    def baseline_start(self) -> datetime | None:
        st = [a.start for a in self.bl.activities.values() if a.start]
        return min(st) if st else None

    def row_by_key(self) -> dict[str, ActRow]:
        return {r.key: r for r in self.rows}

    def dimension_values(self, dim: str) -> list[str]:
        return sorted({r.dims[dim] for r in self.rows if dim in r.dims})

    def code_values_list(self) -> list[str]:
        out = set()
        for r in self.rows:
            if r.cur is None:
                continue
            for t, v in r.cur.codes.items():
                ct, cv = self.cur.code_types.get(t), self.cur.code_values.get(v)
                if ct and cv:
                    out.add(f"{ct.name}: {cv.value}")
        return sorted(out)

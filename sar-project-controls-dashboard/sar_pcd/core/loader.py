"""Convert parsed XER tables into the normalized Schedule model.

All column access goes through ``xer_fields`` so the analytics engine never
depends on raw XER column names.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from . import xer_fields as XF
from .dates import excel_serial_to_date, parse_p6_date
from .model import (Activity, Calendar, CodeType, CodeValue, ProjectInfo, Relationship, Schedule, UdfType, WBS)
from .xer_parser import XerFile, XerTable


class ScheduleLoadError(Exception):
    pass


@dataclass
class ProjectSummary:
    proj_id: str
    short_name: str
    name: str
    data_date: str
    activity_count: int


class _Reader:
    """Reads mapped fields from one table using the central field map."""

    def __init__(self, table: XerTable | None, warnings: list[str]):
        self.t = table
        self.warnings = warnings
        self._idx: dict[str, int | None] = {}
        self._bad_dates = 0

    def idx(self, key: str) -> int | None:
        if key not in self._idx:
            self._idx[key] = self.t.index(*XF.columns_for(key)) if self.t is not None else None
        return self._idx[key]

    def has(self, key: str) -> bool:
        return self.idx(key) is not None

    def s(self, row: list[str], key: str) -> str:
        i = self.idx(key)
        return row[i].strip() if i is not None and i < len(row) else ""

    def f(self, row: list[str], key: str, default: float | None = 0.0) -> float | None:
        v = self.s(row, key)
        if not v:
            return default
        try:
            return float(v)
        except ValueError:
            return default

    def d(self, row: list[str], key: str):
        v = self.s(row, key)
        if not v:
            return None
        try:
            return parse_p6_date(v)
        except ValueError:
            self._bad_dates += 1
            return None

    @property
    def rows(self) -> list[list[str]]:
        return self.t.rows if self.t is not None else []


def list_projects(xer: XerFile) -> list[ProjectSummary]:
    proj = xer.table("PROJECT")
    if proj is None:
        raise ScheduleLoadError(f"{xer.source_name}: PROJECT table not found. The XER does not contain a project.")
    r = _Reader(proj, [])
    wbs = _Reader(xer.table("PROJWBS"), [])
    names = {}
    for row in wbs.rows:
        if wbs.s(row, "wbs.project_node") == "Y":
            names[wbs.s(row, "wbs.project_id")] = wbs.s(row, "wbs.name")
    counts: dict[str, int] = {}
    task = _Reader(xer.table("TASK"), [])
    for row in task.rows:
        pid = task.s(row, "task.project_id")
        counts[pid] = counts.get(pid, 0) + 1
    out = []
    for row in r.rows:
        pid = r.s(row, "project.id")
        out.append(ProjectSummary(pid, r.s(row, "project.short_name"), names.get(pid, ""),
                                  r.s(row, "project.data_date"), counts.get(pid, 0)))
    return out


# --------------------------------------------------------------- calendars
_NODE = re.compile(r"\(0\|\|")


def _parse_clndr_tree(text: str):
    """Parse P6's nested calendar notation into (name, params, children) tuples."""
    s = text.replace("\x7f", " ")
    n = len(s)
    pos = 0

    def skip_ws(p):
        while p < n and s[p] in " \t\r\n":
            p += 1
        return p

    def parse_node(p):
        # expects "(0||"
        if not s.startswith("(0||", p):
            raise ValueError(f"expected node at {p}")
        p += 4
        j = s.index("(", p)
        name = s[p:j].strip()
        k = s.index(")", j)
        params = s[j + 1:k]
        p = skip_ws(k + 1)
        if p >= n or s[p] != "(":
            raise ValueError("expected children")
        p += 1
        children = []
        while True:
            p = skip_ws(p)
            if p < n and s[p] == ")":
                p += 1
                break
            child, p = parse_node(p)
            children.append(child)
        p = skip_ws(p)
        if p < n and s[p] == ")":
            p += 1
        return (name, params, children), p

    pos = skip_ws(pos)
    m = _NODE.search(s)
    if not m:
        raise ValueError("no calendar data")
    node, _ = parse_node(m.start())
    return node


def _interval_hours(children) -> float:
    total = 0.0
    for _, params, _ in children:
        parts = params.split("|")
        vals = dict(zip(parts[0::2], parts[1::2]))
        st, fi = vals.get("s"), vals.get("f")
        if not st or not fi:
            continue
        h1, m1 = (int(x) for x in st.split(":")[:2])
        h2, m2 = (int(x) for x in fi.split(":")[:2])
        start = h1 + m1 / 60
        end = h2 + m2 / 60
        if end <= start:
            end += 24
        total += end - start
    return total


def parse_calendar_data(cal: Calendar, text: str) -> None:
    if not text:
        cal.parsed_ok = False
        return
    try:
        root = _parse_clndr_tree(text)
    except (ValueError, IndexError):
        cal.parsed_ok = False
        return
    workdays = list(cal.workdays)
    found_week = False
    for name, _params, children in root[2]:
        lname = name.lower()
        if lname == "daysofweek":
            found_week = True
            for dname, _p, intervals in children:
                try:
                    p6_day = int(dname)
                except ValueError:
                    continue
                py_day = (p6_day - 2) % 7  # 1=Sunday -> 6, 2=Monday -> 0
                workdays[py_day] = _interval_hours(intervals) > 0
        elif lname == "exceptions":
            for _n, params, intervals in children:
                parts = params.split("|")
                vals = dict(zip(parts[0::2], parts[1::2]))
                if "d" not in vals:
                    continue
                try:
                    d = excel_serial_to_date(int(float(vals["d"])))
                except ValueError:
                    continue
                if _interval_hours(intervals) > 0:
                    cal.extra_workdays.add(d)
                else:
                    cal.holidays.add(d)
    cal.workdays = workdays
    cal.parsed_ok = found_week


# --------------------------------------------------------------- main loader
def load_schedule(xer: XerFile, proj_id: str | None = None) -> Schedule:
    projects = list_projects(xer)
    if not projects:
        raise ScheduleLoadError(f"{xer.source_name}: PROJECT table is empty.")
    if proj_id is None:
        if len(projects) > 1:
            raise ScheduleLoadError(f"{xer.source_name} contains {len(projects)} projects; select one to analyze.")
        proj_id = projects[0].proj_id
    warnings: list[str] = list(xer.warnings)

    # PROJECT
    pr = _Reader(xer.table("PROJECT"), warnings)
    prow = next((r for r in pr.rows if pr.s(r, "project.id") == proj_id), None)
    if prow is None:
        raise ScheduleLoadError(f"Project {proj_id} not found in {xer.source_name}.")
    crit_h = pr.f(prow, "project.critical_float_hours", None)
    info = ProjectInfo(
        id=proj_id,
        short_name=pr.s(prow, "project.short_name"),
        data_date=pr.d(prow, "project.data_date"),
        plan_start=pr.d(prow, "project.plan_start"),
        plan_end=pr.d(prow, "project.plan_end"),
        scheduled_finish=pr.d(prow, "project.scd_end"),
        critical_type=pr.s(prow, "project.critical_type"),
        critical_float_hours=crit_h,
        default_pct_type=XF.PCT_TYPE.get(pr.s(prow, "project.default_pct_type"), ""),
        default_calendar_id=pr.s(prow, "project.default_calendar"),
    )
    if info.data_date is None:
        warnings.append("Data Date (PROJECT.last_recalc_date) is missing; time-phased KPIs require a Data Date.")

    sched = Schedule(xer.source_name, xer.version, xer.export_date, info)
    sched.tables_present = sorted(xer.tables)

    # CALENDAR (global + this project's)
    cr = _Reader(xer.table("CALENDAR"), warnings)
    for row in cr.rows:
        cpid = cr.s(row, "cal.project_id")
        if cpid and cpid != proj_id:
            continue
        cal = Calendar(cr.s(row, "cal.id"), cr.s(row, "cal.name"),
                       hours_per_day=cr.f(row, "cal.day_hours", 8.0) or 8.0,
                       project_id=cpid, cal_type=cr.s(row, "cal.type"))
        parse_calendar_data(cal, cr.s(row, "cal.data"))
        if not cal.parsed_ok:
            warnings.append(f"Calendar '{cal.name}': work week could not be read; a Mon-Fri week is assumed for working-day calculations.")
        sched.calendars[cal.id] = cal

    # PROJWBS
    wr = _Reader(xer.table("PROJWBS"), warnings)
    for row in wr.rows:
        if wr.s(row, "wbs.project_id") != proj_id:
            continue
        w = WBS(wr.s(row, "wbs.id"), proj_id, wr.s(row, "wbs.code"), wr.s(row, "wbs.name"),
                wr.s(row, "wbs.parent_id"), int(wr.f(row, "wbs.seq", 0) or 0),
                wr.s(row, "wbs.project_node") == "Y")
        sched.wbs[w.id] = w
        if w.is_project_node:
            info.name = w.name
    if not info.name:
        info.name = info.short_name

    # TASK
    tr = _Reader(xer.table("TASK"), warnings)
    if tr.t is None:
        raise ScheduleLoadError(f"{xer.source_name}: TASK table not found - the XER contains no activities.")
    has_driving = tr.has("task.driving_path")
    for row in tr.rows:
        if tr.s(row, "task.project_id") != proj_id:
            continue
        status = XF.TASK_STATUS.get(tr.s(row, "task.status"), "Not Started")
        tf = tr.f(row, "task.total_float_hours", None)
        ff = tr.f(row, "task.free_float_hours", None)
        a = Activity(
            task_id=tr.s(row, "task.id"), project_id=proj_id,
            code=tr.s(row, "task.code"), name=tr.s(row, "task.name"),
            wbs_id=tr.s(row, "task.wbs_id"), calendar_id=tr.s(row, "task.calendar_id"),
            task_type=tr.s(row, "task.type") or "TT_Task", status=status,
            pct_type=XF.PCT_TYPE.get(tr.s(row, "task.pct_type"), info.default_pct_type or "Duration"),
            phys_pct=tr.f(row, "task.phys_pct", 0.0) or 0.0,
            orig_dur_hours=tr.f(row, "task.orig_dur_hours", 0.0) or 0.0,
            rem_dur_hours=tr.f(row, "task.rem_dur_hours", 0.0) or 0.0,
            total_float_hours=tf, free_float_hours=ff,
            act_start=tr.d(row, "task.act_start"), act_finish=tr.d(row, "task.act_end"),
            early_start=tr.d(row, "task.early_start"), early_finish=tr.d(row, "task.early_end"),
            late_start=tr.d(row, "task.late_start"), late_finish=tr.d(row, "task.late_end"),
            planned_start=tr.d(row, "task.target_start"), planned_finish=tr.d(row, "task.target_end"),
            expected_finish=tr.d(row, "task.expect_end"),
            cstr_type=tr.s(row, "task.cstr_type"), cstr_date=tr.d(row, "task.cstr_date"),
            cstr_type2=tr.s(row, "task.cstr_type2"), cstr_date2=tr.d(row, "task.cstr_date2"),
            driving_path=(tr.s(row, "task.driving_path") == "Y") if has_driving else None,
            budget_units=tr.f(row, "task.target_work_qty", 0.0) or 0.0,
            actual_units=tr.f(row, "task.act_work_qty", 0.0) or 0.0,
            remaining_units=tr.f(row, "task.remain_work_qty", 0.0) or 0.0,
        )
        sched.activities[a.task_id] = a
    if tr._bad_dates:
        warnings.append(f"{tr._bad_dates} activity date value(s) could not be parsed and were left blank.")

    acts = sched.activities

    # TASKPRED
    rr = _Reader(xer.table("TASKPRED"), warnings)
    external = 0
    for row in rr.rows:
        succ = rr.s(row, "pred.succ_id")
        pred = rr.s(row, "pred.pred_id")
        if succ not in acts and pred not in acts:
            continue
        ext = succ not in acts or pred not in acts
        external += ext
        sched.relationships.append(Relationship(
            rr.s(row, "pred.id"), pred, succ,
            XF.REL_TYPE.get(rr.s(row, "pred.type"), "FS"),
            rr.f(row, "pred.lag_hours", 0.0) or 0.0, ext))
    if external:
        warnings.append(f"{external} relationship(s) link to activities in other projects (external logic).")

    # ACTIVITY CODES
    ctr = _Reader(xer.table("ACTVTYPE"), warnings)
    for row in ctr.rows:
        cp = ctr.s(row, "ctype.project_id")
        if cp and cp != proj_id and ctr.s(row, "ctype.scope") == "AS_Project":
            continue
        ct = CodeType(ctr.s(row, "ctype.id"), ctr.s(row, "ctype.name"), ctr.s(row, "ctype.scope"), cp)
        sched.code_types[ct.id] = ct
    cvr = _Reader(xer.table("ACTVCODE"), warnings)
    for row in cvr.rows:
        tid = cvr.s(row, "cval.type_id")
        if tid not in sched.code_types:
            continue
        cv = CodeValue(cvr.s(row, "cval.id"), tid, cvr.s(row, "cval.value"),
                       cvr.s(row, "cval.description"), cvr.s(row, "cval.parent_id"))
        sched.code_values[cv.id] = cv
    tar = _Reader(xer.table("TASKACTV"), warnings)
    for row in tar.rows:
        a = acts.get(tar.s(row, "tact.task_id"))
        if a is not None:
            a.codes[tar.s(row, "tact.type_id")] = tar.s(row, "tact.value_id")
    used_types = {t for a in acts.values() for t in a.codes}
    sched.code_types = {k: v for k, v in sched.code_types.items() if k in used_types}

    # UDFs (activity-level only)
    utr = _Reader(xer.table("UDFTYPE"), warnings)
    for row in utr.rows:
        if utr.s(row, "udft.table") != "TASK":
            continue
        u = UdfType(utr.s(row, "udft.id"), "TASK", utr.s(row, "udft.label"), utr.s(row, "udft.datatype"))
        sched.udf_types[u.id] = u
    uvr = _Reader(xer.table("UDFVALUE"), warnings)
    for row in uvr.rows:
        u = sched.udf_types.get(uvr.s(row, "udfv.type_id"))
        if u is None:
            continue
        a = acts.get(uvr.s(row, "udfv.fk_id"))
        if a is None:
            continue
        dt = u.datatype
        if dt in ("FT_TEXT", "FT_STATICTYPE"):
            val = uvr.s(row, "udfv.text")
        elif dt in ("FT_START_DATE", "FT_END_DATE"):
            val = uvr.d(row, "udfv.date")
        else:
            val = uvr.f(row, "udfv.number", None)
        if val not in (None, ""):
            a.udfs[u.label] = val

    # RESOURCE ASSIGNMENTS
    rar = _Reader(xer.table("TASKRSRC"), warnings)
    for row in rar.rows:
        a = acts.get(rar.s(row, "trsrc.task_id"))
        if a is None:
            continue
        a.resource_count += 1
        a.budget_cost += rar.f(row, "trsrc.target_cost") or 0.0
        a.actual_cost += (rar.f(row, "trsrc.act_reg_cost") or 0.0) + (rar.f(row, "trsrc.act_ot_cost") or 0.0)
        a.remaining_cost += rar.f(row, "trsrc.remain_cost") or 0.0
    has_rsrc_units = rar.t is not None and len(rar.t) > 0
    if has_rsrc_units:
        # Units by assignment are more reliable than TASK work quantities when present.
        units: dict[str, list[float]] = {}
        for row in rar.rows:
            tid = rar.s(row, "trsrc.task_id")
            if tid not in acts:
                continue
            u = units.setdefault(tid, [0.0, 0.0, 0.0])
            u[0] += rar.f(row, "trsrc.target_qty") or 0.0
            u[1] += (rar.f(row, "trsrc.act_reg_qty") or 0.0) + (rar.f(row, "trsrc.act_ot_qty") or 0.0)
            u[2] += rar.f(row, "trsrc.remain_qty") or 0.0
        for tid, (b, ac, rem) in units.items():
            a = acts[tid]
            a.budget_units, a.actual_units, a.remaining_units = b, ac, rem

    # EXPENSES
    pcr = _Reader(xer.table("PROJCOST"), warnings)
    for row in pcr.rows:
        a = acts.get(pcr.s(row, "pcost.task_id"))
        if a is None:
            continue
        a.budget_cost += pcr.f(row, "pcost.target_cost") or 0.0
        a.actual_cost += pcr.f(row, "pcost.act_cost") or 0.0
        a.remaining_cost += pcr.f(row, "pcost.remain_cost") or 0.0

    # AVAILABILITY FLAGS
    alist = list(acts.values())
    sched.availability = {
        "calendars": bool(sched.calendars),
        "relationships": bool(sched.relationships),
        "activity_codes": bool(sched.code_types),
        "udfs": bool(sched.udf_types),
        "resources": any(a.resource_count for a in alist),
        "budget_cost": any(a.budget_cost > 0 for a in alist),
        "actual_cost": any(a.actual_cost > 0 for a in alist),
        "budget_units": any(a.budget_units > 0 for a in alist),
        "driving_path_flag": has_driving and any(a.driving_path for a in alist),
        "data_date": info.data_date is not None,
        "risk_tables": any(t in xer.tables for t in ("PROJRISK", "RISKTYPE", "RISK")),
    }
    if not sched.availability["budget_cost"]:
        warnings.append("Cost data was not found in this XER. Cost-based KPIs will be disabled.")
    elif not sched.availability["actual_cost"]:
        warnings.append("Budget cost exists but no Actual Cost was found. CPI and cost variance cannot be calculated.")
    if not sched.availability["resources"]:
        warnings.append("No resource assignments were found. Resource-weighted progress is unavailable.")
    sched.warnings = warnings
    return sched

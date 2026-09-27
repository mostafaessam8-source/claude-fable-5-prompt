"""Progress, S-curve, Earned Value, schedule, lookahead and discipline analytics.

All functions take the ProjectContext and a (possibly filtered) list of rows,
so the whole dashboard recomputes consistently when filters change.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta

from ..core.dates import fmt_date
from ..core.model import COMPLETED, IN_PROGRESS, NOT_STARTED
from .calindex import Spreader
from .context import ActRow, ProjectContext
from .kpi import BAD, GOOD, KPI, NA, NEUTRAL, WARN, fmt_money, fmt_num, fmt_pct


# ----------------------------------------------------------------- helpers
def planned_fraction(ctx: ProjectContext, r: ActRow, when: datetime | date | None) -> float | None:
    """Share of the baseline activity planned to be done before `when`
    (linear over the activity's working days in the baseline calendar)."""
    if r.bl is None or when is None:
        return None
    s, f = r.bl.start, r.bl.finish
    if s is None or f is None:
        return None
    ci = ctx.ci
    i, j, k = ci.idx(s), ci.idx(f) + 1, ci.idx(when)
    if k <= i:
        return 0.0
    if k >= j:
        return 1.0
    tot = ci.workdays(r.bl_cal_id, i, j)
    if tot <= 0:
        return 1.0
    return ci.workdays(r.bl_cal_id, i, k) / tot


def _period_bounds(start: date, end: date, period: str) -> list[date]:
    out = []
    if period == "Weekly":
        d = start - timedelta(days=start.weekday())
        while d <= end + timedelta(days=7):
            out.append(d)
            d += timedelta(days=7)
    else:
        d = date(start.year, start.month, 1)
        while d <= end + timedelta(days=31):
            out.append(d)
            d = date(d.year + (d.month == 12), d.month % 12 + 1, 1)
    return out


# ----------------------------------------------------------------- progress
def progress(ctx: ProjectContext, rows: list[ActRow]) -> dict:
    dd = ctx.data_date
    cur_rows = [r for r in rows if r.cur is not None]
    w_tot = sum(r.weight for r in cur_rows)
    ev = sum(r.weight * r.pct / 100.0 for r in cur_rows)
    actual = ev / w_tot * 100.0 if w_tot > 0 else None
    bl_rows = [r for r in rows if r.bl is not None]
    wb_tot = sum(r.bl_weight for r in bl_rows)
    pv = 0.0
    missing_bl_dates = 0
    for r in bl_rows:
        f = planned_fraction(ctx, r, dd)
        if f is None:
            missing_bl_dates += 1
            continue
        pv += r.bl_weight * f
    planned = pv / wb_tot * 100.0 if (wb_tot > 0 and dd is not None) else None
    variance = actual - planned if (actual is not None and planned is not None) else None
    return {
        "actual": actual, "planned": planned, "variance": variance, "w_total": w_tot, "w_bl_total": wb_tot,
        "earned_weight": ev, "planned_weight": pv, "cur_keys": [r.key for r in cur_rows if r.weight > 0],
        "bl_keys": [r.key for r in bl_rows if r.bl_weight > 0], "missing_bl_dates": missing_bl_dates,
        "measure": ctx.measure, "weighting": ctx.weighting,
    }


def progress_kpis(ctx: ProjectContext, rows: list[ActRow]) -> dict[str, KPI]:
    p = progress(ctx, rows)
    method = f"Measure: {ctx.measure}; weighting: {ctx.weighting}"
    dd = fmt_date(ctx.data_date)
    out = {}
    if p["actual"] is None:
        out["actual"] = KPI.unavailable("actual", "Actual Progress", "No weighted activities in selection (total weight = 0).")
    else:
        out["actual"] = KPI("actual", "Actual Progress", p["actual"], fmt_pct(p["actual"]), NEUTRAL,
                            formula="Σ(weight_i × %complete_i) / Σ weight_i  (current schedule)",
                            source=f"Current XER {ctx.cur.source_name}, data date {dd}",
                            method=method, keys=p["cur_keys"], notes=list(ctx.method_notes))
    if p["planned"] is None:
        out["planned"] = KPI.unavailable("planned", "Planned Progress",
                                         "Baseline weights or Data Date not available.")
    else:
        out["planned"] = KPI("planned", "Planned Progress", p["planned"], fmt_pct(p["planned"]), NEUTRAL,
                             formula="Σ(baseline weight_i × planned fraction_i at Data Date) / Σ baseline weight_i; "
                                     "planned fraction = working days elapsed / working days of the baseline activity",
                             source=f"Baseline XER {ctx.bl.source_name} evaluated at current Data Date {dd}",
                             method=method, keys=p["bl_keys"],
                             notes=list(ctx.method_notes) + ([f"{p['missing_bl_dates']} baseline activities lack dates and were skipped."] if p["missing_bl_dates"] else []))
    if p["variance"] is None:
        out["variance"] = KPI.unavailable("variance", "Progress Variance", "Requires both actual and planned progress.")
    else:
        v = p["variance"]
        out["variance"] = KPI("variance", "Progress Variance", v, f"{v:+.1f}%", GOOD if v >= 0 else (WARN if v > -5 else BAD),
                              formula="Actual Progress − Planned Progress", method=method,
                              source="Derived from Actual and Planned progress", keys=p["cur_keys"])
    out["_raw"] = p  # type: ignore[assignment]
    return out


# ----------------------------------------------------------------- S-curve
def s_curve(ctx: ProjectContext, rows: list[ActRow], period: str | None = None) -> dict:
    period = period or ctx.settings.s_curve_period
    ci = ctx.ci
    dd = ctx.data_date
    ddi = ci.idx(dd) if dd else None
    plan, act, rem = Spreader(ci), Spreader(ci), Spreader(ci)
    wb = wc = 0.0
    starts, ends = [], []
    for r in rows:
        if r.bl is not None and r.bl_weight > 0 and r.bl.start and r.bl.finish:
            plan.add(r.bl_cal_id, ci.idx(r.bl.start), ci.idx(r.bl.finish) + 1, r.bl_weight)
            wb += r.bl_weight
            starts.append(r.bl.start.date())
            ends.append(r.bl.finish.date())
        a = r.cur
        if a is None or r.weight <= 0:
            continue
        wc += r.weight
        earned = r.weight * r.pct / 100.0
        if earned > 0 and ddi is not None:
            s = ci.idx(a.act_start) if a.act_start else ddi - 1
            if a.status == COMPLETED and a.act_finish:
                e = ci.idx(a.act_finish) + 1
            else:
                e = ddi
            s = min(s, ddi - 1)
            e = min(max(e, s + 1), ddi)
            act.add(r.cal_id, s, e, earned)
            if a.act_start:
                starts.append(a.act_start.date())
        remaining = r.weight - earned
        if remaining > 0:
            rs = a.remaining_start or a.start or dd
            fin = a.finish or rs
            if rs is None:
                continue
            s = max(ci.idx(rs), ddi or 0)
            e = max(ci.idx(fin) + 1, s + 1)
            rem.add(r.cal_id, s, e, remaining)
            ends.append(fin.date())
    if not starts:
        return {"dates": [], "planned": [], "actual": [], "forecast": [], "data_date": dd, "available": False}
    start, end = min(starts), max(ends + [dd.date()] if dd else ends)
    bounds = _period_bounds(start, end, period)
    if dd and dd.date() not in bounds:
        bounds = sorted(set(bounds) | {dd.date()})
    Cp, Ca, Cr = plan.cumulative(), act.cumulative(), rem.cumulative()
    act_at_dd = Ca[ddi] if ddi is not None else 0.0
    rem_at_dd = Cr[ddi] if ddi is not None else 0.0
    planned, actual, forecast = [], [], []
    for b in bounds:
        i = ci.idx(b)
        planned.append(Cp[i] / wb * 100.0 if wb > 0 else None)
        if dd is not None and b <= dd.date():
            actual.append(Ca[i] / wc * 100.0 if wc > 0 else None)
            forecast.append(actual[-1] if b == dd.date() else None)
        else:
            actual.append(None)
            forecast.append(((act_at_dd + Cr[i] - rem_at_dd) / wc * 100.0) if wc > 0 else None)
    return {"dates": bounds, "planned": planned, "actual": actual, "forecast": forecast, "data_date": dd,
            "available": True, "period": period, "weighting": ctx.weighting, "measure": ctx.measure,
            "note": "Actual curve before the Data Date is reconstructed from actual dates (earned progress spread "
                    "linearly between Actual Start and Actual Finish / Data Date). Forecast spreads remaining weight "
                    "between remaining start and forecast finish."}


# ----------------------------------------------------------------- EVM
def evm(ctx: ProjectContext, rows: list[ActRow]) -> dict:
    dd = ctx.data_date
    has_bl_cost = ctx.bl.availability.get("budget_cost", False)
    has_cur_cost = ctx.cur.availability.get("budget_cost", False)
    has_ac = ctx.cur.availability.get("actual_cost", False)
    res: dict = {"available": has_bl_cost, "has_actual_cost": has_ac, "notes": []}
    if not has_bl_cost:
        res["notes"].append("Cost data was not found in the Baseline XER. Earned Value cannot be calculated.")
        return res
    bac = pv = ev = ac = etc_bottom = added_budget = 0.0
    ev_on_current = 0
    for r in rows:
        b, c = r.bl, r.cur
        if b is not None:
            bac += b.budget_cost
            f = planned_fraction(ctx, r, dd)
            if f is not None:
                pv += b.budget_cost * f
        if c is not None:
            ac += c.actual_cost
            etc_bottom += c.remaining_cost
            if b is not None:
                ev += b.budget_cost * r.pct / 100.0
            else:
                ev += c.budget_cost * r.pct / 100.0
                added_budget += c.budget_cost
                if c.budget_cost > 0:
                    ev_on_current += 1
    res.update(BAC=bac, PV=pv, EV=ev, AC=ac if has_ac else None, added_budget=added_budget)
    weightable = [r.bl for r in rows if r.bl is not None and not (r.bl.is_milestone or r.bl.is_loe or r.bl.is_wbs_summary)]
    cov = sum(1 for b in weightable if b.budget_cost > 0) / len(weightable) if weightable else 0.0
    res["cost_coverage"] = cov
    # Cost-based EV drives SPI/CPI only when progress itself is cost-weighted, so SPI = EV/PV is consistent
    # with Actual % / Planned % on the same dashboard.
    res["cost_reliable"] = ctx.weighting == "Cost"
    if not res["cost_reliable"]:
        res["notes"].append(
            f"Progress is weighted by {ctx.weighting}, not cost (baseline cost loading covers {cov:.0%} of activities). "
            "Cost-based EV / PV / SPI / CPI are shown for reference only and are not used on the KPI cards.")
    res["SV"] = ev - pv
    res["SPI"] = ev / pv if pv > 0 else None
    if ev_on_current:
        res["notes"].append(f"{ev_on_current} activities without a 1:1 baseline (added/split) earn value on their current budget.")
    if has_ac and ac > 0:
        cpi = ev / ac if ac > 0 else None
        res["CPI"] = cpi
        res["CV"] = ev - ac
        res["EAC"] = bac / cpi if cpi else None
        res["EAC_bottom_up"] = ac + etc_bottom
        res["ETC"] = res["EAC"] - ac if res["EAC"] is not None else None
        res["VAC"] = bac - res["EAC"] if res["EAC"] is not None else None
    else:
        res.update(CPI=None, CV=None, EAC=None, EAC_bottom_up=None, ETC=None, VAC=None)
        res["notes"].append("Actual Cost is not available in the Current XER: CPI, CV, EAC, ETC and VAC are not calculated.")
    if not has_cur_cost:
        res["notes"].append("Current XER has no budget cost; EV uses baseline budgets only.")
    return res


def spi_cpi_kpis(ctx: ProjectContext, rows: list[ActRow], prog: dict) -> tuple[KPI, KPI, dict]:
    e = evm(ctx, rows)
    keys = [r.key for r in rows if r.cur is not None or r.bl is not None]
    cost_ok = bool(e.get("available") and e.get("cost_reliable"))
    cov_note = (f"Cost-based EV not used because progress is weighted by {ctx.weighting} (select Cost weighting in Settings to use EV)."
                if e.get("available") and not cost_ok else "")
    if cost_ok and e.get("SPI") is not None:
        spi = e["SPI"]
        spi_k = KPI("spi", "SPI", spi, f"{spi:.2f}", GOOD if spi >= 1 else (WARN if spi >= 0.9 else BAD),
                    formula="SPI = EV / PV (cost-based Earned Value)",
                    source=f"EV = Σ baseline budget × % complete; PV = Σ baseline budget × planned fraction at {fmt_date(ctx.data_date)}",
                    method=f"Progress measure {ctx.measure}", keys=keys,
                    notes=list(e["notes"]), extra={"EV": e["EV"], "PV": e["PV"]})
    elif prog.get("actual") is not None and prog.get("planned"):
        spi = prog["actual"] / prog["planned"]
        spi_k = KPI("spi", "SPI", spi, f"{spi:.2f}", GOOD if spi >= 1 else (WARN if spi >= 0.9 else BAD),
                    formula="SPI (progress-based) = Actual Progress % / Planned Progress %",
                    source=("No reliable baseline cost loading" if e.get("available") else "No baseline cost loading")
                           + " - schedule-progress SPI using the selected weighting",
                    method=f"Measure {ctx.measure}; weighting {ctx.weighting}", keys=keys,
                    notes=["This is a progress-based SPI, not a cost-based Earned Value SPI."] + ([cov_note] if cov_note else []))
    else:
        spi_k = KPI.unavailable("spi", "SPI", "Planned progress is zero or unavailable at the Data Date.")
    if cost_ok and e.get("CPI") is not None:
        cpi = e["CPI"]
        cpi_k = KPI("cpi", "CPI", cpi, f"{cpi:.2f}", GOOD if cpi >= 1 else (WARN if cpi >= 0.9 else BAD),
                    formula="CPI = EV / AC", source="AC = Σ actual cost from TASKRSRC and PROJCOST (current XER)",
                    keys=keys, notes=list(e["notes"]), extra={"EV": e["EV"], "AC": e["AC"]})
    else:
        if not e.get("available"):
            reason = "Cost Data Not Available"
        elif not cost_ok:
            reason = f"Progress not cost-weighted (weighting: {ctx.weighting})"
        else:
            reason = "Actual Cost Not Available"
        cpi_k = KPI.unavailable("cpi", "CPI", f"CPI = N/A - {reason}. CPI is never derived from schedule data.", "CPI = EV / AC")
        cpi_k.display = "N/A"
        cpi_k.extra["reason"] = reason
    return spi_k, cpi_k, e


def cost_by_group(ctx: ProjectContext, rows: list[ActRow], dim: str | None = None) -> dict:
    """Budget (baseline), current budget, actual and forecast (AC + remaining) per group."""
    if not ctx.bl.availability.get("budget_cost") and not ctx.cur.availability.get("budget_cost"):
        return {"available": False, "groups": []}
    dim = dim or ("Discipline" if any("Discipline" in r.dims for r in rows) else "Phase")
    g = defaultdict(lambda: [0.0, 0.0, 0.0, 0.0])
    for r in rows:
        k = (r.phase or "Not Mapped") if dim == "Phase" else r.dims.get(dim, "Not Mapped")
        if r.bl is not None:
            g[k][0] += r.bl.budget_cost
        if r.cur is not None:
            g[k][1] += r.cur.budget_cost
            g[k][2] += r.cur.actual_cost
            g[k][3] += r.cur.actual_cost + r.cur.remaining_cost
    groups = sorted(([k] + v for k, v in g.items()), key=lambda x: -x[1])
    return {"available": True, "dimension": dim, "has_actual": ctx.cur.availability.get("actual_cost", False),
            "groups": [{"group": k, "budget": b, "current_budget": cb, "actual": a, "forecast": f}
                       for k, b, cb, a, f in groups]}


# ----------------------------------------------------------------- schedule
def schedule_summary(ctx: ProjectContext, rows: list[ActRow], filtered: bool = False) -> dict[str, KPI]:
    cur_rows = [r for r in rows if r.cur is not None]
    bl_rows = [r for r in rows if r.bl is not None]
    if filtered:
        bf = max((r.bl.finish for r in bl_rows if r.bl.finish), default=None)
        ff = max((r.finish for r in cur_rows if r.finish), default=None)
    else:
        bf, ff = ctx.baseline_finish, ctx.forecast_finish
    out: dict[str, KPI] = {}
    out["bl_finish"] = KPI("bl_finish", "Baseline Finish", bf, fmt_date(bf, "N/A"), NEUTRAL,
                           formula="Latest finish of all baseline activities", source=ctx.bl.source_name)
    out["fc_finish"] = KPI("fc_finish", "Forecast Finish", ff, fmt_date(ff, "N/A"), NEUTRAL,
                           formula="Latest finish (Actual or Early Finish) of all current activities",
                           source=ctx.cur.source_name)
    if bf and ff:
        var = (ff.date() - bf.date()).days
        drivers = sorted((r for r in cur_rows if r.is_longest_path and (r.finish_var_d or 0) > 0),
                         key=lambda r: -(r.finish_var_d or 0))
        if not drivers:
            drivers = sorted((r for r in cur_rows if r.status != COMPLETED and (r.finish_var_d or 0) > 0),
                             key=lambda r: -(r.finish_var_d or 0))[:25]
        label = "Days Behind" if var > 0 else ("Days Ahead" if var < 0 else "On Schedule")
        out["sched_var"] = KPI("sched_var", "Schedule Variance", -var, f"{abs(var)}", GOOD if var <= 0 else (WARN if var <= 14 else BAD),
                               formula="Baseline Finish − Forecast Finish (calendar days; positive = ahead)",
                               source="Baseline vs Current project finish",
                               keys=[r.key for r in drivers], extra={"label": label, "days_late": var},
                               notes=["Drill-down lists Longest Path activities with positive finish variance (activities driving the completion delay)."])
    else:
        out["sched_var"] = KPI.unavailable("sched_var", "Schedule Variance", "Baseline or forecast finish not available.")
    sp_orig = ctx.cur.project.scheduled_finish
    if sp_orig:
        out["fc_finish"].notes.append(f"P6 scheduled finish (PROJECT.scd_end_date): {fmt_date(sp_orig)}")
    return out


def critical_kpis(ctx: ProjectContext, rows: list[ActRow]) -> dict[str, KPI]:
    ci = ctx.critical_info
    open_rows = [r for r in rows if r.cur is not None and r.status != COMPLETED]
    crit = [r for r in open_rows if r.is_critical]
    lp = [r for r in open_rows if r.is_longest_path]
    near = [r for r in open_rows if r.is_near_critical]
    neg = [r for r in open_rows if r.tf_d is not None and r.tf_d < 0]
    ms = [r for r in crit if r.is_milestone]
    tf_vals = [r.tf_d for r in lp if r.tf_d is not None]
    min_tf = min(tf_vals) if tf_vals else None
    base = dict(source=ci["source"], notes=list(ci["notes"]))
    out = {
        "critical": KPI("critical", "Critical Activities", len(crit), str(len(crit)), BAD if neg else NEUTRAL,
                        formula=f"Incomplete activities meeting the critical definition ({ci['mode']})",
                        keys=[r.key for r in crit], **base),
        "longest": KPI("longest", "Longest Path Activities", len(lp), str(len(lp)), NEUTRAL,
                       formula="Incomplete activities on the Longest Path", source=ci["longest_path_source"],
                       keys=[r.key for r in lp]),
        "near": KPI("near", "Near-Critical Activities", len(near), str(len(near)), NEUTRAL,
                    formula=f"Not critical and Total Float <= {ci['near_days']:g} days", keys=[r.key for r in near],
                    source="Current XER total float (hours / calendar hours per day)"),
        "negative": KPI("negative", "Negative Float Activities", len(neg), str(len(neg)), BAD if neg else GOOD,
                        formula="Incomplete activities with Total Float < 0", keys=[r.key for r in neg],
                        source="Current XER TASK.total_float_hr_cnt"),
        "crit_ms": KPI("crit_ms", "Critical Milestones", len(ms), str(len(ms)), NEUTRAL,
                       formula="Critical activities of milestone type", keys=[r.key for r in ms], **base),
        "path_float": KPI("path_float", "Total Float (Longest Path)", min_tf,
                          "N/A" if min_tf is None else f"{min_tf:.1f} Days".replace(".0 Days", " Days"), BAD if (min_tf or 0) < 0 else NEUTRAL,
                          formula="Minimum Total Float of Longest Path activities", keys=[r.key for r in lp],
                          source=ci["longest_path_source"]),
    }
    return out


# ----------------------------------------------------------------- lookahead
def lookahead(ctx: ProjectContext, rows: list[ActRow], weeks: int | None = None) -> list[ActRow]:
    weeks = weeks or ctx.settings.lookahead_weeks
    dd = ctx.data_date
    if dd is None:
        return []
    end = dd + timedelta(days=7 * weeks)
    out = []
    for r in rows:
        if r.cur is None or r.status == COMPLETED:
            continue
        s, f = r.start, r.finish
        overdue = r.bl_finish is not None and r.bl_finish < dd
        if (s is not None and s <= end and (f is None or f >= dd)) or overdue:
            out.append(r)
    out.sort(key=lambda r: (r.start or dd, r.code))
    return out


# ----------------------------------------------------------------- variance
def top_delayed(rows: list[ActRow], n: int = 20, milestones: bool | None = None) -> list[ActRow]:
    sel = [r for r in rows if r.cur is not None and r.finish_var_d is not None and r.finish_var_d > 0]
    if milestones is not None:
        sel = [r for r in sel if r.is_milestone == milestones]
    return sorted(sel, key=lambda r: -r.finish_var_d)[:n]


def wbs_variance(ctx: ProjectContext, rows: list[ActRow], level: int = 1) -> list[dict]:
    g: dict[str, dict] = {}
    for r in rows:
        if not r.wbs_ids:
            continue
        wid = r.wbs_ids[min(level, len(r.wbs_ids)) - 1]
        sched = ctx.cur if r.cur is not None else ctx.bl
        w = sched.wbs.get(wid)
        name = w.name if w else wid
        d = g.setdefault(name, {"wbs": name, "bl_finish": None, "finish": None, "count": 0, "delayed": 0, "keys": []})
        d["count"] += 1
        d["keys"].append(r.key)
        if r.bl_finish and (d["bl_finish"] is None or r.bl_finish > d["bl_finish"]):
            d["bl_finish"] = r.bl_finish
        if r.finish and r.cur is not None and (d["finish"] is None or r.finish > d["finish"]):
            d["finish"] = r.finish
        if r.is_delayed:
            d["delayed"] += 1
    out = []
    for d in g.values():
        d["variance"] = (d["finish"].date() - d["bl_finish"].date()).days if d["finish"] and d["bl_finish"] else None
        out.append(d)
    return sorted(out, key=lambda d: -(d["variance"] or -10**6))


def critical_path_changes(ctx: ProjectContext) -> dict:
    from .critical import longest_path
    bl_lp, src = longest_path(ctx, ctx.bl)
    bl_codes = {ctx.bl.activities[t].code for t in bl_lp}
    cur_codes = {r.code for r in ctx.rows if r.is_longest_path}
    open_codes = {r.code for r in ctx.rows if r.cur is not None and r.status != COMPLETED}
    done_codes = {r.code for r in ctx.rows if r.cur is not None and r.status == COMPLETED}
    return {"added": sorted(cur_codes - bl_codes),
            "removed": sorted((bl_codes - cur_codes) & open_codes),
            "completed": sorted(bl_codes & done_codes),
            "not_in_current": sorted(bl_codes - open_codes - done_codes),
            "baseline_source": src, "unchanged": sorted(cur_codes & bl_codes)}


# ----------------------------------------------------------------- disciplines
def status_bucket(r: ActRow, ctx: ProjectContext) -> str:
    """Mutually exclusive status used for donut charts."""
    if r.status == COMPLETED:
        return "Completed"
    tol = ctx.settings.delay_tolerance_days
    overdue = ctx.data_date and r.bl_finish and r.bl_finish < ctx.data_date
    if overdue or (r.finish_var_d is not None and r.finish_var_d > tol):
        return "Delayed"
    return "In Progress" if r.status == IN_PROGRESS else "Not Started"


def phase_summary(ctx: ProjectContext, rows: list[ActRow], phase: str) -> dict:
    sel = [r for r in rows if r.phase == phase]
    cur_sel = [r for r in sel if r.cur is not None]
    p = progress(ctx, sel)
    buckets = {"Completed": [], "In Progress": [], "Not Started": [], "Delayed": []}
    for r in cur_sel:
        buckets[status_bucket(r, ctx)].append(r.key)
    n = max(1, len(cur_sel))
    stages: dict[str, dict] = {}
    for r in cur_sel:
        st = r.stage or "Unstaged"
        d = stages.setdefault(st, {"stage": st, "count": 0, "completed": 0, "in_progress": 0, "delayed": 0,
                                   "w": 0.0, "ev": 0.0, "keys": []})
        d["count"] += 1
        d["keys"].append(r.key)
        d["completed"] += r.status == COMPLETED
        d["in_progress"] += r.status == IN_PROGRESS
        d["delayed"] += status_bucket(r, ctx) == "Delayed"
        d["w"] += r.weight
        d["ev"] += r.weight * r.pct / 100
    order = [s for s, _ in ctx.profile.stages.get(phase, [])]
    stage_list = sorted(stages.values(), key=lambda d: order.index(d["stage"]) if d["stage"] in order else 99)
    for d in stage_list:
        d["progress"] = d["ev"] / d["w"] * 100 if d["w"] > 0 else None
    dd = ctx.data_date
    return {
        "phase": phase, "count": len(cur_sel), "progress": p,
        "buckets": {k: v for k, v in buckets.items()},
        "bucket_pct": {k: len(v) / n * 100 for k, v in buckets.items()},
        "stages": stage_list,
        "overdue": [r.key for r in cur_sel if r.status != COMPLETED and dd and r.bl_finish and r.bl_finish < dd],
        "critical": [r.key for r in cur_sel if r.is_critical],
        "delayed": buckets["Delayed"],
        "active": [r.key for r in cur_sel if r.status == IN_PROGRESS],
        "upcoming": [r.key for r in lookahead(ctx, cur_sel, 4) if r.status == NOT_STARTED],
        "pending_approvals": [r.key for r in cur_sel if r.stage == "Approval" and r.status != COMPLETED],
        "keys": [r.key for r in cur_sel],
    }


def workfronts(ctx: ProjectContext, rows: list[ActRow], phase: str = "Construction") -> list[dict]:
    active = [r for r in rows if r.phase == phase and r.status == IN_PROGRESS]
    dim = next((d for d in ("Location", "Work Package") if any(d in r.dims for r in active)), None)
    g: dict[str, list[ActRow]] = defaultdict(list)
    for r in active:
        k = r.dims.get(dim) if dim else None
        if not k:
            k = r.wbs_path.split(" / ")[-1] if r.wbs_path else "Unassigned"
        g[k].append(r)
    return [{"workfront": k, "grouped_by": dim or "WBS", "activities": len(v), "keys": [r.key for r in v],
             "critical": sum(r.is_critical for r in v), "delayed": sum(r.is_delayed for r in v)}
            for k, v in sorted(g.items())]


def milestones(ctx: ProjectContext, rows: list[ActRow], horizon_days: int = 90) -> list[dict]:
    dd = ctx.data_date
    out = []
    for r in rows:
        if not r.is_milestone:
            continue
        if r.cur is None:
            status = "Deleted"
        elif r.status == COMPLETED:
            status = "Completed"
        elif r.is_critical:
            status = "Critical"
        elif r.finish_var_d is not None and r.finish_var_d > ctx.settings.delay_tolerance_days:
            status = "Delayed"
        elif dd and r.finish and r.finish <= dd + timedelta(days=horizon_days):
            status = "Upcoming"
        else:
            status = "Planned"
        out.append({"key": r.key, "code": r.code, "name": r.name, "bl_date": r.bl_finish, "date": r.finish,
                    "variance": r.finish_var_d, "status": status, "critical": r.is_critical,
                    "in_baseline": r.bl is not None})
    return sorted(out, key=lambda d: (d["date"] or d["bl_date"] or datetime.max))

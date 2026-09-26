"""Data quality validation run before KPIs are presented.

Produces individual findings (never hidden behind the summary score) and a
transparent score: 100 minus the listed penalty of each finding.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from ..core.model import COMPLETED
from ..mapping.classifier import LOW, NONE
from . import matching as M

CRITICAL, WARNING, INFO = "Critical", "Warning", "Info"


@dataclass
class Finding:
    severity: str
    category: str
    message: str
    count: int = 0
    keys: list = field(default_factory=list)
    penalty: float = 0.0
    impact: str = ""


def validate(ctx) -> tuple[list[Finding], float]:
    f: list[Finding] = []
    cur, bl = ctx.cur, ctx.bl
    rows = ctx.rows
    cur_rows = [r for r in rows if r.cur is not None]
    n = max(1, len(cur_rows))

    if ctx.data_date is None:
        f.append(Finding(CRITICAL, "Data Date", "Current schedule has no Data Date (PROJECT.last_recalc_date).",
                         penalty=25, impact="Planned progress, S-curve, lookahead and SPI cannot be time-phased."))
    if ctx.bl_data_date and ctx.data_date and ctx.bl_data_date > ctx.data_date:
        f.append(Finding(CRITICAL, "Data Date", "Baseline Data Date is later than the Current Data Date - check the files were not swapped.",
                         penalty=20))
    if bl.project.short_name != cur.project.short_name:
        f.append(Finding(INFO, "Project Identity",
                         f"Baseline project ID '{bl.project.short_name}' differs from current '{cur.project.short_name}' "
                         "(normal when the baseline is a copy)."))

    unm = [r.key for r in cur_rows if r.phase is None]
    if unm:
        f.append(Finding(WARNING, "Unmapped Activities",
                         f"{len(unm)} activities could not be mapped to a category. Review them in Mapping Review.",
                         len(unm), unm, min(15, 30 * len(unm) / n), "Excluded from phase-level KPIs."))
    low = [r.key for r in cur_rows if r.phase_level == LOW]
    if low:
        f.append(Finding(WARNING, "Mapping Confidence",
                         f"{len(low)} activities could not be confidently mapped to a category. Review them in Mapping Review.",
                         len(low), low, min(10, 20 * len(low) / n), "Phase KPIs include these with low confidence."))

    amb = [m for m in ctx.recon.matches if m.status == M.UNMATCHED]
    if amb:
        f.append(Finding(WARNING, "Ambiguous Matches",
                         f"Baseline matching confidence is low for {len(amb)} activities. Review them in Activity Reconciliation.",
                         len(amb), [m.current_id or "BL:" + m.baseline_id for m in amb], min(10, 20 * len(amb) / n)))
    ren = [m for m in ctx.recon.matches if m.status == M.RENAMED]
    if ren:
        f.append(Finding(INFO, "Secondary Matches", f"{len(ren)} activities were matched by similarity (Activity ID changed).",
                         len(ren), [m.current_id for m in ren]))
    deleted = [m for m in ctx.recon.matches if m.status == M.DELETED]
    if deleted:
        f.append(Finding(INFO, "Missing Baseline Activities",
                         f"{len(deleted)} baseline activities do not exist in the current schedule.",
                         len(deleted), ["BL:" + m.baseline_id for m in deleted], impact="They remain in Planned progress (baseline plan)."))
    added = [m for m in ctx.recon.matches if m.status == M.ADDED]
    if added:
        f.append(Finding(INFO, "Activities Not in Baseline", f"{len(added)} current activities have no baseline counterpart.",
                         len(added), [m.current_id for m in added], impact="No baseline dates; excluded from Planned progress."))

    if not cur.availability.get("budget_cost"):
        f.append(Finding(WARNING, "Missing Cost Data", "Cost data was not found in this XER. Cost-based KPIs will be disabled.",
                         penalty=5, impact="CPI, EVM and Cost by Discipline show N/A."))
    elif not cur.availability.get("actual_cost"):
        f.append(Finding(WARNING, "Missing Actual Cost", "Budget cost exists but Actual Cost is missing; CPI is not calculated.",
                         penalty=5))
    if not bl.availability.get("budget_cost") and cur.availability.get("budget_cost"):
        f.append(Finding(WARNING, "Missing Baseline Cost", "Baseline XER has no cost loading; PV/SPI (cost) unavailable.", penalty=5))
    if not cur.availability.get("resources"):
        f.append(Finding(INFO, "Missing Resource Data", "No resource assignments; resource-weighted progress unavailable."))

    bad_dates = []
    for r in cur_rows:
        a = r.cur
        if a.act_start and a.act_finish and a.act_finish < a.act_start:
            bad_dates.append(r.key)
        elif ctx.data_date and ((a.act_start and a.act_start > ctx.data_date) or (a.act_finish and a.act_finish > ctx.data_date)):
            bad_dates.append(r.key)
        elif a.status == COMPLETED and a.act_finish is None:
            bad_dates.append(r.key)
        elif a.start is None or a.finish is None:
            bad_dates.append(r.key)
    if bad_dates:
        f.append(Finding(CRITICAL if len(bad_dates) > 0.05 * n else WARNING, "Invalid Dates",
                         f"{len(bad_dates)} activities have missing, reversed or future actual dates.",
                         len(bad_dates), bad_dates, min(15, 30 * len(bad_dates) / n)))

    no_logic = [r.key for r in cur_rows if r.status != COMPLETED and not r.is_loe
                and (not cur.preds(r.cur.task_id) or not cur.succs(r.cur.task_id))]
    if len(no_logic) > 2:
        f.append(Finding(WARNING, "Missing Logic", f"{len(no_logic)} incomplete activities are missing a predecessor or successor.",
                         len(no_logic), no_logic, min(10, 20 * len(no_logic) / n)))
    bad_cal = [c.name for c in list(cur.calendars.values()) + list(bl.calendars.values()) if not c.parsed_ok]
    if bad_cal:
        f.append(Finding(WARNING, "Calendars", f"Calendar work week could not be read: {', '.join(sorted(set(bad_cal)))}. "
                         "A Mon-Fri week is assumed for working-day calculations.", len(bad_cal), penalty=3))
    if not cur.availability.get("driving_path_flag"):
        f.append(Finding(INFO, "Longest Path", "The XER does not carry P6's Longest Path flag; the Longest Path is computed by tracing driving relationships."))
    if cur.availability.get("risk_tables"):
        f.append(Finding(INFO, "Risk Data", "A risk table was found in the XER but its field layout is version-dependent and is not used. Import a risk register instead."))
    for w in cur.warnings:
        if not any(w in x.message for x in f):
            f.append(Finding(INFO, "Current XER", w))
    for w in bl.warnings:
        if "Actual Cost" in w:
            continue  # a baseline is not expected to carry actual cost
        f.append(Finding(INFO, "Baseline XER", w))
    score = max(0.0, 100.0 - sum(x.penalty for x in f))
    order = {CRITICAL: 0, WARNING: 1, INFO: 2}
    f.sort(key=lambda x: order[x.severity])
    return f, round(score, 1)

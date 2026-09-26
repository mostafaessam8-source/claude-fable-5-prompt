"""Critical path, longest path, near-critical and negative float analysis.

The definition of "critical" follows the P6 project setting where it is
present in the XER (PROJECT.critical_path_type / critical_drtn_hr_cnt):
    CT_TotFloat -> Total Float <= threshold (hours)
    CT_DrivPath -> activity is on the Longest Path
The user may override the definition in Settings. Zero-float activities are
never assumed to be the Longest Path: the Longest Path comes from P6's
driving_path_flag, or is traced through driving relationships when the flag
is absent (and labelled as computed).
"""
from __future__ import annotations

from ..core.model import COMPLETED, IN_PROGRESS


def longest_path(ctx, sched=None) -> tuple[set[str], str]:
    cur = sched if sched is not None else ctx.cur
    acts = cur.activities
    if cur.availability.get("driving_path_flag"):
        lp = {tid for tid, a in acts.items() if a.driving_path and a.status != COMPLETED}
        return lp, "P6 Longest Path flag (TASK.driving_path_flag) from the last schedule calculation"
    open_acts = [a for a in acts.values() if a.status != COMPLETED and a.finish and not a.is_loe]
    if not open_acts:
        return set(), "No incomplete activities"
    end = max(a.finish.date() for a in open_acts)
    stack = [a.task_id for a in open_acts if a.finish.date() == end]
    seen: set[str] = set()
    ci = ctx.ci
    while stack:
        tid = stack.pop()
        if tid in seen:
            continue
        seen.add(tid)
        a = acts[tid]
        if a.status == IN_PROGRESS:
            continue  # remaining work is driven by the data date
        key = ctx.cal_key(cur, a)
        hpd = cur.calendar(a).hours_per_day or 8.0
        for rel in cur.preds(tid):
            p = acts.get(rel.pred_id)
            if p is None or p.status == COMPLETED or p.is_loe:
                continue
            if rel.type == "FS":
                frm, to = p.finish, a.start
                shift = 1
            elif rel.type == "SS":
                frm, to, shift = p.start, a.start, 0
            elif rel.type == "FF":
                frm, to, shift = p.finish, a.finish, 0
            else:
                frm, to, shift = p.start, a.finish, 0
            if frm is None or to is None:
                continue
            i, j = ci.idx(frm) + shift, ci.idx(to)
            gap = ci.workdays(key, i, j) if j >= i else -ci.workdays(key, j, i)
            gap -= rel.lag_hours / hpd
            if -1.0 <= gap <= 0.5:
                stack.append(p.task_id)
    return seen, "Computed: traced back from project finish through driving relationships (P6 flag not in XER)"


def apply_critical(ctx) -> dict:
    s = ctx.settings
    proj = ctx.cur.project
    notes: list[str] = []
    definition = s.critical_definition
    thr_hours = None
    thr_days = None
    if definition == "P6 Project Setting":
        if proj.critical_type == "CT_DrivPath":
            mode = "Longest Path"
            source = "P6 project setting: critical = Longest Path"
        else:
            mode = "Total Float"
            thr_hours = proj.critical_float_hours if proj.critical_float_hours is not None else 0.0
            source = f"P6 project setting: critical = Total Float <= {thr_hours:g} h"
            if not proj.critical_type:
                notes.append("ASSUMPTION: the XER does not state the critical definition; P6's default (Total Float <= 0) is used.")
    elif definition == "Total Float":
        mode = "Total Float"
        thr_days = s.critical_float_days
        source = f"User setting: Total Float <= {thr_days:g} days"
    else:
        mode = "Longest Path"
        source = "User setting: critical = Longest Path"
    lp, lp_source = longest_path(ctx)
    near = s.near_critical_days
    for r in ctx.rows:
        a = r.cur
        if a is None or a.status == COMPLETED or a.is_loe:
            r.is_critical = r.is_longest_path = r.is_near_critical = False
            continue
        r.is_longest_path = a.task_id in lp
        if mode == "Longest Path":
            r.is_critical = r.is_longest_path
        elif thr_hours is not None:
            r.is_critical = a.total_float_hours is not None and a.total_float_hours <= thr_hours + 1e-6
        else:
            r.is_critical = r.tf_d is not None and r.tf_d <= thr_days + 1e-6
        r.is_near_critical = (not r.is_critical) and r.tf_d is not None and r.tf_d <= near + 1e-6
    chain = sorted((r for r in ctx.rows if r.is_longest_path), key=lambda r: (r.start or r.finish, r.finish))
    return {"mode": mode, "source": source, "longest_path_source": lp_source, "notes": notes,
            "chain": [r.key for r in chain], "near_days": near}

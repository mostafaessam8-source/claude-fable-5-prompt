"""Schedule Quality / Health checks (DCMA 14-point style, configurable).

Each check reports its population, count, metric, threshold and the exact
activities found, so a Pass/Fail is never shown without its underlying test.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field

from ..core.model import COMPLETED, IN_PROGRESS, NOT_STARTED
from ..core.xer_fields import CONSTRAINTS

PASS, FAIL, INFO, NOT_PERFORMED = "Pass", "Fail", "Info", "Not Performed"


@dataclass
class Check:
    id: str
    name: str
    description: str
    population: int
    count: int
    metric: float | None
    threshold: str
    result: str
    keys: list = field(default_factory=list)
    basis: str = ""

    @property
    def metric_display(self) -> str:
        if self.metric is None:
            return "-"
        if "%" in self.threshold:
            return f"{self.metric:.1f}%"
        return f"{self.metric:g}" if float(self.metric).is_integer() else f"{self.metric:.2f}"


def _pct(n: int, d: int) -> float:
    return n / d * 100.0 if d else 0.0


def run_health(ctx) -> list[Check]:
    cur = ctx.cur
    th = ctx.settings.health
    dd = ctx.data_date
    rows = [r for r in ctx.rows if r.cur is not None]
    by_tid = {r.cur.task_id: r for r in rows}
    pop = [r for r in rows if r.status != COMPLETED and not r.is_loe and not r.cur.is_wbs_summary]
    tasks = [r for r in pop if not r.is_milestone]
    P = len(pop)
    checks: list[Check] = []

    # project start / finish are allowed to be open-ended
    starts = [r for r in rows if r.start]
    first = min(starts, key=lambda r: r.start).key if starts else None
    fins = [r for r in rows if r.finish]
    last = max(fins, key=lambda r: r.finish).key if fins else None

    no_pred = [r for r in pop if not cur.preds(r.cur.task_id) and r.key != first]
    no_succ = [r for r in pop if not cur.succs(r.cur.task_id) and r.key != last]
    missing = {r.key for r in no_pred} | {r.key for r in no_succ}
    v = _pct(len(missing), P)
    checks.append(Check("DCMA-01", "Logic", "Incomplete activities missing a predecessor or successor", P, len(missing), v,
                        f"<= {th['missing_logic_pct']}%", PASS if v <= th["missing_logic_pct"] else FAIL,
                        sorted(missing), "Project start and finish activities excluded"))

    open_ids = {r.cur.task_id for r in pop}
    rels = [x for x in cur.relationships if x.succ_id in open_ids]
    R = len(rels)
    leads = [x for x in rels if x.lag_hours < 0]
    checks.append(Check("DCMA-02", "Leads", "Relationships with negative lag", R, len(leads), float(len(leads)),
                        f"<= {th['leads_count']}", PASS if len(leads) <= th["leads_count"] else FAIL,
                        sorted({by_tid[x.succ_id].key for x in leads if x.succ_id in by_tid})))
    lags = [x for x in rels if x.lag_hours > 0]
    v = _pct(len(lags), R)
    checks.append(Check("DCMA-03", "Lags", "Relationships with positive lag", R, len(lags), v,
                        f"<= {th['lags_pct']}%", PASS if v <= th["lags_pct"] else FAIL,
                        sorted({by_tid[x.succ_id].key for x in lags if x.succ_id in by_tid})))
    types = Counter(x.type for x in rels)
    fs = _pct(types.get("FS", 0), R)
    non_fs = [x for x in rels if x.type != "FS"]
    checks.append(Check("DCMA-04", "Relationship Types", "Share of Finish-to-Start relationships", R, types.get("FS", 0), fs,
                        f">= {th['fs_pct_min']}%", PASS if fs >= th["fs_pct_min"] else FAIL,
                        sorted({by_tid[x.succ_id].key for x in non_fs if x.succ_id in by_tid}),
                        ", ".join(f"{k}: {v}" for k, v in sorted(types.items()))))
    hard = [r for r in pop if any(CONSTRAINTS.get(t, ("", ""))[1] == "hard" for t in (r.cur.cstr_type, r.cur.cstr_type2) if t)]
    v = _pct(len(hard), P)
    checks.append(Check("DCMA-05", "Hard Constraints", "Start/Finish On, On-or-Before, Mandatory constraints", P, len(hard), v,
                        f"<= {th['hard_constraints_pct']}%", PASS if v <= th["hard_constraints_pct"] else FAIL,
                        [r.key for r in hard]))
    hf = [r for r in pop if r.tf_d is not None and r.tf_d > th["high_float_days"]]
    v = _pct(len(hf), P)
    checks.append(Check("DCMA-06", "High Float", f"Total Float > {th['high_float_days']:g} working days", P, len(hf), v,
                        f"<= {th['high_float_pct']}%", PASS if v <= th["high_float_pct"] else FAIL, [r.key for r in hf]))
    nf = [r for r in pop if r.tf_d is not None and r.tf_d < 0]
    checks.append(Check("DCMA-07", "Negative Float", "Incomplete activities with Total Float < 0", P, len(nf), float(len(nf)),
                        f"<= {th['negative_float_count']}", PASS if len(nf) <= th["negative_float_count"] else FAIL,
                        [r.key for r in nf]))
    hd = [r for r in tasks if (r.rem_dur_d or 0) > th["high_duration_days"]]
    v = _pct(len(hd), len(tasks))
    checks.append(Check("DCMA-08", "High Duration", f"Remaining duration > {th['high_duration_days']:g} working days",
                        len(tasks), len(hd), v, f"<= {th['high_duration_pct']}%",
                        PASS if v <= th["high_duration_pct"] else FAIL, [r.key for r in hd]))
    inv = []
    if dd:
        for r in rows:
            a = r.cur
            if (a.act_start and a.act_start > dd) or (a.act_finish and a.act_finish > dd):
                inv.append(r.key)
            elif a.status != COMPLETED and a.early_finish and a.early_finish < dd:
                inv.append(r.key)
    checks.append(Check("DCMA-09", "Invalid Dates", "Actual dates after the Data Date, or forecast dates before it",
                        len(rows), len(inv), float(len(inv)), f"<= {th['invalid_dates_count']}",
                        PASS if len(inv) <= th["invalid_dates_count"] else FAIL, inv))
    if cur.availability.get("resources"):
        nores = [r for r in tasks if r.cur.resource_count == 0 and (r.orig_dur_d or 0) > 0]
        checks.append(Check("DCMA-10", "Resources", "Incomplete tasks with duration but no resource assignment",
                            len(tasks), len(nores), _pct(len(nores), len(tasks)), "Info", INFO, [r.key for r in nores]))
    else:
        checks.append(Check("DCMA-10", "Resources", "Schedule is not resource loaded", len(tasks), 0, None,
                            "Info", NOT_PERFORMED, [], "No TASKRSRC assignments in XER"))
    due = [r for r in rows if r.bl_finish and dd and r.bl_finish <= dd]
    missed = [r for r in due if r.status != COMPLETED or (r.finish and r.bl_finish and r.finish.date() > r.bl_finish.date())]
    v = _pct(len(missed), len(due))
    checks.append(Check("DCMA-11", "Missed Tasks", "Baseline-due activities finished late or not finished",
                        len(due), len(missed), v, f"<= {th['missed_tasks_pct']}%",
                        PASS if v <= th["missed_tasks_pct"] else FAIL, [r.key for r in missed]))
    checks.append(Check("DCMA-12", "Critical Path Test", "Requires delaying an activity and re-scheduling with a CPM engine",
                        0, 0, None, "-", NOT_PERFORMED, [], "Not performed: the application does not re-schedule the P6 network"))
    lp = [r for r in pop if r.is_longest_path]
    ff = ctx.forecast_finish
    if dd and ff and lp:
        key = lp[0].cal_id
        cpl = ctx.ci.workdays(key, ctx.ci.idx(dd), ctx.ci.idx(ff) + 1)
        tfs = [r.tf_d for r in lp if r.tf_d is not None]
        pf = min(tfs) if tfs else 0.0
        cpli = (cpl + pf) / cpl if cpl > 0 else None
        checks.append(Check("DCMA-13", "CPLI", "Critical Path Length Index = (CPL + project float) / CPL",
                            len(lp), len(lp), cpli, f">= {th['cpli_min']}",
                            PASS if cpli is not None and cpli >= th["cpli_min"] else FAIL, [r.key for r in lp],
                            f"CPL {cpl} working days from Data Date; project float = min TF on Longest Path ({pf:g} d)"))
    else:
        checks.append(Check("DCMA-13", "CPLI", "Critical Path Length Index", 0, 0, None, "-", NOT_PERFORMED, [],
                            "Requires Data Date, forecast finish and Longest Path"))
    due_tasks = [r for r in due if r.bl is not None]
    done = [r for r in rows if r.status == COMPLETED]
    bei = len(done) / len(due_tasks) if due_tasks else None
    checks.append(Check("DCMA-14", "BEI", "Baseline Execution Index = completed activities / baseline-due activities",
                        len(due_tasks), len(done), bei, f">= {th['bei_min']}",
                        INFO if bei is None else (PASS if bei >= th["bei_min"] else FAIL),
                        [r.key for r in due_tasks if r.status != COMPLETED]))

    # --- additional quality checks
    def add(cid, name, desc, keys, pop_n, info=False, basis=""):
        checks.append(Check(cid, name, desc, pop_n, len(keys), _pct(len(keys), pop_n), "Info" if info else "0",
                            INFO if info else (PASS if not keys else FAIL), keys, basis))

    add("Q-01", "Open-ended Activities", "Missing predecessor OR successor (incomplete)", sorted(missing), P)
    soft = [r.key for r in pop if any(CONSTRAINTS.get(t, ("", ""))[1] == "soft" for t in (r.cur.cstr_type, r.cur.cstr_type2) if t)]
    add("Q-02", "Soft Constraints", "Start/Finish On-or-After, As Late As Possible", soft, P, info=True)
    oos = []
    for r in rows:
        a = r.cur
        if a.status == NOT_STARTED:
            continue
        for rel in cur.preds(a.task_id):
            p = cur.activities.get(rel.pred_id)
            if p is None:
                continue
            if rel.type == "FS" and p.status != COMPLETED:
                oos.append(r.key)
                break
            if rel.type == "SS" and p.status == NOT_STARTED:
                oos.append(r.key)
                break
    add("Q-03", "Out-of-Sequence Progress", "Started before an FS predecessor finished / SS predecessor started", oos, len(rows))
    fut = [r.key for r in rows if dd and ((r.cur.act_start and r.cur.act_start > dd) or (r.cur.act_finish and r.cur.act_finish > dd))]
    add("Q-04", "Future Actual Dates", "Actual Start/Finish later than the Data Date", fut, len(rows))
    miss_act = [r.key for r in rows if (r.status in (IN_PROGRESS, COMPLETED) and r.cur.act_start is None)
                or (r.status == COMPLETED and r.cur.act_finish is None)]
    add("Q-05", "Missing Actual Dates", "Started/completed activities without Actual Start/Finish", miss_act, len(rows))
    susp = [r.key for r in rows if (r.status == IN_PROGRESS and r.cur.rem_dur_hours <= 0 and not r.is_milestone)
            or (r.status == COMPLETED and r.cur.rem_dur_hours > 0)
            or (r.status == NOT_STARTED and abs(r.cur.rem_dur_hours - r.cur.orig_dur_hours) > 0.01)]
    add("Q-06", "Suspicious Remaining Durations", "In progress with 0 remaining, completed with remaining, or not started with remaining ≠ original", susp, len(rows))
    codes = Counter(r.code for r in rows)
    dup = [r.key for r in rows if codes[r.code] > 1]
    add("Q-07", "Duplicate Activity IDs", "Activity ID used more than once", dup, len(rows))
    if cur.code_types:
        nocode = [r.key for r in rows if not r.cur.codes]
        add("Q-08", "Missing Activity Codes", "Activities without any activity code assignment", nocode, len(rows), info=True)
    unm = [r.key for r in rows if r.phase is None]
    add("Q-09", "Missing Phase Mapping", "Activities not mapped to any category", unm, len(rows))
    cross = []
    if dd:
        for r in rows:
            a = r.cur
            if a.status == NOT_STARTED and a.start and a.start < dd - _one_day():
                cross.append(r.key)
            elif a.status == COMPLETED and a.act_finish and a.act_finish > dd:
                cross.append(r.key)
            elif a.status == IN_PROGRESS and a.remaining_start and a.remaining_start < dd - _one_day():
                cross.append(r.key)
    add("Q-10", "Activities Crossing Data Date", "Unstarted work before the Data Date or actuals after it", cross, len(rows))
    return checks


def _one_day():
    from datetime import timedelta
    return timedelta(days=1)

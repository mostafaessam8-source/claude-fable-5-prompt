"""Synthetic P6 schedule generator.

Produces internally consistent XER files (dates, float, longest path, progress,
costs) from a compact specification using a small working-day CPM engine.
Used for the demonstration project and the automated tests.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field, replace
from datetime import date, datetime, time, timedelta

from .xer_writer import calendar_data, write_xer

MS_KINDS = ("start_ms", "finish_ms")


@dataclass
class GA:
    code: str
    name: str
    wbs: str
    dur: int
    preds: list = field(default_factory=list)       # (code, type, lag_days)
    kind: str = "task"                              # task / start_ms / finish_ms / loe
    codes: dict = field(default_factory=dict)       # code type name -> value
    rate: float = 0.0                               # budget cost per working day
    units_per_day: float = 16.0
    snet: int | None = None                         # Start-On-or-After constraint (workday index)
    udfs: dict = field(default_factory=dict)


@dataclass
class GenProject:
    short: str
    name: str
    start: date
    wbs: list                                       # (key, parent_key|None, code, name)
    acts: list
    code_types: dict = field(default_factory=dict)  # type name -> {value: description}
    workweek: str = "sunthu"
    holidays: list = field(default_factory=list)
    pct_type: str = "CP_Phys"
    critical_path_type: str = "CT_TotFloat"


def _hash01(s: str) -> float:
    return int(hashlib.md5(s.encode()).hexdigest()[:8], 16) / 0xFFFFFFFF


class WorkCal:
    def __init__(self, start: date, workweek: str, holidays: list[date], n: int = 4000):
        work = {"sunthu": {6, 0, 1, 2, 3}, "monfri": {0, 1, 2, 3, 4}, "7day": set(range(7))}[workweek]
        self.days: list[date] = []
        d = start
        hol = set(holidays)
        while len(self.days) < n:
            if d.weekday() in work and d not in hol:
                self.days.append(d)
            d += timedelta(days=1)
        self.index = {d: i for i, d in enumerate(self.days)}

    def idx_on_or_after(self, d: date) -> int:
        while d not in self.index:
            d += timedelta(days=1)
        return self.index[d]

    def start_dt(self, i: int) -> datetime:
        return datetime.combine(self.days[max(0, i)], time(8, 0))

    def finish_dt(self, excl_end: int) -> datetime:
        return datetime.combine(self.days[max(0, excl_end - 1)], time(16, 0))


def _topo(acts: dict) -> list[str]:
    indeg = {c: 0 for c in acts}
    succ: dict[str, list[str]] = {c: [] for c in acts}
    for a in acts.values():
        for p, _t, _l in a.preds:
            if p in acts:
                indeg[a.code] += 1
                succ[p].append(a.code)
    order, ready = [], [c for c, n in indeg.items() if n == 0]
    while ready:
        c = ready.pop(0)
        order.append(c)
        for s in succ[c]:
            indeg[s] -= 1
            if indeg[s] == 0:
                ready.append(s)
    if len(order) != len(acts):
        raise ValueError("logic loop in generated schedule")
    return order


def cpm(proj: GenProject, dd: int | None = None, progress: dict | None = None, durs: dict | None = None,
        must_finish: int | None = None):
    """Working-day CPM. Indices: activity occupies [ES, EF). Returns dict code -> result."""
    acts = {a.code: a for a in proj.acts}
    order = _topo(acts)
    progress = progress or {}
    durs = durs or {}
    R: dict[str, dict] = {}
    lb = dd or 0
    for c in order:
        a = acts[c]
        d = 0 if a.kind in MS_KINDS else durs.get(c, a.dur)
        pg = progress.get(c)
        if pg and pg.get("af") is not None:
            R[c] = dict(ES=pg["as"], EF=pg["af"], RS=None, done=True, d=d)
            continue
        es = lb
        for p, t, lag in a.preds:
            if p not in R:
                continue
            r = R[p]
            if t == "FS":
                v = r["EF"] + lag
            elif t == "SS":
                v = r["ES"] + lag
            elif t == "FF":
                v = r["EF"] + lag - d
            else:
                v = r["ES"] + lag - d
            es = max(es, v)
        if a.snet is not None:
            es = max(es, a.snet)
        if pg:  # in progress
            rs = max(es, lb)
            R[c] = dict(ES=pg["as"], EF=rs + pg["rem"], RS=rs, done=False, d=d, rem=pg["rem"])
        else:
            R[c] = dict(ES=es, EF=es + d, RS=es, done=False, d=d, rem=d)
    end = max(r["EF"] for r in R.values())
    if must_finish is not None:
        end = must_finish
    succs: dict[str, list] = {c: [] for c in acts}
    for a in acts.values():
        for p, t, lag in a.preds:
            if p in acts:
                succs[p].append((a.code, t, lag))
    for c in reversed(order):
        r = R[c]
        if r["done"]:
            continue
        rem = r["rem"]
        lf = end
        for s, t, lag in succs[c]:
            rs = R[s]
            if rs["done"]:
                continue
            if t == "FS":
                v = rs["LS"] - lag
            elif t == "SS":
                v = rs["LS"] - lag + rem
            elif t == "FF":
                v = rs["LF"] - lag
            else:
                v = rs["LF"] - lag + rem
            lf = min(lf, v)
        r["LF"] = lf
        r["LS"] = lf - rem
        r["TF"] = lf - r["EF"]
    # free float (FS successors) and driving path
    for c, r in R.items():
        if r["done"]:
            continue
        ff = r["TF"]
        for s, t, lag in succs[c]:
            rs = R[s]
            if rs["done"]:
                continue
            if t == "FS":
                ff = min(ff, rs["RS"] - lag - r["EF"])
        r["FF"] = max(0, ff)
        r["drive"] = False
    open_acts = [c for c in R if not R[c]["done"]]
    if open_acts:
        last_ef = max(R[c]["EF"] for c in open_acts)
        stack = [c for c in open_acts if R[c]["EF"] == last_ef]
        while stack:
            c = stack.pop()
            if R[c].get("drive"):
                continue
            R[c]["drive"] = True
            if progress.get(c):
                continue  # in progress: remaining work is driven by the data date
            me = R[c]
            for p, t, lag in acts[c].preds:
                rp = R.get(p)
                if rp is None or rp["done"]:
                    continue
                if t == "FS":
                    v, target = rp["EF"] + lag, me["RS"]
                elif t == "SS":
                    v, target = rp["ES"] + lag, me["RS"]
                elif t == "FF":
                    v, target = rp["EF"] + lag, me["EF"]
                else:
                    v, target = rp["ES"] + lag, me["EF"]
                if v == target:
                    stack.append(p)
    return R, end


def simulate_progress(proj: GenProject, dd: int, factors: dict[str, float]) -> dict:
    """Derive actual progress at data date `dd` from a simulated execution."""
    durs = {a.code: max(1, round(a.dur * factors.get(a.code, 1.0))) for a in proj.acts if a.kind not in MS_KINDS}
    R, _ = cpm(proj, None, None, durs)
    prog = {}
    for a in proj.acts:
        r = R[a.code]
        if a.kind in MS_KINDS:
            if r["ES"] < dd:
                prog[a.code] = {"as": r["ES"], "af": r["ES"], "rem": 0, "pct": 100.0}
            continue
        if r["EF"] <= dd:
            prog[a.code] = {"as": r["ES"], "af": r["EF"], "rem": 0, "pct": 100.0}
        elif r["ES"] < dd:
            total = r["EF"] - r["ES"]
            prog[a.code] = {"as": r["ES"], "af": None, "rem": r["EF"] - dd,
                            "pct": round((dd - r["ES"]) / total * 100.0, 1)}
    return prog


def build_xer(proj: GenProject, *, proj_id: int, task_base: int, data_date_idx: int = 0,
              progress: dict | None = None, planned: dict | None = None,
              include_costs: bool = True, include_actual_cost: bool = True,
              cost_factor: dict | None = None, driving_flag: bool = True,
              must_finish_idx: int | None = None, version: str = "20.12") -> str:
    cal = WorkCal(proj.start, proj.workweek, proj.holidays)
    R, _end = cpm(proj, data_date_idx if progress else None, progress, must_finish=must_finish_idx)
    progress = progress or {}
    cost_factor = cost_factor or {}
    clndr_id = str(proj_id * 10 + 1)
    p6week = {"sunthu": {1, 2, 3, 4, 5}, "monfri": {2, 3, 4, 5, 6}, "7day": set(range(1, 8))}[proj.workweek]
    cdata = calendar_data({d: ("08:00", "16:00") for d in p6week}, proj.holidays)

    dd_dt = cal.start_dt(data_date_idx)
    finish = max(cal.finish_dt(r["EF"]) for r in R.values())

    wbs_ids = {}
    wbs_rows = [{"wbs_id": proj_id * 1000, "proj_id": proj_id, "obs_id": 1, "seq_num": 0, "proj_node_flag": "Y",
                 "wbs_short_name": proj.short, "wbs_name": proj.name, "parent_wbs_id": "", "status_code": "WS_Open"}]
    for i, (key, parent, code, name) in enumerate(proj.wbs, start=1):
        wbs_ids[key] = proj_id * 1000 + i
        wbs_rows.append({"wbs_id": wbs_ids[key], "proj_id": proj_id, "obs_id": 1, "seq_num": i,
                         "proj_node_flag": "N", "wbs_short_name": code, "wbs_name": name,
                         "parent_wbs_id": wbs_ids[parent] if parent else proj_id * 1000, "status_code": "WS_Open"})

    task_ids = {a.code: task_base + i for i, a in enumerate(proj.acts)}
    task_rows, rsrc_rows, pred_rows, tact_rows, udf_rows = [], [], [], [], []
    type_ids = {name: proj_id * 100 + i for i, name in enumerate(proj.code_types, start=1)}
    value_ids = {}
    code_rows = []
    n = 0
    for tname, values in proj.code_types.items():
        for v, desc in values.items():
            n += 1
            value_ids[(tname, v)] = proj_id * 10000 + n
            code_rows.append({"actv_code_id": value_ids[(tname, v)], "parent_actv_code_id": "",
                              "actv_code_type_id": type_ids[tname], "actv_code_name": desc, "short_name": v,
                              "seq_num": n, "color": "", "total_assignments": 0})
    udf_labels = sorted({k for a in proj.acts for k in a.udfs})
    udf_ids = {lab: proj_id * 10 + i for i, lab in enumerate(udf_labels, start=1)}

    rsrc_by_disc = {}
    for a in proj.acts:
        r = R[a.code]
        tid = task_ids[a.code]
        is_ms = a.kind in MS_KINDS
        pg = progress.get(a.code)
        done = bool(pg and pg.get("af") is not None)
        active = bool(pg and not done)
        d = 0 if is_ms else a.dur
        status = "TK_Complete" if done else ("TK_Active" if active else "TK_NotStart")
        pct = pg["pct"] if pg else 0.0
        if is_ms:
            es_dt = cal.start_dt(r["ES"]) if a.kind == "start_ms" else cal.finish_dt(r["EF"])
            ef_dt = es_dt
        else:
            es_dt = cal.start_dt(r["RS"] if active else r["ES"])
            ef_dt = cal.finish_dt(r["EF"])
        act_start = act_end = None
        if pg:
            act_start = (cal.start_dt(pg["as"]) if a.kind != "finish_ms" else cal.finish_dt(pg["as"]))
            if done:
                act_end = cal.finish_dt(pg["af"]) if not is_ms else act_start
        rem = 0 if done else (r["rem"] if not is_ms else 0)
        tf = None if done else r["TF"] * 8.0
        ls = lf = None
        if not done:
            ls = cal.start_dt(r["LS"]) if not is_ms or a.kind == "start_ms" else cal.finish_dt(r["LF"])
            lf = cal.finish_dt(r["LF"]) if not is_ms or a.kind == "finish_ms" else ls
        pl = (planned or {}).get(a.code)
        task_rows.append({
            "task_id": tid, "proj_id": proj_id, "wbs_id": wbs_ids[a.wbs], "clndr_id": clndr_id,
            "phys_complete_pct": pct, "rev_fdbk_flag": "N", "est_wt": 1, "lock_plan_flag": "N",
            "auto_compute_act_flag": "N", "complete_pct_type": proj.pct_type,
            "task_type": {"task": "TT_Task", "start_ms": "TT_Mile", "finish_ms": "TT_FinMile", "loe": "TT_LOE"}[a.kind],
            "duration_type": "DT_FixedDUR2", "status_code": status, "task_code": a.code, "task_name": a.name,
            "rsrc_id": "", "total_float_hr_cnt": tf, "free_float_hr_cnt": None if done else r["FF"] * 8.0,
            "remain_drtn_hr_cnt": rem * 8.0, "act_work_qty": 0, "remain_work_qty": 0, "target_work_qty": 0,
            "target_drtn_hr_cnt": d * 8.0, "target_equip_qty": 0, "act_equip_qty": 0, "remain_equip_qty": 0,
            "cstr_date": cal.start_dt(a.snet) if a.snet is not None else None,
            "act_start_date": act_start, "act_end_date": act_end,
            "late_start_date": ls, "late_end_date": lf, "expect_end_date": None,
            "early_start_date": None if done else es_dt, "early_end_date": None if done else ef_dt,
            "restart_date": None if done else es_dt, "reend_date": None if done else ef_dt,
            "target_start_date": pl[0] if pl else (act_start or es_dt),
            "target_end_date": pl[1] if pl else (act_end or ef_dt),
            "rem_late_start_date": ls, "rem_late_end_date": lf,
            "cstr_type": "CS_MSOA" if a.snet is not None else "",
            "priority_type": "PT_Normal", "suspend_date": None, "resume_date": None, "float_path": "",
            "float_path_order": "", "guid": "", "tmpl_guid": "", "cstr_date2": None, "cstr_type2": "",
            "driving_path_flag": ("Y" if r.get("drive") else "N") if not done else "N",
            "act_this_per_work_qty": 0, "act_this_per_equip_qty": 0, "external_early_start_date": None,
            "external_late_end_date": None, "create_date": datetime(2024, 12, 1), "update_date": dd_dt,
            "create_user": "admin", "update_user": "admin", "location_id": "",
        })
        for p, t, lag in a.preds:
            if p in task_ids:
                pred_rows.append({"task_pred_id": len(pred_rows) + 1 + proj_id * 100000, "task_id": tid,
                                  "pred_task_id": task_ids[p], "proj_id": proj_id, "pred_proj_id": proj_id,
                                  "pred_type": "PR_" + t, "lag_hr_cnt": lag * 8.0, "comments": "", "float_path": "",
                                  "aref": "", "arls": ""})
        for tname, v in a.codes.items():
            tact_rows.append({"task_id": tid, "actv_code_type_id": type_ids[tname],
                              "actv_code_id": value_ids[(tname, v)], "proj_id": proj_id})
        for lab, val in a.udfs.items():
            udf_rows.append({"udf_type_id": udf_ids[lab], "fk_id": tid, "proj_id": proj_id,
                             "udf_date": None, "udf_number": val if isinstance(val, (int, float)) else None,
                             "udf_text": val if isinstance(val, str) else "", "udf_code_id": ""})
        if include_costs and not is_ms and a.rate > 0:
            disc = a.codes.get("Discipline", "GEN")
            rid = rsrc_by_disc.setdefault(disc, proj_id * 100 + len(rsrc_by_disc) + 1)
            budget = a.rate * a.dur
            qty = a.units_per_day * a.dur
            f = cost_factor.get(a.code, 1.0)
            frac = pct / 100.0
            rsrc_rows.append({
                "taskrsrc_id": len(rsrc_rows) + 1 + proj_id * 100000, "task_id": tid, "proj_id": proj_id,
                "cost_qty_link_flag": "Y", "role_id": "", "acct_id": "", "rsrc_id": rid, "pobs_id": "",
                "skill_level": "", "remain_qty": qty * (1 - frac), "target_qty": qty, "remain_qty_per_hr": 2,
                "target_lag_drtn_hr_cnt": 0, "target_qty_per_hr": 2, "act_ot_qty": 0,
                "act_reg_qty": qty * frac * f, "relag_drtn_hr_cnt": 0, "ot_factor": "", "cost_per_qty": a.rate / a.units_per_day,
                "target_cost": budget, "act_reg_cost": (budget * frac * f) if include_actual_cost else 0,
                "act_ot_cost": 0, "remain_cost": budget * (1 - frac),
                "act_start_date": act_start, "act_end_date": act_end, "restart_date": None, "reend_date": None,
                "target_start_date": es_dt, "target_end_date": ef_dt, "rem_late_start_date": ls, "rem_late_end_date": lf,
                "rollup_dates_flag": "Y", "target_crv": "", "remain_crv": "", "actual_crv": "", "ts_pend_act_end_flag": "N",
                "guid": "", "rate_type": "COST_PER_QTY", "act_this_per_cost": 0, "act_this_per_qty": 0,
                "curv_id": "", "rsrc_type": "RT_Labor", "cost_per_qty_source_type": "Q_Rsrc", "create_user": "admin",
                "create_date": datetime(2024, 12, 1), "has_rsrchours": "N", "taskrsrc_sum_id": "",
            })

    project_row = {
        "proj_id": proj_id, "fy_start_month_num": 1, "rsrc_self_add_flag": "Y", "allow_complete_flag": "Y",
        "rsrc_multi_assign_flag": "Y", "checkout_flag": "N", "project_flag": "Y", "step_complete_flag": "N",
        "cost_qty_recalc_flag": "Y", "batch_sum_flag": "Y", "name_sep_char": ".", "def_complete_pct_type": proj.pct_type,
        "proj_short_name": proj.short, "acct_id": "", "orig_proj_id": "", "source_proj_id": "", "base_type_id": "",
        "clndr_id": clndr_id, "sum_base_proj_id": "", "task_code_base": 1000, "task_code_step": 10,
        "priority_num": 10, "wbs_max_sum_level": 0, "strgy_priority_num": 100, "last_checksum": "",
        "critical_drtn_hr_cnt": 0, "def_cost_per_qty": 100, "last_recalc_date": dd_dt,
        "plan_start_date": cal.start_dt(0),
        "plan_end_date": cal.finish_dt(must_finish_idx) if must_finish_idx is not None else None, "scd_end_date": finish,
        "add_date": datetime(2024, 12, 1), "last_tasksum_date": dd_dt, "fcst_start_date": None,
        "def_duration_type": "DT_FixedDUR2", "task_code_prefix": "", "guid": "", "def_qty_type": "QT_Hour",
        "add_by_name": "admin", "web_local_root_path": "", "proj_url": "", "def_rate_type": "COST_PER_QTY",
        "add_act_remain_flag": "N", "act_this_per_link_flag": "Y", "def_task_type": "TT_Task",
        "act_pct_link_flag": "N", "critical_path_type": proj.critical_path_type, "task_code_prefix_flag": "Y",
        "def_rollup_dates_flag": "Y", "use_project_baseline_flag": "Y", "rem_target_link_flag": "Y",
        "reset_planned_flag": "N", "allow_neg_act_flag": "N", "sum_assign_level": "SL_Taskrsrc",
        "last_fin_dates_id": "", "fintmpl_id": "", "last_baseline_update_date": None, "cr_external_key": "",
        "apply_actuals_date": None, "location_id": "", "loaded_scope_level": 7, "export_flag": "Y",
        "new_fin_dates_id": "", "baselines_to_export": "", "baseline_names_to_export": "",
        "next_data_date": None, "close_period_flag": "", "sum_refresh_date": None, "trsrcsum_loaded": "",
    }
    tables = {
        "CURRTYPE": (["curr_id", "decimal_digit_cnt", "curr_symbol", "decimal_symbol", "digit_group_symbol",
                      "pos_curr_fmt_type", "neg_curr_fmt_type", "curr_type", "curr_short_name", "group_digit_cnt",
                      "base_exch_rate"],
                     [{"curr_id": 1, "decimal_digit_cnt": 2, "curr_symbol": "$", "decimal_symbol": ".",
                       "digit_group_symbol": ",", "pos_curr_fmt_type": "#1.1", "neg_curr_fmt_type": "(#1.1)",
                       "curr_type": "US Dollar", "curr_short_name": "USD", "group_digit_cnt": 3, "base_exch_rate": 1}]),
        "PROJECT": (list(project_row), [project_row]),
        "CALENDAR": (["clndr_id", "default_flag", "clndr_name", "proj_id", "base_clndr_id", "last_chng_date",
                      "clndr_type", "day_hr_cnt", "week_hr_cnt", "month_hr_cnt", "year_hr_cnt", "rsrc_private",
                      "clndr_data"],
                     [{"clndr_id": clndr_id, "default_flag": "N", "clndr_name": f"{proj.short} {'Sun-Thu' if proj.workweek == 'sunthu' else 'Mon-Fri'} 8h",
                       "proj_id": "", "base_clndr_id": "", "last_chng_date": None, "clndr_type": "CA_Base",
                       "day_hr_cnt": 8, "week_hr_cnt": 40, "month_hr_cnt": 172, "year_hr_cnt": 2000,
                       "rsrc_private": "N", "clndr_data": cdata}]),
        "PROJWBS": (["wbs_id", "proj_id", "obs_id", "seq_num", "proj_node_flag", "wbs_short_name", "wbs_name",
                     "parent_wbs_id", "status_code"], wbs_rows),
    }
    if code_rows:
        tables["ACTVTYPE"] = (["actv_code_type_id", "actv_short_len", "seq_num", "actv_code_type", "proj_id",
                               "wbs_id", "actv_code_type_scope"],
                              [{"actv_code_type_id": i, "actv_short_len": 10, "seq_num": i, "actv_code_type": n,
                                "proj_id": proj_id, "wbs_id": "", "actv_code_type_scope": "AS_Project"}
                               for n, i in type_ids.items()])
        tables["ACTVCODE"] = (list(code_rows[0]), code_rows)
    if rsrc_rows:
        tables["RSRC"] = (["rsrc_id", "parent_rsrc_id", "clndr_id", "rsrc_seq_num", "rsrc_short_name", "rsrc_name",
                           "rsrc_type", "active_flag"],
                          [{"rsrc_id": rid, "parent_rsrc_id": "", "clndr_id": clndr_id, "rsrc_seq_num": i,
                            "rsrc_short_name": f"LAB-{d}", "rsrc_name": f"{d} Labour", "rsrc_type": "RT_Labor",
                            "active_flag": "Y"} for i, (d, rid) in enumerate(rsrc_by_disc.items())])
    if udf_labels:
        tables["UDFTYPE"] = (["udf_type_id", "table_name", "udf_type_name", "udf_type_label", "logical_data_type",
                              "super_flag", "indicator_expression", "summary_indicator_expression", "export_flag"],
                             [{"udf_type_id": i, "table_name": "TASK", "udf_type_name": f"user_field_{i}",
                               "udf_type_label": lab,
                               "logical_data_type": "FT_FLOAT_2_DECIMALS" if any(isinstance(a.udfs.get(lab), (int, float)) for a in proj.acts) else "FT_TEXT",
                               "super_flag": "N", "indicator_expression": "", "summary_indicator_expression": "",
                               "export_flag": "Y"} for lab, i in udf_ids.items()])
    tables["TASK"] = (list(task_rows[0]), task_rows)
    if pred_rows:
        tables["TASKPRED"] = (list(pred_rows[0]), pred_rows)
    if rsrc_rows:
        tables["TASKRSRC"] = (list(rsrc_rows[0]), rsrc_rows)
    if tact_rows:
        tables["TASKACTV"] = (list(tact_rows[0]), tact_rows)
    if udf_rows:
        tables["UDFVALUE"] = (list(udf_rows[0]), udf_rows)
    if not driving_flag:
        f, rows = tables["TASK"]
        tables["TASK"] = ([x for x in f if x != "driving_path_flag"], rows)
    return write_xer(tables, version=version, export_date=datetime.combine(cal.days[data_date_idx], time(9)))


def baseline_dates(proj: GenProject) -> dict:
    cal = WorkCal(proj.start, proj.workweek, proj.holidays)
    R, _ = cpm(proj)
    out = {}
    for a in proj.acts:
        r = R[a.code]
        if a.kind == "finish_ms":
            s = f = cal.finish_dt(r["EF"])
        elif a.kind == "start_ms":
            s = f = cal.start_dt(r["ES"])
        else:
            s, f = cal.start_dt(r["ES"]), cal.finish_dt(r["EF"])
        out[a.code] = (s, f)
    return out


def with_acts(proj: GenProject, acts: list) -> GenProject:
    return replace(proj, acts=acts)

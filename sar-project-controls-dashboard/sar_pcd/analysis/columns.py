"""Column catalogue for activity lists (shared by UI tables and Excel exports)."""
from __future__ import annotations

from typing import Callable

def _num(v, digits=1):
    return "" if v is None else (f"{v:.{digits}f}".rstrip("0").rstrip(".") if digits else f"{v:.0f}")


# key -> (header, value fn(row, dd), kind)
COLUMNS: dict[str, tuple[str, Callable, str]] = {
    "code": ("Activity ID", lambda r, dd: r.code, "text"),
    "name": ("Activity Name", lambda r, dd: r.name, "text"),
    "wbs": ("WBS", lambda r, dd: r.wbs_path, "text"),
    "phase": ("Category", lambda r, dd: r.phase or "Not Mapped", "text"),
    "conf": ("Mapping Confidence", lambda r, dd: r.phase_conf * 100, "pct"),
    "level": ("Confidence Level", lambda r, dd: r.phase_level, "text"),
    "stage": ("Stage", lambda r, dd: r.stage or "", "text"),
    "discipline": ("Discipline", lambda r, dd: r.dims.get("Discipline", ""), "text"),
    "location": ("Location", lambda r, dd: r.dims.get("Location", ""), "text"),
    "contractor": ("Contractor", lambda r, dd: r.dims.get("Contractor", ""), "text"),
    "wp": ("Work Package", lambda r, dd: r.dims.get("Work Package", ""), "text"),
    "orig": ("Orig. Dur (d)", lambda r, dd: r.orig_dur_d, "num"),
    "rem": ("Rem. Dur (d)", lambda r, dd: r.rem_dur_d, "num"),
    "bl_dur": ("BL Dur (d)", lambda r, dd: r.bl_dur_d, "num"),
    "bl_start": ("BL Start", lambda r, dd: r.bl_start, "date"),
    "bl_finish": ("BL Finish", lambda r, dd: r.bl_finish, "date"),
    "start": ("Start", lambda r, dd: r.start, "date"),
    "finish": ("Finish", lambda r, dd: r.finish, "date"),
    "fc_start": ("Forecast Start", lambda r, dd: r.cur.remaining_start if r.cur else None, "date"),
    "act_start": ("Actual Start", lambda r, dd: r.cur.act_start if r.cur else None, "date"),
    "act_finish": ("Actual Finish", lambda r, dd: r.cur.act_finish if r.cur else None, "date"),
    "pct": ("% Complete", lambda r, dd: r.pct if r.cur else None, "pct"),
    "tf": ("Total Float (d)", lambda r, dd: r.tf_d, "num"),
    "ff": ("Free Float (d)", lambda r, dd: r.ff_d, "num"),
    "start_var": ("Start Var (d)", lambda r, dd: r.start_var_d, "var"),
    "finish_var": ("Finish Var (d)", lambda r, dd: r.finish_var_d, "var"),
    "dur_var": ("Dur Var (d)", lambda r, dd: r.dur_var_d, "var"),
    "status": ("Status", lambda r, dd: r.display_status(dd), "status"),
    "p6status": ("P6 Status", lambda r, dd: r.status if r.cur else "Not in Current", "text"),
    "critical": ("Critical", lambda r, dd: ("Longest Path" if r.is_longest_path else "Critical") if r.is_critical or r.is_longest_path else ("Near" if r.is_near_critical else ""), "text"),
    "match": ("Match Status", lambda r, dd: r.match_status, "text"),
    "match_conf": ("Match Confidence", lambda r, dd: r.match_conf * 100, "pct"),
    "weight": ("Weight", lambda r, dd: r.weight, "num"),
    "budget": ("Budget Cost", lambda r, dd: r.cur.budget_cost if r.cur else None, "money"),
    "actual_cost": ("Actual Cost", lambda r, dd: r.cur.actual_cost if r.cur else None, "money"),
}

DEFAULT_COLS = ["code", "name", "wbs", "phase", "orig", "rem", "bl_start", "bl_finish", "start", "finish",
                "act_start", "act_finish", "pct", "tf", "finish_var", "status"]

"""Baseline vs Current change analysis (drill-down lists per change category)."""
from __future__ import annotations

from . import matching as M

CATEGORIES = ["Added Activities", "Deleted Activities", "Split Activities", "Renamed / Re-coded",
              "Unmatched (review)", "Changed Durations", "Changed Logic", "Changed Constraints",
              "Changed Calendars", "Changed WBS", "Changed Activity Codes", "Changed Names",
              "Changed Activity Type", "Changed Dates"]

_PREFIX = {"Duration": "Changed Durations", "Logic": "Changed Logic", "Constraint": "Changed Constraints",
           "Calendar": "Changed Calendars", "WBS": "Changed WBS", "Activity Codes": "Changed Activity Codes",
           "Name": "Changed Names", "Activity Type": "Changed Activity Type"}


def change_analysis(ctx) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {c: [] for c in CATEGORIES}
    rows_by_key = ctx.row_by_key()
    for m in ctx.recon.matches:
        c = ctx.cur.activities.get(m.current_id) if m.current_id else None
        b = ctx.bl.activities.get(m.baseline_id) if m.baseline_id else None
        key = c.task_id if c else ("BL:" + b.task_id if b else "")
        base = {"key": key, "bl_code": b.code if b else "", "code": c.code if c else "",
                "name": (c or b).name, "status": m.status, "confidence": m.confidence, "method": m.method}
        if m.status == M.ADDED:
            out["Added Activities"].append({**base, "detail": m.method})
        elif m.status == M.DELETED:
            out["Deleted Activities"].append({**base, "detail": m.method})
        elif m.status == M.SPLIT and c is None:
            out["Split Activities"].append({**base, "detail": "; ".join(m.changes)})
        elif m.status == M.RENAMED:
            out["Renamed / Re-coded"].append({**base, "detail": "; ".join(m.changes)})
        elif m.status == M.UNMATCHED:
            cands = ", ".join(f"{(ctx.bl if c else ctx.cur).activities[t].code} ({s:.0%})" for t, s in m.candidates[:3])
            out["Unmatched (review)"].append({**base, "detail": "Candidates: " + cands})
        for ch in m.changes:
            head = ch.split(":")[0]
            cat = _PREFIX.get(head) or ("Changed Activity Codes" if ch.startswith("Activity Codes") else None)
            if cat and m.status not in (M.SPLIT,):
                out[cat].append({**base, "detail": ch})
        if m.date_changes and c is not None and b is not None:
            r = rows_by_key.get(key)
            out["Changed Dates"].append({**base, "detail": "; ".join(m.date_changes),
                                         "finish_var": r.finish_var_d if r else None})
    return out

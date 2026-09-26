"""Baseline vs Current activity reconciliation.

1. Primary match on Activity ID (task_code).
2. Secondary similarity match for the leftovers using name, WBS path,
   original duration, activity codes and already-matched logic neighbours.
   High-confidence, unambiguous pairs become "Potentially Renamed"; everything
   else stays "Unmatched" with candidate suggestions for the user to review.
   Uncertain pairs are never forced.
3. Split detection: one baseline activity replaced by 2+ added activities in
   the same WBS whose names contain the baseline name.
4. User decisions (profile.match_overrides) always win.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from ..core.model import Activity, Schedule
from ..mapping.text import normalize, ratio, token_set_similarity

UNCHANGED = "Unchanged"
MODIFIED = "Modified"
ADDED = "Added"
DELETED = "Deleted"
SPLIT = "Split"
RENAMED = "Potentially Renamed"
UNMATCHED = "Unmatched"
USER = "User Matched"

W_NAME, W_WBS, W_NEIGH, W_DUR, W_CODES = 0.45, 0.20, 0.20, 0.10, 0.05
AUTO_ACCEPT = 0.80
CANDIDATE = 0.55
MARGIN = 0.05


@dataclass
class ActivityMatch:
    baseline_id: str | None
    current_id: str | None
    status: str
    confidence: float = 1.0
    method: str = "Activity ID"
    changes: list = field(default_factory=list)          # structural changes
    date_changes: list = field(default_factory=list)     # start/finish changes
    candidates: list = field(default_factory=list)       # [(other task_id, score)]
    split_group: list = field(default_factory=list)      # related task_ids for splits


@dataclass
class Reconciliation:
    matches: list
    by_current: dict
    by_baseline: dict

    def stats(self) -> dict[str, int]:
        out: dict[str, int] = {}
        for m in self.matches:
            out[m.status] = out.get(m.status, 0) + 1
        return out

    def needing_review(self) -> list[ActivityMatch]:
        return [m for m in self.matches if m.status in (UNMATCHED, RENAMED, SPLIT)]


def _codes(s: Schedule, a: Activity) -> set[str]:
    out = set()
    for t, v in a.codes.items():
        ct, cv = s.code_types.get(t), s.code_values.get(v)
        if ct and cv:
            out.add(f"{ct.name}:{cv.value}")
    return out


def _preds_sig(s: Schedule, a: Activity) -> set[tuple]:
    out = set()
    for r in s.preds(a.task_id):
        p = s.activities.get(r.pred_id)
        out.add((p.code if p else f"ext:{r.pred_id}", r.type, round(r.lag_hours, 1)))
    return out


def _neighbors(s: Schedule, a: Activity) -> set[str]:
    out = set()
    for r in s.preds(a.task_id):
        p = s.activities.get(r.pred_id)
        if p:
            out.add(p.code)
    for r in s.succs(a.task_id):
        p = s.activities.get(r.succ_id)
        if p:
            out.add(p.code)
    return out


def compare_structure(bl: Schedule, cu: Schedule, b: Activity, c: Activity) -> tuple[list[str], list[str]]:
    ch: list[str] = []
    if normalize(b.name) != normalize(c.name):
        ch.append(f"Name: '{b.name}' -> '{c.name}'")
    if abs(b.orig_dur_hours - c.orig_dur_hours) > 0.01:
        bd = bl.hours_to_days(b.orig_dur_hours, b)
        cd = cu.hours_to_days(c.orig_dur_hours, c)
        ch.append(f"Duration: {bd:g}d -> {cd:g}d")
    if bl.wbs_code_path(b.wbs_id) != cu.wbs_code_path(c.wbs_id):
        ch.append(f"WBS: {bl.wbs_code_path(b.wbs_id)} -> {cu.wbs_code_path(c.wbs_id)}")
    bc, cc = bl.calendar(b).name, cu.calendar(c).name
    if bc != cc:
        ch.append(f"Calendar: {bc} -> {cc}")
    if (b.cstr_type, b.cstr_date, b.cstr_type2, b.cstr_date2) != (c.cstr_type, c.cstr_date, c.cstr_type2, c.cstr_date2):
        ch.append(f"Constraint: {b.cstr_type or 'none'} {b.cstr_date or ''} -> {c.cstr_type or 'none'} {c.cstr_date or ''}".strip())
    bp, cp = _preds_sig(bl, b), _preds_sig(cu, c)
    if bp != cp:
        added = sorted(x[0] + " " + x[1] for x in cp - bp)
        removed = sorted(x[0] + " " + x[1] for x in bp - cp)
        parts = []
        if added:
            parts.append("added " + ", ".join(added))
        if removed:
            parts.append("removed " + ", ".join(removed))
        ch.append("Logic: " + "; ".join(parts))
    if _codes(bl, b) != _codes(cu, c):
        ch.append("Activity Codes changed")
    if b.task_type != c.task_type:
        ch.append(f"Activity Type: {b.task_type} -> {c.task_type}")
    dates: list[str] = []
    if b.start and c.start and b.start.date() != c.start.date():
        dates.append(f"Start: {(c.start.date() - b.start.date()).days:+d} days")
    if b.finish and c.finish and b.finish.date() != c.finish.date():
        dates.append(f"Finish: {(c.finish.date() - b.finish.date()).days:+d} days")
    return ch, dates


def _similarity(bl: Schedule, cu: Schedule, b: Activity, c: Activity, matched_codes: dict[str, str]) -> float:
    name = token_set_similarity(b.name, c.name)
    wbs = ratio(normalize(bl.wbs_path_text(b.wbs_id)), normalize(cu.wbs_path_text(c.wbs_id)))
    bd, cd = b.orig_dur_hours, c.orig_dur_hours
    dur = 1.0 if bd == cd else (1 - abs(bd - cd) / max(bd, cd) if max(bd, cd) > 0 else 1.0)
    bcodes, ccodes = _codes(bl, b), _codes(cu, c)
    codes = len(bcodes & ccodes) / len(bcodes | ccodes) if (bcodes | ccodes) else 0.5
    bn = {matched_codes.get(x, "?" + x) for x in _neighbors(bl, b)}
    cn = _neighbors(cu, c)
    neigh = len(bn & cn) / len(bn | cn) if (bn | cn) else 0.5
    if b.is_milestone != c.is_milestone:
        return 0.0
    return W_NAME * name + W_WBS * wbs + W_NEIGH * neigh + W_DUR * dur + W_CODES * codes


def reconcile(bl: Schedule, cu: Schedule, match_overrides: dict | None = None) -> Reconciliation:
    overrides = match_overrides or {}
    matches: list[ActivityMatch] = []
    b_by_code = {a.code: a for a in bl.activities.values()}
    c_by_code = {a.code: a for a in cu.activities.values()}
    used_b: set[str] = set()
    used_c: set[str] = set()

    def matched(b: Activity, c: Activity, status: str, conf: float, method: str) -> None:
        ch, dates = compare_structure(bl, cu, b, c)
        st = status
        if status == UNCHANGED and ch:
            st = MODIFIED
        matches.append(ActivityMatch(b.task_id, c.task_id, st, conf, method, ch, dates))
        used_b.add(b.task_id)
        used_c.add(c.task_id)

    # 0) user decisions
    for ccode, bcode in overrides.items():
        c = c_by_code.get(ccode)
        if c is None or c.task_id in used_c:
            continue
        if bcode:
            b = b_by_code.get(bcode)
            if b is not None and b.task_id not in used_b:
                matched(b, c, USER, 1.0, "User decision")
        else:
            matches.append(ActivityMatch(None, c.task_id, ADDED, 1.0, "User decision: no baseline match"))
            used_c.add(c.task_id)

    # 1) Activity ID
    for code, c in c_by_code.items():
        if c.task_id in used_c:
            continue
        b = b_by_code.get(code)
        if b is not None and b.task_id not in used_b:
            matched(b, c, UNCHANGED, 1.0, "Activity ID")

    matched_codes = {}
    for m in matches:
        if m.baseline_id and m.current_id:
            matched_codes[bl.activities[m.baseline_id].code] = cu.activities[m.current_id].code

    rem_b = [a for a in bl.activities.values() if a.task_id not in used_b]
    rem_c = [a for a in cu.activities.values() if a.task_id not in used_c]

    # 2) Split detection (before 1:1 similarity so parts are not mis-paired)
    split_b: set[str] = set()
    for b in rem_b:
        nb = normalize(b.name)
        if len(nb) < 4:
            continue
        parts = [c for c in rem_c if c.task_id not in used_c and nb in normalize(c.name)
                 and bl.wbs_path_text(b.wbs_id) == cu.wbs_path_text(c.wbs_id) and normalize(c.name) != nb]
        if len(parts) >= 2:
            group = [c.task_id for c in parts]
            matches.append(ActivityMatch(b.task_id, None, SPLIT, 0.8, "Name containment + same WBS",
                                         [f"Split into {', '.join(c.code for c in parts)}"], split_group=group))
            for c in parts:
                matches.append(ActivityMatch(b.task_id, c.task_id, SPLIT, 0.8, f"Part of split baseline {b.code}",
                                             [f"Split from {b.code}"], split_group=group))
                used_c.add(c.task_id)
            used_b.add(b.task_id)
            split_b.add(b.task_id)
    rem_b = [a for a in rem_b if a.task_id not in used_b]
    rem_c = [a for a in rem_c if a.task_id not in used_c]

    # 3) Similarity (blocked by shared name tokens to stay fast on large schedules)
    index: dict[str, list[Activity]] = {}
    for b in rem_b:
        for t in set(normalize(b.name).split()):
            if len(t) > 2 and not t.isdigit():
                index.setdefault(t, []).append(b)
    cand_c: dict[str, list[tuple[str, float]]] = {}
    for c in rem_c:
        pool: dict[str, Activity] = {}
        for t in set(normalize(c.name).split()):
            for b in index.get(t, ())[:500]:
                pool[b.task_id] = b
        scored = sorted(((b.task_id, _similarity(bl, cu, b, c, matched_codes)) for b in pool.values()),
                        key=lambda x: -x[1])
        cand_c[c.task_id] = [x for x in scored if x[1] >= CANDIDATE][:5]
    # best-first greedy assignment with ambiguity check
    pairs = sorted(((sc, cid, bid) for cid, lst in cand_c.items() for bid, sc in lst), reverse=True)
    b_cands: dict[str, list[float]] = {}
    for sc, cid, bid in pairs:
        b_cands.setdefault(bid, []).append(sc)
    for sc, cid, bid in pairs:
        if cid in used_c or bid in used_b or sc < AUTO_ACCEPT:
            continue
        others_c = [s for b2, s in cand_c[cid] if b2 != bid]
        others_b = [s for s in b_cands[bid] if s != sc]
        second = max(others_c + others_b, default=0.0)
        b, c = bl.activities[bid], cu.activities[cid]
        if sc - second < MARGIN or token_set_similarity(b.name, c.name) < 0.6:
            continue
        ch, dates = compare_structure(bl, cu, b, c)
        matches.append(ActivityMatch(bid, cid, RENAMED, round(sc, 3), "Secondary similarity match",
                                     [f"Activity ID: {b.code} -> {c.code}"] + ch, dates))
        used_b.add(bid)
        used_c.add(cid)

    # 4) Leftovers
    for c in rem_c:
        if c.task_id in used_c:
            continue
        cands = [(b, s) for b, s in cand_c.get(c.task_id, []) if b not in used_b]
        if cands:
            matches.append(ActivityMatch(None, c.task_id, UNMATCHED, round(cands[0][1], 3),
                                         "Ambiguous - review required", candidates=cands))
        else:
            matches.append(ActivityMatch(None, c.task_id, ADDED, 1.0, "No baseline counterpart"))
    rev: dict[str, list[tuple[str, float]]] = {}
    for m in matches:
        if m.status == UNMATCHED and m.current_id:
            for b, s in m.candidates:
                rev.setdefault(b, []).append((m.current_id, s))
    for b in rem_b:
        if b.task_id in used_b:
            continue
        if b.task_id in rev:
            cands = sorted(rev[b.task_id], key=lambda x: -x[1])
            matches.append(ActivityMatch(b.task_id, None, UNMATCHED, round(cands[0][1], 3),
                                         "Ambiguous - review required", candidates=cands))
        else:
            matches.append(ActivityMatch(b.task_id, None, DELETED, 1.0, "Not found in current schedule"))

    by_c = {}
    by_b = {}
    for m in matches:
        if m.current_id and (m.current_id not in by_c):
            by_c[m.current_id] = m
        if m.baseline_id and (m.baseline_id not in by_b or m.current_id is None):
            by_b[m.baseline_id] = m
    return Reconciliation(matches, by_c, by_b)

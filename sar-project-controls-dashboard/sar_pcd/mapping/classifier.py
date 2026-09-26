"""Semantic Schedule Mapping Engine.

Classifies every activity into a project phase category (Engineering,
Procurement, Construction, T&C, Handover, or any user-defined category) by
combining several independent signals, each with a configurable weight:

    manual override > activity code value override > WBS override
    activity name keywords                 (weight 'name')
    WBS hierarchy, nearest node strongest  (weight 'wbs', decaying upwards)
    activity codes (Phase-type codes stronger)
    Activity ID prefix (e.g. "ENG-1000")
    text UDFs whose label looks like a phase/discipline
    logical neighbours (predecessors/successors) for weakly evidenced activities

Every result carries a confidence score and the evidence used, so nothing is
silently guessed.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from ..core.model import Activity, Schedule
from .profile import MappingProfile
from .text import normalize, ratio, stem

HIGH, MEDIUM, LOW, OVERRIDE, NONE = "High", "Medium", "Low", "Override", "Not Mapped"


@dataclass
class Classification:
    category: str | None
    confidence: float
    level: str
    scores: dict = field(default_factory=dict)      # category -> share 0..1
    evidence: list = field(default_factory=list)
    source: str = "auto"                             # auto / override / none

    @property
    def needs_review(self) -> bool:
        return self.level in (LOW, NONE)


class KeywordMatcher:
    def __init__(self, profile: MappingProfile):
        sw = profile.signal_weights
        self.fuzzy_min = float(sw.get("fuzzy_min_ratio", 0.88))
        self.synonyms = {normalize(k): normalize(v) for k, v in profile.synonyms.items() if normalize(k)}
        self.entries: list[tuple[str, tuple[str, ...], float, bool, frozenset, str]] = []
        for cat in profile.categories:
            for kw in cat.keywords:
                toks = tuple(stem(t) for t in normalize(kw.term).split())
                if not toks:
                    continue
                sup = frozenset(stem(t) for s in kw.suppress_if for t in normalize(s).split())
                self.entries.append((cat.name, toks, float(kw.weight), bool(kw.exact_only), sup, kw.term))
        self._cache: dict[str, tuple[dict, list]] = {}

    def expand(self, text: str) -> tuple[str, ...]:
        out: list[str] = []
        for t in normalize(text).split():
            if t.isdigit():
                continue
            rep = self.synonyms.get(t)
            if rep:
                out.extend(stem(x) for x in rep.split())
            else:
                out.append(stem(t))
        return tuple(out)

    def score(self, text: str) -> tuple[dict[str, float], list[str]]:
        if text in self._cache:
            return self._cache[text]
        toks = self.expand(text)
        tokset = set(toks)
        scores: dict[str, float] = {}
        ev: list[str] = []
        if toks:
            for cat, kt, w, exact, sup, term in self.entries:
                if sup and sup & tokset:
                    continue
                hit = False
                if len(kt) == 1:
                    k = kt[0]
                    if k in tokset:
                        hit = True
                    elif not exact and len(k) >= 6:
                        for t in tokset:
                            if len(t) >= 6 and abs(len(t) - len(k)) <= 2 and ratio(t, k) >= self.fuzzy_min:
                                hit = True
                                break
                else:
                    n = len(kt)
                    for i in range(len(toks) - n + 1):
                        if toks[i:i + n] == kt:
                            hit = True
                            break
                if hit:
                    scores[cat] = scores.get(cat, 0.0) + w
                    ev.append(f"'{term}'->{cat}")
        self._cache[text] = (scores, ev)
        return scores, ev


def _contribute(total: dict[str, float], raw: dict[str, float], weight: float) -> float:
    s = sum(raw.values())
    if s <= 0:
        return 0.0
    strength = min(1.0, s)
    for k, v in raw.items():
        total[k] = total.get(k, 0.0) + weight * strength * v / s
    return weight * strength


def resolve_dimensions(schedule: Schedule, profile: MappingProfile) -> dict[str, str]:
    """Map activity code types to dimensions (Phase, Discipline, Location, ...)."""
    out: dict[str, str] = {}
    dim_terms = {dim: [tuple(normalize(t).split()) for t in terms] for dim, terms in profile.dimensions.items()}
    for tid, ct in schedule.code_types.items():
        if ct.name in profile.code_type_dimensions:
            dim = profile.code_type_dimensions[ct.name]
            if dim:
                out[tid] = dim
            continue
        toks = tuple(normalize(ct.name).split())
        best = None
        for dim, terms in dim_terms.items():
            for t in terms:
                n = len(t)
                if any(toks[i:i + n] == t for i in range(len(toks) - n + 1)):
                    best = best or dim
        if best:
            out[tid] = best
    return out


def resolve_udf_dimensions(schedule: Schedule, profile: MappingProfile) -> dict[str, str]:
    out = {}
    for u in schedule.udf_types.values():
        if u.datatype not in ("FT_TEXT", "FT_STATICTYPE"):
            continue
        toks = set(normalize(u.label).split())
        for dim, terms in profile.dimensions.items():
            if any(set(normalize(t).split()) <= toks for t in terms):
                out[u.label] = dim
                break
    return out


class SemanticClassifier:
    def __init__(self, profile: MappingProfile):
        self.p = profile
        self.m = KeywordMatcher(profile)
        self.sw = profile.signal_weights

    def level(self, conf: float) -> str:
        if conf >= self.p.high_threshold:
            return HIGH
        if conf >= self.p.medium_threshold:
            return MEDIUM
        return LOW

    # ------------------------------------------------------------------
    def classify_schedule(self, s: Schedule) -> dict[str, Classification]:
        p = self.p
        dims = resolve_dimensions(s, p)
        udf_dims = resolve_udf_dimensions(s, p)
        cat_names = set(p.category_names)
        wbs_cache: dict[str, tuple[dict, list]] = {}

        def wbs_raw(wid: str) -> tuple[dict, list]:
            if wid not in wbs_cache:
                w = s.wbs.get(wid)
                wbs_cache[wid] = self.m.score(f"{w.code} {w.name}" if w else "")
            return wbs_cache[wid]

        results: dict[str, Classification] = {}
        pending: dict[str, tuple[dict, list, float]] = {}
        sat = float(self.sw.get("evidence_saturation", 3.0))

        for tid, a in s.activities.items():
            ov = self._override(s, a, dims, cat_names)
            if ov is not None:
                results[tid] = ov
                continue
            total: dict[str, float] = {}
            ev: list[str] = []
            raw, e = self.m.score(a.name)
            if _contribute(total, raw, self.sw["name"]):
                ev.append("Name: " + ", ".join(e))
            path = s.wbs_path(a.wbs_id)
            wt = float(self.sw["wbs"])
            for node in reversed(path):
                raw, e = wbs_raw(node.id)
                if _contribute(total, raw, wt):
                    ev.append(f"WBS '{node.name}': " + ", ".join(e))
                wt *= float(self.sw["wbs_decay"])
            for type_id, val_id in a.codes.items():
                dim = dims.get(type_id)
                if dim not in (None, "Phase", "Discipline"):
                    continue
                cv = s.code_values.get(val_id)
                if cv is None:
                    continue
                raw, e = self.m.score(f"{cv.value} {cv.description}")
                w = self.sw["code_phase"] if dim == "Phase" else self.sw["code"]
                if _contribute(total, raw, w):
                    ev.append(f"Code {s.code_types[type_id].name}={cv.value}: " + ", ".join(e))
            prefix = a.code.split("-")[0].split(".")[0].split("_")[0]
            if prefix and prefix != a.code:
                raw, e = self.m.score(prefix)
                if _contribute(total, raw, self.sw["id_prefix"]):
                    ev.append(f"ID prefix '{prefix}': " + ", ".join(e))
            for label, val in a.udfs.items():
                if udf_dims.get(label) in ("Phase", "Discipline") and isinstance(val, str):
                    raw, e = self.m.score(val)
                    if _contribute(total, raw, self.sw["udf"]):
                        ev.append(f"UDF {label}={val}: " + ", ".join(e))
            pending[tid] = (total, ev, sum(total.values()))

        # neighbour context for weakly evidenced activities
        first = {tid: (max(t, key=t.get) if t else None) for tid, (t, _e, _s) in pending.items()}
        for tid, cl in results.items():
            first[tid] = cl.category
        for tid, (total, ev, strength) in pending.items():
            if strength < sat:
                neigh: dict[str, float] = {}
                for r in s.preds(tid):
                    c = first.get(r.pred_id)
                    if c:
                        neigh[c] = neigh.get(c, 0.0) + 1
                for r in s.succs(tid):
                    c = first.get(r.succ_id)
                    if c:
                        neigh[c] = neigh.get(c, 0.0) + 1
                if neigh:
                    n = sum(neigh.values())
                    raw = {k: v / n for k, v in neigh.items()}
                    if _contribute(total, raw, self.sw["neighbor"]):
                        ev.append("Logic neighbours: " + ", ".join(f"{k} {v:.0%}" for k, v in raw.items()))
            results[tid] = self._finish(total, ev, sat)
        return results

    def _finish(self, total: dict, ev: list, sat: float) -> Classification:
        e = sum(total.values())
        if e <= 0:
            return Classification(None, 0.0, NONE, {}, ["No keyword, WBS, code or logic evidence found"], "none")
        shares = {k: v / e for k, v in sorted(total.items(), key=lambda kv: -kv[1])}
        top = next(iter(shares))
        conf = shares[top] * min(1.0, e / sat)
        return Classification(top, round(conf, 4), self.level(conf), shares, ev, "auto")

    def _override(self, s: Schedule, a: Activity, dims: dict, cat_names: set) -> Classification | None:
        p = self.p
        if a.code in p.activity_overrides:
            cat = p.activity_overrides[a.code] or None
            return Classification(cat, 1.0, OVERRIDE if cat else NONE, {cat: 1.0} if cat else {},
                                  [f"Manual activity override ({a.code})"], "override")
        for type_id, val_id in a.codes.items():
            ct = s.code_types.get(type_id)
            cv = s.code_values.get(val_id)
            if ct and cv:
                key = f"{ct.name}:{cv.value}"
                if key in p.code_value_overrides:
                    cat = p.code_value_overrides[key] or None
                    return Classification(cat, 1.0, OVERRIDE if cat else NONE, {cat: 1.0} if cat else {},
                                          [f"Activity code mapping {key}"], "override")
        path = s.wbs_path(a.wbs_id)
        for i in range(len(path), 0, -1):
            key = ".".join(w.code for w in path[:i])
            if key in p.wbs_overrides:
                cat = p.wbs_overrides[key] or None
                return Classification(cat, 1.0, OVERRIDE if cat else NONE, {cat: 1.0} if cat else {},
                                      [f"WBS mapping {key} ({path[i - 1].name})"], "override")
        return None

    # ------------------------------------------------------------------
    def classify_wbs(self, s: Schedule) -> dict[str, Classification]:
        """Classification of WBS nodes themselves (for the WBS mapping grid)."""
        out = {}
        sat = float(self.sw.get("evidence_saturation", 3.0))
        for wid in s.wbs:
            path = s.wbs_path(wid)
            if not path:
                continue
            key = ".".join(w.code for w in path)
            if key in self.p.wbs_overrides:
                cat = self.p.wbs_overrides[key] or None
                out[wid] = Classification(cat, 1.0, OVERRIDE if cat else NONE, {}, ["Manual WBS mapping"], "override")
                continue
            total: dict[str, float] = {}
            ev = []
            wt = float(self.sw["wbs"])
            for node in reversed(path):
                raw, e = self.m.score(f"{node.code} {node.name}")
                if _contribute(total, raw, wt):
                    ev.append(f"'{node.name}': " + ", ".join(e))
                wt *= float(self.sw["wbs_decay"])
            out[wid] = self._finish(total, ev, sat)
        return out

    def stage(self, category: str, name: str) -> str | None:
        """Detect a procurement / engineering stage from the activity name."""
        stages = self.p.stages.get(category)
        if not stages:
            return None
        toks = self.m.expand(name)
        for stage_name, terms in stages:
            for t in terms:
                kt = tuple(stem(x) for x in normalize(t).split())
                n = len(kt)
                if n and any(toks[i:i + n] == kt for i in range(len(toks) - n + 1)):
                    return stage_name
        return None

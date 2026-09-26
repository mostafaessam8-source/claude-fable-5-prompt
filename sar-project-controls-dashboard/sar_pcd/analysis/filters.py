"""Dashboard filters and global search."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from ..mapping.text import normalize
from .context import ActRow, ProjectContext


@dataclass
class FilterState:
    phase: str = ""
    discipline: str = ""
    wbs_id: str = ""
    work_package: str = ""
    code: str = ""            # "Type: Value"
    contractor: str = ""
    location: str = ""
    period_start: date | None = None
    period_end: date | None = None
    search: str = ""

    @property
    def active(self) -> bool:
        return any([self.phase, self.discipline, self.wbs_id, self.work_package, self.code, self.contractor,
                    self.location, self.period_start, self.search])

    def describe(self) -> str:
        parts = []
        for label, v in (("Phase", self.phase), ("Discipline", self.discipline), ("Work Package", self.work_package),
                         ("Code", self.code), ("Contractor", self.contractor), ("Location", self.location),
                         ("Search", self.search)):
            if v:
                parts.append(f"{label} = {v}")
        if self.wbs_id:
            parts.append("WBS filter")
        if self.period_start:
            parts.append(f"Period {self.period_start:%d %b %Y} - {self.period_end:%d %b %Y}")
        return "; ".join(parts) or "All activities"


def matches_search(ctx: ProjectContext, r: ActRow, text: str) -> bool:
    t = normalize(text)
    if not t:
        return True
    hay = [r.code, r.name, r.wbs_path, r.wbs_code, r.phase or ""] + list(r.dims.values())
    if r.cur is not None:
        for tid, vid in r.cur.codes.items():
            cv = ctx.cur.code_values.get(vid)
            if cv:
                hay += [cv.value, cv.description]
    blob = normalize(" ".join(hay))
    return all(part in blob for part in t.split())


def apply(ctx: ProjectContext, f: FilterState) -> list[ActRow]:
    out = []
    for r in ctx.rows:
        if f.phase and (r.phase or "Not Mapped") != f.phase:
            continue
        if f.discipline and r.dims.get("Discipline") != f.discipline:
            continue
        if f.work_package and r.dims.get("Work Package") != f.work_package:
            continue
        if f.contractor and r.dims.get("Contractor") != f.contractor:
            continue
        if f.location and r.dims.get("Location") != f.location:
            continue
        if f.wbs_id and f.wbs_id not in r.wbs_ids:
            continue
        if f.code:
            if r.cur is None:
                continue
            labels = set()
            for tid, vid in r.cur.codes.items():
                ct, cv = ctx.cur.code_types.get(tid), ctx.cur.code_values.get(vid)
                if ct and cv:
                    labels.add(f"{ct.name}: {cv.value}")
            if f.code not in labels:
                continue
        if f.period_start and f.period_end:
            s = r.start or r.bl_start
            e = r.finish or r.bl_finish
            if s is None or e is None or s.date() > f.period_end or e.date() < f.period_start:
                continue
        if f.search and not matches_search(ctx, r, f.search):
            continue
        out.append(r)
    return out

"""Import / analysis pipeline (UI-independent, reports progress via callback).

Wizard steps: select baseline -> select current -> select projects ->
validate files -> match activities -> classify -> mapping review ->
data quality -> dashboard.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from ..analysis.context import ProjectContext
from ..analysis.settings import AnalysisSettings
from ..analysis import matching as M
from ..core.loader import ProjectSummary, list_projects, load_schedule
from ..core.model import Schedule
from ..core.xer_parser import XerFile, parse_xer
from ..mapping.classifier import SemanticClassifier
from ..mapping.profile import MappingProfile

ProgressCB = Callable[[int, str], None]


@dataclass
class LoadedXer:
    name: str
    raw: bytes
    xer: XerFile
    projects: list[ProjectSummary]


def read_xer(path: str | Path) -> LoadedXer:
    p = Path(path)
    raw = p.read_bytes()
    xer = parse_xer(raw, p.name)
    return LoadedXer(p.name, raw, xer, list_projects(xer))


def build_context(baseline: Schedule, current: Schedule, profile: MappingProfile, settings: AnalysisSettings,
                  progress: ProgressCB | None = None) -> ProjectContext:
    cb = progress or (lambda pct, msg: None)
    cb(55, "Matching baseline and current activities…")
    recon = M.reconcile(baseline, current, profile.match_overrides)
    cb(70, "Classifying WBS / activities (semantic mapping)…")
    clf = SemanticClassifier(profile)
    cls_cur = clf.classify_schedule(current)
    cls_bl = clf.classify_schedule(baseline)
    cb(85, "Calculating KPIs…")
    ctx = ProjectContext(baseline, current, profile, settings, recon, cls_cur, cls_bl)
    cb(100, "Done")
    return ctx


def run_import(baseline: LoadedXer, current: LoadedXer, bl_project: str | None, cur_project: str | None,
               profile: MappingProfile, settings: AnalysisSettings,
               progress: ProgressCB | None = None) -> tuple[Schedule, Schedule, ProjectContext]:
    cb = progress or (lambda pct, msg: None)
    cb(10, f"Normalizing baseline schedule {baseline.name}…")
    bl = load_schedule(baseline.xer, bl_project)
    cb(30, f"Normalizing current schedule {current.name}…")
    cu = load_schedule(current.xer, cur_project)
    cb(45, "Validating files…")
    ctx = build_context(bl, cu, profile, settings, progress)
    return bl, cu, ctx

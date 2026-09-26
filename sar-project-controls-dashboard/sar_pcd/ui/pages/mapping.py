"""Mapping Review (activities, WBS, activity codes) and Activity Reconciliation."""
from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtGui import QColor
from PySide6.QtWidgets import (QAbstractItemView, QComboBox, QHBoxLayout, QLabel, QPushButton, QTableWidget,
                               QTableWidgetItem, QTabWidget, QTreeWidget, QTreeWidgetItem, QVBoxLayout, QWidget)

from ...analysis import matching as M
from ...analysis.context import DIMENSIONS
from ...mapping.classifier import resolve_dimensions
from ...reporting import style as S
from ..widgets.common import page_title
from ..widgets.table import ActivityTable
from .base import Page
from .domains import fill_table

NOT_MAPPED = "(Not Mapped)"


class MappingPage(Page):
    title = "Mapping Review"

    def __init__(self, app):
        super().__init__(app)
        self.layout_.addWidget(page_title(
            "Mapping Review",
            "Automatic classifications with confidence scores. Low-confidence and unmapped items are listed first. "
            "Overrides are stored in the project's Mapping Profile, logged in the Audit Trail and reused on future updates."))
        self.tabs = QTabWidget()
        self.layout_.addWidget(self.tabs, 1)
        # ---- activities
        w = QWidget()
        v = QVBoxLayout(w)
        bar = QHBoxLayout()
        bar.addWidget(QLabel("Show:"))
        self.show_sel = QComboBox()
        self.show_sel.addItems(["Needs review (Low / Not Mapped)", "Medium confidence", "Overrides", "All"])
        self.show_sel.currentIndexChanged.connect(lambda _: self._fill_acts())
        bar.addWidget(self.show_sel)
        bar.addStretch(1)
        bar.addWidget(QLabel("Assign selected to:"))
        self.cat_combo = QComboBox()
        bar.addWidget(self.cat_combo)
        b = QPushButton("Apply Override")
        b.setObjectName("Primary")
        b.clicked.connect(self._assign_acts)
        bar.addWidget(b)
        b2 = QPushButton("Clear Override")
        b2.clicked.connect(self._clear_acts)
        bar.addWidget(b2)
        v.addLayout(bar)
        self.summary = QLabel()
        self.summary.setObjectName("Hint")
        v.addWidget(self.summary)
        self.acts = ActivityTable(["code", "name", "wbs", "phase", "conf", "level", "discipline", "status"], export_name="mapping_review")
        self.acts.view.setSelectionMode(QAbstractItemView.ExtendedSelection)
        self.acts.activated.connect(app.show_activity)
        v.addWidget(self.acts, 1)
        self.tabs.addTab(w, "Activity Mapping")
        # ---- WBS
        w = QWidget()
        v = QVBoxLayout(w)
        bar = QHBoxLayout()
        bar.addWidget(QLabel("Map selected WBS element (and everything below it) to:"))
        self.wbs_combo = QComboBox()
        bar.addWidget(self.wbs_combo)
        b = QPushButton("Map WBS")
        b.setObjectName("Primary")
        b.clicked.connect(self._assign_wbs)
        bar.addWidget(b)
        b2 = QPushButton("Clear WBS Mapping")
        b2.clicked.connect(self._clear_wbs)
        bar.addWidget(b2)
        bar.addStretch(1)
        v.addLayout(bar)
        self.wbs_tree = QTreeWidget()
        self.wbs_tree.setHeaderLabels(["WBS", "Name", "Code path", "Classification", "Confidence", "Source", "Activities"])
        v.addWidget(self.wbs_tree, 1)
        self.tabs.addTab(w, "WBS Mapping")
        # ---- codes
        w = QWidget()
        v = QVBoxLayout(w)
        v.addWidget(QLabel("<b>Activity code types</b> - detected dimension (Discipline, Location, Contractor, Work Package, Phase) drives the filters."))
        self.types = QTableWidget()
        self.types.setMaximumHeight(200)
        v.addWidget(self.types)
        bar = QHBoxLayout()
        bar.addWidget(QLabel("Set dimension of selected code type:"))
        self.dim_combo = QComboBox()
        self.dim_combo.addItems(list(DIMENSIONS) + ["(Ignore)"])
        bar.addWidget(self.dim_combo)
        b = QPushButton("Apply")
        b.clicked.connect(self._assign_dim)
        bar.addWidget(b)
        bar.addStretch(1)
        v.addLayout(bar)
        v.addWidget(QLabel("<b>Code values</b> - map a code value to a category (applies to every activity carrying it)."))
        self.values = QTableWidget()
        v.addWidget(self.values, 1)
        bar = QHBoxLayout()
        bar.addWidget(QLabel("Map selected code value to:"))
        self.val_combo = QComboBox()
        bar.addWidget(self.val_combo)
        b = QPushButton("Map Code Value")
        b.clicked.connect(self._assign_val)
        bar.addWidget(b)
        b2 = QPushButton("Clear")
        b2.clicked.connect(self._clear_val)
        bar.addWidget(b2)
        bar.addStretch(1)
        v.addLayout(bar)
        self.tabs.addTab(w, "Activity Code Mapping")
        # ---- reconciliation
        w = QWidget()
        v = QVBoxLayout(w)
        v.addWidget(QLabel("Secondary matches, splits and ambiguous activities. Uncertain matches are never forced - decide here."))
        self.rec = QTableWidget()
        self.rec.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.rec.itemSelectionChanged.connect(self._rec_selected)
        v.addWidget(self.rec, 1)
        bar = QHBoxLayout()
        bar.addWidget(QLabel("Match current activity to baseline:"))
        self.cand = QComboBox()
        self.cand.setMinimumWidth(380)
        bar.addWidget(self.cand)
        b = QPushButton("Accept Match")
        b.setObjectName("Primary")
        b.clicked.connect(self._accept_match)
        bar.addWidget(b)
        b2 = QPushButton("Mark as New (no baseline)")
        b2.clicked.connect(self._mark_new)
        bar.addWidget(b2)
        b3 = QPushButton("Clear Decision")
        b3.clicked.connect(self._clear_match)
        bar.addWidget(b3)
        bar.addStretch(1)
        v.addLayout(bar)
        self.tabs.addTab(w, "Activity Reconciliation")

    # ------------------------------------------------------------ refresh
    def refresh(self):
        ctx = self.app.dash.ctx
        cats = ctx.profile.category_names + [NOT_MAPPED]
        for c in (self.cat_combo, self.wbs_combo, self.val_combo):
            cur = c.currentText()
            c.clear()
            c.addItems(cats)
            if cur:
                c.setCurrentText(cur)
        self._fill_acts()
        self._fill_wbs()
        self._fill_codes()
        self._fill_rec()

    def _fill_acts(self):
        ctx = self.app.dash.ctx
        rows = [r for r in ctx.rows if r.cur is not None]
        sel = self.show_sel.currentIndex()
        if sel == 0:
            shown = [r for r in rows if r.phase_level in ("Low", "Not Mapped")]
        elif sel == 1:
            shown = [r for r in rows if r.phase_level == "Medium"]
        elif sel == 2:
            shown = [r for r in rows if r.phase_level == "Override"]
        else:
            shown = rows
        counts = {}
        for r in rows:
            counts[r.phase_level] = counts.get(r.phase_level, 0) + 1
        th = ctx.profile
        self.summary.setText(f"Thresholds: High ≥ {th.high_threshold:.0%}, Medium ≥ {th.medium_threshold:.0%}, Low below. "
                             + " · ".join(f"{k}: {v}" for k, v in sorted(counts.items())))
        self.acts.set_rows(sorted(shown, key=lambda r: r.phase_conf), ctx.data_date)

    def _selected_rows(self):
        idxs = self.acts.view.selectionModel().selectedRows()
        return [self.acts.model.rows[self.acts.proxy.mapToSource(i).row()] for i in idxs]

    def _assign_acts(self):
        rows = self._selected_rows()
        if not rows:
            return
        cat = self.cat_combo.currentText()
        p = self.app.dash.ctx.profile.copy()
        for r in rows:
            p.activity_overrides[r.code] = "" if cat == NOT_MAPPED else cat
        self.app.apply_profile(p, f"Activity override -> {cat}: " + ", ".join(r.code for r in rows[:20]))

    def _clear_acts(self):
        rows = self._selected_rows()
        p = self.app.dash.ctx.profile.copy()
        for r in rows:
            p.activity_overrides.pop(r.code, None)
        self.app.apply_profile(p, "Cleared activity overrides: " + ", ".join(r.code for r in rows[:20]))

    def _fill_wbs(self):
        ctx = self.app.dash.ctx
        s = ctx.cur
        cls = ctx.classifier.classify_wbs(s)
        counts = {}
        for a in s.activities.values():
            for w in s.wbs_path(a.wbs_id):
                counts[w.id] = counts.get(w.id, 0) + 1
        self.wbs_tree.clear()
        items = {}
        for wid, w in sorted(s.wbs.items(), key=lambda kv: (len(s.wbs_path(kv[0])), kv[1].seq)):
            if w.is_project_node:
                continue
            c = cls.get(wid)
            path = s.wbs_code_path(wid)
            it = QTreeWidgetItem([w.code, w.name, path, (c.category or "Not Mapped") if c else "",
                                  f"{c.confidence:.0%}" if c else "", c.level if c else "", str(counts.get(wid, 0))])
            it.setData(0, Qt.UserRole, path)
            if c and c.level in ("Low", "Not Mapped"):
                it.setForeground(3, QColor(S.CRITICAL))
            parent = items.get(w.parent_id)
            (parent.addChild(it) if parent else self.wbs_tree.addTopLevelItem(it))
            items[wid] = it
        self.wbs_tree.expandToDepth(1)
        for i in range(7):
            self.wbs_tree.resizeColumnToContents(i)

    def _assign_wbs(self):
        it = self.wbs_tree.currentItem()
        if it is None:
            return
        cat = self.wbs_combo.currentText()
        p = self.app.dash.ctx.profile.copy()
        p.wbs_overrides[it.data(0, Qt.UserRole)] = "" if cat == NOT_MAPPED else cat
        self.app.apply_profile(p, f"WBS mapping {it.data(0, Qt.UserRole)} ({it.text(1)}) -> {cat}")

    def _clear_wbs(self):
        it = self.wbs_tree.currentItem()
        if it is None:
            return
        p = self.app.dash.ctx.profile.copy()
        p.wbs_overrides.pop(it.data(0, Qt.UserRole), None)
        self.app.apply_profile(p, f"Cleared WBS mapping {it.data(0, Qt.UserRole)}")

    def _fill_codes(self):
        ctx = self.app.dash.ctx
        s = ctx.cur
        dims = resolve_dimensions(s, ctx.profile)
        self._types = list(s.code_types.values())
        usage = {}
        for a in s.activities.values():
            for t, v in a.codes.items():
                usage[v] = usage.get(v, 0) + 1
        fill_table(self.types, ["Code Type", "Detected Dimension", "Source", "Values"],
                   [[t.name, dims.get(t.id, "(none)"), "Manual" if t.name in ctx.profile.code_type_dimensions else "Auto",
                     sum(1 for v in s.code_values.values() if v.type_id == t.id)] for t in self._types])
        self._vals = sorted(s.code_values.values(), key=lambda v: (s.code_types[v.type_id].name, v.value))
        rows = []
        for v in self._vals:
            key = f"{s.code_types[v.type_id].name}:{v.value}"
            ov = ctx.profile.code_value_overrides.get(key)
            raw, _ = ctx.classifier.m.score(f"{v.value} {v.description}")
            auto = max(raw, key=raw.get) if raw else ""
            rows.append([s.code_types[v.type_id].name, v.value, v.description, usage.get(v.id, 0), auto,
                         (ov or NOT_MAPPED) if ov is not None else ""])
        fill_table(self.values, ["Code Type", "Value", "Description", "Activities", "Keyword suggestion", "Manual mapping"], rows)

    def _assign_dim(self):
        r = self.types.currentRow()
        if r < 0:
            return
        t = self._types[r]
        dim = self.dim_combo.currentText()
        p = self.app.dash.ctx.profile.copy()
        p.code_type_dimensions[t.name] = "" if dim == "(Ignore)" else dim
        self.app.apply_profile(p, f"Code type '{t.name}' dimension -> {dim}")

    def _assign_val(self):
        r = self.values.currentRow()
        if r < 0:
            return
        s = self.app.dash.ctx.cur
        v = self._vals[r]
        key = f"{s.code_types[v.type_id].name}:{v.value}"
        cat = self.val_combo.currentText()
        p = self.app.dash.ctx.profile.copy()
        p.code_value_overrides[key] = "" if cat == NOT_MAPPED else cat
        self.app.apply_profile(p, f"Code value mapping {key} -> {cat}")

    def _clear_val(self):
        r = self.values.currentRow()
        if r < 0:
            return
        s = self.app.dash.ctx.cur
        v = self._vals[r]
        p = self.app.dash.ctx.profile.copy()
        p.code_value_overrides.pop(f"{s.code_types[v.type_id].name}:{v.value}", None)
        self.app.apply_profile(p, "Cleared code value mapping")

    # ------------------------------------------------------------ reconciliation
    def _fill_rec(self):
        ctx = self.app.dash.ctx
        self._rec = [m for m in ctx.recon.matches if m.status in (M.UNMATCHED, M.RENAMED, M.SPLIT, M.USER, M.ADDED, M.DELETED)]
        order = {M.UNMATCHED: 0, M.RENAMED: 1, M.SPLIT: 2, M.USER: 3, M.ADDED: 4, M.DELETED: 5}
        self._rec.sort(key=lambda m: order[m.status])
        rows, colors = [], {}
        for i, m in enumerate(self._rec):
            b = ctx.bl.activities.get(m.baseline_id) if m.baseline_id else None
            c = ctx.cur.activities.get(m.current_id) if m.current_id else None
            cands = ", ".join(f"{(ctx.bl if c else ctx.cur).activities[t].code} ({s:.0%})" for t, s in m.candidates[:3])
            rows.append([m.status, f"{m.confidence:.0%}", b.code if b else "", b.name if b else "", c.code if c else "",
                         c.name if c else "", m.method, cands, "; ".join(m.changes[:2])])
            if m.status == M.UNMATCHED:
                colors[(i, 0)] = S.CRITICAL
        fill_table(self.rec, ["Status", "Confidence", "Baseline ID", "Baseline Name", "Current ID", "Current Name",
                              "Method", "Candidates", "Changes"], rows, colors)

    def _rec_selected(self):
        ctx = self.app.dash.ctx
        self.cand.clear()
        r = self.rec.currentRow()
        if r < 0 or r >= len(self._rec):
            return
        m = self._rec[r]
        if m.current_id is None:
            return
        opts = []
        if m.baseline_id:
            opts.append(ctx.bl.activities[m.baseline_id])
        for t, _s in m.candidates:
            if t in ctx.bl.activities:
                opts.append(ctx.bl.activities[t])
        unmatched_bl = [ctx.bl.activities[x.baseline_id] for x in ctx.recon.matches
                        if x.current_id is None and x.baseline_id and x.status in (M.DELETED, M.UNMATCHED)]
        for b in opts + unmatched_bl:
            label = f"{b.code} - {b.name}"
            if self.cand.findText(label) < 0:
                self.cand.addItem(label, b.code)

    def _cur_code(self):
        r = self.rec.currentRow()
        if r < 0 or r >= len(self._rec) or self._rec[r].current_id is None:
            return None
        return self.app.dash.ctx.cur.activities[self._rec[r].current_id].code

    def _accept_match(self):
        code = self._cur_code()
        bl = self.cand.currentData()
        if not code or not bl:
            return
        p = self.app.dash.ctx.profile.copy()
        p.match_overrides[code] = bl
        self.app.apply_profile(p, f"Reconciliation: current {code} matched to baseline {bl}")

    def _mark_new(self):
        code = self._cur_code()
        if not code:
            return
        p = self.app.dash.ctx.profile.copy()
        p.match_overrides[code] = ""
        self.app.apply_profile(p, f"Reconciliation: current {code} marked as new (no baseline)")

    def _clear_match(self):
        code = self._cur_code()
        if not code:
            return
        p = self.app.dash.ctx.profile.copy()
        p.match_overrides.pop(code, None)
        self.app.apply_profile(p, f"Reconciliation decision cleared for {code}")

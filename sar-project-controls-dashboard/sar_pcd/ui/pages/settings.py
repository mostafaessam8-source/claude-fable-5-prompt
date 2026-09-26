"""Settings: analysis settings, thresholds and the keyword / synonym dictionary editor."""
from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (QCheckBox, QComboBox, QDoubleSpinBox, QFileDialog, QFormLayout, QGroupBox, QHBoxLayout,
                               QInputDialog, QLabel, QListWidget, QMessageBox, QPushButton, QSpinBox, QSplitter,
                               QTableWidget, QTableWidgetItem, QTabWidget, QVBoxLayout, QWidget)

from ...analysis.settings import CRITICAL_DEFS, MEASURE_LABELS, MEASURES, WEIGHTINGS, AnalysisSettings
from ...mapping.profile import Keyword, MappingProfile, default_profile
from ..widgets.common import page_title
from .base import Page


class SettingsPage(Page):
    title = "Settings"

    def __init__(self, app):
        super().__init__(app)
        top = QHBoxLayout()
        top.addWidget(page_title("Settings", "Changes are applied to this project, saved in the workspace and recorded in the Audit Trail."))
        top.addStretch(1)
        apply = QPushButton("Apply && Recalculate")
        apply.setObjectName("Primary")
        apply.clicked.connect(self._apply)
        top.addWidget(apply)
        self.layout_.addLayout(top)
        tabs = QTabWidget()
        self.layout_.addWidget(tabs, 1)
        # ------------------------------------------------ analysis
        w = QWidget()
        h = QHBoxLayout(w)
        g = QGroupBox("Progress && KPIs")
        f = QFormLayout(g)
        self.measure = QComboBox()
        for m in MEASURES:
            self.measure.addItem(MEASURE_LABELS[m], m)
        f.addRow("Progress measure", self.measure)
        self.weighting = QComboBox()
        self.weighting.addItems(WEIGHTINGS)
        f.addRow("Weighting", self.weighting)
        self.udf = QComboBox()
        f.addRow("Custom weight UDF", self.udf)
        self.coverage = _dspin(0.1, 1.0, 0.05)
        f.addRow("Auto weighting coverage", self.coverage)
        self.crit = QComboBox()
        self.crit.addItems(CRITICAL_DEFS)
        f.addRow("Critical definition", self.crit)
        self.crit_tf = _dspin(-100, 100, 1)
        f.addRow("Critical TF ≤ (days)", self.crit_tf)
        self.near = _dspin(0, 200, 1)
        f.addRow("Near-critical TF ≤ (days)", self.near)
        self.look = QSpinBox()
        self.look.setRange(1, 26)
        f.addRow("Default lookahead (weeks)", self.look)
        self.tol = _dspin(0, 60, 1)
        f.addRow("Delay tolerance (days)", self.tol)
        self.basis = QComboBox()
        self.basis.addItems(["Calendar Days", "Working Days"])
        f.addRow("Variance basis", self.basis)
        self.period = QComboBox()
        self.period.addItems(["Monthly", "Weekly"])
        f.addRow("S-Curve period", self.period)
        self.high = _dspin(0.5, 1.0, 0.01)
        f.addRow("Mapping: High confidence ≥", self.high)
        self.medium = _dspin(0.1, 0.99, 0.01)
        f.addRow("Mapping: Medium confidence ≥", self.medium)
        h.addWidget(g, 1)
        g2 = QGroupBox("Schedule health thresholds (DCMA-style)")
        v2 = QVBoxLayout(g2)
        self.health = QTableWidget()
        v2.addWidget(self.health)
        g3 = QGroupBox("Risk level bands (P × I upper bound)")
        f3 = QFormLayout(g3)
        self.bands = {}
        for k in ("Low", "Medium", "High", "Very High"):
            s = QSpinBox()
            s.setRange(1, 25)
            self.bands[k] = s
            f3.addRow(k, s)
        v2.addWidget(g3)
        h.addWidget(g2, 1)
        tabs.addTab(w, "Analysis")
        # ------------------------------------------------ dictionary
        w = QWidget()
        v = QVBoxLayout(w)
        bar = QHBoxLayout()
        for text, fn in (("Load Profile…", self._load_profile), ("Save Profile As…", self._save_profile),
                         ("Reset to Default Dictionary", self._reset_profile)):
            b = QPushButton(text)
            b.clicked.connect(fn)
            bar.addWidget(b)
        self.profile_name = QLabel()
        self.profile_name.setObjectName("Hint")
        bar.addWidget(self.profile_name)
        bar.addStretch(1)
        v.addLayout(bar)
        split = QSplitter()
        left = QWidget()
        lv = QVBoxLayout(left)
        lv.addWidget(QLabel("<b>Categories</b>"))
        self.cats = QListWidget()
        self.cats.currentRowChanged.connect(self._show_cat)
        lv.addWidget(self.cats, 1)
        hb = QHBoxLayout()
        b = QPushButton("Add Category")
        b.clicked.connect(self._add_cat)
        hb.addWidget(b)
        b = QPushButton("Remove")
        b.clicked.connect(self._del_cat)
        hb.addWidget(b)
        lv.addLayout(hb)
        split.addWidget(left)
        mid = QWidget()
        mv = QVBoxLayout(mid)
        mv.addWidget(QLabel("<b>Keywords</b> (term · weight · exact-only abbreviation · ignore when any of these words present)"))
        self.kw = QTableWidget()
        self.kw.setColumnCount(4)
        self.kw.setHorizontalHeaderLabels(["Keyword / phrase", "Weight", "Exact only", "Suppress if (comma separated)"])
        self.kw.itemChanged.connect(self._kw_changed)
        mv.addWidget(self.kw, 1)
        hb = QHBoxLayout()
        b = QPushButton("Add Keyword")
        b.clicked.connect(self._add_kw)
        hb.addWidget(b)
        b = QPushButton("Remove Selected")
        b.clicked.connect(self._del_kw)
        hb.addWidget(b)
        hb.addStretch(1)
        mv.addLayout(hb)
        split.addWidget(mid)
        right = QWidget()
        rv = QVBoxLayout(right)
        rv.addWidget(QLabel("<b>Synonyms / abbreviations</b> (token → expansion)"))
        self.syn = QTableWidget()
        self.syn.setColumnCount(2)
        self.syn.setHorizontalHeaderLabels(["Token", "Expands to"])
        rv.addWidget(self.syn, 1)
        hb = QHBoxLayout()
        b = QPushButton("Add Synonym")
        b.clicked.connect(lambda: self.syn.insertRow(self.syn.rowCount()))
        hb.addWidget(b)
        b = QPushButton("Remove Selected")
        b.clicked.connect(lambda: self.syn.removeRow(self.syn.currentRow()))
        hb.addWidget(b)
        rv.addLayout(hb)
        split.addWidget(right)
        split.setSizes([220, 560, 320])
        v.addWidget(split, 1)
        tabs.addTab(w, "Keyword Dictionary && Categories")
        self._profile: MappingProfile | None = None
        self._loading = False

    # ------------------------------------------------------------------
    def refresh(self):
        ctx = self.app.dash.ctx
        s = ctx.settings
        self._profile = ctx.profile.copy()
        self.measure.setCurrentIndex(max(0, MEASURES.index(s.progress_measure) if s.progress_measure in MEASURES else 0))
        self.weighting.setCurrentText(s.weighting)
        self.udf.clear()
        self.udf.addItem("")
        self.udf.addItems(sorted(u.label for u in ctx.cur.udf_types.values() if u.datatype not in ("FT_TEXT", "FT_STATICTYPE", "FT_START_DATE", "FT_END_DATE")))
        self.udf.setCurrentText(s.custom_weight_udf)
        self.coverage.setValue(s.weighting_coverage)
        self.crit.setCurrentText(s.critical_definition)
        self.crit_tf.setValue(s.critical_float_days)
        self.near.setValue(s.near_critical_days)
        self.look.setValue(s.lookahead_weeks)
        self.tol.setValue(s.delay_tolerance_days)
        self.basis.setCurrentText(s.variance_basis)
        self.period.setCurrentText(s.s_curve_period)
        self.high.setValue(self._profile.high_threshold)
        self.medium.setValue(self._profile.medium_threshold)
        self.health.setColumnCount(2)
        self.health.setHorizontalHeaderLabels(["Threshold", "Value"])
        self.health.setRowCount(len(s.health))
        for i, (k, v) in enumerate(s.health.items()):
            it = QTableWidgetItem(k)
            it.setFlags(it.flags() & ~Qt.ItemIsEditable)
            self.health.setItem(i, 0, it)
            self.health.setItem(i, 1, QTableWidgetItem(str(v)))
        self.health.resizeColumnsToContents()
        for k, sp in self.bands.items():
            sp.setValue(int(s.risk_bands.get(k, 25)))
        self._load_dictionary()

    def _load_dictionary(self):
        p = self._profile
        self.profile_name.setText(f"Profile: {p.name}")
        self.cats.clear()
        self.cats.addItems(p.category_names)
        self.cats.setCurrentRow(0)
        self.syn.setRowCount(len(p.synonyms))
        for i, (k, v) in enumerate(sorted(p.synonyms.items())):
            self.syn.setItem(i, 0, QTableWidgetItem(k))
            self.syn.setItem(i, 1, QTableWidgetItem(v))

    def _show_cat(self, row):
        if self._profile is None or row < 0 or row >= len(self._profile.categories):
            return
        self._loading = True
        cat = self._profile.categories[row]
        self.kw.setRowCount(len(cat.keywords))
        for i, k in enumerate(cat.keywords):
            self.kw.setItem(i, 0, QTableWidgetItem(k.term))
            self.kw.setItem(i, 1, QTableWidgetItem(f"{k.weight:g}"))
            self.kw.setItem(i, 2, QTableWidgetItem("Yes" if k.exact_only else "No"))
            self.kw.setItem(i, 3, QTableWidgetItem(", ".join(k.suppress_if)))
        self.kw.resizeColumnsToContents()
        self._loading = False

    def _kw_changed(self, _item):
        if self._loading:
            return
        row = self.cats.currentRow()
        if row < 0:
            return
        cat = self._profile.categories[row]
        kws = []
        for i in range(self.kw.rowCount()):
            t = self.kw.item(i, 0)
            if t is None or not t.text().strip():
                continue
            try:
                w = float(self.kw.item(i, 1).text()) if self.kw.item(i, 1) else 1.0
            except ValueError:
                w = 1.0
            ex = (self.kw.item(i, 2).text().strip().lower() in ("yes", "y", "true", "1")) if self.kw.item(i, 2) else False
            sup = [x.strip() for x in (self.kw.item(i, 3).text() if self.kw.item(i, 3) else "").split(",") if x.strip()]
            kws.append(Keyword(t.text().strip(), w, ex, sup))
        cat.keywords = kws

    def _add_kw(self):
        self._loading = True
        r = self.kw.rowCount()
        self.kw.insertRow(r)
        self.kw.setItem(r, 1, QTableWidgetItem("1"))
        self.kw.setItem(r, 2, QTableWidgetItem("No"))
        self._loading = False
        self.kw.scrollToBottom()

    def _del_kw(self):
        rows = sorted({i.row() for i in self.kw.selectedIndexes()}, reverse=True)
        for r in rows:
            self.kw.removeRow(r)
        self._kw_changed(None)

    def _add_cat(self):
        name, ok = QInputDialog.getText(self, "Add Category", "Category name:")
        if ok and name.strip():
            self._profile.add_category(name.strip())
            self._load_dictionary()
            self.cats.setCurrentRow(self.cats.count() - 1)

    def _del_cat(self):
        row = self.cats.currentRow()
        if row < 0:
            return
        name = self._profile.categories[row].name
        if QMessageBox.question(self, "Remove Category", f"Remove category '{name}' and its keywords?") == QMessageBox.Yes:
            del self._profile.categories[row]
            self._load_dictionary()

    def _load_profile(self):
        path, _ = QFileDialog.getOpenFileName(self, "Load Mapping Profile", "", "Mapping Profile (*.json)")
        if path:
            try:
                self._profile = MappingProfile.load(path)
            except Exception as e:  # noqa: BLE001
                QMessageBox.warning(self, "Load Mapping Profile", f"The file is not a valid mapping profile:\n{e}")
                return
            self._load_dictionary()

    def _save_profile(self):
        self._collect_syn()
        path, _ = QFileDialog.getSaveFileName(self, "Save Mapping Profile", f"{self._profile.name}.json", "Mapping Profile (*.json)")
        if path:
            self._profile.save(path)

    def _reset_profile(self):
        keep = self._profile
        p = default_profile()
        for attr in ("activity_overrides", "wbs_overrides", "code_value_overrides", "code_type_dimensions", "match_overrides"):
            setattr(p, attr, getattr(keep, attr))
        self._profile = p
        self._load_dictionary()

    def _collect_syn(self):
        syn = {}
        for i in range(self.syn.rowCount()):
            a, b = self.syn.item(i, 0), self.syn.item(i, 1)
            if a and b and a.text().strip() and b.text().strip():
                syn[a.text().strip()] = b.text().strip()
        self._profile.synonyms = syn

    def _apply(self):
        s = AnalysisSettings.from_dict(self.app.dash.ctx.settings.to_dict())
        s.progress_measure = self.measure.currentData()
        s.weighting = self.weighting.currentText()
        s.custom_weight_udf = self.udf.currentText()
        s.weighting_coverage = self.coverage.value()
        s.critical_definition = self.crit.currentText()
        s.critical_float_days = self.crit_tf.value()
        s.near_critical_days = self.near.value()
        s.lookahead_weeks = self.look.value()
        s.delay_tolerance_days = self.tol.value()
        s.variance_basis = self.basis.currentText()
        s.s_curve_period = self.period.currentText()
        for i in range(self.health.rowCount()):
            try:
                s.health[self.health.item(i, 0).text()] = float(self.health.item(i, 1).text())
            except (ValueError, AttributeError):
                pass
        s.risk_bands = {k: sp.value() for k, sp in self.bands.items()}
        self._collect_syn()
        self._profile.high_threshold = self.high.value()
        self._profile.medium_threshold = self.medium.value()
        self.app.apply_settings(s, self._profile)


def _dspin(lo, hi, step):
    s = QDoubleSpinBox()
    s.setRange(lo, hi)
    s.setSingleStep(step)
    s.setDecimals(2)
    return s

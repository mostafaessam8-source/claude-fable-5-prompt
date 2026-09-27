"""XER import wizard: project -> baseline -> current -> project selection ->
validate / match / classify / mapping review / data quality -> dashboard."""
from __future__ import annotations

from pathlib import Path

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (QComboBox, QFileDialog, QFormLayout, QHBoxLayout, QLabel, QLineEdit, QListWidget,
                               QListWidgetItem, QProgressBar, QPushButton, QTextBrowser, QVBoxLayout, QWizard,
                               QWizardPage)

from ..analysis.settings import AnalysisSettings
from ..mapping.profile import MappingProfile, default_profile
from ..services.pipeline import read_xer, run_import
from .worker import Worker

STEPS = ["Validate files", "Normalize schedules", "Match baseline and current activities",
         "Semantic WBS / activity classification", "Mapping review summary", "Data quality validation", "Generate dashboard"]


def _file_row(page, label, filt):
    edit = QLineEdit()
    edit.setReadOnly(True)
    btn = QPushButton("Browse…")

    def pick():
        path, _ = QFileDialog.getOpenFileName(page, label, "", filt)
        if path:
            edit.setText(path)
            page.completeChanged.emit()
    btn.clicked.connect(pick)
    h = QHBoxLayout()
    h.addWidget(edit, 1)
    h.addWidget(btn)
    return edit, h


class ProjectPage(QWizardPage):
    def __init__(self, wiz):
        super().__init__()
        self.wiz = wiz
        self._touched = False
        self.setTitle("STEP 4 - Save project workspace")
        self.setSubTitle("Name and location are pre-filled next to your Current XER - change them if you like. The workspace "
                         "(.sarpcd) stores both schedules, the mapping profile, overrides, settings and the audit trail.")
        f = QFormLayout(self)
        self.name = QLineEdit("New Project")
        f.addRow("Project name", self.name)
        self.path, row = _file_row(self, "", "")
        self.path.setReadOnly(False)
        btn = row.itemAt(1).widget()
        btn.clicked.disconnect()
        btn.clicked.connect(self._save_as)
        f.addRow("Save workspace as", row)
        self.profile, prow = _file_row(self, "Reuse Mapping Profile", "Mapping Profile (*.json)")
        f.addRow("Mapping profile (optional)", prow)
        hint = QLabel("Leave the mapping profile empty to use the SAR default keyword dictionary. "
                      "A profile saved from another project reuses its keywords and category mappings.")
        hint.setWordWrap(True)
        hint.setObjectName("Hint")
        f.addRow(hint)
        self.name.textChanged.connect(self.completeChanged)
        self.path.textChanged.connect(self.completeChanged)
        self.name.textEdited.connect(self._touch)
        self.path.textEdited.connect(self._touch)

    def _touch(self, *_):
        self._touched = True

    def initializePage(self):  # noqa: N802
        if self._touched:
            return
        cur = self.wiz.p_cu.loaded
        pid = self.wiz.p_sel.cu.currentData()
        proj = next((p for p in cur.projects if p.proj_id == pid), cur.projects[0] if cur.projects else None)
        name = (proj.name or proj.short_name) if proj else Path(self.wiz.p_cu.edit.text()).stem
        self.name.setText(name)
        safe = "".join(ch if ch.isalnum() or ch in " -_." else "_" for ch in (proj.short_name if proj else name)).strip() or "Project"
        self.path.setText(str(Path(self.wiz.p_cu.edit.text()).parent / f"{safe}.sarpcd"))

    def _save_as(self):
        start = self.path.text() or f"{self.name.text()}.sarpcd"
        path, _ = QFileDialog.getSaveFileName(self, "Save workspace", start, "SAR PCD Project (*.sarpcd)")
        if path:
            self._touched = True
            if not path.endswith(".sarpcd"):
                path += ".sarpcd"
            self.path.setText(path)

    def isComplete(self):  # noqa: N802
        return bool(self.name.text().strip() and self.path.text().strip())


class FilePage(QWizardPage):
    def __init__(self, step: int, title: str, sub: str):
        super().__init__()
        self.setTitle(f"STEP {step} - {title}")
        self.setSubTitle(sub)
        v = QVBoxLayout(self)
        self.edit, row = _file_row(self, title, "Primavera P6 XER (*.xer);;All files (*)")
        v.addLayout(row)
        self.info = QLabel()
        self.info.setWordWrap(True)
        v.addWidget(self.info)
        v.addStretch(1)
        self.loaded = None

    def isComplete(self):  # noqa: N802
        return bool(self.edit.text())

    def validatePage(self):  # noqa: N802
        from PySide6.QtWidgets import QApplication, QMessageBox
        QApplication.setOverrideCursor(Qt.WaitCursor)
        try:
            self.loaded = read_xer(self.edit.text())
        except Exception as e:  # noqa: BLE001
            QApplication.restoreOverrideCursor()
            from .worker import friendly
            QMessageBox.warning(self, "XER file", friendly(e))
            return False
        QApplication.restoreOverrideCursor()
        return True


class SelectProjectsPage(QWizardPage):
    def __init__(self, wiz):
        super().__init__()
        self.wiz = wiz
        self.setTitle("STEP 3 - Select projects")
        self.setSubTitle("Choose the project to analyze when an XER contains more than one project.")
        f = QFormLayout(self)
        self.bl = QComboBox()
        self.cu = QComboBox()
        f.addRow("Baseline project", self.bl)
        f.addRow("Current project", self.cu)
        self.info = QLabel()
        self.info.setWordWrap(True)
        f.addRow(self.info)

    def initializePage(self):  # noqa: N802
        b, c = self.wiz.p_bl.loaded, self.wiz.p_cu.loaded
        for combo, lx in ((self.bl, b), (self.cu, c)):
            combo.clear()
            for p in lx.projects:
                combo.addItem(f"{p.short_name} - {p.name}  ({p.activity_count} activities, data date {p.data_date or 'n/a'})", p.proj_id)
        warn = []
        for lx in (b, c):
            warn += [f"{lx.name}: {w}" for w in lx.xer.warnings]
        self.info.setText(f"Baseline: P6 version {b.xer.version or 'unknown'}, encoding {b.xer.encoding}, {len(b.xer.tables)} tables.<br>"
                          f"Current: P6 version {c.xer.version or 'unknown'}, encoding {c.xer.encoding}, {len(c.xer.tables)} tables.<br>"
                          + "<br>".join(warn))


class ProcessPage(QWizardPage):
    def __init__(self, wiz):
        super().__init__()
        self.wiz = wiz
        self.setTitle("STEPS 5-9 - Validate, match, classify and check data quality")
        v = QVBoxLayout(self)
        self.steps = QListWidget()
        v.addWidget(self.steps)
        self.bar = QProgressBar()
        v.addWidget(self.bar)
        self.msg = QLabel()
        v.addWidget(self.msg)
        self.summary = QTextBrowser()
        v.addWidget(self.summary, 1)
        self.result = None
        self._worker = None

    def initializePage(self):  # noqa: N802
        self.result = None
        self.steps.clear()
        for s in STEPS:
            self.steps.addItem(QListWidgetItem("○  " + s))
        self.summary.clear()
        prof_path = self.wiz.p_proj.profile.text()
        profile = MappingProfile.load(prof_path) if prof_path else default_profile()
        self._worker = Worker(run_import, self.wiz.p_bl.loaded, self.wiz.p_cu.loaded,
                              self.wiz.p_sel.bl.currentData(), self.wiz.p_sel.cu.currentData(), profile, AnalysisSettings())
        self._worker.progress.connect(self._progress)
        self._worker.done.connect(self._done)
        self._worker.failed.connect(self._failed)
        self._worker.start()

    def _progress(self, pct, msg):
        self.bar.setValue(pct)
        self.msg.setText(msg)
        n = {10: 1, 30: 1, 45: 1, 55: 2, 70: 3, 85: 5, 100: 6}.get(pct, 0)
        for i in range(self.steps.count()):
            if i < n:
                self.steps.item(i).setText("✔  " + STEPS[i])

    def _failed(self, msg, _tb):
        self.msg.setText("Import failed")
        self.summary.setHtml(f"<p style='color:#d03b3b'><b>{msg}</b></p>")

    def _done(self, res):
        from ..services.dashboard import ContextCache
        bl, cu, ctx = res
        self.result = res
        for i in range(self.steps.count()):
            self.steps.item(i).setText("✔  " + STEPS[i])
        stats = ctx.recon.stats()
        levels = {}
        for r in ctx.rows:
            if r.cur is not None:
                levels[r.phase_level] = levels.get(r.phase_level, 0) + 1
        findings, score = ContextCache(ctx).validation
        low = levels.get("Low", 0) + levels.get("Not Mapped", 0)
        html = (f"<h3>{cu.project.name} ({cu.project.short_name})</h3>"
                f"<p><b>Current Data Date:</b> {cu.project.data_date} · <b>Baseline Data Date:</b> {bl.project.data_date}</p>"
                f"<p><b>Activities:</b> current {len(cu.activities)}, baseline {len(bl.activities)}</p>"
                "<p><b>Reconciliation:</b> " + ", ".join(f"{k} {v}" for k, v in stats.items()) + "</p>"
                "<p><b>Mapping confidence:</b> " + ", ".join(f"{k} {v}" for k, v in sorted(levels.items())) + "</p>")
        if low:
            html += (f"<p style='color:#8a5a00'><b>{low} activities could not be confidently mapped to a category. "
                     "Review them in Mapping Review.</b></p>")
        amb = stats.get("Unmatched", 0)
        if amb:
            html += f"<p style='color:#8a5a00'><b>Baseline matching confidence is low for {amb} activities.</b></p>"
        html += f"<p><b>Data quality score:</b> {score}/100</p><ul>" + "".join(
            f"<li><b>{f.severity}</b> {f.category}: {f.message}</li>" for f in findings[:12]) + "</ul>"
        self.summary.setHtml(html)
        self.msg.setText("Ready - click Finish to generate the dashboard.")
        self.completeChanged.emit()

    def isComplete(self):  # noqa: N802
        return self.result is not None


class ImportWizard(QWizard):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("New Project - Import Primavera P6 XER files")
        self.setWizardStyle(QWizard.ModernStyle)
        self.resize(820, 600)
        self.p_bl = FilePage(1, "Select Approved Baseline XER (BL)",
                             "Click Browse… and choose the APPROVED BASELINE schedule exported from Primavera P6 (.xer).")
        self.p_cu = FilePage(2, "Select Current / Updated XER",
                             "Click Browse… and choose the LATEST UPDATE schedule (.xer). Its Data Date drives all time-phased KPIs.")
        self.p_sel = SelectProjectsPage(self)
        self.p_proj = ProjectPage(self)
        self.p_proc = ProcessPage(self)
        for p in (self.p_bl, self.p_cu, self.p_sel, self.p_proj, self.p_proc):
            self.addPage(p)
        self.setButtonText(QWizard.FinishButton, "Generate Dashboard")

    @property
    def result_data(self):
        return self.p_proc.result

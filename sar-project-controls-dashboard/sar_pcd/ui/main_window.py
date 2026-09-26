"""Main window: header, filters, navigation, pages, menus and exports."""
from __future__ import annotations

import logging
import tempfile
from datetime import date, datetime
from pathlib import Path

from PySide6.QtCore import QSize, Qt, QTimer
from PySide6.QtGui import QAction, QKeySequence
from PySide6.QtWidgets import (QApplication, QComboBox, QFileDialog, QFrame, QGridLayout, QHBoxLayout, QInputDialog,
                               QLabel, QLineEdit, QListWidget, QListWidgetItem, QMainWindow, QMessageBox,
                               QProgressDialog, QPushButton, QStackedWidget, QVBoxLayout, QWidget)

from .. import APP_NAME, __version__
from ..analysis.filters import FilterState
from ..analysis.kpi import KPI
from ..core.dates import fmt_date
from ..services import dashboard as DS
from ..services.pipeline import build_context, read_xer
from ..services.workspace import Workspace
from .dialogs import AboutDialog, ActivityDetailDialog, DrillDownDialog
from .pages.domains import (AuditPage, CostPage, HealthPage, MethodologyPage, MilestonePage, PhasePage, RiskPage,
                            ValidationPage)
from .pages.mapping import MappingPage
from .pages.overview import (BaselinePage, CriticalPage, ExecutivePage, LookaheadPage, SchedulePage, SCurvePage)
from .pages.settings import SettingsPage
from .worker import Worker, friendly

log = logging.getLogger("sar_pcd")

NAV = ["Executive Dashboard", "Schedule", "S-Curve", "Critical Path", "Baseline Comparison", "Lookahead",
       "Engineering", "Procurement", "Construction", "Milestones", "Cost / EVM", "Risks", "Schedule Health",
       "Mapping Review", "Data Validation", "Calculation Methodology", "Audit Trail", "Settings"]


class Header(QFrame):
    def __init__(self):
        super().__init__()
        self.setObjectName("Header")
        h = QHBoxLayout(self)
        h.setContentsMargins(14, 8, 14, 8)
        brand = QLabel("SAR")
        brand.setObjectName("Brand")
        h.addWidget(brand)
        v = QVBoxLayout()
        t = QHBoxLayout()
        a = QLabel("PROJECT CONTROLS")
        a.setObjectName("Title")
        b = QLabel("DASHBOARD")
        b.setObjectName("TitleAccent")
        t.addWidget(a)
        t.addWidget(b)
        t.addStretch(1)
        v.addLayout(t)
        self.info = QLabel("No project loaded")
        self.info.setObjectName("HeaderInfo")
        v.addWidget(self.info)
        h.addLayout(v, 1)
        self.stepper = QLabel()
        self.stepper.setObjectName("HeaderInfo")
        self.stepper.setToolTip("Phase status derived from mapped activity progress (● complete, ◉ in progress, ○ not started)")
        h.addWidget(self.stepper)
        h.addSpacing(16)
        self.dd = QLabel("Data Date\n–")
        self.dd.setObjectName("DataDate")
        self.dd.setAlignment(Qt.AlignCenter)
        h.addWidget(self.dd)

    def update_from(self, d, ws):
        ctx = d.ctx
        p = ctx.cur.project
        self.info.setText(
            f"<b>{p.name}</b> &nbsp;·&nbsp; Project ID {p.short_name} &nbsp;·&nbsp; Current: {ctx.cur.source_name} "
            f"&nbsp;·&nbsp; Baseline: {ctx.bl.source_name} (DD {fmt_date(ctx.bl_data_date, 'n/a')}) &nbsp;·&nbsp; "
            f"Report date {date.today():%d %b %Y}" + (f" &nbsp;·&nbsp; Workspace: {ws.name}" if ws else ""))
        self.dd.setText(f"DATA DATE\n{fmt_date(ctx.data_date, 'N/A')}")
        parts = []
        for ph, s in d.phases.items():
            a = s["progress"]["actual"]
            if not s["count"]:
                continue
            sym = "●" if (a or 0) >= 99.5 else ("◉" if (a or 0) > 0 else "○")
            parts.append(f"{sym} {ph}")
        self.stepper.setText("  ─  ".join(parts))


class FilterBar(QFrame):
    def __init__(self, on_change):
        super().__init__()
        self.setObjectName("FilterBar")
        self.on_change = on_change
        g = QGridLayout(self)
        g.setContentsMargins(12, 4, 12, 6)
        g.setHorizontalSpacing(8)
        g.setVerticalSpacing(1)
        self.combos: dict[str, QComboBox] = {}
        labels = ["Project Phase", "Discipline", "WBS", "Work Package", "Activity Code", "Contractor", "Location", "Time Period"]
        for i, lab in enumerate(labels):
            g.addWidget(QLabel(lab), 0, i)
            c = QComboBox()
            c.setMinimumWidth(110)
            c.setMaximumWidth(230)
            c.setSizeAdjustPolicy(QComboBox.AdjustToMinimumContentsLengthWithIcon)
            c.currentIndexChanged.connect(self._changed)
            g.addWidget(c, 1, i)
            self.combos[lab] = c
        g.addWidget(QLabel("Search"), 0, len(labels))
        self.search = QLineEdit()
        self.search.setPlaceholderText("Activity ID, name, WBS, code, discipline, location, package…")
        self.search.setClearButtonEnabled(True)
        self.search.setMinimumWidth(240)
        self._timer = QTimer(self)
        self._timer.setSingleShot(True)
        self._timer.setInterval(350)
        self._timer.timeout.connect(self._changed)
        self.search.textChanged.connect(lambda _: self._timer.start())
        g.addWidget(self.search, 1, len(labels))
        reset = QPushButton("Reset")
        reset.clicked.connect(self.reset)
        g.addWidget(reset, 1, len(labels) + 1)
        self._loading = False

    def populate(self, ctx):
        self._loading = True
        def fill(name, items, data=None):
            c = self.combos[name]
            c.clear()
            c.addItem("All", "")
            for i, it in enumerate(items):
                c.addItem(it, data[i] if data else it)
        fill("Project Phase", ctx.profile.category_names + (["Not Mapped"] if any(r.phase is None for r in ctx.rows) else []))
        fill("Discipline", ctx.dimension_values("Discipline"))
        wbs_items, wbs_ids = [], []
        for w in sorted(ctx.cur.wbs.values(), key=lambda w: ctx.cur.wbs_code_path(w.id)):
            path = ctx.cur.wbs_path(w.id)
            if w.is_project_node or len(path) > 2:
                continue
            wbs_items.append(("    " if len(path) == 2 else "") + f"{ctx.cur.wbs_code_path(w.id)} {w.name}")
            wbs_ids.append(w.id)
        fill("WBS", wbs_items, wbs_ids)
        fill("Work Package", ctx.dimension_values("Work Package"))
        fill("Activity Code", ctx.code_values_list())
        fill("Contractor", ctx.dimension_values("Contractor"))
        fill("Location", ctx.dimension_values("Location"))
        months, data = [], []
        s, f = ctx.baseline_start, ctx.forecast_finish
        if s and f:
            d = date(s.year, s.month, 1)
            while d <= f.date():
                nxt = date(d.year + (d.month == 12), d.month % 12 + 1, 1)
                months.append(d.strftime("%b %Y"))
                data.append((d, nxt))
                d = nxt
        fill("Time Period", months, data)
        for name in ("Discipline", "Work Package", "Contractor", "Location", "Activity Code"):
            c = self.combos[name]
            if c.count() == 1:
                c.setToolTip("Not available - no activity code or UDF was mapped to this dimension (see Mapping Review ▸ Activity Code Mapping)")
        self._loading = False

    def state(self) -> FilterState:
        c = self.combos
        per = c["Time Period"].currentData()
        from datetime import timedelta
        return FilterState(
            phase=c["Project Phase"].currentData() or "", discipline=c["Discipline"].currentData() or "",
            wbs_id=c["WBS"].currentData() or "", work_package=c["Work Package"].currentData() or "",
            code=c["Activity Code"].currentData() or "", contractor=c["Contractor"].currentData() or "",
            location=c["Location"].currentData() or "",
            period_start=per[0] if per else None, period_end=(per[1] - timedelta(days=1)) if per else None,
            search=self.search.text().strip())

    def reset(self):
        self._loading = True
        for c in self.combos.values():
            c.setCurrentIndex(0)
        self.search.clear()
        self._loading = False
        self._changed()

    def _changed(self, *_):
        if not self._loading:
            self.on_change()


class Welcome(QWidget):
    def __init__(self, win):
        super().__init__()
        self.setObjectName("Page")
        v = QVBoxLayout(self)
        v.addStretch(1)
        t = QLabel("<p style='font-size:30pt;font-weight:800;color:#00778B;margin:0'>SAR</p>"
                   "<p style='font-size:18pt;font-weight:700;color:#3D3935'>PROJECT CONTROLS DASHBOARD</p>"
                   "<p style='color:#52514E'>Primavera P6 XER analyzer · Approved Baseline vs Current Update · works fully offline</p>")
        t.setAlignment(Qt.AlignCenter)
        v.addWidget(t)
        h = QHBoxLayout()
        h.addStretch(1)
        for text, fn, primary in (("New Project (Import XER)…", win.new_project, True), ("Open Project…", win.open_project, False),
                                  ("Open Demo Project", win.open_demo, False)):
            b = QPushButton(text)
            b.setMinimumSize(QSize(210, 44))
            if primary:
                b.setObjectName("Primary")
            b.clicked.connect(fn)
            h.addWidget(b)
        h.addStretch(1)
        v.addLayout(h)
        v.addStretch(2)


class MainWindow(QMainWindow):
    def __init__(self, log_path: str = ""):
        super().__init__()
        self.log_path = log_path
        self.setWindowTitle(f"{APP_NAME} v{__version__}")
        self.resize(1600, 980)
        self.ws: Workspace | None = None
        self.dash: DS.DashboardData | None = None
        self.cache: DS.ContextCache | None = None
        self.risks, self.risk_source = [], ""
        self._worker = None
        central = QWidget()
        self.setCentralWidget(central)
        root = QVBoxLayout(central)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)
        self.header = Header()
        root.addWidget(self.header)
        self.filters = FilterBar(self.apply_filters)
        root.addWidget(self.filters)
        body = QHBoxLayout()
        body.setSpacing(0)
        self.nav = QListWidget()
        self.nav.setObjectName("Nav")
        self.nav.setFixedWidth(200)
        for n in NAV:
            self.nav.addItem(QListWidgetItem(n))
        self.nav.currentRowChanged.connect(self._nav)
        body.addWidget(self.nav)
        self.stack = QStackedWidget()
        body.addWidget(self.stack, 1)
        root.addLayout(body, 1)
        self.welcome = Welcome(self)
        self.stack.addWidget(self.welcome)
        self.pages = {}
        self._build_pages()
        self._build_menu()
        self._set_loaded(False)
        self.statusBar().showMessage("Ready - create or open a project, or open the demo project.")

    # ------------------------------------------------------------ build
    def _build_pages(self):
        eng = "Design, review, approval, IFC, shop drawings and technical submittals (stages detected from activity names)."
        prc = "Technical submittal → approval → RFQ → PO → manufacturing → FAT → shipping → delivery → site receipt, where present."
        con = "Construction progress, active workfronts (grouped by Location / Work Package / WBS), delays and upcoming work."
        makers = {
            "Executive Dashboard": ExecutivePage, "Schedule": SchedulePage, "S-Curve": SCurvePage,
            "Critical Path": CriticalPage, "Baseline Comparison": BaselinePage, "Lookahead": LookaheadPage,
            "Engineering": lambda a: PhasePage(a, "Engineering", eng), "Procurement": lambda a: PhasePage(a, "Procurement", prc),
            "Construction": lambda a: PhasePage(a, "Construction", con), "Milestones": MilestonePage,
            "Cost / EVM": CostPage, "Risks": RiskPage, "Schedule Health": HealthPage, "Mapping Review": MappingPage,
            "Data Validation": ValidationPage, "Calculation Methodology": MethodologyPage, "Audit Trail": AuditPage,
            "Settings": SettingsPage,
        }
        for name in NAV:
            p = makers[name](self)
            self.pages[name] = p
            self.stack.addWidget(p)

    def _build_menu(self):
        mb = self.menuBar()
        m = mb.addMenu("&File")
        self._act(m, "New Project (Import XER)…", self.new_project, QKeySequence.New)
        self._act(m, "Open Project…", self.open_project, QKeySequence.Open)
        self._act(m, "Open Demo Project", self.open_demo)
        m.addSeparator()
        self.a_update = self._act(m, "Import New Current Update XER…", self.import_update)
        self.a_risk = self._act(m, "Import Risk Register…", self.import_risks)
        m.addSeparator()
        self.a_dup = self._act(m, "Duplicate Project…", self.duplicate_project)
        self.a_arch = self._act(m, "Archive / Unarchive Project", self.archive_project)
        m.addSeparator()
        self._act(m, "Exit", self.close, QKeySequence.Quit)
        e = mb.addMenu("&Export")
        self.export_actions = [
            self._act(e, "PDF - Executive Dashboard…", lambda: self.export("pdf_exec")),
            self._act(e, "PDF - Full Project Controls Report…", lambda: self.export("pdf_full")),
            None,
            self._act(e, "Excel - Detailed Analysis…", lambda: self.export("xl_detail")),
            self._act(e, "Excel - Lookahead (2/4/6/8 weeks)…", lambda: self.export("xl_look")),
            self._act(e, "Excel - Critical Activities…", lambda: self.export("xl_crit")),
            self._act(e, "Excel - Baseline Comparison…", lambda: self.export("xl_base")),
            self._act(e, "Excel - Schedule Health Report…", lambda: self.export("xl_health")),
            None,
            self._act(e, "Dashboard - High-resolution PNG…", lambda: self.export("png")),
            self._act(e, "Current Screen - PNG…", lambda: self.export("screen")),
        ]
        e.insertSeparator(self.export_actions[3])
        e.insertSeparator(self.export_actions[9])
        self.export_actions = [a for a in self.export_actions if a]
        mp = mb.addMenu("&Mapping")
        self._act(mp, "Save Mapping Profile As…", self.save_profile_as)
        self._act(mp, "Apply Mapping Profile from File…", self.load_profile)
        h = mb.addMenu("&Help")
        self._act(h, "Calculation Methodology", lambda: self.goto("Calculation Methodology"))
        self._act(h, "User Guide", self.user_guide)
        self._act(h, "About", lambda: AboutDialog(self.log_path, self).exec())

    def _act(self, menu, text, fn, shortcut=None):
        a = QAction(text, self)
        if shortcut:
            a.setShortcut(shortcut)
        a.triggered.connect(fn)
        menu.addAction(a)
        return a

    def _set_loaded(self, loaded: bool):
        self.nav.setEnabled(loaded)
        self.filters.setEnabled(loaded)
        for a in self.export_actions + [self.a_update, self.a_risk]:
            a.setEnabled(loaded)
        for a in (self.a_dup, self.a_arch):
            a.setEnabled(loaded and self.ws is not None)
        if not loaded:
            self.stack.setCurrentWidget(self.welcome)

    # ------------------------------------------------------------ facade used by pages
    @property
    def ctx(self):
        return self.dash.ctx if self.dash else None

    def rows_for(self, keys):
        return DS.rows_for_keys(self.dash, keys)

    def goto(self, name: str):
        self.nav.setCurrentRow(NAV.index(name))

    def drill(self, key: str):
        k = self.dash.kpis.get(key)
        if k is None:
            return
        rows = self.rows_for(k.keys)
        if not rows and key.startswith("progress"):
            rows = [r for r in self.dash.rows if r.cur is not None]
        self.drill_rows(k, rows)

    def drill_rows(self, kpi: KPI, rows):
        DrillDownDialog(kpi, rows, self.ctx, self, on_activity=self.show_activity).exec()

    def drill_phase(self, phase: str):
        s = self.dash.phases.get(phase)
        if s:
            p = s["progress"]
            self.drill_rows(KPI(phase, f"{phase} activities", p["actual"], f"{(p['actual'] or 0):.0f}%",
                                formula="Weighted progress of activities mapped to " + phase,
                                source="Semantic mapping (see Mapping Review)", method=f"{self.ctx.measure} / {self.ctx.weighting}",
                                notes=[f"{k}: {v:.0f}%" for k, v in s["bucket_pct"].items()]), self.rows_for(s["keys"]))

    def show_activity(self, row):
        ActivityDetailDialog(self.ctx, row, self).exec()

    # ------------------------------------------------------------ data flow
    def _nav(self, i):
        if i < 0 or self.dash is None:
            return
        page = self.pages[NAV[i]]
        self.stack.setCurrentWidget(page)
        if page.dirty:
            self._refresh_page(page)

    def _refresh_page(self, page):
        QApplication.setOverrideCursor(Qt.WaitCursor)
        try:
            page.refresh()
            page.dirty = False
        except Exception as e:  # noqa: BLE001
            log.exception("Page refresh failed")
            QMessageBox.warning(self, APP_NAME, f"This view could not be displayed: {e}\nDetails were written to the error log.")
        finally:
            QApplication.restoreOverrideCursor()

    def set_context(self, ctx, reset_filters: bool = True):
        self.cache = DS.ContextCache(ctx)
        if reset_filters:
            self.filters.populate(ctx)
        self.dash = DS.build(ctx, self.filters.state(), self.risks, self.risk_source)
        self._after_data()

    def apply_filters(self):
        if self.dash is None:
            return
        QApplication.setOverrideCursor(Qt.WaitCursor)
        try:
            self.dash = DS.build(self.ctx, self.filters.state(), self.risks, self.risk_source)
        finally:
            QApplication.restoreOverrideCursor()
        self._after_data()

    def _after_data(self):
        for p in self.pages.values():
            p.dirty = True
        self.header.update_from(self.dash, self.ws)
        self._set_loaded(True)
        findings, score = self.cache.validation
        review = sum(1 for r in self.ctx.rows if r.cur is not None and r.phase_level in ("Low", "Not Mapped"))
        n = len(self.dash.rows)
        self.statusBar().showMessage(
            f"{n} activities shown ({self.dash.filt.describe()}) · Data quality {score:.1f}/100 · "
            f"{review} activities need mapping review · Weighting: {self.ctx.weighting} · Measure: {self.ctx.measure}")
        cur = max(0, self.nav.currentRow())
        if self.nav.currentRow() < 0:
            self.nav.setCurrentRow(0)
        else:
            self._nav(cur)

    def _run(self, title, fn, on_done, *args, **kwargs):
        dlg = QProgressDialog(title, None, 0, 100, self)
        dlg.setWindowModality(Qt.WindowModal)
        dlg.setMinimumDuration(0)
        dlg.setWindowTitle(APP_NAME)
        self._worker = Worker(fn, *args, **kwargs)
        self._worker.progress.connect(lambda p, m: (dlg.setValue(p), dlg.setLabelText(m)))

        def ok(res):
            dlg.close()
            on_done(res)

        def bad(msg, tb):
            dlg.close()
            QMessageBox.critical(self, APP_NAME, msg)
        self._worker.done.connect(ok)
        self._worker.failed.connect(bad)
        self._worker.start()

    def _recompute(self, note_ok: str = ""):
        profile, settings = self._pending
        bl, cu = self.ctx.bl, self.ctx.cur

        def done(ctx):
            self.set_context(ctx, reset_filters=False)
            if note_ok:
                self.statusBar().showMessage(note_ok + " - recalculated.", 8000)
        self._run("Recalculating…", build_context, done, bl, cu, profile, settings)

    def apply_profile(self, profile, note: str):
        if self.ws:
            self.ws.save_profile(profile, note=note)
        self._pending = (profile, self.ctx.settings)
        self._recompute(note)

    def apply_settings(self, settings, profile):
        if self.ws:
            self.ws.save_settings(settings)
            self.ws.save_profile(profile, note="Keyword dictionary / thresholds edited in Settings")
        self._pending = (profile, settings)
        self._recompute("Settings applied")

    # ------------------------------------------------------------ project management
    def new_project(self):
        from .import_wizard import ImportWizard
        wiz = ImportWizard(self)
        if not wiz.exec() or wiz.result_data is None:
            return
        bl, cu, ctx = wiz.result_data
        try:
            ws = Workspace.create(wiz.p_proj.path.text(), wiz.p_proj.name.text().strip())
            ws.save_schedule("baseline", bl, wiz.p_bl.loaded.raw, wiz.p_bl.loaded.name)
            ws.save_schedule("current", cu, wiz.p_cu.loaded.raw, wiz.p_cu.loaded.name)
            ws.save_profile(ctx.profile, note="Initial mapping profile")
        except Exception as e:  # noqa: BLE001
            log.exception("Workspace creation failed")
            QMessageBox.critical(self, APP_NAME, f"The project workspace could not be saved: {friendly(e)}")
            return
        self._open_ws(ws, ctx)

    def _open_ws(self, ws, ctx=None):
        if self.ws:
            self.ws.close()
        self.ws = ws
        self.risks, self.risk_source = ws.load_risks()
        if ctx is not None:
            self.set_context(ctx)
            return
        bl, cu = ws.load_schedule("baseline"), ws.load_schedule("current")
        if bl is None or cu is None:
            QMessageBox.warning(self, APP_NAME, "This project has no imported schedules yet.")
            return
        self._run("Opening project…", build_context, self.set_context, bl, cu, ws.load_profile(), ws.load_settings())

    def open_project(self):
        path, _ = QFileDialog.getOpenFileName(self, "Open Project", "", "SAR PCD Project (*.sarpcd)")
        if not path:
            return
        try:
            ws = Workspace(path)
            ws.meta("name")
        except Exception as e:  # noqa: BLE001
            QMessageBox.critical(self, APP_NAME, f"Not a valid project workspace: {e}")
            return
        if ws.archived:
            QMessageBox.information(self, APP_NAME, "This project is archived. It opens read-only for review; "
                                                    "use File ▸ Archive / Unarchive to reactivate it.")
        self._open_ws(ws)

    def open_demo(self):
        from ..__main__ import DEMO_RISKS
        from ..analysis.risk import load_register
        from ..demo.rail_demo import build_demo
        from ..mapping.profile import default_profile
        from ..analysis.settings import AnalysisSettings
        from ..core.loader import load_schedule
        from ..core.xer_parser import parse_xer
        folder = Path(tempfile.gettempdir()) / "SAR_PCD_Demo"
        folder.mkdir(exist_ok=True)
        bl_t, cu_t = build_demo()
        (folder / "Demo_Baseline_Rev0.xer").write_bytes(bl_t.encode("cp1252"))
        (folder / "Demo_Update_2025-11.xer").write_bytes(cu_t.encode("cp1252"))
        (folder / "Demo_Risk_Register.csv").write_text(DEMO_RISKS, encoding="utf-8")
        ws = Workspace.create(folder / "Demo Project.sarpcd", "Demo Project")
        bl = load_schedule(parse_xer(bl_t.encode("cp1252"), "Demo_Baseline_Rev0.xer"))
        cu = load_schedule(parse_xer(cu_t.encode("cp1252"), "Demo_Update_2025-11.xer"))
        ws.save_schedule("baseline", bl, bl_t.encode("cp1252"), "Demo_Baseline_Rev0.xer")
        ws.save_schedule("current", cu, cu_t.encode("cp1252"), "Demo_Update_2025-11.xer")
        items, _ = load_register(folder / "Demo_Risk_Register.csv")
        ws.save_risks(items, "Demo_Risk_Register.csv")
        self._open_ws(ws)

    def import_update(self):
        path, _ = QFileDialog.getOpenFileName(self, "Import New Current Update", "", "Primavera P6 XER (*.xer)")
        if not path:
            return
        try:
            lx = read_xer(path)
        except Exception as e:  # noqa: BLE001
            QMessageBox.warning(self, APP_NAME, friendly(e))
            return
        pid = None
        if len(lx.projects) > 1:
            items = [f"{p.short_name} - {p.name}" for p in lx.projects]
            choice, ok = QInputDialog.getItem(self, "Select project", "The XER contains several projects:", items, 0, False)
            if not ok:
                return
            pid = lx.projects[items.index(choice)].proj_id
        from ..core.loader import load_schedule

        def job(progress):
            progress(20, "Normalizing new update…")
            cu = load_schedule(lx.xer, pid)
            ctx = build_context(self.ctx.bl, cu, self.ctx.profile, self.ctx.settings, progress)
            return cu, ctx

        def done(res):
            cu, ctx = res
            if self.ws:
                self.ws.save_schedule("current", cu, lx.raw, lx.name)
                self.ws.log("Mapping profile preserved", self.ctx.profile.name, note="Existing overrides re-applied to new update")
            self.set_context(ctx)
            QMessageBox.information(self, APP_NAME, f"Update {lx.name} imported (data date {fmt_date(cu.project.data_date)}). "
                                                    "The project's mapping profile and overrides were preserved.")
        self._run("Importing update…", job, done)

    def import_risks(self):
        path, _ = QFileDialog.getOpenFileName(self, "Import Risk Register", "", "Risk register (*.xlsx *.csv)")
        if not path:
            return
        from ..analysis.risk import load_register
        try:
            items, warns = load_register(path)
        except Exception as e:  # noqa: BLE001
            QMessageBox.warning(self, APP_NAME, f"Risk register could not be imported: {e}")
            return
        self.risks, self.risk_source = items, Path(path).name
        if self.ws:
            self.ws.save_risks(items, self.risk_source)
        if warns:
            QMessageBox.information(self, APP_NAME, "Imported with warnings:\n" + "\n".join(warns[:15]))
        self.apply_filters()

    def duplicate_project(self):
        path, _ = QFileDialog.getSaveFileName(self, "Duplicate Project", f"{self.ws.name} (copy).sarpcd", "SAR PCD Project (*.sarpcd)")
        if path:
            new = self.ws.duplicate(path, Path(path).stem)
            self._open_ws(new)

    def archive_project(self):
        self.ws.archive(not self.ws.archived)
        QMessageBox.information(self, APP_NAME, "Project archived." if self.ws.archived else "Project unarchived.")

    def save_profile_as(self):
        path, _ = QFileDialog.getSaveFileName(self, "Save Mapping Profile", f"{self.ctx.profile.name}.json", "Mapping Profile (*.json)")
        if path:
            self.ctx.profile.save(path)
            if self.ws:
                self.ws.log("Export Mapping Profile", Path(path).name)

    def load_profile(self):
        from ..mapping.profile import MappingProfile
        path, _ = QFileDialog.getOpenFileName(self, "Apply Mapping Profile", "", "Mapping Profile (*.json)")
        if path:
            try:
                p = MappingProfile.load(path)
            except Exception as e:  # noqa: BLE001
                QMessageBox.warning(self, APP_NAME, f"Invalid mapping profile: {e}")
                return
            self.apply_profile(p, f"Mapping profile loaded from {Path(path).name}")

    def user_guide(self):
        from PySide6.QtGui import QDesktopServices
        from PySide6.QtCore import QUrl
        import sys
        base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[2]))
        guide = base / "docs" / "USER_GUIDE.md"
        if guide.exists():
            QDesktopServices.openUrl(QUrl.fromLocalFile(str(guide)))
        else:
            QMessageBox.information(self, APP_NAME, "The User Guide is installed with the application in docs\\USER_GUIDE.md.")

    # ------------------------------------------------------------ exports
    def export(self, kind: str):
        from ..reporting import excel as XL
        d, cache = self.dash, self.cache
        name = (self.ctx.cur.project.short_name or "Project").replace("/", "-")
        stamp = self.ctx.data_date.strftime("%Y%m%d") if self.ctx.data_date else datetime.now().strftime("%Y%m%d")
        specs = {
            "pdf_exec": ("PDF (*.pdf)", f"{name}_Executive_Dashboard_{stamp}.pdf"),
            "pdf_full": ("PDF (*.pdf)", f"{name}_Project_Controls_Report_{stamp}.pdf"),
            "xl_detail": ("Excel (*.xlsx)", f"{name}_Detailed_Analysis_{stamp}.xlsx"),
            "xl_look": ("Excel (*.xlsx)", f"{name}_Lookahead_{stamp}.xlsx"),
            "xl_crit": ("Excel (*.xlsx)", f"{name}_Critical_Activities_{stamp}.xlsx"),
            "xl_base": ("Excel (*.xlsx)", f"{name}_Baseline_Comparison_{stamp}.xlsx"),
            "xl_health": ("Excel (*.xlsx)", f"{name}_Schedule_Health_{stamp}.xlsx"),
            "png": ("PNG image (*.png)", f"{name}_Dashboard_{stamp}.png"),
            "screen": ("PNG image (*.png)", f"{name}_Screen_{stamp}.png"),
        }
        filt, default = specs[kind]
        size = "A3"
        if kind.startswith("pdf"):
            size, ok = QInputDialog.getItem(self, "Page size", "Landscape page size:", ["A3", "A4"], 0, False)
            if not ok:
                return
        path, _ = QFileDialog.getSaveFileName(self, "Export", default, filt)
        if not path:
            return
        QApplication.setOverrideCursor(Qt.WaitCursor)
        try:
            audit = self.ws.audit_trail() if self.ws else None
            if kind == "pdf_exec":
                from ..reporting.pdf import executive_pdf
                executive_pdf(path, d, size)
            elif kind == "pdf_full":
                from ..reporting.pdf import full_pdf
                full_pdf(path, d, cache, size, audit)
            elif kind == "xl_detail":
                XL.export_detailed(path, d, cache, audit)
            elif kind == "xl_look":
                XL.export_lookahead(path, d)
            elif kind == "xl_crit":
                XL.export_critical(path, d)
            elif kind == "xl_base":
                XL.export_baseline(path, d, cache)
            elif kind == "xl_health":
                XL.export_health(path, d, cache)
            elif kind == "png":
                from ..reporting.dashboard_image import save_png
                save_png(d, path, dpi=220)
            elif kind == "screen":
                self.stack.currentWidget().grab().save(path)
            if self.ws:
                self.ws.log("Export", Path(path).name, note=kind)
        except PermissionError:
            QMessageBox.warning(self, APP_NAME, "The file could not be written. Is it open in another program?")
            return
        except Exception as e:  # noqa: BLE001
            log.exception("Export failed")
            QMessageBox.critical(self, APP_NAME, f"Export failed: {e}")
            return
        finally:
            QApplication.restoreOverrideCursor()
        self.statusBar().showMessage(f"Exported {path}", 10000)

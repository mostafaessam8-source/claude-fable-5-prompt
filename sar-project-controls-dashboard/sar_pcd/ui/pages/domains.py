"""Engineering / Procurement / Construction, Milestones, Cost-EVM, Risks, Health,
Data Validation, Methodology and Audit Trail pages."""
from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtGui import QColor
from PySide6.QtWidgets import (QFileDialog, QHBoxLayout, QLabel, QMessageBox, QPushButton, QSplitter, QTableWidget,
                               QTableWidgetItem, QTabWidget, QVBoxLayout, QWidget)

from ...analysis.kpi import KPI, fmt_money, fmt_pct
from ...analysis.methodology import METHODOLOGY
from ...core.dates import fmt_date
from ...reporting import charts as C
from ...reporting import style as S
from ..widgets.common import ChartCanvas, KpiCard, Panel, page_title
from ..widgets.table import ActivityTable
from .base import Page

PHASE_COLS = ["code", "name", "wbs", "stage", "discipline", "location", "bl_start", "bl_finish", "start", "finish",
              "pct", "tf", "finish_var", "status", "conf"]


def fill_table(t: QTableWidget, headers: list[str], rows: list[list], colors: dict | None = None) -> None:
    t.clear()
    t.setColumnCount(len(headers))
    t.setHorizontalHeaderLabels(headers)
    t.setRowCount(len(rows))
    for i, r in enumerate(rows):
        for j, v in enumerate(r):
            it = QTableWidgetItem("" if v is None else str(v))
            if colors and (i, j) in colors:
                it.setForeground(QColor(colors[(i, j)]))
            t.setItem(i, j, it)
    t.resizeColumnsToContents()
    t.horizontalHeader().setStretchLastSection(True)
    t.verticalHeader().setVisible(False)


class PhasePage(Page):
    def __init__(self, app, phase: str, hint: str):
        super().__init__(app)
        self.phase = phase
        self.title = phase
        self.layout_.addWidget(page_title(f"{phase} Analysis", hint))
        row = QHBoxLayout()
        self.cards = {}
        for key, title in (("progress", f"{phase} Progress"), ("planned", "Planned"), ("delayed", "Delayed / Overdue"),
                           ("critical", "Critical"), ("extra", "Pending Approvals" if phase != "Construction" else "Active Workfronts")):
            c = KpiCard(title)
            c.setMinimumHeight(96)
            c.clicked.connect(self._card)
            row.addWidget(c)
            self.cards[key] = c
        self.layout_.addLayout(row)
        split = QSplitter(Qt.Vertical)
        charts = QWidget()
        ch = QHBoxLayout(charts)
        ch.setContentsMargins(0, 0, 0, 0)
        p1 = Panel("Status")
        self.donut = ChartCanvas(4, 2.8)
        p1.add(self.donut, 1)
        ch.addWidget(p1, 2)
        p2 = Panel("By Stage" if phase != "Construction" else "Active Workfronts")
        self.stage_chart = ChartCanvas(6, 2.8)
        p2.add(self.stage_chart, 1)
        ch.addWidget(p2, 3)
        split.addWidget(charts)
        self.tabs = QTabWidget()
        self.all = ActivityTable(PHASE_COLS, export_name=phase.lower())
        self.all.activated.connect(app.show_activity)
        self.tabs.addTab(self.all, "All Activities")
        self.stage_table = QTableWidget()
        self.tabs.addTab(self.stage_table, "Stages" if phase != "Construction" else "Workfronts")
        self.upcoming = ActivityTable(PHASE_COLS, export_name=f"{phase.lower()}_upcoming")
        self.upcoming.activated.connect(app.show_activity)
        self.tabs.addTab(self.upcoming, "Upcoming (4 weeks)")
        split.addWidget(self.tabs)
        split.setSizes([300, 400])
        self.layout_.addWidget(split, 1)
        self._keys = {}

    def _card(self, key):
        title, keys = self._keys.get(key, ("", []))
        self.app.drill_rows(KPI(key, title, len(keys), str(len(keys)), formula=f"{self.phase} activities: {title}",
                                source="Semantic mapping + schedule status"), self.app.rows_for(keys))

    def refresh(self):
        d = self.app.dash
        ctx = d.ctx
        s = d.phases.get(self.phase)
        if not s:
            return
        p = s["progress"]
        self.cards["progress"].set_main(KPI("progress", "Progress", p["actual"], fmt_pct(p["actual"]),
                                            formula="Weighted actual progress of mapped activities"), unit=f"{s['count']} activities")
        self.cards["planned"].set_main(KPI("planned", "Planned", p["planned"], fmt_pct(p["planned"]),
                                           formula="Weighted baseline planned progress at Data Date"),
                                       unit=f"variance {fmt_pct(p['variance'])}")
        delayed = sorted(set(s["delayed"]) | set(s["overdue"]))
        self.cards["delayed"].set_main(KPI("delayed", "Delayed", len(delayed), str(len(delayed)), "bad" if delayed else "good"),
                                       unit=f"{len(s['overdue'])} overdue")
        self.cards["critical"].set_main(KPI("critical", "Critical", len(s["critical"]), str(len(s["critical"]))))
        if self.phase == "Construction":
            extra = s["active"]
            self.cards["extra"].set_main(KPI("extra", "Active", len(extra), str(len(d.workfronts))), unit=f"{len(extra)} activities in progress")
            extra_title = "Active construction activities"
        else:
            extra = s["pending_approvals"]
            self.cards["extra"].set_main(KPI("extra", "Pending Approvals", len(extra), str(len(extra))))
            extra_title = "Pending approvals"
        self._keys = {"progress": ("All activities", s["keys"]), "planned": ("All activities", s["keys"]),
                      "delayed": ("Delayed / overdue", delayed), "critical": ("Critical", s["critical"]),
                      "extra": (extra_title, extra)}
        fig = self.donut.clear()
        ax = fig.add_subplot(111)
        C.draw_donut(ax, s["bucket_pct"], fmt_pct(p["actual"], 0), f"{self.phase} progress")
        C.donut_legend(ax, s["bucket_pct"])
        self.donut.draw()
        fig = self.stage_chart.clear()
        ax = fig.add_subplot(111)
        if self.phase == "Construction":
            wf = d.workfronts
            C.draw_hbar(ax, [w["workfront"] for w in wf], [w["activities"] for w in wf], S.SERIES[0], "{:g}",
                        f"In-progress activities (grouped by {wf[0]['grouped_by'] if wf else 'WBS'})")
            fill_table(self.stage_table, ["Workfront", "Grouped by", "Active activities", "Critical", "Delayed"],
                       [[w["workfront"], w["grouped_by"], w["activities"], w["critical"], w["delayed"]] for w in wf])
        else:
            st = [g for g in s["stages"]]
            C.draw_hbar(ax, [g["stage"] for g in st], [g["progress"] or 0 for g in st], S.SERIES[0], "{:.0f}%", "Progress %")
            fill_table(self.stage_table, ["Stage", "Activities", "Completed", "In Progress", "Delayed", "Progress"],
                       [[g["stage"], g["count"], g["completed"], g["in_progress"], g["delayed"], fmt_pct(g["progress"], 0)] for g in st])
        self.stage_chart.draw()
        self.all.set_rows(self.app.rows_for(s["keys"]), ctx.data_date)
        self.upcoming.set_rows(self.app.rows_for(s["upcoming"]), ctx.data_date)


class MilestonePage(Page):
    title = "Milestones"

    def __init__(self, app):
        super().__init__(app)
        self.layout_.addWidget(page_title("Milestone Dashboard", "Baseline vs current milestone dates. Upcoming = within 90 days of the Data Date."))
        row = QHBoxLayout()
        self.cards = {}
        for k in ("Total", "Completed", "Upcoming", "Delayed", "Critical"):
            c = KpiCard(k)
            c.setMinimumHeight(86)
            c.clicked.connect(self._card)
            row.addWidget(c)
            self.cards[k] = c
        self.layout_.addLayout(row)
        self.table = QTableWidget()
        self.table.cellDoubleClicked.connect(self._dbl)
        self.layout_.addWidget(self.table, 1)
        self._ms = []

    def _card(self, key):
        sel = [m for m in self._ms if key == "Total" or m["status"] == key or (key == "Critical" and m["critical"])]
        self.app.drill_rows(KPI(key, f"Milestones - {key}", len(sel), str(len(sel)), formula="Milestone activities (TT_Mile / TT_FinMile)"),
                            self.app.rows_for([m["key"] for m in sel]))

    def refresh(self):
        ms = self.app.dash.milestones
        self._ms = ms
        counts = {"Total": len(ms)}
        for m in ms:
            counts[m["status"]] = counts.get(m["status"], 0) + 1
        counts["Critical"] = sum(m["critical"] for m in ms)
        for k, c in self.cards.items():
            c.set_main(KPI(k, k, counts.get(k, 0), str(counts.get(k, 0)), "bad" if k in ("Delayed", "Critical") and counts.get(k) else "neutral"))
        rows, colors = [], {}
        for i, m in enumerate(ms):
            rows.append([m["code"], m["name"], fmt_date(m["bl_date"]), fmt_date(m["date"]),
                         "" if m["variance"] is None else f"{m['variance']:+.0f}", m["status"], "Yes" if m["in_baseline"] else "No (added)"])
            colors[(i, 5)] = S.STATUS_TEXT_COLORS.get(m["status"], S.TEXT)
            if m["variance"] and m["variance"] > 0:
                colors[(i, 4)] = S.CRITICAL
        fill_table(self.table, ["Activity ID", "Milestone", "Baseline Date", "Current Date", "Variance (d)", "Status", "In Baseline"], rows, colors)

    def _dbl(self, row, _c):
        r = self.app.rows_for([self._ms[row]["key"]])
        if r:
            self.app.show_activity(r[0])


class CostPage(Page):
    title = "Cost / EVM"

    def __init__(self, app):
        super().__init__(app)
        self.layout_.addWidget(page_title("Cost / Earned Value", "Standard Earned Value formulas. Values are shown only where the XER contains the supporting cost data."))
        self.warn = QLabel()
        self.warn.setObjectName("Warn")
        self.warn.setWordWrap(True)
        self.layout_.addWidget(self.warn)
        self.grid = QHBoxLayout()
        self.cards = {}
        for k in ("BAC", "PV", "EV", "AC", "SPI", "CPI", "EAC", "VAC"):
            c = KpiCard(k)
            c.setMinimumHeight(86)
            self.grid.addWidget(c)
            self.cards[k] = c
        self.layout_.addLayout(self.grid)
        self.table = QTableWidget()
        self.table.setMaximumHeight(330)
        self.layout_.addWidget(self.table)
        p = Panel("Cost by Group")
        self.chart = ChartCanvas(10, 3.4)
        p.add(self.chart, 1)
        self.layout_.addWidget(p, 1)

    def refresh(self):
        d = self.app.dash
        e = d.evm
        self.warn.setVisible(bool(e.get("notes")))
        self.warn.setText("<br>".join(e.get("notes", [])))
        formulas = {"BAC": "Σ baseline budget", "PV": "Σ BL budget × planned fraction", "EV": "Σ BL budget × % complete",
                    "AC": "Σ actual cost", "SPI": "EV / PV", "CPI": "EV / AC", "EAC": "BAC / CPI", "VAC": "BAC − EAC"}
        for k, c in self.cards.items():
            v = e.get(k)
            if v is None:
                kpi = KPI.unavailable(k, k, "Not available - see notes above", formulas[k])
            else:
                disp = f"{v:.2f}" if k in ("SPI", "CPI") else fmt_money(v)
                st = ("good" if v >= 1 else ("warn" if v >= 0.9 else "bad")) if k in ("SPI", "CPI") else "neutral"
                kpi = KPI(k, k, v, disp, st, formula=formulas[k])
            c.set_main(kpi, unit=formulas[k])
        rows = [[m, "N/A" if e.get(k) is None else (f"{e[k]:.3f}" if k in ("SPI", "CPI") else f"{e[k]:,.0f}"), f]
                for m, k, f in (("Budget at Completion", "BAC", "Σ baseline budget cost (TASKRSRC + PROJCOST)"),
                                ("Planned Value", "PV", "Σ baseline budget × planned fraction at Data Date"),
                                ("Earned Value", "EV", "Σ baseline budget × % complete (P6 method)"),
                                ("Actual Cost", "AC", "Σ actual regular + overtime + expense cost"),
                                ("Schedule Variance", "SV", "EV − PV"), ("Cost Variance", "CV", "EV − AC"),
                                ("SPI", "SPI", "EV / PV"), ("CPI", "CPI", "EV / AC"),
                                ("EAC (CPI method)", "EAC", "BAC / CPI"), ("EAC (bottom-up)", "EAC_bottom_up", "AC + Σ remaining cost"),
                                ("ETC", "ETC", "EAC − AC"), ("VAC", "VAC", "BAC − EAC"),
                                ("Budget of activities not in baseline", "added_budget", "Σ current budget of added / split activities"))]
        fill_table(self.table, ["Metric", "Value", "Formula"], rows)
        fig = self.chart.clear()
        C.draw_cost(fig.add_subplot(111), d.cost)
        self.chart.draw()


class RiskPage(Page):
    title = "Risks"

    def __init__(self, app):
        super().__init__(app)
        self.layout_.addWidget(page_title("Risk Register & Heatmap",
                                          "Risks are never derived from schedule activities. Import a risk register (CSV/XLSX with "
                                          "Risk ID, Title, Probability 1-5, Impact 1-5, Owner, Status, Activity ID)."))
        bar = QHBoxLayout()
        b = QPushButton("Import Risk Register…")
        b.setObjectName("Primary")
        b.clicked.connect(app.import_risks)
        bar.addWidget(b)
        self.src = QLabel()
        self.src.setObjectName("Hint")
        bar.addWidget(self.src)
        bar.addStretch(1)
        self.layout_.addLayout(bar)
        split = QSplitter()
        p = Panel("5 × 5 Risk Matrix")
        self.chart = ChartCanvas(5, 4)
        p.add(self.chart, 1)
        split.addWidget(p)
        self.table = QTableWidget()
        split.addWidget(self.table)
        split.setSizes([450, 700])
        self.layout_.addWidget(split, 1)

    def refresh(self):
        d = self.app.dash
        fig = self.chart.clear()
        C.draw_heatmap(fig.add_subplot(111), d.risk, d.ctx.settings.risk_bands)
        self.chart.draw()
        if not d.risk.get("available"):
            self.src.setText("Risk Data Not Available")
            fill_table(self.table, ["Risk Data Not Available"], [])
            return
        from ...analysis.risk import level
        self.src.setText(f"Source: {d.risk.get('source')} · {d.risk['total']} open risks")
        rows, colors = [], {}
        for i, x in enumerate(sorted(d.risk["items"], key=lambda x: -x.score)):
            lv = level(x.score, d.ctx.settings.risk_bands)
            rows.append([x.id, x.title, x.probability, x.impact, x.score, lv, x.status, x.owner, x.activity, x.response])
            colors[(i, 5)] = S.RISK_COLORS[lv]
        fill_table(self.table, ["ID", "Title", "P", "I", "Score", "Level", "Status", "Owner", "Activity", "Response"], rows, colors)


class HealthPage(Page):
    title = "Schedule Health"

    def __init__(self, app):
        super().__init__(app)
        self.layout_.addWidget(page_title("Schedule Quality / Health",
                                          "DCMA 14-point style checks plus additional quality tests. Every result shows its population, "
                                          "count, metric and threshold (configurable in Settings). Double-click a check to list the activities."))
        self.summary = QLabel()
        self.layout_.addWidget(self.summary)
        self.table = QTableWidget()
        self.table.cellDoubleClicked.connect(self._dbl)
        self.layout_.addWidget(self.table, 1)
        self._checks = []

    def refresh(self):
        checks = self.app.cache.health
        self._checks = checks
        n_pass = sum(c.result == "Pass" for c in checks)
        n_fail = sum(c.result == "Fail" for c in checks)
        self.summary.setText(f"<b>{n_pass}</b> passed · <b style='color:{S.CRITICAL}'>{n_fail}</b> failed · "
                             f"{len(checks) - n_pass - n_fail} informational / not performed")
        rows, colors = [], {}
        for i, c in enumerate(checks):
            icon = {"Pass": "✔ Pass", "Fail": "✖ Fail", "Info": "ℹ Info", "Not Performed": "– Not Performed"}[c.result]
            rows.append([c.id, c.name, c.description, c.population, c.count, c.metric_display, c.threshold, icon, c.basis])
            colors[(i, 7)] = {"Pass": S.GOOD, "Fail": S.CRITICAL}.get(c.result, S.TEXT_2)
        fill_table(self.table, ["Check", "Name", "Test", "Population", "Count", "Metric", "Threshold", "Result", "Basis"], rows, colors)

    def _dbl(self, row, _c):
        c = self._checks[row]
        self.app.drill_rows(KPI(c.id, f"{c.id} {c.name}", c.count, str(c.count), formula=c.description,
                                source=f"Threshold {c.threshold}; population {c.population}", notes=[c.basis] if c.basis else []),
                            self.app.rows_for(c.keys))


class ValidationPage(Page):
    title = "Data Validation"

    def __init__(self, app):
        super().__init__(app)
        self.layout_.addWidget(page_title("Data Quality & Validation",
                                          "Findings are listed individually. The score is 100 minus the penalty shown for each finding."))
        self.score = QLabel()
        self.score.setStyleSheet("font-size:14pt;font-weight:700;")
        self.layout_.addWidget(self.score)
        self.table = QTableWidget()
        self.table.cellDoubleClicked.connect(self._dbl)
        self.layout_.addWidget(self.table, 1)
        self._f = []

    def refresh(self):
        f, score = self.app.cache.validation
        self._f = f
        self.score.setText(f"Data quality score: {score:.1f} / 100")
        rows, colors = [], {}
        for i, x in enumerate(f):
            rows.append([x.severity, x.category, x.message, x.count or "", f"{x.penalty:.1f}", x.impact])
            colors[(i, 0)] = {"Critical": S.CRITICAL, "Warning": "#8a5a00"}.get(x.severity, S.TEXT_2)
        fill_table(self.table, ["Severity", "Category", "Finding", "Count", "Penalty", "Impact"], rows, colors)

    def _dbl(self, row, _c):
        x = self._f[row]
        if x.keys:
            keys = [k if not k.startswith("BL:") else k for k in x.keys]
            self.app.drill_rows(KPI(x.category, x.category, x.count, str(x.count), formula=x.message), self.app.rows_for(keys))


class MethodologyPage(Page):
    title = "Calculation Methodology"

    def __init__(self, app):
        super().__init__(app)
        self.layout_.addWidget(page_title("Calculation Methodology", "How every KPI is calculated. Source data, derived data, user mapping and assumptions are kept separate."))
        self.notes = QLabel()
        self.notes.setWordWrap(True)
        self.notes.setObjectName("Warn")
        self.layout_.addWidget(self.notes)
        t = QTableWidget()
        fill_table(t, ["KPI", "Formula", "Notes"], [list(x) for x in METHODOLOGY])
        t.setWordWrap(True)
        t.setColumnWidth(0, 200)
        t.setColumnWidth(1, 520)
        t.resizeRowsToContents()
        self.layout_.addWidget(t, 1)

    def refresh(self):
        ctx = self.app.dash.ctx
        self.notes.setText("<b>Active method for this project:</b><br>" + "<br>".join(ctx.method_notes) +
                           f"<br>Critical: {ctx.critical_info['source']} · Longest Path: {ctx.critical_info['longest_path_source']}")


class AuditPage(Page):
    title = "Audit Trail"

    def __init__(self, app):
        super().__init__(app)
        self.layout_.addWidget(page_title("Audit Trail", "Imports, mapping overrides, reconciliation decisions and configuration changes for this project workspace."))
        self.table = QTableWidget()
        self.layout_.addWidget(self.table, 1)
        self.hist = QTableWidget()
        self.hist.setMaximumHeight(160)
        self.layout_.addWidget(QLabel("<b>Imported schedule history</b>"))
        self.layout_.addWidget(self.hist)

    def refresh(self):
        ws = self.app.ws
        if ws is None:
            fill_table(self.table, ["No project workspace open (demo / unsaved analysis)"], [])
            return
        fill_table(self.table, ["Time", "User", "Action", "Target", "Old", "New", "Note"],
                   [[a["time"], a["user"], a["action"], a["target"], a["old"], a["new"], a["note"]] for a in ws.audit_trail()])
        fill_table(self.hist, ["Role", "File", "SHA-256", "Data Date", "Imported"],
                   [[h["role"], h["filename"], h["sha256"][:16] + "…", h["data_date"], h["imported_at"]] for h in ws.history()])

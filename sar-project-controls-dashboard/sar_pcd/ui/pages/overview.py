"""Executive Dashboard, Schedule, S-Curve, Critical Path, Baseline Comparison, Lookahead."""
from __future__ import annotations

import matplotlib.dates as mdates
from PySide6.QtCore import Qt
from PySide6.QtWidgets import (QComboBox, QGridLayout, QHBoxLayout, QLabel, QListWidget, QListWidgetItem, QSplitter,
                               QTabWidget, QTextBrowser, QVBoxLayout, QWidget)

from ...analysis import metrics as MX
from ...analysis.kpi import KPI
from ...core.dates import fmt_date
from ...reporting import charts as C
from ...reporting import style as S
from ..widgets.common import ChartCanvas, KpiCard, Panel, page_title
from ..widgets.gantt import GanttView
from ..widgets.table import ActivityTable
from .base import Page

LOOK_COLS = ["code", "name", "wbs", "discipline", "bl_start", "bl_finish", "fc_start", "finish", "status", "pct", "tf"]
CRIT_COLS = ["code", "name", "wbs", "phase", "start", "finish", "rem", "tf", "ff", "finish_var", "critical", "status"]


def s_curve_hover(sc):
    dates = sc.get("dates") or []
    nums = [mdates.date2num(d) for d in dates]

    def fn(event):
        if not nums or event.xdata is None:
            return None
        i = min(range(len(nums)), key=lambda k: abs(nums[k] - event.xdata))
        parts = [dates[i].strftime("%d %b %Y")]
        for label, key in (("Planned", "planned"), ("Actual", "actual"), ("Forecast", "forecast")):
            v = sc[key][i]
            if v is not None:
                parts.append(f"{label}: {v:.1f}%")
        y = next((sc[k][i] for k in ("actual", "forecast", "planned") if sc[k][i] is not None), 0)
        return "\n".join(parts), (nums[i], y)
    return fn


class ExecutivePage(Page):
    title = "Executive Dashboard"

    def __init__(self, app):
        super().__init__(app, scroll=True)
        L = self.layout_
        row = QHBoxLayout()
        row.setSpacing(8)
        self.c_prog = KpiCard("Progress", "▤")
        self.c_sched = KpiCard("Schedule", "▦")
        self.c_spi = KpiCard("SPI", "▮")
        self.c_cpi = KpiCard("CPI", "◎")
        self.c_crit = KpiCard("Critical Path", "⟶")
        self.c_risk = KpiCard("Risks", "⚠")
        for c in (self.c_prog, self.c_sched, self.c_spi, self.c_cpi, self.c_crit, self.c_risk):
            row.addWidget(c)
            c.clicked.connect(self._card)
        L.addLayout(row)
        mid = QHBoxLayout()
        self.p_gantt = Panel("Primavera P6 - Schedule")
        self.gantt = GanttView(compact=True)
        self.gantt.setMinimumHeight(380)
        self.gantt.activated.connect(app.show_activity)
        self.p_gantt.add(self.gantt, 1)
        mid.addWidget(self.p_gantt, 6)
        self.p_s = Panel("Progress S-Curve")
        self.sc = ChartCanvas(6, 3.8)
        self.p_s.add(self.sc, 1)
        mid.addWidget(self.p_s, 4)
        L.addLayout(mid)
        low = QHBoxLayout()
        self.p_risk = Panel("Risk Heatmap")
        self.risk = ChartCanvas(4.2, 3.0)
        self.p_risk.add(self.risk, 1)
        low.addWidget(self.p_risk, 3)
        self.p_proc = Panel("Procurement Status")
        self.proc = ChartCanvas(4.2, 3.0)
        self.proc.canvas.mpl_connect("button_press_event", lambda e: app.drill_phase("Procurement"))
        self.proc.setToolTip("Click to list procurement activities")
        self.p_proc.add(self.proc, 1)
        low.addWidget(self.p_proc, 3)
        self.p_phase = Panel("Progress by Phase")
        self.phase = ChartCanvas(4.6, 3.0)
        self.p_phase.add(self.phase, 1)
        low.addWidget(self.p_phase, 4)
        L.addLayout(low)
        bot = QHBoxLayout()
        self.p_look = Panel("Lookahead (Next 6 Weeks)")
        self.look = ActivityTable(["code", "name", "discipline", "start", "finish", "status"], export_name="lookahead", search=False)
        self.look.setMinimumHeight(260)
        self.look.activated.connect(app.show_activity)
        self.p_look.add(self.look, 1)
        bot.addWidget(self.p_look, 5)
        self.p_cost = Panel("Cost by Discipline")
        self.cost = ChartCanvas(5, 3.0)
        self.p_cost.add(self.cost, 1)
        bot.addWidget(self.p_cost, 5)
        L.addLayout(bot)

    def _card(self, key: str):
        if key == "risks":
            self.app.goto("Risks")
        else:
            self.app.drill(key)

    def refresh(self):
        d = self.app.dash
        ctx = d.ctx
        k = d.kpis
        pa, pp, pv = k["progress_actual"], k["progress_planned"], k["progress_variance"]
        self.c_prog.set_main(pa, unit="actual (weighted)")
        self.c_prog.set_lines([("Actual", pa.display, None), ("Planned", pp.display, None),
                               ("Variance", pv.display, S.STATUS_COLORS.get(pv.status))])
        sv = k["sched_var"]
        self.c_sched.set_main(sv, unit=sv.extra.get("label", ""))
        self.c_sched.set_lines([("Baseline Finish", k["bl_finish"].display, None), ("Forecast Finish", k["fc_finish"].display, None)])
        spi = k["spi"]
        self.c_spi.set_main(spi, unit="cost-based (EV/PV)" if "EV / PV" in spi.formula else "progress-based")
        self.c_cpi.set_main(k["cpi"], unit="EV / AC")
        cr = k["cp_critical"]
        self.c_crit.set_main(cr, unit="critical activities")
        self.c_crit.set_lines([("Longest Path", k["cp_longest"].display, None), ("Near-critical", k["cp_near"].display, None),
                               ("Negative float", k["cp_negative"].display, S.CRITICAL if k["cp_negative"].value else None),
                               ("Path total float", k["cp_path_float"].display, None)])
        rk = k["risks"]
        if rk.available:
            self.c_risk.key = "risks"
            self.c_risk.set_main(rk, unit="open risks")
            c = rk.extra
            self.c_risk.set_lines([("Very High", str(c.get("Very High", 0)), S.CRITICAL), ("High", str(c.get("High", 0)), S.SERIOUS),
                                   ("Medium", str(c.get("Medium", 0)), None), ("Low", str(c.get("Low", 0)), S.GOOD)])
        else:
            self.c_risk.set_main(rk)
            self.c_risk.key = "risks"
            self.c_risk.set_lines([])
        self.gantt.set_rows(ctx, d.rows, max_depth=2, expand_depth=1)
        fig = self.sc.clear()
        C.draw_s_curve(fig.add_subplot(111), d.s_curve)
        self.sc.set_hover(s_curve_hover(d.s_curve))
        self.sc.draw()
        fig = self.risk.clear()
        C.draw_heatmap(fig.add_subplot(111), d.risk, ctx.settings.risk_bands)
        self.risk.draw()
        fig = self.proc.clear()
        ax = fig.add_subplot(111)
        proc = d.phases.get("Procurement")
        if proc and proc["count"]:
            pr = proc["progress"]["actual"]
            C.draw_donut(ax, proc["bucket_pct"], "N/A" if pr is None else f"{pr:.0f}%", "Procurement progress")
            C.donut_legend(ax, proc["bucket_pct"])
        else:
            C.no_data(ax, "No activities mapped to Procurement")
        self.proc.draw()
        fig = self.phase.clear()
        C.draw_phase_progress(fig.add_subplot(111), d.phases)
        self.phase.draw()
        self.p_look.title.setText(f"Lookahead (Next {ctx.settings.lookahead_weeks} Weeks)")
        self.look.set_rows(d.lookahead, ctx.data_date)
        fig = self.cost.clear()
        C.draw_cost(fig.add_subplot(111), d.cost)
        self.cost.draw()
        self.p_cost.title.setText(f"Cost by {d.cost.get('dimension', 'Discipline')}")


class SchedulePage(Page):
    title = "Schedule"

    def __init__(self, app):
        super().__init__(app)
        self.layout_.addWidget(page_title("Primavera P6 Schedule",
                                          "Expandable WBS hierarchy with baseline, actual, remaining and critical bars. "
                                          "Summary rows show weighted % complete. Double-click an activity for details and logic."))
        self.gantt = GanttView()
        self.gantt.activated.connect(app.show_activity)
        self.layout_.addWidget(self.gantt, 1)

    def refresh(self):
        self.gantt.set_rows(self.app.dash.ctx, self.app.dash.rows, expand_depth=2)


class SCurvePage(Page):
    title = "S-Curve"

    def __init__(self, app):
        super().__init__(app)
        top = QHBoxLayout()
        top.addWidget(page_title("Progress S-Curve", "Baseline Planned vs Actual vs Forecast. Use the toolbar to zoom/pan; hover for values."))
        top.addStretch(1)
        top.addWidget(QLabel("Period:"))
        self.period = QComboBox()
        self.period.addItems(["Monthly", "Weekly"])
        self.period.currentTextChanged.connect(lambda _: self.refresh())
        top.addWidget(self.period)
        self.layout_.addLayout(top)
        self.chart = ChartCanvas(10, 5, toolbar=True)
        self.layout_.addWidget(self.chart, 3)
        self.note = QLabel()
        self.note.setObjectName("Hint")
        self.note.setWordWrap(True)
        self.layout_.addWidget(self.note)
        from PySide6.QtWidgets import QTableWidget
        self.table = QTableWidget()
        self.layout_.addWidget(self.table, 2)

    def refresh(self):
        d = self.app.dash
        sc = MX.s_curve(d.ctx, d.rows, self.period.currentText())
        fig = self.chart.clear()
        C.draw_s_curve(fig.add_subplot(111), sc)
        self.chart.set_hover(s_curve_hover(sc))
        self.chart.draw()
        self.note.setText(f"Weighting: {sc.get('weighting')} · Measure: {sc.get('measure')}. {sc.get('note', '')}")
        from PySide6.QtWidgets import QTableWidgetItem
        dates = sc.get("dates", [])
        self.table.setRowCount(4)
        self.table.setColumnCount(len(dates))
        self.table.setVerticalHeaderLabels(["Baseline Planned %", "Actual %", "Forecast %", "Period Planned %"])
        self.table.setHorizontalHeaderLabels([x.strftime("%d-%b-%y") for x in dates])
        prev = 0.0
        for j in range(len(dates)):
            for i, key in enumerate(("planned", "actual", "forecast")):
                v = sc[key][j]
                self.table.setItem(i, j, QTableWidgetItem("" if v is None else f"{v:.1f}"))
            p = sc["planned"][j] or 0.0
            self.table.setItem(3, j, QTableWidgetItem(f"{p - prev:.1f}"))
            prev = p
        self.table.resizeColumnsToContents()


class CriticalPage(Page):
    title = "Critical Path"

    def __init__(self, app):
        super().__init__(app)
        self.layout_.addWidget(page_title("Critical Path Analysis"))
        self.info = QLabel()
        self.info.setWordWrap(True)
        self.info.setObjectName("Hint")
        self.layout_.addWidget(self.info)
        row = QHBoxLayout()
        self.cards = {}
        for key, title in (("cp_critical", "Critical"), ("cp_longest", "Longest Path"), ("cp_near", "Near-Critical"),
                           ("cp_negative", "Negative Float"), ("cp_crit_ms", "Critical Milestones"), ("cp_path_float", "Path Float")):
            c = KpiCard(title)
            c.setMinimumHeight(90)
            c.clicked.connect(app.drill)
            row.addWidget(c)
            self.cards[key] = c
        self.layout_.addLayout(row)
        self.tabs = QTabWidget()
        self.chain = ActivityTable(["code", "name", "wbs", "start", "finish", "rem", "tf", "finish_var", "status"], export_name="longest_path")
        self.chain.activated.connect(app.show_activity)
        self.tabs.addTab(self.chain, "Longest Path (logical chain to completion)")
        self.crit = ActivityTable(CRIT_COLS, export_name="critical")
        self.crit.activated.connect(app.show_activity)
        self.tabs.addTab(self.crit, "Critical")
        self.near = ActivityTable(CRIT_COLS, export_name="near_critical")
        self.near.activated.connect(app.show_activity)
        self.tabs.addTab(self.near, "Near-Critical")
        self.neg = ActivityTable(CRIT_COLS, export_name="negative_float")
        self.neg.activated.connect(app.show_activity)
        self.tabs.addTab(self.neg, "Negative Float")
        self.changes = QTextBrowser()
        self.tabs.addTab(self.changes, "Critical Path Changes vs Baseline")
        self.layout_.addWidget(self.tabs, 1)

    def refresh(self):
        d = self.app.dash
        ctx = d.ctx
        ci = ctx.critical_info
        self.info.setText(f"<b>Critical definition:</b> {ci['source']}. <b>Longest Path:</b> {ci['longest_path_source']}. "
                          f"<b>Near-critical:</b> Total Float ≤ {ci['near_days']:g} days. " + " ".join(ci["notes"]))
        for k, c in self.cards.items():
            c.set_main(d.kpis[k])
        idx = ctx.row_by_key()
        shown = {r.key for r in d.rows}
        chain = [idx[k] for k in ci["chain"] if k in shown]
        self.chain.set_rows(chain, ctx.data_date)
        self.crit.set_rows([r for r in d.rows if r.is_critical], ctx.data_date)
        self.near.set_rows([r for r in d.rows if r.is_near_critical], ctx.data_date)
        self.neg.set_rows([r for r in d.rows if r.tf_d is not None and r.tf_d < 0], ctx.data_date)
        cp = self.app.cache.cp_changes
        html = (f"<p>Baseline longest path source: {cp['baseline_source']}</p>"
                f"<h4>New on the Longest Path ({len(cp['added'])})</h4><p>{', '.join(cp['added']) or '-'}</p>"
                f"<h4>No longer on the Longest Path, still open ({len(cp['removed'])})</h4><p>{', '.join(cp['removed']) or '-'}</p>"
                f"<h4>Baseline Longest Path activities now complete ({len(cp['completed'])})</h4><p>{', '.join(cp['completed']) or '-'}</p>"
                f"<h4>Baseline Longest Path activities not in current ({len(cp['not_in_current'])})</h4><p>{', '.join(cp['not_in_current']) or '-'}</p>"
                f"<h4>Unchanged ({len(cp['unchanged'])})</h4><p>{', '.join(cp['unchanged']) or '-'}</p>")
        self.changes.setHtml(html)


class BaselinePage(Page):
    title = "Baseline Comparison"

    def __init__(self, app):
        super().__init__(app)
        self.layout_.addWidget(page_title("Baseline vs Current", "Structural changes, date variances and reconciliation results. Select a category to drill down."))
        tabs = QTabWidget()
        split = QSplitter()
        self.cats = QListWidget()
        self.cats.setMaximumWidth(260)
        self.cats.currentItemChanged.connect(self._show)
        split.addWidget(self.cats)
        from PySide6.QtWidgets import QTableWidget
        self.detail = QTableWidget()
        self.detail.cellDoubleClicked.connect(self._dbl)
        split.addWidget(self.detail)
        split.setStretchFactor(1, 1)
        tabs.addTab(split, "Change Analysis")
        self.top = ActivityTable(["code", "name", "wbs", "bl_start", "bl_finish", "start", "finish", "start_var", "finish_var", "dur_var", "tf", "status"], export_name="top_delayed")
        self.top.activated.connect(app.show_activity)
        tabs.addTab(self.top, "Top Delayed Activities")
        self.topms = ActivityTable(["code", "name", "bl_finish", "finish", "finish_var", "tf", "status"], export_name="top_delayed_milestones")
        self.topms.activated.connect(app.show_activity)
        tabs.addTab(self.topms, "Top Delayed Milestones")
        self.wbs = QTableWidget()
        tabs.addTab(self.wbs, "WBS Variance")
        self.drivers = ActivityTable(["code", "name", "bl_finish", "finish", "finish_var", "tf", "status"], export_name="delay_drivers")
        self.drivers.activated.connect(app.show_activity)
        tabs.addTab(self.drivers, "Activities Driving Completion Delay")
        self.layout_.addWidget(tabs, 1)
        self._items = {}

    def refresh(self):
        d = self.app.dash
        ch = self.app.cache.changes
        self.cats.clear()
        for cat, items in ch.items():
            it = QListWidgetItem(f"{cat}  ({len(items)})")
            it.setData(Qt.UserRole, cat)
            self.cats.addItem(it)
        self._changes = ch
        self.cats.setCurrentRow(0)
        dd = d.ctx.data_date
        self.top.set_rows(d.top_delayed, dd)
        self.topms.set_rows(d.top_delayed_ms, dd)
        from PySide6.QtWidgets import QTableWidgetItem
        self.wbs.setColumnCount(6)
        self.wbs.setHorizontalHeaderLabels(["WBS", "Baseline Finish", "Current Finish", "Variance (d)", "Activities", "Delayed"])
        self.wbs.setRowCount(len(d.wbs_variance))
        for i, g in enumerate(d.wbs_variance):
            for j, v in enumerate([g["wbs"], fmt_date(g["bl_finish"]), fmt_date(g["finish"]),
                                   "" if g["variance"] is None else f"{g['variance']:+d}", str(g["count"]), str(g["delayed"])]):
                self.wbs.setItem(i, j, QTableWidgetItem(v))
        self.wbs.resizeColumnsToContents()
        self.drivers.set_rows(self.app.rows_for(d.kpis["sched_var"].keys), dd)

    def _show(self, item, _prev=None):
        if item is None:
            return
        from PySide6.QtWidgets import QTableWidgetItem
        cat = item.data(Qt.UserRole)
        rows = self._changes.get(cat, [])
        cols = ["bl_code", "code", "name", "status", "confidence", "detail"]
        self.detail.clear()
        self.detail.setColumnCount(len(cols))
        self.detail.setHorizontalHeaderLabels(["Baseline ID", "Current ID", "Activity Name", "Match Status", "Confidence", "Detail"])
        self.detail.setRowCount(len(rows))
        self._keys = []
        for i, r in enumerate(rows):
            self._keys.append(r["key"])
            for j, c in enumerate(cols):
                v = r[c]
                self.detail.setItem(i, j, QTableWidgetItem(f"{v:.0%}" if c == "confidence" else str(v)))
        self.detail.resizeColumnsToContents()
        self.detail.horizontalHeader().setStretchLastSection(True)

    def _dbl(self, row, _col):
        rows = self.app.rows_for([self._keys[row]])
        if rows:
            self.app.show_activity(rows[0])


class LookaheadPage(Page):
    title = "Lookahead"

    def __init__(self, app):
        super().__init__(app)
        top = QHBoxLayout()
        top.addWidget(page_title("Lookahead", "Incomplete activities starting before the window end and finishing after the Data Date, plus overdue work."))
        top.addStretch(1)
        top.addWidget(QLabel("Window:"))
        self.weeks = QComboBox()
        self.weeks.addItems(["2 Weeks", "4 Weeks", "6 Weeks", "8 Weeks"])
        self.weeks.setCurrentIndex(2)
        self.weeks.currentIndexChanged.connect(lambda _: self.refresh())
        top.addWidget(self.weeks)
        self.layout_.addLayout(top)
        self.summary = QLabel()
        self.layout_.addWidget(self.summary)
        self.table = ActivityTable(LOOK_COLS, export_name="lookahead")
        self.table.activated.connect(app.show_activity)
        self.layout_.addWidget(self.table, 1)

    def refresh(self):
        d = self.app.dash
        w = int(self.weeks.currentText().split()[0])
        rows = MX.lookahead(d.ctx, d.rows, w)
        counts = {}
        for r in rows:
            s = r.display_status(d.ctx.data_date)
            counts[s] = counts.get(s, 0) + 1
        self.summary.setText(f"Data Date {fmt_date(d.ctx.data_date)} → {w} weeks · " +
                             " · ".join(f"<b>{k}</b> {v}" for k, v in sorted(counts.items())))
        self.table.set_rows(rows, d.ctx.data_date)

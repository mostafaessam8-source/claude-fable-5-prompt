"""Drill-down (audit), activity detail and About dialogs."""
from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (QDialog, QDialogButtonBox, QFormLayout, QLabel, QTableWidget, QTableWidgetItem,
                               QTabWidget, QTextBrowser, QVBoxLayout, QWidget)

from .. import APP_NAME, __version__
from ..analysis.context import ActRow
from ..analysis.kpi import KPI
from ..core.dates import fmt_date
from ..core.xer_fields import CONSTRAINTS, TASK_TYPE
from ..mapping.classifier import OVERRIDE
from .widgets.table import ActivityTable


def _esc(s: str) -> str:
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


class DrillDownDialog(QDialog):
    """KPI audit view: source, formula, weighting, data date, baseline, overrides and the activities used."""

    def __init__(self, kpi: KPI, rows: list[ActRow], ctx, parent=None, cols=None, on_activity=None):
        super().__init__(parent)
        self.setWindowTitle(f"Drill-down - {kpi.title}")
        self.resize(1250, 720)
        lay = QVBoxLayout(self)
        head = QLabel(f"<span style='font-size:18pt;font-weight:800;color:#00778B'>{_esc(kpi.display)}</span>"
                      f"&nbsp;&nbsp;<span style='font-size:13pt;font-weight:700'>{_esc(kpi.title)}</span>"
                      + (f" &nbsp;<i>{_esc(kpi.extra.get('label', ''))}</i>" if kpi.extra.get("label") else ""))
        lay.addWidget(head)
        overrides = [r for r in rows if r.phase_level == OVERRIDE or r.match_status == "User Matched"]
        info = QTextBrowser()
        info.setMaximumHeight(210)
        html = "<table cellspacing=4>"
        for k, v in (("Formula", kpi.formula), ("Source", kpi.source), ("Method / weighting", kpi.method),
                     ("Data Date", fmt_date(ctx.data_date, "N/A")),
                     ("Baseline reference", f"{ctx.bl.source_name} (data date {fmt_date(ctx.bl_data_date, 'N/A')})"),
                     ("Current schedule", ctx.cur.source_name),
                     ("Activities included", str(len(rows))),
                     ("Manual overrides affecting these activities",
                      f"{len(overrides)} (mapping/match overrides)" if overrides else "None")):
            if v:
                html += f"<tr><td valign=top><b>{_esc(k)}</b></td><td>{_esc(v)}</td></tr>"
        if kpi.notes:
            html += "<tr><td valign=top><b>Notes</b></td><td>" + "<br>".join(_esc(n) for n in kpi.notes) + "</td></tr>"
        if kpi.extra:
            ex = ", ".join(f"{k}: {v:,.2f}" if isinstance(v, float) else f"{k}: {v}" for k, v in kpi.extra.items())
            html += f"<tr><td><b>Values</b></td><td>{_esc(ex)}</td></tr>"
        html += "</table>"
        info.setHtml(html)
        lay.addWidget(info)
        table = ActivityTable(cols, export_name=kpi.key)
        table.set_rows(rows, ctx.data_date)
        if on_activity:
            table.activated.connect(on_activity)
        lay.addWidget(table, 1)
        bb = QDialogButtonBox(QDialogButtonBox.Close)
        bb.rejected.connect(self.reject)
        lay.addWidget(bb)


class ActivityDetailDialog(QDialog):
    def __init__(self, ctx, r: ActRow, parent=None):
        super().__init__(parent)
        self.setWindowTitle(f"{r.code} - {r.name}")
        self.resize(900, 640)
        lay = QVBoxLayout(self)
        t = QLabel(f"<b style='font-size:13pt'>{_esc(r.code)} &nbsp; {_esc(r.name)}</b><br>"
                   f"<span style='color:#52514E'>{_esc(r.wbs_path)}</span>")
        lay.addWidget(t)
        tabs = QTabWidget()
        lay.addWidget(tabs, 1)
        # comparison
        cmp = QTableWidget()
        fields = [("Original Duration (d)", r.bl_dur_d, r.orig_dur_d), ("Remaining Duration (d)", None, r.rem_dur_d),
                  ("Start", r.bl_start, r.start), ("Finish", r.bl_finish, r.finish),
                  ("Actual Start", None, r.cur.act_start if r.cur else None),
                  ("Actual Finish", None, r.cur.act_finish if r.cur else None),
                  ("% Complete", None, f"{r.pct:.1f}% ({ctx.measure})" if r.cur else None),
                  ("Total Float (d)", r.bl_ref and ctx.bl.hours_to_days(r.bl_ref.total_float_hours, r.bl_ref), r.tf_d),
                  ("Free Float (d)", None, r.ff_d),
                  ("Activity Type", TASK_TYPE.get(r.bl_ref.task_type, "") if r.bl_ref else None,
                   TASK_TYPE.get(r.cur.task_type, "") if r.cur else None),
                  ("Constraint", _cstr(r.bl_ref), _cstr(r.cur)),
                  ("Calendar", ctx.bl.calendar(r.bl_ref).name if r.bl_ref else None, ctx.cur.calendar(r.cur).name if r.cur else None),
                  ("Budget Cost", r.bl_ref.budget_cost if r.bl_ref else None, r.cur.budget_cost if r.cur else None),
                  ("Actual Cost", None, r.cur.actual_cost if r.cur else None),
                  ("Weight", r.bl_weight, r.weight),
                  ("Start Variance (d)", None, r.start_var_d), ("Finish Variance (d)", None, r.finish_var_d),
                  ("Status", None, r.display_status(ctx.data_date)),
                  ("Critical / Longest Path", None, f"{'Critical' if r.is_critical else 'Not critical'} / "
                                                    f"{'on Longest Path' if r.is_longest_path else 'not on Longest Path'}")]
        cmp.setColumnCount(3)
        cmp.setHorizontalHeaderLabels(["Field", "Baseline", "Current"])
        cmp.setRowCount(len(fields))
        for i, (k, b, c) in enumerate(fields):
            for j, v in enumerate((k, b, c)):
                cmp.setItem(i, j, QTableWidgetItem(_fmt(v)))
        cmp.resizeColumnsToContents()
        cmp.horizontalHeader().setStretchLastSection(True)
        tabs.addTab(cmp, "Baseline vs Current")
        # mapping & match
        mp = QTextBrowser()
        html = (f"<h3>Classification: {_esc(r.phase or 'Not Mapped')} ({r.phase_conf:.0%}, {r.phase_level})</h3>"
                f"<p><b>Stage:</b> {_esc(r.stage or '-')}</p><p><b>Evidence</b></p><ul>"
                + "".join(f"<li>{_esc(e)}</li>" for e in r.phase_evidence) + "</ul>"
                + "<p><b>Dimensions</b>: " + _esc(", ".join(f"{k}: {v}" for k, v in r.dims.items()) or "none") + "</p>"
                + f"<h3>Baseline match: {_esc(r.match_status)} ({r.match_conf:.0%})</h3><ul>"
                + "".join(f"<li>{_esc(c)}</li>" for c in r.match_changes) + "</ul>")
        if r.cur is not None:
            codes = [f"{ctx.cur.code_types[t].name}: {ctx.cur.code_values[v].value} ({ctx.cur.code_values[v].description})"
                     for t, v in r.cur.codes.items() if t in ctx.cur.code_types and v in ctx.cur.code_values]
            html += "<p><b>Activity codes</b><br>" + "<br>".join(_esc(c) for c in codes) + "</p>"
            if r.cur.udfs:
                html += "<p><b>UDFs</b><br>" + "<br>".join(_esc(f"{k}: {v}") for k, v in r.cur.udfs.items()) + "</p>"
        mp.setHtml(html)
        tabs.addTab(mp, "Mapping & Match")
        # logic
        lg = QTableWidget()
        rels = []
        if r.cur is not None:
            for rel in ctx.cur.preds(r.cur.task_id):
                p = ctx.cur.activities.get(rel.pred_id)
                rels.append(("Predecessor", p.code if p else "(external)", p.name if p else "", rel.type,
                             ctx.cur.hours_to_days(rel.lag_hours, r.cur), p.status if p else ""))
            for rel in ctx.cur.succs(r.cur.task_id):
                s = ctx.cur.activities.get(rel.succ_id)
                rels.append(("Successor", s.code if s else "(external)", s.name if s else "", rel.type,
                             ctx.cur.hours_to_days(rel.lag_hours, r.cur), s.status if s else ""))
        lg.setColumnCount(6)
        lg.setHorizontalHeaderLabels(["Relation", "Activity ID", "Activity Name", "Type", "Lag (d)", "Status"])
        lg.setRowCount(len(rels))
        for i, row in enumerate(rels):
            for j, v in enumerate(row):
                lg.setItem(i, j, QTableWidgetItem(_fmt(v)))
        lg.resizeColumnsToContents()
        tabs.addTab(lg, f"Logic ({len(rels)})")
        bb = QDialogButtonBox(QDialogButtonBox.Close)
        bb.rejected.connect(self.reject)
        lay.addWidget(bb)


def _cstr(a):
    if a is None or not a.cstr_type:
        return "None" if a is not None else None
    return f"{CONSTRAINTS.get(a.cstr_type, (a.cstr_type,))[0]} {fmt_date(a.cstr_date)}"


def _fmt(v):
    if v is None:
        return ""
    if hasattr(v, "strftime"):
        return fmt_date(v)
    if isinstance(v, float):
        return f"{v:,.1f}"
    return str(v)


class AboutDialog(QDialog):
    def __init__(self, log_path: str, parent=None):
        super().__init__(parent)
        self.setWindowTitle(f"About {APP_NAME}")
        lay = QVBoxLayout(self)
        lbl = QLabel(
            f"<p style='font-size:22pt;font-weight:800;color:#00778B;margin:0'>SAR</p>"
            f"<p style='font-size:13pt;font-weight:700'>{APP_NAME}</p>"
            f"<p>Version {__version__}</p>"
            "<p>Primavera P6 XER analyzer - Approved Baseline vs Current Update.<br>"
            "Runs fully offline: schedule data never leaves this computer.</p>"
            f"<p><b>Error log:</b> {_esc(log_path)}</p>"
            "<p>Primavera and P6 are trademarks of Oracle. This application does not require Primavera P6.</p>")
        lbl.setTextInteractionFlags(Qt.TextSelectableByMouse)
        lbl.setWordWrap(True)
        lay.addWidget(lbl)
        bb = QDialogButtonBox(QDialogButtonBox.Ok)
        bb.accepted.connect(self.accept)
        lay.addWidget(bb)

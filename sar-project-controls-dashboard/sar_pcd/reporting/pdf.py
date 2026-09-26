"""PDF reports (ReportLab): Executive Dashboard and Full Project Controls Report,
A4 or A3 landscape, with a SAR cover page."""
from __future__ import annotations

import io
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A3, A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (Image, NextPageTemplate, PageBreak, PageTemplate, Paragraph, Spacer, Table,
                                TableStyle)
from reportlab.platypus.doctemplate import BaseDocTemplate
from reportlab.platypus.frames import Frame

from .. import APP_NAME, __version__
from ..analysis.columns import COLUMNS
from ..analysis.methodology import METHODOLOGY
from ..core.dates import fmt_date
from . import charts as C
from . import dashboard_image
from . import style as S

BLUE = colors.HexColor(S.SAR_BLUE)
BLACK = colors.HexColor(S.SAR_BLACK)
GREY = colors.HexColor(S.TEXT_2)

_ss = getSampleStyleSheet()
H1 = ParagraphStyle("h1", parent=_ss["Heading1"], textColor=BLUE, fontSize=16, spaceAfter=6)
H2 = ParagraphStyle("h2", parent=_ss["Heading2"], textColor=BLACK, fontSize=12, spaceBefore=8, spaceAfter=4)
BODY = ParagraphStyle("body", parent=_ss["BodyText"], fontSize=8.5, leading=11)
SMALL = ParagraphStyle("small", parent=BODY, fontSize=7, leading=8.5)
CELL = ParagraphStyle("cell", parent=BODY, fontSize=7, leading=8.5)


def _fig_image(fig, width, dpi=160) -> Image:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=dpi, facecolor=fig.get_facecolor())
    buf.seek(0)
    w, h = fig.get_size_inches()
    return Image(buf, width=width, height=width * h / w)


def _table(data, col_widths=None, header_rows=1, zebra=True) -> Table:
    t = Table(data, colWidths=col_widths, repeatRows=header_rows)
    st = [("BACKGROUND", (0, 0), (-1, header_rows - 1), BLUE), ("TEXTCOLOR", (0, 0), (-1, header_rows - 1), colors.white),
          ("FONTNAME", (0, 0), (-1, header_rows - 1), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 7),
          ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor(S.BORDER)), ("VALIGN", (0, 0), (-1, -1), "TOP"),
          ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]
    if zebra:
        for i in range(header_rows, len(data)):
            if i % 2 == 0:
                st.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#F4F7F8")))
    t.setStyle(TableStyle(st))
    return t


def _rows_table(rows, cols, dd, width, limit=60):
    data = [[COLUMNS[c][0] for c in cols]]
    for r in rows[:limit]:
        line = []
        for c in cols:
            _h, fn, kind = COLUMNS[c]
            v = fn(r, dd)
            if v is None:
                s = ""
            elif kind == "date":
                s = fmt_date(v)
            elif kind == "pct":
                s = f"{v:.0f}%"
            elif kind in ("num",):
                s = f"{v:.0f}"
            elif kind == "var":
                s = f"{v:+.0f}"
            elif kind == "money":
                s = f"{v:,.0f}"
            else:
                s = str(v)
            line.append(Paragraph(s, CELL) if c in ("name", "wbs") else s)
        data.append(line)
    weights = {"name": 3.2, "wbs": 2.6}
    tot = sum(weights.get(c, 1) for c in cols)
    widths = [width * weights.get(c, 1) / tot for c in cols]
    items = [_table(data, widths)]
    if len(rows) > limit:
        items.append(Paragraph(f"Showing {limit} of {len(rows)} activities - the complete list is in the Excel export.", SMALL))
    return items


class _Doc(BaseDocTemplate):
    def __init__(self, path, pagesize, d, title):
        super().__init__(path, pagesize=pagesize, leftMargin=12 * mm, rightMargin=12 * mm, topMargin=18 * mm,
                         bottomMargin=12 * mm, title=title, author=APP_NAME)
        self.d = d
        self.report_title = title
        fr = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="f")
        cover = Frame(0, 0, pagesize[0], pagesize[1], id="c", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        self.addPageTemplates([PageTemplate("cover", [cover], onPage=self._cover),
                               PageTemplate("body", [fr], onPage=self._decor)])

    def _cover(self, c, doc):
        w, h = self.pagesize
        ctx = self.d.ctx
        c.setFillColor(colors.HexColor(S.PAGE_BG))
        c.rect(0, 0, w, h, fill=1, stroke=0)
        c.setFillColor(BLUE)
        c.rect(0, h * 0.55, w, h * 0.45, fill=1, stroke=0)
        # converging track motif
        c.setStrokeColor(colors.HexColor("#1B93A6"))
        c.setLineWidth(3)
        for i in range(6):
            c.line(w * 0.55 + i * 40, h * 0.55, w * 0.80 + i * 12, h)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 54)
        c.drawString(25 * mm, h * 0.80, "SAR")
        c.setFont("Helvetica-Bold", 26)
        c.drawString(25 * mm, h * 0.70, "PROJECT CONTROLS")
        c.setFont("Helvetica", 18)
        c.drawString(25 * mm, h * 0.64, self.report_title.upper())
        c.setFillColor(BLACK)
        c.setFont("Helvetica-Bold", 20)
        c.drawString(25 * mm, h * 0.46, ctx.cur.project.name)
        c.setFont("Helvetica", 11)
        dd = ctx.data_date
        lines = [("Project ID", ctx.cur.project.short_name), ("Data Date", fmt_date(dd, "N/A")),
                 ("Report Period", dd.strftime("%B %Y") if dd else "N/A"),
                 ("Generated", datetime.now().strftime("%d %b %Y %H:%M")),
                 ("Current Schedule XER", ctx.cur.source_name), ("Approved Baseline XER", ctx.bl.source_name),
                 ("Filter", self.d.filt.describe())]
        y = h * 0.40
        for k, v in lines:
            c.setFillColor(GREY)
            c.drawString(25 * mm, y, k)
            c.setFillColor(BLACK)
            c.drawString(80 * mm, y, str(v))
            y -= 16
        c.setFont("Helvetica", 8)
        c.setFillColor(GREY)
        c.drawString(25 * mm, 12 * mm, f"Generated by {APP_NAME} v{__version__} - figures are traceable to the source XER files listed above.")

    def _decor(self, c, doc):
        w, h = self.pagesize
        ctx = self.d.ctx
        c.setFillColor(BLUE)
        c.rect(0, h - 11 * mm, w, 11 * mm, fill=1, stroke=0)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 12)
        c.drawString(12 * mm, h - 7.5 * mm, "SAR  |  PROJECT CONTROLS")
        c.setFont("Helvetica", 9)
        c.drawRightString(w - 12 * mm, h - 7.5 * mm, f"{ctx.cur.project.name}  ·  Data Date {fmt_date(ctx.data_date, 'N/A')}")
        c.setFillColor(GREY)
        c.setFont("Helvetica", 7)
        c.drawString(12 * mm, 6 * mm, f"{self.report_title} · {ctx.cur.source_name} vs {ctx.bl.source_name}")
        c.drawRightString(w - 12 * mm, 6 * mm, f"Page {doc.page}")


def _pagesize(size: str):
    return landscape(A3 if size.upper() == "A3" else A4)


def _kpi_table(d, width):
    data = [["KPI", "Value", "Formula", "Source / Notes"]]
    for k in ("progress_actual", "progress_planned", "progress_variance", "spi", "cpi", "bl_finish", "fc_finish",
              "sched_var", "cp_critical", "cp_longest", "cp_near", "cp_negative", "cp_path_float", "risks"):
        v = d.kpis.get(k)
        if v is None:
            continue
        disp = v.display + (f" {v.extra.get('label', '')}" if k == "sched_var" and v.available else "")
        data.append([v.title, disp, Paragraph(v.formula, CELL), Paragraph((v.source + " " + " ".join(v.notes[:2])).strip(), CELL)])
    return _table(data, [width * 0.16, width * 0.1, width * 0.37, width * 0.37])


def executive_pdf(path, d, size="A3"):
    doc = _Doc(path, _pagesize(size), d, "Executive Dashboard")
    story = [NextPageTemplate("body"), PageBreak()]
    fig = dashboard_image.render(d, width=16.5, height=10.5)
    story.append(_fig_image(fig, doc.width, dpi=170 if size.upper() == "A3" else 150))
    story += [PageBreak(), Paragraph("KPI Audit Summary", H1), _kpi_table(d, doc.width),
              Spacer(1, 6), Paragraph("Method: " + " ".join(d.ctx.method_notes), SMALL)]
    doc.build(story)


def full_pdf(path, d, cache, size="A3", audit: list | None = None):
    ctx = d.ctx
    doc = _Doc(path, _pagesize(size), d, "Full Project Controls Report")
    W = doc.width
    dd = ctx.data_date
    story = [NextPageTemplate("body"), PageBreak()]
    story.append(_fig_image(dashboard_image.render(d), W, 150))
    story += [PageBreak(), Paragraph("1. Executive KPI Summary", H1), _kpi_table(d, W)]
    story += [Spacer(1, 6), Paragraph("Method notes", H2)] + [Paragraph(n, BODY) for n in ctx.method_notes]
    # progress & S-curve
    story += [PageBreak(), Paragraph("2. Progress and S-Curve", H1)]
    fig = C.figure(14, 4.6)
    C.draw_s_curve(fig.add_subplot(1, 2, 1), d.s_curve)
    C.draw_phase_progress(fig.add_subplot(1, 2, 2), d.phases)
    fig.tight_layout()
    story.append(_fig_image(fig, W))
    if d.s_curve.get("note"):
        story.append(Paragraph(d.s_curve["note"], SMALL))
    # schedule & critical path
    story += [PageBreak(), Paragraph("3. Schedule and Critical Path", H1),
              Paragraph(f"Critical definition: {ctx.critical_info['source']}. Longest Path source: "
                        f"{ctx.critical_info['longest_path_source']}.", BODY)]
    cp = [r for r in d.rows if r.is_longest_path]
    cp.sort(key=lambda r: (r.start or dd))
    story += [Paragraph("Longest Path", H2)] + _rows_table(cp, ["code", "name", "start", "finish", "rem", "tf", "finish_var", "status"], dd, W)
    story += [Paragraph("Top Delayed Activities (finish variance vs baseline)", H2)] + _rows_table(
        d.top_delayed, ["code", "name", "wbs", "bl_finish", "finish", "finish_var", "tf", "status"], dd, W, 25)
    wv = [["WBS", "Baseline Finish", "Current Finish", "Variance (d)", "Activities", "Delayed"]]
    for g in d.wbs_variance:
        wv.append([g["wbs"], fmt_date(g["bl_finish"]), fmt_date(g["finish"]), "" if g["variance"] is None else f"{g['variance']:+d}",
                   g["count"], g["delayed"]])
    story += [Paragraph("WBS Variance (level 1)", H2), _table(wv, [W * 0.35] + [W * 0.13] * 5)]
    # milestones
    ms = [["Activity ID", "Milestone", "Baseline", "Current", "Variance (d)", "Status"]]
    for m in d.milestones:
        ms.append([m["code"], Paragraph(m["name"], CELL), fmt_date(m["bl_date"]), fmt_date(m["date"]),
                   "" if m["variance"] is None else f"{m['variance']:+.0f}", m["status"]])
    story += [PageBreak(), Paragraph("4. Milestones", H1), _table(ms, [W * 0.12, W * 0.4, W * 0.12, W * 0.12, W * 0.1, W * 0.14])]
    # lookahead
    story += [Paragraph(f"5. Lookahead - next {ctx.settings.lookahead_weeks} weeks", H1)] + _rows_table(
        d.lookahead, ["code", "name", "wbs", "discipline", "start", "finish", "pct", "tf", "status"], dd, W, 80)
    # disciplines
    story += [PageBreak(), Paragraph("6. Engineering, Procurement and Construction", H1)]
    for ph in ctx.profile.category_names:
        s = d.phases.get(ph)
        if not s or not s["count"]:
            continue
        p = s["progress"]
        story.append(Paragraph(f"{ph}: {s['count']} activities · actual {p['actual'] or 0:.1f}% vs planned "
                               f"{p['planned'] or 0:.1f}% · completed {len(s['buckets']['Completed'])}, in progress "
                               f"{len(s['buckets']['In Progress'])}, not started {len(s['buckets']['Not Started'])}, "
                               f"delayed {len(s['buckets']['Delayed'])}, critical {len(s['critical'])}", BODY))
        if s["stages"] and ph in ("Procurement", "Engineering"):
            st = [["Stage", "Activities", "Completed", "In Progress", "Delayed", "Progress"]]
            for g in s["stages"]:
                st.append([g["stage"], g["count"], g["completed"], g["in_progress"], g["delayed"],
                           "" if g["progress"] is None else f"{g['progress']:.0f}%"])
            story.append(_table(st, [W * 0.3] + [W * 0.14] * 5))
        story.append(Spacer(1, 4))
    # cost
    story += [PageBreak(), Paragraph("7. Cost / Earned Value", H1)]
    e = d.evm
    if e.get("available"):
        from ..analysis.kpi import fmt_money
        ev = [["BAC", "PV", "EV", "AC", "SV", "CV", "SPI", "CPI", "EAC", "ETC", "VAC"],
              [fmt_money(e.get(k)) if k not in ("SPI", "CPI") else ("N/A" if e.get(k) is None else f"{e[k]:.2f}")
               for k in ("BAC", "PV", "EV", "AC", "SV", "CV", "SPI", "CPI", "EAC", "ETC", "VAC")]]
        story.append(_table(ev, [W / 11] * 11))
    for n in e.get("notes", []):
        story.append(Paragraph(n, SMALL))
    fig = C.figure(12, 3.6)
    C.draw_cost(fig.add_subplot(1, 1, 1), d.cost)
    fig.tight_layout()
    story.append(_fig_image(fig, W * 0.8))
    # baseline comparison
    story += [PageBreak(), Paragraph("8. Baseline vs Current Changes", H1)]
    ch = [["Change category", "Count"]] + [[k, len(v)] for k, v in cache.changes.items()]
    story.append(_table(ch, [W * 0.3, W * 0.1]))
    for cat in ("Added Activities", "Deleted Activities", "Split Activities", "Renamed / Re-coded", "Changed Durations",
                "Changed Logic", "Changed Constraints"):
        items = cache.changes.get(cat) or []
        if not items:
            continue
        data = [["Baseline ID", "Current ID", "Activity", "Detail"]]
        for it in items[:40]:
            data.append([it["bl_code"], it["code"], Paragraph(it["name"], CELL), Paragraph(it["detail"], CELL)])
        story += [Paragraph(cat, H2), _table(data, [W * 0.1, W * 0.1, W * 0.35, W * 0.45])]
    # health
    story += [PageBreak(), Paragraph("9. Schedule Health", H1)]
    hc = [["Check", "Name", "Population", "Count", "Metric", "Threshold", "Result", "Basis"]]
    for c in cache.health:
        hc.append([c.id, Paragraph(c.name, CELL), c.population, c.count, c.metric_display, c.threshold, c.result, Paragraph(c.basis, CELL)])
    story.append(_table(hc, [W * 0.07, W * 0.2, W * 0.08, W * 0.07, W * 0.08, W * 0.09, W * 0.1, W * 0.31]))
    findings, score = cache.validation
    story += [Paragraph(f"10. Data Validation (score {score}/100 = 100 − listed penalties)", H1)]
    vf = [["Severity", "Category", "Finding", "Count", "Penalty"]]
    for f in findings:
        vf.append([f.severity, f.category, Paragraph(f.message, CELL), f.count, f"{f.penalty:.1f}"])
    story.append(_table(vf, [W * 0.08, W * 0.15, W * 0.6, W * 0.07, W * 0.08]))
    # methodology & audit
    story += [PageBreak(), Paragraph("Appendix A - Calculation Methodology", H1)]
    md = [["KPI", "Formula", "Notes"]] + [[Paragraph(k, CELL), Paragraph(f, CELL), Paragraph(n, CELL)] for k, f, n in METHODOLOGY]
    story.append(_table(md, [W * 0.15, W * 0.4, W * 0.45]))
    if audit:
        story += [Paragraph("Appendix B - Audit Trail (latest 60 entries)", H1)]
        at = [["Time", "User", "Action", "Target", "Change / Note"]]
        for a in audit[:60]:
            at.append([a["time"], a["user"], a["action"], Paragraph(str(a["target"]), CELL),
                       Paragraph((a["new"] or a["note"] or "")[:300], CELL)])
        story.append(_table(at, [W * 0.13, W * 0.08, W * 0.15, W * 0.2, W * 0.44]))
    doc.build(story)

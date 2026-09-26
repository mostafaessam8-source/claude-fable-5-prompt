"""Static executive dashboard composition (PDF page and high-resolution PNG)."""
from __future__ import annotations

from matplotlib.gridspec import GridSpec
from matplotlib.patches import FancyBboxPatch

from ..core.dates import fmt_date
from . import charts as C
from . import style as S


def _tile(fig, rect, title, value, lines, color, sub="", lx=0.53):
    ax = fig.add_axes(rect)
    ax.set_axis_off()
    ax.add_patch(FancyBboxPatch((0.01, 0.02), 0.98, 0.96, boxstyle="round,pad=0.0,rounding_size=0.04",
                                fc="white", ec=S.BORDER, transform=ax.transAxes))
    ax.text(0.06, 0.84, title, fontsize=10, fontweight="bold", color=S.SAR_BLACK, transform=ax.transAxes)
    ax.text(0.06, 0.52, value, fontsize=19, fontweight="bold", color=color, transform=ax.transAxes, va="center")
    if sub:
        ax.text(0.06, 0.30, sub, fontsize=7.5, color=S.TEXT_2, transform=ax.transAxes)
    for i, (k, v) in enumerate(lines):
        y = 0.62 - i * 0.16
        ax.text(lx, y, k, fontsize=7.5, color=S.TEXT_2, transform=ax.transAxes)
        ax.text(0.96, y, v, fontsize=7.5, fontweight="bold", color=S.TEXT, transform=ax.transAxes, ha="right")


def _panel_title(ax, text):
    ax.set_title(text, loc="left", fontsize=10, fontweight="bold", color="white",
                 backgroundcolor=S.SAR_BLUE, pad=6)


def render(d, width=16.5, height=10.5, dpi=110):
    ctx = d.ctx
    k = d.kpis
    fig = C.figure(width, height, dpi)
    fig.patch.set_facecolor(S.PAGE_BG)
    # header
    fig.text(0.012, 0.965, "SAR", fontsize=24, fontweight="bold", color=S.SAR_BLUE, va="center")
    fig.text(0.07, 0.965, "PROJECT CONTROLS DASHBOARD", fontsize=17, fontweight="bold", color=S.SAR_BLACK, va="center")
    p = ctx.cur.project
    fig.text(0.07, 0.938, f"{p.name}  ·  {p.short_name}  ·  Current: {ctx.cur.source_name}  ·  Baseline: {ctx.bl.source_name}"
             f"  ·  Filter: {d.filt.describe()}", fontsize=8, color=S.TEXT_2, va="center")
    fig.text(0.985, 0.965, f"Data Date  {fmt_date(ctx.data_date, 'N/A')}", fontsize=11, fontweight="bold",
             color="white", ha="right", va="center", bbox=dict(boxstyle="round,pad=0.4", fc=S.SAR_BLUE, ec="none"))
    # KPI row
    y0, h = 0.765, 0.145
    w = 0.158
    gap = 0.006
    xs = [0.012 + i * (w + gap) for i in range(6)]
    pa, pp, pv = k["progress_actual"], k["progress_planned"], k["progress_variance"]
    _tile(fig, [xs[0], y0, w, h], "Progress", pa.display, [("Actual", pa.display), ("Planned", pp.display),
                                                           ("Variance", pv.display)], S.SAR_BLACK)
    sv = k["sched_var"]
    label = sv.extra.get("label", "") if sv.available else "N/A"
    _tile(fig, [xs[1], y0, w, h], "Schedule", sv.display if sv.available else "N/A",
          [("Baseline", k["bl_finish"].display), ("Forecast", k["fc_finish"].display)],
          S.STATUS_COLORS[sv.status], label, lx=0.34)
    spi, cpi = k["spi"], k["cpi"]
    _tile(fig, [xs[2], y0, w, h], "SPI", spi.display, [], S.STATUS_COLORS[spi.status],
          "cost-based EV" if "EV / PV" in spi.formula else ("progress-based" if spi.available else ""))
    _tile(fig, [xs[3], y0, w, h], "CPI", cpi.display, [], S.STATUS_COLORS[cpi.status],
          "" if cpi.available else "Cost/Actual data not available")
    cr = k["cp_critical"]
    _tile(fig, [xs[4], y0, w, h], "Critical Path", cr.display,
          [("Longest path", k["cp_longest"].display), ("Neg. float", k["cp_negative"].display),
           ("Path float", k["cp_path_float"].display)], S.CRITICAL if cr.value else S.SAR_BLACK, "critical activities")
    rk = k["risks"]
    if rk.available:
        c = rk.extra
        _tile(fig, [xs[5], y0, w, h], "Risks", rk.display, [("Very High", str(c.get("Very High", 0))),
              ("High", str(c.get("High", 0))), ("Medium", str(c.get("Medium", 0))), ("Low", str(c.get("Low", 0)))],
              S.SAR_BLACK, "open risks")
    else:
        _tile(fig, [xs[5], y0, w, h], "Risks", "N/A", [], S.TEXT_MUTED, "Risk Data Not Available")
    gs = GridSpec(2, 3, figure=fig, left=0.045, right=0.985, bottom=0.06, top=0.71, hspace=0.42, wspace=0.22,
                  width_ratios=[1.35, 1, 1])
    ax = fig.add_subplot(gs[0, 0])
    C.draw_s_curve(ax, d.s_curve)
    _panel_title(ax, " Progress S-Curve ")
    ax = fig.add_subplot(gs[0, 1])
    C.draw_phase_progress(ax, d.phases)
    _panel_title(ax, " Progress by Phase ")
    ax = fig.add_subplot(gs[0, 2])
    proc = d.phases.get("Procurement")
    if proc and proc["count"]:
        pr = proc["progress"]["actual"]
        C.draw_donut(ax, proc["bucket_pct"], "N/A" if pr is None else f"{pr:.0f}%", "Procurement progress")
        C.donut_legend(ax, proc["bucket_pct"])
    else:
        C.no_data(ax, "No procurement activities mapped")
    _panel_title(ax, " Procurement Status ")
    ax = fig.add_subplot(gs[1, 0])
    C.draw_cost(ax, d.cost)
    _panel_title(ax, f" Cost by {d.cost.get('dimension', 'Discipline')} ")
    ax = fig.add_subplot(gs[1, 1])
    C.draw_heatmap(ax, d.risk, ctx.settings.risk_bands)
    _panel_title(ax, " Risk Heatmap ")
    ax = fig.add_subplot(gs[1, 2])
    ax.set_axis_off()
    _panel_title(ax, f" Lookahead (next {ctx.settings.lookahead_weeks} weeks) ")
    la = d.lookahead[:12]
    ax.text(0, 0.98, f"{'ID':<11}{'Activity':<34}{'Start':<13}Status", fontsize=7, fontweight="bold",
            family="monospace", transform=ax.transAxes, va="top")
    for i, r in enumerate(la):
        st = r.display_status(ctx.data_date)
        ax.text(0, 0.90 - i * 0.075, f"{r.code[:10]:<11}{r.name[:32]:<34}{fmt_date(r.start):<13}", fontsize=7,
                family="monospace", transform=ax.transAxes, va="top", color=S.TEXT)
        ax.text(0.86, 0.90 - i * 0.075, st, fontsize=7, transform=ax.transAxes, va="top",
                color=S.STATUS_TEXT_COLORS.get(st, S.TEXT), fontweight="bold")
    if not la:
        ax.text(0.5, 0.5, "No activities in window", ha="center", transform=ax.transAxes, color=S.TEXT_MUTED)
    return fig


def save_png(d, path, dpi=200) -> None:
    fig = render(d, dpi=dpi)
    fig.savefig(path, dpi=dpi, facecolor=fig.get_facecolor())

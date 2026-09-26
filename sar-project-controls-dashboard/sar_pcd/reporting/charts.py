"""Chart drawing shared by the desktop UI (Qt canvas) and PDF/PNG reports."""
from __future__ import annotations

import matplotlib

matplotlib.use("Agg", force=False)
import matplotlib.dates as mdates  # noqa: E402
import matplotlib.patches  # noqa: E402,F401
import matplotlib.ticker  # noqa: E402,F401
from matplotlib.figure import Figure  # noqa: E402

from . import style as S  # noqa: E402


def base_axes(ax, grid_axis: str = "y") -> None:
    ax.set_facecolor(S.SURFACE)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(S.BORDER)
    ax.tick_params(colors=S.TEXT_2, labelsize=8, length=0)
    if grid_axis:
        ax.grid(axis=grid_axis, color=S.GRID, linewidth=0.8)
    ax.set_axisbelow(True)


def no_data(ax, message: str) -> None:
    ax.set_axis_off()
    ax.text(0.5, 0.5, message, ha="center", va="center", fontsize=10, color=S.TEXT_MUTED, transform=ax.transAxes)


def draw_s_curve(ax, sc: dict) -> dict:
    """Returns the plotted line objects (for hover handling)."""
    base_axes(ax)
    if not sc.get("available"):
        no_data(ax, "S-Curve not available (no dated, weighted activities)")
        return {}
    d = sc["dates"]
    lines = {}
    pairs = [("Baseline Planned", sc["planned"], S.PLANNED, "--"),
             ("Actual", sc["actual"], S.ACTUAL, "-"),
             ("Forecast", sc["forecast"], S.FORECAST, ":")]
    for label, ys, color, ls in pairs:
        xs = [x for x, y in zip(d, ys) if y is not None]
        yv = [y for y in ys if y is not None]
        if not xs:
            continue
        (ln,) = ax.plot(xs, yv, ls, color=color, linewidth=2, label=label, solid_capstyle="round")
        lines[label] = ln
        if label == "Actual":  # selective direct label: actual progress at the Data Date
            ax.annotate(f"Actual {yv[-1]:.1f}%", (xs[-1], yv[-1]), xytext=(6, -10), textcoords="offset points",
                        fontsize=7.5, color=S.TEXT_2, va="center")
    dd = sc.get("data_date")
    if dd:
        ax.axvline(dd, color=S.CRITICAL, linewidth=1.2, linestyle=(0, (4, 3)))
        ax.text(dd, 101, " Data Date", color=S.CRITICAL, fontsize=7.5, va="bottom")
    ax.set_ylim(0, 105)
    ax.set_ylabel("Cumulative progress %", fontsize=8, color=S.TEXT_2)
    ax.yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(decimals=0))
    loc = mdates.AutoDateLocator(maxticks=10)
    ax.xaxis.set_major_locator(loc)
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %Y"))
    ax.legend(loc="lower right", fontsize=7.5, frameon=False)
    return lines


def draw_donut(ax, buckets_pct: dict, center_value: str, center_label: str) -> None:
    ax.set_aspect("equal")
    labels = [k for k in ("Completed", "In Progress", "Not Started", "Delayed") if k in buckets_pct]
    vals = [buckets_pct[k] for k in labels]
    if sum(vals) <= 0:
        no_data(ax, "No activities")
        return
    ax.pie(vals, colors=[S.BUCKET_COLORS[k] for k in labels], startangle=90, counterclock=False,
           wedgeprops=dict(width=0.28, edgecolor=S.SURFACE, linewidth=2))
    ax.text(0, 0.08, center_value, ha="center", va="center", fontsize=17, fontweight="bold", color=S.TEXT)
    ax.text(0, -0.22, center_label, ha="center", va="center", fontsize=7.5, color=S.TEXT_2)


def donut_legend(ax, buckets_pct: dict) -> None:
    from matplotlib.patches import Patch
    handles = [Patch(color=S.BUCKET_COLORS[k], label=f"{k} {v:.0f}%") for k, v in buckets_pct.items()]
    ax.legend(handles=handles, loc="upper center", bbox_to_anchor=(0.5, 0.02), ncol=2, fontsize=7.5, frameon=False)


def draw_heatmap(ax, risk: dict, bands: dict) -> None:
    if not risk.get("available"):
        no_data(ax, "Risk Data Not Available\nImport a risk register (File ▸ Import Risk Register)")
        return
    from ..analysis.risk import level
    grid = risk["grid"]
    for p in range(5):
        for i in range(5):
            lv = level((p + 1) * (i + 1), bands)
            ax.add_patch(matplotlib.patches.Rectangle((i, p), 0.96, 0.96, color=S.RISK_COLORS[lv], alpha=0.85))
            n = grid[p][i]
            if n:
                ax.text(i + 0.48, p + 0.48, str(n), ha="center", va="center", fontsize=9, fontweight="bold",
                        color=S.TEXT)
    ax.set_xlim(0, 5)
    ax.set_ylim(0, 5)
    ax.set_xticks([x + 0.48 for x in range(5)], ["1 Minor", "2 Moderate", "3 Major", "4 Severe", "5 Critical"], fontsize=7)
    ax.set_yticks([y + 0.48 for y in range(5)], ["1 Very Low", "2 Low", "3 Medium", "4 High", "5 Very High"], fontsize=7)
    ax.set_xlabel("Impact", fontsize=8, color=S.TEXT_2)
    ax.set_ylabel("Probability", fontsize=8, color=S.TEXT_2)
    for s in ax.spines.values():
        s.set_visible(False)
    ax.tick_params(length=0, colors=S.TEXT_2)


def draw_cost(ax, cost: dict) -> list:
    base_axes(ax)
    if not cost.get("available") or not cost.get("groups"):
        no_data(ax, "Cost Data Not Available in XER")
        return []
    groups = cost["groups"][:8]
    names = [g["group"] for g in groups]
    x = range(len(groups))
    w = 0.38
    scale = 1e6 if max(g["budget"] for g in groups) >= 1e6 else 1e3
    unit = "M" if scale == 1e6 else "K"
    bars = []
    b1 = ax.bar([i - w / 2 - 0.01 for i in x], [g["budget"] / scale for g in groups], w, color=S.PLANNED, label="Budget (baseline)")
    bars.append(b1)
    if cost.get("has_actual"):
        b2 = ax.bar([i + w / 2 + 0.01 for i in x], [g["actual"] / scale for g in groups], w, color=S.ACTUAL, label="Actual")
        bars.append(b2)
    for i, g in enumerate(groups):
        ax.text(i - w / 2, g["budget"] / scale, f"{g['budget'] / scale:,.1f}", ha="center", va="bottom", fontsize=7, color=S.TEXT_2)
    ax.set_xticks(list(x), [n if len(n) < 16 else n[:14] + "…" for n in names], fontsize=7, rotation=20, ha="right")
    ax.set_ylabel(f"Cost ({unit})", fontsize=8, color=S.TEXT_2)
    ax.legend(fontsize=7.5, frameon=False, loc="upper right")
    return bars


def draw_phase_progress(ax, phases: dict) -> None:
    base_axes(ax, "x")
    items = [(k, v["progress"]) for k, v in phases.items() if v["count"]]
    if not items:
        no_data(ax, "No mapped activities")
        return
    names = [k for k, _ in items][::-1]
    act = [(p["actual"] or 0) for _, p in items][::-1]
    pln = [(p["planned"] or 0) for _, p in items][::-1]
    y = range(len(names))
    ax.barh([i + 0.2 for i in y], pln, 0.36, color=S.PLANNED, label="Planned")
    ax.barh([i - 0.2 for i in y], act, 0.36, color=S.ACTUAL, label="Actual")
    for i in y:
        ax.text(act[i] + 1, i - 0.2, f"{act[i]:.0f}%", va="center", fontsize=7, color=S.TEXT_2)
        ax.text(pln[i] + 1, i + 0.2, f"{pln[i]:.0f}%", va="center", fontsize=7, color=S.TEXT_2)
    ax.set_yticks(list(y), names, fontsize=8)
    ax.set_xlim(0, 110)
    ax.xaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(decimals=0))
    ax.legend(fontsize=7.5, frameon=False, loc="lower right")


def draw_hbar(ax, labels: list[str], values: list[float], color: str, value_fmt: str = "{:g}", xlabel: str = "") -> None:
    base_axes(ax, "x")
    if not labels:
        no_data(ax, "Nothing to show")
        return
    y = range(len(labels))
    ax.barh(list(y)[::-1], values, 0.6, color=color)
    for i, v in zip(list(y)[::-1], values):
        ax.text(v, i, " " + value_fmt.format(v), va="center", fontsize=7, color=S.TEXT_2)
    ax.set_yticks(list(y)[::-1], [lbl if len(lbl) < 42 else lbl[:40] + "…" for lbl in labels], fontsize=7)
    if xlabel:
        ax.set_xlabel(xlabel, fontsize=8, color=S.TEXT_2)


def figure(w: float, h: float, dpi: int = 100) -> Figure:
    fig = Figure(figsize=(w, h), dpi=dpi, facecolor=S.SURFACE)
    return fig

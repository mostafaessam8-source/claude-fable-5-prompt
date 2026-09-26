"""Reusable widgets: panels, KPI cards, chart canvas."""
from __future__ import annotations

from matplotlib.backends.backend_qtagg import FigureCanvasQTAgg, NavigationToolbar2QT
from matplotlib.figure import Figure
from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (QFrame, QGridLayout, QHBoxLayout, QLabel, QSizePolicy, QVBoxLayout, QWidget)

from ...analysis.kpi import KPI
from ...reporting import style as S


class Panel(QFrame):
    """White panel with a SAR-blue title bar."""

    def __init__(self, title: str, parent=None):
        super().__init__(parent)
        self.setObjectName("Panel")
        lay = QVBoxLayout(self)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(0)
        self.title = QLabel(title)
        self.title.setObjectName("PanelTitle")
        lay.addWidget(self.title)
        self.body = QWidget()
        self.body_layout = QVBoxLayout(self.body)
        self.body_layout.setContentsMargins(8, 6, 8, 8)
        lay.addWidget(self.body, 1)

    def add(self, w: QWidget, stretch: int = 0) -> QWidget:
        self.body_layout.addWidget(w, stretch)
        return w


def status_label(kpi: KPI) -> tuple[str, str]:
    return S.STATUS_COLORS.get(kpi.status, S.SAR_BLACK), S.STATUS_ICON.get(kpi.status, "")


class KpiCard(QFrame):
    """Clickable executive KPI card. Emits `clicked(key)` for drill-down."""
    clicked = Signal(str)

    def __init__(self, title: str, icon: str = "", parent=None):
        super().__init__(parent)
        self.setObjectName("Card")
        self.setCursor(Qt.PointingHandCursor)
        self.setMinimumHeight(128)
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Preferred)
        self.key = ""
        lay = QVBoxLayout(self)
        lay.setContentsMargins(12, 8, 12, 8)
        lay.setSpacing(2)
        t = QLabel(f"{icon}  {title}" if icon else title)
        t.setObjectName("CardTitle")
        lay.addWidget(t)
        row = QHBoxLayout()
        self.value = QLabel("–")
        self.value.setObjectName("CardValue")
        row.addWidget(self.value)
        self.unit = QLabel("")
        self.unit.setObjectName("CardSub")
        self.unit.setWordWrap(True)
        row.addWidget(self.unit, 1)
        lay.addLayout(row)
        self.grid = QGridLayout()
        self.grid.setHorizontalSpacing(8)
        self.grid.setVerticalSpacing(1)
        lay.addLayout(self.grid)
        lay.addStretch(1)
        self._lines: list[QLabel] = []

    def set_main(self, kpi: KPI | None, text: str | None = None, unit: str = "") -> None:
        if kpi is None:
            self.value.setText("–")
            return
        self.key = kpi.key
        color, icon = status_label(kpi)
        shown = text if text is not None else kpi.display
        if not kpi.available:
            self.value.setText("N/A")
            self.value.setStyleSheet(f"color: {S.TEXT_MUTED};")
            self.unit.setText(kpi.notes[0][:90] if kpi.notes else "Not available")
        else:
            self.value.setText(shown)
            self.value.setStyleSheet(f"color: {color};")
            self.unit.setText((icon + " " if icon else "") + unit)
        tip = f"<b>{kpi.title}</b><br>{kpi.formula}<br><i>{kpi.source}</i><br>Click for drill-down and audit details."
        self.setToolTip(tip)

    def set_lines(self, lines: list[tuple[str, str, str | None]]) -> None:
        for w in self._lines:
            w.deleteLater()
        self._lines = []
        for i, (label, value, color) in enumerate(lines):
            a = QLabel(label)
            a.setObjectName("CardSub")
            b = QLabel(value)
            b.setStyleSheet(f"font-weight:700; color:{color or S.TEXT};")
            b.setAlignment(Qt.AlignRight | Qt.AlignVCenter)
            self.grid.addWidget(a, i, 0)
            self.grid.addWidget(b, i, 1)
            self._lines += [a, b]

    def mouseReleaseEvent(self, e):  # noqa: N802
        if self.key:
            self.clicked.emit(self.key)
        super().mouseReleaseEvent(e)


class ChartCanvas(QWidget):
    """Matplotlib canvas with optional zoom/pan toolbar and hover tooltips."""

    def __init__(self, w=6.0, h=3.0, toolbar=False, parent=None):
        super().__init__(parent)
        self.fig = Figure(figsize=(w, h), dpi=100, facecolor=S.SURFACE)
        self.canvas = FigureCanvasQTAgg(self.fig)
        self.canvas.setMinimumHeight(int(h * 60))
        lay = QVBoxLayout(self)
        lay.setContentsMargins(0, 0, 0, 0)
        if toolbar:
            self.toolbar = NavigationToolbar2QT(self.canvas, self)
            self.toolbar.setIconSize(self.toolbar.iconSize() * 0.8)
            lay.addWidget(self.toolbar)
        lay.addWidget(self.canvas, 1)
        self._hover = None
        self._annot = None
        self.canvas.mpl_connect("motion_notify_event", self._on_move)

    def clear(self):
        self.fig.clear()
        self._annot = None
        return self.fig

    def draw(self):
        try:
            self.fig.tight_layout(pad=0.6)
        except Exception:
            pass
        self.canvas.draw_idle()

    def set_hover(self, fn) -> None:
        """fn(event) -> (text, (x, y)) | None, using data coordinates of the first axes."""
        self._hover = fn

    def _on_move(self, event):
        if self._hover is None or event.inaxes is None:
            return
        res = self._hover(event)
        ax = event.inaxes
        if self._annot is None or self._annot.axes is not ax:
            self._annot = ax.annotate("", xy=(0, 0), xytext=(10, 10), textcoords="offset points", fontsize=8,
                                      bbox=dict(boxstyle="round,pad=0.4", fc=S.SAR_BLACK, ec="none", alpha=0.92),
                                      color="white", zorder=10)
        if res is None:
            if self._annot.get_visible():
                self._annot.set_visible(False)
                self.canvas.draw_idle()
            return
        text, xy = res
        self._annot.xy = xy
        self._annot.set_text(text)
        self._annot.set_visible(True)
        self.canvas.draw_idle()


def page_title(text: str, hint: str = "") -> QWidget:
    w = QWidget()
    lay = QVBoxLayout(w)
    lay.setContentsMargins(0, 0, 0, 4)
    t = QLabel(text)
    t.setObjectName("PageTitle")
    lay.addWidget(t)
    if hint:
        h = QLabel(hint)
        h.setObjectName("Hint")
        h.setWordWrap(True)
        lay.addWidget(h)
    return w

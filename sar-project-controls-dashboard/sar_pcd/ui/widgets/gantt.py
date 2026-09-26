"""P6-style schedule table with expandable WBS hierarchy and a painted Gantt column."""
from __future__ import annotations

from datetime import date, datetime, timedelta

from PySide6.QtCore import QPointF, QRect, QRectF, Qt, Signal
from PySide6.QtGui import QBrush, QColor, QPainter, QPen, QPolygonF
from PySide6.QtWidgets import (QHBoxLayout, QHeaderView, QLabel, QStyledItemDelegate, QTreeWidget, QTreeWidgetItem,
                               QVBoxLayout, QWidget)

from ...analysis.context import ActRow
from ...core.dates import fmt_date
from ...core.model import COMPLETED
from ...reporting import style as S

BAR_ROLE = 0x0101 + 256
ROW_ROLE = BAR_ROLE + 1

COLS = ["Activity ID", "Activity Name", "Orig Dur", "Rem Dur", "BL Start", "BL Finish", "Start", "Finish",
        "Actual Start", "Actual Finish", "% Compl.", "Total Float", "Variance", "Status", "Gantt"]
GANTT = len(COLS) - 1


class Timeline:
    def __init__(self):
        self.start = date.today()
        self.end = date.today() + timedelta(days=365)
        self.data_date: date | None = None

    def x(self, d, rect: QRect) -> float:
        if isinstance(d, datetime):
            d = d.date()
        span = max(1, (self.end - self.start).days)
        return rect.left() + (d - self.start).days / span * rect.width()


class GanttHeader(QHeaderView):
    def __init__(self, tl: Timeline, parent=None):
        super().__init__(Qt.Horizontal, parent)
        self.tl = tl
        self.setMinimumHeight(34)

    def paintSection(self, painter: QPainter, rect: QRect, logical: int):  # noqa: N802
        if logical != GANTT:
            return super().paintSection(painter, rect, logical)
        painter.save()
        painter.fillRect(rect, QColor("#E9EEF1"))
        painter.setPen(QPen(QColor(S.BORDER)))
        painter.drawRect(rect.adjusted(0, 0, -1, -1))
        mid = rect.top() + rect.height() // 2
        painter.drawLine(rect.left(), mid, rect.right(), mid)
        y = self.tl.start.year
        painter.setPen(QPen(QColor(S.SAR_BLACK)))
        while y <= self.tl.end.year:
            for q in range(4):
                qs = date(y, q * 3 + 1, 1)
                qe = date(y + (q == 3), (q * 3 + 3) % 12 + 1, 1)
                x1, x2 = self.tl.x(max(qs, self.tl.start), rect), self.tl.x(min(qe, self.tl.end), rect)
                if x2 <= rect.left() or x1 >= rect.right() or x2 - x1 < 2:
                    continue
                painter.setPen(QPen(QColor(S.BORDER)))
                painter.drawLine(int(x1), mid, int(x1), rect.bottom())
                if x2 - x1 > 18:
                    painter.setPen(QPen(QColor(S.TEXT_2)))
                    painter.drawText(QRectF(x1, mid, x2 - x1, rect.height() / 2), Qt.AlignCenter, f"Q{q + 1}")
            ys, ye = date(y, 1, 1), date(y + 1, 1, 1)
            x1, x2 = self.tl.x(max(ys, self.tl.start), rect), self.tl.x(min(ye, self.tl.end), rect)
            painter.setPen(QPen(QColor(S.SAR_BLACK)))
            if x2 - x1 > 24:
                painter.drawText(QRectF(x1, rect.top(), x2 - x1, rect.height() / 2), Qt.AlignCenter, str(y))
            painter.setPen(QPen(QColor(S.BORDER)))
            painter.drawLine(int(x1), rect.top(), int(x1), rect.bottom())
            y += 1
        painter.restore()


class GanttDelegate(QStyledItemDelegate):
    def __init__(self, tl: Timeline, parent=None):
        super().__init__(parent)
        self.tl = tl

    def paint(self, p: QPainter, option, index):
        if index.column() != GANTT:
            return super().paint(p, option, index)
        bar = index.data(BAR_ROLE)
        r = option.rect
        p.save()
        p.setRenderHint(QPainter.Antialiasing)
        # quarter grid
        p.setPen(QPen(QColor("#EEF0F2")))
        y = self.tl.start.year
        while y <= self.tl.end.year:
            for m in (1, 4, 7, 10):
                d = date(y, m, 1)
                if self.tl.start <= d <= self.tl.end:
                    x = self.tl.x(d, r)
                    p.drawLine(int(x), r.top(), int(x), r.bottom())
            y += 1
        if bar:
            h = r.height()
            top = r.top() + 2
            if bar.get("summary"):
                s, f = bar.get("start"), bar.get("finish")
                if s and f:
                    x1, x2 = self.tl.x(s, r), self.tl.x(f, r)
                    p.fillRect(QRectF(x1, top + 3, max(2, x2 - x1), 5), QColor(S.SAR_BLACK))
                    if bar.get("pct") is not None:
                        p.fillRect(QRectF(x1, top + 3, max(0, (x2 - x1) * bar["pct"] / 100), 5), QColor(S.SERIES[0]))
            else:
                # baseline bar (thin, lower)
                bs, bf = bar.get("bl_start"), bar.get("bl_finish")
                if bs and bf and not bar.get("milestone"):
                    x1, x2 = self.tl.x(bs, r), self.tl.x(bf, r) + 2
                    p.fillRect(QRectF(x1, r.bottom() - 4, max(2, x2 - x1), 3), QColor(S.BASELINE_BAR))
                s, f = bar.get("start"), bar.get("finish")
                crit = bar.get("critical")
                if bar.get("milestone") and (f or s):
                    x = self.tl.x(f or s, r)
                    cy = top + (h - 10) / 2
                    col = QColor(S.CRITICAL if crit else (S.SAR_BLACK if bar.get("done") else S.SERIES[0]))
                    p.setBrush(QBrush(col))
                    p.setPen(Qt.NoPen)
                    p.drawPolygon(QPolygonF([QPointF(x, cy - 5), QPointF(x + 5, cy), QPointF(x, cy + 5), QPointF(x - 5, cy)]))
                elif s and f:
                    x1, x2 = self.tl.x(s, r), self.tl.x(f, r) + 2
                    bh = max(5, h - 8)
                    a_end = bar.get("actual_to")
                    if a_end:
                        xa = min(self.tl.x(a_end, r), x2)
                        p.fillRect(QRectF(x1, top, max(1, xa - x1), bh), QColor(S.SERIES[0]))
                        x1 = xa
                    if x2 > x1 and not bar.get("done"):
                        p.fillRect(QRectF(x1, top, x2 - x1, bh), QColor(S.CRITICAL if crit else S.REMAINING_BAR))
        if self.tl.data_date:
            x = self.tl.x(self.tl.data_date, r)
            p.setPen(QPen(QColor(S.CRITICAL), 1, Qt.DashLine))
            p.drawLine(int(x), r.top(), int(x), r.bottom())
        p.restore()


class GanttView(QWidget):
    activated = Signal(object)

    def __init__(self, parent=None, compact: bool = False):
        super().__init__(parent)
        self.tl = Timeline()
        lay = QVBoxLayout(self)
        lay.setContentsMargins(0, 0, 0, 0)
        self.tree = QTreeWidget()
        self.tree.setColumnCount(len(COLS))
        self.tree.setHeader(GanttHeader(self.tl, self.tree))
        self.tree.setHeaderLabels(COLS)
        self.tree.setItemDelegate(GanttDelegate(self.tl, self.tree))
        self.tree.setAlternatingRowColors(True)
        self.tree.setUniformRowHeights(True)
        self.tree.itemDoubleClicked.connect(self._dbl)
        self.compact = compact
        if compact:
            for c in (2, 3, 4, 5, 8, 9, 11, 12, 13):
                self.tree.setColumnHidden(c, True)
        lay.addWidget(self.tree, 1)
        legend = QHBoxLayout()
        for color, text in ((S.SERIES[0], "Actual"), (S.REMAINING_BAR, "Remaining"), (S.CRITICAL, "Critical"),
                            (S.BASELINE_BAR, "Baseline"), (S.SAR_BLACK, "WBS summary")):
            sw = QLabel("   ")
            sw.setStyleSheet(f"background:{color}; border-radius:2px;")
            sw.setFixedSize(14, 8)
            legend.addWidget(sw)
            lb = QLabel(text)
            lb.setObjectName("Hint")
            legend.addWidget(lb)
            legend.addSpacing(10)
        lb = QLabel("◆ Milestone    ┆ Data Date (red dashed)    Double-click a row for details")
        lb.setObjectName("Hint")
        legend.addWidget(lb)
        legend.addStretch(1)
        lay.addLayout(legend)

    def _dbl(self, item: QTreeWidgetItem, col: int):
        r = item.data(0, ROW_ROLE)
        if r is not None:
            self.activated.emit(r)

    def set_rows(self, ctx, rows: list[ActRow], max_depth: int = 99, expand_depth: int = 1) -> None:
        self.tree.clear()
        dd = ctx.data_date
        rows = [r for r in rows if r.cur is not None]
        starts = [d for r in rows for d in (r.start, r.bl_start) if d]
        ends = [d for r in rows for d in (r.finish, r.bl_finish) if d]
        if starts and ends:
            s0, e0 = min(starts).date(), max(ends).date()
            self.tl.start = date(s0.year, ((s0.month - 1) // 3) * 3 + 1, 1)
            self.tl.end = e0 + timedelta(days=20)
        self.tl.data_date = dd.date() if dd else None
        nodes: dict[tuple, QTreeWidgetItem] = {}
        agg: dict[tuple, dict] = {}
        sched = ctx.cur
        for r in sorted(rows, key=lambda r: (r.wbs_code, r.start or datetime.max, r.code)):
            path = sched.wbs_path(r.cur.wbs_id)[:max_depth]
            parent = None
            key: tuple = ()
            for depth, w in enumerate(path):
                key = key + (w.id,)
                if key not in nodes:
                    it = QTreeWidgetItem([w.code, w.name])
                    f = it.font(0)
                    f.setBold(True)
                    for c in range(len(COLS)):
                        it.setFont(c, f)
                        it.setBackground(c, QColor("#E7F1F3" if depth == 0 else "#F1F6F7"))
                    (parent.addChild(it) if parent else self.tree.addTopLevelItem(it))
                    nodes[key] = it
                    agg[key] = {"start": None, "finish": None, "bl_start": None, "bl_finish": None, "w": 0.0, "ev": 0.0, "depth": depth}
                a = agg[key]
                for fld, fn in (("start", min), ("finish", max), ("bl_start", min), ("bl_finish", max)):
                    v = getattr(r, fld)
                    if v:
                        a[fld] = v if a[fld] is None else fn(a[fld], v)
                a["w"] += r.weight
                a["ev"] += r.weight * r.pct / 100
                parent = nodes[key]
            a_ = r.cur
            vals = [r.code, r.name, _n(r.orig_dur_d), _n(r.rem_dur_d), fmt_date(r.bl_start), fmt_date(r.bl_finish),
                    fmt_date(r.start), fmt_date(r.finish), fmt_date(a_.act_start), fmt_date(a_.act_finish),
                    f"{r.pct:.0f}%", _n(r.tf_d), "" if r.finish_var_d is None else f"{r.finish_var_d:+.0f}",
                    r.display_status(dd), ""]
            it = QTreeWidgetItem(vals)
            it.setData(0, ROW_ROLE, r)
            status = vals[13]
            it.setForeground(13, QColor(S.STATUS_TEXT_COLORS.get(status, S.TEXT)))
            if r.is_critical:
                it.setForeground(0, QColor(S.CRITICAL))
            if r.finish_var_d and r.finish_var_d > 0:
                it.setForeground(12, QColor(S.CRITICAL))
            actual_to = None
            if a_.act_start:
                actual_to = a_.act_finish if a_.status == COMPLETED else dd
            it.setData(GANTT, BAR_ROLE, {"start": r.start, "finish": r.finish, "bl_start": r.bl_start,
                                         "bl_finish": r.bl_finish, "critical": r.is_critical, "milestone": r.is_milestone,
                                         "actual_to": actual_to, "done": r.status == COMPLETED})
            (parent.addChild(it) if parent else self.tree.addTopLevelItem(it))
        for key, it in nodes.items():
            a = agg[key]
            pct = a["ev"] / a["w"] * 100 if a["w"] > 0 else None
            it.setText(4, fmt_date(a["bl_start"]))
            it.setText(5, fmt_date(a["bl_finish"]))
            it.setText(6, fmt_date(a["start"]))
            it.setText(7, fmt_date(a["finish"]))
            it.setText(10, "" if pct is None else f"{pct:.0f}%")
            if a["finish"] and a["bl_finish"]:
                v = (a["finish"].date() - a["bl_finish"].date()).days
                it.setText(12, f"{v:+d}")
            it.setData(GANTT, BAR_ROLE, {"summary": True, "start": a["start"], "finish": a["finish"], "pct": pct})
            it.setExpanded(a["depth"] < expand_depth)
        hdr = self.tree.header()
        for c in range(GANTT):
            self.tree.resizeColumnToContents(c)
        self.tree.setColumnWidth(1, min(260, max(180, self.tree.columnWidth(1))))
        self.tree.setColumnWidth(GANTT, 520 if not self.compact else 420)
        hdr.setStretchLastSection(True)


def _n(v):
    return "" if v is None else f"{v:.0f}"

"""Generic activity table (model + view) used by every drill-down and list page."""
from __future__ import annotations

from datetime import datetime
from PySide6.QtCore import QAbstractTableModel, QModelIndex, QSortFilterProxyModel, Qt, Signal
from PySide6.QtGui import QColor, QFont
from PySide6.QtWidgets import (QAbstractItemView, QFileDialog, QHBoxLayout, QHeaderView, QLabel, QLineEdit,
                               QPushButton, QTableView, QVBoxLayout, QWidget)

from ...analysis.columns import COLUMNS, DEFAULT_COLS, _num  # noqa: F401
from ...analysis.context import ActRow
from ...core.dates import fmt_date
from ...reporting import style as S

SORT_ROLE = Qt.UserRole + 1


class ActivityModel(QAbstractTableModel):
    def __init__(self, cols: list[str], parent=None):
        super().__init__(parent)
        self.cols = cols
        self.rows: list[ActRow] = []
        self.dd: datetime | None = None
        self.extra: dict[str, dict] = {}

    def set_rows(self, rows: list[ActRow], dd: datetime | None) -> None:
        self.beginResetModel()
        self.rows = list(rows)
        self.dd = dd
        self.endResetModel()

    def rowCount(self, parent=QModelIndex()):  # noqa: N802
        return 0 if parent.isValid() else len(self.rows)

    def columnCount(self, parent=QModelIndex()):  # noqa: N802
        return len(self.cols)

    def headerData(self, section, orientation, role=Qt.DisplayRole):  # noqa: N802
        if role == Qt.DisplayRole and orientation == Qt.Horizontal:
            return COLUMNS[self.cols[section]][0]
        return None

    def value(self, r: ActRow, key: str):
        return COLUMNS[key][1](r, self.dd)

    def data(self, index, role=Qt.DisplayRole):
        if not index.isValid():
            return None
        r = self.rows[index.row()]
        key = self.cols[index.column()]
        kind = COLUMNS[key][2]
        v = self.value(r, key)
        if role == Qt.DisplayRole:
            if v is None:
                return ""
            if kind == "date":
                return fmt_date(v)
            if kind == "pct":
                return f"{v:.0f}%"
            if kind == "num":
                return _num(v)
            if kind == "var":
                return f"{v:+.0f}" if v else "0"
            if kind == "money":
                return f"{v:,.0f}"
            return str(v)
        if role == SORT_ROLE:
            if v is None:
                return -1e18 if kind != "text" and kind != "status" else ""
            if kind == "date":
                return v.timestamp()
            return v
        if role == Qt.ForegroundRole:
            if kind == "status":
                return QColor(S.STATUS_TEXT_COLORS.get(v, S.TEXT))
            if kind == "var" and v:
                return QColor(S.CRITICAL if v > 0 else S.GOOD)
            if key == "tf" and v is not None and v < 0:
                return QColor(S.CRITICAL)
            if key == "level" and v in ("Low", "Not Mapped"):
                return QColor(S.CRITICAL)
        if role == Qt.FontRole and kind == "status" and v in ("Critical", "Overdue", "Delayed"):
            f = QFont()
            f.setBold(True)
            return f
        if role == Qt.TextAlignmentRole and kind in ("num", "pct", "var", "money"):
            return int(Qt.AlignRight | Qt.AlignVCenter)
        if role == Qt.ToolTipRole and key in ("name", "phase"):
            return f"{r.code} {r.name}\n{r.wbs_path}\nMapping: {r.phase} ({r.phase_conf:.0%}, {r.phase_level})"
        return None


class ActivityTable(QWidget):
    activated = Signal(object)   # ActRow

    def __init__(self, cols: list[str] | None = None, title: str = "", export_name: str = "activities",
                 search: bool = True, parent=None):
        super().__init__(parent)
        self.export_name = export_name
        self.model = ActivityModel(cols or DEFAULT_COLS, self)
        self.proxy = QSortFilterProxyModel(self)
        self.proxy.setSourceModel(self.model)
        self.proxy.setSortRole(SORT_ROLE)
        self.proxy.setFilterCaseSensitivity(Qt.CaseInsensitive)
        self.proxy.setFilterKeyColumn(-1)
        lay = QVBoxLayout(self)
        lay.setContentsMargins(0, 0, 0, 0)
        bar = QHBoxLayout()
        self.count = QLabel("")
        self.count.setObjectName("Hint")
        if title:
            t = QLabel(title)
            t.setStyleSheet("font-weight:700;")
            bar.addWidget(t)
        bar.addWidget(self.count)
        bar.addStretch(1)
        if search:
            self.search = QLineEdit()
            self.search.setPlaceholderText("Filter this list…")
            self.search.setClearButtonEnabled(True)
            self.search.setMaximumWidth(260)
            self.search.textChanged.connect(self.proxy.setFilterFixedString)
            bar.addWidget(self.search)
        exp = QPushButton("Export to Excel")
        exp.clicked.connect(self.export)
        bar.addWidget(exp)
        lay.addLayout(bar)
        self.view = QTableView()
        self.view.setModel(self.proxy)
        self.view.setSortingEnabled(True)
        self.view.setAlternatingRowColors(True)
        self.view.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.view.setEditTriggers(QAbstractItemView.NoEditTriggers)
        self.view.verticalHeader().setVisible(False)
        self.view.verticalHeader().setDefaultSectionSize(22)
        self.view.horizontalHeader().setSectionResizeMode(QHeaderView.Interactive)
        self.view.horizontalHeader().setStretchLastSection(True)
        self.view.doubleClicked.connect(self._activated)
        lay.addWidget(self.view, 1)

    def set_rows(self, rows: list[ActRow], dd) -> None:
        self.model.set_rows(rows, dd)
        self.count.setText(f"{len(rows)} activities")
        self.view.resizeColumnsToContents()
        for i, c in enumerate(self.model.cols):
            if c in ("name", "wbs"):
                self.view.setColumnWidth(i, min(320, max(160, self.view.columnWidth(i))))

    def _activated(self, idx):
        src = self.proxy.mapToSource(idx)
        self.activated.emit(self.model.rows[src.row()])

    def export(self):
        path, _ = QFileDialog.getSaveFileName(self, "Export to Excel", f"{self.export_name}.xlsx", "Excel (*.xlsx)")
        if not path:
            return
        from ...reporting.excel import write_rows_workbook
        write_rows_workbook(path, self.export_name.replace("_", " ").title(), self.model.rows, self.model.cols, self.model.dd)

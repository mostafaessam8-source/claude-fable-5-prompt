from __future__ import annotations

from PySide6.QtWidgets import QScrollArea, QVBoxLayout, QWidget


class Page(QWidget):
    """Base page. `app` is the MainWindow facade (dash, cache, ctx, drill helpers)."""
    title = ""

    def __init__(self, app, scroll: bool = False):
        super().__init__()
        self.setObjectName("Page")
        self.app = app
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        inner = QWidget()
        inner.setObjectName("Page")
        self.layout_ = QVBoxLayout(inner)
        self.layout_.setContentsMargins(12, 10, 12, 10)
        self.layout_.setSpacing(10)
        if scroll:
            sa = QScrollArea()
            sa.setWidgetResizable(True)
            sa.setWidget(inner)
            outer.addWidget(sa)
        else:
            outer.addWidget(inner)
        self.dirty = True

    def refresh(self) -> None:  # override
        pass

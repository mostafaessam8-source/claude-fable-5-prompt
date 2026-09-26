"""Headless UI smoke test: open the demo project and render every page."""
import os
import time

import pytest

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
QtWidgets = pytest.importorskip("PySide6.QtWidgets")


def test_all_pages_render():
    import matplotlib
    matplotlib.use("QtAgg")
    from sar_pcd.ui.main_window import NAV, MainWindow
    from sar_pcd.ui.theme import QSS
    app = QtWidgets.QApplication.instance() or QtWidgets.QApplication([])
    app.setStyleSheet(QSS)
    w = MainWindow("test.log")
    w.show()
    w.open_demo()
    t0 = time.time()
    while w.dash is None and time.time() - t0 < 60:
        app.processEvents()
        time.sleep(0.02)
    assert w.dash is not None
    for i, name in enumerate(NAV):
        w.nav.setCurrentRow(i)
        app.processEvents()
        assert not w.pages[name].dirty, f"page {name} failed to refresh"
    w.filters.combos["Project Phase"].setCurrentText("Procurement")
    app.processEvents()
    assert all(r.phase == "Procurement" for r in w.dash.rows)
    w.close()

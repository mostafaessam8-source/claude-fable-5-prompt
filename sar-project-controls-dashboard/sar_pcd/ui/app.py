"""Application bootstrap: logging, crash handler, theme, main window."""
from __future__ import annotations

import logging
import logging.handlers
import os
import sys
import traceback
from pathlib import Path

from .. import APP_NAME, __version__


def app_data_dir() -> Path:
    base = os.environ.get("LOCALAPPDATA") or os.path.join(Path.home(), ".local", "share")
    p = Path(base) / "SAR_Project_Controls_Dashboard"
    p.mkdir(parents=True, exist_ok=True)
    return p


def setup_logging() -> str:
    log_dir = app_data_dir() / "logs"
    log_dir.mkdir(exist_ok=True)
    path = log_dir / "sar_pcd.log"
    handler = logging.handlers.RotatingFileHandler(path, maxBytes=2_000_000, backupCount=3, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    root = logging.getLogger("sar_pcd")
    root.setLevel(logging.INFO)
    root.addHandler(handler)
    root.info("%s %s starting", APP_NAME, __version__)
    return str(path)


def apply_light_theme(app) -> None:
    """Always use the SAR light theme, even when Windows is in dark mode.

    Qt follows the Windows colour scheme by default; with dark mode the palette
    turns black and popups / menus become unreadable under our light stylesheet.
    """
    from PySide6.QtCore import Qt
    from PySide6.QtGui import QColor, QPalette

    from ..reporting import style as S
    from .theme import QSS

    try:  # Qt >= 6.8
        app.styleHints().setColorScheme(Qt.ColorScheme.Light)
    except AttributeError:
        pass
    app.setStyle("Fusion")
    pal = QPalette()
    roles = {
        QPalette.Window: S.PAGE_BG, QPalette.WindowText: S.TEXT, QPalette.Base: "#FFFFFF",
        QPalette.AlternateBase: "#F6F8F9", QPalette.Text: S.TEXT, QPalette.Button: "#FFFFFF",
        QPalette.ButtonText: S.TEXT, QPalette.BrightText: "#FFFFFF", QPalette.Highlight: "#CFE6EA",
        QPalette.HighlightedText: S.TEXT, QPalette.ToolTipBase: S.SAR_BLACK, QPalette.ToolTipText: "#FFFFFF",
        QPalette.PlaceholderText: S.TEXT_MUTED, QPalette.Link: S.SAR_BLUE, QPalette.Light: "#FFFFFF",
        QPalette.Midlight: "#F0F2F4", QPalette.Mid: S.BORDER, QPalette.Dark: "#A0A8AE", QPalette.Shadow: "#6B7278",
    }
    for role, color in roles.items():
        pal.setColor(QPalette.All, role, QColor(color))
    for role in (QPalette.WindowText, QPalette.Text, QPalette.ButtonText):
        pal.setColor(QPalette.Disabled, role, QColor(S.TEXT_MUTED))
    app.setPalette(pal)
    app.setStyleSheet(QSS)


def run(argv=None) -> int:
    log_path = setup_logging()
    os.environ.setdefault("QT_ENABLE_HIGHDPI_SCALING", "1")
    import matplotlib
    matplotlib.use("QtAgg")
    from PySide6.QtGui import QIcon
    from PySide6.QtWidgets import QApplication, QMessageBox

    from .main_window import MainWindow
    from .theme import QSS

    app = QApplication(sys.argv[:1] + list(argv or []))
    app.setApplicationName(APP_NAME)
    app.setApplicationVersion(__version__)
    app.setOrganizationName("SAR")
    icon = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[1])) / "resources" / "app.ico"
    if not icon.exists():
        icon = Path(__file__).resolve().parents[1] / "resources" / "app.ico"
    if icon.exists():
        app.setWindowIcon(QIcon(str(icon)))
    apply_light_theme(app)
    win = MainWindow(log_path)

    def excepthook(t, v, tb):
        logging.getLogger("sar_pcd").error("Unhandled error:\n%s", "".join(traceback.format_exception(t, v, tb)))
        QMessageBox.critical(win, APP_NAME, f"An unexpected error occurred: {v}\n\nThe application will continue. "
                                            f"Details were written to:\n{log_path}")
    sys.excepthook = excepthook
    win.show()
    args = list(argv or [])
    if args and args[0].lower().endswith(".sarpcd") and Path(args[0]).exists():
        from ..services.workspace import Workspace
        win._open_ws(Workspace(args[0]))
    elif "--demo" in args:
        win.open_demo()
    return app.exec()

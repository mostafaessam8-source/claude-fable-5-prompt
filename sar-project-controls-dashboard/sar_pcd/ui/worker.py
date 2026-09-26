"""Background worker so parsing / analysis never blocks the UI thread."""
from __future__ import annotations

import logging
import traceback

from PySide6.QtCore import QThread, Signal

log = logging.getLogger("sar_pcd")


class Worker(QThread):
    progress = Signal(int, str)
    done = Signal(object)
    failed = Signal(str, str)   # user message, technical detail

    def __init__(self, fn, *args, **kwargs):
        super().__init__()
        self.fn, self.args, self.kwargs = fn, args, kwargs

    def run(self):
        try:
            res = self.fn(*self.args, progress=lambda p, m: self.progress.emit(int(p), str(m)), **self.kwargs)
            self.done.emit(res)
        except Exception as e:  # noqa: BLE001 - reported to the user, logged in full
            tb = traceback.format_exc()
            log.error("Background task failed: %s\n%s", e, tb)
            self.failed.emit(friendly(e), tb)


def friendly(e: Exception) -> str:
    from ..core.loader import ScheduleLoadError
    from ..core.xer_parser import XerParseError
    if isinstance(e, (XerParseError, ScheduleLoadError)):
        return str(e)
    if isinstance(e, PermissionError):
        return f"The file could not be opened (permission denied or in use by another program): {e.filename}"
    if isinstance(e, FileNotFoundError):
        return f"File not found: {e.filename}"
    if isinstance(e, MemoryError):
        return "Not enough memory to process this schedule. Close other applications and try again."
    return f"An unexpected error occurred: {e}. Details were written to the error log."

"""Project workspace (.sarpcd) stored as a single local SQLite file.

Contents: normalized Current and Baseline schedules (parsed once at import),
source file metadata, mapping profile (with user overrides), analysis
settings, report preferences, risk register and an append-only audit trail.
"""
from __future__ import annotations

import getpass
import hashlib
import json
import shutil
import sqlite3
from dataclasses import asdict
from datetime import datetime
from pathlib import Path

from .. import __version__
from ..analysis.risk import RiskItem
from ..analysis.settings import AnalysisSettings
from ..core.model import Schedule
from ..mapping.profile import MappingProfile, default_profile
from .serialize import schedule_from_bytes, schedule_to_bytes

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS schedule (role TEXT PRIMARY KEY, filename TEXT, sha256 TEXT, project_id TEXT,
                                     imported_at TEXT, data BLOB);
CREATE TABLE IF NOT EXISTS schedule_history (id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT, filename TEXT,
                                             sha256 TEXT, data_date TEXT, imported_at TEXT);
CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, user TEXT, action TEXT,
                                  target TEXT, old_value TEXT, new_value TEXT, note TEXT);
"""


def _user() -> str:
    try:
        return getpass.getuser()
    except Exception:  # pragma: no cover
        return "user"


class Workspace:
    EXT = ".sarpcd"

    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.db = sqlite3.connect(str(self.path))
        self.db.executescript(SCHEMA)
        self.db.commit()

    # --------------------------------------------------------------- lifecycle
    @classmethod
    def create(cls, path: str | Path, name: str) -> "Workspace":
        p = Path(path)
        if p.exists():
            p.unlink()
        ws = cls(p)
        ws.set_meta("name", name)
        ws.set_meta("created", datetime.now().isoformat(timespec="seconds"))
        ws.set_meta("app_version", __version__)
        ws.set_meta("archived", "0")
        ws.save_profile(default_profile(), log=False)
        ws.save_settings(AnalysisSettings(), log=False)
        ws.log("Create Project", name)
        return ws

    def close(self) -> None:
        self.db.close()

    def duplicate(self, new_path: str | Path, new_name: str) -> "Workspace":
        self.db.commit()
        shutil.copyfile(self.path, new_path)
        ws = Workspace(new_path)
        ws.set_meta("name", new_name)
        ws.log("Duplicate Project", new_name, note=f"Copied from {self.path.name}")
        return ws

    def archive(self, archived: bool = True) -> None:
        self.set_meta("archived", "1" if archived else "0")
        self.log("Archive Project" if archived else "Unarchive Project", self.name)

    # --------------------------------------------------------------- meta
    def set_meta(self, key: str, value: str) -> None:
        self.db.execute("INSERT OR REPLACE INTO meta VALUES (?,?)", (key, value))
        self.db.commit()

    def meta(self, key: str, default: str = "") -> str:
        r = self.db.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
        return r[0] if r else default

    @property
    def name(self) -> str:
        return self.meta("name", self.path.stem)

    @property
    def archived(self) -> bool:
        return self.meta("archived") == "1"

    # --------------------------------------------------------------- schedules
    def save_schedule(self, role: str, sched: Schedule, raw_bytes: bytes, filename: str) -> None:
        sha = hashlib.sha256(raw_bytes).hexdigest()
        now = datetime.now().isoformat(timespec="seconds")
        self.db.execute("INSERT OR REPLACE INTO schedule VALUES (?,?,?,?,?,?)",
                        (role, filename, sha, sched.project.id, now, schedule_to_bytes(sched)))
        self.db.execute("INSERT INTO schedule_history (role, filename, sha256, data_date, imported_at) VALUES (?,?,?,?,?)",
                        (role, filename, sha, sched.project.data_date.isoformat() if sched.project.data_date else "", now))
        self.db.commit()
        self.log(f"Import {role} XER", filename, note=f"sha256 {sha[:12]}…, data date {sched.project.data_date}")

    def load_schedule(self, role: str) -> Schedule | None:
        r = self.db.execute("SELECT data FROM schedule WHERE role=?", (role,)).fetchone()
        return schedule_from_bytes(r[0]) if r else None

    def schedule_info(self, role: str) -> dict | None:
        r = self.db.execute("SELECT filename, sha256, project_id, imported_at FROM schedule WHERE role=?", (role,)).fetchone()
        return dict(zip(("filename", "sha256", "project_id", "imported_at"), r)) if r else None

    def history(self) -> list[dict]:
        cur = self.db.execute("SELECT role, filename, sha256, data_date, imported_at FROM schedule_history ORDER BY id")
        return [dict(zip(("role", "filename", "sha256", "data_date", "imported_at"), r)) for r in cur]

    # --------------------------------------------------------------- config
    def _set(self, key: str, value) -> None:
        self.db.execute("INSERT OR REPLACE INTO config VALUES (?,?)", (key, json.dumps(value)))
        self.db.commit()

    def _get(self, key: str, default=None):
        r = self.db.execute("SELECT value FROM config WHERE key=?", (key,)).fetchone()
        return json.loads(r[0]) if r else default

    def save_profile(self, p: MappingProfile, log: bool = True, note: str = "") -> None:
        self._set("mapping_profile", p.to_dict())
        if log:
            self.log("Save Mapping Profile", p.name, note=note)

    def load_profile(self) -> MappingProfile:
        d = self._get("mapping_profile")
        return MappingProfile.from_dict(d) if d else default_profile()

    def save_settings(self, s: AnalysisSettings, log: bool = True) -> None:
        old = self._get("settings")
        self._set("settings", s.to_dict())
        if log and old is not None:
            changes = [f"{k}: {old.get(k)} -> {v}" for k, v in s.to_dict().items() if old.get(k) != v]
            if changes:
                self.log("Change Settings", "Analysis settings", "", "; ".join(changes))

    def load_settings(self) -> AnalysisSettings:
        return AnalysisSettings.from_dict(self._get("settings", {}))

    def save_report_prefs(self, prefs: dict) -> None:
        self._set("report_prefs", prefs)

    def load_report_prefs(self) -> dict:
        return self._get("report_prefs", {"page_size": "A3", "include_cover": True, "prepared_by": ""})

    def save_risks(self, items: list[RiskItem], source: str) -> None:
        self._set("risks", {"source": source, "items": [asdict(x) for x in items]})
        self.log("Import Risk Register", source, note=f"{len(items)} risks")

    def load_risks(self) -> tuple[list[RiskItem], str]:
        d = self._get("risks")
        if not d:
            return [], ""
        return [RiskItem(**x) for x in d["items"]], d.get("source", "")

    # --------------------------------------------------------------- audit
    def log(self, action: str, target: str = "", old: str = "", new: str = "", note: str = "") -> None:
        self.db.execute("INSERT INTO audit (ts, user, action, target, old_value, new_value, note) VALUES (?,?,?,?,?,?,?)",
                        (datetime.now().isoformat(timespec="seconds"), _user(), action, target, old, new, note))
        self.db.commit()

    def audit_trail(self) -> list[dict]:
        cur = self.db.execute("SELECT ts, user, action, target, old_value, new_value, note FROM audit ORDER BY id DESC")
        return [dict(zip(("time", "user", "action", "target", "old", "new", "note"), r)) for r in cur]

"""Native Primavera P6 XER parser.

The XER format is a tab-delimited text export:

    ERMHDR  <version> <export date> ...
    %T      <TABLE NAME>
    %F      field1 field2 ...
    %R      value1 value2 ...
    %E      (end of file)

Rows are stored as lists (not dicts) to keep memory small for 100k+ activity
schedules; use ``XerTable.index`` / ``XerTable.get`` to read values.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterator


class XerParseError(Exception):
    pass


@dataclass
class XerTable:
    name: str
    fields: list[str]
    rows: list[list[str]] = field(default_factory=list)

    def __post_init__(self) -> None:
        self._index = {f: i for i, f in enumerate(self.fields)}

    def has(self, column: str) -> bool:
        return column in self._index

    def index(self, *columns: str) -> int | None:
        """Index of the first column present among the candidates."""
        for c in columns:
            i = self._index.get(c)
            if i is not None:
                return i
        return None

    def get(self, row: list[str], column: str, default: str = "") -> str:
        i = self._index.get(column)
        if i is None or i >= len(row):
            return default
        return row[i]

    def dicts(self) -> Iterator[dict[str, str]]:
        for r in self.rows:
            yield {f: (r[i] if i < len(r) else "") for i, f in enumerate(self.fields)}

    def __len__(self) -> int:
        return len(self.rows)


@dataclass
class XerFile:
    source_name: str
    header: list[str]
    tables: dict[str, XerTable]
    encoding: str
    warnings: list[str] = field(default_factory=list)

    def table(self, name: str) -> XerTable | None:
        return self.tables.get(name)

    @property
    def version(self) -> str:
        return self.header[1] if len(self.header) > 1 else ""

    @property
    def export_date(self) -> str:
        return self.header[2] if len(self.header) > 2 else ""


def _decode(data: bytes) -> tuple[str, str]:
    if data.startswith(b"\xef\xbb\xbf"):
        return data[3:].decode("utf-8", errors="replace"), "utf-8-sig"
    if data.startswith((b"\xff\xfe", b"\xfe\xff")):
        return data.decode("utf-16"), "utf-16"
    try:
        return data.decode("utf-8"), "utf-8"
    except UnicodeDecodeError:
        pass
    try:
        # P6 on Windows exports in the ANSI code page (typically cp1252).
        return data.decode("cp1252"), "cp1252"
    except UnicodeDecodeError:
        return data.decode("latin-1"), "latin-1"


def parse_xer(source: str | Path | bytes, source_name: str | None = None) -> XerFile:
    if isinstance(source, bytes):
        data = source
        name = source_name or "<bytes>"
    else:
        p = Path(source)
        data = p.read_bytes()
        name = source_name or p.name
    if not data.strip():
        raise XerParseError(f"{name}: file is empty")
    text, encoding = _decode(data)

    header: list[str] = []
    tables: dict[str, XerTable] = {}
    warnings: list[str] = []
    current: XerTable | None = None
    width = 0
    bad_rows = 0

    for lineno, raw in enumerate(text.splitlines(), start=1):
        if not raw:
            continue
        tag, _, rest = raw.partition("\t")
        if tag == "%R":
            if current is None:
                bad_rows += 1
                continue
            vals = rest.split("\t")
            if len(vals) < width:
                vals.extend([""] * (width - len(vals)))
            elif len(vals) > width:
                # Extra columns: keep the declared ones, warn once per table.
                bad_rows += 1
                vals = vals[:width]
            current.rows.append(vals)
        elif tag == "%T":
            tname = rest.strip()
            current = XerTable(tname, [])
            if tname in tables:
                warnings.append(f"Table {tname} appears more than once; rows were merged.")
                current = tables[tname]
            else:
                tables[tname] = current
            width = len(current.fields)
        elif tag == "%F":
            if current is None:
                warnings.append(f"Line {lineno}: field list without a table.")
                continue
            fields = [f.strip() for f in rest.split("\t")]
            if current.fields and current.fields != fields:
                warnings.append(f"Table {current.name}: conflicting field lists; the second block was skipped.")
                current = None
                continue
            current.fields = fields
            current.__post_init__()
            width = len(fields)
        elif tag == "ERMHDR":
            header = raw.split("\t")
        elif tag == "%E":
            break
        else:
            # Some tools wrap memo fields; tolerate stray lines.
            bad_rows += 1

    if not tables:
        raise XerParseError(f"{name}: no XER tables found - is this a Primavera P6 XER export?")
    if not header:
        warnings.append("ERMHDR header line missing; P6 version unknown.")
    if bad_rows:
        warnings.append(f"{bad_rows} malformed line(s) were ignored or truncated.")
    return XerFile(name, header, tables, encoding, warnings)

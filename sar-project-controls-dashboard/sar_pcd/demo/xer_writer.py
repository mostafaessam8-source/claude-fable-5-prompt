"""Minimal XER writer used to produce synthetic/demo schedules."""
from __future__ import annotations

from datetime import date, datetime


def fmt(v) -> str:
    if v is None:
        return ""
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d %H:%M")
    if isinstance(v, date):
        return v.strftime("%Y-%m-%d 00:00")
    if isinstance(v, bool):
        return "Y" if v else "N"
    if isinstance(v, float):
        return f"{v:.4f}".rstrip("0").rstrip(".") if v != int(v) else str(int(v))
    return str(v).replace("\t", " ").replace("\n", " ")


def write_xer(tables: dict[str, tuple[list[str], list[dict]]], version: str = "20.12",
              export_date: datetime | None = None) -> str:
    ed = (export_date or datetime(2025, 1, 1)).strftime("%Y-%m-%d")
    lines = [f"ERMHDR\t{version}\t{ed}\tProject\tadmin\tSAR Demo\tdbxDatabaseNoName\tProject Management\tSAR"]
    for name, (fields, rows) in tables.items():
        lines.append(f"%T\t{name}")
        lines.append("%F\t" + "\t".join(fields))
        for r in rows:
            lines.append("%R\t" + "\t".join(fmt(r.get(f)) for f in fields))
    lines.append("%E")
    return "\r\n".join(lines) + "\r\n"


def calendar_data(workdays_p6: dict[int, tuple[str, str] | None], holidays: list[date] = ()) -> str:
    """Build a P6 clndr_data string. Keys are P6 day numbers 1=Sunday..7=Saturday."""
    parts = ["(0||CalendarData()(", "(0||DaysOfWeek()("]
    for d in range(1, 8):
        iv = workdays_p6.get(d)
        if iv:
            parts.append(f"(0||{d}()((0||0(s|{iv[0]}|f|{iv[1]})())))")
        else:
            parts.append(f"(0||{d}()())")
    parts.append("))")
    parts.append("(0||VIEW(ShowTotal|Y)())")
    parts.append("(0||Exceptions()(")
    for i, h in enumerate(holidays):
        serial = (h - date(1899, 12, 30)).days
        parts.append(f"(0||{i}(d|{serial})())")
    parts.append("))))")
    return "\x7f".join(parts)

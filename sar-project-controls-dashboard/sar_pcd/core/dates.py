"""Date parsing for XER files."""
from __future__ import annotations

from datetime import date, datetime, timedelta
from functools import lru_cache

# Formats observed in XER exports. ISO is the P6 standard; others appear in
# files produced by third-party tools. Day-first/month-first slash formats are
# ambiguous, so they are tried last and reported by the parser.
_FORMATS = (
    "%Y-%m-%d %H:%M",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%dT%H:%M",
    "%d-%b-%y %H:%M",
    "%d-%b-%Y %H:%M",
    "%d-%b-%y",
    "%d-%b-%Y",
)
_AMBIGUOUS = ("%m/%d/%Y %H:%M", "%m/%d/%Y", "%d/%m/%Y %H:%M", "%d/%m/%Y")

EXCEL_EPOCH = date(1899, 12, 30)


class AmbiguousDate(ValueError):
    pass


@lru_cache(maxsize=200_000)
def parse_p6_date(text: str | None) -> datetime | None:
    if text is None:
        return None
    s = text.strip()
    if not s:
        return None
    for fmt in _FORMATS:
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    for fmt in _AMBIGUOUS:
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    raise ValueError(f"Unrecognised date format: {s!r}")


def excel_serial_to_date(serial: int | float) -> date:
    return EXCEL_EPOCH + timedelta(days=int(serial))


def to_date(d: datetime | date | None) -> date | None:
    if d is None:
        return None
    return d.date() if isinstance(d, datetime) else d


def fmt_date(d: datetime | date | None, empty: str = "") -> str:
    if d is None:
        return empty
    return d.strftime("%d %b %Y")

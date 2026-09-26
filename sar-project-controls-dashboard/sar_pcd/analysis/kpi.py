"""Auditable KPI value object: every figure carries its formula, source and
the activities it was computed from."""
from __future__ import annotations

from dataclasses import dataclass, field

GOOD, WARN, BAD, NA, NEUTRAL = "good", "warn", "bad", "na", "neutral"


@dataclass
class KPI:
    key: str
    title: str
    value: float | int | str | None
    display: str
    status: str = NEUTRAL
    available: bool = True
    formula: str = ""
    source: str = ""
    method: str = ""
    keys: list = field(default_factory=list)      # ActRow keys included in the calculation
    notes: list = field(default_factory=list)
    extra: dict = field(default_factory=dict)

    @classmethod
    def unavailable(cls, key: str, title: str, reason: str, formula: str = "") -> "KPI":
        return cls(key, title, None, "N/A", NA, False, formula, notes=[reason])


def fmt_pct(v: float | None, digits: int = 1) -> str:
    return "N/A" if v is None else f"{v:.{digits}f}%"


def fmt_num(v: float | None, digits: int = 2) -> str:
    return "N/A" if v is None else f"{v:,.{digits}f}"


def fmt_money(v: float | None) -> str:
    if v is None:
        return "N/A"
    a = abs(v)
    if a >= 1e9:
        return f"{v / 1e9:,.2f} B"
    if a >= 1e6:
        return f"{v / 1e6:,.2f} M"
    if a >= 1e3:
        return f"{v / 1e3:,.1f} K"
    return f"{v:,.0f}"

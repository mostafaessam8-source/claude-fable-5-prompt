"""Vectorised working-day index used for time-phasing (S-curves, planned %)."""
from __future__ import annotations

from datetime import date, datetime, timedelta

import numpy as np

from ..core.model import Calendar


class CalIndex:
    def __init__(self, calendars: list[Calendar], start: date, end: date):
        self.origin = start - timedelta(days=7)
        self.n = max(1, (end - self.origin).days + 14)
        self.masks: dict[str, np.ndarray] = {}
        self.cums: dict[str, np.ndarray] = {}
        for cal in calendars:
            self._add(cal)

    def _add(self, cal: Calendar) -> None:
        wk = np.array([bool(w) for w in cal.workdays])
        wd = (np.arange(self.n) + self.origin.weekday()) % 7
        mask = wk[wd].copy()
        for h in cal.holidays:
            i = (h - self.origin).days
            if 0 <= i < self.n:
                mask[i] = False
        for x in cal.extra_workdays:
            i = (x - self.origin).days
            if 0 <= i < self.n:
                mask[i] = True
        self.masks[cal.id] = mask
        self.cums[cal.id] = np.concatenate([[0], np.cumsum(mask)])

    def ensure(self, cal: Calendar) -> None:
        if cal.id not in self.masks:
            self._add(cal)

    def idx(self, d: date | datetime | None) -> int | None:
        if d is None:
            return None
        if isinstance(d, datetime):
            d = d.date()
        return min(max((d - self.origin).days, 0), self.n)

    def date_of(self, i: int) -> date:
        return self.origin + timedelta(days=int(i))

    def workdays(self, cal_id: str, i: int, j: int) -> int:
        c = self.cums[cal_id]
        i = min(max(i, 0), self.n)
        j = min(max(j, 0), self.n)
        return int(c[j] - c[i])


class Spreader:
    """Distributes amounts linearly over working days (difference arrays)."""

    def __init__(self, ci: CalIndex):
        self.ci = ci
        self.diffs: dict[str, np.ndarray] = {}
        self.points = np.zeros(ci.n + 1)

    def add(self, cal_id: str, s: int, e: int, amount: float) -> None:
        """Spread `amount` over working days in [s, e); point mass if none."""
        if amount == 0:
            return
        n = self.ci.n
        s = min(max(s, 0), n - 1)
        e = min(max(e, 0), n)
        if e <= s:
            self.points[s] += amount
            return
        wd = self.ci.workdays(cal_id, s, e)
        if wd <= 0:
            self.points[s] += amount
            return
        d = self.diffs.get(cal_id)
        if d is None:
            d = self.diffs[cal_id] = np.zeros(n + 1)
        rate = amount / wd
        d[s] += rate
        d[e] -= rate

    def cumulative(self) -> np.ndarray:
        """C[i] = amount scheduled on days < i (length n+1)."""
        n = self.ci.n
        daily = self.points[:n].copy()
        for cal_id, d in self.diffs.items():
            daily += np.cumsum(d)[:n] * self.ci.masks[cal_id]
        return np.concatenate([[0.0], np.cumsum(daily)])

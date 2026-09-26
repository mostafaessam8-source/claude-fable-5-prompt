"""Normalized schedule data model (independent of the XER column layout)."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

NOT_STARTED = "Not Started"
IN_PROGRESS = "In Progress"
COMPLETED = "Completed"


@dataclass(slots=True)
class Calendar:
    id: str
    name: str
    hours_per_day: float = 8.0
    # Working flag per Python weekday (Mon=0 .. Sun=6)
    workdays: list = field(default_factory=lambda: [True, True, True, True, True, False, False])
    holidays: set = field(default_factory=set)          # non-working exception dates
    extra_workdays: set = field(default_factory=set)    # working exception dates
    project_id: str = ""
    cal_type: str = ""
    parsed_ok: bool = True

    def is_workday(self, d: date) -> bool:
        if d in self.holidays:
            return False
        if d in self.extra_workdays:
            return True
        return bool(self.workdays[d.weekday()])

    def add_workdays(self, d: date, n: int) -> date:
        """Move n working days forward (n>0) or backward (n<0) from d."""
        step = 1 if n >= 0 else -1
        remaining = abs(n)
        guard = 0
        while remaining > 0 and guard < 100_000:
            d += timedelta(days=step)
            guard += 1
            if self.is_workday(d):
                remaining -= 1
        return d

    def workdays_between(self, a: date, b: date) -> int:
        """Number of working days in [a, b) (negative if b < a)."""
        if b == a:
            return 0
        sign = 1
        if b < a:
            a, b, sign = b, a, -1
        full_weeks, rem = divmod((b - a).days, 7)
        per_week = sum(1 for w in self.workdays if w)
        count = full_weeks * per_week
        d = a + timedelta(days=full_weeks * 7)
        for _ in range(rem):
            if self.workdays[d.weekday()]:
                count += 1
            d += timedelta(days=1)
        for h in self.holidays:
            if a <= h < b and self.workdays[h.weekday()]:
                count -= 1
        for x in self.extra_workdays:
            if a <= x < b and not self.workdays[x.weekday()]:
                count += 1
        return sign * count


@dataclass(slots=True)
class WBS:
    id: str
    project_id: str
    code: str
    name: str
    parent_id: str = ""
    seq: int = 0
    is_project_node: bool = False


@dataclass(slots=True)
class CodeType:
    id: str
    name: str
    scope: str = ""
    project_id: str = ""


@dataclass(slots=True)
class CodeValue:
    id: str
    type_id: str
    value: str
    description: str = ""
    parent_id: str = ""


@dataclass(slots=True)
class UdfType:
    id: str
    table: str
    label: str
    datatype: str


@dataclass(slots=True)
class Relationship:
    id: str
    pred_id: str
    succ_id: str
    type: str = "FS"
    lag_hours: float = 0.0
    external: bool = False


@dataclass(slots=True)
class Activity:
    task_id: str
    project_id: str
    code: str
    name: str
    wbs_id: str = ""
    calendar_id: str = ""
    task_type: str = "TT_Task"
    status: str = NOT_STARTED
    pct_type: str = "Duration"
    phys_pct: float = 0.0
    orig_dur_hours: float = 0.0
    rem_dur_hours: float = 0.0
    total_float_hours: float | None = None
    free_float_hours: float | None = None
    act_start: datetime | None = None
    act_finish: datetime | None = None
    early_start: datetime | None = None
    early_finish: datetime | None = None
    late_start: datetime | None = None
    late_finish: datetime | None = None
    planned_start: datetime | None = None
    planned_finish: datetime | None = None
    expected_finish: datetime | None = None
    cstr_type: str = ""
    cstr_date: datetime | None = None
    cstr_type2: str = ""
    cstr_date2: datetime | None = None
    driving_path: bool | None = None
    budget_units: float = 0.0
    actual_units: float = 0.0
    remaining_units: float = 0.0
    budget_cost: float = 0.0
    actual_cost: float = 0.0
    remaining_cost: float = 0.0
    resource_count: int = 0
    codes: dict = field(default_factory=dict)   # code type id -> code value id
    udfs: dict = field(default_factory=dict)    # udf label -> value

    # ---------------------------------------------------------- derived
    @property
    def is_milestone(self) -> bool:
        return self.task_type in ("TT_Mile", "TT_FinMile")

    @property
    def is_loe(self) -> bool:
        return self.task_type == "TT_LOE"

    @property
    def is_wbs_summary(self) -> bool:
        return self.task_type == "TT_WBS"

    @property
    def start(self) -> datetime | None:
        """P6 'Start': Actual Start if started, else Early Start."""
        return self.act_start or self.early_start or self.planned_start

    @property
    def finish(self) -> datetime | None:
        """P6 'Finish': Actual Finish if complete, else Early Finish."""
        if self.status == COMPLETED:
            return self.act_finish or self.early_finish or self.planned_finish
        return self.early_finish or self.planned_finish

    @property
    def remaining_start(self) -> datetime | None:
        if self.status == COMPLETED:
            return None
        if self.status == IN_PROGRESS:
            return self.early_start or self.act_start
        return self.early_start or self.planned_start

    @property
    def duration_pct(self) -> float:
        if self.status == COMPLETED:
            return 100.0
        if self.status == NOT_STARTED:
            return 0.0
        if self.orig_dur_hours <= 0:
            return 0.0
        return max(0.0, min(100.0, (self.orig_dur_hours - self.rem_dur_hours) / self.orig_dur_hours * 100.0))

    @property
    def units_pct(self) -> float | None:
        if self.status == COMPLETED:
            return 100.0
        total = self.actual_units + self.remaining_units
        if total <= 0:
            return None
        return max(0.0, min(100.0, self.actual_units / total * 100.0))

    def pct_by(self, measure: str) -> float:
        """Percent complete by the requested measure (Physical/Duration/Units/P6)."""
        if self.status == COMPLETED:
            return 100.0
        if measure == "P6":
            measure = self.pct_type
        if measure == "Physical":
            return max(0.0, min(100.0, self.phys_pct))
        if measure == "Units":
            u = self.units_pct
            return u if u is not None else self.duration_pct
        return self.duration_pct


@dataclass
class ProjectInfo:
    id: str
    short_name: str
    name: str = ""
    data_date: datetime | None = None
    plan_start: datetime | None = None
    plan_end: datetime | None = None
    scheduled_finish: datetime | None = None
    critical_type: str = ""            # CT_TotFloat / CT_DrivPath / ""
    critical_float_hours: float | None = None
    default_pct_type: str = ""
    default_calendar_id: str = ""


@dataclass
class Schedule:
    source_name: str
    xer_version: str
    export_date: str
    project: ProjectInfo
    wbs: dict = field(default_factory=dict)            # id -> WBS
    activities: dict = field(default_factory=dict)     # task_id -> Activity
    relationships: list = field(default_factory=list)
    calendars: dict = field(default_factory=dict)      # id -> Calendar
    code_types: dict = field(default_factory=dict)     # id -> CodeType
    code_values: dict = field(default_factory=dict)    # id -> CodeValue
    udf_types: dict = field(default_factory=dict)      # id -> UdfType
    tables_present: list = field(default_factory=list)
    warnings: list = field(default_factory=list)
    availability: dict = field(default_factory=dict)   # feature -> bool

    # Caches rebuilt on demand (not serialized)
    def __post_init__(self) -> None:
        self._reset_cache()

    def _reset_cache(self) -> None:
        self._preds: dict | None = None
        self._succs: dict | None = None
        self._paths: dict = {}
        self._by_code: dict | None = None

    def __getstate__(self):
        d = dict(self.__dict__)
        for k in ("_preds", "_succs", "_paths", "_by_code"):
            d.pop(k, None)
        return d

    def __setstate__(self, state):
        self.__dict__.update(state)
        self._reset_cache()

    # ---------------------------------------------------------- indexes
    def _build_links(self) -> None:
        preds: dict[str, list[Relationship]] = {}
        succs: dict[str, list[Relationship]] = {}
        for r in self.relationships:
            preds.setdefault(r.succ_id, []).append(r)
            succs.setdefault(r.pred_id, []).append(r)
        self._preds, self._succs = preds, succs

    def preds(self, task_id: str) -> list[Relationship]:
        if self._preds is None:
            self._build_links()
        return self._preds.get(task_id, [])

    def succs(self, task_id: str) -> list[Relationship]:
        if self._succs is None:
            self._build_links()
        return self._succs.get(task_id, [])

    def by_code(self, code: str) -> Activity | None:
        if self._by_code is None:
            self._by_code = {a.code: a for a in self.activities.values()}
        return self._by_code.get(code)

    def wbs_path(self, wbs_id: str) -> list[WBS]:
        """WBS nodes from the top (below the project node) down to wbs_id."""
        cached = self._paths.get(wbs_id)
        if cached is not None:
            return cached
        path: list[WBS] = []
        seen = set()
        cur = self.wbs.get(wbs_id)
        while cur is not None and cur.id not in seen:
            seen.add(cur.id)
            if not cur.is_project_node:
                path.append(cur)
            cur = self.wbs.get(cur.parent_id)
        path.reverse()
        self._paths[wbs_id] = path
        return path

    def wbs_path_text(self, wbs_id: str, sep: str = " / ") -> str:
        return sep.join(w.name for w in self.wbs_path(wbs_id))

    def wbs_code_path(self, wbs_id: str) -> str:
        return ".".join(w.code for w in self.wbs_path(wbs_id))

    def calendar(self, activity: Activity) -> Calendar:
        cal = self.calendars.get(activity.calendar_id) or self.calendars.get(self.project.default_calendar_id)
        if cal is None:
            cal = self.calendars.setdefault("__default__", Calendar("__default__", "Default 5-day (assumed)", parsed_ok=False))
        return cal

    def hours_to_days(self, hours: float | None, activity: Activity) -> float | None:
        if hours is None:
            return None
        hpd = self.calendar(activity).hours_per_day or 8.0
        return hours / hpd

    def code_label(self, activity: Activity, type_id: str) -> str:
        vid = activity.codes.get(type_id)
        v = self.code_values.get(vid) if vid else None
        if v is None:
            return ""
        return v.description or v.value

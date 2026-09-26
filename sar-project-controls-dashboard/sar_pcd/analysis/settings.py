"""User-configurable analysis settings (persisted in the project workspace)."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field

MEASURES = ["Auto", "Physical", "Duration", "Units", "P6"]
MEASURE_LABELS = {
    "Auto": "Auto (P6 % complete type of each activity)",
    "Physical": "Physical % Complete",
    "Duration": "Duration % Complete",
    "Units": "Units % Complete",
    "P6": "P6 % complete type of each activity",
}
WEIGHTINGS = ["Auto", "Cost", "Resource Units", "Original Duration", "Activity Count", "Custom UDF"]
CRITICAL_DEFS = ["P6 Project Setting", "Total Float", "Longest Path"]


@dataclass
class AnalysisSettings:
    progress_measure: str = "Auto"
    weighting: str = "Auto"
    custom_weight_udf: str = ""
    weighting_coverage: float = 0.80           # share of activities that must carry weight data for Auto
    critical_definition: str = "P6 Project Setting"
    critical_float_days: float = 0.0           # used when definition = Total Float
    near_critical_days: float = 10.0
    lookahead_weeks: int = 6
    delay_tolerance_days: float = 0.0
    variance_basis: str = "Calendar Days"      # or "Working Days"
    s_curve_period: str = "Monthly"            # or "Weekly"
    # schedule health thresholds (DCMA-style defaults, configurable)
    health: dict = field(default_factory=lambda: {
        "missing_logic_pct": 5.0, "leads_count": 0, "lags_pct": 5.0, "fs_pct_min": 90.0,
        "hard_constraints_pct": 5.0, "high_float_days": 44.0, "high_float_pct": 5.0,
        "negative_float_count": 0, "high_duration_days": 44.0, "high_duration_pct": 5.0,
        "invalid_dates_count": 0, "missed_tasks_pct": 5.0, "cpli_min": 0.95, "bei_min": 0.95,
    })
    # risk bands on Probability x Impact (1..25)
    risk_bands: dict = field(default_factory=lambda: {"Low": 4, "Medium": 9, "High": 16, "Very High": 25})

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "AnalysisSettings":
        base = cls()
        known = set(cls.__dataclass_fields__)
        s = cls(**{k: v for k, v in (d or {}).items() if k in known})
        for k, v in base.health.items():
            s.health.setdefault(k, v)
        return s

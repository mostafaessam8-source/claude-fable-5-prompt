"""Calculation methodology - single source for the UI screen, PDF appendix and docs."""

METHODOLOGY: list[tuple[str, str, str]] = [
    ("Data Date",
     "PROJECT.last_recalc_date of the Current XER",
     "All time-phased values (planned progress, S-curve, lookahead, PV) are evaluated at the Current Data Date. "
     "The Baseline Data Date is shown for reference only."),
    ("Activity % Complete",
     "Physical: TASK.phys_complete_pct · Duration: (Original − Remaining) / Original · Units: Actual / (Actual + Remaining) units",
     "Selected in Settings. 'Auto' uses each activity's P6 % complete type (TASK.complete_pct_type). Completed activities "
     "count as 100%. Units % falls back to Duration % where an activity has no resource units."),
    ("Weights",
     "Cost: budget cost (TASKRSRC.target_cost + PROJCOST.target_cost) · Resource Units: budgeted units · "
     "Original Duration: TASK.target_drtn_hr_cnt / calendar hours per day · Activity Count: 1 · Custom: numeric UDF",
     "'Auto' selects Cost when both schedules are cost-loaded (activities without cost carry zero weight), otherwise "
     "Resource Units when both carry units, otherwise Original Duration. The chosen method and the coverage figures are shown with every "
     "progress KPI. Milestones, LOE and WBS Summary activities have zero weight. Activity percentages are never averaged."),
    ("Actual Progress",
     "Σ(weight_i × %complete_i) / Σ weight_i over current activities",
     "Weights from the current schedule."),
    ("Planned Progress",
     "Σ(BL weight_i × planned fraction_i(Data Date)) / Σ BL weight_i over baseline activities",
     "Planned fraction = working days of the baseline activity elapsed before the Data Date / working days of the "
     "baseline activity (baseline calendar, linear distribution). Deleted baseline activities remain in the plan; "
     "added activities have no baseline and are excluded. No resource curves are read from the XER."),
    ("Progress Variance", "Actual Progress − Planned Progress", "Percentage points."),
    ("Earned Value (cost)",
     "BAC = Σ BL budget · PV = Σ BL budget × planned fraction · EV = Σ BL budget × %complete · AC = Σ actual cost",
     "EV follows P6: baseline budget × performance % complete. Activities without a 1:1 baseline (added / split parts) "
     "earn on their current budget and are listed. AC = TASKRSRC actual regular + overtime cost + PROJCOST actual cost."),
    ("SPI",
     "EV / PV (cost-based) when progress is cost-weighted - otherwise Actual Progress % / Planned Progress % (progress-based)",
     "The KPI card states which variant is shown."),
    ("CPI", "EV / AC",
     "Only when progress is cost-weighted and Actual Cost exists in the Current XER. Never inferred from schedule data. Otherwise 'CPI = N/A'."),
    ("CV / SV", "CV = EV − AC · SV = EV − PV", ""),
    ("EAC / ETC / VAC",
     "EAC = BAC / CPI · ETC = EAC − AC · VAC = BAC − EAC; bottom-up EAC = AC + Σ remaining cost",
     "Both EAC figures are reported."),
    ("Baseline / Forecast Finish",
     "Latest finish of all baseline activities / latest (actual or early) finish of all current activities",
     "PROJECT.scd_end_date is shown alongside for reference."),
    ("Schedule Variance (days)",
     "Baseline Finish − Forecast Finish in calendar days (positive = ahead)",
     "Drill-down lists Longest Path activities with positive finish variance (drivers of completion delay)."),
    ("Activity Variance",
     "Start/Finish variance = Current − Baseline (calendar or working days, Settings); Duration variance = current − baseline original duration",
     "Positive = later / longer than baseline."),
    ("Critical Activities",
     "P6 project setting: Total Float ≤ PROJECT.critical_drtn_hr_cnt (CT_TotFloat) or Longest Path (CT_DrivPath)",
     "Can be overridden in Settings. Completed and LOE activities are excluded."),
    ("Longest Path",
     "TASK.driving_path_flag = 'Y' from the last P6 schedule run",
     "If the flag is absent, the path is traced backwards from the latest-finishing activity through driving "
     "relationships (relationship gap ≤ 0 working days after lag) and labelled 'Computed'. Zero float is never "
     "assumed to mean Longest Path."),
    ("Near-Critical", "Not critical and Total Float ≤ threshold (default 10 days)", "Configurable."),
    ("Total Float (days)", "TASK.total_float_hr_cnt / activity calendar hours per day", ""),
    ("Lookahead",
     "Incomplete activities with Start ≤ Data Date + N weeks and Finish ≥ Data Date, plus overdue activities",
     "Status priority: Completed › Overdue (baseline finish before Data Date) › Critical › Delayed (finish variance > tolerance) › In Progress › Planned."),
    ("Phase / Discipline KPIs",
     "Progress formulas applied to activities mapped to the category",
     "Mapping by the Semantic Mapping Engine; confidence and evidence visible in Mapping Review. Unmapped activities "
     "are reported, never forced into a category."),
    ("Procurement / Engineering status buckets",
     "Completed · Delayed (incomplete and late or overdue) · In Progress · Not Started (mutually exclusive)", ""),
    ("Risk Heatmap",
     "Count of open risks by Probability (1-5) × Impact (1-5); level bands on P×I (Low ≤ 4, Medium ≤ 9, High ≤ 16, Very High ≤ 25)",
     "Only from an imported risk register. Risks are never derived from schedule activities."),
    ("S-Curve",
     "Cumulative weighted progress per period (monthly/weekly)",
     "Planned: baseline weights spread linearly over baseline working days. Actual: earned weight spread between Actual "
     "Start and Actual Finish (or Data Date) - a reconstruction, as the XER holds no progress history. Forecast: "
     "remaining weight spread from remaining start (≥ Data Date) to forecast finish."),
    ("Schedule Health (DCMA-style)",
     "Each check shows population, count, metric, threshold and result",
     "Thresholds are configurable. The DCMA Critical Path Test is not performed because it requires re-scheduling."),
    ("Data Quality Score",
     "100 − Σ penalties of individual findings",
     "Every finding and its penalty is listed; the score never replaces the findings."),
]


def as_markdown() -> str:
    out = ["| KPI | Formula | Notes |", "|---|---|---|"]
    for k, f, n in METHODOLOGY:
        out.append(f"| {k} | {f} | {n} |")
    return "\n".join(out)

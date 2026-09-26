# Calculation Methodology

This document is generated from `sar_pcd/analysis/methodology.py`, the same source used by the
**Calculation Methodology** screen and the appendix of the Full PDF report.

## Principles

1. **Deterministic and auditable** - every KPI object carries its formula, source, weighting method,
   the activities it includes, notes and any manual overrides (click a KPI to see them).
2. **Never fabricate** - missing inputs produce `N/A` with a reason, never an estimate:
   * CPI is calculated only when Actual Cost exists (`CPI = N/A - Cost Data Not Available` / `Actual Cost Not Available`).
   * Cost is never inferred from duration; risks are never inferred from activities.
   * Activities that cannot be mapped are shown as *Not Mapped*, never forced into a category.
3. **Never assume equal weights** - progress is always weighted; the method is chosen automatically
   from data coverage (Cost → Resource Units → Original Duration) or explicitly by the user.
   "Activity Count" weighting exists only as an explicit user choice and is labelled as such.
4. **Zero float ≠ Longest Path** - the Longest Path comes from P6's flag or from tracing driving logic.
5. **Separation of data** - *source data* (XER values), *derived data* (formulas below), *user mapping*
   (overrides in the mapping profile, audit-logged) and *assumptions* (listed in method notes, e.g. the
   default critical definition when the XER omits it) are kept apart and labelled.

## KPI formulas

| KPI | Formula | Notes |
|---|---|---|
| Data Date | PROJECT.last_recalc_date of the Current XER | All time-phased values (planned progress, S-curve, lookahead, PV) are evaluated at the Current Data Date. The Baseline Data Date is shown for reference only. |
| Activity % Complete | Physical: TASK.phys_complete_pct · Duration: (Original − Remaining) / Original · Units: Actual / (Actual + Remaining) units | Selected in Settings. 'Auto' uses each activity's P6 % complete type (TASK.complete_pct_type). Completed activities count as 100%. Units % falls back to Duration % where an activity has no resource units. |
| Weights | Cost: budget cost (TASKRSRC.target_cost + PROJCOST.target_cost) · Resource Units: budgeted units · Original Duration: TASK.target_drtn_hr_cnt / calendar hours per day · Activity Count: 1 · Custom: numeric UDF | 'Auto' selects Cost when ≥ 80% of weightable activities in both schedules are cost-loaded, otherwise Resource Units on the same test, otherwise Original Duration. The chosen method and the coverage figures are shown with every progress KPI. Milestones, LOE and WBS Summary activities have zero weight. Activity percentages are never averaged. |
| Actual Progress | Σ(weight_i × %complete_i) / Σ weight_i over current activities | Weights from the current schedule. |
| Planned Progress | Σ(BL weight_i × planned fraction_i(Data Date)) / Σ BL weight_i over baseline activities | Planned fraction = working days of the baseline activity elapsed before the Data Date / working days of the baseline activity (baseline calendar, linear distribution). Deleted baseline activities remain in the plan; added activities have no baseline and are excluded. No resource curves are read from the XER. |
| Progress Variance | Actual Progress − Planned Progress | Percentage points. |
| Earned Value (cost) | BAC = Σ BL budget · PV = Σ BL budget × planned fraction · EV = Σ BL budget × %complete · AC = Σ actual cost | EV follows P6: baseline budget × performance % complete. Activities without a 1:1 baseline (added / split parts) earn on their current budget and are listed. AC = TASKRSRC actual regular + overtime cost + PROJCOST actual cost. |
| SPI | EV / PV (cost-based) - or, when the baseline is not cost-loaded, Actual Progress % / Planned Progress % (progress-based) | The KPI card states which variant is shown. |
| CPI | EV / AC | Only when Actual Cost exists in the Current XER. Never inferred from schedule data. Otherwise 'CPI = N/A'. |
| CV / SV | CV = EV − AC · SV = EV − PV |  |
| EAC / ETC / VAC | EAC = BAC / CPI · ETC = EAC − AC · VAC = BAC − EAC; bottom-up EAC = AC + Σ remaining cost | Both EAC figures are reported. |
| Baseline / Forecast Finish | Latest finish of all baseline activities / latest (actual or early) finish of all current activities | PROJECT.scd_end_date is shown alongside for reference. |
| Schedule Variance (days) | Baseline Finish − Forecast Finish in calendar days (positive = ahead) | Drill-down lists Longest Path activities with positive finish variance (drivers of completion delay). |
| Activity Variance | Start/Finish variance = Current − Baseline (calendar or working days, Settings); Duration variance = current − baseline original duration | Positive = later / longer than baseline. |
| Critical Activities | P6 project setting: Total Float ≤ PROJECT.critical_drtn_hr_cnt (CT_TotFloat) or Longest Path (CT_DrivPath) | Can be overridden in Settings. Completed and LOE activities are excluded. |
| Longest Path | TASK.driving_path_flag = 'Y' from the last P6 schedule run | If the flag is absent, the path is traced backwards from the latest-finishing activity through driving relationships (relationship gap ≤ 0 working days after lag) and labelled 'Computed'. Zero float is never assumed to mean Longest Path. |
| Near-Critical | Not critical and Total Float ≤ threshold (default 10 days) | Configurable. |
| Total Float (days) | TASK.total_float_hr_cnt / activity calendar hours per day |  |
| Lookahead | Incomplete activities with Start ≤ Data Date + N weeks and Finish ≥ Data Date, plus overdue activities | Status priority: Completed › Overdue (baseline finish before Data Date) › Critical › Delayed (finish variance > tolerance) › In Progress › Planned. |
| Phase / Discipline KPIs | Progress formulas applied to activities mapped to the category | Mapping by the Semantic Mapping Engine; confidence and evidence visible in Mapping Review. Unmapped activities are reported, never forced into a category. |
| Procurement / Engineering status buckets | Completed · Delayed (incomplete and late or overdue) · In Progress · Not Started (mutually exclusive) |  |
| Risk Heatmap | Count of open risks by Probability (1-5) × Impact (1-5); level bands on P×I (Low ≤ 4, Medium ≤ 9, High ≤ 16, Very High ≤ 25) | Only from an imported risk register. Risks are never derived from schedule activities. |
| S-Curve | Cumulative weighted progress per period (monthly/weekly) | Planned: baseline weights spread linearly over baseline working days. Actual: earned weight spread between Actual Start and Actual Finish (or Data Date) - a reconstruction, as the XER holds no progress history. Forecast: remaining weight spread from remaining start (≥ Data Date) to forecast finish. |
| Schedule Health (DCMA-style) | Each check shows population, count, metric, threshold and result | Thresholds are configurable. The DCMA Critical Path Test is not performed because it requires re-scheduling. |
| Data Quality Score | 100 − Σ penalties of individual findings | Every finding and its penalty is listed; the score never replaces the findings. |

## Worked example (automated test `test_planned_and_actual_progress_are_weighted_not_averaged`)

Two activities on a Mon-Fri calendar: A (10 d, budget 10,000) and B (10 d, budget 30,000), B follows A.
Data Date = working day 5, A is 50 % physically complete.

* Planned = 10,000 × 5/10 / 40,000 = **12.5 %**; Actual = 10,000 × 50 % / 40,000 = **12.5 %**.
* When A is complete and B not started, Actual = **25 %** (a simple average of activity percentages would wrongly give 50 %).

## Known limitations (flagged in the application)

* The XER contains no progress history: the actual S-curve before the Data Date is a reconstruction from actual dates.
* Planned progress uses linear distribution over baseline working days; resource curves are not read.
* The DCMA *Critical Path Test* is reported as *Not Performed* because it requires re-scheduling the network.
* The computed Longest Path (used only when the P6 flag is absent) uses a ±1 working-day tolerance on relationship gaps.

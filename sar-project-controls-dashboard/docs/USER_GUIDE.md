# SAR Project Controls Dashboard - User Guide

## 1. Start

Launch **SAR_Project_Controls_Dashboard.exe**. On the welcome screen choose:

* **New Project (Import XER)** - the import wizard.
* **Open Project** - an existing `.sarpcd` workspace (double-clicking a `.sarpcd` file also works).
* **Open Demo Project** - a fictional rail project that exercises every screen.

Primavera P6 does not need to be installed. Nothing is uploaded; all processing is local.

## 2. Import wizard

| Step | What happens |
|---|---|
| Project | Name and location of the workspace; optionally reuse a Mapping Profile saved from another project. |
| 1 Baseline XER | Select the **Approved Baseline** export. |
| 2 Current XER | Select the **Current / Updated** schedule. Its Data Date drives all time-phased KPIs. |
| 3 Projects | If an XER contains several projects, pick one for each file. P6 version and encoding are shown. |
| 4-9 | Validation, normalization, activity matching, semantic classification, mapping summary and data-quality check, with progress. Warnings such as *"17 activities could not be confidently mapped…"* are shown before the dashboard opens. |

Export XERs from P6 with *File ▸ Export ▸ Primavera PM (XER)*. Include resource assignments and
expenses if you want cost KPIs.

## 3. Screens

| Screen | Content |
|---|---|
| Executive Dashboard | KPI cards (Progress, Schedule, SPI, CPI, Critical Path, Risks), P6 Gantt, S-Curve, Risk Heatmap, Procurement status, Phase progress, 6-week Lookahead, Cost by Discipline. **Click any card** for the drill-down with formula, source, weighting, data date, baseline reference, overrides and the activity list. |
| Schedule | Full P6-style table + Gantt with WBS hierarchy (baseline, actual, remaining, critical bars, milestones, data date). Double-click for activity details and logic. |
| S-Curve | Baseline Planned / Actual / Forecast, monthly or weekly, zoom/pan toolbar, hover values, period table. |
| Critical Path | Definition used (from the P6 project setting), Longest Path chain, critical, near-critical, negative float, changes vs baseline. |
| Baseline Comparison | Added, deleted, split, renamed, changed durations/logic/constraints/calendars/WBS/codes/dates; top delayed activities and milestones; WBS variance; activities driving the completion delay. |
| Lookahead | 2/4/6/8-week windows with Completed / In Progress / Planned / Delayed / Critical / Overdue status. |
| Engineering / Procurement / Construction | Progress planned vs actual, status donut, stages (submittal → approval → PO → manufacturing → FAT → shipping → delivery…, where present), delayed/overdue, critical, pending approvals, active workfronts, upcoming work. |
| Milestones | Baseline vs current dates, variance and status. |
| Cost / EVM | BAC, PV, EV, AC, SV, CV, SPI, CPI, EAC (CPI and bottom-up), ETC, VAC - only when cost data exists. |
| Risks | 5 × 5 heatmap and register (import CSV/XLSX: Risk ID, Title, Probability, Impact, Owner, Status, Activity ID, Response). Without a register: *Risk Data Not Available*. |
| Schedule Health | DCMA-style checks with population, count, metric, threshold and result; double-click to list activities. |
| Mapping Review | Activity mapping (low confidence first), WBS mapping, activity-code mapping (dimension of each code type, category per code value) and Activity Reconciliation (accept a candidate match or mark as new). |
| Data Validation | Individual findings with the penalty each contributes to the score. |
| Calculation Methodology | Every formula, plus the method active for this project. |
| Audit Trail | Imports (with SHA-256), overrides, reconciliation decisions, settings changes, exports. |
| Settings | Progress measure, weighting, critical definition, thresholds, DCMA thresholds, risk bands, and the keyword dictionary editor (categories, keywords with weight / exact-only / suppress-if, synonyms). Save / load mapping profiles. |

## 4. Filters and search

The filter bar (Project Phase, Discipline, WBS, Work Package, Activity Code, Contractor, Location,
Time Period) and the global search recalculate every KPI and chart for the selection. Discipline,
Location, Contractor and Work Package are filled from activity codes / text UDFs whose names are
recognised (e.g. *Discipline*, *DISC*, *Area*, *Zone*, *Subcontractor*, *PKG*). If your codes use other
names, set their dimension in **Mapping Review ▸ Activity Code Mapping**.

## 5. Monthly update

**File ▸ Import New Current Update XER** replaces the current schedule and keeps the baseline, the
mapping profile and all overrides. The history of imported files is kept in the Audit Trail.

## 6. Exports

**Export** menu: PDF Executive Dashboard, PDF Full Project Controls Report (A3 or A4 landscape, SAR
cover page with project, data date, report period, generated date and source XER names), Excel
Detailed Analysis, Lookahead, Critical Activities, Baseline Comparison, Schedule Health, a
high-resolution dashboard PNG and a PNG of the current screen. Every activity list also has
*Export to Excel*.

## 7. Command line (automation)

```
SAR_PCD_CLI.exe analyze --baseline BL.xer --current UPD.xer [--risks register.xlsx]
                [--pdf exec.pdf] [--pdf-full report.pdf] [--excel analysis.xlsx] [--png dash.png] [--size A3|A4]
SAR_PCD_CLI.exe demo --out C:\temp\demo
```

## 8. Messages you may see

* *Cost data was not found in this XER. Cost-based KPIs will be disabled.* - export resource assignments / expenses from P6.
* *CPI = N/A - Actual Cost Not Available* - budgets exist but no actual cost was applied.
* *N activities could not be confidently mapped…* - resolve in Mapping Review; decisions are saved.
* *Baseline matching confidence is low for N activities* - resolve in Activity Reconciliation.
* *The XER does not carry P6's Longest Path flag…* - the Longest Path was computed from logic.

Error details are written to `%LOCALAPPDATA%\SAR_Project_Controls_Dashboard\logs\sar_pcd.log` (see Help ▸ About).

# Zulfi Train Station: project files and database

Planning files for the Zulfi Passenger Railway Station (SAR EPC contract, SAR 99,999,000 excl. VAT, 26 months from Notice to Proceed).
The Notice to Proceed date is **not confirmed**, so every calendar date is indicative and months are counted from the NTP.

## Database
`database/zulfi.db` is a SQLite database. The same tables are in `database/csv/` and `database/zulfi_data.json`. Rebuild with `python3 database/build_db.py`.

| Table | Content |
|---|---|
| `project` | Key facts, contract value, duration, parties |
| `boq_items` | 18 BOQ lines (1.1 to 7.3), group, phase, lead class, value, scope description |
| `phases`, `milestones` | Phase 1 / Phase 2 windows and gate milestones (months from NTP) |
| `cash_flow_quarterly`, `cash_flow_semiannual` | Progress value and net cash, SAR million, cumulative % |
| `cost_components` | Engineering, design, procurement, material, construction, preliminaries |
| `tga_requirements`, `authorities`, `approval_durations`, `design_gates`, `documents_by_stage` | TGA clause 18 process, approvals, days, gates, documents |
| `project_status`, `open_points` | Current status and items to confirm |
| `tga_process_activities_draft` | Draft TGA activities with predecessor logic for the next baseline submittal |
| `bl02_activities`, `bl02_relationships`, `bl02_critical_path` | The ZULFI-BL02 baseline: 597 activities (52 new TGA / permit activities), 1,086 relationships, the 35-activity critical path |
| `deliverables` | Inventory of files |

Views: `v_long_lead`, `v_value_by_group`, `v_value_by_phase`, `v_bl02_near_critical_tga`. Run `database/build_db.py` then `database/add_bl02_tables.py` to rebuild. Example: `SELECT * FROM v_long_lead;`
Basis tags: C contract scope, B baseline assumption, S SAR procedure, T to be confirmed, D draft proposal.

## Files
- `baseline-bl02/`: **ZULFI-BL02 baseline submittal**: `Zulfi_Baseline_Programme_BL02_TGA.xer` (P6), logic and critical path workbook, critical path and TGA Gantt charts (PDF, PNG), submittal report (docx, pdf), `scripts/` (CPM engine matched to the XER, spec of the added activities, XER writer, report builders).
- `cost-review/`: review of the BOQ phase values: `ZULFI-BOQ_Corrected.xlsx` (repaired formulas, FF&E reference, Contract Phase coding and a Phase Reconciliation sheet) and the script that applied the fixes. The file as received is `source-files/ZULFI-BOQ_as_received.xlsx`.
- `source-files/C001/`: the original project files as received (baseline XER, BOQ mapping and control workbooks, narrative, cash flow, trackers, schedule-review deck, and four SAR documents).
- `deliverables/`: TGA approvals deck (14 slides), long-lead deck (2 slides), procurement list.
- `src/tga-deck/`: pptxgenjs builders and `motion.py` (slide transition and inner animation). Run `npm install pptxgenjs@3.12.0`, `node build.js`, `python3 motion.py stage.pptx out.pptx`.
- `src/ceo-briefing/`: source of the CEO briefing deck, rebuilt from the project history. Run `gen_deck_json.py`; it also needs the theme files, logos, `map.png` and `train_art.png`.
- `recovered/`: scripts read during the project (Awj kick-off builders, English schedule-review deck).

## Recovered
The baseline XER, BOQ workbooks, narrative and trackers were recovered from `C001.rar` and are in `source-files/C001/`. The scheduling engine itself was not recovered; `baseline-bl02/scripts/cpm.py` is a new CPM engine written against the XER (it reproduces all 545 baseline dates and the same 113 critical activities).

## Confidentiality
`source-files/C001/` includes four SAR documents marked Internal (Scope of Works, Work Permit Handbook, operating-rules change procedure, functional audit program). They were added on the project manager's instruction. **This repository is public**: make it private or remove those four files if they must not be public.

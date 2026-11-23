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
| `deliverables` | Inventory of files and what was lost |

Views: `v_long_lead`, `v_value_by_group`, `v_value_by_phase`. Example: `SELECT * FROM v_long_lead;`
Basis tags: C contract scope, B baseline assumption, S SAR procedure, T to be confirmed, D draft proposal.

## Files
- `deliverables/`: TGA approvals deck (14 slides), long-lead deck (2 slides), procurement list.
- `src/tga-deck/`: pptxgenjs builders and `motion.py` (slide transition and inner animation). Run `npm install pptxgenjs@3.12.0`, `node build.js`, `python3 motion.py stage.pptx out.pptx`.
- `src/ceo-briefing/`: source of the CEO briefing deck, rebuilt from the project history. Run `gen_deck_json.py`; it also needs the theme files, logos, `map.png` and `train_art.png`.
- `recovered/`: scripts read during the project (Awj kick-off builders, English schedule-review deck).

## Not recovered
The baseline P6 file (`Zulfi_Baseline_Programme.xer`, 518 activities), the scheduling engine and several earlier workbooks and decks were lost when the working container was reset. The values in the database come from figures kept in the project history. To continue the baseline work (adding the TGA process activities, logic and critical path), the last XER delivered is needed.

## Confidentiality
The SAR documents received (Scope of Works, operating-rules change procedure, functional audit program, records procedure) are marked Internal and are **not** in this repository, which is public.

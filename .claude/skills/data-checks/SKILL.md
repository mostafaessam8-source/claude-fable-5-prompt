---
name: data-checks
description: Rules for the Data Checks in sar-cost-dashboard. They test the loaded data for values that are not logical, out of date, or that disagree between the source files, and show warnings on the Data Checks page, in the header chip, on the import page and in a box on each project's dashboard and card. Use when a warning is wrong, missing or too noisy, when a new rule is wanted, or when the user asks why a project shows a warning. Arabic triggers: "تحذير", "مش منطقي", "شيك على البيانات", "محتاج تحديث", "data warnings", "Data Checks".
---

# Data checks: loaded data → warnings

Code: `sar-cost-dashboard/assets/js/datacheck.js` (`SARChecks`).
- Page: id `data-checks` in the Data group. It is not in published reports and has no Publish button.
- Header chip: `#dqChip` (class `js-editor`). Under 1700 px it shows the count only.
- Import page note: in `renderImport` (app.js).
- Per-project box: `SARChecks.inline(host, code)`, called from the project card (`cardDetail` in pages.js) only — removed from the Progress project dashboard at the user's request.
- Styles: `.dq-*` in styles.css.

## Types (keep these three)
- **Not logical** (`error`): impossible values, e.g. % outside 0–100, finish before start, paid > contract value,
  negative counts, cumulative going down, actual entered for future periods.
- **Needs update** (`warn`): dates that have passed while the work is not done (forecast finish, milestones, concern target
  dates, issue due dates, close-out steps), closed months with no actual, empty key fields, old data.
- **Check** (`info`): two files disagree (spend plan ↔ weekly report, card ↔ weekly report), a field that doesn't match
  its own formula (SPI, Variance days, Paid %), or no target date (TBD).

## Always show the source (user rule)
Every finding must say where the value sits.
- `where(f)` builds `f.where` = file › table / sheet › column › row.
- For weekly-report findings it also builds `f.from` = the project's own file › its sheet (Masterdata_Reporting,
  S-Curve Data, …), which is where to fix it.
- Both show:
  - in the "Source (where to fix)" column of the Data Checks table, and in its CSV export
  - in the per-project box
- A new section must get an entry in the `T` map inside `where`.
- When answering the user about a finding, also give the exact file, sheet and cell.

## Data source filter
Each finding carries `ds` / `dsKey` / `dsFile`: the Data Import source it comes from (the `SRC_KEY` map in `run`):
- weekly report, S-curve, milestones, concerns, deliverables → **PBI Weekly Report**
- spend plan → **Delivery Plan**
- Budget 2026 → **budget**
- project card, issue register → **EP – NSR Projects**
- closing → **Projects in Closing Phase**
- "Data" findings → by field

The page filters by it ("Data source (file)"). The list has every Data Import source in `SARImporter.SOURCES` order,
plus Progress photos and the Weekly PowerPoint template, whether they have findings or not. Each entry shows its count
("✓ no findings" when clean) and the imported file name; a clean source shows a ✓ message instead of an empty table. The old area filter is now
"Section"; it lists only the sections of the chosen file. A new finding source must be added to `SRC_KEY`.

## How it works
- The reference date is the weekly report date (`D.reportDate`). Use today only for the "data is old" check.
- Every rule is listed in `RULES` at the top of the file. That list is shown under "What is checked" on the page, so
  update it together with the code.
- A finding = { sev, rule, code, name, src, field, msg, go }. `msg` must name the value(s) and say what to fix. `go` is
  the page to open on a row click: weekly data → Progress project dashboard, spend plan → Cost, card → Project Cards,
  closing → Projects in Closing, issues → Issue Register.
- Group many items from one source into one finding per project when they are the same kind (card milestones, close-out
  steps without a date, negative phase KPIs).
- "Mark OK" is per browser (localStorage `sar-datacheck-ok`), keyed by the finding text, so a changed value comes
  back as a new finding.
- Thresholds:
  - Progress tolerance 0.05 pp.
  - SPI ±0.05 vs actual ÷ planned.
  - Variance ±2 days.
  - Paid % ±2 pp.
  - Money 1 %.
  - Card and weekly forecast finish more than 30 days apart.
  - A report more than 6 days behind the others.
  - Data more than 10 days old.
  - A card more than 40 days older than the newest card.
- Don't compare weekly "Submitted Amount" with the spend plan's work confirmed: they are different things.

## Contract effective date rule (restored at the user's request)
- Weekly "(Con) Contract Effective Date" after the report date with progress > 0 is a **Not logical** finding.
- The message says when the date equals the project's finish date, or the same date as another project. Example: 0647
  and 0745 both carry 08-Sep-2027 in Masterdata_Reporting AD2; the 0745 file looks copied from 0647, and its Work
  Confirmation 5,000,000 is the same as 0647's.
- It was removed once and then restored; keep it.

## When changing it
- No project data, codes or names in code, comments or this file (public repository).
- Test against real data: import the cloud files in a browser and dump `SARChecks.run(SARApp.D).list`. Read every new
  finding and look for false positives before committing. Check the page at 1440 / 1920 / 390 px.
- Then run `npm run release` in `sar-cost-dashboard`, commit with the session trailers, and push to the working branch.

## Weekly report files — full review (user request: "تشيك علي كل الملف … كانك استشارى بيستلم التقرير الأسبوعي")
- Code: `assets/js/wkaudit.js` (`SARWeeklyAudit.auditBook / fromBuffer / cross / RULES`), run from `SARPhotos.importFiles` for
  every workbook in the .rar / .zip; `app.js applyAudit` stores table `Weekly_File_Audit` (rows: File, Code, Sheet, Cell,
  Severity, Section, Rule, Finding, Fix, ReportDate) and source `wkaudit`.
- `datacheck.js run()` turns each row into a finding with `dsKey "wkfiles"`, `src` = sheet name (Section filter),
  `where` = file › sheet › cell(s). The message ends with "→ what to fix". Also a warning when the .rar files are newer
  than the PBI Weekly Report on the site.
- Rules find their cells by label / header text (the SAR template is the same in all files, but rows move a little).
  Every rule group runs in `safe()`, so a changed layout gives one "could not be fully checked" note instead of breaking.
- Keep a rule only if it is a real reviewer comment. Tested on the 15-Oct-2026 archive (13 files, ~200 findings).
  Removed false alarms: milestone variance written with either sign, "Solved" counts as closed, m/d/yyyy text dates,
  manpower cell holding man-hours reported once as its own error.
- Node test: `node <scratch>/run.js <site dir> <folder of extracted xlsx>` (extract the .rar with `assets/vendor/unrar.min.js`
  + `unrar.wasm` in Node, global.window = global).

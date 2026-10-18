---
name: combined-workbook
description: Rules for the combined "EPBU NSR Projects Database" Excel workbook (PBI Weekly Report + 2026 Delivery Plan in one SAR-template file) and how the dashboard site reads it. Use when the user asks to change, rebuild or extend that workbook, its Dashboard / Data Checks / Review Notes sheets, or when the site reads it wrongly. Arabic triggers: "الملف الموحد", "ندمجهم بملف واحد", "قاعدة البيانات", "تمبلت سار", "Projects Database".
---

# Combined workbook: weekly report + delivery plan

Status: **test version for discussion**. The old two files must keep working on the site until the user approves the new
file. Never remove the old import path.

## Hard rules
- The base is the **PBI Weekly Report** package. Its Power Query (customXml DataMashup), connections.xml, queryTables,
  Data Model (xl/model), externalLink and webextensions must stay **byte-identical**. openpyxl destroys them, so the new
  sheets are added at XML level (`workbook-tools/merge.py`). Check after every build: only `[Content_Types].xml`,
  docProps/app.xml, workbook.xml(+rels), styles.xml and the weekly sheet XMLs (tab colour / tabSelected only) may change.
- Do not edit or delete the queries. Duplicate query sheets (`Project Milestones Progress `, `Master Plan`, `Old_PBI`,
  `Sheet1 (2)`) are hidden, not deleted (the Data Model and the site still read some of them).
- The file is in English, Arial, SAR colours (teal 00778B, dark 3D3935). Colour code: blue text + pale-yellow fill =
  input, bright yellow = key setting, black = formula, green = read from the weekly files. Header colour says the same
  (teal input / dark calculated / green weekly). Row 3 of each input sheet names the source of every column.
- Formulas: INDEX/MATCH, SUMIFS, `_xlfn.TEXTJOIN` only (no XLOOKUP/FILTER/UNIQUE). Weekly lookups find the column by
  its header text in row 3 (robust to query column moves) and the row by `Project Code`.
- No duplicated data: static project fields live once in `Projects`; months only in `Monthly_Plan`; KPIs once in
  `KPI_Scorecard`; target dates in `Delivery_Targets`. Everything else is calculated.
- KPI actuals come from the data whenever the data exists (user rule: "تتحسب اوتوماتيك من الويكلي ريبوت").
  KPI Scorecard › Measured From = Monthly Plan (spend KPIs), Weekly Report (calculated in the "Weekly report inputs"
  block under the table, every line naming its weekly column) or Manual (not in any source: IWI needs train-km, SPAI,
  revenues, EBITDA, OPEX, PCG, local content, strategy, audit). Formulas follow the 2026 Balanced Scorecard file
  (kpiTargets source): SPI = ΣEV ÷ ΣPV; Five Bridges = Actual % of the Linked Project (N003); % delivery = projects with
  weekly Actual % = 100% ÷ projects whose target date ≤ report date (Delivery KPI › Due / Delivered); FWI =
  (fatalities + major/10 + minor/200 + near misses/1000) ÷ man-hours × 1e6 with major = Lost Time + Restricted
  Work-Day, minor = Medical Treatment + First Aid (cumulative figures). "Better When" = Lower → % achieved = target ÷ actual.
- One YTD cut-off (`Settings!B6`, name `cfg_YTDMonth`); next month = cut-off + 1; report date = latest weekly Report Date.
- Every finding in *Review Notes* gives its source as file › sheet › cells (user rule: always show the source).
- Cached values come from LibreOffice (`recalc.py` of the xlsx skill) on the standalone build, then merge.py writes
  them into the formula cells; `fullCalcOnLoad="1"` makes Excel recalc on open. libreoffice-calc may need
  `apt-get update && apt-get install -y --no-install-recommends libreoffice-calc` in a fresh container.
- The public repo must not hold the workbook or its data: `workbook-tools/` holds code only. Findings text and the
  model JSON stay in the scratchpad.

## Build steps (scratchpad)
1. `extract.py <delivery plan.xlsx> <weekly.xlsx> model.json` → normalized projects / monthly / KPIs / delivery / glossary.
2. Add `findings` (list of [topic, source, found, new file does, decision]) to model.json.
3. `build.py model.json weekly.xlsx new.xlsx` → standalone sheets + a value copy of *Weekly Report Updates*.
4. Copy to new_calc.xlsx and run `recalc.py` (must report 0 errors).
5. `merge.py weekly.xlsx new.xlsx new_calc.xlsx outdir "EPBU NSR Projects Database.xlsx"`.
6. `node cmp.js <site dir> <old plan.xlsx> <combined.xlsx> <old weekly.xlsx>`: weekly tables must be identical; plan table
   differences must only be the intended fixes (V0 cum, next month, YTD cut-off, stale caches).

## Site
`importer.js`: `isCombined(names)` (tables Projects + Monthly_Plan + KPI_Scorecard) → `res.extra = [planFromCombined(...)]`.
`app.js` handleFiles stores every `extra` source with `combinedWith`; the Data Import card shows "from the combined
workbook" and its download button downloads the combined file.

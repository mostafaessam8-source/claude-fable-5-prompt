---
name: monthly-card-update
description: The monthly update of the new month's "EP - NSR Projects <Month>.xlsx" project-card file in sar-cost-dashboard — section 7 S-curve actuals and section 8 activity % / dates from the PBI Weekly Report (Progress data), the date rules for every card, and the project managers' feedback into the "PM Feedback" cell. Use every month when the user sends the new month's cards file ("ملف الشهر الجديد", "حدث الكروت", "حدثلي المشاريع", "S-curve سيكشن 7", "سيكشن 8", "PM Feedback"), or when they want a rule of this monthly update changed.
---

# Monthly card update (new month's EP - NSR Projects file)

The user sends the new month's cards file (and sometimes PM e-mails). Do the update **from the site** (Card Updates (Team)
page → step 3 "Update S-curve from Progress"), as the user asked, then check the result and send back the file + report.
Code: `SARCardForm.scurve` (cardform.js) with `prog.rules` + `prog.feedback`, UI in cardupdates.js (month, PM feedback box).
Detailed S-curve rules: see the `card-updates` skill (section "S-curve & forecast finish from the Progress data").

## Inputs
- The cards file: put it in its own scratch folder (untrusted upload). Check it opens (not encrypted: no D0 CF 11 E0).
- Progress data = what the site holds for the PBI Weekly Report: `index.json` → `sources.weekly` in the private data repo
  (`mostafaessam8-source/nsr-dashboard-data`, attach + clone if missing). Use that file (the combined workbook or the
  PBI Weekly Report) and note its Report Date in the reply.
- Month = the month of the file (e.g. Oct-2026 for "Oct26"); month end = its last day.

## Rules (from the user, Oct 2026)
1. **Section 7** (Execution Schedule, row "Actual Progress (%)"): the month's cell = report cumulative actual − the card's
   earlier months, so the total to the month equals the report; earlier months stay as in the card ("والباقي يوزع كما
   بالملف"). PO projects: the PO block of the report's contract. Negative → 0.0001 + warning.
1b. **The card must end at 100%** (user rule): 100% − the total to the month is spread over the open months after it
   (execution months only; FCC columns, where the month dates restart, are left out) **in an S-curve shape, never equal
   shares**: the report's S-curve forecast (Cum Forecast % at each month end) gives each month's share, scaled so the card
   reaches exactly 100% (no lump in the last month); when the report's forecast is already complete by the month, the
   tail of a standard S-curve over the execution period is used (F(t)=t²(3−2t), share of month k = F(k/N) − F((k−1)/N)).
   Existing values in those months are replaced; a month with no share is left empty. Typed values left in month
   columns that are closed (no month date, beyond the execution period) are cleared and reported (they pushed 0647 to 102.6%).
   A card whose month column is not open (e.g. 0626, "Month 16" label missing in R75) cannot be closed at 100% — report it.
   Check: run step 3 again on the result — no "rest" lines and the same month values = every card ends at 100%
   (LibreOffice does not recalculate these cards reliably; the site's XLCalc matches Excel).
   A date stated by the PM (e.g. the last delivery of Procurement) is set after the run and listed in the report.
2. **Section 8** (Project Timeline, Execution Phase activities): % spread from the report's phases so Σ weight × % / Σ
   weight = the report actual; never lower an activity; forecast finish of unfinished activities = the report's forecast.
3. **Date rules for every card** (not only the weekly projects), after 1–2:
   - Creation / Initiation / Planning / Tendering activities not at 100% → end (col K) must be after the month.
   - Execution activities not at 100% → end after the month; at 0% → start (col J) after the month too.
   - New end = the report's forecast finish when it is after the month, else **end of next month** (user's choice);
     new start = **1st of next month**; the end is never before the start. Phase head rows are not touched.
   - A date cell holding a **formula is left as is** (user's choice) and listed "update by hand" — it often follows the
     start that was moved. Locked / protected cells are never written.
4. **PM feedback** (from the PM's message): one line per project in the step-3 box, `CODE: text` (a line without a code
   continues the project above). Written on top of the yellow cell under "PM Feedback" (section 6), dated like the lines
   already there ("27 Oct 2026:" or "27-Oct-2026:"), earlier lines kept. Write it in clear English. Match the project
   by its card (e.g. Heet design and the Heet rail monitoring system are both on the 6203 card). If a PM message states a
   date that the rules would set otherwise (e.g. the last delivery date for Procurement), use the PM's date and say so.
5. **Who may change what**: only what belongs to the project manager (yellow / unlocked PM cells, the section 7 monthly
   actual, section 8 forecast/actual dates and %). Never PMO-office cells (EPMO Feedback, Reason for delay, baseline /
   revised baseline, budget, contracting info, formulas), even when unlocked. Never remove, change or re-hash any
   protection or password. When in doubt, ask the user before writing.

## Run (Playwright on the local site)
- `python3 -m http.server` in sar-cost-dashboard; Data Import ← the weekly source file; Card Updates → step 3: drop the
  cards file, month, PM feedback text, "Update S-curve from Progress", download the workbook and the CSV report.

## Check before sending
- Only the cells in the report changed (compare every sheet with openpyxl; ArrayFormula objects compare by `.text`);
  no style id changed; no locked cell changed except the section 7 / PO actual rows.
- Per weekly project: section 7 total to the month = report %, execution weighted % = report % (PO projects: the PO's
  activity = report %). Explain the exceptions (activities already above the report are never lowered; a card whose
  month column is not open, e.g. a missing "Month N" label — never repaired silently).
- The file opens (LibreOffice convert) and Excel recalculates on open (fullCalcOnLoad, calcChain removed).

## Reply (Egyptian Arabic, short)
Outcome first; the numbers per project with sources (file › sheet › cell); what was not applied and why (formula cells,
missing month label, report below the card); the PM feedback written; open questions. Send the workbook + CSV report.

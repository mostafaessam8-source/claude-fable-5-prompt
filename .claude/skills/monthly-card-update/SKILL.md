---
name: monthly-card-update
description: The monthly update of the new month's "EP - NSR Projects <Month>.xlsx" project-card file in sar-cost-dashboard — section 7 S-curve actuals and section 8 activity % / dates from the PBI Weekly Report (Progress data), the passed-date check for every card, and the project managers' feedback into the "PM Feedback" cell. Use every month when the user sends the new month's cards file ("ملف الشهر الجديد", "حدث الكروت", "حدثلي المشاريع", "S-curve سيكشن 7", "سيكشن 8", "PM Feedback"), or when they want a rule of this monthly update changed.
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

## Rules (from the user, Oct 2026 — corrected after the user's own Oct file)
1. **Section 7** (Execution Schedule, row "Actual Progress (%)"): the month's cell = the weekly report's cumulative actual
   **of the last report of the month** − the card's earlier months, so the total to the month equals the report; earlier
   months stay as in the card. PO projects: the PO block of the report's contract. Negative → 0.0001 + warning.
1b. **The card must end at 100%**: 100% − the total to the month is spread over the open months after it (execution
   months only; FCC columns, where the month dates restart, are left out). The months follow the card's own section 8
   forecast dates. Shape, in this order:
   - the card already has values in those months (typed by the PM) → keep their shape, scaled to what is left;
   - else the report's S-curve forecast (Cum Forecast % at each month end), scaled to reach exactly 100%;
   - else the tail of a standard S-curve over the execution period (F(t)=t²(3−2t)). Never equal shares.
   Typed values in month columns that are closed (no month date) are cleared and reported.
   **No month after the update month while progress is left** (the last month of the table is the current month, or the
   forecast dates are missing) → write nothing, list it "to discuss": management decides (new forecast dates / more months).
   A card whose month column is not open (e.g. 0626, "Month 16" label missing in R75) → report it.
2. **Section 8** (Project Timeline, Execution Phase activities, col N): **from the weekly report, activity by activity**
   (Project_Milestones_Progress, matched by the activity name — the Description column, not WSB, which is shifted in the
   Combine table). A report % below the card is still written, with a warning. Activities not in the report are spread
   so Σ weight × % / Σ weight = the report actual (an activity not started whose start is after the month is never moved);
   what is still off is a warning ("check the weights with the PM"). Dates (J/K) are **not** taken from the report.
3. **Passed dates: tell the user, case by case — never change them** ("اى حاجه تاريخها عدى لازم تعرفني ونتناقش كل كيس
   واحده واحده"). For every card the report lists as "to discuss", with nothing written:
   - any activity (pre-execution or execution) not at 100% whose end (col K) is not after the month;
   - an execution activity at 0% whose start (col J) is not after the month;
   - an activity not at 100% with no end date.
   After the user decides, the new dates are typed (the user's Oct file overwrote formula date cells with values, e.g.
   0549 J106/K107:K109, 0574 K96 — do that only when the user says so). Following activities chained by formulas move by
   themselves in Excel.
4. **PM feedback** (from the PM's message): one line per project in the step-3 box, `CODE: text`. Written as a new first
   line of the yellow cell under "PM Feedback" (D61), earlier lines kept, dated with **the same day as the card's last
   line, in the update month, in its format** (25 Sep 2026 → 25 Oct 2026; 26-Sep-2026 → 26-Oct-2026) — not today's date.
   A card with no new feedback whose last line is older than the month is listed "to discuss" (ask the PM). In the user's
   Oct file the PMs also rewrote / shortened old lines and re-dated unchanged text — never do that without the PM's text.
   Match the project by its card (Heet design + Heet rail monitoring system are both on 6203).
5. **Who may change what**: only what belongs to the project manager (yellow / unlocked PM cells, the section 7 monthly
   actual, section 8 forecast/actual dates and %). Never PMO-office cells (EPMO Feedback, Reason for delay, baseline /
   revised baseline, budget, contracting info, formulas), even when unlocked. Never remove, change or re-hash any
   protection or password. When in doubt, ask the user before writing.

## Run (Playwright on the local site)
- `python3 -m http.server` in sar-cost-dashboard; Data Import ← the weekly source file; Card Updates → step 3: type the PM
  feedback first, then drop the cards file — **the update runs by itself** (team updates, then the S-curve; month read
  from the file name, e.g. "Oct26" → 2026-10, else the reports' month). "Run again" after changing the month / feedback.
  Download the workbook and the CSV report.

## Check before sending
- Only the cells in the report changed (compare every sheet with openpyxl; ArrayFormula objects compare by `.text`);
  no style id changed; no locked cell changed except the section 7 / PO actual rows.
- Per weekly project: section 7 total to the month = report %, the card ends at 100%, section 8 activities = the report's
  activities. Explain the exceptions (weights that do not add up, a card whose month column is not open).
- Give the user the "to discuss" list (passed dates, months missing for the rest, feedback to ask) project by project.
- The file opens (LibreOffice convert) and Excel recalculates on open (fullCalcOnLoad, calcChain removed).

## Reply (Egyptian Arabic, short)
Outcome first; the numbers per project with sources (file › sheet › cell); what was not applied and why (formula cells,
missing month label, report below the card); the PM feedback written; open questions. Send the workbook + CSV report.

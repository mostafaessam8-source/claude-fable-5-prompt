---
name: old-finish-forecast
description: Forecast-date rules for the "Old projects status + expected date to proceed" Action Points slides (closing-phase close-out steps) of the weekly PPT in sar-cost-dashboard. Use whenever an Actual / Forecast Date on those slides is added, changed, checked or questioned, when a new blocker or step type must change the dates, or when the user asks why a step is forecast for a given month. Arabic triggers: "old projects", "forecast date", "التاريخ المتوقع", "المشاريع القديمة".
---

# Old projects — close-out forecast dates

Logic: `closingForecast(M, r, steps)` in `sar-cost-dashboard/assets/js/pptx-weekly.js` (above `openClosing`), used by
`fillClosingActions`. Change the rule there only.

## Which projects

Closing-register rows that are open (Current Status not starting "Closed", not "Terminated") **and** whose
`Actual Progress %` is 100 %. Rows still below 100 % never appear on the Old projects slides (they stay on the
"Projects in the Closing Phase" cards). Three projects per slide, numbered on.

## Inputs (imported Excel only)

- `Projects in Closing phase.xlsx` → `Closing_Projects`: `Actual Progress %`, `Contract Finish`, `Current Status`,
  `Action Plan`, and the close-out step columns (between *Final Contract Value* and *Current Status*).
  A date in a step = Completed (shown as actual date); "Completed" / "Done" / "Signed" / "Yes" / "Available" = Completed
  with no date (shown as an estimated past date, see rule 9); "N/A" = not applicable; empty = Not Started; other text =
  in process.
  Current Status may start "Not signed: AMP-B, AMP-D, AMP-E2." (from the AMP availability table) — read like any text.
- The project's own weekly report (exact project code only, never the base code of a suffixed code):
  `End Date (Forecast/Actual)`.
- Report date (cut-off of the imported weekly report).

## Rules

1. **Works finish**: progress ≥ 100 % → works done. Otherwise the weekly forecast finish if not before the report date,
   else the contract finish if still ahead, else report date + 2 months.
2. **Blockers in Current Status / Action Plan** delay AMP-E1:
   AMP-C still open +1 month · CR / change request in process +1 month · waiting on an authority
   (MoT / MOI / ministry / municipality / stakeholder, or "awaiting … response") +1.5 months.
3. **AMP-E1** = works finish (or report date when works are done) + 1 month + blocker delays.
4. **AMP-E2** = the later of AMP-E1 + 1.5 months and the end of the 12-month DLP (works finish + 365 days).
   Design-only contracts (project name says Design, not Construction) have no DLP: AMP-E2 = AMP-E1 + 1.5 months.
5. Special status texts:
   - "AMP-E2 in process" or "E1 & E2 in process" → AMP-E1 = report date + 2 weeks, AMP-E2 = report date + 1 month.
   - Works done and only close-out paperwork left ("Close out remaining") → AMP-E1, AMP-E2 and handover = report date
     + 2 weeks.
5b. AMP-E1 already Completed → AMP-E1 is taken as the report date (later steps count from now);
   AMP-E2 already Completed → AMP-E2 is the report date (close-out etc. count from now, no DLP wait).
   "AMP-C … not (been) signed" or "Not signed: … AMP-C" means AMP-C is still open (+1 month).
6. Following steps: Hand Over Report = AMP-E1 + 1 month · Closeout Report = AMP-E2 + 1 month · AP guarantee release =
   AMP-E1 + 2 months · Retention release = close-out + 1.5 months · Final payment = close-out + 2 months ·
   Performance guarantee release = later of AMP-E2 and final payment + 1 month.
7. A step whose register cell holds a status text (e.g. "In process") is due report date + 1 month.
8. Every forecast is at least 2 weeks after the report date and is rounded to month end.
9. **Completed without a date → estimated past date**, never "Done" and never a future date: the same sequence counted
   from the contract finish (AMP-E1 = CF + 1 month, AMP-E2 = later of AMP-E1 + 1.5 months and CF + 12-month DLP,
   handover = AMP-E1 + 1 month, close-out = AMP-E2 + 1 month, AP guarantee = AMP-E1 + 2 months, retention = close-out
   + 1.5 months, final payment = close-out + 2 months, performance guarantee = later of AMP-E2 and final payment +
   1 month), rounded to month end. If there is no contract finish, or the estimate is not before the report date, the
   month end before the report date is used. Shown as `≈dd-Mmm-yy` in green.

## Output

- Actual / Forecast Date column: completed with a date → that date; completed without a date → `≈dd-Mmm-yy` (green,
  rule 9); N/A → "N/A"; otherwise `dd-Mmm-yy (F)` in amber `C55A11`.
- Comments column, second row of each project: grey 6 pt "Basis: …" line naming the works finish and its source,
  the blocker delays, and the DLP rule applied, so every date can be traced.
- Table text is forced left-to-right and runs tagged Arabic are re-tagged English (`ltr`), so PowerPoint does not
  mirror brackets or reorder "code – name".

## When changing it

- Keep the Excel formats unchanged; no project data, codes or names in code, comments or this file (public repo).
- Verify with a PPT build: list every project's step → date and basis (markitdown), check dates follow the sequence
  (E1 before E2, handover after E1, close-out after E2, releases after close-out), the table still fits the slide,
  validate.py passes, render one slide.
- Then `npm run release` in `sar-cost-dashboard`, commit with the session trailers, push to the working branch.

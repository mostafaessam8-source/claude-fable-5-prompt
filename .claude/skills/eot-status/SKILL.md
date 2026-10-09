---
name: eot-status
description: EOT (Extension of Time) rules for the NSR dashboard and the weekly PPT in sar-cost-dashboard. Use whenever an EOT value, column, line or explanation is added, changed, checked or questioned (execution slides, delivery KPI cards, Projects overall update table, site project dashboard), or when the user asks why a project shows Expired / Required / Likely / In process / N/A. Arabic triggers: "EOT", "التمديد", "حالة EOT".
---

# EOT status — project rules

One function decides every EOT shown anywhere: `UI.eotStatus(card, weeklyRow, reportDate, dateFormatter)` in
`sar-cost-dashboard/assets/js/ui.js` (it builds on `UI.eot`, the raw EOT records). The PPT (`pptx-weekly.js`, `eotOf`)
and the site (`pages.js`, `eotOfSite` / `eotHtml`) only format its result. Never compute EOT anywhere else: change the
rule there and both outputs follow.

## Sources (from the imported Excel files only, never typed in)

1. **Project card change log (section 13.1)** of `EP - NSR Projects <Month>.xlsx` → `card.Changes`.
   A row counts when `Schedule Impact? = Yes`, or it has schedule-impact days, or its title says EOT / Extension of Time.
   - `CR Status` approved / closed / signed → approved EOT: days summed; end date = latest "until <date>" found in
     Comment / Notes, description or title.
   - Rejected / cancelled / withdrawn → ignored. Anything else → EOT in process.
2. **Weekly report** `Reason for Delays`: "EOT … until <date>" → EOT in process.
3. **Card PM feedback** (`card.Baseline.PMFeedback`), newest entry first: "EOT … until <date>" → in process, used only
   when nothing else is recorded.
4. An in-process date already covered by an approved date is dropped.
5. Dates in text are read as `31-Dec-2025`, `31-July-2026`, `6 April 2027`. A month-year only ("Jul 25") is not a date.

Baseline versions (card section 6) are NOT used: they are programme-level and inconsistent with the weekly dates.

## Decision (report date = cut-off of the imported weekly report)

| kind | when | slide line (brief) | table cell | colour |
|---|---|---|---|---|
| done | actual progress ≥ 100 % | N/A | N/A | — |
| approved | approved EOT, end date ≥ report date and forecast ≤ it. No written date → BL finish + approved days, shown with "≈" | Approved until <date> (+N days) | <date> (no date at all → N/A) | — |
| exceeds | approved EOT still running but forecast is later | Until <date>; fcst +N d – more needed | <date> | amber |
| expired | approved EOT end date < report date and progress < 100 % | Expired <date> (the words "new EOT needed" are never written) | <date> (the expired date) | red |
| pending | EOT in process (dated or not; also an expired EOT with a new one in process) | In process until <date> | In process | amber |
| required | BL finish < report date, progress < 100 %, nothing recorded | Not recorded – BL passed, fcst +N d (or "fcst not updated") | N/A | — |
| likely | BL finish still ahead but forecast is after it | Likely needed – fcst +N d vs BL | N/A | — |
| none | BL ahead and forecast on time | N/A | N/A | — |

**Table cell rule (user):** an EOT date when there is one (even expired), "In process" when an EOT is in process,
otherwise N/A. The word "Required" is never written anywhere (cell, slide line, site, full text).

Amber = `C55A11`, red = `C00000`. `+N d` is forecast minus BL finish (or minus the approved EOT end date for
"exceeds"). Every result also carries the full sentence (`text`) and the cause = weekly `Reason for Delays`, else the
card's `Baseline.DelayReason`.

## Where each part goes

- **Execution-phase slides**, line 5 of Project Information: `EOT : <brief>` only. It must stay on one line or
  `fitText` trims the Forecast End Date line under it; the BL End Date and Forecast End Date are already above and
  below, so the brief never repeats them.
- **Delivery KPI cards** (`EOT:` text): the full `text`, `fitText` minimum 6.5 pt.
- **Projects overall update table**, EOT column: the one-word `cell`, coloured.
- **Site → Progress Dashboard → Project dashboard**: EOT tile = `cell` + `brief`; for required / expired / exceeds /
  likely / pending, a full-width note under the info row with the full `text` and the cause.
- Unknown is always **N/A**, never "[To be filled]".

## When changing it

- Keep the excel formats unchanged; read only what the importer already provides.
- No project data, codes or dates in code, comments or this file: the repo is public.
- Verify with a PPT build (all EOT strings, Forecast End Date still present on every execution slide, validate.py
  passes, render the execution / delivery / table slides) and the site project dashboard for one project of each kind.
- Then `npm run release` in `sar-cost-dashboard`, commit with the session trailers, push to the working branch.

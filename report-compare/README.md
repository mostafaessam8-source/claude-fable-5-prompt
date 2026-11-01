# Report Compare

Upload **last week's** and **this week's** weekly report workbook (`.xlsx`), review what changed, fix what the checker flags,
and download the reviewed report. Everything runs in the browser — the files never leave the computer.

Published at `/report-compare/` by `.github/workflows/pages.yml` (after the change is merged to `main`).

## How it works
- **Compare** – every cell of every sheet is compared by address. Typed inputs and formula *text* need a decision; a formula whose
  text is unchanged but whose result moved is shown as "auto-calculated" (no decision).
- **Review** – each changed cell is outlined in the sheet. *Keep* = this week's value stays. *Reject* = the cell goes back to
  **last week's** value in the final report. Or type your own value (number, `50%`, date `22/10/2026`, text, `=formula`; empty clears).
  Any cell can be edited, changed or not. Keys: `N`/`P` next/previous change, `I` next issue, `A` keep, `R` reject.
- **Checker** – flags what does not make sense (red = error, orange = warning): last-week blocks that do not match last week's report,
  cumulative values that go down, totals that do not add up, report date / project week / calendar week not advancing, forecast in the
  past, dates in the wrong order, overdue items, text copied unchanged from last week, formula errors, numbers stored as text,
  formulas overwritten by values, large jumps. It re-runs after every decision; most findings have a one-click fix.
- **Download** – the file is **this week's original package** with only the rejected / edited cells rewritten, so charts, pictures,
  formats and conditional formatting are untouched. Excel recalculates on open (`fullCalcOnLoad`); formula results shown by other
  viewers may be stale until then. A CSV change log is also available. Pending changes stay as in this week's file.
- The review is saved in the browser (per pair of files) and restored when the same two files are loaded again.

## Limits
- Sheets are matched by name and cells by address: inserting rows in a long table shows up as many changes.
- Charts, pictures and Excel cell notes are preserved in the download but not drawn in the web view or compared.
- Checker rules are written for the NSR weekly report template (sheet names `1. Progress Status` … `10-13. Data Input`);
  the generic rules (errors, dates, text-as-number, formula overwritten, large jumps) apply to any workbook.

## Files
- `js/xl.js` – xlsx reader (values, formulas incl. shared formulas, styles, number formats, merges).
- `js/diff.js` – comparison, typing rules, the view after decisions.
- `js/checks.js` – the checker rules.
- `js/writer.js` – patches this week's package, change log.
- `js/app.js`, `css/app.css`, `index.html` – the page.
- `tests/compare.test.js` – `node report-compare/tests/compare.test.js [report.xlsx]` (with a real report it builds a synthetic
  "last week", compares, checks, rejects/edits and re-reads the written file).

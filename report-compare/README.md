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
- **Formulas** – type an Excel formula (`=+D49+H50`, `=IF(B5>B6,"x","y")`, `='6. IPC Status'!C10/C8` …) in "Your own value": it is calculated at once
  (live "Result" under the box), shown in the sheet, used by the checker and by other typed formulas, and written to the file as a real formula
  with its result cached. Supported: arithmetic, `& = <> < >`, `%`, SUM AVERAGE MIN MAX COUNT COUNTA IF IFERROR IFNA AND OR NOT ROUND/UP/DOWN ABS INT MOD POWER SQRT
  SUMIF COUNTIF SUMPRODUCT INDEX MATCH VLOOKUP XLOOKUP TEXT LEFT RIGHT MID LEN UPPER LOWER TRIM CONCAT(ENATE) DATE YEAR MONTH DAY WEEKDAY TODAY and more.
  Any other function is still saved and Excel calculates it when the report is opened. Formulas already in the report that depend on a changed cell are
  refreshed by Excel on open (the web view keeps their old results).
- **Excel look** – the sheet opens like in Excel: name box, `ƒx` formula bar, column/row headers (highlighted for the selection), gridlines (hidden when the
  sheet hides them), sheet tabs at the bottom in their own colours, and a zoom box. Column widths, row heights, fonts, fills, borders, merged cells and text
  that spills into empty neighbours follow the file (a wrapped cell is clipped to its row height, as in Excel).
  Name box: type `B5` or `B5:C9` + Enter. Arrow keys / Tab move (Shift extends), `F2`/Enter edits in the formula bar, double-click a cell edits it.
- **Pick cells from the sheet** – while a formula is being typed (in the formula bar or "Your own value"), click a cell or drag a range in the sheet and its
  reference is inserted (`=B5+B6`, `=SUM(B5:B6)`); you can switch to another sheet's tab meanwhile and the reference gets the sheet name (`'6. IPC Status'!C8`).
- **Ruler** – a horizontal and a vertical band follow the selected cell/range (strong) and the mouse (light), and the row/column headers light up, so tables are easy
  to follow. Toggle with the "ruler" box.
- **Select several cells, then Keep or Reject** – drag a range, `Shift`+click to extend, **`Ctrl`+click** (Cmd on Mac) to add single cells or `Ctrl`+drag to add more ranges
  (Ctrl+click a selected cell to remove it), click a column/row header to select it, `Ctrl+A` for the whole sheet, or type areas in the name box (`C7,K1:M1`).
  A bar appears next to the sheet — "N changed cells selected · ✔ Keep · ↺ Reject · Undo" (keys `A` / `R`, `Esc` clears) — and the same buttons are in the Cell tab.
  Also: *Keep all / Reject all in sheet* in the toolbar, per-sheet buttons in the Overview, and *Keep / Reject all listed* in the Changes tab.
  Bulk actions overwrite earlier keep/reject decisions but never your own typed values.
- The review is saved in the browser (per pair of files) and restored when the same two files are loaded again.

## Limits
- Sheets are matched by name and cells by address: inserting rows in a long table shows up as many changes.
- Charts, pictures and Excel cell notes are preserved in the download but not drawn in the web view or compared.
- Checker rules are written for the NSR weekly report template (sheet names `1. Progress Status` … `10-13. Data Input`);
  the generic rules (errors, dates, text-as-number, formula overwritten, large jumps) apply to any workbook.

## Files
- `js/xl.js` – xlsx reader (values, formulas incl. shared formulas, styles, number formats, merges).
- `js/formula.js` – the formula engine for typed formulas.
- `js/diff.js` – comparison, typing rules, the view after decisions.
- `js/checks.js` – the checker rules.
- `js/writer.js` – patches this week's package, change log.
- `js/app.js`, `css/app.css`, `index.html` – the page.
- `tests/compare.test.js` – `node report-compare/tests/compare.test.js [report.xlsx]` (with a real report it builds a synthetic
  "last week", compares, checks, rejects/edits and re-reads the written file).

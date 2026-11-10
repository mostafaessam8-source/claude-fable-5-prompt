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
- **Ribbon (Excel's tabs)** – File · Home · Insert · Page Layout · Formulas · Data · Review · View. What the tool can really do is live and is **written into the downloaded report**; everything else is shown greyed
  (hover for the reason: it changes the structure of the workbook and needs Excel).
  - *Home*: Paste (all / values / formulas / formatting), Cut, Copy, Format Painter · font, size, **Bold / Italic / Underline**, **fill colour**, **font colour**, borders · alignment, wrap, indent, **merge & center** ·
    number format, %, comma, decimals · **Format as Table** (8 styles, real Excel tables) and Cell Styles · Format (row height, column width, autofit, hide / unhide) · AutoSum (Sum, Average, Count, Max, Min), Clear, Sort A→Z / Z→A, Find / Replace.
  - *Insert*: Table (`Ctrl+T`). *Formulas*: Insert Function, AutoSum, Show Formulas. *Data*: Sort. *Review*: the change-review buttons of this tool. *View*: Gridlines, Headings, Formula Bar, Ruler, Zoom, **Freeze Panes**.
  - Undo / Redo (`Ctrl+Z`, `Ctrl+Y`) cover every decision, edit, format and layout change. `Ctrl+C/X/V`, `Ctrl+B/I/U`, `Ctrl+F`, `Ctrl+H` work in the sheet; pasting text from another program works.
  - Formatting is stored as a *delta* on the cell's existing style and becomes a new style in `xl/styles.xml` on download (the original styles are never modified). Table / merge / width / height / freeze edits are written to the sheet XML.
  - **Not available** (greyed): insert / delete rows and columns, charts, pictures, shapes, PivotTables, conditional formatting, data validation, filters, comments, named ranges, page setup / printing, protection, macros, rename / move sheets.
- **Fill handle** – the small green square at the corner of the selection: drag it down / up / right / left and the cells are repeated; relative references move like in Excel (`=D63+E64` → `=D64+E65`),
  formats come along, series continue (`1, 2` → `3, 4, 5`, dates, `PW-104` → `PW-105`), a single number or text is copied, `Ctrl` while releasing = copy only, **double-click** = fill down as far as the next column has data.
  `Ctrl+D` / `Ctrl+R` and Home › Fill do the same inside a selection. Copy / paste between cells: `Ctrl+C` / `Ctrl+V` (formulas shift, formats come along).
- **Excel look** – the sheet opens like in Excel: name box, `ƒx` formula bar, column/row headers (highlighted for the selection), gridlines (hidden when the
  sheet hides them), sheet tabs at the bottom in their own colours, and a zoom box. Column widths, row heights, fonts, fills, borders, merged cells and text
  that spills into empty neighbours follow the file (a wrapped cell is clipped to its row height, as in Excel).
  Name box: type `B5` or `B5:C9` + Enter. Arrow keys / Tab move (Shift extends), `F2`/Enter edits in the formula bar, double-click a cell edits it.
- **Sheet tabs like Excel** – arrows ⏮ ◀ ▶ ⏭ scroll the tabs (the mouse wheel too, the active tab is kept in view). **Right-click the arrows** (or the empty part of the bar) for the list of all
  sheets and jump to any of them; hidden sheets are listed at the bottom to unhide. **Right-click a tab**: open, keep / reject all its changes, show its changed cells / checker findings,
  **tab colour**, **Hide**, **Unhide…**. Hide / unhide and tab colour are written to the downloaded report (and listed in the change log). Insert, Delete, Rename, Move or Copy and Protect are shown greyed —
  they change the structure of the workbook (formulas, charts, names) and need Excel.
- **Pick cells from the sheet** – while a formula is being typed (in the formula bar or "Your own value"), click a cell or drag a range in the sheet and its
  reference is inserted (`=B5+B6`, `=SUM(B5:B6)`); you can switch to another sheet's tab meanwhile and the reference gets the sheet name (`'6. IPC Status'!C8`).
- **Keyboard selection like Excel** – `Shift`+arrows extend, `Ctrl`+arrows jump to the edge of the filled block, `Ctrl`+`Shift`+arrows select up to it, `Ctrl`+`Space` selects the
  column, `Shift`+`Space` the row, `Home` / `Ctrl`+`Home` go to the start of the row / the sheet (with `Shift` they select). Mouse: `Shift`+click extends, `Ctrl`+click adds,
  `Ctrl`+`Shift`+click extends while keeping the other areas.
- **Speed on big sheets** – the grid is indexed once per render; selection, the active-cell frame, the ruler and the checker marks are overlays / incremental updates, so moving
  the selection never re-styles the table (only marked cells carry a `position`), and the ruler and selection boxes are clipped to the part of the sheet that is on screen.
- **Find the cell** – clicking any item in the Changes or Checker list (or the name box) opens its sheet, scrolls the cell to the middle of the grid (and brings the
  grid on screen in a narrow window) and flashes it. List items also show where the cell is: `← row label · ↑ column header`. The list keeps its scroll position
  while you keep / reject items.
- **Ruler** – a horizontal and a vertical band follow the selected cell/range (strong) and the mouse (light), and the row/column headers light up, so tables are easy
  to follow. Toggle with the "ruler" box.
- **Select several cells, then Keep or Reject** – drag a range, `Shift`+click to extend, **`Ctrl`+click** (Cmd on Mac) to add single cells or `Ctrl`+drag to add more ranges
  (Ctrl+click a selected cell to remove it), click a column/row header to select it, `Ctrl+A` for the whole sheet, or type areas in the name box (`C7,K1:M1`).
  The selection looks like Excel's (one thick green box per area; dragging never selects text and scrolls at the edges). A status bar under the sheet shows
  "N changed cells selected · ✔ Keep · ↺ Reject · Undo" (keys `A` / `R`, `Esc` clears); it never covers cells. The same buttons are in the Cell tab.
  Also: *Keep all / Reject all in sheet* in the toolbar, per-sheet buttons in the Overview, and *Keep / Reject all listed* in the Changes tab.
  Bulk actions overwrite earlier keep/reject decisions but never your own typed values.
- The review is saved in the browser (per pair of files) and restored when the same two files are loaded again.

## Editing like Excel (4.0)
- Select a cell and just type – it opens an in-cell editor (no formula bar needed). Enter / Tab / arrows commit and move, Esc cancels, F2 or double-click edits the existing text, Delete clears.
- Formulas: click cells while typing `=B3+` to insert references (Excel point mode).
- Status bar shows Average / Count / Sum of the selection, plus Ready / Enter / Edit / Point mode.
- Drag column/row header borders to resize (double-click = AutoFit); right-click cells and headers for the Excel context menu; `Ctrl+1` opens Format Cells.
- Review shortcuts moved to Alt: Alt+N / Alt+P next/previous change, Alt+I next issue, Alt+K keep, Alt+J reject.

## Limits
- Sheets are matched by name and cells by address: inserting rows in a long table shows up as many changes.
- Charts, pictures and Excel cell notes are preserved in the download but not drawn in the web view or compared.
- Checker rules are written for the NSR weekly report template (sheet names `1. Progress Status` … `10-13. Data Input`);
  the generic rules (errors, dates, text-as-number, formula overwritten, large jumps) apply to any workbook.

## Versions
The page header shows `Version X.Y · build <commit>`. Every update bumps the version and adds an entry to [`CHANGELOG.md`](CHANGELOG.md); the test fails if they differ.

## Files
- `js/xl.js` – xlsx reader (values, formulas incl. shared formulas, styles, number formats, merges).
- `js/formula.js` – the formula engine for typed formulas.
- `js/fill.js` – the fill handle's rules (series / copy), `js/format.js` – style objects, deltas, CSS, number formats, table styles, cell styles.
- `js/xlsxfmt.js` – writes formats (StyleBook), merges, widths, heights, freeze panes and real tables into the package.
- `js/edit.js` – the editing commands (format, merge, layout, tables, clipboard, AutoSum, sort, find / replace).
- `js/ribbon.js` – the ribbon.
- `js/diff.js` – comparison, typing rules, the view after decisions.
- `js/checks.js` – the checker rules.
- `js/writer.js` – patches this week's package, change log.
- `js/app.js`, `css/app.css`, `index.html` – the page.
- `tests/compare.test.js` – `node report-compare/tests/compare.test.js [report.xlsx]` (with a real report it builds a synthetic
  "last week", compares, checks, rejects/edits and re-reads the written file).

# Report Compare — changelog

Every update gets a new version number (shown in the page header: `Version X.Y · build <commit>`).
`tests/compare.test.js` fails if the number in `index.html` differs from the newest entry below.
Minor (`2.1`, `2.2`, …) = improvements and fixes; major (`3.0`) = a change in how the tool works.

## 3.0 — 2026-11-01
The sheet is now editable like Excel — formatting, tables and layout are written into the downloaded report.
- **Ribbon** with Excel's tabs: File, Home, Insert, Page Layout, Formulas, Data, Review, View. What the tool can really do is live; the rest is greyed with the reason (it needs Excel).
- **Home**: Paste (values / formulas / formats), Cut, Copy, Format Painter · font, size, Bold / Italic / Underline, **fill colour, font colour**, borders · alignment, wrap, indent, **merge & center** · number formats, %, comma, decimals ·
  **Format as Table** (real Excel tables, 8 styles) and Cell Styles · row height / column width / autofit / hide / unhide · AutoSum (Sum, Average, Count, Max, Min), Clear, Sort A→Z / Z→A, Find / Replace.
- **Insert**: Table (`Ctrl+T`). **Formulas**: Insert Function (supported functions), Show Formulas. **Data**: Sort. **View**: Gridlines / Headings / Formula Bar, Zoom, **Freeze Panes** (written to the file).
- Undo / Redo (`Ctrl+Z` / `Ctrl+Y`) for every decision, edit, format and layout change; `Ctrl+C/X/V`, `Ctrl+B/I/U`, `Ctrl+F/H` work in the sheet.
- Existing tables of the report are drawn with their style; frozen panes of the report are kept.

## 2.4 — 2026-11-01
- Zoom like Excel's, bottom right: `−`, a slider (25 %–400 %), `+` and the percentage (click it = back to 100 %). `Ctrl` + mouse wheel (or a trackpad pinch) zooms around the pointer. The zoom is remembered.

## 2.3 — 2026-11-01
- Cells whose saved result is `#NAME?` (the Excel that saved the file did not know a function such as `XLOOKUP`) are now calculated by the tool itself, so the numbers show instead of the error
  (marked with a green underline and explained in the Cell tab). Cells that still cannot be calculated keep the saved value and are flagged by the checker with a clearer message.

## 2.2 — 2026-11-01
- Sheet tabs like Excel: scroll arrows (first / previous / next / last), mouse-wheel scrolling, the active tab is kept in view.
- Right-click the arrows (or the empty part of the tab bar) for the list of all sheets — one click to go there (hidden sheets are listed to unhide).
- Right-click a tab: open, keep / reject all changes of the sheet, show its changed cells / checker findings, **tab colour**, **hide**, **unhide…**
  (Insert, Delete, Rename, Move or Copy, Protect are shown greyed: they need Excel). Hide and tab colour are applied to the downloaded report too (and listed in the change log CSV).

## 2.1 — 2026-11-01
- The numbers on the sheet tabs now say what they are: `✎ n` changed cells to review, `✖ n` checker errors, `⚠ n` checker warnings (tooltips in English / Arabic). Clicking one opens
  that list for the sheet and shows the first cell.
- The Changes tab of a sheet with no changed cells now says so and points to the checker findings of that sheet ("Show them →").

## 2.0 — 2026-11-01
- Excel-style sheet: name box, `ƒx` formula bar, sheet tabs with colours, zoom, exact column widths / row heights / fonts, hidden gridlines.
- Excel-style selection: drag, `Shift`, `Ctrl`, `Ctrl`+`Shift`, headers, `Ctrl+A`, name box (`C7,K1:M1`), keyboard (`Ctrl`/`Shift`+arrows, `Ctrl`/`Shift`+`Space`, `Home`); no text selection while dragging; auto-scroll.
- Keep / Reject for a selection (status bar), the whole sheet, per sheet in the Overview, or all listed changes.
- Typed Excel formulas are calculated (live result, shown in the sheet, written as real formulas); click cells in the sheet — also on other sheets — to insert references.
- Ruler (row / column bands follow the selection and the mouse); clicking a list item reveals and flashes the cell; lists keep their scroll position; row / column context on items.
- Much faster on big sheets (grid index, incremental painting, overlays).

## 1.0 — 2026-11-01
- First release: upload last week's and this week's report, highlighted changes, keep / reject / edit per cell, report checker with quick fixes, download of the reviewed report, change log CSV.

---
name: card-updates
description: Rules for the monthly project-card update cycle in sar-cost-dashboard (Project Cards → Card Updates (Team)) — the team update page built from the yellow cells of EP - NSR Projects <Month>.xlsx, the update .json files, and applying them to the new month's workbook. Use whenever the team form, a field, a label / header, the update files, or the apply / report step is added, changed, checked or questioned, or when projects are added / removed between months. Arabic triggers: "تحديث الكروت", "فريق المشاريع", "الخلايا الصفرا", "ملف الشهر الجديد", "تفريغ الداتا".
---

# Card Updates (Team)

Code: `sar-cost-dashboard/assets/js/cardform.js` (`SARCardForm`: extract · editor · apply · teamPage) and the page
`assets/js/cardupdates.js`. The team page is one self-contained .html built from the publish kit (site CSS + logo +
cardform.js) with the month's card model embedded — so `cardform.js` must stay in `tools/build-publish-kit.js` SCRIPTS.

## How the team page looks

The card is drawn exactly as the Excel sheet (`gridOf` + `xfCss` + `fmtNum` in cardform.js): visible columns / rows
with Excel's widths (chars × 7 + 5 px) and heights (pt × 4/3), cell styles from styles.xml (fill incl. theme colours
with tint, font, borders, alignment, wrap, indent), merged cells as row/col spans, number and date formats as Excel
shows them, text overflowing into an empty right-hand cell, pictures (logo) at their anchors, Excel-style column letters
and row numbers (sticky), zoom 60–130 % and "Go to" section. Conditional formatting and charts are not drawn.
Editing: click a yellow cell → one control over it (date picker / number / % / list / text box); Enter or click away
saves, Esc cancels, Tab goes to the next yellow cell; changed cells get an orange frame with the old value as tooltip.

## What the team may edit

- Only **yellow** cells of `<code>_Project Card` sheets: solid fill with R ≥ F0, G ≥ E0, B ≤ CC (FFFF99, FFFF00 …) or
  indexed 13 / 43 / 26. Cells inside a merged range count once (top-left only).
- Yellow cells holding a **formula** are shown read-only and never written.
- Field type: literal data-validation list → dropdown; date number format → date; % format → percent (stored as a
  fraction); numeric value → number; else text (long text → textarea).
- Labels: section = dark-filled title in column B (number from column A) + dark sub-title (phase); row label = first
  non-yellow text left of the first yellow cell; column header = nearest text above in the same column that is not a
  data row or a section title (merged group title prefixed). Read-only context: other values of the row, columns A–P.

## Monthly Actual Progress (%) — section 7 (`progressOf` / `progState` in cardform.js)

Besides the yellow cells, the team updates the monthly **Actual Progress (%)** row of section 7 (row "Actual Progress (%)"
under "Month Starting Date"; month columns = the "Month N" labels above "Months Count").
- Typed numbers in that row → its month cells are editable (field key: section 7 · "Actual Progress (%)" · "Month N").
- A formula in that row → the project is split into POs: the row is the contract-value-weighted average of the PO blocks
  to the right (label "PO1…" then Contract Value, Months Count, Month Starting Date, Planned / Actual Progress (%)). The
  PO blocks' Actual Progress month cells are editable instead (section "7 … · PO1 (PO <no>)"), only for POs with a
  contract value or PO number; the page recomputes the row live as Σ(PO actual × CV) / Σ CV (CV > 0).
- Months open as in the card's formulas: execution months = MAX(DATEDIF(G,H,"M")+1, DATEDIF(J,K,"M")+2) on the Execution
  Phase head row (G/J = MIN, H/K = MAX of the activity rows when the head holds a formula), + FCC months
  (0 when the TOC flag is "No", else DATEDIF(FCC start, FCC end)+1). A later forecast finish opens more month cells; month
  N > total is locked. Month labels, month dates (EOMONTH chain, the FCC month restarting at the FCC start),
  Execution Period and Actual Progress (% to Date) (sum up to the reporting month) are recomputed on screen.
- Written to the new month's file as numbers (fractions) into the same field (section · row · Month N); formula cells
  are never overwritten. Excel recalculates everything else on opening.

## Exchange format (.json)

`{ kind:"sar-card-updates", v:1, file, month, by, savedAt, projects:{ <code>:{ name, cells:[{ ref, s, l, h, k, from, to }] } } }`
— changed cells only. Never put credentials or anything outside the card in it.

## Applying to the new month

- Latest `savedAt` wins per project + cell (the report names the replaced one).
- A cell is written at its ref when section · row label · header still match; otherwise the unique yellow cell with the
  same section · row · header is used (reported as moved); otherwise **not applied** (row not found / appears twice).
- Project missing from the new file → not applied. New projects → nothing to apply. Formula cell → not applied.
- Only the sheet XML of changed cards (cell value only, style kept) and `calcPr fullCalcOnLoad` change; every other part
  of the workbook stays byte-identical. Dates → Excel serial, numbers → `<v>`, text → inline string.
- The uploaded new month file itself is never modified; the user downloads "<name> - team updates.xlsx" + CSV report.

## Privacy

Project data never goes into the repository (public). The team page and update files are shared inside SAR only;
everything the page stores stays in the viewer's browser.

## When changing it

- Keep the Excel format unchanged; no project data or names in code, comments or this file.
- Verify in a browser: import the month file, create the team page, edit a date / text / % / list cell, reload (draft
  kept), download updates, apply to a copy of the file with one card removed, and check with openpyxl that only the
  edited cells differ (values and style ids) and the removed project is reported.
- Then `npm run release` in `sar-cost-dashboard`, commit with the session trailers, push to the working branch.

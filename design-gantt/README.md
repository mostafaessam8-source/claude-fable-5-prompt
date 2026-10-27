# Design Gantt

Upload the **Design Submission Tracker** workbook (`.xlsx`) and download the same workbook with a professional,
**live** `Gantt chart` sheet. Everything runs in the browser — the file never leaves the computer.

Published at `/design-gantt/` by `.github/workflows/pages.yml` (after the change is merged to `main`).

## What the Excel Gantt sheet does
- Every figure (name, dates, SAR code, %, health, variance, KPI cards, data date) is a **formula** reading the `Tracker` sheet.
- Every bar is **conditional formatting** driven by date helper columns (grouped columns right of the chart; click `+`).
  Change a date, a SAR code or the data date in `Tracker` and the chart redraws itself.
- Submission Date and Approval Date are **milestones** (blue ◆ / orange ●; solid = actual up to the data date, hollow = forecast),
  with the SAR review code (A/B/C/D) shown at the approval milestone and in its own column. No bars, baseline, stages or health.
- Fixed when generated: which projects / elements / stages get a line, and the time range (padded). Re-run the site after
  adding elements or when dates move outside the range. The data-checks block at the bottom is a snapshot.

## Files
- `js/model.js` – reads the tracker and builds Gantt lines (same health / % / variance rules as the sheet).
- `js/xlsxgantt.js` – writes the live Gantt worksheet into the original package.
- `js/app.js`, `css/app.css`, `index.html` – the page.
- `tests/gantt.test.js` – `node design-gantt/tests/gantt.test.js` (`SAR_TRACKER=file.xlsx` also runs a real workbook).

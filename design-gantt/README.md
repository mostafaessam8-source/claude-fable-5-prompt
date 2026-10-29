# Design Gantt

Upload the **Design Submission Tracker** workbook (`.xlsx`) and download the same workbook with a professional,
**live** `Gantt chart` sheet. Everything runs in the browser — the file never leaves the computer.

Published at `/design-gantt/` by `.github/workflows/pages.yml` (after the change is merged to `main`).

## What the Excel Gantt sheet does
- Every figure (name, dates, SAR code, %, health, variance, KPI cards, data date) is a **formula** reading the `Tracker` sheet.
- Every bar is **conditional formatting** driven by date helper columns (grouped columns right of the chart; click `+`).
  Change a date, a SAR code or the data date in `Tracker` and the chart redraws itself.
- Submission Date and Approval Date are **milestones** (blue ◆ / orange ●; solid = actual up to the data date, hollow = forecast),
  with the SAR review code (A/B/C/D) in its own column (not on the chart). No bars, baseline, stages or health.
- **Fully automatic**: Gantt row n mirrors Tracker row n by formula (project / element detection, names, dates, SAR code, status, the time axis and the
  milestones). Dates typed in any Tracker row — also rows that were empty, or new elements — appear without re-running the site.
  The chart watches the filled rows plus 60 spare rows; re-run the site only if the Tracker grows beyond that.

## Revised schedule (v5.0)
`js/revised.js` holds the *Revised Detailed Design Submission Schedule — NSR Mitigation Measures Phase 2* (18 culverts, issued 26-Oct-2026).
On upload each line is matched to the Tracker element of the same name; its Submission Date replaces the workbook's, the Approval Date is kept when it
still follows the new submission, otherwise assumed (+15 days) — or left empty for lines already under SAR review. The downloaded workbook has the
dates written into the Tracker sheet (columns Submission Date / Approval Date), so the live Gantt follows them. Untick "apply to the chart" to ignore it.
To load a newer schedule, replace `js/revised.js`.

## Files
- `js/model.js` – reads the tracker and builds Gantt lines (same health / % / variance rules as the sheet).
- `js/xlsxgantt.js` – writes the live Gantt worksheet into the original package.
- `js/app.js`, `css/app.css`, `index.html` – the page.
- `tests/gantt.test.js` – `node design-gantt/tests/gantt.test.js` (`SAR_TRACKER=file.xlsx` also runs a real workbook).

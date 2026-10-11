---
name: design-review
description: Rules for the Design Review page in sar-cost-dashboard. It is the management dashboard of design submissions, built from the "Engineering Drawings" sheet ("Engineering Log") in each project's weekly report workbook (the same .rar / .zip as the progress photos). Use when design statuses are read or counted wrongly, a project's sheet is not picked up, the decisions / health rules or the layout need changing, or the user asks about "الديزاين", "Engineering Drawings", "Code A/B/C/D", "تحت المراجعة", "design review", "اعتماد المخططات".
---

# Design Review: Engineering Drawings → management dashboard

Code: `sar-cost-dashboard/assets/js/design.js` (`SARDesign`).
- Reading the sheet: `fromWorkbook`, called for every workbook in the archive by `SARPhotos.importFiles` (photos.js).
- Saving to table `Engineering_Drawings`: `applyDesign` in `handleFiles` (app.js). A new import replaces only the projects
  it contains.
- Page: id `design`, group Design. Styles: `.ds-*` in styles.css.

## Reading
- Sheet name: "Engineering Drawings" / "Engineering Log" / "Engineering Documents" (any sheet with "engineering" in the
  name as a fallback).
- Columns are found by their header text; if a header is missing, the usual place A–G is used: Report Date, Project
  Code, Category, Engineering Document Description, Submission Date, Status, Remarks (+ optional Delay by Days).
- Rows with no description and no category are skipped (formula-only rows).
- Dates may be Excel dates or text such as "15-7-2026" (day-month-year).
- The project is taken from the file name, not from the Project Code cell (some sheets carry a PO number there).

## Status buckets (`classify`)
- **D:** Code D / rejected.
- **C:** Code C / revise & resubmit / CRS received / withdrawn.
- **UR:** under (SAR) review / submitted / UR / pending.
- **B:** Code B / approved with comments.
- **A:** Code A.
- **AP:** approved / closed / "Approved Code A/B".
- **NR:** submitted but no status.
- **NS:** no submission date and no status.
- **X:** superseded / cancelled / descoped. Not counted.

How mixed wording is read:
- A status that names several disciplines takes the worst part.
- A generic status ("Approved", "Submitted to SAR", blank) takes a code written in the remarks.

## Counting
- One document = one description per project file. The latest submission is the current status; the number of dated
  rows is its submission count.
- A C / D document resubmitted later under a new title (same stage, title containing "resubmittal") is closed by that
  resubmission: it becomes X, and the resubmission's count goes up by one.
- Age = report date − submission date.
- SAR review target: selectable (default 14 days). "Beyond target" counts only Under-review documents.

## Health and decisions
- **Red:** C / D ≥ 25% of what was submitted (with at least 2 documents), or 3+ documents in review beyond twice the target.
- **Amber:** any C / D, any review beyond the target, or more than 25% not submitted yet.
- **Green:** otherwise.
- Decisions are listed per project, each with an owner (SAR / Contractor / Data):
  - review beyond the target
  - Code D
  - Code C
  - 3+ submissions and still not approved
  - more than 25% not submitted
  - submitted with no status

## Layout (user asked for a focused page: no repeated figure, no long repeated sentences)
1. **Scope line + five tiles:** documents, approved %, with SAR (late, average), with the contractor (D / C / not
   submitted), longest SAR review. The last one opens the document.
2. **Projects table** (`ds-mx`), worst first:
   - columns: health dot, status bar (`ds-sbar`, px width; segments filter project + status), approved, with SAR
     (late), longest, with contractor, next action
   - next action = `short` text of the top 2 decisions, with an owner tag
   - "Details ›" opens `projModal`
   - with one project selected, the rows are its packages (click → list)
3. **Charts:** SAR-wait ageing + submissions per month.
4. **Chase lists:** longest with SAR / returned C / D. Same project + status + submission day are grouped into one line,
   named by the shared title start.
5. **Register:** folded `<details>`, drawn on first open.

Removed on purpose (they repeated other blocks): section nav, status doughnut, who-acts chart, health box, separate
scorecard, decisions list, review-time-by-project, contractor-by-project and submissions-count charts.
Don't add them back. Note the class name `ds-sbar`: `ds-bar` was once a filter-bar class with gaps.

## Click = filter the page
- `pick(patch, e)` sets the page filters (`f.proj` / `status` / `age` / `month`) to what was clicked. Ctrl / ⌘ + click
  adds or removes values; clicking the same thing again clears it.
- What filters the page:
  - overview cards
  - status doughnut
  - who-acts bars
  - project chart (project + status)
  - review-ageing bars (band + project)
  - review time by project
  - contractor chart (project + status)
  - month bars (month + status)
  - health items
  - scorecard rows
  - decisions (`decFilter`)
- What opens details instead:
  - the oldest-in-review card
  - document lists and rows
  - the package chart (one project)
  - the submissions-count chart
  - the scorecard "Details ›" button
- **Project codes on the y axis:** they filter by the project (`axisClicks(box, fn)`), on the project, review-time and
  contractor charts. Chart.js calls `onClick` only inside the plot area, so these clicks are listened to on the chart
  box.
- **Bar clicks:** use `hit(e, els, c)` to get the segment under the pointer. Chart.js bar charts report every segment of
  the bar, first one first.

## Charts
- Every bar is clickable and opens `docModal`, a summary line plus the document table.
- What a click shows:
  - **Status by project:** opens that project.
  - **Review ageing:** every document in that age band.
  - **Package and month charts:** the clicked segment's documents. If the segment is empty, the whole bar.

## When changing it
- Keep the Excel format unchanged, and keep project data out of code, comments and this file (public repository).
- Test with the real weekly report archive: import it on Data Import (the log lists the design rows per file), then
  dump `SARDesign.model(SARApp.D, 14)` and read the status → bucket table for misreads. Screenshot the page at 1440 and
  390 px, for the portfolio and for one project.
- Then run `npm run release` in `sar-cost-dashboard`, commit with the session trailers, and push to the working branch.

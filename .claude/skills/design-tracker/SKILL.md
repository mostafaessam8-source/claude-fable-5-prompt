---
name: design-tracker
description: Rules for the Design Submission Tracker page in sar-cost-dashboard, built from the "SAR ESS Design Submission Tracker" workbook (Tracker sheet — projects and elements through the Concept / Preliminary / Detailed design stages). Use when the tracker is read wrongly, a stage / health / % looks wrong, the page layout or Gantt needs changing, or the user asks about "تراكر التصميم", "Design Submission Tracker", "ESS design", "Concept / Preliminary / Detailed", "الجانت بتاع التصميم".
---

# Design Submission Tracker: ESS tracker workbook → page

Code: `sar-cost-dashboard/assets/js/dtrack.js` (`SARDesignTracker`), reader `parseDesignTracker` in `importer.js`
(source `designTracker`). Page id `design-tracker`, group Design. Styles: `.dt-*` in styles.css.
The other design page (Design Review, weekly reports' Engineering Drawings) is a different source: see the design-review skill.

## Reading (importer)
- The file has no Excel tables. It is found by its header row: a cell "Project / Element …" and a cell "… CONCEPT DESIGN (15%)".
  The row under it holds the stage fields. Columns are found by their text, not by position.
- Stage blocks start at the "1. CONCEPT / 2. PRELIMINARY / 3. DETAILED DESIGN (nn%)" cells; the % in brackets is the stage weight.
- Fields per stage: Baseline Submission / Approval, Actual Submission / Review, SAR Code, Forecast (re-)Submission / Approval,
  and %, Health, Var (days) where the sheet has them (the Detailed block has none).
- After the Detailed block: Priority, Submittal No, Submission Date, Approval Date, Status, Code (final), Project End Date, Notes.
- A row with a Project Code is a project (P); rows under it are its elements (E), even when they repeat the Programme cell.
- The control panel above the header gives Data Date, At-Risk Window and "% EARNED — submitted / Code D / C / B / A"
  (table `Design_Tracker_Info`).
- Non-breaking spaces and "-" are empty. Text in a date column is not a date.

## Measuring (same as the workbook's formulas)
- % per stage: Code A / B / C / D → the earned rates; else submitted → "submitted" rate; else 0. No date and no code → stage not used.
- Health: ≥ 100% → Completed · not submitted and baseline submission before the data date, or not approved (blank / C / D)
  and baseline approval before the data date → Delayed · the same within the at-risk window → At Risk · no actual dates →
  Not Started · else In Progress.
- Var (days) = actual review − baseline approval when A / B, else forecast approval − baseline approval, else data date − baseline approval.
- Weighted % (element, project, programme) = Σ weight × items × average % ÷ Σ weight × items (the workbook's PROGRAMME TOTAL).
- An element's current stage = the last stage it uses. A project with no element rows counts its own row as its element.
- Check after a change: the Concept / Preliminary stage counts must equal the workbook's control panel.

## Layout
Source line (data date and rules) · filters (project, health, current stage) · six tiles · stage table · projects table (row opens
its elements in place; an element opens its three stages) · milestone Gantt (current stage of each element, project bar to the
project end date, data-date line) · folded register of all elements.

## When changing it
Keep project data out of the code and this file (public repository). Test by importing the real workbook on Data Import, dump
`SARDesignTracker.model(SARApp.D)`, compare the stage counts with the workbook, and screenshot at 1440 and 390 px.
Then `npm run release` in `sar-cost-dashboard`, commit with the session trailers and push to the working branch.

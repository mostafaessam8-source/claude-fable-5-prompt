---
name: data-checks
description: Rules for the Data Checks in sar-cost-dashboard. They test the loaded data for values that are not logical, out of date, or that disagree between the source files, and show warnings on the Data Checks page, in the header chip, on the import page and in a box on each project's dashboard and card. Use when a warning is wrong, missing or too noisy, when a new rule is wanted, or when the user asks why a project shows a warning. Arabic triggers: "تحذير", "مش منطقي", "شيك على البيانات", "محتاج تحديث", "data warnings", "Data Checks".
---

# Data checks: loaded data → warnings

Code: `sar-cost-dashboard/assets/js/datacheck.js` (`SARChecks`).
- Page: id `data-checks` in the Data group. It is not in published reports and has no Publish button.
- Header chip: `#dqChip` (class `js-editor`). Under 1700 px it shows the count only.
- Import page note: in `renderImport` (app.js).
- Per-project box: `SARChecks.inline(host, code)`, called from the Progress project dashboard and from `cardDetail` in pages.js.
- Styles: `.dq-*` in styles.css.

## Types (keep these three)
- **Not logical** (`error`): impossible values, e.g. % outside 0–100, finish before start, paid > contract value,
  negative counts, cumulative going down, actual entered for future periods.
- **Needs update** (`warn`): dates that have passed while the work is not done (forecast finish, milestones, concern target
  dates, issue due dates, close-out steps), closed months with no actual, empty key fields, old data.
- **Check** (`info`): two files disagree (spend plan ↔ weekly report, card ↔ weekly report), a field that doesn't match
  its own formula (SPI, Variance days, Paid %), or no target date (TBD).

## How it works
- The reference date is the weekly report date (`D.reportDate`). Use today only for the "data is old" check.
- Every rule is listed in `RULES` at the top of the file. That list is shown under "What is checked" on the page, so
  update it together with the code.
- A finding = { sev, rule, code, name, src, field, msg, go }. `msg` must name the value(s) and say what to fix. `go` is
  the page to open on a row click: weekly data → Progress project dashboard, spend plan → Cost, card → Project Cards,
  closing → Projects in Closing, issues → Issue Register.
- Group many items from one source into one finding per project when they are the same kind (card milestones, close-out
  steps without a date, negative phase KPIs).
- "Mark OK" is per browser (localStorage `sar-datacheck-ok`), keyed by the finding text, so a changed value comes
  back as a new finding.
- Thresholds:
  - Progress tolerance 0.05 pp.
  - SPI ±0.05 vs actual ÷ planned.
  - Variance ±2 days.
  - Paid % ±2 pp.
  - Money 1 %.
  - Card and weekly forecast finish more than 30 days apart.
  - A report more than 6 days behind the others.
  - Data more than 10 days old.
  - A card more than 40 days older than the newest card.
- Don't compare weekly "Submitted Amount" with the spend plan's work confirmed: they are different things.

## When changing it
- No project data, codes or names in code, comments or this file (public repository).
- Test against real data: import the cloud files in a browser and dump `SARChecks.run(SARApp.D).list`. Read every new
  finding and look for false positives before committing. Check the page at 1440 / 1920 / 390 px.
- Then run `npm run release` in `sar-cost-dashboard`, commit with the session trailers, and push to the working branch.

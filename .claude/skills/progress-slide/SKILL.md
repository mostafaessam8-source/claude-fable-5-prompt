---
name: progress-slide
description: Rules for the "Progress Slide" header button in sar-cost-dashboard, which builds a one-slide SAR progress update (.pptx) for one project to share outside SAR (progress only, with no plan, variance or costs). Use when the slide is wrong or missing data, when its layout, fields or photo need changing, or when the user asks for "presentation للمشروع", "progress update slide", "بريسنتيشن التقدم", "شريحة واحدة للمشروع".
---

# Progress Slide: one project → one SAR slide (.pptx)

Code: `sar-cost-dashboard/assets/js/progress-slide.js` (`SARProgressSlide.open` / `.projectData`), button `#progSlideBtn`
in `index.html` (class `js-editor`, so it is removed from published reports), styles `.ps-*` in `styles.css`.
The slide is drawn with PptxGenJS (`assets/vendor/pptxgen.bundle.js`, MIT, local, no CDN). It loads only on first use.
The bundle overwrites `window.JSZip`, so the site's JSZip is saved before loading and restored afterwards. Keep that.

## Content (progress only: never add planned %, S-curve, variance, SPI, costs or invoices)

- Title: weekly `Project Name` in title case, with "- Critical" / "- Weekly Dashboard" removed.
- Subtitle: `Project <code> · Progress update as of <report date> · Contractor: <first party before " + ">`.
- Overall progress: weekly `Actual (%) - Cumulative` in a doughnut.
- Progress by work stage: up to 5 rows from `Project_Milestones_Progress_Combine` (Description/WSB, Actual Progress,
  by Sort), excluding "Overall". A complete stage (100%) shows in grey.
- Photo: the project's imported progress photos (`SARPhotos.forProject`). The user picks one or "No photo", and can add an
  optional caption. With no photo, the photo column is left out.
- Key dates: contract start = `(Con) Contract Effective Date`. Target completion = `End Date (Forecast/Actual)` when it
  is on or after the report date; otherwise `End Date Baseline`. The completion date shows month and year only.
- Recent works: up to 3 `Weekly_Achievements` items, each clipped to about 70 characters. Next steps: up to 3
  `Lookahead_Activities` items.
- Footer: `Source: contractor weekly progress report, <date>` and SAR.COM.SA.
- Everything is editable in the dialog before download. The file is named `<code> - Progress Update - <report date>.pptx`.

## Design (approved layout: keep it)

LAYOUT_WIDE. SAR colours 00778B / 3D3935 / 768692 / 71B2C9 / C8C9C7, tints F2F8F9 / E6F1F4. Font Diodrum Arabic.
SAR logo at the top left. Slanted stripe markers before the section titles. The photo has a diagonal wedge cut. A
baseline rule ends in a circle node.

## When changing it

- No project data, codes or names in code, comments or this file (public repository).
- Test in a browser: import the weekly report (+ the photos archive), open the dialog, pick a project, download.
  Then run validate.py, render it with soffice → PDF → PNG, and check for text overflow (long titles and long
  activity lines). Also check the header at 1440 px and 1920 px; under 1700 px the ghost buttons are icon-only.
- Then `npm run release` in `sar-cost-dashboard`, commit with the session trailers, and push to the working branch.

# PD-NSR 2026 Cost Control Dashboard (SAR theme)

A web version of the Power BI report **Weekly_Dashboard_WK38.pbix**, built in the official
SAR brand identity (SAR Blue `#00778B`, Black `#3D3935`, the SAR secondary palette, and the diagonal
"track" motif). You update it by importing the **same Excel files that feed Power BI**. The Excel
formats are not changed in any way.

It's a plain static site (HTML + CSS + JavaScript), so there's no server code or database to run. All
libraries are stored locally in `assets/vendor/`, which means it also works on an internal network or
opened straight from disk.

## Pages (mapped to the Power BI pages)

| Website page | Power BI page | Source Excel tables |
|---|---|---|
| Executive Overview | *(new summary page)* | all |
| KPI Summary | KPI Summary | `KPI_Summary`, `Delivery_KPI`, `Weekly_Report_Updates` |
| KPI Cost Summary | KPI Cost Summary | `KPI_Summary`, `KPI_Projects_Data` (KPI codes 7 & 8) |
| Cost Dashboard | Cost Dashboard + Cost Dashboard graph + Cost S-Curve (merged into one page) | `NSR_Project_Data`, `Spending_Plan` |
| KPI Year-End Outlook | *(new)* | `Spending_Plan`, `KPI_Projects_Data`, `KPI_Summary` (KPI codes 7 & 8): year-end = contractor Forecast Plan (invoicing plan) for the full year vs the Spend Plan and the −5% CAPEX target; invoice schedule from *Invoice Related actvities* |
| SPI & S-Curve Outlook | Progress S-Curve (merged) | `Weekly_Report_Updates`, `S_Curve`, `KPI_Summary` (KPI "Schedule performance index"): portfolio SPI = ΣEV ÷ ΣPV (EV = contract value × actual %, PV = contract value × planned %), projected to 31-Dec on each project's current weekly trend against the KPI target, plus each project's weekly progress S-curve (`S_Curve`, `MLS`) |
| Weekly Progress Summary | Weekly Progress Summary | `Weekly_Report_Updates` |
| Project Progress | Progress | `Weekly_Report_Updates`, `Contract_Details`, `Deliverable_Status`, `Project_Milestones_Progress`, `Interim_Payment_Certificate`, `Lookahead_Activities`, `Area_of_Concern` |
| Projects Master Plan | Projects Master Plan | `Project_Milestones_Progress_Combine` |
| Project Timeline | Timeline | `Project_Milestones_Progress` |
| Project Cards | *(new)* | Every `…_Project Card` sheet in **EP - NSR Projects &lt;Month&gt;.xlsx**, all sections |
| Projects in Execution | *(new)* | Project cards with **Actual Phase = Execution**. All progress comes only from card **section 7** (Execution Schedule: planned/actual % to date and the monthly curve → SPI and its 12-month trend) and **section 8** (Project Timeline: execution-phase baseline / revised / forecast dates and the project total). Also shows status, payments, 2026 spend, a watch list and 10 filters |
| Portfolio Master Plan | *(new)* | Section 8 *Project Timeline* + section 10 *Critical Path Milestones* of every project card |
| Projects in Closing | *(new)* | **Projects in Closing phase.xlsx** (sheet with the closing register; found by its header row): closure status, close-out checklist (every column between *Final Contract Value* and *Current Status*), time since contract finish, current status and action plans |
| Issue Register | Issue | Section 12.1 *Issue Log* of every `…_Project Card` sheet in **EP - NSR Projects &lt;Month&gt;.xlsx** |
| Abbreviations | Abbreviations | `ABBREVIATIONS`, `ABBREVIATIONS_2` |
| Data Import | — | — |

## Interactivity

* **Slicers**: the Power BI slicers (Project, ID, Fund Type, Phase, Month, WBS, Issue Status/Rate …) plus
  extra ones (Performance, Contractor, Project Size, Issue Category, KPI Group, Managed by). The slicers
  cascade, so each list only offers values that still have data and shows a row count for each. Active
  filters appear as chips; click a chip's × to remove it.
* **Cross-filtering**: clicking a bar, month or table row filters the whole page, like Power BI. The chart
  you clicked keeps showing every bar and dims the ones that aren't selected. **Ctrl + click** selects
  several values, and clicking a selected value again clears it.
* **Drill-down**: every KPI tile opens its breakdown ("Details ›"). Project bars and rows open a project
  quick view, which links to that project's progress, timeline, S-curve, cost analysis and issues. Months
  on the S-curves open that month's spend by project. Gantt headings open the project timeline.
* **Tables**: search, CSV export and **multi-column sort**. Click a header to sort by it, and
  **Shift + click** other headers to add sort levels. You can also use **⇅ Sort** to build the levels,
  like Excel's custom sort.
* **Print A4**: prints the current page, with any active filters, on **one A4 sheet**. Every table row and
  the whole Gantt are expanded (nothing is hidden behind scrollbars). The page is scaled to fit, and
  portrait or landscape is picked automatically. The sheet gets a SAR header with the page title, report
  date, active filters and print time. **Ctrl + P** does the same.
  The **▾** next to the button offers **A4 — full size, multiple sheets**, which prints at readable size
  across as many pages as needed. Use it for very long pages such as the full issue register. Choose
  **Save as PDF** in the print dialog to get a PDF.

## Publishing the weekly report (link for management)

1. Import the week's Excel files, then click **Publish** in the header.
2. Enter the report title (the week number is filled in), who prepared it, and an optional
   **management note** that appears at the top of the Executive Overview.
3. **Create report file** saves one self-contained file, e.g. `NSR_Weekly_Report_WK38_2026-09-17.html`
   (about 1.7 MB). It holds that week's data and the full dashboard: every page, filter, drill-down and
   A4 print. It has no Excel import or Publish button, so readers can't change the data.
4. Upload the file to SharePoint / OneDrive / Teams or an intranet folder, then use **Share → Copy link**
   and send the link. Keep one file per week to build an archive.

> Some SharePoint libraries download `.html` files instead of showing them. The file still opens in the
> browser from Downloads. For one-click viewing, ask IT for an intranet/IIS folder that serves HTML.

After changing the code, run `npm run release` (stamps a version on every file link so browsers load the new files instead of a cached copy, then rebuilds the publish kit).

The Publish button packs the site's code from `assets/js/publish-kit.js`. Rebuild it after changing any
code (`node tools/build-publish-kit.js`).

## Weekly PowerPoint (PD Balance Scorecard)

**Export Weekly PPT** in the header fills the PD weekly *Program – Balance Scorecard* deck with the NSR data
loaded in the dashboard and downloads it, e.g. `NSR - Program - Balance Scorecard - WK38 - 2026-09-17.pptx`.

1. The first time, load the master template (`NSR - Program - Balance Scorecard - Blank Template.pptx`, the PD sample with all data removed) in the dialog. The full PD sample deck also works.
   It is kept in this browser only (IndexedDB) and is never uploaded or committed, because it holds internal data.
2. Click **Create NSR weekly PowerPoint**. The deck keeps the template's exact formatting (slides, tables,
   native charts with their Excel data). The engine clones or removes slides to fit the data:
   - the slides keep the sample's order; *Old projects status* holds 3 close-out projects per slide, like the sample;
   - one *Projects in the Execution Phase* slide per project of the Progress section (weekly progress report), with its weekly
     progress; the project card fills contractor / consultant / funding gaps;
   - *Program Values* comes from the Project Cards section (budget, contract value, paid, phase, size, status and the execution
     SPI from card sections 7 & 8); the *SPI* slide comes from the Progress section (ΣEV ÷ ΣPV of the weekly report and S-curves);
   - on the old-projects action points, the step each close-out is waiting on is highlighted (owner in SAR blue);
   - one closing slide per open project in *Projects in Closing*;
   - SPI cards, 11 per slide;
   - spending matrices (CAPEX projects only), 3 projects per slide, with the cut-off line on the last month that has actuals.
3. Anything the dashboard does not hold shows in red as **[To be filled]**: savings, close-out dates,
   consultant, EOT, KPI criteria, progress photos and the organisation chart. Complete these in PowerPoint.

The template is found by slide titles. A newer week's template from PD works as long as the slide titles stay the same.
For a local copy that needs no loading, run `node tools/build-ppt-template.js <template.pptx>`. It writes
`data/ppt-template.js`, which is git-ignored.

## Updating the data

1. Open the site and go to **Data Import** (or click **Import Excel** in the header).
2. Drop any of the six workbooks (one or several at once):
   * `PBI Weekly Report.xlsx`
   * `EPBU 2026 Delivery Plan-v2 (Milestone & forecast) - PBI file new dashboard.xlsx`
   * `Contract details.xlsx`
   * `EP - NSR Projects <Month>.xlsx` (monthly project cards; feeds the **Issue Register**)
   * `Projects in Closing phase.xlsx` (closing-phase register; feeds **Projects in Closing**)
   * `Budget 2026.xlsx` (sheet *Curve*; the **Spending Plan (VP)** row of every project is the **Rev Spend Plan**. The
     original Spend Plan stays as it is and both are shown on the Overview, KPI Cost Summary, KPI Year-End Outlook and
     Cost Dashboard; variances and the year-end outlook are measured against the Rev plan once it is loaded)
3. The site recognises each file by the **Excel tables inside it**, not by the file name. It reads those
   tables the same way Power BI's `Excel.Workbook(…){[Item="…",Kind="Table"]}` does, and shows a
   log of rows per table plus any missing columns.
4. Only the tables from the files you imported are replaced. The import is saved in the browser
   (IndexedDB), so it's still there after a reload. **Discard imports** goes back to the baseline.

> **Project Cards file:** each `<code>_Project Card` sheet is read on its own. The site finds section 12.1
> **Issue Log** by its heading, reads the header row that starts with "ILR ID No.", and imports every ILR row
> that has content (empty ILR slots are skipped). Projects can be added or removed, and the month in the file
> name can change. The weekly PBI file no longer feeds the Issue Register.

> The same file also feeds **Project Cards** (one full card per project: general info, performance, stakeholders,
> funding & contracts, baseline versions and feedback, execution S-curve, phase/activity timeline, earned value,
> milestones, deliverables, issue / change / risk / claim logs and KPIs) and the **Portfolio Master Plan**
> (projects → phases → activities with baseline, revised baseline, forecast/actual and milestones). Each section is
> found by its heading text, so the cards may gain rows without breaking the import.

> Keep the Excel **table names and column headers** as they are. Rows can be added or removed freely,
> and formulas are fine: the site reads the values Excel last calculated, so save the file in Excel
> before importing.

**Download an imported file:** every Excel file imported in this browser is kept as-is. On **Data Import** each loaded source card has
**Download imported file**: download it, update it in Excel and import it again. The copy is stored only in this browser
(IndexedDB) and is removed by *Discard imports & restore baseline data*. Files imported before this feature need one more
import before they can be downloaded.

## Baseline data (optional)

`data/default-data.js` is the dataset the site shows before anyone imports. It's built from the Excel
files with the same importer the browser uses:

```bash
npm install
node tools/build-default-data.js "PBI Weekly Report.xlsx" "EPBU 2026 Delivery Plan-v2 (Milestone & forecast) - PBI file new dashboard.xlsx" "Contract details.xlsx"
```

The generated file contains project data, so it's listed in `.gitignore` and is **not committed to this
public repository**. Without it, the site opens empty and asks for an import.

## Running / hosting

* **Locally:** open `index.html` directly, or run `python3 -m http.server 8080` in this folder and browse to
  http://localhost:8080.
* **Hosting:** copy the folder to any static web server (IIS, SharePoint site assets, Nginx, GitHub Pages …).

## Structure

```
index.html                 app shell (header, navigation)
assets/css/styles.css      SAR theme
assets/js/importer.js      Excel-table reader (browser + Node)
assets/js/store.js         IndexedDB persistence of imports
assets/js/ui.js            formatters, tables, slicers, KPI tiles, chart defaults
assets/js/pages.js         one renderer per page
assets/js/app.js           dataset, routing, navigation, import page
assets/js/print.js         A4 one-page / multi-page printing
assets/js/publish.js       Publish: builds the self-contained weekly report file
assets/js/pptx-engine.js   OOXML editing engine (slides, tables, charts) for the PowerPoint export
assets/js/pptx-weekly.js   fills the PD weekly Balance Scorecard template with NSR data
assets/js/pptx-ui.js       Export Weekly PPT dialog (template kept in IndexedDB)
assets/js/publish-kit.js   generated by tools/build-publish-kit.js (site code only, no data)
assets/img/                SAR logos (from the Power BI report)
assets/vendor/             SheetJS, JSZip, Chart.js (+ datalabels)
tools/build-default-data.js baseline data builder
```

Fonts: the brand fonts (Diodrum Arabic / 29LT Kaff) are used when they're installed on the viewer's
machine. Otherwise the site falls back to Segoe UI / Arial.

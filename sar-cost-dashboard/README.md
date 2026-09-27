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
| Cost Dashboard | Cost Dashboard | `NSR_Project_Data` |
| Cost Analysis | Cost Dashboard graph | `NSR_Project_Data`, `Spending_Plan`, `KPI_Projects_Data` |
| Cost S-Curve | Cost S-Curve | `Spending_Plan` |
| Weekly Progress Summary | Weekly Progress Summary | `Weekly_Report_Updates` |
| Project Progress | Progress | `Weekly_Report_Updates`, `Contract_Details`, `Deliverable_Status`, `Project_Milestones_Progress`, `Interim_Payment_Certificate`, `Lookahead_Activities`, `Area_of_Concern` |
| Progress S-Curve | Progress S-Curve | `S_Curve` (sheet *S-Curve*), `MLS` |
| Projects Master Plan | Projects Master Plan | `Project_Milestones_Progress_Combine` |
| Project Timeline | Timeline | `Project_Milestones_Progress` |
| Issue Register | Issue | `Issue_register` |
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

## Updating the data

1. Open the site and go to **Data Import** (or click **Import Excel** in the header).
2. Drop any of the three workbooks (one, two or all three):
   * `PBI Weekly Report.xlsx`
   * `EPBU 2026 Delivery Plan-v2 (Milestone & forecast) - PBI file new dashboard.xlsx`
   * `Contract details.xlsx`
3. The site recognises each file by the **Excel tables inside it**, not by the file name. It reads those
   tables the same way Power BI's `Excel.Workbook(…){[Item="…",Kind="Table"]}` does, and shows a
   log of rows per table plus any missing columns.
4. Only the tables from the files you imported are replaced. The import is saved in the browser
   (IndexedDB), so it's still there after a reload. **Discard imports** goes back to the baseline.

> Keep the Excel **table names and column headers** as they are. Rows can be added or removed freely,
> and formulas are fine: the site reads the values Excel last calculated, so save the file in Excel
> before importing.

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
assets/img/                SAR logos (from the Power BI report)
assets/vendor/             SheetJS, JSZip, Chart.js (+ datalabels)
tools/build-default-data.js baseline data builder
```

Fonts: the brand fonts (Diodrum Arabic / 29LT Kaff) are used when they're installed on the viewer's
machine. Otherwise the site falls back to Segoe UI / Arial.

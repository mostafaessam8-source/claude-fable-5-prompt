# SAR Possession Progress Tracker (web)

Import a possession tracker workbook, fill in the site-layout facts (optionally with Claude), review
the report on screen, then export a live-formula workbook for site engineers. Everything runs in the
browser; the only server piece is a tiny proxy that keeps the Anthropic key secret.

## Use it

1. **Choose the tracker `.xlsx`** (top bar). Only the `Data Input` sheet is read; every figure is recomputed.
2. **Report** tab: cover + one page per location. Change the possession window and report cut-off in the
   bar above the report (one place). *Print / PDF* gives one A4 landscape page per location.
3. **Site layout** tab: edit cells / chainage / lines / OTMP / station, or paste text and press
   *Ask Claude* — you get a diff and accept per location; nothing is overwritten silently.
4. **Export to Excel**: Report, Site Layouts and Data Input sheets, live formulas, validation prompts,
   header notes, sheet protection (only input cells unlocked). It re-imports into this app unchanged.

The project is kept in this browser's `localStorage` (use *Clear* to drop it).

## Rulers
Two rulers follow the pointer on each location page (screen only): a **horizontal** one highlights the activity's row across the table and
the Gantt, and a **vertical** one highlights the Gantt column under the pointer with its time (a black label over the header), or the table column
under the pointer. Together they form a crosshair. Both are positioned from the layout constants, so they are exact at any page zoom.

## Editing an activity and its links
On the Report tab, **click any activity**: a panel opens with two tabs.
- **Baseline (plan)**: name and duration; the **predecessor** (choose it from the earlier activities, set the relationship FS/SS/FF/SF and the lag, open it);
  and the **successors** (edit their relationship and lag, open or **Unlink** them, or link another activity so it follows this one).
- **Actual**: baseline against actual for start, finish and duration with the difference in hours; the actual start/finish (date and time), % complete
  and remarks; quick actions (*started at the cut-off / as planned*, *finished at the cut-off / as planned (100 %)*, *clear*); and a plain-words warning
  when the dates make no sense (the engine then flags the row and counts it as 0 %). Clicking the **actual (A) bar** in the Gantt opens this tab.

Every change recomputes the plan and the forecast and updates the table, the Gantt and the summary immediately; it is saved in the browser and
exported to Excel. *Set the lag to keep the start I opened it with* re-links without moving the date; *Unlink* and *Link another
activity* also keep the date (they set the lag for you; change it to 0 to make the activity follow). A predecessor must be an
earlier activity (smaller number). Esc closes the panel.

## Editing on the Gantt
The **planned (P) bar** of each activity can be edited directly (screen only; the ruler follows the pointer):
- **Move**: drag the bar left/right (in whole columns, one hour at the default span). The lag changes (with no predecessor the lag is the start), so
  everything that follows moves with it.
- **Duration**: drag the bar's **right edge** to move the finish (start stays) or its **left edge** to move the start (finish stays). Minimum 15 min.
  For *finish-to-finish* / *start-to-finish* links the lag is what fixes the finish, so the handles adjust the lag and duration to keep the other end still.
- **Link**: hover a bar to see a dot outside each end; drag from a dot to a dot (or onto the bar) of another activity. The earlier activity is always the
  predecessor, so it works in either direction; finish→start = FS, start→start = SS, finish→finish = FF, start→finish = SF. The successor keeps its
  planned start (the lag is set for you).
- **Show links** (settings bar) draws an arrow for every predecessor link. Everything updates the table, forecast and summary live.
- **Actual bar** (the lower bar of a row that has an actual start): drag it to move the actual dates, its left edge for the actual start, its right edge for the
  actual finish. Dragging the right edge of work still in progress sets a finish (100 %). Create the first actual with the Actual tab's quick actions.
- **Add / delete**: **+ Add activity** (grey bar of each location page) appends an activity that follows the last one and opens its panel; **Delete this activity**
  (Baseline tab) removes one — whatever followed it is unlinked and keeps its planned start. Numbers are row slots, so nothing is renumbered; adding past the
  workbook's row count lengthens every location block in the export. A very long location gets smaller rows on its page.
- **Activities tab** (next to Report): one location's activities as an editable list — rename, duration, predecessor/relationship/lag in place; tick rows
  (Shift-click = range) to **delete, duplicate or move several at once** (▲/▼); drag the ⠿ handle to **reorder** (a ticked block moves together); **+ Add /
  Insert below**. On the Report, drag a row's number to reorder and click the name of the selected row (or double-click) to rename it.
- **Type the planned dates** (panel Baseline tab, and the Planned start / finish columns of the Activities tab): the predecessor and relationship stay and the **lag is
  recomputed** so the link gives exactly the date you typed. A new finish also sets the duration (the start does not move); with no predecessor the lag is the start.
- **Copy table (formulas)** puts *live Excel formulas* on the clipboard: paste it with its top-left cell at the chosen cell (A1 by default, in an empty sheet) and the planned dates follow
  the same rules as the app (predecessor, FS/SS/FF/SF, lag, duration). Change a duration, lag, predecessor or relationship in Excel and **every date after it moves** — no manual date work.
  Helper columns M–O (start/finish in hours, predecessor row) and the possession start (Q1) sit to the right; leave them. The formulas use OFFSET/MATCH/TEXT (no circular references); verified
  against the app with LibreOffice. *Copy values* gives plain text instead. When you copy the edited table back, the dates Excel computed are recognised as consequences, not as typed dates.
- **Edit in Excel, paste back** (Activities tab → *Copy table* / *Paste table…*, in the contractor copy too). *Copy table* puts the location's table on the clipboard (tab-separated, header row first:
  #, Activity, Duration, Follows, Rel, Lag, Planned start/finish, Actual start/finish, % complete, Remarks). Paste it into any Excel sheet, edit freely (rename, add or delete rows, reorder, change
  links / lag / actuals / remarks, type planned dates), select the whole table **with its header row**, copy, and *Paste table…*: a live preview lists every change; Apply is one Undo step.
  Rows are matched by **#**; row order = activity order; a row with a blank or unknown # is a new activity; “Follows” refers to the # values in your table; activities missing from the paste are
  deleted (untick the box to keep them). Typed planned dates move the lag/duration (the link stays) unless the same row's duration/link was edited. Dates are read as Excel shows them
  (`16-Oct-2026 01:30`, `10/16/2026 1:30 PM`, `2026-10-16 01:30`, serial numbers; day/month order is guessed from the table). Columns may be reordered or left out.
- **New project from scratch** (header **+ New project**): project name, possession start and duration, and the first location (code, chainage, cells / pipes). It opens on the Activities tab with one starter activity; add the rest there (or paste a table from Excel).
- **No Excel needed to start.** Header **Open update / project (.json)** opens the contractor's update file (or a project saved with **Save project (.json)**) directly as the project; the Excel tracker is only the small "new from Excel tracker" link for a brand-new project.
- **Contractor round trip.** Updates come only from the offline copy (below), never from Excel: header **Import contractor update** takes its `.json`; the file is compared with the current project and every changed activity is listed (was → now, plan changes in red);
  tick what to take (activities, and corrected site layouts), Apply (one Undo step). Activities are matched by name (then number); locations by name or code; link fields are skipped if the numbering differs.
  Other edits you made in the app are never overwritten by *Apply selected*. Added / removed / reordered activities and locations and changed settings are listed under **Structure and settings changed** and are taken with **Take the contractor's version** (replaces the project; Undo restores yours).
- **Offline copy for the contractor** (header button): one `.html` file with the whole app and the project inside. The contractor opens it with a double-click (no internet, nothing
  to install), fills in actuals / % / remarks (Actual tab, or drag the lower bar), and presses **Save update for SAR**, which downloads a small `…_UPDATE.json`. The copy has **no Excel export**,
  no import and no settings. It has three tabs, **Report**, **Activities** and **Site layout**, and **everything about the plan is editable there** (add / delete / reorder activities and locations, duration, predecessor, relationship, lag, planned dates, settings, cells / pipes…; no Claude fill); his work is kept in his browser per file. Send the `.json` back and use **Import contractor update** (it takes only that `.json` — updates are never read from Excel) to review and apply it. Only available from the built site (GitHub Pages), not the dev server.
- **Remarks** are a column of each location's report table (long ones are also written out in full under the table; both print), in the Activities tab (editable) and the panel's Actual tab; in the exported workbook they
  are the REMARKS column of Data Input and a **Remarks column in the Report table** and a **REMARKS line under each Report page**, built live from that column.
- **Length** of each culvert (Site layout tab → Length, e.g. `24 m`): shown on the schematic card, in the report title and header bar, the cover, in the exported workbook (Site Layouts column N, Report strip) and in the scope line (`Length 24 m`); contractor corrections of it come back in the update.
- **Prepared by** and the **cut-off mode** are in the settings bar: the cut-off (data date) is either **Manual** (a date you type, or “= start”) or **Now (live)**, which is the clock (like Excel's `=NOW()`), refreshed every 30 s while the app is open; it is exported as `=NOW()`. The cover shows “(cut-off = now, live)”.
- **SAR logo**: the official bilingual logo (as supplied in the CRP2 sheet) sits on white at the top of the cover, at the foot of every location page, and in the exported Report sheet under the cover title (row 6). It is embedded (`src/brand/logo.ts`), so the offline copy has it too; keep its clear space and never recolour or stretch it.
- **Report table, like a spreadsheet**: drag the right edge of any column header to change its width (double-click it: default; *Reset column widths* in the settings bar); the Gantt takes whatever width is left, so the page always fits A4. Widths are saved with the project. Cells can be typed in directly — click a row to select it, then click (or double-click) the cell: **Activity**, **Dur BL** (baseline duration), **Dur Actual** (typing it sets the actual finish from the actual start), **Planned Finish** (the start stays, the duration changes), **Act. %** and **Remarks**. Status, forecast, variance and plan % are calculated. The Excel Report has *Dur BL* / *Dur Actual* columns too.
- **The SAR logo** heads every location page (and the cover, and each page of the exported Report).
- **Culvert type** (Site layout tab → Type): **Cells** (box) or **Pipes** (round). It changes the schematic card, the “N PIPES” caption, the report headers and the exported scope line
  (`2 pipes │ …`, which re-imports as pipes). Claude's fill can propose it too.
- **Actuals in the Activities tab**: Actual start / Actual finish (date-time) and % done are editable in the table (an actual finish makes it 100 %), next to the plan and the Remarks.
- **Locations** (top of the Activities tab): rename a location and its scope line, **+ New location** (one starter activity), duplicate (without actuals), move earlier/later,
  delete. The workbook's location list holds up to 10. Renaming keeps the other site-layout facts (only code and chainage follow the name). Undo covers all of it.
- Reordering / deleting renumbers the activities (1..n) and keeps every link that is still valid. An activity whose predecessor was removed or now comes
  later is unlinked and **keeps its planned start**, so no date moves silently (a note says which).
- **Undo / Redo** (header buttons, Ctrl+Z / Ctrl+Shift+Z): every edit — a drag is one step, adding/deleting/reordering/renaming each their own.
- The activity panel no longer covers the Gantt: while it is open the report shrinks (zoom) to the space left of it.
Fine adjustments (exact lag/duration) are in the activity panel (click the activity).

## How the forecast works
Each activity has one predecessor (`PRED`), a relationship (`FS`/`SS`/`FF`/`SF`) and a lag. A delay (or gain) is carried
**along that link**, less any planned slack between the two joined ends, so it reaches only what depends on it; parallel
branches are not delayed by each other. A location's forecast finish is its **latest** forecast activity (not necessarily
the last row), and the buffer to hand-back is measured from that. The Excel export uses the same rule in live formulas.

## Opening a raw CRP2 progress sheet
The sheet has start/finish times but no predecessors. The app keeps the dates the sheet shows (repairing a typed time that lost
its +24 h, and reporting every repair) and rebuilds each activity's predecessor link from the sheet's own formulas, falling back to
the times. The **Relationships** tab lists every link. To review or change the logic, send the sheet to Claude in the chat session:
changes are validated so that every link still reproduces the sheet's planned start to the minute (`src/links/diff.ts`), then a
corrected tracker workbook is exported.

## Develop

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit + round-trip + Excel checks
npm run typecheck && npm run build
```

`npm test` includes cross-checks that recalculate the exported workbook with LibreOffice and compare every
activity with the engine; they skip themselves if `soffice` is not installed. To regenerate their expected
files: `node tests/tools/make-golden.mjs` (needs LibreOffice).

## Deploy

### 1. GitHub Pages (the app)
1. Repo **Settings → Pages → Source: GitHub Actions**.
2. Push to `main`; `.github/workflows/pages.yml` type-checks, tests, builds and publishes `dist/`.

### 2. The Claude proxy (Cloudflare Worker) — only needed for *Ask Claude*
```bash
cd worker
# put your Pages origin in wrangler.toml → ALLOWED_ORIGINS  (e.g. https://YOUR-USER.github.io)
npx wrangler secret put ANTHROPIC_API_KEY     # paste the key; it is stored only in Cloudflare
npx wrangler deploy                           # prints https://sar-tracker-claude-proxy.<you>.workers.dev
```
Then set the repository **variable** `CLAUDE_PROXY_URL` (Settings → Secrets and variables → Actions →
Variables) to that URL and re-run the workflow, so the build bakes it in as `VITE_CLAUDE_PROXY_URL`.

The Worker forwards only the app's own request (fixed model, the single `fill_site_layouts` tool, capped size)
and only for the origins in `ALLOWED_ORIGINS`. Origin checking stops other websites from using it, but a
script can fake an `Origin`, so also add a Cloudflare rate-limit rule on the Worker route if the URL is public.

**Without a proxy** the Site layout tab shows a field for your own API key. It is kept in `sessionStorage`
only (gone when the tab closes) and the request goes straight from your browser to Anthropic. Never commit a
key: `.env` is git-ignored, `.env.example` shows the one variable.

## Known limitations
- Reference drawings on the source workbook's *Site Layouts* sheet are not carried over (the import ignores
  everything but `Data Input`); the exported sheet has the layout table and the schematic cards.
- Verified against LibreOffice's calculation, not opened in desktop Excel.
- The brief does not define the cover's ALL LOCATIONS row; it is worst case (max variance and finish, min
  buffer, hours-weighted progress).

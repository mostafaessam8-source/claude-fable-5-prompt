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
- **Culvert type** (Site layout tab → Type): **Cells** (box) or **Pipes** (round). It changes the schematic card, the “N PIPES” caption, the report headers and the exported scope line
  (`2 pipes │ …`, which re-imports as pipes). Claude's fill can propose it too.
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

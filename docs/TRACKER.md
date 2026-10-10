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

## Editing an activity and its links
On the Report tab, **click any activity**: a panel opens with its duration, % complete, actual start/finish and remarks; its planned and
forecast times; its **predecessor** (choose it from the earlier activities, set the relationship FS/SS/FF/SF and the lag, open it); and its
**successors** (edit their relationship and lag, open or **Unlink** them, or link another activity so it follows this one). Every change
recomputes the plan and the forecast and updates the table, the Gantt and the summary immediately; it is saved in the browser and
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

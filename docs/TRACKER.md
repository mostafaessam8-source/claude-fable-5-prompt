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

## How the forecast works
Each activity has one predecessor (`PRED`), a relationship (`FS`/`SS`/`FF`/`SF`) and a lag. A delay (or gain) is carried
**along that link**, less any planned slack between the two joined ends, so it reaches only what depends on it; parallel
branches are not delayed by each other. A location's forecast finish is its **latest** forecast activity (not necessarily
the last row), and the buffer to hand-back is measured from that. The Excel export uses the same rule in live formulas.

## Opening a raw CRP2 progress sheet
The sheet has start/finish times but no predecessors. The app keeps the dates the sheet shows (repairing a typed time that lost
its +24 h, and reporting every repair), then opens the **Relationships** tab and asks Claude for the logical predecessor of each
activity. A proposal is offered only if it reproduces the sheet's planned start to the minute, so accepting one can never move
a date; you accept or reject each one. (Needs the Claude proxy or your own key, like *Ask Claude* on the Site layout tab.)
If you already deployed the Worker, redeploy it (`cd worker && npx wrangler deploy`): it now also allows the `suggest_links` tool.

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

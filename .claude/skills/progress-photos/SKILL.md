---
name: progress-photos
description: Rules for importing site progress photos from the per-project weekly report workbooks (.rar / .zip / .xlsx) in sar-cost-dashboard and placing them on the project dashboard and in the PROGRESS PHOTOS box of the weekly PPT execution slides. Use whenever photos are missing, wrong, badly cropped, in the wrong project, or the user wants to change how many / which photos show. Arabic triggers: "الصور", "progress photo", "صور الموقع", "ملف الـ rar", "winrar".
---

# Progress photos — weekly report files → site + PPT

Code: `sar-cost-dashboard/assets/js/photos.js` (`SARPhotos`), the import page hook in `app.js` (`handleFiles`,
"Progress photos" card), the project dashboard panel in `pages.js`, and `progressPhotos` + the media step in
`build` of `pptx-weekly.js`. RAR is read by `assets/vendor/unrar.min.js` + `unrar.wasm` (node-unrar-js, local, no CDN).

## Input

- A `.rar` (WinRAR, v4/v5) or `.zip` of the per-project weekly report workbooks, or the `.xlsx` files dropped directly.
  Folders inside the archive are ignored; `~$` lock files are skipped. An `.xlsx` that is not a known data source is
  checked for photos instead of failing.
- Sheet: the one named "Progress Photo" (also "Progress Photos"); other sheets starting "Progress Photo" are tried only
  if it has no photos.
- Pictures: floating pictures (`xl/drawings`, by anchor) and pictures placed in cells (`xl/richData`, cell `vm` →
  value metadata → rich value → image rel). Sorted top-to-bottom, left-to-right; the same picture twice is kept once.
- Skipped: images smaller than 240 × 160 px or 5 KB (the sheet banner / logos / icons) and non-raster files (EMF, SVG).
- Max 8 photos per project, each scaled to ≤ 1280 px on the long side, JPEG 0.82.

## Matching to a project

File name = the weekly report `Source.Name` → exact match first; else the code in the name
(`NSR_<code>_…`, `NSR-<code>-…`) = weekly `Project Code`; else the base code (suffix letter dropped).
A new import replaces only the projects it contains; the others keep their photos.

## Storage

Photos: IndexedDB key `photos` in the viewer's browser. The imported archive itself (.rar / .zip) is kept like the
Excel sources: IndexedDB key `file:photos` ("Download imported file" on the Progress photos card) and, when cloud storage
is connected, `imports/photos/<name>` in the user's PRIVATE data repository (source key `photos` in index.json — the
cloud "Import" / "Load latest" re-imports it through the photo path, "Upload stored files" includes it). Never in the
public repository, never in a published report. "Remove progress photos" clears the photos and the kept archive.

## Output

- Site → Progress Dashboard → Project dashboard: "Progress photos" panel, all photos in a 4:3 grid. A click opens the
  photo inside the site (`photoViewer` in `pages.js`, never a new tab): Zoom out / % / Zoom in / Fit, Save (downloads
  `<code>_progress_photo_<n>.jpg`), Close (also Esc or a click on the dark background); mouse wheel and double-click
  zoom at the pointer, drag moves a zoomed photo, ← / → or the side arrows go to the previous / next photo.
  None → a note telling the user to import the weekly report files.
- PPT execution slide: the first 4 photos side by side inside the frame under the "PROGRESS PHOTOS" title; equal
  cells no wider than 4:3, each photo centre-cropped (`srcRect`) to fill its cell, thin white line, row centred.
  No photos → the box stays empty (no placeholder text).

## When changing it

- Keep the Excel formats unchanged; no project data, codes or photos in code, comments or this file (public repo).
- Verify in a browser: import the .rar on Data Import (log lists every file → code → photo count), open a project
  dashboard, build the PPT with the photos, validate.py passes, render an execution slide with and without photos.
- Then `npm run release` in `sar-cost-dashboard`, commit with the session trailers, push to the working branch.

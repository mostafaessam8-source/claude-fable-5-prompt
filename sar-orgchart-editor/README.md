# SAR Org Chart Editor

Single-file, offline, Word-style editor for the 5 SAR program organization options.
Open `index.html` in Chrome / Edge (no server, no install).

- Boxes: drag, resize, double-click / F2 to edit text, font, colour, fill, outline, shape, alignment.
- Connectors are glued to boxes (move a box and lines follow):
  - **Reporting line** – solid org-chart elbow.
  - **Dashed link** – auto-routed around other boxes; pick sides / position / arrows / label in the *Connectors* tab.
  - Create by dragging from a box's blue dot, or with the *Reporting line* / *Dashed link* tools.
- File: Save (Ctrl+S), Save As (Ctrl+Shift+S), Open, Export PNG / SVG, Print / PDF (all pages).
- Undo/redo, copy/paste/duplicate, align/distribute, grid + snap, zoom, page add/duplicate/delete/reorder. Autosaves to the browser.

Source: `template.html` (app) + `data.json` (the 5 options from the .docx); `python3 build.py` produces `index.html`.

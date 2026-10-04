---
name: achievement-shorten
description: Rules for fitting the Achievements box on the "Projects in the Execution Phase" slides of the weekly PPT in sar-cost-dashboard — the achievements are entered first, then shortened step by step until they fit the box at a readable size. Use whenever achievements spill out of their box, look too small, are shortened wrongly, or the user asks to change how they are condensed. Arabic triggers: "achievement", "الإنجازات", "اختصر", "shorten", "الكلام طالع برة البوكس".
---

# Achievements — shorten to the box

Code: `shortenToBox(sh, ach, next, 7.5)` in `sar-cost-dashboard/assets/js/pptx-weekly.js` (with `SHORT`, `compact`,
`mainClause`, and the shared text measure `textBox`), called from `fillExec`; `fitText(sh, 7)` runs after it.
Change the rule there only.

## What goes in (before shortening)

1. Achievements: the PBI Weekly Report's **Weekly Achievements** sheet for the project (`Weekly_Achievements`,
   by Sr. No., empty rows and exact duplicates dropped). If the sheet has none for the project: the weekly row's
   `Achievements Description`, else `Key milestone: <KM Activity>`.
2. Then the lookahead lines: `Next: <Lookahead Activities (7 Days) Description>` (first two).
3. Nothing at all → the box is left empty (no placeholder).

## Shortening steps (each only if the text still does not fit at 7.5 pt)

1. **As is** — if it fits, nothing changes.
2. **Compact wording, same meaning**: "is/are ongoing / in progress / under progress" → "ongoing", "has been" dropped,
   Installation → Install., Construction → Constr., Concrete → Conc., preparation → prep., Excavation → Excav.,
   Submittal/Submission → Subm., including → incl., approximately → ~, and → &, Reinforcement → Rebar,
   "Fixing of rebars" → "Rebar fixing", a leading "The/A" dropped, spaces tidied.
3. **Lookahead**: keep one "Next:" line, then none.
4. **Main clause**: each achievement keeps its first clause (split at " — ", " - ", ";" or ", "), plus the second
   clause when the first is very short.
5. **One line each**: an achievement longer than one line is cut at a whole word, ending before a preposition
   (for / at / of / in / on / to / with / between / behind / from / by) so the phrase is not split, and never on
   "&", ",", "-" or a joining word.
6. **Fold the tail**: the last achievements are replaced by one line "+N more activities ongoing" (as few as needed).

Never "…", never a cut mid-word. After shortening, `fitText` may still step the font down (minimum 7 pt, never below
5 pt) for the final fit.

## The measure (`textBox`)

Shared with `fitText`: glyph width ~0.58 em, line height 1.25 em, the paragraph's spcBef/spcAft, and an 18 pt hanging
indent for bulleted multi-paragraph boxes (the indent often comes from the list style, not the paragraph) — tuned
so PowerPoint does not spill text that the estimate thought would fit. If PowerPoint still overflows, raise these
factors rather than lowering the 7.5 pt target.

## When changing it

- Keep the Excel formats unchanged; no project data or names in code, comments or this file (public repo).
- Verify with a PPT build that imports a Weekly Achievements sheet with many long items (10+), and check: every
  execution slide's Achievements box ends inside the box (render the slide), short lists are untouched, the lines
  read as whole phrases, and validate.py passes.
- Then `npm run release` in `sar-cost-dashboard`, commit with the session trailers, push to the working branch.

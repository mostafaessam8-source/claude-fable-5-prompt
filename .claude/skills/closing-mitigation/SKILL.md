---
name: closing-mitigation
description: Mitigation Action rules for the "Projects in the Closing Phase" slides of the weekly PPT in sar-cost-dashboard. Use whenever a closing-slide Mitigation Action is added, changed, checked or questioned, or when the user asks why a closing project shows a given mitigation, wants a new blocker type covered, or wants the wording changed. Arabic triggers: "mitigation", "الإجراء", "خطة المعالجة", "كروت الـ closing".
---

# Closing-phase mitigation — project rules

Closing cards are made only for open closing-register rows at 100 % actual progress (same list as the Old projects
slides). Every closing card (`fillClosing` in `sar-cost-dashboard/assets/js/pptx-weekly.js`) has an ISSUES / Mitigation Action
table with up to two rows. The mitigation logic lives in `statusMitigation` and `stepsMitigation` (same file, above
`openClosing`). Change the rule there and only there.

## Source

`Projects in Closing phase.xlsx` → `Closing_Projects`, one row per project:
- `Current Status` → issue row 1.
- Close-out step columns (every column between *Final Contract Value* and *Current Status*: AMP-E1, AMP-E2, Hand Over
  Report, Closout Report, Retention Release, AP guarantee Release, Final Payment, Performance guarantee release).
  A date = Completed, "N/A" = not applicable, empty = Not Started, other text = its status (`stepState`).
  Steps not Completed / NA → issue row 2 "Pending close-out steps: …".
- `Action Plan` → **always wins** for row 1 when filled. The rules below only fill the gap.

## Row 1 — mitigation from the Current Status text (`statusMitigation`)

Checks run in this order; at most two actions are kept, joined with ". ":

| text mentions | action |
|---|---|
| AMP / AMP-C / AMP-E1 / AMP-E2 (stages named in the text are listed, "E1/E2" and "E1 & E2" expand) | "PM to follow up <stages> sign-off with the Asset Team weekly"; prefixed by "Contractor to submit the outstanding AMP documents (via Aconex)" when documents / submission / Aconex are mentioned, and by "close the open snags" only when snags are mentioned and NOT stated as closed / cleared |
| MoT / MOI / ministry / authority / municipality / stakeholder / STC / SEC, or "awaiting … response" | Escalate the handover / approval to the authority through SAR management and track the response weekly |
| CR / change request / variation | Expedite the CR approval, then update the baseline and contract value |
| open snags (no AMP mentioned) | Contractor to close the remaining snags; PM to verify and sign off |
| works / construction / superstructure / asphalt / installation together with remaining / ongoing / in progress | Contractor to submit a recovery schedule for the remaining works; PM to monitor weekly to completion |
| close-out | Compile and submit the close-out report with the as-built and handover documents |
| payment / retention / guarantee / invoice | Finance to process the pending payment / release once the close-out documents are signed |
| only "completed" (partial scope done) | Complete the remaining scope, then proceed to AMP-C / handover sign-off |
| nothing matched | PM to agree the corrective action and target date with the contractor and track it weekly |

"Remaining AMP…" is an AMP item, not remaining works: the works rule needs a works word next to remaining / ongoing.

## Row 2 — pending close-out steps (`stepsMitigation`)

- Steps keep the register's order and are grouped while consecutive steps share an owner (`STEP_OWNER`:
  AMP → Asset Team + PM, Hand Over → PM, Close-out → PM + Program Controls, Retention / AP guarantee / Final payment →
  Finance, Performance guarantee → Finance + Supply Chain).
- Non-finance groups (up to three) become: AMP group → "<AMP-E1 & AMP-E2> sign-off (owner)", others →
  "submit the <step> (owner)", joined with " → ".
- All finance steps are summarised last: "Finance: retention, AP guarantee, final payment & performance guarantee
  (at DLP end) after close-out".
- Text starts with "Next: ".

## Output rules

- Mitigation cell clipped at 260 characters, table font 9.5 pt, rows grow with the text.
- Unknown issue → "[To be filled]" stays only when there is no Current Status and no pending step.
- Wording is English, imperative, names the owner.

## When changing it

- Keep the Excel formats unchanged; read only what the importer already provides.
- No project data, codes or names in code, comments or this file: the repo is public.
- Verify with a PPT build: list every closing-card ISSUES → Mitigation pair (markitdown), check no suggestion
  contradicts its issue (e.g. "close snags" when snags are closed), validate.py passes, render one closing slide.
- Then `npm run release` in `sar-cost-dashboard`, commit with the session trailers, push to the working branch.

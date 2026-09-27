# Gap report

This report says which parts of the reference workflow Recovery Manager Pro reproduces, which it only approximates with its own independent logic, and which it cannot reproduce. It covers the reference video's v3.30 behaviour only. Later product versions were not considered.

## Reproduced (the observable behaviour is implemented)

- Recovery of existing orders only, with the EA idle and showing "No orders to recover" when nothing is eligible.
- Order roles ORIGINAL / LOCK / RECOVERY. Main position = original + lock, and managed basket = main + recovery, with every ticket counted once.
- All input values visible in the video, collected in `MQL4/Presets/Video_Reference.set`. That covers priority, scope, magic list, first ticket, locking, SL/TP deletion, launch mode and threshold, "other EAs", launch actions, partial lots and TP points, overlap threshold, basket TP, filter, directions, lot and step parameters, one-per-bar, multidirectional, slippage, spread, caps, magic, commission switch, notifications, panel options and trend-filter settings.
- The functional panel layout: main panel (upper left), current-group panel (lower left) and manual opening panel (lower right), each with the button set seen in the video. Chart annotations are equivalent: yellow profit labels, dotted connectors, blue/orange levels, and the black/green chart scheme as an option.

## Independently approximated (a working choice exists but it is not claimed equivalent)

| Area | What the reference leaves open | What this EA does |
|---|---|---|
| Points → money for the partial TP | The video confirms 30 points; the lot basis and normalisation are not established. | `TickValue·Point/TickSize × points × lots`, with a selectable lot basis (`InpTPBasis`). |
| Which main tickets are sliced, and how | The priority setting is visible, but the ranking metric is not. | Loss per executable lot, first-ticket override, stable tie-break, matched BUY/SELL slices when locked. |
| Grid anchor and direction | Not established. | BUY entries trigger at the previous BUY fill minus the step; SELL entries at the previous SELL fill plus the step. |
| First recovery entry | Trigger and anchor not established. | Opens as soon as RECOVERING allows. The unfiltered first direction comes from `InpFirstDirection`. |
| Overlap boundary | Whether the threshold uses ≥ or > is not established. | Configurable, default ≥. |
| Grid index after an overlap | Not established. | RECOUNT (default) or CONTINUE. |
| "Close profitable orders at launch" | The switch is visible, but its mechanics are not. | A profit-financed reduction of losing orders, executed only with a non-negative expected net. |
| "Full commission calculation" | The switch is visible, but its meaning is not. | *true* assumes the exit side costs as much again as the booked commission. |
| "Disable other EAs" | The mechanism is not established. | Closing other charts, selected by symbol only because MQL4 cannot identify EA charts. Off by default, previewed and requiring a second enablement. |
| Candle filter (BullsBears) | Formula unknown. | "RM Candle Reversal", a documented two-bar reversal rule that is **not** BullsBears. |
| Trend filter (AW Trend Predictor) | Formula unknown. | "RM Swing Trend", a documented N-bar midpoint + momentum rule that is **not** AW Trend Predictor. |
| Delete SL/TP | Launch-only or continuous is not established. | Launch-only by default. Continuous is available as a labelled enhancement. |

## Blocked by missing original details

- **The BullsBears and AW Trend Predictor indicators themselves.** Their buffers and semantics are not available, so their signals cannot be reproduced. An external indicator adapter (`RM_SIG_EXTERNAL`, `InpExtIndicator` / buffers) is provided so that a licensed copy can be connected once its buffer meanings are supplied. A missing indicator never allows entries.
- **Exact equivalence of trade sequences with the video's backtest.** The report figures (304 trades, 587.07 net, 35.42 % drawdown) depend on the unknown rules above, on the broker data and on manual actions in the recording. The implementation was deliberately **not** tuned toward those numbers.
- **Visual pixel parity.** The panels are functionally equivalent and use original branding. Layout, fonts and colours are approximations.

## Verification gaps in this delivery

- **MetaEditor compilation was not performed**, because no MT4 terminal was available where this was built, and so no `.ex4` is supplied. A C++ lint and a native end-to-end simulator cover a large part of the logic (see `TEST_RESULTS.md`). MQL-specific compile issues that a C++ compiler cannot see may still appear on the first build.
- **No Strategy Tester runs or screenshots** were produced, for the same reason. `VISUAL_TEST_PROCEDURES.md` lists the procedures to run and what to record.
- **The video and the official product pages were not directly accessible** during the build. VIDEO and DOCUMENTED rows rely on the transcription in the project brief.

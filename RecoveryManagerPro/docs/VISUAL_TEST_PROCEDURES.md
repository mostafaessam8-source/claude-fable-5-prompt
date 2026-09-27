# MT4 visual-test procedures

These procedures need a real MetaTrader 4 terminal. They were **not run** in the build environment (see `GAP_REPORT.md`). Each one names the automated test that already covers the same logic, so a tester can tell which failures come from the MT4 layer alone.

## V00 – Common setup and what to record

1. Compile per README §2. Put both presets in `MQL4/Presets/`.
2. Strategy Tester: *Expert Advisor* = RecoveryManagerPro, symbol and period as stated, model **Every tick**, **Visual mode on** (buttons only work in visual mode), initial deposit 10,000 USD, positions *Long and Short*.
3. The EA manages existing orders, so a tester run needs orders to recover. Use the test seeds (`InpEnableTestSeeds=true`, `InpTestSeedScenario`, `InpTestSeedLots`, `InpTestSeedBar`) or press **Open Buy / Open Sell** with role ORIGINAL on the manual panel. Seeds are refused outside the tester.
4. Record for every run: broker and data source, symbol metadata (digits, point, tick size, tick value, min lot, lot step), date range actually completed, spread setting, commission, modelling quality, every manual click (time and button), the preset or `.set` used, and the files `tester/files/RecoveryManagerPro/T_*_audit.csv` and the Journal tab.
5. Take screenshots of: the three panels during RECOVERING, a closed-group profit label, the report tab, and the empty state ("No orders to recover").

| # | Acceptance item | Procedure | Pass criteria | Automated coverage |
|---|---|---|---|---|
| V01 | No eligible orders: no spontaneous trade | Video preset, no seeds, run one month. | Zero trades; panel shows IDLE / "No orders to recover". | S01 |
| V02 | One losing BUY / one losing SELL / balanced hedge / unbalanced mix | Seeds `ONE_BUY`, `ONE_SELL`, `BALANCED_HEDGE`, `UNBALANCED_MIX`, each in its own run. Use `InpLaunchMode=DD_MONEY` (e.g. 20) so launch happens after a real loss. | Lock = net main exposure (0 for the balanced hedge); audit shows `LOCK_OPEN` then `LOCKED`, or `LOCK_RESIDUAL`. | C T02, S02, S03 |
| V03 | Unrelated symbol and magics untouched | Live demo: open an order on another symbol and one with magic 777 on this symbol; `InpExcludeMagics=777`. | Neither appears in the panel totals or the audit; neither is modified. | S03 |
| V04 | Launch thresholds trigger once, correct scope | `DD_PERCENT 1` and `DD_MONEY 20`, with price moving through the threshold twice. | A single `ARMED -> PREPARING` line in the audit. | C T04, S10 |
| V05 | Other-EA chart handling | Live demo: two extra charts with EAs; set `InpOtherEAs=1` **without** `InpAllowChartClosure`. | Init refused with an explanation. With both set: `CHART_PREVIEW` at start lists exactly those charts, and they close at launch while this chart stays open. | validation |
| V06 | Partial volume obeys lot step, no invalid remainder | Broker with min lot 0.10 (or edit `InpPartialLots=0.05` on a 0.01-step symbol). | Every `LEG_FILLED` leaves either 0 or ≥ min lot. | C T05, S02 |
| V07 | Hedge P/L, negative slices, swap, commission | Account with commission; hold across a rollover. | `PLAN` estimated vs `PLAN_DONE` realised differ only by slippage; booked swap/commission not deducted twice. | C T06, S02 |
| V08 | Point→money on Forex and non-standard tick size | Run on EURUSD and on an index/metal where tick size ≠ point. | Current-group target = TP points × money per point per lot × lots. | C T07 |
| V09 | Lot multiplication from unrounded base | Video preset; let three grid orders open. | Lots 0.06, 0.07, 0.10 (raw 0.06, 0.078, 0.1014); audit `ENTRY` shows the raw lot. | C T08, S02 |
| V10 | Signal filters | `InpSignalMode=1` and `=2`; compare entries with the documented formulas in `RM_Signals.mqh`. | Entries only on bars that satisfy the formula; panel names the filter "(independent)". | — |
| V11 | One-per-bar across retries and restart | Live demo: change timeframe right after an entry. | No second entry in the same bar. | C T09, S15 |
| V12 | Multidirectional off | Oscillating market, two-month run. | Never a BUY and a SELL recovery basket open at once. | C T10, S09 |
| V13 | Panels and chart objects | Visual run, any preset. | Three panels as in README §6; profit labels avoid the panels; levels blue/orange; font 6 readable at *Large* size. | S14 |
| V14 | Overlap boundaries, final slice | `InpOverlapThreshold=3`, run until ≥ 4 recovery orders exist. | Audit `PLAN ... OVERLAP` lists the first and last only; the final slice closes all recovery orders. | C T11, S18 |
| V15 | Whole-basket exit | `InpBasketTP=1`, `InpBasketTPMoney=5`. | `BASKET_TP` → CLOSING → COMPLETE → IDLE; all three roles closed. | S19 |
| V16 | Failure after one leg, restart mid-lock/mid-closure | Live demo: disconnect the network during a closure, or restart the terminal while LOCKING. | No duplicate lock; `LEG_RECONCILED` or `PLAN_DONE` once; realised counted once. | S04, S05, S12 |
| V17 | External closure, ticket replacement, margin, disconnection | Close a lock by hand; partially close an original by hand; raise leverage requirements; disconnect. | `EXTERNAL_CLOSE` / `EXTERNAL_PARTIAL` / `LINEAGE`; re-lock; "insufficient margin" reason; no trades while disconnected. | S06, S11, S05 |
| V18 | Buttons, scope, pause/resume, emergency precedence | Press every button; pause, then let the emergency threshold hit with `InpEmergencyOverPause=1`. | Each button does what README §7 says, with a confirmation preview; the emergency closes the basket while paused. | S07, S08, S13, S16 |

## Reproducing the reference demonstration (optional)

GBPUSD H1, Every tick, 2022.01.01–2023.05.31 per the date fields at 00:20–00:25 (the fields do not prove the whole period was completed), deposit 10,000 USD, `Video_Reference.set`, and seed or manual orders, because the video does not show how its initial orders were created. Record the results. **Do not tune the inputs toward the video's report totals.**

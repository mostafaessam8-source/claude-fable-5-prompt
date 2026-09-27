# Recorded automated test results

- **Date:** 2026-09-27
- **Environment:** Linux, g++ 13.3.0 (C++17), Python 3.11.
- **Command:** `./tests/run_all.sh`
- **Not run:** MetaEditor compilation, and the MT4 Strategy Tester or live/demo terminal. No MetaTrader 4 installation was available. See `VISUAL_TEST_PROCEDURES.md`.

## Scope of each layer

1. **Calculation tests** (`tests/test_calc.cpp`) compile the *same* `RM_Types.mqh`, `RM_Calc.mqh` and `RM_Planner.mqh` that the EA includes, and check them against hand-computed values.
2. **MQL4 lint** runs `g++ -fsyntax-only` over the whole EA against a *declared* MT4 API subset. It is not MetaEditor.
3. **Simulator scenarios** run the EA source (`OnInit` / `OnTick` / `OnDeinit` / button handlers) against an in-memory broker: instant fills at Bid/Ask, partial closes creating `from #` remainders, history, commission, a margin model, H1 bars, SMA/EMA, chart objects, files, global variables and fault injection. Each scenario runs in a fresh process. The simulator is a test double; it does not model tester timing, swaps, stop-out or real broker behaviour.
4. **Preset checks** load each `.set` (rejecting duplicate or missing keys) into the inputs, run `RM_ValidateInputs`, initialise, and run 300 ticks with one losing order.
5. **Standalone build**: the single-file `.mq4` is regenerated, linted, and all 37 scenarios run against it.

## Acceptance tests for the Three-MA handover

| Requirement | Scenario(s) |
|---|---|
| Below threshold: normal trading works, recovery opens nothing | S23 |
| At threshold: normal entries stop, handover starts once (999 vs 1,000 at 10 % of 10,000) | C20, S24 |
| Price gap beyond threshold: handover on the next executable event | S25 |
| Drawdown improves afterwards: recovery stays active | S24, S28 |
| Normal TP/averaging cannot interfere with recovery orders | S26 |
| Pending orders and partial handover failures reconciled | S27, S27b |
| Restart during recovery restores the latch (incl. lost state file, changed threshold) | S28 |
| Unrelated positions untouched | S29, S34 |
| Partial closures preserve cycle accounting | S30 |
| Normal resumes only after completion, cooldown and a fresh signal | C23, S31 |
| Emergency termination does not restart trading | C23, S32 |
| Displayed figures reconcile with orders and history | S30, S33 |
| Operator controls cannot bypass the latch; early termination shows exposure | S35 |
| THREE_MA_ONLY never trades recovery | S36 |
| RECOVERY_ONLY unchanged | S01–S22 |

## Defects found and fixed by these tests

- *(first delivery)* `RM_BuildBook` read a remainder's volume after a nested `OrderSelect` of the parent. Fixed and covered by S06.
- *(first delivery)* The panel was stale for one tick after a closure. Fixed and covered by S18.
- *(this extension)* Two `#define`s were used before their definition, and some literal+ternary string concatenations were found. Both were caught by the lint and fixed (`RM_Pick`).
- *(this extension)* Controller fields kept stale in-memory values when a re-init found no state file, because MQL4 keeps globals across re-init. They are now reset before loading. Covered by S28.
- *(this extension)* The audit briefly logged `RECOVERY_CLOSING -> HANDOVER` at completion. Fixed and covered by S31.
- *(this extension)* The preset generator produced duplicate keys, one of which silently changed the conservative threshold. Fixed, and the preset check now rejects duplicate or missing keys.

## Output

```
== 1. calculation tests
Result: 216 passed, 0 failed
== 2. MQL4 lint (g++ -fsyntax-only)
mql_lint: OK
== 3. simulator scenarios
S01 no eligible orders: EA stays idle                                          ok (6 checks)
S02 one losing BUY: lock, grid lots, one-per-bar, group close, lineage         ok (23 checks)
S03 unbalanced mix + unrelated symbol/magic untouched + close all scope        ok (10 checks)
S04 restart mid-lock does not repeat launch actions                            ok (11 checks)
S05 closure failure after 1 leg + disconnect + restart: profit counted once    ok (14 checks)
S06 external partial close + external lock close: lineage and re-lock          ok (11 checks)
S07 pause blocks automation; resume without catch-up burst                     ok (7 checks)
S08 emergency close-all overrides pause                                        ok (5 checks)
S09 multidirectional off never holds two recovery baskets                      ok (3 checks)
S10 money-drawdown launch triggers exactly once                                ok (5 checks)
S11 insufficient margin blocks the lock with a visible reason                  ok (6 checks)
S12 uncertain broker reply does not duplicate an order                         ok (3 checks)
S13 manual panel: validation, confirmation, roles                              ok (14 checks)
S14 dashboard totals reconcile with broker orders                              ok (7 checks)
S15 one-order-per-bar survives restart                                         ok (6 checks)
S16 reduce volume executes only a net-non-negative plan                        ok (6 checks)
S17 close-profitable-at-launch finances a loser reduction, then locks          ok (7 checks)
S18 overlap closes first+last recovery orders and keeps the middle ones        ok (9 checks)
S19 whole-basket TP closes every role and ends the session                     ok (7 checks)
S20 unresolved partial-close lineage -> ERROR_HOLD -> operator resume          ok (6 checks)
S21 short chart: confirmation box and panels stay on screen                    ok (10 checks)
S22 tester MODE_TRADEALLOWED=0 does not block; disabled symbol explains why    ok (5 checks)
S23 combined: below threshold normal trades, recovery never trades             ok (12 checks)
S24 combined: 999 no / 1,000 yes, handover once, latch holds on improvement    ok (16 checks)
S25 combined: price gap beyond threshold hands over on that event              ok (6 checks)
S26 combined: normal TP/averaging cannot touch the transferred basket          ok (8 checks)
S27 combined: pending cancel failures reconciled, steps not repeated           ok (12 checks)
S27b combined: persistent handover failure -> ERROR_HOLD -> retry              ok (7 checks)
S28 combined: restart / lost state / threshold change keep the latch           ok (11 checks)
S29 combined: unrelated positions untouched, hedge covers basket only          ok (8 checks)
S30 combined: partial closures keep cycle accounting exact                     ok (7 checks)
S31 combined: resume only after completion, cooldown and fresh signal          ok (15 checks)
S32 combined: emergency termination never restarts automatically               ok (12 checks)
S33 combined: dashboard figures reconcile with orders                          ok (12 checks)
S34 combined: account-scope DD without basket blocks entries only              ok (7 checks)
S35 combined: Start Recovery confirm, Normal button cannot bypass latch        ok (10 checks)
S36 THREE_MA_ONLY: recovery never trades                                       ok (4 checks)
sim scenarios: 37/37 passed
== 4. presets
Conservative_Demo.set    validate=ok init=ok state=ARMED managed=1 lock=0.00 recovery=0 Armed: drawdown 0.61% / launch at 5.00%
Three_MA_With_Recovery.set validate=ok init=ok state=IDLE managed=0 lock=0.00 recovery=0 No orders to recover
Video_Reference.set      validate=ok init=ok state=RECOVERING managed=5 lock=0.10 recovery=3 Recovering: waiting for grid level / close target
presets: 3/3 valid
== 5. standalone single-file build (rebuilt, linted and simulated)
written MQL4/Experts/RecoveryManagerPro_Standalone.mq4 7256 lines
mql_lint: OK
sim scenarios: 37/37 passed
```

### Calculation test case list

```
Recovery Manager Pro - calculation tests
- T08 lot multiplication uses unrounded base (0.06 x 1.3)
- Grid step spacing and trigger levels
- T07 point-to-money conversion (Forex and non-standard tick size)
- T04 launch thresholds (instant, percent, money, zero-balance guard)
- T09 one-order-per-bar gate survives retry/restart (persisted bar id)
- T10 multidirectional off blocks opposite basket; direction modes
- T11 overlap threshold boundaries and final-slice exclusion
- T02 lock sizing: one BUY, one SELL, balanced, unbalanced mix, residual
- T05 partial volume obeys lot step and never leaves invalid remainder
- T06/T12 totals: hedge P/L, swap, commission counted once per ticket
- T06 planner worked example: +12.00 -5.00 -3.00 -0.50 = +3.50
- Planner: matched slices, residual, booked costs not double counted
- T11 overlap plan closes first+last; final slice closes every recovery order
- Priority: easy-first, hard-first, first-ticket override, stable tie-break
- Unlocked single-leg slice planning
- Reduce Volume (matched): net >= 0, equal BUY/SELL volume, legal remainders
- Reduce/launch financing (unmatched): winners fund partial loser volume
- Whole-basket exit covers every owned role, target compare
- T13 journal: failure after first leg resumes without double-spending profit
- T04/T14/T18 state machine: launch once, restart, pause precedence, closing
- C20 drawdown trigger: 10% of 10,000 -> 999 no, 1,000 yes (managed scope)
- C21 Three-MA crossover on closed candles, filter
- C22 normal lot sizing, virtual basket TP, overlap
- C23 resume rules: cooldown, auto-resume, emergency/manual need operator, fresh signal
- C24 normal basket closure plan lists only the requested legs
- Break-even / possible-close price solve

Result: 216 passed, 0 failed
```

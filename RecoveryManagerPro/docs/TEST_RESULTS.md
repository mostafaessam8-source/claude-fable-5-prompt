# Recorded automated test results

- **Date:** 2026-09-27
- **Environment:** Linux, g++ 13.3.0 (C++17), Python 3.11.
- **Command:** `./tests/run_all.sh`
- **Not run:** MetaEditor compilation, MT4 Strategy Tester and live/demo terminal tests, because no MetaTrader 4 installation was available. See `VISUAL_TEST_PROCEDURES.md`.

## Scope of each layer

1. **Calculation tests** (`tests/test_calc.cpp`) compile the *same* `RM_Types.mqh`, `RM_Calc.mqh` and `RM_Planner.mqh` that the EA includes, and check them against hand-computed values.
2. **MQL4 lint** inlines the EA, rewrites the MQL-only syntax (array reference parameters, dynamic arrays, colour literals, `input`, calls to functions defined later) and runs `g++ -fsyntax-only` against a *declared* MT4 API subset (`tests/mql_lint/mt4_api_stub.h`). It catches undeclared identifiers, typos, wrong argument counts and gross type errors. It is not MetaEditor.
3. **Simulator scenarios** link the rewritten EA with `tests/mql_lint/mt4_sim.h`, an in-memory broker with instant fills at Bid/Ask, partial closes that create `from #` remainder tickets, history, booked commission, a simple margin model, H1 bars, chart objects, files, global variables and fault injection. Each scenario runs in a fresh process. The simulator is a test double. It does not model tester timing, swaps, stop-out or real broker behaviour.
4. **Preset checks** load each `.set` into the EA inputs, run the EA's own `RM_ValidateInputs`, initialise, and run 300 ticks with one losing BUY.

## Defects found and fixed by these tests during development

- `RM_BuildBook` read the remainder ticket's volume *after* a nested `OrderSelect` of the parent's history record. The remainder was booked with the parent's closed volume, and the re-lock over-hedged (BUY 0.04 followed by SELL 0.04). All order fields are now captured before any nested selection. Covered by S06.
- The dashboard and previews showed the pre-trade snapshot for one tick after a closure. The book is now rebuilt when a trade happened during the tick. Covered by S18.

## Output

```
== 1. calculation tests
Result: 169 passed, 0 failed
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
sim scenarios: 20/20 passed
== 4. presets
Conservative_Demo.set    validate=ok init=ok state=ARMED managed=1 lock=0.00 recovery=0 Armed: drawdown 0.61% / launch at 5.00%
Video_Reference.set      validate=ok init=ok state=RECOVERING managed=5 lock=0.10 recovery=3 Recovering: waiting for grid level / close target
presets: 2/2 valid
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
- Break-even / possible-close price solve

Result: 169 passed, 0 failed
```

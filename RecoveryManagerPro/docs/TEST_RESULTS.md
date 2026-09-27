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
5. **Standalone build**: the single-file `.mq4` is regenerated, linted, and all 49 scenarios run against it.

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

## Distance-unit tests (quote precision)

| Required check | Test(s) |
|---|---|
| GBPUSD 5 digits, 100 → 0.00100; 4 digits → 0.0010 | D01, S43 |
| USDJPY 3 digits, 100 → 0.100; 2 digits → 0.10 | D01, S43 |
| XAUUSD 3 digits, 100 → 1.000; 2 digits → 1.00; 250 → 2.50 either way | D01, S37, S43 |
| BUY anchored at 2650.000, 100 standardized → 2649.000 (not 2649.900) | D02, S37 |
| Custom unit 0.25 × 4 → 1.00 | D03 |
| Non-standard tick size: valid executable targets, spacing ≥ requested | D04, S41 |
| Symbol suffixes / aliases resolve to the configured profile | D05, S43 |
| Unknown symbols require explicit units (no silent guessing) | D05, S39 |
| Restart / input change preserves the active basket's convention | S40 |
| Normal and recovery modules produce identical conversions | S38 |
| Existing broker-point profiles keep their previous spacing | S01–S36 unchanged (legacy default), S42 |
| Trigger boundaries just before, at and beyond the level | D02, S37, S38 |

## Defects found and fixed by these tests

- *(first delivery)* `RM_BuildBook` read a remainder's volume after a nested `OrderSelect` of the parent. Fixed and covered by S06.
- *(first delivery)* The panel was stale for one tick after a closure. Fixed and covered by S18.
- *(this extension)* Two `#define`s were used before their definition, and some literal+ternary string concatenations were found. Both were caught by the lint and fixed (`RM_Pick`).
- *(this extension)* Controller fields kept stale in-memory values when a re-init found no state file, because MQL4 keeps globals across re-init. They are now reset before loading. Covered by S28.
- *(this extension)* The audit briefly logged `RECOVERY_CLOSING -> HANDOVER` at completion. Fixed and covered by S31.
- *(distance fix)* A test expectation assumed 1.2 is not a multiple of 0.05. The EA was right, and the test now uses 1.23 → 1.25.
- *(distance fix)* The lint caught the unit structs and `g_dist` being used before their declaration. They were moved to `RM_Globals.mqh`.
- *(this extension)* The preset generator produced duplicate keys, one of which silently changed the conservative threshold. Fixed, and the preset check now rejects duplicate or missing keys.

## Default-behaviour scenarios (25-setting restructure)

These scenarios run the untouched built-in defaults on 3-digit XAUUSD, with a 0.09 spread and a 1,000 balance. The price paths are **synthetic**, so the results only show that the logic behaves as designed. They are not a forecast of live results.

| Scenario | Path | Before | Now |
|---|---|---|---|
| S44 | long decline, rally, decline | previous defaults: averaging BUYs into the decline, emergency close-all, trading halted | handover → recovery cycle completed (+2.19), no emergency, trading continues |
| S45 | 1,500 choppy candles (±33 swings) | same-candle filter only: no entries (every crossover rejected) | 23 normal entries, 2 recovery cycles both completed; balance 1,201.60 |
| S46 | rally, sell-off, rebound | same-candle filter only: no entries | 1 entry closed at TP, balance 1,003.11 |
| S47 / S48 | 10,000 balance, long gold rally with swings | no basket stop: 50 % emergency, balance 4,950.78 | basket stop cut the losing grid, no emergency, balance 8,082.60 (equity 6,310.00, cycle open) |


## Output

```
== 1. calculation tests
Result: 306 passed, 0 failed
== 2. MQL4 lint (g++ -fsyntax-only)
mql_lint: OK
== 3. simulator scenarios
    choppy: entries 23, handovers 2, emergencies 0, equity 1201.60, balance 1201.60
    reversal: entries 1, handovers 0, cycles 0, emergencies 0, pauses 0, equity 1003.11, balance 1003.11
    rally (old): handovers 2, cycles 1, pauses 3, emergencies 1, entries 33, equity 4012.68, balance 4950.78, open lots 0.34
    rally (new): handovers 2, cycles 1, pauses 2, emergencies 0, entries 54, equity 6310.00, balance 8082.60, open lots 0.78
sim scenarios: 49/49 passed
== 4. presets
Conservative_Demo.set    validate=ok init=ok state=ARMED managed=1 lock=0.00 recovery=0 Armed: drawdown 0.61% / launch at 5.00%
Three_MA_With_Recovery.set validate=ok init=ok state=IDLE managed=0 lock=0.00 recovery=0 No orders to recover
Video_Reference.set      validate=ok init=ok state=RECOVERING managed=5 lock=0.10 recovery=3 Recovering: waiting for grid level / close target
presets: 3/3 valid
== 4b. built-in defaults
defaults == Three_MA_With_Recovery.set: OK
== 5. standalone single-file build (rebuilt, linted and simulated)
written MQL4/Experts/RecoveryManagerPro_Standalone.mq4 8746 lines
mql_lint: OK
sim scenarios: 49/49 passed
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
- D01 standardized points: required conversions on 4/5-digit FX, 2/3-digit JPY and gold
- D02 gold BUY grid anchored at 2650.000, 100 standardized points -> 2649.000
- D03 custom unit, price distance, broker points, per-symbol override
- D04 executable tick size: requested 0.12 with tick 0.05 -> effective 0.15
- D05 symbol resolution: metadata, suffixes, explicit map, overrides, unknown
- D06 migration keeps the original price distance; max limits never loosen
- Break-even / possible-close price solve

Result: 306 passed, 0 failed
```

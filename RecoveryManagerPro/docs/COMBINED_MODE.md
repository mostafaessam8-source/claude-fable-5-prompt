# Three-MA normal trading with drawdown handover

This document describes the extension that adds a normal trading module and an automatic handover to the existing recovery engine. With `InpOperatingMode = RECOVERY_ONLY` (the default) the EA behaves exactly as before, and none of this applies.

## Reference and evidence

The reference is the public product page of *AW Three MA* (mql5.com product 63484). The page could not be opened from the build environment (egress to mql5.com is blocked), so the only source is the description in the task:

- a fast/slow moving-average crossover;
- an optional third MA that filters direction;
- configurable MA parameters;
- lot sizing, averaging and a virtual basket TP;
- optional first/last-order overlap.

Everything else below is this project's own **documented choice**. It is not a claim about the commercial product's undocumented logic, and the MA defaults are **project defaults**, not that product's defaults.

## Operating modes

| `InpOperatingMode` | Normal Three-MA trading | Recovery engine |
|---|---|---|
| `RECOVERY_ONLY` (0) | off | original behaviour (launch by `InpLaunchMode`) |
| `THREE_MA_ONLY` (1) | on | never trades (the permission gate refuses it) |
| `THREE_MA_WITH_RECOVERY` (2) | on until the handover | monitors; trades only after the drawdown handover |

## Operating cycle and states

```
NORMAL ──(drawdown >= threshold, or "Start Recovery")──► HANDOVER ──► RECOVERY_ACTIVE ⇄ PAUSED
   ▲                                                         │              │
   │                                                         └── ERROR_HOLD ◄┘   (operator retry)
   │                                                                        │
   └── COOLDOWN ◄── (verified completion) ◄── RECOVERY_CLOSING ◄────────────┘
```

| State | Normal strategy | Recovery engine |
|---|---|---|
| NORMAL | opens and manages its own basket | monitors only (gate refuses trades) |
| HANDOVER | blocked | launch steps run; latch set |
| RECOVERY_ACTIVE | blocked | exclusive manager of the transferred basket |
| RECOVERY_CLOSING | blocked | closing the whole cycle basket |
| PAUSED | blocked | engine paused (Pause/Resume Recovery) |
| COOLDOWN | blocked | idle; resume rules evaluated |
| ERROR_HOLD | blocked | nothing trades until the operator retries/resumes |

**Latch.** Recovery is latched as soon as the trigger fires. The latch (`LATCH=1` in the state file) is written **before** any further trading action. Only a verified, reconciled completion clears it. A later drawdown improvement, a restart, or a change of `InpLaunchDrawdown` does **not** clear it.

## Drawdown trigger

There is a single threshold, **`InpLaunchDrawdown`** (the existing recovery-launch input). Its unit is `InpRecoveryTriggerMode` (`PERCENT` / `MONEY`), and `InpLaunchMode` (including *Instant start*) is **ignored** in combined mode. Having one threshold avoids two thresholds competing over the same transition.

| `InpRecoveryTriggerScope` | DrawdownMoney | DrawdownPercent |
|---|---|---|
| `MANAGED` (default) | `max(0, −Σ(OrderProfit + OrderSwap + OrderCommission))` over normal-strategy market orders | `100 × money / AccountBalance()` |
| `ACCOUNT` | `max(0, AccountBalance() − AccountEquity())` | `100 × money / AccountBalance()` |

- These are **balance-relative floating drawdowns**, not historical peak-to-trough drawdown.
- A zero or negative balance never triggers percentage mode.
- The trigger fires when the metric ≥ the threshold. Example (a test input, not a recommendation): with a balance of 10,000 and 10 %, a managed floating loss of 999 does not trigger and 1,000 does. Scenario S24 checks this.
- The trigger is evaluated on every tick with fresh prices (`RefreshRates`), and again immediately before every normal entry and averaging order. A price gap therefore hands over on the next executable event (S25). The timer only repaints the dashboard.
- **Account scope with no eligible basket:** new normal entries are blocked and the reason is shown. No recovery trades are created, and unrelated positions are never managed (S34).

## Handover steps

| # | Step | Implementation |
|---|---|---|
| 1 | Persist latch and new cycle ID | `RM_StartHandover` writes the state file first |
| 2 | Disable normal entries | the gate refuses `NORMAL` actions while latched |
| 3 | Snapshot eligible tickets and roles | normal-magic market orders on the chart symbol (plus the section-1 scope only if `InpCombinedAdoptOthers`) |
| 4 | Cancel managed normal pending orders, reconcile | deletes as `HANDOVER`, then re-counts; stays in HANDOVER while any remain, and enters ERROR_HOLD after 10 attempts |
| 5 | Disable normal TP/overlap/other exits for transferred orders | transferred tickets leave the normal book, and the gate refuses NORMAL closes of registered tickets |
| 6 | SL/TP policy | the recovery engine's own `InpDeleteSLTP` at launch |
| 7 | Register as ORIGINAL without changing magic | `RM_RegAdd(..., RM_ROLE_ORIGINAL, ...)`; no close/reopen |
| 8 | Start the existing hedge/recovery sequence | the engine launches when latch, snapshot and pendings are all done |
| 9 | Record reason, value, threshold, tickets, account snapshot | `HANDOVER` audit line (CSV) |

Every completed step is persisted and never repeated (S27). A normal closure that was already running when the trigger fired is finished first, because unfinished operations are reconciled before the snapshot.

`InpCloseProfitable` (financing loser reductions at launch) is still applied by the recovery engine if enabled. The example preset turns it off, so the trigger itself never liquidates anything.

## One manager per basket: the permission gate

Every `OrderSend`, `OrderClose`, `OrderModify` and `OrderDelete` goes through `RM_Permit()` in `RM_Broker.mqh`. Entry points set the actor, so OnTick, button events and the tester polling all use the same gate:

| Actor | Allowed |
|---|---|
| `RECOVERY` (engine) | RECOVERY_ONLY: everything. Combined: only while latched, and never opens normal-magic orders. THREE_MA_ONLY: nothing. |
| `NORMAL` (Three-MA) | Only its own magic, only in NORMAL without a latch, and never tickets in the recovery registry. Opens also need *Normal ON* and no halt. The one exception: finishing an already-started normal closure before the handover snapshot. |
| `OPERATOR` (buttons) | Manual actions, but can never open a normal-magic order while latched. |
| `EMERGENCY` | Closes only. |
| `HANDOVER` | Deletes normal-magic pending orders during HANDOVER only. |
| `TEST` | Strategy Tester only. |

Terminal-wide AutoTrading is never touched.

## Order identification

| Role | Identity |
|---|---|
| Normal | magic `InpNormalMagic`, not in the registry |
| Original (transferred) | registry entry created by the handover; magic unchanged |
| Hedge | magic `InpLockMagic` |
| Recovery | magic `InpRecoveryMagic` |

Comments are informational only. Manual trades, other EAs and other symbols are excluded unless `InpCombinedAdoptOthers` widens the handover to the section-1 scope.

## Completion, accounting and resumption

A cycle completes only when all of the following hold:

- the recovery engine reports its basket empty (or never launched because the basket vanished);
- no registered tickets remain;
- no normal, lock or recovery-magic market orders remain on the symbol;
- no normal-magic pending orders remain;
- no unfinished closure is open.

The result is then recorded (`CYCLE_END`):

- **The cycle's realised net P/L** is the sum of every closure in the cycle, including costs. It covers the full P/L of the transferred orders, including the loss that existed before the trigger. It is kept separate from floating P/L and from normal-strategy results (`g_normalRealized`). Nothing is labelled profitable just because the last positions closed positively.
- **The outcome** is COMPLETED, EMERGENCY_CLOSE or MANUAL_TERMINATION.

After completion the controller enters COOLDOWN:

- It resumes after **`InpResumeCooldownBars`** candles of the signal timeframe, provided **`InpAutoResumeAfterRecovery`** is on. Otherwise it waits for **Resume Normal**.
- An emergency close or a manual early termination **never** resumes automatically. The operator must reset, and the cooldown still applies.
- Before resuming, the trigger is checked again. The averaging bar state is reset, and the lot progression restarts from the initial lot.
- With **`InpRequireFreshSignalAfterRecovery`**, a crossover counts only if its candle opened after the cycle ended. Signals are evaluated and consumed in every state, so a crossover formed during recovery is never reused (S31).

## Restart

The state file stores the latch, cycle state, cycle ID and times, handover step flags, trigger value, outcome, normal switches, the last processed signal candle, the averaging bars, realised totals, the open journal and its actor. On start, broker orders are reconciled before either engine acts:

- If the registry, recovery/lock-magic orders or a recovery journal exist, the latch is restored, even if the state file was lost (`RESTART_LATCH`). Normal trading stays disabled whatever the current drawdown (S28).

## Action priority (every tick)

1. **Emergency protection.** The emergency-loss limit (`InpEmergencyMode/Value/Action`) is a separate control from the recovery-launch threshold, and validation requires it to be larger when the units match. It applies to the normal basket in NORMAL, and the engine applies it to the transferred basket.
2. **Reconcile unfinished trade operations** (the open journal, under its own actor).
3. **Active handover / recovery.**
4. **Drawdown-trigger evaluation.**
5. **Normal basket management** (virtual TP, overlap).
6. **Normal averaging and new entries.**

Existing margin, exposure and spread protections still apply to both modules.

## Three-MA module rules (documented choices)

| Topic | Rule |
|---|---|
| Signal | Closed candles of `InpSignalTF`. BUY: `Fast[2] ≤ Slow[2]` and `Fast[1] > Slow[1]`. SELL: `Fast[2] ≥ Slow[2]` and `Fast[1] < Slow[1]`. |
| Filter | With the filter on, BUY needs Fast[1] and Slow[1] above Filter[1], SELL needs both below; otherwise the signal is rejected. |
| Evaluation | Once per newly closed candle. The candle time is persisted (`LASTSIGBAR`), so there are no duplicates after a restart. A signal that is blocked at that moment (spread, margin, disabled) is not retried. |
| Entry | The initial order of a direction opens only if that direction has no normal basket. With `InpNormalOneBasket`, it also needs no normal basket at all. Opposite signals never close baskets. |
| Lots | FIXED: `InpNormalLot`. BALANCE: `InpNormalLot × Balance / InpNormalLotPerBalance`. The result is floored to the lot step and refused below the broker minimum. |
| Averaging (separate from recovery) | Triggers on an adverse move ≥ `InpNormalAvgStepPoints` from the **last** fill of the direction. Lot = initial × `InpNormalAvgMultiplier^n`, computed from the unrounded base. At most one per signal candle and direction, capped by `InpNormalMaxPerDir` and `InpNormalMaxLots`. |
| Virtual basket TP | Closes a direction's basket when price is `InpNormalTPPoints` beyond its volume-weighted average open price. No broker TP is set. |
| Overlap | With ≥ `InpNormalOverlapMinOrders` orders, the first and last close together when their combined net ≥ `InpNormalOverlapTPPoints × money per point per lot × their lots`. Intermediate orders stay. |
| Limits | `InpNormalMaxSpread`, `InpNormalSlippage`, margin/free-margin checks, and the drawdown re-check before every entry. |

## Dashboard: panel D "Cycle Controller" (upper right, Three-MA modes)

The panel shows:

- operating mode and cycle state (the chip);
- Normal ACTIVE/BLOCKED and Recovery MONITORING/ACTIVE/PAUSED/CLOSING/DISABLED;
- drawdown in currency and %, with its scope;
- threshold and remaining distance (or the latched value), with a trigger-progress bar;
- fast/slow/filter MA settings, the current signal and MA values;
- count, BUY lots, SELL lots and floating P/L for each role (Normal / Original / Hedge / Recovery);
- cycle start time and elapsed or last duration;
- cycle realised versus floating;
- auto-resume and cooldown status;
- the last handover/block reason and the last refused action or error.

Buttons:

| Button | Effect |
|---|---|
| **Normal ON/OFF** | Toggles normal entries. It shows *Reset Normal* after a halt and *Resume Normal* during COOLDOWN, and cannot bypass the latch. |
| **Start Recovery** | Operator handover of the normal basket, with confirmation. In RECOVERY_ONLY it launches an armed engine. |
| **Pause/Resume Recovery** | Pauses or resumes the engine; in ERROR_HOLD it retries the handover. |
| **Close Basket** | When latched, early termination: the preview shows the remaining orders, BUY/SELL lots, floating and realised-so-far, and requires confirmation. Otherwise it closes the normal basket. |

# Changes

## Built-in defaults = Three_MA_With_Recovery.set

The 22 input defaults that differed now equal the example preset. That includes `InpOperatingMode = THREE_MA_WITH_RECOVERY`, `InpConfigVersion = 2`, a 10 % handover threshold, the 25 % emergency close, normal averaging on, and the lot and exposure caps. A fresh attach therefore trades the Three-MA strategy with standardized distance units.

- Old `.set` files without `InpConfigVersion` are now read as version 2. Add `InpConfigVersion=0` to keep their previous broker-point spacing (see `docs/DISTANCE_UNITS.md`).
- `tests/check_defaults.py` fails the build if the defaults and the preset ever differ.
- The earlier simulator scenarios restore their original defaults. New scenario S44 runs the untouched defaults on 3-digit gold with a 1,000 balance: entry → averaging → handover → emergency close → halted.

## Distance units across symbols and quote precision

**Defect.** Distance inputs were converted as `input × chart Point`, so the same input meant ten times less price distance on 3-digit XAUUSD or 4-digit Forex. The error also reached point-based money targets, the spread and slippage limits, and order prices, which were not aligned to the tick size.

**Fix.**
- `RM_Distance.mqh` (portable, unit-tested) and `RM_DistanceSvc.mqh` (MT4 service) provide:
  - the modes STANDARDIZED_POINTS / BROKER_POINTS / PRICE_DISTANCE / CUSTOM_UNIT;
  - the profiles FX 0.00001, FXJPY 0.001 and XAUUSD 0.01;
  - resolution from broker metadata plus an explicit alias map, prefix/suffix and per-symbol overrides;
  - tick alignment, with spacing rounded up and targets rounded direction-aware;
  - maximum limits floored;
  - the requested API: `GetDistanceUnitPrice`, `DistanceToPrice`, `PriceToDistanceUnits`, `PriceDistanceToBrokerPoints`, `AlignPriceToTick`.
- Recovery grid, normal averaging, normal virtual TP and overlap, partial-TP and buffer money inputs, spread limits, slippage and order prices now all use the service. Recovery and normal modules call the same functions.
- Undefined units block new entries and new cycles only. Existing baskets keep being managed with their persisted units.
- The unit context of each active basket is stored in the state file and survives input, chart, profile and restart changes. `InpApplyUnitsToActiveCycle` is the explicit override.
- `InpConfigVersion`: legacy configurations (0/1, the default) keep broker points, with a log notice, a dashboard LEGACY chip and a migration preview `.set`. The shipped presets were migrated to v2, with no change in price distance.
- Dashboard panel E "Distance units".
- Tests: 73 new calculation checks (289 total) and 7 new simulator scenarios (44 total). The simulator gained currency metadata, calc mode and `StringToUpper`.

**Not done:** MetaEditor compilation, because no MT4 terminal was available.

## Three-MA normal trading with drawdown handover

The EA was extended; nothing was rebuilt. With the default `InpOperatingMode = RECOVERY_ONLY` the behaviour is unchanged, and all 22 earlier simulator scenarios pass without modification.

**New operating modes:** `RECOVERY_ONLY`, `THREE_MA_ONLY`, `THREE_MA_WITH_RECOVERY`.

**New files**
- `RM_Normal.mqh`: an independent Three-MA module. It trades closed-candle crossovers with an optional filter MA, and has fixed or balance-based lots, its own averaging (separate from recovery averaging), a virtual basket TP, first/last overlap, and spread and slippage limits. The last processed signal candle is persisted.
- `RM_Controller.mqh`: the single cycle controller. It handles:
  - the persisted recovery latch;
  - the states NORMAL, HANDOVER, RECOVERY_ACTIVE, RECOVERY_CLOSING, COOLDOWN, PAUSED and ERROR_HOLD;
  - the balance-relative floating drawdown trigger (managed or account scope), which reuses `InpLaunchDrawdown`;
  - the step-wise handover, verified completion, and cycle accounting and outcome;
  - cooldown and fresh-signal resumption;
  - restart reconciliation;
  - operator commands.
- `RM_DashCycle.mqh`: dashboard panel D with the trigger-progress bar, role breakdown, cycle figures and the Normal / Start Recovery / Pause-Resume / Close Basket buttons.
- `MQL4/Presets/Three_MA_With_Recovery.set`: an example preset.
- `docs/COMBINED_MODE.md`: the operating cycle, formulas, handover steps, gate table and documented strategy rules.

**Changed files**
- `RM_Broker.mqh`: central permission gate `RM_Permit()` for every send, close, modify and delete, keyed by actor; slippage per actor.
- `RM_Executor.mqh`: journals remember and reuse their actor; normal-strategy P/L is kept separate from recovery-cycle accounting.
- `RM_Engine.mqh`:
  - the engine runs as the RECOVERY actor;
  - in the Three-MA modes it launches only through the controller latch, so immediate start is ignored;
  - it marks emergency outcomes and signals cycle completion;
  - manual orders outside a cycle join the normal basket;
  - `Start Recovery` launches an armed engine in RECOVERY_ONLY;
  - controller fields reset on re-initialisation.
- `RM_Registry.mqh`: in the Three-MA modes, scope and adoption are limited to the normal magic, unless `InpCombinedAdoptOthers` is set.
- `RM_Persist.mqh`: persists the latch, cycle, handover steps, signal state, switches and journal actor.
- `RM_Dashboard.mqh`, `RM_Annotations.mqh`: fourth panel, button routing, confirmation placement, and the NORMAL role label on the manual panel.
- `RM_Config.mqh`: validation of the new inputs, including periods fast < slow < filter, magic uniqueness, and an emergency limit larger than the launch threshold.
- `RM_Types.mqh`, `RM_Calc.mqh`, `RM_Planner.mqh`: new enums and pure, unit-tested helpers (trigger metrics, MA signal, lots, basket TP, overlap, resume rules, listed-leg closure plan).
- Tests: 47 new calculation checks (216 in total) and 15 new simulator scenarios (37 in total). The simulator gained `iMA`, `iBarShift`, trade-mode and delete-failure injection. The preset check now rejects duplicate or missing keys.

**Not done:** MetaEditor compilation, because no MT4 terminal was available. The mql5.com product page could not be reached from the build environment.

## Earlier fixes

- The standalone single-file build (`RecoveryManagerPro_Standalone.mq4`), `CHART_EXPERT_NAME` removal, initialisation of local arrays, on-screen confirmation box, and the tester `MODE_TRADEALLOWED` quirk.

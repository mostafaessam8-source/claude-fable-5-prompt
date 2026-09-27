# Distance units: symbol and quote-precision normalisation

## The defect

Every user-facing distance was converted with the **chart's broker `Point`**:

```
priceDistance = input × Point
```

`Point` is the quote precision, not a stable distance unit. When a broker quotes XAUUSD with three decimals instead of two, `Point` drops from 0.01 to 0.001, and the same input silently becomes **ten times closer**:

| Symbol / quote | `Point` | Grid input 100 → old price distance | Intended |
|---|---|---|---|
| XAUUSD, 2 digits | 0.01 | 1.00 | 1.00 |
| XAUUSD, 3 digits | 0.001 | **0.100** | 1.00 |
| GBPUSD, 5 digits | 0.00001 | 0.00100 | 0.00100 |
| GBPUSD, 4 digits | 0.0001 | **0.0100** | 0.00100 |

For example, a BUY grid anchored at 2650.000 targeted 2649.900 instead of 2649.000. The same error affected:

- point-based money targets, whose money per point was computed per *broker* point;
- the spread and slippage limits;
- order prices, which were only rounded to `Digits`, never to the executable tick size.

## Distance modes

`InpDistanceUnitMode` takes effect from **`InpConfigVersion = 2`**:

| Mode | One unit = | Use for |
|---|---|---|
| `STANDARDIZED_POINTS` (0, default for new configs) | the profile's unit price (below) | Forex, JPY Forex, USD gold |
| `BROKER_POINTS` (1) | the order symbol's broker `Point` | legacy settings, or an explicit choice |
| `PRICE_DISTANCE` (2) | 1.0 price | any symbol |
| `CUSTOM_UNIT` (3) | `InpCustomUnitPrice` | silver, indices, energy, crypto, … |

**Standardized points** are this project's own configuration convention. They are not a universal pip definition and not a claim of equal money risk.

| Profile | Unit price | Example: 100 units |
|---|---|---|
| `FX` (non-JPY Forex) | 0.00001 | GBPUSD 0.00100 on 4- and 5-digit quotes |
| `FXJPY` (JPY-quoted) | 0.001 | USDJPY 0.100 on 2- and 3-digit quotes |
| `XAUUSD` (USD gold) | 0.01 | XAUUSD 1.00 on 2- and 3-digit quotes (= 1000 broker points on 3 digits) |

## Resolving the instrument (no guessing)

The profile is resolved in this order:

1. **`InpUnitOverrides`**: per-symbol unit prices such as `XAGUSD:0.001;US30.cash:1`. The full broker name is matched exactly, and so is the name with the configured prefix/suffix removed. Overrides apply in STANDARDIZED and CUSTOM modes.
2. **`InpSymbolProfileMap`**: explicit aliases such as `GOLD:XAUUSD;GOLD.x:XAUUSD`, matched exactly against the full name, then against the name without `InpSymbolPrefix` / `InpSymbolSuffix`.
3. **Broker metadata**:
   - `SYMBOL_CURRENCY_BASE` XAU with `SYMBOL_CURRENCY_PROFIT` USD gives `XAUUSD`, for example `XAUUSD`, `XAUUSD.a`, `XAUUSDm`.
   - `MODE_PROFITCALCMODE = Forex` with two ISO-like non-metal currencies gives `FX`, or `FXJPY` when the profit currency is JPY.

Neither `Digits` nor a loose substring is ever used. `GOLDEN` does not match a `GOLD` alias.

If standardized points cannot be resolved, **new entries are blocked** with the message: *"Distance unit is undefined for this symbol. Select a symbol profile or custom unit."* Baskets that already exist keep being managed with their stored units, and closures and locks are not blocked.

## Central conversion service

The pure core is `RM_Distance.mqh` (compiled natively for the tests). The MT4 side is `RM_DistanceSvc.mqh`.

| Function | Meaning |
|---|---|
| `GetDistanceUnitPrice(symbol, mode)` | price value of one unit for that symbol (0 if undefined) |
| `DistanceToPrice(symbol, input)` | `input × unit price` (unrounded) |
| `PriceToDistanceUnits(symbol, priceDiff)` | the inverse |
| `PriceDistanceToBrokerPoints(symbol, priceDiff)` | `priceDiff / Point` of **that** symbol |
| `AlignPriceToTick(symbol, price, direction)` | alignment to `MODE_TICKSIZE`, which is in **price** units |
| `RM_EffectiveSpacing(requested, tick)` | requested spacing rounded **up** to whole ticks |
| `RM_GridTargetPrice(dir, fill, spacing, tick)` | BUY target rounded down, SELL target rounded up, so spacing is never smaller than requested |
| `RM_MaxLimitBrokerPoints(limitPrice, Point)` | maximum limits floored, so they are never looser |

Symbol properties are read with `MarketInfo(symbol, …)` and `SymbolInfoString(symbol, …)` for the symbol being processed. The metadata is validated: Point > 0, tick > 0, and tick a whole multiple of Point. No new order is sent with invalid values.

Variable names keep the representations apart:

- `…Units`: what the user entered;
- `…Price`: a price difference;
- `…BrokerPts`: in broker points;
- money: account currency.

## Every replaced calculation

| Where | Before | After |
|---|---|---|
| Recovery grid (`RM_TryAverage`) | `RM_GridNextLevel(dir, anchor, stepPts × mult^(n-1), Point)` | `RM_RecStepRequestedPrice(n)` (multiplier on the unrounded base, in price) → `RM_EffectiveSpacing` → `RM_GridTargetPrice`, then Ask ≤ level (BUY) / Bid ≥ level (SELL) |
| Normal averaging | `Ask <= last − step × Point` | `RM_NormalAvgLevel` using the same service functions as the recovery grid |
| Normal virtual basket TP | `RM_BasketTPReached(…, tpPts, Point, …)` | `RM_TPTargetPrice` (BUY rounded up, SELL down) + `RM_TPTargetReached` |
| Normal overlap target | `tpPts × money/point/lot` | distance → price → `price / Point` → the existing money model |
| Recovery partial-close TP | `InpPartialTPPoints` straight into the planner | distance → price → broker points → the unchanged validated planner (same lot basis and commission model) |
| Execution buffer | same | same conversion |
| Spread limits (recovery and normal) | spread in broker points vs input | `(Ask − Bid) > input × unit price` in price |
| Slippage (`OrderSend`/`OrderClose`) | input passed as broker points | `floor(input × unit price / Point)`, never looser |
| Order prices | `NormalizeDouble(p, Digits)` | nearest executable tick, then `Digits` |
| Dashboard levels | from the old grid levels | the new tick-aligned targets |

Not present in this EA, so there was nothing to change: trailing stops, breakeven, distance-based broker SL/TP, and pending-order offsets.

Deliberately unchanged:

- the freeze level (`MODE_FREEZELEVEL` is defined by the broker in broker points);
- drawdown percentages, money TP and loss limits, lot multipliers, partial-close lots, and account-currency targets.

## Grid execution (unchanged strategy)

- **BUY:** Ask ≤ (last confirmed BUY fill − effective spacing), rounded down to a tick.
- **SELL:** Bid ≥ (last confirmed SELL fill + effective spacing), rounded up.

The fill and the comparison use the same side of the quote. Duplicate-entry protection, the one-order-per-bar gate, `InpMaxEntriesPerEvent`, and the margin and spread checks all still apply, so a gap produces at most one order per bar.

## Active baskets keep their units

When a recovery cycle launches, and when a normal basket opens, the unit price and the resulting price distances are stored and persisted (`CTXR` / `CTXN` in the state file). Stored values include the grid base step, step multiplier, partial-TP and buffer prices, and the normal step, TP and overlap. The basket keeps them until it is empty, even if inputs, the chart or the profile change, or the terminal restarts. The new settings apply to the next cycle.

`InpApplyUnitsToActiveCycle = true` is the explicit operator request to re-apply the current units to an active basket. It is logged.

## Settings migration

- **`InpConfigVersion` is 2 by default** (the built-in defaults equal `Three_MA_With_Recovery.set`), so distance inputs use `InpDistanceUnitMode` (standardized points by default).
- **Old `.set` files** written before this change contain no `InpConfigVersion` key, so MT4 loads them with the default 2, and their distances are then read as standardized points. That is identical for 5-digit Forex and 3-digit JPY, where one standardized point equals one broker point. It is **10× larger** for 4-digit Forex and for 2- or 3-digit gold. To keep an old file's exact previous spacing, add `InpConfigVersion=0` to it: it is then treated as **legacy** (broker points, *LEGACY* chip, log notice). Scenario S42 covers this.
- For a legacy configuration a **preview** is written at start, to the log and to `MQL4/Files/RecoveryManagerPro/<symbol>_units_v2_preview.set`. It lists each distance input converted with `NewInput = OldInput × OldPoint / NewUnitPrice`, which keeps every original price distance. Integer maximum limits (spread, slippage) are floored. Nothing is applied automatically: review the file, then load it over your settings.
- The shipped presets are version 2. They were written for 5-digit Forex, so no price distance changed.

## Dashboard: panel E "Distance units"

It shows:

- the symbol and its resolved profile, with where it came from (override, map or metadata);
- Digits, broker Point and tick size (price);
- the mode and the price of one unit;
- the grid input with its requested and effective spacing, and the equivalent broker points;
- the normal averaging and TP spacing;
- the next BUY/SELL levels;
- status: OK, UNDEFINED (with the message) or LEGACY (with the migration preview).

It is labelled *price-distance normalisation only – not equal risk*.

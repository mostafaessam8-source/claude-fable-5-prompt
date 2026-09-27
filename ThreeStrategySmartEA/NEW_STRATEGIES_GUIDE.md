# New Video Strategies (N1 / N2 / N3) — Integration Guide

> **Risk warning:** backtest results do not guarantee future profits. Test on a demo account first.

The three strategies from the attached videos were added to the existing **Three Strategy Smart Trading EA** as independent modules.
The EA's original features are unchanged: strategies S1–S3, the trade panel, the performance panel, risk management, the smart trailing stop, alerts and existing inputs.
The only exception is `MagicManual`: it now has its own strategy code internally, so manual trades are no longer confused with a strategy index.

> **Compilation status:** this environment has no MetaEditor (the MetaQuotes/Wine download sources are blocked by the network policy), so the file could **not** be compiled here.
> It was checked statically: balanced brackets, every called function defined, no duplicate functions or inputs, all preset keys valid, pure ASCII with CRLF line endings.
> Please compile with **F7** and send any error or warning line — it will be fixed immediately.

## How each video was converted into code

| | Video (what the trader does) | Code |
|---|---|---|
| **N1 Fibonacci 50%** (`df59aa3c…mp4`) | Draws Fibonacci on a strong impulse from its start (1) to its end (0). Waits for price to retrace to **0.5**, ideally under the supply base that launched the move. Does **not** sell on the touch; waits for a bearish rejection candle at 0.5, then sells with the SL above that candle and the TP near the 0 level (≈1:2). | `FindImpulse()` → fib level + reaction zone (`N1_ZoneWidthPips`) → wait for the touch → confirmation (`N1_ConfirmType`: candle / micro structure break / both) → entry. `N1_SL_CONFIRM_CANDLE` reproduces the video SL; `N1_TP_IMPULSE_END` reproduces the video TP. `N1_RequireOriginZone` enforces the "0.5 under the supply base" confluence. |
| **N2 Liquidity sweep** (`9892f1cd…mp4`) | Most traders buy at the equal lows / previous low where the "$$$$" sits and get stopped. The real move starts **after** price runs below that low and comes back. Entry after the sweep, SL beyond the sweep extreme. | Liquidity pools (equal highs/lows, previous swing or range extreme, previous day, sessions) → sweep → classification: **real breakout** (`N2_RealBreakoutCloses` closes beyond → cancelled), **liquidity sweep** (wick only), **false breakout** (closed beyond, then back inside), **valid structure break** (MSS) → trigger (`N2_TriggerMode`) → market or retest entry + optional confirmation candle. |
| **N3 Volume profile** (`93b7e6bd…mp4`) | Fixed-range volume profile drawn from the start to the end of the trend. When price returns to the **POC** (red line) — best when a demand zone is there too — buy. SL under the demand zone, take **part of the profit at VAH** (upper white line), then let the rest run. | MQL4 has no native volume profile, so the EA builds a **tick-volume profile**: each candle's tick volume is spread over the price bins it covers → POC (largest bin), value area expanded from the POC to `N3_ValueAreaPct`, HVN/LVN = local peaks/troughs of the histogram. Entry mode: touch / rejection / reclaim / retest, plus confirmation. Default is `N3_TP_VA_EDGE` + `N3_UsePartial`: partial at VAH (VAL for sells), with the rest running to `N3_FinalRR`. |

Rules that the videos leave visually ambiguous are **inputs**, not hard-coded. Examples: the fib level, zone width, confirmation type, origin-zone confluence, sweep trigger type, the number of candles that confirm a sweep, VP range source, bins, value-area %, entry mode and direction bias.

## Modified / new files

| File | Change |
|---|---|
| `ThreeStrategySmartTradingEA.mq4` | **Modified.** New enums, inputs, the N1/N2/N3 module, news filter, debug mode, per-strategy statistics, new panel buttons, generic partial-close plans, and Hide/Show objects |
| `Presets/Backtest_N1_Fib50_H1.set` | **New.** N1 only |
| `Presets/Backtest_N2_LiquiditySweep_M15.set` | **New.** N2 only |
| `Presets/Backtest_N3_VolumeProfile_H1.set` | **New.** N3 only |
| `Presets/Backtest_AllNewStrategies_H1.set` | **New.** `ALL_STRATEGIES` mode |
| `Presets/Backtest_S1/S2/S3/AllStrategies*.set` | **Modified.** Added `NewStrategyMode=0` so the old presets keep testing only the original strategies |
| `NEW_STRATEGIES_GUIDE.md` | **New.** This file |

## Code structure (requested function names)

```
bool   CheckStrategy1Signal();   bool   ExecuteStrategy1Trade();
bool   CheckStrategy2Signal();   bool   ExecuteStrategy2Trade();
bool   CheckStrategy3Signal();   bool   ExecuteStrategy3Trade();
double CalculateStrategy1StopLoss();  double CalculateStrategy1TakeProfit();
double CalculateStrategy2StopLoss();  double CalculateStrategy2TakeProfit();
double CalculateStrategy3StopLoss();  double CalculateStrategy3TakeProfit();
```
Each `Check…` runs once per **new closed candle** of that strategy's timeframe (the existing per-strategy new-bar detection in `RunStrategies`).
Each `Execute…` sends the trade through the EA's shared `ExecuteSignal()`, so every protection applies automatically.

Per strategy you get:

| Item | N1 | N2 | N3 |
|---|---|---|---|
| Magic number | `MagicNew1` = 710011 | `MagicNew2` = 710012 | `MagicNew3` = 710013 |
| Order comment | `TSSE N1 BUY/SELL` | `TSSE N2 BUY/SELL` | `TSSE N3 BUY/SELL` |
| Object prefix | `TSSE_STR1_FIB_` | `TSSE_STR2_LIQ_` / `_SWP_` / `_MSS_` | `TSSE_STR3_VP_` |

Each strategy also has its own trade counter, signal status and ON/OFF switch.

## Strategy selection

- **Input:** `NewStrategyMode` accepts STRATEGY_NONE, STRATEGY_1_FIBONACCI_50, STRATEGY_2_LIQUIDITY_SWEEP, STRATEGY_3_VOLUME_PROFILE, STRATEGY_1_AND_2, STRATEGY_1_AND_3, STRATEGY_2_AND_3 or ALL_STRATEGIES.
- **Chart buttons (trade panel):**
  - **N1 FIB / N2 LIQ / N3 VP ON/OFF** — switching a strategy off also deletes its chart objects.
  - **REFRESH STRATEGY** — resets all setups, recalculates the volume profile and re-evaluates immediately.
  - **HIDE / SHOW OBJECTS** — hides or shows every strategy drawing. Trade lines stay visible.
  - **AUTO TRADING** — the existing button.
- Everything works live, without reattaching the EA. The original S1/S2/S3 buttons are unchanged, and they also delete their own objects when switched off.

## Dashboard additions (performance panel)

- **Active** strategies.
- **Last Signal:** time, the strategy responsible, and direction (BUY in green / SELL in red), followed by the full signal text.
- **One line per strategy:** status (`WAITING`, `SIGNAL DETECTED`, `ENTRY READY`, `TRADE OPEN` or `DISABLED`), then open trades, open lots, floating P/L, win rate (closed trades) and trades opened this session.
- An optional detail line under each strategy with the current accept/reject reason (`PerfShowStrategyDetails`).
- The open-trades list already shows the strategy responsible for each trade. The trade-management buttons act on every EA magic, including N1–N3.

## Trade protection (all strategies)

`ExecuteSignal()` blocks a trade when any of these apply:
- The spread is above `MaxSpreadPips`.
- The daily loss limit or maximum drawdown is reached.
- `MaxOpenTrades` or `MaxTradesPerStrategy` is reached.
- Hedging is not allowed and an opposite position is open.
- Free margin is insufficient.
- The same setup was already traded (setup key stored per magic and direction).
- The SL is on the wrong side, closer than `MinStopLossPips`, or inside the broker StopLevel (FreezeLevel is checked on modify/close).
- **News filter** is on and the time is inside a news window. It is OFF by default. MQL4 has no economic calendar, so enter times in `NewsTimes` / `NewsDailyTimes`.

Signals only come from closed candles. The existing features — lot modes, maximum lot, break-even, smart/classic trailing and partial close — apply to the new strategies too.
Partial close is now generic: S3 partial mode, N2 partial mode (1R → final 2R by default) and N3 partial at the VP target.

## Debug mode

Set `DebugMode = true`. Every evaluation then prints the accept/reject reason to the Experts log. For example:
```
[DEBUG] N1 2026.09.20 14:00: WAITING: bearish impulse, price 12.4 pips from the 50.0% zone [1.08410 - 1.08510]
[DEBUG] N1 2026.09.20 16:00: ENTRY READY: in the fib zone, waiting confirmation
[DEBUG] N2 ...: BUY: REJECT: real breakout (closes beyond the level) | SELL: waiting sweep of 3 buy-side level(s)
[DEBUG] N3 ...: SIGNAL ACCEPTED: VP POC rejection + price action
```

## Testing instructions

General: Strategy Tester → **Every tick** → at least 1 year of data → load the preset with *Expert properties → Load*.
Run on the timeframe written in the preset, and download history (F2) for M15/H1/D1. Use **Visual mode** to see the drawings.
Chart buttons do not work inside the MT4 tester (MT4 does not send chart events there), so select strategies through the inputs.

1. **N1 Fibonacci 50%:** `Backtest_N1_Fib50_H1.set` on EURUSD or XAUUSD **H1**.
   - Check: the fib lines and 50% zone appear after each impulse.
   - Check: no trade on the touch; the trade opens after the confirmation candle.
   - Check: the SL is beyond the zone and the TP is at the impulse end.
   - Try `N1_SLMode=N1_SL_CONFIRM_CANDLE` for the exact video style.
2. **N2 Liquidity sweep:** `Backtest_N2_LiquiditySweep_M15.set` on **M15**.
   - Check: liquidity lines, sweep arrows and MSS lines are drawn.
   - Check the Journal classification (REAL BREAKOUT / LIQUIDITY SWEEP / FALSE BREAKOUT / VALID STRUCTURE BREAK).
   - Check: the partial close at 1R with SL moved to break-even.
3. **N3 Volume profile:** `Backtest_N3_VolumeProfile_H1.set` on **H1**.
   - Check: the histogram, POC (red), VAH/VAL (white), HVN (blue) and LVN (gold).
   - Check: entry on a POC/VAL/VAH rejection in the impulse direction.
   - Check: partial close at VAH/VAL, with the remainder running to 1:3.
   - Tick volume is broker-specific, so results differ between brokers.
4. **ALL_STRATEGIES:** `Backtest_AllNewStrategies_H1.set`. All three run together, each with its own magic.
   - Check the per-strategy lines in the stats panel and the `MaxTradesPerStrategy` / `MaxOpenTrades` limits.
   - To run the new strategies together with the original ones, set `EnableStrategy1..3=true` as well.
5. **Live demo:** attach to a chart, and toggle N1/N2/N3, REFRESH STRATEGY and HIDE OBJECTS from the panel. Enable `DebugMode` for the first sessions.

## New inputs


**New strategies**

| Input | Default | Description |
|---|---|---|
| `NewStrategyMode` | `ALL_STRATEGIES` | New strategies active at start (toggle on chart: N1/N2/N3) |
| `MagicNew1` | `710011` | Magic number - N1 Fibonacci 50% |
| `MagicNew2` | `710012` | Magic number - N2 Liquidity sweep |
| `MagicNew3` | `710013` | Magic number - N3 Volume profile |
| `DebugMode` | `false` | Log the accept / reject reason of EVERY evaluation |
| `PerfShowStrategyDetails` | `true` | Show each strategy's current condition line in the stats panel |

**News filter**

| Input | Default | Description |
|---|---|---|
| `UseNewsFilter` | `false` | Block new trades around news times (OFF by default) |
| `NewsTimes` | `""` | Dated news (server time) "2026.10.02 15:30;2026.10.07 21:00" |
| `NewsDailyTimes` | `""` | Daily blocked times (server time) "15:30;17:00" |
| `NewsMinutesBefore` | `30` | Minutes blocked before news |
| `NewsMinutesAfter` | `30` | Minutes blocked after news |

**N1 Fibonacci 50%**

| Input | Default | Description |
|---|---|---|
| `N1_ImpulseTimeframe` | `PERIOD_CURRENT` | Impulse / Fibonacci timeframe |
| `N1_ConfirmTimeframe` | `PERIOD_CURRENT` | Confirmation timeframe (evaluated on its closed candles) |
| `N1_FibLevel` | `50.0` | Fibonacci retracement level % (video: 50) |
| `N1_SwingStrength` | `3` | Swing strength (bars on each side) |
| `N1_SwingLookback` | `100` | Swing lookback (bars of impulse timeframe) |
| `N1_MinImpulsePips` | `20.0` | Minimum impulse size (pips) |
| `N1_MinImpulseATR` | `2.0` | Minimum impulse size as ATR multiple (0 = off) |
| `N1_MaxImpulseBars` | `40` | Maximum impulse duration (bars) |
| `N1_RequireImpulseBOS` | `true` | Impulse must break the previous swing (valid structure) |
| `N1_ZoneWidthPips` | `5.0` | Reaction zone half width around the fib level (pips) |
| `N1_RequireOriginZone` | `false` | Fib level must overlap the supply/demand base at the impulse origin |
| `N1_OriginBaseBars` | `5` | Bars before the impulse origin that form the supply/demand base |
| `N1_MaxEntryDistancePips` | `10.0` | Max distance between entry and the fib level (pips) |
| `N1_InvalidateFibLevel` | `100.0` | Close beyond this fib % cancels the setup (100 = impulse origin) |
| `N1_MaxBarsForRetrace` | `60` | Max confirmation-TF bars to wait for the retracement |
| `N1_MaxBarsForConfirm` | `10` | Max confirmation-TF bars after the touch |
| `N1_ConfirmType` | `NCONF_CANDLE_OR_STRUCTURE` | Confirmation required after the touch |
| `N1_CandleType` | `CONFIRM_ANY_PATTERN` | Confirmation candle type |
| `N1_ConfirmMinBodyRatio` | `0.50` | Confirmation candle min body/range (directional close) |
| `N1_StructureBars` | `3` | Structure break: close beyond the high/low of the last N candles |
| `N1_SLMode` | `N1_SL_ZONE` | Stop loss method |
| `N1_SLBufferPoints` | `30` | SL buffer (POINTS) |
| `N1_ATRPeriod` | `14` | ATR period |
| `N1_ATRMultiplierSL` | `1.5` | ATR multiplier for SL |
| `N1_TPMode` | `N1_TP_IMPULSE_END` | Take profit method |
| `N1_RiskReward` | `2.0` | Risk:Reward (1:x) |
| `N1_MinRR` | `1.0` | Structural TP below this RR -> fixed RR |

**N2 Liquidity sweep**

| Input | Default | Description |
|---|---|---|
| `N2_Timeframe` | `PERIOD_CURRENT` | N2 timeframe |
| `N2_SwingMethod` | `SWING_FRACTAL` | Swing detection method |
| `N2_SwingStrength` | `3` | Fractal swing strength (bars on each side) |
| `N2_LiquidityLookback` | `100` | Liquidity lookback (bars) |
| `N2_UseEqualHighsLows` | `true` | Liquidity: equal highs / lows |
| `N2_EqualTolerancePips` | `2.0` | Equal highs / lows tolerance (pips) |
| `N2_UsePreviousSwing` | `true` | Liquidity: previous swing high / low |
| `N2_UsePreviousDayHL` | `true` | Liquidity: previous day high / low |
| `N2_UseAsianSessionHL` | `true` | Session liquidity: Asian high / low |
| `N2_UseLondonSessionHL` | `true` | Session liquidity: London high / low |
| `N2_UseNewYorkSessionHL` | `true` | Session liquidity: New York high / low |
| `N2_MinSweepPips` | `1.0` | Minimum sweep distance beyond the level (pips) |
| `N2_TriggerMode` | `N2_RECLAIM_OR_MSS` | What confirms the sweep |
| `N2_ReclaimBars` | `3` | Candles allowed to close back inside after the sweep |
| `N2_RealBreakoutCloses` | `2` | Consecutive closes beyond the level = REAL breakout (cancel) |
| `N2_MSSLookback` | `20` | MSS/BOS structure lookback (bars) |
| `N2_MSSMinBreakPips` | `0.5` | MSS/BOS: close beyond structure by (pips) |
| `N2_EntryMode` | `N2_ENTRY_MARKET` | Entry on market or on retest |
| `N2_RetestTolerancePips` | `2.0` | Retest tolerance around the swept level (pips) |
| `N2_RequireConfirmCandle` | `true` | Require a confirmation candle for the entry |
| `N2_CandleType` | `CONFIRM_DIRECTIONAL_CLOSE` | Confirmation candle type |
| `N2_ConfirmMinBodyRatio` | `0.30` | Confirmation candle min body/range |
| `N2_SignalExpiryBars` | `12` | Max bars after the sweep before the signal expires |
| `N2_SLMode` | `N2_SL_SWEEP` | Stop loss method |
| `N2_SLBufferPips` | `2.0` | SL buffer (pips) |
| `N2_ATRPeriod` | `14` | ATR period |
| `N2_ATRMultiplierSL` | `1.5` | ATR multiplier for SL |
| `N2_TPMode` | `N2_TP_PARTIAL` | Take profit method |
| `N2_RiskReward` | `2.0` | Risk:Reward (1:x) |
| `N2_MinRR` | `1.0` | Structural TP below this RR -> fixed RR |
| `N2_PartialAtR` | `1.0` | Partial mode: partial close at this R |
| `N2_PartialPercent` | `50.0` | Partial mode: % volume closed |
| `N2_FinalRR` | `2.0` | Partial mode: final TP at this R |
| `N2_BEOffsetPips` | `1.0` | Partial mode: SL to BE + offset after the partial |

**N3 Volume profile**

| Input | Default | Description |
|---|---|---|
| `N3_ProfileTimeframe` | `PERIOD_CURRENT` | Volume profile timeframe |
| `N3_ConfirmTimeframe` | `PERIOD_CURRENT` | Confirmation / entry timeframe |
| `N3_ProfileSource` | `VP_LAST_IMPULSE` | Profile range |
| `N3_LookbackBars` | `120` | Profile lookback bars (lookback source / impulse search) |
| `N3_SwingStrength` | `3` | Impulse source: swing strength |
| `N3_MinImpulsePips` | `20.0` | Impulse source: minimum impulse size (pips) |
| `N3_MaxImpulseBars` | `80` | Impulse source: maximum impulse duration (bars) |
| `N3_Bins` | `40` | Number of price bins |
| `N3_ValueAreaPct` | `70.0` | Value area % (default 70) |
| `N3_HVNThresholdPct` | `60.0` | HVN: local volume peak >= X% of POC volume |
| `N3_LVNThresholdPct` | `25.0` | LVN: local volume trough <= X% of POC volume |
| `N3_MinZoneStrengthPct` | `50.0` | Minimum zone strength: HVN volume >= X% of POC to be traded |
| `N3_TradePOC` | `true` | Entry zones: POC (video: main entry) |
| `N3_TradeVAHVAL` | `true` | Entry zones: VAH / VAL |
| `N3_TradeHVN` | `false` | Entry zones: HVN |
| `N3_TradeLVN` | `false` | Entry zones: LVN |
| `N3_ZoneWidthPips` | `0.0` | Zone half width in pips (0 = half a bin) |
| `N3_EntryMode` | `VPE_REJECTION` | Entry mode |
| `N3_BiasMode` | `VPB_IMPULSE_DIRECTION` | Direction filter |
| `N3_RequireConfirmCandle` | `true` | Require a confirmation candle |
| `N3_CandleType` | `CONFIRM_ANY_PATTERN` | Confirmation candle type |
| `N3_ConfirmMinBodyRatio` | `0.40` | Confirmation candle min body/range |
| `N3_RetestBars` | `10` | Retest mode: bars allowed between reclaim and retest |
| `N3_AutoRefresh` | `false` | Recalculate the profile on every new bar |
| `N3_RefreshPeriod` | `PERIOD_D1` | Lookback source: recalculate when a new bar of this TF opens |
| `N3_DrawHistogram` | `true` | Draw the profile histogram |
| `N3_HistogramWidthBars` | `20` | Histogram width (bars) for the POC bin |
| `N3_SLMode` | `N3_SL_ZONE` | Stop loss method |
| `N3_SLBufferPips` | `2.0` | SL buffer (pips) |
| `N3_ATRPeriod` | `14` | ATR period |
| `N3_ATRMultiplierSL` | `1.5` | ATR multiplier for SL |
| `N3_TPMode` | `N3_TP_VA_EDGE` | Take profit target |
| `N3_RiskReward` | `2.0` | Risk:Reward (1:x) for RR mode / fallback |
| `N3_MinRR` | `1.0` | VP target below this RR -> next target or fixed RR |
| `N3_UsePartial` | `true` | Partial at the VP target, rest runs to final RR (video) |
| `N3_PartialPercent` | `50.0` | Partial: % volume closed at the target |
| `N3_PartialAtR` | `1.0` | Partial: R multiple used when no VP target exists |
| `N3_FinalRR` | `3.0` | Partial: final TP (R multiple, at least beyond the target) |
| `N3_BEOffsetPips` | `1.0` | Partial: SL to BE + offset after the partial |

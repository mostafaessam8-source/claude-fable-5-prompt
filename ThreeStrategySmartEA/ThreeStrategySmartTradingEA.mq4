//+------------------------------------------------------------------+
//|                                ThreeStrategySmartTradingEA.mq4   |
//|                              Three Strategy Smart Trading EA     |
//+------------------------------------------------------------------+
//|                                                                  |
//|  STRATEGIES                                                      |
//|   S1 : Trendline + Marubozu (strong body) Breakout + Retest      |
//|   S2 : One Candle Range (HTF reference candle) + MSS + FVG       |
//|   S3 : Liquidity Sweep + BOS + FVG                               |
//|                                                                  |
//|  All signals are evaluated on CLOSED candles only (shift >= 1).  |
//|  No external indicators are used - every calculation is inside   |
//|  this file (only the built-in iATR function is used for ATR).    |
//|                                                                  |
//|  !!! RISK WARNING !!!                                            |
//|  Trading leveraged products carries a high level of risk.        |
//|  BACKTEST RESULTS DO NOT GUARANTEE FUTURE PROFITS. Past or       |
//|  simulated performance is not indicative of future results.      |
//|  Always test on a demo account before using real money.          |
//|                                                                  |
//|  Martingale / loss multiplier is DISABLED by default and there   |
//|  is NO grid logic in this EA.                                    |
//+------------------------------------------------------------------+
#property copyright   "Three Strategy Smart Trading EA"
#property link        ""
#property version     "1.00"
#property description "Three Strategy Smart Trading EA - Trendline Breakout+Retest, One Candle Range+MSS+FVG, Liquidity+BOS+FVG."
#property description "WARNING: Backtest results do not guarantee future profits."
#property strict

//+------------------------------------------------------------------+
//| Enumerations                                                     |
//+------------------------------------------------------------------+
enum ENUM_LOT_MODE
  {
   LOT_FIXED          = 0, // Fixed lot
   LOT_RISK_EQUITY    = 1, // Risk % of Equity (lot from Entry-SL distance)
   LOT_RISK_BALANCE   = 2, // Risk % of Balance (lot from Entry-SL distance)
   LOT_RISK_MONEY     = 3  // Fixed money risk (lot from Entry-SL distance)
  };

enum ENUM_DIR_FILTER
  {
   DIR_BOTH      = 0, // Buy and Sell
   DIR_BUY_ONLY  = 1, // Buy only
   DIR_SELL_ONLY = 2  // Sell only
  };

enum ENUM_SCOPE
  {
   SCOPE_EA_ONLY    = 0, // Only orders of this EA (strategy + manual magics)
   SCOPE_SYMBOL_ALL = 1  // All orders on this chart symbol
  };

enum ENUM_CONFIRM_MODE
  {
   CONFIRM_DIRECTIONAL_CLOSE = 0, // Candle closes in trade direction (min body ratio)
   CONFIRM_ENGULFING         = 1, // Engulfing candle
   CONFIRM_PINBAR            = 2, // Pin bar / rejection wick
   CONFIRM_ANY_PATTERN       = 3  // Any of the above
  };

enum ENUM_S1_RETEST_MODE
  {
   RETEST_TRENDLINE   = 0, // Retest of the (projected) trendline
   RETEST_BREAK_LEVEL = 1, // Retest of the breakout price level
   RETEST_EITHER      = 2  // Either of them
  };

enum ENUM_S1_SL_MODE
  {
   S1_SL_BREAKOUT_CANDLE = 0, // Beyond the breakout candle
   S1_SL_LAST_SWING      = 1, // Beyond the last swing
   S1_SL_ATR             = 2  // ATR based
  };

enum ENUM_S1_TP_MODE
  {
   S1_TP_RR        = 0, // Fixed Risk:Reward
   S1_TP_LIQUIDITY = 1, // Nearest liquidity / previous high-low
   S1_TP_MANUAL    = 2  // Manual TP from the chart panel
  };

enum ENUM_REF_MODE
  {
   REF_LAST_CLOSED   = 0, // Last closed reference candle
   REF_SPECIFIC_HOUR = 1, // Candle of a specific hour
   REF_SESSION_FIRST = 2  // First candle of the selected session
  };

enum ENUM_SESSION
  {
   SES_LONDON  = 0, // London
   SES_NEWYORK = 1, // New York
   SES_ASIAN   = 2, // Asian
   SES_CUSTOM  = 3  // Custom session
  };

enum ENUM_S2_SETUP
  {
   S2_BREAKOUT_ONLY = 0, // Range breakout (continuation)
   S2_SWEEP_ONLY    = 1, // Liquidity sweep of range (reversal)
   S2_BOTH          = 2  // Both
  };

enum ENUM_FVG_ENTRY
  {
   FVG_ENTRY_CONFIRM_CLOSE = 0, // Market order after retest + confirmation candle
   FVG_ENTRY_LIMIT_ORDER   = 1  // Limit order at the FVG entry level
  };

enum ENUM_S2_SL_MODE
  {
   S2_SL_FVG   = 0, // Behind the FVG
   S2_SL_SWING = 1, // Behind the last swing / sweep extreme
   S2_SL_ATR   = 2  // ATR based
  };

enum ENUM_S2_TP_MODE
  {
   S2_TP_OPPOSITE_RANGE = 0, // Opposite side of the reference range
   S2_TP_LIQUIDITY      = 1, // Liquidity pool
   S2_TP_RR             = 2  // Fixed Risk:Reward
  };

enum ENUM_S3_SL_MODE
  {
   S3_SL_LIQUIDITY = 0, // Beyond the swept liquidity extreme
   S3_SL_FVG       = 1, // Beyond the FVG
   S3_SL_ATR       = 2  // ATR based
  };

enum ENUM_S3_TP_MODE
  {
   S3_TP_LIQUIDITY  = 0, // Nearest opposite liquidity
   S3_TP_RR         = 1, // Fixed Risk:Reward
   S3_TP_PARTIAL_BE = 2  // Partial close at xR + Break Even, rest at RR
  };

enum ENUM_TRAIL_MODE
  {
   TRAIL_CLASSIC = 0, // Classic: fixed distance from price
   TRAIL_SMART   = 1  // Smart: BE -> structure/ATR chandelier -> profit lock
  };

enum ENUM_TRAIL_COMBINE
  {
   COMBINE_LOOSER  = 0, // Use the LOOSER of structure / ATR stop (fewer noise hits)
   COMBINE_TIGHTER = 1  // Use the TIGHTER of structure / ATR stop (locks more)
  };

enum ENUM_PRICE_UNIT
  {
   UNIT_PIPS  = 0, // Pips (distance)
   UNIT_PRICE = 1  // Price (absolute)
  };

//+------------------------------------------------------------------+
//| Enumerations - NEW video strategies (N1 / N2 / N3)               |
//+------------------------------------------------------------------+
enum StrategyMode
  {
   STRATEGY_NONE              = 0, // None of the new strategies
   STRATEGY_1_FIBONACCI_50    = 1, // N1 Fibonacci 50% only
   STRATEGY_2_LIQUIDITY_SWEEP = 2, // N2 Liquidity sweep only
   STRATEGY_3_VOLUME_PROFILE  = 3, // N3 Volume profile only
   STRATEGY_1_AND_2           = 4, // N1 + N2
   STRATEGY_1_AND_3           = 5, // N1 + N3
   STRATEGY_2_AND_3           = 6, // N2 + N3
   ALL_STRATEGIES             = 7  // N1 + N2 + N3
  };

enum ENUM_NCONFIRM
  {
   NCONF_CANDLE               = 0, // Confirmation candle
   NCONF_STRUCTURE            = 1, // Micro structure break (close beyond last N candles)
   NCONF_CANDLE_OR_STRUCTURE  = 2, // Candle OR structure break
   NCONF_CANDLE_AND_STRUCTURE = 3, // Candle AND structure break
   NCONF_NONE                 = 4  // No confirmation - entry on touch (NOT recommended)
  };

enum ENUM_N1_SL
  {
   N1_SL_ZONE           = 0, // Beyond the reaction zone
   N1_SL_SWING          = 1, // Beyond the latest valid swing
   N1_SL_CONFIRM_CANDLE = 2, // Beyond the confirmation candle (as in the video)
   N1_SL_ATR            = 3  // ATR based
  };

enum ENUM_N1_TP
  {
   N1_TP_RR         = 0, // Fixed Risk:Reward
   N1_TP_IMPULSE_END= 1, // Previous swing = impulse end (fib 0 level, as in the video)
   N1_TP_LIQUIDITY  = 2, // Nearest liquidity target
   N1_TP_MANUAL     = 3  // Manual TP from the panel
  };

enum ENUM_SWING_METHOD
  {
   SWING_FRACTAL        = 0, // Fractal swings (N bars on each side)
   SWING_HIGHEST_LOWEST = 1  // Highest high / lowest low of the lookback window
  };

enum ENUM_N2_TRIGGER
  {
   N2_RECLAIM         = 0, // Candle closes back inside the level
   N2_MSS             = 1, // Opposite MSS / BOS
   N2_RECLAIM_OR_MSS  = 2, // Close back inside OR MSS
   N2_RECLAIM_AND_MSS = 3  // Close back inside AND MSS
  };

enum ENUM_N2_ENTRY
  {
   N2_ENTRY_MARKET = 0, // Market after trigger + confirmation
   N2_ENTRY_RETEST = 1  // Wait for a retest of the swept level
  };

enum ENUM_N2_SL
  {
   N2_SL_SWEEP = 0, // Beyond the sweep extreme (swept liquidity)
   N2_SL_SWING = 1, // Beyond the latest swing
   N2_SL_ATR   = 2  // ATR based
  };

enum ENUM_N2_TP
  {
   N2_TP_OPPOSITE_LIQ = 0, // Opposite liquidity
   N2_TP_PREV_SWING   = 1, // Previous swing high / low
   N2_TP_RR           = 2, // Fixed Risk:Reward
   N2_TP_PARTIAL      = 3  // Partial at xR, final TP at final RR
  };

enum ENUM_VP_SOURCE
  {
   VP_LAST_IMPULSE  = 0, // Last impulse leg (fixed range from trend start to end - as in the video)
   VP_LOOKBACK_BARS = 1, // Last N bars
   VP_PREVIOUS_DAY  = 2  // Previous day
  };

enum ENUM_VP_ENTRY
  {
   VPE_TOUCH     = 0, // Touch of the zone (+ optional confirmation candle)
   VPE_REJECTION = 1, // Wick into the zone and close back out
   VPE_RECLAIM   = 2, // Reclaim (buy) / lose (sell) the level
   VPE_RETEST    = 3  // Reclaim first, then retest + confirmation
  };

enum ENUM_VP_BIAS
  {
   VPB_IMPULSE_DIRECTION = 0, // Trade only in the impulse direction (fallback: price vs POC)
   VPB_PRICE_VS_POC      = 1, // Above POC -> buys, below POC -> sells
   VPB_BOTH_DIRECTIONS   = 2  // Both directions
  };

enum ENUM_N3_SL
  {
   N3_SL_ZONE  = 0, // Outside the VP zone
   N3_SL_SWING = 1, // Beyond the latest swing
   N3_SL_ATR   = 2  // ATR based
  };

enum ENUM_N3_TP
  {
   N3_TP_OPPOSITE_ZONE = 0, // Next VP level in trade direction
   N3_TP_POC           = 1, // POC
   N3_TP_VA_EDGE       = 2, // VAH for buys / VAL for sells (as in the video)
   N3_TP_HVN           = 3, // Next HVN
   N3_TP_LVN           = 4, // Next LVN
   N3_TP_RR            = 5  // Fixed Risk:Reward
  };

//+------------------------------------------------------------------+
//| Inputs                                                           |
//+------------------------------------------------------------------+
input string   _g0 = "================ GENERAL ================"; // ----- General -----
input bool     EnableAutoTrading        = true;      // Auto trading ON at start (can be toggled on chart)
input bool     EnableStrategy1          = true;      // Strategy 1: Trendline + Marubozu Breakout + Retest
input bool     EnableStrategy2          = true;      // Strategy 2: One Candle Range + MSS + FVG
input bool     EnableStrategy3          = true;      // Strategy 3: Liquidity + BOS + FVG
input ENUM_DIR_FILTER TradeDirection    = DIR_BOTH;  // Allowed trade direction
input int      MagicStrategy1           = 710001;    // Magic number - Strategy 1
input int      MagicStrategy2           = 710002;    // Magic number - Strategy 2
input int      MagicStrategy3           = 710003;    // Magic number - Strategy 3
input int      MagicManual              = 710000;    // Magic number - manual panel trades
input string   TradeCommentPrefix       = "TSSE";    // Order comment prefix
input double   PipSizeOverride          = 0.0;       // Pip size override in price (0 = auto: 10 points on 3/5 digits)
input bool     AlertSignalsWhenAutoOff  = true;      // Still detect + alert signals when auto trading is OFF

input string   _g1 = "================ MONEY MANAGEMENT ================"; // ----- Money management -----
input ENUM_LOT_MODE LotMode             = LOT_RISK_EQUITY; // Lot size mode
input double   FixedLot                 = 0.01;      // Fixed lot (LOT_FIXED)
input double   RiskPercent              = 1.0;       // Risk % per trade (risk modes)
input double   RiskMoney                = 50.0;      // Risk money per trade (LOT_RISK_MONEY)
input double   MinimumLot               = 0.01;      // Minimum lot (user limit)
input double   MaximumLot               = 5.0;       // Maximum lot (user limit)
input double   MinFreeMarginAfterTrade  = 0.0;       // Minimum free margin left after opening (money, 0 = only broker check)
input double   DailyLossLimitPercent    = 5.0;       // Daily loss limit % of day-start equity (0 = off)
input double   DailyLossLimitMoney      = 0.0;       // Daily loss limit in money (0 = off)
input double   MaxDrawdownPercent       = 20.0;      // Max drawdown % from equity peak (0 = off)
input bool     CloseAllOnRiskLimit      = false;     // Close EA trades when a risk limit is hit
input bool     ResetPeakOnStart         = true;      // Max DD measured from equity when the EA starts (false = keep stored peak)
input int      MaxOpenTrades            = 5;         // Maximum open trades (all EA magics, this symbol)
input int      MaxTradesPerStrategy     = 2;         // Maximum open trades per strategy
input bool     AllowHedging             = false;     // Allow Buy and Sell at the same time
input double   MaxSpreadPips            = 3.0;       // Maximum spread in pips (0 = off)
input double   MinStopLossPips          = 5.0;       // Minimum Entry-SL distance in pips
input double   MaxStopLossPips          = 0.0;       // Maximum Entry-SL distance in pips (0 = off)
input bool     ManualTradesRespectLimits= true;      // Panel trades also blocked by daily loss / DD limits
input bool     UseLossMultiplier        = false;     // [DANGEROUS] Multiply lot after losses (martingale) - OFF by default
input double   LossMultiplier           = 1.5;       // Lot multiplier per consecutive loss (only if enabled)
input int      MaxMultiplierSteps       = 3;         // Max multiplier steps (only if enabled)

input string   _g2 = "================ TRADING HOURS (server time) ================"; // ----- Trading hours -----
input bool     UseTradingHours          = false;     // Use trading hours filter
input int      TradeStartHour           = 7;         // Start hour
input int      TradeStartMinute         = 0;         // Start minute
input int      TradeEndHour             = 20;        // End hour
input int      TradeEndMinute           = 0;         // End minute
input bool     TradeOnMonday            = true;      // Trade on Monday
input bool     TradeOnFriday            = true;      // Trade on Friday

input string   _g3 = "================ EXECUTION ================"; // ----- Execution -----
input int      SlippagePoints           = 30;        // Max slippage in points
input int      MaxRetries               = 3;         // Retries for temporary errors
input int      RetryDelayMs             = 500;       // Delay between retries (ms)
input bool     UseECNMode               = false;     // ECN mode: send order first, then set SL/TP
input bool     AdjustStopsToBrokerLevel = true;      // Push SL/TP outside broker StopLevel instead of rejecting

input string   _g4 = "================ TRADE MANAGEMENT ================"; // ----- Trade management -----
input ENUM_SCOPE AutoManageScope        = SCOPE_EA_ONLY;    // Orders managed by trailing/BE automation
input ENUM_SCOPE PanelActionScope       = SCOPE_SYMBOL_ALL; // Orders affected by panel buttons
input ENUM_SCOPE StatsScope             = SCOPE_EA_ONLY;    // Orders counted in the statistics panel
input bool     UseTrailingStop          = true;      // Trailing stop ON at start (toggle on chart)
input ENUM_TRAIL_MODE TrailMode         = TRAIL_SMART; // Trailing mode (Smart recommended)
input double   TrailStartPips           = 20.0;      // [Classic] Trailing starts after this profit (pips)
input double   TrailDistancePips        = 15.0;      // [Classic] Trailing distance from price (pips)
input double   TrailStepPips            = 2.0;       // [Classic] Minimum SL improvement per modification (pips)
input bool     UseAutoBreakEven         = false;     // Automatic break even
input double   BETriggerPips            = 15.0;      // Break even trigger profit (pips)
input double   BEOffsetPips             = 1.0;       // Break even offset (pips locked)
input double   PartialClosePercent      = 50.0;      // PARTIAL CLOSE button: % of volume to close

input string   _st = "================ SMART TRAILING STOP ================"; // ----- Smart trailing -----
input ENUM_TIMEFRAMES ST_Timeframe      = PERIOD_CURRENT; // Trailing timeframe (CURRENT = timeframe of the strategy that opened the trade)
input bool     ST_UpdateOnBarClose      = true;      // Move SL only on closed candles (ignores intrabar spikes)
input double   ST_DefaultRiskATR        = 1.5;       // 1R for trades opened without SL = ATR x this
input double   ST_BreakEvenAtR          = 1.0;       // Stage 1: move SL to break even at this R (0 = off)
input double   ST_BreakEvenLockPips     = 1.0;       // Stage 1: pips locked above entry (+ current spread)
input double   ST_TrailStartR           = 1.5;       // Stage 2: start structure/ATR trailing at this R
input int      ST_ATRPeriod             = 14;        // Stage 2: ATR period
input double   ST_ATRMultStart          = 3.0;       // Stage 2: chandelier ATR multiplier when trailing starts (wide)
input double   ST_ATRMultMin            = 1.5;       // Stage 2: tightest ATR multiplier allowed
input double   ST_ATRTightenPerR        = 0.5;       // Stage 2: multiplier reduction per extra 1R of profit
input bool     ST_UseStructure          = true;      // Stage 2: also trail behind swing lows/highs formed after entry
input int      ST_SwingStrength         = 2;         // Stage 2: swing strength (bars on each side)
input double   ST_StructureBufferATR    = 0.3;       // Stage 2: buffer beyond the swing (x ATR)
input ENUM_TRAIL_COMBINE ST_Combine     = COMBINE_LOOSER; // Stage 2: how to combine structure and ATR stops
input bool     ST_VolatilityAdapt       = true;      // Widen the stop when volatility expands (news / spikes)
input int      ST_VolFastPeriod         = 5;         // Volatility: fast ATR period
input int      ST_VolSlowPeriod         = 50;        // Volatility: slow ATR period
input double   ST_VolMaxBoost           = 1.5;       // Volatility: maximum widening factor
input double   ST_ProfitLockStartR      = 2.0;       // Stage 3: start locking a % of the peak profit at this R (0 = off)
input double   ST_ProfitLockPct         = 40.0;      // Stage 3: % of peak profit locked at start
input double   ST_ProfitLockStepPerR    = 10.0;      // Stage 3: extra % locked per additional 1R
input double   ST_ProfitLockPctMax      = 75.0;      // Stage 3: maximum % of peak profit locked
input double   ST_MinDistanceSpreadMult = 2.0;       // Keep SL at least spread x this away from price (+ StopLevel)
input double   ST_MinStepPips           = 1.0;       // Minimum SL improvement per modification (pips)
input bool     ST_ExtendTP              = true;      // Extend TP when the trend is strong and SL is already in profit
input double   ST_ExtendAtPctOfTP       = 80.0;      // Extend when this % of the TP distance is reached
input double   ST_ExtendATRMult         = 1.0;       // TP extension size (x ATR)
input int      ST_MaxTPExtensions       = 3;         // Maximum TP extensions per trade

input string   _s1 = "================ STRATEGY 1: TRENDLINE + MARUBOZU BREAKOUT + RETEST ================"; // ----- Strategy 1 -----
input ENUM_TIMEFRAMES S1_Timeframe      = PERIOD_CURRENT; // S1 timeframe
input int      S1_SwingStrength         = 3;         // Swing strength (bars on each side)
input int      S1_SwingLookback         = 120;       // Swing search lookback (bars)
input int      S1_MinSwingSeparation    = 5;         // Minimum bars between the two trendline swings
input bool     S1_RequireStructureTrend = true;      // Also require lower lows (downtrend) / higher highs (uptrend)
input double   MinBodyToRangeRatio      = 0.60;      // Breakout candle: min body / range ratio (Marubozu strength)
input double   S1_MinBodyATRMultiplier  = 0.0;       // Breakout candle: min body as ATR multiple (0 = off)
input double   S1_MinBreakDistancePips  = 0.5;       // Breakout candle must close this far beyond the line (pips)
input ENUM_S1_RETEST_MODE S1_RetestMode = RETEST_EITHER; // Retest reference
input double   S1_RetestTolerancePips   = 3.0;       // Retest tolerance (pips)
input int      S1_MaxBarsForRetest      = 15;        // Max bars to wait for the retest
input ENUM_CONFIRM_MODE S1_ConfirmMode  = CONFIRM_DIRECTIONAL_CLOSE; // Confirmation candle type
input double   S1_ConfirmMinBodyRatio   = 0.40;      // Confirmation candle min body/range (directional close)
input bool     S1_AllowSameBarConfirm   = true;      // Retest candle itself may be the confirmation
input int      S1_MaxBarsForConfirm     = 5;         // Max bars after retest to get confirmation
input double   S1_InvalidationPips      = 5.0;       // Cancel setup if a candle closes this far back through the level (pips)
input ENUM_S1_SL_MODE S1_SLMode         = S1_SL_BREAKOUT_CANDLE; // Stop loss mode
input double   S1_SLBufferPips          = 3.0;       // SL buffer (pips)
input int      S1_ATRPeriod             = 14;        // ATR period (ATR SL / body filter)
input double   S1_ATRMultiplierSL       = 1.5;       // ATR multiplier for SL
input ENUM_S1_TP_MODE S1_TPMode         = S1_TP_RR;  // Take profit mode
input double   S1_RiskReward            = 2.0;       // Risk:Reward (1:x)
input double   S1_MinRRForLiquidityTP   = 1.0;       // Liquidity TP below this RR -> fallback to fixed RR
input int      S1_LiquidityLookback     = 150;       // Lookback for liquidity target (bars)

input string   _s2 = "================ STRATEGY 2: ONE CANDLE RANGE + MSS + FVG ================"; // ----- Strategy 2 -----
input ENUM_TIMEFRAMES ReferenceTimeframe= PERIOD_H1; // Reference candle timeframe
input ENUM_TIMEFRAMES EntryTimeframe    = PERIOD_M5; // Entry timeframe (M5 / M15)
input ENUM_REF_MODE ReferenceCandleMode = REF_SESSION_FIRST; // Reference candle mode
input int      S2_ReferenceHour         = 8;         // Specific reference hour (server time, REF_SPECIFIC_HOUR)
input bool     S2_RequireSameDayReference = true;    // Hour/session modes: reference candle must be from today
input ENUM_SESSION TradingSession       = SES_LONDON; // Trading session
input bool     S2_OnlyTradeInSession    = true;      // Only trigger/enter inside the session window
input ENUM_S2_SETUP S2_SetupMode        = S2_BOTH;   // Setup type
input double   S2_MinBreakPips          = 0.5;       // Range breakout: close beyond range by (pips)
input double   S2_MinSweepPips          = 0.5;       // Range sweep: wick beyond range by (pips)
input bool     S2_SweepRequireCloseInside = true;    // Sweep candle must close back inside the range
input int      S2_SwingStrength         = 2;         // Swing strength on entry TF
input int      S2_StructureLookback     = 30;        // Lookback for structure level (bars)
input double   S2_MinMSSBreakPips       = 0.2;       // MSS/BOS: close beyond structure by (pips)
input int      S2_MaxBarsForMSS         = 24;        // Max bars to wait for MSS
input double   S2_MinFVGPips            = 1.0;       // Minimum FVG size (pips)
input bool     S2_RequireDisplacement   = true;      // FVG middle candle must be in trade direction
input int      S2_MaxBarsForFVG         = 12;        // Max bars after MSS to find an FVG
input ENUM_FVG_ENTRY S2_EntryMode       = FVG_ENTRY_CONFIRM_CLOSE; // Entry execution
input double   S2_EntryPercentOfFVG     = 50.0;      // Entry level inside FVG: 0 = near edge, 50 = middle, 100 = far edge
input bool     S2_RequireConfirmation   = true;      // Confirm-close mode: require a candle closing in trade direction
input int      S2_MaxBarsForRetest      = 30;        // Max bars to wait for FVG retest
input double   S2_InvalidateBeyondFVGPips = 2.0;     // Cancel if a candle closes beyond the FVG far edge by (pips)
input int      S2_MaxTradesPerRange     = 1;         // Max trades per reference range
input ENUM_S2_SL_MODE S2_SLMode         = S2_SL_FVG; // Stop loss mode
input double   S2_SLBufferPips          = 2.0;       // SL buffer (pips)
input int      S2_ATRPeriod             = 14;        // ATR period
input double   S2_ATRMultiplierSL       = 1.5;       // ATR multiplier for SL
input ENUM_S2_TP_MODE S2_TPMode         = S2_TP_OPPOSITE_RANGE; // Take profit mode
input double   S2_RiskReward            = 2.0;       // Risk:Reward (1:x)
input double   S2_MinRRForStructureTP   = 1.0;       // Range/Liquidity TP below this RR -> fallback to fixed RR
input int      S2_LiquidityLookback     = 100;       // Lookback for liquidity target (bars)

input string   _ss = "================ SESSIONS (server time) ================"; // ----- Sessions -----
input int      AsianStartHour           = 0;         // Asian session start hour
input int      AsianEndHour             = 8;         // Asian session end hour
input int      LondonStartHour          = 8;         // London session start hour
input int      LondonEndHour            = 16;        // London session end hour
input int      NewYorkStartHour         = 13;        // New York session start hour
input int      NewYorkEndHour           = 21;        // New York session end hour
input int      CustomStartHour          = 9;         // Custom session start hour
input int      CustomStartMinute        = 0;         // Custom session start minute
input int      CustomEndHour            = 12;        // Custom session end hour
input int      CustomEndMinute          = 0;         // Custom session end minute

input string   _s3 = "================ STRATEGY 3: LIQUIDITY + BOS + FVG ================"; // ----- Strategy 3 -----
input ENUM_TIMEFRAMES S3_Timeframe      = PERIOD_CURRENT; // S3 timeframe
input bool     S3_UseEqualHighsLows     = true;      // Liquidity: equal highs / equal lows
input double   S3_EqualTolerancePips    = 2.0;       // Equal highs/lows tolerance (pips)
input bool     S3_UsePreviousSwing      = true;      // Liquidity: previous swing high / low
input bool     S3_UsePreviousDayHL      = true;      // Liquidity: previous day high / low
input bool     S3_UseAsianSessionHL     = false;     // Liquidity: last Asian session high / low
input bool     S3_UseLondonSessionHL    = true;      // Liquidity: last London session high / low
input bool     S3_UseNewYorkSessionHL   = true;      // Liquidity: last New York session high / low
input int      S3_SwingStrength         = 3;         // Swing strength (bars on each side)
input int      S3_LiquidityLookback     = 120;       // Liquidity search lookback (bars)
input double   S3_MinSweepPips          = 0.5;       // Sweep: wick beyond level by (pips)
input bool     S3_RequireCloseBackInside= true;      // Sweep candle must close back inside the level
input int      MinimumBreakoutPoints    = 20;        // BOS: candle must CLOSE beyond structure by (points)
input int      S3_StructureLookback     = 30;        // Lookback for BOS structure level (bars)
input int      S3_MaxBarsForBOS         = 20;        // Max bars after sweep to get BOS
input double   S3_MinFVGPips            = 1.0;       // Minimum FVG size (pips)
input bool     S3_RequireDisplacement   = true;      // FVG middle candle must be in trade direction
input int      S3_MaxBarsForFVG         = 10;        // Max bars after BOS to find an FVG
input ENUM_FVG_ENTRY S3_EntryMode       = FVG_ENTRY_CONFIRM_CLOSE; // Entry execution
input double   S3_EntryPercentOfFVG     = 50.0;      // Entry level inside FVG: 0 = near edge, 50 = middle, 100 = far edge
input bool     S3_RequireConfirmation   = true;      // Confirm-close mode: require a candle closing in trade direction
input int      S3_MaxBarsForRetest      = 30;        // Max bars to wait for FVG retest
input double   S3_InvalidateBeyondFVGPips = 2.0;     // Cancel if a candle closes beyond the FVG far edge by (pips)
input ENUM_S3_SL_MODE S3_SLMode         = S3_SL_LIQUIDITY; // Stop loss mode
input double   S3_SLBufferPips          = 2.0;       // SL buffer (pips)
input int      S3_ATRPeriod             = 14;        // ATR period
input double   S3_ATRMultiplierSL       = 1.5;       // ATR multiplier for SL
input ENUM_S3_TP_MODE S3_TPMode         = S3_TP_LIQUIDITY; // Take profit mode
input double   S3_RiskReward            = 2.0;       // Risk:Reward (1:x) (also final TP in partial mode)
input double   S3_MinRRForLiquidityTP   = 1.0;       // Liquidity TP below this RR -> fallback to fixed RR
input double   S3_PartialAtR            = 1.0;       // Partial mode: close part at this R multiple
input double   S3_PartialPercent        = 50.0;      // Partial mode: % volume to close
input double   S3_BEOffsetPips          = 1.0;       // Partial mode: BE offset after partial (pips)

input string   _nn = "================ NEW VIDEO STRATEGIES (N1 / N2 / N3) ================"; // ----- New strategies -----
input StrategyMode NewStrategyMode      = ALL_STRATEGIES; // New strategies active at start (toggle on chart: N1/N2/N3)
input int      MagicNew1                = 710011;    // Magic number - N1 Fibonacci 50%
input int      MagicNew2                = 710012;    // Magic number - N2 Liquidity sweep
input int      MagicNew3                = 710013;    // Magic number - N3 Volume profile
input bool     DebugMode                = false;     // Log the accept / reject reason of EVERY evaluation
input bool     PerfShowStrategyDetails  = true;      // Show each strategy's current condition line in the stats panel

input string   _nw = "================ NEWS FILTER (optional) ================"; // ----- News filter -----
input bool     UseNewsFilter            = false;     // Block new trades around news times (OFF by default)
input string   NewsTimes                = "";        // Dated news (server time) "2026.10.02 15:30;2026.10.07 21:00"
input string   NewsDailyTimes           = "";        // Daily blocked times (server time) "15:30;17:00"
input int      NewsMinutesBefore        = 30;        // Minutes blocked before news
input int      NewsMinutesAfter         = 30;        // Minutes blocked after news

input string   _n1 = "================ N1: FIBONACCI 50% + STRUCTURE ================"; // ----- N1 Fibonacci 50% -----
input ENUM_TIMEFRAMES N1_ImpulseTimeframe = PERIOD_CURRENT; // Impulse / Fibonacci timeframe
input ENUM_TIMEFRAMES N1_ConfirmTimeframe = PERIOD_CURRENT; // Confirmation timeframe (evaluated on its closed candles)
input double   N1_FibLevel              = 50.0;      // Fibonacci retracement level % (video: 50)
input int      N1_SwingStrength         = 3;         // Swing strength (bars on each side)
input int      N1_SwingLookback         = 100;       // Swing lookback (bars of impulse timeframe)
input double   N1_MinImpulsePips        = 20.0;      // Minimum impulse size (pips)
input double   N1_MinImpulseATR         = 2.0;       // Minimum impulse size as ATR multiple (0 = off)
input int      N1_MaxImpulseBars        = 40;        // Maximum impulse duration (bars)
input bool     N1_RequireImpulseBOS     = true;      // Impulse must break the previous swing (valid structure)
input double   N1_ZoneWidthPips         = 5.0;       // Reaction zone half width around the fib level (pips)
input bool     N1_RequireOriginZone     = false;     // Fib level must overlap the supply/demand base at the impulse origin
input int      N1_OriginBaseBars        = 5;         // Bars before the impulse origin that form the supply/demand base
input double   N1_MaxEntryDistancePips  = 10.0;      // Max distance between entry and the fib level (pips)
input double   N1_InvalidateFibLevel    = 100.0;     // Close beyond this fib % cancels the setup (100 = impulse origin)
input int      N1_MaxBarsForRetrace     = 60;        // Max confirmation-TF bars to wait for the retracement
input int      N1_MaxBarsForConfirm     = 10;        // Max confirmation-TF bars after the touch
input ENUM_NCONFIRM N1_ConfirmType      = NCONF_CANDLE_OR_STRUCTURE; // Confirmation required after the touch
input ENUM_CONFIRM_MODE N1_CandleType   = CONFIRM_ANY_PATTERN; // Confirmation candle type
input double   N1_ConfirmMinBodyRatio   = 0.50;      // Confirmation candle min body/range (directional close)
input int      N1_StructureBars         = 3;         // Structure break: close beyond the high/low of the last N candles
input ENUM_N1_SL N1_SLMode              = N1_SL_ZONE; // Stop loss method
input int      N1_SLBufferPoints        = 30;        // SL buffer (POINTS)
input int      N1_ATRPeriod             = 14;        // ATR period
input double   N1_ATRMultiplierSL       = 1.5;       // ATR multiplier for SL
input ENUM_N1_TP N1_TPMode              = N1_TP_IMPULSE_END; // Take profit method
input double   N1_RiskReward            = 2.0;       // Risk:Reward (1:x)
input double   N1_MinRR                 = 1.0;       // Structural TP below this RR -> fixed RR

input string   _n2 = "================ N2: LIQUIDITY SWEEP / FALSE BREAKOUT ================"; // ----- N2 Liquidity sweep -----
input ENUM_TIMEFRAMES N2_Timeframe      = PERIOD_CURRENT; // N2 timeframe
input ENUM_SWING_METHOD N2_SwingMethod  = SWING_FRACTAL; // Swing detection method
input int      N2_SwingStrength         = 3;         // Fractal swing strength (bars on each side)
input int      N2_LiquidityLookback     = 100;       // Liquidity lookback (bars)
input bool     N2_UseEqualHighsLows     = true;      // Liquidity: equal highs / lows
input double   N2_EqualTolerancePips    = 2.0;       // Equal highs / lows tolerance (pips)
input bool     N2_UsePreviousSwing      = true;      // Liquidity: previous swing high / low
input bool     N2_UsePreviousDayHL      = true;      // Liquidity: previous day high / low
input bool     N2_UseAsianSessionHL     = true;      // Session liquidity: Asian high / low
input bool     N2_UseLondonSessionHL    = true;      // Session liquidity: London high / low
input bool     N2_UseNewYorkSessionHL   = true;      // Session liquidity: New York high / low
input double   N2_MinSweepPips          = 1.0;       // Minimum sweep distance beyond the level (pips)
input ENUM_N2_TRIGGER N2_TriggerMode    = N2_RECLAIM_OR_MSS; // What confirms the sweep
input int      N2_ReclaimBars           = 3;         // Candles allowed to close back inside after the sweep
input int      N2_RealBreakoutCloses    = 2;         // Consecutive closes beyond the level = REAL breakout (cancel)
input int      N2_MSSLookback           = 20;        // MSS/BOS structure lookback (bars)
input double   N2_MSSMinBreakPips       = 0.5;       // MSS/BOS: close beyond structure by (pips)
input ENUM_N2_ENTRY N2_EntryMode        = N2_ENTRY_MARKET; // Entry on market or on retest
input double   N2_RetestTolerancePips   = 2.0;       // Retest tolerance around the swept level (pips)
input bool     N2_RequireConfirmCandle  = true;      // Require a confirmation candle for the entry
input ENUM_CONFIRM_MODE N2_CandleType   = CONFIRM_DIRECTIONAL_CLOSE; // Confirmation candle type
input double   N2_ConfirmMinBodyRatio   = 0.30;      // Confirmation candle min body/range
input int      N2_SignalExpiryBars      = 12;        // Max bars after the sweep before the signal expires
input ENUM_N2_SL N2_SLMode              = N2_SL_SWEEP; // Stop loss method
input double   N2_SLBufferPips          = 2.0;       // SL buffer (pips)
input int      N2_ATRPeriod             = 14;        // ATR period
input double   N2_ATRMultiplierSL       = 1.5;       // ATR multiplier for SL
input ENUM_N2_TP N2_TPMode              = N2_TP_PARTIAL; // Take profit method
input double   N2_RiskReward            = 2.0;       // Risk:Reward (1:x)
input double   N2_MinRR                 = 1.0;       // Structural TP below this RR -> fixed RR
input double   N2_PartialAtR            = 1.0;       // Partial mode: partial close at this R
input double   N2_PartialPercent        = 50.0;      // Partial mode: % volume closed
input double   N2_FinalRR               = 2.0;       // Partial mode: final TP at this R
input double   N2_BEOffsetPips          = 1.0;       // Partial mode: SL to BE + offset after the partial

input string   _n3 = "================ N3: VOLUME PROFILE (VP) ================"; // ----- N3 Volume profile -----
input ENUM_TIMEFRAMES N3_ProfileTimeframe = PERIOD_CURRENT; // Volume profile timeframe
input ENUM_TIMEFRAMES N3_ConfirmTimeframe = PERIOD_CURRENT; // Confirmation / entry timeframe
input ENUM_VP_SOURCE N3_ProfileSource   = VP_LAST_IMPULSE; // Profile range
input int      N3_LookbackBars          = 120;       // Profile lookback bars (lookback source / impulse search)
input int      N3_SwingStrength         = 3;         // Impulse source: swing strength
input double   N3_MinImpulsePips        = 20.0;      // Impulse source: minimum impulse size (pips)
input int      N3_MaxImpulseBars        = 80;        // Impulse source: maximum impulse duration (bars)
input int      N3_Bins                  = 40;        // Number of price bins
input double   N3_ValueAreaPct          = 70.0;      // Value area % (default 70)
input double   N3_HVNThresholdPct       = 60.0;      // HVN: local volume peak >= X% of POC volume
input double   N3_LVNThresholdPct       = 25.0;      // LVN: local volume trough <= X% of POC volume
input double   N3_MinZoneStrengthPct    = 50.0;      // Minimum zone strength: HVN volume >= X% of POC to be traded
input bool     N3_TradePOC              = true;      // Entry zones: POC (video: main entry)
input bool     N3_TradeVAHVAL           = true;      // Entry zones: VAH / VAL
input bool     N3_TradeHVN              = false;     // Entry zones: HVN
input bool     N3_TradeLVN              = false;     // Entry zones: LVN
input double   N3_ZoneWidthPips         = 0.0;       // Zone half width in pips (0 = half a bin)
input ENUM_VP_ENTRY N3_EntryMode        = VPE_REJECTION; // Entry mode
input ENUM_VP_BIAS N3_BiasMode          = VPB_IMPULSE_DIRECTION; // Direction filter
input bool     N3_RequireConfirmCandle  = true;      // Require a confirmation candle
input ENUM_CONFIRM_MODE N3_CandleType   = CONFIRM_ANY_PATTERN; // Confirmation candle type
input double   N3_ConfirmMinBodyRatio   = 0.40;      // Confirmation candle min body/range
input int      N3_RetestBars            = 10;        // Retest mode: bars allowed between reclaim and retest
input bool     N3_AutoRefresh           = false;     // Recalculate the profile on every new bar
input ENUM_TIMEFRAMES N3_RefreshPeriod  = PERIOD_D1; // Lookback source: recalculate when a new bar of this TF opens
input bool     N3_DrawHistogram         = true;      // Draw the profile histogram
input int      N3_HistogramWidthBars    = 20;        // Histogram width (bars) for the POC bin
input ENUM_N3_SL N3_SLMode              = N3_SL_ZONE; // Stop loss method
input double   N3_SLBufferPips          = 2.0;       // SL buffer (pips)
input int      N3_ATRPeriod             = 14;        // ATR period
input double   N3_ATRMultiplierSL       = 1.5;       // ATR multiplier for SL
input ENUM_N3_TP N3_TPMode              = N3_TP_VA_EDGE; // Take profit target
input double   N3_RiskReward            = 2.0;       // Risk:Reward (1:x) for RR mode / fallback
input double   N3_MinRR                 = 1.0;       // VP target below this RR -> next target or fixed RR
input bool     N3_UsePartial            = true;      // Partial at the VP target, rest runs to final RR (video)
input double   N3_PartialPercent        = 50.0;      // Partial: % volume closed at the target
input double   N3_PartialAtR            = 1.0;       // Partial: R multiple used when no VP target exists
input double   N3_FinalRR               = 3.0;       // Partial: final TP (R multiple, at least beyond the target)
input double   N3_BEOffsetPips          = 1.0;       // Partial: SL to BE + offset after the partial

input string   _al = "================ ALERTS & LOG ================"; // ----- Alerts -----
input bool     UseAlerts                = true;      // Popup alerts
input bool     UsePushNotifications     = false;     // Push notifications (MetaQuotes ID required)
input bool     UseSoundAlerts           = false;     // Sound alerts
input string   SoundFileName            = "alert.wav"; // Sound file
input bool     LogConditionMessages     = true;      // Log why entry conditions are not complete (on change)

input string   _vz = "================ CHART VISUALIZATION ================"; // ----- Visualization -----
input bool     ShowTrendlines           = true;      // S1 trendlines
input bool     ShowReferenceRange       = true;      // S2 reference candle High/Low
input bool     ShowFVGZones             = true;      // FVG rectangles
input bool     ShowLiquidityLevels      = true;      // Liquidity highs / lows
input bool     ShowStructureMarks       = true;      // BOS / MSS marks
input bool     ShowTradeLevels          = true;      // Entry / SL / TP lines of open trades
input bool     ShowSignalArrows         = true;      // Buy / Sell arrows
input bool     ShowStrategyLabels       = true;      // Strategy name on each signal
input bool     ShowChartComment         = true;      // Chart comment summary
input bool     DeleteObjectsOnExit      = true;      // Remove all EA objects when removed
input color    ClrBullish               = clrLimeGreen;   // Bullish color
input color    ClrBearish               = clrTomato;      // Bearish color
input color    ClrTrendline             = clrGold;        // Trendline color
input color    ClrRefRange              = clrDodgerBlue;  // Reference range color
input color    ClrFVGBull               = C'20,80,50';    // Bullish FVG fill
input color    ClrFVGBear               = C'95,30,30';    // Bearish FVG fill
input color    ClrLiquidity             = clrOrange;      // Liquidity level color
input color    ClrStructure             = clrAqua;        // BOS / MSS color
input color    ClrEntryLine             = clrDodgerBlue;  // Entry line color
input color    ClrSLLine                = clrRed;         // Stop loss line color
input color    ClrTPLine                = clrLime;        // Take profit line color

input string   _pn = "================ PANELS ================"; // ----- Panels -----
input bool     ShowTradePanel           = true;      // Show trade management panel
input int      TradePanelX              = 10;        // Trade panel X (pixels from left)
input int      TradePanelY              = 110;       // Trade panel Y (pixels from top)
input int      TradePanelWidth          = 260;       // Trade panel width
input bool     ShowPerformancePanel     = true;      // Show performance panel
input int      PerfPanelX               = 285;       // Performance panel X
input int      PerfPanelY               = 20;        // Performance panel Y
input int      PerfPanelWidth           = 470;       // Performance panel width
input int      PerfMaxTradeRows         = 6;         // Max open trades listed
input string   PanelFontName            = "Arial";   // Font name
input int      PanelFontSize            = 8;         // Font size
input int      ButtonHeight             = 20;        // Button height
input color    PanelBgColor             = C'22,26,34';   // Panel background
input color    PanelBorderColor         = C'70,80,100';  // Panel border
input color    PanelTitleColor          = clrWhite;      // Title text
input color    PanelTextColor           = C'200,205,215';// Normal text
input color    ButtonBgColor            = C'48,58,78';   // Button background
input color    ButtonTextColor          = clrWhite;      // Button text
input color    BuyButtonColor           = C'0,125,65';   // Buy buttons
input color    SellButtonColor          = C'175,35,35';  // Sell buttons
input color    ToggleOnColor            = C'0,110,90';   // Toggle ON
input color    ToggleOffColor           = C'85,85,95';   // Toggle OFF
input color    ClrProfit                = clrLime;       // Profit / buy text
input color    ClrLoss                  = clrRed;        // Loss / sell text
input color    ClrWarning               = clrYellow;     // Warnings
input color    ClrInfo                  = clrDeepSkyBlue;// Information
input double   DefaultPanelLot          = 0.01;      // Default lot in panel
input double   DefaultPanelSLPips       = 20.0;      // Default SL in panel (pips)
input double   DefaultPanelTPPips       = 40.0;      // Default TP in panel (pips)
input bool     ConfirmPanelActions      = true;      // Ask confirmation for close / emergency actions

//+------------------------------------------------------------------+
//| Constants                                                        |
//+------------------------------------------------------------------+
#define EA_NAME      "Three Strategy Smart Trading EA"
#define PFX          "TSSE_"
#define STRAT_COUNT  6
#define ST_S1        0   // original strategies
#define ST_S2        1
#define ST_S3        2
#define ST_N1        3   // new video strategy 1: Fibonacci 50%
#define ST_N2        4   // new video strategy 2: Liquidity sweep
#define ST_N3        5   // new video strategy 3: Volume profile
#define ST_MANUAL    6   // manual panel trades (not a strategy)

// Setup phases (S2 / S3)
#define PH_IDLE      0   // waiting for trigger (break / sweep)
#define PH_WAIT_BOS  1   // waiting for MSS / BOS
#define PH_WAIT_FVG  2   // waiting for a valid FVG
#define PH_WAIT_RET  3   // waiting for FVG retest + confirmation
#define PH_PENDING   4   // limit order placed at FVG

// Setup phases (S1)
#define S1_IDLE        0 // searching trendline + breakout
#define S1_WAIT_RETEST 1 // breakout done, waiting retest
#define S1_WAIT_CONF   2 // retest done, waiting confirmation

//+------------------------------------------------------------------+
//| Structures                                                       |
//+------------------------------------------------------------------+
// Strategy 1 setup state (one per direction)
struct TS1Setup
  {
   int      phase;
   datetime t1;          // older swing time (trendline anchor 1)
   double   p1;          // older swing price
   datetime t2;          // newer swing time (trendline anchor 2)
   double   p2;          // newer swing price
   datetime breakTime;   // breakout candle open time
   double   breakLevel;  // trendline value at breakout candle
   double   breakHigh;   // breakout candle high
   double   breakLow;    // breakout candle low
   datetime retestTime;  // retest candle time
   int      bars;        // bars spent in current phase
  };

// Strategy 2 / 3 FVG setup state (one per direction)
struct TFvgSetup
  {
   int      phase;
   datetime triggerTime;   // sweep / breakout candle time
   double   extreme;       // sweep extreme (lowest low for buy / highest high for sell)
   double   structLevel;   // structure level that must be broken (MSS/BOS)
   datetime structTime;    // time of that structure point
   datetime bosTime;       // candle that confirmed MSS/BOS
   double   fvgTop;
   double   fvgBottom;
   datetime fvgStart;      // time of first candle of the FVG
   datetime fvgEnd;        // time of third candle of the FVG
   string   liqName;       // liquidity name (S3)
   double   liqPrice;      // liquidity price (S3)
   int      bars;          // bars spent in current phase
   int      ticket;        // pending order ticket (limit mode)
  };

// Liquidity level
struct TLiq
  {
   double   price;
   int      shift;   // bar shift where the level was formed
   string   name;
  };

// FVG strategy parameters (filled per strategy)
struct TFvgParams
  {
   int      tf;
   double   minStructBreak;   // price distance
   int      maxBarsBOS;
   double   minFVG;           // price distance
   bool     requireDisp;
   int      maxBarsFVG;
   int      entryMode;
   double   entryPct;
   bool     requireConfirm;
   int      maxBarsRetest;
   double   invalidBeyond;    // price distance
   string   bosLabel;         // "MSS" or "BOS"
  };

//+------------------------------------------------------------------+
//| Global state                                                     |
//+------------------------------------------------------------------+
double    gPip = 0.0;                 // pip size in price
bool      gDrawUI = true;             // false in non-visual testing / optimization
bool      gAuto = true;               // auto trading switch (panel)
bool      gStratOn[STRAT_COUNT];      // strategy switches (panel)
bool      gTrailOn = false;           // trailing switch (panel)

// Strategy status (dashboard)
string    gState[STRAT_COUNT];        // Active / Inactive / Waiting / Signal Detected
string    gDetail[STRAT_COUNT];       // last condition message
string    gLastCond[STRAT_COUNT];     // last logged condition (to avoid log spam)
datetime  gSignalBar[STRAT_COUNT];    // bar time of last signal
datetime  gLastBar[STRAT_COUNT];      // new bar detection per strategy timeframe
string    gLastSignal = "none";
int       gLastSignalDir = 0;
int       gLastSignalStrat = -1;
bool      gShowObjs = true;                 // Hide/Show strategy objects button
bool      gEntryReady[STRAT_COUNT];         // setup in its final (entry) stage
int       gTradesOpened[STRAT_COUNT];       // trades opened in this session per strategy
int       gWinsS[STRAT_COUNT+1];            // closed wins per strategy (+ manual)
int       gLossS[STRAT_COUNT+1];            // closed losses per strategy (+ manual)
double    gPLS[STRAT_COUNT+1];              // closed P/L per strategy (+ manual)

// Diagnostics: why signals were (not) executed
int       gDiagSignals = 0;
int       gDiagOpened = 0;
string    gDiagKey[];
int       gDiagCnt[];
bool      gSpreadWarned = false;

void Diag(string reason)
  {
   int n = ArraySize(gDiagKey);
   for(int i=0; i<n; i++)
      if(gDiagKey[i]==reason)
        {
         gDiagCnt[i]++;
         return;
        }
   ArrayResize(gDiagKey, n+1);
   ArrayResize(gDiagCnt, n+1);
   gDiagKey[n] = reason;
   gDiagCnt[n] = 1;
  }

string DiagSummary()
  {
   string t = StringFormat("signals %d | opened %d", gDiagSignals, gDiagOpened);
   int n = ArraySize(gDiagKey);
   if(n>0)
      t += " | not opened:";
   for(int i=0; i<n; i++)
      t += " " + gDiagKey[i] + " x" + IntegerToString(gDiagCnt[i]) + (i<n-1 ? "," : "");
   return(t);
  }
datetime  gLastSignalTime = 0;

// Strategy setups
TS1Setup  gS1Buy, gS1Sell;
TFvgSetup gS2Buy, gS2Sell, gS3Buy, gS3Sell;

// Strategy 2 reference range
datetime  gS2RefTime = 0;
double    gS2RefHigh = 0.0, gS2RefLow = 0.0;
int       gS2RangeTrades = 0;

// Liquidity levels (S3, rebuilt each S3 bar)
TLiq      gLiqHigh[];   // buy-side liquidity (above highs)
TLiq      gLiqLow[];    // sell-side liquidity (below lows)

// Risk tracking
datetime  gDay = 0;
double    gDayStartEquity = 0.0;
double    gDayMaxDD = 0.0;
double    gPeakEquity = 0.0;
double    gMaxDDPct = 0.0;
bool      gRiskBlock = false;
string    gRiskMsg = "";
datetime  gRiskClosedDay = 0;
bool      gEmergencyStop = false;

// History cache
int       gHistCount = -1;
double    gTodayPL = 0.0, gTotalPL = 0.0;
int       gWins = 0, gLosses = 0;
datetime  gHistDay = 0;

// Partial close bookkeeping
int       gPartialDone[];

// Smart trailing bookkeeping (ticket -> last processed bar)
int       gSTTicket[];
datetime  gSTBar[];
datetime  gSTCleanDay = 0;

// Panel state
bool      gTradeMin = false;          // trade panel minimized
bool      gPerfVisible = true;        // performance panel visible
int       gUnit = UNIT_PIPS;          // SL/TP field unit
int       gPickMode = 0;              // 0 none, 1 entry, 2 SL, 3 TP
uint      gPickArm = 0;               // tick count when pick mode armed
bool      gLinesOn = false;           // draggable lines visible
string    gPanelMsg = "Ready";
color     gPanelMsgClr = clrWhite;
uint      gLastUI = 0;
int       gTradePanelH = 0;

//+------------------------------------------------------------------+
//| ================================================================ |
//| NEW VIDEO STRATEGIES  (N1 / N2 / N3)                             |
//| Independent modules. They reuse the EA's shared engine:         |
//| ExecuteSignal (filters, lot size, duplicate guard, order send), |
//| ManageOpenTrades (BE / trailing / partial), panels and alerts.  |
//|                                                                  |
//| N1  Fibonacci 50% + market structure confirmation                |
//|     VIDEO: a strong impulse leg is measured with Fibonacci from |
//|     its start (1) to its end (0). Price retraces to the 0.5     |
//|     level, ideally under the supply (or above the demand) base  |
//|     that launched the impulse. The trader does NOT sell on the  |
//|     touch - he waits for a rejection candle at 0.5, then sells  |
//|     with SL above that candle and TP near the 0 level (~1:2).   |
//|     CODE: FindImpulse() -> fib level/zone -> wait touch ->      |
//|     confirmation candle and/or micro structure break -> entry.  |
//|                                                                  |
//| N2  Liquidity sweep / false breakout                             |
//|     VIDEO: most traders buy at the equal lows / previous low    |
//|     where the "$$$$" (stop orders) sits and get stopped out.    |
//|     The real move starts AFTER price runs below that low        |
//|     (sweep) and comes back. Entry after the sweep, SL beyond    |
//|     the sweep extreme, target the opposite high.                |
//|     CODE: liquidity levels -> sweep -> classify (real breakout, |
//|     liquidity sweep, false breakout, structure break) ->        |
//|     reclaim and/or MSS -> market or retest entry.               |
//|                                                                  |
//| N3  Volume profile (VP)                                          |
//|     VIDEO: a fixed range volume profile is drawn from the start |
//|     of the trend to its end. When price comes back to the Point |
//|     of Control (red line) - best when a demand zone is at the   |
//|     same place - the trader buys, SL under the demand zone,     |
//|     takes part of the profit at the Value Area High (upper      |
//|     white line) and lets the rest run.                          |
//|     CODE: tick-volume profile with price bins (no native VP in  |
//|     MQL4) -> POC / VAH / VAL / HVN / LVN -> zone entry mode     |
//|     (touch / rejection / reclaim / retest) + confirmation ->    |
//|     partial at the VP target, rest to the final RR.             |
//+------------------------------------------------------------------+

// Pending signal of a new strategy (filled by CheckStrategyXSignal)
struct TNSignal
  {
   bool     ready;
   int      dir;
   datetime key;           // setup id for duplicate protection
   string   reason;
   double   zoneHi;
   double   zoneLo;
   double   extreme;       // sweep extreme / reaction extreme
   double   partialTarget; // price for the partial close (N3)
   double   entry;
   double   sl;
   double   tp;
  };

// N1 Fibonacci setup
struct TFibSetup
  {
   int      phase;        // 0 search impulse, 1 wait retracement, 2 wait confirmation
   int      dir;
   datetime tStart;
   datetime tEnd;
   double   pStart;       // fib 100 (impulse origin)
   double   pEnd;         // fib 0   (impulse end)
   double   level;        // fib level (50%)
   double   zoneHi;
   double   zoneLo;
   double   invalid;
   double   reactExtreme; // extreme of the reaction after the touch
   int      bars;
  };

// N2 sweep setup (one per direction)
struct TSweepSetup
  {
   int      phase;        // 0 idle, 1 swept - waiting trigger, 2 triggered - waiting entry
   double   level;
   string   name;
   double   extreme;
   datetime sweepTime;
   int      bars;
   int      closesBeyond;
   bool     reclaimed;
   bool     mss;
   double   mssLevel;
   datetime mssTime;
   string   cls;          // classification
  };

// N3 volume profile
struct TVProfile
  {
   bool     valid;
   datetime tStart;
   datetime tEnd;
   double   lo;
   double   hi;
   double   bin;
   int      bins;
   int      poc;
   double   pocPrice;
   double   vah;
   double   val;
   double   maxVol;
   int      dir;          // impulse direction (0 = none)
   datetime calcKey;      // id of the profile (used as setup key)
  };

// N3 retest arm (one per direction)
struct TVPArm
  {
   bool     armed;
   double   zoneHi;
   double   zoneLo;
   string   name;
   int      bars;
  };

TNSignal    gNSig[3];
TFibSetup   gFib;
datetime    gFibUsedKey = 0;
TSweepSetup gSwB, gSwS;
TLiq        gN2High[], gN2Low[];
TVProfile   gVP;
double      gVPVol[];
double      gVPHvn[], gVPHvnStr[], gVPLvn[];
datetime    gVPRefreshBar = 0;
bool        gVPForce = true;
TVPArm      gVPArmB, gVPArmS;

//+------------------------------------------------------------------+
//| Shared helpers for the new strategies                            |
//+------------------------------------------------------------------+
bool CanDraw() { return(gDrawUI && gShowObjs); }

int NIdx(int s) { return(s-ST_N1); }   // gNSig index

bool StrategyModeHas(int which)
  {
   int m = NewStrategyMode;
   if(which==1)
      return(m==STRATEGY_1_FIBONACCI_50 || m==STRATEGY_1_AND_2 || m==STRATEGY_1_AND_3 || m==ALL_STRATEGIES);
   if(which==2)
      return(m==STRATEGY_2_LIQUIDITY_SWEEP || m==STRATEGY_1_AND_2 || m==STRATEGY_2_AND_3 || m==ALL_STRATEGIES);
   return(m==STRATEGY_3_VOLUME_PROFILE || m==STRATEGY_1_AND_3 || m==STRATEGY_2_AND_3 || m==ALL_STRATEGIES);
  }

//--- micro structure break on closed candle 1: close beyond the high/low of candles 2..n+1
bool StructureBreak(int tf, int dir, int n)
  {
   if(n<1)
      return(false);
   if(dir>0)
      return(BarC(tf, 1)>BarH(tf, iHighest(Symbol(), tf, MODE_HIGH, n, 2)));
   return(BarC(tf, 1)<BarL(tf, iLowest(Symbol(), tf, MODE_LOW, n, 2)));
  }

//--- latest impulse leg: most recent confirmed swing and the opposite swing before it
bool FindImpulse(int tf, int str, int lookback, double minSize, double minATR, int maxBars, bool requireBOS,
                 int &dir, int &sShift, int &eShift, string &why)
  {
   int sh[], sl[];
   int nh = CollectSwings(tf, true, 1, lookback, str, sh, 8);
   int nl = CollectSwings(tf, false, 1, lookback, str, sl, 8);
   if(nh<1 || nl<1)
     {
      why = "not enough swings";
      return(false);
     }
   dir = (sh[0]<sl[0] ? 1 : -1);          // most recent swing high -> bullish leg (low -> high)
   eShift = (dir>0 ? sh[0] : sl[0]);
   sShift = -1;
   if(dir>0)
     {
      for(int i=0; i<nl; i++)
         if(sl[i]>eShift)
           {
            sShift = sl[i];
            break;
           }
     }
   else
     {
      for(int i=0; i<nh; i++)
         if(sh[i]>eShift)
           {
            sShift = sh[i];
            break;
           }
     }
   if(sShift<0)
     {
      why = "impulse origin swing not found";
      return(false);
     }
   double pS = (dir>0 ? BarL(tf, sShift) : BarH(tf, sShift));
   double pE = (dir>0 ? BarH(tf, eShift) : BarL(tf, eShift));
   double size = MathAbs(pE-pS);
   if(sShift-eShift>maxBars)
     {
      why = "impulse too slow (" + IntegerToString(sShift-eShift) + " bars)";
      return(false);
     }
   if(size<minSize)
     {
      why = StringFormat("impulse %.1f pips < minimum", size/gPip);
      return(false);
     }
   if(minATR>0)
     {
      double atr = iATR(Symbol(), tf, 14, eShift);
      if(atr>0 && size<atr*minATR)
        {
         why = StringFormat("impulse %.1f ATR < %.1f ATR", size/atr, minATR);
         return(false);
        }
     }
   if(requireBOS)
     {
      // a valid impulse breaks the previous swing in its direction
      int prev = -1;
      if(dir>0)
        {
         for(int j=0; j<nh; j++)
            if(sh[j]>sShift)
              {
               prev = sh[j];
               break;
              }
         if(prev<0 || BarH(tf, eShift)<=BarH(tf, prev))
           {
            why = "bullish impulse did not break the previous swing high";
            return(false);
           }
        }
      else
        {
         for(int j=0; j<nl; j++)
            if(sl[j]>sShift)
              {
               prev = sl[j];
               break;
              }
         if(prev<0 || BarL(tf, eShift)>=BarL(tf, prev))
           {
            why = "bearish impulse did not break the previous swing low";
            return(false);
           }
        }
     }
   // the impulse extreme must still be intact
   if(eShift>1)
     {
      if(dir>0 && BarH(tf, iHighest(Symbol(), tf, MODE_HIGH, eShift-1, 1))>pE)
        {
         why = "impulse extended - waiting new swing";
         return(false);
        }
      if(dir<0 && BarL(tf, iLowest(Symbol(), tf, MODE_LOW, eShift-1, 1))<pE)
        {
         why = "impulse extended - waiting new swing";
         return(false);
        }
     }
   return(true);
  }

bool ConfirmationOK(int mode, int tf, int dir, int candleType, double minBody, int structBars, string &what)
  {
   bool candle = IsConfirmCandle(tf, 1, dir, candleType, minBody);
   bool structure = StructureBreak(tf, dir, structBars);
   what = (candle ? ConfirmName(candleType) : "") + (candle && structure ? " + " : "") + (structure ? "structure break" : "");
   if(mode==NCONF_CANDLE)
      return(candle);
   if(mode==NCONF_STRUCTURE)
      return(structure);
   if(mode==NCONF_CANDLE_OR_STRUCTURE)
      return(candle || structure);
   if(mode==NCONF_CANDLE_AND_STRUCTURE)
      return(candle && structure);
   what = "touch (no confirmation)";
   return(true);
  }

//--- RR check helper: returns target if valid and RR >= minRR, else fixed RR target
double TargetOrRR(int dir, double entry, double sl, double target, double minRR, double rr, string who)
  {
   double risk = MathAbs(entry-sl);
   double rrTP = (dir>0 ? entry+risk*rr : entry-risk*rr);
   if(target>0 && risk>0 && ((dir>0 && target>entry) || (dir<0 && target<entry)) && MathAbs(target-entry)/risk>=minRR)
      return(NP(target));
   if(target>0)
      Log(who + ": structural TP RR < " + D2S(minRR) + " or wrong side - using fixed RR 1:" + D2S(rr, 1));
   return(NP(rrTP));
  }

void NDrawLine(string n, datetime t1, double p, datetime t2, color c, int style, int width, bool ray, string label)
  {
   if(!CanDraw())
      return;
   DrawTrend(n, t1, p, t2, p, c, style, width, ray);
   if(label!="")
      DrawTextObj(n + "_T", t2, p, label, c, ANCHOR_LEFT_LOWER, PanelFontSize-1);
  }

void NDrawRect(string n, datetime t1, double p1, datetime t2, double p2, color c)
  {
   if(!CanDraw())
      return;
   if(ObjectFind(0, n)<0)
     {
      if(!ObjectCreate(0, n, OBJ_RECTANGLE, 0, t1, p1, t2, p2))
         return;
     }
   else
     {
      ObjectMove(0, n, 0, t1, p1);
      ObjectMove(0, n, 1, t2, p2);
     }
   ObjectSetInteger(0, n, OBJPROP_COLOR, c);
   ObjectSetInteger(0, n, OBJPROP_BACK, true);
   ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, n, OBJPROP_HIDDEN, true);
  }

void NDrawArrow(string n, datetime t, double p, int dir, color c)
  {
   if(!CanDraw())
      return;
   if(ObjectFind(0, n)<0)
      ObjectCreate(0, n, OBJ_ARROW, 0, t, p);
   ObjectSetInteger(0, n, OBJPROP_ARROWCODE, dir>0 ? 233 : 234);
   ObjectSetInteger(0, n, OBJPROP_COLOR, c);
   ObjectSetInteger(0, n, OBJPROP_WIDTH, 2);
   ObjectSetInteger(0, n, OBJPROP_ANCHOR, dir>0 ? ANCHOR_TOP : ANCHOR_BOTTOM);
   ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, n, OBJPROP_HIDDEN, true);
  }

//--- generic process wrapper for N strategies (status + execution)
void NProcess(int s)
  {
   bool sig = false;
   if(s==ST_N1)
      sig = CheckStrategy1Signal();
   else
      if(s==ST_N2)
         sig = CheckStrategy2Signal();
      else
         sig = CheckStrategy3Signal();
   if(sig)
     {
      bool ok = false;
      if(s==ST_N1)
         ok = ExecuteStrategy1Trade();
      else
         if(s==ST_N2)
            ok = ExecuteStrategy2Trade();
         else
            ok = ExecuteStrategy3Trade();
      if(!ok && DebugMode)
         Log(StratShort(s) + ": signal was not executed (see previous messages)");
     }
   int tf = StratTF(s);
   if(gSignalBar[s]==BarT(tf, 1) && gSignalBar[s]!=0)
      gState[s] = "Signal Detected";
   else
      gState[s] = (gEntryReady[s] ? "Waiting" : "Active");
  }

//+------------------------------------------------------------------+
//| ================= N1: FIBONACCI 50% ============================ |
//+------------------------------------------------------------------+
void ResetFib()
  {
   gFib.phase = 0;
   gFib.dir = 0;
   gFib.tStart = 0;
   gFib.tEnd = 0;
   gFib.pStart = 0;
   gFib.pEnd = 0;
   gFib.level = 0;
   gFib.zoneHi = 0;
   gFib.zoneLo = 0;
   gFib.invalid = 0;
   gFib.reactExtreme = 0;
   gFib.bars = 0;
   gEntryReady[ST_N1] = false;
  }

void DrawFib()
  {
   if(!CanDraw() || gFib.tEnd==0)
      return;
   DeleteByPrefix(PFX+"STR1_FIB_");
   string n = PFX + "STR1_FIB_";
   datetime tR = iTime(Symbol(), Period(), 0) + PeriodSeconds(Period())*10;
   color c = (gFib.dir>0 ? ClrBullish : ClrBearish);
   double rng = gFib.pStart-gFib.pEnd;
   NDrawLine(n + "L100", gFib.tStart, gFib.pStart, tR, clrSilver, STYLE_DOT, 1, false, "FIB 100 (origin)");
   NDrawLine(n + "L618", gFib.tStart, gFib.pEnd+rng*0.618, tR, clrDimGray, STYLE_DOT, 1, false, "61.8");
   NDrawLine(n + "L382", gFib.tStart, gFib.pEnd+rng*0.382, tR, clrDimGray, STYLE_DOT, 1, false, "38.2");
   NDrawLine(n + "L0", gFib.tStart, gFib.pEnd, tR, clrSilver, STYLE_DOT, 1, false, "FIB 0 (impulse end)");
   NDrawLine(n + "LVL", gFib.tStart, gFib.level, tR, ClrTrendline, STYLE_SOLID, 2, false,
             "N1 FIB " + DoubleToString(N1_FibLevel, 1) + "%");
   DrawTrend(n + "IMP", gFib.tStart, gFib.pStart, gFib.tEnd, gFib.pEnd, c, STYLE_SOLID, 2, false);
   NDrawRect(n + "ZONE", gFib.tEnd, gFib.zoneHi, tR, gFib.zoneLo, gFib.dir>0 ? ClrFVGBull : ClrFVGBear);
  }

bool CheckStrategy1Signal()
  {
   int idx = NIdx(ST_N1);
   gNSig[idx].ready = false;
   int itf = TF(N1_ImpulseTimeframe);
   int ctf = StratTF(ST_N1);

   //--- phase 0: find a valid impulse and build the Fibonacci / reaction zone
   if(gFib.phase==0)
     {
      int dir = 0, s = -1, e = -1;
      string why = "";
      if(!FindImpulse(itf, N1_SwingStrength, N1_SwingLookback, Pips(N1_MinImpulsePips), N1_MinImpulseATR,
                      N1_MaxImpulseBars, N1_RequireImpulseBOS, dir, s, e, why))
        {
         SetCond(ST_N1, "REJECT: no valid impulse - " + why);
         return(false);
        }
      datetime key = BarT(itf, e);
      if(key==gFibUsedKey)
        {
         SetCond(ST_N1, "impulse already used - waiting for a new impulse");
         return(false);
        }
      if(!DirAllowed(dir))
        {
         SetCond(ST_N1, "REJECT: impulse direction not allowed (TradeDirection)");
         return(false);
        }
      gFib.dir = dir;
      gFib.tStart = BarT(itf, s);
      gFib.tEnd = key;
      gFib.pStart = (dir>0 ? BarL(itf, s) : BarH(itf, s));
      gFib.pEnd = (dir>0 ? BarH(itf, e) : BarL(itf, e));
      gFib.level = NP(gFib.pEnd+(gFib.pStart-gFib.pEnd)*N1_FibLevel/100.0);
      gFib.zoneHi = NP(gFib.level+Pips(N1_ZoneWidthPips));
      gFib.zoneLo = NP(gFib.level-Pips(N1_ZoneWidthPips));
      gFib.invalid = NP(gFib.pEnd+(gFib.pStart-gFib.pEnd)*N1_InvalidateFibLevel/100.0);
      if(N1_RequireOriginZone)
        {
         // supply (bearish impulse) / demand (bullish impulse) base = candles just before the origin
         int cnt = (int)MathMax(1, N1_OriginBaseBars);
         double baseEdge = (dir>0 ? BarH(itf, iHighest(Symbol(), itf, MODE_HIGH, cnt, s)) : BarL(itf, iLowest(Symbol(), itf, MODE_LOW, cnt, s)));
         bool overlap = (dir>0 ? gFib.zoneLo<=baseEdge : gFib.zoneHi>=baseEdge);
         if(!overlap)
           {
            gFibUsedKey = key;
            SetCond(ST_N1, "REJECT: fib level does not reach the origin supply/demand base");
            ResetFib();
            return(false);
           }
        }
      gFib.phase = 1;
      gFib.bars = 0;
      DrawFib();
      Log(StringFormat("N1 %s impulse %s -> %s (%.1f pips). Fib %.1f%% = %s, zone %s - %s. Waiting retracement.",
                       dir>0 ? "BULLISH" : "BEARISH", PriceStr(gFib.pStart), PriceStr(gFib.pEnd),
                       MathAbs(gFib.pEnd-gFib.pStart)/gPip, N1_FibLevel, PriceStr(gFib.level),
                       PriceStr(gFib.zoneLo), PriceStr(gFib.zoneHi)));
     }

   int dir = gFib.dir;
   double h1 = BarH(ctf, 1), l1 = BarL(ctf, 1), c1 = BarC(ctf, 1);
   gFib.bars++;
   DrawFib();

   // invalidation: retracement closed beyond the invalidation level (origin by default)
   if((dir>0 && c1<gFib.invalid) || (dir<0 && c1>gFib.invalid))
     {
      Log("N1: close beyond fib " + D2S(N1_InvalidateFibLevel, 1) + "% - setup invalid");
      gFibUsedKey = gFib.tEnd;
      ResetFib();
      SetCond(ST_N1, "REJECT: retracement too deep - setup cancelled");
      return(false);
     }

   //--- phase 1: wait for price to reach the reaction zone (no entry on the touch)
   if(gFib.phase==1)
     {
      if((dir>0 && h1>gFib.pEnd) || (dir<0 && l1<gFib.pEnd))
        {
         ResetFib();
         SetCond(ST_N1, "impulse extended before the retracement - waiting new swing");
         return(false);
        }
      if(gFib.bars>N1_MaxBarsForRetrace)
        {
         gFibUsedKey = gFib.tEnd;
         ResetFib();
         SetCond(ST_N1, "REJECT: no retracement within " + IntegerToString(N1_MaxBarsForRetrace) + " bars");
         return(false);
        }
      bool touched = (dir>0 ? l1<=gFib.zoneHi : h1>=gFib.zoneLo);
      if(!touched)
        {
         double dist = (dir>0 ? l1-gFib.zoneHi : gFib.zoneLo-h1)/gPip;
         SetCond(ST_N1, StringFormat("WAITING: %s impulse, price %.1f pips from the %.1f%% zone [%s - %s]",
                                     dir>0 ? "bullish" : "bearish", dist, N1_FibLevel, PriceStr(gFib.zoneLo), PriceStr(gFib.zoneHi)));
         return(false);
        }
      gFib.phase = 2;
      gFib.bars = 0;
      gFib.reactExtreme = (dir>0 ? l1 : h1);
      Log("N1: price reached the " + D2S(N1_FibLevel, 1) + "% reaction zone - waiting confirmation (no entry on touch)");
     }

   //--- phase 2: confirmation candle and/or structure break
   gEntryReady[ST_N1] = true;
   if(dir>0 && l1<gFib.reactExtreme)
      gFib.reactExtreme = l1;
   if(dir<0 && h1>gFib.reactExtreme)
      gFib.reactExtreme = h1;
   if(gFib.bars>N1_MaxBarsForConfirm)
     {
      gFibUsedKey = gFib.tEnd;
      ResetFib();
      SetCond(ST_N1, "REJECT: no confirmation within " + IntegerToString(N1_MaxBarsForConfirm) + " bars");
      return(false);
     }
   string what = "";
   bool conf = ConfirmationOK(N1_ConfirmType, ctf, dir, N1_CandleType, N1_ConfirmMinBodyRatio, N1_StructureBars, what);
   bool sideOk = (dir>0 ? c1>gFib.zoneLo : c1<gFib.zoneHi);
   if(!conf || !sideOk)
     {
      SetCond(ST_N1, "ENTRY READY: in the fib zone, waiting " + (sideOk ? "confirmation" : "close back out of the zone"));
      return(false);
     }
   double dist = MathAbs(c1-gFib.level)/gPip;
   if(dist>N1_MaxEntryDistancePips)
     {
      SetCond(ST_N1, StringFormat("REJECT: confirmation close %.1f pips from the fib level (max %.1f)", dist, N1_MaxEntryDistancePips));
      return(false);
     }
   gNSig[idx].ready = true;
   gNSig[idx].dir = dir;
   gNSig[idx].key = gFib.tEnd;
   gNSig[idx].zoneHi = gFib.zoneHi;
   gNSig[idx].zoneLo = gFib.zoneLo;
   gNSig[idx].extreme = gFib.reactExtreme;
   gNSig[idx].partialTarget = 0;
   gNSig[idx].reason = StringFormat("Fib %.1f%% retracement + %s", N1_FibLevel, what);
   SetCond(ST_N1, "SIGNAL ACCEPTED: " + gNSig[idx].reason);
   return(true);
  }

double CalculateStrategy1StopLoss()
  {
   int k = NIdx(ST_N1);
   int ctf = StratTF(ST_N1);
   double buf = N1_SLBufferPoints*Point;
   double sl;
   if(N1_SLMode==N1_SL_ATR)
     {
      double atr = GetATR(ctf, N1_ATRPeriod);
      sl = (gNSig[k].dir>0 ? gNSig[k].entry-atr*N1_ATRMultiplierSL : gNSig[k].entry+atr*N1_ATRMultiplierSL);
     }
   else
      if(N1_SLMode==N1_SL_CONFIRM_CANDLE)
         sl = (gNSig[k].dir>0 ? MathMin(BarL(ctf, 1), gNSig[k].extreme)-buf : MathMax(BarH(ctf, 1), gNSig[k].extreme)+buf);
      else
         if(N1_SLMode==N1_SL_SWING)
           {
            int s = FindSwing(ctf, gNSig[k].dir<0, 1, 30, 2);
            sl = (s>0 ? (gNSig[k].dir>0 ? BarL(ctf, s)-buf : BarH(ctf, s)+buf) : 0);
            if(sl<=0 || (gNSig[k].dir>0 && sl>=gNSig[k].entry) || (gNSig[k].dir<0 && sl<=gNSig[k].entry))
               sl = (gNSig[k].dir>0 ? MathMin(gNSig[k].zoneLo, gNSig[k].extreme)-buf : MathMax(gNSig[k].zoneHi, gNSig[k].extreme)+buf);
           }
         else
            sl = (gNSig[k].dir>0 ? MathMin(gNSig[k].zoneLo, gNSig[k].extreme)-buf : MathMax(gNSig[k].zoneHi, gNSig[k].extreme)+buf);
   return(NP(sl));
  }

double CalculateStrategy1TakeProfit()
  {
   int k = NIdx(ST_N1);
   double target = 0;
   if(N1_TPMode==N1_TP_IMPULSE_END)
      target = gFib.pEnd;
   else
      if(N1_TPMode==N1_TP_LIQUIDITY)
         target = LiquidityTarget(TF(N1_ImpulseTimeframe), gNSig[k].dir, gNSig[k].entry, N1_SwingLookback, N1_SwingStrength);
      else
         if(N1_TPMode==N1_TP_MANUAL)
            target = PanelManualTP(gNSig[k].dir, gNSig[k].entry);
   if(N1_TPMode==N1_TP_RR)
      return(TargetOrRR(gNSig[k].dir, gNSig[k].entry, gNSig[k].sl, 0, 0, N1_RiskReward, "N1"));
   return(TargetOrRR(gNSig[k].dir, gNSig[k].entry, gNSig[k].sl, target, N1_MinRR, N1_RiskReward, "N1"));
  }

bool ExecuteStrategy1Trade()
  {
   int idx = NIdx(ST_N1);
   if(!gNSig[idx].ready)
      return(false);
   RefreshRates();
   gNSig[idx].entry = (gNSig[idx].dir>0 ? Ask : Bid);
   gNSig[idx].sl = CalculateStrategy1StopLoss();
   gNSig[idx].tp = CalculateStrategy1TakeProfit();
   int res = ExecuteSignal(ST_N1, gNSig[idx].dir, gNSig[idx].entry, gNSig[idx].sl, gNSig[idx].tp,
                           gNSig[idx].reason, gNSig[idx].key, false);
   gNSig[idx].ready = false;
   if(res!=0)
     {
      gFibUsedKey = gFib.tEnd;
      ResetFib();
     }
   return(res>0);
  }

//+------------------------------------------------------------------+
//| ================= N2: LIQUIDITY SWEEP ========================== |
//+------------------------------------------------------------------+
void ResetSweep(TSweepSetup &st)
  {
   st.phase = 0;
   st.level = 0;
   st.name = "";
   st.extreme = 0;
   st.sweepTime = 0;
   st.bars = 0;
   st.closesBeyond = 0;
   st.reclaimed = false;
   st.mss = false;
   st.mssLevel = 0;
   st.mssTime = 0;
   st.cls = "";
  }

void N2BuildLiquidity(int tf)
  {
   bool fractal = (N2_SwingMethod==SWING_FRACTAL);
   BuildLiquidity(tf, N2_LiquidityLookback, N2_SwingStrength, N2_UseEqualHighsLows, Pips(N2_EqualTolerancePips),
                  N2_UsePreviousSwing && fractal, false, N2_UsePreviousDayHL, N2_UseAsianSessionHL,
                  N2_UseLondonSessionHL, N2_UseNewYorkSessionHL, gN2High, gN2Low);
   if(!fractal && N2_UsePreviousSwing)
     {
      // highest high / lowest low of the lookback window (excluding the last 2 candles)
      int cnt = (int)MathMax(3, N2_LiquidityLookback-3);
      int hs = iHighest(Symbol(), tf, MODE_HIGH, cnt, 3);
      int ls = iLowest(Symbol(), tf, MODE_LOW, cnt, 3);
      if(hs>0 && LiqIntact(tf, true, BarH(tf, hs), hs))
         AddLiq(gN2High, BarH(tf, hs), hs, "RANGE H");
      if(ls>0 && LiqIntact(tf, false, BarL(tf, ls), ls))
         AddLiq(gN2Low, BarL(tf, ls), ls, "RANGE L");
     }
   // drawing
   if(!CanDraw())
      return;
   DeleteByPrefix(PFX+"STR2_LIQ_");
   datetime tEnd = BarT(tf, 0);
   for(int i=0; i<ArraySize(gN2High); i++)
      NDrawLine(PFX+"STR2_LIQ_H"+IntegerToString(i), BarT(tf, gN2High[i].shift), gN2High[i].price, tEnd,
                clrKhaki, STYLE_DASHDOT, 1, false, "N2 $ " + gN2High[i].name);
   for(int i=0; i<ArraySize(gN2Low); i++)
      NDrawLine(PFX+"STR2_LIQ_L"+IntegerToString(i), BarT(tf, gN2Low[i].shift), gN2Low[i].price, tEnd,
                clrKhaki, STYLE_DASHDOT, 1, false, "N2 $ " + gN2Low[i].name);
  }

//--- one direction of N2. Returns true when an entry signal is ready.
bool N2Step(TSweepSetup &st, int dir, int tf, string &msg)
  {
   if(!DirAllowed(dir))
     {
      msg = "direction disabled";
      return(false);
     }
   double h1 = BarH(tf, 1), l1 = BarL(tf, 1), c1 = BarC(tf, 1);
   string tag = (dir>0 ? "B" : "S");

   //--- phase 0: detect a sweep of liquidity
   if(st.phase==0)
     {
      int n = (dir>0 ? ArraySize(gN2Low) : ArraySize(gN2High));
      bool found = false;
      for(int i=0; i<n && !found; i++)
        {
         double lv = (dir>0 ? gN2Low[i].price : gN2High[i].price);
         bool sweep = (dir>0 ? l1<lv-Pips(N2_MinSweepPips) : h1>lv+Pips(N2_MinSweepPips));
         if(!sweep)
            continue;
         found = true;
         st.phase = 1;
         st.level = lv;
         st.name = (dir>0 ? gN2Low[i].name : gN2High[i].name);
         st.extreme = (dir>0 ? l1 : h1);
         st.sweepTime = BarT(tf, 1);
         st.bars = 0;
         bool beyond = (dir>0 ? c1<lv : c1>lv);
         st.closesBeyond = (beyond ? 1 : 0);
         st.reclaimed = !beyond;
         st.mss = false;
         int ms = FindSwing(tf, dir>0, 2, N2_MSSLookback, N2_SwingStrength);
         if(ms<0)
            ms = (dir>0 ? iHighest(Symbol(), tf, MODE_HIGH, N2_MSSLookback, 2) : iLowest(Symbol(), tf, MODE_LOW, N2_MSSLookback, 2));
         st.mssLevel = (dir>0 ? BarH(tf, ms) : BarL(tf, ms));
         st.mssTime = BarT(tf, ms);
         NDrawArrow(PFX+"STR2_SWP_"+tag+IntegerToString((int)st.sweepTime), st.sweepTime, st.extreme, dir,
                    dir>0 ? ClrBullish : ClrBearish);
         if(CanDraw())
            DrawTextObj(PFX+"STR2_SWP_"+tag+IntegerToString((int)st.sweepTime)+"_T", st.sweepTime, st.extreme,
                        "N2 SWEEP " + st.name, ClrLiquidity, dir>0 ? ANCHOR_UPPER : ANCHOR_LOWER, PanelFontSize-1);
         Log(StringFormat("N2 %s: %s @%s swept (extreme %s, candle %s)", DirStr(dir), st.name, PriceStr(lv),
                          PriceStr(st.extreme), beyond ? "closed BEYOND the level" : "closed back INSIDE (wick sweep)"));
        }
      if(!found)
        {
         msg = "waiting sweep of " + IntegerToString(n) + (dir>0 ? " sell-side" : " buy-side") + " level(s)";
         return(false);
        }
     }
   else
     {
      //--- update the sweep on later candles
      st.bars++;
      if(dir>0 && l1<st.extreme)
         st.extreme = l1;
      if(dir<0 && h1>st.extreme)
         st.extreme = h1;
      bool beyond = (dir>0 ? c1<st.level : c1>st.level);
      if(st.phase==1)
        {
         if(beyond && !st.reclaimed)
            st.closesBeyond++;
         else
            if(beyond && st.reclaimed)
              {
               Log("N2 " + DirStr(dir) + ": reclaim failed (closed beyond the level again) - cancelled");
               ResetSweep(st);
               msg = "REJECT: reclaim failed";
               return(false);
              }
            else
               st.reclaimed = true;
        }
      if(st.bars>N2_SignalExpiryBars)
        {
         ResetSweep(st);
         msg = "REJECT: signal expired (" + IntegerToString(N2_SignalExpiryBars) + " bars after sweep)";
         return(false);
        }
      if(st.phase==2 && ((dir>0 && c1<st.extreme) || (dir<0 && c1>st.extreme)))
        {
         ResetSweep(st);
         msg = "REJECT: closed beyond the sweep extreme - real breakout";
         return(false);
        }
     }

   //--- classification: real breakout vs sweep / false breakout
   if(st.phase==1)
     {
      if(!st.reclaimed && st.closesBeyond>=N2_RealBreakoutCloses)
        {
         Log(StringFormat("N2 %s: REAL BREAKOUT of %s (%d closes beyond) - no trade", DirStr(dir), st.name, st.closesBeyond));
         ResetSweep(st);
         msg = "REJECT: real breakout (closes beyond the level)";
         return(false);
        }
      bool needReclaim = (N2_TriggerMode==N2_RECLAIM || N2_TriggerMode==N2_RECLAIM_AND_MSS);
      if(needReclaim && !st.reclaimed && st.bars>=N2_ReclaimBars)
        {
         ResetSweep(st);
         msg = "REJECT: no close back inside within " + IntegerToString(N2_ReclaimBars) + " candles";
         return(false);
        }
      if(!st.mss && (dir>0 ? c1>st.mssLevel+Pips(N2_MSSMinBreakPips) : c1<st.mssLevel-Pips(N2_MSSMinBreakPips)))
        {
         st.mss = true;
         if(CanDraw())
            DrawStructure(PFX+"STR2_MSS_"+tag+IntegerToString((int)st.sweepTime), st.mssTime, BarT(tf, 1), st.mssLevel, "N2 MSS");
        }
      bool trig = false;
      if(N2_TriggerMode==N2_RECLAIM)
         trig = st.reclaimed;
      else
         if(N2_TriggerMode==N2_MSS)
            trig = st.mss;
         else
            if(N2_TriggerMode==N2_RECLAIM_OR_MSS)
               trig = st.reclaimed || st.mss;
            else
               trig = st.reclaimed && st.mss;
      if(!trig)
        {
         msg = StringFormat("swept %s - waiting %s (%d/%d)", st.name,
                            N2_TriggerMode==N2_MSS ? "MSS" : (N2_TriggerMode==N2_RECLAIM ? "close back inside" : "reclaim/MSS"),
                            st.bars, N2_SignalExpiryBars);
         return(false);
        }
      st.cls = (st.closesBeyond>0 ? "FALSE BREAKOUT" : "LIQUIDITY SWEEP");
      if(st.mss)
         st.cls += " + VALID STRUCTURE BREAK";
      st.phase = 2;
      Log("N2 " + DirStr(dir) + ": " + st.cls + " confirmed at " + st.name);
     }

   //--- phase 2: entry (market or retest) + confirmation candle
   if(st.phase==2)
     {
      if(N2_EntryMode==N2_ENTRY_RETEST)
        {
         bool retest = (dir>0 ? l1<=st.level+Pips(N2_RetestTolerancePips) && c1>st.level
                        : h1>=st.level-Pips(N2_RetestTolerancePips) && c1<st.level);
         if(!retest)
           {
            msg = st.cls + " - ENTRY READY, waiting retest of " + PriceStr(st.level);
            return(false);
           }
        }
      if(N2_RequireConfirmCandle && !IsConfirmCandle(tf, 1, dir, N2_CandleType, N2_ConfirmMinBodyRatio))
        {
         msg = st.cls + " - ENTRY READY, waiting confirmation candle";
         return(false);
        }
      int idx = NIdx(ST_N2);
      gNSig[idx].ready = true;
      gNSig[idx].dir = dir;
      gNSig[idx].key = st.sweepTime;
      gNSig[idx].extreme = st.extreme;
      gNSig[idx].zoneHi = st.level;
      gNSig[idx].zoneLo = st.level;
      gNSig[idx].partialTarget = 0;
      gNSig[idx].reason = st.cls + " of " + st.name;
      msg = "SIGNAL ACCEPTED: " + gNSig[idx].reason;
      return(true);
     }
   msg = "idle";
   return(false);
  }

bool CheckStrategy2Signal()
  {
   int idx = NIdx(ST_N2);
   gNSig[idx].ready = false;
   int tf = StratTF(ST_N2);
   N2BuildLiquidity(tf);
   string mb = "", ms = "";
   bool sb = N2Step(gSwB, 1, tf, mb);
   bool ss = false;
   if(!sb)
      ss = N2Step(gSwS, -1, tf, ms);
   else
      ms = "(buy signal has priority this bar)";
   gEntryReady[ST_N2] = (gSwB.phase==2 || gSwS.phase==2);
   SetCond(ST_N2, "BUY: " + mb + " | SELL: " + ms);
   return(sb || ss);
  }

double CalculateStrategy2StopLoss()
  {
   int k = NIdx(ST_N2);
   int tf = StratTF(ST_N2);
   double buf = Pips(N2_SLBufferPips);
   double sl;
   if(N2_SLMode==N2_SL_ATR)
     {
      double atr = GetATR(tf, N2_ATRPeriod);
      sl = (gNSig[k].dir>0 ? gNSig[k].entry-atr*N2_ATRMultiplierSL : gNSig[k].entry+atr*N2_ATRMultiplierSL);
     }
   else
      if(N2_SLMode==N2_SL_SWING)
        {
         int s = FindSwing(tf, gNSig[k].dir<0, 1, 30, N2_SwingStrength);
         sl = (s>0 ? (gNSig[k].dir>0 ? BarL(tf, s)-buf : BarH(tf, s)+buf) : 0);
         if(sl<=0 || (gNSig[k].dir>0 && sl>=gNSig[k].entry) || (gNSig[k].dir<0 && sl<=gNSig[k].entry))
            sl = (gNSig[k].dir>0 ? gNSig[k].extreme-buf : gNSig[k].extreme+buf);
        }
      else
         sl = (gNSig[k].dir>0 ? gNSig[k].extreme-buf : gNSig[k].extreme+buf);
   return(NP(sl));
  }

double CalculateStrategy2TakeProfit()
  {
   int k = NIdx(ST_N2);
   int tf = StratTF(ST_N2);
   double risk = MathAbs(gNSig[k].entry-gNSig[k].sl);
   if(N2_TPMode==N2_TP_PARTIAL)
      return(NP(gNSig[k].dir>0 ? gNSig[k].entry+risk*N2_FinalRR : gNSig[k].entry-risk*N2_FinalRR));
   if(N2_TPMode==N2_TP_RR)
      return(TargetOrRR(gNSig[k].dir, gNSig[k].entry, gNSig[k].sl, 0, 0, N2_RiskReward, "N2"));
   double target = 0;
   if(N2_TPMode==N2_TP_OPPOSITE_LIQ)
     {
      if(gNSig[k].dir>0)
        {
         for(int i=0; i<ArraySize(gN2High); i++)
            if(gN2High[i].price>gNSig[k].entry && (target==0 || gN2High[i].price<target))
               target = gN2High[i].price;
        }
      else
        {
         for(int i=0; i<ArraySize(gN2Low); i++)
            if(gN2Low[i].price<gNSig[k].entry && (target==0 || gN2Low[i].price>target))
               target = gN2Low[i].price;
        }
     }
   else
     {
      int s = FindSwing(tf, gNSig[k].dir>0, 1, N2_LiquidityLookback, N2_SwingStrength);
      if(s>0)
         target = (gNSig[k].dir>0 ? BarH(tf, s) : BarL(tf, s));
     }
   return(TargetOrRR(gNSig[k].dir, gNSig[k].entry, gNSig[k].sl, target, N2_MinRR, N2_RiskReward, "N2"));
  }

bool ExecuteStrategy2Trade()
  {
   int idx = NIdx(ST_N2);
   if(!gNSig[idx].ready)
      return(false);
   RefreshRates();
   gNSig[idx].entry = (gNSig[idx].dir>0 ? Ask : Bid);
   gNSig[idx].sl = CalculateStrategy2StopLoss();
   gNSig[idx].tp = CalculateStrategy2TakeProfit();
   int res = ExecuteSignal(ST_N2, gNSig[idx].dir, gNSig[idx].entry, gNSig[idx].sl, gNSig[idx].tp,
                           gNSig[idx].reason, gNSig[idx].key, false);
   gNSig[idx].ready = false;
   if(res!=0)
     {
      if(gNSig[idx].dir>0)
         ResetSweep(gSwB);
      else
         ResetSweep(gSwS);
     }
   return(res>0);
  }

//+------------------------------------------------------------------+
//| ================= N3: VOLUME PROFILE =========================== |
//+------------------------------------------------------------------+
void ResetVP()
  {
   gVP.valid = false;
   gVP.tStart = 0;
   gVP.tEnd = 0;
   gVP.lo = 0;
   gVP.hi = 0;
   gVP.bin = 0;
   gVP.bins = 0;
   gVP.poc = -1;
   gVP.pocPrice = 0;
   gVP.vah = 0;
   gVP.val = 0;
   gVP.maxVol = 0;
   gVP.dir = 0;
   gVP.calcKey = 0;
   gVPArmB.armed = false;
   gVPArmS.armed = false;
   gVPForce = true;
  }

//--- range of the profile (bar shifts on the profile timeframe). Returns false if unavailable.
bool N3ProfileRange(int ptf, int &sShift, int &eShift, int &dir, datetime &key, string &why)
  {
   dir = 0;
   if(N3_ProfileSource==VP_LAST_IMPULSE)
     {
      if(!FindImpulse(ptf, N3_SwingStrength, N3_LookbackBars, Pips(N3_MinImpulsePips), 0, N3_MaxImpulseBars, false,
                      dir, sShift, eShift, why))
         return(false);
      key = BarT(ptf, eShift);
      return(true);
     }
   if(N3_ProfileSource==VP_PREVIOUS_DAY)
     {
      datetime d0 = iTime(Symbol(), PERIOD_D1, 0), d1 = iTime(Symbol(), PERIOD_D1, 1);
      if(d0==0 || d1==0)
        {
         why = "no D1 data";
         return(false);
        }
      sShift = iBarShift(Symbol(), ptf, d1, false);
      eShift = iBarShift(Symbol(), ptf, d0, false)+1;
      if(BarT(ptf, eShift-1)<d0)
         eShift--;
      key = d1;
      if(sShift<eShift || eShift<1)
        {
         why = "previous day bars not found";
         return(false);
        }
      return(true);
     }
   sShift = (int)MathMax(10, N3_LookbackBars);
   eShift = 1;
   key = iTime(Symbol(), N3_RefreshPeriod, 0);
   return(true);
  }

bool N3NeedRefresh(int ptf)
  {
   if(gVPForce || N3_AutoRefresh || !gVP.valid)
      return(true);
   if(N3_ProfileSource==VP_LAST_IMPULSE)
     {
      int d = 0, s = 0, e = 0;
      string why = "";
      if(FindImpulse(ptf, N3_SwingStrength, N3_LookbackBars, Pips(N3_MinImpulsePips), 0, N3_MaxImpulseBars, false, d, s, e, why))
         return(BarT(ptf, e)!=gVP.calcKey);
      return(false);
     }
   if(N3_ProfileSource==VP_PREVIOUS_DAY)
      return(iTime(Symbol(), PERIOD_D1, 1)!=gVP.calcKey);
   return(iTime(Symbol(), N3_RefreshPeriod, 0)!=gVP.calcKey);
  }

//--- build the tick-volume profile: POC, value area, HVN, LVN
bool N3Calculate(int ptf, string &why)
  {
   int s = 0, e = 0, dir = 0;
   datetime key = 0;
   if(!N3ProfileRange(ptf, s, e, dir, key, why))
      return(false);
   int bins = (int)MathMax(5, N3_Bins);
   double hi = BarH(ptf, iHighest(Symbol(), ptf, MODE_HIGH, s-e+1, e));
   double lo = BarL(ptf, iLowest(Symbol(), ptf, MODE_LOW, s-e+1, e));
   if(hi-lo<=Point*bins)
     {
      why = "profile range too small";
      return(false);
     }
   double bin = (hi-lo)/bins;
   ArrayResize(gVPVol, bins);
   ArrayInitialize(gVPVol, 0.0);
   double total = 0;
   for(int k=e; k<=s; k++)
     {
      double h = BarH(ptf, k), l = BarL(ptf, k);
      double v = (double)iVolume(Symbol(), ptf, k);
      if(v<=0)
         continue;
      total += v;
      if(h-l<Point)
        {
         int b0 = (int)MathMin(bins-1, MathMax(0, MathFloor((BarC(ptf, k)-lo)/bin)));
         gVPVol[b0] += v;
         continue;
        }
      // distribute the candle volume over the bins it covers (uniform distribution)
      int bFrom = (int)MathMax(0, MathFloor((l-lo)/bin));
      int bTo = (int)MathMin(bins-1, MathFloor((h-lo)/bin));
      for(int b=bFrom; b<=bTo; b++)
        {
         double bLo = lo+b*bin, bHi = bLo+bin;
         double ov = MathMin(h, bHi)-MathMax(l, bLo);
         if(ov>0)
            gVPVol[b] += v*ov/(h-l);
        }
     }
   if(total<=0)
     {
      why = "no tick volume";
      return(false);
     }
   // POC
   int poc = 0;
   for(int b=1; b<bins; b++)
      if(gVPVol[b]>gVPVol[poc])
         poc = b;
   double maxV = gVPVol[poc];
   // Value area: expand from the POC toward the larger neighbour until VA% of volume is covered
   double target = total*N3_ValueAreaPct/100.0, acc = gVPVol[poc];
   int up = poc, dn = poc;
   while(acc<target && (up<bins-1 || dn>0))
     {
      double vu = (up<bins-1 ? gVPVol[up+1] : -1);
      double vd = (dn>0 ? gVPVol[dn-1] : -1);
      if(vu>=vd)
        {
         up++;
         acc += vu;
        }
      else
        {
         dn--;
         acc += vd;
        }
     }
   // HVN / LVN (local extremes of the histogram)
   ArrayResize(gVPHvn, 0);
   ArrayResize(gVPHvnStr, 0);
   ArrayResize(gVPLvn, 0);
   for(int b=1; b<bins-1; b++)
     {
      double v = gVPVol[b];
      if(b!=poc && v>=gVPVol[b-1] && v>=gVPVol[b+1] && v>=maxV*N3_HVNThresholdPct/100.0)
        {
         int n = ArraySize(gVPHvn);
         ArrayResize(gVPHvn, n+1);
         ArrayResize(gVPHvnStr, n+1);
         gVPHvn[n] = lo+(b+0.5)*bin;
         gVPHvnStr[n] = v/maxV*100.0;
        }
      if(v<=gVPVol[b-1] && v<=gVPVol[b+1] && v<=maxV*N3_LVNThresholdPct/100.0)
        {
         int n = ArraySize(gVPLvn);
         ArrayResize(gVPLvn, n+1);
         gVPLvn[n] = lo+(b+0.5)*bin;
        }
     }
   gVP.valid = true;
   gVP.tStart = BarT(ptf, s);
   gVP.tEnd = BarT(ptf, e);
   gVP.lo = lo;
   gVP.hi = hi;
   gVP.bin = bin;
   gVP.bins = bins;
   gVP.poc = poc;
   gVP.pocPrice = NP(lo+(poc+0.5)*bin);
   gVP.vah = NP(lo+(up+1)*bin);
   gVP.val = NP(lo+dn*bin);
   gVP.maxVol = maxV;
   gVP.dir = dir;
   gVP.calcKey = key;
   gVPArmB.armed = false;
   gVPArmS.armed = false;
   gVPForce = false;
   Log(StringFormat("N3 profile %s -> %s (%d bars, %d bins): POC %s VAH %s VAL %s | HVN %d LVN %d | impulse %s",
                    TimeToString(gVP.tStart), TimeToString(gVP.tEnd), s-e+1, bins, PriceStr(gVP.pocPrice),
                    PriceStr(gVP.vah), PriceStr(gVP.val), ArraySize(gVPHvn), ArraySize(gVPLvn),
                    dir>0 ? "UP" : (dir<0 ? "DOWN" : "n/a")));
   DrawVP(ptf);
   return(true);
  }

void DrawVP(int ptf)
  {
   DeleteByPrefix(PFX+"STR3_VP_");
   if(!CanDraw() || !gVP.valid)
      return;
   string n = PFX+"STR3_VP_";
   datetime tR = iTime(Symbol(), Period(), 0) + PeriodSeconds(Period())*15;
   NDrawRect(n+"BOX", gVP.tStart, gVP.hi, gVP.tEnd, gVP.lo, C'25,30,45');
   NDrawLine(n+"POC", gVP.tStart, gVP.pocPrice, tR, clrRed, STYLE_SOLID, 2, false, "N3 POC");
   NDrawLine(n+"VAH", gVP.tStart, gVP.vah, tR, clrWhite, STYLE_SOLID, 1, false, "N3 VAH");
   NDrawLine(n+"VAL", gVP.tStart, gVP.val, tR, clrWhite, STYLE_SOLID, 1, false, "N3 VAL");
   for(int i=0; i<ArraySize(gVPHvn); i++)
      NDrawRect(n+"HVN"+IntegerToString(i), gVP.tStart, gVPHvn[i]+gVP.bin/2, tR, gVPHvn[i]-gVP.bin/2, C'20,50,110');
   for(int i=0; i<ArraySize(gVPLvn); i++)
      NDrawLine(n+"LVN"+IntegerToString(i), gVP.tStart, gVPLvn[i], tR, clrGold, STYLE_DOT, 1, false, "LVN");
   if(N3_DrawHistogram && gVP.maxVol>0)
     {
      int ps = PeriodSeconds(Period());
      for(int b=0; b<gVP.bins; b++)
        {
         if(gVPVol[b]<=0)
            continue;
         int w = (int)MathMax(1, MathRound(gVPVol[b]/gVP.maxVol*N3_HistogramWidthBars));
         double pLo = gVP.lo+b*gVP.bin, pHi = pLo+gVP.bin*0.9;
         bool inVA = (pLo>=gVP.val-Point && pHi<=gVP.vah+Point);
         NDrawRect(n+"H"+IntegerToString(b), gVP.tStart, pHi, gVP.tStart+w*ps, pLo,
                   b==gVP.poc ? C'170,40,40' : (inVA ? C'40,70,150' : C'70,40,90'));
        }
     }
  }

//--- VP zones for entries
int N3Zones(double &zHi[], double &zLo[], string &zName[])
  {
   ArrayResize(zHi, 0);
   ArrayResize(zLo, 0);
   ArrayResize(zName, 0);
   double hw = (N3_ZoneWidthPips>0 ? Pips(N3_ZoneWidthPips) : gVP.bin/2.0);
   int n = 0;
   if(N3_TradePOC)
     {
      ArrayResize(zHi, n+1);
      ArrayResize(zLo, n+1);
      ArrayResize(zName, n+1);
      zHi[n] = gVP.pocPrice+hw;
      zLo[n] = gVP.pocPrice-hw;
      zName[n] = "POC";
      n++;
     }
   if(N3_TradeVAHVAL)
     {
      ArrayResize(zHi, n+2);
      ArrayResize(zLo, n+2);
      ArrayResize(zName, n+2);
      zHi[n] = gVP.vah+hw;
      zLo[n] = gVP.vah-hw;
      zName[n] = "VAH";
      zHi[n+1] = gVP.val+hw;
      zLo[n+1] = gVP.val-hw;
      zName[n+1] = "VAL";
      n += 2;
     }
   if(N3_TradeHVN)
      for(int i=0; i<ArraySize(gVPHvn); i++)
        {
         if(gVPHvnStr[i]<N3_MinZoneStrengthPct)
            continue;
         ArrayResize(zHi, n+1);
         ArrayResize(zLo, n+1);
         ArrayResize(zName, n+1);
         zHi[n] = gVPHvn[i]+hw;
         zLo[n] = gVPHvn[i]-hw;
         zName[n] = "HVN";
         n++;
        }
   if(N3_TradeLVN)
      for(int i=0; i<ArraySize(gVPLvn); i++)
        {
         ArrayResize(zHi, n+1);
         ArrayResize(zLo, n+1);
         ArrayResize(zName, n+1);
         zHi[n] = gVPLvn[i]+hw;
         zLo[n] = gVPLvn[i]-hw;
         zName[n] = "LVN";
         n++;
        }
   return(n);
  }

bool N3DirAllowed(int dir, double c2)
  {
   if(!DirAllowed(dir))
      return(false);
   if(N3_BiasMode==VPB_BOTH_DIRECTIONS)
      return(true);
   if(N3_BiasMode==VPB_IMPULSE_DIRECTION && gVP.dir!=0)
      return(dir==gVP.dir);
   return(dir>0 ? c2>=gVP.pocPrice : c2<=gVP.pocPrice);   // price vs POC
  }

bool CheckStrategy3Signal()
  {
   int idx = NIdx(ST_N3);
   gNSig[idx].ready = false;
   gEntryReady[ST_N3] = false;
   int ptf = TF(N3_ProfileTimeframe);
   int ctf = StratTF(ST_N3);
   if(N3NeedRefresh(ptf))
     {
      string why = "";
      if(!N3Calculate(ptf, why))
        {
         SetCond(ST_N3, "REJECT: volume profile unavailable - " + why);
         return(false);
        }
     }
   if(!gVP.valid)
     {
      SetCond(ST_N3, "waiting for a valid volume profile");
      return(false);
     }
   double h1 = BarH(ctf, 1), l1 = BarL(ctf, 1), c1 = BarC(ctf, 1), c2 = BarC(ctf, 2);
   double zHi[], zLo[];
   string zName[];
   int nz = N3Zones(zHi, zLo, zName);
   if(nz==0)
     {
      SetCond(ST_N3, "REJECT: no VP entry zone enabled / strong enough");
      return(false);
     }
   string status = "";
   for(int d=0; d<2; d++)
     {
      int dir = (d==0 ? 1 : -1);
      if(!N3DirAllowed(dir, c2))
         continue;
      // retest arm bookkeeping
      if(dir>0 && gVPArmB.armed && ++gVPArmB.bars>N3_RetestBars)
         gVPArmB.armed = false;
      if(dir<0 && gVPArmS.armed && ++gVPArmS.bars>N3_RetestBars)
         gVPArmS.armed = false;
      for(int z=0; z<nz; z++)
        {
         bool setup = false;
         bool inZone = (l1<=zHi[z] && h1>=zLo[z]);
         if(inZone)
            gEntryReady[ST_N3] = true;
         if(N3_EntryMode==VPE_TOUCH)
            setup = (dir>0 ? l1<=zHi[z] && c1>=zLo[z] && c2>zHi[z] : h1>=zLo[z] && c1<=zHi[z] && c2<zLo[z]);
         else
            if(N3_EntryMode==VPE_REJECTION)
               setup = (dir>0 ? l1<=zHi[z] && c1>zHi[z] && c2>zLo[z] : h1>=zLo[z] && c1<zLo[z] && c2<zHi[z]);
            else
              {
               bool reclaim = (dir>0 ? c2<zLo[z] && c1>zHi[z] : c2>zHi[z] && c1<zLo[z]);
               if(N3_EntryMode==VPE_RECLAIM)
                  setup = reclaim;
               else
                 {
                  // RETEST: reclaim arms the zone, a later touch + close back out is the entry
                  if(reclaim)
                    {
                     if(dir>0)
                       {
                        gVPArmB.armed = true;
                        gVPArmB.zoneHi = zHi[z];
                        gVPArmB.zoneLo = zLo[z];
                        gVPArmB.name = zName[z];
                        gVPArmB.bars = 0;
                       }
                     else
                       {
                        gVPArmS.armed = true;
                        gVPArmS.zoneHi = zHi[z];
                        gVPArmS.zoneLo = zLo[z];
                        gVPArmS.name = zName[z];
                        gVPArmS.bars = 0;
                       }
                     status = zName[z] + " reclaimed - waiting retest";
                     continue;
                    }
                  bool armed = (dir>0 ? gVPArmB.armed && gVPArmB.name==zName[z] && MathAbs(gVPArmB.zoneHi-zHi[z])<Point
                                : gVPArmS.armed && gVPArmS.name==zName[z] && MathAbs(gVPArmS.zoneHi-zHi[z])<Point);
                  setup = armed && (dir>0 ? l1<=zHi[z] && c1>zHi[z] : h1>=zLo[z] && c1<zLo[z]);
                 }
              }
         if(!setup)
            continue;
         if(N3_RequireConfirmCandle && !IsConfirmCandle(ctf, 1, dir, N3_CandleType, N3_ConfirmMinBodyRatio))
           {
            status = zName[z] + " " + DirStr(dir) + " setup - waiting confirmation candle";
            gEntryReady[ST_N3] = true;
            continue;
           }
         gNSig[idx].ready = true;
         gNSig[idx].dir = dir;
         gNSig[idx].key = gVP.calcKey;
         gNSig[idx].zoneHi = zHi[z];
         gNSig[idx].zoneLo = zLo[z];
         gNSig[idx].extreme = (dir>0 ? l1 : h1);
         gNSig[idx].partialTarget = 0;
         string modeTxt[4] = {"touch", "rejection", "reclaim", "retest"};
         gNSig[idx].reason = "VP " + zName[z] + " " + modeTxt[(int)N3_EntryMode] +
                             (N3_RequireConfirmCandle ? " + " + ConfirmName(N3_CandleType) : "");
         SetCond(ST_N3, "SIGNAL ACCEPTED: " + gNSig[idx].reason);
         return(true);
        }
     }
   if(status=="")
      status = StringFormat("WAITING: price %s | POC %s VAH %s VAL %s | bias %s", PriceStr(c1), PriceStr(gVP.pocPrice),
                            PriceStr(gVP.vah), PriceStr(gVP.val), gVP.dir>0 ? "UP" : (gVP.dir<0 ? "DOWN" : "n/a"));
   SetCond(ST_N3, status);
   return(false);
  }

double CalculateStrategy3StopLoss()
  {
   int k = NIdx(ST_N3);
   int ctf = StratTF(ST_N3);
   double buf = Pips(N3_SLBufferPips);
   double sl;
   if(N3_SLMode==N3_SL_ATR)
     {
      double atr = GetATR(ctf, N3_ATRPeriod);
      sl = (gNSig[k].dir>0 ? gNSig[k].entry-atr*N3_ATRMultiplierSL : gNSig[k].entry+atr*N3_ATRMultiplierSL);
     }
   else
      if(N3_SLMode==N3_SL_SWING)
        {
         int s = FindSwing(ctf, gNSig[k].dir<0, 1, 30, 2);
         sl = (s>0 ? (gNSig[k].dir>0 ? BarL(ctf, s)-buf : BarH(ctf, s)+buf) : 0);
         if(sl<=0 || (gNSig[k].dir>0 && sl>=gNSig[k].entry) || (gNSig[k].dir<0 && sl<=gNSig[k].entry))
            sl = (gNSig[k].dir>0 ? MathMin(gNSig[k].zoneLo, gNSig[k].extreme)-buf : MathMax(gNSig[k].zoneHi, gNSig[k].extreme)+buf);
        }
      else
         sl = (gNSig[k].dir>0 ? MathMin(gNSig[k].zoneLo, gNSig[k].extreme)-buf : MathMax(gNSig[k].zoneHi, gNSig[k].extreme)+buf);
   return(NP(sl));
  }

//--- VP levels beyond the entry, nearest first
int N3Targets(int dir, double entry, double &out[])
  {
   ArrayResize(out, 0);
   double cand[];
   int n = 0;
   ArrayResize(cand, 5+ArraySize(gVPHvn)+ArraySize(gVPLvn));
   if(N3_TPMode==N3_TP_POC || N3_TPMode==N3_TP_OPPOSITE_ZONE)
      cand[n++] = gVP.pocPrice;
   if(N3_TPMode==N3_TP_VA_EDGE || N3_TPMode==N3_TP_OPPOSITE_ZONE)
     {
      cand[n++] = (dir>0 ? gVP.vah : gVP.val);
      if(N3_TPMode==N3_TP_OPPOSITE_ZONE)
         cand[n++] = (dir>0 ? gVP.val : gVP.vah);
     }
   if(N3_TPMode==N3_TP_HVN || N3_TPMode==N3_TP_OPPOSITE_ZONE)
      for(int i=0; i<ArraySize(gVPHvn); i++)
         cand[n++] = gVPHvn[i];
   if(N3_TPMode==N3_TP_LVN)
      for(int i=0; i<ArraySize(gVPLvn); i++)
         cand[n++] = gVPLvn[i];
   // profile extreme as the last structural target
   cand[n++] = (dir>0 ? gVP.hi : gVP.lo);
   int m = 0;
   for(int i=0; i<n; i++)
     {
      if((dir>0 && cand[i]<=entry) || (dir<0 && cand[i]>=entry))
         continue;
      ArrayResize(out, m+1);
      out[m++] = cand[i];
     }
   // sort by distance from entry (nearest first)
   for(int i=0; i<m-1; i++)
      for(int j=i+1; j<m; j++)
         if(MathAbs(out[j]-entry)<MathAbs(out[i]-entry))
           {
            double t = out[i];
            out[i] = out[j];
            out[j] = t;
           }
   return(m);
  }

double CalculateStrategy3TakeProfit()
  {
   int idx = NIdx(ST_N3);
   
   double risk = MathAbs(gNSig[idx].entry-gNSig[idx].sl);
   double target = 0;
   if(N3_TPMode!=N3_TP_RR && risk>0)
     {
      double t[];
      int n = N3Targets(gNSig[idx].dir, gNSig[idx].entry, t);
      for(int i=0; i<n; i++)
         if(MathAbs(t[i]-gNSig[idx].entry)/risk>=N3_MinRR)
           {
            target = t[i];
            break;
           }
      if(target==0)
         Log("N3: no VP target with RR >= " + D2S(N3_MinRR) + " - using fixed RR");
     }
   if(!N3_UsePartial)
      return(TargetOrRR(gNSig[idx].dir, gNSig[idx].entry, gNSig[idx].sl, target, N3_MinRR, N3_RiskReward, "N3"));
   // partial at the VP target (or at N3_PartialAtR), remainder to the final RR (beyond the target)
   gNSig[idx].partialTarget = (target>0 ? target : (gNSig[idx].dir>0 ? gNSig[idx].entry+risk*N3_PartialAtR : gNSig[idx].entry-risk*N3_PartialAtR));
   double fin = (gNSig[idx].dir>0 ? gNSig[idx].entry+risk*N3_FinalRR : gNSig[idx].entry-risk*N3_FinalRR);
   if(target>0 && ((gNSig[idx].dir>0 && fin<=target) || (gNSig[idx].dir<0 && fin>=target)))
      fin = (gNSig[idx].dir>0 ? target+risk : target-risk);
   return(NP(fin));
  }

bool ExecuteStrategy3Trade()
  {
   int idx = NIdx(ST_N3);
   if(!gNSig[idx].ready)
      return(false);
   RefreshRates();
   gNSig[idx].entry = (gNSig[idx].dir>0 ? Ask : Bid);
   gNSig[idx].sl = CalculateStrategy3StopLoss();
   gNSig[idx].tp = CalculateStrategy3TakeProfit();
   int res = ExecuteSignal(ST_N3, gNSig[idx].dir, gNSig[idx].entry, gNSig[idx].sl, gNSig[idx].tp,
                           gNSig[idx].reason, gNSig[idx].key, false);
   gNSig[idx].ready = false;
   if(res>0 && N3_UsePartial && gNSig[idx].partialTarget>0)
     {
      KVSet(PFX+"PT_"+IntegerToString(res), gNSig[idx].partialTarget);
      Log("N3 #" + IntegerToString(res) + ": partial close planned at " + PriceStr(gNSig[idx].partialTarget));
     }
   if(res!=0)
     {
      gVPArmB.armed = false;
      gVPArmS.armed = false;
     }
   return(res>0);
  }

//+------------------------------------------------------------------+
//| ================= NEWS FILTER ================================== |
//| MQL4 has no economic calendar: news times are entered manually. |
//+------------------------------------------------------------------+
string TrimStr(string v)
  {
   while(StringLen(v)>0 && (StringGetCharacter(v, 0)==' ' || StringGetCharacter(v, 0)=='\t'))
      v = StringSubstr(v, 1);
   while(StringLen(v)>0 && (StringGetCharacter(v, StringLen(v)-1)==' ' || StringGetCharacter(v, StringLen(v)-1)=='\t'))
      v = StringSubstr(v, 0, StringLen(v)-1);
   return(v);
  }

string NewsBlockText()
  {
   if(!UseNewsFilter)
      return("");
   datetime now = TimeCurrent();
   string parts[];
   int n = StringSplit(NewsTimes, ';', parts);
   for(int i=0; i<n; i++)
     {
      string p = TrimStr(parts[i]);
      if(StringLen(p)<10)
         continue;
      datetime t = StringToTime(p);
      if(t>0 && now>=t-NewsMinutesBefore*60 && now<=t+NewsMinutesAfter*60)
         return("news filter (" + p + ")");
     }
   n = StringSplit(NewsDailyTimes, ';', parts);
   string day = TimeToString(now, TIME_DATE);
   for(int i=0; i<n; i++)
     {
      string p = TrimStr(parts[i]);
      if(StringLen(p)<4)
         continue;
      datetime t = StringToTime(day + " " + p);
      if(t>0 && now>=t-NewsMinutesBefore*60 && now<=t+NewsMinutesAfter*60)
         return("daily news filter (" + p + ")");
     }
   return("");
  }

//+------------------------------------------------------------------+
//| Partial-close plans (S3, N2, N3) used by ManageOpenTrades        |
//+------------------------------------------------------------------+
bool PartialPlan(int magic, int ticket, int type, double op, double risk, double &trigger, double &pct, double &beOff)
  {
   bool buy = (type==OP_BUY);
   if(magic==MagicStrategy3 && S3_TPMode==S3_TP_PARTIAL_BE)
     {
      if(risk<=0)
         return(false);
      trigger = (buy ? op+risk*S3_PartialAtR : op-risk*S3_PartialAtR);
      pct = S3_PartialPercent;
      beOff = S3_BEOffsetPips;
      return(true);
     }
   if(magic==MagicNew2 && N2_TPMode==N2_TP_PARTIAL)
     {
      if(risk<=0)
         return(false);
      trigger = (buy ? op+risk*N2_PartialAtR : op-risk*N2_PartialAtR);
      pct = N2_PartialPercent;
      beOff = N2_BEOffsetPips;
      return(true);
     }
   if(magic==MagicNew3 && N3_UsePartial)
     {
      string k = PFX+"PT_"+IntegerToString(ticket);
      if(KVCheck(k) && KVGet(k)>0)
         trigger = KVGet(k);
      else
        {
         if(risk<=0)
            return(false);
         trigger = (buy ? op+risk*N3_PartialAtR : op-risk*N3_PartialAtR);
        }
      pct = N3_PartialPercent;
      beOff = N3_BEOffsetPips;
      return(true);
     }
   return(false);
  }

//+------------------------------------------------------------------+
//| Strategy objects (hide / remove when disabled)                   |
//+------------------------------------------------------------------+
void DeleteStrategyObjects(int s)
  {
   if(s==ST_S1)
      DeleteByPrefix(PFX+"S1");
   else
      if(s==ST_S2)
         DeleteByPrefix(PFX+"S2");
      else
         if(s==ST_S3)
           {
            DeleteByPrefix(PFX+"S3");
            DeleteByPrefix(PFX+"LIQ_");
           }
         else
            if(s==ST_N1)
               DeleteByPrefix(PFX+"STR1_");
            else
               if(s==ST_N2)
                  DeleteByPrefix(PFX+"STR2_");
               else
                  if(s==ST_N3)
                     DeleteByPrefix(PFX+"STR3_");
   DeleteByPrefix(PFX+"SIG_"+StratShort(s)+"_");
  }

void DeleteAllStrategyObjects()
  {
   for(int s=0; s<STRAT_COUNT; s++)
      DeleteStrategyObjects(s);
  }

//--- ENTRY READY flag for the original strategies (setup in its final stage)
void UpdateEntryReadyOld()
  {
   gEntryReady[ST_S1] = (gS1Buy.phase==S1_WAIT_CONF || gS1Sell.phase==S1_WAIT_CONF);
   gEntryReady[ST_S2] = (gS2Buy.phase>=PH_WAIT_RET || gS2Sell.phase>=PH_WAIT_RET);
   gEntryReady[ST_S3] = (gS3Buy.phase>=PH_WAIT_RET || gS3Sell.phase>=PH_WAIT_RET);
  }

//--- dashboard status of a strategy
string StrategyStatus(int s, int openTrades)
  {
   if(!gStratOn[s])
      return("DISABLED");
   if(openTrades>0)
      return("TRADE OPEN");
   if(gState[s]=="Signal Detected")
      return("SIGNAL DETECTED");
   if(gEntryReady[s])
      return("ENTRY READY");
   return("WAITING");
  }

color StrategyStatusColor(string st)
  {
   if(st=="TRADE OPEN")
      return(ClrProfit);
   if(st=="SIGNAL DETECTED")
      return(ClrProfit);
   if(st=="ENTRY READY")
      return(ClrWarning);
   if(st=="WAITING")
      return(ClrInfo);
   return(ToggleOffColor);
  }

//+------------------------------------------------------------------+
//| Expert initialization                                            |
//+------------------------------------------------------------------+
int OnInit()
  {
   // --- validate inputs
   int mg[7];
   mg[0] = MagicStrategy1;
   mg[1] = MagicStrategy2;
   mg[2] = MagicStrategy3;
   mg[3] = MagicNew1;
   mg[4] = MagicNew2;
   mg[5] = MagicNew3;
   mg[6] = MagicManual;
   bool dupMagic = false;
   for(int a=0; a<7; a++)
      for(int b=a+1; b<7; b++)
         if(mg[a]==mg[b])
            dupMagic = true;
   if(dupMagic)
     {
      Alert(EA_NAME, ": every magic number must be unique.");
      return(INIT_PARAMETERS_INCORRECT);
     }
   if(MinBodyToRangeRatio<=0.0 || MinBodyToRangeRatio>1.0)
     {
      Alert(EA_NAME, ": MinBodyToRangeRatio must be > 0 and <= 1.");
      return(INIT_PARAMETERS_INCORRECT);
     }
   if(S1_RiskReward<=0 || S2_RiskReward<=0 || S3_RiskReward<=0 || N1_RiskReward<=0 || N2_RiskReward<=0 || N3_RiskReward<=0)
     {
      Alert(EA_NAME, ": Risk:Reward values must be > 0.");
      return(INIT_PARAMETERS_INCORRECT);
     }
   if(S2_EntryPercentOfFVG<0 || S2_EntryPercentOfFVG>100 || S3_EntryPercentOfFVG<0 || S3_EntryPercentOfFVG>100)
     {
      Alert(EA_NAME, ": EntryPercentOfFVG must be between 0 and 100.");
      return(INIT_PARAMETERS_INCORRECT);
     }
   if(N1_FibLevel<=0 || N1_FibLevel>=100 || N3_ValueAreaPct<=0 || N3_ValueAreaPct>100)
     {
      Alert(EA_NAME, ": N1_FibLevel must be between 0 and 100, N3_ValueAreaPct between 0 and 100.");
      return(INIT_PARAMETERS_INCORRECT);
     }
   if(TF(EntryTimeframe)>=TF(ReferenceTimeframe))
      Print(EA_NAME, ": WARNING - EntryTimeframe should be lower than ReferenceTimeframe.");
   if(IsTesting())
     {
      if(EnableStrategy1 && TF(S1_Timeframe)<Period())
         Print(EA_NAME, ": WARNING - tester chart ", TFName(Period()), " is higher than S1 timeframe - run the test on ", TFName(TF(S1_Timeframe)));
      if(EnableStrategy2 && TF(EntryTimeframe)<Period())
         Print(EA_NAME, ": WARNING - tester chart ", TFName(Period()), " is higher than S2 EntryTimeframe - run S2 tests on ", TFName(TF(EntryTimeframe)));
      if(EnableStrategy3 && TF(S3_Timeframe)<Period())
         Print(EA_NAME, ": WARNING - tester chart ", TFName(Period()), " is higher than S3 timeframe - run the test on ", TFName(TF(S3_Timeframe)));
      if(StrategyModeHas(1) && TF(N1_ConfirmTimeframe)<Period())
         Print(EA_NAME, ": WARNING - tester chart is higher than N1 confirmation timeframe - run the test on ", TFName(TF(N1_ConfirmTimeframe)));
      if(StrategyModeHas(2) && TF(N2_Timeframe)<Period())
         Print(EA_NAME, ": WARNING - tester chart is higher than N2 timeframe - run the test on ", TFName(TF(N2_Timeframe)));
      if(StrategyModeHas(3) && TF(N3_ConfirmTimeframe)<Period())
         Print(EA_NAME, ": WARNING - tester chart is higher than N3 confirmation timeframe - run the test on ", TFName(TF(N3_ConfirmTimeframe)));
     }

   gPip = PipSize();
   gDrawUI = (!IsTesting() || IsVisualMode()) && !IsOptimization();
   gAuto = EnableAutoTrading;
   gStratOn[ST_S1] = EnableStrategy1;
   gStratOn[ST_S2] = EnableStrategy2;
   gStratOn[ST_S3] = EnableStrategy3;
   gStratOn[ST_N1] = StrategyModeHas(1);
   gStratOn[ST_N2] = StrategyModeHas(2);
   gStratOn[ST_N3] = StrategyModeHas(3);
   gTrailOn = UseTrailingStop;
   gPerfVisible = ShowPerformancePanel;

   for(int i=0; i<STRAT_COUNT; i++)
     {
      gState[i] = gStratOn[i] ? "Active" : "Inactive";
      gDetail[i] = "Waiting for first closed bar";
      gLastCond[i] = "";
      gSignalBar[i] = 0;
      gLastBar[i] = 0;
      gEntryReady[i] = false;
      gTradesOpened[i] = 0;
     }
   for(int i=0; i<3; i++)
      gNSig[i].ready = false;
   ResetFib();
   gFibUsedKey = 0;
   ResetSweep(gSwB);
   ResetSweep(gSwS);
   ResetVP();
   gS2Buy.ticket = 0;
   gS2Sell.ticket = 0;
   gS3Buy.ticket = 0;
   gS3Sell.ticket = 0;
   ResetS1(gS1Buy);
   ResetS1(gS1Sell);
   ResetFvg(gS2Buy); ResetFvg(gS2Sell);
   ResetFvg(gS3Buy); ResetFvg(gS3Sell);
   gS2RefTime = 0;
   gHistCount = -1;

   InitRiskTracking();
   CleanupTradeGlobals();

   if(!IsTesting())
      EventSetTimer(1);

   if(gDrawUI)
     {
      BuildTradePanel();
      RefreshUI(true);
     }

   Log(StringFormat("Initialized on %s %s | Digits=%d | Pip=%s | Point=%s | StopLevel=%d pts | FreezeLevel=%d pts",
                    Symbol(), TFName(Period()), Digits, DoubleToString(gPip, Digits), DoubleToString(Point, Digits),
                    (int)MarketInfo(Symbol(), MODE_STOPLEVEL), (int)MarketInfo(Symbol(), MODE_FREEZELEVEL)));
   Log("WARNING: backtest results do not guarantee future profits. Test on demo first.");
   if(UseLossMultiplier)
      Log("WARNING: loss multiplier (martingale) is ENABLED by user settings.");
   return(INIT_SUCCEEDED);
  }

//+------------------------------------------------------------------+
//| Expert deinitialization                                          |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   EventKillTimer();
   Log("DIAGNOSTICS: " + DiagSummary());
   for(int s=0; s<STRAT_COUNT; s++)
      Log(StringFormat("DIAGNOSTICS %s: %s | trades opened %d | last state: %s", StratShort(s),
                       gStratOn[s] ? "ON" : "OFF", gTradesOpened[s], gDetail[s]));
   if(DeleteObjectsOnExit || reason==REASON_REMOVE)
      DeleteByPrefix(PFX);
   else
     {
      // Always remove the interactive UI; keep analysis drawings.
      DeleteByPrefix(PFX+"P1");
      DeleteByPrefix(PFX+"P2");
      DeleteByPrefix(PFX+"LN_");
     }
   Comment("");
  }

//+------------------------------------------------------------------+
//| Expert tick                                                      |
//+------------------------------------------------------------------+
void OnTick()
  {
   if(!gSpreadWarned && MaxSpreadPips>0 && SpreadPips()>MaxSpreadPips)
     {
      gSpreadWarned = true;
      string w = StringFormat("WARNING: spread %.1f pips > MaxSpreadPips %.1f - every signal will be BLOCKED. "
                              "Tester: set a fixed Spread (not 'Current' on weekends) or raise MaxSpreadPips.", SpreadPips(), MaxSpreadPips);
      Log(w);
      if(!IsTesting())
         Alert(EA_NAME, " ", Symbol(), ": ", w);
     }
   UpdateRiskTracking();
   ManageOpenTrades();

   RunStrategies();

   if(gDrawUI)
      RefreshUI(false);
  }

//+------------------------------------------------------------------+
//| Timer (keeps panels live when no ticks arrive)                   |
//+------------------------------------------------------------------+
void OnTimer()
  {
   if(gDrawUI)
      RefreshUI(true);
  }

//+------------------------------------------------------------------+
//| Run every enabled strategy (each on its own timeframe new bar)   |
//+------------------------------------------------------------------+
void RunStrategies()
  {
   for(int s=0; s<STRAT_COUNT; s++)
     {
      if(!gStratOn[s])
        {
         gState[s] = "Inactive";
         continue;
        }
      if(gState[s]=="Inactive")
         gState[s] = "Active";

      int tf = StratTF(s);
      datetime bt = iTime(Symbol(), tf, 0);
      if(bt==0)
        {
         SetCond(s, "no " + TFName(tf) + " data - open that chart/History Center (tester: run on " + TFName(tf) + ")");
         continue;
        }
      if(bt==gLastBar[s])
         continue;                     // evaluate once per new bar only
      if(iBars(Symbol(), tf) < 100)
        {
         SetCond(s, "Not enough bars on " + TFName(tf));
         continue;
        }
      gLastBar[s] = bt;

      if(s==ST_S1)
         S1Process();
      else
         if(s==ST_S2)
            S2Process();
         else
            if(s==ST_S3)
               S3Process();
            else
               NProcess(s);     // new video strategies N1 / N2 / N3
     }
   UpdateEntryReadyOld();
  }

//+------------------------------------------------------------------+
//| Chart events: panel buttons, chart clicks, line drags, edits    |
//+------------------------------------------------------------------+
void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
  {
   if(id==CHARTEVENT_OBJECT_CLICK)
     {
      if(StringFind(sparam, PFX+"P")==0 && ObjectFind(0, sparam)>=0 &&
         ObjectGetInteger(0, sparam, OBJPROP_TYPE)==OBJ_BUTTON)
        {
         HandleButton(sparam);
         if(ObjectFind(0, sparam)>=0)
            ObjectSetInteger(0, sparam, OBJPROP_STATE, false);
         RefreshUI(true);
        }
     }
   else
      if(id==CHARTEVENT_CLICK)
        {
         if(gPickMode>0 && GetTickCount()-gPickArm>300 && !PointInTradePanel((int)lparam, (int)dparam))
           {
            int sub = 0;
            datetime t = 0;
            double price = 0;
            if(ChartXYToTimePrice(0, (int)lparam, (int)dparam, sub, t, price) && sub==0)
               ApplyPickedPrice(NP(price));
           }
        }
      else
         if(id==CHARTEVENT_OBJECT_DRAG)
           {
            if(sparam==PFX+"LN_ENTRY" || sparam==PFX+"LN_SL" || sparam==PFX+"LN_TP")
               SyncFieldsFromLines();
           }
         else
            if(id==CHARTEVENT_OBJECT_ENDEDIT)
              {
               if(StringFind(sparam, PFX+"P1C_E_")==0)
                 {
                  ValidateEditField(sparam);
                  if(gLinesOn)
                     SyncLinesFromFields();
                  RefreshUI(true);
                 }
              }
  }

//+------------------------------------------------------------------+
//| ================= UTILITIES ================================== |
//+------------------------------------------------------------------+
int TF(int tf)                { return(tf==PERIOD_CURRENT ? Period() : tf); }
double NP(double p)           { return(NormalizeDouble(p, Digits)); }
double Pips(double pips)      { return(pips*gPip); }
double BarO(int tf, int s)    { return(iOpen(Symbol(), tf, s)); }
double BarH(int tf, int s)    { return(iHigh(Symbol(), tf, s)); }
double BarL(int tf, int s)    { return(iLow(Symbol(), tf, s)); }
double BarC(int tf, int s)    { return(iClose(Symbol(), tf, s)); }
datetime BarT(int tf, int s)  { return(iTime(Symbol(), tf, s)); }
string DirStr(int dir)        { return(dir>0 ? "BUY" : "SELL"); }
string D2S(double v, int d=2) { return(DoubleToString(v, d)); }
string PriceStr(double p)     { return(DoubleToString(p, Digits)); }

//--- pip size (supports 2/3/4/5 digit symbols; overridable)
double PipSize()
  {
   if(PipSizeOverride>0.0)
      return(PipSizeOverride);
   string sym = Symbol();
   StringToUpper(sym);
   if(StringFind(sym, "XAU")>=0 || StringFind(sym, "GOLD")>=0)
      return(0.1);                        // gold: 1 pip = 0.10
   if(StringFind(sym, "XAG")>=0 || StringFind(sym, "SILVER")>=0)
      return(0.01);                       // silver: 1 pip = 0.01
   double px = MarketInfo(Symbol(), MODE_BID);
   if(Digits<=2 && px>=1000.0)
      return(1.0);                        // crypto / indices: 1 pip = 1.0
   if(Digits==3 || Digits==5)
      return(Point*10.0);                 // forex 3/5 digits
   return(Point);
  }

//--- strategy helpers
int StratTF(int s)
  {
   if(s==ST_S1)
      return(TF(S1_Timeframe));
   if(s==ST_S2)
      return(TF(EntryTimeframe));
   if(s==ST_N1)
      return(TF(N1_ConfirmTimeframe));
   if(s==ST_N2)
      return(TF(N2_Timeframe));
   if(s==ST_N3)
      return(TF(N3_ConfirmTimeframe));
   return(TF(S3_Timeframe));
  }

int StratMagic(int s)
  {
   if(s==ST_S1)
      return(MagicStrategy1);
   if(s==ST_S2)
      return(MagicStrategy2);
   if(s==ST_S3)
      return(MagicStrategy3);
   if(s==ST_N1)
      return(MagicNew1);
   if(s==ST_N2)
      return(MagicNew2);
   if(s==ST_N3)
      return(MagicNew3);
   return(MagicManual);
  }

string StratShort(int s)
  {
   if(s==ST_S1)
      return("S1");
   if(s==ST_S2)
      return("S2");
   if(s==ST_S3)
      return("S3");
   if(s==ST_N1)
      return("N1");
   if(s==ST_N2)
      return("N2");
   if(s==ST_N3)
      return("N3");
   return("MAN");
  }

string StratName(int s)
  {
   if(s==ST_S1)
      return("S1 Trendline Breakout");
   if(s==ST_S2)
      return("S2 Candle Range MSS FVG");
   if(s==ST_S3)
      return("S3 Liquidity BOS FVG");
   if(s==ST_N1)
      return("N1 Fibonacci 50%");
   if(s==ST_N2)
      return("N2 Liquidity Sweep");
   if(s==ST_N3)
      return("N3 Volume Profile");
   return("Manual");
  }

int MagicToStrat(int magic)
  {
   if(magic==MagicStrategy1)
      return(ST_S1);
   if(magic==MagicStrategy2)
      return(ST_S2);
   if(magic==MagicStrategy3)
      return(ST_S3);
   if(magic==MagicNew1)
      return(ST_N1);
   if(magic==MagicNew2)
      return(ST_N2);
   if(magic==MagicNew3)
      return(ST_N3);
   if(magic==MagicManual)
      return(ST_MANUAL);
   return(-1);
  }

bool IsEAMagic(int magic) { return(MagicToStrat(magic)>=0); }

string TFName(int tf)
  {
   switch(tf)
     {
      case PERIOD_M1:
         return("M1");
      case PERIOD_M5:
         return("M5");
      case PERIOD_M15:
         return("M15");
      case PERIOD_M30:
         return("M30");
      case PERIOD_H1:
         return("H1");
      case PERIOD_H4:
         return("H4");
      case PERIOD_D1:
         return("D1");
      case PERIOD_W1:
         return("W1");
      case PERIOD_MN1:
         return("MN1");
     }
   return("TF" + IntegerToString(tf));
  }

//--- selected order belongs to the given scope?
bool OrderInScope(int scope)
  {
   if(OrderSymbol()!=Symbol())
      return(false);
   if(scope==SCOPE_SYMBOL_ALL)
      return(true);
   return(IsEAMagic(OrderMagicNumber()));
  }

//--- logging
void Log(string msg)
  {
   Print("[", EA_NAME, " | ", Symbol(), " ", TFName(Period()), "] ", msg);
  }

//--- set strategy condition message (logged only when it changes)
void SetCond(int s, string msg)
  {
   gDetail[s] = msg;
   if(DebugMode)
     {
      gLastCond[s] = msg;
      Log("[DEBUG] " + StratShort(s) + " " + TimeToString(BarT(StratTF(s), 1)) + ": " + msg);
      return;
     }
   if(msg!=gLastCond[s])
     {
      gLastCond[s] = msg;
      if(LogConditionMessages)
         Log(StratShort(s) + ": " + msg);
     }
  }

//--- alerts (popup / push / sound)
void Notify(string msg)
  {
   string full = EA_NAME + " " + Symbol() + " " + TFName(Period()) + ": " + msg;
   Log("NOTIFY " + msg);
   if(IsTesting())
      return;
   if(UseAlerts)
      Alert(full);
   if(UsePushNotifications)
      SendNotification(full);
   if(UseSoundAlerts)
      PlaySound(SoundFileName);
  }

//--- delete all objects whose name starts with prefix
void DeleteByPrefix(string prefix)
  {
   for(int i=ObjectsTotal(0, -1, -1)-1; i>=0; i--)
     {
      string n = ObjectName(0, i, -1, -1);
      if(StringFind(n, prefix)==0)
         ObjectDelete(0, n);
     }
  }

//--- confirmation dialog (skipped in tester)
bool AskConfirm(string msg)
  {
   if(!ConfirmPanelActions || IsTesting())
      return(true);
   return(MessageBox(msg, EA_NAME, MB_YESNO|MB_ICONQUESTION)==IDYES);
  }

//+------------------------------------------------------------------+
//| ================= PERSISTENT STORAGE =========================== |
//| Live/demo: terminal Global Variables (survive restarts).        |
//| Strategy Tester: in-memory only, so every test run starts clean |
//| and never inherits live values (peak equity, traded setups...). |
//+------------------------------------------------------------------+
string    gKVKey[];
double    gKVVal[];

int KVFind(string k)
  {
   for(int i=ArraySize(gKVKey)-1; i>=0; i--)
      if(gKVKey[i]==k)
         return(i);
   return(-1);
  }

bool KVCheck(string k)
  {
   if(!IsTesting())
      return(GlobalVariableCheck(k));
   return(KVFind(k)>=0);
  }

double KVGet(string k)
  {
   if(!IsTesting())
      return(GlobalVariableGet(k));
   int i = KVFind(k);
   return(i>=0 ? gKVVal[i] : 0.0);
  }

void KVSet(string k, double v)
  {
   if(!IsTesting())
     {
      GlobalVariableSet(k, v);
      return;
     }
   int i = KVFind(k);
   if(i<0)
     {
      i = ArraySize(gKVKey);
      ArrayResize(gKVKey, i+1);
      ArrayResize(gKVVal, i+1);
      gKVKey[i] = k;
     }
   gKVVal[i] = v;
  }

void KVDel(string k)
  {
   if(!IsTesting())
     {
      GlobalVariableDel(k);
      return;
     }
   int i = KVFind(k);
   if(i<0)
      return;
   int last = ArraySize(gKVKey)-1;
   gKVKey[i] = gKVKey[last];
   gKVVal[i] = gKVVal[last];
   ArrayResize(gKVKey, last);
   ArrayResize(gKVVal, last);
  }

int KVTotal()
  {
   return(IsTesting() ? ArraySize(gKVKey) : GlobalVariablesTotal());
  }

string KVName(int i)
  {
   return(IsTesting() ? gKVKey[i] : GlobalVariableName(i));
  }

//+------------------------------------------------------------------+
//| ================= CANDLE / STRUCTURE HELPERS =================== |
//+------------------------------------------------------------------+
double CandleBody(int tf, int s)  { return(MathAbs(BarC(tf, s)-BarO(tf, s))); }
double CandleRange(int tf, int s) { return(BarH(tf, s)-BarL(tf, s)); }

double BodyRatio(int tf, int s)
  {
   double r = CandleRange(tf, s);
   if(r<=0.0)
      return(0.0);
   return(CandleBody(tf, s)/r);
  }

//--- swing high: higher than 'str' bars on each side (right side must be closed bars)
bool IsSwingHigh(int tf, int s, int str)
  {
   if(s-str<1)
      return(false);
   double h = BarH(tf, s);
   for(int k=1; k<=str; k++)
     {
      if(BarH(tf, s+k)>=h)
         return(false);
      if(BarH(tf, s-k)>h)
         return(false);
     }
   return(true);
  }

bool IsSwingLow(int tf, int s, int str)
  {
   if(s-str<1)
      return(false);
   double l = BarL(tf, s);
   for(int k=1; k<=str; k++)
     {
      if(BarL(tf, s+k)<=l)
         return(false);
      if(BarL(tf, s-k)<l)
         return(false);
     }
   return(true);
  }

//--- collect up to maxCount swing shifts (most recent first) starting at startShift
int CollectSwings(int tf, bool highs, int startShift, int lookback, int str, int &out[], int maxCount)
  {
   ArrayResize(out, 0);
   int n = 0;
   int first = (int)MathMax(startShift, str+1);
   int last = (int)MathMin(startShift+lookback, iBars(Symbol(), tf)-str-1);
   for(int s=first; s<=last && n<maxCount; s++)
     {
      bool ok = highs ? IsSwingHigh(tf, s, str) : IsSwingLow(tf, s, str);
      if(ok)
        {
         ArrayResize(out, n+1);
         out[n] = s;
         n++;
        }
     }
   return(n);
  }

int FindSwing(int tf, bool high, int startShift, int lookback, int str)
  {
   int arr[];
   if(CollectSwings(tf, high, startShift, lookback, str, arr, 1)>0)
      return(arr[0]);
   return(-1);
  }

double GetATR(int tf, int period)
  {
   return(iATR(Symbol(), tf, period, 1));
  }

//--- confirmation candle check
bool IsConfirmCandle(int tf, int s, int dir, int mode, double minBodyRatio)
  {
   double o = BarO(tf, s), c = BarC(tf, s), h = BarH(tf, s), l = BarL(tf, s);
   double rng = h-l;
   if(rng<=0.0)
      return(false);
   double body = MathAbs(c-o);

   bool directional = (dir>0 ? c>o : c<o) && body/rng>=minBodyRatio;

   double po = BarO(tf, s+1), pc = BarC(tf, s+1);
   bool engulf;
   if(dir>0)
      engulf = (c>o && pc<po && c>=po && o<=pc);
   else
      engulf = (c<o && pc>po && c<=po && o>=pc);

   bool pin;
   double upper = h-MathMax(o, c), lower = MathMin(o, c)-l;
   if(dir>0)
      pin = (lower>=2.0*body && lower>=0.5*rng && c>=l+0.5*rng);
   else
      pin = (upper>=2.0*body && upper>=0.5*rng && c<=h-0.5*rng);

   if(mode==CONFIRM_DIRECTIONAL_CLOSE)
      return(directional);
   if(mode==CONFIRM_ENGULFING)
      return(engulf);
   if(mode==CONFIRM_PINBAR)
      return(pin);
   return(directional || engulf || pin);
  }

//--- session window
void SessionHours(int ses, int &sh, int &sm, int &eh, int &em)
  {
   sm = 0;
   em = 0;
   if(ses==SES_LONDON)
     {
      sh = LondonStartHour;
      eh = LondonEndHour;
     }
   else
      if(ses==SES_NEWYORK)
        {
         sh = NewYorkStartHour;
         eh = NewYorkEndHour;
        }
      else
         if(ses==SES_ASIAN)
           {
            sh = AsianStartHour;
            eh = AsianEndHour;
           }
         else
           {
            sh = CustomStartHour;
            sm = CustomStartMinute;
            eh = CustomEndHour;
            em = CustomEndMinute;
           }
  }

bool InTimeWindow(datetime t, int sh, int sm, int eh, int em)
  {
   int m = TimeHour(t)*60+TimeMinute(t);
   int a = sh*60+sm, b = eh*60+em;
   if(a==b)
      return(true);
   if(a<b)
      return(m>=a && m<b);
   return(m>=a || m<b);    // window crosses midnight
  }

bool InSession(int ses, datetime t)
  {
   int sh, sm, eh, em;
   SessionHours(ses, sh, sm, eh, em);
   return(InTimeWindow(t, sh, sm, eh, em));
  }

//--- range of the last COMPLETED occurrence of a session window
bool GetLastSessionRange(int sh, int sm, int eh, int em, int tf, double &hi, double &lo, int &endShift)
  {
   datetime cur = BarT(tf, 0);
   if(cur==0)
      return(false);
   datetime day0 = cur-(datetime)((long)cur%86400);
   for(int d=0; d<7; d++)
     {
      datetime st = day0-d*86400+sh*3600+sm*60;
      datetime en = day0-d*86400+eh*3600+em*60;
      if(en<=st)
         en += 86400;
      if(en>cur)
         continue;                               // not finished yet
      int s1 = iBarShift(Symbol(), tf, st, false);
      if(s1<0)
         continue;
      if(BarT(tf, s1)<st)
         s1--;                                   // first bar inside the session
      int s2 = iBarShift(Symbol(), tf, en-1, false);
      if(s1<1 || s2<1 || s1<s2)
         continue;
      if(BarT(tf, s2)<st)
         continue;                               // no bars in session (weekend)
      int cnt = s1-s2+1;
      hi = BarH(tf, iHighest(Symbol(), tf, MODE_HIGH, cnt, s2));
      lo = BarL(tf, iLowest(Symbol(), tf, MODE_LOW, cnt, s2));
      endShift = s2;
      return(true);
     }
   return(false);
  }

//+------------------------------------------------------------------+
//| ================= LIQUIDITY ==================================== |
//+------------------------------------------------------------------+
void AddLiq(TLiq &arr[], double price, int shift, string name)
  {
   int n = ArraySize(arr);
   // skip duplicates (same price within 1 point)
   for(int i=0; i<n; i++)
      if(MathAbs(arr[i].price-price)<Point)
         return;
   ArrayResize(arr, n+1);
   arr[n].price = price;
   arr[n].shift = shift;
   arr[n].name  = name;
  }

//--- level still intact (not traded through) from its formation until bar 2
bool LiqIntact(int tf, bool high, double price, int shift)
  {
   int cnt = shift-2;
   if(cnt<=0)
      return(true);
   if(high)
      return(BarH(tf, iHighest(Symbol(), tf, MODE_HIGH, cnt, 2))<price);
   return(BarL(tf, iLowest(Symbol(), tf, MODE_LOW, cnt, 2))>price);
  }

//--- build buy-side (highs) and sell-side (lows) liquidity levels
//    allSwings=true adds every swing (for TP targets), false only the most recent one
void BuildLiquidity(int tf, int lookback, int str, bool useEqual, double eqTol, bool useSwing, bool allSwings,
                    bool usePD, bool useAsia, bool useLondon, bool useNY, TLiq &highs[], TLiq &lows[])
  {
   ArrayResize(highs, 0);
   ArrayResize(lows, 0);
   int sh[], sl[];
   int nh = CollectSwings(tf, true, 1, lookback, str, sh, 12);
   int nl = CollectSwings(tf, false, 1, lookback, str, sl, 12);

   // Equal highs / equal lows
   if(useEqual)
     {
      for(int i=0; i<nh; i++)
         for(int j=i+1; j<nh; j++)
            if(MathAbs(BarH(tf, sh[i])-BarH(tf, sh[j]))<=eqTol)
              {
               double lv = MathMax(BarH(tf, sh[i]), BarH(tf, sh[j]));
               if(LiqIntact(tf, true, lv, sh[i]))
                  AddLiq(highs, lv, sh[i], "EQH");
              }
      for(int i=0; i<nl; i++)
         for(int j=i+1; j<nl; j++)
            if(MathAbs(BarL(tf, sl[i])-BarL(tf, sl[j]))<=eqTol)
              {
               double lv = MathMin(BarL(tf, sl[i]), BarL(tf, sl[j]));
               if(LiqIntact(tf, false, lv, sl[i]))
                  AddLiq(lows, lv, sl[i], "EQL");
              }
     }

   // Previous day high / low
   if(usePD)
     {
      double pdh = iHigh(Symbol(), PERIOD_D1, 1), pdl = iLow(Symbol(), PERIOD_D1, 1);
      int todayShift = iBarShift(Symbol(), tf, iTime(Symbol(), PERIOD_D1, 0), false);
      if(pdh>0 && todayShift>=0)
        {
         if(LiqIntact(tf, true, pdh, todayShift+1))
            AddLiq(highs, pdh, todayShift+1, "PDH");
         if(LiqIntact(tf, false, pdl, todayShift+1))
            AddLiq(lows, pdl, todayShift+1, "PDL");
        }
     }

   // Session highs / lows
   double hi, lo;
   int es;
   if(useAsia && GetLastSessionRange(AsianStartHour, 0, AsianEndHour, 0, tf, hi, lo, es))
     {
      if(LiqIntact(tf, true, hi, es))
         AddLiq(highs, hi, es, "ASIA H");
      if(LiqIntact(tf, false, lo, es))
         AddLiq(lows, lo, es, "ASIA L");
     }
   if(useLondon && GetLastSessionRange(LondonStartHour, 0, LondonEndHour, 0, tf, hi, lo, es))
     {
      if(LiqIntact(tf, true, hi, es))
         AddLiq(highs, hi, es, "LON H");
      if(LiqIntact(tf, false, lo, es))
         AddLiq(lows, lo, es, "LON L");
     }
   if(useNY && GetLastSessionRange(NewYorkStartHour, 0, NewYorkEndHour, 0, tf, hi, lo, es))
     {
      if(LiqIntact(tf, true, hi, es))
         AddLiq(highs, hi, es, "NY H");
      if(LiqIntact(tf, false, lo, es))
         AddLiq(lows, lo, es, "NY L");
     }

   // Swing highs / lows
   if(useSwing)
     {
      for(int i=0; i<nh; i++)
        {
         if(LiqIntact(tf, true, BarH(tf, sh[i]), sh[i]))
           {
            AddLiq(highs, BarH(tf, sh[i]), sh[i], "SWH");
            if(!allSwings)
               break;
           }
        }
      for(int i=0; i<nl; i++)
        {
         if(LiqIntact(tf, false, BarL(tf, sl[i]), sl[i]))
           {
            AddLiq(lows, BarL(tf, sl[i]), sl[i], "SWL");
            if(!allSwings)
               break;
           }
        }
     }
  }

//--- nearest liquidity target beyond entry in trade direction (0 if none)
double LiquidityTarget(int tf, int dir, double entry, int lookback, int str)
  {
   TLiq hs[], ls[];
   BuildLiquidity(tf, lookback, str, true, Pips(2.0), true, true, true, false, false, false, hs, ls);
   double minDist = MathMax(Pips(MinStopLossPips), MarketInfo(Symbol(), MODE_STOPLEVEL)*Point);
   double best = 0.0;
   if(dir>0)
     {
      for(int i=0; i<ArraySize(hs); i++)
         if(hs[i].price>entry+minDist && (best==0.0 || hs[i].price<best))
            best = hs[i].price;
     }
   else
     {
      for(int i=0; i<ArraySize(ls); i++)
         if(ls[i].price<entry-minDist && (best==0.0 || ls[i].price>best))
            best = ls[i].price;
     }
   return(best);
  }

//--- find most recent unfilled FVG in trade direction between startShift (older) and bar 1
//    Bullish FVG: low[a] > high[a+2]  -> zone [high[a+2], low[a]]
//    Bearish FVG: high[a] < low[a+2]  -> zone [high[a], low[a+2]]
bool FindFVG(int tf, int dir, int startShift, double minSize, bool requireDisp,
             double &top, double &bottom, datetime &tStart, datetime &tEnd)
  {
   for(int a=1; a+2<=startShift; a++)
     {
      double t = 0, b = 0;
      if(dir>0)
        {
         if(BarL(tf, a)<=BarH(tf, a+2))
            continue;
         if(requireDisp && BarC(tf, a+1)<=BarO(tf, a+1))
            continue;
         b = BarH(tf, a+2);
         t = BarL(tf, a);
        }
      else
        {
         if(BarH(tf, a)>=BarL(tf, a+2))
            continue;
         if(requireDisp && BarC(tf, a+1)>=BarO(tf, a+1))
            continue;
         t = BarL(tf, a+2);
         b = BarH(tf, a);
        }
      if(t-b<minSize)
         continue;
      // must not be fully filled by later candles
      bool filled = false;
      for(int k=a-1; k>=1; k--)
        {
         if(dir>0 && BarL(tf, k)<=b)
            filled = true;
         if(dir<0 && BarH(tf, k)>=t)
            filled = true;
        }
      if(filled)
         continue;
      top = t;
      bottom = b;
      tStart = BarT(tf, a+2);
      tEnd = BarT(tf, a);
      return(true);
     }
   return(false);
  }

//+------------------------------------------------------------------+
//| ================= STRATEGY 1 =================================== |
//| Trendline + Marubozu Breakout + Retest                           |
//+------------------------------------------------------------------+
void ResetS1(TS1Setup &st)
  {
   st.phase = S1_IDLE;
   st.t1 = 0;
   st.p1 = 0;
   st.t2 = 0;
   st.p2 = 0;
   st.breakTime = 0;
   st.breakLevel = 0;
   st.breakHigh = 0;
   st.breakLow = 0;
   st.retestTime = 0;
   st.bars = 0;
  }

//--- trendline value at a given bar shift (line through the two swing anchors)
double S1LineValue(TS1Setup &st, int tf, int shift)
  {
   int sh1 = iBarShift(Symbol(), tf, st.t1, false);
   int sh2 = iBarShift(Symbol(), tf, st.t2, false);
   if(sh1==sh2)
      return(st.p2);
   double slope = (st.p2-st.p1)/(double)(sh1-sh2);   // price change per bar forward
   return(st.p2+slope*(sh2-shift));
  }

void S1Process()
  {
   int tf = StratTF(ST_S1);
   string m1 = S1Step(gS1Buy, 1, tf);
   string m2 = S1Step(gS1Sell, -1, tf);
   if(gSignalBar[ST_S1]==BarT(tf, 1))
      gState[ST_S1] = "Signal Detected";
   else
      if(gS1Buy.phase!=S1_IDLE || gS1Sell.phase!=S1_IDLE)
         gState[ST_S1] = "Waiting";
      else
         gState[ST_S1] = "Active";
   SetCond(ST_S1, "BUY: " + m1 + " | SELL: " + m2);
  }

//--- one direction of S1; returns a short status message
string S1Step(TS1Setup &st, int dir, int tf)
  {
   if(!DirAllowed(dir))
      return("direction disabled");
   string tag = (dir>0 ? "S1B" : "S1S");

   //================ PHASE 0: trend + trendline + breakout ================
   if(st.phase==S1_IDLE)
     {
      int sw[];
      // BUY needs a prior DOWNtrend: trendline on the last two LOWER HIGHS
      // SELL needs a prior UPtrend : trendline on the last two HIGHER LOWS
      int n = CollectSwings(tf, dir>0, 2, S1_SwingLookback, S1_SwingStrength, sw, 2);
      if(n<2)
         return("no 2 swings for trendline");
      int newer = sw[0], older = sw[1];
      double pNew = (dir>0 ? BarH(tf, newer) : BarL(tf, newer));
      double pOld = (dir>0 ? BarH(tf, older) : BarL(tf, older));
      if(older-newer<S1_MinSwingSeparation)
         return("swings too close");
      if(dir>0 && pNew>=pOld)
         return("no lower highs (no downtrend)");
      if(dir<0 && pNew<=pOld)
         return("no higher lows (no uptrend)");
      if(S1_RequireStructureTrend)
        {
         int sw2[];
         if(CollectSwings(tf, dir<0, 2, S1_SwingLookback, S1_SwingStrength, sw2, 2)<2)
            return("structure swings missing");
         double a = (dir>0 ? BarL(tf, sw2[0]) : BarH(tf, sw2[0]));
         double b = (dir>0 ? BarL(tf, sw2[1]) : BarH(tf, sw2[1]));
         if(dir>0 && a>=b)
            return("no lower lows (weak downtrend)");
         if(dir<0 && a<=b)
            return("no higher highs (weak uptrend)");
        }

      TS1Setup tmp;
      ResetS1(tmp);
      tmp.t1 = BarT(tf, older);
      tmp.p1 = pOld;
      tmp.t2 = BarT(tf, newer);
      tmp.p2 = pNew;

      // Line must not have been broken (by a close) between the newer swing and bar 2
      for(int s=newer-1; s>=2; s--)
        {
         double lv = S1LineValue(tmp, tf, s);
         if((dir>0 && BarC(tf, s)>lv) || (dir<0 && BarC(tf, s)<lv))
            return("trendline already broken earlier");
        }

      double line1 = S1LineValue(tmp, tf, 1);
      double c1 = BarC(tf, 1), o1 = BarO(tf, 1);
      DrawS1Trendline(tmp, tf, tag, false);

      bool broke = (dir>0 ? c1>line1+Pips(S1_MinBreakDistancePips) : c1<line1-Pips(S1_MinBreakDistancePips));
      if(!broke)
         return("waiting trendline break @" + PriceStr(line1));
      if(dir>0 && c1<=o1)
         return("break candle not bullish");
      if(dir<0 && c1>=o1)
         return("break candle not bearish");
      if(BodyRatio(tf, 1)<MinBodyToRangeRatio)
         return("break candle body/range " + D2S(BodyRatio(tf, 1)) + " < " + D2S(MinBodyToRangeRatio));
      if(S1_MinBodyATRMultiplier>0.0 && CandleBody(tf, 1)<GetATR(tf, S1_ATRPeriod)*S1_MinBodyATRMultiplier)
         return("break candle body smaller than ATR filter");

      // --- valid breakout
      st.phase = S1_WAIT_RETEST;
      st.t1 = tmp.t1;
      st.p1 = tmp.p1;
      st.t2 = tmp.t2;
      st.p2 = tmp.p2;
      st.breakTime = BarT(tf, 1);
      st.breakLevel = line1;
      st.breakHigh = BarH(tf, 1);
      st.breakLow = BarL(tf, 1);
      st.bars = 0;
      DrawS1Trendline(st, tf, tag, true);
      DrawMark(PFX+"S1BRK_"+tag+IntegerToString((int)st.breakTime), st.breakTime,
               dir>0 ? st.breakHigh : st.breakLow, "S1 TL BREAK", ClrStructure, dir>0);
      Log(StringFormat("S1 %s: strong breakout candle (body/range %.2f) broke trendline @%s - waiting retest",
                       DirStr(dir), BodyRatio(tf, 1), PriceStr(line1)));
      return("breakout detected, waiting retest");
     }

   // Levels used for retest / invalidation
   double lineNow = S1LineValue(st, tf, 1);
   double level;
   if(S1_RetestMode==RETEST_TRENDLINE)
      level = lineNow;
   else
      if(S1_RetestMode==RETEST_BREAK_LEVEL)
         level = st.breakLevel;
      else
         level = (dir>0 ? MathMax(lineNow, st.breakLevel) : MathMin(lineNow, st.breakLevel));
   double deepLevel = (dir>0 ? MathMin(lineNow, st.breakLevel) : MathMax(lineNow, st.breakLevel));
   double c1 = BarC(tf, 1);
   st.bars++;
   DrawS1Trendline(st, tf, tag, true);

   // Invalidation: closed back through the level
   if((dir>0 && c1<deepLevel-Pips(S1_InvalidationPips)) || (dir<0 && c1>deepLevel+Pips(S1_InvalidationPips)))
     {
      Log("S1 " + DirStr(dir) + ": setup invalidated (closed back through the broken trendline)");
      ResetS1(st);
      return("invalidated, searching new setup");
     }

   //================ PHASE 1: wait retest ================
   if(st.phase==S1_WAIT_RETEST)
     {
      if(st.bars>S1_MaxBarsForRetest)
        {
         Log("S1 " + DirStr(dir) + ": no retest within " + IntegerToString(S1_MaxBarsForRetest) + " bars - setup cancelled");
         ResetS1(st);
         return("retest timeout");
        }
      bool retest = (dir>0 ? BarL(tf, 1)<=level+Pips(S1_RetestTolerancePips)
                     : BarH(tf, 1)>=level-Pips(S1_RetestTolerancePips));
      if(!retest)
         return("waiting retest of " + PriceStr(level) + " (" + IntegerToString(st.bars) + "/" + IntegerToString(S1_MaxBarsForRetest) + ")");
      st.retestTime = BarT(tf, 1);
      st.phase = S1_WAIT_CONF;
      st.bars = 0;
      DrawMark(PFX+"S1RT_"+tag+IntegerToString((int)st.retestTime), st.retestTime,
               dir>0 ? BarL(tf, 1) : BarH(tf, 1), "S1 RETEST", ClrStructure, dir<0);
      if(!S1_AllowSameBarConfirm)
         return("retest done, waiting confirmation candle");
     }
   else
      if(st.bars>S1_MaxBarsForConfirm)
        {
         Log("S1 " + DirStr(dir) + ": no confirmation within " + IntegerToString(S1_MaxBarsForConfirm) + " bars - setup cancelled");
         ResetS1(st);
         return("confirmation timeout");
        }

   //================ PHASE 2: confirmation ================
   bool conf = IsConfirmCandle(tf, 1, dir, S1_ConfirmMode, S1_ConfirmMinBodyRatio);
   bool closedOk = (dir>0 ? c1>deepLevel : c1<deepLevel);
   if(!conf || !closedOk)
      return("retest done, waiting confirmation candle");

   // --- ENTRY
   RefreshRates();
   double entry = (dir>0 ? Ask : Bid);
   double sl = S1StopLoss(st, dir, tf, entry);
   double tp = S1TakeProfit(dir, tf, entry, sl);
   string reason = StringFormat("Trendline break + retest + %s confirmation", ConfirmName(S1_ConfirmMode));
   int res = ExecuteSignal(ST_S1, dir, entry, sl, tp, reason, st.breakTime, false);
   if(res!=0)
     {
      ResetS1(st);                    // setup consumed (traded / duplicate / invalid)
      return(res>0 ? "SIGNAL EXECUTED" : "signal consumed (see log)");
     }
   return("signal blocked by filters - will retry on next confirmation");
  }

double S1StopLoss(TS1Setup &st, int dir, int tf, double entry)
  {
   double buf = Pips(S1_SLBufferPips);
   double sl = 0;
   if(S1_SLMode==S1_SL_ATR)
     {
      double atr = GetATR(tf, S1_ATRPeriod);
      sl = (dir>0 ? entry-atr*S1_ATRMultiplierSL : entry+atr*S1_ATRMultiplierSL);
     }
   else
      if(S1_SLMode==S1_SL_LAST_SWING)
        {
         int s = FindSwing(tf, dir<0, 1, S1_SwingLookback, S1_SwingStrength);
         if(s>0)
            sl = (dir>0 ? BarL(tf, s)-buf : BarH(tf, s)+buf);
         if(s<=0 || (dir>0 && sl>=entry) || (dir<0 && sl<=entry))
            sl = (dir>0 ? st.breakLow-buf : st.breakHigh+buf);   // fallback
        }
      else
         sl = (dir>0 ? st.breakLow-buf : st.breakHigh+buf);
   return(NP(sl));
  }

double S1TakeProfit(int dir, int tf, double entry, double sl)
  {
   double risk = MathAbs(entry-sl);
   double rrTP = (dir>0 ? entry+risk*S1_RiskReward : entry-risk*S1_RiskReward);
   if(S1_TPMode==S1_TP_LIQUIDITY)
     {
      double t = LiquidityTarget(tf, dir, entry, S1_LiquidityLookback, S1_SwingStrength);
      if(t>0 && risk>0 && MathAbs(t-entry)/risk>=S1_MinRRForLiquidityTP)
         return(NP(t));
      Log("S1: no liquidity target with RR >= " + D2S(S1_MinRRForLiquidityTP) + " - using fixed RR");
     }
   else
      if(S1_TPMode==S1_TP_MANUAL)
        {
         double t = PanelManualTP(dir, entry);
         if(t>0)
            return(NP(t));
         Log("S1: manual TP not set/invalid on panel - using fixed RR");
        }
   return(NP(rrTP));
  }

string ConfirmName(int mode)
  {
   if(mode==CONFIRM_DIRECTIONAL_CLOSE)
      return("directional close");
   if(mode==CONFIRM_ENGULFING)
      return("engulfing");
   if(mode==CONFIRM_PINBAR)
      return("pin bar");
   return("price action");
  }

//+------------------------------------------------------------------+
//| ================= FVG SETUP ENGINE (S2 / S3) =================== |
//+------------------------------------------------------------------+
void ResetFvg(TFvgSetup &st)
  {
   if(st.ticket>0)
      DeletePendingTicket(st.ticket);
   st.phase = PH_IDLE;
   st.triggerTime = 0;
   st.extreme = 0;
   st.structLevel = 0;
   st.structTime = 0;
   st.bosTime = 0;
   st.fvgTop = 0;
   st.fvgBottom = 0;
   st.fvgStart = 0;
   st.fvgEnd = 0;
   st.liqName = "";
   st.liqPrice = 0;
   st.bars = 0;
   st.ticket = 0;
  }

void GetFvgParams(int s, TFvgParams &p)
  {
   if(s==ST_S2)
     {
      p.tf = TF(EntryTimeframe);
      p.minStructBreak = Pips(S2_MinMSSBreakPips);
      p.maxBarsBOS = S2_MaxBarsForMSS;
      p.minFVG = Pips(S2_MinFVGPips);
      p.requireDisp = S2_RequireDisplacement;
      p.maxBarsFVG = S2_MaxBarsForFVG;
      p.entryMode = S2_EntryMode;
      p.entryPct = S2_EntryPercentOfFVG;
      p.requireConfirm = S2_RequireConfirmation;
      p.maxBarsRetest = S2_MaxBarsForRetest;
      p.invalidBeyond = Pips(S2_InvalidateBeyondFVGPips);
      p.bosLabel = "MSS";
     }
   else
     {
      p.tf = TF(S3_Timeframe);
      p.minStructBreak = MinimumBreakoutPoints*Point;
      p.maxBarsBOS = S3_MaxBarsForBOS;
      p.minFVG = Pips(S3_MinFVGPips);
      p.requireDisp = S3_RequireDisplacement;
      p.maxBarsFVG = S3_MaxBarsForFVG;
      p.entryMode = S3_EntryMode;
      p.entryPct = S3_EntryPercentOfFVG;
      p.requireConfirm = S3_RequireConfirmation;
      p.maxBarsRetest = S3_MaxBarsForRetest;
      p.invalidBeyond = Pips(S3_InvalidateBeyondFVGPips);
      p.bosLabel = "BOS";
     }
  }

//--- entry level inside the FVG (0% = edge nearest to price, 100% = far edge)
double FvgEntryLevel(TFvgSetup &st, int dir, double pct)
  {
   double h = st.fvgTop-st.fvgBottom;
   if(dir>0)
      return(NP(st.fvgTop-h*pct/100.0));
   return(NP(st.fvgBottom+h*pct/100.0));
  }

//--- structure level for MSS/BOS: last swing opposite to the sweep, before the trigger bar
void SetStructureLevel(TFvgSetup &st, int dir, int tf, int triggerShift, int lookback, int str)
  {
   int s = FindSwing(tf, dir>0, triggerShift, lookback, str);
   if(s<0)
     {
      int cnt = (int)MathMax(lookback, 3);
      s = (dir>0 ? iHighest(Symbol(), tf, MODE_HIGH, cnt, triggerShift) : iLowest(Symbol(), tf, MODE_LOW, cnt, triggerShift));
     }
   st.structLevel = (dir>0 ? BarH(tf, s) : BarL(tf, s));
   st.structTime = BarT(tf, s);
  }

//--- advance an S2/S3 setup after its trigger (phases 1..4). Returns status text.
string AdvanceFvgSetup(int s, TFvgSetup &st, int dir, bool entriesAllowed)
  {
   TFvgParams p;
   GetFvgParams(s, p);
   int tf = p.tf;
   string tag = StratShort(s) + (dir>0 ? "B" : "S");
   double h1 = BarH(tf, 1), l1 = BarL(tf, 1), c1 = BarC(tf, 1), o1 = BarO(tf, 1);

   //================ PHASE 1: MSS / BOS ================
   if(st.phase==PH_WAIT_BOS)
     {
      st.bars++;
      if(dir>0 && l1<st.extreme)
         st.extreme = l1;
      if(dir<0 && h1>st.extreme)
         st.extreme = h1;
      bool bos = (dir>0 ? c1>st.structLevel+p.minStructBreak : c1<st.structLevel-p.minStructBreak);
      if(!bos)
        {
         if(st.bars>p.maxBarsBOS)
           {
            Log(StratShort(s) + " " + DirStr(dir) + ": no " + p.bosLabel + " within " + IntegerToString(p.maxBarsBOS) + " bars - reset");
            ResetFvg(st);
            return(p.bosLabel + " timeout");
           }
         return("waiting " + p.bosLabel + " close beyond " + PriceStr(st.structLevel) +
                " (" + IntegerToString(st.bars) + "/" + IntegerToString(p.maxBarsBOS) + ")");
        }
      st.bosTime = BarT(tf, 1);
      st.phase = PH_WAIT_FVG;
      st.bars = 0;
      DrawStructure(PFX+tag+"BOS_"+IntegerToString((int)st.bosTime), st.structTime, st.bosTime, st.structLevel,
                    StratShort(s) + " " + p.bosLabel);
      Log(StringFormat("%s %s: %s confirmed (close %s beyond %s)", StratShort(s), DirStr(dir), p.bosLabel,
                       PriceStr(c1), PriceStr(st.structLevel)));
      // fall through: the displacement candle itself may complete the FVG
     }

   //================ PHASE 2: FVG ================
   if(st.phase==PH_WAIT_FVG)
     {
      int trig = iBarShift(Symbol(), tf, st.triggerTime, false);
      double t = 0, b = 0;
      datetime ts = 0, te = 0;
      if(!FindFVG(tf, dir, trig, p.minFVG, p.requireDisp, t, b, ts, te))
        {
         st.bars++;
         if(st.bars>p.maxBarsFVG)
           {
            Log(StratShort(s) + " " + DirStr(dir) + ": no valid FVG after " + p.bosLabel + " - reset");
            ResetFvg(st);
            return("FVG timeout");
           }
         return(p.bosLabel + " done, waiting valid FVG");
        }
      st.fvgTop = t;
      st.fvgBottom = b;
      st.fvgStart = ts;
      st.fvgEnd = te;
      st.phase = PH_WAIT_RET;
      st.bars = 0;
      Log(StringFormat("%s %s: FVG %s - %s detected, waiting retest", StratShort(s), DirStr(dir), PriceStr(b), PriceStr(t)));
      DrawFVG(PFX+tag+"FVG_"+IntegerToString((int)ts), ts, BarT(tf, 0), t, b, dir, StratShort(s) + " FVG");
      if(p.entryMode==FVG_ENTRY_LIMIT_ORDER && entriesAllowed)
        {
         PlaceFvgLimit(s, st, dir, p);
         return("limit order at FVG placed");
        }
      return("FVG found, waiting retest");
     }

   //================ PHASE 3/4: retest ================
   if(st.phase==PH_WAIT_RET || st.phase==PH_PENDING)
     {
      st.bars++;
      DrawFVG(PFX+tag+"FVG_"+IntegerToString((int)st.fvgStart), st.fvgStart, BarT(tf, 0), st.fvgTop, st.fvgBottom, dir, StratShort(s) + " FVG");

      // pending order state
      if(st.phase==PH_PENDING)
        {
         int state = PendingState(st.ticket);
         if(state==1)
           {
            Log(StratShort(s) + " " + DirStr(dir) + ": FVG limit order #" + IntegerToString(st.ticket) + " filled");
            st.ticket = 0;
            ResetFvg(st);
            return("limit filled");
           }
         if(state==-1)
           {
            st.ticket = 0;
            ResetFvg(st);
            return("limit order removed");
           }
        }

      if(st.bars>p.maxBarsRetest)
        {
         Log(StratShort(s) + " " + DirStr(dir) + ": FVG not retested within " + IntegerToString(p.maxBarsRetest) + " bars - reset");
         ResetFvg(st);
         return("retest timeout");
        }
      if((dir>0 && c1<st.fvgBottom-p.invalidBeyond) || (dir<0 && c1>st.fvgTop+p.invalidBeyond))
        {
         Log(StratShort(s) + " " + DirStr(dir) + ": candle closed through the FVG - setup invalidated");
         ResetFvg(st);
         return("FVG invalidated");
        }
      if(st.phase==PH_PENDING)
         return("limit order waiting at " + PriceStr(FvgEntryLevel(st, dir, p.entryPct)));

      if(p.entryMode==FVG_ENTRY_LIMIT_ORDER)
        {
         if(entriesAllowed)
            PlaceFvgLimit(s, st, dir, p);
         return("waiting to place limit order");
        }

      double lvl = FvgEntryLevel(st, dir, p.entryPct);
      bool touched = BarT(tf, 1)>st.fvgEnd && (dir>0 ? l1<=lvl : h1>=lvl);
      if(!touched)
         return("waiting retest of FVG entry " + PriceStr(lvl) + " (" + IntegerToString(st.bars) + "/" + IntegerToString(p.maxBarsRetest) + ")");
      if(p.requireConfirm)
        {
         bool conf = (dir>0 ? (c1>o1 && c1>st.fvgBottom) : (c1<o1 && c1<st.fvgTop));
         if(!conf)
            return("FVG touched, waiting confirmation close");
        }
      if(!entriesAllowed)
         return("FVG retest confirmed but entries not allowed now (session/range limit)");

      // --- ENTRY
      RefreshRates();
      double entry = (dir>0 ? Ask : Bid);
      double sl, tp;
      FvgStopsTargets(s, st, dir, entry, sl, tp);
      string reason = "Reference range trigger + MSS + FVG retest";
      if(s==ST_S3)
         reason = "Liquidity " + st.liqName + " sweep + BOS + FVG retest";
      int res = ExecuteSignal(s, dir, entry, sl, tp, reason, st.triggerTime, false);
      if(res!=0)
        {
         if(res>0 && s==ST_S2)
            gS2RangeTrades++;
         ResetFvg(st);
         return(res>0 ? "SIGNAL EXECUTED" : "signal consumed (see log)");
        }
      return("signal blocked by filters - waiting");
     }
   return("idle");
  }

//--- place a limit order at the FVG entry level
void PlaceFvgLimit(int s, TFvgSetup &st, int dir, TFvgParams &p)
  {
   double lvl = FvgEntryLevel(st, dir, p.entryPct);
   double sl, tp;
   FvgStopsTargets(s, st, dir, lvl, sl, tp);
   string reason = StratShort(s) + " FVG limit entry";
   RefreshRates();
   // limit must be on the correct side of the market; otherwise wait for confirm logic
   if((dir>0 && lvl>=Ask) || (dir<0 && lvl<=Bid))
     {
      Log(StratShort(s) + ": price already inside FVG entry level - limit not placed yet");
      return;
     }
   int res = ExecuteSignal(s, dir, lvl, sl, tp, reason, st.triggerTime, true);
   if(res>0)
     {
      st.ticket = res;
      st.phase = PH_PENDING;
      if(s==ST_S2)
         gS2RangeTrades++;
     }
   else
      if(res<0)
         ResetFvg(st);
  }

//--- SL / TP for S2 and S3
void FvgStopsTargets(int s, TFvgSetup &st, int dir, double entry, double &sl, double &tp)
  {
   int tf = StratTF(s);
   double buf, atr, rr, risk;
   if(s==ST_S2)
     {
      buf = Pips(S2_SLBufferPips);
      if(S2_SLMode==S2_SL_ATR)
        {
         atr = GetATR(tf, S2_ATRPeriod);
         sl = (dir>0 ? entry-atr*S2_ATRMultiplierSL : entry+atr*S2_ATRMultiplierSL);
        }
      else
         if(S2_SLMode==S2_SL_SWING)
            sl = (dir>0 ? st.extreme-buf : st.extreme+buf);
         else
            sl = (dir>0 ? st.fvgBottom-buf : st.fvgTop+buf);
      if((dir>0 && sl>=entry) || (dir<0 && sl<=entry))
         sl = (dir>0 ? st.fvgBottom-buf : st.fvgTop+buf);
      risk = MathAbs(entry-sl);
      rr = S2_RiskReward;
      tp = (dir>0 ? entry+risk*rr : entry-risk*rr);
      double t = 0;
      if(S2_TPMode==S2_TP_OPPOSITE_RANGE)
        {
         double height = gS2RefHigh-gS2RefLow;
         if(dir>0)
            t = (gS2RefHigh>entry ? gS2RefHigh : gS2RefHigh+height);  // breakout: measured move
         else
            t = (gS2RefLow<entry ? gS2RefLow : gS2RefLow-height);
        }
      else
         if(S2_TPMode==S2_TP_LIQUIDITY)
            t = LiquidityTarget(tf, dir, entry, S2_LiquidityLookback, S2_SwingStrength);
      if(S2_TPMode!=S2_TP_RR)
        {
         if(t>0 && risk>0 && ((dir>0 && t>entry) || (dir<0 && t<entry)) && MathAbs(t-entry)/risk>=S2_MinRRForStructureTP)
            tp = t;
         else
            Log("S2: structural TP unavailable or RR < " + D2S(S2_MinRRForStructureTP) + " - using fixed RR");
        }
     }
   else
     {
      buf = Pips(S3_SLBufferPips);
      if(S3_SLMode==S3_SL_ATR)
        {
         atr = GetATR(tf, S3_ATRPeriod);
         sl = (dir>0 ? entry-atr*S3_ATRMultiplierSL : entry+atr*S3_ATRMultiplierSL);
        }
      else
         if(S3_SLMode==S3_SL_LIQUIDITY)
            sl = (dir>0 ? st.extreme-buf : st.extreme+buf);
         else
            sl = (dir>0 ? st.fvgBottom-buf : st.fvgTop+buf);
      if((dir>0 && sl>=entry) || (dir<0 && sl<=entry))
         sl = (dir>0 ? st.extreme-buf : st.extreme+buf);
      risk = MathAbs(entry-sl);
      rr = S3_RiskReward;
      tp = (dir>0 ? entry+risk*rr : entry-risk*rr);
      if(S3_TPMode==S3_TP_LIQUIDITY)
        {
         double t = 0;
         if(dir>0)
           {
            for(int i=0; i<ArraySize(gLiqHigh); i++)
               if(gLiqHigh[i].price>entry && (t==0 || gLiqHigh[i].price<t))
                  t = gLiqHigh[i].price;
           }
         else
           {
            for(int i=0; i<ArraySize(gLiqLow); i++)
               if(gLiqLow[i].price<entry && (t==0 || gLiqLow[i].price>t))
                  t = gLiqLow[i].price;
           }
         if(t>0 && risk>0 && MathAbs(t-entry)/risk>=S3_MinRRForLiquidityTP)
            tp = t;
         else
            Log("S3: no opposite liquidity with RR >= " + D2S(S3_MinRRForLiquidityTP) + " - using fixed RR");
        }
     }
   sl = NP(sl);
   tp = NP(tp);
  }

//+------------------------------------------------------------------+
//| ================= STRATEGY 2 =================================== |
//| One Candle Range + MSS + FVG                                     |
//+------------------------------------------------------------------+
bool S2GetReference(double &hi, double &lo, datetime &refTime)
  {
   int rtf = TF(ReferenceTimeframe);
   int shift = -1;
   if(ReferenceCandleMode==REF_LAST_CLOSED)
      shift = 1;
   else
     {
      int hh = S2_ReferenceHour, mm = 0;
      if(ReferenceCandleMode==REF_SESSION_FIRST)
        {
         int eh, em;
         SessionHours(TradingSession, hh, mm, eh, em);
        }
      for(int i=1; i<500; i++)
        {
         datetime t = iTime(Symbol(), rtf, i);
         if(t==0)
            break;
         // first reference bar whose period contains hh:mm
         int barStart = TimeHour(t)*60+TimeMinute(t);
         int target = hh*60+mm;
         int len = PeriodSeconds(rtf)/60;
         if(len>=1440 || (target>=barStart && target<barStart+len))
           {
            shift = i;
            break;
           }
        }
     }
   if(shift<1)
      return(false);
   refTime = iTime(Symbol(), rtf, shift);
   hi = iHigh(Symbol(), rtf, shift);
   lo = iLow(Symbol(), rtf, shift);
   return(refTime>0 && hi>lo);
  }

void S2Process()
  {
   int tf = TF(EntryTimeframe);
   int rtf = TF(ReferenceTimeframe);
   double hi, lo;
   datetime rt;
   if(!S2GetReference(hi, lo, rt))
     {
      gState[ST_S2] = "Active";
      SetCond(ST_S2, "reference candle not found (check mode / hour)");
      return;
     }

   // New reference range -> reset setups
   if(rt!=gS2RefTime)
     {
      ResetFvg(gS2Buy);
      ResetFvg(gS2Sell);
      gS2RefTime = rt;
      gS2RefHigh = hi;
      gS2RefLow = lo;
      gS2RangeTrades = 0;
      Log(StringFormat("S2: new reference %s candle %s  High=%s Low=%s", TFName(rtf), TimeToString(rt),
                       PriceStr(hi), PriceStr(lo)));
     }
   DrawRefRange();

   if(ReferenceCandleMode!=REF_LAST_CLOSED && S2_RequireSameDayReference)
     {
      datetime now = BarT(tf, 0);
      if(gS2RefTime-(datetime)((long)gS2RefTime%86400)!=now-(datetime)((long)now%86400))
        {
         gState[ST_S2] = "Active";
         SetCond(ST_S2, "waiting for today's reference candle");
         return;
        }
     }

   datetime refClose = gS2RefTime+PeriodSeconds(rtf);
   if(BarT(tf, 1)<refClose)
     {
      gState[ST_S2] = "Active";
      SetCond(ST_S2, "waiting reference candle to close");
      return;
     }
   bool inSes = !S2_OnlyTradeInSession || InSession(TradingSession, BarT(tf, 1));
   bool rangeOk = gS2RangeTrades<S2_MaxTradesPerRange;
   bool entriesAllowed = inSes && rangeOk;

   string m1 = S2Step(gS2Buy, 1, tf, entriesAllowed);
   string m2 = S2Step(gS2Sell, -1, tf, entriesAllowed);

   if(gSignalBar[ST_S2]==BarT(tf, 1))
      gState[ST_S2] = "Signal Detected";
   else
      if(gS2Buy.phase!=PH_IDLE || gS2Sell.phase!=PH_IDLE)
         gState[ST_S2] = "Waiting";
      else
         gState[ST_S2] = "Active";
   string pre = "";
   if(!inSes)
      pre = "[outside session] ";
   if(!rangeOk)
      pre = "[max trades for this range reached] ";
   SetCond(ST_S2, pre + "BUY: " + m1 + " | SELL: " + m2);
  }

string S2Step(TFvgSetup &st, int dir, int tf, bool entriesAllowed)
  {
   if(!DirAllowed(dir))
      return("direction disabled");
   if(st.phase!=PH_IDLE)
      return(AdvanceFvgSetup(ST_S2, st, dir, entriesAllowed));
   if(!entriesAllowed)
      return("no new triggers now");

   double h1 = BarH(tf, 1), l1 = BarL(tf, 1), c1 = BarC(tf, 1);
   bool useBreak = (S2_SetupMode!=S2_SWEEP_ONLY);
   bool useSweep = (S2_SetupMode!=S2_BREAKOUT_ONLY);
   string tag = (dir>0 ? "S2B" : "S2S");

   // --- Sweep (liquidity grab of the opposite side, reversal)
   if(useSweep)
     {
      bool sweep = (dir>0 ? l1<gS2RefLow-Pips(S2_MinSweepPips) && (!S2_SweepRequireCloseInside || c1>gS2RefLow)
                    : h1>gS2RefHigh+Pips(S2_MinSweepPips) && (!S2_SweepRequireCloseInside || c1<gS2RefHigh));
      if(sweep)
        {
         st.phase = PH_WAIT_BOS;
         st.triggerTime = BarT(tf, 1);
         st.extreme = (dir>0 ? l1 : h1);
         st.bars = 0;
         SetStructureLevel(st, dir, tf, 2, S2_StructureLookback, S2_SwingStrength);
         DrawMark(PFX+tag+"SWP_"+IntegerToString((int)st.triggerTime), st.triggerTime, st.extreme,
                  dir>0 ? "S2 SWEEP LOW" : "S2 SWEEP HIGH", ClrLiquidity, dir<0);
         Log(StringFormat("S2 %s: range %s swept (%s) - waiting MSS beyond %s", DirStr(dir), dir>0 ? "LOW" : "HIGH",
                          PriceStr(st.extreme), PriceStr(st.structLevel)));
         return(AdvanceFvgSetup(ST_S2, st, dir, entriesAllowed));
        }
     }
   // --- Breakout (continuation): close beyond the range is the structure break
   if(useBreak)
     {
      double c2 = BarC(tf, 2);
      bool brk = (dir>0 ? c1>gS2RefHigh+Pips(S2_MinBreakPips) && c2<=gS2RefHigh+Pips(S2_MinBreakPips)
                  : c1<gS2RefLow-Pips(S2_MinBreakPips) && c2>=gS2RefLow-Pips(S2_MinBreakPips));
      if(brk)
        {
         st.phase = PH_WAIT_BOS;
         st.triggerTime = BarT(tf, 1);
         int cnt = (int)MathMax(iBarShift(Symbol(), tf, gS2RefTime+PeriodSeconds(TF(ReferenceTimeframe)), false), 1);
         st.extreme = (dir>0 ? BarL(tf, iLowest(Symbol(), tf, MODE_LOW, cnt, 1)) : BarH(tf, iHighest(Symbol(), tf, MODE_HIGH, cnt, 1)));
         st.structLevel = (dir>0 ? gS2RefHigh : gS2RefLow);
         st.structTime = gS2RefTime;
         st.bars = 0;
         // Allow FVG search to include the displacement leading into the break
         st.triggerTime = BarT(tf, (int)MathMin(cnt, 6));
         Log(StringFormat("S2 %s: reference range %s broken by close %s", DirStr(dir), dir>0 ? "HIGH" : "LOW", PriceStr(c1)));
         return(AdvanceFvgSetup(ST_S2, st, dir, entriesAllowed));
        }
     }
   string what = (useBreak && useSweep ? "break/sweep" : (useBreak ? "break" : "sweep"));
   return("waiting range " + what + " [" + PriceStr(gS2RefLow) + " - " + PriceStr(gS2RefHigh) + "]");
  }

//+------------------------------------------------------------------+
//| ================= STRATEGY 3 =================================== |
//| Liquidity + BOS + FVG                                            |
//+------------------------------------------------------------------+
void S3Process()
  {
   int tf = TF(S3_Timeframe);
   BuildLiquidity(tf, S3_LiquidityLookback, S3_SwingStrength, S3_UseEqualHighsLows, Pips(S3_EqualTolerancePips),
                  S3_UsePreviousSwing, false, S3_UsePreviousDayHL, S3_UseAsianSessionHL, S3_UseLondonSessionHL,
                  S3_UseNewYorkSessionHL, gLiqHigh, gLiqLow);
   DrawLiquidity(tf);

   string m1 = S3Step(gS3Buy, 1, tf);
   string m2 = S3Step(gS3Sell, -1, tf);

   if(gSignalBar[ST_S3]==BarT(tf, 1))
      gState[ST_S3] = "Signal Detected";
   else
      if(gS3Buy.phase!=PH_IDLE || gS3Sell.phase!=PH_IDLE)
         gState[ST_S3] = "Waiting";
      else
         gState[ST_S3] = "Active";
   SetCond(ST_S3, "BUY: " + m1 + " | SELL: " + m2);
  }

string S3Step(TFvgSetup &st, int dir, int tf)
  {
   if(!DirAllowed(dir))
      return("direction disabled");
   if(st.phase!=PH_IDLE)
      return(AdvanceFvgSetup(ST_S3, st, dir, true));

   double h1 = BarH(tf, 1), l1 = BarL(tf, 1), c1 = BarC(tf, 1);
   string tag = (dir>0 ? "S3B" : "S3S");
   // BUY: sweep of sell-side liquidity (lows).  SELL: sweep of buy-side liquidity (highs).
   int n = (dir>0 ? ArraySize(gLiqLow) : ArraySize(gLiqHigh));
   if(n==0)
      return("no intact liquidity level");
   for(int i=0; i<n; i++)
     {
      double lv = (dir>0 ? gLiqLow[i].price : gLiqHigh[i].price);
      string nm = (dir>0 ? gLiqLow[i].name : gLiqHigh[i].name);
      bool sweep = (dir>0 ? l1<lv-Pips(S3_MinSweepPips) && (!S3_RequireCloseBackInside || c1>lv)
                    : h1>lv+Pips(S3_MinSweepPips) && (!S3_RequireCloseBackInside || c1<lv));
      if(!sweep)
         continue;
      st.phase = PH_WAIT_BOS;
      st.triggerTime = BarT(tf, 1);
      st.extreme = (dir>0 ? l1 : h1);
      st.liqName = nm;
      st.liqPrice = lv;
      st.bars = 0;
      SetStructureLevel(st, dir, tf, 2, S3_StructureLookback, S3_SwingStrength);
      DrawMark(PFX+tag+"SWP_"+IntegerToString((int)st.triggerTime), st.triggerTime, st.extreme,
               "S3 " + nm + " SWEPT", ClrLiquidity, dir<0);
      Log(StringFormat("S3 %s: liquidity %s @%s swept (extreme %s) - waiting BOS beyond %s", DirStr(dir), nm,
                       PriceStr(lv), PriceStr(st.extreme), PriceStr(st.structLevel)));
      return(AdvanceFvgSetup(ST_S3, st, dir, true));
     }
   return("waiting sweep of " + IntegerToString(n) + " " + (dir>0 ? "sell-side" : "buy-side") + " level(s)");
  }

//+------------------------------------------------------------------+
//| ================= FILTERS ====================================== |
//+------------------------------------------------------------------+
bool DirAllowed(int dir)
  {
   if(TradeDirection==DIR_BUY_ONLY && dir<0)
      return(false);
   if(TradeDirection==DIR_SELL_ONLY && dir>0)
      return(false);
   return(true);
  }

double SpreadPips()
  {
   return((Ask-Bid)/gPip);
  }

bool SpreadOK()
  {
   if(MaxSpreadPips<=0)
      return(true);
   return(SpreadPips()<=MaxSpreadPips);
  }

bool TradingHoursOK()
  {
   datetime t = TimeCurrent();
   int dow = TimeDayOfWeek(t);
   if(dow==1 && !TradeOnMonday)
      return(false);
   if(dow==5 && !TradeOnFriday)
      return(false);
   if(!UseTradingHours)
      return(true);
   return(InTimeWindow(t, TradeStartHour, TradeStartMinute, TradeEndHour, TradeEndMinute));
  }

//--- count EA orders on this symbol. magic = -1 => all EA magics. type: -1 all, OP_BUY / OP_SELL market only
int CountOrders(int magic, int type, bool includePending)
  {
   int n = 0;
   for(int i=OrdersTotal()-1; i>=0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
         continue;
      if(OrderSymbol()!=Symbol() || !IsEAMagic(OrderMagicNumber()))
         continue;
      if(magic>=0 && OrderMagicNumber()!=magic)
         continue;
      int ot = OrderType();
      if(ot>OP_SELL && !includePending)
         continue;
      if(type>=0 && ot!=type)
         continue;
      n++;
     }
   return(n);
  }

//+------------------------------------------------------------------+
//| Execute a strategy signal.                                       |
//| Returns: >0 ticket (success), 0 blocked by a temporary filter    |
//|          (setup kept), -1 consumed (duplicate / invalid / error) |
//+------------------------------------------------------------------+
int ExecuteSignal(int s, int dir, double price, double sl, double tp, string reason, datetime key, bool pending)
  {
   int tf = StratTF(s);
   int magic = StratMagic(s);
   string sigTxt = StringFormat("%s %s%s @%s SL %s TP %s | %s", StratShort(s), DirStr(dir), pending ? " LIMIT" : "",
                                PriceStr(price), PriceStr(sl), PriceStr(tp), reason);

   // --- duplicate protection: same setup key already traded (survives restarts)
   string gv = PFX + Symbol() + "_" + IntegerToString(magic) + "_" + (dir>0 ? "B" : "S");
   if(KVCheck(gv) && (datetime)KVGet(gv)==key)
     {
      Log(StratShort(s) + ": duplicate signal ignored (setup already traded)");
      Diag("duplicate");
      return(-1);
     }
   if(gSignalBar[s]==BarT(tf, 1) && gSignalBar[s]!=0)
     {
      Log(StratShort(s) + ": one signal per candle - ignored");
      return(-1);
     }

   // --- register the signal (dashboard + drawing + alerts)
   gSignalBar[s] = BarT(tf, 1);
   gDiagSignals++;
   gLastSignal = sigTxt;
   gLastSignalTime = TimeCurrent();
   gLastSignalDir = dir;
   gLastSignalStrat = s;
   DrawSignal(s, dir, price, sl, tp);

   if(!gAuto || gEmergencyStop)
     {
      if(AlertSignalsWhenAutoOff)
         Notify("SIGNAL (auto trading OFF): " + sigTxt);
      Diag("auto trading OFF");
      KVSet(gv, (double)key);
      return(-1);
     }

   // --- validation of stops
   double risk = MathAbs(price-sl);
   if(sl<=0 || (dir>0 && sl>=price) || (dir<0 && sl<=price))
     {
      Log(StratShort(s) + ": invalid SL side - signal rejected. " + sigTxt);
      Diag("invalid SL");
      return(-1);
     }
   if(tp<=0 || (dir>0 && tp<=price) || (dir<0 && tp>=price))
     {
      Log(StratShort(s) + ": invalid TP side - signal rejected. " + sigTxt);
      Diag("invalid TP");
      return(-1);
     }
   if(risk<Pips(MinStopLossPips))
     {
      Log(StringFormat("%s: SL distance %.1f pips < MinStopLossPips %.1f - signal rejected", StratShort(s), risk/gPip, MinStopLossPips));
      Diag("SL < MinStopLossPips");
      return(-1);
     }
   if(MaxStopLossPips>0 && risk>Pips(MaxStopLossPips))
     {
      Log(StringFormat("%s: SL distance %.1f pips > MaxStopLossPips %.1f - signal rejected", StratShort(s), risk/gPip, MaxStopLossPips));
      Diag("SL > MaxStopLossPips");
      return(-1);
     }

   // --- temporary filters (setup kept)
   string why = "";
   string tag = "";
   if(!IsTesting() && !IsTradeAllowed())
      why = "terminal/EA trading not allowed";
   else
      if(gRiskBlock)
         why = gRiskMsg;
      else
         if(!SpreadOK())
            why = StringFormat("spread %.1f > max %.1f pips", SpreadPips(), MaxSpreadPips);
         else
            if(!TradingHoursOK())
               why = "outside trading hours";
            else
               if(MaxOpenTrades>0 && CountOrders(-1, -1, true)>=MaxOpenTrades)
                  why = "max open trades reached";
               else
                  if(MaxTradesPerStrategy>0 && CountOrders(magic, -1, true)>=MaxTradesPerStrategy)
                     why = "max trades for " + StratShort(s) + " reached";
                  else
                     if(!AllowHedging && CountOrders(-1, dir>0 ? OP_SELL : OP_BUY, false)>0)
                        why = "hedging not allowed (opposite position open)";
   if(why=="")
      why = NewsBlockText();
   if(why!="")
     {
      tag = why;
      if(StringFind(why, "spread")==0)
         tag = "spread > MaxSpreadPips";
      else
         if(StringFind(why, "max trades for")==0)
            tag = "MaxTradesPerStrategy";
         else
            if(StringFind(why, "news")>=0)
               tag = "news filter";
            else
               if(StringFind(why, "DAILY LOSS")>=0)
                  tag = "daily loss limit";
               else
                  if(StringFind(why, "MAX DRAWDOWN")>=0)
                     tag = "max drawdown";
      Diag(tag);
      Log(StratShort(s) + ": signal blocked - " + why + ". " + sigTxt);
      Notify("Signal blocked (" + why + "): " + sigTxt);
      gSignalBar[s] = 0;   // allow a retry on a later candle
      return(0);
     }

   // --- lot size
   double lots = CalcLot(s, price, sl);
   if(lots<=0)
     {
      Log(StratShort(s) + ": lot calculation failed - signal rejected");
      Diag("lot calculation");
      return(-1);
     }
   int type;
   if(pending)
      type = (dir>0 ? OP_BUYLIMIT : OP_SELLLIMIT);
   else
      type = (dir>0 ? OP_BUY : OP_SELL);
   if(!MarginOK(dir>0 ? OP_BUY : OP_SELL, lots))
     {
      Log(StratShort(s) + ": not enough free margin for " + D2S(lots) + " lots - signal rejected");
      Diag("not enough margin");
      Notify("Not enough margin: " + sigTxt);
      return(-1);
     }

   string cmt = TradeCommentPrefix + " " + StratShort(s) + " " + DirStr(dir);
   int ticket = SendOrder(type, lots, price, sl, tp, magic, cmt);
   if(ticket>0)
     {
      KVSet(gv, (double)key);
      if(s>=0 && s<STRAT_COUNT)
         gTradesOpened[s]++;
      gDiagOpened++;
      Notify("OPENED #" + IntegerToString(ticket) + " " + D2S(lots) + " lots: " + sigTxt);
      return(ticket);
     }
   return(-1);
  }

//+------------------------------------------------------------------+
//| ================= LOT / MARGIN ================================= |
//+------------------------------------------------------------------+
double NormalizeLot(double lot)
  {
   double step = MarketInfo(Symbol(), MODE_LOTSTEP);
   double bmin = MarketInfo(Symbol(), MODE_MINLOT);
   double bmax = MarketInfo(Symbol(), MODE_MAXLOT);
   if(step<=0)
      step = 0.01;
   lot = MathFloor(lot/step+1e-9)*step;
   double lo = MathMax(bmin, MinimumLot);
   double hi = MathMin(bmax, MaximumLot);
   if(lot<lo)
      lot = lo;
   if(lot>hi)
      lot = hi;
   int dg = (int)MathMax(0, MathCeil(-MathLog10(step)-1e-9));
   return(NormalizeDouble(lot, dg));
  }

//--- consecutive losses of a magic (for the optional multiplier)
int ConsecutiveLosses(int magic)
  {
   datetime lastWin = 0;
   for(int i=OrdersHistoryTotal()-1; i>=0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_HISTORY))
         continue;
      if(OrderSymbol()!=Symbol() || OrderMagicNumber()!=magic || OrderType()>OP_SELL)
         continue;
      if(OrderProfit()+OrderSwap()+OrderCommission()>=0 && OrderCloseTime()>lastWin)
         lastWin = OrderCloseTime();
     }
   int n = 0;
   for(int i=OrdersHistoryTotal()-1; i>=0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_HISTORY))
         continue;
      if(OrderSymbol()!=Symbol() || OrderMagicNumber()!=magic || OrderType()>OP_SELL)
         continue;
      if(OrderCloseTime()>lastWin && OrderProfit()+OrderSwap()+OrderCommission()<0)
         n++;
     }
   return(n);
  }

double CalcLot(int s, double entry, double sl)
  {
   double lot = FixedLot;
   if(LotMode!=LOT_FIXED)
     {
      double money = RiskMoney;
      if(LotMode==LOT_RISK_EQUITY)
         money = AccountEquity()*RiskPercent/100.0;
      if(LotMode==LOT_RISK_BALANCE)
         money = AccountBalance()*RiskPercent/100.0;
      double tv = MarketInfo(Symbol(), MODE_TICKVALUE);
      double ts = MarketInfo(Symbol(), MODE_TICKSIZE);
      double dist = MathAbs(entry-sl);
      if(tv<=0 || ts<=0 || dist<=0)
        {
         Log("CalcLot: invalid tick value/size or SL distance");
         return(0);
        }
      double lossPerLot = dist/ts*tv;
      lot = money/lossPerLot;
     }
   if(UseLossMultiplier && s>=0 && s<STRAT_COUNT)
     {
      int k = (int)MathMin(ConsecutiveLosses(StratMagic(s)), MaxMultiplierSteps);
      if(k>0)
        {
         lot *= MathPow(LossMultiplier, k);
         Log(StringFormat("Loss multiplier applied: x%.2f (%d losses)", MathPow(LossMultiplier, k), k));
        }
     }
   return(NormalizeLot(lot));
  }

bool MarginOK(int type, double lots)
  {
   ResetLastError();
   double after = AccountFreeMarginCheck(Symbol(), type, lots);
   if(after<=0 || GetLastError()==ERR_NOT_ENOUGH_MONEY)
      return(false);
   if(MinFreeMarginAfterTrade>0 && after<MinFreeMarginAfterTrade)
      return(false);
   return(true);
  }

//+------------------------------------------------------------------+
//| ================= ORDER EXECUTION ============================== |
//+------------------------------------------------------------------+
bool IsTransientError(int err)
  {
   switch(err)
     {
      case ERR_NO_RESULT:
      case ERR_COMMON_ERROR:
      case ERR_SERVER_BUSY:
      case ERR_NO_CONNECTION:
      case ERR_TOO_FREQUENT_REQUESTS:
      case ERR_TRADE_TIMEOUT:
      case ERR_INVALID_PRICE:
      case ERR_PRICE_CHANGED:
      case ERR_OFF_QUOTES:
      case ERR_BROKER_BUSY:
      case ERR_REQUOTE:
      case ERR_TOO_MANY_REQUESTS:
      case ERR_TRADE_CONTEXT_BUSY:
         return(true);
     }
   return(false);
  }

bool WaitTradeContext()
  {
   uint start = GetTickCount();
   while(IsTradeContextBusy())
     {
      if(GetTickCount()-start>10000)
         return(false);
      Sleep(100);
     }
   return(true);
  }

//--- push SL / TP outside the broker StopLevel relative to a reference price
bool FixStops(int type, double ref, double &sl, double &tp)
  {
   double minD = (MarketInfo(Symbol(), MODE_STOPLEVEL)+1)*Point;
   bool buy = (type==OP_BUY || type==OP_BUYLIMIT || type==OP_BUYSTOP);
   bool ok = true;
   if(sl>0)
     {
      if(buy && ref-sl<minD)
        {
         if(AdjustStopsToBrokerLevel)
            sl = NP(ref-minD);
         else
            ok = false;
        }
      if(!buy && sl-ref<minD)
        {
         if(AdjustStopsToBrokerLevel)
            sl = NP(ref+minD);
         else
            ok = false;
        }
     }
   if(tp>0)
     {
      if(buy && tp-ref<minD)
        {
         if(AdjustStopsToBrokerLevel)
            tp = NP(ref+minD);
         else
            ok = false;
        }
      if(!buy && ref-tp<minD)
        {
         if(AdjustStopsToBrokerLevel)
            tp = NP(ref-minD);
         else
            ok = false;
        }
     }
   return(ok);
  }

//--- send order with retries. price is used for pending orders only.
int SendOrder(int type, double lots, double price, double sl, double tp, int magic, string cmt)
  {
   for(int attempt=0; attempt<=MaxRetries; attempt++)
     {
      if(!WaitTradeContext())
        {
         Log("SendOrder: trade context busy");
         continue;
        }
      RefreshRates();
      double px;
      if(type==OP_BUY)
         px = Ask;
      else
         if(type==OP_SELL)
            px = Bid;
         else
            px = NP(price);

      // pending price distance from market
      if(type>OP_SELL)
        {
         double mkt = (type==OP_BUYLIMIT || type==OP_BUYSTOP) ? Ask : Bid;
         if(MathAbs(px-mkt)<(MarketInfo(Symbol(), MODE_STOPLEVEL)+1)*Point)
           {
            Log("SendOrder: pending price too close to market (StopLevel) - not placed");
            Diag("pending too close (StopLevel)");
            return(-1);
           }
        }
      double s = NP(sl), t = NP(tp);
      if(!FixStops(type, (type==OP_BUY ? Bid : (type==OP_SELL ? Ask : px)), s, t))
        {
         Log("SendOrder: SL/TP inside broker StopLevel and adjustment disabled - order rejected");
         Diag("SL/TP inside StopLevel");
         return(-1);
        }
      int ticket;
      if(UseECNMode && type<=OP_SELL)
         ticket = OrderSend(Symbol(), type, lots, px, SlippagePoints, 0, 0, cmt, magic, 0, type==OP_BUY ? clrBlue : clrRed);
      else
         ticket = OrderSend(Symbol(), type, lots, px, SlippagePoints, s, t, cmt, magic, 0,
                            (type==OP_BUY || type==OP_BUYLIMIT || type==OP_BUYSTOP) ? clrBlue : clrRed);
      if(ticket>0)
        {
         Log(StringFormat("ORDER SENT #%d %s %.2f lots @%s SL %s TP %s magic %d", ticket, OrderTypeName(type), lots,
                          PriceStr(px), PriceStr(s), PriceStr(t), magic));
         if(UseECNMode && type<=OP_SELL && (s>0 || t>0))
            ModifySLTP(ticket, s, t);
         return(ticket);
        }
      int err = GetLastError();
      Log(StringFormat("OrderSend failed (attempt %d/%d): error %d %s", attempt+1, MaxRetries+1, err, ErrorText(err)));
      if(!IsTransientError(err) || attempt==MaxRetries)
        {
         Diag("OrderSend error " + IntegerToString(err) + " " + ErrorText(err));
         break;
        }
      Sleep(RetryDelayMs);
     }
   return(-1);
  }

//--- modify SL/TP (and optionally the pending price)
bool ModifyOrder(int ticket, double price, double sl, double tp)
  {
   if(!OrderSelect(ticket, SELECT_BY_TICKET) || OrderCloseTime()!=0)
      return(false);
   int type = OrderType();
   double op = (type<=OP_SELL || price<=0) ? OrderOpenPrice() : NP(price);
   sl = NP(sl);
   tp = NP(tp);
   if(MathAbs(op-OrderOpenPrice())<Point/2 && MathAbs(sl-OrderStopLoss())<Point/2 && MathAbs(tp-OrderTakeProfit())<Point/2)
      return(true);   // nothing to change
   RefreshRates();
   double freeze = MarketInfo(Symbol(), MODE_FREEZELEVEL)*Point;
   if(freeze>0 && type<=OP_SELL)
     {
      double cp = (type==OP_BUY ? Bid : Ask);
      if((OrderStopLoss()>0 && MathAbs(cp-OrderStopLoss())<=freeze) ||
         (OrderTakeProfit()>0 && MathAbs(cp-OrderTakeProfit())<=freeze))
        {
         Log("Modify #" + IntegerToString(ticket) + " skipped: inside FreezeLevel");
         return(false);
        }
     }
   double ref = (type==OP_BUY ? Bid : (type==OP_SELL ? Ask : op));
   if(!FixStops(type, ref, sl, tp))
     {
      Log("Modify #" + IntegerToString(ticket) + " rejected: SL/TP inside StopLevel");
      return(false);
     }
   for(int attempt=0; attempt<=MaxRetries; attempt++)
     {
      if(!WaitTradeContext())
         continue;
      if(OrderModify(ticket, op, sl, tp, OrderExpiration(), clrYellow))
        {
         Log(StringFormat("MODIFIED #%d price %s SL %s TP %s", ticket, PriceStr(op), PriceStr(sl), PriceStr(tp)));
         return(true);
        }
      int err = GetLastError();
      if(err==ERR_NO_RESULT)
         return(true);
      Log(StringFormat("OrderModify #%d failed: error %d %s", ticket, err, ErrorText(err)));
      if(!IsTransientError(err))
         break;
      Sleep(RetryDelayMs);
      RefreshRates();
      if(!OrderSelect(ticket, SELECT_BY_TICKET))
         break;
     }
   return(false);
  }

bool ModifySLTP(int ticket, double sl, double tp)
  {
   return(ModifyOrder(ticket, 0, sl, tp));
  }

//--- close (fully or partially) a market order, or delete a pending order
bool CloseTicket(int ticket, double lots=0)
  {
   if(!OrderSelect(ticket, SELECT_BY_TICKET) || OrderCloseTime()!=0)
      return(false);
   if(OrderType()>OP_SELL)
      return(DeletePendingTicket(ticket));
   string sym = OrderSymbol();
   int dg = (int)MarketInfo(sym, MODE_DIGITS);
   double pt = MarketInfo(sym, MODE_POINT);
   if(lots<=0 || lots>OrderLots())
      lots = OrderLots();
   for(int attempt=0; attempt<=MaxRetries; attempt++)
     {
      if(!WaitTradeContext())
         continue;
      RefreshRates();
      if(!OrderSelect(ticket, SELECT_BY_TICKET))
         return(false);
      double px = (OrderType()==OP_BUY ? MarketInfo(sym, MODE_BID) : MarketInfo(sym, MODE_ASK));
      double freeze = MarketInfo(sym, MODE_FREEZELEVEL)*pt;
      if(freeze>0 && ((OrderStopLoss()>0 && MathAbs(px-OrderStopLoss())<=freeze) ||
                      (OrderTakeProfit()>0 && MathAbs(px-OrderTakeProfit())<=freeze)))
        {
         Log("Close #" + IntegerToString(ticket) + " blocked by FreezeLevel");
         return(false);
        }
      if(OrderClose(ticket, lots, NormalizeDouble(px, dg), SlippagePoints, clrWhite))
        {
         Log(StringFormat("CLOSED #%d %.2f lots @%s", ticket, lots, DoubleToString(px, dg)));
         return(true);
        }
      int err = GetLastError();
      Log(StringFormat("OrderClose #%d failed: error %d %s", ticket, err, ErrorText(err)));
      if(!IsTransientError(err))
         break;
      Sleep(RetryDelayMs);
     }
   return(false);
  }

bool DeletePendingTicket(int ticket)
  {
   if(!OrderSelect(ticket, SELECT_BY_TICKET) || OrderCloseTime()!=0 || OrderType()<=OP_SELL)
      return(false);
   for(int attempt=0; attempt<=MaxRetries; attempt++)
     {
      if(!WaitTradeContext())
         continue;
      if(OrderDelete(ticket, clrNONE))
        {
         Log("DELETED pending #" + IntegerToString(ticket));
         return(true);
        }
      int err = GetLastError();
      Log(StringFormat("OrderDelete #%d failed: error %d %s", ticket, err, ErrorText(err)));
      if(!IsTransientError(err))
         break;
      Sleep(RetryDelayMs);
     }
   return(false);
  }

//--- pending state: 0 still pending, 1 filled (now market), -1 gone
int PendingState(int ticket)
  {
   if(ticket<=0 || !OrderSelect(ticket, SELECT_BY_TICKET))
      return(-1);
   if(OrderCloseTime()!=0)
      return(OrderType()<=OP_SELL ? 1 : -1);
   if(OrderType()<=OP_SELL)
      return(1);
   return(0);
  }

string OrderTypeName(int type)
  {
   switch(type)
     {
      case OP_BUY:
         return("BUY");
      case OP_SELL:
         return("SELL");
      case OP_BUYLIMIT:
         return("BUY LIMIT");
      case OP_SELLLIMIT:
         return("SELL LIMIT");
      case OP_BUYSTOP:
         return("BUY STOP");
      case OP_SELLSTOP:
         return("SELL STOP");
     }
   return("?");
  }

string ErrorText(int err)
  {
   switch(err)
     {
      case 0:
         return("no error");
      case 1:
         return("no result");
      case 2:
         return("common error");
      case 3:
         return("invalid trade parameters");
      case 4:
         return("server busy");
      case 6:
         return("no connection");
      case 8:
         return("too frequent requests");
      case 64:
         return("account disabled");
      case 128:
         return("trade timeout");
      case 129:
         return("invalid price");
      case 130:
         return("invalid stops");
      case 131:
         return("invalid volume");
      case 132:
         return("market closed");
      case 133:
         return("trade disabled");
      case 134:
         return("not enough money");
      case 135:
         return("price changed");
      case 136:
         return("off quotes");
      case 137:
         return("broker busy");
      case 138:
         return("requote");
      case 139:
         return("order locked");
      case 141:
         return("too many requests");
      case 145:
         return("modification denied (too close to market)");
      case 146:
         return("trade context busy");
      case 147:
         return("expirations denied");
      case 148:
         return("too many orders");
      case 4051:
         return("invalid function parameter");
      case 4108:
         return("invalid ticket");
      case 4109:
         return("trading not allowed (enable AutoTrading)");
     }
   return("error " + IntegerToString(err));
  }

//+------------------------------------------------------------------+
//| ================= TRADE MANAGEMENT ============================= |
//+------------------------------------------------------------------+
bool PartialDone(int ticket)
  {
   for(int i=0; i<ArraySize(gPartialDone); i++)
      if(gPartialDone[i]==ticket)
         return(true);
   return(false);
  }

void MarkPartialDone(int ticket)
  {
   int n = ArraySize(gPartialDone);
   if(n>200)
      ArrayResize(gPartialDone, 0);
   n = ArraySize(gPartialDone);
   ArrayResize(gPartialDone, n+1);
   gPartialDone[n] = ticket;
  }

//--- find the remaining order created by a partial close of 'oldTicket'
int FindChildTicket(int oldTicket)
  {
   string key = "#" + IntegerToString(oldTicket);
   for(int i=OrdersTotal()-1; i>=0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
         continue;
      if(StringFind(OrderComment(), key)>=0)
         return(OrderTicket());
     }
   return(-1);
  }

void ManageOpenTrades()
  {
   RefreshRates();
   datetime today = iTime(Symbol(), PERIOD_D1, 0);
   if(today!=gSTCleanDay)
     {
      gSTCleanDay = today;
      CleanupTradeGlobals();
     }
   for(int i=OrdersTotal()-1; i>=0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
         continue;
      if(!OrderInScope(AutoManageScope) || OrderType()>OP_SELL)
         continue;
      int ticket = OrderTicket();
      int type = OrderType();
      double op = OrderOpenPrice(), sl = OrderStopLoss(), tp = OrderTakeProfit();
      double cp = (type==OP_BUY ? Bid : Ask);
      double profitDist = (type==OP_BUY ? cp-op : op-cp);
      // remember the ORIGINAL risk (1R) before any SL movement
      double risk = InitialRisk(ticket);

      // --- partial close + break even (S3 partial mode, N2 partial mode, N3 partial at VP target)
      double pTrig = 0, pPct = 0, pBE = 0;
      if(!PartialDone(ticket) && StringFind(OrderComment(), "from #")<0 &&
         PartialPlan(OrderMagicNumber(), ticket, type, op, risk, pTrig, pPct, pBE))
        {
         if(OrderSelect(ticket, SELECT_BY_TICKET) && (type==OP_BUY ? cp>=pTrig : cp<=pTrig))
           {
            double closeLots = NormalizeLotDown(OrderLots()*pPct/100.0);
            double minLot = MarketInfo(Symbol(), MODE_MINLOT);
            double beSL = NP(type==OP_BUY ? op+Pips(pBE) : op-Pips(pBE));
            MarkPartialDone(ticket);
            if(closeLots>=minLot && OrderLots()-closeLots>=minLot-1e-9)
              {
               if(CloseTicket(ticket, closeLots))
                 {
                  int child = FindChildTicket(ticket);
                  if(child>0)
                    {
                     MarkPartialDone(child);
                     if(OrderSelect(child, SELECT_BY_TICKET) && IsBetterSL(type, beSL, OrderStopLoss()))
                        ModifySLTP(child, beSL, OrderTakeProfit());
                    }
                  Notify(StringFormat("Partial close %.2f lots at %s, SL -> BE (#%d)", closeLots, PriceStr(pTrig), ticket));
                 }
              }
            else
              {
               if(IsBetterSL(type, beSL, sl))
                  ModifySLTP(ticket, beSL, tp);   // volume too small to split - only move to BE
               Log("Partial: volume too small to split - SL moved to BE only");
              }
            continue;
           }
        }

      if(!OrderSelect(ticket, SELECT_BY_TICKET))
         continue;
      sl = OrderStopLoss();

      // --- automatic break even
      if(UseAutoBreakEven && profitDist>=Pips(BETriggerPips))
        {
         double be = (type==OP_BUY ? op+Pips(BEOffsetPips) : op-Pips(BEOffsetPips));
         if((type==OP_BUY && (sl==0 || sl<be)) || (type==OP_SELL && (sl==0 || sl>be)))
           {
            if(ModifySLTP(ticket, be, tp))
               sl = be;
           }
        }

      if(!gTrailOn)
         continue;

      // --- smart trailing (multi-stage, see SmartTrail)
      if(TrailMode==TRAIL_SMART)
        {
         SmartTrail(ticket);
         continue;
        }

      // --- classic trailing stop (ratchet: SL only moves in profit direction)
      if(profitDist>=Pips(TrailStartPips))
        {
         double cand = (type==OP_BUY ? NP(cp-Pips(TrailDistancePips)) : NP(cp+Pips(TrailDistancePips)));
         bool better = (type==OP_BUY ? (sl==0 || cand>=sl+Pips(TrailStepPips)) : (sl==0 || cand<=sl-Pips(TrailStepPips)));
         if(better)
            ModifySLTP(ticket, cand, tp);
        }
     }
  }

//+------------------------------------------------------------------+
//| ================= SMART TRAILING STOP ========================== |
//|                                                                  |
//| Goal: protect profit without being stopped out by normal noise, |
//| so the trade can keep running in the right direction.           |
//|                                                                  |
//| Stage 0  (< BreakEvenAtR)  : SL untouched - trade gets room.    |
//| Stage 1  (>= BreakEvenAtR) : SL -> entry + lock + spread.       |
//| Stage 2  (>= TrailStartR)  : SL trails behind                    |
//|           a) the last swing low/high formed AFTER entry          |
//|              (a normal pullback makes a higher low, not a hit)   |
//|           b) an ATR chandelier from the best price reached,      |
//|              wide at first, tightening as profit grows in R.     |
//|           Volatility expansion widens the ATR stop automatically.|
//| Stage 3  (peak >= ProfitLockStartR): a rising % of the PEAK      |
//|           profit is always locked (floor), from 40% up to 75%.  |
//| Always   : SL only moves in the profit direction (ratchet),      |
//|           never closer than spread x mult + StopLevel,           |
//|           evaluated on closed candles only (no spike hits).      |
//| Bonus    : TP is extended by ATR while momentum is strong and    |
//|           the SL already locks profit.                           |
//+------------------------------------------------------------------+
string RiskKey(int ticket) { return(PFX + "R_" + IntegerToString(ticket)); }
string ExtKey(int ticket)  { return(PFX + "EXT_" + IntegerToString(ticket)); }

//--- timeframe used to manage a trade
int TradeTF(int magic)
  {
   if(ST_Timeframe!=PERIOD_CURRENT)
      return(ST_Timeframe);
   int s = MagicToStrat(magic);
   if(s>=0 && s<STRAT_COUNT)
      return(StratTF(s));
   return(Period());
  }

//--- SL 'a' is better (more protective) than SL 'b' for the given order type
bool IsBetterSL(int type, double a, double b)
  {
   if(a<=0)
      return(false);
   if(b<=0)
      return(true);
   return(type==OP_BUY ? a>b : a<b);
  }

//--- initial risk (1R) of a trade in price. Stored once in a Global Variable so it
//    survives SL moves, partial closes (child tickets) and terminal restarts.
double InitialRisk(int ticket)
  {
   string k = RiskKey(ticket);
   if(KVCheck(k))
      return(KVGet(k));
   if(!OrderSelect(ticket, SELECT_BY_TICKET))
      return(0);
   double r = 0;
   // child of a partial close -> inherit the parent's risk
   int p = StringFind(OrderComment(), "from #");
   if(p>=0)
     {
      string pk = RiskKey((int)StringToInteger(StringSubstr(OrderComment(), p+6)));
      if(KVCheck(pk))
         r = KVGet(pk);
     }
   if(r<=0)
     {
      double op = OrderOpenPrice(), sl = OrderStopLoss();
      bool buy = (OrderType()==OP_BUY);
      if(sl>0 && ((buy && sl<op) || (!buy && sl>op)))
         r = MathAbs(op-sl);
      else
         r = iATR(Symbol(), TradeTF(OrderMagicNumber()), ST_ATRPeriod, 1)*ST_DefaultRiskATR;
     }
   if(r>0)
      KVSet(k, r);
   if(!OrderSelect(ticket, SELECT_BY_TICKET))   // restore selection for the caller
      return(r);
   return(r);
  }

//--- process each ticket once per closed bar (when ST_UpdateOnBarClose)
bool SmartBarDue(int ticket, datetime bar)
  {
   int n = ArraySize(gSTTicket);
   for(int i=0; i<n; i++)
      if(gSTTicket[i]==ticket)
        {
         if(gSTBar[i]==bar)
            return(false);
         gSTBar[i] = bar;
         return(true);
        }
   if(n>500)
     {
      ArrayResize(gSTTicket, 0);
      ArrayResize(gSTBar, 0);
      n = 0;
     }
   ArrayResize(gSTTicket, n+1);
   ArrayResize(gSTBar, n+1);
   gSTTicket[n] = ticket;
   gSTBar[n] = bar;
   return(true);
  }

//--- current smart trailing stage (for the dashboard)
string SmartStageText(int ticket)
  {
   if(!OrderSelect(ticket, SELECT_BY_TICKET) || OrderType()>OP_SELL)
      return("");
   double r = 0;
   if(KVCheck(RiskKey(ticket)))
      r = KVGet(RiskKey(ticket));
   double sl = OrderStopLoss(), op = OrderOpenPrice();
   if(r<=0)
      return(sl>0 ? "" : "NO SL");
   if(sl<=0)
      return("NO SL");
   double lockedR = (OrderType()==OP_BUY ? sl-op : op-sl)/r;
   if(lockedR<0)
      return("SL -" + DoubleToString(-lockedR, 1) + "R");
   return("SL +" + DoubleToString(lockedR, 1) + "R locked");
  }

void SmartTrail(int ticket)
  {
   if(!OrderSelect(ticket, SELECT_BY_TICKET) || OrderCloseTime()!=0 || OrderType()>OP_SELL)
      return;
   int type = OrderType();
   bool buy = (type==OP_BUY);
   int tf = TradeTF(OrderMagicNumber());
   if(ST_UpdateOnBarClose && !SmartBarDue(ticket, iTime(Symbol(), tf, 0)))
      return;

   double op = OrderOpenPrice(), sl = OrderStopLoss(), tp = OrderTakeProfit();
   double r = InitialRisk(ticket);
   if(r<=0 || !OrderSelect(ticket, SELECT_BY_TICKET))
      return;
   RefreshRates();
   double cp = (buy ? Bid : Ask);
   double spread = Ask-Bid;
   double profit = (buy ? cp-op : op-cp);
   double pr = profit/r;

   // --- best price reached since entry: closed candles AFTER the entry candle + current price
   //     (the entry candle itself is skipped - its high/low may predate the entry)
   int openShift = iBarShift(Symbol(), tf, OrderOpenTime(), false);
   double peak = cp;
   if(openShift>=2)
     {
      if(buy)
         peak = MathMax(cp, iHigh(Symbol(), tf, iHighest(Symbol(), tf, MODE_HIGH, openShift-1, 1)));
      else
         peak = MathMin(cp, iLow(Symbol(), tf, iLowest(Symbol(), tf, MODE_LOW, openShift-1, 1)));
     }
   double peakProfit = (buy ? peak-op : op-peak);
   double peakR = peakProfit/r;

   double atr = iATR(Symbol(), tf, ST_ATRPeriod, 1);
   if(atr<=0)
      return;
   double boost = 1.0;
   if(ST_VolatilityAdapt)
     {
      double fast = iATR(Symbol(), tf, ST_VolFastPeriod, 1), slow = iATR(Symbol(), tf, ST_VolSlowPeriod, 1);
      if(slow>0)
         boost = MathMax(1.0, MathMin(ST_VolMaxBoost, fast/slow));
     }

   double cand = sl;
   string stage = "";

   // --- Stage 1: break even (+ spread so a BE exit is really at zero cost)
   if(ST_BreakEvenAtR>0 && pr>=ST_BreakEvenAtR)
     {
      double be = (buy ? op+Pips(ST_BreakEvenLockPips)+spread : op-Pips(ST_BreakEvenLockPips)-spread);
      if(IsBetterSL(type, be, cand))
        {
         cand = be;
         stage = "BE";
        }
     }

   // --- Stage 2: structure + ATR chandelier trailing
   if(pr>=ST_TrailStartR)
     {
      double mult = MathMax(ST_ATRMultMin, ST_ATRMultStart-ST_ATRTightenPerR*(pr-ST_TrailStartR))*boost;
      double chand = (buy ? peak-atr*mult : peak+atr*mult);
      double structSL = 0;
      if(ST_UseStructure && openShift>ST_SwingStrength+1)
        {
         // swing low (buy) / swing high (sell) formed after the entry candle
         int sw = FindSwing(tf, !buy, 1, openShift-1, ST_SwingStrength);
         if(sw>0 && sw<openShift)
            structSL = (buy ? iLow(Symbol(), tf, sw)-atr*ST_StructureBufferATR
                        : iHigh(Symbol(), tf, sw)+atr*ST_StructureBufferATR);
        }
      double trail = chand;
      if(structSL>0)
        {
         if(ST_Combine==COMBINE_LOOSER)
            trail = (buy ? MathMin(chand, structSL) : MathMax(chand, structSL));
         else
            trail = (buy ? MathMax(chand, structSL) : MathMin(chand, structSL));
        }
      if(IsBetterSL(type, trail, cand))
        {
         cand = trail;
         stage = (structSL>0 && MathAbs(trail-structSL)<Point ? "STRUCTURE" : "ATR x" + DoubleToString(mult, 1));
        }
     }

   // --- Stage 3: profit lock floor (a rising % of the peak profit)
   if(ST_ProfitLockStartR>0 && peakR>=ST_ProfitLockStartR)
     {
      double pct = MathMin(ST_ProfitLockPctMax, ST_ProfitLockPct+ST_ProfitLockStepPerR*(peakR-ST_ProfitLockStartR));
      double lock = (buy ? op+peakProfit*pct/100.0 : op-peakProfit*pct/100.0);
      if(IsBetterSL(type, lock, cand))
        {
         cand = lock;
         stage = "LOCK " + DoubleToString(pct, 0) + "%";
        }
     }

   // --- safety distance from current price (spread + StopLevel)
   double minD = MathMax(spread*ST_MinDistanceSpreadMult, (MarketInfo(Symbol(), MODE_STOPLEVEL)+1)*Point);
   if(cand>0)
     {
      if(buy && cp-cand<minD)
         cand = cp-minD;
      if(!buy && cand-cp<minD)
         cand = cp+minD;
     }
   cand = NP(cand);

   // --- TP extension while momentum is strong and profit is already locked
   double newTP = tp;
   if(ST_ExtendTP && tp>0)
     {
      double tpDist = MathAbs(tp-op);
      int ext = (KVCheck(ExtKey(ticket)) ? (int)KVGet(ExtKey(ticket)) : 0);
      double lockSL = (cand>0 ? cand : sl);
      bool slInProfit = (lockSL>0 && (buy ? lockSL>op : lockSL<op));
      double o1 = iOpen(Symbol(), tf, 1), c1 = iClose(Symbol(), tf, 1);
      double rng1 = iHigh(Symbol(), tf, 1)-iLow(Symbol(), tf, 1);
      bool momentum = rng1>0 && (buy ? c1>o1 : c1<o1) && MathAbs(c1-o1)/rng1>=0.5;
      if(tpDist>0 && ext<ST_MaxTPExtensions && slInProfit && momentum && profit>=tpDist*ST_ExtendAtPctOfTP/100.0)
        {
         newTP = NP(buy ? tp+atr*ST_ExtendATRMult : tp-atr*ST_ExtendATRMult);
         KVSet(ExtKey(ticket), ext+1);
         Log(StringFormat("SMART TRAIL #%d: strong momentum - TP extended %s -> %s (%d/%d)", ticket,
                          PriceStr(tp), PriceStr(newTP), ext+1, ST_MaxTPExtensions));
        }
     }

   // --- ratchet: apply only a real improvement
   bool moveSL = IsBetterSL(type, cand, sl) && (sl<=0 || MathAbs(cand-sl)>=Pips(ST_MinStepPips));
   if(!moveSL && newTP==tp)
      return;
   double finalSL = (moveSL ? cand : sl);
   if(ModifySLTP(ticket, finalSL, newTP) && moveSL)
      Log(StringFormat("SMART TRAIL #%d [%s]: SL %s -> %s | profit %.2fR, peak %.2fR, vol x%.2f", ticket, stage,
                       PriceStr(sl), PriceStr(finalSL), pr, peakR, boost));
  }

//--- remove smart-trailing Global Variables of trades that are no longer open
void CleanupTradeGlobals()
  {
   for(int i=KVTotal()-1; i>=0; i--)
     {
      string n = KVName(i);
      int tk = 0;
      if(StringFind(n, PFX+"R_")==0)
         tk = (int)StringToInteger(StringSubstr(n, StringLen(PFX+"R_")));
      if(StringFind(n, PFX+"EXT_")==0)
         tk = (int)StringToInteger(StringSubstr(n, StringLen(PFX+"EXT_")));
      if(StringFind(n, PFX+"PT_")==0)
         tk = (int)StringToInteger(StringSubstr(n, StringLen(PFX+"PT_")));
      if(tk<=0)
         continue;
      if(!OrderSelect(tk, SELECT_BY_TICKET) || OrderCloseTime()!=0)
         KVDel(n);
     }
  }
double NormalizeLotDown(double lot)
  {
   double step = MarketInfo(Symbol(), MODE_LOTSTEP);
   if(step<=0)
      step = 0.01;
   lot = MathFloor(lot/step+1e-9)*step;
   int dg = (int)MathMax(0, MathCeil(-MathLog10(step)-1e-9));
   return(NormalizeDouble(lot, dg));
  }

//+------------------------------------------------------------------+
//| ================= RISK TRACKING ================================ |
//+------------------------------------------------------------------+
string AcctKey() { return(IntegerToString(AccountNumber())); }

void InitRiskTracking()
  {
   string pk = PFX + "PEAK_" + AcctKey();
   if(!ResetPeakOnStart && KVCheck(pk))
      gPeakEquity = MathMax(KVGet(pk), AccountEquity());
   else
      gPeakEquity = AccountEquity();
   KVSet(pk, gPeakEquity);
   gMaxDDPct = 0;
   gDay = 0;
   UpdateRiskTracking();
  }

void UpdateRiskTracking()
  {
   datetime today = iTime(Symbol(), PERIOD_D1, 0);
   if(today==0)
      today = TimeCurrent()-(datetime)((long)TimeCurrent()%86400);
   double eq = AccountEquity();
   if(today!=gDay)
     {
      gDay = today;
      string dk = PFX + "DAY_" + AcctKey() + "_" + IntegerToString((long)today);
      if(KVCheck(dk))
         gDayStartEquity = KVGet(dk);
      else
        {
         gDayStartEquity = eq;
         KVSet(dk, eq);
        }
      gDayMaxDD = 0;
     }
   if(eq>gPeakEquity)
     {
      gPeakEquity = eq;
      KVSet(PFX + "PEAK_" + AcctKey(), eq);
     }
   double dayLoss = gDayStartEquity-eq;
   if(dayLoss>gDayMaxDD)
      gDayMaxDD = dayLoss;
   double ddPct = (gPeakEquity>0 ? (gPeakEquity-eq)/gPeakEquity*100.0 : 0);
   if(ddPct>gMaxDDPct)
      gMaxDDPct = ddPct;

   bool block = false;
   string msg = "";
   double limit = 0;
   if(DailyLossLimitPercent>0)
      limit = gDayStartEquity*DailyLossLimitPercent/100.0;
   if(DailyLossLimitMoney>0 && (limit==0 || DailyLossLimitMoney<limit))
      limit = DailyLossLimitMoney;
   if(limit>0 && dayLoss>=limit)
     {
      block = true;
      msg = "DAILY LOSS LIMIT reached (" + D2S(dayLoss) + " " + AccountCurrency() + ")";
     }
   if(MaxDrawdownPercent>0 && ddPct>=MaxDrawdownPercent)
     {
      block = true;
      msg = "MAX DRAWDOWN reached (" + D2S(ddPct) + "%)";
     }
   if(gEmergencyStop)
     {
      block = true;
      msg = "EMERGENCY STOP active (toggle AUTO to resume)";
     }
   if(block && !gRiskBlock)
     {
      Log("RISK BLOCK: " + msg + " - new trades disabled");
      Notify("RISK BLOCK: " + msg);
      if(CloseAllOnRiskLimit && !gEmergencyStop && gRiskClosedDay!=today)
        {
         gRiskClosedDay = today;
         CloseOrders(SCOPE_EA_ONLY, 0, 0, true);
        }
     }
   if(!block && gRiskBlock)
      Log("Risk block released");
   gRiskBlock = block;
   gRiskMsg = msg;
  }

//--- close orders by filter. filter: 0 all, 1 buys, 2 sells, 3 profitable, 4 losing.
//    ticketOnly > 0 limits to that ticket. includePending deletes pendings too (filter 0).
int CloseOrders(int scope, int filter, int ticketOnly, bool includePending)
  {
   int n = 0;
   RefreshRates();
   for(int i=OrdersTotal()-1; i>=0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
         continue;
      if(!OrderInScope(scope))
         continue;
      int tk = OrderTicket();
      if(ticketOnly>0 && tk!=ticketOnly)
         continue;
      int type = OrderType();
      if(type>OP_SELL)
        {
         if(includePending && filter==0 && DeletePendingTicket(tk))
            n++;
         continue;
        }
      double pl = OrderProfit()+OrderSwap()+OrderCommission();
      if(filter==1 && type!=OP_BUY)
         continue;
      if(filter==2 && type!=OP_SELL)
         continue;
      if(filter==3 && pl<=0)
         continue;
      if(filter==4 && pl>=0)
         continue;
      if(CloseTicket(tk))
         n++;
     }
   return(n);
  }

//+------------------------------------------------------------------+
//| ================= CHART DRAWING ================================ |
//+------------------------------------------------------------------+
void DrawTrend(string n, datetime t1, double p1, datetime t2, double p2, color c, int style, int width, bool ray)
  {
   if(ObjectFind(0, n)<0)
     {
      if(!ObjectCreate(0, n, OBJ_TREND, 0, t1, p1, t2, p2))
         return;
     }
   else
     {
      ObjectMove(0, n, 0, t1, p1);
      ObjectMove(0, n, 1, t2, p2);
     }
   ObjectSetInteger(0, n, OBJPROP_COLOR, c);
   ObjectSetInteger(0, n, OBJPROP_STYLE, style);
   ObjectSetInteger(0, n, OBJPROP_WIDTH, width);
   ObjectSetInteger(0, n, OBJPROP_RAY_RIGHT, ray);
   ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, n, OBJPROP_BACK, false);
   ObjectSetInteger(0, n, OBJPROP_HIDDEN, true);
  }

void DrawTextObj(string n, datetime t, double p, string text, color c, int anchor, int fs)
  {
   if(ObjectFind(0, n)<0)
     {
      if(!ObjectCreate(0, n, OBJ_TEXT, 0, t, p))
         return;
     }
   else
      ObjectMove(0, n, 0, t, p);
   ObjectSetString(0, n, OBJPROP_TEXT, text);
   ObjectSetString(0, n, OBJPROP_FONT, PanelFontName);
   ObjectSetInteger(0, n, OBJPROP_FONTSIZE, fs);
   ObjectSetInteger(0, n, OBJPROP_COLOR, c);
   ObjectSetInteger(0, n, OBJPROP_ANCHOR, anchor);
   ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, n, OBJPROP_HIDDEN, true);
  }

//--- Strategy 1 trendline (candidate = dotted, active = solid)
void DrawS1Trendline(TS1Setup &st, int tf, string tag, bool active)
  {
   if(!CanDraw() || !ShowTrendlines || st.t1==0)
      return;
   string cand = PFX + "S1TL_" + tag + "_CAND";
   double pEnd = S1LineValue(st, tf, 0);
   if(active)
     {
      ObjectDelete(0, cand);
      string n = PFX + "S1TL_" + tag + "_" + IntegerToString((int)st.t2);
      DrawTrend(n, st.t1, st.p1, BarT(tf, 0), pEnd, ClrTrendline, STYLE_SOLID, 2, false);
      if(ShowStrategyLabels)
         DrawTextObj(n + "_L", st.t2, st.p2, "S1 TL", ClrTrendline, tag=="S1B" ? ANCHOR_LOWER : ANCHOR_UPPER, PanelFontSize);
     }
   else
      DrawTrend(cand, st.t1, st.p1, BarT(tf, 0), pEnd, ClrTrendline, STYLE_DOT, 1, false);
  }

//--- text mark (breakout / retest / sweep)
void DrawMark(string n, datetime t, double p, string text, color c, bool above)
  {
   if(!CanDraw() || !ShowStructureMarks)
      return;
   DrawTextObj(n, t, p, (above ? "v " : "^ ") + text, c, above ? ANCHOR_LOWER : ANCHOR_UPPER, PanelFontSize);
  }

//--- BOS / MSS: dotted level from structure point to the breaking candle + label
void DrawStructure(string n, datetime t1, datetime t2, double level, string text)
  {
   if(!CanDraw() || !ShowStructureMarks)
      return;
   DrawTrend(n, t1, level, t2, level, ClrStructure, STYLE_DOT, 1, false);
   DrawTextObj(n + "_L", t2, level, text, ClrStructure, ANCHOR_LOWER, PanelFontSize);
  }

//--- FVG rectangle
void DrawFVG(string n, datetime t1, datetime t2, double top, double bottom, int dir, string text)
  {
   if(!CanDraw() || !ShowFVGZones)
      return;
   if(ObjectFind(0, n)<0)
     {
      if(!ObjectCreate(0, n, OBJ_RECTANGLE, 0, t1, top, t2, bottom))
         return;
     }
   else
     {
      ObjectMove(0, n, 0, t1, top);
      ObjectMove(0, n, 1, t2, bottom);
     }
   ObjectSetInteger(0, n, OBJPROP_COLOR, dir>0 ? ClrFVGBull : ClrFVGBear);
   ObjectSetInteger(0, n, OBJPROP_BACK, true);
   ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, n, OBJPROP_HIDDEN, true);
   if(ShowStrategyLabels)
      DrawTextObj(n + "_L", t1, dir>0 ? bottom : top, text, dir>0 ? ClrBullish : ClrBearish,
                  dir>0 ? ANCHOR_UPPER : ANCHOR_LOWER, PanelFontSize-1);
  }

//--- Strategy 2 reference range
void DrawRefRange()
  {
   if(!CanDraw() || !ShowReferenceRange || gS2RefTime==0)
      return;
   int tf = TF(EntryTimeframe);
   string n = PFX + "S2REF_" + IntegerToString((int)gS2RefTime);
   datetime tEnd = BarT(tf, 0);
   if(iTime(Symbol(), Period(), 0)>tEnd)
      tEnd = iTime(Symbol(), Period(), 0);
   DrawTrend(n + "_H", gS2RefTime, gS2RefHigh, tEnd, gS2RefHigh, ClrRefRange, STYLE_SOLID, 2, false);
   DrawTrend(n + "_L", gS2RefTime, gS2RefLow, tEnd, gS2RefLow, ClrRefRange, STYLE_SOLID, 2, false);
   if(ShowStrategyLabels)
     {
      DrawTextObj(n + "_HT", gS2RefTime, gS2RefHigh, "S2 REF HIGH " + TFName(TF(ReferenceTimeframe)), ClrRefRange, ANCHOR_LEFT_LOWER, PanelFontSize);
      DrawTextObj(n + "_LT", gS2RefTime, gS2RefLow, "S2 REF LOW", ClrRefRange, ANCHOR_LEFT_UPPER, PanelFontSize);
     }
  }

//--- Strategy 3 liquidity levels (rebuilt every S3 bar)
void DrawLiquidity(int tf)
  {
   if(!gDrawUI)
      return;
   DeleteByPrefix(PFX + "LIQ_");
   if(!gShowObjs)
      return;
   if(!ShowLiquidityLevels)
      return;
   datetime tEnd = BarT(tf, 0);
   for(int i=0; i<ArraySize(gLiqHigh); i++)
     {
      string n = PFX + "LIQ_H" + IntegerToString(i);
      DrawTrend(n, BarT(tf, gLiqHigh[i].shift), gLiqHigh[i].price, tEnd, gLiqHigh[i].price, ClrLiquidity, STYLE_DASH, 1, false);
      DrawTextObj(n + "_L", tEnd, gLiqHigh[i].price, "$ " + gLiqHigh[i].name, ClrLiquidity, ANCHOR_LEFT_LOWER, PanelFontSize-1);
     }
   for(int i=0; i<ArraySize(gLiqLow); i++)
     {
      string n = PFX + "LIQ_L" + IntegerToString(i);
      DrawTrend(n, BarT(tf, gLiqLow[i].shift), gLiqLow[i].price, tEnd, gLiqLow[i].price, ClrLiquidity, STYLE_DASH, 1, false);
      DrawTextObj(n + "_L", tEnd, gLiqLow[i].price, "$ " + gLiqLow[i].name, ClrLiquidity, ANCHOR_LEFT_UPPER, PanelFontSize-1);
     }
  }

//--- signal arrow + strategy label + planned levels
void DrawSignal(int s, int dir, double price, double sl, double tp)
  {
   if(!CanDraw())
      return;
   datetime t = iTime(Symbol(), Period(), 0);
   string n = PFX + "SIG_" + StratShort(s) + "_" + IntegerToString((int)t) + (dir>0 ? "B" : "S");
   color c = (dir>0 ? ClrBullish : ClrBearish);
   if(ShowSignalArrows)
     {
      if(ObjectFind(0, n)<0)
         ObjectCreate(0, n, OBJ_ARROW, 0, t, price);
      ObjectSetInteger(0, n, OBJPROP_ARROWCODE, dir>0 ? 233 : 234);
      ObjectSetInteger(0, n, OBJPROP_COLOR, c);
      ObjectSetInteger(0, n, OBJPROP_WIDTH, 2);
      ObjectSetInteger(0, n, OBJPROP_ANCHOR, dir>0 ? ANCHOR_TOP : ANCHOR_BOTTOM);
      ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, n, OBJPROP_HIDDEN, true);
     }
   if(ShowStrategyLabels)
      DrawTextObj(n + "_T", t, sl, StratShort(s) + " " + DirStr(dir), c, dir>0 ? ANCHOR_UPPER : ANCHOR_LOWER, PanelFontSize);
   if(ShowTradeLevels)
     {
      datetime t2 = t + PeriodSeconds(Period())*12;
      DrawTrend(n + "_E", t, price, t2, price, ClrEntryLine, STYLE_SOLID, 1, false);
      DrawTrend(n + "_SL", t, sl, t2, sl, ClrSLLine, STYLE_DASH, 1, false);
      DrawTrend(n + "_TP", t, tp, t2, tp, ClrTPLine, STYLE_DASH, 1, false);
     }
  }

//--- Entry / SL / TP lines of open trades (redrawn on UI refresh)
void DrawTradeLevels()
  {
   DeleteByPrefix(PFX + "TL_");
   if(!ShowTradeLevels)
      return;
   datetime tEnd = iTime(Symbol(), Period(), 0) + PeriodSeconds(Period())*8;
   for(int i=OrdersTotal()-1; i>=0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
         continue;
      if(!OrderInScope(StatsScope))
         continue;
      string n = PFX + "TL_" + IntegerToString(OrderTicket());
      datetime t0 = OrderOpenTime();
      bool buy = (OrderType()==OP_BUY || OrderType()==OP_BUYLIMIT || OrderType()==OP_BUYSTOP);
      int st = MagicToStrat(OrderMagicNumber());
      string who = (st>=0 ? StratShort(st) : "EXT");
      DrawTrend(n + "_E", t0, OrderOpenPrice(), tEnd, OrderOpenPrice(), ClrEntryLine, OrderType()>OP_SELL ? STYLE_DOT : STYLE_SOLID, 1, false);
      DrawTextObj(n + "_ET", tEnd, OrderOpenPrice(), StringFormat("%s %s %.2f #%d", who, OrderTypeName(OrderType()), OrderLots(), OrderTicket()),
                  buy ? ClrBullish : ClrBearish, ANCHOR_LEFT, PanelFontSize-1);
      if(OrderStopLoss()>0)
        {
         DrawTrend(n + "_SL", t0, OrderStopLoss(), tEnd, OrderStopLoss(), ClrSLLine, STYLE_DASH, 1, false);
         DrawTextObj(n + "_SLT", tEnd, OrderStopLoss(), "SL " + who, ClrSLLine, ANCHOR_LEFT, PanelFontSize-1);
        }
      if(OrderTakeProfit()>0)
        {
         DrawTrend(n + "_TP", t0, OrderTakeProfit(), tEnd, OrderTakeProfit(), ClrTPLine, STYLE_DASH, 1, false);
         DrawTextObj(n + "_TPT", tEnd, OrderTakeProfit(), "TP " + who, ClrTPLine, ANCHOR_LEFT, PanelFontSize-1);
        }
     }
  }

//+------------------------------------------------------------------+
//| ================= UI HELPERS =================================== |
//+------------------------------------------------------------------+
void UIRect(string n, int x, int y, int w, int h, color bg, color border)
  {
   if(ObjectFind(0, n)<0)
      ObjectCreate(0, n, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, n, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, n, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, n, OBJPROP_YSIZE, h);
   ObjectSetInteger(0, n, OBJPROP_BGCOLOR, bg);
   ObjectSetInteger(0, n, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, n, OBJPROP_COLOR, border);
   ObjectSetInteger(0, n, OBJPROP_BACK, false);
   ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, n, OBJPROP_HIDDEN, true);
   ObjectSetInteger(0, n, OBJPROP_ZORDER, 0);
  }

void UILabel(string n, int x, int y, string text, color c, int fs, bool bold)
  {
   if(ObjectFind(0, n)<0)
      ObjectCreate(0, n, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, n, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, y);
   ObjectSetString(0, n, OBJPROP_TEXT, text=="" ? " " : text);
   ObjectSetString(0, n, OBJPROP_FONT, bold ? PanelFontName + " Bold" : PanelFontName);
   ObjectSetInteger(0, n, OBJPROP_FONTSIZE, fs);
   ObjectSetInteger(0, n, OBJPROP_COLOR, c);
   ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, n, OBJPROP_HIDDEN, true);
   ObjectSetInteger(0, n, OBJPROP_ZORDER, 1);
  }

void UIButton(string n, int x, int y, int w, int h, string text, color bg, color fg)
  {
   if(ObjectFind(0, n)<0)
      ObjectCreate(0, n, OBJ_BUTTON, 0, 0, 0);
   ObjectSetInteger(0, n, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, n, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, n, OBJPROP_YSIZE, h);
   ObjectSetString(0, n, OBJPROP_TEXT, text);
   ObjectSetString(0, n, OBJPROP_FONT, PanelFontName);
   ObjectSetInteger(0, n, OBJPROP_FONTSIZE, PanelFontSize);
   ObjectSetInteger(0, n, OBJPROP_BGCOLOR, bg);
   ObjectSetInteger(0, n, OBJPROP_COLOR, fg);
   ObjectSetInteger(0, n, OBJPROP_BORDER_COLOR, PanelBorderColor);
   ObjectSetInteger(0, n, OBJPROP_STATE, false);
   ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, n, OBJPROP_HIDDEN, true);
   ObjectSetInteger(0, n, OBJPROP_ZORDER, 10);
  }

void UIEdit(string n, int x, int y, int w, int h, string defText)
  {
   // Never touch an existing edit box: re-setting properties could interrupt typing
   if(ObjectFind(0, n)>=0)
      return;
   ObjectCreate(0, n, OBJ_EDIT, 0, 0, 0);
   ObjectSetInteger(0, n, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, n, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, n, OBJPROP_YSIZE, h);
   ObjectSetString(0, n, OBJPROP_TEXT, defText);
   ObjectSetString(0, n, OBJPROP_FONT, PanelFontName);
   ObjectSetInteger(0, n, OBJPROP_FONTSIZE, PanelFontSize);
   ObjectSetInteger(0, n, OBJPROP_BGCOLOR, C'12,14,20');
   ObjectSetInteger(0, n, OBJPROP_COLOR, clrWhite);
   ObjectSetInteger(0, n, OBJPROP_BORDER_COLOR, PanelBorderColor);
   ObjectSetInteger(0, n, OBJPROP_READONLY, false);
   ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, n, OBJPROP_HIDDEN, true);
   ObjectSetInteger(0, n, OBJPROP_ZORDER, 10);
  }

//+------------------------------------------------------------------+
//| ================= DASHBOARD 1: TRADE MANAGEMENT PANEL ========== |
//+------------------------------------------------------------------+
string BTN(string id) { return(PFX + "P1C_B_" + id); }
string EDT(string id) { return(PFX + "P1C_E_" + id); }

double FieldD(string id)
  {
   if(ObjectFind(0, EDT(id))<0)
      return(0);
   return(StringToDouble(ObjectGetString(0, EDT(id), OBJPROP_TEXT)));
  }

void SetField(string id, double v, int digits)
  {
   if(ObjectFind(0, EDT(id))>=0)
      ObjectSetString(0, EDT(id), OBJPROP_TEXT, DoubleToString(v, digits));
  }

color OnOff(bool on) { return(on ? ToggleOnColor : ToggleOffColor); }

void BuildTradePanel()
  {
   if(!gDrawUI || !ShowTradePanel)
      return;
   int x = TradePanelX, y = TradePanelY, w = TradePanelWidth;
   int pad = 6, bh = ButtonHeight, rowH = ButtonHeight+4;
   int bw2 = (w-3*pad)/2;
   int bw3 = (w-4*pad)/3;
   int cx1 = x+pad, cx2 = x+2*pad+bw2;

   // header
   UIRect(PFX+"P1H_BG", x, y, w, gTradeMin ? 26 : gTradePanelH, PanelBgColor, PanelBorderColor);
   UILabel(PFX+"P1H_TITLE", x+pad, y+6, "TRADE PANEL  " + Symbol(), PanelTitleColor, PanelFontSize+1, true);
   UIButton(PFX+"P1_MIN", x+w-pad-22, y+3, 22, 18, gTradeMin ? "+" : "-", ButtonBgColor, ButtonTextColor);
   if(gTradeMin)
     {
      DeleteByPrefix(PFX+"P1C_");
      gTradePanelH = 26;
      return;
     }

   int r = y+28;
   // Row 1: Lot / SL / TP
   string unitTxt = (gUnit==UNIT_PIPS ? "pips" : "price");
   int lw = 22, ew = bw3-lw;
   int c1 = x+pad, c2 = x+2*pad+bw3, c3 = x+3*pad+2*bw3;
   UILabel(PFX+"P1C_L_LOT", c1, r+4, "Lot", PanelTextColor, PanelFontSize, false);
   UIEdit(EDT("LOT"), c1+lw, r, ew, bh, DoubleToString(DefaultPanelLot, 2));
   UILabel(PFX+"P1C_L_SL", c2, r+4, "SL", ClrSLLine, PanelFontSize, false);
   UIEdit(EDT("SL"), c2+lw, r, ew, bh, DoubleToString(DefaultPanelSLPips, 1));
   UILabel(PFX+"P1C_L_TP", c3, r+4, "TP", ClrTPLine, PanelFontSize, false);
   UIEdit(EDT("TP"), c3+lw, r, ew, bh, DoubleToString(DefaultPanelTPPips, 1));
   r += rowH;
   // Row 2: Entry price / Ticket
   UILabel(PFX+"P1C_L_ENTRY", c1, r+4, "Entry", ClrEntryLine, PanelFontSize, false);
   UIEdit(EDT("ENTRY"), c1+36, r, bw2-36, bh, "0");
   UILabel(PFX+"P1C_L_TICKET", cx2, r+4, "Ticket", PanelTextColor, PanelFontSize, false);
   UIEdit(EDT("TICKET"), cx2+40, r, bw2-40, bh, "0");
   r += rowH;
   // Row 3: unit toggle / lines toggle
   UIButton(BTN("UNIT"), cx1, r, bw2, bh, "SL/TP UNIT: " + (gUnit==UNIT_PIPS ? "PIPS" : "PRICE"), ButtonBgColor, ButtonTextColor);
   UIButton(BTN("LINES"), cx2, r, bw2, bh, gLinesOn ? "DRAG LINES: ON" : "DRAG LINES: OFF", OnOff(gLinesOn), ButtonTextColor);
   r += rowH;
   // Row 4: pick on chart
   UIButton(BTN("PICKE"), c1, r, bw3, bh, gPickMode==1 ? "CLICK CHART.." : "PICK ENTRY", gPickMode==1 ? ClrInfo : ButtonBgColor, ButtonTextColor);
   UIButton(BTN("PICKSL"), c2, r, bw3, bh, gPickMode==2 ? "CLICK CHART.." : "PICK SL", gPickMode==2 ? ClrInfo : ButtonBgColor, ButtonTextColor);
   UIButton(BTN("PICKTP"), c3, r, bw3, bh, gPickMode==3 ? "CLICK CHART.." : "PICK TP", gPickMode==3 ? ClrInfo : ButtonBgColor, ButtonTextColor);
   r += rowH;
   // Row 5: market orders
   UIButton(BTN("BUY"), cx1, r, bw2, bh+4, "BUY MARKET", BuyButtonColor, clrWhite);
   UIButton(BTN("SELL"), cx2, r, bw2, bh+4, "SELL MARKET", SellButtonColor, clrWhite);
   r += rowH+4;
   // Row 6: pending at entry
   UIButton(BTN("BUYPEND"), cx1, r, bw2, bh, "BUY PENDING @Entry", C'0,85,50', clrWhite);
   UIButton(BTN("SELLPEND"), cx2, r, bw2, bh, "SELL PENDING @Entry", C'125,30,30', clrWhite);
   r += rowH;
   // Row 7-11: management
   UIButton(BTN("CLOSEALL"), cx1, r, bw2, bh, "CLOSE ALL", ButtonBgColor, ButtonTextColor);
   UIButton(BTN("CLOSEBUY"), cx2, r, bw2, bh, "CLOSE BUY", ButtonBgColor, ClrProfit);
   r += rowH;
   UIButton(BTN("CLOSESELL"), cx1, r, bw2, bh, "CLOSE SELL", ButtonBgColor, ClrLoss);
   UIButton(BTN("CLOSEPROF"), cx2, r, bw2, bh, "CLOSE PROFITABLE", ButtonBgColor, ClrProfit);
   r += rowH;
   UIButton(BTN("CLOSELOSS"), cx1, r, bw2, bh, "CLOSE LOSING", ButtonBgColor, ClrLoss);
   UIButton(BTN("BE"), cx2, r, bw2, bh, "BREAK EVEN", ButtonBgColor, ButtonTextColor);
   r += rowH;
   string trTxt = (TrailMode==TRAIL_SMART ? "SMART TRAIL: " : "TRAILING: ");
   UIButton(BTN("TRAIL"), cx1, r, bw2, bh, trTxt + (gTrailOn ? "ON" : "OFF"), OnOff(gTrailOn), ButtonTextColor);
   UIButton(BTN("PARTIAL"), cx2, r, bw2, bh, "PARTIAL CLOSE " + DoubleToString(PartialClosePercent, 0) + "%", ButtonBgColor, ButtonTextColor);
   r += rowH;
   UIButton(BTN("MODIFY"), cx1, r, bw2, bh, "MODIFY SELECTED", ButtonBgColor, ButtonTextColor);
   UIButton(BTN("DELPEND"), cx2, r, bw2, bh, "DELETE PENDING", ButtonBgColor, ButtonTextColor);
   r += rowH;
   // Row 12: strategy toggles
   UIButton(BTN("S1"), c1, r, bw3, bh, gStratOn[ST_S1] ? "S1: ON" : "S1: OFF", OnOff(gStratOn[ST_S1]), ButtonTextColor);
   UIButton(BTN("S2"), c2, r, bw3, bh, gStratOn[ST_S2] ? "S2: ON" : "S2: OFF", OnOff(gStratOn[ST_S2]), ButtonTextColor);
   UIButton(BTN("S3"), c3, r, bw3, bh, gStratOn[ST_S3] ? "S3: ON" : "S3: OFF", OnOff(gStratOn[ST_S3]), ButtonTextColor);
   r += rowH;
   // Row 12b: new video strategies
   UIButton(BTN("N1"), c1, r, bw3, bh, gStratOn[ST_N1] ? "N1 FIB: ON" : "N1 FIB: OFF", OnOff(gStratOn[ST_N1]), ButtonTextColor);
   UIButton(BTN("N2"), c2, r, bw3, bh, gStratOn[ST_N2] ? "N2 LIQ: ON" : "N2 LIQ: OFF", OnOff(gStratOn[ST_N2]), ButtonTextColor);
   UIButton(BTN("N3"), c3, r, bw3, bh, gStratOn[ST_N3] ? "N3 VP: ON" : "N3 VP: OFF", OnOff(gStratOn[ST_N3]), ButtonTextColor);
   r += rowH;
   // Row 12c: refresh / objects
   UIButton(BTN("REFRESH"), cx1, r, bw2, bh, "REFRESH STRATEGY", ButtonBgColor, ButtonTextColor);
   UIButton(BTN("OBJS"), cx2, r, bw2, bh, gShowObjs ? "HIDE OBJECTS" : "SHOW OBJECTS", OnOff(gShowObjs), ButtonTextColor);
   r += rowH;
   // Row 13: auto / stats
   UIButton(BTN("AUTO"), cx1, r, bw2, bh, gAuto ? "AUTO TRADING: ON" : "AUTO TRADING: OFF", OnOff(gAuto), ButtonTextColor);
   UIButton(BTN("STATS"), cx2, r, bw2, bh, gPerfVisible ? "HIDE STATS PANEL" : "SHOW STATS PANEL", ButtonBgColor, ButtonTextColor);
   r += rowH;
   // Row 14: emergency
   UIButton(BTN("EMERG"), cx1, r, w-2*pad, bh+4, "!! EMERGENCY CLOSE ALL !!", C'200,0,0', clrWhite);
   r += rowH+4;
   // status message
   UILabel(PFX+"P1C_MSG", x+pad, r, gPanelMsg, gPanelMsgClr, PanelFontSize, false);
   UILabel(PFX+"P1C_UNIT", x+pad, r+14, "SL/TP fields in " + unitTxt + " | Ticket 0 = all", PanelTextColor, PanelFontSize-1, false);
   r += 32;
   gTradePanelH = r-y;
   ObjectSetInteger(0, PFX+"P1H_BG", OBJPROP_YSIZE, gTradePanelH);
  }

bool PointInTradePanel(int px, int py)
  {
   if(ShowTradePanel && px>=TradePanelX && px<=TradePanelX+TradePanelWidth && py>=TradePanelY && py<=TradePanelY+gTradePanelH)
      return(true);
   if(gPerfVisible && px>=PerfPanelX && px<=PerfPanelX+PerfPanelWidth && py>=PerfPanelY && py<=PerfPanelY+600)
      return(true);
   return(false);
  }

void PanelMsg(string msg, color c)
  {
   gPanelMsg = msg;
   gPanelMsgClr = c;
   Log("PANEL: " + msg);
  }

//--- handle panel button clicks
void HandleButton(string n)
  {
   if(n==PFX+"P1_MIN")
     {
      gTradeMin = !gTradeMin;
      BuildTradePanel();
      return;
     }
   if(n==PFX+"P2_HIDE")
     {
      gPerfVisible = false;
      DeleteByPrefix(PFX+"P2");
      return;
     }
   if(StringFind(n, PFX+"P1C_B_")!=0)
      return;
   string id = StringSubstr(n, StringLen(PFX+"P1C_B_"));
   PanelAction(id);
   BuildTradePanel();
  }

//--- dispatch a panel button id
void PanelAction(string id)
  {
   int ticket = (int)FieldD("TICKET");

   // --- order entry
   if(id=="BUY")      { ManualMarket(1);   return; }
   if(id=="SELL")     { ManualMarket(-1);  return; }
   if(id=="BUYPEND")  { ManualPending(1);  return; }
   if(id=="SELLPEND") { ManualPending(-1); return; }

   // --- closing
   if(id=="CLOSEALL")
     {
      if(AskConfirm("Close ALL orders on " + Symbol() + " (panel scope)?"))
         PanelMsg("Closed " + IntegerToString(CloseOrders(PanelActionScope, 0, ticket, false)) + " order(s)", ClrInfo);
      return;
     }
   if(id=="CLOSEBUY")
     {
      if(AskConfirm("Close all BUY orders on " + Symbol() + "?"))
         PanelMsg("Closed " + IntegerToString(CloseOrders(PanelActionScope, 1, ticket, false)) + " buy(s)", ClrInfo);
      return;
     }
   if(id=="CLOSESELL")
     {
      if(AskConfirm("Close all SELL orders on " + Symbol() + "?"))
         PanelMsg("Closed " + IntegerToString(CloseOrders(PanelActionScope, 2, ticket, false)) + " sell(s)", ClrInfo);
      return;
     }
   if(id=="CLOSEPROF")
     {
      PanelMsg("Closed " + IntegerToString(CloseOrders(PanelActionScope, 3, ticket, false)) + " profitable order(s)", ClrInfo);
      return;
     }
   if(id=="CLOSELOSS")
     {
      if(AskConfirm("Close all LOSING orders on " + Symbol() + "?"))
         PanelMsg("Closed " + IntegerToString(CloseOrders(PanelActionScope, 4, ticket, false)) + " losing order(s)", ClrInfo);
      return;
     }
   if(id=="EMERG")    { EmergencyCloseAll(); return; }

   // --- management
   if(id=="BE")       { PanelBreakEven(ticket);     return; }
   if(id=="PARTIAL")  { PanelPartial(ticket);       return; }
   if(id=="MODIFY")   { PanelModify(ticket);        return; }
   if(id=="DELPEND")  { PanelDeletePending(ticket); return; }
   if(id=="TRAIL")
     {
      gTrailOn = !gTrailOn;
      PanelMsg((TrailMode==TRAIL_SMART ? "Smart trailing " : "Trailing stop ") + (gTrailOn ? "ON" : "OFF"), ClrInfo);
      return;
     }

   // --- switches
   if(id=="S1" || id=="S2" || id=="S3" || id=="N1" || id=="N2" || id=="N3")
     {
      int s = ST_S1;
      if(id=="S2")
         s = ST_S2;
      if(id=="S3")
         s = ST_S3;
      if(id=="N1")
         s = ST_N1;
      if(id=="N2")
         s = ST_N2;
      if(id=="N3")
         s = ST_N3;
      gStratOn[s] = !gStratOn[s];
      gState[s] = gStratOn[s] ? "Active" : "Inactive";
      gLastBar[s] = 0;                  // evaluate again on the next tick
      if(!gStratOn[s])
        {
         ResetStrategy(s);
         DeleteStrategyObjects(s);      // remove its chart objects automatically
        }
      PanelMsg(StratName(s) + (gStratOn[s] ? " ON" : " OFF"), ClrInfo);
      return;
     }
   if(id=="REFRESH")
     {
      for(int k=0; k<STRAT_COUNT; k++)
        {
         ResetStrategy(k);
         gLastBar[k] = 0;
        }
      gFibUsedKey = 0;
      DeleteAllStrategyObjects();
      RunStrategies();
      PanelMsg("Strategies refreshed (setups reset, VP recalculated)", ClrInfo);
      return;
     }
   if(id=="OBJS")
     {
      gShowObjs = !gShowObjs;
      if(!gShowObjs)
         DeleteAllStrategyObjects();
      else
         for(int k=0; k<STRAT_COUNT; k++)
            gLastBar[k] = 0;              // redraw on the next evaluation
      PanelMsg(gShowObjs ? "Strategy objects shown" : "Strategy objects hidden", ClrInfo);
      return;
     }
   if(id=="AUTO")
     {
      gAuto = !gAuto;
      if(gAuto)
         gEmergencyStop = false;
      PanelMsg(gAuto ? "Auto trading ON" : "Auto trading OFF (panel mode)", gAuto ? ClrProfit : ClrWarning);
      return;
     }
   if(id=="STATS")
     {
      gPerfVisible = !gPerfVisible;
      if(!gPerfVisible)
         DeleteByPrefix(PFX+"P2");
      return;
     }

   // --- SL/TP input helpers
   if(id=="UNIT")     { ToggleUnit();  return; }
   if(id=="LINES")    { ToggleLines(); return; }
   if(id=="PICKE" || id=="PICKSL" || id=="PICKTP")
     {
      int m = (id=="PICKE" ? 1 : (id=="PICKSL" ? 2 : 3));
      gPickMode = (gPickMode==m ? 0 : m);
      gPickArm = GetTickCount();
      PanelMsg(gPickMode>0 ? "Click on the chart to set the price" : "Pick cancelled", ClrInfo);
     }
  }

void ResetStrategy(int s)
  {
   if(s==ST_S1)
     {
      ResetS1(gS1Buy);
      ResetS1(gS1Sell);
     }
   else
      if(s==ST_S2)
        {
         ResetFvg(gS2Buy);
         ResetFvg(gS2Sell);
        }
      else
         if(s==ST_S3)
           {
            ResetFvg(gS3Buy);
            ResetFvg(gS3Sell);
           }
         else
            if(s==ST_N1)
               ResetFib();
            else
               if(s==ST_N2)
                 {
                  ResetSweep(gSwB);
                  ResetSweep(gSwS);
                 }
               else
                  if(s==ST_N3)
                     ResetVP();
   if(s>=0 && s<STRAT_COUNT)
      gEntryReady[s] = false;
  }

//--- reference price for SL/TP pips conversion
double PanelRefPrice(int dir)
  {
   double e = FieldD("ENTRY");
   if(e>0)
      return(e);
   RefreshRates();
   return(dir<0 ? Bid : Ask);
  }

//--- manual TP used by Strategy 1 (S1_TP_MANUAL)
double PanelManualTP(int dir, double entry)
  {
   double v = FieldD("TP");
   if(v<=0)
      return(0);
   double tp = (gUnit==UNIT_PIPS ? (dir>0 ? entry+Pips(v) : entry-Pips(v)) : v);
   if((dir>0 && tp<=entry) || (dir<0 && tp>=entry))
      return(0);
   return(tp);
  }

//--- SL/TP from panel fields for a given direction and base price. Returns false when invalid.
bool PanelLevels(int dir, double base, double &sl, double &tp, string &err)
  {
   double sv = FieldD("SL"), tv = FieldD("TP");
   sl = 0;
   tp = 0;
   if(gUnit==UNIT_PIPS)
     {
      if(sv>0)
         sl = NP(dir>0 ? base-Pips(sv) : base+Pips(sv));
      if(tv>0)
         tp = NP(dir>0 ? base+Pips(tv) : base-Pips(tv));
     }
   else
     {
      if(sv>0)
         sl = NP(sv);
      if(tv>0)
         tp = NP(tv);
     }
   if(sl>0 && ((dir>0 && sl>=base) || (dir<0 && sl<=base)))
     {
      err = "SL is on the wrong side of the entry price";
      return(false);
     }
   if(tp>0 && ((dir>0 && tp<=base) || (dir<0 && tp>=base)))
     {
      err = "TP is on the wrong side of the entry price";
      return(false);
     }
   if(sl>0 && MathAbs(base-sl)<Pips(MinStopLossPips))
     {
      err = "SL closer than MinStopLossPips";
      return(false);
     }
   return(true);
  }

double PanelLot()
  {
   double l = FieldD("LOT");
   if(l<=0)
      l = DefaultPanelLot;
   return(NormalizeLot(l));
  }

void ManualMarket(int dir)
  {
   if(ManualTradesRespectLimits && gRiskBlock)
     {
      PanelMsg("Blocked: " + gRiskMsg, ClrWarning);
      return;
     }
   if(!AllowHedging && CountOrders(-1, dir>0 ? OP_SELL : OP_BUY, false)>0)
     {
      PanelMsg("Blocked: hedging not allowed", ClrWarning);
      return;
     }
   RefreshRates();
   double entry = (dir>0 ? Ask : Bid);
   double sl, tp;
   string err = "";
   if(!PanelLevels(dir, entry, sl, tp, err))
     {
      PanelMsg("Rejected: " + err, ClrWarning);
      return;
     }
   double lot = PanelLot();
   if(!MarginOK(dir>0 ? OP_BUY : OP_SELL, lot))
     {
      PanelMsg("Rejected: not enough free margin", ClrWarning);
      return;
     }
   int t = SendOrder(dir>0 ? OP_BUY : OP_SELL, lot, 0, sl, tp, MagicManual, TradeCommentPrefix + " MANUAL");
   if(t>0)
      PanelMsg("Opened #" + IntegerToString(t) + " " + DirStr(dir) + " " + D2S(lot), dir>0 ? ClrProfit : ClrLoss);
   else
      PanelMsg("Order failed - see Experts log", ClrWarning);
  }

void ManualPending(int dir)
  {
   if(ManualTradesRespectLimits && gRiskBlock)
     {
      PanelMsg("Blocked: " + gRiskMsg, ClrWarning);
      return;
     }
   double e = NP(FieldD("ENTRY"));
   if(e<=0)
     {
      PanelMsg("Set an Entry price (field, PICK ENTRY or drag line)", ClrWarning);
      return;
     }
   RefreshRates();
   int type;
   if(dir>0)
      type = (e<Ask ? OP_BUYLIMIT : OP_BUYSTOP);
   else
      type = (e>Bid ? OP_SELLLIMIT : OP_SELLSTOP);
   double sl, tp;
   string err = "";
   if(!PanelLevels(dir, e, sl, tp, err))
     {
      PanelMsg("Rejected: " + err, ClrWarning);
      return;
     }
   double lot = PanelLot();
   int t = SendOrder(type, lot, e, sl, tp, MagicManual, TradeCommentPrefix + " MANUAL");
   if(t>0)
      PanelMsg("Placed #" + IntegerToString(t) + " " + OrderTypeName(type) + " @" + PriceStr(e), ClrInfo);
   else
      PanelMsg("Pending order failed - see Experts log", ClrWarning);
  }

//--- collect tickets affected by a panel action (market / pending / both)
int PanelTickets(int ticketOnly, int kind, int &out[])
  {
   ArrayResize(out, 0);
   int n = 0;
   for(int i=OrdersTotal()-1; i>=0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
         continue;
      if(ticketOnly>0)
        {
         if(OrderTicket()!=ticketOnly || OrderSymbol()!=Symbol())
            continue;
        }
      else
         if(!OrderInScope(PanelActionScope))
            continue;
      bool market = (OrderType()<=OP_SELL);
      if(kind==1 && !market)
         continue;
      if(kind==2 && market)
         continue;
      ArrayResize(out, n+1);
      out[n] = OrderTicket();
      n++;
     }
   return(n);
  }

void PanelBreakEven(int ticketOnly)
  {
   int tks[];
   int n = PanelTickets(ticketOnly, 1, tks), done = 0;
   double minD = (MarketInfo(Symbol(), MODE_STOPLEVEL)+1)*Point;
   RefreshRates();
   for(int i=0; i<n; i++)
     {
      if(!OrderSelect(tks[i], SELECT_BY_TICKET))
         continue;
      double op = OrderOpenPrice();
      bool buy = (OrderType()==OP_BUY);
      double be = NP(buy ? op+Pips(BEOffsetPips) : op-Pips(BEOffsetPips));
      double cp = (buy ? Bid : Ask);
      if((buy && cp-be<minD) || (!buy && be-cp<minD))
         continue;   // not enough profit yet
      if(ModifySLTP(tks[i], be, OrderTakeProfit()))
         done++;
     }
   PanelMsg("Break even set on " + IntegerToString(done) + "/" + IntegerToString(n) + " order(s)", ClrInfo);
  }

void PanelPartial(int ticketOnly)
  {
   int tks[];
   int n = PanelTickets(ticketOnly, 1, tks), done = 0;
   double minLot = MarketInfo(Symbol(), MODE_MINLOT);
   for(int i=0; i<n; i++)
     {
      if(!OrderSelect(tks[i], SELECT_BY_TICKET))
         continue;
      double cl = NormalizeLotDown(OrderLots()*PartialClosePercent/100.0);
      if(cl<minLot || OrderLots()-cl<minLot-1e-9)
         continue;
      if(CloseTicket(tks[i], cl))
         done++;
     }
   PanelMsg("Partial close done on " + IntegerToString(done) + "/" + IntegerToString(n) + " order(s)", ClrInfo);
  }

void PanelModify(int ticketOnly)
  {
   int tks[];
   int n = PanelTickets(ticketOnly, 0, tks), done = 0;
   double newEntry = NP(FieldD("ENTRY"));
   string lastErr = "";
   for(int i=0; i<n; i++)
     {
      if(!OrderSelect(tks[i], SELECT_BY_TICKET))
         continue;
      int type = OrderType();
      int dir = (type==OP_BUY || type==OP_BUYLIMIT || type==OP_BUYSTOP) ? 1 : -1;
      double price = 0;
      if(type>OP_SELL && ticketOnly>0 && newEntry>0)
         price = newEntry;           // move the pending entry only for a single selected ticket
      double base = (price>0 ? price : OrderOpenPrice());
      double sl, tp;
      string err = "";
      if(!PanelLevels(dir, base, sl, tp, err))
        {
         lastErr = err;
         continue;
        }
      if(!OrderSelect(tks[i], SELECT_BY_TICKET))
         continue;
      if(sl<=0)
         sl = OrderStopLoss();      // empty field keeps the current value
      if(tp<=0)
         tp = OrderTakeProfit();
      if(ModifyOrder(tks[i], price, sl, tp))
         done++;
     }
   PanelMsg("Modified " + IntegerToString(done) + "/" + IntegerToString(n) + (lastErr!="" ? " (" + lastErr + ")" : ""),
            lastErr!="" ? ClrWarning : ClrInfo);
  }

void PanelDeletePending(int ticketOnly)
  {
   int tks[];
   int n = PanelTickets(ticketOnly, 2, tks), done = 0;
   for(int i=0; i<n; i++)
      if(DeletePendingTicket(tks[i]))
         done++;
   PanelMsg("Deleted " + IntegerToString(done) + "/" + IntegerToString(n) + " pending order(s)", ClrInfo);
  }

void EmergencyCloseAll()
  {
   if(!AskConfirm("EMERGENCY: close ALL positions and delete ALL pending orders on ALL symbols, and stop auto trading?"))
      return;
   gAuto = false;
   gEmergencyStop = true;
   int n = 0;
   for(int i=OrdersTotal()-1; i>=0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
         continue;
      if(CloseTicket(OrderTicket()))
         n++;
     }
   PanelMsg("EMERGENCY: closed/deleted " + IntegerToString(n) + " order(s). Auto trading OFF", ClrWarning);
   Notify("EMERGENCY CLOSE ALL executed (" + IntegerToString(n) + " orders)");
  }

//--- switch SL/TP field unit (pips <-> price), converting values with a BUY assumption
//    (use PICK / drag lines to define sell levels)
void ToggleUnit()
  {
   if(gUnit==UNIT_PIPS)
      ConvertFieldsToPrice(1);
   else
     {
      double ref = PanelRefPrice(1);
      double sv = FieldD("SL"), tv = FieldD("TP");
      gUnit = UNIT_PIPS;
      SetField("SL", sv>0 ? MathAbs(ref-sv)/gPip : 0, 1);
      SetField("TP", tv>0 ? MathAbs(tv-ref)/gPip : 0, 1);
     }
   PanelMsg("SL/TP unit: " + (gUnit==UNIT_PIPS ? "PIPS" : "PRICE"), ClrInfo);
  }

void ConvertFieldsToPrice(int dir)
  {
   if(gUnit==UNIT_PRICE)
      return;
   double ref = PanelRefPrice(dir);
   double sv = FieldD("SL"), tv = FieldD("TP");
   gUnit = UNIT_PRICE;
   SetField("SL", sv>0 ? NP(dir>0 ? ref-Pips(sv) : ref+Pips(sv)) : 0, Digits);
   SetField("TP", tv>0 ? NP(dir>0 ? ref+Pips(tv) : ref-Pips(tv)) : 0, Digits);
  }

//--- apply a price picked by clicking on the chart
void ApplyPickedPrice(double price)
  {
   int mode = gPickMode;
   gPickMode = 0;
   RefreshRates();
   double ref = PanelRefPrice(1);
   if(mode==1)
      SetField("ENTRY", price, Digits);
   else
     {
      // infer direction: SL below / TP above the reference => BUY
      int dir = 1;
      if(mode==2)
         dir = (price<ref ? 1 : -1);
      else
         dir = (price>ref ? 1 : -1);
      ConvertFieldsToPrice(dir);
      SetField(mode==2 ? "SL" : "TP", price, Digits);
     }
   PanelMsg((mode==1 ? "Entry" : (mode==2 ? "SL" : "TP")) + " set to " + PriceStr(price), ClrInfo);
   if(gLinesOn)
      SyncLinesFromFields();
   RefreshUI(true);
  }

//--- draggable horizontal lines for Entry / SL / TP
void MakeHLine(string n, double price, color c, string text)
  {
   if(ObjectFind(0, n)<0)
      ObjectCreate(0, n, OBJ_HLINE, 0, 0, price);
   else
      ObjectMove(0, n, 0, 0, price);
   ObjectSetInteger(0, n, OBJPROP_COLOR, c);
   ObjectSetInteger(0, n, OBJPROP_STYLE, STYLE_DASHDOT);
   ObjectSetInteger(0, n, OBJPROP_WIDTH, 1);
   ObjectSetInteger(0, n, OBJPROP_SELECTABLE, true);
   ObjectSetInteger(0, n, OBJPROP_SELECTED, true);
   ObjectSetInteger(0, n, OBJPROP_HIDDEN, false);
   ObjectSetString(0, n, OBJPROP_TEXT, text);
  }

void ToggleLines()
  {
   gLinesOn = !gLinesOn;
   if(!gLinesOn)
     {
      DeleteByPrefix(PFX+"LN_");
      PanelMsg("Drag lines OFF", ClrInfo);
      return;
     }
   RefreshRates();
   if(FieldD("ENTRY")<=0)
      SetField("ENTRY", Ask, Digits);
   ConvertFieldsToPrice(1);
   double e = FieldD("ENTRY");
   if(FieldD("SL")<=0)
      SetField("SL", NP(e-Pips(DefaultPanelSLPips)), Digits);
   if(FieldD("TP")<=0)
      SetField("TP", NP(e+Pips(DefaultPanelTPPips)), Digits);
   SyncLinesFromFields();
   PanelMsg("Drag the ENTRY / SL / TP lines with the mouse", ClrInfo);
  }

void SyncLinesFromFields()
  {
   if(!gLinesOn)
      return;
   double e = FieldD("ENTRY");
   if(e<=0)
     {
      RefreshRates();
      e = Ask;
     }
   double sl = FieldD("SL"), tp = FieldD("TP");
   if(gUnit==UNIT_PIPS)
     {
      sl = (sl>0 ? e-Pips(sl) : 0);
      tp = (tp>0 ? e+Pips(tp) : 0);
     }
   MakeHLine(PFX+"LN_ENTRY", e, ClrEntryLine, "ENTRY");
   if(sl>0)
      MakeHLine(PFX+"LN_SL", sl, ClrSLLine, "SL");
   if(tp>0)
      MakeHLine(PFX+"LN_TP", tp, ClrTPLine, "TP");
   ChartRedraw(0);
  }

void SyncFieldsFromLines()
  {
   gUnit = UNIT_PRICE;
   if(ObjectFind(0, PFX+"LN_ENTRY")>=0)
      SetField("ENTRY", NP(ObjectGetDouble(0, PFX+"LN_ENTRY", OBJPROP_PRICE, 0)), Digits);
   if(ObjectFind(0, PFX+"LN_SL")>=0)
      SetField("SL", NP(ObjectGetDouble(0, PFX+"LN_SL", OBJPROP_PRICE, 0)), Digits);
   if(ObjectFind(0, PFX+"LN_TP")>=0)
      SetField("TP", NP(ObjectGetDouble(0, PFX+"LN_TP", OBJPROP_PRICE, 0)), Digits);
   PanelMsg("Levels updated from lines", ClrInfo);
   RefreshUI(true);
  }

void ValidateEditField(string n)
  {
   string txt = ObjectGetString(0, n, OBJPROP_TEXT);
   StringReplace(txt, ",", ".");
   double v = StringToDouble(txt);
   if(v<0)
      v = 0;
   int dg = 1;
   if(n==EDT("LOT"))
      dg = 2;
   else
      if(n==EDT("TICKET"))
         dg = 0;
      else
         if(n==EDT("ENTRY") || gUnit==UNIT_PRICE)
            dg = Digits;
   ObjectSetString(0, n, OBJPROP_TEXT, DoubleToString(v, dg));
  }

//+------------------------------------------------------------------+
//| ================= DASHBOARD 2: PERFORMANCE PANEL =============== |
//+------------------------------------------------------------------+
void CalcHistoryStats()
  {
   int total = OrdersHistoryTotal();
   datetime today = iTime(Symbol(), PERIOD_D1, 0);
   if(total==gHistCount && today==gHistDay)
      return;
   gHistCount = total;
   gHistDay = today;
   gTodayPL = 0;
   gTotalPL = 0;
   gWins = 0;
   gLosses = 0;
   for(int k=0; k<=STRAT_COUNT; k++)
     {
      gWinsS[k] = 0;
      gLossS[k] = 0;
      gPLS[k] = 0;
     }
   for(int i=0; i<total; i++)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_HISTORY))
         continue;
      if(OrderType()<=OP_SELL && OrderSymbol()==Symbol())
        {
         int st = MagicToStrat(OrderMagicNumber());
         if(st>=0 && st<=STRAT_COUNT)
           {
            double spl = OrderProfit()+OrderSwap()+OrderCommission();
            gPLS[st] += spl;
            if(spl>0)
               gWinsS[st]++;
            else
               if(spl<0)
                  gLossS[st]++;
           }
        }
      if(OrderType()>OP_SELL || !OrderInScope(StatsScope))
         continue;
      double pl = OrderProfit()+OrderSwap()+OrderCommission();
      gTotalPL += pl;
      if(OrderCloseTime()>=today)
         gTodayPL += pl;
      if(pl>0)
         gWins++;
      else
         if(pl<0)
            gLosses++;
     }
  }

int  gPerfRow = 0;
int  gPerfY0 = 0;

void PerfCell(int row, int col, string key, string val, color vc)
  {
   int x = PerfPanelX+8, colW = (PerfPanelWidth-16)/2;
   int rowH = PanelFontSize*2+3;
   int y = gPerfY0+row*rowH;
   ObjectDelete(0, PFX+"P2_HDR"+IntegerToString(row));
   string k = PFX+"P2_K"+IntegerToString(row)+"_"+IntegerToString(col);
   string v = PFX+"P2_V"+IntegerToString(row)+"_"+IntegerToString(col);
   if(col==2)   // full width line
     {
      UILabel(k, x, y, key, PanelTextColor, PanelFontSize, false);
      UILabel(v, x+95, y, val, vc, PanelFontSize, false);
      ObjectDelete(0, PFX+"P2_K"+IntegerToString(row)+"_1");
      ObjectDelete(0, PFX+"P2_V"+IntegerToString(row)+"_1");
      return;
     }
   int cx = x+col*colW;
   UILabel(k, cx, y, key, PanelTextColor, PanelFontSize, false);
   UILabel(v, cx+95, y, val, vc, PanelFontSize, false);
  }

void PerfPair(string k1, string v1, color c1, string k2, string v2, color c2)
  {
   PerfCell(gPerfRow, 0, k1, v1, c1);
   PerfCell(gPerfRow, 1, k2, v2, c2);
   gPerfRow++;
  }

void PerfLine(string k, string v, color c)
  {
   PerfCell(gPerfRow, 2, k, v, c);
   gPerfRow++;
  }

void PerfHeader(string text)
  {
   int rowH = PanelFontSize*2+3;
   string n = PFX+"P2_HDR"+IntegerToString(gPerfRow);
   ObjectDelete(0, PFX+"P2_K"+IntegerToString(gPerfRow)+"_0");
   ObjectDelete(0, PFX+"P2_V"+IntegerToString(gPerfRow)+"_0");
   ObjectDelete(0, PFX+"P2_K"+IntegerToString(gPerfRow)+"_1");
   ObjectDelete(0, PFX+"P2_V"+IntegerToString(gPerfRow)+"_1");
   ObjectDelete(0, PFX+"P2_K"+IntegerToString(gPerfRow)+"_2");
   ObjectDelete(0, PFX+"P2_V"+IntegerToString(gPerfRow)+"_2");
   UILabel(n, PerfPanelX+8, gPerfY0+gPerfRow*rowH+2, "--- " + text + " ---", ClrInfo, PanelFontSize, true);
   gPerfRow++;
  }

color PLColor(double v) { return(v>0 ? ClrProfit : (v<0 ? ClrLoss : PanelTextColor)); }
string Money(double v)  { return((v>0 ? "+" : "") + DoubleToString(v, 2)); }

color StateColor(string st)
  {
   if(st=="Signal Detected")
      return(ClrProfit);
   if(st=="Waiting")
      return(ClrWarning);
   if(st=="Active")
      return(ClrInfo);
   return(ToggleOffColor);
  }

void UpdatePerfPanel()
  {
   if(!gPerfVisible)
      return;
   CalcHistoryStats();

   // --- open positions
   int nBuy = 0, nSell = 0, nPend = 0;
   double lBuy = 0, lSell = 0, wBuy = 0, wSell = 0, floating = 0, slRisk = 0, tpExp = 0;
   bool noSL = false;
   double tv = MarketInfo(Symbol(), MODE_TICKVALUE), ts = MarketInfo(Symbol(), MODE_TICKSIZE);
   for(int i=OrdersTotal()-1; i>=0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
         continue;
      if(!OrderInScope(StatsScope))
         continue;
      int type = OrderType();
      if(type>OP_SELL)
        {
         nPend++;
         continue;
        }
      double op = OrderOpenPrice(), lots = OrderLots();
      floating += OrderProfit()+OrderSwap()+OrderCommission();
      double k = (ts>0 ? tv/ts*lots : 0);
      if(type==OP_BUY)
        {
         nBuy++;
         lBuy += lots;
         wBuy += op*lots;
         if(OrderStopLoss()>0)
            slRisk += (OrderStopLoss()-op)*k;
         else
            noSL = true;
         if(OrderTakeProfit()>0)
            tpExp += (OrderTakeProfit()-op)*k;
        }
      else
        {
         nSell++;
         lSell += lots;
         wSell += op*lots;
         if(OrderStopLoss()>0)
            slRisk += (op-OrderStopLoss())*k;
         else
            noSL = true;
         if(OrderTakeProfit()>0)
            tpExp += (op-OrderTakeProfit())*k;
        }
     }

   int x = PerfPanelX, y = PerfPanelY, w = PerfPanelWidth;
   int rowH = PanelFontSize*2+3;
   gPerfY0 = y+26;
   gPerfRow = 0;

   UIRect(PFX+"P2_BG", x, y, w, 100, PanelBgColor, PanelBorderColor);
   UILabel(PFX+"P2_TITLE", x+8, y+6, "PERFORMANCE & POSITIONS  " + Symbol() + "  (" + (StatsScope==SCOPE_EA_ONLY ? "EA orders" : "all symbol orders") + ")",
           PanelTitleColor, PanelFontSize+1, true);
   UIButton(PFX+"P2_HIDE", x+w-30, y+3, 22, 18, "x", ButtonBgColor, ButtonTextColor);

   double bal = AccountBalance(), eq = AccountEquity(), mg = AccountMargin();
   double ml = (mg>0 ? eq/mg*100.0 : 0);
   double ddNow = (gPeakEquity>0 ? (gPeakEquity-eq)/gPeakEquity*100.0 : 0);
   double dayDDpct = (gDayStartEquity>0 ? gDayMaxDD/gDayStartEquity*100.0 : 0);
   string cur = AccountCurrency();

   PerfHeader("ACCOUNT");
   PerfPair("Balance", D2S(bal) + " " + cur, ClrInfo, "Equity", D2S(eq) + " " + cur, eq>=bal ? ClrProfit : ClrLoss);
   PerfPair("Floating P/L", Money(floating), PLColor(floating), "Closed Today", Money(gTodayPL), PLColor(gTodayPL));
   PerfPair("Total P/L", Money(gTotalPL), PLColor(gTotalPL), "Spread", D2S(SpreadPips(), 1) + " pips",
            (MaxSpreadPips>0 && SpreadPips()>MaxSpreadPips) ? ClrWarning : ClrInfo);
   PerfPair("Margin", D2S(mg), ClrInfo, "Free Margin", D2S(AccountFreeMargin()), ClrInfo);
   PerfPair("Margin Level", mg>0 ? D2S(ml, 1) + " %" : "-", (mg>0 && ml<200) ? ClrWarning : ClrInfo,
            "Daily DD", D2S(gDayMaxDD) + " (" + D2S(dayDDpct, 1) + "%)", gDayMaxDD>0 ? ClrWarning : ClrInfo);
   PerfPair("Max DD", D2S(gMaxDDPct, 2) + " %", gMaxDDPct>0 ? ClrWarning : ClrInfo, "Current DD", D2S(ddNow, 2) + " %", ddNow>0 ? ClrLoss : ClrInfo);

   PerfHeader("POSITIONS");
   PerfPair("Open Trades", IntegerToString(nBuy+nSell) + " (+" + IntegerToString(nPend) + " pending)", ClrInfo,
            "Buy / Sell", IntegerToString(nBuy) + " / " + IntegerToString(nSell), ClrInfo);
   PerfPair("Buy Lots", D2S(lBuy), ClrProfit, "Sell Lots", D2S(lSell), ClrLoss);
   double net = lBuy-lSell;
   PerfPair("Net Lots", D2S(net), net>0 ? ClrProfit : (net<0 ? ClrLoss : PanelTextColor),
            "Avg Buy", lBuy>0 ? PriceStr(wBuy/lBuy) : "-", ClrProfit);
   PerfPair("Avg Sell", lSell>0 ? PriceStr(wSell/lSell) : "-", ClrLoss,
            "SL Exposure", Money(slRisk) + (noSL ? " (NO SL!)" : ""), noSL ? ClrWarning : PLColor(slRisk));
   PerfPair("TP Expected", Money(tpExp), PLColor(tpExp), "", "", PanelTextColor);

   PerfHeader("STATISTICS");
   int closed = gWins+gLosses;
   double wr = (closed>0 ? 100.0*gWins/closed : 0);
   PerfPair("Wins", IntegerToString(gWins), ClrProfit, "Losses", IntegerToString(gLosses), ClrLoss);
   PerfPair("Win Rate", closed>0 ? D2S(wr, 1) + " %" : "-", wr>=50 ? ClrProfit : (closed>0 ? ClrLoss : PanelTextColor),
            "Auto Trading", gAuto ? "ON" : "OFF", gAuto ? ClrProfit : ClrWarning);

   PerfHeader("STRATEGIES");
   string act = "";
   for(int s=0; s<STRAT_COUNT; s++)
      if(gStratOn[s])
         act += StratShort(s) + " ";
   PerfLine("Active", act=="" ? "none" : act, ClrInfo);
   PerfLine("Last Signal", gLastSignalTime>0 ? TimeToString(gLastSignalTime, TIME_DATE|TIME_MINUTES) + "  " +
            (gLastSignalStrat>=0 ? StratName(gLastSignalStrat) : "") + "  " + (gLastSignalDir>0 ? "BUY" : (gLastSignalDir<0 ? "SELL" : "")) : "-",
            gLastSignalDir>0 ? ClrProfit : (gLastSignalDir<0 ? ClrLoss : ClrInfo));
   string ls = gLastSignal;
   if(StringLen(ls)>80)
      ls = StringSubstr(ls, 0, 80) + "..";
   PerfLine("", ls, ClrInfo);
   for(int s=0; s<STRAT_COUNT; s++)
     {
      int sMagic = StratMagic(s), sOpen = 0;
      double sLots = 0, sFloat = 0;
      for(int i=OrdersTotal()-1; i>=0; i--)
        {
         if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
            continue;
         if(OrderSymbol()!=Symbol() || OrderMagicNumber()!=sMagic || OrderType()>OP_SELL)
            continue;
         sOpen++;
         sLots += OrderLots();
         sFloat += OrderProfit()+OrderSwap()+OrderCommission();
        }
      int sClosed = gWinsS[s]+gLossS[s];
      string stTxt = StrategyStatus(s, sOpen);
      string info = StringFormat("open %d | lots %.2f | P/L %s | WR %s (%d) | opened %d", sOpen, sLots, Money(sFloat),
                                 sClosed>0 ? DoubleToString(100.0*gWinsS[s]/sClosed, 0) + "%" : "-", sClosed, gTradesOpened[s]);
      PerfLine(StratShort(s) + " " + stTxt, info, StrategyStatusColor(stTxt));
      if(PerfShowStrategyDetails && gStratOn[s])
        {
         string d = gDetail[s];
         if(StringLen(d)>85)
            d = StringSubstr(d, 0, 85) + "..";
         PerfLine("", d, PanelTextColor);
        }
     }
   PerfLine("Diagnostics", DiagSummary(), ArraySize(gDiagKey)>0 ? ClrWarning : ClrInfo);
   if(MaxSpreadPips>0 && SpreadPips()>MaxSpreadPips)
      PerfLine("WARNING", StringFormat("spread %.1f pips > MaxSpreadPips %.1f - signals blocked", SpreadPips(), MaxSpreadPips), ClrWarning);
   if(gRiskBlock)
      PerfLine("WARNING", gRiskMsg, ClrWarning);
   else
      if(!IsTradeAllowed())
         PerfLine("WARNING", "AutoTrading disabled in terminal / EA settings", ClrWarning);

   PerfHeader("OPEN TRADES (strategy)");
   int shown = 0;
   for(int i=0; i<OrdersTotal() && shown<PerfMaxTradeRows; i++)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
         continue;
      if(!OrderInScope(StatsScope))
         continue;
      int st = MagicToStrat(OrderMagicNumber());
      string who = (st>=0 ? StratName(st) : "External");
      double pl = OrderProfit()+OrderSwap()+OrderCommission();
      bool buy = (OrderType()==OP_BUY || OrderType()==OP_BUYLIMIT || OrderType()==OP_BUYSTOP);
      int otk = OrderTicket();
      string stg = (OrderType()<=OP_SELL ? SmartStageText(otk) : "");
      if(!OrderSelect(otk, SELECT_BY_TICKET))
         continue;
      string txt = StringFormat("%s %.2f @%s  %s  P/L %s%s", OrderTypeName(OrderType()), OrderLots(),
                                PriceStr(OrderOpenPrice()), who, Money(pl), stg!="" ? "  [" + stg + "]" : "");
      PerfLine("#" + IntegerToString(OrderTicket()), txt, OrderType()>OP_SELL ? ClrInfo : (pl!=0 ? PLColor(pl) : (buy ? ClrProfit : ClrLoss)));
      shown++;
     }
   if(shown==0)
      PerfLine("", "no open trades", PanelTextColor);

   // remove stale rows from previous (longer) renders
   for(int r=gPerfRow; r<gPerfRow+PerfMaxTradeRows+24; r++)
     {
      for(int c=0; c<3; c++)
        {
         ObjectDelete(0, PFX+"P2_K"+IntegerToString(r)+"_"+IntegerToString(c));
         ObjectDelete(0, PFX+"P2_V"+IntegerToString(r)+"_"+IntegerToString(c));
        }
      ObjectDelete(0, PFX+"P2_HDR"+IntegerToString(r));
     }
   ObjectSetInteger(0, PFX+"P2_BG", OBJPROP_YSIZE, 30+gPerfRow*rowH);
  }

//+------------------------------------------------------------------+
//| ================= CHART COMMENT + UI REFRESH =================== |
//+------------------------------------------------------------------+
void UpdateComment()
  {
   if(!ShowChartComment)
      return;
   string act = "";
   for(int s=0; s<STRAT_COUNT; s++)
      if(gStratOn[s])
         act += StratShort(s) + " ";
   if(act=="")
      act = "none";
   double fl = 0;
   int n = 0;
   for(int i=OrdersTotal()-1; i>=0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
         continue;
      if(!OrderInScope(StatsScope) || OrderType()>OP_SELL)
         continue;
      n++;
      fl += OrderProfit()+OrderSwap()+OrderCommission();
     }
   string autoTxt = gAuto ? "ON" : "OFF (panel mode)";
   if(!IsTradeAllowed())
      autoTxt += " | terminal AutoTrading DISABLED";
   if(gRiskBlock)
      autoTxt += " | " + gRiskMsg;
   Comment(EA_NAME + "\n" +
           "Active strategies: " + act + "\n" +
           "Auto Trading: " + autoTxt + "\n" +
           "Open trades: " + IntegerToString(n) + "\n" +
           "Floating P/L: " + Money(fl) + " " + AccountCurrency() + "\n" +
           "Last signal: " + (gLastSignalTime>0 ? TimeToString(gLastSignalTime, TIME_DATE|TIME_MINUTES) + " " + gLastSignal : "none") + "\n" +
           "Diagnostics: " + DiagSummary());
  }

void RefreshUI(bool force)
  {
   if(!gDrawUI)
      return;
   if(!force && GetTickCount()-gLastUI<500)
      return;
   gLastUI = GetTickCount();
   BuildTradePanel();
   if(gPerfVisible)
      UpdatePerfPanel();
   DrawTradeLevels();
   UpdateComment();
   ChartRedraw(0);
  }
//+------------------------------------------------------------------+

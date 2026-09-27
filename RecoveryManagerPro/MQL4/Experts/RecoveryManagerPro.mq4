//+------------------------------------------------------------------+
//|                                          RecoveryManagerPro.mq4 |
//|        Recovery Manager Pro - independent MT4 recovery manager   |
//|                                                                   |
//| Independent implementation. It reproduces the OBSERVABLE workflow |
//| of a commercial recovery EA shown in a reference video; it does   |
//| not contain, derive from or claim equivalence with that product's |
//| source code or proprietary indicators. See docs/GAP_REPORT.md.    |
//|                                                                   |
//| Recovery trading can realise losses and increase exposure. No     |
//| setting guarantees recovery. Test on a demo account first.        |
//+------------------------------------------------------------------+
#property copyright "Recovery Manager Pro contributors"
#property link      ""
#property version   "1.00"
#property description "Manages recovery of existing losing market orders: optional lock,"
#property description "separate recovery grid, planned partial closures, overlap, basket exit."
#property description "Idle when there are no eligible orders. No DLL, no licensing server."
#property strict

#include <stdlib.mqh>
#include <RecoveryManagerPro/RM_Types.mqh>
#include <RecoveryManagerPro/RM_Calc.mqh>
#include <RecoveryManagerPro/RM_Planner.mqh>
#include <RecoveryManagerPro/RM_Distance.mqh>

//====================================================================
// INPUTS - only the essentials are shown in the dialog.
// Advanced settings keep safe fixed values below. To show them in the
// dialog too, remove the // in front of the next #define and recompile.
//====================================================================
//#define RMP_SHOW_ADVANCED
#ifdef RMP_SHOW_ADVANCED
   #define ADV input
#else
   #define ADV
#endif

input string S_MODE = "===== 1. MODE =====";
input ENUM_RM_OPMODE         InpOperatingMode           = RM_OP_THREE_MA_WITH_RECOVERY; // Mode

input string S_ENTRYSIGNALm = "===== 2. ENTRY SIGNAL (moving averages) =====";
input ENUM_TIMEFRAMES        InpSignalTF                = PERIOD_CURRENT; // Signal timeframe
input int                    InpFastPeriod              = 10; // Fast MA period
input int                    InpSlowPeriod              = 30; // Slow MA period
input bool                   InpUseFilterMA             = true; // Trend filter MA on
input int                    InpFilterPeriod            = 100; // Trend filter MA period
ADV   int                    InpSignalConfirmBars       = 20; // Wait up to N candles for the filter to confirm a crossover (0 = same candle only)

input string S_LOTSIZE = "===== 3. LOT SIZE =====";
input ENUM_RM_NLOT           InpNormalLotMode           = RM_NLOT_BALANCE; // Lot mode (fixed / per balance)
input double                 InpNormalLot               = 0.01; // Lot (per 1000 balance in balance mode)

input string S_TAKEPROFITAN = "===== 4. TAKE PROFIT AND AVERAGING =====";
input ENUM_RM_SPACING        InpSpacingMode             = RM_SPACE_ATR; // Distances: ATR (auto per symbol) or fixed points
input double                 InpNormalTPATR             = 1.0; // Take profit = ATR x
input bool                   InpNormalAveraging         = true; // Averaging on
input double                 InpNormalAvgATR            = 1.5; // Averaging step = ATR x
input double                 InpNormalAvgMultiplier     = 1.3; // Averaging lot multiplier
input int                    InpNormalMaxPerDir         = 3; // Max orders per direction

input string S_RECOVERY = "===== 5. RECOVERY =====";
input double                 InpLaunchDrawdown          = 8.0; // Start recovery at drawdown (% of balance)
input double                 InpGridATR                 = 1.5; // Recovery step = ATR x
input double                 InpFirstLot                = 0.01; // Recovery start lot (per 1000 balance in balance mode)
input double                 InpLotMultiplier           = 1.2; // Recovery lot multiplier
input int                    InpMaxRecoveryCount        = 8; // Max recovery orders

input string S_ACCOUNTPROTE = "===== 6. ACCOUNT PROTECTION =====";
input double                 InpRecBasketStopPct        = 20.0; // Cut a recovery basket at this loss [% of balance, 0 = off]
input double                 InpFreezeDDPct             = 20.0; // Pause NEW trades at drawdown % (0 = off)
input double                 InpEmergencyValue          = 50.0; // Close all at drawdown % (0 = off)
input double                 InpMaxManagedLots          = 0.10; // Max total lots (per 1000 balance in balance mode, locks excluded)
input int                    InpMaxSpread               = 50; // Max spread (points)

input string S_PANEL = "===== 7. PANEL =====";
input ENUM_RM_PANEL_SIZE     InpPanelSize               = RM_PANEL_NORMAL; // Panel size
input int                    InpFontSize                = 8; // Font size

//--------------------------------------------------------------------
// ADVANCED (fixed values; shown only with RMP_SHOW_ADVANCED)
//--------------------------------------------------------------------
ADV   string                 S_Scope                    = "===== 1. Managed orders =====";
ADV   ENUM_RM_PRIORITY       InpRecoveryPriority        = RM_PRIO_EASY_FIRST; // Recovery priority
ADV   ENUM_RM_SCOPE          InpScope                   = RM_SCOPE_ALL_SYMBOL; // Managed-order scope (this symbol only)
ADV   string                 InpMagicList               = "0"; // Magic allowlist, comma separated (MAGIC_LIST scope)
ADV   string                 InpExcludeMagics           = ""; // Magics never adopted (any scope)
ADV   ENUM_RM_ADOPT          InpAdoptPolicy             = RM_ADOPT_UNTIL_LAUNCH; // Adoption of newly arriving orders
ADV   int                    InpFirstRecoveryTicket     = 0; // First ticket to recover (0 = unused)
ADV   string                 S_Launch                   = "===== 2. Launch =====";
ADV   bool                   InpLocking                 = true; // Lock (hedge) the main position
ADV   ENUM_RM_SLTP           InpDeleteSLTP              = RM_SLTP_LAUNCH_ONLY; // Delete SL and TP of managed orders
ADV   ENUM_RM_LAUNCH         InpLaunchMode              = RM_LAUNCH_INSTANT; // Launch mode
ADV   ENUM_RM_OTHER_EA       InpOtherEAs                = RM_OTHER_KEEP; // Other EAs at launch (closes charts!)
ADV   bool                   InpAllowChartClosure       = false; // Operator enablement for chart closure
ADV   bool                   InpCloseProfitable         = false; // Close profitable orders at launch (finance losers)
ADV   bool                   InpDeletePending           = true; // Delete in-scope pending orders at launch
ADV   string                 S_Partial                  = "===== 3. Partial closing =====";
ADV   double                 InpPartialLots             = 0.01; // Partial-close volume per main side [lots]
ADV   double                 InpPartialTPPoints         = 30.0; // Partial-close TP [distance units, section 13]
ADV   ENUM_RM_TP_BASIS       InpTPBasis                 = RM_TPB_RECOVERY_LOTS; // TP points-to-money lot basis (PROPOSED)
ADV   int                    InpOverlapThreshold        = 3; // Overlap threshold [recovery orders, 0 = off]
ADV   ENUM_RM_OVERLAP_CMP    InpOverlapCompare          = RM_OVL_GE; // Overlap comparison (UNRESOLVED in reference)
ADV   ENUM_RM_OVERLAP_INDEX  InpOverlapIndex            = RM_OVIDX_RECOUNT; // Grid index after overlap closure
ADV   bool                   InpBasketTP                = false; // Whole-basket TP enabled
ADV   double                 InpBasketTPMoney           = 25.0; // Whole-basket TP [account currency]
ADV   string                 S_Recovery                 = "===== 4. Recovery orders =====";
ADV   ENUM_RM_SIGNAL         InpSignalMode              = RM_SIG_TREND; // Recovery filter
ADV   ENUM_RM_DIRS           InpRecoveryDirs            = RM_DIRS_BOTH; // Allowed recovery directions
ADV   double                 InpGridStepPoints          = 300; // Recovery grid step [distance units, section 13]
ADV   double                 InpStepMultiplier          = 1.1; // Step multiplier [x]
ADV   bool                   InpOnePerBar               = true; // One recovery order per bar
ADV   bool                   InpMultidirectional        = true; // Multidirectional recovery
ADV   bool                   InpCrossFinance            = true; // Winning basket's surplus also cuts losing opposite recovery orders
ADV   double                 InpCrossFinanceDDPct       = 10.0; // ...used from this account drawdown [%] or while paused
ADV   bool                   InpRecoveryMATrend         = false; // Recovery orders only in the MA trend direction (slow MA vs filter MA)
ADV   int                    InpMaxSlippage             = 30; // Maximum slippage [distance units, section 13]
ADV   double                 InpMaxRecoveryLot          = 0.10; // Maximum recovery order volume [lots]
ADV   int                    InpRecoveryMagic           = 9751421; // Recovery magic number
ADV   int                    InpLockMagic               = 9751422; // Lock (hedge) magic number (PROPOSED)
ADV   ENUM_RM_LOT_ROUND      InpLotRounding             = RM_ROUND_DOWN; // Final lot normalisation
ADV   ENUM_RM_CAP            InpCapBehavior             = RM_CAP_REFUSE; // Lot above maximum: refuse or clamp
ADV   ENUM_RM_FIRST_DIR      InpFirstDirection          = RM_FD_LAST_CANDLE; // First basket direction (unfiltered, PROPOSED)
ADV   int                    InpMaxEntriesPerEvent      = 1; // Max recovery entries per tick (gap guard)
ADV   bool                   InpRelockOnImbalance       = true; // Re-lock automatically if main becomes unequal
ADV   string                 S_Costs                    = "===== 5. Costs =====";
ADV   bool                   InpFullCommission          = false; // Full commission calc (exit = booked again)
ADV   double                 InpExtraCommPerLot         = 0.0; // Extra unbooked exit commission [money/lot]
ADV   double                 InpExecBufferPoints        = 5.0; // Execution buffer [distance units per closed lot]
ADV   string                 S_Notify                   = "===== 6. Notifications =====";
ADV   ENUM_RM_NOTIFY         InpNotify                  = RM_NOTIFY_ALERT; // Launch / end notifications
ADV   string                 S_Graphics                 = "===== 7. Panel and graphics =====";
ADV   bool                   InpPanelOpensRecovery      = false; // Manual panel default role: true = RECOVERY
ADV   double                 InpManualLot               = 0.01; // Manual panel initial volume [lots]
ADV   bool                   InpConfirmActions          = true; // Two-click confirmation for destructive actions
ADV   ENUM_RM_THEME          InpTheme                   = RM_THEME_DARK; // Panel theme
ADV   ENUM_RM_ANNOT          InpAnnotations             = RM_ANNOT_CHART; // Closed-profit annotations
ADV   bool                   InpShowCloseLine           = true; // Possible-close-zone line
ADV   bool                   InpShowGridLevels          = true; // Next recovery entry levels
ADV   bool                   InpDrawConnectors          = true; // Dotted open->close connectors
ADV   bool                   InpApplyChartColors        = false; // Black chart / green candles scheme
ADV   int                    InpPanelX                  = 8; // Main panel X offset [px]
ADV   int                    InpPanelY                  = 22; // Main panel Y offset [px]
ADV   bool                   InpShowAccountBlock        = true; // ENHANCEMENT: account & session metrics
ADV   string                 S_Trend                    = "===== 8. Signal filters =====";
ADV   ENUM_TIMEFRAMES        InpTrendTF                 = PERIOD_CURRENT; // Filter timeframe
ADV   int                    InpTrendAmplitude          = 20; // Trend amplitude [bars]
ADV   ENUM_RM_TREND_FIRST    InpTrendFirst              = RM_TF_WITH_TREND; // Initial entry vs trend
ADV   ENUM_RM_TREND_NEXT     InpTrendNext               = RM_TN_WITH_TREND; // Subsequent averaging vs trend
ADV   string                 InpExtIndicator            = ""; // External adapter: indicator name (licensed)
ADV   int                    InpExtBuyBuffer            = 0; // External adapter: BUY buffer index
ADV   int                    InpExtSellBuffer           = 1; // External adapter: SELL buffer index
ADV   string                 S_Risk                     = "===== 9. Risk (ENHANCEMENTS) =====";
ADV   double                 InpMaxRecoveryLotsSum      = 0.0; // Max total recovery lots [0 = off]
ADV   double                 InpMinFreeMargin           = 0.0; // Min free margin for new entries [money]
ADV   double                 InpMinMarginLevel          = 300.0; // Min margin level for new entries [%]
ADV   ENUM_RM_EMERGENCY      InpEmergencyMode           = RM_EMG_PERCENT; // Emergency stop measure
ADV   ENUM_RM_EMG_ACTION     InpEmergencyAction         = RM_EMGA_CLOSE_ALL; // Emergency action
ADV   bool                   InpEmergencyOverPause      = true; // Emergency also acts while paused
ADV   double                 InpDailyLossLimit          = 0.0; // Daily realised loss lockout [money, 0 = off]
ADV   int                    InpSessionStartHour        = 0; // New entries from hour [server, 0-23]
ADV   int                    InpSessionEndHour          = 24; // New entries until hour [server, 1-24]
ADV   int                    InpStaleQuoteSeconds       = 60; // Block entries if last quote older [s, 0 = off]
ADV   bool                   InpAuditCsv                = true; // CSV audit export
ADV   int                    InpInstanceId              = 1; // Strategy / instance id (lock key)
ADV   int                    InpManualOriginalMagic     = 0; // Magic for manual ORIGINAL orders
ADV   string                 S_Test                     = "===== 10. Strategy Tester only =====";
ADV   bool                   InpEnableTestSeeds         = false; // Enable deterministic seed orders (tester only)
ADV   ENUM_RM_TEST_SEED      InpTestSeedScenario        = RM_SEED_NONE; // Seed scenario
ADV   double                 InpTestSeedLots            = 0.10; // Seed volume [lots]
ADV   int                    InpTestSeedBar             = 5; // Open seeds on this bar count
ADV   int                    InpTestSeedMagic           = 12345; // Seed magic number
ADV   string                 S_OpMode                   = "===== 11. Operating mode and recovery handover =====";
ADV   ENUM_RM_TRIG_MODE      InpRecoveryTriggerMode     = RM_TRIG_PERCENT; // Handover trigger unit (threshold = InpLaunchDrawdown)
ADV   ENUM_RM_TRIG_SCOPE     InpRecoveryTriggerScope    = RM_TSCOPE_MANAGED; // Handover trigger scope
ADV   bool                   InpAutoResumeAfterRecovery = true; // Resume normal trading automatically after a completed cycle
ADV   int                    InpResumeCooldownBars      = 3; // Cooldown after cycle end [signal-timeframe bars]
ADV   bool                   InpRequireFreshSignalAfterRecovery= true; // Only crossovers whose candle opens after the cycle
ADV   bool                   InpCombinedAdoptOthers     = false; // Also hand over orders in the section-1 scope (normally only own normal trades)
ADV   string                 S_ThreeMA                  = "===== 12. Three-MA normal strategy (project defaults, not the reference EA's) =====";
ADV   int                    InpNormalMagic             = 7351001; // Normal-strategy magic number
ADV   ENUM_MA_METHOD         InpFastMethod              = MODE_EMA; // Fast MA method
ADV   ENUM_APPLIED_PRICE     InpFastPrice               = PRICE_CLOSE; // Fast MA applied price
ADV   ENUM_MA_METHOD         InpSlowMethod              = MODE_EMA; // Slow MA method
ADV   ENUM_APPLIED_PRICE     InpSlowPrice               = PRICE_CLOSE; // Slow MA applied price
ADV   ENUM_MA_METHOD         InpFilterMethod            = MODE_SMA; // Filter MA method
ADV   ENUM_APPLIED_PRICE     InpFilterPrice             = PRICE_CLOSE; // Filter MA applied price
ADV   ENUM_RM_DIRS           InpNormalDirs              = RM_DIRS_BOTH; // Allowed normal directions
ADV   bool                   InpNormalOneBasket         = true; // Ignore new signals while any normal basket is open
ADV   double                 InpNormalLotPerBalance     = 1000.0; // Balance per InpNormalLot [account currency]
ADV   double                 InpNormalAvgStepPoints     = 300; // Minimum averaging spacing from last fill [distance units]
ADV   double                 InpNormalMaxLots           = 0.0; // Maximum total normal exposure [lots, 0 = off]
ADV   double                 InpNormalTPPoints          = 200; // Virtual basket TP from weighted average [distance units, 0 = off]
ADV   bool                   InpNormalOverlap           = false; // First/last-order overlap for normal baskets
ADV   int                    InpNormalOverlapMinOrders  = 3; // Overlap from this many orders in a direction
ADV   double                 InpNormalOverlapTPPoints   = 50; // Overlap target [distance units x lots of the two orders]
ADV   int                    InpNormalSlippage          = 30; // Normal-strategy slippage [distance units]
ADV   string                 S_Units                    = "===== 13. Distance units (price-distance normalisation) =====";
ADV   int                    InpConfigVersion           = 2; // Config version: 2 = unit mode below; 0/1 = legacy broker points (old .set files: set 0)
ADV   ENUM_RM_DIST_MODE      InpDistanceUnitMode        = RM_DU_STANDARDIZED; // Distance unit mode (used from config version 2)
ADV   double                 InpCustomUnitPrice         = 0.0; // CUSTOM_UNIT: price value of one unit
ADV   string                 InpSymbolProfileMap        = "GOLD:XAUUSD"; // Explicit aliases SYMBOL:PROFILE (FX, FXJPY, XAUUSD)
ADV   string                 InpSymbolPrefix            = ""; // Broker symbol prefix stripped for map lookup
ADV   string                 InpSymbolSuffix            = ""; // Broker symbol suffix stripped for map lookup
ADV   string                 InpUnitOverrides           = ""; // Per-symbol unit price SYMBOL:PRICE (e.g. XAGUSD:0.001)
ADV   bool                   InpApplyUnitsToActiveCycle = false; // Operator: re-apply current units to an ACTIVE basket
ADV   bool                   InpWriteMigrationPreview   = true; // Legacy config: write a migration preview .set
ADV   string                 S_Protect2                 = "===== Protection / spacing details =====";
ADV   int                    InpATRPeriod               = 14;    // ATR period for ATR-based distances [bars]
ADV   double                 InpPartialTPATR            = 0.3;   // ATR mode: recovery partial-close TP = ATR x
ADV   double                 InpNormalOverlapATR        = 0.3;   // ATR mode: normal overlap target = ATR x
ADV   double                 InpFreezeResumePct         = 15.0;  // Resume new trades below this drawdown % (after a pause)
ADV   bool                   InpPauseAllowsHedge        = false; // During the pause / lots cap, still allow orders that shrink net exposure
ADV   bool                   InpEmergencyAutoResume     = true;  // After a close-all, resume automatically after the cooldown
ADV   int                    InpEmergencyCooldownBars   = 24;    // Calm-down after a close-all [signal-timeframe bars]
ADV   bool                   InpShowUnitsPanel          = false; // Show the distance-units diagnostics panel

//====================================================================
// MODULES
//====================================================================
#include <RecoveryManagerPro/RM_Globals.mqh>
#include <RecoveryManagerPro/RM_Log.mqh>
#include <RecoveryManagerPro/RM_Config.mqh>
#include <RecoveryManagerPro/RM_Broker.mqh>
#include <RecoveryManagerPro/RM_DistanceSvc.mqh>
#include <RecoveryManagerPro/RM_Persist.mqh>
#include <RecoveryManagerPro/RM_Registry.mqh>
#include <RecoveryManagerPro/RM_Signals.mqh>
#include <RecoveryManagerPro/RM_Risk.mqh>
#include <RecoveryManagerPro/RM_Executor.mqh>
#include <RecoveryManagerPro/RM_Engine.mqh>
#include <RecoveryManagerPro/RM_Annotations.mqh>
#include <RecoveryManagerPro/RM_Dashboard.mqh>
#include <RecoveryManagerPro/RM_Normal.mqh>
#include <RecoveryManagerPro/RM_Controller.mqh>
#include <RecoveryManagerPro/RM_DashCycle.mqh>
#include <RecoveryManagerPro/RM_DashUnits.mqh>

//+------------------------------------------------------------------+
//| Expert initialization                                             |
//+------------------------------------------------------------------+
int OnInit()
  {
   string err = "";
   if(!RM_ValidateInputs(err))
     {
      Alert("Recovery Manager Pro: invalid settings - ", err);
      Print("RMP invalid settings: ", err);
      return INIT_PARAMETERS_INCORRECT;
     }
   RM_InitIdentity();
   if(!RM_AcquireInstanceLock(err))
     {
      Alert("Recovery Manager Pro: ", err);
      Print("RMP refused to start: ", err);
      return INIT_FAILED;
     }
   RM_RefreshMeta();
   RM_AuditOpen();
   RM_InitRuntime();
   if(!RM_LoadState())
      RM_Audit("INIT", 0, 0, 0, "no saved state - fresh session");
   else
      RM_Audit("INIT", 0, 0, 0, "state restored: " + RM_StateName(g_state));
   RM_ReconcileRegistry();      // broker truth wins over the file
   RM_CtlReconcileOnStart();    // restore the recovery latch before either engine may act
   RM_DistStartup();            // unit contexts of active baskets + legacy migration preview
   RM_PreviewChartClosure(false);
   if(InpApplyChartColors)
      RM_ApplyChartColors();
   RM_DashInit();
   EventSetMillisecondTimer(250);
   // no trading from OnInit: the first tick runs the engine
   RM_BuildBook();
   RM_UpdatePreviews(true);
   g_status = "Initialised - waiting for the first tick";
   RM_DashRefresh(true);
   return INIT_SUCCEEDED;
  }

//+------------------------------------------------------------------+
//| Expert deinitialization                                           |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   EventKillTimer();
   RM_SaveState();
   RM_Audit("DEINIT", 0, 0, 0, "reason " + IntegerToString(reason));
   RM_AuditClose();
   bool keepChartObjects = (reason == REASON_CHARTCHANGE);
   RM_DashDeinit();
   if(!keepChartObjects)
      RM_AnnotDeinit();
   if(InpApplyChartColors && reason != REASON_CHARTCHANGE)
      RM_RestoreChartColors();
   // the instance lock is kept across timeframe/parameter changes of this chart
   if(reason == REASON_REMOVE || reason == REASON_CHARTCLOSE || reason == REASON_CLOSE ||
      reason == REASON_INITFAILED || reason == REASON_ACCOUNT)
      RM_ReleaseInstanceLock();
   Comment("");
  }

//+------------------------------------------------------------------+
//| Tick                                                              |
//+------------------------------------------------------------------+
void OnTick()
  {
   if(IsTesting())
      RM_PollTesterButtons();   // MT4 tester delivers no chart events
   RM_TestSeeds();
   RM_ControllerTick();         // single authoritative controller (engine + normal strategy)
   if(IsTesting())
      RM_DashRefresh(false);    // MT4 tester generates no timer events
  }

//+------------------------------------------------------------------+
//| Timer: repaint only (no trading decisions)                        |
//+------------------------------------------------------------------+
void OnTimer()
  {
   RM_DashRefresh(false);
  }

//+------------------------------------------------------------------+
//| Chart events: buttons, edits, drag, resize                        |
//+------------------------------------------------------------------+
void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
  {
   if(id == CHARTEVENT_OBJECT_CLICK)
      RM_OnButton(sparam);
   else if(id == CHARTEVENT_OBJECT_ENDEDIT)
      RM_OnEditDone(sparam);
   else if(id == CHARTEVENT_OBJECT_DRAG)
      RM_OnDrag(sparam);
   else if(id == CHARTEVENT_CHART_CHANGE)
      RM_DashRelayout();
  }
//+------------------------------------------------------------------+

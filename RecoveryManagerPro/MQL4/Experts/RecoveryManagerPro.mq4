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

//====================================================================
// INPUTS  (units in brackets; ranges validated in RM_Config.mqh)
//====================================================================
input string             S_Scope               = "===== 1. Managed orders =====";
input ENUM_RM_PRIORITY   InpRecoveryPriority   = RM_PRIO_EASY_FIRST;   // Recovery priority
input ENUM_RM_SCOPE      InpScope              = RM_SCOPE_ALL_SYMBOL;  // Managed-order scope (this symbol only)
input string             InpMagicList          = "0";                  // Magic allowlist, comma separated (MAGIC_LIST scope)
input string             InpExcludeMagics      = "";                   // Magics never adopted (any scope)
input ENUM_RM_ADOPT      InpAdoptPolicy        = RM_ADOPT_UNTIL_LAUNCH;// Adoption of newly arriving orders
input int                InpFirstRecoveryTicket= 0;                    // First ticket to recover (0 = unused)

input string             S_Launch              = "===== 2. Launch =====";
input bool               InpLocking            = true;                 // Lock (hedge) the main position
input ENUM_RM_SLTP       InpDeleteSLTP         = RM_SLTP_LAUNCH_ONLY;  // Delete SL and TP of managed orders
input ENUM_RM_LAUNCH     InpLaunchMode         = RM_LAUNCH_INSTANT;    // Launch mode
input double             InpLaunchDrawdown     = 35.0;                 // Launch drawdown [% of balance or account currency]
input ENUM_RM_OTHER_EA   InpOtherEAs           = RM_OTHER_KEEP;        // Other EAs at launch (closes charts!)
input bool               InpAllowChartClosure  = false;                // Operator enablement for chart closure
input bool               InpCloseProfitable    = true;                 // Close profitable orders at launch (finance losers)
input bool               InpDeletePending      = true;                 // Delete in-scope pending orders at launch

input string             S_Partial             = "===== 3. Partial closing =====";
input double             InpPartialLots        = 0.01;                 // Partial-close volume per main side [lots]
input double             InpPartialTPPoints    = 30.0;                 // Partial-close TP [points, NOT pips/money]
input ENUM_RM_TP_BASIS   InpTPBasis            = RM_TPB_RECOVERY_LOTS; // TP points-to-money lot basis (PROPOSED)
input int                InpOverlapThreshold   = 2;                    // Overlap threshold [recovery orders, 0 = off]
input ENUM_RM_OVERLAP_CMP InpOverlapCompare    = RM_OVL_GE;            // Overlap comparison (UNRESOLVED in reference)
input ENUM_RM_OVERLAP_INDEX InpOverlapIndex    = RM_OVIDX_RECOUNT;     // Grid index after overlap closure
input bool               InpBasketTP           = false;                // Whole-basket TP enabled
input double             InpBasketTPMoney      = 25.0;                 // Whole-basket TP [account currency]

input string             S_Recovery            = "===== 4. Recovery orders =====";
input ENUM_RM_SIGNAL     InpSignalMode         = RM_SIG_SIMPLE_GRID;   // Recovery filter
input ENUM_RM_DIRS       InpRecoveryDirs       = RM_DIRS_BOTH;         // Allowed recovery directions
input double             InpFirstLot           = 0.01;                 // First recovery order volume [lots]
input double             InpLotMultiplier      = 1.2;                  // Volume multiplier [x, >= 1]
input double             InpGridStepPoints     = 300;                  // Grid step [points]
input double             InpStepMultiplier     = 1.0;                  // Step multiplier [x]
input bool               InpOnePerBar          = true;                 // One recovery order per bar
input bool               InpMultidirectional   = false;                // Multidirectional recovery
input int                InpMaxSlippage        = 30;                   // Maximum slippage [points]
input int                InpMaxSpread          = 50;                   // Maximum spread for NEW exposure [points]
input double             InpMaxRecoveryLot     = 1.0;                  // Maximum recovery order volume [lots]
input int                InpMaxRecoveryCount   = 12;                   // Maximum recovery orders (both directions)
input int                InpRecoveryMagic      = 9751421;              // Recovery magic number
input int                InpLockMagic          = 9751422;              // Lock (hedge) magic number (PROPOSED)
input ENUM_RM_LOT_ROUND  InpLotRounding        = RM_ROUND_DOWN;        // Final lot normalisation
input ENUM_RM_CAP        InpCapBehavior        = RM_CAP_REFUSE;        // Lot above maximum: refuse or clamp
input ENUM_RM_FIRST_DIR  InpFirstDirection     = RM_FD_LAST_CANDLE;    // First basket direction (unfiltered, PROPOSED)
input int                InpMaxEntriesPerEvent = 1;                    // Max recovery entries per tick (gap guard)
input bool               InpRelockOnImbalance  = true;                 // Re-lock automatically if main becomes unequal

input string             S_Costs               = "===== 5. Costs =====";
input bool               InpFullCommission     = false;                // Full commission calc (exit = booked again)
input double             InpExtraCommPerLot    = 0.0;                  // Extra unbooked exit commission [money/lot]
input double             InpExecBufferPoints   = 0.0;                  // Execution buffer [points per closed lot]

input string             S_Notify              = "===== 6. Notifications =====";
input ENUM_RM_NOTIFY     InpNotify             = RM_NOTIFY_OFF;        // Launch / end notifications

input string             S_Graphics            = "===== 7. Panel and graphics =====";
input bool               InpPanelOpensRecovery = false;                // Manual panel default role: true = RECOVERY
input double             InpManualLot          = 0.10;                 // Manual panel initial volume [lots]
input bool               InpConfirmActions     = true;                 // Two-click confirmation for destructive actions
input ENUM_RM_THEME      InpTheme              = RM_THEME_DARK;        // Panel theme
input ENUM_RM_ANNOT      InpAnnotations        = RM_ANNOT_CHART;       // Closed-profit annotations
input ENUM_RM_PANEL_SIZE InpPanelSize          = RM_PANEL_NORMAL;      // Panel size
input int                InpFontSize           = 8;                    // Font size [5..14] (reference: 6)
input bool               InpShowCloseLine      = false;                // Possible-close-zone line
input bool               InpShowGridLevels     = true;                 // Next recovery entry levels
input bool               InpDrawConnectors     = true;                 // Dotted open->close connectors
input bool               InpApplyChartColors   = false;                // Black chart / green candles scheme
input int                InpPanelX             = 8;                    // Main panel X offset [px]
input int                InpPanelY             = 22;                   // Main panel Y offset [px]
input bool               InpShowAccountBlock   = true;                 // ENHANCEMENT: account & session metrics

input string             S_Trend               = "===== 8. Signal filters =====";
input ENUM_TIMEFRAMES    InpTrendTF            = PERIOD_CURRENT;       // Filter timeframe
input int                InpTrendAmplitude     = 4;                    // Trend amplitude [bars]
input ENUM_RM_TREND_FIRST InpTrendFirst        = RM_TF_WITH_TREND;     // Initial entry vs trend
input ENUM_RM_TREND_NEXT InpTrendNext          = RM_TN_ANY;            // Subsequent averaging vs trend
input string             InpExtIndicator       = "";                   // External adapter: indicator name (licensed)
input int                InpExtBuyBuffer       = 0;                    // External adapter: BUY buffer index
input int                InpExtSellBuffer      = 1;                    // External adapter: SELL buffer index

input string             S_Risk                = "===== 9. Risk (ENHANCEMENTS) =====";
input double             InpMaxManagedLots     = 0.0;                  // Max combined managed lots [0 = off]
input double             InpMaxRecoveryLotsSum = 0.0;                  // Max total recovery lots [0 = off]
input double             InpMinFreeMargin      = 0.0;                  // Min free margin for new entries [money]
input double             InpMinMarginLevel     = 200.0;                // Min margin level for new entries [%]
input ENUM_RM_EMERGENCY  InpEmergencyMode      = RM_EMG_OFF;           // Emergency stop measure
input double             InpEmergencyValue     = 30.0;                 // Emergency threshold [money or %]
input ENUM_RM_EMG_ACTION InpEmergencyAction    = RM_EMGA_PAUSE;        // Emergency action
input bool               InpEmergencyOverPause = true;                 // Emergency also acts while paused
input double             InpDailyLossLimit     = 0.0;                  // Daily realised loss lockout [money, 0 = off]
input int                InpSessionStartHour   = 0;                    // New entries from hour [server, 0-23]
input int                InpSessionEndHour     = 24;                   // New entries until hour [server, 1-24]
input int                InpStaleQuoteSeconds  = 0;                    // Block entries if last quote older [s, 0 = off]
input bool               InpAuditCsv           = true;                 // CSV audit export
input int                InpInstanceId         = 1;                    // Strategy / instance id (lock key)
input int                InpManualOriginalMagic= 0;                    // Magic for manual ORIGINAL orders

input string             S_Test                = "===== 10. Strategy Tester only =====";
input bool               InpEnableTestSeeds    = false;                // Enable deterministic seed orders (tester only)
input ENUM_RM_TEST_SEED  InpTestSeedScenario   = RM_SEED_NONE;         // Seed scenario
input double             InpTestSeedLots       = 0.10;                 // Seed volume [lots]
input int                InpTestSeedBar        = 5;                    // Open seeds on this bar count
input int                InpTestSeedMagic      = 12345;                // Seed magic number

input string             S_OpMode              = "===== 11. Operating mode and recovery handover =====";
input ENUM_RM_OPMODE     InpOperatingMode      = RM_OP_RECOVERY_ONLY;  // Operating mode
input ENUM_RM_TRIG_MODE  InpRecoveryTriggerMode = RM_TRIG_PERCENT;     // Handover trigger unit (threshold = InpLaunchDrawdown)
input ENUM_RM_TRIG_SCOPE InpRecoveryTriggerScope = RM_TSCOPE_MANAGED;  // Handover trigger scope
input bool               InpAutoResumeAfterRecovery = true;            // Resume normal trading automatically after a completed cycle
input int                InpResumeCooldownBars = 3;                    // Cooldown after cycle end [signal-timeframe bars]
input bool               InpRequireFreshSignalAfterRecovery = true;    // Only crossovers whose candle opens after the cycle
input bool               InpCombinedAdoptOthers = false;               // Also hand over orders in the section-1 scope (normally only own normal trades)

input string             S_ThreeMA             = "===== 12. Three-MA normal strategy (project defaults, not the reference EA's) =====";
input int                InpNormalMagic        = 7351001;              // Normal-strategy magic number
input ENUM_TIMEFRAMES    InpSignalTF           = PERIOD_CURRENT;       // Signal timeframe
input int                InpFastPeriod         = 10;                   // Fast MA period [bars]
input ENUM_MA_METHOD     InpFastMethod         = MODE_EMA;             // Fast MA method
input ENUM_APPLIED_PRICE InpFastPrice          = PRICE_CLOSE;          // Fast MA applied price
input int                InpSlowPeriod         = 30;                   // Slow MA period [bars]
input ENUM_MA_METHOD     InpSlowMethod         = MODE_EMA;             // Slow MA method
input ENUM_APPLIED_PRICE InpSlowPrice          = PRICE_CLOSE;          // Slow MA applied price
input bool               InpUseFilterMA        = true;                 // Third (filter) MA enabled
input int                InpFilterPeriod       = 100;                  // Filter MA period [bars]
input ENUM_MA_METHOD     InpFilterMethod       = MODE_SMA;             // Filter MA method
input ENUM_APPLIED_PRICE InpFilterPrice        = PRICE_CLOSE;          // Filter MA applied price
input ENUM_RM_DIRS       InpNormalDirs         = RM_DIRS_BOTH;         // Allowed normal directions
input bool               InpNormalOneBasket    = true;                 // Ignore new signals while any normal basket is open
input ENUM_RM_NLOT       InpNormalLotMode      = RM_NLOT_FIXED;        // Initial lot: fixed or balance-based
input double             InpNormalLot          = 0.01;                 // Initial lot [lots] (per InpNormalLotPerBalance in balance mode)
input double             InpNormalLotPerBalance = 1000.0;              // Balance per InpNormalLot [account currency]
input bool               InpNormalAveraging    = false;                // Normal averaging enabled
input double             InpNormalAvgStepPoints = 300;                 // Minimum averaging spacing from last fill [points]
input double             InpNormalAvgMultiplier = 1.5;                 // Averaging lot multiplier [x]
input int                InpNormalMaxPerDir    = 5;                    // Maximum normal orders per direction
input double             InpNormalMaxLots      = 1.0;                  // Maximum total normal exposure [lots, 0 = off]
input double             InpNormalTPPoints     = 200;                  // Virtual basket TP from weighted average [points, 0 = off]
input bool               InpNormalOverlap      = false;                // First/last-order overlap for normal baskets
input int                InpNormalOverlapMinOrders = 3;                // Overlap from this many orders in a direction
input double             InpNormalOverlapTPPoints = 50;                // Overlap target [points x lots of the two orders]
input int                InpNormalMaxSpread    = 50;                   // Maximum spread for normal entries [points]
input int                InpNormalSlippage     = 30;                   // Normal-strategy slippage [points]

//====================================================================
// MODULES
//====================================================================
#include <RecoveryManagerPro/RM_Globals.mqh>
#include <RecoveryManagerPro/RM_Log.mqh>
#include <RecoveryManagerPro/RM_Config.mqh>
#include <RecoveryManagerPro/RM_Broker.mqh>
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

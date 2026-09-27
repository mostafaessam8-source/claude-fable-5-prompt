//+------------------------------------------------------------------+
//| RM_Types.mqh                                                      |
//| Recovery Manager Pro - shared enums, constants and plain structs  |
//|                                                                   |
//| PORTABILITY RULE: this file is compiled both by MetaEditor (MQL4) |
//| and by a native C++ compiler (tests/mql4_shim.h). Keep it free of |
//| MQL-only API calls, strings, dynamic arrays and pointers.         |
//| Enum integer values are part of the .set file contract - never    |
//| renumber existing members.                                        |
//+------------------------------------------------------------------+
#ifndef RM_TYPES_MQH
#define RM_TYPES_MQH

#define RM_MAX_LEGS      256     // max orders one planner snapshot can hold
#define RM_MAX_PLAN_LEGS 160     // max legs in one closure plan / journal
#define RM_EPS           1e-9

// ---- order roles -------------------------------------------------
#define RM_ROLE_NONE      0
#define RM_ROLE_ORIGINAL  1
#define RM_ROLE_LOCK      2
#define RM_ROLE_RECOVERY  3
#define RM_ROLE_NORMAL    4     // Three-MA normal-strategy order (never in the recovery registry)

// ---- order sides (identical to MT4 OP_BUY / OP_SELL) --------------
#define RM_BUY   0
#define RM_SELL  1

// ---- engine states -----------------------------------------------
enum ENUM_RM_STATE
  {
   RM_ST_IDLE       = 0,
   RM_ST_ARMED      = 1,
   RM_ST_PREPARING  = 2,
   RM_ST_LOCKING    = 3,
   RM_ST_RECOVERING = 4,
   RM_ST_PAUSED     = 5,
   RM_ST_CLOSING    = 6,
   RM_ST_COMPLETE   = 7,
   RM_ST_ERROR_HOLD = 8
  };

// ---- inputs --------------------------------------------------------
enum ENUM_RM_PRIORITY
  {
   RM_PRIO_EASY_FIRST = 0,   // Easy-to-close orders first
   RM_PRIO_HARD_FIRST = 1    // Hard-to-close orders first
  };

enum ENUM_RM_SCOPE
  {
   RM_SCOPE_ALL_SYMBOL = 0,  // All orders on this symbol
   RM_SCOPE_MANUAL     = 1,  // Manual orders only (magic 0)
   RM_SCOPE_MAGIC_LIST = 2   // Magic-number allowlist
  };

enum ENUM_RM_ADOPT
  {
   RM_ADOPT_UNTIL_LAUNCH = 0, // Adopt new in-scope orders only until launch
   RM_ADOPT_NEVER        = 1, // Adopt only the activation snapshot
   RM_ADOPT_ALWAYS       = 2  // Keep adopting new in-scope orders
  };

enum ENUM_RM_LAUNCH
  {
   RM_LAUNCH_INSTANT    = 0, // Instant start
   RM_LAUNCH_DD_PERCENT = 1, // Start at drawdown % of balance
   RM_LAUNCH_DD_MONEY   = 2  // Start at drawdown in account currency
  };

enum ENUM_RM_OTHER_EA
  {
   RM_OTHER_KEEP              = 0, // Do not disable
   RM_OTHER_CLOSE_SAME_SYMBOL = 1, // Close other charts of this symbol
   RM_OTHER_CLOSE_ALL_EA      = 2  // Close all other charts
   // MQL4 cannot tell which chart hosts an EA, so charts are chosen by symbol only
  };

enum ENUM_RM_SIGNAL
  {
   RM_SIG_SIMPLE_GRID     = 0, // Simple Grids (no filter)
   RM_SIG_CANDLE_REVERSAL = 1, // RM Candle Reversal (independent, NOT BullsBears)
   RM_SIG_TREND           = 2, // RM Swing Trend (independent, NOT AW Trend Predictor)
   RM_SIG_EXTERNAL        = 3  // External indicator adapter (buffers supplied by operator)
  };

enum ENUM_RM_DIRS
  {
   RM_DIRS_BOTH      = 0, // Buy and Sell
   RM_DIRS_BUY_ONLY  = 1, // Buy only
   RM_DIRS_SELL_ONLY = 2, // Sell only
   RM_DIRS_NONE      = 3  // Automatic entries disabled
  };

enum ENUM_RM_TREND_FIRST
  {
   RM_TF_WITH_TREND    = 0, // By trend direction
   RM_TF_AGAINST_TREND = 1, // Against trend direction
   RM_TF_ANY           = 2  // Any direction
  };

enum ENUM_RM_TREND_NEXT
  {
   RM_TN_ANY           = 0, // Any direction
   RM_TN_WITH_TREND    = 1, // By trend direction
   RM_TN_AGAINST_TREND = 2  // Against trend direction
  };

enum ENUM_RM_OVERLAP_CMP
  {
   RM_OVL_GE = 0, // count >= threshold
   RM_OVL_GT = 1  // count >  threshold
  };

enum ENUM_RM_OVERLAP_INDEX
  {
   RM_OVIDX_RECOUNT  = 0, // next index = remaining order count
   RM_OVIDX_CONTINUE = 1  // next index continues from highest ever used
  };

enum ENUM_RM_TP_BASIS
  {
   RM_TPB_RECOVERY_LOTS = 0, // points x value x recovery lots being closed
   RM_TPB_SLICE_LOTS    = 1, // points x value x main slice lots
   RM_TPB_MIN_LOT       = 2  // points x value x broker minimum lot
  };

enum ENUM_RM_LOT_ROUND
  {
   RM_ROUND_DOWN    = 0, // floor to lot step (never exceeds raw)
   RM_ROUND_NEAREST = 1  // nearest lot step
  };

enum ENUM_RM_CAP
  {
   RM_CAP_REFUSE = 0, // refuse an entry whose lot exceeds the cap
   RM_CAP_CLAMP  = 1  // clamp the lot to the cap
  };

enum ENUM_RM_FIRST_DIR
  {
   RM_FD_LAST_CANDLE = 0, // direction of last closed candle
   RM_FD_BUY         = 1, // always BUY first
   RM_FD_SELL        = 2  // always SELL first
  };

enum ENUM_RM_SLTP
  {
   RM_SLTP_KEEP        = 0, // keep managed SL/TP
   RM_SLTP_LAUNCH_ONLY = 1, // remove once at launch (reference behaviour)
   RM_SLTP_CONTINUOUS  = 2  // ENHANCEMENT: keep removing while recovering
  };

enum ENUM_RM_NOTIFY
  {
   RM_NOTIFY_OFF   = 0,
   RM_NOTIFY_ALERT = 1,
   RM_NOTIFY_PUSH  = 2,
   RM_NOTIFY_BOTH  = 3
  };

enum ENUM_RM_THEME
  {
   RM_THEME_DARK  = 0,
   RM_THEME_LIGHT = 1
  };

enum ENUM_RM_PANEL_SIZE
  {
   RM_PANEL_HIDDEN = 0,
   RM_PANEL_NORMAL = 1,
   RM_PANEL_LARGE  = 2
  };

enum ENUM_RM_ANNOT
  {
   RM_ANNOT_OFF    = 0, // no closed-profit annotations
   RM_ANNOT_CHART  = 1, // labels on chart ("Images on chart")
   RM_ANNOT_LOG    = 2  // journal/log only
  };

enum ENUM_RM_EMERGENCY
  {
   RM_EMG_OFF     = 0,
   RM_EMG_MONEY   = 1, // managed floating loss in account currency
   RM_EMG_PERCENT = 2  // managed floating loss in % of balance
  };

enum ENUM_RM_EMG_ACTION
  {
   RM_EMGA_PAUSE     = 0, // pause automation only
   RM_EMGA_CLOSE_ALL = 1  // close every managed ticket
  };

enum ENUM_RM_TEST_SEED
  {
   RM_SEED_NONE            = 0,
   RM_SEED_ONE_BUY         = 1,
   RM_SEED_ONE_SELL        = 2,
   RM_SEED_BALANCED_HEDGE  = 3,
   RM_SEED_UNBALANCED_MIX  = 4
  };

// ---- combined operation (Three-MA normal trading + recovery) --------
enum ENUM_RM_OPMODE
  {
   RM_OP_RECOVERY_ONLY          = 0, // Recovery only (original behaviour)
   RM_OP_THREE_MA_ONLY          = 1, // Three-MA normal trading only
   RM_OP_THREE_MA_WITH_RECOVERY = 2  // Three-MA with drawdown handover to recovery
  };

enum ENUM_RM_TRIG_MODE
  {
   RM_TRIG_PERCENT = 0, // % of balance
   RM_TRIG_MONEY   = 1  // account currency
  };

enum ENUM_RM_TRIG_SCOPE
  {
   RM_TSCOPE_MANAGED = 0, // Managed strategy basket (default)
   RM_TSCOPE_ACCOUNT = 1  // Whole account (balance - equity)
  };

enum ENUM_RM_NLOT
  {
   RM_NLOT_FIXED   = 0, // Fixed initial lot
   RM_NLOT_BALANCE = 1  // Initial lot scaled by balance
  };

enum ENUM_RM_SPACING
  {
   RM_SPACE_ATR   = 0, // ATR x factor (adapts to each symbol automatically)
   RM_SPACE_UNITS = 1  // Fixed distance in points (distance units)
  };

// controller (cycle) states
#define RM_CTL_NORMAL           0
#define RM_CTL_HANDOVER         1
#define RM_CTL_RECOVERY_ACTIVE  2
#define RM_CTL_RECOVERY_CLOSING 3
#define RM_CTL_COOLDOWN         4
#define RM_CTL_PAUSED           5
#define RM_CTL_ERROR_HOLD       6

// cycle outcomes
#define RM_OUT_NONE      0
#define RM_OUT_COMPLETED 1   // basket closed by the recovery engine
#define RM_OUT_EMERGENCY 2   // emergency-loss limit closed the basket
#define RM_OUT_MANUAL    3   // operator terminated the cycle early

// actors for the central permission gate
#define RM_ACTOR_NONE      0
#define RM_ACTOR_RECOVERY  1
#define RM_ACTOR_NORMAL    2
#define RM_ACTOR_OPERATOR  3
#define RM_ACTOR_EMERGENCY 4
#define RM_ACTOR_TEST      5
#define RM_ACTOR_HANDOVER  6

// ---- plan kinds / reasons -----------------------------------------
#define RM_PLAN_NONE      0
#define RM_PLAN_GROUP     1   // recovery basket + main slice
#define RM_PLAN_OVERLAP   2   // first+last recovery + main slice
#define RM_PLAN_BASKET    3   // whole-basket exit
#define RM_PLAN_REDUCE    4   // profit-financed main reduction
#define RM_PLAN_CLOSE_ALL 5   // operator/emergency close all
#define RM_PLAN_LAUNCH    6   // launch "close profitable" financing
#define RM_PLAN_MANUAL    7   // manual close-current-group
#define RM_PLAN_NORMAL_TP        8   // normal basket virtual TP
#define RM_PLAN_NORMAL_OVERLAP   9   // normal first+last overlap
#define RM_PLAN_NORMAL_CLOSE    10   // operator closes the normal basket
#define RM_PLAN_NORMAL_EMERGENCY 11  // emergency-loss limit closes the normal basket

#define RM_R_OK               0
#define RM_R_NO_RECOVERY      1
#define RM_R_NO_MAIN          2
#define RM_R_SLICE_INVALID    3
#define RM_R_BELOW_TARGET     4
#define RM_R_TOO_MANY_LEGS    5
#define RM_R_NOTHING_AFFORD   6
#define RM_R_MATCH_FAILED     7

// ---- journal status ------------------------------------------------
#define RM_J_EMPTY       0
#define RM_J_IN_PROGRESS 1
#define RM_J_DONE        2
#define RM_J_ABORTED     3

//+------------------------------------------------------------------+
//| Symbol metadata needed by pure calculations                       |
//+------------------------------------------------------------------+
struct RM_SymbolMeta
  {
   double            point;
   double            tickSize;
   double            tickValue;
   double            minLot;
   double            maxLot;
   double            lotStep;
  };

//+------------------------------------------------------------------+
//| One authoritative snapshot of managed orders (parallel arrays)    |
//+------------------------------------------------------------------+
struct RM_Book
  {
   int               n;
   int               ticket[RM_MAX_LEGS];
   int               role[RM_MAX_LEGS];
   int               type[RM_MAX_LEGS];      // RM_BUY / RM_SELL
   double            lots[RM_MAX_LEGS];
   double            profit[RM_MAX_LEGS];    // OrderProfit()
   double            swap[RM_MAX_LEGS];      // OrderSwap()
   double            comm[RM_MAX_LEGS];      // OrderCommission() (booked)
   double            openPrice[RM_MAX_LEGS];
   long              openTime[RM_MAX_LEGS];
   int               gridIndex[RM_MAX_LEGS];
  };

//+------------------------------------------------------------------+
//| Ordered list of book indices                                     |
//+------------------------------------------------------------------+
struct RM_IndexList
  {
   int               n;
   int               idx[RM_MAX_PLAN_LEGS];
  };

//+------------------------------------------------------------------+
//| Aggregated totals for dashboard and decisions                     |
//+------------------------------------------------------------------+
struct RM_Totals
  {
   int               mainBuyCnt, mainSellCnt, recBuyCnt, recSellCnt;
   double            mainBuyLots, mainSellLots, recBuyLots, recSellLots;
   double            mainBuyPL, mainSellPL, recBuyPL, recSellPL;
   int               origCnt, lockCnt;
   double            origLots, lockLots;
   int               totalCnt;
   double            totalLots, totalPL;
  };

//+------------------------------------------------------------------+
//| Planner configuration                                             |
//+------------------------------------------------------------------+
struct RM_PlanConfig
  {
   int               priority;          // ENUM_RM_PRIORITY
   int               firstTicket;       // 0 = none
   double            partialLots;
   double            partialTPPoints;
   int               tpBasis;           // ENUM_RM_TP_BASIS
   bool              fullCommission;    // assume exit commission == booked commission
   double            extraCommPerLot;   // extra unbooked commission per closed lot
   double            execBufferPoints;  // safety buffer, points per closed lot
   bool              overlapEnabled;
   int               overlapThreshold;
   int               overlapCompare;    // ENUM_RM_OVERLAP_CMP
   bool              matchedMain;       // locked: close equal BUY/SELL slices
  };

//+------------------------------------------------------------------+
//| Closure plan (deterministic planner output)                       |
//+------------------------------------------------------------------+
struct RM_Plan
  {
   int               kind;
   int               reason;
   int               dir;               // recovery direction for GROUP/OVERLAP, -1 otherwise
   int               n;
   int               ticket[RM_MAX_PLAN_LEGS];
   int               role[RM_MAX_PLAN_LEGS];
   int               type[RM_MAX_PLAN_LEGS];
   double            closeLots[RM_MAX_PLAN_LEGS];
   double            ticketLots[RM_MAX_PLAN_LEGS];
   double            residual[RM_MAX_PLAN_LEGS];
   double            expectedPL[RM_MAX_PLAN_LEGS]; // incl. booked swap/comm share
   double            exitCost[RM_MAX_PLAN_LEGS];   // unbooked cost estimate (>=0)
   double            recoveryNet;
   double            mainBuySliceNet;
   double            mainSellSliceNet;
   double            unbookedCosts;
   double            buffer;
   double            expectedNet;
   double            target;
   double            recoveryCloseLots;
   double            mainBuyCloseLots;
   double            mainSellCloseLots;
   bool              qualifies;
   bool              isOverlap;
   bool              isFinal;
   int               mainBuyTicket;
   int               mainSellTicket;
  };

//+------------------------------------------------------------------+
//| Transaction journal core (persisted after every confirmed leg)    |
//+------------------------------------------------------------------+
struct RM_Journal
  {
   int               planId;
   int               kind;
   int               status;
   int               n;
   int               ticket[RM_MAX_PLAN_LEGS];
   double            targetLots[RM_MAX_PLAN_LEGS];
   double            ticketLots[RM_MAX_PLAN_LEGS];  // volume of the ticket when planned
   double            doneLots[RM_MAX_PLAN_LEGS];
   double            realized[RM_MAX_PLAN_LEGS];
   int               legDone[RM_MAX_PLAN_LEGS];   // 0 = pending, 1 = done, 2 = skipped
   double            estimatedNet;
   double            realizedNet;
   int               attempts;
  };

//+------------------------------------------------------------------+
//| Inputs to the pure state-transition function                     |
//+------------------------------------------------------------------+
struct RM_StateInput
  {
   int               state;
   bool              hasManaged;        // any ORIGINAL/LOCK/RECOVERY order open
   bool              hasMain;           // any main-position order (ORIGINAL or LOCK) open
   bool              launchDone;        // persisted
   bool              launchTriggered;
   bool              prepDone;          // persisted
   bool              lockingEnabled;
   bool              lockDone;          // persisted
   bool              mainImbalanced;
   bool              relockOnImbalance;
   bool              journalOpen;       // an incomplete transaction exists
   bool              closeRequested;    // close-all / basket TP / emergency close
   bool              pauseRequested;
   bool              resumeRequested;
   bool              errorCondition;
   int               stateBeforePause;
  };

#endif

//+------------------------------------------------------------------+
//| RecoveryManagerPro_Standalone.mq4 - GENERATED single-file build   |
//| Compiles without MQL4/Include/RecoveryManagerPro. Do not edit:     |
//| regenerate with tests/build_single_file.py from the modular files.|
//+------------------------------------------------------------------+
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
//==== inlined: Include/RecoveryManagerPro/RM_Types.mqh
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

#define RM_MAX_LEGS      256     // max orders one planner snapshot can hold
#define RM_MAX_PLAN_LEGS 160     // max legs in one closure plan / journal
#define RM_EPS           1e-9

// ---- order roles -------------------------------------------------
#define RM_ROLE_NONE      0
#define RM_ROLE_ORIGINAL  1
#define RM_ROLE_LOCK      2
#define RM_ROLE_RECOVERY  3

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

// ---- plan kinds / reasons -----------------------------------------
#define RM_PLAN_NONE      0
#define RM_PLAN_GROUP     1   // recovery basket + main slice
#define RM_PLAN_OVERLAP   2   // first+last recovery + main slice
#define RM_PLAN_BASKET    3   // whole-basket exit
#define RM_PLAN_REDUCE    4   // profit-financed main reduction
#define RM_PLAN_CLOSE_ALL 5   // operator/emergency close all
#define RM_PLAN_LAUNCH    6   // launch "close profitable" financing
#define RM_PLAN_MANUAL    7   // manual close-current-group

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


//==== inlined: Include/RecoveryManagerPro/RM_Calc.mqh
//+------------------------------------------------------------------+
//| RM_Calc.mqh                                                       |
//| Pure calculations: lots, money conversion, grid, gates, totals.   |
//| Portable MQL4/C++ subset (see RM_Types.mqh header).               |
//+------------------------------------------------------------------+


//+------------------------------------------------------------------+
//| Round a price-like value to 8 decimals to kill binary noise       |
//+------------------------------------------------------------------+
double RM_Clean(double v)
  {
   return NormalizeDouble(v, 8);
  }

//+------------------------------------------------------------------+
//| Number of whole lot steps contained in a volume                   |
//+------------------------------------------------------------------+
double RM_LotSteps(double lots, double step, int roundMode)
  {
   if(step <= 0.0)
      return 0.0;
   double k = lots / step;
   if(roundMode == RM_ROUND_NEAREST)
      return MathFloor(k + 0.5);
   return MathFloor(k + 1e-7);   // tolerate binary representation noise
  }

//+------------------------------------------------------------------+
//| Normalise a raw lot to an executable broker volume.               |
//| Returns 0 when the result is below the broker minimum.            |
//| Values above maxLot are clamped to maxLot (callers that must      |
//| refuse oversize entries check RM_LotExceedsCap first).            |
//+------------------------------------------------------------------+
double RM_NormalizeLot(double raw, const RM_SymbolMeta &m, int roundMode)
  {
   if(raw <= 0.0 || m.lotStep <= 0.0)
      return 0.0;
   double lot = RM_Clean(RM_LotSteps(raw, m.lotStep, roundMode) * m.lotStep);
   if(m.maxLot > 0.0 && lot > m.maxLot)
      lot = RM_Clean(RM_LotSteps(m.maxLot, m.lotStep, RM_ROUND_DOWN) * m.lotStep);
   if(lot < m.minLot - RM_EPS)
      return 0.0;
   return lot;
  }

//+------------------------------------------------------------------+
//| Grid: raw (unrounded) lot for sequence index n (n >= 0)          |
//| lot(n) = InitialRecoveryLot * LotMultiplier^n                      |
//+------------------------------------------------------------------+
double RM_GridRawLot(double initialLot, double multiplier, int n)
  {
   if(n < 0)
      n = 0;
   return initialLot * MathPow(multiplier, n);
  }

//+------------------------------------------------------------------+
//| Grid: spacing (points) required before index n (n >= 1)           |
//| step(n) = InitialStepPoints * StepMultiplier^(n-1)                 |
//+------------------------------------------------------------------+
double RM_GridStepPoints(double initialStep, double stepMultiplier, int n)
  {
   if(n < 1)
      return 0.0;
   return initialStep * MathPow(stepMultiplier, n - 1);
  }

//+------------------------------------------------------------------+
//| Grid: price level of the next entry (PROPOSED adverse-move rule)  |
//| BUY entries trigger below the previous BUY fill, SELL above.      |
//+------------------------------------------------------------------+
double RM_GridNextLevel(int dir, double anchorPrice, double stepPoints, double point)
  {
   if(dir == RM_BUY)
      return anchorPrice - stepPoints * point;
   return anchorPrice + stepPoints * point;
  }

bool RM_GridTriggered(int dir, double bid, double ask, double level)
  {
   if(dir == RM_BUY)
      return ask <= level + RM_EPS;
   return bid >= level - RM_EPS;
  }

//+------------------------------------------------------------------+
//| Cap check: true when a (normalised) lot breaks a configured cap   |
//+------------------------------------------------------------------+
bool RM_LotExceedsCap(double lot, double capLot)
  {
   return (capLot > 0.0 && lot > capLot + RM_EPS);
  }

//+------------------------------------------------------------------+
//| Money value of one point for one lot.                             |
//| MoneyPerPointPerLot = TickValue * Point / TickSize                 |
//| Guards: returns 0 when metadata is unusable.                      |
//+------------------------------------------------------------------+
double RM_MoneyPerPointPerLot(double tickValue, double tickSize, double point)
  {
   if(tickValue <= 0.0 || tickSize <= 0.0 || point <= 0.0)
      return 0.0;
   return tickValue * point / tickSize;
  }

//+------------------------------------------------------------------+
//| Partial-close money target (PROPOSED conversion basis).           |
//| TargetMoney = PartialTPPoints * MoneyPerPointPerLot * basisLots    |
//+------------------------------------------------------------------+
double RM_TargetMoney(double tpPoints, double moneyPerPointPerLot, double basisLots)
  {
   if(tpPoints <= 0.0 || moneyPerPointPerLot <= 0.0 || basisLots <= 0.0)
      return 0.0;
   return tpPoints * moneyPerPointPerLot * basisLots;
  }

//+------------------------------------------------------------------+
//| Launch drawdown helpers                                           |
//| drawdown = max(0, -managed floating P/L)                          |
//| percent  = drawdown / account balance * 100 (balance denominator)  |
//+------------------------------------------------------------------+
double RM_Drawdown(double managedFloatingNet)
  {
   return MathMax(0.0, -managedFloatingNet);
  }

double RM_DrawdownPercent(double managedFloatingNet, double balance)
  {
   if(balance <= 0.0)
      return 0.0;    // guarded: zero/negative balance never triggers % mode
   return RM_Drawdown(managedFloatingNet) / balance * 100.0;
  }

bool RM_LaunchTriggered(int mode, double managedFloatingNet, double balance,
                        double threshold, bool hasEligible)
  {
   if(!hasEligible)
      return false;
   if(mode == RM_LAUNCH_INSTANT)
      return true;
   if(threshold <= 0.0)
      return false;
   if(mode == RM_LAUNCH_DD_PERCENT)
      return RM_DrawdownPercent(managedFloatingNet, balance) >= threshold - RM_EPS;
   if(mode == RM_LAUNCH_DD_MONEY)
      return RM_Drawdown(managedFloatingNet) >= threshold - RM_EPS;
   return false;
  }

//+------------------------------------------------------------------+
//| One-order-per-bar gate (bar id persisted per direction)           |
//+------------------------------------------------------------------+
bool RM_BarGateOpen(bool onePerBar, long lastEntryBarTime, long currentBarTime)
  {
   if(!onePerBar)
      return true;
   return lastEntryBarTime != currentBarTime;
  }

//+------------------------------------------------------------------+
//| Direction permission                                              |
//| dirsMode: ENUM_RM_DIRS; isManual bypasses "automatic disabled"    |
//| Multidirectional off: a new opposite basket may not start while  |
//| the other recovery direction still has open orders.               |
//+------------------------------------------------------------------+
bool RM_DirectionAllowed(int dir, int dirsMode, bool isManual,
                         bool multidirectional, int buyRecCount, int sellRecCount)
  {
   if(!isManual)
     {
      if(dirsMode == RM_DIRS_NONE)
         return false;
      if(dirsMode == RM_DIRS_BUY_ONLY && dir != RM_BUY)
         return false;
      if(dirsMode == RM_DIRS_SELL_ONLY && dir != RM_SELL)
         return false;
     }
   if(!multidirectional)
     {
      if(dir == RM_BUY && sellRecCount > 0)
         return false;
      if(dir == RM_SELL && buyRecCount > 0)
         return false;
     }
   return true;
  }

//+------------------------------------------------------------------+
//| Overlap activation.  Comparison is configurable (UNRESOLVED in    |
//| the reference). Never active for the final slice.                 |
//+------------------------------------------------------------------+
bool RM_OverlapActive(bool enabled, int recCount, int threshold,
                      int compareMode, bool isFinalSlice)
  {
   if(!enabled || isFinalSlice || recCount < 2 || threshold <= 0)
      return false;
   if(compareMode == RM_OVL_GT)
      return recCount > threshold;
   return recCount >= threshold;
  }

//+------------------------------------------------------------------+
//| Lock sizing: NetMainLots = MainBuyLots - MainSellLots.            |
//| Returns the executable hedge volume and sets hedgeDir.            |
//| residual receives the part that cannot be hedged (below minLot).  |
//+------------------------------------------------------------------+
double RM_LockVolume(double mainBuyLots, double mainSellLots, const RM_SymbolMeta &m,
                     int &hedgeDir, double &residual)
  {
   double net = RM_Clean(mainBuyLots - mainSellLots);
   hedgeDir = (net > 0.0) ? RM_SELL : RM_BUY;
   double need = MathAbs(net);
   // floor: rounding up would over-hedge and create new opposite exposure
   double steps = RM_LotSteps(need, m.lotStep, RM_ROUND_DOWN);
   double exec = RM_Clean(steps * m.lotStep);
   if(exec < m.minLot - RM_EPS)
      exec = 0.0;
   residual = RM_Clean(need - exec);
   if(residual < 0.0)
      residual = 0.0;
   return exec;
  }

//+------------------------------------------------------------------+
//| True when main exposure differs by at least half a lot step       |
//+------------------------------------------------------------------+
bool RM_MainImbalanced(double mainBuyLots, double mainSellLots, double lotStep)
  {
   return MathAbs(mainBuyLots - mainSellLots) >= lotStep * 0.5 - RM_EPS;
  }

//+------------------------------------------------------------------+
//| Net P/L of one book leg (profit + swap + booked commission)       |
//+------------------------------------------------------------------+
double RM_LegNet(const RM_Book &b, int i)
  {
   return b.profit[i] + b.swap[i] + b.comm[i];
  }

//+------------------------------------------------------------------+
//| Totals: each ticket counted exactly once by its role.             |
//| Main = ORIGINAL + LOCK; Managed = Main + RECOVERY.                 |
//+------------------------------------------------------------------+
void RM_ComputeTotals(const RM_Book &b, RM_Totals &t)
  {
   t.mainBuyCnt = 0; t.mainSellCnt = 0; t.recBuyCnt = 0; t.recSellCnt = 0;
   t.mainBuyLots = 0; t.mainSellLots = 0; t.recBuyLots = 0; t.recSellLots = 0;
   t.mainBuyPL = 0; t.mainSellPL = 0; t.recBuyPL = 0; t.recSellPL = 0;
   t.origCnt = 0; t.lockCnt = 0; t.origLots = 0; t.lockLots = 0;
   t.totalCnt = 0; t.totalLots = 0; t.totalPL = 0;
   for(int i = 0; i < b.n; i++)
     {
      int r = b.role[i];
      if(r != RM_ROLE_ORIGINAL && r != RM_ROLE_LOCK && r != RM_ROLE_RECOVERY)
         continue;
      // duplicate-ticket guard: a ticket seen earlier is ignored
      bool dup = false;
      for(int j = 0; j < i; j++)
         if(b.ticket[j] == b.ticket[i]) { dup = true; break; }
      if(dup)
         continue;
      double net = RM_LegNet(b, i);
      if(r == RM_ROLE_RECOVERY)
        {
         if(b.type[i] == RM_BUY) { t.recBuyCnt++; t.recBuyLots += b.lots[i]; t.recBuyPL += net; }
         else                    { t.recSellCnt++; t.recSellLots += b.lots[i]; t.recSellPL += net; }
        }
      else
        {
         if(b.type[i] == RM_BUY) { t.mainBuyCnt++; t.mainBuyLots += b.lots[i]; t.mainBuyPL += net; }
         else                    { t.mainSellCnt++; t.mainSellLots += b.lots[i]; t.mainSellPL += net; }
         if(r == RM_ROLE_ORIGINAL) { t.origCnt++; t.origLots += b.lots[i]; }
         else                      { t.lockCnt++; t.lockLots += b.lots[i]; }
        }
      t.totalCnt++;
      t.totalLots += b.lots[i];
      t.totalPL += net;
     }
   t.mainBuyLots = RM_Clean(t.mainBuyLots);
   t.mainSellLots = RM_Clean(t.mainSellLots);
   t.recBuyLots = RM_Clean(t.recBuyLots);
   t.recSellLots = RM_Clean(t.recSellLots);
   t.totalLots = RM_Clean(t.totalLots);
  }

//+------------------------------------------------------------------+
//| Adjust a slice so the remainder is either zero or >= minLot.      |
//| Prefers shrinking the slice; closes the whole ticket only when a  |
//| valid shrink is impossible. Caller must re-price the plan after.  |
//+------------------------------------------------------------------+
double RM_ValidSlice(double ticketLots, double wanted, const RM_SymbolMeta &m)
  {
   double v = RM_Clean(RM_LotSteps(wanted, m.lotStep, RM_ROUND_DOWN) * m.lotStep);
   if(v >= ticketLots - RM_EPS)
      return RM_Clean(ticketLots);
   if(v < m.minLot - RM_EPS)
     {
      // requested slice is below the broker minimum: use minLot if it fits
      v = m.minLot;
      if(v >= ticketLots - RM_EPS)
         return RM_Clean(ticketLots);
     }
   double rem = RM_Clean(ticketLots - v);
   if(rem >= m.minLot - RM_EPS)
      return v;
   double shrunk = RM_Clean(RM_LotSteps(ticketLots - m.minLot, m.lotStep, RM_ROUND_DOWN) * m.lotStep);
   if(shrunk >= m.minLot - RM_EPS)
      return shrunk;
   return RM_Clean(ticketLots);
  }

//+------------------------------------------------------------------+
//| Solve the price where a linear group P/L reaches a target.        |
//| netNow: current group net; sensitivity: money per 1.0 price unit  |
//| for a price increase (sum of +lots for buys, -lots for sells).    |
//| Returns 0 when there is no finite solution.                       |
//+------------------------------------------------------------------+
double RM_BreakEvenPrice(double priceNow, double netNow, double target, double moneyPerPriceUnit)
  {
   if(MathAbs(moneyPerPriceUnit) < RM_EPS)
      return 0.0;
   return priceNow + (target - netNow) / moneyPerPriceUnit;
  }


//==== inlined: Include/RecoveryManagerPro/RM_Planner.mqh
//+------------------------------------------------------------------+
//| RM_Planner.mqh                                                    |
//| Deterministic closure planner. Builds a plan from a book snapshot |
//| BEFORE anything is executed. Portable MQL4/C++ subset.            |
//|                                                                   |
//| Money model (PROPOSED, see docs/EVIDENCE_MATRIX.md):              |
//|  leg expected P/L = (profit + swap + booked commission) * f       |
//|      where f = closeLots / ticketLots  (booked costs are already  |
//|      inside the ticket value, so they are NOT deducted again)     |
//|  leg exit cost    = (fullCommission ? |booked commission| * f : 0)|
//|                     + extraCommPerLot * closeLots                 |
//|  buffer           = execBufferPoints * moneyPerPointPerLot        |
//|                     * total closed lots                           |
//|  ExpectedGroupNet = RecoveryCloseNet + MainBuySliceNet            |
//|                     + MainSellSliceNet - UnbookedExitCosts        |
//|                     - ExecutionBuffer                             |
//+------------------------------------------------------------------+


//+------------------------------------------------------------------+
void RM_PlanReset(RM_Plan &p, int kind)
  {
   p.kind = kind;
   p.reason = RM_R_OK;
   p.dir = -1;
   p.n = 0;
   p.recoveryNet = 0; p.mainBuySliceNet = 0; p.mainSellSliceNet = 0;
   p.unbookedCosts = 0; p.buffer = 0; p.expectedNet = 0; p.target = 0;
   p.recoveryCloseLots = 0; p.mainBuyCloseLots = 0; p.mainSellCloseLots = 0;
   p.qualifies = false; p.isOverlap = false; p.isFinal = false;
   p.mainBuyTicket = 0; p.mainSellTicket = 0;
  }

//+------------------------------------------------------------------+
//| Loss-per-lot ranking metric (more negative = harder to close)    |
//+------------------------------------------------------------------+
double RM_RankMetric(const RM_Book &b, int i)
  {
   if(b.lots[i] <= 0.0)
      return 0.0;
   return RM_LegNet(b, i) / b.lots[i];
  }

//+------------------------------------------------------------------+
//| Stable tie-break: earlier open time, then lower ticket           |
//+------------------------------------------------------------------+
bool RM_EarlierThan(const RM_Book &b, int i, int j)
  {
   if(b.openTime[i] != b.openTime[j])
      return b.openTime[i] < b.openTime[j];
   return b.ticket[i] < b.ticket[j];
  }

//+------------------------------------------------------------------+
//| true when leg i should be preferred over leg j under priority    |
//+------------------------------------------------------------------+
bool RM_Preferred(const RM_Book &b, int i, int j, int priority)
  {
   double mi = RM_RankMetric(b, i), mj = RM_RankMetric(b, j);
   if(MathAbs(mi - mj) > 1e-9)
     {
      if(priority == RM_PRIO_HARD_FIRST)
         return mi < mj;
      return mi > mj;
     }
   return RM_EarlierThan(b, i, j);
  }

bool RM_IsMain(int role)
  {
   return role == RM_ROLE_ORIGINAL || role == RM_ROLE_LOCK;
  }

//+------------------------------------------------------------------+
//| Pick a main-position leg.                                         |
//| side: RM_BUY / RM_SELL / -1 (any side)                             |
//| losingOnly: restrict to legs with net < 0                         |
//| firstTicket override is honoured when it is a matching main leg.  |
//+------------------------------------------------------------------+
int RM_PickMain(const RM_Book &b, int side, bool losingOnly, int priority, int firstTicket)
  {
   if(firstTicket > 0)
      for(int k = 0; k < b.n; k++)
         if(b.ticket[k] == firstTicket && RM_IsMain(b.role[k]) && b.lots[k] > 0.0 &&
            (side < 0 || b.type[k] == side) && (!losingOnly || RM_LegNet(b, k) < 0.0))
            return k;
   int best = -1;
   for(int i = 0; i < b.n; i++)
     {
      if(!RM_IsMain(b.role[i]) || b.lots[i] <= 0.0)
         continue;
      if(side >= 0 && b.type[i] != side)
         continue;
      if(losingOnly && RM_LegNet(b, i) >= 0.0)
         continue;
      if(best < 0 || RM_Preferred(b, i, best, priority))
         best = i;
     }
   return best;
  }

//+------------------------------------------------------------------+
//| Unbooked exit cost of closing closeLots of leg i                  |
//+------------------------------------------------------------------+
double RM_LegExitCost(const RM_Book &b, int i, double closeLots, const RM_PlanConfig &c)
  {
   if(b.lots[i] <= 0.0)
      return 0.0;
   double f = closeLots / b.lots[i];
   double cost = 0.0;
   if(c.fullCommission)
      cost += MathAbs(b.comm[i]) * f;
   cost += MathMax(0.0, c.extraCommPerLot) * closeLots;
   return cost;
  }

//+------------------------------------------------------------------+
//| Append (or extend) a leg in the plan                              |
//+------------------------------------------------------------------+
bool RM_PlanAddLeg(RM_Plan &p, const RM_Book &b, int i, double closeLots, const RM_PlanConfig &c)
  {
   if(closeLots <= 0.0)
      return true;
   for(int k = 0; k < p.n; k++)
      if(p.ticket[k] == b.ticket[i])
        {
         double nl = RM_Clean(p.closeLots[k] + closeLots);
         double f2 = nl / b.lots[i];
         p.closeLots[k] = nl;
         p.residual[k] = RM_Clean(b.lots[i] - nl);
         p.expectedPL[k] = RM_LegNet(b, i) * f2;
         p.exitCost[k] = RM_LegExitCost(b, i, nl, c);
         return true;
        }
   if(p.n >= RM_MAX_PLAN_LEGS)
     {
      p.reason = RM_R_TOO_MANY_LEGS;
      return false;
     }
   int n = p.n;
   double f = closeLots / b.lots[i];
   p.ticket[n] = b.ticket[i];
   p.role[n] = b.role[i];
   p.type[n] = b.type[i];
   p.closeLots[n] = RM_Clean(closeLots);
   p.ticketLots[n] = b.lots[i];
   p.residual[n] = RM_Clean(b.lots[i] - closeLots);
   p.expectedPL[n] = RM_LegNet(b, i) * f;
   p.exitCost[n] = RM_LegExitCost(b, i, closeLots, c);
   p.n = n + 1;
   return true;
  }

//+------------------------------------------------------------------+
//| Recompute plan totals. target is supplied by caller.              |
//+------------------------------------------------------------------+
void RM_PlanTotals(RM_Plan &p, const RM_PlanConfig &c, double mpp)
  {
   p.recoveryNet = 0; p.mainBuySliceNet = 0; p.mainSellSliceNet = 0;
   p.unbookedCosts = 0;
   p.recoveryCloseLots = 0; p.mainBuyCloseLots = 0; p.mainSellCloseLots = 0;
   double closed = 0.0;
   for(int k = 0; k < p.n; k++)
     {
      if(p.role[k] == RM_ROLE_RECOVERY)
        {
         p.recoveryNet += p.expectedPL[k];
         p.recoveryCloseLots += p.closeLots[k];
        }
      else if(p.type[k] == RM_BUY)
        {
         p.mainBuySliceNet += p.expectedPL[k];
         p.mainBuyCloseLots += p.closeLots[k];
        }
      else
        {
         p.mainSellSliceNet += p.expectedPL[k];
         p.mainSellCloseLots += p.closeLots[k];
        }
      p.unbookedCosts += p.exitCost[k];
      closed += p.closeLots[k];
     }
   p.recoveryCloseLots = RM_Clean(p.recoveryCloseLots);
   p.mainBuyCloseLots = RM_Clean(p.mainBuyCloseLots);
   p.mainSellCloseLots = RM_Clean(p.mainSellCloseLots);
   p.buffer = MathMax(0.0, c.execBufferPoints) * mpp * closed;
   p.expectedNet = p.recoveryNet + p.mainBuySliceNet + p.mainSellSliceNet
                   - p.unbookedCosts - p.buffer;
  }

//+------------------------------------------------------------------+
//| Execution order: most profitable legs first so that a failure    |
//| part-way leaves realised profit rather than realised loss.        |
//+------------------------------------------------------------------+
void RM_PlanSwap(RM_Plan &p, int a, int z)
  {
   int ti; double td;
   ti = p.ticket[a]; p.ticket[a] = p.ticket[z]; p.ticket[z] = ti;
   ti = p.role[a]; p.role[a] = p.role[z]; p.role[z] = ti;
   ti = p.type[a]; p.type[a] = p.type[z]; p.type[z] = ti;
   td = p.closeLots[a]; p.closeLots[a] = p.closeLots[z]; p.closeLots[z] = td;
   td = p.ticketLots[a]; p.ticketLots[a] = p.ticketLots[z]; p.ticketLots[z] = td;
   td = p.residual[a]; p.residual[a] = p.residual[z]; p.residual[z] = td;
   td = p.expectedPL[a]; p.expectedPL[a] = p.expectedPL[z]; p.expectedPL[z] = td;
   td = p.exitCost[a]; p.exitCost[a] = p.exitCost[z]; p.exitCost[z] = td;
  }

void RM_PlanSortForExecution(RM_Plan &p)
  {
   for(int i = 1; i < p.n; i++)
     {
      int j = i;
      while(j > 0)
        {
         double vPrev = p.expectedPL[j - 1] - p.exitCost[j - 1];
         double vCur = p.expectedPL[j] - p.exitCost[j];
         bool swapNeeded = (vCur > vPrev + 1e-12) ||
                           (MathAbs(vCur - vPrev) <= 1e-12 && p.ticket[j] < p.ticket[j - 1]);
         if(!swapNeeded)
            break;
         RM_PlanSwap(p, j, j - 1);
         j--;
        }
     }
  }

//+------------------------------------------------------------------+
//| Recovery legs of one direction, in grid (open-time) order.        |
//| Returns count; indices written to list.idx.                       |
//+------------------------------------------------------------------+
int RM_RecoveryLegs(const RM_Book &b, int dir, RM_IndexList &list)
  {
   int cnt = 0;
   for(int i = 0; i < b.n && cnt < RM_MAX_PLAN_LEGS; i++)
     {
      if(b.role[i] != RM_ROLE_RECOVERY || b.type[i] != dir || b.lots[i] <= 0.0)
         continue;
      int pos = cnt;
      while(pos > 0 && RM_EarlierThan(b, i, list.idx[pos - 1]))
        {
         list.idx[pos] = list.idx[pos - 1];
         pos--;
        }
      list.idx[pos] = i;
      cnt++;
     }
   list.n = cnt;
   return cnt;
  }

//+------------------------------------------------------------------+
//| Main-position lots per side                                       |
//+------------------------------------------------------------------+
double RM_MainLots(const RM_Book &b, int side)
  {
   double s = 0.0;
   for(int i = 0; i < b.n; i++)
      if(RM_IsMain(b.role[i]) && (side < 0 || b.type[i] == side))
         s += b.lots[i];
   return RM_Clean(s);
  }

//+------------------------------------------------------------------+
//| GROUP / OVERLAP planner for recovery direction dir.               |
//| Recovery set: all recovery legs of dir, or first+last when       |
//| overlap is active. Main slice: matched BUY+SELL (locked) or a    |
//| single losing leg (unlocked).                                     |
//+------------------------------------------------------------------+
void RM_PlanGroup(const RM_Book &b, const RM_PlanConfig &c, const RM_SymbolMeta &m,
                  double mpp, int dir, RM_Plan &p)
  {
   RM_PlanReset(p, RM_PLAN_GROUP);
   p.dir = dir;
   RM_IndexList rl;
   int cnt = RM_RecoveryLegs(b, dir, rl);
   if(cnt == 0)
     {
      p.reason = RM_R_NO_RECOVERY;
      return;
     }
   double mainTotal = RM_MainLots(b, -1);
   int iBuy = -1, iSell = -1;
   double vBuy = 0.0, vSell = 0.0;
   if(mainTotal > RM_EPS)
     {
      if(c.matchedMain)
        {
         iBuy = RM_PickMain(b, RM_BUY, false, c.priority, c.firstTicket);
         iSell = RM_PickMain(b, RM_SELL, false, c.priority, c.firstTicket);
         if(iBuy < 0 || iSell < 0)
           {
            p.reason = RM_R_MATCH_FAILED;
            return;
           }
         double v = MathMin(c.partialLots, MathMin(b.lots[iBuy], b.lots[iSell]));
         // iterate until both legs accept the same legal slice
         for(int it = 0; it < 6; it++)
           {
            double a1 = RM_ValidSlice(b.lots[iBuy], v, m);
            double a2 = RM_ValidSlice(b.lots[iSell], v, m);
            if(MathAbs(a1 - a2) < RM_EPS)
              {
               v = a1;
               break;
              }
            v = MathMin(a1, a2);
            if(it == 5)
               v = -1.0;
           }
         if(v <= 0.0 || MathAbs(RM_ValidSlice(b.lots[iBuy], v, m) - RM_ValidSlice(b.lots[iSell], v, m)) > RM_EPS)
           {
            p.reason = RM_R_SLICE_INVALID;
            return;
           }
         vBuy = v;
         vSell = v;
        }
      else
        {
         int iPick = RM_PickMain(b, -1, true, c.priority, c.firstTicket);
         if(iPick < 0)
            iPick = RM_PickMain(b, -1, false, c.priority, c.firstTicket);
         if(iPick < 0)
           {
            p.reason = RM_R_NO_MAIN;
            return;
           }
         double v1 = RM_ValidSlice(b.lots[iPick], c.partialLots, m);
         if(v1 <= 0.0)
           {
            p.reason = RM_R_SLICE_INVALID;
            return;
           }
         if(b.type[iPick] == RM_BUY) { iBuy = iPick; vBuy = v1; }
         else                        { iSell = iPick; vSell = v1; }
        }
     }
   p.isFinal = (mainTotal - vBuy - vSell) <= RM_EPS;
   p.isOverlap = RM_OverlapActive(c.overlapEnabled, cnt, c.overlapThreshold,
                                  c.overlapCompare, p.isFinal);
   if(p.isOverlap)
     {
      p.kind = RM_PLAN_OVERLAP;
      RM_PlanAddLeg(p, b, rl.idx[0], b.lots[rl.idx[0]], c);
      RM_PlanAddLeg(p, b, rl.idx[cnt - 1], b.lots[rl.idx[cnt - 1]], c);
     }
   else
      for(int k = 0; k < cnt; k++)
         if(!RM_PlanAddLeg(p, b, rl.idx[k], b.lots[rl.idx[k]], c))
            return;
   if(iBuy >= 0)
     {
      RM_PlanAddLeg(p, b, iBuy, vBuy, c);
      p.mainBuyTicket = b.ticket[iBuy];
     }
   if(iSell >= 0)
     {
      RM_PlanAddLeg(p, b, iSell, vSell, c);
      p.mainSellTicket = b.ticket[iSell];
     }
   RM_PlanTotals(p, c, mpp);
   double basis = p.recoveryCloseLots;
   if(c.tpBasis == RM_TPB_SLICE_LOTS)
      basis = MathMax(p.mainBuyCloseLots, p.mainSellCloseLots);
   else if(c.tpBasis == RM_TPB_MIN_LOT)
      basis = m.minLot;
   p.target = RM_TargetMoney(c.partialTPPoints, mpp, basis);
   p.qualifies = (p.expectedNet >= p.target - 1e-9);
   if(!p.qualifies)
      p.reason = RM_R_BELOW_TARGET;
   RM_PlanSortForExecution(p);
  }

//+------------------------------------------------------------------+
//| Candidate volume increment for reduce planning; returns 0 when    |
//| no legal increment exists for this leg.                           |
//+------------------------------------------------------------------+
double RM_LegalIncrement(double ticketLots, double alreadyAlloc, double inc, const RM_SymbolMeta &m)
  {
   double rem = RM_Clean(ticketLots - alreadyAlloc);
   if(rem <= RM_EPS)
      return 0.0;
   double first = (alreadyAlloc <= RM_EPS) ? MathMax(m.minLot, m.lotStep) : m.lotStep;
   double v = MathMax(inc, first);
   if(v > rem + RM_EPS)
      v = rem;
   double newRem = RM_Clean(rem - v);
   if(newRem > RM_EPS && newRem < m.minLot - RM_EPS)
      v = rem;                          // would strand an illegal remainder: take all
   if(alreadyAlloc <= RM_EPS && v < m.minLot - RM_EPS)
      return 0.0;
   return RM_Clean(v);
  }

//+------------------------------------------------------------------+
//| REDUCE planner: profitable main legs finance losing main legs.   |
//| matched = true keeps BUY and SELL reductions equal (locked book). |
//| Every accepted step keeps cumulative expected net >= 0.           |
//+------------------------------------------------------------------+
void RM_PlanReduce(const RM_Book &b, const RM_PlanConfig &c, const RM_SymbolMeta &m,
                   double mpp, bool matched, int kind, RM_Plan &p)
  {
   RM_PlanReset(p, kind);
   double alloc[RM_MAX_LEGS];
   bool blocked[RM_MAX_LEGS];
   bool winnerUsed[RM_MAX_LEGS];
   for(int i = 0; i < RM_MAX_LEGS; i++) { alloc[i] = 0.0; blocked[i] = false; winnerUsed[i] = false; }
   double bufPerLot = MathMax(0.0, c.execBufferPoints) * mpp;
   double cum = 0.0;
   int guard = 0;

   if(matched)
     {
      while(guard++ < 20000)
        {
         // loser by priority among unblocked legs with remaining volume
         int L = -1;
         for(int i = 0; i < b.n; i++)
           {
            if(!RM_IsMain(b.role[i]) || blocked[i] || RM_LegNet(b, i) >= 0.0)
               continue;
            if(b.lots[i] - alloc[i] <= RM_EPS)
               continue;
            if(L < 0 || RM_Preferred(b, i, L, c.priority))
               L = i;
           }
         if(L < 0)
            break;
         int W = -1;
         for(int i = 0; i < b.n; i++)
           {
            if(!RM_IsMain(b.role[i]) || b.type[i] == b.type[L] || RM_LegNet(b, i) <= 0.0)
               continue;
            if(b.lots[i] - alloc[i] <= RM_EPS)
               continue;
            if(W < 0 || RM_Preferred(b, i, W, RM_PRIO_EASY_FIRST))
               W = i;
           }
         if(W < 0)
            break;
         double incL = RM_LegalIncrement(b.lots[L], alloc[L], m.lotStep, m);
         double incW = RM_LegalIncrement(b.lots[W], alloc[W], m.lotStep, m);
         double inc = MathMax(incL, incW);
         // both legs must accept exactly the same increment
         if(incL <= 0.0 || incW <= 0.0 ||
            MathAbs(RM_LegalIncrement(b.lots[L], alloc[L], inc, m) - inc) > RM_EPS ||
            MathAbs(RM_LegalIncrement(b.lots[W], alloc[W], inc, m) - inc) > RM_EPS)
           {
            blocked[L] = true;
            continue;
           }
         double dL = RM_LegNet(b, L) * inc / b.lots[L] - RM_LegExitCost(b, L, inc, c);
         double dW = RM_LegNet(b, W) * inc / b.lots[W] - RM_LegExitCost(b, W, inc, c);
         double delta = dL + dW - bufPerLot * 2.0 * inc;
         if(cum + delta < -1e-9)
            break;                       // deterministic stop at first unaffordable step
         cum += delta;
         alloc[L] = RM_Clean(alloc[L] + inc);
         alloc[W] = RM_Clean(alloc[W] + inc);
        }
     }
   else
     {
      while(guard++ < 20000)
        {
         int L = -1;
         for(int i = 0; i < b.n; i++)
           {
            if(!RM_IsMain(b.role[i]) || blocked[i] || RM_LegNet(b, i) >= 0.0)
               continue;
            if(b.lots[i] - alloc[i] <= RM_EPS)
               continue;
            if(L < 0 || RM_Preferred(b, i, L, c.priority))
               L = i;
           }
         if(L < 0)
            break;
         double inc = RM_LegalIncrement(b.lots[L], alloc[L], m.lotStep, m);
         if(inc <= 0.0)
           {
            blocked[L] = true;
            continue;
           }
         double dL = RM_LegNet(b, L) * inc / b.lots[L] - RM_LegExitCost(b, L, inc, c) - bufPerLot * inc;
         // bring in whole profitable legs until the step is financed
         double extra = 0.0;
         int added[RM_MAX_LEGS];
         for(int z = 0; z < RM_MAX_LEGS; z++)
            added[z] = -1;
         int nAdded = 0;
         while(cum + extra + dL < -1e-9)
           {
            int W = -1;
            for(int i = 0; i < b.n; i++)
              {
               if(!RM_IsMain(b.role[i]) || winnerUsed[i] || RM_LegNet(b, i) <= 0.0)
                  continue;
               bool inAdded = false;
               for(int k = 0; k < nAdded; k++)
                  if(added[k] == i) { inAdded = true; break; }
               if(inAdded)
                  continue;
               if(W < 0 || RM_Preferred(b, i, W, RM_PRIO_EASY_FIRST))
                  W = i;
              }
            if(W < 0)
               break;
            added[nAdded++] = W;
            extra += RM_LegNet(b, W) - RM_LegExitCost(b, W, b.lots[W], c) - bufPerLot * b.lots[W];
           }
         if(cum + extra + dL < -1e-9)
            break;
         for(int k = 0; k < nAdded; k++)
           {
            winnerUsed[added[k]] = true;
            alloc[added[k]] = b.lots[added[k]];
           }
         cum += extra + dL;
         alloc[L] = RM_Clean(alloc[L] + inc);
        }
     }

   bool anyLoser = false;
   for(int i = 0; i < b.n; i++)
      if(alloc[i] > RM_EPS && RM_LegNet(b, i) < 0.0)
         anyLoser = true;
   if(!anyLoser)
     {
      p.reason = RM_R_NOTHING_AFFORD;
      return;
     }
   for(int i = 0; i < b.n; i++)
      if(alloc[i] > RM_EPS)
         if(!RM_PlanAddLeg(p, b, i, alloc[i], c))
            return;
   RM_PlanTotals(p, c, mpp);
   p.target = 0.0;
   p.qualifies = (p.expectedNet >= -1e-9);
   if(!p.qualifies)
      p.reason = RM_R_BELOW_TARGET;
   p.isFinal = (RM_MainLots(b, -1) - p.mainBuyCloseLots - p.mainSellCloseLots) <= RM_EPS;
   RM_PlanSortForExecution(p);
  }

//+------------------------------------------------------------------+
//| BASKET / CLOSE-ALL planner: every managed leg, full volume.       |
//| targetMoney < 0 means unconditional (qualifies = true).           |
//+------------------------------------------------------------------+
void RM_PlanAll(const RM_Book &b, const RM_PlanConfig &c, double mpp,
                int kind, double targetMoney, RM_Plan &p)
  {
   RM_PlanReset(p, kind);
   for(int i = 0; i < b.n; i++)
     {
      int r = b.role[i];
      if(r != RM_ROLE_ORIGINAL && r != RM_ROLE_LOCK && r != RM_ROLE_RECOVERY)
         continue;
      if(!RM_PlanAddLeg(p, b, i, b.lots[i], c))
         return;
     }
   if(p.n == 0)
     {
      p.reason = RM_R_NO_MAIN;
      return;
     }
   RM_PlanTotals(p, c, mpp);
   p.isFinal = true;
   if(targetMoney < 0.0)
     {
      p.target = 0.0;
      p.qualifies = true;
     }
   else
     {
      p.target = targetMoney;
      p.qualifies = (p.expectedNet >= targetMoney - 1e-9);
      if(!p.qualifies)
         p.reason = RM_R_BELOW_TARGET;
     }
   RM_PlanSortForExecution(p);
  }

//+------------------------------------------------------------------+
//| Journal core                                                      |
//+------------------------------------------------------------------+
void RM_JournalClear(RM_Journal &j)
  {
   j.planId = 0; j.kind = RM_PLAN_NONE; j.status = RM_J_EMPTY; j.n = 0;
   j.estimatedNet = 0; j.realizedNet = 0; j.attempts = 0;
  }

void RM_JournalFromPlan(RM_Journal &j, const RM_Plan &p, int planId)
  {
   RM_JournalClear(j);
   j.planId = planId;
   j.kind = p.kind;
   j.status = (p.n > 0) ? RM_J_IN_PROGRESS : RM_J_EMPTY;
   j.n = p.n;
   j.estimatedNet = p.expectedNet;
   for(int k = 0; k < p.n; k++)
     {
      j.ticket[k] = p.ticket[k];
      j.targetLots[k] = p.closeLots[k];
      j.ticketLots[k] = p.ticketLots[k];
      j.doneLots[k] = 0.0;
      j.realized[k] = 0.0;
      j.legDone[k] = 0;
     }
  }

int RM_JournalNextLeg(const RM_Journal &j)
  {
   if(j.status != RM_J_IN_PROGRESS)
      return -1;
   for(int k = 0; k < j.n; k++)
      if(j.legDone[k] == 0)
         return k;
   return -1;
  }

void RM_JournalRefresh(RM_Journal &j)
  {
   double s = 0.0;
   bool open = false;
   for(int k = 0; k < j.n; k++)
     {
      s += j.realized[k];
      if(j.legDone[k] == 0)
         open = true;
     }
   j.realizedNet = s;
   if(j.status == RM_J_IN_PROGRESS && !open)
      j.status = RM_J_DONE;
  }

//+------------------------------------------------------------------+
//| Record a confirmed fill. Idempotent per leg: a leg already marked |
//| done is never counted again (no double use of realised profit).   |
//+------------------------------------------------------------------+
bool RM_JournalMarkLeg(RM_Journal &j, int k, double lotsClosed, double realizedPL)
  {
   if(k < 0 || k >= j.n || j.legDone[k] != 0)
      return false;
   j.doneLots[k] = RM_Clean(j.doneLots[k] + lotsClosed);
   j.realized[k] += realizedPL;
   if(j.doneLots[k] >= j.targetLots[k] - RM_EPS)
      j.legDone[k] = 1;
   RM_JournalRefresh(j);
   return true;
  }

bool RM_JournalSkipLeg(RM_Journal &j, int k)
  {
   if(k < 0 || k >= j.n || j.legDone[k] != 0)
      return false;
   j.legDone[k] = 2;
   RM_JournalRefresh(j);
   return true;
  }

void RM_JournalAbort(RM_Journal &j)
  {
   if(j.status == RM_J_IN_PROGRESS)
      j.status = RM_J_ABORTED;
   RM_JournalRefresh(j);
  }

//+------------------------------------------------------------------+
//| Pure state transition. Side effects (resetting flags, saving     |
//| stateBeforePause) belong to the caller.                           |
//+------------------------------------------------------------------+
int RM_NextState(const RM_StateInput &in)
  {
   int s = in.state;
   if(in.errorCondition)
      return RM_ST_ERROR_HOLD;
   if(s == RM_ST_ERROR_HOLD)
     {
      if(!in.resumeRequested)
         return RM_ST_ERROR_HOLD;
      if(!in.hasManaged)
         return RM_ST_IDLE;
      if(!in.launchDone)
         return RM_ST_ARMED;
      return in.journalOpen ? RM_ST_CLOSING : RM_ST_RECOVERING;
     }
   if(s == RM_ST_COMPLETE)
      return RM_ST_IDLE;
   if(s == RM_ST_PAUSED)
     {
      if(in.closeRequested)
         return RM_ST_CLOSING;
      if(in.resumeRequested)
        {
         if(!in.hasManaged)
            return RM_ST_IDLE;
         return in.stateBeforePause;
        }
      return RM_ST_PAUSED;
     }
   if(s == RM_ST_CLOSING)
     {
      if(!in.journalOpen && !in.hasManaged)
         return RM_ST_COMPLETE;
      return RM_ST_CLOSING;
     }
   if(in.pauseRequested && s != RM_ST_IDLE)
      return RM_ST_PAUSED;
   if(in.closeRequested && in.hasManaged)
      return RM_ST_CLOSING;
   switch(s)
     {
      case RM_ST_IDLE:
         if(in.hasManaged && in.launchDone)
            return RM_ST_RECOVERING;
         if(in.hasMain)
            return RM_ST_ARMED;
         return RM_ST_IDLE;
      case RM_ST_ARMED:
         if(!in.hasManaged)
            return RM_ST_IDLE;
         if(in.launchTriggered && !in.launchDone)
            return RM_ST_PREPARING;
         return RM_ST_ARMED;
      case RM_ST_PREPARING:
         if(!in.prepDone)
            return RM_ST_PREPARING;
         if(!in.hasManaged)
            return RM_ST_COMPLETE;
         if(in.lockingEnabled && !in.lockDone)
            return RM_ST_LOCKING;
         return RM_ST_RECOVERING;
      case RM_ST_LOCKING:
         if(!in.hasManaged)
            return RM_ST_COMPLETE;
         if(in.lockDone)
            return RM_ST_RECOVERING;
         return RM_ST_LOCKING;
      case RM_ST_RECOVERING:
         if(!in.hasManaged && !in.journalOpen)
            return RM_ST_COMPLETE;
         if(in.lockingEnabled && in.mainImbalanced && in.relockOnImbalance && !in.journalOpen)
            return RM_ST_LOCKING;
         return RM_ST_RECOVERING;
     }
   return s;
  }



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

//====================================================================
// MODULES
//====================================================================
//==== inlined: Include/RecoveryManagerPro/RM_Globals.mqh
//+------------------------------------------------------------------+
//| RM_Globals.mqh - runtime state shared by the MQL4 modules         |
//| Large structs live here (not on the stack).                       |
//+------------------------------------------------------------------+

#define RM_PFX        "RMP_"          // chart-object prefix (this EA only)
#define RM_MAX_REG    512

//--- identity
string   g_sym = "";
string   g_keyBase = "";                // account_symbol_instance
string   g_stateFile = "";
string   g_auditFile = "";
long     g_chartId = 0;

//--- symbol metadata
RM_SymbolMeta g_meta;
double   g_mpp = 0.0;                   // money per point per lot
int      g_digits = 5;

//--- configuration derived from inputs
RM_PlanConfig g_cfg;
int      g_magicAllow[];                // parsed allowlist
int      g_magicExclude[];              // parsed exclusions

//--- engine state (persisted)
int      g_state = RM_ST_IDLE;
int      g_stateBeforePause = RM_ST_RECOVERING;
long     g_sessionId = 0;               // server time of activation
bool     g_launchDone = false;
bool     g_prepDone = false;
bool     g_lockDone = false;
bool     g_pendingsDone = false;
bool     g_sltpDone = false;
bool     g_financeDone = false;
bool     g_chartsDone = false;
bool     g_closeRequested = false;
bool     g_launchNotified = false;
long     g_lastEntryBar[2];             // per direction: bar open time of last entry
int      g_highIndex[2];                // highest grid index used per direction
int      g_planSeq = 0;
int      g_reqSeq = 0;                  // unique order request tag
double   g_realizedSession = 0.0;
double   g_realizedDay = 0.0;
long     g_dayStamp = 0;
double   g_peakDrawdown = 0.0;
double   g_lockResidual = 0.0;
string   g_errorText = "";

//--- transaction journal (persisted after every leg)
RM_Journal g_journal;
long     g_journalStart = 0;

//--- ownership registry (persisted)
struct RM_RegEntry
  {
   int               ticket;
   int               role;
   int               type;
   double            initialLots;
   int               gridIndex;
   int               parent;             // ticket this one was split from (0 = none)
   long              session;
   double            openPrice;
   long              openTime;
  };
RM_RegEntry g_reg[RM_MAX_REG];
int      g_regCount = 0;

//--- lineage waiting to be resolved after a partial close
int      g_pendParent[32];
long     g_pendSince[32];
int      g_pendCount = 0;

//--- runtime (not persisted)
RM_Book    g_book;                      // authoritative snapshot for panel + planner
RM_Totals  g_tot;
RM_Plan    g_plan;                      // scratch plan
RM_Plan    g_curGroup;                  // current-group preview
RM_Plan    g_reducePreview;             // possible closures preview
RM_Plan    g_confirmPlan;               // plan awaiting operator confirmation
bool     g_pauseRequested = false;
bool     g_resumeRequested = false;
bool     g_errorCondition = false;
string   g_status = "";                 // operational status line
string   g_block = "";                  // current block reason for new entries
datetime g_lastBarSeen = 0;
int      g_testBars = 0;
bool     g_seedDone = false;
double   g_managedNet = 0.0;
double   g_drawdown = 0.0;
double   g_ddPct = 0.0;
bool     g_busy = false;                // re-entrancy / repeated-click guard
int      g_entriesThisTick = 0;
string   g_chartPreview = "";
int      g_extHandleWarned = 0;
int      g_tradeEvents = 0;             // confirmed sends/closes (snapshot refresh trigger)


//==== inlined: Include/RecoveryManagerPro/RM_Log.mqh
//+------------------------------------------------------------------+
//| RM_Log.mqh - names, CSV audit export, notifications               |
//+------------------------------------------------------------------+

int g_auditHandle = INVALID_HANDLE;

string RM_StateName(int s)
  {
   switch(s)
     {
      case RM_ST_IDLE:       return "IDLE";
      case RM_ST_ARMED:      return "ARMED";
      case RM_ST_PREPARING:  return "PREPARING";
      case RM_ST_LOCKING:    return "LOCKING";
      case RM_ST_RECOVERING: return "RECOVERING";
      case RM_ST_PAUSED:     return "PAUSED";
      case RM_ST_CLOSING:    return "CLOSING";
      case RM_ST_COMPLETE:   return "COMPLETE";
      case RM_ST_ERROR_HOLD: return "ERROR_HOLD";
     }
   return "?";
  }

string RM_RoleName(int r)
  {
   if(r == RM_ROLE_ORIGINAL) return "ORIGINAL";
   if(r == RM_ROLE_LOCK)     return "LOCK";
   if(r == RM_ROLE_RECOVERY) return "RECOVERY";
   return "NONE";
  }

string RM_PlanKindName(int k)
  {
   switch(k)
     {
      case RM_PLAN_GROUP:     return "GROUP";
      case RM_PLAN_OVERLAP:   return "OVERLAP";
      case RM_PLAN_BASKET:    return "BASKET";
      case RM_PLAN_REDUCE:    return "REDUCE";
      case RM_PLAN_CLOSE_ALL: return "CLOSE_ALL";
      case RM_PLAN_LAUNCH:    return "LAUNCH_FINANCE";
      case RM_PLAN_MANUAL:    return "MANUAL_GROUP";
     }
   return "NONE";
  }

string RM_ReasonName(int r)
  {
   switch(r)
     {
      case RM_R_OK:             return "ok";
      case RM_R_NO_RECOVERY:    return "no recovery orders";
      case RM_R_NO_MAIN:        return "no main position";
      case RM_R_SLICE_INVALID:  return "no legal slice volume";
      case RM_R_BELOW_TARGET:   return "below target";
      case RM_R_TOO_MANY_LEGS:  return "too many legs";
      case RM_R_NOTHING_AFFORD: return "nothing affordable";
      case RM_R_MATCH_FAILED:   return "cannot match BUY/SELL slices";
     }
   return "?";
  }

string RM_Side(int t)
  {
   return (t == RM_BUY) ? "BUY" : "SELL";
  }

string RM_Money(double v)
  {
   return DoubleToString(v, 2);
  }

string RM_Lots(double v)
  {
   return DoubleToString(v, 2);
  }

//+------------------------------------------------------------------+
//| CSV audit: time,state,event,ticket,lots,value,detail              |
//+------------------------------------------------------------------+
void RM_AuditOpen()
  {
   if(!InpAuditCsv)
      return;
   g_auditHandle = FileOpen(g_auditFile, FILE_READ | FILE_WRITE | FILE_TXT | FILE_ANSI | FILE_SHARE_READ);
   if(g_auditHandle == INVALID_HANDLE)
     {
      Print("RMP audit: cannot open ", g_auditFile, " error ", GetLastError());
      return;
     }
   if(FileSize(g_auditHandle) == 0)
      FileWriteString(g_auditHandle, "server_time,state,event,ticket,lots,value,detail\r\n");
   FileSeek(g_auditHandle, 0, SEEK_END);
  }

void RM_AuditClose()
  {
   if(g_auditHandle != INVALID_HANDLE)
      FileClose(g_auditHandle);
   g_auditHandle = INVALID_HANDLE;
  }

string RM_CsvSafe(string s)
  {
   StringReplace(s, ",", ";");
   StringReplace(s, "\n", " ");
   StringReplace(s, "\r", " ");
   return s;
  }

void RM_Audit(string evt, int ticket, double lots, double value, string detail)
  {
   string line = TimeToString(TimeCurrent(), TIME_DATE | TIME_SECONDS) + "," +
                 RM_StateName(g_state) + "," + evt + "," + IntegerToString(ticket) + "," +
                 DoubleToString(lots, 2) + "," + DoubleToString(value, 2) + "," + RM_CsvSafe(detail);
   if(!IsOptimization())
      Print("RMP ", evt, " #", ticket, " ", detail);
   if(g_auditHandle != INVALID_HANDLE)
     {
      FileWriteString(g_auditHandle, line + "\r\n");
      FileFlush(g_auditHandle);
     }
  }

void RM_Notify(string msg)
  {
   string full = "Recovery Manager Pro " + g_sym + ": " + msg;
   if(InpNotify == RM_NOTIFY_ALERT || InpNotify == RM_NOTIFY_BOTH)
      Alert(full);
   if((InpNotify == RM_NOTIFY_PUSH || InpNotify == RM_NOTIFY_BOTH) && !IsTesting())
      SendNotification(full);
  }


//==== inlined: Include/RecoveryManagerPro/RM_Config.mqh
//+------------------------------------------------------------------+
//| RM_Config.mqh - input validation, parsing, identity               |
//+------------------------------------------------------------------+

//+------------------------------------------------------------------+
//| Parse "12345, 54321,0" into an int array. false on bad token.     |
//+------------------------------------------------------------------+
bool RM_ParseIntList(string text, int &out[], string &err)
  {
   ArrayResize(out, 0);
   string t = StringTrimRight(StringTrimLeft(text));
   if(t == "")
      return true;
   string parts[];
   ushort sep = StringGetCharacter(",", 0);
   int n = StringSplit(t, sep, parts);
   for(int i = 0; i < n; i++)
     {
      string p = StringTrimRight(StringTrimLeft(parts[i]));
      if(p == "")
         continue;
      for(int c = 0; c < StringLen(p); c++)
        {
         ushort ch = StringGetCharacter(p, c);
         if(ch < '0' || ch > '9')
           {
            err = "magic list token '" + p + "' is not a non-negative integer";
            return false;
           }
        }
      int sz = ArraySize(out);
      ArrayResize(out, sz + 1);
      out[sz] = (int)StringToInteger(p);
     }
   return true;
  }

bool RM_InList(int v, const int &arr[])
  {
   for(int i = 0; i < ArraySize(arr); i++)
      if(arr[i] == v)
         return true;
   return false;
  }

//+------------------------------------------------------------------+
//| Validate every input; returns false with a useful explanation.   |
//+------------------------------------------------------------------+
bool RM_ValidateInputs(string &err)
  {
   if(!RM_ParseIntList(InpMagicList, g_magicAllow, err))
      return false;
   if(!RM_ParseIntList(InpExcludeMagics, g_magicExclude, err))
      return false;
   if(InpScope == RM_SCOPE_MAGIC_LIST && ArraySize(g_magicAllow) == 0)
     { err = "scope 'Magic-number allowlist' needs at least one magic in InpMagicList"; return false; }
   if(InpRecoveryMagic <= 0 || InpLockMagic <= 0)
     { err = "recovery and lock magic numbers must be > 0 (0 identifies manual orders)"; return false; }
   if(InpRecoveryMagic == InpLockMagic)
     { err = "recovery magic and lock magic must differ, otherwise roles are ambiguous"; return false; }
   if(RM_InList(InpRecoveryMagic, g_magicAllow) || RM_InList(InpLockMagic, g_magicAllow))
     { err = "recovery/lock magic appears in the managed allowlist - an order would be counted twice"; return false; }
   if(InpManualOriginalMagic == InpRecoveryMagic || InpManualOriginalMagic == InpLockMagic)
     { err = "manual ORIGINAL magic must differ from recovery/lock magic"; return false; }
   if(InpFirstRecoveryTicket < 0)
     { err = "first recovery ticket must be 0 (unused) or a ticket number"; return false; }
   if(InpLaunchMode == RM_LAUNCH_DD_PERCENT && (InpLaunchDrawdown <= 0.0 || InpLaunchDrawdown > 100.0))
     { err = "percentage launch drawdown must be in (0, 100]"; return false; }
   if(InpLaunchMode == RM_LAUNCH_DD_MONEY && InpLaunchDrawdown <= 0.0)
     { err = "money launch drawdown must be > 0"; return false; }
   if(InpOtherEAs != RM_OTHER_KEEP && !InpAllowChartClosure)
     { err = "'Other EAs at launch' closes charts; set InpAllowChartClosure=true to confirm, or choose 'Do not disable'"; return false; }
   if(InpPartialLots <= 0.0 || InpPartialLots > 1000.0)
     { err = "partial-close volume must be in (0, 1000] lots"; return false; }
   if(InpPartialTPPoints < 0.0 || InpPartialTPPoints > 1000000.0)
     { err = "partial-close TP must be >= 0 points"; return false; }
   if(InpOverlapThreshold != 0 && InpOverlapThreshold < 2)
     { err = "overlap threshold must be 0 (off) or >= 2 (it needs a first AND a last order)"; return false; }
   if(InpBasketTP && InpBasketTPMoney <= 0.0)
     { err = "whole-basket TP amount must be > 0 when enabled"; return false; }
   if(InpFirstLot <= 0.0)
     { err = "first recovery volume must be > 0"; return false; }
   if(InpLotMultiplier < 1.0 || InpLotMultiplier > 5.0)
     { err = "volume multiplier must be in [1.0, 5.0]"; return false; }
   if(InpGridStepPoints <= 0.0)
     { err = "grid step must be > 0 points"; return false; }
   if(InpStepMultiplier < 0.5 || InpStepMultiplier > 5.0)
     { err = "step multiplier must be in [0.5, 5.0]"; return false; }
   if(InpMaxSlippage < 0 || InpMaxSpread <= 0)
     { err = "slippage must be >= 0 and maximum spread > 0 points"; return false; }
   if(InpMaxRecoveryLot < InpFirstLot)
     { err = "maximum recovery volume is smaller than the first recovery volume"; return false; }
   if(InpMaxRecoveryCount < 1 || InpMaxRecoveryCount > 200)
     { err = "maximum recovery order count must be in [1, 200]"; return false; }
   if(InpMaxEntriesPerEvent < 1 || InpMaxEntriesPerEvent > 5)
     { err = "max entries per tick must be in [1, 5]"; return false; }
   if(InpExtraCommPerLot < 0.0 || InpExecBufferPoints < 0.0)
     { err = "commission and buffer inputs must be >= 0"; return false; }
   if(InpManualLot <= 0.0)
     { err = "manual panel volume must be > 0"; return false; }
   if(InpFontSize < 5 || InpFontSize > 14)
     { err = "font size must be in [5, 14]"; return false; }
   if(InpSignalMode == RM_SIG_TREND && (InpTrendAmplitude < 2 || InpTrendAmplitude > 500))
     { err = "trend amplitude must be in [2, 500] bars"; return false; }
   if(InpSignalMode == RM_SIG_EXTERNAL && StringLen(InpExtIndicator) == 0)
     { err = "external adapter selected but no indicator name supplied"; return false; }
   if(InpMaxManagedLots < 0.0 || InpMaxRecoveryLotsSum < 0.0 || InpMinFreeMargin < 0.0 || InpMinMarginLevel < 0.0)
     { err = "risk limits must be >= 0"; return false; }
   if(InpEmergencyMode != RM_EMG_OFF && InpEmergencyValue <= 0.0)
     { err = "emergency threshold must be > 0 when enabled"; return false; }
   if(InpEmergencyMode == RM_EMG_PERCENT && InpEmergencyValue > 100.0)
     { err = "emergency percentage must be <= 100"; return false; }
   if(InpDailyLossLimit < 0.0)
     { err = "daily loss limit must be >= 0"; return false; }
   if(InpSessionStartHour < 0 || InpSessionStartHour > 23 || InpSessionEndHour < 1 || InpSessionEndHour > 24)
     { err = "session hours: start 0-23, end 1-24"; return false; }
   if(InpInstanceId < 0)
     { err = "instance id must be >= 0"; return false; }
   if(InpEnableTestSeeds && InpTestSeedScenario != RM_SEED_NONE && InpTestSeedLots <= 0.0)
     { err = "test seed volume must be > 0"; return false; }
   if(InpEnableTestSeeds && (InpTestSeedMagic == InpRecoveryMagic || InpTestSeedMagic == InpLockMagic))
     { err = "test seed magic must differ from recovery/lock magic"; return false; }

   // derived planner configuration
   g_cfg.priority = InpRecoveryPriority;
   g_cfg.firstTicket = InpFirstRecoveryTicket;
   g_cfg.partialLots = InpPartialLots;
   g_cfg.partialTPPoints = InpPartialTPPoints;
   g_cfg.tpBasis = InpTPBasis;
   g_cfg.fullCommission = InpFullCommission;
   g_cfg.extraCommPerLot = InpExtraCommPerLot;
   g_cfg.execBufferPoints = InpExecBufferPoints;
   g_cfg.overlapEnabled = (InpOverlapThreshold >= 2);
   g_cfg.overlapThreshold = InpOverlapThreshold;
   g_cfg.overlapCompare = InpOverlapCompare;
   g_cfg.matchedMain = InpLocking;
   return true;
  }

//+------------------------------------------------------------------+
//| Identity: account + symbol + instance id                          |
//+------------------------------------------------------------------+
void RM_InitIdentity()
  {
   g_sym = Symbol();
   g_chartId = ChartID();
   string mode = IsTesting() ? "T_" : "";
   g_keyBase = mode + IntegerToString(AccountNumber()) + "_" + g_sym + "_" + IntegerToString(InpInstanceId);
   g_stateFile = "RecoveryManagerPro\\" + g_keyBase + ".state";
   g_auditFile = "RecoveryManagerPro\\" + g_keyBase + "_audit.csv";
  }


//==== inlined: Include/RecoveryManagerPro/RM_Broker.mqh
//+------------------------------------------------------------------+
//| RM_Broker.mqh - symbol metadata and trade operations with bounded |
//| retries and reconciliation. An uncertain broker reply never       |
//| leads to a blind resend: the book is searched first.              |
//+------------------------------------------------------------------+

#define RM_RETRIES 3

//+------------------------------------------------------------------+
void RM_RefreshMeta()
  {
   g_meta.point = MarketInfo(g_sym, MODE_POINT);
   g_meta.tickSize = MarketInfo(g_sym, MODE_TICKSIZE);
   g_meta.tickValue = MarketInfo(g_sym, MODE_TICKVALUE);
   g_meta.minLot = MarketInfo(g_sym, MODE_MINLOT);
   g_meta.maxLot = MarketInfo(g_sym, MODE_MAXLOT);
   g_meta.lotStep = MarketInfo(g_sym, MODE_LOTSTEP);
   g_digits = (int)MarketInfo(g_sym, MODE_DIGITS);
   if(g_meta.tickSize <= 0.0)
      g_meta.tickSize = g_meta.point;          // some feeds report 0: fall back to point
   if(g_meta.lotStep <= 0.0)
      g_meta.lotStep = 0.01;
   g_mpp = RM_MoneyPerPointPerLot(g_meta.tickValue, g_meta.tickSize, g_meta.point);
  }

//+------------------------------------------------------------------+
//| Round an already-planned volume onto the broker lot grid          |
//+------------------------------------------------------------------+
double RM_NormVol(double v)
  {
   double step = g_meta.lotStep;
   int ld = (int)MathCeil(-MathLog10(step) - 1e-9);
   if(ld < 0)
      ld = 0;
   return NormalizeDouble(MathRound(v / step) * step, ld);
  }

double RM_Bid() { return MarketInfo(g_sym, MODE_BID); }
double RM_Ask() { return MarketInfo(g_sym, MODE_ASK); }

int RM_SpreadPoints()
  {
   if(g_meta.point <= 0.0)
      return 0;
   return (int)MathRound((RM_Ask() - RM_Bid()) / g_meta.point);
  }

double RM_NormPrice(double p)
  {
   return NormalizeDouble(p, g_digits);
  }

//+------------------------------------------------------------------+
//| Error classification                                              |
//+------------------------------------------------------------------+
bool RM_ErrRetryable(int e)
  {
   return (e == ERR_SERVER_BUSY || e == ERR_BROKER_BUSY || e == ERR_PRICE_CHANGED ||
           e == ERR_OFF_QUOTES || e == ERR_REQUOTE || e == ERR_TRADE_CONTEXT_BUSY ||
           e == ERR_INVALID_PRICE || e == ERR_TOO_FREQUENT_REQUESTS);
  }

bool RM_ErrUncertain(int e)
  {
   // reply lost: the order may or may not exist
   return (e == ERR_TRADE_TIMEOUT || e == ERR_NO_RESULT || e == ERR_COMMON_ERROR ||
           e == ERR_NO_CONNECTION);
  }

string RM_ErrText(int e)
  {
   return IntegerToString(e) + " " + ErrorDescription(e);
  }

//+------------------------------------------------------------------+
//| Is trading possible right now? why receives the reason.          |
//+------------------------------------------------------------------+
bool RM_TradeReady(string &why)
  {
   if(!IsTesting() && !IsConnected())
     { why = "no connection to trade server"; return false; }
   if(!IsTradeAllowed())
     { why = "trading not allowed (AutoTrading off, EA permissions or trade context)"; return false; }
   if(MarketInfo(g_sym, MODE_TRADEALLOWED) == 0.0)
     { why = "market closed or symbol not tradeable"; return false; }
   if(IsTradeContextBusy())
     { why = "trade context busy"; return false; }
   if(RM_Bid() <= 0.0 || RM_Ask() <= 0.0)
     { why = "no valid quote"; return false; }
   return true;
  }

bool RM_QuoteStale(string &why)
  {
   if(IsTesting() || InpStaleQuoteSeconds <= 0)
      return false;
   datetime last = (datetime)MarketInfo(g_sym, MODE_TIME);
   if(TimeCurrent() - last > InpStaleQuoteSeconds)
     {
      why = "stale quote (" + IntegerToString((int)(TimeCurrent() - last)) + " s old)";
      return true;
     }
   return false;
  }

void RM_WaitContext()
  {
   if(IsTesting())
      return;
   uint t0 = GetTickCount();
   while(IsTradeContextBusy() && GetTickCount() - t0 < 5000)
      Sleep(50);
  }

//+------------------------------------------------------------------+
//| Find an open order carrying our unique request tag               |
//+------------------------------------------------------------------+
int RM_FindByTag(string tag, int magic)
  {
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
         continue;
      if(OrderSymbol() != g_sym || OrderMagicNumber() != magic)
         continue;
      if(StringFind(OrderComment(), tag) >= 0)
         return OrderTicket();
     }
   return -1;
  }

//+------------------------------------------------------------------+
//| Market order. comment must contain a unique tag "#<seq>".         |
//| Returns ticket or -1; err receives the reason.                    |
//+------------------------------------------------------------------+
int RM_Send(int type, double lots, int magic, string comment, string tag, string &err)
  {
   string why = "";
   if(!RM_TradeReady(why))
     { err = why; return -1; }
   if(lots < g_meta.minLot - RM_EPS)
     { err = "volume " + RM_Lots(lots) + " below broker minimum"; return -1; }
   ResetLastError();
   double freeAfter = AccountFreeMarginCheck(g_sym, type, lots);
   if(freeAfter <= 0.0 || GetLastError() == ERR_NOT_ENOUGH_MONEY)
     { err = "insufficient margin for " + RM_Lots(lots) + " lots"; return -1; }
   color arrow = (type == OP_BUY) ? clrDodgerBlue : clrOrangeRed;
   for(int attempt = 0; attempt < RM_RETRIES; attempt++)
     {
      RM_WaitContext();
      RefreshRates();
      double price = (type == OP_BUY) ? RM_Ask() : RM_Bid();
      ResetLastError();
      int t = OrderSend(g_sym, type, lots, RM_NormPrice(price), InpMaxSlippage, 0, 0,
                        comment, magic, 0, arrow);
      if(t > 0)
        {
         g_tradeEvents++;
         return t;
        }
      int e = GetLastError();
      err = RM_ErrText(e);
      if(RM_ErrUncertain(e))
        {
         if(!IsTesting())
            Sleep(1000);
         int found = RM_FindByTag(tag, magic);
         if(found > 0)
           {
            g_tradeEvents++;
            return found;                     // it did go through: never resend
           }
         // still unknown: do not risk a duplicate in the same event
         err = "uncertain reply (" + err + "); not resent";
         return -1;
        }
      if(!RM_ErrRetryable(e))
         return -1;
      if(!IsTesting())
         Sleep(300 * (attempt + 1));
     }
   return -1;
  }

//+------------------------------------------------------------------+
//| Realised result of a closed (history) ticket                      |
//+------------------------------------------------------------------+
bool RM_HistoryResult(int ticket, double &lots, double &net, datetime &closeTime, string &comment)
  {
   if(!OrderSelect(ticket, SELECT_BY_TICKET))
      return false;
   if(OrderCloseTime() == 0)
      return false;
   lots = OrderLots();
   net = OrderProfit() + OrderSwap() + OrderCommission();
   closeTime = OrderCloseTime();
   comment = OrderComment();
   return true;
  }

//+------------------------------------------------------------------+
//| Child left open after a partial close ("from #<parent>")          |
//+------------------------------------------------------------------+
int RM_FindChild(int parent)
  {
   string key = "from #" + IntegerToString(parent);
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
         continue;
      if(OrderSymbol() != g_sym)
         continue;
      if(StringFind(OrderComment(), key) >= 0)
         return OrderTicket();
     }
   return -1;
  }

//+------------------------------------------------------------------+
//| Close lots of a ticket. Re-selects immediately before closing.   |
//| closedLots / realized from the history record; child = remainder |
//| ticket after a partial close (or 0). Returns true on confirmed    |
//| close (including a close found after an uncertain reply).         |
//+------------------------------------------------------------------+
bool RM_Close(int ticket, double lots, double &closedLots, double &realized, int &child, string &err)
  {
   closedLots = 0; realized = 0; child = 0;
   string why = "";
   if(!RM_TradeReady(why))
     { err = why; return false; }
   for(int attempt = 0; attempt < RM_RETRIES; attempt++)
     {
      RM_WaitContext();
      if(!OrderSelect(ticket, SELECT_BY_TICKET))
        { err = "ticket not found"; return false; }
      if(OrderCloseTime() != 0)
        { err = "ticket already closed"; return false; }
      int type = OrderType();
      if(type != OP_BUY && type != OP_SELL)
        { err = "not a market order"; return false; }
      double have = OrderLots();
      double v = MathMin(lots, have);
      v = RM_NormVol(v);
      if(have - v < g_meta.minLot - RM_EPS && have - v > RM_EPS)
        { err = "close would leave an invalid remainder"; return false; }
      // freeze level: a close can be rejected when SL/TP sit inside it
      double freeze = MarketInfo(g_sym, MODE_FREEZELEVEL) * g_meta.point;
      RefreshRates();
      double price = (type == OP_BUY) ? RM_Bid() : RM_Ask();
      if(freeze > 0.0)
        {
         double sl = OrderStopLoss(), tp = OrderTakeProfit();
         if((sl > 0 && MathAbs(price - sl) <= freeze) || (tp > 0 && MathAbs(price - tp) <= freeze))
           { err = "inside broker freeze level"; return false; }
        }
      ResetLastError();
      bool ok = OrderClose(ticket, v, RM_NormPrice(price), InpMaxSlippage, clrGold);
      int e = GetLastError();
      if(!ok && RM_ErrUncertain(e))
        {
         if(!IsTesting())
            Sleep(1000);
         if(OrderSelect(ticket, SELECT_BY_TICKET) && OrderCloseTime() != 0)
            ok = true;                        // closed despite the lost reply
        }
      if(ok)
        {
         g_tradeEvents++;
         datetime ct; string cm;
         double hl = 0, hn = 0;
         if(RM_HistoryResult(ticket, hl, hn, ct, cm))
           {
            closedLots = hl;
            realized = hn;
           }
         else
           {
            closedLots = v;
            realized = 0;
           }
         if(have - closedLots > RM_EPS)
           {
            int c = RM_FindChild(ticket);
            child = (c > 0) ? c : 0;
           }
         return true;
        }
      err = RM_ErrText(e);
      if(e == ERR_MARKET_CLOSED || e == ERR_TRADE_DISABLED || e == ERR_INVALID_TRADE_VOLUME)
         return false;
      if(!RM_ErrRetryable(e))
         return false;
      if(!IsTesting())
         Sleep(300 * (attempt + 1));
     }
   return false;
  }

//+------------------------------------------------------------------+
//| Remove SL/TP. Respects stop and freeze levels.                    |
//+------------------------------------------------------------------+
bool RM_ClearSLTP(int ticket, string &err)
  {
   if(!OrderSelect(ticket, SELECT_BY_TICKET) || OrderCloseTime() != 0)
     { err = "ticket not open"; return false; }
   if(OrderStopLoss() == 0.0 && OrderTakeProfit() == 0.0)
      return true;
   double freeze = MarketInfo(g_sym, MODE_FREEZELEVEL) * g_meta.point;
   double price = (OrderType() == OP_BUY) ? RM_Bid() : RM_Ask();
   if(freeze > 0.0)
     {
      double sl = OrderStopLoss(), tp = OrderTakeProfit();
      if((sl > 0 && MathAbs(price - sl) <= freeze) || (tp > 0 && MathAbs(price - tp) <= freeze))
        { err = "inside freeze level, retry later"; return false; }
     }
   for(int attempt = 0; attempt < RM_RETRIES; attempt++)
     {
      RM_WaitContext();
      if(!OrderSelect(ticket, SELECT_BY_TICKET))
         return false;
      ResetLastError();
      if(OrderModify(ticket, OrderOpenPrice(), 0, 0, 0, clrNONE))
         return true;
      int e = GetLastError();
      err = RM_ErrText(e);
      if(e == ERR_NO_RESULT)
         return true;                          // nothing changed = already clear
      if(!RM_ErrRetryable(e))
         return false;
     }
   return false;
  }

bool RM_DeletePending(int ticket, string &err)
  {
   for(int attempt = 0; attempt < RM_RETRIES; attempt++)
     {
      RM_WaitContext();
      if(!OrderSelect(ticket, SELECT_BY_TICKET) || OrderCloseTime() != 0)
         return true;
      ResetLastError();
      if(OrderDelete(ticket))
         return true;
      int e = GetLastError();
      err = RM_ErrText(e);
      if(!RM_ErrRetryable(e))
         return false;
     }
   return false;
  }


//==== inlined: Include/RecoveryManagerPro/RM_Persist.mqh
//+------------------------------------------------------------------+
//| RM_Persist.mqh - state file (MQL4/Files/RecoveryManagerPro/) and  |
//| instance lock. The file is written after every state change,      |
//| registry change and confirmed journal leg; it is advisory only:   |
//| on load, broker truth (RM_ReconcileRegistry) always wins.         |
//+------------------------------------------------------------------+

string RM_LockName()
  {
   return "RMP_LOCK_" + g_keyBase;
  }

string RM_MagicLockName()
  {
   return "RMP_MAGIC_" + IntegerToString(AccountNumber()) + "_" + g_sym + "_" + IntegerToString(InpRecoveryMagic);
  }

//+------------------------------------------------------------------+
//| true if another chart still hosts the owner of this lock          |
//+------------------------------------------------------------------+
bool RM_LockHeldElsewhere(string name)
  {
   if(!GlobalVariableCheck(name))
      return false;
   long owner = (long)GlobalVariableGet(name);
   if(owner == g_chartId)
      return false;
   // owner chart still open?
   long id = ChartFirst();
   while(id >= 0)
     {
      if(id == owner)
         return true;
      id = ChartNext(id);
     }
   return false;           // stale lock from a closed chart
  }

bool RM_AcquireInstanceLock(string &err)
  {
   if(IsTesting())
      return true;         // tester runs are isolated
   if(RM_LockHeldElsewhere(RM_LockName()))
     {
      err = "another chart already runs instance " + IntegerToString(InpInstanceId) +
            " on " + g_sym + " for this account - ownership would be ambiguous";
      return false;
     }
   if(RM_LockHeldElsewhere(RM_MagicLockName()))
     {
      err = "recovery magic " + IntegerToString(InpRecoveryMagic) + " is already used by another chart on " + g_sym;
      return false;
     }
   GlobalVariableSet(RM_LockName(), (double)g_chartId);
   GlobalVariableSet(RM_MagicLockName(), (double)g_chartId);
   return true;
  }

void RM_ReleaseInstanceLock()
  {
   if(IsTesting())
      return;
   if(GlobalVariableCheck(RM_LockName()) && (long)GlobalVariableGet(RM_LockName()) == g_chartId)
      GlobalVariableDel(RM_LockName());
   if(GlobalVariableCheck(RM_MagicLockName()) && (long)GlobalVariableGet(RM_MagicLockName()) == g_chartId)
      GlobalVariableDel(RM_MagicLockName());
  }

string RM_B(bool b) { return b ? "1" : "0"; }

//+------------------------------------------------------------------+
void RM_SaveState()
  {
   if(g_stateFile == "")
      return;
   string tmp = g_stateFile + ".tmp";
   int h = FileOpen(tmp, FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(h == INVALID_HANDLE)
     {
      Print("RMP: cannot write state file ", tmp, " error ", GetLastError());
      return;
     }
   FileWriteString(h, "VERSION=1\r\n");
   FileWriteString(h, "STATE=" + IntegerToString(g_state) + "\r\n");
   FileWriteString(h, "BEFOREPAUSE=" + IntegerToString(g_stateBeforePause) + "\r\n");
   FileWriteString(h, "SESSION=" + IntegerToString(g_sessionId) + "\r\n");
   FileWriteString(h, "LAUNCH=" + RM_B(g_launchDone) + "\r\n");
   FileWriteString(h, "PREP=" + RM_B(g_prepDone) + "\r\n");
   FileWriteString(h, "LOCK=" + RM_B(g_lockDone) + "\r\n");
   FileWriteString(h, "PENDDEL=" + RM_B(g_pendingsDone) + "\r\n");
   FileWriteString(h, "SLTP=" + RM_B(g_sltpDone) + "\r\n");
   FileWriteString(h, "FIN=" + RM_B(g_financeDone) + "\r\n");
   FileWriteString(h, "CHARTS=" + RM_B(g_chartsDone) + "\r\n");
   FileWriteString(h, "CLOSEREQ=" + RM_B(g_closeRequested) + "\r\n");
   FileWriteString(h, "NOTIFIED=" + RM_B(g_launchNotified) + "\r\n");
   FileWriteString(h, "LEB0=" + IntegerToString(g_lastEntryBar[0]) + "\r\n");
   FileWriteString(h, "LEB1=" + IntegerToString(g_lastEntryBar[1]) + "\r\n");
   FileWriteString(h, "HI0=" + IntegerToString(g_highIndex[0]) + "\r\n");
   FileWriteString(h, "HI1=" + IntegerToString(g_highIndex[1]) + "\r\n");
   FileWriteString(h, "PLANSEQ=" + IntegerToString(g_planSeq) + "\r\n");
   FileWriteString(h, "REQSEQ=" + IntegerToString(g_reqSeq) + "\r\n");
   FileWriteString(h, "RSESS=" + DoubleToString(g_realizedSession, 2) + "\r\n");
   FileWriteString(h, "RDAY=" + DoubleToString(g_realizedDay, 2) + "\r\n");
   FileWriteString(h, "DAY=" + IntegerToString(g_dayStamp) + "\r\n");
   FileWriteString(h, "PEAKDD=" + DoubleToString(g_peakDrawdown, 2) + "\r\n");
   FileWriteString(h, "RESID=" + DoubleToString(g_lockResidual, 8) + "\r\n");
   for(int i = 0; i < g_regCount; i++)
      FileWriteString(h, "REG=" + IntegerToString(g_reg[i].ticket) + "," + IntegerToString(g_reg[i].role) + "," +
                      IntegerToString(g_reg[i].type) + "," + DoubleToString(g_reg[i].initialLots, 8) + "," +
                      IntegerToString(g_reg[i].gridIndex) + "," + IntegerToString(g_reg[i].parent) + "," +
                      IntegerToString(g_reg[i].session) + "," + DoubleToString(g_reg[i].openPrice, 8) + "," +
                      IntegerToString(g_reg[i].openTime) + "\r\n");
   for(int p = 0; p < g_pendCount; p++)
      FileWriteString(h, "PENDLIN=" + IntegerToString(g_pendParent[p]) + "," + IntegerToString(g_pendSince[p]) + "\r\n");
   if(g_journal.status == RM_J_IN_PROGRESS)
     {
      FileWriteString(h, "J=" + IntegerToString(g_journal.planId) + "," + IntegerToString(g_journal.kind) + "," +
                      IntegerToString(g_journal.status) + "," + IntegerToString(g_journal.n) + "," +
                      DoubleToString(g_journal.estimatedNet, 2) + "," + DoubleToString(g_journal.realizedNet, 2) + "," +
                      IntegerToString(g_journal.attempts) + "," + IntegerToString(g_journalStart) + "\r\n");
      for(int k = 0; k < g_journal.n; k++)
         FileWriteString(h, "JL=" + IntegerToString(k) + "," + IntegerToString(g_journal.ticket[k]) + "," +
                         DoubleToString(g_journal.targetLots[k], 8) + "," + DoubleToString(g_journal.doneLots[k], 8) + "," +
                         DoubleToString(g_journal.realized[k], 2) + "," + IntegerToString(g_journal.legDone[k]) + "," +
                         DoubleToString(g_journal.ticketLots[k], 8) + "\r\n");
     }
   FileClose(h);
   if(!FileMove(tmp, 0, g_stateFile, FILE_REWRITE))
      Print("RMP: state file replace failed, error ", GetLastError());
  }

//+------------------------------------------------------------------+
bool RM_LoadState()
  {
   if(IsTesting() && FileIsExist(g_stateFile))
      FileDelete(g_stateFile);          // every tester run starts clean
   if(!FileIsExist(g_stateFile))
      return false;
   int h = FileOpen(g_stateFile, FILE_READ | FILE_TXT | FILE_ANSI);
   if(h == INVALID_HANDLE)
      return false;
   g_regCount = 0;
   g_pendCount = 0;
   RM_JournalClear(g_journal);
   ushort comma = StringGetCharacter(",", 0);
   while(!FileIsEnding(h))
     {
      string line = FileReadString(h);
      int eq = StringFind(line, "=");
      if(eq <= 0)
         continue;
      string key = StringSubstr(line, 0, eq);
      string val = StringSubstr(line, eq + 1);
      if(key == "STATE") g_state = (int)StringToInteger(val);
      else if(key == "BEFOREPAUSE") g_stateBeforePause = (int)StringToInteger(val);
      else if(key == "SESSION") g_sessionId = StringToInteger(val);
      else if(key == "LAUNCH") g_launchDone = (val == "1");
      else if(key == "PREP") g_prepDone = (val == "1");
      else if(key == "LOCK") g_lockDone = (val == "1");
      else if(key == "PENDDEL") g_pendingsDone = (val == "1");
      else if(key == "SLTP") g_sltpDone = (val == "1");
      else if(key == "FIN") g_financeDone = (val == "1");
      else if(key == "CHARTS") g_chartsDone = (val == "1");
      else if(key == "CLOSEREQ") g_closeRequested = (val == "1");
      else if(key == "NOTIFIED") g_launchNotified = (val == "1");
      else if(key == "LEB0") g_lastEntryBar[0] = StringToInteger(val);
      else if(key == "LEB1") g_lastEntryBar[1] = StringToInteger(val);
      else if(key == "HI0") g_highIndex[0] = (int)StringToInteger(val);
      else if(key == "HI1") g_highIndex[1] = (int)StringToInteger(val);
      else if(key == "PLANSEQ") g_planSeq = (int)StringToInteger(val);
      else if(key == "REQSEQ") g_reqSeq = (int)StringToInteger(val);
      else if(key == "RSESS") g_realizedSession = StringToDouble(val);
      else if(key == "RDAY") g_realizedDay = StringToDouble(val);
      else if(key == "DAY") g_dayStamp = StringToInteger(val);
      else if(key == "PEAKDD") g_peakDrawdown = StringToDouble(val);
      else if(key == "RESID") g_lockResidual = StringToDouble(val);
      else if(key == "REG" && g_regCount < RM_MAX_REG)
        {
         string f[];
         if(StringSplit(val, comma, f) >= 9)
           {
            int i = g_regCount++;
            g_reg[i].ticket = (int)StringToInteger(f[0]);
            g_reg[i].role = (int)StringToInteger(f[1]);
            g_reg[i].type = (int)StringToInteger(f[2]);
            g_reg[i].initialLots = StringToDouble(f[3]);
            g_reg[i].gridIndex = (int)StringToInteger(f[4]);
            g_reg[i].parent = (int)StringToInteger(f[5]);
            g_reg[i].session = StringToInteger(f[6]);
            g_reg[i].openPrice = StringToDouble(f[7]);
            g_reg[i].openTime = StringToInteger(f[8]);
           }
        }
      else if(key == "PENDLIN" && g_pendCount < 32)
        {
         string f2[];
         if(StringSplit(val, comma, f2) >= 2)
           {
            g_pendParent[g_pendCount] = (int)StringToInteger(f2[0]);
            g_pendSince[g_pendCount] = StringToInteger(f2[1]);
            g_pendCount++;
           }
        }
      else if(key == "J")
        {
         string f3[];
         if(StringSplit(val, comma, f3) >= 8)
           {
            g_journal.planId = (int)StringToInteger(f3[0]);
            g_journal.kind = (int)StringToInteger(f3[1]);
            g_journal.status = (int)StringToInteger(f3[2]);
            g_journal.n = (int)MathMin(StringToInteger(f3[3]), RM_MAX_PLAN_LEGS);
            g_journal.estimatedNet = StringToDouble(f3[4]);
            g_journal.realizedNet = StringToDouble(f3[5]);
            g_journal.attempts = (int)StringToInteger(f3[6]);
            g_journalStart = StringToInteger(f3[7]);
           }
        }
      else if(key == "JL")
        {
         string f4[];
         if(StringSplit(val, comma, f4) >= 7)
           {
            int k = (int)StringToInteger(f4[0]);
            if(k >= 0 && k < RM_MAX_PLAN_LEGS)
              {
               g_journal.ticket[k] = (int)StringToInteger(f4[1]);
               g_journal.targetLots[k] = StringToDouble(f4[2]);
               g_journal.doneLots[k] = StringToDouble(f4[3]);
               g_journal.realized[k] = StringToDouble(f4[4]);
               g_journal.legDone[k] = (int)StringToInteger(f4[5]);
               g_journal.ticketLots[k] = StringToDouble(f4[6]);
              }
           }
        }
     }
   FileClose(h);
   if(g_state < RM_ST_IDLE || g_state > RM_ST_ERROR_HOLD)
      g_state = RM_ST_ERROR_HOLD;
   return true;
  }


//==== inlined: Include/RecoveryManagerPro/RM_Registry.mqh
//+------------------------------------------------------------------+
//| RM_Registry.mqh - order ownership, roles, adoption and partial-   |
//| close lineage. Produces g_book, the single authoritative snapshot |
//| used by the planner, the engine and the dashboard.                |
//|                                                                   |
//| Role resolution for an open market order on this symbol:          |
//|  1. ticket already registered          -> registered role         |
//|  2. comment "from #X", X registered     -> inherits X (lineage)    |
//|  3. magic == recovery magic             -> RECOVERY                |
//|  4. magic == lock magic                 -> LOCK                    |
//|  5. comment of another RMP instance     -> never adopted           |
//|  6. in scope AND adoption allowed       -> ORIGINAL                |
//|  7. otherwise                           -> unmanaged (untouched)   |
//+------------------------------------------------------------------+

string RM_CommentPrefix()
  {
   return "RMP" + IntegerToString(InpInstanceId) + " ";
  }

int RM_RegFind(int ticket)
  {
   for(int i = 0; i < g_regCount; i++)
      if(g_reg[i].ticket == ticket)
         return i;
   return -1;
  }

bool RM_RegAdd(int ticket, int role, int type, double initialLots, int gridIndex,
               int parent, double openPrice, long openTime)
  {
   if(RM_RegFind(ticket) >= 0)
      return true;
   if(g_regCount >= RM_MAX_REG)
     {
      g_errorCondition = true;
      g_errorText = "ownership registry full";
      return false;
     }
   int i = g_regCount++;
   g_reg[i].ticket = ticket;
   g_reg[i].role = role;
   g_reg[i].type = type;
   g_reg[i].initialLots = initialLots;
   g_reg[i].gridIndex = gridIndex;
   g_reg[i].parent = parent;
   g_reg[i].session = g_sessionId;
   g_reg[i].openPrice = openPrice;
   g_reg[i].openTime = openTime;
   return true;
  }

void RM_RegRemoveAt(int i)
  {
   if(i < 0 || i >= g_regCount)
      return;
   for(int k = i; k < g_regCount - 1; k++)
      g_reg[k] = g_reg[k + 1];
   g_regCount--;
  }

void RM_RegRemove(int ticket)
  {
   RM_RegRemoveAt(RM_RegFind(ticket));
  }

//+------------------------------------------------------------------+
//| Partial close: move the registry entry to the remainder ticket.   |
//+------------------------------------------------------------------+
void RM_RegSplit(int parent, int child)
  {
   int i = RM_RegFind(parent);
   if(i < 0)
      return;
   if(RM_RegFind(child) >= 0)
     {
      RM_RegRemoveAt(i);
      return;
     }
   g_reg[i].ticket = child;
   g_reg[i].parent = parent;
  }

//--- pending lineage (child not yet visible after a partial close)
void RM_PendAdd(int parent)
  {
   for(int i = 0; i < g_pendCount; i++)
      if(g_pendParent[i] == parent)
         return;
   if(g_pendCount >= 32)
     {
      g_errorCondition = true;
      g_errorText = "too many unresolved partial-close lineages";
      return;
     }
   g_pendParent[g_pendCount] = parent;
   g_pendSince[g_pendCount] = (long)TimeCurrent();
   g_pendCount++;
  }

int RM_PendFind(int parent)
  {
   for(int i = 0; i < g_pendCount; i++)
      if(g_pendParent[i] == parent)
         return i;
   return -1;
  }

void RM_PendRemove(int parent)
  {
   int i = RM_PendFind(parent);
   if(i < 0)
      return;
   for(int k = i; k < g_pendCount - 1; k++)
     {
      g_pendParent[k] = g_pendParent[k + 1];
      g_pendSince[k] = g_pendSince[k + 1];
     }
   g_pendCount--;
  }

//+------------------------------------------------------------------+
//| Realised P/L accounting (session and server-day)                  |
//+------------------------------------------------------------------+
void RM_DayRoll()
  {
   long today = (long)(TimeCurrent() / 86400);
   if(g_dayStamp != today)
     {
      g_dayStamp = today;
      g_realizedDay = 0.0;
     }
  }

void RM_AddRealized(double v)
  {
   RM_DayRoll();
   g_realizedSession += v;
   g_realizedDay += v;
  }

//+------------------------------------------------------------------+
//| Scope test for adoption (market orders)                           |
//+------------------------------------------------------------------+
bool RM_InScope(int magic)
  {
   if(magic == InpRecoveryMagic || magic == InpLockMagic)
      return false;
   if(RM_InList(magic, g_magicExclude))
      return false;
   if(InpScope == RM_SCOPE_MANUAL)
      return magic == 0;
   if(InpScope == RM_SCOPE_MAGIC_LIST)
      return RM_InList(magic, g_magicAllow);
   return true;
  }

bool RM_ForeignRmpComment(string cmt)
  {
   if(StringFind(cmt, "RMP") != 0)
      return false;
   return StringFind(cmt, RM_CommentPrefix()) != 0;
  }

bool RM_AdoptionAllowed()
  {
   if(g_state == RM_ST_IDLE || g_state == RM_ST_COMPLETE)
      return true;
   if(InpAdoptPolicy == RM_ADOPT_ALWAYS)
      return true;
   if(InpAdoptPolicy == RM_ADOPT_UNTIL_LAUNCH)
      return !g_launchDone;
   return false;
  }

//+------------------------------------------------------------------+
//| Grid index encoded in our recovery comment "RMP1 R B 3 #17"       |
//+------------------------------------------------------------------+
int RM_ParseGridIndex(string cmt)
  {
   string parts[];
   int n = StringSplit(cmt, StringGetCharacter(" ", 0), parts);
   if(n >= 4 && parts[1] == "R")
      return (int)StringToInteger(parts[3]);
   return -1;
  }

//+------------------------------------------------------------------+
//| Resolve lineage for a registry entry that is no longer open       |
//+------------------------------------------------------------------+
void RM_HandleVanished(int regIdx, bool &changed)
  {
   int t = g_reg[regIdx].ticket;
   if(RM_JournalHasOpenLeg(t))
      return;                       // the executor reconciles its own legs
   int pi = RM_PendFind(t);
   if(pi >= 0)
     {
      // our own partial close: waiting for the remainder ticket to appear
      if((long)TimeCurrent() - g_pendSince[pi] > 60)
        {
         // never guess which ticket carries the remainder: hold for the operator
         g_errorCondition = true;
         g_errorText = "partial-close remainder of #" + IntegerToString(t) + " not found - lineage unresolved";
        }
      return;
     }
   double lots = 0, net = 0; datetime ctime; string cmt = "";
   if(RM_HistoryResult(t, lots, net, ctime, cmt))
     {
      RM_AddRealized(net);
      RM_Audit("EXTERNAL_CLOSE", t, lots, net, RM_RoleName(g_reg[regIdx].role) + " closed outside this EA");
      RM_AnnotClosed(t, net, false);
     }
   else
      RM_Audit("VANISHED", t, 0, 0, "ticket not in open orders or visible history (check history filter)");
   RM_RegRemoveAt(regIdx);
   changed = true;
  }

//+------------------------------------------------------------------+
//| Build the book from broker truth. Adopts, inherits lineage,      |
//| detects external closures. Returns true if registry changed.      |
//+------------------------------------------------------------------+
bool RM_BuildBook()
  {
   bool changed = false;
   g_book.n = 0;
   string pfx = RM_CommentPrefix();
   int total = OrdersTotal();
   for(int i = 0; i < total; i++)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
         continue;
      if(OrderSymbol() != g_sym)
         continue;
      int type = OrderType();
      if(type != OP_BUY && type != OP_SELL)
         continue;
      // capture everything now: lineage/history lookups below re-select other orders
      int ticket = OrderTicket();
      int magic = OrderMagicNumber();
      string cmt = OrderComment();
      double oLots = OrderLots();
      double oProfit = OrderProfit();
      double oSwap = OrderSwap();
      double oComm = OrderCommission();
      double oPrice = OrderOpenPrice();
      long oTime = (long)OrderOpenTime();
      int idx = RM_RegFind(ticket);
      if(idx < 0)
        {
         int role = RM_ROLE_NONE;
         int gi = 0;
         int parent = 0;
         double initLots = oLots;
         int fromPos = StringFind(cmt, "from #");
         if(fromPos >= 0)
           {
            int par = (int)StringToInteger(StringSubstr(cmt, fromPos + 6));
            int pidx = RM_RegFind(par);
            if(pidx >= 0)
              {
               role = g_reg[pidx].role;
               gi = g_reg[pidx].gridIndex;
               initLots = g_reg[pidx].initialLots;
               parent = par;
               bool ours = (RM_PendFind(par) >= 0) || RM_JournalHasOpenLeg(par);
               if(!ours)
                 {
                  double hl, hn; datetime ct; string cm;
                  if(RM_HistoryResult(par, hl, hn, ct, cm))
                    {
                     RM_AddRealized(hn);
                     RM_Audit("EXTERNAL_PARTIAL", par, hl, hn, "remainder #" + IntegerToString(ticket));
                    }
                 }
               RM_PendRemove(par);
               RM_RegRemoveAt(pidx);
               changed = true;
               RM_Audit("LINEAGE", ticket, oLots, 0, "inherits " + RM_RoleName(role) + " from #" + IntegerToString(par));
              }
           }
         if(role == RM_ROLE_NONE)
           {
            if(magic == InpRecoveryMagic)
              {
               role = RM_ROLE_RECOVERY;
               gi = (int)MathMax(0, RM_ParseGridIndex(cmt));
              }
            else if(magic == InpLockMagic)
               role = RM_ROLE_LOCK;
            else if(RM_ForeignRmpComment(cmt))
               role = RM_ROLE_NONE;              // another instance's order
            else if(StringFind(cmt, pfx + "O") == 0)
               role = RM_ROLE_ORIGINAL;          // our manual ORIGINAL order
            else if(RM_InScope(magic) && RM_AdoptionAllowed())
               role = RM_ROLE_ORIGINAL;
           }
         if(role == RM_ROLE_NONE)
            continue;
         if(!RM_RegAdd(ticket, role, type, initLots, gi, parent, oPrice, oTime))
            continue;
         if(parent == 0)
            RM_Audit("ADOPT", ticket, oLots, oProfit, RM_RoleName(role) + " magic " + IntegerToString(magic));
         changed = true;
         idx = RM_RegFind(ticket);
        }
      if(idx < 0)
         continue;
      if(g_book.n >= RM_MAX_LEGS)
        {
         g_errorCondition = true;
         g_errorText = "more managed orders than the planner can hold";
         break;
        }
      int n = g_book.n++;
      g_book.ticket[n] = ticket;
      g_book.role[n] = g_reg[idx].role;
      g_book.type[n] = type;
      g_book.lots[n] = oLots;
      g_book.profit[n] = oProfit;
      g_book.swap[n] = oSwap;
      g_book.comm[n] = oComm;
      g_book.openPrice[n] = oPrice;
      g_book.openTime[n] = oTime;
      g_book.gridIndex[n] = g_reg[idx].gridIndex;
     }
   // registry entries that are no longer open (iterate backwards: removal shifts)
   for(int k = g_regCount - 1; k >= 0; k--)
     {
      bool open = false;
      for(int b = 0; b < g_book.n; b++)
         if(g_book.ticket[b] == g_reg[k].ticket)
           { open = true; break; }
      if(!open)
         RM_HandleVanished(k, changed);
     }
   RM_ComputeTotals(g_book, g_tot);
   g_managedNet = g_tot.totalPL;
   g_drawdown = RM_Drawdown(g_managedNet);
   g_ddPct = RM_DrawdownPercent(g_managedNet, AccountBalance());
   if(g_drawdown > g_peakDrawdown)
      g_peakDrawdown = g_drawdown;
   return changed;
  }

//+------------------------------------------------------------------+
//| Count in-scope pending orders (for launch clean-up)               |
//+------------------------------------------------------------------+
int RM_EligiblePendingCount()
  {
   int c = 0;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
         continue;
      if(OrderSymbol() != g_sym || OrderType() <= OP_SELL)
         continue;
      if(RM_InScope(OrderMagicNumber()) && !RM_ForeignRmpComment(OrderComment()))
         c++;
     }
   return c;
  }

//+------------------------------------------------------------------+
//| Startup reconciliation: broker truth wins over the state file.   |
//+------------------------------------------------------------------+
void RM_ReconcileRegistry()
  {
   RM_BuildBook();
   // an in-progress journal is re-verified leg by leg by the executor
   if(g_journal.status == RM_J_IN_PROGRESS)
      RM_Audit("RESUME_JOURNAL", 0, 0, g_journal.realizedNet,
               "plan " + IntegerToString(g_journal.planId) + " " + RM_PlanKindName(g_journal.kind) + " resumes from broker state");
   RM_SaveState();
  }


//==== inlined: Include/RecoveryManagerPro/RM_Signals.mqh
//+------------------------------------------------------------------+
//| RM_Signals.mqh - signal-provider interface                         |
//|                                                                   |
//| RM_SignalAllows(dir, isFirst) is the single interface the grid     |
//| engine calls. Providers:                                           |
//|  SIMPLE_GRID      - no filter; distance rule only.                 |
//|  CANDLE_REVERSAL  - "RM Candle Reversal", an INDEPENDENT rule.     |
//|                     It is NOT the reference product's BullsBears   |
//|                     filter, whose formula is not established.      |
//|  TREND            - "RM Swing Trend", an INDEPENDENT rule. It is   |
//|                     NOT AW Trend Predictor, whose formula is not   |
//|                     established.                                    |
//|  EXTERNAL         - adapter for a licensed indicator whose buffer  |
//|                     semantics the operator supplies: a non-empty,  |
//|                     non-zero value on the closed bar (shift 1) of  |
//|                     the BUY / SELL buffer allows that direction.   |
//+------------------------------------------------------------------+

string RM_SignalName()
  {
   switch(InpSignalMode)
     {
      case RM_SIG_SIMPLE_GRID:     return "Simple grid";
      case RM_SIG_CANDLE_REVERSAL: return "RM Candle Reversal (independent)";
      case RM_SIG_TREND:           return "RM Swing Trend (independent)";
      case RM_SIG_EXTERNAL:        return "External: " + InpExtIndicator;
     }
   return "?";
  }

//+------------------------------------------------------------------+
//| RM Candle Reversal (independent definition)                       |
//| BUY : bar2 bearish (C2 < O2) AND bar1 bullish (C1 > O1) AND C1 > C2|
//| SELL: bar2 bullish (C2 > O2) AND bar1 bearish (C1 < O1) AND C1 < C2|
//| Evaluated on closed bars of the chart timeframe only.             |
//+------------------------------------------------------------------+
bool RM_CandleReversal(int dir)
  {
   double o1 = iOpen(g_sym, 0, 1), c1 = iClose(g_sym, 0, 1);
   double o2 = iOpen(g_sym, 0, 2), c2 = iClose(g_sym, 0, 2);
   if(o1 <= 0 || o2 <= 0)
      return false;
   if(dir == RM_BUY)
      return (c2 < o2) && (c1 > o1) && (c1 > c2);
   return (c2 > o2) && (c1 < o1) && (c1 < c2);
  }

//+------------------------------------------------------------------+
//| RM Swing Trend (independent definition), amplitude N bars on the  |
//| filter timeframe, closed bars only:                                |
//|   hi  = highest high of bars 1..N, lo = lowest low of bars 1..N    |
//|   mid = (hi + lo) / 2                                              |
//|   UP   (+1) if Close[1] > mid AND Close[1] > Close[N+1]            |
//|   DOWN (-1) if Close[1] < mid AND Close[1] < Close[N+1]            |
//|   else NONE (0)                                                    |
//+------------------------------------------------------------------+
int RM_SwingTrend()
  {
   int tf = InpTrendTF;
   int n = InpTrendAmplitude;
   if(iBars(g_sym, tf) < n + 3)
      return 0;
   int ih = iHighest(g_sym, tf, MODE_HIGH, n, 1);
   int il = iLowest(g_sym, tf, MODE_LOW, n, 1);
   if(ih < 0 || il < 0)
      return 0;
   double hi = iHigh(g_sym, tf, ih), lo = iLow(g_sym, tf, il);
   double mid = (hi + lo) / 2.0;
   double c1 = iClose(g_sym, tf, 1), cn = iClose(g_sym, tf, n + 1);
   if(c1 > mid && c1 > cn)
      return 1;
   if(c1 < mid && c1 < cn)
      return -1;
   return 0;
  }

bool RM_TrendAllows(int dir, bool isFirst)
  {
   int t = RM_SwingTrend();
   int want = (dir == RM_BUY) ? 1 : -1;
   if(isFirst)
     {
      if(InpTrendFirst == RM_TF_ANY)
         return true;
      if(t == 0)
         return false;
      if(InpTrendFirst == RM_TF_WITH_TREND)
         return t == want;
      return t == -want;
     }
   if(InpTrendNext == RM_TN_ANY)
      return true;
   if(t == 0)
      return false;
   if(InpTrendNext == RM_TN_WITH_TREND)
      return t == want;
   return t == -want;
  }

bool RM_ExternalAllows(int dir)
  {
   int buf = (dir == RM_BUY) ? InpExtBuyBuffer : InpExtSellBuffer;
   ResetLastError();
   double v = iCustom(g_sym, InpTrendTF, InpExtIndicator, buf, 1);
   int e = GetLastError();
   if(e != 0)
     {
      if(g_extHandleWarned == 0)
         RM_Audit("SIGNAL_ERROR", 0, 0, e, "external indicator '" + InpExtIndicator + "' unavailable");
      g_extHandleWarned = 1;
      return false;             // a missing indicator never allows entries
     }
   return (v != EMPTY_VALUE && v != 0.0);
  }

//+------------------------------------------------------------------+
//| Provider interface                                                |
//+------------------------------------------------------------------+
bool RM_SignalAllows(int dir, bool isFirst)
  {
   switch(InpSignalMode)
     {
      case RM_SIG_SIMPLE_GRID:     return true;
      case RM_SIG_CANDLE_REVERSAL: return RM_CandleReversal(dir);
      case RM_SIG_TREND:           return RM_TrendAllows(dir, isFirst);
      case RM_SIG_EXTERNAL:        return RM_ExternalAllows(dir);
     }
   return false;
  }

string RM_TrendText()
  {
   if(InpSignalMode != RM_SIG_TREND)
      return "";
   int t = RM_SwingTrend();
   return (t > 0) ? "UP" : (t < 0 ? "DOWN" : "NONE");
  }


//==== inlined: Include/RecoveryManagerPro/RM_Risk.mqh
//+------------------------------------------------------------------+
//| RM_Risk.mqh - gates for NEW exposure and the emergency stop.      |
//| Spread, session and margin gates only ever block new exposure;    |
//| they never block risk-reducing closes.                            |
//+------------------------------------------------------------------+

double RM_MarginLevel()
  {
   double m = AccountMargin();
   if(m <= 0.0)
      return 0.0;       // 0 = no margin in use (displayed as "-")
   return AccountEquity() / m * 100.0;
  }

bool RM_InSession()
  {
   int h = TimeHour(TimeCurrent());
   if(InpSessionStartHour == 0 && InpSessionEndHour == 24)
      return true;
   if(InpSessionStartHour < InpSessionEndHour)
      return h >= InpSessionStartHour && h < InpSessionEndHour;
   return h >= InpSessionStartHour || h < InpSessionEndHour;     // overnight window
  }

bool RM_DailyLocked()
  {
   RM_DayRoll();
   return InpDailyLossLimit > 0.0 && g_realizedDay <= -InpDailyLossLimit;
  }

//+------------------------------------------------------------------+
//| Account-level checks for opening `lots` of `type`.                |
//| isHedge: lock orders reduce net exposure, so spread/session/daily |
//| gates are skipped for them; margin is still checked.              |
//+------------------------------------------------------------------+
bool RM_NewExposureBlocked(int type, double lots, bool isHedge, string &why)
  {
   if(!isHedge)
     {
      int sp = RM_SpreadPoints();
      if(sp > InpMaxSpread)
        { why = "spread " + IntegerToString(sp) + " > max " + IntegerToString(InpMaxSpread) + " points"; return true; }
      if(RM_QuoteStale(why))
         return true;
      if(!RM_InSession())
        { why = "outside entry session hours"; return true; }
      if(RM_DailyLocked())
        { why = "daily loss lockout (" + RM_Money(g_realizedDay) + " " + AccountCurrency() + ")"; return true; }
      if(InpMaxManagedLots > 0.0 && g_tot.totalLots + lots > InpMaxManagedLots + RM_EPS)
        { why = "max combined managed lots " + RM_Lots(InpMaxManagedLots) + " reached"; return true; }
     }
   ResetLastError();
   double freeAfter = AccountFreeMarginCheck(g_sym, type, lots);
   if(freeAfter <= 0.0 || GetLastError() == ERR_NOT_ENOUGH_MONEY)
     { why = "insufficient free margin for " + RM_Lots(lots) + " lots"; return true; }
   if(!isHedge)
     {
      if(InpMinFreeMargin > 0.0 && freeAfter < InpMinFreeMargin)
        { why = "free margin after entry below " + RM_Money(InpMinFreeMargin); return true; }
      if(InpMinMarginLevel > 0.0)
        {
         double required = AccountFreeMargin() - freeAfter;
         double marginAfter = AccountMargin() + MathMax(0.0, required);
         if(marginAfter > 0.0 && AccountEquity() / marginAfter * 100.0 < InpMinMarginLevel)
           { why = "margin level after entry below " + DoubleToString(InpMinMarginLevel, 0) + "%"; return true; }
        }
     }
   return false;
  }

//+------------------------------------------------------------------+
//| Emergency stop on managed floating loss                           |
//+------------------------------------------------------------------+
bool RM_EmergencyHit(string &why)
  {
   if(InpEmergencyMode == RM_EMG_OFF || g_tot.totalCnt == 0)
      return false;
   if(InpEmergencyMode == RM_EMG_MONEY && g_drawdown >= InpEmergencyValue)
     {
      why = "managed loss " + RM_Money(g_drawdown) + " >= " + RM_Money(InpEmergencyValue);
      return true;
     }
   if(InpEmergencyMode == RM_EMG_PERCENT && g_ddPct >= InpEmergencyValue)
     {
      why = "managed loss " + DoubleToString(g_ddPct, 2) + "% of balance >= " + DoubleToString(InpEmergencyValue, 2) + "%";
      return true;
     }
   return false;
  }


//==== inlined: Include/RecoveryManagerPro/RM_Executor.mqh
//+------------------------------------------------------------------+
//| RM_Executor.mqh - executes closure plans through the persisted    |
//| transaction journal. MT4 multi-ticket closes are not atomic, so:  |
//|  - legs run most-profitable first (a failure leaves banked profit)|
//|  - the journal is saved after every confirmed leg                  |
//|  - before each leg the ticket is re-selected and reconciled with   |
//|    history, so a leg filled before a crash is recognised, not      |
//|    repeated, and its profit is counted exactly once                |
//|  - new entries are blocked while a journal is open                 |
//+------------------------------------------------------------------+

#define RM_MAX_JOURNAL_ATTEMPTS 20

int    g_lastPlanKind = RM_PLAN_NONE;
double g_lastPlanEst = 0.0;
double g_lastPlanReal = 0.0;
long   g_lastPlanTime = 0;

bool RM_JournalOpen()
  {
   return g_journal.status == RM_J_IN_PROGRESS;
  }

//+------------------------------------------------------------------+
//| true if the ticket is a not-yet-confirmed leg of the open journal |
//+------------------------------------------------------------------+
bool RM_JournalHasOpenLeg(int ticket)
  {
   if(!RM_JournalOpen())
      return false;
   for(int k = 0; k < g_journal.n; k++)
      if(g_journal.ticket[k] == ticket && g_journal.legDone[k] == 0)
         return true;
   return false;
  }

string RM_PlanSummary(const RM_Plan &p)
  {
   string s = RM_PlanKindName(p.kind) + ": ";
   for(int k = 0; k < p.n; k++)
     {
      if(k > 0)
         s += " | ";
      s += "#" + IntegerToString(p.ticket[k]) + " " + RM_RoleName(p.role[k]) + " " + RM_Side(p.type[k]) +
           " " + RM_Lots(p.closeLots[k]) + "/" + RM_Lots(p.ticketLots[k]) + " " + RM_Money(p.expectedPL[k]);
     }
   s += " || est net " + RM_Money(p.expectedNet) + " target " + RM_Money(p.target) + " " + AccountCurrency();
   return s;
  }

//+------------------------------------------------------------------+
//| Start a plan: write the journal first, then execute.              |
//+------------------------------------------------------------------+
bool RM_StartPlan(const RM_Plan &p)
  {
   if(RM_JournalOpen())
     {
      RM_Audit("PLAN_REFUSED", 0, 0, 0, "another transaction is still open");
      return false;
     }
   if(p.n <= 0)
      return false;
   g_planSeq++;
   RM_JournalFromPlan(g_journal, p, g_planSeq);
   g_journalStart = (long)TimeCurrent();
   RM_Audit("PLAN", 0, 0, p.expectedNet, "id " + IntegerToString(g_planSeq) + " " + RM_PlanSummary(p));
   RM_SaveState();
   RM_RunJournal();
   return true;
  }

//+------------------------------------------------------------------+
void RM_FinishJournal()
  {
   g_lastPlanKind = g_journal.kind;
   g_lastPlanEst = g_journal.estimatedNet;
   g_lastPlanReal = g_journal.realizedNet;
   g_lastPlanTime = (long)TimeCurrent();
   string st = (g_journal.status == RM_J_DONE) ? "PLAN_DONE" : "PLAN_ABORTED";
   RM_Audit(st, 0, 0, g_journal.realizedNet,
            "id " + IntegerToString(g_journal.planId) + " " + RM_PlanKindName(g_journal.kind) +
            " estimated " + RM_Money(g_journal.estimatedNet) + " realised " + RM_Money(g_journal.realizedNet));
   if(g_journal.kind == RM_PLAN_GROUP || g_journal.kind == RM_PLAN_OVERLAP || g_journal.kind == RM_PLAN_MANUAL ||
      g_journal.kind == RM_PLAN_REDUCE || g_journal.kind == RM_PLAN_BASKET)
      RM_AnnotGroup(g_journal.realizedNet);
   RM_JournalClear(g_journal);
   RM_SaveState();
  }

//+------------------------------------------------------------------+
//| Registry bookkeeping after a confirmed close of `ticket`.         |
//+------------------------------------------------------------------+
void RM_AfterClose(int ticket, double haveBefore, double closedLots, int child)
  {
   if(child > 0)
      RM_RegSplit(ticket, child);
   else if(haveBefore - closedLots > RM_EPS)
      RM_PendAdd(ticket);                 // remainder ticket not visible yet
   else
      RM_RegRemove(ticket);
  }

//+------------------------------------------------------------------+
//| Execute pending legs. Returns true when the journal is finished.  |
//+------------------------------------------------------------------+
bool RM_RunJournal()
  {
   if(!RM_JournalOpen())
      return true;
   for(int guard = 0; guard < RM_MAX_PLAN_LEGS; guard++)
     {
      int k = RM_JournalNextLeg(g_journal);
      if(k < 0)
         break;
      int ticket = g_journal.ticket[k];
      double want = RM_Clean(g_journal.targetLots[k] - g_journal.doneLots[k]);

      // ---- reconcile with broker truth before acting
      if(!OrderSelect(ticket, SELECT_BY_TICKET))
        {
         RM_JournalSkipLeg(g_journal, k);
         RM_RegRemove(ticket);
         RM_Audit("LEG_SKIP", ticket, 0, 0, "ticket unknown to terminal");
         RM_SaveState();
         continue;
        }
      if(OrderCloseTime() != 0)
        {
         double hl = OrderLots();
         double hn = OrderProfit() + OrderSwap() + OrderCommission();
         bool ours = ((long)OrderCloseTime() >= g_journalStart - 1) && MathAbs(hl - want) < RM_EPS + g_meta.lotStep * 0.5;
         if(ours)
           {
            // filled before the last save (e.g. crash): count it once, now
            RM_JournalMarkLeg(g_journal, k, hl, hn);
            RM_AddRealized(hn);
            int ch = RM_FindChild(ticket);
            RM_AfterClose(ticket, g_journal.ticketLots[k], hl, ch);
            RM_Audit("LEG_RECONCILED", ticket, hl, hn, "fill found in history");
           }
         else
           {
            RM_JournalSkipLeg(g_journal, k);
            RM_Audit("LEG_SKIP", ticket, hl, hn, "closed outside this plan");
           }
         RM_SaveState();
         continue;
        }
      double have = OrderLots();
      if(want > have + RM_EPS)
        {
         RM_Audit("LEG_ADJUST", ticket, have, 0, "ticket volume shrank from outside; closing remaining " + RM_Lots(have));
         want = have;
        }
      string why = "";
      if(!RM_TradeReady(why))
        {
         g_status = "Closure waiting: " + why;
         return false;                    // not an attempt; try next tick
        }
      double closed = 0, realized = 0;
      int child = 0;
      string err = "";
      if(RM_Close(ticket, want, closed, realized, child, err))
        {
         RM_JournalMarkLeg(g_journal, k, closed, realized);
         RM_AddRealized(realized);
         RM_AfterClose(ticket, have, closed, child);
         RM_AnnotConnector(ticket);
         RM_Audit("LEG_FILLED", ticket, closed, realized,
                  (child > 0) ? "remainder #" + IntegerToString(child) : "");
         RM_SaveState();
         continue;
        }
      g_journal.attempts++;
      RM_Audit("LEG_FAILED", ticket, want, 0, err + " (attempt " + IntegerToString(g_journal.attempts) + ")");
      g_status = "Closure retry: #" + IntegerToString(ticket) + " " + err;
      bool mustFinish = (g_journal.kind == RM_PLAN_CLOSE_ALL || g_journal.kind == RM_PLAN_BASKET);
      if(!mustFinish && g_journal.attempts >= RM_MAX_JOURNAL_ATTEMPTS)
        {
         RM_JournalAbort(g_journal);
         RM_Audit("PLAN_ABORT", 0, 0, g_journal.realizedNet, "too many failed attempts; realised legs stay booked once");
         RM_FinishJournal();
         return true;
        }
      RM_SaveState();
      return false;
     }
   RM_JournalRefresh(g_journal);
   if(g_journal.status != RM_J_IN_PROGRESS)
     {
      RM_FinishJournal();
      return true;
     }
   return false;
  }


//==== inlined: Include/RecoveryManagerPro/RM_Engine.mqh
//+------------------------------------------------------------------+
//| RM_Engine.mqh - state machine driver, launch preparation, lock,   |
//| grid engine, closure dispatch and operator actions.               |
//|                                                                   |
//| Per call order (tick, or init):                                   |
//|  1 refresh metadata, build book from broker truth                 |
//|  2 continue any open transaction journal                          |
//|  3 emergency / basket-TP / launch evaluation                      |
//|  4 pure state transition (RM_NextState) + side effects            |
//|  5 state action (prepare / lock / recover / close)                |
//|  6 previews for the dashboard (same snapshot)                     |
//+------------------------------------------------------------------+

double g_nextLevel[2];          // next prospective grid entry per direction (0 = none)
int    g_prepTries = 0;
uint   g_lastPreviewMs = 0;
bool   g_emgLatched = false;

//+------------------------------------------------------------------+
void RM_InitRuntime()
  {
   g_state = RM_ST_IDLE;
   g_stateBeforePause = RM_ST_RECOVERING;
   g_lastEntryBar[0] = 0; g_lastEntryBar[1] = 0;
   g_highIndex[0] = -1;   g_highIndex[1] = -1;
   g_nextLevel[0] = 0;    g_nextLevel[1] = 0;
   RM_JournalClear(g_journal);
   RM_PlanReset(g_curGroup, RM_PLAN_NONE);
   RM_PlanReset(g_reducePreview, RM_PLAN_REDUCE);
   RM_PlanReset(g_confirmPlan, RM_PLAN_NONE);
   g_regCount = 0;
   g_pendCount = 0;
   RM_DayRoll();
  }

void RM_ResetSession()
  {
   g_regCount = 0;
   g_pendCount = 0;
   g_sessionId = 0;
   g_launchDone = false; g_prepDone = false; g_lockDone = false;
   g_pendingsDone = false; g_sltpDone = false; g_financeDone = false; g_chartsDone = false;
   g_closeRequested = false; g_launchNotified = false;
   g_highIndex[0] = -1; g_highIndex[1] = -1;
   g_lockResidual = 0.0;
   g_emgLatched = false;
   g_peakDrawdown = 0.0;
  }

int RM_MainCount()
  {
   return g_tot.mainBuyCnt + g_tot.mainSellCnt;
  }

//+------------------------------------------------------------------+
//| Executable hedge still missing on the main position?              |
//+------------------------------------------------------------------+
bool RM_LockGap(double &vol, int &dir, double &residual)
  {
   vol = RM_LockVolume(g_tot.mainBuyLots, g_tot.mainSellLots, g_meta, dir, residual);
   return vol > 0.0;
  }

//+------------------------------------------------------------------+
//| Side effects of entering a new state                              |
//+------------------------------------------------------------------+
void RM_EnterState(int ns)
  {
   int old = g_state;
   if(ns == RM_ST_PAUSED && old != RM_ST_PAUSED)
      g_stateBeforePause = old;
   if(ns == RM_ST_PREPARING && !g_launchDone)
     {
      g_launchDone = true;                     // launch fires exactly once per session
      g_sessionId = (long)TimeCurrent();
      g_realizedSession = 0.0;
      g_prepTries = 0;
      if(!g_launchNotified)
        {
         RM_Notify("recovery launched, managed P/L " + RM_Money(g_managedNet) + " " + AccountCurrency());
         g_launchNotified = true;
        }
     }
   if(ns == RM_ST_LOCKING && old == RM_ST_RECOVERING)
      g_lockDone = false;                      // explicit re-lock after an imbalance
   if(old == RM_ST_ERROR_HOLD && ns != RM_ST_ERROR_HOLD)
     {
      g_errorCondition = false;
      g_errorText = "";
     }
   g_state = ns;
   RM_Audit("STATE", 0, 0, g_managedNet, RM_StateName(old) + " -> " + RM_StateName(ns) +
            (ns == RM_ST_ERROR_HOLD ? " (" + g_errorText + ")" : ""));
   if(ns == RM_ST_COMPLETE)
     {
      RM_Notify("recovery complete, session realised " + RM_Money(g_realizedSession) + " " + AccountCurrency());
      RM_Audit("SESSION_END", 0, 0, g_realizedSession, "managed basket empty");
      RM_ResetSession();
     }
   RM_SaveState();
  }

//+------------------------------------------------------------------+
//| Operator resume from ERROR_HOLD: explicitly accept unresolved      |
//| lineage (the parent entry is dropped and logged).                 |
//+------------------------------------------------------------------+
void RM_AcceptErrorResolution()
  {
   for(int i = g_pendCount - 1; i >= 0; i--)
     {
      int p = g_pendParent[i];
      RM_Audit("LINEAGE_DROPPED", p, 0, 0, "operator resumed; remainder of #" + IntegerToString(p) + " is no longer tracked");
      RM_RegRemove(p);
      RM_PendRemove(p);
     }
   g_errorCondition = false;
   g_errorText = "";
  }

//+------------------------------------------------------------------+
//| Main driver                                                       |
//+------------------------------------------------------------------+
void RM_Engine()
  {
   if(g_busy)
      return;
   g_busy = true;
   RM_RefreshMeta();
   datetime bar0 = iTime(g_sym, 0, 0);
   if(bar0 != g_lastBarSeen)
     {
      g_lastBarSeen = bar0;
      g_testBars++;
     }
   g_entriesThisTick = 0;
   g_status = "";
   int tradesAtStart = g_tradeEvents;
   if(RM_BuildBook())
      RM_SaveState();

   if(RM_JournalOpen() && g_state != RM_ST_ERROR_HOLD)
      RM_RunJournal();

   // ---- emergency stop (precedence: emergency > pause > automation)
   string ew = "";
   bool emg = RM_EmergencyHit(ew);
   bool emgEligible = (g_state == RM_ST_ARMED || g_state == RM_ST_PREPARING || g_state == RM_ST_LOCKING ||
                       g_state == RM_ST_RECOVERING || (g_state == RM_ST_PAUSED && InpEmergencyOverPause));
   if(emg && emgEligible && !g_emgLatched)
     {
      g_emgLatched = true;
      RM_Audit("EMERGENCY", 0, 0, g_managedNet, ew);
      RM_Notify("EMERGENCY: " + ew);
      if(InpEmergencyAction == RM_EMGA_CLOSE_ALL)
         g_closeRequested = true;
      else if(g_state != RM_ST_PAUSED)
         g_pauseRequested = true;
     }
   if(!emg)
      g_emgLatched = false;

   // ---- whole-basket exit
   if(InpBasketTP && !g_closeRequested && !RM_JournalOpen() &&
      (g_state == RM_ST_RECOVERING || g_state == RM_ST_LOCKING))
     {
      RM_PlanAll(g_book, g_cfg, g_mpp, RM_PLAN_BASKET, InpBasketTPMoney, g_plan);
      if(g_plan.qualifies && g_plan.n > 0)
        {
         g_closeRequested = true;
         RM_Audit("BASKET_TP", 0, 0, g_plan.expectedNet, "whole basket expected net reaches " + RM_Money(InpBasketTPMoney));
        }
     }

   // ---- state transition
   double lv, lres; int ldir;
   bool gap = RM_LockGap(lv, ldir, lres);
   RM_StateInput si;
   si.state = g_state;
   si.hasManaged = (g_tot.totalCnt > 0);
   si.hasMain = (RM_MainCount() > 0);
   si.launchDone = g_launchDone;
   si.launchTriggered = RM_LaunchTriggered(InpLaunchMode, g_managedNet, AccountBalance(),
                                           InpLaunchDrawdown, g_tot.origCnt > 0);
   si.prepDone = g_prepDone;
   si.lockingEnabled = InpLocking;
   si.lockDone = g_lockDone;
   si.mainImbalanced = gap;
   si.relockOnImbalance = InpRelockOnImbalance;
   si.journalOpen = RM_JournalOpen();
   si.closeRequested = g_closeRequested;
   si.pauseRequested = g_pauseRequested;
   si.resumeRequested = g_resumeRequested;
   si.errorCondition = g_errorCondition && !g_resumeRequested;
   si.stateBeforePause = g_stateBeforePause;
   if(g_state == RM_ST_ERROR_HOLD && g_resumeRequested)
      RM_AcceptErrorResolution();
   int ns = RM_NextState(si);
   g_pauseRequested = false;
   g_resumeRequested = false;
   if(ns != g_state)
      RM_EnterState(ns);

   // ---- state action
   switch(g_state)
     {
      case RM_ST_IDLE:
         g_status = (g_tot.totalCnt == 0) ? "No orders to recover" :
                    "Recovery orders without a main position - Close All or Close Current Group";
         break;
      case RM_ST_ARMED:
         if(InpLaunchMode == RM_LAUNCH_DD_PERCENT)
            g_status = "Armed: drawdown " + DoubleToString(g_ddPct, 2) + "% / launch at " + DoubleToString(InpLaunchDrawdown, 2) + "%";
         else if(InpLaunchMode == RM_LAUNCH_DD_MONEY)
            g_status = "Armed: drawdown " + RM_Money(g_drawdown) + " / launch at " + RM_Money(InpLaunchDrawdown);
         else
            g_status = "Armed: launching";
         break;
      case RM_ST_PREPARING:  RM_DoPrepare();  break;
      case RM_ST_LOCKING:    RM_DoLock();     break;
      case RM_ST_RECOVERING: RM_DoRecover();  break;
      case RM_ST_CLOSING:    RM_DoClosing();  break;
      case RM_ST_PAUSED:
         g_status = "Paused: automated opening and closing stopped";
         break;
      case RM_ST_ERROR_HOLD:
         g_status = "ERROR HOLD: " + g_errorText + " - press Resume after checking the orders";
         break;
     }
   // trades this tick changed the book: refresh so panel and previews show broker truth
   if(g_tradeEvents != tradesAtStart)
      RM_BuildBook();
   RM_UpdatePreviews(g_tradeEvents != tradesAtStart);
   RM_AnnotLevels();
   g_busy = false;
  }

//+------------------------------------------------------------------+
//| PREPARING: one-time launch actions, each flag persisted           |
//+------------------------------------------------------------------+
void RM_DoPrepare()
  {
   g_prepTries++;
   if(!g_chartsDone)
     {
      if(InpOtherEAs != RM_OTHER_KEEP && InpAllowChartClosure)
         RM_PreviewChartClosure(true);
      g_chartsDone = true;
      RM_SaveState();
     }
   if(!g_pendingsDone)
     {
      bool allOk = true;
      if(InpDeletePending)
         for(int i = OrdersTotal() - 1; i >= 0; i--)
           {
            if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
               continue;
            if(OrderSymbol() != g_sym || OrderType() <= OP_SELL)
               continue;
            if(!RM_InScope(OrderMagicNumber()) || RM_ForeignRmpComment(OrderComment()))
               continue;
            int t = OrderTicket();
            double pl = OrderLots();
            string err = "";
            if(RM_DeletePending(t, err))
               RM_Audit("PENDING_DELETED", t, pl, 0, "launch clean-up");
            else
              {
               allOk = false;
               RM_Audit("PENDING_DELETE_FAILED", t, 0, 0, err);
              }
           }
      if(allOk || g_prepTries > 10)
        {
         g_pendingsDone = true;
         RM_SaveState();
        }
      else
        {
         g_status = "Preparing: deleting pending orders";
         return;
        }
     }
   if(!g_sltpDone)
     {
      bool ok2 = true;
      if(InpDeleteSLTP != RM_SLTP_KEEP)
         ok2 = RM_ClearManagedSLTP();
      if(ok2 || g_prepTries > 20)
        {
         g_sltpDone = true;
         RM_SaveState();
        }
      else
        {
         g_status = "Preparing: removing SL/TP";
         return;
        }
     }
   if(!g_financeDone)
     {
      if(RM_JournalOpen())
        {
         g_status = "Preparing: closing profitable orders";
         return;
        }
      if(InpCloseProfitable)
        {
         RM_PlanReduce(g_book, g_cfg, g_meta, g_mpp, false, RM_PLAN_LAUNCH, g_plan);
         if(g_plan.qualifies && g_plan.n > 0)
            RM_StartPlan(g_plan);
         else
            RM_Audit("LAUNCH_FINANCE", 0, 0, 0, "nothing affordable (" + RM_ReasonName(g_plan.reason) + ")");
        }
      g_financeDone = true;
      RM_SaveState();
      if(RM_JournalOpen())
         return;
     }
   if(RM_JournalOpen())
      return;
   g_prepDone = true;
   RM_SaveState();
   g_status = "Prepared";
  }

//+------------------------------------------------------------------+
//| Remove SL/TP from ORIGINAL orders; true when none remain.         |
//+------------------------------------------------------------------+
bool RM_ClearManagedSLTP()
  {
   bool ok = true;
   for(int i = 0; i < g_book.n; i++)
     {
      if(g_book.role[i] != RM_ROLE_ORIGINAL)
         continue;
      int t = g_book.ticket[i];
      if(!OrderSelect(t, SELECT_BY_TICKET) || OrderCloseTime() != 0)
         continue;
      if(OrderStopLoss() == 0.0 && OrderTakeProfit() == 0.0)
         continue;
      string err = "";
      if(RM_ClearSLTP(t, err))
         RM_Audit("SLTP_REMOVED", t, OrderLots(), 0, "");
      else
        {
         ok = false;
         RM_Audit("SLTP_REMOVE_FAILED", t, 0, 0, err);
        }
     }
   return ok;
  }

//+------------------------------------------------------------------+
//| LOCKING: hedge the NET main exposure only (recovery excluded).    |
//| One order per call; the next tick re-reads broker truth before    |
//| any further hedge, so a partial/uncertain fill is never doubled.  |
//+------------------------------------------------------------------+
void RM_DoLock()
  {
   if(RM_JournalOpen())
      return;
   if(!InpLocking)
     {
      g_lockDone = true;
      RM_SaveState();
      return;
     }
   double vol, residual; int dir;
   if(!RM_LockGap(vol, dir, residual))
     {
      g_lockDone = true;
      g_lockResidual = residual;
      if(residual > RM_EPS)
         RM_Audit("LOCK_RESIDUAL", 0, residual, 0, "main exposure NOT neutral: " + RM_Lots(residual) + " lots cannot be hedged (below lot step/minimum)");
      else
         RM_Audit("LOCKED", 0, g_tot.mainBuyLots, g_tot.mainSellLots, "main BUY lots == main SELL lots");
      RM_SaveState();
      return;
     }
   double chunk = vol;
   double maxL = RM_NormalizeLot(g_meta.maxLot, g_meta, RM_ROUND_DOWN);
   if(maxL > 0.0 && chunk > maxL)
      chunk = maxL;
   string why = "";
   if(RM_NewExposureBlocked(dir, chunk, true, why))
     {
      g_status = "Lock blocked: " + why;
      g_block = g_status;
      return;
     }
   g_reqSeq++;
   string tag = "#" + IntegerToString(g_reqSeq);
   string cmt = RM_CommentPrefix() + "L " + tag;
   RM_SaveState();                    // persist the tag counter before sending
   string err = "";
   int t = RM_Send(dir, chunk, InpLockMagic, cmt, tag, err);
   if(t > 0)
     {
      if(OrderSelect(t, SELECT_BY_TICKET))
         RM_RegAdd(t, RM_ROLE_LOCK, dir, OrderLots(), 0, 0, OrderOpenPrice(), (long)OrderOpenTime());
      RM_Audit("LOCK_OPEN", t, chunk, 0, RM_Side(dir) + " hedge for net main exposure");
      RM_SaveState();
     }
   else
     {
      g_status = "Lock failed: " + err;
      RM_Audit("LOCK_FAILED", 0, chunk, 0, err);
     }
  }

//+------------------------------------------------------------------+
//| RECOVERING: closures first, then entries                          |
//+------------------------------------------------------------------+
void RM_DoRecover()
  {
   if(RM_JournalOpen())
     {
      g_status = "Completing closure transaction";
      return;
     }
   if(InpDeleteSLTP == RM_SLTP_CONTINUOUS)
      RM_ClearManagedSLTP();
   g_cfg.matchedMain = InpLocking && g_tot.mainBuyCnt > 0 && g_tot.mainSellCnt > 0;
   // ---- automatic closure: best qualifying group
   int best = -1;
   double bestSurplus = 0.0;
   for(int d = 0; d < 2; d++)
     {
      int cnt = (d == RM_BUY) ? g_tot.recBuyCnt : g_tot.recSellCnt;
      if(cnt == 0)
         continue;
      RM_PlanGroup(g_book, g_cfg, g_meta, g_mpp, d, g_plan);
      if(!g_plan.qualifies)
         continue;
      double surplus = g_plan.expectedNet - g_plan.target;
      if(best < 0 || surplus > bestSurplus)
        {
         best = d;
         bestSurplus = surplus;
        }
     }
   if(best >= 0)
     {
      RM_PlanGroup(g_book, g_cfg, g_meta, g_mpp, best, g_plan);
      RM_StartPlan(g_plan);
      return;
     }
   RM_GridEntries();
  }

//+------------------------------------------------------------------+
//| Last (most recent) recovery order of a direction                  |
//+------------------------------------------------------------------+
int RM_LastRecovery(int dir)
  {
   int best = -1;
   for(int i = 0; i < g_book.n; i++)
     {
      if(g_book.role[i] != RM_ROLE_RECOVERY || g_book.type[i] != dir)
         continue;
      if(best < 0 || g_book.openTime[i] > g_book.openTime[best] ||
         (g_book.openTime[i] == g_book.openTime[best] && g_book.ticket[i] > g_book.ticket[best]))
         best = i;
     }
   return best;
  }

int RM_NextGridIndex(int dir)
  {
   int cnt = (dir == RM_BUY) ? g_tot.recBuyCnt : g_tot.recSellCnt;
   if(cnt == 0)
      return 0;
   if(InpOverlapIndex == RM_OVIDX_CONTINUE)
      return MathMax(cnt, g_highIndex[dir] + 1);
   return cnt;
  }

//+------------------------------------------------------------------+
//| Grid entry engine (PROPOSED adverse-move anchor rule)             |
//+------------------------------------------------------------------+
void RM_GridEntries()
  {
   g_block = "";
   g_nextLevel[0] = 0; g_nextLevel[1] = 0;
   if(RM_MainCount() == 0)
     {
      g_status = "Main position closed - remaining recovery orders close at target";
      return;
     }
   double lv, lres; int ldir;
   if(InpLocking && RM_LockGap(lv, ldir, lres))
     {
      g_block = "main exposure unequal by " + RM_Lots(lv) + " lots - entries blocked until re-locked";
      g_status = g_block;
      return;
     }
   // continue existing baskets
   for(int d = 0; d < 2; d++)
     {
      int cnt = (d == RM_BUY) ? g_tot.recBuyCnt : g_tot.recSellCnt;
      if(cnt > 0)
         RM_TryAverage(d);
     }
   // start new basket(s)
   if(g_entriesThisTick < InpMaxEntriesPerEvent)
      RM_TryNewBasket();
   if(g_status == "")
      g_status = (g_block != "") ? g_block : "Recovering: waiting for grid level / close target";
  }

void RM_TryAverage(int dir)
  {
   int last = RM_LastRecovery(dir);
   if(last < 0)
      return;
   int idx = RM_NextGridIndex(dir);
   double step = RM_GridStepPoints(InpGridStepPoints, InpStepMultiplier, idx);
   double level = RM_GridNextLevel(dir, g_book.openPrice[last], step, g_meta.point);
   g_nextLevel[dir] = level;
   if(!RM_GridTriggered(dir, RM_Bid(), RM_Ask(), level))
      return;
   if(g_entriesThisTick >= InpMaxEntriesPerEvent)
      return;
   if(!RM_DirectionAllowed(dir, InpRecoveryDirs, false, InpMultidirectional, g_tot.recBuyCnt, g_tot.recSellCnt))
      return;
   if(!RM_BarGateOpen(InpOnePerBar, g_lastEntryBar[dir], (long)iTime(g_sym, 0, 0)))
     {
      g_block = RM_Side(dir) + " level reached - one order per bar";
      return;
     }
   if(!RM_SignalAllows(dir, false))
     {
      g_block = RM_Side(dir) + " level reached - waiting for " + RM_SignalName();
      return;
     }
   RM_OpenRecovery(dir, idx, false, 0.0);
  }

void RM_TryNewBasket()
  {
   bool can[2];
   can[0] = false;
   can[1] = false;
   for(int d = 0; d < 2; d++)
     {
      int cnt = (d == RM_BUY) ? g_tot.recBuyCnt : g_tot.recSellCnt;
      can[d] = (cnt == 0) &&
               RM_DirectionAllowed(d, InpRecoveryDirs, false, InpMultidirectional, g_tot.recBuyCnt, g_tot.recSellCnt) &&
               RM_BarGateOpen(InpOnePerBar, g_lastEntryBar[d], (long)iTime(g_sym, 0, 0)) &&
               RM_SignalAllows(d, true);
     }
   if(!can[0] && !can[1])
      return;
   if(can[0] && can[1] && !InpMultidirectional)
     {
      int pick = RM_BUY;
      if(InpFirstDirection == RM_FD_SELL)
         pick = RM_SELL;
      else if(InpFirstDirection == RM_FD_LAST_CANDLE)
         pick = (iClose(g_sym, 0, 1) >= iOpen(g_sym, 0, 1)) ? RM_BUY : RM_SELL;
      can[1 - pick] = false;
     }
   for(int d2 = 0; d2 < 2; d2++)
      if(can[d2] && g_entriesThisTick < InpMaxEntriesPerEvent)
         RM_OpenRecovery(d2, 0, false, 0.0);
  }

//+------------------------------------------------------------------+
//| Open one recovery order. manualLot > 0 overrides the grid lot.    |
//+------------------------------------------------------------------+
bool RM_OpenRecovery(int dir, int idx, bool manual, double manualLot)
  {
   double raw = manual ? manualLot : RM_GridRawLot(InpFirstLot, InpLotMultiplier, idx);
   if(InpCapBehavior == RM_CAP_REFUSE && raw > g_meta.maxLot + RM_EPS)
     {
      g_block = "recovery lot " + DoubleToString(raw, 3) + " exceeds broker maximum - refused";
      return false;
     }
   double lot = RM_NormalizeLot(raw, g_meta, InpLotRounding);
   if(lot <= 0.0)
     {
      g_block = "recovery lot " + DoubleToString(raw, 3) + " below broker minimum";
      return false;
     }
   if(RM_LotExceedsCap(lot, InpMaxRecoveryLot))
     {
      if(InpCapBehavior == RM_CAP_REFUSE)
        {
         g_block = "recovery lot " + RM_Lots(lot) + " exceeds maximum " + RM_Lots(InpMaxRecoveryLot) + " - refused";
         RM_Audit("ENTRY_REFUSED", 0, lot, 0, g_block);
         return false;
        }
      lot = RM_NormalizeLot(InpMaxRecoveryLot, g_meta, RM_ROUND_DOWN);
      if(lot <= 0.0)
         return false;
     }
   if(g_tot.recBuyCnt + g_tot.recSellCnt >= InpMaxRecoveryCount)
     {
      g_block = "maximum recovery order count " + IntegerToString(InpMaxRecoveryCount) + " reached";
      return false;
     }
   if(InpMaxRecoveryLotsSum > 0.0 && g_tot.recBuyLots + g_tot.recSellLots + lot > InpMaxRecoveryLotsSum + RM_EPS)
     {
      g_block = "maximum total recovery lots " + RM_Lots(InpMaxRecoveryLotsSum) + " reached";
      return false;
     }
   string why = "";
   if(RM_NewExposureBlocked(dir, lot, false, why))
     {
      g_block = why;
      return false;
     }
   g_reqSeq++;
   string tag = "#" + IntegerToString(g_reqSeq);
   string cmt = RM_CommentPrefix() + "R " + (dir == RM_BUY ? "B" : "S") + " " + IntegerToString(idx) + " " + tag;
   long barId = (long)iTime(g_sym, 0, 0);
   RM_SaveState();
   string err = "";
   int t = RM_Send(dir, lot, InpRecoveryMagic, cmt, tag, err);
   if(t <= 0 && StringFind(err, "uncertain") >= 0 && !manual)
     {
      // may exist: consume the bar so a retry cannot add a second order
      g_lastEntryBar[dir] = barId;
      RM_SaveState();
     }
   if(t <= 0)
     {
      g_block = "entry failed: " + err;
      RM_Audit("ENTRY_FAILED", 0, lot, 0, RM_Side(dir) + " idx " + IntegerToString(idx) + ": " + err);
      return false;
     }
   if(OrderSelect(t, SELECT_BY_TICKET))
      RM_RegAdd(t, RM_ROLE_RECOVERY, dir, OrderLots(), idx, 0, OrderOpenPrice(), (long)OrderOpenTime());
   if(!manual)
      g_lastEntryBar[dir] = barId;
   // a new basket (index 0) restarts the sequence; otherwise keep the highest index used
   if(idx == 0 || idx > g_highIndex[dir])
      g_highIndex[dir] = idx;
   g_entriesThisTick++;
   RM_Audit(manual ? "MANUAL_RECOVERY" : "ENTRY", t, lot, raw,
            RM_Side(dir) + " idx " + IntegerToString(idx) + " raw lot " + DoubleToString(raw, 4));
   RM_SaveState();
   RM_BuildBook();
   return true;
  }

//+------------------------------------------------------------------+
//| CLOSING: close every managed ticket through the journal           |
//+------------------------------------------------------------------+
void RM_DoClosing()
  {
   g_status = "Closing all managed orders";
   if(RM_JournalOpen())
      return;
   if(g_tot.totalCnt == 0)
      return;
   RM_PlanAll(g_book, g_cfg, g_mpp, RM_PLAN_CLOSE_ALL, -1.0, g_plan);
   if(g_plan.n > 0)
      RM_StartPlan(g_plan);
  }

//+------------------------------------------------------------------+
//| Dashboard previews computed from the same snapshot                |
//+------------------------------------------------------------------+
void RM_UpdatePreviews(bool force)
  {
   uint now = GetTickCount();
   if(!force && now - g_lastPreviewMs < 250 && !IsTesting())
      return;
   g_lastPreviewMs = now;
   g_cfg.matchedMain = InpLocking && g_tot.mainBuyCnt > 0 && g_tot.mainSellCnt > 0;
   RM_PlanReset(g_curGroup, RM_PLAN_NONE);
   bool have = false;
   for(int d = 0; d < 2; d++)
     {
      int cnt = (d == RM_BUY) ? g_tot.recBuyCnt : g_tot.recSellCnt;
      if(cnt == 0)
         continue;
      RM_PlanGroup(g_book, g_cfg, g_meta, g_mpp, d, g_plan);
      if(!have || g_plan.expectedNet - g_plan.target > g_curGroup.expectedNet - g_curGroup.target)
        {
         g_curGroup = g_plan;
         have = true;
        }
     }
   RM_PlanReduce(g_book, g_cfg, g_meta, g_mpp, g_cfg.matchedMain, RM_PLAN_REDUCE, g_reducePreview);
  }

//+------------------------------------------------------------------+
//| Operator actions                                                  |
//+------------------------------------------------------------------+
bool RM_ManualAllowed(string &why)
  {
   if(g_state == RM_ST_CLOSING)
     { why = "closing in progress"; return false; }
   if(g_state == RM_ST_ERROR_HOLD)
     { why = "error hold - resolve first"; return false; }
   if(RM_JournalOpen())
     { why = "a closure transaction is still open"; return false; }
   return true;
  }

bool RM_ActionOpen(int dir, bool asRecovery, double lotInput, string &msg)
  {
   string why = "";
   if(!RM_ManualAllowed(why))
     { msg = why; return false; }
   double lot = RM_NormalizeLot(lotInput, g_meta, RM_ROUND_DOWN);
   if(lot <= 0.0)
     { msg = "volume below broker minimum " + RM_Lots(g_meta.minLot); return false; }
   if(MathAbs(lot - lotInput) > RM_EPS)
     { msg = "volume must be a multiple of the lot step " + DoubleToString(g_meta.lotStep, 2); return false; }
   if(asRecovery)
     {
      if(!RM_DirectionAllowed(dir, InpRecoveryDirs, true, InpMultidirectional, g_tot.recBuyCnt, g_tot.recSellCnt))
        { msg = "multidirectional recovery is off and the opposite basket is active"; return false; }
      if(RM_MainCount() == 0)
        { msg = "no main position to recover"; return false; }
      bool ok = RM_OpenRecovery(dir, RM_NextGridIndex(dir), true, lot);
      msg = ok ? "manual RECOVERY " + RM_Side(dir) + " " + RM_Lots(lot) + " opened" : g_block;
      return ok;
     }
   if(RM_NewExposureBlocked(dir, lot, false, why))
     { msg = why; return false; }
   g_reqSeq++;
   string tag = "#" + IntegerToString(g_reqSeq);
   string cmt = RM_CommentPrefix() + "O " + tag;
   RM_SaveState();
   string err = "";
   int t = RM_Send(dir, lot, InpManualOriginalMagic, cmt, tag, err);
   if(t <= 0)
     { msg = "open failed: " + err; RM_Audit("MANUAL_FAILED", 0, lot, 0, err); return false; }
   if(OrderSelect(t, SELECT_BY_TICKET))
      RM_RegAdd(t, RM_ROLE_ORIGINAL, dir, OrderLots(), 0, 0, OrderOpenPrice(), (long)OrderOpenTime());
   RM_Audit("MANUAL_ORIGINAL", t, lot, 0, RM_Side(dir));
   RM_SaveState();
   msg = "manual ORIGINAL " + RM_Side(dir) + " " + RM_Lots(lot) + " opened (#" + IntegerToString(t) + ")";
   return true;
  }

void RM_ActionStopResume()
  {
   if(g_state == RM_ST_PAUSED || g_state == RM_ST_ERROR_HOLD)
     {
      g_resumeRequested = true;
      RM_Audit("OPERATOR", 0, 0, 0, "resume requested");
     }
   else
     {
      g_pauseRequested = true;
      RM_Audit("OPERATOR", 0, 0, 0, "stop recovery requested");
     }
   RM_Engine();
  }

bool RM_ActionCloseAll(string &msg)
  {
   if(g_tot.totalCnt == 0)
     { msg = "nothing to close"; return false; }
   if(g_state == RM_ST_ERROR_HOLD)
     { msg = "error hold: check the orders, press Resume, then Close All"; return false; }
   g_closeRequested = true;
   RM_Audit("OPERATOR", 0, g_tot.totalLots, g_tot.totalPL, "close all managed orders");
   RM_SaveState();
   RM_Engine();
   msg = "closing all managed orders";
   return true;
  }

bool RM_ActionExecutePlan(RM_Plan &p, string &msg)
  {
   string why = "";
   if(!RM_ManualAllowed(why))
     { msg = why; return false; }
   if(p.n == 0)
     { msg = "nothing to close (" + RM_ReasonName(p.reason) + ")"; return false; }
   RM_Audit("OPERATOR", 0, 0, p.expectedNet, "execute " + RM_PlanKindName(p.kind));
   RM_StartPlan(p);
   msg = RM_PlanKindName(p.kind) + " sent, estimated " + RM_Money(p.expectedNet) + " " + AccountCurrency();
   return true;
  }

//+------------------------------------------------------------------+
//| Other-EA charts: preview (always) and closure (explicit only)     |
//+------------------------------------------------------------------+
void RM_PreviewChartClosure(bool execute)
  {
   g_chartPreview = "";
   if(InpOtherEAs == RM_OTHER_KEEP || IsTesting())
      return;
   long id = ChartFirst();
   int n = 0;
   while(id >= 0)
     {
      long nextId = ChartNext(id);
      if(id != g_chartId)
        {
         // MQL4 exposes no "expert name" chart property: selection is by symbol only
         bool sameSym = (ChartSymbol(id) == g_sym);
         if(InpOtherEAs == RM_OTHER_CLOSE_ALL_EA || sameSym)
           {
            string desc = ChartSymbol(id) + "/" + IntegerToString(ChartPeriod(id));
            g_chartPreview += desc + " ";
            n++;
            if(execute)
              {
               RM_Audit("CHART_CLOSED", 0, 0, 0, desc);
               ChartClose(id);
              }
           }
        }
      id = nextId;
     }
   if(!execute)
      RM_Audit("CHART_PREVIEW", 0, 0, n, "at launch would close: " + (n > 0 ? g_chartPreview : "none"));
  }

//+------------------------------------------------------------------+
//| Strategy Tester only: deterministic seed orders                   |
//+------------------------------------------------------------------+
void RM_TestSeeds()
  {
   if(!InpEnableTestSeeds || g_seedDone || InpTestSeedScenario == RM_SEED_NONE)
      return;
   if(!IsTesting())
     {
      if(!g_seedDone)
         Print("RMP: test seeds are ignored outside the Strategy Tester");
      g_seedDone = true;
      return;
     }
   if(g_testBars < InpTestSeedBar)
      return;
   g_seedDone = true;
   double l = RM_NormalizeLot(InpTestSeedLots, g_meta, RM_ROUND_DOWN);
   string err = "";
   if(InpTestSeedScenario == RM_SEED_ONE_BUY || InpTestSeedScenario == RM_SEED_BALANCED_HEDGE)
      RM_Send(OP_BUY, l, InpTestSeedMagic, "TEST SEED B #s1", "#s1", err);
   if(InpTestSeedScenario == RM_SEED_ONE_SELL || InpTestSeedScenario == RM_SEED_BALANCED_HEDGE)
      RM_Send(OP_SELL, l, InpTestSeedMagic, "TEST SEED S #s2", "#s2", err);
   if(InpTestSeedScenario == RM_SEED_UNBALANCED_MIX)
     {
      RM_Send(OP_BUY, RM_NormalizeLot(l * 2.0, g_meta, RM_ROUND_DOWN), InpTestSeedMagic, "TEST SEED B #s3", "#s3", err);
      RM_Send(OP_SELL, l, InpTestSeedMagic, "TEST SEED S #s4", "#s4", err);
     }
   Print("RMP TEST SEED scenario ", EnumToString(InpTestSeedScenario), " opened (", err, ")");
  }


//==== inlined: Include/RecoveryManagerPro/RM_Annotations.mqh
//+------------------------------------------------------------------+
//| RM_Annotations.mqh - chart objects outside the panels:            |
//|  - closed-profit labels (yellow), with collision avoidance        |
//|  - dotted open->close connectors for closed legs                  |
//|  - prospective recovery entry levels (blue BUY / orange SELL)     |
//|  - optional possible-close line (a DIFFERENT object: estimated    |
//|    price where the current group reaches its target)              |
//| All objects use the RMP_A_ prefix and are removed on deinit.      |
//+------------------------------------------------------------------+

#define RM_APFX       "RMP_A_"
#define RM_MAX_LABELS 150

int    g_labelSeq = 0;
int    g_labelX[RM_MAX_LABELS];
int    g_labelY[RM_MAX_LABELS];
string g_labelName[RM_MAX_LABELS];
int    g_labelN = 0;
// panel rectangles published by the dashboard (x, y, w, h)
int    g_panelRect[3][4];
color  g_savedColors[8];
bool   g_colorsSaved = false;

bool RM_PointInPanels(int x, int y)
  {
   for(int i = 0; i < 3; i++)
     {
      if(g_panelRect[i][2] <= 0)
         continue;
      if(x >= g_panelRect[i][0] - 4 && x <= g_panelRect[i][0] + g_panelRect[i][2] + 4 &&
         y >= g_panelRect[i][1] - 4 && y <= g_panelRect[i][1] + g_panelRect[i][3] + 4)
         return true;
     }
   return false;
  }

bool RM_NearOtherLabel(int x, int y)
  {
   for(int i = 0; i < g_labelN; i++)
      if(MathAbs(g_labelX[i] - x) < 60 && MathAbs(g_labelY[i] - y) < 14)
         return true;
   return false;
  }

//+------------------------------------------------------------------+
//| Place a text label near (time, price), moving it vertically until |
//| it neither covers a panel nor another recent label.               |
//+------------------------------------------------------------------+
void RM_PlaceLabel(datetime t, double price, string text, color clr)
  {
   if(InpAnnotations == RM_ANNOT_OFF)
      return;
   if(InpAnnotations == RM_ANNOT_LOG || IsOptimization())
     {
      Print("RMP result ", text);
      return;
     }
   int x = 0, y = 0;
   double p = price;
   if(ChartTimePriceToXY(0, 0, t, p, x, y))
     {
      int dy = 0;
      for(int tries = 0; tries < 12; tries++)
        {
         int yy = y - dy;
         if(!RM_PointInPanels(x, yy) && !RM_NearOtherLabel(x, yy))
           {
            int sub; datetime tt; double pp;
            if(ChartXYToTimePrice(0, x, yy, sub, tt, pp))
               p = pp;
            y = yy;
            break;
           }
         dy = (tries % 2 == 0) ? -(tries / 2 + 1) * 16 : (tries / 2 + 1) * 16;
        }
     }
   g_labelSeq++;
   // time-stamped names stay unique across re-initialisation (timeframe change keeps old labels)
   string name = RM_APFX + "L" + IntegerToString((long)TimeCurrent()) + "_" + IntegerToString(g_labelSeq);
   if(ObjectCreate(0, name, OBJ_TEXT, 0, t, p))
     {
      ObjectSetString(0, name, OBJPROP_TEXT, text);
      ObjectSetString(0, name, OBJPROP_FONT, "Arial Bold");
      ObjectSetInteger(0, name, OBJPROP_FONTSIZE, InpFontSize + 1);
      ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
      ObjectSetInteger(0, name, OBJPROP_ANCHOR, ANCHOR_LEFT_LOWER);
      ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
     }
   int slot = g_labelN;
   if(g_labelN < RM_MAX_LABELS)
      g_labelN++;
   else
     {
      ObjectDelete(0, g_labelName[0]);
      for(int i = 0; i < RM_MAX_LABELS - 1; i++)
        {
         g_labelX[i] = g_labelX[i + 1];
         g_labelY[i] = g_labelY[i + 1];
         g_labelName[i] = g_labelName[i + 1];
        }
      slot = RM_MAX_LABELS - 1;
     }
   g_labelX[slot] = x;
   g_labelY[slot] = y;
   g_labelName[slot] = name;
  }

//+------------------------------------------------------------------+
//| Realised group result label                                       |
//+------------------------------------------------------------------+
void RM_AnnotGroup(double realized)
  {
   string txt = (realized >= 0 ? "+" : "") + RM_Money(realized) + " " + AccountCurrency();
   RM_PlaceLabel(iTime(g_sym, 0, 0), RM_Bid(), txt, realized >= 0 ? clrYellow : clrOrange);
  }

void RM_AnnotClosed(int ticket, double net, bool grouped)
  {
   if(grouped)
      return;
   string txt = "ext #" + IntegerToString(ticket) + " " + (net >= 0 ? "+" : "") + RM_Money(net);
   RM_PlaceLabel(iTime(g_sym, 0, 0), RM_Bid(), txt, clrSilver);
  }

//+------------------------------------------------------------------+
//| Dotted connector from open to close of a closed ticket            |
//+------------------------------------------------------------------+
void RM_AnnotConnector(int ticket)
  {
   if(!InpDrawConnectors || InpAnnotations != RM_ANNOT_CHART || IsOptimization())
      return;
   if(!OrderSelect(ticket, SELECT_BY_TICKET) || OrderCloseTime() == 0)
      return;
   string name = RM_APFX + "C" + IntegerToString(ticket);
   if(ObjectFind(0, name) >= 0)
      return;
   double net = OrderProfit() + OrderSwap() + OrderCommission();
   if(ObjectCreate(0, name, OBJ_TREND, 0, OrderOpenTime(), OrderOpenPrice(), OrderCloseTime(), OrderClosePrice()))
     {
      ObjectSet(name, OBJPROP_RAY, false);
      ObjectSetInteger(0, name, OBJPROP_STYLE, STYLE_DOT);
      ObjectSetInteger(0, name, OBJPROP_COLOR, net >= 0 ? clrDodgerBlue : clrOrangeRed);
      ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
     }
  }

//+------------------------------------------------------------------+
void RM_HLine(string name, double price, color clr, int style, string tip)
  {
   if(price <= 0.0)
     {
      if(ObjectFind(0, name) >= 0)
         ObjectDelete(0, name);
      return;
     }
   if(ObjectFind(0, name) < 0)
     {
      ObjectCreate(0, name, OBJ_HLINE, 0, 0, price);
      ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
      ObjectSetInteger(0, name, OBJPROP_STYLE, style);
      ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
      ObjectSetInteger(0, name, OBJPROP_BACK, true);
     }
   if(MathAbs(ObjectGetDouble(0, name, OBJPROP_PRICE, 0) - price) > g_meta.point / 2.0)
      ObjectMove(0, name, 0, 0, price);
   ObjectSetString(0, name, OBJPROP_TOOLTIP, tip);
  }

//+------------------------------------------------------------------+
//| Prospective entry levels and the optional possible-close line    |
//+------------------------------------------------------------------+
void RM_AnnotLevels()
  {
   if(IsOptimization())
      return;
   bool show = InpShowGridLevels && g_state == RM_ST_RECOVERING;
   RM_HLine(RM_APFX + "LVL_B", show ? g_nextLevel[RM_BUY] : 0.0, clrDodgerBlue, STYLE_DASH,
            "Next BUY recovery entry level (prospective)");
   RM_HLine(RM_APFX + "LVL_S", show ? g_nextLevel[RM_SELL] : 0.0, clrDarkOrange, STYLE_DASH,
            "Next SELL recovery entry level (prospective)");
   double pc = 0.0;
   if(InpShowCloseLine && g_curGroup.n > 0 && g_meta.point > 0.0)
     {
      double sens = 0.0;
      for(int k = 0; k < g_curGroup.n; k++)
        {
         double perPrice = g_curGroup.closeLots[k] * g_mpp / g_meta.point;
         sens += (g_curGroup.type[k] == RM_BUY) ? perPrice : -perPrice;
        }
      pc = RM_BreakEvenPrice(RM_Bid(), g_curGroup.expectedNet, g_curGroup.target, sens);
     }
   RM_HLine(RM_APFX + "CLOSE", pc, clrGold, STYLE_DOT,
            "Estimated price where the current group reaches its close target (estimate, not an order)");
  }

void RM_AnnotDeinit()
  {
   ObjectsDeleteAll(0, RM_APFX);
  }

//+------------------------------------------------------------------+
//| Optional black chart / green candle scheme (restored on removal)  |
//+------------------------------------------------------------------+
void RM_ApplyChartColors()
  {
   g_savedColors[0] = (color)ChartGetInteger(0, CHART_COLOR_BACKGROUND);
   g_savedColors[1] = (color)ChartGetInteger(0, CHART_COLOR_FOREGROUND);
   g_savedColors[2] = (color)ChartGetInteger(0, CHART_COLOR_CHART_UP);
   g_savedColors[3] = (color)ChartGetInteger(0, CHART_COLOR_CHART_DOWN);
   g_savedColors[4] = (color)ChartGetInteger(0, CHART_COLOR_CANDLE_BULL);
   g_savedColors[5] = (color)ChartGetInteger(0, CHART_COLOR_CANDLE_BEAR);
   g_savedColors[6] = (color)ChartGetInteger(0, CHART_COLOR_GRID);
   g_colorsSaved = true;
   ChartSetInteger(0, CHART_COLOR_BACKGROUND, clrBlack);
   ChartSetInteger(0, CHART_COLOR_FOREGROUND, clrWhite);
   ChartSetInteger(0, CHART_COLOR_CHART_UP, clrLime);
   ChartSetInteger(0, CHART_COLOR_CHART_DOWN, clrLime);
   ChartSetInteger(0, CHART_COLOR_CANDLE_BULL, clrBlack);
   ChartSetInteger(0, CHART_COLOR_CANDLE_BEAR, clrLime);
   ChartSetInteger(0, CHART_COLOR_GRID, C'40,40,40');
  }

void RM_RestoreChartColors()
  {
   if(!g_colorsSaved)
      return;
   ChartSetInteger(0, CHART_COLOR_BACKGROUND, g_savedColors[0]);
   ChartSetInteger(0, CHART_COLOR_FOREGROUND, g_savedColors[1]);
   ChartSetInteger(0, CHART_COLOR_CHART_UP, g_savedColors[2]);
   ChartSetInteger(0, CHART_COLOR_CHART_DOWN, g_savedColors[3]);
   ChartSetInteger(0, CHART_COLOR_CANDLE_BULL, g_savedColors[4]);
   ChartSetInteger(0, CHART_COLOR_CANDLE_BEAR, g_savedColors[5]);
   ChartSetInteger(0, CHART_COLOR_GRID, g_savedColors[6]);
  }


//==== inlined: Include/RecoveryManagerPro/RM_Dashboard.mqh
//+------------------------------------------------------------------+
//| RM_Dashboard.mqh - three native-object panels                      |
//|  A  main panel (upper left)      totals, controls, closures, DD   |
//|  B  current-group panel (lower left)                               |
//|  C  manual opening panel (lower right)                             |
//| Every figure comes from g_book / g_tot / g_curGroup /              |
//| g_reducePreview, i.e. the same snapshot the planner used.         |
//| Objects are created once (layout) and only their text/colours     |
//| change on refresh. Prefix RMP_D_ ; removed on deinit.             |
//+------------------------------------------------------------------+

#define RM_DPFX "RMP_D_"

#define RM_ACT_NONE      0
#define RM_ACT_CLOSE_ALL 1
#define RM_ACT_REDUCE    2
#define RM_ACT_GROUP     3
#define RM_ACT_OPEN_BUY  4
#define RM_ACT_OPEN_SELL 5

//--- theme
color  C_BG, C_BORDER, C_HEAD, C_TEXT, C_DIM, C_GREEN, C_RED, C_AMBER, C_BTN, C_BTNTXT, C_ACCENT;

//--- layout state
int    g_px = 8, g_py = 22;          // main panel origin (persisted)
bool   g_minimized = false;          // persisted
int    g_panelSize = RM_PANEL_NORMAL;
int    g_fs = 8;                     // effective font size
int    g_rh = 18;                    // row height
int    g_mw = 300;                   // main panel width
int    g_gw = 300;                   // group panel width
int    g_cw = 230;                   // manual panel width
int    g_lastChartW = 0, g_lastChartH = 0;
uint   g_lastRefreshMs = 0;
uint   g_lastClickMs = 0;
bool   g_layoutBuilt = false;

//--- manual panel state
double g_uiLot = 0.10;
bool   g_uiRecoveryRole = false;
string g_uiMsg = "";
color  g_uiMsgClr = clrNONE;

//--- confirmation state
int    g_pendingAct = RM_ACT_NONE;
string g_pendingText1 = "", g_pendingText2 = "", g_pendingText3 = "";
uint   g_pendingSince = 0;

string RM_GvKey(string what)
  {
   return "RMP_UI_" + g_keyBase + "_" + what;
  }

void RM_ThemeColors()
  {
   if(InpTheme == RM_THEME_LIGHT)
     {
      C_BG = C'245,245,247'; C_BORDER = C'175,175,180'; C_HEAD = C'226,228,234';
      C_TEXT = C'25,25,30'; C_DIM = C'95,95,105'; C_GREEN = C'0,135,60';
      C_RED = C'200,35,35'; C_AMBER = C'185,115,0'; C_BTN = C'218,220,228';
      C_BTNTXT = C'20,20,25'; C_ACCENT = C'40,100,190';
     }
   else
     {
      C_BG = C'28,29,33'; C_BORDER = C'68,70,78'; C_HEAD = C'42,44,50';
      C_TEXT = C'222,222,226'; C_DIM = C'145,147,155'; C_GREEN = C'80,205,120';
      C_RED = C'240,95,95'; C_AMBER = C'242,182,64'; C_BTN = C'58,60,70';
      C_BTNTXT = C'240,240,240'; C_ACCENT = C'80,140,215';
     }
  }

//+------------------------------------------------------------------+
//| Object helpers                                                    |
//+------------------------------------------------------------------+
void RM_ObjCommon(string n)
  {
   ObjectSetInteger(0, n, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, n, OBJPROP_HIDDEN, true);
   ObjectSetInteger(0, n, OBJPROP_BACK, false);
  }

void RM_Rect(string n, int x, int y, int w, int h, color bg, color border)
  {
   n = RM_DPFX + n;
   if(ObjectFind(0, n) < 0)
      ObjectCreate(0, n, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   RM_ObjCommon(n);
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, n, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, n, OBJPROP_YSIZE, h);
   ObjectSetInteger(0, n, OBJPROP_BGCOLOR, bg);
   ObjectSetInteger(0, n, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, n, OBJPROP_COLOR, border);
   ObjectSetInteger(0, n, OBJPROP_WIDTH, 1);
  }

void RM_Text(string n, int x, int y, string text, color clr, bool right, bool bold)
  {
   n = RM_DPFX + n;
   if(ObjectFind(0, n) < 0)
      ObjectCreate(0, n, OBJ_LABEL, 0, 0, 0);
   RM_ObjCommon(n);
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, n, OBJPROP_ANCHOR, right ? ANCHOR_RIGHT_UPPER : ANCHOR_LEFT_UPPER);
   ObjectSetString(0, n, OBJPROP_FONT, bold ? "Arial Bold" : "Arial");
   ObjectSetInteger(0, n, OBJPROP_FONTSIZE, g_fs);
   ObjectSetInteger(0, n, OBJPROP_COLOR, clr);
   ObjectSetString(0, n, OBJPROP_TEXT, text);
  }

void RM_Button(string n, int x, int y, int w, int h, string text, color bg, color fg)
  {
   n = RM_DPFX + n;
   if(ObjectFind(0, n) < 0)
      ObjectCreate(0, n, OBJ_BUTTON, 0, 0, 0);
   RM_ObjCommon(n);
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, n, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, n, OBJPROP_YSIZE, h);
   ObjectSetString(0, n, OBJPROP_FONT, "Arial Bold");
   ObjectSetInteger(0, n, OBJPROP_FONTSIZE, g_fs);
   ObjectSetInteger(0, n, OBJPROP_BGCOLOR, bg);
   ObjectSetInteger(0, n, OBJPROP_COLOR, fg);
   ObjectSetInteger(0, n, OBJPROP_BORDER_COLOR, C_BORDER);
   ObjectSetInteger(0, n, OBJPROP_STATE, false);
   ObjectSetInteger(0, n, OBJPROP_ZORDER, 10);
   ObjectSetString(0, n, OBJPROP_TEXT, text);
  }

void RM_Edit(string n, int x, int y, int w, int h, string text)
  {
   n = RM_DPFX + n;
   if(ObjectFind(0, n) < 0)
      ObjectCreate(0, n, OBJ_EDIT, 0, 0, 0);
   RM_ObjCommon(n);
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, n, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, n, OBJPROP_YSIZE, h);
   ObjectSetString(0, n, OBJPROP_FONT, "Arial");
   ObjectSetInteger(0, n, OBJPROP_FONTSIZE, g_fs);
   ObjectSetInteger(0, n, OBJPROP_ALIGN, ALIGN_CENTER);
   ObjectSetInteger(0, n, OBJPROP_BGCOLOR, C_BG);
   ObjectSetInteger(0, n, OBJPROP_COLOR, C_TEXT);
   ObjectSetInteger(0, n, OBJPROP_BORDER_COLOR, C_BORDER);
   ObjectSetInteger(0, n, OBJPROP_ZORDER, 10);
   ObjectSetString(0, n, OBJPROP_TEXT, text);
  }

//--- refresh-time setters: touch the object only when something changed
void RM_Set(string n, string text, color clr)
  {
   n = RM_DPFX + n;
   if(ObjectFind(0, n) < 0)
      return;
   if(ObjectGetString(0, n, OBJPROP_TEXT) != text)
      ObjectSetString(0, n, OBJPROP_TEXT, text);
   if((color)ObjectGetInteger(0, n, OBJPROP_COLOR) != clr)
      ObjectSetInteger(0, n, OBJPROP_COLOR, clr);
  }

void RM_SetBg(string n, color bg)
  {
   n = RM_DPFX + n;
   if(ObjectFind(0, n) >= 0 && (color)ObjectGetInteger(0, n, OBJPROP_BGCOLOR) != bg)
      ObjectSetInteger(0, n, OBJPROP_BGCOLOR, bg);
  }

color RM_PLColor(double v)
  {
   if(v > 0.004)
      return C_GREEN;
   if(v < -0.004)
      return C_RED;
   return C_TEXT;
  }

string RM_Cut(string s, int maxLen)
  {
   if(StringLen(s) <= maxLen)
      return s;
   return StringSubstr(s, 0, maxLen - 1) + "~";
  }

//+------------------------------------------------------------------+
//| Init / layout                                                     |
//+------------------------------------------------------------------+
void RM_DashInit()
  {
   RM_ThemeColors();
   g_panelSize = InpPanelSize;
   g_uiLot = InpManualLot;
   g_uiRecoveryRole = InpPanelOpensRecovery;
   g_px = InpPanelX;
   g_py = InpPanelY;
   if(GlobalVariableCheck(RM_GvKey("X")))
      g_px = (int)GlobalVariableGet(RM_GvKey("X"));
   if(GlobalVariableCheck(RM_GvKey("Y")))
      g_py = (int)GlobalVariableGet(RM_GvKey("Y"));
   if(GlobalVariableCheck(RM_GvKey("MIN")))
      g_minimized = (GlobalVariableGet(RM_GvKey("MIN")) != 0.0);
   RM_DashRelayout();
  }

void RM_DashDeinit()
  {
   ObjectsDeleteAll(0, RM_DPFX);
   ChartRedraw();
  }

void RM_SaveUi()
  {
   if(IsTesting())
      return;
   GlobalVariableSet(RM_GvKey("X"), g_px);
   GlobalVariableSet(RM_GvKey("Y"), g_py);
   GlobalVariableSet(RM_GvKey("MIN"), g_minimized ? 1.0 : 0.0);
  }

void RM_DashRelayout()
  {
   int cw = (int)ChartGetInteger(0, CHART_WIDTH_IN_PIXELS, 0);
   int ch = (int)ChartGetInteger(0, CHART_HEIGHT_IN_PIXELS, 0);
   g_lastChartW = cw;
   g_lastChartH = ch;
   ObjectsDeleteAll(0, RM_DPFX);
   for(int i = 0; i < 3; i++)
      for(int j = 0; j < 4; j++)
         g_panelRect[i][j] = 0;
   double sc = (g_panelSize == RM_PANEL_LARGE) ? 1.3 : 1.0;
   g_fs = (int)MathRound(InpFontSize * sc);
   g_rh = g_fs * 2 + 3;
   g_mw = (int)MathMax(260, g_fs * 37);
   g_gw = g_mw;
   g_cw = (int)MathRound(g_fs * 27);
   if(g_panelSize == RM_PANEL_HIDDEN)
     {
      RM_Button("SHOW", 4, 18, 44, g_rh, "RMP", C_BTN, C_BTNTXT);
      ChartRedraw();
      g_layoutBuilt = true;
      return;
     }
   RM_BuildMain();
   if(!g_minimized)
     {
      RM_BuildGroup(ch);
      RM_BuildManual(cw, ch);
     }
   g_layoutBuilt = true;
   RM_DashRefresh(true);
  }

//--- column positions inside a panel of width w starting at x
int RM_C1(int x, int w) { return x + (int)(w * 0.47); }
int RM_C2(int x, int w) { return x + (int)(w * 0.70); }
int RM_C3(int x, int w) { return x + w - 8; }

void RM_Row4(string key, int x, int y, int w, string label, color lc)
  {
   RM_Text(key + "_L", x + 8, y, label, lc, false, false);
   RM_Text(key + "_1", RM_C1(x, w), y, "", C_TEXT, true, false);
   RM_Text(key + "_2", RM_C2(x, w), y, "", C_TEXT, true, false);
   RM_Text(key + "_3", RM_C3(x, w), y, "", C_TEXT, true, false);
  }

void RM_Section(string key, int x, int y, int w, string title)
  {
   RM_Rect(key + "_BG", x + 1, y, w - 2, g_rh - 2, C_HEAD, C_HEAD);
   RM_Text(key, x + 8, y + 1, title, C_DIM, false, true);
  }

//+------------------------------------------------------------------+
//| A: main panel                                                     |
//+------------------------------------------------------------------+
void RM_BuildMain()
  {
   int x = g_px, y = g_py, w = g_mw, rh = g_rh;
   int rows = g_minimized ? 1 : (InpShowAccountBlock ? 30 : 23);
   int h = rows * rh + 8;
   RM_Rect("M_BG", x, y, w, h, C_BG, C_BORDER);
   RM_Rect("M_HANDLE", x, y, w, rh + 4, C_HEAD, C_BORDER);
   // title bar doubles as drag handle (double-click to select, then drag)
   string hn = RM_DPFX + "M_HANDLE";
   ObjectSetInteger(0, hn, OBJPROP_SELECTABLE, true);
   ObjectSetString(0, hn, OBJPROP_TOOLTIP, "Double-click, then drag to move the panel");
   RM_Text("M_TITLE", x + 8, y + 3, "RECOVERY MANAGER PRO", C_TEXT, false, true);
   RM_Rect("M_CHIP", x + w - 118, y + 4, 84, rh - 4, C_AMBER, C_AMBER);
   RM_Text("M_CHIPT", x + w - 112, y + 4, "", C_BG, false, true);
   RM_Button("MIN", x + w - 28, y + 3, 22, rh - 2, g_minimized ? "+" : "_", C_BTN, C_BTNTXT);
   g_panelRect[0][0] = x; g_panelRect[0][1] = y; g_panelRect[0][2] = w; g_panelRect[0][3] = h;
   if(g_minimized)
     {
      ChartRedraw();
      return;
     }
   int r = y + rh + 8;
   RM_Text("M_STATE", x + 8, r, "", C_TEXT, false, false); r += rh;
   RM_Text("M_H_1", RM_C1(x, w), r, "Orders", C_DIM, true, false);
   RM_Text("M_H_2", RM_C2(x, w), r, "Lots", C_DIM, true, false);
   RM_Text("M_H_3", RM_C3(x, w), r, "P/L " + AccountCurrency(), C_DIM, true, false);
   r += rh;
   RM_Section("M_S_MAIN", x, r, w, "MAIN POSITION (original + lock)"); r += rh;
   RM_Row4("M_MB", x, r, w, "BUY", C_ACCENT); r += rh;
   RM_Row4("M_MS", x, r, w, "SELL", C_AMBER); r += rh;
   RM_Section("M_S_REC", x, r, w, "RECOVERY ORDERS"); r += rh;
   RM_Row4("M_RB", x, r, w, "BUY", C_ACCENT); r += rh;
   RM_Row4("M_RS", x, r, w, "SELL", C_AMBER); r += rh;
   RM_Rect("M_SEP", x + 6, r, w - 12, 1, C_BORDER, C_BORDER); r += 3;
   RM_Row4("M_TOT", x, r, w, "TOTAL managed", C_TEXT); r += rh + 2;
   int bw = (w - 24) / 2;
   RM_Button("STOP", x + 8, r, bw, rh + 2, "Stop Recovery", C_BTN, C_BTNTXT);
   RM_Button("CLOSEALL", x + 16 + bw, r, bw, rh + 2, "Close All", C_BTN, C_RED);
   r += rh + 8;
   RM_Section("M_S_POS", x, r, w, "POSSIBLE CLOSURES (profit-financed)"); r += rh;
   RM_Row4("M_PB", x, r, w, "BUY", C_ACCENT); r += rh;
   RM_Row4("M_PS", x, r, w, "SELL", C_AMBER); r += rh;
   RM_Row4("M_PN", x, r, w, "Net", C_TEXT); r += rh + 2;
   RM_Button("REDUCE", x + 8, r, w - 16, rh + 2, "Reduce Volume", C_BTN, C_BTNTXT);
   r += rh + 8;
   RM_Row4("M_DD", x, r, w, "Managed drawdown", C_TEXT); r += rh;
   RM_Text("M_STATUS1", x + 8, r, "", C_TEXT, false, false); r += rh;
   RM_Text("M_STATUS2", x + 8, r, "", C_DIM, false, false); r += rh;
   RM_Text("M_LAST", x + 8, r, "", C_DIM, false, false); r += rh;
   if(InpShowAccountBlock)
     {
      RM_Section("M_S_ACC", x, r, w, "ACCOUNT & SESSION (enhancement)"); r += rh;
      RM_Row4("M_A1", x, r, w, "Balance / Equity", C_DIM); r += rh;
      RM_Row4("M_A2", x, r, w, "Free margin / Level", C_DIM); r += rh;
      RM_Row4("M_A3", x, r, w, "Spread / Link", C_DIM); r += rh;
      RM_Row4("M_A4", x, r, w, "Realised sess / day", C_DIM); r += rh;
      RM_Row4("M_A5", x, r, w, "Floating acct / managed", C_DIM); r += rh;
      RM_Row4("M_A6", x, r, w, "Lots ORIG/LOCK/REC", C_DIM); r += rh;
     }
   // resize background to the rows actually used
   int hh = r - y + 6;
   ObjectSetInteger(0, RM_DPFX + "M_BG", OBJPROP_YSIZE, hh);
   g_panelRect[0][3] = hh;
  }

//+------------------------------------------------------------------+
//| B: current-group panel (lower left)                               |
//+------------------------------------------------------------------+
void RM_BuildGroup(int chartH)
  {
   int w = g_gw, rh = g_rh;
   int h = 10 * rh + 12;
   int x = 8;
   int y = (int)MathMax(g_py + g_panelRect[0][3] + 8, chartH - h - 8);
   RM_Rect("G_BG", x, y, w, h, C_BG, C_BORDER);
   RM_Rect("G_HEAD", x, y, w, rh + 4, C_HEAD, C_BORDER);
   RM_Text("G_TITLE", x + 8, y + 3, "CURRENT GROUP", C_TEXT, false, true);
   RM_Text("G_KIND", x + w - 8, y + 3, "", C_DIM, true, false);
   int r = y + rh + 8;
   RM_Text("G_H_1", RM_C1(x, w), r, "Size", C_DIM, true, false);
   RM_Text("G_H_2", RM_C2(x, w), r, "Close", C_DIM, true, false);
   RM_Text("G_H_3", RM_C3(x, w), r, "P/L", C_DIM, true, false);
   r += rh;
   RM_Row4("G_B", x, r, w, "Main BUY", C_ACCENT); r += rh;
   RM_Row4("G_S", x, r, w, "Main SELL", C_AMBER); r += rh;
   RM_Row4("G_R", x, r, w, "Recovery", C_TEXT); r += rh;
   RM_Row4("G_C", x, r, w, "Costs + buffer", C_DIM); r += rh;
   RM_Row4("G_T", x, r, w, "Group lots / net", C_TEXT); r += rh;
   RM_Text("G_TARGET", x + 8, r, "", C_DIM, false, false); r += rh + 2;
   RM_Button("GROUP", x + 8, r, w - 16, rh + 2, "Close Current Group", C_BTN, C_BTNTXT);
   g_panelRect[1][0] = x; g_panelRect[1][1] = y; g_panelRect[1][2] = w; g_panelRect[1][3] = h;
  }

//+------------------------------------------------------------------+
//| C: manual opening panel (lower right)                             |
//+------------------------------------------------------------------+
void RM_BuildManual(int chartW, int chartH)
  {
   int w = g_cw, rh = g_rh;
   int h = 7 * rh + 18;
   int x = (int)MathMax(8, chartW - w - 60);     // keep clear of the price scale
   int y = chartH - h - 8;
   RM_Rect("C_BG", x, y, w, h, C_BG, C_BORDER);
   RM_Rect("C_HEAD", x, y, w, rh + 4, C_HEAD, C_BORDER);
   RM_Text("C_TITLE", x + 8, y + 3, "MANUAL ORDERS", C_TEXT, false, true);
   int r = y + rh + 8;
   int bh = rh + 2;
   RM_Button("MINUS", x + 8, r, bh, bh, "-", C_BTN, C_BTNTXT);
   RM_Edit("LOT", x + 12 + bh, r, w - 2 * bh - 24, bh, DoubleToString(g_uiLot, 2));
   RM_Button("PLUS", x + w - 8 - bh, r, bh, bh, "+", C_BTN, C_BTNTXT);
   r += bh + 4;
   RM_Text("C_ROLEL", x + 8, r + 2, "Role", C_DIM, false, false);
   RM_Button("ROLE", x + 60, r, w - 68, bh, "", C_BTN, C_BTNTXT);
   r += bh + 4;
   RM_Text("C_TARGET", x + 8, r, "", C_DIM, false, false);
   r += rh;
   int bw = (w - 24) / 2;
   RM_Button("BUY", x + 8, r, bw, bh + 2, "Open Buy", C'30,90,170', clrWhite);
   RM_Button("SELL", x + 16 + bw, r, bw, bh + 2, "Open Sell", C'180,70,30', clrWhite);
   r += bh + 6;
   RM_Text("C_MSG", x + 8, r, "", C_DIM, false, false);
   g_panelRect[2][0] = x; g_panelRect[2][1] = y; g_panelRect[2][2] = w; g_panelRect[2][3] = h;
  }

//+------------------------------------------------------------------+
//| Confirmation box (under the main panel)                           |
//+------------------------------------------------------------------+
void RM_ShowConfirm()
  {
   int x = g_px, w = g_mw, rh = g_rh;
   int y = g_py + g_panelRect[0][3] + 4;
   RM_Rect("K_BG", x, y, w, 4 * rh + 16, C_HEAD, C_AMBER);
   RM_Text("K_T1", x + 8, y + 4, RM_Cut(g_pendingText1, 60), C_AMBER, false, true);
   RM_Text("K_T2", x + 8, y + 4 + rh, RM_Cut(g_pendingText2, 64), C_TEXT, false, false);
   RM_Text("K_T3", x + 8, y + 4 + 2 * rh, RM_Cut(g_pendingText3, 64), C_TEXT, false, false);
   int bw = (w - 24) / 2;
   RM_Button("OK", x + 8, y + 6 + 3 * rh, bw, rh + 2, "Confirm", C_BTN, C_GREEN);
   RM_Button("CANCEL", x + 16 + bw, y + 6 + 3 * rh, bw, rh + 2, "Cancel", C_BTN, C_TEXT);
   ChartRedraw();
  }

void RM_HideConfirm()
  {
   g_pendingAct = RM_ACT_NONE;
   string names[] = {"K_BG", "K_T1", "K_T2", "K_T3", "OK", "CANCEL"};
   for(int i = 0; i < ArraySize(names); i++)
      ObjectDelete(0, RM_DPFX + names[i]);
   ChartRedraw();
  }

//+------------------------------------------------------------------+
//| Refresh values (timer; every tick in the tester, throttled)       |
//+------------------------------------------------------------------+
void RM_Row4Set(string key, string a, string b, string c, color cc)
  {
   RM_Set(key + "_1", a, C_TEXT);
   RM_Set(key + "_2", b, C_TEXT);
   RM_Set(key + "_3", c, cc);
  }

void RM_StatusChip(string &text, color &clr)
  {
   switch(g_state)
     {
      case RM_ST_PREPARING:
      case RM_ST_LOCKING:
      case RM_ST_RECOVERING:
      case RM_ST_CLOSING:
         text = "ACTIVE"; clr = C_GREEN; break;
      case RM_ST_PAUSED:
         text = "PAUSED"; clr = C_AMBER; break;
      case RM_ST_ERROR_HOLD:
         text = "ERROR"; clr = C_RED; break;
      default:
         text = "WAITING"; clr = C_AMBER;
     }
   if(g_state == RM_ST_RECOVERING && g_block != "")
     { text = "BLOCKED"; clr = C_RED; }
  }

void RM_DashRefresh(bool force)
  {
   if(IsOptimization() || !g_layoutBuilt)
      return;
   uint now = GetTickCount();
   if(!force && now - g_lastRefreshMs < 200)
      return;
   g_lastRefreshMs = now;
   int cw = (int)ChartGetInteger(0, CHART_WIDTH_IN_PIXELS, 0);
   int ch = (int)ChartGetInteger(0, CHART_HEIGHT_IN_PIXELS, 0);
   if(cw != g_lastChartW || ch != g_lastChartH)
     {
      RM_DashRelayout();
      return;
     }
   if(g_pendingAct != RM_ACT_NONE && now - g_pendingSince > 15000)
     {
      RM_HideConfirm();
      RM_UiMsg("confirmation timed out", C_DIM);
     }
   if(g_panelSize == RM_PANEL_HIDDEN)
      return;
   string cur = AccountCurrency();
   string chipT; color chipC;
   RM_StatusChip(chipT, chipC);
   RM_SetBg("M_CHIP", chipC);
   RM_Set("M_CHIPT", chipT, C_BG);
   if(!g_minimized)
     {
      RM_Set("M_STATE", "State " + RM_StateName(g_state) + " | " + RM_Cut(RM_SignalName(), 26) +
             (RM_TrendText() != "" ? " " + RM_TrendText() : ""), C_TEXT);
      RM_Row4Set("M_MB", IntegerToString(g_tot.mainBuyCnt), RM_Lots(g_tot.mainBuyLots), RM_Money(g_tot.mainBuyPL), RM_PLColor(g_tot.mainBuyPL));
      RM_Row4Set("M_MS", IntegerToString(g_tot.mainSellCnt), RM_Lots(g_tot.mainSellLots), RM_Money(g_tot.mainSellPL), RM_PLColor(g_tot.mainSellPL));
      RM_Row4Set("M_RB", IntegerToString(g_tot.recBuyCnt), RM_Lots(g_tot.recBuyLots), RM_Money(g_tot.recBuyPL), RM_PLColor(g_tot.recBuyPL));
      RM_Row4Set("M_RS", IntegerToString(g_tot.recSellCnt), RM_Lots(g_tot.recSellLots), RM_Money(g_tot.recSellPL), RM_PLColor(g_tot.recSellPL));
      RM_Row4Set("M_TOT", IntegerToString(g_tot.totalCnt), RM_Lots(g_tot.totalLots), RM_Money(g_tot.totalPL), RM_PLColor(g_tot.totalPL));
      bool paused = (g_state == RM_ST_PAUSED || g_state == RM_ST_ERROR_HOLD);
      RM_Set("STOP", paused ? "Resume" : "Stop Recovery", paused ? C_GREEN : C_BTNTXT);
      // possible closures
      if(g_reducePreview.n > 0)
        {
         double bpl = g_reducePreview.mainBuySliceNet, spl = g_reducePreview.mainSellSliceNet;
         RM_Row4Set("M_PB", "", RM_Lots(g_reducePreview.mainBuyCloseLots), RM_Money(bpl), RM_PLColor(bpl));
         RM_Row4Set("M_PS", "", RM_Lots(g_reducePreview.mainSellCloseLots), RM_Money(spl), RM_PLColor(spl));
         RM_Row4Set("M_PN", "", "", RM_Money(g_reducePreview.expectedNet), RM_PLColor(g_reducePreview.expectedNet));
        }
      else
        {
         RM_Row4Set("M_PB", "", "0.00", "-", C_DIM);
         RM_Row4Set("M_PS", "", "0.00", "-", C_DIM);
         RM_Row4Set("M_PN", "", "", RM_ReasonName(g_reducePreview.reason), C_DIM);
        }
      RM_Row4Set("M_DD", DoubleToString(g_ddPct, 2) + "%", "peak", RM_Money(g_drawdown) + " / " + RM_Money(g_peakDrawdown),
                 g_drawdown > 0 ? C_RED : C_TEXT);
      string st = (g_status != "") ? g_status : RM_StateName(g_state);
      color stc = (g_state == RM_ST_ERROR_HOLD) ? C_RED : (g_state == RM_ST_PAUSED ? C_AMBER : C_TEXT);
      RM_Set("M_STATUS1", RM_Cut(st, 58), stc);
      string s2 = "";
      if(g_block != "" && StringFind(st, g_block) < 0)
         s2 = "Blocked: " + g_block;
      else if(g_lockResidual > RM_EPS)
         s2 = "Unhedged residual " + DoubleToString(g_lockResidual, 3) + " lots - NOT neutral";
      else if(StringLen(st) > 58)
         s2 = StringSubstr(st, 57);
      RM_Set("M_STATUS2", RM_Cut(s2, 60), s2 != "" && StringFind(s2, "Blocked") == 0 ? C_RED : C_DIM);
      string last = "No closure yet this session";
      if(g_lastPlanKind != RM_PLAN_NONE)
         last = "Last " + RM_PlanKindName(g_lastPlanKind) + ": est " + RM_Money(g_lastPlanEst) + " / realised " + RM_Money(g_lastPlanReal);
      if(RM_JournalOpen())
         last = "Open transaction " + IntegerToString(g_journal.planId) + ": realised so far " + RM_Money(g_journal.realizedNet);
      RM_Set("M_LAST", RM_Cut(last, 60), C_DIM);
      if(InpShowAccountBlock)
        {
         double ml = RM_MarginLevel();
         bool link = IsTesting() || IsConnected();
         RM_Row4Set("M_A1", "", RM_Money(AccountBalance()), RM_Money(AccountEquity()), C_TEXT);
         RM_Row4Set("M_A2", "", RM_Money(AccountFreeMargin()), ml > 0 ? DoubleToString(ml, 0) + "%" : "-", C_TEXT);
         int sp = RM_SpreadPoints();
         RM_Set("M_A3_2", IntegerToString(sp) + " pt", sp > InpMaxSpread ? C_RED : C_TEXT);
         RM_Set("M_A3_3", link ? "connected" : "DISCONNECTED", link ? C_GREEN : C_RED);
         RM_Row4Set("M_A4", "", RM_Money(g_realizedSession), RM_Money(g_realizedDay), RM_PLColor(g_realizedDay));
         double accFloat = AccountEquity() - AccountBalance();
         RM_Row4Set("M_A5", "", RM_Money(accFloat), RM_Money(g_managedNet), RM_PLColor(g_managedNet));
         RM_Row4Set("M_A6", RM_Lots(g_tot.origLots), RM_Lots(g_tot.lockLots),
                    RM_Lots(g_tot.recBuyLots + g_tot.recSellLots), C_TEXT);
        }
      RM_RefreshGroup(cur);
      RM_RefreshManual();
     }
   ChartRedraw();
  }

void RM_RefreshGroup(string cur)
  {
   if(g_curGroup.n == 0)
     {
      // no recovery basket: show which main tickets the next slice would use
      int ib = RM_PickMain(g_book, RM_BUY, false, InpRecoveryPriority, InpFirstRecoveryTicket);
      int is = RM_PickMain(g_book, RM_SELL, false, InpRecoveryPriority, InpFirstRecoveryTicket);
      RM_Set("G_B_L", ib >= 0 ? "Main BUY #" + IntegerToString(g_book.ticket[ib]) : "Main BUY -", C_ACCENT);
      RM_Set("G_S_L", is >= 0 ? "Main SELL #" + IntegerToString(g_book.ticket[is]) : "Main SELL -", C_AMBER);
      RM_Row4Set("G_B", ib >= 0 ? RM_Lots(g_book.lots[ib]) : "", "", ib >= 0 ? RM_Money(RM_LegNet(g_book, ib)) : "", C_DIM);
      RM_Row4Set("G_S", is >= 0 ? RM_Lots(g_book.lots[is]) : "", "", is >= 0 ? RM_Money(RM_LegNet(g_book, is)) : "", C_DIM);
      RM_Set("G_R_L", "Recovery -", C_TEXT);
      RM_Row4Set("G_R", "", "", "", C_DIM);
      RM_Row4Set("G_C", "", "", "", C_DIM);
      RM_Row4Set("G_T", "", "", "", C_DIM);
      RM_Set("G_KIND", "", C_DIM);
      RM_Set("G_TARGET", g_tot.totalCnt == 0 ? "No orders to recover" : "No recovery orders open", C_DIM);
      return;
     }
   double bSize = 0, sSize = 0;
   for(int k = 0; k < g_curGroup.n; k++)
     {
      if(g_curGroup.ticket[k] == g_curGroup.mainBuyTicket) bSize = g_curGroup.ticketLots[k];
      if(g_curGroup.ticket[k] == g_curGroup.mainSellTicket) sSize = g_curGroup.ticketLots[k];
     }
   RM_Set("G_B_L", g_curGroup.mainBuyTicket > 0 ? "Main BUY #" + IntegerToString(g_curGroup.mainBuyTicket) : "Main BUY -", C_ACCENT);
   RM_Set("G_S_L", g_curGroup.mainSellTicket > 0 ? "Main SELL #" + IntegerToString(g_curGroup.mainSellTicket) : "Main SELL -", C_AMBER);
   RM_Row4Set("G_B", g_curGroup.mainBuyTicket > 0 ? RM_Lots(bSize) : "", RM_Lots(g_curGroup.mainBuyCloseLots), RM_Money(g_curGroup.mainBuySliceNet), RM_PLColor(g_curGroup.mainBuySliceNet));
   RM_Row4Set("G_S", g_curGroup.mainSellTicket > 0 ? RM_Lots(sSize) : "", RM_Lots(g_curGroup.mainSellCloseLots), RM_Money(g_curGroup.mainSellSliceNet), RM_PLColor(g_curGroup.mainSellSliceNet));
   int nRec = 0;
   for(int k2 = 0; k2 < g_curGroup.n; k2++)
      if(g_curGroup.role[k2] == RM_ROLE_RECOVERY)
         nRec++;
   RM_Set("G_R_L", "Recovery " + RM_Side(g_curGroup.dir) + " x" + IntegerToString(nRec), g_curGroup.dir == RM_BUY ? C_ACCENT : C_AMBER);
   RM_Row4Set("G_R", "", RM_Lots(g_curGroup.recoveryCloseLots), RM_Money(g_curGroup.recoveryNet), RM_PLColor(g_curGroup.recoveryNet));
   RM_Row4Set("G_C", "", "", "-" + RM_Money(g_curGroup.unbookedCosts + g_curGroup.buffer), C_DIM);
   double lots = g_curGroup.recoveryCloseLots + g_curGroup.mainBuyCloseLots + g_curGroup.mainSellCloseLots;
   RM_Row4Set("G_T", "", RM_Lots(lots), RM_Money(g_curGroup.expectedNet), RM_PLColor(g_curGroup.expectedNet));
   RM_Set("G_KIND", (g_curGroup.isOverlap ? "OVERLAP first+last" : (g_curGroup.isFinal ? "FINAL slice" : "GROUP")), C_DIM);
   RM_Set("G_TARGET", "Target " + RM_Money(g_curGroup.target) + " " + cur + " (" + DoubleToString(InpPartialTPPoints, 0) +
          " pt) " + (g_curGroup.qualifies ? "- READY" : "- waiting"), g_curGroup.qualifies ? C_GREEN : C_DIM);
  }

void RM_RefreshManual()
  {
   RM_Set("ROLE", g_uiRecoveryRole ? "RECOVERY" : "ORIGINAL", g_uiRecoveryRole ? C_AMBER : C_ACCENT);
   RM_Set("C_TARGET", g_sym + " as " + (g_uiRecoveryRole ? "RECOVERY (magic " + IntegerToString(InpRecoveryMagic) + ")"
          : "ORIGINAL (magic " + IntegerToString(InpManualOriginalMagic) + ")"), C_DIM);
   RM_Set("C_MSG", RM_Cut(g_uiMsg, 40), g_uiMsgClr == clrNONE ? C_DIM : g_uiMsgClr);
  }

void RM_UiMsg(string m, color c)
  {
   g_uiMsg = m;
   g_uiMsgClr = c;
   if(m != "")
      Print("RMP UI: ", m);
  }

//+------------------------------------------------------------------+
//| Input handling                                                    |
//+------------------------------------------------------------------+
bool RM_ReadLotField(double &lot)
  {
   string n = RM_DPFX + "LOT";
   string txt = StringTrimRight(StringTrimLeft(ObjectGetString(0, n, OBJPROP_TEXT)));
   StringReplace(txt, ",", ".");
   double v = StringToDouble(txt);
   double norm = RM_NormalizeLot(v, g_meta, RM_ROUND_DOWN);
   if(v <= 0.0 || norm <= 0.0 || MathAbs(norm - v) > RM_EPS)
     {
      ObjectSetString(0, n, OBJPROP_TEXT, DoubleToString(g_uiLot, 2));
      RM_UiMsg("rejected volume '" + txt + "' (min " + RM_Lots(g_meta.minLot) + ", step " +
               DoubleToString(g_meta.lotStep, 2) + ")", C_RED);
      return false;
     }
   g_uiLot = norm;
   lot = norm;
   return true;
  }

void RM_OnEditDone(string name)
  {
   if(name != RM_DPFX + "LOT")
      return;
   double l;
   if(RM_ReadLotField(l))
      RM_UiMsg("volume " + RM_Lots(l) + " applied", C_DIM);
   RM_DashRefresh(true);
  }

void RM_OnDrag(string name)
  {
   if(name != RM_DPFX + "M_HANDLE")
      return;
   g_px = (int)ObjectGetInteger(0, name, OBJPROP_XDISTANCE);
   g_py = (int)ObjectGetInteger(0, name, OBJPROP_YDISTANCE);
   RM_SaveUi();
   RM_DashRelayout();
  }

//+------------------------------------------------------------------+
//| Build the preview for a destructive action                        |
//+------------------------------------------------------------------+
void RM_PreparePending(int act)
  {
   string cur = AccountCurrency();
   g_pendingAct = act;
   g_pendingSince = GetTickCount();
   g_pendingText2 = ""; g_pendingText3 = "";
   if(act == RM_ACT_CLOSE_ALL)
     {
      RM_PlanAll(g_book, g_cfg, g_mpp, RM_PLAN_CLOSE_ALL, -1.0, g_confirmPlan);
      g_pendingText1 = "CLOSE ALL " + IntegerToString(g_confirmPlan.n) + " managed tickets?";
      g_pendingText2 = "Lots " + RM_Lots(g_tot.totalLots) + "  est. P/L " + RM_Money(g_confirmPlan.expectedNet) + " " + cur;
     }
   else if(act == RM_ACT_REDUCE)
     {
      g_confirmPlan = g_reducePreview;
      g_pendingText1 = "REDUCE VOLUME (" + IntegerToString(g_confirmPlan.n) + " legs)?";
      g_pendingText2 = "BUY " + RM_Lots(g_confirmPlan.mainBuyCloseLots) + " / SELL " + RM_Lots(g_confirmPlan.mainSellCloseLots) +
                       "  est. net " + RM_Money(g_confirmPlan.expectedNet) + " " + cur;
     }
   else if(act == RM_ACT_GROUP)
     {
      g_confirmPlan = g_curGroup;
      g_confirmPlan.kind = RM_PLAN_MANUAL;
      g_pendingText1 = "CLOSE CURRENT GROUP (" + IntegerToString(g_confirmPlan.n) + " legs)?";
      g_pendingText2 = "Lots " + RM_Lots(g_confirmPlan.recoveryCloseLots + g_confirmPlan.mainBuyCloseLots + g_confirmPlan.mainSellCloseLots) +
                       "  est. net " + RM_Money(g_confirmPlan.expectedNet) + " " + cur +
                       (g_confirmPlan.expectedNet < 0 ? "  = REALISED LOSS" : "");
     }
   else
     {
      string side = (act == RM_ACT_OPEN_BUY) ? "BUY" : "SELL";
      g_pendingText1 = "OPEN " + side + " " + RM_Lots(g_uiLot) + " " + g_sym + "?";
      g_pendingText2 = "Role " + RM_RoleName(g_uiRecoveryRole ? RM_ROLE_RECOVERY : RM_ROLE_ORIGINAL);
      RM_PlanReset(g_confirmPlan, RM_PLAN_NONE);
     }
   if(g_confirmPlan.n > 0)
     {
      string t = "Tickets:";
      for(int k = 0; k < g_confirmPlan.n && k < 6; k++)
         t += " #" + IntegerToString(g_confirmPlan.ticket[k]) + "(" + RM_Lots(g_confirmPlan.closeLots[k]) + ")";
      if(g_confirmPlan.n > 6)
         t += " +" + IntegerToString(g_confirmPlan.n - 6);
      g_pendingText3 = t;
     }
  }

//+------------------------------------------------------------------+
//| Tickets in the confirmed preview must still match current book   |
//+------------------------------------------------------------------+
bool RM_PreviewStillValid(const RM_Plan &fresh)
  {
   if(fresh.n != g_confirmPlan.n)
      return false;
   for(int k = 0; k < fresh.n; k++)
     {
      bool found = false;
      for(int j = 0; j < g_confirmPlan.n; j++)
         if(g_confirmPlan.ticket[j] == fresh.ticket[k] && MathAbs(g_confirmPlan.closeLots[j] - fresh.closeLots[k]) < RM_EPS)
           { found = true; break; }
      if(!found)
         return false;
     }
   return true;
  }

void RM_ExecutePending()
  {
   int act = g_pendingAct;
   RM_HideConfirm();
   string msg = "";
   bool ok = false;
   RM_UpdatePreviews(true);
   if(act == RM_ACT_CLOSE_ALL)
      ok = RM_ActionCloseAll(msg);
   else if(act == RM_ACT_REDUCE || act == RM_ACT_GROUP)
     {
      // g_plan is scratch space; RM_StartPlan copies it into the journal
      if(act == RM_ACT_REDUCE)
         g_plan = g_reducePreview;
      else
        {
         g_plan = g_curGroup;
         g_plan.kind = RM_PLAN_MANUAL;
        }
      if(InpConfirmActions && !RM_PreviewStillValid(g_plan))
        {
         RM_UiMsg("orders changed - review the new preview", C_AMBER);
         RM_PreparePending(act);
         RM_ShowConfirm();
         return;
        }
      ok = RM_ActionExecutePlan(g_plan, msg);
     }
   else if(act == RM_ACT_OPEN_BUY || act == RM_ACT_OPEN_SELL)
      ok = RM_ActionOpen(act == RM_ACT_OPEN_BUY ? RM_BUY : RM_SELL, g_uiRecoveryRole, g_uiLot, msg);
   RM_UiMsg(msg, ok ? C_GREEN : C_RED);
   RM_DashRefresh(true);
  }

void RM_RequestAction(int act)
  {
   if(act == RM_ACT_REDUCE && g_reducePreview.n == 0)
     { RM_UiMsg("reduce: " + RM_ReasonName(g_reducePreview.reason), C_AMBER); return; }
   if(act == RM_ACT_GROUP && g_curGroup.n == 0)
     { RM_UiMsg("no current group to close", C_AMBER); return; }
   if(act == RM_ACT_CLOSE_ALL && g_tot.totalCnt == 0)
     { RM_UiMsg("nothing to close", C_AMBER); return; }
   if(act == RM_ACT_OPEN_BUY || act == RM_ACT_OPEN_SELL)
     {
      double l;
      if(!RM_ReadLotField(l))
         return;
     }
   RM_PreparePending(act);
   if(InpConfirmActions)
      RM_ShowConfirm();
   else
      RM_ExecutePending();
  }

//+------------------------------------------------------------------+
//| Button dispatcher (chart events live, state polling in tester)    |
//+------------------------------------------------------------------+
void RM_OnButton(string name)
  {
   if(StringFind(name, RM_DPFX) != 0)
      return;
   string key = StringSubstr(name, StringLen(RM_DPFX));
   if(ObjectGetInteger(0, name, OBJPROP_TYPE) == OBJ_BUTTON)
      ObjectSetInteger(0, name, OBJPROP_STATE, false);
   uint now = GetTickCount();
   if(now - g_lastClickMs < 300 && !IsTesting())
      return;                                 // debounce double clicks
   g_lastClickMs = now;
   if(g_busy)
      return;
   if(key == "MIN")
     {
      g_minimized = !g_minimized;
      RM_HideConfirm();
      RM_SaveUi();
      RM_DashRelayout();
      return;
     }
   if(key == "SHOW")
     {
      g_panelSize = RM_PANEL_NORMAL;
      RM_DashRelayout();
      return;
     }
   if(key == "OK")     { RM_ExecutePending(); return; }
   if(key == "CANCEL") { RM_HideConfirm(); RM_UiMsg("cancelled", C_DIM); return; }
   if(g_pendingAct != RM_ACT_NONE && (key == "CLOSEALL" || key == "REDUCE" || key == "GROUP" || key == "BUY" || key == "SELL"))
     {
      RM_UiMsg("confirm or cancel the pending action first", C_AMBER);
      return;
     }
   if(key == "STOP")
     {
      RM_ActionStopResume();
      RM_UiMsg(g_state == RM_ST_PAUSED ? "recovery paused" : "resume requested", C_DIM);
     }
   else if(key == "CLOSEALL") RM_RequestAction(RM_ACT_CLOSE_ALL);
   else if(key == "REDUCE")   RM_RequestAction(RM_ACT_REDUCE);
   else if(key == "GROUP")    RM_RequestAction(RM_ACT_GROUP);
   else if(key == "BUY")      RM_RequestAction(RM_ACT_OPEN_BUY);
   else if(key == "SELL")     RM_RequestAction(RM_ACT_OPEN_SELL);
   else if(key == "ROLE")     g_uiRecoveryRole = !g_uiRecoveryRole;
   else if(key == "PLUS" || key == "MINUS")
     {
      double l = g_uiLot;
      RM_ReadLotField(l);
      l += (key == "PLUS" ? g_meta.lotStep : -g_meta.lotStep);
      l = RM_NormalizeLot(MathMax(g_meta.minLot, l), g_meta, RM_ROUND_NEAREST);
      if(l > 0.0)
         g_uiLot = l;
      ObjectSetString(0, RM_DPFX + "LOT", OBJPROP_TEXT, DoubleToString(g_uiLot, 2));
     }
   RM_DashRefresh(true);
  }

void RM_PollTesterButtons()
  {
   if(!IsVisualMode())
      return;
   string keys[] = {"MIN", "SHOW", "OK", "CANCEL", "STOP", "CLOSEALL", "REDUCE", "GROUP", "BUY", "SELL", "ROLE", "PLUS", "MINUS"};
   for(int i = 0; i < ArraySize(keys); i++)
     {
      string n = RM_DPFX + keys[i];
      if(ObjectFind(0, n) >= 0 && ObjectGetInteger(0, n, OBJPROP_STATE) != 0)
         RM_OnButton(n);
     }
  }



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
   RM_Engine();
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

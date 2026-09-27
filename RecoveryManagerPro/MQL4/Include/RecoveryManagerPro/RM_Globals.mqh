//+------------------------------------------------------------------+
//| RM_Globals.mqh - runtime state shared by the MQL4 modules         |
//| Large structs live here (not on the stack).                       |
//+------------------------------------------------------------------+
#ifndef RM_GLOBALS_MQH
#define RM_GLOBALS_MQH

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

//--- central permission gate: who is asking for a trade operation right now
int      g_actor = RM_ACTOR_NONE;
string   g_lastDenied = "";             // last refused automated action (dashboard)

//--- combined-operation controller (persisted)
int      g_ctl = RM_CTL_NORMAL;         // cycle state
bool     g_recLatch = false;            // recovery latch: once set only a completed cycle clears it
int      g_cycleId = 0;
long     g_cycleStart = 0;
long     g_cycleEnd = 0;
double   g_trigValue = 0.0;             // metric value that fired the handover
bool     g_hoSnapshot = false;          // handover: tickets registered
bool     g_hoPendings = false;          // handover: normal pendings cancelled and reconciled
int      g_hoAttempts = 0;
bool     g_engineCycleEnded = false;    // recovery engine reached COMPLETE for this cycle
int      g_cycleOutcome = RM_OUT_NONE;
bool     g_cycleEmergency = false;
bool     g_cycleManual = false;
double   g_cycleRealized = 0.0;         // realised net of the last finished cycle
bool     g_normalEnabled = true;        // operator switch for normal entries
bool     g_normalHalted = false;        // needs an explicit operator reset (emergency / manual end)
bool     g_operatorResume = false;      // explicit operator resume command pending
bool     g_forceStart = false;          // Start Recovery Now in RECOVERY_ONLY mode
long     g_lastSignalBar = 0;           // open time of the last processed closed signal candle
int      g_lastSignal = 0;              // +1 BUY / -1 SELL / 0 none on that candle
long     g_freshAfter = 0;              // crossovers on candles opened before this are stale
long     g_normLastAvgBar[2];           // per direction: signal candle of the last averaging order
double   g_normalRealized = 0.0;        // realised net of normal-strategy closures (session)
string   g_lastReason = "";             // last handover / block reason
int      g_journalActor = RM_ACTOR_NONE; // actor that owns the open journal

//--- distance-unit service state (see RM_DistanceSvc.mqh)
struct RM_DistInfo
  {
   string            symbol;
   int               profile;
   int               source;
   int               mode;
   double            unitPrice;       // price value of ONE configured unit (0 = undefined)
   double            brokerPoint;     // price value of one broker point
   double            tickPrice;       // executable tick size in PRICE units
   int               digits;
   bool              metaValid;       // point/tick usable for orders
   bool              valid;           // metaValid AND unit defined
   string            why;
  };

struct RM_DistCtx
  {
   bool              active;
   int               mode;
   int               profile;
   double            unitPrice;
   double            stepBasePrice;   // recovery: base grid step / normal: averaging step (price)
   double            stepMult;        // recovery only
   double            tpPrice;         // normal virtual TP (price)
   double            overlapPrice;    // normal overlap target distance (price)
   double            partialTPPrice;  // recovery partial-close TP distance (price)
   double            bufferPrice;     // recovery execution buffer (price per closed lot)
   long              since;
  };

RM_DistInfo g_dist;
RM_DistCtx  g_ctxRec;                 // unit context of the active recovery cycle
RM_DistCtx  g_ctxNorm;                // unit context of the open normal basket
double      g_recReqSpacing[2];       // last requested recovery spacing (price) per direction
double      g_recEffSpacing[2];       // last effective (tick-rounded) spacing
double      g_normNextLevel[2];       // next normal averaging level per direction
string      g_migrationText = "";

#endif

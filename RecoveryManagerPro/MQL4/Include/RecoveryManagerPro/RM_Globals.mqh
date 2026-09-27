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

#endif

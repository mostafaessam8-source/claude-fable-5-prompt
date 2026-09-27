//+------------------------------------------------------------------+
//| RM_Controller.mqh - the single authoritative controller for the   |
//| operating cycle                                                    |
//|                                                                   |
//|   NORMAL -> HANDOVER -> RECOVERY_ACTIVE (-> RECOVERY_CLOSING)     |
//|          -> COOLDOWN -> NORMAL        (+ PAUSED, ERROR_HOLD)      |
//|                                                                   |
//| Priority on every tick:                                           |
//|  1 emergency protection   2 reconcile unfinished operations       |
//|  3 active handover / recovery   4 drawdown-trigger evaluation     |
//|  5 normal basket management     6 normal averaging and entries    |
//|                                                                   |
//| The recovery latch is persisted before any further trading action |
//| and is cleared ONLY by a verified, reconciled cycle completion -  |
//| never by drawdown improving or by a threshold change.             |
//| RECOVERY_ONLY mode bypasses this file and runs the original       |
//| engine unchanged.                                                 |
//+------------------------------------------------------------------+
#ifndef RM_CONTROLLER_MQH
#define RM_CONTROLLER_MQH

#define RM_HO_MAX_ATTEMPTS 10

double g_ctlDDMoney = 0.0;
double g_ctlDDPct = 0.0;
double g_ctlProgress = 0.0;
string g_ctlStatus = "";
int    g_cooldownBars = 0;

string RM_TrigUnit()
  {
   return (InpRecoveryTriggerMode == RM_TRIG_PERCENT) ? "%" : AccountCurrency();
  }

void RM_CtlComputeMetrics()
  {
   RM_TriggerMetrics(InpRecoveryTriggerScope, g_normalNet, AccountBalance(), AccountEquity(), g_ctlDDMoney, g_ctlDDPct);
   g_ctlProgress = RM_TriggerProgress(InpRecoveryTriggerMode, g_ctlDDMoney, g_ctlDDPct, InpLaunchDrawdown);
  }

double RM_TrigMetricValue()
  {
   return (InpRecoveryTriggerMode == RM_TRIG_PERCENT) ? g_ctlDDPct : g_ctlDDMoney;
  }

void RM_CtlSet(int ns, string why)
  {
   if(ns == g_ctl)
      return;
   RM_Audit("CYCLE_STATE", g_cycleId, 0, 0, RM_CtlName(g_ctl) + " -> " + RM_CtlName(ns) + (why != "" ? " (" + why + ")" : ""));
   g_ctl = ns;
   RM_SaveState();
  }

bool RM_CtlOwnError()
  {
   return g_ctl == RM_CTL_ERROR_HOLD && g_state != RM_ST_ERROR_HOLD && !g_hoPendings;
  }

//+------------------------------------------------------------------+
//| Open market orders that belong to the cycle (by identity, never   |
//| by comment): registered tickets + recovery/lock/normal magics.    |
//+------------------------------------------------------------------+
int RM_CycleOrdersOpen()
  {
   int c = 0;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
         continue;
      if(OrderSymbol() != g_sym || OrderType() > OP_SELL)
         continue;
      int m = OrderMagicNumber();
      if(m == InpRecoveryMagic || m == InpLockMagic || m == InpNormalMagic || RM_RegFind(OrderTicket()) >= 0)
         c++;
     }
   return c;
  }

string RM_NormalTicketList()
  {
   string s = "";
   for(int i = 0; i < g_nbook.n; i++)
      s += "#" + IntegerToString(g_nbook.ticket[i]) + " " + RM_Side(g_nbook.type[i]) + " " + RM_Lots(g_nbook.lots[i]) +
           " " + RM_Money(RM_LegNet(g_nbook, i)) + "; ";
   return s;
  }

//+------------------------------------------------------------------+
//| Handover: steps 1-2 (latch persisted, normal entries disabled),   |
//| step 9 (record). Steps 3-8 run in RM_CtlHandoverStep / engine.    |
//+------------------------------------------------------------------+
void RM_StartHandover(string reason, double value)
  {
   g_recLatch = true;
   g_cycleId++;
   g_cycleStart = (long)TimeCurrent();
   g_cycleEnd = 0;
   g_trigValue = value;
   g_hoSnapshot = false;
   g_hoPendings = false;
   g_hoAttempts = 0;
   g_engineCycleEnded = false;
   g_cycleOutcome = RM_OUT_NONE;
   g_cycleEmergency = false;
   g_cycleManual = false;
   g_lastReason = reason;
   g_ctl = RM_CTL_HANDOVER;
   RM_SaveState();                                   // latch is durable before anything else
   double ml = (AccountMargin() > 0.0) ? AccountEquity() / AccountMargin() * 100.0 : 0.0;
   RM_Audit("HANDOVER", g_cycleId, g_normalLots, value,
            reason + " | value " + DoubleToString(value, 2) + " threshold " + DoubleToString(InpLaunchDrawdown, 2) + " " +
            RM_TrigUnit() + " scope " + RM_Pick(InpRecoveryTriggerScope == RM_TSCOPE_ACCOUNT, "ACCOUNT", "MANAGED") +
            " | tickets " + RM_NormalTicketList() + "| balance " + RM_Money(AccountBalance()) +
            " equity " + RM_Money(AccountEquity()) + " free margin " + RM_Money(AccountFreeMargin()) +
            " margin level " + DoubleToString(ml, 0) + "%");
   RM_Notify("recovery cycle " + IntegerToString(g_cycleId) + " started: " + reason);
   RM_CtlHandoverStep();
  }

//+------------------------------------------------------------------+
//| Handover steps 3-7. Each completed step is persisted and never    |
//| repeated; a failure keeps the controller in HANDOVER / ERROR_HOLD.|
//+------------------------------------------------------------------+
void RM_CtlHandoverStep()
  {
   if(RM_JournalOpen())
     {
      g_ctlStatus = "handover: finishing an already-started closure first";
      return;
     }
   if(!g_hoSnapshot)
     {
      // 3 + 7: snapshot and register the basket as ORIGINAL (magic numbers unchanged)
      RM_NormalScan();
      string list = RM_NormalTicketList();
      int n = 0;
      for(int i = 0; i < g_nbook.n; i++)
         if(RM_RegAdd(g_nbook.ticket[i], RM_ROLE_ORIGINAL, g_nbook.type[i], g_nbook.lots[i], 0, 0,
                      g_nbook.openPrice[i], g_nbook.openTime[i]))
            n++;
      g_hoSnapshot = true;
      RM_SaveState();
      RM_Audit("HANDOVER_SNAPSHOT", g_cycleId, 0, n, "registered as ORIGINAL: " + (n > 0 ? list : "none"));
      RM_NormalScan();                             // 5: transferred tickets leave normal management
     }
   if(!g_hoPendings)
     {
      // 4: cancel only managed normal-strategy pending entries, then reconcile
      int prevActor = g_actor;
      g_actor = RM_ACTOR_HANDOVER;
      for(int k = OrdersTotal() - 1; k >= 0; k--)
        {
         if(!OrderSelect(k, SELECT_BY_POS, MODE_TRADES))
            continue;
         if(OrderSymbol() != g_sym || OrderMagicNumber() != InpNormalMagic || OrderType() <= OP_SELL)
            continue;
         int t = OrderTicket();
         string err = "";
         if(RM_DeletePending(t, err))
            RM_Audit("HANDOVER_PENDING_CANCELLED", t, 0, 0, "");
         else
            RM_Audit("HANDOVER_PENDING_FAILED", t, 0, 0, err);
        }
      g_actor = prevActor;
      if(RM_NormalPendingCount() == 0)
        {
         g_hoPendings = true;
         RM_SaveState();
         RM_Audit("HANDOVER_READY", g_cycleId, 0, 0, "pending orders reconciled; recovery engine takes over (SL/TP policy applied at launch)");
        }
      else
        {
         g_hoAttempts++;
         g_ctlStatus = "handover: normal pending orders still open (attempt " + IntegerToString(g_hoAttempts) + ")";
         if(g_hoAttempts >= RM_HO_MAX_ATTEMPTS)
           {
            g_errorText = "handover could not cancel normal pending orders";
            RM_CtlSet(RM_CTL_ERROR_HOLD, g_errorText);
           }
         RM_SaveState();
        }
     }
  }

//+------------------------------------------------------------------+
//| Mirror the recovery engine state while the latch is set           |
//+------------------------------------------------------------------+
void RM_CtlSync()
  {
   if(RM_CtlOwnError() || g_engineCycleEnded)
      return;                                        // completion is decided by RM_CtlCheckCompletion
   int ns = RM_CTL_HANDOVER;
   if(g_state == RM_ST_ERROR_HOLD)
      ns = RM_CTL_ERROR_HOLD;
   else if(g_state == RM_ST_PAUSED)
      ns = RM_CTL_PAUSED;
   else if(g_state == RM_ST_CLOSING)
      ns = RM_CTL_RECOVERY_CLOSING;
   else if((g_state == RM_ST_LOCKING || g_state == RM_ST_RECOVERING) && g_prepDone)
      ns = RM_CTL_RECOVERY_ACTIVE;
   RM_CtlSet(ns, "");
  }

//+------------------------------------------------------------------+
//| Completion = nothing of the cycle left open, no pending that     |
//| could reopen it, no unfinished closure, result reconciled.        |
//+------------------------------------------------------------------+
void RM_CtlCheckCompletion()
  {
   if(!g_recLatch || !g_hoSnapshot || !g_hoPendings)
      return;
   if(!(g_engineCycleEnded || g_state == RM_ST_IDLE))
      return;
   if(RM_JournalOpen())
      return;
   int open = RM_CycleOrdersOpen();
   int pend = RM_NormalPendingCount();
   if(g_regCount > 0 || open > 0 || pend > 0)
     {
      g_ctlStatus = "completion pending: " + IntegerToString(open) + " orders, " + IntegerToString(pend) + " pending";
      return;
     }
   g_cycleRealized = g_realizedSession;
   g_cycleOutcome = g_cycleEmergency ? RM_OUT_EMERGENCY : (g_cycleManual ? RM_OUT_MANUAL : RM_OUT_COMPLETED);
   g_cycleEnd = (long)TimeCurrent();
   g_freshAfter = g_cycleEnd;
   g_recLatch = false;
   g_engineCycleEnded = false;
   g_hoSnapshot = false;
   g_hoPendings = false;
   g_normLastAvgBar[0] = 0;
   g_normLastAvgBar[1] = 0;
   g_operatorResume = false;
   if(g_cycleOutcome != RM_OUT_COMPLETED)
      g_normalHalted = true;                         // emergency / manual end: operator reset required
   long dur = g_cycleEnd - g_cycleStart;
   RM_Audit("CYCLE_END", g_cycleId, 0, g_cycleRealized,
            RM_OutcomeName(g_cycleOutcome) + " | realised net " + RM_Money(g_cycleRealized) + " " + AccountCurrency() +
            " (all cycle closures incl. costs; the transferred orders' full P/L is included) | duration " +
            IntegerToString(dur / 3600) + "h" + IntegerToString((dur % 3600) / 60) + "m");
   RM_Notify("recovery cycle " + IntegerToString(g_cycleId) + " ended: " + RM_OutcomeName(g_cycleOutcome) +
             ", realised " + RM_Money(g_cycleRealized) + " " + AccountCurrency());
   g_lastReason = "cycle " + IntegerToString(g_cycleId) + " " + RM_OutcomeName(g_cycleOutcome);
   RM_CtlSet(RM_CTL_COOLDOWN, "cycle complete");
  }

//+------------------------------------------------------------------+
//| COOLDOWN -> NORMAL                                                |
//+------------------------------------------------------------------+
void RM_CtlCooldown()
  {
   int bars = iBarShift(g_sym, InpSignalTF, (datetime)g_cycleEnd, false);
   g_cooldownBars = (bars < 0) ? 0 : bars;
   if(!RM_ResumeAllowed(g_cycleOutcome, g_normalHalted, InpAutoResumeAfterRecovery, g_operatorResume,
                        g_cooldownBars, InpResumeCooldownBars))
     {
      if(g_cooldownBars < InpResumeCooldownBars)
         g_ctlStatus = "cooldown " + IntegerToString(g_cooldownBars) + "/" + IntegerToString(InpResumeCooldownBars) + " bars";
      else
         g_ctlStatus = "waiting for operator: press Normal ON to resume (" + RM_OutcomeName(g_cycleOutcome) + ")";
      return;
     }
   // recheck the trigger and risk limits before resuming
   RM_CtlComputeMetrics();
   if(RM_TriggerHit(InpRecoveryTriggerMode, g_ctlDDMoney, g_ctlDDPct, InpLaunchDrawdown, AccountBalance()))
     {
      g_ctlStatus = "resume held: drawdown still at/above the threshold";
      return;
     }
   if(g_operatorResume)
     {
      g_normalHalted = false;
      g_normalEnabled = true;
     }
   g_operatorResume = false;
   RM_Audit("RESUME_NORMAL", g_cycleId, 0, 0, "after " + IntegerToString(g_cooldownBars) + " bars; fresh crossover required: " +
            RM_Pick(InpRequireFreshSignalAfterRecovery, "yes", "no"));
   RM_CtlSet(RM_CTL_NORMAL, "cooldown over");
  }

//+------------------------------------------------------------------+
//| Emergency-loss limit on the NORMAL basket (the recovery engine    |
//| applies it to transferred baskets). Distinct from the recovery    |
//| launch threshold; validation keeps it above that threshold.       |
//| Returns true while an emergency closure is in progress.           |
//+------------------------------------------------------------------+
bool RM_NormalEmergency()
  {
   if(InpEmergencyMode == RM_EMG_OFF || g_normalCnt == 0)
      return false;
   double dd = MathMax(0.0, -g_normalNet);
   double pct = (AccountBalance() > 0.0) ? 100.0 * dd / AccountBalance() : 0.0;
   bool hit = (InpEmergencyMode == RM_EMG_MONEY && dd >= InpEmergencyValue) ||
              (InpEmergencyMode == RM_EMG_PERCENT && pct >= InpEmergencyValue);
   if(!hit)
      return false;
   if(!g_normalHalted)
     {
      g_normalHalted = true;
      g_lastReason = "emergency-loss limit on normal basket: " + RM_Money(dd) + " (" + DoubleToString(pct, 2) + "%)";
      RM_Audit("EMERGENCY_NORMAL", 0, g_normalLots, -dd, g_lastReason);
      RM_Notify("EMERGENCY: " + g_lastReason);
      RM_SaveState();
     }
   if(InpEmergencyAction != RM_EMGA_CLOSE_ALL)
      return false;                                  // pause action: entries halted, basket kept
   if(RM_JournalOpen())
      return true;
   RM_IndexList L;
   L.n = 0;
   for(int i = 0; i < g_nbook.n && L.n < RM_MAX_PLAN_LEGS; i++)
      L.idx[L.n++] = i;
   RM_PlanListed(g_nbook, g_cfg, g_mpp, RM_PLAN_NORMAL_EMERGENCY, L, -1.0, g_plan);
   int prevActor = g_actor;
   g_actor = RM_ACTOR_EMERGENCY;
   RM_StartPlan(g_plan);
   g_actor = prevActor;
   return true;
  }

//+------------------------------------------------------------------+
//| Trigger evaluation with fresh prices (every tick and immediately  |
//| before each normal entry / averaging). Returns true when normal   |
//| trading must not act now (handover started or entries blocked).  |
//+------------------------------------------------------------------+
bool RM_TriggerCheckNow()
  {
   if(g_recLatch)
      return true;
   if(!RM_Combined() || g_ctl != RM_CTL_NORMAL)
      return false;
   RefreshRates();
   RM_NormalScan();
   RM_CtlComputeMetrics();
   if(!RM_TriggerHit(InpRecoveryTriggerMode, g_ctlDDMoney, g_ctlDDPct, InpLaunchDrawdown, AccountBalance()))
      return false;
   double v = RM_TrigMetricValue();
   if(g_normalCnt == 0)
     {
      // account-level drawdown caused by positions outside the scope: never trade them
      string r = "account drawdown " + DoubleToString(v, 2) + " " + RM_TrigUnit() + " >= threshold with no managed basket: normal entries blocked";
      if(g_lastReason != r)
        {
         g_lastReason = r;
         RM_Audit("TRIGGER_NO_BASKET", 0, 0, v, r);
        }
      g_normalBlock = r;
      return true;
     }
   RM_StartHandover("drawdown trigger", v);
   return true;
  }

//+------------------------------------------------------------------+
//| THE controller tick                                               |
//+------------------------------------------------------------------+
void RM_ControllerTick()
  {
   if(InpOperatingMode == RM_OP_RECOVERY_ONLY)
     {
      RM_Engine();                                   // original behaviour, unchanged
      return;
     }
   RM_RefreshMeta();
   RM_NormalScan();
   bool newBar = false;
   int sig = RM_NormalSignalEval(newBar);            // consumed in every state: no stale reuse
   RM_CtlComputeMetrics();
   g_normalBlock = "";
   g_ctlStatus = "";

   // 1. emergency protection
   if(!g_recLatch && RM_NormalEmergency())
     {
      RM_Engine();
      return;
     }
   // 2. reconcile unfinished trade operations
   if(RM_JournalOpen())
     {
      RM_RunJournal();
      RM_NormalScan();
     }
   // 3. active handover / recovery (exclusive manager of the transferred basket)
   if(g_recLatch)
     {
      if(g_ctl == RM_CTL_HANDOVER)
         RM_CtlHandoverStep();
      RM_Engine();
      RM_CtlSync();
      RM_CtlCheckCompletion();
      if(g_recLatch)
         g_normalBlock = "recovery cycle " + IntegerToString(g_cycleId) + " active";
      return;
     }
   RM_Engine();                                      // monitoring: the gate refuses trades without a latch
   if(g_ctl == RM_CTL_COOLDOWN || g_ctl != RM_CTL_NORMAL)
     {
      if(g_ctl == RM_CTL_COOLDOWN)
         RM_CtlCooldown();
      else if(!g_recLatch)
         RM_CtlSet(RM_CTL_NORMAL, "no active cycle");
      if(g_ctl != RM_CTL_NORMAL)
        {
         g_normalBlock = g_ctlStatus;
         return;
        }
     }
   // 4. drawdown-trigger evaluation
   if(RM_TriggerCheckNow())
     {
      if(g_recLatch)
        {
         RM_Engine();                                // hand over on this same executable event
         RM_CtlSync();
        }
      return;
     }
   // 5. normal basket management
   if(RM_JournalOpen())
      return;
   int prevActor = g_actor;
   g_actor = RM_ACTOR_NORMAL;
   if(!RM_NormalManage())
      // 6. normal averaging and new entries
      RM_NormalEntries(newBar, sig);
   g_actor = prevActor;
   if(g_normalBlock == "" && (!g_normalEnabled || g_normalHalted))
      g_normalBlock = g_normalHalted ? "halted - operator reset required" : "normal entries disabled by operator";
  }

//+------------------------------------------------------------------+
//| Restart: reconcile broker orders before enabling either engine    |
//+------------------------------------------------------------------+
void RM_CtlReconcileOnStart()
  {
   if(InpOperatingMode == RM_OP_RECOVERY_ONLY)
      return;
   RM_NormalScan();
   int recOrders = 0;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
      if(OrderSelect(i, SELECT_BY_POS, MODE_TRADES) && OrderSymbol() == g_sym && OrderType() <= OP_SELL &&
         (OrderMagicNumber() == InpRecoveryMagic || OrderMagicNumber() == InpLockMagic))
         recOrders++;
   bool cycleEvidence = (g_regCount > 0 || recOrders > 0 || (RM_JournalOpen() && !RM_IsNormalKind(g_journal.kind)));
   if(RM_Combined() && cycleEvidence && !g_recLatch)
     {
      g_recLatch = true;
      g_hoSnapshot = false;                          // re-register any unregistered normal tickets
      g_hoPendings = false;
      g_ctl = RM_CTL_HANDOVER;
      RM_Audit("RESTART_LATCH", g_cycleId, 0, recOrders, "recovery state found on restart: latch restored, normal trading disabled");
     }
   if(g_recLatch && (g_ctl == RM_CTL_NORMAL || g_ctl == RM_CTL_COOLDOWN))
      g_ctl = RM_CTL_HANDOVER;
   if(InpOperatingMode == RM_OP_THREE_MA_ONLY && cycleEvidence)
      RM_Audit("WARNING", 0, 0, recOrders, "recovery/lock orders exist but THREE_MA_ONLY never manages them");
   RM_Audit("CYCLE_RESTORE", g_cycleId, 0, 0, RM_CtlName(g_ctl) + " latch " + RM_Pick(g_recLatch, "ON", "off"));
   RM_SaveState();
  }

//+------------------------------------------------------------------+
//| Operator commands (dashboard). None can bypass the latch.         |
//+------------------------------------------------------------------+
void RM_CmdToggleNormal(string &msg)
  {
   if(InpOperatingMode == RM_OP_RECOVERY_ONLY)
     { msg = "normal trading is not used in RECOVERY_ONLY"; return; }
   if(g_ctl == RM_CTL_COOLDOWN)
     {
      g_operatorResume = true;
      msg = "resume requested: normal trading restarts after the cooldown";
     }
   else if(g_normalHalted)
     {
      g_normalHalted = false;
      g_normalEnabled = true;
      msg = "normal trading reset by operator";
     }
   else
     {
      g_normalEnabled = !g_normalEnabled;
      msg = "normal entries " + RM_Pick(g_normalEnabled, "enabled", "disabled");
      if(g_recLatch && g_normalEnabled)
         msg += " (still blocked until the recovery cycle completes)";
     }
   RM_Audit("OPERATOR", 0, 0, 0, msg);
   RM_SaveState();
  }

bool RM_CmdStartRecovery(string &msg)
  {
   if(InpOperatingMode == RM_OP_THREE_MA_ONLY)
     { msg = "recovery is disabled in THREE_MA_ONLY"; return false; }
   if(InpOperatingMode == RM_OP_RECOVERY_ONLY)
     {
      if(g_state != RM_ST_ARMED)
        { msg = "nothing armed to launch (" + RM_StateName(g_state) + ")"; return false; }
      g_forceStart = true;
      RM_Audit("OPERATOR", 0, 0, 0, "start recovery now");
      msg = "recovery launch requested";
      return true;
     }
   if(g_recLatch)
     { msg = "recovery cycle already active"; return false; }
   RM_NormalScan();
   if(g_normalCnt == 0)
     { msg = "no normal basket to transfer"; return false; }
   RM_CtlComputeMetrics();
   RM_StartHandover("operator: Start Recovery Now", RM_TrigMetricValue());
   msg = "handover started (cycle " + IntegerToString(g_cycleId) + ")";
   return true;
  }

void RM_CmdPauseRecovery(string &msg)
  {
   if(RM_CtlOwnError())
     {
      g_hoAttempts = 0;
      g_errorText = "";
      RM_CtlSet(RM_CTL_HANDOVER, "operator retry");
      msg = "handover retry";
      return;
     }
   if(RM_Combined() && !g_recLatch)
     { msg = "no active recovery cycle (monitoring only)"; return; }
   RM_ActionStopResume();
   msg = (g_state == RM_ST_PAUSED) ? "recovery paused" : "recovery resume requested";
  }

bool RM_CmdCloseBasket(string &msg)
  {
   if(InpOperatingMode == RM_OP_RECOVERY_ONLY || g_recLatch)
     {
      if(g_recLatch)
         g_cycleManual = true;                       // early termination: operator reset needed later
      return RM_ActionCloseAll(msg);
     }
   RM_NormalScan();
   if(g_normalCnt == 0)
     { msg = "no managed basket open"; return false; }
   if(RM_JournalOpen())
     { msg = "a closure is already in progress"; return false; }
   RM_IndexList L;
   L.n = 0;
   for(int i = 0; i < g_nbook.n && L.n < RM_MAX_PLAN_LEGS; i++)
      L.idx[L.n++] = i;
   RM_PlanListed(g_nbook, g_cfg, g_mpp, RM_PLAN_NORMAL_CLOSE, L, -1.0, g_plan);
   RM_Audit("OPERATOR", 0, g_normalLots, g_plan.expectedNet, "close normal basket");
   RM_StartPlan(g_plan);                             // runs as OPERATOR (set by the button handler)
   msg = "closing the normal basket";
   return true;
  }

#endif

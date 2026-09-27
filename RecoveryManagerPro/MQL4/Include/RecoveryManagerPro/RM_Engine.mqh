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
#ifndef RM_ENGINE_MQH
#define RM_ENGINE_MQH

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
   g_basketStopUntil[0] = 0; g_basketStopUntil[1] = 0;
   g_highIndex[0] = -1;   g_highIndex[1] = -1;
   g_nextLevel[0] = 0;    g_nextLevel[1] = 0;
   RM_JournalClear(g_journal);
   RM_PlanReset(g_curGroup, RM_PLAN_NONE);
   RM_PlanReset(g_reducePreview, RM_PLAN_REDUCE);
   RM_PlanReset(g_confirmPlan, RM_PLAN_NONE);
   g_regCount = 0;
   g_pendCount = 0;
   RM_DayRoll();
   // controller fields: defaults first, the state file (if any) restores them
   g_ctl = RM_CTL_NORMAL; g_recLatch = false; g_hoSnapshot = false; g_hoPendings = false; g_hoAttempts = 0;
   g_engineCycleEnded = false; g_cycleOutcome = RM_OUT_NONE; g_cycleEmergency = false; g_cycleManual = false;
   g_normalEnabled = true; g_normalHalted = false; g_operatorResume = false; g_forceStart = false;
   g_journalActor = RM_ACTOR_NONE; g_actor = RM_ACTOR_NONE;
   RM_CtxClear(g_ctxRec);
   RM_CtxClear(g_ctxNorm);
   g_frozen = false;
   g_haltUntil = 0;
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
   RM_CtxClear(g_ctxRec);                     // next cycle uses the current units
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
   if(ns == RM_ST_PREPARING)
     {
      g_forceStart = false;
      if(!g_ctxRec.active)
         RM_CtxCaptureRec("recovery cycle launched");   // the cycle keeps these units until COMPLETE
     }
   if(ns == RM_ST_COMPLETE)
     {
      g_engineCycleEnded = true;             // the controller verifies and closes the cycle
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
   int prevActor = g_actor;
   g_actor = RM_ACTOR_RECOVERY;             // every engine operation passes the gate as RECOVERY
   RM_RefreshMeta();
   // point-based profit inputs: distance units -> PRICE -> existing money-per-broker-point model
   double ptp = RM_RecPartialTPBrokerPts();
   g_cfg.partialTPPoints = (ptp >= 0.0) ? ptp : 1e12;        // undefined units: no automatic group close
   g_cfg.execBufferPoints = RM_RecBufferBrokerPts();
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
        {
         g_closeRequested = true;
         g_cycleEmergency = true;           // cycle outcome: emergency, never auto-resumed
        }
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
   if(InpOperatingMode == RM_OP_RECOVERY_ONLY)
      si.launchTriggered = g_forceStart ||
                           RM_LaunchTriggered(InpLaunchMode, g_managedNet, AccountBalance(),
                                              InpLaunchDrawdown, g_tot.origCnt > 0);
   else
      // combined mode: ONLY the controller's latch launches recovery (immediate-start ignored)
      si.launchTriggered = RM_Combined() && g_recLatch && g_hoSnapshot && g_hoPendings && g_tot.origCnt > 0;
   string rdy = "";
   if(si.launchTriggered && !g_launchDone && !RM_NewBasketReady(rdy))
     {
      si.launchTriggered = false;             // a new cycle needs defined distances
      g_block = rdy;
     }
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
           {
            string rw = "";
            if(!RM_NewBasketReady(rw))
               g_status = "Armed, launch blocked: " + rw;
           }
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
   g_actor = prevActor;
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
   g_cfg.crossFinance = RM_CrossFinanceActive();
   // ---- basket loss limit: a recovery basket that went too far against the market is cut
   if(RM_BasketStop())
      return;
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
//| Recovery basket loss limit (InpRecBasketStopPct of balance):      |
//| closes every recovery order of that direction and blocks a new    |
//| basket in that direction for InpEmergencyCooldownBars candles.    |
//| Main (original + lock) orders are not touched.                    |
//+------------------------------------------------------------------+
bool RM_BasketStop()
  {
   if(InpRecBasketStopPct <= 0.0 || AccountBalance() <= 0.0)
      return false;
   double limit = -InpRecBasketStopPct / 100.0 * AccountBalance();
   for(int d = 0; d < 2; d++)
     {
      int cnt = (d == RM_BUY) ? g_tot.recBuyCnt : g_tot.recSellCnt;
      double pl = (d == RM_BUY) ? g_tot.recBuyPL : g_tot.recSellPL;
      if(cnt == 0 || pl > limit)
         continue;
      RM_IndexList L;
      L.n = RM_RecoveryLegs(g_book, d, L);
      RM_PlanListed(g_book, g_cfg, g_mpp, RM_PLAN_BASKET_STOP, L, -1.0, g_plan);
      if(g_plan.n == 0)
         continue;
      g_basketStopUntil[d] = (long)TimeCurrent() + (long)InpEmergencyCooldownBars * PeriodSeconds(InpSignalTF);
      RM_Audit("BASKET_STOP", 0, 0, pl, RM_Side(d) + " recovery basket " + RM_Money(pl) + " <= limit " +
               RM_Money(limit) + " (" + DoubleToString(InpRecBasketStopPct, 1) + "% of balance): closed, new " +
               RM_Side(d) + " basket blocked for " + IntegerToString(InpEmergencyCooldownBars) + " candles");
      RM_StartPlan(g_plan);
      return true;
     }
   return false;
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
   if(!RM_RecDistanceUsable())
     {
      string rw2 = "";
      RM_NewBasketReady(rw2);
      g_block = rw2;                         // no stored context and no defined distances
      g_status = g_block;
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
   // units -> requested price (multiplier on the unrounded base) -> tick-rounded spacing -> target
   double reqPrice = RM_RecStepRequestedPrice(idx);
   if(reqPrice <= 0.0)
     {
      g_nextLevel[dir] = 0;
      g_block = RM_UNDEFINED_MSG;
      return;
     }
   double effPrice = RM_EffectiveSpacing(reqPrice, RM_TickPrice());
   double level = RM_GridTargetPrice(dir, g_book.openPrice[last], effPrice, RM_TickPrice());
   g_recReqSpacing[dir] = reqPrice;
   g_recEffSpacing[dir] = effPrice;
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
               (long)TimeCurrent() >= g_basketStopUntil[d] &&
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
   double raw = manual ? manualLot : RM_GridRawLot(RM_RecFirstLot(), InpLotMultiplier, idx);
   if(InpCapBehavior == RM_CAP_REFUSE && raw > g_meta.maxLot + RM_EPS)
     {
      g_block = "recovery lot " + DoubleToString(raw, 3) + " exceeds broker maximum - refused";
      return false;
     }
   double lot = RM_NormalizeLot(raw, g_meta, InpLotRounding);
   if(lot <= 0.0 && raw > 0.0 && !manual && InpNormalLotMode == RM_NLOT_BALANCE)
      lot = g_meta.minLot;                 // balance-scaled lot below the minimum: use the minimum
   if(lot <= 0.0)
     {
      g_block = "recovery lot " + DoubleToString(raw, 3) + " below broker minimum";
      return false;
     }
   if(RM_LotExceedsCap(lot, InpMaxRecoveryLot * RM_BalanceScale()))
     {
      if(InpCapBehavior == RM_CAP_REFUSE)
        {
         g_block = "recovery lot " + RM_Lots(lot) + " exceeds maximum " + RM_Lots(InpMaxRecoveryLot * RM_BalanceScale()) + " - refused";
         RM_Audit("ENTRY_REFUSED", 0, lot, 0, g_block);
         return false;
        }
      lot = RM_NormalizeLot(InpMaxRecoveryLot * RM_BalanceScale(), g_meta, RM_ROUND_DOWN);
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
   g_cfg.crossFinance = RM_CrossFinanceActive();
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
   if(asRecovery && InpOperatingMode != RM_OP_RECOVERY_ONLY && !g_recLatch)
     { msg = "no recovery cycle active - manual RECOVERY orders are not allowed"; return false; }
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
   // in the Three-MA modes a manual non-recovery order outside a cycle joins the NORMAL basket
   bool asNormal = (InpOperatingMode != RM_OP_RECOVERY_ONLY && !g_recLatch);
   if(asNormal && !g_normalEnabled)
     { msg = "normal entries are disabled"; return false; }
   g_reqSeq++;
   string tag = "#" + IntegerToString(g_reqSeq);
   string cmt = RM_CommentPrefix() + (asNormal ? "N " : "O ") + tag;
   RM_SaveState();
   string err = "";
   int t = RM_Send(dir, lot, asNormal ? InpNormalMagic : InpManualOriginalMagic, cmt, tag, err);
   if(t <= 0)
     { msg = "open failed: " + err; RM_Audit("MANUAL_FAILED", 0, lot, 0, err); return false; }
   if(asNormal)
     {
      RM_Audit("MANUAL_NORMAL", t, lot, 0, RM_Side(dir));
      RM_SaveState();
      msg = "manual NORMAL " + RM_Side(dir) + " " + RM_Lots(lot) + " opened (#" + IntegerToString(t) + ")";
      return true;
     }
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
   int prevActor = g_actor;
   g_actor = RM_ACTOR_TEST;
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
   g_actor = prevActor;
  }

#endif

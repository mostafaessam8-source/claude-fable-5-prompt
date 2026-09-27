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
#ifndef RM_EXECUTOR_MQH
#define RM_EXECUTOR_MQH

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

#endif

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
#ifndef RM_REGISTRY_MQH
#define RM_REGISTRY_MQH

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

#endif

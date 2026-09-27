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
#ifndef RM_PLANNER_MQH
#define RM_PLANNER_MQH

#include "RM_Types.mqh"
#include "RM_Calc.mqh"

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
//| Close the listed book legs in full (normal-strategy closures).    |
//| targetMoney < 0 = unconditional.                                    |
//+------------------------------------------------------------------+
void RM_PlanListed(const RM_Book &b, const RM_PlanConfig &c, double mpp, int kind,
                   const RM_IndexList &list, double targetMoney, RM_Plan &p)
  {
   RM_PlanReset(p, kind);
   for(int k = 0; k < list.n; k++)
      if(!RM_PlanAddLeg(p, b, list.idx[k], b.lots[list.idx[k]], c))
         return;
   if(p.n == 0)
     {
      p.reason = RM_R_NO_MAIN;
      return;
     }
   RM_PlanTotals(p, c, mpp);
   p.target = MathMax(0.0, targetMoney);
   p.qualifies = (targetMoney < 0.0) || (p.expectedNet >= targetMoney - 1e-9);
   if(!p.qualifies)
      p.reason = RM_R_BELOW_TARGET;
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

#endif

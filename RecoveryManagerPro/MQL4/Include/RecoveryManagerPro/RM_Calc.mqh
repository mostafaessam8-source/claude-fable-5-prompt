//+------------------------------------------------------------------+
//| RM_Calc.mqh                                                       |
//| Pure calculations: lots, money conversion, grid, gates, totals.   |
//| Portable MQL4/C++ subset (see RM_Types.mqh header).               |
//+------------------------------------------------------------------+
#ifndef RM_CALC_MQH
#define RM_CALC_MQH

#include "RM_Types.mqh"

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

//====================================================================
// Combined operation: pure helpers (unit-tested natively)
//====================================================================

//+------------------------------------------------------------------+
//| Balance-relative FLOATING drawdown (not peak-to-trough history).  |
//| MANAGED: money = max(0, -managedFloatingNet)                       |
//| ACCOUNT: money = max(0, balance - equity)                          |
//| percent = 100 * money / balance ; 0 when balance <= 0 (guard)      |
//+------------------------------------------------------------------+
void RM_TriggerMetrics(int scope, double managedFloatingNet, double balance, double equity,
                       double &ddMoney, double &ddPct)
  {
   if(scope == RM_TSCOPE_ACCOUNT)
      ddMoney = MathMax(0.0, balance - equity);
   else
      ddMoney = MathMax(0.0, -managedFloatingNet);
   ddPct = (balance > 0.0) ? 100.0 * ddMoney / balance : 0.0;
  }

//+------------------------------------------------------------------+
//| Trigger when the selected metric >= threshold (threshold > 0).    |
//| A zero/invalid balance never triggers percent mode.               |
//+------------------------------------------------------------------+
bool RM_TriggerHit(int mode, double ddMoney, double ddPct, double threshold, double balance)
  {
   if(threshold <= 0.0)
      return false;
   if(mode == RM_TRIG_PERCENT)
      return balance > 0.0 && ddPct >= threshold - RM_EPS;
   return ddMoney >= threshold - RM_EPS;
  }

//+------------------------------------------------------------------+
//| 0..1 progress toward the threshold (for the dashboard bar)        |
//+------------------------------------------------------------------+
double RM_TriggerProgress(int mode, double ddMoney, double ddPct, double threshold)
  {
   if(threshold <= 0.0)
      return 0.0;
   double v = (mode == RM_TRIG_PERCENT) ? ddPct : ddMoney;
   return MathMax(0.0, MathMin(1.0, v / threshold));
  }

//+------------------------------------------------------------------+
//| Three-MA crossover on CLOSED candles.                              |
//| BUY : f2 <= s2 AND f1 > s1 ; SELL: f2 >= s2 AND f1 < s1           |
//| filter: BUY needs f1 > flt1 AND s1 > flt1 ; SELL both below.      |
//| Returns +1 BUY, -1 SELL, 0 none/rejected.                          |
//+------------------------------------------------------------------+
int RM_MASignal(double f2, double s2, double f1, double s1, bool useFilter, double flt1)
  {
   int sig = 0;
   if(f2 <= s2 && f1 > s1)
      sig = 1;
   else if(f2 >= s2 && f1 < s1)
      sig = -1;
   if(sig == 0 || !useFilter)
      return sig;
   if(sig == 1 && f1 > flt1 && s1 > flt1)
      return 1;
   if(sig == -1 && f1 < flt1 && s1 < flt1)
      return -1;
   return 0;
  }

//+------------------------------------------------------------------+
//| Crossover with delayed trend confirmation.                        |
//| A fast/slow crossover ARMS its direction. The signal fires on the |
//| first closed candle where the armed direction is still aligned   |
//| and both MAs are on the filter's side, within maxAge candles.    |
//| An opposite crossover re-arms; a broken alignment disarms. Each  |
//| crossover can fire at most once. armed/age persist between calls.|
//+------------------------------------------------------------------+
int RM_MASignalConfirm(double f2, double s2, double f1, double s1, bool useFilter, double flt1,
                       int maxAge, int &armed, int &age)
  {
   int cross = 0;
   if(f2 <= s2 && f1 > s1)
      cross = 1;
   else if(f2 >= s2 && f1 < s1)
      cross = -1;
   if(cross != 0)
     { armed = cross; age = 0; }
   else if(armed != 0)
      age++;
   if(armed == 0)
      return 0;
   if((armed == 1 && f1 <= s1) || (armed == -1 && f1 >= s1) || age > maxAge)
     { armed = 0; age = 0; return 0; }
   bool ok = !useFilter ||
             (armed == 1 && f1 > flt1 && s1 > flt1) ||
             (armed == -1 && f1 < flt1 && s1 < flt1);
   if(!ok)
      return 0;
   int sig = armed;
   armed = 0; age = 0;
   return sig;
  }

//+------------------------------------------------------------------+
//| Normal-strategy initial lot (before broker normalisation).        |
//| FIXED  : baseLot                                                    |
//| BALANCE: baseLot * balance / perBalance                             |
//+------------------------------------------------------------------+
double RM_NormalBaseLot(int mode, double baseLot, double balance, double perBalance)
  {
   if(mode == RM_NLOT_BALANCE)
     {
      if(perBalance <= 0.0 || balance <= 0.0)
         return 0.0;
      return baseLot * balance / perBalance;
     }
   return baseLot;
  }

//+------------------------------------------------------------------+
//| Virtual basket TP: price moved TP points beyond the volume-       |
//| weighted average open price of the direction's basket.           |
//+------------------------------------------------------------------+
bool RM_BasketTPReached(int dir, double wavgOpen, double tpPoints, double point, double bid, double ask)
  {
   if(tpPoints <= 0.0 || wavgOpen <= 0.0)
      return false;
   if(dir == RM_BUY)
      return bid >= wavgOpen + tpPoints * point - RM_EPS;
   return ask <= wavgOpen - tpPoints * point + RM_EPS;
  }

//+------------------------------------------------------------------+
//| Normal overlap: first + last order net >= points * value * lots   |
//+------------------------------------------------------------------+
bool RM_NormalOverlapHit(double netFirst, double netLast, double lotsFirst, double lotsLast,
                         double tpPoints, double mpp)
  {
   double target = RM_TargetMoney(tpPoints, mpp, lotsFirst + lotsLast);
   if(target <= 0.0)
      return false;
   return netFirst + netLast >= target - RM_EPS;
  }

//+------------------------------------------------------------------+
//| May normal trading resume after a completed recovery cycle?       |
//| barsSince: signal-timeframe bars since completion                  |
//+------------------------------------------------------------------+
bool RM_ResumeAllowed(int outcome, bool halted, bool autoResume, bool operatorCmd,
                      int barsSince, int cooldownBars)
  {
   if(barsSince < cooldownBars)
      return false;                      // cooldown always applies
   if(halted || outcome == RM_OUT_EMERGENCY || outcome == RM_OUT_MANUAL)
      return operatorCmd;                // explicit reset required
   return autoResume || operatorCmd;
  }

//+------------------------------------------------------------------+
//| Fresh-signal rule: the crossover candle must open after the cycle |
//+------------------------------------------------------------------+
bool RM_SignalIsFresh(bool requireFresh, long signalBarOpen, long freshAfter)
  {
   if(!requireFresh || freshAfter <= 0)
      return true;
   return signalBarOpen >= freshAfter;
  }

#endif

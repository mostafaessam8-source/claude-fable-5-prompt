//+------------------------------------------------------------------+
//| RM_Normal.mqh - independent Three-MA normal-trading module.        |
//|                                                                   |
//| Based on the PUBLIC description of a three-moving-average EA      |
//| (fast/slow crossover, optional third MA filtering direction,      |
//| lot sizing, averaging, virtual basket TP, optional first/last     |
//| overlap). It is NOT a replication of that product's undocumented  |
//| logic; every rule below is this project's documented choice.      |
//|                                                                   |
//| Signals (closed candles of InpSignalTF, evaluated once per new    |
//| candle; last processed candle persisted):                         |
//|   BUY : Fast[2] <= Slow[2] AND Fast[1] > Slow[1]                   |
//|   SELL: Fast[2] >= Slow[2] AND Fast[1] < Slow[1]                   |
//|   filter on: BUY needs Fast[1] & Slow[1] > Filter[1], SELL below   |
//| Entry   : a signal opens the initial order of its direction only  |
//|           when that direction has no normal basket (and, with     |
//|           InpNormalOneBasket, when no normal basket exists).      |
//| Averaging (own settings, separate from recovery averaging):       |
//|           adverse move >= InpNormalAvgStepPoints from the LAST    |
//|           fill of the direction, lot = initial x multiplier^n     |
//|           (n = orders already open, from the unrounded base),     |
//|           at most one averaging order per signal candle and       |
//|           direction, capped per direction and by total lots.      |
//| Basket TP: virtual (no broker TP); a direction's basket closes    |
//|           when price is InpNormalTPPoints beyond its volume-      |
//|           weighted average open price.                             |
//| Overlap : with >= InpNormalOverlapMinOrders orders, the first and |
//|           last order close together when their combined net        |
//|           >= InpNormalOverlapTPPoints x money/point/lot x their    |
//|           lots; intermediate orders stay.                          |
//| Opposite signals do not close baskets.                            |
//|                                                                   |
//| Every order operation runs as RM_ACTOR_NORMAL through the central |
//| permission gate, and the drawdown trigger is re-evaluated with    |
//| fresh prices immediately before every entry / averaging action.   |
//+------------------------------------------------------------------+
#ifndef RM_NORMAL_MQH
#define RM_NORMAL_MQH

struct RM_NSide
  {
   int               cnt;
   double            lots;
   double            net;
   double            wavg;          // volume-weighted average open price
   int               firstIdx;      // index in g_nbook (earliest)
   int               lastIdx;       // index in g_nbook (latest)
  };

RM_Book  g_nbook;                   // normal-strategy market orders (not in the recovery registry)
RM_NSide g_ns[2];
double   g_normalNet = 0.0;
int      g_normalCnt = 0;
double   g_normalLots = 0.0;
double   g_maFast1 = 0, g_maSlow1 = 0, g_maFilter1 = 0;
string   g_normalBlock = "";        // why normal trading is currently blocked

//+------------------------------------------------------------------+
//| Scan own normal-magic market orders that are not transferred      |
//+------------------------------------------------------------------+
void RM_NormalScan()
  {
   g_nbook.n = 0;
   for(int d = 0; d < 2; d++)
     {
      g_ns[d].cnt = 0; g_ns[d].lots = 0; g_ns[d].net = 0; g_ns[d].wavg = 0;
      g_ns[d].firstIdx = -1; g_ns[d].lastIdx = -1;
     }
   double pv[2];
   pv[0] = 0; pv[1] = 0;
   for(int i = 0; i < OrdersTotal(); i++)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
         continue;
      if(OrderSymbol() != g_sym || OrderMagicNumber() != InpNormalMagic)
         continue;
      int type = OrderType();
      if(type != OP_BUY && type != OP_SELL)
         continue;
      int ticket = OrderTicket();
      if(RM_RegFind(ticket) >= 0)
         continue;                              // transferred to recovery: not ours anymore
      if(g_nbook.n >= RM_MAX_LEGS)
         break;
      int n = g_nbook.n++;
      g_nbook.ticket[n] = ticket;
      g_nbook.role[n] = RM_ROLE_NORMAL;
      g_nbook.type[n] = type;
      g_nbook.lots[n] = OrderLots();
      g_nbook.profit[n] = OrderProfit();
      g_nbook.swap[n] = OrderSwap();
      g_nbook.comm[n] = OrderCommission();
      g_nbook.openPrice[n] = OrderOpenPrice();
      g_nbook.openTime[n] = (long)OrderOpenTime();
      g_nbook.gridIndex[n] = 0;
      g_ns[type].cnt++;
      g_ns[type].lots += OrderLots();
      g_ns[type].net += RM_LegNet(g_nbook, n);
      pv[type] += OrderLots() * OrderOpenPrice();
      int f = g_ns[type].firstIdx, l = g_ns[type].lastIdx;
      if(f < 0 || RM_EarlierThan(g_nbook, n, f))
         g_ns[type].firstIdx = n;
      if(l < 0 || RM_EarlierThan(g_nbook, l, n))
         g_ns[type].lastIdx = n;
     }
   g_normalNet = 0; g_normalCnt = 0; g_normalLots = 0;
   for(int d2 = 0; d2 < 2; d2++)
     {
      if(g_ns[d2].lots > 0)
         g_ns[d2].wavg = pv[d2] / g_ns[d2].lots;
      g_ns[d2].lots = RM_Clean(g_ns[d2].lots);
      g_normalNet += g_ns[d2].net;
      g_normalCnt += g_ns[d2].cnt;
      g_normalLots += g_ns[d2].lots;
     }
   g_normalLots = RM_Clean(g_normalLots);
   for(int d3 = 0; d3 < 2; d3++)
      g_normNextLevel[d3] = InpNormalAveraging ? RM_NormalAvgLevel(d3) : 0.0;
   // an empty basket releases its unit context: the next basket uses the current units
   if(g_normalCnt == 0 && g_ctxNorm.active && !RM_JournalOpen())
     {
      RM_CtxClear(g_ctxNorm);
      RM_SaveState();
     }
  }

int RM_NormalPendingCount()
  {
   int c = 0;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
         continue;
      if(OrderSymbol() == g_sym && OrderMagicNumber() == InpNormalMagic && OrderType() > OP_SELL)
         c++;
     }
   return c;
  }

//+------------------------------------------------------------------+
//| Moving averages on closed candles                                 |
//+------------------------------------------------------------------+
double RM_MA(int period, ENUM_MA_METHOD method, ENUM_APPLIED_PRICE price, int shift)
  {
   return iMA(g_sym, InpSignalTF, period, 0, method, price, shift);
  }

//+------------------------------------------------------------------+
//| Evaluate the newest CLOSED signal candle once. Runs in every      |
//| state, so a crossover formed during recovery is consumed there    |
//| and can never be reused afterwards. newBar = candle processed now.|
//+------------------------------------------------------------------+
int RM_NormalSignalEval(bool &newBar)
  {
   newBar = false;
   if(InpOperatingMode == RM_OP_RECOVERY_ONLY)
      return 0;
   long bar1 = (long)iTime(g_sym, InpSignalTF, 1);
   if(bar1 <= 0)
      return 0;
   g_maFast1 = RM_MA(InpFastPeriod, InpFastMethod, InpFastPrice, 1);
   g_maSlow1 = RM_MA(InpSlowPeriod, InpSlowMethod, InpSlowPrice, 1);
   g_maFilter1 = InpUseFilterMA ? RM_MA(InpFilterPeriod, InpFilterMethod, InpFilterPrice, 1) : 0.0;
   if(bar1 == g_lastSignalBar)
      return 0;                                 // already processed: never twice
   double f2 = RM_MA(InpFastPeriod, InpFastMethod, InpFastPrice, 2);
   double s2 = RM_MA(InpSlowPeriod, InpSlowMethod, InpSlowPrice, 2);
   int sig = 0;
   if(InpSignalConfirmBars > 0)
      sig = RM_MASignalConfirm(f2, s2, g_maFast1, g_maSlow1, InpUseFilterMA, g_maFilter1,
                               InpSignalConfirmBars, g_maArmed, g_maArmedAge);
   else
      sig = RM_MASignal(f2, s2, g_maFast1, g_maSlow1, InpUseFilterMA, g_maFilter1);
   g_lastSignalBar = bar1;
   g_lastSignal = sig;
   newBar = true;
   if(sig != 0)
      RM_Audit("SIGNAL", 0, 0, sig, RM_Side(sig > 0 ? RM_BUY : RM_SELL) + " crossover on candle " +
               TimeToString((datetime)bar1) + " (" + RM_CtlName(g_ctl) + ")");
   RM_SaveState();
   return sig;
  }

string RM_SignalText()
  {
   if(g_lastSignal > 0) return "BUY";
   if(g_lastSignal < 0) return "SELL";
   return "none";
  }

//+------------------------------------------------------------------+
//| Lot for the n-th order of a direction (n = 0 initial)             |
//+------------------------------------------------------------------+
double RM_NormalLotFor(int n, double &raw)
  {
   double base = RM_NormalBaseLot(InpNormalLotMode, InpNormalLot, AccountBalance(), InpNormalLotPerBalance);
   raw = RM_GridRawLot(base, InpNormalAveraging ? InpNormalAvgMultiplier : 1.0, n);
   return RM_NormalizeLot(raw, g_meta, RM_ROUND_DOWN);
  }

//+------------------------------------------------------------------+
//| Normal-strategy risk gates for NEW exposure                       |
//+------------------------------------------------------------------+
bool RM_NormalExposureBlocked(int dir, double lot, string &why)
  {
   if(RM_SpreadExceeds(InpMaxSpread, RM_NormUnit(), why))
      return true;
   if(RM_QuoteStale(why))
      return true;
   if(InpNormalMaxLots > 0.0 && g_normalLots + lot > InpNormalMaxLots + RM_EPS)
     { why = "normal exposure cap " + RM_Lots(InpNormalMaxLots) + " lots"; return true; }
   if(InpMaxManagedLots > 0.0 && g_normalLots + g_tot.totalLots + lot > InpMaxManagedLots + RM_EPS)
     { why = "max total open lots " + RM_Lots(InpMaxManagedLots) + " reached"; return true; }
   if(RM_FreezeActive(why))
      return true;
   ResetLastError();
   double freeAfter = AccountFreeMarginCheck(g_sym, dir, lot);
   if(freeAfter <= 0.0 || GetLastError() == ERR_NOT_ENOUGH_MONEY)
     { why = "insufficient free margin for " + RM_Lots(lot) + " lots"; return true; }
   if(InpMinFreeMargin > 0.0 && freeAfter < InpMinFreeMargin)
     { why = "free margin after entry below " + RM_Money(InpMinFreeMargin); return true; }
   if(InpMinMarginLevel > 0.0)
     {
      double marginAfter = AccountMargin() + MathMax(0.0, AccountFreeMargin() - freeAfter);
      if(marginAfter > 0.0 && AccountEquity() / marginAfter * 100.0 < InpMinMarginLevel)
        { why = "margin level after entry below " + DoubleToString(InpMinMarginLevel, 0) + "%"; return true; }
     }
   return false;
  }

//+------------------------------------------------------------------+
//| Open one normal order (gate + fresh trigger check first)          |
//+------------------------------------------------------------------+
bool RM_NormalOpen(int dir, int n, string what)
  {
   // fresh prices and the drawdown trigger immediately before every entry/averaging
   if(RM_TriggerCheckNow())
      return false;
   string rwhy = "";
   if(n == 0 && !RM_NewBasketReady(rwhy))
     { g_normalBlock = what + " blocked: " + rwhy; return false; }             // new basket needs defined distances
   if(n > 0 && !RM_NormDistanceUsable())
     { g_normalBlock = what + " blocked: " + RM_UNDEFINED_MSG; return false; }
   double raw = 0;
   double lot = RM_NormalLotFor(n, raw);
   if(lot <= 0.0)
     { g_normalBlock = what + ": lot " + DoubleToString(raw, 3) + " below broker minimum"; return false; }
   string why = "";
   if(RM_NormalExposureBlocked(dir, lot, why))
     { g_normalBlock = what + " blocked: " + why; return false; }
   g_reqSeq++;
   string tag = "#" + IntegerToString(g_reqSeq);
   string cmt = RM_CommentPrefix() + "N " + RM_Pick(dir == RM_BUY, "B ", "S ") + IntegerToString(n) + " " + tag;
   RM_SaveState();
   string err = "";
   int t = RM_Send(dir, lot, InpNormalMagic, cmt, tag, err);
   if(t <= 0)
     {
      g_normalBlock = what + " failed: " + err;
      RM_Audit("NORMAL_FAILED", 0, lot, 0, RM_Side(dir) + " " + what + ": " + err);
      return false;
     }
   RM_Audit(n == 0 ? "NORMAL_ENTRY" : "NORMAL_AVERAGE", t, lot, raw, RM_Side(dir) + " " + what);
   if(!g_ctxNorm.active)
      RM_CtxCaptureNorm("normal basket opened");      // basket keeps these units until it is empty
   RM_SaveState();
   RM_NormalScan();
   return true;
  }

//+------------------------------------------------------------------+
//| Basket management: virtual TP and overlap (closures via journal)  |
//| Returns true when a closure plan was started.                     |
//+------------------------------------------------------------------+
bool RM_NormalManage()
  {
   for(int d = 0; d < 2; d++)
     {
      if(g_ns[d].cnt == 0)
         continue;
      double tpPrice = RM_NormTPPrice();
      double tpTarget = (tpPrice > 0.0) ? RM_TPTargetPrice(d, g_ns[d].wavg, RM_EffectiveSpacing(tpPrice, RM_TickPrice()), RM_TickPrice()) : 0.0;
      if(RM_TPTargetReached(d, tpTarget, RM_Bid(), RM_Ask()))
        {
         RM_IndexList L;
         L.n = 0;
         for(int i = 0; i < g_nbook.n; i++)
            if(g_nbook.type[i] == d && L.n < RM_MAX_PLAN_LEGS)
               L.idx[L.n++] = i;
         RM_PlanListed(g_nbook, g_cfg, g_mpp, RM_PLAN_NORMAL_TP, L, -1.0, g_plan);
         RM_Audit("NORMAL_TP", 0, g_ns[d].lots, g_plan.expectedNet,
                  RM_Side(d) + " basket reached TP " + DoubleToString(tpTarget, g_digits) + " (" +
                  DoubleToString(tpPrice, g_digits) + " price from average " + DoubleToString(g_ns[d].wavg, g_digits) + ")");
         RM_StartPlan(g_plan);
         return true;
        }
      if(InpNormalOverlap && g_ns[d].cnt >= InpNormalOverlapMinOrders)
        {
         int f = g_ns[d].firstIdx, l = g_ns[d].lastIdx;
         if(f >= 0 && l >= 0 && f != l &&
            RM_NormalOverlapHit(RM_LegNet(g_nbook, f), RM_LegNet(g_nbook, l), g_nbook.lots[f], g_nbook.lots[l],
                                RM_NormOverlapBrokerPts(), g_mpp))
           {
            RM_IndexList L2;
            L2.n = 2; L2.idx[0] = f; L2.idx[1] = l;
            RM_PlanListed(g_nbook, g_cfg, g_mpp, RM_PLAN_NORMAL_OVERLAP, L2, -1.0, g_plan);
            RM_StartPlan(g_plan);
            return true;
           }
        }
     }
   return false;
  }

//+------------------------------------------------------------------+
//| Next normal averaging level: same service and rounding as the     |
//| recovery grid (last confirmed fill -/+ tick-rounded spacing).     |
//+------------------------------------------------------------------+
double RM_NormalAvgLevel(int d)
  {
   if(g_ns[d].cnt == 0 || g_ns[d].lastIdx < 0)
      return 0.0;
   double req = RM_NormStepPrice();
   if(req <= 0.0)
      return 0.0;
   double eff = RM_EffectiveSpacing(req, RM_TickPrice());
   return RM_GridTargetPrice(d, g_nbook.openPrice[g_ns[d].lastIdx], eff, RM_TickPrice());
  }

//+------------------------------------------------------------------+
//| Averaging and new entries                                         |
//+------------------------------------------------------------------+
void RM_NormalEntries(bool newBar, int sig)
  {
   long bar1 = (long)iTime(g_sym, InpSignalTF, 1);
   // ---- averaging (separate module and settings from recovery averaging)
   if(InpNormalAveraging)
      for(int d = 0; d < 2; d++)
        {
         int cnt = g_ns[d].cnt;
         if(cnt == 0 || cnt >= InpNormalMaxPerDir)
            continue;
         if(g_normLastAvgBar[d] == bar1)
            continue;                                   // one averaging order per signal candle
         double level = RM_NormalAvgLevel(d);
         if(level <= 0.0 || !RM_GridTriggered(d, RM_Bid(), RM_Ask(), level))
            continue;
         if(RM_NormalOpen(d, cnt, "averaging #" + IntegerToString(cnt)))
           {
            g_normLastAvgBar[d] = bar1;
            RM_SaveState();
           }
         if(g_recLatch)
            return;                                     // trigger fired: stop immediately
        }
   // ---- new entry on a freshly processed crossover
   if(!newBar || sig == 0)
      return;
   int dir = (sig > 0) ? RM_BUY : RM_SELL;
   if(!RM_DirectionAllowed(dir, InpNormalDirs, false, true, 0, 0))
     { g_normalBlock = RM_Side(dir) + " signal ignored: direction not allowed"; return; }
   if(!RM_SignalIsFresh(InpRequireFreshSignalAfterRecovery, g_lastSignalBar, g_freshAfter))
     { g_normalBlock = RM_Side(dir) + " signal ignored: crossover not fresh after the last recovery cycle"; return; }
   if(g_ns[dir].cnt > 0 || (InpNormalOneBasket && g_normalCnt > 0))
     { g_normalBlock = RM_Side(dir) + " signal ignored: a normal basket is already open"; return; }
   if(!g_normalEnabled || g_normalHalted)
     { g_normalBlock = RM_Side(dir) + " signal ignored: normal entries disabled"; return; }
   RM_NormalOpen(dir, 0, "signal entry");
  }

#endif

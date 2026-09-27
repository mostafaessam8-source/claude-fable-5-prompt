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
#ifndef RM_SIGNALS_MQH
#define RM_SIGNALS_MQH

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
//+------------------------------------------------------------------+
//| Main MA trend for recovery entries: slow MA vs trend-filter MA on |
//| the last closed signal candle. +1 up, -1 down, 0 = gate off.      |
//+------------------------------------------------------------------+
int RM_MATrend()
  {
   if(!InpRecoveryMATrend)
      return 0;
   return RM_MATrendRaw();
  }

int RM_MATrendRaw()
  {
   if(InpOperatingMode == RM_OP_RECOVERY_ONLY)
      return 0;
   double slow = iMA(g_sym, InpSignalTF, InpSlowPeriod, 0, InpSlowMethod, InpSlowPrice, 1);
   double flt = iMA(g_sym, InpSignalTF, InpFilterPeriod, 0, InpFilterMethod, InpFilterPrice, 1);
   if(slow <= 0.0 || flt <= 0.0)
      return 0;
   if(slow > flt) return 1;
   if(slow < flt) return -1;
   return 0;
  }

bool RM_SignalAllows(int dir, bool isFirst)
  {
   int mt = RM_MATrend();
   if(mt != 0 && mt != (dir == RM_BUY ? 1 : -1))
      return false;                        // never add recovery orders against the main trend
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

#endif

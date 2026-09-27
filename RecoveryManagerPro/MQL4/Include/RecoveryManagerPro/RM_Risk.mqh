//+------------------------------------------------------------------+
//| RM_Risk.mqh - gates for NEW exposure and the emergency stop.      |
//| Spread, session and margin gates only ever block new exposure;    |
//| they never block risk-reducing closes.                            |
//+------------------------------------------------------------------+
#ifndef RM_RISK_MQH
#define RM_RISK_MQH

double RM_MarginLevel()
  {
   double m = AccountMargin();
   if(m <= 0.0)
      return 0.0;       // 0 = no margin in use (displayed as "-")
   return AccountEquity() / m * 100.0;
  }

bool RM_InSession()
  {
   int h = TimeHour(TimeCurrent());
   if(InpSessionStartHour == 0 && InpSessionEndHour == 24)
      return true;
   if(InpSessionStartHour < InpSessionEndHour)
      return h >= InpSessionStartHour && h < InpSessionEndHour;
   return h >= InpSessionStartHour || h < InpSessionEndHour;     // overnight window
  }

bool RM_DailyLocked()
  {
   RM_DayRoll();
   return InpDailyLossLimit > 0.0 && g_realizedDay <= -InpDailyLossLimit;
  }

//+------------------------------------------------------------------+
//| Soft protection: at InpFreezeDDPct account drawdown (balance -     |
//| equity, % of balance) NEW trades pause; they resume automatically |
//| below InpFreezeResumePct. Nothing is closed by this rule, and     |
//| closures, locks and emergency protection keep working.            |
//+------------------------------------------------------------------+
double RM_AccountDDPct()
  {
   double bal = AccountBalance();
   if(bal <= 0.0)
      return 0.0;
   return MathMax(0.0, bal - AccountEquity()) / bal * 100.0;
  }

void RM_FreezeUpdate()
  {
   if(InpFreezeDDPct <= 0.0)
     {
      g_frozen = false;
      return;
     }
   double dd = RM_AccountDDPct();
   if(!g_frozen && dd >= InpFreezeDDPct)
     {
      g_frozen = true;
      RM_Audit("PAUSE_NEW_TRADES", 0, 0, dd, "account drawdown " + DoubleToString(dd, 1) + "% >= " +
               DoubleToString(InpFreezeDDPct, 1) + "%: new trades paused, open trades still managed");
      RM_SaveState();
     }
   else if(g_frozen && dd < InpFreezeResumePct)
     {
      g_frozen = false;
      RM_Audit("RESUME_NEW_TRADES", 0, 0, dd, "account drawdown back to " + DoubleToString(dd, 1) + "%");
      RM_SaveState();
     }
  }

bool RM_FreezeActive(string &why)
  {
   RM_FreezeUpdate();
   if(!g_frozen)
      return false;
   why = "drawdown " + DoubleToString(RM_AccountDDPct(), 1) + "% - new trades paused until below " +
         DoubleToString(InpFreezeResumePct, 0) + "%";
   return true;
  }

//+------------------------------------------------------------------+
//| Account-level checks for opening `lots` of `type`.                |
//| isHedge: lock orders reduce net exposure, so spread/session/daily |
//| gates are skipped for them; margin is still checked.              |
//+------------------------------------------------------------------+
bool RM_NewExposureBlocked(int type, double lots, bool isHedge, string &why)
  {
   if(!isHedge)
     {
      if(RM_FreezeActive(why))
         return true;
      if(RM_SpreadExceeds(InpMaxSpread, RM_RecUnit(), why))
         return true;
      if(RM_QuoteStale(why))
         return true;
      if(!RM_InSession())
        { why = "outside entry session hours"; return true; }
      if(RM_DailyLocked())
        { why = "daily loss lockout (" + RM_Money(g_realizedDay) + " " + AccountCurrency() + ")"; return true; }
      if(InpMaxManagedLots > 0.0 && g_tot.totalLots + lots > InpMaxManagedLots + RM_EPS)
        { why = "max combined managed lots " + RM_Lots(InpMaxManagedLots) + " reached"; return true; }
     }
   ResetLastError();
   double freeAfter = AccountFreeMarginCheck(g_sym, type, lots);
   if(freeAfter <= 0.0 || GetLastError() == ERR_NOT_ENOUGH_MONEY)
     { why = "insufficient free margin for " + RM_Lots(lots) + " lots"; return true; }
   if(!isHedge)
     {
      if(InpMinFreeMargin > 0.0 && freeAfter < InpMinFreeMargin)
        { why = "free margin after entry below " + RM_Money(InpMinFreeMargin); return true; }
      if(InpMinMarginLevel > 0.0)
        {
         double required = AccountFreeMargin() - freeAfter;
         double marginAfter = AccountMargin() + MathMax(0.0, required);
         if(marginAfter > 0.0 && AccountEquity() / marginAfter * 100.0 < InpMinMarginLevel)
           { why = "margin level after entry below " + DoubleToString(InpMinMarginLevel, 0) + "%"; return true; }
        }
     }
   return false;
  }

//+------------------------------------------------------------------+
//| Emergency stop on managed floating loss                           |
//+------------------------------------------------------------------+
bool RM_EmergencyHit(string &why)
  {
   if(InpEmergencyMode == RM_EMG_OFF || InpEmergencyValue <= 0.0 || g_tot.totalCnt == 0)
      return false;
   if(InpEmergencyMode == RM_EMG_MONEY && g_drawdown >= InpEmergencyValue)
     {
      why = "managed loss " + RM_Money(g_drawdown) + " >= " + RM_Money(InpEmergencyValue);
      return true;
     }
   if(InpEmergencyMode == RM_EMG_PERCENT && g_ddPct >= InpEmergencyValue)
     {
      why = "managed loss " + DoubleToString(g_ddPct, 2) + "% of balance >= " + DoubleToString(InpEmergencyValue, 2) + "%";
      return true;
     }
   return false;
  }

#endif

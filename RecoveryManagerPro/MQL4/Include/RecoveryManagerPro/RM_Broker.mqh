//+------------------------------------------------------------------+
//| RM_Broker.mqh - symbol metadata and trade operations with bounded |
//| retries and reconciliation. An uncertain broker reply never       |
//| leads to a blind resend: the book is searched first.              |
//+------------------------------------------------------------------+
#ifndef RM_BROKER_MQH
#define RM_BROKER_MQH

#define RM_RETRIES 3

//+------------------------------------------------------------------+
void RM_RefreshMeta()
  {
   g_meta.point = MarketInfo(g_sym, MODE_POINT);
   g_meta.tickSize = MarketInfo(g_sym, MODE_TICKSIZE);
   g_meta.tickValue = MarketInfo(g_sym, MODE_TICKVALUE);
   g_meta.minLot = MarketInfo(g_sym, MODE_MINLOT);
   g_meta.maxLot = MarketInfo(g_sym, MODE_MAXLOT);
   g_meta.lotStep = MarketInfo(g_sym, MODE_LOTSTEP);
   g_digits = (int)MarketInfo(g_sym, MODE_DIGITS);
   if(g_meta.tickSize <= 0.0)
      g_meta.tickSize = g_meta.point;          // some feeds report 0: fall back to point
   if(g_meta.lotStep <= 0.0)
      g_meta.lotStep = 0.01;
   g_mpp = RM_MoneyPerPointPerLot(g_meta.tickValue, g_meta.tickSize, g_meta.point);
   RM_DistRefresh();                          // distance-unit service (validated metadata, no fallbacks)
  }

//+------------------------------------------------------------------+
//| Round an already-planned volume onto the broker lot grid          |
//+------------------------------------------------------------------+
double RM_NormVol(double v)
  {
   double step = g_meta.lotStep;
   int ld = (int)MathCeil(-MathLog10(step) - 1e-9);
   if(ld < 0)
      ld = 0;
   return NormalizeDouble(MathRound(v / step) * step, ld);
  }

double RM_Bid() { return MarketInfo(g_sym, MODE_BID); }
double RM_Ask() { return MarketInfo(g_sym, MODE_ASK); }

int RM_SpreadPoints()
  {
   if(g_meta.point <= 0.0)
      return 0;
   return (int)MathRound((RM_Ask() - RM_Bid()) / g_meta.point);
  }

//+------------------------------------------------------------------+
//| Executable price: nearest tick (price units), then digits         |
//+------------------------------------------------------------------+
double RM_NormPrice(double p)
  {
   return NormalizeDouble(RM_AlignToTick(p, g_dist.tickPrice, RM_ALIGN_NEAREST), g_digits);
  }

//+------------------------------------------------------------------+
//| Error classification                                              |
//+------------------------------------------------------------------+
bool RM_ErrRetryable(int e)
  {
   return (e == ERR_SERVER_BUSY || e == ERR_BROKER_BUSY || e == ERR_PRICE_CHANGED ||
           e == ERR_OFF_QUOTES || e == ERR_REQUOTE || e == ERR_TRADE_CONTEXT_BUSY ||
           e == ERR_INVALID_PRICE || e == ERR_TOO_FREQUENT_REQUESTS);
  }

bool RM_ErrUncertain(int e)
  {
   // reply lost: the order may or may not exist
   return (e == ERR_TRADE_TIMEOUT || e == ERR_NO_RESULT || e == ERR_COMMON_ERROR ||
           e == ERR_NO_CONNECTION);
  }

string RM_ErrText(int e)
  {
   if(e == ERR_MARKET_CLOSED)
      return "132 market is closed (outside trading hours / weekend)";
   return IntegerToString(e) + " " + ErrorDescription(e);
  }

//+------------------------------------------------------------------+
//| CENTRAL PERMISSION GATE for every automated or manual trade       |
//| operation (send / close / modify / delete). The caller sets       |
//| g_actor; nothing reaches the broker without passing here, so the  |
//| normal strategy can never bypass the recovery latch.              |
//+------------------------------------------------------------------+
#define RM_OPK_OPEN   1
#define RM_OPK_CLOSE  2
#define RM_OPK_MODIFY 3
#define RM_OPK_DELETE 4

bool RM_Combined()
  {
   return InpOperatingMode == RM_OP_THREE_MA_WITH_RECOVERY;
  }

bool RM_Permit(int op, int magic, int ticket, string &why)
  {
   switch(g_actor)
     {
      case RM_ACTOR_TEST:
         if(IsTesting())
            return true;
         why = "test actions only in the Strategy Tester";
         return false;
      case RM_ACTOR_EMERGENCY:
         if(op == RM_OPK_OPEN)
           { why = "emergency protection may only reduce exposure"; return false; }
         return true;
      case RM_ACTOR_OPERATOR:
         if(op == RM_OPK_OPEN && magic == InpNormalMagic && g_recLatch)
           { why = "recovery latch active: normal-strategy orders are blocked"; return false; }
         return true;
      case RM_ACTOR_HANDOVER:
         if(g_ctl == RM_CTL_HANDOVER && op == RM_OPK_DELETE && magic == InpNormalMagic)
            return true;
         why = "handover may only cancel normal-strategy pending orders";
         return false;
      case RM_ACTOR_RECOVERY:
         if(InpOperatingMode == RM_OP_RECOVERY_ONLY)
            return true;
         if(InpOperatingMode == RM_OP_THREE_MA_ONLY)
           { why = "recovery engine disabled in THREE_MA_ONLY"; return false; }
         if(!g_recLatch)
           { why = "recovery is monitoring only (no active cycle)"; return false; }
         if(op == RM_OPK_OPEN && magic == InpNormalMagic)
           { why = "recovery never opens normal-strategy orders"; return false; }
         return true;
      case RM_ACTOR_NORMAL:
         if(InpOperatingMode == RM_OP_RECOVERY_ONLY)
           { why = "normal trading disabled (RECOVERY_ONLY)"; return false; }
         if(magic != InpNormalMagic)
           { why = "normal strategy may only touch its own magic"; return false; }
         if(op != RM_OPK_OPEN && ticket > 0 && RM_RegFind(ticket) >= 0)
           { why = "ticket belongs to the recovery cycle"; return false; }
         if(g_recLatch)
           {
            // only an already-started normal closure may finish before the handover snapshot
            if(op == RM_OPK_CLOSE && g_ctl == RM_CTL_HANDOVER && !g_hoSnapshot)
               return true;
            why = "recovery latch active: normal strategy blocked";
            return false;
           }
         if(g_ctl != RM_CTL_NORMAL)
           { why = "normal strategy blocked (" + RM_CtlName(g_ctl) + ")"; return false; }
         if(op == RM_OPK_OPEN && (!g_normalEnabled || g_normalHalted))
           { why = g_normalHalted ? "normal trading halted - operator reset required" : "normal entries disabled by operator"; return false; }
         return true;
     }
   why = "no authorised actor for this trade operation";
   return false;
  }

bool RM_Gate(int op, int magic, int ticket, string &err)
  {
   string why = "";
   if(RM_Permit(op, magic, ticket, why))
      return true;
   err = "blocked: " + why;
   g_lastDenied = why;
   return false;
  }

//+------------------------------------------------------------------+
//| Slippage in broker points, converted from distance units at the   |
//| API boundary and floored (never looser than configured).          |
//+------------------------------------------------------------------+
int RM_Slippage()
  {
   if(g_actor == RM_ACTOR_NORMAL)
      return RM_SlippageBrokerPts(InpNormalSlippage, RM_NormUnit());
   return RM_SlippageBrokerPts(InpMaxSlippage, RM_RecUnit());
  }

//+------------------------------------------------------------------+
//| Is trading possible right now? why receives the reason.          |
//+------------------------------------------------------------------+
bool RM_TradeReady(string &why)
  {
   if(!IsTesting() && !IsConnected())
     { why = "no connection to trade server"; return false; }
   if(!IsTradeAllowed())
     { why = "trading not allowed (AutoTrading off, EA permissions or trade context)"; return false; }
   // MODE_TRADEALLOWED is unreliable (often 0 in the Strategy Tester): use the symbol
   // trade mode live, and let the broker's own reply (e.g. 132 market closed) speak otherwise
   if(!IsTesting())
     {
      long tm = SymbolInfoInteger(g_sym, SYMBOL_TRADE_MODE);
      if(tm == SYMBOL_TRADE_MODE_DISABLED)
        { why = "trading is disabled for " + g_sym + " on this account"; return false; }
      if(tm == SYMBOL_TRADE_MODE_CLOSEONLY)
        { why = g_sym + " is close-only on this account"; return false; }
     }
   if(IsTradeContextBusy())
     { why = "trade context busy"; return false; }
   if(RM_Bid() <= 0.0 || RM_Ask() <= 0.0)
     { why = "no valid quote"; return false; }
   return true;
  }

bool RM_QuoteStale(string &why)
  {
   if(IsTesting() || InpStaleQuoteSeconds <= 0)
      return false;
   datetime last = (datetime)MarketInfo(g_sym, MODE_TIME);
   if(TimeCurrent() - last > InpStaleQuoteSeconds)
     {
      why = "stale quote (" + IntegerToString((int)(TimeCurrent() - last)) + " s old)";
      return true;
     }
   return false;
  }

void RM_WaitContext()
  {
   if(IsTesting())
      return;
   uint t0 = GetTickCount();
   while(IsTradeContextBusy() && GetTickCount() - t0 < 5000)
      Sleep(50);
  }

//+------------------------------------------------------------------+
//| Find an open order carrying our unique request tag               |
//+------------------------------------------------------------------+
int RM_FindByTag(string tag, int magic)
  {
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
         continue;
      if(OrderSymbol() != g_sym || OrderMagicNumber() != magic)
         continue;
      if(StringFind(OrderComment(), tag) >= 0)
         return OrderTicket();
     }
   return -1;
  }

//+------------------------------------------------------------------+
//| Market order. comment must contain a unique tag "#<seq>".         |
//| Returns ticket or -1; err receives the reason.                    |
//+------------------------------------------------------------------+
int RM_Send(int type, double lots, int magic, string comment, string tag, string &err)
  {
   if(!RM_Gate(RM_OPK_OPEN, magic, 0, err))
      return -1;
   if(!g_dist.metaValid)
     { err = g_dist.why; return -1; }                // never trade on invalid conversion values
   string why = "";
   if(!RM_TradeReady(why))
     { err = why; return -1; }
   if(lots < g_meta.minLot - RM_EPS)
     { err = "volume " + RM_Lots(lots) + " below broker minimum"; return -1; }
   ResetLastError();
   double freeAfter = AccountFreeMarginCheck(g_sym, type, lots);
   if(freeAfter <= 0.0 || GetLastError() == ERR_NOT_ENOUGH_MONEY)
     { err = "insufficient margin for " + RM_Lots(lots) + " lots"; return -1; }
   color arrow = (type == OP_BUY) ? clrDodgerBlue : clrOrangeRed;
   for(int attempt = 0; attempt < RM_RETRIES; attempt++)
     {
      RM_WaitContext();
      RefreshRates();
      double price = (type == OP_BUY) ? RM_Ask() : RM_Bid();
      ResetLastError();
      int t = OrderSend(g_sym, type, lots, RM_NormPrice(price), RM_Slippage(), 0, 0,
                        comment, magic, 0, arrow);
      if(t > 0)
        {
         g_tradeEvents++;
         return t;
        }
      int e = GetLastError();
      err = RM_ErrText(e);
      if(RM_ErrUncertain(e))
        {
         if(!IsTesting())
            Sleep(1000);
         int found = RM_FindByTag(tag, magic);
         if(found > 0)
           {
            g_tradeEvents++;
            return found;                     // it did go through: never resend
           }
         // still unknown: do not risk a duplicate in the same event
         err = "uncertain reply (" + err + "); not resent";
         return -1;
        }
      if(!RM_ErrRetryable(e))
         return -1;
      if(!IsTesting())
         Sleep(300 * (attempt + 1));
     }
   return -1;
  }

//+------------------------------------------------------------------+
//| Realised result of a closed (history) ticket                      |
//+------------------------------------------------------------------+
bool RM_HistoryResult(int ticket, double &lots, double &net, datetime &closeTime, string &comment)
  {
   if(!OrderSelect(ticket, SELECT_BY_TICKET))
      return false;
   if(OrderCloseTime() == 0)
      return false;
   lots = OrderLots();
   net = OrderProfit() + OrderSwap() + OrderCommission();
   closeTime = OrderCloseTime();
   comment = OrderComment();
   return true;
  }

//+------------------------------------------------------------------+
//| Child left open after a partial close ("from #<parent>")          |
//+------------------------------------------------------------------+
int RM_FindChild(int parent)
  {
   string key = "from #" + IntegerToString(parent);
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
         continue;
      if(OrderSymbol() != g_sym)
         continue;
      if(StringFind(OrderComment(), key) >= 0)
         return OrderTicket();
     }
   return -1;
  }

//+------------------------------------------------------------------+
//| Close lots of a ticket. Re-selects immediately before closing.   |
//| closedLots / realized from the history record; child = remainder |
//| ticket after a partial close (or 0). Returns true on confirmed    |
//| close (including a close found after an uncertain reply).         |
//+------------------------------------------------------------------+
bool RM_Close(int ticket, double lots, double &closedLots, double &realized, int &child, string &err)
  {
   closedLots = 0; realized = 0; child = 0;
   if(OrderSelect(ticket, SELECT_BY_TICKET) && !RM_Gate(RM_OPK_CLOSE, OrderMagicNumber(), ticket, err))
      return false;
   string why = "";
   if(!RM_TradeReady(why))
     { err = why; return false; }
   for(int attempt = 0; attempt < RM_RETRIES; attempt++)
     {
      RM_WaitContext();
      if(!OrderSelect(ticket, SELECT_BY_TICKET))
        { err = "ticket not found"; return false; }
      if(OrderCloseTime() != 0)
        { err = "ticket already closed"; return false; }
      int type = OrderType();
      if(type != OP_BUY && type != OP_SELL)
        { err = "not a market order"; return false; }
      double have = OrderLots();
      double v = MathMin(lots, have);
      v = RM_NormVol(v);
      if(have - v < g_meta.minLot - RM_EPS && have - v > RM_EPS)
        { err = "close would leave an invalid remainder"; return false; }
      // freeze level: a close can be rejected when SL/TP sit inside it
      double freeze = MarketInfo(g_sym, MODE_FREEZELEVEL) * g_meta.point;
      RefreshRates();
      double price = (type == OP_BUY) ? RM_Bid() : RM_Ask();
      if(freeze > 0.0)
        {
         double sl = OrderStopLoss(), tp = OrderTakeProfit();
         if((sl > 0 && MathAbs(price - sl) <= freeze) || (tp > 0 && MathAbs(price - tp) <= freeze))
           { err = "inside broker freeze level"; return false; }
        }
      ResetLastError();
      bool ok = OrderClose(ticket, v, RM_NormPrice(price), RM_Slippage(), clrGold);
      int e = GetLastError();
      if(!ok && RM_ErrUncertain(e))
        {
         if(!IsTesting())
            Sleep(1000);
         if(OrderSelect(ticket, SELECT_BY_TICKET) && OrderCloseTime() != 0)
            ok = true;                        // closed despite the lost reply
        }
      if(ok)
        {
         g_tradeEvents++;
         datetime ct; string cm;
         double hl = 0, hn = 0;
         if(RM_HistoryResult(ticket, hl, hn, ct, cm))
           {
            closedLots = hl;
            realized = hn;
           }
         else
           {
            closedLots = v;
            realized = 0;
           }
         if(have - closedLots > RM_EPS)
           {
            int c = RM_FindChild(ticket);
            child = (c > 0) ? c : 0;
           }
         return true;
        }
      err = RM_ErrText(e);
      if(e == ERR_MARKET_CLOSED || e == ERR_TRADE_DISABLED || e == ERR_INVALID_TRADE_VOLUME)
         return false;
      if(!RM_ErrRetryable(e))
         return false;
      if(!IsTesting())
         Sleep(300 * (attempt + 1));
     }
   return false;
  }

//+------------------------------------------------------------------+
//| Remove SL/TP. Respects stop and freeze levels.                    |
//+------------------------------------------------------------------+
bool RM_ClearSLTP(int ticket, string &err)
  {
   if(!OrderSelect(ticket, SELECT_BY_TICKET) || OrderCloseTime() != 0)
     { err = "ticket not open"; return false; }
   if(OrderStopLoss() == 0.0 && OrderTakeProfit() == 0.0)
      return true;
   if(!RM_Gate(RM_OPK_MODIFY, OrderMagicNumber(), ticket, err))
      return false;
   double freeze = MarketInfo(g_sym, MODE_FREEZELEVEL) * g_meta.point;
   double price = (OrderType() == OP_BUY) ? RM_Bid() : RM_Ask();
   if(freeze > 0.0)
     {
      double sl = OrderStopLoss(), tp = OrderTakeProfit();
      if((sl > 0 && MathAbs(price - sl) <= freeze) || (tp > 0 && MathAbs(price - tp) <= freeze))
        { err = "inside freeze level, retry later"; return false; }
     }
   for(int attempt = 0; attempt < RM_RETRIES; attempt++)
     {
      RM_WaitContext();
      if(!OrderSelect(ticket, SELECT_BY_TICKET))
         return false;
      ResetLastError();
      if(OrderModify(ticket, OrderOpenPrice(), 0, 0, 0, clrNONE))
         return true;
      int e = GetLastError();
      err = RM_ErrText(e);
      if(e == ERR_NO_RESULT)
         return true;                          // nothing changed = already clear
      if(!RM_ErrRetryable(e))
         return false;
     }
   return false;
  }

bool RM_DeletePending(int ticket, string &err)
  {
   if(OrderSelect(ticket, SELECT_BY_TICKET) && OrderCloseTime() == 0 &&
      !RM_Gate(RM_OPK_DELETE, OrderMagicNumber(), ticket, err))
      return false;
   for(int attempt = 0; attempt < RM_RETRIES; attempt++)
     {
      RM_WaitContext();
      if(!OrderSelect(ticket, SELECT_BY_TICKET) || OrderCloseTime() != 0)
         return true;
      ResetLastError();
      if(OrderDelete(ticket))
         return true;
      int e = GetLastError();
      err = RM_ErrText(e);
      if(!RM_ErrRetryable(e))
         return false;
     }
   return false;
  }

#endif

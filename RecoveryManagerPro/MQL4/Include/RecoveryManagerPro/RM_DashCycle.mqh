//+------------------------------------------------------------------+
//| RM_DashCycle.mqh - panel D "CYCLE CONTROLLER" (Three-MA modes).   |
//| Upper right. Values come from the same snapshots the controller   |
//| uses: g_nbook/g_ns (normal basket), g_book (recovery registry),   |
//| g_ctlDD* (trigger metrics) and the persisted cycle fields.        |
//+------------------------------------------------------------------+
#ifndef RM_DASHCYCLE_MQH
#define RM_DASHCYCLE_MQH


int g_dx = 0, g_dy = 0, g_dw = 0, g_barW = 0;

string RM_MethodName(int m)
  {
   switch(m)
     {
      case MODE_SMA:  return "SMA";
      case MODE_EMA:  return "EMA";
      case MODE_SMMA: return "SMMA";
      case MODE_LWMA: return "LWMA";
     }
   return "?";
  }

string RM_PriceName(int p)
  {
   switch(p)
     {
      case PRICE_CLOSE:    return "C";
      case PRICE_OPEN:     return "O";
      case PRICE_HIGH:     return "H";
      case PRICE_LOW:      return "L";
      case PRICE_MEDIAN:   return "M";
      case PRICE_TYPICAL:  return "T";
      case PRICE_WEIGHTED: return "W";
     }
   return "?";
  }

string RM_OpModeName()
  {
   if(InpOperatingMode == RM_OP_THREE_MA_ONLY)
      return "THREE_MA_ONLY";
   if(InpOperatingMode == RM_OP_THREE_MA_WITH_RECOVERY)
      return "THREE_MA_WITH_RECOVERY";
   return "RECOVERY_ONLY";
  }

void RM_Row5(string key, int x, int y, int w, string label, color lc)
  {
   RM_Text(key + "_L", x + 8, y, label, lc, false, false);
   RM_Text(key + "_1", x + (int)(w * 0.40), y, "", C_TEXT, true, false);
   RM_Text(key + "_2", x + (int)(w * 0.58), y, "", C_TEXT, true, false);
   RM_Text(key + "_3", x + (int)(w * 0.76), y, "", C_TEXT, true, false);
   RM_Text(key + "_4", x + w - 8, y, "", C_TEXT, true, false);
  }

void RM_BuildCycle(int chartW)
  {
   if(InpOperatingMode == RM_OP_RECOVERY_ONLY)
      return;
   int w = g_mw, rh = g_rh;
   int x = (int)MathMax(g_px + g_mw + 8, chartW - w - 60);
   int y = g_py;
   g_dx = x; g_dy = y; g_dw = w;
   RM_Rect("D_BG", x, y, w, 10, C_BG, C_BORDER);
   RM_Rect("D_HEAD", x, y, w, rh + 4, C_HEAD, C_BORDER);
   RM_Text("D_TITLE", x + 8, y + 3, "CYCLE CONTROLLER", C_TEXT, false, true);
   RM_Rect("D_CHIP", x + w - 128, y + 4, 120, rh - 4, C_AMBER, C_AMBER);
   RM_Text("D_CHIPT", x + w - 122, y + 4, "", C_BG, false, true);
   int r = y + rh + 8;
   RM_Text("D_MODE", x + 8, r, "", C_TEXT, false, false); r += rh;
   RM_Text("D_ENG", x + 8, r, "", C_TEXT, false, false); r += rh;
   RM_Text("D_DD", x + 8, r, "", C_TEXT, false, false); r += rh;
   RM_Text("D_THR", x + 8, r, "", C_DIM, false, false); r += rh;
   g_barW = w - 16;
   RM_Rect("D_BARBG", x + 8, r + 2, g_barW, rh - 8, C_HEAD, C_BORDER);
   RM_Rect("D_BAR", x + 8, r + 2, 1, rh - 8, C_GREEN, C_GREEN);
   r += rh;
   RM_Text("D_MA", x + 8, r, "", C_DIM, false, false); r += rh;
   RM_Text("D_SIG", x + 8, r, "", C_TEXT, false, false); r += rh;
   RM_Row5("D_H", x, r, w, "Role", C_DIM);
   RM_Set("D_H_1", "Cnt", C_DIM); r += rh;
   RM_Row5("D_RN", x, r, w, "Normal", C_ACCENT); r += rh;
   RM_Row5("D_RO", x, r, w, "Original", C_TEXT); r += rh;
   RM_Row5("D_RH", x, r, w, "Hedge", C_TEXT); r += rh;
   RM_Row5("D_RR", x, r, w, "Recovery", C_AMBER); r += rh;
   RM_Text("D_CYC", x + 8, r, "", C_TEXT, false, false); r += rh;
   RM_Text("D_PL", x + 8, r, "", C_TEXT, false, false); r += rh;
   RM_Text("D_RES", x + 8, r, "", C_DIM, false, false); r += rh;
   RM_Text("D_WHY", x + 8, r, "", C_DIM, false, false); r += rh;
   RM_Text("D_BLK", x + 8, r, "", C_DIM, false, false); r += rh + 2;
   int bw = (w - 24) / 2;
   RM_Button("NRM", x + 8, r, bw, rh + 2, "Normal ON", C_BTN, C_BTNTXT);
   RM_Button("STARTREC", x + 16 + bw, r, bw, rh + 2, "Start Recovery", C_BTN, C_AMBER);
   r += rh + 6;
   RM_Button("PAUSEREC", x + 8, r, bw, rh + 2, "Pause Recovery", C_BTN, C_BTNTXT);
   RM_Button("CLOSEBSK", x + 16 + bw, r, bw, rh + 2, "Close Basket", C_BTN, C_RED);
   r += rh + 8;
   ObjectSetInteger(0, RM_DPFX + "D_BG", OBJPROP_YSIZE, r - y);
   g_panelRect[3][0] = x; g_panelRect[3][1] = y; g_panelRect[3][2] = w; g_panelRect[3][3] = r - y;
   // set the header texts once
   RM_Set("D_H_2", "Buy lots", C_DIM);
   RM_Set("D_H_3", "Sell lots", C_DIM);
   RM_Set("D_H_4", "P/L", C_DIM);
  }

void RM_RoleStats(int role, int &cnt, double &bl, double &sl, double &pl)
  {
   cnt = 0; bl = 0; sl = 0; pl = 0;
   if(role == RM_ROLE_NORMAL)
     {
      for(int i = 0; i < g_nbook.n; i++)
        {
         cnt++;
         if(g_nbook.type[i] == RM_BUY) bl += g_nbook.lots[i]; else sl += g_nbook.lots[i];
         pl += RM_LegNet(g_nbook, i);
        }
      return;
     }
   for(int k = 0; k < g_book.n; k++)
     {
      if(g_book.role[k] != role)
         continue;
      cnt++;
      if(g_book.type[k] == RM_BUY) bl += g_book.lots[k]; else sl += g_book.lots[k];
      pl += RM_LegNet(g_book, k);
     }
  }

void RM_RoleRow(string key, int role)
  {
   int c; double bl, sl, pl;
   RM_RoleStats(role, c, bl, sl, pl);
   RM_Set(key + "_1", IntegerToString(c), C_TEXT);
   RM_Set(key + "_2", RM_Lots(bl), C_TEXT);
   RM_Set(key + "_3", RM_Lots(sl), C_TEXT);
   RM_Set(key + "_4", RM_Money(pl), RM_PLColor(pl));
  }

string RM_Dur(long secs)
  {
   if(secs < 0)
      secs = 0;
   return IntegerToString(secs / 86400) + "d " + IntegerToString((secs % 86400) / 3600) + "h " +
          IntegerToString((secs % 3600) / 60) + "m";
  }

void RM_RefreshCycle()
  {
   if(InpOperatingMode == RM_OP_RECOVERY_ONLY || ObjectFind(0, RM_DPFX + "D_BG") < 0)
      return;
   string cur = AccountCurrency();
   color chip = C_GREEN;
   if(g_ctl == RM_CTL_ERROR_HOLD) chip = C_RED;
   else if(g_ctl == RM_CTL_HANDOVER || g_ctl == RM_CTL_RECOVERY_ACTIVE || g_ctl == RM_CTL_RECOVERY_CLOSING) chip = C_AMBER;
   else if(g_ctl == RM_CTL_PAUSED || g_ctl == RM_CTL_COOLDOWN) chip = C_AMBER;
   RM_SetBg("D_CHIP", chip);
   RM_Set("D_CHIPT", RM_CtlName(g_ctl), C_BG);
   RM_Set("D_MODE", "Mode " + RM_OpModeName(), C_TEXT);
   bool normalActive = (g_ctl == RM_CTL_NORMAL && !g_recLatch && g_normalEnabled && !g_normalHalted && g_normalBlock == "");
   string eng = "MONITORING";
   if(InpOperatingMode == RM_OP_THREE_MA_ONLY) eng = "DISABLED";
   else if(g_ctl == RM_CTL_RECOVERY_CLOSING) eng = "CLOSING";
   else if(g_recLatch) eng = (g_ctl == RM_CTL_PAUSED) ? "PAUSED" : "ACTIVE";
   RM_Set("D_ENG", "Normal " + RM_Pick(normalActive, "ACTIVE", "BLOCKED") + " | Recovery " + eng,
          normalActive ? C_GREEN : C_AMBER);
   string scope = (InpRecoveryTriggerScope == RM_TSCOPE_ACCOUNT) ? "account" : "managed";
   RM_Set("D_DD", "DD " + RM_Money(g_ctlDDMoney) + " " + cur + " (" + DoubleToString(g_ctlDDPct, 2) + "%) " + scope +
          " floating", g_ctlDDMoney > 0 ? C_RED : C_TEXT);
   double v = RM_TrigMetricValue();
   string thr = "Trigger " + DoubleToString(InpLaunchDrawdown, 2) + " " + RM_TrigUnit();
   if(InpOperatingMode == RM_OP_THREE_MA_WITH_RECOVERY)
      thr += g_recLatch ? " | latched at " + DoubleToString(g_trigValue, 2)
                        : " | remaining " + DoubleToString(MathMax(0.0, InpLaunchDrawdown - v), 2);
   else
      thr += " | not used (" + RM_OpModeName() + ")";
   RM_Set("D_THR", thr, C_DIM);
   double prog = g_recLatch ? 1.0 : g_ctlProgress;
   int bw = (int)MathMax(1, g_barW * prog);
   ObjectSetInteger(0, RM_DPFX + "D_BAR", OBJPROP_XSIZE, bw);
   RM_SetBg("D_BAR", prog >= 1.0 ? C_RED : (prog >= 0.66 ? C_AMBER : C_GREEN));
   RM_Set("D_MA", "F " + IntegerToString(InpFastPeriod) + " " + RM_MethodName(InpFastMethod) + "/" + RM_PriceName(InpFastPrice) +
          "  S " + IntegerToString(InpSlowPeriod) + " " + RM_MethodName(InpSlowMethod) + "/" + RM_PriceName(InpSlowPrice) +
          (InpUseFilterMA ? "  Flt " + IntegerToString(InpFilterPeriod) + " " + RM_MethodName(InpFilterMethod) + "/" +
           RM_PriceName(InpFilterPrice) : "  Flt off"), C_DIM);
   RM_Set("D_SIG", "Signal " + RM_SignalText() + (g_lastSignalBar > 0 ? " @ " + TimeToString((datetime)g_lastSignalBar) : "") +
          "  f " + DoubleToString(g_maFast1, g_digits) + " s " + DoubleToString(g_maSlow1, g_digits),
          g_lastSignal > 0 ? C_ACCENT : (g_lastSignal < 0 ? C_AMBER : C_TEXT));
   RM_RoleRow("D_RN", RM_ROLE_NORMAL);
   RM_RoleRow("D_RO", RM_ROLE_ORIGINAL);
   RM_RoleRow("D_RH", RM_ROLE_LOCK);
   RM_RoleRow("D_RR", RM_ROLE_RECOVERY);
   string cyc = "Cycle " + IntegerToString(g_cycleId);
   if(g_recLatch)
      cyc += " since " + TimeToString((datetime)g_cycleStart) + " (" + RM_Dur((long)TimeCurrent() - g_cycleStart) + ")";
   else if(g_cycleEnd > 0)
      cyc += " " + RM_OutcomeName(g_cycleOutcome) + ", lasted " + RM_Dur(g_cycleEnd - g_cycleStart);
   else
      cyc += " - none yet";
   RM_Set("D_CYC", RM_Cut(cyc, 60), C_TEXT);
   double realised = g_recLatch ? g_realizedSession : g_cycleRealized;
   RM_Set("D_PL", "Cycle realised " + RM_Money(realised) + " | floating " + RM_Money(g_tot.totalPL) + " " + cur,
          RM_PLColor(realised));
   string res = "Auto-resume " + RM_Pick(InpAutoResumeAfterRecovery, "ON", "OFF") + ", cooldown " +
                IntegerToString(InpResumeCooldownBars) + " bars";
   if(g_ctl == RM_CTL_COOLDOWN)
      res = RM_Cut(g_ctlStatus, 58);
   RM_Set("D_RES", res, g_ctl == RM_CTL_COOLDOWN ? C_AMBER : C_DIM);
   RM_Set("D_WHY", RM_Cut("Last: " + (g_lastReason != "" ? g_lastReason : "-"), 60), C_DIM);
   string blk = (g_normalBlock != "") ? g_normalBlock : (g_lastDenied != "" ? "Denied: " + g_lastDenied : "");
   if(g_ctl == RM_CTL_ERROR_HOLD)
      blk = "ERROR: " + g_errorText;
   RM_Set("D_BLK", RM_Cut(blk, 60), g_ctl == RM_CTL_ERROR_HOLD ? C_RED : C_AMBER);
   string nb = (g_ctl == RM_CTL_COOLDOWN) ? "Resume Normal" : (g_normalHalted ? "Reset Normal" : RM_Pick(g_normalEnabled, "Normal OFF", "Normal ON"));
   RM_Set("NRM", nb, g_normalEnabled && !g_normalHalted ? C_BTNTXT : C_GREEN);
   RM_Set("PAUSEREC", (g_ctl == RM_CTL_PAUSED || g_ctl == RM_CTL_ERROR_HOLD) ? "Resume Recovery" : "Pause Recovery", C_BTNTXT);
  }

//+------------------------------------------------------------------+
//| Confirmation previews for the cycle actions                       |
//+------------------------------------------------------------------+
void RM_PrepareCyclePending(int act)
  {
   string cur = AccountCurrency();
   RM_PlanReset(g_confirmPlan, RM_PLAN_NONE);
   if(act == RM_ACT_START_REC)
     {
      g_pendingText1 = "START RECOVERY NOW?";
      g_pendingText2 = "Transfers " + IntegerToString(g_normalCnt) + " normal orders, " + RM_Lots(g_normalLots) +
                       " lots, floating " + RM_Money(g_normalNet) + " " + cur;
      g_pendingText3 = "Normal trading stays blocked until the cycle completes";
      return;
     }
   if(g_recLatch)
     {
      int c; double bl, sl, pl, tb = 0, ts = 0;
      int n = 0;
      for(int r = RM_ROLE_ORIGINAL; r <= RM_ROLE_RECOVERY; r++)
        {
         RM_RoleStats(r, c, bl, sl, pl);
         n += c; tb += bl; ts += sl;
        }
      g_pendingText1 = "TERMINATE RECOVERY CYCLE " + IntegerToString(g_cycleId) + " EARLY?";
      g_pendingText2 = "Remaining " + IntegerToString(n) + " orders BUY " + RM_Lots(tb) + " / SELL " + RM_Lots(ts) +
                       " floating " + RM_Money(g_tot.totalPL) + " " + cur;
      g_pendingText3 = "Realised so far " + RM_Money(g_realizedSession) + "; normal trading then needs a reset";
     }
   else
     {
      g_pendingText1 = "CLOSE NORMAL BASKET (" + IntegerToString(g_normalCnt) + " orders)?";
      g_pendingText2 = "Lots " + RM_Lots(g_normalLots) + "  est. P/L " + RM_Money(g_normalNet) + " " + cur;
      g_pendingText3 = RM_Cut("Tickets " + RM_NormalTicketList(), 64);
     }
  }

void RM_CycleButton(string key)
  {
   string msg = "";
   if(key == "NRM")
     {
      RM_CmdToggleNormal(msg);
      RM_UiMsg(msg, C_DIM);
      return;
     }
   if(key == "PAUSEREC")
     {
      RM_CmdPauseRecovery(msg);
      RM_UiMsg(msg, C_DIM);
      return;
     }
   int act = (key == "STARTREC") ? RM_ACT_START_REC : RM_ACT_CLOSE_BASKET;
   g_pendingAct = act;
   g_pendingSince = GetTickCount();
   RM_PrepareCyclePending(act);
   if(InpConfirmActions)
     {
      RM_ShowConfirm();
      RM_UiMsg("press Confirm in the amber box", C_AMBER);
     }
   else
      RM_ExecuteCyclePending(act);
  }

void RM_ExecuteCyclePending(int act)
  {
   string msg = "";
   bool ok = (act == RM_ACT_START_REC) ? RM_CmdStartRecovery(msg) : RM_CmdCloseBasket(msg);
   RM_UiMsg(msg, ok ? C_GREEN : C_RED);
  }

#endif

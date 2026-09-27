//+------------------------------------------------------------------+
//| RM_DashUnits.mqh - panel E "DISTANCE UNITS" (all modes).           |
//| Shows how configured distances become executable prices for the   |
//| chart symbol. Price-distance normalisation only: it does not      |
//| claim equal money risk, volatility or profitability.              |
//+------------------------------------------------------------------+
#ifndef RM_DASHUNITS_MQH
#define RM_DASHUNITS_MQH

void RM_BuildUnits(int chartW)
  {
   int w = g_mw, rh = g_rh;
   int h = 11 * rh + 12;
   int x, y;
   if(g_panelRect[3][2] > 0)
     {
      // beside the cycle panel when there is room, else below it
      x = g_panelRect[3][0] - w - 8;
      y = g_py;
      if(x < g_px + g_mw + 8)
        {
         x = g_panelRect[3][0];
         y = g_panelRect[3][1] + g_panelRect[3][3] + 6;
        }
     }
   else
     {
      x = (int)MathMax(g_px + g_mw + 8, chartW - w - 60);
      y = g_py;
     }
   RM_Rect("U_BG", x, y, w, h, C_BG, C_BORDER);
   RM_Rect("U_HEAD", x, y, w, rh + 4, C_HEAD, C_BORDER);
   RM_Text("U_TITLE", x + 8, y + 3, "DISTANCE UNITS", C_TEXT, false, true);
   RM_Rect("U_CHIP", x + w - 108, y + 4, 100, rh - 4, C_GREEN, C_GREEN);
   RM_Text("U_CHIPT", x + w - 102, y + 4, "", C_BG, false, true);
   int r = y + rh + 8;
   string keys[] = {"U_SYM", "U_META", "U_MODE", "U_GRID", "U_BPTS", "U_NORM", "U_LVL", "U_MSG", "U_NOTE"};
   for(int i = 0; i < ArraySize(keys); i++)
     {
      RM_Text(keys[i], x + 8, r, "", C_TEXT, false, false);
      r += rh;
     }
   g_panelRect[4][0] = x; g_panelRect[4][1] = y; g_panelRect[4][2] = w; g_panelRect[4][3] = h;
  }

string RM_Px(double v)
  {
   return DoubleToString(v, (int)MathMax(g_dist.digits, 2));
  }

void RM_RefreshUnits()
  {
   if(ObjectFind(0, RM_DPFX + "U_BG") < 0)
      return;
   bool legacy = (InpConfigVersion < 2);
   string chip = "OK";
   color cc = C_GREEN;
   if(!g_dist.valid) { chip = "UNDEFINED"; cc = C_RED; }
   else if(legacy)   { chip = "LEGACY"; cc = C_AMBER; }
   RM_SetBg("U_CHIP", cc);
   RM_Set("U_CHIPT", chip, C_BG);
   RM_Set("U_SYM", "Symbol " + g_sym + " | profile " + RM_ProfileName(g_dist.profile) + " (" +
          RM_ProfileSourceName(g_dist.source) + ")", C_TEXT);
   RM_Set("U_META", "Digits " + IntegerToString(g_dist.digits) + " | Point " + DoubleToString(g_dist.brokerPoint, 8) +
          " | tick " + DoubleToString(g_dist.tickPrice, 8), C_DIM);
   string modeTxt = RM_DistModeName(g_dist.mode) + RM_Pick(legacy, " (legacy)", "") + " | unit " +
                    (g_dist.unitPrice > 0.0 ? DoubleToString(g_dist.unitPrice, 8) : "undefined");
   RM_Set("U_MODE", modeTxt, g_dist.unitPrice > 0.0 ? C_TEXT : C_RED);
   // recovery grid (stored cycle units first)
   double req = RM_RecStepRequestedPrice(1);
   double eff = RM_EffectiveSpacing(req, RM_TickPrice());
   string src = g_ctxRec.active ? " [cycle units]" : "";
   if(req > 0.0)
     {
      RM_Set("U_GRID", "Grid " + DoubleToString(InpGridStepPoints, 1) + " -> req " + RM_Px(req) + " | eff " + RM_Px(eff) + src, C_TEXT);
      RM_Set("U_BPTS", "Equivalent broker points " + DoubleToString(RM_PriceToBrokerPoints(eff, g_dist.brokerPoint), 1), C_DIM);
     }
   else
     {
      RM_Set("U_GRID", "Grid " + DoubleToString(InpGridStepPoints, 1) + " -> undefined", C_RED);
      RM_Set("U_BPTS", "Equivalent broker points -", C_DIM);
     }
   if(InpOperatingMode != RM_OP_RECOVERY_ONLY)
     {
      double ns = RM_NormStepPrice(), tp = RM_NormTPPrice();
      RM_Set("U_NORM", "Normal avg " + (ns > 0 ? RM_Px(RM_EffectiveSpacing(ns, RM_TickPrice())) : "-") + " | TP " +
             (tp > 0 ? RM_Px(RM_EffectiveSpacing(tp, RM_TickPrice())) : "-") + RM_Pick(g_ctxNorm.active, " [basket units]", ""), C_DIM);
     }
   else
      RM_Set("U_NORM", "Normal strategy not used (RECOVERY_ONLY)", C_DIM);
   double lb = g_nextLevel[RM_BUY], ls = g_nextLevel[RM_SELL];
   string which = "Rec";
   if(lb <= 0.0 && ls <= 0.0 && InpOperatingMode != RM_OP_RECOVERY_ONLY)
     {
      lb = g_normNextLevel[RM_BUY];
      ls = g_normNextLevel[RM_SELL];
      which = "Norm";
     }
   RM_Set("U_LVL", which + " next BUY " + (lb > 0 ? RM_Px(lb) : "-") + " | SELL " + (ls > 0 ? RM_Px(ls) : "-"), C_TEXT);
   string msg = "";
   if(!g_dist.valid)
      msg = g_dist.why;
   else if(legacy)
      msg = g_migrationText;
   RM_Set("U_MSG", RM_Cut(msg, 64), !g_dist.valid ? C_RED : C_AMBER);
   RM_Set("U_NOTE", "Price-distance normalisation only - not equal risk", C_DIM);
  }

#endif

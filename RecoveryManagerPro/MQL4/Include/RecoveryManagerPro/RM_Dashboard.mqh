//+------------------------------------------------------------------+
//| RM_Dashboard.mqh - three native-object panels                      |
//|  A  main panel (upper left)      totals, controls, closures, DD   |
//|  B  current-group panel (lower left)                               |
//|  C  manual opening panel (lower right)                             |
//| Every figure comes from g_book / g_tot / g_curGroup /              |
//| g_reducePreview, i.e. the same snapshot the planner used.         |
//| Objects are created once (layout) and only their text/colours     |
//| change on refresh. Prefix RMP_D_ ; removed on deinit.             |
//+------------------------------------------------------------------+
#ifndef RM_DASHBOARD_MQH
#define RM_DASHBOARD_MQH

#define RM_DPFX "RMP_D_"

#define RM_ACT_NONE      0
#define RM_ACT_CLOSE_ALL 1
#define RM_ACT_REDUCE    2
#define RM_ACT_GROUP     3
#define RM_ACT_OPEN_BUY  4
#define RM_ACT_OPEN_SELL 5

//--- theme
color  C_BG, C_BORDER, C_HEAD, C_TEXT, C_DIM, C_GREEN, C_RED, C_AMBER, C_BTN, C_BTNTXT, C_ACCENT;

//--- layout state
int    g_px = 8, g_py = 22;          // main panel origin (persisted)
bool   g_minimized = false;          // persisted
int    g_panelSize = RM_PANEL_NORMAL;
int    g_fs = 8;                     // effective font size
int    g_rh = 18;                    // row height
int    g_mw = 300;                   // main panel width
int    g_gw = 300;                   // group panel width
int    g_cw = 230;                   // manual panel width
int    g_lastChartW = 0, g_lastChartH = 0;
uint   g_lastRefreshMs = 0;
uint   g_lastClickMs = 0;
bool   g_layoutBuilt = false;

//--- manual panel state
double g_uiLot = 0.10;
bool   g_uiRecoveryRole = false;
string g_uiMsg = "";
color  g_uiMsgClr = clrNONE;

//--- confirmation state
int    g_pendingAct = RM_ACT_NONE;
string g_pendingText1 = "", g_pendingText2 = "", g_pendingText3 = "";
uint   g_pendingSince = 0;

string RM_GvKey(string what)
  {
   return "RMP_UI_" + g_keyBase + "_" + what;
  }

void RM_ThemeColors()
  {
   if(InpTheme == RM_THEME_LIGHT)
     {
      C_BG = C'245,245,247'; C_BORDER = C'175,175,180'; C_HEAD = C'226,228,234';
      C_TEXT = C'25,25,30'; C_DIM = C'95,95,105'; C_GREEN = C'0,135,60';
      C_RED = C'200,35,35'; C_AMBER = C'185,115,0'; C_BTN = C'218,220,228';
      C_BTNTXT = C'20,20,25'; C_ACCENT = C'40,100,190';
     }
   else
     {
      C_BG = C'28,29,33'; C_BORDER = C'68,70,78'; C_HEAD = C'42,44,50';
      C_TEXT = C'222,222,226'; C_DIM = C'145,147,155'; C_GREEN = C'80,205,120';
      C_RED = C'240,95,95'; C_AMBER = C'242,182,64'; C_BTN = C'58,60,70';
      C_BTNTXT = C'240,240,240'; C_ACCENT = C'80,140,215';
     }
  }

//+------------------------------------------------------------------+
//| Object helpers                                                    |
//+------------------------------------------------------------------+
void RM_ObjCommon(string n)
  {
   ObjectSetInteger(0, n, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, n, OBJPROP_HIDDEN, true);
   ObjectSetInteger(0, n, OBJPROP_BACK, false);
  }

void RM_Rect(string n, int x, int y, int w, int h, color bg, color border)
  {
   n = RM_DPFX + n;
   if(ObjectFind(0, n) < 0)
      ObjectCreate(0, n, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   RM_ObjCommon(n);
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, n, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, n, OBJPROP_YSIZE, h);
   ObjectSetInteger(0, n, OBJPROP_BGCOLOR, bg);
   ObjectSetInteger(0, n, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, n, OBJPROP_COLOR, border);
   ObjectSetInteger(0, n, OBJPROP_WIDTH, 1);
  }

void RM_Text(string n, int x, int y, string text, color clr, bool right, bool bold)
  {
   n = RM_DPFX + n;
   if(ObjectFind(0, n) < 0)
      ObjectCreate(0, n, OBJ_LABEL, 0, 0, 0);
   RM_ObjCommon(n);
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, n, OBJPROP_ANCHOR, right ? ANCHOR_RIGHT_UPPER : ANCHOR_LEFT_UPPER);
   ObjectSetString(0, n, OBJPROP_FONT, bold ? "Arial Bold" : "Arial");
   ObjectSetInteger(0, n, OBJPROP_FONTSIZE, g_fs);
   ObjectSetInteger(0, n, OBJPROP_COLOR, clr);
   ObjectSetString(0, n, OBJPROP_TEXT, text);
  }

void RM_Button(string n, int x, int y, int w, int h, string text, color bg, color fg)
  {
   n = RM_DPFX + n;
   if(ObjectFind(0, n) < 0)
      ObjectCreate(0, n, OBJ_BUTTON, 0, 0, 0);
   RM_ObjCommon(n);
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, n, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, n, OBJPROP_YSIZE, h);
   ObjectSetString(0, n, OBJPROP_FONT, "Arial Bold");
   ObjectSetInteger(0, n, OBJPROP_FONTSIZE, g_fs);
   ObjectSetInteger(0, n, OBJPROP_BGCOLOR, bg);
   ObjectSetInteger(0, n, OBJPROP_COLOR, fg);
   ObjectSetInteger(0, n, OBJPROP_BORDER_COLOR, C_BORDER);
   ObjectSetInteger(0, n, OBJPROP_STATE, false);
   ObjectSetInteger(0, n, OBJPROP_ZORDER, 10);
   ObjectSetString(0, n, OBJPROP_TEXT, text);
  }

void RM_Edit(string n, int x, int y, int w, int h, string text)
  {
   n = RM_DPFX + n;
   if(ObjectFind(0, n) < 0)
      ObjectCreate(0, n, OBJ_EDIT, 0, 0, 0);
   RM_ObjCommon(n);
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, n, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, n, OBJPROP_YSIZE, h);
   ObjectSetString(0, n, OBJPROP_FONT, "Arial");
   ObjectSetInteger(0, n, OBJPROP_FONTSIZE, g_fs);
   ObjectSetInteger(0, n, OBJPROP_ALIGN, ALIGN_CENTER);
   ObjectSetInteger(0, n, OBJPROP_BGCOLOR, C_BG);
   ObjectSetInteger(0, n, OBJPROP_COLOR, C_TEXT);
   ObjectSetInteger(0, n, OBJPROP_BORDER_COLOR, C_BORDER);
   ObjectSetInteger(0, n, OBJPROP_ZORDER, 10);
   ObjectSetString(0, n, OBJPROP_TEXT, text);
  }

//--- refresh-time setters: touch the object only when something changed
void RM_Set(string n, string text, color clr)
  {
   n = RM_DPFX + n;
   if(ObjectFind(0, n) < 0)
      return;
   if(ObjectGetString(0, n, OBJPROP_TEXT) != text)
      ObjectSetString(0, n, OBJPROP_TEXT, text);
   if((color)ObjectGetInteger(0, n, OBJPROP_COLOR) != clr)
      ObjectSetInteger(0, n, OBJPROP_COLOR, clr);
  }

void RM_SetBg(string n, color bg)
  {
   n = RM_DPFX + n;
   if(ObjectFind(0, n) >= 0 && (color)ObjectGetInteger(0, n, OBJPROP_BGCOLOR) != bg)
      ObjectSetInteger(0, n, OBJPROP_BGCOLOR, bg);
  }

color RM_PLColor(double v)
  {
   if(v > 0.004)
      return C_GREEN;
   if(v < -0.004)
      return C_RED;
   return C_TEXT;
  }

string RM_Cut(string s, int maxLen)
  {
   if(StringLen(s) <= maxLen)
      return s;
   return StringSubstr(s, 0, maxLen - 1) + "~";
  }

//+------------------------------------------------------------------+
//| Init / layout                                                     |
//+------------------------------------------------------------------+
void RM_DashInit()
  {
   RM_ThemeColors();
   g_panelSize = InpPanelSize;
   g_uiLot = InpManualLot;
   g_uiRecoveryRole = InpPanelOpensRecovery;
   g_px = InpPanelX;
   g_py = InpPanelY;
   if(GlobalVariableCheck(RM_GvKey("X")))
      g_px = (int)GlobalVariableGet(RM_GvKey("X"));
   if(GlobalVariableCheck(RM_GvKey("Y")))
      g_py = (int)GlobalVariableGet(RM_GvKey("Y"));
   if(GlobalVariableCheck(RM_GvKey("MIN")))
      g_minimized = (GlobalVariableGet(RM_GvKey("MIN")) != 0.0);
   RM_DashRelayout();
  }

void RM_DashDeinit()
  {
   ObjectsDeleteAll(0, RM_DPFX);
   ChartRedraw();
  }

void RM_SaveUi()
  {
   if(IsTesting())
      return;
   GlobalVariableSet(RM_GvKey("X"), g_px);
   GlobalVariableSet(RM_GvKey("Y"), g_py);
   GlobalVariableSet(RM_GvKey("MIN"), g_minimized ? 1.0 : 0.0);
  }

void RM_DashRelayout()
  {
   int cw = (int)ChartGetInteger(0, CHART_WIDTH_IN_PIXELS, 0);
   int ch = (int)ChartGetInteger(0, CHART_HEIGHT_IN_PIXELS, 0);
   g_lastChartW = cw;
   g_lastChartH = ch;
   ObjectsDeleteAll(0, RM_DPFX);
   for(int i = 0; i < 3; i++)
      for(int j = 0; j < 4; j++)
         g_panelRect[i][j] = 0;
   double sc = (g_panelSize == RM_PANEL_LARGE) ? 1.3 : 1.0;
   g_fs = (int)MathRound(InpFontSize * sc);
   g_rh = g_fs * 2 + 3;
   g_mw = (int)MathMax(260, g_fs * 37);
   g_gw = g_mw;
   g_cw = (int)MathRound(g_fs * 27);
   if(g_panelSize == RM_PANEL_HIDDEN)
     {
      RM_Button("SHOW", 4, 18, 44, g_rh, "RMP", C_BTN, C_BTNTXT);
      ChartRedraw();
      g_layoutBuilt = true;
      return;
     }
   RM_BuildMain();
   if(!g_minimized)
     {
      RM_BuildGroup(ch);
      RM_BuildManual(cw, ch);
     }
   g_layoutBuilt = true;
   RM_DashRefresh(true);
  }

//--- column positions inside a panel of width w starting at x
int RM_C1(int x, int w) { return x + (int)(w * 0.47); }
int RM_C2(int x, int w) { return x + (int)(w * 0.70); }
int RM_C3(int x, int w) { return x + w - 8; }

void RM_Row4(string key, int x, int y, int w, string label, color lc)
  {
   RM_Text(key + "_L", x + 8, y, label, lc, false, false);
   RM_Text(key + "_1", RM_C1(x, w), y, "", C_TEXT, true, false);
   RM_Text(key + "_2", RM_C2(x, w), y, "", C_TEXT, true, false);
   RM_Text(key + "_3", RM_C3(x, w), y, "", C_TEXT, true, false);
  }

void RM_Section(string key, int x, int y, int w, string title)
  {
   RM_Rect(key + "_BG", x + 1, y, w - 2, g_rh - 2, C_HEAD, C_HEAD);
   RM_Text(key, x + 8, y + 1, title, C_DIM, false, true);
  }

//+------------------------------------------------------------------+
//| A: main panel                                                     |
//+------------------------------------------------------------------+
void RM_BuildMain()
  {
   int x = g_px, y = g_py, w = g_mw, rh = g_rh;
   int rows = g_minimized ? 1 : (InpShowAccountBlock ? 30 : 23);
   int h = rows * rh + 8;
   RM_Rect("M_BG", x, y, w, h, C_BG, C_BORDER);
   RM_Rect("M_HANDLE", x, y, w, rh + 4, C_HEAD, C_BORDER);
   // title bar doubles as drag handle (double-click to select, then drag)
   string hn = RM_DPFX + "M_HANDLE";
   ObjectSetInteger(0, hn, OBJPROP_SELECTABLE, true);
   ObjectSetString(0, hn, OBJPROP_TOOLTIP, "Double-click, then drag to move the panel");
   RM_Text("M_TITLE", x + 8, y + 3, "RECOVERY MANAGER PRO", C_TEXT, false, true);
   RM_Rect("M_CHIP", x + w - 118, y + 4, 84, rh - 4, C_AMBER, C_AMBER);
   RM_Text("M_CHIPT", x + w - 112, y + 4, "", C_BG, false, true);
   RM_Button("MIN", x + w - 28, y + 3, 22, rh - 2, g_minimized ? "+" : "_", C_BTN, C_BTNTXT);
   g_panelRect[0][0] = x; g_panelRect[0][1] = y; g_panelRect[0][2] = w; g_panelRect[0][3] = h;
   if(g_minimized)
     {
      ChartRedraw();
      return;
     }
   int r = y + rh + 8;
   RM_Text("M_STATE", x + 8, r, "", C_TEXT, false, false); r += rh;
   RM_Text("M_H_1", RM_C1(x, w), r, "Orders", C_DIM, true, false);
   RM_Text("M_H_2", RM_C2(x, w), r, "Lots", C_DIM, true, false);
   RM_Text("M_H_3", RM_C3(x, w), r, "P/L " + AccountCurrency(), C_DIM, true, false);
   r += rh;
   RM_Section("M_S_MAIN", x, r, w, "MAIN POSITION (original + lock)"); r += rh;
   RM_Row4("M_MB", x, r, w, "BUY", C_ACCENT); r += rh;
   RM_Row4("M_MS", x, r, w, "SELL", C_AMBER); r += rh;
   RM_Section("M_S_REC", x, r, w, "RECOVERY ORDERS"); r += rh;
   RM_Row4("M_RB", x, r, w, "BUY", C_ACCENT); r += rh;
   RM_Row4("M_RS", x, r, w, "SELL", C_AMBER); r += rh;
   RM_Rect("M_SEP", x + 6, r, w - 12, 1, C_BORDER, C_BORDER); r += 3;
   RM_Row4("M_TOT", x, r, w, "TOTAL managed", C_TEXT); r += rh + 2;
   int bw = (w - 24) / 2;
   RM_Button("STOP", x + 8, r, bw, rh + 2, "Stop Recovery", C_BTN, C_BTNTXT);
   RM_Button("CLOSEALL", x + 16 + bw, r, bw, rh + 2, "Close All", C_BTN, C_RED);
   r += rh + 8;
   RM_Section("M_S_POS", x, r, w, "POSSIBLE CLOSURES (profit-financed)"); r += rh;
   RM_Row4("M_PB", x, r, w, "BUY", C_ACCENT); r += rh;
   RM_Row4("M_PS", x, r, w, "SELL", C_AMBER); r += rh;
   RM_Row4("M_PN", x, r, w, "Net", C_TEXT); r += rh + 2;
   RM_Button("REDUCE", x + 8, r, w - 16, rh + 2, "Reduce Volume", C_BTN, C_BTNTXT);
   r += rh + 8;
   RM_Row4("M_DD", x, r, w, "Managed drawdown", C_TEXT); r += rh;
   RM_Text("M_STATUS1", x + 8, r, "", C_TEXT, false, false); r += rh;
   RM_Text("M_STATUS2", x + 8, r, "", C_DIM, false, false); r += rh;
   RM_Text("M_LAST", x + 8, r, "", C_DIM, false, false); r += rh;
   if(InpShowAccountBlock)
     {
      RM_Section("M_S_ACC", x, r, w, "ACCOUNT & SESSION (enhancement)"); r += rh;
      RM_Row4("M_A1", x, r, w, "Balance / Equity", C_DIM); r += rh;
      RM_Row4("M_A2", x, r, w, "Free margin / Level", C_DIM); r += rh;
      RM_Row4("M_A3", x, r, w, "Spread / Link", C_DIM); r += rh;
      RM_Row4("M_A4", x, r, w, "Realised sess / day", C_DIM); r += rh;
      RM_Row4("M_A5", x, r, w, "Floating acct / managed", C_DIM); r += rh;
      RM_Row4("M_A6", x, r, w, "Lots ORIG/LOCK/REC", C_DIM); r += rh;
     }
   // resize background to the rows actually used
   int hh = r - y + 6;
   ObjectSetInteger(0, RM_DPFX + "M_BG", OBJPROP_YSIZE, hh);
   g_panelRect[0][3] = hh;
  }

//+------------------------------------------------------------------+
//| B: current-group panel (lower left)                               |
//+------------------------------------------------------------------+
void RM_BuildGroup(int chartH)
  {
   int w = g_gw, rh = g_rh;
   int h = 10 * rh + 12;
   int x = 8;
   int y = (int)MathMax(g_py + g_panelRect[0][3] + 8, chartH - h - 8);
   RM_Rect("G_BG", x, y, w, h, C_BG, C_BORDER);
   RM_Rect("G_HEAD", x, y, w, rh + 4, C_HEAD, C_BORDER);
   RM_Text("G_TITLE", x + 8, y + 3, "CURRENT GROUP", C_TEXT, false, true);
   RM_Text("G_KIND", x + w - 8, y + 3, "", C_DIM, true, false);
   int r = y + rh + 8;
   RM_Text("G_H_1", RM_C1(x, w), r, "Size", C_DIM, true, false);
   RM_Text("G_H_2", RM_C2(x, w), r, "Close", C_DIM, true, false);
   RM_Text("G_H_3", RM_C3(x, w), r, "P/L", C_DIM, true, false);
   r += rh;
   RM_Row4("G_B", x, r, w, "Main BUY", C_ACCENT); r += rh;
   RM_Row4("G_S", x, r, w, "Main SELL", C_AMBER); r += rh;
   RM_Row4("G_R", x, r, w, "Recovery", C_TEXT); r += rh;
   RM_Row4("G_C", x, r, w, "Costs + buffer", C_DIM); r += rh;
   RM_Row4("G_T", x, r, w, "Group lots / net", C_TEXT); r += rh;
   RM_Text("G_TARGET", x + 8, r, "", C_DIM, false, false); r += rh + 2;
   RM_Button("GROUP", x + 8, r, w - 16, rh + 2, "Close Current Group", C_BTN, C_BTNTXT);
   g_panelRect[1][0] = x; g_panelRect[1][1] = y; g_panelRect[1][2] = w; g_panelRect[1][3] = h;
  }

//+------------------------------------------------------------------+
//| C: manual opening panel (lower right)                             |
//+------------------------------------------------------------------+
void RM_BuildManual(int chartW, int chartH)
  {
   int w = g_cw, rh = g_rh;
   int h = 7 * rh + 18;
   int x = (int)MathMax(8, chartW - w - 60);     // keep clear of the price scale
   int y = chartH - h - 8;
   RM_Rect("C_BG", x, y, w, h, C_BG, C_BORDER);
   RM_Rect("C_HEAD", x, y, w, rh + 4, C_HEAD, C_BORDER);
   RM_Text("C_TITLE", x + 8, y + 3, "MANUAL ORDERS", C_TEXT, false, true);
   int r = y + rh + 8;
   int bh = rh + 2;
   RM_Button("MINUS", x + 8, r, bh, bh, "-", C_BTN, C_BTNTXT);
   RM_Edit("LOT", x + 12 + bh, r, w - 2 * bh - 24, bh, DoubleToString(g_uiLot, 2));
   RM_Button("PLUS", x + w - 8 - bh, r, bh, bh, "+", C_BTN, C_BTNTXT);
   r += bh + 4;
   RM_Text("C_ROLEL", x + 8, r + 2, "Role", C_DIM, false, false);
   RM_Button("ROLE", x + 60, r, w - 68, bh, "", C_BTN, C_BTNTXT);
   r += bh + 4;
   RM_Text("C_TARGET", x + 8, r, "", C_DIM, false, false);
   r += rh;
   int bw = (w - 24) / 2;
   RM_Button("BUY", x + 8, r, bw, bh + 2, "Open Buy", C'30,90,170', clrWhite);
   RM_Button("SELL", x + 16 + bw, r, bw, bh + 2, "Open Sell", C'180,70,30', clrWhite);
   r += bh + 6;
   RM_Text("C_MSG", x + 8, r, "", C_DIM, false, false);
   g_panelRect[2][0] = x; g_panelRect[2][1] = y; g_panelRect[2][2] = w; g_panelRect[2][3] = h;
  }

//+------------------------------------------------------------------+
//| Confirmation box (under the main panel)                           |
//+------------------------------------------------------------------+
void RM_ShowConfirm()
  {
   int x = g_px, w = g_mw, rh = g_rh;
   int y = g_py + g_panelRect[0][3] + 4;
   RM_Rect("K_BG", x, y, w, 4 * rh + 16, C_HEAD, C_AMBER);
   RM_Text("K_T1", x + 8, y + 4, RM_Cut(g_pendingText1, 60), C_AMBER, false, true);
   RM_Text("K_T2", x + 8, y + 4 + rh, RM_Cut(g_pendingText2, 64), C_TEXT, false, false);
   RM_Text("K_T3", x + 8, y + 4 + 2 * rh, RM_Cut(g_pendingText3, 64), C_TEXT, false, false);
   int bw = (w - 24) / 2;
   RM_Button("OK", x + 8, y + 6 + 3 * rh, bw, rh + 2, "Confirm", C_BTN, C_GREEN);
   RM_Button("CANCEL", x + 16 + bw, y + 6 + 3 * rh, bw, rh + 2, "Cancel", C_BTN, C_TEXT);
   ChartRedraw();
  }

void RM_HideConfirm()
  {
   g_pendingAct = RM_ACT_NONE;
   string names[] = {"K_BG", "K_T1", "K_T2", "K_T3", "OK", "CANCEL"};
   for(int i = 0; i < ArraySize(names); i++)
      ObjectDelete(0, RM_DPFX + names[i]);
   ChartRedraw();
  }

//+------------------------------------------------------------------+
//| Refresh values (timer; every tick in the tester, throttled)       |
//+------------------------------------------------------------------+
void RM_Row4Set(string key, string a, string b, string c, color cc)
  {
   RM_Set(key + "_1", a, C_TEXT);
   RM_Set(key + "_2", b, C_TEXT);
   RM_Set(key + "_3", c, cc);
  }

void RM_StatusChip(string &text, color &clr)
  {
   switch(g_state)
     {
      case RM_ST_PREPARING:
      case RM_ST_LOCKING:
      case RM_ST_RECOVERING:
      case RM_ST_CLOSING:
         text = "ACTIVE"; clr = C_GREEN; break;
      case RM_ST_PAUSED:
         text = "PAUSED"; clr = C_AMBER; break;
      case RM_ST_ERROR_HOLD:
         text = "ERROR"; clr = C_RED; break;
      default:
         text = "WAITING"; clr = C_AMBER;
     }
   if(g_state == RM_ST_RECOVERING && g_block != "")
     { text = "BLOCKED"; clr = C_RED; }
  }

void RM_DashRefresh(bool force)
  {
   if(IsOptimization() || !g_layoutBuilt)
      return;
   uint now = GetTickCount();
   if(!force && now - g_lastRefreshMs < 200)
      return;
   g_lastRefreshMs = now;
   int cw = (int)ChartGetInteger(0, CHART_WIDTH_IN_PIXELS, 0);
   int ch = (int)ChartGetInteger(0, CHART_HEIGHT_IN_PIXELS, 0);
   if(cw != g_lastChartW || ch != g_lastChartH)
     {
      RM_DashRelayout();
      return;
     }
   if(g_pendingAct != RM_ACT_NONE && now - g_pendingSince > 15000)
     {
      RM_HideConfirm();
      RM_UiMsg("confirmation timed out", C_DIM);
     }
   if(g_panelSize == RM_PANEL_HIDDEN)
      return;
   string cur = AccountCurrency();
   string chipT; color chipC;
   RM_StatusChip(chipT, chipC);
   RM_SetBg("M_CHIP", chipC);
   RM_Set("M_CHIPT", chipT, C_BG);
   if(!g_minimized)
     {
      RM_Set("M_STATE", "State " + RM_StateName(g_state) + " | " + RM_Cut(RM_SignalName(), 26) +
             (RM_TrendText() != "" ? " " + RM_TrendText() : ""), C_TEXT);
      RM_Row4Set("M_MB", IntegerToString(g_tot.mainBuyCnt), RM_Lots(g_tot.mainBuyLots), RM_Money(g_tot.mainBuyPL), RM_PLColor(g_tot.mainBuyPL));
      RM_Row4Set("M_MS", IntegerToString(g_tot.mainSellCnt), RM_Lots(g_tot.mainSellLots), RM_Money(g_tot.mainSellPL), RM_PLColor(g_tot.mainSellPL));
      RM_Row4Set("M_RB", IntegerToString(g_tot.recBuyCnt), RM_Lots(g_tot.recBuyLots), RM_Money(g_tot.recBuyPL), RM_PLColor(g_tot.recBuyPL));
      RM_Row4Set("M_RS", IntegerToString(g_tot.recSellCnt), RM_Lots(g_tot.recSellLots), RM_Money(g_tot.recSellPL), RM_PLColor(g_tot.recSellPL));
      RM_Row4Set("M_TOT", IntegerToString(g_tot.totalCnt), RM_Lots(g_tot.totalLots), RM_Money(g_tot.totalPL), RM_PLColor(g_tot.totalPL));
      bool paused = (g_state == RM_ST_PAUSED || g_state == RM_ST_ERROR_HOLD);
      RM_Set("STOP", paused ? "Resume" : "Stop Recovery", paused ? C_GREEN : C_BTNTXT);
      // possible closures
      if(g_reducePreview.n > 0)
        {
         double bpl = g_reducePreview.mainBuySliceNet, spl = g_reducePreview.mainSellSliceNet;
         RM_Row4Set("M_PB", "", RM_Lots(g_reducePreview.mainBuyCloseLots), RM_Money(bpl), RM_PLColor(bpl));
         RM_Row4Set("M_PS", "", RM_Lots(g_reducePreview.mainSellCloseLots), RM_Money(spl), RM_PLColor(spl));
         RM_Row4Set("M_PN", "", "", RM_Money(g_reducePreview.expectedNet), RM_PLColor(g_reducePreview.expectedNet));
        }
      else
        {
         RM_Row4Set("M_PB", "", "0.00", "-", C_DIM);
         RM_Row4Set("M_PS", "", "0.00", "-", C_DIM);
         RM_Row4Set("M_PN", "", "", RM_ReasonName(g_reducePreview.reason), C_DIM);
        }
      RM_Row4Set("M_DD", DoubleToString(g_ddPct, 2) + "%", "peak", RM_Money(g_drawdown) + " / " + RM_Money(g_peakDrawdown),
                 g_drawdown > 0 ? C_RED : C_TEXT);
      string st = (g_status != "") ? g_status : RM_StateName(g_state);
      color stc = (g_state == RM_ST_ERROR_HOLD) ? C_RED : (g_state == RM_ST_PAUSED ? C_AMBER : C_TEXT);
      RM_Set("M_STATUS1", RM_Cut(st, 58), stc);
      string s2 = "";
      if(g_block != "" && StringFind(st, g_block) < 0)
         s2 = "Blocked: " + g_block;
      else if(g_lockResidual > RM_EPS)
         s2 = "Unhedged residual " + DoubleToString(g_lockResidual, 3) + " lots - NOT neutral";
      else if(StringLen(st) > 58)
         s2 = StringSubstr(st, 57);
      RM_Set("M_STATUS2", RM_Cut(s2, 60), s2 != "" && StringFind(s2, "Blocked") == 0 ? C_RED : C_DIM);
      string last = "No closure yet this session";
      if(g_lastPlanKind != RM_PLAN_NONE)
         last = "Last " + RM_PlanKindName(g_lastPlanKind) + ": est " + RM_Money(g_lastPlanEst) + " / realised " + RM_Money(g_lastPlanReal);
      if(RM_JournalOpen())
         last = "Open transaction " + IntegerToString(g_journal.planId) + ": realised so far " + RM_Money(g_journal.realizedNet);
      RM_Set("M_LAST", RM_Cut(last, 60), C_DIM);
      if(InpShowAccountBlock)
        {
         double ml = RM_MarginLevel();
         bool link = IsTesting() || IsConnected();
         RM_Row4Set("M_A1", "", RM_Money(AccountBalance()), RM_Money(AccountEquity()), C_TEXT);
         RM_Row4Set("M_A2", "", RM_Money(AccountFreeMargin()), ml > 0 ? DoubleToString(ml, 0) + "%" : "-", C_TEXT);
         int sp = RM_SpreadPoints();
         RM_Set("M_A3_2", IntegerToString(sp) + " pt", sp > InpMaxSpread ? C_RED : C_TEXT);
         RM_Set("M_A3_3", link ? "connected" : "DISCONNECTED", link ? C_GREEN : C_RED);
         RM_Row4Set("M_A4", "", RM_Money(g_realizedSession), RM_Money(g_realizedDay), RM_PLColor(g_realizedDay));
         double accFloat = AccountEquity() - AccountBalance();
         RM_Row4Set("M_A5", "", RM_Money(accFloat), RM_Money(g_managedNet), RM_PLColor(g_managedNet));
         RM_Row4Set("M_A6", RM_Lots(g_tot.origLots), RM_Lots(g_tot.lockLots),
                    RM_Lots(g_tot.recBuyLots + g_tot.recSellLots), C_TEXT);
        }
      RM_RefreshGroup(cur);
      RM_RefreshManual();
     }
   ChartRedraw();
  }

void RM_RefreshGroup(string cur)
  {
   if(g_curGroup.n == 0)
     {
      // no recovery basket: show which main tickets the next slice would use
      int ib = RM_PickMain(g_book, RM_BUY, false, InpRecoveryPriority, InpFirstRecoveryTicket);
      int is = RM_PickMain(g_book, RM_SELL, false, InpRecoveryPriority, InpFirstRecoveryTicket);
      RM_Set("G_B_L", ib >= 0 ? "Main BUY #" + IntegerToString(g_book.ticket[ib]) : "Main BUY -", C_ACCENT);
      RM_Set("G_S_L", is >= 0 ? "Main SELL #" + IntegerToString(g_book.ticket[is]) : "Main SELL -", C_AMBER);
      RM_Row4Set("G_B", ib >= 0 ? RM_Lots(g_book.lots[ib]) : "", "", ib >= 0 ? RM_Money(RM_LegNet(g_book, ib)) : "", C_DIM);
      RM_Row4Set("G_S", is >= 0 ? RM_Lots(g_book.lots[is]) : "", "", is >= 0 ? RM_Money(RM_LegNet(g_book, is)) : "", C_DIM);
      RM_Set("G_R_L", "Recovery -", C_TEXT);
      RM_Row4Set("G_R", "", "", "", C_DIM);
      RM_Row4Set("G_C", "", "", "", C_DIM);
      RM_Row4Set("G_T", "", "", "", C_DIM);
      RM_Set("G_KIND", "", C_DIM);
      RM_Set("G_TARGET", g_tot.totalCnt == 0 ? "No orders to recover" : "No recovery orders open", C_DIM);
      return;
     }
   double bSize = 0, sSize = 0;
   for(int k = 0; k < g_curGroup.n; k++)
     {
      if(g_curGroup.ticket[k] == g_curGroup.mainBuyTicket) bSize = g_curGroup.ticketLots[k];
      if(g_curGroup.ticket[k] == g_curGroup.mainSellTicket) sSize = g_curGroup.ticketLots[k];
     }
   RM_Set("G_B_L", g_curGroup.mainBuyTicket > 0 ? "Main BUY #" + IntegerToString(g_curGroup.mainBuyTicket) : "Main BUY -", C_ACCENT);
   RM_Set("G_S_L", g_curGroup.mainSellTicket > 0 ? "Main SELL #" + IntegerToString(g_curGroup.mainSellTicket) : "Main SELL -", C_AMBER);
   RM_Row4Set("G_B", g_curGroup.mainBuyTicket > 0 ? RM_Lots(bSize) : "", RM_Lots(g_curGroup.mainBuyCloseLots), RM_Money(g_curGroup.mainBuySliceNet), RM_PLColor(g_curGroup.mainBuySliceNet));
   RM_Row4Set("G_S", g_curGroup.mainSellTicket > 0 ? RM_Lots(sSize) : "", RM_Lots(g_curGroup.mainSellCloseLots), RM_Money(g_curGroup.mainSellSliceNet), RM_PLColor(g_curGroup.mainSellSliceNet));
   int nRec = 0;
   for(int k2 = 0; k2 < g_curGroup.n; k2++)
      if(g_curGroup.role[k2] == RM_ROLE_RECOVERY)
         nRec++;
   RM_Set("G_R_L", "Recovery " + RM_Side(g_curGroup.dir) + " x" + IntegerToString(nRec), g_curGroup.dir == RM_BUY ? C_ACCENT : C_AMBER);
   RM_Row4Set("G_R", "", RM_Lots(g_curGroup.recoveryCloseLots), RM_Money(g_curGroup.recoveryNet), RM_PLColor(g_curGroup.recoveryNet));
   RM_Row4Set("G_C", "", "", "-" + RM_Money(g_curGroup.unbookedCosts + g_curGroup.buffer), C_DIM);
   double lots = g_curGroup.recoveryCloseLots + g_curGroup.mainBuyCloseLots + g_curGroup.mainSellCloseLots;
   RM_Row4Set("G_T", "", RM_Lots(lots), RM_Money(g_curGroup.expectedNet), RM_PLColor(g_curGroup.expectedNet));
   RM_Set("G_KIND", (g_curGroup.isOverlap ? "OVERLAP first+last" : (g_curGroup.isFinal ? "FINAL slice" : "GROUP")), C_DIM);
   RM_Set("G_TARGET", "Target " + RM_Money(g_curGroup.target) + " " + cur + " (" + DoubleToString(InpPartialTPPoints, 0) +
          " pt) " + (g_curGroup.qualifies ? "- READY" : "- waiting"), g_curGroup.qualifies ? C_GREEN : C_DIM);
  }

void RM_RefreshManual()
  {
   RM_Set("ROLE", g_uiRecoveryRole ? "RECOVERY" : "ORIGINAL", g_uiRecoveryRole ? C_AMBER : C_ACCENT);
   RM_Set("C_TARGET", g_sym + " as " + (g_uiRecoveryRole ? "RECOVERY (magic " + IntegerToString(InpRecoveryMagic) + ")"
          : "ORIGINAL (magic " + IntegerToString(InpManualOriginalMagic) + ")"), C_DIM);
   RM_Set("C_MSG", RM_Cut(g_uiMsg, 40), g_uiMsgClr == clrNONE ? C_DIM : g_uiMsgClr);
  }

void RM_UiMsg(string m, color c)
  {
   g_uiMsg = m;
   g_uiMsgClr = c;
   if(m != "")
      Print("RMP UI: ", m);
  }

//+------------------------------------------------------------------+
//| Input handling                                                    |
//+------------------------------------------------------------------+
bool RM_ReadLotField(double &lot)
  {
   string n = RM_DPFX + "LOT";
   string txt = StringTrimRight(StringTrimLeft(ObjectGetString(0, n, OBJPROP_TEXT)));
   StringReplace(txt, ",", ".");
   double v = StringToDouble(txt);
   double norm = RM_NormalizeLot(v, g_meta, RM_ROUND_DOWN);
   if(v <= 0.0 || norm <= 0.0 || MathAbs(norm - v) > RM_EPS)
     {
      ObjectSetString(0, n, OBJPROP_TEXT, DoubleToString(g_uiLot, 2));
      RM_UiMsg("rejected volume '" + txt + "' (min " + RM_Lots(g_meta.minLot) + ", step " +
               DoubleToString(g_meta.lotStep, 2) + ")", C_RED);
      return false;
     }
   g_uiLot = norm;
   lot = norm;
   return true;
  }

void RM_OnEditDone(string name)
  {
   if(name != RM_DPFX + "LOT")
      return;
   double l;
   if(RM_ReadLotField(l))
      RM_UiMsg("volume " + RM_Lots(l) + " applied", C_DIM);
   RM_DashRefresh(true);
  }

void RM_OnDrag(string name)
  {
   if(name != RM_DPFX + "M_HANDLE")
      return;
   g_px = (int)ObjectGetInteger(0, name, OBJPROP_XDISTANCE);
   g_py = (int)ObjectGetInteger(0, name, OBJPROP_YDISTANCE);
   RM_SaveUi();
   RM_DashRelayout();
  }

//+------------------------------------------------------------------+
//| Build the preview for a destructive action                        |
//+------------------------------------------------------------------+
void RM_PreparePending(int act)
  {
   string cur = AccountCurrency();
   g_pendingAct = act;
   g_pendingSince = GetTickCount();
   g_pendingText2 = ""; g_pendingText3 = "";
   if(act == RM_ACT_CLOSE_ALL)
     {
      RM_PlanAll(g_book, g_cfg, g_mpp, RM_PLAN_CLOSE_ALL, -1.0, g_confirmPlan);
      g_pendingText1 = "CLOSE ALL " + IntegerToString(g_confirmPlan.n) + " managed tickets?";
      g_pendingText2 = "Lots " + RM_Lots(g_tot.totalLots) + "  est. P/L " + RM_Money(g_confirmPlan.expectedNet) + " " + cur;
     }
   else if(act == RM_ACT_REDUCE)
     {
      g_confirmPlan = g_reducePreview;
      g_pendingText1 = "REDUCE VOLUME (" + IntegerToString(g_confirmPlan.n) + " legs)?";
      g_pendingText2 = "BUY " + RM_Lots(g_confirmPlan.mainBuyCloseLots) + " / SELL " + RM_Lots(g_confirmPlan.mainSellCloseLots) +
                       "  est. net " + RM_Money(g_confirmPlan.expectedNet) + " " + cur;
     }
   else if(act == RM_ACT_GROUP)
     {
      g_confirmPlan = g_curGroup;
      g_confirmPlan.kind = RM_PLAN_MANUAL;
      g_pendingText1 = "CLOSE CURRENT GROUP (" + IntegerToString(g_confirmPlan.n) + " legs)?";
      g_pendingText2 = "Lots " + RM_Lots(g_confirmPlan.recoveryCloseLots + g_confirmPlan.mainBuyCloseLots + g_confirmPlan.mainSellCloseLots) +
                       "  est. net " + RM_Money(g_confirmPlan.expectedNet) + " " + cur +
                       (g_confirmPlan.expectedNet < 0 ? "  = REALISED LOSS" : "");
     }
   else
     {
      string side = (act == RM_ACT_OPEN_BUY) ? "BUY" : "SELL";
      g_pendingText1 = "OPEN " + side + " " + RM_Lots(g_uiLot) + " " + g_sym + "?";
      g_pendingText2 = "Role " + RM_RoleName(g_uiRecoveryRole ? RM_ROLE_RECOVERY : RM_ROLE_ORIGINAL);
      RM_PlanReset(g_confirmPlan, RM_PLAN_NONE);
     }
   if(g_confirmPlan.n > 0)
     {
      string t = "Tickets:";
      for(int k = 0; k < g_confirmPlan.n && k < 6; k++)
         t += " #" + IntegerToString(g_confirmPlan.ticket[k]) + "(" + RM_Lots(g_confirmPlan.closeLots[k]) + ")";
      if(g_confirmPlan.n > 6)
         t += " +" + IntegerToString(g_confirmPlan.n - 6);
      g_pendingText3 = t;
     }
  }

//+------------------------------------------------------------------+
//| Tickets in the confirmed preview must still match current book   |
//+------------------------------------------------------------------+
bool RM_PreviewStillValid(const RM_Plan &fresh)
  {
   if(fresh.n != g_confirmPlan.n)
      return false;
   for(int k = 0; k < fresh.n; k++)
     {
      bool found = false;
      for(int j = 0; j < g_confirmPlan.n; j++)
         if(g_confirmPlan.ticket[j] == fresh.ticket[k] && MathAbs(g_confirmPlan.closeLots[j] - fresh.closeLots[k]) < RM_EPS)
           { found = true; break; }
      if(!found)
         return false;
     }
   return true;
  }

void RM_ExecutePending()
  {
   int act = g_pendingAct;
   RM_HideConfirm();
   string msg = "";
   bool ok = false;
   RM_UpdatePreviews(true);
   if(act == RM_ACT_CLOSE_ALL)
      ok = RM_ActionCloseAll(msg);
   else if(act == RM_ACT_REDUCE || act == RM_ACT_GROUP)
     {
      // g_plan is scratch space; RM_StartPlan copies it into the journal
      if(act == RM_ACT_REDUCE)
         g_plan = g_reducePreview;
      else
        {
         g_plan = g_curGroup;
         g_plan.kind = RM_PLAN_MANUAL;
        }
      if(InpConfirmActions && !RM_PreviewStillValid(g_plan))
        {
         RM_UiMsg("orders changed - review the new preview", C_AMBER);
         RM_PreparePending(act);
         RM_ShowConfirm();
         return;
        }
      ok = RM_ActionExecutePlan(g_plan, msg);
     }
   else if(act == RM_ACT_OPEN_BUY || act == RM_ACT_OPEN_SELL)
      ok = RM_ActionOpen(act == RM_ACT_OPEN_BUY ? RM_BUY : RM_SELL, g_uiRecoveryRole, g_uiLot, msg);
   RM_UiMsg(msg, ok ? C_GREEN : C_RED);
   RM_DashRefresh(true);
  }

void RM_RequestAction(int act)
  {
   if(act == RM_ACT_REDUCE && g_reducePreview.n == 0)
     { RM_UiMsg("reduce: " + RM_ReasonName(g_reducePreview.reason), C_AMBER); return; }
   if(act == RM_ACT_GROUP && g_curGroup.n == 0)
     { RM_UiMsg("no current group to close", C_AMBER); return; }
   if(act == RM_ACT_CLOSE_ALL && g_tot.totalCnt == 0)
     { RM_UiMsg("nothing to close", C_AMBER); return; }
   if(act == RM_ACT_OPEN_BUY || act == RM_ACT_OPEN_SELL)
     {
      double l;
      if(!RM_ReadLotField(l))
         return;
     }
   RM_PreparePending(act);
   if(InpConfirmActions)
      RM_ShowConfirm();
   else
      RM_ExecutePending();
  }

//+------------------------------------------------------------------+
//| Button dispatcher (chart events live, state polling in tester)    |
//+------------------------------------------------------------------+
void RM_OnButton(string name)
  {
   if(StringFind(name, RM_DPFX) != 0)
      return;
   string key = StringSubstr(name, StringLen(RM_DPFX));
   if(ObjectGetInteger(0, name, OBJPROP_TYPE) == OBJ_BUTTON)
      ObjectSetInteger(0, name, OBJPROP_STATE, false);
   uint now = GetTickCount();
   if(now - g_lastClickMs < 300 && !IsTesting())
      return;                                 // debounce double clicks
   g_lastClickMs = now;
   if(g_busy)
      return;
   if(key == "MIN")
     {
      g_minimized = !g_minimized;
      RM_HideConfirm();
      RM_SaveUi();
      RM_DashRelayout();
      return;
     }
   if(key == "SHOW")
     {
      g_panelSize = RM_PANEL_NORMAL;
      RM_DashRelayout();
      return;
     }
   if(key == "OK")     { RM_ExecutePending(); return; }
   if(key == "CANCEL") { RM_HideConfirm(); RM_UiMsg("cancelled", C_DIM); return; }
   if(g_pendingAct != RM_ACT_NONE && (key == "CLOSEALL" || key == "REDUCE" || key == "GROUP" || key == "BUY" || key == "SELL"))
     {
      RM_UiMsg("confirm or cancel the pending action first", C_AMBER);
      return;
     }
   if(key == "STOP")
     {
      RM_ActionStopResume();
      RM_UiMsg(g_state == RM_ST_PAUSED ? "recovery paused" : "resume requested", C_DIM);
     }
   else if(key == "CLOSEALL") RM_RequestAction(RM_ACT_CLOSE_ALL);
   else if(key == "REDUCE")   RM_RequestAction(RM_ACT_REDUCE);
   else if(key == "GROUP")    RM_RequestAction(RM_ACT_GROUP);
   else if(key == "BUY")      RM_RequestAction(RM_ACT_OPEN_BUY);
   else if(key == "SELL")     RM_RequestAction(RM_ACT_OPEN_SELL);
   else if(key == "ROLE")     g_uiRecoveryRole = !g_uiRecoveryRole;
   else if(key == "PLUS" || key == "MINUS")
     {
      double l = g_uiLot;
      RM_ReadLotField(l);
      l += (key == "PLUS" ? g_meta.lotStep : -g_meta.lotStep);
      l = RM_NormalizeLot(MathMax(g_meta.minLot, l), g_meta, RM_ROUND_NEAREST);
      if(l > 0.0)
         g_uiLot = l;
      ObjectSetString(0, RM_DPFX + "LOT", OBJPROP_TEXT, DoubleToString(g_uiLot, 2));
     }
   RM_DashRefresh(true);
  }

void RM_PollTesterButtons()
  {
   if(!IsVisualMode())
      return;
   string keys[] = {"MIN", "SHOW", "OK", "CANCEL", "STOP", "CLOSEALL", "REDUCE", "GROUP", "BUY", "SELL", "ROLE", "PLUS", "MINUS"};
   for(int i = 0; i < ArraySize(keys); i++)
     {
      string n = RM_DPFX + keys[i];
      if(ObjectFind(0, n) >= 0 && ObjectGetInteger(0, n, OBJPROP_STATE) != 0)
         RM_OnButton(n);
     }
  }

#endif

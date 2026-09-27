//+------------------------------------------------------------------+
//| RM_Annotations.mqh - chart objects outside the panels:            |
//|  - closed-profit labels (yellow), with collision avoidance        |
//|  - dotted open->close connectors for closed legs                  |
//|  - prospective recovery entry levels (blue BUY / orange SELL)     |
//|  - optional possible-close line (a DIFFERENT object: estimated    |
//|    price where the current group reaches its target)              |
//| All objects use the RMP_A_ prefix and are removed on deinit.      |
//+------------------------------------------------------------------+
#ifndef RM_ANNOTATIONS_MQH
#define RM_ANNOTATIONS_MQH

#define RM_APFX       "RMP_A_"
#define RM_MAX_LABELS 150

int    g_labelSeq = 0;
int    g_labelX[RM_MAX_LABELS];
int    g_labelY[RM_MAX_LABELS];
string g_labelName[RM_MAX_LABELS];
int    g_labelN = 0;
// panel rectangles published by the dashboard (x, y, w, h)
int    g_panelRect[4][4];
color  g_savedColors[8];
bool   g_colorsSaved = false;

bool RM_PointInPanels(int x, int y)
  {
   for(int i = 0; i < 4; i++)
     {
      if(g_panelRect[i][2] <= 0)
         continue;
      if(x >= g_panelRect[i][0] - 4 && x <= g_panelRect[i][0] + g_panelRect[i][2] + 4 &&
         y >= g_panelRect[i][1] - 4 && y <= g_panelRect[i][1] + g_panelRect[i][3] + 4)
         return true;
     }
   return false;
  }

bool RM_NearOtherLabel(int x, int y)
  {
   for(int i = 0; i < g_labelN; i++)
      if(MathAbs(g_labelX[i] - x) < 60 && MathAbs(g_labelY[i] - y) < 14)
         return true;
   return false;
  }

//+------------------------------------------------------------------+
//| Place a text label near (time, price), moving it vertically until |
//| it neither covers a panel nor another recent label.               |
//+------------------------------------------------------------------+
void RM_PlaceLabel(datetime t, double price, string text, color clr)
  {
   if(InpAnnotations == RM_ANNOT_OFF)
      return;
   if(InpAnnotations == RM_ANNOT_LOG || IsOptimization())
     {
      Print("RMP result ", text);
      return;
     }
   int x = 0, y = 0;
   double p = price;
   if(ChartTimePriceToXY(0, 0, t, p, x, y))
     {
      int dy = 0;
      for(int tries = 0; tries < 12; tries++)
        {
         int yy = y - dy;
         if(!RM_PointInPanels(x, yy) && !RM_NearOtherLabel(x, yy))
           {
            int sub; datetime tt; double pp;
            if(ChartXYToTimePrice(0, x, yy, sub, tt, pp))
               p = pp;
            y = yy;
            break;
           }
         dy = (tries % 2 == 0) ? -(tries / 2 + 1) * 16 : (tries / 2 + 1) * 16;
        }
     }
   g_labelSeq++;
   // time-stamped names stay unique across re-initialisation (timeframe change keeps old labels)
   string name = RM_APFX + "L" + IntegerToString((long)TimeCurrent()) + "_" + IntegerToString(g_labelSeq);
   if(ObjectCreate(0, name, OBJ_TEXT, 0, t, p))
     {
      ObjectSetString(0, name, OBJPROP_TEXT, text);
      ObjectSetString(0, name, OBJPROP_FONT, "Arial Bold");
      ObjectSetInteger(0, name, OBJPROP_FONTSIZE, InpFontSize + 1);
      ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
      ObjectSetInteger(0, name, OBJPROP_ANCHOR, ANCHOR_LEFT_LOWER);
      ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
     }
   int slot = g_labelN;
   if(g_labelN < RM_MAX_LABELS)
      g_labelN++;
   else
     {
      ObjectDelete(0, g_labelName[0]);
      for(int i = 0; i < RM_MAX_LABELS - 1; i++)
        {
         g_labelX[i] = g_labelX[i + 1];
         g_labelY[i] = g_labelY[i + 1];
         g_labelName[i] = g_labelName[i + 1];
        }
      slot = RM_MAX_LABELS - 1;
     }
   g_labelX[slot] = x;
   g_labelY[slot] = y;
   g_labelName[slot] = name;
  }

//+------------------------------------------------------------------+
//| Realised group result label                                       |
//+------------------------------------------------------------------+
void RM_AnnotGroup(double realized)
  {
   string txt = (realized >= 0 ? "+" : "") + RM_Money(realized) + " " + AccountCurrency();
   RM_PlaceLabel(iTime(g_sym, 0, 0), RM_Bid(), txt, realized >= 0 ? clrYellow : clrOrange);
  }

void RM_AnnotClosed(int ticket, double net, bool grouped)
  {
   if(grouped)
      return;
   string txt = "ext #" + IntegerToString(ticket) + " " + (net >= 0 ? "+" : "") + RM_Money(net);
   RM_PlaceLabel(iTime(g_sym, 0, 0), RM_Bid(), txt, clrSilver);
  }

//+------------------------------------------------------------------+
//| Dotted connector from open to close of a closed ticket            |
//+------------------------------------------------------------------+
void RM_AnnotConnector(int ticket)
  {
   if(!InpDrawConnectors || InpAnnotations != RM_ANNOT_CHART || IsOptimization())
      return;
   if(!OrderSelect(ticket, SELECT_BY_TICKET) || OrderCloseTime() == 0)
      return;
   string name = RM_APFX + "C" + IntegerToString(ticket);
   if(ObjectFind(0, name) >= 0)
      return;
   double net = OrderProfit() + OrderSwap() + OrderCommission();
   if(ObjectCreate(0, name, OBJ_TREND, 0, OrderOpenTime(), OrderOpenPrice(), OrderCloseTime(), OrderClosePrice()))
     {
      ObjectSet(name, OBJPROP_RAY, false);
      ObjectSetInteger(0, name, OBJPROP_STYLE, STYLE_DOT);
      ObjectSetInteger(0, name, OBJPROP_COLOR, net >= 0 ? clrDodgerBlue : clrOrangeRed);
      ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
     }
  }

//+------------------------------------------------------------------+
void RM_HLine(string name, double price, color clr, int style, string tip)
  {
   if(price <= 0.0)
     {
      if(ObjectFind(0, name) >= 0)
         ObjectDelete(0, name);
      return;
     }
   if(ObjectFind(0, name) < 0)
     {
      ObjectCreate(0, name, OBJ_HLINE, 0, 0, price);
      ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
      ObjectSetInteger(0, name, OBJPROP_STYLE, style);
      ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
      ObjectSetInteger(0, name, OBJPROP_BACK, true);
     }
   if(MathAbs(ObjectGetDouble(0, name, OBJPROP_PRICE, 0) - price) > g_meta.point / 2.0)
      ObjectMove(0, name, 0, 0, price);
   ObjectSetString(0, name, OBJPROP_TOOLTIP, tip);
  }

//+------------------------------------------------------------------+
//| Prospective entry levels and the optional possible-close line    |
//+------------------------------------------------------------------+
void RM_AnnotLevels()
  {
   if(IsOptimization())
      return;
   bool show = InpShowGridLevels && g_state == RM_ST_RECOVERING;
   RM_HLine(RM_APFX + "LVL_B", show ? g_nextLevel[RM_BUY] : 0.0, clrDodgerBlue, STYLE_DASH,
            "Next BUY recovery entry level (prospective)");
   RM_HLine(RM_APFX + "LVL_S", show ? g_nextLevel[RM_SELL] : 0.0, clrDarkOrange, STYLE_DASH,
            "Next SELL recovery entry level (prospective)");
   double pc = 0.0;
   if(InpShowCloseLine && g_curGroup.n > 0 && g_meta.point > 0.0)
     {
      double sens = 0.0;
      for(int k = 0; k < g_curGroup.n; k++)
        {
         double perPrice = g_curGroup.closeLots[k] * g_mpp / g_meta.point;
         sens += (g_curGroup.type[k] == RM_BUY) ? perPrice : -perPrice;
        }
      pc = RM_BreakEvenPrice(RM_Bid(), g_curGroup.expectedNet, g_curGroup.target, sens);
     }
   RM_HLine(RM_APFX + "CLOSE", pc, clrGold, STYLE_DOT,
            "Estimated price where the current group reaches its close target (estimate, not an order)");
  }

void RM_AnnotDeinit()
  {
   ObjectsDeleteAll(0, RM_APFX);
  }

//+------------------------------------------------------------------+
//| Optional black chart / green candle scheme (restored on removal)  |
//+------------------------------------------------------------------+
void RM_ApplyChartColors()
  {
   g_savedColors[0] = (color)ChartGetInteger(0, CHART_COLOR_BACKGROUND);
   g_savedColors[1] = (color)ChartGetInteger(0, CHART_COLOR_FOREGROUND);
   g_savedColors[2] = (color)ChartGetInteger(0, CHART_COLOR_CHART_UP);
   g_savedColors[3] = (color)ChartGetInteger(0, CHART_COLOR_CHART_DOWN);
   g_savedColors[4] = (color)ChartGetInteger(0, CHART_COLOR_CANDLE_BULL);
   g_savedColors[5] = (color)ChartGetInteger(0, CHART_COLOR_CANDLE_BEAR);
   g_savedColors[6] = (color)ChartGetInteger(0, CHART_COLOR_GRID);
   g_colorsSaved = true;
   ChartSetInteger(0, CHART_COLOR_BACKGROUND, clrBlack);
   ChartSetInteger(0, CHART_COLOR_FOREGROUND, clrWhite);
   ChartSetInteger(0, CHART_COLOR_CHART_UP, clrLime);
   ChartSetInteger(0, CHART_COLOR_CHART_DOWN, clrLime);
   ChartSetInteger(0, CHART_COLOR_CANDLE_BULL, clrBlack);
   ChartSetInteger(0, CHART_COLOR_CANDLE_BEAR, clrLime);
   ChartSetInteger(0, CHART_COLOR_GRID, C'40,40,40');
  }

void RM_RestoreChartColors()
  {
   if(!g_colorsSaved)
      return;
   ChartSetInteger(0, CHART_COLOR_BACKGROUND, g_savedColors[0]);
   ChartSetInteger(0, CHART_COLOR_FOREGROUND, g_savedColors[1]);
   ChartSetInteger(0, CHART_COLOR_CHART_UP, g_savedColors[2]);
   ChartSetInteger(0, CHART_COLOR_CHART_DOWN, g_savedColors[3]);
   ChartSetInteger(0, CHART_COLOR_CANDLE_BULL, g_savedColors[4]);
   ChartSetInteger(0, CHART_COLOR_CANDLE_BEAR, g_savedColors[5]);
   ChartSetInteger(0, CHART_COLOR_GRID, g_savedColors[6]);
  }

#endif

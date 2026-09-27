// mt4_api_stub.h - DECLARATIONS ONLY of the MT4/MQL4 API subset used by
// Recovery Manager Pro, for a C++ `-fsyntax-only` consistency check.
// This does not prove MetaEditor acceptance; it catches undeclared names,
// typos, wrong argument counts and type mismatches in our own code.
#pragma once
#include <string>
#include <vector>
#include <initializer_list>
#include <cmath>

typedef std::string string;
typedef long long datetime;
typedef int color;
typedef unsigned short ushort;
typedef unsigned int uint;
typedef int ENUM_TIMEFRAMES;
typedef int ENUM_MA_METHOD;
typedef int ENUM_APPLIED_PRICE;

inline color RGBc(int r, int g, int b) { return r | (g << 8) | (b << 16); }

template<typename T> struct MqlArray
  {
   std::vector<T> v;
   MqlArray() {}
   MqlArray(std::initializer_list<T> l) : v(l) {}
   T &operator[](int i) { return v[i]; }
   const T &operator[](int i) const { return v[i]; }
  };
template<typename T> int ArraySize(const MqlArray<T> &a);
template<typename T> int ArrayResize(MqlArray<T> &a, int n);

#define MT4C(name) extern const int name;
// ---- constants
MT4C(OP_BUY) MT4C(OP_SELL) MT4C(SELECT_BY_POS) MT4C(SELECT_BY_TICKET) MT4C(MODE_TRADES) MT4C(MODE_HISTORY)
MT4C(MODE_ASK) MT4C(MODE_BID) MT4C(MODE_DIGITS) MT4C(MODE_FREEZELEVEL) MT4C(MODE_HIGH) MT4C(MODE_LOTSTEP)
MT4C(MODE_LOW) MT4C(MODE_MAXLOT) MT4C(MODE_MINLOT) MT4C(MODE_POINT) MT4C(MODE_TICKSIZE) MT4C(MODE_TICKVALUE)
MT4C(MODE_TIME) MT4C(MODE_TRADEALLOWED) MT4C(MODE_PROFITCALCMODE) MT4C(SYMBOL_CURRENCY_BASE) MT4C(SYMBOL_CURRENCY_PROFIT) MT4C(SYMBOL_TRADE_MODE) MT4C(SYMBOL_TRADE_MODE_DISABLED) MT4C(SYMBOL_TRADE_MODE_CLOSEONLY)
MT4C(ERR_BROKER_BUSY) MT4C(ERR_COMMON_ERROR) MT4C(ERR_INVALID_PRICE) MT4C(ERR_INVALID_TRADE_VOLUME)
MT4C(ERR_MARKET_CLOSED) MT4C(ERR_NOT_ENOUGH_MONEY) MT4C(ERR_NO_CONNECTION) MT4C(ERR_NO_RESULT) MT4C(ERR_OFF_QUOTES)
MT4C(ERR_PRICE_CHANGED) MT4C(ERR_REQUOTE) MT4C(ERR_SERVER_BUSY) MT4C(ERR_TOO_FREQUENT_REQUESTS)
MT4C(ERR_TRADE_CONTEXT_BUSY) MT4C(ERR_TRADE_DISABLED) MT4C(ERR_TRADE_TIMEOUT)
MT4C(ALIGN_CENTER) MT4C(ANCHOR_LEFT_LOWER) MT4C(ANCHOR_LEFT_UPPER) MT4C(ANCHOR_RIGHT_UPPER) MT4C(BORDER_FLAT)
MT4C(CHARTEVENT_CHART_CHANGE) MT4C(CHARTEVENT_OBJECT_CLICK) MT4C(CHARTEVENT_OBJECT_DRAG) MT4C(CHARTEVENT_OBJECT_ENDEDIT)
MT4C(CHART_COLOR_BACKGROUND) MT4C(CHART_COLOR_CANDLE_BEAR) MT4C(CHART_COLOR_CANDLE_BULL) MT4C(CHART_COLOR_CHART_DOWN)
MT4C(CHART_COLOR_CHART_UP) MT4C(CHART_COLOR_FOREGROUND) MT4C(CHART_COLOR_GRID)
MT4C(CHART_HEIGHT_IN_PIXELS) MT4C(CHART_WIDTH_IN_PIXELS) MT4C(CORNER_LEFT_UPPER)
MT4C(FILE_ANSI) MT4C(FILE_READ) MT4C(FILE_REWRITE) MT4C(FILE_SHARE_READ) MT4C(FILE_TXT) MT4C(FILE_WRITE)
MT4C(INIT_FAILED) MT4C(INIT_PARAMETERS_INCORRECT) MT4C(INIT_SUCCEEDED) MT4C(INVALID_HANDLE)
MT4C(OBJPROP_ALIGN) MT4C(OBJPROP_ANCHOR) MT4C(OBJPROP_BACK) MT4C(OBJPROP_BGCOLOR) MT4C(OBJPROP_BORDER_COLOR)
MT4C(OBJPROP_BORDER_TYPE) MT4C(OBJPROP_COLOR) MT4C(OBJPROP_CORNER) MT4C(OBJPROP_FONT) MT4C(OBJPROP_FONTSIZE)
MT4C(OBJPROP_HIDDEN) MT4C(OBJPROP_PRICE) MT4C(OBJPROP_RAY) MT4C(OBJPROP_SELECTABLE) MT4C(OBJPROP_STATE)
MT4C(OBJPROP_STYLE) MT4C(OBJPROP_TEXT) MT4C(OBJPROP_TOOLTIP) MT4C(OBJPROP_TYPE) MT4C(OBJPROP_WIDTH)
MT4C(OBJPROP_XDISTANCE) MT4C(OBJPROP_XSIZE) MT4C(OBJPROP_YDISTANCE) MT4C(OBJPROP_YSIZE) MT4C(OBJPROP_ZORDER)
MT4C(OBJ_BUTTON) MT4C(OBJ_EDIT) MT4C(OBJ_HLINE) MT4C(OBJ_LABEL) MT4C(OBJ_RECTANGLE_LABEL) MT4C(OBJ_TEXT) MT4C(OBJ_TREND)
MT4C(PERIOD_CURRENT) MT4C(REASON_ACCOUNT) MT4C(REASON_CHARTCHANGE) MT4C(REASON_CHARTCLOSE) MT4C(REASON_CLOSE)
MT4C(REASON_INITFAILED) MT4C(REASON_REMOVE) MT4C(STYLE_DASH) MT4C(STYLE_DOT)
MT4C(TIME_DATE) MT4C(TIME_SECONDS)
const int MODE_SMA = 0, MODE_EMA = 1, MODE_SMMA = 2, MODE_LWMA = 3;
const int PRICE_CLOSE = 0, PRICE_OPEN = 1, PRICE_HIGH = 2, PRICE_LOW = 3, PRICE_MEDIAN = 4, PRICE_TYPICAL = 5, PRICE_WEIGHTED = 6;
extern const double EMPTY_VALUE;
extern const color clrBlack, clrDarkOrange, clrDodgerBlue, clrGold, clrLime, clrNONE, clrOrange, clrOrangeRed,
       clrSilver, clrWhite, clrYellow;

// ---- account / terminal
double AccountBalance(); string AccountCurrency(); double AccountEquity(); double AccountFreeMargin();
double AccountFreeMarginCheck(string symbol, int cmd, double volume); double AccountMargin(); int AccountNumber();
template<typename... A> void Alert(A... a);
template<typename... A> void Print(A... a);
template<typename... A> void Comment(A... a);
bool IsConnected(); bool IsOptimization(); bool IsTesting(); bool IsTradeAllowed(); bool IsTradeContextBusy();
bool IsVisualMode(); bool SendNotification(string text); void Sleep(int ms); uint GetTickCount();
int GetLastError(); void ResetLastError(); string ErrorDescription(int e); bool RefreshRates();
string Symbol(); datetime TimeCurrent(); int TimeHour(datetime t); string TimeToString(datetime t, int mode = 3);
template<typename E> string EnumToString(E e);
bool EventSetMillisecondTimer(int ms); void EventKillTimer();

// ---- market info / series
double MarketInfo(string symbol, int type); string SymbolInfoString(string symbol, int prop); long SymbolInfoInteger(string symbol, int prop);
datetime iTime(string s, int tf, int shift); double iOpen(string s, int tf, int shift); double iClose(string s, int tf, int shift);
double iHigh(string s, int tf, int shift); double iLow(string s, int tf, int shift); int iBars(string s, int tf);
int iHighest(string s, int tf, int type, int count, int start); int iLowest(string s, int tf, int type, int count, int start);
double iCustom(string s, int tf, string name, int mode, int shift);
double iMA(string s, int tf, int period, int ma_shift, int method, int price, int shift);
double iATR(string s, int tf, int period, int shift);
int PeriodSeconds(int tf = 0);
int iBarShift(string s, int tf, datetime t, bool exact = false);

// ---- orders
int OrdersTotal(); bool OrderSelect(int index, int select, int pool = 0);
int OrderSend(string symbol, int cmd, double volume, double price, int slippage, double sl, double tp,
              string comment, int magic, datetime expiration, color arrow);
bool OrderClose(int ticket, double lots, double price, int slippage, color arrow);
bool OrderModify(int ticket, double price, double sl, double tp, datetime expiration, color arrow);
bool OrderDelete(int ticket);
double OrderClosePrice(); datetime OrderCloseTime(); string OrderComment(); double OrderCommission();
double OrderLots(); int OrderMagicNumber(); double OrderOpenPrice(); datetime OrderOpenTime(); double OrderProfit();
double OrderStopLoss(); double OrderSwap(); string OrderSymbol(); double OrderTakeProfit(); int OrderTicket(); int OrderType();

// ---- strings / conversion
string DoubleToString(double v, int digits); string IntegerToString(long v);
int StringFind(string s, string m, int start = 0); ushort StringGetCharacter(string s, int pos); int StringLen(string s);
int StringReplace(string &s, string find, string rep); int StringSplit(string s, ushort sep, MqlArray<string> &out);
string StringSubstr(string s, int start, int len = -1); double StringToDouble(string s); long StringToInteger(string s);
string StringTrimLeft(string s); string StringTrimRight(string s); bool StringToUpper(string &s);
double MathLog10(double v);

// ---- files / global variables
int FileOpen(string name, int flags); void FileClose(int h); bool FileDelete(string name); void FileFlush(int h);
bool FileIsEnding(int h); bool FileIsExist(string name); bool FileMove(string src, int common, string dst, int flags);
string FileReadString(int h); bool FileSeek(int h, long off, int origin); ulong FileSize(int h);
uint FileWriteString(int h, string s);
bool GlobalVariableCheck(string n); bool GlobalVariableDel(string n); double GlobalVariableGet(string n);
datetime GlobalVariableSet(string n, double v);

// ---- charts / objects
long ChartID(); long ChartFirst(); long ChartNext(long id); bool ChartClose(long id); string ChartSymbol(long id);
void ChartRedraw(long id = 0); long ChartGetInteger(long id, int prop, int sub = 0);
int ChartPeriod(long id); bool ChartSetInteger(long id, int prop, long v);
bool ChartTimePriceToXY(long id, int sub, datetime t, double p, int &x, int &y);
bool ChartXYToTimePrice(long id, int x, int y, int &sub, datetime &t, double &p);
bool ObjectCreate(long id, string name, int type, int sub, datetime t1, double p1);
bool ObjectCreate(long id, string name, int type, int sub, datetime t1, double p1, datetime t2, double p2);
bool ObjectDelete(long id, string name); int ObjectFind(long id, string name);
double ObjectGetDouble(long id, string name, int prop, int mod = 0);
long ObjectGetInteger(long id, string name, int prop, int mod = 0);
string ObjectGetString(long id, string name, int prop, int mod = 0);
bool ObjectMove(long id, string name, int point, datetime t, double p);
bool ObjectSet(string name, int prop, double v);
bool ObjectSetInteger(long id, string name, int prop, long v);
bool ObjectSetString(long id, string name, int prop, string v);
int ObjectsDeleteAll(long id, string prefix);

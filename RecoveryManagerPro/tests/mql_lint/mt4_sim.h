// mt4_sim.h - a small in-memory MT4 terminal/broker used to RUN the Recovery
// Manager Pro EA source natively (after tests/mql_lint/mql_lint.py rewrites the
// MQL-only syntax). It models: market orders, partial closes that create a
// "from #<ticket>" remainder ticket, history, floating P/L, booked commission,
// a simple margin model, H1 bars, chart objects, files, global variables and
// fault injection (failed / uncertain replies).
//
// It is a test double, not an MT4 emulator: execution is instant at Bid/Ask,
// there is no swap accrual, no stop-out and no tester quirks.
#pragma once
#include <string>
#include <vector>
#include <map>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <sstream>
#include <initializer_list>
#include <algorithm>

typedef std::string string;
typedef long long datetime;
typedef int color;
typedef unsigned short ushort;
typedef unsigned int uint;
typedef int ENUM_TIMEFRAMES;

inline color RGBc(int r, int g, int b) { return r | (g << 8) | (b << 16); }

template<typename T> struct MqlArray
  {
   std::vector<T> v;
   MqlArray() {}
   MqlArray(std::initializer_list<T> l) : v(l) {}
   T &operator[](int i) { return v.at(i); }
   const T &operator[](int i) const { return v.at(i); }
  };
template<typename T> int ArraySize(const MqlArray<T> &a) { return (int)a.v.size(); }
template<typename T> int ArrayResize(MqlArray<T> &a, int n) { a.v.resize(n); return n; }

// ---- constants (trade values match MT4)
const int OP_BUY = 0, OP_SELL = 1, OP_BUYLIMIT = 2, OP_SELLLIMIT = 3;
const int SELECT_BY_POS = 0, SELECT_BY_TICKET = 1, MODE_TRADES = 0, MODE_HISTORY = 1;
const int MODE_LOW = 1, MODE_HIGH = 2, MODE_TIME = 5, MODE_BID = 9, MODE_ASK = 10, MODE_POINT = 11, MODE_DIGITS = 12,
          MODE_TICKVALUE = 16, MODE_TICKSIZE = 17, MODE_TRADEALLOWED = 22, MODE_MINLOT = 23, MODE_LOTSTEP = 24,
          MODE_MAXLOT = 25, MODE_FREEZELEVEL = 33;
const int ERR_NO_RESULT = 1, ERR_COMMON_ERROR = 2, ERR_SERVER_BUSY = 4, ERR_NO_CONNECTION = 6, ERR_TRADE_TIMEOUT = 128,
          ERR_INVALID_PRICE = 129, ERR_INVALID_TRADE_VOLUME = 131, ERR_MARKET_CLOSED = 132, ERR_TRADE_DISABLED = 133,
          ERR_NOT_ENOUGH_MONEY = 134, ERR_PRICE_CHANGED = 135, ERR_OFF_QUOTES = 136, ERR_BROKER_BUSY = 137,
          ERR_REQUOTE = 138, ERR_TOO_FREQUENT_REQUESTS = 141, ERR_TRADE_CONTEXT_BUSY = 146;
const int OBJ_HLINE = 1, OBJ_TREND = 2, OBJ_TEXT = 21, OBJ_LABEL = 23, OBJ_BUTTON = 25, OBJ_EDIT = 27, OBJ_RECTANGLE_LABEL = 28;
const int OBJPROP_COLOR = 6, OBJPROP_STYLE = 7, OBJPROP_WIDTH = 8, OBJPROP_BACK = 9, OBJPROP_RAY = 1004,
          OBJPROP_XDISTANCE = 102, OBJPROP_YDISTANCE = 103, OBJPROP_FONTSIZE = 100, OBJPROP_CORNER = 101,
          OBJPROP_XSIZE = 1019, OBJPROP_YSIZE = 1020, OBJPROP_BGCOLOR = 1025, OBJPROP_BORDER_TYPE = 1029,
          OBJPROP_BORDER_COLOR = 1035, OBJPROP_STATE = 1018, OBJPROP_SELECTABLE = 1000, OBJPROP_HIDDEN = 208,
          OBJPROP_ZORDER = 207, OBJPROP_ANCHOR = 1011, OBJPROP_ALIGN = 1036, OBJPROP_TYPE = 1001,
          OBJPROP_TEXT = 999, OBJPROP_FONT = 1001 + 1000, OBJPROP_TOOLTIP = 206, OBJPROP_PRICE = 20;
const int CORNER_LEFT_UPPER = 0, ANCHOR_LEFT_UPPER = 0, ANCHOR_LEFT_LOWER = 2, ANCHOR_RIGHT_UPPER = 8,
          BORDER_FLAT = 0, ALIGN_CENTER = 2, STYLE_DASH = 1, STYLE_DOT = 2;
const int CHARTEVENT_OBJECT_CLICK = 1, CHARTEVENT_OBJECT_DRAG = 2, CHARTEVENT_OBJECT_ENDEDIT = 3, CHARTEVENT_CHART_CHANGE = 9;
const int CHART_COLOR_BACKGROUND = 21, CHART_COLOR_FOREGROUND = 22, CHART_COLOR_GRID = 23, CHART_COLOR_CHART_UP = 25,
          CHART_COLOR_CHART_DOWN = 26, CHART_COLOR_CANDLE_BULL = 28, CHART_COLOR_CANDLE_BEAR = 29,
          CHART_WIDTH_IN_PIXELS = 105, CHART_HEIGHT_IN_PIXELS = 106;
const int REASON_REMOVE = 1, REASON_RECOMPILE = 2, REASON_CHARTCHANGE = 3, REASON_CHARTCLOSE = 4, REASON_PARAMETERS = 5,
          REASON_ACCOUNT = 6, REASON_CLOSE = 9, REASON_INITFAILED = 8;
const int INIT_SUCCEEDED = 0, INIT_FAILED = 1, INIT_PARAMETERS_INCORRECT = 2, INVALID_HANDLE = -1;
const int FILE_READ = 1, FILE_WRITE = 2, FILE_TXT = 16, FILE_ANSI = 32, FILE_SHARE_READ = 128, FILE_REWRITE = 512;
const int PERIOD_CURRENT = 0, TIME_DATE = 1, TIME_SECONDS = 4;
const double EMPTY_VALUE = 2147483647.0;
const color clrBlack = 0, clrWhite = 0xFFFFFF, clrYellow = 0x00FFFF, clrGold = 0x00D7FF, clrLime = 0x00FF00,
            clrNONE = -1, clrOrange = 0x00A5FF, clrOrangeRed = 0x0045FF, clrDarkOrange = 0x008CFF,
            clrDodgerBlue = 0xFF901E, clrSilver = 0xC0C0C0;

// ---- simulator state
struct SimOrder
  {
   int ticket = 0, type = 0, magic = 0;
   string sym, comment;
   double lots = 0, openPrice = 0, closePrice = 0, sl = 0, tp = 0, swap = 0, comm = 0, profitFixed = 0;
   datetime openTime = 0, closeTime = 0;
  };

struct Sim
  {
   string sym = "EURUSD";
   double bid = 1.10000, spreadPts = 10, point = 0.00001, tickSize = 0.00001, tickValue = 1.0;
   double minLot = 0.01, maxLot = 100, lotStep = 0.01, commPerLotSide = 0.0, marginPerLot = 1000.0;
   int digits = 5;
   datetime now = 1704067200;          // 2024-01-01 00:00
   double balance = 10000.0;
   int nextTicket = 1000;
   std::vector<SimOrder> open, hist;
   SimOrder sel; bool hasSel = false;
   int lastError = 0;
   bool testing = true, connected = true, tradeAllowed = true;
   int failCloses = 0;                  // next N OrderClose calls fail with requote
   int failCloseErr = ERR_REQUOTE;
   int uncertainSends = 0;              // next N OrderSend succeed but report timeout
   int failSends = 0;                   // next N OrderSend fail (not enough money)
   std::map<datetime, double> bo, bh, bl, bc;
   std::map<string, std::map<int, long long>> objI;
   std::map<string, std::map<int, string>> objS;
   std::map<string, std::map<int, double>> objD;
   std::map<string, double> gv;
   string fileDir = "/tmp/rmp_sim_files";
   bool verbose = false;
   std::vector<string> log;
   int closeCalls = 0, sendCalls = 0;
   bool hideRemainderComment = false;   // broker that does not write "from #<ticket>"
  } S;

inline double SimAsk() { return S.bid + S.spreadPts * S.point; }
inline double SimProfit(const SimOrder &o)
  {
   if(o.closeTime != 0)
      return o.profitFixed;
   double px = (o.type == OP_BUY) ? S.bid : SimAsk();
   double diff = (o.type == OP_BUY) ? px - o.openPrice : o.openPrice - px;
   return diff / S.tickSize * S.tickValue * o.lots;
  }
inline datetime SimBar(datetime t) { return (t / 3600) * 3600; }
inline void SimRecordBar()
  {
   datetime b = SimBar(S.now);
   if(!S.bo.count(b)) { S.bo[b] = S.bid; S.bh[b] = S.bid; S.bl[b] = S.bid; }
   S.bh[b] = std::max(S.bh[b], S.bid);
   S.bl[b] = std::min(S.bl[b], S.bid);
   S.bc[b] = S.bid;
  }

// ---- account / terminal
inline double SimFloating() { double f = 0; for(auto &o : S.open) f += SimProfit(o) + o.swap + o.comm; return f; }
inline double AccountBalance() { return S.balance; }
inline string AccountCurrency() { return "USD"; }
inline double AccountEquity() { return S.balance + SimFloating(); }
inline double AccountMargin() { double l = 0; for(auto &o : S.open) l += o.lots; return l * S.marginPerLot; }
inline double AccountFreeMargin() { return AccountEquity() - AccountMargin(); }
inline double AccountFreeMarginCheck(string, int, double v)
  {
   double r = AccountFreeMargin() - v * S.marginPerLot;
   if(r <= 0) S.lastError = ERR_NOT_ENOUGH_MONEY;
   return r;
  }
inline int AccountNumber() { return 123456; }
inline void SimLogLine(const string &s) { S.log.push_back(s); if(S.verbose) std::printf("%s\n", s.c_str()); }
inline string SimToStr(const string &s) { return s; }
inline string SimToStr(const char *s) { return s; }
template<typename T> string SimToStr(const T &v) { std::ostringstream o; o << v; return o.str(); }
template<typename... A> void Print(A... a) { string s; using e = int[]; (void)e{0, (s += SimToStr(a), 0)...}; SimLogLine(s); }
template<typename... A> void Alert(A... a) { string s = "ALERT "; using e = int[]; (void)e{0, (s += SimToStr(a), 0)...}; SimLogLine(s); }
template<typename... A> void Comment(A...) {}
inline bool IsConnected() { return S.connected; }
inline bool IsOptimization() { return false; }
inline bool IsTesting() { return S.testing; }
inline bool IsTradeAllowed() { return S.tradeAllowed; }
inline bool IsTradeContextBusy() { return false; }
inline bool IsVisualMode() { return true; }
inline bool SendNotification(string) { return true; }
inline void Sleep(int) {}
static uint g_simTick = 100000;
inline uint GetTickCount() { g_simTick += 1000; return g_simTick; }
inline int GetLastError() { int e = S.lastError; S.lastError = 0; return e; }
inline void ResetLastError() { S.lastError = 0; }
inline string ErrorDescription(int e) { return "err" + std::to_string(e); }
inline bool RefreshRates() { return true; }
inline string Symbol() { return S.sym; }
inline datetime TimeCurrent() { return S.now; }
inline int TimeHour(datetime t) { return (int)((t % 86400) / 3600); }
inline string TimeToString(datetime t, int) { return std::to_string((long long)t); }
template<typename E> string EnumToString(E e) { return std::to_string((int)e); }
inline bool EventSetMillisecondTimer(int) { return true; }
inline void EventKillTimer() {}

// ---- market info / series (H1)
inline double MarketInfo(string sym, int t)
  {
   if(sym != S.sym) return 0;
   switch(t)
     {
      case MODE_BID: return S.bid;
      case MODE_ASK: return SimAsk();
      case MODE_POINT: return S.point;
      case MODE_DIGITS: return S.digits;
      case MODE_TICKVALUE: return S.tickValue;
      case MODE_TICKSIZE: return S.tickSize;
      case MODE_TRADEALLOWED: return 1;
      case MODE_MINLOT: return S.minLot;
      case MODE_LOTSTEP: return S.lotStep;
      case MODE_MAXLOT: return S.maxLot;
      case MODE_FREEZELEVEL: return 0;
      case MODE_TIME: return (double)S.now;
     }
   return 0;
  }
inline datetime iTime(string, int, int shift) { return SimBar(S.now) - (datetime)shift * 3600; }
inline double SimSeries(std::map<datetime, double> &m, int shift)
  {
   datetime b = SimBar(S.now) - (datetime)shift * 3600;
   auto it = m.find(b);
   return it == m.end() ? S.bid : it->second;
  }
inline double iOpen(string, int, int s) { return SimSeries(S.bo, s); }
inline double iClose(string, int, int s) { return SimSeries(S.bc, s); }
inline double iHigh(string, int, int s) { return SimSeries(S.bh, s); }
inline double iLow(string, int, int s) { return SimSeries(S.bl, s); }
inline int iBars(string, int) { return (int)S.bc.size() + 100; }
inline int iHighest(string, int, int, int count, int start)
  { int best = start; for(int i = start; i < start + count; i++) if(SimSeries(S.bh, i) > SimSeries(S.bh, best)) best = i; return best; }
inline int iLowest(string, int, int, int count, int start)
  { int best = start; for(int i = start; i < start + count; i++) if(SimSeries(S.bl, i) < SimSeries(S.bl, best)) best = i; return best; }
inline double iCustom(string, int, string, int, int) { S.lastError = 4802; return EMPTY_VALUE; }

// ---- orders
inline int OrdersTotal() { return (int)S.open.size(); }
inline bool OrderSelect(int index, int select, int pool = MODE_TRADES)
  {
   S.hasSel = false;
   if(select == SELECT_BY_POS)
     {
      std::vector<SimOrder> &v = (pool == MODE_TRADES) ? S.open : S.hist;
      if(index < 0 || index >= (int)v.size()) return false;
      S.sel = v[index]; S.hasSel = true; return true;
     }
   for(auto &o : S.open) if(o.ticket == index) { S.sel = o; S.hasSel = true; return true; }
   for(auto &o : S.hist) if(o.ticket == index) { S.sel = o; S.hasSel = true; return true; }
   return false;
  }
inline SimOrder *SimFindOpen(int t) { for(auto &o : S.open) if(o.ticket == t) return &o; return nullptr; }
inline SimOrder *SimFindAny(int t) { for(auto &o : S.open) if(o.ticket == t) return &o; for(auto &o : S.hist) if(o.ticket == t) return &o; return nullptr; }
inline int SimOpen(int type, double lots, int magic, string cmt, string sym = "")
  {
   SimOrder o;
   o.ticket = S.nextTicket++; o.type = type; o.magic = magic; o.sym = sym.empty() ? S.sym : sym; o.comment = cmt;
   o.lots = lots; o.openPrice = (type == OP_BUY) ? SimAsk() : S.bid; o.openTime = S.now;
   o.comm = -S.commPerLotSide * lots;
   S.open.push_back(o);
   return o.ticket;
  }
inline int OrderSend(string sym, int cmd, double volume, double, int, double sl, double tp,
                     string comment, int magic, datetime, color)
  {
   S.sendCalls++;
   if(S.failSends > 0) { S.failSends--; S.lastError = ERR_NOT_ENOUGH_MONEY; return -1; }
   if(volume < S.minLot - 1e-9 || std::fabs(std::round(volume / S.lotStep) * S.lotStep - volume) > 1e-9)
     { S.lastError = ERR_INVALID_TRADE_VOLUME; return -1; }
   int t = SimOpen(cmd, volume, magic, comment, sym);
   SimFindOpen(t)->sl = sl; SimFindOpen(t)->tp = tp;
   if(S.uncertainSends > 0) { S.uncertainSends--; S.lastError = ERR_TRADE_TIMEOUT; return -1; }
   return t;
  }
static int g_simFailAfterOk = 0;       // successful closes allowed before injected failures
static int g_simFailCount = 0;         // number of injected close failures
inline bool OrderClose(int ticket, double lots, double, int, color)
  {
   S.closeCalls++;
   if(S.failCloses > 0) { S.failCloses--; S.lastError = S.failCloseErr; return false; }
   if(g_simFailCount > 0)
     {
      if(g_simFailAfterOk > 0) g_simFailAfterOk--;
      else { g_simFailCount--; S.lastError = S.failCloseErr; return false; }
     }
   for(size_t i = 0; i < S.open.size(); i++)
     {
      if(S.open[i].ticket != ticket) continue;
      SimOrder o = S.open[i];
      if(lots > o.lots + 1e-9 || lots < S.minLot - 1e-9) { S.lastError = ERR_INVALID_TRADE_VOLUME; return false; }
      double f = lots / o.lots;
      SimOrder h = o;
      h.lots = lots; h.closeTime = S.now; h.closePrice = (o.type == OP_BUY) ? S.bid : SimAsk();
      SimOrder tmp = o; tmp.lots = lots;
      h.profitFixed = SimProfit(tmp);
      h.comm = o.comm * f; h.swap = o.swap * f;
      S.balance += h.profitFixed + h.comm + h.swap;
      S.open.erase(S.open.begin() + i);
      S.hist.push_back(h);
      double rem = std::round((o.lots - lots) * 1e8) / 1e8;
      if(rem > 1e-9)
        {
         SimOrder r = o;
         r.ticket = S.nextTicket++; r.lots = rem; r.comm = o.comm - h.comm; r.swap = o.swap - h.swap;
         r.comment = S.hideRemainderComment ? "" : "from #" + std::to_string(ticket);
         S.open.push_back(r);
        }
      return true;
     }
   S.lastError = 4108;
   return false;
  }
inline bool OrderModify(int ticket, double, double sl, double tp, datetime, color)
  {
   SimOrder *o = SimFindOpen(ticket);
   if(!o) return false;
   if(o->sl == sl && o->tp == tp) { S.lastError = ERR_NO_RESULT; return false; }
   o->sl = sl; o->tp = tp; return true;
  }
inline bool OrderDelete(int ticket)
  {
   for(size_t i = 0; i < S.open.size(); i++)
      if(S.open[i].ticket == ticket && S.open[i].type > OP_SELL)
        { SimOrder h = S.open[i]; h.closeTime = S.now; S.hist.push_back(h); S.open.erase(S.open.begin() + i); return true; }
   return false;
  }
inline double OrderClosePrice() { return S.sel.closePrice; }
inline datetime OrderCloseTime() { return S.sel.closeTime; }
inline string OrderComment() { return S.sel.comment; }
inline double OrderCommission() { return S.sel.comm; }
inline double OrderLots() { return S.sel.lots; }
inline int OrderMagicNumber() { return S.sel.magic; }
inline double OrderOpenPrice() { return S.sel.openPrice; }
inline datetime OrderOpenTime() { return S.sel.openTime; }
inline double OrderProfit() { return (S.sel.type <= OP_SELL) ? SimProfit(S.sel) : 0.0; }
inline double OrderStopLoss() { return S.sel.sl; }
inline double OrderSwap() { return S.sel.swap; }
inline string OrderSymbol() { return S.sel.sym; }
inline double OrderTakeProfit() { return S.sel.tp; }
inline int OrderTicket() { return S.sel.ticket; }
inline int OrderType() { return S.sel.type; }

// ---- strings / conversion
inline string DoubleToString(double v, int d) { char b[64]; std::snprintf(b, sizeof(b), "%.*f", d, v); return b; }
inline string IntegerToString(long long v) { return std::to_string(v); }
inline int StringFind(string s, string m, int start = 0) { size_t p = s.find(m, start); return p == string::npos ? -1 : (int)p; }
inline ushort StringGetCharacter(string s, int pos) { return (pos >= 0 && pos < (int)s.size()) ? (ushort)(unsigned char)s[pos] : 0; }
inline int StringLen(string s) { return (int)s.size(); }
inline int StringReplace(string &s, string f, string r)
  { int n = 0; size_t p = 0; while(!f.empty() && (p = s.find(f, p)) != string::npos) { s.replace(p, f.size(), r); p += r.size(); n++; } return n; }
inline int StringSplit(string s, ushort sep, MqlArray<string> &out)
  { out.v.clear(); string cur; for(char c : s) { if((ushort)(unsigned char)c == sep) { out.v.push_back(cur); cur.clear(); } else cur += c; } out.v.push_back(cur); return (int)out.v.size(); }
inline string StringSubstr(string s, int start, int len = -1)
  { if(start >= (int)s.size()) return ""; return len < 0 ? s.substr(start) : s.substr(start, len); }
inline double StringToDouble(string s) { return std::atof(s.c_str()); }
inline long long StringToInteger(string s) { return std::atoll(s.c_str()); }
inline string StringTrimLeft(string s) { size_t p = s.find_first_not_of(" \t\r\n"); return p == string::npos ? "" : s.substr(p); }
inline string StringTrimRight(string s) { size_t p = s.find_last_not_of(" \t\r\n"); return p == string::npos ? "" : s.substr(0, p + 1); }
inline double MathLog10(double v) { return std::log10(v); }

// ---- files
struct SimFile { string path, content; size_t pos = 0; bool write = false; };
static std::map<int, SimFile> g_simFiles;
static int g_simNextH = 1;
inline string SimPath(string n) { std::replace(n.begin(), n.end(), '\\', '_'); return S.fileDir + "/" + n; }
inline bool FileIsExist(string n) { std::ifstream f(SimPath(n)); return f.good(); }
inline int FileOpen(string n, int flags)
  {
   SimFile f; f.path = SimPath(n); f.write = (flags & FILE_WRITE) != 0;
   std::ifstream in(f.path);
   if(in.good()) { std::stringstream ss; ss << in.rdbuf(); f.content = ss.str(); }
   else if(!f.write) return INVALID_HANDLE;
   if(f.write && !(flags & FILE_READ)) f.content.clear();
   int h = g_simNextH++; g_simFiles[h] = f; return h;
  }
inline void FileFlush(int h) { auto &f = g_simFiles[h]; if(f.write) { std::ofstream o(f.path); o << f.content; } }
inline void FileClose(int h) { FileFlush(h); g_simFiles.erase(h); }
inline bool FileDelete(string n) { return std::remove(SimPath(n).c_str()) == 0; }
inline bool FileIsEnding(int h) { auto &f = g_simFiles[h]; return f.pos >= f.content.size(); }
inline bool FileMove(string a, int, string b, int) { return std::rename(SimPath(a).c_str(), SimPath(b).c_str()) == 0; }
inline string FileReadString(int h)
  {
   auto &f = g_simFiles[h]; size_t e = f.content.find('\n', f.pos);
   string line = f.content.substr(f.pos, e == string::npos ? string::npos : e - f.pos);
   f.pos = (e == string::npos) ? f.content.size() : e + 1;
   if(!line.empty() && line.back() == '\r') line.pop_back();
   return line;
  }
inline bool FileSeek(int h, long long, int) { g_simFiles[h].pos = g_simFiles[h].content.size(); return true; }
inline unsigned long long FileSize(int h) { return g_simFiles[h].content.size(); }
inline uint FileWriteString(int h, string s) { g_simFiles[h].content += s; return (uint)s.size(); }
const int SEEK_END_ = 2;

// ---- global variables
inline bool GlobalVariableCheck(string n) { return S.gv.count(n) > 0; }
inline bool GlobalVariableDel(string n) { return S.gv.erase(n) > 0; }
inline double GlobalVariableGet(string n) { return S.gv.count(n) ? S.gv[n] : 0.0; }
inline datetime GlobalVariableSet(string n, double v) { S.gv[n] = v; return S.now; }

// ---- charts / objects
inline long ChartID() { return 1; }
inline long ChartFirst() { return 1; }
inline long ChartNext(long) { return -1; }
inline bool ChartClose(long) { return true; }
inline string ChartSymbol(long) { return S.sym; }
inline void ChartRedraw(long = 0) {}
inline long ChartGetInteger(long, int prop, int = 0) { return prop == CHART_WIDTH_IN_PIXELS ? 1400 : (prop == CHART_HEIGHT_IN_PIXELS ? 800 : 0); }
inline int ChartPeriod(long) { return 60; }
inline bool ChartSetInteger(long, int, long) { return true; }
inline bool ChartTimePriceToXY(long, int, datetime, double, int &x, int &y) { x = 500; y = 300; return true; }
inline bool ChartXYToTimePrice(long, int, int, int &sub, datetime &t, double &p) { sub = 0; t = S.now; p = S.bid; return true; }
inline bool ObjectCreate(long, string n, int type, int, datetime, double)
  { if(S.objI.count(n)) return false; S.objI[n][OBJPROP_TYPE] = type; S.objS[n]; S.objD[n]; return true; }
inline bool ObjectCreate(long c, string n, int type, int s, datetime t1, double p1, datetime, double)
  { return ObjectCreate(c, n, type, s, t1, p1); }
inline bool ObjectDelete(long, string n) { bool e = S.objI.erase(n) > 0; S.objS.erase(n); S.objD.erase(n); return e; }
inline int ObjectFind(long, string n) { return S.objI.count(n) ? 0 : -1; }
inline double ObjectGetDouble(long, string n, int p, int = 0) { return S.objD[n][p]; }
inline long ObjectGetInteger(long, string n, int p, int = 0) { return (long)S.objI[n][p]; }
inline string ObjectGetString(long, string n, int p, int = 0) { return S.objS[n][p]; }
inline bool ObjectMove(long, string n, int, datetime, double p) { S.objD[n][OBJPROP_PRICE] = p; return true; }
inline bool ObjectSet(string n, int p, double v) { S.objI[n][p] = (long long)v; return true; }
inline bool ObjectSetInteger(long, string n, int p, long long v) { if(!S.objI.count(n)) return false; S.objI[n][p] = v; return true; }
inline bool ObjectSetString(long, string n, int p, string v) { if(!S.objI.count(n)) return false; S.objS[n][p] = v; return true; }
inline int ObjectsDeleteAll(long, string prefix)
  {
   int k = 0;
   for(auto it = S.objI.begin(); it != S.objI.end();)
      if(it->first.rfind(prefix, 0) == 0) { S.objS.erase(it->first); S.objD.erase(it->first); it = S.objI.erase(it); k++; }
      else ++it;
   return k;
  }

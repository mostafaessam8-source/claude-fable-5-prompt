//+------------------------------------------------------------------+
//| RM_Distance.mqh - portable distance-unit core (pure functions).   |
//|                                                                   |
//| Separates four representations that must never be mixed:         |
//|   *Units    : what the user typed (in the selected distance mode) |
//|   *Price    : a price difference (e.g. 1.00 on gold)              |
//|   *BrokerPts: price / broker Point of the order symbol            |
//|   money     : account currency (never produced here)              |
//|                                                                   |
//| STANDARDIZED_POINTS are THIS PROJECT's conventions, not universal |
//| pip definitions and not a claim of equal monetary exposure:       |
//|   non-JPY Forex : 0.00001  per unit                               |
//|   JPY-quoted FX : 0.001    per unit                               |
//|   XAUUSD (gold) : 0.01     per unit                               |
//| Anything else needs PRICE_DISTANCE, CUSTOM_UNIT, a per-symbol     |
//| override, or an explicit BROKER_POINTS choice - never a guess.    |
//|                                                                   |
//| Portable MQL4/C++ subset: string helpers used here exist in both  |
//| (tests/mql4_shim_str.h provides them natively).                   |
//+------------------------------------------------------------------+
#ifndef RM_DISTANCE_MQH
#define RM_DISTANCE_MQH

enum ENUM_RM_DIST_MODE
  {
   RM_DU_STANDARDIZED  = 0, // Standardized points (project convention per profile)
   RM_DU_BROKER_POINTS = 1, // Broker points (legacy / compatibility)
   RM_DU_PRICE         = 2, // Price distance (1 unit = 1.0 price)
   RM_DU_CUSTOM        = 3  // Custom unit price
  };

// instrument profiles
#define RM_PROF_NONE     0
#define RM_PROF_FX       1   // non-JPY Forex
#define RM_PROF_FXJPY    2   // JPY-quoted Forex
#define RM_PROF_XAUUSD   3   // USD-quoted gold
#define RM_PROF_OVERRIDE 4   // per-symbol unit override

// where the profile came from
#define RM_PSRC_NONE     0
#define RM_PSRC_OVERRIDE 1
#define RM_PSRC_MAP      2
#define RM_PSRC_METADATA 3

// alignment directions
#define RM_ALIGN_DOWN   -1
#define RM_ALIGN_NEAREST 0
#define RM_ALIGN_UP      1

double RM_ProfileUnitPrice(int prof)
  {
   if(prof == RM_PROF_FX)     return 0.00001;
   if(prof == RM_PROF_FXJPY)  return 0.001;
   if(prof == RM_PROF_XAUUSD) return 0.01;
   return 0.0;
  }

string RM_ProfileName(int prof)
  {
   if(prof == RM_PROF_FX)       return "FX";
   if(prof == RM_PROF_FXJPY)    return "FXJPY";
   if(prof == RM_PROF_XAUUSD)   return "XAUUSD";
   if(prof == RM_PROF_OVERRIDE) return "OVERRIDE";
   return "UNDEFINED";
  }

string RM_Upper(string s)
  {
   string u = s;
   StringToUpper(u);
   return u;
  }

int RM_ProfileFromName(string name)
  {
   string u = RM_Upper(name);
   if(u == "FX")     return RM_PROF_FX;
   if(u == "FXJPY")  return RM_PROF_FXJPY;
   if(u == "XAUUSD") return RM_PROF_XAUUSD;
   return RM_PROF_NONE;
  }

bool RM_IsAlpha3(string s)
  {
   if(StringLen(s) != 3)
      return false;
   for(int i = 0; i < 3; i++)
     {
      int c = StringGetCharacter(s, i);
      if(c < 'A' || c > 'Z')
         return false;
     }
   return true;
  }

bool RM_IsMetalCcy(string c)
  {
   return c == "XAU" || c == "XAG" || c == "XPT" || c == "XPD";
  }

//+------------------------------------------------------------------+
//| Classification from broker METADATA (currencies + calc mode),     |
//| never from Digits or a loose substring of the symbol name.        |
//| calcMode: MarketInfo(MODE_PROFITCALCMODE), 0 = Forex              |
//+------------------------------------------------------------------+
int RM_ProfileFromMetadata(string baseCcy, string profitCcy, int calcMode)
  {
   string b = RM_Upper(baseCcy), p = RM_Upper(profitCcy);
   if(b == "XAU" && p == "USD")
      return RM_PROF_XAUUSD;
   if(calcMode == 0 && RM_IsAlpha3(b) && RM_IsAlpha3(p) && b != p && !RM_IsMetalCcy(b) && !RM_IsMetalCcy(p))
      return (p == "JPY") ? RM_PROF_FXJPY : RM_PROF_FX;
   return RM_PROF_NONE;
  }

//+------------------------------------------------------------------+
//| Remove an explicitly configured prefix / suffix (case-insensitive)|
//+------------------------------------------------------------------+
string RM_StripAffixes(string sym, string prefix, string suffix)
  {
   string s = sym;
   string us = RM_Upper(s);
   int lp = StringLen(prefix), ls = StringLen(suffix);
   if(lp > 0 && StringLen(s) > lp && StringFind(us, RM_Upper(prefix)) == 0)
     {
      s = StringSubstr(s, lp);
      us = RM_Upper(s);
     }
   if(ls > 0 && StringLen(s) > ls && StringSubstr(us, StringLen(us) - ls) == RM_Upper(suffix))
      s = StringSubstr(s, 0, StringLen(s) - ls);
   return s;
  }

//+------------------------------------------------------------------+
//| "KEY:VALUE;KEY2=VALUE2,..." exact, case-insensitive key lookup.   |
//| Separators between entries: ';' or ','. Key/value: ':' or '='.    |
//+------------------------------------------------------------------+
bool RM_ListLookup(string list, string key, string &value)
  {
   string uk = RM_Upper(key);
   int n = StringLen(list);
   int start = 0;
   while(start < n)
     {
      int end = start;
      while(end < n)
        {
         int c = StringGetCharacter(list, end);
         if(c == ';' || c == ',')
            break;
         end++;
        }
      string entry = StringSubstr(list, start, end - start);
      int sep = -1;
      for(int i = 0; i < StringLen(entry); i++)
        {
         int c2 = StringGetCharacter(entry, i);
         if(c2 == ':' || c2 == '=')
           { sep = i; break; }
        }
      if(sep > 0)
        {
         string k = StringSubstr(entry, 0, sep);
         string v = StringSubstr(entry, sep + 1);
         // trim spaces
         while(StringLen(k) > 0 && StringGetCharacter(k, 0) == ' ') k = StringSubstr(k, 1);
         while(StringLen(k) > 0 && StringGetCharacter(k, StringLen(k) - 1) == ' ') k = StringSubstr(k, 0, StringLen(k) - 1);
         while(StringLen(v) > 0 && StringGetCharacter(v, 0) == ' ') v = StringSubstr(v, 1);
         while(StringLen(v) > 0 && StringGetCharacter(v, StringLen(v) - 1) == ' ') v = StringSubstr(v, 0, StringLen(v) - 1);
         if(RM_Upper(k) == uk)
           {
            value = v;
            return true;
           }
        }
      start = end + 1;
     }
   return false;
  }

//+------------------------------------------------------------------+
//| Validate a list; numeric = values must be positive numbers,       |
//| otherwise values must be profile names. err describes a problem.  |
//+------------------------------------------------------------------+
bool RM_ListValid(string list, bool numeric, string &err)
  {
   int n = StringLen(list);
   int start = 0;
   while(start < n)
     {
      int end = start;
      while(end < n && StringGetCharacter(list, end) != ';' && StringGetCharacter(list, end) != ',')
         end++;
      string entry = StringSubstr(list, start, end - start);
      bool blank = true;
      for(int i = 0; i < StringLen(entry); i++)
         if(StringGetCharacter(entry, i) != ' ')
            blank = false;
      if(!blank)
        {
         int sep = -1;
         for(int j = 0; j < StringLen(entry); j++)
           {
            int c = StringGetCharacter(entry, j);
            if(c == ':' || c == '=')
              { sep = j; break; }
           }
         if(sep <= 0)
           { err = "entry '" + entry + "' needs SYMBOL:VALUE"; return false; }
         string v = "";
         RM_ListLookup(entry, StringSubstr(entry, 0, sep), v);
         if(numeric && StringToDouble(v) <= 0.0)
           { err = "entry '" + entry + "' needs a positive unit price"; return false; }
         if(!numeric && RM_ProfileFromName(v) == RM_PROF_NONE)
           { err = "entry '" + entry + "': profile must be FX, FXJPY or XAUUSD"; return false; }
        }
      start = end + 1;
     }
   return true;
  }

//+------------------------------------------------------------------+
//| Resolve the instrument profile. Order: per-symbol override,       |
//| explicit profile map (full name, then name without the configured |
//| prefix/suffix), broker metadata. Nothing else.                    |
//+------------------------------------------------------------------+
int RM_ResolveProfile(string sym, string profileMap, string prefix, string suffix, string overrides,
                      string baseCcy, string profitCcy, int calcMode, double &overrideUnit, int &source)
  {
   overrideUnit = 0.0;
   source = RM_PSRC_NONE;
   string core = RM_StripAffixes(sym, prefix, suffix);
   string v = "";
   if(RM_ListLookup(overrides, sym, v) || RM_ListLookup(overrides, core, v))
     {
      double u = StringToDouble(v);
      if(u > 0.0)
        {
         overrideUnit = u;
         source = RM_PSRC_OVERRIDE;
         return RM_PROF_OVERRIDE;
        }
     }
   if(RM_ListLookup(profileMap, sym, v) || RM_ListLookup(profileMap, core, v))
     {
      int p = RM_ProfileFromName(v);
      if(p != RM_PROF_NONE)
        {
         source = RM_PSRC_MAP;
         return p;
        }
     }
   int m = RM_ProfileFromMetadata(baseCcy, profitCcy, calcMode);
   if(m != RM_PROF_NONE)
      source = RM_PSRC_METADATA;
   return m;
  }

//+------------------------------------------------------------------+
//| Price value of ONE configured distance unit. 0 = undefined.       |
//| Per-symbol overrides apply in STANDARDIZED and CUSTOM modes;      |
//| BROKER_POINTS and PRICE_DISTANCE are fixed by definition.         |
//+------------------------------------------------------------------+
double RM_ResolveUnitPrice(int mode, int prof, double overrideUnit, double brokerPoint, double customUnit)
  {
   if(mode == RM_DU_BROKER_POINTS)
      return (brokerPoint > 0.0) ? brokerPoint : 0.0;
   if(mode == RM_DU_PRICE)
      return 1.0;
   if(prof == RM_PROF_OVERRIDE && overrideUnit > 0.0)
      return overrideUnit;
   if(mode == RM_DU_CUSTOM)
      return (customUnit > 0.0) ? customUnit : 0.0;
   return RM_ProfileUnitPrice(prof);
  }

//+------------------------------------------------------------------+
//| Metadata sanity: point > 0, tick > 0, tick an integer multiple of |
//| the point (tick smaller than a point is inconsistent).            |
//+------------------------------------------------------------------+
bool RM_MetaValid(double brokerPoint, double tickPrice, string &why)
  {
   if(brokerPoint <= 0.0)
     { why = "broker Point is missing or zero"; return false; }
   if(tickPrice <= 0.0)
     { why = "tick size is missing or zero"; return false; }
   double k = tickPrice / brokerPoint;
   if(k < 1.0 - 1e-6 || MathAbs(k - MathRound(k)) > 1e-6)
     { why = "tick size is not a whole multiple of the Point"; return false; }
   return true;
  }

double RM_DistUnitsToPrice(double units, double unitPrice)
  {
   return units * unitPrice;                      // unrounded: align once, at the end
  }

double RM_PriceToDistUnits(double priceDiff, double unitPrice)
  {
   return (unitPrice > 0.0) ? priceDiff / unitPrice : 0.0;
  }

double RM_PriceToBrokerPoints(double priceDiff, double brokerPoint)
  {
   return (brokerPoint > 0.0) ? priceDiff / brokerPoint : 0.0;
  }

//+------------------------------------------------------------------+
//| Align a price to the executable tick grid (tick in PRICE units).  |
//+------------------------------------------------------------------+
double RM_AlignToTick(double price, double tickPrice, int direction)
  {
   if(tickPrice <= 0.0)
      return price;
   double k = price / tickPrice;
   double steps;
   if(direction > 0)
      steps = MathCeil(k - 1e-7);
   else if(direction < 0)
      steps = MathFloor(k + 1e-7);
   else
      steps = MathRound(k);
   return NormalizeDouble(steps * tickPrice, 10);
  }

//+------------------------------------------------------------------+
//| Requested spacing rounded UP to a whole number of ticks, so the   |
//| executable spacing is never smaller than requested.               |
//+------------------------------------------------------------------+
double RM_EffectiveSpacing(double requestedPrice, double tickPrice)
  {
   if(requestedPrice <= 0.0)
      return 0.0;
   return RM_AlignToTick(requestedPrice, tickPrice, RM_ALIGN_UP);
  }

//+------------------------------------------------------------------+
//| Adverse grid target from the last confirmed fill:                 |
//| BUY below (rounded down), SELL above (rounded up).                |
//+------------------------------------------------------------------+
double RM_GridTargetPrice(int dir, double anchorFill, double effSpacingPrice, double tickPrice)
  {
   if(dir == RM_BUY)
      return RM_AlignToTick(anchorFill - effSpacingPrice, tickPrice, RM_ALIGN_DOWN);
   return RM_AlignToTick(anchorFill + effSpacingPrice, tickPrice, RM_ALIGN_UP);
  }

//+------------------------------------------------------------------+
//| Favourable TP target from an average: BUY above (up), SELL below. |
//+------------------------------------------------------------------+
double RM_TPTargetPrice(int dir, double avgPrice, double tpPrice, double tickPrice)
  {
   if(dir == RM_BUY)
      return RM_AlignToTick(avgPrice + tpPrice, tickPrice, RM_ALIGN_UP);
   return RM_AlignToTick(avgPrice - tpPrice, tickPrice, RM_ALIGN_DOWN);
  }

bool RM_TPTargetReached(int dir, double target, double bid, double ask)
  {
   if(target <= 0.0)
      return false;
   if(dir == RM_BUY)
      return bid >= target - RM_EPS;
   return ask <= target + RM_EPS;
  }

//+------------------------------------------------------------------+
//| A MAXIMUM limit given in distance units -> broker points for an   |
//| API that needs them (slippage). Rounded DOWN: never looser.       |
//+------------------------------------------------------------------+
int RM_MaxLimitBrokerPoints(double limitPrice, double brokerPoint)
  {
   if(brokerPoint <= 0.0 || limitPrice <= 0.0)
      return 0;
   return (int)MathFloor(limitPrice / brokerPoint + 1e-7);
  }

bool RM_SpreadTooWide(double bid, double ask, double limitPrice)
  {
   return (ask - bid) > limitPrice + 1e-12;
  }

//+------------------------------------------------------------------+
//| Settings migration keeping the ORIGINAL price distance:           |
//| OldPrice = OldInput * OldBrokerPoint ; NewInput = OldPrice / Unit |
//+------------------------------------------------------------------+
double RM_MigrateDistance(double oldInput, double oldBrokerPoint, double newUnitPrice)
  {
   if(newUnitPrice <= 0.0)
      return 0.0;
   return oldInput * oldBrokerPoint / newUnitPrice;
  }

#endif

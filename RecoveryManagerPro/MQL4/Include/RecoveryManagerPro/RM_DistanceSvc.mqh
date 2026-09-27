//+------------------------------------------------------------------+
//| RM_DistanceSvc.mqh - symbol-distance service (MT4 side).          |
//|                                                                   |
//| Every user-facing distance goes through here:                     |
//|   RequestedPriceDistance = InputDistance * ResolvedUnitPrice      |
//| then is rounded UP to the executable tick (price units) once.     |
//| Properties are read for the symbol passed in, never from the      |
//| chart's Point/Digits when another symbol is processed.            |
//|                                                                   |
//| Active baskets keep the unit/spacing captured when they started   |
//| (persisted): changing inputs, chart or profile applies to the     |
//| NEXT cycle unless InpApplyUnitsToActiveCycle is set.              |
//|                                                                   |
//| This is PRICE-DISTANCE normalisation only. It does not equalise   |
//| money risk, volatility exposure or profitability across symbols.  |
//+------------------------------------------------------------------+
#ifndef RM_DISTANCESVC_MQH
#define RM_DISTANCESVC_MQH

#define RM_UNDEFINED_MSG "Distance unit is undefined for this symbol. Select a symbol profile or custom unit."

// RM_DistInfo / RM_DistCtx and their globals live in RM_Globals.mqh (declared before use)

int RM_EffectiveDistMode()
  {
   // legacy configurations (no/old version) keep their broker-point meaning
   return (InpConfigVersion >= 2) ? (int)InpDistanceUnitMode : RM_DU_BROKER_POINTS;
  }

string RM_DistModeName(int m)
  {
   switch(m)
     {
      case RM_DU_STANDARDIZED:  return "Standardized points";
      case RM_DU_BROKER_POINTS: return "Broker points";
      case RM_DU_PRICE:         return "Price distance";
      case RM_DU_CUSTOM:        return "Custom unit";
     }
   return "?";
  }

string RM_ProfileSourceName(int s)
  {
   if(s == RM_PSRC_OVERRIDE) return "override";
   if(s == RM_PSRC_MAP)      return "map";
   if(s == RM_PSRC_METADATA) return "metadata";
   return "unresolved";
  }

//+------------------------------------------------------------------+
//| Resolve everything for one symbol and one mode                    |
//+------------------------------------------------------------------+
void RM_ResolveDistanceFor(string symbol, int mode, RM_DistInfo &d)
  {
   d.symbol = symbol;
   d.mode = mode;
   d.brokerPoint = MarketInfo(symbol, MODE_POINT);
   d.tickPrice = MarketInfo(symbol, MODE_TICKSIZE);      // MQL4 returns tick size in PRICE units
   d.digits = (int)MarketInfo(symbol, MODE_DIGITS);
   string baseCcy = SymbolInfoString(symbol, SYMBOL_CURRENCY_BASE);
   string profitCcy = SymbolInfoString(symbol, SYMBOL_CURRENCY_PROFIT);
   int calcMode = (int)MarketInfo(symbol, MODE_PROFITCALCMODE);
   double ov = 0.0;
   int src = RM_PSRC_NONE;
   d.profile = RM_ResolveProfile(symbol, InpSymbolProfileMap, InpSymbolPrefix, InpSymbolSuffix, InpUnitOverrides,
                                 baseCcy, profitCcy, calcMode, ov, src);
   d.source = src;
   d.unitPrice = RM_ResolveUnitPrice(mode, d.profile, ov, d.brokerPoint, InpCustomUnitPrice);
   string w = "";
   d.metaValid = RM_MetaValid(d.brokerPoint, d.tickPrice, w);
   d.valid = d.metaValid && d.unitPrice > 0.0;
   d.why = "";
   if(!d.metaValid)
      d.why = "invalid symbol metadata: " + w;
   else if(d.unitPrice <= 0.0)
      d.why = (mode == RM_DU_CUSTOM) ? "Custom unit price must be > 0. Select a symbol profile or custom unit." : RM_UNDEFINED_MSG;
  }

//+------------------------------------------------------------------+
//| Requested service API                                              |
//+------------------------------------------------------------------+
double GetDistanceUnitPrice(string symbol, int mode)
  {
   RM_DistInfo d;
   RM_ResolveDistanceFor(symbol, mode, d);
   return d.valid ? d.unitPrice : 0.0;
  }

double DistanceToPrice(string symbol, double inputDistance)
  {
   return RM_DistUnitsToPrice(inputDistance, GetDistanceUnitPrice(symbol, RM_EffectiveDistMode()));
  }

double PriceToDistanceUnits(string symbol, double priceDifference)
  {
   return RM_PriceToDistUnits(priceDifference, GetDistanceUnitPrice(symbol, RM_EffectiveDistMode()));
  }

double PriceDistanceToBrokerPoints(string symbol, double priceDifference)
  {
   return RM_PriceToBrokerPoints(priceDifference, MarketInfo(symbol, MODE_POINT));
  }

double AlignPriceToTick(string symbol, double price, int roundingDirection)
  {
   return RM_AlignToTick(price, MarketInfo(symbol, MODE_TICKSIZE), roundingDirection);
  }

//+------------------------------------------------------------------+
//| Current symbol (the EA trades its chart symbol only)              |
//+------------------------------------------------------------------+
void RM_DistRefresh()
  {
   RM_ResolveDistanceFor(g_sym, RM_EffectiveDistMode(), g_dist);
  }

double RM_TickPrice()
  {
   return g_dist.tickPrice;
  }

//+------------------------------------------------------------------+
//| Unit contexts                                                     |
//+------------------------------------------------------------------+
void RM_CtxClear(RM_DistCtx &c)
  {
   c.active = false; c.mode = 0; c.profile = 0; c.unitPrice = 0; c.stepBasePrice = 0; c.stepMult = 1;
   c.tpPrice = 0; c.overlapPrice = 0; c.partialTPPrice = 0; c.bufferPrice = 0; c.since = 0;
  }

string RM_CtxText(const RM_DistCtx &c)
  {
   return RM_DistModeName(c.mode) + ", profile " + RM_ProfileName(c.profile) + ", unit " + DoubleToString(c.unitPrice, 8);
  }

bool RM_CtxCaptureRec(string why)
  {
   if(!g_dist.valid)
      return false;
   g_ctxRec.active = true;
   g_ctxRec.mode = g_dist.mode;
   g_ctxRec.profile = g_dist.profile;
   g_ctxRec.unitPrice = g_dist.unitPrice;
   g_ctxRec.stepBasePrice = RM_DistUnitsToPrice(InpGridStepPoints, g_dist.unitPrice);
   g_ctxRec.stepMult = InpStepMultiplier;
   g_ctxRec.partialTPPrice = RM_DistUnitsToPrice(InpPartialTPPoints, g_dist.unitPrice);
   g_ctxRec.bufferPrice = RM_DistUnitsToPrice(InpExecBufferPoints, g_dist.unitPrice);
   g_ctxRec.tpPrice = 0; g_ctxRec.overlapPrice = 0;
   g_ctxRec.since = (long)TimeCurrent();
   RM_Audit("UNITS_RECOVERY", 0, 0, g_ctxRec.stepBasePrice, why + ": " + RM_CtxText(g_ctxRec) +
            ", base step " + DoubleToString(g_ctxRec.stepBasePrice, g_dist.digits) + " price");
   return true;
  }

bool RM_CtxCaptureNorm(string why)
  {
   if(!g_dist.valid)
      return false;
   g_ctxNorm.active = true;
   g_ctxNorm.mode = g_dist.mode;
   g_ctxNorm.profile = g_dist.profile;
   g_ctxNorm.unitPrice = g_dist.unitPrice;
   g_ctxNorm.stepBasePrice = RM_DistUnitsToPrice(InpNormalAvgStepPoints, g_dist.unitPrice);
   g_ctxNorm.stepMult = 1.0;
   g_ctxNorm.tpPrice = RM_DistUnitsToPrice(InpNormalTPPoints, g_dist.unitPrice);
   g_ctxNorm.overlapPrice = RM_DistUnitsToPrice(InpNormalOverlapTPPoints, g_dist.unitPrice);
   g_ctxNorm.partialTPPrice = 0; g_ctxNorm.bufferPrice = 0;
   g_ctxNorm.since = (long)TimeCurrent();
   RM_Audit("UNITS_NORMAL", 0, 0, g_ctxNorm.stepBasePrice, why + ": " + RM_CtxText(g_ctxNorm));
   return true;
  }

//--- recovery accessors (persisted context first, current config otherwise)
bool RM_RecDistanceUsable()
  {
   return g_ctxRec.active || g_dist.valid;
  }

double RM_RecUnit()
  {
   if(g_ctxRec.active)
      return g_ctxRec.unitPrice;
   return g_dist.valid ? g_dist.unitPrice : 0.0;
  }

//+------------------------------------------------------------------+
//| Requested recovery spacing (price) before grid index n >= 1.      |
//| Multiplier applied to the UNROUNDED base; aligned once later.     |
//+------------------------------------------------------------------+
double RM_RecStepRequestedPrice(int n)
  {
   double base = 0.0, mult = InpStepMultiplier;
   if(g_ctxRec.active)
     {
      base = g_ctxRec.stepBasePrice;
      mult = g_ctxRec.stepMult;
     }
   else if(g_dist.valid)
      base = RM_DistUnitsToPrice(InpGridStepPoints, g_dist.unitPrice);
   return RM_GridStepPoints(base, mult, n);          // generic: base * mult^(n-1)
  }

//+------------------------------------------------------------------+
//| Profit model inputs: distance -> PRICE -> the existing validated  |
//| money-per-broker-point model (lot basis/commission unchanged).    |
//| -1 = undefined.                                                   |
//+------------------------------------------------------------------+
double RM_RecPartialTPBrokerPts()
  {
   double price = g_ctxRec.active ? g_ctxRec.partialTPPrice
                  : (g_dist.valid ? RM_DistUnitsToPrice(InpPartialTPPoints, g_dist.unitPrice) : -1.0);
   if(price < 0.0 || g_meta.point <= 0.0)
      return -1.0;
   return RM_PriceToBrokerPoints(price, g_meta.point);
  }

double RM_RecBufferBrokerPts()
  {
   double price = g_ctxRec.active ? g_ctxRec.bufferPrice
                  : (g_dist.valid ? RM_DistUnitsToPrice(InpExecBufferPoints, g_dist.unitPrice) : 0.0);
   return (g_meta.point > 0.0) ? RM_PriceToBrokerPoints(price, g_meta.point) : 0.0;
  }

//--- normal accessors
bool RM_NormDistanceUsable()
  {
   return g_ctxNorm.active || g_dist.valid;
  }

double RM_NormUnit()
  {
   if(g_ctxNorm.active)
      return g_ctxNorm.unitPrice;
   return g_dist.valid ? g_dist.unitPrice : 0.0;
  }

double RM_NormStepPrice()
  {
   if(g_ctxNorm.active)
      return g_ctxNorm.stepBasePrice;
   return g_dist.valid ? RM_DistUnitsToPrice(InpNormalAvgStepPoints, g_dist.unitPrice) : 0.0;
  }

double RM_NormTPPrice()
  {
   if(g_ctxNorm.active)
      return g_ctxNorm.tpPrice;
   return g_dist.valid ? RM_DistUnitsToPrice(InpNormalTPPoints, g_dist.unitPrice) : 0.0;
  }

double RM_NormOverlapBrokerPts()
  {
   double price = g_ctxNorm.active ? g_ctxNorm.overlapPrice
                  : (g_dist.valid ? RM_DistUnitsToPrice(InpNormalOverlapTPPoints, g_dist.unitPrice) : 0.0);
   return (g_meta.point > 0.0) ? RM_PriceToBrokerPoints(price, g_meta.point) : 0.0;
  }

//+------------------------------------------------------------------+
//| Spread limit in distance units -> price at the comparison.        |
//| Undefined units block new exposure (reason returned).             |
//+------------------------------------------------------------------+
bool RM_SpreadExceeds(double limitUnits, double unitPrice, string &why)
  {
   if(unitPrice <= 0.0)
     {
      why = (g_dist.why != "") ? g_dist.why : RM_UNDEFINED_MSG;
      return true;
     }
   double limitPrice = RM_DistUnitsToPrice(limitUnits, unitPrice);
   double bid = RM_Bid(), ask = RM_Ask();
   if(RM_SpreadTooWide(bid, ask, limitPrice))
     {
      why = "spread " + DoubleToString(ask - bid, g_dist.digits) + " (" +
            DoubleToString(RM_PriceToDistUnits(ask - bid, unitPrice), 1) + " units) > max " +
            DoubleToString(limitUnits, 1) + " units";
      return true;
     }
   return false;
  }

//+------------------------------------------------------------------+
//| Slippage for OrderSend/OrderClose (broker points), floored so it  |
//| is never looser than the configured maximum.                      |
//+------------------------------------------------------------------+
int RM_SlippageBrokerPts(double limitUnits, double unitPrice)
  {
   if(unitPrice <= 0.0)
      return 0;
   return RM_MaxLimitBrokerPoints(RM_DistUnitsToPrice(limitUnits, unitPrice), g_dist.brokerPoint);
  }

//+------------------------------------------------------------------+
//| Legacy configuration: notice + migration preview                  |
//+------------------------------------------------------------------+
string RM_MigLine(string name, double oldInput, double stdUnit)
  {
   double v = RM_MigrateDistance(oldInput, g_dist.brokerPoint, stdUnit);
   return name + "=" + DoubleToString(v, 2);
  }

//--- integer MAXIMUM limits (spread, slippage): floored so the limit is never loosened
string RM_MigLineMaxInt(string name, double oldInput, double stdUnit)
  {
   double v = RM_MigrateDistance(oldInput, g_dist.brokerPoint, stdUnit);
   return name + "=" + IntegerToString((long)MathFloor(v + 1e-7));
  }

void RM_MigrationPreview()
  {
   g_migrationText = "";
   if(InpConfigVersion >= 2)
      return;
   double stdUnit = GetDistanceUnitPrice(g_sym, RM_DU_STANDARDIZED);
   RM_Audit("CONFIG_LEGACY", 0, 0, InpConfigVersion,
            "legacy configuration: distance inputs are BROKER POINTS (Point " + DoubleToString(g_dist.brokerPoint, 8) +
            "). Set InpConfigVersion=2 to use InpDistanceUnitMode.");
   if(stdUnit <= 0.0)
     {
      g_migrationText = "Legacy units; no standardized profile - migrate with PRICE_DISTANCE or CUSTOM_UNIT";
      RM_Audit("MIGRATION_PREVIEW", 0, 0, 0, "no standardized profile for " + g_sym + ": choose PRICE_DISTANCE, CUSTOM_UNIT or an override");
      return;
     }
   string lines[10];
   lines[0] = RM_MigLine("InpGridStepPoints", InpGridStepPoints, stdUnit);
   lines[1] = RM_MigLine("InpPartialTPPoints", InpPartialTPPoints, stdUnit);
   lines[2] = RM_MigLine("InpExecBufferPoints", InpExecBufferPoints, stdUnit);
   lines[3] = RM_MigLineMaxInt("InpMaxSpread", InpMaxSpread, stdUnit);
   lines[4] = RM_MigLineMaxInt("InpMaxSlippage", InpMaxSlippage, stdUnit);
   lines[5] = RM_MigLine("InpNormalAvgStepPoints", InpNormalAvgStepPoints, stdUnit);
   lines[6] = RM_MigLine("InpNormalTPPoints", InpNormalTPPoints, stdUnit);
   lines[7] = RM_MigLine("InpNormalOverlapTPPoints", InpNormalOverlapTPPoints, stdUnit);
   lines[8] = RM_MigLineMaxInt("InpNormalMaxSpread", InpNormalMaxSpread, stdUnit);
   lines[9] = RM_MigLineMaxInt("InpNormalSlippage", InpNormalSlippage, stdUnit);
   string summary = "";
   for(int i = 0; i < 10; i++)
     {
      RM_Audit("MIGRATION_PREVIEW", 0, 0, 0, lines[i] + " (same price distance, standardized unit " + DoubleToString(stdUnit, 5) + ")");
      summary += lines[i] + " ";
     }
   g_migrationText = "Legacy units. Preview: grid " + lines[0];
   if(InpWriteMigrationPreview)
     {
      string fn = "RecoveryManagerPro\\" + g_sym + "_units_v2_preview.set";
      int h = FileOpen(fn, FILE_WRITE | FILE_TXT | FILE_ANSI);
      if(h != INVALID_HANDLE)
        {
         FileWriteString(h, "; Recovery Manager Pro - distance-unit migration PREVIEW for " + g_sym + "\r\n");
         FileWriteString(h, "; Preserves each original price distance: NewInput = OldInput * " +
                         DoubleToString(g_dist.brokerPoint, 8) + " / " + DoubleToString(stdUnit, 8) + "\r\n");
         FileWriteString(h, "; Review, then load it over your current settings to apply. Nothing is applied automatically.\r\n");
         FileWriteString(h, "InpConfigVersion=2\r\nInpDistanceUnitMode=0\r\n");
         for(int k = 0; k < 10; k++)
            FileWriteString(h, lines[k] + "\r\n");
         FileClose(h);
         RM_Audit("MIGRATION_PREVIEW", 0, 0, 0, "written to MQL4/Files/" + fn);
        }
     }
  }

#endif

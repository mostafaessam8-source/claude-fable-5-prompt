//+------------------------------------------------------------------+
//| RM_Config.mqh - input validation, parsing, identity               |
//+------------------------------------------------------------------+
#ifndef RM_CONFIG_MQH
#define RM_CONFIG_MQH

//+------------------------------------------------------------------+
//| Parse "12345, 54321,0" into an int array. false on bad token.     |
//+------------------------------------------------------------------+
bool RM_ParseIntList(string text, int &out[], string &err)
  {
   ArrayResize(out, 0);
   string t = StringTrimRight(StringTrimLeft(text));
   if(t == "")
      return true;
   string parts[];
   ushort sep = StringGetCharacter(",", 0);
   int n = StringSplit(t, sep, parts);
   for(int i = 0; i < n; i++)
     {
      string p = StringTrimRight(StringTrimLeft(parts[i]));
      if(p == "")
         continue;
      for(int c = 0; c < StringLen(p); c++)
        {
         ushort ch = StringGetCharacter(p, c);
         if(ch < '0' || ch > '9')
           {
            err = "magic list token '" + p + "' is not a non-negative integer";
            return false;
           }
        }
      int sz = ArraySize(out);
      ArrayResize(out, sz + 1);
      out[sz] = (int)StringToInteger(p);
     }
   return true;
  }

bool RM_InList(int v, const int &arr[])
  {
   for(int i = 0; i < ArraySize(arr); i++)
      if(arr[i] == v)
         return true;
   return false;
  }

//+------------------------------------------------------------------+
//| Validate every input; returns false with a useful explanation.   |
//+------------------------------------------------------------------+
bool RM_ValidateInputs(string &err)
  {
   if(!RM_ParseIntList(InpMagicList, g_magicAllow, err))
      return false;
   if(!RM_ParseIntList(InpExcludeMagics, g_magicExclude, err))
      return false;
   if(InpScope == RM_SCOPE_MAGIC_LIST && ArraySize(g_magicAllow) == 0)
     { err = "scope 'Magic-number allowlist' needs at least one magic in InpMagicList"; return false; }
   if(InpRecoveryMagic <= 0 || InpLockMagic <= 0)
     { err = "recovery and lock magic numbers must be > 0 (0 identifies manual orders)"; return false; }
   if(InpRecoveryMagic == InpLockMagic)
     { err = "recovery magic and lock magic must differ, otherwise roles are ambiguous"; return false; }
   if(RM_InList(InpRecoveryMagic, g_magicAllow) || RM_InList(InpLockMagic, g_magicAllow))
     { err = "recovery/lock magic appears in the managed allowlist - an order would be counted twice"; return false; }
   if(InpManualOriginalMagic == InpRecoveryMagic || InpManualOriginalMagic == InpLockMagic)
     { err = "manual ORIGINAL magic must differ from recovery/lock magic"; return false; }
   if(InpFirstRecoveryTicket < 0)
     { err = "first recovery ticket must be 0 (unused) or a ticket number"; return false; }
   if(InpLaunchMode == RM_LAUNCH_DD_PERCENT && (InpLaunchDrawdown <= 0.0 || InpLaunchDrawdown > 100.0))
     { err = "percentage launch drawdown must be in (0, 100]"; return false; }
   if(InpLaunchMode == RM_LAUNCH_DD_MONEY && InpLaunchDrawdown <= 0.0)
     { err = "money launch drawdown must be > 0"; return false; }
   if(InpOtherEAs != RM_OTHER_KEEP && !InpAllowChartClosure)
     { err = "'Other EAs at launch' closes charts; set InpAllowChartClosure=true to confirm, or choose 'Do not disable'"; return false; }
   if(InpPartialLots <= 0.0 || InpPartialLots > 1000.0)
     { err = "partial-close volume must be in (0, 1000] lots"; return false; }
   if(InpPartialTPPoints < 0.0 || InpPartialTPPoints > 1000000.0)
     { err = "partial-close TP must be >= 0 points"; return false; }
   if(InpOverlapThreshold != 0 && InpOverlapThreshold < 2)
     { err = "overlap threshold must be 0 (off) or >= 2 (it needs a first AND a last order)"; return false; }
   if(InpBasketTP && InpBasketTPMoney <= 0.0)
     { err = "whole-basket TP amount must be > 0 when enabled"; return false; }
   if(InpFirstLot <= 0.0)
     { err = "first recovery volume must be > 0"; return false; }
   if(InpLotMultiplier < 1.0 || InpLotMultiplier > 5.0)
     { err = "volume multiplier must be in [1.0, 5.0]"; return false; }
   if(InpGridStepPoints <= 0.0)
     { err = "grid step must be > 0 points"; return false; }
   if(InpStepMultiplier < 0.5 || InpStepMultiplier > 5.0)
     { err = "step multiplier must be in [0.5, 5.0]"; return false; }
   if(InpMaxSlippage < 0 || InpMaxSpread <= 0)
     { err = "slippage must be >= 0 and maximum spread > 0 points"; return false; }
   if(InpMaxRecoveryLot < InpFirstLot)
     { err = "maximum recovery volume is smaller than the first recovery volume"; return false; }
   if(InpMaxRecoveryCount < 1 || InpMaxRecoveryCount > 200)
     { err = "maximum recovery order count must be in [1, 200]"; return false; }
   if(InpMaxEntriesPerEvent < 1 || InpMaxEntriesPerEvent > 5)
     { err = "max entries per tick must be in [1, 5]"; return false; }
   if(InpExtraCommPerLot < 0.0 || InpExecBufferPoints < 0.0)
     { err = "commission and buffer inputs must be >= 0"; return false; }
   if(InpManualLot <= 0.0)
     { err = "manual panel volume must be > 0"; return false; }
   if(InpFontSize < 5 || InpFontSize > 14)
     { err = "font size must be in [5, 14]"; return false; }
   if(InpSignalMode == RM_SIG_TREND && (InpTrendAmplitude < 2 || InpTrendAmplitude > 500))
     { err = "trend amplitude must be in [2, 500] bars"; return false; }
   if(InpSignalMode == RM_SIG_EXTERNAL && StringLen(InpExtIndicator) == 0)
     { err = "external adapter selected but no indicator name supplied"; return false; }
   if(InpMaxManagedLots < 0.0 || InpMaxRecoveryLotsSum < 0.0 || InpMinFreeMargin < 0.0 || InpMinMarginLevel < 0.0)
     { err = "risk limits must be >= 0"; return false; }
   if(InpEmergencyMode != RM_EMG_OFF && InpEmergencyValue <= 0.0)
     { err = "emergency threshold must be > 0 when enabled"; return false; }
   if(InpEmergencyMode == RM_EMG_PERCENT && InpEmergencyValue > 100.0)
     { err = "emergency percentage must be <= 100"; return false; }
   if(InpDailyLossLimit < 0.0)
     { err = "daily loss limit must be >= 0"; return false; }
   if(InpSessionStartHour < 0 || InpSessionStartHour > 23 || InpSessionEndHour < 1 || InpSessionEndHour > 24)
     { err = "session hours: start 0-23, end 1-24"; return false; }
   if(InpInstanceId < 0)
     { err = "instance id must be >= 0"; return false; }
   if(InpEnableTestSeeds && InpTestSeedScenario != RM_SEED_NONE && InpTestSeedLots <= 0.0)
     { err = "test seed volume must be > 0"; return false; }
   if(InpEnableTestSeeds && (InpTestSeedMagic == InpRecoveryMagic || InpTestSeedMagic == InpLockMagic))
     { err = "test seed magic must differ from recovery/lock magic"; return false; }

   // ---- distance units
   if(InpConfigVersion < 0 || InpConfigVersion > 2)
     { err = "InpConfigVersion must be 0/1 (legacy broker points) or 2 (distance unit mode)"; return false; }
   if(InpConfigVersion >= 2 && InpDistanceUnitMode == RM_DU_CUSTOM && InpCustomUnitPrice <= 0.0)
     { err = "CUSTOM_UNIT needs InpCustomUnitPrice > 0 (price value of one unit)"; return false; }
   if(InpCustomUnitPrice < 0.0)
     { err = "InpCustomUnitPrice must be >= 0"; return false; }
   string lerr = "";
   if(!RM_ListValid(InpSymbolProfileMap, false, lerr))
     { err = "InpSymbolProfileMap: " + lerr; return false; }
   if(!RM_ListValid(InpUnitOverrides, true, lerr))
     { err = "InpUnitOverrides: " + lerr; return false; }

   // ---- Three-MA normal strategy and combined operation
   if(InpOperatingMode != RM_OP_RECOVERY_ONLY)
     {
      if(InpNormalMagic <= 0 || InpNormalMagic == InpRecoveryMagic || InpNormalMagic == InpLockMagic ||
         InpNormalMagic == InpManualOriginalMagic || (InpEnableTestSeeds && InpNormalMagic == InpTestSeedMagic))
        { err = "normal-strategy magic must be > 0 and differ from recovery, lock, manual and test magics"; return false; }
      if(RM_InList(InpNormalMagic, g_magicExclude))
        { err = "normal-strategy magic is in InpExcludeMagics - its basket could never be recovered"; return false; }
      if(InpFastPeriod <= 0 || InpSlowPeriod <= 0 || (InpUseFilterMA && InpFilterPeriod <= 0))
        { err = "moving-average periods must be positive"; return false; }
      if(InpFastPeriod >= InpSlowPeriod)
        { err = "fast MA period must be smaller than the slow MA period"; return false; }
      if(InpUseFilterMA && InpSlowPeriod >= InpFilterPeriod)
        { err = "with the filter enabled the periods must satisfy fast < slow < filter"; return false; }
      if(InpNormalLot <= 0.0)
        { err = "normal initial lot must be > 0"; return false; }
      if(InpNormalLotMode == RM_NLOT_BALANCE && InpNormalLotPerBalance <= 0.0)
        { err = "balance-based lot sizing needs InpNormalLotPerBalance > 0"; return false; }
      if(InpNormalAveraging && (InpNormalAvgStepPoints <= 0.0 || InpNormalAvgMultiplier < 1.0 || InpNormalAvgMultiplier > 5.0))
        { err = "normal averaging: spacing > 0 points and multiplier in [1.0, 5.0]"; return false; }
      if(InpNormalMaxPerDir < 1 || InpNormalMaxLots < 0.0 || InpNormalTPPoints < 0.0)
        { err = "normal limits: max orders per direction >= 1, max lots >= 0, TP >= 0"; return false; }
      if(InpNormalOverlap && (InpNormalOverlapMinOrders < 2 || InpNormalOverlapTPPoints <= 0.0))
        { err = "normal overlap needs at least 2 orders and a target > 0 points"; return false; }
      if(InpNormalMaxSpread <= 0 || InpNormalSlippage < 0)
        { err = "normal spread limit must be > 0 and slippage >= 0"; return false; }
      if(InpResumeCooldownBars < 0)
        { err = "resume cooldown must be >= 0 bars"; return false; }
     }
   if(InpOperatingMode == RM_OP_THREE_MA_WITH_RECOVERY)
     {
      // one threshold (InpLaunchDrawdown) controls the handover; InpLaunchMode is ignored here
      if(InpLaunchDrawdown <= 0.0)
        { err = "handover threshold InpLaunchDrawdown must be > 0"; return false; }
      if(InpRecoveryTriggerMode == RM_TRIG_PERCENT && InpLaunchDrawdown > 100.0)
        { err = "percentage handover threshold must be <= 100"; return false; }
      bool sameUnit = (InpEmergencyMode == RM_EMG_PERCENT && InpRecoveryTriggerMode == RM_TRIG_PERCENT) ||
                      (InpEmergencyMode == RM_EMG_MONEY && InpRecoveryTriggerMode == RM_TRIG_MONEY);
      if(sameUnit && InpEmergencyValue <= InpLaunchDrawdown)
        { err = "emergency-loss limit must be larger than the recovery-launch threshold (they are different controls)"; return false; }
     }

   // derived planner configuration
   g_cfg.priority = InpRecoveryPriority;
   g_cfg.firstTicket = InpFirstRecoveryTicket;
   g_cfg.partialLots = InpPartialLots;
   g_cfg.partialTPPoints = InpPartialTPPoints;
   g_cfg.tpBasis = InpTPBasis;
   g_cfg.fullCommission = InpFullCommission;
   g_cfg.extraCommPerLot = InpExtraCommPerLot;
   g_cfg.execBufferPoints = InpExecBufferPoints;
   g_cfg.overlapEnabled = (InpOverlapThreshold >= 2);
   g_cfg.overlapThreshold = InpOverlapThreshold;
   g_cfg.overlapCompare = InpOverlapCompare;
   g_cfg.matchedMain = InpLocking;
   return true;
  }

//+------------------------------------------------------------------+
//| Identity: account + symbol + instance id                          |
//+------------------------------------------------------------------+
void RM_InitIdentity()
  {
   g_sym = Symbol();
   g_chartId = ChartID();
   string mode = IsTesting() ? "T_" : "";
   g_keyBase = mode + IntegerToString(AccountNumber()) + "_" + g_sym + "_" + IntegerToString(InpInstanceId);
   g_stateFile = "RecoveryManagerPro\\" + g_keyBase + ".state";
   g_auditFile = "RecoveryManagerPro\\" + g_keyBase + "_audit.csv";
  }

#endif

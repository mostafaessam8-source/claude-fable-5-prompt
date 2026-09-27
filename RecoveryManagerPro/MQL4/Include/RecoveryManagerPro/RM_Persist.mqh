//+------------------------------------------------------------------+
//| RM_Persist.mqh - state file (MQL4/Files/RecoveryManagerPro/) and  |
//| instance lock. The file is written after every state change,      |
//| registry change and confirmed journal leg; it is advisory only:   |
//| on load, broker truth (RM_ReconcileRegistry) always wins.         |
//+------------------------------------------------------------------+
#ifndef RM_PERSIST_MQH
#define RM_PERSIST_MQH

string RM_LockName()
  {
   return "RMP_LOCK_" + g_keyBase;
  }

string RM_MagicLockName()
  {
   return "RMP_MAGIC_" + IntegerToString(AccountNumber()) + "_" + g_sym + "_" + IntegerToString(InpRecoveryMagic);
  }

//+------------------------------------------------------------------+
//| true if another chart still hosts the owner of this lock          |
//+------------------------------------------------------------------+
bool RM_LockHeldElsewhere(string name)
  {
   if(!GlobalVariableCheck(name))
      return false;
   long owner = (long)GlobalVariableGet(name);
   if(owner == g_chartId)
      return false;
   // owner chart still open?
   long id = ChartFirst();
   while(id >= 0)
     {
      if(id == owner)
         return true;
      id = ChartNext(id);
     }
   return false;           // stale lock from a closed chart
  }

bool RM_AcquireInstanceLock(string &err)
  {
   if(IsTesting())
      return true;         // tester runs are isolated
   if(RM_LockHeldElsewhere(RM_LockName()))
     {
      err = "another chart already runs instance " + IntegerToString(InpInstanceId) +
            " on " + g_sym + " for this account - ownership would be ambiguous";
      return false;
     }
   if(RM_LockHeldElsewhere(RM_MagicLockName()))
     {
      err = "recovery magic " + IntegerToString(InpRecoveryMagic) + " is already used by another chart on " + g_sym;
      return false;
     }
   GlobalVariableSet(RM_LockName(), (double)g_chartId);
   GlobalVariableSet(RM_MagicLockName(), (double)g_chartId);
   return true;
  }

void RM_ReleaseInstanceLock()
  {
   if(IsTesting())
      return;
   if(GlobalVariableCheck(RM_LockName()) && (long)GlobalVariableGet(RM_LockName()) == g_chartId)
      GlobalVariableDel(RM_LockName());
   if(GlobalVariableCheck(RM_MagicLockName()) && (long)GlobalVariableGet(RM_MagicLockName()) == g_chartId)
      GlobalVariableDel(RM_MagicLockName());
  }

string RM_B(bool b) { return b ? "1" : "0"; }

//+------------------------------------------------------------------+
void RM_SaveState()
  {
   if(g_stateFile == "")
      return;
   string tmp = g_stateFile + ".tmp";
   int h = FileOpen(tmp, FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(h == INVALID_HANDLE)
     {
      Print("RMP: cannot write state file ", tmp, " error ", GetLastError());
      return;
     }
   FileWriteString(h, "VERSION=1\r\n");
   FileWriteString(h, "STATE=" + IntegerToString(g_state) + "\r\n");
   FileWriteString(h, "BEFOREPAUSE=" + IntegerToString(g_stateBeforePause) + "\r\n");
   FileWriteString(h, "SESSION=" + IntegerToString(g_sessionId) + "\r\n");
   FileWriteString(h, "LAUNCH=" + RM_B(g_launchDone) + "\r\n");
   FileWriteString(h, "PREP=" + RM_B(g_prepDone) + "\r\n");
   FileWriteString(h, "LOCK=" + RM_B(g_lockDone) + "\r\n");
   FileWriteString(h, "PENDDEL=" + RM_B(g_pendingsDone) + "\r\n");
   FileWriteString(h, "SLTP=" + RM_B(g_sltpDone) + "\r\n");
   FileWriteString(h, "FIN=" + RM_B(g_financeDone) + "\r\n");
   FileWriteString(h, "CHARTS=" + RM_B(g_chartsDone) + "\r\n");
   FileWriteString(h, "CLOSEREQ=" + RM_B(g_closeRequested) + "\r\n");
   FileWriteString(h, "NOTIFIED=" + RM_B(g_launchNotified) + "\r\n");
   FileWriteString(h, "LEB0=" + IntegerToString(g_lastEntryBar[0]) + "\r\n");
   FileWriteString(h, "LEB1=" + IntegerToString(g_lastEntryBar[1]) + "\r\n");
   FileWriteString(h, "HI0=" + IntegerToString(g_highIndex[0]) + "\r\n");
   FileWriteString(h, "HI1=" + IntegerToString(g_highIndex[1]) + "\r\n");
   FileWriteString(h, "PLANSEQ=" + IntegerToString(g_planSeq) + "\r\n");
   FileWriteString(h, "REQSEQ=" + IntegerToString(g_reqSeq) + "\r\n");
   FileWriteString(h, "RSESS=" + DoubleToString(g_realizedSession, 2) + "\r\n");
   FileWriteString(h, "RDAY=" + DoubleToString(g_realizedDay, 2) + "\r\n");
   FileWriteString(h, "DAY=" + IntegerToString(g_dayStamp) + "\r\n");
   FileWriteString(h, "PEAKDD=" + DoubleToString(g_peakDrawdown, 2) + "\r\n");
   FileWriteString(h, "RESID=" + DoubleToString(g_lockResidual, 8) + "\r\n");
   // combined-operation controller
   FileWriteString(h, "CTL=" + IntegerToString(g_ctl) + "\r\n");
   FileWriteString(h, "LATCH=" + RM_B(g_recLatch) + "\r\n");
   FileWriteString(h, "CYCLEID=" + IntegerToString(g_cycleId) + "\r\n");
   FileWriteString(h, "CYCLESTART=" + IntegerToString(g_cycleStart) + "\r\n");
   FileWriteString(h, "CYCLEEND=" + IntegerToString(g_cycleEnd) + "\r\n");
   FileWriteString(h, "TRIGVAL=" + DoubleToString(g_trigValue, 4) + "\r\n");
   FileWriteString(h, "HOSNAP=" + RM_B(g_hoSnapshot) + "\r\n");
   FileWriteString(h, "HOPEND=" + RM_B(g_hoPendings) + "\r\n");
   FileWriteString(h, "HOATT=" + IntegerToString(g_hoAttempts) + "\r\n");
   FileWriteString(h, "ENGEND=" + RM_B(g_engineCycleEnded) + "\r\n");
   FileWriteString(h, "OUTCOME=" + IntegerToString(g_cycleOutcome) + "\r\n");
   FileWriteString(h, "CYCEMG=" + RM_B(g_cycleEmergency) + "\r\n");
   FileWriteString(h, "CYCMAN=" + RM_B(g_cycleManual) + "\r\n");
   FileWriteString(h, "CYCREAL=" + DoubleToString(g_cycleRealized, 2) + "\r\n");
   FileWriteString(h, "NORMEN=" + RM_B(g_normalEnabled) + "\r\n");
   FileWriteString(h, "NORMHALT=" + RM_B(g_normalHalted) + "\r\n");
   FileWriteString(h, "OPRESUME=" + RM_B(g_operatorResume) + "\r\n");
   FileWriteString(h, "LASTSIGBAR=" + IntegerToString(g_lastSignalBar) + "\r\n");
   FileWriteString(h, "LASTSIG=" + IntegerToString(g_lastSignal) + "\r\n");
   FileWriteString(h, "FRESHAFTER=" + IntegerToString(g_freshAfter) + "\r\n");
   FileWriteString(h, "NAVG0=" + IntegerToString(g_normLastAvgBar[0]) + "\r\n");
   FileWriteString(h, "NAVG1=" + IntegerToString(g_normLastAvgBar[1]) + "\r\n");
   FileWriteString(h, "NREAL=" + DoubleToString(g_normalRealized, 2) + "\r\n");
   FileWriteString(h, "JACT=" + IntegerToString(g_journalActor) + "\r\n");
   FileWriteString(h, "REASON=" + RM_CsvSafe(g_lastReason) + "\r\n");
   for(int i = 0; i < g_regCount; i++)
      FileWriteString(h, "REG=" + IntegerToString(g_reg[i].ticket) + "," + IntegerToString(g_reg[i].role) + "," +
                      IntegerToString(g_reg[i].type) + "," + DoubleToString(g_reg[i].initialLots, 8) + "," +
                      IntegerToString(g_reg[i].gridIndex) + "," + IntegerToString(g_reg[i].parent) + "," +
                      IntegerToString(g_reg[i].session) + "," + DoubleToString(g_reg[i].openPrice, 8) + "," +
                      IntegerToString(g_reg[i].openTime) + "\r\n");
   for(int p = 0; p < g_pendCount; p++)
      FileWriteString(h, "PENDLIN=" + IntegerToString(g_pendParent[p]) + "," + IntegerToString(g_pendSince[p]) + "\r\n");
   if(g_journal.status == RM_J_IN_PROGRESS)
     {
      FileWriteString(h, "J=" + IntegerToString(g_journal.planId) + "," + IntegerToString(g_journal.kind) + "," +
                      IntegerToString(g_journal.status) + "," + IntegerToString(g_journal.n) + "," +
                      DoubleToString(g_journal.estimatedNet, 2) + "," + DoubleToString(g_journal.realizedNet, 2) + "," +
                      IntegerToString(g_journal.attempts) + "," + IntegerToString(g_journalStart) + "\r\n");
      for(int k = 0; k < g_journal.n; k++)
         FileWriteString(h, "JL=" + IntegerToString(k) + "," + IntegerToString(g_journal.ticket[k]) + "," +
                         DoubleToString(g_journal.targetLots[k], 8) + "," + DoubleToString(g_journal.doneLots[k], 8) + "," +
                         DoubleToString(g_journal.realized[k], 2) + "," + IntegerToString(g_journal.legDone[k]) + "," +
                         DoubleToString(g_journal.ticketLots[k], 8) + "\r\n");
     }
   FileClose(h);
   if(!FileMove(tmp, 0, g_stateFile, FILE_REWRITE))
      Print("RMP: state file replace failed, error ", GetLastError());
  }

//+------------------------------------------------------------------+
bool RM_LoadState()
  {
   if(IsTesting() && FileIsExist(g_stateFile))
      FileDelete(g_stateFile);          // every tester run starts clean
   if(!FileIsExist(g_stateFile))
      return false;
   int h = FileOpen(g_stateFile, FILE_READ | FILE_TXT | FILE_ANSI);
   if(h == INVALID_HANDLE)
      return false;
   g_regCount = 0;
   g_pendCount = 0;
   RM_JournalClear(g_journal);
   ushort comma = StringGetCharacter(",", 0);
   while(!FileIsEnding(h))
     {
      string line = FileReadString(h);
      int eq = StringFind(line, "=");
      if(eq <= 0)
         continue;
      string key = StringSubstr(line, 0, eq);
      string val = StringSubstr(line, eq + 1);
      if(key == "STATE") g_state = (int)StringToInteger(val);
      else if(key == "BEFOREPAUSE") g_stateBeforePause = (int)StringToInteger(val);
      else if(key == "SESSION") g_sessionId = StringToInteger(val);
      else if(key == "LAUNCH") g_launchDone = (val == "1");
      else if(key == "PREP") g_prepDone = (val == "1");
      else if(key == "LOCK") g_lockDone = (val == "1");
      else if(key == "PENDDEL") g_pendingsDone = (val == "1");
      else if(key == "SLTP") g_sltpDone = (val == "1");
      else if(key == "FIN") g_financeDone = (val == "1");
      else if(key == "CHARTS") g_chartsDone = (val == "1");
      else if(key == "CLOSEREQ") g_closeRequested = (val == "1");
      else if(key == "NOTIFIED") g_launchNotified = (val == "1");
      else if(key == "LEB0") g_lastEntryBar[0] = StringToInteger(val);
      else if(key == "LEB1") g_lastEntryBar[1] = StringToInteger(val);
      else if(key == "HI0") g_highIndex[0] = (int)StringToInteger(val);
      else if(key == "HI1") g_highIndex[1] = (int)StringToInteger(val);
      else if(key == "PLANSEQ") g_planSeq = (int)StringToInteger(val);
      else if(key == "REQSEQ") g_reqSeq = (int)StringToInteger(val);
      else if(key == "RSESS") g_realizedSession = StringToDouble(val);
      else if(key == "RDAY") g_realizedDay = StringToDouble(val);
      else if(key == "DAY") g_dayStamp = StringToInteger(val);
      else if(key == "PEAKDD") g_peakDrawdown = StringToDouble(val);
      else if(key == "RESID") g_lockResidual = StringToDouble(val);
      else if(key == "CTL") g_ctl = (int)StringToInteger(val);
      else if(key == "LATCH") g_recLatch = (val == "1");
      else if(key == "CYCLEID") g_cycleId = (int)StringToInteger(val);
      else if(key == "CYCLESTART") g_cycleStart = StringToInteger(val);
      else if(key == "CYCLEEND") g_cycleEnd = StringToInteger(val);
      else if(key == "TRIGVAL") g_trigValue = StringToDouble(val);
      else if(key == "HOSNAP") g_hoSnapshot = (val == "1");
      else if(key == "HOPEND") g_hoPendings = (val == "1");
      else if(key == "HOATT") g_hoAttempts = (int)StringToInteger(val);
      else if(key == "ENGEND") g_engineCycleEnded = (val == "1");
      else if(key == "OUTCOME") g_cycleOutcome = (int)StringToInteger(val);
      else if(key == "CYCEMG") g_cycleEmergency = (val == "1");
      else if(key == "CYCMAN") g_cycleManual = (val == "1");
      else if(key == "CYCREAL") g_cycleRealized = StringToDouble(val);
      else if(key == "NORMEN") g_normalEnabled = (val == "1");
      else if(key == "NORMHALT") g_normalHalted = (val == "1");
      else if(key == "OPRESUME") g_operatorResume = (val == "1");
      else if(key == "LASTSIGBAR") g_lastSignalBar = StringToInteger(val);
      else if(key == "LASTSIG") g_lastSignal = (int)StringToInteger(val);
      else if(key == "FRESHAFTER") g_freshAfter = StringToInteger(val);
      else if(key == "NAVG0") g_normLastAvgBar[0] = StringToInteger(val);
      else if(key == "NAVG1") g_normLastAvgBar[1] = StringToInteger(val);
      else if(key == "NREAL") g_normalRealized = StringToDouble(val);
      else if(key == "JACT") g_journalActor = (int)StringToInteger(val);
      else if(key == "REASON") g_lastReason = val;
      else if(key == "REG" && g_regCount < RM_MAX_REG)
        {
         string f[];
         if(StringSplit(val, comma, f) >= 9)
           {
            int i = g_regCount++;
            g_reg[i].ticket = (int)StringToInteger(f[0]);
            g_reg[i].role = (int)StringToInteger(f[1]);
            g_reg[i].type = (int)StringToInteger(f[2]);
            g_reg[i].initialLots = StringToDouble(f[3]);
            g_reg[i].gridIndex = (int)StringToInteger(f[4]);
            g_reg[i].parent = (int)StringToInteger(f[5]);
            g_reg[i].session = StringToInteger(f[6]);
            g_reg[i].openPrice = StringToDouble(f[7]);
            g_reg[i].openTime = StringToInteger(f[8]);
           }
        }
      else if(key == "PENDLIN" && g_pendCount < 32)
        {
         string f2[];
         if(StringSplit(val, comma, f2) >= 2)
           {
            g_pendParent[g_pendCount] = (int)StringToInteger(f2[0]);
            g_pendSince[g_pendCount] = StringToInteger(f2[1]);
            g_pendCount++;
           }
        }
      else if(key == "J")
        {
         string f3[];
         if(StringSplit(val, comma, f3) >= 8)
           {
            g_journal.planId = (int)StringToInteger(f3[0]);
            g_journal.kind = (int)StringToInteger(f3[1]);
            g_journal.status = (int)StringToInteger(f3[2]);
            g_journal.n = (int)MathMin(StringToInteger(f3[3]), RM_MAX_PLAN_LEGS);
            g_journal.estimatedNet = StringToDouble(f3[4]);
            g_journal.realizedNet = StringToDouble(f3[5]);
            g_journal.attempts = (int)StringToInteger(f3[6]);
            g_journalStart = StringToInteger(f3[7]);
           }
        }
      else if(key == "JL")
        {
         string f4[];
         if(StringSplit(val, comma, f4) >= 7)
           {
            int k = (int)StringToInteger(f4[0]);
            if(k >= 0 && k < RM_MAX_PLAN_LEGS)
              {
               g_journal.ticket[k] = (int)StringToInteger(f4[1]);
               g_journal.targetLots[k] = StringToDouble(f4[2]);
               g_journal.doneLots[k] = StringToDouble(f4[3]);
               g_journal.realized[k] = StringToDouble(f4[4]);
               g_journal.legDone[k] = (int)StringToInteger(f4[5]);
               g_journal.ticketLots[k] = StringToDouble(f4[6]);
              }
           }
        }
     }
   FileClose(h);
   if(g_state < RM_ST_IDLE || g_state > RM_ST_ERROR_HOLD)
      g_state = RM_ST_ERROR_HOLD;
   if(g_ctl < RM_CTL_NORMAL || g_ctl > RM_CTL_ERROR_HOLD)
      g_ctl = RM_CTL_ERROR_HOLD;
   return true;
  }

#endif

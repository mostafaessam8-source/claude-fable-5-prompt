//+------------------------------------------------------------------+
//| RM_Log.mqh - names, CSV audit export, notifications               |
//+------------------------------------------------------------------+
#ifndef RM_LOG_MQH
#define RM_LOG_MQH

int g_auditHandle = INVALID_HANDLE;

string RM_StateName(int s)
  {
   switch(s)
     {
      case RM_ST_IDLE:       return "IDLE";
      case RM_ST_ARMED:      return "ARMED";
      case RM_ST_PREPARING:  return "PREPARING";
      case RM_ST_LOCKING:    return "LOCKING";
      case RM_ST_RECOVERING: return "RECOVERING";
      case RM_ST_PAUSED:     return "PAUSED";
      case RM_ST_CLOSING:    return "CLOSING";
      case RM_ST_COMPLETE:   return "COMPLETE";
      case RM_ST_ERROR_HOLD: return "ERROR_HOLD";
     }
   return "?";
  }

string RM_CtlName(int c)
  {
   switch(c)
     {
      case RM_CTL_NORMAL:           return "NORMAL";
      case RM_CTL_HANDOVER:         return "HANDOVER";
      case RM_CTL_RECOVERY_ACTIVE:  return "RECOVERY_ACTIVE";
      case RM_CTL_RECOVERY_CLOSING: return "RECOVERY_CLOSING";
      case RM_CTL_COOLDOWN:         return "COOLDOWN";
      case RM_CTL_PAUSED:           return "PAUSED";
      case RM_CTL_ERROR_HOLD:       return "ERROR_HOLD";
     }
   return "?";
  }

string RM_OutcomeName(int o)
  {
   switch(o)
     {
      case RM_OUT_COMPLETED: return "COMPLETED";
      case RM_OUT_EMERGENCY: return "EMERGENCY_CLOSE";
      case RM_OUT_MANUAL:    return "MANUAL_TERMINATION";
     }
   return "-";
  }

string RM_RoleName(int r)
  {
   if(r == RM_ROLE_ORIGINAL) return "ORIGINAL";
   if(r == RM_ROLE_LOCK)     return "LOCK";
   if(r == RM_ROLE_RECOVERY) return "RECOVERY";
   if(r == RM_ROLE_NORMAL)   return "NORMAL";
   return "NONE";
  }

string RM_PlanKindName(int k)
  {
   switch(k)
     {
      case RM_PLAN_GROUP:     return "GROUP";
      case RM_PLAN_OVERLAP:   return "OVERLAP";
      case RM_PLAN_BASKET:    return "BASKET";
      case RM_PLAN_REDUCE:    return "REDUCE";
      case RM_PLAN_CLOSE_ALL: return "CLOSE_ALL";
      case RM_PLAN_LAUNCH:    return "LAUNCH_FINANCE";
      case RM_PLAN_MANUAL:    return "MANUAL_GROUP";
      case RM_PLAN_NORMAL_TP:        return "NORMAL_TP";
      case RM_PLAN_NORMAL_OVERLAP:   return "NORMAL_OVERLAP";
      case RM_PLAN_NORMAL_CLOSE:     return "NORMAL_CLOSE";
      case RM_PLAN_NORMAL_EMERGENCY: return "NORMAL_EMERGENCY";
     }
   return "NONE";
  }

string RM_ReasonName(int r)
  {
   switch(r)
     {
      case RM_R_OK:             return "ok";
      case RM_R_NO_RECOVERY:    return "no recovery orders";
      case RM_R_NO_MAIN:        return "no main position";
      case RM_R_SLICE_INVALID:  return "no legal slice volume";
      case RM_R_BELOW_TARGET:   return "below target";
      case RM_R_TOO_MANY_LEGS:  return "too many legs";
      case RM_R_NOTHING_AFFORD: return "nothing affordable";
      case RM_R_MATCH_FAILED:   return "cannot match BUY/SELL slices";
     }
   return "?";
  }

string RM_Side(int t)
  {
   return (t == RM_BUY) ? "BUY" : "SELL";
  }

//--- explicit string choice (avoids literal+literal concatenation pitfalls)
string RM_Pick(bool cond, string a, string b)
  {
   if(cond)
      return a;
   return b;
  }

string RM_Money(double v)
  {
   return DoubleToString(v, 2);
  }

string RM_Lots(double v)
  {
   return DoubleToString(v, 2);
  }

//+------------------------------------------------------------------+
//| CSV audit: time,state,event,ticket,lots,value,detail              |
//+------------------------------------------------------------------+
void RM_AuditOpen()
  {
   if(!InpAuditCsv)
      return;
   g_auditHandle = FileOpen(g_auditFile, FILE_READ | FILE_WRITE | FILE_TXT | FILE_ANSI | FILE_SHARE_READ);
   if(g_auditHandle == INVALID_HANDLE)
     {
      Print("RMP audit: cannot open ", g_auditFile, " error ", GetLastError());
      return;
     }
   if(FileSize(g_auditHandle) == 0)
      FileWriteString(g_auditHandle, "server_time,state,event,ticket,lots,value,detail\r\n");
   FileSeek(g_auditHandle, 0, SEEK_END);
  }

void RM_AuditClose()
  {
   if(g_auditHandle != INVALID_HANDLE)
      FileClose(g_auditHandle);
   g_auditHandle = INVALID_HANDLE;
  }

string RM_CsvSafe(string s)
  {
   StringReplace(s, ",", ";");
   StringReplace(s, "\n", " ");
   StringReplace(s, "\r", " ");
   return s;
  }

void RM_Audit(string evt, int ticket, double lots, double value, string detail)
  {
   string line = TimeToString(TimeCurrent(), TIME_DATE | TIME_SECONDS) + "," +
                 RM_StateName(g_state) + "," + evt + "," + IntegerToString(ticket) + "," +
                 DoubleToString(lots, 2) + "," + DoubleToString(value, 2) + "," + RM_CsvSafe(detail);
   if(!IsOptimization())
      Print("RMP ", evt, " #", ticket, " ", detail);
   if(g_auditHandle != INVALID_HANDLE)
     {
      FileWriteString(g_auditHandle, line + "\r\n");
      FileFlush(g_auditHandle);
     }
  }

void RM_Notify(string msg)
  {
   string full = "Recovery Manager Pro " + g_sym + ": " + msg;
   if(InpNotify == RM_NOTIFY_ALERT || InpNotify == RM_NOTIFY_BOTH)
      Alert(full);
   if((InpNotify == RM_NOTIFY_PUSH || InpNotify == RM_NOTIFY_BOTH) && !IsTesting())
      SendNotification(full);
  }

#endif

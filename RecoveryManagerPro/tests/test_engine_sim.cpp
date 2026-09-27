// test_engine_sim.cpp - end-to-end scenarios that RUN the Recovery Manager Pro
// EA source (OnInit / OnTick / OnDeinit / button handlers) against the
// in-memory broker in tests/mql_lint/mt4_sim.h.
//
// Appended to the rewritten EA translation unit by
//   python3 tests/mql_lint/mql_lint.py --sim tests/test_engine_sim.cpp
// Each scenario runs in its own process (argv[1] = index) so EA globals start
// clean, exactly like a fresh terminal.
#include <sys/stat.h>

static int s_fail = 0, s_pass = 0;
#define EXPECT(c) do { if(c) s_pass++; else { s_fail++; std::printf("    FAIL line %d: %s\n", __LINE__, #c); } } while(0)

static void Tick(double bid, int secs = 60)
  {
   S.now += secs;
   S.bid = bid;
   SimRecordBar();
   OnTick();
  }
static void Hold(int ticks, int secs = 60) { for(int i = 0; i < ticks; i++) Tick(S.bid, secs); }
static int CountMagic(int magic)
  { int n = 0; for(auto &o : S.open) if(o.magic == magic && o.sym == S.sym && o.type <= OP_SELL) n++; return n; }
static double LotsMagic(int magic, int type)
  { double l = 0; for(auto &o : S.open) if(o.magic == magic && o.sym == S.sym && o.type == type) l += o.lots; return l; }
static int CountRole(int role, int type = -1)
  { int n = 0; for(int i = 0; i < g_book.n; i++) if(g_book.role[i] == role && (type < 0 || g_book.type[i] == type)) n++; return n; }
static int LogCount(const string &needle)
  { int n = 0; for(auto &l : S.log) if(l.find(needle) != string::npos) n++; return n; }
static bool Init()
  {
   mkdir(S.fileDir.c_str(), 0777);
   SimRecordBar();
   return OnInit() == INIT_SUCCEEDED;
  }
static void Clean()
  {
   string cmd = "rm -rf " + S.fileDir;
   if(std::system(cmd.c_str()) != 0) {}
  }
static void Click(const string &key) { RM_OnButton(string(RM_DPFX) + key); }
static void VideoInputs()
  {
   InpScope = RM_SCOPE_ALL_SYMBOL; InpMagicList = "12345,54321,0";
   InpLocking = true; InpDeleteSLTP = RM_SLTP_LAUNCH_ONLY; InpLaunchMode = RM_LAUNCH_INSTANT;
   InpCloseProfitable = true; InpDeletePending = true;
   InpPartialLots = 0.03; InpPartialTPPoints = 30; InpOverlapThreshold = 2; InpBasketTP = false;
   InpSignalMode = RM_SIG_SIMPLE_GRID; InpRecoveryDirs = RM_DIRS_BOTH; InpFirstLot = 0.06; InpLotMultiplier = 1.3;
   InpGridStepPoints = 200; InpStepMultiplier = 1.0; InpOnePerBar = true; InpMultidirectional = false;
   InpMaxSlippage = 30; InpMaxSpread = 7500; InpMaxRecoveryLot = 100; InpMaxRecoveryCount = 100;
   InpRecoveryMagic = 9751421; InpFirstDirection = RM_FD_BUY; InpMinMarginLevel = 0;
  }
static void WalkTo(double target, double stepPts, int secs = 60)
  {
   double st = stepPts * S.point * (target > S.bid ? 1 : -1);
   for(int i = 0; i < 10000 && std::fabs(S.bid - target) > std::fabs(st); i++)
      Tick(S.bid + st, secs);
   Tick(target, secs);
  }
// realised net of all history rows for managed magics / tickets
static double HistNet()
  {
   double s = 0;
   for(auto &h : S.hist) if(h.sym == S.sym && h.type <= OP_SELL) s += h.profitFixed + h.comm + h.swap;
   return s;
  }

//====================================================================
static void S01_NoOrdersStaysIdle()
  {
   EXPECT(Init());
   for(int i = 0; i < 200; i++) Tick(1.1 + 0.001 * std::sin(i * 0.3), 600);
   EXPECT(S.open.empty());
   EXPECT(S.sendCalls == 0);
   EXPECT(g_state == RM_ST_IDLE);
   EXPECT(g_status == "No orders to recover");
   EXPECT(ObjectGetString(0, string(RM_DPFX) + "M_TOT_1", OBJPROP_TEXT) == "0");
  }

static void S02_OneLosingBuyLockGridClose()
  {
   VideoInputs();
   EXPECT(Init());
   int orig = SimOpen(OP_BUY, 0.10, 12345, "manual");
   Tick(1.09900);
   Hold(5);
   EXPECT(CountMagic(InpLockMagic) == 1);
   EXPECT(std::fabs(LotsMagic(InpLockMagic, OP_SELL) - 0.10) < 1e-9);
   EXPECT(CountRole(RM_ROLE_ORIGINAL) == 1 && CountRole(RM_ROLE_LOCK) == 1);
   Hold(20);
   EXPECT(CountMagic(InpLockMagic) == 1);                      // never a duplicate lock
   EXPECT(g_state == RM_ST_RECOVERING);
   EXPECT(CountMagic(InpRecoveryMagic) == 1);                  // first recovery (BUY) opened
   EXPECT(std::fabs(LotsMagic(InpRecoveryMagic, OP_BUY) - 0.06) < 1e-9);
   // adverse move of 200+ points within the same bar: one order per bar
   S.now = SimBar(S.now) + 3600 * 1 + 60;                      // new bar
   Tick(S.bid - 0.00050);
   int before = CountMagic(InpRecoveryMagic);
   Tick(S.bid - 0.00220, 30);
   EXPECT(CountMagic(InpRecoveryMagic) == before + 1);
   EXPECT(std::fabs(LotsMagic(InpRecoveryMagic, OP_BUY) - (0.06 + 0.07)) < 1e-9);   // 0.078 -> 0.07
   Tick(S.bid - 0.00250, 30);                                  // same bar, next level
   EXPECT(CountMagic(InpRecoveryMagic) == before + 1);
   EXPECT(LogCount("one order per bar") >= 0);
   // favourable move until the group closes
   std::vector<int> basket;
   for(auto &o : S.open) if(o.magic == InpRecoveryMagic) basket.push_back(o.ticket);
   double startHist = HistNet();
   int closesBefore = (int)S.hist.size();
   for(int i = 0; i < 400 && (int)S.hist.size() == closesBefore; i++)
      Tick(S.bid + 0.00010, 120);
   EXPECT((int)S.hist.size() > closesBefore);
   Hold(3);
   for(int bt : basket) EXPECT(SimFindOpen(bt) == nullptr);   // whole basket closed
   EXPECT(CountMagic(InpRecoveryMagic) <= 1);                  // a new basket may start afterwards
   EXPECT(std::fabs(LotsMagic(12345, OP_BUY) - 0.07) < 1e-9);  // original sliced by 0.03
   EXPECT(std::fabs(LotsMagic(InpLockMagic, OP_SELL) - 0.07) < 1e-9);
   EXPECT(CountRole(RM_ROLE_ORIGINAL) == 1 && CountRole(RM_ROLE_LOCK) == 1);   // lineage inherited
   EXPECT(g_state == RM_ST_RECOVERING);
   EXPECT(std::fabs(g_realizedSession - (HistNet() - startHist)) < 0.01);   // counted once
   EXPECT(g_lastPlanReal >= 0.0);
   EXPECT(LogCount("PLAN_DONE") == 1);
   (void)orig;
  }

static void S03_UnbalancedMixAndUnrelatedOrders()
  {
   VideoInputs();
   InpScope = RM_SCOPE_ALL_SYMBOL; InpExcludeMagics = "777";
   InpCloseProfitable = false;                              // pure lock sizing (S17 covers financing)
   EXPECT(Init());
   SimOpen(OP_BUY, 0.30, 0, "m1");
   SimOpen(OP_SELL, 0.10, 0, "m2");
   int other = SimOpen(OP_BUY, 0.50, 0, "other symbol", "GBPUSD");
   int excl = SimOpen(OP_SELL, 0.20, 777, "other EA");
   Tick(1.09950);
   Hold(10);
   EXPECT(std::fabs(LotsMagic(InpLockMagic, OP_SELL) - 0.20) < 1e-9);
   EXPECT(std::fabs(LotsMagic(InpLockMagic, OP_BUY)) < 1e-9);
   EXPECT(std::fabs(g_tot.mainBuyLots - g_tot.mainSellLots) < 1e-9);
   EXPECT(RM_RegFind(other) < 0 && RM_RegFind(excl) < 0);
   EXPECT(SimFindOpen(other) && std::fabs(SimFindOpen(other)->lots - 0.50) < 1e-9);
   EXPECT(SimFindOpen(excl) && std::fabs(SimFindOpen(excl)->lots - 0.20) < 1e-9);
   // close-all only touches managed tickets
   InpConfirmActions = false;
   Click("CLOSEALL");
   Hold(5);
   EXPECT(g_tot.totalCnt == 0);
   EXPECT(SimFindOpen(other) != nullptr && SimFindOpen(excl) != nullptr);
   Hold(2);
   EXPECT(g_state == RM_ST_IDLE);
  }

static void S04_RestartMidLockDoesNotRepeatLaunch()
  {
   S.testing = false;                       // keep the state file across restarts
   VideoInputs();
   EXPECT(Init());
   int t = SimOpen(OP_BUY, 0.10, 12345, "manual");
   SimFindOpen(t)->sl = 1.08; SimFindOpen(t)->tp = 1.12;
   int pend = SimOpen(OP_BUYLIMIT, 0.10, 12345, "pending");
   Tick(1.09950);
   Hold(3);
   EXPECT(SimFindOpen(pend) == nullptr);    // launch clean-up deleted it
   EXPECT(SimFindOpen(t)->sl == 0.0 && SimFindOpen(t)->tp == 0.0);
   EXPECT(CountMagic(InpLockMagic) == 1);
   EXPECT(LogCount("PENDING_DELETED") == 1);
   // timeframe change: deinit + init on the same chart
   OnDeinit(REASON_CHARTCHANGE);
   int pend2 = SimOpen(OP_BUYLIMIT, 0.10, 12345, "pending2");
   SimFindOpen(t)->sl = 1.07;
   EXPECT(Init());
   Hold(10);
   EXPECT(SimFindOpen(pend2) != nullptr);   // clean-up NOT repeated
   EXPECT(SimFindOpen(t)->sl == 1.07);      // SL/TP removal NOT repeated (launch-only mode)
   EXPECT(CountMagic(InpLockMagic) == 1);   // no duplicate lock
   EXPECT(LogCount("-> PREPARING") == 1);
   EXPECT(g_launchDone);
   OnDeinit(REASON_REMOVE);
   Clean();
  }

static void S05_ClosureFailureAndRestartMidTransaction()
  {
   S.testing = false;
   VideoInputs();
   EXPECT(Init());
   SimOpen(OP_BUY, 0.10, 12345, "manual");
   Tick(1.09900);
   Hold(5);
   EXPECT(CountMagic(InpRecoveryMagic) == 1);
   // make the next closure succeed on its first leg, then fail
   int histBefore = (int)S.hist.size();
   double hnBefore = HistNet();
   double realizedBefore = g_realizedSession;
   // stop just before the group qualifies (previews are computed from the same snapshot)
   bool ready = false;
   InpPartialTPPoints = 100000;                            // hold closures while walking up
   for(int i = 0; i < 400 && !ready; i++)
     {
      Tick(S.bid + 0.00010, 120);
      g_cfg.partialTPPoints = 30;
      RM_UpdatePreviews(true);
      ready = g_curGroup.qualifies;
      g_cfg.partialTPPoints = 100000;
     }
   EXPECT(ready);
   g_cfg.partialTPPoints = 30;
   // first leg (most profitable: recovery) succeeds, all retries of leg 2 fail
   S.failCloseErr = ERR_REQUOTE;
   g_simFailAfterOk = 1; g_simFailCount = 3;              // RM_Close retries 3x per attempt
   Tick(S.bid, 60);
   EXPECT(RM_JournalOpen());
   EXPECT((int)S.hist.size() == histBefore + 1);
   EXPECT(LogCount("LEG_FAILED") == 1);
   // disconnect: no attempts are burned while trading is impossible
   S.connected = false;
   Hold(3);
   EXPECT(g_journal.attempts == 1);
   S.connected = true;
   // crash / restart mid-transaction
   OnDeinit(REASON_CLOSE);
   EXPECT(Init());
   EXPECT(RM_JournalOpen());
   Hold(3);
   EXPECT(!RM_JournalOpen());
   EXPECT(LogCount("PLAN_DONE") == 1);
   EXPECT(std::fabs((g_realizedSession - realizedBefore) - (HistNet() - hnBefore)) < 0.01);   // once
   EXPECT(g_state != RM_ST_ERROR_HOLD);
   EXPECT(CountRole(RM_ROLE_ORIGINAL) == 1 && CountRole(RM_ROLE_LOCK) == 1);
   OnDeinit(REASON_REMOVE);
   Clean();
  }

static void S06_ExternalCloseAndPartial()
  {
   VideoInputs();
   EXPECT(Init());
   int orig = SimOpen(OP_BUY, 0.10, 12345, "manual");
   Tick(1.09900);
   Hold(5);
   int lock = -1;
   for(auto &o : S.open) if(o.magic == InpLockMagic) lock = o.ticket;
   EXPECT(lock > 0);
   // operator partially closes the original outside the EA
   OrderClose(orig, 0.04, S.bid, 0, 0);
   Tick(S.bid);
   EXPECT(LogCount("EXTERNAL_PARTIAL") == 1);
   EXPECT(CountRole(RM_ROLE_ORIGINAL) == 1);
   EXPECT(std::fabs(g_tot.origLots - 0.06) < 1e-9);          // remainder read from the child, not the parent
   Hold(5);
   // net = 0.06 - 0.10 = -0.04 -> exactly one BUY hedge of 0.04, nothing more
   EXPECT(std::fabs(LotsMagic(InpLockMagic, OP_BUY) - 0.04) < 1e-9);
   EXPECT(std::fabs(LotsMagic(InpLockMagic, OP_SELL) - 0.10) < 1e-9);
   EXPECT(std::fabs(g_tot.mainBuyLots - g_tot.mainSellLots) < 1e-9);
   // operator fully closes the lock
   OrderClose(lock, 0.10, SimAsk(), 0, 0);
   Hold(2);
   EXPECT(LogCount("EXTERNAL_CLOSE") >= 1);
   Hold(5);
   EXPECT(std::fabs(g_tot.mainBuyLots - g_tot.mainSellLots) < 1e-9);
   EXPECT(g_state != RM_ST_ERROR_HOLD);
  }

static void S07_PauseResume()
  {
   VideoInputs();
   EXPECT(Init());
   SimOpen(OP_BUY, 0.10, 12345, "manual");
   Tick(1.09900);
   Hold(5);
   int rec = CountMagic(InpRecoveryMagic);
   EXPECT(rec == 1);
   Click("STOP");
   EXPECT(g_state == RM_ST_PAUSED);
   for(int i = 0; i < 30; i++) Tick(S.bid - 0.00030, 3600);   // far past several grid levels
   EXPECT(CountMagic(InpRecoveryMagic) == rec);                 // nothing opened while paused
   EXPECT(ObjectGetString(0, string(RM_DPFX) + "STOP", OBJPROP_TEXT) == "Resume");
   Click("STOP");
   Hold(2, 3600);
   EXPECT(g_state == RM_ST_RECOVERING);
   EXPECT(CountMagic(InpRecoveryMagic) == rec + 1);             // gap guard: one entry, not a burst
  }

static void S08_EmergencyBeatsPause()
  {
   VideoInputs();
   InpEmergencyMode = RM_EMG_MONEY; InpEmergencyValue = 60; InpEmergencyAction = RM_EMGA_CLOSE_ALL;
   InpEmergencyOverPause = true;
   EXPECT(Init());
   SimOpen(OP_BUY, 0.10, 12345, "manual");
   Tick(1.09900);
   Hold(5);
   Click("STOP");
   EXPECT(g_state == RM_ST_PAUSED);
   WalkTo(1.09000, 50, 600);                                   // recovery BUY + locked loss grow
   Hold(5);
   EXPECT(LogCount("EMERGENCY") >= 1);
   EXPECT(g_tot.totalCnt == 0);
   EXPECT(g_state == RM_ST_IDLE);
  }

static void S09_MultidirectionalOff()
  {
   VideoInputs();
   InpFirstDirection = RM_FD_LAST_CANDLE;
   EXPECT(Init());
   SimOpen(OP_BUY, 0.10, 12345, "manual");
   bool both = false;
   for(int i = 0; i < 600; i++)
     {
      Tick(1.1 + 0.004 * std::sin(i * 0.05), 900);
      if(g_tot.recBuyCnt > 0 && g_tot.recSellCnt > 0) both = true;
     }
   EXPECT(!both);
   EXPECT(g_state != RM_ST_ERROR_HOLD);
  }

static void S10_LaunchThresholdOnce()
  {
   VideoInputs();
   InpLaunchMode = RM_LAUNCH_DD_MONEY; InpLaunchDrawdown = 20;
   EXPECT(Init());
   SimOpen(OP_BUY, 0.10, 12345, "manual");
   Tick(1.09950);
   Hold(3);
   EXPECT(g_state == RM_ST_ARMED);
   EXPECT(CountMagic(InpLockMagic) == 0);
   Tick(1.09750);                                             // 0.10 lot, -26 USD
   Hold(3);
   EXPECT(g_launchDone);
   Tick(1.10200); Hold(3); Tick(1.09700); Hold(3);
   EXPECT(LogCount("ARMED -> PREPARING") == 1);
  }

static void S11_InsufficientMarginBlocks()
  {
   VideoInputs();
   EXPECT(Init());
   SimOpen(OP_BUY, 0.10, 12345, "manual");
   S.marginPerLot = 60000;                                   // 0.10 lot already uses 6000
   Tick(1.09900);
   Hold(5);
   EXPECT(CountMagic(InpLockMagic) == 0);
   EXPECT(g_state == RM_ST_LOCKING);
   EXPECT(g_status.find("Lock blocked") == 0);
   EXPECT(CountMagic(InpRecoveryMagic) == 0);
   S.marginPerLot = 1000;
   Hold(3);
   EXPECT(CountMagic(InpLockMagic) == 1);
  }

static void S12_UncertainReplyNoDuplicate()
  {
   VideoInputs();
   EXPECT(Init());
   SimOpen(OP_BUY, 0.10, 12345, "manual");
   S.uncertainSends = 1;                                     // lock order is created but reply is lost
   Tick(1.09900);
   Hold(6);
   EXPECT(CountMagic(InpLockMagic) == 1);
   EXPECT(CountRole(RM_ROLE_LOCK) == 1);
  }

static void S13_ManualPanelAndValidation()
  {
   VideoInputs();
   InpConfirmActions = true;
   EXPECT(Init());
   Tick(1.10000);
   ObjectSetString(0, string(RM_DPFX) + "LOT", OBJPROP_TEXT, "0.013");
   Click("BUY");
   EXPECT(S.open.empty());
   EXPECT(g_uiMsg.find("rejected volume") == 0);
   ObjectSetString(0, string(RM_DPFX) + "LOT", OBJPROP_TEXT, "0.05");
   Click("BUY");
   EXPECT(g_pendingAct == RM_ACT_OPEN_BUY);
   EXPECT(ObjectFind(0, string(RM_DPFX) + "K_BG") == 0);      // confirmation preview shown
   EXPECT(S.open.empty());
   Click("OK");
   EXPECT(S.open.size() == 1 && S.open[0].magic == InpManualOriginalMagic);
   EXPECT(S.open[0].comment.find("RMP1 O") == 0);
   Hold(4);
   EXPECT(CountRole(RM_ROLE_ORIGINAL) == 1);
   EXPECT(CountMagic(InpLockMagic) == 1);                    // the manual ORIGINAL got recovered
   Hold(3);
   EXPECT(g_tot.recBuyCnt == 1);                             // automatic BUY basket started
   // role toggle -> manual RECOVERY order
   Click("ROLE");
   EXPECT(g_uiRecoveryRole);
   Click("SELL");
   Click("OK");
   EXPECT(g_tot.recSellCnt == 0);                            // BUY basket active, multidirectional off
   EXPECT(g_uiMsg.find("multidirectional") != string::npos);
  }

static void S14_DashboardReconciles()
  {
   VideoInputs();
   EXPECT(Init());
   SimOpen(OP_BUY, 0.10, 12345, "manual");
   SimOpen(OP_BUY, 0.20, 999, "unmanaged? no: ALL scope adopts");
   Tick(1.09900);
   Hold(5);
   S.now = SimBar(S.now) + 3660; Tick(S.bid - 0.00210);
   Hold(1);
   double pl = 0, lots = 0; int cnt = 0;
   for(auto &o : S.open)
     {
      if(o.sym != S.sym) continue;
      cnt++; lots += o.lots; pl += SimProfit(o) + o.swap + o.comm;
     }
   RM_DashRefresh(true);
   EXPECT(g_tot.totalCnt == cnt);
   EXPECT(std::fabs(g_tot.totalLots - lots) < 1e-9);
   EXPECT(std::fabs(g_tot.totalPL - pl) < 1e-6);
   EXPECT(ObjectGetString(0, string(RM_DPFX) + "M_TOT_1", OBJPROP_TEXT) == std::to_string(cnt));
   EXPECT(ObjectGetString(0, string(RM_DPFX) + "M_TOT_3", OBJPROP_TEXT) == DoubleToString(pl, 2));
   EXPECT(std::fabs(g_tot.mainBuyPL + g_tot.mainSellPL + g_tot.recBuyPL + g_tot.recSellPL - pl) < 1e-6);
  }

static void S15_OnePerBarSurvivesRestart()
  {
   S.testing = false;
   VideoInputs();
   EXPECT(Init());
   SimOpen(OP_BUY, 0.10, 12345, "manual");
   Tick(1.09900);
   Hold(4, 10);
   EXPECT(CountMagic(InpRecoveryMagic) == 1);
   datetime bar = SimBar(S.now);
   OnDeinit(REASON_PARAMETERS);
   EXPECT(Init());
   Tick(S.bid - 0.00300, 5);                                  // same bar, beyond the next level
   EXPECT(SimBar(S.now) == bar);
   EXPECT(CountMagic(InpRecoveryMagic) == 1);
   S.now = bar + 3600;
   Tick(S.bid, 5);
   EXPECT(CountMagic(InpRecoveryMagic) == 2);
   OnDeinit(REASON_REMOVE);
   Clean();
  }

static void S16_ReduceVolumePreview()
  {
   VideoInputs();
   InpLocking = false; InpCloseProfitable = false; InpRecoveryDirs = RM_DIRS_NONE;
   InpConfirmActions = false;
   EXPECT(Init());
   SimOpen(OP_BUY, 0.30, 0, "loser");
   Tick(1.09700);                                            // buy at 1.10010 -> -93 USD
   SimOpen(OP_SELL, 0.10, 0, "winner");                       // sold at 1.09700
   Tick(1.09400);                                            // winner +30, loser -183
   Hold(3);
   EXPECT(g_reducePreview.n >= 2);
   EXPECT(g_reducePreview.expectedNet >= 0);
   double lotsBefore = g_tot.mainBuyLots;
   Click("REDUCE");
   Hold(2);
   EXPECT(g_tot.mainBuyLots < lotsBefore - 1e-9);
   EXPECT(g_tot.mainSellCnt == 0);
   EXPECT(CountMagic(InpRecoveryMagic) == 0);                 // automatic entries disabled
  }

static void S17_LaunchFinancing()
  {
   VideoInputs();
   InpCloseProfitable = true;
   EXPECT(Init());
   SimOpen(OP_BUY, 0.30, 0, "loser");
   SimOpen(OP_SELL, 0.10, 0, "winner");
   Tick(1.09950);
   Hold(6);
   EXPECT(LogCount("LAUNCH_FINANCE") >= 1);
   EXPECT(std::fabs(g_lastPlanEst - g_lastPlanReal) < 0.01);  // estimate matched the fill
   EXPECT(g_lastPlanReal >= -1e-9);                          // financing never realises a net loss
   EXPECT(g_tot.origCnt == 1);                               // the profitable SELL was used up
   EXPECT(std::fabs(g_tot.mainBuyLots - g_tot.mainSellLots) < 1e-9);   // then locked
   EXPECT(std::fabs(LotsMagic(InpLockMagic, OP_SELL) - g_tot.origLots) < 1e-9);
  }

static void S18_OverlapKeepsMiddleOrders()
  {
   VideoInputs();
   InpOverlapThreshold = 3;                                  // overlap from 3 recovery orders
   EXPECT(Init());
   SimOpen(OP_BUY, 0.50, 12345, "big loser");
   Tick(1.09900);
   Hold(5);
   for(int k = 0; k < 3; k++)
     {
      S.now = SimBar(S.now) + 3600;
      Tick(S.bid - 0.00205, 10);
     }
   Hold(1);
   EXPECT(g_tot.recBuyCnt == 4);
   std::vector<int> rec;
   for(auto &o : S.open) if(o.magic == InpRecoveryMagic) rec.push_back(o.ticket);
   int before = (int)S.hist.size();
   for(int i = 0; i < 600 && (int)S.hist.size() == before; i++)
      Tick(S.bid + 0.00005, 20);                           // stay inside the bar-hour mostly
   EXPECT(LogCount("OVERLAP:") == 1);
   EXPECT(SimFindOpen(rec.front()) == nullptr && SimFindOpen(rec.back()) == nullptr);
   EXPECT(SimFindOpen(rec[1]) != nullptr && SimFindOpen(rec[2]) != nullptr);   // intermediate kept
   EXPECT(std::fabs(g_tot.mainBuyLots - 0.47) < 1e-9);       // one 0.03 matched slice
   EXPECT(std::fabs(g_tot.mainBuyLots - g_tot.mainSellLots) < 1e-9);
   EXPECT(g_state == RM_ST_RECOVERING);
   EXPECT(RM_NextGridIndex(RM_BUY) == g_tot.recBuyCnt);      // RECOUNT mode
  }

static void S19_WholeBasketTP()
  {
   VideoInputs();
   InpBasketTP = true; InpBasketTPMoney = 5.0;
   InpPartialTPPoints = 100000;                             // no partial closures: isolate basket exit
   EXPECT(Init());
   SimOpen(OP_BUY, 0.10, 12345, "manual");
   Tick(1.09990);
   Hold(5);
   EXPECT(g_tot.recBuyCnt == 1);
   for(int i = 0; i < 400 && g_tot.totalCnt > 0; i++)
      Tick(S.bid + 0.00010, 120);
   EXPECT(LogCount("BASKET_TP") == 1);
   EXPECT(g_tot.totalCnt == 0);
   Hold(2);
   EXPECT(g_state == RM_ST_IDLE);
   EXPECT(g_status == "No orders to recover");
   EXPECT(g_realizedSession >= 5.0 - 0.5);                  // realised about the target (execution at next tick)
  }

static void S20_UnresolvedLineageHoldsThenResume()
  {
   VideoInputs();
   EXPECT(Init());
   SimOpen(OP_BUY, 0.10, 12345, "manual");
   Tick(1.09900);
   Hold(5);
   S.hideRemainderComment = true;                           // broker drops the "from #" marker
   int before = (int)S.hist.size();
   for(int i = 0; i < 400 && (int)S.hist.size() == before; i++)
      Tick(S.bid + 0.00010, 30);
   Hold(4, 30);                                              // > 60 s without a visible remainder
   EXPECT(g_state == RM_ST_ERROR_HOLD);
   EXPECT(g_status.find("ERROR HOLD") == 0);
   int sends = S.sendCalls;
   for(int i = 0; i < 20; i++) Tick(S.bid - 0.00030, 3600);  // grid levels crossed
   EXPECT(S.sendCalls == sends);                             // nothing traded while held
   Click("STOP");                                            // operator resume
   Hold(2);
   EXPECT(g_state != RM_ST_ERROR_HOLD);
   EXPECT(LogCount("LINEAGE_DROPPED") >= 1);
  }

static bool OnScreen(const string &key)
  {
   string n = string(RM_DPFX) + key;
   if(ObjectFind(0, n) < 0) return false;
   long x = ObjectGetInteger(0, n, OBJPROP_XDISTANCE), y = ObjectGetInteger(0, n, OBJPROP_YDISTANCE);
   long w = ObjectGetInteger(0, n, OBJPROP_XSIZE), h = ObjectGetInteger(0, n, OBJPROP_YSIZE);
   return x >= 0 && y >= 0 && x + w <= S.chartW && y + h <= S.chartH;
  }

static void S21_ShortChartKeepsPanelsVisible()
  {
   S.chartW = 2000; S.chartH = 730;                         // user's screen: tall main panel, short chart
   VideoInputs();
   InpFontSize = 8; InpShowAccountBlock = true; InpConfirmActions = true;
   EXPECT(Init());
   Tick(1.10000);
   EXPECT(OnScreen("G_BG"));                                // current-group panel visible
   EXPECT(OnScreen("C_BG"));                                // manual panel visible
   Click("BUY");
   EXPECT(g_pendingAct == RM_ACT_OPEN_BUY);
   EXPECT(OnScreen("K_BG") && OnScreen("OK") && OnScreen("CANCEL"));
   Click("SELL");                                           // replaces the unconfirmed BUY
   EXPECT(g_pendingAct == RM_ACT_OPEN_SELL);
   EXPECT(OnScreen("OK"));
   Click("OK");
   EXPECT(S.open.size() == 1 && S.open[0].type == OP_SELL);
   // narrow chart: the box falls back under the main panel but stays on screen
   OnDeinit(REASON_REMOVE);
   S.chartW = 700; S.chartH = 730;
   EXPECT(Init());
   Tick(1.10000);
   Click("BUY");
   EXPECT(OnScreen("OK") && OnScreen("K_BG"));
  }

//====================================================================
typedef void (*ScenarioFn)();
struct Scenario { const char *name; ScenarioFn fn; };
static Scenario g_scen[] = {
   {"S01 no eligible orders: EA stays idle", S01_NoOrdersStaysIdle},
   {"S02 one losing BUY: lock, grid lots, one-per-bar, group close, lineage", S02_OneLosingBuyLockGridClose},
   {"S03 unbalanced mix + unrelated symbol/magic untouched + close all scope", S03_UnbalancedMixAndUnrelatedOrders},
   {"S04 restart mid-lock does not repeat launch actions", S04_RestartMidLockDoesNotRepeatLaunch},
   {"S05 closure failure after 1 leg + disconnect + restart: profit counted once", S05_ClosureFailureAndRestartMidTransaction},
   {"S06 external partial close + external lock close: lineage and re-lock", S06_ExternalCloseAndPartial},
   {"S07 pause blocks automation; resume without catch-up burst", S07_PauseResume},
   {"S08 emergency close-all overrides pause", S08_EmergencyBeatsPause},
   {"S09 multidirectional off never holds two recovery baskets", S09_MultidirectionalOff},
   {"S10 money-drawdown launch triggers exactly once", S10_LaunchThresholdOnce},
   {"S11 insufficient margin blocks the lock with a visible reason", S11_InsufficientMarginBlocks},
   {"S12 uncertain broker reply does not duplicate an order", S12_UncertainReplyNoDuplicate},
   {"S13 manual panel: validation, confirmation, roles", S13_ManualPanelAndValidation},
   {"S14 dashboard totals reconcile with broker orders", S14_DashboardReconciles},
   {"S15 one-order-per-bar survives restart", S15_OnePerBarSurvivesRestart},
   {"S16 reduce volume executes only a net-non-negative plan", S16_ReduceVolumePreview},
   {"S17 close-profitable-at-launch finances a loser reduction, then locks", S17_LaunchFinancing},
   {"S18 overlap closes first+last recovery orders and keeps the middle ones", S18_OverlapKeepsMiddleOrders},
   {"S19 whole-basket TP closes every role and ends the session", S19_WholeBasketTP},
   {"S20 unresolved partial-close lineage -> ERROR_HOLD -> operator resume", S20_UnresolvedLineageHoldsThenResume},
   {"S21 short chart: confirmation box and panels stay on screen", S21_ShortChartKeepsPanelsVisible},
};

int main(int argc, char **argv)
  {
   int n = (int)(sizeof(g_scen) / sizeof(g_scen[0]));
   if(argc < 2) { std::printf("%d\n", n); return 0; }
   int i = std::atoi(argv[1]);
   if(i < 0 || i >= n) return 77;
   S.fileDir = string("/tmp/rmp_sim_files_") + std::to_string(i);
   Clean();
   if(argc > 2) S.verbose = true;
   g_scen[i].fn();
   std::printf("%-78s %s (%d checks)\n", g_scen[i].name, s_fail ? "FAIL" : "ok", s_pass + s_fail);
   Clean();
   return s_fail ? 1 : 0;
  }

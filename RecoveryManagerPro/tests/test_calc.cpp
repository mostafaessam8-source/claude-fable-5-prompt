// test_calc.cpp - native calculation tests for the portable Recovery Manager Pro
// headers. Build & run: ./tests/run_tests.sh
//
// These compile the SAME RM_Types.mqh / RM_Calc.mqh / RM_Planner.mqh files
// that the MQL4 Expert Advisor includes. They verify arithmetic, planning,
// journal and state-transition logic; they do NOT exercise the MT4 trade API
// (see docs/VISUAL_TEST_PROCEDURES.md for terminal tests).
#include "mql4_shim.h"
#include <cstdio>
#include <cstring>
#include <string>

#include "RM_Types.mqh"
#include "RM_Calc.mqh"
#include "RM_Planner.mqh"
#include "mql4_shim_str.h"
#include "RM_Distance.mqh"

static int g_pass = 0, g_fail = 0;
static std::string g_case;

#define CHECK(cond) do { if(cond) g_pass++; else { g_fail++; \
   std::printf("  FAIL [%s] line %d: %s\n", g_case.c_str(), __LINE__, #cond); } } while(0)
#define NEAR(a, b) (std::fabs((double)(a) - (double)(b)) < 1e-6)
#define CASE(name) g_case = name; std::printf("- %s\n", name)

static RM_SymbolMeta Forex5()
  {
   RM_SymbolMeta m; m.point = 0.00001; m.tickSize = 0.00001; m.tickValue = 1.0;
   m.minLot = 0.01; m.maxLot = 100.0; m.lotStep = 0.01; return m;
  }

static void BookClear(RM_Book &b) { std::memset(&b, 0, sizeof(b)); b.n = 0; }
static int Add(RM_Book &b, int ticket, int role, int type, double lots, double profit,
               double swap = 0, double comm = 0, long t = 0)
  {
   int i = b.n++;
   b.ticket[i] = ticket; b.role[i] = role; b.type[i] = type; b.lots[i] = lots;
   b.profit[i] = profit; b.swap[i] = swap; b.comm[i] = comm;
   b.openTime[i] = t ? t : ticket; b.openPrice[i] = 1.0; b.gridIndex[i] = 0;
   return i;
  }

static RM_PlanConfig Cfg()
  {
   RM_PlanConfig c; c.priority = RM_PRIO_EASY_FIRST; c.firstTicket = 0;
   c.partialLots = 0.03; c.partialTPPoints = 30; c.tpBasis = RM_TPB_RECOVERY_LOTS;
   c.fullCommission = false; c.extraCommPerLot = 0; c.execBufferPoints = 0;
   c.overlapEnabled = true; c.overlapThreshold = 2; c.overlapCompare = RM_OVL_GE;
   c.matchedMain = true; return c;
  }

static bool LegalRemainders(const RM_Plan &p, const RM_SymbolMeta &m)
  {
   for(int k = 0; k < p.n; k++)
     {
      if(p.closeLots[k] < m.minLot - 1e-9) return false;
      if(p.residual[k] > 1e-9 && p.residual[k] < m.minLot - 1e-9) return false;
      double st = p.closeLots[k] / m.lotStep;
      if(std::fabs(st - std::round(st)) > 1e-6) return false;
     }
   return true;
  }

static RM_Plan P;   // large structs kept static
static RM_Book B;

int main()
  {
   std::printf("Recovery Manager Pro - calculation tests\n");
   RM_SymbolMeta fx = Forex5();

   CASE("T08 lot multiplication uses unrounded base (0.06 x 1.3)");
   {
      double r1 = RM_GridRawLot(0.06, 1.3, 1);
      CHECK(NEAR(r1, 0.078));
      CHECK(NEAR(RM_NormalizeLot(r1, fx, RM_ROUND_DOWN), 0.07));
      CHECK(NEAR(RM_NormalizeLot(r1, fx, RM_ROUND_NEAREST), 0.08));
      double r2 = RM_GridRawLot(0.06, 1.3, 2);          // 0.1014
      CHECK(NEAR(r2, 0.1014));
      CHECK(NEAR(RM_NormalizeLot(r2, fx, RM_ROUND_DOWN), 0.10));
      // compounding the rounded value would give 0.07*1.3 = 0.091 -> 0.09 (wrong)
      CHECK(!NEAR(RM_NormalizeLot(0.07 * 1.3, fx, RM_ROUND_DOWN), RM_NormalizeLot(r2, fx, RM_ROUND_DOWN)));
      CHECK(NEAR(RM_GridRawLot(0.06, 1.3, 0), 0.06));
      CHECK(NEAR(RM_NormalizeLot(0.004, fx, RM_ROUND_DOWN), 0.0));     // below min -> not executable
      CHECK(NEAR(RM_NormalizeLot(250.0, fx, RM_ROUND_DOWN), 100.0));   // clamp at broker max
      CHECK(RM_LotExceedsCap(0.11, 0.10));
      CHECK(!RM_LotExceedsCap(0.10, 0.10));
      CHECK(!RM_LotExceedsCap(5.0, 0.0));                              // 0 = no cap
      // binary noise: 0.3/0.1 must not floor to 2 steps
      RM_SymbolMeta m = fx; m.lotStep = 0.1; m.minLot = 0.1;
      CHECK(NEAR(RM_NormalizeLot(0.1 + 0.2, m, RM_ROUND_DOWN), 0.3));
   }

   CASE("Grid step spacing and trigger levels");
   {
      CHECK(NEAR(RM_GridStepPoints(200, 1.0, 1), 200));
      CHECK(NEAR(RM_GridStepPoints(200, 1.0, 5), 200));
      CHECK(NEAR(RM_GridStepPoints(200, 1.5, 3), 450));
      CHECK(NEAR(RM_GridStepPoints(200, 1.5, 0), 0));
      double lvB = RM_GridNextLevel(RM_BUY, 1.25000, 200, 0.00001);
      double lvS = RM_GridNextLevel(RM_SELL, 1.25000, 200, 0.00001);
      CHECK(NEAR(lvB, 1.24800));
      CHECK(NEAR(lvS, 1.25200));
      CHECK(RM_GridTriggered(RM_BUY, 1.24790, 1.24800, lvB));
      CHECK(!RM_GridTriggered(RM_BUY, 1.24795, 1.24805, lvB));
      CHECK(RM_GridTriggered(RM_SELL, 1.25200, 1.25210, lvS));
      CHECK(!RM_GridTriggered(RM_SELL, 1.25190, 1.25200, lvS));
   }

   CASE("T07 point-to-money conversion (Forex and non-standard tick size)");
   {
      CHECK(NEAR(RM_MoneyPerPointPerLot(1.0, 0.00001, 0.00001), 1.0));      // EURUSD 5-digit
      CHECK(NEAR(RM_MoneyPerPointPerLot(0.6523, 0.001, 0.001), 0.6523));    // USDJPY 3-digit, USD acct
      CHECK(NEAR(RM_MoneyPerPointPerLot(12.5, 0.25, 0.01), 0.5));           // index: tick 0.25, point 0.01
      CHECK(NEAR(RM_MoneyPerPointPerLot(5.0, 0.5, 0.1), 1.0));              // tick 5 points
      CHECK(NEAR(RM_MoneyPerPointPerLot(0.0, 0.25, 0.01), 0.0));            // guard
      CHECK(NEAR(RM_MoneyPerPointPerLot(1.0, 0.0, 0.01), 0.0));             // guard
      // 30 points on 0.06 recovery lots, EURUSD: 30 * 1.0 * 0.06 = 1.80 (not 30 USD, not 30 pips)
      CHECK(NEAR(RM_TargetMoney(30, 1.0, 0.06), 1.80));
      // same 30 points on the index: 30 * 0.5 * 0.06 = 0.90
      CHECK(NEAR(RM_TargetMoney(30, 0.5, 0.06), 0.90));
      CHECK(NEAR(RM_TargetMoney(0, 1.0, 0.06), 0.0));
   }

   CASE("T04 launch thresholds (instant, percent, money, zero-balance guard)");
   {
      CHECK(RM_LaunchTriggered(RM_LAUNCH_INSTANT, 0, 10000, 35, true));
      CHECK(!RM_LaunchTriggered(RM_LAUNCH_INSTANT, 0, 10000, 35, false));      // no eligible orders
      CHECK(!RM_LaunchTriggered(RM_LAUNCH_DD_PERCENT, -3499, 10000, 35, true));
      CHECK(RM_LaunchTriggered(RM_LAUNCH_DD_PERCENT, -3500, 10000, 35, true));
      CHECK(!RM_LaunchTriggered(RM_LAUNCH_DD_PERCENT, -3500, 0, 35, true));    // zero balance
      CHECK(RM_LaunchTriggered(RM_LAUNCH_DD_MONEY, -35, 10000, 35, true));
      CHECK(!RM_LaunchTriggered(RM_LAUNCH_DD_MONEY, +500, 10000, 35, true));   // profit is no DD
      CHECK(NEAR(RM_Drawdown(120.5), 0.0));
      CHECK(NEAR(RM_DrawdownPercent(-250, 10000), 2.5));
   }

   CASE("T09 one-order-per-bar gate survives retry/restart (persisted bar id)");
   {
      long bar = 1700000000;
      long persisted = 0;
      CHECK(RM_BarGateOpen(true, persisted, bar));
      persisted = bar;                                  // written after confirmed fill
      CHECK(!RM_BarGateOpen(true, persisted, bar));     // retry in same bar
      long reloaded = persisted;                        // restart: value reloaded from state file
      CHECK(!RM_BarGateOpen(true, reloaded, bar));
      CHECK(RM_BarGateOpen(true, reloaded, bar + 3600));
      CHECK(RM_BarGateOpen(false, reloaded, bar));
   }

   CASE("T10 multidirectional off blocks opposite basket; direction modes");
   {
      CHECK(RM_DirectionAllowed(RM_BUY, RM_DIRS_BOTH, false, false, 0, 0));
      CHECK(!RM_DirectionAllowed(RM_SELL, RM_DIRS_BOTH, false, false, 2, 0));
      CHECK(RM_DirectionAllowed(RM_BUY, RM_DIRS_BOTH, false, false, 2, 0));    // same basket continues
      CHECK(RM_DirectionAllowed(RM_SELL, RM_DIRS_BOTH, false, true, 2, 0));    // multidirectional on
      CHECK(!RM_DirectionAllowed(RM_SELL, RM_DIRS_BUY_ONLY, false, true, 0, 0));
      CHECK(!RM_DirectionAllowed(RM_BUY, RM_DIRS_SELL_ONLY, false, true, 0, 0));
      CHECK(!RM_DirectionAllowed(RM_BUY, RM_DIRS_NONE, false, true, 0, 0));
      CHECK(RM_DirectionAllowed(RM_BUY, RM_DIRS_NONE, true, true, 0, 0));      // manual entry allowed
      CHECK(!RM_DirectionAllowed(RM_SELL, RM_DIRS_NONE, true, false, 1, 0));   // manual still obeys multidir
   }

   CASE("T11 overlap threshold boundaries and final-slice exclusion");
   {
      CHECK(RM_OverlapActive(true, 2, 2, RM_OVL_GE, false));
      CHECK(!RM_OverlapActive(true, 2, 2, RM_OVL_GT, false));
      CHECK(RM_OverlapActive(true, 3, 2, RM_OVL_GT, false));
      CHECK(!RM_OverlapActive(true, 1, 1, RM_OVL_GE, false));    // needs first AND last
      CHECK(!RM_OverlapActive(true, 5, 2, RM_OVL_GE, true));     // final slice
      CHECK(!RM_OverlapActive(false, 5, 2, RM_OVL_GE, false));
   }

   CASE("T02 lock sizing: one BUY, one SELL, balanced, unbalanced mix, residual");
   {
      int d; double res;
      double v = RM_LockVolume(0.10, 0.0, fx, d, res);
      CHECK(NEAR(v, 0.10) && d == RM_SELL && NEAR(res, 0));
      v = RM_LockVolume(0.0, 0.25, fx, d, res);
      CHECK(NEAR(v, 0.25) && d == RM_BUY);
      v = RM_LockVolume(0.20, 0.20, fx, d, res);
      CHECK(NEAR(v, 0.0) && NEAR(res, 0));
      v = RM_LockVolume(0.30 + 0.07, 0.12, fx, d, res);
      CHECK(NEAR(v, 0.25) && d == RM_SELL);
      RM_SymbolMeta m = fx; m.minLot = 0.1; m.lotStep = 0.1;
      v = RM_LockVolume(0.35, 0.10, m, d, res);          // net 0.25 with 0.1 steps
      CHECK(NEAR(v, 0.2) && NEAR(res, 0.05));             // never over-hedge; residual reported
      v = RM_LockVolume(0.05, 0.0, m, d, res);
      CHECK(NEAR(v, 0.0) && NEAR(res, 0.05));             // unhedgeable
      CHECK(RM_MainImbalanced(0.35, 0.30, 0.01));
      CHECK(!RM_MainImbalanced(0.30, 0.30, 0.01));
   }

   CASE("T05 partial volume obeys lot step and never leaves invalid remainder");
   {
      CHECK(NEAR(RM_ValidSlice(0.10, 0.03, fx), 0.03));
      CHECK(NEAR(RM_ValidSlice(0.03, 0.03, fx), 0.03));
      CHECK(NEAR(RM_ValidSlice(0.02, 0.03, fx), 0.02));        // whole remaining ticket
      CHECK(NEAR(RM_ValidSlice(0.10, 0.035, fx), 0.03));       // floor to step
      RM_SymbolMeta m = fx; m.minLot = 0.10; m.lotStep = 0.01;
      CHECK(NEAR(RM_ValidSlice(0.25, 0.20, m), 0.15));         // rem 0.05 < min -> shrink
      CHECK(NEAR(RM_ValidSlice(0.15, 0.10, m), 0.15));         // cannot shrink legally -> full
      CHECK(NEAR(RM_ValidSlice(0.50, 0.03, m), 0.10));         // below min -> min
      double s = RM_ValidSlice(0.37, 0.30, m);
      double rem = 0.37 - s;
      CHECK(rem < 1e-9 || rem >= 0.10 - 1e-9);
   }

   CASE("T06/T12 totals: hedge P/L, swap, commission counted once per ticket");
   {
      BookClear(B);
      Add(B, 101, RM_ROLE_ORIGINAL, RM_BUY, 0.10, -50.0, -1.2, -0.7);
      Add(B, 201, RM_ROLE_LOCK, RM_SELL, 0.10, 30.0, 0.4, -0.7);
      Add(B, 301, RM_ROLE_RECOVERY, RM_SELL, 0.06, 4.0, 0.0, -0.42);
      Add(B, 301, RM_ROLE_RECOVERY, RM_SELL, 0.06, 4.0, 0.0, -0.42);  // duplicate row
      Add(B, 999, RM_ROLE_NONE, RM_BUY, 1.0, 500.0);                   // unmanaged
      RM_Totals t; RM_ComputeTotals(B, t);
      CHECK(t.totalCnt == 3);
      CHECK(NEAR(t.totalLots, 0.26));
      CHECK(NEAR(t.totalPL, (-50 - 1.2 - 0.7) + (30 + 0.4 - 0.7) + (4 - 0.42)));
      CHECK(t.mainBuyCnt == 1 && t.mainSellCnt == 1 && t.recSellCnt == 1 && t.recBuyCnt == 0);
      CHECK(t.origCnt == 1 && t.lockCnt == 1);
      CHECK(NEAR(t.mainBuyPL + t.mainSellPL + t.recBuyPL + t.recSellPL, t.totalPL));
   }

   CASE("T06 planner worked example: +12.00 -5.00 -3.00 -0.50 = +3.50");
   {
      // recovery SELL basket nets +12.00 (profit 12.50, booked commission -0.50);
      // full-commission mode assumes the same 0.50 again at exit (unbooked).
      BookClear(B);
      Add(B, 1, RM_ROLE_ORIGINAL, RM_BUY, 0.03, -5.0);
      Add(B, 2, RM_ROLE_LOCK, RM_SELL, 0.03, -3.0);
      Add(B, 3, RM_ROLE_RECOVERY, RM_SELL, 0.10, 12.5, 0, -0.5);
      RM_PlanConfig c = Cfg(); c.fullCommission = true;
      RM_SymbolMeta m = fx;
      c.partialTPPoints = 30;                               // 30 * 1.0 * 0.10 = 3.00
      RM_PlanGroup(B, c, m, 1.0, RM_SELL, P);
      CHECK(NEAR(P.recoveryNet, 12.0));
      CHECK(NEAR(P.mainBuySliceNet, -5.0));
      CHECK(NEAR(P.mainSellSliceNet, -3.0));
      CHECK(NEAR(P.unbookedCosts, 0.5));
      CHECK(NEAR(P.expectedNet, 3.5));
      CHECK(NEAR(P.target, 3.0));
      CHECK(P.qualifies);
      CHECK(P.isFinal);                                     // slices close the whole main position
      CHECK(!P.isOverlap);
      c.partialTPPoints = 40;                               // target 4.00
      RM_PlanGroup(B, c, m, 1.0, RM_SELL, P);
      CHECK(NEAR(P.expectedNet, 3.5) && NEAR(P.target, 4.0));
      CHECK(!P.qualifies && P.reason == RM_R_BELOW_TARGET);
      // execution order: profitable legs first
      CHECK(P.role[0] == RM_ROLE_RECOVERY);
   }

   CASE("Planner: matched slices, residual, booked costs not double counted");
   {
      BookClear(B);
      Add(B, 10, RM_ROLE_ORIGINAL, RM_BUY, 0.10, -80.0, -2.0, -0.70, 100);
      Add(B, 11, RM_ROLE_LOCK, RM_SELL, 0.10, 45.0, 0.5, -0.70, 200);
      Add(B, 12, RM_ROLE_RECOVERY, RM_BUY, 0.06, 20.0, 0, 0, 300);
      Add(B, 13, RM_ROLE_RECOVERY, RM_BUY, 0.07, 15.0, 0, 0, 400);
      RM_PlanConfig c = Cfg(); c.overlapEnabled = false;
      RM_PlanGroup(B, c, fx, 1.0, RM_BUY, P);
      CHECK(P.n == 4);
      CHECK(NEAR(P.mainBuyCloseLots, 0.03) && NEAR(P.mainSellCloseLots, 0.03));
      CHECK(NEAR(P.mainBuySliceNet, (-80 - 2 - 0.7) * 0.3));
      CHECK(NEAR(P.mainSellSliceNet, (45 + 0.5 - 0.7) * 0.3));
      CHECK(NEAR(P.unbookedCosts, 0.0));                    // commission already booked
      CHECK(NEAR(P.recoveryCloseLots, 0.13));
      CHECK(NEAR(P.target, 30 * 1.0 * 0.13));
      CHECK(LegalRemainders(P, fx));
      CHECK(!P.isFinal);
      // execution buffer: 2 points per closed lot, closed = 0.13 + 0.06
      c.execBufferPoints = 2;
      RM_PlanGroup(B, c, fx, 1.0, RM_BUY, P);
      CHECK(NEAR(P.buffer, 2 * 1.0 * 0.19));
   }

   CASE("T11 overlap plan closes first+last; final slice closes every recovery order");
   {
      BookClear(B);
      Add(B, 10, RM_ROLE_ORIGINAL, RM_BUY, 0.10, -60.0, 0, 0, 100);
      Add(B, 11, RM_ROLE_LOCK, RM_SELL, 0.10, 20.0, 0, 0, 200);
      Add(B, 21, RM_ROLE_RECOVERY, RM_SELL, 0.06, 40.0, 0, 0, 300);
      Add(B, 22, RM_ROLE_RECOVERY, RM_SELL, 0.07, 10.0, 0, 0, 400);
      Add(B, 23, RM_ROLE_RECOVERY, RM_SELL, 0.10, -5.0, 0, 0, 500);
      RM_PlanConfig c = Cfg();
      RM_PlanGroup(B, c, fx, 1.0, RM_SELL, P);
      CHECK(P.isOverlap && P.kind == RM_PLAN_OVERLAP);
      bool has21 = false, has22 = false, has23 = false;
      for(int k = 0; k < P.n; k++)
        { if(P.ticket[k] == 21) has21 = true; if(P.ticket[k] == 22) has22 = true; if(P.ticket[k] == 23) has23 = true; }
      CHECK(has21 && has23 && !has22);
      CHECK(NEAR(P.recoveryNet, 35.0));
      // final slice: partial lots >= main -> overlap disabled, all recovery closed
      c.partialLots = 0.10;
      RM_PlanGroup(B, c, fx, 1.0, RM_SELL, P);
      CHECK(P.isFinal && !P.isOverlap && P.kind == RM_PLAN_GROUP);
      CHECK(NEAR(P.recoveryCloseLots, 0.23));
   }

   CASE("Priority: easy-first, hard-first, first-ticket override, stable tie-break");
   {
      BookClear(B);
      Add(B, 50, RM_ROLE_ORIGINAL, RM_BUY, 0.10, -10.0, 0, 0, 100);   // -100/lot (easy)
      Add(B, 51, RM_ROLE_ORIGINAL, RM_BUY, 0.10, -40.0, 0, 0, 200);   // -400/lot (hard)
      Add(B, 52, RM_ROLE_ORIGINAL, RM_BUY, 0.20, -20.0, 0, 0, 50);    // -100/lot, earlier
      CHECK(B.ticket[RM_PickMain(B, RM_BUY, true, RM_PRIO_EASY_FIRST, 0)] == 52);  // tie -> earlier
      CHECK(B.ticket[RM_PickMain(B, RM_BUY, true, RM_PRIO_HARD_FIRST, 0)] == 51);
      CHECK(B.ticket[RM_PickMain(B, RM_BUY, true, RM_PRIO_EASY_FIRST, 51)] == 51); // override
      CHECK(B.ticket[RM_PickMain(B, RM_BUY, true, RM_PRIO_EASY_FIRST, 777)] == 52); // missing -> fallback
      CHECK(RM_PickMain(B, RM_SELL, false, RM_PRIO_EASY_FIRST, 51) < 0);
   }

   CASE("Unlocked single-leg slice planning");
   {
      BookClear(B);
      Add(B, 60, RM_ROLE_ORIGINAL, RM_BUY, 0.05, -30.0, 0, 0, 100);
      Add(B, 61, RM_ROLE_RECOVERY, RM_BUY, 0.06, 25.0, 0, 0, 200);
      RM_PlanConfig c = Cfg(); c.matchedMain = false;
      RM_PlanGroup(B, c, fx, 1.0, RM_BUY, P);
      CHECK(NEAR(P.mainBuyCloseLots, 0.03) && NEAR(P.mainSellCloseLots, 0.0));
      CHECK(NEAR(P.expectedNet, 25.0 - 18.0));
      CHECK(NEAR(P.target, 1.8));
      CHECK(P.qualifies);
      CHECK(LegalRemainders(P, fx));
   }

   CASE("Reduce Volume (matched): net >= 0, equal BUY/SELL volume, legal remainders");
   {
      BookClear(B);
      Add(B, 70, RM_ROLE_ORIGINAL, RM_BUY, 0.20, -20.0, 0, 0, 100);   // -100/lot
      Add(B, 71, RM_ROLE_LOCK, RM_SELL, 0.20, 30.0, 0, 0, 200);       // +150/lot
      RM_PlanConfig c = Cfg();
      RM_PlanReduce(B, c, fx, 1.0, true, RM_PLAN_REDUCE, P);
      CHECK(P.qualifies);
      CHECK(NEAR(P.mainBuyCloseLots, P.mainSellCloseLots));
      CHECK(NEAR(P.mainBuyCloseLots, 0.20));
      CHECK(P.expectedNet >= 0);
      CHECK(LegalRemainders(P, fx));
      // unaffordable matched book: loser -300/lot, winner +100/lot -> nothing
      BookClear(B);
      Add(B, 72, RM_ROLE_ORIGINAL, RM_BUY, 0.20, -60.0, 0, 0, 100);
      Add(B, 73, RM_ROLE_LOCK, RM_SELL, 0.20, 20.0, 0, 0, 200);
      RM_PlanReduce(B, c, fx, 1.0, true, RM_PLAN_REDUCE, P);
      CHECK(P.n == 0 && P.reason == RM_R_NOTHING_AFFORD);
   }

   CASE("Reduce/launch financing (unmatched): winners fund partial loser volume");
   {
      BookClear(B);
      Add(B, 80, RM_ROLE_ORIGINAL, RM_BUY, 0.30, -90.0, 0, 0, 100);   // -300/lot
      Add(B, 81, RM_ROLE_ORIGINAL, RM_SELL, 0.05, 25.0, 0, 0, 200);   // +25
      RM_PlanConfig c = Cfg();
      RM_PlanReduce(B, c, fx, 1.0, false, RM_PLAN_LAUNCH, P);
      CHECK(P.qualifies && P.expectedNet >= -1e-9);
      CHECK(NEAR(P.mainSellCloseLots, 0.05));
      CHECK(NEAR(P.mainBuyCloseLots, 0.08));                // 0.08*300 = 24 <= 25
      CHECK(NEAR(P.expectedNet, 1.0));
      CHECK(LegalRemainders(P, fx));
      // minimum lot 0.10: remainder legality forces 0.10 step start
      RM_SymbolMeta m = fx; m.minLot = 0.10;
      RM_PlanReduce(B, c, m, 1.0, false, RM_PLAN_LAUNCH, P);
      CHECK(P.n == 0);                                       // 0.10*300 = 30 > 25: not affordable
   }

   CASE("Whole-basket exit covers every owned role, target compare");
   {
      BookClear(B);
      Add(B, 1, RM_ROLE_ORIGINAL, RM_BUY, 0.1, -10);
      Add(B, 2, RM_ROLE_LOCK, RM_SELL, 0.1, 12);
      Add(B, 3, RM_ROLE_RECOVERY, RM_BUY, 0.06, 30);
      Add(B, 4, RM_ROLE_NONE, RM_BUY, 1.0, -999);
      RM_PlanConfig c = Cfg();
      RM_PlanAll(B, c, 1.0, RM_PLAN_BASKET, 25.0, P);
      CHECK(P.n == 3 && NEAR(P.expectedNet, 32.0) && P.qualifies);
      RM_PlanAll(B, c, 1.0, RM_PLAN_BASKET, 40.0, P);
      CHECK(!P.qualifies);
      RM_PlanAll(B, c, 1.0, RM_PLAN_CLOSE_ALL, -1.0, P);
      CHECK(P.qualifies && P.n == 3);
   }

   CASE("T13 journal: failure after first leg resumes without double-spending profit");
   {
      BookClear(B);
      Add(B, 1, RM_ROLE_ORIGINAL, RM_BUY, 0.03, -5.0);
      Add(B, 2, RM_ROLE_LOCK, RM_SELL, 0.03, -3.0);
      Add(B, 3, RM_ROLE_RECOVERY, RM_SELL, 0.10, 12.0);
      RM_PlanConfig c = Cfg();
      RM_PlanGroup(B, c, fx, 1.0, RM_SELL, P);
      static RM_Journal J; RM_JournalFromPlan(J, P, 42);
      CHECK(J.status == RM_J_IN_PROGRESS && J.n == 3);
      int k = RM_JournalNextLeg(J);
      CHECK(J.ticket[k] == 3);                               // profit leg first
      CHECK(RM_JournalMarkLeg(J, k, 0.10, 11.8));            // slippage: realised 11.80
      // --- simulated crash; state reloaded from disk ---
      static RM_Journal R; R = J;
      CHECK(!RM_JournalMarkLeg(R, k, 0.10, 11.8));           // replay of same fill ignored
      CHECK(NEAR(R.realizedNet, 11.8));
      int k2 = RM_JournalNextLeg(R);
      CHECK(k2 >= 0 && R.ticket[k2] != 3);
      RM_JournalMarkLeg(R, k2, 0.03, R.ticket[k2] == 1 ? -5.1 : -3.0);
      int k3 = RM_JournalNextLeg(R);
      CHECK(RM_JournalSkipLeg(R, k3));                       // vanished externally
      CHECK(R.status == RM_J_DONE);
      CHECK(RM_JournalNextLeg(R) == -1);
      CHECK(NEAR(R.estimatedNet, 4.0));
   }

   CASE("T04/T14/T18 state machine: launch once, restart, pause precedence, closing");
   {
      RM_StateInput in; std::memset(&in, 0, sizeof(in));
      in.state = RM_ST_IDLE;
      CHECK(RM_NextState(in) == RM_ST_IDLE);                 // T01 no orders -> stays idle
      in.hasMain = true; in.hasManaged = true;
      CHECK(RM_NextState(in) == RM_ST_ARMED);
      in.state = RM_ST_ARMED;
      CHECK(RM_NextState(in) == RM_ST_ARMED);                // not triggered
      in.launchTriggered = true;
      CHECK(RM_NextState(in) == RM_ST_PREPARING);
      in.launchDone = true;                                  // persisted at PREPARING entry
      in.state = RM_ST_ARMED;
      CHECK(RM_NextState(in) == RM_ST_ARMED);                // launch never re-fires
      in.state = RM_ST_PREPARING;
      CHECK(RM_NextState(in) == RM_ST_PREPARING);            // prep not finished
      in.prepDone = true; in.lockingEnabled = true;
      CHECK(RM_NextState(in) == RM_ST_LOCKING);
      in.state = RM_ST_LOCKING;
      CHECK(RM_NextState(in) == RM_ST_LOCKING);
      // restart mid-lock: persisted state LOCKING, prepDone true -> no re-prep
      CHECK(RM_NextState(in) != RM_ST_PREPARING);
      in.lockDone = true;
      CHECK(RM_NextState(in) == RM_ST_RECOVERING);
      in.state = RM_ST_RECOVERING;
      in.mainImbalanced = true; in.relockOnImbalance = true;
      CHECK(RM_NextState(in) == RM_ST_LOCKING);
      in.journalOpen = true;
      CHECK(RM_NextState(in) == RM_ST_RECOVERING);           // never relock mid-transaction
      in.journalOpen = false; in.mainImbalanced = false;
      in.pauseRequested = true;
      CHECK(RM_NextState(in) == RM_ST_PAUSED);
      in.state = RM_ST_PAUSED; in.pauseRequested = false; in.stateBeforePause = RM_ST_RECOVERING;
      CHECK(RM_NextState(in) == RM_ST_PAUSED);
      in.closeRequested = true;                              // emergency/close-all beats pause
      CHECK(RM_NextState(in) == RM_ST_CLOSING);
      in.closeRequested = false; in.resumeRequested = true;
      CHECK(RM_NextState(in) == RM_ST_RECOVERING);
      in.resumeRequested = false;
      in.state = RM_ST_CLOSING; in.journalOpen = true;
      CHECK(RM_NextState(in) == RM_ST_CLOSING);
      in.journalOpen = false; in.hasManaged = false; in.hasMain = false;
      CHECK(RM_NextState(in) == RM_ST_COMPLETE);
      in.state = RM_ST_COMPLETE;
      CHECK(RM_NextState(in) == RM_ST_IDLE);
      in.state = RM_ST_RECOVERING; in.errorCondition = true;
      CHECK(RM_NextState(in) == RM_ST_ERROR_HOLD);
      in.state = RM_ST_ERROR_HOLD; in.errorCondition = false;
      CHECK(RM_NextState(in) == RM_ST_ERROR_HOLD);           // needs operator resume
      in.resumeRequested = true; in.hasManaged = true; in.launchDone = true;
      CHECK(RM_NextState(in) == RM_ST_RECOVERING);
   }

   CASE("C20 drawdown trigger: 10% of 10,000 -> 999 no, 1,000 yes (managed scope)");
   {
      double m, pc;
      RM_TriggerMetrics(RM_TSCOPE_MANAGED, -999.0, 10000, 9001, m, pc);
      CHECK(NEAR(m, 999.0) && NEAR(pc, 9.99));
      CHECK(!RM_TriggerHit(RM_TRIG_PERCENT, m, pc, 10.0, 10000));
      RM_TriggerMetrics(RM_TSCOPE_MANAGED, -1000.0, 10000, 9000, m, pc);
      CHECK(NEAR(m, 1000.0) && NEAR(pc, 10.0));
      CHECK(RM_TriggerHit(RM_TRIG_PERCENT, m, pc, 10.0, 10000));
      CHECK(RM_TriggerHit(RM_TRIG_MONEY, m, pc, 1000.0, 10000));
      CHECK(!RM_TriggerHit(RM_TRIG_MONEY, 999.99, 0, 1000.0, 10000));
      RM_TriggerMetrics(RM_TSCOPE_MANAGED, +250.0, 10000, 10250, m, pc);      // profit is no drawdown
      CHECK(NEAR(m, 0) && !RM_TriggerHit(RM_TRIG_MONEY, m, pc, 1.0, 10000));
      RM_TriggerMetrics(RM_TSCOPE_ACCOUNT, 0.0, 10000, 8800, m, pc);          // account: balance - equity
      CHECK(NEAR(m, 1200) && NEAR(pc, 12.0));
      RM_TriggerMetrics(RM_TSCOPE_ACCOUNT, 0.0, 0.0, -5, m, pc);              // zero balance guard
      CHECK(NEAR(pc, 0.0) && !RM_TriggerHit(RM_TRIG_PERCENT, m, pc, 10.0, 0.0));
      CHECK(!RM_TriggerHit(RM_TRIG_PERCENT, 5000, 50, 0.0, 10000));           // no threshold -> never
      CHECK(NEAR(RM_TriggerProgress(RM_TRIG_PERCENT, 500, 5.0, 10.0), 0.5));
      CHECK(NEAR(RM_TriggerProgress(RM_TRIG_MONEY, 3000, 30.0, 1000.0), 1.0));
   }

   CASE("C21 Three-MA crossover on closed candles, filter");
   {
      CHECK(RM_MASignal(1.0, 1.0, 1.2, 1.1, false, 0) == 1);        // f2 <= s2 (equal) and f1 > s1
      CHECK(RM_MASignal(0.9, 1.0, 1.2, 1.1, false, 0) == 1);
      CHECK(RM_MASignal(1.1, 1.0, 1.2, 1.1, false, 0) == 0);        // already above: no new cross
      CHECK(RM_MASignal(1.0, 1.0, 0.9, 1.0, false, 0) == -1);
      CHECK(RM_MASignal(1.2, 1.0, 0.9, 1.0, false, 0) == -1);
      CHECK(RM_MASignal(0.9, 1.0, 0.8, 1.0, false, 0) == 0);
      CHECK(RM_MASignal(0.9, 1.0, 1.2, 1.1, true, 1.05) == 1);      // both above filter
      CHECK(RM_MASignal(0.9, 1.0, 1.2, 1.1, true, 1.15) == 0);      // slow below filter -> rejected
      CHECK(RM_MASignal(1.2, 1.0, 0.9, 1.0, true, 1.05) == -1);     // both below filter
      CHECK(RM_MASignal(1.2, 1.0, 0.9, 1.0, true, 0.95) == 0);      // fast below, slow above -> rejected
   }

   CASE("C22 normal lot sizing, virtual basket TP, overlap");
   {
      CHECK(NEAR(RM_NormalBaseLot(RM_NLOT_FIXED, 0.05, 25000, 1000), 0.05));
      CHECK(NEAR(RM_NormalBaseLot(RM_NLOT_BALANCE, 0.01, 25000, 1000), 0.25));
      CHECK(NEAR(RM_NormalBaseLot(RM_NLOT_BALANCE, 0.01, 25000, 0), 0.0));
      CHECK(NEAR(RM_NormalizeLot(RM_NormalBaseLot(RM_NLOT_BALANCE, 0.01, 1550, 1000), fx, RM_ROUND_DOWN), 0.01));
      CHECK(RM_BasketTPReached(RM_BUY, 1.10000, 100, 0.00001, 1.10100, 1.10110));
      CHECK(!RM_BasketTPReached(RM_BUY, 1.10000, 100, 0.00001, 1.10099, 1.10109));
      CHECK(RM_BasketTPReached(RM_SELL, 1.10000, 100, 0.00001, 1.09890, 1.09900));
      CHECK(!RM_BasketTPReached(RM_SELL, 1.10000, 100, 0.00001, 1.09891, 1.09901));
      CHECK(!RM_BasketTPReached(RM_BUY, 1.10000, 0, 0.00001, 2.0, 2.0));       // TP 0 = off
      CHECK(RM_NormalOverlapHit(-4.0, 7.0, 0.01, 0.02, 100, 1.0));             // 3.00 >= 100*1*0.03
      CHECK(!RM_NormalOverlapHit(-4.0, 6.9, 0.01, 0.02, 100, 1.0));
   }

   CASE("C23 resume rules: cooldown, auto-resume, emergency/manual need operator, fresh signal");
   {
      CHECK(!RM_ResumeAllowed(RM_OUT_COMPLETED, false, true, false, 2, 3));   // cooldown not over
      CHECK(RM_ResumeAllowed(RM_OUT_COMPLETED, false, true, false, 3, 3));
      CHECK(!RM_ResumeAllowed(RM_OUT_COMPLETED, false, false, false, 9, 3));  // auto off: wait
      CHECK(RM_ResumeAllowed(RM_OUT_COMPLETED, false, false, true, 9, 3));    // operator command
      CHECK(!RM_ResumeAllowed(RM_OUT_EMERGENCY, true, true, false, 99, 3));   // never automatic
      CHECK(RM_ResumeAllowed(RM_OUT_EMERGENCY, true, true, true, 99, 3));
      CHECK(!RM_ResumeAllowed(RM_OUT_EMERGENCY, true, true, true, 1, 3));     // even operator waits cooldown
      CHECK(!RM_ResumeAllowed(RM_OUT_MANUAL, false, true, false, 9, 3));
      CHECK(!RM_SignalIsFresh(true, 1000, 2000));                             // crossover during recovery
      CHECK(RM_SignalIsFresh(true, 2000, 2000));
      CHECK(RM_SignalIsFresh(false, 1000, 2000));
   }

   CASE("C24 normal basket closure plan lists only the requested legs");
   {
      BookClear(B);
      Add(B, 1, RM_ROLE_NORMAL, RM_BUY, 0.01, -4.0, 0, 0, 100);
      Add(B, 2, RM_ROLE_NORMAL, RM_BUY, 0.02, 1.0, 0, 0, 200);
      Add(B, 3, RM_ROLE_NORMAL, RM_BUY, 0.03, 9.0, 0, 0, 300);
      RM_IndexList L; L.n = 2; L.idx[0] = 0; L.idx[1] = 2;
      RM_PlanConfig c = Cfg();
      RM_PlanListed(B, c, 1.0, RM_PLAN_NORMAL_OVERLAP, L, -1.0, P);
      CHECK(P.n == 2 && NEAR(P.expectedNet, 5.0) && P.qualifies);
      CHECK(P.ticket[0] == 3);                                     // profitable leg first
      RM_PlanListed(B, c, 1.0, RM_PLAN_NORMAL_TP, L, 6.0, P);
      CHECK(!P.qualifies);
   }

   CASE("D01 standardized points: required conversions on 4/5-digit FX, 2/3-digit JPY and gold");
   {
      // unit price never depends on the broker Point in STANDARDIZED mode
      double gbp5 = RM_ResolveUnitPrice(RM_DU_STANDARDIZED, RM_PROF_FX, 0, 0.00001, 0);
      double gbp4 = RM_ResolveUnitPrice(RM_DU_STANDARDIZED, RM_PROF_FX, 0, 0.0001, 0);
      CHECK(NEAR(RM_DistUnitsToPrice(100, gbp5), 0.00100));
      CHECK(NEAR(RM_DistUnitsToPrice(100, gbp4), 0.0010));
      double jpy3 = RM_ResolveUnitPrice(RM_DU_STANDARDIZED, RM_PROF_FXJPY, 0, 0.001, 0);
      double jpy2 = RM_ResolveUnitPrice(RM_DU_STANDARDIZED, RM_PROF_FXJPY, 0, 0.01, 0);
      CHECK(NEAR(RM_DistUnitsToPrice(100, jpy3), 0.100));
      CHECK(NEAR(RM_DistUnitsToPrice(100, jpy2), 0.10));
      double xau3 = RM_ResolveUnitPrice(RM_DU_STANDARDIZED, RM_PROF_XAUUSD, 0, 0.001, 0);
      double xau2 = RM_ResolveUnitPrice(RM_DU_STANDARDIZED, RM_PROF_XAUUSD, 0, 0.01, 0);
      CHECK(NEAR(RM_DistUnitsToPrice(100, xau3), 1.000));
      CHECK(NEAR(RM_DistUnitsToPrice(100, xau2), 1.00));
      CHECK(NEAR(RM_DistUnitsToPrice(250, xau3), 2.50) && NEAR(RM_DistUnitsToPrice(250, xau2), 2.50));
      CHECK(NEAR(RM_PriceToBrokerPoints(1.0, 0.001), 1000.0));     // 3-digit gold: 1.00 = 1000 broker points
      CHECK(NEAR(RM_PriceToBrokerPoints(1.0, 0.01), 100.0));
      CHECK(NEAR(RM_PriceToDistUnits(1.0, xau3), 100.0));
      // the old defect: 100 x Point on 3-digit gold
      CHECK(NEAR(100 * 0.001, 0.1) && !NEAR(100 * 0.001, RM_DistUnitsToPrice(100, xau3)));
   }

   CASE("D02 gold BUY grid anchored at 2650.000, 100 standardized points -> 2649.000");
   {
      double eff3 = RM_EffectiveSpacing(RM_DistUnitsToPrice(100, 0.01), 0.001);
      CHECK(NEAR(eff3, 1.0));
      CHECK(NEAR(RM_GridTargetPrice(RM_BUY, 2650.000, eff3, 0.001), 2649.000));
      CHECK(!NEAR(RM_GridTargetPrice(RM_BUY, 2650.000, eff3, 0.001), 2649.900));
      CHECK(NEAR(RM_GridTargetPrice(RM_SELL, 2650.000, eff3, 0.001), 2651.000));
      double eff2 = RM_EffectiveSpacing(RM_DistUnitsToPrice(100, 0.01), 0.01);
      CHECK(NEAR(RM_GridTargetPrice(RM_BUY, 2650.00, eff2, 0.01), 2649.00));    // same level on 2 digits
      // trigger boundaries: BUY compares Ask with the level
      double lv = 2649.000;
      CHECK(!RM_GridTriggered(RM_BUY, 2648.970, 2649.001, lv));               // just before
      CHECK(RM_GridTriggered(RM_BUY, 2648.970, 2649.000, lv));                // at
      CHECK(RM_GridTriggered(RM_BUY, 2640.000, 2640.030, lv));                // beyond (gap)
      double ls = 2651.000;                                                  // SELL compares Bid
      CHECK(!RM_GridTriggered(RM_SELL, 2650.999, 2651.029, ls));
      CHECK(RM_GridTriggered(RM_SELL, 2651.000, 2651.030, ls));
      CHECK(RM_GridTriggered(RM_SELL, 2660.000, 2660.030, ls));
   }

   CASE("D03 custom unit, price distance, broker points, per-symbol override");
   {
      CHECK(NEAR(RM_DistUnitsToPrice(4, RM_ResolveUnitPrice(RM_DU_CUSTOM, RM_PROF_NONE, 0, 0.01, 0.25)), 1.00));
      CHECK(NEAR(RM_ResolveUnitPrice(RM_DU_PRICE, RM_PROF_NONE, 0, 0.01, 0), 1.0));
      CHECK(NEAR(RM_ResolveUnitPrice(RM_DU_BROKER_POINTS, RM_PROF_XAUUSD, 0, 0.001, 0), 0.001));
      CHECK(NEAR(RM_ResolveUnitPrice(RM_DU_STANDARDIZED, RM_PROF_OVERRIDE, 0.5, 0.01, 0), 0.5));
      CHECK(NEAR(RM_ResolveUnitPrice(RM_DU_CUSTOM, RM_PROF_OVERRIDE, 0.5, 0.01, 0.25), 0.5));   // symbol beats global
      CHECK(NEAR(RM_ResolveUnitPrice(RM_DU_PRICE, RM_PROF_OVERRIDE, 0.5, 0.01, 0), 1.0));       // fixed by definition
      CHECK(NEAR(RM_ResolveUnitPrice(RM_DU_STANDARDIZED, RM_PROF_NONE, 0, 0.01, 0), 0.0));      // undefined
      CHECK(NEAR(RM_ResolveUnitPrice(RM_DU_CUSTOM, RM_PROF_NONE, 0, 0.01, 0), 0.0));            // custom not set
   }

   CASE("D04 executable tick size: requested 0.12 with tick 0.05 -> effective 0.15");
   {
      CHECK(NEAR(RM_EffectiveSpacing(0.12, 0.05), 0.15));
      CHECK(NEAR(RM_EffectiveSpacing(0.15, 0.05), 0.15));                     // already a multiple
      CHECK(NEAR(RM_EffectiveSpacing(1.2, 0.25), 1.25));
      double tb = RM_GridTargetPrice(RM_BUY, 100.00, 0.15, 0.05);
      double ts = RM_GridTargetPrice(RM_SELL, 100.05, 0.15, 0.05);
      CHECK(NEAR(tb, 99.85) && NEAR(ts, 100.20));
      CHECK(std::fabs(tb / 0.05 - std::round(tb / 0.05)) < 1e-9);             // executable
      // an off-grid anchor still yields spacing >= requested and a valid tick
      double t2 = RM_GridTargetPrice(RM_BUY, 100.03, 0.15, 0.05);
      CHECK(NEAR(t2, 99.85) && 100.03 - t2 >= 0.15 - 1e-9);
      double t3 = RM_GridTargetPrice(RM_SELL, 100.03, 0.15, 0.05);
      CHECK(NEAR(t3, 100.20) && t3 - 100.03 >= 0.15 - 1e-9);
      CHECK(NEAR(RM_TPTargetPrice(RM_BUY, 100.03, 0.12, 0.05), 100.15));
      CHECK(NEAR(RM_TPTargetPrice(RM_SELL, 100.03, 0.12, 0.05), 99.90));
      std::string why;
      CHECK(RM_MetaValid(0.01, 0.25, why));
      CHECK(!RM_MetaValid(0.01, 0.0, why));                                   // missing tick
      CHECK(!RM_MetaValid(0.0, 0.01, why));                                   // missing point
      CHECK(!RM_MetaValid(0.01, 0.005, why));                                 // tick below point
      CHECK(!RM_MetaValid(0.01, 0.015, why));                                 // not a whole multiple
   }

   CASE("D05 symbol resolution: metadata, suffixes, explicit map, overrides, unknown");
   {
      double ov; int src;
      CHECK(RM_ResolveProfile("XAUUSD", "", "", "", "", "XAU", "USD", 1, ov, src) == RM_PROF_XAUUSD && src == RM_PSRC_METADATA);
      CHECK(RM_ResolveProfile("XAUUSD.a", "", "", "", "", "XAU", "USD", 1, ov, src) == RM_PROF_XAUUSD);
      CHECK(RM_ResolveProfile("XAUUSDm", "", "", "", "", "XAU", "USD", 0, ov, src) == RM_PROF_XAUUSD);
      CHECK(RM_ResolveProfile("GBPUSD.ecn", "", "", "", "", "GBP", "USD", 0, ov, src) == RM_PROF_FX);
      CHECK(RM_ResolveProfile("USDJPY-pro", "", "", "", "", "USD", "JPY", 0, ov, src) == RM_PROF_FXJPY);
      // GOLD alias with CFD metadata that does not say XAU: only an explicit map resolves it
      CHECK(RM_ResolveProfile("GOLD", "", "", "", "", "USD", "USD", 1, ov, src) == RM_PROF_NONE);
      CHECK(RM_ResolveProfile("GOLD", "GOLD:XAUUSD", "", "", "", "USD", "USD", 1, ov, src) == RM_PROF_XAUUSD && src == RM_PSRC_MAP);
      CHECK(RM_ResolveProfile("GOLDm", "GOLD:XAUUSD", "", "m", "", "USD", "USD", 1, ov, src) == RM_PROF_XAUUSD);
      CHECK(RM_ResolveProfile("pro.GOLD", "gold=xauusd", "pro.", "", "", "", "", 1, ov, src) == RM_PROF_XAUUSD);
      CHECK(RM_ResolveProfile("GOLDEN", "GOLD:XAUUSD", "", "", "", "", "", 1, ov, src) == RM_PROF_NONE);  // no loose substring
      // no Digits-based guessing: silver, indices, crypto stay undefined
      CHECK(RM_ResolveProfile("XAGUSD", "", "", "", "", "XAG", "USD", 1, ov, src) == RM_PROF_NONE);
      CHECK(RM_ResolveProfile("US30.cash", "", "", "", "", "USD", "USD", 1, ov, src) == RM_PROF_NONE);
      CHECK(RM_ResolveProfile("BTCUSD", "", "", "", "", "BTC", "USD", 1, ov, src) == RM_PROF_NONE);      // not Forex calc mode
      // per-symbol override wins
      CHECK(RM_ResolveProfile("XAGUSD", "", "", "", "XAGUSD:0.001;US30.cash=1", "XAG", "USD", 1, ov, src) == RM_PROF_OVERRIDE
            && NEAR(ov, 0.001) && src == RM_PSRC_OVERRIDE);
      CHECK(RM_ResolveProfile("US30.cash", "", "", "", "XAGUSD:0.001; US30.cash = 1", "USD", "USD", 1, ov, src) == RM_PROF_OVERRIDE && NEAR(ov, 1.0));
      std::string err;
      CHECK(RM_ListValid("GOLD:XAUUSD;GOLD.x=XAUUSD", false, err));
      CHECK(!RM_ListValid("GOLD:SILVER", false, err));
      CHECK(!RM_ListValid("XAGUSD:-1", true, err));
      CHECK(!RM_ListValid("XAGUSD", true, err));
      CHECK(RM_ListValid("", true, err));
   }

   CASE("D06 migration keeps the original price distance; max limits never loosen");
   {
      // legacy GBPUSD 4-digit input 30 broker points = 0.0030 -> 300 standardized
      CHECK(NEAR(RM_MigrateDistance(30, 0.0001, 0.00001), 300));
      // legacy 3-digit gold input 1000 broker points = 1.000 -> 100 standardized
      CHECK(NEAR(RM_MigrateDistance(1000, 0.001, 0.01), 100));
      CHECK(NEAR(RM_MigrateDistance(1000, 0.001, 0.01) * 0.01, 1000 * 0.001));
      CHECK(NEAR(RM_MigrateDistance(200, 0.00001, 0.00001), 200));            // 5-digit FX unchanged
      CHECK(RM_MaxLimitBrokerPoints(0.30, 0.001) == 300);
      CHECK(RM_MaxLimitBrokerPoints(0.0305, 0.001) == 30);                    // floored, never 31
      CHECK(RM_MaxLimitBrokerPoints(0.0005, 0.001) == 0);
      CHECK(RM_SpreadTooWide(2650.000, 2650.301, 0.30));
      CHECK(!RM_SpreadTooWide(2650.000, 2650.300, 0.30));
   }

   CASE("Break-even / possible-close price solve");
   {
      // 0.10 lot BUY group, EURUSD: 1.0 per point per lot -> 10000 per price unit per lot
      double sens = 0.10 * 1.0 / 0.00001;
      double pr = RM_BreakEvenPrice(1.20000, -5.0, 3.0, sens);
      CHECK(NEAR(pr, 1.20080));                                 // +8.00 at 0.10 money per point = 80 points
      CHECK(NEAR(RM_BreakEvenPrice(1.2, -5.0, 3.0, 0.0), 0.0));
   }

   std::printf("\nResult: %d passed, %d failed\n", g_pass, g_fail);
   return g_fail == 0 ? 0 : 1;
  }

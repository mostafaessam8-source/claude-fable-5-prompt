# Evidence and assumption matrix

## How to read this

| Class | Meaning |
|---|---|
| **VIDEO** | Observed in the reference video *"AW Recovery EA v3.30 – Back-TEST & Unlimited Version Download"* (~11:11) at the given timestamp, **as transcribed in the project brief**. The video file was not attached to the build session, so these rows rely on that transcription and were not re-viewed. |
| **DOCUMENTED** | Stated in the brief's summary of the official product pages (mql5.com product 49453, its MT4 changelog and blog posts 749512 / 749585 / 750270). Those pages could not be reached from the build environment (egress blocked), so the brief's summary is the only source. |
| **PROPOSED** | This project's own engineering decision for an independent, working EA. It is not a claim about the original product. |
| **UNRESOLVED** | Behaviour of the original that is not established by the available evidence. Implemented as a configurable choice and isolated for later calibration. |
| **ENHANCEMENT** | Added capability that is explicitly not part of the reference. |

The test IDs are `Cxx` for the calculation-test case names in `tests/test_calc.cpp`, `Snn` for the simulator scenarios in `tests/test_engine_sim.cpp`, and `Vnn` for the visual procedures in `VISUAL_TEST_PROCEDURES.md`.

## Matrix

| # | Requirement | Class | Evidence | Implementation | Test |
|---|---|---|---|---|---|
| 1 | Recovery of existing orders; idle with no eligible orders | VIDEO / DOCUMENTED | ~10:50 empty basket "No orders to recover"; product description | `RM_NextState` IDLE; `RM_Engine` status text; no entry code path without main position | C "state machine", S01, V01 |
| 2 | Tester setup GBPUSD H1, Every Tick, 10,000 USD, long+short | VIDEO | 00:08–00:10, 00:20–00:25 (date fields do not prove the full period ran) | none (tester configuration) | V00 |
| 3 | Priority "easy-to-close first" | VIDEO | 00:11–00:12 input screen | `RM_PickMain`, `RM_Preferred` (loss per lot, first-ticket override, time/ticket tie-break) | C "Priority", S02 |
| 4 | Ranking metric = loss per executable lot | PROPOSED | — | `RM_RankMetric` | C "Priority" |
| 5 | Scope "all orders on same symbol", magic list 12345,54321,0 | VIDEO | 00:11–00:12 | `RM_InScope`, `InpScope`, `InpMagicList` | S03, V03 |
| 6 | Exact membership of the scope modes, exclusion list, foreign-instance comments | PROPOSED | — | `RM_InScope`, `RM_ForeignRmpComment` | S03 |
| 7 | Adoption policy for new orders after launch | PROPOSED | — | `RM_AdoptionAllowed`, `InpAdoptPolicy` | S03 (until launch), V04 |
| 8 | First recovery ticket (0 = unused) | VIDEO | 00:11–00:12 | `RM_PickMain(firstTicket)`, with fallback when absent | C "Priority" |
| 9 | Locking on | VIDEO | 00:13–00:15 | `RM_DoLock`, `RM_LockVolume` | S02, S03, V02 |
| 10 | Lock sizes the net main exposure only, excluding recovery; floor to lot step; residual reported | PROPOSED | — | `RM_LockVolume` (floor), `LOCK_RESIDUAL` audit, panel "NOT neutral" | C "T02", S03 |
| 11 | Reconcile fills before another hedge; one hedge order per tick | PROPOSED | — | `RM_DoLock` (one send, next tick re-reads book) | S12, S06 |
| 12 | Delete SL and TP: On | VIDEO | 00:13–00:15 | `InpDeleteSLTP` | S04 |
| 13 | …interpreted as launch-only removal | PROPOSED | — | `RM_SLTP_LAUNCH_ONLY`; continuous mode labelled ENHANCEMENT | S04 (not repeated after restart) |
| 14 | Launch mode instant; drawdown 35 (inactive) | VIDEO | 00:13–00:15 | `RM_LaunchTriggered` instant / % / money | C "T04", S10 |
| 15 | Launch drawdown = max(0, −managed floating P/L); % uses balance; zero-balance guard | PROPOSED | — | `RM_Drawdown`, `RM_DrawdownPercent` | C "T04" |
| 16 | Launch fires exactly once per session | PROPOSED | — | `g_launchDone` persisted at ARMED→PREPARING | C "state machine", S10 |
| 17 | Disable other EAs: "Do not disable" | VIDEO | 00:13–00:15 | `RM_OTHER_KEEP` default | V05 |
| 18 | Other-EA handling closes charts (selected by symbol only, because MQL4 cannot see which chart hosts an EA), previewed, needs separate enablement, excludes own chart | PROPOSED | — | `RM_PreviewChartClosure`, `InpAllowChartClosure` validation | V05 |
| 19 | Close profitable orders at launch: On | VIDEO | 00:13–00:15 | `InpCloseProfitable` | S17 |
| 20 | …interpreted as profit-financed loser reduction with net ≥ 0 | PROPOSED | — | `RM_PlanReduce(matched=false, RM_PLAN_LAUNCH)` | C "Reduce/launch financing", S17 |
| 21 | Delete pending orders at launch: On | VIDEO | 00:13–00:15 | `RM_DoPrepare` | S04 |
| 22 | Partial-close volume 0.03 lots | VIDEO | 00:11–00:17 | `InpPartialLots`, matched slices | S02 (0.10 → 0.07) |
| 23 | Partial-close TP 30 **points** | VIDEO / DOCUMENTED | 00:11–00:17; changelog: v3.30 averaging TP in points | `InpPartialTPPoints` | C "T07" |
| 24 | Points→money conversion `TickValue·Point/TickSize × TP × basis lots` | PROPOSED | — (not established by the video) | `RM_MoneyPerPointPerLot`, `RM_TargetMoney`, `InpTPBasis` | C "T07" (Forex, JPY, 0.25-tick index, guards) |
| 25 | Later currency-TP mode not imported | DOCUMENTED | changelog (later version) | not implemented; basket TP is a separate whole-basket exit | — |
| 26 | Overlap threshold 2 orders | VIDEO | 00:11–00:17 | `InpOverlapThreshold` | S02, S18 |
| 27 | Overlap uses first + last recovery orders, keeps intermediates | DOCUMENTED | parameter blog post (via brief) | `RM_PlanGroup` overlap branch | C "T11", S18 |
| 28 | Overlap comparison ≥ vs > | **UNRESOLVED** | — | `InpOverlapCompare` (default ≥) | C "T11" boundaries |
| 29 | Overlap disabled for the final slice | PROPOSED (from brief) | — | `RM_OverlapActive(isFinal)` | C "T11" |
| 30 | Grid index after an overlap closure | **UNRESOLVED** | — | `InpOverlapIndex` RECOUNT / CONTINUE | S18 (RECOUNT) |
| 31 | Whole-basket TP off, 25.0 (inactive) | VIDEO | 00:11–00:17 | `InpBasketTP`, `RM_PlanAll(BASKET)` | C "basket", S19 |
| 32 | Recovery filter "Simple Grids" | VIDEO | 00:11–00:17 | `RM_SIG_SIMPLE_GRID` | S02 |
| 33 | BullsBears / AW Trend Predictor formulas | **UNRESOLVED** | not in video | **not reproduced**; independent "RM Candle Reversal" / "RM Swing Trend" labelled non-equivalent; external adapter slot | V10 |
| 34 | Directions Buy and Sell; other modes buy only / sell only / disabled | VIDEO / PROPOSED | 00:11–00:17 | `RM_DirectionAllowed` | C "T10", S16 |
| 35 | First lot 0.06, multiplier 1.3, step 200, step multiplier 1.0 | VIDEO | 00:11–00:17 | `RM_GridRawLot`, `RM_GridStepPoints` | C "T08", S02 |
| 36 | Lot from unrounded base; final normalisation only | PROPOSED | — | `RM_GridRawLot` → `RM_NormalizeLot` | C "T08" (0.078→0.07, 0.1014→0.10) |
| 37 | Adverse-move anchor rule (BUY below last BUY fill, SELL above last SELL fill) | PROPOSED (label per brief) | — | `RM_GridNextLevel`, `RM_TryAverage` | C "Grid", S02 |
| 38 | First-grid entry trigger and anchor | **UNRESOLVED** | — | opens when RECOVERING allows; direction from `InpFirstDirection` / signal | S02, S09 |
| 39 | One order per bar: On (persisted, per direction) | VIDEO / PROPOSED | 00:11–00:17 | `g_lastEntryBar[]` persisted; uncertain send consumes the bar | C "T09", S02, S15 |
| 40 | Multidirectional recovery: Off | VIDEO | 00:11–00:17 | `RM_DirectionAllowed(multidirectional)` | C "T10", S09, S13 |
| 41 | Max slippage 30, max spread 7500, max lot 100, max count 100, magic 9751421 | VIDEO | 00:11–00:17 | inputs; spread blocks new exposure only | S11 (gate reason) |
| 42 | Cap behaviour refuse/clamp | PROPOSED | — | `InpCapBehavior` | C "T08" caps |
| 43 | Gap guard: per-event entry limit | PROPOSED | — | `InpMaxEntriesPerEvent` | S07 (one entry after resume) |
| 44 | Full commission calculation false | VIDEO | 00:11–00:17 | `InpFullCommission` | C "worked example" |
| 45 | Commission/cost model (booked not deducted twice) | PROPOSED | — | `RM_LegExitCost`, `RM_PlanTotals` | C "matched slices" |
| 46 | Launch/end notifications off | VIDEO | 00:13–00:15 | `InpNotify`, `RM_Notify` | — |
| 47 | Panel opens recovery orders: false | VIDEO | 00:13–00:15 | default role ORIGINAL on the manual panel | S13 |
| 48 | Explicit ORIGINAL/RECOVERY role selector | ENHANCEMENT | — | `ROLE` button | S13 |
| 49 | Theme dark, annotations "images on chart", size normal, font 6, close-zone line false | VIDEO | 00:13–00:15 | theme, `RM_PlaceLabel`, `InpPanelSize`, `InpFontSize`, `InpShowCloseLine` | V13 |
| 50 | Trend filter TF current, amplitude 4, initial by trend, subsequent any | VIDEO | 00:13–00:15 | `RM_TrendAllows` (independent formula) | V10 |
| 51 | Main panel groups (main/recovery BUY/SELL, total, stop/close all, possible closures, reduce volume) | VIDEO | ~05:00 | `RM_BuildMain` | S14, V13 |
| 52 | Current-group panel (tickets, sizes, slice, recovery, net, close group) | VIDEO | ~05:00 | `RM_BuildGroup`, `RM_RefreshGroup` | V13 |
| 53 | Manual opening panel with 0.10 lots, Open Buy / Open Sell | VIDEO | ~05:00 | `RM_BuildManual` | S13 |
| 54 | Green candles on black, yellow profit labels, trade markers with dotted connectors, blue/orange levels | VIDEO | ~05:00 | `RM_ApplyChartColors`, `RM_AnnotGroup`, `RM_AnnotConnector`, `RM_AnnotLevels` | V13 |
| 55 | Balance/Equity graph belongs to the MT4 tester | VIDEO | ~05:00 / ~11:10 | not reproduced as a panel (documented) | — |
| 56 | Tester report: 10,000 deposit, 587.07 net, PF 1.27, DD 3,675.93 (35.42 %), 304 trades, 914 mismatched-chart errors, modelling n/a | VIDEO | ~11:10 | **not a target**; not tuned toward it | — |
| 57 | Deterministic planner before execution; journal; non-atomic multi-ticket closes | PROPOSED | — | `RM_Planner.mqh`, `RM_Executor.mqh` | C "T13 journal", S05 |
| 58 | Restart resumes from broker truth; no repeated clean-up or duplicate lock | PROPOSED | — | `RM_LoadState` + `RM_ReconcileRegistry` | S04, S05, S15 |
| 59 | Partial-close lineage; ERROR_HOLD when unresolved | PROPOSED | — | `RM_BuildBook` lineage, `RM_HandleVanished` | S02, S06, S20 |
| 60 | Uncertain reply never duplicates | PROPOSED | — | `RM_Send` tag search | S12 |
| 61 | Pause/resume; emergency precedence explicit | PROPOSED | — | `RM_NextState`, `InpEmergencyOverPause` | C "state machine", S07, S08 |
| 62 | Reduce Volume preview, net ≥ 0, never unconditional loss-cutting | PROPOSED | — | `RM_PlanReduce` | C "Reduce", S16 |
| 63 | Account metrics, realised session/day, peak DD, lots per role, caps, margin gates, emergency, daily lockout, session, CSV audit | ENHANCEMENT | — | `RM_Risk.mqh`, account block, `RM_Log.mqh` | S08, S11 |
| 64 | Test-only seed orders, tester-gated | PROPOSED | — | `RM_TestSeeds` | V00 |
| 65 | No DLL, licensing, expiry or internet dependency | PROPOSED | — | code contains none | lint (API list) |

## Extension: Three-MA normal trading with drawdown handover

Classes used here:
- **SPEC** means the requirement comes from this project's own task specification.
- **DOCUMENTED** refers to the public AW Three MA description (mql5.com product 63484), as summarised in the task. The page itself was not reachable from the build environment.

| # | Requirement | Class | Implementation | Test |
|---|---|---|---|---|
| 66 | Fast/slow MA crossover | DOCUMENTED | `RM_MASignal`, `RM_NormalSignalEval` | C21, S23 |
| 67 | Optional third MA filtering direction | DOCUMENTED | `InpUseFilterMA`, filter rule in `RM_MASignal` | C21 |
| 68 | Exact closed-candle formulas (Fast[2] ≤ Slow[2] & Fast[1] > Slow[1], …) | SPEC | `RM_MASignal` | C21 |
| 69 | Once per closed signal candle, persisted | SPEC | `LASTSIGBAR` | S23, S28 |
| 70 | MA defaults | PROPOSED (project defaults, not the reference's) | inputs section 12 | — |
| 71 | Lot sizing, averaging, virtual basket TP, first/last overlap | DOCUMENTED (concepts) | `RM_Normal.mqh` | C22, C24, S23, S26 |
| 72 | Exact averaging, TP and overlap rules | PROPOSED (documented in COMBINED_MODE.md) | `RM_NormalEntries`, `RM_NormalManage` | C22 |
| 73 | NORMAL → handover → recovery → completion → normal cycle, latch | SPEC | `RM_Controller.mqh` | S24, S28, S31 |
| 74 | Trigger formulas (managed / account, balance-relative floating) | SPEC | `RM_TriggerMetrics`, `RM_TriggerHit` | C20, S24, S34 |
| 75 | Single threshold (reuse `InpLaunchDrawdown`) | SPEC | `RM_TriggerCheckNow` | S28 (threshold change) |
| 76 | Central permission gate for all order operations | SPEC | `RM_Permit` | S26, S35, S36 |
| 77 | Handover steps 1–9 with persistence and failure handling | SPEC | `RM_StartHandover`, `RM_CtlHandoverStep` | S27, S27b |
| 78 | Completion definition, cycle accounting, outcome | SPEC | `RM_CtlCheckCompletion` | S30, S31, S32 |
| 79 | Cooldown, auto-resume, fresh signal, no stale crossover | SPEC | `RM_CtlCooldown`, `RM_ResumeAllowed`, `RM_SignalIsFresh` | C23, S31 |
| 80 | Emergency-loss limit distinct from the launch threshold | SPEC | validation + `RM_NormalEmergency` + engine emergency | S32 |
| 81 | Dashboard additions and controls | SPEC | `RM_DashCycle.mqh` | S33, S35 |

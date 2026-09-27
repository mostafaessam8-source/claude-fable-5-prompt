# Recovery Manager Pro (MT4 Expert Advisor)

Recovery Manager Pro is an independently written MetaTrader 4 Expert Advisor that manages the recovery of **existing** losing market orders. It is modelled on the *observable* workflow of the AW Recovery EA v3.30 demonstration video. It does not contain that product's code, does not claim equivalence with its undocumented algorithms, and uses its own name and branding.

> **Risk.** Recovery trading can realise losses, add exposure and consume margin. No setting guarantees recovery. Run it on a demo account first. The reference video's backtest figures (net profit 587.07, maximal drawdown 35.42 %) are observations of someone else's run, not targets or evidence of live profitability.

- What it does: it adopts eligible orders, can hedge (lock) their net exposure, and opens a separate recovery grid. Each partial reduction of the losing main position is paid for by the recovery grid's realised profit, and the cycle repeats until the managed basket is empty or the operator stops it.
- **Built-in defaults = `Three_MA_With_Recovery.set`**: a fresh attach runs `THREE_MA_WITH_RECOVERY` with ATR-based distances. See section 0 for the 25 visible settings. Set Mode = `RECOVERY_ONLY` for the original manage-existing-orders-only behaviour.
- What it does not do in `RECOVERY_ONLY` mode: it has no entry strategy of its own. **With no eligible orders it stays idle** and shows "No orders to recover".
- **Optional Three-MA normal trading** (`InpOperatingMode`): `THREE_MA_ONLY` trades an independent three-moving-average strategy. `THREE_MA_WITH_RECOVERY` trades it until a drawdown threshold, then hands the basket to the recovery engine under a persisted latch, and resumes only after a verified completion, a cooldown and a fresh signal. See [`docs/COMBINED_MODE.md`](docs/COMBINED_MODE.md).


## 0. Quick start: the 26 settings

The input window shows **26 settings in 7 groups**. Every other setting is advanced and hidden: it keeps its built-in value unless you uncomment `#define RMP_SHOW_ADVANCED` at the top of the `.mq4` and recompile.

| # | Setting | Default | What it does / ماذا يفعل |
|---|---|---|---|
| 1 | Mode | Three-MA + recovery | Trades the MA strategy; a basket in drawdown goes to recovery. / يتداول بالمتوسطات، والسلة الخاسرة تنتقل للاسترداد |
| 2 | Signal timeframe, Fast / Slow MA | chart, 10 / 30 | Crossover of the two MAs = entry. / تقاطع المتوسطين = دخول |
| 2 | Trend filter MA | on, 100 | Buy only above it, sell only below it. A crossover may wait up to 20 candles for the filter. / شراء فوقه وبيع تحته فقط |
| 3 | Lot mode, Lot | per balance, 0.01 | 0.01 lot per 1,000 of balance. / 0.01 لوت لكل 1000 من الرصيد |
| 4 | Distance mode | ATR | TP and grid distances follow volatility (ATR 14), so they work on any symbol and digit count. / المسافات تتبع التذبذب فتصلح لكل الرموز |
| 4 | TP (× ATR) | 1.0 | Basket take-profit distance from the average price. / مسافة جني الربح |
| 4 | Averaging, step (× ATR), multiplier, max orders | on, 1.5, 1.3, 3 | Up to 3 orders per direction before handing over. / حتى 3 صفقات تعزيز |
| 5 | Recovery start drawdown | 8 % | Floating loss of the basket (percent of balance) that starts recovery. / نسبة الخسارة العائمة لبدء الاسترداد |
| 5 | Grid step (× ATR), first lot, multiplier, max orders | 1.5, 0.01 per 1,000, 1.2, 8 | Recovery grid. It follows the trend, trades both directions, and its lot scales with the balance. / شبكة الاسترداد تتبع الاتجاه في الاتجاهين، واللوت يتناسب مع الرصيد |
| 6 | Recovery basket stop | 20 % | A recovery basket (all orders of one direction) that loses this share of the balance is closed. That direction is blocked for 24 candles. This stops a grid from growing against a strong trend. / قطع سلة الاسترداد الخاسرة عند 20% بدل تركها تكبر |
| 6 | Pause new trades at account drawdown | 20 % | New trades pause and open trades are still managed. They resume below 15 %. Nothing is closed. / إيقاف مؤقت للصفقات الجديدة فقط |
| 6 | Emergency close at drawdown | 50 % (0 = off) | Closes everything. Trading resumes by itself after 24 candles. / إغلاق طارئ ثم استئناف تلقائي |
| 6 | Max total lots, max spread | 0.10 per 1,000, 50 | Exposure cap that scales with the balance; lock (hedge) orders are not counted. Also an entry spread limit. / حد اللوت يتناسب مع الرصيد ولا يحسب صفقات التحوط |
| 7 | Panel size, font | normal, 8 | Dashboard appearance. / شكل اللوحة |

**Fixes after the XAUUSD tester report (EA stopped opening trades)**:

- The total-lots cap was a fixed 0.50 while lots grow with the balance, and lock orders counted toward it. Once the managed basket was large enough, every recovery order was refused forever. The cap is now per 1,000 of balance and ignores lock orders.
- After a loss, 0.01 per 1,000 could fall below 0.01 lots. The EA then refused every entry and stayed idle. Balance-scaled lots now never go below the broker minimum.
- A recovery grid could keep averaging against a strong trend until the 50 % emergency. The **recovery basket stop** (20 %) closes that basket first.
- Under stress (paused, or account drawdown ≥ 10 %), a winning recovery group's surplus also cuts the worst losing opposite recovery orders.

**What changed compared with earlier versions**:

- A loss no longer stops the EA. The account-drawdown **pause** only blocks new exposure. The emergency close restarts automatically after a cooldown, and only the operator's Stop button halts trading permanently.
- Distances are in ATR multiples, so there are no point or digit mix-ups.
- Recovery follows the trend (both directions).
- MA entries wait for trend-filter confirmation.

> No setting guarantees profit. The simulator paths in `docs/TEST_RESULTS.md` are synthetic. Backtest on your symbol and run a demo account before going live.

---

## 1. Architecture at a glance

```
             ┌──────────────── OnTick ────────────────┐   OnTimer → dashboard repaint only
             ▼                                         │   OnChartEvent → buttons/edits/drag
  RM_Broker ──► RM_Registry.RM_BuildBook()  ──► g_book (ONE snapshot: planner + panels)
  (MarketInfo,     roles: ORIGINAL / LOCK / RECOVERY, adoption, partial-close lineage
   retries,                │
   no blind resend)        ▼
                  RM_Executor (open journal first) ─ persisted after every confirmed leg
                           │
                  RM_Engine: emergency → basket TP → launch check
                           │   RM_NextState()  (pure, unit-tested)
                           ▼
       PREPARING ─► LOCKING ─► RECOVERING ─► CLOSING ─► COMPLETE ─► IDLE
          │            │           │  └─ RM_PlanGroup / overlap (pure planner) → journal
          │            │           └──── grid engine + RM_Signals provider interface
          │            └──── net main exposure hedge only (recovery excluded)
          └──── once-only launch actions (flags persisted)
  RM_Persist: state file + instance lock      RM_Log: CSV audit      RM_Dashboard / RM_Annotations
```

| Module | File | Role |
|---|---|---|
| Types (portable) | `RM_Types.mqh` | enums (the `.set` contract), plain structs |
| Calculations (portable) | `RM_Calc.mqh` | lots, grid, point→money, launch, gates, lock size, totals |
| Planner (portable) | `RM_Planner.mqh` | group/overlap/reduce/basket plans, journal core, state transition |
| Configuration | `RM_Config.mqh` | validation with explanations, parsing, identity |
| Broker adapter | `RM_Broker.mqh` | metadata, send/close/modify with bounded retries and reconciliation |
| Ownership registry | `RM_Registry.mqh` | roles, adoption policy, lineage, external-close detection, book |
| Persistence | `RM_Persist.mqh` | state file, instance and magic locks |
| Signals | `RM_Signals.mqh` | provider interface: simple grid, candle reversal, swing trend, external adapter |
| Risk | `RM_Risk.mqh` | new-exposure gates, emergency stop |
| Executor | `RM_Executor.mqh` | journal-driven non-atomic multi-ticket closes |
| Engine | `RM_Engine.mqh` | state machine side effects, prepare, lock, grid, closures, operator actions |
| Dashboard | `RM_Dashboard.mqh` | three panels, confirmations, tester button polling |
| Annotations | `RM_Annotations.mqh` | profit labels, connectors, levels, chart colours |
| Log | `RM_Log.mqh` | names, CSV audit, notifications |
| Normal strategy | `RM_Normal.mqh` | independent Three-MA module: signals, lots, own averaging, virtual TP, overlap |
| Controller | `RM_Controller.mqh` | single authority for NORMAL → HANDOVER → RECOVERY → COOLDOWN, latch, trigger, restart |
| Cycle panel | `RM_DashCycle.mqh` | dashboard panel D and its buttons |
| Distance core (portable) | `RM_Distance.mqh` | unit modes, profiles, symbol resolution, tick alignment, migration formula |
| Distance service | `RM_DistanceSvc.mqh` | per-symbol conversion API, persisted unit contexts of active baskets, migration preview |
| Units panel | `RM_DashUnits.mqh` | dashboard panel E (distance information) |

Every order operation passes one permission gate (`RM_Permit` in `RM_Broker.mqh`), keyed by the calling actor (recovery, normal, operator, emergency, handover, test). That gate is what keeps the normal strategy and the recovery engine from ever managing the same basket.

The three "portable" headers contain no MT4 API calls, so the same files also compile natively with g++ for the calculation tests (see §10).

---

## 2. Installation and compilation

**Option A – single file (simplest).** Copy `MQL4/Experts/RecoveryManagerPro_Standalone.mq4` into `<Data Folder>/MQL4/Experts/` and compile it. It already contains every module, so no include folder is needed. It is generated from the modular sources by `tests/build_single_file.py`; edit the modular files, not this one.

**Option B – modular sources.** Compiling `RecoveryManagerPro.mq4` on its own fails with "function not defined" / "declaration without type" errors unless step 2 below is done.

1. Copy `MQL4/Experts/RecoveryManagerPro.mq4` into `<Data Folder>/MQL4/Experts/`.
2. Copy the folder `MQL4/Include/RecoveryManagerPro/` into `<Data Folder>/MQL4/Include/`. The include path must be exactly `MQL4/Include/RecoveryManagerPro/RM_*.mqh`.
3. Copy `MQL4/Presets/*.set` into `<Data Folder>/MQL4/Presets/` (optional).
4. Open `RecoveryManagerPro.mq4` in MetaEditor and press **F7 (Compile)**. It uses only `<stdlib.mqh>` from the standard MT4 installation, with no DLLs and no web requests.
5. Attach it to one chart of the symbol to manage, enable *AutoTrading* and *Allow live trading*, and load a preset or set the inputs.

**Compilation status of this delivery:** no MetaTrader 4 / MetaEditor was available in the environment where this was written, so **no `.ex4` is supplied and MetaEditor compilation has not been performed**. What was run is described in §10 (native compilation of the pure logic, a C++ syntax/consistency lint of the whole EA, and end-to-end runs against an in-memory broker). The first MetaEditor build may still report MQL-specific issues that a C++ compiler cannot detect. Please report them with the line numbers.

`.set` files begin with `;` comment lines. If your terminal refuses to load them, delete those lines.

---

## 3. Orders, roles and scope

| Role | Meaning | How identified |
|---|---|---|
| ORIGINAL | adopted order being recovered | registry entry, created by adoption (scope + policy) or manual ORIGINAL (comment `RMP<id> O`) |
| LOCK | hedge belonging to the main position | magic `InpLockMagic`, comment `RMP<id> L #n` |
| RECOVERY | profit-generating averaging order | magic `InpRecoveryMagic`, comment `RMP<id> R B|S <index> #n` |

- **Main position** = ORIGINAL + LOCK. **Managed basket** = main + RECOVERY. Each ticket is counted once, by its registry role.
- The EA acts on **the chart symbol only**, and only on **market** orders (pending orders are just deleted at launch, if enabled).
- **Scope** (`InpScope`):
  - *All orders on this symbol* – every market order on the symbol except this EA's own recovery/lock magics, anything in `InpExcludeMagics`, and any order whose comment belongs to *another* Recovery Manager Pro instance (`RMP<other id>`).
  - *Manual orders only* – magic 0.
  - *Magic allowlist* – magic ∈ `InpMagicList`.
- **Adoption of newly arriving orders** (`InpAdoptPolicy`): *until launch* (default: new in-scope orders are adopted while IDLE/ARMED, then the set is frozen), *never* (only the activation snapshot taken in IDLE), *always* (keeps adopting, including orders opened later by other EAs within the scope).
- **Partial closes:** MT4 gives the remainder a new ticket with comment `from #<old>`, and the registry moves the role to the new ticket. If the remainder cannot be identified within 60 s, the EA enters **ERROR_HOLD** rather than guessing.
- **External actions:** a managed order closed outside the EA is logged as `EXTERNAL_CLOSE` with its realised P/L. If that leaves the main position unequal and `InpRelockOnImbalance` is on, the EA re-locks. Otherwise new entries stay blocked and the reason is shown.
- **Several instances:** a lock keyed on account + symbol + `InpInstanceId`, plus a second lock on the recovery magic, refuses a second chart with ambiguous ownership. Give each instance its own id and magics.

---

## 4. State machine

| State | Meaning | Leaves when |
|---|---|---|
| IDLE | no main position ("No orders to recover") | an eligible order appears → ARMED |
| ARMED | orders adopted, waiting for the launch condition | instant / drawdown threshold reached → PREPARING (**exactly once per session**, persisted) |
| PREPARING | once-only launch actions: close other charts (only if explicitly enabled), delete pending orders, remove SL/TP, close profitable orders to finance loser reduction | all flags done → LOCKING (locking on) or RECOVERING |
| LOCKING | hedge `NetMainLots = MainBuyLots − MainSellLots` (recovery excluded), one order per tick, re-reading broker truth each time | balanced, or only an un-hedgeable residual remains (shown as "NOT neutral") → RECOVERING |
| RECOVERING | planner closes qualifying groups; grid opens recovery orders | basket empty → COMPLETE; main unequal + re-lock → LOCKING |
| PAUSED | Stop Recovery: automated opening **and** closing stopped; manual controls still work | Resume → previous state; Close All / emergency close-all → CLOSING |
| CLOSING | closing every managed ticket through the journal; no entries | everything reconciled → COMPLETE |
| COMPLETE | session summary, end notification, registry reset | next tick → IDLE |
| ERROR_HOLD | unsafe ambiguity (unresolved lineage, full registry). Nothing trades. | operator checks the orders and presses **Resume**. Unresolved lineages are dropped and logged. |

**Precedence:** error hold > emergency (if `InpEmergencyOverPause`) > operator pause > automation. An already-started closure transaction finishes during a pause, because it was approved before the pause. Emergency is not evaluated in ERROR_HOLD.

---

## 5. Recovery grid and closures

- The grid holds independent BUY and SELL baskets, each with its own anchor, bar gate and index.
- Lot for index *n*: `InitialRecoveryLot × LotMultiplier^n`, computed from the **unrounded** base and normalised only at the end (0.06 × 1.3 = 0.078 → 0.07 with floor rounding). Spacing before index *n* ≥ 1 is `InitialStep × StepMultiplier^(n−1)` points.
- Next BUY entry: Ask ≤ previous BUY fill − step. Next SELL entry: Bid ≥ previous SELL fill + step. This rule is **PROPOSED**.
- The first basket opens as soon as RECOVERING allows it (**PROPOSED**; the reference trigger is unresolved). The direction comes from the signal provider, or for the unfiltered grid from `InpFirstDirection`.
- Gates: allowed directions, multidirectional rule, one order per bar (persisted per direction), signal filter, `InpMaxEntriesPerEvent` (no catch-up bursts after gaps), lot/count caps, margin, spread, session hours, daily lockout. Every block is shown as a reason on the panel.
- **Closure plan** (built before anything is sent):
  - *Locked:* one main BUY and one main SELL ticket, chosen by priority (easy/hard first by loss per lot, with first-ticket override and a stable tie-break), are both reduced by the same legal slice.
  - *Unlocked:* one losing main ticket is reduced.
  - `ExpectedGroupNet = RecoveryCloseNet + MainBuySliceNet + MainSellSliceNet − UnbookedExitCosts − ExecutionBuffer`. Booked swap and commission are already inside ticket values, so they are not deducted twice.
  - The plan executes automatically only if `ExpectedGroupNet ≥ TargetMoney`, where `TargetMoney = PartialTPPoints × MoneyPerPointPerLot × basis lots`. Here `MoneyPerPointPerLot = TickValue × Point / TickSize` (**PROPOSED**), and 30 points is neither 30 pips nor 30 USD.
- **Overlap:** when the recovery count reaches the threshold, only the first and last recovery orders of the direction fund the slice, and the intermediate orders stay open. Overlap is never used on the final slice. The ≥ or > comparison is configurable because it is unresolved in the reference.
- **Execution:** the most profitable legs go first. The journal is saved after every confirmed leg. Legs are re-verified against history after a failure or restart, so realised profit is counted exactly once. New entries are blocked while a transaction is open.
- **Whole-basket TP** (optional) closes every managed role once the basket's net, after costs, reaches the currency target.

---

## 6. The three panels

**A. Main panel (upper left).** The title bar is also a drag handle (double-click, then drag; the position is remembered), with a status chip and a minimise button.

| Row | Content |
|---|---|
| State line | state name, signal provider, trend state |
| Main Position BUY / SELL | orders, lots, net floating P/L (profit + swap + commission) |
| Recovery Orders BUY / SELL | same columns |
| Total managed | count, lots, P/L |
| **Stop Recovery / Resume**, **Close All** | pause/resume; close every *managed* ticket (never unrelated positions) |
| Possible Closures | BUY/SELL volumes and P/L of the profit-financed reduction preview, net |
| **Reduce Volume** | executes that preview (net ≥ 0 by construction) |
| Managed drawdown | % of balance, current / peak (account currency) |
| Status lines | operational status and the current block reason |
| Account & session *(enhancement)* | balance/equity, free margin/margin level, spread/connection, realised session/day, floating account vs managed, lots per role |

**Chip colours:** green ACTIVE, amber WAITING/PAUSED, red ERROR/BLOCKED. Each chip also carries text, so colour is never the only signal.

**B. Current group (lower left).** It shows the selected main BUY and SELL tickets with size, planned slice and slice P/L; the recovery direction with count, lots and P/L; costs plus buffer; group lots and expected net; the target and READY/waiting; and the **Close Current Group** button. Closing the group manually is allowed below target, and the preview then says "REALISED LOSS".

**C. Manual orders (lower right).** It has a lot field with −/+ (validated against minimum lot and lot step, and an invalid value is rejected without changing anything), a role selector **ORIGINAL / RECOVERY** (an enhancement that replaces the ambiguous boolean; its default comes from `InpPanelOpensRecovery`), a line showing symbol + role + magic, and **Open Buy / Open Sell**.

**Confirmations:** with `InpConfirmActions`, Close All, Reduce Volume, Close Current Group and manual opens first show a preview with tickets, volumes and estimated P/L, and they execute only after **Confirm**. If the orders changed in the meantime, a fresh preview is shown instead. Previews expire after 15 s. Clicks are debounced.

**Chart objects:** yellow closed-profit labels move vertically to avoid the panels and each other. Dotted open→close connectors are drawn for closed legs, along with blue/orange dashed prospective recovery entry levels and an optional gold "possible close" line. That line is an *estimate* of where the current group reaches its target, a different object from the entry levels, and it is off in the video preset. The optional chart scheme (black background, green candles) is restored when the EA is removed. The Strategy Tester's Balance/Equity graph belongs to MT4 and is not part of this EA.

Everything uses the object prefix `RMP_`. Only this EA's objects are removed on deinit.

---

## 7. Operator actions

| Action | Effect | Allowed when |
|---|---|---|
| Stop Recovery | pause automation (opening **and** closing) | any active state |
| Resume | reconcile, return to the previous state; from ERROR_HOLD also accepts dropped lineages | PAUSED, ERROR_HOLD |
| Close All | CLOSING: every managed ticket via the journal | any state with managed orders except ERROR_HOLD |
| Reduce Volume | execute the profit-financed reduction preview | no open transaction, not CLOSING/ERROR_HOLD |
| Close Current Group | execute the current group even below target | same |
| Open Buy / Open Sell | ORIGINAL (magic `InpManualOriginalMagic`) or RECOVERY (recovery magic, next grid index, multidirectional rule applies) | same |

---

## 8. Restart behaviour and files

- The state file is `MQL4/Files/RecoveryManagerPro/<account>_<symbol>_<instance>.state`, prefixed `T_` in the tester. It is written after every state change, registry change and confirmed leg (write-then-rename). It holds the state, launch/prep/lock flags, per-direction bar gates and grid indices, the registry, pending lineages, an open journal and realised totals.
- On start the file is loaded, then **broker truth wins**. Open orders are re-read, vanished tickets are resolved from history, and an open journal is re-verified leg by leg.
- A timeframe change, parameter change or terminal restart never repeats launch clean-up and never adds a second lock. The simulator scenarios S04 and S15 cover this.
- To start a fresh session, remove the EA, delete the `.state` file and attach again.
- The CSV audit file `MQL4/Files/RecoveryManagerPro/<account>_<symbol>_<instance>_audit.csv` has the columns `server_time,state,event,ticket,lots,value,detail`. Its events are: `ADOPT, STATE, PLAN, LEG_FILLED, LEG_FAILED, LEG_RECONCILED, LEG_SKIP, PLAN_DONE, PLAN_ABORT, ENTRY, ENTRY_FAILED, ENTRY_REFUSED, LOCK_OPEN, LOCK_RESIDUAL, LINEAGE, EXTERNAL_CLOSE, EXTERNAL_PARTIAL, PENDING_DELETED, SLTP_REMOVED, EMERGENCY, BASKET_TP, OPERATOR, CHART_PREVIEW, SESSION_END` and a few others. In the Strategy Tester these files are under `tester/files/`.

---

## 9. Inputs

The tables below list **every** input. Only the 25 in section 0 are shown in the input window. The rest are advanced (see `RMP_SHOW_ADVANCED`). The Default column is the built-in value. The Video and Conservative presets set advanced values, so load them into a build compiled with `RMP_SHOW_ADVANCED`.

#### Added with the 25-setting restructure

| Input | Visible | Default | Meaning |
|---|---|---|---|
| `InpSpacingMode` | yes | `RM_SPACE_ATR` | ATR = distances are ATR multiples. UNITS = the distance-unit inputs of section 13. |
| `InpNormalTPATR` | yes | `1.0` | Normal basket TP [× ATR, 0 = off] |
| `InpNormalAvgATR` | yes | `1.5` | Normal averaging step [× ATR] |
| `InpGridATR` | yes | `1.5` | Recovery grid base step [× ATR] |
| `InpFreezeDDPct` | yes | `20.0` | Pause new trades at this account drawdown [% of balance, 0 = off] |
| `InpATRPeriod` | no | `14` | ATR period (signal timeframe, closed candles) |
| `InpPartialTPATR` | no | `0.3` | Recovery partial-close target [× ATR] |
| `InpNormalOverlapATR` | no | `0.3` | Normal overlap target [× ATR] |
| `InpFreezeResumePct` | no | `15.0` | Resume new trades below this drawdown [%] |
| `InpEmergencyAutoResume` | no | `true` | Resume automatically after an emergency close |
| `InpEmergencyCooldownBars` | no | `24` | Candles to wait after an emergency close |
| `InpSignalConfirmBars` | no | `20` | Candles a crossover may wait for the trend filter [0 = same candle only] |
| `InpShowUnitsPanel` | no | `false` | Show the distance-units panel |
| `InpRecBasketStopPct` | yes | `20.0` | Close a recovery basket at this loss [% of balance, 0 = off]; that direction waits `InpEmergencyCooldownBars` |
| `InpCrossFinance` | no | `true` | A qualifying group's surplus also closes losing opposite recovery orders (only under stress) |
| `InpCrossFinanceDDPct` | no | `10.0` | ...from this account drawdown [%] or while new trades are paused |
| `InpPauseAllowsHedge` | no | `false` | During the pause / lots cap, still allow orders that shrink net exposure |
| `InpRecoveryMATrend` | no | `false` | Recovery orders only in the MA trend direction (slow MA vs filter MA) |

In balance lot mode, `InpFirstLot`, `InpMaxRecoveryLot` and `InpMaxManagedLots` are per `InpNormalLotPerBalance` (1,000) of balance.

`InpNormalMaxSpread` was removed: `InpMaxSpread` now applies to all entries.

Units are given in brackets. Invalid values or combinations stop initialisation with an explanation in the Experts log, for example: "overlap threshold must be 0 (off) or >= 2", "recovery/lock magic appears in the managed allowlist", "'Other EAs at launch' closes charts; set InpAllowChartClosure=true…". Enum values in `.set` files are the integers in `RM_Types.mqh`.

#### 1. Managed orders

| Input | Type | Default (= Three-MA preset) | Video | Conservative | Meaning [unit] |
|---|---|---|---|---|---|
| `InpRecoveryPriority` | ENUM_RM_PRIORITY | `RM_PRIO_EASY_FIRST` | `0` | `0` | Recovery priority |
| `InpScope` | ENUM_RM_SCOPE | `RM_SCOPE_ALL_SYMBOL` | `0` | `1` | Managed-order scope (this symbol only) |
| `InpMagicList` | string | `"0"` | `12345,54321,0` | `0` | Magic allowlist, comma separated (MAGIC_LIST scope) |
| `InpExcludeMagics` | string | (empty) | (empty) | (empty) | Magics never adopted (any scope) |
| `InpAdoptPolicy` | ENUM_RM_ADOPT | `RM_ADOPT_UNTIL_LAUNCH` | `0` | `0` | Adoption of newly arriving orders |
| `InpFirstRecoveryTicket` | int | `0` | `0` | `0` | First ticket to recover (0 = unused) |

#### 2. Launch

| Input | Type | Default (= Three-MA preset) | Video | Conservative | Meaning [unit] |
|---|---|---|---|---|---|
| `InpLocking` | bool | `true` | `1` | `1` | Lock (hedge) the main position |
| `InpDeleteSLTP` | ENUM_RM_SLTP | `RM_SLTP_LAUNCH_ONLY` | `1` | `1` | Delete SL and TP of managed orders |
| `InpLaunchMode` | ENUM_RM_LAUNCH | `RM_LAUNCH_INSTANT` | `0` | `1` | Launch mode |
| `InpLaunchDrawdown` | double | `8.0` | `35.0` | `5.0` | Launch drawdown [% of balance or account currency] |
| `InpOtherEAs` | ENUM_RM_OTHER_EA | `RM_OTHER_KEEP` | `0` | `0` | Other EAs at launch (closes charts!) |
| `InpAllowChartClosure` | bool | `false` | `0` | `0` | Operator enablement for chart closure |
| `InpCloseProfitable` | bool | `false` | `1` | `1` | Close profitable orders at launch (finance losers) |
| `InpDeletePending` | bool | `true` | `1` | `1` | Delete in-scope pending orders at launch |

#### 3. Partial closing

| Input | Type | Default (= Three-MA preset) | Video | Conservative | Meaning [unit] |
|---|---|---|---|---|---|
| `InpPartialLots` | double | `0.01` | `0.03` | `0.01` | Partial-close volume per main side [lots] |
| `InpPartialTPPoints` | double | `30.0` | `30` | `30` | Partial-close TP [distance units, section 13] |
| `InpTPBasis` | ENUM_RM_TP_BASIS | `RM_TPB_RECOVERY_LOTS` | `0` | `0` | TP points-to-money lot basis (PROPOSED) |
| `InpOverlapThreshold` | int | `3` | `2` | `3` | Overlap threshold [recovery orders, 0 = off] |
| `InpOverlapCompare` | ENUM_RM_OVERLAP_CMP | `RM_OVL_GE` | `0` | `0` | Overlap comparison (UNRESOLVED in reference) |
| `InpOverlapIndex` | ENUM_RM_OVERLAP_INDEX | `RM_OVIDX_RECOUNT` | `0` | `0` | Grid index after overlap closure |
| `InpBasketTP` | bool | `false` | `0` | `0` | Whole-basket TP enabled |
| `InpBasketTPMoney` | double | `25.0` | `25.0` | `25.0` | Whole-basket TP [account currency] |

#### 4. Recovery orders

| Input | Type | Default (= Three-MA preset) | Video | Conservative | Meaning [unit] |
|---|---|---|---|---|---|
| `InpSignalMode` | ENUM_RM_SIGNAL | `RM_SIG_TREND` | `0` | `0` | Recovery filter |
| `InpRecoveryDirs` | ENUM_RM_DIRS | `RM_DIRS_BOTH` | `0` | `0` | Allowed recovery directions |
| `InpFirstLot` | double | `0.01` | `0.06` | `0.01` | First recovery order volume [lots] |
| `InpLotMultiplier` | double | `1.2` | `1.3` | `1.2` | Volume multiplier [x, >= 1] |
| `InpGridStepPoints` | double | `300` | `200` | `300` | Recovery grid step [distance units, section 13] |
| `InpStepMultiplier` | double | `1.1` | `1.0` | `1.1` | Step multiplier [x] |
| `InpOnePerBar` | bool | `true` | `1` | `1` | One recovery order per bar |
| `InpMultidirectional` | bool | `true` | `0` | `0` | Multidirectional recovery |
| `InpMaxSlippage` | int | `30` | `30` | `30` | Maximum slippage [distance units, section 13] |
| `InpMaxSpread` | int | `50` | `7500` | `50` | Maximum spread for NEW exposure [distance units] |
| `InpMaxRecoveryLot` | double | `0.10` | `100.0` | `0.10` | Maximum recovery order volume [lots] |
| `InpMaxRecoveryCount` | int | `8` | `100` | `10` | Maximum recovery orders (both directions) |
| `InpRecoveryMagic` | int | `9751421` | `9751421` | `9751421` | Recovery magic number |
| `InpLockMagic` | int | `9751422` | `9751422` | `9751422` | Lock (hedge) magic number (PROPOSED) |
| `InpLotRounding` | ENUM_RM_LOT_ROUND | `RM_ROUND_DOWN` | `0` | `0` | Final lot normalisation |
| `InpCapBehavior` | ENUM_RM_CAP | `RM_CAP_REFUSE` | `0` | `0` | Lot above maximum: refuse or clamp |
| `InpFirstDirection` | ENUM_RM_FIRST_DIR | `RM_FD_LAST_CANDLE` | `0` | `0` | First basket direction (unfiltered, PROPOSED) |
| `InpMaxEntriesPerEvent` | int | `1` | `1` | `1` | Max recovery entries per tick (gap guard) |
| `InpRelockOnImbalance` | bool | `true` | `1` | `1` | Re-lock automatically if main becomes unequal |

#### 5. Costs

| Input | Type | Default (= Three-MA preset) | Video | Conservative | Meaning [unit] |
|---|---|---|---|---|---|
| `InpFullCommission` | bool | `false` | `0` | `0` | Full commission calc (exit = booked again) |
| `InpExtraCommPerLot` | double | `0.0` | `0.0` | `0.0` | Extra unbooked exit commission [money/lot] |
| `InpExecBufferPoints` | double | `5.0` | `0.0` | `5.0` | Execution buffer [distance units per closed lot] |

#### 6. Notifications

| Input | Type | Default (= Three-MA preset) | Video | Conservative | Meaning [unit] |
|---|---|---|---|---|---|
| `InpNotify` | ENUM_RM_NOTIFY | `RM_NOTIFY_ALERT` | `0` | `1` | Launch / end notifications |

#### 7. Panel and graphics

| Input | Type | Default (= Three-MA preset) | Video | Conservative | Meaning [unit] |
|---|---|---|---|---|---|
| `InpPanelOpensRecovery` | bool | `false` | `0` | `0` | Manual panel default role: true = RECOVERY |
| `InpManualLot` | double | `0.01` | `0.10` | `0.01` | Manual panel initial volume [lots] |
| `InpConfirmActions` | bool | `true` | `1` | `1` | Two-click confirmation for destructive actions |
| `InpTheme` | ENUM_RM_THEME | `RM_THEME_DARK` | `0` | `0` | Panel theme |
| `InpAnnotations` | ENUM_RM_ANNOT | `RM_ANNOT_CHART` | `1` | `1` | Closed-profit annotations |
| `InpPanelSize` | ENUM_RM_PANEL_SIZE | `RM_PANEL_NORMAL` | `1` | `1` | Panel size |
| `InpFontSize` | int | `8` | `6` | `8` | Font size [5..14] (reference: 6) |
| `InpShowCloseLine` | bool | `true` | `0` | `1` | Possible-close-zone line |
| `InpShowGridLevels` | bool | `true` | `1` | `1` | Next recovery entry levels |
| `InpDrawConnectors` | bool | `true` | `1` | `1` | Dotted open->close connectors |
| `InpApplyChartColors` | bool | `false` | `1` | `0` | Black chart / green candles scheme |
| `InpPanelX` | int | `8` | `8` | `8` | Main panel X offset [px] |
| `InpPanelY` | int | `22` | `22` | `22` | Main panel Y offset [px] |
| `InpShowAccountBlock` | bool | `true` | `0` | `1` | ENHANCEMENT: account & session metrics |

#### 8. Signal filters

| Input | Type | Default (= Three-MA preset) | Video | Conservative | Meaning [unit] |
|---|---|---|---|---|---|
| `InpTrendTF` | ENUM_TIMEFRAMES | `PERIOD_CURRENT` | `0` | `0` | Filter timeframe |
| `InpTrendAmplitude` | int | `20` | `4` | `4` | Trend amplitude [bars] |
| `InpTrendFirst` | ENUM_RM_TREND_FIRST | `RM_TF_WITH_TREND` | `0` | `0` | Initial entry vs trend |
| `InpTrendNext` | ENUM_RM_TREND_NEXT | `RM_TN_WITH_TREND` | `0` | `0` | Subsequent averaging vs trend |
| `InpExtIndicator` | string | (empty) | (empty) | (empty) | External adapter: indicator name (licensed) |
| `InpExtBuyBuffer` | int | `0` | `0` | `0` | External adapter: BUY buffer index |
| `InpExtSellBuffer` | int | `1` | `1` | `1` | External adapter: SELL buffer index |

#### 9. Risk (ENHANCEMENTS)

| Input | Type | Default (= Three-MA preset) | Video | Conservative | Meaning [unit] |
|---|---|---|---|---|---|
| `InpMaxManagedLots` | double | `0.50` | `0.0` | `1.0` | Max combined managed lots [0 = off] |
| `InpMaxRecoveryLotsSum` | double | `0.0` | `0.0` | `0.50` | Max total recovery lots [0 = off] |
| `InpMinFreeMargin` | double | `0.0` | `0.0` | `0.0` | Min free margin for new entries [money] |
| `InpMinMarginLevel` | double | `300.0` | `0.0` | `300.0` | Min margin level for new entries [%] |
| `InpEmergencyMode` | ENUM_RM_EMERGENCY | `RM_EMG_PERCENT` | `0` | `2` | Emergency stop measure |
| `InpEmergencyValue` | double | `50.0` | `30.0` | `15.0` | Emergency threshold [money or %] |
| `InpEmergencyAction` | ENUM_RM_EMG_ACTION | `RM_EMGA_CLOSE_ALL` | `0` | `0` | Emergency action |
| `InpEmergencyOverPause` | bool | `true` | `1` | `1` | Emergency also acts while paused |
| `InpDailyLossLimit` | double | `0.0` | `0.0` | `0.0` | Daily realised loss lockout [money, 0 = off] |
| `InpSessionStartHour` | int | `0` | `0` | `0` | New entries from hour [server, 0-23] |
| `InpSessionEndHour` | int | `24` | `24` | `24` | New entries until hour [server, 1-24] |
| `InpStaleQuoteSeconds` | int | `60` | `0` | `60` | Block entries if last quote older [s, 0 = off] |
| `InpAuditCsv` | bool | `true` | `1` | `1` | CSV audit export |
| `InpInstanceId` | int | `1` | `1` | `1` | Strategy / instance id (lock key) |
| `InpManualOriginalMagic` | int | `0` | `0` | `0` | Magic for manual ORIGINAL orders |

#### 10. Strategy Tester only

| Input | Type | Default (= Three-MA preset) | Video | Conservative | Meaning [unit] |
|---|---|---|---|---|---|
| `InpEnableTestSeeds` | bool | `false` | `0` | `0` | Enable deterministic seed orders (tester only) |
| `InpTestSeedScenario` | ENUM_RM_TEST_SEED | `RM_SEED_NONE` | `0` | `0` | Seed scenario |
| `InpTestSeedLots` | double | `0.10` | `0.10` | `0.10` | Seed volume [lots] |
| `InpTestSeedBar` | int | `5` | `5` | `5` | Open seeds on this bar count |
| `InpTestSeedMagic` | int | `12345` | `12345` | `12345` | Seed magic number |

#### 11. Operating mode and recovery handover

| Input | Type | Default (= Three-MA preset) | Video | Conservative | Meaning [unit] |
|---|---|---|---|---|---|
| `InpOperatingMode` | ENUM_RM_OPMODE | `RM_OP_THREE_MA_WITH_RECOVERY` | `0` | `0` | Operating mode |
| `InpRecoveryTriggerMode` | ENUM_RM_TRIG_MODE | `RM_TRIG_PERCENT` | `0` | `0` | Handover trigger unit (threshold = InpLaunchDrawdown) |
| `InpRecoveryTriggerScope` | ENUM_RM_TRIG_SCOPE | `RM_TSCOPE_MANAGED` | `0` | `0` | Handover trigger scope |
| `InpAutoResumeAfterRecovery` | bool | `true` | `1` | `1` | Resume normal trading automatically after a completed cycle |
| `InpResumeCooldownBars` | int | `3` | `3` | `3` | Cooldown after cycle end [signal-timeframe bars] |
| `InpRequireFreshSignalAfterRecovery` | bool | `true` | `1` | `1` | Only crossovers whose candle opens after the cycle |
| `InpCombinedAdoptOthers` | bool | `false` | `0` | `0` | Also hand over orders in the section-1 scope (normally only own normal trades) |

#### 12. Three-MA normal strategy (project defaults, not the reference EA's)

| Input | Type | Default (= Three-MA preset) | Video | Conservative | Meaning [unit] |
|---|---|---|---|---|---|
| `InpNormalMagic` | int | `7351001` | `7351001` | `7351001` | Normal-strategy magic number |
| `InpSignalTF` | ENUM_TIMEFRAMES | `PERIOD_CURRENT` | `0` | `0` | Signal timeframe |
| `InpFastPeriod` | int | `10` | `10` | `10` | Fast MA period [bars] |
| `InpFastMethod` | ENUM_MA_METHOD | `MODE_EMA` | `1` | `1` | Fast MA method |
| `InpFastPrice` | ENUM_APPLIED_PRICE | `PRICE_CLOSE` | `0` | `0` | Fast MA applied price |
| `InpSlowPeriod` | int | `30` | `30` | `30` | Slow MA period [bars] |
| `InpSlowMethod` | ENUM_MA_METHOD | `MODE_EMA` | `1` | `1` | Slow MA method |
| `InpSlowPrice` | ENUM_APPLIED_PRICE | `PRICE_CLOSE` | `0` | `0` | Slow MA applied price |
| `InpUseFilterMA` | bool | `true` | `1` | `1` | Third (filter) MA enabled |
| `InpFilterPeriod` | int | `100` | `100` | `100` | Filter MA period [bars] |
| `InpFilterMethod` | ENUM_MA_METHOD | `MODE_SMA` | `0` | `0` | Filter MA method |
| `InpFilterPrice` | ENUM_APPLIED_PRICE | `PRICE_CLOSE` | `0` | `0` | Filter MA applied price |
| `InpNormalDirs` | ENUM_RM_DIRS | `RM_DIRS_BOTH` | `0` | `0` | Allowed normal directions |
| `InpNormalOneBasket` | bool | `true` | `1` | `1` | Ignore new signals while any normal basket is open |
| `InpNormalLotMode` | ENUM_RM_NLOT | `RM_NLOT_BALANCE` | `0` | `0` | Initial lot: fixed or balance-based |
| `InpNormalLot` | double | `0.01` | `0.01` | `0.01` | Initial lot [lots] (per InpNormalLotPerBalance in balance mode) |
| `InpNormalLotPerBalance` | double | `1000.0` | `1000.0` | `1000.0` | Balance per InpNormalLot [account currency] |
| `InpNormalAveraging` | bool | `true` | `0` | `0` | Normal averaging enabled |
| `InpNormalAvgStepPoints` | double | `300` | `300` | `300` | Minimum averaging spacing from last fill [distance units] |
| `InpNormalAvgMultiplier` | double | `1.3` | `1.5` | `1.5` | Averaging lot multiplier [x] |
| `InpNormalMaxPerDir` | int | `3` | `5` | `5` | Maximum normal orders per direction |
| `InpNormalMaxLots` | double | `0.0` | `1.0` | `1.0` | Maximum total normal exposure [lots, 0 = off] |
| `InpNormalTPPoints` | double | `200` | `200` | `200` | Virtual basket TP from weighted average [distance units, 0 = off] |
| `InpNormalOverlap` | bool | `false` | `0` | `0` | First/last-order overlap for normal baskets |
| `InpNormalOverlapMinOrders` | int | `3` | `3` | `3` | Overlap from this many orders in a direction |
| `InpNormalOverlapTPPoints` | double | `50` | `50` | `50` | Overlap target [distance units x lots of the two orders] |
| `InpNormalSlippage` | int | `30` | `30` | `30` | Normal-strategy slippage [distance units] |

#### 13. Distance units (price-distance normalisation)

| Input | Type | Default (= Three-MA preset) | Video | Conservative | Meaning [unit] |
|---|---|---|---|---|---|
| `InpConfigVersion` | int | `2` | `2` | `2` | Config version: 0/1 legacy = broker points, 2 = unit mode below |
| `InpDistanceUnitMode` | ENUM_RM_DIST_MODE | `RM_DU_STANDARDIZED` | `0` | `0` | Distance unit mode (used from config version 2) |
| `InpCustomUnitPrice` | double | `0.0` | `0.0` | `0.0` | CUSTOM_UNIT: price value of one unit |
| `InpSymbolProfileMap` | string | `"GOLD:XAUUSD"` | `GOLD:XAUUSD` | `GOLD:XAUUSD` | Explicit aliases SYMBOL:PROFILE (FX, FXJPY, XAUUSD) |
| `InpSymbolPrefix` | string | (empty) | (empty) | (empty) | Broker symbol prefix stripped for map lookup |
| `InpSymbolSuffix` | string | (empty) | (empty) | (empty) | Broker symbol suffix stripped for map lookup |
| `InpUnitOverrides` | string | (empty) | (empty) | (empty) | Per-symbol unit price SYMBOL:PRICE (e.g. XAGUSD:0.001) |
| `InpApplyUnitsToActiveCycle` | bool | `false` | `0` | `0` | Operator: re-apply current units to an ACTIVE basket |
| `InpWriteMigrationPreview` | bool | `true` | `1` | `1` | Legacy config: write a migration preview .set |

**Notes on specific inputs**

- **Distance units.** Every input marked *[distance units]* (grid step, partial-close TP, execution buffer, spread and slippage limits, normal averaging, TP and overlap) is converted as `input × unit price` for the chart symbol. From `InpConfigVersion=2` (the default) the unit is set by `InpDistanceUnitMode`. With version 0/1 (legacy) inputs stay **broker points**, a notice is logged and a migration preview is written. See [`docs/DISTANCE_UNITS.md`](docs/DISTANCE_UNITS.md). Example: on XAUUSD, 100 standardized points = 1.00 price on both 2- and 3-digit quotes.

- `InpLaunchDrawdown` is the single drawdown threshold. In `RECOVERY_ONLY` its unit comes from `InpLaunchMode`. In `THREE_MA_WITH_RECOVERY` its unit comes from `InpRecoveryTriggerMode`, `InpLaunchMode` (including *Instant start*) is ignored, and only the controller's latch starts recovery. Changing it during an active cycle does not cancel the cycle.
- `InpEmergency*` is the **emergency-loss limit**. It is a separate control from the recovery-launch threshold: in combined mode validation requires it to be larger when both use the same unit, and an emergency close never restarts normal trading automatically.

- `InpDeleteSLTP`: *launch only* is the documented interpretation of the reference switch. *Continuous* is an **enhancement** that keeps removing SL/TP from ORIGINAL orders while recovering. The EA offers no manual SL/TP editor, because per-ticket stops would break the lock.
- `InpOtherEAs`: this closes whole **charts**. It cannot switch off another EA's internal logic, and MQL4 has no way to tell which chart hosts an EA, so charts are chosen **by symbol only**: *other charts of this symbol* or *all other charts*. It always excludes this EA's own chart and needs the separate `InpAllowChartClosure=true`. A preview of the affected charts (symbol/period) is written to the log at start (`CHART_PREVIEW`). It is ignored in the tester.
- `InpFullCommission` (**PROPOSED** mapping): *true* assumes the exit side costs as much again as the booked commission. `InpExtraCommPerLot` adds an explicit per-lot exit cost for brokers that charge on close.
- `InpTPBasis`: which lots convert the TP points into money. It defaults to the lots of the recovery orders being closed (**PROPOSED**).
- Test seeds work only when `IsTesting()` is true, `InpEnableTestSeeds=true` and a scenario is selected. Seeds use the comment `TEST SEED` and magic `InpTestSeedMagic`. They are ignored, with a log line, outside the tester.

---

## 10. Testing

Run all automated checks (needs `g++` and `python3`):

```bash
./tests/run_all.sh
```

| Layer | What it proves | What it does not prove |
|---|---|---|
| `tests/test_calc.cpp` (289 checks) | the real `RM_Types/RM_Calc/RM_Planner.mqh` compiled natively: lot maths, point→money for Forex and non-standard tick sizes, the worked +3.50 example, remainders, overlap boundaries, priority, reduce planner, journal idempotency, state transitions | MT4 API behaviour |
| `tests/mql_lint/mql_lint.py` | the whole EA, after rewriting MQL-only syntax, passes `g++ -fsyntax-only` against a declared MT4 API: no undeclared names, typos, argument-count or gross type errors | MetaEditor acceptance |
| `--sim tests/test_engine_sim.cpp` (44 scenarios) | the EA source runs `OnInit/OnTick/OnDeinit` and the button handlers against an in-memory broker with partial-close lineage, history, files, globals and fault injection | real broker timing, tester modelling, visual rendering |
| `--presets` | all three `.set` files (no duplicate or missing keys) pass the EA's own validation and run | profitability |

See [`docs/TEST_RESULTS.md`](docs/TEST_RESULTS.md) for the recorded output, and [`docs/VISUAL_TEST_PROCEDURES.md`](docs/VISUAL_TEST_PROCEDURES.md) for MT4 Strategy Tester procedures and what to record.

---

## 11. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| "No orders to recover" | Nothing in scope on this symbol. Check `InpScope`, `InpMagicList`, `InpExcludeMagics`, and that the orders are market orders on the chart symbol. |
| Stays ARMED | The launch threshold has not been reached. The status line shows the current vs required drawdown. |
| "Lock blocked: insufficient free margin" | The hedge cannot be opened. Add margin or reduce exposure. New recovery entries stay blocked meanwhile. |
| "Unhedged residual … NOT neutral" | Net main volume is below the lot step or minimum lot and cannot be hedged exactly. |
| BLOCKED chip, "spread … > max" | New exposure is blocked by `InpMaxSpread`. Closures and emergency actions are not blocked by spread. |
| ERROR_HOLD "remainder … not found" | A partial close left a remainder the EA could not identify. Check the account's open orders, then press Resume. The lineage is dropped and logged. |
| Refused to start: "another chart already runs instance" | Another chart runs the same account + symbol + instance id or recovery magic. Change `InpInstanceId` and the magics, or remove the other copy. |
| "VANISHED … check history filter" | A managed ticket is gone and is not in the visible history. Set the terminal's Account History tab to *All history*. |
| `.set` will not load | Delete the `;` comment lines. |
| Buttons do nothing in the tester | Use *Visual mode*. The EA polls button states because MT4's tester sends no chart events. The lot field is read when a button is pressed. |

---

## 12. Documentation

- [`docs/COMBINED_MODE.md`](docs/COMBINED_MODE.md): Three-MA normal trading, the drawdown handover, the latch, completion and resumption.
- [`docs/DISTANCE_UNITS.md`](docs/DISTANCE_UNITS.md): distance units, symbol profiles, the conversion service, replaced calculations and migration.
- [`CHANGES.md`](CHANGES.md): change summary.
- [`docs/EVIDENCE_MATRIX.md`](docs/EVIDENCE_MATRIX.md): each requirement with its evidence class (VIDEO / DOCUMENTED / PROPOSED / UNRESOLVED), implementation and test.
- [`docs/GAP_REPORT.md`](docs/GAP_REPORT.md): what is reproduced, independently approximated, or blocked.
- [`docs/VISUAL_TEST_PROCEDURES.md`](docs/VISUAL_TEST_PROCEDURES.md): MT4 procedures for the 18 acceptance items.
- [`docs/TEST_RESULTS.md`](docs/TEST_RESULTS.md): recorded automated test output.

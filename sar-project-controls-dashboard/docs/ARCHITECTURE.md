# Architecture

```
┌──────────────────────────────── UI layer (PySide6) ────────────────────────────────┐
│ main_window · import_wizard · pages/* · widgets (KPI card, Gantt, charts, tables)   │
│ no business logic - pages read DashboardData and call facade methods               │
└───────────────▲───────────────────────────────────────────────▲────────────────────┘
                │                                               │ exports
┌───────────────┴──── Application / service layer ──────────────┴─────────────────────┐
│ services/pipeline   (import → normalize → reconcile → classify → context)           │
│ services/dashboard  (build(ctx, filter) → DashboardData;  ContextCache)             │
│ services/workspace  (SQLite .sarpcd: schedules, profile, settings, risks, audit)    │
│ services/serialize  (safe JSON codec - no pickle)                                   │
└──────▲──────────────────▲─────────────────────▲───────────────────▲─────────────────┘
       │                  │                     │                   │
┌──────┴──────┐  ┌────────┴────────┐  ┌─────────┴─────────┐  ┌──────┴───────────────┐
│ core        │  │ mapping         │  │ analysis          │  │ reporting            │
│ xer_parser  │  │ text (normalize,│  │ matching          │  │ charts (shared)      │
│ xer_fields ◄┼──┤  stem, fuzzy)   │  │ context (ActRow)  │  │ dashboard_image      │
│ loader      │  │ profile (JSON)  │  │ critical          │  │ pdf (ReportLab)      │
│ model       │  │ classifier      │  │ metrics (progress,│  │ excel (openpyxl)     │
│ dates       │  │  (confidence)   │  │  S-curve, EVM,    │  │ style (SAR palette)  │
└─────────────┘  └─────────────────┘  │  lookahead, ...)  │  └──────────────────────┘
                                      │ health · validation│
                                      │ changes · risk     │
                                      │ filters · kpi      │
                                      │ calindex (numpy)   │
                                      └────────────────────┘
```

## Data flow

1. **XER parser** (`core/xer_parser.py`) reads the tab-delimited export into tables of row lists
   (low memory), detecting encoding (UTF-8 / BOM / UTF-16 / cp1252) and tolerating malformed rows,
   duplicate tables and missing header.
2. **Field mapping layer** (`core/xer_fields.py`) is the only place that knows XER column names.
3. **Loader** (`core/loader.py`) builds the normalized `Schedule` for one selected project: WBS tree,
   activities, relationships, calendars (parsed `clndr_data`), activity codes, UDFs, resource and
   expense costs, plus *availability flags* (cost, actual cost, resources, Longest Path flag…) that
   drive graceful degradation and user-facing messages.
4. **Reconciliation** (`analysis/matching.py`) pairs baseline and current activities.
5. **Semantic classification** (`mapping/classifier.py`) assigns categories with confidence and evidence.
6. **ProjectContext** (`analysis/context.py`) joins everything into one `ActRow` per activity (current
   activities, plus baseline-only rows for deleted/split parents) with weights, variances, dimensions
   and critical flags. All KPI functions operate on lists of rows, so filtering = passing a subset.
7. **DashboardData** (`services/dashboard.py`) is recomputed on every filter change (fast, in-memory);
   filter-independent results (health, validation, change analysis) are cached per context.
8. **Workspace** persists the *normalized* schedules (compressed JSON) so XER files are parsed only at
   import; re-opening a project never re-parses.

## Semantic Mapping Engine

Signals and default weights (all editable in the profile):

| Signal | Weight | Notes |
|---|---|---|
| Manual override | absolute | Activity ID › code value › WBS (nearest node wins) |
| Activity name keywords | 2.0 | phrases, stems, synonyms, fuzzy (≥ 0.88) for words ≥ 6 chars |
| WBS path | 2.5 × 0.6^depth | nearest WBS node strongest |
| Activity code value, Phase-type code | 3.5 | code type detected as *Phase* |
| Activity code value, other / Discipline | 1.5 | location / contractor codes ignored for phase |
| Activity ID prefix | 1.0 | e.g. `ENG-1000` |
| Text UDF (phase/discipline label) | 1.5 | |
| Logic neighbours | 0.8 | only when direct evidence is weak |

Each signal contributes `weight × min(1, raw) × share`. Confidence = top share × min(1, evidence / 3).
Keyword `suppress_if` lists implement context rules (e.g. *material* is not Procurement evidence when
*design*, *engineering* or *support* is present, so "Design Material Support" stays Engineering).
Thresholds: High ≥ 85 %, Medium ≥ 60 %, Low below → Mapping Review.

The engine is fully offline. A local embedding model could be added as an additional signal behind
the same `KeywordMatcher.score()` interface without changing the rest of the system.

## Reconciliation

1. User decisions (`profile.match_overrides`) › 2. Activity ID › 3. Split detection (≥ 2 added
activities in the same WBS whose names contain the baseline name) › 4. Similarity
(0.45 name token-set + 0.20 WBS path + 0.20 matched neighbours + 0.10 duration + 0.05 codes), blocked
by shared name tokens for speed. Accepted automatically only if score ≥ 0.80, name ≥ 0.60 and the
margin over the next candidate ≥ 0.05 (*Potentially Renamed*); candidates ≥ 0.55 remain *Unmatched*
for review; the rest are *Added* / *Deleted*. Matched pairs with structural differences are *Modified*.

## Performance

* Row-list tables, cached date parsing, O(1) working-day counts (prefix sums per calendar).
* Time-phasing uses numpy difference arrays (O(activities + days × calendars)).
* Measured on a synthetic schedule (Linux container, single core, both baseline and current):

  | Activities | Parse + normalize (2 files) | Match + classify + context | All KPIs + health + validation |
  |---|---|---|---|
  | 10,000 | 0.8 s | 1.6 s | 0.4 s |
  | 50,000 | 6.3 s | 9.5 s | 2.1 s |

  A filter change recomputes only the KPI column (≈ 2 s at 50k). `test_performance_10k_activities` guards regressions.
* Parsing and recalculation run in a `QThread`; the UI stays responsive with a progress dialog.

## Security / offline

No network calls. Workspaces are local SQLite files; deserialization uses a whitelisted JSON codec
(no pickle), so a workspace received from a third party cannot execute code.

## Extending

* New XER column / P6 version → `core/xer_fields.py`.
* New category, keyword, synonym or stage → Settings screen or the profile JSON (`config/default_mapping_profile.json`).
* New KPI → function in `analysis/metrics.py` returning a `KPI` + entry in `analysis/methodology.py`.

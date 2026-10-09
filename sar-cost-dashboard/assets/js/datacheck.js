/* Data checks: tests the loaded data for values that are not logical, out of date or that disagree between the source files,
   and shows them as warnings — the "Data Checks" page, the header chip and a box on each project's dashboard / card.
   window.SARChecks = { run(D) → { list, counts, byCode }, page(ctx), inline(host, code), chip(), RULES }
   A finding: { id, rule, sev: "error" | "warn" | "info", code, name, src, field, msg, go: [pageId, state] }
     error = not logical (impossible value) · warn = needs update (passed dates, missing entries) · info = check (sources disagree) */
(function () {
  "use strict";
  var U = window.UI, esc = U.esc, fmt = U.fmt, N = U.toNum;
  var SEV = { error: "Not logical", warn: "Needs update", info: "Check" };
  var SEV_ORDER = { error: 0, warn: 1, info: 2 };

  /* every rule, for the "What is checked" list (keep in step with the code below) */
  var RULES = [
    ["Weekly report", "error", "Progress % (planned / actual, cumulative / this week) below 0% or above 100%"],
    ["Weekly report", "error", "Baseline or forecast finish before its start · contract effective date or actual start after the report date while progress is already reported"],
    ["Weekly report", "error", "Paid more than submitted · submitted, paid or work confirmation more than the contract value · negative amounts"],
    ["Weekly report", "error", "Manpower / man-hours / HSE counts negative, or a cumulative smaller than this week · NCR / SOR open ≠ issued − closed"],
    ["Weekly report", "error", "SPI below 0 or above 3"],
    ["Weekly report", "warn", "Forecast finish already passed while the project is below 100% · report older than the other projects' · key fields empty"],
    ["Weekly report", "info", "SPI ≠ actual ÷ planned · Variance (days) ≠ forecast − baseline finish · Paid % ≠ paid ÷ contract value · man-hours 0 with manpower on site"],
    ["S-curve", "info", "A finished project's 100% carried forward into weeks after the report date"],
    ["S-curve", "error", "Cumulative actual or plan going down from one week to the next · actual entered for weeks after the report date"],
    ["S-curve", "info", "S-curve actual at the report date ≠ the weekly report's cumulative actual"],
    ["Milestones", "error", "Milestone progress below 0% or above 100% · planned finish before the project start"],
    ["Milestones", "warn", "Milestone forecast finish passed while it is below 100%"],
    ["Area of concern", "warn", "Open concern past its target date · target date before the date raised · concern without a status"],
    ["Deliverables", "error", "Approved + rejected + under review more than submitted"],
    ["Spend plan", "error", "Actual spend entered for a month after the report month · negative monthly values · work confirmed more than the contract value · paid more than work confirmed · end date before start date"],
    ["Spend plan", "warn", "Closed month with a forecast but no actual · contract end date passed while the project is still in execution"],
    ["Spend plan", "info", "Closed month whose forecast ≠ actual · weekly report contract value / paid amount ≠ spend plan (ERP) · in the spend plan but not in Budget 2026 (or the reverse)"],
    ["Project card", "error", "Phase completion KPI negative · progress below 0% or above 100% · finish before start"],
    ["Project card", "warn", "Forecast finish passed in execution while below 100% · milestones past their planned date and not completed · card older than 40 days"],
    ["Project card", "info", "Weekly actual lower than the card's (the weekly report is newer) · forecast finish on the card and in the weekly report more than 30 days apart · in execution with no weekly report"],
    ["Closing", "error", "A step marked Completed with a date after the report date · contract finish before start"],
    ["Closing", "warn", "A close-out step past its due date and not completed"],
    ["Closing", "info", "Close-out steps without a target date (TBD / TBC) · progress below 100% in the closing phase"],
    ["Issue register", "error", "Closure date before the identification date"],
    ["Issue register", "warn", "Open issue past its action-plan due date · open issue without an owner or due date · resolved issue without a closure date"],
    ["Data", "warn", "Weekly report more than 10 days old · project cards from an earlier month"]
  ];

  /* ------------------------------ helpers ------------------------------ */
  function iso(v) { var m = /^(\d{4}-\d{2}-\d{2})/.exec(typeof v === "string" ? v : ""); return m ? m[1] : ""; }
  function days(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 864e5); }
  function addDays(d, n) { return new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10); }
  function pc(v) { return v == null ? "—" : (Math.round(v * 1000) / 10) + "%"; }
  function dt(d) { return d ? fmt.date(d) : "—"; }
  function mn(v) { return v == null ? "—" : Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(2) + "M" : fmt.money(v); }
  function clip(s, n) { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  function isClosed(s) { return /clos|resolv|solved|complet|done|cancel/i.test(s || ""); }
  function baseCode(c) { return String(c || "").replace(/[A-Z]$/, ""); }

  /* ------------------------------ the checks ------------------------------ */
  function run(D) {
    var out = [], rd = D.reportDate || "", today = new Date().toISOString().slice(0, 10);
    var projects = D.projects || {};
    function nameOf(code) {
      for (var s in projects) if (projects[s].code === code) return projects[s].weeklyName || projects[s].name;
      var c = D.t("Project_Cards").filter(function (x) { return x.Code === code; })[0];
      return c ? c.Name : "";
    }
    function add(sev, rule, code, src, field, msg, go, name) {
      out.push({ sev: sev, rule: rule, code: code || "", name: name != null ? name : code ? nameOf(code) : "", src: src, field: field || "", msg: msg, go: go || null,
        id: [rule, code || "", field || "", msg].join("|") });
    }

    /* --- weekly report: latest row per project --- */
    var last = {};
    D.t("Weekly_Report_Updates").forEach(function (r) {
      var s = r["Source.Name"]; if (!s) return;
      if (!last[s] || String(r["Report Date"] || "") > String(last[s]["Report Date"] || "")) last[s] = r;
    });
    var wkByCode = {};
    Object.keys(last).forEach(function (s) {
      var r = last[s], code = String(r["Project Code"] != null ? r["Project Code"] : (projects[s] || {}).code || ""), name = r["Project Name"] || "";
      wkByCode[code] = r;
      var go = ["progress", { sc: s, jump: "p-focus" }], W = "Weekly report";
      function e(sev, rule, field, msg) { add(sev, rule, code, W, field, msg, go, name); }
      var r_d = iso(r["Report Date"]), act = N(r["Actual (%) - Cumulative"]), plan = N(r["Planned (%) - Cumulative"]);
      var bs = iso(r["Start Date Baseline"]), be = iso(r["End Date Baseline"]), fs = iso(r["Start Date (Forecast/Actual)"]), fe = iso(r["End Date (Forecast/Actual)"]);
      var done = act != null && act >= 0.999;

      if (rd && r_d && r_d < addDays(rd, -6)) e("warn", "wk-stale", "Report Date", "Weekly report not updated: last report " + dt(r_d) + ", the other projects are at " + dt(rd) + ".");
      ["Planned (%) - Cumulative", "Actual (%) - Cumulative", "Planned (%) This Week", "Actual (%) This Week"].forEach(function (k) {
        var v = N(r[k]); if (v != null && (v < -0.0005 || v > 1.0005)) e("error", "wk-pct", k, k + " is " + pc(v) + " — it must be between 0% and 100%.");
      });
      if (bs && be && be < bs) e("error", "wk-dates", "End Date Baseline", "Baseline finish " + dt(be) + " is before the baseline start " + dt(bs) + ".");
      if (fs && fe && fe < fs) e("error", "wk-dates", "End Date (Forecast/Actual)", "Forecast finish " + dt(fe) + " is before the forecast/actual start " + dt(fs) + ".");
      var eff = iso(r["(Con) Contract Effective Date"]);
      if (eff && r_d && eff > r_d && act > 0) e("error", "wk-eff", "(Con) Contract Effective Date", "Contract effective date " + dt(eff) + " is after the report date while progress is already " + pc(act) + ".");
      if (fs && r_d && fs > r_d && act > 0) e("error", "wk-eff", "Start Date (Forecast/Actual)", "Actual start " + dt(fs) + " is after the report date while progress is already " + pc(act) + ".");
      if (fe && r_d && fe < r_d && act != null && !done)
        e("warn", "wk-fe-past", "End Date (Forecast/Actual)", "Forecast finish " + dt(fe) + " has already passed (report " + dt(r_d) + ") but progress is " + pc(act) + " — update the forecast finish.");
      var spi = N(r.SPI);
      if (spi != null && (spi < 0 || spi > 3)) e("error", "wk-spi", "SPI", "SPI " + spi.toFixed(2) + " is not a realistic value (expected about 0–2).");
      else if (spi != null && plan > 0 && act != null && Math.abs(spi - act / plan) > 0.05)
        e("info", "wk-spi", "SPI", "SPI " + spi.toFixed(2) + " ≠ actual ÷ planned (" + pc(act) + " ÷ " + pc(plan) + " = " + (act / plan).toFixed(2) + ").");
      var vr = N(r.Variance);
      if (vr != null && fe && be && Math.abs(vr - days(be, fe)) > 2)
        e("info", "wk-var", "Variance", "Variance is " + vr + " days but forecast − baseline finish = " + (days(be, fe) > 0 ? "+" : "") + days(be, fe) + " days (" + dt(fe) + " vs " + dt(be) + ").");
      // money
      var cv = N(r["Contract Value"]), rcv = N(r["Revised Contract Value"]), cap = Math.max(cv || 0, rcv || 0), cvUse = rcv || cv;
      var sub = N(r["Submitted Amount"]), paid = N(r["Paid Amount"]), wc = N(r["Work Confirmation"]);
      [["Contract Value", cv], ["Revised Contract Value", rcv], ["Submitted Amount", sub], ["Paid Amount", paid], ["Work Confirmation", wc]].forEach(function (x) {
        if (x[1] != null && x[1] < 0) e("error", "wk-money", x[0], x[0] + " is negative (" + mn(x[1]) + ").");
      });
      if (paid > 0 && sub != null && paid > sub * 1.001) e("error", "wk-money", "Paid Amount", "Paid " + mn(paid) + " is more than submitted " + mn(sub) + ".");
      if (cap > 0) [["Submitted Amount", sub], ["Paid Amount", paid], ["Work Confirmation", wc]].forEach(function (x) {
        if (x[1] != null && x[1] > cap * 1.001) e("error", "wk-money", x[0], x[0] + " " + mn(x[1]) + " is more than the contract value " + mn(cap) + ".");
      });
      var ppc = N(r["Paid (%) (I/E)"]);
      if (ppc != null && cvUse > 0 && paid != null && Math.abs(ppc - paid / cvUse) > 0.02)
        e("info", "wk-paidpct", "Paid (%) (I/E)", "Paid % is " + pc(ppc) + " but paid ÷ contract value = " + mn(paid) + " ÷ " + mn(cvUse) + " = " + pc(paid / cvUse) + ".");
      // HSE / manpower pairs (cumulative vs this week)
      Object.keys(r).forEach(function (k) {
        var m = /^(.*) \(Cumulative\)$/.exec(k); if (!m) return;
        var cum = N(r[k]), wkK = Object.keys(r).filter(function (x) { return x.indexOf(m[1].replace(/ - $/, "")) === 0 && /\(This Week\)$/.test(x); })[0];
        var wkv = wkK ? N(r[wkK]) : null;
        if (cum != null && cum < 0) e("error", "wk-hse", k, k + " is negative (" + cum + ").");
        if (wkv != null && wkv < 0) e("error", "wk-hse", wkK, wkK + " is negative (" + wkv + ").");
        else if (cum != null && wkv != null && cum < wkv) e("error", "wk-hse", k, k + " (" + fmt.int(cum) + ") is smaller than this week (" + fmt.int(wkv) + ").");
      });
      if (N(r["Total Manpower (This Week)"]) > 0 && N(r["Total Man-Hours (This Week)"]) === 0)
        e("info", "wk-hse", "Total Man-Hours (This Week)", "Man-hours this week are 0 while " + fmt.int(r["Total Manpower (This Week)"]) + " manpower is reported this week.");
      [["NCR"], ["SOR"]].forEach(function (x) {
        var iss = N(r["Issued " + x[0]]), cl = N(r["Closed " + x[0]]), op = N(r["Open " + x[0]]);
        if (iss != null && cl != null && cl > iss) e("error", "wk-ncr", "Closed " + x[0], "Closed " + x[0] + " (" + cl + ") is more than issued (" + iss + ").");
        else if (iss != null && cl != null && op != null && op !== iss - cl) e("error", "wk-ncr", "Open " + x[0], "Open " + x[0] + " is " + op + " but issued − closed = " + (iss - cl) + ".");
      });
      var miss = ["Contractor", "Project Manager", "Current Phase", "Project Status", "End Date (Forecast/Actual)", "Contract Value", "Actual (%) - Cumulative"]
        .filter(function (k) { return r[k] == null || String(r[k]).trim() === ""; });
      if (miss.length) e("warn", "wk-empty", miss.join(", "), "Empty in the weekly report: " + miss.join(", ") + ".");
    });

    /* --- S-curve per project --- */
    var sc = {};
    D.t("S_Curve").forEach(function (r) { var s = r["Source.Name"]; if (s) (sc[s] = sc[s] || []).push(r); });
    Object.keys(sc).forEach(function (s) {
      var code = (projects[s] || {}).code || "", go = ["progress", { sc: s, jump: "p-focus" }], S = "S-curve";
      var rows = sc[s].slice().sort(function (a, b) { return String(a["Report Date"]).localeCompare(String(b["Report Date"])); });
      var pa = null, pp = null, down = [], pdown = [], fut = [], futV = {}, lastA = null;
      rows.forEach(function (r) {
        var d = iso(r["Report Date"]), a = N(r["Cum Actual (%)"]), p = N(r["Cum Plan (%)"]);
        if (a != null) {
          if (pa && a < pa.v - 0.0005) down.push(dt(d) + " " + pc(a) + " < " + pc(pa.v));
          if (rd && d > rd && a > 0) { fut.push(d); futV[a] = 1; }
          if (!rd || d <= rd) lastA = { d: d, v: a };
          pa = { d: d, v: a };
        }
        if (p != null) { if (pp != null && p < pp - 0.0005) pdown.push(dt(d)); pp = p; }
      });
      if (down.length) add("error", "sc-down", code, S, "Cum Actual (%)", "Cumulative actual goes down " + down.length + " time(s): " + down.slice(0, 3).join(" · ") + (down.length > 3 ? " …" : "") + ".", go);
      if (pdown.length) add("error", "sc-down", code, S, "Cum Plan (%)", "Cumulative plan goes down " + pdown.length + " time(s), e.g. " + pdown.slice(0, 3).join(", ") + ".", go);
      // a finished project whose sheet carries 100% forward is only worth a look; real values for future weeks are not logical
      var flat = lastA && Object.keys(futV).length === 1 && Math.abs(+Object.keys(futV)[0] - lastA.v) < 0.0005 && lastA.v >= 0.999;
      if (fut.length) add(flat ? "info" : "error", "sc-future", code, S, "Cum Actual (%)", "Actual progress is entered for " + fut.length + " week(s) after the report date (" + dt(fut[0]) + " → " + dt(fut[fut.length - 1]) + ")" +
        (flat ? " — the finished 100% is carried forward; clear the future weeks." : "."), go);
      var w = last[s], wa = w ? N(w["Actual (%) - Cumulative"]) : null;
      if (w && lastA && wa != null && lastA.d === iso(w["Report Date"]) && Math.abs(lastA.v - wa) > 0.001)
        add("info", "sc-weekly", code, S, "Cum Actual (%)", "S-curve actual at " + dt(lastA.d) + " is " + pc(lastA.v) + " but the weekly report says " + pc(wa) + ".", go);
    });

    /* --- milestones --- */
    D.t("Project_Milestones_Progress_Combine").forEach(function (r) {
      var s = r["Source.Name"], code = (projects[s] || {}).code || "", go = ["progress", { sc: s, jump: "p-focus" }], M = "Milestones";
      var ds = String(r.Description || r.WSB || "").trim(); if (!ds) return;
      var a = N(r["Actual Progress"]), p = N(r["Planned progress"]), f = iso(r["Actual/Forecast Finish"]), pf = iso(r["Planned Finish"]), ps = iso(r["Project Start"]);
      var at = rd || iso(r["Data Date"]);
      [["Actual Progress", a], ["Planned progress", p]].forEach(function (x) {
        if (x[1] != null && (x[1] < -0.0005 || x[1] > 1.0005)) add("error", "ms-pct", code, M, x[0], "“" + ds + "”: " + x[0].toLowerCase() + " " + pc(x[1]) + " — must be 0–100%.", go);
      });
      if (pf && ps && pf < ps) add("error", "ms-dates", code, M, "Planned Finish", "“" + ds + "”: planned finish " + dt(pf) + " is before the project start " + dt(ps) + ".", go);
      if (!/^overall$/i.test(ds) && f && at && f < at && a != null && a < 0.999)
        add("warn", "ms-late", code, M, "Actual/Forecast Finish", "“" + ds + "”: forecast finish " + dt(f) + " has passed but it is at " + pc(a) + " — update the forecast.", go);
    });

    /* --- area of concern --- */
    D.t("Area_of_Concern").forEach(function (r) {
      var s = r["Source.Name"], code = (projects[s] || {}).code || "", go = ["progress", { sc: s, jump: "p-focus" }], A = "Area of concern";
      var t = clip(r["Issue /Concern Description"], 70); if (!t) return;
      var st = String(r.Status || "").trim(), td = iso(r["Target Date"]), dr = iso(r["Date Raised"]);
      if (td && dr && td < dr) add("error", "aoc-dates", code, A, "Target Date", "“" + t + "”: target date " + dt(td) + " is before the date raised " + dt(dr) + ".", go);
      if (!st) add("warn", "aoc-status", code, A, "Status", "“" + t + "”: no status.", go);
      else if (!isClosed(st) && td && rd && td < rd) add("warn", "aoc-late", code, A, "Target Date", "“" + t + "”: still " + st + " but the target date " + dt(td) + " has passed.", go);
    });

    /* --- deliverables --- */
    D.t("Deliverable_Status").forEach(function (r) {
      var s = r["Source.Name"], code = (projects[s] || {}).code || "";
      var sub = N(r["Total Subm. (Act. Cum)"]), rev = (N(r.Approved) || 0) + (N(r.Rejected) || 0) + (N(r["U/R"]) || 0);
      if (sub != null && rev > sub) add("error", "dl-count", code, "Deliverables", r["Project Deliverables"] || "", "“" + (r["Project Deliverables"] || "") + "”: approved + rejected + under review (" + rev + ") is more than submitted (" + sub + ").", ["progress", { sc: s, jump: "p-focus" }]);
    });

    /* --- spend plan (per budget ID) --- */
    var AK = "Actual Spend (Incr)4", FK = "Forecast as per Contractor cashflow / updated Progress / Program (Incr)5", rm = rd.slice(0, 7) + "-01";
    var sp = {};
    D.t("Spending_Plan").forEach(function (r) { var id = String(r.ID || ""); if (id) (sp[id] = sp[id] || []).push(r); });
    Object.keys(sp).forEach(function (id) {
      var rows = sp[id].slice().sort(function (a, b) { return String(a.Month).localeCompare(String(b.Month)); }), r0 = rows[0], go = ["cost", {}], S = "Spend plan";
      var name = r0["Project Name"] || "";
      function e(sev, rule, field, msg) { add(sev, rule, id, S, field, msg, go, name); }
      var fut = [], miss = [], diff = [], neg = [];
      rows.forEach(function (r) {
        var m = iso(r.Month), a = N(r[AK]), f = N(r[FK]);
        [AK, FK, "Spend Plan as per Budgeting (Incr)"].forEach(function (k) { var v = N(r[k]); if (v != null && v < 0) neg.push(fmt.month(m)); });
        if (!rd || !m) return;
        if (m > rm && a) fut.push(fmt.month(m) + " " + mn(a));
        if (m < rm && f > 0 && a == null) miss.push(fmt.month(m) + " (forecast " + mn(f) + ")");
        if (m < rm && f != null && a != null && Math.abs(f - a) > Math.max(10000, Math.abs(a) * 0.01)) diff.push(fmt.month(m) + ": forecast " + mn(f) + " vs actual " + mn(a));
      });
      if (neg.length) e("error", "sp-neg", "", "Negative monthly value in " + U.uniq(neg).join(", ") + ".");
      if (fut.length) e("error", "sp-future", AK, "Actual spend entered for a month after the report month: " + fut.join(", ") + ".");
      if (miss.length) e("warn", "sp-missing", AK, "No actual entered for closed month(s): " + miss.join(", ") + ".");
      if (diff.length) e("info", "sp-fc", FK, "Forecast not aligned to the actual in closed month(s) — " + diff.join(" · ") + ".");
      var cv = N(r0["Contract Value"]), wc = N(r0["Total WC YTD"]), pd = N(r0["Paid from CV as per ERP"]);
      if (cv > 0 && wc != null && wc > cv * 1.001) e("error", "sp-wc", "Total WC YTD", "Work confirmed " + mn(wc) + " is more than the contract value " + mn(cv) + ".");
      if (wc != null && pd != null && pd > wc + 1) e("error", "sp-wc", "Paid from CV as per ERP", "Paid (ERP) " + mn(pd) + " is more than work confirmed " + mn(wc) + ".");
      var sd = iso(r0["Start Date"]), ed = iso(r0["End Date"]);
      if (sd && ed && ed < sd) e("error", "sp-dates", "End Date", "End date " + dt(ed) + " is before the start date " + dt(sd) + ".");
      var w = wkByCode[id] || (Object.keys(sp).filter(function (x) { return baseCode(x) === baseCode(id); }).length === 1 ? wkByCode[baseCode(id)] : null)
        || (/A$/.test(id) ? wkByCode[baseCode(id)] : null);
      var wact = w ? N(w["Actual (%) - Cumulative"]) : null;
      if (ed && rd && ed < rd && /exec/i.test(r0["Project Phase"] || "") && !(wact >= 0.999))
        e("warn", "sp-end", "End Date", "End date " + dt(ed) + " has passed but the project is still in execution" + (w ? " (weekly forecast finish " + dt(iso(w["End Date (Forecast/Actual)"])) + ", " + pc(wact) + ")" : "") + ".");
      if (w) {
        var wcv = N(w["Contract Value"]), wrcv = N(w["Revised Contract Value"]);
        if (cv > 0 && wcv > 0 && Math.abs(cv - wcv) > cv * 0.01 && !(wrcv > 0 && Math.abs(cv - wrcv) <= cv * 0.01))
          e("info", "sp-x", "Contract Value", "Contract value: spend plan " + mn(cv) + " vs weekly report " + mn(wcv) + (wrcv && wrcv !== wcv ? " (revised " + mn(wrcv) + ")" : "") + ".");
        var wpd = N(w["Paid Amount"]);
        if (pd != null && wpd != null && Math.abs(pd - wpd) > Math.max(1000, pd * 0.01))
          e("info", "sp-x", "Paid Amount", "Paid: ERP (spend plan) " + mn(pd) + " vs weekly report " + mn(wpd) + ".");
      }
    });
    (D.revMissing || []).forEach(function (id) { add("info", "sp-rev", id, "Spend plan", "ID", "In the Spending Plan but not in Budget 2026 (no revised spend plan).", ["cost", {}]); });
    (D.revOnly || []).forEach(function (id) { add("info", "sp-rev", id, "Budget 2026", "ID", "In Budget 2026 but not in the Spending Plan.", ["cost", {}]); });

    /* --- project cards --- */
    var cards = D.t("Project_Cards"), closingCodes = {};
    D.t("Closing_Projects").forEach(function (r) { closingCodes[String(r.Code)] = 1; });
    var maxRp = cards.map(function (c) { return iso((c.Exec || {}).ReportingPeriod); }).filter(Boolean).sort().pop() || "";
    cards.forEach(function (c) {
      var code = String(c.Code || ""), go = ["project-cards", { code: c.Code }], K = "Project card", name = c.Name || "";
      function e(sev, rule, field, msg) { add(sev, rule, code, K, field, msg, go, name); }
      var negK = (c.KPIs || []).filter(function (k) { var v = N(k.Value); return v != null && v < -0.0005 && /completion/i.test(k.KPI || ""); });
      if (negK.length) e("error", "pc-kpi", "KPIs · Phase completion", "Phase completion KPI negative (a completion cannot be below 0 — check the phase dates): " +
        negK.map(function (k) { return k.Phase + " " + (Math.round(N(k.Value) * 100) / 100); }).join(" · ") + ".");
      var T = c.Total || {}, X = c.Exec || {};
      [["Total plan", T.Plan], ["Total actual", T.Actual], ["Execution planned to date", X.PlannedToDate], ["Execution actual to date", X.ActualToDate]].forEach(function (x) {
        var v = N(x[1]); if (v != null && (v < -0.0005 || v > 1.0005)) e("error", "pc-pct", x[0], x[0] + " is " + pc(v) + " — must be 0–100%.");
      });
      [["Baseline", "BS", "BE"], ["Revised baseline", "RS", "RE"], ["Forecast", "FS", "FE"]].forEach(function (x) {
        var a = iso(T[x[1]]), b = iso(T[x[2]]); if (a && b && b < a) e("error", "pc-dates", x[0] + " finish", x[0] + " finish " + dt(b) + " is before its start " + dt(a) + ".");
      });
      var fe = iso(T.FE), act = N(X.ActualToDate) || N(T.Actual), execPh = /^execution/i.test(c.ActualPhase || "");
      if (execPh && fe && rd && fe < rd && !(act >= 0.999)) e("warn", "pc-fe-past", "Forecast finish", "In execution but the forecast finish " + dt(fe) + " has passed at " + pc(act) + " — update the card's forecast.");
      var lateMs = (c.Milestones || []).filter(function (m) { var p = iso(m.Planned); return p && rd && p < rd && !/^y/i.test(m.Completed || "") && !iso(m.Actual); });
      if (lateMs.length) e("warn", "pc-ms", "Milestones", lateMs.length + " milestone(s) past the planned date and not completed: " +
        lateMs.slice(0, 3).map(function (m) { return m.Milestone + " (" + dt(iso(m.Planned)) + ")"; }).join(", ") + (lateMs.length > 3 ? " …" : "") + ".");
      var rp = iso(X.ReportingPeriod);
      if (rp && maxRp && rp < addDays(maxRp, -40)) e("warn", "pc-stale", "Reporting period", "Card reporting period " + fmt.month(rp) + " is older than the other cards (" + fmt.month(maxRp) + ").");
      var w = wkByCode[code];
      if (w) {
        var wa = N(w["Actual (%) - Cumulative"]), ca = N(X.ActualToDate), wd = iso(w["Report Date"]), wfe = iso(w["End Date (Forecast/Actual)"]);
        if (wa != null && ca != null && rp && wd > rp && wa < ca - 0.01) e("info", "pc-wk", "Actual progress", "Weekly report " + dt(wd) + " shows " + pc(wa) + " — lower than the card's " + pc(ca) + " at " + dt(rp) + " (progress cannot go back).");
        if (fe && wfe && Math.abs(days(fe, wfe)) > 30) e("info", "pc-wk", "Forecast finish", "Forecast finish: card " + dt(fe) + " vs weekly report " + dt(wfe) + " (" + Math.abs(days(fe, wfe)) + " days apart).");
      } else if (execPh && !closingCodes[code] && !(act >= 0.999)) e("info", "pc-noweekly", "Weekly report", "In execution on the card but there is no weekly report for this project.");
    });

    /* --- closing --- */
    var STEPS = ["AMP -E1", "AMP -E2", "Hand Over Report", "Closout Report", "Retention Release", "AP guarantee Release", "Final Payment", "Performance guarantee relase"];
    function stepDate(t) { var m = /(\d{1,2})[\s\-\/]+([A-Za-z]{3,9})\.?[\s\-\/,]+(\d{4})/.exec(t || ""); if (!m) return ""; return iso(UItxt(m[0])); }
    function UItxt(s) { var MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], m = /(\d{1,2})[\s\-\/]+([A-Za-z]{3,9})\.?[\s\-\/,]+(\d{4})/.exec(s), i = MON.indexOf(m[2].slice(0, 3).toLowerCase());
      return i < 0 ? "" : m[3] + "-" + (i < 9 ? "0" : "") + (i + 1) + "-" + (+m[1] < 10 ? "0" : "") + +m[1]; }
    D.t("Closing_Projects").forEach(function (r) {
      var code = String(r.Code || ""), go = ["closing", {}], C = "Closing", name = r["Project Name"] || "";
      function e(sev, rule, field, msg) { add(sev, rule, code, C, field, msg, go, name); }
      var late = [], tbd = [];
      STEPS.forEach(function (k) {
        var t = String(r[k] == null ? "" : r[k]).trim(); if (!t || /^n\/?a\b/i.test(t)) return;
        var d = stepDate(t), doneS = /^(completed?|done|closed|released|signed)\b/i.test(t);
        if (doneS && d && rd && d > rd) e("error", "cl-future", k, k + ": “" + t + "” — completed with a date after the report date " + dt(rd) + ".");
        if (doneS) return;
        if (d && rd && d < rd) late.push(k + " (" + t + ")");
        else if (!d) tbd.push(k);
      });
      if (late.length) e("warn", "cl-late", late.length === 1 ? late[0].split(" (")[0] : "Close-out steps", "Past the due date and not completed: " + late.join(" · ") + ".");
      if (tbd.length) e("info", "cl-tbd", "Close-out steps", tbd.length + " step(s) without a target date (TBD / TBC): " + tbd.join(", ") + ".");
      var p = N(r["Actual Progress %"]); if (p != null && p < 0.999) e("info", "cl-progress", "Actual Progress %", "In the closing phase but progress is " + pc(p) + ".");
      var s0 = iso(r.Start), f0 = iso(r["Contract Finish"]); if (s0 && f0 && f0 < s0) e("error", "cl-dates", "Contract Finish", "Contract finish " + dt(f0) + " is before the start " + dt(s0) + ".");
    });

    /* --- issue register --- */
    D.t("Issue_register").forEach(function (r) {
      var code = String(r["Poject Code"] || r.Code || "").replace(/_.*$/, ""), go = ["issues", { f: { code: [code] } }], I = "Issue register";
      var t = clip(r["Issue Title"] || r["Issue (Description)"], 60) || (r["ILR ID No."] || "issue"), st = String(r["Issue Status"] || "").trim();
      var idd = iso(r["Issue Identification (Date)"]), due = iso(r["Action Plan (Original Due Date)"]), cd = iso(r["Issue Closure Date"]), open = !isClosed(st);
      if (cd && idd && cd < idd) add("error", "is-dates", code, I, "Issue Closure Date", "“" + t + "”: closure date " + dt(cd) + " is before the identification date " + dt(idd) + ".", go);
      if (!open && !cd) add("warn", "is-noclose", code, I, "Issue Closure Date", "“" + t + "”: " + st + " without a closure date.", go);
      if (open && due && rd && due < rd) add("warn", "is-late", code, I, "Action Plan (Original Due Date)", "“" + t + "”: " + (st || "open") + " but the action-plan due date " + dt(due) + " has passed.", go);
      if (open && (!due || !String(r["Action Plan Owner"] || "").trim())) add("warn", "is-missing", code, I, !due ? "Action Plan (Original Due Date)" : "Action Plan Owner", "“" + t + "”: open issue without " + (!due ? "an action-plan due date" : "an action-plan owner") + ".", go);
    });

    /* --- data freshness --- */
    if (rd && days(rd, today) > 10) add("warn", "dt-old", "", "Data", "Report Date", "The weekly data is " + days(rd, today) + " days old (report date " + dt(rd) + ") — import this week's PBI Weekly Report.", ["import", {}], "All projects");
    if (maxRp && rd && maxRp < addDays(rd.slice(0, 7) + "-01", -1)) add("warn", "dt-old", "", "Data", "Project cards", "The project cards are for " + fmt.month(maxRp) + " — import the latest EP – NSR Projects file.", ["import", {}], "All projects");

    var seenId = {};
    out.forEach(function (f) { var n = seenId[f.id] = (seenId[f.id] || 0) + 1; if (n > 1) f.id += "|" + n; });
    out.sort(function (a, b) { return SEV_ORDER[a.sev] - SEV_ORDER[b.sev] || String(a.code).localeCompare(String(b.code)) || a.src.localeCompare(b.src); });
    var counts = { error: 0, warn: 0, info: 0 }, byCode = {};
    var hidden = accepted();
    out.forEach(function (f) { f.ok = !!hidden[f.id]; if (f.ok) return; counts[f.sev]++; (byCode[baseCode(f.code)] = byCode[baseCode(f.code)] || []).push(f); });
    return { list: out, counts: counts, byCode: byCode, rd: rd };
  }

  /* findings the user marked "OK" (kept in this browser; a changed value makes a new finding) */
  var OK_KEY = "sar-datacheck-ok";
  function accepted() { try { return JSON.parse(localStorage.getItem(OK_KEY) || "{}") || {}; } catch (e) { return {}; } }
  function setAccepted(id, on) {
    var o = accepted(); if (on) o[id] = new Date().toISOString().slice(0, 10); else delete o[id];
    try { localStorage.setItem(OK_KEY, JSON.stringify(o)); } catch (e) { /* storage blocked: only for this view */ }
  }

  var cache = null;
  function get(D) { if (!cache || cache.D !== D || cache.v !== D.reportDate + "|" + D.t("Weekly_Report_Updates").length + "|" + D.t("Project_Cards").length + "|" + D.t("Spending_Plan").length) {
    cache = { D: D, v: D.reportDate + "|" + D.t("Weekly_Report_Updates").length + "|" + D.t("Project_Cards").length + "|" + D.t("Spending_Plan").length, r: run(D) }; }
    return cache.r; }
  function refresh() { cache = null; }

  function sevBadge(s) { return '<span class="dq-sev dq-' + s + '">' + SEV[s] + "</span>"; }
  function goTo(f) { if (f.go) window.SARApp.go(f.go[0], JSON.parse(JSON.stringify(f.go[1] || {}))); }

  /* ------------------------------ header chip ------------------------------ */
  function chip() {
    var host = document.getElementById("dqChip"); if (!host || !window.SARApp) return;
    var D = window.SARApp.D; if (!D.t("Weekly_Report_Updates").length && !D.t("Project_Cards").length) { host.hidden = true; return; }
    var r = get(D), n = r.counts.error + r.counts.warn;
    host.hidden = false;
    host.className = "chip dq-chip js-editor" + (r.counts.error ? " bad" : n ? " warn" : " ok");
    host.innerHTML = n ? "⚠ <strong>" + n + '</strong><span class="dq-lbl"> data warning' + (n === 1 ? "" : "s") + "</span>" : '✓<span class="dq-lbl"> Data checks</span>';
    host.title = r.counts.error + " not logical · " + r.counts.warn + " need update · " + r.counts.info + " to check — open Data Checks";
  }

  /* ------------------------------ per-project box ------------------------------ */
  function inline(host, code) {
    if (!window.SARApp || window.SARApp.published) return;
    var r = get(window.SARApp.D), list = (r.byCode[baseCode(code)] || []);
    if (!list.length) return;
    var e = list.filter(function (f) { return f.sev === "error"; }).length, w = list.filter(function (f) { return f.sev === "warn"; }).length, i = list.length - e - w;
    var box = U.el('<details class="dq-inline' + (e ? " bad" : w ? " warn" : "") + '"' + (e ? " open" : "") + '><summary><b>Data checks for this project:</b> ' +
      [e ? e + " not logical" : "", w ? w + " need update" : "", i ? i + " to check" : ""].filter(Boolean).join(" · ") + ' <a href="#/data-checks" class="dq-all">all findings ›</a></summary><ul></ul></details>');
    var ul = box.querySelector("ul");
    list.forEach(function (f) { ul.appendChild(U.el("<li>" + sevBadge(f.sev) + ' <span class="dq-src">' + esc(f.src) + (f.code !== code ? " · " + esc(f.code) : "") + "</span> " + esc(f.msg) + "</li>")); });
    box.querySelector(".dq-all").addEventListener("click", function (ev) { ev.preventDefault(); window.SARApp.go("data-checks", { proj: baseCode(code) }); });
    host.appendChild(box);
    return box;
  }

  /* ------------------------------ the page ------------------------------ */
  function page(ctx) {
    var D = ctx.D, v = ctx.view, st = ctx.state;
    refresh(); var r = get(D);
    st.sev = st.sev || { error: true, warn: true, info: true };
    var srcs = U.uniq(r.list.map(function (f) { return f.src; })), projs = U.uniq(r.list.map(function (f) { return baseCode(f.code); }).filter(Boolean)).sort();
    var g = U.el('<div class="grid g-4"></div>'); v.appendChild(g);
    var nProj = Object.keys(r.byCode).filter(Boolean).length, nOk = r.list.filter(function (f) { return f.ok; }).length;
    g.innerHTML = U.tile({ value: r.counts.error, label: "Not logical", color: r.counts.error ? "red" : "slate", note: "Impossible values — fix in the source file" }) +
      U.tile({ value: r.counts.warn, label: "Needs update", color: r.counts.warn ? "yellow" : "slate", note: "Passed dates, missing entries, old data" }) +
      U.tile({ value: r.counts.info, label: "To check", color: "mid", note: "Values that disagree between files" }) +
      U.tile({ value: nProj, label: "Projects with findings", color: "black", note: nOk ? nOk + " marked OK (hidden)" : "Report date " + fmt.date(r.rd) });
    Array.prototype.forEach.call(g.children, function (t, i) {
      var k = ["error", "warn", "info"][i]; if (!k) return; t.style.cursor = "pointer"; t.title = "Show only these";
      t.addEventListener("click", function () { st.sev = { error: false, warn: false, info: false }; st.sev[k] = true; ctx.rerender(); });
    });

    var bar = U.el('<div class="filters dq-bar"></div>'); v.appendChild(bar);
    ["error", "warn", "info"].forEach(function (k) {
      var b = U.el('<label class="dq-tog"><input type="checkbox"' + (st.sev[k] ? " checked" : "") + "> " + sevBadge(k) + "</label>");
      b.querySelector("input").addEventListener("change", function (ev) { st.sev[k] = ev.target.checked; ctx.rerender(); });
      bar.appendChild(b);
    });
    var ss = U.select({ label: "Source", value: st.src || "", options: [{ value: "", label: "All sources" }].concat(srcs.map(function (s) { return { value: s, label: s }; })), onChange: function (x) { st.src = x; ctx.rerender(); } });
    var ps = U.select({ label: "Project", value: st.proj || "", options: [{ value: "", label: "All projects" }].concat(projs.map(function (s) { return { value: s, label: s + (r.byCode[s] ? " (" + r.byCode[s].length + ")" : "") }; })), onChange: function (x) { st.proj = x; ctx.rerender(); } });
    bar.appendChild(ss); bar.appendChild(ps);
    var okT = U.el('<label class="dq-tog"><input type="checkbox"' + (st.showOk ? " checked" : "") + "> Show findings marked OK</label>");
    okT.querySelector("input").addEventListener("change", function (ev) { st.showOk = ev.target.checked; ctx.rerender(); });
    bar.appendChild(okT);

    var rows = r.list.filter(function (f) { return st.sev[f.sev] && (!st.src || f.src === st.src) && (!st.proj || baseCode(f.code) === st.proj) && (st.showOk || !f.ok); });
    var p = U.el('<section class="panel"><div class="panel-head"><h3>Findings</h3><span class="sub">Click a row to open the page with that data · “Mark OK” hides a finding you have checked (it comes back if the value changes)</span></div></section>');
    v.appendChild(p);
    if (!r.list.length) p.appendChild(U.el('<div class="note-box ok"><b>No findings.</b> Everything checked looks logical and up to date.</div>'));
    U.table(p, {
      rows: rows, exportName: "NSR data checks " + (r.rd || ""), sort: null, maxHeight: 640,
      emptyText: r.list.length ? "No findings for this filter." : "No findings.",
      columns: [
        { label: "Type", get: function (f) { return SEV[f.sev]; }, render: function (_, f) { return sevBadge(f.sev); } },
        { label: "Project", key: "code", render: function (_, f) { return f.code ? "<b>" + esc(f.code) + "</b>" + (f.name ? '<div class="muted dq-nm">' + esc(clip(f.name, 48)) + "</div>" : "") : esc(f.name || "—"); } },
        { label: "Source", key: "src" },
        { label: "Field", key: "field" },
        { label: "Finding", key: "msg", render: function (_, f) { return '<span class="dq-msg">' + esc(f.msg) + "</span>"; } },
        { label: "", get: function () { return ""; }, render: function (_, f) { return '<button type="button" class="link-btn dq-ok" data-id="' + esc(f.id) + '">' + (f.ok ? "Undo OK" : "Mark OK") + "</button>"; } }
      ],
      onRow: function (f, ev) { if (ev && ev.target && ev.target.closest && ev.target.closest(".dq-ok")) return; goTo(f); }
    });
    p.addEventListener("click", function (ev) {
      var b = ev.target.closest && ev.target.closest(".dq-ok"); if (!b) return;
      ev.stopPropagation(); var f = r.list.filter(function (x) { return x.id === b.getAttribute("data-id"); })[0];
      if (f) { setAccepted(f.id, !f.ok); refresh(); chip(); ctx.rerender(); }
    }, true);

    var rp = U.el('<details class="panel dq-rules"><summary><b>What is checked</b> <span class="muted">· ' + RULES.length + " rules</span></summary></details>");
    var tb = "<table class=\"dq-rt\"><thead><tr><th>Source</th><th>Type</th><th>Rule</th></tr></thead><tbody>" + RULES.map(function (x) {
      return "<tr><td>" + esc(x[0]) + "</td><td>" + sevBadge(x[1]) + "</td><td>" + esc(x[2]) + "</td></tr>"; }).join("") + "</tbody></table>";
    rp.appendChild(U.el("<div>" + tb + "</div>"));
    v.appendChild(rp);
  }

  window.SARChecks = { run: run, get: get, refresh: refresh, page: page, inline: inline, chip: chip, RULES: RULES, SEV: SEV };
})();

/* Page renderers — one per Power BI report page (plus an executive overview). */
(function () {
  "use strict";
  var U = window.UI, C = U.C, S = U.SERIES, fmt = U.fmt, esc = U.esc, el = U.el;

  /* Normalised column names used across pages */
  var SP = {
    plan: "Spend Plan as per Budgeting (Incr)",
    fc: "Plan as per V2 Forecast in Mar-26 (Shared with PC) (Incr)3",
    act: "Actual Spend (Incr)4",
    inv: "Forecast as per Contractor cashflow / updated Progress / Program (Incr)5",
    planC: "Spend Plan as per Budgeting (Cum)",
    fcC: "Plan as per V2 Forecast in Mar-26 (Shared with PC) (Cum)3",
    actC: "Actual Spend (Cum)4",
    invC: "Forecast as per Contractor cashflow / updated Progress / Program (Cum)5"
  };
  var PAID = "Paid from CV as per ERP (Gross value)";
  // KPIs owned by NSR (the "KPI Summary Manage by NSR" chart); every other KPI is managed by other departments.
  var NSR_MANAGED = ["capex variance", "non- kpi spending", "compliance with project control", "five bridges",
    "schedule performance index", "% of delivery against approved business plan", "closing of internal audit findings"];

  function N(v) { return U.toNum(v); }
  function G(r, k) { return window.SARApp.D.g(r, k); }
  function add(host, html) { var n = typeof html === "string" ? el(html) : html; host.appendChild(n); return n; }
  function grid(host, cls) { return add(host, '<div class="grid ' + cls + '"></div>'); }
  function panelIn(host, title, sub, tools) { return add(host, U.panel(title, sub, "", tools)); }
  function chartBox(p, cls) { return add(p, '<div class="chart-box ' + (cls || "") + '"></div>'); }
  function tableIn(p, opts) { var h = add(p, "<div></div>"); return U.table(h, opts); }
  function inSel(sel, v) { return !sel || !sel.length || sel.indexOf(v) >= 0; }
  function sortNum(a, b) { return (N(a) || 0) - (N(b) || 0); }
  function mTile(label, v, color, note) { return U.tile({ value: fmt.m(v), unit: "M SAR", label: label, color: color, note: note || fmt.money(v) + " SAR" }); }
  function isKPI(code) { return function (r) { return code.indexOf(N(r["KPI Code"])) >= 0; }; }

  /* Filter bar builder: defs = [{key,label,options}], state.f holds selections */
  function filterBar(ctx, defs) {
    var st = ctx.state.f || (ctx.state.f = {});
    var bar = add(ctx.view, '<div class="filters"></div>');
    defs.forEach(function (d) {
      st[d.key] = st[d.key] || [];
      bar.appendChild(U.multiSelect({ label: d.label, options: d.options, selected: st[d.key], display: d.display, onChange: ctx.rerender }));
    });
    var any = defs.some(function (d) { return st[d.key].length; });
    var rb = el('<button class="link-btn filter-reset" type="button"' + (any ? "" : " disabled") + ">↺ Reset filters</button>");
    rb.addEventListener("click", function () { defs.forEach(function (d) { st[d.key].length = 0; }); ctx.rerender(); });
    bar.appendChild(rb);
    return st;
  }

  /* Monthly aggregation of the Spending Plan */
  function monthly(rows) {
    var m = {};
    rows.forEach(function (r) {
      var k = r.Month; if (!k) return;
      var o = m[k] || (m[k] = { month: k, plan: 0, fc: 0, act: 0, inv: 0, planC: 0, fcC: 0, actC: 0, invC: 0 });
      Object.keys(SP).forEach(function (f) { o[f] += N(G(r, SP[f])) || 0; });
    });
    var out = Object.keys(m).sort().map(function (k) { return m[k]; });
    // Actual cumulative stops at the last month that has booked actuals.
    var last = -1;
    out.forEach(function (o, i) { if (o.act) last = i; });
    out.forEach(function (o, i) { o.actCv = i <= last ? o.actC : null; });
    return out;
  }

  /* Legend-bearing money bar chart for "totals" (one bar per measure) */
  function totalsChart(box, items) {
    return U.chart(box, {
      type: "bar",
      data: { labels: items.map(function (i) { return i.label; }),
        datasets: [U.barDs("Value", items.map(function (i) { return i.value; }), items.map(function (i) { return i.color; }), { maxBarThickness: 64 })] },
      options: {
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (c) { return " " + fmt.money(c.parsed.y) + " SAR"; } } },
          datalabels: { display: true, anchor: "end", align: "end", offset: 2, color: C.black, font: { weight: "700" }, formatter: function (v) { return fmt.m(v) + " M"; } }
        },
        layout: { padding: { top: 22 } },
        scales: { x: U.catAxis(), y: U.moneyAxis() }
      }
    });
  }

  var P = {};

  /* ======================================================================
     Executive Overview
     ====================================================================== */
  P.overview = function (ctx) {
    var D = ctx.D, v = ctx.view;
    var nsr = D.t("NSR_Project_Data"), wk = D.t("Weekly_Report_Updates"), iss = D.t("Issue_register"), kpi = D.t("KPI_Summary");
    var g1 = grid(v, "g-5");
    g1.innerHTML = mTile("Full Cost", U.sum(nsr, "Full Cost")) + mTile("Contract Value", U.sum(nsr, "Contract Value"), "black") +
      mTile("Total Work Confirmed", U.sum(nsr, "Total WC"), "mid") + mTile("Paid (ERP gross)", U.sum(nsr, PAID), "slate") +
      mTile("Remaining WC", U.sum(nsr, "Remaining WC"), "yellow");

    var ev = U.sum(wk, "Cumulative EV (SAR)"), pv = U.sum(wk, "Cumulative PV (SAR)");
    var delayed = wk.filter(function (r) { return /delay/i.test(r["Performance Status"] || ""); }).length;
    var open = iss.filter(function (r) { return /pending|escalat/i.test(r["Issue Status"] || ""); }).length;
    var crit = iss.filter(function (r) { return /pending|escalat/i.test(r["Issue Status"] || "") && /critical/i.test(r["Issue Rate"] || ""); }).length;
    var kres = U.sum(kpi, "KPI Result"), kw = U.sum(kpi, "KPI Weight (%)");
    var g2 = grid(v, "g-5");
    g2.innerHTML =
      U.tile({ value: wk.length, label: "Projects reported", note: "Weekly report " + fmt.date(D.reportDate) }) +
      U.tile({ value: pv ? (ev / pv).toFixed(2) : "—", label: "Portfolio SPI (cost)", color: pv && ev / pv < 0.9 ? "red" : pv && ev / pv < 1 ? "yellow" : "", note: "Σ EV ÷ Σ PV" }) +
      U.tile({ value: delayed, label: "Delayed projects", color: delayed ? "red" : "", note: "Performance status = Delayed" }) +
      U.tile({ value: open, label: "Open issues", color: open ? "yellow" : "", note: crit + " critical · pending or escalated" }) +
      U.tile({ value: fmt.pct(kres), label: "KPI result", color: "black", note: "of " + fmt.pct(kw, 0) + " total weight" });

    var g3 = grid(v, "g-2");
    var pa = panelIn(g3, "Cumulative spend — plan vs actual & forecast", "All projects, 2026", '<a class="link-btn" href="#/cost-scurve">Open S-Curve →</a>');
    var mm = monthly(D.t("Spending_Plan"));
    U.chart(chartBox(pa), {
      type: "line",
      data: { labels: mm.map(function (o) { return fmt.month(o.month); }), datasets: [
        U.lineDs("Spend Plan", mm.map(function (o) { return o.planC; }), S.plan),
        U.lineDs("Forecast V3", mm.map(function (o) { return o.fcC; }), S.forecast),
        U.lineDs("Actual Spend", mm.map(function (o) { return o.actCv; }), S.actual, { borderWidth: 3 }),
        U.lineDs("Invoice Plan", mm.map(function (o) { return o.invC; }), S.invoice, { borderDash: [6, 4] })] },
      options: { plugins: { tooltip: U.moneyTooltip() }, scales: { x: U.catAxis(), y: U.moneyAxis() } }
    });
    var pb = panelIn(g3, "Cumulative progress by project", "Planned vs actual", '<a class="link-btn" href="#/weekly">Weekly summary →</a>');
    var wr = wk.slice().sort(function (a, b) { return sortNum(b["Planned (%) - Cumulative"], a["Planned (%) - Cumulative"]); });
    U.chart(chartBox(pb), {
      type: "bar",
      data: { labels: wr.map(function (r) { return r["Project Code"]; }), datasets: [
        U.barDs("Planned (cum)", wr.map(function (r) { return r["Planned (%) - Cumulative"]; }), S.plan),
        U.barDs("Actual (cum)", wr.map(function (r) { return r["Actual (%) - Cumulative"]; }), S.actual)] },
      options: { plugins: { tooltip: { callbacks: {
        title: function (i) { return wr[i[0].dataIndex]["Project Code"] + " — " + wr[i[0].dataIndex]["Project Name"]; },
        label: function (c) { return " " + c.dataset.label + ": " + fmt.pct(c.parsed.y); } } } },
        scales: { x: U.catAxis(), y: U.pctAxis(1) } }
    });

    var g4 = grid(v, "g-3");
    var links = [["kpi-summary", "KPI Summary", "Scorecard of " + kpi.length + " KPIs"], ["cost", "Cost Dashboard", nsr.length + " projects in the cost register"],
      ["project", "Project Progress", "Weekly report card per project"], ["master-plan", "Projects Master Plan", "Milestone Gantt for all projects"],
      ["issues", "Issue Register", iss.length + " issues logged"], ["import", "Data Import", "Refresh from the Excel files"]];
    links.forEach(function (l) {
      add(g4, '<a class="panel" style="text-decoration:none;color:inherit" href="#/' + l[0] + '"><div class="panel-head" style="margin:0"><h3>' + esc(l[1]) +
        '</h3><span class="tools link-btn">Open →</span></div><div class="muted" style="font-size:13px">' + esc(l[2]) + "</div></a>");
    });
  };

  /* ======================================================================
     KPI Summary
     ====================================================================== */
  P["kpi-summary"] = function (ctx) {
    var D = ctx.D, v = ctx.view, rows = D.t("KPI_Summary").slice().sort(function (a, b) { return sortNum(a["KPI SN"], b["KPI SN"]); });
    var kres = U.sum(rows, "KPI Result"), kw = U.sum(rows, "KPI Weight (%)");
    var full = rows.filter(function (r) { return N(r["% Achieved"]) >= 1; }).length;
    var g = grid(v, "g-4");
    g.innerHTML = U.tile({ value: rows.length, label: "KPIs tracked", note: U.uniq(rows.map(function (r) { return r["KPI Filter"]; })).length + " KPI groups" }) +
      U.tile({ value: fmt.pct(kw, 0), label: "Total weight", color: "black" }) +
      U.tile({ value: fmt.pct(kres), label: "Weighted KPI result", color: "mid", note: kw ? fmt.pct(kres / kw) + " of attainable weight" : "" }) +
      U.tile({ value: full, label: "KPIs at 100%+", color: "slate", note: "of " + rows.length + " KPIs" });

    var tp = panelIn(v, "KPI scorecard", "Weight · achievement · result");
    tp.style.marginBottom = "16px";
    tableIn(tp, { rows: rows, exportName: "KPI_Summary", maxHeight: 640, totals: true, columns: [
      { key: "KPI SN", label: "KPI SN", type: "int" },
      { key: "KPI Filter", label: "KPI Filter", nowrap: true },
      { key: "Objective/ KPIs", label: "Objective / KPIs", wrap: true },
      { key: "KPI Weight (%)", label: "KPI Weight (%)", type: "pct", total: "sum" },
      { key: "Indicator", label: "Indicator", type: "badge" },
      { key: "% Achieved", label: "% Achieved", type: "meter" },
      { key: "KPI Result", label: "KPI Result", type: "pct", total: function (rs) { return fmt.pct(U.sum(rs, "KPI Result")); } }] });

    var right = grid(v, "g-2");
    function kpiChart(title, sub, list) {
      var p = panelIn(right, title, sub);
      var h = Math.max(200, list.length * 34 + 60);
      var box = chartBox(p); box.style.height = h + "px";
      U.chart(box, {
        type: "bar",
        data: { labels: list.map(function (r) { return U.wrapLabel(r["Objective/ KPIs"], 38); }),
          datasets: [U.barDs("% Achieved", list.map(function (r) { return r["% Achieved"]; }), list.map(function (r) {
            var a = N(r["% Achieved"]); return a >= 1 ? S.plan : a >= 0.9 ? S.actual : S.alert; }), { borderRadius: { topRight: 4, bottomRight: 4 }, maxBarThickness: 22 })] },
        options: { indexAxis: "y", plugins: { legend: { display: false }, tooltip: U.pctTooltip(),
          datalabels: { display: true, anchor: "end", align: "end", color: C.black, font: { weight: "700" }, formatter: function (x) { return fmt.pct(x); } } },
          layout: { padding: { right: 50 } },
          scales: { x: U.pctAxis(), y: { grid: { display: false }, ticks: { font: { size: 11 } } } } }
      });
      add(p, '<div class="g-legend"><span><i style="background:' + S.plan + '"></i>≥ 100% achieved</span><span><i style="background:' + S.actual +
        '"></i>90–99%</span><span><i style="background:' + S.alert + '"></i>&lt; 90%</span></div>');
    }
    function managed(r) { var n = String(r["Objective/ KPIs"] || "").toLowerCase(); return NSR_MANAGED.some(function (k) { return n.indexOf(k) >= 0; }); }
    kpiChart("KPIs managed by NSR", "% achieved", rows.filter(managed));
    kpiChart("KPIs managed by other departments", "% achieved", rows.filter(function (r) { return !managed(r); }));

    var wk = {}; D.t("Weekly_Report_Updates").forEach(function (r) { wk[String(r["Project Code"])] = r; });
    var del = D.t("Delivery_KPI").map(function (r) {
      var w = wk[String(r["Project Code"])] || {};
      return Object.assign({}, r, { _bl: w["End Date Baseline"], _fc: w["End Date (Forecast/Actual)"], _pl: w["Planned (%) - Cumulative"], _ac: w["Actual (%) - Cumulative"] });
    });
    var dp = panelIn(v, "Delivery KPI details", "% of delivery against approved business plan");
    tableIn(dp, { rows: del, exportName: "Delivery_KPI", autoHeight: true, search: false, columns: [
      { key: "Project Code", label: "Project Code" }, { key: "NSR Plan", label: "Project Name", wrap: true },
      { key: "Target Completion Date", label: "Target Completion Date", type: "date" },
      { key: "_bl", label: "BL Finish", type: "date" }, { key: "_fc", label: "Forecast / Actual Finish", type: "date" },
      { key: "_pl", label: "Planned (%) - Cum", type: "meter", meterCls: "plan" }, { key: "_ac", label: "Actual (%) - Cum", type: "meter" }] });
  };

  /* ======================================================================
     KPI Cost Summary
     ====================================================================== */
  P["kpi-cost"] = function (ctx) {
    var D = ctx.D, v = ctx.view;
    var sum = D.t("KPI_Summary").filter(isKPI([7, 8]));
    var projAll = D.t("KPI_Projects_Data").filter(isKPI([7, 8]));
    var st = filterBar(ctx, [
      { key: "kf", label: "KPI", options: U.uniq(projAll.map(function (r) { return r["Objective/ KPIs"]; })) },
      { key: "proj", label: "Project Name", options: U.uniq(projAll.map(function (r) { return r["Project Name"]; })).sort() }]);
    var proj = projAll.filter(function (r) { return inSel(st.kf, r["Objective/ KPIs"]) && inSel(st.proj, r["Project Name"]); });

    var sp = panelIn(v, "KPI financial summary", "FTY 2026 and year-to-date");
    tableIn(sp, { rows: sum, exportName: "KPI_Cost_Summary", autoHeight: true, search: false, columns: [
      { key: "KPI Filter", label: "KPI Filter", nowrap: true }, { key: "Objective/ KPIs", label: "Objective / KPIs", wrap: true },
      { key: "KPI Weight (%)", label: "KPI Weight (%)", type: "pct" },
      { key: "NSR Spend Plan 2026 as per Budgeting", label: "Spend Plan 2026", type: "money" },
      { key: "NSR V2 Forecast 2026 shared to PC", label: "Forecast V3 2026", type: "money" },
      { key: "FTY Variance", label: "FTY Variance", type: "money", signed: true },
      { key: "YTD Spend Plan 2026 as per Budgeting", label: "YTD Spend Plan", type: "money" },
      { key: "YTD V2 Forecast 2026", label: "YTD Forecast V3", type: "money" },
      { key: "YTD Actual", label: "YTD Actual", type: "money" },
      { key: "YTD Variance", label: "YTD Variance", type: "money", signed: true },
      { key: "% Achieved", label: "% Achieved", type: "meter" }] });
    v.lastChild.style.marginBottom = "16px";

    var pp = panelIn(v, "Project spend detail", proj.length + " projects");
    pp.style.marginBottom = "16px";
    var M = function (k) { return function (r) { return G(r, k); }; };
    tableIn(pp, { rows: proj, exportName: "KPI_Projects_Data", totals: true, columns: [
      { key: "KPI Filter", label: "KPI Filter", nowrap: true }, { key: "Objective/ KPIs", label: "Objective / KPIs", nowrap: true },
      { key: "Code", label: "Code" }, { key: "Project Name", label: "Project Name", nowrap: true },
      { get: M("Spend Plan as per Budgeting (M) FTY 2026"), label: "Spend Plan 2026", type: "money", total: "sum" },
      { get: M("Spend Plan as per V2 Forecast (M) FTY 2026"), label: "Forecast V3 2026", type: "money", total: "sum" },
      { get: M("Variance (M)"), label: "Variance 2026", type: "money", signed: true, total: "sum" },
      { get: M("YTD Spend Plan as per Budgeting (M)"), label: "YTD Spend Plan", type: "money", total: "sum" },
      { get: M("YTD Plan as per V2 Forecast (M)2"), label: "YTD Forecast V3", type: "money", total: "sum" },
      { get: M("YTD Actual (M)"), label: "YTD Actual", type: "money", total: "sum" },
      { get: M("Variance (M)2 w.r.t. Budgeting Spending Plan"), label: "Variance w.r.t. Spend Plan", type: "money", signed: true, total: "sum" },
      { get: M("Variance (M)2 w.r.t. V2 forecast Plan"), label: "Variance w.r.t. Forecast V3", type: "money", signed: true, total: "sum" }] });

    var g = grid(v, "g-2");
    totalsChart(chartBox(panelIn(g, "For the year", "FTY 2026")), [
      { label: "Spend Plan FTY 2026", value: U.sum(proj, M("Spend Plan as per Budgeting (M) FTY 2026")), color: S.plan },
      { label: "Forecast V3 FTY 2026", value: U.sum(proj, M("Spend Plan as per V2 Forecast (M) FTY 2026")), color: S.forecast }]);
    totalsChart(chartBox(panelIn(g, "Year to date", "YTD 2026")), [
      { label: "YTD Spend Plan", value: U.sum(proj, M("YTD Spend Plan as per Budgeting (M)")), color: S.plan },
      { label: "YTD Forecast V3", value: U.sum(proj, M("YTD Plan as per V2 Forecast (M)2")), color: S.forecast },
      { label: "YTD Actual", value: U.sum(proj, M("YTD Actual (M)")), color: S.actual }]);
  };

  /* ======================================================================
     Cost filters shared by the three cost pages
     ====================================================================== */
  function costFilters(ctx, withPhase) {
    var nsr = ctx.D.t("NSR_Project_Data");
    var defs = [
      { key: "proj", label: "Project Name", options: U.uniq(nsr.map(function (r) { return r["Project Name"]; })).sort() },
      { key: "id", label: "Project ID", options: U.uniq(nsr.map(function (r) { return r.ID; })).sort() },
      { key: "fund", label: "Fund Type", options: U.uniq(nsr.map(function (r) { return r["Fund Type"]; })).sort() }];
    if (withPhase) defs.push({ key: "phase", label: "Project Phase", options: U.uniq(nsr.map(function (r) { return r["Project Phase"]; })).sort() });
    var st = filterBar(ctx, defs);
    function ok(r) {
      return inSel(st.proj, r["Project Name"]) && inSel(st.id, r.ID) && inSel(st.fund, r["Fund Type"]) && (!withPhase || inSel(st.phase, r["Project Phase"]));
    }
    return { nsr: nsr.filter(ok), sp: ctx.D.t("Spending_Plan").filter(ok), st: st };
  }

  /* ======================================================================
     Cost Dashboard (register)
     ====================================================================== */
  P.cost = function (ctx) {
    var f = costFilters(ctx, true), rows = f.nsr, v = ctx.view;
    var g = grid(v, "g-5");
    g.innerHTML = mTile("Full Cost", U.sum(rows, "Full Cost")) + mTile("Contract Value", U.sum(rows, "Contract Value"), "black") +
      mTile("WC Total", U.sum(rows, "Total WC"), "mid") + mTile("Paid", U.sum(rows, PAID), "slate") + mTile("Remaining WC", U.sum(rows, "Remaining WC"), "yellow");
    var p = panelIn(v, "Project cost register", rows.length + " projects · click a row for full details");
    tableIn(p, { rows: rows, exportName: "NSR_Project_Data", totals: true, maxHeight: 620,
      onRow: function (r) { U.recordModal(r.ID + " — " + r["Project Name"], r); },
      columns: [
        { key: "SN", label: "SN", type: "int" }, { key: "Fund Type", label: "Fund Type" }, { key: "PROG", label: "PROG" },
        { key: "PO Number", label: "PO Number", type: "text" }, { key: "ID", label: "ID" }, { key: "Project Name", label: "Project Name", nowrap: true },
        { key: "Full Cost", label: "Full Cost", type: "money", total: "sum" }, { key: "Contract Value", label: "Contract Value", type: "money", total: "sum" },
        { key: "WC 2025", label: "WC 2025", type: "money", total: "sum" }, { key: "WC 2026", label: "WC 2026", type: "money", total: "sum" },
        { key: "Total WC", label: "Total WC", type: "money", total: "sum" }, { key: PAID, label: "Paid", type: "money", total: "sum" },
        { key: "Remaining WC", label: "Remain WC", type: "money", total: "sum" },
        { key: "Start Date", label: "Start Date", type: "date" }, { key: "End Date", label: "End Date", type: "date" },
        { key: "Project Phase", label: "Project Phase", type: "badge" }, { key: "Remarks/Concern", label: "Remarks / Concern", wrap: true }] });
  };

  /* ======================================================================
     Cost Analysis (Power BI "Cost Dashboard graph")
     ====================================================================== */
  P["cost-analysis"] = function (ctx) {
    var f = costFilters(ctx, true), v = ctx.view, nsr = f.nsr, sp = f.sp;
    var g = grid(v, "g-4");
    g.innerHTML = mTile("Full Cost", U.sum(nsr, "Full Cost")) + mTile("Contract Value", U.sum(nsr, "Contract Value"), "black") +
      mTile("Total WC", U.sum(nsr, "Total WC"), "mid") + mTile("Paid", U.sum(nsr, PAID), "slate");

    var byCV = nsr.slice().sort(function (a, b) { return sortNum(b["Contract Value"], a["Contract Value"]); });
    var names = byCV.map(function (r) { return r["Project Name"]; });
    var g1 = grid(v, "g-2");
    var h = Math.max(320, names.length * 40 + 70);
    var b1 = chartBox(panelIn(g1, "Contract value vs WC total vs paid", "By project, sorted by contract value")); b1.style.height = h + "px";
    U.chart(b1, { type: "bar",
      data: { labels: names, datasets: [
        U.barDs("Contract Value", byCV.map(function (r) { return r["Contract Value"]; }), S.plan),
        U.barDs("Total WC", byCV.map(function (r) { return r["Total WC"]; }), S.forecast),
        U.barDs("Paid", byCV.map(function (r) { return r[PAID]; }), S.actual)] },
      options: { indexAxis: "y", elements: { bar: { borderRadius: { topRight: 4, bottomRight: 4 } } },
        plugins: { tooltip: U.moneyTooltip() }, scales: { x: U.moneyAxis(), y: { grid: { display: false } } } } });

    var byP = {}; sp.forEach(function (r) {
      var o = byP[r["Project Name"]] || (byP[r["Project Name"]] = { plan: 0, fc: 0, act: 0, inv: 0 });
      o.plan += N(G(r, SP.plan)) || 0; o.fc += N(G(r, SP.fc)) || 0; o.act += N(G(r, SP.act)) || 0; o.inv += N(G(r, SP.inv)) || 0;
    });
    var b2 = chartBox(panelIn(g1, "Plan vs forecast vs actual", "2026 spend by project, sorted by contract value")); b2.style.height = h + "px";
    function pv(k) { return names.map(function (n) { return byP[n] ? byP[n][k] : null; }); }
    U.chart(b2, { type: "bar",
      data: { labels: names, datasets: [U.barDs("Spend Plan", pv("plan"), S.plan), U.barDs("Forecast V3", pv("fc"), S.forecast),
        U.barDs("Actual Spend", pv("act"), S.actual), U.barDs("Invoice Plan", pv("inv"), S.invoice)] },
      options: { indexAxis: "y", elements: { bar: { borderRadius: { topRight: 4, bottomRight: 4 } } },
        plugins: { tooltip: U.moneyTooltip() }, scales: { x: U.moneyAxis(), y: { grid: { display: false } } } } });

    var ids = nsr.map(function (r) { return String(r.ID); });
    var kp = ctx.D.t("KPI_Projects_Data").filter(function (r) { return ids.indexOf(String(r.Code)) >= 0; });
    var g2 = grid(v, "g-2");
    totalsChart(chartBox(panelIn(g2, "Incremental budget vs total forecast", "Sum of 2026 monthly values")), [
      { label: "Spend Plan", value: U.sum(sp, function (r) { return G(r, SP.plan); }), color: S.plan },
      { label: "Forecast V3", value: U.sum(sp, function (r) { return G(r, SP.fc); }), color: S.forecast },
      { label: "Actual Spend", value: U.sum(sp, function (r) { return G(r, SP.act); }), color: S.actual }]);
    totalsChart(chartBox(panelIn(g2, "Up-to-date budget vs total forecast", "Year to date (KPI projects data)")), [
      { label: "YTD Spend Plan", value: U.sum(kp, function (r) { return G(r, "YTD Spend Plan as per Budgeting (M)"); }), color: S.plan },
      { label: "YTD Forecast V3", value: U.sum(kp, function (r) { return G(r, "YTD Plan as per V2 Forecast (M)2"); }), color: S.forecast },
      { label: "YTD Actual", value: U.sum(kp, function (r) { return G(r, "YTD Actual (M)"); }), color: S.actual }]);

    var mm = monthly(sp), labels = mm.map(function (o) { return fmt.month(o.month); });
    var g3 = grid(v, "g-2");
    U.chart(chartBox(panelIn(g3, "Plan vs actual", "By month")), { type: "bar",
      data: { labels: labels, datasets: [U.barDs("Spend Plan", mm.map(function (o) { return o.plan; }), S.plan),
        U.barDs("Forecast V3", mm.map(function (o) { return o.fc; }), S.forecast), U.barDs("Actual Spend", mm.map(function (o) { return o.act; }), S.actual)] },
      options: { plugins: { tooltip: U.moneyTooltip() }, scales: { x: U.catAxis(), y: U.moneyAxis() } } });
    U.chart(chartBox(panelIn(g3, "SAR vs contractor forecast", "By month")), { type: "bar",
      data: { labels: labels, datasets: [U.barDs("Forecast V3 (SAR)", mm.map(function (o) { return o.fc; }), S.forecast),
        U.barDs("Invoice Plan (contractor)", mm.map(function (o) { return o.inv; }), S.invoice)] },
      options: { plugins: { tooltip: U.moneyTooltip() }, scales: { x: U.catAxis(), y: U.moneyAxis() } } });

    var inv = sp.filter(function (r) { return r["Invoice Related actvities"]; });
    var ip = panelIn(v, "Detailed invoice plan forecast", inv.length + " invoice-related activities");
    tableIn(ip, { rows: inv, exportName: "Invoice_Plan", totals: true, sort: { key: "Month", dir: 1 }, columns: [
      { key: "Project Name", label: "Project Name", nowrap: true },
      { key: "Invoice Related actvities", label: "Invoice Related Activities", wrap: true },
      { get: function (r) { return G(r, SP.inv); }, label: "Invoice Plan", type: "money", total: "sum" },
      { key: "Month", label: "Month", type: "date", render: function (x) { return esc(fmt.month(x)); } }] });
  };

  /* ======================================================================
     Cost S-Curve
     ====================================================================== */
  P["cost-scurve"] = function (ctx) {
    var f = costFilters(ctx, false), v = ctx.view, mm = monthly(f.sp);
    var labels = mm.map(function (o) { return fmt.month(o.month); });
    var last = mm[mm.length - 1] || {};
    var lastAct = mm.filter(function (o) { return o.actCv != null; }).pop() || {};
    var g = grid(v, "g-4");
    g.innerHTML = mTile("Spend Plan (FY)", last.planC) + mTile("Forecast V3 (FY)", last.fcC, "mid") +
      mTile("Actual to date", lastAct.actCv, "yellow", lastAct.month ? "Cumulative to " + fmt.month(lastAct.month) : "") +
      mTile("Invoice Plan (FY)", last.invC, "slate", "Contractor cash-flow forecast");

    var p1 = panelIn(v, "Cumulative spend S-curve", "Spend plan vs forecast vs actual");
    p1.style.marginBottom = "16px";
    U.chart(chartBox(p1, "tall"), { type: "line",
      data: { labels: labels, datasets: [
        U.lineDs("Spend Plan (cum)", mm.map(function (o) { return o.planC; }), S.plan),
        U.lineDs("Forecast V3 (cum)", mm.map(function (o) { return o.fcC; }), S.forecast),
        U.lineDs("Actual Spend (cum)", mm.map(function (o) { return o.actCv; }), S.actual, { borderWidth: 3, pointRadius: 3 }),
        U.lineDs("Invoice Plan (cum)", mm.map(function (o) { return o.invC; }), S.invoice, { borderDash: [6, 4] })] },
      options: { plugins: { tooltip: U.moneyTooltip() }, scales: { x: U.catAxis(), y: U.moneyAxis() } } });

    var p2 = panelIn(v, "Monthly spend", "Incremental values by month");
    p2.style.marginBottom = "16px";
    U.chart(chartBox(p2), { type: "bar",
      data: { labels: labels, datasets: [U.barDs("Spend Plan", mm.map(function (o) { return o.plan; }), S.plan),
        U.barDs("Forecast V3", mm.map(function (o) { return o.fc; }), S.forecast), U.barDs("Actual Spend", mm.map(function (o) { return o.act; }), S.actual),
        U.barDs("Invoice Plan", mm.map(function (o) { return o.inv; }), S.invoice)] },
      options: { plugins: { tooltip: U.moneyTooltip() }, scales: { x: U.catAxis(), y: U.moneyAxis() } } });

    var p3 = panelIn(v, "S-curve data", "Monthly and cumulative values (SAR)");
    tableIn(p3, { rows: mm, exportName: "Cost_S_Curve", search: false, autoHeight: true, totals: true, columns: [
      { key: "month", label: "Month", render: function (x) { return esc(fmt.month(x)); } },
      { key: "plan", label: "Spend Plan", type: "money", total: "sum" }, { key: "fc", label: "Forecast V3", type: "money", total: "sum" },
      { key: "act", label: "Actual Spend", type: "money", total: "sum" }, { key: "inv", label: "Invoice Plan", type: "money", total: "sum" },
      { key: "planC", label: "Spend Plan (cum)", type: "money" }, { key: "fcC", label: "Forecast V3 (cum)", type: "money" },
      { key: "actCv", label: "Actual (cum)", type: "money" }, { key: "invC", label: "Invoice Plan (cum)", type: "money" }] });
  };

  /* ======================================================================
     Weekly Progress Summary
     ====================================================================== */
  function spiOf(r) { var pv = N(r["Cumulative PV (SAR)"]), ev = N(r["Cumulative EV (SAR)"]); return pv ? (ev || 0) / pv : 0; }
  function spiCls(x) { x = N(x); return x == null ? "" : x >= 1 ? "pos" : x < 0.9 ? "neg" : ""; }
  var WEEKLY_GROUPS = [
    { title: "Project", keys: ["Report Date", "Program", "Project Code", "Project Name", "Project Description", "Project Year", "Project Size", "Project Complexity", "Project Group", "Project Type", "Project Category", "Region", "Province", "City", "Performing Organization (Business Unit)", "Performing Organization (Department)", "Project Owner (Department)", "Project Manager", "Project Sponsor (Business Unit)", "Contract Type", "Contractor", "Critical Project", "Phase Classification", "Current Phase", "Project Status"] },
    { title: "Schedule & progress", keys: ["Start Date Baseline", "End Date Baseline", "Start Date (Forecast/Actual)", "End Date (Forecast/Actual)", "Variance", "Planned (%) This Week", "Planned (%) - Cumulative", "Actual (%) This Week", "Actual (%) - Cumulative", "Performance Status", "Reason for Delays", "Cumulative EV (SAR)", "Cumulative PV (SAR)", "SPI"] },
    { title: "Finance", keys: ["Budget Type", "Funding Source", "Cost Code", "Full Budget", "2026 Approved Budget", "Contract Value", "Revised Contract Value", "Work Confirmation", "Submitted Amount", "Paid Amount", "Paid (%) (I/E)", "Variation Order Amount", "Delayed Payments Amount", "Total WC %", "Total Paid %"] },
    { title: "HSE & quality", keys: ["Total Manpower (Cumulative)", "Total Manpower (This Week)", "Total Man-Hours (Cumulative)", "Total Man-Hours (This Week)", "Safe Man-Hours (Since Las LTI) - (Cumulative)", "Fatality (Cumulative)", "Lost Time Incident (Cumulative)", "Near Misses (Cumulative)", "Issued NCR", "Closed NCR", "Open NCR", "Issued SOR", "Closed SOR", "Open SOR"] },
    { title: "Achievements, lookahead & concerns", keys: ["Achievements Description", "Activitiy Description", "Issue/Concern Description", "Mitigation Action", "Responsible", "Status", "KM Activitiy Description"] }];

  P.weekly = function (ctx) {
    var D = ctx.D, v = ctx.view, all = D.t("Weekly_Report_Updates");
    var st = filterBar(ctx, [{ key: "proj", label: "Project Name", options: U.uniq(all.map(function (r) { return r["Project Name"]; })).sort() },
      { key: "perf", label: "Performance Status", options: U.uniq(all.map(function (r) { return r["Performance Status"]; })).sort() }]);
    var rows = all.filter(function (r) { return inSel(st.proj, r["Project Name"]) && inSel(st.perf, r["Performance Status"]); });
    var ev = U.sum(rows, "Cumulative EV (SAR)"), pv = U.sum(rows, "Cumulative PV (SAR)");
    var delayed = rows.filter(function (r) { return /delay/i.test(r["Performance Status"] || ""); }).length;
    var g = grid(v, "g-4");
    g.innerHTML = U.tile({ value: rows.length, label: "Projects", note: "Report date " + fmt.date(D.reportDate) }) +
      mTile("Contract value", U.sum(rows, "Contract Value"), "black") +
      U.tile({ value: pv ? (ev / pv).toFixed(2) : "—", label: "SPI (cost)", color: "mid", note: "Σ Cum EV ÷ Σ Cum PV" }) +
      U.tile({ value: delayed, label: "Delayed projects", color: delayed ? "red" : "slate", note: "of " + rows.length });

    var p = panelIn(v, "Weekly progress summary — NSR", "Click a row to see the full weekly record");
    p.style.marginBottom = "16px";
    tableIn(p, { rows: rows, exportName: "Weekly_Progress_Summary", totals: true, maxHeight: 640,
      onRow: function (r) { U.recordModal(r["Project Code"] + " — " + r["Project Name"], r, WEEKLY_GROUPS); },
      columns: [
        { key: "Project Code", label: "Project Code" }, { key: "Project Name", label: "Project Name", wrap: true },
        { key: "Planned (%) This Week", label: "Planned % This Week", type: "pct", nowrap: true },
        { key: "Actual (%) This Week", label: "Actual % This Week", type: "pct" },
        { key: "Planned (%) - Cumulative", label: "Planned % Cum", type: "pct" },
        { key: "Actual (%) - Cumulative", label: "Actual % Cum", type: "pct" },
        { get: function (r) { var a = N(r["Actual (%) - Cumulative"]), b = N(r["Planned (%) - Cumulative"]); return a == null || b == null ? null : a - b; }, label: "Progress Variance", type: "pct", signed: true },
        { get: spiOf, label: "SPI Cost", type: "dec", cls: spiCls, total: function (rs) { var e = U.sum(rs, "Cumulative EV (SAR)"), q = U.sum(rs, "Cumulative PV (SAR)"); return q ? (e / q).toFixed(2) : ""; } },
        { key: "Total WC %", label: "Total WC %", type: "pct" }, { key: "Total Paid %", label: "Total Paid %", type: "pct" },
        { key: "Contract Value", label: "Contract Value", type: "money", total: "sum" },
        { key: "Start Date Baseline", label: "Start Date Baseline", type: "date" }, { key: "End Date Baseline", label: "End Date Baseline", type: "date" },
        { key: "End Date (Forecast/Actual)", label: "End Date (Forecast/Actual)", type: "date" },
        { key: "Cumulative PV (SAR)", label: "Cumulative PV (SAR)", type: "money", total: "sum" },
        { key: "Cumulative EV (SAR)", label: "Cumulative EV (SAR)", type: "money", total: "sum" },
        { key: "Performance Status", label: "Status", type: "badge" }] });

    var pc = panelIn(v, "Planned vs actual cumulative progress", "By project");
    var box = chartBox(pc); box.style.height = Math.max(300, rows.length * 38 + 70) + "px";
    U.chart(box, { type: "bar",
      data: { labels: rows.map(function (r) { return r["Project Code"] + " — " + String(r["Project Name"]).slice(0, 48); }), datasets: [
        U.barDs("Planned % (cum)", rows.map(function (r) { return r["Planned (%) - Cumulative"]; }), S.plan),
        U.barDs("Actual % (cum)", rows.map(function (r) { return r["Actual (%) - Cumulative"]; }), S.actual)] },
      options: { indexAxis: "y", elements: { bar: { borderRadius: { topRight: 4, bottomRight: 4 } } },
        plugins: { tooltip: U.pctTooltip() }, scales: { x: U.pctAxis(1), y: { grid: { display: false } } } } });
  };

  /* ======================================================================
     Project Progress (single-project report card)
     ====================================================================== */
  P.project = function (ctx) {
    var D = ctx.D, v = ctx.view, wk = D.t("Weekly_Report_Updates").filter(function (r) { return r["Project Name"]; });
    if (!wk.length) { add(v, '<div class="empty">No weekly report data.</div>'); return; }
    var st = ctx.state;
    if (!st.src || !wk.some(function (r) { return r["Source.Name"] === st.src; })) st.src = wk[0]["Source.Name"];
    var bar = add(v, '<div class="filters"></div>');
    var sel = U.select({ label: "Project", value: st.src, options: wk.map(function (r) { return { value: r["Source.Name"], label: r["Project Code"] + " — " + r["Project Name"] }; }),
      onChange: function (x) { st.src = x; ctx.rerender(); } });
    sel.style.flex = "1"; sel.querySelector("select").style.maxWidth = "none";
    bar.appendChild(sel);

    var r = wk.filter(function (x) { return x["Source.Name"] === st.src; })[0];
    var src = r["Source.Name"], code = String(r["Project Code"]);
    function bySrc(t) { return D.t(t).filter(function (x) { return x["Source.Name"] === src; }); }

    var gi = grid(v, "g-6");
    gi.innerHTML = U.info("Project Code", esc(code)) + U.info("Report Date", fmt.date(r["Report Date"])) +
      U.info("BL Start Date", fmt.date(r["Start Date Baseline"])) + U.info("BL End Date", fmt.date(r["End Date Baseline"])) +
      U.info("Forecasted Finish Date", fmt.date(r["End Date (Forecast/Actual)"])) + U.info("Contractor", esc(r.Contractor));

    var spi = N(r.SPI);
    var gt = grid(v, "g-5");
    gt.innerHTML = U.tile({ value: fmt.pct(r["Planned (%) - Cumulative"]), label: "Cum Plan %" }) +
      U.tile({ value: fmt.pct(r["Actual (%) - Cumulative"]), label: "Cum Actual %", color: "yellow" }) +
      U.tile({ value: spi == null ? "—" : spi.toFixed(2), label: "SPI", color: spi != null && spi < 0.9 ? "red" : "mid", note: esc(r["Performance Status"] || "") }) +
      U.tile({ value: fmt.pct(r["Paid (%) (I/E)"]), label: "Paid %", color: "slate", note: fmt.money(r["Paid Amount"]) + " SAR paid" }) +
      mTile("Contract value", r["Contract Value"], "black");

    var g1 = grid(v, "g-3");
    var cd = D.t("Contract_Details").filter(function (x) { return String(x.Code) === code; })[0];
    add(panelIn(g1, "Scope of work", cd ? esc(cd.Stage || "") : ""), '<div class="scope">' + esc(cd && cd.Scope ? cd.Scope : r["Project Description"] || "No scope recorded in Contract details.") + "</div>");
    var pp = panelIn(g1, "Cumulative progress", "Plan vs actual");
    U.chart(chartBox(pp, "short"), { type: "bar",
      data: { labels: ["Cum Plan", "Cum Actual"], datasets: [U.barDs("Progress", [r["Planned (%) - Cumulative"], r["Actual (%) - Cumulative"]], [S.plan, S.actual], { maxBarThickness: 40, borderRadius: { topRight: 4, bottomRight: 4 } })] },
      options: { indexAxis: "y", plugins: { legend: { display: false }, tooltip: U.pctTooltip(),
        datalabels: { display: true, anchor: "end", align: "end", color: C.black, font: { weight: "700" }, formatter: function (x) { return fmt.pct(x); } } },
        layout: { padding: { right: 50 } }, scales: { x: U.pctAxis(1), y: { grid: { display: false } } } } });
    add(panelIn(g1, "Reason for delays", ""), '<div class="note-box warn">' + esc(r["Reason for Delays"] || "No delay reason reported this week.") + "</div>");

    var g2 = grid(v, "g-2");
    var ms = bySrc("Project_Milestones_Progress").sort(function (a, b) { return sortNum(a.Sort, b.Sort); });
    var mp = panelIn(g2, "Project milestones progress", ms.length + " milestones");
    if (ms.length) {
      var mb = chartBox(mp); mb.style.height = Math.max(240, ms.length * 44 + 70) + "px";
      U.chart(mb, { type: "bar",
        data: { labels: ms.map(function (x) { return x.Description; }), datasets: [
          U.barDs("Planned progress", ms.map(function (x) { return x["Planned progress"]; }), S.plan),
          U.barDs("Actual progress", ms.map(function (x) { return x["Actual Progress"]; }), S.actual)] },
        options: { indexAxis: "y", elements: { bar: { borderRadius: { topRight: 4, bottomRight: 4 } } },
          plugins: { tooltip: U.pctTooltip() }, scales: { x: U.pctAxis(1), y: { grid: { display: false } } } } });
    } else add(mp, '<div class="empty">No milestones for this project.</div>');

    var dp = panelIn(g2, "Deliverable status", "Submittals");
    tableIn(dp, { rows: bySrc("Deliverable_Status"), exportName: "Deliverable_Status", search: false, autoHeight: true, totals: true, columns: [
      { key: "Sr.No", label: "Sr.No", type: "int" }, { key: "Project Deliverables", label: "Project Deliverables" },
      { key: "Total Subm. (PL.Cum)", label: "Total Subm. (PL.Cum)", type: "int", total: "sum" },
      { key: "Total Subm. (Act. Cum)", label: "Total Subm. (Act. Cum)", type: "int", total: "sum" },
      { key: "Approved", label: "Approved", type: "int", total: "sum" },
      { key: "U/R", label: "U/R", type: "int", total: "sum" }, { key: "Rejected", label: "Rejected", type: "int", total: "sum" }] });

    var g3 = grid(v, "g-2");
    var ipc = bySrc("Interim_Payment_Certificate").filter(function (x) { return N(x["Cum Sum"]) !== 0; });
    tableIn(panelIn(g3, "Interim payment certificates", "IPC / VO cumulative"), { rows: ipc, exportName: "IPC", search: false, autoHeight: true, columns: [
      { key: "Sr.No", label: "Sr.No", type: "int" }, { key: "Description", label: "Description", wrap: true },
      { key: "IPC / VO No.", label: "IPC / VO No." }, { key: "Cum Sum", label: "Cum Sum (SAR)", type: "money" }] });
    var la = bySrc("Lookahead_Activities").filter(function (x) { return x["Lookahead Activities (7 Days) Description"]; });
    tableIn(panelIn(g3, "Lookahead activities", "Next 7 days"), { rows: la, exportName: "Lookahead", search: false, autoHeight: true, columns: [
      { key: "Sr. No.", label: "Sr. No.", type: "int" }, { key: "Lookahead Activities (7 Days) Description", label: "Lookahead Activities (7 Days) Description", wrap: true }] });

    var ac = bySrc("Area_of_Concern").filter(function (x) { return x["Issue /Concern Description"]; });
    tableIn(panelIn(v, "Areas of concern", ac.length + " items"), { rows: ac, exportName: "Area_of_Concern", search: false, autoHeight: true, columns: [
      { key: "Sr. No.", label: "SN", type: "int" }, { key: "Issue /Concern Description", label: "Issue / Concern Description", wrap: true },
      { key: "Mitigation Action", label: "Mitigation Action", wrap: true }, { key: "Date Raised", label: "Date Raised", type: "date" },
      { key: "Responsible", label: "Responsible" }, { key: "Target Date", label: "Target Date", type: "date" }, { key: "Status", label: "Status", type: "badge" }] });
  };

  /* ======================================================================
     Progress S-Curve
     ====================================================================== */
  P["progress-scurve"] = function (ctx) {
    var D = ctx.D, v = ctx.view, sc = D.t("S_Curve"), st = ctx.state;
    var srcs = U.uniq(sc.map(function (r) { return r["Source.Name"]; }));
    if (!srcs.length) { add(v, '<div class="empty">No S-Curve data.</div>'); return; }
    if (srcs.indexOf(st.src) < 0) st.src = srcs[0];
    var bar = add(v, '<div class="filters"></div>');
    var s = U.select({ label: "Project", value: st.src, options: srcs.map(function (x) { return { value: x, label: D.projectLabel(x) }; }).sort(function (a, b) { return a.label.localeCompare(b.label); }),
      onChange: function (x) { st.src = x; ctx.rerender(); } });
    s.style.flex = "1"; s.querySelector("select").style.maxWidth = "none"; bar.appendChild(s);

    var rows = sc.filter(function (r) { return r["Source.Name"] === st.src && r["Report Date"]; }).sort(function (a, b) { return a["Report Date"] < b["Report Date"] ? -1 : 1; });
    var lastA = rows.filter(function (r) { return N(r["Cum Actual (%)"]) != null; }).pop() || {};
    var fin = rows[rows.length - 1] || {};
    var varc = N(lastA["Cum Actual (%)"]) != null && N(lastA["Cum Plan (%)"]) != null ? lastA["Cum Actual (%)"] - lastA["Cum Plan (%)"] : null;
    var g = grid(v, "g-4");
    g.innerHTML = U.tile({ value: fmt.pct(lastA["Cum Plan (%)"]), label: "Cum plan", note: "at " + fmt.date(lastA["Report Date"]) }) +
      U.tile({ value: fmt.pct(lastA["Cum Actual (%)"]), label: "Cum actual", color: "yellow", note: "at " + fmt.date(lastA["Report Date"]) }) +
      U.tile({ value: varc == null ? "—" : fmt.pct(varc), label: "Variance", color: varc != null && varc < -0.05 ? "red" : "mid", note: "Actual − plan" }) +
      U.tile({ value: fmt.date(fin["Report Date"]), label: "Curve end date", color: "slate", note: rows.length + " weekly points" });

    var p = panelIn(v, "Progress % S-curve", esc(D.projectLabel(st.src)));
    p.style.marginBottom = "16px";
    U.chart(chartBox(p, "xl"), { type: "line",
      data: { labels: rows.map(function (r) { return fmt.date(r["Report Date"]); }), datasets: [
        U.lineDs("Cum Plan (%)", rows.map(function (r) { return r["Cum Plan (%)"]; }), S.plan),
        U.lineDs("Cum Actual (%)", rows.map(function (r) { return r["Cum Actual (%)"]; }), S.actual, { borderWidth: 3, spanGaps: false }),
        U.lineDs("Cum Forecast (%)", rows.map(function (r) { return r["Cum Forecast (%)"]; }), S.forecast, { borderDash: [6, 4], spanGaps: false })] },
      options: { plugins: { tooltip: U.pctTooltip() }, scales: { x: Object.assign(U.catAxis(), { ticks: { autoSkip: true, maxTicksLimit: 18, maxRotation: 0 } }), y: U.pctAxis(1) } } });

    tableIn(panelIn(v, "S-curve data", "Weekly values"), { rows: rows, exportName: "Progress_S_Curve", search: false, columns: [
      { key: "Report Date", label: "Report Date", type: "date" }, { key: "Cum Plan (%)", label: "Cum Plan (%)", type: "pct", render: function (x) { return fmt.pct(x, 2); } },
      { key: "Cum Actual (%)", label: "Cum Actual (%)", type: "pct", render: function (x) { return fmt.pct(x, 2); } },
      { key: "Cum Forecast (%)", label: "Cum Forecast (%)", type: "pct", render: function (x) { return fmt.pct(x, 2); } },
      { key: "This Week Plan (%)", label: "This Week Plan (%)", type: "pct", render: function (x) { return fmt.pct(x, 2); } },
      { key: "This Week Actual (%)", label: "This Week Actual (%)", type: "pct", render: function (x) { return fmt.pct(x, 2); } }] });
  };

  /* ======================================================================
     Gantt (Master Plan + Timeline)
     ====================================================================== */
  function dnum(s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ""); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null; }
  function gantt(host, rows, groupLabel) {
    var ds = [];
    rows.forEach(function (r) { [r["Project Start"], r["Planned Finish"], r["Actual/Forecast Finish"], r["Data Date"]].forEach(function (x) { var n = dnum(x); if (n) ds.push(n); }); });
    if (!ds.length) { add(host, '<div class="empty">No milestone dates to plot.</div>'); return; }
    var min = new Date(Math.min.apply(null, ds)), max = new Date(Math.max.apply(null, ds));
    var t0 = Date.UTC(min.getUTCFullYear(), min.getUTCMonth(), 1), t1 = Date.UTC(max.getUTCFullYear(), max.getUTCMonth() + 1, 1);
    function x(n) { return ((n - t0) / (t1 - t0) * 100).toFixed(3) + "%"; }
    var months = [], d = new Date(t0);
    while (d.getTime() < t1) { months.push(d.getTime()); d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)); }
    var step = months.length > 36 ? 6 : months.length > 18 ? 3 : 1;
    var ticks = months.filter(function (m, i) { return i % step === 0; });
    var MN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var gridLines = ticks.map(function (m) { return '<span class="g-grid" style="left:' + x(m) + '"></span>'; }).join("");
    var dd = dnum((rows.filter(function (r) { return r["Data Date"]; })[0] || {})["Data Date"]);
    var today = dd ? '<span class="g-today" style="left:' + x(dd) + '" title="Data date ' + fmt.date(rows[0]["Data Date"]) + '"></span>' : "";

    var h = '<div class="g-legend"><span><i style="background:' + C.gray + '"></i>Baseline (start → planned finish)</span><span><i style="background:' + C.mid +
      '"></i>Forecast / actual finish</span><span><i style="background:' + C.blue + '"></i>Actual progress</span><span><i style="background:' + C.red +
      '"></i>Forecast later than plan</span><span><i style="background:' + C.yellow + ';width:3px"></i>Data date</span></div>';
    h += '<div class="gantt"><div class="gantt-inner"><div class="g-row g-head"><div>Milestone</div><div class="num">Plan %</div><div class="num">Actual %</div><div class="g-track"><div class="g-months">' +
      ticks.map(function (m) { var dt = new Date(m); return '<span style="left:' + x(m) + '">' + MN[dt.getUTCMonth()] + " " + String(dt.getUTCFullYear()).slice(2) + "</span>"; }).join("") + "</div></div></div>";
    var lastGroup = null;
    rows.forEach(function (r) {
      var gname = groupLabel(r);
      if (gname !== lastGroup) {
        h += '<div class="g-row g-group"><div>' + esc(gname) + '</div><div class="g-track">' + gridLines + today + "</div></div>";
        lastGroup = gname;
      }
      var s = dnum(r["Project Start"]), pf = dnum(r["Planned Finish"]), ff = dnum(r["Actual/Forecast Finish"]);
      var late = pf && ff && ff > pf;
      var act = Math.max(0, Math.min(1, N(r["Actual Progress"]) || 0));
      var tip = esc(r.Description) + " | Start " + fmt.date(r["Project Start"]) + " | Planned finish " + fmt.date(r["Planned Finish"]) +
        " | Forecast/actual finish " + fmt.date(r["Actual/Forecast Finish"]) + " | Planned " + fmt.pct(r["Planned progress"]) + " · Actual " + fmt.pct(r["Actual Progress"]) +
        (r["Var.Days"] != null ? " | Var " + r["Var.Days"] + " days" : "");
      h += '<div class="g-row" title="' + tip + '"><div>' + esc(r.Description) + (r.WSB && r.WSB !== r.Description ? ' <span class="muted">&nbsp;· ' + esc(r.WSB) + "</span>" : "") +
        '</div><div class="num">' + fmt.pct(r["Planned progress"], 0) + '</div><div class="num">' + fmt.pct(r["Actual Progress"], 0) + '</div><div class="g-track">' + gridLines + today;
      if (s && pf) h += '<span class="g-bar base" style="left:' + x(s) + ";width:calc(" + x(pf) + " - " + x(s) + ')"></span>';
      if (s && ff) h += '<span class="g-bar fc' + (late ? " late" : "") + '" style="left:' + x(s) + ";width:calc(" + x(ff) + " - " + x(s) + ')"><i style="width:' + (act * 100).toFixed(1) + '%"></i></span>';
      h += "</div></div>";
    });
    h += "</div></div>";
    add(host, "<div>" + h + "</div>");
  }

  P["master-plan"] = function (ctx) {
    var D = ctx.D, v = ctx.view, all = D.t("Project_Milestones_Progress_Combine");
    var st = filterBar(ctx, [
      { key: "wsb", label: "WBS", options: U.uniq(all.map(function (r) { return r.WSB; })) },
      { key: "src", label: "Project", options: U.uniq(all.map(function (r) { return r["Source.Name"]; })), display: D.projectLabel }]);
    var rows = all.filter(function (r) { return inSel(st.wsb, r.WSB) && inSel(st.src, r["Source.Name"]); })
      .sort(function (a, b) { var s = D.projectLabel(a["Source.Name"]).localeCompare(D.projectLabel(b["Source.Name"])); return s || sortNum(a.Sort, b.Sort); });
    var late = rows.filter(function (r) { var p = dnum(r["Planned Finish"]), f = dnum(r["Actual/Forecast Finish"]); return p && f && f > p; }).length;
    var g = grid(v, "g-4");
    g.innerHTML = U.tile({ value: U.uniq(rows.map(function (r) { return r["Source.Name"]; })).length, label: "Projects" }) +
      U.tile({ value: rows.length, label: "Milestones", color: "black" }) +
      U.tile({ value: late, label: "Forecast later than plan", color: late ? "red" : "slate" }) +
      U.tile({ value: fmt.date((rows[0] || {})["Data Date"]), label: "Data date", color: "mid" });
    gantt(panelIn(v, "Projects master plan", "Hover a bar for dates and progress"), rows, function (r) { return D.projectLabel(r["Source.Name"]); });
  };

  P.timeline = function (ctx) {
    var D = ctx.D, v = ctx.view, all = D.t("Project_Milestones_Progress"), st = ctx.state;
    var srcs = U.uniq(all.map(function (r) { return r["Source.Name"]; }));
    if (!srcs.length) { add(v, '<div class="empty">No milestone data.</div>'); return; }
    if (srcs.indexOf(st.src) < 0) st.src = srcs[0];
    var bar = add(v, '<div class="filters"></div>');
    var s = U.select({ label: "Project", value: st.src, options: srcs.map(function (x) { return { value: x, label: D.projectLabel(x) }; }).sort(function (a, b) { return a.label.localeCompare(b.label); }),
      onChange: function (x) { st.src = x; ctx.rerender(); } });
    s.style.flex = "1"; s.querySelector("select").style.maxWidth = "none"; bar.appendChild(s);
    var rows = all.filter(function (r) { return r["Source.Name"] === st.src; }).sort(function (a, b) { return sortNum(a.Sort, b.Sort); });
    var p = panelIn(v, "Project timeline", esc(D.projectLabel(st.src)));
    p.style.marginBottom = "16px";
    gantt(p, rows, function () { return D.projectLabel(st.src); });
    tableIn(panelIn(v, "Milestone data", rows.length + " milestones"), { rows: rows, exportName: "Project_Milestones", search: false, autoHeight: true, columns: [
      { key: "Sr No", label: "Sr No", type: "int" }, { key: "Description", label: "Description" },
      { key: "Project Start", label: "Project Start", type: "date" }, { key: "Planned Finish", label: "Planned Finish", type: "date" },
      { key: "Actual/Forecast Finish", label: "Actual / Forecast Finish", type: "date" },
      { key: "Planned progress", label: "Planned Progress", type: "meter", meterCls: "plan" }, { key: "Actual Progress", label: "Actual Progress", type: "meter" },
      { key: "Var.Days", label: "Var. Days", type: "int", signed: true }, { key: "Var.progress", label: "Var. Progress", type: "pct", signed: true }] });
  };

  /* ======================================================================
     Issue Register
     ====================================================================== */
  var RATE_ORDER = ["Critical", "High", "Medium", "Low"];
  var RATE_COLOR = { Critical: C.red, High: C.yellow, Medium: C.mid, Low: C.slate };
  P.issues = function (ctx) {
    var D = ctx.D, v = ctx.view, all = D.t("Issue_register").filter(function (r) { return r["ILR ID No."] || r["Issue (Description)"]; });
    var st = filterBar(ctx, [
      { key: "status", label: "Issue Status", options: U.uniq(all.map(function (r) { return r["Issue Status"]; })).sort() },
      { key: "rate", label: "Issue Rate", options: U.uniq(all.map(function (r) { return r["Issue Rate"]; })).sort(function (a, b) { return RATE_ORDER.indexOf(a) - RATE_ORDER.indexOf(b); }) },
      { key: "code", label: "Project Code", options: U.uniq(all.map(function (r) { return r["Poject Code"]; })).sort() },
      { key: "name", label: "Project Name", options: U.uniq(all.map(function (r) { return r["Project Name"]; })).sort() }]);
    var rows = all.filter(function (r) {
      return inSel(st.status, r["Issue Status"]) && inSel(st.rate, r["Issue Rate"]) && inSel(st.code, r["Poject Code"]) && inSel(st.name, r["Project Name"]);
    });
    function cnt(re, field) { return rows.filter(function (r) { return re.test(r[field] || ""); }).length; }
    var g = grid(v, "g-5");
    g.innerHTML = U.tile({ value: rows.length, label: "Issues", note: U.uniq(rows.map(function (r) { return r["Poject Code"]; })).length + " projects" }) +
      U.tile({ value: cnt(/pending/i, "Issue Status"), label: "Pending", color: "yellow" }) +
      U.tile({ value: cnt(/escalat/i, "Issue Status"), label: "Escalated", color: "red" }) +
      U.tile({ value: cnt(/resolved|closed/i, "Issue Status"), label: "Resolved", color: "slate" }) +
      U.tile({ value: rows.filter(function (r) { return /critical/i.test(r["Issue Rate"] || "") && !/resolved|closed/i.test(r["Issue Status"] || ""); }).length, label: "Open critical", color: "black", note: "Critical and not resolved" });

    var g2 = grid(v, "g-2-1");
    var projs = U.uniq(rows.map(function (r) { return r["Project Name"]; }));
    projs.sort(function (a, b) { return rows.filter(function (r) { return r["Project Name"] === b; }).length - rows.filter(function (r) { return r["Project Name"] === a; }).length; });
    var pb = chartBox(panelIn(g2, "Issues by project and rate", "Count of issues")); pb.style.height = Math.max(280, projs.length * 30 + 70) + "px";
    U.chart(pb, { type: "bar",
      data: { labels: projs, datasets: RATE_ORDER.map(function (rt) {
        return U.barDs(rt, projs.map(function (p) { return rows.filter(function (r) { return r["Project Name"] === p && r["Issue Rate"] === rt; }).length; }), RATE_COLOR[rt],
          { borderColor: C.white, borderWidth: { right: 2 }, borderRadius: 0, maxBarThickness: 22 }); }) },
      options: { indexAxis: "y", scales: { x: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, grid: { color: "rgba(200,201,199,.5)" } }, y: { stacked: true, grid: { display: false }, ticks: { callback: U.shortLabel(46) } } } } });
    var statuses = U.uniq(rows.map(function (r) { return r["Issue Status"] || "Not set"; }));
    var sb = chartBox(panelIn(g2, "Issues by status", ""));
    U.chart(sb, { type: "bar",
      data: { labels: statuses, datasets: [U.barDs("Issues", statuses.map(function (s) { return rows.filter(function (r) { return (r["Issue Status"] || "Not set") === s; }).length; }),
        statuses.map(function (s) { var c = U.statusClass(s); return c === "bad" ? C.red : c === "warn" ? C.yellow : c === "done" ? C.slate : C.blue; }), { maxBarThickness: 56 })] },
      options: { plugins: { legend: { display: false }, datalabels: { display: true, anchor: "end", align: "end", color: C.black, font: { weight: "700" } } },
        layout: { padding: { top: 20 } }, scales: { x: U.catAxis(), y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: "rgba(200,201,199,.5)" } } } } });

    var p = panelIn(v, "NSR projects issue register", "Click a row for the full issue record");
    tableIn(p, { rows: rows, exportName: "Issue_Register", maxHeight: 640,
      onRow: function (r) { U.recordModal((r["ILR ID No."] || "Issue") + " — " + (r["Project Name"] || ""), r); },
      columns: [
        { key: "Poject Code", label: "Project Code" }, { key: "Project Name", label: "Project Name" },
        { key: "ILR ID No.", label: "ILR ID No.", nowrap: true }, { key: "Issue Identification (Date)", label: "Identified", type: "date" },
        { key: "Issue (Description)", label: "Issue (Description)", wrap: true }, { key: "Resolution Action Plan", label: "Resolution Action Plan", wrap: true },
        { key: "Issue Rate", label: "Issue Rate", type: "badge" }, { key: "Issue Status", label: "Issue Status", type: "badge" }] });
  };

  /* ======================================================================
     Abbreviations
     ====================================================================== */
  P.abbreviations = function (ctx) {
    var D = ctx.D, g = grid(ctx.view, "g-2");
    [["ABBREVIATIONS", "Project abbreviations"], ["ABBREVIATIONS_2", "Report abbreviations"]].forEach(function (t) {
      tableIn(panelIn(g, t[1], D.t(t[0]).length + " terms"), { rows: D.t(t[0]), exportName: t[0], autoHeight: true, columns: [
        { key: "ABBREVIATIONS", label: "Abbreviation", nowrap: true }, { key: "MEANING", label: "Meaning", wrap: true }] });
    });
  };

  window.SARPages = P;
})();

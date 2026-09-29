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

  var P = {};

  /* ======================================================================
     Filtering & cross-filtering
     ----------------------------------------------------------------------
     Every page keeps its slicer selections in ctx.state.f[key] (arrays;
     empty = All). Slicers, chart clicks and table-row clicks all write to
     the same selections, so every visual on a page filters every other one
     (like Power BI cross-filtering). Click = select only that value
     (click again to clear); Ctrl/Shift+click = add/remove from selection.
     ====================================================================== */
  function sel(ctx, key) { var f = ctx.state.f || (ctx.state.f = {}); return f[key] || (f[key] = []); }
  function pick(ctx, key, value, ev) {
    if (value == null || value === "") return;
    var s = sel(ctx, key), at = s.indexOf(value);
    var multi = ev && (ev.ctrlKey || ev.metaKey || ev.shiftKey);
    if (multi) { if (at >= 0) s.splice(at, 1); else s.push(value); }
    else if (at >= 0 && s.length === 1) s.length = 0;
    else { s.length = 0; s.push(value); }
    ctx.rerender();
  }

  /**
   * Slicer bar. defs = [{ key, label, options, display?, get?(row) }].
   * When `rows` is given the slicers cascade: each list only offers values
   * present in rows that pass the *other* slicers, with a row count.
   */
  function filterBar(ctx, defs, rows) {
    var st = ctx.state.f || (ctx.state.f = {});
    var bar = add(ctx.view, '<div class="filters collapsible' + (ctx.state.fOpen ? " open" : "") + '"></div>');
    // Phones: the slicers fold away behind one button; active filters stay visible as chips.
    var nActive = defs.reduce(function (n, d) { return n + ((st[d.key] || []).length ? 1 : 0); }, 0);
    var tg = el('<button type="button" class="filters-toggle">⚲ Filters' + (nActive ? " <b>" + nActive + "</b>" : "") + (ctx.state.fOpen ? " ▴" : " ▾") + "</button>");
    tg.addEventListener("click", function () { ctx.state.fOpen = !ctx.state.fOpen; bar.classList.toggle("open", ctx.state.fOpen); tg.innerHTML = tg.innerHTML.replace(/[▴▾]$/, ctx.state.fOpen ? "▴" : "▾"); });
    bar.appendChild(tg);
    defs.forEach(function (d) {
      st[d.key] = st[d.key] || [];
      var opts = d.options, counts = null;
      if (rows && d.get) {
        counts = {};
        rows.filter(function (r) { return passes(r, defs, st, d.key); }).forEach(function (r) {
          var v = d.get(r); if (v != null && v !== "") counts[v] = (counts[v] || 0) + 1;
        });
        opts = U.uniq((d.options || []).filter(function (v) { return counts[v] || st[d.key].indexOf(v) >= 0; }));
      }
      bar.appendChild(U.multiSelect({ label: d.label, options: opts, selected: st[d.key], display: d.display, counts: counts, onChange: ctx.rerender }));
    });
    var active = [];
    defs.forEach(function (d) { st[d.key].forEach(function (v) { active.push({ d: d, v: v }); }); });
    var rb = el('<button class="link-btn filter-reset" type="button"' + (active.length ? "" : " disabled") + ">↺ Reset filters</button>");
    rb.addEventListener("click", function () { defs.forEach(function (d) { st[d.key].length = 0; }); ctx.rerender(); });
    bar.appendChild(rb);
    var chips = add(bar, '<div class="chips"></div>');
    if (!active.length) chips.innerHTML = '<span class="hint">Tip: click any bar, point or table row to filter the whole page · Ctrl + click to select several</span>';
    active.forEach(function (a) {
      var c = el('<button type="button" class="fchip" title="Remove this filter"><b>' + esc(a.d.label) + ":</b> " + esc(a.d.display ? a.d.display(a.v) : a.v) + " <span>×</span></button>");
      c.addEventListener("click", function () { var s = st[a.d.key]; s.splice(s.indexOf(a.v), 1); ctx.rerender(); });
      chips.appendChild(c);
    });
    return st;
  }
  /** Does row pass every slicer in defs (optionally ignoring one key)? */
  function passes(r, defs, st, except) {
    return defs.every(function (d) { return d.key === except || !d.get || inSel(st[d.key], d.get(r)); });
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

  /* Forecast Plan = the contractor cash-flow forecast. It replaces "Forecast V3" everywhere. */
  var FC_FTY = "Forecast as per Contractor cashflow / updated Progress / Program"; // KPI_Projects_Data, full year
  var ytdCache = { sp: null };
  /**
   * The Excel YTD figures run to a month end (e.g. Aug for a September report). Find that month as the one
   * whose cumulative Spend Plan best matches the KPI sheet's "YTD Spend Plan", then sum the monthly Forecast
   * Plan up to it per project. Cached per dataset.
   */
  function ytdForecast(D) {
    var sp = D.t("Spending_Plan");
    if (ytdCache.sp === sp) return ytdCache;
    var target = {};
    D.t("KPI_Projects_Data").forEach(function (r) { var v = N(G(r, "YTD Spend Plan as per Budgeting (M)")); if (r.Code != null && v != null) target[String(r.Code)] = v; });
    var months = U.uniq(sp.map(function (r) { return r.Month; })).sort(), best = null, bestErr = Infinity;
    months.forEach(function (m) {
      var cum = {}, err = 0;
      sp.forEach(function (r) { if (r.Month <= m) cum[r.ID] = (cum[r.ID] || 0) + (N(G(r, SP.plan)) || 0); });
      Object.keys(target).forEach(function (c) { err += Math.abs((cum[c] || 0) - target[c]); });
      if (err < bestErr - 0.5) { bestErr = err; best = m; }
    });
    var byCode = {};
    sp.forEach(function (r) { if (best && r.Month <= best) byCode[String(r.ID)] = (byCode[String(r.ID)] || 0) + (N(G(r, SP.inv)) || 0); });
    ytdCache = { sp: sp, month: best, byCode: byCode };
    return ytdCache;
  }
  function ytdFc(D, code) { return ytdForecast(D).byCode[String(code)] || 0; }

  /* One bar per measure ("totals" visual) */
  function totalsChart(box, items, onPick) {
    var cfg = {
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
    };
    return U.chart(box, onPick ? U.clickable(cfg, onPick) : cfg);
  }

  function hbar(box, labels, datasets, onPick, valueAxis, tooltip) {
    var cfg = { type: "bar", data: { labels: labels, datasets: datasets },
      options: { indexAxis: "y", elements: { bar: { borderRadius: { topRight: 4, bottomRight: 4 } } },
        plugins: { tooltip: tooltip || U.moneyTooltip(), legend: { display: datasets.length > 1 } },
        scales: { x: valueAxis || U.moneyAxis(), y: { grid: { display: false }, ticks: { callback: U.shortLabel(34) } } } } };
    return U.chart(box, onPick ? U.clickable(cfg, onPick) : cfg);
  }
  function vbar(box, labels, datasets, onPick, tooltip, yAxis) {
    var cfg = { type: "bar", data: { labels: labels, datasets: datasets },
      options: { plugins: { tooltip: tooltip || U.moneyTooltip(), legend: { display: datasets.length > 1 } }, scales: { x: U.catAxis(), y: yAxis || U.moneyAxis() } } };
    return U.chart(box, onPick ? U.clickable(cfg, onPick) : cfg);
  }

  /* ======================================================================
     Portfolio model — one record per project code, joining the cost
     register, weekly report and issue register.
     ====================================================================== */
  function portfolio(D) {
    var P0 = {}, order = [];
    function rec(code) {
      code = String(code);
      if (!P0[code]) { P0[code] = { code: code }; order.push(code); }
      return P0[code];
    }
    D.t("NSR_Project_Data").forEach(function (r) {
      if (r.ID == null) return;
      var p = rec(r.ID);
      p.nsr = r; p.short = r["Project Name"]; p.phase = r["Project Phase"]; p.fund = r["Fund Type"]; p.prog = r.PROG;
    });
    D.t("Weekly_Report_Updates").forEach(function (r) {
      if (r["Project Code"] == null) return;
      var p = rec(r["Project Code"]);
      p.wk = r; p.long = r["Project Name"]; p.src = r["Source.Name"];
      p.phase = p.phase || r["Phase Classification"] || r["Current Phase"];
      p.fund = p.fund || r["Budget Type"];
      p.contractor = r.Contractor;
      p.perf = r["Performance Status"];
    });
    D.t("Issue_register").forEach(function (r) {
      var c = r["Poject Code"]; if (c == null || !P0[String(c)]) return;
      var p = P0[String(c)];
      p.issues = (p.issues || 0) + 1;
      if (/pending|escalat/i.test(r["Issue Status"] || "")) p.open = (p.open || 0) + 1;
    });
    return order.map(function (c) {
      var p = P0[c];
      p.name = p.long || p.short || c;
      p.label = c + " — " + (p.short && p.long && p.short !== p.long ? p.short : p.name);
      p.perf = p.perf || "Not in weekly report";
      p.phase = p.phase || "Not set";
      p.fund = p.fund || "Not set";
      p.cv = p.nsr ? N(p.nsr["Contract Value"]) : p.wk ? N(p.wk["Contract Value"]) : null;
      return p;
    });
  }
  function projectOf(D, code) { return portfolio(D).filter(function (p) { return p.code === String(code); })[0]; }

  /** Quick view of one project with links to every page that details it. */
  function quickView(D, code) {
    var p = projectOf(D, code);
    if (!p) { U.toast("Project " + code + " not found in the data."); return; }
    var n = p.nsr || {}, w = p.wk || {};
    var h = '<div class="grid g-4 qv">' +
      U.info("Project code", esc(p.code)) + U.info("Phase", U.badge(p.phase)) + U.info("Fund type", esc(p.fund)) + U.info("Status", U.badge(p.perf)) +
      U.info("Contractor", esc(p.contractor || "")) + U.info("Start / BL start", fmt.date(n["Start Date"] || w["Start Date Baseline"])) +
      U.info("End / BL end", fmt.date(n["End Date"] || w["End Date Baseline"])) + U.info("Forecast finish", fmt.date(w["End Date (Forecast/Actual)"])) + "</div>";
    h += '<div class="grid g-4 qv">' +
      U.info("Full cost", fmt.money(n["Full Cost"])) + U.info("Contract value", fmt.money(p.cv)) +
      U.info("Total WC", fmt.money(n["Total WC"])) + U.info("Paid (ERP)", fmt.money(n[PAID])) +
      U.info("Remaining WC", fmt.money(n["Remaining WC"])) + U.info("Cum plan / actual", w["Planned (%) - Cumulative"] != null ? fmt.pct(w["Planned (%) - Cumulative"]) + " / " + fmt.pct(w["Actual (%) - Cumulative"]) : "") +
      U.info("SPI", w.SPI != null ? N(w.SPI).toFixed(2) : "") + U.info("Issues (open / total)", (p.open || 0) + " / " + (p.issues || 0)) + "</div>";
    if (n["Remarks/Concern"]) h += '<div class="note-box" style="margin-top:12px"><b>Remarks / concern:</b> ' + esc(n["Remarks/Concern"]) + "</div>";
    if (w["Reason for Delays"]) h += '<div class="note-box warn" style="margin-top:12px"><b>Reason for delays:</b> ' + esc(w["Reason for Delays"]) + "</div>";
    h += '<div class="qv-links">';
    if (p.src) h += '<a class="icon-btn" data-go="project">Project progress →</a><a class="icon-btn ghost" data-go="timeline">Timeline →</a><a class="icon-btn ghost" data-go="progress-scurve">Progress S-curve →</a>';
    if (p.nsr) h += '<a class="icon-btn ghost" data-go="cost-analysis">Cost analysis →</a>';
    if (p.issues) h += '<a class="icon-btn ghost" data-go="issues">Issues (' + p.issues + ") →</a>";
    h += "</div>";
    var body = U.modal(p.label, h, true);
    body.querySelectorAll("[data-go]").forEach(function (a) {
      a.addEventListener("click", function () {
        var to = a.getAttribute("data-go"); body.close();
        if (to === "cost-analysis") window.SARApp.go(to, { f: { proj: [p.short] } });
        else if (to === "issues") window.SARApp.go(to, { f: { code: [p.code] } });
        else window.SARApp.go(to, { src: p.src });
      });
    });
  }

  /** Modal with a sortable table — used for tile drill-downs. */
  function tableModal(title, rows, columns, opts) {
    var body = U.modal(title, opts && opts.intro ? '<div class="muted" style="margin:6px 0 10px">' + opts.intro + "</div>" : "", true);
    U.table(body, Object.assign({ rows: rows, columns: columns, exportName: title.replace(/\W+/g, "_") }, opts || {}));
    return body;
  }
  function clickTiles(host, handlers) {
    host.querySelectorAll(".tile").forEach(function (t, i) {
      if (!handlers[i]) return;
      t.classList.add("clickable"); t.setAttribute("tabindex", "0"); t.title = "Click for details";
      t.addEventListener("click", handlers[i]);
      t.addEventListener("keydown", function (e) { if (e.key === "Enter") handlers[i](); });
    });
  }
  var COST_COLS = [
    { key: "ID", label: "ID" }, { key: "Project Name", label: "Project" }, { key: "Project Phase", label: "Phase", type: "badge" },
    { key: "Full Cost", label: "Full Cost", type: "money", total: "sum" }, { key: "Contract Value", label: "Contract Value", type: "money", total: "sum" },
    { key: "Total WC", label: "Total WC", type: "money", total: "sum" }, { key: PAID, label: "Paid", type: "money", total: "sum" },
    { key: "Remaining WC", label: "Remaining WC", type: "money", total: "sum" },
    { get: function (r) { var c = N(r["Contract Value"]); return c ? (N(r[PAID]) || 0) / c : null; }, label: "Paid % of CV", type: "meter" }];
  function costModal(D, title, rows, sortKey) {
    tableModal(title + " — by project", rows, COST_COLS, { totals: true, sort: { key: sortKey, dir: -1 }, autoHeight: true,
      onRow: function (r) { quickView(D, r.ID); }, rowTitle: "Open project" });
  }

  /* ======================================================================
     Executive Overview — every tile, bar, point and row drills down
     ====================================================================== */
  P.overview = function (ctx) {
    var D = ctx.D, v = ctx.view, all = portfolio(D);
    var defs = [
      { key: "proj", label: "Project", options: all.map(function (p) { return p.code; }), display: function (c) { var p = all.filter(function (x) { return x.code === c; })[0]; return p ? p.label : c; }, get: function (p) { return p.code; } },
      { key: "phase", label: "Project Phase", options: U.uniq(all.map(function (p) { return p.phase; })).sort(), get: function (p) { return p.phase; } },
      { key: "fund", label: "Fund Type", options: U.uniq(all.map(function (p) { return p.fund; })).sort(), get: function (p) { return p.fund; } },
      { key: "perf", label: "Performance", options: U.uniq(all.map(function (p) { return p.perf; })).sort(), get: function (p) { return p.perf; } },
      { key: "contr", label: "Contractor", options: U.uniq(all.map(function (p) { return p.contractor; })).sort(), get: function (p) { return p.contractor; } }];
    var st = filterBar(ctx, defs, all);
    var ps = all.filter(function (p) { return passes(p, defs, st); });
    var codes = ps.map(function (p) { return p.code; });
    var filtered = defs.some(function (d) { return st[d.key].length; });
    // With no slicer active every row counts (including issues of projects outside the cost register).
    function inCodes(c) { return !filtered || codes.indexOf(String(c)) >= 0; }
    var nsr = D.t("NSR_Project_Data").filter(function (r) { return inCodes(r.ID); });
    var wk = D.t("Weekly_Report_Updates").filter(function (r) { return inCodes(r["Project Code"]); });
    var iss = D.t("Issue_register").filter(function (r) { return inCodes(r["Poject Code"]); });
    var sp = D.t("Spending_Plan").filter(function (r) { return inCodes(r.ID); });
    var kpi = D.t("KPI_Summary");

    /* --- cost tiles --- */
    var g1 = grid(v, "g-5");
    g1.innerHTML = mTile("Full Cost", U.sum(nsr, "Full Cost")) + mTile("Contract Value", U.sum(nsr, "Contract Value"), "black") +
      mTile("Total Work Confirmed", U.sum(nsr, "Total WC"), "mid") + mTile("Paid (ERP gross)", U.sum(nsr, PAID), "slate") +
      mTile("Remaining WC", U.sum(nsr, "Remaining WC"), "yellow");
    clickTiles(g1, [
      function () { costModal(D, "Full cost", nsr, "Full Cost"); }, function () { costModal(D, "Contract value", nsr, "Contract Value"); },
      function () { costModal(D, "Total work confirmed", nsr, "Total WC"); }, function () { costModal(D, "Paid", nsr, PAID); },
      function () { costModal(D, "Remaining WC", nsr, "Remaining WC"); }]);

    /* --- progress / issue / KPI tiles --- */
    var ev = U.sum(wk, "Cumulative EV (SAR)"), pv = U.sum(wk, "Cumulative PV (SAR)");
    var delayed = wk.filter(function (r) { return /delay/i.test(r["Performance Status"] || ""); });
    var open = iss.filter(function (r) { return /pending|escalat/i.test(r["Issue Status"] || ""); });
    var crit = open.filter(function (r) { return /critical/i.test(r["Issue Rate"] || ""); }).length;
    var kres = U.sum(kpi, "KPI Result"), kw = U.sum(kpi, "KPI Weight (%)");
    var g2 = grid(v, "g-5");
    g2.innerHTML =
      U.tile({ value: wk.length, label: "Projects reported", note: "Weekly report " + fmt.date(D.reportDate) }) +
      U.tile({ value: pv ? (ev / pv).toFixed(2) : "—", label: "Portfolio SPI (cost)", color: pv && ev / pv < 0.9 ? "red" : pv && ev / pv < 1 ? "yellow" : "", note: "Σ EV ÷ Σ PV" }) +
      U.tile({ value: delayed.length, label: "Delayed projects", color: delayed.length ? "red" : "", note: "Performance status = Delayed" }) +
      U.tile({ value: open.length, label: "Open issues", color: open.length ? "yellow" : "", note: crit + " critical · pending or escalated" }) +
      U.tile({ value: fmt.pct(kres), label: "KPI result", color: "black", note: "of " + fmt.pct(kw, 0) + " total weight" });
    var progCols = [
      { key: "Project Code", label: "Code" }, { key: "Project Name", label: "Project", wrap: true },
      { key: "Planned (%) - Cumulative", label: "Plan % cum", type: "pct" }, { key: "Actual (%) - Cumulative", label: "Actual % cum", type: "pct" },
      { get: spiOf, label: "SPI", type: "dec", cls: spiCls }, { key: "End Date (Forecast/Actual)", label: "Forecast finish", type: "date" },
      { key: "Performance Status", label: "Status", type: "badge" }, { key: "Reason for Delays", label: "Reason for delays", wrap: true }];
    var issueCols = [
      { key: "Poject Code", label: "Code" }, { key: "Project Name", label: "Project" }, { key: "ILR ID No.", label: "ILR ID", nowrap: true },
      { key: "Issue (Description)", label: "Issue", wrap: true }, { key: "Resolution Action Plan", label: "Action plan", wrap: true },
      { key: "Issue Rate", label: "Rate", type: "badge" }, { key: "Issue Status", label: "Status", type: "badge" }];
    function onWk(r) { quickView(D, r["Project Code"]); }
    clickTiles(g2, [
      function () { tableModal("Projects in the weekly report", wk, progCols, { onRow: onWk, rowTitle: "Open project", autoHeight: true }); },
      function () { tableModal("SPI by project", wk, progCols, { onRow: onWk, rowTitle: "Open project", sort: { key: "SPI", dir: 1 }, autoHeight: true, intro: "SPI (cost) = cumulative EV ÷ cumulative PV. Lowest first." }); },
      function () { tableModal("Delayed projects", delayed, progCols, { onRow: onWk, rowTitle: "Open project", autoHeight: true }); },
      function () { tableModal("Open issues", open, issueCols, { onRow: function (r) { U.recordModal(r["ILR ID No."] || "Issue", r); }, sort: { key: "Issue Rate", dir: 1 } }); },
      function () { window.SARApp.go("kpi-summary", {}); }]);

    /* --- charts row 1 --- */
    var g3 = grid(v, "g-2");
    var byCV = nsr.slice().sort(function (a, b) { return sortNum(b["Contract Value"], a["Contract Value"]); });
    var b1 = chartBox(panelIn(g3, "Contract value vs work confirmed vs paid", "Click a bar for the project details"));
    b1.style.height = Math.max(320, byCV.length * 30 + 70) + "px";
    hbar(b1, byCV.map(function (r) { return r.ID + " · " + r["Project Name"]; }), [
      U.barDs("Contract Value", byCV.map(function (r) { return r["Contract Value"]; }), S.plan),
      U.barDs("Total WC", byCV.map(function (r) { return r["Total WC"]; }), S.forecast),
      U.barDs("Paid", byCV.map(function (r) { return r[PAID]; }), S.actual)], function (i) { quickView(D, byCV[i].ID); });

    var wr = wk.slice().sort(function (a, b) { return sortNum(b["Planned (%) - Cumulative"], a["Planned (%) - Cumulative"]); });
    var b2 = chartBox(panelIn(g3, "Cumulative progress by project", "Planned vs actual · click a bar for the project details"));
    b2.style.height = b1.style.height;
    hbar(b2, wr.map(function (r) { return r["Project Code"] + " · " + r["Project Name"]; }), [
      U.barDs("Planned (cum)", wr.map(function (r) { return r["Planned (%) - Cumulative"]; }), S.plan),
      U.barDs("Actual (cum)", wr.map(function (r) { return r["Actual (%) - Cumulative"]; }), S.actual)],
      function (i) { quickView(D, wr[i]["Project Code"]); }, U.pctAxis(1), U.pctTooltip());

    /* --- charts row 2 --- */
    var g4 = grid(v, "g-3");
    var mm = monthly(sp);
    var pa = panelIn(g4, "Cumulative spend 2026", "Click a month for its breakdown");
    var lc = { type: "line",
      data: { labels: mm.map(function (o) { return fmt.month(o.month); }), datasets: [
        U.lineDs("Spend Plan", mm.map(function (o) { return o.planC; }), S.plan, { pointRadius: 3 }),
        U.lineDs("Forecast Plan", mm.map(function (o) { return o.invC; }), S.invoice, { borderDash: [6, 4], pointRadius: 3 }),
        U.lineDs("Actual Spend", mm.map(function (o) { return o.actCv; }), S.actual, { borderWidth: 3, pointRadius: 3 })] },
      options: { plugins: { tooltip: U.moneyTooltip() }, scales: { x: U.catAxis(), y: U.moneyAxis() }, interaction: { mode: "index", intersect: false } } };
    U.chart(chartBox(pa), U.clickable(lc, function (i) { monthModal(D, sp, mm[i].month); }));

    var phases = U.uniq(ps.map(function (p) { return p.phase; }));
    var pb = panelIn(g4, "Projects by phase", "Click to filter the page");
    vbar(chartBox(pb), phases, [U.barDs("Projects", phases.map(function (ph) { return ps.filter(function (p) { return p.phase === ph; }).length; }),
      U.hl(S.plan, phases, sel(ctx, "phase")), { maxBarThickness: 48 })],
      function (i, e) { pick(ctx, "phase", phases[i], e); }, null, { beginAtZero: true, ticks: { precision: 0 }, grid: { color: "rgba(200,201,199,.5)" } });

    var rates = ["Critical", "High", "Medium", "Low"], stats = U.uniq(iss.map(function (r) { return r["Issue Status"] || "Not set"; }));
    var ib = panelIn(g4, "Issues by status and rate", "Click a segment for the issue list");
    var ic = { type: "bar", data: { labels: stats, datasets: rates.map(function (rt) {
      return U.barDs(rt, stats.map(function (s) { return iss.filter(function (r) { return (r["Issue Status"] || "Not set") === s && r["Issue Rate"] === rt; }).length; }),
        { Critical: C.red, High: C.yellow, Medium: C.mid, Low: C.slate }[rt], { borderRadius: 0, borderColor: C.white, borderWidth: { top: 2 } }); }) },
      options: { scales: { x: Object.assign(U.catAxis(), { stacked: true }), y: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, grid: { color: "rgba(200,201,199,.5)" } } } } };
    U.chart(chartBox(ib), U.clickable(ic, function (i, e, di) {
      var s = stats[i], rt = rates[di];
      tableModal(s + " · " + rt + " issues", iss.filter(function (r) { return (r["Issue Status"] || "Not set") === s && r["Issue Rate"] === rt; }), issueCols,
        { onRow: function (r) { U.recordModal(r["ILR ID No."] || "Issue", r); } });
    }));

    /* --- portfolio table --- */
    var tp = panelIn(v, "Project portfolio", ps.length + " projects · click a row for details");
    tableIn(tp, { rows: ps, exportName: "Portfolio", totals: true, maxHeight: 560, onRow: function (p) { quickView(D, p.code); }, rowTitle: "Open project",
      columns: [
        { key: "code", label: "Code" }, { key: "name", label: "Project", wrap: true }, { key: "phase", label: "Phase", type: "badge" },
        { key: "fund", label: "Fund" }, { key: "cv", label: "Contract Value", type: "money", total: "sum" },
        { get: function (p) { return p.nsr ? p.nsr[PAID] : null; }, label: "Paid", type: "money", total: "sum" },
        { get: function (p) { return p.wk ? p.wk["Planned (%) - Cumulative"] : null; }, label: "Plan % cum", type: "pct" },
        { get: function (p) { return p.wk ? p.wk["Actual (%) - Cumulative"] : null; }, label: "Actual % cum", type: "pct" },
        { get: function (p) { return p.wk ? spiOf(p.wk) : null; }, label: "SPI", type: "dec", cls: spiCls },
        { key: "perf", label: "Status", type: "badge" }, { key: "open", label: "Open issues", type: "int", total: "sum" }] });
  };

  /** Spend for one month by project (drill-down from a cumulative/monthly chart). */
  function monthModal(D, spRows, month) {
    var rows = spRows.filter(function (r) { return r.Month === month; }).map(function (r) {
      return { ID: r.ID, name: r["Project Name"], plan: G(r, SP.plan), act: G(r, SP.act), inv: G(r, SP.inv), invAct: r["Invoice Related actvities"],
        planC: G(r, SP.planC), actC: G(r, SP.actC) };
    }).filter(function (o) { return o.plan || o.act || o.inv; });
    tableModal("Spend in " + fmt.month(month), rows, [
      { key: "ID", label: "ID" }, { key: "name", label: "Project" },
      { key: "plan", label: "Spend Plan", type: "money", total: "sum" }, { key: "inv", label: "Forecast Plan", type: "money", total: "sum" },
      { key: "act", label: "Actual Spend", type: "money", total: "sum" },
      { key: "planC", label: "Spend Plan (cum)", type: "money", total: "sum" }, { key: "actC", label: "Actual (cum)", type: "money", total: "sum" },
      { key: "invAct", label: "Invoice related activities", wrap: true }],
      { totals: true, sort: { key: "plan", dir: -1 }, autoHeight: true, onRow: function (r) { quickView(D, r.ID); }, rowTitle: "Open project" });
  }

  /* ======================================================================
     KPI Summary
     ====================================================================== */
  function isManaged(r) { var n = String(r["Objective/ KPIs"] || "").toLowerCase(); return NSR_MANAGED.some(function (k) { return n.indexOf(k) >= 0; }); }
  function kpiModal(D, r) {
    var h = '<div class="grid g-4 qv">' + U.info("KPI SN", esc(r["KPI SN"])) + U.info("KPI group", esc(r["KPI Filter"])) +
      U.info("Weight", fmt.pct(r["KPI Weight (%)"])) + U.info("Managed by", isManaged(r) ? "NSR" : "Other departments") +
      U.info("% achieved", fmt.pct(r["% Achieved"])) + U.info("KPI result", fmt.pct(r["KPI Result"], 2)) +
      U.info("Target (plan)", r["NSR Spend Plan 2026 as per Budgeting"] > 10 ? fmt.money(r["NSR Spend Plan 2026 as per Budgeting"]) : fmt.pct(r["NSR Spend Plan 2026 as per Budgeting"])) +
      U.info("YTD actual", r["YTD Actual"] > 10 ? fmt.money(r["YTD Actual"]) : fmt.pct(r["YTD Actual"])) + "</div>";
    if (r.Remarks) h += '<div class="note-box" style="margin-top:12px">' + esc(r.Remarks) + "</div>";
    var body = U.modal(r["Objective/ KPIs"], h, true);
    var projs = D.t("KPI_Projects_Data").filter(function (p) { return N(p["KPI Code"]) === N(r["KPI Code"]) && p.Code !== "-"; });
    var del = /delivery against approved/i.test(r["Objective/ KPIs"] || "") ? D.t("Delivery_KPI") : [];
    if (projs.length) {
      add(body, '<h4 class="mh">Projects under this KPI</h4>');
      U.table(add(body, "<div></div>"), { rows: projs, exportName: "KPI_projects", totals: true, autoHeight: true, columns: [
        { key: "Code", label: "Code" }, { key: "Project Name", label: "Project" },
        { get: function (p) { return G(p, "Spend Plan as per Budgeting (M) FTY 2026"); }, label: "Spend Plan 2026", type: "money", total: "sum" },
        { get: function (p) { return G(p, "YTD Spend Plan as per Budgeting (M)"); }, label: "YTD Plan", type: "money", total: "sum" },
        { get: function (p) { return G(p, "YTD Actual (M)"); }, label: "YTD Actual", type: "money", total: "sum" },
        { get: function (p) { return (N(G(p, "YTD Actual (M)")) || 0) - (N(G(p, "YTD Spend Plan as per Budgeting (M)")) || 0); },
          label: "YTD Var. (Actual − Plan)", type: "money", signed: true, total: "sum" }] });
    }
    if (del.length) {
      add(body, '<h4 class="mh">Delivery projects</h4>');
      U.table(add(body, "<div></div>"), { rows: del, search: false, autoHeight: true, exportName: false, columns: [
        { key: "Project Code", label: "Code" }, { key: "NSR Plan", label: "Project" }, { key: "Budget (SAR)", label: "Budget", type: "money" },
        { key: "Target Completion Date", label: "Target completion", type: "date" }] });
    }
  }

  P["kpi-summary"] = function (ctx) {
    var D = ctx.D, v = ctx.view;
    var all = D.t("KPI_Summary").slice().sort(function (a, b) { return sortNum(a["KPI SN"], b["KPI SN"]); });
    var defs = [
      { key: "grp", label: "KPI Group", options: U.uniq(all.map(function (r) { return r["KPI Filter"]; })), get: function (r) { return r["KPI Filter"]; } },
      { key: "own", label: "Managed by", options: ["NSR", "Other departments"], get: function (r) { return isManaged(r) ? "NSR" : "Other departments"; } },
      { key: "kpi", label: "KPI", options: all.map(function (r) { return r["Objective/ KPIs"]; }), get: function (r) { return r["Objective/ KPIs"]; } }];
    var st = filterBar(ctx, defs, all);
    var rows = all.filter(function (r) { return passes(r, defs, st); });
    var kres = U.sum(rows, "KPI Result"), kw = U.sum(rows, "KPI Weight (%)");
    var full = rows.filter(function (r) { return N(r["% Achieved"]) >= 1; });
    var below = rows.filter(function (r) { return N(r["% Achieved"]) < 1; });
    var g = grid(v, "g-4");
    g.innerHTML = U.tile({ value: rows.length, label: "KPIs tracked", note: U.uniq(rows.map(function (r) { return r["KPI Filter"]; })).length + " KPI groups" }) +
      U.tile({ value: fmt.pct(kw, 0), label: "Total weight", color: "black" }) +
      U.tile({ value: fmt.pct(kres), label: "Weighted KPI result", color: "mid", note: kw ? fmt.pct(kres / kw) + " of attainable weight" : "" }) +
      U.tile({ value: full.length, label: "KPIs at 100%+", color: "slate", note: below.length + " below target — click" });
    var kcols = [{ key: "KPI SN", label: "SN", type: "int" }, { key: "Objective/ KPIs", label: "KPI", wrap: true }, { key: "KPI Weight (%)", label: "Weight", type: "pct" },
      { key: "% Achieved", label: "% Achieved", type: "meter" }, { key: "KPI Result", label: "Result", type: "pct" }];
    clickTiles(g, [null, null,
      function () { tableModal("KPI result build-up", rows, kcols, { totals: true, sort: { key: "KPI Result", dir: -1 }, onRow: function (r) { kpiModal(D, r); }, autoHeight: true }); },
      function () { tableModal("KPIs below 100%", below, kcols, { sort: { key: "% Achieved", dir: 1 }, onRow: function (r) { kpiModal(D, r); }, autoHeight: true }); }]);

    var tp = panelIn(v, "KPI scorecard", "Click a row for KPI details · Shift+click headers or use ⇅ Sort for multi-level sorting");
    tp.style.marginBottom = "16px";
    tableIn(tp, { rows: rows, exportName: "KPI_Summary", maxHeight: 640, totals: true, onRow: function (r) { kpiModal(D, r); }, rowTitle: "Open KPI details",
      columns: [
        { key: "KPI SN", label: "KPI SN", type: "int" },
        { key: "KPI Filter", label: "KPI Filter", nowrap: true },
        { key: "Objective/ KPIs", label: "Objective / KPIs", wrap: true },
        { key: "KPI Weight (%)", label: "KPI Weight (%)", type: "pct", total: "sum" },
        { key: "% Achieved", label: "% Achieved", type: "meter" },
        { key: "KPI Result", label: "KPI Result", type: "pct", total: function (rs) { return fmt.pct(U.sum(rs, "KPI Result")); } }] });

    var right = grid(v, "g-2");
    function kpiChart(title, list) {
      var p = panelIn(right, title, "% achieved · click a bar for details");
      var box = chartBox(p); box.style.height = Math.max(200, list.length * 34 + 60) + "px";
      if (!list.length) { box.innerHTML = '<div class="empty">No KPIs match the filters.</div>'; return; }
      var cfg = { type: "bar",
        data: { labels: list.map(function (r) { return U.wrapLabel(r["Objective/ KPIs"], 38); }),
          datasets: [U.barDs("% Achieved", list.map(function (r) { return r["% Achieved"]; }), list.map(function (r) {
            var a = N(r["% Achieved"]); return a >= 1 ? S.plan : a >= 0.9 ? S.actual : S.alert; }), { borderRadius: { topRight: 4, bottomRight: 4 }, maxBarThickness: 22 })] },
        options: { indexAxis: "y", plugins: { legend: { display: false }, tooltip: U.pctTooltip(),
          datalabels: { display: true, anchor: "end", align: "end", color: C.black, font: { weight: "700" }, formatter: function (x) { return fmt.pct(x); } } },
          layout: { padding: { right: 50 } },
          scales: { x: U.pctAxis(), y: { grid: { display: false }, ticks: { font: { size: 11 } } } } } };
      U.chart(box, U.clickable(cfg, function (i) { kpiModal(D, list[i]); }));
      add(p, '<div class="g-legend"><span><i style="background:' + S.plan + '"></i>≥ 100% achieved</span><span><i style="background:' + S.actual +
        '"></i>90–99%</span><span><i style="background:' + S.alert + '"></i>&lt; 90%</span></div>');
    }
    kpiChart("KPIs managed by NSR", rows.filter(isManaged));
    kpiChart("KPIs managed by other departments", rows.filter(function (r) { return !isManaged(r); }));

    var wk = {}; D.t("Weekly_Report_Updates").forEach(function (r) { wk[String(r["Project Code"])] = r; });
    var del = D.t("Delivery_KPI").map(function (r) {
      var w = wk[String(r["Project Code"])] || {};
      return Object.assign({}, r, { _bl: w["End Date Baseline"], _fc: w["End Date (Forecast/Actual)"], _pl: w["Planned (%) - Cumulative"], _ac: w["Actual (%) - Cumulative"] });
    });
    var dp = panelIn(v, "Delivery KPI details", "% of delivery against approved business plan · click a row for the project");
    tableIn(dp, { rows: del, exportName: "Delivery_KPI", autoHeight: true, search: false, onRow: function (r) { quickView(D, r["Project Code"]); }, rowTitle: "Open project",
      columns: [
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
    var M = function (k) { return function (r) { return G(r, k); }; };
    var defs = [
      { key: "kf", label: "KPI", options: U.uniq(projAll.map(function (r) { return r["Objective/ KPIs"]; })), get: function (r) { return r["Objective/ KPIs"]; } },
      { key: "proj", label: "Project Name", options: U.uniq(projAll.map(function (r) { return r["Project Name"]; })).sort(), get: function (r) { return r["Project Name"]; } }];
    var st = filterBar(ctx, defs, projAll);
    var proj = projAll.filter(function (r) { return passes(r, defs, st); });
    var projX = projAll.filter(function (r) { return passes(r, defs, st, "proj"); }); // for cross-highlight
    var yf = ytdForecast(D), ytdLbl = yf.month ? " (to " + fmt.month(yf.month) + ")" : "";
    var fcF = function (r) { return N(G(r, FC_FTY)) || 0; };                 // Forecast Plan, full year
    var fcY = function (r) { return ytdFc(D, r.Code); };                     // Forecast Plan, year to date
    var byKpi = {};                                                          // Forecast Plan per KPI (summary rows)
    projAll.forEach(function (r) { var k = N(r["KPI Code"]), o = byKpi[k] || (byKpi[k] = { fty: 0, ytd: 0 }); o.fty += fcF(r); o.ytd += fcY(r); });
    var kf = function (r) { return byKpi[N(r["KPI Code"])] || { fty: 0, ytd: 0 }; };

    var sp = panelIn(v, "KPI financial summary", "FTY 2026 and year-to-date · click a KPI to filter");
    sp.style.marginBottom = "16px";
    tableIn(sp, { rows: sum, exportName: "KPI_Cost_Summary", autoHeight: true, search: false,
      onRow: function (r, e) { pick(ctx, "kf", r["Objective/ KPIs"], e); }, rowTitle: "Filter by this KPI",
      rowClass: function (r) { return st.kf.indexOf(r["Objective/ KPIs"]) >= 0 ? "selected" : ""; },
      columns: [
        { key: "KPI Filter", label: "KPI Filter", nowrap: true }, { key: "Objective/ KPIs", label: "Objective / KPIs", wrap: true },
        { key: "KPI Weight (%)", label: "KPI Weight (%)", type: "pct" },
        { key: "NSR Spend Plan 2026 as per Budgeting", label: "Spend Plan 2026", type: "money" },
        { get: function (r) { return kf(r).fty; }, label: "Forecast Plan 2026", type: "money" },
        { get: function (r) { return kf(r).fty - (N(r["NSR Spend Plan 2026 as per Budgeting"]) || 0); }, label: "FTY Variance (Forecast − Plan)", type: "money", signed: true },
        { key: "YTD Spend Plan 2026 as per Budgeting", label: "YTD Spend Plan", type: "money" },
        { get: function (r) { return kf(r).ytd; }, label: "YTD Forecast Plan", type: "money" },
        { key: "YTD Actual", label: "YTD Actual", type: "money" },
        { key: "YTD Variance", label: "YTD Variance", type: "money", signed: true },
        { key: "% Achieved", label: "% Achieved", type: "meter" }] });

    var g0 = grid(v, "g-1-2");
    var gl = add(g0, "<div></div>");
    totalsChart(chartBox(panelIn(gl, "For the year", "FTY 2026")), [
      { label: "Spend Plan FTY 2026", value: U.sum(proj, M("Spend Plan as per Budgeting (M) FTY 2026")), color: S.plan },
      { label: "Forecast Plan FTY 2026", value: U.sum(proj, fcF), color: S.invoice }]);
    gl.lastChild.style.marginBottom = "16px";
    totalsChart(chartBox(panelIn(gl, "Year to date", "YTD 2026" + ytdLbl)), [
      { label: "YTD Spend Plan", value: U.sum(proj, M("YTD Spend Plan as per Budgeting (M)")), color: S.plan },
      { label: "YTD Forecast Plan", value: U.sum(proj, fcY), color: S.invoice },
      { label: "YTD Actual", value: U.sum(proj, M("YTD Actual (M)")), color: S.actual }]);
    var byP = projX.slice().sort(function (a, b) { return sortNum(M("Spend Plan as per Budgeting (M) FTY 2026")(b), M("Spend Plan as per Budgeting (M) FTY 2026")(a)); });
    var names = byP.map(function (r) { return r["Project Name"]; });
    var pb = chartBox(panelIn(g0, "Spend by project", "Click a bar to filter · Ctrl+click for several"));
    pb.style.height = Math.max(560, byP.length * 30 + 70) + "px";
    hbar(pb, names, [
      U.barDs("Spend Plan 2026", byP.map(M("Spend Plan as per Budgeting (M) FTY 2026")), U.hl(S.plan, names, st.proj)),
      U.barDs("Forecast Plan 2026", byP.map(fcF), U.hl(S.invoice, names, st.proj)),
      U.barDs("YTD Actual", byP.map(M("YTD Actual (M)")), U.hl(S.actual, names, st.proj))], function (i, e) { pick(ctx, "proj", names[i], e); });

    var pp = panelIn(v, "Project spend detail", proj.length + " projects · click a row to filter");
    tableIn(pp, { rows: proj, exportName: "KPI_Projects_Data", totals: true,
      onRow: function (r, e) { pick(ctx, "proj", r["Project Name"], e); }, rowTitle: "Filter by this project",
      rowClass: function (r) { return st.proj.indexOf(r["Project Name"]) >= 0 ? "selected" : ""; },
      columns: [
        { key: "KPI Filter", label: "KPI Filter", nowrap: true }, { key: "Objective/ KPIs", label: "Objective / KPIs", nowrap: true },
        { key: "Code", label: "Code" }, { key: "Project Name", label: "Project Name", nowrap: true },
        { get: M("Spend Plan as per Budgeting (M) FTY 2026"), label: "Spend Plan 2026", type: "money", total: "sum" },
        { get: fcF, label: "Forecast Plan 2026", type: "money", total: "sum" },
        { get: function (r) { return fcF(r) - (N(G(r, "Spend Plan as per Budgeting (M) FTY 2026")) || 0); }, label: "Variance 2026 (Forecast − Plan)", type: "money", signed: true, total: "sum" },
        { get: M("YTD Spend Plan as per Budgeting (M)"), label: "YTD Spend Plan", type: "money", total: "sum" },
        { get: fcY, label: "YTD Forecast Plan", type: "money", total: "sum" },
        { get: M("YTD Actual (M)"), label: "YTD Actual", type: "money", total: "sum" },
        { get: function (r) { return (N(G(r, "YTD Actual (M)")) || 0) - (N(G(r, "YTD Spend Plan as per Budgeting (M)")) || 0); }, label: "YTD Var. (Actual − Plan)", type: "money", signed: true, total: "sum" },
        { get: function (r) { return (N(G(r, "YTD Actual (M)")) || 0) - fcY(r); }, label: "YTD Var. (Actual − Forecast)", type: "money", signed: true, total: "sum" }] });
  };

  /* ======================================================================
     Cost filters shared by the cost pages. Returns fully filtered rows and
     "cross" rows (all filters except the one a visual itself sets), so a
     chart keeps showing every bar and highlights the selected ones.
     ====================================================================== */
  function costFilters(ctx, withPhase, withMonth) {
    var nsrAll = ctx.D.t("NSR_Project_Data"), spAll = ctx.D.t("Spending_Plan");
    var defs = [
      { key: "proj", label: "Project Name", options: U.uniq(nsrAll.map(function (r) { return r["Project Name"]; })).sort(), get: function (r) { return r["Project Name"]; } },
      { key: "id", label: "Project ID", options: U.uniq(nsrAll.map(function (r) { return r.ID; })).sort(), get: function (r) { return r.ID; } },
      { key: "fund", label: "Fund Type", options: U.uniq(nsrAll.map(function (r) { return r["Fund Type"]; })).sort(), get: function (r) { return r["Fund Type"]; } }];
    if (withPhase) defs.push({ key: "phase", label: "Project Phase", options: U.uniq(nsrAll.map(function (r) { return r["Project Phase"]; })).sort(), get: function (r) { return r["Project Phase"]; } });
    var mdef = { key: "month", label: "Month", options: U.uniq(spAll.map(function (r) { return r.Month; })).sort(), display: fmt.month, get: function (r) { return r.Month; } };
    var st = filterBar(ctx, withMonth ? defs.concat([mdef]) : defs, nsrAll);
    var prj = function (except) { return function (r) { return passes(r, defs, st, except); }; };
    var mon = function (r) { return !withMonth || inSel(st.month, r.Month); };
    return {
      st: st,
      nsr: nsrAll.filter(prj()),
      nsrX: nsrAll.filter(prj("proj")),
      sp: spAll.filter(function (r) { return prj()(r) && mon(r); }),
      spXproj: spAll.filter(function (r) { return prj("proj")(r) && mon(r); }),
      spXmonth: spAll.filter(prj())
    };
  }

  /* ======================================================================
     Cost Dashboard (register)
     ====================================================================== */
  P.cost = function (ctx) {
    var D = ctx.D, f = costFilters(ctx, true), rows = f.nsr, v = ctx.view, st = f.st;
    var g = grid(v, "g-5");
    g.innerHTML = mTile("Full Cost", U.sum(rows, "Full Cost")) + mTile("Contract Value", U.sum(rows, "Contract Value"), "black") +
      mTile("WC Total", U.sum(rows, "Total WC"), "mid") + mTile("Paid", U.sum(rows, PAID), "slate") + mTile("Remaining WC", U.sum(rows, "Remaining WC"), "yellow");
    clickTiles(g, ["Full Cost", "Contract Value", "Total WC", PAID, "Remaining WC"].map(function (k, i) {
      return function () { costModal(D, ["Full cost", "Contract value", "WC total", "Paid", "Remaining WC"][i], rows, k); }; }));

    var gc = grid(v, "g-3");
    [["phase", "Project Phase", "Contract value by phase"], ["fund", "Fund Type", "Contract value by fund type"], ["proj", "Project Name", "Remaining WC by project"]].forEach(function (c) {
      var base = D.t("NSR_Project_Data").filter(function (r) { return passes(r, [
        { key: "proj", get: function (x) { return x["Project Name"]; } }, { key: "id", get: function (x) { return x.ID; } },
        { key: "fund", get: function (x) { return x["Fund Type"]; } }, { key: "phase", get: function (x) { return x["Project Phase"]; } }], st, c[0]); });
      var keys = U.uniq(base.map(function (r) { return r[c[1]]; }));
      var metric = c[0] === "proj" ? "Remaining WC" : "Contract Value";
      var vals = keys.map(function (k) { return U.sum(base.filter(function (r) { return r[c[1]] === k; }), metric); });
      if (c[0] === "proj") { var idx = keys.map(function (k, i) { return i; }).sort(function (a, b) { return vals[b] - vals[a]; }).slice(0, 10); keys = idx.map(function (i) { return keys[i]; }); vals = idx.map(function (i) { return vals[i]; }); }
      var box = chartBox(panelIn(gc, c[2], c[0] === "proj" ? "Top 10 · click to filter" : "Click to filter"), "short");
      hbar(box, keys, [U.barDs(metric, vals, U.hl(c[0] === "proj" ? S.actual : S.plan, keys, st[c[0]]), { maxBarThickness: 18 })],
        function (i, e) { pick(ctx, c[0], keys[i], e); });
      box.parentNode.querySelector(".chart-box").style.height = Math.max(200, keys.length * 26 + 50) + "px";
    });

    var p = panelIn(v, "Project cost register", rows.length + " projects · click a row for full details");
    tableIn(p, { rows: rows, exportName: "NSR_Project_Data", totals: true, maxHeight: 620,
      onRow: function (r) { quickView(D, r.ID); }, rowTitle: "Open project",
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
     Cost Analysis (Power BI "Cost Dashboard graph") — fully cross-filtered
     ====================================================================== */
  P["cost-analysis"] = function (ctx) {
    var D = ctx.D, f = costFilters(ctx, true, true), v = ctx.view, nsr = f.nsr, sp = f.sp, st = f.st;
    var g = grid(v, "g-4");
    g.innerHTML = mTile("Full Cost", U.sum(nsr, "Full Cost")) + mTile("Contract Value", U.sum(nsr, "Contract Value"), "black") +
      mTile("Total WC", U.sum(nsr, "Total WC"), "mid") + mTile("Paid", U.sum(nsr, PAID), "slate");
    clickTiles(g, ["Full Cost", "Contract Value", "Total WC", PAID].map(function (k, i) {
      return function () { costModal(D, ["Full cost", "Contract value", "Total WC", "Paid"][i], nsr, k); }; }));

    // Project visuals show every project allowed by the *other* filters and highlight the selected ones.
    var byCV = f.nsrX.slice().sort(function (a, b) { return sortNum(b["Contract Value"], a["Contract Value"]); });
    var names = byCV.map(function (r) { return r["Project Name"]; });
    var g1 = grid(v, "g-2");
    var h = Math.max(320, names.length * 40 + 70) + "px";
    var b1 = chartBox(panelIn(g1, "Contract value vs WC total vs paid", "Click a project to filter the page · Ctrl+click for several")); b1.style.height = h;
    hbar(b1, names, [
      U.barDs("Contract Value", byCV.map(function (r) { return r["Contract Value"]; }), U.hl(S.plan, names, st.proj)),
      U.barDs("Total WC", byCV.map(function (r) { return r["Total WC"]; }), U.hl(S.forecast, names, st.proj)),
      U.barDs("Paid", byCV.map(function (r) { return r[PAID]; }), U.hl(S.actual, names, st.proj))], function (i, e) { pick(ctx, "proj", names[i], e); });

    var byP = {}; f.spXproj.forEach(function (r) {
      var o = byP[r["Project Name"]] || (byP[r["Project Name"]] = { plan: 0, fc: 0, act: 0, inv: 0 });
      o.plan += N(G(r, SP.plan)) || 0; o.fc += N(G(r, SP.fc)) || 0; o.act += N(G(r, SP.act)) || 0; o.inv += N(G(r, SP.inv)) || 0;
    });
    function pv(k) { return names.map(function (n) { return byP[n] ? byP[n][k] : null; }); }
    var b2 = chartBox(panelIn(g1, "Plan vs forecast vs actual", (st.month.length ? st.month.map(fmt.month).join(", ") : "2026") + " spend by project · click to filter")); b2.style.height = h;
    hbar(b2, names, [U.barDs("Spend Plan", pv("plan"), U.hl(S.plan, names, st.proj)), U.barDs("Forecast Plan", pv("inv"), U.hl(S.invoice, names, st.proj)),
      U.barDs("Actual Spend", pv("act"), U.hl(S.actual, names, st.proj))],
      function (i, e) { pick(ctx, "proj", names[i], e); });

    var ids = nsr.map(function (r) { return String(r.ID); });
    var kp = D.t("KPI_Projects_Data").filter(function (r) { return ids.indexOf(String(r.Code)) >= 0; });
    var g2 = grid(v, "g-2");
    totalsChart(chartBox(panelIn(g2, "Incremental budget vs total forecast", "Sum of the selected months · click a bar for the project split")), [
      { label: "Spend Plan", value: U.sum(sp, function (r) { return G(r, SP.plan); }), color: S.plan },
      { label: "Forecast Plan", value: U.sum(sp, function (r) { return G(r, SP.inv); }), color: S.invoice },
      { label: "Actual Spend", value: U.sum(sp, function (r) { return G(r, SP.act); }), color: S.actual }], function () { spendModal(D, sp); });
    var yfm = ytdForecast(D).month;
    totalsChart(chartBox(panelIn(g2, "Up-to-date budget vs total forecast", "Year to date" + (yfm ? " (to " + fmt.month(yfm) + ")" : "") + " · click for the project split")), [
      { label: "YTD Spend Plan", value: U.sum(kp, function (r) { return G(r, "YTD Spend Plan as per Budgeting (M)"); }), color: S.plan },
      { label: "YTD Forecast Plan", value: U.sum(kp, function (r) { return ytdFc(D, r.Code); }), color: S.invoice },
      { label: "YTD Actual", value: U.sum(kp, function (r) { return G(r, "YTD Actual (M)"); }), color: S.actual }], function () {
        tableModal("Year-to-date spend by project", kp, [{ key: "Code", label: "Code" }, { key: "Project Name", label: "Project" },
          { get: function (r) { return G(r, "YTD Spend Plan as per Budgeting (M)"); }, label: "YTD Spend Plan", type: "money", total: "sum" },
          { get: function (r) { return ytdFc(D, r.Code); }, label: "YTD Forecast Plan", type: "money", total: "sum" },
          { get: function (r) { return G(r, "YTD Actual (M)"); }, label: "YTD Actual", type: "money", total: "sum" },
          { get: function (r) { return (N(G(r, "YTD Actual (M)")) || 0) - (N(G(r, "YTD Spend Plan as per Budgeting (M)")) || 0); }, label: "YTD Var. (Actual − Plan)", type: "money", signed: true, total: "sum" }],
          { totals: true, autoHeight: true, sort: { key: "YTD Spend Plan", dir: -1 }, onRow: function (r) { quickView(D, r.Code); }, rowTitle: "Open project" });
      });

    // Month visuals show every month allowed by the other filters and highlight the selected months.
    var mm = monthly(f.spXmonth), months = mm.map(function (o) { return o.month; }), labels = months.map(fmt.month);
    var g3 = grid(v, "g-2");
    function mSel(i, e) { pick(ctx, "month", months[i], e); }
    vbar(chartBox(panelIn(g3, "Plan vs actual", "By month · click a month to filter")), labels, [
      U.barDs("Spend Plan", mm.map(function (o) { return o.plan; }), U.hl(S.plan, months, st.month)),
      U.barDs("Forecast Plan", mm.map(function (o) { return o.inv; }), U.hl(S.invoice, months, st.month)),
      U.barDs("Actual Spend", mm.map(function (o) { return o.act; }), U.hl(S.actual, months, st.month))], mSel);
    U.chart(chartBox(panelIn(g3, "Cumulative plan vs forecast vs actual", "By month · click a month to filter")), U.clickable({ type: "line",
      data: { labels: labels, datasets: [
        U.lineDs("Spend Plan (cum)", mm.map(function (o) { return o.planC; }), S.plan, { pointRadius: 3 }),
        U.lineDs("Forecast Plan (cum)", mm.map(function (o) { return o.invC; }), S.invoice, { borderDash: [6, 4], pointRadius: 3 }),
        U.lineDs("Actual Spend (cum)", mm.map(function (o) { return o.actCv; }), S.actual, { borderWidth: 3, pointRadius: 3 })] },
      options: { plugins: { tooltip: U.moneyTooltip() }, scales: { x: U.catAxis(), y: U.moneyAxis() }, interaction: { mode: "index", intersect: false } } }, mSel));

    var inv = sp.filter(function (r) { return r["Invoice Related actvities"]; });
    var ip = panelIn(v, "Detailed invoice plan forecast", inv.length + " invoice-related activities · click a row to filter by its project");
    tableIn(ip, { rows: inv, exportName: "Invoice_Plan", totals: true, sort: { key: "Month", dir: 1 },
      onRow: function (r, e) { pick(ctx, "proj", r["Project Name"], e); }, rowTitle: "Filter by this project",
      rowClass: function (r) { return st.proj.indexOf(r["Project Name"]) >= 0 ? "selected" : ""; },
      columns: [
        { key: "Project Name", label: "Project Name", nowrap: true },
        { key: "Invoice Related actvities", label: "Invoice Related Activities", wrap: true },
        { get: function (r) { return G(r, SP.inv); }, label: "Forecast Plan", type: "money", total: "sum" },
        { key: "Month", label: "Month", type: "date", render: function (x) { return esc(fmt.month(x)); } }] });
  };

  /** Spend plan / forecast / actual by project for a set of Spending Plan rows. */
  function spendModal(D, rows) {
    var by = {};
    rows.forEach(function (r) {
      var o = by[r.ID] || (by[r.ID] = { ID: r.ID, name: r["Project Name"], plan: 0, act: 0, inv: 0 });
      o.plan += N(G(r, SP.plan)) || 0; o.act += N(G(r, SP.act)) || 0; o.inv += N(G(r, SP.inv)) || 0;
    });
    tableModal("Spend by project", Object.keys(by).map(function (k) { return by[k]; }), [
      { key: "ID", label: "ID" }, { key: "name", label: "Project" },
      { key: "plan", label: "Spend Plan", type: "money", total: "sum" }, { key: "inv", label: "Forecast Plan", type: "money", total: "sum" },
      { key: "act", label: "Actual Spend", type: "money", total: "sum" },
      { get: function (o) { return o.plan ? o.act / o.plan : null; }, label: "Actual ÷ plan", type: "meter" }],
      { totals: true, autoHeight: true, sort: { key: "plan", dir: -1 }, onRow: function (r) { quickView(D, r.ID); }, rowTitle: "Open project" });
  }

  /* ======================================================================
     Cost S-Curve
     ====================================================================== */
  P["cost-scurve"] = function (ctx) {
    var D = ctx.D, f = costFilters(ctx, true), v = ctx.view, mm = monthly(f.sp);
    var labels = mm.map(function (o) { return fmt.month(o.month); });
    var last = mm[mm.length - 1] || {};
    var lastAct = mm.filter(function (o) { return o.actCv != null; }).pop() || {};
    var g = grid(v, "g-4");
    var fvar = (last.invC || 0) - (last.planC || 0);
    g.innerHTML = mTile("Spend Plan (FY)", last.planC) + mTile("Forecast Plan (FY)", last.invC, "slate", "Contractor cash-flow forecast") +
      mTile("Actual to date", lastAct.actCv, "yellow", lastAct.month ? "Cumulative to " + fmt.month(lastAct.month) : "") +
      mTile("Forecast − Plan (FY)", fvar, fvar < 0 ? "red" : "mid", fmt.money(fvar) + " SAR");
    clickTiles(g, [0, 1, 2, 3].map(function () { return function () { spendModal(D, f.sp); }; }));

    var p1 = panelIn(v, "Cumulative spend S-curve", "Click a month for the project breakdown");
    p1.style.marginBottom = "16px";
    U.chart(chartBox(p1, "tall"), U.clickable({ type: "line",
      data: { labels: labels, datasets: [
        U.lineDs("Spend Plan (cum)", mm.map(function (o) { return o.planC; }), S.plan, { pointRadius: 3 }),
        U.lineDs("Forecast Plan (cum)", mm.map(function (o) { return o.invC; }), S.invoice, { borderDash: [6, 4], pointRadius: 3 }),
        U.lineDs("Actual Spend (cum)", mm.map(function (o) { return o.actCv; }), S.actual, { borderWidth: 3, pointRadius: 4 })] },
      options: { plugins: { tooltip: U.moneyTooltip() }, scales: { x: U.catAxis(), y: U.moneyAxis() }, interaction: { mode: "index", intersect: false } } },
      function (i) { monthModal(D, f.sp, mm[i].month); }));

    var p2 = panelIn(v, "Monthly spend", "Incremental values · click a month for the project breakdown");
    p2.style.marginBottom = "16px";
    vbar(chartBox(p2), labels, [U.barDs("Spend Plan", mm.map(function (o) { return o.plan; }), S.plan),
      U.barDs("Forecast Plan", mm.map(function (o) { return o.inv; }), S.invoice), U.barDs("Actual Spend", mm.map(function (o) { return o.act; }), S.actual)],
      function (i) { monthModal(D, f.sp, mm[i].month); });

    var p3 = panelIn(v, "S-curve data", "Monthly and cumulative values (SAR) · click a row for the project breakdown");
    tableIn(p3, { rows: mm, exportName: "Cost_S_Curve", search: false, autoHeight: true, totals: true,
      onRow: function (o) { monthModal(D, f.sp, o.month); }, rowTitle: "Open month breakdown",
      columns: [
        { key: "month", label: "Month", render: function (x) { return esc(fmt.month(x)); } },
        { key: "plan", label: "Spend Plan", type: "money", total: "sum" }, { key: "inv", label: "Forecast Plan", type: "money", total: "sum" },
        { key: "act", label: "Actual Spend", type: "money", total: "sum" },
        { key: "planC", label: "Spend Plan (cum)", type: "money" }, { key: "invC", label: "Forecast Plan (cum)", type: "money" },
        { key: "actCv", label: "Actual (cum)", type: "money" }] });
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
    var defs = [
      { key: "proj", label: "Project Name", options: U.uniq(all.map(function (r) { return r["Project Name"]; })).sort(), get: function (r) { return r["Project Name"]; } },
      { key: "perf", label: "Performance Status", options: U.uniq(all.map(function (r) { return r["Performance Status"]; })).sort(), get: function (r) { return r["Performance Status"]; } },
      { key: "size", label: "Project Size", options: U.uniq(all.map(function (r) { return r["Project Size"]; })).sort(), get: function (r) { return r["Project Size"]; } },
      { key: "contr", label: "Contractor", options: U.uniq(all.map(function (r) { return r.Contractor; })).sort(), get: function (r) { return r.Contractor; } }];
    var st = filterBar(ctx, defs, all);
    var rows = all.filter(function (r) { return passes(r, defs, st); });
    var rowsX = all.filter(function (r) { return passes(r, defs, st, "proj"); });
    var ev = U.sum(rows, "Cumulative EV (SAR)"), pv = U.sum(rows, "Cumulative PV (SAR)");
    var delayed = rows.filter(function (r) { return /delay/i.test(r["Performance Status"] || ""); });
    var g = grid(v, "g-4");
    g.innerHTML = U.tile({ value: rows.length, label: "Projects", note: "Report date " + fmt.date(D.reportDate) }) +
      mTile("Contract value", U.sum(rows, "Contract Value"), "black") +
      U.tile({ value: pv ? (ev / pv).toFixed(2) : "—", label: "SPI (cost)", color: "mid", note: "Σ Cum EV ÷ Σ Cum PV" }) +
      U.tile({ value: delayed.length, label: "Delayed projects", color: delayed.length ? "red" : "slate", note: "of " + rows.length + " — click to filter" });
    clickTiles(g, [null, null, null, function () {
      var d = U.uniq(all.map(function (r) { return r["Performance Status"]; })).filter(function (s) { return /delay/i.test(s || ""); });
      sel(ctx, "perf").length = 0; d.forEach(function (s) { sel(ctx, "perf").push(s); }); ctx.rerender(); }]);

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

    var pc = panelIn(v, "Planned vs actual cumulative progress", "Click a project to filter the table · Ctrl+click for several");
    var box = chartBox(pc); box.style.height = Math.max(300, rowsX.length * 38 + 70) + "px";
    var names = rowsX.map(function (r) { return r["Project Name"]; });
    hbar(box, rowsX.map(function (r) { return r["Project Code"] + " — " + r["Project Name"]; }), [
      U.barDs("Planned % (cum)", rowsX.map(function (r) { return r["Planned (%) - Cumulative"]; }), U.hl(S.plan, names, st.proj)),
      U.barDs("Actual % (cum)", rowsX.map(function (r) { return r["Actual (%) - Cumulative"]; }), U.hl(S.actual, names, st.proj))],
      function (i, e) { pick(ctx, "proj", names[i], e); }, U.pctAxis(1), U.pctTooltip());
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
  function gantt(host, rows, groupLabel, gopts) {
    gopts = gopts || {};
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
        h += '<div class="g-row g-group' + (gopts.onGroup ? " clickable" : "") + '" data-i="' + rows.indexOf(r) + '"><div>' + esc(gname) + (gopts.onGroup ? ' <span class="go">Open timeline →</span>' : "") + '</div><div class="g-track">' + gridLines + today + "</div></div>";
        lastGroup = gname;
      }
      var s = dnum(r["Project Start"]), pf = dnum(r["Planned Finish"]), ff = dnum(r["Actual/Forecast Finish"]);
      var late = pf && ff && ff > pf;
      var act = Math.max(0, Math.min(1, N(r["Actual Progress"]) || 0));
      var tip = esc(r.Description) + " | Start " + fmt.date(r["Project Start"]) + " | Planned finish " + fmt.date(r["Planned Finish"]) +
        " | Forecast/actual finish " + fmt.date(r["Actual/Forecast Finish"]) + " | Planned " + fmt.pct(r["Planned progress"]) + " · Actual " + fmt.pct(r["Actual Progress"]) +
        (r["Var.Days"] != null ? " | Var " + r["Var.Days"] + " days" : "");
      h += '<div class="g-row' + (gopts.onRow ? " clickable" : "") + '" data-r="' + rows.indexOf(r) + '" title="' + tip + '"><div>' + esc(r.Description) + (r.WSB && r.WSB !== r.Description ? ' <span class="muted">&nbsp;· ' + esc(r.WSB) + "</span>" : "") +
        '</div><div class="num">' + fmt.pct(r["Planned progress"], 0) + '</div><div class="num">' + fmt.pct(r["Actual Progress"], 0) + '</div><div class="g-track">' + gridLines + today;
      if (s && pf) h += '<span class="g-bar base" style="left:' + x(s) + ";width:calc(" + x(pf) + " - " + x(s) + ')"></span>';
      if (s && ff) h += '<span class="g-bar fc' + (late ? " late" : "") + '" style="left:' + x(s) + ";width:calc(" + x(ff) + " - " + x(s) + ')"><i style="width:' + (act * 100).toFixed(1) + '%"></i></span>';
      h += "</div></div>";
    });
    h += "</div></div>";
    var node = add(host, "<div>" + h + "</div>");
    if (gopts.onGroup) node.querySelectorAll(".g-group[data-i]").forEach(function (g) { g.addEventListener("click", function () { gopts.onGroup(rows[+g.getAttribute("data-i")]); }); });
    if (gopts.onRow) node.querySelectorAll(".g-row[data-r]").forEach(function (g) { g.addEventListener("click", function () { gopts.onRow(rows[+g.getAttribute("data-r")]); }); });
  }

  P["master-plan"] = function (ctx) {
    var D = ctx.D, v = ctx.view, all = D.t("Project_Milestones_Progress_Combine");
    var defs = [
      { key: "wsb", label: "WBS", options: U.uniq(all.map(function (r) { return r.WSB; })), get: function (r) { return r.WSB; } },
      { key: "src", label: "Project", options: U.uniq(all.map(function (r) { return r["Source.Name"]; })), display: D.projectLabel, get: function (r) { return r["Source.Name"]; } },
      { key: "late", label: "Schedule", options: ["Forecast later than plan", "On or ahead of plan"], get: function (r) {
        var p = dnum(r["Planned Finish"]), f = dnum(r["Actual/Forecast Finish"]); return p && f && f > p ? "Forecast later than plan" : "On or ahead of plan"; } }];
    var st = filterBar(ctx, defs, all);
    var rows = all.filter(function (r) { return passes(r, defs, st); })
      .sort(function (a, b) { var s = D.projectLabel(a["Source.Name"]).localeCompare(D.projectLabel(b["Source.Name"])); return s || sortNum(a.Sort, b.Sort); });
    var late = rows.filter(function (r) { var p = dnum(r["Planned Finish"]), f = dnum(r["Actual/Forecast Finish"]); return p && f && f > p; }).length;
    var g = grid(v, "g-4");
    g.innerHTML = U.tile({ value: U.uniq(rows.map(function (r) { return r["Source.Name"]; })).length, label: "Projects" }) +
      U.tile({ value: rows.length, label: "Milestones", color: "black" }) +
      U.tile({ value: late, label: "Forecast later than plan", color: late ? "red" : "slate" }) +
      U.tile({ value: fmt.date((rows[0] || {})["Data Date"]), label: "Data date", color: "mid" });
    clickTiles(g, [null, null, function () { var s = sel(ctx, "late"); s.length = 0; s.push("Forecast later than plan"); ctx.rerender(); }, null]);
    gantt(panelIn(v, "Projects master plan", "Hover a bar for dates · click a project heading for its timeline, a milestone for details"), rows,
      function (r) { return D.projectLabel(r["Source.Name"]); },
      { onGroup: function (r) { window.SARApp.go("timeline", { src: r["Source.Name"] }); }, onRow: function (r) { U.recordModal(r.Description + " — " + D.projectLabel(r["Source.Name"]), r); } });
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
    var defs = [
      { key: "status", label: "Issue Status", options: U.uniq(all.map(function (r) { return r["Issue Status"]; })).sort(), get: function (r) { return r["Issue Status"]; } },
      { key: "rate", label: "Issue Rate", options: U.uniq(all.map(function (r) { return r["Issue Rate"]; })).sort(function (a, b) { return RATE_ORDER.indexOf(a) - RATE_ORDER.indexOf(b); }), get: function (r) { return r["Issue Rate"]; } },
      { key: "code", label: "Project Code", options: U.uniq(all.map(function (r) { return r["Poject Code"]; })).sort(), get: function (r) { return r["Poject Code"]; } },
      { key: "name", label: "Project Name", options: U.uniq(all.map(function (r) { return r["Project Name"]; })).sort(), get: function (r) { return r["Project Name"]; } },
      { key: "cat", label: "Issue Category", options: U.uniq(all.map(function (r) { return r["Issue Category"]; })).sort(), get: function (r) { return r["Issue Category"]; } }];
    var st = filterBar(ctx, defs, all);
    var rows = all.filter(function (r) { return passes(r, defs, st); });
    function cnt(re, field) { return rows.filter(function (r) { return re.test(r[field] || ""); }).length; }
    function setStatus(re) { return function () {
      var s = sel(ctx, "status"); s.length = 0;
      U.uniq(all.map(function (r) { return r["Issue Status"]; })).filter(function (x) { return re.test(x || ""); }).forEach(function (x) { s.push(x); });
      ctx.rerender(); }; }
    var g = grid(v, "g-5");
    g.innerHTML = U.tile({ value: rows.length, label: "Issues", note: U.uniq(rows.map(function (r) { return r["Poject Code"]; })).length + " projects" }) +
      U.tile({ value: cnt(/pending/i, "Issue Status"), label: "Pending", color: "yellow", note: "Click to filter" }) +
      U.tile({ value: cnt(/escalat/i, "Issue Status"), label: "Escalated", color: "red", note: "Click to filter" }) +
      U.tile({ value: cnt(/resolved|closed/i, "Issue Status"), label: "Resolved", color: "slate", note: "Click to filter" }) +
      U.tile({ value: rows.filter(function (r) { return /critical/i.test(r["Issue Rate"] || "") && !/resolved|closed/i.test(r["Issue Status"] || ""); }).length, label: "Open critical", color: "black", note: "Critical and not resolved — click" });
    clickTiles(g, [function () { defs.forEach(function (d) { st[d.key].length = 0; }); ctx.rerender(); }, setStatus(/pending/i), setStatus(/escalat/i), setStatus(/resolved|closed/i),
      function () { var r = sel(ctx, "rate"); r.length = 0; r.push("Critical"); setStatus(/pending|escalat/i)(); }]);

    var g2 = grid(v, "g-2-1");
    var rowsX = all.filter(function (r) { return passes(r, defs, st, "name"); });
    var projs = U.uniq(rowsX.map(function (r) { return r["Project Name"]; }));
    projs.sort(function (a, b) { return rowsX.filter(function (r) { return r["Project Name"] === b; }).length - rowsX.filter(function (r) { return r["Project Name"] === a; }).length; });
    var pb = chartBox(panelIn(g2, "Issues by project and rate", "Click a project to filter · Ctrl+click for several")); pb.style.height = Math.max(280, projs.length * 30 + 70) + "px";
    U.chart(pb, U.clickable({ type: "bar",
      data: { labels: projs, datasets: RATE_ORDER.map(function (rt) {
        return U.barDs(rt, projs.map(function (p) { return rowsX.filter(function (r) { return r["Project Name"] === p && r["Issue Rate"] === rt; }).length; }),
          U.hl(RATE_COLOR[rt], projs, st.name), { borderColor: C.white, borderWidth: { right: 2 }, borderRadius: 0, maxBarThickness: 22 }); }) },
      options: { indexAxis: "y", scales: { x: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, grid: { color: "rgba(200,201,199,.5)" } }, y: { stacked: true, grid: { display: false }, ticks: { callback: U.shortLabel(46) } } } } },
      function (i, e) { pick(ctx, "name", projs[i], e); }));
    var rowsS = all.filter(function (r) { return passes(r, defs, st, "status"); });
    var statuses = U.uniq(rowsS.map(function (r) { return r["Issue Status"]; }));
    var sb = chartBox(panelIn(g2, "Issues by status", "Click to filter"));
    U.chart(sb, U.clickable({ type: "bar",
      data: { labels: statuses, datasets: [U.barDs("Issues", statuses.map(function (s) { return rowsS.filter(function (r) { return r["Issue Status"] === s; }).length; }),
        statuses.map(function (s) { var c = U.statusClass(s), col = c === "bad" ? C.red : c === "warn" ? C.yellow : c === "done" ? C.slate : C.blue;
          return st.status.length && st.status.indexOf(s) < 0 ? U.fade(col) : col; }), { maxBarThickness: 56 })] },
      options: { plugins: { legend: { display: false }, datalabels: { display: true, anchor: "end", align: "end", color: C.black, font: { weight: "700" } } },
        layout: { padding: { top: 20 } }, scales: { x: U.catAxis(), y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: "rgba(200,201,199,.5)" } } } } },
      function (i, e) { pick(ctx, "status", statuses[i], e); }));

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

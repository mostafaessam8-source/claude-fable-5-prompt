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
        datasets: [U.fcStyle(U.barDs("Value", items.map(function (i) { return i.value; }), items.map(function (i) { return i.color; }), { maxBarThickness: 64 }),
          items.map(function (i) { return i.color === S.invoice; }))] },
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
    if (p.nsr) h += '<a class="icon-btn ghost" data-go="cost">Cost dashboard →</a>';
    if (p.issues) h += '<a class="icon-btn ghost" data-go="issues">Issues (' + p.issues + ") →</a>";
    h += "</div>";
    var body = U.modal(p.label, h, true);
    body.querySelectorAll("[data-go]").forEach(function (a) {
      a.addEventListener("click", function () {
        var to = a.getAttribute("data-go"); body.close();
        if (to === "cost") window.SARApp.go(to, { f: { proj: [p.short] } });
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
        U.lineDs("Forecast Plan", mm.map(function (o) { return o.invC; }), S.invoice, { borderDash: [7, 5], pointRadius: 3 }),
        U.lineDs("Actual Spend", mm.map(function (o) { return o.actCv; }), S.actual, { borderWidth: 3, pointRadius: 3 })] },
      options: { plugins: { tooltip: U.moneyTooltip() }, scales: { x: U.catAxis(), y: U.moneyAxis() }, interaction: { mode: "index", intersect: false } } };
    U.chart(chartBox(pa), U.clickable(lc, function (i) { monthModal(D, sp, mm[i].month); }));

    var phases = U.uniq(ps.map(function (p) { return p.phase; }));
    var pb = panelIn(g4, "Projects by phase", "Click to filter the page");
    vbar(chartBox(pb), phases, [U.barDs("Projects", phases.map(function (ph) { return ps.filter(function (p) { return p.phase === ph; }).length; }),
      U.hl(S.plan, phases, sel(ctx, "phase")), { maxBarThickness: 48 })],
      function (i, e) { pick(ctx, "phase", phases[i], e); }, null, { beginAtZero: true, ticks: { precision: 0 }, grid: { color: "rgba(200,201,199,.5)" } });

    var rates = ["Critical", "High", "Medium", "Low", "N/A"], stats = U.uniq(iss.map(function (r) { return r["Issue Status"] || "Not set"; }));
    var ib = panelIn(g4, "Issues by status and rate", "Click a segment for the issue list");
    var ic = { type: "bar", data: { labels: stats, datasets: rates.map(function (rt) {
      return U.barDs(rt, stats.map(function (s) { return iss.filter(function (r) { return (r["Issue Status"] || "Not set") === s && r["Issue Rate"] === rt; }).length; }),
        { Critical: C.red, High: C.yellow, Medium: C.mid, Low: C.slate, "N/A": C.gray }[rt], { borderRadius: 0, borderColor: C.white, borderWidth: { top: 2 } }); }) },
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
      U.fcBar("Forecast Plan 2026", byP.map(fcF), U.hl(S.invoice, names, st.proj)),
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
     Cost Dashboard — one page for the cost register (contract & payments),
     the 2026 spend (Spend Plan vs Forecast Plan vs Actual, S-curve) and the
     detail tables. Replaces the former Cost Dashboard / Cost Analysis /
     Cost S-Curve pages; every figure appears once.
     ====================================================================== */
  function secHead(v, title, sub) { return add(v, '<div class="sec-h"><h3>' + esc(title) + "</h3>" + (sub ? "<span>" + sub + "</span>" : "") + "</div>"); }
  P.cost = function (ctx) {
    var D = ctx.D, f = costFilters(ctx, true, true), v = ctx.view, nsr = f.nsr, st = f.st;

    /* 1 · Contract & payments (NSR Project Data) */
    secHead(v, "Contract & payments", "Cost register · project filters apply");
    var g = grid(v, "g-5");
    g.innerHTML = mTile("Full Cost", U.sum(nsr, "Full Cost")) + mTile("Contract Value", U.sum(nsr, "Contract Value"), "black") +
      mTile("Total WC", U.sum(nsr, "Total WC"), "mid") + mTile("Paid", U.sum(nsr, PAID), "slate") + mTile("Remaining WC", U.sum(nsr, "Remaining WC"), "yellow");
    clickTiles(g, ["Full Cost", "Contract Value", "Total WC", PAID, "Remaining WC"].map(function (k, i) {
      return function () { costModal(D, ["Full cost", "Contract value", "Total WC", "Paid", "Remaining WC"][i], nsr, k); }; }));

    var byCV = f.nsrX.slice().sort(function (a, b) { return sortNum(b["Contract Value"], a["Contract Value"]); });
    var names = byCV.map(function (r) { return r["Project Name"]; });
    var g1 = grid(v, "g-2-1");
    var b1 = chartBox(panelIn(g1, "Contract value vs WC total vs paid", "By project · click a project to filter the page · Ctrl+click for several"));
    b1.style.height = Math.max(320, names.length * 34 + 70) + "px";
    hbar(b1, names, [
      U.barDs("Contract Value", byCV.map(function (r) { return r["Contract Value"]; }), U.hl(S.plan, names, st.proj)),
      U.barDs("Total WC", byCV.map(function (r) { return r["Total WC"]; }), U.hl(S.forecast, names, st.proj)),
      U.barDs("Paid", byCV.map(function (r) { return r[PAID]; }), U.hl(S.actual, names, st.proj))], function (i, e) { pick(ctx, "proj", names[i], e); });
    var side = add(g1, '<div class="stack"></div>');
    [["phase", "Project Phase", "Contract value by phase"], ["fund", "Fund Type", "Contract value by fund type"]].forEach(function (c) {
      var base = D.t("NSR_Project_Data").filter(function (r) { return passes(r, [
        { key: "proj", get: function (x) { return x["Project Name"]; } }, { key: "id", get: function (x) { return x.ID; } },
        { key: "fund", get: function (x) { return x["Fund Type"]; } }, { key: "phase", get: function (x) { return x["Project Phase"]; } }], st, c[0]); });
      var keys = U.uniq(base.map(function (r) { return r[c[1]]; }));
      var vals = keys.map(function (k) { return U.sum(base.filter(function (r) { return r[c[1]] === k; }), "Contract Value"); });
      var box = chartBox(panelIn(side, c[2], "Click to filter"), "short");
      box.style.height = Math.max(160, keys.length * 30 + 50) + "px";
      hbar(box, keys, [U.barDs("Contract Value", vals, U.hl(S.plan, keys, st[c[0]]), { maxBarThickness: 18 })], function (i, e) { pick(ctx, c[0], keys[i], e); });
    });

    /* 2 · 2026 spend (Spending Plan) */
    var cut = lastActualMonth(D.t("Spending_Plan")), toCut = cut ? "Jan – " + esc(fmt.month(cut)) : "";
    secHead(v, "2026 spend — Spend Plan vs Forecast Plan vs Actual", "Spending Plan · click a month to filter the month-based visuals");
    var mm = monthly(f.spXmonth), months = mm.map(function (o) { return o.month; }), labels = months.map(fmt.month);
    var last = mm[mm.length - 1] || {}, ytd = mm.filter(function (o) { return cut && o.month <= cut; }).pop() || {};
    var fvar = (last.invC || 0) - (last.planC || 0), yPlan = ytd.planC || 0, yAct = ytd.actC || 0, yvar = yAct - yPlan;
    var g2 = grid(v, "g-6");
    g2.innerHTML = mTile("Spend Plan 2026", last.planC, "", "Budgeting · Jan – Dec") +
      mTile("Forecast Plan 2026", last.invC, "slate", "Invoicing plan · Jan – Dec") +
      mTile("Variance 2026", fvar, fvar < 0 ? "red" : "mid", "Forecast − Spend Plan · " + fmt.pct(last.planC ? last.invC / last.planC : null, 1) + " of plan") +
      mTile("YTD Plan", yPlan, "", "Spend Plan · " + toCut) + mTile("YTD Actual", yAct, "yellow", "Actual spend · " + toCut) +
      mTile("YTD Variance", yvar, yvar < 0 ? "red" : "mid", "Actual − Plan · " + fmt.pct(yPlan ? yAct / yPlan : null, 1) + " achieved");
    clickTiles(g2, [0, 1, 2, 3, 4, 5].map(function () { return function () { spendModal(D, f.spXmonth); }; }));

    function mSel(i, e) { pick(ctx, "month", months[i], e); }
    var g3 = grid(v, "g-2");
    U.chart(chartBox(panelIn(g3, "Cumulative S-curve", "Spend Plan vs Forecast Plan vs Actual · click a month to filter"), "tall"), U.clickable({ type: "line",
      data: { labels: labels, datasets: [
        U.lineDs("Spend Plan (cum)", mm.map(function (o) { return o.planC; }), S.plan, { pointRadius: 3, borderWidth: 2.5 }),
        U.lineDs("Forecast Plan (cum)", mm.map(function (o) { return o.invC; }), S.invoice, { borderDash: [7, 5], pointRadius: 3 }),
        U.lineDs("Actual Spend (cum)", mm.map(function (o) { return o.actCv; }), S.actual, { borderWidth: 3, pointRadius: 4 })] },
      options: { plugins: { tooltip: U.moneyTooltip() }, scales: { x: U.catAxis(), y: U.moneyAxis() }, interaction: { mode: "index", intersect: false } } }, mSel));
    vbar(chartBox(panelIn(g3, "Monthly spend", "Incremental · click a month to filter"), "tall"), labels, [
      U.barDs("Spend Plan", mm.map(function (o) { return o.plan; }), U.hl(S.plan, months, st.month)),
      U.fcBar("Forecast Plan", mm.map(function (o) { return o.inv; }), U.hl(S.invoice, months, st.month)),
      U.barDs("Actual Spend", mm.map(function (o) { return o.act; }), U.hl(S.actual, months, st.month))], mSel);

    var byP = {}; f.spXproj.forEach(function (r) {
      var o = byP[r["Project Name"]] || (byP[r["Project Name"]] = { plan: 0, act: 0, inv: 0 });
      o.plan += N(G(r, SP.plan)) || 0; o.act += N(G(r, SP.act)) || 0; o.inv += N(G(r, SP.inv)) || 0;
    });
    var spNames = Object.keys(byP).sort(function (a, b) { return byP[b].plan - byP[a].plan; });
    var b2 = chartBox(panelIn(v, "Spend by project", (st.month.length ? st.month.map(fmt.month).join(", ") : "2026") + " · Spend Plan vs Forecast Plan vs Actual · click a project to filter"));
    b2.style.height = Math.max(320, spNames.length * 30 + 70) + "px";
    hbar(b2, spNames, [U.barDs("Spend Plan", spNames.map(function (n) { return byP[n].plan; }), U.hl(S.plan, spNames, st.proj)),
      U.fcBar("Forecast Plan", spNames.map(function (n) { return byP[n].inv; }), U.hl(S.invoice, spNames, st.proj)),
      U.barDs("Actual Spend", spNames.map(function (n) { return byP[n].act; }), U.hl(S.actual, spNames, st.proj))],
      function (i, e) { pick(ctx, "proj", spNames[i], e); });

    /* 3 · Detail tables (one tab each) */
    secHead(v, "Details", "");
    st.tab = st.tab || "reg";
    var tabs = [["reg", "Project cost register"], ["sc", "Monthly S-curve data"], ["inv", "Invoice plan"]];
    var tp = add(v, U.panel(tabs.filter(function (t) { return t[0] === st.tab; })[0][1], "", ""));
    tp.querySelector(".panel-head .tools").appendChild(seg("", tabs, st.tab, function (x) { st.tab = x; ctx.rerender(); }));
    if (st.tab === "reg") tableIn(tp, { rows: nsr, exportName: "NSR_Project_Data", totals: true, maxHeight: 620,
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
    else if (st.tab === "sc") tableIn(tp, { rows: mm, exportName: "Cost_S_Curve", search: false, autoHeight: true, totals: true,
      onRow: function (o) { monthModal(D, f.spXmonth, o.month); }, rowTitle: "Open month breakdown",
      columns: [
        { key: "month", label: "Month", render: function (x) { return esc(fmt.month(x)); } },
        { key: "plan", label: "Spend Plan", type: "money", total: "sum" }, { key: "inv", label: "Forecast Plan", type: "money", total: "sum" },
        { key: "act", label: "Actual Spend", type: "money", total: "sum" },
        { key: "planC", label: "Spend Plan (cum)", type: "money" }, { key: "invC", label: "Forecast Plan (cum)", type: "money" },
        { key: "actCv", label: "Actual (cum)", type: "money" }] });
    else {
      var inv = f.sp.filter(function (r) { return r["Invoice Related actvities"]; });
      tableIn(tp, { rows: inv, exportName: "Invoice_Plan", totals: true, sort: { key: "Month", dir: 1 }, maxHeight: 620,
        onRow: function (r, e) { pick(ctx, "proj", r["Project Name"], e); }, rowTitle: "Filter by this project",
        rowClass: function (r) { return st.proj.indexOf(r["Project Name"]) >= 0 ? "selected" : ""; },
        columns: [
          { key: "Project Name", label: "Project Name", nowrap: true },
          { key: "Invoice Related actvities", label: "Invoice Related Activities", wrap: true },
          { get: function (r) { return G(r, SP.inv); }, label: "Forecast Plan", type: "money", total: "sum" },
          { key: "Month", label: "Month", type: "date", render: function (x) { return esc(fmt.month(x)); } }] });
    }
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
     KPI Year-End Outlook — how the cost KPIs will close the year.
     Year-end = the contractor Forecast Plan (invoicing plan) for the full year,
     against the Spend Plan (budgeting). Actual spend is shown for reference only.
     No new data: Spending_Plan, KPI_Projects_Data and KPI_Summary only.
     ====================================================================== */
  var TARGET = 0.95;   // "CAPEX Variance (−5%)": year-end spend within 5% of the Spend Plan
  function outlookStatus(o) {
    if (!o.plan) return o.landing ? "Unplanned spend" : "No 2026 plan";
    var p = o.landing / o.plan;
    return p > 1.05 ? "Above plan" : p >= TARGET ? "On track" : p >= 0.85 ? "At risk" : "Behind plan";
  }
  var OUT_ORDER = ["Behind plan", "At risk", "On track", "Above plan", "Unplanned spend", "No 2026 plan"];
  var OUT_COLOR = { "Behind plan": C.red, "At risk": C.yellow, "On track": C.blue, "Above plan": C.mid, "Unplanned spend": C.slate, "No 2026 plan": C.gray };
  function lastActualMonth(sp) { return sp.filter(function (r) { return N(G(r, SP.act)) != null; }).map(function (r) { return r.Month; }).sort().pop() || null; }
  function outlookByProject(rows, cut, kpiOf) {
    var by = {};
    rows.forEach(function (r) {
      var id = String(r.ID), o = by[id] || (by[id] = { ID: id, name: r["Project Name"], fund: r["Fund Type"], phase: r["Project Phase"], kpi: kpiOf(id),
        plan: 0, planYtd: 0, planRem: 0, act: 0, fcRem: 0, fcFY: 0, months: {} });
      var pl = N(G(r, SP.plan)) || 0, ac = N(G(r, SP.act)) || 0, fc = N(G(r, SP.inv)) || 0, past = cut && r.Month <= cut;
      o.plan += pl; o.fcFY += fc;
      if (past) { o.planYtd += pl; o.act += ac; } else { o.planRem += pl; o.fcRem += fc; }
      o.months[r.Month] = { row: r, plan: pl, act: past ? ac : null, fc: fc, text: r["Invoice Related actvities"], ms: r.Milestones, past: past };
    });
    return Object.keys(by).map(function (k) {
      var o = by[k]; o.landing = o.fcFY; o.fcYtd = o.fcFY - o.fcRem; o.variance = o.landing - o.plan; o.pct = o.plan ? o.landing / o.plan : null;
      o.ytdVar = o.fcYtd - o.planYtd; o.remVar = o.fcRem - o.planRem; o.status = outlookStatus(o); return o;
    });
  }
  function waterfall(box, steps, target) {
    // steps: [{ label, value, total? }] → floating bars; totals start at zero
    var run = 0, data = [], colors = [];
    steps.forEach(function (s) {
      if (s.total) { data.push([0, s.value]); run = s.value; colors.push(s.color); }
      else { data.push([run, run + s.value]); run += s.value; colors.push(s.value < 0 ? C.red : C.blue); }
    });
    var ds = [U.fcStyle(U.barDs("Amount", data, colors, { maxBarThickness: 70, datalabels: { display: true, anchor: "end", align: "end", color: C.black, font: { weight: "700" },
      formatter: function (v, c) { var s = steps[c.dataIndex], x = s.total ? s.value : s.value; return (s.total || x < 0 ? "" : "+") + fmt.m(x) + " M"; } } }), colors.map(function (c) { return c === S.invoice; }))];
    if (target != null) ds.push(U.lineDs("Target (" + Math.round(TARGET * 100) + "% of plan)", steps.map(function () { return target; }), C.black, { borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0, datalabels: { display: false } }));
    return U.chart(box, { type: "bar", data: { labels: steps.map(function (s) { return s.label; }), datasets: ds },
      options: { layout: { padding: { top: 24 } }, plugins: { legend: { display: target != null, labels: { filter: function (i) { return i.datasetIndex > 0; } } },
        tooltip: { callbacks: { label: function (c) { if (c.datasetIndex) return " Target: " + fmt.money(c.parsed.y) + " SAR"; var s = steps[c.dataIndex]; return " " + s.label + ": " + fmt.money(s.value) + " SAR"; } } } },
        scales: { x: U.catAxis(), y: Object.assign(U.moneyAxis(), { beginAtZero: true }) } } });
  }

  P["kpi-outlook"] = function (ctx) {
    var D = ctx.D, v = ctx.view, spAll = D.t("Spending_Plan"), kpd = D.t("KPI_Projects_Data"), ksum = D.t("KPI_Summary").filter(isKPI([7, 8]));
    if (!spAll.length) { add(v, '<div class="empty">No Spending Plan data.</div>'); return; }
    var kpiName = {}, kpiW = {}, codeKpi = {};
    ksum.forEach(function (r) { kpiName[N(r["KPI Code"])] = r["Objective/ KPIs"]; kpiW[N(r["KPI Code"])] = N(r["KPI Weight (%)"]) || 0; });
    kpd.filter(isKPI([7, 8])).forEach(function (r) { codeKpi[String(r.Code)] = N(r["KPI Code"]); });
    function kpiOf(id) { var k = codeKpi[id]; return k != null ? kpiName[k] || "KPI " + k : "Not in a cost KPI"; }
    var cut = lastActualMonth(spAll), months = U.uniq(spAll.map(function (r) { return r.Month; })).sort();
    var projAll = outlookByProject(spAll, cut, kpiOf);
    var defs = [
      { key: "kpi", label: "KPI", options: U.uniq(projAll.map(function (o) { return o.kpi; })), get: function (o) { return o.kpi; } },
      { key: "out", label: "Year-end outlook", options: U.uniq(projAll.map(function (o) { return o.status; })).sort(byOrder(OUT_ORDER)), get: function (o) { return o.status; } },
      { key: "fund", label: "Fund Type", options: U.uniq(projAll.map(function (o) { return o.fund; })).sort(), get: function (o) { return o.fund; } },
      { key: "phase", label: "Project Phase", options: U.uniq(projAll.map(function (o) { return o.phase; })).sort(), get: function (o) { return o.phase; } },
      { key: "proj", label: "Project", options: U.uniq(projAll.map(function (o) { return o.name; })).sort(), get: function (o) { return o.name; } }];
    // Open on the weighted KPI (CAPEX Variance): the target only applies to it. "Reset filters" shows both.
    if (!ctx.state.f) ctx.state.f = { kpi: ksum.filter(function (r) { return kpiW[N(r["KPI Code"])] > 0; }).map(function (r) { return r["Objective/ KPIs"]; }) };
    var st = filterBar(ctx, defs, projAll);
    var proj = projAll.filter(function (o) { return passes(o, defs, st); });
    var projX = projAll.filter(function (o) { return passes(o, defs, st, "proj"); });
    function tot(list, k) { return list.reduce(function (s, o) { return s + (o[k] || 0); }, 0); }
    var T = { plan: tot(proj, "plan"), planYtd: tot(proj, "planYtd"), act: tot(proj, "act"), planRem: tot(proj, "planRem"), fcRem: tot(proj, "fcRem"), fcFY: tot(proj, "fcFY") };
    T.fcYtd = T.fcFY - T.fcRem; T.landing = T.fcFY; T.pct = T.plan ? T.landing / T.plan : null; T.gap = TARGET * T.plan - T.landing;
    var remLbl = cut ? months.filter(function (m) { return m > cut; }).map(fmt.month) : [];
    remLbl = remLbl.length ? remLbl[0] + " – " + remLbl[remLbl.length - 1] : "—";

    add(v, '<div class="note-box ol-lead"><b>How the year closes:</b> year-end = the contractor <b>Forecast Plan (invoicing plan)</b> for Jan – Dec 2026, compared with the <b>Spend Plan (budgeting)</b>. ' +
      "Actual spend (to " + esc(fmt.month(cut)) + ") is shown for reference only and does not change the year-end figure. CAPEX Variance KPI target: year-end spend at least <b>" + Math.round(TARGET * 100) + "%</b> of the Spend Plan (variance within −5%).</div>");

    var g = grid(v, "g-6");
    var pc = T.pct, col = pc == null ? "slate" : pc >= TARGET ? "" : pc >= 0.85 ? "yellow" : "red";
    // Full year: Spend Plan · Forecast Plan · variance | Year to date: YTD Plan · YTD Actual · variance
    var fyVar = T.landing - T.plan, ytdVar = T.act - T.planYtd, ytdPct = T.planYtd ? T.act / T.planYtd : null;
    g.innerHTML = mTile("Spend Plan 2026", T.plan, "", "Budgeting · Jan – Dec") +
      mTile("Forecast Plan 2026", T.landing, "slate", "Invoicing plan · Jan – Dec") +
      mTile("Variance 2026", fyVar, col || "mid", "Forecast − Spend Plan · " + fmt.pct(pc, 1) + " of plan" +
        (T.gap > 0 ? " · " + fmt.m(T.gap) + " M short of the " + Math.round(TARGET * 100) + "% target" : " · " + Math.round(TARGET * 100) + "% target met")) +
      mTile("YTD Plan", T.planYtd, "", "Spend Plan · Jan – " + esc(fmt.month(cut))) +
      mTile("YTD Actual", T.act, "yellow", "Actual spend · Jan – " + esc(fmt.month(cut))) +
      mTile("YTD Variance", ytdVar, ytdVar < 0 ? "red" : "mid", "Actual − Plan · " + fmt.pct(ytdPct, 1) + " achieved");
    clickTiles(g, [0, 1, 2, 3, 4, 5].map(function () { return function () { outlookModal(proj); }; }));

    // KPI closing table
    var kp = panelIn(v, "KPI closing position", "Today's KPI result (YTD) and the projected year-end result · KPI result = weight × % achieved");
    var krows = ksum.map(function (r) {
      var code = N(r["KPI Code"]), list = proj.filter(function (o) { return codeKpi[o.ID] === code; });
      var o = { KPI: r["Objective/ KPIs"], w: kpiW[code], plan: tot(list, "plan"), planYtd: tot(list, "planYtd"), act: tot(list, "act"), fcRem: tot(list, "fcRem"), fcFY: tot(list, "fcFY"), n: list.length };
      o.ytdPct = o.planYtd ? o.act / o.planYtd : null; o.landing = o.fcFY; o.yePct = o.plan ? o.landing / o.plan : null;
      o.nowRes = o.ytdPct != null ? o.w * Math.min(1, o.ytdPct) : null; o.yeRes = o.yePct != null ? o.w * Math.min(1, o.yePct) : null; o.gap = TARGET * o.plan - o.landing;
      return o;
    }).filter(function (o) { return o.n; });
    tableIn(kp, { rows: krows, search: false, autoHeight: true, exportName: "KPI_Year_End_Outlook", onRow: function (o, e) { pick(ctx, "kpi", o.KPI, e); }, rowTitle: "Filter by this KPI",
      columns: [{ key: "KPI", label: "KPI", wrap: true }, { key: "w", label: "Weight", type: "pct" }, { key: "plan", label: "Spend Plan 2026", type: "money" },
        { key: "planYtd", label: "YTD Plan", type: "money" }, { key: "act", label: "YTD Actual", type: "money" }, { key: "ytdPct", label: "YTD % achieved", type: "meter" },
        { key: "nowRes", label: "KPI result today", type: "pct" }, { key: "landing", label: "Year-end Forecast Plan", type: "money" },
        { key: "yePct", label: "Year-end % achieved", type: "meter" }, { key: "yeRes", label: "Projected KPI result", type: "pct" },
        { key: "gap", label: "Gap to " + Math.round(TARGET * 100) + "% target", type: "money", render: function (x) { return x > 0 ? '<span class="neg">' + fmt.money(x) + "</span>" : '<span class="pos">Covered</span>'; } }] });

    // Bridge + S-curve
    var g1 = grid(v, "g-1-2");
    var vr = T.landing - T.plan;
    waterfall(chartBox(panelIn(g1, "Spend Plan vs year-end Forecast Plan", "2026 full year · variance " + (vr >= 0 ? "+" : "") + fmt.m(vr) + " M (" + fmt.pct(T.pct, 1) + " of plan)"), "tall"), [
      { label: "Spend Plan 2026", value: T.plan, total: true, color: S.plan },
      { label: "Year-end Forecast Plan", value: T.landing, total: true, color: S.invoice }], TARGET * T.plan);
    var rowsF = spAll.filter(function (r) { var o = projAll.filter(function (x) { return x.ID === String(r.ID); })[0]; return o && passes(o, defs, st); });
    var mm = monthly(rowsF), labels = mm.map(function (o) { return fmt.month(o.month); }), ci = mm.map(function (o) { return o.month; }).indexOf(cut);
    var actLine = [], a2 = 0; mm.forEach(function (o, i) { a2 += o.act; actLine.push(i <= ci ? a2 : null); });
    U.chart(chartBox(panelIn(g1, "Year-end S-curve", "Cumulative Spend Plan vs Forecast Plan (invoicing plan) · actual to " + esc(fmt.month(cut)) + " for reference · click a month for the project split"), "tall"), U.clickable({ type: "line",
      data: { labels: labels, datasets: [
        U.lineDs("Spend Plan (cum)", mm.map(function (o) { return o.planC; }), S.plan, { pointRadius: 3, borderWidth: 2.5 }),
        U.lineDs("Forecast Plan (cum)", mm.map(function (o) { return o.invC; }), S.invoice, { pointRadius: 3, borderWidth: 2.5, borderDash: [7, 5] }),
        U.lineDs("Actual (cum, reference)", actLine, S.actual, { pointRadius: 3, borderWidth: 2, spanGaps: false }),
        U.lineDs(Math.round(TARGET * 100) + "% target", mm.map(function () { return TARGET * T.plan; }), C.red, { borderDash: [4, 4], borderWidth: 1, pointRadius: 0 })] },
      options: { plugins: { tooltip: U.moneyTooltip() }, interaction: { mode: "index", intersect: false }, scales: { x: U.catAxis(), y: U.moneyAxis() } } },
      function (i) { monthModal(D, rowsF, mm[i].month); }));

    // Project contribution to the year-end variance
    var g2 = grid(v, "g-2-1");
    var byV = projX.filter(function (o) { return o.plan || o.landing; }).sort(function (a, b) { return a.variance - b.variance; });
    var names = byV.map(function (o) { return o.name; });
    var vb = chartBox(panelIn(g2, "Year-end variance by project", "Forecast Plan − Spend Plan · red = under-spend, blue = over · click to filter")); vb.style.height = Math.max(320, names.length * 26 + 60) + "px";
    hbar(vb, names, [U.barDs("Year-end variance", byV.map(function (o) { return o.variance; }),
      byV.map(function (o) { var c0 = o.variance < 0 ? C.red : C.blue; return st.proj.length && st.proj.indexOf(o.name) < 0 ? U.fade(c0) : c0; }), { maxBarThickness: 18 })],
      function (i, e) { pick(ctx, "proj", names[i], e); });
    var rx = projAll.filter(function (o) { return passes(o, defs, st, "out"); }), outs = U.uniq(rx.map(function (o) { return o.status; })).sort(byOrder(OUT_ORDER));
    var ob = chartBox(panelIn(g2, "Projects by year-end outlook", "On track ≥ 95% of plan · at risk 85–95% · behind < 85% · click to filter"));
    U.chart(ob, U.clickable({ type: "bar", data: { labels: outs, datasets: [
      U.barDs("Projects", outs.map(function (s) { return rx.filter(function (o) { return o.status === s; }).length; }), outs.map(function (s) { var c0 = OUT_COLOR[s] || C.slate; return st.out.length && st.out.indexOf(s) < 0 ? U.fade(c0) : c0; }), { maxBarThickness: 26 })] },
      options: { indexAxis: "y", plugins: { legend: { display: false }, datalabels: { display: true, anchor: "end", align: "end", color: C.black, font: { weight: "700" } } },
        layout: { padding: { right: 24 } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: "rgba(200,201,199,.5)" } }, y: { grid: { display: false } } } } },
      function (i, e) { pick(ctx, "out", outs[i], e); }));

    // Invoice schedule (Gantt by month)
    var ip = panelIn(v, "Invoice schedule 2026", "One bar per invoice-related activity, grouped by project · click a bar for details, a project heading to filter");
    invoiceGantt(ip, proj.slice().sort(function (a, b) { return b.plan - a.plan; }), months, cut, function (o, e) { pick(ctx, "proj", o.name, e); });

    // Project table
    var tp = panelIn(v, "Year-end outlook by project", proj.length + " projects · click a row to filter");
    tableIn(tp, { rows: proj, exportName: "Year_End_Outlook_Projects", totals: true, sort: { key: "variance", dir: 1 }, maxHeight: 640,
      onRow: function (o, e) { pick(ctx, "proj", o.name, e); }, rowTitle: "Filter by this project",
      rowClass: function (o) { return st.proj.indexOf(o.name) >= 0 ? "selected" : ""; },
      columns: [{ key: "ID", label: "ID", nowrap: true }, { key: "name", label: "Project", nowrap: true }, { key: "kpi", label: "KPI", nowrap: true },
        { key: "plan", label: "Spend Plan 2026", type: "money", total: "sum" }, { key: "planYtd", label: "YTD Plan", type: "money", total: "sum" },
        { key: "fcYtd", label: "YTD Forecast Plan", type: "money", total: "sum" }, { key: "act", label: "YTD Actual (ref.)", type: "money", total: "sum" },
        { key: "fcRem", label: "Forecast Plan remaining", type: "money", total: "sum" },
        { key: "landing", label: "Year-end Forecast Plan", type: "money", total: "sum" }, { key: "variance", label: "Variance (forecast − plan)", type: "money", signed: true, total: "sum" },
        { key: "pct", label: "Forecast ÷ plan", type: "meter" }, { key: "status", label: "Outlook", type: "badge" }] });
  };

  function outlookModal(list) {
    tableModal("Year-end outlook by project", list, [{ key: "ID", label: "ID" }, { key: "name", label: "Project" },
      { key: "plan", label: "Spend Plan", type: "money", total: "sum" }, { key: "act", label: "YTD Actual", type: "money", total: "sum" },
      { key: "fcRem", label: "Forecast remaining", type: "money", total: "sum" }, { key: "landing", label: "Year-end Forecast Plan", type: "money", total: "sum" },
      { key: "variance", label: "Variance", type: "money", signed: true, total: "sum" }, { key: "status", label: "Outlook", type: "badge" }],
      { totals: true, autoHeight: true, sort: { key: "variance", dir: 1 } });
  }

  /**
   * Invoice Gantt: one bar per invoice-related activity, stacked under its project.
   * Up to the actuals cut-off a bar shows the actual spend (yellow); a past activity with no actual is flagged
   * "not invoiced". After the cut-off it shows the contractor Forecast Plan (slate). Milestones sit on the project row.
   */
  function invoiceGantt(host, list, months, cut, onProj) {
    var items = [];
    list.forEach(function (o) {
      var acts = [];
      months.forEach(function (m) {
        var c = o.months[m]; if (!c) return;
        if (c.text) acts.push({ kind: "inv", o: o, m: m, c: c, label: c.text, val: c.past ? c.act : c.fc, miss: c.past && !(c.act > 0) });
      });
      var ms = months.filter(function (m) { return o.months[m] && o.months[m].ms; }).map(function (m) { return { m: m, label: o.months[m].ms }; });
      if (acts.length) items.push({ o: o, acts: acts, ms: ms });
    });
    if (!items.length) { add(host, '<div class="empty">No invoice-related activities for the current filters.</div>'); return; }
    var n = months.length, ci = months.indexOf(cut);
    function left(i) { return (i / n * 100).toFixed(4) + "%"; }
    var gridL = months.map(function (m, i) { return '<span class="g-grid" style="left:' + left(i) + '"></span>'; }).join("") +
      (ci >= 0 ? '<span class="g-today" style="left:' + left(ci + 1) + '" title="Actuals cut-off ' + esc(fmt.month(cut)) + '"></span>' : "");
    var h = '<div class="g-legend"><span><i style="background:' + C.yellow + '"></i>Actual (invoiced)</span><span><i class="fc-sw"></i>Forecast Plan (contractor)</span>' +
      '<span><i style="background:#fff;outline:2px dashed ' + C.red + ';outline-offset:-2px"></i>✕ Past activity not invoiced</span><span><b class="pg-dia" style="position:static;display:inline-block"></b>Milestone (on the project row)</span>' +
      '<span><i style="background:' + C.yellow + ';width:3px"></i>Actuals cut-off ' + esc(fmt.month(cut)) + "</span></div>";
    h += '<div class="gantt iv"><div class="gantt-inner"><div class="iv-row g-head"><div>Project / invoice activity</div><div>Month</div><div class="num">M SAR</div><div class="g-track"><div class="g-months">' +
      months.map(function (m, i) { return '<span class="' + (m === cut ? "cut" : "") + '" style="left:' + left(i) + ";width:" + (100 / n).toFixed(4) + '%">' + esc(fmt.month(m)) + "</span>"; }).join("") + "</div></div></div>";
    var all = [];
    items.forEach(function (it, pi) {
      var o = it.o, inv = it.acts;
      var msH = it.ms.map(function (x) { return '<b class="pg-dia iv-ms" style="left:' + left(months.indexOf(x.m) + 0.5) + '" title="' + esc("Milestone · " + fmt.month(x.m) + " · " + x.label) + '"></b>'; }).join("");
      h += '<div class="iv-row iv-p" data-p="' + pi + '" title="Click to filter by this project"><div><b>' + esc(o.name) + '</b> <span class="muted">' + esc(o.ID) + "</span> " + U.badge(o.status) +
        '<small>' + inv.length + " invoice activities · plan " + fmt.m(o.plan, 1) + " M · Forecast Plan " + fmt.m(o.landing, 1) + " M · YTD Plan " + fmt.m(o.planYtd, 1) +
          " M · YTD Actual " + '<b class="' + (o.act < o.planYtd ? "neg" : "pos") + '">' + fmt.m(o.act, 1) + " M</b>" + (o.planYtd ? " (" + fmt.pct(o.act / o.planYtd, 1) + ")" : "") + '</small></div><div></div><div class="num"></div><div class="g-track">' + gridL + msH + "</div></div>";
      it.acts.forEach(function (a) {
        var i = months.indexOf(a.m), idx = all.push(a) - 1;
        var tip = a.label + " | " + fmt.month(a.m) + " | Plan " + fmt.money(a.c.plan) + " · Forecast Plan " + fmt.money(a.c.fc) + (a.c.past ? " · Actual " + fmt.money(a.c.act) : "");
        var bar = '<span class="iv-bar ' + (a.miss ? "miss" : a.c.past ? "act" : "fc") + '" style="left:calc(' + left(i) + ' + 3px);width:calc(' + (100 / n).toFixed(4) + '% - 6px)">' + (a.miss ? "✕" : fmt.m(a.val, 1)) + "</span>";
        h += '<div class="iv-row iv-a" data-a="' + idx + '" title="' + esc(tip) + '"><div class="iv-lab">' + esc(a.label) + "</div><div>" + esc(fmt.month(a.m)) +
          '</div><div class="num">' + (a.miss ? '<span class="neg">0.0</span>' : fmt.m(a.val, 1)) + '</div><div class="g-track">' + gridL + bar + "</div></div>";
      });
    });
    h += '</div></div><div class="pc-note">Each bar is one invoice-related activity from the Spending Plan (Invoice Related Activities column), placed in its month. Values in M SAR: actual spend up to ' +
      esc(fmt.month(cut)) + ", contractor Forecast Plan after it. Milestones come from the Spending Plan Milestones column.</div>";
    var node = add(host, "<div>" + h + "</div>");
    node.querySelectorAll(".iv-p").forEach(function (p) { p.addEventListener("click", function (e) { onProj(items[+p.getAttribute("data-p")].o, e); }); });
    node.querySelectorAll(".iv-a").forEach(function (r) { r.addEventListener("click", function () {
      var a = all[+r.getAttribute("data-a")], x = a.c, o = a.o;
      U.modal(o.name + " — " + fmt.month(a.m), '<div class="kv">' + [["Project", esc(o.ID + " — " + o.name)], ["Month", esc(fmt.month(a.m))], ["Invoice-related activity", esc(x.text || "—")],
        ["Milestone", esc(x.ms || "—")], ["Spend Plan", fmt.money(x.plan) + " SAR"], ["Forecast Plan (contractor)", fmt.money(x.fc) + " SAR"],
        ["Actual spend", x.past ? fmt.money(x.act) + " SAR" : "Not yet (after the " + esc(fmt.month(cut)) + " cut-off)"]].map(function (p) { return "<div>" + p[0] + "</div><div>" + p[1] + "</div>"; }).join("") + "</div>");
    }); });
  }

  /* ======================================================================
     SPI Year-End Outlook — how the Schedule Performance Index KPI closes 2026.
     EV = contract value × cumulative actual %, PV = contract value × cumulative
     planned %, portfolio SPI = ΣEV ÷ ΣPV. PV at 31-Dec comes from each project's
     S-curve; EV at 31-Dec from the chosen scenario. Data: Weekly_Report_Updates,
     S_Curve, KPI_Summary (KPI "Schedule performance index").
     ====================================================================== */
  var DAY = 864e5;
  function isoOf(n) { return new Date(n).toISOString().slice(0, 10); }
  var SPI_SCEN = [["trend", "Current trend"], ["const", "Same SPI"], ["plan", "Recover to plan"]];
  P["spi-outlook"] = function (ctx) {
    var D = ctx.D, v = ctx.view, st = ctx.state;
    var wkAll = D.t("Weekly_Report_Updates").filter(function (r) { return r["Source.Name"] && N(r["Contract Value"]); });
    if (!wkAll.length) { add(v, '<div class="empty">No weekly report data.</div>'); return; }
    var kpi = D.t("KPI_Summary").filter(function (r) { return /schedule performance/i.test(r["Objective/ KPIs"] || ""); })[0] || {};
    var TGT = N(kpi["NSR Spend Plan 2026 as per Budgeting"]) || 0.9, W = N(kpi["KPI Weight (%)"]) || 0, repSpi = N(kpi["YTD Actual"]);
    var dd = wkAll.map(function (r) { return r["Report Date"]; }).filter(Boolean).sort().pop(), ddn = dnum(dd);
    var yEnd = dd.slice(0, 4) + "-12-31", yEndN = dnum(yEnd), y0 = dnum(dd.slice(0, 4) + "-01-01");
    st.scen = st.scen || "trend"; st.win = st.win || 8;

    // S-curve series per project
    // One row per project and date. Some S-curve sheets repeat a date (old + revised baseline); keep the live row,
    // i.e. the one carrying actual / forecast / weekly figures, else the first.
    var ser = {}, seen = {};
    function live(r) { return ["Cum Actual (%)", "Cum Forecast (%)", "This Week Plan (%)", "This Week Actual (%)"].filter(function (k) { return N(r[k]) != null; }).length; }
    D.t("S_Curve").forEach(function (r) {
      var s = r["Source.Name"], n = dnum(r["Report Date"]); if (!s || !n) return;
      var k = s + "|" + n, rec = { n: n, plan: N(r["Cum Plan (%)"]), act: N(r["Cum Actual (%)"]), w: live(r) };
      if (seen[k]) { if (rec.w > seen[k].w) Object.assign(seen[k], rec); return; }
      seen[k] = rec; (ser[s] = ser[s] || []).push(rec);
    });
    Object.keys(ser).forEach(function (k) { ser[k].sort(function (a, b) { return a.n - b.n; }); });
    function lastAt(list, t, key) { var x = null; for (var i = 0; i < list.length && list[i].n <= t; i++) if (list[i][key] != null) x = list[i][key]; return x; }

    var projAll = wkAll.map(function (r) {
      var s = ser[r["Source.Name"]] || [], cv = N(r["Contract Value"]);
      var o = { src: r["Source.Name"], code: String(r["Project Code"] || ""), name: r["Project Name"], contractor: r.Contractor, status: r["Performance Status"] || "—",
        pm: r["Project Manager"], phase: r["Current Phase"], cv: cv, planNow: N(r["Planned (%) - Cumulative"]) || 0, actNow: N(r["Actual (%) - Cumulative"]) || 0, s: s };
      o.start = s.length ? s[0].n : null;
      o.planAt = function (t) { if (t >= ddn - 3 * DAY && t <= ddn) return o.planNow; var p = lastAt(s, t, "plan"); return p == null ? (t >= ddn ? o.planNow : 0) : Math.max(p, t > ddn ? o.planNow : 0); };
      o.actAt = function (t) { if (t >= ddn - 3 * DAY) return o.actNow; var a = lastAt(s, t, "act"); return a == null ? 0 : a; };
      var past = ddn - st.win * 7 * DAY, a0 = lastAt(s, past, "act");
      o.rate = a0 == null ? 0 : Math.max(0, (o.actNow - a0) / st.win);          // % per week over the trend window
      o.spiNow = o.planNow ? o.actNow / o.planNow : null;
      o.proj = function (t, sc) {                                           // projected cumulative actual % at t (t ≥ data date)
        var w = (t - ddn) / (7 * DAY), p = o.planAt(t);
        var x = sc === "trend" ? o.actNow + o.rate * w : sc === "const" ? (o.spiNow == null ? o.actNow : o.spiNow * p) : o.actNow + Math.max(0, p - o.planNow);
        return Math.max(o.actNow, Math.min(1, x));
      };
      o.pvNow = cv * o.planNow; o.evNow = cv * o.actNow;
      o.planDec = o.planAt(yEndN); o.pvDec = cv * o.planDec;
      o.actDec = o.proj(yEndN, st.scen); o.evDec = cv * o.actDec;
      o.spiDec = o.pvDec ? o.evDec / o.pvDec : null;
      o.gapDec = TGT * o.pvDec - o.evDec;
      o.outlook = o.spiDec == null ? "No plan" : o.spiDec >= TGT ? "On track" : o.spiDec >= TGT - 0.1 ? "At risk" : "Behind schedule";
      return o;
    });
    var defs = [
      { key: "status", label: "Performance Status", options: U.uniq(projAll.map(function (o) { return o.status; })).sort(), get: function (o) { return o.status; } },
      { key: "out", label: "Dec-26 outlook", options: ["Behind schedule", "At risk", "On track", "No plan"].filter(function (x) { return projAll.some(function (o) { return o.outlook === x; }); }), get: function (o) { return o.outlook; } },
      { key: "con", label: "Contractor", options: U.uniq(projAll.map(function (o) { return o.contractor; })).sort(), get: function (o) { return o.contractor; } },
      { key: "pm", label: "Project Manager", options: U.uniq(projAll.map(function (o) { return o.pm; })).sort(), get: function (o) { return o.pm; } },
      { key: "proj", label: "Project", options: U.uniq(projAll.map(function (o) { return o.name; })).sort(), get: function (o) { return o.name; } }];
    var f = filterBar(ctx, defs, projAll);
    var ctl = add(v, '<div class="filters pg-ctl"></div>');
    ctl.appendChild(seg("Year-end scenario", SPI_SCEN, st.scen, function (x) { st.scen = x; ctx.rerender(); }));
    ctl.appendChild(seg("Trend window", [[4, "4 weeks"], [8, "8 weeks"], [12, "12 weeks"]], st.win, function (x) { st.win = x; ctx.rerender(); }));
    add(ctl, '<div class="seg-help">' + ({ trend: "Each project keeps its average weekly progress of the last " + st.win + " weeks until 31-Dec.",
      const: "Each project keeps today's SPI: actual grows in line with its planned progress.",
      plan: "From now on each project achieves exactly its planned weekly progress (no further slippage, no catch-up)." })[st.scen] + "</div>");

    var proj = projAll.filter(function (o) { return passes(o, defs, f); }), projX = projAll.filter(function (o) { return passes(o, defs, f, "proj"); });
    function tot(list, k) { return list.reduce(function (s, o) { return s + (o[k] || 0); }, 0); }
    var T = { pv: tot(proj, "pvNow"), ev: tot(proj, "evNow"), pvD: tot(proj, "pvDec"), evD: tot(proj, "evDec") };
    T.spi = T.pv ? T.ev / T.pv : null; T.spiD = T.pvD ? T.evD / T.pvD : null; T.gap = TGT * T.pvD - T.evD;
    var ach = T.spiD != null ? Math.min(1, T.spiD / TGT) : null, achNow = T.spi != null ? Math.min(1, T.spi / TGT) : null;
    function spiTxt(x) { return x == null ? "—" : x.toFixed(2); }
    function spiCol(x) { return x == null ? "slate" : x >= TGT ? "" : x >= TGT - 0.1 ? "yellow" : "red"; }
    var below = proj.filter(function (o) { return o.spiDec != null && o.spiDec < TGT; }).length;

    var g = grid(v, "g-6");
    g.innerHTML = U.tile({ value: spiTxt(T.spi), label: "SPI today", color: spiCol(T.spi), note: "ΣEV " + fmt.m(T.ev, 1) + " M ÷ ΣPV " + fmt.m(T.pv, 1) + " M · " + esc(fmt.date(dd)) }) +
      U.tile({ value: TGT.toFixed(2), label: "KPI target", color: "black", note: "KPI sheet: SPI " + (repSpi != null ? repSpi.toFixed(2) : "—") + " · " + fmt.pct(N(kpi["% Achieved"]), 1) + " achieved" }) +
      U.tile({ value: spiTxt(T.spiD), label: "Projected SPI " + fmt.month(yEnd), color: spiCol(T.spiD), note: esc(SPI_SCEN.filter(function (s) { return s[0] === st.scen; })[0][1]) + " · ΣEV " + fmt.m(T.evD, 1) + " ÷ ΣPV " + fmt.m(T.pvD, 1) + " M" }) +
      U.tile({ value: fmt.pct(ach, 1), label: "Projected KPI achievement", color: ach >= 1 ? "" : ach >= 0.9 ? "yellow" : "red", note: "KPI result " + fmt.pct(ach != null ? ach * W : null, 1) + " of " + fmt.pct(W, 0) + " · today " + fmt.pct(achNow, 1) }) +
      U.tile({ value: T.gap > 0 ? fmt.m(T.gap) : "0.00", unit: "M SAR", label: T.gap > 0 ? "EV gap to target" : "Target met", color: T.gap > 0 ? "red" : "mid",
        note: T.gap > 0 ? "Extra earned value needed by 31-Dec for SPI " + TGT.toFixed(2) : "Headroom " + fmt.m(-T.gap) + " M of earned value" }) +
      U.tile({ value: below + " / " + proj.length, label: "Projects below target", color: below ? "red" : "slate", note: "Projected SPI < " + TGT.toFixed(2) + " at 31-Dec · click to filter" });
    clickTiles(g, [null, null, null, null, null, function () { var s = sel(ctx, "out"); s.length = 0; ["Behind schedule", "At risk"].forEach(function (x) { if (projAll.some(function (o) { return o.outlook === x; })) s.push(x); }); ctx.rerender(); }]);

    add(v, '<div class="note-box ol-lead"><b>How SPI is calculated:</b> for every project <b>EV</b> = contract value × cumulative actual % and <b>PV</b> = contract value × cumulative planned % ' +
      "(weekly report, S-curve). <b>Portfolio SPI = ΣEV ÷ ΣPV</b>, so larger contracts weigh more. KPI <b>% achieved = SPI ÷ target " + TGT.toFixed(2) +
      "</b> (max 100%) and <b>KPI result = weight " + fmt.pct(W, 0) + " × % achieved</b>. Year-end: PV on 31-Dec uses each project's planned S-curve; EV uses the scenario above.</div>");

    // weekly timeline: history from 1-Jan, projection to 31-Dec
    var pts = [];
    for (var t = ddn; t >= y0; t -= 7 * DAY) pts.unshift(t);
    for (t = ddn + 7 * DAY; t < yEndN; t += 7 * DAY) pts.push(t);
    pts.push(yEndN);
    function portAt(t, sc) {
      var pv = 0, ev = 0;
      proj.forEach(function (o) { if (o.start != null && o.start > t && t < ddn) return; var p = o.planAt(t); pv += o.cv * p; ev += o.cv * (t <= ddn ? o.actAt(t) : o.proj(t, sc)); });
      return { pv: pv, ev: ev, spi: pv ? ev / pv : null };
    }
    var hist = pts.map(function (t) { return t <= ddn ? portAt(t) : null; });
    var scen = {}; SPI_SCEN.forEach(function (s) { scen[s[0]] = pts.map(function (t) { return t >= ddn ? portAt(t, s[0]) : null; }); });
    var labs = pts.map(function (t) { return fmt.date(isoOf(t)).slice(0, 6); });
    var g1 = grid(v, "g-2");
    var sds = [U.lineDs("SPI actual", hist.map(function (x) { return x && x.spi; }), S.plan, { borderWidth: 3, pointRadius: 2, spanGaps: false })];
    SPI_SCEN.forEach(function (s) {
      var on = s[0] === st.scen;
      sds.push(U.lineDs("Projection — " + s[1], scen[s[0]].map(function (x) { return x && x.spi; }), on ? C.black : C.gray, { borderDash: [7, 5], borderWidth: on ? 2.5 : 1.5, pointRadius: on ? 2 : 0, spanGaps: false }));
    });
    sds.push(U.lineDs("Target " + TGT.toFixed(2), pts.map(function () { return TGT; }), C.red, { borderDash: [4, 4], borderWidth: 1.2, pointRadius: 0 }));
    U.chart(chartBox(panelIn(g1, "Portfolio SPI — " + dd.slice(0, 4), "Weekly ΣEV ÷ ΣPV · solid = actual to " + esc(fmt.date(dd)) + ", dashed = projection to 31-Dec (bold = selected scenario)"), "tall"),
      { type: "line", data: { labels: labs, datasets: sds },
        options: { interaction: { mode: "index", intersect: false }, plugins: { tooltip: { callbacks: { label: function (c) { return c.parsed.y == null ? null : " " + c.dataset.label + ": " + c.parsed.y.toFixed(3); } } } },
          scales: { x: Object.assign(U.catAxis(), { ticks: { autoSkip: true, maxTicksLimit: 14 } }), y: { suggestedMin: 0.6, suggestedMax: 1.1, grid: { color: "rgba(200,201,199,.5)" }, ticks: { callback: function (x) { return x.toFixed(2); } } } } } });
    var sel0 = scen[st.scen];
    U.chart(chartBox(panelIn(g1, "Earned value vs planned value", "Cumulative M SAR · PV from the planned S-curves, EV actual then projected (" + esc(SPI_SCEN.filter(function (s) { return s[0] === st.scen; })[0][1]) + ")"), "tall"),
      { type: "line", data: { labels: labs, datasets: [
        U.lineDs("Planned value (PV)", pts.map(function (t, i) { return (hist[i] || sel0[i] || {}).pv; }), S.plan, { borderWidth: 2.5, pointRadius: 0 }),
        U.lineDs("Earned value (EV)", hist.map(function (x) { return x && x.ev; }), S.actual, { borderWidth: 3, pointRadius: 0, spanGaps: false }),
        U.lineDs("EV projection", sel0.map(function (x) { return x && x.ev; }), S.actual, { borderDash: [7, 5], borderWidth: 2.5, pointRadius: 0, spanGaps: false }),
        U.lineDs("EV needed for SPI " + TGT.toFixed(2), sel0.map(function (x) { return x && x.pv * TGT; }), C.red, { borderDash: [4, 4], borderWidth: 1.2, pointRadius: 0, spanGaps: false })] },
        options: { interaction: { mode: "index", intersect: false }, plugins: { tooltip: U.moneyTooltip() }, scales: { x: Object.assign(U.catAxis(), { ticks: { autoSkip: true, maxTicksLimit: 14 } }), y: U.moneyAxis() } } });

    // by project
    var g2 = grid(v, "g-2");
    var byS = projX.slice().sort(function (a, b) { return (a.spiDec == null ? 9 : a.spiDec) - (b.spiDec == null ? 9 : b.spiDec); }), names = byS.map(function (o) { return o.name; });
    var b1 = chartBox(panelIn(g2, "SPI by project — today vs " + fmt.month(yEnd), "Target " + TGT.toFixed(2) + " · red = below target · click a project to filter"));
    b1.style.height = Math.max(300, names.length * 34 + 70) + "px";
    function colS(x, faded) { var c0 = x == null ? C.gray : x >= TGT ? C.blue : x >= TGT - 0.1 ? C.yellow : C.red; return faded ? U.fade(c0) : c0; }
    function fd(o) { return f.proj.length && f.proj.indexOf(o.name) < 0; }
    hbar(b1, names, [U.barDs("SPI today", byS.map(function (o) { return o.spiNow; }), byS.map(function (o) { return colS(o.spiNow, fd(o)); }), { maxBarThickness: 12 }),
      U.fcBar("SPI " + fmt.month(yEnd) + " (projected)", byS.map(function (o) { return o.spiDec; }), byS.map(function (o) { return colS(o.spiDec, fd(o)); }), { maxBarThickness: 12 })],
      function (i, e) { pick(ctx, "proj", names[i], e); }, { beginAtZero: true, suggestedMax: 1.2, grid: { color: "rgba(200,201,199,.5)" }, ticks: { callback: function (x) { return x.toFixed(1); } } },
      { callbacks: { label: function (c) { return " " + c.dataset.label + ": " + (c.parsed.x == null ? "—" : c.parsed.x.toFixed(2)); } } });
    var byG = projX.slice().sort(function (a, b) { return b.gapDec - a.gapDec; }), gn = byG.map(function (o) { return o.name; });
    var b2 = chartBox(panelIn(g2, "Contribution to the SPI target at " + fmt.month(yEnd), "EV − " + TGT.toFixed(2) + " × PV (M SAR) · red = pulls the portfolio below target · click to filter"));
    b2.style.height = Math.max(300, gn.length * 34 + 70) + "px";
    hbar(b2, gn, [U.barDs("EV surplus / shortfall vs target", byG.map(function (o) { return -o.gapDec; }), byG.map(function (o) { var c0 = o.gapDec > 0 ? C.red : C.blue; return fd(o) ? U.fade(c0) : c0; }), { maxBarThickness: 18 })],
      function (i, e) { pick(ctx, "proj", gn[i], e); });

    // table
    var tp = panelIn(v, "SPI outlook by project", proj.length + " projects · data date " + esc(fmt.date(dd)) + " · click a row for the project");
    tableIn(tp, { rows: proj, exportName: "SPI_Year_End_Outlook", totals: true, sort: { key: "spiDec", dir: 1 }, maxHeight: 640,
      onRow: function (o) { quickView(D, o.code); }, rowTitle: "Open project",
      columns: [{ key: "code", label: "Code", nowrap: true }, { key: "name", label: "Project", wrap: true },
        { key: "cv", label: "Contract value", type: "money", total: "sum" }, { key: "planNow", label: "Plan % today", type: "meter", meterCls: "plan" }, { key: "actNow", label: "Actual % today", type: "meter" },
        { key: "pvNow", label: "PV today", type: "money", total: "sum" }, { key: "evNow", label: "EV today", type: "money", total: "sum" },
        { key: "spiNow", label: "SPI today", type: "dec", render: function (x) { return '<span class="' + (x != null && x < TGT ? "neg" : "pos") + '">' + spiTxt(x) + "</span>"; } },
        { key: "rate", label: "Trend %/wk", render: function (x) { return fmt.pct(x, 2); } },
        { key: "planDec", label: "Plan % 31-Dec", type: "pct" }, { key: "actDec", label: "Actual % 31-Dec", type: "pct" },
        { key: "pvDec", label: "PV 31-Dec", type: "money", total: "sum" }, { key: "evDec", label: "EV 31-Dec", type: "money", total: "sum" },
        { key: "spiDec", label: "SPI 31-Dec", type: "dec", render: function (x) { return '<span class="' + (x != null && x < TGT ? "neg" : "pos") + '">' + spiTxt(x) + "</span>"; } },
        { key: "gapDec", label: "EV gap to target", type: "money", total: "sum", render: function (x) { return x > 0 ? '<span class="neg">' + fmt.money(x) + "</span>" : '<span class="pos">' + fmt.money(x) + "</span>"; } },
        { key: "outlook", label: "Outlook", type: "badge" }] });
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
     Project Cards + Portfolio Master Plan
     (monthly "EP – NSR Projects <Month>.xlsx", one Project_Cards record per card)
     ====================================================================== */
  var PHASE_ORDER = ["Creation", "Initiation", "Planning", "Tendering", "Execution", "Handover", "Closing (TOC)", "Closing (FCC)", "Closed", "Not set"];
  function phaseRank(s) { s = String(s || "Not set"); for (var i = 0; i < PHASE_ORDER.length; i++) if (s.indexOf(PHASE_ORDER[i]) === 0) return i; return 50; }
  var STATUS_ORDER = ["On Track", "Slightly Delayed", "At Risk", "Delayed", "On Hold"];
  var STATUS_COLOR = { "On Track": C.blue, "Slightly Delayed": C.mid, "At Risk": C.yellow, "Delayed": C.red, "On Hold": C.slate };
  var RISK_ORDER = ["Low Risk", "Needs Attention", "Medium Risk", "High Risk"];
  function byOrder(order) { return function (a, b) { var x = order.indexOf(a), y = order.indexOf(b); return (x < 0 ? 99 : x) - (y < 0 ? 99 : y) || String(a).localeCompare(String(b)); }; }
  function cardsOf(D) { return D.t("Project_Cards").filter(function (c) { return c && c.Code; }).slice().sort(function (a, b) { return String(a.Code).localeCompare(String(b.Code)); }); }
  function cardLabel(c) { return c.Code + " — " + c.Name; }
  function aPhase(c) { return c.ActualPhase || "Not set"; }
  function pf(c, k) { return (c.Perf || {})[k]; }
  function dataDate(cards) { return cards.map(function (c) { return (c.Exec || {}).ReportingPeriod; }).filter(Boolean).sort().pop() || null; }
  function days(a, b) { var x = dnum(a), y = dnum(b); return x != null && y != null ? Math.round((y - x) / 864e5) : null; }
  function span(c) {  // project-level dates: the card's Total row, else the phases' extremes
    var t = c.Total || {}, tl = (c.Timeline || []).filter(function (r) { return r.Level === 1; });
    function ext(k, max) { var v = tl.map(function (r) { return r[k]; }).filter(Boolean).sort(); return v.length ? (max ? v[v.length - 1] : v[0]) : null; }
    return { BS: t.BS || ext("BS"), BE: t.BE || ext("BE", 1), RS: t.RS || ext("RS"), RE: t.RE || ext("RE", 1), FS: t.FS || ext("FS"), FE: t.FE || ext("FE", 1),
      Plan: t.Plan != null ? t.Plan : pf(c, "Planned"), Actual: t.Actual != null ? t.Actual : pf(c, "Actual") };
  }
  function slip(c) { var s = span(c); return days(s.RE || s.BE, s.FE); }
  /* Milestone state: "Status" = completed (Yes/No); the date column holds the actual date, or the forecast while open. */
  function msState(m, dd) {
    var done = /^y/i.test(m.Completed || ""), when = m.Actual || (done ? m.Planned : null);
    var ref = done ? when : (m.Actual || dd);
    var delay = m.Planned && ref ? days(m.Planned, ref) : null;
    var overdue = !done && m.Planned && dd && m.Planned < dd && !m.Actual;
    var state = done ? "Completed" : overdue || (m.Actual && m.Planned && m.Actual > m.Planned) ? "Late / overdue" : "Open";
    return { done: done, date: done ? when : (m.Actual || m.Planned), forecast: done ? null : m.Actual, delay: delay, state: state, overdue: overdue };
  }
  function openIssues(D, code) { return D.t("Issue_register").filter(function (r) { return String(r["Poject Code"]) === String(code) && !/resolved|closed/i.test(r["Issue Status"] || ""); }).length; }
  function openRisks(c) { return (c.Risks || []).filter(function (r) { return !/closed/i.test(r["Risk Status"] || ""); }).length; }

  function cardDefs(all) {
    function o(get, order) { var v = U.uniq(all.map(get)); return order ? v.sort(order) : v.sort(); }
    var d = [
      { key: "aph", label: "Actual Phase", get: aPhase },
      { key: "pph", label: "Planned Phase", get: function (c) { return c.PlannedPhase; } },
      { key: "status", label: "Overall Status", get: function (c) { return pf(c, "Status"); }, order: byOrder(STATUS_ORDER) },
      { key: "delay", label: "Delay Level", get: function (c) { return pf(c, "Delay"); } },
      { key: "risk", label: "Risk Level", get: function (c) { return pf(c, "Risk"); }, order: byOrder(RISK_ORDER) },
      { key: "pm", label: "Project Manager", get: function (c) { return (c.Stake || {}).PM; } },
      { key: "size", label: "Project Size", get: function (c) { return c.Size; } },
      { key: "type", label: "Project Type", get: function (c) { return c.Type; } },
      { key: "grp", label: "Project Group", get: function (c) { return c.Group; } },
      { key: "own", label: "Owner Dept.", get: function (c) { return (c.Stake || {}).Owner; } },
      { key: "crit", label: "Critical Project", get: function (c) { return (c.Fund || {}).Critical; } },
      { key: "proj", label: "Project", get: function (c) { return c.Code; }, display: null }];
    var byCode = {}; all.forEach(function (c) { byCode[c.Code] = c; });
    d[d.length - 1].display = function (code) { return byCode[code] ? cardLabel(byCode[code]) : code; };
    d.forEach(function (x) { x.options = o(x.get, x.order || (x.key === "aph" || x.key === "pph" ? function (a, b) { return phaseRank(a) - phaseRank(b); } : null)); });
    return d;
  }
  function noCards(v) {
    add(v, '<div class="note-box">No project cards loaded. Import <b>EP - NSR Projects &lt;Month&gt;.xlsx</b> on the <a href="#/import">Data Import</a> page — ' +
      "every <b>…_Project Card</b> sheet becomes one project here.</div>");
  }
  function kvHtml(pairs) {
    return '<div class="kv">' + pairs.map(function (p) { return p[0] === "h" ? "<h5>" + esc(p[1]) + "</h5>" : "<div>" + esc(p[0]) + "</div><div>" + (p[1] == null || p[1] === "" ? '<span class="muted">—</span>' : p[1]) + "</div>"; }).join("") + "</div>";
  }
  function seg(label, opts, value, onPick) {
    var n = el('<div class="filter seg-wrap"><label>' + esc(label) + '</label><div class="seg"></div></div>'), s = n.querySelector(".seg");
    opts.forEach(function (o) {
      var b = el('<button type="button" class="' + (o[0] === value ? "on" : "") + '">' + esc(o[1]) + "</button>");
      b.addEventListener("click", function () { onPick(o[0]); }); s.appendChild(b);
    });
    return n;
  }

  /* ----------------------------------------------------------------------
     Plan Gantt: rows = [{ key, level, label, sub, BS,BE, RS,RE, FS,FE, Plan, Actual, kids, open, ms[], data }]
     Bars: baseline (grey), revised baseline (slate), forecast/actual (blue, filled to actual %, red when later than baseline).
     ---------------------------------------------------------------------- */
  var MN3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function planGantt(host, rows, o) {
    o = o || {}; var show = o.show || { base: 1, rev: 1, fc: 1, ms: 1 };
    var ds = [];
    rows.forEach(function (r) {
      ["BS", "BE", "RS", "RE", "FS", "FE"].forEach(function (k) { var n = dnum(r[k]); if (n) ds.push(n); });
      (r.ms || []).forEach(function (m) { var n = dnum(m.date); if (n) ds.push(n); });
    });
    if (!ds.length) { add(host, '<div class="empty">No schedule dates to plot.</div>'); return; }
    var lo = o.range ? o.range[0] : Math.min.apply(null, ds), hi = o.range ? o.range[1] : Math.max.apply(null, ds);
    var m0 = new Date(lo), m1 = new Date(hi);
    var months = (m1.getUTCFullYear() - m0.getUTCFullYear()) * 12 + m1.getUTCMonth() - m0.getUTCMonth() + 1;
    var step = months <= 26 ? 1 : months <= 66 ? 3 : 12;
    var sm = Math.floor(m0.getUTCMonth() / step) * step;
    var t0 = Date.UTC(m0.getUTCFullYear(), sm, 1), t1 = Date.UTC(m1.getUTCFullYear(), m1.getUTCMonth() + 1, 1);
    var ticks = [], d = t0;
    while (d < t1) { ticks.push(d); var dt = new Date(d); d = Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + step, 1); }
    t1 = Math.max(t1, d);
    function pos(n) { return (n - t0) / (t1 - t0) * 100; }
    function x(n) { return Math.max(0, Math.min(100, pos(n))).toFixed(3) + "%"; }
    function bar(cls, a, b, inner, tip) {
      var s = dnum(a), e = dnum(b); if (!s || !e || e < t0 || s > t1) return "";
      if (e < s) { var t = s; s = e; e = t; }
      var l = Math.max(0, pos(s)), w = Math.max(0.25, Math.min(100, pos(e)) - l);
      return '<span class="pg-bar ' + cls + '" style="left:' + l.toFixed(3) + "%;width:" + w.toFixed(3) + '%"' + (tip ? ' title="' + esc(tip) + '"' : "") + ">" + (inner || "") + "</span>";
    }
    function lab(n) { var q = new Date(n); return step === 12 ? String(q.getUTCFullYear()) : step === 3 ? "Q" + (q.getUTCMonth() / 3 + 1) + " " + String(q.getUTCFullYear()).slice(2) : MN3[q.getUTCMonth()] + " " + String(q.getUTCFullYear()).slice(2); }
    var gridL = ticks.map(function (m) { return '<span class="g-grid' + (new Date(m).getUTCMonth() === 0 ? " yr" : "") + '" style="left:' + x(m) + '"></span>'; }).join("");
    var ddn = dnum(o.dd), today = ddn && ddn >= t0 && ddn <= t1 ? '<span class="g-today" style="left:' + x(ddn) + '"></span>' : "";
    var h = '<div class="g-legend">' +
      (show.base ? '<span><i style="background:' + C.gray + '"></i>Baseline</span>' : "") +
      (show.rev ? '<span><i style="background:' + C.slate + ';height:4px"></i>Revised baseline</span>' : "") +
      (show.fc ? '<span><i style="background:' + C.mid + '"></i>Forecast / actual</span><span><i style="background:' + C.blue + '"></i>Actual progress</span><span><i style="background:rgba(203,44,48,.35)"></i>Finishing later than baseline</span>' : "") +
      (show.ms ? '<span><b class="pg-dia done"></b>Milestone done</span><span><b class="pg-dia"></b>Milestone open</span><span><b class="pg-dia late"></b>Milestone late / overdue</span>' : "") +
      (today ? '<span><i style="background:' + C.yellow + ';width:3px"></i>Data date ' + esc(fmt.date(o.dd)) + "</span>" : "") + "</div>";
    h += '<div class="gantt pg"><div class="gantt-inner"><div class="pg-row g-head"><div>' + esc(o.nameHead || "Project / phase / activity") +
      '</div><div class="num">Start</div><div class="num">Finish</div><div class="num" title="Forecast finish − (revised) baseline finish, days">Slip d</div><div class="num">Plan</div><div class="num">Actual</div><div class="g-track"><div class="g-months">' +
      ticks.map(function (m) { return '<span style="left:' + x(m) + '">' + lab(m) + "</span>"; }).join("") + "</div></div></div>";
    rows.forEach(function (r, i) {
      if (r.group) { h += '<div class="pg-row pg-grp"><div>' + esc(r.label) + (r.sub ? ' <span class="muted">' + esc(r.sub) + "</span>" : "") + '</div><div class="g-track">' + gridL + today + "</div></div>"; return; }
      var sl = days(r.RE || r.BE, r.FE), late = sl != null && sl > 0, act = Math.max(0, Math.min(1, N(r.Actual) || 0));
      var tip = r.label + " | Baseline " + fmt.date(r.BS) + " → " + fmt.date(r.BE) + (r.RE && r.RE !== r.BE ? " | Revised → " + fmt.date(r.RE) : "") +
        " | Forecast/actual " + fmt.date(r.FS) + " → " + fmt.date(r.FE) + " | Plan " + fmt.pct(r.Plan, 0) + " · Actual " + fmt.pct(r.Actual, 0) + (sl != null ? " | Slip " + sl + " d" : "");
      h += '<div class="pg-row lv' + r.level + (r.kids ? " has-kids" : "") + (o.onLabel ? " clickable" : "") + '" data-i="' + i + '" title="' + esc(tip) + '"><div class="pg-name" style="padding-left:' + (8 + (r.level - 1) * 16) + 'px">' +
        (r.kids ? '<button type="button" class="pg-tog" data-t="' + i + '" aria-label="Expand">' + (r.open ? "▾" : "▸") + "</button>" : '<span class="pg-tog-sp"></span>') +
        '<span class="pg-lab">' + esc(r.label) + (r.sub ? ' <span class="muted">' + esc(r.sub) + "</span>" : "") + "</span></div>" +
        '<div class="num">' + esc(fmt.date(r.FS)) + '</div><div class="num">' + esc(fmt.date(r.FE)) + '</div><div class="num ' + (late ? "neg" : sl != null && sl < 0 ? "pos" : "") + '">' + (sl == null ? "" : (sl > 0 ? "+" : "") + fmt.int(sl)) +
        '</div><div class="num">' + fmt.pct(r.Plan, 0) + '</div><div class="num">' + fmt.pct(r.Actual, 0) + '</div><div class="g-track">' + gridL + today +
        (show.base ? bar("base", r.BS, r.BE) : "") + (show.rev && (r.RS !== r.BS || r.RE !== r.BE) ? bar("rev", r.RS, r.RE) : "") +
        (show.fc ? bar("fc" + (late ? " late" : ""), r.FS, r.FE, '<i style="width:' + (act * 100).toFixed(1) + '%"></i>') : "") +
        (show.ms ? (r.ms || []).map(function (m) {
          var n = dnum(m.date); if (!n || n < t0 || n > t1) return "";
          return '<b class="pg-dia ' + (m.done ? "done" : m.late ? "late" : "") + '" style="left:' + x(n) + '" title="' + esc(m.label + " — " + (m.done ? "completed " : m.late ? "late · " : "planned ") + fmt.date(m.date)) + '"></b>';
        }).join("") : "") + "</div></div>";
    });
    h += "</div></div>";
    var node = add(host, "<div>" + h + "</div>");
    node.querySelectorAll(".pg-tog").forEach(function (b) { b.addEventListener("click", function (e) { e.stopPropagation(); if (o.onToggle) o.onToggle(rows[+b.getAttribute("data-t")]); }); });
    if (o.onLabel) node.querySelectorAll(".pg-row[data-i]").forEach(function (rw) { rw.addEventListener("click", function () { o.onLabel(rows[+rw.getAttribute("data-i")]); }); });
    return node;
  }
  function msRows(c, dd, filter) {
    return (c.Milestones || []).map(function (m) { var s = msState(m, dd); return { label: m.Milestone, date: s.date, done: s.done, late: s.state === "Late / overdue" }; })
      .filter(function (m) { return m.date && (!filter || filter(m)); });
  }
  /** Phase rows (level `base`) and, when a phase is open, its activities (level base + 1). */
  function timelineRows(c, st, base) {
    var out = [], open = false, cur = null, tl = c.Timeline || [];
    tl.forEach(function (t, i) {
      if (t.Level === 1) {
        cur = t.Name;
        var key = c.Code + "|" + t.Name, kids = tl.some(function (x) { return x.Level === 2 && x.Phase === t.Name; });
        open = kids && st.isOpen(key);
        out.push(Object.assign({}, t, { key: key, level: base, label: t.Name, kids: kids, open: open, card: c }));
      } else if (open) out.push(Object.assign({}, t, { key: c.Code + "|" + cur + "|" + i, level: base + 1, label: t.Name, card: c }));
    });
    return out;
  }

  /* ----------------------------- Project Cards page ----------------------------- */
  P["project-cards"] = function (ctx) {
    var D = ctx.D, v = ctx.view, st = ctx.state, all = cardsOf(D);
    if (!all.length) { noCards(v); return; }
    var defs = cardDefs(all), f = filterBar(ctx, defs, all);
    var rows = all.filter(function (c) { return passes(c, defs, f); });
    var dd = dataDate(all);
    if (st.code && !all.some(function (c) { return c.Code === st.code; })) st.code = null;
    if (st.code) return cardDetail(ctx, all.filter(function (c) { return c.Code === st.code; })[0], rows.length ? rows : all, dd);

    function open(c) { st.code = c.Code; ctx.rerender(); window.scrollTo(0, 0); }
    var g = grid(v, "g-6");
    var bud = U.sum(rows, function (c) { return (c.Fund || {}).Budget; }), con = U.sum(rows, function (c) { return (c.Fund || {}).CON; }), paid = U.sum(rows, function (c) { return pf(c, "Paid"); });
    var avgP = rows.length ? U.sum(rows, function (c) { return pf(c, "Planned"); }) / rows.length : null, avgA = rows.length ? U.sum(rows, function (c) { return pf(c, "Actual"); }) / rows.length : null;
    var bad = rows.filter(function (c) { return /delayed|on hold/i.test(pf(c, "Status") || "") && !/slightly/i.test(pf(c, "Status") || ""); }).length;
    g.innerHTML = U.tile({ value: rows.length, label: "Projects", note: "Reporting period " + esc(fmt.month(dd)) }) +
      mTile("Budget", bud, "black") + mTile("Contract value (CON)", con, "mid") + mTile("Approved paid", paid, "slate") +
      U.tile({ value: fmt.pct(avgA, 0), label: "Avg actual progress", color: "yellow", note: "vs " + fmt.pct(avgP, 0) + " planned (simple average)" }) +
      U.tile({ value: bad, label: "Delayed / on hold", color: bad ? "red" : "slate", note: "Click to filter" });
    clickTiles(g, [function () { defs.forEach(function (d) { f[d.key].length = 0; }); ctx.rerender(); }, null, null, null, null, function () {
      var s = sel(ctx, "status"); s.length = 0; U.uniq(all.map(function (c) { return pf(c, "Status"); })).filter(function (x) { return /^delayed|on hold/i.test(x || ""); }).forEach(function (x) { s.push(x); }); ctx.rerender(); }]);

    var g2 = grid(v, "g-3");
    function countChart(p, key, get, order, colorOf, horiz) {
      var rx = all.filter(function (c) { return passes(c, defs, f, key); });
      var labs = U.uniq(rx.map(get)).sort(order);
      var box = chartBox(p, "short");
      if (horiz) box.style.height = Math.max(200, labs.length * 30 + 40) + "px";
      U.chart(box, U.clickable({ type: "bar", data: { labels: labs, datasets: [U.barDs("Projects", labs.map(function (l) { return rx.filter(function (c) { return get(c) === l; }).length; }),
        labs.map(function (l) { var col = colorOf(l); return f[key].length && f[key].indexOf(l) < 0 ? U.fade(col) : col; }), { maxBarThickness: horiz ? 22 : 46 })] },
        options: { indexAxis: horiz ? "y" : "x", plugins: { legend: { display: false }, datalabels: { display: true, anchor: "end", align: "end", color: C.black, font: { weight: "700" } } },
          layout: { padding: horiz ? { right: 24 } : { top: 20 } },
          scales: horiz ? { x: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: "rgba(200,201,199,.5)" } }, y: { grid: { display: false } } }
            : { x: U.catAxis(), y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: "rgba(200,201,199,.5)" } } } } },
        function (i, e) { pick(ctx, key, labs[i], e); }));
    }
    countChart(panelIn(g2, "Projects by actual phase", "Click to filter"), "aph", aPhase, function (a, b) { return phaseRank(a) - phaseRank(b); }, function () { return C.blue; }, true);
    countChart(panelIn(g2, "Overall status", "Click to filter"), "status", function (c) { return pf(c, "Status"); }, byOrder(STATUS_ORDER), function (l) { return STATUS_COLOR[l] || C.slate; }, true);
    countChart(panelIn(g2, "Risk level", "Click to filter"), "risk", function (c) { return pf(c, "Risk"); }, byOrder(RISK_ORDER),
      function (l) { return /high/i.test(l) ? C.red : /medium|attention/i.test(l) ? C.yellow : C.blue; }, true);

    var pp = panelIn(v, "Planned vs actual progress", "Overall progress from each card (section 2) · click a project to open its card");
    var byGap = rows.slice().sort(function (a, b) { return ((pf(b, "Planned") || 0) - (pf(b, "Actual") || 0)) - ((pf(a, "Planned") || 0) - (pf(a, "Actual") || 0)); });
    var pb = chartBox(pp); pb.style.height = Math.max(260, byGap.length * 26 + 70) + "px";
    U.chart(pb, U.clickable({ type: "bar", data: { labels: byGap.map(cardLabel), datasets: [
      U.barDs("Planned", byGap.map(function (c) { return pf(c, "Planned"); }), S.plan, { maxBarThickness: 10 }),
      U.barDs("Actual", byGap.map(function (c) { return pf(c, "Actual"); }), S.actual, { maxBarThickness: 10 })] },
      options: { indexAxis: "y", plugins: { tooltip: U.pctTooltip() }, scales: { x: U.pctAxis(1), y: { grid: { display: false }, ticks: { callback: U.shortLabel(44) } } } } },
      function (i) { open(byGap[i]); }));

    var tp = panelIn(v, "Project cards", rows.length + " projects · sorted by the biggest progress gap · click a row to open the full card");
    tableIn(tp, { rows: byGap, exportName: "Project_Cards", maxHeight: 700, onRow: function (c) { open(c); }, rowTitle: function () { return "Open project card"; },
      columns: [
        { key: "Code", label: "Code", nowrap: true }, { key: "Name", label: "Project Name", wrap: true },
        { key: "PM", label: "Project Manager", get: function (c) { return (c.Stake || {}).PM; } },
        { key: "ActualPhase", label: "Actual Phase", get: aPhase }, { key: "PlannedPhase", label: "Planned Phase" },
        { key: "pl", label: "Planned %", type: "meter", meterCls: "plan", get: function (c) { return pf(c, "Planned"); } },
        { key: "ac", label: "Actual %", type: "meter", get: function (c) { return pf(c, "Actual"); } },
        { key: "st", label: "Overall Status", type: "badge", get: function (c) { return pf(c, "Status"); } },
        { key: "rk", label: "Risk Level", type: "badge", get: function (c) { return pf(c, "Risk"); } },
        { key: "bud", label: "Budget (M)", type: "m", get: function (c) { return (c.Fund || {}).Budget; } },
        { key: "be", label: "BL Finish", type: "date", get: function (c) { var s = span(c); return s.RE || s.BE; } },
        { key: "fe", label: "Forecast Finish", type: "date", get: function (c) { return span(c).FE; } },
        { key: "sl", label: "Slip (days)", type: "int", signed: true, get: slip },
        { key: "oi", label: "Open issues", type: "int", get: function (c) { return openIssues(D, c.Code); } },
        { key: "or", label: "Open risks", type: "int", get: openRisks }] });
  };

  function cardDetail(ctx, c, list, dd) {
    var D = ctx.D, v = ctx.view, st = ctx.state;
    // navigation: back · project picker (current filter) · previous / next
    if (!list.some(function (x) { return x.Code === c.Code; })) list = [c].concat(list);
    var at = list.map(function (x) { return x.Code; }).indexOf(c.Code);
    var nav = add(v, '<div class="filters pc-nav"></div>');
    var back = el('<button type="button" class="icon-btn ghost">← All projects</button>');
    back.addEventListener("click", function () { st.code = null; ctx.rerender(); });
    nav.appendChild(back);
    var s = U.select({ label: "Project (" + (at + 1) + " of " + list.length + ")", value: c.Code, options: list.map(function (x) { return { value: x.Code, label: cardLabel(x) }; }),
      onChange: function (x) { st.code = x; ctx.rerender(); } });
    s.style.flex = "1"; s.querySelector("select").style.maxWidth = "none"; nav.appendChild(s);
    [["‹ Prev", -1], ["Next ›", 1]].forEach(function (b) {
      var n = el('<button type="button" class="icon-btn ghost"' + (list[at + b[1]] ? "" : " disabled") + ">" + b[0] + "</button>");
      n.addEventListener("click", function () { var t = list[at + b[1]]; if (t) { st.code = t.Code; ctx.rerender(); } });
      nav.appendChild(n);
    });
    if (c.error) add(v, '<div class="note-box warn">This card could not be read completely: ' + esc(c.error) + "</div>");

    var pfm = c.Perf || {}, fu = c.Fund || {}, sk = c.Stake || {}, ex = c.Exec || {}, sp = span(c), sl = slip(c);
    add(v, '<section class="pc-head"><div class="pc-id"><span class="pc-code">' + esc(c.Code) + "</span>" + (c.Size ? '<span class="pc-tag">' + esc(c.Size) + "</span>" : "") +
      (c.Type ? '<span class="pc-tag">' + esc(c.Type) + "</span>" : "") + (c.Category ? '<span class="pc-tag">' + esc(c.Category) + "</span>" : "") + "</div>" +
      "<h3>" + esc(c.Name) + "</h3>" + (c.Description ? "<p>" + esc(c.Description) + "</p>" : "") +
      '<div class="pc-badges">' + [["Overall", pfm.Status], ["Delay", pfm.Delay], ["Risk", pfm.Risk], ["Actual phase", aPhase(c)], ["Planned phase", c.PlannedPhase]]
        .map(function (b) { return b[1] ? '<span class="pc-b"><small>' + b[0] + "</small>" + U.badge(b[1]) + "</span>" : ""; }).join("") + "</div>" +
      '<div class="pc-meta"><span><b>PM</b> ' + esc(sk.PM || "—") + "</span><span><b>Location</b> " + esc(c.Location || "—") + "</span><span><b>Reporting period</b> " + esc(fmt.month(ex.ReportingPeriod)) + "</span></div></section>");

    var g = grid(v, "g-6");
    g.innerHTML = U.tile({ value: fmt.pct(pfm.Planned, 1), label: "Planned progress" }) +
      U.tile({ value: fmt.pct(pfm.Actual, 1), label: "Actual progress", color: "yellow", note: "Variance " + fmt.pct(pfm.Variance, 1) }) +
      mTile("Budget", fu.Budget, "black", (fu.Org ? esc(fu.Org) + " · " : "") + "Year " + esc(fu.Year || "—")) +
      mTile("Contract value (CON)", fu.CON, "mid") + mTile("Approved paid", pfm.Paid, "slate") +
      U.tile({ value: sl == null ? "—" : (sl > 0 ? "+" : "") + fmt.int(sl), unit: "days", label: "Finish slip vs baseline", color: sl > 0 ? "red" : "slate",
        note: "Forecast " + esc(fmt.date(sp.FE)) + " · BL " + esc(fmt.date(sp.RE || sp.BE)) });

    // Phase journey
    var phases = (c.Timeline || []).filter(function (t) { return t.Level === 1; });
    if (phases.length) {
      var cur = phaseRank(aPhase(c));
      add(panelIn(v, "Project lifecycle", "Section 8 — phase progress (planned vs actual) and forecast / actual dates"), '<div class="pc-steps">' + phases.map(function (p) {
        var r = phaseRank(p.Name), done = (p.Actual || 0) >= 0.999, now = r === cur || (cur >= 5 && r === 5 && /handover/i.test(p.Name));
        return '<div class="pc-step' + (done ? " done" : "") + (now ? " now" : "") + '"><div class="pc-dot">' + (done ? "✓" : now ? "●" : "") + '</div><b>' + esc(p.Name.replace(/ phase$/i, "")) + "</b>" +
          '<div class="pc-mini"><span style="width:' + Math.min(100, (p.Plan || 0) * 100).toFixed(0) + '%" class="p"></span></div><div class="pc-mini"><span style="width:' + Math.min(100, (p.Actual || 0) * 100).toFixed(0) + '%" class="a"></span></div>' +
          '<small>Plan ' + fmt.pct(p.Plan, 0) + " · Actual " + fmt.pct(p.Actual, 0) + "</small><small>" + esc(fmt.date(p.FS)) + " → " + esc(fmt.date(p.FE)) + "</small></div>";
      }).join("") + "</div>");
    }

    var g1 = grid(v, "g-3");
    add(panelIn(g1, "General information", "Section 1"), kvHtml([["Project Code", esc(c.Code)], ["Project Name", esc(c.Name)], ["Project Size", esc(c.Size)], ["Complexity", esc(c.Complexity)],
      ["Project Group", esc(c.Group)], ["Location", esc(c.Location)], ["Project Type", esc(c.Type)], ["Category", esc(c.Category)], ["Planned Phase", esc(c.PlannedPhase)], ["Actual Phase", esc(c.ActualPhase || "Not set")]]));
    add(panelIn(g1, "Key stakeholders", "Section 3"), kvHtml([["Performing BU", esc(sk.BU)], ["Department", esc([sk.Department, sk.Program].filter(Boolean).join(" · "))],
      ["Project Manager", esc(sk.PM)], ["Sponsor (BU)", esc([sk.Sponsor, sk.SponsorOrg].filter(Boolean).join(" · "))], ["Owner (Department)", esc(sk.Owner)], ["Maintenance Entity", esc(sk.Maintenance)]]));
    var ctr = (c.Contracts || []).filter(function (x) { return x.Entity || x["PO No."] || x["PR No."]; });
    add(panelIn(g1, "Funding & contracting", "Sections 4 – 5"), kvHtml([["Funding Organization", esc(fu.Org)], ["Budget (SAR)", fmt.money(fu.Budget)], ["Project Year", esc(fu.Year)],
      ["Fund Status", esc(fu.FundStatus)], ["Critical Project", esc(fu.Critical)], ["Contract value – CON", fmt.money(fu.CON)], ["Contract value – PMC", fmt.money(fu.PMC)], ["Contract value – CSC", fmt.money(fu.CSC)]]
      .concat(ctr.length ? [["h", "Contracts"]].concat([].concat.apply([], ctr.map(function (x) {
        return [[x.Role, "<b>" + esc(x.Entity || "—") + "</b>"], ["PR / PO", esc("PR " + (x["PR No."] || "—") + (x["PR Date"] ? " (" + fmt.date(x["PR Date"]) + ")" : "") + " · PO " + (x["PO No."] || "—") + (x["PO Date"] ? " (" + fmt.date(x["PO Date"]) + ")" : ""))],
          ["Effective date", esc(fmt.date(x["Contract Effective Date"]))]]; }))) : [])));

    // Timeline Gantt (phases → activities)
    st.open = st.open || {};
    var gs = { isOpen: function (k) { return st.open[k] != null ? st.open[k] : !!st.expandAll; } };
    var trs = timelineRows(c, gs, 1);
    var msr = msRows(c, dd);
    var tools = '<button type="button" class="link-btn" data-x="1">Expand all</button><button type="button" class="link-btn" data-x="0">Collapse all</button>';
    var gp = add(v, U.panel("Project timeline", "Section 8 — baseline, revised baseline and forecast / actual per phase · ▸ shows the activities · diamonds are the critical path milestones (section 10)", "", tools));
    gp.querySelectorAll("[data-x]").forEach(function (b) { b.addEventListener("click", function () { st.open = {}; st.expandAll = b.getAttribute("data-x") === "1"; ctx.rerender(); }); });
    var trows = [{ key: "all", level: 1, label: "Whole project", BS: sp.BS, BE: sp.BE, RS: sp.RS, RE: sp.RE, FS: sp.FS, FE: sp.FE, Plan: sp.Plan, Actual: sp.Actual, ms: msr }]
      .concat(trs);
    planGantt(gp, trows, { dd: dd, nameHead: "Phase / activity", onToggle: function (r) { st.open[r.key] = !r.open; ctx.rerender(); } });

    // Execution S-curve + earned value
    var g2 = grid(v, "g-2");
    var mo = ex.Months || [];
    var sc = panelIn(g2, "Execution S-curve", mo.length ? "Section 7 — cumulative planned vs actual progress by month · execution start " + esc(fmt.date(ex.Start)) : "Section 7");
    if (mo.length) {
      var cp = 0, ca = 0, labsM = mo.map(function (m) { return fmt.month(m.Month); });
      var plan = mo.map(function (m) { cp += m.Plan || 0; return cp; }), actl = mo.map(function (m) { if (m.Actual == null) return null; ca += m.Actual; return ca; });
      U.chart(chartBox(sc), { type: "line", data: { labels: labsM, datasets: [
        U.lineDs("Cum planned", plan, S.plan, { borderWidth: 2.5 }), U.lineDs("Cum actual", actl, S.actual, { borderWidth: 2.5, spanGaps: false }),
        U.barDs("Monthly planned", mo.map(function (m) { return m.Plan; }), U.fade(S.plan), { type: "bar", yAxisID: "y", order: 5 }),
        U.barDs("Monthly actual", mo.map(function (m) { return m.Actual; }), U.fade(S.actual), { type: "bar", yAxisID: "y", order: 6 })] },
        options: { plugins: { tooltip: U.pctTooltip() }, scales: { x: U.catAxis(), y: U.pctAxis() } } });
      sc.querySelector(".chart-box").insertAdjacentHTML("afterend", '<div class="pc-note">To date: planned <b>' + fmt.pct(ex.PlannedToDate) + "</b> · actual <b>" + fmt.pct(ex.ActualToDate) +
        "</b>" + (ex.Period ? " · execution period " + fmt.int(ex.Period) + " months" : "") + (ex.TOC ? " · TOC completed: " + esc(ex.TOC) : "") + "</div>");
    } else add(sc, '<div class="empty">No monthly execution progress on this card yet' + (aPhase(c) ? " (actual phase: " + esc(aPhase(c)) + ")" : "") + ".</div>");

    var bu = (c.Budget || [])[0] || {}, kp = {};
    (c.KPIs || []).forEach(function (k) { kp[k.KPI.toLowerCase()] = k.Value; });
    var cpi = kp.cpi, spi = kp["spi (execution)"], ev = bu["Earned Value (SAR)"], pv = bu["Planned Value (SAR)"], ac = bu["Actual Cost"];
    var evp = panelIn(g2, "Earned value & budget", "Section 9 — execution phase / work packages");
    if (c.Budget && c.Budget.length) {
      var ge = add(evp, '<div class="grid g-4 pc-ev"></div>');
      ge.innerHTML = [["Contract value", fmt.m(bu["Contract value (SAR)"]) + " M"], ["Planned value (PV)", fmt.m(pv) + " M"], ["Earned value (EV)", fmt.m(ev) + " M"], ["Actual cost (AC)", fmt.m(ac) + " M"],
        ["Approved paid", fmt.m(bu["Approved Paid Amount (SAR)"]) + " M"], ["EAC", fmt.m(bu.EAC) + " M"],
        ["SPI (execution)", spi == null ? "—" : '<span class="' + (spi < 0.9 ? "neg" : spi >= 1 ? "pos" : "") + '">' + spi.toFixed(2) + "</span>"],
        ["CPI", cpi == null ? "—" : '<span class="' + (cpi < 0.9 ? "neg" : cpi >= 1 ? "pos" : "") + '">' + cpi.toFixed(2) + "</span>"]]
        .map(function (p) { return U.info(p[0], p[1]); }).join("");
      if (c.Budget.length > 1) tableIn(evp, { rows: c.Budget, search: false, autoHeight: true, exportName: "Budget_" + c.Code, columns: Object.keys(c.Budget[0]).map(function (k, i) { return { key: k, label: k, type: i ? "money" : null }; }) });
      if (c.CashFlow && c.CashFlow.length) {
        add(evp, '<h4 class="pc-sub">Cash flow</h4>');
        tableIn(evp, { rows: c.CashFlow, search: false, autoHeight: true, exportName: "CashFlow_" + c.Code, columns: Object.keys(c.CashFlow[0]).map(function (k, i) { return { key: k, label: k, type: i ? "money" : null }; }) });
      }
    } else add(evp, '<div class="empty">No earned-value figures on this card yet (they start with execution).</div>');

    // Baseline & feedback
    var g3 = grid(v, "g-2");
    var bp = panelIn(g3, "Baseline schedule", "Section 6 — revised: " + esc((c.Baseline || {}).Revised || "—") + " · current version: " + esc((c.Baseline || {}).Version || "—"));
    tableIn(bp, { rows: (c.Baseline || {}).Versions || [], search: false, autoHeight: true, exportName: "Baseline_" + c.Code, columns: [
      { key: "Version", label: "Version" }, { key: "Start", label: "Start", type: "date" }, { key: "Finish", label: "Finish", type: "date" }, { key: "Budget", label: "Budget (SAR)", type: "money" },
      { key: "dur", label: "Duration (days)", type: "int", get: function (r) { return days(r.Start, r.Finish); } }] });
    var bl = c.Baseline || {};
    add(panelIn(g3, "Status commentary", "PM / EPMO feedback and reason for delay"), '<div class="pc-fb">' +
      [["PM feedback", bl.PMFeedback, ""], ["EPMO feedback", bl.EPMOFeedback, ""], ["Reason for delay", bl.DelayReason, " warn"]].map(function (x) {
        return '<div class="note-box' + x[2] + '"><b>' + x[0] + "</b><br>" + (x[1] ? esc(x[1]).replace(/\r?\n/g, "<br>") : '<span class="muted">Not provided.</span>') + "</div>"; }).join("") + "</div>");

    // Milestones & deliverables
    var g4 = grid(v, "g-2");
    var mrows = (c.Milestones || []).map(function (m) { var s2 = msState(m, dd); return Object.assign({ State: s2.state, Delay: s2.delay, Forecast: s2.forecast, ActualDone: s2.done ? s2.date : null }, m); });
    tableIn(panelIn(g4, "Critical path milestones", "Section 10 — delay = actual (or forecast / data date while open) − planned"), { rows: mrows, search: false, autoHeight: true, exportName: "Milestones_" + c.Code,
      rowClass: function (r) { return r.State === "Late / overdue" ? "row-alert" : ""; },
      columns: [{ key: "Milestone", label: "Milestone", wrap: true }, { key: "Planned", label: "Planned", type: "date" }, { key: "ActualDone", label: "Actual", type: "date" },
        { key: "Forecast", label: "Forecast", type: "date" }, { key: "State", label: "Status", type: "badge" }, { key: "Delay", label: "Delay (d)", type: "int", signed: true }] });
    var dls = c.Deliverables || [];
    var dp = panelIn(g4, "Deliverables", "Section 11");
    if (dls.length) tableIn(dp, { rows: dls, search: false, autoHeight: true, exportName: "Deliverables_" + c.Code, columns: [
      { key: "Deliverable", label: "Deliverable", wrap: true }, { key: "Due", label: "Planned due", type: "date" }, { key: "Actual", label: "Actual", type: "date" }, { key: "Status", label: "Status", type: "badge" }] });
    else add(dp, '<div class="empty">No deliverables recorded.</div>');

    // Logs
    var iss = D.t("Issue_register").filter(function (r) { return String(r["Poject Code"]) === String(c.Code); });
    var ip = panelIn(v, "Issue log", "Section 12 — " + iss.length + " issues · " + openIssues(D, c.Code) + " open", '<a class="link-btn" data-go="issues">Open in Issue Register →</a>');
    ip.querySelector("[data-go]").addEventListener("click", function () { window.SARApp.go("issues", { f: { code: [String(c.Code)] } }); });
    if (iss.length) tableIn(ip, { rows: iss, search: false, autoHeight: true, exportName: "Issues_" + c.Code, onRow: function (r) { U.recordModal(r["ILR ID No."] + " — " + c.Name, r); },
      columns: [{ key: "ILR ID No.", label: "ILR ID", nowrap: true }, { key: "Issue Identification (Date)", label: "Identified", type: "date" }, { key: "Issue Title", label: "Title", wrap: true },
        { key: "Issue Category", label: "Category" }, { key: "Resolution Action Plan", label: "Action plan", wrap: true }, { key: "Issue Rate", label: "Rate", type: "badge" }, { key: "Issue Status", label: "Status", type: "badge" }] });
    else add(ip, '<div class="empty">No issues logged.</div>');
    var rk = c.Risks || [];
    var rp2 = panelIn(v, "Risk log", "Section 14 — " + rk.length + " risks · " + openRisks(c) + " open");
    if (rk.length) tableIn(rp2, { rows: rk, search: false, autoHeight: true, exportName: "Risks_" + c.Code, onRow: function (r) { U.recordModal((r["RRF ID No."] || "Risk") + " — " + c.Name, r); },
      columns: [{ key: "RRF ID No.", label: "RRF ID", nowrap: true }, { key: "Risk Title", label: "Title", wrap: true }, { key: "Risk Category", label: "Category" },
        { key: "Risk Owner", label: "Owner" }, { key: "Probability of Occurrence", label: "Prob.", type: "int" }, { key: "Total Impact (Rate)", label: "Impact" }, { key: "Risk Score", label: "Score", type: "int" },
        { key: "Risk Rate", label: "Rate", type: "badge" }, { key: "Risk Status", label: "Status", type: "badge" }, { key: "Mitigation Action Plan", label: "Mitigation", wrap: true }] });
    else add(rp2, '<div class="empty">No risks logged.</div>');
    var g5 = grid(v, "g-2");
    var ch = c.Changes || [], cs = c.ChangeSummary || {};
    var cp2 = panelIn(g5, "Change log", "Section 13 — " + ch.length + " change requests" + (cs.Duration ? " · +" + fmt.int(cs.Duration) + " days" : "") + (cs.CostImpact ? " · " + fmt.money(cs.CostImpact) + " SAR" : ""));
    if (ch.length) tableIn(cp2, { rows: ch, search: false, autoHeight: true, exportName: "Changes_" + c.Code, onRow: function (r) { U.recordModal((r["CR ID No."] || "Change") + " — " + c.Name, r); },
      columns: [{ key: "CR ID No.", label: "CR ID", nowrap: true }, { key: "Change Request (Description)", label: "Description", wrap: true }, { key: "Cost Impact (SAR)", label: "Cost (SAR)", type: "money" },
        { key: "Schedule Impact Duration (Calendar Days)", label: "Days", type: "int" }, { key: "Decision Date", label: "Decision", type: "date" }, { key: "CR Status", label: "Status", type: "badge" }] });
    else add(cp2, '<div class="empty">No change requests.</div>');
    var cl = c.Claims || [];
    var clp = panelIn(g5, "Claims register", "Section 15 — " + cl.length + " claims");
    if (cl.length) tableIn(clp, { rows: cl, search: false, autoHeight: true, exportName: "Claims_" + c.Code, columns: Object.keys(cl[0]).slice(0, 8).map(function (k) { return { key: k, label: k, wrap: true }; }) });
    else add(clp, '<div class="empty">No claims.</div>');

    var kpis = (c.KPIs || []).filter(function (k) { return k.Value != null; });
    if (kpis.length) tableIn(panelIn(v, "Card KPIs", "KPI block at the end of the card"), { rows: kpis, search: false, autoHeight: true, exportName: "KPIs_" + c.Code, columns: [
      { key: "Phase", label: "Phase" }, { key: "KPI", label: "KPI" },
      { key: "Value", label: "Value", get: function (k) { var n = k.KPI.toLowerCase(), x = k.Value;
        return /^(ev|pv|sv|cv)$|\(sar\)/.test(n) ? fmt.money(x) : /\(days\)|number/.test(n) ? fmt.int(x) : fmt.dec(x); } }] });   // values as calculated on the card
  }

  /* ----------------------------- Portfolio Master Plan ----------------------------- */
  P["portfolio-plan"] = function (ctx) {
    var D = ctx.D, v = ctx.view, st = ctx.state, all = cardsOf(D);
    if (!all.length) { noCards(v); return; }
    var defs = cardDefs(all), f = filterBar(ctx, defs, all);
    var cards = all.filter(function (c) { return passes(c, defs, f); });
    var dd = dataDate(all), ddn = dnum(dd);
    st.level = st.level || "project"; st.win = st.win || "focus"; st.grp = st.grp || "none"; st.sort = st.sort || "finish";
    st.show = st.show || { base: 1, rev: 1, fc: 1, ms: 1 }; st.open = st.open || {};

    var bar = add(v, '<div class="filters pg-ctl"></div>');
    bar.appendChild(seg("Detail", [["project", "Projects"], ["phase", "Phases"], ["activity", "Activities"]], st.level, function (x) { st.level = x; st.open = {}; ctx.rerender(); }));
    bar.appendChild(seg("Time window", [["focus", "Data date −1y → +2y"], ["all", "Full span"]], st.win, function (x) { st.win = x; ctx.rerender(); }));
    bar.appendChild(seg("Group by", [["none", "None"], ["aph", "Phase"], ["status", "Status"], ["pm", "PM"], ["grp", "Group"]], st.grp, function (x) { st.grp = x; ctx.rerender(); }));
    bar.appendChild(seg("Sort", [["finish", "Finish"], ["slip", "Slip"], ["code", "Code"]], st.sort, function (x) { st.sort = x; ctx.rerender(); }));
    var shw = el('<div class="filter seg-wrap"><label>Show</label><div class="seg"></div></div>');
    [["base", "Baseline"], ["rev", "Revised BL"], ["fc", "Forecast"], ["ms", "Milestones"]].forEach(function (o) {
      var b = el('<button type="button" class="' + (st.show[o[0]] ? "on" : "") + '">' + (st.show[o[0]] ? "✓ " : "") + o[1] + "</button>");
      b.addEventListener("click", function () { st.show[o[0]] = st.show[o[0]] ? 0 : 1; ctx.rerender(); }); shw.querySelector(".seg").appendChild(b);
    });
    bar.appendChild(shw);

    // headline tiles
    var in90 = ddn ? ddn + 90 * 864e5 : null, yEnd = dd ? dd.slice(0, 4) + "-12-31" : null;
    var allMs = [];
    cards.forEach(function (c) { (c.Milestones || []).forEach(function (m) { var s = msState(m, dd); allMs.push(Object.assign({ card: c, Code: c.Code, Project: c.Name }, m, s)); }); });
    var upcoming = allMs.filter(function (m) { var n = dnum(m.date); return !m.done && n && ddn && n >= ddn && n <= in90; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var overdue = allMs.filter(function (m) { return !m.done && m.state === "Late / overdue"; }).sort(function (a, b) { return (b.delay || 0) - (a.delay || 0); });
    var slips = cards.map(slip).filter(function (x) { return x != null; }), late = slips.filter(function (x) { return x > 0; });
    var g = grid(v, "g-5");
    g.innerHTML = U.tile({ value: cards.length, label: "Projects on the plan", note: "Data date " + esc(fmt.date(dd)) }) +
      U.tile({ value: cards.filter(function (c) { var fe = span(c).FE; return fe && yEnd && fe <= yEnd && fe >= dd.slice(0, 4) + "-01-01"; }).length, label: "Finishing in " + (dd ? dd.slice(0, 4) : ""), color: "mid", note: "Forecast finish this year" }) +
      U.tile({ value: late.length, label: "Finishing later than baseline", color: late.length ? "red" : "slate", note: late.length ? "Average slip " + fmt.int(U.sum(late, function (x) { return x; }) / late.length) + " days" : "" }) +
      U.tile({ value: upcoming.length, label: "Milestones next 90 days", color: "yellow", note: "Not yet completed" }) +
      U.tile({ value: overdue.length, label: "Milestones late / overdue", color: "black", note: "Open and past planned date" });

    // rows
    function key(c) { return st.grp === "aph" ? aPhase(c) : st.grp === "status" ? pf(c, "Status") || "—" : st.grp === "pm" ? (c.Stake || {}).PM || "—" : st.grp === "grp" ? c.Group || "—" : ""; }
    var sorted = cards.slice().sort(function (a, b) {
      var ka = key(a), kb = key(b);
      var gcmp = st.grp === "aph" ? phaseRank(ka) - phaseRank(kb) : st.grp === "status" ? byOrder(STATUS_ORDER)(ka, kb) : String(ka).localeCompare(String(kb));
      if (gcmp) return gcmp;
      if (st.sort === "slip") return (slip(b) || -1e9) - (slip(a) || -1e9);
      if (st.sort === "code") return String(a.Code).localeCompare(String(b.Code));
      return String(span(a).FE || "9999").localeCompare(String(span(b).FE || "9999"));
    });
    var depth = st.level === "activity" ? 3 : st.level === "phase" ? 2 : 1;
    var rows = [], lastG = null;
    sorted.forEach(function (c) {
      if (st.grp !== "none" && key(c) !== lastG) { lastG = key(c); rows.push({ group: true, label: lastG, sub: sorted.filter(function (x) { return key(x) === lastG; }).length + " projects" }); }
      var sp = span(c), pk = c.Code, open = st.open[pk] != null ? st.open[pk] : depth >= 2;
      rows.push({ key: pk, level: 1, label: cardLabel(c), sub: aPhase(c), card: c, kids: (c.Timeline || []).length > 0, open: open,
        BS: sp.BS, BE: sp.BE, RS: sp.RS, RE: sp.RE, FS: sp.FS, FE: sp.FE, Plan: sp.Plan, Actual: sp.Actual, ms: msRows(c, dd) });
      if (open) {
        var gs2 = { isOpen: function (k) { return st.open[k] != null ? st.open[k] : depth >= 3; } };
        timelineRows(c, gs2, 2).forEach(function (r) { rows.push(r); });
      }
    });
    var range = null;
    if (st.win === "focus" && ddn) { var a = new Date(ddn); range = [Date.UTC(a.getUTCFullYear() - 1, a.getUTCMonth(), 1), Date.UTC(a.getUTCFullYear() + 2, a.getUTCMonth(), 1)]; }
    var gp = panelIn(v, "Portfolio master plan", "From the project cards (section 8 timeline + section 10 milestones) · ▸ expands a project into phases and activities · click a project name to open its card");
    planGantt(gp, rows, { dd: dd, range: range, show: st.show,
      onToggle: function (r) { st.open[r.key] = !r.open; ctx.rerender(); },
      onLabel: function (r) { if (r.level === 1 && r.card) window.SARApp.go("project-cards", { code: r.card.Code }); } });

    var g2 = grid(v, "g-2");
    function msTable(p, rowsM, name) {
      if (!rowsM.length) { add(p, '<div class="empty">None.</div>'); return; }
      tableIn(p, { rows: rowsM, search: false, maxHeight: 420, exportName: name, onRow: function (m) { window.SARApp.go("project-cards", { code: m.Code }); },
        columns: [{ key: "Code", label: "Code", nowrap: true }, { key: "Project", label: "Project", wrap: true }, { key: "Milestone", label: "Milestone", wrap: true },
          { key: "Planned", label: "Planned", type: "date" }, { key: "forecast", label: "Forecast", type: "date" }, { key: "delay", label: "Delay (d)", type: "int", signed: true }] });
    }
    msTable(panelIn(g2, "Milestones due in the next 90 days", esc(fmt.date(dd)) + " → " + esc(fmt.date(in90 ? new Date(in90).toISOString().slice(0, 10) : null)) + " · click to open the card"), upcoming, "Upcoming_Milestones");
    msTable(panelIn(g2, "Late / overdue milestones", "Open milestones past their planned date · biggest delay first"), overdue, "Overdue_Milestones");
  };

  /* ======================================================================
     Issue Register
     ====================================================================== */
  var RATE_ORDER = ["Critical", "High", "Medium", "Low", "N/A"];
  var RATE_COLOR = { Critical: C.red, High: C.yellow, Medium: C.mid, Low: C.slate, "N/A": C.gray };
  P.issues = function (ctx) {
    var D = ctx.D, v = ctx.view, all = D.t("Issue_register").filter(function (r) { return r["ILR ID No."] || r["Issue (Description)"]; });
    var defs = [
      { key: "status", label: "Issue Status", options: U.uniq(all.map(function (r) { return r["Issue Status"]; })).sort(), get: function (r) { return r["Issue Status"]; } },
      { key: "rate", label: "Issue Rate", options: U.uniq(all.map(function (r) { return r["Issue Rate"]; })).sort(function (a, b) { return RATE_ORDER.indexOf(a) - RATE_ORDER.indexOf(b); }), get: function (r) { return r["Issue Rate"]; } },
      { key: "code", label: "Project Code", options: U.uniq(all.map(function (r) { return r["Poject Code"]; })).sort(), get: function (r) { return r["Poject Code"]; } },
      { key: "name", label: "Project Name", options: U.uniq(all.map(function (r) { return r["Project Name"]; })).sort(), get: function (r) { return r["Project Name"]; } },
      { key: "cat", label: "Issue Category", options: U.uniq(all.map(function (r) { return r["Issue Category"]; })).sort(), get: function (r) { return r["Issue Category"]; } },
      { key: "pm", label: "Project Manager", options: U.uniq(all.map(function (r) { return r["Project Manager"]; })).sort(), get: function (r) { return r["Project Manager"]; } }];
    var st = filterBar(ctx, defs, all);
    var rp = all.map(function (r) { return r["Reporting Period"]; }).filter(Boolean).sort().pop();
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

    var p = panelIn(v, "NSR projects issue register", (rp ? "Project cards · reporting period " + esc(fmt.month(rp)) + " · " : "") + "Click a row for the full issue record");
    tableIn(p, { rows: rows, exportName: "Issue_Register", maxHeight: 640,
      onRow: function (r) { U.recordModal((r["ILR ID No."] || "Issue") + " — " + (r["Project Name"] || ""), r); },
      columns: [
        { key: "Poject Code", label: "Project Code" }, { key: "Project Name", label: "Project Name" },
        { key: "ILR ID No.", label: "ILR ID No.", nowrap: true }, { key: "Issue Identification (Date)", label: "Identified", type: "date" },
        { key: "Issue Title", label: "Issue Title", wrap: true }, { key: "Issue (Description)", label: "Issue (Description)", wrap: true }, { key: "Resolution Action Plan", label: "Resolution Action Plan", wrap: true },
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

/*
 * Export Weekly PPT — fills the PD weekly "Balance Scorecard" template (.pptx) with the NSR data loaded in the site.
 * The template's slides, tables, charts and styling are kept exactly; only text, table rows and chart data change.
 * Template slides are recognised by their titles, so the deck may be re-saved / re-ordered by the PMO.
 * Anything the site does not hold is written as "[To be filled]" (red) so it can be completed by hand.
 */
(function () {
  "use strict";
  var E = window.PptxEngine, NS = E.NS;
  var MISSING = "[To be filled]", RED = "C00000", GREEN = "00B050", AMBER = "FFC000", TEAL = "00778B";
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  /* ------------------------------------------------------------------ formatting */
  function N(v) { return typeof v === "number" && isFinite(v) ? v : (typeof v === "string" && v.trim() !== "" && !isNaN(+v) ? +v : null); }
  function money(v) { v = N(v); return v == null ? "" : (Math.round(v) || 0).toLocaleString("en-US"); }
  function mio(v, d) { v = N(v); return v == null ? "" : (v / 1e6).toFixed(d == null ? 1 : d) + " M"; }
  function sarM(v) { v = N(v); return v == null ? "" : "SAR " + (v / 1e6).toFixed(1) + "M"; }
  function sarB(v) { v = N(v); return v == null ? "" : (Math.abs(v) >= 1e9 ? (v / 1e9).toFixed(2) + " B" : (v / 1e6).toFixed(1) + " M"); }
  function bigB(v) { v = N(v); return v == null ? "" : (Math.abs(v) >= 1e9 ? (v / 1e9).toFixed(1) + " B" : Math.round(v / 1e6) + " M"); }   // headline tiles fit ~9 characters
  function pct(v, d) { v = N(v); return v == null ? "" : (v * 100).toFixed(d == null ? 2 : d) + "%"; }
  function sgnPct(v, d) { v = N(v); return v == null ? "" : (v > 0 ? "+" : "") + (v * 100).toFixed(d == null ? 2 : d) + "%"; }
  function ymd(s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ""); return m ? { y: +m[1], m: +m[2], d: +m[3] } : null; }
  function dShort(s) { var t = ymd(s); return t ? (t.d < 10 ? "0" : "") + t.d + "-" + MONTHS[t.m - 1] + "-" + String(t.y).slice(2) : ""; }
  function dLong(s) { var t = ymd(s); return t ? t.d + " " + MONTHS[t.m - 1] + " " + t.y : ""; }
  function mon(s) { var t = ymd(s); return t ? MONTHS[t.m - 1] + "-" + String(t.y).slice(2) : ""; }
  function qtr(s) { var t = ymd(s); return t ? "Q" + Math.ceil(t.m / 3) + "-" + t.y : ""; }
  function serial(s) { var t = ymd(s); return t ? Math.round((Date.UTC(t.y, t.m - 1, t.d) - Date.UTC(1899, 11, 30)) / 864e5) : null; }
  function miss(v) { return v == null || v === "" ? { text: MISSING, color: RED } : String(v); }
  function clip(s, n) { s = String(s == null ? "" : s).replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  function chunk(a, n) { var o = []; for (var i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o.length ? o : [[]]; }
  function sum(a, f) { return a.reduce(function (s, x) { return s + (N(f ? f(x) : x) || 0); }, 0); }
  function uniq(a) { var s = {}, o = []; a.forEach(function (x) { if (x != null && x !== "" && !s[x]) { s[x] = 1; o.push(x); } }); return o; }

  /* ------------------------------------------------------------------ NSR data model */
  function model(D) {
    var M = { D: D };
    var wk = {}; D.t("Weekly_Report_Updates").forEach(function (r) { var s = r["Source.Name"]; if (s && (!wk[s] || r["Report Date"] > wk[s]["Report Date"])) wk[s] = r; });
    M.weekly = Object.keys(wk).map(function (k) { return wk[k]; }).filter(function (r) { return r["Project Code"] != null; })
      .sort(function (a, b) { return (N(b["Contract Value"]) || 0) - (N(a["Contract Value"]) || 0); });
    M.rd = D.reportDate || new Date().toISOString().slice(0, 10);
    M.cards = {}; D.t("Project_Cards").forEach(function (c) { if (c && c.Code) M.cards[String(c.Code)] = c; });
    var kpi = D.t("KPI_Summary"); M.kpi = kpi;
    var spiK = kpi.filter(function (r) { return /schedule performance/i.test(r["Objective/ KPIs"] || ""); })[0] || {};
    M.spiTarget = N(spiK["NSR Spend Plan 2026 as per Budgeting"]) || 0.9;
    M.codeKpi = {}; D.t("KPI_Projects_Data").forEach(function (r) { M.codeKpi[String(r.Code)] = N(r["KPI Code"]); });
    // spending plan by project / month (plan = Rev Spend Plan when loaded, else the original)
    var sp = D.t("Spending_Plan"), rev = !!D.hasRev;
    M.months = uniq(sp.map(function (r) { return r.Month; })).sort();
    M.cut = sp.filter(function (r) { return N(r["Actual Spend (Incr)4"]) != null; }).map(function (r) { return r.Month; }).sort().pop() || null;
    var by = {};
    sp.forEach(function (r) {
      var id = String(r.ID), o = by[id] || (by[id] = { ID: id, name: r["Project Name"], fund: r["Fund Type"], kpi: M.codeKpi[id], plan: {}, orig: {}, act: {}, fc: {} });
      o.orig[r.Month] = N(r["Spend Plan as per Budgeting (Incr)"]) || 0;
      o.plan[r.Month] = rev ? (N(r["Rev Spend Plan (Incr)"]) || 0) : o.orig[r.Month];
      o.act[r.Month] = N(r["Actual Spend (Incr)4"]) || 0;
      o.fc[r.Month] = N(r["Forecast as per Contractor cashflow / updated Progress / Program (Incr)5"]) || 0;
    });
    M.spend = Object.keys(by).map(function (k) {
      var o = by[k], past = function (m) { return M.cut && m <= M.cut; };
      o.mPlan = M.months.map(function (m) { return o.plan[m] || 0; });
      o.mAct = M.months.map(function (m) { return past(m) ? (o.act[m] || 0) : (o.fc[m] || 0); });   // actual, then Forecast Plan after the cut-off
      o.fy = sum(o.mPlan); o.fyOrig = sum(M.months.map(function (m) { return o.orig[m]; })); o.fcFY = sum(M.months.map(function (m) { return o.fc[m]; }));
      o.ytdPlan = sum(M.months.filter(past).map(function (m) { return o.plan[m]; })); o.ytdAct = sum(M.months.filter(past).map(function (m) { return o.act[m]; }));
      o.fcRem = sum(M.months.filter(function (m) { return !past(m); }).map(function (m) { return o.fc[m]; }));
      return o;
    });
    M.revLabel = rev ? "Rev Spend Plan" : "Spend Plan";
    // S-curve series per project (one row per date, live row wins)
    var ser = {};
    D.t("S_Curve").forEach(function (r) {
      var s = r["Source.Name"], d = r["Report Date"]; if (!s || !d) return;
      var live = ["Cum Actual (%)", "This Week Actual (%)", "This Week Plan (%)"].filter(function (k) { return N(r[k]) != null; }).length;
      var a = ser[s] || (ser[s] = {}), o = a[d];
      if (!o || live > o.live) a[d] = { d: d, plan: N(r["Cum Plan (%)"]), act: N(r["Cum Actual (%)"]), live: live };
    });
    M.scurve = function (src) { var a = ser[src] || {}; return Object.keys(a).sort().map(function (k) { return a[k]; }); };
    var ev = sum(M.weekly, function (r) { return (N(r["Contract Value"]) || 0) * (N(r["Actual (%) - Cumulative"]) || 0); });
    var pv = sum(M.weekly, function (r) { return (N(r["Contract Value"]) || 0) * (N(r["Planned (%) - Cumulative"]) || 0); });
    M.spi = pv ? ev / pv : null;
    M.closing = D.t("Closing_Projects").filter(function (r) { return r.Code || r["Project Name"]; });
    // projects in execution = project cards with Actual Phase = Execution (as on the site); weekly report when no cards are loaded
    var wkBy = {}; M.weekly.forEach(function (r) { wkBy[String(r["Project Code"])] = r; });
    var ce = Object.keys(M.cards).map(function (k) { return M.cards[k]; }).filter(function (c) { return /^execution/i.test(c.ActualPhase || ""); });
    M.exec = (ce.length ? ce.map(function (c) { return { code: String(c.Code), card: c, w: wkBy[String(c.Code)] || {} }; })
      : M.weekly.map(function (r) { return { code: String(r["Project Code"]), card: M.cards[String(r["Project Code"])] || null, w: r }; }))
      .map(function (x) { x.p = progOf(x); x.cv = N(x.w["Contract Value"]) || N(((x.card || {}).Fund || {}).CON) || N(((x.card || {}).Fund || {}).Budget) || 0; return x; })
      .sort(function (a, b) { return b.cv - a.cv; });
    return M;
  }
  /* Progress of a project in execution — card section 7 (Execution Schedule, % to date) and section 8
     (Project Timeline, execution phase dates and activities), as on the site; the weekly report only without a card. */
  function progOf(x) {
    var c = x.card, w = x.w || {};
    if (c) {
      var ex = c.Exec || {}, ph = (c.Timeline || []).filter(function (t) { return t.Level === 1 && /^execution/i.test(t.Name); })[0] || {};
      var pl = N(ex.PlannedToDate), ac = N(ex.ActualToDate);
      if (!pl && !ac) { pl = N(ph.Plan); ac = N(ph.Actual); }
      if (!pl && !ac) { pl = null; ac = null; }
      var acts = (c.Timeline || []).filter(function (t) { return t.Level === 2 && /^execution/i.test(t.Phase || ""); });
      return { src: "card", plan: pl, act: ac, spi: pl ? (ac || 0) / pl : null, start: ph.RS || ph.BS, end: ph.RE || ph.BE, fe: ph.FE, acts: acts };
    }
    var p = N(w["Planned (%) - Cumulative"]), a = N(w["Actual (%) - Cumulative"]);
    return { src: "weekly", plan: p, act: a, spi: wSpi(w), start: w["Start Date Baseline"], end: w["End Date Baseline"], fe: w["End Date (Forecast/Actual)"], acts: null };
  }
  /* short WBS label for the slide's milestone table: "Construction of RHL Line 2" → "CONST. RHL LN 2" */
  function actAbbr(s) {
    return String(s || "").toUpperCase().replace(/\s+/g, " ").trim()
      .replace(/\bCONSTRUCTION\b/g, "CONST.").replace(/\bINSTALLATION\b/g, "INSTAL.").replace(/\bMOBILI[SZ]ATION\b/g, "MOBIL.")
      .replace(/\bPROCUREMENT\b/g, "PROCUR.").replace(/\bENGINEERING\b/g, "ENG.").replace(/\bINVESTIGATIONS?\b/g, "INVEST.")
      .replace(/\bDEMOBILI[SZ]ATION\b/g, "DEMOB.").replace(/\bTESTING AND COMMISSIONING\b|\bT ?& ?C\b/g, "T&C").replace(/\bLINE\b/g, "LN")
      .replace(/\b(OF|THE|FOR)\b ?/g, "").replace(/ AND /g, " & ").replace(/\s+/g, " ").trim();
  }
  function wSpi(r) { var p = N(r["Planned (%) - Cumulative"]), a = N(r["Actual (%) - Cumulative"]); return p ? (a || 0) / p : N(r.SPI); }
  function critical(r, M) { var c = M.cards[String(r["Project Code"])]; return /^y/i.test(r["Critical Project"] || "") || (c && /^y/i.test((c.Fund || {}).Critical || "")); }
  function shortName(s, n) { return clip(s, n || 26); }

  /* ------------------------------------------------------------------ template slide lookup */
  function titleOf(pkg, path) { return pkg.xml(path).documentElement.textContent || ""; }
  function findSlides(pkg) {
    var S = {}, list = pkg.slides();
    var rules = [
      ["cover", /Balance Scorecard[\s\S]*Weekly Meeting/i], ["closingActions", /Old projects status/i], ["spendActions", /Spending plan as discussed/i],
      ["overall", /Projects overall update/i], ["kpi", /KPI Balance Scorecard/i], ["spi", /Schedule Performance Index SPI/i],
      ["values", /Program Values/i], ["delivery", /Delivery Against Approved Business Plan/i], ["capex", /CAPEX 2026 - Status/i],
      ["monthly", /Monthly Plan - CAPEX/i], ["exec", /Projects in the Execution Phase/i], ["pending", /Pending Points/i],
      ["closing", /Projects in the Closing Phase/i], ["thanks", /THANK YOU/], ["org", /Organization Chart/i]];
    list.forEach(function (p) {
      var t = titleOf(pkg, p);
      for (var i = 0; i < rules.length; i++) if (rules[i][1].test(t)) { (S[rules[i][0]] = S[rules[i][0]] || []).push(p); break; }
    });
    return S;
  }

  /* ------------------------------------------------------------------ generic text replacement */
  function renameProgram(pkg, path) {
    var d = pkg.xml(path);
    E.all(d, NS.a, "t").forEach(function (t) {
      var s = t.textContent, o = s.replace(/OVERALL EAST PROGRAM/g, "OVERALL NSR PROGRAM").replace(/Overall East Program/gi, "Overall NSR Program")
        .replace(/EAST Program/g, "NSR Program").replace(/East Program/g, "NSR Program").replace(/\bEWR Target/g, "NSR Target");
      if (o !== s) t.textContent = o;
    });
  }
  function photoPlaceholder() {   // PNG "Add progress photo" tile, drawn on a canvas
    var c = document.createElement("canvas"); c.width = 640; c.height = 420;
    var g = c.getContext("2d"); g.fillStyle = "#F2F8F9"; g.fillRect(0, 0, 640, 420);
    g.strokeStyle = "#00778B"; g.lineWidth = 6; g.setLineDash([18, 12]); g.strokeRect(10, 10, 620, 400);
    g.fillStyle = "#C00000"; g.font = "bold 44px Arial"; g.textAlign = "center"; g.fillText("[To be filled]", 320, 200);
    g.fillStyle = "#768692"; g.font = "30px Arial"; g.fillText("Add progress photo", 320, 255);
    return new Promise(function (res) { c.toBlob(function (b) { b.arrayBuffer().then(function (x) { res(new Uint8Array(x)); }); }, "image/png"); });
  }

  /* ================================================================== slide fillers */
  function fillCover(pkg, path, M) {
    var d = pkg.xml(path), sp = E.shapesByName(d, /^Text Placeholder/)[0]; if (!sp) return;
    E.setRuns(sp, 0, ["NSR Program - Balance Scorecard"]);
    var t = ymd(M.rd), day = t ? t.d : "", suf = !t ? "" : (day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th");
    var ps = E.kids(d.getElementsByTagNameNS(NS.p, "txBody")[0] || d, NS.a, "p");
    E.setRuns(sp, 4, [String(day), suf, t ? " " + MONTHS[t.m - 1] + " " + t.y : ""]);
  }

  /* closing projects → action points (template: one row block per project; here one row per close-out step) */
  var STEP_OWNER = { "amp": "Asset Team + PM", "hand": "PM", "clos": "PM + Program Controls", "retention": "Finance", "ap guarantee": "Finance", "final payment": "Finance", "performance": "Finance + Supply Chain" };
  function stepOwner(k) { k = k.toLowerCase(); for (var p in STEP_OWNER) if (k.indexOf(p) === 0) return STEP_OWNER[p]; return MISSING; }
  function closingSteps(M) {
    var rows = M.closing, keys = rows.length ? Object.keys(rows[0]) : [], a = keys.indexOf("Final Contract Value"), b = keys.indexOf("Current Status");
    return a >= 0 && b > a ? keys.slice(a + 1, b) : [];
  }
  function stepState(r, k) {
    var x = r[k], s = x == null ? "" : String(x).trim();
    if (!s) return { status: "Not Started", date: "" };
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { status: "Completed", date: dShort(s) };
    if (/^(n\/?a)$/i.test(s)) return { status: "NA", date: "" };
    return { status: s, date: "" };
  }
  function openClosing(M) { return M.closing.filter(function (r) { var s = String(r["Current Status"] || ""); return !/^closed\b/i.test(s) && !/terminat/i.test(s); }); }
  function fillClosingActions(pkg, path, M, list, startNo) {
    var d = pkg.xml(path), frame = E.shapesByName(d, /^Table/)[0], tbl = E.table(frame), steps = closingSteps(M);
    var rs = E.rows(tbl), top = rs[1], cont = rs[2];
    rs.slice(1).forEach(function (r) { tbl.removeChild(r); });
    list.forEach(function (r, pi) {
      // the step the close-out is waiting on: the first one not completed (or not applicable)
      var cur = steps.filter(function (k) { var x = stepState(r, k).status; return x !== "Completed" && x !== "NA"; })[0];
      steps.forEach(function (k, si) {
        var tr = (si === 0 ? top : cont).cloneNode(true), c = E.cells(tr), st = stepState(r, k), now = k === cur, done = st.status === "Completed" || st.status === "NA";
        if (si === 0) {
          [0, 1, 2].forEach(function (i) { c[i].setAttribute("rowSpan", String(steps.length)); });
          E.cellText(c[0], String(startNo + pi)); E.cellText(c[1], (r.Code || "") + " – " + clip(r["Project Name"], 40)); E.cellText(c[2], miss(null));
          E.cellText(c[7], clip([r["Current Status"], r["Action Plan"]].filter(Boolean).join(" · "), 160) || "");
        } else E.cellText(c[7], "");
        var owner = si === 0 ? (r["Project Manager"] || stepOwner(k)) : stepOwner(k);
        if (now) {          // highlight who holds the action now
          E.cellText(c[3], { text: "► " + owner, color: "FFFFFF", bold: true }); E.cellFill(c[3], TEAL);
          E.cellText(c[4], { text: k, color: TEAL, bold: true }); E.cellFill(c[4], "E6F1F4");
        } else {
          E.cellText(c[3], done ? { text: owner, color: "A6A6A6", bold: false } : { text: owner, bold: false });
          E.cellText(c[4], done ? { text: k, color: "A6A6A6", bold: false } : { text: k, bold: false });
        }
        E.cellText(c[5], st.status === "Completed" ? { text: "Completed", color: GREEN } : now ? { text: st.status === "Not Started" ? "Pending – current" : st.status, color: "C55A11", bold: true }
          : st.status === "Not Started" ? { text: "Not Started", color: RED } : st.status);
        E.cellText(c[6], st.date ? st.date : miss(null));
        tbl.appendChild(tr);
      });
    });
    E.fitTable(frame);
  }

  /* monthly spending matrix tables (slides "Spending plan as discussed" and "Monthly Plan - CAPEX") */
  function matrixRows(plan, act) {
    plan = plan.map(Math.round); act = act.map(Math.round);   // whole riyals, so the cumulative rows and variance agree
    var cp = 0, ca = 0, cumP = plan.map(function (x) { return cp += x; }), cumA = act.map(function (x) { return ca += x; });
    return [plan, act, cumP, cumA, cumA.map(function (x, i) { return x - cumP[i]; })];
  }
  function matrixSize(sets) {   // template cells are 9pt Calibri sized for ~10 characters; shrink for larger amounts
    var w = 0; sets.forEach(function (rowsK) { rowsK.forEach(function (vals) { vals.forEach(function (v) { w = Math.max(w, money(v).length); }); }); });
    return w >= 12 ? 6.5 : w >= 11 ? 7.5 : w >= 10 ? 8.5 : null;
  }
  function fillMatrixRow(cellsArr, vals, isVar, size) {
    vals.forEach(function (v, i) {
      var tc = cellsArr[i]; if (!tc) return;
      E.cellText(tc, { text: money(v), color: isVar ? (v > 0.5 ? GREEN : v < -0.5 ? RED : "000000") : null, size: size });
    });
  }
  function fillMatrixSlide(pkg, path, M, title, overallLabel, overall, projects) {
    var d = pkg.xml(path), frames = E.shapesByName(d, /^Table/).sort(function (a, b) { return E.pos(a).y - E.pos(b).y; });
    var months = M.months.map(mon), ci = M.months.indexOf(M.cut);
    // overall table: rows 0..5, col0 label (rowSpan), col1 row label, cols 2.. months
    var t1 = E.table(frames[0]), r1 = E.rows(t1);
    E.cellText(E.cells(r1[0])[0], overallLabel);
    months.forEach(function (m, i) { var c = E.cells(r1[0])[2 + i]; if (c) E.cellText(c, m); });
    var mr = matrixRows(overall.plan, overall.act), sz1 = matrixSize([mr]);
    mr.forEach(function (vals, k) { fillMatrixRow(E.cells(r1[k + 1]).slice(2), vals, k === 4, sz1); });
    // projects table: header + 5 rows per project
    var f2 = frames[1];
    if (f2) {
      var t2 = E.table(f2), hdr = E.rows(t2)[0];
      months.forEach(function (m, i) { var c = E.cells(hdr)[3 + i]; if (c) E.cellText(c, m); });
      var blocks = E.resizeRows(t2, 1, 5, projects.length);
      var sz2 = matrixSize(projects.map(function (p) { return matrixRows(p.mPlan, p.mAct); }));
      projects.forEach(function (p, pi) {
        var rows5 = blocks.slice(pi * 5, pi * 5 + 5), c0 = E.cells(rows5[0]);
        E.cellText(c0[0], p.ID); E.cellText(c0[1], shortName(p.name, 40) + (M.D.hasRev ? "" : ""));
        matrixRows(p.mPlan, p.mAct).forEach(function (vals, k) { fillMatrixRow(E.cells(rows5[k]).slice(3), vals, k === 4, sz2); });
      });
      if (!projects.length) E.removeEl(f2); else E.fitTable(f2);
    }
    // cut-off markers: vertical connectors at the boundary after the cut-off month column
    if (ci >= 0) {
      var t1p = E.pos(frames[0]), grid = E.all(t1, NS.a, "gridCol").map(function (g) { return +g.getAttribute("w"); });
      var x = t1p.x + grid.slice(0, 2 + ci + 1).reduce(function (s, w) { return s + w; }, 0);
      E.shapesByName(d, /^Straight Connector/).forEach(function (cx) { var p = E.pos(cx); if (p && p.w < 50000) E.move(cx, x - p.w / 2, null); });
      E.shapesByName(d, /^Text 20$/).forEach(function (tx) { var p = E.pos(tx); if (p) E.move(tx, x - p.w / 2, null); });
    }
    if (title) { var tb = E.shapesByName(d, /^TextBox 2$/)[0]; if (tb) E.setParas(tb, title); }
  }
  function overallOf(list, M) {
    return { plan: M.months.map(function (m, i) { return sum(list, function (p) { return p.mPlan[i]; }); }), act: M.months.map(function (m, i) { return sum(list, function (p) { return p.mAct[i]; }); }) };
  }

  /* projects overall update table */
  function fillOverall(pkg, path, M) {
    var d = pkg.xml(path), frame = E.shapesByName(d, /^Table/)[0], tbl = E.table(frame);
    var list = M.weekly, rows = E.resizeRows(tbl, 1, 1, list.length);
    list.forEach(function (r, i) {
      var c = E.cells(rows[i]), pl = N(r["Planned (%) - Cumulative"]), ac = N(r["Actual (%) - Cumulative"]), vr = ac - pl;
      E.cellText(c[0], String(r["Project Code"]));
      E.cellText(c[1], [[{ text: shortName(r["Project Name"], 60) }].concat(critical(r, M) ? [{ text: " - Critical", color: RED, bold: true }] : [])]);
      E.cellText(c[2], money(r["Contract Value"])); E.cellText(c[3], pct(pl)); E.cellText(c[4], pct(ac));
      E.cellText(c[5], pct(vr)); E.cellFill(c[5], vr >= 0 ? GREEN : vr > -0.05 ? AMBER : "FF0000");
      E.cellText(c[6], dShort(r["Start Date Baseline"])); E.cellText(c[7], dShort(r["End Date Baseline"]));
      var fe = r["End Date (Forecast/Actual)"], be = r["End Date Baseline"];
      E.cellText(c[8], fe && be && fe > be ? dShort(fe) : "-");
    });
    E.fitTable(frame);
  }

  /* KPI balance scorecard */
  function kpiVal(v) { v = N(v); if (v == null) return ""; return Math.abs(v) >= 1000 ? mio(v) : Math.abs(v) <= 2 ? pct(v, 0) : String(Math.round(v * 100) / 100); }
  function fillKpi(pkg, path, M) {
    var d = pkg.xml(path), frame = E.shapesByName(d, /^Table/)[0], tbl = E.table(frame), rs = E.rows(tbl);
    var hdr = rs[0], catTpl = rs[1], kpiTpl = rs[2], cutTxt = M.cut ? dShort(M.cut.slice(0, 8) + new Date(Date.UTC(+M.cut.slice(0, 4), +M.cut.slice(5, 7), 0)).getUTCDate()) : "";
    var hc = E.cells(hdr);
    if (hc[5]) E.cellText(hc[5], "YTD Plan till " + cutTxt); if (hc[6]) E.cellText(hc[6], "YTD Actual till " + cutTxt);
    rs.slice(1).forEach(function (r) { tbl.removeChild(r); });
    var groups = uniq(M.kpi.map(function (r) { return r["KPI Filter"]; }));
    groups.forEach(function (g, gi) {
      var list = M.kpi.filter(function (r) { return r["KPI Filter"] === g; });
      var cr = catTpl.cloneNode(true), cc = E.cells(cr), w = sum(list, function (r) { return r["KPI Weight (%)"]; }), res = sum(list, function (r) { return r["KPI Result"]; });
      E.cellText(cc[0], (gi + 1) + ". " + g + " (" + pct(w, 0) + ")"); E.cellText(cc[1], pct(w, 0)); E.cellText(cc[2], pct(res, 0));
      for (var i = 3; i < cc.length; i++) E.cellText(cc[i], "");
      tbl.appendChild(cr);
      list.forEach(function (r) {
        var tr = kpiTpl.cloneNode(true), c = E.cells(tr), ach = N(r["% Achieved"]), name = r["Objective/ KPIs"] || "";
        var crit = /\(([-+±]?\d+%?)\)/.exec(name);
        E.cellText(c[0], clip(name, 60)); E.cellText(c[1], pct(r["KPI Weight (%)"], 0)); E.cellText(c[2], pct(r["KPI Result"], 1));
        E.cellText(c[3], crit ? crit[1] : (/schedule performance/i.test(name) ? String(M.spiTarget) : miss(null)));
        E.cellText(c[4], kpiVal(r["NSR Spend Plan 2026 as per Budgeting"]) || miss(null));
        E.cellText(c[5], kpiVal(r["YTD Spend Plan 2026 as per Budgeting"]) || "-"); E.cellText(c[6], kpiVal(r["YTD Actual"]) || "-");
        E.cellText(c[7], pct(ach, 0)); E.cellFill(c[7], ach == null ? null : ach >= 0.95 ? GREEN : ach >= 0.85 ? AMBER : "FF0000");
        var rem = r.Remarks ? clip(r.Remarks, 90) : "";
        if (!rem && M.D.hasRev && /capex/i.test(name)) {
          var cap = M.spend.filter(function (p) { return p.kpi === 7; });
          rem = "Revised Spend Plan 2026 (Budget 2026 VP): " + mio(sum(cap, function (p) { return p.fy; })) + " vs original " + mio(sum(cap, function (p) { return p.fyOrig; })) + "; year-end forecast " + mio(sum(cap, function (p) { return p.ytdAct + p.fcRem; }));
        }
        E.cellText(c[8], rem);
        tbl.appendChild(tr);
      });
    });
    E.fitTable(frame);
  }

  /* SPI cards */
  function spiSeries(M, r) {
    var s = M.scurve(r["Source.Name"]).filter(function (x) { return x.d <= M.rd && x.plan && x.act != null; }).slice(-4);
    return { cats: s.map(function (x) { return serial(x.d); }), vals: s.map(function (x) { return Math.round(x.act / x.plan * 100) / 100; }) };
  }
  function cardsOn(d) {   // SPI cards: card shape + name text + value text + chart inside its bounds
    var boxes = E.shapesByName(d, /^Shape 18$/).map(function (b) { return { box: b, p: E.pos(b) }; }).filter(function (o) { return o.p; });
    var others = E.all(d, NS.p, "cNvPr").map(function (n) { return n.parentNode.parentNode; });
    return boxes.map(function (b) {
      var inside = others.filter(function (s) { if (s === b.box) return false; var p = E.pos(s); return p && p.x >= b.p.x - 20000 && p.y >= b.p.y - 20000 && p.x < b.p.x + b.p.w && p.y < b.p.y + b.p.h; });
      var texts = inside.filter(function (s) { return s.localName === "sp" && E.text(s).trim(); }).sort(function (a, c) { return E.pos(a).y - E.pos(c).y; });
      return { box: b.box, y: b.p.y, x: b.p.x, name: texts[0], value: texts[1], chart: inside.filter(function (s) { return s.localName === "graphicFrame" && s.getElementsByTagNameNS(NS.c, "chart").length; })[0], all: inside };
    }).sort(function (a, b) { return a.y - b.y || a.x - b.x; });
  }
  function fillSpi(pkg, path, M, list, first) {
    var d = pkg.xml(path), cards = cardsOn(d);
    var big = E.shapesByName(d, /^Text 7$/).filter(function (s) { return /^\d/.test(E.text(s).trim()); })[0];
    if (big) E.setParas(big, M.spi == null ? miss(null) : M.spi.toFixed(2));
    E.shapesByName(d, /^Text 8$/).forEach(function (s) { if (/Current SPI/i.test(E.text(s))) E.setParas(s, "Current SPI  •  Target " + M.spiTarget); });
    E.shapesByName(d, /^TextBox 10$/).forEach(function (s) { if (/^0\.\d+$/.test(E.text(s).trim())) E.setParas(s, String(M.spiTarget)); });
    cards.forEach(function (c, i) {
      var r = list[i];
      if (!r) { c.all.concat([c.box]).forEach(E.removeEl); return; }
      var spi = wSpi(r), name = r["Project Code"] + " - " + shortName(r["Project Name"], 18);
      if (c.name) E.setParas(c.name, critical(r, M) ? [[{ text: name }, { text: " - Critical", color: RED }]] : name);
      if (c.value) E.setParas(c.value, { text: spi == null ? "-" : spi.toFixed(2), color: spi != null && spi < M.spiTarget ? RED : TEAL });
      if (c.chart) {
        var cp = pkg.chartOf(path, c.chart), s = spiSeries(M, r);
        if (cp) pkg.setChart(cp, { cats: s.cats, catFmt: "d-mmm", series: [{ name: "SPI", values: s.vals }, { name: "Target", values: s.cats.map(function () { return M.spiTarget; }) }] });
      }
    });
  }

  /* program values dashboard */
  function setLine(el, pi, text) { E.setRuns(el, pi, [text]); }
  function fillValues(pkg, path, M) {
    var d = pkg.xml(path), D = M.D, nsr = D.t("NSR_Project_Data"), cards = Object.keys(M.cards).map(function (k) { return M.cards[k]; });
    function sh(id) { return E.shape(d, id); }
    var full = sum(nsr, function (r) { return r["Full Cost"]; }), cv = sum(nsr, function (r) { return r["Contract Value"]; }), paid = sum(nsr, function (r) { return r["Paid from CV as per ERP (Gross value)"]; });
    var po = nsr.filter(function (r) { return r["PO Number"] != null && r["PO Number"] !== ""; }).length;
    var byText = function (re) { return E.all(d, NS.p, "sp").filter(function (s) { return re.test(E.text(s).replace(/\s+/g, " ")); })[0]; };
    var b1 = byText(/APPROVED ?BUDGET/); if (b1) { setLine(b1, 1, "SAR " + bigB(full)); setLine(b1, 2, nsr.length + " projects"); }
    var b2 = byText(/CONTRACTED ?VALUE/); if (b2) { setLine(b2, 1, "SAR " + bigB(cv)); setLine(b2, 2, "Issued PO's - " + po + " projects"); }
    var b3 = byText(/TOTAL ?PAID/); if (b3) { setLine(b3, 1, "SAR " + bigB(paid)); setLine(b3, 2, (cv ? Math.round(paid / cv * 100) : 0) + " % of contracted value"); }
    function grp(re, list) { var b = byText(re); if (!b) return; setLine(b, 2, list.length + " Projects"); setLine(b, 3, "SAR " + sarB(sum(list, function (c) { return (c.Fund || {}).Budget; }))); }
    grp(/PMO Reporting Card/, cards);
    grp(/Under Execution/, cards.filter(function (c) { return /^execution/i.test(c.ActualPhase || ""); }));
    grp(/Pipeline/, cards.filter(function (c) { return /^(planning|tendering|initiation)/i.test(c.ActualPhase || ""); }));
    var leg = byText(/Legacy/);
    if (leg) { var cl = M.closing; setLine(leg, 1, "    Closing phase (closing sheet)"); setLine(leg, 2, cl.length + " Projects"); setLine(leg, 3, "SAR " + sarB(sum(cl, function (r) { return r["Final Contract Value"]; }))); }
    var spiTxt = byText(/^\s*\d\.\d+\s*$/); if (spiTxt) E.setParas(spiTxt, M.spi == null ? "-" : M.spi.toFixed(2));
    var tg = byText(/^Target:/); if (tg) E.setParas(tg, "Target:" + M.spiTarget);
    var bud = byText(/Overall Budget/); if (bud) setLine(bud, 0, "SAR " + sarB(cv));
    // charts by series name
    E.shapesByName(d, /^Chart \d/).forEach(function (f) {
      var cp = pkg.chartOf(path, f); if (!cp) return;
      var x = pkg.xml(cp).documentElement.textContent;
      if (/Remaining to target/.test(x)) pkg.setChart(cp, { cats: ["Achieved", "Remaining to target 1.20"], series: [{ name: "SPI", values: [Math.round((M.spi || 0) * 100) / 100, Math.max(0, Math.round((1.2 - (M.spi || 0)) * 100) / 100)] }] });
      else if (/IPC Budget/.test(x)) pkg.setChart(cp, { cats: ["Approved IPCs ", "Remaining "], series: [{ name: "IPC Budget", values: [Math.round(paid / 1e5) / 10, Math.round((cv - paid) / 1e5) / 10] }] });
      else if (/Phase/.test(x) && /Execution/.test(x)) {
        var ph = ["Execution", "Planning", "Tendering", "Closing"];
        pkg.setChart(cp, { cats: ph, series: [{ name: "Phase", values: ph.map(function (p) { return cards.filter(function (c) { return (c.ActualPhase || "").indexOf(p) === 0; }).length; }) }] });
      } else if (/Mega/.test(x)) {
        var sz = ["Mega", "Large", "Medium", "Small"];
        pkg.setChart(cp, { cats: sz, series: [{ name: "Size", values: sz.map(function (s) { return cards.filter(function (c) { return c.Size === s; }).length; }) }] });
      } else if (/On Track/.test(x) && /Delayed/.test(x)) {
        var st = ["Delayed", "On Hold", "On Track", "At Risk"], norm = function (s) { return /slight/i.test(s) ? "At Risk" : s; };
        var cnt = st.map(function (s) { return cards.filter(function (c) { return norm((c.Perf || {}).Status || "") === s; }).length; });
        pkg.setChart(cp, { cats: st, series: st.map(function (s, i) { return { name: s, values: st.map(function (z, j) { return j === i ? cnt[i] : null; }) }; }) });
      }
    });
  }

  /* delivery KPI cards */
  function fillDelivery(pkg, path, M, list) {
    var d = pkg.xml(path), all = E.all(d, NS.p, "cNvPr").map(function (n) { return n.parentNode.parentNode; }).filter(function (s) { return s.parentNode && s.parentNode.localName === "spTree"; });
    var tops = E.shapesByName(d, /^Shape 3$|^Shape 49$/).map(function (s) { return E.pos(s).y; }).sort(function (a, b) { return a - b; });
    if (tops.length < 2) tops = [1100000, 3900000];
    function inCard(k) { return all.filter(function (s) { var p = E.pos(s); return p && p.y >= tops[k] - 50000 && (k + 1 >= tops.length || p.y < tops[k + 1] - 50000) && p.y < 6300000 && !/^Title|^Image|^TextBox 3$/.test(s.getElementsByTagNameNS(NS.p, "cNvPr")[0].getAttribute("name")); }); }
    var note = [];
    [0, 1].forEach(function (k) {
      var shapes = inCard(k), r = list[k];
      if (!r) { shapes.forEach(E.removeEl); return; }
      var w = M.weekly.filter(function (x) { return String(x["Project Code"]) === String(r["Project Code"]); })[0] || {};
      var texts = shapes.filter(function (s) { return s.localName === "sp" && E.text(s).trim(); });
      function t(re) { return texts.filter(function (s) { return re.test(E.text(s).trim()); })[0]; }
      var byOrder = texts.slice().sort(function (a, b) { var pa = E.pos(a), pb = E.pos(b); return pa.y - pb.y || pa.x - pb.x; });
      var num = byOrder.filter(function (s) { return /^\d{1,2}$/.test(E.text(s).trim()); })[0];
      if (num) E.setParas(num, String(k + 1));
      var code = byOrder.filter(function (s) { return E.text(s).trim().length <= 6 && /^[A-Z0-9]+$/.test(E.text(s).trim()) && s !== num; })[0];
      if (code) E.setParas(code, String(r["Project Code"]));
      var nameT = byOrder.filter(function (s) { var p = E.pos(s); return p.x < 2500000 && p.h > 300000 && !/CONTRACT|PROJECT CODE|^\d/.test(E.text(s)); })[0];
      if (nameT) E.setParas(nameT, clip(r["NSR Plan"] || w["Project Name"], 60));
      var cvT = byOrder.filter(function (s) { return /^[\d,]+$/.test(E.text(s).trim()) && E.text(s).trim().length > 4; })[0];
      if (cvT) E.setParas(cvT, money(w["Contract Value"] || r["Budget (SAR)"]));
      var dates = byOrder.filter(function (s) { return /^\d{2}-[A-Z][a-z]{2}-\d{2}$/.test(E.text(s).trim()); }).sort(function (a, b) { return E.pos(a).x - E.pos(b).x; });
      if (dates[0]) E.setParas(dates[0], dShort(w["Start Date Baseline"]) || MISSING);
      if (dates[1]) E.setParas(dates[1], dShort(w["End Date Baseline"]) || MISSING);
      if (dates[2]) E.setParas(dates[2], dShort(w["End Date (Forecast/Actual)"]) || MISSING);
      var cq = t(/^Completion Qtr/); if (cq) E.setParas(cq, "Completion Qtr  " + (qtr(r["Target Completion Date"]) || MISSING));
      var fq = t(/(Forecast Completion|Confirmed)/);
      var ok = w["End Date (Forecast/Actual)"] && r["Target Completion Date"] && qtr(w["End Date (Forecast/Actual)"]) <= qtr(r["Target Completion Date"]);
      if (fq) E.setParas(fq, "Forecast Completion  " + (qtr(w["End Date (Forecast/Actual)"]) || MISSING) + (ok ? "  ✓" : "  ✗"));
      var act = t(/Actual$/), plan = t(/^Planned/), spiT = t(/^SPI/), eot = t(/^EOT/);
      if (act) E.setParas(act, pct(w["Actual (%) - Cumulative"]) + "  Actual"); if (plan) E.setParas(plan, "Planned " + pct(w["Planned (%) - Cumulative"]));
      var sv = wSpi(w); if (spiT) E.setParas(spiT, "SPI  " + (sv == null ? "-" : sv.toFixed(2)));
      if (eot) E.setParas(eot, [[{ text: "EOT: " }, { text: MISSING, color: RED }]]);
      // progress bar: the shorter of the two bar shapes is the "actual" fill
      var bars = shapes.filter(function (s) { var p = E.pos(s); return s.localName === "sp" && !E.text(s).trim() && p && p.h < 150000 && p.w > 1000000; }).sort(function (a, b) { return E.pos(b).w - E.pos(a).w; });
      if (bars.length >= 2) { var full = E.pos(bars[0]).w, a = Math.max(0.02, Math.min(1, N(w["Actual (%) - Cumulative"]) || 0)); var e = bars[1].getElementsByTagNameNS(NS.a, "ext")[0]; e.setAttribute("cx", String(Math.round(full * a))); }
      note.push((r["Project Code"]) + " forecast completion " + (mon(w["End Date (Forecast/Actual)"]) || MISSING));
    });
    var nb = E.shapesByName(d, /^TextBox 3$/)[0]; if (nb) E.setParas(nb, note.join(" · ") + ".");
  }

  /* CAPEX status */
  function fillCapex(pkg, path, M) {
    var d = pkg.xml(path), cap = M.spend.filter(function (p) { return M.codeKpi[p.ID] === 7 && (p.fy || p.ytdAct || p.fcFY); }).sort(function (a, b) { return b.fy - a.fy; });
    var fy = sum(cap, function (p) { return p.fy; }), yp = sum(cap, function (p) { return p.ytdPlan; }), ya = sum(cap, function (p) { return p.ytdAct; }), rem = sum(cap, function (p) { return p.fcRem; });
    var cutM = M.cut ? MONTHS[+M.cut.slice(5, 7) - 1] : "";
    function byText(re) { return E.all(d, NS.p, "sp").filter(function (s) { return re.test(E.text(s)); }); }
    byText(/^SAR [\d.]+M$/).forEach(function (s) {
      var p = E.pos(s), lbl = byText(/./).filter(function (x) { var q = E.pos(x); return q && Math.abs(q.x - p.x) < 400000 && q.y < p.y && p.y - q.y < 500000; })[0], l = lbl ? E.text(lbl) : "";
      if (/Planned Budget/.test(l)) E.setParas(s, sarM(yp)); else if (/Actual Budget/.test(l)) E.setParas(s, sarM(ya)); else if (/Variance/.test(l)) E.setParas(s, sarM(ya - yp));
    });
    byText(/^(Planned|Actual) Budget/).forEach(function (s) { E.setRuns(s, 0, [E.text(s).split("(")[0], "(Till " + cutM + ")"]); });
    var yb = byText(/^SAR [\d.]+M$/).filter(function (s) { return E.pos(s).y < 2000000 && E.pos(s).x < 4000000; })[0]; if (yb) E.setParas(yb, sarM(fy));
    var vp = byText(/^-?\d+%$/)[0]; if (vp) E.setParas(vp, (yp ? Math.round((ya - yp) / yp * 100) : 0) + "%");
    var yl = byText(/Yearly Budget/)[0]; if (yl) E.setParas(yl, "Yearly Budget – " + (M.D.hasRev ? "Rev Spend Plan" : "Spend Plan"));
    // table
    var frame = E.shapesByName(d, /^Table/)[0], tbl = E.table(frame), rs = E.rows(tbl), total = rs[rs.length - 1];
    // the template's table holds 3 project rows: largest three, then the rest grouped (all of them are on "Monthly Plan - CAPEX")
    var shown = cap.slice(0, cap.length > 4 ? 3 : cap.length), rest = cap.slice(shown.length);
    if (rest.length) {
      var agg = function (k) { return sum(rest, function (p) { return p[k]; }); };
      shown.push({ ID: "", name: "Other CAPEX projects (" + rest.length + ")", fy: agg("fy"), ytdPlan: agg("ytdPlan"), ytdAct: agg("ytdAct"), fcRem: agg("fcRem") });
    }
    var body = E.resizeRows(tbl, 1, 1, shown.length); tbl.appendChild(total);
    var w = Math.max.apply(null, [fy, yp, ya, rem, ya + rem, ya - yp].map(function (v) { return money(v).length; })), sz = w >= 11 ? 7 : w >= 10 ? 8 : null;
    function cell(c, v) { E.cellText(c, typeof v === "object" ? { text: v.text, color: v.color, size: sz } : { text: v, size: sz }); }
    shown.forEach(function (p, i) {
      var c = E.cells(body[i]);
      [p.ID, shortName(p.name, 40), money(p.fy), money(p.ytdPlan), money(p.ytdAct), null, money(p.fcRem), money(p.ytdAct + p.fcRem)].forEach(function (v, k) { if (c[k] && v != null) cell(c[k], v); });
      var vr = p.ytdAct - p.ytdPlan; cell(c[5], { text: money(vr), color: vr < 0 ? RED : GREEN });
    });
    var tc = E.cells(total);
    [null, "Total", money(fy), money(yp), money(ya), null, money(rem), money(ya + rem)].forEach(function (v, k) { if (tc[k] && v != null) cell(tc[k], v); });
    cell(tc[5], { text: money(ya - yp), color: ya - yp < 0 ? RED : GREEN });
    E.fitTable(frame);
    // charts
    E.all(d, NS.p, "graphicFrame").forEach(function (f) {
      var cp = pkg.chartOf(path, f); if (!cp) return;
      var x = pkg.xml(cp).documentElement.textContent;
      if (/Cum Forecast/.test(x)) {
        var ci = M.months.indexOf(M.cut), ov = overallOf(cap, M), cp1 = 0, ca = 0, cf = 0;
        var cumP = ov.plan.map(function (v) { return Math.round((cp1 += v) / 1e5) / 10; });
        var cumA = ov.act.map(function (v, i) { ca += v; return i <= ci ? Math.round(ca / 1e5) / 10 : null; });
        var cumF = ov.act.map(function (v, i) { cf += v; return i >= ci ? Math.round(cf / 1e5) / 10 : null; });
        pkg.setChart(cp, { cats: M.months.map(serial), catFmt: "mmm-yy", series: [
          { name: "Planned Budget", values: ov.plan.map(function (v) { return Math.round(v / 1e5) / 10; }) },
          { name: "Actual Budget", values: ov.act.map(function (v, i) { return i <= ci ? Math.round(v / 1e5) / 10 : null; }) },
          { name: "Cum Planned Budget", values: cumP }, { name: "Cum Actual Budget", values: cumA }, { name: "Cum Forecast Budget", values: cumF }] });
      } else if (/Planned Budget/.test(x)) {
        pkg.setChart(cp, { cats: cap.map(function (p) { return p.ID; }), series: [
          { name: "Planned Budget", values: cap.map(function (p) { return Math.round(p.ytdPlan / 1e6); }) }, { name: "Actual Budget", values: cap.map(function (p) { return Math.round(p.ytdAct / 1e6); }) }] });
      }
    });
    var ins = byText(/^Achieved|The overall forecast/)[0];
    if (ins) {
      var ach = yp ? ya / yp : null, ov2 = ya + rem;
      E.setParas(ins, [[{ text: "YTD actual is " }, { text: pct(ach, 0), bold: true }, { text: " of the YTD " + (M.D.hasRev ? "Rev " : "") + "plan (till " + cutM + ")." }],
        [{ text: "The overall forecast is " }, { text: mio(ov2), bold: true }, { text: ov2 >= fy ? ", exceeding the yearly budget by " : ", below the yearly budget by " }, { text: mio(Math.abs(ov2 - fy)), bold: true }]]);
    }
  }

  /* project in execution */
  function fillExec(pkg, path, M, x, photo) {
    var r = x.w || {}, d = pkg.xml(path), code = x.code, card = x.card || {}, src = r["Source.Name"], pg = x.p || {};
    var ctr = function (re) { return ((card.Contracts || []).filter(function (k) { return re.test(k.Role || "") && k.Entity; })[0] || {}).Entity; };
    function sh(id) { return E.shape(d, id); }
    function byName(re) { return E.shapesByName(d, re); }
    function textShape(re) { return E.all(d, NS.p, "sp").filter(function (s) { return re.test(E.text(s)); })[0]; }
    var title = textShape(/^Project - /);
    if (title) E.setParas(title, [[{ text: "Project - " + code + " : " + clip(r["Project Name"] || card.Name, 80) + " " }].concat(critical({ "Project Code": code, "Critical Project": r["Critical Project"] }, M) ? [{ text: "(Critical Project)", color: "FF0000" }] : [])]);
    // contractor / consultant / funded by (one-row table)
    var top = E.all(d, NS.a, "tbl").filter(function (t) { return /Contractor/.test(t.textContent) && /Funded/.test(t.textContent); })[0];
    if (top) { var c = E.cells(E.rows(top)[0]); E.cellText(c[1], miss(clip(r.Contractor || ctr(/contractor/i), 30))); E.cellText(c[3], miss(clip(r.PMC || r["Consultant (CSC)"] || ctr(/^csc$/i) || ctr(/^pmc$/i), 24))); E.cellText(c[5], miss(r["Funding Source"] || (card.Fund || {}).Org)); }
    // overall status
    var st = textShape(/^(On Track|At Risk|Delayed|Slightly Delayed|On Hold|Ahead)$/);
    if (st) { var s = (card.Perf || {}).Status || r["Performance Status"] || MISSING, col = /track|ahead|on time|complete/i.test(s) ? "046A38" : /risk|slight/i.test(s) ? AMBER : RED; E.setParas(st, { text: s, color: col === AMBER ? "000000" : "FFFFFF" }); E.setFill(st, col); }
    var brief = textShape(/^To design|^The |^Design|^Supply|^Construct|^The project|^The scope/);
    var briefs = E.all(d, NS.p, "sp").filter(function (x) { var p = E.pos(x); return p && p.x < 600000 && p.y > 2000000 && p.y < 2500000 && E.text(x).length > 20; });
    if (briefs[0]) E.setParas(briefs[0], clip(r["Project Description"] || card.Description || "", 260) || miss(null));
    var ach = E.all(d, NS.p, "sp").filter(function (x) { var p = E.pos(x); return p && p.x < 600000 && p.y > 3300000 && p.y < 3600000 && E.text(x).trim(); })[0];
    var la = M.D.t("Lookahead_Activities").filter(function (x) { return x["Source.Name"] === src && x["Lookahead Activities (7 Days) Description"]; }).slice(0, 2);
    if (ach) E.setParas(ach, [r["Achievements Description"] ? clip(r["Achievements Description"], 110) : miss(null)].concat(la.map(function (x) { return "Next: " + clip(x["Lookahead Activities (7 Days) Description"], 90); })));
    var iss = E.all(d, NS.p, "sp").filter(function (x) { var p = E.pos(x); return p && p.x < 600000 && p.y > 4900000 && p.y < 5300000 && E.text(x).trim(); })[0];
    var aoc = M.D.t("Area_of_Concern").filter(function (x) { return x["Source.Name"] === src && x["Issue /Concern Description"] && !/closed|resolved/i.test(x.Status || ""); }).slice(0, 4);
    if (!src) aoc = M.D.t("Issue_register").filter(function (y) { return String(y["Poject Code"]) === code && !/resolved|closed/i.test(y["Issue Status"] || ""); })
      .slice(0, 4).map(function (y) { return { "Issue /Concern Description": y["Issue Title"] || y["Issue (Description)"] }; });
    if (iss) E.setParas(iss, aoc.length ? aoc.map(function (x) { return clip(x["Issue /Concern Description"], 110); }) : (r["Issue/Concern Description"] && !/closed/i.test(r.Status || "") ? [clip(r["Issue/Concern Description"], 160)] : ["No open issues reported."]));
    // project information
    var info = textShape(/^Original Contract Value/);
    if (info) {
      var be = pg.end, fe = pg.fe, vo = N(r["Variation Order Amount"]);
      E.setRuns(info, 0, [null, ": " + (money(x.cv) || MISSING) + " SAR"]); E.setRuns(info, 1, [null, ": " + (vo ? money(vo) + " SAR" : "-")]);
      E.setRuns(info, 2, [null, ": " + (dLong(pg.start) || MISSING)]); E.setRuns(info, 3, [null, ": " + (dLong(be) || MISSING)]);
      E.setRuns(info, 4, [null, fe && be && fe > be ? { text: " : " + MISSING, color: RED } : " : N/A"]); E.setRuns(info, 5, [null, ": " + (dLong(fe) || MISSING)]);
    }
    // CAPEX / KPI box
    var sp = M.spend.filter(function (p) { return p.ID === code; })[0];
    var kp = M.codeKpi[code], kl = textShape(/^CAPEX/);
    if (kl) E.setParas(kl, kp === 7 ? "CAPEX - KPI" : kp === 8 ? "Non-KPI Spending" : (r["Budget Type"] ? r["Budget Type"] + " - No KPI" : "No KPI"));
    var bl = textShape(/^Yearly Budget/);
    if (bl) {
      if (sp) {
        var vr = sp.ytdAct - sp.ytdPlan;
        E.setRuns(bl, 0, [(M.D.hasRev ? "Rev Plan 2026 : " : "Yearly Budget  : ") + mio(sp.fy)]); E.setRuns(bl, 1, [(M.D.hasRev ? "YTD Rev Plan   : " : "YTD Plan           : ") + mio(sp.ytdPlan)]); E.setRuns(bl, 2, ["YTD Actual       : " + mio(sp.ytdAct)]);
        E.setRuns(bl, 3, ["Variance           :  ", { text: (vr > 0 ? "+ " : vr < 0 ? "- " : "") + mio(Math.abs(vr)), color: vr < 0 ? RED : GREEN }]); E.setRuns(bl, 4, ["Forecast 2026 : " + mio(sp.fcFY)]);
      } else E.setParas(bl, { text: "Not in the 2026 Spending Plan", color: RED });
    }
    // progress + SPI
    var pl = pg.plan, ac = pg.act, vr2 = (ac || 0) - (pl || 0), spi = pg.spi;
    var x0 = x, paidOf = N(r["Paid Amount"]) != null ? N(r["Paid Amount"]) : (N((card.Perf || {}).Paid) || 0);
    E.all(d, NS.p, "graphicFrame").forEach(function (f) {
      var cp = pkg.chartOf(path, f); if (!cp) return;
      var x = pkg.xml(cp).documentElement.textContent;
      if (/Plan%/.test(x)) pkg.setChart(cp, { cats: ["Progress"], series: [{ name: "Actual", values: [ac] }, { name: "Plan%", values: [pl] }] });
      else if (/IPC/.test(x)) { var paid = paidOf, cv = x0.cv || 0; pkg.setChart(cp, { cats: ["IPC Paid / Approved", "Remaining Amount"], series: [{ name: "IPC", values: [paid, Math.max(0, cv - paid)] }] }); }
    });
    var varT = E.all(d, NS.a, "tbl").filter(function (t) { return /^Variance/.test(E.all(t, NS.a, "t").map(function (x) { return x.textContent; }).join("").trim()); })[0];
    if (varT) E.cellText(E.cells(E.rows(varT)[0])[0], [[{ text: "Variance " }, pl == null ? { text: "- ", color: "768692" } : { text: sgnPct(vr2) + " ", color: vr2 < 0 ? RED : GREEN }]]);
    var box = byName(/^Rectangle: Rounded Corners 5$/)[0], arrow = byName(/^Arrow: Notched Right/)[0], good = spi != null && spi >= 1;
    if (box) { E.setParas(box, { text: spi == null ? "-" : spi.toFixed(2), color: good ? GREEN : RED }); E.setFill(box, good ? "CCFFCC" : "FFCCFF", good ? GREEN : RED); }
    if (arrow) { arrow.getElementsByTagNameNS(NS.a, "xfrm")[0].setAttribute("rot", good ? "16200000" : "5400000"); E.setFill(arrow, good ? GREEN : RED); }
    var paidT = textShape(/^Paid \/ Approved IPCs/); if (paidT) E.setRuns(paidT, 1, [money(paidOf) + ".00 SAR"]);
    // milestones table
    var mt = E.all(d, NS.a, "tbl").filter(function (t) { return /MILESTONE/i.test(t.textContent); })[0];
    if (mt) {
      var ms;
      if (pg.acts && pg.acts.length) {   // card section 8: execution activities (the 5 heaviest, in card order)
        var top5 = pg.acts.slice().sort(function (a, b) { return (N(b.Weight) || 0) - (N(a.Weight) || 0); }).slice(0, 4);
        ms = pg.acts.filter(function (t) { return top5.indexOf(t) >= 0; }).map(function (t) { return { Description: t.Name, "Planned progress": t.Plan, "Actual Progress": t.Actual }; });
      } else ms = !src ? [] : M.D.t("Project_Milestones_Progress").filter(function (x) { return x["Source.Name"] === src && x.Description; }).sort(function (a, b) { return (N(a.Sort) || 0) - (N(b.Sort) || 0); }).slice(0, 5);
      var rows = E.resizeRows(mt, 1, 1, Math.max(ms.length, 1));
      if (!ms.length) { var c0 = E.cells(rows[0]); E.cellText(c0[0], miss(null)); E.cellText(c0[1], ""); E.cellText(c0[2], ""); }
      ms.forEach(function (x, i) { var c = E.cells(rows[i]); E.cellText(c[0], pg.acts && pg.acts.length ? { text: clip(actAbbr(x.Description), 17), size: 6.5 } : clip(String(x.Description).toUpperCase(), 22)); E.cellText(c[1], pct(x["Planned progress"])); E.cellText(c[2], pct(x["Actual Progress"])); });
      var fr = mt.parentNode; while (fr && fr.localName !== "graphicFrame") fr = fr.parentNode; if (fr) E.fitTable(fr);
    }
    // progress photos → placeholder
    if (photo) E.all(d, NS.p, "pic").forEach(function (pic) {
      var p = E.pos(pic); if (!p || p.y < 4900000 || p.w < 1000000) return;
      var blip = pic.getElementsByTagNameNS(NS.a, "blip")[0]; if (blip) pkg.setImage(path, blip.getAttributeNS(NS.r, "embed"), photo);
    });
  }

  /* project in closing */
  function fillClosing(pkg, path, M, r) {
    var d = pkg.xml(path), code = String(r.Code || ""), cd = M.D.t("Contract_Details").filter(function (x) { return String(x.Code) === code; })[0] || {}, card = M.cards[code] || {};
    function textShape(re) { return E.all(d, NS.p, "sp").filter(function (s) { return re.test(E.text(s)); })[0]; }
    var t = textShape(/^Project - /); if (t) E.setParas(t, "Project - " + code + " : " + clip(r["Project Name"], 70));
    var c1 = textShape(/^Contractor\s/); if (c1) E.setParas(c1, [[{ text: "Contractor            : " }, miss(clip(r.Contractor, 18))]]);
    var c2 = textShape(/^Consultant\s/); if (c2) E.setParas(c2, [[{ text: "Consultant            : " }, miss(null)]]);
    var c3 = textShape(/^Funded by/); if (c3) E.setParas(c3, [[{ text: "Funded by             : " }, miss((card.Fund || {}).Org)]]);
    var brief = E.all(d, NS.p, "sp").filter(function (s) { var p = E.pos(s); return p && p.y > 2400000 && p.y < 3200000 && E.text(s).length > 30; })[0];
    if (brief) E.setParas(brief, clip(cd.Scope || card.Description || "", 230) || miss(null));
    var tbl = E.all(d, NS.a, "tbl").filter(function (x) { return /ISSUES/.test(x.textContent); })[0];
    if (tbl) {
      var pend = closingSteps(M).filter(function (k) { return stepState(r, k).status !== "Completed" && stepState(r, k).status !== "NA"; });
      var items = [];
      if (r["Current Status"]) items.push([clip(r["Current Status"], 200), r["Action Plan"] ? clip(r["Action Plan"], 200) : null]);
      if (pend.length) items.push(["Pending close-out steps: " + pend.join(", "), null]);
      if (!items.length) items.push([null, null]);
      var rows = E.resizeRows(tbl, 1, 1, items.length);
      items.forEach(function (it, i) { var c = E.cells(rows[i]); E.cellText(c[0], (i + 1) + "."); E.cellText(c[1], miss(it[0])); E.cellText(c[2], miss(it[1])); });
      var fr = tbl.parentNode; while (fr && fr.localName !== "graphicFrame") fr = fr.parentNode; if (fr) E.fitTable(fr);
    }
  }

  /* organisation chart: the template's EAST names are replaced by placeholders (NSR team to be entered) */
  function fillOrg(pkg, path) {
    var d = pkg.xml(path);
    E.all(d, NS.p, "sp").forEach(function (s) {
      var tx = E.text(s).trim(), nm = s.getElementsByTagNameNS(NS.p, "cNvPr")[0].getAttribute("name") || "";
      if (!tx || /^Title/.test(nm) || /Organization Chart/.test(tx) || /^SUMMARY$/i.test(tx)) return;
      E.setParas(s, { text: MISSING, color: RED });
    });
    E.all(d, NS.a, "tc").forEach(function (tc) {   // the site-team table under the chart
      if (E.all(tc, NS.a, "t").some(function (t) { return t.textContent.trim(); })) E.cellText(tc, { text: MISSING, color: "FFFFFF" });
    });
  }

  /* ================================================================== main */
  function build(templateBuffer, D) {
    var M = model(D);
    return E.Pkg.open(templateBuffer).then(function (pkg) {
      pkg.snapshot();
      var S = findSlides(pkg), jobs = Promise.resolve();
      function need(k) { if (!S[k] || !S[k].length) throw new Error("Template slide not found: " + k + ". Use the PD weekly Balance Scorecard template."); return S[k][0]; }
      var order = [];                     // [path, fill()] in slide order
      function clones(key, groups, fill) {
        var master = need(key), last = master;
        groups.forEach(function (g, i) {
          if (i === 0) { order.push(function () { fill(master, g, 0); }); return; }
          jobs = jobs.then(function () { return pkg.cloneSlide(master, last).then(function (p) { last = p; order.push(function () { fill(p, g, i); }); }); });
        });
        (S[key] || []).slice(1).forEach(function (p) { jobs = jobs.then(function () { pkg.deleteSlide(p); }); });
      }
      var photo = null;
      jobs = jobs.then(function () { return photoPlaceholder().then(function (b) { photo = pkg.freeName("ppt/media", "nsr_photo", ".png"); pkg.zip.file(photo, b); pkg.ensureDefault("png", "image/png"); }); });
      // closing action points: 2 projects per slide
      var openCl = openClosing(M);
      clones("closingActions", chunk(openCl, 2), function (p, g, i) { fillClosingActions(pkg, p, M, g, i * 2 + 1); });
      // CAPEX projects only (KPI code 7) on both spending slides
      var ci = M.months.indexOf(M.cut), withPlan = M.spend.filter(function (p) { return p.fy || p.ytdAct || p.fcFY; });
      var cap = withPlan.filter(function (p) { return M.codeKpi[p.ID] === 7; }).sort(function (a, b) { return b.fy - a.fy; });
      // spending-plan action points: overall CAPEX + the 3 CAPEX projects furthest behind their plan at the cut-off
      var behind = cap.slice().sort(function (a, b) { var va = matrixRows(a.mPlan, a.mAct)[4][ci] || 0, vb = matrixRows(b.mPlan, b.mAct)[4][ci] || 0; return va - vb; }).slice(0, 3);
      clones("spendActions", [behind], function (p, g) { fillMatrixSlide(pkg, p, M, null, "Overall NSR Program – CAPEX", overallOf(cap, M), g); });
      // CAPEX monthly plan: 3 projects per slide
      clones("monthly", chunk(cap, 3), function (p, g) { fillMatrixSlide(pkg, p, M, null, "Overall NSR Program – CAPEX", overallOf(cap, M), g); });
      // SPI cards: 11 per slide
      var spiList = M.weekly.filter(function (r) { return M.scurve(r["Source.Name"]).length; });
      var perSpi = 11;
      clones("spi", chunk(spiList, perSpi), function (p, g, i) { fillSpi(pkg, p, M, g, i === 0); });
      // delivery KPI: 2 per slide
      clones("delivery", chunk(M.D.t("Delivery_KPI").filter(function (r) { return r["Project Code"] != null; }), 2), function (p, g) { fillDelivery(pkg, p, M, g); });
      // one slide per project in execution / in closing
      clones("exec", M.exec, function (p, x) { fillExec(pkg, p, M, x, photo); });
      clones("closing", openCl.length ? openCl : [null], function (p, r) { if (r) fillClosing(pkg, p, M, r); });
      return jobs.then(function () {
        if (S.cover) fillCover(pkg, S.cover[0], M);
        if (S.overall) fillOverall(pkg, S.overall[0], M);
        if (S.kpi) fillKpi(pkg, S.kpi[0], M);
        if (S.values) fillValues(pkg, S.values[0], M);
        if (S.capex) fillCapex(pkg, S.capex[0], M);
        if (S.org) fillOrg(pkg, S.org[0]);
        order.forEach(function (f) { f(); });
        pkg.slides().forEach(function (p) { renameProgram(pkg, p); });
        pkg.gc();
        return pkg.finish();
      });
    });
  }

  window.SARWeeklyPpt = { build: build, model: model };
})();

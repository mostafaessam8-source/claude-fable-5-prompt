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
  var SPI_OK = 0.91;                       // SPI colour rule for the whole deck: below the KPI target red, otherwise green (set from the KPI sheet in build)
  function spiCol(v) { return v != null && v >= SPI_OK ? GREEN : RED; }
  function tgtCol(v, M) { return v != null && v >= M.spiTarget ? GREEN : RED; }   // Program Values SPI donut: against the KPI target shown under it
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  /* ------------------------------------------------------------------ formatting */
  function N(v) { return typeof v === "number" && isFinite(v) ? v : (typeof v === "string" && v.trim() !== "" && !isNaN(+v) ? +v : null); }
  function money(v) { v = N(v); return v == null ? "" : (Math.round(v) || 0).toLocaleString("en-US"); }
  function mio(v, d) { v = N(v); return v == null ? "" : (v / 1e6).toFixed(d == null ? 1 : d) + " M"; }
  function sarM(v) { v = N(v); return v == null ? "" : "SAR " + (v / 1e6).toFixed(1) + "M"; }
  function sarB(v) { v = N(v); return v == null ? "" : (Math.abs(v) >= 1e9 ? (v / 1e9).toFixed(2) + " B" : (v / 1e6).toFixed(1) + " M"); }
  function bigB(v) { v = N(v); return v == null ? "" : (Math.abs(v) >= 1e9 ? (v / 1e9).toFixed(1) + "\u00A0B" : Math.round(v / 1e6) + "M"); }   // headline tiles fit ~9 characters
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
    // one row per project: its latest week (an older week's file left in the import never wins)
    var wk = {}; D.t("Weekly_Report_Updates").forEach(function (r) { var s = r["Project Code"] != null && r["Project Code"] !== "" ? "c:" + String(r["Project Code"]) : r["Source.Name"] ? "s:" + r["Source.Name"] : null;
      if (s && (!wk[s] || String(r["Report Date"] || "") > String(wk[s]["Report Date"] || ""))) wk[s] = r; });
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
    // "Projects in the Execution Phase" slides: one per project of the Progress section (weekly progress report),
    // with its weekly progress; the project card only fills gaps (contractor, consultant, funding, description)
    M.exec = M.weekly.map(function (r) { var x = { code: String(r["Project Code"]), card: M.cards[String(r["Project Code"])] || null, w: r }; x.p = progOf({ w: r }); x.cv = N(r["Contract Value"]) || 0; return x; });
    // project-card portfolio (Project Cards section): projects in execution and their SPI from card sections 7 & 8
    M.cardList = Object.keys(M.cards).map(function (k) { return M.cards[k]; });
    M.cardExec = M.cardList.filter(function (c) { return /^execution/i.test(c.ActualPhase || ""); }).map(function (c) { var x = { card: c, w: {} }; x.p = progOf(x); x.wt = N((c.Fund || {}).CON) || N((c.Fund || {}).Budget) || 0; return x; });
    var cpv = sum(M.cardExec, function (x) { return x.p.plan ? x.wt * x.p.plan : 0; }), cev = sum(M.cardExec, function (x) { return x.p.plan ? x.wt * (x.p.act || 0) : 0; });
    M.cardSpi = cpv ? cev / cpv : null;
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
      ["cover", /Balance Scorecard[\s\S]*Weekly Meeting/i], ["closingActions", /Old projects status|Remaining Actions\/Deliverables/i], ["spendActions", /Spending plan as discussed|Action Points#[\s\S]*M Plan/i],
      ["overall", /Projects overall update/i], ["kpi", /KPI Balance Scorecard/i], ["spi", /Schedule Performance Index SPI/i],
      ["values", /Program Values/i], ["delivery", /Delivery Against Approved Business Plan|DELIVERY PROGRESS/i], ["capex", /CAPEX 2026 - Status|List of Capex projects/i],
      ["monthly", /Monthly Plan - CAPEX/i], ["exec", /Projects in the Execution Phase/i], ["pending", /Pending Points/i],
      ["closing", /Projects in the Closing Phase/i], ["thanks", /THANK YOU/], ["org", /Organization Chart/i]];
    list.forEach(function (p) {
      var t = titleOf(pkg, p);
      for (var i = 0; i < rules.length; i++) if (rules[i][1].test(t)) { (S[rules[i][0]] = S[rules[i][0]] || []).push(p); break; }
    });
    return S;
  }

  /* Blank template support: the master NSR template is the PD sample with its data removed. Shapes the fillers find by
     their text are empty there, so each one gets a neutral placeholder (by shape id, only when empty) before filling.
     On the full sample deck nothing changes, because those shapes already hold text. */
  var CARD_NAMES = [48, 51, 54, 58, 61, 128, 131, 134, 137, 12, 16], CARD_VALS = [49, 52, 55, 59, 62, 129, 132, 135, 138, 15, 20];
  var SEEDS = {
    closingActions: { 3: "Old projects status+ expected date to proceed:" },
    spendActions: { 3: "Spending plan as discussed during the meeting+ why we couldn\u2019t spend?:" },
    spi: (function () { var o = { 45: "Current SPI  \u2022  Target", 11: "0.00", 141: "0.00" }; CARD_NAMES.forEach(function (k) { o[k] = "Project"; }); CARD_VALS.forEach(function (k) { o[k] = "0.00"; }); return o; })(),
    values: { 130: "0.00", 144: "Target:0", 68: ["", "    Legacy", "Projects", "SAR"], 69: ["CONTRACTED VALUE", "SAR", "Issued PO\u2019s"] },
    delivery: { 9: "1", 10: "CODE", 12: "Project name", 14: "0,000,000", 23: "01-Jan-26", 24: "01-Jan-26", 25: "01-Jan-26", 49: "Planned", 52: "EOT", 4: "Note",
      55: "2", 56: "CODE", 58: "Project name", 60: "0,000,000", 69: "01-Jan-26", 70: "01-Jan-26", 71: "01-Jan-26", 95: "Planned" },
    capex: { 10: "SAR 0.0M", 13: "SAR 0.0M", 16: "SAR 0.0M", 19: "0%", 44: "SAR 0.0M", 41: "Achieved" },
    exec: { 113: "Project brief placeholder text", 123: "Achievements placeholder", 187: "Issues placeholder", 343: "Yearly Budget", 6: "0.00",
      323: ["Original Contract Value", "Change Order", "Start Date", "End Date", "EOT", "Forecast End Date"] },
    closing: { 30: "Project brief placeholder text for the closing project" }
  };
  function seedSlide(pkg, path, key) {
    var map = SEEDS[key]; if (!map) return;
    var d = pkg.xml(path);
    Object.keys(map).forEach(function (id) {
      var sp = E.shape(d, id); if (!sp || E.text(sp).trim()) return;
      var v = map[id], ps = E.all(sp, NS.a, "p");
      (Array.isArray(v) ? v : [v]).forEach(function (txt, i) {
        var p = ps[i]; if (!p || !txt) return;
        var t = E.all(p, NS.a, "t")[0];
        if (t) t.textContent = txt;
        else { var r = p.ownerDocument.createElementNS(NS.a, "a:r"), tt = p.ownerDocument.createElementNS(NS.a, "a:t"); tt.textContent = txt; r.appendChild(tt); var end = E.kids(p, NS.a, "endParaRPr")[0]; p.insertBefore(r, end || null); }
      });
    });
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
        tr.setAttribute("h", String(si === 0 ? 245000 : 182000));    // 3 projects × 8 steps fit like the sample's slide
        if (si === 0) {
          [0, 1, 2].forEach(function (i) { c[i].setAttribute("rowSpan", String(steps.length)); });
          E.cellText(c[0], String(startNo + pi)); E.cellText(c[1], (r.Code || "") + " – " + clip(r["Project Name"], 40)); E.cellText(c[2], miss(null));
          E.cellText(c[7], clip([r["Current Status"], r["Action Plan"]].filter(Boolean).join(" · "), 120) || "");
        } else E.cellText(c[7], "");
        var owner = si === 0 ? (r["Project Manager"] || stepOwner(k)) : stepOwner(k);
        if (now) {          // highlight who holds the action now
          E.cellText(c[3], { text: "► " + owner, color: "FFFFFF", bold: true }); E.cellFill(c[3], TEAL);
          E.cellText(c[4], { text: k, color: TEAL, bold: true }); E.cellFill(c[4], "E6F1F4");
        } else {
          E.cellText(c[3], done ? { text: owner, color: "A6A6A6", bold: false } : { text: owner, bold: false });
          E.cellText(c[4], done ? { text: k, color: "A6A6A6", bold: false } : { text: k, bold: false });
        }
        E.cellText(c[5], st.status === "Completed" ? { text: "Completed", color: GREEN } : now ? { text: st.status === "Not Started" ? "Pending" : st.status, color: "C55A11", bold: true }
          : st.status === "Not Started" ? { text: "Not Started", color: RED } : st.status);
        E.cellText(c[6], st.date ? st.date : miss(null));
        // empty paragraphs of the merged-away cells carry no size and default to 18 pt, which makes every row tall
        E.all(tr, NS.a, "p").forEach(function (pp) {
          if (E.all(pp, NS.a, "rPr").some(function (x) { return x.getAttribute("sz"); }) || E.all(pp, NS.a, "endParaRPr").some(function (x) { return x.getAttribute("sz"); })) return;
          var ep = E.all(pp, NS.a, "endParaRPr")[0] || pp.appendChild(pp.ownerDocument.createElementNS(NS.a, "a:endParaRPr")); ep.setAttribute("sz", "600");
        });
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
  /* KPI groups split over slides: whole groups only, at most KPI_ROWS rows (group + KPI rows) per slide */
  var KPI_ROWS = 11;
  function kpiPages(M) {
    var pages = [], cur = [], n = 0, all = uniq(M.kpi.map(function (r) { return r["KPI Filter"]; }));
    all.forEach(function (g, gi) {
      var k = 1 + M.kpi.filter(function (r) { return r["KPI Filter"] === g; }).length;
      if (cur.length && n + k > KPI_ROWS) { pages.push(cur); cur = []; n = 0; }
      cur.push({ g: g, no: gi + 1 }); n += k;
    });
    if (cur.length) pages.push(cur);
    return pages.length ? pages : [[]];
  }
  function fillKpi(pkg, path, M, page) {
    var d = pkg.xml(path), frame = E.shapesByName(d, /^Table/)[0], tbl = E.table(frame), rs = E.rows(tbl);
    var hdr = rs[0], catTpl = rs[1], kpiTpl = rs[2], cutTxt = M.cut ? dShort(M.cut.slice(0, 8) + new Date(Date.UTC(+M.cut.slice(0, 4), +M.cut.slice(5, 7), 0)).getUTCDate()) : "";
    var hc = E.cells(hdr);
    if (hc[5]) E.cellText(hc[5], "YTD Plan till " + cutTxt); if (hc[6]) E.cellText(hc[6], "YTD Actual till " + cutTxt);
    rs.slice(1).forEach(function (r) { tbl.removeChild(r); });
    (page || kpiPages(M)[0]).forEach(function (pg) {
      var g = pg.g, gi = pg.no - 1;
      var list = M.kpi.filter(function (r) { return r["KPI Filter"] === g; });
      var cr = catTpl.cloneNode(true), cc = E.cells(cr), w = sum(list, function (r) { return r["KPI Weight (%)"]; }), res = sum(list, function (r) { return r["KPI Result"]; });
      E.cellText(cc[0], (gi + 1) + ". " + g + " (" + pct(w, 0) + ")"); E.cellText(cc[1], pct(w, 0)); E.cellText(cc[2], pct(res, 0));
      for (var i = 3; i < cc.length; i++) E.cellText(cc[i], "");
      cr.setAttribute("h", "300000"); tbl.appendChild(cr);
      list.forEach(function (r) {
        var tr = kpiTpl.cloneNode(true), c = E.cells(tr), ach = N(r["% Achieved"]), name = r["Objective/ KPIs"] || "";
        var crit = /\(([-+±]?\d+%?)\)/.exec(name);
        E.cellText(c[0], clip(name, 60)); E.cellText(c[1], pct(r["KPI Weight (%)"], 0)); E.cellText(c[2], pct(r["KPI Result"], 1));
        E.cellText(c[3], crit ? crit[1] : (/schedule performance/i.test(name) ? String(M.spiTarget) : { text: MISSING, color: RED, size: 6.5 }));   // one line, keeps rows compact
        E.cellText(c[4], kpiVal(r["NSR Spend Plan 2026 as per Budgeting"]) || miss(null));
        E.cellText(c[5], kpiVal(r["YTD Spend Plan 2026 as per Budgeting"]) || "-"); E.cellText(c[6], kpiVal(r["YTD Actual"]) || "-");
        E.cellText(c[7], pct(ach, 0)); E.cellFill(c[7], ach == null ? null : ach >= 0.95 ? GREEN : ach >= 0.85 ? AMBER : "FF0000");
        var rem = r.Remarks ? clip(r.Remarks, 90) : "";
        if (!rem && M.D.hasRev && /capex/i.test(name)) {
          var cap = M.spend.filter(function (p) { return p.kpi === 7; });
          rem = "Revised Spend Plan 2026 (Budget 2026 VP): " + mio(sum(cap, function (p) { return p.fy; })) + " vs original " + mio(sum(cap, function (p) { return p.fyOrig; })) + "; year-end forecast " + mio(sum(cap, function (p) { return p.ytdAct + p.fcRem; }));
        }
        E.cellText(c[8], rem);
        tr.setAttribute("h", "350000"); tbl.appendChild(tr);
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
    var others = E.all(d, NS.p, "cNvPr").map(function (n) { return n.parentNode.parentNode; })
      .filter(function (s) { return s.parentNode && s.parentNode.localName === "spTree"; });   // group children use the group's own coordinates (e.g. the SPI gauge)
    return boxes.map(function (b) {
      var inside = others.filter(function (s) { if (s === b.box) return false; var p = E.pos(s); return p && p.x >= b.p.x - 20000 && p.y >= b.p.y - 20000 && p.x < b.p.x + b.p.w && p.y < b.p.y + b.p.h; });
      var texts = inside.filter(function (s) { return s.localName === "sp" && E.text(s).trim(); }).sort(function (a, c) { return E.pos(a).y - E.pos(c).y; });
      return { box: b.box, y: b.p.y, x: b.p.x, name: texts[0], value: texts[1], chart: inside.filter(function (s) { return s.localName === "graphicFrame" && s.getElementsByTagNameNS(NS.c, "chart").length; })[0], all: inside };
    }).sort(function (a, b) { return a.y - b.y || a.x - b.x; });
  }
  function lineColor(sh, hex) {          // shape outline colour
    var spPr = sh && sh.getElementsByTagNameNS(NS.p, "spPr")[0], ln = spPr && spPr.getElementsByTagNameNS(NS.a, "ln")[0]; if (!ln) return;
    E.all(ln, NS.a, "srgbClr").forEach(function (c) { if (c.parentNode.parentNode === ln) c.setAttribute("val", hex); });
  }
  function serColor(pkg, cp, idx, hex) {  // line + markers of one chart series
    var ser = E.all(pkg.xml(cp), NS.c, "ser")[idx]; if (!ser) return;
    Array.prototype.forEach.call(ser.childNodes, function (k) {
      if (k.localName === "spPr" || k.localName === "marker") E.all(k, NS.a, "srgbClr").forEach(function (c) { c.setAttribute("val", hex); });
    });
  }
  function ptColor(pkg, cp, pt, hex) {   // one data point of the first series (doughnut slice)
    var ser = E.all(pkg.xml(cp), NS.c, "ser")[0]; if (!ser) return;
    E.all(ser, NS.c, "dPt").forEach(function (dp) { var i = E.all(dp, NS.c, "idx")[0]; if (i && +i.getAttribute("val") === pt) E.all(dp, NS.a, "srgbClr").forEach(function (c) { if (c.parentNode.parentNode.localName === "spPr") c.setAttribute("val", hex); }); });
  }
  function fillSpi(pkg, path, M, list, first) {
    var d = pkg.xml(path), cards = cardsOn(d);
    var big = E.shapesByName(d, /^Text 7$/).filter(function (s) { return /^\d/.test(E.text(s).trim()); })[0];
    if (big) E.setParas(big, M.spi == null ? miss(null) : { text: M.spi.toFixed(2), color: spiCol(M.spi) });
    E.shapesByName(d, /^Text 8$/).forEach(function (s) { if (/Current SPI/i.test(E.text(s))) E.setParas(s, "Current SPI  •  Target " + M.spiTarget); });
    E.shapesByName(d, /^TextBox 10$/).forEach(function (s) { if (/^0\.\d+$/.test(E.text(s).trim())) E.setParas(s, String(M.spiTarget)); });
    cards.forEach(function (c, i) {
      var r = list[i];
      if (!r) { c.all.concat([c.box]).forEach(E.removeEl); return; }
      var spi = wSpi(r), name = r["Project Code"] + " - " + shortName(r["Project Name"], 22);
      if (c.name) E.setParas(c.name, critical(r, M) ? [[{ text: name }, { text: " - Critical", color: RED }]] : name);
      if (c.value) E.setParas(c.value, { text: spi == null ? "-" : spi.toFixed(2), color: spiCol(spi) });
      lineColor(c.box, spiCol(spi));
      if (c.chart) {
        var cp = pkg.chartOf(path, c.chart), s = spiSeries(M, r);
        if (cp) { pkg.setChart(cp, { cats: s.cats, catFmt: "d-mmm", series: [{ name: "SPI", values: s.vals }, { name: "Target", values: s.cats.map(function () { return M.spiTarget; }) }] }); serColor(pkg, cp, 0, spiCol(spi)); }
      }
    });
  }

  /* program values dashboard */
  function setLine(el, pi, text) { E.setRuns(el, pi, [text]); }
  /* Program Values from the PD programme database (PD_PPT_Data_Requirement_For_all_Program_<date>.xlsx), NSR rows only */
  function fillValuesPd(pkg, path, M, db) {
    var d = pkg.xml(path), num = function (v) { var x = N(v); return x == null ? 0 : x; };
    var T = function (r) { return String(r.Type || "").trim().toLowerCase(); }, PH = function (r) { return String(r["Project Phase"] || "").trim().toLowerCase(); };
    var exe = db.filter(function (r) { return T(r) === "on going" || PH(r) === "execution"; }), pipe = db.filter(function (r) { return T(r) === "pipeline"; });
    var leg = db.filter(function (r) { return T(r) === "legacy"; }), pmo = db.filter(function (r) { return /^y/i.test(r["PMO List"] || ""); });
    var full = sum(db, function (r) { return num(r["Approved Budget"]); }), cv = sum(db, function (r) { return num(r["Final Contract Amount"]); }), paid = sum(db, function (r) { return num(r["Total Paid"]); });
    var po = db.filter(function (r) { var x = r["PO#"]; return x != null && x !== "" && String(x) !== "0"; });
    var poExe = po.filter(function (r) { return exe.indexOf(r) >= 0; }).length, poLeg = po.filter(function (r) { return leg.indexOf(r) >= 0; }).length;
    var yrs = uniq(leg.map(function (r) { var y = r["Closed Year"] || String(r.Project_ED || "").slice(0, 4); return y ? String(y) : null; })).sort();
    var byText = function (re) { return E.all(d, NS.p, "sp").filter(function (s) { return re.test(E.text(s).replace(/\s+/g, " ")); })[0]; };
    function bsum(list) { return "SAR " + sarB(sum(list, function (r) { return num(r["Approved Budget"]); })); }
    var b1 = byText(/APPROVED ?BUDGET/); if (b1) { setLine(b1, 1, "SAR " + bigB(full)); setLine(b1, 2, db.length + " projects"); }
    var b2 = byText(/CONTRACTED ?VALUE/); if (b2) { setLine(b2, 1, "SAR " + bigB(cv)); setLine(b2, 2, "Issued PO's - " + po.length + " projects (" + poExe + " Execution" + (poLeg ? " + " + poLeg + " Legacy" : "") + ")"); }
    var b3 = byText(/TOTAL ?PAID/); if (b3) { setLine(b3, 1, "SAR " + bigB(paid)); setLine(b3, 2, (cv ? Math.round(paid / cv * 100) : 0) + " % of contracted value"); }
    function grp(re, list, label) { var b = byText(re); if (!b) return; if (label) setLine(b, 1, label); setLine(b, 2, list.length + " Projects"); setLine(b, 3, bsum(list)); }
    grp(/PMO Reporting Card/, pmo);
    grp(/Under Execution/, exe);
    grp(/Pipeline/, pipe);
    grp(/Legacy|Handover/, leg, "    Legacy ( Completed" + (yrs.length ? " – " + (yrs.length > 1 ? yrs[0] + "-" + yrs[yrs.length - 1] : yrs[0]) : "") + ")");
    var spiTxt = byText(/^\s*\d\.\d+\s*$/); if (spiTxt) E.setParas(spiTxt, M.spi == null ? "-" : { text: M.spi.toFixed(2), color: tgtCol(M.spi, M) });   // SPI: Progress section
    var tg = byText(/^Target:/); if (tg) E.setParas(tg, "Target:" + M.spiTarget);
    var ob = byText(/Overall Budget/); if (ob) setLine(ob, 0, "SAR " + sarB(cv));
    E.all(d, NS.a, "t").forEach(function (t) { if (/East Program - DB/.test(t.textContent)) t.textContent = t.textContent.replace("East Program - DB", "NSR Program - DB"); });
    var st = ["Delayed", "On Hold", "On Track", "At Risk"], norm = function (z) { z = String(z || ""); return /slight|risk/i.test(z) ? "At Risk" : /hold/i.test(z) ? "On Hold" : /track|on time/i.test(z) ? "On Track" : /delay/i.test(z) ? "Delayed" : z; };
    var stCnt = st.map(function (z) {   // file's Overall Status, else the weekly report / project card of the execution projects
      var n = exe.filter(function (r) { return norm(r["Overall Status"]) === z; }).length;
      return n;
    });
    if (!sum(stCnt)) stCnt = st.map(function (z) { return M.cardList.filter(function (c) { return /^execution/i.test(c.ActualPhase || "") && norm((c.Perf || {}).Status) === z; }).length; });
    var phases = [["Execution", function (r) { return PH(r) === "execution"; }], ["Planning", function (r) { return PH(r) === "planning"; }],
      ["Tendering", function (r) { return PH(r) === "tendering"; }], ["Closing", function (r) { return /closing|completed|closed/.test(PH(r)); }], ["On Hold", function (r) { return PH(r) === "on hold"; }]]
      .map(function (p) { return [p[0], db.filter(p[1]).length]; }).filter(function (p, i) { return i < 4 || p[1]; });
    E.shapesByName(d, /^Chart \d/).forEach(function (f) {
      var cp = pkg.chartOf(path, f); if (!cp) return;
      var cx = pkg.xml(cp), sv = E.all(cx, NS.c, "tx").map(function (t) { var v = E.all(t, NS.c, "v")[0]; return v ? v.textContent : ""; })[0] || "";
      var x = cx.documentElement.textContent + " |ser:" + sv, sp = M.spi || 0;
      if (/^\s*SPI\s*$/.test(sv)) x += " Remaining to target"; if (/^\s*Phase\s*$/.test(sv)) x += " Phase Execution"; if (/^\s*Size\s*$/.test(sv)) x += " Mega";
      if (/Remaining to target/.test(x)) { pkg.setChart(cp, { cats: ["Achieved", "Remaining to target 1.20"], series: [{ name: "SPI", values: [Math.round(sp * 100) / 100, Math.max(0, Math.round((1.2 - sp) * 100) / 100)] }] }); ptColor(pkg, cp, 0, tgtCol(sp, M)); }
      else if (/IPC Budget/.test(x)) pkg.setChart(cp, { cats: ["Approved IPCs ", "Remaining "], series: [{ name: "IPC Budget", values: [Math.round(paid / 1e5) / 10, Math.round(Math.max(0, cv - paid) / 1e5) / 10] }] });
      else if (/Phase/.test(x) && /Execution/.test(x)) pkg.setChart(cp, { cats: phases.map(function (p) { return p[0]; }), series: [{ name: "Phase", values: phases.map(function (p) { return p[1]; }) }] });
      else if (/Mega/.test(x)) { var sz = ["Mega", "Large", "Medium", "Small"]; pkg.setChart(cp, { cats: sz, series: [{ name: "Size", values: sz.map(function (z) { return db.filter(function (r) { return String(r["Project Size"] || "").trim().toLowerCase() === z.toLowerCase(); }).length; }) }] }); }
      else if (/On Track/.test(x) && /Delayed/.test(x)) pkg.setChart(cp, { cats: st, series: st.map(function (z, i) { return { name: z, values: st.map(function (q, j) { return j === i ? stCnt[i] : null; }) }; }) });
    });
  }
  function fillValues(pkg, path, M) {     // Project Cards section: every card of the monthly EP - NSR Projects workbook
    var pdb = M.D.t("Program_DB").filter(function (r) { return /^\s*NSR\s*$/i.test(r["Program Name"] || ""); });
    if (pdb.length) return fillValuesPd(pkg, path, M, pdb);
    var d = pkg.xml(path), cards = M.cardList;
    if (!cards.length) return;
    var bud = function (c) { return N((c.Fund || {}).Budget) || 0; };
    var full = sum(cards, bud), cv = sum(cards, function (c) { return (c.Fund || {}).CON; }), paid = sum(cards, function (c) { return (c.Perf || {}).Paid; });
    var po = cards.filter(function (c) { return N((c.Fund || {}).CON) || (c.Contracts || []).some(function (k) { return /contractor/i.test(k.Role || "") && k["PO No."]; }); });
    function ph(c) { return String(c.ActualPhase || ""); }
    var exe = cards.filter(function (c) { return /^execution/i.test(ph(c)); }), pipe = cards.filter(function (c) { return /^(creation|initiation|planning|tendering)/i.test(ph(c)); });
    var clo = cards.filter(function (c) { return /^(handover|closing|closed)/i.test(ph(c)); });
    var byText = function (re) { return E.all(d, NS.p, "sp").filter(function (s) { return re.test(E.text(s).replace(/\s+/g, " ")); })[0]; };
    var b1 = byText(/APPROVED ?BUDGET/); if (b1) { setLine(b1, 1, "SAR " + bigB(full)); setLine(b1, 2, cards.length + " projects"); }
    var b2 = byText(/CONTRACTED ?VALUE/); if (b2) { setLine(b2, 1, "SAR " + bigB(cv)); setLine(b2, 2, "Issued PO's - " + po.length + " projects (" + po.filter(function (c) { return /^execution/i.test(ph(c)); }).length + " Execution)"); }
    var b3 = byText(/TOTAL ?PAID/); if (b3) { setLine(b3, 1, "SAR " + bigB(paid)); setLine(b3, 2, (cv ? Math.round(paid / cv * 100) : 0) + " % of contracted value"); }
    function grp(re, list, label) { var b = byText(re); if (!b) return; if (label) setLine(b, 1, label); setLine(b, 2, list.length + " Projects"); setLine(b, 3, "SAR " + sarB(sum(list, bud))); }
    grp(/PMO Reporting Card/, cards);
    grp(/Under Execution/, exe);
    grp(/Pipeline/, pipe);
    grp(/Legacy/, clo, "    Handover & Closing");
    var spiTxt = byText(/^\s*\d\.\d+\s*$/); if (spiTxt) E.setParas(spiTxt, M.cardSpi == null ? "-" : { text: M.cardSpi.toFixed(2), color: tgtCol(M.cardSpi, M) });
    var tg = byText(/^Target:/); if (tg) E.setParas(tg, "Target:" + M.spiTarget);
    var ob = byText(/Overall Budget/); if (ob) setLine(ob, 0, "SAR " + sarB(cv));
    E.shapesByName(d, /^Chart \d/).forEach(function (f) {
      var cp = pkg.chartOf(path, f); if (!cp) return;
      var cx = pkg.xml(cp), sv = E.all(cx, NS.c, "tx").map(function (t) { var v = E.all(t, NS.c, "v")[0]; return v ? v.textContent : ""; })[0] || "";
      var x = cx.documentElement.textContent + " |ser:" + sv, sp = M.cardSpi || 0;
      if (/^\s*SPI\s*$/.test(sv)) x += " Remaining to target"; if (/^\s*Phase\s*$/.test(sv)) x += " Phase Execution"; if (/^\s*Size\s*$/.test(sv)) x += " Mega";
      if (/Remaining to target/.test(x)) { pkg.setChart(cp, { cats: ["Achieved", "Remaining to target 1.20"], series: [{ name: "SPI", values: [Math.round(sp * 100) / 100, Math.max(0, Math.round((1.2 - sp) * 100) / 100)] }] }); ptColor(pkg, cp, 0, tgtCol(sp, M)); }
      else if (/IPC Budget/.test(x)) pkg.setChart(cp, { cats: ["Approved IPCs ", "Remaining "], series: [{ name: "IPC Budget", values: [Math.round(paid / 1e5) / 10, Math.round(Math.max(0, cv - paid) / 1e5) / 10] }] });
      else if (/Phase/.test(x) && /Execution/.test(x)) {
        pkg.setChart(cp, { cats: ["Execution", "Planning", "Tendering", "Closing"], series: [{ name: "Phase", values: [exe.length,
          cards.filter(function (c) { return /^(creation|initiation|planning)/i.test(ph(c)); }).length, cards.filter(function (c) { return /^tendering/i.test(ph(c)); }).length, clo.length] }] });
      } else if (/Mega/.test(x)) {
        var sz = ["Mega", "Large", "Medium", "Small"];
        pkg.setChart(cp, { cats: sz, series: [{ name: "Size", values: sz.map(function (z) { return cards.filter(function (c) { return String(c.Size || "").toLowerCase() === z.toLowerCase(); }).length; }) }] });
      } else if (/On Track/.test(x) && /Delayed/.test(x)) {     // "Overall Status – Execution": cards in execution
        var st = ["Delayed", "On Hold", "On Track", "At Risk"], norm = function (z) { return /slight/i.test(z) ? "At Risk" : z; };
        var cnt = st.map(function (z) { return exe.filter(function (c) { return norm((c.Perf || {}).Status || "") === z; }).length; });
        pkg.setChart(cp, { cats: st, series: st.map(function (z, i) { return { name: z, values: st.map(function (q, j) { return j === i ? cnt[i] : null; }) }; }) });
      }
    });
  }

  /* Program Values: the embedded "… Program - DB" workbook (Excel icon on the slide) is rebuilt from NSR data —
     NSR Program - DB (the PD programme database rows behind the slide figures), Old Projects (its legacy rows) and the
     weekly SPI table — with an NSR icon label. */
  function xDate(s) { var t = ymd(s); return t ? new Date(Date.UTC(t.y, t.m - 1, t.d)) : null; }
  function valuesWorkbook(M) {
    var X = window.XLSX, wb = X.utils.book_new(), MONEY = "#,##0", PCT = "0.00%", DT = "dd-mmm-yy";
    function sheet(title, sub, head, rows, fmts, widths) {
      var aoa = (title ? [[null, null, title], [null, null, sub], []] : []).concat([head]).concat(rows);
      var ws = X.utils.aoa_to_sheet(aoa, { cellDates: true }), r0 = title ? 4 : 1;
      rows.forEach(function (row, i) { row.forEach(function (v, j) {
        var a = X.utils.encode_cell({ r: r0 + i, c: j }), c = ws[a]; if (!c) return;
        if (v && typeof v === "object" && v.f) { ws[a] = { t: "n", f: v.f }; c = ws[a]; }
        if (fmts[j]) c.z = fmts[j];
      }); });
      ws["!cols"] = widths.map(function (w) { return { wch: w }; });
      return ws;
    }
    // Old Projects (in place of EAST's "Legacy Projects"): the NSR legacy / completed rows of the PD programme database,
    // as on the slide's Legacy tile; without that file, the project cards in handover / closing / closed
    var db = M.D.t("Program_DB").filter(function (r) { return /^\s*NSR\s*$/i.test(r["Program Name"] || ""); });
    var old = db.filter(function (r) { return String(r.Type || "").trim().toLowerCase() === "legacy"; });
    var keys = db.length ? Object.keys(db[0]).filter(function (k) { return k !== "Source.Name"; }) : [];
    function dbSheet(list) {                // PD programme database rows, as in the source file
      return sheet(null, null, ["S/No"].concat(keys), list.map(function (r, i) { return [i + 1].concat(keys.map(function (k) { var v = r[k]; return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? xDate(v) : v; })); }),
        [null].concat(keys.map(function (k) { return /budget|amount|paid/i.test(k) ? MONEY : /(_SD|_ED|date)$/i.test(k) ? DT : null; })), [6].concat(keys.map(function (k) { return /name/i.test(k) ? 40 : 14; })));
    }
    if (db.length) X.utils.book_append_sheet(wb, dbSheet(db), "NSR Program - DB");   // every NSR row: the slide's figures come from here
    if (old.length) X.utils.book_append_sheet(wb, dbSheet(old), "Old Projects");
    else {
      var oc = M.cardList.filter(function (c) { return /^(handover|closing|closed)/i.test(c.ActualPhase || ""); });
      X.utils.book_append_sheet(wb, sheet(null, null, ["S/No", "Code", "Project Name", "Project Size", "Actual Phase", "Budget", "Contract Value", "Approved Paid Amount", "Overall Status"],
        oc.map(function (c, i) { var f = c.Fund || {}, p = c.Perf || {}; return [i + 1, c.Code, c.Name, c.Size, c.ActualPhase, N(f.Budget), N(f.CON), N(p.Paid), p.Status]; }),
        [null, null, null, null, null, MONEY, MONEY, MONEY, null], [6, 9, 48, 10, 14, 15, 15, 15, 14]), "Old Projects");
    }
    var spi = M.weekly.filter(function (r) { return N(r["Contract Value"]); }).map(function (r, i) {
      var n = i + 2, pl = N(r["Planned (%) - Cumulative"]), ac = N(r["Actual (%) - Cumulative"]);
      return [String(r["Project Code"]), " " + (r["Project Name"] || "") + (critical(r, M) ? " - Critical" : ""), N(r["Contract Value"]), pl, ac,
        { f: "D" + n + "*C" + n }, { f: "E" + n + "*C" + n }, { f: "IF(F" + n + "=0,\"\",G" + n + "/F" + n + ")" }, pl != null && ac != null ? ac - pl : null];
    });
    X.utils.book_append_sheet(wb, sheet(null, null, ["Code", "Project", "Contract Value", "Planned%", "Actual", "PV", "EV", "SPI", "Variance"], spi,
      [null, null, MONEY, PCT, PCT, MONEY, MONEY, "0.00", PCT], [9, 60, 15, 10, 10, 15, 15, 8, 10]), "SPI");
    return X.write(wb, { type: "array", bookType: "xlsx" });
  }
  function iconPng(label) {               // Excel icon + caption, as Office shows an embedded workbook "as icon"
    if (typeof document === "undefined") return null;
    var W = 384, H = 324, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var g = cv.getContext("2d"); if (!g) return null;
    var x = W / 2 - 66, y = 40;
    g.fillStyle = "#FFFFFF"; g.fillRect(0, 0, W, H);
    g.fillStyle = "#21A366"; g.fillRect(x + 40, y, 92, 120); g.fillStyle = "#33C481"; g.fillRect(x + 86, y, 46, 60); g.fillStyle = "#185C37"; g.fillRect(x + 40, y + 60, 46, 60);
    g.fillStyle = "#107C41"; g.fillRect(x, y + 24, 76, 76);
    g.fillStyle = "#FFFFFF"; g.font = "bold 58px Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("X", x + 38, y + 64);
    g.fillStyle = "#000000"; g.font = "30px 'Segoe UI', Arial, sans-serif"; g.fillText(label, W / 2, 230);
    var b = atob(cv.toDataURL("image/png").split(",")[1]), u = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    return u;
  }
  function embedValuesDb(pkg, path, M) {
    if (!window.XLSX) return;
    var d = pkg.xml(path), oles = E.all(d, NS.p, "oleObj").filter(function (o) { return /^Excel\./.test(o.getAttribute("progId") || ""); });
    if (!oles.length) return;
    var rid = oles[0].getAttributeNS(NS.r, "id"), rel = pkg.rels(path).filter(function (r) { return r.id === rid; })[0];
    if (!rel || rel.external) return;
    pkg.zip.file(rel.target, new Uint8Array(valuesWorkbook(M)));
    var png = iconPng("NSR Program - DB"); if (!png) return;
    var mp = pkg.freeName("ppt/media", "nsr_db", ".png"); pkg.zip.file(mp, png); pkg.ensureDefault("png", "image/png");
    oles.forEach(function (o) { o.setAttribute("name", "NSR Program - DB"); });   // object name, also shown if Office redraws the icon
    oles.forEach(function (o) { E.all(o, NS.a, "blip").forEach(function (b) { pkg.setImage(path, b.getAttributeNS(NS.r, "embed"), mp); }); });
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
      var sv = wSpi(w), dc = spiCol(sv);    // bar, actual % and SPI pill follow the SPI target rule (the template colours are fixed per card)
      if (act) E.setParas(act, { text: pct(w["Actual (%) - Cumulative"]) + "  Actual", color: dc }); if (plan) E.setParas(plan, "Planned " + pct(w["Planned (%) - Cumulative"]));
      if (spiT) E.setParas(spiT, "SPI  " + (sv == null ? "-" : sv.toFixed(2)));
      if (spiT) { var sq = E.pos(spiT), cxm = sq.x + sq.w / 2, cym = sq.y + sq.h / 2;   // the pill behind the SPI text
        shapes.filter(function (s) { var p = E.pos(s); return s !== spiT && s.localName === "sp" && p && p.w < 2500000 && cxm > p.x && cxm < p.x + p.w && cym > p.y && cym < p.y + p.h && s.getElementsByTagNameNS(NS.a, "solidFill").length; })
          .forEach(function (s) { E.setFill(s, spiCol(sv)); }); }
      if (eot) E.setParas(eot, [[{ text: "EOT: " }, { text: MISSING, color: RED }]]);
      // progress bar: the shorter of the two bar shapes is the "actual" fill
      var bars = shapes.filter(function (s) { var p = E.pos(s); return s.localName === "sp" && !E.text(s).trim() && p && p.h > 0 && p.h < 300000 && p.w > 1000000; }).sort(function (a, b) { return E.pos(b).w - E.pos(a).w; });
      if (bars.length >= 2) {
        var full = E.pos(bars[0]).w, a = Math.max(0.02, Math.min(1, N(w["Actual (%) - Cumulative"]) || 0));
        var xf = bars[1].getElementsByTagNameNS(NS.a, "xfrm")[0], e = xf && xf.getElementsByTagNameNS(NS.a, "ext")[0];
        if (e) e.setAttribute("cx", String(Math.round(full * a)));
        E.setFill(bars[1], dc);
      }
      note.push((r["Project Code"]) + " forecast completion " + (mon(w["End Date (Forecast/Actual)"]) || MISSING));
    });
    var nb = E.shapesByName(d, /^TextBox 3$/)[0]; if (nb) E.setParas(nb, note.join(" · ") + ".");
  }

  /* compact, professional type across the deck (the CAPEX 2026 - Status sizing): the template's 13-28 pt body text
     and 11 pt chart text crowd the boxes once real data is in */
  function compactChart(pkg, cp) {   // axes / legend 8 pt, data labels 7 pt bold, chart title 9 pt
    E.all(pkg.xml(cp), NS.a, "defRPr").forEach(function (r) {
      var n = r.parentNode; while (n && !/^(dLbls|dLbl|legend|catAx|valAx|dateAx|title|chartSpace)$/.test(n.localName)) n = n.parentNode;
      var k = n ? n.localName : "";
      r.setAttribute("sz", /dLbl/.test(k) ? "700" : k === "title" ? "900" : "800"); r.setAttribute("b", /dLbl/.test(k) ? "1" : "0");
    });
  }
  function resz(el, map) {             // explicit run sizes (hundredths of a point) → compact size
    ["rPr", "endParaRPr", "defRPr"].forEach(function (t) { E.all(el, NS.a, t).forEach(function (r) { var v = r.getAttribute("sz"); if (v && map[v]) r.setAttribute("sz", String(map[v])); }); });
  }
  var TYPE = {                         // per slide kind: template size → compact size (titles keep the template size)
    overall: { 1400: 1050, 1200: 1000 },
    spi: { 2000: 1600, 1400: 1100, 1200: 1100 },
    values: { 2800: 2000, 1300: 1000 },
    delivery: { 1800: 1400, 1600: 1400, 1500: 1200, 1350: 1100 },
    exec: { 1800: 1200, 1624: 1300, 1600: 1200, 1462: 1200, 1400: 1100 },
    closing: { 1624: 1200, 1525: 1000, 1462: 1100 }
  };
  function compactSlide(pkg, path, kind) {
    if (kind === "cover" || kind === "org") return;
    var d = pkg.xml(path), map = TYPE[kind];
    if (map) E.all(d, NS.p, "cNvPr").forEach(function (n) {
      var sh = n.parentNode.parentNode; if (!sh.parentNode || sh.parentNode.localName !== "spTree") return;   // top level (groups include their children)
      if (!/^Title/.test(n.getAttribute("name") || "")) resz(sh, map);
    });
    if (kind === "delivery") E.shapesByName(d, /^TextBox 3$/).forEach(function (s) { resz(s, { 1100: 1000 }); });   // footnote
    E.all(d, NS.p, "graphicFrame").forEach(function (f) { var cp = pkg.chartOf(path, f); if (cp) compactChart(pkg, cp); });
  }

  /* CAPEX status */
  var CAPEX_ROWS = 4;                     // project rows per "CAPEX 2026 - Status" slide (tiles and charts repeat on every slide)
  function capexList(M) { return M.spend.filter(function (p) { return M.codeKpi[p.ID] === 7 && (p.fy || p.ytdAct || p.fcFY); }).sort(function (a, b) { return b.fy - a.fy; }); }
  function fillCapex(pkg, path, M, page, pi, pn) {
    var d = pkg.xml(path), cap = capexList(M);
    page = page || cap; pi = pi || 0; pn = pn || 1;
    var fy = sum(cap, function (p) { return p.fy; }), yp = sum(cap, function (p) { return p.ytdPlan; }), ya = sum(cap, function (p) { return p.ytdAct; }), rem = sum(cap, function (p) { return p.fcRem; });
    var cutM = M.cut ? MONTHS[+M.cut.slice(5, 7) - 1] : "";
    var PL = M.D.hasRev ? "Rev Spend Plan" : "Planned Budget";   // the plan figures are the Rev Spend Plan once Budget 2026 is loaded
    function byText(re) { return E.all(d, NS.p, "sp").filter(function (s) { return re.test(E.text(s)); }); }
    byText(/^SAR [\d.]+M$/).forEach(function (s) {
      var p = E.pos(s), lbl = byText(/./).filter(function (x) { var q = E.pos(x); return q && Math.abs(q.x - p.x) < 400000 && q.y < p.y && p.y - q.y < 500000; })[0], l = lbl ? E.text(lbl) : "";
      if (/Planned Budget/.test(l)) E.setParas(s, { text: sarM(yp).replace(" ", "\u00A0"), size: 16 }); else if (/Actual Budget/.test(l)) E.setParas(s, { text: sarM(ya).replace(" ", "\u00A0"), size: 16 });
      else if (/Variance/.test(l)) E.setParas(s, { text: sarM(ya - yp).replace("-", "\u2011").replace(" ", "\u00A0"), size: 16 });   // narrow box: keep on one line
    });
    byText(/^(Planned|Actual) Budget/).forEach(function (s) { E.setRuns(s, 0, [E.text(s).split("(")[0].replace(/^Planned Budget/, PL), "(Till " + cutM + ")"]); });
    var yb = byText(/^SAR [\d.]+M$/).filter(function (s) { return E.pos(s).y < 2000000 && E.pos(s).x < 4000000; })[0]; if (yb) E.setParas(yb, { text: sarM(fy).replace(" ", "\u00A0"), size: 18 });
    var vp = byText(/^-?\d+%$/)[0]; if (vp) { var vpv = yp ? Math.round((ya - yp) / yp * 100) : 0; E.setParas(vp, { text: (vpv < 0 ? "\u2011" + (-vpv) : vpv) + "%", size: 16, color: vpv < 0 ? RED : GREEN }); }   // one line in the narrow tile
    var lt = byText(/^List of Capex projects/)[0]; if (lt) E.setParas(lt, "List of Capex projects" + (pn > 1 ? "  (" + (pi + 1) + " of " + pn + ")" : "") + " · " + cap.length + " projects");
    var yl = byText(/Yearly Budget/)[0]; if (yl) E.setParas(yl, "Yearly Budget – " + (M.D.hasRev ? "Rev Spend Plan" : "Spend Plan"));
    // table
    var frame = E.shapesByName(d, /^Table/)[0], tbl = E.table(frame), rs = E.rows(tbl), total = rs[rs.length - 1];
    // every CAPEX project, CAPEX_ROWS per slide; the Total row is always the whole CAPEX portfolio
    var shown = page;
    var body = E.resizeRows(tbl, 1, 1, shown.length); tbl.appendChild(total);
    var sz = 9;                            // one readable size for the whole table
    E.cells(rs[0]).forEach(function (hc) {
      E.all(hc, NS.a, "t").forEach(function (t) { if (/^\s*Planned Budget\s*$/.test(t.textContent)) t.textContent = PL; });
      E.all(hc, NS.a, "rPr").concat(E.all(hc, NS.a, "endParaRPr")).forEach(function (r) { r.setAttribute("sz", "950"); });
    });
    function cell(c, v) { E.cellText(c, typeof v === "object" ? { text: v.text, color: v.color, size: sz } : { text: v, size: sz }); }
    shown.forEach(function (p, i) {
      var c = E.cells(body[i]);
      body[i].setAttribute("h", "235000");
      [p.ID, shortName(p.name, 44), money(p.fy), money(p.ytdPlan), money(p.ytdAct), null, money(p.fcRem), money(p.ytdAct + p.fcRem)].forEach(function (v, k) { if (c[k] && v != null) cell(c[k], v); });
      var vr = p.ytdAct - p.ytdPlan; cell(c[5], { text: money(vr), color: vr < 0 ? RED : GREEN });
    });
    total.setAttribute("h", "235000");
    var tc = E.cells(total);
    [null, pn > 1 ? "Total – all " + cap.length + " CAPEX projects" : "Total", money(fy), money(yp), money(ya), null, money(rem), money(ya + rem)].forEach(function (v, k) { if (tc[k] && v != null) cell(tc[k], { text: v, bold: true }); });
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
          { name: PL, values: ov.plan.map(function (v) { return Math.round(v / 1e5) / 10; }) },
          { name: "Actual Budget", values: ov.act.map(function (v, i) { return i <= ci ? Math.round(v / 1e5) / 10 : null; }) },
          { name: "Cum " + PL, values: cumP }, { name: "Cum Actual Budget", values: cumA }, { name: "Cum Forecast Budget", values: cumF }] });
      } else if (/Planned Budget/.test(x)) {
        pkg.setChart(cp, { cats: cap.map(function (p) { return p.ID; }), series: [
          { name: PL, values: cap.map(function (p) { return Math.round(p.ytdPlan / 1e6); }) }, { name: "Actual Budget", values: cap.map(function (p) { return Math.round(p.ytdAct / 1e6); }) }] });
        // data labels: smaller, so the planned / actual values of neighbouring bars do not overlap
        E.all(pkg.xml(cp), NS.a, "defRPr").forEach(function (r) { var dl = r.parentNode; while (dl && dl.localName !== "dLbls" && dl.localName !== "chartSpace") dl = dl.parentNode; if (dl && dl.localName === "dLbls") r.setAttribute("sz", "700"); });
        E.all(pkg.xml(cp), NS.c, "gapWidth").forEach(function (g) { g.setAttribute("val", "60"); });
      }
    });
    var ins = byText(/^Achieved|The overall forecast/)[0];
    if (ins) {
      var ach = yp ? ya / yp : null, ov2 = ya + rem;
      E.setParas(ins, [[{ text: "YTD actual is ", size: 10 }, { text: pct(ach, 0), bold: true, size: 10 }, { text: " of the YTD " + (M.D.hasRev ? "Rev " : "") + "plan (till " + cutM + ").", size: 10 }],
        [{ text: "The overall forecast is ", size: 10 }, { text: mio(ov2), bold: true, size: 10 }, { text: ov2 >= fy ? ", exceeding the yearly budget by " : ", below the yearly budget by ", size: 10 }, { text: mio(Math.abs(ov2 - fy)), bold: true, size: 10 }]]);
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
    if (st) { var s = r["Performance Status"] || (card.Perf || {}).Status || MISSING, col = /track|ahead|on time|complete/i.test(s) ? "046A38" : /risk|slight/i.test(s) ? AMBER : RED; E.setParas(st, { text: s, color: col === AMBER ? "000000" : "FFFFFF" }); E.setFill(st, col); }
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
      E.setRuns(info, 0, ["Original Contract Value", ": " + (money(x.cv) || MISSING) + " SAR"]); E.setRuns(info, 1, ["Change Order", ": " + (vo ? money(vo) + " SAR" : "-")]);
      E.setRuns(info, 2, ["Start Date", ": " + (dLong(pg.start) || MISSING)]); E.setRuns(info, 3, ["End Date", ": " + (dLong(be) || MISSING)]);
      E.setRuns(info, 4, ["EOT ", fe && be && fe > be ? { text: ": " + MISSING, color: RED } : ": N/A"]); E.setRuns(info, 5, ["Forecast End Date ", ": " + (dLong(fe) || MISSING)]);
    }
    // CAPEX / KPI box
    var sp = M.spend.filter(function (p) { return p.ID === code; })[0];
    var kp = M.codeKpi[code], kl = textShape(/^CAPEX/);
    if (kl) E.setParas(kl, kp === 7 ? "CAPEX - KPI" : kp === 8 ? "Non-KPI Spending" : (r["Budget Type"] ? r["Budget Type"] + " - No KPI" : "No KPI"));
    var bl = textShape(/^Yearly Budget/);
    if (bl) {
      if (sp) {
        var vr = sp.ytdAct - sp.ytdPlan, mm = function (v) { return mio(v).replace(" ", "\u00A0"); };   // keep "70.0 M" on one line
        var ln = [[(M.D.hasRev ? "Rev Plan 2026" : "Yearly Budget") + " : " + mm(sp.fy)], [(M.D.hasRev ? "YTD Rev Plan" : "YTD Plan") + " : " + mm(sp.ytdPlan)], ["YTD Actual : " + mm(sp.ytdAct)],
          ["Variance : ", { text: (vr > 0 ? "+" : vr < 0 ? "\u2011" : "") + mm(Math.abs(vr)), color: vr < 0 ? RED : GREEN }], ["Forecast 2026 : " + mm(sp.fcFY)]];
        ln.forEach(function (x, i) { E.setRuns(bl, i, x); });
        E.all(bl, NS.a, "rPr").concat(E.all(bl, NS.a, "endParaRPr")).forEach(function (r) { r.setAttribute("sz", "850"); });   // 5 lines fit the template box
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
    if (varT) E.cellText(E.cells(E.rows(varT)[0])[0], [[{ text: "Variance ", size: 11 }, pl == null ? { text: "- ", color: "768692", size: 11 } : { text: sgnPct(vr2) + " ", color: vr2 < 0 ? RED : GREEN, size: 11, bold: true }]]);
    var box = byName(/^Rectangle: Rounded Corners 5$/)[0], arrow = byName(/^Arrow: Notched Right/)[0], good = spi != null && spi >= SPI_OK;
    if (box) { E.setParas(box, { text: spi == null ? "-" : spi.toFixed(2), color: good ? GREEN : RED }); E.setFill(box, good ? "CCFFCC" : "FFD9D9", good ? GREEN : RED); }
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
    function head(sh, label, v) {        // one line, 9 pt: label, value after the template icon
      if (!sh) return; v = typeof v === "object" ? { text: v.text, color: v.color, size: 9, bold: true } : { text: v, size: 9, bold: true };
      E.setParas(sh, [[{ text: label, size: 9, bold: true }, v]]);
      var xf = sh.getElementsByTagNameNS(NS.a, "xfrm")[0], ex = xf && xf.getElementsByTagNameNS(NS.a, "ext")[0]; if (ex && +ex.getAttribute("cx") < 3000000) ex.setAttribute("cx", "3000000");   // room for one line
    }
    head(textShape(/^Contractor\s/), "Contractor            : ", miss(clip(r.Contractor, 22)));
    head(textShape(/^Consultant\s/), "Consultant            : ", miss(null));
    head(textShape(/^Funded by/), "Funded by             : ", miss(clip((card.Fund || {}).Org, 22)));
    var brief = E.all(d, NS.p, "sp").filter(function (s) { var p = E.pos(s); return p && p.y > 2400000 && p.y < 3200000 && E.text(s).length > 30; })[0];
    if (brief) { var bt = clip(cd.Scope || card.Description || "", 300); E.setParas(brief, bt ? { text: bt, size: 10 } : { text: MISSING, color: RED, size: 10 }); }
    var tbl = E.all(d, NS.a, "tbl").filter(function (x) { return /ISSUES/.test(x.textContent); })[0];
    if (tbl) {
      var pend = closingSteps(M).filter(function (k) { return stepState(r, k).status !== "Completed" && stepState(r, k).status !== "NA"; });
      var items = [];
      if (r["Current Status"]) items.push([clip(r["Current Status"], 200), r["Action Plan"] ? clip(r["Action Plan"], 200) : null]);
      if (pend.length) items.push(["Pending close-out steps: " + pend.join(", "), null]);
      if (!items.length) items.push([null, null]);
      var rows = E.resizeRows(tbl, 1, 1, items.length);
      var z10 = function (v) { return typeof v === "object" && v ? { text: v.text, color: v.color, size: 9.5 } : { text: v, size: 9.5 }; };
      items.forEach(function (it, i) { var c = E.cells(rows[i]); E.cellText(c[0], z10((i + 1) + ".")); E.cellText(c[1], z10(miss(it[0]))); E.cellText(c[2], z10(miss(it[1]))); });
      E.cells(E.rows(tbl)[0]).forEach(function (hc) { E.all(hc, NS.a, "rPr").concat(E.all(hc, NS.a, "endParaRPr")).forEach(function (r) { r.setAttribute("sz", "1000"); }); });
      E.rows(tbl)[0].setAttribute("h", "300000"); rows.forEach(function (tr) { tr.setAttribute("h", "330000"); });   // rows grow with their text
      var fr = tbl.parentNode; while (fr && fr.localName !== "graphicFrame") fr = fr.parentNode; if (fr) E.fitTable(fr);
    }
  }

  /* organisation chart: the template's EAST names are replaced by placeholders (NSR team to be entered) */
  function fillOrg(pkg, path) {
    var d = pkg.xml(path);
    E.all(d, NS.p, "sp").forEach(function (s) {
      var tx = E.text(s).trim(), nm = s.getElementsByTagNameNS(NS.p, "cNvPr")[0].getAttribute("name") || "";
      if ((!tx && !/^TextBox/.test(nm)) || /^Title/.test(nm) || /Organization Chart/.test(tx) || /^SUMMARY$/i.test(tx)) return;
      E.setParas(s, { text: MISSING, color: RED });
    });
    E.all(d, NS.a, "tc").forEach(function (tc) {   // the site-team table under the chart
      E.cellText(tc, { text: MISSING, color: "FFFFFF" });
    });
  }

  /* ================================================================== main */
  function build(templateBuffer, D) {
    var M = model(D);
    SPI_OK = M.spiTarget;                 // the SPI KPI target (0.91) drives every SPI colour in the deck
    return E.Pkg.open(templateBuffer).then(function (pkg) {
      var S = findSlides(pkg), jobs = Promise.resolve();
      Object.keys(S).forEach(function (k) { S[k].forEach(function (p) { seedSlide(pkg, p, k); }); });
      pkg.snapshot();                     // after seeding, so cloned slides carry the placeholders too
      function need(k) { if (!S[k] || !S[k].length) throw new Error("Template slide not found: " + k + ". Use the PD weekly Balance Scorecard template."); return S[k][0]; }
      var order = [], kinds = [];         // fill() in slide order; [path, slide kind] for the type pass
      function clones(key, groups, fill) {
        var master = need(key), last = master;
        groups.forEach(function (g, i) {
          if (i === 0) { order.push(function () { fill(master, g, 0); kinds.push([master, key]); }); return; }
          jobs = jobs.then(function () { return pkg.cloneSlide(master, last).then(function (p) { last = p; order.push(function () { fill(p, g, i); kinds.push([p, key]); }); }); });
        });
        (S[key] || []).slice(1).forEach(function (p) { jobs = jobs.then(function () { pkg.deleteSlide(p); }); });
      }
      var photo = null;
      jobs = jobs.then(function () { return photoPlaceholder().then(function (b) { photo = pkg.freeName("ppt/media", "nsr_photo", ".png"); pkg.zip.file(photo, b); pkg.ensureDefault("png", "image/png"); }); });
      // closing action points: 2 projects per slide
      var openCl = openClosing(M);
      clones("closingActions", chunk(openCl, 3), function (p, g, i) { fillClosingActions(pkg, p, M, g, i * 3 + 1); });
      // CAPEX projects only (KPI code 7) on both spending slides
      var ci = M.months.indexOf(M.cut), withPlan = M.spend.filter(function (p) { return p.fy || p.ytdAct || p.fcFY; });
      var cap = withPlan.filter(function (p) { return M.codeKpi[p.ID] === 7; }).sort(function (a, b) { return b.fy - a.fy; });
      // spending-plan action points: overall CAPEX + the 3 CAPEX projects furthest behind their plan at the cut-off
      var behind = cap.slice().sort(function (a, b) { var va = matrixRows(a.mPlan, a.mAct)[4][ci] || 0, vb = matrixRows(b.mPlan, b.mAct)[4][ci] || 0; return va - vb; }).slice(0, 3);
      clones("spendActions", [behind], function (p, g) { fillMatrixSlide(pkg, p, M, null, "Overall NSR Program – CAPEX", overallOf(cap, M), g); });
      // CAPEX monthly plan: 3 projects per slide
      clones("monthly", chunk(cap, 3), function (p, g) { fillMatrixSlide(pkg, p, M, null, "Overall NSR Program – CAPEX", overallOf(cap, M), g); });
      // CAPEX status: tiles + charts on every slide, project table CAPEX_ROWS per slide
      var capPages = chunk(capexList(M), CAPEX_ROWS);
      clones("capex", capPages, function (p, page, i) { fillCapex(pkg, p, M, page, i, capPages.length); });
      // KPI scorecard: whole KPI groups, split over as many slides as needed
      clones("kpi", kpiPages(M), function (p, page) { fillKpi(pkg, p, M, page); });
      // SPI cards: 11 per slide
      var spiList = M.weekly.filter(function (r) { return N(r["Contract Value"]); });   // Progress section: every weekly-report project (as on SPI & S-Curve Outlook)
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
        if (S.values) { fillValues(pkg, S.values[0], M); embedValuesDb(pkg, S.values[0], M); }
        if (S.org) fillOrg(pkg, S.org[0]);
        order.forEach(function (f) { f(); });
        ["cover", "overall", "values", "org"].forEach(function (k) { if (S[k]) kinds.push([S[k][0], k]); });
        kinds.forEach(function (k) { compactSlide(pkg, k[0], k[1]); });
        pkg.slides().forEach(function (p) { renameProgram(pkg, p); });
        pkg.gc();
        return pkg.finish();
      });
    });
  }

  window.SARWeeklyPpt = { build: build, model: model };
})();

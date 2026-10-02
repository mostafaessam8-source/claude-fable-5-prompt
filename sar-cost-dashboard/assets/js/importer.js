/*
 * Excel importer — reads the *named Excel tables* (Insert ▸ Table) from the three
 * source workbooks, exactly the way the Power BI model does (Excel.Workbook → Table).
 * The workbooks are never modified: only the table ranges are read.
 *
 * Works in the browser (window.SARImporter) and in Node (module.exports), so the
 * default-data build script and the in-browser import share one code path.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SARImporter = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ------------------------------------------------------------------ */
  /* Source workbooks and the tables the dashboard needs from each one.  */
  /* `cols` are the columns the dashboard reads — missing ones are        */
  /* reported as warnings, never silently ignored.                        */
  /* ------------------------------------------------------------------ */
  var SOURCES = {
    weekly: {
      label: "PBI Weekly Report",
      file: "PBI Weekly Report.xlsx",
      tables: {
        Weekly_Report_Updates: ["Source.Name", "Report Date", "Project Code", "Project Name", "Contractor",
          "Start Date Baseline", "End Date Baseline", "End Date (Forecast/Actual)",
          "Planned (%) This Week", "Planned (%) - Cumulative", "Actual (%) This Week", "Actual (%) - Cumulative",
          "Performance Status", "Reason for Delays", "Cumulative EV (SAR)", "Cumulative PV (SAR)", "SPI",
          "Contract Value", "Paid (%) (I/E)", "Total WC %", "Total Paid %"],
        S_Curve: ["Source.Name", "Report Date", "Cum Plan (%)", "Cum Actual (%)", "Cum Forecast (%)"],
        Deliverable_Status: ["Source.Name", "Sr.No", "Project Deliverables", "Total Subm. (PL.Cum)", "Total Subm. (Act. Cum)", "Approved", "Rejected", "U/R"],
        Lookahead_Activities: ["Source.Name", "Sr. No.", "Lookahead Activities (7 Days) Description"],
        Interim_Payment_Certificate: ["Source.Name", "Sr.No", "Description", "IPC / VO No.", "Cum Sum"],
        Area_of_Concern: ["Source.Name", "Sr. No.", "Issue /Concern Description", "Mitigation Action", "Status"],
        // Issue_register is no longer read from this file — it comes from the Project Cards workbook ("cards").
        Project_Milestones_Progress: ["Source.Name", "Sort", "Description", "Project Start", "Data Date", "Planned Finish",
          "Actual/Forecast Finish", "Planned progress", "Actual Progress"],
        Project_Milestones_Progress_Combine: ["Source.Name", "Sort", "WSB", "Description", "Project Start", "Data Date",
          "Planned Finish", "Actual/Forecast Finish", "Planned progress", "Actual Progress"],
        MLS: ["Code", "Source.Name", "Project Name"]
      },
      // Power BI reads the S-Curve from the sheet, not the table — fall back to it.
      sheetFallback: { S_Curve: "S-Curve" }
    },
    plan: {
      label: "EPBU 2026 Delivery Plan (Milestone & Forecast)",
      file: "EPBU 2026 Delivery Plan-v2 (Milestone & forecast) - PBI file new dashboard.xlsx",
      tables: {
        KPI_Summary: ["KPI Code", "KPI SN", "KPI Filter", "Objective/ KPIs", "KPI Weight (%)",
          "NSR Spend Plan 2026 as per Budgeting", "NSR V2 Forecast 2026 shared to PC", "FTY Variance",
          "YTD Spend Plan 2026 as per Budgeting", "YTD V2 Forecast 2026", "YTD Actual", "YTD Variance", "% Achieved", "KPI Result"],
        KPI_Projects_Data: ["Code", "Project Name", "KPI Code", "KPI Filter", "Objective/ KPIs",
          "Spend Plan as per Budgeting (M) FTY 2026", "Spend Plan as per V2 Forecast (M) FTY 2026", "Variance (M)",
          "YTD Spend Plan as per Budgeting (M)", "YTD Plan as per V2 Forecast (M)2", "YTD Actual (M)",
          "Variance (M)2 w.r.t. Budgeting Spending Plan", "Variance (M)2 w.r.t. V2 forecast Plan"],
        NSR_Project_Data: ["SN", "Fund Type", "PROG", "PO Number", "ID", "Project Name", "Full Cost", "Contract Value",
          "WC 2025", "WC 2026", "Total WC", "Paid from CV as per ERP (Gross value)", "Remaining WC",
          "Start Date", "End Date", "Project Phase", "Remarks/Concern"],
        Spending_Plan: ["Month", "Fund Type", "ID", "Project Name", "Project Phase",
          "Spend Plan as per Budgeting (Incr)", "Plan as per V2 Forecast in Mar-26 (Shared with PC) (Incr)3",
          "Actual Spend (Incr)4", "Forecast as per Contractor cashflow / updated Progress / Program(Incr)5",
          "Invoice Related actvities"],
        Delivery_KPI: ["Project Code", "NSR Plan", "Target Completion Date"],
        ABBREVIATIONS: ["ABBREVIATIONS", "MEANING"],
        ABBREVIATIONS_2: ["ABBREVIATIONS", "MEANING"],
        Report_Date: ["Report Date"],
        Project_Phase: ["Project Phase"],
        Fund_Type: ["Fund Type"]
      }
    },
    contract: {
      label: "Contract Details",
      file: "Contract details.xlsx",
      tables: {
        Contract_Details: ["Ref", "Code", "Contract", "Contractor", "Scope", "Value (SAR)", "Stage", "Owner"]
      }
    },
    // "Budget 2026.xlsx" (sheet "Curve"): per project a block of rows "Spending Plan (OG)", "(ABT)", "Forecast",
    // "Spending Plan (VP)", "Actual" … with the months as columns. "Spending Plan (VP)" is the Revised Spend Plan.
    budget: {
      label: "Budget 2026 (Revised Spend Plan)",
      file: "Budget 2026.xlsx",
      sheetHeader: true,
      tables: { Rev_Spend_Plan: ["ID", "Month", "Rev Spend Plan"] }
    },
    // "PD_PPT_Data_Requirement_For_all_Program_<date>.xlsx": the PD programme database (all programmes, one row per
    // project). Found by its header row (Program Name · PMO List · Approved Budget · Final Contract Amount · Total Paid …),
    // so the file name / date suffix and the Excel table name may change. Feeds the "Program Values" PPT slide.
    pdData: {
      label: "PD Programme Database (Program Values)",
      file: "PD_PPT_Data_Requirement_For_all_Program_<date>.xlsx",
      sheetHeader: true,
      tables: {
        Program_DB: ["Program Name", "PMO List", "Project Name", "Type", "Project Phase", "Funding Source", "Approved Budget",
          "Final Contract Amount", "Total Paid", "Project_SD", "Project_ED", "PO#", "Contractor", "Project Size", "Overall Status"]
      }
    },
    // "EPBU 2027 Engineering blockades -R0x.xlsx": inputs to the 2027 Delivery Plan / shutdown plan — one row per work
    // package (location batch) with shutdown / blockage / possession needs. Found by its header row; merged project
    // cells are filled down.
    blockades: {
      label: "2027 Engineering Blockades (Delivery Plan inputs)",
      file: "EPBU 2027 Engineering blockades -R<nn>.xlsx",
      sheetHeader: true,
      tables: {
        Blockades_2027: ["Code", "Project", "network", "Line", "Shutdown duration", "Blockage of the line duration", "Posession duration",
          "Total Hrs", "Expected execution (TBC)", "Track kilometer", "Actual works (description)", "Frequencies (daily or weekly)"]
      }
    },
    // "Projects in Closing phase.xlsx": one sheet with a header row (Code · Project Name · … · Closeout Report ·
    // Retention Release · … · Current Status · Action Plan). Found by its header text, not by a table name.
    closing: {
      label: "Projects in Closing Phase",
      file: "Projects in Closing phase.xlsx",
      sheetHeader: true,
      tables: {
        Closing_Projects: ["Code", "PO", "Project Name", "Contractor", "Project Manager", "Actual Progress %", "Start", "Contract Finish",
          "Final Contract Value", "Current Status", "Action Plan"]
      }
    },
    // "Projects_Department.xlsx": the department's Balanced Scorecard (Perspective · Objective / KPI · Unit · <year> Target ·
    // KPI Weight · Data Source · Formula · Remarks). Found by its header row; objective rows (no unit / target) and merged
    // perspective cells are folded into the KPI rows. Feeds "Criteria / Target" on the KPI scorecard.
    kpiTargets: {
      label: "Balanced Scorecard KPI Targets",
      file: "Projects_Department.xlsx",
      sheetHeader: true,
      tables: { KPI_Targets: ["Perspective", "Objective", "KPI", "Unit", "Target", "KPI Weight", "Data Source", "Formula", "Remarks"] }
    },
    // Monthly "EP - NSR Projects <Mon><YY>.xlsx": one sheet per project ("<code>_Project Card").
    // The Issue Register is built from section 12.1 "Issue Log" of every card (see parseProjectCards).
    cards: {
      label: "EP – NSR Projects (Project Cards)",
      file: "EP - NSR Projects <Month>.xlsx",
      projectCards: true,
      tables: {
        Issue_register: ["ILR ID No.", "Issue Identification (Date)", "Issue Owner", "Issue Title", "Issue Category",
          "Issue (Description)", "Issue Impact", "Issue Urgency", "Issue Score", "Issue Rate", "Resolution Action Plan",
          "Action Plan Owner", "Action Plan (Original Due Date)", "Issue Closure Date", "Issue Status", "Remarks / Comments"],
        // one record per card with every section (general info, performance, timeline, milestones, logs …)
        Project_Cards: []
      }
    }
  };

  /* Column headers are normalised (line breaks / non-breaking / double spaces
     collapsed) so "End Date\nBaseline" and "End Date Baseline" match. */
  function normKey(s) {
    return String(s == null ? "" : s)
      .replace(/_x000[aAdD]_/g, " ")
      .replace(/[\s ]+/g, " ")
      .replace(/\s*\(\s*/g, " (").replace(/\(\s+/g, "(")
      .replace(/^ /, "").trim();
  }

  function decodeXml(s) {
    return String(s)
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'").replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(+d); })
      .replace(/&#x([0-9a-f]+);/gi, function (_, h) { return String.fromCharCode(parseInt(h, 16)); })
      .replace(/&amp;/g, "&");
  }

  function attrs(tag) {
    var o = {}, re = /([\w:]+)="([^"]*)"/g, m;
    while ((m = re.exec(tag))) o[m[1]] = decodeXml(m[2]);
    return o;
  }

  function resolvePath(base, target) {
    if (target.charAt(0) === "/") return target.slice(1);
    var parts = base.split("/"); parts.pop();
    target.split("/").forEach(function (p) {
      if (p === "..") parts.pop(); else if (p !== ".") parts.push(p);
    });
    return parts.join("/");
  }

  function relsFor(path) {
    var i = path.lastIndexOf("/");
    return path.slice(0, i) + "/_rels/" + path.slice(i + 1) + ".rels";
  }

  async function readRels(zip, path) {
    var f = zip.file(relsFor(path));
    if (!f) return {};
    var xml = await f.async("string"), out = {}, re = /<Relationship\b[^>]*>/g, m;
    while ((m = re.exec(xml))) {
      var a = attrs(m[0]);
      out[a.Id] = { target: resolvePath(path, a.Target), type: a.Type || "" };
    }
    return out;
  }

  /* Map every Excel table → { sheetName, ref, columns[], totalsRowCount, headerRowCount } */
  async function listTables(zip) {
    var wbPath = "xl/workbook.xml";
    var wbXml = await zip.file(wbPath).async("string");
    var rels = await readRels(zip, wbPath);
    var tables = {}, sheets = [];
    var re = /<sheet\b[^>]*>/g, m;
    while ((m = re.exec(wbXml))) {
      var a = attrs(m[0]);
      var rel = rels[a["r:id"]];
      if (rel) sheets.push({ name: a.name, path: rel.target });
    }
    for (var i = 0; i < sheets.length; i++) {
      var sh = sheets[i];
      var srels = await readRels(zip, sh.path);
      for (var id in srels) {
        if (!/\/table$/.test(srels[id].type)) continue;
        var tf = zip.file(srels[id].target);
        if (!tf) continue;
        var txml = await tf.async("string");
        var ta = attrs((txml.match(/<table\b[^>]*>/) || [""])[0]);
        var cols = [], cre = /<tableColumn\b[^>]*>/g, cm;
        while ((cm = cre.exec(txml))) cols.push(normKey(attrs(cm[0]).name));
        var name = ta.displayName || ta.name;
        tables[name] = {
          sheet: sh.name, ref: ta.ref, columns: cols,
          headerRowCount: ta.headerRowCount === "0" ? 0 : 1,
          totalsRowCount: +(ta.totalsRowCount || 0)
        };
      }
    }
    return { tables: tables, sheets: sheets.map(function (s) { return s.name; }) };
  }

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  /* Cell → JSON value. Dates become "YYYY-MM-DD" (time-zone free). Excel
     "zero dates" (formula blanks shown as 00/01/1900) become null. */
  function cellValue(XLSX, cell) {
    if (!cell || cell.t === "z" || cell.t === "e") return null;
    if (cell.t === "s") { var s = String(cell.v).trim(); return s === "" ? null : s; }
    if (cell.t === "b") return cell.v;
    if (cell.t === "d") {
      var d = cell.v instanceof Date ? cell.v : new Date(cell.v);
      if (isNaN(d) || d.getFullYear() < 1901) return null;
      return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    }
    if (cell.t === "n") {
      var fmt = cell.z || "";
      if (fmt && XLSX.SSF.is_date(fmt)) {
        if (cell.v < 367) return null; // 1900 "time-only" / zero dates
        var p = XLSX.SSF.parse_date_code(cell.v);
        return p.y + "-" + pad(p.m) + "-" + pad(p.d);
      }
      return cell.v;
    }
    return cell.v == null ? null : cell.v;
  }

  function readRange(XLSX, ws, ref, headers, skipTop, skipBottom) {
    var r = XLSX.utils.decode_range(ref);
    var rows = [];
    for (var R = r.s.r + skipTop; R <= r.e.r - skipBottom; R++) {
      var row = {}, any = false;
      for (var C = r.s.c; C <= r.e.c; C++) {
        var key = headers[C - r.s.c];
        if (!key) continue;
        var v = cellValue(XLSX, ws[XLSX.utils.encode_cell({ r: R, c: C })]);
        if (v !== null) any = true;
        if (!(key in row) || row[key] === null) row[key] = v;
      }
      if (any) rows.push(row);
    }
    return rows;
  }

  function sheetHeaders(XLSX, ws, ref) {
    var r = XLSX.utils.decode_range(ref), h = [];
    for (var C = r.s.c; C <= r.e.c; C++) {
      var c = ws[XLSX.utils.encode_cell({ r: r.s.r, c: C })];
      h.push(c ? normKey(c.v) : "");
    }
    return h;
  }

  /* Identify which source workbook a file is, from the tables it contains. */
  function detectSource(tableNames) {
    var best = null, bestHits = 0;
    Object.keys(SOURCES).forEach(function (k) {
      var hits = Object.keys(SOURCES[k].tables).filter(function (t) { return tableNames.indexOf(t) >= 0; }).length;
      if (hits > bestHits) { best = k; bestHits = hits; }
    });
    return best;
  }

  /**
   * Parse one workbook.
   * @returns {Promise<{source, tables:{name:rows[]}, report:[{table, rows, status, missing[]}]}>}
   */
  /* ---------------------------------------------------------------------- */
  /* Project Cards workbook: every "<code>_Project Card" sheet has the same  */
  /* layout. Section 12.1 "Issue Log" is found by its heading text (not by   */
  /* fixed rows), so added/removed projects and shifted rows are handled.    */
  /* ---------------------------------------------------------------------- */
  var CARD_RE = /project\s*card/i;
  var TEXT_COLS = /owner|title|category|description|action plan$|rate|status|remarks|ref\.?$/i;

  /* ---------------------------------------------------------------------- */
  /* Full project card → one Project_Cards record. Every section is located */
  /* by its heading / header text, so inserted rows or columns don't break it. */
  /* ---------------------------------------------------------------------- */
  function parseCard(XLSX, ws, name) {
    var rg = XLSX.utils.decode_range(ws["!ref"]), last = rg.e.r, lastC = Math.min(rg.e.c, 90);
    function v(r, c) {
      var x = cellValue(XLSX, ws[XLSX.utils.encode_cell({ r: r, c: c })]);
      if (typeof x === "string") { x = x.trim(); if (x === "-" || x === "" || /^\[insert/i.test(x) || x === "False" || x === "True") return null; }
      return x === false ? null : x;
    }
    function txt(r, c) { var x = v(r, c); return x == null ? "" : normKey(x); }
    function low(r, c) { return txt(r, c).toLowerCase(); }
    function num(x) { return typeof x === "number" && isFinite(x) ? x : null; }
    function date(x) { return typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : null; }
    function str(x) { return x == null ? null : String(x).trim() || null; }
    function findRow(re, from, to) {
      for (var r = from || 0; r <= Math.min(last, to == null ? last : to); r++) if (re.test(low(r, 1))) return r;
      return -1;
    }
    function sec(label) { var want = label.toLowerCase(); return findRow({ test: function (s) { return s === want; } }); }
    function at(label, from, to, dc) { var r = findRow({ test: function (s) { return s === label.toLowerCase(); } }, from, to); return r < 0 ? null : v(r, 1 + (dc || 1)); }
    // A logged table: header row whose column B matches `hdrRe`, its run of text headers, rows until B is empty.
    function block(hdrRe, from, keep) {
      var h = findRow(hdrRe, from); if (h < 0) return [];
      var cols = [];
      for (var c = 1, gap = 0; c <= lastC && gap < 2; c++) { var hc = txt(h, c); if (!hc) { gap++; continue; } gap = 0; cols.push({ c: c, key: hc }); }  // one merged blank allowed
      var out = [];
      for (var r = h + 1; r <= last; r++) {
        if (!txt(r, 1)) break;
        var rec = {};
        cols.forEach(function (col) { rec[col.key] = v(r, col.c); });
        if (!keep || keep(rec)) out.push(rec);
      }
      return out;
    }
    function hasAny(rec, keys) { return keys.some(function (k) { return Object.keys(rec).some(function (rk) { return rk.indexOf(k) === 0 && rec[rk] != null && rec[rk] !== 0; }); }); }

    var gen = sec("project general information"), perf = sec("project performance"), stake = sec("project key stakeholders");
    var fund = sec("project funding info."), cont = sec("project contracting info."), base = sec("project baseline schedule");
    var exe = findRow(/^execution schedule/), tl = sec("project timeline"), bud = sec("project budget");
    var ms = sec("critical path milestones"), dl = sec("deliverables"), isum = sec("issue log summary");
    var csum = sec("change log summary"), rsum = sec("risk log summary"), clsum = sec("claim register summary"), kpi = sec("kpis");

    var code = str(at("Project Code", gen, gen + 15)) || String(name).split("_")[0];
    var card = {
      Sheet: name, Code: code, Name: str(at("Project Name", gen, gen + 15)) || name,
      Size: str(at("Project Size", gen, gen + 15)), Complexity: str(at("Project Complexity", gen, gen + 15)),
      Group: str(at("Project Group", gen, gen + 15)), Type: str(at("Project Type", gen, gen + 15)),
      Category: str(at("Project Category", gen, gen + 15)), PlannedPhase: str(at("Planned Phase", gen, gen + 15)),
      ActualPhase: str(at("Actual Phase", gen, gen + 15)), Description: str(at("Project Description", gen, gen + 15)),
      Location: null
    };
    var cx = findRow(/^project complexity$/, gen, gen + 15);
    if (cx >= 0 && low(cx, 3) === "location") card.Location = str(v(cx + 1, 3));

    card.Perf = {
      Planned: num(at("Planned Progress (%)", perf, perf + 12)), Actual: num(at("Actual Progress (%)", perf, perf + 12)),
      Variance: num(at("Progress Variance %", perf, perf + 12)), Paid: num(at("Approved Paid Amount (SAR)", perf, perf + 12)),
      Status: str(at("Overall Status", perf, perf + 12)), Delay: str(at("Delay Level", perf, perf + 12)),
      Risk: str(at("Risk Level", perf, perf + 12)), SV: num(at("Schedule Variance (BL Vs. Forecast)", perf, perf + 12))
    };
    var dept = findRow(/^performing organization \(department\)$/, stake, stake + 10), spon = findRow(/^project sponsor/, stake, stake + 10);
    card.Stake = {
      BU: str(at("Performing Organization (BU)", stake, stake + 10)), Department: str(at("Performing Organization (Department)", stake, stake + 10)),
      Program: dept >= 0 ? str(v(dept, 3)) : null, PM: str(at("Project Manager", stake, stake + 10)),
      Sponsor: str(at("Project Sponsor (BU)", stake, stake + 10)), SponsorOrg: spon >= 0 ? str(v(spon, 3)) : null,
      Owner: str(at("Project Owner (Department)", stake, stake + 10)), Maintenance: str(at("Maintenance Entity (BU / Dept.)", stake, stake + 10))
    };
    var fo = findRow(/^funding organization$/, fund, fund + 10);
    card.Fund = {
      Org: fo >= 0 ? str(v(fo, 2)) : null, Budget: num(at("Budget (SAR)", fund, fund + 10)),
      Year: fo >= 0 ? str(v(fo + 1, 3)) : null, FundStatus: fo >= 0 ? str(v(fo + 1, 4)) : null, Critical: fo >= 0 ? str(v(fo + 1, 5)) : null,
      CON: num(at("Contract value - CON", fund, fund + 10)), PMC: num(at("Contract value - PMC", fund, fund + 10)), CSC: num(at("Contract value - CSC", fund, fund + 10))
    };
    card.Contracts = [];
    for (var r = cont + 1; cont >= 0 && r <= cont + 8; r++) {
      var role = txt(r, 1);
      if (/^(contractor|pmc|csc)$/i.test(role)) card.Contracts.push({ Role: role, Entity: str(v(r, 2)), "PR No.": str(v(r, 3)), "PR Date": date(v(r, 4)),
        "PO No.": str(v(r, 5)), "PO Date": date(v(r, 6)), "Contract Effective Date": date(v(r, 7)) });
    }
    var rv = findRow(/^revised \(y\/n\)$/, base, base + 8);
    card.Baseline = { Revised: str(at("Revised (Y/N)", base, base + 8)), Version: str(at("Revised Version", base, base + 8)),
      PMFeedback: rv >= 0 ? str(v(rv + 1, 3)) : null, EPMOFeedback: rv >= 0 ? str(v(rv + 1, 5)) : null, DelayReason: rv >= 0 ? str(v(rv + 1, 7)) : null, Versions: [] };
    var sd = findRow(/^start date$/, base, base + 12);
    if (sd >= 0) for (var c = 2; c <= 8; c++) {
      var vn = txt(sd - 1, c); if (!vn) break;
      var ver = { Version: vn, Start: date(v(sd, c)), Finish: date(v(sd + 1, c)), Budget: num(v(sd + 2, c)) };
      if (ver.Start || ver.Finish || ver.Budget) card.Baseline.Versions.push(ver);
    }
    var md = findRow(/^month starting date$/, exe, tl);
    var rp = date(at("Reporting Period", exe, tl));
    card.Exec = { Period: num(at("Execution Period (Months)", exe, tl)), Start: date(at("Execution Start Date", exe, tl)), ReportingPeriod: rp,
      PlannedToDate: num(at("Planned Progress (% to Date)", exe, tl)), ActualToDate: num(at("Actual Progress (% to Date)", exe, tl)), Months: [] };
    var ep = findRow(/^execution period/, exe, tl);
    if (ep >= 0) { card.Exec.FCCPeriod = num(v(ep, 5)); }
    var toc = findRow(/^planned progress \(% to date\)$/, exe, tl);
    if (toc >= 0 && /toc/i.test(txt(toc, 7))) card.Exec.TOC = str(v(toc, 8));
    if (md >= 0) {
      var pr = findRow(/^planned progress \(%\)$/, md, md + 3), ar = findRow(/^actual progress \(%\)$/, md, md + 3);
      for (var mc = 2; mc <= lastC; mc++) {
        var d = date(v(md, mc)); if (!d) continue;
        var pv = pr >= 0 ? num(v(pr, mc)) : null, av = ar >= 0 ? num(v(ar, mc)) : null;
        if (pv == null && av == null) continue;
        card.Exec.Months.push({ Month: d, Plan: pv, Actual: rp && d > rp ? null : av });
      }
    }
    // 8. Project timeline: phases ("… Phase") and their activities
    card.Timeline = [];
    var th = findRow(/^project phases$/, tl, tl + 5);
    if (th >= 0) {
      var tc = {};
      for (var hc2 = 1; hc2 <= lastC; hc2++) { var hk = low(th, hc2); if (hk) tc[hk] = hc2; }
      var col = function (re) { for (var k in tc) if (re.test(k)) return tc[k]; return -1; };
      var C_ = { bs: col(/^start date \(baseline\)/), be: col(/^end date \(baseline\)/), rs: col(/^start date \(rev/), re: col(/^end date \(rev/),
        fs: col(/^start date \(forecast/), fe: col(/^end date \(forecast/), pl: col(/^planned progress/), ac: col(/^actual progress/), w: col(/^activities weight/) };
      var phase = null;
      for (var tr = th + 1; tr <= last; tr++) {
        var nm = txt(tr, 1);
        if (/^(project phases|total)$/i.test(nm)) break;
        if (!nm) { if (!txt(tr + 1, 1)) break; continue; }
        var isPh = /phase$/i.test(nm);
        var g = function (k) { return C_[k] >= 0 ? v(tr, C_[k]) : null; };
        var it = { Phase: isPh ? nm : phase, Name: nm, Level: isPh ? 1 : 2,
          BS: date(g("bs")), BE: date(g("be")), RS: date(g("rs")), RE: date(g("re")), FS: date(g("fs")), FE: date(g("fe")),
          Plan: num(g("pl")), Actual: num(g("ac")), Weight: num(g("w")) };
        if (isPh) phase = nm;
        if (!isPh && !it.BS && !it.BE && !it.RS && !it.RE && !it.FS && !it.FE) continue;   // unused work-package slots
        card.Timeline.push(it);
      }
      var tot = findRow(/^total$/, th + 1, bud > 0 ? bud : last);
      if (tot >= 0) card.Total = { BS: date(v(tot, C_.bs)), BE: date(v(tot, C_.be)), RS: date(v(tot, C_.rs)), RE: date(v(tot, C_.re)),
        FS: date(v(tot, C_.fs)), FE: date(v(tot, C_.fe)), Plan: num(v(tot, C_.pl)), Actual: num(v(tot, C_.ac)) };
    }
    // 9. Budget (EVM) and cash flow
    card.Budget = block(/^execution phase \/ work package/, bud, function (x) {
      return Object.keys(x).some(function (k) { return k !== "Execution Phase / Work package" && typeof x[k] === "number" && x[k] !== 0; }); });
    card.CashFlow = block(/^cash-flow activity$/, bud, function (x) { return Object.keys(x).some(function (k) { return typeof x[k] === "number" && x[k] !== 0; }); });
    // 10–11. Milestones & deliverables
    card.Milestones = block(/^milestone \(m\)$/, ms).map(function (x) {
      return { Milestone: x["Milestone (M)"], Planned: date(x["Planned Completion Date"]), Actual: date(x["Actual Date"]), Completed: str(x.Status) };
    }).filter(function (x) { return x.Milestone; });
    card.Deliverables = block(/^deliverable \(d\)$/, dl).map(function (x) {
      return { Deliverable: x["Deliverable (D)"], Due: date(x["Planned Due Date"]), Actual: date(x["Actual Date"]), Status: str(x.Status) };
    }).filter(function (x) { return x.Deliverable && !(/^d\d+$/i.test(x.Deliverable) && !x.Due && !x.Actual); });
    // 12–15. Log summaries and logs (Issue log itself feeds Issue_register)
    card.IssueSummary = { Total: num(at("Total Issues", isum, isum + 15)), Open: num(at("Open Issues", isum, isum + 15)), Closed: num(at("Closed Issues", isum, isum + 15)) };
    card.Changes = block(/^cr id/, csum, function (x) { return hasAny(x, ["Change Request Title", "Change Request (Description)", "CR Status", "Submission Date"]); });
    card.ChangeSummary = { Total: num(at("Total changes", csum, csum + 25)), CostImpact: num(at("Total cost impact", csum, csum + 25)),
      Duration: num(at("Total increased duration", csum, csum + 25)), Approved: num(at("Changes appoved", csum, csum + 25)) };
    card.Risks = block(/^rrf id/, rsum, function (x) { return hasAny(x, ["Risk Title", "Risk (Description)", "Risk Owner"]); });
    card.RiskSummary = { Total: num(at("Total risks", rsum, rsum + 20)), Open: num(at("Open Risks", rsum, rsum + 20)), Closed: num(at("Closed Risks", rsum, rsum + 20)) };
    card.Claims = block(/^claim id/, clsum, function (x) { return hasAny(x, ["Claim Description", "Date of Claim", "Status", "Claiming for"]); });
    // KPIs (phase carried down)
    card.KPIs = [];
    var kh = kpi >= 0 ? findRow(/^phase$/, kpi, kpi + 5) : -1;
    if (kh >= 0) for (var kr = kh + 1, ph = null, blanks = 0; kr <= last && blanks < 3; kr++) {
      var kd = txt(kr, 2);
      if (!kd) { blanks++; if (txt(kr, 1)) ph = txt(kr, 1); continue; }
      blanks = 0; if (txt(kr, 1)) ph = txt(kr, 1);
      card.KPIs.push({ Phase: ph, KPI: kd, Value: num(v(kr, 3)) });
    }
    return card;
  }

  function parseProjectCards(XLSX, wb, sheetNames) {
    var rows = [], cardRecs = [], cards = 0, noLog = [], reportingPeriod = null, headersSeen = {};
    sheetNames.forEach(function (name) {
      var ws = wb.Sheets[name];
      if (!ws || !ws["!ref"]) return;
      var rg = XLSX.utils.decode_range(ws["!ref"]);
      function v(r, c) { return cellValue(XLSX, ws[XLSX.utils.encode_cell({ r: r, c: c })]); }
      function txt(r, c) { var x = v(r, c); return x == null ? "" : normKey(x); }
      // "Label | value" pairs of the card header (label in column B, value in column C)
      function field(label) {
        var want = label.toLowerCase();
        for (var r = rg.s.r; r <= Math.min(rg.e.r, 200); r++) if (txt(r, 1).toLowerCase() === want) return v(r, 2);
        return null;
      }
      // Section heading "Issue Log" → the header row that starts with "ILR ID No."
      var head = -1, hdr = -1;
      for (var r = rg.s.r; r <= rg.e.r; r++) {
        if (head < 0 && txt(r, 1).toLowerCase() === "issue log") head = r;
        else if (head >= 0 && /^ilr id/i.test(txt(r, 1))) { hdr = r; break; }
        if (head >= 0 && r - head > 10) break;
      }
      cards++;
      try { cardRecs.push(parseCard(XLSX, ws, name)); } catch (e) { cardRecs.push({ Sheet: name, Code: String(name).split("_")[0], Name: name, error: String(e.message || e) }); }
      if (hdr < 0) { noLog.push(name); return; }
      // the log's columns: the continuous run of text headers starting at "ILR ID No." (helper cells further right are ignored)
      var cols = [];
      for (var c = 1; c <= rg.e.c; c++) {
        var hc = ws[XLSX.utils.encode_cell({ r: hdr, c: c })];
        if (!hc || hc.t !== "s" || !String(hc.v).trim()) break;
        var h = normKey(hc.v); cols.push({ c: c, key: h }); headersSeen[h] = 1;
      }
      var code = field("Project Code"), pname = field("Project Name"), pm = field("Project Manager");
      var rp = field("Reporting Period"); if (rp && (!reportingPeriod || rp > reportingPeriod)) reportingPeriod = rp;
      code = code != null ? String(code).trim() : String(name).split("_")[0];
      for (var rr = hdr + 1; rr <= rg.e.r; rr++) {
        var id = txt(rr, 1);
        if (!/ilr/i.test(id)) break;                            // end of the log (next section / blank)
        var rec = {};
        cols.forEach(function (col) {
          var x = v(rr, col.c);
          if (x === 0 && TEXT_COLS.test(col.key)) x = null;         // formula blanks show as 0 in text columns
          rec[col.key] = x;
        });
        // skip the empty placeholder slots (only an ILR number, no content)
        var has = ["Issue Identification (Date)", "Issue Title", "Issue (Description)", "Issue Category", "Issue Status", "Resolution Action Plan"]
          .some(function (k) { return rec[k] != null && rec[k] !== ""; });
        if (!has) continue;
        rows.push(Object.assign({
          Code: name, "Poject Code": code, "Project Name": pname != null ? String(pname).trim() : name,
          "Project Manager": pm != null ? String(pm).trim() : null, "Report to": "PMO Cards", "Reporting Period": rp
        }, rec));
      }
    });
    var missing = SOURCES.cards.tables.Issue_register.filter(function (c) { return !headersSeen[normKey(c)]; });
    var report = [{ table: "Issue_register", rows: rows.length, status: missing.length ? "warning" : "ok", missing: missing,
      via: cards + " project cards" + (noLog.length ? " (" + noLog.length + " without an Issue Log: " + noLog.join(", ") + ")" : "") }];
    report.push({ table: "Project_Cards", rows: cardRecs.length, status: cardRecs.length ? "ok" : "missing", missing: [], via: "all card sections" });
    return { source: "cards", label: SOURCES.cards.label, tables: { Issue_register: rows, Project_Cards: cardRecs }, report: report, reportingPeriod: reportingPeriod };
  }

  /* Closing-phase register: the first sheet whose header row has "Code", a close-out column and a retention column. */
  function parsePdData(XLSX, wb) {
    for (var si = 0; si < wb.SheetNames.length; si++) {
      var name = wb.SheetNames[si], ws = wb.Sheets[name];
      if (!ws || !ws["!ref"]) continue;
      var rg = XLSX.utils.decode_range(ws["!ref"]), hdr = -1, cols = [];
      for (var r = rg.s.r; r <= Math.min(rg.e.r, rg.s.r + 10) && hdr < 0; r++) {
        var hs = [];
        for (var c = rg.s.c; c <= rg.e.c; c++) { var cl = ws[XLSX.utils.encode_cell({ r: r, c: c })]; hs.push({ c: c, key: cl ? normKey(cl.v) : "" }); }
        var txt = hs.map(function (h) { return h.key.toLowerCase(); });
        if (txt.indexOf("program name") >= 0 && txt.indexOf("approved budget") >= 0 && txt.indexOf("total paid") >= 0 && txt.indexOf("project name") >= 0) { hdr = r; cols = hs.filter(function (h) { return h.key; }); }
      }
      if (hdr < 0) continue;
      var rows = [], blank = 0;
      for (var rr = hdr + 1; rr <= rg.e.r && blank < 3; rr++) {
        var rec = {}, any = false;
        cols.forEach(function (h) {
          var x = cellValue(XLSX, ws[XLSX.utils.encode_cell({ r: rr, c: h.c })]);
          if (typeof x === "string") x = x.replace(/\s+/g, " ").trim();
          if (x != null && x !== "") any = true;
          if (!(h.key in rec) || rec[h.key] == null) rec[h.key] = x;
        });
        if (!any || !rec["Project Name"]) { blank++; continue; }
        blank = 0; rows.push(rec);
      }
      var have = cols.map(function (h) { return h.key; });
      var missing = SOURCES.pdData.tables.Program_DB.filter(function (k) { return have.indexOf(normKey(k)) < 0; });
      return { source: "pdData", label: SOURCES.pdData.label, tables: { Program_DB: rows },
        report: [{ table: "Program_DB", rows: rows.length, status: missing.length ? "warning" : "ok", missing: missing, via: "sheet " + name }] };
    }
    return null;
  }

  function parseBlockades(XLSX, wb) {
    for (var si = 0; si < wb.SheetNames.length; si++) {
      var name = wb.SheetNames[si], ws = wb.Sheets[name];
      if (!ws || !ws["!ref"]) continue;
      var rg = XLSX.utils.decode_range(ws["!ref"]), hdr = -1, cols = [];
      for (var r = rg.s.r; r <= Math.min(rg.e.r, rg.s.r + 10) && hdr < 0; r++) {
        var hs = [];
        for (var c = rg.s.c; c <= rg.e.c; c++) { var cl = ws[XLSX.utils.encode_cell({ r: r, c: c })]; hs.push({ c: c, key: cl ? normKey(cl.v) : "" }); }
        var txt = hs.map(function (h) { return h.key.toLowerCase(); });
        if (txt.some(function (t) { return /^shutdown duration/.test(t); }) && txt.some(function (t) { return /^blockage/.test(t); }) && txt.indexOf("project") >= 0) { hdr = r; cols = hs.filter(function (h) { return h.key; }); }
      }
      if (hdr < 0) continue;
      // merged cells: copy the top-left value into every cell of the range
      var merged = {};
      (ws["!merges"] || []).forEach(function (m) {
        var v = cellValue(XLSX, ws[XLSX.utils.encode_cell(m.s)]);
        for (var mr = m.s.r; mr <= m.e.r; mr++) for (var mc = m.s.c; mc <= m.e.c; mc++) merged[mr + ":" + mc] = v;
      });
      function val(rr, cc) { var k = rr + ":" + cc; return k in merged ? merged[k] : cellValue(XLSX, ws[XLSX.utils.encode_cell({ r: rr, c: cc })]); }
      var rows = [], blank = 0, last = {};
      for (var rr = hdr + 1; rr <= rg.e.r && blank < 3; rr++) {
        var rec = {}, any = false;
        cols.forEach(function (h) {
          var x = val(rr, h.c);
          if (typeof x === "string") x = x.replace(/\r/g, "").trim();
          if (typeof x === "number" && /^(code|unique id)$/i.test(h.key)) x = String(x);
          if (x != null && x !== "") any = true;
          rec[h.key] = x;
        });
        if (!any) { blank++; continue; }
        blank = 0;
        ["Unique ID", "Code", "Project"].forEach(function (k) { if (rec[k] == null || rec[k] === "") rec[k] = last[k]; else last[k] = rec[k]; });
        if (rec.Project == null) continue;
        rec.Row = rr + 1; rows.push(rec);
      }
      var have = cols.map(function (h) { return h.key; });
      var missing = SOURCES.blockades.tables.Blockades_2027.filter(function (k) { return have.indexOf(normKey(k)) < 0; });
      return { source: "blockades", label: SOURCES.blockades.label, tables: { Blockades_2027: rows },
        report: [{ table: "Blockades_2027", rows: rows.length, status: missing.length ? "warning" : "ok", missing: missing, via: "sheet " + name }] };
    }
    return null;
  }

  function parseClosing(XLSX, wb) {
    for (var si = 0; si < wb.SheetNames.length; si++) {
      var name = wb.SheetNames[si], ws = wb.Sheets[name];
      if (!ws || !ws["!ref"]) continue;
      var rg = XLSX.utils.decode_range(ws["!ref"]), hdr = -1, cols = [];
      for (var r = rg.s.r; r <= Math.min(rg.e.r, rg.s.r + 15) && hdr < 0; r++) {
        var hs = [];
        for (var c = rg.s.c; c <= rg.e.c; c++) { var cl = ws[XLSX.utils.encode_cell({ r: r, c: c })]; hs.push({ c: c, key: cl ? normKey(cl.v) : "" }); }
        var txt = hs.map(function (h) { return h.key.toLowerCase(); });
        if (txt.indexOf("code") >= 0 && txt.some(function (t) { return /clos[e]?\s?out/.test(t); }) && txt.some(function (t) { return /retention/.test(t); })) { hdr = r; cols = hs.filter(function (h) { return h.key; }); }
      }
      if (hdr < 0) continue;
      var title = null;
      for (var tr = rg.s.r; tr < hdr; tr++) { var tc = ws[XLSX.utils.encode_cell({ r: tr, c: rg.s.c })]; if (tc && tc.v) title = normKey(tc.v); }
      var rows = [], blank = 0;
      for (var rr = hdr + 1; rr <= rg.e.r && blank < 3; rr++) {
        var rec = {}, any = false;
        cols.forEach(function (h) {
          var x = cellValue(XLSX, ws[XLSX.utils.encode_cell({ r: rr, c: h.c })]);
          if (typeof x === "number" && /^(code|po)$/i.test(h.key)) x = String(x);
          if (x != null && x !== "") any = true;
          if (!(h.key in rec) || rec[h.key] == null) rec[h.key] = x;
        });
        if (!any || (rec.Code == null && rec["Project Name"] == null)) { blank++; continue; }
        blank = 0; rows.push(rec);
      }
      var have = cols.map(function (h) { return h.key; });
      var missing = SOURCES.closing.tables.Closing_Projects.filter(function (k) { return have.indexOf(normKey(k)) < 0; });
      return { source: "closing", label: SOURCES.closing.label, title: title, tables: { Closing_Projects: rows },
        report: [{ table: "Closing_Projects", rows: rows.length, status: missing.length ? "warning" : "ok", missing: missing, via: "sheet " + name }] };
    }
    return null;
  }

  /* Balanced Scorecard targets: header row with "Objective / KPI", "... Target" and "KPI Weight" */
  function parseKpiTargets(XLSX, wb) {
    for (var si = 0; si < wb.SheetNames.length; si++) {
      var name = wb.SheetNames[si], ws = wb.Sheets[name];
      if (!ws || !ws["!ref"]) continue;
      var rg = XLSX.utils.decode_range(ws["!ref"]), hdr = -1, col = {}, year = null;
      for (var r = rg.s.r; r <= Math.min(rg.e.r, rg.s.r + 15) && hdr < 0; r++) {
        var m = {};
        for (var c = rg.s.c; c <= rg.e.c; c++) {
          var cl = ws[XLSX.utils.encode_cell({ r: r, c: c })], k = cl ? normKey(cl.v).toLowerCase() : "";
          if (/^objective\s*\/?\s*kpis?$/.test(k)) m.kpi = c; else if (/target/.test(k)) { m.target = c; year = (/(20\d\d)/.exec(k) || [])[1] || null; }
          else if (/^kpi weight/.test(k)) m.weight = c; else if (/^perspective/.test(k)) m.persp = c; else if (/^unit/.test(k)) m.unit = c;
          else if (/^data source/.test(k)) m.src = c; else if (/^formula/.test(k)) m.formula = c; else if (/^remarks?/.test(k)) m.rem = c;
        }
        if (m.kpi != null && m.target != null && m.weight != null) { hdr = r; col = m; }
      }
      if (hdr < 0) continue;
      var title = [];
      for (var tr = rg.s.r; tr < hdr; tr++) { var tc = ws[XLSX.utils.encode_cell({ r: tr, c: rg.s.c })]; if (tc && tc.v) title.push(normKey(tc.v)); }
      function v(rr, c) { return c == null ? null : cellValue(XLSX, ws[XLSX.utils.encode_cell({ r: rr, c: c })]); }
      var rows = [], persp = null, obj = null;
      for (var rr = hdr + 1; rr <= rg.e.r; rr++) {
        var p = v(rr, col.persp), kpi = v(rr, col.kpi), unit = v(rr, col.unit), tg = v(rr, col.target), w = v(rr, col.weight);
        if (p) persp = normKey(p);
        if (!kpi) continue;
        if (unit == null && tg == null) { obj = normKey(kpi); continue; }   // objective heading row
        rows.push({ Perspective: persp, Objective: obj, KPI: normKey(kpi), Unit: unit == null ? null : normKey(unit), Target: typeof tg === "string" ? normKey(tg) : tg,
          "Target Year": year ? +year : null, "KPI Weight": w, "Data Source": v(rr, col.src) == null ? null : normKey(v(rr, col.src)),
          Formula: v(rr, col.formula), Remarks: v(rr, col.rem) });
      }
      if (!rows.length) continue;
      return { source: "kpiTargets", label: SOURCES.kpiTargets.label, title: title.join(" · ") || null, tables: { KPI_Targets: rows },
        report: [{ table: "KPI_Targets", rows: rows.length, status: "ok", missing: [], via: "sheet " + name + (year ? " · " + year + " targets" : "") }] };
    }
    return null;
  }

  /* Budget 2026: rows "<Category> | <code> | <measure> | Jan … Dec | Total"; month columns come from the
     nearest date header row above each block. The budget file numbers Riyadh Dry Port one step later than the
     delivery plan (0674C = construction, 0674D = design), so those codes are mapped to 0674 / 0674C. */
  var BUDGET_MEASURES = { "spending plan (og)": "OG Spend Plan", "spending plan (abt)": "ABT Spend Plan", "forecast": "Budget Forecast",
    "spending plan (vp)": "Rev Spend Plan", "actual": "Budget Actual" };
  function parseBudget(XLSX, wb) {
    for (var si = 0; si < wb.SheetNames.length; si++) {
      var name = wb.SheetNames[si], ws = wb.Sheets[name];
      if (!ws || !ws["!ref"]) continue;
      var rg = XLSX.utils.decode_range(ws["!ref"]), found = false;
      for (var r0 = rg.s.r; r0 <= Math.min(rg.e.r, 60) && !found; r0++) for (var c0 = rg.s.c; c0 <= Math.min(rg.e.c, 6); c0++) {
        var x0 = ws[XLSX.utils.encode_cell({ r: r0, c: c0 })]; if (x0 && /^spending plan \(vp\)$/i.test(normKey(x0.v))) { found = true; break; }
      }
      if (!found) continue;
      var monthCols = null, by = {}, codes = {};
      for (var r = rg.s.r; r <= rg.e.r; r++) {
        var dates = [];
        for (var c = rg.s.c; c <= rg.e.c; c++) { var dv = cellValue(XLSX, ws[XLSX.utils.encode_cell({ r: r, c: c })]); if (typeof dv === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dv)) dates.push({ c: c, m: dv.slice(0, 7) + "-01" }); }
        if (dates.length >= 6) { monthCols = dates; continue; }
        var labC = -1, lab = null;
        for (var lc = rg.s.c; lc <= Math.min(rg.e.c, 6); lc++) { var lv = ws[XLSX.utils.encode_cell({ r: r, c: lc })]; if (lv && BUDGET_MEASURES[normKey(lv.v).toLowerCase()]) { labC = lc; lab = BUDGET_MEASURES[normKey(lv.v).toLowerCase()]; break; } }
        if (labC < 1 || !monthCols) continue;
        var code = cellValue(XLSX, ws[XLSX.utils.encode_cell({ r: r, c: labC - 1 })]), cat = cellValue(XLSX, ws[XLSX.utils.encode_cell({ r: r, c: labC - 2 })]);
        if (code == null) continue; code = String(code).trim();
        if (!/\d/.test(code)) continue;                                     // skip the program summary block (e.g. "CAPEX")
        codes[code] = 1;
        monthCols.forEach(function (mc) {
          var k = code + "|" + mc.m, o = by[k] || (by[k] = { "Budget Code": code, Category: cat, Month: mc.m });
          var v = cellValue(XLSX, ws[XLSX.utils.encode_cell({ r: r, c: mc.c })]);
          o[lab] = typeof v === "number" ? v : (o[lab] != null ? o[lab] : null);
        });
      }
      var shifted = codes["0674C"] && codes["0674D"], MAP = shifted ? { "0674C": "0674", "0674D": "0674C" } : {};
      var rows = Object.keys(by).map(function (k) { var o = by[k]; o.ID = MAP[o["Budget Code"]] || o["Budget Code"]; return o; });
      var mapped = Object.keys(MAP).map(function (k) { return k + " → " + MAP[k]; });
      return { source: "budget", label: SOURCES.budget.label, tables: { Rev_Spend_Plan: rows },
        report: [{ table: "Rev_Spend_Plan", rows: rows.length, status: rows.length ? "ok" : "missing", missing: [],
          via: "sheet " + name + " · " + Object.keys(codes).length + " projects" + (mapped.length ? " · codes mapped: " + mapped.join(", ") : "") }] };
    }
    return null;
  }

  async function parseWorkbook(buffer, XLSX, JSZip) {
    var zip = await JSZip.loadAsync(buffer);
    if (!zip.file("xl/workbook.xml")) throw new Error("Not an .xlsx workbook (xl/workbook.xml missing). Save the file as Excel Workbook (*.xlsx).");
    var meta = await listTables(zip);
    var names = Object.keys(meta.tables);
    var source = detectSource(names.concat(meta.sheets));
    var cardSheets = meta.sheets.filter(function (s) { return CARD_RE.test(s); });
    if (!source && cardSheets.length) {
      var cwb = XLSX.read(buffer, { type: "array", cellNF: true, cellDates: false, cellStyles: false, dense: false, sheets: cardSheets });
      return parseProjectCards(XLSX, cwb, cardSheets);
    }
    if (!source) {
      var swb = XLSX.read(buffer, { type: "array", cellNF: true, cellDates: false, cellStyles: false, dense: false });
      var bl = parseBlockades(XLSX, swb);
      if (bl) return bl;
      var pd = parsePdData(XLSX, swb);
      if (pd) return pd;
      var closing = parseClosing(XLSX, swb);
      if (closing) return closing;
      var budget = parseBudget(XLSX, swb);
      if (budget) return budget;
      var kt = parseKpiTargets(XLSX, swb);
      if (kt) return kt;
      throw new Error("This workbook does not contain any of the expected Excel tables. Found tables: " + (names.join(", ") || "none"));
    }

    var wb = XLSX.read(buffer, { type: "array", cellNF: true, cellDates: false, cellStyles: false, dense: false });
    var spec = SOURCES[source], out = {}, report = [];

    Object.keys(spec.tables).forEach(function (tname) {
      var t = meta.tables[tname], rows = null, via = "table";
      if (t && wb.Sheets[t.sheet]) {
        var headers = t.columns.length ? t.columns : sheetHeaders(XLSX, wb.Sheets[t.sheet], t.ref);
        rows = readRange(XLSX, wb.Sheets[t.sheet], t.ref, headers, t.headerRowCount, t.totalsRowCount);
      } else if (spec.sheetFallback && spec.sheetFallback[tname] && wb.Sheets[spec.sheetFallback[tname]]) {
        var ws = wb.Sheets[spec.sheetFallback[tname]];
        via = "sheet";
        if (ws["!ref"]) rows = readRange(XLSX, ws, ws["!ref"], sheetHeaders(XLSX, ws, ws["!ref"]), 1, 0);
      }
      if (!rows) { report.push({ table: tname, rows: 0, status: "missing", missing: [] }); return; }
      var present = {};
      rows.forEach(function (r) { for (var k in r) present[k] = 1; });
      var have = t ? t.columns : Object.keys(present);
      var missing = spec.tables[tname].filter(function (c) { return have.indexOf(normKey(c)) < 0; });
      out[tname] = rows;
      report.push({ table: tname, rows: rows.length, status: missing.length ? "warning" : "ok", missing: missing, via: via });
    });
    return { source: source, label: spec.label, tables: out, report: report };
  }

  return { SOURCES: SOURCES, parseWorkbook: parseWorkbook, normKey: normKey };
});

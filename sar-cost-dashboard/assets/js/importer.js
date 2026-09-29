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
    // Monthly "EP - NSR Projects <Mon><YY>.xlsx": one sheet per project ("<code>_Project Card").
    // The Issue Register is built from section 12.1 "Issue Log" of every card (see parseProjectCards).
    cards: {
      label: "EP – NSR Projects (Project Cards)",
      file: "EP - NSR Projects <Month>.xlsx",
      projectCards: true,
      tables: {
        Issue_register: ["ILR ID No.", "Issue Identification (Date)", "Issue Owner", "Issue Title", "Issue Category",
          "Issue (Description)", "Issue Impact", "Issue Urgency", "Issue Score", "Issue Rate", "Resolution Action Plan",
          "Action Plan Owner", "Action Plan (Original Due Date)", "Issue Closure Date", "Issue Status", "Remarks / Comments"]
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

  function parseProjectCards(XLSX, wb, sheetNames) {
    var rows = [], cards = 0, noLog = [], reportingPeriod = null, headersSeen = {};
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
    return { source: "cards", label: SOURCES.cards.label, tables: { Issue_register: rows }, report: report, reportingPeriod: reportingPeriod };
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
    if (!source) throw new Error("This workbook does not contain any of the expected Excel tables. Found tables: " + (names.join(", ") || "none"));

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

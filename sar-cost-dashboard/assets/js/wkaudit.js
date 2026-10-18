/*
 * Weekly report files — full review (SARWeeklyAudit).
 * Reads every sheet of each project's weekly report workbook (the .rar / .zip / .xlsx imported for progress photos)
 * and lists what a consultant receiving the report would send back: formula errors, sheets left on an old week,
 * totals that don't add up, cumulative figures that go down, one sheet disagreeing with another, passed dates on open
 * items, empty mandatory fields and values copied from another project.
 * Every finding names the file › sheet › cell(s). The workbooks are never changed.
 *
 *   SARWeeklyAudit.fromBuffer(buffer, fileName, code) → findings[]   (browser: uses window.XLSX)
 *   SARWeeklyAudit.auditBook(XLSX, wb, fileName, code) → findings[]
 *   SARWeeklyAudit.cross(byFile) → findings[] that compare the project files with each other
 *   finding = { File, Code, Sheet, Cell, Severity: "error"|"warn"|"info", Section, Rule, Finding, Fix }
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SARWeeklyAudit = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function isoOf(y, m, d) { return y + "-" + pad(m) + "-" + pad(d); }
  function addDays(iso, n) { var t = Date.parse(iso + "T00:00:00Z") + n * 864e5; return new Date(t).toISOString().slice(0, 10); }
  function days(a, b) { return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5); }
  function fmtD(iso) { if (!iso || !/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(iso)) return iso || "—"; var p = iso.split("-"); return +p[2] + "-" + MON[+p[1] - 1].replace(/^./, function (c) { return c.toUpperCase(); }) + "-" + p[0]; }
  function pc(v) { return v == null ? "—" : (Math.round(v * 1000) / 10) + "%"; }
  function money(v) { return v == null ? "—" : Math.round(v).toLocaleString("en-US"); }
  function clip(s, n) { s = String(s == null ? "" : s).replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  function norm(s) { return String(s == null ? "" : s).replace(/[\s ]+/g, " ").trim().toLowerCase(); }
  function isoWeek(iso) {
    var d = new Date(iso + "T00:00:00Z"), day = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - day + 3);
    var first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    return 1 + Math.round(((d - first) / 864e5 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  }
  function codeOf(name) { var m = /NSR[_\- ]+([A-Z]?\d{3,4}[A-Z]?)/i.exec(name || "") || /(?:^|[_\- ])([A-Z]?\d{4}[A-Z]?)(?:[_\- ]|$)/.exec(name || ""); return m ? m[1].toUpperCase() : ""; }

  function auditBook(XLSX, wb, file, code) {
    var out = [], enc = XLSX.utils.encode_cell, dec = XLSX.utils.decode_cell;
    code = code || codeOf(file);
    function add(sev, sheet, cell, section, rule, msg, fix) {
      out.push({ File: file, Code: code, Sheet: sheet || "", Cell: cell || "", Severity: sev, Section: section || sheet || "", Rule: rule, Finding: msg, Fix: fix || "" });
    }
    function A(r, c) { return enc({ r: r, c: c }); }
    function sheet(re) { var n = wb.SheetNames.filter(function (s) { return re.test(s); })[0]; return n ? { name: n, ws: wb.Sheets[n] } : null; }
    function C(ws, r, c) { return ws[A(r, c)]; }
    function num(cell) {
      if (!cell || cell.v == null || cell.t === "e") return null;
      if (typeof cell.v === "number") return cell.v;
      var s = String(cell.v).replace(/[,\s%]/g, ""); if (s === "" || s === "-") return null;
      var n = +s; return isFinite(n) ? (/%\s*$/.test(String(cell.v)) ? n / 100 : n) : null;
    }
    function text(cell) { return !cell || cell.v == null ? "" : String(cell.v).replace(/[\s ]+/g, " ").trim(); }
    /* any date form used in the template: Excel serial, yyyy-mm-dd, d-m-yyyy, dd-Mmm-yy (± " A" actual mark) */
    function date(cell) {
      if (!cell || cell.v == null || cell.t === "e") return "";
      if (typeof cell.v === "number") {
        if (cell.v < 20000 || cell.v > 80000) return "";
        var p = XLSX.SSF.parse_date_code(cell.v); return p ? isoOf(p.y, p.m, p.d) : "";
      }
      var s = String(cell.v).trim(), m;
      if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return isoOf(+m[1], +m[2], +m[3]);
      if ((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(s))) { var dd = +m[1], mm = +m[2]; if (mm > 12 && dd <= 12) { var t0 = dd; dd = mm; mm = t0; } return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 ? isoOf(+m[3], mm, dd) : ""; }
      if ((m = /^(\d{1,2})[\s\-\/]([A-Za-z]{3,9})[\s\-\/,]+(\d{2,4})/.exec(s))) {
        var mi = MON.indexOf(m[2].slice(0, 3).toLowerCase()); if (mi < 0) return "";
        var y = +m[3]; if (y < 100) y += 2000; return isoOf(y, mi + 1, +m[1]);
      }
      return "";
    }
    function isActualMark(cell) { return !!cell && typeof cell.v === "string" && /\sA\s*\*?$/.test(cell.v); }
    function range(ws) { return ws && ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : null; }
    /* first cell whose text matches (row-major, up to maxRow) */
    function find(ws, re, maxRow, startRow) {
      var rg = range(ws); if (!rg) return null;
      for (var r = startRow || rg.s.r; r <= Math.min(rg.e.r, maxRow == null ? rg.e.r : maxRow); r++)
        for (var c = rg.s.c; c <= rg.e.c; c++) { var x = ws[A(r, c)]; if (x && typeof x.v === "string" && re.test(norm(x.v))) return { r: r, c: c }; }
      return null;
    }
    function list(cells, n) { n = n || 6; return cells.slice(0, n).join(", ") + (cells.length > n ? " … (+" + (cells.length - n) + ")" : ""); }
    /* header-row table (row 1 headers) → rows of { r, get(name) → cell } */
    function table(ws, hdrRow) {
      var rg = range(ws); if (!rg) return { cols: {}, rows: [] };
      hdrRow = hdrRow || rg.s.r;
      var cols = {}; for (var c = rg.s.c; c <= rg.e.c; c++) { var h = ws[A(hdrRow, c)]; if (h && h.v != null) cols[norm(h.v)] = c; }
      var rows = [];
      for (var r = hdrRow + 1; r <= rg.e.r; r++) {
        var any = false; for (c = rg.s.c; c <= rg.e.c; c++) { var x = ws[A(r, c)]; if (x && x.v != null && String(x.v).trim() !== "") { any = true; break; } }
        if (any) rows.push(r);
      }
      return { cols: cols, rows: rows, col: function (re) { for (var k in cols) if (re.test(k)) return cols[k]; return -1; } };
    }
    function safe(name, fn) { try { fn(); } catch (e) { add("info", name, "", name, "audit", "This sheet could not be fully checked (" + e.message + ").", "Check the sheet layout against the SAR template."); } }

    /* ---------------- report date of the file (most common date across the sheets) ---------------- */
    var rdSeen = [];   // { sheet, cell, iso }
    function rdAt(sheetName, ws, re, maxRow) {
      var p = find(ws, re || /^report date$/, maxRow == null ? 6 : maxRow); if (!p) return "";
      for (var dc = 1; dc <= 3; dc++) { var d = date(C(ws, p.r, p.c + dc)); if (d) { rdSeen.push({ sheet: sheetName, cell: A(p.r, p.c + dc), iso: d }); return d; } }
      var d2 = date(C(ws, p.r + 1, p.c)); if (d2) { rdSeen.push({ sheet: sheetName, cell: A(p.r + 1, p.c), iso: d2 }); return d2; }
      return "";
    }
    wb.SheetNames.forEach(function (n) {
      var ws = wb.Sheets[n]; if (!ws || !ws["!ref"]) return;
      if (/^dashboard$/i.test(n)) rdAt(n, ws, /^status as of:?$/, 12);
      else if (/progress status/i.test(n)) rdAt(n, ws, /^report date$/, 10);
      else if (/^(masterdata_reporting|construction activity progress|h&s observation|key items deliverables|risk|engineering (drawings|log)|submissions)/i.test(n)) {
        var t = table(ws), c = t.col(/^report date$/); if (c >= 0 && t.rows.length) { var d = date(C(ws, t.rows[0], c)); if (d) rdSeen.push({ sheet: n, cell: A(t.rows[0], c), iso: d }); }
      } else if (/^\d+(-\d+)?\.\s|data input/i.test(n)) rdAt(n, ws, /^report date$/, 4);
    });
    var cnt = {}; rdSeen.forEach(function (x) { cnt[x.iso] = (cnt[x.iso] || 0) + 1; });
    var RD = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a] || b.localeCompare(a); })[0] || "";
    var stale = rdSeen.filter(function (x) { return x.iso !== RD; });
    stale.forEach(function (x) { add(x.iso < RD ? "warn" : "error", x.sheet, x.cell, "Report date", "rd-sheet", "Report date here is " + fmtD(x.iso) + " but the rest of the file is " + fmtD(RD) + (x.iso < RD ? " — this sheet was not updated this week." : "."), "Update the sheet to " + fmtD(RD) + "."); });

    /* ---------------- all sheets: formula errors, leftover sheets ---------------- */
    wb.SheetNames.forEach(function (n) {
      var ws = wb.Sheets[n]; if (!ws) return;
      var errs = {};
      Object.keys(ws).forEach(function (k) { if (k.charAt(0) === "!") return; var x = ws[k]; if (x && x.t === "e") { var w = x.w || "#ERR"; (errs[w] = errs[w] || []).push(k); } });
      Object.keys(errs).forEach(function (w) {
        var cells = errs[w].sort(function (a, b) { var A1 = dec(a), B1 = dec(b); return A1.r - B1.r || A1.c - B1.c; });
        add("error", n, list(cells), "Formula errors", "f-err", cells.length + (cells.length === 1 ? " cell shows " : " cells show ") + w + ".", w === "#N/A" ? "A lookup finds nothing (often a date or name not in the source table) — fill the source row or fix the formula." : "Fix the formula or the cells it points to.");
      });
      var hidden = (wb.Workbook && wb.Workbook.Sheets || []).filter(function (s) { return s.name === n; })[0];
      if (/^sheet\d*$|-$|\(\d\)$/i.test(n.trim())) add("info", n, "", "Workbook", "x-sheet", "Extra sheet “" + n + "”" + (hidden && hidden.Hidden ? " (hidden)" : "") + " is not part of the SAR template.", "Delete it or move its content to the right template sheet.");
    });
    var photo = sheet(/^progress photo$/i), ph = (wb.Workbook && wb.Workbook.Sheets || []).filter(function (s) { return photo && s.name === photo.name; })[0];
    if (!photo) add("warn", "Progress Photo", "", "Workbook", "no-photo", "The Progress Photo sheet is missing.", "Add the sheet with this week's 4 site photos.");
    else if (ph && ph.Hidden) add("warn", photo.name, "", "Workbook", "no-photo", "The Progress Photo sheet is hidden.", "Unhide it and add this week's site photos.");

    /* ---------------- Masterdata_Reporting (row 2 = this week's header record) ---------------- */
    var MD = {}, mdS = sheet(/^masterdata_reporting$/i);
    function md(re) { return MD.t && MD.t.col(re) >= 0 ? C(MD.ws, MD.r, MD.t.col(re)) : null; }
    function mdA(re) { return MD.t && MD.t.col(re) >= 0 ? A(MD.r, MD.t.col(re)) : ""; }
    if (!mdS) add("error", "Masterdata_Reporting", "", "Masterdata", "md-miss", "Sheet Masterdata_Reporting is missing — the weekly dashboard cannot read this project.", "Restore the sheet from the SAR template.");
    else safe(mdS.name, function () {
      var t = table(mdS.ws); MD = { ws: mdS.ws, t: t, r: t.rows[0] }; var S = mdS.name;
      if (MD.r == null) { add("error", S, "A2", "Masterdata", "md-empty", "Masterdata_Reporting has no data row.", "Fill row 2."); MD = {}; return; }
      var c0 = text(md(/^project code$/)).toUpperCase();
      if (c0 && code && c0 !== code && c0.replace(/[A-Z]$/, "") !== code.replace(/[A-Z]$/, "")) add("error", S, mdA(/^project code$/), "Masterdata", "md-code", "Project Code is " + c0 + " but the file is for " + code + " (file copied from another project?).", "Correct the Project Code.");
      var req = [[/^project manager$/, "Project Manager"], [/^contractor$/, "Contractor"], [/^\(con\) po number$/, "(Con) PO Number"], [/^\(con\) contract effective date$/, "(Con) Contract Effective Date"],
        [/^start date baseline$/, "Start Date Baseline"], [/^end date baseline$/, "End Date Baseline"], [/^end date \(forecast\/actual\)$/, "End Date (Forecast/Actual)"],
        [/^contract value$/, "Contract Value"], [/^performance status$/, "Performance Status"], [/^phase classification$/, "Phase Classification"], [/^current phase$/, "Current Phase"],
        [/^project status$/, "Project Status"], [/^cost code$/, "Cost Code"], [/^funding source$/, "Funding Source"], [/^budget type$/, "Budget Type"]];
      var empty = req.filter(function (x) { var c = md(x[0]); return !c || c.v == null || String(c.v).trim() === ""; });
      if (empty.length) add("warn", S, list(empty.map(function (x) { return mdA(x[0]); }), 15), "Masterdata", "md-req", "Empty fields: " + empty.map(function (x) { return x[1]; }).join(", ") + ".", "Fill them in row 2 of Masterdata_Reporting (they feed the dashboards).");
      var txtD = []; Object.keys(t.cols).forEach(function (k) { if (!/date/.test(k)) return; var c = C(MD.ws, MD.r, t.cols[k]); if (c && c.t === "s" && String(c.v).trim() && date(c)) txtD.push(A(MD.r, t.cols[k]) + " (" + k + ": “" + String(c.v).trim() + "”)"); });
      if (txtD.length) add("info", S, list(txtD.map(function (x) { return x.split(" ")[0]; })), "Masterdata", "md-txtdate", "Date typed as text: " + txtD.map(function (x) { return x.replace(/^\S+ /, ""); }).join("; ") + ".", "Enter it as a real date (dd-mmm-yyyy) so it sorts and filters correctly.");
      var sB = date(md(/^start date baseline$/)), eB = date(md(/^end date baseline$/)), sF = date(md(/^start date \(forecast\/actual\)$/)), eF = date(md(/^end date \(forecast\/actual\)$/)),
        eff = date(md(/^\(con\) contract effective date$/)), poD = date(md(/^\(con\) po date$/));
      if (sB && eB && eB <= sB) add("error", S, mdA(/^end date baseline$/), "Masterdata", "md-dates", "Baseline end " + fmtD(eB) + " is not after the baseline start " + fmtD(sB) + ".", "Correct the baseline dates.");
      if (sF && eF && eF <= sF) add("error", S, mdA(/^end date \(forecast\/actual\)$/), "Masterdata", "md-dates", "Forecast end " + fmtD(eF) + " is not after the start " + fmtD(sF) + ".", "Correct the forecast dates.");
      if (poD && eff && eff < poD) add("warn", S, mdA(/^\(con\) contract effective date$/), "Masterdata", "md-dates", "Contract effective date " + fmtD(eff) + " is before the PO date " + fmtD(poD) + ".", "Check both dates.");
      if (eF && RD && eF < RD) {
        var aC = num(md(/^actual \(%\) - cumulative$/));
        if (aC != null && aC < 0.9995) add("warn", S, mdA(/^end date \(forecast\/actual\)$/), "Masterdata", "md-fc-past", "Forecast end " + fmtD(eF) + " has passed but progress is " + pc(aC) + ".", "Update the forecast completion date from the latest programme.");
      }
      var yr = norm(text(md(/^to be completed this year\?$/)));
      if (/^y/.test(yr) && eF && RD && eF.slice(0, 4) > RD.slice(0, 4)) add("warn", S, mdA(/^to be completed this year\?$/), "Masterdata", "md-year", "“To be completed this year?” = yes but the forecast end is " + fmtD(eF) + ".", "Set it to No or correct the forecast end.");
      var pW = num(md(/^planned \(%\) this week$/)), pCm = num(md(/^planned \(%\) - cumulative$/)), aW = num(md(/^actual \(%\) this week$/)), aCm = num(md(/^actual \(%\) - cumulative$/));
      [[pW, /^planned \(%\) this week$/], [pCm, /^planned \(%\) - cumulative$/], [aW, /^actual \(%\) this week$/], [aCm, /^actual \(%\) - cumulative$/]].forEach(function (x) {
        if (x[0] != null && (x[0] < -0.0001 || x[0] > 1.0001)) add("error", S, mdA(x[1]), "Masterdata", "md-pct", "Progress value " + pc(x[0]) + " is outside 0–100%.", "Enter the % as a fraction (e.g. 0.85 = 85%).");
      });
      if (aW != null && aW < -0.0001) add("error", S, mdA(/^actual \(%\) this week$/), "Masterdata", "md-neg", "Actual progress this week is negative (" + pc(aW) + ").", "Progress cannot go down — check last week's cumulative.");
      var ps = norm(text(md(/^performance status$/)));
      if (ps && pCm != null && aCm != null) {
        var v = aCm - pCm;
        if (/on ?time|on track/.test(ps) && v < -0.05) add("warn", S, mdA(/^performance status$/), "Masterdata", "md-status", "Performance Status is “" + text(md(/^performance status$/)) + "” but actual is " + pc(-v) + " behind plan.", "Use At Risk / Delayed, or explain in Reason for Delays.");
        if (/delay/.test(ps) && v >= 0 && (!eF || !eB || eF <= eB)) add("info", S, mdA(/^performance status$/), "Masterdata", "md-status", "Performance Status is Delayed but progress is on/above plan and the forecast end is not later than the baseline.", "Check the status.");
        if (v < -0.02 && !text(md(/^reason for delays$/))) add("warn", S, mdA(/^reason for delays$/), "Masterdata", "md-reason", "Actual is " + pc(-v) + " behind plan but Reason for Delays is empty.", "Explain the delay.");
      }
      var cv = num(md(/^contract value$/)), rcv = num(md(/^revised contract value$/)), ev = num(md(/^cumulative ev \(sar\)$/)), pv = num(md(/^cumulative pv \(sar\)$/)), spi = num(md(/^spi$/));
      if (ev != null && pv) { var s2 = ev / pv; if (spi != null && Math.abs(s2 - spi) > 0.005) add("error", S, mdA(/^spi$/), "Masterdata", "md-spi", "SPI is " + spi.toFixed(3) + " but EV ÷ PV = " + s2.toFixed(3) + ".", "Recalculate SPI = Cumulative EV ÷ Cumulative PV."); }
      var base = rcv || cv;
      if (ev != null && aCm != null && base) { var exp = aCm * base, alt = aCm * (cv || base); if (Math.abs(ev - exp) > Math.max(1000, base * 0.005) && Math.abs(ev - alt) > Math.max(1000, base * 0.005)) add("info", S, mdA(/^cumulative ev \(sar\)$/), "Masterdata", "md-ev", "Cumulative EV " + money(ev) + " ≠ Actual % × contract value (" + money(exp) + ").", "Check how EV is calculated."); }
      if (pv != null && pCm != null && base) { var expP = pCm * base, altP = pCm * (cv || base); if (Math.abs(pv - expP) > Math.max(1000, base * 0.005) && Math.abs(pv - altP) > Math.max(1000, base * 0.005)) add("info", S, mdA(/^cumulative pv \(sar\)$/), "Masterdata", "md-ev", "Cumulative PV " + money(pv) + " ≠ Planned % × contract value (" + money(expP) + ").", "Check how PV is calculated."); }
      var sub = num(md(/^submitted amount$/)), paid = num(md(/^paid amount$/)), pp = num(md(/^paid \(%\)/)), subN = num(md(/^submitted ipc\/vo no\.$/)), paidN = num(md(/^paid ipc\/vo no\.$/));
      if (paid != null && sub != null && paid > sub + 1) add("error", S, mdA(/^paid amount$/), "Masterdata", "md-pay", "Paid " + money(paid) + " is more than Submitted " + money(sub) + ".", "Check the IPC amounts.");
      if (sub != null && base && sub > base * 1.0001) add("error", S, mdA(/^submitted amount$/), "Masterdata", "md-pay", "Submitted " + money(sub) + " is more than the contract value " + money(base) + ".", "Check the IPC amounts / contract value.");
      if (paidN != null && subN != null && paidN > subN) add("error", S, mdA(/^paid ipc\/vo no\.$/), "Masterdata", "md-pay", "Paid IPC No. " + paidN + " is higher than the submitted IPC No. " + subN + ".", "Check the IPC numbers.");
      if (paid != null && pp != null && cv) { var e1 = paid / cv, e2 = rcv ? paid / rcv : e1; if (Math.abs(pp - e1) > 0.005 && Math.abs(pp - e2) > 0.005) add("error", S, mdA(/^paid \(%\)/), "Masterdata", "md-pay", "Paid % is " + pc(pp) + " but Paid ÷ Contract Value = " + pc(e1) + ".", "Recalculate Paid %."); }
      var voN = num(md(/^variation ipc\/vo no\.$/)), voA = num(md(/^variation order amount$/));
      if (voA && !voN) add("warn", S, mdA(/^variation ipc\/vo no\.$/), "Masterdata", "md-vo", "Variation Order amount is " + money(voA) + " but the VO No. is " + (voN == null ? "empty" : "0") + ".", "Enter the VO number.");
      if (cv && rcv && voA != null && Math.abs(cv + voA - rcv) > 1) add("info", S, mdA(/^revised contract value$/), "Masterdata", "md-vo", "Revised Contract Value " + money(rcv) + " ≠ Contract Value " + money(cv) + " + VO " + money(voA) + ".", "Check the revised value.");
      if (cv && rcv && rcv !== cv && !voA) add("info", S, mdA(/^revised contract value$/), "Masterdata", "md-vo", "Revised Contract Value " + money(rcv) + " differs from the Contract Value " + money(cv) + " with no Variation Order amount.", "Enter the VO amount or correct the revised value.");
      // safety pairs: cumulative ≥ this week
      var bad = [];
      Object.keys(t.cols).forEach(function (k) {
        var m = /^(.*)\(cumulative\)$/.exec(k); if (!m) return;
        var stem = m[1].trim(), wk = Object.keys(t.cols).filter(function (x) { return x.indexOf(stem.split(" (")[0].replace(/ incident$/, "")) === 0 && /\(this week\)$/.test(x); })[0];
        if (!wk) return;
        var cu = num(C(MD.ws, MD.r, t.cols[k])), w = num(C(MD.ws, MD.r, t.cols[wk]));
        if (cu != null && w != null && w > cu) bad.push(A(MD.r, t.cols[wk]) + " (" + stem + ": week " + w + " > cum " + cu + ")");
      });
      if (bad.length) add("error", S, list(bad.map(function (x) { return x.split(" ")[0]; })), "Masterdata · Safety", "md-cum", "This-week value larger than the cumulative: " + bad.map(function (x) { return x.replace(/^\S+ /, ""); }).join("; ") + ".", "The cumulative must include this week.");
      var mpW = num(md(/^total manpower \(this week\)$/)), mhW = num(md(/^total man-hours \(this week\)$/)), mpC = num(md(/^total manpower \(cumulative\)$/)), mhC = num(md(/^total man-hours \(cumulative\)$/)),
        safe = num(md(/^safe man-hours \(since las.? lti\) - \(cumulative\)$/)), lti = num(md(/^lost time incident \(cumulative\)$/));
      if (mpW > 0 && mhW > 0 && mpW === mhW) add("error", S, mdA(/^total manpower \(this week\)$/), "Masterdata · Safety", "md-mp", "Manpower this week (" + money(mpW) + ") equals the man-hours this week — the man-hours were typed in the manpower cell.", "Enter the number of people.");
      if (mhW > 0 && !mpW) add("error", S, mdA(/^total manpower \(this week\)$/), "Masterdata · Safety", "md-mp", "Man-hours this week are " + money(mhW) + " but manpower this week is " + (mpW == null ? "empty" : "0") + ".", "Enter this week's manpower.");
      if (mpW > 0 && mhW != null && mpW !== mhW && mhW / mpW > 84) add("warn", S, mdA(/^total man-hours \(this week\)$/), "Masterdata · Safety", "md-mp", "Man-hours this week (" + money(mhW) + ") ÷ manpower (" + mpW + ") = " + Math.round(mhW / mpW) + " h per person — more than 84 h/week.", "Check the man-hours or the manpower.");
      if (safe != null && mhC != null && safe > mhC + 1) add("error", S, mdA(/^safe man-hours/), "Masterdata · Safety", "md-safe", "Safe man-hours " + money(safe) + " are more than the total man-hours " + money(mhC) + ".", "Safe man-hours since the last LTI cannot exceed the total.");
      if (lti > 0 && safe != null && mhC != null && Math.abs(safe - mhC) < 1) add("warn", S, mdA(/^safe man-hours/), "Masterdata · Safety", "md-safe", "There " + (lti === 1 ? "is 1 LTI" : "are " + lti + " LTIs") + " but safe man-hours still equal the total man-hours.", "Restart the safe man-hours count from the last LTI.");
      if (mhC != null && mhC > 0 && !mpC) add("warn", S, mdA(/^total manpower \(cumulative\)$/), "Masterdata · Safety", "md-mp", "Total manpower (cumulative) is empty or 0 while man-hours are " + money(mhC) + ".", "Fill the manpower.");
      [["ncr", "NCR"], ["sor", "SOR"]].forEach(function (x) {
        var is = num(md(new RegExp("^issued " + x[0] + "$"))), cl = num(md(new RegExp("^closed " + x[0] + "$"))), op = num(md(new RegExp("^open " + x[0] + "$"))), lt = num(md(new RegExp("^close late " + x[0] + "$")));
        if (is != null && cl != null && op != null && Math.abs(is - cl - op) > 0.001) add("error", S, mdA(new RegExp("^open " + x[0] + "$")), "Masterdata · Quality", "md-ncr", "Issued " + x[1] + " " + is + " ≠ Closed " + cl + " + Open " + op + ".", "Correct the " + x[1] + " counts.");
        if (lt != null && cl != null && lt > cl) add("error", S, mdA(new RegExp("^close late " + x[0] + "$")), "Masterdata · Quality", "md-ncr", "Closed late " + x[1] + " (" + lt + ") are more than the closed " + x[1] + " (" + cl + ").", "Correct the counts.");
      });
      var cc = text(md(/^cost code$/)).replace(/^0*/, ""), cd = (code || "").replace(/^0*/, "").replace(/[A-Z]$/, "");
      if (cc && /^\d{3,4}$/.test(cc) && cd && cc !== cd) add("warn", S, mdA(/^cost code$/), "Masterdata", "md-cost", "Cost Code " + text(md(/^cost code$/)) + " is a different project code than " + code + ".", "Check the Cost Code (copied from another project?).");
      MD.vals = { rd: date(C(MD.ws, MD.r, t.col(/^report date$/))), sB: sB, eB: eB, sF: sF, eF: eF, pW: pW, pC: pCm, aW: aW, aC: aCm, cv: cv, rcv: rcv, sub: sub, paid: paid, voA: voA, mhC: mhC, mhW: mhW, mpC: mpC, mpW: mpW,
        po: text(md(/^\(con\) po number$/)), cost: text(md(/^cost code$/)), eff: eff, iss: num(md(/^issued ncr$/)), clo: num(md(/^closed ncr$/)), opn: num(md(/^open ncr$/)),
        poCell: mdA(/^\(con\) po number$/), costCell: mdA(/^cost code$/), effCell: mdA(/^\(con\) contract effective date$/), name: text(md(/^project name$/)) };
    });
    var V = MD.vals || {};

    /* ---------------- S-Curve Data ---------------- */
    var SC = { rows: [] }, scS = sheet(/^s-curve data$/i);
    if (scS) safe(scS.name, function () {
      var ws = scS.ws, t = table(ws), S = scS.name, cD = t.col(/^report date$/), cP = t.col(/^cum plan/), cA = t.col(/^cum actual/), cWP = t.col(/^this week plan/), cWA = t.col(/^this week actual/);
      if (cD < 0) return;
      var rows = t.rows.map(function (r) { return { r: r, d: date(C(ws, r, cD)), p: num(C(ws, r, cP)), a: num(C(ws, r, cA)), wp: cWP >= 0 ? num(C(ws, r, cWP)) : null, wa: cWA >= 0 ? num(C(ws, r, cWA)) : null }; }).filter(function (x) { return x.d; });
      SC.rows = rows;
      var gaps = [], order = [], downP = [], downA = [], over = [], future = [], wkP = [];
      for (var i = 1; i < rows.length; i++) {
        var a = rows[i - 1], b = rows[i], g = days(a.d, b.d);
        if (g <= 0) order.push(A(b.r, cD)); else if (g !== 7) gaps.push(A(b.r, cD) + " (" + g + " days)");
        if (a.p != null && b.p != null && b.p < a.p - 0.0001) downP.push(A(b.r, cP));
        if (a.a != null && b.a != null && b.a < a.a - 0.0001) downA.push(A(b.r, cA));
        if (b.wp != null && a.p != null && b.p != null && Math.abs(b.p - a.p - b.wp) > 0.0015) wkP.push(A(b.r, cWP));
      }
      rows.forEach(function (x) { [[x.p, cP], [x.a, cA]].forEach(function (y) { if (y[0] != null && (y[0] > 1.0001 || y[0] < -0.0001)) over.push(A(x.r, y[1])); }); if (RD && x.d > RD && x.a != null && x.a !== 0) future.push(A(x.r, cA)); });
      if (order.length) add("error", S, list(order), "S-Curve", "sc-order", "Report dates are not in order (a date is equal to or earlier than the row above).", "Sort the rows by date and remove duplicates.");
      if (gaps.length) add("info", S, list(gaps, 4), "S-Curve", "sc-gap", gaps.length + " step" + (gaps.length === 1 ? "" : "s") + " between report dates are not 7 days.", "Keep one row per week.");
      if (downP.length) add("error", S, list(downP), "S-Curve", "sc-down", "Cumulative plan goes down in " + downP.length + " row" + (downP.length === 1 ? "" : "s") + ".", "A cumulative curve cannot decrease.");
      if (downA.length) add("error", S, list(downA), "S-Curve", "sc-down", "Cumulative actual goes down in " + downA.length + " row" + (downA.length === 1 ? "" : "s") + ".", "A cumulative curve cannot decrease.");
      if (over.length) add("error", S, list(over), "S-Curve", "sc-range", "Cumulative % outside 0–100%.", "Enter fractions (1 = 100%).");
      if (future.length) add("error", S, list(future), "S-Curve", "sc-future", "Actual progress entered for dates after the report date " + fmtD(RD) + ".", "Clear the future actuals.");
      if (wkP.length > 2) add("info", S, list(wkP), "S-Curve", "sc-week", "This Week Plan ≠ change of the cumulative plan in " + wkP.length + " rows.", "This Week Plan = Cum Plan − last week's Cum Plan.");
      var cur = rows.filter(function (x) { return RD && x.d <= RD; }).pop();
      if (RD && cur && cur.d !== RD && days(cur.d, RD) > 6) add("warn", S, A(cur.r + 1, cD), "S-Curve", "sc-stale", "The last S-curve row is " + fmtD(cur.d) + " — no row for the report date " + fmtD(RD) + ".", "Add this week's row.");
      if (cur && cur.a == null) add("warn", S, A(cur.r, cA), "S-Curve", "sc-noact", "No cumulative actual for " + fmtD(cur.d) + " (this week).", "Enter this week's actual %.");
      SC.cur = cur;
      if (cur && V.aC != null && cur.a != null && Math.abs(cur.a - V.aC) > 0.0005) add("error", S, A(cur.r, cA), "Cross-sheet", "x-prog", "S-curve actual this week " + pc(cur.a) + " ≠ Masterdata_Reporting actual " + pc(V.aC) + ".", "Use one value in both sheets.");
      if (cur && V.pC != null && cur.p != null && Math.abs(cur.p - V.pC) > 0.0005) add("error", S, A(cur.r, cP), "Cross-sheet", "x-prog", "S-curve plan this week " + pc(cur.p) + " ≠ Masterdata_Reporting plan " + pc(V.pC) + ".", "Use one value in both sheets.");
      var lastP = rows.filter(function (x) { return x.p != null; }).pop();
      if (lastP && lastP.p < 0.999) add("info", S, A(lastP.r, cP), "S-Curve", "sc-end", "The planned curve ends at " + pc(lastP.p) + " (" + fmtD(lastP.d) + "), not 100%.", "Extend the plan to the planned finish.");
      if (lastP && V.eB && lastP.p >= 0.999) { var hit = rows.filter(function (x) { return x.p != null && x.p >= 0.999; })[0]; if (hit && Math.abs(days(hit.d, V.eB)) > 45) add("info", S, A(hit.r, cP), "Cross-sheet", "sc-end", "The planned curve reaches 100% on " + fmtD(hit.d) + " but the baseline end is " + fmtD(V.eB) + ".", "Check the plan curve against the baseline programme."); }
    });

    /* ---------------- 1. Progress Status ---------------- */
    var p1 = sheet(/^1\.\s*progress status/i);
    if (p1) safe(p1.name, function () {
      var ws = p1.ws, S = p1.name;
      var cwP = find(ws, /^calendar week$/, 3), pwP = find(ws, /^project week$/, 3);
      if (cwP && RD) { var cwC = C(ws, cwP.r, cwP.c + 1), m = /(\d{1,2})/.exec(text(cwC)), w = isoWeek(RD);
        if (m && Math.abs(+m[1] - w) >= 1) add("warn", S, A(cwP.r, cwP.c + 1), "Report header", "wk-label", "Calendar week shows “" + text(cwC) + "” but the report date " + fmtD(RD) + " is week " + w + ".", "Pick the right calendar week."); }
      if (pwP && RD && V.sB) { var pwC = C(ws, pwP.r, pwP.c + 1), m2 = /(\d+)/.exec(text(pwC)), exp = Math.floor(days(V.sB, RD) / 7) + 1;
        if (m2 && Math.abs(+m2[1] - exp) > 1) add("warn", S, A(pwP.r, pwP.c + 1), "Report header", "wk-label", "Project week shows “" + text(pwC) + "” but " + fmtD(RD) + " is project week " + exp + " (start " + fmtD(V.sB) + ").", "Pick the right project week."); }
      var fc = find(ws, /^forecast completion date$/, 8);
      if (fc) { var fd = date(C(ws, fc.r, fc.c + 2)) || date(C(ws, fc.r, fc.c + 1)); if (fd && V.eF && fd !== V.eF) add("error", S, A(fc.r, fc.c + 2), "Cross-sheet", "x-fc", "Forecast completion " + fmtD(fd) + " ≠ Masterdata_Reporting " + fmtD(V.eF) + ".", "Use one forecast date."); }
      var tm = find(ws, /^original duration$/, 16);
      if (tm && RD) {
        var od = num(C(ws, tm.r, tm.c + 1)), el = num(C(ws, tm.r + 1, tm.c + 1)), rm = num(C(ws, tm.r + 2, tm.c + 1));
        if (V.sB && el != null && Math.abs(el - days(V.sB, RD)) > 2) add("warn", S, A(tm.r + 1, tm.c + 1), "Time status", "p-time", "Elapsed duration " + el + " days ≠ start " + fmtD(V.sB) + " → report date " + fmtD(RD) + " (" + days(V.sB, RD) + " days).", "Recalculate from the report date.");
        if (od != null && el != null && rm != null && Math.abs(od - el - rm) > 1) add("error", S, A(tm.r + 2, tm.c + 1), "Time status", "p-time", "Remaining " + rm + " ≠ Original " + od + " − Elapsed " + el + ".", "Fix the formula.");
      }
      var ov = find(ws, /^overall progress$/, 25);
      if (ov) {
        var r = ov.r + 1, v = [0, 1, 2, 3, 4, 5, 6, 7].map(function (c) { return num(C(ws, r, ov.c + c)); });
        if (v[5] != null && v[3] != null && v[4] != null && Math.abs(v[4] - v[3] - v[5]) > 0.0006) add("error", S, A(r, ov.c + 5), "Overall progress", "p-var", "Cum. variance " + pc(v[5]) + " ≠ actual " + pc(v[4]) + " − plan " + pc(v[3]) + ".", "Fix the formula.");
        if (v[6] != null && v[0] != null && v[3] != null && Math.abs(v[3] - v[0] - v[6]) > 0.0015) add("error", S, A(r, ov.c + 6), "Overall progress", "p-week", "Weekly plan " + pc(v[6]) + " ≠ this week's cum. plan " + pc(v[3]) + " − last week's " + pc(v[0]) + ".", "Copy last week's values first, then update this week.");
        if (v[7] != null && v[1] != null && v[4] != null && Math.abs(v[4] - v[1] - v[7]) > 0.0015) add("error", S, A(r, ov.c + 7), "Overall progress", "p-week", "Weekly actual " + pc(v[7]) + " ≠ this week's cum. actual " + pc(v[4]) + " − last week's " + pc(v[1]) + ".", "Copy last week's values first, then update this week.");
        if (v[4] != null && v[1] != null && v[4] < v[1] - 0.0001) add("error", S, A(r, ov.c + 4), "Overall progress", "p-down", "Cum. actual went down from " + pc(v[1]) + " to " + pc(v[4]) + ".", "Check this week's actual.");
        if (v[3] != null && V.pC != null && Math.abs(v[3] - V.pC) > 0.0005) add("error", S, A(r, ov.c + 3), "Cross-sheet", "x-prog", "Cum. plan " + pc(v[3]) + " ≠ Masterdata_Reporting " + pc(V.pC) + ".", "Use one value.");
        if (v[4] != null && V.aC != null && Math.abs(v[4] - V.aC) > 0.0005) add("error", S, A(r, ov.c + 4), "Cross-sheet", "x-prog", "Cum. actual " + pc(v[4]) + " ≠ Masterdata_Reporting " + pc(V.aC) + ".", "Use one value.");
        if (SC.rows.length && RD && v[1] != null) { var prev = SC.rows.filter(function (x) { return x.d <= addDays(RD, -7); }).pop(); if (prev && prev.a != null && Math.abs(prev.a - v[1]) > 0.0005) add("info", S, A(r, ov.c + 1), "Cross-sheet", "x-prog", "Last week's cum. actual " + pc(v[1]) + " ≠ S-curve " + fmtD(prev.d) + " " + pc(prev.a) + ".", "Check last week's figure."); }
      }
      var la = find(ws, /^current week actual$/, 30);
      if (la) {
        var dR = la.r + 1, vR = la.r + 2, base0 = num(C(ws, vR, la.c)), d0 = date(C(ws, dR, la.c));
        if (d0 && RD && d0 !== RD) add("warn", S, A(dR, la.c), "Lookahead", "la-date", "Lookahead starts on " + fmtD(d0) + " instead of the report date " + fmtD(RD) + ".", "Update the lookahead dates.");
        var miss = [], lower = [];
        for (var k = 1; k <= 3; k++) { var c = C(ws, vR, la.c + k); if (!c || c.t === "e" || c.v == null || c.v === "") miss.push(A(vR, la.c + k)); else { var n = num(c); if (n != null && base0 != null && n < base0 - 0.0001) lower.push(A(vR, la.c + k)); } }
        if (miss.length) add("warn", S, list(miss), "Lookahead", "la-miss", "3-week lookahead progress missing for " + miss.length + " week" + (miss.length === 1 ? "" : "s") + ".", "Fill the planned cumulative % for the next 3 weeks (S-Curve Data must have rows for those dates).");
        if (lower.length) add("error", S, list(lower), "Lookahead", "la-down", "Lookahead cumulative % lower than this week's actual.", "A cumulative forecast cannot go down.");
      }
      var ms = find(ws, /^1\.5 project milestones/, 40);
      if (ms) {
        var hdr = ms.r + 1, late = [], doneLate = [], rng = [], varBad = [], order2 = [];
        for (var rr = hdr + 2; rr < hdr + 30; rr++) {
          var nm = text(C(ws, rr, ms.c + 1)); if (!nm) { if (!text(C(ws, rr + 1, ms.c + 1))) break; continue; }
          var pS = date(C(ws, rr, ms.c + 2)), pF = date(C(ws, rr, ms.c + 3)), aS = date(C(ws, rr, ms.c + 4)), aF = date(C(ws, rr, ms.c + 5)), pp2 = num(C(ws, rr, ms.c + 6)), ap = num(C(ws, rr, ms.c + 7)), vd = num(C(ws, rr, ms.c + 8));
          if ((pp2 != null && (pp2 > 1.0001 || pp2 < 0)) || (ap != null && (ap > 1.0001 || ap < 0))) rng.push(A(rr, ms.c + 7) + " " + nm);
          if (pS && pF && pF < pS) order2.push(A(rr, ms.c + 3) + " " + nm);
          if (aF && RD && aF < RD && ap != null && ap < 0.9995) late.push(A(rr, ms.c + 5) + " " + nm + " (" + fmtD(aF) + ", " + pc(ap) + ")");
          if (ap != null && ap >= 0.9995 && aF && RD && aF > RD) doneLate.push(A(rr, ms.c + 5) + " " + nm);
          if (vd != null && pF && aF && Math.abs(vd - days(aF, pF)) > 1 && Math.abs(vd + days(aF, pF)) > 1) varBad.push(A(rr, ms.c + 8) + " " + nm + " (" + vd + " vs " + days(aF, pF) + ")");
        }
        if (rng.length) add("error", S, list(rng.map(function (x) { return x.split(" ")[0]; })), "Milestones", "ms-range", "Milestone progress outside 0–100%: " + rng.map(function (x) { return x.replace(/^\S+ /, ""); }).join(", ") + ".", "Enter fractions.");
        if (order2.length) add("error", S, list(order2.map(function (x) { return x.split(" ")[0]; })), "Milestones", "ms-order", "Planned finish before planned start: " + order2.map(function (x) { return x.replace(/^\S+ /, ""); }).join(", ") + ".", "Correct the milestone dates.");
        if (late.length) add("warn", S, list(late.map(function (x) { return x.split(" ")[0]; })), "Milestones", "ms-late", "Forecast finish passed but not complete: " + late.map(function (x) { return x.replace(/^\S+ /, ""); }).join("; ") + ".", "Update the forecast finish from the programme.");
        if (doneLate.length) add("info", S, list(doneLate.map(function (x) { return x.split(" ")[0]; })), "Milestones", "ms-done", "100% complete but the finish date is in the future: " + doneLate.map(function (x) { return x.replace(/^\S+ /, ""); }).join(", ") + ".", "Enter the actual finish date.");
        if (varBad.length) add("error", S, list(varBad.map(function (x) { return x.split(" ")[0]; })), "Milestones", "ms-var", "Variance (days) ≠ planned finish − forecast finish: " + varBad.map(function (x) { return x.replace(/^\S+ /, ""); }).join("; ") + ".", "Fix the formula.");
      }
    });

    /* ---------------- Dashboard ---------------- */
    var dsh = sheet(/^dashboard$/i);
    if (dsh) safe(dsh.name, function () {
      var ws = dsh.ws, S = dsh.name, cw = find(ws, /^calendar week$/, 6);
      if (cw && RD) { for (var dc = 1; dc <= 3; dc++) { var c = C(ws, cw.r, cw.c + dc), m = /(\d{1,2})/.exec(text(c)); if (m) { if (+m[1] !== isoWeek(RD)) add("warn", S, A(cw.r, cw.c + dc), "Report header", "wk-label", "Calendar week shows “" + text(c) + "” but the report date " + fmtD(RD) + " is week " + isoWeek(RD) + ".", "Pick the right calendar week."); break; } } }
      var eot = find(ws, /^app\. eot:?$/, 10, 6);
      if (eot) { var c2 = C(ws, eot.r, eot.c + 1), n2 = num(c2); if (n2 != null && Math.abs(n2) > 1000 && V.voA != null && Math.abs(n2 - V.voA) < 1) add("info", S, A(eot.r, eot.c + 1), "Report header", "d-eot", "“App. EOT” in the cost block shows " + money(n2) + " — that is the Variation Order amount, not an EOT.", "Relabel the cell (Approved VO) or link it to the approved EOT cost."); }
      var cvL = find(ws, /^contract value:?$/, 10);
      if (cvL && V.cv) { for (var k = 1; k <= 3; k++) { var cvC = num(C(ws, cvL.r, cvL.c + k)); if (cvC != null) { if (Math.abs(cvC - V.cv) > 1 && (!V.rcv || Math.abs(cvC - V.rcv) > 1)) add("error", S, A(cvL.r, cvL.c + k), "Cross-sheet", "x-cv", "Contract value " + money(cvC) + " ≠ Masterdata_Reporting " + money(V.cv) + ".", "Use one contract value."); break; } } }
    });

    /* ---------------- 2. Safety Status ---------------- */
    var sf = sheet(/^2\.\s*safety status/i);
    if (sf) safe(sf.name, function () {
      var ws = sf.ws, S = sf.name, top = find(ws, /^2\.1a/, 6), dash = find(ws, /^2\.2 /, 40);
      if (!top) return;
      var bad = [], mism = [], end = dash ? dash.r : top.r + 18;
      // left block: label A, week B, cum C | right: label D, week E, cum F ; last week: label H cum I | label J cum K
      for (var r = top.r + 2; r < end; r++) {
        [[0, 1, 2, 7, 8], [3, 4, 5, 9, 10]].forEach(function (g) {
          var lab = text(C(ws, r, g[0])); if (!lab || /^(recordable|other cases|safety performance|highlights|others)/i.test(lab)) return;
          var w = num(C(ws, r, g[1])), cu = num(C(ws, r, g[2])), lw = num(C(ws, r, g[4])), labLw = text(C(ws, r, g[3]));
          if (cu == null || lw == null || norm(labLw) !== norm(lab)) return;
          var expd = lw + (w || 0);
          if (Math.abs(cu - expd) > 0.5) bad.push({ cell: A(r, g[2]), msg: lab + ": cum " + money(cu) + " ≠ last week " + money(lw) + " + this week " + money(w || 0) });
        });
      }
      if (bad.length) add("error", S, list(bad.map(function (x) { return x.cell; })), "Safety statistics", "s-cum", "Cumulative ≠ last week + this week: " + bad.map(function (x) { return x.msg; }).join("; ") + ".", "Copy this week's cum. to the last-week columns first, then add this week's numbers.");
      if (dash) {
        for (var i = 0; i < 16; i++) {
          [[0, 1, 2], [3, 4, 5]].forEach(function (g) {
            var lab = text(C(ws, top.r + 2 + i, g[0])); if (!lab) return;
            var r2 = dash.r + 1 + i; if (norm(text(C(ws, r2, g[0]))) !== norm(lab)) return;
            [1, 2].forEach(function (o) { var a = num(C(ws, top.r + 2 + i, g[o])), b = num(C(ws, r2, g[o])); if (a != null && b != null && Math.abs(a - b) > 0.5) mism.push({ cell: A(r2, g[o]), msg: lab + " " + (o === 1 ? "week" : "cum") + " " + money(b) + " vs " + money(a) }); });
          });
        }
        if (mism.length) add("error", S, list(mism.map(function (x) { return x.cell; })), "Safety statistics", "s-dash", "Table 2.2 (for the dashboard) ≠ table 2.1a: " + mism.map(function (x) { return x.msg; }).join("; ") + ".", "Table 2.2 must repeat table 2.1a.");
      }
      var mh = find(ws, /^total man-hours/, 20), mp = find(ws, /^total manpower/, 20), sm = find(ws, /^safe man-hours/, 20);
      if (mh && V.mhC != null) { var c = num(C(ws, mh.r, mh.c + 2)); if (c != null && Math.abs(c - V.mhC) > 1) add("error", S, A(mh.r, mh.c + 2), "Cross-sheet", "x-mh", "Total man-hours (cum.) " + money(c) + " ≠ Masterdata_Reporting " + money(V.mhC) + ".", "Use one value."); }
      if (mp && mh) { var wMp = num(C(ws, mp.r, mp.c + 1)), wMh = num(C(ws, mh.r, mh.c + 1)); if (wMh > 0 && !wMp) add("error", S, A(mp.r, mp.c + 1), "Safety statistics", "s-mp", "Man-hours this week " + money(wMh) + " but manpower this week " + (wMp == null ? "empty" : "0") + ".", "Enter this week's manpower."); }
      if (sm) { var sv = C(ws, sm.r, sm.c + 2); if (!sv || sv.v == null || sv.v === "") add("warn", S, A(sm.r, sm.c + 2), "Safety statistics", "s-safe", "Safe man-hours since the last LTI (cum.) is empty.", "Fill it (it feeds the dashboard)."); }
    });

    /* ---------------- 4. Deliverable Status ---------------- */
    var dl = sheet(/^4\.\s*deliverable status/i);
    if (dl) safe(dl.name, function () {
      var ws = dl.ws, S = dl.name, cur = find(ws, /^4\.1 /, 6), last = find(ws, /^4\.2 /, 20);
      if (!cur) return;
      function block(start, stop) {
        var o = {}; for (var r = start + 2; r < stop; r++) { var lab = text(C(ws, r, cur.c)); if (!lab || /^column|^project deliverables|^4\.2/i.test(lab)) continue; o[norm(lab)] = { r: r, lab: lab, pl: num(C(ws, r, cur.c + 1)), wk: num(C(ws, r, cur.c + 2)), act: num(C(ws, r, cur.c + 3)), ap: num(C(ws, r, cur.c + 4)), rj: num(C(ws, r, cur.c + 5)), ur: num(C(ws, r, cur.c + 6)) }; }
        return o;
      }
      var B = block(cur.r, last ? last.r - 1 : cur.r + 12), L = last ? block(last.r - 1, last.r + 14) : {};
      var sum = [], step = [], over = [];
      Object.keys(B).forEach(function (k) {
        var x = B[k], tot = (x.ap || 0) + (x.rj || 0) + (x.ur || 0);
        if (x.act != null && Math.abs(tot - x.act) > 0.5) sum.push({ cell: A(x.r, cur.c + 3), msg: x.lab + ": approved " + (x.ap || 0) + " + rejected " + (x.rj || 0) + " + U/R " + (x.ur || 0) + " = " + tot + " vs submitted " + x.act });
        var l = L[k]; if (l && l.act != null && x.act != null && Math.abs(x.act - l.act - (x.wk || 0)) > 0.5) step.push({ cell: A(x.r, cur.c + 2), msg: x.lab + ": " + l.act + " last week + " + (x.wk || 0) + " this week ≠ " + x.act });
        if (l && l.act != null && x.act != null && x.act < l.act) step.push({ cell: A(x.r, cur.c + 3), msg: x.lab + ": submitted went down " + l.act + " → " + x.act });
        if (x.pl != null && x.act != null && x.act > x.pl) over.push({ cell: A(x.r, cur.c + 1), msg: x.lab + " (" + x.act + " submitted vs " + x.pl + " planned)" });
      });
      if (sum.length) add("error", S, list(sum.map(function (x) { return x.cell; })), "Deliverables", "dl-sum", "Approved + Rejected + Under Review ≠ Total submitted: " + sum.map(function (x) { return x.msg; }).join("; ") + ".", "Correct the counts.");
      if (step.length) add("error", S, list(step.map(function (x) { return x.cell; })), "Deliverables", "dl-step", "Submitted this week doesn't match the change from last week: " + step.map(function (x) { return x.msg; }).join("; ") + ".", "Copy last week's table first, then update this week.");
      if (over.length) add("info", S, list(over.map(function (x) { return x.cell; })), "Deliverables", "dl-plan", "More submitted than planned: " + over.map(function (x) { return x.msg; }).join("; ") + ".", "Update the planned cumulative.");
    });

    /* ---------------- 5. NCR Status ---------------- */
    var nc = sheet(/^5\.\s*ncr/i);
    if (nc) safe(nc.name, function () {
      var ws = nc.ws, S = nc.name, iss = find(ws, /^issued$/, 12), clo = find(ws, /^closed$/, 12), opn = find(ws, /^open$/, 12), lat = find(ws, /^closed late$/, 14);
      var I = iss ? num(C(ws, iss.r, iss.c + 1)) : null, Cl = clo ? num(C(ws, clo.r, clo.c + 1)) : null, O = opn ? num(C(ws, opn.r, opn.c + 1)) : null, L = lat ? num(C(ws, lat.r, lat.c + 1)) : null;
      if (I != null && Cl != null && O != null && Math.abs(I - Cl - O) > 0.001) add("error", S, A(opn.r, opn.c + 1), "NCR", "ncr-sum", "Issued " + I + " ≠ Closed " + Cl + " + Open " + O + ".", "Correct the NCR counts.");
      if (L != null && Cl != null && L > Cl) add("error", S, A(lat.r, lat.c + 1), "NCR", "ncr-sum", "Closed late (" + L + ") is more than Closed (" + Cl + ").", "Correct the count.");
      if (I != null && V.iss != null && I !== V.iss) add("error", S, A(iss.r, iss.c + 1), "Cross-sheet", "x-ncr", "Issued NCR " + I + " ≠ Masterdata_Reporting " + V.iss + ".", "Use one value.");
    });

    /* ---------------- 6. IPC Status ---------------- */
    var ip = sheet(/^6\.\s*ipc/i);
    if (ip) safe(ip.name, function () {
      var ws = ip.ws, S = ip.name;
      function row(re) { var p = find(ws, re, 16); return p ? { r: p.r, c: p.c, no: num(C(ws, p.r, p.c + 1)), sum: num(C(ws, p.r, p.c + 2)), pct: num(C(ws, p.r, p.c + 3)) } : null; }
      var tcv = row(/^total contract value$/), cv = row(/^contract value$/), sb = row(/^submitted$/), pd = row(/^paid$/), vo = row(/^variation order$/);
      if (sb && pd && sb.sum != null && pd.sum != null && pd.sum > sb.sum + 1) add("error", S, A(pd.r, pd.c + 2), "IPC", "ipc-pay", "Paid " + money(pd.sum) + " is more than Submitted " + money(sb.sum) + ".", "Check the IPC amounts.");
      if (sb && pd && sb.no != null && pd.no != null && pd.no > sb.no) add("error", S, A(pd.r, pd.c + 1), "IPC", "ipc-pay", "Paid IPC No. " + pd.no + " higher than submitted IPC No. " + sb.no + ".", "Check the IPC numbers.");
      var tot = tcv && tcv.sum || (cv && cv.sum);
      [[sb, "Submitted"], [pd, "Paid"]].forEach(function (x) {
        if (!x[0] || x[0].sum == null || !tot) return;
        if (x[0].sum > tot * 1.0001) add("error", S, A(x[0].r, x[0].c + 2), "IPC", "ipc-pay", x[1] + " " + money(x[0].sum) + " is more than the total contract value " + money(tot) + ".", "Check the amounts.");
        if (x[0].pct != null) { var e1 = x[0].sum / tot, e2 = cv && cv.sum ? x[0].sum / cv.sum : e1; if (Math.abs(x[0].pct - e1) > 0.005 && Math.abs(x[0].pct - e2) > 0.005) add("error", S, A(x[0].r, x[0].c + 3), "IPC", "ipc-pct", x[1] + " % is " + pc(x[0].pct) + " but " + x[1].toLowerCase() + " ÷ contract value = " + pc(e1) + ".", "Fix the formula."); }
      });
      if (tcv && cv && vo && tcv.sum != null && cv.sum != null && vo.sum != null && Math.abs(cv.sum + vo.sum - tcv.sum) > 1) add("info", S, A(tcv.r, tcv.c + 2), "IPC", "ipc-vo", "Total contract value " + money(tcv.sum) + " ≠ contract value " + money(cv.sum) + " + VO " + money(vo.sum) + ".", "Check the values.");
      if (vo && vo.sum && !vo.no) add("warn", S, A(vo.r, vo.c + 1), "IPC", "ipc-vo", "Variation Order amount " + money(vo.sum) + " has no VO number.", "Enter the VO number.");
      [[sb, V.sub, "Submitted"], [pd, V.paid, "Paid"]].forEach(function (x) { if (x[0] && x[0].sum != null && x[1] != null && Math.abs(x[0].sum - x[1]) > 1) add("error", S, A(x[0].r, x[0].c + 2), "Cross-sheet", "x-ipc", x[2] + " " + money(x[0].sum) + " ≠ Masterdata_Reporting " + money(x[1]) + ".", "Use one value."); });
      var gd = find(ws, /^6\.2 |^table 6\.2/, 20);
      if (gd) {
        var bad = [];
        [[/^total contract value$/, tcv], [/^ipc submitted$/, sb], [/^ipc paid$/, pd], [/^variation order$/, vo]].forEach(function (x) {
          var p = find(ws, x[0], gd.r + 8, gd.r + 1); if (!p || !x[1] || x[1].sum == null) return;
          var g = num(C(ws, p.r, p.c + 1)); if (g != null && Math.abs(g * 1e6 - x[1].sum) > 5e4 && Math.abs(g - x[1].sum) > 1) bad.push(A(p.r, p.c + 1));
        });
        if (bad.length) add("error", S, list(bad), "IPC", "ipc-graph", "Graph data (table 6.2) doesn't match table 6.1.", "Link table 6.2 to table 6.1 (values in million SAR).");
      }
    });

    /* ---------------- 7. Manpower / 8. Equipment (6-week window) ---------------- */
    [[/^7\.\s*manpower/i, "Manpower"], [/^8\.\s*equipment/i, "Equipment"]].forEach(function (z) {
      var s0 = sheet(z[0]); if (!s0) return;
      safe(s0.name, function () {
        var ws = s0.ws, S = s0.name, we = find(ws, /^weekendings$/, 40); if (!we) return;
        var dts = [], fut = [], miss = [], zero = [];
        for (var c = we.c + 1; c <= we.c + 8; c++) { var d = date(C(ws, we.r, c)); if (d) dts.push({ c: c, d: d }); }
        if (!dts.length) return;
        var lastD = dts[dts.length - 1].d;
        if (RD && days(lastD, RD) >= 7) add("warn", S, A(we.r, dts[dts.length - 1].c), z[1], "w-window", "The 6-week window ends on " + fmtD(lastD) + " — the week of the report date " + fmtD(RD) + " is missing.", "Move the window one week forward and fill this week.");
        for (var i = 1; i < dts.length; i++) if (days(dts[i - 1].d, dts[i].d) !== 7) { add("warn", S, A(we.r, dts[i].c), z[1], "w-window", "Week-ending dates are not 7 days apart (" + fmtD(dts[i - 1].d) + " → " + fmtD(dts[i].d) + ").", "Correct the dates."); break; }
        dts.forEach(function (x) {
          var pl = C(ws, we.r + 1, x.c), ac = C(ws, we.r + 2, x.c);
          if (RD && x.d > addDays(RD, 6) && ac && ac.v != null && ac.v !== "" && num(ac) !== 0) fut.push(A(we.r + 2, x.c));
          if (RD && x.d <= addDays(RD, 6) && (!ac || ac.v == null || ac.v === "")) miss.push(A(we.r + 2, x.c));
          if (!pl || pl.v == null || pl.v === "") miss.push(A(we.r + 1, x.c));
          if (num(ac) === 0 && num(pl) > 0 && x.d <= RD) zero.push(A(we.r + 2, x.c));
        });
        if (fut.length) add("error", S, list(fut), z[1], "w-future", "Actual entered for weeks after the report date.", "Clear future actuals.");
        if (miss.length) add("warn", S, list(miss), z[1], "w-miss", "Planned / actual weekly values missing.", "Fill the planned weekly (from the baseline) and the actual weekly values.");
        if (zero.length) add("info", S, list(zero), z[1], "w-zero", "Actual is 0 in a week with planned " + z[1].toLowerCase() + ".", "Confirm the site was idle, or enter the actual.");
        if (z[1] === "Manpower" && V.mpW != null && RD) { var cur = dts.filter(function (x) { return x.d <= addDays(RD, 6) && x.d > addDays(RD, -1); })[0]; if (cur) { var a = num(C(ws, we.r + 2, cur.c)); if (a != null && V.mpW != null && Math.abs(a - V.mpW) > 0.5 && V.mpW > 0 && V.mpW !== V.mhW) add("info", S, A(we.r + 2, cur.c), "Cross-sheet", "x-mp", "Actual manpower this week " + a + " ≠ Masterdata_Reporting manpower this week " + V.mpW + ".", "Use one value."); } }
      });
    });

    /* ---------------- 9. Cashflow (6-month window) ---------------- */
    var cf = sheet(/^9\.\s*cashflow/i);
    if (cf) safe(cf.name, function () {
      var ws = cf.ws, S = cf.name, mo = find(ws, /^months$/, 40); if (!mo) return;
      var cols = [], txt = [];
      for (var c = mo.c + 1; c <= mo.c + 8; c++) {
        var h = C(ws, mo.r, c); if (!h || h.v == null || h.v === "") continue;
        var d = date(h), lab = text(h), mi = MON.indexOf(lab.slice(0, 3).toLowerCase());
        if (!d && mi >= 0) { txt.push(A(mo.r, c)); var yPrev = cols.length ? +cols[cols.length - 1].m.slice(0, 4) : +(RD || "2026").slice(0, 4), mPrev = cols.length ? +cols[cols.length - 1].m.slice(5, 7) : 0; d = isoOf(mi + 1 < mPrev ? yPrev + 1 : yPrev, mi + 1, 1); }
        if (d) cols.push({ c: c, m: d.slice(0, 7) });
      }
      if (txt.length) add("info", S, list(txt), "Cashflow", "cf-head", "Month header typed as text (“" + text(C(ws, mo.r, dec(txt[0]).c)) + "”) while the other months are dates.", "Enter all months as dates.");
      if (!cols.length) return;
      if (RD && cols[cols.length - 1].m < RD.slice(0, 7)) add("warn", S, A(mo.r, cols[cols.length - 1].c), "Cashflow", "cf-window", "The 6-month window ends in " + cols[cols.length - 1].m + " — the report month " + RD.slice(0, 7) + " is missing.", "Move the window forward.");
      var badP = [], badA = [], fut = [], down = [];
      for (var i = 0; i < cols.length; i++) {
        var x = cols[i], pl = num(C(ws, mo.r + 1, x.c)), ac = num(C(ws, mo.r + 2, x.c)), cp = num(C(ws, mo.r + 3, x.c)), ca = num(C(ws, mo.r + 4, x.c));
        if (i > 0) {
          var pcp = num(C(ws, mo.r + 3, cols[i - 1].c)), pca = num(C(ws, mo.r + 4, cols[i - 1].c));
          if (cp != null && pcp != null && pl != null && Math.abs(cp - pcp - pl) > Math.max(1, Math.abs(cp) * 0.0001)) badP.push(A(mo.r + 3, x.c));
          if (ca != null && pca != null && ac != null && Math.abs(ca - pca - ac) > Math.max(1, Math.abs(ca) * 0.0001)) badA.push(A(mo.r + 4, x.c));
          if (ca != null && pca != null && ca < pca) down.push(A(mo.r + 4, x.c));
        }
        if (RD && x.m > RD.slice(0, 7) && ac) fut.push(A(mo.r + 2, x.c));
      }
      if (badP.length) add("error", S, list(badP), "Cashflow", "cf-cum", "Cum. plan ≠ last month's cum. + this month's plan.", "Fix the cumulative row.");
      if (badA.length) add("error", S, list(badA), "Cashflow", "cf-cum", "Cum. actual ≠ last month's cum. + this month's actual.", "Fix the cumulative row.");
      if (down.length) add("error", S, list(down), "Cashflow", "cf-cum", "Cum. actual goes down.", "A cumulative cannot decrease.");
      if (fut.length) add("error", S, list(fut), "Cashflow", "cf-future", "Actual entered for months after the report month.", "Clear future actuals.");
      var last = cols[cols.length - 1], lca = num(C(ws, mo.r + 4, last.c)), lcp = num(C(ws, mo.r + 3, last.c)), base = V.rcv || V.cv;
      if (base && lca != null && lca > base * 1.0001) add("error", S, A(mo.r + 4, last.c), "Cashflow", "cf-cv", "Cum. actual " + money(lca) + " is more than the contract value " + money(base) + ".", "Check the cashflow.");
      if (base && lcp != null && lcp > base * 1.0001) add("error", S, A(mo.r + 3, last.c), "Cashflow", "cf-cv", "Cum. plan " + money(lcp) + " is more than the contract value " + money(base) + ".", "Check the cashflow plan.");
      if (V.sub != null && lca != null && lca > V.sub * 1.05 && lca - V.sub > 1e5) add("info", S, A(mo.r + 4, last.c), "Cross-sheet", "x-cf", "Cum. actual cashflow " + money(lca) + " is above the IPC submitted " + money(V.sub) + " (Masterdata_Reporting).", "Cashflow actual should follow the certified / submitted amounts — check which is right.");
    });

    /* ---------------- 10-13. Data Input (achievements, concerns, lookahead, risks) ---------------- */
    var di = sheet(/data input/i);
    if (di) safe(di.name, function () {
      var ws = di.ws, S = di.name, rg = range(ws);
      function tbl(re) {
        var p = find(ws, re, 80); if (!p) return null;
        var h = p.r + 1; while (h < p.r + 4 && !/sr\.? ?no/i.test(text(C(ws, h, p.c)))) h++;
        var heads = {}; for (var c = p.c; c <= Math.min(rg.e.c, p.c + 9); c++) { var t = norm(text(C(ws, h, c))); if (t) heads[t] = c; }
        var rows = []; for (var r = h + 1; r <= rg.e.r; r++) { var first = text(C(ws, r, p.c)); if (/^table |^column /i.test(first) || /^table /i.test(text(C(ws, r, p.c + 1)))) break; if (!first && !text(C(ws, r, p.c + 1))) { if (!text(C(ws, r + 1, p.c))) break; continue; } rows.push(r); }
        return { p: p, h: h, heads: heads, rows: rows, col: function (re2) { for (var k in heads) if (re2.test(k)) return heads[k]; return -1; } };
      }
      var ach = tbl(/^table 10\.1/), la = tbl(/^table 11\.1/), con = tbl(/^table 12\.1/), rk = tbl(/^table 13\.1/);
      function filled(t, re) { var c = t.col(re); return c < 0 ? [] : t.rows.filter(function (r) { return text(C(ws, r, c)); }); }
      if (ach) { var a = filled(ach, /work desc/); if (!a.length) add("warn", S, A(ach.h + 1, ach.p.c + 1), "Achievements", "di-ach", "No weekly achievements entered.", "Enter this week's achievements (table 10.1)."); else if (a.length < 2) add("info", S, A(a[0], ach.p.c + 1), "Achievements", "di-ach", "Only one achievement this week.", "Check that all the week's progress is listed."); }
      if (la) { var l = filled(la, /lookahead|activit/); if (!l.length) add("warn", S, A(la.h + 1, la.p.c + 1), "Lookahead", "di-la", "No lookahead activities entered.", "Enter next week's activities (table 11.1)."); }
      if (con) {
        var cD = con.col(/concern|issue/), cM = con.col(/mitigation/), cR = con.col(/date raised/), cRe = con.col(/responsible/), cT = con.col(/target/), cS = con.col(/status/);
        var over = [], noStat = [], badD = [], noMit = [], noTgt = [], fut = [], sr = {}, dupSr = [];
        con.rows.forEach(function (r) {
          var desc = text(C(ws, r, cD)); var s = text(C(ws, r, con.p.c)); if (s) { if (sr[s] && desc) dupSr.push(A(r, con.p.c)); if (desc) sr[s] = 1; }
          if (!desc) return;
          var st = text(C(ws, r, cS)), rd = date(C(ws, r, cR)), td = date(C(ws, r, cT)), closed = /clos|resolv|solved|complet|done|cancel/i.test(st);
          if (!st) noStat.push(A(r, cS));
          if (!closed && td && RD && td < RD) over.push({ cell: A(r, cT), m: "“" + clip(desc, 50) + "” (target " + fmtD(td) + ", " + (st || "no status") + ")" });
          if (rd && td && td < rd) badD.push(A(r, cT));
          if (rd && RD && rd > RD) fut.push(A(r, cR));
          if (!closed && cM >= 0 && !text(C(ws, r, cM))) noMit.push(A(r, cM));
          if (!closed && cT >= 0 && !td) noTgt.push(A(r, cT));
        });
        if (over.length) add("warn", S, list(over.map(function (x) { return x.cell; })), "Area of concern", "di-over", over.length + " open concern" + (over.length === 1 ? "" : "s") + " past the target date: " + over.slice(0, 4).map(function (x) { return x.m; }).join("; ") + (over.length > 4 ? " …" : "") + ".", "Close them or set a new target date with the reason.");
        if (noStat.length) add("warn", S, list(noStat), "Area of concern", "di-stat", "Concerns with no status.", "Enter Open / Ongoing / Closed.");
        if (badD.length) add("error", S, list(badD), "Area of concern", "di-date", "Target date before the date raised.", "Correct the dates.");
        if (fut.length) add("error", S, list(fut), "Area of concern", "di-date", "Date raised is after the report date.", "Correct the date.");
        if (noMit.length) add("warn", S, list(noMit), "Area of concern", "di-mit", "Open concerns with no mitigation action.", "Enter the mitigation.");
        if (noTgt.length) add("warn", S, list(noTgt), "Area of concern", "di-tgt", "Open concerns with no target date.", "Enter a target date.");
        if (dupSr.length) add("info", S, list(dupSr), "Area of concern", "di-sr", "Repeated serial numbers.", "Renumber the rows.");
      }
      if (rk) {
        var cR2 = rk.col(/^risk$/), cDs = rk.col(/impact desc/), cI = rk.col(/^impact$/), cP = rk.col(/probab/), cK = rk.col(/rank/), cO = rk.col(/owner/), cMi = rk.col(/mitig/);
        var mixed = { n: 0, w: 0 }, noOwn = [], noMi = [], rankBad = [], cat = [];
        rk.rows.forEach(function (r) {
          if (!text(C(ws, r, cR2))) return;
          var iv = C(ws, r, cI), pv = C(ws, r, cP);
          [iv, pv].forEach(function (x) { if (x && x.v != null && x.v !== "") { if (typeof x.v === "number") mixed.n++; else mixed.w++; } });
          if (cO >= 0 && !text(C(ws, r, cO))) noOwn.push(A(r, cO));
          if (cMi >= 0 && !text(C(ws, r, cMi))) noMi.push(A(r, cMi));
          if (cDs >= 0 && /^(schedule|cost|quality|safety|scope|time)$/i.test(text(C(ws, r, cDs)))) cat.push(A(r, cDs));
          var lv = { low: 1, medium: 2, high: 3 }, I = typeof (iv && iv.v) === "number" ? (iv.v >= 4 ? 3 : iv.v >= 3 ? 2 : 1) : lv[norm(text(iv))], P = typeof (pv && pv.v) === "number" ? (pv.v >= 4 ? 3 : pv.v >= 3 ? 2 : 1) : lv[norm(text(pv))], K = lv[norm(text(C(ws, r, cK)))];
          if (I && P && K) { var sc = I * P, exp = sc >= 6 ? 3 : sc >= 3 ? 2 : 1; if (Math.abs(exp - K) >= 2) rankBad.push(A(r, cK)); }
        });
        if (mixed.n && mixed.w) add("info", S, A(rk.h, cI) + ":" + A(rk.h, cP), "Risk register", "rk-scale", "Impact / probability use two scales (numbers 1–5 and High/Medium/Low) in the same table.", "Use one scale for all risks.");
        if (cat.length) add("info", S, list(cat), "Risk register", "rk-desc", "“Impact Description” holds only a category (e.g. “Schedule”) instead of a description.", "Describe the impact.");
        if (noOwn.length) add("warn", S, list(noOwn), "Risk register", "rk-owner", "Risks with no owner.", "Name an owner.");
        if (noMi.length) add("warn", S, list(noMi), "Risk register", "rk-mit", "Risks with no mitigation.", "Enter the mitigation.");
        if (rankBad.length) add("info", S, list(rankBad), "Risk register", "rk-rank", "Risk ranking doesn't match impact × probability.", "Check the ranking.");
      }
      // Data Input vs Masterdata copies (achievement / concern counts)
    });

    /* ---------------- Construction Activity Progress ---------------- */
    var ca = sheet(/^construction activity progress$/i);
    if (ca) safe(ca.name, function () {
      var ws = ca.ws, S = ca.name, t = table(ws), cN = t.col(/activity name/), cPS = t.col(/^plan start$/), cAS = t.col(/^actual start/), cPF = t.col(/^plan finish$/), cAF = t.col(/^actual finish/), cPP = t.col(/^planned progress/), cAP = t.col(/^actual progress/), cSPI = t.col(/^spi$/), cCode = t.col(/^project code$/);
      if (cN < 0) return;
      var rng = [], aNoDone = [], doneNoA = [], late = [], plan = [], spiBad = [], codeBad = [], startAfter = [];
      t.rows.forEach(function (r) {
        var nm = text(C(ws, r, cN)); if (!nm) return;
        var pp = num(C(ws, r, cPP)), ap = num(C(ws, r, cAP)), pf = date(C(ws, r, cPF)), afC = C(ws, r, cAF), af = date(afC), asC = C(ws, r, cAS), sp = cSPI >= 0 ? num(C(ws, r, cSPI)) : null;
        if ((pp != null && (pp < 0 || pp > 1.0001)) || (ap != null && (ap < 0 || ap > 1.0001))) rng.push(A(r, cAP));
        if (isActualMark(afC) && ap != null && ap < 0.9995) aNoDone.push(A(r, cAF));
        if (ap != null && ap >= 0.9995 && af && RD && af > RD) doneNoA.push(A(r, cAF));
        if (af && RD && af < RD && !isActualMark(afC) && ap != null && ap < 0.9995) late.push(A(r, cAF));
        if (pf && RD && pf <= RD && pp != null && pp < 0.9995 && !isActualMark(C(ws, r, cPF))) plan.push(A(r, cPP));
        if (sp != null && pp && ap != null && Math.abs(sp - ap / pp) > 0.02) spiBad.push(A(r, cSPI));
        if (cCode >= 0 && code && text(C(ws, r, cCode)) && text(C(ws, r, cCode)).toUpperCase().replace(/[A-Z]$/, "") !== code.replace(/[A-Z]$/, "")) codeBad.push(A(r, cCode));
        if (!isActualMark(asC) && date(asC) && RD && date(asC) < RD && (ap == null || ap === 0) && cAS >= 0) startAfter.push(A(r, cAS));
      });
      var n = t.rows.length;
      if (rng.length) add("error", S, list(rng), "Activities", "ca-range", rng.length + " activit" + (rng.length === 1 ? "y has" : "ies have") + " progress outside 0–100%.", "Enter fractions.");
      if (aNoDone.length) add("error", S, list(aNoDone), "Activities", "ca-afin", aNoDone.length + " activit" + (aNoDone.length === 1 ? "y is" : "ies are") + " marked finished (“A”) but actual progress is below 100%.", "Either the finish is not actual or the progress must be 100%.");
      if (doneNoA.length) add("info", S, list(doneNoA), "Activities", "ca-done", doneNoA.length + " activit" + (doneNoA.length === 1 ? "y is" : "ies are") + " 100% with a finish date in the future.", "Enter the actual finish date.");
      if (late.length) add("warn", S, list(late), "Activities", "ca-late", late.length + " of " + n + " activities have a forecast finish before the report date but are not complete.", "Update the forecast finish dates (re-export from Primavera).");
      if (plan.length) add("info", S, list(plan), "Activities", "ca-plan", plan.length + " activities are past their planned finish with a planned progress below 100%.", "Planned % should be 100% once the planned finish has passed.");
      if (spiBad.length) add("info", S, list(spiBad), "Activities", "ca-spi", spiBad.length + " activities: SPI ≠ actual % ÷ planned %.", "Check the SPI column.");
      if (codeBad.length) add("error", S, list(codeBad), "Activities", "ca-code", codeBad.length + " rows have another project's code.", "Correct the Project Code.");
      if (startAfter.length) add("info", S, list(startAfter), "Activities", "ca-start", startAfter.length + " activities have a forecast start already passed but 0% progress.", "Update the start forecast.");
    });

    /* ---------------- H&S Observation ---------------- */
    var hs = sheet(/^h&s observation$/i);
    if (hs) safe(hs.name, function () {
      var ws = hs.ws, S = hs.name, t = table(ws), cO = t.col(/^observation$/), cD = t.col(/^date$/), cT = t.col(/^target date$/), cS = t.col(/^status$/), cR = t.col(/^resolved$/), cCl = t.col(/^closure date$/), cA = t.col(/^corrective action$/), cL = t.col(/priority/);
      var rows = t.rows.filter(function (r) { return text(C(ws, r, cO)); });
      if (!rows.length) { add("info", S, "A2", "H&S", "hs-none", "No H&S observations recorded.", "Confirm that no site observations were raised."); return; }
      var open = [], fut = [], closeNoDate = [], noAct = [], highOpen = [];
      rows.forEach(function (r) {
        var st = text(C(ws, r, cS)) + " " + text(C(ws, r, cR)), closed = /clos|resolv|^ ?yes/i.test(st) || /^yes/i.test(text(C(ws, r, cR))), td = date(C(ws, r, cT)), od = date(C(ws, r, cD));
        if (!closed && td && RD && td < RD) open.push(A(r, cT));
        if (!closed && /high|critical/i.test(text(C(ws, r, cL)))) highOpen.push(A(r, cL));
        if (od && RD && od > RD) fut.push(A(r, cD));
        if (closed && cCl >= 0 && !date(C(ws, r, cCl))) closeNoDate.push(A(r, cCl));
        if (cA >= 0 && !text(C(ws, r, cA))) noAct.push(A(r, cA));
      });
      if (open.length) add("warn", S, list(open), "H&S", "hs-open", open.length + " open observation" + (open.length === 1 ? "" : "s") + " past the target date.", "Close them with evidence or set a new target.");
      if (highOpen.length) add("warn", S, list(highOpen), "H&S", "hs-high", highOpen.length + " high-risk observation" + (highOpen.length === 1 ? " is" : "s are") + " still open.", "Escalate and close.");
      if (fut.length) add("error", S, list(fut), "H&S", "hs-date", "Observation date after the report date.", "Correct the date.");
      if (closeNoDate.length) add("info", S, list(closeNoDate), "H&S", "hs-close", "Closed observations without a closure date.", "Enter the closure date.");
      if (noAct.length) add("warn", S, list(noAct), "H&S", "hs-act", "Observations without a corrective action.", "Enter the corrective action.");
    });

    /* ---------------- Key Items Deliverables ---------------- */
    var ki = sheet(/^key items deliverables$/i);
    if (ki) safe(ki.name, function () {
      var ws = ki.ws, S = ki.name, t = table(ws), cI = t.col(/key item/), cD = t.col(/delivery date/), cS = t.col(/^status$/);
      var rows = t.rows.filter(function (r) { return text(C(ws, r, cI)); }), late = [], fut = [], noS = [], noD = [];
      rows.forEach(function (r) {
        var st = text(C(ws, r, cS)), d = date(C(ws, r, cD)), done = /deliver|receiv|complet|install/i.test(st) && !/not|pending|partial/i.test(st);
        if (!st) noS.push(A(r, cS));
        if (!d) noD.push(A(r, cD));
        if (!done && d && RD && d < RD) late.push(A(r, cD));
        if (done && d && RD && d > RD) fut.push(A(r, cD));
      });
      if (late.length) add("warn", S, list(late), "Key items", "ki-late", late.length + " key item" + (late.length === 1 ? "" : "s") + " not delivered and past the delivery date.", "Update the delivery date or the status.");
      if (fut.length) add("error", S, list(fut), "Key items", "ki-fut", "Items marked delivered with a delivery date after the report date.", "Correct the date or the status.");
      if (noS.length) add("warn", S, list(noS), "Key items", "ki-stat", "Key items with no status.", "Enter the status.");
      if (noD.length) add("warn", S, list(noD), "Key items", "ki-date", "Key items with no delivery date.", "Enter the date.");
    });

    /* ---------------- Risk (register sheet) ---------------- */
    var rs = sheet(/^risk$/i);
    if (rs) safe(rs.name, function () {
      var ws = rs.ws, S = rs.name, t = table(ws), cR = t.col(/^risk$/), cO = t.col(/^owner$/), cM = t.col(/^mitigation$/), cD = t.col(/^date raised$/), cS = t.col(/^status$/);
      var rows = t.rows.filter(function (r) { return text(C(ws, r, cR)); }), noD = [], noS = [];
      rows.forEach(function (r) { if (cD >= 0 && !date(C(ws, r, cD))) noD.push(A(r, cD)); if (cS >= 0 && !text(C(ws, r, cS))) noS.push(A(r, cS)); });
      if (!rows.length) add("warn", S, "A2", "Risk register", "rk-none", "The risk register is empty.", "List the project's risks.");
      if (noD.length) add("info", S, list(noD), "Risk register", "rk-date", noD.length + " risk" + (noD.length === 1 ? "" : "s") + " without a date raised.", "Enter the date raised.");
      if (noS.length) add("info", S, list(noS), "Risk register", "rk-stat", noS.length + " risk" + (noS.length === 1 ? "" : "s") + " without a status.", "Enter Open / Closed.");
    });

    /* ---------------- Engineering Drawings / Log ---------------- */
    var en = sheet(/^engineering (drawings?|log)$/i);
    if (en) safe(en.name, function () {
      var ws = en.ws, S = en.name, t = table(ws), cDs = t.col(/descr|document/), cSD = t.col(/submi/), cSt = t.col(/^status$/), cCode = t.col(/^project code$/);
      var rows = t.rows.filter(function (r) { return text(C(ws, r, cDs)); }), noSt = [], noD = [], fut = [], dup = {}, dupC = [], codeBad = [];
      rows.forEach(function (r) {
        var d = date(C(ws, r, cSD)), k = norm(text(C(ws, r, cDs))) + "|" + d;
        if (!text(C(ws, r, cSt))) noSt.push(A(r, cSt));
        if (cSD >= 0 && !d) noD.push(A(r, cSD));
        if (d && RD && d > RD) fut.push(A(r, cSD));
        if (dup[k]) dupC.push(A(r, cDs)); dup[k] = 1;
        if (cCode >= 0 && code && text(C(ws, r, cCode)) && text(C(ws, r, cCode)).toUpperCase().replace(/[A-Z]$/, "") !== code.replace(/[A-Z]$/, "")) codeBad.push(A(r, cCode));
      });
      if (!rows.length) add("info", S, "A2", "Engineering", "en-none", "No engineering documents listed.", "List the design submissions.");
      if (noSt.length) add("warn", S, list(noSt), "Engineering", "en-stat", noSt.length + " document" + (noSt.length === 1 ? "" : "s") + " without a status.", "Enter the review status / code.");
      if (noD.length) add("warn", S, list(noD), "Engineering", "en-date", noD.length + " document" + (noD.length === 1 ? "" : "s") + " without a submission date.", "Enter the submission date.");
      if (fut.length) add("error", S, list(fut), "Engineering", "en-fut", "Submission date after the report date.", "Correct the date.");
      if (dupC.length) add("info", S, list(dupC), "Engineering", "en-dup", dupC.length + " repeated row" + (dupC.length === 1 ? "" : "s") + " (same document and date).", "Remove duplicates.");
      if (codeBad.length) add("error", S, list(codeBad), "Engineering", "en-code", codeBad.length + " rows have another project's code.", "Correct the Project Code.");
    });

    /* ---------------- Master - Submission (code vs status) ---------------- */
    var msub = sheet(/^master\s*-\s*submission$/i);
    if (msub) safe(msub.name, function () {
      var ws = msub.ws, S = msub.name, hp = find(ws, /^codes?$/, 6); if (!hp) return;
      var sp = find(ws, /^status in weekly report$/, 6); if (!sp) return;
      var rg = range(ws), bad = [], rem = [];
      for (var r = hp.r + 1; r <= rg.e.r; r++) {
        var cd = norm(text(C(ws, r, hp.c))), st = norm(text(C(ws, r, sp.c))); if (!cd && !st) continue;
        if (/code ?[cd]\b/.test(cd) && /approved/.test(st)) bad.push(A(r, sp.c));
        if (/code ?[ab]\b/.test(cd) && /reject|revis/.test(st)) bad.push(A(r, sp.c));
        var note = norm(text(C(ws, r, sp.c + 1))); if (/approved/.test(st) && /not|didn|no official|without/.test(note)) rem.push(A(r, sp.c + 1));
      }
      if (bad.length) add("error", S, list(bad), "Submissions", "sub-code", bad.length + " submission" + (bad.length === 1 ? "" : "s") + ": review code and weekly-report status disagree (e.g. Code C/D shown as Approved).", "Code A/B = approved, Code C/D = revise / rejected.");
      if (rem.length) add("warn", S, list(rem), "Submissions", "sub-rem", rem.length + " submission" + (rem.length === 1 ? " is" : "s are") + " counted as Approved although the remark says no official approval.", "Count it as under review until the approval letter is received.");
    });

    out.forEach(function (f) { f.ReportDate = RD; });
    out.meta = V; out.reportDate = RD;
    return out;
  }

  /* compare the project files with each other */
  function cross(byFile) {
    var out = [], files = Object.keys(byFile);
    function add(sev, f, cell, rule, msg, fix) { var a = byFile[f]; out.push({ File: f, Code: a.code, Sheet: "Masterdata_Reporting", Cell: cell, Severity: sev, Section: "Across projects", Rule: rule, Finding: msg, Fix: fix }); }
    var rds = {}; files.forEach(function (f) { var d = byFile[f].reportDate; if (d) rds[d] = (rds[d] || 0) + 1; });
    var main = Object.keys(rds).sort(function (a, b) { return rds[b] - rds[a]; })[0];
    files.forEach(function (f) { var d = byFile[f].reportDate; if (main && d && d !== main) add(d < main ? "warn" : "info", f, "", "x-week", "This file is for " + fmtD(d) + " while the other project files are for " + fmtD(main) + ".", d < main ? "Send this week's report." : "Check the report date."); });
    function dupes(key, cellKey, label, sev, rule) {
      var by = {}; files.forEach(function (f) { var m = byFile[f].meta || {}, v = String(m[key] || "").trim(); if (v && v !== "-" && v !== "0") (by[v] = by[v] || []).push(f); });
      Object.keys(by).forEach(function (v) { if (by[v].length < 2) return; by[v].forEach(function (f) {
        var others = by[v].filter(function (g) { return g !== f; }).map(function (g) { return byFile[g].code; });
        add(sev, f, (byFile[f].meta || {})[cellKey] || "", rule, label + " " + v + " is the same as in " + others.join(", ") + ".", "Each project should have its own value — check if it was copied from another file.");
      }); });
    }
    dupes("po", "poCell", "PO Number", "warn", "x-po");
    dupes("eff", "effCell", "Contract effective date", "info", "x-eff");
    var codes = {}; files.forEach(function (f) { codes[String(byFile[f].code || "").replace(/^0*/, "")] = f; });
    files.forEach(function (f) { var m = byFile[f].meta || {}, c = String(m.cost || "").replace(/^0*/, ""); if (c && codes[c] && codes[c] !== f) add("warn", f, m.costCell || "", "x-cost", "Cost Code " + m.cost + " is the project code of " + byFile[codes[c]].code + ".", "Correct the Cost Code."); });
    return out;
  }

  function fromBuffer(buffer, file, code) {
    var XLSX = (typeof window !== "undefined" && window.XLSX) || null; if (!XLSX) return [];
    var wb = XLSX.read(buffer, { type: "array", cellNF: true, cellDates: false, cellStyles: false, bookVBA: false });
    return auditBook(XLSX, wb, file, code);
  }

  var RULES = [
    "Formula errors (#N/A, #REF!, #DIV/0!, …) in any sheet, hidden ones included",
    "Report date / calendar week / project week the same on every sheet and right for the report date",
    "Masterdata_Reporting: code matches the file, mandatory fields filled, dates in order, % within 0–100, SPI = EV ÷ PV, EV/PV vs progress × contract, paid ≤ submitted ≤ contract, Paid %, VO number and revised value, status vs variance, reason for delay, NCR/SOR totals, safety cumulative ≥ this week, man-hours vs manpower, safe man-hours",
    "S-Curve Data: dates weekly and in order, cumulative never decreases, no future actuals, this week's row present and equal to Masterdata, plan reaches 100% near the baseline end",
    "1. Progress Status: weekly = this week − last week, variance formulas, time status, lookahead (dates, #N/A, cumulative not lower), milestones (dates, % range, passed forecasts, variance days), forecast completion = Masterdata",
    "2. Safety Status: cumulative = last week + this week, table 2.2 = 2.1a, man-hours = Masterdata, manpower with man-hours",
    "4. Deliverables: approved + rejected + U/R = submitted, submitted = last week + this week",
    "5. NCR and 6. IPC: totals, paid ≤ submitted ≤ contract, % formulas, graph data = table, values = Masterdata",
    "7. Manpower / 8. Equipment: 6-week window includes the report week, no future actuals, missing values",
    "9. Cashflow: month window, cumulative = previous + month, no future actuals, cumulative ≤ contract, vs IPC submitted",
    "10-13. Data Input: achievements and lookahead filled, open concerns past target, missing status / mitigation / target, date order, risk owner / mitigation / scales / ranking",
    "Construction activities, H&S observations, key items, risk register, engineering log, submissions: % range, finished vs 100%, passed forecasts, open items past target, missing fields, wrong project code, duplicates, code vs status",
    "Across projects: same PO number, same contract effective date, cost code of another project, file for another week"
  ];

  return { auditBook: auditBook, fromBuffer: fromBuffer, cross: cross, codeOf: codeOf, RULES: RULES };
});

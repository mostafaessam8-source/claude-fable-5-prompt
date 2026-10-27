/* Design Gantt — reads the SAR "Design Submission Tracker" workbook and turns it into a schedule model.
 *
 * Only two date columns drive the chart: "Submission Date" and "Approval Date". Each is either an ACTUAL or a FORECAST
 * date — the data date tells which: up to the data date it is actual, after it it is forecast. Nothing else is calculated.
 * Pure logic, no DOM: runs in the browser (script tag) and in Node (tests).
 * Dates are Excel serial numbers (integers) throughout, so there are no time-zone surprises.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Model = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var EPOCH = 25569; // Excel serial of 1970-01-01

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function colToNum(s) { var n = 0; for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64); return n; }
  function numToCol(n) { var s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  function unesc(s) {
    return s.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, function (_, e) {
      if (e === 'lt') return '<'; if (e === 'gt') return '>'; if (e === 'amp') return '&';
      if (e === 'quot') return '"'; if (e === 'apos') return "'";
      return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    });
  }
  function norm(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase(); }
  function serialToDate(n) { return new Date((n - EPOCH) * 864e5); }
  function dateToSerial(d) { return Math.floor(d.getTime() / 864e5) + EPOCH; }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(n) {
    if (!isNum(n)) return '';
    var d = serialToDate(n);
    return String(d.getUTCDate()).padStart(2, '0') + '-' + MON[d.getUTCMonth()] + '-' + String(d.getUTCFullYear()).slice(2);
  }

  /* ---------- workbook XML readers ---------- */
  function parseSharedStrings(xml) {
    var out = [], re = /<si\b[^>]*>([\s\S]*?)<\/si>/g, m;
    while ((m = re.exec(xml))) {
      var t = '', r = /<t\b[^>]*>([\s\S]*?)<\/t>/g, x;
      while ((x = r.exec(m[1]))) t += unesc(x[1]);
      out.push(t);
    }
    return out;
  }

  /* Sheet XML -> { cells: {'C5': value}, rows: {5: {outline, hidden}} }. Numbers stay numbers, text stays text. */
  function parseSheet(xml, sst) {
    var cells = {}, rows = {};
    var rowRe = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g, rm;
    while ((rm = rowRe.exec(xml))) {
      var ra = rm[1], rn = +(/\br="(\d+)"/.exec(ra) || [])[1];
      if (!rn) continue;
      var ol = /\boutlineLevel="(\d+)"/.exec(ra), hid = /\bhidden="(1|true)"/.exec(ra);
      rows[rn] = { outline: ol ? +ol[1] : 0, hidden: !!hid };
      if (!rm[2]) continue;
      var cRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, cm;
      while ((cm = cRe.exec(rm[2]))) {
        var ca = cm[1], ref = (/\br="([A-Z]+\d+)"/.exec(ca) || [])[1];
        if (!ref || !cm[2]) continue;
        var t = (/\bt="(\w+)"/.exec(ca) || [])[1];
        var v = /<v>([\s\S]*?)<\/v>/.exec(cm[2]), val;
        if (t === 'inlineStr') {
          var tt = '', tr = /<t\b[^>]*>([\s\S]*?)<\/t>/g, tx;
          while ((tx = tr.exec(cm[2]))) tt += unesc(tx[1]);
          val = tt;
        } else if (!v) continue;
        else if (t === 's') val = sst[+v[1]];
        else if (t === 'str') val = unesc(v[1]);
        else if (t === 'e') val = { error: v[1] };
        else if (t === 'b') val = v[1] === '1';
        else val = parseFloat(v[1]);
        cells[ref] = val;
      }
    }
    return { cells: cells, rows: rows };
  }

  async function readText(zip, path) {
    var f = zip.file(path);
    return f ? f.async('string') : null;
  }

  /* Which worksheet file holds the tracker? Prefer the sheet called "Tracker", else the first visible sheet that has the header labels. */
  async function locateSheets(zip) {
    var wb = await readText(zip, 'xl/workbook.xml');
    var rels = await readText(zip, 'xl/_rels/workbook.xml.rels');
    if (!wb || !rels) throw new Error('This is not an Excel (.xlsx) workbook.');
    var relMap = {}, rr = /<Relationship\b([^>]*?)\/?>/g, m;
    while ((m = rr.exec(rels))) {
      var id = /\bId="([^"]+)"/.exec(m[1]), tg = /\bTarget="([^"]+)"/.exec(m[1]);
      if (id && tg) relMap[id[1]] = tg[1].replace(/^\/?(xl\/)?/, 'xl/');
    }
    var sheets = [], sr = /<sheet\b([^>]*?)\/>/g;
    while ((m = sr.exec(wb))) {
      var nm = /\bname="([^"]*)"/.exec(m[1]), rid = /\br:id="([^"]+)"/.exec(m[1]), st = /\bstate="(\w+)"/.exec(m[1]);
      if (nm && rid && relMap[rid[1]]) sheets.push({ name: unesc(nm[1]), path: relMap[rid[1]], hidden: !!st && st[1] !== 'visible', index: sheets.length });
    }
    return { sheets: sheets, workbookXml: wb, relsXml: rels };
  }

  /* ---------- header detection ---------- */
  var GLOBAL_LABELS = [
    [/^programme/, 'programme'], [/^project code/, 'code'], [/^project\s*\/\s*element|^element|^project name/, 'name'],
    [/^submission date/, 'ps'], [/^approval date/, 'pa'], [/main challenges|^notes|^remarks/, 'notes'], [/^lvl/, 'lvl']
  ];

  function detectLayout(sheet) {
    var cells = sheet.cells, hdrRow = 0, c, r;
    for (r = 1; r <= 60 && !hdrRow; r++)
      for (c = 1; c <= 120; c++) { var v = cells[numToCol(c) + r]; if (typeof v === 'string' && /^submission date/.test(norm(v))) { hdrRow = r; break; } }
    if (!hdrRow) throw new Error('Could not find the "Submission Date" / "Approval Date" columns. Is this the Design Submission Tracker?');
    var lastCol = 1, g = {};
    for (c = 1; c <= 120; c++) if (cells[numToCol(c) + hdrRow] != null) lastCol = c;
    for (c = 1; c <= lastCol; c++) {
      // headers may sit on the row above (merged cells such as "Project / Element")
      var labs = [norm(cells[numToCol(c) + hdrRow]), norm(cells[numToCol(c) + (hdrRow - 1)])];
      for (var j = 0; j < GLOBAL_LABELS.length; j++)
        if (g[GLOBAL_LABELS[j][1]] == null && (GLOBAL_LABELS[j][0].test(labs[0]) || GLOBAL_LABELS[j][0].test(labs[1]))) { g[GLOBAL_LABELS[j][1]] = c; break; }
    }
    if (!g.name) throw new Error('Could not find the "Project / Element" column.');
    if (!g.pa) throw new Error('Could not find the "Approval Date" column next to "Submission Date".');
    // the SAR review code that belongs to these two dates: the nearest "SAR code" column to the left of Submission Date
    for (c = g.ps - 1; c >= 1; c--) if (/^sar code/.test(norm(cells[numToCol(c) + hdrRow]))) { g.sar = c; break; }
    return { hdrRow: hdrRow, g: g };
  }

  function readControls(cells, hdrRow) {
    var meta = { dataDate: null, refs: {} };
    for (var r = 1; r < hdrRow; r++)
      if (/^data date/.test(norm(cells['A' + r])) && isNum(cells['C' + r])) { meta.dataDate = cells['C' + r]; meta.refs.dd = 'C' + r; }
    return meta;
  }

  /* ---------- status by data date ----------
   *  Actual      approval date reached (on or before the data date)
   *  In progress submitted (submission date reached) and approval still ahead
   *  Forecast    submission date still ahead
   */
  function statusOf(ps, pa, cut) {
    if (!isNum(ps) && !isNum(pa)) return 'No dates';
    if (isNum(pa) && pa <= cut) return 'Actual';
    if (isNum(ps) && ps <= cut) return 'In progress';
    return 'Forecast';
  }
  /* Submission and Approval are MILESTONES (points), not activities. Each is actual up to the data date, forecast after it. */
  function milestones(ps, pa, code, cut) {
    var out = [];
    if (isNum(ps)) out.push({ t: 'sub', d: ps, actual: ps <= cut });
    if (isNum(pa)) out.push({ t: 'app', d: pa, actual: pa <= cut, code: code || '' });
    return out;
  }

  /* ---------- the reader ---------- */
  async function readWorkbook(zip, opts) {
    opts = opts || {};
    var loc = await locateSheets(zip);
    var sstXml = await readText(zip, 'xl/sharedStrings.xml');
    var sst = sstXml ? parseSharedStrings(sstXml) : [];
    var chosen = loc.sheets.filter(function (s) { return /^tracker$/i.test(s.name); })[0], sheet, layout, err;
    var candidates = chosen ? [chosen] : loc.sheets.filter(function (s) { return !s.hidden && !/gantt/i.test(s.name); });
    for (var i = 0; i < candidates.length && !layout; i++) {
      try { sheet = parseSheet(await readText(zip, candidates[i].path), sst); layout = detectLayout(sheet); chosen = candidates[i]; }
      catch (e) { err = e; }
    }
    if (!layout) throw err || new Error('No tracker sheet found.');
    var cells = sheet.cells, G = layout.g;
    var meta = readControls(cells, layout.hdrRow);
    meta.sheetName = chosen.name;
    function txt(col, r) { var v = col ? cells[numToCol(col) + r] : undefined; return v == null || typeof v === 'object' ? '' : typeof v === 'number' ? String(v) : String(v).trim(); }
    function dt(col, r) { var v = col ? cells[numToCol(col) + r] : undefined; return isNum(v) && v > 20000 && v < 80000 ? Math.round(v) : null; } // 2024–2118
    var lastRow = 0;
    Object.keys(cells).forEach(function (k) { var rn = +k.replace(/\D/g, ''); if (rn > lastRow) lastRow = rn; });
    var projects = [], cur = null, chain = false;
    for (var r = layout.hdrRow + 1; r <= lastRow; r++) {
      var lvl = txt(G.lvl, r).toUpperCase(), prog = txt(G.programme, r), name = txt(G.name, r), pcode = txt(G.code, r);
      var line = { row: r, name: name, notes: txt(G.notes, r), ps: dt(G.ps, r), pa: dt(G.pa, r), code: txt(G.sar, r).toUpperCase(), strPs: typeof cells[numToCol(G.ps) + r] === 'string' };
      if (lvl === 'P' || (lvl !== 'E' && !!prog)) {
        if (!name && !pcode) { cur = null; chain = false; continue; } // a bare "NSR" row is only a separator
        // a "project" row with no project code straight under another project is really one of its lines (e.g. the 0583 packages)
        if (chain && cur && !pcode && prog === cur.programme) { cur.elements.push(line); continue; }
        cur = { row: r, programme: prog, code: pcode, name: name, notes: line.notes, ps: line.ps, pa: line.pa, sar: line.code, elements: [] };
        projects.push(cur); chain = !!pcode;
        continue;
      }
      if (!name || !cur) continue;
      cur.elements.push(line);
    }
    var model = { meta: meta, projects: projects, layout: { hdrRow: layout.hdrRow, sheet: chosen.name, g: (function () { var o = {}; Object.keys(G).forEach(function (k) { o[k] = numToCol(G[k]); }); return o; })() } };
    var cut = opts.dataDate != null ? opts.dataDate : meta.dataDate;
    if (!isNum(cut)) cut = dateToSerial(new Date());
    meta.workbookDataDate = meta.dataDate;
    recalc(model, cut);
    return model;
  }

  function recalc(model, cut) {
    model.meta.cut = cut;
    model.projects.forEach(function (p) {
      p.elements.forEach(function (e) { e.status = statusOf(e.ps, e.pa, cut); });
      // a project shows its own dates when they are entered on its row, otherwise the span of its elements
      var ps = p.elements.map(function (e) { return e.ps; }).filter(isNum), pa = p.elements.map(function (e) { return e.pa; }).filter(isNum);
      p.eps = isNum(p.ps) ? p.ps : (ps.length ? Math.min.apply(null, ps) : null);
      p.epa = isNum(p.pa) ? p.pa : (pa.length ? Math.max.apply(null, pa) : null);
      p.status = statusOf(p.eps, p.epa, cut);
    });
    model.stats = computeStats(model);
    model.checks = runChecks(model);
  }

  function computeStats(model) {
    var st = { projects: model.projects.length, elements: 0, codes: { A: 0, B: 0, C: 0, D: 0, none: 0 }, counts: { 'Actual': 0, 'In progress': 0, 'Forecast': 0, 'No dates': 0 }, first: null, last: null };
    model.projects.forEach(function (p) {
      p.elements.forEach(function (e) { st.elements++; st.counts[e.status]++; st.codes[/^[ABCD]$/.test(e.code) ? e.code : 'none']++; });
      [p.eps, p.epa].forEach(function (d) { if (isNum(d)) { st.first = st.first == null ? d : Math.min(st.first, d); st.last = st.last == null ? d : Math.max(st.last, d); } });
    });
    return st;
  }

  function runChecks(model) {
    var out = [];
    function add(sev, p, e, msg) { out.push({ sev: sev, project: p.code || p.name, element: e.name, row: e.row, msg: msg }); }
    model.projects.forEach(function (p) {
      [{ row: p.row, name: p.name, ps: p.ps, pa: p.pa }].concat(p.elements).forEach(function (e) {
        if (isNum(e.ps) && isNum(e.pa) && e.pa < e.ps) add('error', p, e, 'Approval Date (' + fmtDate(e.pa) + ') is before Submission Date (' + fmtDate(e.ps) + ').');
        else if (isNum(e.ps) !== isNum(e.pa) && (isNum(e.ps) || isNum(e.pa))) add('warn', p, e, 'Only the ' + (isNum(e.ps) ? 'Submission' : 'Approval') + ' Date is filled — shown as a single-day marker.');
        if (e.code && !/^[ABCD]$/.test(e.code)) add('warn', p, e, 'SAR code "' + e.code + '" is not A, B, C or D.');
        if (e.strPs) add('info', p, e, 'Submission Date contains text, not a date.');
      });
      p.elements.forEach(function (e) { if (!isNum(e.ps) && !isNum(e.pa)) add('info', p, e, 'No Submission / Approval dates entered yet.'); });
      if (!p.elements.length && !isNum(p.ps) && !isNum(p.pa)) add('info', p, { name: p.name, row: p.row }, 'Project has no dates and no element rows.');
    });
    var rank = { error: 0, warn: 1, info: 2 };
    out.sort(function (a, b) { return rank[a.sev] - rank[b.sev] || a.row - b.row; });
    return out;
  }

  /* ---------- Gantt line items ---------- */
  function buildItems(model, o) {
    o = o || {};
    var cut = model.meta.cut, items = [], pi = 0, pass = o.filter || function () { return true; };
    model.projects.forEach(function (p) {
      var els = p.elements.filter(function (e) { return pass(p, e); });
      if (!els.length && !pass(p, null)) return;
      pi++;
      // when filtering, the project bar covers just the lines shown
      var ps = p.eps, pa = p.epa;
      if (els.length !== p.elements.length && !isNum(p.ps)) {
        var a = els.map(function (e) { return e.ps; }).filter(isNum), b = els.map(function (e) { return e.pa; }).filter(isNum);
        ps = a.length ? Math.min.apply(null, a) : null; pa = b.length ? Math.max.apply(null, b) : null;
      }
      items.push({ kind: 'project', lvl: 0, id: String(pi), label: (p.code ? p.code + ' — ' : '') + p.name, project: p, ps: ps, pa: pa, code: p.sar || '', status: statusOf(ps, pa, cut), ms: milestones(ps, pa, p.sar, cut), notes: p.notes, trow: p.row, kids: els.length });
      els.forEach(function (e, ei) {
        items.push({ kind: 'element', lvl: 1, id: pi + '.' + (ei + 1), label: e.name, project: p, element: e, ps: e.ps, pa: e.pa, code: e.code || '', status: e.status, ms: milestones(e.ps, e.pa, e.code, cut), notes: e.notes, trow: e.row });
      });
    });
    return items;
  }

  /* Date range of the chart: every bar date and the data date. */
  function chartRange(items, cut) {
    var lo = cut, hi = cut;
    items.forEach(function (it) { it.ms.forEach(function (g) { lo = Math.min(lo, g.d); hi = Math.max(hi, g.d); }); });
    return [lo, hi];
  }

  return {
    EPOCH: EPOCH, isNum: isNum, numToCol: numToCol, colToNum: colToNum, fmtDate: fmtDate, serialToDate: serialToDate, dateToSerial: dateToSerial, norm: norm,
    readWorkbook: readWorkbook, recalc: recalc, buildItems: buildItems, chartRange: chartRange, statusOf: statusOf, milestones: milestones,
    parseSheet: parseSheet, parseSharedStrings: parseSharedStrings, locateSheets: locateSheets, readText: readText, unesc: unesc
  };
});

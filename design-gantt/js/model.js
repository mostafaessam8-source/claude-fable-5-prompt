/* Design Gantt — reads the SAR "Design Submission Tracker" workbook and turns it into a schedule model.
 *
 * Pure logic, no DOM: it runs in the browser (script tag) and in Node (tests).
 *   Model.readWorkbook(zip)   -> { meta, projects, checks }   (zip = a loaded JSZip of the .xlsx)
 *   Model.buildItems(model, o)-> Gantt line items (shared by the on-screen chart and the Excel sheet)
 * Dates are Excel serial numbers (integers) throughout, so there are no time-zone surprises.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Model = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var EPOCH = 25569; // Excel serial of 1970-01-01
  var STAGE_NAMES = ['Concept', 'Preliminary', 'Detailed'];
  var STAGE_LONG = ['Concept Design', 'Preliminary Design', 'Detailed Design'];

  /* ---------- small helpers ---------- */
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
  var STAGE_LABELS = [
    [/^baseline submission/, 'bs'], [/^baseline approval/, 'ba'], [/^actual submission/, 'as'], [/^actual review/, 'ar'],
    [/^sar code/, 'code'], [/forecast re-?submission/, 'fs'], [/forecast approval/, 'fa'],
    [/^submission date/, 'ps'], [/^approval date/, 'pa'], [/^priority/, 'pri'], [/^%$/, 'pctCached'], [/^health/, 'healthCached'], [/^var/, 'varCached']
  ];
  var GLOBAL_LABELS = [
    [/^programme/, 'programme'], [/^project code/, 'code'], [/^project\s*\/\s*element|^element|^project name/, 'name'],
    [/engineering expected/, 'expected'], [/^project end/, 'end'], [/main challenges|^notes|^remarks/, 'notes'], [/^lvl/, 'lvl']
  ];

  function detectLayout(sheet) {
    var cells = sheet.cells, hdrRow = 0, c;
    for (var r = 1; r <= 60 && !hdrRow; r++)
      for (c = 1; c <= 80; c++) { var v = cells[numToCol(c) + r]; if (typeof v === 'string' && /^baseline\s*submission/.test(norm(v))) { hdrRow = r; break; } }
    if (!hdrRow) throw new Error('Could not find the header row ("Baseline submission"). Is this the Design Submission Tracker?');
    var grpRow = hdrRow - 1, lastCol = 1;
    for (c = 1; c <= 120; c++) if (cells[numToCol(c) + hdrRow] != null || cells[numToCol(c) + grpRow] != null) lastCol = c;
    // stage groups start at the cells of the group row that mention a design stage
    var starts = [];
    for (c = 1; c <= lastCol; c++) {
      var g = norm(cells[numToCol(c) + grpRow]);
      var k = /concept/.test(g) ? 0 : /prelim/.test(g) ? 1 : /detail/.test(g) ? 2 : -1;
      if (k >= 0) starts.push({ k: k, col: c });
    }
    if (!starts.length) throw new Error('Could not find the design-stage groups (Concept / Preliminary / Detailed) above the header row.');
    var stages = starts.map(function (s, i) {
      var to = i + 1 < starts.length ? starts[i + 1].col - 1 : lastCol, f = {};
      for (var cc = s.col; cc <= to; cc++) {
        var lab = norm(cells[numToCol(cc) + hdrRow]);
        for (var j = 0; j < STAGE_LABELS.length; j++)
          if (STAGE_LABELS[j][0].test(lab) && f[STAGE_LABELS[j][1]] == null) { f[STAGE_LABELS[j][1]] = cc; break; }
      }
      return { k: s.k, f: f };
    });
    var g2 = {}, firstStage = starts[0].col;
    for (c = 1; c <= lastCol; c++) {
      var labA = norm(cells[numToCol(c) + hdrRow]), labB = norm(cells[numToCol(c) + grpRow]);
      for (var j2 = 0; j2 < GLOBAL_LABELS.length; j2++) {
        var key = GLOBAL_LABELS[j2][1], rx = GLOBAL_LABELS[j2][0];
        if (g2[key] == null && (rx.test(labA) || rx.test(labB)) && !(c >= firstStage && /^(%|health|var)/.test(labA))) { g2[key] = c; }
      }
    }
    if (!g2.name) throw new Error('Could not find the "Project / Element" column.');
    return { hdrRow: hdrRow, stages: stages, g: g2 };
  }

  /* The control panel at the top: data date, at-risk window, % earned per code, stage weights. */
  function readControls(cells, hdrRow) {
    var meta = { dataDate: null, window: 14, earned: { sub: 0.6, D: 0.5, C: 0.7, B: 0.9, A: 1 }, weights: [0.15, 0.3, 0.55], refs: { w: [] } };
    for (var r = 1; r < hdrRow; r++) {
      var lab = norm(cells['A' + r]);
      var val = cells['C' + r];
      if (/^data date/.test(lab) && isNum(val)) { meta.dataDate = val; meta.refs.dd = 'C' + r; }
      else if (/^at-?risk window/.test(lab) && isNum(val)) { meta.window = val; meta.refs.win = 'C' + r; }
      else if (/earned.*submitted/.test(lab) && isNum(val)) { meta.earned.sub = val; meta.refs.sub = 'C' + r; }
      else { var m = /earned.*code ([abcd])/.exec(lab); if (m && isNum(val)) { meta.earned[m[1].toUpperCase()] = val; meta.refs[m[1].toUpperCase()] = 'C' + r; } }
      var d = norm(cells['D' + r]);
      if (isNum(cells['F' + r])) {
        var wk = /^concept/.test(d) ? 0 : /^prelim/.test(d) ? 1 : /^detail/.test(d) ? 2 : -1;
        if (wk >= 0) { meta.weights[wk] = cells['F' + r]; meta.refs.w[wk] = 'F' + r; }
      }
    }
    return meta;
  }

  /* ---------- stage maths (same rules as the workbook formulas) ---------- */
  function stageHasData(s) { return isNum(s.bs) || isNum(s.ba) || isNum(s.as) || isNum(s.ar) || isNum(s.fs) || isNum(s.fa) || !!s.code; }

  function stageCalc(s, cut, meta) {
    if (!stageHasData(s)) { s.pct = null; s.health = '-'; s.varDays = null; return; }
    var code = s.code, e = meta.earned;
    s.pct = code === 'A' ? e.A : code === 'B' ? e.B : code === 'C' ? e.C : code === 'D' ? e.D : isNum(s.as) ? e.sub : 0;
    var open = (code === '' || code === 'C' || code === 'D');
    var late = (!isNum(s.as) && isNum(s.bs) && s.bs < cut) || (open && isNum(s.ba) && s.ba < cut);
    var risk = (!isNum(s.as) && isNum(s.bs) && s.bs - cut <= meta.window) || (open && isNum(s.ba) && s.ba - cut <= meta.window);
    s.health = s.pct >= 1 ? 'Completed' : late ? 'Delayed' : risk ? 'At Risk' : (!isNum(s.as) && !isNum(s.ar)) ? 'Not Started' : 'In Progress';
    if (!isNum(s.ba)) s.varDays = null;
    else if (isNum(s.ar) && (code === 'A' || code === 'B')) s.varDays = s.ar - s.ba;
    else if (isNum(s.fa)) s.varDays = s.fa - s.ba;
    else s.varDays = cut - s.ba;
  }

  var RANK = { 'Delayed': 4, 'At Risk': 3, 'In Progress': 2, 'Not Started': 1, 'Completed': 0, '-': -1 };
  function worst(list) {
    var w = '-';
    list.forEach(function (h) { if (RANK[h] > RANK[w]) w = h; });
    return w;
  }
  /* Roll a set of stage records up into one status the way the workbook does for a project row. */
  function rollHealth(list, pct) {
    var used = list.filter(function (h) { return h !== '-'; });
    if (!used.length) return '-';
    if (pct != null && pct >= 1) return 'Completed';
    if (used.indexOf('Delayed') >= 0) return 'Delayed';
    if (used.indexOf('At Risk') >= 0) return 'At Risk';
    if (pct === 0 || used.every(function (h) { return h === 'Not Started'; })) return 'Not Started';
    return 'In Progress';
  }

  function elementCalc(el, meta) {
    var num = 0, den = 0;
    el.stages.forEach(function (s) { if (s.pct != null) { num += meta.weights[s.k] * s.pct; den += meta.weights[s.k]; } });
    el.pct = den ? num / den : null;
    el.health = rollHealth(el.stages.map(function (s) { return s.health; }), el.pct);
    var vs = el.stages.map(function (s) { return s.varDays; }).filter(isNum);
    el.varDays = vs.length ? Math.max.apply(null, vs) : null;
  }

  function projectCalc(p) {
    var pcts = p.elements.map(function (e) { return e.pct; }).filter(isNum);
    p.pct = pcts.length ? pcts.reduce(function (a, b) { return a + b; }, 0) / pcts.length : null;
    p.health = rollHealth(p.elements.map(function (e) { return e.health; }), p.pct);
    var vs = p.elements.map(function (e) { return e.varDays; }).filter(isNum);
    p.varDays = vs.length ? Math.max.apply(null, vs) : null;
  }

  function recalc(model, cut) {
    var meta = model.meta;
    meta.cut = cut;
    model.projects.forEach(function (p) {
      p.elements.forEach(function (el) { el.stages.forEach(function (s) { stageCalc(s, cut, meta); }); elementCalc(el, meta); });
      projectCalc(p);
    });
    model.stats = computeStats(model);
    model.checks = runChecks(model);
  }

  function computeStats(model) {
    var meta = model.meta, st = { projects: model.projects.length, elements: 0, health: { 'Completed': 0, 'In Progress': 0, 'At Risk': 0, 'Delayed': 0, 'Not Started': 0 }, openCD: 0, approved: 0, latestClose: null, byStage: [] };
    var num = 0, den = 0;
    model.projects.forEach(function (p) {
      p.elements.forEach(function (el) {
        st.elements++;
        el.stages.forEach(function (s) {
          if (s.health !== '-' && st.health[s.health] != null) st.health[s.health]++;
          if (s.code === 'C' || s.code === 'D') st.openCD++;
          if (s.code === 'A') st.approved++;
          [s.fa, s.pa].forEach(function (d) { if (isNum(d) && (st.latestClose == null || d > st.latestClose)) st.latestClose = d; });
        });
        if (el.pct != null) { num += el.pct; den++; }
      });
    });
    st.overall = den ? num / den : null;
    // programme % the workbook way: stage weights x stage average
    var sNum = 0, sDen = 0;
    for (var k = 0; k < 3; k++) {
      var arr = [];
      model.projects.forEach(function (p) { p.elements.forEach(function (el) { el.stages.forEach(function (s) { if (s.k === k && s.pct != null) arr.push(s.pct); }); }); });
      var avg = arr.length ? arr.reduce(function (a, b) { return a + b; }, 0) / arr.length : null;
      st.byStage.push({ k: k, items: arr.length, pct: avg });
      if (avg != null) { sNum += meta.weights[k] * arr.length * avg; sDen += meta.weights[k] * arr.length; }
    }
    st.programmePct = sDen ? sNum / sDen : null;
    return st;
  }

  /* ---------- data-quality checks a planner would raise before trusting the dates ---------- */
  function runChecks(model) {
    var out = [], cut = model.meta.cut;
    function add(sev, p, el, s, msg) { out.push({ sev: sev, project: p.code || p.name, element: el ? el.name : p.name, stage: s != null ? STAGE_NAMES[s.k] : '', row: el ? el.row : p.row, msg: msg }); }
    model.projects.forEach(function (p) {
      p.elements.forEach(function (el) {
        el.stages.forEach(function (s) {
          if (!stageHasData(s)) return;
          if (isNum(s.bs) && isNum(s.ba) && s.ba < s.bs) add('error', p, el, s, 'Baseline approval (' + fmtDate(s.ba) + ') is before baseline submission (' + fmtDate(s.bs) + ').');
          if (isNum(s.as) && isNum(s.ar) && s.ar < s.as) add('error', p, el, s, 'Actual review (' + fmtDate(s.ar) + ') is before actual submission (' + fmtDate(s.as) + ').');
          if (isNum(s.fs) && isNum(s.fa) && s.fa < s.fs) add('error', p, el, s, 'Forecast approval (' + fmtDate(s.fa) + ') is before forecast re-submission (' + fmtDate(s.fs) + ').');
          if (isNum(s.ps) && isNum(s.pa) && s.pa < s.ps) add('error', p, el, s, 'Approval date (' + fmtDate(s.pa) + ') is before submission date (' + fmtDate(s.ps) + ').');
          var open = s.code === '' || s.code === 'C' || s.code === 'D';
          if (open && isNum(s.fa) && s.fa < cut) add('warn', p, el, s, 'Forecast approval ' + fmtDate(s.fa) + ' is already before the data date and the stage is still open — update the forecast.');
          if (open && isNum(s.ps) && s.ps < cut && !isNum(s.pa)) add('warn', p, el, s, 'Planned submission ' + fmtDate(s.ps) + ' has passed.');
          if (open && isNum(s.as) && !isNum(s.ar) && cut - s.as > 30) add('warn', p, el, s, 'Submitted ' + fmtDate(s.as) + ' — ' + (cut - s.as) + ' days with no SAR review recorded.');
          if (open && !isNum(s.fs) && !isNum(s.fa) && !isNum(s.pa) && s.health !== 'Not Started') add('info', p, el, s, 'Open stage with no forecast dates.');
          if (typeof s.fsText === 'string' && s.fsText) add('info', p, el, s, 'Forecast re-submission is text ("' + s.fsText + '"), not a date — shown as a milestone on the forecast approval date.');
          if (s.code && !/^[ABCD]$/.test(s.code)) add('error', p, el, s, 'SAR code "' + s.code + '" is not A, B, C or D.');
          var lastEnd = Math.max.apply(null, [s.fa, s.pa, s.ar].filter(isNum).concat([-Infinity]));
          if (isNum(p.end) && isFinite(lastEnd) && lastEnd > p.end) add('warn', p, el, s, 'Finishes ' + fmtDate(lastEnd) + ', after the project end date ' + fmtDate(p.end) + '.');
        });
        if (isNum(el.expected) && (cut - el.expected) > 365) add('warn', p, el, null, '"Engineering expected date" ' + fmtDate(el.expected) + ' is more than a year before the data date — probably a typo in the year.');
        if (!el.stages.some(stageHasData) && el.name) add('info', p, el, null, 'No dates or codes entered yet.');
      });
      if (!p.elements.length) add('info', p, null, null, 'Project has no element rows yet.');
    });
    var rank = { error: 0, warn: 1, info: 2 };
    out.sort(function (a, b) { return rank[a.sev] - rank[b.sev] || a.row - b.row; });
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
      try {
        sheet = parseSheet(await readText(zip, candidates[i].path), sst);
        layout = detectLayout(sheet);
        chosen = candidates[i];
      } catch (e) { err = e; }
    }
    if (!layout) throw err || new Error('No tracker sheet found.');
    var cells = sheet.cells, L = layout, G = L.g;
    var meta = readControls(cells, L.hdrRow);
    meta.sheetName = chosen.name;
    meta.weights = meta.weights.slice();
    function cv(col, r) { return col ? cells[numToCol(col) + r] : undefined; }
    function txt(col, r) { var v = cv(col, r); return v == null || (typeof v === 'object') ? '' : (typeof v === 'number' ? String(v) : String(v).trim()); }
    function dt(col, r) { var v = cv(col, r); return isNum(v) && v > 20000 && v < 80000 ? Math.round(v) : null; } // 2024–2118; anything else is not a date

    var lastRow = 0;
    Object.keys(cells).forEach(function (k) { var r = +k.replace(/\D/g, ''); if (r > lastRow) lastRow = r; });
    function readStages(r) {
      var out = [];
      L.stages.forEach(function (sg) {
        var f = sg.f, st = { k: sg.k };
        ['bs', 'ba', 'as', 'ar', 'fs', 'fa', 'ps', 'pa'].forEach(function (key) { st[key] = dt(f[key], r); });
        var fsRaw = cv(f.fs, r); st.fsText = typeof fsRaw === 'string' ? fsRaw.trim() : '';
        st.code = txt(f.code, r).toUpperCase();
        out.push(st);
      });
      return out;
    }
    function priorityOf(r) {
      for (var i = 0; i < L.stages.length; i++) { var pc = L.stages[i].f.pri; if (pc && isNum(cv(pc, r))) return cv(pc, r); }
      return null;
    }
    var projects = [], cur = null, chain = false, rowsSeen = 0;
    for (var r = L.hdrRow + 1; r <= lastRow; r++) {
      var lvl = txt(G.lvl, r).toUpperCase(), prog = txt(G.programme, r), name = txt(G.name, r), pcode = txt(G.code, r);
      var isProject = lvl === 'P' || (lvl !== 'E' && !!prog);
      if (isProject) {
        if (!name && !pcode) { cur = null; chain = false; continue; } // a bare "NSR" row is only a separator
        // A "project" row with no project code straight under another project is really one of its lines (e.g. the 0583 lathe packages).
        if (chain && cur && !pcode && prog === cur.programme) {
          cur.elements.push({ row: r, name: name, notes: txt(G.notes, r), expected: dt(G.expected, r), priority: priorityOf(r), stages: readStages(r), fromProjectRow: true });
          continue;
        }
        cur = { row: r, programme: prog, code: pcode, name: name, notes: txt(G.notes, r), end: dt(G.end, r), elements: [], own: readStages(r) };
        projects.push(cur);
        chain = !!pcode;
        continue;
      }
      if (!name || !cur) continue;
      cur.elements.push({ row: r, name: name, notes: txt(G.notes, r), expected: dt(G.expected, r), priority: priorityOf(r), stages: readStages(r) });
    }
    // A project that has dates of its own but no element rows is itself the line of work.
    projects.forEach(function (p) {
      if (!p.elements.length && p.own.some(stageHasData))
        p.elements.push({ row: p.row, name: p.name, notes: p.notes, expected: null, priority: null, stages: p.own, self: true });
    });
    var letters = function (f) { var o = {}; Object.keys(f).forEach(function (k) { o[k] = numToCol(f[k]); }); return o; };
    var model = {
      meta: meta, projects: projects,
      layout: { hdrRow: L.hdrRow, sheet: chosen.name, stages: L.stages.map(function (sg) { return { k: sg.k, f: letters(sg.f) }; }), g: letters(G) }
    };
    var cut = opts.dataDate != null ? opts.dataDate : meta.dataDate;
    if (!isNum(cut)) cut = dateToSerial(new Date());
    meta.workbookDataDate = meta.dataDate;
    recalc(model, cut);
    return model;
  }

  /* ---------- Gantt line items ----------
   * An "item" is one block of the chart: a baseline line and an actual/forecast line.
   *   kind: project | element | stage     lvl: 0|1|2
   *   base: [s,e] | null                  segs: [{t, s, e}] with t in
   *   actual (reviewed) · review (submitted, SAR still reviewing) · forecast · fmile (forecast milestone) · plan · sum
   *   codeAt: {d, code}  (SAR review outcome marker)
   */
  function stageBase(s) {
    var a = s.bs, b = s.ba;
    if (!isNum(a) && !isNum(b)) return null;
    if (!isNum(a)) a = b; if (!isNum(b)) b = a;
    return a <= b ? [a, b] : [b, a];
  }
  function stageSegs(s, cut) {
    var segs = [], done = s.code === 'A' || s.code === 'B';
    if (!done) {
      if (isNum(s.fa)) { var fs0 = isNum(s.fs) ? s.fs : s.fa; segs.push(isNum(s.fs) ? { t: 'forecast', s: Math.min(fs0, s.fa), e: Math.max(fs0, s.fa) } : { t: 'fmile', s: s.fa, e: s.fa }); }
      else if (isNum(s.fs)) segs.push({ t: 'fmile', s: s.fs, e: s.fs });
      if (isNum(s.ps) || isNum(s.pa)) { var p0 = isNum(s.ps) ? s.ps : s.pa, p1 = isNum(s.pa) ? s.pa : s.ps; segs.push({ t: 'plan', s: Math.min(p0, p1), e: Math.max(p0, p1) }); }
    }
    if (isNum(s.as)) {
      if (isNum(s.ar)) segs.push({ t: 'actual', s: Math.min(s.as, s.ar), e: Math.max(s.as, s.ar) });
      else segs.push({ t: 'review', s: s.as, e: Math.max(s.as, cut) });
    } else if (isNum(s.ar)) segs.push({ t: 'actual', s: s.ar, e: s.ar });
    return segs;
  }
  function span(list) {
    var lo = Infinity, hi = -Infinity;
    list.forEach(function (x) { if (x) { lo = Math.min(lo, x[0]); hi = Math.max(hi, x[1]); } });
    return isFinite(lo) ? [lo, hi] : null;
  }
  function itemFromStages(stages, cut) {
    var base = span(stages.map(stageBase)), segs = [];
    stages.forEach(function (s) { segs = segs.concat(stageSegs(s, cut)); });
    return { base: base, segs: segs };
  }

  function buildItems(model, o) {
    o = o || {};
    var cut = model.meta.cut, items = [], pi = 0;
    var pass = o.filter || function () { return true; };
    model.projects.forEach(function (p) {
      var els = p.elements.filter(function (e) { return pass(p, e); });
      if (!els.length && !pass(p, null)) return;
      pi++;
      var all = [];
      els.forEach(function (e) { e.stages.forEach(function (s) { if (stageHasData(s)) all.push(s); }); });
      if (els.length === 1 && els[0].self && all.length === 1) {
        var only = els[0], one = itemFromStages(all, cut);
        items.push({
          kind: 'project', lvl: 0, id: String(pi), label: (p.code ? p.code + ' — ' : '') + p.name, project: p, element: only, stage: all.length === 1 ? STAGE_NAMES[all[0].k] : '',
          base: one.base, segs: one.segs, pct: p.pct, health: p.health, varDays: p.varDays, code: all.length === 1 ? all[0].code : '',
          codeAt: all.length === 1 && all[0].code && isNum(all[0].ar) ? { d: all[0].ar, code: all[0].code } : null, notes: p.notes, tag: 'P', dates: all.length === 1 ? stageDates(all[0]) : null, trow: p.row, k: all[0].k
        });
        return;
      }
      var agg = itemFromStages(all, cut), whole = span(agg.segs.map(function (g) { return [g.s, g.e]; }));
      items.push({
        kind: 'project', lvl: 0, id: String(pi), label: (p.code ? p.code + ' — ' : '') + p.name, project: p, stage: '', base: agg.base, trow: p.row, agg: true,
        segs: whole ? [{ t: 'sum', s: whole[0], e: whole[1] }] : [], pct: p.pct, health: p.health, varDays: p.varDays, code: '', notes: p.notes, tag: 'P'
      });
      var ei = 0;
      els.forEach(function (e) {
        ei++;
        var used = e.stages.filter(stageHasData), eid = pi + '.' + ei;
        if (used.length <= 1) {
          var s = used[0], it = s ? itemFromStages([s], cut) : { base: null, segs: [] };
          items.push({
            kind: 'element', lvl: 1, id: eid, label: e.name, project: p, element: e, stage: s ? STAGE_NAMES[s.k] : '', base: it.base, segs: it.segs,
            pct: e.pct, health: e.health, varDays: e.varDays, code: s ? s.code : '', codeAt: s && s.code && isNum(s.ar) ? { d: s.ar, code: s.code } : null,
            notes: e.notes, tag: 'E', dates: s ? stageDates(s) : null, trow: e.row, k: s ? s.k : null
          });
        } else {
          var ag = itemFromStages(used, cut), wh = span(ag.segs.map(function (g) { return [g.s, g.e]; }));
          items.push({
            kind: 'element', lvl: 1, id: eid, label: e.name, project: p, element: e, stage: 'All stages', base: ag.base,
            segs: wh ? [{ t: 'sum', s: wh[0], e: wh[1] }] : [], pct: e.pct, health: e.health, varDays: e.varDays, code: '', notes: e.notes, tag: 'E', trow: e.row, agg: true
          });
          used.forEach(function (s, si) {
            var it2 = itemFromStages([s], cut);
            items.push({
              kind: 'stage', lvl: 2, id: eid + '.' + (si + 1), label: STAGE_LONG[s.k], project: p, element: e, stage: STAGE_NAMES[s.k], base: it2.base, segs: it2.segs,
              pct: s.pct, health: s.health, varDays: s.varDays, code: s.code, codeAt: s.code && isNum(s.ar) ? { d: s.ar, code: s.code } : null, notes: '', tag: 'S', dates: stageDates(s), trow: e.row, k: s.k
            });
          });
        }
      });
    });
    return items;
  }
  function stageDates(s) {
    return { bs: s.bs, ba: s.ba, as: s.as, ar: s.ar, fs: s.fs, fa: s.fa, ps: s.ps, pa: s.pa };
  }

  /* Date range of the chart: every bar date, the data date, a little padding. */
  function chartRange(items, cut) {
    var lo = cut, hi = cut;
    items.forEach(function (it) {
      (it.base ? [it.base] : []).concat(it.segs.map(function (g) { return [g.s, g.e]; })).forEach(function (x) { lo = Math.min(lo, x[0]); hi = Math.max(hi, x[1]); });
    });
    return [lo, hi];
  }

  return {
    EPOCH: EPOCH, STAGE_NAMES: STAGE_NAMES, STAGE_LONG: STAGE_LONG, RANK: RANK,
    isNum: isNum, numToCol: numToCol, colToNum: colToNum, fmtDate: fmtDate, serialToDate: serialToDate, dateToSerial: dateToSerial, norm: norm,
    readWorkbook: readWorkbook, recalc: recalc, buildItems: buildItems, chartRange: chartRange,
    parseSheet: parseSheet, parseSharedStrings: parseSharedStrings, locateSheets: locateSheets, readText: readText, unesc: unesc
  };
});

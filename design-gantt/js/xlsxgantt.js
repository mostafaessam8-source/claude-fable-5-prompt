/* Design Gantt — writes the Gantt chart sheet into the ORIGINAL workbook.
 *
 * The uploaded .xlsx is opened as a zip and only three things change: the "Gantt chart" worksheet part is replaced (or added),
 * styles.xml gets extra styles appended, and workbook.xml learns the print titles / active tab. Every other sheet, formula,
 * validation, conditional format and cached value is carried over byte for byte. The Gantt sheet itself is LIVE: formulas read the
 * Tracker, conditional formatting draws the bars.
 *
 *   XlsxGantt.build(zip, model, { scale: 'week'|'day'|'month', sourceName }) -> Promise<Uint8Array>
 *   XlsxGantt.layout(items, cut, scale) -> the time axis (shared with the on-screen chart)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./model.js'));
  else root.XlsxGantt = factory(root.Model);
})(typeof self !== 'undefined' ? self : this, function (M) {
  'use strict';

  var isNum = M.isNum, numToCol = M.numToCol;

  /* ---------- palette (SAR brand: teal + warm black) ---------- */
  var C = {
    teal: '00778B', tealDark: '005A6A', tealSoft: 'DDF0F4', tealMid: '8CCAD6', black: '3D3935', grey: '9AA9B3', greyDark: '5F6B73',
    band: 'F1F3F4', bandEl: 'E4F1F4', line: 'D5DADD', grid: 'ECEFF1', gridMonth: 'B8C4CA', red: 'C62828', redSoft: 'FDECEA', amber: 'E69A00',
    amberSoft: 'FFF3D6', plan: '5E35B1', planSoft: 'E8E1F5', white: 'FFFFFF', text: '263238', mute: '78909C'
  };
  var HEALTH = {
    'Completed': ['2E7D32', 'FFFFFF'], 'In Progress': ['1E6FD9', 'FFFFFF'], 'At Risk': ['F5A300', '3D2A00'],
    'Delayed': ['C62828', 'FFFFFF'], 'Not Started': ['B0BEC5', '37474F'], '-': ['ECEFF1', '78909C']
  };
  var CODE = { A: '2E7D32', B: '6AA84F', C: 'E69A00', D: 'C62828' };

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  // characters XML 1.0 cannot carry
  function clean(s) { return String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''); }

  /* ---------- time axis ---------- */
  function layout(items, cut, scale, pad) {
    var r = M.chartRange(items, cut), lo = r[0], hi = r[1], start, n, i;
    if (pad) { // room for dates to move in the live Excel chart
      var pl = scale === 'day' ? 14 : scale === 'month' ? 60 : 28, ph = scale === 'day' ? 28 : scale === 'month' ? 90 : 56;
      lo -= pl; hi += ph;
    }
    function dow(d) { return M.serialToDate(d).getUTCDay(); } // 0 = Sunday (Saudi working week starts Sunday)
    function ym(d) { var x = M.serialToDate(d); return x.getUTCFullYear() * 12 + x.getUTCMonth(); }
    function monthStart(d) { var x = M.serialToDate(d); return M.dateToSerial(new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), 1))); }
    var ax = { scale: scale, lo: lo, hi: hi };
    if (scale === 'day') {
      start = lo - 3; n = hi + 8 - start + 1;
      ax.unitOf = function (d) { return Math.floor(d - start); };
      ax.startOf = function (u) { return start + u; };
      ax.endOf = function (u) { return start + u; };
    } else if (scale === 'month') {
      var s0 = monthStart(lo), m0 = ym(s0), m1 = ym(hi) + 1;
      start = s0; n = m1 - m0 + 1;
      ax.unitOf = function (d) { return ym(d) - m0; };
      ax.startOf = function (u) { var t = m0 + u; return M.dateToSerial(new Date(Date.UTC(Math.floor(t / 12), t % 12, 1))); };
      ax.endOf = function (u) { return ax.startOf(u + 1) - 1; };
    } else {
      start = lo - 7 - dow(lo - 7); n = Math.ceil((hi + 15 - start) / 7) + 1;
      ax.unitOf = function (d) { return Math.floor((d - start) / 7); };
      ax.startOf = function (u) { return start + u * 7; };
      ax.endOf = function (u) { return start + u * 7 + 6; };
    }
    ax.n = n;
    ax.cutUnit = ax.unitOf(cut);
    // header groups: months (or years for the month scale)
    ax.groups = [];
    for (i = 0; i < n; i++) {
      var d0 = ax.startOf(i), dt = M.serialToDate(d0), key = scale === 'month' ? dt.getUTCFullYear() : dt.getUTCFullYear() * 12 + dt.getUTCMonth();
      var label = scale === 'month' ? String(dt.getUTCFullYear()) : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][dt.getUTCMonth()] + ' ' + dt.getUTCFullYear();
      var g = ax.groups[ax.groups.length - 1];
      if (g && g.key === key) g.to = i; else ax.groups.push({ key: key, from: i, to: i, label: label });
    }
    ax.subLabel = function (u) {
      var d = M.serialToDate(ax.startOf(u));
      return scale === 'month' ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()] : d.getUTCDate();
    };
    ax.isMonthStart = function (u) { return u === 0 || ax.groups.some(function (g) { return g.from === u; }); };
    return ax;
  }

  /* ---------- style book: appends fonts / fills / borders / xfs to the workbook's styles.xml ---------- */
  function StyleBook(xml) {
    var self = this;
    function count(tag) { var m = new RegExp('<' + tag + '\\b[^>]*\\bcount="(\\d+)"').exec(xml); return m ? +m[1] : 0; }
    this.xml = xml;
    this.base = { fonts: count('fonts'), fills: count('fills'), borders: count('borders'), xfs: count('cellXfs'), dxfs: count('dxfs') };
    var maxFmt = 163, m, re = /<numFmt\b[^>]*numFmtId="(\d+)"/g;
    while ((m = re.exec(xml))) maxFmt = Math.max(maxFmt, +m[1]);
    this.nextFmt = maxFmt + 1;
    this.added = { fonts: [], fills: [], borders: [], xfs: [], fmts: [], dxfs: [] };
    this.maps = { fonts: {}, fills: {}, borders: {}, xfs: {}, fmts: {}, dxfs: {} };
    function intern(kind, key, xmlFrag) {
      var mp = self.maps[kind];
      if (mp[key] != null) return mp[key];
      var idx = self.base[kind] + self.added[kind].length;
      self.added[kind].push(xmlFrag); mp[key] = idx; return idx;
    }
    function rgb(c) { return '<color rgb="FF' + c + '"/>'; }
    this.font = function (f) {
      f = f || {};
      var key = JSON.stringify(f);
      return intern('fonts', key, '<font>' + (f.b ? '<b/>' : '') + (f.i ? '<i/>' : '') + '<sz val="' + (f.sz || 9) + '"/>' + rgb(f.color || C.text) + '<name val="Calibri"/><family val="2"/></font>');
    };
    this.fill = function (f) {
      if (!f) return 0;
      var spec = typeof f === 'string' ? { fg: f } : f, key = JSON.stringify(spec);
      var frag = spec.pattern
        ? '<fill><patternFill patternType="' + spec.pattern + '"><fgColor rgb="FF' + spec.fg + '"/><bgColor rgb="FF' + spec.bg + '"/></patternFill></fill>'
        : '<fill><patternFill patternType="solid"><fgColor rgb="FF' + spec.fg + '"/><bgColor indexed="64"/></patternFill></fill>';
      return intern('fills', key, frag);
    };
    this.border = function (b) {
      if (!b) return 0;
      var key = JSON.stringify(b);
      function side(tag) { var s = b[tag]; return s ? '<' + tag + ' style="' + s[0] + '">' + rgb(s[1]) + '</' + tag + '>' : '<' + tag + '/>'; }
      return intern('borders', key, '<border>' + side('left') + side('right') + side('top') + side('bottom') + '<diagonal/></border>');
    };
    this.fmt = function (code) {
      if (!code) return 0;
      if (code === '0%') return 9;
      var mp = self.maps.fmts;
      if (mp[code] != null) return mp[code];
      var id = self.nextFmt++;
      self.added.fmts.push('<numFmt numFmtId="' + id + '" formatCode="' + esc(code) + '"/>');
      mp[code] = id; return id;
    };
    // spec: {font, fill, border, h, v, wrap, indent, shrink, fmt, rot}
    this.xf = function (sp) {
      var key = JSON.stringify(sp);
      if (self.maps.xfs[key] != null) return self.maps.xfs[key];
      var fo = self.font(sp.font), fi = self.fill(sp.fill), bo = self.border(sp.border), nf = self.fmt(sp.fmt);
      var al = '';
      if (sp.h || sp.v || sp.wrap || sp.indent || sp.shrink || sp.rot)
        al = '<alignment' + (sp.h ? ' horizontal="' + sp.h + '"' : '') + ' vertical="' + (sp.v || 'center') + '"' + (sp.wrap ? ' wrapText="1"' : '') +
          (sp.indent ? ' indent="' + sp.indent + '"' : '') + (sp.shrink ? ' shrinkToFit="1"' : '') + (sp.rot ? ' textRotation="' + sp.rot + '"' : '') + '/>';
      var frag = '<xf numFmtId="' + nf + '" fontId="' + fo + '" fillId="' + fi + '" borderId="' + bo + '" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"' + (al ? ' applyAlignment="1">' + al + '</xf>' : '/>');
      var idx = self.base.xfs + self.added.xfs.length;
      self.added.xfs.push(frag); self.maps.xfs[key] = idx; return idx;
    };
    // differential format for conditional formatting: {fill, font:{b,color}, border:{left:[style,color]}}
    this.dxf = function (sp) {
      var key = JSON.stringify(sp);
      if (self.maps.dxfs[key] != null) return self.maps.dxfs[key];
      var f = sp.font ? '<font>' + (sp.font.b ? '<b/>' : '') + (sp.font.color ? rgb(sp.font.color) : '') + '</font>' : '';
      var fl = '';
      if (sp.fill) {
        var fs = typeof sp.fill === 'string' ? { fg: sp.fill, bg: sp.fill } : sp.fill;
        fl = '<fill><patternFill' + (fs.pattern ? ' patternType="' + fs.pattern + '"' : '') + '><fgColor rgb="FF' + fs.fg + '"/><bgColor rgb="FF' + fs.bg + '"/></patternFill></fill>';
      }
      var bd = sp.border ? '<border><left style="' + sp.border.left[0] + '">' + rgb(sp.border.left[1]) + '</left></border>' : '';
      var idx = self.base.dxfs + self.added.dxfs.length;
      self.added.dxfs.push('<dxf>' + f + fl + bd + '</dxf>'); self.maps.dxfs[key] = idx; return idx;
    };
    this.toXml = function () {
      var out = xml;
      function bump(tag, kind) {
        var add = self.added[kind];
        if (!add.length) return;
        var re = new RegExp('(<' + tag + '\\b[^>]*\\bcount=")(\\d+)(")'), cnt = self.base[kind] + add.length;
        out = out.replace(re, '$1' + cnt + '$3').replace('</' + tag + '>', add.join('') + '</' + tag + '>');
      }
      bump('fonts', 'fonts'); bump('fills', 'fills'); bump('borders', 'borders'); bump('cellXfs', 'xfs');
      if (self.added.dxfs.length) {
        if (/<dxfs\b[^>]*\/>/.test(out)) out = out.replace(/<dxfs\b[^>]*\/>/, '<dxfs count="' + self.added.dxfs.length + '">' + self.added.dxfs.join('') + '</dxfs>');
        else if (/<dxfs\b/.test(out)) bump('dxfs', 'dxfs');
        else out = out.replace('</styleSheet>', '<dxfs count="' + self.added.dxfs.length + '">' + self.added.dxfs.join('') + '</dxfs></styleSheet>');
      }
      if (self.added.fmts.length) {
        if (/<numFmts\b/.test(out)) {
          var n = (/<numFmts\b[^>]*\bcount="(\d+)"/.exec(out) || [0, 0])[1];
          out = out.replace(/(<numFmts\b[^>]*\bcount=")(\d+)(")/, '$1' + (+n + self.added.fmts.length) + '$3').replace('</numFmts>', self.added.fmts.join('') + '</numFmts>');
        } else out = out.replace(/(<styleSheet\b[^>]*>)/, '$1<numFmts count="' + self.added.fmts.length + '">' + self.added.fmts.join('') + '</numFmts>');
      }
      return out;
    };
  }

  /* ---------- sheet builder ----------
   * Every number on the sheet is a formula that reads the Tracker sheet, and every bar is conditional formatting that reads
   * the date helper columns on the right of the chart. Change a date in the Tracker and the chart redraws itself.
   * What is fixed when the sheet is generated: which projects / elements / design stages get a line, and the time axis range.
   */
  var COLS = { id: 1, name: 2, stage: 3, line: 4, start: 5, finish: 6, code: 7, pct: 8, health: 9, varDays: 10, notes: 11 };
  var TL0 = 12; // first timeline column
  var WIDTHS = [6.5, 46, 11, 12, 10.5, 10.5, 5.5, 6.5, 11, 7, 34];
  var HEAD_ROWS = 9; // last header row; data starts below
  var H = { BS: 0, BE: 1, AS: 2, AE: 3, RS: 4, RE: 5, FS: 6, FE: 7, PS: 8, PE: 9, SS: 10, SE: 11, CD: 12, Y: 13, W: 14, WP: 15, WD: 16, KIND: 17 };
  var H_LABELS = ['Base start', 'Base end', 'Actual start', 'Actual end', 'Review start', 'Review end', 'Fcst start', 'Fcst end', 'Plan start', 'Plan end', 'Roll-up start', 'Roll-up end', 'Code date', 'Counts as', 'Weight', 'Weight × %', 'Weight (if %)', 'Row kind'];
  var DAYS_PER_UNIT = { day: 0, week: 6 }; // unit end = unit start + n

  function absRef(a1) { var m = /^([A-Z]+)(\d+)$/.exec(a1); return '$' + m[1] + '$' + m[2]; }
  function q(name) { return "'" + String(name).replace(/'/g, "''") + "'!"; }

  function buildSheet(sb, model, items, o) {
    var cut = model.meta.cut, ax = layout(items, cut, o.scale, true), st = model.stats, meta = model.meta, refs = meta.refs || { w: [] };
    var TR = q(model.layout.sheet), lay = model.layout;
    var unitW = o.scale === 'day' ? 1.45 : o.scale === 'month' ? 8 : 2.8;
    var lastCol = TL0 + ax.n - 1, HC0 = lastCol + 2, rows = {}, merges = [], rowMeta = {};
    function hc(i) { return HC0 + i; }
    function hl(i) { return numToCol(HC0 + i); }
    function cell(r, c, v, spec, f) { (rows[r] = rows[r] || {})[c] = { v: v, s: spec ? sb.xf(spec) : 0, f: f }; }
    function styleOnly(r, c, spec) { var ex = rows[r] && rows[r][c]; cell(r, c, ex ? ex.v : null, spec, ex ? ex.f : undefined); }
    function merge(r1, c1, r2, c2) { if (r1 !== r2 || c1 !== c2) merges.push(numToCol(c1) + r1 + ':' + numToCol(c2) + r2); }
    function meta_(r, h, outline) { rowMeta[r] = { h: h, outline: outline || 0 }; }
    var thin = function (c) { return ['thin', c]; };
    var DD = '$C$7';
    function ctl(key, fallback) { return refs[key] ? TR + absRef(refs[key]) : String(fallback); }
    var winRef = ctl('win', meta.window);
    function wRef(k) { return refs.w && refs.w[k] ? TR + absRef(refs.w[k]) : String(meta.weights[k]); }
    var firstTl = numToCol(TL0), lastTl = numToCol(lastCol);
    function UE(col) { return o.scale === 'month' ? 'EOMONTH(' + col + '$9,0)' : col + '$9' + (o.scale === 'week' ? '+6' : ''); }

    /* ---- phase 1: give every item its rows ---- */
    var r = HEAD_ROWS + 1;
    items.forEach(function (it, ix) {
      it.hasBase = !!it.base; it.r1 = r; it.r2 = r + (it.hasBase ? 1 : 0); it.ra = it.r2; // ra = the actual/forecast row
      r = it.r2 + 1;
    });
    var R0 = HEAD_ROWS + 1, lastData = r - 1;
    items.forEach(function (it, ix) { // descendants = the following deeper items
      var j = ix + 1; while (j < items.length && items[j].lvl > it.lvl) j++;
      it.kids = items.slice(ix + 1, j);
      it.da = it.kids.length ? it.kids[0].r1 : null; it.db = it.kids.length ? it.kids[it.kids.length - 1].r2 : null;
    });
    function rng(col, it) { return col + it.da + ':' + col + it.db; }

    /* ---- title + KPI + legend ---- */
    var bandSpec = { font: { sz: 18, b: true, color: C.white }, fill: C.teal, h: 'left', indent: 1 };
    for (var c = 1; c <= lastCol; c++) styleOnly(1, c, bandSpec);
    cell(1, 1, 'DESIGN SUBMISSION — GANTT CHART', bandSpec); merge(1, 1, 1, lastCol); meta_(1, 32);
    var subSpec = { font: { sz: 9, color: C.white }, fill: C.black, h: 'left', indent: 1 };
    for (c = 1; c <= lastCol; c++) styleOnly(2, c, subSpec);
    var sub = 'Saudi Arabia Railways  |  Programme Controls   ·   Live chart: every figure and bar is driven by the dates in the "' + lay.sheet + '" sheet   ·   Source file: ' + (o.sourceName || lay.sheet);
    cell(2, 1, sub, subSpec); merge(2, 1, 2, lastCol); meta_(2, 16);
    meta_(3, 6);

    function rngY() { return '$' + hl(H.Y) + '$' + R0 + ':$' + hl(H.Y) + '$' + lastData; }
    function rngC(col) { return '$' + col + '$' + R0 + ':$' + col + '$' + lastData; }
    var yS = rngY(), iR = rngC('I'), gR = rngC('G');
    function cnt(h) { return 'COUNTIFS(' + yS + ',"*S",' + iR + ',"' + h + '")'; }
    function pctTxt(v) { return v == null ? '' : Math.round(v * 100) + '%'; }
    var cards = [
      [1, 2, 'PROGRAMME PROGRESS (weighted)', '=IF(SUM(' + rngC(hl(H.WD)) + ')=0,"",SUM(' + rngC(hl(H.WP)) + ')/SUM(' + rngC(hl(H.WD)) + '))', st.programmePct, C.teal, '0%'],
      [3, 4, 'PROJECTS  /  ELEMENTS', '=COUNTIF(' + yS + ',"P*")&"  /  "&(COUNTIF(' + yS + ',"E*")+COUNTIF(' + yS + ',"PS"))', st.projects + '  /  ' + st.elements, C.black],
      [5, 6, 'COMPLETED', '=' + cnt('Completed'), st.health['Completed'], HEALTH['Completed'][0]],
      [7, 8, 'IN PROGRESS', '=' + cnt('In Progress'), st.health['In Progress'], HEALTH['In Progress'][0]],
      [9, 10, 'AT RISK', '=' + cnt('At Risk'), st.health['At Risk'], HEALTH['At Risk'][0]],
      [11, 11, 'DELAYED', '=' + cnt('Delayed'), st.health['Delayed'], HEALTH['Delayed'][0]]
    ];
    cards.forEach(function (cd) {
      var lab = { font: { sz: 8, b: true, color: C.white }, fill: cd[5], h: 'center', border: { left: thin(C.white), right: thin(C.white) } };
      var val = { font: { sz: 20, b: true, color: cd[5] }, fill: C.band, h: 'center', border: { left: thin(C.white), right: thin(C.white), bottom: ['medium', cd[5]] }, fmt: cd[6] };
      for (var cc = cd[0]; cc <= cd[1]; cc++) { styleOnly(4, cc, lab); styleOnly(5, cc, val); }
      cell(4, cd[0], cd[2], lab); cell(5, cd[0], cd[4], val, cd[3].slice(1)); merge(4, cd[0], 4, cd[1]); merge(5, cd[0], 5, cd[1]);
    });
    meta_(4, 15); meta_(5, 30);
    var info = { font: { sz: 8.5, color: C.mute, i: true }, h: 'left', indent: 1 };
    var wTxt = [0, 1, 2].map(function (k) { return '"' + M.STAGE_NAMES[k] + ' "&TEXT(' + wRef(k) + ',"0%")'; }).join('&" / "&');
    var infoF = '"Card counts = design-stage items (as in the Tracker summary)   ·   Not started "&' + cnt('Not Started') +
      '&"   ·   Open Code C / D "&(COUNTIFS(' + yS + ',"*S",' + gR + ',"C")+COUNTIFS(' + yS + ',"*S",' + gR + ',"D"))&"   ·   Approved Code A "&COUNTIFS(' + yS + ',"*S",' + gR + ',"A")' +
      '&"   ·   Latest forecast close "&IF(COUNT(' + rngC(hl(H.FE)) + ',' + rngC(hl(H.PE)) + ')=0,"—",TEXT(MAX(' + rngC(hl(H.FE)) + ',' + rngC(hl(H.PE)) + '),"dd-mmm-yy"))&"   ·   Stage weights "&' + wTxt;
    cell(6, 1, 'Card counts = design-stage items (as in the Tracker summary)   ·   Not started ' + st.health['Not Started'] + '   ·   Open Code C / D ' + st.openCD + '   ·   Approved Code A ' + st.approved +
      '   ·   Latest forecast close ' + (st.latestClose ? M.fmtDate(st.latestClose) : '—') + '   ·   Stage weights ' + meta.weights.map(function (w, i) { return M.STAGE_NAMES[i] + ' ' + Math.round(w * 100) + '%'; }).join(' / '), info, infoF);
    merge(6, 1, 6, 11); meta_(6, 14);

    var legend = [
      ['Baseline', { fill: C.grey }, C.white], ['Actual (SAR reviewed)', { fill: C.teal }, C.white],
      ['Under SAR review', { fill: { pattern: 'darkUp', fg: C.amber, bg: C.amberSoft } }, C.text],
      ['Forecast', { fill: { pattern: 'lightUp', fg: C.teal, bg: C.tealSoft } }, C.text],
      ['Current plan', { fill: { pattern: 'lightDown', fg: C.plan, bg: C.planSoft } }, C.text],
      ['Code A', { fill: CODE.A }, C.white], ['Code B', { fill: CODE.B }, C.white], ['Code C', { fill: CODE.C }, C.white], ['Code D', { fill: CODE.D }, C.white],
      ['Data date', { fill: C.red }, C.white]
    ];
    var chipCols = Math.max(2, Math.ceil(17 / unitW)), lr = 4, lc = TL0;
    legend.forEach(function (lg) {
      if (lc + chipCols - 1 > lastCol) { lr++; lc = TL0; }
      if (lr > 5) return;
      var sp = { font: { sz: 8, b: true, color: lg[2] }, fill: lg[1].fill, h: 'center', border: { left: thin(C.white), right: thin(C.white), top: thin(C.white), bottom: thin(C.white) } };
      for (var cc = lc; cc < lc + chipCols; cc++) styleOnly(lr, cc, sp);
      cell(lr, lc, lg[0], sp); merge(lr, lc, lr, lc + chipCols - 1);
      lc += chipCols;
    });

    /* data date row: the value comes from the Tracker's control panel; the flag in the timeline is conditional formatting */
    meta_(7, 14);
    var ddLab = { font: { sz: 9, b: true, color: C.red }, h: 'right' };
    cell(7, 1, 'DATA DATE (from ' + lay.sheet + ')  ▶', ddLab, undefined); merge(7, 1, 7, 2);
    cell(7, 3, cut, { font: { sz: 10, b: true, color: C.white }, fill: C.red, h: 'center', fmt: 'dd\\-mmm\\-yy' }, ctl('dd', 'DATE(' + M.serialToDate(cut).getUTCFullYear() + ',' + (M.serialToDate(cut).getUTCMonth() + 1) + ',' + M.serialToDate(cut).getUTCDate() + ')'));
    cell(2, 1, sub + '   ·   Data date ' + M.fmtDate(cut), subSpec, '"Saudi Arabia Railways  |  Programme Controls   ·   Live chart: every figure and bar is driven by the dates in the \'' + lay.sheet.replace(/"/g, '""') + '\' sheet   ·   Source file: ' + String(o.sourceName || lay.sheet).replace(/"/g, '""') + '   ·   Data date "&TEXT($C$7,"dd-mmm-yy")');

    /* headers */
    var hSpec = { font: { sz: 9, b: true, color: C.white }, fill: C.teal, h: 'center', wrap: true, border: { left: thin(C.white), right: thin(C.white), bottom: thin(C.white) } };
    ['ID', 'Project  /  Element  /  Design stage', 'Stage', 'Line', 'Start', 'Finish', 'SAR code', '%', 'Health', 'Var (d)', 'Remarks'].forEach(function (h, i) {
      var cc = i + 1;
      styleOnly(8, cc, hSpec); styleOnly(9, cc, hSpec);
      cell(8, cc, h, i === 1 || i === 10 ? Object.assign({}, hSpec, { h: 'left', indent: 1 }) : hSpec); merge(8, cc, 9, cc);
    });
    ax.groups.forEach(function (g, gi) {
      var sp = { font: { sz: 9, b: true, color: C.white }, fill: gi % 2 ? C.tealDark : C.teal, h: 'center', border: { left: thin(C.white) } };
      for (var uu = g.from; uu <= g.to; uu++) styleOnly(8, TL0 + uu, sp);
      cell(8, TL0 + g.from, g.label, sp, 'TEXT(' + numToCol(TL0 + g.from) + '9,"' + (o.scale === 'month' ? 'yyyy' : 'mmm yyyy') + '")'); if (g.to > g.from) merge(8, TL0 + g.from, 8, TL0 + g.to);
    });
    var uFmt = o.scale === 'month' ? 'mmm' : 'd';
    for (var u2 = 0; u2 < ax.n; u2++) {
      var sp2 = { font: { sz: o.scale === 'day' ? 6 : 7.5, color: C.text }, fill: 'E3EAED', h: 'center', border: { left: thin(ax.isMonthStart(u2) ? C.gridMonth : C.white) }, shrink: true, fmt: uFmt };
      var prev = numToCol(TL0 + u2 - 1);
      cell(9, TL0 + u2, ax.startOf(u2), sp2, u2 === 0 ? undefined : o.scale === 'month' ? 'EDATE(' + prev + '9,1)' : prev + '9+' + (o.scale === 'week' ? 7 : 1));
    }
    meta_(8, 17); meta_(9, 16);
    H_LABELS.forEach(function (lbl, i) {
      var sp = { font: { sz: 8, b: true, color: C.white }, fill: C.greyDark, h: 'center', wrap: true, border: { left: thin(C.white) } };
      styleOnly(8, hc(i), sp); styleOnly(9, hc(i), sp); cell(8, hc(i), lbl, sp); merge(8, hc(i), 9, hc(i));
    });

    /* ---- phase 2: the lines ---- */
    function bandFor(it) { return it.kind === 'project' ? C.band : it.kind === 'element' ? 'F6FAFB' : null; }
    function tlBase(u, band, lastOfItem) {
      var b = { left: thin(ax.isMonthStart(u) ? C.gridMonth : C.grid) };
      if (lastOfItem) b.bottom = thin(C.line);
      return { fill: band, border: b };
    }
    var dFmt = 'dd\\-mmm\\-yy';
    var elemRows = [];
    items.forEach(function (it) {
      var hasBase = it.hasBase, r1 = it.r1, r2 = it.r2, ra = it.ra, outline = it.lvl;
      var proj = it.kind === 'project', band = bandFor(it), kindLetter = proj ? 'P' : it.kind === 'element' ? 'E' : 'S';
      var tableFill = proj ? C.black : it.kind === 'element' ? C.bandEl : C.white;
      var tcol = proj ? C.white : C.text;
      for (var rr = r1; rr <= r2; rr++) meta_(rr, hasBase ? (rr === r1 ? 13 : 16) : 19, outline);
      function tspec(extra) { return Object.assign({ font: { sz: 9, b: proj || it.kind === 'element', color: tcol }, fill: tableFill, v: 'center', border: { left: thin(C.line), right: thin(C.line) } }, extra || {}); }
      function put(row, col, v, extra, f) {
        var sp = tspec(extra); if (row === r2) sp.border = Object.assign({}, sp.border, { bottom: thin(proj ? C.black : C.line) });
        cell(row, col, v, sp, f);
      }
      for (rr = r1; rr <= r2; rr++) for (c = 1; c <= 11; c++) put(rr, c, null, { h: c === 2 ? 'left' : 'center' });

      var leaf = !it.agg && it.k != null, trow = it.trow, sg = leaf ? lay.stages.filter(function (x) { return x.k === it.k; })[0] : null;
      function tc(key) { return sg && sg.f[key] ? TR + sg.f[key] + trow : TR + '$XFD$1'; }
      var codeC = leaf ? tc('code') + '&""' : null;
      var mutedC = proj ? 'D7E6EA' : C.mute;

      // identity columns
      put(r1, COLS.id, it.id, { h: 'center', font: { sz: 8.5, b: true, color: proj ? C.white : C.mute } });
      var nameSpec = { h: 'left', wrap: true, indent: it.lvl * 2 + 1, font: { sz: proj ? 10 : 9, b: proj || it.kind === 'element', color: tcol } };
      var nameF = null;
      if (trow && it.kind === 'project') nameF = 'IF(' + TR + lay.g.code + trow + '="","",' + TR + lay.g.code + trow + '&" — ")&' + TR + lay.g.name + trow;
      else if (trow && it.kind === 'element') nameF = TR + lay.g.name + trow + '&""';
      put(r1, COLS.name, clean(it.label), nameSpec, nameF || undefined);
      put(r1, COLS.stage, it.stage, { h: 'center', font: { sz: 8.5, color: proj ? 'D7E6EA' : C.mute } });
      if (it.notes !== undefined && it.kind !== 'stage' && trow && lay.g.notes)
        put(r1, COLS.notes, clean(it.notes || ''), { h: 'left', wrap: true, indent: 1, font: { sz: 8, color: mutedC } }, TR + lay.g.notes + trow + '&""');

      // line labels, start / finish
      var lineSpec = { h: 'center', font: { sz: 8, color: proj ? 'B8C4CA' : C.mute } };
      if (hasBase) {
        put(r1, COLS.line, 'Baseline', lineSpec);
        put(r1, COLS.start, it.base[0], { h: 'center', fmt: dFmt, font: { sz: 8.5, color: mutedC } }, 'IF(' + hl(H.BS) + r1 + '="","",' + hl(H.BS) + r1 + ')');
        put(r1, COLS.finish, it.base[1], { h: 'center', fmt: dFmt, font: { sz: 8.5, color: mutedC } }, 'IF(' + hl(H.BE) + r1 + '="","",' + hl(H.BE) + r1 + ')');
      }
      var aS = null, aE = null; it.segs.forEach(function (g) { aS = aS == null ? g.s : Math.min(aS, g.s); aE = aE == null ? g.e : Math.max(aE, g.e); });
      put(ra, COLS.line, it.segs.length || leaf || it.agg ? 'Actual / Fcst' : 'No dates yet', { h: 'center', font: { sz: 8, b: true, color: proj ? C.white : C.tealDark } });
      var actRange = hl(H.AS) + ra + ':' + hl(H.SE) + ra;
      if (leaf || it.agg) {
        put(ra, COLS.start, aS == null ? '' : aS, { h: 'center', fmt: dFmt, font: { sz: 8.5, b: true, color: tcol } }, 'IF(COUNT(' + actRange + ')=0,"",MIN(' + actRange + '))');
        put(ra, COLS.finish, aE == null ? '' : aE, { h: 'center', fmt: dFmt, font: { sz: 8.5, b: true, color: tcol } }, 'IF(COUNT(' + actRange + ')=0,"",MAX(' + actRange + '))');
      }

      /* right-hand facts + helper dates */
      var G_ = '$G$' + r1, Hh = '$H$' + r1, I_ = '$I$' + r1;
      function hput(row, i, v, f) { cell(row, hc(i), v, { font: { sz: 8, color: C.mute }, h: 'center', fmt: i <= H.CD ? dFmt : undefined, border: { bottom: thin(C.grid) } }, f); }
      function segOf(types) { var x = it.segs.filter(function (g) { return types.indexOf(g.t) >= 0; })[0]; return x || null; }
      var healthF = null, pctF = null, varF = null, codeF = null;
      if (leaf) {
        var A = tc('as'), AR = tc('ar'), BS = tc('bs'), BA = tc('ba'), FS = tc('fs'), FA = tc('fa'), PS = tc('ps'), PA = tc('pa');
        var cnt0 = 'AND(COUNT(' + [BS, BA, A, AR, tc('fs'), tc('fa')].join(',') + ')=0,LEN(' + codeC + ')=0)';
        codeF = codeC;
        pctF = 'IF(' + cnt0 + ',"",IF(' + codeC + '="A",' + ctl('A', 1) + ',IF(' + codeC + '="B",' + ctl('B', 0.9) + ',IF(' + codeC + '="C",' + ctl('C', 0.7) + ',IF(' + codeC + '="D",' + ctl('D', 0.5) + ',IF(ISNUMBER(' + A + '),' + ctl('sub', 0.6) + ',0))))))';
        var open = 'OR(' + codeC + '="",' + codeC + '="C",' + codeC + '="D")';
        var late = 'OR(AND(NOT(ISNUMBER(' + A + ')),IF(ISNUMBER(' + BS + '),' + BS + '<' + DD + ',FALSE)),AND(' + open + ',IF(ISNUMBER(' + BA + '),' + BA + '<' + DD + ',FALSE)))';
        var risk = 'OR(AND(NOT(ISNUMBER(' + A + ')),IF(ISNUMBER(' + BS + '),' + BS + '-' + DD + '<=' + winRef + ',FALSE)),AND(' + open + ',IF(ISNUMBER(' + BA + '),' + BA + '-' + DD + '<=' + winRef + ',FALSE)))';
        healthF = 'IF(' + Hh + '="","-",IF(' + Hh + '>=1,"Completed",IF(' + late + ',"Delayed",IF(' + risk + ',"At Risk",IF(AND(NOT(ISNUMBER(' + A + ')),NOT(ISNUMBER(' + AR + '))),"Not Started","In Progress")))))';
        varF = 'IF(NOT(ISNUMBER(' + BA + ')),"",IF(AND(ISNUMBER(' + AR + '),OR(' + codeC + '="A",' + codeC + '="B")),' + AR + '-' + BA + ',IF(ISNUMBER(' + FA + '),' + FA + '-' + BA + ',' + DD + '-' + BA + ')))';
        var done = 'OR(' + codeC + '="A",' + codeC + '="B")';
        // helper dates
        if (hasBase) { hput(r1, H.BS, it.base ? it.base[0] : '', 'IF(COUNT(' + BS + ',' + BA + ')=0,"",MIN(' + BS + ',' + BA + '))'); hput(r1, H.BE, it.base ? it.base[1] : '', 'IF(COUNT(' + BS + ',' + BA + ')=0,"",MAX(' + BS + ',' + BA + '))'); }
        var ac = segOf(['actual']), rv = segOf(['review']), fc = segOf(['forecast', 'fmile']), pl = segOf(['plan']);
        hput(ra, H.AS, ac ? ac.s : '', 'IF(ISNUMBER(' + AR + '),MIN(' + A + ',' + AR + '),"")'); hput(ra, H.AE, ac ? ac.e : '', 'IF(ISNUMBER(' + AR + '),MAX(' + A + ',' + AR + '),"")');
        hput(ra, H.RS, rv ? rv.s : '', 'IF(AND(ISNUMBER(' + A + '),NOT(ISNUMBER(' + AR + '))),' + A + ',"")'); hput(ra, H.RE, rv ? rv.e : '', 'IF(' + hl(H.RS) + ra + '="","",MAX(' + hl(H.RS) + ra + ',' + DD + '))');
        hput(ra, H.FS, fc ? fc.s : '', 'IF(OR(' + done + ',COUNT(' + FS + ',' + FA + ')=0),"",MIN(' + FS + ',' + FA + '))'); hput(ra, H.FE, fc ? fc.e : '', 'IF(OR(' + done + ',COUNT(' + FS + ',' + FA + ')=0),"",MAX(' + FS + ',' + FA + '))');
        hput(ra, H.PS, pl ? pl.s : '', 'IF(OR(' + done + ',COUNT(' + PS + ',' + PA + ')=0),"",MIN(' + PS + ',' + PA + '))'); hput(ra, H.PE, pl ? pl.e : '', 'IF(OR(' + done + ',COUNT(' + PS + ',' + PA + ')=0),"",MAX(' + PS + ',' + PA + '))');
        hput(ra, H.CD, it.codeAt ? it.codeAt.d : '', 'IF(ISNUMBER(' + AR + '),' + AR + ',"")');
        hput(r1, H.Y, it.kind === 'project' ? 'PS' : it.kind === 'element' ? 'ES' : 'S');
        hput(r1, H.W, meta.weights[it.k], wRef(it.k));
        hput(r1, H.WP, it.pct != null ? it.pct * meta.weights[it.k] : '', 'IF(ISNUMBER(' + Hh + '),' + hl(H.W) + r1 + '*' + Hh + ',"")');
        hput(r1, H.WD, it.pct != null ? meta.weights[it.k] : '', 'IF(ISNUMBER(' + Hh + '),' + hl(H.W) + r1 + ',"")');
      } else if (it.agg && it.kids.length) {
        // roll-ups over the lines beneath
        var a = it.da, b = it.db, rl = function (col) { return col + a + ':' + col + b; };
        var kidsS = it.kids.filter(function (x) { return !x.agg && x.k != null; });
        if (hasBase) { hput(r1, H.BS, it.base[0], 'IF(COUNT(' + rl(hl(H.BS)) + ')=0,"",MIN(' + rl(hl(H.BS)) + '))'); hput(r1, H.BE, it.base[1], 'IF(COUNT(' + rl(hl(H.BE)) + ')=0,"",MAX(' + rl(hl(H.BE)) + '))'); }
        var rolled = it.segs[0];
        var span = hl(H.AS) + a + ':' + hl(H.SE) + b;
        hput(ra, H.SS, rolled ? rolled.s : '', 'IF(COUNT(' + span + ')=0,"",MIN(' + span + '))'); hput(ra, H.SE, rolled ? rolled.e : '', 'IF(COUNT(' + span + ')=0,"",MAX(' + span + '))');
        hput(r1, H.Y, kindLetter);
        if (it.kind === 'element') {
          var num = kidsS.map(function (x) { return 'IF(ISNUMBER($H$' + x.r1 + '),' + wRef(x.k) + '*$H$' + x.r1 + ',0)'; }).join('+');
          var den = kidsS.map(function (x) { return 'IF(ISNUMBER($H$' + x.r1 + '),' + wRef(x.k) + ',0)'; }).join('+');
          pctF = kidsS.length ? 'IF(' + den + '=0,"",(' + num + ')/(' + den + '))' : null;
        } else {
          var els = it.kids.filter(function (x) { return x.lvl === 1; });
          pctF = els.length ? 'IFERROR(AVERAGE(' + els.map(function (x) { return '$H$' + x.r1; }).join(',') + '),"")' : null;
        }
        var ir = '$I$' + a + ':$I$' + b, u = ['Completed', 'In Progress', 'At Risk', 'Delayed', 'Not Started'].map(function (h) { return 'COUNTIF(' + ir + ',"' + h + '")'; }).join('+');
        healthF = 'IF(' + u + '=0,"-",IF(AND(ISNUMBER(' + Hh + '),' + Hh + '>=1),"Completed",IF(COUNTIF(' + ir + ',"Delayed")>0,"Delayed",IF(COUNTIF(' + ir + ',"At Risk")>0,"At Risk",IF(OR(N(' + Hh + ')=0,COUNTIF(' + ir + ',"Not Started")=' + u + '),"Not Started","In Progress")))))';
        varF = 'IF(COUNT($J$' + a + ':$J$' + b + ')=0,"",MAX($J$' + a + ':$J$' + b + '))';
      }
      if (it.kind !== 'stage' || true) { /* kind marker on both rows, for the conditional formats */ }
      if (!(leaf || (it.agg && it.kids.length))) hput(r1, H.Y, kindLetter); // lines with no formulas still count as projects / elements
      for (rr = r1; rr <= r2; rr++) hput(rr, H.KIND, kindLetter);

      if (it.code || codeF) put(r1, COLS.code, it.code || '', { h: 'center', font: { sz: 10, b: true, color: C.white } }, codeF || undefined);
      if (pctF || it.pct != null) put(r1, COLS.pct, it.pct == null ? '' : it.pct, { h: 'center', fmt: '0%', font: { sz: 9, b: true, color: proj ? C.white : C.teal } }, pctF || undefined);
      if (healthF || (it.health && it.health !== '-')) put(r1, COLS.health, it.health || '-', { h: 'center', font: { sz: 8.5, b: true, color: C.white } }, healthF || undefined);
      if (varF || it.varDays != null) put(r1, COLS.varDays, it.varDays == null ? '' : it.varDays, { h: 'center', fmt: '+0;-0;0', font: { sz: 9, b: true, color: tcol } }, varF || undefined);
      if (hasBase) [COLS.id, COLS.name, COLS.stage, COLS.code, COLS.pct, COLS.health, COLS.varDays, COLS.notes].forEach(function (cc) { merge(r1, cc, r2, cc); });

      // timeline grid (bars come from conditional formatting); the code letter is a formula
      for (rr = r1; rr <= r2; rr++) for (var uu = 0; uu < ax.n; uu++) styleOnly(rr, TL0 + uu, tlBase(uu, band, rr === r2));
      if (leaf) for (uu = 0; uu < ax.n; uu++) {
        var colL = numToCol(TL0 + uu), cu = it.codeAt ? ax.unitOf(it.codeAt.d) : -9;
        cell(ra, TL0 + uu, uu === cu ? it.codeAt.code : '', Object.assign(tlBase(uu, band, ra === r2), { h: 'center', font: { sz: 8, b: true, color: C.white } }),
          'IF(AND(ISNUMBER($' + hl(H.CD) + ra + '),$' + hl(H.CD) + ra + '>=' + colL + '$9,$' + hl(H.CD) + ra + '<=' + UE(colL) + '),' + G_ + ',"")');
      }
    });

    /* ---- conditional formatting ---- */
    var pri = 1, cfBlocks = [];
    function cfRule(sqref, formula, dxf, type, op) {
      var blk = cfBlocks.filter(function (x) { return x.sqref === sqref; })[0];
      if (!blk) { blk = { sqref: sqref, rules: [] }; cfBlocks.push(blk); }
      blk.rules.push('<cfRule type="' + (type || 'expression') + '" dxfId="' + dxf + '" priority="' + (pri++) + '"' + (op ? ' operator="' + op + '"' : '') + '><formula>' + esc(formula) + '</formula></cfRule>');
    }
    var TLr = firstTl + R0 + ':' + lastTl + lastData, T0 = firstTl;
    function ov(a, b) { return 'AND(ISNUMBER($' + hl(a) + R0 + '),ISNUMBER($' + hl(b) + R0 + '),$' + hl(a) + R0 + '<=' + UE(T0) + ',$' + hl(b) + R0 + '>=' + T0 + '$9)'; }
    var kindCol = '$' + hl(H.KIND) + R0;
    var CODE_KEYS = ['A', 'B', 'C', 'D'];
    CODE_KEYS.forEach(function (k) { cfRule(TLr, 'AND(LEN(' + T0 + R0 + ')=1,' + T0 + R0 + '="' + k + '")', sb.dxf({ fill: CODE[k], font: { b: true, color: C.white } })); });
    cfRule(TLr, 'AND(' + kindCol + '="P",' + ov(H.SS, H.SE) + ')', sb.dxf({ fill: C.black }));
    cfRule(TLr, 'AND(' + kindCol + '="E",' + ov(H.SS, H.SE) + ')', sb.dxf({ fill: C.tealDark }));
    cfRule(TLr, ov(H.AS, H.AE), sb.dxf({ fill: C.teal }));
    cfRule(TLr, ov(H.RS, H.RE), sb.dxf({ fill: { pattern: 'darkUp', fg: C.amber, bg: C.amberSoft } }));
    cfRule(TLr, ov(H.PS, H.PE), sb.dxf({ fill: { pattern: 'lightDown', fg: C.plan, bg: C.planSoft } }));
    cfRule(TLr, ov(H.FS, H.FE), sb.dxf({ fill: { pattern: 'lightUp', fg: C.teal, bg: C.tealSoft } }));
    cfRule(TLr, 'AND(' + kindCol + '="P",' + ov(H.BS, H.BE) + ')', sb.dxf({ fill: C.greyDark }));
    cfRule(TLr, ov(H.BS, H.BE), sb.dxf({ fill: C.grey }));
    var ddTest = 'AND($C$7>=' + T0 + '$9,$C$7<=' + UE(T0) + ')';
    cfRule(TLr, ddTest, sb.dxf({ fill: C.redSoft, border: { left: ['thin', C.red] } }));
    cfRule(firstTl + '7:' + lastTl + '7', ddTest, sb.dxf({ fill: C.red }));
    cfRule(firstTl + '9:' + lastTl + '9', ddTest, sb.dxf({ fill: C.red, font: { b: true, color: C.white } }));
    // table side: health, SAR code, variance
    var Ir = 'I' + R0 + ':I' + lastData, Gr = 'G' + R0 + ':G' + lastData, Jr = 'J' + R0 + ':J' + lastData;
    Object.keys(HEALTH).forEach(function (hk) { if (hk !== '-') cfRule(Ir, '"' + hk + '"', sb.dxf({ fill: HEALTH[hk][0], font: { b: true, color: HEALTH[hk][1] } }), 'cellIs', 'equal'); });
    CODE_KEYS.forEach(function (k) { cfRule(Gr, '"' + k + '"', sb.dxf({ fill: CODE[k], font: { b: true, color: C.white } }), 'cellIs', 'equal'); });
    var kc = '$' + hl(H.KIND) + R0;
    cfRule(Jr, 'AND(ISNUMBER(J' + R0 + '),J' + R0 + '>0,' + kc + '="P")', sb.dxf({ font: { b: true, color: 'FF8A80' } }));
    cfRule(Jr, 'AND(ISNUMBER(J' + R0 + '),J' + R0 + '<=0,' + kc + '="P")', sb.dxf({ font: { b: true, color: '9CD6A0' } }));
    cfRule(Jr, 'AND(ISNUMBER(J' + R0 + '),J' + R0 + '>0)', sb.dxf({ font: { b: true, color: C.red } }));
    cfRule(Jr, 'AND(ISNUMBER(J' + R0 + '),J' + R0 + '<=0)', sb.dxf({ font: { b: true, color: '2E7D32' } }));

    /* ---- checks + notes under the chart (a snapshot taken when the sheet was generated) ---- */
    r = lastData + 1;
    meta_(r, 8); r++;
    var secSpec = { font: { sz: 11, b: true, color: C.white }, fill: C.black, h: 'left', indent: 1 };
    for (c = 1; c <= 11; c++) styleOnly(r, c, secSpec);
    cell(r, 1, 'PLANNER’S DATA CHECKS   —   snapshot when this sheet was generated; fix in the Tracker, then re-run the site to refresh', secSpec); merge(r, 1, r, 11); meta_(r, 20); r++;
    var shown = model.checks.filter(function (k) { return k.sev !== 'info'; }), infos = model.checks.length - shown.length;
    if (!shown.length) { cell(r, 1, 'No date errors or warnings found.', { font: { sz: 9, color: '2E7D32', b: true }, h: 'left', indent: 1 }); merge(r, 1, r, 11); meta_(r, 16); r++; }
    shown.slice(0, 250).forEach(function (k) {
      var col = k.sev === 'error' ? 'C62828' : 'B26A00';
      var sv = { font: { sz: 8, b: true, color: C.white }, fill: col, h: 'center', border: { bottom: thin(C.line) } };
      var tx = { font: { sz: 8.5, color: C.text }, h: 'left', indent: 1, wrap: true, border: { bottom: thin(C.line) } };
      cell(r, 1, k.sev === 'error' ? 'ERROR' : 'WARN', sv);
      cell(r, 2, clean(k.element + (k.stage ? '  ·  ' + k.stage : '')), Object.assign({}, tx, { font: { sz: 8.5, b: true, color: C.text } }));
      cell(r, 3, clean(k.msg), tx); for (c = 4; c <= 11; c++) styleOnly(r, c, tx);
      merge(r, 3, r, 11); meta_(r, 15); r++;
    });
    if (infos) { cell(r, 1, infos + ' informational notes (open stages without forecast dates, text in date cells…) are listed in the website, not here.', { font: { sz: 8, i: true, color: C.mute }, h: 'left', indent: 1 }); merge(r, 1, r, 11); meta_(r, 14); r++; }
    meta_(r, 8); r++;
    var how = [
      'HOW TO READ AND USE THIS CHART',
      'LIVE: every date, %, health and bar here is a formula / conditional format reading the ' + lay.sheet + ' sheet. Change a date, SAR code or the data date there and this sheet redraws. Helper dates sit in the grouped columns to the right of the chart (click + above them to see them).',
      'Each block has two lines: the grey BASELINE line (baseline submission → approval) and the ACTUAL / FORECAST line: actual submission → SAR review (teal), submitted & still with SAR (amber hatching, up to the data date), forecast re-submission → approval (light hatching), current plan dates (violet hatching). The letter on a bar is the SAR review code.',
      'Health: Delayed = a submission / approval date has passed and the stage is not closed; At Risk = due within ' + meta.window + ' days of the data date; Var (d) = days late against baseline approval (positive = late). Collapse projects with the outline (+/–) buttons at the left.',
      'Fixed when generated: which projects / elements / stages have a line and the chart’s time range (padded for date moves). If you add elements or stages, or dates move outside the range, re-run the site to rebuild the sheet.'
    ];
    how.forEach(function (t, i) {
      cell(r, 1, t, i === 0 ? { font: { sz: 9, b: true, color: C.teal }, h: 'left', indent: 1 } : { font: { sz: 8.5, color: C.mute }, h: 'left', wrap: true, indent: 1, v: 'top' });
      merge(r, 1, r, 11); meta_(r, i === 0 ? 15 : 26); r++;
    });
    var lastRow = r - 1;

    /* ---- serialise ---- */
    var xml = [], rowNums = Object.keys(rows).map(Number).sort(function (a, b) { return a - b; });
    rowNums.forEach(function (rn) {
      var rm = rowMeta[rn] || {}, cs = rows[rn], colNums = Object.keys(cs).map(Number).sort(function (a, b) { return a - b; });
      var parts = ['<row r="' + rn + '"' + (rm.h ? ' ht="' + rm.h + '" customHeight="1"' : '') + (rm.outline ? ' outlineLevel="' + rm.outline + '"' : '') + '>'];
      colNums.forEach(function (cn) {
        var ce = cs[cn], ref = numToCol(cn) + rn, v = ce.v;
        if (ce.f) {
          if (typeof v === 'number') parts.push('<c r="' + ref + '" s="' + ce.s + '"><f>' + esc(ce.f) + '</f><v>' + v + '</v></c>');
          else parts.push('<c r="' + ref + '" s="' + ce.s + '" t="str"><f>' + esc(ce.f) + '</f><v>' + esc(clean(v == null ? '' : v)) + '</v></c>');
        } else if (v == null || v === '') parts.push('<c r="' + ref + '" s="' + ce.s + '"/>');
        else if (typeof v === 'number') parts.push('<c r="' + ref + '" s="' + ce.s + '"><v>' + v + '</v></c>');
        else parts.push('<c r="' + ref + '" s="' + ce.s + '" t="inlineStr"><is><t xml:space="preserve">' + esc(clean(v)) + '</t></is></c>');
      });
      parts.push('</row>'); xml.push(parts.join(''));
    });
    var lastHelper = hc(H.KIND);
    var cols = ['<cols>'];
    WIDTHS.forEach(function (w, i) { cols.push('<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'); });
    cols.push('<col min="' + TL0 + '" max="' + lastCol + '" width="' + unitW + '" customWidth="1"/>');
    cols.push('<col min="' + (lastCol + 1) + '" max="' + (lastCol + 1) + '" width="2.5" customWidth="1" collapsed="1"/>');
    cols.push('<col min="' + HC0 + '" max="' + lastHelper + '" width="10.5" hidden="1" outlineLevel="1" customWidth="1"/></cols>');
    var cfXml = cfBlocks.map(function (b) { return '<conditionalFormatting sqref="' + b.sqref + '">' + b.rules.join('') + '</conditionalFormatting>'; }).join('');
    var dimRef = 'A1:' + numToCol(lastHelper) + lastRow;
    var sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheetPr><tabColor rgb="FF' + C.red + '"/><outlinePr summaryBelow="0"/><pageSetUpPr fitToPage="1"/></sheetPr>' +
      '<dimension ref="' + dimRef + '"/>' +
      '<sheetViews><sheetView showGridLines="0" tabSelected="1" zoomScale="85" zoomScaleNormal="85" workbookViewId="0">' +
      '<pane xSplit="3" ySplit="' + HEAD_ROWS + '" topLeftCell="D' + (HEAD_ROWS + 1) + '" activePane="bottomRight" state="frozen"/>' +
      '<selection pane="topRight" activeCell="D1" sqref="D1"/><selection pane="bottomLeft" activeCell="A' + (HEAD_ROWS + 1) + '" sqref="A' + (HEAD_ROWS + 1) + '"/>' +
      '<selection pane="bottomRight" activeCell="D' + (HEAD_ROWS + 1) + '" sqref="D' + (HEAD_ROWS + 1) + '"/></sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="14.4" outlineLevelRow="2" outlineLevelCol="1"/>' + cols.join('') +
      '<sheetData>' + xml.join('') + '</sheetData>' +
      '<mergeCells count="' + merges.length + '">' + merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join('') + '</mergeCells>' +
      cfXml +
      '<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>' +
      '<pageSetup paperSize="8" orientation="landscape" fitToWidth="1" fitToHeight="0"/>' +
      '<headerFooter><oddFooter>&amp;L&amp;8SAR — Design Submission Gantt&amp;C&amp;8Page &amp;P of &amp;N&amp;R&amp;8Printed &amp;D</oddFooter></headerFooter>' +
      '</worksheet>';
    return { xml: sheet, lastData: lastData, lastRow: lastRow, lastCol: lastCol, ax: ax };
  }

  /* ---------- put the sheet into the workbook package ---------- */
  async function build(zip, model, opts) {
    opts = opts || {};
    var scale = opts.scale || 'week';
    var loc = await M.locateSheets(zip);
    var items = M.buildItems(model, opts);
    var stylesXml = await M.readText(zip, 'xl/styles.xml');
    var sb = new StyleBook(stylesXml);
    var res = buildSheet(sb, model, items, { scale: scale, sourceName: opts.sourceName });

    var wbXml = loc.workbookXml, relsXml = loc.relsXml;
    var target = loc.sheets.filter(function (s) { return /^gantt/i.test(s.name); })[0], sheetIndex, sheetName;
    if (target) { sheetIndex = target.index; sheetName = target.name; zip.file(target.path, res.xml); }
    else {
      var n = 1; while (zip.file('xl/worksheets/sheet' + n + '.xml')) n++;
      var rid = 'rId' + (1000 + n), sid = loc.sheets.length + 100; sheetName = 'Gantt chart'; sheetIndex = loc.sheets.length;
      zip.file('xl/worksheets/sheet' + n + '.xml', res.xml);
      relsXml = relsXml.replace('</Relationships>', '<Relationship Id="' + rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + n + '.xml"/></Relationships>');
      wbXml = wbXml.replace('</sheets>', '<sheet name="' + sheetName + '" sheetId="' + sid + '" r:id="' + rid + '"/></sheets>');
      var ct = await M.readText(zip, '[Content_Types].xml');
      ct = ct.replace('</Types>', '<Override PartName="/xl/worksheets/sheet' + n + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
      zip.file('[Content_Types].xml', ct); zip.file('xl/_rels/workbook.xml.rels', relsXml);
    }
    // open on the Gantt tab; give it print titles
    wbXml = /\bactiveTab="/.test(wbXml) ? wbXml.replace(/\bactiveTab="\d+"/, 'activeTab="' + sheetIndex + '"') : wbXml.replace(/<workbookView\b/, '<workbookView activeTab="' + sheetIndex + '"');
    var dn = '<definedName name="_xlnm.Print_Titles" localSheetId="' + sheetIndex + '">\'' + sheetName + '\'!$A:$C,\'' + sheetName + '\'!$8:$9</definedName>';
    wbXml = wbXml.replace(new RegExp('<definedName name="_xlnm.Print_Titles" localSheetId="' + sheetIndex + '">[^<]*</definedName>'), '');
    if (/<definedNames>/.test(wbXml)) wbXml = wbXml.replace('</definedNames>', dn + '</definedNames>');
    else wbXml = wbXml.replace('</sheets>', '</sheets><definedNames>' + dn + '</definedNames>');
    // new formulas are not in the calc chain: drop it (Excel rebuilds it) and ask for a full recalculation on open
    if (zip.file('xl/calcChain.xml')) {
      zip.remove('xl/calcChain.xml');
      var rel2 = (await M.readText(zip, 'xl/_rels/workbook.xml.rels')).replace(/<Relationship\b[^>]*calcChain[^>]*\/>/, '');
      zip.file('xl/_rels/workbook.xml.rels', rel2);
      var ct2 = (await M.readText(zip, '[Content_Types].xml')).replace(/<Override\b[^>]*calcChain[^>]*\/>/, '');
      zip.file('[Content_Types].xml', ct2);
    }
    wbXml = /<calcPr\b/.test(wbXml) ? wbXml.replace(/<calcPr\b([^>]*?)\/>/, function (m0, a) { return '<calcPr' + a.replace(/\s*fullCalcOnLoad="[^"]*"/, '') + ' fullCalcOnLoad="1"/>'; }) : wbXml.replace('</definedNames>', '</definedNames><calcPr fullCalcOnLoad="1"/>');
    zip.file('xl/workbook.xml', wbXml);
    zip.file('xl/styles.xml', sb.toXml());
    // only one tab may be "selected"
    for (var i = 0; i < loc.sheets.length; i++) {
      if (i === sheetIndex) continue;
      var p = loc.sheets[i].path, x = await M.readText(zip, p);
      if (x && /tabSelected="1"/.test(x)) zip.file(p, x.replace(/\s*tabSelected="1"/, ''));
    }
    var out = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    return { bytes: out, rows: res.lastRow, cols: res.lastCol, items: items.length };
  }

  return { build: build, layout: layout, palette: C, HEALTH: HEALTH, CODE: CODE };
});

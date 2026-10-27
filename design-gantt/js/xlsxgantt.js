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
    amberSoft: 'FFF3D6', sub: '1E6FD9', subSoft: 'DCE9FB', app: 'EF6C00', appSoft: 'FDE9D6', plan: '5E35B1', planSoft: 'E8E1F5', white: 'FFFFFF', text: '263238', mute: '78909C'
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
   * The chart uses only the Tracker's "Submission Date" and "Approval Date" columns (each is actual or forecast; the data date
   * tells which). Every number is a formula reading the Tracker and every bar is conditional formatting, so changing a date in
   * the Tracker redraws the chart. Fixed when generated: which projects / elements get a line, and the time range.
   */
  var TL0 = 9; // first timeline column
  var WIDTHS = [6.5, 50, 11.5, 11.5, 7, 8, 12, 34];
  var HEAD_ROWS = 9;
  var H = { PS: 0, PA: 1, KIND: 2 };
  var H_LABELS = ['Submission (eff.)', 'Approval (eff.)', 'Row kind'];
  var STATUS_COL = { 'Actual': ['2E7D32', 'FFFFFF'], 'In progress': ['1E6FD9', 'FFFFFF'], 'Forecast': ['7E57C2', 'FFFFFF'], 'No dates': ['B0BEC5', '37474F'] };

  function absRef(a1) { var m = /^([A-Z]+)(\d+)$/.exec(a1); return '$' + m[1] + '$' + m[2]; }
  function q(name) { return "'" + String(name).replace(/'/g, "''") + "'!"; }

  function buildSheet(sb, model, items, o) {
    var cut = model.meta.cut, ax = layout(items, cut, o.scale, true), st = model.stats, refs = model.meta.refs || {}, lay = model.layout, TR = q(lay.sheet);
    var unitW = o.scale === 'day' ? 1.45 : o.scale === 'month' ? 8 : 2.8;
    var lastCol = TL0 + ax.n - 1, HC0 = lastCol + 2, rows = {}, merges = [], rowMeta = {};
    function hc(i) { return HC0 + i; }
    function hl(i) { return numToCol(HC0 + i); }
    function cell(r, c, v, spec, f) { (rows[r] = rows[r] || {})[c] = { v: v, s: spec ? sb.xf(spec) : 0, f: f }; }
    function styleOnly(r, c, spec) { var ex = rows[r] && rows[r][c]; cell(r, c, ex ? ex.v : null, spec, ex ? ex.f : undefined); }
    function merge(r1, c1, r2, c2) { if (r1 !== r2 || c1 !== c2) merges.push(numToCol(c1) + r1 + ':' + numToCol(c2) + r2); }
    function rowH(r, h, outline) { rowMeta[r] = { h: h, outline: outline || 0 }; }
    var thin = function (c) { return ['thin', c]; };
    var DD = '$C$7', firstTl = numToCol(TL0), lastTl = numToCol(lastCol), c;
    function UE(col) { return o.scale === 'month' ? 'EOMONTH(' + col + '$9,0)' : col + '$9' + (o.scale === 'week' ? '+6' : ''); }

    /* rows */
    var r = HEAD_ROWS + 1;
    items.forEach(function (it) { it.r = r++; });
    var R0 = HEAD_ROWS + 1, lastData = r - 1;
    function colRange(col) { return '$' + col + '$' + R0 + ':$' + col + '$' + lastData; }
    var K = colRange(hl(H.KIND)), FST = colRange('G');

    /* title, KPI cards, legend */
    var bandSpec = { font: { sz: 18, b: true, color: C.white }, fill: C.teal, h: 'left', indent: 1 };
    for (c = 1; c <= lastCol; c++) styleOnly(1, c, bandSpec);
    cell(1, 1, 'DESIGN SUBMISSION — MILESTONE GANTT', bandSpec); merge(1, 1, 1, lastCol); rowH(1, 32);
    var subSpec = { font: { sz: 9, color: C.white }, fill: C.black, h: 'left', indent: 1 };
    for (c = 1; c <= lastCol; c++) styleOnly(2, c, subSpec);
    var srcTxt = String(o.sourceName || lay.sheet);
    cell(2, 1, 'Saudi Arabia Railways  |  Programme Controls   ·   Gantt v3.1   ·   Submission and Approval are milestones read live from the ' + lay.sheet + ' sheet (actual up to the data date, forecast after it)   ·   Source file: ' + srcTxt + '   ·   Data date ' + M.fmtDate(cut), subSpec,
      '"Saudi Arabia Railways  |  Programme Controls   ·   Gantt v3.1   ·   Submission and Approval are milestones read live from the ' + lay.sheet.replace(/"/g, '""') + ' sheet (actual up to the data date, forecast after it)   ·   Source file: ' + srcTxt.replace(/"/g, '""') + '   ·   Data date "&TEXT($C$7,"dd-mmm-yy")');
    merge(2, 1, 2, lastCol); rowH(2, 16); rowH(3, 6);
    var codeTxt = 'A ' + st.codes.A + '  ·  B ' + st.codes.B + '  ·  C ' + st.codes.C + '  ·  D ' + st.codes.D + '  ·  none ' + st.codes.none;
    var CODE_R = colRange('F');
    var cards = [
      [1, 2, 'PROJECTS  /  ELEMENTS', 'COUNTIF(' + K + ',"P")&"  /  "&COUNTIF(' + K + ',"E")', st.projects + '  /  ' + st.elements, C.black],
      [3, 3, 'ACTUAL', 'COUNTIFS(' + K + ',"E",' + FST + ',"Actual")', st.counts['Actual'], STATUS_COL['Actual'][0]],
      [4, 4, 'IN PROGRESS', 'COUNTIFS(' + K + ',"E",' + FST + ',"In progress")', st.counts['In progress'], STATUS_COL['In progress'][0]],
      [5, 6, 'FORECAST', 'COUNTIFS(' + K + ',"E",' + FST + ',"Forecast")', st.counts['Forecast'], STATUS_COL['Forecast'][0]],
      [7, 7, 'NO DATES', 'COUNTIFS(' + K + ',"E",' + FST + ',"No dates")', st.counts['No dates'], '78909C'],
      [8, 8, 'SAR CODES (elements)', '"A "&COUNTIFS(' + K + ',"E",' + CODE_R + ',"A")&"  ·  B "&COUNTIFS(' + K + ',"E",' + CODE_R + ',"B")&"  ·  C "&COUNTIFS(' + K + ',"E",' + CODE_R + ',"C")&"  ·  D "&COUNTIFS(' + K + ',"E",' + CODE_R + ',"D")&"  ·  none "&(COUNTIF(' + K + ',"E")-COUNTIFS(' + K + ',"E",' + CODE_R + ',"A")-COUNTIFS(' + K + ',"E",' + CODE_R + ',"B")-COUNTIFS(' + K + ',"E",' + CODE_R + ',"C")-COUNTIFS(' + K + ',"E",' + CODE_R + ',"D"))', codeTxt, C.teal]
    ];
    cards.forEach(function (cd) {
      var lab = { font: { sz: 8, b: true, color: C.white }, fill: cd[5], h: 'center', border: { left: thin(C.white), right: thin(C.white) } };
      var val = { font: { sz: cd[0] === 8 ? 11 : 20, b: true, color: cd[5] }, fill: C.band, h: 'center', border: { left: thin(C.white), right: thin(C.white), bottom: ['medium', cd[5]] } };
      for (var cc = cd[0]; cc <= cd[1]; cc++) { styleOnly(4, cc, lab); styleOnly(5, cc, val); }
      cell(4, cd[0], cd[2], lab); cell(5, cd[0], cd[4], val, cd[3]); merge(4, cd[0], 4, cd[1]); merge(5, cd[0], 5, cd[1]);
    });
    rowH(4, 15); rowH(5, 30);
    var info = { font: { sz: 8.5, color: C.mute, i: true }, h: 'left', indent: 1 };
    var psC = colRange(hl(H.PS)), paC = colRange(hl(H.PA));
    cell(6, 1, 'Actual = approval date reached by the data date   ·   In progress = submitted, approval still ahead   ·   Forecast = submission still ahead   ·   First submission ' + (st.first ? M.fmtDate(st.first) : '—') + '   ·   Last approval ' + (st.last ? M.fmtDate(st.last) : '—'), info,
      '"Actual = approval date reached by the data date   ·   In progress = submitted, approval still ahead   ·   Forecast = submission still ahead   ·   First submission "&IF(COUNT(' + psC + ')=0,"—",TEXT(MIN(' + psC + '),"dd-mmm-yy"))&"   ·   Last approval "&IF(COUNT(' + paC + ')=0,"—",TEXT(MAX(' + paC + '),"dd-mmm-yy"))');
    merge(6, 1, 6, 8); rowH(6, 14);

    var legend = [
      ['◆ Submission (actual)', { fill: C.sub }, C.white], ['◇ Submission (forecast)', { fill: C.subSoft }, C.sub],
      ['● Approval (actual)', { fill: C.app }, C.white], ['○ Approval (forecast)', { fill: C.appSoft }, C.app],
      ['Data date', { fill: C.red }, C.white]
    ];
    var wide = Math.max(2, Math.ceil(22 / unitW)), narrow = Math.max(1, Math.ceil(5 / unitW)), lr = 4, lc = TL0;
    legend.forEach(function (lg) {
      var span = lg[0].length === 1 ? narrow : wide;
      if (lc + span - 1 > lastCol) { lr++; lc = TL0; }
      if (lr > 5) return;
      var sp = { font: { sz: 8, b: true, color: lg[2] }, fill: lg[1].fill, h: 'center', border: { left: thin(C.white), right: thin(C.white), top: thin(C.white), bottom: thin(C.white) } };
      for (var cc = lc; cc < lc + span; cc++) styleOnly(lr, cc, sp);
      cell(lr, lc, lg[0], sp); merge(lr, lc, lr, lc + span - 1);
      lc += span;
    });

    /* data date (value comes from the Tracker's control panel) */
    rowH(7, 14);
    cell(7, 1, 'DATA DATE (from ' + lay.sheet + ')  ▶', { font: { sz: 9, b: true, color: C.red }, h: 'right' }); merge(7, 1, 7, 2);
    var dt0 = M.serialToDate(cut);
    cell(7, 3, cut, { font: { sz: 10, b: true, color: C.white }, fill: C.red, h: 'center', fmt: 'dd\\-mmm\\-yy' },
      refs.dd ? TR + absRef(refs.dd) : 'DATE(' + dt0.getUTCFullYear() + ',' + (dt0.getUTCMonth() + 1) + ',' + dt0.getUTCDate() + ')');

    /* headers */
    var hSpec = { font: { sz: 9, b: true, color: C.white }, fill: C.teal, h: 'center', wrap: true, border: { left: thin(C.white), right: thin(C.white), bottom: thin(C.white) } };
    ['ID', 'Project  /  Element', 'Submission Date', 'Approval Date', 'Days', 'SAR code', 'Status', 'Remarks'].forEach(function (h, i) {
      var cc = i + 1;
      styleOnly(8, cc, hSpec); styleOnly(9, cc, hSpec);
      cell(8, cc, h, i === 1 || i === 7 ? Object.assign({}, hSpec, { h: 'left', indent: 1 }) : hSpec); merge(8, cc, 9, cc);
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
    rowH(8, 17); rowH(9, 16);
    H_LABELS.forEach(function (lbl, i) {
      var sp = { font: { sz: 8, b: true, color: C.white }, fill: C.greyDark, h: 'center', wrap: true, border: { left: thin(C.white) } };
      styleOnly(8, hc(i), sp); styleOnly(9, hc(i), sp); cell(8, hc(i), lbl, sp); merge(8, hc(i), 9, hc(i));
    });

    /* lines: dates, SAR code and status are formulas; the milestones in the timeline are formulas too */
    var dFmt = 'dd\\-mmm\\-yy', g_ = lay.g;
    items.forEach(function (it) {
      var rw = it.r, proj = it.kind === 'project', band = proj ? C.band : null, tcol = proj ? C.white : C.text;
      rowH(rw, proj ? 21 : 18, it.lvl);
      function tspec(extra) { return Object.assign({ font: { sz: 9, b: proj, color: tcol }, fill: proj ? C.black : C.white, v: 'center', border: { left: thin(C.line), right: thin(C.line), bottom: thin(proj ? C.black : C.line) } }, extra || {}); }
      for (c = 1; c <= 8; c++) cell(rw, c, null, tspec({ h: c === 2 || c === 8 ? 'left' : 'center' }));
      var ps = it.ps, pa = it.pa, ownPs = TR + g_.ps + it.trow, ownPa = TR + g_.pa + it.trow;
      var PSc = '$' + hl(H.PS) + rw, PAc = '$' + hl(H.PA) + rw;
      var psF, paF;
      if (proj && it.kids) {
        var a = rw + 1, b = rw + it.kids, rp = hl(H.PS) + a + ':' + hl(H.PS) + b, ra = hl(H.PA) + a + ':' + hl(H.PA) + b;
        psF = 'IF(ISNUMBER(' + ownPs + '),' + ownPs + ',IF(COUNT(' + rp + ')=0,"",MIN(' + rp + ')))';
        paF = 'IF(ISNUMBER(' + ownPa + '),' + ownPa + ',IF(COUNT(' + ra + ')=0,"",MAX(' + ra + ')))';
      } else { psF = 'IF(ISNUMBER(' + ownPs + '),' + ownPs + ',"")'; paF = 'IF(ISNUMBER(' + ownPa + '),' + ownPa + ',"")'; }
      var hs = { font: { sz: 8, color: C.mute }, h: 'center', border: { bottom: thin(C.grid) } };
      function hput(i, v, f, fmt) { cell(rw, hc(i), v, Object.assign({}, hs, fmt ? { fmt: fmt } : {}), f); }
      hput(H.PS, isNum(ps) ? ps : '', psF, dFmt); hput(H.PA, isNum(pa) ? pa : '', paF, dFmt);
      hput(H.KIND, proj ? 'P' : 'E');
      var nameF = proj ? 'IF(' + TR + g_.code + it.trow + '="","",' + TR + g_.code + it.trow + '&" — ")&' + TR + g_.name + it.trow : TR + g_.name + it.trow + '&""';
      cell(rw, 1, it.id, tspec({ h: 'center', font: { sz: 8.5, b: true, color: proj ? C.white : C.mute } }));
      cell(rw, 2, clean(it.label), tspec({ h: 'left', indent: it.lvl * 2 + 1, shrink: true, font: { sz: proj ? 10 : 9, b: proj, color: tcol } }), nameF);
      cell(rw, 3, isNum(ps) ? ps : '', tspec({ h: 'center', fmt: dFmt, font: { sz: 9, b: true, color: tcol } }), 'IF(' + PSc + '="","",' + PSc + ')');
      cell(rw, 4, isNum(pa) ? pa : '', tspec({ h: 'center', fmt: dFmt, font: { sz: 9, b: true, color: tcol } }), 'IF(' + PAc + '="","",' + PAc + ')');
      cell(rw, 5, isNum(ps) && isNum(pa) ? pa - ps : '', tspec({ h: 'center', fmt: '0', font: { sz: 9, color: tcol } }), 'IF(COUNT(' + PSc + ',' + PAc + ')=2,' + PAc + '-' + PSc + ',"")');
      cell(rw, 6, it.code || '', tspec({ h: 'center', font: { sz: 10, b: true, color: tcol } }), g_.sar ? 'UPPER(TRIM(' + TR + g_.sar + it.trow + '&""))' : undefined);
      cell(rw, 7, it.status, tspec({ h: 'center', font: { sz: 8.5, b: true, color: C.white } }),
        'IF(COUNT(' + PSc + ',' + PAc + ')=0,"No dates",IF(AND(ISNUMBER(' + PAc + '),' + PAc + '<=' + DD + '),"Actual",IF(AND(ISNUMBER(' + PSc + '),' + PSc + '<=' + DD + '),"In progress","Forecast")))');
      cell(rw, 8, clean(it.notes || ''), tspec({ h: 'left', indent: 1, shrink: true, font: { sz: 8, color: proj ? 'D7E6EA' : C.mute } }), g_.notes ? TR + g_.notes + it.trow + '&""' : undefined);
      // milestones: ◆/◇ submission (actual/forecast), ●/○ approval
      var msSub = it.ms.filter(function (m_) { return m_.t === 'sub'; })[0], msApp = it.ms.filter(function (m_) { return m_.t === 'app'; })[0];
      for (var uu = 0; uu < ax.n; uu++) {
        var col = numToCol(TL0 + uu), v = '';
        if (msApp && ax.unitOf(msApp.d) === uu) v = /^[ABCD]$/.test(it.code) ? it.code : (msApp.actual ? '●' : '○');
        else if (msSub && ax.unitOf(msSub.d) === uu) v = msSub.actual ? '◆' : '◇';
        var inU = function (X_) { return 'AND(ISNUMBER(' + X_ + '),' + X_ + '>=' + col + '$9,' + X_ + '<=' + UE(col) + ')'; };
        cell(rw, TL0 + uu, v, { fill: band, border: { left: thin(ax.isMonthStart(uu) ? C.gridMonth : C.grid), bottom: thin(C.line) }, h: 'center', font: { sz: 11, b: true, color: C.text }, v: 'center' },
          'IF(' + inU(PAc) + ',IF(' + PAc + '<=' + DD + ',"●","○"),IF(' + inU(PSc) + ',IF(' + PSc + '<=' + DD + ',"◆","◇"),""))');
      }
    });

    /* conditional formatting: milestone colours, the data-date column, status / code colours */
    var pri = 1, blocks = [];
    function cf(sqref, formula, dxf, type, op) {
      var blk = blocks.filter(function (x) { return x.sqref === sqref; })[0];
      if (!blk) { blk = { sqref: sqref, rules: [] }; blocks.push(blk); }
      blk.rules.push('<cfRule type="' + (type || 'expression') + '" dxfId="' + dxf + '" priority="' + (pri++) + '"' + (op ? ' operator="' + op + '"' : '') + '><formula>' + esc(formula) + '</formula></cfRule>');
    }
    var T0 = firstTl, TLr = firstTl + R0 + ':' + lastTl + lastData, cc0 = T0 + R0;
    cf(TLr, 'OR(' + cc0 + '="◆",' + cc0 + '="◇")', sb.dxf({ font: { b: true, color: C.sub } }));
    cf(TLr, 'OR(' + cc0 + '="●",' + cc0 + '="○")', sb.dxf({ font: { b: true, color: C.app } }));
    var ddTest = 'AND(' + DD + '>=' + T0 + '$9,' + DD + '<=' + UE(T0) + ')';
    cf(TLr, ddTest, sb.dxf({ fill: C.redSoft, border: { left: ['thin', C.red] } }));
    cf(firstTl + '7:' + lastTl + '7', ddTest, sb.dxf({ fill: C.red }));
    cf(firstTl + '9:' + lastTl + '9', ddTest, sb.dxf({ fill: C.red, font: { b: true, color: C.white } }));
    // the date cells carry the same colours as the milestones: solid = actual, pale = forecast
    cf('C' + R0 + ':C' + lastData, 'AND(ISNUMBER(C' + R0 + '),C' + R0 + '<=' + DD + ')', sb.dxf({ fill: C.sub, font: { b: true, color: C.white } }));
    cf('C' + R0 + ':C' + lastData, 'ISNUMBER(C' + R0 + ')', sb.dxf({ fill: C.subSoft, font: { b: true, color: C.sub } }));
    cf('D' + R0 + ':D' + lastData, 'AND(ISNUMBER(D' + R0 + '),D' + R0 + '<=' + DD + ')', sb.dxf({ fill: C.app, font: { b: true, color: C.white } }));
    cf('D' + R0 + ':D' + lastData, 'ISNUMBER(D' + R0 + ')', sb.dxf({ fill: C.appSoft, font: { b: true, color: C.app } }));
    ['A', 'B', 'C', 'D'].forEach(function (k) { cf('F' + R0 + ':F' + lastData, '"' + k + '"', sb.dxf({ fill: CODE[k], font: { b: true, color: C.white } }), 'cellIs', 'equal'); });
    Object.keys(STATUS_COL).forEach(function (k) { cf('G' + R0 + ':G' + lastData, '"' + k + '"', sb.dxf({ fill: STATUS_COL[k][0], font: { b: true, color: STATUS_COL[k][1] } }), 'cellIs', 'equal'); });
    cf('E' + R0 + ':E' + lastData, 'AND(ISNUMBER(E' + R0 + '),E' + R0 + '<0)', sb.dxf({ font: { b: true, color: C.red } }));

    /* checks + notes (snapshot) */
    r = lastData + 2;
    var secSpec = { font: { sz: 11, b: true, color: C.white }, fill: C.black, h: 'left', indent: 1 };
    for (c = 1; c <= 8; c++) styleOnly(r, c, secSpec);
    cell(r, 1, 'DATA CHECKS   —   snapshot when this sheet was generated; fix in the Tracker, then re-run the site to refresh', secSpec); merge(r, 1, r, 8); rowH(r, 20); r++;
    var shown = model.checks.filter(function (k) { return k.sev !== 'info'; }), infos = model.checks.length - shown.length;
    if (!shown.length) { cell(r, 1, 'No date errors or warnings found.', { font: { sz: 9, color: '2E7D32', b: true }, h: 'left', indent: 1 }); merge(r, 1, r, 8); rowH(r, 16); r++; }
    shown.slice(0, 250).forEach(function (k) {
      var sv = { font: { sz: 8, b: true, color: C.white }, fill: k.sev === 'error' ? 'C62828' : 'B26A00', h: 'center', border: { bottom: thin(C.line) } };
      var tx = { font: { sz: 8.5, color: C.text }, h: 'left', indent: 1, shrink: true, border: { bottom: thin(C.line) } };
      cell(r, 1, k.sev === 'error' ? 'ERROR' : 'WARN', sv);
      cell(r, 2, clean(k.element), Object.assign({}, tx, { font: { sz: 8.5, b: true, color: C.text } }));
      cell(r, 3, clean(k.msg), tx); for (c = 4; c <= 8; c++) styleOnly(r, c, tx);
      merge(r, 3, r, 8); rowH(r, 15); r++;
    });
    if (infos) { cell(r, 1, infos + ' informational notes (rows without dates yet…) are listed in the website, not here.', { font: { sz: 8, i: true, color: C.mute }, h: 'left', indent: 1 }); merge(r, 1, r, 8); rowH(r, 14); r++; }
    r++;
    [
      'HOW TO USE THIS CHART',
      'LIVE: dates, status and bars read the "Submission Date" and "Approval Date" columns of the ' + lay.sheet + ' sheet and its data date. Change a date there and this sheet redraws. Helper dates are in the grouped columns right of the chart (click + above them).',
      'Submission and Approval are milestones, not activities. A milestone on or before the data date is ACTUAL (solid ◆ / ●), after it FORECAST (hollow ◇ / ○). The SAR review code (A/B/C/D) from the Tracker is shown in the SAR code column. A project uses the dates typed on its own row, otherwise the span of its elements.',
      'Fixed when generated: which projects / elements have a line and the time range (padded for date moves). If you add elements or dates move outside the range, re-run the site.'
    ].forEach(function (t, i) {
      cell(r, 1, t, i === 0 ? { font: { sz: 9, b: true, color: C.teal }, h: 'left', indent: 1 } : { font: { sz: 8.5, color: C.mute }, h: 'left', wrap: true, indent: 1, v: 'top' });
      merge(r, 1, r, 8); rowH(r, i === 0 ? 15 : 26); r++;
    });
    var lastRow = r - 1;

    /* serialise */
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
    var lastHelper = hc(H.KIND), cols = ['<cols>'];
    WIDTHS.forEach(function (w, i) { cols.push('<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'); });
    cols.push('<col min="' + TL0 + '" max="' + lastCol + '" width="' + unitW + '" customWidth="1"/>');
    cols.push('<col min="' + (lastCol + 1) + '" max="' + (lastCol + 1) + '" width="2.5" customWidth="1" collapsed="1"/>');
    cols.push('<col min="' + HC0 + '" max="' + lastHelper + '" width="11" hidden="1" outlineLevel="1" customWidth="1"/></cols>');
    var cfXml = blocks.map(function (b) { return '<conditionalFormatting sqref="' + b.sqref + '">' + b.rules.join('') + '</conditionalFormatting>'; }).join('');
    var sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheetPr><tabColor rgb="FF' + C.red + '"/><outlinePr summaryBelow="0"/><pageSetUpPr fitToPage="1"/></sheetPr>' +
      '<dimension ref="A1:' + numToCol(lastHelper) + lastRow + '"/>' +
      '<sheetViews><sheetView showGridLines="0" tabSelected="1" zoomScale="90" zoomScaleNormal="90" workbookViewId="0">' +
      '<pane xSplit="2" ySplit="' + HEAD_ROWS + '" topLeftCell="C' + (HEAD_ROWS + 1) + '" activePane="bottomRight" state="frozen"/>' +
      '<selection pane="topRight" activeCell="C1" sqref="C1"/><selection pane="bottomLeft" activeCell="A' + (HEAD_ROWS + 1) + '" sqref="A' + (HEAD_ROWS + 1) + '"/>' +
      '<selection pane="bottomRight" activeCell="C' + (HEAD_ROWS + 1) + '" sqref="C' + (HEAD_ROWS + 1) + '"/></sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="14.4" outlineLevelRow="1" outlineLevelCol="1"/>' + cols.join('') +
      '<sheetData>' + xml.join('') + '</sheetData>' +
      '<mergeCells count="' + merges.length + '">' + merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join('') + '</mergeCells>' + cfXml +
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
    var dn = '<definedName name="_xlnm.Print_Titles" localSheetId="' + sheetIndex + '">\'' + sheetName + '\'!$A:$B,\'' + sheetName + '\'!$8:$9</definedName>';
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

/* Report Compare — editing commands used by the ribbon: formatting, merge, layout, freeze panes, tables, clipboard, AutoSum, find / replace, sort.
 * Every command records an undo step, changes the state in RC.S (fmt = cell format deltas, lay = layout, dec = cell values) and redraws.
 * The state is written into the downloaded .xlsx by writer.js / xlsxfmt.js. */
(function () {
  'use strict';
  var RC = window.RC, S = RC.S, Fmt = window.Fmt, Xl = window.Xl, Diff = window.Diff, $ = RC.$, h = RC.h, key = RC.key;
  var E = window.Edit = {};
  var CAP = 60000;

  /* ---------- selection helpers ---------- */
  function sel() {
    if (S.sheet === '__overview' || !S.sel || S.sel.sheet !== S.sheet) return null;
    var rects = RC.selRects(); if (!rects.length) rects = [RC.cellRect(S.sel.a)];
    return { sheet: S.sheet, rects: rects, sh: S.cur.wb.byName[S.sheet] };
  }
  function eachAddr(rects, fn) {
    var n = 0;
    for (var k = 0; k < rects.length; k++) { var g = rects[k]; for (var r = g.r1; r <= g.r2; r++) for (var c = g.c1; c <= g.c2; c++) { if (++n > CAP) return false; fn(Xl.addr(c, r), r, c); } }
    return true;
  }
  function noSel() { RC.toast('Select a sheet and a cell first. (اختار شيت وخلية الأول)'); return null; }
  E.sel = sel;
  E.activeStyle = function () {
    if (S.sheet === '__overview' || !S.sel) return null;
    var cell = S.cur.wb.byName[S.sheet].cells.get(S.sel.a);
    return RC.styleObjFor(S.sheet, S.sel.a, RC.tablesOf(S.cur.wb.byName[S.sheet])) || RC.baseStyle(cell ? cell.s : 0);
  };

  /* ---------- formatting ---------- */
  /* patch: a delta, or a function (addr, r, c) -> delta */
  E.format = function (patch) {
    var s = sel(); if (!s) return noSel();
    RC.pushUndo();
    var addrs = [], m = S.fmt[s.sheet] = S.fmt[s.sheet] || {};
    var ok = eachAddr(s.rects, function (a, r, c) {
      var p = typeof patch === 'function' ? patch(a, r, c) : patch; if (!p) return;
      var nd = Fmt.mergeDelta(m[a], p); if (Fmt.isEmptyDelta(nd) && !nd.reset) delete m[a]; else m[a] = nd;
      RC.grow(s.sheet, r, c); addrs.push(a);
    });
    if (!ok) RC.toast('That is a very large selection — only the first ' + CAP + ' cells were formatted.');
    RC.save(); RC.refreshCells(s.sheet, addrs); RC.refreshSide();
  };
  E.toggle = function (prop) { var st = E.activeStyle(); if (!st) return noSel(); var o = {}; o[prop] = !st[prop]; E.format(o); };
  E.fill = function (hex) { E.format({ fill: hex }); };
  E.fontColor = function (hex) { E.format({ color: hex }); };
  E.fontName = function (n) { E.format({ name: n }); };
  E.fontSize = function (n) { E.format({ sz: +n }); };
  E.fontGrow = function (dir) {
    E.format(function (a) {
      var cell = S.cur.wb.byName[S.sheet].cells.get(a), st = RC.styleObjFor(S.sheet, a, RC.tablesOf(S.cur.wb.byName[S.sheet])) || RC.baseStyle(cell ? cell.s : 0), L = Fmt.SIZES, i = 0;
      while (i < L.length && L[i] < st.sz) i++;
      if (dir > 0) i = L[i] === st.sz ? i + 1 : i; else i = i - 1;
      return { sz: L[Math.max(0, Math.min(L.length - 1, i))] };
    });
  };
  E.align = function (h0) { E.format({ h: h0 }); };
  E.valign = function (v) { E.format({ v: v }); };
  E.wrap = function () { var st = E.activeStyle(); if (!st) return noSel(); E.format({ wrap: !st.wrap }); };
  E.indent = function (d) { E.format(function (a) { var cell = S.cur.wb.byName[S.sheet].cells.get(a), st = RC.styleObjFor(S.sheet, a, RC.tablesOf(S.cur.wb.byName[S.sheet])) || RC.baseStyle(cell ? cell.s : 0); return { indent: Math.max(0, (st.indent || 0) + d), h: st.h || 'left' }; }); };
  E.numfmt = function (code) { E.format({ nf: code }); };
  E.decimals = function (d) {
    E.format(function (a) { var cell = S.cur.wb.byName[S.sheet].cells.get(a), st = RC.styleObjFor(S.sheet, a, RC.tablesOf(S.cur.wb.byName[S.sheet])) || RC.baseStyle(cell ? cell.s : 0); var n = Fmt.bumpDecimals(st.nf, d); return n === st.nf ? null : { nf: n }; });
  };
  E.cellStyle = function (name) { var cs = Fmt.CELL_STYLES.filter(function (x) { return x.name === name; })[0]; if (!cs) return; E.format(Fmt.clone(cs.d)); };
  /* borders: kind = all | outside | thickOutside | none | top | bottom | left | right | thickBottom | doubleBottom | topBottom */
  var BLK = '#000000';
  E.borders = function (kind, lineStyle, lineColor) {
    var s = sel(); if (!s) return noSel();
    var bounds = s.rects[0];
    E.format(function (a, r, c) {
      var g = null; for (var i = 0; i < s.rects.length; i++) if (r >= s.rects[i].r1 && r <= s.rects[i].r2 && c >= s.rects[i].c1 && c <= s.rects[i].c2) { g = s.rects[i]; break; }
      if (!g) return null;
      var T = r === g.r1, B = r === g.r2, L = c === g.c1, R = c === g.c2, bd = {}, thin = { s: lineStyle || 'thin', c: lineColor || BLK }, thick = { s: lineStyle && lineStyle !== 'thin' ? lineStyle : 'thick', c: lineColor || BLK };
      switch (kind) {
        case 'all': bd = { l: thin, r: thin, t: thin, b: thin }; break;
        case 'outside': if (L) bd.l = thin; if (R) bd.r = thin; if (T) bd.t = thin; if (B) bd.b = thin; break;
        case 'thickOutside': if (L) bd.l = thick; if (R) bd.r = thick; if (T) bd.t = thick; if (B) bd.b = thick; break;
        case 'none': bd = { l: null, r: null, t: null, b: null }; break;
        case 'top': if (T) bd.t = thin; break;
        case 'bottom': if (B) bd.b = thin; break;
        case 'left': if (L) bd.l = thin; break;
        case 'right': if (R) bd.r = thin; break;
        case 'thickBottom': if (B) bd.b = thick; break;
        case 'doubleBottom': if (B) bd.b = { s: 'double', c: BLK }; break;
        case 'topBottom': if (T) bd.t = thin; if (B) bd.b = { s: 'double', c: BLK }; break;
      }
      return Object.keys(bd).length ? { bd: bd } : null;
    });
    void bounds;
  };

  /* ---------- clear ---------- */
  function setValue(sheet, a, text) {
    var base = RC.S.view.curCell(sheet, a), same = text === RC.editText(base, sheet) || (!base && text === '');
    if (same) delete S.dec[key(sheet, a)]; else S.dec[key(sheet, a)] = { m: 'custom', v: text };
  }
  E.setValue = setValue;
  E.clear = function (what) {
    var s = sel(); if (!s) return noSel();
    RC.pushUndo();
    var addrs = [], m = S.fmt[s.sheet] = S.fmt[s.sheet] || {};
    eachAddr(s.rects, function (a) {
      if (what === 'all' || what === 'contents') setValue(s.sheet, a, '');
      if (what === 'all' || what === 'formats') m[a] = { reset: true };
      addrs.push(a);
    });
    RC.recompute(); RC.save(); RC.afterChange(); RC.rerenderSheet();
  };

  /* ---------- merge ---------- */
  function inter(a, b) { return !(a.r2 < b.r1 || a.r1 > b.r2 || a.c2 < b.c1 || a.c1 > b.c2); }
  function lay(sheet, k) { return S.lay[k][sheet] = S.lay[k][sheet] || {}; }
  function unmergeIn(sheet, g) {
    var sh = S.cur.wb.byName[sheet], o = S.lay.merges[sheet] = S.lay.merges[sheet] || { add: [], remove: [] };
    RC.mergesOf(sh).forEach(function (m) {
      if (!inter(m, g)) return;
      var ai = -1; (o.add || []).forEach(function (x, i) { if (RC.sameRect(x, m)) ai = i; });
      if (ai >= 0) o.add.splice(ai, 1); else o.remove.push({ r1: m.r1, c1: m.c1, r2: m.r2, c2: m.c2 });
    });
  }
  E.merge = function (kind) {
    var s = sel(); if (!s) return noSel();
    if (kind === 'unmerge') {
      RC.pushUndo(); s.rects.forEach(function (g) { unmergeIn(s.sheet, g); }); RC.save(); RC.rerenderSheet(); return;
    }
    var g = s.rects[0];
    if (g.r1 === g.r2 && g.c1 === g.c2) { RC.toast('Select two or more cells to merge. (حدد خليتين أو أكتر)'); return; }
    var parts = [];
    if (kind === 'across') for (var r = g.r1; r <= g.r2; r++) parts.push({ r1: r, c1: g.c1, r2: r, c2: g.c2 }); else parts.push({ r1: g.r1, c1: g.c1, r2: g.r2, c2: g.c2 });
    parts = parts.filter(function (p) { return p.c2 > p.c1 || p.r2 > p.r1; });
    var lost = [];
    parts.forEach(function (p) { for (var r = p.r1; r <= p.r2; r++) for (var c = p.c1; c <= p.c2; c++) { if (r === p.r1 && c === p.c1) continue; var e = S.view.eff(s.sheet, Xl.addr(c, r)); if (e && (e.k !== '' || e.f != null)) lost.push(Xl.addr(c, r)); } });
    if (lost.length && !window.confirm('Merging keeps only the upper-left value of each merged area; the other ' + lost.length + ' value(s) will be cleared.\n(الدمج بيحتفظ بقيمة الخلية العليا اليسرى بس — باقي القيم هتتمسح)\n\nContinue?')) return;
    RC.pushUndo();
    parts.forEach(function (p) { unmergeIn(s.sheet, p); lost.forEach(function (a) { var q = Xl.parseAddr(a); if (q.r >= p.r1 && q.r <= p.r2 && q.c >= p.c1 && q.c <= p.c2) setValue(s.sheet, a, ''); }); S.lay.merges[s.sheet].add.push(p); RC.grow(s.sheet, p.r2, p.c2); });
    if (kind === 'center') { var m = S.fmt[s.sheet] = S.fmt[s.sheet] || {}; parts.forEach(function (p) { var a = Xl.addr(p.c1, p.r1); m[a] = Fmt.mergeDelta(m[a], { h: 'center' }); }); }
    RC.recompute(); RC.save(); RC.afterChange(); RC.rerenderSheet();
  };

  /* ---------- layout: column width, row height, hide, freeze ---------- */
  function selCols(s) { var o = {}; s.rects.forEach(function (g) { for (var c = g.c1; c <= g.c2; c++) o[c] = 1; }); return Object.keys(o).map(Number); }
  function selRows(s) { var o = {}; s.rects.forEach(function (g) { for (var r = g.r1; r <= g.r2; r++) o[r] = 1; }); return Object.keys(o).map(Number); }
  E.storedWidth = function (chars) { return Math.round(((chars * 7 + 5) / 7) * 256) / 256; };
  E.charsOf = function (stored) { return Math.round((stored * 7 - 5) / 7 * 100) / 100; };
  E.colWidth = function (chars) { var s = sel(); if (!s) return noSel(); RC.pushUndo(); var o = lay(s.sheet, 'colw'), w = E.storedWidth(Math.max(0, +chars)); selCols(s).forEach(function (c) { o[c] = w; }); RC.save(); RC.rerenderSheet(); };
  E.rowHeight = function (pt) { var s = sel(); if (!s) return noSel(); RC.pushUndo(); var o = lay(s.sheet, 'rowh'); selRows(s).forEach(function (r) { o[r] = Math.max(1, +pt); }); RC.save(); RC.rerenderSheet(); };
  E.currentColChars = function () { var s = sel(); if (!s) return 8.43; var c = Xl.parseAddr(S.sel.a).c, o = S.lay.colw[s.sheet] || {}, w = o[c]; if (w == null) { (s.sh.cols || []).forEach(function (d) { if (c >= d.min && c <= d.max) w = d.w; }); } return E.charsOf(w != null ? w : s.sh.defW); };
  E.currentRowPt = function () { var s = sel(); if (!s) return 15; var r = Xl.parseAddr(S.sel.a).r, o = S.lay.rowh[s.sheet] || {}, q = s.sh.rows.get(r); return o[r] != null ? o[r] : (q && q.ht) || s.sh.defH; };
  E.autofitCols = function () {
    var s = sel(); if (!s) return noSel(); RC.pushUndo(); var o = lay(s.sheet, 'colw');
    selCols(s).forEach(function (c) { var mx = 0; for (var r = 1; r <= s.sh.maxR; r++) { var t = RC.displayCell(s.sheet, Xl.addr(c, r)); if (t && t.length > mx) mx = t.length; } o[c] = E.storedWidth(Math.min(70, Math.max(3, mx * 1.12 + 1))); });
    RC.save(); RC.rerenderSheet();
  };
  E.autofitRows = function () {
    var s = sel(); if (!s) return noSel(); RC.pushUndo(); var o = lay(s.sheet, 'rowh');
    selRows(s).forEach(function (r) { var big = 11; for (var c = 1; c <= s.sh.maxC; c++) { var st = E.styleAt(s.sheet, Xl.addr(c, r)); if (st && st.sz > big) big = st.sz; } o[r] = Math.round(big * 1.36 * 4) / 4; });
    RC.save(); RC.rerenderSheet();
  };
  E.styleAt = function (sheet, a) { var cell = S.cur.wb.byName[sheet].cells.get(a); return RC.styleObjFor(sheet, a, RC.tablesOf(S.cur.wb.byName[sheet])) || RC.baseStyle(cell ? cell.s : 0); };
  E.hide = function (what, hide) {
    var s = sel(); if (!s) return noSel(); RC.pushUndo();
    if (what === 'cols') { var oc = lay(s.sheet, 'colHidden'); selCols(s).forEach(function (c) { oc[c] = hide; }); } else { var or = lay(s.sheet, 'rowHidden'); selRows(s).forEach(function (r) { or[r] = hide; }); }
    RC.save(); RC.rerenderSheet();
  };
  E.unhideAll = function () {
    var s = sel() || { sheet: S.sheet, sh: S.cur.wb.byName[S.sheet] }; if (S.sheet === '__overview') return noSel(); RC.pushUndo();
    var oc = lay(s.sheet, 'colHidden'), or = lay(s.sheet, 'rowHidden');
    for (var c = 1; c <= s.sh.maxC; c++) oc[c] = false; for (var r = 1; r <= s.sh.maxR; r++) or[r] = false;
    RC.save(); RC.rerenderSheet();
  };
  E.freeze = function (mode) {
    if (S.sheet === '__overview') return noSel(); RC.pushUndo();
    var p = S.sel ? Xl.parseAddr(S.sel.a) : { r: 1, c: 1 };
    if (mode === 'off') S.lay.freeze[S.sheet] = null;
    else if (mode === 'top') S.lay.freeze[S.sheet] = { r: 2, c: 1 };
    else if (mode === 'first') S.lay.freeze[S.sheet] = { r: 1, c: 2 };
    else { if (p.r === 1 && p.c === 1) { RC.toast('Select the cell below and to the right of what you want to keep visible. (حدد الخلية اللي تحت وعلى يمين الجزء الثابت)'); S.undo.pop(); return; } S.lay.freeze[S.sheet] = { r: p.r, c: p.c }; }
    RC.save(); RC.rerenderSheet();
  };

  /* ---------- tables ---------- */
  function hasVal(sheet, r, c) { var e = S.view.eff(sheet, Xl.addr(c, r)); return !!e && (e.k !== '' || e.f != null); }
  E.currentRegion = function (sheet, a) {
    var sh = S.cur.wb.byName[sheet], p = Xl.parseAddr(a), r1 = p.r, r2 = p.r, c1 = p.c, c2 = p.c, grew = true;
    if (!hasVal(sheet, p.r, p.c)) return { r1: p.r, c1: p.c, r2: p.r, c2: p.c };
    while (grew) {
      grew = false;
      var r, c;
      if (r1 > 1) { for (c = c1; c <= c2 + 1 && c <= sh.maxC; c++) if (c >= 1 && hasVal(sheet, r1 - 1, c)) { r1--; grew = true; break; } }
      if (r2 < sh.maxR) { for (c = c1; c <= c2 + 1 && c <= sh.maxC; c++) if (hasVal(sheet, r2 + 1, c)) { r2++; grew = true; break; } }
      if (c1 > 1) { for (r = r1; r <= r2 + 1 && r <= sh.maxR; r++) if (hasVal(sheet, r, c1 - 1)) { c1--; grew = true; break; } }
      if (c2 < sh.maxC) { for (r = r1; r <= r2 + 1 && r <= sh.maxR; r++) if (hasVal(sheet, r, c2 + 1)) { c2++; grew = true; break; } }
    }
    return { r1: r1, c1: c1, r2: r2, c2: c2 };
  };
  E.insertTable = function (refText, styleId) {
    var sheet = S.sheet, sh = S.cur.wb.byName[sheet], g;
    try { g = RC.refRect(String(refText).replace(/\$/g, '').toUpperCase()); } catch (e) { g = null; }
    if (!g || !isFinite(g.r1) || !isFinite(g.c1)) { RC.toast('The range is not valid. (النطاق مش صحيح)'); return false; }
    if (g.r2 <= g.r1) { RC.toast('A table needs a header row and at least one data row. (الجدول لازم صف عناوين وصف بيانات)'); return false; }
    if (RC.tablesOf(sh).some(function (t) { return inter(t, g); })) { RC.toast('The range overlaps another table. (النطاق بيتداخل مع جدول تاني)'); return false; }
    if (RC.mergesOf(sh).some(function (m) { return inter(m, g); })) { RC.toast('Tables cannot contain merged cells — unmerge them first. (الجداول مفيهاش خلايا مدموجة)'); return false; }
    RC.pushUndo();
    var names = [], used = {}, fixes = 0;
    for (var c = g.c1; c <= g.c2; c++) {
      var a = Xl.addr(c, g.r1), e = S.view.eff(sheet, a), t = e && e.k !== '' && e.f == null ? String(e.k === 'n' ? e.v : e.v).trim() : '';
      if (e && e.f != null && e.k !== '') t = String(e.v);
      if (!t) { t = 'Column' + (c - g.c1 + 1); fixes++; }
      var base = t, n = 2; while (used[t.toLowerCase()]) { t = base + n++; fixes++; }
      used[t.toLowerCase()] = 1; names.push(t);
      if (!e || e.k !== 's' || e.v !== t) setValue(sheet, a, "'" + t);
    }
    var taken = {}; S.cur.wb.sheets.forEach(function (x) { RC.tablesOf(x).forEach(function (tt) { taken[(tt.name || '').toLowerCase()] = 1; }); });
    var k = 1; while (taken['table' + k]) k++;
    S.lay.tables.push({ sheet: sheet, ref: Xl.addr(g.c1, g.r1) + ':' + Xl.addr(g.c2, g.r2), name: 'Table' + k, style: styleId || 'TableStyleMedium2', headers: true, stripes: true, cols: names });
    RC.grow(sheet, g.r2, g.c2); RC.recompute(); RC.save(); RC.afterChange(); RC.rerenderSheet();
    RC.toast('Table' + k + ' created' + (fixes ? ' — ' + fixes + ' header(s) renamed to be unique' : '') + '. (اتعمل جدول)');
    return true;
  };
  E.tableStyle = function (id) {   /* change the style of the table that contains the active cell (tables created here) */
    if (!S.sel) return noSel(); var p = Xl.parseAddr(S.sel.a), done = false;
    RC.pushUndo();
    S.lay.tables.forEach(function (t) { if (t.sheet !== S.sheet) return; var g = RC.refRect(t.ref); if (p.r >= g.r1 && p.r <= g.r2 && p.c >= g.c1 && p.c <= g.c2) { t.style = id; done = true; } });
    if (!done) { S.undo.pop(); RC.toast('Select a cell inside a table you created here. (حدد خلية جوه جدول من اللي عملته)'); return; }
    RC.save(); RC.rerenderSheet();
  };
  E.removeTable = function () {
    if (!S.sel) return noSel(); var p = Xl.parseAddr(S.sel.a), keep = [], hit = false; RC.pushUndo();
    S.lay.tables.forEach(function (t) { var g = RC.refRect(t.ref); if (t.sheet === S.sheet && p.r >= g.r1 && p.r <= g.r2 && p.c >= g.c1 && p.c <= g.c2) hit = true; else keep.push(t); });
    if (!hit) { S.undo.pop(); RC.toast('Select a cell inside a table you created here. (حدد خلية جوه جدول من اللي عملته)'); return; }
    S.lay.tables = keep; RC.save(); RC.rerenderSheet();
  };

  function fullDelta(st) { return Object.assign({ reset: true }, { name: st.name, sz: st.sz, b: st.b, i: st.i, u: st.u, color: st.color, fill: st.fill, h: st.h, v: st.v, wrap: st.wrap, indent: st.indent, nf: st.nf, bd: Fmt.clone(st.bd) }); }

  /* ---------- clipboard ---------- */
  function tsvOf(cells, g) {
    var rows = []; for (var r = g.r1; r <= g.r2; r++) { var row = []; for (var c = g.c1; c <= g.c2; c++) row.push(RC.displayCell(S.sheet, Xl.addr(c, r)).replace(/[\t\r\n]+/g, ' ')); rows.push(row.join('\t')); }
    return rows.join('\n');
  }
  E.copy = function (cut) {
    var s = sel(); if (!s) return noSel();
    var g = s.rects[0], cells = [];
    for (var r = g.r1; r <= g.r2; r++) for (var c = g.c1; c <= g.c2; c++) {
      var a = Xl.addr(c, r), e = S.view.eff(s.sheet, a);
      cells.push({ dr: r - g.r1, dc: c - g.c1, a: a, e: e ? { k: e.k, v: e.v, f: e.f, a: e.a || a } : null, st: Fmt.clone(E.styleAt(s.sheet, a)) });
    }
    var text = tsvOf(cells, g);
    S.clip = { sheet: s.sheet, rect: { r1: g.r1, c1: g.c1, r2: g.r2, c2: g.c2 }, cells: cells, cut: !!cut, text: text };
    var mine = S.clip; mine.sysOk = null;
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { mine.sysOk = true; }, function () { mine.sysOk = false; }); else mine.sysOk = false; } catch (e) { mine.sysOk = false; }
    RC.paintSelRects(); RC.toast((cut ? 'Cut' : 'Copied') + ' ' + cells.length + ' cell(s) — click where to paste and press Ctrl+V. (' + (cut ? 'قص' : 'نسخ') + ')');
  };
  E.cut = function () { E.copy(true); };
  /* mode: all | values | formulas | formats */
  E.paste = function (mode) {
    if (!S.clip) { RC.toast('Copy something first. (انسخ حاجة الأول)'); return; }
    if (!S.sel || S.sheet === '__overview') return noSel();
    mode = mode || 'all';
    var clip = S.clip, t0 = Xl.parseAddr(S.sel.a), sh = S.cur.wb.byName[S.sheet], addrs = [], fm = S.fmt[S.sheet] = S.fmt[S.sheet] || {};
    RC.pushUndo();
    clip.cells.forEach(function (it) {
      var r = t0.r + it.dr, c = t0.c + it.dc; if (r > 20000 || c > 300) return;
      var a = Xl.addr(c, r); RC.grow(S.sheet, r, c);
      if (mode !== 'formats') {
        var e = it.e, text = '';
        if (e && (e.k !== '' || e.f != null)) {
          if (e.f != null && mode !== 'values') text = '=' + Xl.shiftFormula(e.f, r - (clip.rect.r1 + it.dr), c - (clip.rect.c1 + it.dc));
          else text = RC.editText({ k: e.k, v: e.v, a: it.a }, clip.sheet);
        }
        setValue(S.sheet, a, text);
      }
      if (mode === 'all' || mode === 'formats') {
        fm[a] = fullDelta(it.st);
      }
      addrs.push(a);
    });
    if (clip.cut && mode === 'all') {
      clip.cells.forEach(function (it) { if (clip.sheet === S.sheet) { var q = Xl.parseAddr(it.a); var tr = t0.r + it.dr, tc = t0.c + it.dc; if (q.r === tr && q.c === tc) return; var inTarget = q.r >= t0.r && q.r < t0.r + (clip.rect.r2 - clip.rect.r1 + 1) && q.c >= t0.c && q.c < t0.c + (clip.rect.c2 - clip.rect.c1 + 1); if (inTarget) return; } setValue(clip.sheet, it.a, ''); (S.fmt[clip.sheet] = S.fmt[clip.sheet] || {})[it.a] = { reset: true }; });
      S.clip = null;
    }
    RC.recompute(); RC.save(); RC.afterChange(); RC.rerenderSheet();
    RC.setRange(Xl.addr(t0.c, t0.r), Xl.addr(t0.c + (clip.rect.c2 - clip.rect.c1), t0.r + (clip.rect.r2 - clip.rect.r1))); RC.paintMarks(); RC.refreshSide();
  };
  /* text from outside (another program): tab / newline separated */
  E.pasteText = function (text) {
    if (!S.sel || S.sheet === '__overview' || !text) return;
    var rows = String(text).replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').map(function (l) { return l.split('\t'); }), t0 = Xl.parseAddr(S.sel.a);
    if (rows.length * rows[0].length > CAP) { RC.toast('Too much to paste at once.'); return; }
    RC.pushUndo();
    rows.forEach(function (row, i) { row.forEach(function (v, j) { RC.grow(S.sheet, t0.r + i, t0.c + j); setValue(S.sheet, Xl.addr(t0.c + j, t0.r + i), v); }); });
    RC.recompute(); RC.save(); RC.afterChange(); RC.rerenderSheet();
    RC.toast('Pasted ' + rows.length + ' row(s). (اتلصق)');
  };

  /* ---------- fill: the handle at the corner of the selection, Ctrl+D / Ctrl+R, Home > Fill ---------- */
  /* g = the source rectangle, dir = down | up | right | left, n = how many rows / columns to fill, copyOnly = no series */
  E.fill = function (g, dir, n, copyOnly) {
    var sheet = S.sheet; n = Math.floor(n); if (!(n >= 1)) return null;
    var vertical = dir === 'down' || dir === 'up', forward = dir === 'down' || dir === 'right';
    var lines = vertical ? g.c2 - g.c1 + 1 : g.r2 - g.r1 + 1, len = vertical ? g.r2 - g.r1 + 1 : g.c2 - g.c1 + 1;
    if (lines * n > CAP) { RC.toast('That is too much to fill at once. (كبير قوي)'); return null; }
    RC.pushUndo();
    var fm = S.fmt[sheet] = S.fmt[sheet] || {};
    for (var li = 0; li < lines; li++) {
      var cells = [], pos = [];
      for (var k = 0; k < len; k++) {   // the source line, in the order of the fill (bottom-up for Up, right-to-left for Left)
        var idx = forward ? k : len - 1 - k, r = vertical ? g.r1 + idx : g.r1 + li, c = vertical ? g.c1 + li : g.c1 + idx, a = Xl.addr(c, r), e = S.view.eff(sheet, a);
        cells.push(e ? { k: e.k, v: e.v, f: e.f, a: e.a || a } : { k: '', v: null, f: null, a: a }); pos.push({ r: r, c: c, a: a });
      }
      Fill.fillVector(cells, n, copyOnly).forEach(function (p, i) {
        var tr = vertical ? (forward ? g.r2 + 1 + i : g.r1 - 1 - i) : pos[0].r, tc = vertical ? pos[0].c : (forward ? g.c2 + 1 + i : g.c1 - 1 - i);
        if (tr < 1 || tc < 1 || tr > 20000 || tc > 300) return;
        var ta = Xl.addr(tc, tr), src = pos[p.src], sc = cells[p.src], text = '';
        RC.grow(sheet, tr, tc);
        if (p.value) text = p.value.k === 'n' ? RC.editText({ k: 'n', v: p.value.v, a: sc.a }, sheet) : "'" + p.value.v;
        else if (sc.f != null) text = '=' + Xl.shiftFormula(sc.f, tr - src.r, tc - src.c);      // relative references move with the cell, like Excel
        else if (sc.k !== '') text = RC.editText(sc, sheet);
        setValue(sheet, ta, text);
        fm[ta] = fullDelta(E.styleAt(sheet, src.a));
      });
    }
    var ng = { r1: g.r1, c1: g.c1, r2: g.r2, c2: g.c2 };
    if (dir === 'down') ng.r2 = g.r2 + n; else if (dir === 'up') ng.r1 = Math.max(1, g.r1 - n); else if (dir === 'right') ng.c2 = g.c2 + n; else ng.c1 = Math.max(1, g.c1 - n);
    RC.recompute(); RC.save(); RC.afterChange(); RC.rerenderSheet();
    RC.setRange(Xl.addr(ng.c1, ng.r1), Xl.addr(ng.c2, ng.r2)); RC.paintMarks(); RC.refreshSide();
    return ng;
  };
  /* Ctrl+D / Ctrl+R and Home > Fill: fill the selection from its first row / column (a single row / column is filled from the one before it) */
  E.fillSel = function (dir) {
    var s = sel(); if (!s) return noSel(); var g = s.rects[0], h0 = g.r2 - g.r1 + 1, w0 = g.c2 - g.c1 + 1, src, n, copy = true;
    if (dir === 'down') { if (h0 === 1) { if (g.r1 === 1) { RC.toast('There is no row above to fill from. (مفيش صف فوق)'); return; } src = { r1: g.r1 - 1, r2: g.r1 - 1, c1: g.c1, c2: g.c2 }; n = 1; } else { src = { r1: g.r1, r2: g.r1, c1: g.c1, c2: g.c2 }; n = h0 - 1; } }
    else if (dir === 'right') { if (w0 === 1) { if (g.c1 === 1) { RC.toast('There is no column to the left to fill from. (مفيش عمود على اليسار)'); return; } src = { r1: g.r1, r2: g.r2, c1: g.c1 - 1, c2: g.c1 - 1 }; n = 1; } else { src = { r1: g.r1, r2: g.r2, c1: g.c1, c2: g.c1 }; n = w0 - 1; } }
    else if (dir === 'up') { if (h0 === 1) { RC.toast('Select two or more rows to fill up. (حدد أكتر من صف)'); return; } src = { r1: g.r2, r2: g.r2, c1: g.c1, c2: g.c2 }; n = h0 - 1; }
    else { if (w0 === 1) { RC.toast('Select two or more columns to fill left. (حدد أكتر من عمود)'); return; } src = { r1: g.r1, r2: g.r2, c1: g.c2, c2: g.c2 }; n = w0 - 1; }
    // fill() works on the cells that FOLLOW the source: for Up / Left the source is the last row / column
    var ng = E.fill(src, dir, n, copy);
    if (ng) { RC.setRange(Xl.addr(g.c1, g.r1), Xl.addr(g.c2, g.r2)); RC.paintMarks(); RC.refreshSide(); }
  };

  /* the fill handle (the small square at the bottom-right corner of the selection) */
  var fd = null, fdTimer = null, fdPt = null;
  function previewRect(g, dir, n) { var t = { r1: g.r1, r2: g.r2, c1: g.c1, c2: g.c2 }; if (dir === 'down') { t.r1 = g.r2 + 1; t.r2 = g.r2 + n; } else if (dir === 'up') { t.r2 = g.r1 - 1; t.r1 = g.r1 - n; } else if (dir === 'right') { t.c1 = g.c2 + 1; t.c2 = g.c2 + n; } else { t.c2 = g.c1 - 1; t.c1 = g.c1 - n; } return t; }
  function clearPreview() { var w = $('gridWrap'); w.querySelectorAll('.fillprev').forEach(function (n) { n.parentNode.removeChild(n); }); }
  function drawPreview() {
    clearPreview(); if (!fd || !fd.dir || !fd.n) return;
    var t = previewRect(fd.g, fd.dir, fd.n), a = RC.tdOf(Xl.addr(t.c1, t.r1)), b = RC.tdOf(Xl.addr(t.c2, t.r2)); if (!a || !b) return;
    var w = $('gridWrap'), wr = w.getBoundingClientRect(), qa = a.getBoundingClientRect(), qb = b.getBoundingClientRect(), d = document.createElement('div');
    d.className = 'selrect fillprev';
    d.style.cssText = 'left:' + (Math.min(qa.left, qb.left) - wr.left + w.scrollLeft - 1) + 'px;top:' + (Math.min(qa.top, qb.top) - wr.top + w.scrollTop - 1) + 'px;width:' + (Math.max(qa.right, qb.right) - Math.min(qa.left, qb.left) + 1) + 'px;height:' + (Math.max(qa.bottom, qb.bottom) - Math.min(qa.top, qb.top) + 1) + 'px';
    w.appendChild(d);
  }
  function fdUpdate() {
    if (!fd || !fdPt) return;
    var w = $('gridWrap'), wr = w.getBoundingClientRect(), x = Math.min(Math.max(fdPt.x, wr.left + 52), wr.right - 6), y = Math.min(Math.max(fdPt.y, wr.top + 28), wr.bottom - 6);
    var el = document.elementFromPoint(x, y), td = el && el.closest ? el.closest('td[data-a]') : null; if (!td) return;
    var p = Xl.parseAddr(td.getAttribute('data-a')), g = fd.g, dn = p.r - g.r2, up = g.r1 - p.r, rt = p.c - g.c2, lf = g.c1 - p.c, best = Math.max(dn, up, rt, lf);
    if (best <= 0) { fd.dir = null; fd.n = 0; } else if (best === dn) { fd.dir = 'down'; fd.n = dn; } else if (best === up) { fd.dir = 'up'; fd.n = Math.min(up, g.r1 - 1); } else if (best === rt) { fd.dir = 'right'; fd.n = rt; } else { fd.dir = 'left'; fd.n = Math.min(lf, g.c1 - 1); }
    drawPreview();
  }
  function fdStop() { clearInterval(fdTimer); fdTimer = null; fdPt = null; document.body.classList.remove('filling'); clearPreview(); }
  function adjacentCount(g) {   // double-click on the handle: fill down as far as the neighbouring column has data (Excel's rule)
    var sh = S.cur.wb.byName[S.sheet], cols = [g.c1 - 1, g.c2 + 1].filter(function (c) { return c >= 1 && c <= sh.maxC; });
    for (var i = 0; i < cols.length; i++) { var c = cols[i]; if (!hasVal(S.sheet, g.r2, c)) continue; var r = g.r2; while (r + 1 <= sh.maxR && hasVal(S.sheet, r + 1, c)) r++; if (r > g.r2) return r - g.r2; }
    return 0;
  }
  $('gridWrap').addEventListener('mousedown', function (e) {
    var hnd = e.target.closest && e.target.closest('.fillh'); if (!hnd || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    var s = sel(); if (!s || S.extra.length) return;
    fd = { g: { r1: s.rects[0].r1, c1: s.rects[0].c1, r2: s.rects[0].r2, c2: s.rects[0].c2 }, dir: null, n: 0 };
    document.body.classList.add('filling');
    fdTimer = setInterval(function () {   // scroll while the pointer is near an edge
      if (!fd || !fdPt) return;
      var w = $('gridWrap'), wr = w.getBoundingClientRect(), m = 26, dx = 0, dy = 0;
      if (fdPt.x > wr.right - m) dx = Math.min(60, (fdPt.x - (wr.right - m)) / 2 + 10); else if (fdPt.x < wr.left + 44 + m) dx = -Math.min(60, ((wr.left + 44 + m) - fdPt.x) / 2 + 10);
      if (fdPt.y > wr.bottom - m) dy = Math.min(60, (fdPt.y - (wr.bottom - m)) / 2 + 10); else if (fdPt.y < wr.top + 24 + m) dy = -Math.min(60, ((wr.top + 24 + m) - fdPt.y) / 2 + 10);
      if (dx || dy) { w.scrollBy(dx, dy); fdUpdate(); }
    }, 40);
  }, true);
  document.addEventListener('mousemove', function (e) { if (!fd) return; fdPt = { x: e.clientX, y: e.clientY }; fdUpdate(); });
  document.addEventListener('mouseup', function (e) {
    if (!fd) return;
    var d = fd; fd = null; fdStop();
    if (d.dir && d.n > 0) E.fill(d.g, d.dir, d.n, e.ctrlKey || e.metaKey);     // Ctrl = copy only (no series), like Excel
  }, true);
  $('gridWrap').addEventListener('dblclick', function (e) {
    var hnd = $('gridWrap').querySelector('.fillh'); if (!hnd) return;   /* by position: the handle is redrawn between the two clicks */
    var hr = hnd.getBoundingClientRect(); if (e.clientX < hr.left - 6 || e.clientX > hr.right + 6 || e.clientY < hr.top - 6 || e.clientY > hr.bottom + 6) return;
    e.preventDefault(); e.stopPropagation(); fd = null; fdStop();
    var s = sel(); if (!s) return; var g = s.rects[0], n = adjacentCount(g);
    if (!n) { RC.toast('Nothing next to the selection to fill down to. (مفيش بيانات جنب التحديد)'); return; }
    E.fill({ r1: g.r1, c1: g.c1, r2: g.r2, c2: g.c2 }, 'down', n, false);
  }, true);

  /* ---------- AutoSum and the other quick functions ---------- */
  E.autosum = function (fn) {
    var s = sel(); if (!s) return noSel();
    var g = s.rects[0], single = g.r1 === g.r2 && g.c1 === g.c2;
    function isNum(r, c) { var e = S.view.eff(s.sheet, Xl.addr(c, r)); return !!e && e.k === 'n'; }
    RC.pushUndo();
    if (single) {
      var r = g.r1, c = g.c1, r0 = r - 1;
      while (r0 >= 1 && isNum(r0, c)) r0--;
      if (r0 < r - 1) { setValue(s.sheet, Xl.addr(c, r), '=' + fn + '(' + Xl.addr(c, r0 + 1) + ':' + Xl.addr(c, r - 1) + ')'); }
      else { var c0 = c - 1; while (c0 >= 1 && isNum(r, c0)) c0--; if (c0 < c - 1) setValue(s.sheet, Xl.addr(c, r), '=' + fn + '(' + Xl.addr(c0 + 1, r) + ':' + Xl.addr(c - 1, r) + ')'); else { S.undo.pop(); RC.toast('No numbers found above or to the left of the cell. (مفيش أرقام فوق الخلية أو على يسارها)'); return; } }
    } else {
      for (var cc = g.c1; cc <= g.c2; cc++) { RC.grow(s.sheet, g.r2 + 1, cc); setValue(s.sheet, Xl.addr(cc, g.r2 + 1), '=' + fn + '(' + Xl.addr(cc, g.r1) + ':' + Xl.addr(cc, g.r2) + ')'); }
    }
    RC.recompute(); RC.save(); RC.afterChange(); RC.rerenderSheet();
  };

  /* ---------- sort (values only) ---------- */
  E.sort = function (asc) {
    var s = sel(); if (!s) return noSel(); var g = s.rects[0], kc = Xl.parseAddr(S.sel.a).c;
    if (g.r1 === g.r2) { var reg = E.currentRegion(s.sheet, S.sel.a); g = reg; }
    if (g.r2 <= g.r1) { RC.toast('Select a column or a range with at least two rows. (حدد نطاق فيه صفين على الأقل)'); return; }
    if (kc < g.c1 || kc > g.c2) kc = g.c1;
    var rows = [], formulas = false, hdr = false, first = [];
    for (var c = g.c1; c <= g.c2; c++) { var e0 = S.view.eff(s.sheet, Xl.addr(c, g.r1)); first.push(e0); }
    var e1 = S.view.eff(s.sheet, Xl.addr(kc, g.r1 + 1));
    hdr = first.every(function (e) { return e && e.k === 's'; }) && e1 && e1.k !== 's';
    var start = hdr ? g.r1 + 1 : g.r1;
    for (var r = start; r <= g.r2; r++) { var row = []; for (c = g.c1; c <= g.c2; c++) { var e = S.view.eff(s.sheet, Xl.addr(c, r)); if (e && e.f != null) formulas = true; row.push(e ? { k: e.k, v: e.v, a: e.a || Xl.addr(c, r) } : null); } rows.push({ r: r, cells: row }); }
    if (formulas) { RC.toast('The range contains formulas — sorting would break their references. Sort values only. (فيه معادلات — الترتيب هيبوّظ المراجع)'); return; }
    var ki = kc - g.c1;
    var sorted = rows.slice().sort(function (p, q) {
      var a = p.cells[ki], b = q.cells[ki], ea = !a || a.k === '', eb = !b || b.k === ''; if (ea && eb) return 0; if (ea) return 1; if (eb) return -1;
      var d = a.k === 'n' && b.k === 'n' ? a.v - b.v : String(a.v).toLowerCase() < String(b.v).toLowerCase() ? -1 : String(a.v).toLowerCase() > String(b.v).toLowerCase() ? 1 : 0;
      return asc ? d : -d;
    });
    RC.pushUndo();
    sorted.forEach(function (row, i) { row.cells.forEach(function (cellv, j) { var a = Xl.addr(g.c1 + j, start + i); setValue(s.sheet, a, cellv && cellv.k !== '' ? RC.editText({ k: cellv.k, v: cellv.v, a: cellv.a }, s.sheet) : ''); }); });
    RC.recompute(); RC.save(); RC.afterChange(); RC.rerenderSheet();
    RC.toast('Sorted ' + sorted.length + ' row(s) by column ' + Xl.numToCol(kc) + (asc ? ' A→Z' : ' Z→A') + (hdr ? ' (header kept)' : '') + ' — values only, formats stay in place. (اترتب)');
  };

  /* ---------- find / replace ---------- */
  function matchText(t, q, opt) { if (!t) return false; if (opt.entire) return opt.mcase ? t === q : t.toLowerCase() === q.toLowerCase(); return opt.mcase ? t.indexOf(q) >= 0 : t.toLowerCase().indexOf(q.toLowerCase()) >= 0; }
  E.findAll = function (q, opt) {
    var out = []; if (!q) return out;
    var sheets = opt.workbook ? RC.visibleSheets() : [S.cur.wb.byName[S.sheet]];
    sheets.forEach(function (sh) { for (var r = 1; r <= sh.maxR; r++) for (var c = 1; c <= sh.maxC; c++) { var a = Xl.addr(c, r); if (matchText(RC.displayCell(sh.name, a), q, opt)) out.push({ sheet: sh.name, a: a }); } });
    return out;
  };
  E.findNext = function (q, opt) {
    var all = E.findAll(q, opt); if (!all.length) { RC.toast('Nothing found. (مفيش نتايج)'); return null; }
    var cur = S.sel ? all.findIndex(function (x) { return x.sheet === S.sel.sheet && x.a === S.sel.a; }) : -1, nxt = all[(cur + 1) % all.length];
    RC.selectCell(nxt.sheet, nxt.a); return all.length;
  };
  E.replaceAll = function (q, rep, opt) {
    var all = E.findAll(q, opt).filter(function (x) { var e = S.view.eff(x.sheet, x.a); return e && e.f == null && e.k === 's'; });
    if (!all.length) { RC.toast('Nothing to replace (formulas and numbers are not changed). (مفيش حاجة تتغيّر)'); return 0; }
    RC.pushUndo();
    all.forEach(function (x) { var e = S.view.eff(x.sheet, x.a), v = String(e.v), re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), opt.mcase ? 'g' : 'gi'); setValue(x.sheet, x.a, "'" + (opt.entire ? rep : v.replace(re, rep.replace(/\$/g, '$$$$')))); });
    RC.recompute(); RC.save(); RC.afterChange(); RC.rerenderSheet(); RC.toast('Replaced in ' + all.length + ' cell(s). (اتغيّر)');
    return all.length;
  };

  /* ---------- a small modal dialog ---------- */
  E.dialog = function (title, fields, onOk, okText) {
    var back = document.createElement('div'); back.className = 'dlg-back';
    var box = document.createElement('div'); box.className = 'dlg'; box.setAttribute('role', 'dialog');
    var html = '<h3>' + h(title) + '</h3>';
    fields.forEach(function (f) {
      if (f.type === 'select') html += '<label class="df">' + h(f.label) + '<select data-id="' + f.id + '">' + f.options.map(function (o) { return '<option value="' + h(o.v) + '"' + (o.v === f.value ? ' selected' : '') + '>' + h(o.t) + '</option>'; }).join('') + '</select></label>';
      else if (f.type === 'check') html += '<label class="df chk"><input type="checkbox" data-id="' + f.id + '"' + (f.value ? ' checked' : '') + '> ' + h(f.label) + '</label>';
      else if (f.type === 'note') html += '<p class="dn">' + f.label + '</p>';
      else html += '<label class="df">' + h(f.label) + '<input type="text" data-id="' + f.id + '" value="' + h(f.value == null ? '' : f.value) + '"></label>';
    });
    html += '<div class="dbtn"><button type="button" class="dc">Cancel · إلغاء</button><button type="button" class="dok">' + h(okText || 'OK · موافق') + '</button></div>';
    box.innerHTML = html; back.appendChild(box); document.body.appendChild(back);
    function close() { if (back.parentNode) back.parentNode.removeChild(back); }
    function ok() { var v = {}; box.querySelectorAll('[data-id]').forEach(function (el) { v[el.getAttribute('data-id')] = el.type === 'checkbox' ? el.checked : el.value; }); if (onOk(v) !== false) close(); }
    box.querySelector('.dc').addEventListener('click', close); box.querySelector('.dok').addEventListener('click', ok);
    back.addEventListener('mousedown', function (e) { if (e.target === back) close(); });
    box.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); else if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') { e.preventDefault(); ok(); } });
    var f0 = box.querySelector('input,select'); if (f0) { f0.focus(); if (f0.select) f0.select(); }
    return { close: close, box: box };
  };
  E.promptColWidth = function () { if (!sel()) return noSel(); E.dialog('Column Width · عرض العمود', [{ id: 'w', label: 'Width (characters)', value: E.currentColChars() }], function (v) { var n = parseFloat(v.w); if (!isFinite(n) || n < 0 || n > 255) { RC.toast('Enter a number between 0 and 255.'); return false; } E.colWidth(n); }); };
  E.promptRowHeight = function () { if (!sel()) return noSel(); E.dialog('Row Height · ارتفاع الصف', [{ id: 'h', label: 'Height (points)', value: E.currentRowPt() }], function (v) { var n = parseFloat(v.h); if (!isFinite(n) || n < 0 || n > 409) { RC.toast('Enter a number between 0 and 409.'); return false; } E.rowHeight(n); }); };
  E.tableDialog = function (styleId) {
    var s = sel(); if (!s) return noSel();
    var g = s.rects[0]; if (g.r1 === g.r2 && g.c1 === g.c2) g = E.currentRegion(s.sheet, S.sel.a);
    E.dialog('Create Table · إنشاء جدول', [
      { id: 'ref', label: 'Where is the data for your table?', value: Xl.addr(g.c1, g.r1) + ':' + Xl.addr(g.c2, g.r2) },
      { id: 'style', label: 'Table style', type: 'select', value: styleId || 'TableStyleMedium2', options: Fmt.TABLE_STYLES.map(function (t) { return { v: t.id, t: t.name + ' (' + t.id.replace('TableStyle', '') + ')' }; }) },
      { type: 'note', label: 'The first row of the range becomes the header row (empty or repeated headers are renamed). <span class="ar">أول صف في النطاق بيبقى صف العناوين.</span>' }
    ], function (v) { return E.insertTable(v.ref, v.style); });
  };
  E.findDialog = function (replaceMode) {
    var d = E.dialog(replaceMode ? 'Find and Replace · بحث واستبدال' : 'Find · بحث', [
      { id: 'q', label: 'Find what', value: '' }, replaceMode ? { id: 'rep', label: 'Replace with', value: '' } : { type: 'note', label: '' },
      { id: 'mcase', label: 'Match case', type: 'check', value: false }, { id: 'entire', label: 'Match entire cell contents', type: 'check', value: false }, { id: 'workbook', label: 'Search all sheets', type: 'check', value: false }
    ], function () { return false; }, 'Find Next · التالي');
    var box = d.box, btns = box.querySelector('.dbtn');
    function vals() { var v = {}; box.querySelectorAll('[data-id]').forEach(function (el) { v[el.getAttribute('data-id')] = el.type === 'checkbox' ? el.checked : el.value; }); return v; }
    var ok = box.querySelector('.dok'); var nok = ok.cloneNode(true); ok.parentNode.replaceChild(nok, ok);
    nok.addEventListener('click', function () { var v = vals(); var n = E.findNext(v.q, v); if (n) box.querySelector('.dres') && (box.querySelector('.dres').textContent = n + ' match(es)'); });
    if (replaceMode) { var ra = document.createElement('button'); ra.type = 'button'; ra.className = 'dok'; ra.textContent = 'Replace All · استبدل الكل'; ra.addEventListener('click', function () { var v = vals(); E.replaceAll(v.q, v.rep || '', v); }); btns.insertBefore(ra, nok); }
    var res = document.createElement('span'); res.className = 'dres'; btns.insertBefore(res, btns.firstChild);
    box.querySelector('.dc').textContent = 'Close · إغلاق';
    box.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); nok.click(); } });
  };

  /* ---------- keyboard + clipboard events ---------- */
  document.addEventListener('keydown', function (e) {
    if ($('app').hidden || /INPUT|TEXTAREA|SELECT/.test((e.target.tagName || '')) || e.altKey) return;
    var ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (!ctrl) return;
    if (k === 'z' && !e.shiftKey) { RC.undo(); e.preventDefault(); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { RC.redo(); e.preventDefault(); }
    else if (k === 'b') { E.toggle('b'); e.preventDefault(); }
    else if (k === 'i') { E.toggle('i'); e.preventDefault(); }
    else if (k === 'u') { E.toggle('u'); e.preventDefault(); }
    else if (k === 'c') { E.copy(false); e.preventDefault(); }
    else if (k === 'x') { E.copy(true); e.preventDefault(); }
    else if (k === 'd') { E.fillSel('down'); e.preventDefault(); }
    else if (k === 'r') { E.fillSel('right'); e.preventDefault(); }
    else if (k === 'f') { E.findDialog(false); e.preventDefault(); }
    else if (k === 'h') { E.findDialog(true); e.preventDefault(); }
    else if (k === 't') { E.tableDialog(); e.preventDefault(); }
  });
  document.addEventListener('paste', function (e) {
    if ($('app').hidden || /INPUT|TEXTAREA|SELECT/.test((e.target.tagName || ''))) return;
    var text = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
    e.preventDefault();
    /* the tool's own copy (formats, formulas) is used unless something else was copied to the system clipboard after it */
    if (S.clip && (!text || S.clip.sysOk !== true || text.replace(/\r\n?/g, '\n').replace(/\n$/, '') === S.clip.text)) E.paste('all'); else E.pasteText(text);
  });
})();

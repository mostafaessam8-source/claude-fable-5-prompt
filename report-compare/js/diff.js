/* Report Compare — cell-by-cell comparison of two weekly workbooks + the decisions the reviewer takes.
 *
 * A cell is either an INPUT (typed value) or a FORMULA. Only inputs and formula TEXT are reviewed (accept / reject / edit).
 * A formula whose text is unchanged but whose result moved is "auto-calculated": shown on request, never needs a decision.
 *
 * Decisions (state.dec, keyed "Sheet!A1"):  { m: 'accept' }  keep this week's cell (the default — same as "pending")
 *                                          { m: 'reject' }  restore LAST week's cell in the new report
 *                                          { m: 'custom', v: 'text' }  the reviewer's own value (same typing rules as Excel)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./xl.js'), require('./formula.js'));
  else root.Diff = factory(root.Xl, root.Formula);
})(typeof self !== 'undefined' ? self : this, function (Xl, Formula) {
  'use strict';

  function key(sheet, a) { return sheet + '!' + a; }
  function hasContent(c) { return !!c && (c.k !== '' || c.f != null); }
  function isF(c) { return !!c && (c.f != null || c.derived === true); }
  function normText(s) { return String(s).replace(/\r\n?/g, '\n'); }
  function sameValue(a, b) {
    if (a.k !== b.k) return false;
    if (a.k === 'n') return Math.abs(a.v - b.v) <= 1e-9 * Math.max(1, Math.abs(a.v), Math.abs(b.v));
    if (a.k === 's') return normText(a.v) === normText(b.v);
    return a.v === b.v;
  }

  /* Compare two workbook models (from Xl.readWorkbook). */
  function compare(prev, cur) {
    var out = { changes: [], auto: [], byKey: {}, sheets: {}, onlyPrev: [], onlyCur: [] };
    prev.sheets.forEach(function (s) { if (!cur.byName[s.name]) out.onlyPrev.push(s.name); });
    cur.sheets.forEach(function (s) {
      var p = prev.byName[s.name];
      var info = out.sheets[s.name] = { changes: 0, auto: 0 };
      if (!p) { out.onlyCur.push(s.name); return; }
      var addrs = new Set();
      p.cells.forEach(function (c, a) { if (hasContent(c)) addrs.add(a); });
      s.cells.forEach(function (c, a) { if (hasContent(c)) addrs.add(a); });
      addrs.forEach(function (a) {
        var pc = hasContent(p.cells.get(a)) ? p.cells.get(a) : null, cc = hasContent(s.cells.get(a)) ? s.cells.get(a) : null;
        var pf = isF(pc), cf = isF(cc), kind = null, auto = false;
        if (pc && cc) {
          if (pf && cf) {
            if (pc.derived || cc.derived) { if (!sameValue(pc, cc)) auto = true; }
            else if (String(pc.f).trim() !== String(cc.f).trim()) kind = 'formula';
            else if (!sameValue(pc, cc)) auto = true;
          } else if (!pf && !cf) { if (!sameValue(pc, cc)) kind = 'modified'; }
          else kind = 'type';
        } else if (cc) { if (cc.derived) auto = true; else kind = 'added'; }
        else if (pc) { if (pc.derived) auto = true; else kind = 'removed'; }
        if (!kind && !auto) return;
        var ch = { id: key(s.name, a), sheet: s.name, a: a, r: (cc || pc).r, c: (cc || pc).c, kind: kind || 'auto', auto: auto, prev: pc, cur: cc };
        if (auto) { out.auto.push(ch); info.auto++; } else { out.changes.push(ch); info.changes++; }
        out.byKey[ch.id] = ch;
      });
    });
    var sortFn = function (x, y) { return x.sheet === y.sheet ? (x.r - y.r || x.c - y.c) : 0; };
    out.changes.sort(sortFn);
    return out;
  }

  /* ---------- typing a value the way Excel does ---------- */
  var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  function serial(y, m, d) { var t = Date.UTC(y, m - 1, d); var dt = new Date(t); if (dt.getUTCMonth() !== m - 1) return null; return Math.round(t / 864e5) + Xl.EPOCH; }
  function parseInput(text) {
    var t = String(text == null ? '' : text);
    if (t.charAt(0) === "'") return { k: 's', v: t.slice(1), f: null };
    t = t.trim();
    if (t === '') return null;
    if (t.charAt(0) === '=' && t.length > 1) return { k: '', v: null, f: t.slice(1) };
    var m;
    if ((m = /^([-+]?(?:\d+(?:\.\d+)?|\.\d+))\s*%$/.exec(t))) return { k: 'n', v: parseFloat(m[1]) / 100, f: null };
    if (/^[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(t)) return { k: 'n', v: parseFloat(t.replace(/,/g, '')), f: null };
    if (/^[-+]?\d*\.?\d+[eE][-+]?\d+$/.test(t)) return { k: 'n', v: parseFloat(t), f: null };
    var s;
    if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(t)) && (s = serial(+m[1], +m[2], +m[3])) != null) return { k: 'n', v: s, f: null, date: true };
    if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(t)) && (s = serial(+m[3], +m[2], +m[1])) != null) return { k: 'n', v: s, f: null, date: true };
    if ((m = /^(\d{1,2})[ -]([A-Za-z]{3})[a-z]*[ -,]*(\d{2,4})$/.exec(t)) && MONTHS[m[2].toLowerCase()]) { var y = +m[3]; if (y < 100) y += 2000; if ((s = serial(y, MONTHS[m[2].toLowerCase()], +m[1])) != null) return { k: 'n', v: s, f: null, date: true }; }
    if (/^(true|false)$/i.test(t)) return { k: 'b', v: /^true$/i.test(t), f: null };
    return { k: 's', v: String(text).replace(/^\s+|\s+$/g, ''), f: null };
  }

  /* ---------- the view of the report after the reviewer's decisions ---------- */
  function makeView(prev, cur, dec) {
    function sheetCell(wb, sheet, a) { var s = wb.byName[sheet]; return s ? (s.cells.get(a) || null) : null; }
    var memo = {}, busy = {};
    var fctx = { get: function (sh, a) { return val(sh, a); }, bounds: function (sh) { var x = cur.byName[sh]; return x ? { maxR: x.maxR, maxC: x.maxC } : null; } };
    /* a value the reviewer typed: parsed like Excel; a formula is evaluated now (unsupported functions are left for Excel) */
    function customCell(sheet, a, text) {
      var pi = parseInput(text);
      if (!pi) return null;
      var c = sheetCell(cur, sheet, a), pa = Xl.parseAddr(a);
      pi.s = c ? c.s : 0; pi.a = a; pi.custom = true; pi.r = pa.r; pi.c = pa.c;
      if (pi.f != null) {
        fctx.sheet = sheet;
        var saved = fctx.sheet, res = Formula.evaluate(pi.f, { sheet: sheet, get: fctx.get, bounds: fctx.bounds });
        fctx.sheet = saved;
        pi.k = res.k; pi.v = res.v; if (res.unsupported) { pi.unsupported = true; pi.fn = res.fn; pi.syntax = res.syntax; }
      }
      return pi;
    }
    function eff(sheet, a) {
      var k = key(sheet, a), d = dec[k], c = sheetCell(cur, sheet, a);
      if (d && d.m === 'reject') { var p = sheetCell(prev, sheet, a); return hasContent(p) ? p : null; }
      if (d && d.m === 'custom') {
        if (memo[k] !== undefined) return memo[k];
        if (busy[k]) return { k: 'e', v: '#REF!', f: null, a: a, custom: true, circular: true };
        busy[k] = true;
        try { memo[k] = customCell(sheet, a, d.v); } finally { busy[k] = false; }
        return memo[k];
      }
      return hasContent(c) ? c : null;
    }
    function val(sheet, a) { var c = eff(sheet, a); if (!c || c.k === '') return null; return c.k === 'e' ? { err: c.v } : c.v; }
    return {
      eff: eff, val: val, evalText: function (sheet, a, text) { return customCell(sheet, a, text); },
      num: function (sheet, a) { var v = val(sheet, a); return typeof v === 'number' ? v : null; },
      str: function (sheet, a) { var v = val(sheet, a); return v == null ? '' : (typeof v === 'object' ? v.err : String(v)); },
      prevCell: function (sheet, a) { var c = sheetCell(prev, sheet, a); return hasContent(c) ? c : null; },
      prevVal: function (sheet, a) { var c = sheetCell(prev, sheet, a); if (!hasContent(c) || c.k === '') return null; return c.k === 'e' ? { err: c.v } : c.v; },
      prevNum: function (sheet, a) { var c = sheetCell(prev, sheet, a); return c && c.k === 'n' ? c.v : null; },
      curCell: function (sheet, a) { var c = sheetCell(cur, sheet, a); return hasContent(c) ? c : null; },
      hasSheet: function (n) { return !!cur.byName[n]; },
      hasPrevSheet: function (n) { return !!prev.byName[n]; }
    };
  }

  function counts(cmp, dec) {
    var n = { total: cmp.changes.length, pending: 0, accepted: 0, rejected: 0, edited: 0, auto: cmp.auto.length, editedOther: 0 };
    cmp.changes.forEach(function (ch) {
      var d = dec[ch.id];
      if (!d) n.pending++; else if (d.m === 'accept') n.accepted++; else if (d.m === 'reject') n.rejected++; else n.edited++;
    });
    Object.keys(dec).forEach(function (k) { if (dec[k].m === 'custom' && !cmp.byKey[k]) n.editedOther++; });
    return n;
  }

  return { key: key, compare: compare, parseInput: parseInput, makeView: makeView, counts: counts, hasContent: hasContent, isF: isF, sameValue: sameValue };
});

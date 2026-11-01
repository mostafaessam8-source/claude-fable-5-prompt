/* Report Compare — a small Excel formula engine, used for formulas the reviewer types into a cell.
 * evaluate(text, ctx) → { k: 'n'|'s'|'b'|'e'|'', v, unsupported? }
 *   ctx.sheet            sheet the formula lives in
 *   ctx.get(sheet, addr) → value of a cell: number | string | boolean | null (empty) | { err }
 *   ctx.bounds(sheet)    → { maxR, maxC } (for whole-column ranges), or null when the sheet does not exist
 * A function the engine does not know gives { k: '', unsupported: true }: the formula is still written to the file and Excel
 * calculates it when the report is opened.
 * Pure logic, no DOM: runs in the browser (script tag) and in Node (tests).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./xl.js'));
  else root.Formula = factory(root.Xl);
})(typeof self !== 'undefined' ? self : this, function (Xl) {
  'use strict';

  function E(code, extra) { var e = { err: code }; if (extra) for (var k in extra) e[k] = extra[k]; return e; }
  function isErr(v) { return v !== null && typeof v === 'object' && !Array.isArray(v) && v.err; }

  /* ---------- tokenizer ---------- */
  var TOKEN = /\s*(?:("(?:[^"]|"")*")|((?:'(?:[^']|'')+'|[A-Za-z_][\w.]*)!)?(\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?|\$?[A-Za-z]{1,3}:\$?[A-Za-z]{1,3})(?![\w(.])|(#N\/A|#REF!|#DIV\/0!|#VALUE!|#NAME\?|#NUM!|#NULL!)|(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+)|([A-Za-z_][\w.]*)(?=\()|([A-Za-z_][\w.]*)|(<=|>=|<>|[-+*\/^&=<>%(),;]))/y;
  function tokenize(src) {
    var toks = [], pos = 0, m;
    src = src.replace(/\s+$/, '');
    while (pos < src.length) {
      TOKEN.lastIndex = pos;
      m = TOKEN.exec(src);
      if (!m || TOKEN.lastIndex === pos) throw E('#NAME?', { syntax: true });
      pos = TOKEN.lastIndex;
      if (m[1] != null) toks.push({ t: 'str', v: m[1].slice(1, -1).replace(/""/g, '"') });
      else if (m[3] != null) toks.push({ t: 'ref', sheet: m[2] ? m[2].slice(0, -1).replace(/^'|'$/g, '').replace(/''/g, "'") : null, ref: m[3].toUpperCase().replace(/\$/g, '') });
      else if (m[4] != null) toks.push({ t: 'err', v: m[4] });
      else if (m[5] != null) toks.push({ t: 'num', v: parseFloat(m[5]) });
      else if (m[6] != null) toks.push({ t: 'fn', v: m[6].toUpperCase().replace(/^_XLFN\./, '').replace(/^_XLWS\./, '') });
      else if (m[7] != null) { var u = m[7].toUpperCase(); toks.push(u === 'TRUE' || u === 'FALSE' ? { t: 'bool', v: u === 'TRUE' } : { t: 'name', v: m[7] }); }
      else toks.push({ t: 'op', v: m[8] === ';' ? ',' : m[8] });
    }
    return toks;
  }

  /* ---------- parser (Excel precedence: comparison < & < + - < * / < ^ < unary minus < %) ---------- */
  function parse(src) {
    var toks = tokenize(src), i = 0;
    function peek() { return toks[i]; }
    function isOp(v) { var t = toks[i]; return t && t.t === 'op' && t.v === v; }
    function cmp() {
      var l = concat();
      while (peek() && peek().t === 'op' && /^(=|<>|<=|>=|<|>)$/.test(peek().v)) { var op = toks[i++].v; l = { t: 'bin', op: op, l: l, r: concat() }; }
      return l;
    }
    function concat() { var l = add(); while (isOp('&')) { i++; l = { t: 'bin', op: '&', l: l, r: add() }; } return l; }
    function add() { var l = mul(); while (isOp('+') || isOp('-')) { var op = toks[i++].v; l = { t: 'bin', op: op, l: l, r: mul() }; } return l; }
    function mul() { var l = pow(); while (isOp('*') || isOp('/')) { var op = toks[i++].v; l = { t: 'bin', op: op, l: l, r: pow() }; } return l; }
    function pow() { var l = unary(); while (isOp('^')) { i++; l = { t: 'bin', op: '^', l: l, r: unary() }; } return l; }
    function unary() {
      if (isOp('-')) { i++; return { t: 'un', op: '-', e: unary() }; }
      if (isOp('+')) { i++; return unary(); }
      var e = primary();
      while (isOp('%')) { i++; e = { t: 'pct', e: e }; }
      return e;
    }
    function primary() {
      var t = toks[i++];
      if (!t) throw E('#NAME?', { syntax: true });
      if (t.t === 'num' || t.t === 'str' || t.t === 'bool') return { t: t.t, v: t.v };
      if (t.t === 'err') return { t: 'err', v: t.v };
      if (t.t === 'ref') return { t: 'ref', sheet: t.sheet, ref: t.ref };
      if (t.t === 'name') throw E('#NAME?');
      if (t.t === 'op' && t.v === '(') { var e = cmp(); if (!isOp(')')) throw E('#NAME?', { syntax: true }); i++; return e; }
      if (t.t === 'fn') {
        if (!isOp('(')) throw E('#NAME?', { syntax: true });
        i++;
        var args = [];
        if (isOp(')')) { i++; return { t: 'fn', name: t.v, args: args }; }
        for (;;) {
          if (isOp(',') || isOp(')')) args.push({ t: 'empty' }); else args.push(cmp());
          if (isOp(',')) { i++; continue; }
          if (isOp(')')) { i++; break; }
          throw E('#NAME?', { syntax: true });
        }
        return { t: 'fn', name: t.v, args: args };
      }
      throw E('#NAME?', { syntax: true });
    }
    var ast = cmp();
    if (i < toks.length) throw E('#NAME?', { syntax: true });
    return ast;
  }

  /* ---------- value helpers ---------- */
  function toNum(v) {
    if (isErr(v)) throw v;
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'number') return v;
    var s = String(v).trim(); if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?%?$/i.test(s)) { var n = parseFloat(s); return /%$/.test(s) ? n / 100 : n; }
    throw E('#VALUE!');
  }
  function toStr(v) { if (isErr(v)) throw v; if (v === null || v === undefined) return ''; if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'; if (typeof v === 'number') return Xl.formatNumber(v, 'General'); return String(v); }
  function toBool(v) { if (isErr(v)) throw v; if (typeof v === 'boolean') return v; if (v === null || v === '') return false; if (typeof v === 'number') return v !== 0; var s = String(v).toUpperCase(); if (s === 'TRUE') return true; if (s === 'FALSE') return false; throw E('#VALUE!'); }
  function flat(args, opts) { // numbers from values/ranges; text and booleans inside ranges are ignored (as Excel does)
    var out = [];
    args.forEach(function (a) {
      if (Array.isArray(a)) a.forEach(function (row) { row.forEach(function (v) { if (isErr(v)) throw v; if (typeof v === 'number') out.push(v); }); });
      else if (a !== undefined && !(a === null && opts && opts.skipEmpty)) out.push(toNum(a));
    });
    return out;
  }
  function cellsOf(a) { var o = []; if (Array.isArray(a)) a.forEach(function (r) { r.forEach(function (v) { o.push(v); }); }); else o.push(a); return o; }
  function scalar(v) { return Array.isArray(v) ? (v.length && v[0].length ? v[0][0] : null) : v; }
  function compare(a, b) {
    a = scalar(a); b = scalar(b);
    if (isErr(a)) throw a; if (isErr(b)) throw b;
    if (a === null) a = typeof b === 'string' ? '' : (typeof b === 'boolean' ? false : 0);
    if (b === null) b = typeof a === 'string' ? '' : (typeof a === 'boolean' ? false : 0);
    var ra = typeof a === 'number' ? 0 : typeof a === 'string' ? 1 : 2, rb = typeof b === 'number' ? 0 : typeof b === 'string' ? 1 : 2;
    if (ra !== rb) return ra < rb ? -1 : 1;
    if (ra === 1) { a = a.toLowerCase(); b = b.toLowerCase(); }
    return a < b ? -1 : a > b ? 1 : 0;
  }
  function critFn(c) { // COUNTIF / SUMIF criteria
    c = scalar(c);
    if (typeof c === 'number' || typeof c === 'boolean') return function (v) { return typeof v === typeof c && v === c; };
    var s = String(c == null ? '' : c), m = /^(<=|>=|<>|=|<|>)?(.*)$/.exec(s), op = m[1] || '=', rhs = m[2], n = rhs !== '' && isFinite(rhs) ? parseFloat(rhs) : null;
    return function (v) {
      if (n !== null) { if (typeof v !== 'number') return op === '<>'; var d = v - n; return op === '=' ? d === 0 : op === '<>' ? d !== 0 : op === '<' ? d < 0 : op === '>' ? d > 0 : op === '<=' ? d <= 0 : d >= 0; }
      var sv = v == null ? '' : String(v).toLowerCase(), pat = rhs.toLowerCase();
      if (/[*?]/.test(pat)) { var re = new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$'); return op === '<>' ? !re.test(sv) : re.test(sv); }
      return op === '<>' ? sv !== pat : sv === pat;
    };
  }
  function roundTo(x, d, mode) {
    var f = Math.pow(10, d), y = x * f;
    y = mode === 'up' ? (y < 0 ? -Math.ceil(-y - 1e-12) : Math.ceil(y - 1e-12)) : mode === 'down' ? (y < 0 ? -Math.floor(-y + 1e-12) : Math.floor(y + 1e-12)) : (y < 0 ? -Math.round(-y + 1e-12) : Math.round(y + 1e-12));
    return y / f;
  }
  function serial(y, m, d) { var dt = new Date(Date.UTC(y, m - 1, d)); return Math.floor(dt.getTime() / 864e5) + Xl.EPOCH; }

  /* ---------- functions ---------- */
  var FN = {
    SUM: function (a) { return flat(a).reduce(function (s, x) { return s + x; }, 0); },
    AVERAGE: function (a) { var n = flat(a); if (!n.length) throw E('#DIV/0!'); return n.reduce(function (s, x) { return s + x; }, 0) / n.length; },
    MIN: function (a) { var n = flat(a); return n.length ? Math.min.apply(null, n) : 0; },
    MAX: function (a) { var n = flat(a); return n.length ? Math.max.apply(null, n) : 0; },
    COUNT: function (a) { var c = 0; a.forEach(function (x) { cellsOf(x).forEach(function (v) { if (typeof v === 'number') c++; }); }); return c; },
    COUNTA: function (a) { var c = 0; a.forEach(function (x) { cellsOf(x).forEach(function (v) { if (v !== null && v !== '') c++; }); }); return c; },
    ABS: function (a) { return Math.abs(toNum(scalar(a[0]))); },
    INT: function (a) { return Math.floor(toNum(scalar(a[0]))); },
    SQRT: function (a) { var n = toNum(scalar(a[0])); if (n < 0) throw E('#NUM!'); return Math.sqrt(n); },
    POWER: function (a) { return Math.pow(toNum(scalar(a[0])), toNum(scalar(a[1]))); },
    MOD: function (a) { var n = toNum(scalar(a[0])), d = toNum(scalar(a[1])); if (!d) throw E('#DIV/0!'); return n - d * Math.floor(n / d); },
    ROUND: function (a) { return roundTo(toNum(scalar(a[0])), a[1] === undefined ? 0 : toNum(scalar(a[1])), 'r'); },
    ROUNDUP: function (a) { return roundTo(toNum(scalar(a[0])), a[1] === undefined ? 0 : toNum(scalar(a[1])), 'up'); },
    ROUNDDOWN: function (a) { return roundTo(toNum(scalar(a[0])), a[1] === undefined ? 0 : toNum(scalar(a[1])), 'down'); },
    AND: function (a) { var r = true, any = false; a.forEach(function (x) { cellsOf(x).forEach(function (v) { if (typeof v === 'string' && Array.isArray(x)) return; if (v === null && Array.isArray(x)) return; any = true; if (!toBool(v)) r = false; }); }); if (!any) throw E('#VALUE!'); return r; },
    OR: function (a) { var r = false, any = false; a.forEach(function (x) { cellsOf(x).forEach(function (v) { if (typeof v === 'string' && Array.isArray(x)) return; if (v === null && Array.isArray(x)) return; any = true; if (toBool(v)) r = true; }); }); if (!any) throw E('#VALUE!'); return r; },
    NOT: function (a) { return !toBool(scalar(a[0])); },
    ISNUMBER: function (a) { return typeof scalar(a[0]) === 'number'; },
    ISTEXT: function (a) { return typeof scalar(a[0]) === 'string'; },
    ISBLANK: function (a) { return scalar(a[0]) === null; },
    ISERROR: function (a) { return !!isErr(scalar(a[0])); },
    NA: function () { throw E('#N/A'); },
    TODAY: function () { return Math.floor(Date.now() / 864e5) + Xl.EPOCH; },
    NOW: function () { return Date.now() / 864e5 + Xl.EPOCH; },
    DATE: function (a) { var y = toNum(scalar(a[0])), m = toNum(scalar(a[1])), d = toNum(scalar(a[2])); return serial(y, m, d); },
    YEAR: function (a) { return Xl.serialToParts(toNum(scalar(a[0]))).y; },
    MONTH: function (a) { return Xl.serialToParts(toNum(scalar(a[0]))).mo + 1; },
    DAY: function (a) { return Xl.serialToParts(toNum(scalar(a[0]))).d; },
    WEEKDAY: function (a) { var wd = Xl.serialToParts(toNum(scalar(a[0]))).wd, t = a[1] === undefined ? 1 : toNum(scalar(a[1])); return t === 2 ? (wd + 6) % 7 + 1 : t === 3 ? (wd + 6) % 7 : wd + 1; },
    CONCATENATE: function (a) { return a.map(function (x) { return toStr(scalar(x)); }).join(''); },
    CONCAT: function (a) { var s = ''; a.forEach(function (x) { cellsOf(x).forEach(function (v) { s += toStr(v); }); }); return s; },
    LEN: function (a) { return toStr(scalar(a[0])).length; },
    LEFT: function (a) { return toStr(scalar(a[0])).slice(0, a[1] === undefined ? 1 : toNum(scalar(a[1]))); },
    RIGHT: function (a) { var s = toStr(scalar(a[0])), n = a[1] === undefined ? 1 : toNum(scalar(a[1])); return n ? s.slice(-n) : ''; },
    MID: function (a) { var s = toStr(scalar(a[0])), st = toNum(scalar(a[1])), n = toNum(scalar(a[2])); return s.substr(st - 1, n); },
    UPPER: function (a) { return toStr(scalar(a[0])).toUpperCase(); },
    LOWER: function (a) { return toStr(scalar(a[0])).toLowerCase(); },
    TRIM: function (a) { return toStr(scalar(a[0])).replace(/\s+/g, ' ').trim(); },
    TEXT: function (a) { var v = scalar(a[0]); if (typeof v === 'number') return Xl.formatNumber(v, toStr(scalar(a[1]))); return toStr(v); },
    SUMIF: function (a) { var rng = cellsOf(a[0]), sum = a[2] !== undefined ? cellsOf(a[2]) : rng, f = critFn(a[1]), t = 0; rng.forEach(function (v, i) { if (f(v) && typeof sum[i] === 'number') t += sum[i]; }); return t; },
    COUNTIF: function (a) { var f = critFn(a[1]), c = 0; cellsOf(a[0]).forEach(function (v) { if (f(v)) c++; }); return c; },
    SUMPRODUCT: function (a) { var arrs = a.map(cellsOf), n = arrs[0].length, t = 0; for (var i = 0; i < n; i++) { var p = 1; arrs.forEach(function (x) { if (x.length !== n) throw E('#VALUE!'); p *= typeof x[i] === 'number' ? x[i] : 0; }); t += p; } return t; },
    INDEX: function (a) { var g = a[0]; if (!Array.isArray(g)) return g; var r = toNum(scalar(a[1])), c = a[2] === undefined ? (g[0].length === 1 ? 1 : 0) : toNum(scalar(a[2])); if (g.length === 1 && a[2] === undefined) { c = r; r = 1; } if (!r) r = 1; if (!c) c = 1; if (r > g.length || c > g[0].length || r < 1 || c < 1) throw E('#REF!'); return g[r - 1][c - 1]; },
    MATCH: function (a) {
      var v = scalar(a[0]), cells = cellsOf(a[1]), t = a[2] === undefined ? 1 : toNum(scalar(a[2])), i, best = -1;
      if (t === 0) { for (i = 0; i < cells.length; i++) if (cells[i] !== null && !isErr(cells[i]) && compare(cells[i], v) === 0) return i + 1; throw E('#N/A'); }
      for (i = 0; i < cells.length; i++) { if (cells[i] === null) continue; var c = compare(cells[i], v); if (t > 0 ? c <= 0 : c >= 0) best = i; else break; }
      if (best < 0) throw E('#N/A'); return best + 1;
    },
    VLOOKUP: function (a) {
      var v = scalar(a[0]), tb = a[1], col = toNum(scalar(a[2])), exact = a[3] !== undefined && !toBool(scalar(a[3])), hit = -1, i;
      if (!Array.isArray(tb) || col < 1 || col > tb[0].length) throw E('#REF!');
      for (i = 0; i < tb.length; i++) { var k = tb[i][0]; if (k === null || isErr(k)) continue; var c = compare(k, v); if (exact ? c === 0 : c <= 0) { hit = i; if (exact) break; } else if (!exact) break; }
      if (hit < 0) throw E('#N/A'); return tb[hit][col - 1];
    },
    XLOOKUP: function (a) {
      var v = scalar(a[0]), look = cellsOf(a[1]), ret = a[2], i;
      for (i = 0; i < look.length; i++) if (look[i] !== null && !isErr(look[i]) && compare(look[i], v) === 0) { var rc = cellsOf(ret); return rc[i] === undefined ? null : rc[i]; }
      if (a[3] !== undefined) return scalar(a[3]);
      throw E('#N/A');
    }
  };

  /* ---------- evaluator ---------- */
  function rangeOf(node, ctx) {
    var sheet = node.sheet || ctx.sheet, b = ctx.bounds(sheet);
    if (!b) throw E('#REF!');
    var m = /^([A-Z]+)(\d*):?([A-Z]*)(\d*)$/.exec(node.ref), r1, c1, r2, c2;
    if (/^[A-Z]+:[A-Z]+$/.test(node.ref)) { var cc = node.ref.split(':'); c1 = Xl.colToNum(cc[0]); c2 = Xl.colToNum(cc[1]); r1 = 1; r2 = Math.max(b.maxR, 1); }
    else { var p = node.ref.split(':'), a1 = Xl.parseAddr(p[0]), a2 = Xl.parseAddr(p[1] || p[0]); if (!a1 || !a2) throw E('#REF!'); r1 = Math.min(a1.r, a2.r); r2 = Math.max(a1.r, a2.r); c1 = Math.min(a1.c, a2.c); c2 = Math.max(a1.c, a2.c); }
    if (c1 > c2) { var t = c1; c1 = c2; c2 = t; }
    if ((r2 - r1 + 1) * (c2 - c1 + 1) > 400000) throw E('#VALUE!');
    var out = [];
    for (var r = r1; r <= r2; r++) { var row = []; for (var c = c1; c <= c2; c++) row.push(ctx.get(sheet, Xl.addr(c, r))); out.push(row); }
    return { rows: out, single: r1 === r2 && c1 === c2, sheet: sheet };
  }
  function ev(n, ctx) {
    switch (n.t) {
      case 'num': case 'str': case 'bool': return n.v;
      case 'err': throw E(n.v);
      case 'empty': return undefined;
      case 'ref': { var g = rangeOf(n, ctx); return g.single ? g.rows[0][0] : g.rows; }
      case 'pct': return toNum(scalar(ev(n.e, ctx))) / 100;
      case 'un': return -toNum(scalar(ev(n.e, ctx)));
      case 'bin': {
        var a = scalar(ev(n.l, ctx)), b = scalar(ev(n.r, ctx));
        switch (n.op) {
          case '+': return toNum(a) + toNum(b);
          case '-': return toNum(a) - toNum(b);
          case '*': return toNum(a) * toNum(b);
          case '/': { var d = toNum(b); if (d === 0) throw E('#DIV/0!'); return toNum(a) / d; }
          case '^': { var r = Math.pow(toNum(a), toNum(b)); if (!isFinite(r)) throw E('#NUM!'); return r; }
          case '&': return toStr(a) + toStr(b);
          case '=': return compare(a, b) === 0;
          case '<>': return compare(a, b) !== 0;
          case '<': return compare(a, b) < 0;
          case '>': return compare(a, b) > 0;
          case '<=': return compare(a, b) <= 0;
          default: return compare(a, b) >= 0;
        }
      }
      case 'fn': {
        var nm = n.name;
        if (nm === 'IF') { if (n.args.length < 2) throw E('#VALUE!'); var cnd = toBool(scalar(ev(n.args[0], ctx))); return cnd ? scalar(ev(n.args[1], ctx)) : (n.args[2] ? scalar(ev(n.args[2], ctx)) : false); }
        if (nm === 'IFERROR' || nm === 'IFNA') { try { var v = scalar(ev(n.args[0], ctx)); if (isErr(v)) throw v; return v; } catch (e) { if (e && e.err && !e.unsupported && (nm === 'IFERROR' || e.err === '#N/A')) return scalar(ev(n.args[1], ctx)); throw e; } }
        if (!FN[nm]) throw E('#NAME?', { unsupported: true, fn: nm });
        var args = n.args.map(function (x) { return ev(x, ctx); });
        return FN[nm](args);
      }
    }
    throw E('#NAME?');
  }

  function evaluate(text, ctx) {
    var t = String(text).replace(/^=/, '');
    try {
      var v = ev(parse(t), ctx);
      v = scalar(v);
      if (v === null || v === undefined) v = 0;
      if (isErr(v)) return { k: 'e', v: v.err };
      if (typeof v === 'number') { if (!isFinite(v)) return { k: 'e', v: '#NUM!' }; return { k: 'n', v: v }; }
      if (typeof v === 'boolean') return { k: 'b', v: v };
      return { k: 's', v: String(v) };
    } catch (e) {
      if (e && e.unsupported) return { k: '', v: null, unsupported: true, fn: e.fn };
      if (e && e.syntax) return { k: '', v: null, unsupported: true, syntax: true };
      if (e && e.err) return { k: 'e', v: e.err };
      throw e;
    }
  }

  return { evaluate: evaluate, parse: parse, FUNCTIONS: Object.keys(FN).concat(['IF', 'IFERROR', 'IFNA']).sort() };
});

/**
 * A small Excel formula engine for one worksheet (the team update page): parses the card's formulas and recalculates the
 * cells that depend on what the team edits, so formula cells follow the change as in Excel.
 *   XLCalc.sheet({ name, book, maxR, maxC, value(r, c), formulas: { ref: [text, cachedValue] }, today })
 *     .recalc(changedRefs) → { ref: newValue } for every formula cell that depends on them
 * Values: number · string · boolean · null (empty) · { e: "#VALUE!" } (error).
 * Formulas reading another workbook ([1]…) or another sheet keep the value Excel stored (cachedValue).
 */
(function () {
  "use strict";
  var ERR = function (e) { return { e: e }; }, isErr = function (v) { return v && typeof v === "object" && v.e; };
  function colNum(s) { var n = 0; s = s.replace(/\$/g, ""); for (var i = 0; i < s.length; i++) n = n * 26 + s.charCodeAt(i) - 64; return n; }
  function colStr(n) { var s = ""; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; }

  /* ------------------------------------------------------------------ tokenizer */
  var RE_SHEET = /^(?:'((?:[^']|'')+)'|(\[\d+\][^!'(),;=<>&+\-*\/^ ]+)|([A-Za-z_][A-Za-z0-9_.]*))!/;
  var RE_AREA = /^(\$?[A-Z]{1,3}\$?\d+)(?::(\$?[A-Z]{1,3}\$?\d+))?(?![A-Za-z0-9_(])/;
  var RE_COLS = /^(\$?[A-Z]{1,3}):(\$?[A-Z]{1,3})(?![A-Za-z0-9_(])/, RE_ROWS = /^(\$?\d+):(\$?\d+)(?![0-9])/;
  function cell(s) { var m = /^(\$?)([A-Z]{1,3})(\$?)(\d+)$/.exec(s); return { c: colNum(m[2]), r: +m[4], ac: !!m[1], ar: !!m[3] }; }
  function tokenize(src) {
    var out = [], i = 0, s = src;
    while (i < s.length) {
      var ch = s[i], rest = s.slice(i), m;
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === '"') { var j = i + 1, v = ""; for (;;) { if (j >= s.length) break; if (s[j] === '"') { if (s[j + 1] === '"') { v += '"'; j += 2; continue; } break; } v += s[j++]; } out.push({ t: "str", v: v }); i = j + 1; continue; }
      if ((m = /^#(?:REF!|VALUE!|N\/A|DIV\/0!|NAME\?|NUM!|NULL!|GETTING_DATA)/.exec(rest))) { out.push({ t: "err", v: m[0] }); i += m[0].length; continue; }
      if ((m = /^\d+(\.\d*)?([eE][+-]?\d+)?|^\.\d+([eE][+-]?\d+)?/.exec(rest)) && !RE_ROWS.test(rest)) { out.push({ t: "num", v: parseFloat(m[0]) }); i += m[0].length; continue; }
      var sh = null, ext = false, pre = 0;
      if ((m = RE_SHEET.exec(rest))) { sh = m[1] != null ? m[1].replace(/''/g, "'") : m[2] || m[3]; ext = /^\[\d+\]/.test(sh) || !!m[2]; pre = m[0].length; rest = rest.slice(pre); }
      if ((m = RE_AREA.exec(rest))) { out.push({ t: "ref", sheet: sh, ext: ext, a: cell(m[1]), b: m[2] ? cell(m[2]) : null }); i += pre + m[0].length; continue; }
      if ((m = RE_COLS.exec(rest))) { out.push({ t: "ref", sheet: sh, ext: ext, a: { c: colNum(m[1]), r: 1 }, b: { c: colNum(m[2]), r: 1048576 } }); i += pre + m[0].length; continue; }
      if ((m = RE_ROWS.exec(rest))) { out.push({ t: "ref", sheet: sh, ext: ext, a: { c: 1, r: +m[1].replace("$", "") }, b: { c: 16384, r: +m[2].replace("$", "") } }); i += pre + m[0].length; continue; }
      if (sh != null && /^#REF!/.test(rest)) { out.push({ t: "err", v: "#REF!" }); i += pre + 5; continue; }
      if ((m = /^(_xlfn\.|_xlws\.)?([A-Za-z][A-Za-z0-9_.]*)\s*\(/.exec(rest))) { out.push({ t: "fn", v: m[2].toUpperCase() }); i += m[0].length; continue; }
      if ((m = /^(TRUE|FALSE)(?![A-Za-z0-9_(])/i.exec(rest))) { out.push({ t: "bool", v: m[1].toUpperCase() === "TRUE" }); i += m[0].length; continue; }
      if ((m = /^(<=|>=|<>)/.exec(rest))) { out.push({ t: "op", v: m[0] }); i += 2; continue; }
      if ("+-*/^&=<>%".indexOf(ch) >= 0) { out.push({ t: "op", v: ch }); i++; continue; }
      if ("(),;{}@".indexOf(ch) >= 0) { if (ch !== "@") out.push({ t: ch }); i++; continue; }
      if ((m = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(rest))) { out.push({ t: "name", v: m[0] }); i += m[0].length; continue; }
      throw new Error("Cannot read formula at: " + rest.slice(0, 12));
    }
    return out;
  }

  /* ------------------------------------------------------------------ parser (precedence climbing) */
  var BIN = { "=": 1, "<>": 1, "<": 1, ">": 1, "<=": 1, ">=": 1, "&": 2, "+": 3, "-": 3, "*": 4, "/": 4, "^": 5 };
  function parse(src) {
    var tk = tokenize(src.replace(/^=/, "")), p = 0;
    function peek() { return tk[p]; }
    function next() { return tk[p++]; }
    function expect(t) { var x = next(); if (!x || x.t !== t) throw new Error("Expected " + t); return x; }
    function expr(minP) {
      var left = unary();
      for (;;) {
        var t = peek(); if (!t || t.t !== "op" || !(t.v in BIN) || BIN[t.v] < minP) break;
        next(); var pr = BIN[t.v], right = expr(t.v === "^" ? pr : pr + 1);
        left = ["op", t.v, left, right];
      }
      return left;
    }
    function unary() {
      var t = peek();
      if (t && t.t === "op" && (t.v === "-" || t.v === "+")) { next(); var a = unary(); return t.v === "-" ? ["neg", a] : a; }
      return postfix(primary());
    }
    function postfix(a) { while (peek() && peek().t === "op" && peek().v === "%") { next(); a = ["pct", a]; } return a; }
    function primary() {
      var t = next(); if (!t) throw new Error("Unexpected end");
      if (t.t === "num") return ["n", t.v];
      if (t.t === "str") return ["s", t.v];
      if (t.t === "bool") return ["b", t.v];
      if (t.t === "err") return ["e", t.v];
      if (t.t === "ref") return ["ref", t];
      if (t.t === "name") return ["e", "#NAME?"];
      if (t.t === "(") { var e = expr(1); expect(")"); return e; }
      if (t.t === "{") {
        var rows = [[]];
        for (;;) { var x = next(); if (!x) throw new Error("Unclosed array"); if (x.t === "}") break; if (x.t === ";") { rows.push([]); continue; } if (x.t === ",") continue;
          var neg = false; if (x.t === "op" && x.v === "-") { neg = true; x = next(); }
          rows[rows.length - 1].push(x.t === "num" ? (neg ? -x.v : x.v) : x.t === "str" ? x.v : x.t === "bool" ? x.v : ERR(x.v)); }
        return ["arr", rows];
      }
      if (t.t === "fn") {
        var args = [];
        if (peek() && peek().t === ")") { next(); return ["fn", t.v, args]; }
        for (;;) {
          if (peek() && (peek().t === "," || peek().t === ")")) args.push(["empty"]); else args.push(expr(1));
          var x2 = next(); if (!x2) throw new Error("Unclosed function"); if (x2.t === ")") break; if (x2.t !== ",") throw new Error("Bad argument list");
        }
        return ["fn", t.v, args];
      }
      throw new Error("Unexpected token " + t.t);
    }
    var ast = expr(1); if (p < tk.length) throw new Error("Unexpected tail");
    return ast;
  }
  /* shift the relative references of a shared formula from its master cell by (dr, dc) */
  function shift(src, dr, dc) {
    if (!dr && !dc) return src;
    var out = "", i = 0;
    while (i < src.length) {
      var ch = src[i];
      if (ch === '"') { var j = src.indexOf('"', i + 1); while (j >= 0 && src[j + 1] === '"') j = src.indexOf('"', j + 2); j = j < 0 ? src.length : j + 1; out += src.slice(i, j); i = j; continue; }
      if (ch === "'") { var k = src.indexOf("'!", i + 1); if (k > 0) { out += src.slice(i, k + 2); i = k + 2; continue; } }
      var rest = src.slice(i), prev = out.slice(-1), m = /^(\$?)([A-Z]{1,3})(\$?)(\d+)(?![A-Za-z0-9_(])/.exec(rest);
      if (m && !/[A-Za-z0-9_.]/.test(prev)) {
        var c = m[1] ? colNum(m[2]) : colNum(m[2]) + dc, r = m[3] ? +m[4] : +m[4] + dr;
        out += m[1] + colStr(c) + m[3] + r; i += m[0].length; continue;
      }
      if ((m = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(rest))) { out += m[0]; i += m[0].length; continue; }
      out += ch; i++;
    }
    return out;
  }

  /* ------------------------------------------------------------------ values & coercion */
  function toNum(v) {
    if (isErr(v)) return v;
    if (v == null) return 0;
    if (v === "") return ERR("#VALUE!");             // a formula's "" is text, not zero (an empty cell is null → 0)
    if (typeof v === "number") return v;
    if (typeof v === "boolean") return v ? 1 : 0;
    var s = String(v).trim(), pct = /%$/.test(s); if (pct) s = s.slice(0, -1);
    if (/^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/.test(s.replace(/,/g, ""))) return +s.replace(/,/g, "") / (pct ? 100 : 1);
    var dt = Date.parse(s); if (!isNaN(dt) && /[a-z]|\d[-/]\d/i.test(s)) return Math.floor((dt - Date.UTC(1899, 11, 30)) / 864e5 + (new Date(dt).getTimezoneOffset() / 1440));
    return ERR("#VALUE!");
  }
  function toStr(v) {
    if (isErr(v)) return v; if (v == null) return ""; if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    if (typeof v === "number") { var r = Math.round(v * 1e10) / 1e10; return String(r); }
    return String(v);
  }
  function toBool(v) {
    if (isErr(v)) return v; if (v == null) return false; if (typeof v === "boolean") return v; if (typeof v === "number") return v !== 0;
    var s = String(v).toUpperCase(); if (s === "TRUE") return true; if (s === "FALSE") return false; return ERR("#VALUE!");
  }
  function cmp(a, b) {                           // Excel ordering: numbers < text < booleans; text case-insensitive; empty = 0 / ""
    if (a == null) a = typeof b === "string" ? "" : typeof b === "boolean" ? false : 0;
    if (b == null) b = typeof a === "string" ? "" : typeof a === "boolean" ? false : 0;
    var ta = typeof a === "number" ? 0 : typeof a === "string" ? 1 : 2, tb = typeof b === "number" ? 0 : typeof b === "string" ? 1 : 2;
    if (ta !== tb) return ta - tb;
    if (ta === 0) { a = +a.toPrecision(15); b = +b.toPrecision(15); }   // Excel compares numbers to 15 significant digits
    if (ta === 1) { a = a.toLowerCase(); b = b.toLowerCase(); }
    if (ta === 2) { a = a ? 1 : 0; b = b ? 1 : 0; }
    return a < b ? -1 : a > b ? 1 : 0;
  }
  /* Excel's 1900 calendar: serial 0 = "0 Jan 1900", serial 60 = the phantom 29 Feb 1900 */
  function serial(y, m, d) { var v = (Date.UTC(y, m, d) - Date.UTC(1899, 11, 30)) / 864e5; return v < 61 ? v - 1 : v; }
  function ymd(n) { n = Math.floor(n); if (n === 0) return { y: 1900, m: 0, d: 0, wd: 6 }; var d = new Date(Date.UTC(1899, 11, 30) + (n < 61 ? n + 1 : n) * 864e5); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), wd: d.getUTCDay() }; }

  /* ------------------------------------------------------------------ the sheet */
  function Sheet(o) {
    this.o = o; this.cache = {}; this.ast = {}; this.calc = null; this.deps = null;
    this.maxR = o.maxR || 1000; this.maxC = o.maxC || 200;
  }
  function Rng(sh, a, b) { this.sh = sh; this.r1 = Math.min(a.r, b.r); this.c1 = Math.min(a.c, b.c); this.r2 = Math.max(a.r, b.r); this.c2 = Math.max(a.c, b.c); }
  Rng.prototype.rows = function () { var sh = this.sh, out = [], r2 = Math.min(this.r2, sh.maxR), c2 = Math.min(this.c2, sh.maxC);
    for (var r = this.r1; r <= r2; r++) { var row = []; for (var c = this.c1; c <= c2; c++) row.push(sh.val(r, c)); out.push(row); }
    if (!out.length) out.push([null]); return out; };
  Rng.prototype.first = function () { return this.sh.val(this.r1, this.c1); };
  function Arr(rows) { this.a = rows; }

  Sheet.prototype.formula = function (ref) { var f = this.o.formulas[ref]; return f ? f : null; };
  Sheet.prototype.isExt = function (ref) {
    var f = this.formula(ref); if (!f) return false;
    if (f.ext != null) return f.ext;
    var self = this.o.name;
    f.ext = /\[\d+\]/.test(f[0]) || /CELL\("filename"\)/i.test(f[0]) && false;
    if (!f.ext) { var re = /(?:'((?:[^']|'')+)'|([A-Za-z_][A-Za-z0-9_.]*))!/g, m; while ((m = re.exec(f[0]))) { var n = (m[1] || m[2] || "").replace(/''/g, "'"); if (n !== self) { f.ext = true; break; } } }
    return f.ext;
  };
  Sheet.prototype.astOf = function (ref) {
    if (ref in this.ast) return this.ast[ref];
    var f = this.formula(ref), a = null;
    try { a = f ? parse(f[0]) : null; } catch (e) { a = null; }
    return (this.ast[ref] = a);
  };
  /* current value of a cell: edited value, recalculated formula (when dirty), else what Excel stored */
  Sheet.prototype.val = function (r, c) {
    var ref = colStr(c) + r, sh = this;
    if (sh.o.fixed && ref in sh.o.fixed) return sh.o.value(r, c);   // a value the user typed over a formula wins
    if (sh.calc && ref in sh.calc) {
      var cv = sh.calc[ref];
      if (cv === undefined) {                      // dirty and not computed yet in this pass
        sh.calc[ref] = sh.o.value(r, c);            // cycle guard: the stored value
        cv = sh.evalCell(ref); sh.calc[ref] = cv;
      }
      return cv;
    }
    return sh.o.value(r, c);
  };
  Sheet.prototype.evalCell = function (ref) {
    var a = this.astOf(ref), f = this.formula(ref);
    if (!a || this.isExt(ref)) return f ? f[1] : null;
    var v;
    try { v = this.ev(a); } catch (e) { return f[1]; }   // something the engine does not know: keep Excel's value
    if (v instanceof Rng) v = v.r1 === v.r2 && v.c1 === v.c2 ? v.first() : v.first();
    if (v instanceof Arr) v = v.a[0][0];
    if (v == null) v = 0;                              // a formula pointing at an empty cell shows 0
    return v;
  };
  Sheet.prototype.rng = function (t) {
    if (t.ext || (t.sheet && t.sheet !== this.o.name)) throw new Error("external");
    return new Rng(this, t.a, t.b || t.a);
  };
  function scalar(v) { if (v instanceof Rng) return v.r1 === v.r2 && v.c1 === v.c2 ? v.first() : v.first(); if (v instanceof Arr) return v.a[0][0]; return v; }
  function grid(v) { if (v instanceof Rng) return v.rows(); if (v instanceof Arr) return v.a; return [[v]]; }
  function isArrLike(v) { return (v instanceof Rng && (v.r1 !== v.r2 || v.c1 !== v.c2)) || v instanceof Arr; }
  function map2(a, b, fn) {                       // element-wise with broadcasting (array formulas / SUMPRODUCT)
    if (!isArrLike(a) && !isArrLike(b)) return fn(scalar(a), scalar(b));
    var A = grid(a), B = grid(b), R = Math.max(A.length, B.length), C = Math.max(A[0].length, B[0].length), out = [];
    for (var i = 0; i < R; i++) { var row = []; for (var j = 0; j < C; j++) {
      var x = A[A.length === 1 ? 0 : i] ? A[A.length === 1 ? 0 : i][A[0].length === 1 ? 0 : j] : ERR("#N/A"), y = B[B.length === 1 ? 0 : i] ? B[B.length === 1 ? 0 : i][B[0].length === 1 ? 0 : j] : ERR("#N/A");
      row.push(x === undefined || y === undefined ? ERR("#N/A") : fn(x, y)); } out.push(row); }
    return new Arr(out);
  }
  function map1(a, fn) { if (!isArrLike(a)) return fn(scalar(a)); return new Arr(grid(a).map(function (r) { return r.map(fn); })); }
  function binop(op, x, y) {
    if (isErr(x)) return x; if (isErr(y)) return y;
    if (op === "&") { return toStr(x) + toStr(y); }
    if (/^(=|<>|<|>|<=|>=)$/.test(op)) { var c = cmp(x, y); return op === "=" ? c === 0 : op === "<>" ? c !== 0 : op === "<" ? c < 0 : op === ">" ? c > 0 : op === "<=" ? c <= 0 : c >= 0; }
    var a = toNum(x), b = toNum(y); if (isErr(a)) return a; if (isErr(b)) return b;
    switch (op) { case "+": return a + b; case "-": return a - b; case "*": return a * b; case "/": return b === 0 ? ERR("#DIV/0!") : a / b; case "^": return Math.pow(a, b); }
    return ERR("#VALUE!");
  }
  Sheet.prototype.ev = function (n) {
    var sh = this;
    switch (n[0]) {
      case "n": case "s": case "b": return n[1];
      case "e": return ERR(n[1]);
      case "empty": return null;
      case "arr": return new Arr(n[1]);
      case "ref": return sh.rng(n[1]);
      case "neg": return map1(sh.ev(n[1]), function (v) { var x = toNum(v); return isErr(x) ? x : -x; });
      case "pct": return map1(sh.ev(n[1]), function (v) { var x = toNum(v); return isErr(x) ? x : x / 100; });
      case "op": return map2(sh.ev(n[2]), sh.ev(n[3]), function (x, y) { return binop(n[1], x, y); });
      case "fn": var f = FN[n[1]]; if (!f) throw new Error("Unknown function " + n[1]); return f(sh, n[2]);
    }
    throw new Error("Bad node");
  };
  /* ------------------------------------------------------------------ functions */
  function vals(sh, args, fromRefsTextToo) {   // flatten arguments: numbers from ranges, coerced scalars
    var out = [];
    args.forEach(function (a) {
      var v = sh.ev(a);
      if (isArrLike(v) || v instanceof Rng) grid(v).forEach(function (r) { r.forEach(function (x) { out.push({ v: x, ref: true }); }); });
      else out.push({ v: v, ref: false });
    });
    return out;
  }
  function nums(sh, args) {
    var out = [];
    for (var i = 0, l = vals(sh, args); i < l.length; i++) {
      var x = l[i].v;
      if (isErr(x)) return x;
      if (l[i].ref) { if (typeof x === "number") out.push(x); }
      else { var n = toNum(x); if (isErr(n)) return n; out.push(n); }
    }
    return out;
  }
  function crit(c) {                               // COUNTIF / SUMIFS criteria
    if (isErr(c)) return function () { return false; };
    if (typeof c === "number" || typeof c === "boolean") return function (v) { return cmp(v, c) === 0 && v != null; };
    var s = c == null ? "" : String(c), m = /^(<=|>=|<>|<|>|=)?([\s\S]*)$/.exec(s), op = m[1] || "=", rhs = m[2], rn = toNum(rhs), isN = rhs !== "" && !isErr(rn);
    if (!isN && (op === "=" || op === "<>") ) {
      var re = rhs === "" ? null : new RegExp("^" + rhs.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/~\*/g, "\u0001").replace(/~\?/g, "\u0002").replace(/\*/g, "[\\s\\S]*").replace(/\?/g, ".").replace(/\u0001/g, "\\*").replace(/\u0002/g, "\\?") + "$", "i");
      return function (v) { var hit = re ? (v != null && typeof v !== "number" && re.test(String(v))) : (v == null || v === ""); return op === "=" ? hit : !hit; };
    }
    return function (v) {
      if (isN) { if (typeof v !== "number") { if (op === "<>") return true; return false; } var c2 = v - rn; return op === "=" ? c2 === 0 : op === "<>" ? c2 !== 0 : op === "<" ? c2 < 0 : op === ">" ? c2 > 0 : op === "<=" ? c2 <= 0 : c2 >= 0; }
      if (v == null || typeof v === "number") return op === "<>";
      var c3 = cmp(String(v), rhs); return op === "<" ? c3 < 0 : op === ">" ? c3 > 0 : op === "<=" ? c3 <= 0 : op === ">=" ? c3 >= 0 : false;
    };
  }
  function ifsMatch(sh, pairs) {                   // [[rangeNode, critNode], …] → boolean grid
    var masks = null;
    pairs.forEach(function (pr) {
      var g = grid(sh.ev(pr[0])), f = crit(scalar(sh.ev(pr[1])));
      var m = g.map(function (r) { return r.map(function (v) { return f(v); }); });
      masks = masks ? masks.map(function (r, i) { return r.map(function (x, j) { return x && m[i] && m[i][j]; }); }) : m;
    });
    return masks;
  }
  function a1(sh, n) { return scalar(sh.ev(n)); }
  function N1(sh, n) { return toNum(a1(sh, n)); }
  function S1(sh, n) { return toStr(a1(sh, n)); }
  function errOf() { for (var i = 0; i < arguments.length; i++) if (isErr(arguments[i])) return arguments[i]; return null; }
  function eomonth(d, m) { var t = ymd(d); return serial(t.y, t.m + m + 1, 0); }
  function edate(d, m) { var t = ymd(d), last = new Date(Date.UTC(t.y, t.m + m + 1, 0)).getUTCDate(); return serial(t.y, t.m + m, Math.min(t.d, last)); }
  function textOf(v, f) {
    var e = errOf(v, f); if (e) return e;
    var n = typeof v === "number" ? v : v == null ? 0 : toNum(v); if (isErr(n)) return typeof v === "string" ? v : n;
    return window.SARCardForm && SARCardForm.fmtNum ? SARCardForm.fmtNum(n, f, SARCardForm.isDateFmt(0, f)) : String(n);
  }
  var FN = {
    IF: function (sh, a) { var c = toBool(a1(sh, a[0])); if (isErr(c)) return c; return c ? (a[1] ? sh.ev(a[1]) : true) : (a.length > 2 ? sh.ev(a[2]) : false); },
    IFS: function (sh, a) { for (var i = 0; i + 1 < a.length; i += 2) { var c = toBool(a1(sh, a[i])); if (isErr(c)) return c; if (c) return sh.ev(a[i + 1]); } return ERR("#N/A"); },
    IFERROR: function (sh, a) { var v; try { v = sh.ev(a[0]); } catch (e) { return sh.ev(a[1]); } var s = scalar(v); return isErr(s) ? sh.ev(a[1]) : v; },
    AND: function (sh, a) { var r = true; for (var i = 0, l = vals(sh, a); i < l.length; i++) { var x = l[i].v; if (isErr(x)) return x; if (l[i].ref && typeof x === "string") continue; var b = toBool(x); if (isErr(b)) return b; r = r && b; } return r; },
    OR: function (sh, a) { var r = false; for (var i = 0, l = vals(sh, a); i < l.length; i++) { var x = l[i].v; if (isErr(x)) return x; if (l[i].ref && typeof x === "string") continue; var b = toBool(x); if (isErr(b)) return b; r = r || b; } return r; },
    NOT: function (sh, a) { var b = toBool(a1(sh, a[0])); return isErr(b) ? b : !b; },
    SUM: function (sh, a) { var n = nums(sh, a); return isErr(n) ? n : n.reduce(function (s, x) { return s + x; }, 0); },
    MAX: function (sh, a) { var n = nums(sh, a); return isErr(n) ? n : n.length ? Math.max.apply(null, n) : 0; },
    MIN: function (sh, a) { var n = nums(sh, a); return isErr(n) ? n : n.length ? Math.min.apply(null, n) : 0; },
    AVERAGE: function (sh, a) { var n = nums(sh, a); return isErr(n) ? n : n.length ? n.reduce(function (s, x) { return s + x; }, 0) / n.length : ERR("#DIV/0!"); },
    COUNT: function (sh, a) { return vals(sh, a).filter(function (x) { return typeof x.v === "number"; }).length; },
    COUNTA: function (sh, a) { return vals(sh, a).filter(function (x) { return x.v != null; }).length; },
    COUNTBLANK: function (sh, a) { return vals(sh, a).filter(function (x) { return x.v == null || x.v === ""; }).length; },
    INT: function (sh, a) { var x = N1(sh, a[0]); return isErr(x) ? x : Math.floor(x); },
    ROUND: function (sh, a) { var x = N1(sh, a[0]), d = a[1] ? N1(sh, a[1]) : 0, e = errOf(x, d); if (e) return e; var k = Math.pow(10, d); return Math.round(x * k) / k; },
    ROUNDUP: function (sh, a) { var x = N1(sh, a[0]), d = a[1] ? N1(sh, a[1]) : 0, k = Math.pow(10, d); return (x < 0 ? -1 : 1) * Math.ceil(Math.abs(x) * k - 1e-9) / k; },
    ROUNDDOWN: function (sh, a) { var x = N1(sh, a[0]), d = a[1] ? N1(sh, a[1]) : 0, k = Math.pow(10, d); return (x < 0 ? -1 : 1) * Math.floor(Math.abs(x) * k + 1e-9) / k; },
    ABS: function (sh, a) { var x = N1(sh, a[0]); return isErr(x) ? x : Math.abs(x); },
    CHOOSE: function (sh, a) { var i = N1(sh, a[0]); if (isErr(i)) return i; i = Math.floor(i); if (i < 1 || i >= a.length) return ERR("#VALUE!"); return sh.ev(a[i]); },
    RIGHT: function (sh, a) { var s = S1(sh, a[0]), n = a[1] ? N1(sh, a[1]) : 1, e = errOf(s, n); if (e) return e; return n <= 0 ? "" : s.slice(-n); },
    LEFT: function (sh, a) { var s = S1(sh, a[0]), n = a[1] ? N1(sh, a[1]) : 1, e = errOf(s, n); if (e) return e; return s.slice(0, Math.max(0, n)); },
    MID: function (sh, a) { var s = S1(sh, a[0]), st = N1(sh, a[1]), n = N1(sh, a[2]), e = errOf(s, st, n); if (e) return e; return s.substr(st - 1, n); },
    LEN: function (sh, a) { var s = S1(sh, a[0]); return isErr(s) ? s : s.length; },
    FIND: function (sh, a) { var f = S1(sh, a[0]), s = S1(sh, a[1]), st = a[2] ? N1(sh, a[2]) : 1, e = errOf(f, s, st); if (e) return e; var i = s.indexOf(f, st - 1); return i < 0 ? ERR("#VALUE!") : i + 1; },
    SEARCH: function (sh, a) { var f = S1(sh, a[0]).toLowerCase(), s = S1(sh, a[1]).toLowerCase(), i = s.indexOf(f, (a[2] ? N1(sh, a[2]) : 1) - 1); return i < 0 ? ERR("#VALUE!") : i + 1; },
    PROPER: function (sh, a) { var s = S1(sh, a[0]); return isErr(s) ? s : s.toLowerCase().replace(/(^|[^A-Za-z])([a-z])/g, function (m, p, c) { return p + c.toUpperCase(); }); },
    UPPER: function (sh, a) { var s = S1(sh, a[0]); return isErr(s) ? s : s.toUpperCase(); },
    LOWER: function (sh, a) { var s = S1(sh, a[0]); return isErr(s) ? s : s.toLowerCase(); },
    TRIM: function (sh, a) { var s = S1(sh, a[0]); return isErr(s) ? s : s.replace(/ +/g, " ").trim(); },
    CONCATENATE: function (sh, a) { var o = ""; for (var i = 0; i < a.length; i++) { var s = S1(sh, a[i]); if (isErr(s)) return s; o += s; } return o; },
    VALUE: function (sh, a) { return toNum(a1(sh, a[0])); },
    TEXT: function (sh, a) {
      var src = sh.ev(a[0]), f0 = S1(sh, a[1]);
      if (isArrLike(src)) return map1(src, function (x) { return textOf(x, f0); });   // TEXT over a range (inside SUMPRODUCT)
      return textOf(scalar(src), f0);
    },
    TEXT_OLD: function (sh, a) {
      var v = a1(sh, a[0]), f = S1(sh, a[1]), e = errOf(v, f); if (e) return e;
      var n = typeof v === "number" ? v : toNum(v); if (isErr(n)) return typeof v === "string" ? v : n;
      return window.SARCardForm && SARCardForm.fmtNum ? SARCardForm.fmtNum(n, f, SARCardForm.isDateFmt(0, f)) : String(n);
    },
    TODAY: function (sh) { return sh.o.today != null ? sh.o.today : Math.floor((Date.now() - new Date().getTimezoneOffset() * 6e4 - Date.UTC(1899, 11, 30)) / 864e5); },
    NOW: function (sh) { return FN.TODAY(sh); },
    DATE: function (sh, a) { var y = N1(sh, a[0]), m = N1(sh, a[1]), d = N1(sh, a[2]), e = errOf(y, m, d); if (e) return e; return serial(y, m - 1, d); },
    YEAR: function (sh, a) { var x = N1(sh, a[0]); return isErr(x) ? x : ymd(x).y; },
    MONTH: function (sh, a) { var x = N1(sh, a[0]); return isErr(x) ? x : ymd(x).m + 1; },
    DAY: function (sh, a) { var x = N1(sh, a[0]); return isErr(x) ? x : ymd(x).d; },
    EOMONTH: function (sh, a) { var d = N1(sh, a[0]), m = N1(sh, a[1]), e = errOf(d, m); if (e) return e; if (d < 0) return ERR("#NUM!"); return eomonth(d, Math.trunc(m)); },
    EDATE: function (sh, a) { var d = N1(sh, a[0]), m = N1(sh, a[1]), e = errOf(d, m); if (e) return e; if (d < 0) return ERR("#NUM!"); return edate(d, Math.trunc(m)); },
    DATEDIF: function (sh, a) {
      var s = N1(sh, a[0]), t = N1(sh, a[1]), u = S1(sh, a[2]).toUpperCase(), e = errOf(s, t, u); if (e) return e;
      s = Math.floor(s); t = Math.floor(t); if (t < s) return ERR("#NUM!");
      var A = ymd(s), B = ymd(t), mo = (B.y - A.y) * 12 + B.m - A.m - (B.d < A.d ? 1 : 0);
      if (u === "D") return t - s; if (u === "M") return mo; if (u === "Y") return Math.floor(mo / 12); if (u === "YM") return mo % 12;
      if (u === "MD") { var pd = B.d - A.d; if (pd < 0) pd += new Date(Date.UTC(B.y, B.m, 0)).getUTCDate(); return pd; }
      if (u === "YD") { var yy = B.y - (B.m < A.m || (B.m === A.m && B.d < A.d) ? 1 : 0); return t - serial(yy, A.m, A.d); }
      return ERR("#NUM!");
    },
    NETWORKDAYS: function (sh, a) { var s = Math.floor(N1(sh, a[0])), t = Math.floor(N1(sh, a[1])), n = 0, st = s <= t ? 1 : -1; for (var d = s; st > 0 ? d <= t : d >= t; d += st) { var w = ymd(d).wd; if (w !== 5 && w !== 6) n++; } return n * st; },
    SUMIF: function (sh, a) { var g = grid(sh.ev(a[0])), f = crit(scalar(sh.ev(a[1]))), s = a[2] ? grid(sh.ev(a[2])) : g, t = 0;
      g.forEach(function (r, i) { r.forEach(function (v, j) { if (f(v)) { var x = s[i] && s[i][j]; if (typeof x === "number") t += x; } }); }); return t; },
    SUMIFS: function (sh, a) { var s = grid(sh.ev(a[0])), pr = []; for (var i = 1; i + 1 < a.length; i += 2) pr.push([a[i], a[i + 1]]); var m = ifsMatch(sh, pr), t = 0;
      s.forEach(function (r, i2) { r.forEach(function (x, j) { if (m[i2] && m[i2][j] && typeof x === "number") t += x; }); }); return t; },
    COUNTIF: function (sh, a) { var m = ifsMatch(sh, [[a[0], a[1]]]), n = 0; m.forEach(function (r) { r.forEach(function (x) { if (x) n++; }); }); return n; },
    COUNTIFS: function (sh, a) { var pr = []; for (var i = 0; i + 1 < a.length; i += 2) pr.push([a[i], a[i + 1]]); var m = ifsMatch(sh, pr), n = 0; m.forEach(function (r) { r.forEach(function (x) { if (x) n++; }); }); return n; },
    AVERAGEIF: function (sh, a) { var g = grid(sh.ev(a[0])), f = crit(scalar(sh.ev(a[1]))), s = a[2] ? grid(sh.ev(a[2])) : g, t = 0, n = 0;
      g.forEach(function (r, i) { r.forEach(function (v, j) { if (f(v)) { var x = s[i] && s[i][j]; if (typeof x === "number") { t += x; n++; } } }); }); return n ? t / n : ERR("#DIV/0!"); },
    SUMPRODUCT: function (sh, a) {
      var gs = a.map(function (n) { return grid(sh.ev(n)); }), R = gs[0].length, C = gs[0][0].length, t = 0;
      for (var i = 0; i < R; i++) for (var j = 0; j < C; j++) { var p = 1; for (var k = 0; k < gs.length; k++) { var v = gs[k][i] ? gs[k][i][j] : 0; if (isErr(v)) return v; p *= typeof v === "number" ? v : typeof v === "boolean" && a.length === 1 ? (v ? 1 : 0) : typeof v === "boolean" ? (v ? 1 : 0) : 0; } t += p; }
      return t;
    },
    SINGLE: function (sh, a) { return a1(sh, a[0]); },
    ISBLANK: function (sh, a) { var v = a1(sh, a[0]); return v == null; },
    ISNUMBER: function (sh, a) { return typeof a1(sh, a[0]) === "number"; },
    ISTEXT: function (sh, a) { return typeof a1(sh, a[0]) === "string"; },
    ISERROR: function (sh, a) { var v; try { v = a1(sh, a[0]); } catch (e) { return true; } return !!isErr(v); },
    ISNA: function (sh, a) { var v = a1(sh, a[0]); return !!(isErr(v) && v.e === "#N/A"); },
    NA: function () { return ERR("#N/A"); },
    CELL: function (sh, a) {
      var what = S1(sh, a[0]).toLowerCase();
      if (what === "filename") return "C:\\[" + (sh.o.book || "Book.xlsx") + "]" + sh.o.name;
      if (what === "row" && a[1]) { var r = sh.ev(a[1]); return r instanceof Rng ? r.r1 : ERR("#VALUE!"); }
      if (what === "col" && a[1]) { var c = sh.ev(a[1]); return c instanceof Rng ? c.c1 : ERR("#VALUE!"); }
      throw new Error("CELL " + what);
    },
    INDIRECT: function (sh, a) {
      var t = S1(sh, a[0]); if (isErr(t)) return t;
      var tk = tokenize(t); if (tk.length !== 1 || tk[0].t !== "ref") return ERR("#REF!");
      if (tk[0].ext || (tk[0].sheet && tk[0].sheet !== sh.o.name)) throw new Error("external");
      return sh.rng(tk[0]);
    },
    ROW: function (sh, a) { var r = a[0] ? sh.ev(a[0]) : null; return r instanceof Rng ? r.r1 : ERR("#VALUE!"); },
    COLUMN: function (sh, a) { var r = a[0] ? sh.ev(a[0]) : null; return r instanceof Rng ? r.c1 : ERR("#VALUE!"); },
    INDEX: function (sh, a) { var g = grid(sh.ev(a[0])), r = a[1] ? N1(sh, a[1]) : 1, c = a[2] ? N1(sh, a[2]) : 1; if (g.length === 1 && a.length === 2) { c = r; r = 1; } var row = g[r - 1]; return row && c - 1 < row.length ? row[c - 1] : ERR("#REF!"); },
    MATCH: function (sh, a) {
      var v = a1(sh, a[0]), g = grid(sh.ev(a[1])), list = g.length === 1 ? g[0] : g.map(function (r) { return r[0]; }), t = a[2] ? N1(sh, a[2]) : 1;
      if (t === 0) { var f = crit(v); for (var i = 0; i < list.length; i++) if (typeof v === "string" ? f(list[i]) : cmp(list[i], v) === 0 && list[i] != null) return i + 1; return ERR("#N/A"); }
      var best = -1; for (var j = 0; j < list.length; j++) { var c = cmp(list[j], v); if (t > 0 ? c <= 0 : c >= 0) best = j; else break; } return best < 0 ? ERR("#N/A") : best + 1;
    },
    VLOOKUP: function (sh, a) {
      var v = a1(sh, a[0]), g = grid(sh.ev(a[1])), col = N1(sh, a[2]), approx = a[3] ? toBool(a1(sh, a[3])) : true;
      if (isErr(v)) return v; var hit = -1;
      if (approx === false || approx === 0) { var f = typeof v === "string" ? crit(v) : null; for (var i = 0; i < g.length; i++) if (f ? f(g[i][0]) : cmp(g[i][0], v) === 0 && g[i][0] != null) { hit = i; break; } }
      else for (var j = 0; j < g.length; j++) { if (g[j][0] == null) continue; if (cmp(g[j][0], v) <= 0) hit = j; else break; }
      if (hit < 0) return ERR("#N/A"); var row = g[hit]; return col - 1 < row.length ? row[col - 1] : ERR("#REF!");
    }
  };

  /* ------------------------------------------------------------------ dependencies & recalculation */
  Sheet.prototype.refsOf = function (n, out) {
    if (!n) return out;
    if (n[0] === "ref") { if (!n[1].ext && !(n[1].sheet && n[1].sheet !== this.o.name)) out.push(n[1]); return out; }
    if (n[0] === "fn" || n[0] === "op" || n[0] === "neg" || n[0] === "pct") (n[0] === "fn" ? n[2] : n.slice(n[0] === "op" ? 2 : 1)).forEach(function (x) { this.refsOf(x, out); }, this);
    return out;
  };
  Sheet.prototype.buildDeps = function () {
    var sh = this, rev = {}, dyn = [];
    Object.keys(sh.o.formulas).forEach(function (ref) {
      var a = sh.astOf(ref); if (!a) return;
      if (/INDIRECT|OFFSET/i.test(sh.o.formulas[ref][0])) dyn.push(ref);
      sh.refsOf(a, []).forEach(function (t) {
        var b = t.b || t.a, r2 = Math.min(Math.max(t.a.r, b.r), sh.maxR), c2 = Math.min(Math.max(t.a.c, b.c), sh.maxC);
        for (var r = Math.min(t.a.r, b.r); r <= r2; r++) for (var c = Math.min(t.a.c, b.c); c <= c2; c++) { var k = colStr(c) + r; (rev[k] = rev[k] || []).push(ref); }
      });
    });
    sh.deps = rev; sh.dyn = dyn;
  };
  /* the formula cells that depend (directly or not) on the changed cells, recalculated */
  Sheet.prototype.recalc = function (changed) {
    var sh = this; if (!sh.deps) sh.buildDeps();
    var dirty = {}, q = changed.slice();
    while (q.length) { var k = q.pop(); (sh.deps[k] || []).forEach(function (f) { if (!(f in dirty)) { dirty[f] = 1; q.push(f); } }); }
    if (Object.keys(dirty).length) sh.dyn.forEach(function (f) { if (!(f in dirty)) { dirty[f] = 1; (sh.deps[f] || []).forEach(function (g) { q.push(g); }); } });
    while (q.length) { var k2 = q.pop(); (sh.deps[k2] || []).forEach(function (f) { if (!(f in dirty)) { dirty[f] = 1; q.push(f); } }); }
    sh.calc = {}; Object.keys(dirty).forEach(function (f) { sh.calc[f] = undefined; });
    var out = {};
    Object.keys(dirty).forEach(function (f) { var m = /^([A-Z]+)(\d+)$/.exec(f); out[f] = sh.val(+m[2], colNum(m[1])); });
    sh.calc = null;
    return out;
  };
  /* every formula recalculated from scratch (used to check the engine against Excel's stored values) */
  Sheet.prototype.recalcAll = function () {
    var sh = this; sh.calc = {}; Object.keys(sh.o.formulas).forEach(function (f) { sh.calc[f] = undefined; });
    var out = {}; Object.keys(sh.o.formulas).forEach(function (f) { var m = /^([A-Z]+)(\d+)$/.exec(f); out[f] = sh.val(+m[2], colNum(m[1])); });
    sh.calc = null; return out;
  };

  window.XLCalc = { sheet: function (o) { return new Sheet(o); }, parse: parse, shift: shift, tokenize: tokenize, isErr: isErr };
})();

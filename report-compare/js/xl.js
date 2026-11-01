/* Report Compare — xlsx reader.
 * Reads an .xlsx package (values, formulas, styles, merges, widths) into a plain model. Read-only: the writer (writer.js)
 * edits the ORIGINAL package text, so charts, images, conditional formats and macros are never touched.
 * Pure logic, no DOM: runs in the browser (script tag) and in Node (tests).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Xl = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var EPOCH = 25569; // Excel serial of 1970-01-01
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var DAYL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function colToNum(s) { var n = 0; for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64); return n; }
  function numToCol(n) { var s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  function parseAddr(a) { var m = /^\$?([A-Z]{1,3})\$?(\d+)$/.exec(a); return m ? { c: colToNum(m[1]), r: +m[2] } : null; }
  function addr(c, r) { return numToCol(c) + r; }
  function unesc(s) {
    return s.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, function (_, e) {
      if (e === 'lt') return '<'; if (e === 'gt') return '>'; if (e === 'amp') return '&';
      if (e === 'quot') return '"'; if (e === 'apos') return "'";
      return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    });
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function attrs(s) {
    var o = {}, re = /([\w:.-]+)\s*=\s*"([^"]*)"/g, m;
    while ((m = re.exec(s || ''))) o[m[1]] = unesc(m[2]);
    return o;
  }
  async function readText(zip, path) {
    var f = zip.file(path.replace(/^\//, ''));
    return f ? f.async('string') : null;
  }

  /* ---------- formulas: shared-formula translation ---------- */
  function shiftFormula(f, dr, dc) {
    if (!dr && !dc) return f;
    // split into quoted strings / sheet names (kept as is) and code
    var parts = f.split(/("(?:[^"]|"")*"|'(?:[^']|'')*'!?)/);
    for (var i = 0; i < parts.length; i += 2) {
      parts[i] = parts[i].replace(/(^|[^A-Za-z0-9_.$])(\$?)([A-Z]{1,3})(\$?)(\d+)(?![\w(])/g, function (_, pre, ca, col, ra, row) {
        var c = ca ? colToNum(col) : colToNum(col) + dc, r = ra ? +row : +row + dr;
        if (c < 1 || r < 1) return pre + '#REF!';
        return pre + ca + numToCol(c) + ra + r;
      }).replace(/(^|[^A-Za-z0-9_.$])(\$?)([A-Z]{1,3}):(\$?)([A-Z]{1,3})(?![\w(])/g, function (_, pre, ca, c1, cb, c2) {
        return pre + ca + (ca ? c1 : numToCol(colToNum(c1) + dc)) + ':' + cb + (cb ? c2 : numToCol(colToNum(c2) + dc));
      });
    }
    return parts.join('');
  }

  /* ---------- shared strings / styles / theme ---------- */
  function parseSharedStrings(xml) {
    var out = [];
    if (!xml) return out;
    var re = /<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g, m;
    while ((m = re.exec(xml))) {
      var body = (m[1] || '').replace(/<rPh\b[\s\S]*?<\/rPh>/g, ''), s = '', t, tre = /<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g;
      while ((t = tre.exec(body))) s += unesc(t[1] || '');
      out.push(s);
    }
    return out;
  }

  var THEME_ORDER = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
  function parseTheme(xml) {
    var out = {};
    if (!xml) return out;
    var m = /<a:clrScheme\b[\s\S]*?<\/a:clrScheme>/.exec(xml);
    if (!m) return out;
    var re = /<a:(dk1|lt1|dk2|lt2|accent[1-6]|hlink|folHlink)>\s*<a:(?:srgbClr val="([0-9A-Fa-f]{6})"|sysClr [^>]*?lastClr="([0-9A-Fa-f]{6})")/g, x;
    while ((x = re.exec(m[0]))) out[x[1]] = '#' + (x[2] || x[3]).toUpperCase();
    return out;
  }
  var INDEXED = { 8: '#000000', 9: '#FFFFFF', 10: '#FF0000', 11: '#00FF00', 12: '#0000FF', 13: '#FFFF00', 14: '#FF00FF', 15: '#00FFFF', 22: '#C0C0C0', 23: '#808080', 43: '#FFFF99', 44: '#99CCFF', 45: '#FF99CC', 46: '#CC99FF', 47: '#FFCC99', 48: '#3366FF', 49: '#33CCCC', 50: '#99CC00', 51: '#FFCC00', 52: '#FF9900', 53: '#FF6600', 64: '#000000' };
  function tintHex(hex, tint) {
    var r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0, d = mx - mn;
    if (d) {
      s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h /= 6;
    }
    l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
    function f(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }
    var q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q, rr, gg, bb;
    if (!s) { rr = gg = bb = l; } else { rr = f(p, q, h + 1 / 3); gg = f(p, q, h); bb = f(p, q, h - 1 / 3); }
    function x(v) { var n = Math.round(v * 255).toString(16); return n.length < 2 ? '0' + n : n; }
    return ('#' + x(rr) + x(gg) + x(bb)).toUpperCase();
  }
  function resolveColor(tag, theme) {
    if (!tag) return null;
    var a = attrs(tag), c = null;
    if (a.rgb) c = '#' + a.rgb.slice(-6).toUpperCase();
    else if (a.theme != null) { var nm = THEME_ORDER[+a.theme]; c = theme[nm] || null; }
    else if (a.indexed != null) c = INDEXED[+a.indexed] || null;
    else if (a.auto) return null;
    if (c && a.tint) c = tintHex(c, parseFloat(a.tint));
    return c;
  }
  function section(xml, tag) {
    var m = new RegExp('<' + tag + '\\b[^>]*?(?:/>|>([\\s\\S]*?)</' + tag + '>)').exec(xml);
    return m ? (m[1] || '') : '';
  }
  function parseStyles(xml, theme) {
    var st = { numFmts: {}, xfs: [] };
    if (!xml) return st;
    var re = /<numFmt\b([^>]*?)\/>/g, m;
    while ((m = re.exec(section(xml, 'numFmts')))) { var a = attrs(m[1]); st.numFmts[a.numFmtId] = a.formatCode; }
    var fonts = [], fills = [], borders = [], items;
    items = section(xml, 'fonts').match(/<font\b[^>]*?(?:\/>|>[\s\S]*?<\/font>)/g) || [];
    items.forEach(function (f) {
      var b = /<b\b([^>]*)\/?>/.exec(f), i = /<i\b([^>]*)\/?>/.exec(f), sz = /<sz\b([^>]*)\/>/.exec(f), col = /<color\b[^>]*\/>/.exec(f), u = /<u\b/.test(f);
      var nm = /<name\b[^>]*val="([^"]*)"/.exec(f) || /<rFont\b[^>]*val="([^"]*)"/.exec(f);
      fonts.push({ name: nm ? unesc(nm[1]) : '', b: !!b && attrs(b[1]).val !== '0', i: !!i && attrs(i[1]).val !== '0', u: u, sz: sz ? parseFloat(attrs(sz[1]).val) : 11, color: col ? resolveColor(col[0], theme) : null });
    });
    items = section(xml, 'fills').match(/<fill\b[^>]*?(?:\/>|>[\s\S]*?<\/fill>)/g) || [];
    items.forEach(function (f) {
      var p = /<patternFill\b([^>]*?)(?:\/>|>)/.exec(f), fg = /<fgColor\b[^>]*\/>/.exec(f);
      fills.push(p && attrs(p[1]).patternType === 'solid' && fg ? resolveColor(fg[0], theme) : null);
    });
    items = section(xml, 'borders').match(/<border\b[^>]*?(?:\/>|>[\s\S]*?<\/border>)/g) || [];
    items.forEach(function (b) {
      var o = {};
      ['left', 'right', 'top', 'bottom'].forEach(function (side) {
        var m2 = new RegExp('<' + side + '\\b([^>]*?)(?:/>|>([\\s\\S]*?)</' + side + '>)').exec(b);
        if (m2) { var a2 = attrs(m2[1]); if (a2.style) { var cc = /<color\b[^>]*\/>/.exec(m2[2] || ''); o[side] = { style: a2.style, color: (cc && resolveColor(cc[0], theme)) || '#555555' }; } }
      });
      borders.push(o);
    });
    var xs = section(xml, 'cellXfs'), xre = /<xf\b([^>]*?)(?:\/>|>([\s\S]*?)<\/xf>)/g;
    while ((m = xre.exec(xs))) {
      var xa = attrs(m[1]), al = /<alignment\b([^>]*)\/?>/.exec(m[2] || ''), aa = al ? attrs(al[1]) : {};
      st.xfs.push({ numFmtId: +(xa.numFmtId || 0), font: fonts[+(xa.fontId || 0)] || fonts[0] || {}, fill: fills[+(xa.fillId || 0)] || null, border: borders[+(xa.borderId || 0)] || {}, h: aa.horizontal || '', v: aa.vertical || '', wrap: aa.wrapText === '1' || aa.wrapText === 'true', indent: +(aa.indent || 0) });
    }
    return st;
  }

  /* ---------- number formats ---------- */
  var BUILTIN = { 0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00', 12: '# ?/?', 13: '# ??/??', 14: 'dd/mm/yyyy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 22: 'dd/mm/yyyy h:mm', 37: '#,##0;(#,##0)', 38: '#,##0;[Red](#,##0)', 39: '#,##0.00;(#,##0.00)', 40: '#,##0.00;[Red](#,##0.00)', 41: '#,##0', 42: '#,##0', 43: '#,##0.00', 44: '#,##0.00', 45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mm:ss.0', 48: '##0.0E+0', 49: '@' };
  function fmtCode(st, xf) { if (!xf) return 'General'; return st.numFmts[xf.numFmtId] != null ? st.numFmts[xf.numFmtId] : (BUILTIN[xf.numFmtId] || 'General'); }
  function splitSections(code) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < code.length; i++) {
      var ch = code[i];
      if (ch === '"') q = !q;
      if (ch === ';' && !q) { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur);
    return out;
  }
  function stripToken(sec) { // remove [Red], [$-409] etc. but keep [h]/[mm]/[ss] elapsed tokens as is
    return sec.replace(/\[(?!h+\]|m+\]|s+\])[^\]]*\]/gi, '');
  }
  function isDateCode(code) {
    var s = splitSections(code)[0].replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/\[(?!h+\]|m+\]|s+\])[^\]]*\]/gi, '');
    if (/General/i.test(s)) return false;
    return /[ymdhs]/i.test(s.replace(/E[+-]/gi, ''));
  }
  function serialToParts(n) {
    var ms = Math.round((n - EPOCH) * 864e5), d = new Date(ms);
    return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), wd: d.getUTCDay(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds() };
  }
  function pad(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }
  function fmtDateCode(sec, n) {
    var p = serialToParts(n), toks = [], re = /"([^"]*)"|\\(.)|\[(h+|m+|s+)\]|(yyyy|yy|mmmmm|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s|AM\/PM|A\/P|\.0+)|([\s\S])/gi, m;
    while ((m = re.exec(sec))) {
      if (m[1] != null) toks.push({ lit: m[1] }); else if (m[2]) toks.push({ lit: m[2] }); else if (m[3]) toks.push({ t: m[3].toLowerCase()[0] === 'h' ? 'h' : 'x', elapsed: m[3] }); else if (m[4]) toks.push({ t: m[4].toLowerCase(), raw: m[4] }); else toks.push({ lit: m[5] });
    }
    var ampm = toks.some(function (t) { return t.t === 'am/pm' || t.t === 'a/p'; });
    toks.forEach(function (t, i) { // m / mm next to hours or seconds = minutes
      if (t.t === 'm' || t.t === 'mm') {
        var prev = null, next = null, k;
        for (k = i - 1; k >= 0; k--) if (toks[k].t) { prev = toks[k].t; break; }
        for (k = i + 1; k < toks.length; k++) if (toks[k].t) { next = toks[k].t; break; }
        if (prev === 'h' || prev === 'hh' || next === 's' || next === 'ss') t.t = t.t === 'm' ? 'min' : 'minn';
      }
    });
    return toks.map(function (t) {
      if (t.lit != null) return t.lit;
      var h12 = p.h % 12 || 12;
      switch (t.t) {
        case 'yyyy': return pad(p.y, 4); case 'yy': return pad(p.y % 100, 2);
        case 'mmmmm': return MONL[p.mo][0]; case 'mmmm': return MONL[p.mo]; case 'mmm': return MON[p.mo];
        case 'mm': return pad(p.mo + 1, 2); case 'm': return String(p.mo + 1);
        case 'dddd': return DAYL[p.wd]; case 'ddd': return DAY[p.wd]; case 'dd': return pad(p.d, 2); case 'd': return String(p.d);
        case 'hh': return pad(ampm ? h12 : p.h, 2); case 'h': return String(ampm ? h12 : p.h);
        case 'min': return String(p.mi); case 'minn': return pad(p.mi, 2);
        case 'ss': return pad(p.s, 2); case 's': return String(p.s);
        case 'am/pm': return p.h < 12 ? 'AM' : 'PM'; case 'a/p': return p.h < 12 ? 'A' : 'P';
        case 'x': { var tot = Math.floor(n * 24); return pad(tot, t.elapsed.length); }
        default: return t.raw || '';
      }
    }).join('');
  }
  function groupThousands(s) { return s.replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function general(n) {
    if (!isFinite(n)) return String(n);
    if (n === 0) return '0';
    var a = Math.abs(n);
    if (a >= 1e11 || a < 1e-5) { var ex = n.toExponential(5).split('e'), mant = ex[0].replace(/\.?0+$/, ''), eN = parseInt(ex[1], 10); return mant + 'E' + (eN < 0 ? '-' : '+') + (Math.abs(eN) < 10 ? '0' : '') + Math.abs(eN); }
    return String(parseFloat(n.toPrecision(11)));
  }
  function fmtNumberCode(sec, n) {
    var s = stripToken(sec), pre = '', suf = '', i = 0, start = -1, end = -1, ch;
    var lits = [];
    // tokenise to find the numeric placeholder run and literal text around it
    var run = '', before = '', after = '', phase = 0;
    for (i = 0; i < s.length; i++) {
      ch = s[i];
      if (ch === '"') { var j = s.indexOf('"', i + 1); if (j < 0) j = s.length; var t = s.slice(i + 1, j); if (phase === 0) before += t; else after += t; i = j; continue; }
      if (ch === '\\') { if (phase === 0) before += s[i + 1] || ''; else after += s[i + 1] || ''; i++; continue; }
      if (ch === '_') { if (phase === 0) before += ' '; else after += ' '; i++; continue; }
      if (ch === '*') { i++; continue; }
      if (/[#0?.,%E+\-]/.test(ch) && !(phase === 0 && (ch === '+' || ch === '-') && !/[#0?]/.test(s[i + 1] || ''))) {
        if (phase === 2) { after += ch; continue; }
        phase = 1; run += ch; continue;
      }
      if (/[#0?]/.test(ch)) { phase = 1; run += ch; continue; }
      if (phase === 1) phase = 2;
      if (phase === 0) before += ch; else after += ch;
    }
    if (!run) return before + after;
    var pct = (run.match(/%/g) || []).length, sci = /E[+-]/i.test(run);
    var v = n; for (i = 0; i < pct; i++) v *= 100;
    var core = run.replace(/%/g, '');
    if (sci) {
      var dec = (core.split('.')[1] || '').replace(/E.*/i, '').length;
      return before + v.toExponential(dec).replace('e', 'E').replace(/E([+-])(\d)$/, 'E$10$2') + after;
    }
    var m = /^([#0?,]*)(?:\.([#0?]*))?(,*)$/.exec(core.replace(/\s/g, ''));
    var intPart = m ? m[1] : core, decPart = m ? (m[2] || '') : '', trailing = m ? m[3].length : 0;
    for (i = 0; i < trailing; i++) v /= 1000;
    var thousands = intPart.indexOf(',') >= 0, decimals = decPart.length;
    var minInt = (intPart.replace(/,/g, '').match(/0/g) || []).length;
    var neg = v < 0; v = Math.abs(v);
    var fixed = v.toFixed(decimals), ip = fixed.split('.')[0], fp = fixed.split('.')[1] || '';
    while (ip.length < minInt) ip = '0' + ip;
    if (minInt === 0 && ip === '0' && decimals) ip = '';
    if (thousands) ip = groupThousands(ip);
    // optional decimals (#) are trimmed
    var optional = (decPart.match(/#+$/) || [''])[0].length;
    while (optional-- > 0 && fp.slice(-1) === '0') fp = fp.slice(0, -1);
    var out = ip + (fp ? '.' + fp : '');
    if (out === '' ) out = '0';
    return (neg && /[1-9]/.test(out) ? '-' : '') + before + out + new Array(pct + 1).join('%') + after;
  }
  function formatNumber(n, code) {
    if (code === 'General' || code === '') return general(n);
    var secs = splitSections(code), sec;
    if (isDateCode(code)) return fmtDateCode(stripToken(secs[0]), n);
    var useAbs = false;
    if (n < 0 && secs.length > 1) { sec = secs[1]; useAbs = true; }
    else if (n === 0 && secs.length > 2) sec = secs[2];
    else sec = secs[0];
    var gs = stripToken(sec);
    if (/General/i.test(gs)) return gs.replace(/General|"([^"]*)"|\\(.)/gi, function (x, a, b) { return /^general$/i.test(x) ? general(n) : (a != null ? a : (b || '')); });
    var r = fmtNumberCode(sec, useAbs ? Math.abs(n) : n);
    return r;
  }
  function formatCell(cell, st) {
    if (!cell || cell.k === '') return '';
    if (cell.k === 'e') return cell.v;
    if (cell.k === 'b') return cell.v ? 'TRUE' : 'FALSE';
    if (cell.k === 's') return cell.v;
    var xf = st.xfs[cell.s || 0];
    return formatNumber(cell.v, fmtCode(st, xf));
  }
  function isDateCell(cell, st) {
    if (!cell || cell.k !== 'n') return false;
    var xf = st.xfs[cell.s || 0];
    return !!xf && isDateCode(fmtCode(st, xf));
  }
  function isPercentCell(cell, st) {
    if (!cell || cell.k !== 'n') return false;
    var xf = st.xfs[cell.s || 0];
    return !!xf && /%/.test(fmtCode(st, xf).replace(/"[^"]*"/g, ''));
  }

  /* ---------- worksheet ---------- */
  function parseSheet(xml, sst) {
    var sh = { showGrid: !/<sheetView\b[^>]*showGridLines="(0|false)"/.test(xml), cells: new Map(), maxR: 0, maxC: 0, cols: [], rows: new Map(), merges: [], arrays: [], defW: 8.43, defH: 15, hasDrawing: /<drawing\b/.test(xml) };
    var m, a;
    if ((m = /<sheetFormatPr\b([^>]*)\/?>/.exec(xml))) { a = attrs(m[1]); if (a.defaultColWidth) sh.defW = +a.defaultColWidth; else sh.defW = a.baseColWidth ? (+a.baseColWidth * 7 + 5) / 7 + 0.43 : 9.140625; if (a.defaultRowHeight) sh.defH = +a.defaultRowHeight; }
    if ((m = /<pane\b([^>]*)\/?>/.exec(xml))) { a = attrs(m[1]); if (a.state === 'frozen' || a.state === 'frozenSplit') sh.freeze = { r: 1 + Math.round(+a.ySplit || 0), c: 1 + Math.round(+a.xSplit || 0) }; }
    var colsXml = section(xml, 'cols'), cre = /<col\b([^>]*)\/?>/g;
    while ((m = cre.exec(colsXml))) { a = attrs(m[1]); sh.cols.push({ min: +a.min, max: +a.max, w: a.width ? +a.width : sh.defW, hidden: a.hidden === '1' || a.hidden === 'true' }); }
    var mre = /<mergeCell\b[^>]*ref="([^"]+)"/g;
    while ((m = mre.exec(xml))) { var pr = m[1].split(':'), p1 = parseAddr(pr[0]), p2 = parseAddr(pr[1] || pr[0]); if (p1 && p2) sh.merges.push({ r1: p1.r, c1: p1.c, r2: p2.r, c2: p2.c }); }
    var sd = section(xml, 'sheetData');
    var rre = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g, shared = {};
    while ((m = rre.exec(sd))) {
      var ra = attrs(m[1]), rn = +ra.r;
      if (ra.ht || ra.hidden) sh.rows.set(rn, { ht: ra.ht ? +ra.ht : null, hidden: ra.hidden === '1' || ra.hidden === 'true' });
      var body = m[2] || '', cre2 = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, cm;
      while ((cm = cre2.exec(body))) {
        var ca = attrs(cm[1]), pa = parseAddr(ca.r);
        if (!pa) continue;
        var inner = cm[2] || '', cell = { a: ca.r, r: pa.r, c: pa.c, s: +(ca.s || 0), k: '', v: null, f: null, fk: '' };
        var fm = /<f\b([^>]*?)(?:\/>|>([\s\S]*?)<\/f>)/.exec(inner), vm = /<v\b[^>]*?(?:\/>|>([\s\S]*?)<\/v>)/.exec(inner);
        if (fm) {
          var fa = attrs(fm[1]), ft = unesc(fm[2] || '');
          if (fa.t === 'shared') {
            cell.fk = 'shared';
            if (ft) shared[fa.si] = { f: ft, r: pa.r, c: pa.c };
            var mst = shared[fa.si];
            cell.f = ft ? ft : (mst ? shiftFormula(mst.f, pa.r - mst.r, pa.c - mst.c) : '');
            cell.si = fa.si;
          } else {
            cell.f = ft; cell.fk = fa.t === 'array' ? 'array' : 'normal';
            if (fa.t === 'array' && fa.ref) { var ap = fa.ref.split(':'), a1 = parseAddr(ap[0]), a2 = parseAddr(ap[1] || ap[0]); if (a1 && a2) sh.arrays.push({ r1: a1.r, c1: a1.c, r2: a2.r, c2: a2.c, master: ca.r }); }
          }
        }
        var t = ca.t || 'n', raw = vm ? unesc(vm[1] || '') : null;
        if (t === 'inlineStr') { var is = /<is>([\s\S]*?)<\/is>/.exec(inner), s2 = '', tr = /<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g, tm; if (is) while ((tm = tr.exec(is[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')))) s2 += unesc(tm[1] || ''); cell.k = 's'; cell.v = s2; }
        else if (raw == null) { cell.k = ''; }
        else if (t === 's') { cell.k = 's'; cell.v = sst[+raw] != null ? sst[+raw] : ''; }
        else if (t === 'str') { cell.k = 's'; cell.v = raw; }
        else if (t === 'b') { cell.k = 'b'; cell.v = raw === '1'; }
        else if (t === 'e') { cell.k = 'e'; cell.v = raw; }
        else { var num = parseFloat(raw); if (isFinite(num)) { cell.k = 'n'; cell.v = num; } else { cell.k = 's'; cell.v = raw; } }
        sh.cells.set(ca.r, cell);
        if (cell.k !== '' || cell.f != null || cell.s) { if (pa.r > sh.maxR) sh.maxR = pa.r; if (pa.c > sh.maxC) sh.maxC = pa.c; }
      }
    }
    // cells spilled by an array / dynamic-array formula are results, not inputs
    sh.arrays.forEach(function (ar) {
      for (var r = ar.r1; r <= ar.r2; r++) for (var c = ar.c1; c <= ar.c2; c++) {
        var cell = sh.cells.get(addr(c, r));
        if (cell && cell.a !== ar.master) cell.derived = true;
      }
    });
    sh.merges.forEach(function (g) { if (g.r2 > sh.maxR) sh.maxR = g.r2; if (g.c2 > sh.maxC) sh.maxC = g.c2; });
    return sh;
  }

  async function readWorkbook(zip) {
    var wb = await readText(zip, 'xl/workbook.xml');
    if (!wb) throw new Error('This file is not an Excel workbook (xl/workbook.xml is missing).');
    var rels = (await readText(zip, 'xl/_rels/workbook.xml.rels')) || '', relMap = {}, m, re = /<Relationship\b([^>]*)\/?>/g;
    while ((m = re.exec(rels))) { var a = attrs(m[1]); relMap[a.Id] = a.Target; }
    var sst = parseSharedStrings(await readText(zip, 'xl/sharedStrings.xml'));
    var theme = parseTheme(await readText(zip, 'xl/theme/theme1.xml'));
    var styles = parseStyles(await readText(zip, 'xl/styles.xml'), theme);
    var out = { sheets: [], styles: styles, theme: theme, date1904: /<workbookPr\b[^>]*date1904="(1|true)"/.test(wb) };
    var sre = /<sheet\b([^>]*)\/?>/g;
    while ((m = sre.exec(wb))) {
      var sa = attrs(m[1]), target = relMap[sa['r:id']];
      if (!target) continue;
      var path = target.charAt(0) === '/' ? target.slice(1) : 'xl/' + target;
      var xml = await readText(zip, path);
      if (xml == null) continue;
      var sh = parseSheet(xml, sst), tc = /<tabColor\b[^>]*\/>/.exec(xml);
      sh.tabColor = tc ? resolveColor(tc[0], theme) : null;
      sh.name = sa.name; sh.path = path; sh.state = sa.state || 'visible';
      sh.tables = [];
      var relPath = path.replace(/([^\/]+)$/, '_rels/$1.rels'), srels = await readText(zip, relPath);
      if (srels) {
        var rr = /<Relationship\b([^>]*)\/?>/g, rm;
        while ((rm = rr.exec(srels))) {
          var ra = attrs(rm[1]);
          if (!/\/table$/.test(ra.Type || '')) continue;
          var tpath = ra.Target.charAt(0) === '/' ? ra.Target.slice(1) : path.replace(/[^\/]+$/, '') + ra.Target, tp = tpath.split('/'), stack = [];
          tp.forEach(function (seg) { if (seg === '..') stack.pop(); else if (seg !== '.') stack.push(seg); });
          tpath = stack.join('/');
          var txml = await readText(zip, tpath);
          if (!txml) continue;
          var ta = attrs((/<table\b([^>]*)>/.exec(txml) || [0, ''])[1]);
          sh.tables.push({ id: +ta.id || 0, name: ta.name || ta.displayName || '', ref: ta.ref || '', path: tpath, style: (/<tableStyleInfo\b[^>]*\sname="([^"]*)"/.exec(txml) || [0, ''])[1], stripes: !/showRowStripes="(0|false)"/.test(txml), headers: !/headerRowCount="0"/.test(txml) });
        }
      }
      out.sheets.push(sh);
    }
    out.byName = {}; out.sheets.forEach(function (s) { out.byName[s.name] = s; });
    return out;
  }

  return {
    EPOCH: EPOCH, colToNum: colToNum, numToCol: numToCol, parseAddr: parseAddr, addr: addr, unesc: unesc, esc: esc, attrs: attrs,
    readText: readText, readWorkbook: readWorkbook, parseSheet: parseSheet, parseSharedStrings: parseSharedStrings, shiftFormula: shiftFormula,
    formatCell: formatCell, formatNumber: formatNumber, isDateCode: isDateCode, isDateCell: isDateCell, isPercentCell: isPercentCell, fmtCode: fmtCode, serialToParts: serialToParts
  };
});

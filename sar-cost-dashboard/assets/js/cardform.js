/**
 * Card updates — the project team updates the yellow cells of the monthly "EP - NSR Projects <Month>.xlsx" cards.
 *
 *  extract(buffer)          workbook → model: every "<code>_Project Card" sheet, its sections, and per row the yellow
 *                           (team-editable) cells with their current value, type, column header and the row label
 *  editor(host, model, o)   the update form: pick a project, edit the yellow cells only (other cells are read-only
 *                           context), drafts kept in this browser, "Download my updates" → a small .json file
 *  apply(buffer, updates)   writes collected updates into a (new month) workbook: same cells, same formats, nothing
 *                           else touched; projects / rows that are no longer there are reported, not forced
 *  teamPage(model, kit)     one self-contained .html with the form and the current month's cards, to share with the team
 *
 * Plain browser JavaScript (JSZip only for extract / apply); no project data in this file.
 */
(function () {
  "use strict";
  var NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    NS_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
  var CTX_MAX_COL = 16;                 // read-only context: columns A..P (beyond are helper / calculation columns)

  /* ------------------------------------------------------------------ helpers */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function parse(s) { return new DOMParser().parseFromString(s, "application/xml"); }
  function kids(el, name) { return Array.prototype.filter.call(el ? el.childNodes : [], function (n) { return n.nodeType === 1 && (!name || n.localName === name); }); }
  function kid(el, name) { return kids(el, name)[0] || null; }
  function colNum(s) { var n = 0; for (var i = 0; i < s.length; i++) n = n * 26 + s.charCodeAt(i) - 64; return n; }
  function colStr(n) { var s = ""; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; }
  function splitRef(ref) { var m = /^([A-Z]+)(\d+)$/.exec(ref); return m ? { c: colNum(m[1]), r: +m[2] } : null; }
  function dirOf(p) { return p.slice(0, p.lastIndexOf("/") + 1); }
  function join(from, t) { if (t.charAt(0) === "/") return t.slice(1); var o = []; (dirOf(from) + t).split("/").forEach(function (x) { if (x === "..") o.pop(); else if (x !== ".") o.push(x); }); return o.join("/"); }
  function relsPath(p) { return dirOf(p) + "_rels/" + p.slice(p.lastIndexOf("/") + 1) + ".rels"; }
  function serialToIso(n) { var d = new Date(Math.round((Math.floor(n) - 25569) * 864e5)); return isNaN(d) ? "" : d.toISOString().slice(0, 10); }
  function isoToSerial(s) { var t = Date.parse(s + "T00:00:00Z"); return isNaN(t) ? null : t / 864e5 + 25569; }
  function rgbOf(c) { if (!c) return null; var v = c.getAttribute("rgb"); if (v) return v.slice(-6).toUpperCase(); var ix = c.getAttribute("indexed"); return ix === "13" ? "FFFF00" : ix === "43" ? "FFFF99" : ix === "26" ? "FFFFCC" : null; }
  function isYellow(hex) { if (!hex) return false; var r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16); return r >= 0xF0 && g >= 0xE0 && b <= 0xCC; }
  function isDark(hex) { if (!hex) return false; var r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16); return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5; }
  function isDateFmt(id, code) {
    if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47) || (id >= 27 && id <= 36) || (id >= 50 && id <= 58)) return true;
    if (!code) return false;
    var c = code.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "").replace(/\\./g, "");
    return /[dy]/i.test(c) || /m{3,}/i.test(c);
  }
  function isPctFmt(id, code) { return id === 9 || id === 10 || /%/.test(code || ""); }
  function canon(v) { return v == null ? "" : String(v).trim(); }

  /* ------------------------------------------------------------------ workbook reading (shared by extract / apply) */
  var INDEXED = ["000000","FFFFFF","FF0000","00FF00","0000FF","FFFF00","FF00FF","00FFFF","000000","FFFFFF","FF0000","00FF00","0000FF","FFFF00","FF00FF","00FFFF",
    "800000","008000","000080","808000","800080","008080","C0C0C0","808080","9999FF","993366","FFFFCC","CCFFFF","660066","FF8080","0066CC","CCCCFF",
    "000080","FF00FF","FFFF00","00FFFF","800080","800000","008080","0000FF","00CCFF","CCFFFF","CCFFCC","FFFF99","99CCFF","FF99CC","CC99FF","FFCC99",
    "3366FF","33CCCC","99CC00","FFCC00","FF9900","FF6600","666699","969696","003366","339966","003300","333300","993300","993366","333399","333333"];
  function tint(hex, t) {                         // Excel tint: HSL lightness towards white (t > 0) or black (t < 0)
    if (!t) return hex;
    var r = parseInt(hex.slice(0, 2), 16) / 255, g = parseInt(hex.slice(2, 4), 16) / 255, b = parseInt(hex.slice(4, 6), 16) / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, sat = 0, d = mx - mn;
    if (d) { sat = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
    l = t < 0 ? l * (1 + t) : l * (1 - t) + t;
    function f(p, q, x) { if (x < 0) x += 1; if (x > 1) x -= 1; return x < 1 / 6 ? p + (q - p) * 6 * x : x < 1 / 2 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p; }
    var q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat, pp = 2 * l - q;
    var o = sat ? [f(pp, q, h + 1 / 3), f(pp, q, h), f(pp, q, h - 1 / 3)] : [l, l, l];
    return o.map(function (x) { return ("0" + Math.round(x * 255).toString(16)).slice(-2); }).join("").toUpperCase();
  }
  function colorOf(el, theme) {
    if (!el || el.getAttribute("auto") === "1") return null;
    var hex = null, rgb = el.getAttribute("rgb"), th = el.getAttribute("theme"), ix = el.getAttribute("indexed");
    if (rgb) hex = rgb.slice(-6).toUpperCase();
    else if (th != null && theme[+th]) hex = theme[+th];
    else if (ix != null) hex = +ix === 64 ? null : INDEXED[+ix] || null;
    return hex ? tint(hex, +(el.getAttribute("tint") || 0)) : null;
  }
  var BUILTIN = { 1: "0", 2: "0.00", 3: "#,##0", 4: "#,##0.00", 9: "0%", 10: "0.00%", 11: "0.00E+00", 14: "dd/mm/yyyy", 15: "d-mmm-yy", 16: "d-mmm", 17: "mmm-yy",
    18: "h:mm AM/PM", 19: "h:mm:ss AM/PM", 20: "h:mm", 21: "h:mm:ss", 22: "dd/mm/yyyy h:mm", 37: "#,##0 ;(#,##0)", 38: "#,##0 ;(#,##0)", 39: "#,##0.00;(#,##0.00)", 40: "#,##0.00;(#,##0.00)", 49: "@" };
  function readBook(zip) {
    function xml(p) { var f = zip.file(p); return f ? f.async("string").then(parse) : Promise.resolve(null); }
    return Promise.all([xml("xl/workbook.xml"), xml("xl/_rels/workbook.xml.rels"), xml("xl/sharedStrings.xml"), xml("xl/styles.xml"), xml("xl/theme/theme1.xml")]).then(function (x) {
      var wb = x[0], rels = {}, ss = [], st = x[3], theme = [];
      if (!wb) throw new Error("Not an Excel workbook");
      if (x[1]) Array.prototype.forEach.call(x[1].getElementsByTagNameNS(NS_REL, "Relationship"), function (e) { rels[e.getAttribute("Id")] = join("xl/workbook.xml", e.getAttribute("Target")); });
      if (x[2]) Array.prototype.forEach.call(x[2].getElementsByTagNameNS(NS, "si"), function (si) { ss.push(Array.prototype.map.call(si.getElementsByTagNameNS(NS, "t"), function (t) {
        var p = t.parentNode; return p.localName === "rPh" ? "" : t.textContent; }).join("")); });
      if (x[4]) {                                   // theme colour order in cell styles: lt1, dk1, lt2, dk2, accent1–6, hlink, folHlink
        var cs = x[4].getElementsByTagNameNS("*", "clrScheme")[0], named = {};
        kids(cs, null).forEach(function (n) { if (n.nodeType !== 1) return; var c = n.firstElementChild; if (c) named[n.localName] = (c.getAttribute("val") && c.localName === "srgbClr" ? c.getAttribute("val") : c.getAttribute("lastClr") || "000000").toUpperCase(); });
        theme = ["lt1", "dk1", "lt2", "dk2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"].map(function (k) { return named[k] || null; });
      }
      var fmts = {}, fills = [], fillCss = [], fonts = [], borders = [], xfs = [];
      if (st) {
        Array.prototype.forEach.call(st.getElementsByTagNameNS(NS, "numFmt"), function (n) { fmts[+n.getAttribute("numFmtId")] = n.getAttribute("formatCode"); });
        kids(st.getElementsByTagNameNS(NS, "fills")[0], "fill").forEach(function (f) {
          var pf = kid(f, "patternFill"), solid = pf && pf.getAttribute("patternType") === "solid";
          fills.push(solid ? rgbOf(kid(pf, "fgColor")) : null); fillCss.push(solid ? colorOf(kid(pf, "fgColor"), theme) : null);
        });
        kids(st.getElementsByTagNameNS(NS, "fonts")[0], "font").forEach(function (f) {
          var g = function (n) { return kid(f, n); }, sz = g("sz"), nm = g("name");
          fonts.push({ b: !!g("b") && g("b").getAttribute("val") !== "0", i: !!g("i") && g("i").getAttribute("val") !== "0", u: !!g("u"), s: !!g("strike"),
            sz: sz ? +sz.getAttribute("val") : 11, name: nm ? nm.getAttribute("val") : "Calibri", color: colorOf(g("color"), theme) });
        });
        kids(st.getElementsByTagNameNS(NS, "borders")[0], "border").forEach(function (b) {
          var o = {}; ["left", "right", "top", "bottom"].forEach(function (k) { var e = kid(b, k), sty = e && e.getAttribute("style"); if (sty) o[k] = [sty, colorOf(kid(e, "color"), theme) || "000000"]; });
          borders.push(o);
        });
        kids(st.getElementsByTagNameNS(NS, "cellXfs")[0], "xf").forEach(function (xf) {
          var id = +(xf.getAttribute("numFmtId") || 0), fi = +(xf.getAttribute("fillId") || 0), fill = fills[fi] || null, al = kid(xf, "alignment");
          xfs.push({ fill: fill, yellow: isYellow(fill), dark: isDark(fill), date: isDateFmt(id, fmts[id]), pct: isPctFmt(id, fmts[id]),
            fmtId: id, fmt: fmts[id] != null ? fmts[id] : BUILTIN[id] || "General", bg: fillCss[fi] || null, font: fonts[+(xf.getAttribute("fontId") || 0)] || fonts[0] || {},
            border: borders[+(xf.getAttribute("borderId") || 0)] || {}, h: al && al.getAttribute("horizontal") || "", v: al && al.getAttribute("vertical") || "bottom",
            wrap: !!(al && al.getAttribute("wrapText") === "1"), indent: al ? +(al.getAttribute("indent") || 0) : 0, rot: al ? +(al.getAttribute("textRotation") || 0) : 0,
            locked: !(kid(xf, "protection") && kid(xf, "protection").getAttribute("locked") === "0") });   /* Excel "Locked" (Format Cells → Protection); default locked */
        });
      }
      var sheets = Array.prototype.map.call(wb.getElementsByTagNameNS(NS, "sheet"), function (s) {
        return { name: s.getAttribute("name"), path: rels[s.getAttributeNS(NS_R, "id")], hidden: /hidden/i.test(s.getAttribute("state") || "") };
      });
      return { zip: zip, wb: wb, ss: ss, xfs: xfs, sheets: sheets, defFont: fonts[0] || { sz: 11, name: "Calibri" } };
    });
  }
  function cardSheets(book) {
    return book.sheets.filter(function (s) { return s.path && /_Project Card\s*$/i.test(s.name); }).map(function (s) {
      s.code = s.name.replace(/_Project Card\s*$/i, "").trim(); return s;
    });
  }
  /* one sheet → { cells: ref → cell, rows, merges, lists: ref → [options] } */
  function readSheet(book, sh, doc) {
    var cells = {}, maxR = 0, merges = [], lists = {};
    Array.prototype.forEach.call(doc.getElementsByTagNameNS(NS, "c"), function (c) {
      var ref = c.getAttribute("r"), p = splitRef(ref || ""); if (!p) return;
      var s = +(c.getAttribute("s") || 0), t = c.getAttribute("t") || "n", v = kid(c, "v"), f = kid(c, "f"), x = book.xfs[s] || {};
      var raw = v ? v.textContent : null, val = null;
      if (t === "s") val = raw == null ? "" : book.ss[+raw];
      else if (t === "inlineStr") { var is = kid(c, "is"); val = is ? Array.prototype.map.call(is.getElementsByTagNameNS(NS, "t"), function (q) { return q.textContent; }).join("") : ""; }
      else if (t === "str" || t === "e") val = raw == null ? "" : raw;
      else if (t === "b") val = raw === "1" ? "TRUE" : raw === "0" ? "FALSE" : "";
      else val = raw == null || raw === "" ? null : +raw;
      if (t === "b") val = raw === "1"; else if (t === "e") val = { e: raw || "#VALUE!" };
      cells[ref] = { r: p.r, c: p.c, ref: ref, s: s, t: t, val: val, f: !!f, ft: f ? f.textContent : "", fsi: f && f.getAttribute("t") === "shared" ? f.getAttribute("si") : null,
        locked: x.locked !== false, sharedMaster: !!(f && f.getAttribute("t") === "shared" && f.getAttribute("ref")), yellow: !!x.yellow, dark: !!x.dark, date: !!x.date && typeof val === "number", pct: !!x.pct, isDateFmt: !!x.date };
      if (p.r > maxR) maxR = p.r;
    });
    Array.prototype.forEach.call(doc.getElementsByTagNameNS(NS, "mergeCell"), function (m) {
      var a = (m.getAttribute("ref") || "").split(":"), p = splitRef(a[0]), q = splitRef(a[1] || a[0]); if (p && q) merges.push({ r1: p.r, c1: p.c, r2: q.r, c2: q.c, ref: a[0] });
    });
    Array.prototype.forEach.call(doc.getElementsByTagNameNS(NS, "dataValidation"), function (dv) {
      if (dv.getAttribute("type") !== "list") return;
      var f1 = dv.getElementsByTagNameNS(NS, "formula1")[0], txt = f1 ? f1.textContent.trim() : "";
      if (!/^".*"$/.test(txt)) return;             // literal lists only ("Yes,No"); range-based lists stay free text
      var opts = txt.slice(1, -1).split(",").map(function (o) { return o.trim(); }).filter(Boolean);
      (dv.getAttribute("sqref") || "").split(/\s+/).forEach(function (rg) {
        var a = rg.split(":"), p = splitRef(a[0]), q = splitRef(a[1] || a[0]); if (!p || !q) return;
        for (var r = p.r; r <= q.r && r - p.r < 2000; r++) for (var c = p.c; c <= q.c && c - p.c < 200; c++) lists[colStr(c) + r] = opts;
      });
    });
    return { cells: cells, maxR: maxR, merges: merges, lists: lists };
  }
  function display(cell) {
    if (!cell || cell.val == null) return "";
    if (typeof cell.val === "boolean") return cell.val ? "TRUE" : "FALSE";
    if (typeof cell.val === "object") return cell.val.e || "";
    if (typeof cell.val === "number") {
      if (cell.date) return serialToIso(cell.val);
      return String(Math.round(cell.val * 1e10) / 1e10);
    }
    return String(cell.val);
  }

  /* ------------------------------------------------------------------ Excel number formats (display only) */
  var MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"], DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  function fmtSections(code) { var out = [], cur = "", q = false; for (var i = 0; i < code.length; i++) { var ch = code[i]; if (ch === '"') q = !q; if (ch === ";" && !q) { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out; }
  function fmtDate(n, code) {
    var d = new Date(Math.round((n - 25569) * 864e5)); if (isNaN(d)) return String(n);
    var Y = d.getUTCFullYear(), M = d.getUTCMonth(), D = d.getUTCDate(), h = d.getUTCHours(), mi = d.getUTCMinutes(), se = d.getUTCSeconds();
    var c = code.replace(/\[[^\]]*\]/g, ""), out = "", i = 0, ampm = /AM\/PM/i.test(c), pad = function (x) { return ("0" + x).slice(-2); }, lastH = false;
    while (i < c.length) {
      var rest = c.slice(i), m;
      if (rest[0] === '"') { var j = c.indexOf('"', i + 1); out += c.slice(i + 1, j < 0 ? c.length : j); i = j < 0 ? c.length : j + 1; continue; }
      if (rest[0] === "\\") { out += rest[1] || ""; i += 2; continue; }
      if ((m = /^(yyyy|yy|mmmmm|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s|AM\/PM)/i.exec(rest))) {
        var t = m[1].toLowerCase();
        if (t === "yyyy") out += Y; else if (t === "yy") out += pad(Y % 100);
        else if (t === "mmmmm") out += MON[M][0]; else if (t === "mmmm") out += MON[M]; else if (t === "mmm") out += MON[M].slice(0, 3);
        else if (t === "mm" || t === "m") out += lastH ? (t === "mm" ? pad(mi) : mi) : (t === "mm" ? pad(M + 1) : M + 1);
        else if (t === "dddd") out += DAY[d.getUTCDay()]; else if (t === "ddd") out += DAY[d.getUTCDay()].slice(0, 3); else if (t === "dd") out += pad(D); else if (t === "d") out += D;
        else if (t === "hh" || t === "h") { var hh = ampm ? (h % 12 || 12) : h; out += t === "hh" ? pad(hh) : hh; }
        else if (t === "ss" || t === "s") out += t === "ss" ? pad(se) : se;
        else if (t === "am/pm") out += h < 12 ? "AM" : "PM";
        lastH = t === "hh" || t === "h"; i += m[1].length; continue;
      }
      if (/[_*]/.test(rest[0])) { i += 2; continue; }
      out += rest[0]; i++;
    }
    return out;
  }
  function fmtNum(v, code, isDate) {
    if (typeof v !== "number") return v == null ? "" : String(v);
    code = code || "General";
    if (isDate) return fmtDate(v, fmtSections(code)[0]);
    var secs = fmtSections(code), sec = v < 0 && secs.length > 1 ? secs[1] : v === 0 && secs.length > 2 ? secs[2] : secs[0], neg = v < 0 && secs.length < 2;
    if (/^\s*@?\s*$/.test(sec) && secs.length > 3 && sec === secs[3]) return String(v);
    var body = sec.replace(/\[[^\]]*\]/g, "");
    if (/general/i.test(body) || !/[0#?]/.test(body)) {
      if (/general/i.test(body) || !body.trim()) { var a = Math.abs(v), g = a !== 0 && (a >= 1e11 || a < 1e-9) ? v.toExponential(5) : String(Math.round(v * 1e10) / 1e10); return body.replace(/general/i, "").trim() ? body.replace(/general/i, g).replace(/"/g, "") : g; }
    }
    var x = Math.abs(v), pct = /%/.test(body.replace(/"[^"]*"/g, ""));
    if (pct) x *= 100;
    var nm = /[#0?,.]*[0#?][#0?,.]*/.exec(body.replace(/"[^"]*"/g, function (q) { return q.replace(/[#0?,.]/g, " "); }));
    if (!nm) return String(Math.round(v * 1e10) / 1e10);
    var num = nm[0];
    var scale = /[0#?](,+)(?![0#?])/.exec(num); if (scale) { x /= Math.pow(1000, scale[1].length); num = num.slice(0, num.length - scale[1].length); }
    var dec = (num.split(".")[1] || "").replace(/[^0#?]/g, ""), minDec = (dec.match(/0/g) || []).length, grp = /,/.test(num);
    var str = x.toFixed(dec.length); if (dec.length > minDec) str = str.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
    var ip = str.split(".")[0], fp = str.split(".")[1];
    if (grp) ip = ip.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    var minInt = ((num.split(".")[0] || "").match(/0/g) || []).length; if (ip === "0" && !minInt) ip = "";
    var formatted = ip + (fp ? "." + fp : "");
    var pos = body.indexOf(num), pre = body.slice(0, pos), post = body.slice(pos + num.length);
    function lit(t) { return t.replace(/"([^"]*)"/g, "$1").replace(/\\(.)/g, "$1").replace(/_./g, " ").replace(/\*./g, ""); }
    return (neg ? "-" : "") + lit(pre) + formatted + lit(post);
  }
  function cellText(x, xf) {
    if (!x || x.val == null) return "";
    if (typeof x.val === "boolean") return x.val ? "TRUE" : "FALSE";
    if (typeof x.val === "object") return x.val.e || "";
    if (typeof x.val === "number") { try { return fmtNum(x.val, xf && xf.fmt, xf && xf.date); } catch (e) { return String(Math.round(x.val * 1e10) / 1e10); } }
    return String(x.val);
  }
  /* cell style → CSS (class per used style index) */
  var BSTY = { thin: "1px solid", hair: "1px dotted", dotted: "1px dotted", dashed: "1px dashed", dashDot: "1px dashed", dashDotDot: "1px dashed", medium: "2px solid",
    mediumDashed: "2px dashed", mediumDashDot: "2px dashed", mediumDashDotDot: "2px dashed", slantDashDot: "2px dashed", thick: "3px solid", double: "3px double" };
  function xfCss(xf, def) {
    var f = xf.font || {}, o = [];
    if (xf.bg) o.push("background:#" + xf.bg);
    if (f.b) o.push("font-weight:700"); if (f.i) o.push("font-style:italic");
    var deco = (f.u ? "underline " : "") + (f.s ? "line-through" : ""); if (deco) o.push("text-decoration:" + deco.trim());
    if (f.sz && f.sz !== def.sz) o.push("font-size:" + (f.sz * 4 / 3).toFixed(1) + "px");
    if (f.name && f.name !== def.name) o.push("font-family:'" + f.name.replace(/'/g, "") + "',Calibri,Arial,sans-serif");
    if (f.color && f.color !== "000000") o.push("color:#" + f.color);
    var h = { center: "center", centerContinuous: "center", right: "right", left: "left", justify: "justify", distributed: "center", fill: "left" }[xf.h];
    if (h) o.push("text-align:" + h);
    o.push("vertical-align:" + ({ top: "top", center: "middle", bottom: "bottom", justify: "middle", distributed: "middle" }[xf.v] || "bottom"));
    if (xf.wrap) o.push("white-space:pre-wrap;overflow-wrap:anywhere");
    if (xf.indent) o.push("padding-" + (h === "right" ? "right" : "left") + ":" + (2 + xf.indent * 9) + "px");
    ["left", "right", "top", "bottom"].forEach(function (k) { var b = xf.border && xf.border[k]; if (b && BSTY[b[0]]) o.push("border-" + k + ":" + BSTY[b[0]] + " #" + b[1]); });
    return o.join(";");
  }
  /* the sheet as a grid: visible columns / rows with sizes, cells (style index + displayed text), merges, pictures */
  function gridOf(book, sh, S, doc, media) {
    var fp = doc.getElementsByTagNameNS(NS, "sheetFormatPr")[0], defH = fp && fp.getAttribute("defaultRowHeight") ? +fp.getAttribute("defaultRowHeight") : 15;
    var defW = fp && fp.getAttribute("defaultColWidth") ? +fp.getAttribute("defaultColWidth") : (fp && fp.getAttribute("baseColWidth") ? +fp.getAttribute("baseColWidth") : 8) + 0.43;
    var colW = {}, colHid = {}, rowH = {}, rowHid = {};
    Array.prototype.forEach.call(doc.getElementsByTagNameNS(NS, "col"), function (c) {
      var a = +c.getAttribute("min"), b = Math.min(+c.getAttribute("max"), 400), w = c.getAttribute("width") != null ? +c.getAttribute("width") : defW, hid = c.getAttribute("hidden") === "1";
      for (var i = a; i <= b; i++) { colW[i] = w; if (hid) colHid[i] = 1; }
    });
    Array.prototype.forEach.call(doc.getElementsByTagNameNS(NS, "row"), function (r) {
      var n = +r.getAttribute("r"); if (r.getAttribute("ht")) rowH[n] = +r.getAttribute("ht"); if (r.getAttribute("hidden") === "1") rowHid[n] = 1;
    });
    var maxR = 0, maxC = 0, used = {};
    Object.keys(S.cells).forEach(function (ref) {
      var x = S.cells[ref], xf = book.xfs[x.s] || {}, vis = (x.val != null && x.val !== "") || xf.bg || (xf.border && Object.keys(xf.border).length);
      if (!vis) return; if (x.r > maxR) maxR = x.r; if (x.c > maxC) maxC = x.c;
    });
    S.merges.forEach(function (m) { if (m.r2 > maxR && m.r2 - maxR < 5) maxR = m.r2; if (m.c2 > maxC && m.c2 - maxC < 5) maxC = m.c2; });
    var cols = [], cw = [], px = function (w) { return Math.floor(w * 7 + 5); };
    for (var c = 1; c <= maxC; c++) if (!colHid[c]) { cols.push(c); cw.push(px(colW[c] != null ? colW[c] : defW)); }
    var rows = [], yOf = {}, y = 0;
    for (var r = 1; r <= maxR; r++) {
      if (rowHid[r]) continue;
      var h = Math.round((rowH[r] != null ? rowH[r] : defH) * 4 / 3); yOf[r] = y; y += h;
      var line = [];
      cols.forEach(function (cc) {
        var x = S.cells[colStr(cc) + r]; if (!x) return;
        var xf = book.xfs[x.s] || {}, t = cellText(x, xf);
        if (!t && !xf.bg && !(xf.border && Object.keys(xf.border).length)) return;
        used[x.s] = 1;
        var el = t ? [cc, x.s, t] : [cc, x.s], raw = typeof x.val === "number" ? display(x) : null;
        var fl = (x.f ? 1 : 0) | (x.locked ? 0 : 2);
        if (fl || raw != null) { if (!t) el.push(""); el.push(fl); if (raw != null) el.push(raw); }   // [col, style, text, flags (1 formula · 2 unlocked), raw value]
        line.push(el);
      });
      rows.push([r, h, line]);
    }
    var mg = S.merges.filter(function (m) { return m.r1 <= maxR && m.c1 <= maxC; }).map(function (m) { return [m.r1, m.c1, m.r2, m.c2]; });
    // pictures (e.g. the logo): drawing anchors → pixel boxes over the grid
    var xOf = {}, xx = 0; for (var c2 = 1; c2 <= maxC + 1; c2++) { xOf[c2] = xx; if (!colHid[c2]) xx += px(colW[c2] != null ? colW[c2] : defW); }
    var yAt = function (row) { var v = 0; for (var q = 1; q < row; q++) if (!rowHid[q]) v += Math.round((rowH[q] != null ? rowH[q] : defH) * 4 / 3); return v; };
    var img = [], jobs = [];
    var sr = kids(doc.documentElement, "drawing")[0], rid = sr && sr.getAttributeNS(NS_R, "id");
    if (rid) jobs.push(book.zip.file(relsPath(sh.path)) ? book.zip.file(relsPath(sh.path)).async("string").then(function (rx) {
      var rel = Array.prototype.filter.call(parse(rx).getElementsByTagNameNS(NS_REL, "Relationship"), function (e) { return e.getAttribute("Id") === rid; })[0];
      if (!rel) return; var dp = join(sh.path, rel.getAttribute("Target")), df = book.zip.file(dp); if (!df) return;
      return Promise.all([df.async("string"), book.zip.file(relsPath(dp)) ? book.zip.file(relsPath(dp)).async("string") : Promise.resolve("")]).then(function (z) {
        var dd = parse(z[0]), drel = {};
        if (z[1]) Array.prototype.forEach.call(parse(z[1]).getElementsByTagNameNS(NS_REL, "Relationship"), function (e) { drel[e.getAttribute("Id")] = join(dp, e.getAttribute("Target")); });
        var XDR = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";
        kids(dd.documentElement, null).forEach(function (a) {
          var blip = a.getElementsByTagNameNS("*", "blip")[0], emb = blip && (blip.getAttributeNS(NS_R, "embed") || blip.getAttribute("r:embed")), mp = emb && drel[emb];
          if (!mp || !/\.(png|jpe?g|gif|bmp|svg)$/i.test(mp)) return;
          var pt = function (el) { if (!el) return null; var g = function (n) { var e = el.getElementsByTagNameNS(XDR, n)[0]; return e ? +e.textContent : 0; };
            var col = g("col") + 1, row = g("row") + 1; return { x: (xOf[col] || 0) + g("colOff") / 9525, y: yAt(row) + g("rowOff") / 9525 }; };
          var from = pt(a.getElementsByTagNameNS(XDR, "from")[0]), to = pt(a.getElementsByTagNameNS(XDR, "to")[0]), ext = a.getElementsByTagNameNS(XDR, "ext")[0];
          if (!from) return;
          var w = to ? to.x - from.x : ext ? +ext.getAttribute("cx") / 9525 : 0, hh = to ? to.y - from.y : ext ? +ext.getAttribute("cy") / 9525 : 0;
          if (w <= 0 || hh <= 0) return;
          img.push([mp, Math.round(from.x), Math.round(from.y), Math.round(w), Math.round(hh)]);
          if (!media[mp]) media[mp] = book.zip.file(mp) ? book.zip.file(mp).async("base64").then(function (b) {
            var ext2 = mp.split(".").pop().toLowerCase(); return "data:image/" + (ext2 === "jpg" ? "jpeg" : ext2 === "svg" ? "svg+xml" : ext2) + ";base64," + b; }) : null;
        });
      });
    }) : Promise.resolve());
    var lists = {}; Object.keys(S.lists).forEach(function (ref) { var x = S.cells[ref]; if (x && !x.f && x.r <= maxR) lists[ref] = S.lists[ref].join("|"); });
    return Promise.all(jobs).then(function () { return { cols: cols, cw: cw, rows: rows, mg: mg, img: img, used: used, top: yOf, lists: lists }; });
  }

  /* labels for "any cell" edits — the same rule in the page (from the grid) and when applying (from the sheet):
     section = the dark title above (main · sub); row label = leftmost text cell left of the column (row numbers skipped) */
  function secTitleOf(heads, r) {
    var main = null, sub = null; (heads || []).forEach(function (h) { if (h[0] <= r) { if (h[2]) { main = h[1]; sub = null; } else sub = h[1]; } });
    return (main || "General") + (sub ? " · " + sub : "");
  }
  function anyLabel(textAt, col) {
    for (var c = 1; c < col; c++) { var t = String(textAt(c) || "").replace(/\s+/g, " ").trim(); if (t && !/^[\d.]+$/.test(t)) return t; }
    return "";
  }

  /* ------------------------------------------------------------------ extract: workbook → model */
  function model(book, sh, S) {
    var cells = S.cells;
    function at(r, c) {                             // value at r,c (top-left of a merged range)
      var x = cells[colStr(c) + r]; if (x && x.val != null && x.val !== "") return x;
      for (var i = 0; i < S.merges.length; i++) { var m = S.merges[i]; if (r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2) return cells[m.ref] || null; }
      return x || null;
    }
    function text(x) { return x && typeof x.val === "string" && x.val.trim() && !/^#/.test(x.val) ? x.val.replace(/\s+/g, " ").trim() : ""; }
    // section headings: a dark-filled title cell in column B (main sections carry their number in column A)
    var heads = [], headRow = {};
    for (var r = 1; r <= S.maxR; r++) {
      var b = cells["B" + r], a = cells["A" + r];
      if (b && b.dark && text(b)) {
        var num = a && a.val != null && a.val !== "" ? String(a.val) : "";
        heads.push({ r: r, title: (num ? num + " " : "") + text(b), main: !!num }); headRow[r] = 1;
      }
    }
    function sectionOf(r) {
      var main = null, sub = null;
      heads.forEach(function (h) { if (h.r <= r) { if (h.main) { main = h; sub = null; } else sub = h; } });
      return { main: main, sub: sub, start: main ? main.r : 1, title: (main ? main.title : "General") + (sub ? " · " + sub.title : "") };
    }
    function header(r, c, top) {                    // nearest text above in the same column (merged headers resolved)
      for (var q = r - 1; q > top; q--) {
        if (rows[q] || headRow[q]) continue;          /* a data row or a section title is not a column header */
        var x = at(q, c); if (!x || x.yellow || x.f) continue;
        var t = text(x); if (!t) continue;
        var up = at(q - 1, c), ut = up && !up.yellow && !up.f && up.ref !== x.ref ? text(up) : "";
        var m = S.merges.filter(function (g) { return g.ref === (up && up.ref) && g.c2 > g.c1; })[0];   // a group title spanning columns above
        return (m && ut ? ut + " · " : "") + t;
      }
      return "Column " + colStr(c);
    }
    var rows = {}, order = [];
    function inMergeTail(x) { return S.merges.some(function (g) { return x.r >= g.r1 && x.r <= g.r2 && x.c >= g.c1 && x.c <= g.c2 && !(x.r === g.r1 && x.c === g.c1); }); }
    Object.keys(cells).forEach(function (ref) {
      var x = cells[ref]; if (!x.yellow || inMergeTail(x)) return;   /* the hidden part of a merged cell is not a field */
      (rows[x.r] = rows[x.r] || []).push(x);
    });
    Object.keys(rows).map(Number).sort(function (a, b) { return a - b; }).forEach(function (r) {
      var sec = sectionOf(r), row = rows[r].sort(function (a, b) { return a.c - b.c; });
      var minYc = row[0].c, label = "";
      for (var c = 1; c <= Math.max(5, minYc - 1) && !label; c++) { var x = at(r, c); if (x && !x.yellow && c < minYc) label = text(x); }
      if (!label) { var y0 = row[0]; label = text(y0) ? text(y0) : "Row " + r; }
      var ctx = [];
      for (var c2 = 1; c2 <= CTX_MAX_COL; c2++) {
        var z = cells[colStr(c2) + r]; if (!z || z.yellow || z.val == null || z.val === "") continue;
        var dv = display(z); if (!dv || dv === label || /^\d+$/.test(dv) && c2 === 1) continue;
        ctx.push([header(r, c2, sec.start), z.pct && typeof z.val === "number" ? Math.round(z.val * 1000) / 10 + "%" : dv]);
      }
      var out = row.map(function (y) {
        var k = S.lists[y.ref] ? "list" : y.isDateFmt ? "date" : y.pct ? "pct" : typeof y.val === "number" ? "num" : "text";
        var o = { ref: y.ref, h: y.c <= 2 && /^Execution Phase/.test(sec.sub ? sec.sub.title : "") ? "Activity name" : header(r, y.c, sec.start), v: display(y), k: k };
        if (k === "list") o.o = S.lists[y.ref];
        if (y.f) o.f = 1;                              // a formula: shown, not editable
        return o;
      });
      var key = sec.title;
      if (!order.length || order[order.length - 1].t !== key) order.push({ t: key, rows: [] });
      order[order.length - 1].rows.push({ r: r, l: label, x: ctx.slice(0, 6), c: out });
    });
    // project name: the cell right of "Project Name"
    var name = "";
    for (var rr = 1; rr <= Math.min(40, S.maxR) && !name; rr++) {
      var lb = at(rr, 2); if (lb && /^project name/i.test(text(lb))) { for (var cc = 3; cc <= 8 && !name; cc++) { var nv = at(rr, cc); name = text(nv); } }
    }
    var prog = progressOf(S, at, text, heads, order);
    // for live recalculation in the page: every formula (shared formulas as master text + the cells that reuse it) and
    // every value as Excel stored it (typed: number / text / boolean / {e: error})
    var fx = {}, fsd = {}, cv = {}, masters = {};
    Object.keys(cells).forEach(function (ref) { var x = cells[ref]; if (x.f && x.fsi != null && x.ft) masters[x.fsi] = ref; });
    Object.keys(cells).forEach(function (ref) {
      var x = cells[ref];
      if (x.val != null && (x.val !== "" || x.f)) cv[ref] = x.val;   /* a formula's "" is kept: Excel treats it as text */
      if (!x.f) return;
      if (x.ft) fx[ref] = x.ft;
      else if (x.fsi != null && masters[x.fsi]) (fsd[masters[x.fsi]] = fsd[masters[x.fsi]] || []).push(ref);
    });
    return { code: sh.code, sheet: sh.name, name: name, sections: order, prog: prog, heads: heads.map(function (h) { return [h.r, h.title, h.main ? 1 : 0]; }), fx: fx, fsd: fsd, cv: cv };
  }
  /* Section 7 "Execution Schedule (Monthly Update)": the monthly Actual Progress (%) row is the team's to update.
     - typed numbers in that row → those month cells are editable;
     - a formula there (projects split into POs) → the row is the contract-value-weighted average of the PO blocks on the
       right (AA "PO1…": Contract Value, Months Count, Month Starting Date, Planned / Actual Progress (%)), so the PO
       "Actual Progress (%)" month cells are editable instead.
     The number of month columns follows the card's own formulas: C70 = MAX(DATEDIF(G105,H105,"M")+1, DATEDIF(J105,K105,"M")+2),
     F70 = FCC months, and a later forecast finish (K106…) opens more months. The page recomputes this live (prog). */
  function progressOf(S, at, text, heads, order) {
    var cells = S.cells, find = function (re, col, from, to) { for (var r = from || 1; r <= (to || S.maxR); r++) { var x = cells[colStr(col) + r]; if (x && re.test(text(x))) return r; } return 0; };
    var sec7 = heads.filter(function (h) { return h.main && /^7\b/.test(h.title); })[0]; if (!sec7) return null;
    var sec8 = heads.filter(function (h) { return h.main && h.r > sec7.r; })[0], end7 = sec8 ? sec8.r - 1 : sec7.r + 15;
    var rAct = find(/^Actual Progress \(%\)$/i, 2, sec7.r, end7), rPl = find(/^Planned Progress \(%\)$/i, 2, sec7.r, end7), rCnt = find(/^Months Count$/i, 2, sec7.r, end7), rDate = find(/^Month Starting Date$/i, 2, sec7.r, end7);
    var rPer = find(/^Execution Period/i, 2, sec7.r, end7), rToDate = find(/^Actual Progress \(% to Date\)/i, 2, sec7.r, end7), rRep = find(/^Reporting Period/i, 2, sec7.r, end7);
    if (!rAct || !rDate || !rCnt) return null;
    var rLab = rCnt - 1, cols = [];
    for (var c = 3; c < 400; c++) { var lx = cells[colStr(c) + rLab]; if (!lx || !/^Month \d+$/i.test(text(lx))) break; cols.push(c); }
    if (!cols.length) return null;
    var key = function (r, c) { return colStr(c) + r; }, iso = function (x) { return x && typeof x.val === "number" ? serialToIso(x.val) : ""; };
    var sect = order.filter(function (o) { return /^7\b/.test(o.t); })[0] || null, secTitle = "7 Execution Schedule (Monthly Update)";
    var h7 = heads.filter(function (h) { return h.r === sec7.r; })[0]; if (h7) secTitle = h7.title;
    function addRow(title, label, r, refsByCol) {
      var o = order.filter(function (q) { return q.t === title; })[0]; if (!o) { o = { t: title, rows: [] }; order.push(o); }
      o.rows.push({ r: r, l: label, x: [], c: refsByCol.map(function (q) { return { ref: q.ref, h: "Month " + q.i, v: q.v, k: "pct", mi: q.i, p: 1 }; }) });
    }
    var actRefs = [], linked = false;
    cols.forEach(function (c, i) { var x = cells[key(rAct, c)]; if (x && x.f) linked = true; else actRefs.push({ ref: key(rAct, c), i: i + 1, v: x ? display(x) : "" }); });
    if (actRefs.length && !linked) addRow(secTitle, "Actual Progress (%)", rAct, actRefs);
    // PO blocks to the right (projects with several contracts)
    var po = [];
    for (var r = sec7.r; r <= S.maxR; r++) {
      for (var cc = 20; cc <= 40; cc++) {
        var x = cells[key(r, cc)]; if (!x || !/^PO\s*\d+$/i.test(text(x))) continue;
        var lab = function (re) { for (var q = r; q <= r + 7; q++) { var y = cells[key(q, cc)]; if (y && re.test(text(y))) return q; } return 0; };
        var rCv = lab(/^Contract Value$/i), rA = lab(/^Actual Progress \(%\)$/i), rP = lab(/^Planned Progress \(%\)$/i), rMc = lab(/^Months Count$/i);
        if (!rA) continue;
        var cv = rCv && cells[key(rCv, cc + 1)] ? cells[key(rCv, cc + 1)].val : null, poNo = cells[key(r, cc + 1)] ? display(cells[key(r, cc + 1)]) : "";
        var refs = [];
        for (var k = 0; k < cols.length; k++) { var ax = cells[key(rA, cc + 1 + k)]; if (ax && ax.f) continue; refs.push({ ref: key(rA, cc + 1 + k), i: k + 1, v: ax ? display(ax) : "" }); }
        var pname = text(x).replace(/\s+/g, "");
        po.push({ name: pname, no: poNo, cvRef: rCv ? key(rCv, cc + 1) : null, cv: typeof cv === "number" ? cv : 0, actRow: rA, planRow: rP, col0: cc + 1, mcRow: rMc });
        if (linked && (typeof cv === "number" && cv > 0 || poNo)) addRow(secTitle + " · " + pname + (poNo ? " (PO " + poNo + ")" : ""), "Actual Progress (%)", rA, refs);
      }
    }
    // the execution-phase activity rows of section 8 (their dates drive the month count)
    var ex = heads.filter(function (h) { return !h.main && /^Execution Phase$/i.test(h.title) && sec8 && h.r > sec8.r; })[0], exRows = [];
    if (ex) { var nxt = heads.filter(function (h) { return h.r > ex.r; })[0]; for (var q = ex.r + 1; q < (nxt ? nxt.r : ex.r + 12); q++) exRows.push(q); }
    var raw = {};
    function keep(ref) { var x = cells[ref]; raw[ref] = x ? (x.date || x.isDateFmt && typeof x.val === "number" ? iso(x) : display(x)) : ""; }
    if (ex) ["G", "H", "J", "K"].forEach(function (L) { keep(L + ex.r); exRows.forEach(function (q) { keep(L + q); }); });
    ["F71", "F72", "I73", "C70", "F70"].forEach(function (ref) { /* fixed card layout: FCC start / end, TOC flag, cached month counts */ keep(ref); });
    var fcc = { start: "F" + (rPer + 1), end: "F" + (rPer + 2), toc: "I" + (rPer + 3) };
    [fcc.start, fcc.end, fcc.toc].forEach(keep);
    var rep = rRep ? cells[key(rRep, 3)] : null;
    return { cols: cols, rLab: rLab, rCnt: rCnt, rDate: rDate, rAct: rAct, rPl: rPl, rPer: rPer, rToDate: rToDate, linked: linked, po: po,
      ex: ex ? { head: ex.r, rows: exRows, G: cells["G" + ex.r] && cells["G" + ex.r].f, H: cells["H" + ex.r] && cells["H" + ex.r].f, J: cells["J" + ex.r] && cells["J" + ex.r].f, K: cells["K" + ex.r] && cells["K" + ex.r].f } : null,
      fcc: fcc, raw: raw, rep: rep && typeof rep.val === "number" ? serialToIso(rep.val) : "",
      c70: cells[key(rPer, 3)] && typeof cells[key(rPer, 3)].val === "number" ? cells[key(rPer, 3)].val : null,
      planVals: cols.map(function (c) { var x = cells[key(rPl, c)]; return x && typeof x.val === "number" ? x.val : null; }),
      poVals: po.map(function (p) { return { act: cols.map(function (c, k) { var x = cells[key(p.actRow, p.col0 + k)]; return x && typeof x.val === "number" ? x.val : null; }) }; }) };
  }
  function extract(buffer, fileName) {
    return JSZip.loadAsync(buffer).then(readBook).then(function (book) {
      var cs = cardSheets(book); if (!cs.length) throw new Error("No “…_Project Card” sheets found — use the monthly EP - NSR Projects workbook.");
      var chain = Promise.resolve([]), media = {}, used = {};
      cs.forEach(function (sh) {
        chain = chain.then(function (acc) {
          var f = book.zip.file(sh.path); if (!f) return acc;
          return f.async("string").then(function (s) {
            var doc = parse(s), S = readSheet(book, sh, doc), mdl = model(book, sh, S);
            return gridOf(book, sh, S, doc, media).then(function (g) {
              Object.keys(g.used).forEach(function (k) { used[k] = 1; }); delete g.used; delete g.top;
              mdl.grid = g; acc.push(mdl); return acc;
            });
          });
        });
      });
      return chain.then(function (projects) {
        var keys = Object.keys(media);
        return Promise.all(keys.map(function (k) { return media[k]; })).then(function (data) {
          var med = {}; keys.forEach(function (k, i) { if (data[i]) med[k] = data[i]; });
          var def = book.defFont || {}, css = [".cu-grid td{font-family:'" + String(def.name || "Calibri").replace(/'/g, "") + "',Calibri,Arial,sans-serif;font-size:" + ((def.sz || 11) * 4 / 3).toFixed(1) + "px}"], xf = {};
          Object.keys(used).forEach(function (k) { var x = book.xfs[+k]; if (!x) return; var c = xfCss(x, def); if (c) css.push(".cu-grid .x" + k + "{" + c + "}"); xf[k] = [x.fmt, x.date ? 1 : 0, x.h || "", x.wrap ? 1 : 0]; });
          var m = /([A-Za-z]{3,9})[\s_-]?(\d{2,4})\s*(\.xlsx)?$/i.exec(String(fileName || "").replace(/\.xls[xm]$/i, "")) || [];
          return { kind: "sar-card-model", v: 2, file: fileName || "", month: m[1] ? m[1] + (m[2] ? " " + m[2] : "") : "", extractedAt: new Date().toISOString(),
            css: css.join("\n"), xf: xf, media: med, projects: projects.sort(function (a, b) { return String(a.code).localeCompare(String(b.code)); }) };
        });
      });
    });
  }

  /* ------------------------------------------------------------------ editor (site page and the team .html) */
  function storeKey(m) { return "sar-card-updates:" + (m.file || "") + ":" + (m.extractedAt || ""); }
  function loadDraft(m) { try { return JSON.parse(localStorage.getItem(storeKey(m)) || "null") || { by: "", edits: {} }; } catch (e) { return { by: "", edits: {} }; } }
  function saveDraft(m, d) { try { localStorage.setItem(storeKey(m), JSON.stringify(d)); return true; } catch (e) { return false; } }
  function saveFile(name, text, type) {
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: type || "application/json" })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
  }
  /* the updates of a draft as the .json exchange format (changed cells only) */
  function updatesOf(m, d, codes) {
    var out = { kind: "sar-card-updates", v: 1, file: m.file, month: m.month, by: d.by || "", savedAt: new Date().toISOString(), projects: {} };
    m.projects.forEach(function (p) {
      if (codes && codes.indexOf(p.code) < 0) return;
      var e = d.edits[p.code]; if (!e) return;
      var list = [];
      p.sections.forEach(function (s) { s.rows.forEach(function (row) { row.c.forEach(function (c) {
        if (!(c.ref in e) || canon(e[c.ref]) === canon(c.v)) return;
        list.push({ ref: c.ref, s: s.t, l: row.l, h: c.h, k: c.k, from: c.v, to: canon(e[c.ref]) });
      }); }); });
      var meta = (d.meta && d.meta[p.code]) || {}, known = {}; list.forEach(function (c) { known[c.ref] = 1; });
      p.sections.forEach(function (s) { s.rows.forEach(function (row) { row.c.forEach(function (c) { known[c.ref] = 1; }); }); });
      Object.keys(meta).forEach(function (ref) {      // any other non-formula cell the team changed
        if (known[ref] || !(ref in e) || canon(e[ref]) === canon(meta[ref].v)) return;
        var g = meta[ref]; list.push({ ref: ref, s: g.s, l: g.l, h: g.h, k: g.k, from: g.v, to: canon(e[ref]), g: 1 });
      });
      if (list.length) out.projects[p.code] = { name: p.name, cells: list };
    });
    return out;
  }
  function changedCount(m, d, code) { var u = updatesOf(m, d, [code]).projects[code]; return u ? u.cells.length : 0; }

  /* the card as the Excel sheet: same columns, rows, colours, borders and merged cells; yellow cells editable in place */
  function listNum(o) { var t = String(o == null ? "" : o).trim(), m = /^(-?\d+(?:\.\d+)?)(%?)$/.exec(t); return m ? +m[1] / (m[2] ? 100 : 1) : null; }
  function fmtCell(m, xfIdx, k, v) {            // a stored value (ISO date / number / fraction / text) → as Excel shows it
    if (v === "" || v == null) return "";
    var x = m.xf[xfIdx] || (k === "date" ? ["mmm-yy", 1] : k === "pct" ? ["0.0%", 0] : ["General", 0]);
    if (k === "date") { var n = isoToSerial(v); return n == null ? v : fmtNum(n, x[0], true); }
    if ((k === "num" || k === "pct" || k === "list" || k === "auto") && v !== "" && /^-?\d+(\.\d+)?([eE]-?\d+)?$/.test(String(v).trim())) return fmtNum(+v, x[0], !!x[1]);   // numbers keep the cell's format (also list choices like 1 → 100%)
    return v;
  }
  /* live month logic of section 7 (see progressOf): month count, month labels / dates, linked actual row, % to date */
  function eom(iso, add) { var t = Date.parse(iso + "T00:00:00Z"); if (isNaN(t)) return ""; var d = new Date(t); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1 + (add || 0), 0)).toISOString().slice(0, 10); }
  function datedifM(a, b) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b) || b < a) return NaN;
    var x = a.split("-").map(Number), y = b.split("-").map(Number); return (y[0] - x[0]) * 12 + (y[1] - x[1]) - (y[2] < x[2] ? 1 : 0);
  }
  function progState(p, e, fieldV) {
    var g = p.prog; if (!g) return null;
    var val = function (ref) { return ref in e ? e[ref] : ref in fieldV ? fieldV[ref] : g.raw[ref] != null ? g.raw[ref] : ""; };
    var isoOk = function (v) { return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; };
    function agg(L, fn) {
      if (!g.ex) return "";
      if (!g.ex[L]) return isoOk(val(L + g.ex.head)) || "";
      var vs = g.ex.rows.map(function (r) { return isoOk(val(L + r)); }).filter(Boolean).sort();
      return vs.length ? (fn === "min" ? vs[0] : vs[vs.length - 1]) : "";
    }
    var G = agg("G", "min"), H = agg("H", "max"), J = agg("J", "min"), K = agg("K", "max");
    var c70 = Math.max(datedifM(G, H) + 1, datedifM(J, K) + 2); if (isNaN(c70)) c70 = g.c70 || 0;
    var toc = String(val(g.fcc.toc) || ""), fs = val(g.fcc.start), fe = val(g.fcc.end), f70 = /^no$/i.test(toc) ? 0 : datedifM(fs, fe) + 1; if (isNaN(f70)) f70 = 0;
    var total = Math.min(g.cols.length, c70 + f70), text = {}, dates = [], cur = "";
    g.cols.forEach(function (c, i) {
      var n = i + 1, L = colStr(c);
      text[L + g.rCnt] = n <= total ? ["text", "Month " + n] : ["text", ""];
      if (n > total) cur = ""; else if (n === 1) cur = eom(G, 0); else if (n === c70 + 1 && isoOk(fs)) cur = eom(fs, 0); else cur = cur ? eom(cur, 1) : "";
      dates.push(n <= total ? cur : ""); text[L + g.rDate] = ["date", n <= total ? cur : ""];
    });
    var act = g.cols.map(function (c, i) {
      if (!g.linked) { var v = val(colStr(c) + g.rAct); return v === "" || isNaN(+v) ? null : +v; }
      var num = 0, den = 0;
      g.po.forEach(function (q, k) { if (!(q.cv > 0)) return; var ref = colStr(q.col0 + i) + q.actRow, v = ref in e ? e[ref] : ref in fieldV ? fieldV[ref] : g.poVals[k].act[i];
        num += (v === "" || v == null || isNaN(+v) ? 0 : +v) * q.cv; den += q.cv; });
      return den ? num / den : 0;
    });
    if (g.linked) g.cols.forEach(function (c, i) { text[colStr(c) + g.rAct] = ["pct", act[i] == null ? "" : String(act[i])]; });
    var lim = g.rep ? eom(g.rep, 0) : "9999-12-31", td = 0;
    act.forEach(function (v, i) { if (v != null && dates[i] && dates[i] <= lim) td += v; });
    if (g.rToDate) text["C" + g.rToDate] = ["pct", String(Math.round(td * 1e8) / 1e8)];
    if (g.rPer) text["C" + g.rPer] = ["num", String(c70)];
    return { total: total, text: text };
  }
  function editor(host, m, opts) {
    opts = opts || {};
    var d = loadDraft(m), last = d.last && m.projects.some(function (p) { return p.code === d.last; }) ? d.last : null;
    var state = { code: opts.code || last || (m.projects[0] && m.projects[0].code), zoom: d.zoom || 0.8 };
    if (!document.getElementById("cu-css")) { var stl = document.createElement("style"); stl.id = "cu-css"; stl.textContent = m.css || ""; document.head.appendChild(stl); }
    host.innerHTML = "";
    var wrap = document.createElement("div"); wrap.className = "cu"; host.appendChild(wrap);
    wrap.innerHTML =
      '<div class="cu-top"><div class="cu-who"><label>Your name<input type="text" class="cu-by" placeholder="Name of the person updating" value="' + esc(d.by) + '"></label></div>' +
      '<div class="cu-pick"><label>Project<select class="cu-proj"></select></label></div>' +
      '<div class="cu-jump"><label>Go to<select class="cu-sec-go"></select></label></div>' +
      '<div class="cu-zoom"><label>Zoom<select class="cu-z">' + [0.6, 0.7, 0.8, 0.9, 1, 1.15, 1.3].map(function (z) { return '<option value="' + z + '"' + (z === state.zoom ? " selected" : "") + ">" + Math.round(z * 100) + "%</option>"; }).join("") + "</select></label></div>" +
      '<div class="cu-acts"><span class="cu-saved"></span>' +
      '<button type="button" class="cu-btn ghost" data-a="reset">Undo my changes (this project)</button>' +
      '<button type="button" class="cu-btn" data-a="dl">Download my updates</button></div></div>' +
      '<div class="cu-help">The card exactly as in the Excel file. As in Excel, <b>unlocked</b> cells can be changed and <b>locked</b> cells cannot; you can also type a formula starting with <b>=</b> (e.g. <code>=K106+30</code>, <code>=EDATE(J107,3)</code>, <code>=K106</code>) — it is calculated here and written to the card as a formula — hover a cell: the pointer and a blue frame show it is open; click it and type (a later forecast finish opens more months, as in Excel); ' +
      'changed cells get an <b class="cu-or">orange frame</b> (hover to see the old value). Your changes stay in this browser until you click <b>Download my updates</b>; send that file to the Projects Department.</div>' +
      '<div class="cu-hbar" title="Scroll left / right"><div></div></div><div class="cu-sheet-wrap"><div class="cu-sheet"></div></div>';
    var sel = wrap.querySelector(".cu-proj"), sheet = wrap.querySelector(".cu-sheet"), saved = wrap.querySelector(".cu-saved"), go = wrap.querySelector(".cu-sec-go");
    var info = {};                                // ref → { c (field), s (section), l (row label) } of the current project
    var rowsBy = {};                              // grid row → { col: [col, style, text, formula?, raw] }
    function gridText(r, c) { var x = rowsBy[r] && rowsBy[r][c]; return x && x[2] && x[4] == null && !x[3] ? x[2] : ""; }
    function gridHeader(p, r, c) {               // nearest text above in the same column, inside the section
      var top = 0; (p.heads || []).forEach(function (h) { if (h[0] <= r && h[2]) top = h[0]; });
      for (var q = r - 1; q > top; q--) { var t = gridText(q, c); if (t) return t.replace(/\s+/g, " ").trim(); }
      return "Column " + colStr(c);
    }
    /* live recalculation (XLCalc): the team's edits as typed values, every formula depending on them recalculated */
    var engines = {};
    function typed(k, v) {
      if (v == null || v === "") return null;
      if (k === "date") { var t = Date.parse(v + "T00:00:00Z"); return isNaN(t) ? v : t / 864e5 + 25569; }
      if (k === "num" || k === "pct" || k === "auto" || k === "list") { var n = +String(v).replace(/,/g, ""); return isNaN(n) || String(v).trim() === "" ? v : n; }
      return v;
    }
    function engineOf(p) {
      if (engines[p.code] || !window.XLCalc || !p.fx) return engines[p.code] || null;
      var formulas = {}, g = p.grid, maxC = Math.max.apply(null, g.cols.concat([1])), maxR = g.rows.length ? g.rows[g.rows.length - 1][0] : 1;
      Object.keys(p.fx).forEach(function (k) { formulas[k] = [p.fx[k], p.cv[k]]; });
      Object.keys(p.fsd || {}).forEach(function (mr) { var a = splitRef(mr); p.fsd[mr].forEach(function (ref) { var b = splitRef(ref); formulas[ref] = [XLCalc.shift(p.fx[mr], b.r - a.r, b.c - a.c), p.cv[ref]]; }); });
      var st = { edits: {} };
      var eng = XLCalc.sheet({ name: p.sheet, book: m.file, maxR: maxR, maxC: maxC, formulas: formulas,
        value: function (r, c) { var ref = colStr(c) + r; if (ref in st.edits) return st.edits[ref]; var v = p.cv[ref]; return v === undefined ? null : v; } });
      eng.st = st; return (engines[p.code] = eng);
    }
    function isFx(v) { return typeof v === "string" && /^=/.test(v.trim()) && v.trim().length > 1; }
    function recalcProject(p, e) {
      var keys = Object.keys(e || {}); if (!keys.length) return null;
      var fxe = keys.filter(function (r) { return isFx(e[r]); }), sig = fxe.map(function (r) { return r + e[r]; }).join("|");
      if (engines[p.code] && engines[p.code].sig !== sig) delete engines[p.code];      // formulas typed by the user changed: rebuild the dependency map
      var eng = engineOf(p); if (!eng) return null;
      if (eng.sig !== sig) { fxe.forEach(function (r) { eng.o.formulas[r] = [e[r].trim().slice(1), p.cv[r]]; delete eng.ast[r]; }); eng.deps = null; eng.sig = sig; }
      eng.st.edits = {}; var fixed = {};
      keys.forEach(function (ref) { if (isFx(e[ref])) return; var it0 = info[ref] || {}, k = (it0.c && it0.c.k) || (d.meta && d.meta[p.code] && d.meta[p.code][ref] && d.meta[p.code][ref].k) || "auto"; eng.st.edits[ref] = typed(k, e[ref]); fixed[ref] = 1; });
      eng.o.fixed = fixed;
      try { var res = eng.recalc(keys, fxe); Object.keys(fixed).forEach(function (k) { delete res[k]; }); return res; } catch (er) { return null; }
    }
    function curVal(p, calc, ref) { return calc && ref in calc ? calc[ref] : p.cv[ref]; }
    function monthsOpen(p, calc) {               // months of section 7 currently open (row "Months Count" not empty)
      var g = p.prog; if (!g) return 0;
      return g.cols.filter(function (c) { var v = curVal(p, calc, colStr(c) + g.rCnt); return v != null && v !== ""; }).length;
    }
    function same(a, b) { if (a && typeof a === "object") return !!(b && b.e === a.e); if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(a)); return (a == null ? "" : a) === (b == null ? "" : b); }
    function showVal(xf, v) {
      if (v == null) return "";
      if (typeof v === "object") return v.e || "";
      if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
      if (typeof v === "number") { var x = m.xf[xf] || ["General", 0]; try { return fmtNum(v, x[0], !!x[1]); } catch (er) { return String(v); } }
      return String(v);
    }
    function remember(ref, it) {                  // where an "any cell" edit is (section · row label · column), for the new month's file
      if (!it || !it.g) return;
      var pr = splitRef(ref), pp = cur(), mt = (d.meta = d.meta || {})[state.code] = (d.meta && d.meta[state.code]) || {};
      mt[ref] = { s: secTitleOf(pp.heads, pr.r), l: anyLabel(function (cc) { return gridText(pr.r, cc); }, pr.c), h: gridHeader(pp, pr.r, pr.c), k: it.c.k, v: it.c.v };
    }
    function anyField(g, ref, x) {
      var xi = m.xf[x[1]] || [], raw = x[4] != null ? String(x[4]) : x[2] || "", lst = g.lists && g.lists[ref];
      var k = lst ? "list" : xi[1] ? "date" : /%/.test(xi[0] || "") ? "pct" : x[4] != null ? "num" : x[2] ? "text" : "auto";
      var f = { ref: ref, v: raw, k: k, g: 1 }; if (lst) f.o = lst.split("|"); return f;
    }
    function cur() { return m.projects.filter(function (x) { return x.code === state.code; })[0]; }
    function fillSel() {
      sel.innerHTML = m.projects.map(function (p) { var n = changedCount(m, d, p.code);
        return '<option value="' + esc(p.code) + '"' + (p.code === state.code ? " selected" : "") + ">" + esc(p.code + " — " + (p.name || p.sheet)) + (n ? "  (" + n + " changed)" : "") + "</option>"; }).join("");
    }
    function persist() { var ok = saveDraft(m, d); saved.textContent = ok ? "Saved in this browser · " + new Date().toLocaleTimeString() : "Could not save in this browser — download your updates now"; fillSel(); if (opts.onChange) opts.onChange(d); }
    function shownOf(c, xfIdx, v) { return fmtCell(m, xfIdx, c.k, v); }
    function draw() {
      var p = cur(); if (!p) { sheet.innerHTML = '<div class="cu-empty">No project selected.</div>'; return; }
      var g = p.grid, e = d.edits[p.code] || {}, fieldV = {};
      rowsBy = {}; g.rows.forEach(function (row) { var o = {}; row[2].forEach(function (x) { o[x[0]] = x; }); rowsBy[row[0]] = o; });
      info = {};
      p.sections.forEach(function (s) { s.rows.forEach(function (row) { row.c.forEach(function (c) { info[c.ref] = { c: c, s: s.t, l: row.l }; fieldV[c.ref] = c.v; }); }); });
      var calc = recalcProject(p, e), ps = { total: monthsOpen(p, calc), text: {} };
      // spans over visible rows / columns; cells covered by a merge are skipped
      var colIx = {}; g.cols.forEach(function (c, i) { colIx[c] = i; });
      var rowIx = {}; g.rows.forEach(function (r, i) { rowIx[r[0]] = i; });
      var span = {}, covered = {};
      g.mg.forEach(function (mm) {
        var cs = 0, rs = 0; for (var c = mm[1]; c <= mm[3]; c++) if (c in colIx) cs++; for (var r = mm[0]; r <= mm[2]; r++) if (r in rowIx) rs++;
        if (!cs || !rs) return;
        var r0 = mm[0], c0 = mm[1]; while (!(r0 in rowIx) && r0 <= mm[2]) r0++; while (!(c0 in colIx) && c0 <= mm[3]) c0++;
        span[colStr(c0) + r0] = [rs, cs];
        for (var r2 = mm[0]; r2 <= mm[2]; r2++) for (var c2 = mm[1]; c2 <= mm[3]; c2++) if (!(r2 === r0 && c2 === c0)) covered[colStr(c2) + r2] = 1;
      });
      var tw = g.cw.reduce(function (a, b) { return a + b; }, 0) + 42;
      var h = ['<table class="cu-grid" style="width:' + tw + 'px"><colgroup><col style="width:42px">' + g.cw.map(function (w) { return '<col style="width:' + w + 'px">'; }).join("") + "</colgroup>",
        '<thead><tr><th class="cu-corner"></th>' + g.cols.map(function (c) { return "<th>" + colStr(c) + "</th>"; }).join("") + "</tr></thead><tbody>"];
      g.rows.forEach(function (row) {
        var r = row[0], byC = {}; row[2].forEach(function (x) { byC[x[0]] = x; });
        h.push('<tr style="height:' + row[1] + 'px" data-r="' + r + '"><th>' + r + "</th>");
        g.cols.forEach(function (c) {
          var ref = colStr(c) + r; if (covered[ref]) return;
          var x = byC[c], sp = span[ref], at = sp ? (sp[0] > 1 ? ' rowspan="' + sp[0] + '"' : "") + (sp[1] > 1 ? ' colspan="' + sp[1] + '"' : "") : "";
          var cls = x ? "x" + x[1] : "", it = info[ref], ovr = calc && ref in calc && !(ref in e) ? calc[ref] : undefined;
          var unl = !!(x && (x[3] & 2));               // the cell's Excel "Locked" setting decides: unlocked = editable, locked = not
          if (!unl && !(it && it.c.p && !(x && (x[3] & 1)))) it = null;   // locked → read-only, except the monthly Actual Progress (team input; the cards keep it formatted "Locked" but sheets are not protected)
          else if (it && it.c.p && ps && it.c.mi > ps.total) it = null;   // month not (yet) in the execution period
          else if (!it) it = info[ref] = { c: anyField(g, ref, x), g: 1 };   // any other unlocked cell of the card
          if (it) {
            var v = ref in e ? e[ref] : it.c.v, ch = ref in e && canon(e[ref]) !== canon(it.c.v), ufx = ref in e && isFx(e[ref]);
            var shown = ufx ? (calc && ref in calc ? showVal(x ? x[1] : "", calc[ref]) : "#NAME?") : shownOf(it.c, x && x[1], v);
            var tip = ch ? (ufx ? "Formula: " + e[ref] + " · was: " : "Was: ") + (shownOf(it.c, x && x[1], it.c.v) || "(empty)") : "";
            h.push('<td class="' + cls + " cu-ed" + (it.c.p ? " cu-pg" : "") + (ch ? " cu-chg" : "") + (ufx ? " cu-ufx" : "") + '"' + at + ' data-ref="' + ref + '" data-xf="' + (x ? x[1] : "") + '"' + (tip ? ' title="' + esc(tip) + '"' : "") + ">" +
              '<div class="cu-val">' + esc(shown) + "</div></td>");
          } else {
            var txt = x && x[2] != null ? x[2] : "";
            if (ovr !== undefined) txt = showVal(x ? x[1] : "", ovr);   // recalculated from the team's changes
            var xi = x && m.xf[x[1]], ov = txt && !sp && xi && !xi[3] && !/center|right/.test(xi[2]) && !byC[c + 1] && txt.length > 3;   // text runs into the empty cell to its right, as in Excel
            h.push('<td data-ref="' + ref + '" class="' + cls + (ov ? " cu-ov" : "") + (ovr !== undefined && !same(ovr, p.cv[ref]) ? " cu-calc" : "") + '"' + at + ">" + (txt ? (ov ? "<span>" + esc(txt) + "</span>" : esc(txt)) : "") + "</td>");
          }
        });
        h.push("</tr>");
      });
      h.push("</tbody></table>");
      var hh = 22;
      (g.img || []).forEach(function (im) { if (m.media[im[0]]) h.push('<img class="cu-pic" alt="" src="' + m.media[im[0]] + '" style="left:' + (im[1] + 42) + "px;top:" + (im[2] + hh) + "px;width:" + im[3] + "px;height:" + im[4] + 'px">'); });
      sheet.innerHTML = h.join("");
      placeHandle();
      sheet.style.zoom = state.zoom;
      syncBar(); setTimeout(syncBar, 60);
      go.innerHTML = '<option value="">Section…</option>' + p.sections.map(function (s) { return '<option value="' + esc(s.rows[0].c[0] ? s.rows[0].c[0].ref : "") + '" data-r="' + s.rows[0].r + '">' + esc(s.t) + "</option>"; }).join("");
      var nb = wrap.querySelector(".cu-po-note"); if (nb) nb.remove();
      if (p.prog && p.prog.linked && p.sections.some(function (s) { return / · PO/.test(s.t) && s.rows[0].c.some(function (c) { return sheet.querySelector('td.cu-ed[data-ref="' + c.ref + '"]'); }); })) {
        var po = p.sections.filter(function (s) { return / · PO/.test(s.t) && s.rows[0].c.some(function (c) { return sheet.querySelector('td.cu-ed[data-ref="' + c.ref + '"]'); }); });
        wrap.querySelector(".cu-sheet-wrap").insertAdjacentHTML("beforebegin", '<div class="cu-po-note">This project\'s monthly <b>Actual Progress (%)</b> (row ' + p.prog.rAct + ') is calculated from its POs, weighted by contract value. ' +
          "Update each PO's Actual Progress in the PO table to the right" + (po.length ? ': ' + po.map(function (s) { return '<a href="#" data-go="' + esc(s.rows[0].c[0].ref) + '">' + esc(s.t.split(" · ").pop()) + "</a>"; }).join(" · ") : "") + ".</div>");
        wrap.querySelectorAll(".cu-po-note a").forEach(function (a) { a.addEventListener("click", function (ev) { ev.preventDefault(); jump(a.getAttribute("data-go")); }); });
      }
      count();
    }
    function count() { var n = changedCount(m, d, state.code); saved.dataset.n = n; wrap.querySelector('[data-a="reset"]').textContent = n ? "Undo my " + n + " change" + (n === 1 ? "" : "s") + " (this project)" : "Undo my changes (this project)"; }
    /* in-place editor: one control at a time over the clicked yellow cell */
    var openEd = null;
    function closeEd(commit) {
      if (!openEd) return;
      var o = openEd; openEd = null;
      if (commit) {
        var c = o.it.c, raw = o.ctl.value.trim(), v = raw;
        if (isFx(raw)) {                               // a formula typed by the user (e.g. =K106+30, =EDATE(J107,3))
          var why = XLCalc.check(raw);
          if (why) { alert("This formula cannot be used: " + raw + "\n" + why + "\n\nAvailable: " + XLCalc.functions().join(", ")); o.td.classList.remove("cu-open"); if (o.ctl.parentNode) o.ctl.parentNode.removeChild(o.ctl); return; }
          v = "=" + raw.slice(1).trim();
        } else if (c.k === "pct") v = raw === "" ? "" : isNaN(+raw.replace("%", "")) ? raw : String(Math.round(+raw.replace("%", "") * 1e6) / 1e8);
        else if (c.k === "list" && listNum(raw) != null) v = String(listNum(raw));   // "100%" from a Yes/No-style list → 1, as Excel stores it
        else if (c.k === "num") v = raw === "" ? "" : isNaN(+raw.replace(/,/g, "")) ? raw : String(+raw.replace(/,/g, ""));
        var e = d.edits[state.code] = d.edits[state.code] || {};
        if (canon(v) === canon(c.v)) delete e[o.ref]; else e[o.ref] = v;
        remember(o.ref, o.it);
        state.active = o.ref;
        persist();
        var ch = o.ref in e;
        o.td.classList.toggle("cu-chg", ch);
        if (ch) o.td.title = "Was: " + (shownOf(c, o.xf, c.v) || "(empty)"); else o.td.removeAttribute("title");
        o.td.querySelector(".cu-val").textContent = shownOf(c, o.xf, ch ? e[o.ref] : c.v);
        count();
        if (cur()) { var sw = wrap.querySelector(".cu-sheet-wrap"), st0 = sw.scrollTop, sl0 = sw.scrollLeft; if (o.ctl.parentNode) o.ctl.parentNode.removeChild(o.ctl); draw(); sw.scrollTop = st0; sw.scrollLeft = sl0; return; }   // formulas follow the change
      }
      if (o.ctl.parentNode) o.ctl.parentNode.removeChild(o.ctl);
      o.td.classList.remove("cu-open");
    }
    function openAt(td) {
      if (openEd && openEd.td === td) return;
      closeEd(true);
      var ref = td.getAttribute("data-ref"), it = info[ref]; if (!it) return;
      var c = it.c, e = d.edits[state.code] || {}, v = ref in e ? e[ref] : c.v, xf = td.getAttribute("data-xf"), ctl;
      if (isFx(v)) { ctl = document.createElement("input"); ctl.type = "text"; ctl.value = v; }
      else if (c.k === "list") { ctl = document.createElement("select");
        var lab = function (o) { var t = fmtCell(m, xf, "list", o); return t === o ? o : t; }, eqo = function (o) { var a = listNum(o), b = listNum(v); return o === v || (a != null && b != null && Math.abs(a - b) < 1e-12); };
        ctl.innerHTML = '<option value=""></option>' + c.o.map(function (o) { return '<option value="' + esc(o) + '"' + (eqo(o) ? " selected" : "") + ">" + esc(lab(o)) + "</option>"; }).join("") +
          (v && !c.o.some(eqo) ? '<option value="' + esc(v) + '" selected>' + esc(lab(v)) + "</option>" : ""); }
      else if (c.k === "date") { ctl = document.createElement("input"); ctl.type = "date"; ctl.value = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
        ctl.addEventListener("keydown", function (ev) { if (ev.key === "=") { ev.preventDefault(); var t = document.createElement("input"); t.type = "text"; t.className = "cu-ctl"; t.value = "="; ctl.parentNode.replaceChild(t, ctl); openEd.ctl = t; wire(t); t.focus(); t.setSelectionRange(1, 1); } }); }   // "=" starts a formula
      else if (c.k === "num" || c.k === "pct") { ctl = document.createElement("input"); ctl.type = "text"; ctl.inputMode = "decimal"; ctl.value = c.k === "pct" && v !== "" && !isNaN(+v) ? String(Math.round(+v * 1e6) / 1e4) : v; ctl.placeholder = c.k === "pct" ? "%" : ""; }
      else { ctl = document.createElement("textarea"); ctl.value = v; }
      ctl.className = "cu-ctl";
      td.classList.add("cu-open"); td.appendChild(ctl);
      openEd = { td: td, ref: ref, it: it, ctl: ctl, xf: xf };
      ctl.focus(); if (ctl.select && ctl.tagName !== "SELECT") try { ctl.select(); } catch (er) { /* date input */ }
      wire(ctl);
      if (ctl.tagName === "SELECT") ctl.addEventListener("change", function () { closeEd(true); });
    }
    function wire(ctl) {
      ctl.addEventListener("keydown", function (ev) {
        if (ev.key === "Escape") { ev.preventDefault(); closeEd(false); }
        else if (ev.key === "Enter" && (ctl.tagName !== "TEXTAREA" || !ev.shiftKey && !ev.altKey)) { ev.preventDefault(); closeEd(true); }
        else if (ev.key === "Tab") { ev.preventDefault(); var td0 = openEd && openEd.td, all = Array.prototype.slice.call(sheet.querySelectorAll("td.cu-ed")), i = all.indexOf(td0); closeEd(true); var nx = all[i + (ev.shiftKey ? -1 : 1)]; if (nx) openAt(nx); }
      });
    }
    sheet.addEventListener("click", function (ev) {
      if (ev.target.classList.contains("cu-fill")) return;
      var td = ev.target.closest && ev.target.closest("td.cu-ed"); if (td && !ev.target.classList.contains("cu-ctl")) { state.active = td.getAttribute("data-ref"); placeHandle(); openAt(td); }
    });
    /* ---- fill handle (as in Excel): drag the small square of the active cell down / across, or double-click it to fill
       down the editable block below. Formulas are copied with their relative references shifted ($ references stay);
       a date continues day by day; any other value is copied. Locked cells are skipped. */
    function placeHandle() {
      var old = sheet.querySelector(".cu-fill"); if (old) old.remove();
      var td = state.active && sheet.querySelector('td.cu-ed[data-ref="' + state.active + '"]'); if (!td) return;
      var hd = document.createElement("div"); hd.className = "cu-fill"; hd.title = "Drag to copy down / across (double-click: fill down)"; td.appendChild(hd);
      td.classList.add("cu-act"); Array.prototype.forEach.call(sheet.querySelectorAll("td.cu-act"), function (x) { if (x !== td) x.classList.remove("cu-act"); });
    }
    function srcFormula(p, ref, e) {               // the formula of the source cell: typed by the team, else the card's own
      if (ref in e) return isFx(e[ref]) ? e[ref].trim().slice(1) : null;
      if (p.fx && p.fx[ref]) return p.fx[ref];
      var hit = null; Object.keys(p.fsd || {}).forEach(function (mr) { if (p.fsd[mr].indexOf(ref) >= 0) { var a = splitRef(mr), b = splitRef(ref); hit = XLCalc.shift(p.fx[mr], b.r - a.r, b.c - a.c); } });
      return hit;
    }
    function fillTo(src, targets) {
      var p = cur(), e = d.edits[state.code] = d.edits[state.code] || {}, it = info[src]; if (!it) return;
      var a = splitRef(src), fx = srcFormula(p, src, e), v = src in e ? e[src] : it.c.v, done = 0, skipped = 0;
      targets.forEach(function (t) {
        var td = sheet.querySelector('td.cu-ed[data-ref="' + t + '"]'), ti = info[t];
        if (!td || !ti) { skipped++; return; }
        var b = splitRef(t), dr = b.r - a.r, dc = b.c - a.c, nv;
        if (fx != null) nv = "=" + XLCalc.shift(fx, dr, dc);
        else if (it.c.k === "date" && /^\d{4}-\d{2}-\d{2}$/.test(v)) { var tt = Date.parse(v + "T00:00:00Z") + (dr + dc) * 864e5; nv = new Date(tt).toISOString().slice(0, 10); }
        else nv = v;
        if (canon(nv) === canon(ti.c.v)) delete e[t]; else e[t] = nv;
        remember(t, ti); done++;
      });
      persist(); count();
      var sw = wrap.querySelector(".cu-sheet-wrap"), st0 = sw.scrollTop, sl0 = sw.scrollLeft; draw(); sw.scrollTop = st0; sw.scrollLeft = sl0;
      saved.textContent = "Filled " + done + " cell" + (done === 1 ? "" : "s") + (skipped ? " · " + skipped + " locked cell" + (skipped === 1 ? "" : "s") + " skipped" : "");
    }
    var drag = null;
    sheet.addEventListener("mousedown", function (ev) {
      if (!ev.target.classList.contains("cu-fill")) return;
      ev.preventDefault(); ev.stopPropagation(); closeEd(true);
      drag = { src: state.active, end: state.active };
    });
    document.addEventListener("mousemove", function (ev) {
      if (!drag) return;
      var el = document.elementFromPoint(ev.clientX, ev.clientY), td = el && el.closest && el.closest("td[data-ref], td"); if (!td || !sheet.contains(td)) return;
      var tr = td.parentNode, r = +tr.getAttribute("data-r"), ci = Array.prototype.indexOf.call(tr.children, td);
      var a = splitRef(drag.src), ref = td.getAttribute("data-ref");
      var col = ref ? splitRef(ref).c : null;
      if (!r) return;
      // the target: same column below (or above), or same row to the right / left — whichever the pointer moved further along
      var dRows = Math.abs(r - a.r), dCols = col ? Math.abs(col - a.c) : 0;
      drag.end = dRows >= dCols ? colStr(a.c) + r : colStr(col) + a.r;
      Array.prototype.forEach.call(sheet.querySelectorAll("td.cu-fsel"), function (x) { x.classList.remove("cu-fsel"); });
      rangeOf(drag.src, drag.end).forEach(function (k) { var x = sheet.querySelector('td[data-ref="' + k + '"]'); if (x) x.classList.add("cu-fsel"); });
    });
    document.addEventListener("mouseup", function () {
      if (!drag) return;
      var dg = drag; drag = null;
      Array.prototype.forEach.call(sheet.querySelectorAll("td.cu-fsel"), function (x) { x.classList.remove("cu-fsel"); });
      var t = rangeOf(dg.src, dg.end); if (t.length) fillTo(dg.src, t);
    });
    sheet.addEventListener("dblclick", function (ev) {
      if (!ev.target.classList.contains("cu-fill")) return;
      ev.preventDefault(); var a = splitRef(state.active), t = [];
      for (var r = a.r + 1; r < a.r + 2000; r++) { var x = sheet.querySelector('td.cu-ed[data-ref="' + colStr(a.c) + r + '"]'); if (!x) { if (sheet.querySelector('tr[data-r="' + r + '"]')) break; else continue; } t.push(colStr(a.c) + r); }
      if (t.length) fillTo(state.active, t);
    });
    function rangeOf(src, end) {                   // cells from the source (exclusive) to end, one line
      var a = splitRef(src), b = splitRef(end), out = [];
      if (!b || (a.r === b.r && a.c === b.c)) return out;
      if (a.c === b.c) { var st = b.r > a.r ? 1 : -1; for (var r = a.r + st; st > 0 ? r <= b.r : r >= b.r; r += st) out.push(colStr(a.c) + r); }
      else { var sc = b.c > a.c ? 1 : -1; for (var c = a.c + sc; sc > 0 ? c <= b.c : c >= b.c; c += sc) out.push(colStr(c) + a.r); }
      return out;
    }
    document.addEventListener("mousedown", function (ev) { if (openEd && !openEd.td.contains(ev.target)) closeEd(true); });
    wrap.querySelector(".cu-by").addEventListener("change", function (ev) { d.by = ev.target.value.trim(); persist(); });
    sel.addEventListener("change", function () { closeEd(true); state.code = d.last = sel.value; saveDraft(m, d); draw(); });
    wrap.querySelector(".cu-z").addEventListener("change", function (ev) { state.zoom = d.zoom = +ev.target.value; saveDraft(m, d); sheet.style.zoom = state.zoom; syncBar(); });
    /* horizontal scroll bar above the sheet (mirrors the sheet's own), and the sheet sized to the window so its bottom bar shows too */
    var hbar = wrap.querySelector(".cu-hbar"), sw = wrap.querySelector(".cu-sheet-wrap"), lock = false;
    function syncBar() {
      hbar.firstChild.style.width = sw.scrollWidth + "px";
      var top = sw.getBoundingClientRect().top + (window.scrollY || 0);
      sw.style.height = Math.max(320, window.innerHeight - top - 12) + "px";
    }
    hbar.addEventListener("scroll", function () { if (lock) { lock = false; return; } lock = true; sw.scrollLeft = hbar.scrollLeft; });
    sw.addEventListener("scroll", function () { if (lock) { lock = false; return; } lock = true; hbar.scrollLeft = sw.scrollLeft; });
    window.addEventListener("resize", syncBar); window.addEventListener("load", syncBar);
    if (window.ResizeObserver) new ResizeObserver(function () { syncBar(); }).observe(wrap.querySelector(".cu-top"));
    function jump(ref) { var td = ref && sheet.querySelector('td[data-ref="' + ref + '"]'); if (td) td.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" }); }
    go.addEventListener("change", function () {
      var o = go.selectedOptions[0], td = go.value && sheet.querySelector('td[data-ref="' + go.value + '"]');
      if (td) jump(go.value); else { var tr = o && sheet.querySelector('tr[data-r="' + o.getAttribute("data-r") + '"]'); if (tr) tr.scrollIntoView({ block: "start", behavior: "smooth" }); }
      go.value = "";
    });
    wrap.querySelector('[data-a="reset"]').addEventListener("click", function () {
      if (!changedCount(m, d, state.code) || !confirm("Undo all your changes to " + state.code + "?")) return;
      delete d.edits[state.code]; persist(); draw();
    });
    wrap.querySelector('[data-a="dl"]').addEventListener("click", function () {
      closeEd(true);
      if (!d.by) { alert("Please enter your name first."); wrap.querySelector(".cu-by").focus(); return; }
      var u = updatesOf(m, d), codes = Object.keys(u.projects);
      if (!codes.length) { alert("No changes yet."); return; }
      var name = "NSR_Card_Updates_" + (codes.length === 1 ? codes[0] : codes.length + "_projects") + "_" + d.by.replace(/[^\w]+/g, "_").slice(0, 30) + "_" + u.savedAt.slice(0, 10) + ".json";
      saveFile(name, JSON.stringify(u, null, 1));
      saved.textContent = "Downloaded " + name + " — send it to the Projects Department";
      if (opts.onDownload) opts.onDownload(u);
    });
    fillSel(); draw();
    return { draft: function () { return d; } };
  }

  /* ------------------------------------------------------------------ apply: updates → new month workbook */
  /* updates: [{ kind:"sar-card-updates", by, savedAt, projects:{ code:{ cells:[{ref,s,l,h,k,from,to}] } } }] (latest savedAt wins per cell) */
  function apply(buffer, updates, fileName) {
    var report = [];
    return JSZip.loadAsync(buffer).then(function (zip) {
      return readBook(zip).then(function (book) {
        var cs = cardSheets(book), byCode = {}; cs.forEach(function (s) { byCode[s.code] = s; });
        // merge: one value per project + cell, the latest saved file wins
        var want = {};
        updates.slice().sort(function (a, b) { return String(a.savedAt).localeCompare(String(b.savedAt)); }).forEach(function (u) {
          Object.keys(u.projects || {}).forEach(function (code) { (u.projects[code].cells || []).forEach(function (c) {
            var k = code + "|" + c.ref, prev = want[k];
            want[k] = { code: code, c: c, by: u.by, at: u.savedAt, over: prev ? prev.by + " (" + String(prev.at).slice(0, 10) + ")" : "" };
          }); });
        });
        var perSheet = {};
        Object.keys(want).forEach(function (k) {
          var w = want[k]; if (!byCode[w.code]) { report.push({ code: w.code, ref: w.c.ref, s: w.c.s, l: w.c.l, h: w.c.h, to: w.c.to, by: w.by, status: "skipped", why: "project not in this file" }); return; }
          (perSheet[w.code] = perSheet[w.code] || []).push(w);
        });
        var chain = Promise.resolve();
        Object.keys(perSheet).forEach(function (code) {
          chain = chain.then(function () {
            var sh = byCode[code];
            return zip.file(sh.path).async("string").then(function (xs) {
              var doc = parse(xs), S = readSheet(book, sh, doc), mdl = model(book, sh, S), idx = {}, byKey = {};
              mdl.sections.forEach(function (s) { s.rows.forEach(function (row) { row.c.forEach(function (c) {
                idx[c.ref] = { s: s.t, l: row.l, h: c.h, c: c };
                var key = s.t + "|" + row.l + "|" + c.h; (byKey[key] = byKey[key] || []).push(c.ref);
              }); }); });
              var changed = 0;
              perSheet[code].forEach(function (w) {
                var c = w.c, t = idx[c.ref], ref = c.ref, rep = { code: code, ref: c.ref, s: c.s, l: c.l, h: c.h, from: c.from, to: c.to, by: w.by, over: w.over };
                if (c.g) {                                     // any non-formula cell: same section · row label · column
                  var pc = splitRef(c.ref), lab = function (r) { return anyLabel(function (cc) { var x = S.cells[colStr(cc) + r]; return x && typeof x.val === "string" ? x.val : ""; }, pc.c); };
                  if (!(secTitleOf(mdl.heads, pc.r) === c.s && lab(pc.r) === c.l)) {
                    var hit = []; for (var rr = 1; rr <= S.maxR; rr++) if (secTitleOf(mdl.heads, rr) === c.s && lab(rr) === c.l) hit.push(rr);
                    if (hit.length !== 1) { rep.status = "skipped"; rep.why = hit.length ? "row appears more than once — update by hand" : "row not found in this file"; report.push(rep); return; }
                    ref = colStr(pc.c) + hit[0]; rep.moved = c.ref + " → " + ref;
                  }
                  var gx = S.cells[ref];
                  if (!gx || gx.locked) { rep.status = "skipped"; rep.why = "cell is locked in this file"; report.push(rep); return; }
                  if (gx.sharedMaster) { rep.status = "skipped"; rep.why = "cell starts a shared formula — update by hand"; report.push(rep); return; }
                  rep.now = gx ? display(gx) : "";
                  writeCell(doc, ref, c.k, c.to, gx);
                  rep.ref = ref; rep.status = "applied"; changed++; report.push(rep); return;
                }
                if (!(t && t.l === c.l && t.h === c.h)) {      // the row moved / changed: find the same section · row · column
                  var alt = byKey[c.s + "|" + c.l + "|" + c.h] || [];
                  if (alt.length === 1) { ref = alt[0]; t = idx[ref]; rep.moved = c.ref + " → " + ref; }
                  else if (t && t.s === c.s && (t.l === c.l || /^Row \d+$/.test(c.l))) { /* same place, label edited by the team */ }
                  else { rep.status = "skipped"; rep.why = alt.length > 1 ? "row appears more than once — update by hand" : "row / column not found as a yellow cell"; report.push(rep); return; }
                }
                var tx = S.cells[ref];
                if (tx && tx.f && t.c.p) { rep.status = "skipped"; rep.why = "cell holds a formula in this file"; report.push(rep); return; }
                if (tx && tx.locked && !t.c.p) { rep.status = "skipped"; rep.why = "cell is locked in this file"; report.push(rep); return; }
                if (tx && tx.sharedMaster) { rep.status = "skipped"; rep.why = "cell starts a shared formula — update by hand"; report.push(rep); return; }
                rep.now = t.c.v;
                writeCell(doc, ref, c.k, c.to, S.cells[ref]);
                rep.ref = ref; rep.status = "applied"; changed++; report.push(rep);
              });
              if (changed) zip.file(sh.path, new XMLSerializer().serializeToString(doc), { createFolders: false });
            });
          });
        });
        return chain.then(function () {
          // recalculate on open (formulas reading the updated cells)
          return zip.file("xl/workbook.xml").async("string").then(function (w) {
            var d = parse(w), cp = d.getElementsByTagNameNS(NS, "calcPr")[0];
            if (!cp) { cp = d.createElementNS(NS, "calcPr"); d.documentElement.appendChild(cp); }
            cp.setAttribute("fullCalcOnLoad", "1");
            zip.file("xl/workbook.xml", new XMLSerializer().serializeToString(d), { createFolders: false });
            return zip.generateAsync({ type: "blob", compression: "DEFLATE", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
          });
        }).then(function (blob) { return { blob: blob, report: report, name: fileName }; });
      });
    });
  }
  function writeCell(doc, ref, k, v, old) {
    var p = splitRef(ref), sd = doc.getElementsByTagNameNS(NS, "sheetData")[0];
    var row = kids(sd, "row").filter(function (r) { return +r.getAttribute("r") === p.r; })[0];
    if (!row) {
      row = doc.createElementNS(NS, "row"); row.setAttribute("r", String(p.r));
      var after = kids(sd, "row").filter(function (r) { return +r.getAttribute("r") > p.r; })[0]; sd.insertBefore(row, after || null);
    }
    var c = kids(row, "c").filter(function (x) { return x.getAttribute("r") === ref; })[0];
    if (!c) {
      c = doc.createElementNS(NS, "c"); c.setAttribute("r", ref);
      var nx = kids(row, "c").filter(function (x) { var q = splitRef(x.getAttribute("r")); return q && q.c > p.c; })[0]; row.insertBefore(c, nx || null);
    }
    kids(c, "f").concat(kids(c, "v"), kids(c, "is")).forEach(function (n) { c.removeChild(n); });
    c.removeAttribute("t");
    v = canon(v);
    if (v === "") return;
    if (/^=./.test(v)) {                           // a formula typed by the team: written as a formula, Excel calculates it on opening
      var fe = doc.createElementNS(NS, "f");
      fe.textContent = v.slice(1).replace(/(^|[^A-Za-z0-9_.])(IFS|SWITCH|XLOOKUP|XMATCH|CONCAT|TEXTJOIN|MAXIFS|MINIFS|IFNA|DAYS)\(/gi, function (m0, pre, fn) { return pre + "_xlfn." + fn.toUpperCase() + "("; });
      c.appendChild(fe); return;
    }
    var num = null;
    if (k === "date") num = isoToSerial(v);
    else if ((k === "num" || k === "pct") && !isNaN(+v)) num = +v;
    if (num == null && k !== "text" && /^-?\d+(\.\d+)?$/.test(v) && (k === "auto" || k === "list" || old && typeof old.val === "number")) num = +v;   /* numeric list choices are numbers */
    if (num != null) { var ve = doc.createElementNS(NS, "v"); ve.textContent = String(num); c.appendChild(ve); return; }
    c.setAttribute("t", "inlineStr");
    var is = doc.createElementNS(NS, "is"), t = doc.createElementNS(NS, "t"); t.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve"); t.textContent = v; is.appendChild(t); c.appendChild(is);
  }

  /* ------------------------------------------------------------------ the team page (.html) */
  function safeJson(o) { return JSON.stringify(o).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029"); }
  function teamPage(m, kit, selfCode) {
    var logo = kit.images["assets/img/sar-logo.png"] || "";
    var title = "NSR Project Cards — Team Update" + (m.month ? " (" + m.month + ")" : "");
    return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      "<title>" + esc(title) + "</title><style>\n" + kit.css + "\nbody{background:var(--tint-5)}.cu-page{max-width:1280px;margin:0 auto;padding:16px}" +
      ".cu-brand{display:flex;align-items:center;gap:16px;padding:12px 16px;background:#fff;border-bottom:3px solid var(--sar-blue)}.cu-brand img{height:40px}.cu-brand h1{margin:0;font-size:20px;color:var(--sar-blue)}" +
      ".cu-brand .sub{color:var(--slate);font-size:13px}\n</style></head><body>" +
      '<header class="cu-brand">' + (logo ? '<img src="' + logo + '" alt="SAR">' : "") + "<div><h1>" + esc(title) + '</h1><div class="sub">Source: ' + esc(m.file) +
      " · " + m.projects.length + " projects · prepared " + esc(new Date(m.extractedAt).toLocaleDateString("en-GB")) + '</div></div></header><main class="cu-page" id="cu"></main>' +
      "<script>window.SAR_CARD_MODEL = " + safeJson(m) + ";</script>\n<script>/* xlcalc.js + cardform.js */\n" + selfCode.replace(/<\/script/gi, "<\\/script") + "\n</script>\n" +
      "<script>SARCardForm.editor(document.getElementById('cu'), window.SAR_CARD_MODEL);</script></body></html>";
  }

  window.SARCardForm = { fmtNum: fmtNum, isDateFmt: isDateFmt, extract: extract, editor: editor, apply: apply, teamPage: teamPage, updatesOf: updatesOf, loadDraft: loadDraft, saveFile: saveFile };
})();

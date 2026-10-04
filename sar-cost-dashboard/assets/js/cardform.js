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
  function kids(el, name) { return Array.prototype.filter.call(el ? el.childNodes : [], function (n) { return n.nodeType === 1 && n.localName === name; }); }
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
  function readBook(zip) {
    function xml(p) { var f = zip.file(p); return f ? f.async("string").then(parse) : Promise.resolve(null); }
    return Promise.all([xml("xl/workbook.xml"), xml("xl/_rels/workbook.xml.rels"), xml("xl/sharedStrings.xml"), xml("xl/styles.xml")]).then(function (x) {
      var wb = x[0], rels = {}, ss = [], st = x[3];
      if (!wb) throw new Error("Not an Excel workbook");
      if (x[1]) Array.prototype.forEach.call(x[1].getElementsByTagNameNS(NS_REL, "Relationship"), function (e) { rels[e.getAttribute("Id")] = join("xl/workbook.xml", e.getAttribute("Target")); });
      if (x[2]) Array.prototype.forEach.call(x[2].getElementsByTagNameNS(NS, "si"), function (si) { ss.push(Array.prototype.map.call(si.getElementsByTagNameNS(NS, "t"), function (t) {
        var p = t.parentNode; return p.localName === "rPh" ? "" : t.textContent; }).join("")); });
      var fmts = {}, fills = [], xfs = [];
      if (st) {
        Array.prototype.forEach.call(st.getElementsByTagNameNS(NS, "numFmt"), function (n) { fmts[+n.getAttribute("numFmtId")] = n.getAttribute("formatCode"); });
        var fl = st.getElementsByTagNameNS(NS, "fills")[0];
        kids(fl, "fill").forEach(function (f) { var pf = kid(f, "patternFill"); fills.push(pf && pf.getAttribute("patternType") === "solid" ? rgbOf(kid(pf, "fgColor")) : null); });
        var cx = st.getElementsByTagNameNS(NS, "cellXfs")[0];
        kids(cx, "xf").forEach(function (xf) {
          var id = +(xf.getAttribute("numFmtId") || 0), fill = fills[+(xf.getAttribute("fillId") || 0)] || null;
          xfs.push({ fill: fill, yellow: isYellow(fill), dark: isDark(fill), date: isDateFmt(id, fmts[id]), pct: isPctFmt(id, fmts[id]) });
        });
      }
      var sheets = Array.prototype.map.call(wb.getElementsByTagNameNS(NS, "sheet"), function (s) {
        return { name: s.getAttribute("name"), path: rels[s.getAttributeNS(NS_R, "id")], hidden: /hidden/i.test(s.getAttribute("state") || "") };
      });
      return { zip: zip, wb: wb, ss: ss, xfs: xfs, sheets: sheets };
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
      cells[ref] = { r: p.r, c: p.c, ref: ref, s: s, t: t, val: val, f: !!f, yellow: !!x.yellow, dark: !!x.dark, date: !!x.date && typeof val === "number", pct: !!x.pct, isDateFmt: !!x.date };
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
    if (typeof cell.val === "number") {
      if (cell.date) return serialToIso(cell.val);
      return String(Math.round(cell.val * 1e10) / 1e10);
    }
    return String(cell.val);
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
    return { code: sh.code, sheet: sh.name, name: name, sections: order };
  }
  function extract(buffer, fileName) {
    return JSZip.loadAsync(buffer).then(readBook).then(function (book) {
      var cs = cardSheets(book); if (!cs.length) throw new Error("No “…_Project Card” sheets found — use the monthly EP - NSR Projects workbook.");
      var chain = Promise.resolve([]);
      cs.forEach(function (sh) {
        chain = chain.then(function (acc) {
          var f = book.zip.file(sh.path); if (!f) return acc;
          return f.async("string").then(function (s) { acc.push(model(book, sh, readSheet(book, sh, parse(s)))); return acc; });
        });
      });
      return chain.then(function (projects) {
        var m = /([A-Za-z]{3,9})[\s_-]?(\d{2,4})\s*(\.xlsx)?$/i.exec(String(fileName || "").replace(/\.xls[xm]$/i, "")) || [];
        return { kind: "sar-card-model", v: 1, file: fileName || "", month: m[1] ? m[1] + (m[2] ? " " + m[2] : "") : "", extractedAt: new Date().toISOString(),
          projects: projects.sort(function (a, b) { return String(a.code).localeCompare(String(b.code)); }) };
      });
    });
  }

  /* ------------------------------------------------------------------ editor (site page and the team .html) */
  function fmtShow(c, v) { return c.k === "pct" && v !== "" && !isNaN(+v) ? Math.round(+v * 10000) / 100 + "" : v; }
  function fmtStore(c, v) { v = canon(v); if (c.k === "pct" && v !== "" && !isNaN(+v)) return String(Math.round(+v * 1e6) / 1e8); return v; }
  function prettyDate(iso) { var t = Date.parse(iso + "T00:00:00Z"); if (isNaN(t)) return iso; var d = new Date(t); return d.getUTCDate() + "-" + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()] + "-" + d.getUTCFullYear(); }
  function shown(c, v) { return v === "" ? "—" : c.k === "date" ? prettyDate(v) : c.k === "pct" ? fmtShow(c, v) + "%" : v; }
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
      if (list.length) out.projects[p.code] = { name: p.name, cells: list };
    });
    return out;
  }
  function changedCount(m, d, code) { var u = updatesOf(m, d, [code]).projects[code]; return u ? u.cells.length : 0; }

  function editor(host, m, opts) {
    opts = opts || {};
    var d = loadDraft(m), last = d.last && m.projects.some(function (p) { return p.code === d.last; }) ? d.last : null;
    var state = { code: opts.code || last || (m.projects[0] && m.projects[0].code), q: "" };
    host.innerHTML = "";
    var wrap = document.createElement("div"); wrap.className = "cu"; host.appendChild(wrap);
    wrap.innerHTML =
      '<div class="cu-top"><div class="cu-who"><label>Your name<input type="text" class="cu-by" placeholder="Name of the person updating" value="' + esc(d.by) + '"></label></div>' +
      '<div class="cu-pick"><label>Project<select class="cu-proj"></select></label></div>' +
      '<div class="cu-acts"><span class="cu-saved"></span>' +
      '<button type="button" class="cu-btn ghost" data-a="reset">Undo my changes (this project)</button>' +
      '<button type="button" class="cu-btn" data-a="dl">Download my updates</button></div></div>' +
      '<div class="cu-help">Only the <b class="cu-yel">yellow</b> cells of the card can be updated here; grey values are filled by other teams and are shown for reference. ' +
      'Your changes are kept in this browser until you download them. Send the downloaded file to the Projects Department.</div>' +
      '<div class="cu-filter"><input type="search" class="cu-q" placeholder="Filter rows (activity, milestone, column…)"><label class="cu-only"><input type="checkbox" class="cu-chg"> Changed only</label></div>' +
      '<div class="cu-body"></div>';
    var sel = wrap.querySelector(".cu-proj"), body = wrap.querySelector(".cu-body"), saved = wrap.querySelector(".cu-saved");
    function fillSel() {
      sel.innerHTML = m.projects.map(function (p) { var n = changedCount(m, d, p.code);
        return '<option value="' + esc(p.code) + '"' + (p.code === state.code ? " selected" : "") + ">" + esc(p.code + " — " + (p.name || p.sheet)) + (n ? "  (" + n + " changed)" : "") + "</option>"; }).join("");
    }
    function persist() { var ok = saveDraft(m, d); saved.textContent = ok ? "Saved in this browser · " + new Date().toLocaleTimeString() : "Could not save in this browser — download your updates now"; fillSel(); if (opts.onChange) opts.onChange(d); }
    function input(c, v) {
      var cur = fmtShow(c, v), a = ' data-ref="' + esc(c.ref) + '"';
      if (c.f) return '<div class="cu-ro" title="Calculated by a formula in the card">' + esc(shown(c, c.v)) + "</div>";
      if (c.k === "list") return "<select" + a + '><option value=""></option>' + c.o.map(function (o) { return '<option' + (o === v ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") +
        (v && c.o.indexOf(v) < 0 ? "<option selected>" + esc(v) + "</option>" : "") + "</select>";
      if (c.k === "date") return '<input type="date"' + a + ' value="' + esc(/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "") + '">';
      if (c.k === "num" || c.k === "pct") return '<span class="cu-num"><input type="number" step="any"' + a + ' value="' + esc(cur) + '">' + (c.k === "pct" ? "<i>%</i>" : "") + "</span>";
      return String(v).length > 60 ? "<textarea rows=\"3\"" + a + ">" + esc(v) + "</textarea>" : '<input type="text"' + a + ' value="' + esc(v) + '">';
    }
    function draw() {
      var p = m.projects.filter(function (x) { return x.code === state.code; })[0];
      if (!p) { body.innerHTML = '<div class="cu-empty">No project selected.</div>'; return; }
      var e = d.edits[p.code] || {}, q = state.q.toLowerCase(), only = wrap.querySelector(".cu-chg").checked;
      var html = '<div class="cu-proj-head"><b>' + esc(p.code) + "</b> " + esc(p.name || p.sheet) + '<span class="cu-count"></span></div>';
      p.sections.forEach(function (s, si) {
        var rows = s.rows.filter(function (row) {
          if (q && (row.l + " " + s.t + " " + row.c.map(function (c) { return c.h; }).join(" ")).toLowerCase().indexOf(q) < 0) return false;
          if (only && !row.c.some(function (c) { return c.ref in e && canon(e[c.ref]) !== canon(c.v); })) return false;
          return true;
        });
        if (!rows.length) return;
        html += '<details class="cu-sec"' + (rows.length <= 12 || q || only ? " open" : "") + '><summary>' + esc(s.t) + '<span class="cu-n">' + rows.length + " row" + (rows.length === 1 ? "" : "s") + "</span></summary>";
        rows.forEach(function (row) {
          html += '<div class="cu-row"><div class="cu-lbl">' + esc(row.l) + (row.x.length ? '<div class="cu-ctx">' + row.x.map(function (x) {
            return "<span><i>" + esc(x[0]) + "</i> " + esc(/^\d{4}-\d{2}-\d{2}$/.test(x[1]) ? prettyDate(x[1]) : x[1]) + "</span>"; }).join("") + "</div>" : "") + '</div><div class="cu-fields">';
          row.c.forEach(function (c) {
            var v = c.ref in e ? e[c.ref] : c.v, ch = c.ref in e && canon(e[c.ref]) !== canon(c.v);
            html += '<label class="cu-f' + (ch ? " changed" : "") + (c.f ? " ro" : "") + '"><span class="cu-h">' + esc(c.h) + "</span>" + input(c, v) +
              (ch ? '<span class="cu-was">was: ' + esc(shown(c, c.v)) + "</span>" : "") + "</label>";
          });
          html += "</div></div>";
        });
        html += "</details>";
      });
      body.innerHTML = html || '<div class="cu-empty">No rows match.</div>';
      var n = changedCount(m, d, p.code), cnt = body.querySelector(".cu-count"); if (cnt) cnt.textContent = n ? " · " + n + " changed" : "";
    }
    function cellOf(ref) {
      var p = m.projects.filter(function (x) { return x.code === state.code; })[0], hit = null;
      p.sections.forEach(function (s) { s.rows.forEach(function (row) { row.c.forEach(function (c) { if (c.ref === ref) hit = c; }); }); });
      return hit;
    }
    body.addEventListener("change", function (ev) {
      var t = ev.target, ref = t.getAttribute && t.getAttribute("data-ref"); if (!ref) return;
      var c = cellOf(ref); if (!c) return;
      var e = d.edits[state.code] = d.edits[state.code] || {}, v = fmtStore(c, t.value);
      if (canon(v) === canon(c.v)) delete e[ref]; else e[ref] = v;
      persist();
      var lab = t.closest(".cu-f"), ch = ref in e;
      lab.classList.toggle("changed", ch);
      var was = lab.querySelector(".cu-was"); if (was) was.remove();
      if (ch) lab.insertAdjacentHTML("beforeend", '<span class="cu-was">was: ' + esc(shown(c, c.v)) + "</span>");
      var n = changedCount(m, d, state.code), cnt = body.querySelector(".cu-count"); if (cnt) cnt.textContent = n ? " · " + n + " changed" : "";
    });
    wrap.querySelector(".cu-by").addEventListener("change", function (ev) { d.by = ev.target.value.trim(); persist(); });
    sel.addEventListener("change", function () { state.code = d.last = sel.value; saveDraft(m, d); draw(); });
    var qt; wrap.querySelector(".cu-q").addEventListener("input", function (ev) { clearTimeout(qt); qt = setTimeout(function () { state.q = ev.target.value.trim(); draw(); }, 200); });
    wrap.querySelector(".cu-chg").addEventListener("change", draw);
    wrap.querySelector('[data-a="reset"]').addEventListener("click", function () {
      if (!changedCount(m, d, state.code) || !confirm("Undo all your changes to " + state.code + "?")) return;
      delete d.edits[state.code]; persist(); draw();
    });
    wrap.querySelector('[data-a="dl"]').addEventListener("click", function () {
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
                if (!(t && t.l === c.l && t.h === c.h)) {      // the row moved / changed: find the same section · row · column
                  var alt = byKey[c.s + "|" + c.l + "|" + c.h] || [];
                  if (alt.length === 1) { ref = alt[0]; t = idx[ref]; rep.moved = c.ref + " → " + ref; }
                  else if (t && t.s === c.s && (t.l === c.l || /^Row \d+$/.test(c.l))) { /* same place, label edited by the team */ }
                  else { rep.status = "skipped"; rep.why = alt.length > 1 ? "row appears more than once — update by hand" : "row / column not found as a yellow cell"; report.push(rep); return; }
                }
                if (t.c.f) { rep.status = "skipped"; rep.why = "cell holds a formula in this file"; report.push(rep); return; }
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
    var num = null;
    if (k === "date") num = isoToSerial(v);
    else if ((k === "num" || k === "pct") && !isNaN(+v)) num = +v;
    if (num == null && k !== "text" && k !== "list" && /^-?\d+(\.\d+)?$/.test(v) && old && typeof old.val === "number") num = +v;
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
      "<script>window.SAR_CARD_MODEL = " + safeJson(m) + ";</script>\n<script>/* cardform.js */\n" + selfCode.replace(/<\/script/gi, "<\\/script") + "\n</script>\n" +
      "<script>SARCardForm.editor(document.getElementById('cu'), window.SAR_CARD_MODEL);</script></body></html>";
  }

  window.SARCardForm = { extract: extract, editor: editor, apply: apply, teamPage: teamPage, updatesOf: updatesOf, loadDraft: loadDraft, saveFile: saveFile };
})();

/* Report Compare — writes the reviewed report.
 * Starts from THIS WEEK's original package (so charts, pictures, formats, conditional formats and macros stay byte-for-byte) and
 * rewrites only the cells the reviewer rejected or edited. Everything the reviewer accepted is already in the file.
 * Excel is told to recalculate on open, because the cached results of formulas fed by changed cells are stale.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./xl.js'), require('./diff.js'));
  else root.Writer = factory(root.Xl, root.Diff);
})(typeof self !== 'undefined' ? self : this, function (Xl, Diff) {
  'use strict';

  /* functions added to Excel after 2007 are stored with an _xlfn. prefix */
  var NEWFN = /(^|[^A-Za-z0-9_.])(XLOOKUP|XMATCH|CONCAT|TEXTJOIN|IFS|SWITCH|MAXIFS|MINIFS|IFNA)\(/gi;
  function fileFormula(f) { return f.replace(NEWFN, function (_, pre, fn) { return pre + '_xlfn.' + fn.toUpperCase() + '('; }); }

  function cellXml(a, s, t) {
    var at = ' r="' + a + '"' + (s ? ' s="' + s + '"' : '');
    if (!t || (t.k === '' && t.f == null)) return '<c' + at + '/>';
    if (t.f != null) { // formula, with its result cached when we know it (Excel recalculates on open anyway)
      var f = '<f>' + Xl.esc(fileFormula(t.f)) + '</f>';
      if (t.k === 'n') return '<c' + at + '>' + f + '<v>' + String(t.v) + '</v></c>';
      if (t.k === 's') return '<c' + at + ' t="str">' + f + '<v>' + Xl.esc(t.v) + '</v></c>';
      if (t.k === 'b') return '<c' + at + ' t="b">' + f + '<v>' + (t.v ? 1 : 0) + '</v></c>';
      if (t.k === 'e') return '<c' + at + ' t="e">' + f + '<v>' + Xl.esc(t.v) + '</v></c>';
      return '<c' + at + '>' + f + '</c>';
    }
    if (t.k === 'n') return '<c' + at + '><v>' + String(t.v) + '</v></c>';
    if (t.k === 'b') return '<c' + at + ' t="b"><v>' + (t.v ? 1 : 0) + '</v></c>';
    if (t.k === 'e') return '<c' + at + ' t="e"><v>' + Xl.esc(t.v) + '</v></c>';
    return '<c' + at + ' t="inlineStr"><is><t xml:space="preserve">' + Xl.esc(t.v) + '</t></is></c>';
  }

  /* Turn shared formulas into plain ones, so editing the master cell cannot break the cells that depend on it. */
  function unshare(xml, curSheet) {
    return xml.replace(/<c\b([^>]*?)>([\s\S]*?)<\/c>/g, function (whole, at, inner) {
      if (!/<f\b[^>]*t="shared"/.test(inner)) return whole;
      var ra = /\br="([A-Z]+\d+)"/.exec(at), cell = ra && curSheet.cells.get(ra[1]);
      if (!cell || cell.f == null) return whole;
      return '<c' + at + '>' + inner.replace(/<f\b[^>]*?(?:\/>|>[\s\S]*?<\/f>)/, '<f>' + Xl.esc(cell.f) + '</f>') + '</c>';
    });
  }

  function patchSheet(xml, patches, curSheet) {
    xml = unshare(xml, curSheet);
    var m = /<sheetData\b[^>]*?(?:\/>|>([\s\S]*?)<\/sheetData>)/.exec(xml);
    if (!m) return xml;
    var rows = [], re = /<row\b([^>]*?)(\/>|>([\s\S]*?)<\/row>)/g, x;
    while ((x = re.exec(m[1] || ''))) rows.push({ r: +Xl.attrs(x[1]).r, open: x[1], body: x[3] || '' });
    var byRow = {};
    rows.forEach(function (r) { byRow[r.r] = r; });
    patches.forEach(function (p) {
      var pa = Xl.parseAddr(p.a), row = byRow[pa.r];
      if (!row) { row = byRow[pa.r] = { r: pa.r, open: ' r="' + pa.r + '"', body: '' }; rows.push(row); }
      var cells = [], cre = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, cm, found = false;
      while ((cm = cre.exec(row.body))) {
        var ca = Xl.attrs(cm[1]);
        cells.push({ c: Xl.parseAddr(ca.r).c, a: ca.r, s: ca.s, xml: cm[0] });
      }
      cells.forEach(function (c) { if (c.a === p.a) { c.xml = cellXml(p.a, p.forceS ? p.s : (p.s != null && !c.s ? p.s : c.s), p.t); found = true; } });
      if (!found) cells.push({ c: pa.c, a: p.a, xml: cellXml(p.a, p.s, p.t) });
      cells.sort(function (u, v) { return u.c - v.c; });
      row.body = cells.map(function (c) { return c.xml; }).join('');
      row.open = row.open.replace(/\sspans="[^"]*"/, '');
    });
    rows.sort(function (u, v) { return u.r - v.r; });
    var sd = '<sheetData>' + rows.map(function (r) { return '<row' + r.open + '>' + r.body + '</row>'; }).join('') + '</sheetData>';
    return xml.slice(0, m.index) + sd + xml.slice(m.index + m[0].length);
  }

  /* A copy of cell style `base` with the date number format (id 14); returns its index. */
  function dateStyle(stylesXml, base) {
    var m = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml);
    if (!m) return null;
    var xfs = m[1].match(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g) || [], src = xfs[base || 0] || xfs[0];
    if (!src) return null;
    var nx = src.replace(/\snumFmtId="\d+"/, '').replace(/\sapplyNumberFormat="\d+"/, '').replace(/^<xf\b/, '<xf numFmtId="14" applyNumberFormat="1"');
    var all = m[0].replace(/<cellXfs\b([^>]*?)count="\d+"/, '<cellXfs$1count="' + (xfs.length + 1) + '"').replace('</cellXfs>', nx + '</cellXfs>');
    return { xml: stylesXml.replace(m[0], all), index: xfs.length };
  }
  /* tab colour: '#RRGGBB' sets it, null removes it (<tabColor> must be the first child of <sheetPr>) */
  function setTabColor(xml, hex) {
    var tag = hex ? '<tabColor rgb="FF' + hex.slice(1).toUpperCase() + '"/>' : '';
    if (/<sheetPr\b[^>]*\/>/.test(xml)) return xml.replace(/<sheetPr\b([^>]*)\/>/, tag ? '<sheetPr$1>' + tag + '</sheetPr>' : '<sheetPr$1/>');
    if (/<sheetPr\b/.test(xml)) {
      if (/<tabColor\b[^>]*\/>/.test(xml)) return xml.replace(/<tabColor\b[^>]*\/>/, tag);
      return tag ? xml.replace(/(<sheetPr\b[^>]*>)/, '$1' + tag) : xml;
    }
    return tag ? xml.replace(/(<worksheet\b[^>]*>)/, '$1<sheetPr>' + tag + '</sheetPr>') : xml;
  }
  /* sheet properties chosen in the page: ops = { hidden: {name: true|false}, color: {name: '#RRGGBB'|null} } */
  async function applySheetOps(zip, cur, ops) {
    var hidden = ops.hidden || {}, colors = ops.color || {}, any = Object.keys(hidden).length || Object.keys(colors).length;
    if (!any) return;
    var wb = await Xl.readText(zip, 'xl/workbook.xml'), finalHidden = {};
    cur.sheets.forEach(function (sh) { finalHidden[sh.name] = hidden[sh.name] != null ? !!hidden[sh.name] : sh.state !== 'visible'; });
    wb = wb.replace(/<sheet\b([^>]*?)\/>/g, function (m, at) {
      var a = Xl.attrs(at); if (!(a.name in hidden)) return m;
      var want = !!hidden[a.name], has = !!a.state && a.state !== 'visible';
      if (want === has) return m;
      at = at.replace(/\sstate="[^"]*"/, '') + (want ? ' state="hidden"' : '');
      return '<sheet' + at + '/>';
    });
    // the active tab must stay a visible sheet
    var av = /<workbookView\b[^>]*?\sactiveTab="(\d+)"/.exec(wb), activeIdx = av ? +av[1] : 0, active = cur.sheets[activeIdx];
    if (active && finalHidden[active.name]) {
      var ni = -1; cur.sheets.forEach(function (sh, i) { if (ni < 0 && !finalHidden[sh.name]) ni = i; });
      if (ni >= 0) {
        wb = wb.replace(/(<workbookView\b[^>]*?\sactiveTab=")\d+(")/, '$1' + ni + '$2').replace(/(<workbookView\b[^>]*?\sfirstSheet=")\d+(")/, '$1' + ni + '$2');
        var oldXml = await Xl.readText(zip, active.path); zip.file(active.path, oldXml.replace(/\stabSelected="1"/, ''));
        var nxt = cur.sheets[ni], nxml = await Xl.readText(zip, nxt.path);
        if (!/tabSelected="1"/.test(nxml)) zip.file(nxt.path, nxml.replace(/<sheetView\b/, '<sheetView tabSelected="1"'));
      }
    }
    zip.file('xl/workbook.xml', wb);
    for (var name in colors) {
      var sh = cur.byName[name]; if (!sh) continue;
      var x = await Xl.readText(zip, sh.path); zip.file(sh.path, setTabColor(x, colors[name]));
    }
  }
  async function build(JSZip, curBytes, prev, cur, dec, ops) {
    var view = Diff.makeView(prev, cur, dec), bySheet = {}, n = 0;
    Object.keys(dec).forEach(function (k) {
      var d = dec[k];
      if (d.m !== 'reject' && d.m !== 'custom') return;
      var i = k.lastIndexOf('!'), sheet = k.slice(0, i), a = k.slice(i + 1), cs = cur.byName[sheet];
      if (!cs) return;
      var cc = cs.cells.get(a);
      if (cc && cc.derived) return;          // spilled result of an array formula: nothing to write
      (bySheet[sheet] = bySheet[sheet] || []).push({ a: a, t: view.eff(sheet, a), s: cc ? cc.s : null });
      n++;
    });
    var zip = await JSZip.loadAsync(curBytes);
    // dates typed into cells that are not date-formatted get a date style (otherwise Excel shows the serial number)
    var stylesXml = await Xl.readText(zip, 'xl/styles.xml'), dstyle = {}, stylesDirty = false;
    for (var nm in bySheet) bySheet[nm].forEach(function (p) {
      if (!(p.t && p.t.date && p.t.k === 'n' && p.t.f == null) || Xl.isDateCell({ k: 'n', v: p.t.v, s: p.s || 0 }, cur.styles)) return;
      var base = p.s || 0;
      if (dstyle[base] == null) { var r = dateStyle(stylesXml, base); if (r) { stylesXml = r.xml; dstyle[base] = r.index; stylesDirty = true; } else dstyle[base] = -1; }
      if (dstyle[base] >= 0) { p.s = dstyle[base]; p.forceS = true; }
    });
    if (stylesDirty) zip.file('xl/styles.xml', stylesXml);
    for (var name in bySheet) {
      var sh = cur.byName[name], xml = await Xl.readText(zip, sh.path);
      zip.file(sh.path, patchSheet(xml, bySheet[name], sh));
    }
    if (ops) await applySheetOps(zip, cur, ops);
    // recalculate on open; drop the calculation chain (it lists formula cells that may no longer be formulas)
    var wb = await Xl.readText(zip, 'xl/workbook.xml');
    if (/<calcPr\b/.test(wb)) wb = wb.replace(/<calcPr\b([^>]*?)(\/?)>/, function (_, at, sl) { return '<calcPr' + at.replace(/\sfullCalcOnLoad="[^"]*"/, '') + ' fullCalcOnLoad="1"' + sl + '>'; });
    else wb = wb.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>');
    zip.file('xl/workbook.xml', wb);
    if (zip.file('xl/calcChain.xml')) {
      zip.remove('xl/calcChain.xml');
      var rels = await Xl.readText(zip, 'xl/_rels/workbook.xml.rels');
      zip.file('xl/_rels/workbook.xml.rels', rels.replace(/<Relationship\b[^>]*calcChain[^>]*\/>/g, ''));
      var ct = await Xl.readText(zip, '[Content_Types].xml');
      zip.file('[Content_Types].xml', ct.replace(/<Override\b[^>]*calcChain[^>]*\/>/g, ''));
    }
    var bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 }, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    return { bytes: bytes, patched: n };
  }

  function csvCell(v) { v = v == null ? '' : String(v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function show(c, st) { if (!c || (c.k === '' && c.f == null)) return ''; return c.f != null ? '=' + c.f + (c.k !== '' ? '  → ' + Xl.formatCell(c, st) : '') : Xl.formatCell(c, st); }
  /* The change log as CSV (UTF-8 with BOM so Excel reads Arabic text correctly). */
  function changeLog(cmp, dec, view, st, ops) {
    var rows = [['Sheet', 'Cell', 'Change', 'Last week', 'This week', 'Decision', 'Final value']];
    cmp.changes.forEach(function (ch) {
      var d = dec[ch.id], m = d ? d.m : 'pending', fin = view.eff(ch.sheet, ch.a);
      rows.push([ch.sheet, ch.a, ch.kind, show(ch.prev, st), show(ch.cur, st), m === 'pending' ? 'pending (kept as this week)' : m, show(fin, st)]);
    });
    Object.keys(dec).forEach(function (k) {
      if (dec[k].m !== 'custom' || cmp.byKey[k]) return;
      var i = k.lastIndexOf('!'), sheet = k.slice(0, i), a = k.slice(i + 1);
      rows.push([sheet, a, 'manual edit', show(view.prevCell(sheet, a), st), show(view.curCell(sheet, a), st), 'custom', show(view.eff(sheet, a), st)]);
    });
    if (ops) {
      Object.keys(ops.hidden || {}).forEach(function (n) { rows.push([n, '', 'sheet property', '', '', 'custom', ops.hidden[n] ? 'hidden' : 'visible']); });
      Object.keys(ops.color || {}).forEach(function (n) { rows.push([n, '', 'sheet property', '', '', 'custom', 'tab colour ' + (ops.color[n] || 'none')]); });
    }
    return '﻿' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
  }

  return { setTabColor: setTabColor, build: build, patchSheet: patchSheet, cellXml: cellXml, changeLog: changeLog };
});

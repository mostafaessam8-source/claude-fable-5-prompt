/* Report Compare — writes formatting and layout edits into the ORIGINAL .xlsx package.
 *  StyleBook    : fonts / fills / borders / number formats / cell formats (xf) in xl/styles.xml; a cell delta becomes a new xf (existing ones are never changed)
 *  sheet layout : merged cells, column widths, row heights, hidden rows / columns, freeze panes
 *  tables       : real Excel tables (xl/tables/tableN.xml + relationship + content type + <tableParts>)
 * Pure string work on the package text, no DOM: runs in the browser and in Node (tests).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./xl.js'));
  else root.XlsxFmt = factory(root.Xl);
})(typeof self !== 'undefined' ? self : this, function (Xl) {
  'use strict';

  var esc = Xl.esc;
  function list(xml, tag, child) {
    var m = new RegExp('<' + tag + '\\b[^>]*?(?:/>|>([\\s\\S]*?)</' + tag + '>)').exec(xml);
    if (!m || !m[1]) return [];
    return m[1].match(new RegExp('<' + child + '\\b[^>]*?(?:/>|>[\\s\\S]*?</' + child + '>)', 'g')) || [];
  }
  function rgbTag(tag, hex) { return '<' + tag + ' rgb="FF' + hex.slice(1).toUpperCase() + '"/>'; }
  var BUILTIN_NF = { 'General': 0, '0': 1, '0.00': 2, '#,##0': 3, '#,##0.00': 4, '0%': 9, '0.00%': 10, '0.00E+00': 11, '@': 49 };

  /* ---------- fonts / borders: parse, change, write in schema order ---------- */
  function parseFont(x) {
    var u = /<u\b([^>]*)\/?>/.exec(x);
    return {
      b: /<b\b(?![^>]*val="(0|false)")/.test(x), i: /<i\b(?![^>]*val="(0|false)")/.test(x), strike: /<strike\b(?![^>]*val="(0|false)")/.test(x),
      u: u ? (/val="(\w+)"/.exec(u[1]) || [0, 'single'])[1] : null,
      sz: (/<sz\b[^>]*val="([\d.]+)"/.exec(x) || [0, '11'])[1], color: (/<color\b[^>]*\/>/.exec(x) || [null])[0], name: (/<name\b[^>]*val="([^"]*)"/.exec(x) || [0, 'Calibri'])[1],
      family: (/<family\b[^>]*\/>/.exec(x) || [null])[0], charset: (/<charset\b[^>]*\/>/.exec(x) || [null])[0], scheme: (/<scheme\b[^>]*\/>/.exec(x) || [null])[0]
    };
  }
  function fontXml(p) {
    return '<font>' + (p.b ? '<b/>' : '') + (p.i ? '<i/>' : '') + (p.strike ? '<strike/>' : '') + (p.u ? (p.u === 'single' ? '<u/>' : '<u val="' + p.u + '"/>') : '') +
      '<sz val="' + p.sz + '"/>' + (p.color || '') + '<name val="' + esc(p.name) + '"/>' + (p.family || '') + (p.charset || '') + (p.scheme || '') + '</font>';
  }
  var SIDES = [['l', 'left'], ['r', 'right'], ['t', 'top'], ['b', 'bottom']];
  function parseBorder(x) {
    var o = { open: (/^<border\b([^>]*)>/.exec(x) || [0, ''])[1], sides: {}, diag: (/<diagonal\b[^>]*?(?:\/>|>[\s\S]*?<\/diagonal>)/.exec(x) || ['<diagonal/>'])[0] };
    SIDES.forEach(function (s) { var m = new RegExp('<' + s[1] + '\\b[^>]*?(?:/>|>[\\s\\S]*?</' + s[1] + '>)').exec(x); o.sides[s[0]] = m ? m[0] : '<' + s[1] + '/>'; });
    return o;
  }
  function borderXml(o, delta) {
    var out = '<border' + o.open + '>';
    SIDES.forEach(function (s) {
      var d = delta && Object.prototype.hasOwnProperty.call(delta, s[0]) ? delta[s[0]] : undefined;
      out += d === undefined ? o.sides[s[0]] : d === null ? '<' + s[1] + '/>' : '<' + s[1] + ' style="' + d.s + '"><color rgb="FF' + (d.c || '#000000').slice(1).toUpperCase() + '"/></' + s[1] + '>';
    });
    return out + o.diag + '</border>';
  }

  /* ---------- the style book ---------- */
  function StyleBook(xml) {
    this.xml = xml;
    this.fonts = list(xml, 'fonts', 'font'); this.fills = list(xml, 'fills', 'fill'); this.borders = list(xml, 'borders', 'border'); this.xfs = list(xml, 'cellXfs', 'xf');
    this.nf = {}; this.nfNew = [];                       // custom number formats: code -> id
    var self = this; (list(xml, 'numFmts', 'numFmt')).forEach(function (n) { var a = Xl.attrs(n); self.nf[a.formatCode] = +a.numFmtId; });
    this.maxNf = Math.max(163, Math.max.apply(null, [0].concat(Object.keys(this.nf).map(function (k) { return self.nf[k]; }))));
    this.cache = {};
  }
  function addUnique(arr, x) { var i = arr.indexOf(x); if (i >= 0) return i; arr.push(x); return arr.length - 1; }
  StyleBook.prototype.numFmtId = function (code) {
    if (Object.prototype.hasOwnProperty.call(BUILTIN_NF, code)) return BUILTIN_NF[code];
    if (Object.prototype.hasOwnProperty.call(this.nf, code)) return this.nf[code];
    this.nf[code] = ++this.maxNf; this.nfNew.push(code); return this.maxNf;
  };
  /* base xf index + delta -> index of an xf with the change applied (a new xf is added when needed) */
  StyleBook.prototype.derive = function (baseIdx, delta) {
    var key = baseIdx + '|' + JSON.stringify(delta); if (this.cache[key] != null) return this.cache[key];
    var bx = this.xfs[delta.reset ? 0 : baseIdx] || this.xfs[0] || '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>';
    var a = Xl.attrs((/^<xf\b([^>]*?)\/?>/.exec(bx) || [0, ''])[1]), inner = (/^<xf\b[^>]*?>([\s\S]*)<\/xf>$/.exec(bx) || [0, ''])[1];
    var alMatch = /<alignment\b([^>]*)\/?>/.exec(inner), prot = (/<protection\b[^>]*\/>/.exec(inner) || [''])[0], al = alMatch ? Xl.attrs(alMatch[1]) : {};
    // font
    var fontId = +a.fontId || 0;
    if ('b' in delta || 'i' in delta || 'u' in delta || 'sz' in delta || 'name' in delta || 'color' in delta) {
      var fp = parseFont(this.fonts[fontId] || this.fonts[0] || '<font><sz val="11"/><name val="Calibri"/></font>');
      if ('b' in delta) fp.b = !!delta.b; if ('i' in delta) fp.i = !!delta.i; if ('u' in delta) fp.u = delta.u ? 'single' : null;
      if ('sz' in delta) fp.sz = String(delta.sz); if ('name' in delta) { fp.name = delta.name; fp.scheme = null; }
      if ('color' in delta) fp.color = delta.color ? rgbTag('color', delta.color) : null;
      fontId = addUnique(this.fonts, fontXml(fp));
    }
    // fill
    var fillId = +a.fillId || 0;
    if ('fill' in delta) fillId = delta.fill ? addUnique(this.fills, '<fill><patternFill patternType="solid">' + rgbTag('fgColor', delta.fill) + '<bgColor indexed="64"/></patternFill></fill>') : 0;
    // border
    var borderId = +a.borderId || 0;
    if (delta.bd && Object.keys(delta.bd).length) borderId = addUnique(this.borders, borderXml(parseBorder(this.borders[borderId] || '<border><left/><right/><top/><bottom/><diagonal/></border>'), delta.bd));
    var numFmtId = 'nf' in delta ? this.numFmtId(delta.nf) : (+a.numFmtId || 0);
    if ('h' in delta) { if (delta.h) al.horizontal = delta.h; else delete al.horizontal; }
    if ('v' in delta) { if (delta.v) al.vertical = delta.v; else delete al.vertical; }
    if ('wrap' in delta) { if (delta.wrap) al.wrapText = '1'; else delete al.wrapText; }
    if ('indent' in delta) { if (delta.indent) al.indent = String(delta.indent); else delete al.indent; }
    var alXml = Object.keys(al).length ? '<alignment' + Object.keys(al).map(function (k) { return ' ' + k + '="' + esc(al[k]) + '"'; }).join('') + '/>' : '';
    var xf = '<xf numFmtId="' + numFmtId + '" fontId="' + fontId + '" fillId="' + fillId + '" borderId="' + borderId + '" xfId="' + (a.xfId || 0) + '" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"' + (alXml ? ' applyAlignment="1"' : '') + (prot ? ' applyProtection="1"' : '') + (alXml || prot ? '>' + alXml + prot + '</xf>' : '/>');
    return (this.cache[key] = addUnique(this.xfs, xf));
  };
  function setSection(xml, tag, items, extraBefore) {
    var re = new RegExp('<' + tag + '\\b([^>]*?)(?:/>|>[\\s\\S]*?</' + tag + '>)'), m = re.exec(xml), body = '<' + tag + ' count="' + items.length + '"';
    if (m) { var at = m[1].replace(/\scount="\d+"/, '').replace(/\/$/, ''); body = '<' + tag + at + ' count="' + items.length + '"'; }
    return m ? xml.replace(re, body + '>' + items.join('') + '</' + tag + '>') : xml;
  }
  StyleBook.prototype.serialize = function () {
    var x = this.xml;
    x = setSection(x, 'fonts', this.fonts); x = setSection(x, 'fills', this.fills); x = setSection(x, 'borders', this.borders); x = setSection(x, 'cellXfs', this.xfs);
    if (this.nfNew.length) {
      var self = this, add = this.nfNew.map(function (c) { return '<numFmt numFmtId="' + self.nf[c] + '" formatCode="' + esc(c) + '"/>'; });
      if (/<numFmts\b/.test(x)) { var cur = list(x, 'numFmts', 'numFmt'); x = x.replace(/<numFmts\b[^>]*?(?:\/>|>[\s\S]*?<\/numFmts>)/, '<numFmts count="' + (cur.length + add.length) + '">' + cur.join('') + add.join('') + '</numFmts>'); }
      else x = x.replace(/(<styleSheet\b[^>]*>)/, '$1<numFmts count="' + add.length + '">' + add.join('') + '</numFmts>');
    }
    return x;
  };

  /* ---------- sheet XML helpers ---------- */
  var AFTER_MERGE = /<(phoneticPr|conditionalFormatting|dataValidations|hyperlinks|printOptions|pageMargins|pageSetup|headerFooter|rowBreaks|colBreaks|customProperties|cellWatches|ignoredErrors|smartTags|drawing|legacyDrawing|legacyDrawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b/;
  function setMerges(xml, refs) {
    var has = /<mergeCells\b/.test(xml), tag = refs.length ? '<mergeCells count="' + refs.length + '">' + refs.map(function (r) { return '<mergeCell ref="' + r + '"/>'; }).join('') + '</mergeCells>' : '';
    if (has) return xml.replace(/<mergeCells\b[^>]*?(?:\/>|>[\s\S]*?<\/mergeCells>)/, tag);
    if (!tag) return xml;
    var m = AFTER_MERGE.exec(xml);
    return m ? xml.slice(0, m.index) + tag + xml.slice(m.index) : xml.replace('</worksheet>', tag + '</worksheet>');
  }
  /* <cols>: edit the width / hidden flag of ONE column, splitting ranges where needed */
  function setCol(xml, c, props) {
    var m = /<cols>([\s\S]*?)<\/cols>/.exec(xml), defs = [], re = /<col\b([^>]*)\/?>/g, x;
    if (m) while ((x = re.exec(m[1]))) { var a = Xl.attrs(x[1]); defs.push({ min: +a.min, max: +a.max, a: a }); }
    var out = [], hit = false;
    defs.forEach(function (d) {
      if (c < d.min || c > d.max) { out.push(d); return; }
      hit = true;
      if (c > d.min) out.push({ min: d.min, max: c - 1, a: Object.assign({}, d.a) });
      var mid = Object.assign({}, d.a); applyColProps(mid, props); out.push({ min: c, max: c, a: mid });
      if (c < d.max) out.push({ min: c + 1, max: d.max, a: Object.assign({}, d.a) });
    });
    if (!hit) { var n = { width: '9.140625' }; applyColProps(n, props); out.push({ min: c, max: c, a: n }); }
    out.sort(function (p, q) { return p.min - q.min; });
    var tag = '<cols>' + out.map(function (d) {
      var a = Object.assign({}, d.a, { min: d.min, max: d.max });
      return '<col' + Object.keys(a).map(function (k) { return ' ' + k + '="' + esc(a[k]) + '"'; }).join('') + '/>';
    }).join('') + '</cols>';
    if (m) return xml.replace(/<cols>[\s\S]*?<\/cols>/, tag);
    return /<sheetData\b/.test(xml) ? xml.replace(/<sheetData\b/, tag + '<sheetData') : xml;
  }
  function applyColProps(a, p) {
    if (p.width != null) { a.width = String(p.width); a.customWidth = '1'; if (!('style' in a)) { /* keep */ } }
    if ('hidden' in p) { if (p.hidden) a.hidden = '1'; else delete a.hidden; }
  }
  /* row heights / hidden rows: edit the <row> open tags (rows are created when missing). rows = { r: { ht, hidden } } */
  function editRows(xml, rows) {
    var m = /<sheetData\b[^>]*?(?:\/>|>([\s\S]*?)<\/sheetData>)/.exec(xml); if (!m) return xml;
    var list = [], re = /<row\b([^>]*?)(\/>|>([\s\S]*?)<\/row>)/g, x, by = {};
    while ((x = re.exec(m[1] || ''))) { var o = { r: +Xl.attrs(x[1]).r, a: Xl.attrs(x[1]), body: x[3] || '' }; list.push(o); by[o.r] = o; }
    Object.keys(rows).forEach(function (rk) {
      var r = +rk, p = rows[rk], o = by[r];
      if (!o) { o = by[r] = { r: r, a: { r: String(r) }, body: '' }; list.push(o); }
      if (p.ht != null) { o.a.ht = String(p.ht); o.a.customHeight = '1'; }
      if ('hidden' in p) { if (p.hidden) o.a.hidden = '1'; else delete o.a.hidden; }
    });
    list.sort(function (p, q) { return p.r - q.r; });
    var sd = '<sheetData>' + list.map(function (o) { return '<row' + Object.keys(o.a).map(function (k) { return ' ' + k + '="' + esc(o.a[k]) + '"'; }).join('') + '>' + o.body + '</row>'; }).join('') + '</sheetData>';
    return xml.slice(0, m.index) + sd + xml.slice(m.index + m[0].length);
  }
  /* freeze panes: fr = { r, c } = first scrolling row / column (1,1 or null = none) */
  function setFreeze(xml, fr) {
    var m = /<sheetView\b([^>]*?)(\/>|>([\s\S]*?)<\/sheetView>)/.exec(xml); if (!m) return xml;
    var at = m[1].replace(/\s*\/$/, '').replace(/\stopLeftCell="[^"]*"/, ''), body = (m[3] || '').replace(/<pane\b[^>]*\/>/g, '').replace(/<selection\b[^>]*\/>/g, '');
    if (fr && (fr.r > 1 || fr.c > 1)) {
      var xs = fr.c - 1, ys = fr.r - 1, tl = Xl.addr(fr.c, fr.r), act = xs && ys ? 'bottomRight' : xs ? 'topRight' : 'bottomLeft';
      body = '<pane' + (xs ? ' xSplit="' + xs + '"' : '') + (ys ? ' ySplit="' + ys + '"' : '') + ' topLeftCell="' + tl + '" activePane="' + act + '" state="frozen"/>' +
        (xs && ys ? '<selection pane="topRight"/><selection pane="bottomLeft"/><selection pane="bottomRight" activeCell="' + tl + '" sqref="' + tl + '"/>' : '<selection pane="' + act + '" activeCell="' + tl + '" sqref="' + tl + '"/>') + body;
    }
    return xml.slice(0, m.index) + '<sheetView' + at + (body ? '>' + body + '</sheetView>' : '/>') + xml.slice(m.index + m[0].length);
  }
  function setStyleAttr(cellXml, s) {
    return cellXml.replace(/^<c\b([^>]*?)(\/?)>/, function (_, at, sl) { return '<c' + at.replace(/\ss="\d+"/, '') + (s ? ' s="' + s + '"' : '') + sl + '>'; });
  }

  /* ---------- real tables ---------- */
  async function addTable(zip, cur, sheetName, spec, xmlHolder) {
    // spec: { ref:'A1:D10', name, style, headers: true, stripes: true, cols: [names] }
    var sh = cur.byName[sheetName], relPath = sh.path.replace(/([^\/]+)$/, '_rels/$1.rels'), rels = (await Xl.readText(zip, relPath)) || '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    var maxR = 0; rels.replace(/\bId="rId(\d+)"/g, function (_, n) { maxR = Math.max(maxR, +n); return _; });
    var rid = 'rId' + (maxR + 1), maxId = 0, k = 1;
    cur.sheets.forEach(function (s) { (s.tables || []).forEach(function (t) { maxId = Math.max(maxId, t.id || 0); }); });
    Object.keys(zip.files).forEach(function (f) { var mm = /^xl\/tables\/table(\d+)\.xml$/.exec(f); if (mm) k = Math.max(k, +mm[1] + 1); });
    var tid = maxId + 1, path = 'xl/tables/table' + k + '.xml';
    var cols = spec.cols.map(function (n, i) { return '<tableColumn id="' + (i + 1) + '" name="' + esc(n) + '"/>'; }).join('');
    var tx = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="' + tid + '" name="' + esc(spec.name) + '" displayName="' + esc(spec.name) + '" ref="' + spec.ref + '"' + (spec.headers === false ? ' headerRowCount="0"' : '') + ' totalsRowShown="0">' +
      (spec.headers === false ? '' : '<autoFilter ref="' + spec.ref + '"/>') + '<tableColumns count="' + spec.cols.length + '">' + cols + '</tableColumns><tableStyleInfo name="' + esc(spec.style) + '" showFirstColumn="0" showLastColumn="0" showRowStripes="' + (spec.stripes === false ? 0 : 1) + '" showColumnStripes="0"/></table>';
    zip.file(path, tx);
    zip.file(relPath, rels.replace('</Relationships>', '<Relationship Id="' + rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table' + k + '.xml"/></Relationships>'));
    var ct = await Xl.readText(zip, '[Content_Types].xml');
    zip.file('[Content_Types].xml', ct.replace('</Types>', '<Override PartName="/' + path + '" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/></Types>'));
    var x = xmlHolder.xml;
    if (!/<worksheet\b[^>]*xmlns:r=/.test(x)) x = x.replace(/<worksheet\b/, '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"');
    var part = '<tablePart r:id="' + rid + '"/>';
    if (/<tableParts\b/.test(x)) x = x.replace(/<tableParts\b[^>]*?count="(\d+)"[^>]*>/, function (m0, n) { return m0.replace('count="' + n + '"', 'count="' + (+n + 1) + '"'); }).replace('</tableParts>', part + '</tableParts>');
    else { var tp = '<tableParts count="1">' + part + '</tableParts>', e = /<extLst\b/.exec(x); x = e ? x.slice(0, e.index) + tp + x.slice(e.index) : x.replace('</worksheet>', tp + '</worksheet>'); }
    xmlHolder.xml = x;
  }

  return { StyleBook: StyleBook, setMerges: setMerges, setCol: setCol, editRows: editRows, setFreeze: setFreeze, setStyleAttr: setStyleAttr, addTable: addTable, parseFont: parseFont, fontXml: fontXml };
});

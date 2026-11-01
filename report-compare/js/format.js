/* Report Compare — cell formatting model.
 * A style object describes what a cell looks like:
 *   { name, sz, b, i, u, color, fill, h, v, wrap, indent, nf, bd: { l, r, t, b } }     (bd side = { s: 'thin', c: '#000000' } or null)
 * A DELTA is a partial style object: the properties the reviewer changed (bd side null = remove that border).
 * The page shows  base style of the cell (from the workbook) + delta;  the writer turns the delta into real styles in the .xlsx.
 * Pure logic, no DOM: runs in the browser (script tag) and in Node (tests).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./xl.js'));
  else root.Fmt = factory(root.Xl);
})(typeof self !== 'undefined' ? self : this, function (Xl) {
  'use strict';

  var SIDES = ['l', 'r', 't', 'b'], SIDE_NAME = { l: 'left', r: 'right', t: 'top', b: 'bottom' };
  var BORDER_CSS = { thin: '1px solid', hair: '1px dotted', medium: '2px solid', thick: '3px solid', dashed: '1px dashed', dotted: '1px dotted', double: '3px double', mediumDashed: '2px dashed' };

  function fromXf(styles, i) {
    var x = styles.xfs[i] || styles.xfs[0] || {}, f = x.font || {}, bd = {};
    SIDES.forEach(function (k) { var s = x.border && x.border[SIDE_NAME[k]]; bd[k] = s ? { s: s.style, c: s.color } : null; });
    return { name: f.name || 'Calibri', sz: f.sz || 11, b: !!f.b, i: !!f.i, u: !!f.u, color: f.color || null, fill: x.fill || null, h: !x.h || x.h === 'general' ? '' : x.h, v: x.v || '', wrap: !!x.wrap, indent: x.indent || 0, nf: Xl.fmtCode(styles, x), bd: bd };
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  /* style object + delta -> style object */
  function apply(base, delta) {
    var o = clone(base);
    if (!delta) return o;
    Object.keys(delta).forEach(function (k) {
      if (k === 'bd') { SIDES.forEach(function (s) { if (delta.bd && Object.prototype.hasOwnProperty.call(delta.bd, s)) o.bd[s] = delta.bd[s] ? { s: delta.bd[s].s, c: delta.bd[s].c } : null; }); }
      else o[k] = delta[k];
    });
    return o;
  }
  /* delta + patch -> delta (the patch wins, border sides are merged) */
  function mergeDelta(old, patch) {
    var o = old ? clone(old) : {};
    Object.keys(patch).forEach(function (k) {
      if (k === 'bd') { o.bd = o.bd || {}; SIDES.forEach(function (s) { if (Object.prototype.hasOwnProperty.call(patch.bd, s)) o.bd[s] = patch.bd[s] ? { s: patch.bd[s].s, c: patch.bd[s].c } : null; }); }
      else o[k] = patch[k];
    });
    return o;
  }
  function isEmptyDelta(d) { return !d || Object.keys(d).every(function (k) { return k === 'bd' ? !d.bd || !Object.keys(d.bd).length : false; }); }

  function cssOf(o) {
    var css = [];
    if (o.fill) css.push('background-color:' + o.fill);
    if (o.color) css.push('color:' + o.color);
    if (o.b) css.push('font-weight:700');
    if (o.i) css.push('font-style:italic');
    if (o.u) css.push('text-decoration:underline');
    css.push('font-size:' + (Math.min(40, o.sz || 11) * 4 / 3).toFixed(2) + 'px');
    if (o.name && !/^calibri$/i.test(o.name)) css.push('font-family:"' + String(o.name).replace(/"/g, '') + '",Calibri,Carlito,Arial,sans-serif');
    if (o.h) css.push('text-align:' + (o.h === 'centerContinuous' ? 'center' : o.h));
    if (o.v) css.push('vertical-align:' + (o.v === 'center' ? 'middle' : o.v));
    if (o.indent) css.push('padding-left:' + (2 + o.indent * 9) + 'px');
    SIDES.forEach(function (k) { var s = o.bd && o.bd[k]; if (s) css.push('border-' + SIDE_NAME[k] + ':' + (BORDER_CSS[s.s] || '1px solid') + ' ' + (s.c || '#000')); });
    return css.join(';');
  }

  /* ---------- number formats ---------- */
  var NF = {
    General: 'General', Number: '0.00', Currency: '"SAR" #,##0.00', Accounting: '_("SAR"* #,##0.00_);_("SAR"* (#,##0.00);_("SAR"* "-"??_);_(@_)', Percentage: '0.00%', 'Short Date': 'dd/mm/yyyy',
    'Long Date': 'dddd, mmmm d, yyyy', Time: 'h:mm:ss', Fraction: '# ?/?', Scientific: '0.00E+00', Text: '@', Comma: '#,##0.00', Integer: '0'
  };
  var NF_LIST = ['General', 'Number', 'Currency', 'Accounting', 'Short Date', 'Long Date', 'Time', 'Percentage', 'Fraction', 'Scientific', 'Text'];
  function nfName(code) { for (var k in NF) if (NF[k] === code) return k; return null; }
  /* one more / one less decimal place (first section only) */
  function bumpDecimals(code, d) {
    if (!code || /^General$/i.test(code)) return d > 0 ? '0.0' : 'General';
    var plain = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/E[+-]/gi, '');
    if (/[ymdhs]/i.test(plain) || /@/.test(plain)) return code;       // dates, times and text formats have no decimals
    return code.split(';').map(function (s) {
      var m = /0(?:\.(0+))?(?=[^0#?.,]*$)/.exec(s);
      if (!m) return s;
      var cur = m[1] ? m[1].length : 0, next = Math.max(0, cur + d);
      return s.slice(0, m.index) + '0' + (next ? '.' + new Array(next + 1).join('0') : '') + s.slice(m.index + m[0].length);
    }).join(';');
  }

  /* ---------- colours ---------- */
  function rgb(hex) { return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]; }
  function hexOf(c) { return '#' + c.map(function (v) { var n = Math.max(0, Math.min(255, Math.round(v))).toString(16); return n.length < 2 ? '0' + n : n; }).join('').toUpperCase(); }
  function tint(hex, t) { var c = rgb(hex); return hexOf(c.map(function (v) { return t >= 0 ? v + (255 - v) * t : v * (1 + t); })); }
  var BASE_COLORS = ['#FFFFFF', '#000000', '#E7E6E6', '#44546A', '#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47'];
  var STD_COLORS = ['#C00000', '#FF0000', '#FFC000', '#FFFF00', '#92D050', '#00B050', '#00B0F0', '#0070C0', '#002060', '#7030A0'];
  var SHADES = [0.8, 0.6, 0.4, -0.25, -0.5];
  var WHITE_SHADES = ['#F2F2F2', '#D9D9D9', '#BFBFBF', '#A6A6A6', '#7F7F7F'], BLACK_SHADES = ['#7F7F7F', '#595959', '#404040', '#262626', '#0D0D0D'];
  function paletteRows() {   // theme-colour grid like Excel's: the base row + 5 lighter / darker rows
    var rows = [BASE_COLORS.slice()];
    SHADES.forEach(function (t, r) { rows.push(BASE_COLORS.map(function (c, i) { return i === 0 ? WHITE_SHADES[r] : i === 1 ? BLACK_SHADES[r] : tint(c, t); })); });
    return rows;
  }

  /* ---------- table styles (the colours Excel's built-in styles use with the Office theme) ---------- */
  var TABLE_STYLES = [
    { id: 'TableStyleMedium2', name: 'Blue', head: '#4472C4', band: '#D9E1F2', text: '#FFFFFF' },
    { id: 'TableStyleMedium3', name: 'Orange', head: '#ED7D31', band: '#FBE5D6', text: '#FFFFFF' },
    { id: 'TableStyleMedium4', name: 'Gray', head: '#A5A5A5', band: '#EDEDED', text: '#FFFFFF' },
    { id: 'TableStyleMedium5', name: 'Gold', head: '#FFC000', band: '#FFF2CC', text: '#FFFFFF' },
    { id: 'TableStyleMedium6', name: 'Light blue', head: '#5B9BD5', band: '#DDEBF7', text: '#FFFFFF' },
    { id: 'TableStyleMedium7', name: 'Green', head: '#70AD47', band: '#E2EFDA', text: '#FFFFFF' },
    { id: 'TableStyleLight9', name: 'Light · blue header', head: '#4472C4', band: null, text: '#FFFFFF' },
    { id: 'TableStyleLight1', name: 'Light · gray stripes', head: null, band: '#D9D9D9', text: '#000000' }
  ];
  function tableStyleById(id) { for (var i = 0; i < TABLE_STYLES.length; i++) if (TABLE_STYLES[i].id === id) return TABLE_STYLES[i]; return null; }
  function tableStyle(id) { for (var i = 0; i < TABLE_STYLES.length; i++) if (TABLE_STYLES[i].id === id) return TABLE_STYLES[i]; return TABLE_STYLES[0]; }
  /* the look a table gives to cell (rowIndex 0 = header row, 1.. = body rows): a delta that sits UNDER the cell's own formatting */
  function tableLook(ts, rowIdx, hasHeader) {
    var out = {};
    if (hasHeader && rowIdx === 0) { if (ts.head) { out.fill = ts.head; out.color = ts.text; } out.b = true; return out; }
    var body = hasHeader ? rowIdx - 1 : rowIdx;
    if (ts.band && body % 2 === 0) out.fill = ts.band;
    return out;
  }

  /* ---------- cell styles gallery (Home > Cell Styles) ---------- */
  var CELL_STYLES = [
    { name: 'Good', ar: 'جيد', d: { fill: '#C6EFCE', color: '#006100' } },
    { name: 'Bad', ar: 'سيئ', d: { fill: '#FFC7CE', color: '#9C0006' } },
    { name: 'Neutral', ar: 'محايد', d: { fill: '#FFEB9C', color: '#9C5700' } },
    { name: 'Input', ar: 'إدخال', d: { fill: '#FFCC99', color: '#3F3F76', bd: { l: { s: 'thin', c: '#7F7F7F' }, r: { s: 'thin', c: '#7F7F7F' }, t: { s: 'thin', c: '#7F7F7F' }, b: { s: 'thin', c: '#7F7F7F' } } } },
    { name: 'Note', ar: 'ملاحظة', d: { fill: '#FFFFCC', color: '#000000', bd: { l: { s: 'thin', c: '#B2B2B2' }, r: { s: 'thin', c: '#B2B2B2' }, t: { s: 'thin', c: '#B2B2B2' }, b: { s: 'thin', c: '#B2B2B2' } } } },
    { name: 'Title', ar: 'عنوان', d: { b: true, sz: 18, color: '#44546A' } },
    { name: 'Heading 1', ar: 'عنوان 1', d: { b: true, sz: 15, color: '#44546A', bd: { b: { s: 'thick', c: '#4472C4' } } } },
    { name: 'Heading 2', ar: 'عنوان 2', d: { b: true, sz: 13, color: '#44546A', bd: { b: { s: 'thick', c: '#A9BDE3' } } } },
    { name: 'Total', ar: 'إجمالي', d: { b: true, bd: { t: { s: 'thin', c: '#4472C4' }, b: { s: 'double', c: '#4472C4' } } } },
    { name: 'Accent1', ar: 'تمييز', d: { fill: '#4472C4', color: '#FFFFFF' } },
    { name: 'Accent2', ar: 'تمييز 2', d: { fill: '#ED7D31', color: '#FFFFFF' } },
    { name: 'Accent6', ar: 'تمييز 6', d: { fill: '#70AD47', color: '#FFFFFF' } }
  ];

  var FONTS = ['Calibri', 'Arial', 'Times New Roman', 'Courier New', 'Tahoma', 'Verdana', 'Segoe UI', 'Cambria', 'Georgia', 'Trebuchet MS', 'Comic Sans MS'];
  var SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];

  return {
    SIDES: SIDES, SIDE_NAME: SIDE_NAME, fromXf: fromXf, apply: apply, mergeDelta: mergeDelta, isEmptyDelta: isEmptyDelta, cssOf: cssOf, clone: clone,
    NF: NF, NF_LIST: NF_LIST, nfName: nfName, bumpDecimals: bumpDecimals, tint: tint, BASE_COLORS: BASE_COLORS, STD_COLORS: STD_COLORS, paletteRows: paletteRows,
    TABLE_STYLES: TABLE_STYLES, tableStyle: tableStyle, tableStyleById: tableStyleById, tableLook: tableLook, CELL_STYLES: CELL_STYLES, FONTS: FONTS, SIZES: SIZES
  };
});

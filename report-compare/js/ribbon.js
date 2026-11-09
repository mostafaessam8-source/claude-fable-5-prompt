/* Report Compare — the ribbon: File · Home · Insert · Page Layout · Formulas · Data · Review · View.
 * Commands that this tool can really do (and write into the downloaded .xlsx) are live; the rest are shown greyed with the reason. */
(function () {
  'use strict';
  var RC = window.RC, E = window.Edit, S = RC.S, Fmt = window.Fmt, Xl = window.Xl, $ = RC.$, h = RC.h;
  var R = window.Ribbon = {};
  var NEEDS_XL = 'Needs Excel — this tool edits cell values, formatting, merges, widths, freeze panes and tables; this feature changes other parts of the workbook. (محتاج إكسيل)';
  var state = { tab: 'home', collapsed: false, lastFill: '#FFFF00', lastColor: '#FF0000', painter: null };
  var nodes = {};   // elements updated by update()

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function guard(fn) { return function (ev) { try { fn(ev); } catch (e) { console.error(e); RC.toast('Something went wrong: ' + (e && e.message ? e.message : e)); } }; }
  function blurSoon(b) { b.addEventListener('mousedown', function (e) { e.preventDefault(); }); }   // keep the grid selection / focus

  /* ---------- building blocks ---------- */
  function btn(o) {
    var b = el('button', 'rb' + (o.big ? ' big' : '') + (o.cls ? ' ' + o.cls : ''));
    b.type = 'button'; b.title = (o.title || o.label || '') + (o.disabled ? '\n' + NEEDS_XL : '');
    b.innerHTML = '<span class="ri"' + (o.iconStyle ? ' style="' + o.iconStyle + '"' : '') + '>' + (o.icon || '') + '</span>' + (o.label ? '<span class="rl">' + h(o.label) + (o.menu ? ' ▾' : '') + '</span>' : (o.menu ? '<span class="rl">▾</span>' : ''));
    if (o.id) b.id = o.id;
    if (o.disabled) { b.disabled = true; b.classList.add('off'); } else if (o.fn) b.addEventListener('click', guard(function (ev) { o.fn(ev, b); }));
    blurSoon(b);
    if (o.key) nodes[o.key] = b;
    return b;
  }
  function menuBtn(o) {   // opens a menu below the button
    o.fn = function (ev, b) { var r = b.getBoundingClientRect(); RC.showMenu(o.items(), r.left, r.bottom + 2); };
    o.menu = true; return btn(o);
  }
  function select(o) {
    var s = el('select', 'rs'); s.title = o.title || ''; if (o.width) s.style.width = o.width + 'px';
    o.options.forEach(function (x) { var op = document.createElement('option'); op.value = x.v; op.textContent = x.t; s.appendChild(op); });
    s.addEventListener('change', guard(function () { o.onChange(s.value); s.blur(); }));
    if (o.key) nodes[o.key] = s; return s;
  }
  function group(label, ar, rows) {
    var g = el('div', 'rg'), body = el('div', 'rgb');
    rows.forEach(function (r) { if (r instanceof Element) body.appendChild(r); else { var row = el('div', 'rr'); r.forEach(function (x) { row.appendChild(x); }); body.appendChild(row); } });
    g.appendChild(body); g.appendChild(el('div', 'rgl', h(label) + (ar ? ' <span class="ar">' + h(ar) + '</span>' : ''))); return g;
  }
  function col(items) { var c = el('div', 'rcol'); items.forEach(function (x) { c.appendChild(x); }); return c; }
  function sep() { return el('span', 'rsep'); }
  function disabled(label, icon, ar, big) { return btn({ label: label, icon: icon || '▫', disabled: true, big: big !== false, title: label + (ar ? ' · ' + ar : '') }); }
  function check(label, ar, getter, setter, key) {
    var l = el('label', 'rchk'), i = document.createElement('input'); i.type = 'checkbox'; i.checked = !!getter();
    l.appendChild(i); l.appendChild(document.createTextNode(' ' + label)); if (ar) l.appendChild(el('small', 'ar', ' ' + ar));
    i.addEventListener('change', guard(function () { setter(i.checked); })); l.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    if (key) nodes[key] = i; return l;
  }

  /* ---------- colour palettes ---------- */
  function palette(onPick, allowNone, noneLabel) {
    var d = el('div', 'pal');
    function row(colors, cls) { var r = el('div', 'prow ' + (cls || '')); colors.forEach(function (c) { var b = el('button', 'sw'); b.type = 'button'; b.style.background = c; b.title = c; b.addEventListener('click', function () { RC.closeMenu(); onPick(c); }); blurSoon(b); r.appendChild(b); }); return r; }
    d.appendChild(el('div', 'pt', 'Theme Colors · ألوان الثيم'));
    var rows = Fmt.paletteRows(); d.appendChild(row(rows[0])); rows.slice(1).forEach(function (r) { d.appendChild(row(r, 'sh')); });
    d.appendChild(el('div', 'pt', 'Standard Colors · ألوان قياسية')); d.appendChild(row(Fmt.STD_COLORS));
    if (allowNone) { var n = el('button', 'pn', '⊘ ' + (noneLabel || 'No Fill · بدون لون')); n.type = 'button'; n.addEventListener('click', function () { RC.closeMenu(); onPick(null); }); blurSoon(n); d.appendChild(n); }
    var more = el('button', 'pn', '🎨 More Colors… · ألوان أخرى'); more.type = 'button'; var inp = document.createElement('input'); inp.type = 'color'; inp.style.cssText = 'position:absolute;opacity:0;width:0;height:0'; more.appendChild(inp);
    more.addEventListener('click', function () { inp.click(); }); inp.addEventListener('input', function () { /* live */ }); inp.addEventListener('change', function () { RC.closeMenu(); onPick(inp.value.toUpperCase()); });
    blurSoon(more); d.appendChild(more);
    return d;
  }
  function colorBtn(o) {   // [A▾] with a colour bar: click = apply the last colour, ▾ = palette
    var wrap = el('span', 'cbtn'), main = btn({ label: '', icon: o.icon, title: o.title, iconStyle: o.iconStyle, fn: function () { o.apply(state[o.slot]); } });
    var bar = el('span', 'cbar'); bar.style.background = state[o.slot]; main.appendChild(bar);
    var dd = btn({ label: '', icon: '', menu: true, title: o.title + ' ▾', cls: 'dd', fn: function (ev, b) { var r = main.getBoundingClientRect(); RC.showMenu([{ t: 'node', el: palette(function (c) { if (c) { state[o.slot] = c; bar.style.background = c; } o.apply(c); }, o.none, o.noneLabel) }], r.left, r.bottom + 2); } });
    wrap.appendChild(main); wrap.appendChild(dd); return wrap;
  }

  /* ---------- menus ---------- */
  function mi(label, ar, fn, extra) { return Object.assign({ label: label, ar: ar, fn: fn }, extra || {}); }
  function pasteMenu() { return [mi('Paste', 'لصق', function () { E.paste('all'); }), mi('Values', 'قيم فقط', function () { E.paste('values'); }), mi('Formulas', 'معادلات', function () { E.paste('formulas'); }), mi('Formatting', 'تنسيق فقط', function () { E.paste('formats'); }), { t: 'sep' }, mi('Transpose', 'تبديل', null, { disabled: true, title: NEEDS_XL })]; }
  function bordersMenu() {
    var items = [['Bottom Border', 'حد سفلي', 'bottom'], ['Top Border', 'حد علوي', 'top'], ['Left Border', 'حد أيسر', 'left'], ['Right Border', 'حد أيمن', 'right'], null, ['No Border', 'بدون حدود', 'none'], ['All Borders', 'كل الحدود', 'all'], ['Outside Borders', 'حدود خارجية', 'outside'], ['Thick Outside Borders', 'حدود خارجية سميكة', 'thickOutside'], null, ['Bottom Double Border', 'حد سفلي مزدوج', 'doubleBottom'], ['Thick Bottom Border', 'حد سفلي سميك', 'thickBottom'], ['Top and Double Bottom Border', 'علوي وسفلي مزدوج', 'topBottom']];
    return items.map(function (x) { return x ? mi(x[0], x[1], function () { E.borders(x[2]); }) : { t: 'sep' }; });
  }
  function mergeMenu() { return [mi('Merge & Center', 'دمج وتوسيط', function () { E.merge('center'); }), mi('Merge Across', 'دمج عبر', function () { E.merge('across'); }), mi('Merge Cells', 'دمج الخلايا', function () { E.merge('cells'); }), mi('Unmerge Cells', 'إلغاء الدمج', function () { E.merge('unmerge'); })]; }
  function sumMenu() { return [['Sum', 'SUM'], ['Average', 'AVERAGE'], ['Count Numbers', 'COUNT'], ['Max', 'MAX'], ['Min', 'MIN']].map(function (x) { return mi(x[0], '', function () { E.autosum(x[1]); }); }); }
  function clearMenu() { return [mi('Clear All', 'مسح الكل', function () { E.clear('all'); }), mi('Clear Formats', 'مسح التنسيق', function () { E.clear('formats'); }), mi('Clear Contents', 'مسح المحتوى', function () { E.clear('contents'); })]; }
  function sortMenu() { return [mi('Sort A to Z', 'ترتيب تصاعدي', function () { E.sort(true); }), mi('Sort Z to A', 'ترتيب تنازلي', function () { E.sort(false); }), { t: 'sep' }, mi('Filter', 'تصفية', null, { disabled: true, title: NEEDS_XL })]; }
  function fillMenu() { return [mi('Down  Ctrl+D', 'لتحت', function () { E.fillSel('down'); }), mi('Right  Ctrl+R', 'لليمين', function () { E.fillSel('right'); }), mi('Up', 'لفوق', function () { E.fillSel('up'); }), mi('Left', 'لليسار', function () { E.fillSel('left'); }), { t: 'sep' }, mi('Series…', 'سلسلة', null, { disabled: true, title: 'Drag the fill handle for series: 1,2 → 3,4 · PW-104 → PW-105' })]; }
  function findMenu() { return [mi('Find…  Ctrl+F', 'بحث', function () { E.findDialog(false); }), mi('Replace…  Ctrl+H', 'استبدال', function () { E.findDialog(true); }), mi('Go To…', 'اذهب إلى', function () { var nb = $('nameBox'); nb.focus(); nb.select(); })]; }
  function formatMenu() {
    return [{ t: 'head', label: 'Cell Size · حجم الخلية' }, mi('Row Height…', 'ارتفاع الصف', E.promptRowHeight), mi('AutoFit Row Height', 'ملاءمة الارتفاع', E.autofitRows), mi('Column Width…', 'عرض العمود', E.promptColWidth), mi('AutoFit Column Width', 'ملاءمة العرض', E.autofitCols),
      { t: 'sep' }, { t: 'head', label: 'Visibility · الإظهار' }, mi('Hide Rows', 'إخفاء الصفوف', function () { E.hide('rows', true); }), mi('Hide Columns', 'إخفاء الأعمدة', function () { E.hide('cols', true); }), mi('Unhide All Rows & Columns', 'إظهار الكل', E.unhideAll),
      { t: 'sep' }, mi('Rename Sheet', 'إعادة تسمية', null, { disabled: true, title: NEEDS_XL }), mi('Protect Sheet', 'حماية الشيت', null, { disabled: true, title: NEEDS_XL })];
  }
  function freezeMenu() { return [mi('Freeze Panes', 'تثبيت الأجزاء', function () { E.freeze('panes'); }), mi('Freeze Top Row', 'تثبيت الصف الأول', function () { E.freeze('top'); }), mi('Freeze First Column', 'تثبيت العمود الأول', function () { E.freeze('first'); }), mi('Unfreeze Panes', 'إلغاء التثبيت', function () { E.freeze('off'); })]; }
  function tableGallery() {
    var d = el('div', 'gal'); d.appendChild(el('div', 'pt', 'Format as Table · تنسيق كجدول'));
    var g = el('div', 'gg');
    Fmt.TABLE_STYLES.forEach(function (t) {
      var b = el('button', 'gi'); b.type = 'button'; b.title = t.name + ' (' + t.id.replace('TableStyle', '') + ')';
      b.innerHTML = '<span class="gh" style="background:' + (t.head || '#fff') + ';border-bottom:' + (t.head ? '0' : '2px solid #000') + '"></span><span class="gb" style="background:' + (t.band || '#fff') + '"></span><span class="gb"></span><span class="gb" style="background:' + (t.band || '#fff') + '"></span>';
      b.addEventListener('click', function () { RC.closeMenu(); var p = S.sel ? Xl.parseAddr(S.sel.a) : null, inTable = p && S.lay.tables.some(function (x) { if (x.sheet !== S.sheet) return false; var q = RC.refRect(x.ref); return p.r >= q.r1 && p.r <= q.r2 && p.c >= q.c1 && p.c <= q.c2; }); if (inTable) E.tableStyle(t.id); else E.tableDialog(t.id); });
      blurSoon(b); g.appendChild(b);
    });
    d.appendChild(g); var rm = el('button', 'pn', '✖ Remove table (created here) · إزالة الجدول'); rm.type = 'button'; rm.addEventListener('click', function () { RC.closeMenu(); E.removeTable(); }); d.appendChild(rm); return d;
  }
  function cellStyleGallery() {
    var d = el('div', 'gal'); d.appendChild(el('div', 'pt', 'Cell Styles · أنماط الخلايا')); var g = el('div', 'gs');
    Fmt.CELL_STYLES.forEach(function (c) {
      var b = el('button', 'gc'); b.type = 'button'; b.textContent = c.name; var o = c.d; if (o.fill) b.style.background = o.fill; if (o.color) b.style.color = o.color; if (o.b) b.style.fontWeight = '700'; if (o.sz) b.style.fontSize = Math.min(o.sz, 16) + 'px';
      b.title = c.name + ' · ' + c.ar; b.addEventListener('click', function () { RC.closeMenu(); E.cellStyle(c.name); }); blurSoon(b); g.appendChild(b);
    });
    d.appendChild(g); return d;
  }
  var FN_GROUPS = [['Math & Trig · رياضيات', ['SUM', 'AVERAGE', 'MIN', 'MAX', 'ROUND', 'ROUNDUP', 'ROUNDDOWN', 'ABS', 'INT', 'MOD', 'POWER', 'SQRT', 'SUMIF', 'SUMPRODUCT']], ['Statistical · إحصاء', ['COUNT', 'COUNTA', 'COUNTIF']], ['Logical · منطقية', ['IF', 'IFERROR', 'IFNA', 'AND', 'OR', 'NOT', 'ISNUMBER', 'ISTEXT', 'ISBLANK', 'ISERROR']], ['Text · نصوص', ['CONCAT', 'CONCATENATE', 'LEFT', 'RIGHT', 'MID', 'LEN', 'UPPER', 'LOWER', 'TRIM', 'TEXT']], ['Date & Time · تاريخ', ['TODAY', 'NOW', 'DATE', 'YEAR', 'MONTH', 'DAY', 'WEEKDAY']], ['Lookup & Reference · بحث', ['VLOOKUP', 'XLOOKUP', 'INDEX', 'MATCH']]];
  function insertFn(name) {
    var fi = $('fbIn'); if (!S.sel || S.sheet === '__overview') { RC.toast('Select a cell first. (حدد خلية الأول)'); return; }
    fi.disabled = false; fi.focus(); var v = fi.value; if (!/^\s*=/.test(v)) v = '=';
    var p = fi.selectionStart != null && /^\s*=/.test(fi.value) ? fi.selectionStart : v.length;
    fi.value = v.slice(0, p) + name + '(' + v.slice(p); var pos = p + name.length + 1; fi.setSelectionRange(pos, pos); fi.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function fnMenu(only) {
    var items = [];
    FN_GROUPS.forEach(function (g) { if (only && g[0].indexOf(only) !== 0) return; items.push({ t: 'head', label: g[0] }); g[1].forEach(function (n) { items.push(mi(n, '', function () { insertFn(n); })); }); });
    return items;
  }
  function zoomMenu() { return [200, 150, 125, 100, 75, 50, 25].map(function (z) { return mi(z + '%', '', function () { RC.setZoom(z); }); }).concat([{ t: 'sep' }, mi('Zoom to Selection', 'تكبير للتحديد', function () {
    var rects = RC.selRects(); if (!rects.length && S.sel) rects = [RC.cellRect(S.sel.a)]; if (!rects.length) return;
    var g = rects[0], a = RC.tdOf(Xl.addr(g.c1, g.r1)), b = RC.tdOf(Xl.addr(g.c2, g.r2)); if (!a || !b) return;
    var wrap = $('gridWrap'), ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(), w = rb.right - ra.left, hh = rb.bottom - ra.top;
    RC.setZoom(Math.round(S.zoom * Math.min((wrap.clientWidth - 60) / w, (wrap.clientHeight - 40) / hh) / 5) * 5);
    setTimeout(function () { var t = RC.tdOf(Xl.addr(g.c1, g.r1)); if (t) { var q = t.getBoundingClientRect(), wr = wrap.getBoundingClientRect(); wrap.scrollLeft += q.left - wr.left - 52; wrap.scrollTop += q.top - wr.top - 26; } }, 50);
  })]); }

  /* ---------- the tabs ---------- */
  function homeTab() {
    var t = el('div', 'rtab');
    // Clipboard
    var paste = btn({ big: true, label: 'Paste', icon: '📋', title: 'Paste · لصق (Ctrl+V)', fn: function () { E.paste('all'); } });
    var pasteDd = btn({ label: '', menu: true, cls: 'dd', title: 'Paste options', fn: function (ev, b) { var r = b.getBoundingClientRect(); RC.showMenu(pasteMenu(), r.left, r.bottom + 2); } });
    var pw = el('span', 'pbig'); pw.appendChild(paste); pw.appendChild(pasteDd);
    t.appendChild(group('Clipboard', 'الحافظة', [col([pw]), col([btn({ label: 'Cut', icon: '✂', fn: E.cut, title: 'Cut · قص (Ctrl+X)' }), btn({ label: 'Copy', icon: '⧉', fn: function () { E.copy(false); }, title: 'Copy · نسخ (Ctrl+C)' }), btn({ label: 'Painter', icon: '🖌', title: 'Format Painter · نسخ التنسيق: انسخ تنسيق الخلية النشطة ثم حدد الخلايا المراد تنسيقها', key: 'painter', fn: function () { startPainter(); } })])]));
    // Font
    var fontSel = select({ key: 'font', width: 118, title: 'Font · الخط', options: Fmt.FONTS.map(function (f) { return { v: f, t: f }; }), onChange: E.fontName });
    var sizeSel = select({ key: 'size', width: 52, title: 'Font Size · حجم الخط', options: Fmt.SIZES.map(function (n) { return { v: String(n), t: String(n) }; }), onChange: E.fontSize });
    var bold = btn({ label: '', icon: 'B', iconStyle: 'font-weight:900', title: 'Bold · عريض (Ctrl+B)', key: 'b', fn: function () { E.toggle('b'); } }), ital = btn({ label: '', icon: 'I', iconStyle: 'font-style:italic;font-family:serif', title: 'Italic · مائل (Ctrl+I)', key: 'i', fn: function () { E.toggle('i'); } }), und = btn({ label: '', icon: 'U', iconStyle: 'text-decoration:underline', title: 'Underline · تحته خط (Ctrl+U)', key: 'u', fn: function () { E.toggle('u'); } });
    var borders = menuBtn({ label: '', icon: '▦', title: 'Borders · الحدود', items: bordersMenu });
    t.appendChild(group('Font', 'الخط', [[fontSel, sizeSel, btn({ label: '', icon: 'A▲', title: 'Increase Font Size · تكبير الخط', fn: function () { E.fontGrow(1); } }), btn({ label: '', icon: 'A▼', title: 'Decrease Font Size · تصغير الخط', fn: function () { E.fontGrow(-1); } })], [bold, ital, und, sep(), borders, sep(),
      colorBtn({ slot: 'lastFill', icon: '🪣', title: 'Fill Color · لون التعبئة', none: true, noneLabel: 'No Fill · بدون تعبئة', apply: E.fill }), colorBtn({ slot: 'lastColor', icon: 'A', iconStyle: 'font-weight:700;text-decoration:underline', title: 'Font Color · لون الخط', none: true, noneLabel: 'Automatic · تلقائي', apply: E.fontColor })]]));
    // Alignment
    t.appendChild(group('Alignment', 'المحاذاة', [[btn({ label: '', icon: '⬆', title: 'Top Align · محاذاة للأعلى', key: 'vt', fn: function () { E.valign('top'); } }), btn({ label: '', icon: '↕', title: 'Middle Align · توسيط رأسي', key: 'vc', fn: function () { E.valign('center'); } }), btn({ label: '', icon: '⬇', title: 'Bottom Align · محاذاة للأسفل', key: 'vb', fn: function () { E.valign('bottom'); } }), sep(), btn({ label: '', icon: '↵', title: 'Wrap Text · التفاف النص', key: 'wrap', fn: E.wrap })],
      [btn({ label: '', icon: '⯇', title: 'Align Left · يسار', key: 'hl', fn: function () { E.align('left'); } }), btn({ label: '', icon: '≡', title: 'Center · توسيط', key: 'hc', fn: function () { E.align('center'); } }), btn({ label: '', icon: '⯈', title: 'Align Right · يمين', key: 'hr', fn: function () { E.align('right'); } }), sep(), btn({ label: '', icon: '⇤', title: 'Decrease Indent · تقليل المسافة', fn: function () { E.indent(-1); } }), btn({ label: '', icon: '⇥', title: 'Increase Indent · زيادة المسافة', fn: function () { E.indent(1); } }), sep(), menuBtn({ label: '', icon: '⊞', title: 'Merge & Center · دمج وتوسيط', items: mergeMenu })]]));
    // Number
    t.appendChild(group('Number', 'الأرقام', [[select({ key: 'nf', width: 128, title: 'Number Format · تنسيق الرقم', options: Fmt.NF_LIST.map(function (n) { return { v: n, t: n }; }).concat([{ v: '__custom', t: 'Custom' }]), onChange: function (v) { if (v !== '__custom') E.numfmt(Fmt.NF[v]); } })],
      [btn({ label: '', icon: '%', title: 'Percent Style · نسبة مئوية', fn: function () { E.numfmt('0%'); } }), btn({ label: '', icon: ',', title: 'Comma Style · فاصلة الآلاف', fn: function () { E.numfmt('#,##0.00'); } }), btn({ label: '', icon: '.00→', title: 'Increase Decimal · زيادة المنازل', fn: function () { E.decimals(1); } }), btn({ label: '', icon: '←.0', title: 'Decrease Decimal · تقليل المنازل', fn: function () { E.decimals(-1); } })]]));
    // Styles
    t.appendChild(group('Styles', 'الأنماط', [col([btn({ big: true, label: 'Format as Table', icon: '▤', menu: true, title: 'Format as Table · تنسيق كجدول (Ctrl+T)', fn: function (ev, b) { var r = b.getBoundingClientRect(); RC.showMenu([{ t: 'node', el: tableGallery() }], r.left, r.bottom + 2); } })]), col([btn({ big: true, label: 'Cell Styles', icon: '🎨', menu: true, title: 'Cell Styles · أنماط الخلايا', fn: function (ev, b) { var r = b.getBoundingClientRect(); RC.showMenu([{ t: 'node', el: cellStyleGallery() }], r.left, r.bottom + 2); } })])]));
    // Cells
    t.appendChild(group('Cells', 'الخلايا', [col([menuBtn({ big: true, label: 'Format', icon: '▥', title: 'Format · تنسيق (ارتفاع الصف، عرض العمود، إخفاء)', items: formatMenu })]), col([disabled('Insert', '➕', 'إدراج', false), disabled('Delete', '➖', 'حذف', false)])]));
    // Editing
    var autosum = el('span', 'pbig'); autosum.appendChild(btn({ big: true, label: 'AutoSum', icon: 'Σ', title: 'AutoSum · جمع تلقائي', fn: function () { E.autosum('SUM'); } })); autosum.appendChild(btn({ label: '', menu: true, cls: 'dd', title: 'AutoSum options', fn: function (ev, b) { var r = b.getBoundingClientRect(); RC.showMenu(sumMenu(), r.left, r.bottom + 2); } }));
    t.appendChild(group('Editing', 'التحرير', [col([autosum]), col([menuBtn({ label: 'Fill', icon: '⬇', title: 'Fill · تعبئة (اسحب المقبض الأخضر أو Ctrl+D / Ctrl+R)', items: fillMenu }), menuBtn({ label: 'Clear', icon: '⌫', title: 'Clear · مسح', items: clearMenu })]), col([menuBtn({ label: 'Sort & Filter', icon: '⇅', title: 'Sort & Filter · ترتيب وتصفية', items: sortMenu }), menuBtn({ label: 'Find & Select', icon: '🔍', title: 'Find & Select · بحث وتحديد', items: findMenu })])]));
    return t;
  }
  function insertTab() {
    var t = el('div', 'rtab');
    t.appendChild(group('Tables', 'الجداول', [col([btn({ big: true, label: 'Table', icon: '▤', title: 'Table · جدول (Ctrl+T)', fn: function () { E.tableDialog(); } })]), col([disabled('PivotTable', '⊟', 'جدول محوري', false), disabled('Recommended PivotTables', '⊟', '', false)])]));
    t.appendChild(group('Illustrations', 'رسومات', [col([disabled('Pictures', '🖼'), ]), col([disabled('Shapes', '△', '', false), disabled('SmartArt', '◈', '', false), disabled('Icons', '☆', '', false)])]));
    t.appendChild(group('Charts', 'مخططات', [col([disabled('Recommended Charts', '📊')]), col([disabled('Column', '▥', '', false), disabled('Line', '📈', '', false), disabled('Pie', '◔', '', false)])]));
    t.appendChild(group('Sparklines', 'مخططات مصغرة', [col([disabled('Line', '〰', '', false), disabled('Column', '▮', '', false), disabled('Win/Loss', '±', '', false)])]));
    t.appendChild(group('Links', 'روابط', [col([disabled('Link', '🔗')])]));
    t.appendChild(group('Text', 'نص', [col([disabled('Text Box', '🅰', '', false), disabled('Header & Footer', '▭', '', false)])]));
    t.appendChild(group('Symbols', 'رموز', [col([disabled('Equation', 'π', '', false), disabled('Symbol', 'Ω', '', false)])]));
    return t;
  }
  function layoutTab() {
    var t = el('div', 'rtab');
    t.appendChild(group('Themes', 'ثيمات', [col([disabled('Themes', '🎨')]), col([disabled('Colors', '◐', '', false), disabled('Fonts', 'Aa', '', false), disabled('Effects', '✦', '', false)])]));
    t.appendChild(group('Page Setup', 'إعداد الصفحة', [col([disabled('Margins', '▯')]), col([disabled('Orientation', '⟳')]), col([disabled('Size', '▭')]), col([disabled('Print Area', '▦', '', false), disabled('Breaks', '⤓', '', false), disabled('Background', '▨', '', false), disabled('Print Titles', '≣', '', false)])]));
    t.appendChild(group('Scale to Fit', 'ملاءمة', [col([disabled('Width', '↔', '', false), disabled('Height', '↕', '', false), disabled('Scale', '％', '', false)])]));
    t.appendChild(group('Sheet Options', 'خيارات الشيت', [col([el('div', 'rhd', 'Gridlines'), check('View', 'عرض', function () { return !gridOff(); }, function (v) { S.hideGrid = !v; RC.rerenderSheet(); }, 'gridChk'), check('Print', '', function () { return false; }, function () { }, null)]), col([el('div', 'rhd', 'Headings'), check('View', 'عرض', function () { return !S.hideHeads; }, function (v) { S.hideHeads = !v; RC.rerenderSheet(); }, 'headChk'), check('Print', '', function () { return false; }, function () { }, null)])]));
    nodes.layoutPrint = t.querySelectorAll('input'); [].slice.call(t.querySelectorAll('.rchk input')).forEach(function (i, n) { if (n === 1 || n === 3) { i.disabled = true; i.title = NEEDS_XL; } });
    t.appendChild(group('Arrange', 'ترتيب', [col([disabled('Bring Forward', '⬒', '', false), disabled('Send Backward', '⬓', '', false), disabled('Align', '⫶', '', false)])]));
    return t;
  }
  function gridOff() { return S.hideGrid === null ? (S.sheet !== '__overview' && S.cur.wb.byName[S.sheet] ? !S.cur.wb.byName[S.sheet].showGrid : false) : S.hideGrid; }
  function formulasTab() {
    var t = el('div', 'rtab');
    t.appendChild(group('Function Library', 'مكتبة الدوال', [col([menuBtn({ big: true, label: 'Insert Function', icon: 'ƒx', title: 'Insert Function · إدراج دالة', items: function () { return fnMenu(); } })]),
      col([(function () { var w = el('span', 'pbig'); w.appendChild(btn({ big: true, label: 'AutoSum', icon: 'Σ', fn: function () { E.autosum('SUM'); } })); w.appendChild(btn({ label: '', menu: true, cls: 'dd', fn: function (ev, b) { var r = b.getBoundingClientRect(); RC.showMenu(sumMenu(), r.left, r.bottom + 2); } })); return w; })()]),
      col([menuBtn({ label: 'Math & Trig', icon: '∑', title: 'Math & Trig', items: function () { return fnMenu('Math'); } }), menuBtn({ label: 'Logical', icon: '⊕', title: 'Logical', items: function () { return fnMenu('Logical'); } }), menuBtn({ label: 'Text', icon: 'Ab', title: 'Text', items: function () { return fnMenu('Text'); } })]),
      col([menuBtn({ label: 'Date & Time', icon: '📅', title: 'Date & Time', items: function () { return fnMenu('Date'); } }), menuBtn({ label: 'Lookup & Reference', icon: '🔎', title: 'Lookup & Reference', items: function () { return fnMenu('Lookup'); } }), menuBtn({ label: 'Statistical', icon: '📊', title: 'Statistical', items: function () { return fnMenu('Statistical'); } })]), col([disabled('Financial', '﹩', '', false), disabled('More Functions', '⋯', '', false)])]));
    t.appendChild(group('Defined Names', 'الأسماء', [col([disabled('Name Manager', '🏷')]), col([disabled('Define Name', '＋', '', false), disabled('Create from Selection', '▦', '', false)])]));
    t.appendChild(group('Formula Auditing', 'تدقيق المعادلات', [col([btn({ label: 'Show Formulas', icon: 'ƒ', big: true, title: 'Show Formulas · إظهار المعادلات بدل نتائجها', key: 'showF', fn: function () { S.showFormulas = !S.showFormulas; RC.rerenderSheet(); } })]), col([disabled('Trace Precedents', '⇢', '', false), disabled('Trace Dependents', '⇠', '', false), disabled('Error Checking', '⚠', '', false)])]));
    t.appendChild(group('Calculation', 'الحساب', [col([btn({ big: true, label: 'Calculate Now', icon: '🖩', title: 'Calculate Now · Excel recalculates every formula when you open the downloaded report', fn: function () { RC.toast('Excel recalculates all formulas when the downloaded report is opened. The page already calculates the formulas you type. (إكسيل بيحسب كل المعادلات لما تفتح الملف)', 6000); } })]), col([disabled('Calculation Options', '⚙', '', false)])]));
    return t;
  }
  function dataTab() {
    var t = el('div', 'rtab');
    t.appendChild(group('Get & Transform Data', 'استيراد البيانات', [col([disabled('Get Data', '⤓')]), col([disabled('From Text/CSV', '≣', '', false), disabled('From Web', '🌐', '', false), disabled('From Table/Range', '▤', '', false)]), col([disabled('Refresh All', '⟳')])]));
    t.appendChild(group('Sort & Filter', 'ترتيب وتصفية', [col([btn({ label: 'A→Z', icon: '⇡', big: true, title: 'Sort A to Z · ترتيب تصاعدي (حسب عمود الخلية النشطة — القيم فقط)', fn: function () { E.sort(true); } })]), col([btn({ label: 'Z→A', icon: '⇣', big: true, title: 'Sort Z to A · ترتيب تنازلي', fn: function () { E.sort(false); } })]), col([disabled('Sort', '⇅')]), col([disabled('Filter', '⏷'), ]), col([disabled('Clear', '⌫', '', false), disabled('Reapply', '⟳', '', false), disabled('Advanced', '⚙', '', false)])]));
    t.appendChild(group('Data Tools', 'أدوات البيانات', [col([disabled('Text to Columns', '⫼')]), col([disabled('Flash Fill', '⚡', '', false), disabled('Remove Duplicates', '⊟', '', false), disabled('Data Validation', '✓', '', false)]), col([disabled('Consolidate', '⊞', '', false), disabled('Relationships', '⛓', '', false), disabled('Manage Data Model', '▤', '', false)])]));
    t.appendChild(group('Forecast', 'توقعات', [col([disabled('What-If Analysis', '❓')]), col([disabled('Forecast Sheet', '📈')])]));
    t.appendChild(group('Outline', 'مخطط تفصيلي', [col([disabled('Group', '⊞', '', false), disabled('Ungroup', '⊟', '', false), disabled('Subtotal', 'Σ', '', false)])]));
    return t;
  }
  function reviewTab() {
    var t = el('div', 'rtab');
    var g = group('Changes (this tool)', 'مراجعة التغييرات', []), body = g.querySelector('.rgb');
    ['btnPrevCh', 'btnNextCh', 'btnNextIss'].forEach(function (id) { var e = $(id); if (e) { e.classList.add('rb', 'rtool'); body.appendChild(e); } });
    var c2 = el('div', 'rcol'); ['btnAcceptSheet', 'btnRejectSheet'].forEach(function (id) { var e = $(id); if (e) { e.classList.add('rb', 'rtool'); c2.appendChild(e); } }); body.appendChild(c2);
    t.appendChild(g);
    t.appendChild(group('Proofing', 'تدقيق', [col([disabled('Spelling', 'abc')]), col([disabled('Thesaurus', '📖', '', false), disabled('Workbook Statistics', '🔢', '', false)])]));
    t.appendChild(group('Accessibility', 'إمكانية الوصول', [col([disabled('Check Accessibility', '♿')])]));
    t.appendChild(group('Comments', 'تعليقات', [col([disabled('New Note', '🗨')]), col([disabled('Delete', '✖', '', false), disabled('Previous', '◀', '', false), disabled('Next', '▶', '', false)]), col([disabled('Show All Notes', '▤', '', false), disabled('Show Ink', '✎', '', false)])]));
    t.appendChild(group('Protect', 'حماية', [col([disabled('Protect Sheet', '🔒')]), col([disabled('Protect Workbook', '🔐', '', false), disabled('Allow Edit Ranges', '✎', '', false)])]));
    return t;
  }
  function viewTab() {
    var t = el('div', 'rtab');
    t.appendChild(group('Workbook Views', 'طرق العرض', [col([btn({ label: 'Normal', icon: '▦', big: true, cls: 'on', title: 'Normal view · العرض العادي' })]), col([disabled('Page Break Preview', '⇲', '', false), disabled('Page Layout', '▭', '', false), disabled('Custom Views', '◧', '', false)])]));
    var showCol1 = el('div', 'rcol'), showCol2 = el('div', 'rcol');
    var rul = $('optRuler'), iss = $('optIssues'), aut = $('optAuto');
    function moved(inp) { return inp ? inp.parentNode : null; }
    [moved(rul), moved(iss), moved(aut)].forEach(function (l, i) { if (l) { l.classList.add('rchk'); (i === 2 ? showCol2 : showCol1).appendChild(l); } });
    showCol1.insertBefore(check('Gridlines', 'خطوط الشبكة', function () { return !gridOff(); }, function (v) { S.hideGrid = !v; RC.rerenderSheet(); }, 'gridChk2'), showCol1.firstChild);
    showCol2.insertBefore(check('Headings', 'العناوين', function () { return !S.hideHeads; }, function (v) { S.hideHeads = !v; RC.rerenderSheet(); }, 'headChk2'), showCol2.firstChild);
    showCol2.insertBefore(check('Formula Bar', 'شريط المعادلات', function () { return !$('fbar').classList.contains('off'); }, function (v) { $('fbar').classList.toggle('off', !v); }, null), showCol2.children[1] || null);
    t.appendChild(group('Show', 'إظهار', [showCol1, showCol2]));
    t.appendChild(group('Zoom', 'تكبير', [col([menuBtn({ big: true, label: 'Zoom', icon: '🔍', title: 'Zoom · تكبير', items: zoomMenu })]), col([btn({ big: true, label: '100%', icon: '1:1', title: 'Zoom to 100%', fn: function () { RC.setZoom(100); } })])]));
    t.appendChild(group('Window', 'النافذة', [col([menuBtn({ big: true, label: 'Freeze Panes', icon: '❄', title: 'Freeze Panes · تثبيت الأجزاء', items: freezeMenu })]), col([disabled('New Window', '⧉', '', false), disabled('Arrange All', '▦', '', false), disabled('Split', '⫴', '', false)]), col([disabled('Switch Windows', '⇄')])]));
    t.appendChild(group('Macros', 'ماكرو', [col([disabled('Macros', '⏺')])]));
    return t;
  }
  function fileTab(btnEl) {
    return function () {
      var r = btnEl.getBoundingClientRect();
      RC.showMenu([{ t: 'head', label: 'File · ملف' }, mi('Download reviewed report (.xlsx)', 'نزّل التقرير', function () { RC.downloadReport(); }), mi('Change log (.csv)', 'سجل التغييرات', function () { RC.csv(); }), { t: 'sep' }, mi('Undo', 'تراجع', function () { RC.undo(); }), mi('Redo', 'إعادة', function () { RC.redo(); }), { t: 'sep' }, mi('Find…', 'بحث', function () { E.findDialog(false); }), mi('Start over', 'ابدأ من جديد', function () { RC.reset(); }), { t: 'sep' }, { t: 'head', label: $('ver').textContent }], r.left, r.bottom + 2);
    };
  }

  /* ---------- format painter ---------- */
  function startPainter() {
    var st = E.activeStyle(); if (!st) { RC.toast('Select a formatted cell first. (حدد خلية منسقة)'); return; }
    state.painter = { name: st.name, sz: st.sz, b: st.b, i: st.i, u: st.u, color: st.color, fill: st.fill, h: st.h, v: st.v, wrap: st.wrap, indent: st.indent, nf: st.nf, bd: Fmt.clone(st.bd) };
    nodes.painter.classList.add('on'); document.body.classList.add('painting'); RC.toast('Format copied — now select the cells to format. (حدد الخلايا اللي عايز تنسقها)');
  }
  document.addEventListener('mouseup', function () {
    if (!state.painter) return;
    setTimeout(function () {
      if (!state.painter || !E.sel()) return;
      var p = state.painter; state.painter = null; nodes.painter.classList.remove('on'); document.body.classList.remove('painting');
      E.format(Object.assign({ reset: true }, Fmt.clone(p)));
    }, 0);
  });

  /* ---------- assemble ---------- */
  var TABS = [['file', 'File', 'ملف', null], ['home', 'Home', 'الرئيسية', homeTab], ['insert', 'Insert', 'إدراج', insertTab], ['layout', 'Page Layout', 'تخطيط الصفحة', layoutTab], ['formulas', 'Formulas', 'المعادلات', formulasTab], ['data', 'Data', 'بيانات', dataTab], ['review', 'Review', 'مراجعة', reviewTab], ['view', 'View', 'عرض', viewTab]];
  var panes = {};
  function show(id) {
    state.tab = id;
    Object.keys(panes).forEach(function (k) { panes[k].hidden = k !== id; });
    [].forEach.call($('rtabs').querySelectorAll('.rt'), function (b) { b.classList.toggle('on', b.getAttribute('data-t') === id); });
    $('ribbon').classList.toggle('collapsed', state.collapsed);
  }
  R.init = function () {
    var root = $('ribbon'); if (!root || R.ready) return; R.ready = true;
    var top = el('div', 'rtop'), qat = el('div', 'qat'), tabs = el('div', 'rtabs'); tabs.id = 'rtabs';
    nodes.undo = btn({ label: '', icon: '↶', title: 'Undo · تراجع (Ctrl+Z)', cls: 'q', fn: RC.undo }); nodes.redo = btn({ label: '', icon: '↷', title: 'Redo · إعادة (Ctrl+Y)', cls: 'q', fn: RC.redo });
    qat.appendChild(btn({ label: '', icon: '💾', title: 'Download the reviewed report · نزّل التقرير', cls: 'q', fn: function () { RC.downloadReport(); } })); qat.appendChild(nodes.undo); qat.appendChild(nodes.redo);
    top.appendChild(qat);
    TABS.forEach(function (t) {
      var b = el('button', 'rt' + (t[0] === 'file' ? ' file' : '')); b.type = 'button'; b.setAttribute('data-t', t[0]); b.innerHTML = h(t[1]) + ' <small class="ar">' + h(t[2]) + '</small>';
      if (t[0] === 'file') b.addEventListener('click', guard(fileTab(b))); else { b.addEventListener('click', function () { if (state.collapsed && state.tab === t[0]) { state.collapsed = false; } else if (state.collapsed) state.collapsed = false; show(t[0]); }); b.addEventListener('dblclick', function () { state.collapsed = !state.collapsed; show(t[0]); }); }
      blurSoon(b); tabs.appendChild(b);
    });
    top.appendChild(tabs);
    var right = el('div', 'rtr'); var title = $('sheetTitle'); if (title) right.appendChild(title);
    var col = el('button', 'rcol2'); col.type = 'button'; col.title = 'Collapse / expand the ribbon · طيّ الشريط'; col.textContent = '⌃'; col.addEventListener('click', function () { state.collapsed = !state.collapsed; show(state.tab); col.textContent = state.collapsed ? '⌄' : '⌃'; }); blurSoon(col); right.appendChild(col);
    top.appendChild(right); root.appendChild(top);
    var body = el('div', 'rbody'); root.appendChild(body);
    TABS.forEach(function (t) { if (!t[3]) return; var p = t[3](); p.hidden = true; panes[t[0]] = p; body.appendChild(p); });
    var old = document.querySelector('.toolbar'); if (old) old.parentNode.removeChild(old);
    show('home'); R.update();
  };
  /* keep the toggle buttons / selects in step with the active cell */
  R.update = function () {
    if (!R.ready) return;
    var st = E.activeStyle(), on = !!st, ov = S.sheet === '__overview';
    function pr(k, v) { if (nodes[k]) nodes[k].classList.toggle('on', !!v); }
    pr('b', on && st.b); pr('i', on && st.i); pr('u', on && st.u); pr('wrap', on && st.wrap);
    pr('vt', on && st.v === 'top'); pr('vc', on && st.v === 'center'); pr('vb', on && (st.v === 'bottom' || st.v === '')); pr('hl', on && st.h === 'left'); pr('hc', on && st.h === 'center'); pr('hr', on && st.h === 'right');
    pr('showF', S.showFormulas);
    if (on && nodes.font && document.activeElement !== nodes.font) { if (![].some.call(nodes.font.options, function (o) { return o.value === st.name; })) { var o = document.createElement('option'); o.value = o.textContent = st.name; nodes.font.appendChild(o); } nodes.font.value = st.name; }
    if (on && nodes.size && document.activeElement !== nodes.size) { if (![].some.call(nodes.size.options, function (o) { return +o.value === +st.sz; })) { var o2 = document.createElement('option'); o2.value = o2.textContent = String(st.sz); nodes.size.appendChild(o2); } nodes.size.value = String(st.sz); }
    if (on && nodes.nf && document.activeElement !== nodes.nf) nodes.nf.value = Fmt.nfName(st.nf) || '__custom';
    if (nodes.undo) { nodes.undo.disabled = !S.undo.length; nodes.redo.disabled = !S.redo.length; }
    if (nodes.gridChk) nodes.gridChk.checked = !gridOff(); if (nodes.gridChk2) nodes.gridChk2.checked = !gridOff();
    if (nodes.headChk) nodes.headChk.checked = !S.hideHeads; if (nodes.headChk2) nodes.headChk2.checked = !S.hideHeads;
    $('ribbon').classList.toggle('noedit', ov);
  };
  R.init();
})();

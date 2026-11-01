/* Report Compare — the page. Upload last week's and this week's report, review every change (keep / reject / edit),
 * fix what the checker flags, download the reviewed report. Everything runs in the browser. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var S = {
    slots: { prev: null, cur: null }, prev: null, cur: null, cmp: null, dec: {}, dismissed: {}, view: null, issues: [], issueMap: {},
    sheet: '__overview', sel: null, range: null, extra: [], tab: 'cell', scope: { changes: 'sheet', checks: 'all' }, pendingOnly: false, showDismissed: false, session: ''
  };
  var xfCache = {};

  function h(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function key(sheet, a) { return sheet + '!' + a; }
  function toast(msg, ms) { var t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, ms || 3500); }
  function showError(msg) { var e = $('error'); e.textContent = msg; e.hidden = !msg; }
  /* Arabic text with Latin names / numbers / dates inside: isolate those pieces so the bidi algorithm keeps them readable (98.7%, 21-Oct-2026 …). */
  function arHtml(s) {
    return h(s).replace(/&quot;[^]*?&quot;|[A-Za-z]*[-+]?\d[\w.,:\/-]*%?/g, function (m) { return '<bdi dir="ltr">' + m + '</bdi>'; });
  }
  function short(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  /* ---------- loading ---------- */
  async function loadFile(slot, file) {
    showError('');
    try {
      var bytes = new Uint8Array(await file.arrayBuffer());
      var zip = await JSZip.loadAsync(bytes), wb = await Xl.readWorkbook(zip);
      S.slots[slot] = { name: file.name, size: file.size, bytes: bytes, wb: wb };
      var box = document.querySelector('.drop-box[data-slot="' + slot + '"]');
      box.classList.add('ready');
      box.querySelector('.fname').innerHTML = '✔ <b>' + h(file.name) + '</b><br><small>' + wb.sheets.length + ' sheets</small>';
      if (S.slots.prev && S.slots.cur) start();
    } catch (e) {
      console.error(e);
      showError('Could not read "' + file.name + '": ' + (e && e.message ? e.message : e) + ' — please choose a valid .xlsx workbook. (تعذّرت قراءة الملف — اختر ملف إكسل .xlsx سليم.)');
    }
  }
  function wireDrop() {
    document.querySelectorAll('.drop-box').forEach(function (box) {
      var inp = box.querySelector('input'), slot = box.getAttribute('data-slot');
      box.addEventListener('click', function () { inp.click(); });
      box.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } });
      inp.addEventListener('click', function (e) { e.stopPropagation(); });
      inp.addEventListener('change', function () { if (inp.files[0]) loadFile(slot, inp.files[0]); });
      ['dragenter', 'dragover'].forEach(function (ev) { box.addEventListener(ev, function (e) { e.preventDefault(); box.classList.add('over'); }); });
      ['dragleave', 'drop'].forEach(function (ev) { box.addEventListener(ev, function (e) { e.preventDefault(); box.classList.remove('over'); }); });
      box.addEventListener('drop', function (e) { var f = e.dataTransfer.files[0]; if (f) loadFile(slot, f); });
    });
  }

  function start() {
    S.prev = S.slots.prev; S.cur = S.slots.cur;
    S.cmp = Diff.compare(S.prev.wb, S.cur.wb);
    S.session = 'rc.v1.' + [S.prev.name, S.prev.size, S.cur.name, S.cur.size].join('|');
    S.dec = {}; S.dismissed = {};
    try { var saved = JSON.parse(localStorage.getItem(S.session) || 'null'); if (saved) { S.dec = saved.dec || {}; S.dismissed = saved.dismissed || {}; if (Object.keys(S.dec).length) toast('Restored your earlier review of these two files. (اتسترجع التقييم السابق)'); } } catch (e) { /* no storage */ }
    S.sheet = '__overview'; S.sel = null; S.tab = 'cell';
    $('upload').hidden = true; $('app').hidden = false; $('topActions').hidden = false;
    recompute(); renderNav(); showSheet('__overview');
  }

  function save() { try { localStorage.setItem(S.session, JSON.stringify({ dec: S.dec, dismissed: S.dismissed })); } catch (e) { /* ignore */ } }

  function recompute() {
    S.view = Diff.makeView(S.prev.wb, S.cur.wb, S.dec);
    S.issuesAll = Checks.run(S.cmp, S.cur.wb, S.prev.wb, S.view, {});
    S.issues = S.issuesAll.filter(function (i) { return !S.dismissed[i.id]; });
    S.issueMap = {};
    S.issues.forEach(function (i) { (S.issueMap[key(i.sheet, i.a)] = S.issueMap[key(i.sheet, i.a)] || []).push(i); });
    S.counts = Diff.counts(S.cmp, S.dec);
  }

  /* ---------- styles / display ---------- */
  var BORDER = { thin: '1px solid', hair: '1px dotted', medium: '2px solid', thick: '3px solid', dashed: '1px dashed', dotted: '1px dotted', double: '3px double', mediumDashed: '2px dashed' };
  function xfCss(i) {
    if (xfCache[i] != null) return xfCache[i];
    var x = S.cur.wb.styles.xfs[i], css = [];
    if (x) {
      var f = x.font || {};
      if (x.fill) css.push('background-color:' + x.fill);
      if (f.color) css.push('color:' + f.color);
      if (f.b) css.push('font-weight:700');
      if (f.i) css.push('font-style:italic');
      if (f.u) css.push('text-decoration:underline');
      if (f.sz) css.push('font-size:' + (Math.min(40, f.sz) * 4 / 3).toFixed(2) + 'px');
      if (f.name && !/^calibri$/i.test(f.name)) css.push('font-family:"' + f.name.replace(/"/g, '') + '",Calibri,Carlito,Arial,sans-serif');
      var al = x.h === 'centerContinuous' ? 'center' : (x.h === 'general' ? '' : x.h);
      if (al) css.push('text-align:' + al);
      if (x.v) css.push('vertical-align:' + (x.v === 'center' ? 'middle' : x.v));
      if (x.indent) css.push('padding-left:' + (4 + x.indent * 9) + 'px');
      ['left', 'right', 'top', 'bottom'].forEach(function (s) { var b = x.border && x.border[s]; if (b) css.push('border-' + s + ':' + (BORDER[b.style] || '1px solid') + ' ' + b.color); });
    }
    return (xfCache[i] = css.join(';'));
  }
  /* a date typed into a cell that is not date-formatted is shown (and written) as a date */
  function fmtTyped(c) {
    var probe = { k: c.k, v: c.v, s: c.s };
    if (c.date && c.k === 'n' && !Xl.isDateCell(probe, S.cur.wb.styles)) return Xl.formatNumber(c.v, 'dd-mmm-yyyy');
    return Xl.formatCell(probe, S.cur.wb.styles);
  }
  function displayCell(sheet, a) {
    var ec = S.view.eff(sheet, a);
    if (!ec) return '';
    if (ec.k === '' && ec.f != null) return 'ƒ ' + short(ec.f, 40);
    var cc = S.cur.wb.byName[sheet].cells.get(a);
    return fmtTyped({ k: ec.k, v: ec.v, s: cc ? cc.s : 0, date: ec.date });
  }
  function showCellVal(c, wb) { if (!c || (c.k === '' && c.f == null)) return ''; return Xl.formatCell(c, wb.styles); }
  function editText(c, sheet) {
    if (!c || (c.k === '' && c.f == null)) return '';
    if (c.f != null) return '=' + c.f;
    if (c.k === 's') { var pi = Diff.parseInput(c.v); return (pi && pi.k !== 's') || /^['=]/.test(c.v) ? "'" + c.v : c.v; }
    if (c.k === 'b') return c.v ? 'TRUE' : 'FALSE';
    if (c.k === 'e') return c.v;
    var cc = S.cur.wb.byName[sheet] && S.cur.wb.byName[sheet].cells.get(c.a), probe = { k: 'n', v: c.v, s: cc ? cc.s : 0 };
    if (Xl.isDateCell(probe, S.cur.wb.styles)) return Xl.formatNumber(c.v, 'dd/mm/yyyy');
    if (Xl.isPercentCell(probe, S.cur.wb.styles)) return parseFloat((c.v * 100).toFixed(6)) + '%';
    return String(c.v);
  }

  /* ---------- sheet grid ---------- */
  function colPx(sh) {
    var w = [], c;
    for (c = 1; c <= sh.maxC; c++) w[c] = Math.round(sh.defW * 7);
    sh.cols.forEach(function (d) { for (c = d.min; c <= Math.min(d.max, sh.maxC); c++) w[c] = d.hidden ? 0 : Math.round(d.w * 7); });
    return w;
  }
  function renderGrid(name) {
    var sh = S.cur.wb.byName[name], w = colPx(sh), out = [], r, c;
    var top = {}, covered = {};
    function rowH(r) { var q = sh.rows.get(r); return q && q.hidden ? 0 : Math.round(((q && q.ht) || sh.defH) * 4 / 3); }
    sh.merges.forEach(function (g) {
      top[Xl.addr(g.c1, g.r1)] = g;
      for (var rr = g.r1; rr <= g.r2; rr++) for (var cc = g.c1; cc <= g.c2; cc++) if (rr !== g.r1 || cc !== g.c1) covered[Xl.addr(cc, rr)] = true;
    });
    var totalW = 44; for (c = 1; c <= sh.maxC; c++) totalW += w[c];
    out.push('<table class="sheet" style="width:' + totalW + 'px"><colgroup><col style="width:44px">');
    for (c = 1; c <= sh.maxC; c++) out.push(w[c] ? '<col style="width:' + w[c] + 'px">' : '<col style="width:0">');
    out.push('</colgroup><thead><tr><th class="rh"></th>');
    for (c = 1; c <= sh.maxC; c++) if (w[c]) out.push('<th>' + Xl.numToCol(c) + '</th>'); else out.push('<th style="width:0;padding:0;border:0"></th>');
    out.push('</tr></thead><tbody>');
    for (r = 1; r <= sh.maxR; r++) {
      var ri = sh.rows.get(r);
      if (ri && ri.hidden) continue;
      var ht = rowH(r);
      out.push('<tr style="height:' + ht + 'px"><th class="rh">' + r + '</th>');
      for (c = 1; c <= sh.maxC; c++) {
        var a = Xl.addr(c, r);
        if (covered[a] || !w[c]) { if (!w[c]) out.push('<td style="padding:0;border:0"></td>'); continue; }
        var cell = sh.cells.get(a), xf = S.cur.wb.styles.xfs[cell ? cell.s : 0];
        var g = top[a], span = g ? ' colspan="' + (g.c2 - g.c1 + 1) + '" rowspan="' + (g.r2 - g.r1 + 1) + '"' : '';
        var ec = S.view.eff(name, a), txt = ec ? displayCell(name, a) : '';
        var num = ec && ec.k === 'n' && !(xf && xf.h && xf.h !== 'general');
        var wrapCell = !!(xf && xf.wrap), inner = h(txt), extra = '';
        if (wrapCell) { var hh = 0; if (g) { for (var q = g.r1; q <= g.r2; q++) hh += rowH(q); } else hh = ht; inner = '<div class="c" style="max-height:' + Math.max(8, hh - 2) + 'px">' + inner + '</div>'; }
        else if (!g && ec && ec.k === 's' && (!xf || !xf.h || xf.h === 'general' || xf.h === 'left') && w[c + 1] && c < sh.maxC && !covered[Xl.addr(c + 1, r)] && !S.view.eff(name, Xl.addr(c + 1, r))) extra = ';overflow:visible;text-overflow:clip';   /* text spills into the empty cell on its right, as in Excel */
        out.push('<td data-a="' + a + '"' + span + (wrapCell ? ' class="wrap"' : '') + ' style="' + xfCss(cell ? cell.s : 0) + (num ? ';text-align:right' : '') + extra + '">' + inner + '</td>');
      }
      out.push('</tr>');
    }
    out.push('</tbody></table>');
    return out.join('');
  }
  function setTdText(td, t) { var c = td.firstChild && td.firstChild.nodeType === 1 && td.firstChild.className === 'c' ? td.firstChild : td; if (c.textContent !== t) c.textContent = t; }
  function cls(sheet, a) {
    var k = key(sheet, a), d = S.dec[k], ch = S.cmp.byKey[k], c = [];
    if (ch && !ch.auto) c.push(!d ? 'pending' : d.m === 'accept' ? 'accept' : d.m === 'reject' ? 'reject' : 'custom');
    else if (d && d.m === 'custom') c.push('custom');
    else if (ch && ch.auto) c.push('auto');
    var is = S.issueMap[k];
    if (is) c.push('iss-' + (is.some(function (i) { return i.sev === 'error'; }) ? 'error' : is.some(function (i) { return i.sev === 'warn'; }) ? 'warn' : 'info'));
    if (S.sel && S.sel.sheet === sheet && S.sel.a === a) c.push('sel');
    if (inRange(sheet, a)) c.push('rng');
    return c.join(' ');
  }
  /* ----- ruler: a horizontal and a vertical band follow the selection (strong) and the mouse (light) ----- */
  var hoverTd = null, hoverRaf = 0;
  function ensureBands() {
    ['selH', 'selV', 'hovH', 'hovV'].forEach(function (n) { var d = document.createElement('div'); d.className = 'band ' + n; $('gridWrap').appendChild(d); });
  }
  function place(wrapRect, wrap, tbl, tds, hEl, vEl) {
    var l = 1e9, t = 1e9, r = -1, b = -1;
    tds.forEach(function (td) { var q = td.getBoundingClientRect(); l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom); });
    if (r < 0) { hEl.style.display = vEl.style.display = 'none'; return; }
    l = l - wrapRect.left + wrap.scrollLeft; r = r - wrapRect.left + wrap.scrollLeft; t = t - wrapRect.top + wrap.scrollTop; b = b - wrapRect.top + wrap.scrollTop;
    hEl.style.cssText = 'display:block;left:0;width:' + tbl.getBoundingClientRect().width + 'px;top:' + t + 'px;height:' + (b - t) + 'px';
    vEl.style.cssText = 'display:block;top:0;height:' + tbl.getBoundingClientRect().height + 'px;left:' + l + 'px;width:' + (r - l) + 'px';
  }
  function updateRuler() {
    var wrap = $('gridWrap'), bands = wrap.querySelectorAll('.band');
    if (S.sheet === '__overview' || bands.length < 4) return;
    var tbl = wrap.querySelector('table.sheet'), on = $('optRuler').checked;
    wrap.querySelectorAll('th.hl').forEach(function (t) { t.classList.remove('hl'); });
    if (!on || !tbl || !S.sel || S.sel.sheet !== S.sheet) { bands[0].style.display = bands[1].style.display = 'none'; return; }
    var tds = [];
    if (S.range && S.range.sheet === S.sheet) wrap.querySelectorAll('td[data-a]').forEach(function (t) { var p = Xl.parseAddr(t.getAttribute('data-a')); if (inRect(S.range, p.r, p.c)) tds.push(t); });
    if (!tds.length) { var one = wrap.querySelector('td[data-a="' + S.sel.a + '"]'); if (one) tds.push(one); }
    place(wrap.getBoundingClientRect(), wrap, tbl, tds, bands[0], bands[1]);
    var head = tbl.tHead.rows[0], seenR = {}, seenC = {};
    tds.forEach(function (td) {
      var p = Xl.parseAddr(td.getAttribute('data-a')), ri = td.parentNode.firstChild;
      if (!seenR[p.r]) { seenR[p.r] = 1; ri.classList.add('hl'); }
      for (var c = p.c; c < p.c + (td.colSpan || 1); c++) if (!seenC[c]) { seenC[c] = 1; if (head.cells[c]) head.cells[c].classList.add('hl'); }
    });
  }
  function updateHover() {
    hoverRaf = 0;
    var wrap = $('gridWrap'), bands = wrap.querySelectorAll('.band'), tbl = wrap.querySelector('table.sheet');
    if (bands.length < 4 || !tbl) return;
    if (!hoverTd || !$('optRuler').checked) { bands[2].style.display = bands[3].style.display = 'none'; return; }
    place(wrap.getBoundingClientRect(), wrap, tbl, [hoverTd], bands[2], bands[3]);
  }
  function paintMarks() {
    paintCells(); updateRuler();
  }
  function paintCells() {
    if (S.sheet === '__overview') return;
    RECTS = selRects();
    var name = S.sheet, tds = $('gridWrap').querySelectorAll('td[data-a]');
    for (var i = 0; i < tds.length; i++) {
      var td = tds[i], a = td.getAttribute('data-a'), k = key(name, a), nc = cls(name, a);
      if (td.className.replace('wrap', '').trim() !== nc) td.className = (td.classList.contains('wrap') ? 'wrap ' : '') + nc;
      if (S.cmp.byKey[k] || S.dec[k]) setTdText(td, displayCell(name, a));
    }
  }

  /* ---------- navigation ---------- */
  function sheetStats(name) {
    var st = { pending: 0, changes: 0, err: 0, warn: 0 };
    S.cmp.changes.forEach(function (ch) { if (ch.sheet === name) { st.changes++; if (!S.dec[ch.id]) st.pending++; } });
    S.issues.forEach(function (i) { if (i.sheet === name) { if (i.sev === 'error') st.err++; else if (i.sev === 'warn') st.warn++; } });
    return st;
  }
  function renderNav() {
    var out = ['<button type="button" data-s="__overview" class="' + (S.sheet === '__overview' ? 'on' : '') + '"><span class="nm">▦ Overview <span class="ar">ملخص</span></span></button>'];
    S.cur.wb.sheets.forEach(function (sh) {
      var st = sheetStats(sh.name), on = S.sheet === sh.name;
      out.push('<button type="button" data-s="' + h(sh.name) + '" class="' + (on ? 'on ' : '') + (sh.state !== 'visible' ? 'hid' : '') + '" style="border-bottom-color:' + (sh.tabColor || 'transparent') + '" title="' + h(sh.name) + (sh.state !== 'visible' ? ' (hidden sheet)' : '') + '"><span class="nm">' + h(sh.name) + '</span>' +
        (st.pending ? '<span class="pill ch" title="changes to review">' + st.pending + '</span>' : (st.changes ? '<span class="pill ok" title="all reviewed">✓</span>' : '')) +
        (st.err ? '<span class="pill er" title="checker errors">' + st.err + '</span>' : '') + (st.warn ? '<span class="pill wr" title="checker warnings">' + st.warn + '</span>' : '') + '</button>');
    });
    $('nav').innerHTML = out.join('');
  }
  function showSheet(name, keepSel) {
    S.sheet = name; S.range = null; S.extra = [];
    if (!keepSel) S.sel = null;
    renderNav();
    var wrap = $('gridWrap'), isOv = name === '__overview';
    $('sheetTitle').innerHTML = isOv ? 'Overview <span class="ar">ملخص المراجعة</span>' : h(name);
    ['btnPrevCh', 'btnNextCh', 'btnNextIss', 'btnAcceptSheet', 'btnRejectSheet'].forEach(function (id) { $(id).hidden = isOv && /Sheet/.test(id); });
    $('legend').hidden = isOv; $('fbar').hidden = isOv; $('zoom').hidden = isOv;
    if (isOv) { wrap.className = 'grid-wrap'; wrap.innerHTML = renderOverview(); }
    else {
      wrap.innerHTML = renderGrid(name);
      wrap.className = 'grid-wrap' + ($('optAuto').checked ? '' : ' noauto') + ($('optIssues').checked ? '' : ' noiss') + (S.cur.wb.byName[name].showGrid ? '' : ' nogrid');
      ensureBands(); applyZoom(); paintMarks();
    }
    wrap.scrollTop = 0; wrap.scrollLeft = 0;
    refreshSide();
  }
  function renderOverview() {
    var c = S.counts, e = S.issues.filter(function (i) { return i.sev === 'error'; }).length, w = S.issues.filter(function (i) { return i.sev === 'warn'; }).length;
    var o = ['<div class="overview"><h2>Review summary <span class="ar">ملخص المراجعة</span></h2>',
      '<p class="hint">Last week: <b>' + h(S.prev.name) + '</b> → This week: <b>' + h(S.cur.name) + '</b></p><div class="cards">',
      '<div class="card"><b>' + c.total + '</b><span>cell changes found · تغييرات</span></div>',
      '<div class="card warn"><b>' + c.pending + '</b><span>still to review · لسه</span></div>',
      '<div class="card good"><b>' + c.accepted + '</b><span>kept · موافق</span></div>',
      '<div class="card blue"><b>' + c.rejected + '</b><span>rejected → last week’s value · مرفوض</span></div>',
      '<div class="card purple"><b>' + (c.edited + c.editedOther) + '</b><span>edited by you · عدّلتها</span></div>',
      '<div class="card bad"><b>' + e + '</b><span>checker errors · أخطاء</span></div>',
      '<div class="card warn"><b>' + w + '</b><span>checker warnings · تنبيهات</span></div>',
      '<div class="card"><b>' + c.auto + '</b><span>auto-calculated results moved · محسوبة</span></div></div>'];
    o.push('<div class="btnrow"><button class="act accept" id="ovAccept" type="button">✔ Accept all remaining changes <span class="ar">وافق على الباقي</span></button><button class="act undo" id="ovReset" type="button">Reset all decisions <span class="ar">إلغاء كل القرارات</span></button></div>');
    o.push('<p class="note"><b>How it works · إزاي بتشتغل:</b> a changed cell is outlined in <b>amber</b>. <b>Keep</b> = the new value stays; <b>Reject</b> = the cell goes back to last week’s value in the final report; or type your own value. Pending cells are kept as in this week’s file. Formula results are recalculated by Excel when you open the downloaded file. Charts, pictures and formatting are not touched. <span class="ar">الخلية المتغيرة بتتلون برتقالي. وافق = القيمة الجديدة تفضل · ارفض = ترجع لقيمة الأسبوع الماضي · أو اكتب قيمتك. اللي مش هتراجعه بيفضل زي ما هو في ملف الأسبوع الحالي.</span></p>');
    if (S.cmp.onlyCur.length || S.cmp.onlyPrev.length) o.push('<p class="note">Sheets not in both files: ' + h(S.cmp.onlyCur.concat(S.cmp.onlyPrev).join(', ')) + ' (not compared). <span class="ar">شيتات مش موجودة في الملفين.</span></p>');
    o.push('<table class="ovt"><tr><th>Sheet · الشيت</th><th>Changes</th><th>To review</th><th>Errors</th><th>Warnings</th><th>Auto</th><th>Decide for the whole sheet · قرار للشيت كله</th></tr>');
    S.cur.wb.sheets.forEach(function (sh) {
      var st = sheetStats(sh.name), info = S.cmp.sheets[sh.name] || { auto: 0 };
      o.push('<tr class="go" data-s="' + h(sh.name) + '"><td>' + h(sh.name) + (sh.state !== 'visible' ? ' <small>(hidden)</small>' : '') + '</td><td class="n">' + st.changes + '</td><td class="n">' + (st.pending || '') + '</td><td class="n">' + (st.err || '') + '</td><td class="n">' + (st.warn || '') + '</td><td class="n">' + (info.auto || '') + '</td><td class="n">' + (st.changes ? '<button class="mini fix" data-bulk="accept" data-sheet="' + h(sh.name) + '" type="button">✔ Keep all</button> <button class="mini" data-bulk="reject" data-sheet="' + h(sh.name) + '" type="button">↺ Reject all</button>' : '') + '</td></tr>');
    });
    o.push('</table></div>');
    return o.join('');
  }

  function selectCell(sheet, a, scroll) {
    S.range = null; S.extra = [];
    if (S.sheet !== sheet) { S.sel = { sheet: sheet, a: a }; showSheet(sheet, true); }
    else { S.sel = { sheet: sheet, a: a }; paintMarks(); refreshSide(); }
    if (scroll !== false) {
      var td = $('gridWrap').querySelector('td[data-a="' + a + '"]');
      if (td) td.scrollIntoView(scroll === 'nearest' ? { block: 'nearest', inline: 'nearest' } : { block: 'center', inline: 'center' });
    }
  }
  function jump(list, dir) {
    if (!list.length) { toast('Nothing to jump to. (مفيش حاجة)'); return; }
    var idx = -1;
    if (S.sel) for (var i = 0; i < list.length; i++) if (list[i].sheet === S.sel.sheet && (list[i].a === S.sel.a)) { idx = i; break; }
    idx = idx < 0 ? (dir > 0 ? 0 : list.length - 1) : (idx + dir + list.length) % list.length;
    selectCell(list[idx].sheet, list[idx].a);
  }
  function pendingList() { return S.cmp.changes.filter(function (c) { return !S.dec[c.id]; }); }
  function nextPending(fromSel) {
    var list = S.cmp.changes, start = -1, i;
    if (fromSel) for (i = 0; i < list.length; i++) if (list[i].id === key(fromSel.sheet, fromSel.a)) { start = i; break; }
    for (i = 1; i <= list.length; i++) { var ch = list[(start + i) % list.length]; if (!S.dec[ch.id]) return ch; }
    return null;
  }

  /* ---------- decisions ---------- */
  function afterChange() { save(); recompute(); renderNav(); paintMarks(); refreshSide(); if (S.sheet === '__overview') $('gridWrap').innerHTML = renderOverview(); }
  function setDec(sheet, a, m, v, advance) {
    var k = key(sheet, a);
    if (!m) delete S.dec[k]; else S.dec[k] = m === 'custom' ? { m: m, v: v } : { m: m };
    var from = S.sel;
    afterChange();
    if (advance) { var nx = nextPending(from || { sheet: sheet, a: a }); if (nx) selectCell(nx.sheet, nx.a); else toast('All changes reviewed ✔ (خلصت مراجعة كل التغييرات)'); }
  }
  function acceptAll(sheet) {
    var n = 0;
    S.cmp.changes.forEach(function (ch) { if ((!sheet || ch.sheet === sheet) && !S.dec[ch.id]) { S.dec[ch.id] = { m: 'accept' }; n++; } });
    afterChange(); toast(n + ' change(s) accepted. (' + n + ' تغيير اتوافق عليه)');
  }
  /* Bulk keep / reject. Earlier keep/reject decisions are overwritten; the reviewer's own typed values are never touched. */
  function bulk(list, m) {
    var n = 0, skipped = 0;
    list.forEach(function (ch) { var d = S.dec[ch.id]; if (d && d.m === 'custom') { skipped++; return; } S.dec[ch.id] = { m: m }; n++; });
    afterChange();
    toast(n + ' change(s) ' + (m === 'accept' ? 'kept' : 'rejected → last week’s value') + (skipped ? ' · ' + skipped + ' of your own edits left as they are' : '') + '. (' + n + (m === 'accept' ? ' اتوافق عليها' : ' اترفضت') + ')', 5000);
  }
  function bulkSheet(sheet, m) {
    var list = S.cmp.changes.filter(function (c) { return c.sheet === sheet; });
    if (!list.length) { toast('No changes in this sheet. (مفيش تغييرات)'); return; }
    if (m === 'reject' && !window.confirm('Reject all ' + list.length + ' change(s) in "' + sheet + '"? Every cell goes back to last week’s value (you can undo per cell, or use Start over).\n(ترفض كل التغييرات في الشيت دي وترجّعها لقيمة الأسبوع الماضي؟)')) return;
    bulk(list, m);
  }
  /* ----- cell range selection (drag, or shift+click) ----- */
  /* The selection = the active rectangle (S.range, or just S.sel) + S.extra: rectangles added with Ctrl+click / Ctrl+drag. */
  var RECTS = [];
  function inRect(g, r, c) { return r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2; }
  function rectOfAddrs(a1, a2) { var p = Xl.parseAddr(a1), q = Xl.parseAddr(a2); return { sheet: S.sheet, r1: Math.min(p.r, q.r), r2: Math.max(p.r, q.r), c1: Math.min(p.c, q.c), c2: Math.max(p.c, q.c) }; }
  function cellRect(a) { var p = Xl.parseAddr(a); return { sheet: S.sheet, r1: p.r, r2: p.r, c1: p.c, c2: p.c }; }
  function selRects() {
    var out = S.extra.filter(function (g) { return g.sheet === S.sheet; });
    if (S.extra.length) { if (S.range && S.range.sheet === S.sheet) out.push(S.range); else if (S.sel && S.sel.sheet === S.sheet) out.push(cellRect(S.sel.a)); }
    else if (S.range && S.range.sheet === S.sheet) out.push(S.range);
    return out;
  }
  function inRange(sheet, a) {
    if (sheet !== S.sheet || !RECTS.length) return false;
    var p = Xl.parseAddr(a); return RECTS.some(function (g) { return inRect(g, p.r, p.c); });
  }
  function setRange(a1, a2) {
    var p = Xl.parseAddr(a1), q = Xl.parseAddr(a2);
    S.rangeEnd = a2;
    S.range = (a1 === a2) ? null : { sheet: S.sheet, r1: Math.min(p.r, q.r), r2: Math.max(p.r, q.r), c1: Math.min(p.c, q.c), c2: Math.max(p.c, q.c) };
    paintRange();
  }
  function paintRange() {
    RECTS = selRects();
    var tds = $('gridWrap').querySelectorAll('td[data-a]');
    for (var i = 0; i < tds.length; i++) tds[i].classList.toggle('rng', inRange(S.sheet, tds[i].getAttribute('data-a')));
  }
  function clearSelection() { S.range = null; S.extra = []; paintRange(); }
  function describeSel() {
    if (!S.sel) return '';
    var rects = selRects(); if (!rects.length) return S.sel.a;
    return rects.map(function (g) { return g.r1 === g.r2 && g.c1 === g.c2 ? Xl.addr(g.c1, g.r1) : Xl.addr(g.c1, g.r1) + ':' + Xl.addr(g.c2, g.r2); }).join(',');
  }
  /* changed cells inside the selection (or the single selected cell) */
  function selectedChanges() {
    var rects = selRects();
    if (!rects.length) { if (!S.sel || S.sel.sheet !== S.sheet) return []; var ch = S.cmp.byKey[key(S.sel.sheet, S.sel.a)]; return ch && !ch.auto ? [ch] : []; }
    return S.cmp.changes.filter(function (c) { return c.sheet === S.sheet && rects.some(function (g) { return inRect(g, c.r, c.c); }); });
  }
  function changesInRange() { return selectedChanges(); }
  function selBlock() {
    var rects = selRects(); if (!rects.length) return '';
    var list = selectedChanges(), pend = list.filter(function (c) { return !S.dec[c.id]; }).length, dis = list.length ? '' : ' disabled';
    var cells = rects.reduce(function (n, g) { return n + (g.r2 - g.r1 + 1) * (g.c2 - g.c1 + 1); }, 0);
    return '<div class="selbox"><b>Selection ' + h(describeSel()) + '</b> <span class="ar">التحديد</span><br>' + cells + ' cell(s) · ' + list.length + ' changed, ' + pend + ' still to review <span class="ar">(' + list.length + ' خلية متغيرة)</span>' +
      '<div class="btnrow"><button class="act accept" id="bSelAccept" type="button"' + dis + '>✔ Keep all <span class="ar">وافق على التحديد</span></button><button class="act reject" id="bSelReject" type="button"' + dis + '>↺ Reject all <span class="ar">ارفض التحديد</span></button><button class="act undo" id="bSelUndo" type="button"' + dis + '>Undo</button></div></div>';
  }
  /* floating action bar next to the sheet: appears whenever the selection contains changed cells */
  function updateSelBar() {
    var bar = $('selbar'), list = S.sheet === '__overview' ? [] : selectedChanges();
    if (!list.length) { bar.hidden = true; return; }
    var pend = list.filter(function (c) { return !S.dec[c.id]; }).length;
    bar.innerHTML = '<span class="n"><b>' + list.length + '</b> changed cell' + (list.length > 1 ? 's' : '') + ' selected · ' + pend + ' to review <span class="ar">محدد</span></span>' +
      '<button class="act accept" data-selbar="accept" type="button">✔ Keep <span class="ar">وافق</span></button><button class="act reject" data-selbar="reject" type="button">↺ Reject <span class="ar">ارفض</span></button>' +
      '<button class="act undo" data-selbar="undo" type="button">Undo</button><button class="act undo" data-selbar="clear" type="button" title="Clear the selection (Esc)">✕</button>';
    bar.hidden = false;
  }
  function selBarAction(act) {
    var list = selectedChanges();
    if (act === 'clear') { clearSelection(); refreshSide(); return; }
    if (!list.length) return;
    if (act === 'undo') { list.forEach(function (c) { var d = S.dec[c.id]; if (d && d.m !== 'custom') delete S.dec[c.id]; }); afterChange(); return; }
    if (list.length === 1) setDec(list[0].sheet, list[0].a, act, null, true); else bulk(list, act);
  }

  /* ---------- side panel ---------- */
  function refreshSide() {
    updateFbar(); updateSelBar();
    var pend = S.counts.pending, er = S.issues.filter(function (i) { return i.sev === 'error'; }).length;
    $('cntChanges').textContent = pend || ''; $('cntChecks').textContent = er || '';
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('on', t.getAttribute('data-tab') === S.tab); });
    var p = $('panel');
    p.innerHTML = S.tab === 'cell' ? panelCell() : S.tab === 'changes' ? panelChanges() : panelChecks();
    var inp = $('custIn'); if (inp && S.focusEdit) { inp.focus(); inp.select(); S.focusEdit = false; }
  }
  function panelCell() {
    if (!S.sel) return '<div class="empty">Click any cell in the sheet to see last week’s value, change it, or fix it.<br><span class="ar">اضغط على أي خلية عشان تشوف قيمة الأسبوع الماضي أو تعدّلها.</span><br><br><small>Keys: N / P next / previous change · I next issue · A keep · R reject</small></div>';
    var sheet = S.sel.sheet, a = S.sel.a, k = key(sheet, a), ch = S.cmp.byKey[k], d = S.dec[k];
    var pc = S.view.prevCell(sheet, a), cc = S.view.curCell(sheet, a), ec = S.view.eff(sheet, a);
    function cellTd(c, wb, extra) { var v = h(showCellVal(c, wb)); if (!v && !(c && c.f != null)) v = '<small>(empty · فاضي)</small>'; return '<td' + (extra || '') + '>' + v + (c && c.f != null ? '<span class="f">=' + h(short(c.f, 160)) + '</span>' : '') + '</td>'; }
    var kinds = { modified: 'Value changed', added: 'New entry', removed: 'Entry removed', formula: 'Formula changed', type: 'Formula ↔ typed value', auto: 'Auto-calculated result' };
    var o = ['<h3>' + h(sheet) + ' ▸ ' + a + '</h3>', selBlock()];
    if (ch) o.push('<p class="hint"><b>' + kinds[ch.kind] + '</b>' + (ch.auto ? ' — recalculated by Excel, no decision needed.' : '') + '</p>');
    else o.push('<p class="hint">No change in this cell this week. You can still edit it. <span class="ar">مفيش تغيير.</span></p>');
    var differs = ch && !ch.auto;
    o.push('<table class="cmp"><tr><th>Last week<br><span class="ar">الماضي</span></th>' + cellTd(pc, S.prev.wb) + '</tr><tr><th>This week<br><span class="ar">الحالي</span></th>' + cellTd(cc, S.cur.wb, differs ? ' class="diffv"' : '') + '</tr>');
    if (d && d.m !== 'accept') o.push('<tr><th>Final<br><span class="ar">النهائي</span></th>' + cellTd(ec, S.cur.wb) + '</tr>');
    o.push('</table>');
    o.push('<div class="btnrow"><button class="act accept' + (d && d.m === 'accept' ? ' on' : '') + '" id="bAccept" type="button"' + (differs ? '' : ' disabled') + '>✔ Keep this week’s <span class="ar">وافق</span></button>' +
      '<button class="act reject' + (d && d.m === 'reject' ? ' on' : '') + '" id="bReject" type="button"' + (differs ? '' : ' disabled') + '>↺ Reject — last week’s <span class="ar">ارفض</span></button>' +
      (d ? '<button class="act undo" id="bUndo" type="button">Undo decision</button>' : '') + '</div>');
    o.push('<h4>Your own value · قيمتك</h4><div class="edit"><input id="custIn" type="text" value="' + h(d && d.m === 'custom' ? d.v : editText(ec, sheet)) + '" aria-label="New value for ' + a + '"><button id="bApply" type="button">Apply</button></div>' +
      '<p class="hint">Type a number, <code>50%</code>, a date <code>22/10/2026</code>, text, or a formula starting with <code>=</code>. Leave empty to clear the cell. <span class="ar">اكتب رقم أو نسبة أو تاريخ أو نص أو معادلة.</span></p><div class="preview" id="custPrev">' + previewText(d && d.m === 'custom' ? d.v : null) + '</div>');
    var is = S.issuesAll.filter(function (i) { return i.sheet === sheet && i.a === a; });
    if (is.length) { o.push('<h4>Checker · الفاحص</h4>'); is.forEach(function (i) { o.push(issueHtml(i, false)); }); }
    return o.join('');
  }
  function issueHtml(i, withLoc) {
    var dis = !!S.dismissed[i.id];
    return '<div class="item' + (dis ? ' dim' : '') + '" data-sheet="' + h(i.sheet) + '" data-a="' + i.a + '" style="' + (dis ? 'opacity:.55' : '') + '"><span class="dot s-' + i.sev + '"></span><div class="body">' +
      (withLoc ? '<span class="loc">' + h(i.sheet) + ' ▸ ' + i.a + '</span> ' : '') + '<span class="msg">' + h(i.en) + '</span><span class="msg ar">' + arHtml(i.ar) + '</span><div class="row">' +
      (i.fix && !dis ? '<button class="mini fix" data-fix="' + h(i.id) + '" type="button">✔ ' + h(i.fix.label) + '</button>' : '') +
      '<button class="mini" data-dismiss="' + h(i.id) + '" type="button">' + (dis ? 'Restore' : 'Ignore') + '</button></div></div></div>';
  }
  var DOT = { pending: 'pending', accept: 'accept', reject: 'reject', custom: 'custom' };
  function listedChanges() { return S.cmp.changes.filter(function (c) { return (S.scope.changes === 'all' || c.sheet === S.sheet) && (!S.pendingOnly || !S.dec[c.id]); }); }
  function panelChanges() {
    var sc = S.scope.changes, list = listedChanges();
    var o = ['<div class="btnrow"><button class="chip' + (sc === 'sheet' ? ' ok' : '') + '" data-scope="sheet" type="button">This sheet</button><button class="chip' + (sc === 'all' ? ' ok' : '') + '" data-scope="all" type="button">All sheets</button>' +
      '<label class="chk"><input type="checkbox" id="optPend"' + (S.pendingOnly ? ' checked' : '') + '> to review only</label></div>',
      '<div class="btnrow"><button class="act accept" data-bulkl="accept" type="button">✔ Keep all listed (' + list.length + ')</button><button class="act reject" data-bulkl="reject" type="button">↺ Reject all listed</button></div>'];
    if (!list.length) { o.push('<div class="empty">' + (S.sheet === '__overview' && sc === 'sheet' ? 'Pick a sheet, or switch to “All sheets”.' : 'No changes here. (مفيش تغييرات)') + '</div>'); return o.join(''); }
    var lastSheet = null;
    list.slice(0, 400).forEach(function (c) {
      var d = S.dec[c.id], st = d ? DOT[d.m === 'custom' ? 'custom' : d.m] : 'pending';
      if (sc === 'all' && c.sheet !== lastSheet) { o.push('<div class="sheetgrp">' + h(c.sheet) + '</div>'); lastSheet = c.sheet; }
      var pv = showCellVal(c.prev, S.prev.wb) || '(empty)', cv = showCellVal(c.cur, S.cur.wb) || '(empty)';
      if (c.prev && c.prev.f != null && c.kind === 'formula') { pv = '=' + c.prev.f; cv = '=' + (c.cur && c.cur.f); }
      var on = S.sel && S.sel.sheet === c.sheet && S.sel.a === c.a;
      o.push('<div class="item' + (on ? ' cur' : '') + '" data-sheet="' + h(c.sheet) + '" data-a="' + c.a + '"><span class="dot ' + st + '"></span><div class="body"><span class="loc">' + c.a + '</span> ' + h(short(pv, 38)) + ' <span class="arrow">→</span> <b>' + h(short(cv, 38)) + '</b>' +
        '<div class="row"><button class="mini fix" data-act="accept" data-k="' + h(c.id) + '" type="button">✔ Keep</button><button class="mini" data-act="reject" data-k="' + h(c.id) + '" type="button">↺ Reject</button></div></div></div>');
    });
    if (list.length > 400) o.push('<p class="hint">Showing the first 400 of ' + list.length + ' changes — use “to review only”, or Accept all in sheet.</p>');
    return o.join('');
  }
  function panelChecks() {
    var sc = S.scope.checks, base = S.showDismissed ? S.issuesAll : S.issues;
    var list = base.filter(function (i) { return sc === 'all' || i.sheet === S.sheet; });
    var e = S.issues.filter(function (i) { return i.sev === 'error'; }).length, w = S.issues.filter(function (i) { return i.sev === 'warn'; }).length;
    var o = ['<p class="hint"><b style="color:var(--red)">' + e + ' errors</b> · <b style="color:#b87400">' + w + ' warnings</b>. Click a finding to jump to the cell; fix it in the sheet or use the quick-fix button. <span class="ar">اضغط على الملاحظة عشان تروح للخلية وتصلحها.</span></p>',
      '<div class="btnrow"><button class="chip' + (sc === 'all' ? ' ok' : '') + '" data-scopec="all" type="button">All sheets</button><button class="chip' + (sc === 'sheet' ? ' ok' : '') + '" data-scopec="sheet" type="button">This sheet</button>' +
      '<label class="chk"><input type="checkbox" id="optDis"' + (S.showDismissed ? ' checked' : '') + '> show ignored</label></div>'];
    if (!list.length) { o.push('<div class="empty">✔ Nothing to flag. <span class="ar">مفيش ملاحظات.</span></div>'); return o.join(''); }
    list.slice(0, 300).forEach(function (i) { o.push(issueHtml(i, true)); });
    if (list.length > 300) o.push('<p class="hint">Showing the first 300 of ' + list.length + '.</p>');
    return o.join('');
  }

  /* ---------- download ---------- */
  function download(name, data, type) {
    var url = URL.createObjectURL(new Blob([data], { type: type })), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  async function downloadReport() {
    var errs = S.issues.filter(function (i) { return i.sev === 'error'; }).length, pend = S.counts.pending;
    if ((errs || pend) && !window.confirm((errs ? errs + ' checker error(s) are still open. ' : '') + (pend ? pend + ' change(s) are not reviewed yet (they stay as in this week’s file). ' : '') + '\n\nDownload anyway?\n(لسه فيه ملاحظات/تغييرات ما اتراجعتش — تنزّل برضه؟)')) return;
    var btn = $('btnDownload'); btn.disabled = true;
    try {
      var out = await Writer.build(JSZip, S.cur.bytes, S.prev.wb, S.cur.wb, S.dec);
      var base = S.cur.name.replace(/\.(xlsx|xlsm)$/i, '');
      download(base + '_reviewed.xlsx', out.bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      toast('Downloaded ' + base + '_reviewed.xlsx — ' + out.patched + ' cell(s) rewritten. (اتنزّل)');
    } catch (e) { console.error(e); toast('Could not build the report: ' + (e.message || e), 8000); }
    btn.disabled = false;
  }

  /* ---------- events ---------- */
  function wire() {
    $('nav').addEventListener('click', function (e) { var b = e.target.closest('button[data-s]'); if (b) showSheet(b.getAttribute('data-s'), !!pointInput() || S.editing); });
    $('nav').addEventListener('mousedown', function (e) { if (pointInput()) e.preventDefault(); });
    $('gridWrap').addEventListener('click', function (e) {
      var bb = e.target.closest('[data-bulk]'); if (bb) { bulkSheet(bb.getAttribute('data-sheet'), bb.getAttribute('data-bulk')); return; }
      var tr = e.target.closest('tr.go'); if (tr) { showSheet(tr.getAttribute('data-s')); return; }
      if (e.target.id === 'ovAccept') { acceptAll(); return; }
      if (e.target.id === 'ovReset') { if (window.confirm('Remove all your decisions and edits?\n(تمسح كل قراراتك وتعديلاتك؟)')) { S.dec = {}; S.dismissed = {}; afterChange(); } return; }
    });
    var drag = false;
    $('gridWrap').addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      var th = e.target.closest('th');
      if (th && !pointInput() && S.sheet !== '__overview') {   /* click a column / row header: select the whole column / row */
        var shh = S.cur.wb.byName[S.sheet], multiH = e.ctrlKey || e.metaKey, ha1, ha2;
        if (th.parentNode.parentNode.tagName === 'THEAD' && th.cellIndex > 0) { ha1 = Xl.addr(th.cellIndex, 1); ha2 = Xl.addr(th.cellIndex, shh.maxR); }
        else if (th.classList.contains('rh') && /^\d+$/.test(th.textContent)) { ha1 = Xl.addr(1, +th.textContent); ha2 = Xl.addr(shh.maxC, +th.textContent); }
        if (ha1) {
          if (multiH && S.sel && S.sel.sheet === S.sheet) S.extra.push(S.range || cellRect(S.sel.a)); else if (!e.shiftKey) S.extra = [];
          S.sel = { sheet: S.sheet, a: ha1 }; setRange(ha1, ha2); S.tab = 'cell'; paintMarks(); refreshSide(); e.preventDefault(); return;
        }
      }
      var td = e.target.closest('td[data-a]'); if (!td) return;
      var a = td.getAttribute('data-a'), pin = pointInput();
      if (pin) { S.pdrag = { sheet: S.sheet, a1: a }; pointInsert(pin, a, a, S.sheet); e.preventDefault(); return; }   /* editing a formula: the click inserts a reference */
      if (e.shiftKey && S.sel && S.sel.sheet === S.sheet) setRange(S.sel.a, a);
      else if ((e.ctrlKey || e.metaKey) && S.sel && S.sel.sheet === S.sheet) {   /* Ctrl+click / Ctrl+drag: add to the selection */
        var pi = Xl.parseAddr(a), idx = -1;
        S.extra.forEach(function (g, i) { if (g.sheet === S.sheet && g.r1 === pi.r && g.r2 === pi.r && g.c1 === pi.c && g.c2 === pi.c) idx = i; });
        if (idx >= 0) { S.extra.splice(idx, 1); S.tab = 'cell'; paintMarks(); refreshSide(); }   /* Ctrl+click on a selected single cell removes it */
        else { S.extra.push(S.range || cellRect(S.sel.a)); S.sel = { sheet: S.sheet, a: a }; S.range = null; drag = true; }
        paintRange();
      }
      else { S.sel = { sheet: S.sheet, a: a }; S.range = null; S.extra = []; drag = true; paintRange(); }
      e.preventDefault();
    });
    $('gridWrap').addEventListener('mouseover', function (e) {
      var td = e.target.closest('td[data-a]');
      if (td && td !== hoverTd) { hoverTd = td; if (!hoverRaf) hoverRaf = requestAnimationFrame(updateHover); }
      if (S.pdrag && td && S.pdrag.sheet === S.sheet) { var pin2 = pointInput(); if (pin2) pointInsert(pin2, S.pdrag.a1, td.getAttribute('data-a'), S.sheet); }
      if (drag && td) { setRange(S.sel.a, td.getAttribute('data-a')); updateRuler(); }
    });
    $('gridWrap').addEventListener('mouseleave', function () { hoverTd = null; updateHover(); });
    $('optRuler').addEventListener('change', function () { updateRuler(); updateHover(); });
    window.addEventListener('resize', function () { updateRuler(); });
    document.addEventListener('mouseup', function () { S.pdrag = null; if (!drag) return; drag = false; S.tab = 'cell'; paintMarks(); refreshSide(); });
    $('gridWrap').addEventListener('click', function (e) { if (e.shiftKey && e.target.closest('td[data-a]')) { S.tab = 'cell'; paintMarks(); refreshSide(); } });
    $('gridWrap').addEventListener('dblclick', function (e) { var td = e.target.closest('td[data-a]'); if (td && !pointInput()) { $('fbIn').focus(); $('fbIn').select(); } });
    document.querySelector('.tabs').addEventListener('click', function (e) { var t = e.target.closest('.tab'); if (t) { S.tab = t.getAttribute('data-tab'); refreshSide(); } });
    $('panel').addEventListener('click', function (e) {
      var t = e.target;
      var fix = t.closest('[data-fix]'), dis = t.closest('[data-dismiss]'), act = t.closest('[data-act]'), sc = t.closest('[data-scope]'), scc = t.closest('[data-scopec]');
      if (fix) { var iss = S.issuesAll.filter(function (i) { return i.id === fix.getAttribute('data-fix'); })[0]; if (iss && iss.fix) { setDec(iss.sheet, iss.a, 'custom', iss.fix.text); toast('Fixed ' + iss.sheet + ' ▸ ' + iss.a); } return; }
      if (dis) { var id = dis.getAttribute('data-dismiss'); if (S.dismissed[id]) delete S.dismissed[id]; else S.dismissed[id] = 1; afterChange(); return; }
      if (act) { var ch = S.cmp.byKey[act.getAttribute('data-k')]; setDec(ch.sheet, ch.a, act.getAttribute('data-act'), null, false); return; }
      var bl = t.closest('[data-bulkl]');
      if (bl) { var ls = listedChanges(); if (!ls.length) return; if (bl.getAttribute('data-bulkl') === 'reject' && !window.confirm('Reject all ' + ls.length + ' listed change(s)?\n(ترفض كل التغييرات المعروضة؟)')) return; bulk(ls, bl.getAttribute('data-bulkl')); return; }
      if (sc) { S.scope.changes = sc.getAttribute('data-scope'); refreshSide(); return; }
      if (scc) { S.scope.checks = scc.getAttribute('data-scopec'); refreshSide(); return; }
      if (t.id === 'optPend') { S.pendingOnly = t.checked; refreshSide(); return; }
      if (t.id === 'optDis') { S.showDismissed = t.checked; refreshSide(); return; }
      if (t.closest('#bSelAccept')) return bulk(changesInRange(), 'accept');
      if (t.closest('#bSelReject')) return bulk(changesInRange(), 'reject');
      if (t.closest('#bSelUndo')) { changesInRange().forEach(function (c) { var d = S.dec[c.id]; if (d && d.m !== 'custom') delete S.dec[c.id]; }); afterChange(); return; }
      var sel = S.sel;
      if (t.closest('#bAccept')) return setDec(sel.sheet, sel.a, 'accept', null, true);
      if (t.closest('#bReject')) return setDec(sel.sheet, sel.a, 'reject', null, true);
      if (t.closest('#bUndo')) return setDec(sel.sheet, sel.a, null);
      if (t.closest('#bApply')) return applyCustom();
      var item = t.closest('.item[data-a]');
      if (item && !t.closest('button')) selectCell(item.getAttribute('data-sheet'), item.getAttribute('data-a'));
    });
    $('panel').addEventListener('input', function (e) { if (e.target.id === 'custIn') $('custPrev').innerHTML = previewText(e.target.value); });
    $('panel').addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.id === 'custIn') applyCustom(); });
    $('selbar').addEventListener('click', function (e) { var b = e.target.closest('[data-selbar]'); if (b) selBarAction(b.getAttribute('data-selbar')); });
    $('selbar').addEventListener('mousedown', function (e) { e.preventDefault(); });
    $('btnNextCh').addEventListener('click', function () { jump(S.cmp.changes, 1); });
    $('btnPrevCh').addEventListener('click', function () { jump(S.cmp.changes, -1); });
    $('btnNextIss').addEventListener('click', function () { jump(S.issues, 1); });
    $('btnAcceptSheet').addEventListener('click', function () { bulkSheet(S.sheet, 'accept'); });
    $('btnRejectSheet').addEventListener('click', function () { bulkSheet(S.sheet, 'reject'); });
    $('optAuto').addEventListener('change', function () { $('gridWrap').classList.toggle('noauto', !this.checked); });
    $('optIssues').addEventListener('change', function () { $('gridWrap').classList.toggle('noiss', !this.checked); });
    $('btnDownload').addEventListener('click', downloadReport);
    $('btnLog').addEventListener('click', function () { download(S.cur.name.replace(/\.(xlsx|xlsm)$/i, '') + '_change_log.csv', Writer.changeLog(S.cmp, S.dec, S.view, S.cur.wb.styles), 'text/csv;charset=utf-8'); });
    $('btnReset').addEventListener('click', function () { if (window.confirm('Close this comparison and choose new files?\n(الجلسة بتتحفظ تلقائيًا لنفس الملفين)')) location.reload(); });
    document.addEventListener('keydown', function (e) {
      if (!$('app').hidden && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName || '') && S.sheet !== '__overview') {   /* Ctrl+A: select the whole sheet */
        var sha = S.cur.wb.byName[S.sheet]; if (!S.sel || S.sel.sheet !== S.sheet) S.sel = { sheet: S.sheet, a: 'A1' };
        S.extra = []; setRange('A1', Xl.addr(sha.maxC, sha.maxR)); S.tab = 'cell'; paintMarks(); refreshSide(); e.preventDefault(); return;
      }
      if ($('app').hidden || /INPUT|TEXTAREA|SELECT/.test((e.target.tagName || '')) || e.ctrlKey || e.metaKey || e.altKey) return;
      var k = e.key.toLowerCase();
      if (S.sheet !== '__overview' && S.sel && S.sel.sheet === S.sheet) {
        var mv = { arrowup: [-1, 0], arrowdown: [1, 0], arrowleft: [0, -1], arrowright: [0, 1], tab: [0, e.shiftKey ? -1 : 1] }[k];
        if (mv) { moveSel(mv[0], mv[1], e.shiftKey && k !== 'tab'); e.preventDefault(); return; }
        if (k === 'f2' || k === 'enter') { $('fbIn').focus(); $('fbIn').select(); e.preventDefault(); return; }
      }
      if (k === 'n') jump(S.cmp.changes, 1); else if (k === 'p') jump(S.cmp.changes, -1); else if (k === 'i') jump(S.issues, 1);
      else if ((k === 'a' || k === 'r') && selRects().length && selectedChanges().length) bulk(selectedChanges(), k === 'a' ? 'accept' : 'reject');
      else if (k === 'escape' && (S.range || S.extra.length)) { clearSelection(); refreshSide(); }
      else if ((k === 'a' || k === 'r') && S.sel && S.cmp.byKey[key(S.sel.sheet, S.sel.a)] && !S.cmp.byKey[key(S.sel.sheet, S.sel.a)].auto) setDec(S.sel.sheet, S.sel.a, k === 'a' ? 'accept' : 'reject', null, true);
      else return;
      e.preventDefault();
    });
  }
  /* ----- Excel-style bar: name box, formula bar, point mode, keyboard ----- */
  function pointInput() {
    var ae = document.activeElement;
    return ae && (ae.id === 'fbIn' || ae.id === 'custIn') && /^\s*=/.test(ae.value) && S.edit ? ae : null;
  }
  function qsheet(n) { return /^[A-Za-z_][\w.]*$/.test(n) ? n : "'" + n.replace(/'/g, "''") + "'"; }
  function pointInsert(inp, a1, a2, sheet) {
    var ref = (a1 === a2 ? a1 : a1 + ':' + a2);
    if (sheet !== S.edit.sheet) ref = qsheet(sheet) + '!' + ref;
    var st = inp.selectionStart, en = inp.selectionEnd;
    if (S.pt && S.pt.inp === inp && st === S.pt.end && en === S.pt.end) st = S.pt.start;   /* dragging replaces the reference just inserted */
    inp.value = inp.value.slice(0, st) + ref + inp.value.slice(en);
    var pos = st + ref.length; inp.setSelectionRange(pos, pos);
    S.pt = { inp: inp, start: st, end: pos };
    paintPoint(sheet, a1, a2);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function paintPoint(sheet, a1, a2) {
    var wrap = $('gridWrap');
    wrap.querySelectorAll('td.pt').forEach(function (t) { t.classList.remove('pt'); });
    if (!a1 || sheet !== S.sheet) return;
    var p = Xl.parseAddr(a1), q = Xl.parseAddr(a2), r1 = Math.min(p.r, q.r), r2 = Math.max(p.r, q.r), c1 = Math.min(p.c, q.c), c2 = Math.max(p.c, q.c);
    wrap.querySelectorAll('td[data-a]').forEach(function (t) { var x = Xl.parseAddr(t.getAttribute('data-a')); if (x.r >= r1 && x.r <= r2 && x.c >= c1 && x.c <= c2) t.classList.add('pt'); });
  }
  function updateFbar() {
    var ov = S.sheet === '__overview'; $('fbar').hidden = ov; if (ov) return;
    var nb = $('nameBox'), fi = $('fbIn');
    if (document.activeElement !== nb) nb.value = describeSel();
    if (!S.editing && document.activeElement.id !== 'custIn') {
      fi.disabled = !S.sel; fi.value = S.sel ? editText(S.view.eff(S.sel.sheet, S.sel.a), S.sel.sheet) : ''; $('fbRes').innerHTML = '';
    }
  }
  function moveSel(dr, dc, extend) {
    var sh = S.cur.wb.byName[S.sheet], base = extend && S.range ? Xl.parseAddr(S.rangeEnd) : Xl.parseAddr(S.sel.a), r = base.r, c = base.c, a;
    for (var i = 0; i < 60; i++) {
      r = Math.min(Math.max(1, r + dr), sh.maxR); c = Math.min(Math.max(1, c + dc), sh.maxC); a = Xl.addr(c, r);
      if ($('gridWrap').querySelector('td[data-a="' + a + '"]')) break;
    }
    var td = $('gridWrap').querySelector('td[data-a="' + a + '"]'); if (!td) return;
    if (extend) { setRange(S.sel.a, a); S.tab = 'cell'; updateRuler(); refreshSide(); td.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    else selectCell(S.sheet, a, 'nearest');
  }
  function wireBar() {
    var fi = $('fbIn'), nb = $('nameBox');
    document.addEventListener('focusin', function (e) {
      var id = e.target.id;
      if ((id === 'fbIn' || id === 'custIn') && S.sel) { S.edit = { sheet: S.sel.sheet, a: S.sel.a }; S.pt = null; if (id === 'fbIn') S.editing = true; }
    });
    document.addEventListener('focusout', function (e) {
      var id = e.target.id;
      if (id === 'fbIn') S.editing = false;
      if (id === 'fbIn' || id === 'custIn') paintPoint(null);
    });
    fi.addEventListener('input', function () { $('fbRes').innerHTML = S.edit ? previewText(fi.value) : ''; });
    fi.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var t = S.edit; if (!t) return;
        e.preventDefault(); paintPoint(null);
        if (fi.value !== editText(S.view.eff(t.sheet, t.a), t.sheet)) applyCustom(t, fi.value);
        S.editing = false; fi.blur(); updateFbar();
        var p = Xl.parseAddr(t.a); selectCell(t.sheet, Xl.addr(p.c, p.r + 1), 'nearest');
      } else if (e.key === 'Escape') { S.editing = false; paintPoint(null); fi.blur(); updateFbar(); }
    });
    nb.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var parts = nb.value.split(','), items = parts.map(function (x) { return /^\s*\$?([A-Za-z]+)\$?(\d+)(?::\$?([A-Za-z]+)\$?(\d+))?\s*$/.exec(x); });
      if (S.sheet === '__overview' || !items.length || items.some(function (m) { return !m; })) { toast('Type a cell like B5, a range like B5:C9, or several separated by commas: B5,B8:C9. (اكتب خلية أو نطاق)'); return; }
      var firstM = items[0], a1 = (firstM[1] + firstM[2]).toUpperCase();
      selectCell(S.sheet, a1, true);
      items.slice(1).forEach(function (m) { S.extra.push(rectOfAddrs((m[1] + m[2]).toUpperCase(), m[3] ? (m[3] + m[4]).toUpperCase() : (m[1] + m[2]).toUpperCase())); });
      if (firstM[3]) setRange(a1, (firstM[3] + firstM[4]).toUpperCase());
      S.tab = 'cell'; paintMarks(); refreshSide();
      nb.blur();
    });
    $('zoom').addEventListener('change', applyZoom);
  }
  function applyZoom() { var t = $('gridWrap').querySelector('table.sheet'); if (t) { t.style.zoom = $('zoom').value; updateRuler(); } }

  /* what the typed text will become: the result of a formula, or the type Excel will give it */
  function previewText(text) {
    var sel = S.sel; if (!sel || text == null || text === '') return '';
    var c = S.view.evalText(sel.sheet, sel.a, text);
    if (!c) return 'Empty — the cell will be cleared. <span class="ar">الخلية هتتفضّى.</span>';
    var shown = c.k === '' ? '' : '<b>' + h(fmtTyped(c)) + '</b>';
    if (c.f != null) {
      if (c.syntax) return '<span class="bad">⚠ This formula could not be read — check brackets, commas and quotes.</span>';
      if (c.unsupported) return '<span class="warn">⚠ ' + h(c.fn) + ' is not calculated in this preview. The formula is saved and Excel calculates it when you open the file.</span>';
      return 'Result · النتيجة: ' + shown;
    }
    return 'Saved as ' + (c.k === 'n' ? (Xl.isDateCell({ k: 'n', v: c.v, s: c.s }, S.cur.wb.styles) || c.date ? 'date' : 'number') : c.k === 'b' ? 'TRUE/FALSE' : 'text') + ': ' + shown;
  }
  function applyCustom(target, text) {
    var sel = target || S.sel, v = text != null ? text : $('custIn').value, base = S.view.curCell(sel.sheet, sel.a);
    if (v === editText(base, sel.sheet) && !S.dec[key(sel.sheet, sel.a)]) { toast('Same value as this week — nothing to apply. (نفس القيمة)'); return; }
    var pv = /^\s*=./.test(v) ? S.view.evalText(sel.sheet, sel.a, v) : null;
    if (pv && pv.syntax && !window.confirm('The preview cannot read this formula. If it is not valid Excel syntax, Excel may repair the file when you open it.\nSave it anyway?\n(المعادلة مش مفهومة للمعاينة — تحفظها برضه؟)')) return;
    setDec(sel.sheet, sel.a, 'custom', v);
    toast('Saved your value for ' + sel.a + '. Download the report to get it in the file. (اتحفظت)');
  }

  wireDrop(); wire(); wireBar();
})();

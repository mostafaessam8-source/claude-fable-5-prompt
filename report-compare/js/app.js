/* Report Compare — the page. Upload last week's and this week's report, review every change (keep / reject / edit),
 * fix what the checker flags, download the reviewed report. Everything runs in the browser. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var S = {
    slots: { prev: null, cur: null }, prev: null, cur: null, cmp: null, dec: {}, dismissed: {}, view: null, issues: [], issueMap: {},
    sheet: '__overview', sel: null, range: null, tab: 'cell', scope: { changes: 'sheet', checks: 'all' }, pendingOnly: false, showDismissed: false, session: ''
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
      if (f.sz && f.sz !== 11) css.push('font-size:' + Math.min(30, Math.round(f.sz * 1.18)) + 'px');
      var al = x.h === 'centerContinuous' ? 'center' : (x.h === 'general' ? '' : x.h);
      if (al) css.push('text-align:' + al);
      if (x.v) css.push('vertical-align:' + (x.v === 'center' ? 'middle' : x.v));
      if (x.indent) css.push('padding-left:' + (4 + x.indent * 9) + 'px');
      ['left', 'right', 'top', 'bottom'].forEach(function (s) { var b = x.border && x.border[s]; if (b) css.push('border-' + s + ':' + (BORDER[b.style] || '1px solid') + ' ' + b.color); });
    }
    return (xfCache[i] = css.join(';'));
  }
  function displayCell(sheet, a) {
    var ec = S.view.eff(sheet, a);
    if (!ec) return '';
    var cc = S.cur.wb.byName[sheet].cells.get(a);
    return Xl.formatCell({ k: ec.k, v: ec.v, s: cc ? cc.s : 0 }, S.cur.wb.styles);
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
    for (c = 1; c <= sh.maxC; c++) w[c] = Math.round(sh.defW * 7 + 5);
    sh.cols.forEach(function (d) { for (c = d.min; c <= Math.min(d.max, sh.maxC); c++) w[c] = d.hidden ? 0 : Math.round(d.w * 7 + 5); });
    return w;
  }
  function renderGrid(name) {
    var sh = S.cur.wb.byName[name], w = colPx(sh), out = [], r, c;
    var top = {}, covered = {};
    sh.merges.forEach(function (g) {
      top[Xl.addr(g.c1, g.r1)] = g;
      for (var rr = g.r1; rr <= g.r2; rr++) for (var cc = g.c1; cc <= g.c2; cc++) if (rr !== g.r1 || cc !== g.c1) covered[Xl.addr(cc, rr)] = true;
    });
    out.push('<table class="sheet"><colgroup><col style="width:44px">');
    for (c = 1; c <= sh.maxC; c++) out.push(w[c] ? '<col style="width:' + w[c] + 'px">' : '<col style="width:0">');
    out.push('</colgroup><thead><tr><th class="rh"></th>');
    for (c = 1; c <= sh.maxC; c++) if (w[c]) out.push('<th>' + Xl.numToCol(c) + '</th>'); else out.push('<th style="width:0;padding:0;border:0"></th>');
    out.push('</tr></thead><tbody>');
    for (r = 1; r <= sh.maxR; r++) {
      var ri = sh.rows.get(r);
      if (ri && ri.hidden) continue;
      var ht = Math.round(((ri && ri.ht) || sh.defH) * 4 / 3);
      out.push('<tr style="height:' + ht + 'px"><th class="rh">' + r + '</th>');
      for (c = 1; c <= sh.maxC; c++) {
        var a = Xl.addr(c, r);
        if (covered[a] || !w[c]) { if (!w[c]) out.push('<td style="padding:0;border:0"></td>'); continue; }
        var cell = sh.cells.get(a), xf = S.cur.wb.styles.xfs[cell ? cell.s : 0];
        var g = top[a], span = g ? ' colspan="' + (g.c2 - g.c1 + 1) + '" rowspan="' + (g.r2 - g.r1 + 1) + '"' : '';
        var ec = S.view.eff(name, a), txt = ec ? displayCell(name, a) : '';
        var num = ec && ec.k === 'n' && !(xf && xf.h && xf.h !== 'general');
        out.push('<td data-a="' + a + '"' + span + (xf && xf.wrap ? ' class="wrap"' : '') + ' style="' + xfCss(cell ? cell.s : 0) + (num ? ';text-align:right' : '') + '">' + h(txt) + '</td>');
      }
      out.push('</tr>');
    }
    out.push('</tbody></table>');
    return out.join('');
  }
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
  function paintMarks() {
    if (S.sheet === '__overview') return;
    var name = S.sheet, tds = $('gridWrap').querySelectorAll('td[data-a]');
    for (var i = 0; i < tds.length; i++) {
      var td = tds[i], a = td.getAttribute('data-a'), k = key(name, a), nc = cls(name, a);
      if (td.className.replace('wrap', '').trim() !== nc) td.className = (td.classList.contains('wrap') ? 'wrap ' : '') + nc;
      if (S.cmp.byKey[k] || S.dec[k]) { var t = displayCell(name, a); if (td.textContent !== t) td.textContent = t; }
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
      out.push('<button type="button" data-s="' + h(sh.name) + '" class="' + (on ? 'on ' : '') + (sh.state !== 'visible' ? 'hid' : '') + '" title="' + h(sh.name) + (sh.state !== 'visible' ? ' (hidden sheet)' : '') + '"><span class="nm">' + h(sh.name) + '</span>' +
        (st.pending ? '<span class="pill ch" title="changes to review">' + st.pending + '</span>' : (st.changes ? '<span class="pill ok" title="all reviewed">✓</span>' : '')) +
        (st.err ? '<span class="pill er" title="checker errors">' + st.err + '</span>' : '') + (st.warn ? '<span class="pill wr" title="checker warnings">' + st.warn + '</span>' : '') + '</button>');
    });
    $('nav').innerHTML = out.join('');
  }
  function showSheet(name, keepSel) {
    S.sheet = name; S.range = null;
    if (!keepSel) S.sel = null;
    renderNav();
    var wrap = $('gridWrap'), isOv = name === '__overview';
    $('sheetTitle').innerHTML = isOv ? 'Overview <span class="ar">ملخص المراجعة</span>' : h(name);
    ['btnPrevCh', 'btnNextCh', 'btnNextIss', 'btnAcceptSheet', 'btnRejectSheet'].forEach(function (id) { $(id).hidden = isOv && /Sheet/.test(id); });
    $('legend').hidden = isOv;
    if (isOv) { wrap.className = 'grid-wrap'; wrap.innerHTML = renderOverview(); }
    else {
      wrap.innerHTML = renderGrid(name);
      wrap.className = 'grid-wrap' + ($('optAuto').checked ? '' : ' noauto') + ($('optIssues').checked ? '' : ' noiss');
      paintMarks();
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
    S.range = null;
    if (S.sheet !== sheet) { S.sel = { sheet: sheet, a: a }; showSheet(sheet, true); }
    else { S.sel = { sheet: sheet, a: a }; paintMarks(); refreshSide(); }
    if (scroll !== false) {
      var td = $('gridWrap').querySelector('td[data-a="' + a + '"]');
      if (td) td.scrollIntoView({ block: 'center', inline: 'center' });
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
  function inRange(sheet, a) {
    var g = S.range; if (!g || g.sheet !== sheet) return false;
    var p = Xl.parseAddr(a); return p.r >= g.r1 && p.r <= g.r2 && p.c >= g.c1 && p.c <= g.c2;
  }
  function setRange(a1, a2) {
    var p = Xl.parseAddr(a1), q = Xl.parseAddr(a2);
    S.range = (a1 === a2) ? null : { sheet: S.sheet, r1: Math.min(p.r, q.r), r2: Math.max(p.r, q.r), c1: Math.min(p.c, q.c), c2: Math.max(p.c, q.c) };
    paintRange();
  }
  function paintRange() {
    var tds = $('gridWrap').querySelectorAll('td[data-a]');
    for (var i = 0; i < tds.length; i++) tds[i].classList.toggle('rng', inRange(S.sheet, tds[i].getAttribute('data-a')));
  }
  function changesInRange() {
    var g = S.range; if (!g || g.sheet !== S.sheet) return [];
    return S.cmp.changes.filter(function (c) { return c.sheet === g.sheet && c.r >= g.r1 && c.r <= g.r2 && c.c >= g.c1 && c.c <= g.c2; });
  }
  function selBlock() {
    var g = S.range; if (!g || g.sheet !== S.sheet) return '';
    var list = changesInRange(), pend = list.filter(function (c) { return !S.dec[c.id]; }).length, dis = list.length ? '' : ' disabled';
    return '<div class="selbox"><b>Selection ' + Xl.addr(g.c1, g.r1) + ':' + Xl.addr(g.c2, g.r2) + '</b> <span class="ar">التحديد</span><br>' + list.length + ' changed cell(s), ' + pend + ' still to review <span class="ar">(' + list.length + ' خلية متغيرة)</span>' +
      '<div class="btnrow"><button class="act accept" id="bSelAccept" type="button"' + dis + '>✔ Keep all <span class="ar">وافق على التحديد</span></button><button class="act reject" id="bSelReject" type="button"' + dis + '>↺ Reject all <span class="ar">ارفض التحديد</span></button><button class="act undo" id="bSelUndo" type="button"' + dis + '>Undo</button></div></div>';
  }

  /* ---------- side panel ---------- */
  function refreshSide() {
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
      '<p class="hint">Type a number, <code>50%</code>, a date <code>22/10/2026</code>, text, or a formula starting with <code>=</code>. Leave empty to clear the cell. <span class="ar">اكتب رقم أو نسبة أو تاريخ أو نص أو معادلة.</span></p>');
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
    $('nav').addEventListener('click', function (e) { var b = e.target.closest('button[data-s]'); if (b) showSheet(b.getAttribute('data-s')); });
    $('gridWrap').addEventListener('click', function (e) {
      var bb = e.target.closest('[data-bulk]'); if (bb) { bulkSheet(bb.getAttribute('data-sheet'), bb.getAttribute('data-bulk')); return; }
      var tr = e.target.closest('tr.go'); if (tr) { showSheet(tr.getAttribute('data-s')); return; }
      if (e.target.id === 'ovAccept') { acceptAll(); return; }
      if (e.target.id === 'ovReset') { if (window.confirm('Remove all your decisions and edits?\n(تمسح كل قراراتك وتعديلاتك؟)')) { S.dec = {}; S.dismissed = {}; afterChange(); } return; }
    });
    var drag = false;
    $('gridWrap').addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      var td = e.target.closest('td[data-a]'); if (!td) return;
      var a = td.getAttribute('data-a');
      if (e.shiftKey && S.sel && S.sel.sheet === S.sheet) setRange(S.sel.a, a);
      else { S.sel = { sheet: S.sheet, a: a }; S.range = null; drag = true; }
      e.preventDefault();
    });
    $('gridWrap').addEventListener('mouseover', function (e) { if (!drag) return; var td = e.target.closest('td[data-a]'); if (td) setRange(S.sel.a, td.getAttribute('data-a')); });
    document.addEventListener('mouseup', function () { if (!drag) return; drag = false; S.tab = 'cell'; paintMarks(); refreshSide(); });
    $('gridWrap').addEventListener('click', function (e) { if (e.shiftKey && e.target.closest('td[data-a]')) { S.tab = 'cell'; paintMarks(); refreshSide(); } });
    $('gridWrap').addEventListener('dblclick', function (e) { var td = e.target.closest('td[data-a]'); if (td) { S.tab = 'cell'; S.focusEdit = true; refreshSide(); } });
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
    $('panel').addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.id === 'custIn') applyCustom(); });
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
      if ($('app').hidden || /INPUT|TEXTAREA|SELECT/.test((e.target.tagName || '')) || e.ctrlKey || e.metaKey || e.altKey) return;
      var k = e.key.toLowerCase();
      if (k === 'n') jump(S.cmp.changes, 1); else if (k === 'p') jump(S.cmp.changes, -1); else if (k === 'i') jump(S.issues, 1);
      else if ((k === 'a' || k === 'r') && S.range && changesInRange().length) bulk(changesInRange(), k === 'a' ? 'accept' : 'reject');
      else if ((k === 'a' || k === 'r') && S.sel && S.cmp.byKey[key(S.sel.sheet, S.sel.a)] && !S.cmp.byKey[key(S.sel.sheet, S.sel.a)].auto) setDec(S.sel.sheet, S.sel.a, k === 'a' ? 'accept' : 'reject', null, true);
      else return;
      e.preventDefault();
    });
  }
  function applyCustom() {
    var sel = S.sel, v = $('custIn').value, base = S.view.curCell(sel.sheet, sel.a);
    if (v === editText(base, sel.sheet) && !S.dec[key(sel.sheet, sel.a)]) { toast('Same value as this week — nothing to apply. (نفس القيمة)'); return; }
    setDec(sel.sheet, sel.a, 'custom', v);
    toast('Saved your value for ' + sel.a + '. Download the report to get it in the file. (اتحفظت)');
  }

  wireDrop(); wire();
})();

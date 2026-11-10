/* Report Compare — the parts that make the sheet feel like Excel:
 *  - edit IN the cell: type to start, F2 / double-click to edit, Enter / Tab / arrows / Esc, Alt+Enter for a new line, formula references by clicking
 *  - Delete clears, Enter moves down
 *  - drag a column / row header border to resize it (double-click = AutoFit)
 *  - right-click menu on cells and headers
 *  - Format Cells (Ctrl+1)
 * Everything goes through the same undo / save / redraw path as the ribbon commands. */
(function () {
  'use strict';
  var RC = window.RC, E = window.Edit, S = RC.S, Fmt = window.Fmt, Xl = window.Xl, $ = RC.$, h = RC.h, key = RC.key;
  var ED = null;                       // the open in-cell editor: { sheet, a, mode: 'enter' | 'edit', el, orig }

  function fitHeader() { var hd = document.querySelector('header.top'); if (hd) document.documentElement.style.setProperty('--topH', hd.offsetHeight + 'px'); }
  fitHeader(); window.addEventListener('resize', fitHeader); setTimeout(fitHeader, 300);
  if (window.ResizeObserver) { var hd0 = document.querySelector('header.top'); if (hd0) new ResizeObserver(fitHeader).observe(hd0); }
  function setMode(t) { var m = $('modeInd'); if (m) m.textContent = t; }
  function inInput(t) { return /INPUT|TEXTAREA|SELECT/.test((t && t.tagName) || ''); }

  /* ================= the in-cell editor ================= */
  E.isEditing = function () { return !!ED; };
  var measureCtx = document.createElement('canvas').getContext('2d');
  function place() {
    if (!ED) return;
    var t = RC.tdOf(ED.a); if (!t) { cancel(); return; }
    var wrap = $('gridWrap'), wr = wrap.getBoundingClientRect(), q = t.getBoundingClientRect(), cs = getComputedStyle(t), z = (S.zoom || 100) / 100, el = ED.el;
    var fs = parseFloat(cs.fontSize) * z, font = (cs.fontStyle === 'italic' ? 'italic ' : '') + (cs.fontWeight >= 600 || cs.fontWeight === 'bold' ? 'bold ' : '') + fs + 'px ' + cs.fontFamily;
    el.style.fontFamily = cs.fontFamily; el.style.fontSize = fs + 'px'; el.style.fontWeight = cs.fontWeight; el.style.fontStyle = cs.fontStyle; el.style.color = cs.color === 'rgba(0, 0, 0, 0)' ? '#000' : cs.color;
    el.style.textAlign = /center|right/.test(cs.textAlign) ? cs.textAlign : 'left';
    measureCtx.font = font;
    var lines = el.value.split('\n'), tw = 0; lines.forEach(function (l) { tw = Math.max(tw, measureCtx.measureText(l).width); });
    var width = Math.max(q.width + 1, tw + 16), maxW = wrap.clientWidth - (q.left - wr.left) + wrap.scrollLeft - 20;
    var height = Math.max(q.height + 1, lines.length * fs * 1.25 + 6);
    el.style.left = (q.left - wr.left + wrap.scrollLeft - 1) + 'px'; el.style.top = (q.top - wr.top + wrap.scrollTop - 1) + 'px';
    el.style.width = Math.min(width, Math.max(q.width, maxW)) + 'px'; el.style.height = height + 'px';
  }
  function mirror() {   // the formula bar shows what is typed in the cell, with the result preview
    var fi = $('fbIn'); if (!ED) return;
    fi.value = ED.el.value; fi.disabled = false; $('fbRes').innerHTML = RC.previewText(ED.el.value);
  }
  E.startEdit = function (mode, init) {
    if (ED || !S.sel || S.sheet === '__overview' || S.sel.sheet !== S.sheet) return;
    var a = S.sel.a, t = RC.tdOf(a);
    if (!t) return;
    var ec = S.view.eff(S.sheet, a), orig = RC.editText(ec, S.sheet), el = document.createElement('textarea');
    el.id = 'cellEd'; el.className = 'celled'; el.spellcheck = false; el.rows = 1; el.wrap = 'off'; el.value = init != null ? init : orig; el.setAttribute('aria-label', 'Cell ' + a);
    $('gridWrap').appendChild(el);
    ED = { sheet: S.sheet, a: a, mode: mode, el: el, orig: orig };
    S.edit = { sheet: S.sheet, a: a }; S.editing = true; S.pt = null;
    place(); el.focus(); el.setSelectionRange(el.value.length, el.value.length);
    setMode(mode === 'enter' ? 'Enter' : 'Edit'); mirror();
    el.addEventListener('input', function () { place(); mirror(); updateMode(); });
    el.addEventListener('keydown', editorKey);
    el.addEventListener('click', updateMode); el.addEventListener('keyup', updateMode);
  };
  function updateMode() { if (!ED) return; setMode(RC.pointInput() ? 'Point' : ED.mode === 'enter' ? 'Enter' : 'Edit'); }
  function close() {
    if (!ED) return;
    var el = ED.el; ED = null; S.editing = false; if (el.parentNode) el.parentNode.removeChild(el);
    RC.paintPoint(null); setMode('Ready');
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  }
  function commit(move) {
    var d = ED; if (!d) return;
    var v = d.el.value; close();
    if (v !== d.orig || S.dec[key(d.sheet, d.a)]) RC.applyCustom({ sheet: d.sheet, a: d.a }, v, true);
    if (move && S.sel && S.sel.sheet === S.sheet) RC.moveSel(move.dr, move.dc, false);
  }
  function cancel() { if (!ED) return; close(); RC.refreshSide(); }
  E.commitEditor = function () { commit(null); };
  E.cancelEditor = cancel;
  function editorKey(e) {
    var el = ED.el, k = e.key;
    if (k === 'Enter') {
      if (e.altKey) { e.preventDefault(); var p = el.selectionStart; el.value = el.value.slice(0, p) + '\n' + el.value.slice(el.selectionEnd); el.setSelectionRange(p + 1, p + 1); place(); mirror(); return; }
      e.preventDefault(); commit({ dr: e.shiftKey ? -1 : 1, dc: 0 }); return;
    }
    if (k === 'Tab') { e.preventDefault(); commit({ dr: 0, dc: e.shiftKey ? -1 : 1 }); return; }
    if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); return; }
    if (k === 'F2') { e.preventDefault(); ED.mode = ED.mode === 'enter' ? 'edit' : 'enter'; updateMode(); return; }
    // in Enter mode the arrow keys finish the entry and move (not while a formula is being built)
    if (ED.mode === 'enter' && !/^\s*=/.test(el.value) && !e.shiftKey && !e.ctrlKey && !e.altKey) {
      var mv = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k];
      if (mv) { e.preventDefault(); commit({ dr: mv[0], dc: mv[1] }); return; }
    }
    if (e.ctrlKey || e.metaKey) { var kk = k.toLowerCase(); if (kk === 'b' || kk === 'i' || kk === 'u') { e.preventDefault(); commit(null); E.toggle(kk); } }
  }
  // typing in the formula bar while the cell editor is open keeps the two in step; Enter / Esc there finish the edit
  $('fbIn').addEventListener('input', function () { if (ED) { ED.el.value = $('fbIn').value; place(); } });
  document.addEventListener('keydown', function (e) {
    if (!ED || e.target.id !== 'fbIn') return;
    if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); ED.el.value = $('fbIn').value; $('fbIn').blur(); commit({ dr: 1, dc: 0 }); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); $('fbIn').blur(); cancel(); }
  }, true);
  // clicking anywhere else finishes the entry (a click on a cell while a formula is being built adds a reference instead)
  document.addEventListener('mousedown', function (e) {
    if (!ED) return;
    var t = e.target;
    if (t.id === 'cellEd' || t.id === 'fbIn' || t.id === 'nameBox' && false) return;
    if ($('gridWrap').contains(t) && RC.pointInput()) return;            // point mode: app.js inserts the reference
    if (t.closest && t.closest('.ctxmenu, .dlg-back')) return;
    commit(null);
  }, true);
  $('gridWrap').addEventListener('scroll', function () { if (ED) place(); });
  window.addEventListener('resize', function () { if (ED) place(); });

  /* ---------- keyboard on the sheet: type to edit, Delete, Backspace, Ctrl+1 ---------- */
  document.addEventListener('keydown', function (e) {
    if ($('app').hidden || ED || e.defaultPrevented || S.sheet === '__overview' || !S.sel || S.sel.sheet !== S.sheet) return;
    if (inInput(e.target) || (e.target.closest && e.target.closest('.dlg, .ctxmenu'))) return;
    var ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key === '1') { e.preventDefault(); E.formatCellsDialog(); return; }
    if (ctrl || e.altKey) return;
    if (e.key === 'Delete') { e.preventDefault(); E.clear('contents'); return; }
    if (e.key === 'Backspace') { e.preventDefault(); E.startEdit('enter', ''); return; }
    if (e.key.length === 1) { e.preventDefault(); E.startEdit('enter', e.key); }    // any printable key starts typing in the cell, like Excel
    else if (e.key === 'Process' || e.key === 'Unidentified' || e.key === 'Dead') E.startEdit('enter', '');   // an input method (IME / dead key): the editor takes the composition
  });

  /* ================= resize a row / column by dragging its header border ================= */
  var rs = null;
  function nearEdge(th, e) {
    var r = th.getBoundingClientRect(), head = th.parentNode.parentNode.tagName === 'THEAD';
    if (head && th.cellIndex > 0) return Math.abs(r.right - e.clientX) <= 4 ? { kind: 'col', idx: th.cellIndex, px: r.width / ((S.zoom || 100) / 100) } : null;
    if (!head && th.classList.contains('rh') && /^\d+$/.test(th.textContent)) return Math.abs(r.bottom - e.clientY) <= 3 ? { kind: 'row', idx: +th.textContent, px: r.height / ((S.zoom || 100) / 100) } : null;
    return null;
  }
  function selectedCols(idx) { var g = S.range && S.range.sheet === S.sheet ? S.range : null, sh = S.cur.wb.byName[S.sheet]; if (g && g.r1 === 1 && g.r2 >= sh.maxR && idx >= g.c1 && idx <= g.c2) { var o = []; for (var c = g.c1; c <= g.c2; c++) o.push(c); return o; } return [idx]; }
  function selectedRows(idx) { var g = S.range && S.range.sheet === S.sheet ? S.range : null, sh = S.cur.wb.byName[S.sheet]; if (g && g.c1 === 1 && g.c2 >= sh.maxC && idx >= g.r1 && idx <= g.r2) { var o = []; for (var r = g.r1; r <= g.r2; r++) o.push(r); return o; } return [idx]; }
  function guide(x, y) {
    var w = $('gridWrap'), wr = w.getBoundingClientRect(), g = w.querySelector('.rszg') || (function () { var d = document.createElement('div'); d.className = 'rszg'; w.appendChild(d); return d; })();
    if (rs.kind === 'col') g.style.cssText = 'left:' + (x - wr.left + w.scrollLeft) + 'px;top:' + w.scrollTop + 'px;width:0;height:' + w.clientHeight + 'px;border-left:1px dashed #333';
    else g.style.cssText = 'top:' + (y - wr.top + w.scrollTop) + 'px;left:' + w.scrollLeft + 'px;height:0;width:' + w.clientWidth + 'px;border-top:1px dashed #333';
    var tip = $('rszTip'); if (!tip) { tip = document.createElement('div'); tip.id = 'rszTip'; tip.className = 'rsztip'; document.body.appendChild(tip); }
    tip.style.left = (x + 14) + 'px'; tip.style.top = (y + 14) + 'px';
    tip.textContent = rs.kind === 'col' ? 'Width: ' + E.charsOf(rs.now / 7).toFixed(2) + ' (' + Math.round(rs.now) + ' pixels)' : 'Height: ' + (rs.now * 0.75).toFixed(2) + ' (' + Math.round(rs.now) + ' pixels)';
  }
  $('gridWrap').addEventListener('mousemove', function (e) {
    if (rs) return;
    var th = e.target.closest && e.target.closest('th'); if (!th) return;
    th.style.cursor = nearEdge(th, e) ? (th.parentNode.parentNode.tagName === 'THEAD' ? 'col-resize' : 'row-resize') : '';
  });
  $('gridWrap').addEventListener('mousedown', function (e) {
    var th = e.target.closest && e.target.closest('th'); if (!th || e.button !== 0 || S.sheet === '__overview') return;
    var ne = nearEdge(th, e); if (!ne) return;
    e.preventDefault(); e.stopPropagation();
    rs = { kind: ne.kind, idx: ne.idx, start: ne.px, now: ne.px, x0: e.clientX, y0: e.clientY };
    document.body.classList.add(ne.kind === 'col' ? 'rsz-col' : 'rsz-row'); guide(e.clientX, e.clientY);
  }, true);
  document.addEventListener('mousemove', function (e) {
    if (!rs) return;
    var z = (S.zoom || 100) / 100; rs.now = Math.max(8, rs.start + (rs.kind === 'col' ? e.clientX - rs.x0 : e.clientY - rs.y0) / z);
    guide(e.clientX, e.clientY);
  });
  document.addEventListener('mouseup', function () {
    if (!rs) return;
    var d = rs; rs = null; document.body.classList.remove('rsz-col', 'rsz-row');
    var g = $('gridWrap').querySelector('.rszg'); if (g) g.parentNode.removeChild(g); var tip = $('rszTip'); if (tip) tip.parentNode.removeChild(tip);
    if (Math.abs(d.now - d.start) < 1) return;
    RC.pushUndo();
    if (d.kind === 'col') { var o = S.lay.colw[S.sheet] = S.lay.colw[S.sheet] || {}; selectedCols(d.idx).forEach(function (c) { o[c] = d.now / 7; }); }
    else { var o2 = S.lay.rowh[S.sheet] = S.lay.rowh[S.sheet] || {}; selectedRows(d.idx).forEach(function (r) { o2[r] = Math.round(d.now * 0.75 * 100) / 100; }); }
    RC.save(); RC.rerenderSheet();
  }, true);
  $('gridWrap').addEventListener('dblclick', function (e) {   // double-click on a column border = AutoFit
    var th = e.target.closest && e.target.closest('th'); if (!th) return; var ne = nearEdge(th, e); if (!ne) return;
    e.preventDefault(); e.stopPropagation();
    var sh = S.cur.wb.byName[S.sheet];
    if (ne.kind === 'col') { RC.pushUndo(); var o = S.lay.colw[S.sheet] = S.lay.colw[S.sheet] || {}; selectedCols(ne.idx).forEach(function (c) { var mx = 0; for (var r = 1; r <= sh.maxR; r++) { var t = RC.displayCell(S.sheet, Xl.addr(c, r)); if (t && t.length > mx) mx = t.length; } o[c] = E.storedWidth(Math.min(70, Math.max(3, mx * 1.12 + 1))); }); RC.save(); RC.rerenderSheet(); }
    else { RC.pushUndo(); var o2 = S.lay.rowh[S.sheet] = S.lay.rowh[S.sheet] || {}; selectedRows(ne.idx).forEach(function (r) { var big = 11; for (var c = 1; c <= sh.maxC; c++) { var st = E.styleAt(S.sheet, Xl.addr(c, r)); if (st && st.sz > big) big = st.sz; } o2[r] = Math.round(big * 1.36 * 4) / 4; }); RC.save(); RC.rerenderSheet(); }
  }, true);

  /* ================= right-click menu ================= */
  function mi(label, ar, fn, extra) { return Object.assign({ label: label, ar: ar, fn: fn }, extra || {}); }
  var NEEDS = 'Needs Excel — it changes the structure of the workbook. (محتاج إكسيل)';
  function editItems(multi) {
    var out = [mi('Cut', 'قص', E.cut, { hint: 'Ctrl+X' }), mi('Copy', 'نسخ', function () { E.copy(false); }, { hint: 'Ctrl+C' }), mi('Paste', 'لصق', function () { E.paste('all'); }, { hint: 'Ctrl+V', disabled: !S.clip }),
      mi('Paste Values', 'لصق قيم', function () { E.paste('values'); }, { disabled: !S.clip }), mi('Paste Formatting', 'لصق التنسيق', function () { E.paste('formats'); }, { disabled: !S.clip })];
    if (multi) out.push({ t: 'sep' }, mi('Fill Down', 'تعبئة لتحت', function () { E.fillSel('down'); }, { hint: 'Ctrl+D' }), mi('Fill Right', 'تعبئة لليمين', function () { E.fillSel('right'); }, { hint: 'Ctrl+R' }));
    return out;
  }
  function cellMenu(a) {
    var sel = RC.selRects(), multi = sel.length && !(sel[0].r1 === sel[0].r2 && sel[0].c1 === sel[0].c2), items = editItems(multi);
    items.push({ t: 'sep' }, mi('Insert…', 'إدراج', null, { disabled: true, title: NEEDS }), mi('Delete…', 'حذف', null, { disabled: true, title: NEEDS }), mi('Clear Contents', 'مسح المحتوى', function () { E.clear('contents'); }, { hint: 'Del' }), mi('Clear Formats', 'مسح التنسيق', function () { E.clear('formats'); }),
      { t: 'sep' }, mi('Format Cells…', 'تنسيق الخلايا', E.formatCellsDialog, { hint: 'Ctrl+1' }), mi('Row Height…', 'ارتفاع الصف', E.promptRowHeight), mi('Column Width…', 'عرض العمود', E.promptColWidth),
      mi('Hide Rows', 'إخفاء الصفوف', function () { E.hide('rows', true); }), mi('Hide Columns', 'إخفاء الأعمدة', function () { E.hide('cols', true); }), mi('Unhide All', 'إظهار الكل', E.unhideAll));
    var ch = S.cmp.byKey[S.sheet + '!' + a];
    if (ch && !ch.auto) {
      var pv = ch.prev ? RC.editText(ch.prev, S.sheet) : '(empty)';
      items.push({ t: 'sep' }, { t: 'head', label: 'This week’s change · تغيير هذا الأسبوع' }, mi('Last week: ' + (pv.length > 40 ? pv.slice(0, 39) + '…' : pv), '', null, { disabled: true }),
        mi('Keep this week’s value', 'وافق', function () { RC.setDec(S.sheet, a, 'accept', null, false); }, { hint: 'Alt+K' }), mi('Reject — use last week’s value', 'ارفض', function () { RC.setDec(S.sheet, a, 'reject', null, false); }, { hint: 'Alt+J' }));
    }
    return items;
  }
  function headerMenu(kind) {
    var items = editItems(false); items.push({ t: 'sep' }, mi('Insert', 'إدراج', null, { disabled: true, title: NEEDS }), mi('Delete', 'حذف', null, { disabled: true, title: NEEDS }), mi('Clear Contents', 'مسح المحتوى', function () { E.clear('contents'); }), { t: 'sep' });
    if (kind === 'col') items.push(mi('Column Width…', 'عرض العمود', E.promptColWidth), mi('AutoFit Column Width', 'ملاءمة العرض', E.autofitCols), mi('Hide', 'إخفاء', function () { E.hide('cols', true); }), mi('Unhide All', 'إظهار الكل', E.unhideAll));
    else items.push(mi('Row Height…', 'ارتفاع الصف', E.promptRowHeight), mi('AutoFit Row Height', 'ملاءمة الارتفاع', E.autofitRows), mi('Hide', 'إخفاء', function () { E.hide('rows', true); }), mi('Unhide All', 'إظهار الكل', E.unhideAll));
    items.push({ t: 'sep' }, mi('Format Cells…', 'تنسيق الخلايا', E.formatCellsDialog, { hint: 'Ctrl+1' }));
    return items;
  }
  $('gridWrap').addEventListener('contextmenu', function (e) {
    if (S.sheet === '__overview') return;
    var t = e.target; if (t.id === 'cellEd') return;
    var td = t.closest && t.closest('td[data-a]'), th = t.closest && t.closest('th');
    if (!td && !th) return;
    e.preventDefault(); if (ED) commit(null); RC.closeMenu();
    if (td) {
      var a = td.getAttribute('data-a'), p = Xl.parseAddr(a), inside = RC.selRects().some(function (g) { return p.r >= g.r1 && p.r <= g.r2 && p.c >= g.c1 && p.c <= g.c2; });
      if (!inside) { S.sel = { sheet: S.sheet, a: a }; S.range = null; S.extra = []; RC.paintMarks(); RC.refreshSide(); }
      RC.showMenu(cellMenu(a), e.clientX, e.clientY);
    } else {
      var head = th.parentNode.parentNode.tagName === 'THEAD', sh = S.cur.wb.byName[S.sheet];
      if (head && th.cellIndex > 0) { var c = th.cellIndex, g0 = S.range; if (!(g0 && g0.r1 === 1 && g0.r2 >= sh.maxR && c >= g0.c1 && c <= g0.c2)) { S.sel = { sheet: S.sheet, a: Xl.addr(c, 1) }; RC.setRange(Xl.addr(c, 1), Xl.addr(c, sh.maxR)); S.extra = []; RC.paintMarks(); RC.refreshSide(); } RC.showMenu(headerMenu('col'), e.clientX, e.clientY); }
      else if (th.classList.contains('rh') && /^\d+$/.test(th.textContent)) { var r = +th.textContent, g1 = S.range; if (!(g1 && g1.c1 === 1 && g1.c2 >= sh.maxC && r >= g1.r1 && r <= g1.r2)) { S.sel = { sheet: S.sheet, a: Xl.addr(1, r) }; RC.setRange(Xl.addr(1, r), Xl.addr(sh.maxC, r)); S.extra = []; RC.paintMarks(); RC.refreshSide(); } RC.showMenu(headerMenu('row'), e.clientX, e.clientY); }
    }
  });

  /* ================= Format Cells (Ctrl+1) ================= */
  E.formatCellsDialog = function () {
    var s = E.sel(); if (!s) { RC.toast('Select a cell first. (حدد خلية الأول)'); return; }
    var st = E.activeStyle(), ec = S.view.eff(S.sheet, S.sel.a), chosen = { border: null, fill: undefined };
    var back = document.createElement('div'); back.className = 'dlg-back';
    var box = document.createElement('div'); box.className = 'dlg fc'; back.appendChild(box);
    function opts(list, cur) { return list.map(function (o) { return '<option value="' + h(o[0]) + '"' + (o[0] === cur ? ' selected' : '') + '>' + h(o[1]) + '</option>'; }).join(''); }
    var cats = Fmt.NF_LIST.concat(['Custom']), curCat = Fmt.nfName(st.nf) || 'Custom';
    var sw = Fmt.paletteRows().reduce(function (a, r) { return a.concat(r); }, []).concat(Fmt.STD_COLORS);
    box.innerHTML = '<h3>Format Cells · تنسيق الخلايا</h3><div class="fct">' + ['Number', 'Alignment', 'Font', 'Border', 'Fill'].map(function (t, i) { return '<button type="button" data-p="' + t + '" class="' + (i ? '' : 'on') + '">' + t + '</button>'; }).join('') + '</div>' +
      '<div class="fcp" data-p="Number"><label class="df">Category<select id="fcCat">' + opts(cats.map(function (c) { return [c, c]; }), curCat) + '</select></label><label class="df">Format code<input type="text" id="fcCode" value="' + h(st.nf) + '"></label><div class="dn">Sample: <b id="fcSample"></b></div></div>' +
      '<div class="fcp" data-p="Alignment" hidden><div class="fcg"><label class="df">Horizontal<select id="fcH">' + opts([['', 'General'], ['left', 'Left'], ['center', 'Center'], ['right', 'Right']], st.h) + '</select></label><label class="df">Vertical<select id="fcV">' + opts([['top', 'Top'], ['center', 'Center'], ['bottom', 'Bottom']], st.v || 'bottom') + '</select></label><label class="df">Indent<input type="text" id="fcI" value="' + (st.indent || 0) + '"></label></div><label class="df chk"><input type="checkbox" id="fcW"' + (st.wrap ? ' checked' : '') + '> Wrap text</label><label class="df chk"><input type="checkbox" id="fcM"> Merge cells</label></div>' +
      '<div class="fcp" data-p="Font" hidden><div class="fcg"><label class="df">Font<select id="fcFn">' + opts(Fmt.FONTS.concat(Fmt.FONTS.indexOf(st.name) < 0 ? [st.name] : []).map(function (f) { return [f, f]; }), st.name) + '</select></label><label class="df">Size<select id="fcSz">' + opts(Fmt.SIZES.concat(Fmt.SIZES.indexOf(st.sz) < 0 ? [st.sz] : []).sort(function (a, b) { return a - b; }).map(function (n) { return [String(n), String(n)]; }), String(st.sz)) + '</select></label><label class="df">Color<input type="color" id="fcCol" value="' + (st.color || '#000000') + '"></label></div><label class="df chk"><input type="checkbox" id="fcB"' + (st.b ? ' checked' : '') + '> Bold</label><label class="df chk"><input type="checkbox" id="fcIt"' + (st.i ? ' checked' : '') + '> Italic</label><label class="df chk"><input type="checkbox" id="fcU"' + (st.u ? ' checked' : '') + '> Underline</label></div>' +
      '<div class="fcp" data-p="Border" hidden><div class="fcb">' + [['none', 'None'], ['outside', 'Outline'], ['all', 'All'], ['top', 'Top'], ['bottom', 'Bottom'], ['left', 'Left'], ['right', 'Right']].map(function (b) { return '<button type="button" data-b="' + b[0] + '">' + b[1] + '</button>'; }).join('') + '</div><div class="fcg"><label class="df">Line style<select id="fcLs">' + opts([['thin', 'Thin'], ['medium', 'Medium'], ['thick', 'Thick'], ['dashed', 'Dashed'], ['dotted', 'Dotted'], ['double', 'Double'], ['hair', 'Hair']], 'thin') + '</select></label><label class="df">Color<input type="color" id="fcBc" value="#000000"></label></div><div class="dn">Choose a preset, then OK. <span class="ar">اختار نوع الحدود ثم موافق.</span></div></div>' +
      '<div class="fcp" data-p="Fill" hidden><div class="fcw">' + sw.map(function (c) { return '<button type="button" class="sw" data-c="' + c + '" style="background:' + c + '" title="' + c + '"></button>'; }).join('') + '</div><div class="fcg"><button type="button" class="pn" id="fcNo">⊘ No Color · بدون لون</button><label class="df">Custom<input type="color" id="fcFc" value="' + (st.fill || '#FFFF00') + '"></label></div><div class="dn" id="fcFs"></div></div>' +
      '<div class="dbtn"><button type="button" class="dc">Cancel · إلغاء</button><button type="button" class="dok">OK · موافق</button></div>';
    document.body.appendChild(back);
    function q(id) { return box.querySelector('#' + id); }
    function close() { if (back.parentNode) back.parentNode.removeChild(back); }
    function sample() { var v = ec && ec.k === 'n' ? ec.v : 1234.5678, code = q('fcCode').value || 'General'; try { q('fcSample').textContent = Xl.formatNumber(v, code); } catch (e) { q('fcSample').textContent = '?'; } }
    box.querySelectorAll('.fct button').forEach(function (b) { b.addEventListener('click', function () { box.querySelectorAll('.fct button').forEach(function (x) { x.classList.toggle('on', x === b); }); box.querySelectorAll('.fcp').forEach(function (p) { p.hidden = p.getAttribute('data-p') !== b.getAttribute('data-p'); }); }); });
    q('fcCat').addEventListener('change', function () { var c = q('fcCat').value; if (c !== 'Custom') q('fcCode').value = Fmt.NF[c]; sample(); });
    q('fcCode').addEventListener('input', function () { q('fcCat').value = Fmt.nfName(q('fcCode').value) || 'Custom'; sample(); }); sample();
    box.querySelectorAll('.fcb button').forEach(function (b) { b.addEventListener('click', function () { chosen.border = b.getAttribute('data-b'); box.querySelectorAll('.fcb button').forEach(function (x) { x.classList.toggle('on', x === b); }); }); });
    box.querySelectorAll('.fcw .sw').forEach(function (b) { b.addEventListener('click', function () { chosen.fill = b.getAttribute('data-c'); q('fcFs').textContent = 'Fill: ' + chosen.fill; }); });
    q('fcNo').addEventListener('click', function () { chosen.fill = null; q('fcFs').textContent = 'Fill: none'; });
    q('fcFc').addEventListener('input', function () { chosen.fill = q('fcFc').value.toUpperCase(); q('fcFs').textContent = 'Fill: ' + chosen.fill; });
    box.querySelector('.dc').addEventListener('click', close); back.addEventListener('mousedown', function (e) { if (e.target === back) close(); });
    box.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    box.querySelector('.dok').addEventListener('click', function () {
      var p = {};
      var code = q('fcCode').value || 'General'; if (code !== st.nf) p.nf = code;
      var hh = q('fcH').value; if (hh !== st.h) p.h = hh; var vv = q('fcV').value; if (vv !== (st.v || 'bottom')) p.v = vv;
      var ind = Math.max(0, parseInt(q('fcI').value, 10) || 0); if (ind !== (st.indent || 0)) p.indent = ind;
      if (q('fcW').checked !== !!st.wrap) p.wrap = q('fcW').checked;
      if (q('fcFn').value !== st.name) p.name = q('fcFn').value; if (+q('fcSz').value !== +st.sz) p.sz = +q('fcSz').value;
      if (q('fcB').checked !== !!st.b) p.b = q('fcB').checked; if (q('fcIt').checked !== !!st.i) p.i = q('fcIt').checked; if (q('fcU').checked !== !!st.u) p.u = q('fcU').checked;
      var col = q('fcCol').value.toUpperCase(); if (col !== (st.color || '#000000').toUpperCase()) p.color = col;
      if (chosen.fill !== undefined) p.fill = chosen.fill;
      close();
      if (Object.keys(p).length) E.format(p);
      if (chosen.border) E.borders(chosen.border, q('fcLs').value, q('fcBc').value.toUpperCase());
      if (q('fcM').checked) E.merge('cells');
    });
  };
})();

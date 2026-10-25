/* P6 Web – Primavera P6 keyboard shortcuts, copy-table-to-Excel (TSV) and the shortcuts reference dialog. */
(function (g) {
  'use strict';
  const P6 = g.P6, App = g.App, D = App.dialogs;
  const t = (k, ...a) => P6.t(k, ...a), esc = P6.esc;
  const F = () => App.cfg;
  const typing = () => /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '') || (document.activeElement || {}).isContentEditable;
  const modalOpen = () => !!document.querySelector('.modal-bg, .mback');

  // ---- table → clipboard as tab-separated text (pastes straight into Excel) ----
  App.tableTSV = function (all) {
    const ctx = App.getCtx(), cols = F().cols;
    let rows = App.rows; const sel = rows.filter((r) => App.sel.has(r.kind + r.id));
    if (!all && sel.length) rows = sel;
    const clean = (s) => String(s == null ? '' : s).replace(/[\t\r\n]+/g, ' ');
    const head = cols.map((c) => clean(c.title || P6.t('col_' + c.k)));
    const lines = rows.map((row) => cols.map((c, i) => { const r = P6.regCell(c.k, row, ctx); let v = r ? r.text : ''; if (row.kind !== 't' && i === 0 && row.w && !v) v = row.w.name; return (i === 0 ? '  '.repeat(Math.max(0, row.level || 0)) : '') + clean(v); }).join('\t'));
    return { text: [head.join('\t'), ...lines].join('\r\n'), n: rows.length };
  };
  // Same result as copying from P6: WBS rows get a light-green fill in the first column only, no borders,
  // and the first column is indented by WBS level (activities one level deeper than their WBS).
  const hx = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const WBS_FILL = '#c6efce';
  const WCOL = [['#0000ff', '#ffffff'], ['#66ff66', '#000000'], ['#ffff00', '#000000'], ['#0000ff', '#ffffff'], ['#ff0000', '#ffffff']];
  // style 'screen': WBS rows keep the colours / bold shown on screen (whole row); style 'p6': light-green first cell only, like P6's own export
  App.tableHTML = function (all, style) {
    style = style || F().copyStyle || 'screen';
    const ctx = App.getCtx(), cols = F().cols, wpal = (F().grp && F().grp.wbsColors) || null;
    let rows = App.rows; const sel = rows.filter((r) => App.sel.has(r.kind + r.id));
    if (!all && sel.length) rows = sel;
    const tr = rows.map((row) => {
      let bg = '', fg = '', bold = false, firstOnly = false;
      if (row.kind !== 't') {
        if (style === 'p6') { bg = row.kind === 'g' ? (row.color || WBS_FILL) : WBS_FILL; firstOnly = true; }
        else { const lv = row.level % WCOL.length; bg = row.kind === 'g' ? row.color : wpal ? wpal[row.level % wpal.length] : WCOL[lv][0]; fg = row.kind === 'w' && !wpal ? WCOL[lv][1] : (P6.contrast ? P6.contrast(bg) : '#000000'); bold = true; }
      }
      return '<tr>' + cols.map((c, i) => {
        const r = P6.regCell(c.k, row, ctx); let v = r ? r.text : ''; if (row.kind !== 't' && i === 0 && row.w && !v) v = row.w.name;
        const ind = i === 0 ? '&nbsp;&nbsp;'.repeat(Math.max(0, row.level || 0)) : '';
        const paint = bg && (!firstOnly || i === 0);
        const st = (paint ? `background:${bg};` : '') + (paint && fg ? `color:${fg};` : '') + (paint && bold ? 'font-weight:bold;' : '') + (i === 0 ? 'text-align:left;' : '');
        return `<td${st ? ` style="${st}"` : ''}>${ind}${hx(v)}</td>`;
      }).join('') + '</tr>';
    }).join('');
    const head = '<tr>' + cols.map((c, i) => `<td style="${style === 'p6' ? (i === 0 ? 'background:' + WBS_FILL : '') : 'background:#d9d9d9;font-weight:bold'}">${hx(c.title || P6.t('col_' + c.k))}</td>`).join('') + '</tr>';
    return `<table style="font-family:Calibri,Arial;font-size:11pt">${head}${tr}</table>`;
  };
  App.copyTable = function (all, style) {
    const { text, n } = App.tableTSV(all), html = App.tableHTML(all, style);
    const done = () => App.toast(t('copied_excel', n));
    const fallback = () => {
      const d = document.createElement('div'); d.contentEditable = 'true'; d.style.cssText = 'position:fixed;left:-9999px;top:0;white-space:pre'; d.innerHTML = html; document.body.appendChild(d);
      const rg = document.createRange(); rg.selectNodeContents(d); const sl = getSelection(); sl.removeAllRanges(); sl.addRange(rg);
      let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; } sl.removeAllRanges(); d.remove();
      if (ok) done(); else App.toast(t('copy_failed'), true);
    };
    if (navigator.clipboard && window.ClipboardItem) {
      navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]).then(done, fallback);
    } else fallback();
  };
  // Ctrl+C keeps copying activities internally and also puts the table text on the clipboard
  const baseCopy = App.copySel;
  App.copySel = function (silent) { const r = baseCopy.call(App, true); App.copyTable(false); return r; };

  // ---- navigation helpers ----
  const goRow = (i, ext) => { const rows = App.rows; if (!rows.length) return; i = Math.max(0, Math.min(rows.length - 1, i)); App.selectRow ? App.selectRow(rows[i], ext ? { shiftKey: true } : null) : App.setSel([rows[i].kind + rows[i].id]); App.ensureVisible && App.ensureVisible(i); };
  const curIdx = () => (App.focus != null && App.rowIdx.has(App.focus) ? App.rowIdx.get(App.focus) : 0);
  const wbsRows = () => App.selWbs ? App.selWbs() : [];
  const setCollapsed = (on) => { const ws = wbsRows(); if (!ws.length) return false; ws.forEach((w) => (on ? App.collapsed.add(w.id) : App.collapsed.delete(w.id))); App.refresh(); return true; };

  addEventListener('keydown', (e) => {
    if (!App.p || modalOpen()) return;
    const k = e.key, mod = e.ctrlKey || e.metaKey, ty = typing();
    const inTable = !!(e.target.closest && e.target.closest('#tBody, #tHead'));
    let used = true;
    if (k === 'F1' && !e.altKey) D.help && D.help();
    else if (k === 'F9' && e.shiftKey) D.modal({ title: t('mi_levelres'), cls: 'mid', body: `<p style="line-height:1.8">${esc(t('na_body'))}</p>`, buttons: [{ label: t('close'), cls: 'pri', fn: () => {} }] });
    else if (k === 'F12' && e.shiftKey) used = false;
    else if (ty) used = false;
    else if (mod && (k === '+' || k === 'Add' || e.code === 'NumpadAdd')) App.expandAll();
    else if (mod && (k === '-' || k === 'Subtract' || e.code === 'NumpadSubtract')) App.collapseAll();
    else if (!mod && !e.altKey && e.code === 'NumpadAdd' && inTable) used = setCollapsed(false);
    else if (!mod && !e.altKey && e.code === 'NumpadSubtract' && inTable) used = setCollapsed(true);
    else if (mod && k.toLowerCase() === 'a') { App.selectAll(); }
    else if (mod && e.shiftKey && k.toLowerCase() === 'c') App.copyTable(true);
    else if (mod && k === 'Home') goRow(0, e.shiftKey);
    else if (mod && k === 'End') goRow(App.rows.length - 1, e.shiftKey);
    else if (inTable && k === 'Home' && !mod) goRow(0, e.shiftKey);
    else if (inTable && k === 'End' && !mod) goRow(App.rows.length - 1, e.shiftKey);
    else if (inTable && k === 'PageDown') goRow(curIdx() + 15, e.shiftKey);
    else if (inTable && k === 'PageUp') goRow(curIdx() - 15, e.shiftKey);
    else if (mod && k === 'Enter' && App.rows.length) D.modal && App.showDetails && App.showDetails();
    else if (mod && k === 'ArrowRight' && wbsRows().length && App.indent) App.indent();
    else if (mod && k === 'ArrowLeft' && wbsRows().length && App.outdent) App.outdent();
    else used = false;
    if (used) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  // ---- reference dialog (Help ▸ Keyboard Shortcuts) ----
  const LIST = [
    ['grp_file', [['Alt+N', 'New project'], ['Ctrl+O', 'Open project'], ['Alt+W', 'Close all'], ['Ctrl+P', 'Print preview'], ['Ctrl+S', 'Export XER'], ['F5', 'Refresh data'], ['F10', 'Commit changes']]],
    ['grp_edit', [['Ctrl+Z / Ctrl+Y', 'Undo / Redo'], ['Ctrl+X / Ctrl+C / Ctrl+V', 'Cut / Copy / Paste (Copy also puts the rows on the clipboard as tab-separated text for Excel)'], ['Ctrl+A', 'Select all rows'], ['Ctrl+Shift+C', 'Copy the whole table (with headers) for Excel'], ['Insert', 'Add activity'], ['Delete', 'Delete'], ['Ctrl+D', 'Duplicate'], ['Ctrl+E', 'Fill down'], ['Ctrl+F / F3 / Shift+F3', 'Find / Find next / previous'], ['Ctrl+R', 'Replace'], ['F7', 'Spell check'], ['F2 / Enter', 'Edit cell'], ['Tab / Shift+Tab', 'Next / previous cell while editing'], ['Esc', 'Cancel edit / close menu']]],
    ['grp_nav', [['↑ ↓ ← →', 'Move between cells'], ['Shift+↑ ↓', 'Extend row selection'], ['Home / End', 'First / last row'], ['Ctrl+Home / Ctrl+End', 'First / last row'], ['Page Up / Page Down', 'Move 15 rows'], ['Numpad + / −', 'Expand / collapse selected WBS'], ['Ctrl+Numpad + / −', 'Expand all / collapse all'], ['Ctrl+→ / Ctrl+←', 'Indent / outdent WBS'], ['Ctrl+Wheel (Gantt)', 'Zoom timescale']]],
    ['grp_tools', [['F9', 'Schedule'], ['Shift+F9', 'Level Resources (not available in this version)'], ['F1', 'Help'], ['Alt+F1', 'Toggle hint help']]]
  ];
  D.shortcuts = function () {
    const body = LIST.map(([h, rows]) => `<h4 style="margin:12px 0 4px">${esc(t(h))}</h4><table class="mini" style="width:100%"><tbody>${rows.map(([a, b]) => `<tr><td style="width:240px"><kbd>${esc(a)}</kbd></td><td dir="auto">${esc(b)}</td></tr>`).join('')}</tbody></table>`).join('');
    D.modal({ title: t('shortcuts'), cls: 'wide', body: `<div style="max-height:62vh;overflow:auto" dir="ltr">${body}</div>`, buttons: [{ label: t('close'), cls: 'pri', fn: () => {} }] });
  };
})(window);

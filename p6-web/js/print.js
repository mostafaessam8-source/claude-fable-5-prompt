/* P6 Web – Page Setup, Print Setup, Print Preview (table + Gantt rendered together) and project portfolios. */
(function (g) {
  'use strict';
  const P6 = g.P6, App = g.App, D = App.dialogs;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = P6.esc, t = (k, ...a) => P6.t(k, ...a);
  const PAPER = { A4: [297, 210], A3: [420, 297], Letter: [279, 216], Legal: [356, 216] };
  const WCOL = [['#0000ff', '#fff'], ['#66ff66', '#000'], ['#ffff00', '#000'], ['#0000ff', '#fff'], ['#ff0000', '#fff']];
  const opt = (v, l, c) => `<option value="${v}"${String(c) === String(v) ? ' selected' : ''}>${esc(l)}</option>`;
  const ps = () => Object.assign({ paper: 'A4', orient: 'landscape', margin: 10, what: 'both', header: true, footer: true, fit: true }, App.cfg.print);

  D.pageSetup = function () {
    const c = ps();
    const body = `<div class="grid2"><div class="fld"><label>${esc(t('paper'))}</label><select id="pg_p">${Object.keys(PAPER).map((k) => opt(k, k, c.paper)).join('')}</select></div>
      <div class="fld"><label>${esc(t('orientation'))}</label><select id="pg_o">${opt('landscape', t('landscape'), c.orient)}${opt('portrait', t('portrait'), c.orient)}</select></div>
      <div class="fld"><label>${esc(t('margin_mm'))}</label><input id="pg_m" value="${c.margin}"></div></div>
      <label class="chk" style="margin-top:12px"><input type="checkbox" id="pg_h"${c.header ? ' checked' : ''}> ${esc(t('print_header'))}</label>
      <label class="chk"><input type="checkbox" id="pg_f"${c.footer ? ' checked' : ''}> ${esc(t('print_footer'))}</label>`;
    D.modal({ title: t('page_setup'), cls: 'mid', body, buttons: [{ label: t('cancel'), fn: () => {} }, { label: t('save'), cls: 'pri', fn: (cl, el) => {
      Object.assign(App.cfg.print, { paper: $('#pg_p', el).value, orient: $('#pg_o', el).value, margin: Math.max(0, Math.min(40, +$('#pg_m', el).value || 10)), header: $('#pg_h', el).checked, footer: $('#pg_f', el).checked }); App.saveCfg();
    } }] });
  };
  D.printSetup = function () {
    const c = ps();
    const body = `<div class="grid2"><div class="fld"><label>${esc(t('print_what'))}</label><select id="ps_w">${opt('both', t('view_both'), c.what)}${opt('table', t('view_table'), c.what)}${opt('gantt', t('view_gantt'), c.what)}</select></div></div>
      <label class="chk" style="margin-top:12px"><input type="checkbox" id="ps_fit"${c.fit ? ' checked' : ''}> ${esc(t('fit_width'))}</label><p class="hint">${esc(t('print_hint'))}</p>`;
    D.modal({ title: t('print_setup'), cls: 'mid', body, buttons: [{ label: t('cancel'), fn: () => {} }, { label: t('save'), cls: 'pri', fn: (cl, el) => { Object.assign(App.cfg.print, { what: $('#ps_w', el).value, fit: $('#ps_fit', el).checked }); App.saveCfg(); } }] });
  };

  // render the Gantt for ALL rows into a static SVG (off-screen)
  function ganttSvg(rows, px, rowH) {
    const o = App.gantt.o, W = Math.ceil((o.maxDay - o.minDay + 1) * px), H = rows.length * rowH;
    const host = document.createElement('div');
    host.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px;overflow:hidden;visibility:hidden;direction:ltr`;
    const head = document.createElement('div'); head.style.cssText = 'height:46px;width:' + W + 'px';
    document.body.appendChild(host); document.body.appendChild(head); head.style.cssText += ';position:fixed;left:0;top:0;visibility:hidden';
    const gt = new P6.Gantt(head, host);
    gt.o.cb = {};
    gt.set({ rows, ru: App.ru, rowH, px, minDay: o.minDay, maxDay: o.maxDay, sel: new Set(), show: Object.assign({}, App.cfg.show, { today: true }), p: App.p, rels: true, spot: null });
    gt.draw();
    const body = gt.svg.outerHTML, hd = gt.hsvg.outerHTML;
    host.remove(); head.remove();
    return { body, hd, W, H };
  }

  D.printPreview = function () {
    const c = ps(), p = App.p, rows = App.rows.slice(0, 1500), RH = 22;
    const [pw, ph] = c.orient === 'landscape' ? PAPER[c.paper] : [PAPER[c.paper][1], PAPER[c.paper][0]];
    const mm = 3.78; // css px per mm
    const innerW = (pw - 2 * c.margin) * mm, innerH = (ph - 2 * c.margin) * mm;
    const cols = App.cfg.cols;
    const ctx = App.getCtx();
    const cellText = (k, row) => { const r = P6.regCell(k, row, ctx); return r ? r.text : ''; };
    const wantTable = c.what !== 'gantt', wantGantt = c.what !== 'table';
    const tableW = cols.reduce((a, x) => a + x.w, 0);
    let ganttW = 0, g = null;
    // choose a Gantt scale so that table + gantt fit the paper width when "fit" is on
    const span = App.gantt.o.maxDay - App.gantt.o.minDay + 1;
    let px = App.gantt.o.px;
    if (wantGantt && c.fit) px = Math.max(0.2, (innerW - (wantTable ? Math.min(tableW, innerW * 0.55) : 0) - 8) / span);
    if (wantGantt) { g = ganttSvg(rows, px, RH); ganttW = g.W; }
    const thead = cols.map((x) => `<div class="pvh" style="width:${x.w}px">${esc(x.title || t('col_' + x.k))}</div>`).join('');
    const trs = rows.map((row) => {
      const lvl = row.kind !== 't' ? row.level % 5 : -1;
      const style = row.kind !== 't' ? `background:${WCOL[lvl][0]};color:${WCOL[lvl][1]};font-weight:700` : '';
      return `<div class="pvr" style="height:${RH}px;${style}">${cols.map((x, i) => `<div class="pvc" style="width:${x.w}px">${i === 0 ? '<span style="display:inline-block;width:' + row.level * 10 + 'px"></span>' : ''}${esc(row.kind !== 't' && i === 0 ? row.w.name : cellText(x.k, row))}</div>`).join('')}</div>`;
    }).join('');
    const sheetW = (wantTable ? tableW : 0) + (wantGantt ? ganttW : 0);
    const scale = c.fit ? Math.min(1, innerW / sheetW) : 1;
    const hdr = c.header ? `<div class="pvhead"><b dir="auto">${esc(p.name)}</b><span>${esc(t('layout'))}: ${esc(App.cfg.layoutName || t('lay_' + App.cfg.layout))}</span><span>${esc(t('data_date'))}: ${P6.fmtDate(p.dataDate)}</span></div>` : '';
    const ftr = c.footer ? `<div class="pvfoot"><span>${esc(t('printed'))}: ${new Date().toLocaleString()}</span><span>${esc(App.cfg.user || '')}</span></div>` : '';
    const html = `<div class="pv-paper" style="width:${pw * mm}px;min-height:${ph * mm}px;padding:${c.margin * mm}px"><style id="pvpage">@page{size:${pw}mm ${ph}mm;margin:0}</style>${hdr}
      <div class="pvsheet" style="transform:scale(${scale});transform-origin:0 0;width:${sheetW}px;height:${(46 + rows.length * RH + 2) * scale ? 46 + rows.length * RH : 0}px;margin-bottom:${-(46 + rows.length * RH) * (1 - scale)}px">
        <div style="display:flex;direction:ltr">${wantTable ? `<div style="width:${tableW}px;flex:none"><div class="pvthead" style="height:46px;display:flex;direction:ltr">${thead}</div>${trs}</div>` : ''}${wantGantt ? `<div style="width:${ganttW}px;flex:none"><div style="height:46px;overflow:hidden">${g.hd.replace('<svg ', '<svg style="background:#f2f2f2" ')}</div>${g.body}</div>` : ''}</div></div>${ftr}</div>`;
    const wrap = document.createElement('div'); wrap.className = 'pvwrap'; wrap.innerHTML = html;
    D.modal({ title: t('print_preview'), cls: 'wide pvmodal', body: wrap, buttons: [{ label: t('page_setup'), fn: () => { D.pageSetup(); return true; } }, { label: t('print_setup'), fn: () => { D.printSetup(); return true; } }, { label: t('cancel'), fn: () => {} }, { label: '🖨 ' + t('print'), cls: 'pri', fn: () => { document.body.classList.add('printing-pv'); const pv = wrap.cloneNode(true); pv.id = 'pvprint'; document.body.appendChild(pv); setTimeout(() => { window.print(); setTimeout(() => { pv.remove(); document.body.classList.remove('printing-pv'); }, 300); }, 80); return false; } }], sticky: true });
  };

  // ---------- portfolios ----------
  D.portfolios = async function () {
    const list = (await App.listProjects()).sort((a, b) => b.updated - a.updated);
    const F = App.cfg; F.portfolios = F.portfolios || {};
    let cur = F.portfolio || Object.keys(F.portfolios)[0] || '';
    const body = document.createElement('div');
    const draw = () => {
      const names = Object.keys(F.portfolios), sel = F.portfolios[cur] || [];
      body.innerHTML = `<div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:10px"><div class="fld" style="flex:1"><label>${esc(t('portfolio'))}</label><select id="pf_sel">${names.map((n) => opt(n, n, cur)).join('') || `<option value="">—</option>`}</select></div><button class="btn" id="pf_new">+ ${esc(t('new_portfolio'))}</button><button class="btn dng" id="pf_del"${cur ? '' : ' disabled'}>${esc(t('delete'))}</button></div>
        <div class="hint">${esc(t('portfolio_hint'))}</div>${cur ? `<div class="plist">${list.map((x) => `<label class="pitem"><input type="checkbox" data-id="${esc(x.id)}"${sel.includes(x.id) ? ' checked' : ''}><div style="flex:1"><div class="nm" dir="auto">${esc(x.name)}</div><div class="sub">${esc(t('activities'))}: ${x.tasks}</div></div></label>`).join('')}</div>` : ''}`;
    };
    draw();
    D.modal({ title: t('manage_portfolios'), cls: 'mid', body, buttons: [{ label: t('close'), cls: 'pri', fn: () => {} }], onClose: () => { App.saveCfg(); App.buildMenus(); } });
    body.addEventListener('change', (e) => {
      if (e.target.id === 'pf_sel') { cur = e.target.value; return draw(); }
      if (e.target.dataset.id) { const a = F.portfolios[cur]; const id = e.target.dataset.id; if (e.target.checked) { if (!a.includes(id)) a.push(id); } else F.portfolios[cur] = a.filter((x) => x !== id); App.saveCfg(); }
    });
    body.addEventListener('click', (e) => {
      if (e.target.id === 'pf_new') { const n = prompt(t('portfolio_name'), ''); if (n && !F.portfolios[n]) { F.portfolios[n] = list.map((x) => x.id); cur = n; App.saveCfg(); draw(); } }
      if (e.target.id === 'pf_del' && cur) { delete F.portfolios[cur]; if (F.portfolio === cur) F.portfolio = ''; cur = Object.keys(F.portfolios)[0] || ''; App.saveCfg(); draw(); }
    });
  };
})(window);

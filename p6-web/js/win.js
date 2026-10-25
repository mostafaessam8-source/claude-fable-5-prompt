/* P6 Web – Primavera-style windows: Projects, Resources, Resource Assignments, WBS, Expenses, WPs & Docs, Thresholds, Issues, Risks. */
(function (g) {
  'use strict';
  const P6 = g.P6, App = g.App, D = App.dialogs;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = P6.esc, t = (k, ...a) => P6.t(k, ...a);
  const fmtD = P6.fmtDate, fmtN = (n) => (n == null || !isFinite(n) ? '' : String(Math.round(n * 100) / 100));
  const money = (v) => P6.fmtKind('money', v);

  const WINS = {
    projects: { title: 'win_projects', icon: 'projects' }, resources: { title: 'win_resources', icon: 'people' }, assign: { title: 'win_assign', icon: 'resassign' },
    wbs: { title: 'win_wbs', icon: 'wbswin' }, expenses: { title: 'win_expenses', icon: 'expenses' }, docs: { title: 'win_docs', icon: 'docs' },
    thresholds: { title: 'win_thresholds', icon: 'thresholds' }, issues: { title: 'win_issues', icon: 'issue' }, risks: { title: 'win_risks', icon: 'risk' }, activities: { title: 'win_activities', icon: 'activities' }
  };
  App.WINS = WINS;
  const wsel = (App.wsel = {});                  // selected row per window
  const wtab = (App.wtab = {});                  // selected bottom tab per window
  App.cfg.wins = App.cfg.wins && App.cfg.wins.length ? App.cfg.wins : ['activities'];
  App.win = 'activities';

  // ---------- window manager ----------
  App.openWin = function (id) {
    if (!WINS[id]) return;
    if (!App.cfg.wins.includes(id)) App.cfg.wins.push(id);
    App.showWin(id);
  };
  App.closeWin = function (id) {
    id = id || App.win;
    if (id === 'activities') return;
    App.cfg.wins = App.cfg.wins.filter((x) => x !== id);
    if (App.win === id) App.showWin('activities'); else App.drawWinTabs();
    App.saveCfg();
  };
  App.showWin = function (id) {
    App.win = id;
    $('#center').classList.toggle('w-other', id !== 'activities');
    App.drawWinTabs();
    if (id === 'activities') { App.refresh(); } else App.renderWin();
    App.saveCfg();
  };
  App.drawWinTabs = function () {
    const tabs = $('#wintabs'), head = $('#winhead'); if (!tabs) return;
    const list = App.cfg.wins.filter((w) => WINS[w]);
    tabs.innerHTML = list.map((w) => `<button class="wtab${App.win === w ? ' on' : ''}" data-w="${w}">${esc(t(WINS[w].title))}</button>`).join('');
    head.innerHTML = `<span>${esc(t(WINS[App.win].title))}</span>${App.win !== 'activities' ? '<span class="x" title="' + esc(t('close')) + '">✖</span>' : ''}`;
    tabs.onclick = (e) => { const b = e.target.closest('.wtab'); if (b) App.showWin(b.dataset.w); };
    const x = head.querySelector('.x'); if (x) x.onclick = () => App.closeWin();
  };

  // ---------- generic editable grid ----------
  // cols: {k, l (label key or text), w, ed: text|num|date|sel|ro, opts(row), get(row), set(row,v), cls(row)}
  function grid(cols, rows, o) {
    o = o || {};
    const head = cols.map((c) => `<th style="min-width:${c.w || 90}px;${c.r ? 'text-align:right' : ''}">${esc(c.lt || t(c.l))}</th>`).join('');
    const body = rows.map((r) => {
      const key = o.key(r), on = o.sel === key;
      const rc = o.rowCls ? o.rowCls(r) : '';
      return `<tr data-rid="${esc(key)}" class="${on ? 'wsel ' : ''}${rc}"${o.rowStyle ? ` style="${o.rowStyle(r)}"` : ''}>${cols.map((c, i) => {
        const v = c.get ? c.get(r) : '';
        if (o.groupRow && o.groupRow(r)) return i === 0 ? `<td colspan="${cols.length}" class="grp">${o.groupRow(r)}</td>` : '';
        if (!c.ed || c.ed === 'ro' || (c.can && !c.can(r))) return `<td class="ro${c.r ? ' r' : ''}" dir="auto">${esc(v)}</td>`;
        if (c.ed === 'sel') return `<td><select data-c="${c.k}">${c.opts(r).map(([a, b]) => `<option value="${esc(a)}"${String(a) === String(v) ? ' selected' : ''}>${esc(b)}</option>`).join('')}</select></td>`;
        if (c.ed === 'chk') return `<td><input type="checkbox" data-c="${c.k}"${v ? ' checked' : ''}></td>`;
        return `<td><input data-c="${c.k}" dir="${c.ed === 'text' ? 'auto' : 'ltr'}" class="${c.r ? 'r' : ''}" value="${esc(v)}"></td>`;
      }).join('')}</tr>`;
    }).join('');
    return `<table class="mini pw"><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${cols.length}" class="empty">${esc(t('empty_list'))}</td></tr>`}</tbody></table>`;
  }
  // wires change / click / dblclick on the window pane for a window definition
  function wire(el, w, cols, rowsOf, keyOf, onSel) {
    el.onchange = (e) => {
      const x = e.target, tr = x.closest('tr[data-rid]'); if (!tr || !x.dataset.c) return;
      const row = rowsOf().find((r) => String(keyOf(r)) === tr.dataset.rid), col = cols.find((c) => c.k === x.dataset.c); if (!row || !col) return;
      App.mutate(t('edit'), () => col.set(row, x.type === 'checkbox' ? x.checked : x.value), { noSched: true });
    };
    el.onclick = (e) => {
      const tr = e.target.closest('tr[data-rid]'); if (!tr || e.target.closest('button')) return;
      wsel[w] = tr.dataset.rid; el.querySelectorAll('tr.wsel').forEach((q) => q.classList.remove('wsel')); tr.classList.add('wsel'); if (onSel) onSel();
    };
  }
  const tabsBar = (w, list) => `<div class="wtabs">${list.map(([k, l]) => `<button class="dtab${(wtab[w] || list[0][0]) === k ? ' on' : ''}" data-wt="${k}">${esc(t(l))}</button>`).join('')}</div>`;
  const shell = (bar, table, tabs, bottom) => `<div class="wbox"><div class="wtop"><div class="dockhead">${bar}</div><div class="wtable">${table}</div></div>${tabs}<div class="wbottom">${bottom}</div></div>`;
  const fld = (label, inner, cls) => `<div class="fld ${cls || ''}"><label>${esc(label)}</label>${inner}</div>`;
  const inp = (f, v, o) => `<input data-f="${f}" dir="auto" value="${esc(v == null ? '' : v)}"${o && o.ro ? ' readonly' : ''}>`;

  // ======================= Projects =======================
  async function renderProjects(el) {
    if (App.renderProjectsDB) return App.renderProjectsDB(el);
    const list = (await App.listProjects()).sort((a, b) => b.updated - a.updated);
    const cur = App.p.id, sel = wsel.projects || cur;
    const cols = [{ k: 'name', l: 'f_name', w: 280, get: (r) => r.name }, { k: 'tasks', l: 'activities', w: 90, r: 1, get: (r) => r.tasks }, { k: 'start', l: 'col_es', w: 100, get: (r) => fmtD(r.start) }, { k: 'finish', l: 'col_ef', w: 100, get: (r) => fmtD(r.finish) }, { k: 'upd', l: 'last_saved', w: 170, get: (r) => new Date(r.updated).toLocaleString() }];
    const bar = `▽ ${esc(t('display'))}: ${esc(t('all_projects'))} <span style="margin-inline-start:auto;display:flex;gap:6px"><button class="btn sm" data-a="new">${esc(t('new_project'))}</button><button class="btn sm" data-a="open">${esc(t('open_project'))}</button><button class="btn sm" data-a="default">${esc(t('set_default'))}</button><button class="btn sm dng" data-a="del">${esc(t('delete'))}</button></span>`;
    const tbl = grid(cols, list, { key: (r) => r.id, sel, rowCls: (r) => (r.id === cur ? 'curproj' : '') });
    const p = App.p;
    el.innerHTML = shell(bar, tbl, tabsBar('projects', [['general', 'tab_general']]), `<div class="grid2">${fld(t('project_name'), inp('n', p.name, { ro: 1 }))}${fld(t('plan_start'), inp('s', fmtD(p.planStart), { ro: 1 }))}${fld(t('data_date'), inp('d', fmtD(p.dataDate), { ro: 1 }))}${fld(t('must_finish'), inp('m', fmtD(p.mustFinish), { ro: 1 }))}${fld(t('activities'), inp('a', p.tasks.length, { ro: 1 }))}${fld(t('col_cal'), inp('c', (p.cals.find((c) => c.id === p.defCal) || {}).name, { ro: 1 }))}</div><button class="btn sm" data-a="settings" style="margin-top:10px">${esc(t('project_settings'))}</button>`);
    el.onclick = async (e) => {
      const tr = e.target.closest('tr[data-rid]'); if (tr && !e.target.closest('button')) { wsel.projects = tr.dataset.rid; el.querySelectorAll('tr.wsel').forEach((q) => q.classList.remove('wsel')); tr.classList.add('wsel'); return; }
      const b = e.target.closest('[data-a]'); if (!b) return;
      const id = wsel.projects || cur, a = b.dataset.a;
      if (a === 'new') D.newProject(); else if (a === 'settings') D.settings();
      else if (a === 'open') { const q = await App.loadProject(id); if (q) { App.openProject(q); App.showWin('activities'); } }
      else if (a === 'default') { try { localStorage.setItem('p6web.last', id); } catch (er) { /* */ } App.toast(t('default_set')); }
      else if (a === 'del') { if (id === cur) return App.toast(t('err_cur_proj'), true); if (confirm(t('confirm_delete_project'))) { await App.deleteProject(id); renderProjects(el); } }
    };
    el.ondblclick = async (e) => { const tr = e.target.closest('tr[data-rid]'); if (!tr) return; const q = await App.loadProject(tr.dataset.rid); if (q) { App.openProject(q); App.showWin('activities'); } };
  }

  // ======================= Resources =======================
  const RTYPES = [['RT_Labor', 'rt_RT_Labor'], ['RT_Equip', 'rt_RT_Equip'], ['RT_Mat', 'rt_RT_Mat']];
  function renderResources(el) {
    const p = App.p, rs = p.rsrc;
    const sel = Number(wsel.resources) || (rs[0] && rs[0].id), cur = rs.find((r) => r.id === sel) || rs[0];
    if (cur) wsel.resources = cur.id;
    const cols = [
      { k: 'short', l: 'res_short', w: 110, ed: 'text', get: (r) => r.short || '', set: (r, v) => { r.short = v; } },
      { k: 'name', l: 'resource', w: 330, ed: 'text', get: (r) => r.name, set: (r, v) => { r.name = v; } },
      { k: 'type', l: 'res_type', w: 120, ed: 'sel', opts: () => RTYPES.map(([a, b]) => [a, t(b)]), get: (r) => r.type, set: (r, v) => { r.type = v; } },
      { k: 'unit', l: 'unit_measure', w: 120, ed: 'text', get: (r) => r.unit || '', set: (r, v) => { r.unit = v; } },
      { k: 'role', l: 'res_role', w: 170, ed: 'sel', opts: () => [['', '—'], ...p.roles.map((x) => [x.name, x.name])], get: (r) => r.role || '', set: (r, v) => { r.role = v; } },
      { k: 'units', l: 'def_units', w: 130, ed: 'num', r: 1, get: (r) => fmtN(r.units || 8), set: (r, v) => { r.units = Math.max(0, parseFloat(String(v).replace(',', '.')) || 8); } }
    ];
    const bar = `▽ ${esc(t('display'))}: ${esc(t('cur_resources'))} <span style="margin-inline-start:auto;display:flex;gap:6px"><button class="btn sm" data-a="add">+ ${esc(t('new_resource'))}</button><button class="btn sm dng" data-a="del"${cur ? '' : ' disabled'}>${esc(t('delete'))}</button><button class="btn sm" data-a="roles">${esc(t('roles_manage'))}</button></span>`;
    const tbl = grid(cols, rs, { key: (r) => r.id, sel: cur && cur.id, rowCls: () => 'rgreen' });
    const tabs = [['general', 'tab_general'], ['details', 'res_details'], ['prices', 'units_prices'], ['roles', 'tab_roles'], ['notes', 'tab_notes'], ['udf', 'tab_udf']];
    const tab = wtab.resources || 'general';
    let bottom = '';
    if (!cur) bottom = `<div class="empty">${esc(t('no_resources'))}</div>`;
    else if (tab === 'general') bottom = `<div class="grid2">${fld(t('res_short'), inp('short', cur.short))}${fld(t('resource'), inp('name', cur.name), 'w2')}${fld(t('res_type'), `<select data-f="type">${RTYPES.map(([a, b]) => `<option value="${a}"${cur.type === a ? ' selected' : ''}>${esc(t(b))}</option>`).join('')}</select>`)}${fld(t('unit_measure'), inp('unit', cur.unit))}${fld(t('def_units'), inp('units', fmtN(cur.units || 8)))}${fld(t('price_unit'), inp('price', fmtN(cur.price || 0)))}</div>`;
    else if (tab === 'details') bottom = `<div class="grid2">${fld(t('email'), inp('email', cur.email))}${fld(t('phone'), inp('phone', cur.phone))}${fld(t('employee_code'), inp('ecode', cur.ecode))}${fld(t('col_cal'), `<select data-f="cal"><option value="">—</option>${p.cals.map((c) => `<option value="${c.id}"${cur.cal === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`)}</div>`;
    else if (tab === 'prices') {
      cur.prices = cur.prices || [];
      const pc = [
        { k: 'date', l: 'effective_date', w: 140, ed: 'date', get: (x) => fmtD(x.date), set: (x, v) => { const d = P6.parseDate(v); if (d != null) x.date = d; } },
        { k: 'max', l: 'max_units_time', w: 140, ed: 'num', r: 1, get: (x) => fmtN(x.max || cur.units || 8) + '/d', set: (x, v) => { x.max = parseFloat(String(v).replace(',', '.')) || 8; } },
        { k: 'price', l: 'standard_rate', w: 140, ed: 'num', r: 1, get: (x) => fmtN(x.price), set: (x, v) => { x.price = Math.max(0, parseFloat(String(v).replace(',', '.')) || 0); } }
      ];
      bottom = `<div style="max-width:560px">${grid(pc, cur.prices.slice().sort((a, b) => (a.date || 0) - (b.date || 0)), { key: (x) => x.id, sel: wsel.price })}</div><div style="margin-top:8px;display:flex;gap:8px"><button class="btn sm" data-a="padd">+ ${esc(t('add'))}</button><button class="btn sm dng" data-a="pdel">${esc(t('delete'))}</button></div><p class="hint">${esc(t('prices_hint'))}</p>`;
      bottom = `<div data-sub="prices">${bottom}</div>`;
    } else if (tab === 'roles') bottom = `<div class="plist" style="max-width:520px">${p.roles.map((x) => `<label class="pitem"><input type="checkbox" data-role="${x.id}"${(cur.roles || []).includes(x.id) ? ' checked' : ''}><div style="flex:1" dir="auto">${esc(x.name)}</div>${cur.role === x.name ? `<span class="badge">${esc(t('primary_role'))}</span>` : `<button class="btn sm" data-a="prim" data-name="${esc(x.name)}">${esc(t('set_primary'))}</button>`}</label>`).join('') || `<div class="empty">${esc(t('no_roles'))}</div>`}</div>`;
    else if (tab === 'notes') bottom = `<div class="fld"><label>${esc(t('tab_notes'))}</label><textarea data-f="notes" rows="6" dir="auto">${esc(cur.notes || '')}</textarea></div>`;
    else if (tab === 'udf') { const us = p.udfs.filter((u) => u.scope === 'resource'); bottom = us.length ? `<div class="grid2">${us.map((u) => fld(u.name, `<input data-uf="${u.id}" dir="auto" value="${esc((cur.udf || {})[u.id] == null ? '' : (cur.udf || {})[u.id])}">`)).join('')}</div>` : `<div class="empty">${esc(t('no_udf'))}<br><button class="btn sm" data-a="udf">${esc(t('udf_manage'))}…</button></div>`; }
    el.innerHTML = shell(bar, tbl, tabsBar('resources', tabs), bottom);
    wire(el, 'resources', cols, () => rs, (r) => r.id, () => renderResources(el));
    const baseClick = el.onclick;
    el.onclick = (e) => {
      const wt = e.target.closest('[data-wt]'); if (wt) { wtab.resources = wt.dataset.wt; return renderResources(el); }
      const a = e.target.closest('[data-a]');
      if (a) {
        const k = a.dataset.a;
        if (k === 'add') { App.mutate(t('new_resource'), () => { const r = P6.newRsrc(p, t('new_resource').replace('…', ''), 'R' + (rs.length + 1)); rs.push(r); wsel.resources = r.id; }, { noSched: true }); return renderResources(el); }
        if (k === 'del' && cur) { if (!confirm(t('confirm_generic'))) return; App.mutate(t('delete'), () => { p.rsrc = p.rsrc.filter((r) => r !== cur); p.asg = p.asg.filter((x) => x.rsrc !== cur.id); }, { noSched: true }); wsel.resources = null; return renderResources(el); }
        if (k === 'roles') return rolesDialog();
        if (k === 'udf') return D.udf();
        if (k === 'padd') { App.mutate(t('add'), () => { cur.prices.push({ id: P6.nextId(p), date: p.planStart, max: cur.units || 8, price: cur.price || 0 }); }, { noSched: true }); return renderResources(el); }
        if (k === 'pdel') { const id = +wsel.price; App.mutate(t('delete'), () => { cur.prices = cur.prices.filter((x) => x.id !== id); cur.price = cur.prices.length ? cur.prices[cur.prices.length - 1].price : cur.price; }, { noSched: true }); return renderResources(el); }
        if (k === 'prim') { App.mutate(t('edit'), () => { cur.role = a.dataset.name; }, { noSched: true }); return renderResources(el); }
      }
      const tr = e.target.closest('tr[data-rid]');
      if (tr && tr.closest('[data-sub=prices]')) { wsel.price = tr.dataset.rid; el.querySelectorAll('[data-sub] tr.wsel').forEach((q) => q.classList.remove('wsel')); tr.classList.add('wsel'); return; }
      baseClick(e);
    };
    const baseChange = el.onchange;
    el.onchange = (e) => {
      const x = e.target;
      if (x.closest('[data-sub=prices]') && x.dataset.c) { const tr = x.closest('tr'); const row = cur.prices.find((q) => String(q.id) === tr.dataset.rid), col = el.__pc && el.__pc.find((c) => c.k === x.dataset.c); void col; const pcCols = [{ k: 'date', set: (q, v) => { const d = P6.parseDate(v); if (d != null) q.date = d; } }, { k: 'max', set: (q, v) => { q.max = parseFloat(String(v).replace(',', '.')) || 8; } }, { k: 'price', set: (q, v) => { q.price = Math.max(0, parseFloat(String(v).replace(',', '.')) || 0); } }]; const c = pcCols.find((q) => q.k === x.dataset.c); if (row && c) App.mutate(t('edit'), () => { c.set(row, x.value); cur.price = cur.prices.slice().sort((a, b) => a.date - b.date).pop().price; }, { noSched: true }); return renderResources(el); }
      if (x.dataset.role) { const id = +x.dataset.role; return App.mutate(t('edit'), () => { cur.roles = cur.roles || []; if (x.checked) { if (!cur.roles.includes(id)) cur.roles.push(id); } else cur.roles = cur.roles.filter((q) => q !== id); }, { noSched: true }); }
      if (x.dataset.uf) return App.mutate(t('edit'), () => { cur.udf = cur.udf || {}; cur.udf[x.dataset.uf] = x.value; }, { noSched: true });
      if (x.dataset.f && cur) { const f = x.dataset.f; return App.mutate(t('edit'), () => { if (f === 'units' || f === 'price') cur[f] = Math.max(0, parseFloat(String(x.value).replace(',', '.')) || (f === 'units' ? 8 : 0)); else if (f === 'cal') cur.cal = x.value === '' ? null : +x.value; else cur[f] = x.value; }, { noSched: true }); }
      baseChange(e);
    };
  }
  function rolesDialog() {
    const p = App.p, body = document.createElement('div');
    const draw = () => { body.innerHTML = `<table class="mini"><thead><tr><th>${esc(t('role_name'))}</th><th style="width:130px">${esc(t('res_short'))}</th><th style="width:28px"></th></tr></thead><tbody>${p.roles.map((r) => `<tr data-r="${r.id}"><td><input data-f="name" dir="auto" value="${esc(r.name)}"></td><td><input data-f="short" value="${esc(r.short || '')}"></td><td><button class="ib" data-del="${r.id}">×</button></td></tr>`).join('') || `<tr><td colspan="3" class="empty">${esc(t('no_roles'))}</td></tr>`}</tbody></table><div style="margin-top:8px"><button class="btn sm" id="ro_add">+ ${esc(t('add'))}</button></div>`; };
    draw();
    D.modal({ title: t('roles_manage'), cls: 'mid', body, buttons: [{ label: t('close'), cls: 'pri', fn: () => {} }], onClose: () => App.refresh() });
    body.onclick = (e) => {
      if (e.target.id === 'ro_add') { const n = prompt(t('role_name'), ''); if (n) { App.mutate(t('add'), () => { p.roles.push({ id: P6.nextId(p), name: n, short: n.slice(0, 10) }); }, { noSched: true }); draw(); } }
      const d = e.target.closest('[data-del]'); if (d) { const id = +d.dataset.del; App.mutate(t('delete'), () => { p.roles = p.roles.filter((r) => r.id !== id); p.rsrc.forEach((r) => { r.roles = (r.roles || []).filter((q) => q !== id); }); p.asg.forEach((a) => { if (a.role === id) delete a.role; }); }, { noSched: true }); draw(); }
    };
    body.onchange = (e) => { const tr = e.target.closest('tr[data-r]'); if (!tr) return; const r = p.roles.find((x) => x.id === +tr.dataset.r); const old = r.name; App.mutate(t('edit'), () => { r[e.target.dataset.f] = e.target.value; if (e.target.dataset.f === 'name') p.rsrc.forEach((q) => { if (q.role === old) q.role = e.target.value; }); }, { noSched: true }); };
  }
  App.rolesDialog = rolesDialog;

  // ======================= Resource Assignments =======================
  const MEASURES = [['bu', 'ra_bu'], ['au', 'ra_au'], ['ru', 'ra_ru'], ['bc', 'ra_bc'], ['ac', 'ra_ac'], ['rc', 'ra_rc']];
  function asgNums(a, tk, r) {
    const sp = P6.asgSplit(a, tk), price = a.price != null ? +a.price : P6.priceAt(r || {}, tk.es);
    return { bu: a.qty, au: sp.act, ru: sp.rem, bc: a.qty * price, ac: sp.act * price, rc: sp.rem * price, price };
  }
  function phased(a, tk, measure, periods) {
    const cal = App.p.cals.find((c) => c.id === tk.cal) || App.p.cals[0], dd = App.p.dataDate;
    const days = []; for (let d = tk.es; d <= tk.ef; d++) if (P6.isWork(cal, d)) days.push(d);
    if (!days.length) days.push(tk.es);
    const r = App.p.rsrc.find((x) => x.id === a.rsrc) || {}, N = asgNums(a, tk, r);
    const total = N[measure] || 0, kind = measure[0] === 'a' ? 'act' : measure[0] === 'r' ? 'rem' : 'bud';
    const out = new Float64Array(periods.length);
    const w = (d) => (kind === 'bud' ? 1 : kind === 'act' ? (d <= dd ? 1 : 0) : (d > dd ? 1 : 0));
    const tw = days.reduce((s, d) => s + w(d), 0) || 1;
    for (const d of days) { const ww = w(d); if (!ww) continue; for (let i = 0; i < periods.length; i++) if (d >= periods[i][0] && d < periods[i][1]) { out[i] += (total * ww) / tw; break; } }
    return out;
  }
  function renderAssign(el) {
    const p = App.p, tmap = new Map(p.tasks.map((x) => [x.id, x])), rmap = new Map(p.rsrc.map((x) => [x.id, x])), amap = new Map(p.accounts.map((x) => [x.id, x]));
    const measure = App.cfg.raMeasure || 'ru';
    const list = p.asg.filter((a) => tmap.has(a.task) && rmap.has(a.rsrc)).sort((a, b) => tmap.get(a.task).code.localeCompare(tmap.get(b.task).code, undefined, { numeric: true }));
    const groups = new Map(); for (const a of list) { const k = a.acct != null && amap.has(a.acct) ? a.acct : 0; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(a); }
    const rows = [];
    for (const [k, l] of [...groups].sort((x, y) => x[0] - y[0])) { rows.push({ g: k, l }); l.forEach((a) => rows.push(a)); }
    const sel = Number(wsel.assign) || (list[0] && list[0].id), cur = list.find((a) => a.id === sel) || list[0];
    if (cur) wsel.assign = cur.id;
    // periods (months) across the project
    const o = App.gantt.o, periods = []; let d = P6.mkDay(P6.ymd(o.minDay).y, P6.ymd(o.minDay).m, 1);
    while (d < o.maxDay && periods.length < 60) { const y = P6.ymd(d), nx = P6.mkDay(y.y, y.m + 1, 1); periods.push([d, nx, P6.MON[y.m] + ' ' + String(y.y).slice(2)]); d = nx; }
    const phaseCols = periods.map((pr, i) => ({ k: 'p' + i, lt: pr[2], w: 64, r: 1, get: (a) => { if (a.g != null) return ''; const tk = tmap.get(a.task); if (!tk || tk.es == null) return ''; const v = phased(a, tk, measure, periods)[i]; return v ? fmtN(v) : ''; } }));
    const isG = (r) => r.g != null;
    const cols = [
      { k: 'code', l: 'col_code', w: 100, get: (a) => (isG(a) ? '' : tmap.get(a.task).code) },
      { k: 'name', l: 'col_name', w: 230, get: (a) => (isG(a) ? '' : tmap.get(a.task).name) },
      { k: 'res', l: 'res_id_name', w: 200, get: (a) => (isG(a) ? '' : (rmap.get(a.rsrc).short || '') + ' ' + rmap.get(a.rsrc).name) },
      { k: 'type', l: 'res_type', w: 90, get: (a) => (isG(a) ? '' : t(RTYPES.find((x) => x[0] === rmap.get(a.rsrc).type)[1])) },
      { k: 'start', l: 'col_es', w: 92, get: (a) => (isG(a) ? '' : fmtD(a.as != null ? a.as : tmap.get(a.task).es)) },
      { k: 'finish', l: 'col_ef', w: 92, get: (a) => (isG(a) ? '' : fmtD(a.af != null ? a.af : tmap.get(a.task).ef)) },
      { k: 'bu', l: 'col_bu', w: 100, r: 1, ed: 'num', get: (a) => (isG(a) ? '' : fmtN(a.qty)), set: (a, v) => { a.qty = Math.max(0, parseFloat(String(v).replace(',', '.')) || 0); } },
      { k: 'bc', l: 'col_bc', w: 110, r: 1, get: (a) => (isG(a) ? '' : money(asgNums(a, tmap.get(a.task), rmap.get(a.rsrc)).bc)) }
    ];
    const allCols = cols.concat(phaseCols);
    const bar = `▽ ${esc(t('layout'))}: ${esc(t('lay_assign'))} <span style="margin-inline-start:auto;display:flex;gap:8px;align-items:center">${esc(t('display'))}: <select id="ra_m" class="inp" style="height:22px">${MEASURES.map(([k, l]) => `<option value="${k}"${measure === k ? ' selected' : ''}>${esc(t(l))}</option>`).join('')}</select></span>`;
    const tbl = grid(allCols, rows, {
      key: (r) => (isG(r) ? 'g' + r.g : r.id), sel: cur && cur.id,
      rowCls: (r) => (isG(r) ? 'bandrow' : ''),
      groupRow: (r) => (isG(r) ? `<b>${esc(r.g ? (amap.get(r.g).code + ' – ' + amap.get(r.g).name) : t('no_cost_account'))}</b> <span style="float:right;margin-inline-end:20px">${esc(t('col_bu'))}: ${fmtN(r.l.reduce((s, a) => s + a.qty, 0))} · ${esc(t('col_bc'))}: ${money(r.l.reduce((s, a) => s + asgNums(a, tmap.get(a.task), rmap.get(a.rsrc)).bc, 0))}</span>` : '')
    }).replace('<table class="mini pw">', '<table class="mini pw wideg">');
    const tabs = [['general', 'tab_general'], ['planning', 'tab_planning']];
    const tab = wtab.assign || 'general';
    let bottom = '';
    if (!cur) bottom = `<div class="empty">${esc(t('no_assignments'))}</div>`;
    else {
      const tk = tmap.get(cur.task), r = rmap.get(cur.rsrc), N = asgNums(cur, tk, r);
      if (tab === 'general') bottom = `<div class="grid2">${fld(t('col_name'), inp('x', tk.code + ' · ' + tk.name, { ro: 1 }), 'w2')}
        ${fld(t('resource'), `<select data-f="rsrc">${p.rsrc.map((x) => `<option value="${x.id}"${x.id === cur.rsrc ? ' selected' : ''}>${esc((x.short || '') + ' ' + x.name)}</option>`).join('')}</select>`, 'w2')}
        ${fld(t('role'), `<select data-f="role"><option value="">—</option>${p.roles.map((x) => `<option value="${x.id}"${cur.role === x.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`)}
        ${fld(t('cost_account'), `<select data-f="acct"><option value="">${esc(t('no_cost_account'))}</option>${p.accounts.map((x) => `<option value="${x.id}"${cur.acct === x.id ? ' selected' : ''}>${esc(x.code + ' – ' + x.name)}</option>`).join('')}</select><button class="btn sm" data-a="accts" style="margin-top:4px">${esc(t('manage_accounts'))}</button>`)}
        ${fld(t('price_unit'), inp('price', fmtN(N.price)))}${fld(t('rate_type'), `<select data-f="rate"><option>Standard Rate</option></select>`)}
        <label class="chk"><input type="checkbox" data-f="primary"${cur.primary ? ' checked' : ''}> ${esc(t('primary_resource'))}</label></div>`;
      else bottom = `<div class="grid2">${fld(t('col_bu'), inp('qty', fmtN(cur.qty)))}${fld(t('col_au'), inp('act', fmtN(N.au)))}${fld(t('col_ru'), inp('rem', fmtN(N.ru)))}${fld(t('units_time'), inp('x1', fmtN(cur.qty / Math.max(1, tk.dur)) + 'h/d', { ro: 1 }))}${fld(t('col_dur'), inp('x2', fmtN(tk.dur), { ro: 1 }))}${fld(t('col_bc'), inp('x3', money(N.bc), { ro: 1 }))}${fld(t('col_as'), inp('as', fmtD(cur.as)))}${fld(t('col_af'), inp('af', fmtD(cur.af)))}</div>`;
    }
    el.innerHTML = shell(bar, `<div class="wscroll">${tbl}</div>`, tabsBar('assign', tabs), bottom);
    wire(el, 'assign', allCols, () => list, (r) => r.id, () => renderAssign(el));
    el.querySelectorAll('tr.bandrow td').forEach(() => {});
    const baseClick = el.onclick;
    el.onclick = (e) => {
      const wt = e.target.closest('[data-wt]'); if (wt) { wtab.assign = wt.dataset.wt; return renderAssign(el); }
      if (e.target.dataset.a === 'accts') return accountsDialog();
      const tr = e.target.closest('tr[data-rid]'); if (tr && tr.dataset.rid.startsWith('g')) return;
      baseClick(e);
    };
    $('#ra_m', el).onchange = (e) => { App.cfg.raMeasure = e.target.value; App.saveCfg(); renderAssign(el); };
    const baseChange = el.onchange;
    el.onchange = (e) => {
      const x = e.target;
      if (x.dataset.f && cur) {
        const f = x.dataset.f, tk = tmap.get(cur.task);
        return App.mutate(t('edit'), () => {
          const num = () => parseFloat(String(x.value).replace(',', '.')) || 0;
          if (f === 'rsrc') cur.rsrc = +x.value; else if (f === 'role') { if (x.value === '') delete cur.role; else cur.role = +x.value; }
          else if (f === 'acct') { if (x.value === '') delete cur.acct; else cur.acct = +x.value; }
          else if (f === 'price') cur.price = Math.max(0, num());
          else if (f === 'primary') { p.asg.forEach((q) => { if (q.task === cur.task) delete q.primary; }); if (x.checked) cur.primary = true; }
          else if (f === 'qty') { cur.qty = Math.max(0, num()); if (cur.manual) cur.rem = Math.max(0, cur.qty - (cur.act || 0)); }
          else if (f === 'act') { cur.manual = true; cur.act = Math.max(0, num()); cur.rem = Math.max(0, cur.qty - cur.act); }
          else if (f === 'rem') { const sp = P6.asgSplit(cur, tk); cur.manual = true; cur.act = sp.act; cur.rem = Math.max(0, num()); }
          else if (f === 'as' || f === 'af') cur[f] = x.value.trim() ? P6.parseDate(x.value) : null;
        }, { noSched: true });
      }
      baseChange(e);
    };
  }
  function accountsDialog() {
    const p = App.p, body = document.createElement('div');
    const draw = () => { body.innerHTML = `<table class="mini"><thead><tr><th style="width:130px">${esc(t('code_short'))}</th><th>${esc(t('col_name'))}</th><th style="width:28px"></th></tr></thead><tbody>${p.accounts.map((a) => `<tr data-a="${a.id}"><td><input data-f="code" value="${esc(a.code)}"></td><td><input data-f="name" dir="auto" value="${esc(a.name)}"></td><td><button class="ib" data-del="${a.id}">×</button></td></tr>`).join('') || `<tr><td colspan="3" class="empty">${esc(t('empty_list'))}</td></tr>`}</tbody></table><div style="margin-top:8px"><button class="btn sm" id="ac_add">+ ${esc(t('add'))}</button></div>`; };
    draw();
    D.modal({ title: t('manage_accounts'), cls: 'mid', body, buttons: [{ label: t('close'), cls: 'pri', fn: () => {} }], onClose: () => App.refresh() });
    body.onclick = (e) => {
      if (e.target.id === 'ac_add') { App.mutate(t('add'), () => { p.accounts.push({ id: P6.nextId(p), code: 'CA' + (p.accounts.length + 1), name: t('cost_account'), parent: null }); }, { noSched: true }); draw(); }
      const d = e.target.closest('[data-del]'); if (d) { const id = +d.dataset.del; App.mutate(t('delete'), () => { p.accounts = p.accounts.filter((a) => a.id !== id); p.asg.forEach((a) => { if (a.acct === id) delete a.acct; }); }, { noSched: true }); draw(); }
    };
    body.onchange = (e) => { const tr = e.target.closest('tr[data-a]'); if (!tr) return; const a = p.accounts.find((x) => x.id === +tr.dataset.a); App.mutate(t('edit'), () => { a[e.target.dataset.f] = e.target.value; }, { noSched: true }); };
  }
  App.accountsDialog = accountsDialog;

  // ======================= WBS =======================
  function renderWbs(el) {
    const p = App.p, ru = App.ru || P6.rollup(p), M = App.getCtx().M;
    const by = new Map(p.wbs.map((w) => [w.id, w]));
    const order = [], kids = (id) => p.wbs.filter((w) => w.parent === id).sort((a, b) => (a.seq - b.seq) || a.code.localeCompare(b.code, undefined, { numeric: true }));
    const walk = (w, lv) => { order.push({ w, lv }); kids(w.id).forEach((k) => walk(k, lv + 1)); };
    p.wbs.filter((w) => w.parent == null || !by.has(w.parent)).forEach((w) => walk(w, 0));
    const sel = Number(wsel.wbs) || (order[0] && order[0].w.id), cur = by.get(sel) || (order[0] && order[0].w);
    if (cur) wsel.wbs = cur.id;
    const cols = [
      { k: 'code', l: 'wbs_code_col', w: 160, ed: 'text', get: (r) => r.w.code, set: (r, v) => { r.w.code = v; } },
      { k: 'name', l: 'wbs_name_col', w: 320, ed: 'text', get: (r) => r.w.name, set: (r, v) => { r.w.name = v; } },
      { k: 'n', l: 'activities', w: 90, r: 1, get: (r) => (ru.get(r.w.id) || {}).count },
      { k: 'es', l: 'col_es', w: 96, get: (r) => fmtD((ru.get(r.w.id) || {}).es) }, { k: 'ef', l: 'col_ef', w: 96, get: (r) => fmtD((ru.get(r.w.id) || {}).ef) },
      { k: 'pct', l: 'col_pct', w: 90, r: 1, get: (r) => ((ru.get(r.w.id) || {}).pct || 0) + '%' }, { k: 'bc', l: 'col_bc', w: 120, r: 1, get: (r) => money((M.W.get(r.w.id) || {}).bc) }
    ];
    const WC = [['#0000ff', '#fff'], ['#66ff66', '#000'], ['#ffff00', '#000'], ['#0000ff', '#fff'], ['#ff0000', '#fff']];
    const bar = `▽ ${esc(t('display'))}: ${esc(t('win_wbs'))} <span style="margin-inline-start:auto;display:flex;gap:6px"><button class="btn sm" data-a="add">+ ${esc(t('add_wbs'))}</button><button class="btn sm" data-a="ind">${esc(t('indent'))}</button><button class="btn sm" data-a="out">${esc(t('outdent'))}</button><button class="btn sm dng" data-a="del">${esc(t('delete'))}</button></span>`;
    const tbl = grid(cols, order, { key: (r) => r.w.id, sel: cur && cur.id, rowStyle: (r) => `background:${WC[r.lv % 5][0]};color:${WC[r.lv % 5][1]};font-weight:700` });
    const tabs = [['general', 'tab_general'], ['notes', 'tab_notes']];
    const tab = wtab.wbs || 'general';
    let bottom = '';
    if (cur) bottom = tab === 'general' ? `<div class="grid2">${fld(t('wbs_code_col'), inp('code', cur.code))}${fld(t('wbs_name_col'), inp('name', cur.name), 'w2')}${fld(t('parent_wbs'), `<select data-f="parent"><option value="">—</option>${p.wbs.filter((x) => x.id !== cur.id).map((x) => `<option value="${x.id}"${cur.parent === x.id ? ' selected' : ''}>${esc(x.code + ' – ' + x.name)}</option>`).join('')}</select>`)}</div>` : `<div class="fld"><label>${esc(t('tab_notes'))}</label><textarea data-f="notes" rows="6" dir="auto">${esc(cur.notes || '')}</textarea></div>`;
    el.innerHTML = shell(bar, tbl, tabsBar('wbs', tabs), bottom);
    wire(el, 'wbs', cols, () => order, (r) => r.w.id, () => renderWbs(el));
    const baseClick = el.onclick;
    el.onclick = (e) => {
      const wt = e.target.closest('[data-wt]'); if (wt) { wtab.wbs = wt.dataset.wt; return renderWbs(el); }
      const b = e.target.closest('[data-a]');
      if (b && cur) { App.setSel(['w' + cur.id]); const a = b.dataset.a; if (a === 'add') App.addWbs(); else if (a === 'ind') App.indent(); else if (a === 'out') App.outdent(); else if (a === 'del') App.del(); setTimeout(() => renderWbs(el), 30); return; }
      baseClick(e);
    };
    const baseChange = el.onchange;
    el.onchange = (e) => {
      const x = e.target;
      if (x.dataset.f && cur) { const f = x.dataset.f; return App.mutate(t('edit'), () => { if (f === 'parent') { const np = x.value === '' ? null : +x.value; const desc = (id) => [id, ...p.wbs.filter((q) => q.parent === id).flatMap((q) => desc(q.id))]; if (np != null && desc(cur.id).includes(np)) return t('err_loop'); cur.parent = np; } else cur[f] = x.value; }, { noSched: true }); }
      baseChange(e);
    };
  }

  // ======================= Expenses / Docs / Risks (project-wide lists of the per-activity items) =======================
  function flat(key) { const out = []; for (const tk of App.p.tasks) for (const it of tk[key] || []) out.push({ tk, it }); return out; }
  function listWindow(el, w, key, cfg) {
    const p = App.p, rows = flat(key);
    const sel = wsel[w], cols = cfg.cols;
    const bar = `▽ ${esc(t('display'))}: ${esc(t(WINS[w].title))} <span style="margin-inline-start:auto;display:flex;gap:6px;align-items:center"><select id="lw_t" class="inp" style="height:22px;max-width:260px">${p.tasks.map((x) => `<option value="${x.id}"${String(wsel[w + 'T']) === String(x.id) ? ' selected' : ''}>${esc(x.code + ' – ' + x.name)}</option>`).join('')}</select><button class="btn sm" data-a="add">+ ${esc(t('add'))}</button><button class="btn sm dng" data-a="del">${esc(t('delete'))}</button></span>`;
    el.innerHTML = `<div class="wbox"><div class="wtop" style="flex:1"><div class="dockhead">${bar}</div><div class="wtable">${grid(cols, rows, { key: (r) => r.it.id, sel })}</div></div></div>`;
    el.onchange = (e) => {
      const x = e.target; if (x.id === 'lw_t') { wsel[w + 'T'] = x.value; return; }
      const tr = x.closest('tr[data-rid]'); if (!tr || !x.dataset.c) return; const row = rows.find((r) => String(r.it.id) === tr.dataset.rid), col = cols.find((c) => c.k === x.dataset.c); if (!row || !col) return;
      App.mutate(t('edit'), () => { col.set(row, x.value); if (key === 'expenses') row.tk.exp = row.tk.expenses.reduce((a, q) => a + (+q.budget || 0), 0); }, { noSched: true });
    };
    el.onclick = (e) => {
      const tr = e.target.closest('tr[data-rid]'); if (tr && !e.target.closest('button')) { wsel[w] = tr.dataset.rid; el.querySelectorAll('tr.wsel').forEach((q) => q.classList.remove('wsel')); tr.classList.add('wsel'); return; }
      const b = e.target.closest('[data-a]'); if (!b) return;
      if (b.dataset.a === 'add') { const tid = +($('#lw_t', el).value || (p.tasks[0] || {}).id), tk = App.taskById(tid); if (!tk) return; App.mutate(t('add'), () => { const o = cfg.fresh(); o.id = P6.nextId(p); (tk[key] = tk[key] || []).push(o); if (key === 'expenses') tk.exp = tk.expenses.reduce((a, q) => a + (+q.budget || 0), 0); }, { noSched: true }); }
      else { const row = rows.find((r) => String(r.it.id) === String(wsel[w])); if (!row) return; App.mutate(t('delete'), () => { row.tk[key] = row.tk[key].filter((q) => q !== row.it); if (key === 'expenses') row.tk.exp = row.tk.expenses.reduce((a, q) => a + (+q.budget || 0), 0); }, { noSched: true }); }
    };
  }
  const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? 0 : n; };
  const actCols = [{ k: 'code', l: 'col_code', w: 100, get: (r) => r.tk.code }, { k: 'aname', l: 'col_name', w: 240, get: (r) => r.tk.name }];
  function renderExpenses(el) {
    listWindow(el, 'expenses', 'expenses', { fresh: () => ({ name: t('new_expense'), vendor: '', budget: 0 }), cols: actCols.concat([
      { k: 'name', l: 'f_name', w: 220, ed: 'text', get: (r) => r.it.name, set: (r, v) => { r.it.name = v; } }, { k: 'vendor', l: 'f_vendor', w: 160, ed: 'text', get: (r) => r.it.vendor || '', set: (r, v) => { r.it.vendor = v; } },
      { k: 'budget', l: 'f_budget', w: 130, ed: 'num', r: 1, get: (r) => fmtN(r.it.budget), set: (r, v) => { r.it.budget = Math.max(0, num(v)); } },
      { k: 'act', l: 'f_actual_cost', w: 130, r: 1, get: (r) => money((+r.it.budget || 0) * (r.tk.status === 'C' ? 1 : (r.tk.pct || 0) / 100)) },
      { k: 'rem', l: 'col_rc', w: 130, r: 1, get: (r) => money((+r.it.budget || 0) * (r.tk.status === 'C' ? 0 : 1 - (r.tk.pct || 0) / 100)) }]) });
  }
  function renderDocs(el) {
    listWindow(el, 'docs', 'docs', { fresh: () => ({ title: t('new_doc'), url: '', notes: '' }), cols: actCols.concat([
      { k: 'title', l: 'f_title', w: 240, ed: 'text', get: (r) => r.it.title, set: (r, v) => { r.it.title = v; } }, { k: 'url', l: 'f_url', w: 340, ed: 'text', get: (r) => r.it.url || '', set: (r, v) => { r.it.url = v; } }, { k: 'notes', l: 'f_notes', w: 260, ed: 'text', get: (r) => r.it.notes || '', set: (r, v) => { r.it.notes = v; } }]) });
  }
  function renderRisks(el) {
    const sc = [1, 2, 3, 4, 5].map((n) => [n, String(n)]);
    listWindow(el, 'risks', 'risks', { fresh: () => ({ name: t('new_risk'), prob: 3, impact: 3, status: 'Open', notes: '' }), cols: actCols.concat([
      { k: 'name', l: 'f_name', w: 260, ed: 'text', get: (r) => r.it.name, set: (r, v) => { r.it.name = v; } },
      { k: 'prob', l: 'f_prob', w: 110, ed: 'sel', opts: () => sc, get: (r) => r.it.prob, set: (r, v) => { r.it.prob = +v; } }, { k: 'impact', l: 'f_impact', w: 110, ed: 'sel', opts: () => sc, get: (r) => r.it.impact, set: (r, v) => { r.it.impact = +v; } },
      { k: 'score', l: 'f_risk_score', w: 80, r: 1, get: (r) => (+r.it.prob || 1) * (+r.it.impact || 1) },
      { k: 'status', l: 'f_status', w: 120, ed: 'sel', opts: () => ['Open', 'Mitigated', 'Closed'].map((x) => [x, x]), get: (r) => r.it.status, set: (r, v) => { r.it.status = v; } },
      { k: 'notes', l: 'f_notes', w: 240, ed: 'text', get: (r) => r.it.notes || '', set: (r, v) => { r.it.notes = v; } }]) });
  }

  // ======================= Issues & Thresholds =======================
  function renderIssues(el) {
    const p = App.p, rows = p.issues;
    const cols = [
      { k: 'name', l: 'f_name', w: 300, ed: 'text', get: (r) => r.name, set: (r, v) => { r.name = v; } },
      { k: 'task', l: 'activity', w: 220, ed: 'sel', opts: () => [['', '—'], ...p.tasks.map((x) => [x.id, x.code + ' – ' + x.name])], get: (r) => (r.task == null ? '' : r.task), set: (r, v) => { r.task = v === '' ? null : +v; } },
      { k: 'status', l: 'f_status', w: 120, ed: 'sel', opts: () => ['Open', 'In Progress', 'Closed'].map((x) => [x, x]), get: (r) => r.status, set: (r, v) => { r.status = v; } },
      { k: 'prio', l: 'priority', w: 110, ed: 'sel', opts: () => ['Top', 'High', 'Normal', 'Low'].map((x) => [x, x]), get: (r) => r.priority, set: (r, v) => { r.priority = v; } },
      { k: 'resp', l: 'responsible', w: 150, ed: 'text', get: (r) => r.resp || '', set: (r, v) => { r.resp = v; } },
      { k: 'date', l: 'f_date', w: 110, ed: 'date', get: (r) => fmtD(r.date), set: (r, v) => { const d = P6.parseDate(v); if (d != null) r.date = d; } },
      { k: 'notes', l: 'f_notes', w: 280, ed: 'text', get: (r) => r.notes || '', set: (r, v) => { r.notes = v; } }
    ];
    const sel = wsel.issues;
    const bar = `▽ ${esc(t('display'))}: ${esc(t('win_issues'))} <span style="margin-inline-start:auto;display:flex;gap:6px"><button class="btn sm" data-a="add">+ ${esc(t('add'))}</button><button class="btn sm dng" data-a="del">${esc(t('delete'))}</button></span>`;
    el.innerHTML = `<div class="wbox"><div class="wtop" style="flex:1"><div class="dockhead">${bar}</div><div class="wtable">${grid(cols, rows, { key: (r) => r.id, sel })}</div></div></div>`;
    wire(el, 'issues', cols, () => rows, (r) => r.id);
    const base = el.onclick;
    el.onclick = (e) => {
      const b = e.target.closest('[data-a]');
      if (b && b.dataset.a === 'add') { App.mutate(t('add'), () => { rows.push({ id: P6.nextId(p), name: t('new_issue'), task: null, status: 'Open', priority: 'Normal', resp: '', date: p.dataDate, notes: '' }); }, { noSched: true }); return; }
      if (b && b.dataset.a === 'del') { const id = +wsel.issues; App.mutate(t('delete'), () => { p.issues = p.issues.filter((x) => x.id !== id); }, { noSched: true }); return; }
      base(e);
    };
  }
  const TPARAM = {
    tf: { l: 'col_tf', v: (tk) => tk.tf }, fvar: { l: 'col_vf', v: (tk) => (tk.ef != null && tk.bf != null ? tk.ef - tk.bf : null) }, svar: { l: 'col_vs', v: (tk) => (tk.es != null && tk.bs != null ? tk.es - tk.bs : null) },
    pct: { l: 'col_pct', v: (tk) => tk.pct }, rem: { l: 'col_rem', v: (tk) => (tk.status === 'C' ? null : tk.rem) }
  };
  function renderThresholds(el) {
    const p = App.p, rows = p.thresholds;
    const cols = [
      { k: 'param', l: 'th_param', w: 220, ed: 'sel', opts: () => Object.keys(TPARAM).map((k) => [k, t(TPARAM[k].l)]), get: (r) => r.param, set: (r, v) => { r.param = v; } },
      { k: 'op', l: 'th_op', w: 90, ed: 'sel', opts: () => [['lt', '<'], ['gt', '>']], get: (r) => r.op, set: (r, v) => { r.op = v; } },
      { k: 'value', l: 'th_value', w: 100, ed: 'num', r: 1, get: (r) => fmtN(r.value), set: (r, v) => { r.value = num(v); } },
      { k: 'prio', l: 'priority', w: 110, ed: 'sel', opts: () => ['Top', 'High', 'Normal', 'Low'].map((x) => [x, x]), get: (r) => r.priority, set: (r, v) => { r.priority = v; } },
      { k: 'resp', l: 'responsible', w: 150, ed: 'text', get: (r) => r.resp || '', set: (r, v) => { r.resp = v; } },
      { k: 'on', l: 'th_active', w: 80, ed: 'chk', get: (r) => r.active !== false, set: (r, v) => { r.active = !!v; } }
    ];
    const bar = `▽ ${esc(t('display'))}: ${esc(t('win_thresholds'))} <span style="margin-inline-start:auto;display:flex;gap:6px"><button class="btn sm" data-a="add">+ ${esc(t('add'))}</button><button class="btn sm dng" data-a="del">${esc(t('delete'))}</button><button class="btn sm pri" data-a="mon">${esc(t('monitor_thresholds'))}</button></span>`;
    el.innerHTML = `<div class="wbox"><div class="wtop" style="flex:1"><div class="dockhead">${bar}</div><div class="wtable">${grid(cols, rows, { key: (r) => r.id, sel: wsel.thresholds })}</div><p class="hint" style="padding:8px 12px">${esc(t('th_hint'))}</p></div></div>`;
    wire(el, 'thresholds', cols, () => rows, (r) => r.id);
    const base = el.onclick;
    el.onclick = (e) => {
      const b = e.target.closest('[data-a]');
      if (b && b.dataset.a === 'add') { App.mutate(t('add'), () => { rows.push({ id: P6.nextId(p), param: 'tf', op: 'lt', value: 0, priority: 'High', resp: '', active: true }); }, { noSched: true }); return; }
      if (b && b.dataset.a === 'del') { const id = +wsel.thresholds; App.mutate(t('delete'), () => { p.thresholds = p.thresholds.filter((x) => x.id !== id); }, { noSched: true }); return; }
      if (b && b.dataset.a === 'mon') return App.monitorThresholds();
      base(e);
    };
  }
  App.monitorThresholds = function () {
    const p = App.p; let n = 0;
    App.mutate(t('monitor_thresholds'), () => {
      p.issues = p.issues.filter((i) => !i.auto);
      for (const th of p.thresholds) {
        if (th.active === false) continue; const P = TPARAM[th.param]; if (!P) continue;
        for (const tk of p.tasks) {
          if (tk.status === 'C') continue; const v = P.v(tk); if (v == null) continue;
          if (th.op === 'lt' ? v < th.value : v > th.value) { p.issues.push({ id: P6.nextId(p), name: t(P.l) + ' ' + (th.op === 'lt' ? '<' : '>') + ' ' + fmtN(th.value), task: tk.id, status: 'Open', priority: th.priority, resp: th.resp || '', date: p.dataDate, notes: tk.code + ' · ' + tk.name + ' = ' + fmtN(v), auto: true, th: th.id }); n++; }
        }
      }
    }, { noSched: true });
    App.toast(t('th_found', n));
    if (App.win === 'thresholds') App.showWin('issues');
  };

  // ======================= render dispatcher =======================
  const R = { projects: renderProjects, resources: renderResources, assign: renderAssign, wbs: renderWbs, expenses: renderExpenses, docs: renderDocs, thresholds: renderThresholds, issues: renderIssues, risks: renderRisks };
  App.renderWin = function () {
    const el = $('#winpane'); if (!el || App.win === 'activities') return;
    const fn = R[App.win]; if (fn) fn(el);
  };
})(window);

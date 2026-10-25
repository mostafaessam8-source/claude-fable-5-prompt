/* P6 Web – complete Edit / Project / View / Enterprise / Tools / Admin menus (P6 structure) and the features behind them. */
(function (g) {
  'use strict';
  const P6 = g.P6, App = g.App, D = App.dialogs;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = P6.esc, t = (k, ...a) => P6.t(k, ...a);
  const fmtD = P6.fmtDate, fmtN = (n) => (n == null || !isFinite(n) ? '' : String(Math.round(n * 100) / 100));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const modal = (o) => D.modal(o);
  const F = () => App.cfg;
  const sub = (l, i, fn, o) => Object.assign({ l, i, fn }, o || {});

  // ================= Edit features =================
  App.selectAll = () => { App.setSel(App.rows.map((r) => r.kind + r.id)); };
  App.fillDown = function () {
    const ts = App.selTasks(), k = App.cell && App.cell.k;
    if (ts.length < 2 || !k) return App.toast(t('fill_need'), true);
    const first = ts.slice().sort((a, b) => App.rowIdx.get('t' + a.id) - App.rowIdx.get('t' + b.id))[0];
    const raw = App.rawValue(k, { kind: 't', t: first });
    let err = null;
    App.mutate(t('mi_filldown'), () => { for (const tk of ts) { if (tk === first) continue; const e = App.applyField(tk, k, raw); if (e && !err) err = e; } if (err) return err; });
  };
  App.dissolve = function () {
    const ws = App.selWbs().filter((w) => w.parent != null);
    if (!ws.length) return App.toast(t('err_wbs_only'), true);
    App.mutate(t('mi_dissolve'), () => {
      for (const w of ws) { App.p.wbs.forEach((x) => { if (x.parent === w.id) x.parent = w.parent; }); App.p.tasks.forEach((x) => { if (x.wbs === w.id) x.wbs = w.parent; }); App.p.wbs = App.p.wbs.filter((x) => x !== w); }
      App.sel.clear(); App.focus = null;
    });
  };
  App.renumber = function () {
    const sel = App.selTasks();
    const body = `<div class="grid2"><div class="fld"><label>${esc(t('rn_prefix'))}</label><input id="rn_p" value="A"></div><div class="fld"><label>${esc(t('rn_start'))}</label><input id="rn_s" value="1000"></div><div class="fld"><label>${esc(t('rn_inc'))}</label><input id="rn_i" value="10"></div>
      <div class="fld"><label>${esc(t('rn_scope'))}</label><select id="rn_sc"><option value="all">${esc(t('rn_all'))}</option><option value="sel"${sel.length > 1 ? ' selected' : ''}>${esc(t('rn_sel'))} (${sel.length})</option></select></div></div><p class="hint">${esc(t('rn_hint'))}</p>`;
    modal({ title: t('mi_renumber'), cls: 'mid', body, buttons: [{ label: t('cancel'), fn: () => {} }, { label: t('apply'), cls: 'pri', fn: (c, el) => {
      const pre = $('#rn_p', el).value, st = parseInt($('#rn_s', el).value, 10) || 1000, inc = Math.max(1, parseInt($('#rn_i', el).value, 10) || 10);
      const scope = $('#rn_sc', el).value;
      const order = App.rows.filter((r) => r.kind === 't' && (scope === 'all' || App.sel.has('t' + r.id))).map((r) => r.t);
      App.mutate(t('mi_renumber'), () => { const used = new Set(App.p.tasks.filter((x) => !order.includes(x)).map((x) => x.code.toLowerCase())); let n = st; for (const tk of order) { let c2 = pre + n; while (used.has(c2.toLowerCase())) { n += inc; c2 = pre + n; } tk.code = c2; used.add(c2.toLowerCase()); n += inc; } }, { noSched: true });
      App.toast(t('rn_done', order.length));
    } }] });
  };
  // ----- find / replace
  let findState = { text: '', field: 'any', cs: false, idx: -1 };
  function matches(tk) {
    const q = findState.cs ? findState.text : findState.text.toLowerCase(); if (!q) return false;
    const norm = (s) => (findState.cs ? String(s) : String(s).toLowerCase());
    return (findState.field !== 'name' && norm(tk.code).includes(q)) || (findState.field !== 'code' && norm(tk.name).includes(q));
  }
  App.findNext = function (back) {
    if (!findState.text) return App.dialogs.find();
    const rows = App.rows; if (!rows.length) return;
    const n = rows.length; let i = App.rowIdx.get(App.focus); i = i == null ? (back ? 0 : -1) : i;
    for (let c = 1; c <= n; c++) { const k = back ? (i - c + n * 2) % n : (i + c) % n; const r = rows[k]; if (r.kind === 't' && matches(r.t)) { App.selectRow(r, null); App.ensureVisible(k); return; } }
    App.toast(t('find_none'), true);
  };
  D.find = function () {
    const body = `<div class="grid2"><div class="fld w2"><label>${esc(t('find_what'))}</label><input id="fd_t" dir="auto" value="${esc(findState.text)}"></div><div class="fld"><label>${esc(t('find_in'))}</label><select id="fd_f"><option value="any">${esc(t('find_any'))}</option><option value="code"${findState.field === 'code' ? ' selected' : ''}>${esc(t('col_code'))}</option><option value="name"${findState.field === 'name' ? ' selected' : ''}>${esc(t('col_name'))}</option></select></div></div><label class="chk" style="margin-top:8px"><input type="checkbox" id="fd_c"${findState.cs ? ' checked' : ''}> ${esc(t('match_case'))}</label>`;
    modal({ title: t('mi_find'), cls: 'mid', body, buttons: [{ label: t('close'), fn: () => {} }, { label: t('mi_findnext'), cls: 'pri', fn: (c, el) => { findState.text = $('#fd_t', el).value; findState.field = $('#fd_f', el).value; findState.cs = $('#fd_c', el).checked; App.findNext(); return false; } }] });
  };
  D.replace = function () {
    const body = `<div class="grid2"><div class="fld w2"><label>${esc(t('find_what'))}</label><input id="rp_f" dir="auto" value="${esc(findState.text)}"></div><div class="fld w2"><label>${esc(t('replace_with'))}</label><input id="rp_r" dir="auto"></div>
      <div class="fld"><label>${esc(t('find_in'))}</label><select id="rp_in"><option value="name">${esc(t('col_name'))}</option><option value="code">${esc(t('col_code'))}</option></select></div><div class="fld"><label>${esc(t('rn_scope'))}</label><select id="rp_sc"><option value="all">${esc(t('rn_all'))}</option><option value="sel">${esc(t('rn_sel'))}</option></select></div></div><label class="chk" style="margin-top:8px"><input type="checkbox" id="rp_c"> ${esc(t('match_case'))}</label>`;
    modal({ title: t('mi_replace'), cls: 'mid', body, buttons: [{ label: t('cancel'), fn: () => {} }, { label: t('mi_replace_all'), cls: 'pri', fn: (c, el) => {
      const f = $('#rp_f', el).value, r = $('#rp_r', el).value, fld = $('#rp_in', el).value, cs = $('#rp_c', el).checked, scope = $('#rp_sc', el).value;
      if (!f) return false;
      const tasks = (scope === 'sel' ? App.selTasks() : App.p.tasks); let n = 0;
      const re = new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), cs ? 'g' : 'gi');
      let dup = null;
      App.mutate(t('mi_replace'), () => { for (const tk of tasks) { const nv = String(tk[fld]).replace(re, () => { n++; return r; }); if (nv !== tk[fld]) { if (fld === 'code' && App.p.tasks.some((x) => x !== tk && x.code.toLowerCase() === nv.toLowerCase())) { dup = nv; continue; } tk[fld] = nv; } } if (dup) return t('err_code_dup', dup); }, { noSched: true });
      App.toast(t('replaced_n', n));
    } }] });
  };
  App.toggleSpell = function () { F().spell = !F().spell; App.saveCfg(); App.buildMenus(); App.toast(t(F().spell ? 'spell_on' : 'spell_off')); document.querySelectorAll('#details input[type=text],#details input:not([type]),#details textarea').forEach((e) => { e.spellcheck = !!F().spell; }); };

  // ================= View features =================
  App.collapseTo = function () {
    const by = new Map(App.p.wbs.map((w) => [w.id, w])); const depth = (w) => { let d = 0, x = w; while (x && x.parent != null && by.has(x.parent) && d < 30) { x = by.get(x.parent); d++; } return d; };
    const mx = Math.max(...App.p.wbs.map(depth)) + 1;
    const body = `<div class="fld" style="max-width:200px"><label>${esc(t('collapse_level'))} (1–${mx})</label><input id="ct_l" value="2"></div>`;
    modal({ title: t('mi_collapseto'), body, buttons: [{ label: t('cancel'), fn: () => {} }, { label: t('apply'), cls: 'pri', fn: (c, el) => { const n = Math.max(1, parseInt($('#ct_l', el).value, 10) || 1); App.collapsed.clear(); App.p.wbs.forEach((w) => { if (depth(w) >= n - 1 && App.p.wbs.some((x) => x.parent === w.id || false)) App.collapsed.add(w.id); }); App.p.wbs.forEach((w) => { if (depth(w) >= n - 1) App.collapsed.add(w.id); }); App.refresh(); } }] });
  };
  D.barsDialog = function () {
    const sh = F().show, lm = F().labelMode || 'name';
    const items = [['base', 'show_baseline'], ['crit', 'show_critical'], ['rels', 'show_rels'], ['labels', 'show_labels'], ['float', 'show_float'], ['today', 'show_today']];
    const body = `<div class="plist" style="gap:2px">${items.map(([k, l]) => `<label class="chk"><input type="checkbox" data-k="${k}"${sh[k] ? ' checked' : ''}> ${esc(t(l))}</label>`).join('')}<label class="chk"><input type="checkbox" data-k="pline"${F().pline ? ' checked' : ''}> ${esc(t('mi_progressline'))}</label></div>
      <div class="fld" style="max-width:260px;margin-top:12px"><label>${esc(t('label_text'))}</label><select id="bd_l">${[['name', t('col_name')], ['id', t('col_code')], ['both', t('lbl_both')], ['none', t('lbl_none')]].map(([v, l]) => `<option value="${v}"${lm === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
    modal({ title: t('mi_bars'), cls: 'mid', body, buttons: [{ label: t('cancel'), fn: () => {} }, { label: t('apply'), cls: 'pri', fn: (c, el) => { el.querySelectorAll('input[data-k]').forEach((i) => { if (i.dataset.k === 'pline') F().pline = i.checked; else F().show[i.dataset.k] = i.checked; }); F().labelMode = $('#bd_l', el).value; App.saveCfg(); App.refresh(); App.buildMenus(); } }] });
  };
  D.timescaleDialog = function () {
    const cur = App.nearestTs();
    const body = `<div class="plist">${App.TS.map(([k, v]) => `<label class="pitem"><input type="radio" name="ts" value="${v}"${cur === v ? ' checked' : ''}><div class="nm">${esc(t('ts_' + k))}</div></label>`).join('')}</div>`;
    modal({ title: t('mi_timescale'), cls: 'mid', body, buttons: [{ label: t('cancel'), fn: () => {} }, { label: t('fit_project'), fn: () => { App.zoomFit(); } }, { label: t('apply'), cls: 'pri', fn: (c, el) => { const r = el.querySelector('input[name=ts]:checked'); if (r) App.setTimescale(+r.value); } }] });
  };
  D.tableFont = function () {
    const body = `<div class="grid2"><div class="fld"><label>${esc(t('font_size'))}</label><input id="tf_s" value="${F().fontSize || 12}"></div><div class="fld"><label>${esc(t('row_height'))}</label><input id="tf_r" value="${App.getRH()}"></div></div><label class="chk" style="margin-top:10px"><input type="checkbox" id="tf_b"${F().boldWbs !== false ? ' checked' : ''}> ${esc(t('bold_wbs'))}</label>`;
    modal({ title: t('mi_tablefont'), cls: 'mid', body, buttons: [{ label: t('cancel'), fn: () => {} }, { label: t('apply'), cls: 'pri', fn: (c, el) => { F().fontSize = Math.max(9, Math.min(20, +$('#tf_s', el).value || 12)); F().boldWbs = $('#tf_b', el).checked; const h = Math.max(18, Math.min(48, +$('#tf_r', el).value || 24)); F().rowH = h; applyFont(); App.refresh(); } }] });
  };
  function applyFont() { document.documentElement.style.setProperty('--tfs', (F().fontSize || 12) + 'px'); document.documentElement.classList.toggle('nobold', F().boldWbs === false); App.setRowH(F().rowH || 24); App.saveCfg(); }
  App.applyFont = applyFont;
  App.drivingPath = function () {
    const tk = App.focusTask(); if (!tk) return App.toast(t('err_link_sel'), true);
    const pred = new Map(); for (const r of App.p.rels) if (r.rf != null && r.rf <= 0) { if (!pred.has(r.s)) pred.set(r.s, []); pred.get(r.s).push(r.p); }
    const seen = new Set([tk.id]), st = [tk.id];
    while (st.length) { const x = st.pop(); for (const y of pred.get(x) || []) if (!seen.has(y)) { seen.add(y); st.push(y); } }
    const keys = [...seen].map((i) => 't' + i).filter((k) => App.rowIdx.has(k)); App.setSel(keys); App.toast(t('selected_n', keys.length));
  };
  // toolbars
  function applyBars() {
    const b = F().bars || {}; const root = $('#app');
    root.classList.toggle('hide-tool', b.tool === false); root.classList.toggle('hide-left', b.left === false); root.classList.toggle('hide-right', b.right === false); root.classList.toggle('hide-layout', b.layout === false); root.classList.toggle('hide-status', F().statusBar === false);
    if (App.gantt) App.gantt.schedule();
  }
  App.applyBars = applyBars;
  function applyHint() {
    document.querySelectorAll('#toolbar [title],#sideL [title],#sideR [title],#toolbar [data-title],#sideL [data-title],#sideR [data-title]').forEach((e) => { if (F().hint === false) { if (e.title) { e.dataset.title = e.title; e.removeAttribute('title'); } } else if (e.dataset.title) { e.title = e.dataset.title; } });
  }
  App.applyHint = applyHint;

  // ================= Check Schedule =================
  D.checkSchedule = function () {
    const p = App.p, ts = p.tasks.filter((x) => !P6.isHammock(x)), open = ts.filter((x) => x.status !== 'C');
    const hasPred = new Set(p.rels.map((r) => r.s)), hasSucc = new Set(p.rels.map((r) => r.p));
    const byId = new Map(ts.map((x) => [x.id, x]));
    const C = [
      ['chk_nopred', open.filter((x) => !hasPred.has(x.id) && x.type !== 'TT_Mile'), 0],
      ['chk_nosucc', open.filter((x) => !hasSucc.has(x.id) && x.type !== 'TT_FinMile'), 0],
      ['chk_negfloat', open.filter((x) => x.tf != null && x.tf < 0), 0],
      ['chk_highfloat', open.filter((x) => x.tf != null && x.tf > 44), 5],
      ['chk_hardcstr', ts.filter((x) => x.ct === 'MSO' || x.ct === 'MFO' || x.ct === 'SNLT' || x.ct === 'FNLT'), 5],
      ['chk_longdur', open.filter((x) => x.dur > 44), 5],
      ['chk_lag', [...new Set(p.rels.filter((r) => r.lag > 5).map((r) => byId.get(r.s)).filter(Boolean))], 5],
      ['chk_neglag', [...new Set(p.rels.filter((r) => r.lag < 0).map((r) => byId.get(r.s)).filter(Boolean))], 0],
      ['chk_nofs', null, 0],
      ['chk_outseq', ts.filter((x) => x.status !== 'NS' && p.rels.some((r) => r.s === x.id && byId.get(r.p) && byId.get(r.p).status !== 'C' && r.type === 'FS')), 0],
      ['chk_futureact', ts.filter((x) => (x.as != null && x.as > p.dataDate) || (x.af != null && x.af > p.dataDate)), 0],
      ['chk_nores', open.filter((x) => !p.asg.some((a) => a.task === x.id) && x.dur > 0), 10],
      ['chk_loops', (p.loops || []).map((c) => p.tasks.find((x) => x.code === c)).filter(Boolean), 0]
    ];
    const fsPct = p.rels.length ? Math.round((100 * p.rels.filter((r) => r.type === 'FS').length) / p.rels.length) : 100;
    const rows = C.map(([k, list, tol]) => {
      if (list === null) return `<tr><td>${esc(t(k))}</td><td>≥ 90%</td><td>${fsPct}%</td><td>${fsPct >= 90 ? '✅' : '❌'}</td><td></td></tr>`;
      const pct = open.length ? Math.round((100 * list.length) / Math.max(1, ts.length)) : 0, ok = pct <= tol;
      return `<tr><td>${esc(t(k))}</td><td>≤ ${tol}%</td><td>${list.length} (${pct}%)</td><td>${ok ? '✅' : '❌'}</td><td>${list.length ? `<button class="btn sm" data-k="${k}">${esc(t('select'))}</button>` : ''}</td></tr>`;
    }).join('');
    const body = `<div class="hint">${esc(t('chk_hint'))}</div><table class="mini"><thead><tr><th>${esc(t('chk_check'))}</th><th style="width:90px">${esc(t('chk_limit'))}</th><th style="width:110px">${esc(t('chk_result'))}</th><th style="width:50px"></th><th style="width:90px"></th></tr></thead><tbody>${rows}</tbody></table>`;
    const m = modal({ title: t('mi_checksched'), cls: 'mid', body, buttons: [{ label: t('close'), cls: 'pri', fn: () => {} }] });
    m.el.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (!b) return; const row = C.find((x) => x[0] === b.dataset.k); const keys = row[1].map((x) => 't' + x.id).filter((k) => App.rowIdx.has(k)); m.close(); App.showWin('activities'); App.setSel(keys); if (keys.length) App.ensureVisible(App.rowIdx.get(keys[0])); App.toast(t('selected_n', keys.length)); });
  };

  // ================= Baselines (maintain / assign) =================
  D.baselines = D.maintainBaselines = function () {
    const p = App.p; P6.ensureBaselines(p);
    const body = document.createElement('div');
    let selId = p.blPrimary || (p.baselines[0] && p.baselines[0].id);
    const draw = () => {
      body.innerHTML = `<table class="mini"><thead><tr><th style="width:60px">${esc(t('primary'))}</th><th>${esc(t('bl_name'))}</th><th style="width:130px">${esc(t('f_date'))}</th><th style="width:100px">${esc(t('activities'))}</th></tr></thead><tbody>${p.baselines.map((b) => `<tr data-b="${b.id}"${b.id === selId ? ' class="rsel"' : ''}><td style="text-align:center">${p.blPrimary === b.id ? '●' : ''}</td><td><input data-f="name" dir="auto" value="${esc(b.name)}"></td><td>${fmtD(b.date)}</td><td>${Object.keys(b.tasks).length}</td></tr>`).join('') || `<tr><td colspan="4" class="empty">${esc(t('bl_none'))}</td></tr>`}</tbody></table>
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="bl_add">+ ${esc(t('bl_add'))}</button><button class="btn" id="bl_upd"${selId ? '' : ' disabled'}>${esc(t('bl_update'))}</button><button class="btn" id="bl_imp">${esc(t('bl_import'))}</button><button class="btn dng" id="bl_del"${selId ? '' : ' disabled'}>${esc(t('delete'))}</button></div><p class="hint">${esc(t('bl_hint'))}</p>`;
    };
    draw();
    modal({ title: t('mi_maintbl'), cls: 'mid', body, buttons: [{ label: t('mi_assignbl') + '…', fn: () => { D.assignBaselines(); return true; } }, { label: t('close'), cls: 'pri', fn: () => {} }], onClose: () => App.refresh() });
    body.onclick = (e) => {
      const tr = e.target.closest('tr[data-b]'); if (tr && e.target.tagName !== 'INPUT') { selId = +tr.dataset.b; return draw(); }
      if (e.target.id === 'bl_add') { const n = prompt(t('bl_name'), 'BL ' + fmtD(P6.todayDay())); if (!n) return; App.mutate(t('bl_add'), () => { const b = P6.snapshotBaseline(p, n, P6.metrics(p)); p.baselines.push(b); selId = b.id; if (!p.blPrimary) P6.assignBaseline(p, b.id); }, { noSched: true }); draw(); }
      if (e.target.id === 'bl_upd' && selId) { if (!confirm(t('bl_confirm'))) return; App.mutate(t('bl_update'), () => { const old = p.baselines.find((x) => x.id === selId); const b = P6.snapshotBaseline(p, old.name, P6.metrics(p)); b.id = old.id; p.baselines[p.baselines.indexOf(old)] = b; if (p.blPrimary === b.id) P6.assignBaseline(p, b.id); }, { noSched: true }); draw(); }
      if (e.target.id === 'bl_del' && selId) { App.mutate(t('delete'), () => { p.baselines = p.baselines.filter((x) => x.id !== selId); if (p.blPrimary === selId) P6.assignBaseline(p, p.baselines[0] ? p.baselines[0].id : null); selId = p.blPrimary; }, { noSched: true }); draw(); }
      if (e.target.id === 'bl_imp') App.openFile('baseline');
    };
    body.onchange = (e) => { const tr = e.target.closest('tr[data-b]'); if (!tr) return; const b = p.baselines.find((x) => x.id === +tr.dataset.b); App.mutate(t('edit'), () => { b.name = e.target.value; if (p.blPrimary === b.id) p.blName = b.name; }, { noSched: true }); };
  };
  D.assignBaselines = function () {
    const p = App.p; P6.ensureBaselines(p);
    const body = `<div class="fld" style="max-width:340px"><label>${esc(t('bl_primary'))}</label><select id="ab_p"><option value="">— ${esc(t('current_project'))} —</option>${p.baselines.map((b) => `<option value="${b.id}"${p.blPrimary === b.id ? ' selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div><p class="hint">${esc(t('ab_hint'))}</p>`;
    modal({ title: t('mi_assignbl'), cls: 'mid', body, buttons: [{ label: t('cancel'), fn: () => {} }, { label: t('apply'), cls: 'pri', fn: (c, el) => { const v = $('#ab_p', el).value; App.mutate(t('mi_assignbl'), () => { P6.assignBaseline(p, v === '' ? null : +v); }, { noSched: true }); } }] });
  };
  D.setDefaultProject = async function () {
    const list = (await App.listProjects()).sort((a, b) => b.updated - a.updated); const cur = localStorage.getItem('p6web.last');
    const body = `<div class="plist">${list.map((x) => `<label class="pitem"><input type="radio" name="dp" value="${esc(x.id)}"${x.id === cur ? ' checked' : ''}><div style="flex:1"><div class="nm" dir="auto">${esc(x.name)}</div><div class="sub">${esc(t('activities'))}: ${x.tasks}</div></div></label>`).join('')}</div>`;
    modal({ title: t('mi_setdefault'), cls: 'mid', body, buttons: [{ label: t('cancel'), fn: () => {} }, { label: t('save'), cls: 'pri', fn: (c, el) => { const r = el.querySelector('input[name=dp]:checked'); if (r) { try { localStorage.setItem('p6web.last', r.value); } catch (e) { /* */ } App.toast(t('default_set')); } } }] });
  };
  D.bottomOptions = function () {
    const u = Object.assign({ m: 'units', cum: true, limit: true, sheetFor: 'sel' }, F().usage);
    const body = `<div class="grid2"><div class="fld"><label>${esc(t('usage_measure'))}</label><select id="bo_m"><option value="units"${u.m === 'units' ? ' selected' : ''}>${esc(t('ra_bu'))}</option><option value="cost"${u.m === 'cost' ? ' selected' : ''}>${esc(t('ra_bc'))}</option></select></div>
      <div class="fld"><label>${esc(t('sheet_for'))}</label><select id="bo_s"><option value="sel"${u.sheetFor === 'sel' ? ' selected' : ''}>${esc(t('selected'))}</option><option value="all"${u.sheetFor === 'all' ? ' selected' : ''}>${esc(t('rn_all'))}</option></select></div></div>
      <label class="chk" style="margin-top:10px"><input type="checkbox" id="bo_c"${u.cum ? ' checked' : ''}> ${esc(t('show_cumulative'))}</label><label class="chk"><input type="checkbox" id="bo_l"${u.limit ? ' checked' : ''}> ${esc(t('show_limit'))}</label>`;
    modal({ title: t('mi_bottomopts'), cls: 'mid', body, buttons: [{ label: t('cancel'), fn: () => {} }, { label: t('apply'), cls: 'pri', fn: (c, el) => { F().usage = { m: $('#bo_m', el).value, sheetFor: $('#bo_s', el).value, cum: $('#bo_c', el).checked, limit: $('#bo_l', el).checked }; App.saveCfg(); App.renderDetails(); } }] });
  };

  // ================= bottom docks: Trace Logic, Activity Usage Spreadsheet, Additional Activities View =================
  const NB = { fields: { dates: true, float: true, dur: true }, depth: 2, colors: { n: '#dbe9fb', c: '#ffd6d6', d: '#d8f3d8', s: '#fff2a8' } };
  App.renderNetwork = function (el) {
    const tk = App.focusTask(), cfg = Object.assign({}, NB, F().net);
    if (!tk) { el.innerHTML = `<div class="dockhead">▽ ${esc(t('mi_trace'))}</div><div class="empty">${esc(t('select_hint'))}</div>`; return; }
    const p = App.p, byId = new Map(p.tasks.map((x) => [x.id, x])), W = 200, H = cfg.fields.dates || cfg.fields.float ? 62 : 44, GX = 70, GY = 14;
    const lvlP = new Map([[tk.id, 0]]), lvlS = new Map([[tk.id, 0]]);
    const walk = (map, dir) => { let fr = [tk.id]; for (let d = 1; d <= cfg.depth; d++) { const nx = []; for (const id of fr) for (const r of p.rels) { const o = dir < 0 ? (r.s === id ? r.p : null) : (r.p === id ? r.s : null); if (o != null && !map.has(o)) { map.set(o, d); nx.push(o); } } fr = nx; } };
    walk(lvlP, -1); walk(lvlS, 1);
    const cols = new Map(); // level -> [ids]  (negative = predecessors)
    for (const [id, d] of lvlP) if (id !== tk.id) { const k = -d; if (!cols.has(k)) cols.set(k, []); cols.get(k).push(id); }
    for (const [id, d] of lvlS) if (id !== tk.id) { if (!cols.has(d)) cols.set(d, []); cols.get(d).push(id); }
    cols.set(0, [tk.id]);
    const keys = [...cols.keys()].sort((a, b) => a - b), pos = new Map();
    const maxRows = Math.max(...keys.map((k) => cols.get(k).length)), totalH = maxRows * (H + GY);
    keys.forEach((k, ci) => { const ids = cols.get(k).sort((a, b) => (byId.get(a).es || 0) - (byId.get(b).es || 0)); const off = (totalH - ids.length * (H + GY)) / 2; ids.forEach((id, ri) => pos.set(id, { x: 20 + ci * (W + GX), y: 14 + off + ri * (H + GY) })); });
    const width = 40 + keys.length * (W + GX), height = totalH + 30;
    let lines = '', boxes = '';
    for (const r of p.rels) { const a = pos.get(r.p), b = pos.get(r.s); if (!a || !b) continue; const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x, y2 = b.y + H / 2; lines += `<path d="M${x1} ${y1}H${x1 + GX / 2}V${y2}H${x2}" fill="none" stroke="${byId.get(r.p).crit && byId.get(r.s).crit ? '#d00' : '#667'}" stroke-width="1.3" marker-end="url(#nah)"/><text x="${(x1 + x2) / 2}" y="${Math.min(y1, y2) - 3}" font-size="9" fill="#555" text-anchor="middle">${r.type}${r.lag ? (r.lag > 0 ? '+' : '') + r.lag : ''}</text>`; }
    for (const [id, ps] of pos) {
      const x = byId.get(id), fill = id === tk.id ? cfg.colors.s : x.status === 'C' ? cfg.colors.d : x.crit ? cfg.colors.c : cfg.colors.n;
      boxes += `<g class="nbox" data-id="${id}" style="cursor:pointer"><rect x="${ps.x}" y="${ps.y}" width="${W}" height="${H}" rx="3" fill="${fill}" stroke="${x.crit && x.status !== 'C' ? '#d00' : '#456'}" stroke-width="${id === tk.id ? 2.2 : 1.2}"/><text x="${ps.x + 6}" y="${ps.y + 14}" font-size="11" font-weight="700" fill="#000">${esc(x.code)}</text><text x="${ps.x + 6}" y="${ps.y + 28}" font-size="10.5" fill="#000">${esc(x.name.length > 30 ? x.name.slice(0, 29) + '…' : x.name)}</text>`;
      if (cfg.fields.dates) boxes += `<text x="${ps.x + 6}" y="${ps.y + 42}" font-size="10" fill="#223">${fmtD(x.es)} → ${fmtD(x.ef)}</text>`;
      if (cfg.fields.float || cfg.fields.dur) boxes += `<text x="${ps.x + 6}" y="${ps.y + 56}" font-size="10" fill="#223">${cfg.fields.dur ? 'D: ' + fmtN(x.dur) + '  ' : ''}${cfg.fields.float ? 'TF: ' + (x.tf == null ? '–' : fmtN(x.tf)) : ''}</text>`;
      boxes += '</g>';
    }
    el.innerHTML = `<div class="dockhead">▽ ${esc(t('mi_trace'))}: <b dir="auto">${esc(tk.code)}</b> <span style="margin-inline-start:auto;display:flex;gap:6px"><button class="btn sm" data-n="d1">${esc(t('depth'))} −</button><button class="btn sm" data-n="d2">${esc(t('depth'))} +</button><button class="btn sm" data-n="tpl">${esc(t('mi_boxtpl'))}</button><button class="btn sm" data-n="hide">▾</button></span></div><div style="flex:1;overflow:auto;direction:ltr"><svg width="${width}" height="${height}" font-family="Tahoma,Arial,sans-serif"><defs><marker id="nah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L8 4L0 8z" fill="#445"/></marker></defs>${lines}${boxes}</svg></div>`;
    el.style.display = 'flex'; el.style.flexDirection = 'column';
    el.onclick = (e) => {
      const b = e.target.closest('.nbox'); if (b) { const r = App.rows[App.rowIdx.get('t' + b.dataset.id)]; if (r) App.selectRow(r, null); else App.setSel(['t' + b.dataset.id]); return; }
      const n = e.target.closest('[data-n]'); if (!n) return;
      const net = Object.assign({}, NB, F().net); const k = n.dataset.n;
      if (k === 'd1') net.depth = Math.max(1, net.depth - 1); else if (k === 'd2') net.depth = Math.min(5, net.depth + 1); else if (k === 'hide') return App.setDock('none'); else if (k === 'tpl') return D.chartTemplate();
      F().net = net; App.saveCfg(); App.renderNetwork(el);
    };
  };
  D.chartTemplate = function () {
    const net = Object.assign({}, NB, F().net), f = net.fields, c = net.colors;
    const body = `<div class="plist" style="gap:2px"><label class="chk"><input type="checkbox" id="ct_d"${f.dates ? ' checked' : ''}> ${esc(t('tpl_dates'))}</label><label class="chk"><input type="checkbox" id="ct_u"${f.dur ? ' checked' : ''}> ${esc(t('col_dur'))}</label><label class="chk"><input type="checkbox" id="ct_f"${f.float ? ' checked' : ''}> ${esc(t('col_tf'))}</label></div>
      <div class="grid2" style="margin-top:12px">${[['n', 'tpl_normal'], ['c', 'tpl_critical'], ['d', 'tpl_done'], ['s', 'tpl_selected']].map(([k, l]) => `<div class="fld"><label>${esc(t(l))}</label><input type="color" id="cc_${k}" value="${c[k]}"></div>`).join('')}</div>`;
    modal({ title: t('mi_boxtpl'), cls: 'mid', body, buttons: [{ label: t('cancel'), fn: () => {} }, { label: t('apply'), cls: 'pri', fn: (cl, el) => { F().net = Object.assign({}, net, { fields: { dates: $('#ct_d', el).checked, dur: $('#ct_u', el).checked, float: $('#ct_f', el).checked }, colors: { n: $('#cc_n', el).value, c: $('#cc_c', el).value, d: $('#cc_d', el).value, s: $('#cc_s', el).value } }); App.saveCfg(); App.renderDetails(); } }] });
  };
  App.renderUsageSheet = function (el) {
    const p = App.p, u = Object.assign({ m: 'units', sheetFor: 'sel', cum: true }, F().usage), o = App.gantt.o;
    const tk = App.focusTask(), tasks = u.sheetFor === 'all' || !tk ? p.tasks : [tk];
    const periods = []; let d = P6.mkDay(P6.ymd(o.minDay).y, P6.ymd(o.minDay).m, 1);
    while (d < o.maxDay && periods.length < 48) { const y = P6.ymd(d), nx = P6.mkDay(y.y, y.m + 1, 1); periods.push([d, nx, P6.MON[y.m] + ' ' + String(y.y).slice(2)]); d = nx; }
    const rs = new Map(p.rsrc.map((r) => [r.id, r])); const rows = new Map();
    for (const a of p.asg) {
      const x = tasks.find((q) => q.id === a.task); if (!x || x.es == null) continue; const r = rs.get(a.rsrc); if (!r) continue;
      const price = a.price != null ? +a.price : P6.priceAt(r, x.es), cal = p.cals.find((c) => c.id === x.cal) || p.cals[0], days = []; for (let k = x.es; k <= x.ef; k++) if (P6.isWork(cal, k)) days.push(k); if (!days.length) days.push(x.es);
      const per = (a.qty * (u.m === 'cost' ? price : 1)) / days.length; if (!rows.has(r.id)) rows.set(r.id, new Float64Array(periods.length));
      for (const k of days) for (let i = 0; i < periods.length; i++) if (k >= periods[i][0] && k < periods[i][1]) { rows.get(r.id)[i] += per; break; }
    }
    const head = periods.map((q) => `<th style="min-width:62px;text-align:right">${q[2]}</th>`).join('');
    let cum = new Float64Array(periods.length);
    const body = [...rows].map(([id, arr]) => { arr.forEach((v, i) => { cum[i] += v; }); return `<tr><td style="position:sticky;left:0;background:var(--panel);min-width:180px" dir="auto"><b>${esc(rs.get(id).short || '')}</b> ${esc(rs.get(id).name)}</td>${[...arr].map((v) => `<td style="text-align:right">${v ? fmtN(v) : ''}</td>`).join('')}<td style="text-align:right"><b>${fmtN(arr.reduce((a, b) => a + b, 0))}</b></td></tr>`; }).join('');
    let run = 0; const cumRow = u.cum ? `<tr style="background:var(--panel2)"><td style="position:sticky;left:0;background:var(--panel2)"><b>${esc(t('cumulative'))}</b></td>${[...cum].map((v) => { run += v; return `<td style="text-align:right">${fmtN(run)}</td>`; }).join('')}<td></td></tr>` : '';
    el.innerHTML = `<div class="dockhead">▽ ${esc(t('mi_usagesheet'))}: ${esc(u.m === 'cost' ? t('ra_bc') : t('ra_bu'))} · ${esc(tasks.length === 1 ? tasks[0].code : t('rn_all'))}<span style="margin-inline-start:auto"><button class="btn sm" data-n="opt">${esc(t('mi_bottomopts'))}</button> <button class="btn sm" data-n="hide">▾</button></span></div><div style="flex:1;overflow:auto"><table class="mini wide" style="min-width:${220 + periods.length * 66}px"><thead><tr><th style="position:sticky;left:0;background:var(--panel)">${esc(t('resource'))}</th>${head}<th>Σ</th></tr></thead><tbody>${body || `<tr><td colspan="${periods.length + 2}" class="empty">${esc(t('no_assignments'))}</td></tr>`}${cumRow}</tbody></table></div>`;
    el.style.display = 'flex'; el.style.flexDirection = 'column';
    el.onclick = (e) => { const n = e.target.closest('[data-n]'); if (!n) return; if (n.dataset.n === 'opt') D.bottomOptions(); else App.setDock('none'); };
  };
  App.renderActs2 = function (el) {
    const p = App.p, mode = F().acts2 || 'all';
    let list = p.tasks.slice();
    const fr = App.rows[App.rowIdx.get(App.focus)];
    if (mode === 'wbs' && fr) { const w = App.wbsOfRow(fr); const ids = new Set([w]); let ch = true; while (ch) { ch = false; for (const x of p.wbs) if (ids.has(x.parent) && !ids.has(x.id)) { ids.add(x.id); ch = true; } } list = list.filter((x) => ids.has(x.wbs)); }
    else if (mode === 'crit') list = list.filter((x) => x.crit && x.status !== 'C'); else if (mode === 'ip') list = list.filter((x) => x.status === 'IP');
    list.sort((a, b) => (a.es || 0) - (b.es || 0)); list = list.slice(0, 500);
    el.innerHTML = `<div class="dockhead">▽ ${esc(t('mi_addactview'))}: <select id="a2_m" class="inp" style="height:20px">${[['all', 'f_all'], ['wbs', 'a2_wbs'], ['crit', 'f_critical'], ['ip', 'f_IP']].map(([k, l]) => `<option value="${k}"${mode === k ? ' selected' : ''}>${esc(t(l))}</option>`).join('')}</select><span style="margin-inline-start:auto"><button class="btn sm" data-n="hide">▾</button></span></div><div style="flex:1;overflow:auto"><table class="mini"><thead><tr><th>${esc(t('col_code'))}</th><th>${esc(t('col_name'))}</th><th>${esc(t('col_es'))}</th><th>${esc(t('col_ef'))}</th><th>${esc(t('col_tf'))}</th><th>${esc(t('col_pct'))}</th></tr></thead><tbody>${list.map((x) => `<tr data-id="${x.id}" style="cursor:pointer${App.focus === 't' + x.id ? ';background:var(--sel)' : ''}"><td>${esc(x.code)}</td><td dir="auto">${esc(x.name)}</td><td>${fmtD(x.es)}</td><td>${fmtD(x.ef)}</td><td${x.tf != null && x.tf < 0 ? ' style="color:var(--danger)"' : ''}>${x.tf == null ? '' : fmtN(x.tf)}</td><td>${x.pct}%</td></tr>`).join('')}</tbody></table></div>`;
    el.style.display = 'flex'; el.style.flexDirection = 'column';
    el.onchange = (e) => { if (e.target.id === 'a2_m') { F().acts2 = e.target.value; App.saveCfg(); App.renderActs2(el); } };
    el.onclick = (e) => { if (e.target.closest('[data-n]')) return App.setDock('none'); const tr = e.target.closest('tr[data-id]'); if (!tr) return; const r = App.rows[App.rowIdx.get('t' + tr.dataset.id)]; if (r) { App.selectRow(r, null); App.ensureVisible(App.rowIdx.get('t' + tr.dataset.id)); } };
  };
  App.redrawDock = function () { const el = $('#details'); const fn = { network: App.renderNetwork, usagesheet: App.renderUsageSheet, acts2: App.renderActs2 }[F().dock]; if (fn && F().detOpen) fn(el); };

  // ================= menu structure =================
  const winItems = () => ['projects', 'resources', 'activities', 'assign', 'wbs', 'expenses', 'docs', 'thresholds', 'issues', 'risks'].map((w) => sub(t(App.WINS[w].title), App.WINS[w].icon, () => App.openWin(w), { ck: App.win === w }));
  App.menuDefs = function () {
    const ready = !!App.p, selT = ready ? App.selTasks() : [], selW = ready ? App.selWbs() : [];
    const sh = F().show, hasSel = selT.length > 0, wbsSel = selW.length > 0, act = App.win === 'activities';
    const common = [['nm_status', 'status'], ['nm_cal', 'cal']];
    void common;
    const colQuick = [['code', 'col_code'], ['name', 'col_name'], ['dur', 'col_dur'], ['es', 'col_es'], ['ef', 'col_ef'], ['pct', 'col_pct'], ['tf', 'col_tf'], ['pred', 'col_pred'], ['succ', 'col_succ'], ['bs', 'col_bs'], ['bf', 'col_bf']];
    const edit = [
      ['undo', () => App.doUndo(), 'Ctrl+Z', false, null, !App.undo.length], ['redo', () => App.doRedo(), 'Ctrl+Y', false, null, !App.redo.length], '-',
      ['cut', () => App.cutSel(), 'Ctrl+X', false, null, !hasSel], ['copy', () => App.copySel(), 'Ctrl+C', false, null, !hasSel], ['paste', () => App.pasteSel(), 'Ctrl+V'], '-',
      ['mi_add', () => App.addTask(), 'Insert'], ['delete', () => App.del(), 'Del', false, null, !hasSel && !wbsSel], ['mi_dissolve', () => App.dissolve(), '', false, null, !wbsSel],
      ['mi_renumber', () => App.renumber(), '', false, null, !(ready && App.p.tasks.length)], '-',
      ['mi_assign', null, '', false, [
        sub(t('predecessors') + '…', 'pred', () => App.assignRel('p'), { dis: selT.length !== 1 }), sub(t('successors') + '…', 'succ', () => App.assignRel('s'), { dis: selT.length !== 1 }), sub(t('resources').replace('…', '') + '…', 'resources', () => App.assignResources(), { dis: !hasSel }),
        sub(t('col_cal'), 'calendar', null, { sub: (ready ? App.calendarMenu(selT) : []), dis: !hasSel }), sub(t('constraint') + '…', 'critical', () => App.constraintDialog(), { dis: !hasSel }), sub(t('move_to_wbs') + '…', 'wbs', () => App.moveToWbsDialog(), { dis: !hasSel })], false, !hasSel],
      ['link', () => App.link(), '', false, null, selT.length < 2], ['unlink', () => App.unlink(), '', false, null, !hasSel], '-',
      ['mi_filldown', () => App.fillDown(), 'Ctrl+E', false, null, selT.length < 2], ['mi_selectall', () => App.selectAll(), 'Ctrl+A'], ['mi_copytable', () => App.copyTable(true), 'Ctrl+Shift+C'], '-',
      ['mi_find', () => D.find(), 'Ctrl+F'], ['mi_findnext', () => App.findNext(), 'F3'], ['mi_replace', () => D.replace(), 'Ctrl+R'], ['mi_spell', () => App.toggleSpell(), 'F7', !!F().spell], '-',
      ['prefs', () => D.prefs()]
    ];
    const project = [
      ['win_activities', () => App.openWin('activities')], ['mi_addactview', () => App.setDock('acts2')], ['win_assign', () => App.openWin('assign')], ['win_wbs', () => App.openWin('wbs')], '-',
      ['mi_assignbl', () => D.assignBaselines()], ['mi_maintbl', () => D.maintainBaselines()], '-',
      ['win_expenses', () => App.openWin('expenses')], ['win_docs', () => App.openWin('docs')], '-',
      ['win_thresholds', () => App.openWin('thresholds')], ['win_issues', () => App.openWin('issues')], ['win_risks', () => App.openWin('risks')], '-',
      ['project_settings', () => D.settings()], ['calendars', () => D.calendars()], ['mi_setdefault', () => D.setDefaultProject()]
    ];
    const view = [
      ['mi_layout', null, '', false, [sub(t('mi_newlayout'), 'layoutnew', null, { dis: true }), sub(t('mi_openlayout'), 'layoutopen', () => App.openLayoutDialog()), sub(t('mi_savelayout'), 'layoutsave', () => App.saveLayoutCurrent()), sub(t('save_layout') + '…', 'layoutsave', () => App.saveLayoutAs())]],
      ['mi_showtop', null, '', false, winItems()],
      ['mi_showbottom', null, '', false, [
        sub(t('bottom_details'), 'details', () => App.setDock('details'), { ck: F().dock === 'details' && F().detOpen }), sub(t('bottom_usage'), 'people', () => App.setDock('usage'), { ck: F().dock === 'usage' && F().detOpen }),
        sub(t('mi_usagesheet'), 'table', () => App.setDock('usagesheet'), { ck: F().dock === 'usagesheet' && F().detOpen }), sub(t('mi_trace'), 'network', () => App.setDock('network'), { ck: F().dock === 'network' && F().detOpen }),
        sub(t('mi_addactview'), 'addactview', () => App.setDock('acts2'), { ck: F().dock === 'acts2' && F().detOpen }), '-', sub(t('bottom_none'), 'showbottom', () => App.setDock('none'), { ck: !F().detOpen })]],
      ['mi_bottomopts', () => D.bottomOptions(), '', false, null, F().dock === 'details'], '-',
      ['mi_bars', () => D.barsDialog(), '', false, null, !act],
      ['columns', null, '', false, [sub(t('mi_customize'), 'columns', () => D.columns()), sub(t('default'), 'columns', () => { F().cols = App.DEF_COLS.map((k) => ({ k, w: App.ALL_COLS[k].w })); App.saveCfg(); App.refresh(); }), '-', ...colQuick.map(([k, l]) => sub(t(l), '', () => { const has = F().cols.some((c) => c.k === k); if (has && F().cols.length > 1) F().cols = F().cols.filter((c) => c.k !== k); else if (!has) F().cols.push({ k, w: App.ALL_COLS[k].w }); App.saveCfg(); App.refresh(); }, { ck: F().cols.some((c) => c.k === k) }))], !act],
      ['mi_timescale', () => D.timescaleDialog(), '', false, null, !act],
      ['mi_filterby', null, '', false, App.filterMenuItems(), !act],
      ['group_sort', () => D.groupSort(), '', false, null, !act], '-',
      ['spotlight', () => App.toggleShow('spot'), '', !!sh.spot, null, !act],
      ['mi_progressline', () => { F().pline = !F().pline; App.saveCfg(); App.refresh(); App.buildMenus(); }, '', !!F().pline, null, !act],
      ['mi_attach', null, '', false, [sub(t('mi_attach_show'), 'attach', () => { F().attach = !F().attach; App.saveCfg(); App.refresh(); }, { ck: !!F().attach }), sub(t('mi_attach_open'), 'docs', () => { F().dock = 'details'; App.S.tab = 'docs'; App.showDetails(); }, { dis: !App.focusTask() })], !act],
      ['mi_linenum', () => { F().lineNo = !F().lineNo; App.saveCfg(); App.refresh(); App.buildMenus(); }, '', !!F().lineNo, null, !act],
      ['mi_critpath', null, '', false, [sub(t('show_critical'), 'critical', () => App.toggleShow('crit'), { ck: !!sh.crit }), sub(t('mi_driving'), 'critpath', () => App.drivingPath(), { dis: !App.focusTask() }), sub(t('sel_crit'), 'critpath', () => App.setSel(App.p.tasks.filter((x) => x.crit && App.rowIdx.has('t' + x.id)).map((x) => 't' + x.id)))], !act],
      ['mi_checksched', null, '', false, [sub(t('mi_checksched') + '…', 'check', () => D.checkSchedule()), sub(t('fp_title'), 'trace', () => D.floatPaths())]],
      ['mi_tablefont', () => D.tableFont(), '', false, null, !act], '-',
      ['mi_network', null, '', false, [sub(t('mi_trace'), 'network', () => App.setDock('network')), sub(t('mi_arrange'), 'arrange', () => App.redrawDock(), { dis: F().dock !== 'network' }), sub(t('mi_align'), 'align', () => { F().net = Object.assign({}, F().net, { depth: 2 }); App.saveCfg(); App.redrawDock(); }, { dis: F().dock !== 'network' }), sub(t('mi_boxtpl') + '…', 'boxtpl', () => D.chartTemplate(), { dis: F().dock !== 'network' })]],
      '-', ['mi_hint', () => { F().hint = F().hint === false; App.saveCfg(); App.applyHint(); App.buildMenus(); }, 'Alt+F1', F().hint !== false], ['mi_statusbar', () => { F().statusBar = F().statusBar === false; App.saveCfg(); App.applyBars(); App.buildMenus(); }, '', F().statusBar !== false], '-',
      ['mi_zoom', null, '', false, [sub(t('zoom_in'), 'zin', () => App.zoom(-1)), sub(t('zoom_out'), 'zout', () => App.zoom(1)), sub(t('zoom_fit'), 'fit', () => App.zoomFit()), sub(t('go_datadate'), 'today', () => App.goDate(App.p.dataDate)), sub(t('go_today'), 'today', () => App.goDate(P6.todayDay()))], !act],
      ['expand_all', () => App.expandAll(), '', false, null, !act], ['collapse_all', () => App.collapseAll(), '', false, null, !act], ['mi_collapseto', () => App.collapseTo(), '', false, null, !act], '-',
      ['mi_toolbars', null, '', false, [['tool', 'mi_tb_main'], ['left', 'mi_tb_left'], ['right', 'mi_tb_right'], ['layout', 'mi_tb_layout']].map(([k, l]) => sub(t(l), 'toolbars', () => { F().bars = Object.assign({ tool: true, left: true, right: true, layout: true }, F().bars); F().bars[k] = F().bars[k] === false; App.saveCfg(); App.applyBars(); App.buildMenus(); }, { ck: (F().bars || {})[k] !== false }))],
      ['mi_resettb', () => { F().bars = { tool: true, left: true, right: true, layout: true }; F().statusBar = true; F().hint = true; App.saveCfg(); App.applyBars(); App.applyHint(); App.buildMenus(); }]
    ];
    const enterprise = [
      ['win_projects', () => App.openWin('projects')], ['win_resources', () => App.openWin('resources')], ['resource_usage', () => App.setDock('usage')], ['calendars', () => D.calendars()], ['act_codes_global', () => D.codes('acg')], ['act_codes_project', () => D.codes('acp')], ['act_pcodes', () => D.codes('pc')], ['udf_manage', () => D.udf()], ['mi_roles', () => App.rolesDialog()], ['mi_accounts', () => App.accountsDialog()]
    ];
    const tools = [
      ['schedule', () => App.schedule(), 'F9'], ['auto_schedule', () => { F().auto = !F().auto; App.saveCfg(); App.buildMenus(); if (F().auto) App.runSchedule(); }, '', !!F().auto], '-',
      ['update_progress', () => D.updateProgress()], ['mi_checksched', () => D.checkSchedule()], ['fp_title', () => D.floatPaths()], ['monitor_thresholds', () => App.monitorThresholds()], '-', ['reports', () => D.reports()]
    ];
    const admin = [['prefs', () => D.prefs()], ['reset_layout', () => App.applyLayout('classic')], ['wipe_data', () => D.prefs()]];
    const base = App.baseMenuDefs ? App.baseMenuDefs() : [];
    const file = (base.find((m) => m[0] === 'file') || ['file', []])[1], help = (base.find((m) => m[0] === 'help') || ['help', []])[1];
    return [['file', file], ['edit', edit], ['view', view], ['project', project], ['enterprise', enterprise], ['tools', tools], ['admin', admin], ['help', help]];
  };
  Object.assign(App.MENU_ICON || (App.MENU_ICON = {}), {
    mi_add: 'add', mi_dissolve: 'dissolve', mi_renumber: 'renumber', mi_assign: 'assign', mi_filldown: 'filldown', mi_selectall: 'selectall', mi_copytable: 'copy', mi_find: 'find', mi_findnext: 'findnext', mi_replace: 'replace', mi_spell: 'spell', prefs: 'userprefs',
    win_activities: 'activities', mi_addactview: 'addactview', win_assign: 'resassign', win_wbs: 'wbswin', mi_assignbl: 'assignbl', mi_maintbl: 'maintbl', win_expenses: 'expenses', win_docs: 'docs', win_thresholds: 'thresholds', win_issues: 'issue', win_risks: 'risk', mi_setdefault: 'setdefault',
    mi_layout: 'layout', mi_showtop: 'showtop', mi_showbottom: 'showbottom', mi_bottomopts: 'bottomopts', mi_bars: 'bars', columns: 'columns', mi_timescale: 'timescale', mi_filterby: 'filter', group_sort: 'sort', spotlight: 'spot', mi_progressline: 'progressline', mi_attach: 'attach', mi_linenum: 'linenum', mi_critpath: 'critpath', mi_checksched: 'check', mi_tablefont: 'font', mi_network: 'network', mi_hint: 'hint', mi_statusbar: 'statusbar', mi_zoom: 'zoom', expand_all: 'expandall', collapse_all: 'collapseall', mi_collapseto: 'collapseto', mi_toolbars: 'toolbars', mi_resettb: 'resetbars',
    win_projects: 'projects', win_resources: 'people', mi_roles: 'roleico', mi_accounts: 'acctico', monitor_thresholds: 'thresholds', fp_title: 'trace', reports: 'report', schedule: 'calc', update_progress: 'update'
  });
})(window);

/* P6 Web – Primavera-style chrome: context menus, side bars, layout strip, resource usage dock, assign dialogs, preferences. */
(function (g) {
  'use strict';
  const P6 = g.P6, App = g.App;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = P6.esc, t = (k, ...a) => P6.t(k, ...a);
  const D = App.dialogs;
  const fmtD = P6.fmtDate;
  const modal = (o) => D.modal(o);
  const clone = (o) => JSON.parse(JSON.stringify(o));

  // ================= popup menu with sub-menus =================
  function closeMenus() { document.querySelectorAll('.pmenu').forEach((m) => m.remove()); }
  function popMenu(items, x, y, level) {
    level = level || 0;
    if (!level) closeMenus();
    const m = document.createElement('div');
    m.className = 'pmenu'; m.dir = P6.dir(); m.dataset.level = level;
    const act = items.filter(Boolean);
    m.innerHTML = act.map((it, i) => (it === '-' ? '<hr>' : `<div class="pi${it.dis ? ' dis' : ''}" data-i="${i}"><span class="ico2">${it.i && P6.hasIcon(it.i) ? P6.icon(it.i) : it.ck ? '✓' : ''}</span>${esc(it.l)}${it.sub ? '<span class="ar">▸</span>' : it.k ? `<span class="k">${esc(it.k)}</span>` : ''}</div>`)).join('');
    document.body.appendChild(m);
    const zz = P6.uiZoom ? P6.uiZoom() : 1; x /= zz; y /= zz;
    const w = m.offsetWidth, h = m.offsetHeight, iw = innerWidth / zz, ih = innerHeight / zz;
    m.style.left = Math.max(2, Math.min(x, iw - w - 4)) + 'px';
    m.style.top = Math.max(2, Math.min(y, ih - h - 4)) + 'px';
    const killDeeper = () => document.querySelectorAll('.pmenu').forEach((e) => { if (+e.dataset.level > level) e.remove(); });
    m.addEventListener('mouseover', (e) => {
      const pi = e.target.closest('.pi'); if (!pi) return;
      const it = act[+pi.dataset.i];
      killDeeper();
      if (it && it.sub && !it.dis) { const r = pi.getBoundingClientRect(); const sm = popMenu(it.sub, r.right - 2, r.top - 3, level + 1); const sr = sm.getBoundingClientRect(); if (sr.right > innerWidth) sm.style.left = Math.max(2, r.left - sr.width + 2) + 'px'; }
    });
    m.addEventListener('click', (e) => {
      const pi = e.target.closest('.pi'); if (!pi) return;
      const it = act[+pi.dataset.i];
      if (!it || it.dis || it.sub) return;
      closeMenus();
      if (it.fn) it.fn();
    });
    m.addEventListener('contextmenu', (e) => e.preventDefault());
    return m;
  }
  App.popMenu = popMenu;
  document.addEventListener('mousedown', (e) => { if (!e.target.closest('.pmenu')) closeMenus(); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenus(); });
  addEventListener('blur', closeMenus);

  // ================= activity operations =================
  let clip = null;
  const keysOf = (ids) => ids.map((i) => 't' + i);
  function copySel(silent) {
    const ts = App.selTasks();
    if (!ts.length) return false;
    const ids = new Set(ts.map((x) => x.id));
    clip = { tasks: clone(ts), rels: clone(App.p.rels.filter((r) => ids.has(r.p) && ids.has(r.s))), asg: clone(App.p.asg.filter((a) => ids.has(a.task))) };
    if (!silent) App.toast(t('copied', ts.length));
    return true;
  }
  function cutSel() {
    if (!copySel(true)) return;
    const ids = new Set(App.selTasks().map((x) => x.id));
    App.mutate(t('cut'), () => {
      App.p.tasks = App.p.tasks.filter((x) => !ids.has(x.id));
      App.p.rels = App.p.rels.filter((r) => !ids.has(r.p) && !ids.has(r.s));
      App.p.asg = App.p.asg.filter((a) => !ids.has(a.task));
      App.sel.clear(); App.focus = null;
    });
    App.toast(t('cut_done', clip.tasks.length));
  }
  function pasteSel() {
    if (!clip || !clip.tasks.length) return App.toast(t('clip_empty'), true);
    const fr = App.rows[App.rowIdx.get(App.focus)];
    const wbs = App.wbsOfRow(fr) != null ? App.wbsOfRow(fr) : App.p.wbs[0].id;
    const map = new Map(); let keys = [];
    App.mutate(t('paste'), () => {
      const p = App.p;
      for (const o of clip.tasks) {
        const c = clone(o); c.id = P6.nextId(p); c.wbs = wbs; c.seq = Math.max(0, ...p.tasks.map((x) => x.seq)) + 1;
        if (p.tasks.some((x) => x.code === c.code)) c.code = P6.autoCode(p);
        if (!p.cals.some((q) => q.id === c.cal)) c.cal = p.defCal;
        p.tasks.push(c); map.set(o.id, c); keys.push('t' + c.id);
      }
      for (const r of clip.rels) p.rels.push({ id: P6.nextId(p), p: map.get(r.p).id, s: map.get(r.s).id, type: r.type, lag: r.lag });
      for (const a of clip.asg) if (p.rsrc.some((x) => x.id === a.rsrc)) p.asg.push({ id: P6.nextId(p), task: map.get(a.task).id, rsrc: a.rsrc, qty: a.qty });
    });
    App.collapsed.delete(wbs); App.refresh(); App.setSel(keys);
  }
  Object.assign(App, { copySel, cutSel, pasteSel });
  App.exportsLater = () => Object.assign(App, { assignRel, assignResources, constraintDialog, moveToWbsDialog, calendarMenu, setProgress, applySaved, saveLayoutAs });

  function setProgress(kind) {
    const ts = App.selTasks(); if (!ts.length) return;
    App.mutate(t('progress'), () => {
      for (const tk of ts) {
        if (kind === 'NS') App.setStatus(tk, 'NS');
        else if (kind === 'IP') { App.setStatus(tk, 'IP'); }
        else if (kind === 'C') App.setStatus(tk, 'C');
        else App.setPct(tk, +kind);
      }
    });
  }
  function relatives(dir) {
    const ts = App.selTasks(); if (!ts.length) return;
    const adj = new Map();
    for (const r of App.p.rels) { const a = dir > 0 ? r.p : r.s, b = dir > 0 ? r.s : r.p; if (!adj.has(a)) adj.set(a, []); adj.get(a).push(b); }
    const seen = new Set(), st = ts.map((x) => x.id);
    while (st.length) { const x = st.pop(); for (const y of adj.get(x) || []) if (!seen.has(y)) { seen.add(y); st.push(y); } }
    ts.forEach((x) => seen.add(x.id));
    const keys = [...seen].map((i) => 't' + i).filter((k) => App.rowIdx.has(k));
    App.setSel(keys);
    App.toast(t('selected_n', keys.length));
  }
  function calendarMenu(ts) {
    return App.p.cals.map((c) => ({ l: c.name, ck: ts.length && ts.every((x) => x.cal === c.id), fn: () => App.mutate(t('col_cal'), () => { ts.forEach((x) => { x.cal = c.id; }); }) }));
  }
  function moveToWbsDialog() {
    const ts = App.selTasks(); if (!ts.length) return;
    const body = `<div class="fld"><label>${esc(t('col_wbs'))}</label><select id="mw">${App.p.wbs.map((w) => `<option value="${w.id}">${esc(w.code)} – ${esc(w.name)}</option>`).join('')}</select></div>`;
    modal({ title: t('move_to_wbs'), body, buttons: [{ label: t('cancel'), fn: () => {} }, { label: t('save'), cls: 'pri', fn: (c, el) => { const w = +$('#mw', el).value; App.mutate(t('move_to_wbs'), () => { ts.forEach((x) => { x.wbs = w; }); }, { noSched: true }); } }] });
  }
  function constraintDialog() {
    const ts = App.selTasks(); if (!ts.length) return;
    const t0 = ts[0];
    const body = `<div class="grid2"><div class="fld"><label>${esc(t('col_cstr'))}</label><select id="cs_t"><option value="">${esc(t('cs_none'))}</option>${['SNET', 'SNLT', 'FNET', 'FNLT', 'MSO', 'MFO', 'ALAP'].map((k) => `<option value="${k}"${t0.ct === k ? ' selected' : ''}>${esc(t('cs_' + k))}</option>`).join('')}</select></div><div class="fld"><label>${esc(t('col_cdate'))}</label><input id="cs_d" dir="ltr" value="${esc(fmtD(t0.cd != null ? t0.cd : t0.es))}"></div></div>`;
    modal({ title: t('constraint'), body, buttons: [{ label: t('cancel'), fn: () => {} }, { label: t('save'), cls: 'pri', fn: (c, el) => {
      const k = $('#cs_t', el).value, d = P6.parseDate($('#cs_d', el).value);
      if (k && k !== 'ALAP' && d == null) { App.toast(t('err_date'), true); return false; }
      App.mutate(t('constraint'), () => { ts.forEach((x) => { x.ct = k; x.cd = k && k !== 'ALAP' ? d : null; }); });
    } }] });
  }
  function renameWbs() {
    const w = App.selWbs()[0]; if (!w) return;
    const n = prompt(t('col_name'), w.name); if (n) App.mutate(t('edit'), () => { w.name = n; }, { noSched: true });
  }

  // ================= context menus =================
  const dots = (s) => String(s).replace(/…$/, '') + '…';
  function actionItems() {
    const ts = App.selTasks(), ws = App.selWbs(), has = ts.length > 0, one = ts.length === 1;
    return [
      { i: 'add', l: t('add_activity'), k: 'Ins', fn: () => App.addTask() }, { i: 'mile', l: t('add_milestone'), fn: () => App.addMilestone() }, { i: 'wbsadd', l: t('add_wbs'), fn: () => App.addWbs() }, '-',
      { i: 'cut', l: t('cut'), k: 'Ctrl+X', dis: !has, fn: cutSel }, { i: 'copy', l: t('copy'), k: 'Ctrl+C', dis: !has && !ws.length, fn: () => App.copySel() }, { i: 'copy', l: t('mi_copytable'), k: 'Ctrl+Shift+C', fn: () => App.copyTable(true) }, { i: 'paste', l: t('paste'), k: 'Ctrl+V', dis: !clip, fn: pasteSel },
      { i: 'copy', l: t('duplicate'), k: 'Ctrl+D', dis: !has, fn: () => App.duplicate() }, { i: 'del', l: t('delete'), k: 'Del', dis: !has && !ws.length, fn: () => App.del() }, '-',
      { i: 'indent', l: t('indent'), dis: !ws.length, fn: () => App.indent() }, { i: 'outdent', l: t('outdent'), dis: !ws.length, fn: () => App.outdent() }, { l: t('rename_wbs'), dis: ws.length !== 1, fn: renameWbs }, '-',
      { i: 'assign', l: t('assign'), dis: !has, sub: [
        { l: dots(t('predecessors')), dis: !one, fn: () => assignRel('p') }, { l: dots(t('successors')), dis: !one, fn: () => assignRel('s') }, { l: dots(t('resources')), fn: assignResources },
        { l: t('col_cal'), sub: calendarMenu(ts) }, { l: dots(t('constraint')), fn: constraintDialog }, { l: dots(t('move_to_wbs')), fn: moveToWbsDialog }] },
      { i: 'update', l: t('progress'), dis: !has, sub: [
        { l: t('st_NS'), fn: () => setProgress('NS') }, { l: t('st_IP'), fn: () => setProgress('IP') }, { l: t('st_C'), fn: () => setProgress('C') }, '-',
        ...[25, 50, 75, 100].map((n) => ({ l: n + '%', fn: () => setProgress(n) })), '-', { l: dots(t('update_progress')), fn: () => D.updateProgress() }] },
      { i: 'link', l: t('link'), dis: ts.length < 2, fn: () => App.link() }, { i: 'unlink', l: t('unlink'), dis: !has, fn: () => App.unlink() },
      { i: 'trace', l: t('select'), dis: !has, sub: [{ l: t('sel_succ'), fn: () => relatives(1) }, { l: t('sel_pred'), fn: () => relatives(-1) },
        { l: t('sel_crit'), fn: () => App.setSel(App.p.tasks.filter((x) => x.crit && App.rowIdx.has('t' + x.id)).map((x) => 't' + x.id)) }] }, '-',
      { l: t('expand_all'), fn: () => App.expandAll() }, { l: t('collapse_all'), fn: () => App.collapseAll() }, { i: 'details', l: t('details'), dis: !App.focus, fn: () => { App.S.cfg.dock = 'details'; App.showDetails(); } }
    ];
  }
  App.showCtx = (x, y) => popMenu(actionItems(), x, y);
  function headMenu(k, x, y) {
    const cols = App.cfg.cols;
    popMenu([
      { l: t('sort_asc'), dis: !App.ALL_COLS[k].sort, fn: () => { App.cfg.sort = k; App.cfg.sortDir = 1; App.saveCfg(); App.refresh(); } },
      { l: t('sort_desc'), dis: !App.ALL_COLS[k].sort, fn: () => { App.cfg.sort = k; App.cfg.sortDir = -1; App.saveCfg(); App.refresh(); } }, '-',
      { l: t('hide_col'), dis: cols.length < 2, fn: () => { App.cfg.cols = cols.filter((c) => c.k !== k); App.saveCfg(); App.refresh(); } },
      { l: t('columns') + '…', fn: () => D.columns() }, { l: t('reset_widths'), fn: () => { App.cfg.cols.forEach((c) => { c.w = App.ALL_COLS[c.k].w; }); App.saveCfg(); App.refresh(); } }, '-',
      { l: t('group_sort') + '…', fn: groupSortDialog }
    ], x, y);
  }

  // ================= dialogs =================
  function assignRel(kind) {
    const tk = App.focusTask() || App.selTasks()[0]; if (!tk) return;
    const isPred = kind === 'p';
    const body = document.createElement('div');
    let q = '';
    const draw = () => {
      const p = App.p, mine = p.rels.filter((r) => (isPred ? r.s : r.p) === tk.id);
      const others = p.tasks.filter((x) => x !== tk && (!q || (x.code + ' ' + x.name).toLowerCase().includes(q.toLowerCase()))).slice(0, 250);
      body.innerHTML = `<b dir="auto">${esc(tk.code)} · ${esc(tk.name)}</b>
        <table class="mini" style="margin:6px 0 12px"><thead><tr><th>${esc(t('col_code'))}</th><th>${esc(t('col_name'))}</th><th style="width:90px">${esc(t('rel_type'))}</th><th style="width:70px">${esc(t('lag'))}</th><th style="width:30px"></th></tr></thead><tbody>${mine.map((r) => { const o = App.taskById(isPred ? r.p : r.s); if (!o) return ''; return `<tr data-r="${r.id}"><td>${esc(o.code)}</td><td dir="auto">${esc(o.name)}</td><td><select data-k="type">${['FS', 'SS', 'FF', 'SF'].map((x) => `<option${x === r.type ? ' selected' : ''}>${x}</option>`).join('')}</select></td><td><input data-k="lag" value="${App.fmtN(r.lag)}"></td><td><button class="ib" data-del="${r.id}">×</button></td></tr>`; }).join('') || `<tr><td colspan="5" class="empty">—</td></tr>`}</tbody></table>
        <div class="fld"><label>${esc(t('assign_pick'))}</label><input id="aq" class="inp" dir="auto" placeholder="${esc(t('search'))}" value="${esc(q)}"></div>
        <div class="tbl-scroll" style="max-height:230px;margin-top:8px"><table class="mini"><tbody>${others.map((o) => `<tr data-o="${o.id}" style="cursor:pointer"><td>${esc(o.code)}</td><td dir="auto">${esc(o.name)}</td><td style="color:var(--muted)">${esc((App.wbsById(o.wbs) || {}).code || '')}</td></tr>`).join('')}</tbody></table></div><div class="hint">${esc(t('assign_hint'))}</div>`;
      const aq = $('#aq', body); aq.focus(); aq.setSelectionRange(q.length, q.length);
    };
    draw();
    modal({ title: t(isPred ? 'predecessors' : 'successors'), cls: 'mid', body, noFocus: true, buttons: [{ label: t('close'), cls: 'pri', fn: () => {} }], onClose: () => App.refresh({ details: true }) });
    body.addEventListener('input', (e) => { if (e.target.id === 'aq') { q = e.target.value; draw(); } });
    body.addEventListener('change', (e) => {
      const x = e.target, tr = x.closest('tr[data-r]'); if (!tr) return;
      const rel = App.p.rels.find((r) => r.id === +tr.dataset.r);
      App.mutate(t('edit'), () => { if (x.dataset.k === 'type') rel.type = x.value; else { const v = parseFloat(x.value.replace(',', '.')); if (isNaN(v)) return t('err_num'); rel.lag = v; } });
      draw();
    });
    const add = (oid) => {
      const o = App.taskById(oid), np = isPred ? o.id : tk.id, ns = isPred ? tk.id : o.id;
      if (App.p.rels.some((r) => r.p === np && r.s === ns)) return App.toast(t('err_rel_exists'), true);
      if (P6.wouldLoop(App.p, np, ns)) return App.toast(t('err_loop'), true);
      App.mutate(t('link'), () => { App.p.rels.push({ id: P6.nextId(App.p), p: np, s: ns, type: 'FS', lag: 0 }); });
      draw();
    };
    body.addEventListener('dblclick', (e) => { const tr = e.target.closest('tr[data-o]'); if (tr) add(+tr.dataset.o); });
    body.addEventListener('click', (e) => {
      const d = e.target.closest('[data-del]');
      if (d) { App.mutate(t('unlink'), () => { App.p.rels = App.p.rels.filter((r) => r.id !== +d.dataset.del); }); draw(); }
    });
  }
  function assignResources() {
    const ts = App.selTasks(); if (!ts.length) return;
    const body = document.createElement('div');
    const st = new Map(); // rid -> {on, qty}
    const single = ts.length === 1 ? ts[0] : null;
    const draw = () => {
      const p = App.p;
      body.innerHTML = `<table class="mini"><thead><tr><th style="width:34px"></th><th>${esc(t('resource'))}</th><th>${esc(t('res_role'))}</th><th style="width:110px">${esc(t('qty'))} (h)</th></tr></thead><tbody>${p.rsrc.map((r) => {
        if (!st.has(r.id)) { const a = single && p.asg.find((x) => x.task === single.id && x.rsrc === r.id); st.set(r.id, { on: !!a, qty: a ? a.qty : (r.units || 8) * Math.max(1, ts.length === 1 ? ts[0].dur : 1) }); }
        const s = st.get(r.id);
        return `<tr data-r="${r.id}"><td><input type="checkbox" data-k="on"${s.on ? ' checked' : ''}></td><td dir="auto">${esc(r.name)}</td><td dir="auto">${esc(r.role || '')}</td><td><input data-k="qty" value="${App.fmtN(s.qty)}"></td></tr>`;
      }).join('') || `<tr><td colspan="4" class="empty">${esc(t('no_resources'))}</td></tr>`}</tbody></table><div style="margin-top:10px"><button class="btn sm" id="ar_new">${esc(t('new_resource'))}</button></div>`;
    };
    draw();
    modal({ title: t('resources'), cls: 'mid', body, buttons: [{ label: t('cancel'), fn: () => {} }, { label: t('save'), cls: 'pri', fn: () => {
      App.mutate(t('resources'), () => {
        const p = App.p;
        for (const tk of ts) for (const [rid, s] of st) {
          const ex = p.asg.find((x) => x.task === tk.id && x.rsrc === rid);
          if (s.on && !ex) p.asg.push({ id: P6.nextId(p), task: tk.id, rsrc: rid, qty: s.qty });
          else if (s.on && ex) { if (single) ex.qty = s.qty; }
          else if (!s.on && ex && single) p.asg = p.asg.filter((x) => x !== ex);
        }
      }, { noSched: true });
    } }] });
    body.addEventListener('change', (e) => {
      const x = e.target, tr = x.closest('tr[data-r]'); if (!tr) return; const s = st.get(+tr.dataset.r);
      if (x.dataset.k === 'on') s.on = x.checked; else s.qty = parseFloat(x.value.replace(',', '.')) || 0;
    });
    body.addEventListener('click', (e) => {
      if (e.target.id === 'ar_new') { const n = prompt(t('resource_name')); if (n) { App.mutate(t('new_resource'), () => { App.p.rsrc.push({ id: P6.nextId(App.p), name: n, short: n.slice(0, 8), role: '', units: 8, type: 'RT_Labor' }); }, { noSched: true }); draw(); } }
    });
  }
  function groupSortDialog() {
    const F = App.cfg;
    const o = (v, l, c) => `<option value="${v}"${String(c) === String(v) ? ' selected' : ''}>${esc(l)}</option>`;
    const body = `<div class="grid2"><div class="fld"><label>${esc(t('group_by'))}</label><select id="gs_g">${o('wbs', 'WBS', F.group)}${o('none', t('no_group'), F.group)}</select></div>
      <div class="fld"><label>${esc(t('sort_by'))}</label><select id="gs_s">${['code', 'name', 'es', 'ef', 'tf', 'dur', 'pct'].map((k) => o(k, t('col_' + k), F.sort)).join('')}</select></div>
      <div class="fld"><label>${esc(t('order'))}</label><select id="gs_d">${o(1, t('sort_asc'), F.sortDir)}${o(-1, t('sort_desc'), F.sortDir)}</select></div></div>`;
    modal({ title: t('group_sort'), body, buttons: [{ label: t('cancel'), fn: () => {} }, { label: t('save'), cls: 'pri', fn: (c, el) => { F.group = $('#gs_g', el).value; F.sort = $('#gs_s', el).value; F.sortDir = +$('#gs_d', el).value; App.saveCfg(); App.refresh(); } }] });
  }
  D.prefs = function () {
    const F = App.cfg;
    const body = `<div class="grid2"><div class="fld"><label>${esc(t('language'))}</label><select id="pf_l"><option value="ar"${F.lang === 'ar' ? ' selected' : ''}>العربية</option><option value="en"${F.lang === 'en' ? ' selected' : ''}>English</option></select></div>
      <div class="fld"><label>${esc(t('theme'))}</label><select id="pf_t"><option value="p6"${F.theme === 'p6' ? ' selected' : ''}>P6 Classic</option><option value="light"${F.theme === 'light' ? ' selected' : ''}>${esc(t('th_light'))}</option><option value="dark"${F.theme === 'dark' ? ' selected' : ''}>${esc(t('th_dark'))}</option></select></div></div>
      <div class="fld" style="margin-top:10px;max-width:260px"><label>${esc(t('copy_style'))}</label><select id="pf_cs"><option value="screen"${F.copyStyle !== 'p6' ? ' selected' : ''}>${esc(t('copy_screen'))}</option><option value="p6"${F.copyStyle === 'p6' ? ' selected' : ''}>${esc(t('copy_p6'))}</option><option value="text"${F.copyStyle === 'text' ? ' selected' : ''}>${esc(t('copy_text'))}</option></select></div>
      <div class="fld" style="margin-top:10px;max-width:260px"><label>${esc(t('ui_size'))}</label><select id="pf_z">${['auto', 70, 80, 90, 100, 110, 125, 150].map((z) => `<option value="${z}"${String(F.uiScale == null ? 'auto' : F.uiScale) === String(z) ? ' selected' : ''}>${z === 'auto' ? esc(t('ui_auto')) : z + '%'}</option>`).join('')}</select></div>
      <div class="fld" style="margin-top:10px;max-width:260px"><label>${esc(t('user'))}</label><input id="pf_u" dir="auto" value="${esc(F.user || 'USER')}"></div>
      <label class="chk" style="margin-top:10px"><input type="checkbox" id="pf_a"${F.auto ? ' checked' : ''}> ${esc(t('auto_schedule'))}</label>
      <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" id="pf_reset">${esc(t('reset_layout'))}</button><button class="btn sm dng" id="pf_wipe">${esc(t('wipe_data'))}</button></div>`;
    const m = modal({ title: t('prefs'), cls: 'mid', body, buttons: [{ label: t('cancel'), fn: () => {} }, { label: t('save'), cls: 'pri', fn: (c, el) => {
      F.auto = $('#pf_a', el).checked; F.user = $('#pf_u', el).value.trim() || 'USER'; F.theme = $('#pf_t', el).value; F.uiScale = $('#pf_z', el).value; F.copyStyle = $('#pf_cs', el).value; App.applyScale && App.applyScale(); const l = $('#pf_l', el).value; App.saveCfg(); App.setLang(l);
    } }] });
    m.el.addEventListener('click', async (e) => {
      if (e.target.id === 'pf_reset') { App.applyLayout('classic'); App.cfg.show.spot = false; App.saveCfg(); m.close(); }
      if (e.target.id === 'pf_wipe') { if (!confirm(t('wipe_confirm'))) return; try { localStorage.clear(); const dbs = await indexedDB.databases(); dbs.forEach((d) => indexedDB.deleteDatabase(d.name)); } catch (er) { /* */ } location.reload(); }
    });
  };

  // ================= layouts / filters strip =================
  function layoutName() { return App.cfg.layoutName || t('lay_' + App.cfg.layout); }
  function filterName() { return App.filterLabel ? App.filterLabel() : t('f_all'); }
  function layoutMenu(x, y) {
    const F = App.cfg, saved = F.layouts || {};
    const views = [
      ...Object.keys(App.LAYOUTS).map((k) => ({ l: t('lay_' + k), ck: !F.layoutName && F.layout === k, fn: () => { F.layoutName = ''; App.applyLayout(k); } })),
      ...(Object.keys(saved).length ? ['-', ...Object.keys(saved).map((n) => ({ l: n, ck: F.layoutName === n, fn: () => applySaved(n) }))] : []), '-',
      { l: dots(t('save_layout')), fn: saveLayoutAs },
      { l: t('delete_layout'), dis: !Object.keys(saved).length, sub: Object.keys(saved).map((n) => ({ l: n, fn: () => { delete F.layouts[n]; if (F.layoutName === n) F.layoutName = ''; App.saveCfg(); App.drawLayoutBar(); } })) }
    ];
    popMenu(App.layoutMenuItems(views), x, y);
  }
  function saveLayoutAs() {
    const n = prompt(t('layout_name'), layoutName()); if (!n) return;
    const F = App.cfg; F.layouts = F.layouts || {};
    F.layouts[n] = { cols: clone(F.cols), group: F.group, grp: clone(F.grp || null), sorts: clone(F.sorts || null), sort: F.sort, sortDir: F.sortDir, mode: F.filter.mode, fsel: clone(F.fsel || []), fany: !!F.fany, custom: F.filter.custom || null, pxIdx: F.pxIdx, show: clone(F.show) };
    F.layoutName = n; App.saveCfg(); App.drawLayoutBar(); App.toast(t('layout_saved'));
  }
  function applySaved(n) {
    const F = App.cfg, L = (F.layouts || {})[n]; if (!L) return;
    F.cols = clone(L.cols); F.group = L.group; if (L.grp) F.grp = clone(L.grp); if (L.sorts) F.sorts = clone(L.sorts); F.sort = L.sort; F.sortDir = L.sortDir; F.filter.mode = L.mode; F.fsel = clone(L.fsel || []); F.fany = !!L.fany; F.filter.custom = L.custom; F.pxIdx = L.pxIdx; F.show = Object.assign(F.show, L.show); F.layoutName = n;
    App.saveCfg(); App.refresh(); App.buildMenus();
  }
  function filterMenu(x, y) { popMenu(App.filterMenuItems(), x, y); }
  App.drawLayoutBar = function () {
    const lb = $('#layoutbar'); if (!lb) return;
    const tw = $('#tablePane').offsetWidth + 5;
    lb.innerHTML = `<div class="lbseg" id="lb_l" style="width:${tw}px">▽ ${esc(t('layout'))}: <b>${esc(layoutName())}</b></div><div class="lbseg" id="lb_f">▽ ${esc(t('filter'))}: <b>${esc(filterName())}</b>${App.cfg.filter.text ? ' · “' + esc(App.cfg.filter.text) + '”' : ''}</div>`;
    $('#lb_l').onclick = (e) => { const r = e.currentTarget.getBoundingClientRect(); layoutMenu(r.left, r.bottom); };
    $('#lb_f').onclick = (e) => { const r = e.currentTarget.getBoundingClientRect(); filterMenu(r.left, r.bottom); };
    if (App.drawWinTabs) App.drawWinTabs();
  };

  // ================= title bar, side bars =================
  const IC = {
    folder: 'M3 6h6l2 2h10v11H3z', list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01', people: 'M9 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 21v-3a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v3M17 4a3 3 0 0 1 0 6M21 21v-3a4 4 0 0 0-3-4', flag: 'M5 21V4M5 4h12l-2 4 2 4H5',
    cal: 'M5 5h14v15H5zM5 10h14M9 3v4M15 3v4', chart: 'M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-8', upd: 'M4 4v6h6M20 20v-6h-6M20 10a8 8 0 0 0-14-3L4 10M4 14a8 8 0 0 0 14 3l2-3', play: 'M7 4l13 8-13 8z',
    gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19 12l2-1-2-4-2 1-2-1V5h-4v2l-2 1-2-1-2 4 2 1v2l-2 1 2 4 2-1 2 1v2h4v-2l2-1 2 1 2-4-2-1z', help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.5 9.5a2.5 2.5 0 1 1 4 2c-1 .8-1.5 1.2-1.5 2.5M12 17v.5',
    plus: 'M12 5v14M5 12h14', wbs: 'M3 7h6l2 2h10v10H3zM12 12v5M9.5 14.5h5', trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6', cut: 'M6 3l12 12M18 3L6 15M6 18a3 3 0 1 0 .1 0M18 18a3 3 0 1 0 .1 0', copy: 'M8 8h12v12H8zM16 8V4H4v12h4', paste: 'M9 4h6v3H9zM7 5H5v16h14V5h-2',
    indent: 'M3 6h18M11 12h10M11 18h10M3 9l4 3-4 3z', outdent: 'M3 6h18M11 12h10M11 18h10M7 9l-4 3 4 3z', link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1', unlink: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1M3 3l18 18'
  };
  const svg = (n) => `<svg viewBox="0 0 24 24"><path d="${IC[n]}"/></svg>`;
  const SIDE_L = [['newproj', 'new_project', () => D.newProject()], ['open', 'projects', () => D.projects()], ['hand', 'refresh_data', () => App.refreshData()], '-',
    ['projects', 'win_projects', () => App.openWin('projects')], ['people', 'win_resources', () => App.openWin('resources')], ['notebook', 'tab_notes', () => { App.showWin('activities'); App.cfg.dock = 'details'; App.S ? 0 : 0; App.tab = 'notes'; App.showDetails(); }], ['report', 'reports', () => D.reports()], '-',
    ['activities', 'win_activities', () => App.openWin('activities')], ['addactview', 'mi_addactview', () => { App.showWin('activities'); App.setDock('acts2'); }], ['resassign', 'win_assign', () => App.openWin('assign')], ['wbswin', 'win_wbs', () => App.openWin('wbs')], ['assignbl', 'mi_assignbl', () => D.assignBaselines()], ['maintbl', 'mi_maintbl', () => D.maintainBaselines()], ['expenses', 'win_expenses', () => App.openWin('expenses')], ['docs', 'win_docs', () => App.openWin('docs')], '-',
    ['thresholds', 'win_thresholds', () => App.openWin('thresholds')], ['issue', 'win_issues', () => App.openWin('issues')], ['risk', 'win_risks', () => App.openWin('risks')], '-',
    ['calendar', 'calendars', () => D.calendars()], ['update', 'update_progress', () => D.updateProgress()], ['calc', 'schedule', () => App.schedule()], ['network', 'mi_trace', () => { App.showWin('activities'); App.setDock('network'); }], ['flagfolder', 'select_portfolio', (e) => { const r = e.currentTarget.getBoundingClientRect(); App.popMenu([{ l: t('all_projects'), ck: !App.cfg.portfolio, fn: () => { App.cfg.portfolio = ''; App.saveCfg(); App.refresh(); } }, ...Object.keys(App.cfg.portfolios || {}).map((n) => ({ l: n, ck: App.cfg.portfolio === n, fn: () => { App.cfg.portfolio = n; App.saveCfg(); App.refresh(); } })), '-', { l: t('manage_portfolios') + '…', fn: () => D.portfolios() }], r.right, r.top); }], '-', ['gear', 'project_settings', () => D.settings()], ['help', 'guide', () => D.help()]];
  const SIDE_R = [['add', 'add_activity', () => App.addTask()], ['wbsadd', 'add_wbs', () => App.addWbs()], ['del', 'delete', () => App.del()], '-', ['cut', 'cut', cutSel], ['copy', 'copy', () => copySel()], ['paste', 'paste', pasteSel], '-',
    ['indent', 'indent', () => App.indent()], ['outdent', 'outdent', () => App.outdent()], '-', ['link', 'link', () => App.link()], ['unlink', 'unlink', () => App.unlink()], '-', ['preview', 'print_preview', () => D.printPreview()]];
  function buildSides() {
    for (const [id, list] of [['#sideL', SIDE_L], ['#sideR', SIDE_R]]) {
      const el = $(id); el.innerHTML = '';
      for (const it of list) {
        if (it === '-') { el.appendChild(document.createElement('hr')); continue; }
        const b = document.createElement('button'); b.className = 'ib'; b.title = t(it[1]); b.innerHTML = P6.icon(it[0]); b.onclick = (ev) => it[2](ev); el.appendChild(b);
      }
    }
  }
  function buildTitle() {
    const tb = $('#titlebar'); if (!tb || !App.p) return;
    tb.innerHTML = `<span class="tcenter"><b>P6 Web</b> : <span dir="auto">${esc(App.p.name)}</span> (<span dir="auto">${esc(App.p.name)}${App.p.blName ? ' - ' + esc(App.p.blName) : ''}</span>)</span><span class="wb"><button id="fsBtn" title="F11">⛶</button></span>`;
    $('#fsBtn').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); };
  }
  App.buildTitle = buildTitle;
  App.exportsLater();
  App.saveLayoutCurrent = () => { const n = App.cfg.layoutName; if (!n) return saveLayoutAs(); const F = App.cfg; F.layouts[n] = { cols: clone(F.cols), group: F.group, sort: F.sort, sortDir: F.sortDir, mode: F.filter.mode, custom: F.filter.custom || null, pxIdx: F.pxIdx, show: clone(F.show) }; App.saveCfg(); App.toast(t('layout_saved')); };
  App.openLayoutDialog = () => { const F = App.cfg, saved = F.layouts || {}; const body = `<div class="plist">${Object.keys(App.LAYOUTS).map((k) => `<div class="pitem" data-b="${k}"><div class="nm">${esc(t('lay_' + k))}</div></div>`).join('')}${Object.keys(saved).map((n) => `<div class="pitem" data-s="${esc(n)}"><div class="nm" dir="auto">${esc(n)}</div></div>`).join('')}</div>`; const m = D.modal({ title: t('mi_openlayout'), cls: 'mid', body, buttons: [{ label: t('close'), fn: () => {} }] }); m.el.addEventListener('click', (e) => { const it = e.target.closest('.pitem'); if (!it) return; m.close(); if (it.dataset.b) { F.layoutName = ''; App.applyLayout(it.dataset.b); } else applySaved(it.dataset.s); }); };
  App.buildChrome = function () { buildSides(); buildTitle(); App.drawLayoutBar(); };

  // ================= bottom dock: resource usage =================
  App.setDock = function (mode) { App.cfg.dock = mode; App.cfg.detOpen = mode !== 'none'; App.saveCfg(); App.layoutDetails(); App.renderDetails(); App.buildMenus(); };
  let usageSel = null, usageCache = null;
  function computeUsage(rid) {
    const uo = Object.assign({ m: 'units', cum: true, limit: true }, App.cfg.usage), costMode = uo.m === 'cost';
    const p = App.p, o = App.gantt.o, minD = o.minDay, n = o.maxDay - o.minDay + 1;
    const act = new Float64Array(n), rem = new Float64Array(n), lim = new Float64Array(n);
    const tasks = new Map(p.tasks.map((x) => [x.id, x]));
    const cals = new Map(p.cals.map((c) => [c.id, c]));
    const dcal = cals.get(p.defCal) || p.cals[0];
    const dd = p.dataDate;
    const rs = p.rsrc.filter((r) => rid == null || r.id === rid);
    const used = new Set();
    for (const a of p.asg) {
      if (rid != null && a.rsrc !== rid) continue;
      const tk = tasks.get(a.task); if (!tk || tk.es == null) continue;
      used.add(a.rsrc);
      const cal = cals.get(tk.cal) || dcal, days = [];
      for (let d = tk.es; d <= tk.ef; d++) if (P6.isWork(cal, d)) days.push(d);
      if (!days.length) days.push(tk.es);
      const rr0 = p.rsrc.find((x) => x.id === a.rsrc) || {}; const per = (a.qty * (costMode ? (a.price != null ? +a.price : P6.priceAt(rr0, tk.es)) : 1)) / days.length;
      for (const d of days) { const i = d - minD; if (i < 0 || i >= n) continue; if (d <= dd) act[i] += per; else rem[i] += per; }
    }
    if (!costMode) for (const r of rs) { if (rid == null && !used.has(r.id)) continue; for (let i = 0; i < n; i++) if (P6.isWork(dcal, minD + i)) lim[i] += r.units || 8; }
    return { act, rem, lim, minD, n };
  }
  function drawUsage() {
    const sv = $('#usvg'); if (!sv || !App.gantt) return;
    const box = sv.parentNode, W = box.clientWidth, H = box.clientHeight; if (!W || !H) return;
    sv.setAttribute('width', W); sv.setAttribute('height', H);
    const gt = App.gantt, o = gt.o, px = o.px, sx = gt.sc.scrollLeft;
    const ukey = JSON.stringify(App.cfg.usage || {}); if (!usageCache || usageCache.dirty || usageCache.sel !== usageSel || usageCache.ukey !== ukey) { usageCache = computeUsage(usageSel); usageCache.sel = usageSel; usageCache.ukey = ukey; }
    const U = usageCache, d0 = Math.floor(o.minDay + sx / px), d1 = Math.ceil(o.minDay + (sx + W) / px);
    const X = (d) => (d - o.minDay) * px - sx;
    const HB = 46, top = 8, bot = H - HB - 2, ch = bot - top;
    // buckets: weeks for fine scales, months otherwise
    const buckets = [];
    const weekly = px >= 5;
    if (weekly) for (let d = U.minD - P6.dow(U.minD); d < U.minD + U.n; d += 7) buckets.push([d, d + 7]);
    else for (let d = P6.mkDay(P6.ymd(U.minD).y, P6.ymd(U.minD).m, 1); d < U.minD + U.n; ) { const y = P6.ymd(d), nx = P6.mkDay(y.y, y.m + 1, 1); buckets.push([d, nx]); d = nx; }
    const sum = (arr, a, b) => { let s = 0; for (let d = Math.max(a, U.minD); d < Math.min(b, U.minD + U.n); d++) s += arr[d - U.minD]; return s; };
    const data = buckets.map(([a, b]) => ({ a, b, act: sum(U.act, a, b), rem: sum(U.rem, a, b), lim: sum(U.lim, a, b) }));
    let mx = 1, total = 0;
    data.forEach((x) => { mx = Math.max(mx, x.act + x.rem, x.lim); total += x.act + x.rem; });
    let cum = 0; const line = [];
    let s = `<rect width="${W}" height="${H}" fill="#fff"/>`;
    const nice = (v) => { const e = Math.pow(10, Math.floor(Math.log10(v))); const m = v / e; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * e; };
    const ymax = nice(mx), cmax = nice(Math.max(1, total));
    for (let i = 0; i <= 4; i++) { const y = bot - (ch * i) / 4; s += `<line x1="0" x2="${W}" y1="${y}" y2="${y}" stroke="#e3e3e3"/><text x="${W - 4}" y="${y - 2}" text-anchor="end" style="font-size:10px;fill:#555">${Math.round((cmax * i) / 4)}h</text><text x="4" y="${y - 2}" style="font-size:10px;fill:#555">${Math.round((ymax * i) / 4)}h</text>`; }
    let lim = '';
    for (const x of data) {
      cum += x.act + x.rem;
      const x1 = X(x.a), x2 = X(x.b);
      line.push([x2, bot - (cum / cmax) * ch]);
      if (x2 < 0 || x1 > W) continue;
      const bw = Math.max(1, x2 - x1 - 1);
      const ha = (x.act / ymax) * ch;
      const over = x.lim > 0 ? Math.max(0, x.act + x.rem - x.lim) : 0;
      const okRem = Math.max(0, x.rem - over);
      let y = bot;
      if (x.act > 0) { s += `<rect x="${x1}" y="${y - ha}" width="${bw}" height="${ha}" fill="#1c2fd0" stroke="#000" stroke-width=".5"/>`; y -= ha; }
      if (okRem > 0) { const h = (okRem / ymax) * ch; s += `<rect x="${x1}" y="${y - h}" width="${bw}" height="${h}" fill="#8ee08e" stroke="#000" stroke-width=".5"/>`; y -= h; }
      if (over > 0) { const h = (over / ymax) * ch; s += `<rect x="${x1}" y="${y - h}" width="${bw}" height="${h}" fill="#e00000" stroke="#000" stroke-width=".5"/>`; }
      if (x.lim > 0) { const yl = bot - Math.min(1, x.lim / ymax) * ch; lim += `${lim ? 'L' : 'M'}${x1} ${yl}H${x2}`; }
    }
    const uo2 = Object.assign({ m: 'units', cum: true, limit: true }, App.cfg.usage);
    if (line.length && uo2.cum) s += `<polyline fill="none" stroke="#7fd77f" stroke-width="2" points="${line.map((q) => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ')}"/>`;
    if (lim && uo2.limit) s += `<path d="${lim}" fill="none" stroke="#000" stroke-width="1.5"/>`;
    const dx = X(App.p.dataDate + 1); s += `<line x1="${dx}" x2="${dx}" y1="0" y2="${bot}" stroke="#2457d6" stroke-width="1.5"/>`;
    const hd = gt.header(W, d0, d1);
    s += `<g transform="translate(0,${H - HB})"><rect width="${W}" height="${HB}" fill="#eee"/>${hd.svg}</g>`;
    sv.innerHTML = s;
  }
  P6.onGanttDraw = () => { if (App.cfg && App.cfg.dock === 'usage') drawUsage(); };
  App.markUsageDirty = () => { if (usageCache) usageCache.dirty = true; };
  App.renderUsage = function (el) {
    const p = App.p, lw = $('#tablePane').offsetWidth + 5;
    el.innerHTML = `<div class="udock"><div class="ul" style="width:${lw}px"><div class="dockhead">▽ ${esc(t('display'))}: ${esc(t('cur_resources'))}</div>
      <div style="flex:1;overflow:auto"><table class="mini" id="rtab"><thead><tr><th>${esc(t('res_short'))}</th><th>${esc(t('resource'))}</th><th>${esc(t('res_role'))}</th><th style="width:96px">${esc(t('def_units'))}</th><th style="width:90px">${esc(t('price_unit'))}</th></tr></thead><tbody>${p.rsrc.map((r) => `<tr data-r="${r.id}"${usageSel === r.id ? ' class="rsel"' : ''}><td><input data-f="short" value="${esc(r.short || '')}"></td><td><input data-f="name" dir="auto" value="${esc(r.name)}"></td><td><input data-f="role" dir="auto" value="${esc(r.role || '')}"></td><td><input data-f="units" value="${App.fmtN(r.units || 8)}"></td><td><input data-f="price" value="${App.fmtN(r.price || 0)}"></td></tr>`).join('') || `<tr><td colspan="5" class="empty">${esc(t('no_resources'))}</td></tr>`}</tbody></table></div>
      <div class="ufoot"><label class="chk"><input type="checkbox" id="u_byres"${App.cfg.filter.byRes ? ' checked' : ''}> ${esc(t('filter_by_res'))}</label><button class="btn sm" id="u_add">+ ${esc(t('new_resource'))}</button><button class="btn sm dng" id="u_del"${usageSel == null ? ' disabled' : ''}>${esc(t('delete'))}</button><button class="btn sm" id="u_asg"${usageSel == null ? ' disabled' : ''}>${esc(t('assign_to_sel'))}</button><button class="btn sm" id="u_all"${usageSel == null ? ' disabled' : ''}>${esc(t('show_all_res'))}</button></div></div>
      <div class="ur"><div class="dockhead">▽ ${esc(t('display'))}: ${esc(usageSel == null ? t('all_resources') : (p.rsrc.find((r) => r.id === usageSel) || {}).name || '')} <span style="margin-inline-start:auto"><button class="ib" data-act="det" title="${esc(t('details'))}" style="height:18px">${esc(t('details'))}</button> <button class="ib" data-act="hide" style="height:18px">▾</button></span></div>
      <div class="uchart"><div class="ulegend"><div><i style="background:#1c2fd0"></i>${esc(t('actual_units'))}</div><div><i style="background:#8ee08e"></i>${esc(t('remaining_units'))}</div><div><i style="background:#e00000"></i>${esc(t('overalloc'))}</div><div><i style="background:#000"></i>${esc(t('limit'))}</div></div><svg id="usvg" class="gh gsvg"></svg></div></div></div>`;
    if (usageCache) usageCache.dirty = true;
    const hook = () => { App.markUsageDirty(); drawUsage(); };
    el.querySelector('#rtab tbody').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-r]'); if (!tr) return; usageSel = +tr.dataset.r; App.renderDetails(); if (App.cfg.filter.byRes) App.refresh(); });
    el.querySelector('#rtab').addEventListener('change', (e) => {
      const tr = e.target.closest('tr[data-r]'), r = p.rsrc.find((x) => x.id === +tr.dataset.r), f = e.target.dataset.f;
      App.mutate(t('edit'), () => { if (f === 'units') r.units = parseFloat(e.target.value.replace(',', '.')) || 8; else if (f === 'price') r.price = Math.max(0, parseFloat(e.target.value.replace(',', '.')) || 0); else r[f] = e.target.value; }, { noSched: true, refresh: { keepDock: true } }); hook();
    });
    el.querySelector('#rtab').addEventListener('contextmenu', (e) => {
      e.preventDefault(); const tr = e.target.closest('tr[data-r]'); if (tr) { usageSel = +tr.dataset.r; }
      popMenu([{ l: t('new_resource'), fn: addRes }, { l: t('delete'), dis: usageSel == null, fn: delRes }, { l: t('assign_to_sel'), dis: usageSel == null, fn: assignSel }, { l: t('show_all_res'), dis: usageSel == null, fn: () => { usageSel = null; App.renderDetails(); } }], e.clientX, e.clientY);
    });
    const addRes = () => { const n = prompt(t('resource_name')); if (n) { App.mutate(t('new_resource'), () => { p.rsrc.push({ id: P6.nextId(p), name: n, short: n.slice(0, 8), role: '', units: 8, type: 'RT_Labor' }); }, { noSched: true }); App.renderDetails(); } };
    const delRes = () => { const id = usageSel; if (id == null || !confirm(t('confirm_generic'))) return; App.mutate(t('delete'), () => { p.rsrc = p.rsrc.filter((r) => r.id !== id); p.asg = p.asg.filter((a) => a.rsrc !== id); }, { noSched: true }); usageSel = null; App.renderDetails(); };
    const assignSel = () => {
      const ts = App.selTasks(), id = usageSel; if (!ts.length || id == null) return App.toast(t('err_link_sel'), true);
      const r = p.rsrc.find((x) => x.id === id);
      App.mutate(t('resources'), () => { ts.forEach((tk) => { if (!p.asg.some((a) => a.task === tk.id && a.rsrc === id)) p.asg.push({ id: P6.nextId(p), task: tk.id, rsrc: id, qty: (r.units || 8) * Math.max(1, tk.dur) }); }); }, { noSched: true });
      App.renderDetails();
    };
    el.querySelector('#u_add').onclick = addRes; el.querySelector('#u_del').onclick = delRes; el.querySelector('#u_asg').onclick = assignSel;
    el.querySelector('#u_all').onclick = () => { usageSel = null; App.renderDetails(); };
    el.querySelector('#u_byres').onchange = (e) => { App.cfg.filter.byRes = e.target.checked; App.saveCfg(); App.refresh(); };
    el.querySelector('[data-act=det]').onclick = () => App.setDock('details');
    el.querySelector('[data-act=hide]').onclick = () => App.setDock('none');
    requestAnimationFrame(drawUsage);
  };
  App.usageSel = () => usageSel;
  addEventListener('resize', () => { if (App.cfg && App.cfg.dock === 'usage') App.renderDetails(); });

  // ================= init =================
  App.initP6UI = function () {
    $('#tHead').addEventListener('contextmenu', (e) => { e.preventDefault(); const th = e.target.closest('.th'); if (th) headMenu(th.dataset.k, e.clientX, e.clientY); });
    $('#winhead').addEventListener('contextmenu', (e) => e.preventDefault());
    App.buildChrome();
  };
})(window);

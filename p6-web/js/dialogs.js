/* P6 Web – dialogs: projects, settings, calendars, columns, progress update, baselines, reports, imports, help. */
(function (g) {
  'use strict';
  const P6 = g.P6, App = g.App, D = (App.dialogs = {});
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = P6.esc, t = (k, ...a) => P6.t(k, ...a);
  const fmtD = P6.fmtDate;
  const bd = (v) => '<bdi dir="ltr">' + fmtD(v) + '</bdi>';
  

  function modal(o) {
    const bg = document.createElement('div');
    bg.className = 'modal-bg'; bg.dir = P6.dir();
    bg.innerHTML = `<div class="modal ${o.cls || ''}" role="dialog"><div class="mh"><span>${esc(String(o.title).replace(/…$/, ''))}</span><button class="x" aria-label="close">×</button></div><div class="mb"></div><div class="mf"></div></div>`;
    const mb = $('.mb', bg), mf = $('.mf', bg);
    if (typeof o.body === 'string') mb.innerHTML = o.body; else mb.appendChild(o.body);
    const close = () => { bg.remove(); document.removeEventListener('keydown', onKey, true); if (o.onClose) o.onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);
    $('.x', bg).onclick = close;
    bg.addEventListener('mousedown', (e) => { if (e.target === bg && !o.sticky) close(); });
    const btns = o.buttons || [{ label: t('close'), fn: () => {} }];
    btns.forEach((b) => {
      const el = document.createElement('button');
      el.className = 'btn ' + (b.cls || ''); el.textContent = b.label;
      el.onclick = () => { if (b.fn(close, bg) !== false) close(); };
      mf.appendChild(el);
    });
    if (!btns.length) mf.remove();
    document.body.appendChild(bg);
    if (o.onOpen) o.onOpen(bg, close);
    const first = bg.querySelector('input:not([type=checkbox]),select,textarea');
    if (first && !o.noFocus) first.focus();
    return { el: bg, close };
  }
  D.modal = modal;
  const toast = (m, e) => App.toast(m, e);
  const dateIn = (id, v) => `<input id="${id}" value="${esc(fmtD(v))}" placeholder="dd-Mon-yy" dir="ltr">`;
  const row = (label, inner, cls) => `<div class="fld ${cls || ''}"><label>${esc(label)}</label>${inner}</div>`;

  // ---------- projects ----------
  D.projects = async function () {
    let list = (await App.listProjects()).sort((a, b) => b.updated - a.updated);
    const pf = App.cfg.portfolio && (App.cfg.portfolios || {})[App.cfg.portfolio];
    if (pf) list = list.filter((x) => pf.includes(x.id));
    const cur = App.p && App.p.id;
    const body = document.createElement('div');
    body.innerHTML = `<div class="hint">${esc(t('projects_hint'))}</div><div class="plist">${list.map((p) => `<div class="pitem${p.id === cur ? ' cur' : ''}" data-id="${esc(p.id)}"><div style="flex:1"><div class="nm" dir="auto">${esc(p.name)}</div><div class="sub">${esc(t('activities'))}: ${p.tasks} · ${p.start != null ? bd(p.start) + ' → ' + bd(p.finish) : ''} · ${new Date(p.updated).toLocaleString()}</div></div><button class="btn sm dng" data-del="${esc(p.id)}">${esc(t('delete'))}</button></div>`).join('') || `<div class="empty">${esc(t('no_projects'))}</div>`}</div>`;
    const m = modal({
      title: t('projects'), cls: 'mid', body,
      buttons: [
        { label: t('new_project'), fn: () => { D.newProject(); } },
        { label: t('open_file'), cls: 'pri', fn: () => { App.openFile(); } },
        { label: t('load_sample'), fn: () => { App.loadSample(); } }
      ]
    });
    body.addEventListener('click', async (e) => {
      const del = e.target.closest('[data-del]');
      if (del) {
        e.stopPropagation();
        if (!confirm(t('confirm_delete_project'))) return;
        await App.deleteProject(del.dataset.del);
        del.closest('.pitem').remove();
        return;
      }
      const it = e.target.closest('.pitem'); if (!it) return;
      if (it.dataset.id === cur) return m.close();
      const p = await App.loadProject(it.dataset.id);
      if (p) { App.openProject(p); m.close(); }
    });
  };

  D.newProject = function () {
    const body = `<div class="grid2">${row(t('project_name'), `<input id="np_name" value="${esc(t('new_project_name'))}" dir="auto">`, 'w2')}${row(t('plan_start'), dateIn('np_start', P6.todayDay()))}
      ${row(t('workweek'), `<select id="np_week"><option value="sunThu">${esc(t('wk_sunThu'))}</option><option value="monFri">${esc(t('wk_monFri'))}</option><option value="satThu">${esc(t('wk_satThu'))}</option><option value="all7">${esc(t('wk_all7'))}</option></select>`)}</div>`;
    modal({
      title: t('new_project'), body, buttons: [{ label: t('cancel'), fn: () => {} }, {
        label: t('create'), cls: 'pri', fn: (c, el) => {
          const name = $('#np_name', el).value.trim() || 'Project';
          const st = P6.parseDate($('#np_start', el).value);
          if (st == null) { toast(t('err_date'), true); return false; }
          const p = P6.newProject(name, { planStart: st, week: P6.WEEKS[$('#np_week', el).value] });
          const tk = P6.newTask(p, 1, { name: t('new_activity'), dur: 5, rem: 5 }); p.tasks.push(tk);
          P6.schedule(p);
          App.openProject(p);
        }
      }]
    });
  };

  // ---------- settings ----------
  D.settings = function () {
    const p = App.p;
    const body = `<div class="grid2">${row(t('project_name'), `<input id="s_name" value="${esc(p.name)}" dir="auto">`, 'w2')}${row(t('project_desc'), `<input id="s_desc" value="${esc(p.desc || '')}" dir="auto">`, 'w2')}
      ${row(t('plan_start'), dateIn('s_ps', p.planStart))}${row(t('data_date'), dateIn('s_dd', p.dataDate))}${row(t('must_finish'), dateIn('s_mf', p.mustFinish))}
      ${row(t('def_calendar'), `<select id="s_cal">${p.cals.map((c) => `<option value="${c.id}"${c.id === p.defCal ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`)}
      ${row(t('crit_float'), `<input id="s_cf" value="${p.critFloat || 0}">`)}
      ${row(t('progress_logic'), `<select id="s_ret"><option value="1"${p.retained ? ' selected' : ''}>${esc(t('retained'))}</option><option value="0"${!p.retained ? ' selected' : ''}>${esc(t('override'))}</option></select>`)}</div>
      <p class="hint">${esc(t('settings_hint'))}</p>`;
    modal({
      title: t('project_settings'), cls: 'mid', body, buttons: [{ label: t('cancel'), fn: () => {} }, {
        label: t('save'), cls: 'pri', fn: (c, el) => {
          const ps = P6.parseDate($('#s_ps', el).value), dd = P6.parseDate($('#s_dd', el).value), mf = $('#s_mf', el).value.trim() ? P6.parseDate($('#s_mf', el).value) : null;
          if (ps == null || dd == null) { toast(t('err_date'), true); return false; }
          App.mutate(t('project_settings'), () => {
            p.name = $('#s_name', el).value.trim() || p.name; p.desc = $('#s_desc', el).value;
            p.planStart = ps; p.dataDate = dd; p.mustFinish = mf; p.defCal = +$('#s_cal', el).value;
            p.critFloat = parseFloat($('#s_cf', el).value) || 0; p.retained = $('#s_ret', el).value === '1';
            const root = p.wbs.find((w) => w.parent == null); if (root && !p.xer) root.name = p.name;
          });
        }
      }]
    });
  };

  // ---------- calendars ----------
  D.calendars = function () {
    const p = App.p;
    let cur = p.cals.find((c) => c.id === p.defCal) || p.cals[0];
    const body = document.createElement('div');
    const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const draw = () => {
      body.innerHTML = `<div class="grid2">${row(t('calendar'), `<select id="c_sel">${p.cals.map((c) => `<option value="${c.id}"${c === cur ? ' selected' : ''}>${esc(c.name)}${c.id === p.defCal ? ' ★' : ''}</option>`).join('')}</select>`)}
        ${row(t('cal_name'), `<input id="c_name" value="${esc(cur.name)}" dir="auto">`)}${row(t('hours_day'), `<input id="c_hrs" value="${cur.hrs}">`)}</div>
        <div class="fld" style="margin-top:12px"><label>${esc(t('workweek'))}</label><div class="dayrow">${days.map((d, i) => `<label><input type="checkbox" data-d="${i}"${cur.work[i] ? ' checked' : ''}> ${esc(t('d_' + d))}</label>`).join('')}</div></div>
        <div class="fld" style="margin-top:12px"><label>${esc(t('exceptions'))}</label>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center"><input id="h_from" dir="ltr" placeholder="dd-Mon-yy" style="width:120px" class="inp"><span>→</span><input id="h_to" dir="ltr" placeholder="dd-Mon-yy" style="width:120px" class="inp"><select id="h_kind" class="inp"><option value="0">${esc(t('holiday'))}</option><option value="1">${esc(t('workday'))}</option></select><button class="btn sm" id="h_add">${esc(t('add'))}</button></div>
        <div id="h_list" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:5px;max-height:150px;overflow:auto"></div></div>
        <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" id="c_new">${esc(t('new_calendar'))}</button><button class="btn sm" id="c_def">${esc(t('set_default'))}</button><button class="btn sm dng" id="c_del">${esc(t('delete_calendar'))}</button></div>`;
      const hl = $('#h_list', body);
      const keys = Object.keys(cur.exc).map(Number).sort((a, b) => a - b);
      hl.innerHTML = keys.map((k) => `<span class="tag" style="${cur.exc[k] ? 'color:var(--ok)' : ''}"><bdi dir="ltr">${fmtD(k)}</bdi> ${cur.exc[k] ? '✚' : ''} <a href="#" data-rm="${k}" style="color:var(--danger);text-decoration:none">×</a></span>`).join('') || `<span class="hint">${esc(t('no_exceptions'))}</span>`;
    };
    draw();
    modal({
      title: t('calendars'), cls: 'mid', body, buttons: [{ label: t('close'), cls: 'pri', fn: () => {} }],
      onClose: () => { App.refresh({ details: true }); }
    });
    const commit = (label, fn) => App.mutate(label, () => { fn(); cur.mod = true; P6.touchCal(cur); });
    body.addEventListener('change', (e) => {
      const x = e.target;
      if (x.id === 'c_sel') { cur = p.cals.find((c) => c.id === (isNaN(+x.value) ? x.value : +x.value)); draw(); }
      else if (x.id === 'c_name') commit(t('calendars'), () => { cur.name = x.value; });
      else if (x.id === 'c_hrs') commit(t('calendars'), () => { cur.hrs = parseFloat(x.value) || 8; });
      else if (x.dataset.d) commit(t('calendars'), () => { cur.work[+x.dataset.d] = x.checked; });
    });
    body.addEventListener('click', (e) => {
      e.preventDefault && 0;
      const rm = e.target.closest('[data-rm]');
      if (rm) { e.preventDefault(); commit(t('calendars'), () => { delete cur.exc[rm.dataset.rm]; }); draw(); return; }
      const id = e.target.id;
      if (id === 'h_add') {
        const a = P6.parseDate($('#h_from', body).value); let b = P6.parseDate($('#h_to', body).value);
        if (a == null) return toast(t('err_date'), true);
        if (b == null || b < a) b = a;
        if (b - a > 800) return toast(t('err_range'), true);
        const kind = $('#h_kind', body).value === '1';
        commit(t('calendars'), () => { for (let d = a; d <= b; d++) cur.exc[d] = kind; }); draw();
      } else if (id === 'c_new') {
        const n = prompt(t('cal_name'), t('new_calendar')); if (!n) return;
        let nc;
        App.mutate(t('calendars'), () => { nc = P6.newCal(P6.nextId(p), n, cur.work); nc.hrs = cur.hrs; nc.exc = Object.assign({}, cur.exc); nc.mod = true; p.cals.push(nc); });
        cur = nc; draw();
      } else if (id === 'c_def') { App.mutate(t('calendars'), () => { p.defCal = cur.id; }); draw(); }
      else if (id === 'c_del') {
        if (p.cals.length < 2) return toast(t('err_last_cal'), true);
        if (p.tasks.some((x) => x.cal === cur.id) || cur.id === p.defCal) return toast(t('err_cal_used'), true);
        App.mutate(t('calendars'), () => { p.cals = p.cals.filter((c) => c !== cur); }); cur = p.cals[0]; draw();
      }
    });
  };

  // ---------- custom filter ----------
  D.filter = function () {
    const F = App.cfg.filter;
    const conds = (F.custom && F.custom.conds && F.custom.conds.length ? F.custom.conds : [{ f: 'name', op: 'has', v: '' }]).map((c) => ({ ...c }));
    let join = (F.custom && F.custom.join) || 'and';
    const fields = ['code', 'name', 'status', 'dur', 'rem', 'pct', 'es', 'ef', 'tf', 'ff', 'wbs'], ops = ['has', 'eq', 'ne', 'gt', 'lt', 'ge', 'le'];
    const body = document.createElement('div');
    const draw = () => {
      body.innerHTML = `<div class="fld" style="max-width:260px;margin-bottom:10px"><label>${esc(t('cf_match'))}</label><select id="cf_join"><option value="and"${join === 'and' ? ' selected' : ''}>${esc(t('cf_all'))}</option><option value="or"${join === 'or' ? ' selected' : ''}>${esc(t('cf_any'))}</option></select></div>
        <table class="mini"><tbody>${conds.map((c, i) => `<tr data-i="${i}"><td><select data-k="f">${fields.map((f) => `<option value="${f}"${c.f === f ? ' selected' : ''}>${esc(t('col_' + f))}</option>`).join('')}</select></td><td><select data-k="op">${ops.map((o) => `<option value="${o}"${c.op === o ? ' selected' : ''}>${esc(t('op_' + o))}</option>`).join('')}</select></td><td><input data-k="v" dir="auto" value="${esc(c.v)}" placeholder="${c.f === 'status' ? 'NS / IP / C' : ''}"></td><td><button class="ib" data-rm="${i}">×</button></td></tr>`).join('')}</tbody></table>
        <div style="margin-top:8px"><button class="btn sm" id="cf_add">+ ${esc(t('add'))}</button></div>`;
    };
    draw();
    modal({
      title: t('cf_title'), cls: 'mid', body, buttons: [
        { label: t('cf_clear'), fn: () => { F.mode = 'all'; F.custom = null; App.refresh(); App.buildLayoutBar && App.buildLayoutBar(); } },
        { label: t('cf_apply'), cls: 'pri', fn: () => { F.custom = { conds: conds.filter((c) => String(c.v).trim() !== ''), join }; F.mode = F.custom.conds.length ? 'custom' : 'all'; try { localStorage.setItem('p6web.cfg', JSON.stringify(App.cfg)); } catch (e) { /* */ } App.refresh(); } }
      ]
    });
    body.addEventListener('change', (e) => { const x = e.target; if (x.id === 'cf_join') join = x.value; else if (x.dataset.k) { conds[+x.closest('tr').dataset.i][x.dataset.k] = x.value; } });
    body.addEventListener('click', (e) => {
      if (e.target.id === 'cf_add') { conds.push({ f: 'name', op: 'has', v: '' }); draw(); }
      const r = e.target.closest('[data-rm]'); if (r && conds.length > 1) { conds.splice(+r.dataset.rm, 1); draw(); }
    });
  };

  // ---------- columns ----------
  D.columns = function () {
    const S0 = App;
    const cfg = S0.cfg;
    let cols = cfg.cols.map((c) => ({ ...c }));
    const all = Object.keys(App.ALL_COLS);
    const body = document.createElement('div');
    const draw = () => {
      const shown = new Set(cols.map((c) => c.k));
      body.innerHTML = `<div class="two"><div><b>${esc(t('visible_cols'))}</b><div id="cl_vis" style="margin-top:6px">${cols.map((c, i) => `<div class="pitem" style="padding:5px 10px"><span style="flex:1">${esc(t('col_' + c.k))}</span><button class="ib" data-up="${i}">↑</button><button class="ib" data-dn="${i}">↓</button><button class="ib" data-rm="${i}">×</button></div>`).join('')}</div></div>
        <div><b>${esc(t('available_cols'))}</b><div style="margin-top:6px">${all.filter((k) => !shown.has(k)).map((k) => `<div class="pitem" style="padding:5px 10px" data-add="${k}"><span style="flex:1">${esc(t('col_' + k))}</span><span>＋</span></div>`).join('')}</div></div></div>`;
    };
    draw();
    modal({
      title: t('columns'), cls: 'mid', body, buttons: [
        { label: t('reset'), fn: () => { cfg.cols = App.DEF_COLS.map((k) => ({ k, w: App.ALL_COLS[k].w })); App.refresh(); } },
        { label: t('save'), cls: 'pri', fn: () => { cfg.cols = cols; try { localStorage.setItem('p6web.cfg', JSON.stringify(cfg)); } catch (e) { /* */ } App.refresh(); } }]
    });
    body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-up],[data-dn],[data-rm],[data-add]'); if (!b) return;
      if (b.dataset.up) { const i = +b.dataset.up; if (i > 0) [cols[i - 1], cols[i]] = [cols[i], cols[i - 1]]; }
      else if (b.dataset.dn) { const i = +b.dataset.dn; if (i < cols.length - 1) [cols[i + 1], cols[i]] = [cols[i], cols[i + 1]]; }
      else if (b.dataset.rm) { if (cols.length > 1) cols.splice(+b.dataset.rm, 1); }
      else if (b.dataset.add) cols.push({ k: b.dataset.add, w: App.ALL_COLS[b.dataset.add].w });
      draw();
    });
  };

  // ---------- WBS & resources ----------
  D.wbs = function () {
    const p = App.p;
    const body = document.createElement('div');
    const depth = (w) => { let d = 0, x = w; while (x && x.parent != null && d < 20) { x = p.wbs.find((q) => q.id === x.parent); d++; } return d; };
    const ordered = () => {
      const out = [], kids = (id) => p.wbs.filter((w) => w.parent === id).sort((a, b) => a.seq - b.seq);
      const walk = (w) => { out.push(w); kids(w.id).forEach(walk); };
      p.wbs.filter((w) => w.parent == null).forEach(walk); return out;
    };
    const draw = () => {
      const cnt = (id) => p.tasks.filter((x) => x.wbs === id).length;
      body.innerHTML = `<table class="mini"><thead><tr><th>${esc(t('col_code'))}</th><th>${esc(t('col_name'))}</th><th>${esc(t('parent_wbs'))}</th><th>${esc(t('activities'))}</th><th></th></tr></thead><tbody>${ordered().map((w) => `<tr data-w="${w.id}"><td><input data-f="code" value="${esc(w.code)}" style="padding-inline-start:${depth(w) * 14}px"></td><td><input data-f="name" value="${esc(w.name)}" dir="auto"></td><td><select data-f="parent"><option value="">—</option>${p.wbs.filter((x) => x.id !== w.id).map((x) => `<option value="${x.id}"${x.id === w.parent ? ' selected' : ''}>${esc(x.code)}</option>`).join('')}</select></td><td>${cnt(w.id)}</td><td>${w.parent != null ? `<button class="ib" data-del="${w.id}">×</button>` : ''}</td></tr>`).join('')}</tbody></table><div style="margin-top:10px"><button class="btn sm" id="w_add">${esc(t('add_wbs'))}</button></div>`;
    };
    draw();
    modal({ title: t('wbs_tree'), cls: 'mid', body, buttons: [{ label: t('close'), cls: 'pri', fn: () => {} }], onClose: () => App.refresh({ details: true }) });
    body.addEventListener('change', (e) => {
      const tr = e.target.closest('tr'); if (!tr) return; const w = p.wbs.find((q) => q.id === +tr.dataset.w); const f = e.target.dataset.f;
      App.mutate(t('edit'), () => {
        if (f === 'parent') {
          const np = e.target.value === '' ? null : +e.target.value;
          const desc = (id) => [id, ...p.wbs.filter((q) => q.parent === id).flatMap((q) => desc(q.id))];
          if (np != null && desc(w.id).includes(np)) return t('err_loop');
          w.parent = np;
        } else w[f] = e.target.value;
      }, { noSched: true });
      draw();
    });
    body.addEventListener('click', (e) => {
      if (e.target.id === 'w_add') { const par = p.wbs.find((w) => w.parent == null).id; App.mutate(t('add_wbs'), () => { p.wbs.push({ id: P6.nextId(p), parent: par, code: 'W' + (p.wbs.length + 1), name: t('new_wbs'), seq: p.wbs.length + 1 }); }, { noSched: true }); draw(); }
      const d = e.target.closest('[data-del]');
      if (d) {
        const id = +d.dataset.del, w = p.wbs.find((q) => q.id === id);
        if (p.tasks.some((x) => x.wbs === id)) return toast(t('err_wbs_used'), true);
        App.mutate(t('delete'), () => { p.wbs.forEach((q) => { if (q.parent === id) q.parent = w.parent; }); p.wbs = p.wbs.filter((q) => q.id !== id); }, { noSched: true }); draw();
      }
    });
  };
  D.resources = function () {
    const p = App.p;
    const body = document.createElement('div');
    const draw = () => {
      body.innerHTML = `<table class="mini"><thead><tr><th>${esc(t('resource'))}</th><th>${esc(t('res_short'))}</th><th>${esc(t('res_type'))}</th><th>${esc(t('assignments'))}</th><th></th></tr></thead><tbody>${p.rsrc.map((r) => `<tr data-r="${r.id}"><td><input data-f="name" value="${esc(r.name)}" dir="auto"></td><td><input data-f="short" value="${esc(r.short || '')}"></td><td><select data-f="type">${['RT_Labor', 'RT_Equip', 'RT_Mat'].map((x) => `<option value="${x}"${r.type === x ? ' selected' : ''}>${esc(t('rt_' + x))}</option>`).join('')}</select></td><td>${p.asg.filter((a) => a.rsrc === r.id).length}</td><td><button class="ib" data-del="${r.id}">×</button></td></tr>`).join('') || `<tr><td colspan="8" class="empty">${esc(t('no_resources'))}</td></tr>`}</tbody></table><div style="margin-top:10px"><button class="btn sm" id="r_add">${esc(t('new_resource'))}</button></div>`;
    };
    draw();
    modal({ title: t('resources'), cls: 'mid', body, buttons: [{ label: t('close'), cls: 'pri', fn: () => {} }], onClose: () => App.refresh({ details: true }) });
    body.addEventListener('change', (e) => { const tr = e.target.closest('tr'); const r = p.rsrc.find((q) => q.id === +tr.dataset.r); App.mutate(t('edit'), () => { const f = e.target.dataset.f; if (f === 'units' || f === 'price') r[f] = Math.max(0, parseFloat(String(e.target.value).replace(',', '.')) || 0) || (f === 'units' ? 8 : 0); else r[f] = e.target.value; }, { noSched: true }); });
    body.addEventListener('click', (e) => {
      if (e.target.id === 'r_add') { const n = prompt(t('resource_name')); if (n) { App.mutate(t('new_resource'), () => { p.rsrc.push({ id: P6.nextId(p), name: n, short: n.slice(0, 8), type: 'RT_Labor' }); }, { noSched: true }); draw(); } }
      const d = e.target.closest('[data-del]');
      if (d) { const id = +d.dataset.del; App.mutate(t('delete'), () => { p.rsrc = p.rsrc.filter((r) => r.id !== id); p.asg = p.asg.filter((a) => a.rsrc !== id); }, { noSched: true }); draw(); }
    });
  };

  // ---------- update progress ----------
  D.updateProgress = function () {
    const p = App.p;
    const edits = new Map(); // id -> {as, af, pct}
    const init = (tk) => ({ as: tk.as, af: tk.af, pct: tk.pct });
    p.tasks.forEach((tk) => edits.set(tk.id, init(tk)));
    let filter = 'due', dd = p.dataDate;
    const body = document.createElement('div');
    const cal = (tk) => App.calOf(tk);
    const autoOne = (tk) => {
      const e = edits.get(tk.id);
      const s = tk.es, f = tk.ef; if (s == null) return;
      if (f <= dd && tk.status !== 'C') { e.as = tk.as != null ? tk.as : s; e.af = tk.status === 'C' ? tk.af : f; e.pct = 100; }
      else if (s <= dd && !P6.isMile(tk) && tk.status !== 'C') {
        const tot = Math.max(1, P6.durBetween(cal(tk), s, f)), done = P6.durBetween(cal(tk), s, Math.min(dd, f));
        e.as = tk.as != null ? tk.as : s; e.af = null; e.pct = Math.min(99, Math.max(tk.pct, Math.round((100 * done) / tot)));
      }
    };
    const visible = () => p.tasks.filter((tk) => {
      if (P6.isHammock(tk)) return false;
      if (filter === 'all') return true;
      if (filter === 'open') return tk.status !== 'C';
      if (filter === 'ip') return tk.status === 'IP';
      return tk.status !== 'C' && tk.es != null && tk.es <= dd + 14; // due: starts by data date (+2 weeks look ahead)
    }).sort((a, b) => (a.es || 0) - (b.es || 0) || a.code.localeCompare(b.code, undefined, { numeric: true }));
    const draw = () => {
      const list = visible(), shown = list.slice(0, 600);
      body.innerHTML = `<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:10px">
        <div class="fld"><label>${esc(t('data_date'))}</label><input id="u_dd" class="inp" dir="ltr" value="${esc(fmtD(dd))}" style="width:130px"></div>
        <div class="fld"><label>${esc(t('show'))}</label><select id="u_f" class="inp"><option value="due"${filter === 'due' ? ' selected' : ''}>${esc(t('u_due'))}</option><option value="ip"${filter === 'ip' ? ' selected' : ''}>${esc(t('f_IP'))}</option><option value="open"${filter === 'open' ? ' selected' : ''}>${esc(t('u_open'))}</option><option value="all"${filter === 'all' ? ' selected' : ''}>${esc(t('f_all'))}</option></select></div>
        <button class="btn" id="u_auto">⚡ ${esc(t('u_auto'))}</button><button class="btn sm" id="u_reset">${esc(t('reset'))}</button></div>
        <div class="hint">${esc(t('u_hint'))}</div>
        <div class="tbl-scroll"><table class="mini"><thead><tr><th>${esc(t('col_code'))}</th><th style="min-width:200px">${esc(t('col_name'))}</th><th>${esc(t('col_es'))}</th><th>${esc(t('col_ef'))}</th><th>${esc(t('col_as'))}</th><th style="width:80px">${esc(t('col_pct'))}</th><th>${esc(t('col_af'))}</th></tr></thead><tbody>${shown.map((tk) => {
          const e = edits.get(tk.id), late = tk.status !== 'C' && tk.es != null && tk.es < dd && !e.as;
          return `<tr data-id="${tk.id}"><td>${esc(tk.code)}</td><td dir="auto"${late ? ' style="color:var(--danger)"' : ''}>${esc(tk.name)}</td><td>${bd(tk.es)}</td><td>${bd(tk.ef)}</td><td><input dir="ltr" data-f="as" value="${esc(fmtD(e.as))}"></td><td><input dir="ltr" data-f="pct" value="${e.pct}"></td><td><input dir="ltr" data-f="af" value="${esc(fmtD(e.af))}"></td></tr>`;
        }).join('')}</tbody></table></div>${list.length > shown.length ? `<div class="hint">${esc(t('u_more', list.length - shown.length))}</div>` : ''}`;
    };
    draw();
    modal({
      title: t('update_progress'), cls: 'wide', body, sticky: true, buttons: [{ label: t('cancel'), fn: () => {} }, {
        label: t('apply_schedule'), cls: 'pri', fn: () => {
          const ndd = dd;
          App.mutate(t('update_progress'), () => {
            p.dataDate = ndd;
            if (p.planStart > ndd) p.planStart = ndd;
            let n = 0;
            for (const tk of p.tasks) {
              const e = edits.get(tk.id), o = init(tk);
              if (e.as === o.as && e.af === o.af && e.pct === o.pct) continue;
              n++;
              const pct = Math.max(0, Math.min(100, +e.pct || 0));
              if (e.af != null || pct >= 100) { tk.as = e.as != null ? e.as : (tk.as != null ? tk.as : Math.min(ndd, tk.es)); tk.af = e.af != null ? e.af : ndd; if (tk.af < tk.as) tk.af = tk.as; tk.status = 'C'; tk.rem = 0; tk.pct = 100; }
              else if (e.as != null || pct > 0) {
                tk.status = 'IP'; tk.as = e.as != null ? e.as : Math.min(ndd, tk.es); tk.af = null; tk.pct = pct;
                if (tk.pctType === 'dur') tk.rem = Math.round(tk.dur * (1 - pct / 100) * 100) / 100;
              } else { tk.status = 'NS'; tk.as = null; tk.af = null; tk.rem = tk.dur; tk.pct = 0; }
            }
            toast(t('u_done', n));
          });
        }
      }]
    });
    body.addEventListener('change', (e) => {
      const x = e.target;
      if (x.id === 'u_dd') { const d = P6.parseDate(x.value); if (d == null) return toast(t('err_date'), true); dd = d; draw(); }
      else if (x.id === 'u_f') { filter = x.value; draw(); }
      else if (x.dataset.f) {
        const id = +x.closest('tr').dataset.id, ed = edits.get(id);
        if (x.dataset.f === 'pct') { ed.pct = Math.max(0, Math.min(100, parseFloat(x.value) || 0)); if (ed.pct > 0 && ed.as == null) { const tk = App.taskById(id); ed.as = Math.min(dd, tk.es); } if (ed.pct >= 100 && ed.af == null) ed.af = dd; if (ed.pct < 100) ed.af = null; }
        else { const d = P6.parseDate(x.value); ed[x.dataset.f] = x.value.trim() ? d : null; if (x.dataset.f === 'af' && d != null) ed.pct = 100; }
        draw();
      }
    });
    body.addEventListener('click', (e) => {
      if (e.target.id === 'u_auto') { p.tasks.forEach(autoOne); draw(); }
      else if (e.target.id === 'u_reset') { p.tasks.forEach((tk) => edits.set(tk.id, init(tk))); draw(); }
    });
  };

  // ---------- baselines ----------
  D.baselines = function () {
    const p = App.p;
    const n = p.tasks.filter((x) => x.bs != null).length;
    const body = `<p>${esc(t('bl_status', n, p.tasks.length))}</p><div class="plist">
      <div class="pitem" data-a="save"><div><div class="nm">📌 ${esc(t('bl_save'))}</div><div class="sub">${esc(t('bl_save_d'))}</div></div></div>
      <div class="pitem" data-a="import"><div><div class="nm">📥 ${esc(t('bl_import'))}</div><div class="sub">${esc(t('bl_import_d'))}</div></div></div>
      <div class="pitem" data-a="clear"><div><div class="nm">🗑 ${esc(t('bl_clear'))}</div><div class="sub">${esc(t('bl_clear_d'))}</div></div></div></div>`;
    const m = modal({ title: t('baselines'), cls: 'mid', body, buttons: [{ label: t('close'), fn: () => {} }] });
    m.el.addEventListener('click', (e) => {
      const it = e.target.closest('[data-a]'); if (!it) return;
      const a = it.dataset.a;
      if (a === 'save') {
        if (!confirm(t('bl_confirm'))) return;
        App.mutate(t('bl_save'), () => { const M = P6.metrics(p); p.blName = 'BL ' + P6.fmtDate(P6.todayDay()); p.asg.forEach((x) => { x.bq = x.qty; }); for (const tk of p.tasks) { const mm = M.T.get(tk.id); tk.bcost = mm.bc; tk.bunits = mm.bu_L; tk.bs = tk.status === 'C' && tk.as != null ? tk.as : tk.es; tk.bf = tk.status === 'C' && tk.af != null ? tk.af : tk.ef; tk.bdur = tk.dur; } }, { noSched: true });
        App.cfg.show.base = true; toast(t('bl_saved'));
      } else if (a === 'import') App.openFile('baseline');
      else if (a === 'clear') { if (confirm(t('confirm_generic'))) App.mutate(t('bl_clear'), () => { for (const tk of p.tasks) { tk.bs = null; tk.bf = null; tk.bdur = null; tk.bcost = null; tk.bunits = null; } p.blName = ''; p.asg.forEach((x) => { delete x.bq; }); }, { noSched: true }); }
      m.close();
    });
  };

  // ---------- reports ----------
  D.reports = function () {
    const p = App.p;
    const tasks = p.tasks.filter((x) => !P6.isHammock(x));
    const ru = P6.rollup(p), root = ru.get((p.wbs.find((w) => w.parent == null) || {}).id) || {};
    const cnt = (s) => tasks.filter((x) => x.status === s).length;
    const crit = tasks.filter((x) => x.crit).length, neg = tasks.filter((x) => x.tf != null && x.tf < 0).length;
    const blF = root.bf, slip = blF != null && root.ef != null ? root.ef - blF : null;
    const frac = (s, e, d) => (s == null || e == null ? 0 : d < s ? 0 : d > e ? 1 : (d - s + 1) / (e - s + 1));
    const tot = tasks.reduce((a, x) => a + (x.dur || 0), 0) || 1;
    let a0 = Infinity, a1 = -Infinity;
    for (const x of tasks) for (const d of [x.bs, x.es, x.as]) if (d != null) a0 = Math.min(a0, d); for (const x of tasks) for (const d of [x.bf, x.ef, x.af]) if (d != null) a1 = Math.max(a1, d);
    const pts = [];
    if (isFinite(a0) && a1 > a0) {
      const step = Math.max(1, Math.ceil((a1 - a0) / 70));
      for (let d = a0; d <= a1 + step; d += step) {
        let b = 0, pl = 0, ac = 0;
        for (const x of tasks) {
          const w = x.dur || 0; if (!w) continue;
          if (x.bs != null) b += w * frac(x.bs, x.bf, d);
          pl += w * frac(x.as != null ? x.as : x.es, x.status === 'C' ? x.af : x.ef, d);
          if (d <= p.dataDate + 1) ac += w * (x.status === 'C' ? frac(x.as, x.af, d) : x.status === 'IP' ? (x.pct / 100) * frac(x.as, p.dataDate, d) : 0);
        }
        pts.push({ d, b: (100 * b) / tot, pl: (100 * pl) / tot, ac: d <= p.dataDate + step ? (100 * ac) / tot : null });
      }
    }
    const W = 760, H = 250, L = 38, B = 24, T = 10, R = 10;
    const xs = (d) => L + ((d - a0) / (a1 + 1 - a0)) * (W - L - R), ys = (v) => T + (1 - v / 100) * (H - T - B);
    const line = (k, col, dash) => { const q = pts.filter((x) => x[k] != null); return q.length ? `<polyline fill="none" stroke="${col}" stroke-width="2.2" ${dash ? 'stroke-dasharray="6 4"' : ''} points="${q.map((x) => xs(x.d).toFixed(1) + ',' + ys(x[k]).toFixed(1)).join(' ')}"/>` : ''; };
    const grid = [0, 25, 50, 75, 100].map((v) => `<line x1="${L}" x2="${W - R}" y1="${ys(v)}" y2="${ys(v)}" stroke="var(--grid)"/><text x="${L - 6}" y="${ys(v) + 4}" text-anchor="end" style="font-size:10px;fill:var(--muted)">${v}%</text>`).join('');
    const xl = []; if (pts.length) for (let i = 0; i < 7; i++) { const d = a0 + ((a1 - a0) * i) / 6; xl.push(`<text x="${xs(d)}" y="${H - 6}" text-anchor="middle" style="font-size:10px;fill:var(--muted)">${fmtD(Math.round(d))}</text>`); }
    const ddx = xs(p.dataDate + 1);
    const slips = tasks.filter((x) => x.status !== 'C' && x.bf != null && x.ef != null && x.ef > x.bf).sort((a, b) => (b.ef - b.bf) - (a.ef - a.bf)).slice(0, 10);
    const kpi = (v, l, c) => `<div class="kpi"><div class="v"${c ? ` style="color:${c}"` : ''}>${v}</div><div class="l">${esc(l)}</div></div>`;
    const body = `<div class="kpis">${kpi(tasks.length, t('activities'))}${kpi((root.pct || 0) + '%', t('progress'), 'var(--accent)')}${kpi(cnt('C'), t('st_C'), 'var(--ok)')}${kpi(cnt('IP'), t('st_IP'))}${kpi(cnt('NS'), t('st_NS'))}${kpi(crit, t('critical'), 'var(--danger)')}${kpi(neg, t('neg_float'), neg ? 'var(--danger)' : '')}${kpi(bd(p.finish), t('finish'))}${slip != null ? kpi((slip > 0 ? '+' : '') + slip + 'd', t('finish_var'), slip > 0 ? 'var(--danger)' : 'var(--ok)') : ''}</div>
      <b>${esc(t('scurve'))}</b>
      <svg viewBox="0 0 ${W} ${H}" direction="ltr" style="width:100%;height:auto;margin:6px 0 4px;direction:ltr">${grid}${xl.join('')}${pts.length ? `<line x1="${ddx}" x2="${ddx}" y1="${T}" y2="${H - B}" stroke="var(--accent)" stroke-dasharray="3 3"/>` : ''}${line('b', 'var(--bar-base)', 1)}${line('pl', 'var(--bar)')}${line('ac', 'var(--ok)')}</svg>
      <div style="display:flex;gap:16px;font-size:12px;color:var(--muted);margin-bottom:14px"><span><b style="color:var(--bar-base)">- - -</b> ${esc(t('baseline'))}</span><span><b style="color:var(--bar)">━━</b> ${esc(t('current_plan'))}</span><span><b style="color:var(--ok)">━━</b> ${esc(t('actual'))}</span></div>
      <b>${esc(t('top_slips'))}</b>
      ${slips.length ? `<table class="mini"><thead><tr><th>${esc(t('col_code'))}</th><th>${esc(t('col_name'))}</th><th>${esc(t('col_bf'))}</th><th>${esc(t('col_ef'))}</th><th>${esc(t('col_vf'))}</th></tr></thead><tbody>${slips.map((x) => `<tr><td>${esc(x.code)}</td><td dir="auto">${esc(x.name)}</td><td>${bd(x.bf)}</td><td>${bd(x.ef)}</td><td style="color:var(--danger);font-weight:600">+${x.ef - x.bf}d</td></tr>`).join('')}</tbody></table>` : `<div class="hint">${esc(t('no_slips'))}</div>`}`;
    modal({ title: t('reports'), cls: 'wide', body, buttons: [{ label: t('export_csv'), fn: () => { App.exportCSV(); return false; } }, { label: t('close'), cls: 'pri', fn: () => {} }] });
  };

  // ---------- CSV / paste ----------
  function csvDialog(title, text, hint) {
    const p = App.p;
    const body = document.createElement('div');
    body.innerHTML = `<div class="hint">${esc(hint || t('paste_hint'))}</div><textarea id="pt" class="inp" style="width:100%;height:180px;font-family:monospace;font-size:12px" dir="ltr" placeholder="Activity ID\tActivity Name\tDuration\tPredecessors\nA100\tExcavation\t10\t\nA110\tFoundation\t15\tA100">${esc(text || '')}</textarea>
      <div class="grid2" style="margin-top:10px">${row(t('target_wbs'), `<select id="pt_w">${p.wbs.map((w) => `<option value="${w.id}">${esc(w.code)} – ${esc(w.name)}</option>`).join('')}</select>`)}</div><div id="pt_prev" class="hint" style="margin-top:8px"></div>`;
    const sel = App.focusTask(); if (sel) $('#pt_w', body).value = sel.wbs;
    const prev = () => { const r = P6.parseDelimited($('#pt', body).value); $('#pt_prev', body).textContent = r.length > 1 ? t('rows_detected', r.length - 1, r[0].join(' | ').slice(0, 120)) : ''; };
    body.addEventListener('input', prev); setTimeout(prev, 0);
    modal({
      title, cls: 'mid', body, buttons: [{ label: t('cancel'), fn: () => {} }, {
        label: t('import'), cls: 'pri', fn: (c, el) => {
          const rows = P6.parseDelimited($('#pt', el).value);
          let res;
          const ok = App.mutate(t('import'), () => {
            res = P6.importRows(p, rows, +$('#pt_w', el).value);
            if (res.error) return t('err_csv_cols');
            if (!res.added && !res.updated) return t('err_csv_empty');
          });
          if (ok) toast(t('imported', res.added, res.updated, res.rels));
          return !!ok;
        }
      }]
    });
  }
  D.paste = () => csvDialog(t('paste_import'), '');
  D.importCsv = (text, name) => csvDialog(t('import_csv') + ' – ' + name, text);

  D.pickProject = (list, fname) => new Promise((resolve) => {
    const body = `<div class="hint">${esc(t('pick_project_hint', fname))}</div><div class="plist">${list.map((p) => `<div class="pitem" data-id="${esc(p.id)}"><div style="flex:1"><div class="nm" dir="auto">${esc(p.name)}</div><div class="sub">${esc(t('activities'))}: ${p.tasks}${p.base ? ' · ' + esc(t('baseline_copy')) : ''}</div></div></div>`).join('')}</div>`;
    let picked = null;
    const m = modal({ title: t('pick_project'), cls: 'mid', body, buttons: [{ label: t('cancel'), fn: () => {} }], onClose: () => resolve(picked) });
    m.el.addEventListener('click', (e) => { const it = e.target.closest('.pitem'); if (it) { picked = it.dataset.id; m.close(); } });
  });

  // ---------- help ----------
  D.help = function () {
    modal({ title: t('guide'), cls: 'mid', body: `<div style="line-height:1.8">${t('guide_html')}</div>`, buttons: [{ label: t('close'), cls: 'pri', fn: () => {} }] });
  };
  D.shortcuts = function () {
    const rows = [['F9', 'schedule'], ['Insert', 'add_activity'], ['Delete', 'delete'], ['F2 / Enter', 'sc_edit'], ['Tab / ← →', 'sc_nav'], ['Ctrl+Z / Ctrl+Y', 'undo'], ['Ctrl+D', 'duplicate'], ['Ctrl+F', 'search'], ['Ctrl+S', 'export_xer'], ['Ctrl + wheel', 'zoom_in'], ['Shift / Ctrl + click', 'sc_multi']];
    modal({ title: t('shortcuts'), body: `<table class="mini"><tbody>${rows.map((r) => `<tr><td><span class="tag">${esc(r[0])}</span></td><td>${esc(t(r[1]))}</td></tr>`).join('')}</tbody></table>`, buttons: [{ label: t('close'), cls: 'pri', fn: () => {} }] });
  };
  D.about = function () {
    modal({ title: t('about'), body: `<div style="line-height:1.8">${t('about_html')}<hr><b>${esc(P6.versionName())}</b><br><small>${esc(P6.BUILD_DATE)}</small></div>`, buttons: [{ label: t('close'), cls: 'pri', fn: () => {} }] });
  };
})(window);

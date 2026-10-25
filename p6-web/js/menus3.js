/* P6 Web – Tools / Enterprise / Admin menus as in P6, the Layout-bar menu and the Gantt chart context menu. */
(function (g) {
  'use strict';
  const P6 = g.P6, App = g.App, D = App.dialogs;
  const t = (k, ...a) => P6.t(k, ...a), esc = P6.esc;
  const F = () => App.cfg;
  const dt = (k) => { const s = t(k); return /…$|\.\.\.$/.test(s) ? s : s + '…'; };

  // Features that need the P6 server / multi-user database are listed (as in P6) but say so honestly.
  const na = (label) => () => D.modal({ title: label, cls: 'mid', body: `<p style="line-height:1.8">${esc(t('na_body'))}</p>`, buttons: [{ label: t('close'), cls: 'pri', fn: () => {} }] });

  App.applyActuals = function () {
    const p = App.p, dd = p.dataDate; let n = 0;
    App.mutate(t('mi_applyact'), () => {
      p.tasks.forEach((tk) => {
        if (tk.es == null || tk.status === 'C' || P6.isHammock && P6.isHammock(tk)) return;
        if (tk.ef <= dd) { tk.as = tk.as != null ? tk.as : tk.es; tk.af = tk.ef; tk.pct = 100; tk.status = 'C'; n++; }
        else if (tk.es <= dd && !P6.isMile(tk)) {
          const cal = App.calOf(tk), tot = Math.max(1, P6.durBetween(cal, tk.es, tk.ef)), done = P6.durBetween(cal, tk.es, Math.min(dd, tk.ef));
          tk.as = tk.as != null ? tk.as : tk.es; tk.pct = Math.min(99, Math.max(tk.pct || 0, Math.round(100 * done / tot))); tk.status = 'IP'; n++;
        }
      });
    });
    App.toast(t('applyact_done', n));
  };
  App.recalcCosts = function () { App.p.tasks.forEach((x) => x); App.refresh(); App.toast(t('recalc_done')); };

  D.globalChange = function () {
    const p = App.p;
    const body = document.createElement('div');
    body.innerHTML = `<div class="grid2"><div class="fld"><label>${esc(t('gc_field'))}</label><select id="gc_f"><option value="name">${esc(t('col_name'))}</option><option value="dur">${esc(t('col_dur'))}</option><option value="pct">${esc(t('col_pct'))}</option><option value="cal">${esc(t('col_cal'))}</option></select></div>
      <div class="fld"><label>${esc(t('gc_scope'))}</label><select id="gc_s"><option value="sel">${esc(t('gc_sel'))}</option><option value="all">${esc(t('gc_all'))}</option></select></div>
      <div class="fld"><label>${esc(t('gc_find'))}</label><input id="gc_a" placeholder="(name only)"></div><div class="fld"><label>${esc(t('gc_value'))}</label><input id="gc_v"></div></div><p class="hint">${esc(t('gc_hint'))}</p>`;
    D.modal({ title: t('mi_gchange'), cls: 'mid', body, buttons: [{ label: t('cancel'), fn: () => {} }, { label: t('apply'), cls: 'pri', fn: (c, el) => {
      const f = el.querySelector('#gc_f').value, a = el.querySelector('#gc_a').value, v = el.querySelector('#gc_v').value;
      const list = el.querySelector('#gc_s').value === 'sel' ? App.selTasks() : App.view ? p.tasks.filter((x) => App.rowIdx.has('t' + x.id)) : p.tasks;
      let n = 0;
      const r = App.mutate(t('mi_gchange'), () => list.forEach((tk) => {
        if (f === 'name') { const nn = a ? tk.name.split(a).join(v) : v + tk.name; if (nn !== tk.name) { tk.name = nn; n++; } }
        else if (f === 'dur' || f === 'pct') { const x = parseFloat(v); if (isNaN(x)) return; if (f === 'dur') { tk.dur = x; if (tk.status === 'NS') tk.rem = x; } else tk.pct = Math.max(0, Math.min(100, x)); n++; }
        else if (f === 'cal') { const c = p.cals.find((z) => z.name.toLowerCase() === v.toLowerCase()); if (c) { tk.cal = c.id; n++; } }
      }));
      if (r !== false) App.toast(t('gc_done', n));
    } }] });
  };

  const baseDefs = App.menuDefs;
  App.menuDefs = function () {
    const defs = baseDefs(), ready = !!App.p;
    const sel = ready ? App.selTasks() : [];
    const sub = (l, i, fn, o) => Object.assign({ l, i, fn }, o || {});
    const tools = [
      ['schedule', () => App.schedule(), 'F9'], ['mi_checksched', () => D.checkSchedule()], ['mi_levelres', na(t('mi_levelres')), 'Shift+F9'], ['mi_applyact', () => App.applyActuals()], ['update_progress', () => D.updateProgress()], ['mi_recalc', () => App.recalcCosts()],
      ['mi_summarize', null, '', false, [sub(t('mi_sum_proj'), 'summarize', na(t('mi_summarize'))), sub(t('mi_sum_wbs'), 'summarize', na(t('mi_summarize')))]], ['mi_storeperiod', na(t('mi_storeperiod'))], '-',
      ['mi_disreorg', na(t('mi_disreorg')), 'Shift+F12'], ['mi_gchange', () => D.globalChange()], '-',
      ['monitor_thresholds', () => App.monitorThresholds()], ['mi_issuenav', () => App.openWin('issues')], '-',
      ['mi_visualizer', na(t('mi_visualizer'))], ['reports', () => D.reports(), '', false, null], ['mi_reportwiz', na(t('mi_reportwiz'))], ['mi_checker', () => D.checkSchedule()], ['mi_publish', null, '', false, [sub(t('mi_pub_web'), 'publish', na(t('mi_publish')))]], '-',
      ['mi_topdown', na(t('mi_topdown'))], ['mi_schedcmp', na(t('mi_schedcmp'))], '-', ['auto_schedule', () => { F().auto = !F().auto; App.saveCfg(); App.buildMenus(); if (F().auto) App.runSchedule(); }, '', !!F().auto], ['mi_schedopts', () => D.schedOptions()]
    ];
    const enterprise = [
      ['win_projects', () => App.openWin('projects')], ['mi_eps', na(t('mi_eps'))], ['mi_tracking', na(t('mi_tracking'))], ['mi_portfolios', () => App.openWin('projects')], '-',
      ['win_resources', () => App.openWin('resources')], ['mi_roles', () => App.rolesDialog()], ['mi_obs', na(t('mi_obs'))], '-',
      ['mi_rescodes', na(t('mi_rescodes'))], ['act_pcodes', () => D.codes('pc')], ['act_codes_global', () => D.codes('acg')], ['mi_rolecodes', na(t('mi_rolecodes'))], ['mi_asgcodes', na(t('mi_asgcodes'))], ['udf_manage', () => D.udf()], ['mi_storedimg', na(t('mi_storedimg'))], '-',
      ['calendars', () => D.calendars()], ['mi_shifts', na(t('mi_shifts'))], '-',
      ['mi_steptpl', na(t('mi_steptpl'))], ['mi_accounts', () => App.accountsDialog()], ['mi_funding', na(t('mi_funding'))], ['mi_curves', na(t('mi_curves'))], ['mi_extapps', na(t('mi_extapps'))], '-', ['resource_usage', () => App.setDock('usage')], ['act_codes_project', () => D.codes('acp')]
    ];
    const admin = [
      ['mi_adminprefs', () => D.prefs()], ['mi_dbconfig', () => D.dbConfig()], ['mi_chgpw', () => App.changePassword()], ['mi_disconnect', () => App.disconnect()], ['mi_admincat', na(t('mi_admincat'))], ['mi_currency', na(t('mi_currency'))], '-', ['mi_finperiod', na(t('mi_finperiod'))], '-', ['reset_layout', () => App.applyLayout('classic')], ['wipe_data', () => D.prefs()]
    ];
    void sel;
    return defs.map((m) => (m[0] === 'tools' ? ['tools', tools] : m[0] === 'enterprise' ? ['enterprise', enterprise] : m[0] === 'admin' ? ['admin', admin] : m));
  };
  Object.assign(App.MENU_ICON || (App.MENU_ICON = {}), {
    mi_levelres: 'mi_levelres', mi_applyact: 'applyact', update_progress: 'update', mi_recalc: 'recalc', mi_summarize: 'summarize', mi_storeperiod: 'storeperiod', mi_disreorg: 'disreorg', mi_gchange: 'gchange', monitor_thresholds: 'thresholds', mi_issuenav: 'issue',
    mi_visualizer: 'visualizer', reports: 'report', mi_reportwiz: 'reportwiz', mi_checker: 'checker', mi_publish: 'publish', mi_topdown: 'topdown', mi_schedcmp: 'check', mi_schedopts: 'gear', mi_checksched: 'check',
    win_projects: 'projects', mi_eps: 'eps', mi_tracking: 'tracking', mi_portfolios: 'portfolios', win_resources: 'people', mi_roles: 'roleico', mi_obs: 'obs', mi_rescodes: 'rescodes', act_pcodes: 'projcodes', act_codes_global: 'actcodes', mi_rolecodes: 'rolecodes', mi_asgcodes: 'asgcodes', udf_manage: 'udfico', mi_storedimg: 'storedimg',
    calendars: 'calendars2', mi_shifts: 'shifts', mi_steptpl: 'steptpl', mi_accounts: 'acctico', mi_funding: 'funding', mi_curves: 'curves', mi_extapps: 'extapps', resource_usage: 'people', act_codes_project: 'actcodes',
    mi_adminprefs: 'adminprefs', mi_dbconfig: 'gchange', mi_chgpw: 'lock', mi_disconnect: 'exit', mi_admincat: 'admincat', mi_currency: 'currency', mi_finperiod: 'finperiod', reset_layout: 'resetbars', wipe_data: 'del'
  });

  // ---- Layout bar menu (the "▽ Layout: …" button) ----
  App.layoutMenuItems = function (viewSubs) {
    const sub = (l, i, fn, o) => Object.assign({ l, i, fn }, o || {});
    const sh = F().show, act = App.win === 'activities';
    return [
      sub(t('layout'), '', null, { sub: viewSubs }), '-',
      sub(dt('mi_bars'), 'bars', () => D.barsDialog()), sub(dt('mi_barsopts'), 'bars', () => D.barsDialog()), sub(t('show_rels'), 'rel', () => App.toggleShow('rels'), { ck: sh.rels !== false }), sub(dt('columns'), 'columns', () => D.columns()), sub(dt('mi_timescale'), 'timescale', () => D.timescaleDialog()),
      sub(t('spotlight'), '', () => App.toggleShow('spot'), { ck: !!sh.spot }), sub(t('mi_progressline'), '', () => { F().pline = !F().pline; App.saveCfg(); App.refresh(); }, { ck: !!F().pline }),
      sub(t('mi_attach'), '', null, { sub: [sub(t('mi_attach_show'), 'attach', () => { F().attach = !F().attach; App.saveCfg(); App.refresh(); }, { ck: !!F().attach })] }),
      sub(dt('mi_tablefont'), 'font', () => D.tableFont()), sub(t('mi_network'), '', null, { dis: !act, sub: [sub(t('mi_trace'), 'network', () => App.setDock('network'))] }), sub(dt('mi_bottomopts'), '', () => D.bottomOptions()), '-',
      sub(dt('mi_filters'), 'filter', () => D.filter()), sub(t('group_sort') , 'sort', () => D.groupSort()), '-',
      sub(t('mi_showtop'), '', null, { sub: [sub(t('mi_hide'), '', () => {}, { dis: true })] }),
      sub(t('mi_showbottom'), '', null, { sub: [['details', 'bottom_details'], ['usage', 'bottom_usage'], ['usagesheet', 'mi_usagesheet'], ['network', 'mi_trace'], ['acts2', 'mi_addactview']].map(([k, l]) => sub(t(l), '', () => App.setDock(k), { ck: F().dock === k && F().detOpen })).concat(['-', sub(t('bottom_none'), '', () => App.setDock('none'), { ck: !F().detOpen })]) }), '-',
      sub(t('mi_hint'), '', () => { F().hint = F().hint === false; App.saveCfg(); App.applyHint(); }, { ck: F().hint !== false }), '-',
      sub(t('expand_all'), 'expandall', () => App.expandAll(), { k: 'Ctrl+Num +' }), sub(t('collapse_all'), 'collapseall', () => App.collapseAll(), { k: 'Ctrl+Num -' }), sub(dt('mi_collapseto'), 'collapseto', () => App.collapseTo())
    ];
  };


  // ---- toolbar split buttons (click = dialog, arrow = menu) like P6's layout toolbar ----
  App.addSplitTools = function (tb) {
    const sep = document.createElement('i'); sep.className = 'sep'; tb.appendChild(sep);
    const sub = (l, i, fn, o) => Object.assign({ l, i, fn }, o || {});
    const quick = [['code', 'col_code'], ['name', 'col_name'], ['dur', 'col_dur'], ['es', 'col_es'], ['ef', 'col_ef'], ['pct', 'col_pct'], ['tf', 'col_tf']];
    const defs = [
      ['bars', 'mi_bars', () => D.barsDialog(), null],
      ['columns', 'columns', () => D.columns(), () => [sub(t('mi_customize'), 'columns', () => D.columns()), sub(t('default'), 'columns', () => { F().cols = App.DEF_COLS.map((k) => ({ k, w: App.ALL_COLS[k].w })); App.saveCfg(); App.refresh(); }), '-', ...quick.map(([k, l]) => sub(t(l), '', () => { const has = F().cols.some((c) => c.k === k); if (has && F().cols.length > 1) F().cols = F().cols.filter((c) => c.k !== k); else if (!has) F().cols.push({ k, w: App.ALL_COLS[k].w }); App.saveCfg(); App.refresh(); }, { ck: F().cols.some((c) => c.k === k) }))]],
      ['timescale', 'mi_timescale', () => D.timescaleDialog(), null],
      ['filter', 'mi_filterby', () => D.filter(), () => App.filterMenuItems()],
      ['sort', 'group_sort', () => D.groupSort(), () => [sub(t('group_sort'), 'sort', () => D.groupSort()), sub(t('sort_by') + '…', 'sort', () => D.sortDialog()), '-', sub(t('default'), '', () => { F().grp = null; F().sorts = null; F().sort = 'code'; F().sortDir = 1; App.saveCfg(); App.refresh(); })]],
      ['linenum', 'mi_linenum', () => { F().lineNo = !F().lineNo; App.saveCfg(); App.refresh(); }, () => [sub(t('mi_linenum'), 'linenum', () => { F().lineNo = !F().lineNo; App.saveCfg(); App.refresh(); }, { ck: !!F().lineNo })]]
    ];
    { const w = document.createElement('span'); w.className = 'split'; w.innerHTML = `<button class="ib rels-tg${F().show.rels !== false ? ' on' : ''}" title="${esc(t('show_rels'))}">${P6.icon('rel')}</button>`; w.firstChild.onclick = () => App.toggleShow('rels'); tb.appendChild(w); }
    defs.push(['xlsx', 'mi_xlsx', () => App.exportXlsx(), () => [sub(t('mi_xlsx_sel'), 'xlsx', () => App.exportXlsx('sel'), { dis: !App.sel.size }), sub(t('mi_xlsx_all'), 'xlsx', () => App.exportXlsx('all'))]]);
    defs.forEach(([icon, label, click, menu]) => {
      const w = document.createElement('span'); w.className = 'split';
      w.innerHTML = `<button class="ib" title="${esc(t(label))}">${P6.icon(icon)}</button>${menu ? '<button class="ib arr" title="▾">▾</button>' : ''}`;
      w.firstChild.onclick = click;
      if (menu) w.lastChild.onclick = (e) => { const r = w.getBoundingClientRect(); App.popMenu(menu(), r.left, r.bottom); e.stopPropagation(); };
      tb.appendChild(w);
    });
  };


  // ---- UI size / resolution: Auto fits narrow screens, or pick a fixed size (stored in cfg.uiScale) ----
  P6.uiZoom = () => { const z = parseFloat(document.documentElement.style.zoom); return z > 0 ? z : 1; };
  App.applyScale = function () {
    const v = F().uiScale == null ? 'auto' : F().uiScale; let z = 1;
    if (v === 'auto') z = innerWidth < 1400 ? Math.max(0.7, Math.round((innerWidth / 1400) * 20) / 20) : 1; else z = Math.max(0.6, Math.min(1.6, parseFloat(v) / 100 || 1));
    document.documentElement.style.zoom = z === 1 ? '' : String(z); document.documentElement.style.setProperty('--uz', String(z));
    if (App.p && App.refresh) { App.refresh(); App.drawLayoutBar && App.drawLayoutBar(); }
  };
  addEventListener('resize', () => { if ((F().uiScale == null || F().uiScale === 'auto') && !App._rz) { App._rz = setTimeout(() => { App._rz = 0; App.applyScale(); }, 250); } });

  document.addEventListener('wheel', (e) => { const d = e.target.closest && e.target.closest('.dtabs'); if (d && d.scrollWidth > d.clientWidth) { d.scrollLeft += e.deltaY || e.deltaX; e.preventDefault(); } }, { passive: false });


  // ---- right-click in every window (Projects, Resources, Assignments, WBS, …): selects the row and offers the window's own buttons ----
  document.addEventListener('contextmenu', (e) => {
    const pane = e.target.closest && e.target.closest('#winpane');
    if (!pane || App.win === 'activities') return;
    const field = e.target.closest('input,textarea');
    if (e.target.closest('[contenteditable=true]') || (field && !field.closest('table'))) return;
    e.preventDefault();
    const tr = e.target.closest('tr[data-rid], tr[data-k]');
    if (tr) { tr.click(); }
    const x = e.clientX, y = e.clientY;
    setTimeout(() => {
      const seen = new Set(), items = [];
      pane.querySelectorAll('button[data-a]').forEach((b) => {
        if (b.closest('table') || seen.has(b.dataset.a)) return; seen.add(b.dataset.a);
        const a = b.dataset.a;
        items.push({ l: b.textContent.trim() || a, i: /del|remove/i.test(a) ? 'del' : /new|add/i.test(a) ? 'add' : /open/i.test(a) ? 'open' : /copy|dup/i.test(a) ? 'copy' : /xer|export|backup/i.test(a) ? 'export' : '', dis: b.disabled, fn: () => { const nb = pane.querySelector(`button[data-a="${a}"]`); if (nb) nb.click(); } });
      });
      const rowText = tr ? [...tr.children].map((c) => c.innerText.replace(/\s+/g, ' ').trim()).join('\t') : '';
      const table = (tr && tr.closest('table')) || pane.querySelector('table');
      const tableText = table ? [...table.querySelectorAll('tr')].map((r) => [...r.children].map((c) => c.innerText.replace(/\s+/g, ' ').trim()).join('\t')).join('\r\n') : '';
      const copy = (s) => { try { navigator.clipboard.writeText(s).then(() => App.toast(t('copied_excel', s.split('\r\n').length))); } catch (er) { /* ignore */ } };
      if (field) {
        const has = field.selectionStart !== field.selectionEnd;
        items.unshift({ l: t('cut'), i: 'cut', dis: !has || field.readOnly, fn: () => { field.focus(); document.execCommand('cut'); } }, { l: t('copy'), i: 'copy', dis: !has, fn: () => { field.focus(); document.execCommand('copy'); } }, { l: t('paste'), i: 'paste', dis: field.readOnly, fn: async () => { try { const s = await navigator.clipboard.readText(); field.focus(); field.setRangeText(s, field.selectionStart, field.selectionEnd, 'end'); field.dispatchEvent(new Event('input', { bubbles: true })); field.dispatchEvent(new Event('change', { bubbles: true })); } catch (er) { /* ignore */ } } }, '-');
      }
      if (items.length) items.push('-');
      items.push({ l: t('copy'), i: 'copy', dis: !rowText, fn: () => copy(rowText) }, { l: t('mi_copytable'), i: 'copy', dis: !tableText, fn: () => copy(tableText) });
      App.popMenu(items, x, y);
    }, 40);
  });

  // ---- Gantt chart right-click menu ----
  App.chartMenu = function (x, y) {
    const sub = (l, i, fn, o) => Object.assign({ l, i, fn }, o || {});
    App.popMenu([
      sub(t('mi_actdetails'), 'actdetails', () => { F().dock = 'details'; App.showDetails && App.showDetails(); }), '-',
      sub(dt('mi_bars'), 'bars', () => D.barsDialog()), sub(dt('mi_barsopts'), 'bars', () => D.barsDialog()), sub(t('show_rels'), 'rel', () => App.toggleShow('rels'), { ck: F().show.rels !== false }), sub(dt('mi_timescale'), 'timescale', () => D.timescaleDialog()),
      sub(t('mi_attach'), '', null, { sub: [sub(t('mi_attach_show'), 'attach', () => { F().attach = !F().attach; App.saveCfg(); App.refresh(); }, { ck: !!F().attach })] })
    ], x, y);
  };
})(window);

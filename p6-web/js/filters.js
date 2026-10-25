/* P6 Web – filter library (Default / Global / User Defined), multi-select Filters dialog and filter editor. */
(function (g) {
  'use strict';
  const P6 = g.P6, App = g.App, D = App.dialogs;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = P6.esc, t = (k, ...a) => P6.t(k, ...a);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const wbsCode = (tk) => ((App.p.wbs.find((w) => w.id === tk.wbs) || {}).code || '');

  // ---------- built-in filters ----------
  const DEF = {
    completed: (tk) => tk.status === 'C', crit: (tk) => !!tk.crit && tk.status !== 'C', hasfin: (tk) => ['FNET', 'FNLT', 'MFO'].includes(tk.ct), hasstart: (tk) => ['SNET', 'SNLT', 'MSO'].includes(tk.ct),
    ip: (tk) => tk.status === 'IP', loe: (tk) => tk.type === 'TT_LOE', longest: (tk) => !!tk.crit && tk.status !== 'C', milestone: (tk) => P6.isMile(tk), negfloat: (tk) => tk.tf != null && tk.tf < 0,
    nonwhatif: () => true, noncrit: (tk) => !tk.crit, normal: (tk) => tk.type === 'TT_Task' || tk.type === 'TT_Rsrc', ns: (tk) => tk.status === 'NS'
  };
  const GLOBAL = {
    ahead2: (tk, p) => tk.status !== 'C' && tk.es != null && tk.es <= p.dataDate + 14 && tk.ef >= p.dataDate,
    msvar: (tk) => P6.isMile(tk) && tk.bf != null && tk.ef != null && tk.ef > tk.bf, bvar: (tk) => tk.status !== 'C' && tk.bf != null && tk.ef != null && tk.ef > tk.bf
  };
  P6.FILTER_DEFAULT = Object.keys(DEF); P6.FILTER_GLOBAL = Object.keys(GLOBAL);
  const NAMES = { completed: ['Completed', 'المكتملة'], crit: ['Critical', 'الحرجة'], hasfin: ['Has Finish Constraint', 'لها قيد نهاية'], hasstart: ['Has Start Constraint', 'لها قيد بداية'], ip: ['In Progress', 'قيد التنفيذ'], loe: ['Level of Effort', 'Level of Effort'], longest: ['Longest Path', 'أطول مسار'], milestone: ['Milestone', 'Milestone'], negfloat: ['Negative Float', 'فلوت سالب'], nonwhatif: ['Non What-If', 'غير What-If'], noncrit: ['Non-critical', 'غير حرجة'], normal: ['Normal', 'عادية'], ns: ['Not Started', 'لم تبدأ'], ahead2: ['2 Weeks Ahead', 'الأسبوعان القادمان'], msvar: ['Milestone Variance from Baseline', 'انحراف المعالم عن البيزلاين'], bvar: ['Variance from Baseline', 'انحراف عن البيزلاين'] };
  P6.filterName = (id) => { const n = NAMES[id]; if (n) return n[App.cfg.lang === 'en' ? 0 : 1]; const u = userList().find((x) => x.id === id); return u ? u.name : id; };
  const userList = () => [...(App.cfg.globalFilters || []).map((x) => Object.assign({}, x, { g: 'global' })), ...(App.cfg.userFilters || []).map((x) => Object.assign({}, x, { g: 'user' }))];

  function condTest(tk, c) {
    let v;
    switch (c.f) {
      case 'wbs': v = wbsCode(tk); break; case 'es': v = tk.es; break; case 'ef': v = tk.ef; break; case 'crit': v = tk.crit ? 'yes' : 'no'; break; case 'cal': v = (App.p.cals.find((x) => x.id === tk.cal) || {}).name; break; case 'type': v = tk.type; break;
      default: v = tk[c.f];
    }
    let w = c.v;
    if (c.f === 'es' || c.f === 'ef') w = P6.parseDate(c.v); else if (['dur', 'rem', 'pct', 'tf', 'ff'].includes(c.f)) w = parseFloat(c.v);
    if (typeof v === 'string' || typeof w === 'string') { v = String(v == null ? '' : v).toLowerCase(); w = String(w == null ? '' : w).toLowerCase(); }
    if (v == null || w == null || (typeof w === 'number' && isNaN(w))) return false;
    switch (c.op) { case 'has': return String(v).includes(String(w)); case 'eq': return v == w; case 'ne': return v != w; case 'gt': return v > w; case 'lt': return v < w; case 'ge': return v >= w; case 'le': return v <= w; default: return true; }
  }
  const userTest = (id, tk) => { const u = userList().find((x) => x.id === id); if (!u || !u.conds || !u.conds.length) return true; return u.join === 'or' ? u.conds.some((c) => condTest(tk, c)) : u.conds.every((c) => condTest(tk, c)); };
  P6.filterMatch = function (tk, cfg, p) {
    const sel = cfg.fsel; if (!sel || !sel.length) return true;
    const test = (id) => (DEF[id] ? DEF[id](tk, p) : GLOBAL[id] ? GLOBAL[id](tk, p) : userTest(id, tk));
    return cfg.fany ? sel.some(test) : sel.every(test);
  };
  P6.condTest = condTest;

  // ---------- helpers used by menus / layout bar ----------
  App.toggleFilter = function (id) { const c = App.cfg; c.fsel = c.fsel || []; c.fsel = c.fsel.includes(id) ? c.fsel.filter((x) => x !== id) : c.fsel.concat(id); c.filter.mode = 'all'; App.saveCfg(); App.refresh(); App.buildMenus(); };
  App.clearFilters = function () { App.cfg.fsel = []; App.cfg.filter.mode = 'all'; App.saveCfg(); App.refresh(); App.buildMenus(); };
  App.filterMenuItems = function () {
    const c = App.cfg, sel = c.fsel || [];
    const item = (id, i) => ({ l: P6.filterName(id), i: 'filter', ck: sel.includes(id), fn: () => App.toggleFilter(id) });
    return [{ l: t('f_all'), i: 'filter', ck: !sel.length && (!c.filter.mode || c.filter.mode === 'all'), fn: () => App.clearFilters() }, '-', ...P6.FILTER_DEFAULT.map(item), '-', ...P6.FILTER_GLOBAL.map(item), ...userList().map((u) => item(u.id)), '-', { l: t('flt_dialog'), i: 'filter', fn: () => D.filter() }];
  };
  App.filterLabel = () => { const sel = App.cfg.fsel || []; if (!sel.length) return App.cfg.filter.mode && App.cfg.filter.mode !== 'all' ? t('f_' + App.cfg.filter.mode) : t('f_all'); return sel.map(P6.filterName).join(App.cfg.fany ? ' | ' : ' + '); };

  // ---------- filter editor (New / Modify) ----------
  D.filterEditor = function (f, done) {
    const cur = f ? clone(f) : { id: 'u' + Date.now().toString(36), name: '', conds: [{ f: 'name', op: 'has', v: '' }], join: 'and' };
    const fields = ['code', 'name', 'status', 'type', 'crit', 'dur', 'rem', 'pct', 'es', 'ef', 'tf', 'ff', 'wbs', 'cal'], ops = ['has', 'eq', 'ne', 'gt', 'lt', 'ge', 'le'];
    const body = document.createElement('div');
    const draw = () => {
      body.innerHTML = `<div class="grid2"><div class="fld w2"><label>${esc(t('f_name'))}</label><input id="fe_n" dir="auto" value="${esc(cur.name)}"></div><div class="fld"><label>${esc(t('cf_match'))}</label><select id="fe_j"><option value="and"${cur.join === 'and' ? ' selected' : ''}>${esc(t('cf_all'))}</option><option value="or"${cur.join === 'or' ? ' selected' : ''}>${esc(t('cf_any'))}</option></select></div></div>
        <table class="mini" style="margin-top:10px"><tbody>${cur.conds.map((c, i) => `<tr data-i="${i}"><td><select data-k="f">${fields.map((x) => `<option value="${x}"${c.f === x ? ' selected' : ''}>${esc(t('col_' + x))}</option>`).join('')}</select></td><td><select data-k="op">${ops.map((o) => `<option value="${o}"${c.op === o ? ' selected' : ''}>${esc(t('op_' + o))}</option>`).join('')}</select></td><td><input data-k="v" dir="auto" value="${esc(c.v)}" placeholder="${c.f === 'status' ? 'NS / IP / C' : c.f === 'crit' ? 'yes / no' : ''}"></td><td><button class="ib" data-rm="${i}">×</button></td></tr>`).join('')}</tbody></table><div style="margin-top:8px"><button class="btn sm" id="fe_add">+ ${esc(t('add'))}</button></div>`;
    };
    draw();
    const m = D.modal({ title: t('flt_editor'), cls: 'mid', body, buttons: [{ label: t('cancel'), fn: () => {} }, { label: t('ok'), cls: 'pri', fn: () => { cur.name = $('#fe_n', body).value.trim(); if (!cur.name) { App.toast(t('err_name'), true); return false; } cur.conds = cur.conds.filter((c) => String(c.v).trim() !== ''); done(cur); } }] });
    body.addEventListener('change', (e) => { const x = e.target; if (x.id === 'fe_j') cur.join = x.value; else if (x.id === 'fe_n') cur.name = x.value; else if (x.dataset.k) cur.conds[+x.closest('tr').dataset.i][x.dataset.k] = x.value; });
    body.addEventListener('click', (e) => { if (e.target.id === 'fe_add') { cur.conds.push({ f: 'name', op: 'has', v: '' }); draw(); } const r = e.target.closest('[data-rm]'); if (r && cur.conds.length > 1) { cur.conds.splice(+r.dataset.rm, 1); draw(); } });
    void m;
  };

  // ---------- Filters dialog ----------
  let fclip = null;
  D.filter = D.filters = function () {
    const c = App.cfg; c.userFilters = c.userFilters || []; c.globalFilters = c.globalFilters || [];
    const st = { sel: new Set(c.fsel || []), any: !!c.fany, cur: null, open: { d: true, g: true, u: true } };
    const body = document.createElement('div'); body.className = 'fltdlg';
    const row = (id, name, kind) => `<tr class="fr${st.cur === id ? ' on' : ''}" data-id="${esc(id)}" data-kind="${kind}"><td><span class="fi">${P6.icon('filter')}</span> ${esc(name)}</td><td style="text-align:center;width:70px"><input type="checkbox" data-s="${esc(id)}"${st.sel.has(id) ? ' checked' : ''}${!st.sel.size && false ? '' : ''}></td></tr>`;
    const grp = (key, label, rows) => `<tr class="fg" data-g="${key}"><td colspan="2"><span class="pm">${st.open[key] ? '−' : '+'}</span> ${esc(label)}</td></tr>${st.open[key] ? rows : ''}`;
    const draw = () => {
      const kind = st.cur ? (c.userFilters.some((x) => x.id === st.cur) ? 'user' : c.globalFilters.some((x) => x.id === st.cur) ? 'global' : 'builtin') : '';
      body.innerHTML = `<div class="fl-left"><div class="fl-top"><label class="chk"><input type="checkbox" id="fl_all"${!st.sel.size ? ' checked' : ''}> ${esc(t('f_all'))}</label><div class="fl-match"><div>${esc(t('flt_match'))}</div><label class="chk"><input type="radio" name="fl_m" value="all"${!st.any ? ' checked' : ''}> ${esc(t('flt_allsel'))}</label><label class="chk"><input type="radio" name="fl_m" value="any"${st.any ? ' checked' : ''}> ${esc(t('flt_anysel'))}</label></div></div>
        <div class="fl-list"><table class="mini"><thead><tr><th>${esc(t('flt_filter'))}</th><th style="width:70px;text-align:center">${esc(t('select'))}</th></tr></thead><tbody>${grp('d', t('flt_default'), P6.FILTER_DEFAULT.map((id) => row(id, P6.filterName(id), 'builtin')).join(''))}${grp('g', t('flt_global'), P6.FILTER_GLOBAL.map((id) => row(id, P6.filterName(id), 'builtin')).join('') + c.globalFilters.map((u) => row(u.id, u.name, 'global')).join(''))}${grp('u', t('flt_user'), c.userFilters.map((u) => row(u.id, u.name, 'user')).join(''))}</tbody></table></div></div>
        <div class="cd-btns"><button class="btn pri" data-a="ok">✔ ${esc(t('ok'))}</button><button class="btn" data-a="cancel">⦸ ${esc(t('cancel'))}</button><button class="btn" data-a="apply">${esc(t('apply'))}</button><button class="btn" data-a="new">+ ${esc(t('flt_new'))}</button><button class="btn" data-a="del"${kind === 'user' || kind === 'global' ? '' : ' disabled'}>${esc(t('delete'))}</button><button class="btn" data-a="copy"${st.cur ? '' : ' disabled'}>${esc(t('copy'))}</button><button class="btn" data-a="paste"${fclip ? '' : ' disabled'}>${esc(t('paste'))}</button><button class="btn" data-a="mod"${kind === 'user' || kind === 'global' ? '' : ' disabled'}>${esc(t('flt_modify'))}</button><button class="btn" data-a="mkglobal"${kind === 'user' ? '' : ' disabled'}>${esc(t('flt_makeglobal'))}</button><button class="btn" data-a="aslayout">${esc(t('flt_aslayout'))}</button><button class="btn" data-a="help">? ${esc(t('help'))}</button></div>`;
    };
    draw();
    const m = D.modal({ title: t('flt_title'), cls: 'wide fltmodal', body, buttons: [], sticky: true });
    const apply = () => { c.fsel = [...st.sel]; c.fany = st.any; c.filter.mode = 'all'; App.saveCfg(); App.refresh(); App.buildMenus(); };
    const lookup = (id) => c.userFilters.find((x) => x.id === id) || c.globalFilters.find((x) => x.id === id);
    body.addEventListener('change', (e) => {
      const x = e.target;
      if (x.id === 'fl_all') { if (x.checked) st.sel.clear(); draw(); return; }
      if (x.name === 'fl_m') { st.any = x.value === 'any'; return; }
      if (x.dataset.s) { if (x.checked) st.sel.add(x.dataset.s); else st.sel.delete(x.dataset.s); draw(); }
    });
    body.addEventListener('click', (e) => {
      const g = e.target.closest('.fg'); if (g) { st.open[g.dataset.g] = !st.open[g.dataset.g]; return draw(); }
      const fr = e.target.closest('.fr'); if (fr && !e.target.closest('input')) { st.cur = fr.dataset.id; return draw(); }
      const b = e.target.closest('[data-a]'); if (!b || b.disabled) return; const a = b.dataset.a;
      if (a === 'ok') { apply(); m.close(); } else if (a === 'cancel') m.close(); else if (a === 'apply') apply();
      else if (a === 'new') D.filterEditor(null, (f) => { c.userFilters.push(f); st.cur = f.id; App.saveCfg(); draw(); });
      else if (a === 'mod') { const f = lookup(st.cur); if (f) D.filterEditor(f, (n) => { Object.assign(f, n); App.saveCfg(); draw(); }); }
      else if (a === 'del') { if (!confirm(t('confirm_generic'))) return; c.userFilters = c.userFilters.filter((x) => x.id !== st.cur); c.globalFilters = c.globalFilters.filter((x) => x.id !== st.cur); st.sel.delete(st.cur); st.cur = null; App.saveCfg(); draw(); }
      else if (a === 'copy') { const f = lookup(st.cur); fclip = f ? clone(f) : { name: P6.filterName(st.cur), builtin: st.cur }; draw(); }
      else if (a === 'paste') { if (fclip) { const f = fclip.builtin ? { conds: [], join: 'and', builtin: fclip.builtin } : clone(fclip); f.id = 'u' + Date.now().toString(36); f.name = fclip.name + ' (2)'; if (f.builtin) { f.conds = []; } c.userFilters.push(f); st.cur = f.id; App.saveCfg(); draw(); } }
      else if (a === 'mkglobal') { const f = lookup(st.cur); if (f) { c.userFilters = c.userFilters.filter((x) => x !== f); c.globalFilters.push(f); App.saveCfg(); draw(); } }
      else if (a === 'aslayout') { apply(); App.saveLayoutAs(); }
      else if (a === 'help') D.modal({ title: t('help'), cls: 'mid', body: `<div style="line-height:1.8">${t('flt_help_html')}</div>`, buttons: [{ label: t('close'), cls: 'pri', fn: () => {} }] });
    });
  };
})(window);

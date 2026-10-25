/* P6 Web – extra Activity Details tabs: Predecessors, Successors, Notebook, WPs & Docs, Expenses, Summary, Risks, Discussion + tab customiser. */
(function (g) {
  'use strict';
  const P6 = g.P6, App = g.App;
  const esc = P6.esc, t = (k, ...a) => P6.t(k, ...a);
  const $ = (s, r) => (r || document).querySelector(s);
  const fmtD = P6.fmtDate;
  const X = (P6.detExtra = {});
  const TOPICS = ['Notes', 'Scope', 'Constraints', 'Remarks', 'Safety'];
  const arr = (tk, k) => (tk[k] = tk[k] || []);
  const del = `<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>`;

  // ---------- generic list editor ----------
  const LISTS = {
    topics: { cols: [{ f: 'topic', w: 150, sel: () => App.p.memoTypes && App.p.memoTypes.length ? [...new Set([...TOPICS, ...App.p.memoTypes.map((m) => m.name)])] : TOPICS }, { f: 'text', area: 1 }], fresh: () => ({ topic: 'Notes', text: '' }) },
    docs: { cols: [{ f: 'title', w: 200 }, { f: 'url', w: 300 }, { f: 'notes' }], fresh: () => ({ title: t('new_doc'), url: '', notes: '' }), extra: (it) => (/^(https?:\/\/|www\.)/i.test(it.url || '') ? `<a class="btn sm" target="_blank" rel="noopener" href="${esc(/^www\./i.test(it.url) ? 'https://' + it.url : it.url)}">↗</a>` : '') },
    expenses: { cols: [{ f: 'name', w: 200 }, { f: 'vendor', w: 160 }, { f: 'budget', num: 1, w: 120 }, { ro: (it, tk) => P6.fmtKind('money', (+it.budget || 0) * (tk.status === 'C' ? 1 : (tk.pct || 0) / 100)), l: 'actual_cost', w: 120 }], fresh: () => ({ name: t('new_expense'), vendor: '', budget: 0 }) },
    risks: { cols: [{ f: 'name', w: 240 }, { f: 'prob', n15: 1, w: 90 }, { f: 'impact', n15: 1, w: 90 }, { ro: (it) => (+it.prob || 1) * (+it.impact || 1), l: 'risk_score', w: 80 }, { f: 'status', w: 120, sel: () => ['Open', 'Mitigated', 'Closed'] }, { f: 'notes' }], fresh: () => ({ name: t('new_risk'), prob: 3, impact: 3, status: 'Open', notes: '' }) },
    discuss: { cols: [{ ro: (it) => it.author, l: 'author', w: 120 }, { ro: (it) => it.date, l: 'date', w: 130 }, { f: 'text', area: 1 }], fresh: () => ({ author: App.cfg.user || 'USER', date: new Date().toLocaleString(), text: '' }) }
  };
  function listTab(tk, key) {
    const L = LISTS[key], items = arr(tk, key);
    const head = L.cols.map((c) => `<th${c.w ? ` style="min-width:${c.w}px"` : ''}>${esc(t('f_' + (c.f || c.l)))}</th>`).join('') + '<th style="width:60px"></th>';
    const rows = items.map((it) => `<tr data-lid="${it.id}">` + L.cols.map((c) => {
      if (c.ro) return `<td style="color:var(--muted)">${esc(c.ro(it, tk))}</td>`;
      const v = it[c.f] == null ? '' : it[c.f];
      if (c.sel) return `<td><select data-lst="${key}" data-lf="${c.f}">${c.sel().map((o) => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></td>`;
      if (c.n15) return `<td><select data-lst="${key}" data-lf="${c.f}">${[1, 2, 3, 4, 5].map((n) => `<option${+v === n ? ' selected' : ''}>${n}</option>`).join('')}</select></td>`;
      if (c.area) return `<td><textarea data-lst="${key}" data-lf="${c.f}" rows="2" dir="auto" style="width:100%;min-width:260px">${esc(v)}</textarea></td>`;
      return `<td><input data-lst="${key}" data-lf="${c.f}" dir="auto"${c.num ? ' inputmode="decimal"' : ''} value="${esc(v)}"></td>`;
    }).join('') + `<td style="white-space:nowrap">${L.extra ? L.extra(it) : ''}<button class="ib" data-lstdel="${key}:${it.id}">${del}</button></td></tr>`).join('');
    const total = key === 'expenses' ? `<span class="hint" style="margin:0">${esc(t('col_bc_E'))}: <b>${P6.fmtKind('money', items.reduce((a, x) => a + (+x.budget || 0), 0))}</b></span>` : '';
    return `<div style="overflow:auto"><table class="mini wide"><thead><tr>${head}</tr></thead><tbody>${rows || `<tr><td colspan="${L.cols.length + 1}" class="empty">${esc(t('empty_list'))}</td></tr>`}</tbody></table></div><div style="margin-top:8px;display:flex;gap:12px;align-items:center"><button class="btn sm" data-lstadd="${key}">+ ${esc(t('add'))}</button>${total}</div>`;
  }
  X.notes = (tk) => { if (tk.notes && !arr(tk, 'topics').length) { tk.topics.push({ id: P6.nextId(App.p), topic: 'Notes', text: tk.notes }); tk.notes = ''; } return listTab(tk, 'topics'); };
  X.docs = (tk) => listTab(tk, 'docs');
  X.expenses = (tk) => listTab(tk, 'expenses');
  X.risks = (tk) => listTab(tk, 'risks');
  X.discuss = (tk) => listTab(tk, 'discuss');

  // ---------- predecessors / successors (one side each) ----------
  function relSide(tk, isPred) {
    const p = App.p, list = p.rels.filter((r) => (isPred ? r.s : r.p) === tk.id);
    const rows = list.map((r) => {
      const o = App.taskById(isPred ? r.p : r.s); if (!o) return '';
      return `<tr data-rel="${r.id}"><td><input data-rf="code" value="${esc(o.code)}" list="codes"></td><td dir="auto" style="color:var(--muted)">${esc(o.name)}</td><td style="color:var(--muted)">${esc(App.p.wbs.find((w) => w.id === o.wbs).code)}</td><td><select data-rf="type">${['FS', 'SS', 'FF', 'SF'].map((x) => `<option${x === r.type ? ' selected' : ''}>${x}</option>`).join('')}</select></td><td><input data-rf="lag" value="${App.fmtN(r.lag)}"></td><td style="color:var(--muted)">${fmtD(o.es)}</td><td style="color:var(--muted)">${fmtD(o.ef)}</td><td style="color:var(--muted)">${o.tf == null ? '' : App.fmtN(o.tf)}</td><td><button class="ib" data-rdel="${r.id}">${del}</button></td></tr>`;
    }).join('');
    return `<datalist id="codes">${p.tasks.map((x) => `<option value="${esc(x.code)}">${esc(x.name)}</option>`).join('')}</datalist><div style="overflow:auto"><table class="mini wide"><thead><tr><th style="min-width:110px">${esc(t('col_code'))}</th><th style="min-width:240px">${esc(t('col_name'))}</th><th>${esc(t('col_wbs'))}</th><th style="width:90px">${esc(t('rel_type'))}</th><th style="width:70px">${esc(t('lag'))}</th><th>${esc(t('col_es'))}</th><th>${esc(t('col_ef'))}</th><th>${esc(t('col_tf'))}</th><th style="width:28px"></th></tr></thead><tbody>${rows}<tr><td colspan="9"><input data-radd="${isPred ? 'p' : 's'}" list="codes" placeholder="+ ${esc(t('add_rel_ph'))}" style="border-color:var(--line)"></td></tr></tbody></table></div>`;
  }
  X.pred = (tk) => relSide(tk, true);
  X.succ = (tk) => relSide(tk, false);

  // ---------- summary ----------
  X.summary = (tk) => {
    const c = App.getCtx(), row = { kind: 't', t: tk };
    const keys = [['Dates', ['es', 'ef', 'as', 'af', 'ls', 'lf', 'bs', 'bf', 'vs', 'vf']], ['Durations', ['dur', 'rem', 'actd', 'atcd', 'tf', 'ff']], ['Percent Completes', ['pct', 'durPct', 'phys', 'unitsPct', 'costPct', 'schedPct', 'perfPct']], ['Costs', ['bc', 'ac', 'rc', 'atc', 'blc', 'cvar']], ['Earned Value', ['pv', 'ev', 'sv', 'cv', 'spi', 'cpi', 'eac', 'etc', 'vac']], ['Units', ['bu', 'au', 'ru', 'atu']]];
    return `<div class="sumgrid">${keys.map(([g, ks]) => `<fieldset><legend>${esc(g)}</legend>${ks.map((k) => { const r = P6.regCell(k, row, c) || { text: '', cls: '' }; return `<div class="srow"><span>${esc(t('col_' + k))}</span><b class="${r.cls.includes('neg') ? 'neg' : ''}">${esc(r.text)}</b></div>`; }).join('')}</fieldset>`).join('')}</div>`;
  };

  // ---------- event handlers ----------
  P6.bindDetExtra = function () {
    const el = $('#details');
    el.addEventListener('change', (e) => {
      const x = e.target; if (!x.dataset.lst) return;
      const tk = App.focusTask(); if (!tk) return;
      const key = x.dataset.lst, it = arr(tk, key).find((q) => q.id === +x.closest('tr').dataset.lid); if (!it) return;
      const f = x.dataset.lf, L = LISTS[key], col = L.cols.find((c) => c.f === f);
      App.mutate(t('edit'), () => {
        if (col && col.num) { const v = parseFloat(String(x.value).replace(',', '.')); if (isNaN(v) || v < 0) return t('err_num'); it[f] = v; } else if (col && col.n15) it[f] = +x.value; else it[f] = x.value;
        if (key === 'expenses') tk.exp = tk.expenses.reduce((a, q) => a + (+q.budget || 0), 0);
      }, { noSched: true });
    });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const tk = App.focusTask(); if (!tk) return;
      if (b.dataset.lstadd) { const key = b.dataset.lstadd; App.mutate(t('add'), () => { const o = LISTS[key].fresh(); o.id = P6.nextId(App.p); arr(tk, key).push(o); if (key === 'expenses') tk.exp = tk.expenses.reduce((a, q) => a + (+q.budget || 0), 0); }, { noSched: true }); }
      else if (b.dataset.lstdel) { const [key, id] = b.dataset.lstdel.split(':'); App.mutate(t('delete'), () => { tk[key] = arr(tk, key).filter((q) => q.id !== +id); if (key === 'expenses') tk.exp = tk.expenses.reduce((a, q) => a + (+q.budget || 0), 0); }, { noSched: true }); }
    });
  };

  // ---------- Activity Details tab customiser (Available Tabs / Display Tabs) ----------
  App.dialogs.detTabs = function () {
    let disp = (App.cfg.detTabs && App.cfg.detTabs.length ? App.cfg.detTabs : App.DEF_TABS).slice();
    let sa = null, sb = null;
    const body = document.createElement('div'); body.className = 'colsdlg dtd';
    const draw = () => {
      const avail = App.DEF_TABS.filter((k) => !disp.includes(k));
      body.innerHTML = `<div class="cd-left"><div class="cd-h">${esc(t('available_tabs'))}</div><div class="cd-list">${avail.map((k) => `<div class="ck2${sa === k ? ' on' : ''}" data-a="${k}">${esc(t('tab_' + k))}</div>`).join('')}</div></div>
        <div class="cd-mid"><button class="cdb" data-x="add"${avail.length ? '' : ' disabled'}>▶</button><button class="cdb" data-x="addall"${avail.length ? '' : ' disabled'}>⏩</button><button class="cdb" data-x="rem">◀</button><button class="cdb" data-x="remall">⏪</button></div>
        <div class="cd-right"><div class="cd-h">${esc(t('display_tabs'))}</div><div class="cd-list">${disp.map((k) => `<div class="ck2${sb === k ? ' on' : ''}" data-b="${k}">${esc(t('tab_' + k))}</div>`).join('')}</div></div>
        <div class="cd-ud"><button class="cdb" data-x="up">▲</button><button class="cdb" data-x="down">▼</button></div>
        <div class="cd-btns"><button class="btn pri" data-x="ok">✔ ${esc(t('ok'))}</button><button class="btn" data-x="cancel">⦸ ${esc(t('cancel'))}</button><button class="btn" data-x="apply">${esc(t('apply'))}</button><button class="btn" data-x="default">▶ ${esc(t('default'))}</button></div>`;
    };
    draw();
    const m = App.dialogs.modal({ title: t('activity_details'), cls: 'mid colsmodal', body, buttons: [], sticky: true });
    const apply = () => { if (!disp.length) return App.toast(t('err_no_cols'), true); App.cfg.detTabs = disp.slice(); App.saveCfg(); App.renderDetails(); };
    body.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]'), b = e.target.closest('[data-b]'), x = e.target.closest('[data-x]');
      if (a) { sa = a.dataset.a; return draw(); } if (b) { sb = b.dataset.b; return draw(); }
      if (!x || x.disabled) return;
      const k = x.dataset.x;
      if (k === 'add' && sa) { disp.push(sa); sa = null; } else if (k === 'addall') App.DEF_TABS.forEach((q) => { if (!disp.includes(q)) disp.push(q); });
      else if (k === 'rem' && sb && disp.length > 1) { disp = disp.filter((q) => q !== sb); sb = null; } else if (k === 'remall') { disp = disp.slice(0, 1); sb = null; }
      else if (k === 'up' && sb) { const i = disp.indexOf(sb); if (i > 0) [disp[i - 1], disp[i]] = [disp[i], disp[i - 1]]; }
      else if (k === 'down' && sb) { const i = disp.indexOf(sb); if (i < disp.length - 1) [disp[i + 1], disp[i]] = [disp[i], disp[i + 1]]; }
      else if (k === 'default') disp = App.DEF_TABS.slice();
      else if (k === 'apply') apply(); else if (k === 'ok') { apply(); return m.close(); } else if (k === 'cancel') return m.close();
      draw();
    });
    body.addEventListener('dblclick', (e) => { const a = e.target.closest('[data-a]'), b = e.target.closest('[data-b]'); if (a) { disp.push(a.dataset.a); sa = null; draw(); } else if (b && disp.length > 1) { disp = disp.filter((q) => q !== b.dataset.b); sb = null; draw(); } });
  };
})(window);

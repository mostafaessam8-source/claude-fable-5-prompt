/* P6 Web – P6-style Columns dialog, code managers, user-defined fields, float-path analysis. */
(function (g) {
  'use strict';
  const P6 = g.P6, App = g.App, D = App.dialogs;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = P6.esc, t = (k, ...a) => P6.t(k, ...a);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const modal = (o) => D.modal(o);
  const label = (k) => t('col_' + k);

  // =============== Columns (Available Options tree / Selected Options list) ===============
  D.columns = function () {
    let cols = clone(App.cfg.cols);
    const open = new Set(['gen']);
    let selA = null;           // {type:'g'|'k', id}
    let selB = new Set();      // keys selected on the right
    let q = '';
    const body = document.createElement('div');
    body.className = 'colsdlg';
    const draw = () => {
      P6.rebuildDynCols(App.p);
      const chosen = new Set(cols.map((c) => c.k));
      const groups = P6.colGroups(App.p).filter((gr) => gr.keys.length || ['acg', 'acp', 'pcode', 'udf'].includes(gr.id));
      const left = groups.map((gr) => {
        const keys = gr.keys.filter((k) => !chosen.has(k) && (!q || label(k).toLowerCase().includes(q.toLowerCase())));
        if (q && !keys.length) return '';
        const isOpen = open.has(gr.id) || !!q;
        return `<div class="cg${selA && selA.type === 'g' && selA.id === gr.id ? ' on' : ''}" data-g="${gr.id}"><span class="pm" data-tog="${gr.id}">${isOpen ? '−' : '+'}</span>${esc(gr.label[App.cfg.lang === 'en' ? 0 : 1])}</div>` +
          (isOpen ? keys.map((k) => `<div class="ck2${selA && selA.type === 'k' && selA.id === k ? ' on' : ''}" data-k="${esc(k)}" dir="auto">${esc(label(k))}</div>`).join('') : '');
      }).join('');
      body.innerHTML = `<div class="cd-left"><div class="cd-h">${esc(t('available_opts'))}<input id="cd_q" placeholder="${esc(t('search'))}" value="${esc(q)}" dir="auto"></div><div class="cd-list" id="cd_a">${left}</div></div>
        <div class="cd-mid"><button class="cdb" data-a="add" title="${esc(t('add'))}">▶</button><button class="cdb" data-a="addall">⏩</button><button class="cdb" data-a="rem">◀</button><button class="cdb" data-a="remall">⏪</button></div>
        <div class="cd-right"><div class="cd-h">${esc(t('selected_opts'))}</div><div class="cd-list" id="cd_b">${cols.map((c, i) => `<div class="ck2${selB.has(c.k) ? ' on' : ''}" data-b="${i}" dir="auto">${esc(c.title || label(c.k))}</div>`).join('')}</div></div>
        <div class="cd-ud"><button class="cdb" data-a="up">▲</button><button class="cdb" data-a="down">▼</button></div>
        <div class="cd-btns"><button class="btn pri" data-a="ok">✔ ${esc(t('ok'))}</button><button class="btn" data-a="cancel">⦸ ${esc(t('cancel'))}</button><button class="btn" data-a="apply">${esc(t('apply'))}</button><button class="btn" data-a="copy">${esc(t('copy_from'))}</button><button class="btn" data-a="default">▶ ${esc(t('default'))}</button><button class="btn" data-a="edit"${selB.size === 1 ? '' : ' disabled'}>${esc(t('edit_column'))}</button><button class="btn" data-a="help">? ${esc(t('help'))}</button></div>`;
      const sc = $('#cd_a', body); if (sc && draw.sa != null) sc.scrollTop = draw.sa;
      const sb = $('#cd_b', body); if (sb && draw.sb != null) sb.scrollTop = draw.sb;
    };
    draw();
    const m = modal({ title: t('columns'), cls: 'wide colsmodal', body, buttons: [], sticky: true });
    const apply = () => { if (!cols.length) return App.toast(t('err_no_cols'), true); App.cfg.cols = clone(cols); App.cfg.layoutName = ''; App.saveCfg(); App.refresh(); };
    const addKeys = (keys) => { keys.forEach((k) => { if (!cols.some((c) => c.k === k)) cols.push({ k, w: App.ALL_COLS[k].w }); }); };
    const visibleLeaf = () => { const chosen = new Set(cols.map((c) => c.k)); return P6.colGroups(App.p).flatMap((gr) => gr.keys).filter((k) => !chosen.has(k)); };
    body.addEventListener('input', (e) => { if (e.target.id === 'cd_q') { q = e.target.value; draw.sa = null; draw(); const i = $('#cd_q', body); i.focus(); i.setSelectionRange(q.length, q.length); } });
    body.addEventListener('click', (e) => {
      draw.sa = ($('#cd_a', body) || {}).scrollTop; draw.sb = ($('#cd_b', body) || {}).scrollTop;
      const tog = e.target.closest('[data-tog]');
      if (tog) { const id = tog.dataset.tog; if (open.has(id)) open.delete(id); else open.add(id); selA = { type: 'g', id }; return draw(); }
      const gk = e.target.closest('[data-g]'); if (gk) { selA = { type: 'g', id: gk.dataset.g }; return draw(); }
      const kk = e.target.closest('#cd_a [data-k]'); if (kk) { selA = { type: 'k', id: kk.dataset.k }; return draw(); }
      const bb = e.target.closest('[data-b]');
      if (bb) { const k = cols[+bb.dataset.b].k; if (e.ctrlKey || e.metaKey) { if (selB.has(k)) selB.delete(k); else selB.add(k); } else selB = new Set([k]); return draw(); }
      const btn = e.target.closest('[data-a]'); if (!btn || btn.disabled) return;
      const a = btn.dataset.a;
      if (a === 'add') {
        if (selA && selA.type === 'k') addKeys([selA.id]);
        else if (selA && selA.type === 'g') addKeys(P6.colGroups(App.p).find((x) => x.id === selA.id).keys);
        selA = null;
      } else if (a === 'addall') addKeys(visibleLeaf());
      else if (a === 'rem') { cols = cols.filter((c) => !selB.has(c.k)); selB.clear(); }
      else if (a === 'remall') { cols = cols.slice(0, 1); selB.clear(); }
      else if (a === 'up' || a === 'down') {
        const idx = cols.map((c, i) => (selB.has(c.k) ? i : -1)).filter((i) => i >= 0);
        if (a === 'up') idx.forEach((i) => { if (i > 0 && !selB.has(cols[i - 1].k)) [cols[i - 1], cols[i]] = [cols[i], cols[i - 1]]; });
        else idx.reverse().forEach((i) => { if (i < cols.length - 1 && !selB.has(cols[i + 1].k)) [cols[i + 1], cols[i]] = [cols[i], cols[i + 1]]; });
      } else if (a === 'ok') { apply(); return m.close(); }
      else if (a === 'cancel') return m.close();
      else if (a === 'apply') apply();
      else if (a === 'default') { cols = App.DEF_COLS.map((k) => ({ k, w: App.ALL_COLS[k].w })); selB.clear(); }
      else if (a === 'copy') {
        const r = btn.getBoundingClientRect(), saved = App.cfg.layouts || {};
        return App.popMenu([...Object.keys(App.LAYOUTS).map((k) => ({ l: t('lay_' + k), fn: () => { cols = App.LAYOUTS[k].cols.map((c) => ({ k: c, w: App.ALL_COLS[c].w })); selB.clear(); draw(); } })), ...(Object.keys(saved).length ? ['-'] : []), ...Object.keys(saved).map((n) => ({ l: n, fn: () => { cols = clone(saved[n].cols); selB.clear(); draw(); } }))], r.left, r.bottom);
      } else if (a === 'edit') return editColumn([...selB][0]);
      else if (a === 'help') return modal({ title: t('help'), cls: 'mid', body: `<div style="line-height:1.8">${t('cols_help_html')}</div>`, buttons: [{ label: t('close'), cls: 'pri', fn: () => {} }] });
      draw();
    });
    body.addEventListener('dblclick', (e) => {
      const kk = e.target.closest('#cd_a [data-k]'); if (kk) { addKeys([kk.dataset.k]); selA = null; draw(); return; }
      const bb = e.target.closest('[data-b]'); if (bb) { const k = cols[+bb.dataset.b].k; if (cols.length > 1) { cols = cols.filter((c) => c.k !== k); selB.clear(); draw(); } return; }
      const gk = e.target.closest('[data-g]'); if (gk && !e.target.closest('[data-tog]')) { const id = gk.dataset.g; if (open.has(id)) open.delete(id); else open.add(id); draw(); }
    });
    function editColumn(k) {
      const c = cols.find((x) => x.k === k); if (!c) return;
      const bd = `<div class="grid2"><div class="fld w2"><label>${esc(t('col_title'))}</label><input id="ec_t" dir="auto" value="${esc(c.title || '')}" placeholder="${esc(label(k))}"></div>
        <div class="fld"><label>${esc(t('col_width'))}</label><input id="ec_w" value="${c.w}"></div>
        <div class="fld"><label>${esc(t('col_align'))}</label><select id="ec_a"><option value="">${esc(t('align_auto'))}</option><option value="left"${c.align === 'left' ? ' selected' : ''}>${esc(t('align_left'))}</option><option value="center"${c.align === 'center' ? ' selected' : ''}>${esc(t('align_center'))}</option><option value="right"${c.align === 'right' ? ' selected' : ''}>${esc(t('align_right'))}</option></select></div></div>`;
      modal({ title: t('edit_column'), body: bd, buttons: [{ label: t('cancel'), fn: () => {} }, { label: t('ok'), cls: 'pri', fn: (cl, el) => {
        c.title = $('#ec_t', el).value.trim() || undefined; c.w = Math.max(40, parseInt($('#ec_w', el).value, 10) || c.w); c.align = $('#ec_a', el).value || undefined; draw();
      } }] });
    }
  };

  // =============== Activity / project codes ===============
  D.codes = function (kind) {
    const p = App.p, isPc = kind === 'pc';
    const types = () => (isPc ? p.pcTypes : p.codeTypes.filter((c) => c.scope === (kind === 'acp' ? 'project' : 'global')));
    const vals = (id) => (isPc ? p.pcVals : p.codeVals).filter((v) => v.type === id);
    let cur = (types()[0] || {}).id;
    const body = document.createElement('div');
    const draw = () => {
      const ts = types(), ct = ts.find((x) => x.id === cur) || (cur = (ts[0] || {}).id, ts[0]);
      body.innerHTML = `<div class="two"><div><b>${esc(t('code_types'))}</b><table class="mini"><tbody>${ts.map((x) => `<tr data-t="${x.id}"${x.id === cur ? ' class="rsel"' : ''}><td><input data-f="name" dir="auto" value="${esc(x.name)}"></td><td style="width:70px"><input data-f="len" value="${x.len || 20}" title="${esc(t('max_len'))}"></td><td style="width:28px"><button class="ib" data-delt="${x.id}">×</button></td></tr>`).join('') || `<tr><td class="empty">—</td></tr>`}</tbody></table><div style="margin-top:8px"><button class="btn sm" id="ct_add">+ ${esc(t('add_code_type'))}</button></div></div>
        <div><b>${esc(t('code_values'))}${ct ? ' – ' + esc(ct.name) : ''}</b>${ct ? `<table class="mini"><thead><tr><th style="width:90px">${esc(t('code_short'))}</th><th>${esc(t('col_name'))}</th><th style="width:110px">${esc(t('parent_wbs'))}</th><th style="width:28px"></th></tr></thead><tbody>${vals(ct.id).map((v) => `<tr data-v="${v.id}"><td><input data-f="short" dir="auto" value="${esc(v.short)}"></td><td><input data-f="name" dir="auto" value="${esc(v.name)}"></td><td><select data-f="parent"><option value="">—</option>${vals(ct.id).filter((x) => x.id !== v.id).map((x) => `<option value="${x.id}"${v.parent === x.id ? ' selected' : ''}>${esc(x.short)}</option>`).join('')}</select></td><td><button class="ib" data-delv="${v.id}">×</button></td></tr>`).join('')}</tbody></table><div style="margin-top:8px"><button class="btn sm" id="cv_add">+ ${esc(t('add_code_value'))}</button></div>` : ''}
        ${isPc && ct ? `<div class="fld" style="margin-top:14px"><label>${esc(t('pc_assigned'))}</label><select id="pc_sel"><option value="">—</option>${vals(ct.id).map((v) => `<option value="${v.id}"${(p.pcAssign || {})[ct.id] === v.id ? ' selected' : ''}>${esc(v.short + ' – ' + v.name)}</option>`).join('')}</select></div>` : ''}</div></div>`;
    };
    draw();
    modal({ title: t(kind === 'pc' ? 'act_pcodes' : kind === 'acp' ? 'act_codes_project' : 'act_codes_global'), cls: 'wide', body, buttons: [{ label: t('close'), cls: 'pri', fn: () => {} }], onClose: () => { App.refresh({ details: true }); } });
    const commit = (lbl, fn) => App.mutate(lbl, fn, { noSched: true });
    body.addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-t]'); if (tr && !e.target.closest('button') && e.target.tagName !== 'INPUT') { cur = +tr.dataset.t; return draw(); }
      if (e.target.id === 'ct_add') {
        const n = prompt(t('code_type_name'), ''); if (!n) return;
        commit(t('add_code_type'), () => { const o = { id: P6.nextId(p), name: n, len: 20 }; if (isPc) p.pcTypes.push(o); else { o.scope = kind === 'acp' ? 'project' : 'global'; p.codeTypes.push(o); } cur = o.id; });
        return draw();
      }
      const dt = e.target.closest('[data-delt]');
      if (dt) { const id = +dt.dataset.delt; if (!confirm(t('confirm_generic'))) return; commit(t('delete'), () => { if (isPc) { p.pcTypes = p.pcTypes.filter((x) => x.id !== id); p.pcVals = p.pcVals.filter((x) => x.type !== id); delete p.pcAssign[id]; } else { p.codeTypes = p.codeTypes.filter((x) => x.id !== id); p.codeVals = p.codeVals.filter((x) => x.type !== id); p.tasks.forEach((tk) => { delete tk.codes[id]; }); } }); cur = (types()[0] || {}).id; return draw(); }
      if (e.target.id === 'cv_add' && cur != null) { commit(t('add_code_value'), () => { const o = { id: P6.nextId(p), type: cur, short: 'NEW' + (vals(cur).length + 1), name: '', parent: null }; (isPc ? p.pcVals : p.codeVals).push(o); }); return draw(); }
      const dv = e.target.closest('[data-delv]');
      if (dv) { const id = +dv.dataset.delv; commit(t('delete'), () => { if (isPc) { p.pcVals = p.pcVals.filter((x) => x.id !== id && x.parent !== id); Object.keys(p.pcAssign).forEach((k) => { if (p.pcAssign[k] === id) delete p.pcAssign[k]; }); } else { p.codeVals = p.codeVals.filter((x) => x.id !== id); p.tasks.forEach((tk) => Object.keys(tk.codes).forEach((k) => { if (tk.codes[k] === id) delete tk.codes[k]; })); } }); return draw(); }
    });
    body.addEventListener('change', (e) => {
      const x = e.target;
      if (x.id === 'pc_sel') return commit(t('edit'), () => { if (x.value === '') delete p.pcAssign[cur]; else p.pcAssign[cur] = +x.value; });
      const tr = x.closest('tr'); if (!tr) return; const f = x.dataset.f;
      if (tr.dataset.t) { const ct = types().find((c) => c.id === +tr.dataset.t); commit(t('edit'), () => { if (f === 'len') ct.len = Math.max(1, parseInt(x.value, 10) || 20); else ct.name = x.value; }); }
      else if (tr.dataset.v) { const v = (isPc ? p.pcVals : p.codeVals).find((c) => c.id === +tr.dataset.v); commit(t('edit'), () => { if (f === 'parent') v.parent = x.value === '' ? null : +x.value; else v[f] = x.value; }); }
      draw();
    });
  };

  // =============== user-defined fields ===============
  D.udf = function () {
    const p = App.p;
    const body = document.createElement('div');
    const draw = () => {
      body.innerHTML = `<table class="mini"><thead><tr><th>${esc(t('udf_title'))}</th><th style="width:130px">${esc(t('udf_type'))}</th><th style="width:28px"></th></tr></thead><tbody>${p.udfs.map((u) => `<tr data-u="${u.id}"><td><input data-f="name" dir="auto" value="${esc(u.name)}"></td><td><select data-f="ty">${['text', 'number', 'cost', 'date'].map((x) => `<option value="${x}"${u.ty === x ? ' selected' : ''}>${esc(t('ut_' + x))}</option>`).join('')}</select></td><td><button class="ib" data-del="${u.id}">×</button></td></tr>`).join('') || `<tr><td colspan="3" class="empty">${esc(t('no_udf'))}</td></tr>`}</tbody></table><div style="margin-top:8px"><button class="btn sm" id="u_add">+ ${esc(t('add'))}</button></div>`;
    };
    draw();
    modal({ title: t('udf_manage'), cls: 'mid', body, buttons: [{ label: t('close'), cls: 'pri', fn: () => {} }], onClose: () => App.refresh({ details: true }) });
    body.addEventListener('click', (e) => {
      if (e.target.id === 'u_add') { const n = prompt(t('udf_title'), ''); if (n) { App.mutate(t('add'), () => { p.udfs.push({ id: P6.nextId(p), name: n, ty: 'text' }); }, { noSched: true }); draw(); } }
      const d = e.target.closest('[data-del]'); if (d) { const id = +d.dataset.del; if (!confirm(t('confirm_generic'))) return; App.mutate(t('delete'), () => { p.udfs = p.udfs.filter((u) => u.id !== id); p.tasks.forEach((tk) => { delete tk.udf[id]; }); }, { noSched: true }); draw(); }
    });
    body.addEventListener('change', (e) => { const tr = e.target.closest('tr[data-u]'); if (!tr) return; const u = p.udfs.find((x) => x.id === +tr.dataset.u); App.mutate(t('edit'), () => { u[e.target.dataset.f] = e.target.value; if (e.target.dataset.f === 'ty') p.tasks.forEach((tk) => { delete tk.udf[u.id]; }); }, { noSched: true }); });
  };

  // =============== multiple float paths ===============
  D.floatPaths = function () {
    const p = App.p;
    const body = document.createElement('div');
    const run = () => {
      const n = P6.floatPaths(p, p.floatPathMax || 10);
      const by = {}; p.tasks.forEach((tk) => { if (tk.fp) (by[tk.fp] = by[tk.fp] || []).push(tk); });
      body.querySelector('#fp_res').innerHTML = Object.keys(by).map((k) => { const l = by[k].sort((a, b) => a.fpo - b.fpo); return `<tr><td><b>${k}</b></td><td>${l.length}</td><td dir="auto">${esc(l[0].code)} → ${esc(l[l.length - 1].code)} · ${esc(l[l.length - 1].name)}</td><td>${App.fmtN(Math.min(...l.map((x) => x.tf)))}</td></tr>`; }).join('') || `<tr><td colspan="4" class="empty">—</td></tr>`;
      return n;
    };
    body.innerHTML = `<div class="hint">${esc(t('fp_hint'))}</div><div style="display:flex;gap:10px;align-items:flex-end;margin-bottom:10px"><div class="fld"><label>${esc(t('fp_max'))}</label><input id="fp_n" style="width:90px" value="${p.floatPathMax || 10}"></div><button class="btn pri" id="fp_run">${esc(t('fp_calc'))}</button><button class="btn" id="fp_cols">${esc(t('fp_cols'))}</button></div>
      <table class="mini"><thead><tr><th style="width:70px">${esc(t('col_fp'))}</th><th style="width:90px">${esc(t('col_n'))}</th><th>${esc(t('fp_path'))}</th><th style="width:90px">${esc(t('col_tf'))}</th></tr></thead><tbody id="fp_res"></tbody></table>`;
    modal({ title: t('fp_title'), cls: 'mid', body, buttons: [{ label: t('close'), cls: 'pri', fn: () => {} }], onClose: () => App.refresh() });
    run();
    body.addEventListener('click', (e) => {
      if (e.target.id === 'fp_run') { p.floatPathMax = Math.max(1, parseInt($('#fp_n', body).value, 10) || 10); run(); }
      if (e.target.id === 'fp_cols') { ['fp', 'fpo'].forEach((k) => { if (!App.cfg.cols.some((c) => c.k === k)) App.cfg.cols.push({ k, w: App.ALL_COLS[k].w }); }); App.saveCfg(); App.toast(t('fp_cols_added')); }
    });
  };
})(window);

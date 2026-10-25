/* P6 Web – project database (like P6's Projects window): EPS tree, projects with Project ID / status / manager,
   copy, move, delete, export, plus whole-database backup and restore. Everything is stored in this browser (IndexedDB). */
(function (g) {
  'use strict';
  const P6 = g.P6, App = g.App, D = App.dialogs;
  const t = (k, ...a) => P6.t(k, ...a), esc = P6.esc;
  const ar = () => App.cfg.lang !== 'en';
  const B = (en, arb) => (ar() ? arb : en);
  const fmtD = (d) => (d == null ? '' : P6.fmtDate(d));
  const STATUS = [['Active', 'Active', 'نشط'], ['Planned', 'Planned', 'مخطط'], ['Inactive', 'Inactive', 'غير نشط'], ['WhatIf', 'What-If', 'سيناريو (What-If)']];
  const stLabel = (s) => { const x = STATUS.find((y) => y[0] === s) || STATUS[0]; return ar() ? x[2] : x[1]; };
  const idb = (store, mode, fn) => App.idb(store, mode, fn);
  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const ROOT = 'root';
  let sel = null; // 'e:<id>' | 'p:<id>'

  // ---------- data ----------
  const epsAll = async () => (await idb('eps', 'readonly', (st) => st.getAll())) || [];
  const epsPut = (n) => idb('eps', 'readwrite', (st) => st.put(n));
  const epsDel = (id) => idb('eps', 'readwrite', (st) => st.delete(id));
  const projAll = () => App.listProjects();
  const rootName = () => App.cfg.epsRoot || B('Enterprise', 'المؤسسة (Enterprise)');
  async function patchProject(id, fn) {
    if (App.p && App.p.id === id) { fn(App.p.meta = App.p.meta || {}, App.p); App.p.name = App.p.name; await App.saveNowP(); return; }
    const rec = await idb('projects', 'readonly', (st) => st.get(id)); if (!rec) return;
    const p = JSON.parse(rec.data); p.meta = p.meta || {}; fn(p.meta, p);
    Object.assign(rec, { name: p.name, eps: p.meta.eps || ROOT, code: p.meta.code || '', status: p.meta.status || 'Active', manager: p.meta.manager || '', data: JSON.stringify(p), updated: Date.now() });
    await idb('projects', 'readwrite', (st) => st.put(rec));
  }

  // ---------- window ----------
  App.renderProjectsDB = async function (el) {
    if (App.p && !App.p.meta) App.p.meta = { eps: ROOT, code: App.nextCode(App.p.name), status: 'Active', manager: '' };
    let projs = await projAll();
    if (App.p && !projs.some((x) => x.id === App.p.id)) { await App.saveNowP(); projs = await projAll(); }
    const eps = await epsAll();
    const cur = App.p && App.p.id, open = (App.cfg.epsOpen = App.cfg.epsOpen || {});
    const kids = (pid) => eps.filter((e) => (e.parent || ROOT) === pid).sort((a, b) => a.name.localeCompare(b.name));
    const pOf = (eid) => projs.filter((p) => (p.eps || ROOT) === eid || (eid === ROOT && !eps.some((e) => e.id === p.eps))).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const isOpen = (id) => open[id] !== false;
    const rows = [];
    const walk = (id, lvl) => {
      if (id !== ROOT) {} // eslint-disable-line no-empty
      for (const e of kids(id)) { rows.push({ k: 'e:' + e.id, e, lvl }); if (isOpen(e.id)) walk(e.id, lvl + 1); }
      for (const p of pOf(id)) rows.push({ k: 'p:' + p.id, p, lvl });
    };
    rows.push({ k: 'e:' + ROOT, e: { id: ROOT, name: rootName(), code: '' }, lvl: 0 });
    if (isOpen(ROOT)) walk(ROOT, 1);
    if (!sel || !rows.some((r) => r.k === sel)) sel = cur ? 'p:' + cur : 'e:' + ROOT;
    const total = projs.reduce((a, p) => a + (p.size || 0), 0);
    let est = ''; try { const s = await navigator.storage.estimate(); est = ` · ${B('Browser storage', 'تخزين المتصفح')}: ${(s.usage / 1048576).toFixed(1)} / ${(s.quota / 1048576 / 1024).toFixed(1)} GB`; } catch (e) { /* ignore */ }
    const th = (s, w) => `<th style="min-width:${w}px">${esc(s)}</th>`;
    const body = rows.map((r) => {
      const pad = r.lvl * 18 + 6;
      if (r.e) { const has = kids(r.e.id).length || pOf(r.e.id).length; return `<tr data-k="${r.k}" class="${sel === r.k ? 'wsel ' : ''}pdb-eps"><td style="padding-inline-start:${pad}px"><div class="pdb-c"><span class="tw" data-tw="${esc(r.e.id)}">${has ? (isOpen(r.e.id) ? '−' : '+') : ''}</span>${P6.icon('eps')}<b dir="auto">${esc(r.e.name)}</b></div></td><td>${esc(r.e.code || '')}</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`; }
      const p = r.p, c = p.id === cur;
      return `<tr data-k="${r.k}" class="${sel === r.k ? 'wsel ' : ''}${c ? 'curproj' : ''}"><td style="padding-inline-start:${pad + 18}px"><div class="pdb-c">${P6.icon('projects')}<span dir="auto">${esc(p.name || '')}</span>${c ? '<span>●</span>' : ''}</div></td><td dir="ltr">${esc(p.code || '')}</td><td>${esc(stLabel(p.status))}</td><td style="text-align:end">${p.tasks}</td><td>${fmtD(p.start)}</td><td>${fmtD(p.finish)}</td><td>${fmtD(p.dataDate)}</td><td>${esc(new Date(p.updated).toLocaleString())}</td></tr>`;
    }).join('');
    const btn = (a, label, cls) => `<button class="btn sm${cls ? ' ' + cls : ''}" data-a="${a}">${esc(label)}</button>`;
    el.innerHTML = `<div class="pdb"><div class="pdb-bar">${btn('neweps', B('New EPS', 'EPS جديد'))}${btn('newproj', B('New Project', 'مشروع جديد'))}${btn('open', t('open_project'))}${btn('props', B('Properties…', 'خصائص…'))}${btn('copy', B('Copy', 'نسخ'))}${btn('xer', B('Export XER', 'تصدير XER'))}${btn('del', t('delete'), 'dng')}<span class="sp"></span>${btn('backup', B('Backup database', 'نسخ احتياطي للقاعدة'))}${btn('restore', B('Restore…', 'استعادة…'))}</div>
      <div class="pdb-grid"><table class="mini pdbt"><thead><tr>${th(B('EPS / Project Name', 'EPS / اسم المشروع'), 300)}${th(B('Project ID', 'رقم المشروع'), 110)}${th(B('Status', 'الحالة'), 90)}${th(t('activities'), 70)}${th(t('col_es'), 90)}${th(t('col_ef'), 90)}${th(t('data_date'), 90)}${th(t('last_saved'), 160)}</tr></thead><tbody>${body}</tbody></table></div>
      <div class="pdb-info">${B('Projects', 'المشاريع')}: ${projs.length} · ${B('EPS nodes', 'عقد EPS')}: ${eps.length} · ${(total / 1048576).toFixed(2)} MB${est}</div></div>`;
    const rerender = () => App.renderWin();
    el.onclick = async (e) => {
      const tw = e.target.closest('[data-tw]'); if (tw) { open[tw.dataset.tw] = !isOpen(tw.dataset.tw); App.saveCfg(); return rerender(); }
      const tr = e.target.closest('tr[data-k]'); if (tr && !e.target.closest('button')) { sel = tr.dataset.k; el.querySelectorAll('tr.wsel').forEach((q) => q.classList.remove('wsel')); tr.classList.add('wsel'); return; }
      const b = e.target.closest('[data-a]'); if (!b) return;
      await actions[b.dataset.a](rerender, { eps, projs });
    };
    el.ondblclick = async (e) => { const tr = e.target.closest('tr[data-k^="p:"]'); if (tr) actions.open(rerender); };
  };

  const selId = () => (sel ? sel.slice(2) : null), selIsP = () => !!sel && sel[0] === 'p';
  const epsSelect = (eps, val, id) => `<select id="${id}"><option value="${ROOT}"${val === ROOT || !val ? ' selected' : ''}>${esc(rootName())}</option>${eps.map((e) => `<option value="${esc(e.id)}"${val === e.id ? ' selected' : ''}>${esc(e.name)}</option>`).join('')}</select>`;
  const actions = {
    async neweps(rr, d) {
      const parent = selIsP() ? ((d.projs.find((p) => p.id === selId()) || {}).eps || ROOT) : selId() || ROOT;
      const name = prompt(B('New EPS node name', 'اسم عقدة EPS الجديدة'), ''); if (!name) return;
      await epsPut({ id: uid('e'), name: name.trim(), code: name.trim().slice(0, 12).toUpperCase().replace(/\s+/g, '-'), parent }); App.cfg.epsOpen[parent] = true; rr();
    },
    async newproj(rr, d) {
      App._pendingEps = selIsP() ? ((d.projs.find((p) => p.id === selId()) || {}).eps || ROOT) : selId() || ROOT; D.newProject();
    },
    async open(rr) {
      if (!selIsP()) return; const q = await App.loadProject(selId()); if (q) { App.openProject(q); App.showWin('activities'); }
    },
    async props(rr, d) {
      const body = document.createElement('div');
      if (selIsP()) {
        const p = d.projs.find((x) => x.id === selId()); if (!p) return;
        body.innerHTML = `<div class="grid2"><div class="fld w2"><label>${esc(t('project_name'))}</label><input id="pp_n" dir="auto" value="${esc(p.name)}"></div><div class="fld"><label>${esc(B('Project ID', 'رقم المشروع'))}</label><input id="pp_c" dir="ltr" value="${esc(p.code || '')}"></div><div class="fld"><label>${esc(B('Status', 'الحالة'))}</label><select id="pp_s">${STATUS.map(([k, en, arb]) => `<option value="${k}"${(p.status || 'Active') === k ? ' selected' : ''}>${esc(ar() ? arb : en)}</option>`).join('')}</select></div><div class="fld"><label>EPS</label>${epsSelect(d.eps, p.eps, 'pp_e')}</div><div class="fld"><label>${esc(B('Responsible Manager', 'مدير المشروع'))}</label><input id="pp_m" dir="auto" value="${esc(p.manager || '')}"></div></div>`;
        D.modal({ title: B('Project Properties', 'خصائص المشروع'), cls: 'mid', body, buttons: [{ label: t('cancel'), fn: () => {} }, { label: t('save'), cls: 'pri', fn: async (c, el) => {
          const v = (i) => el.querySelector('#' + i).value;
          await patchProject(p.id, (m, pr) => { pr.name = v('pp_n').trim() || pr.name; m.code = v('pp_c').trim(); m.status = v('pp_s'); m.eps = v('pp_e'); m.manager = v('pp_m').trim(); });
          rr();
        } }] });
      } else {
        const id = selId(), n = id === ROOT ? { id: ROOT, name: rootName(), code: '' } : d.eps.find((x) => x.id === id); if (!n) return;
        body.innerHTML = `<div class="grid2"><div class="fld w2"><label>${esc(B('EPS name', 'اسم EPS'))}</label><input id="pe_n" dir="auto" value="${esc(n.name)}"></div>${id === ROOT ? '' : `<div class="fld"><label>${esc(B('EPS ID', 'رقم EPS'))}</label><input id="pe_c" dir="ltr" value="${esc(n.code || '')}"></div><div class="fld"><label>${esc(B('Parent', 'الأب'))}</label>${epsSelect(d.eps.filter((x) => x.id !== id), n.parent, 'pe_p')}</div>`}</div>`;
        D.modal({ title: B('EPS Properties', 'خصائص EPS'), cls: 'mid', body, buttons: [{ label: t('cancel'), fn: () => {} }, { label: t('save'), cls: 'pri', fn: async (c, el) => {
          const nm = el.querySelector('#pe_n').value.trim(); if (!nm) return;
          if (id === ROOT) App.cfg.epsRoot = nm; else {
            const par = el.querySelector('#pe_p').value; let a = par; const seen = new Set(); while (a && a !== ROOT && !seen.has(a)) { if (a === id) return App.toast(B('An EPS node cannot be moved under itself', 'لا يمكن نقل العقدة تحت نفسها'), true); seen.add(a); a = (d.eps.find((x) => x.id === a) || {}).parent; }
            await epsPut(Object.assign({}, n, { name: nm, code: el.querySelector('#pe_c').value.trim(), parent: par }));
          }
          App.saveCfg(); rr();
        } }] });
      }
    },
    async copy(rr, d) {
      if (!selIsP()) return; const id = selId();
      const rec = await idb('projects', 'readonly', (st) => st.get(id)); if (!rec) return;
      const raw = await idb('raw', 'readonly', (st) => st.get(id));
      const p = JSON.parse(rec.data); const nid = uid('p'); p.id = nid; p.name = (p.name || '') + B(' (copy)', ' (نسخة)'); p.meta = Object.assign({}, p.meta, { code: ((p.meta && p.meta.code) || 'PROJ') + '-C', status: 'Planned' });
      const data = JSON.stringify(p);
      await idb('projects', 'readwrite', (st) => st.put(Object.assign({}, rec, { id: nid, name: p.name, code: p.meta.code, status: 'Planned', updated: Date.now(), data })));
      if (raw) await idb('raw', 'readwrite', (st) => st.put(raw, nid));
      sel = 'p:' + nid; rr();
    },
    async xer() {
      if (!selIsP()) return; const q = await App.loadProject(selId()); if (!q) return;
      App.download((q.name || 'project').replace(/[^\w؀-ۿ.-]+/g, '_') + '.xer', P6.toXER(q), 'text/plain');
    },
    async del(rr, d) {
      if (selIsP()) {
        const id = selId(); if (App.p && id === App.p.id) return App.toast(t('err_cur_proj'), true);
        if (!confirm(t('confirm_delete_project'))) return; await App.deleteProject(id); sel = null; rr();
      } else {
        const id = selId(); if (id === ROOT) return;
        if (d.eps.some((e) => e.parent === id) || d.projs.some((p) => p.eps === id)) return App.toast(B('Move or delete the nodes and projects inside this EPS first', 'انقل أو احذف العقد والمشاريع داخل هذا الـ EPS أولاً'), true);
        if (!confirm(B('Delete this EPS node?', 'حذف عقدة EPS؟'))) return; await epsDel(id); sel = null; rr();
      }
    },
    async backup() {
      if (App.p && App.dirty) await App.saveNowP();
      const [eps, projs] = await Promise.all([epsAll(), idb('projects', 'readonly', (st) => st.getAll())]);
      const out = { format: 'p6web-db', version: 1, saved: new Date().toISOString(), epsRoot: App.cfg.epsRoot || null, eps, projects: [] };
      for (const rec of projs || []) out.projects.push({ rec, raw: (await idb('raw', 'readonly', (st) => st.get(rec.id))) || null });
      App.download('P6Web-Database-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(out), 'application/json');
      App.toast(B(`Backup saved: ${out.projects.length} projects`, `تم حفظ نسخة احتياطية: ${out.projects.length} مشروع`));
    },
    restore(rr) {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
      inp.onchange = async () => {
        const f = inp.files[0]; if (!f) return;
        let db; try { db = JSON.parse(await f.text()); } catch (e) { return App.toast(B('Not a valid backup file', 'ملف نسخة احتياطية غير صالح'), true); }
        if (!db || db.format !== 'p6web-db' || !Array.isArray(db.projects)) return App.toast(B('Not a P6 Web backup file', 'هذا ليس ملف نسخة احتياطية لـ P6 Web'), true);
        const have = new Set((await projAll()).map((p) => p.id)); let added = 0, over = 0, skipped = 0;
        const overwrite = db.projects.some((x) => have.has(x.rec.id)) ? confirm(B('Some projects already exist. OK = overwrite them, Cancel = keep existing ones.', 'بعض المشاريع موجودة. موافق = استبدالها، إلغاء = الإبقاء على الموجودة.')) : false;
        for (const x of db.projects) {
          const id = x.rec.id, exists = have.has(id);
          if (exists && (!overwrite || (App.p && App.p.id === id))) { skipped++; continue; }
          await idb('projects', 'readwrite', (st) => st.put(x.rec)); if (x.raw) await idb('raw', 'readwrite', (st) => st.put(x.raw, id)); exists ? over++ : added++;
        }
        for (const e of db.eps || []) await epsPut(e);
        if (db.epsRoot) { App.cfg.epsRoot = db.epsRoot; App.saveCfg(); }
        App.toast(B(`Restored: ${added} new, ${over} overwritten, ${skipped} skipped`, `تمت الاستعادة: ${added} جديد، ${over} مستبدل، ${skipped} متجاوز`)); rr();
      };
      inp.click();
    }
  };
  App.epsAll = epsAll;
})(window);

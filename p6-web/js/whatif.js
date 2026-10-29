/* P6 Web – What-If scenarios & delay analysis (TIA-style). A scenario is a list of changes applied to a throw-away copy of the schedule,
   re-scheduled, and compared with the current schedule (finish movement, critical path, changed activities). Scenarios are saved with the project
   and can be applied to the live schedule (undoable). Changes: duration, delay event, lag, add / remove relationship, constraint, scale durations. */
(function (g) {
  'use strict';
  const P6 = g.P6, App = g.App, D = App.dialogs;
  const esc = P6.esc, B = (en, ar) => (P6.dir() === 'rtl' ? ar : en);
  const fd = (d) => (d == null ? '' : P6.fmtDate(d));
  const byCode = (p, c) => p.tasks.find((x) => String(x.code).toLowerCase() === String(c || '').trim().toLowerCase());
  const clone = (p) => JSON.parse(JSON.stringify(p, (k, v) => (k === 'xer' || k === 'scenarios' ? undefined : v)));

  const KINDS = {
    dur: () => B('Change duration', 'تغيير مدة نشاط'), event: () => B('Delay event (TIA)', 'حدث تأخير (TIA)'), lag: () => B('Change lag', 'تغيير Lag علاقة'),
    addrel: () => B('Add relationship', 'إضافة علاقة'), rel: () => B('Change relationship type / lag', 'تغيير نوع / Lag علاقة'), rmrel: () => B('Remove relationship', 'حذف علاقة'), cons: () => B('Set constraint', 'وضع قيد'), scale: () => B('Scale open durations', 'تغيير نسبي لمدد الأنشطة المفتوحة')
  };
  const describe = (o) => {
    switch (o.k) {
      case 'dur': return `${o.code}: ${o.mode === 'add' ? (o.v >= 0 ? '+' : '') + o.v + ' d' : o.mode === 'pct' ? o.v + '%' : '= ' + o.v + ' d'}`;
      case 'event': return `${o.name || 'Delay'} ${o.days} d → ${o.succ}${o.pred ? ' (after ' + o.pred + ')' : ''}`;
      case 'lag': return `${o.from} → ${o.to}: lag = ${o.lag} d`;
      case 'addrel': return `${o.from} → ${o.to} (${o.type}${o.lag ? ' ' + o.lag : ''})`;
      case 'rmrel': return `${o.from} ✕ ${o.to}`;
      case 'rel': return `${o.from} → ${o.to}: ${o.type}${o.lag ? ' ' + o.lag : ''}${o.ff != null ? ' + FF ' + o.ff : ''}`;
      case 'cons': return `${o.code}: ${o.ct}${o.date ? ' ' + o.date : ''}`;
      case 'scale': return `${o.v}% ${B('of open durations', 'من مدد الأنشطة المفتوحة')}${o.wbs ? ' · WBS ' + o.wbs : ''}`;
    }
    return '';
  };

  const input = (id, ph, w) => `<input id="${id}" list="wif_codes" placeholder="${esc(ph)}" style="width:${w || 110}px">`;
  function formFor(k) {
    const num = (id, ph, v) => `<input id="${id}" type="number" placeholder="${esc(ph)}" value="${v == null ? '' : v}" style="width:80px">`;
    switch (k) {
      case 'dur': return input('f_code', B('Activity ID', 'رقم النشاط')) + `<select id="f_mode"><option value="add">${B('Add days (±)', 'إضافة أيام (±)')}</option><option value="pct">${B('% of duration', '% من المدة')}</option><option value="set">${B('Set to days', 'تعيين بأيام')}</option></select>` + num('f_v', B('value', 'القيمة'));
      case 'event': return `<input id="f_name" placeholder="${esc(B('Event name', 'اسم الحدث'))}" style="width:150px">` + num('f_days', B('days', 'أيام')) + input('f_succ', B('Delays activity', 'يؤخر النشاط')) + input('f_pred', B('After (optional)', 'بعد (اختياري)'));
      case 'lag': return input('f_from', B('From', 'من')) + input('f_to', B('To', 'إلى')) + num('f_lag', 'lag');
      case 'rmrel': return input('f_from', B('From', 'من')) + input('f_to', B('To', 'إلى'));
      case 'addrel': return input('f_from', B('From', 'من')) + input('f_to', B('To', 'إلى')) + `<select id="f_type"><option>FS</option><option>SS</option><option>FF</option><option>SF</option></select>` + num('f_lag', 'lag', 0);
      case 'cons': return input('f_code', B('Activity ID', 'رقم النشاط')) + `<select id="f_ct">${['SNET', 'FNET', 'SNLT', 'FNLT', 'MSO', 'MFO', 'NONE'].map((c) => `<option>${c}</option>`).join('')}</select><input id="f_date" placeholder="dd-mmm-yy" style="width:90px">`;
      case 'scale': return num('f_v', B('% (e.g. 120)', '% (مثلاً 120)'), 100) + `<input id="f_wbs" placeholder="${esc(B('WBS code (optional)', 'كود WBS (اختياري)'))}" style="width:150px">`;
    }
    return '';
  }
  function readOp(k, el) {
    const v = (id) => { const e = el.querySelector('#' + id); return e ? e.value.trim() : ''; }, n = (id) => { const x = parseFloat(v(id)); return isFinite(x) ? x : NaN; };
    const o = { k };
    if (k === 'dur') Object.assign(o, { code: v('f_code'), mode: v('f_mode'), v: n('f_v') });
    else if (k === 'event') Object.assign(o, { name: v('f_name'), days: n('f_days'), succ: v('f_succ'), pred: v('f_pred') });
    else if (k === 'lag') Object.assign(o, { from: v('f_from'), to: v('f_to'), lag: n('f_lag') });
    else if (k === 'rel') Object.assign(o, { from: v('f_from'), to: v('f_to'), type: v('f_type'), lag: n('f_lag') || 0 });
    else if (k === 'rmrel') Object.assign(o, { from: v('f_from'), to: v('f_to') });
    else if (k === 'addrel') Object.assign(o, { from: v('f_from'), to: v('f_to'), type: v('f_type'), lag: n('f_lag') || 0 });
    else if (k === 'cons') Object.assign(o, { code: v('f_code'), ct: v('f_ct'), date: v('f_date') });
    else if (k === 'scale') Object.assign(o, { v: n('f_v'), wbs: v('f_wbs') });
    const need = { dur: ['code', 'v'], event: ['days', 'succ'], lag: ['from', 'to', 'lag'], rmrel: ['from', 'to'], rel: ['from', 'to'], addrel: ['from', 'to'], cons: ['code'], scale: ['v'] }[k];
    if (need.some((f) => o[f] === '' || (typeof o[f] === 'number' && isNaN(o[f])))) return null;
    return o;
  }

  P6.opUI = { KINDS, describe, formFor, readOp };

  /* Apply ops to project p (mutating). Returns array of warnings. */
  P6.applyScenario = function (p, ops) {
    const warn = [];
    for (const o of ops) {
      if (o.k === 'scale') {
        const w = o.wbs ? p.wbs.find((q) => String(q.code).toLowerCase() === String(o.wbs).toLowerCase()) : null, ids = new Set();
        if (w) { const st = [w.id]; while (st.length) { const x = st.pop(); ids.add(x); p.wbs.filter((q) => q.parent === x).forEach((q) => st.push(q.id)); } }
        for (const t of p.tasks) if (t.status !== 'C' && !P6.isMile(t) && !P6.isHammock(t) && (!w || ids.has(t.wbs))) { t.dur = Math.max(1, Math.round(t.dur * o.v / 100)); if (t.status === 'NS') t.rem = t.dur; else t.rem = Math.max(0, Math.round((t.rem || 0) * o.v / 100)); }
      } else if (o.k === 'dur') {
        const t = byCode(p, o.code); if (!t) { warn.push('? ' + o.code); continue; }
        const nd = o.mode === 'add' ? t.dur + o.v : o.mode === 'pct' ? Math.round(t.dur * o.v / 100) : o.v, d = Math.max(0, nd);
        if (t.status === 'C') { warn.push(o.code + ' ' + B('is completed', 'مكتمل')); continue; }
        if (t.status === 'NS') { t.dur = d; t.rem = d; } else { t.rem = Math.max(0, t.rem + (d - t.dur)); t.dur = d; }
      } else if (o.k === 'event') {
        const s = byCode(p, o.succ); if (!s) { warn.push('? ' + o.succ); continue; }
        const pr = o.pred ? byCode(p, o.pred) : null;
        const n = P6.newTask(p, s.wbs, { name: o.name || 'Delay event', dur: o.days, rem: o.days, cal: s.cal, code: 'DLY-' + (p.tasks.filter((x) => /^DLY-/.test(x.code)).length + 1) });
        p.tasks.push(n);
        p.rels.push({ id: P6.nextId(p), p: n.id, s: s.id, type: 'FS', lag: 0 });
        if (pr) p.rels.push({ id: P6.nextId(p), p: pr.id, s: n.id, type: 'FS', lag: 0 });
        else for (const r of p.rels.filter((q) => q.s === s.id && q.p !== n.id)) { p.rels.push({ id: P6.nextId(p), p: r.p, s: n.id, type: r.type, lag: r.lag }); }
      } else if (o.k === 'lag' || o.k === 'rmrel') {
        const a = byCode(p, o.from), b = byCode(p, o.to), r = a && b && p.rels.find((q) => q.p === a.id && q.s === b.id);
        if (!r) { warn.push(o.from + '→' + o.to + ' ' + B('not found', 'غير موجودة')); continue; }
        if (o.k === 'lag') r.lag = o.lag; else p.rels = p.rels.filter((q) => q !== r);
      } else if (o.k === 'rel') {
        const a = byCode(p, o.from), b = byCode(p, o.to), r = a && b && p.rels.find((q) => q.p === a.id && q.s === b.id);
        if (!r) { warn.push(o.from + '→' + o.to + ' ' + B('not found', 'غير موجودة')); continue; }
        r.type = o.type; r.lag = o.lag || 0;
        if (o.ff != null && !p.rels.some((q) => q.p === a.id && q.s === b.id && q.type === 'FF')) p.rels.push({ id: P6.nextId(p), p: a.id, s: b.id, type: 'FF', lag: o.ff });
      } else if (o.k === 'addrel') {
        const a = byCode(p, o.from), b = byCode(p, o.to); if (!a || !b) { warn.push(o.from + '→' + o.to + ' ?'); continue; }
        if (P6.wouldLoop && P6.wouldLoop(p, a.id, b.id)) { warn.push(B('Loop: ', 'حلقة: ') + o.from + '→' + o.to); continue; }
        p.rels.push({ id: P6.nextId(p), p: a.id, s: b.id, type: o.type || 'FS', lag: o.lag || 0 });
      } else if (o.k === 'cons') {
        const t = byCode(p, o.code); if (!t) { warn.push('? ' + o.code); continue; }
        t.ct = o.ct === 'NONE' ? '' : o.ct; t.cd = o.date ? P6.parseDate(o.date) : null;
      }
    }
    return warn;
  };

  P6.runScenario = function (p, ops) {
    const base = clone(p), tr = clone(p); P6.schedule(base); const warn = P6.applyScenario(tr, ops); P6.schedule(tr);
    return { res: P6.compare(tr, base), warn, base, tr };
  };

  App.whatIf = function () {
    const p = App.p; if (!p) return;
    p.scenarios = p.scenarios || []; let cur = p.scenarios[0] || null, last = null;
    const root = document.createElement('div'); root.className = 'wif'; root.dir = P6.dir();
    const dl = `<datalist id="wif_codes">${p.tasks.slice(0, 3000).map((t) => `<option value="${esc(t.code)}">${esc(t.name)}</option>`).join('')}</datalist>`;
    const save = () => App.scheduleSave();
    function draw() {
      const sc = p.scenarios;
      root.innerHTML = `${dl}<div class="wif-bar"><label>${esc(B('Scenario', 'السيناريو'))}</label><select id="wif_sel">${sc.map((s, i) => `<option value="${i}"${s === cur ? ' selected' : ''}>${esc(s.name)}</option>`).join('') || `<option>—</option>`}</select><button class="btn" id="wif_new">+ ${esc(B('New', 'جديد'))}</button><button class="btn" id="wif_ren"${cur ? '' : ' disabled'}>${esc(B('Rename', 'إعادة تسمية'))}</button><button class="btn" id="wif_dup"${cur ? '' : ' disabled'}>${esc(B('Duplicate', 'نسخ'))}</button><button class="btn" id="wif_del"${cur ? '' : ' disabled'}>${esc(B('Delete', 'حذف'))}</button></div>`
        + (cur ? `<div class="wif-add"><select id="wif_k">${Object.keys(KINDS).map((k) => `<option value="${k}">${esc(KINDS[k]())}</option>`).join('')}</select><span id="wif_form">${formFor('dur')}</span><button class="btn pri" id="wif_addop">${esc(B('Add change', 'أضف التغيير'))}</button></div>
        <div class="tbl-scroll" style="max-height:170px"><table class="mini cmpt"><thead><tr><th>#</th><th>${esc(B('Type', 'النوع'))}</th><th>${esc(B('Change', 'التغيير'))}</th><th></th></tr></thead><tbody>${cur.ops.map((o, i) => `<tr><td>${i + 1}</td><td>${esc(KINDS[o.k]())}</td><td>${esc(describe(o))}</td><td><a data-rm="${i}" style="cursor:pointer;color:#c0392b">✕</a></td></tr>`).join('') || `<tr><td colspan="4" style="text-align:center;color:#888">${esc(B('No changes yet – add some above', 'لا تغييرات بعد – أضف من الأعلى'))}</td></tr>`}</tbody></table></div>
        <div class="wif-run"><button class="btn pri" id="wif_run">▶ ${esc(B('Run scenario', 'شغّل السيناريو'))}</button><button class="btn" id="wif_apply" disabled>${esc(B('Apply to live schedule', 'طبّق على الجدول الفعلي'))}</button><button class="btn" id="wif_xl" disabled>${esc(B('Export to Excel', 'تصدير Excel'))}</button><button class="btn" id="wif_all">${esc(B('Compare all scenarios', 'قارن كل السيناريوهات'))}</button></div><div id="wif_out"></div>` : `<p class="hint">${esc(B('Create a scenario to start: e.g. "Delay in procurement +20 d", "Add crew to compress", "Remove a link".', 'أنشئ سيناريو للبدء: مثلاً "تأخير التوريد +20 يوم" أو "إضافة طاقم للضغط" أو "حذف علاقة".'))}</p>`);
      const $ = (s) => root.querySelector(s);
      $('#wif_sel').onchange = (e) => { cur = sc[+e.target.value]; last = null; draw(); };
      $('#wif_new').onclick = () => { const nm = prompt(B('Scenario name', 'اسم السيناريو'), 'Scenario ' + (sc.length + 1)); if (!nm) return; cur = { id: Date.now(), name: nm, ops: [] }; sc.push(cur); last = null; save(); draw(); };
      if (cur) {
        $('#wif_ren').onclick = () => { const nm = prompt(B('Scenario name', 'اسم السيناريو'), cur.name); if (nm) { cur.name = nm; save(); draw(); } };
        $('#wif_dup').onclick = () => { const c = JSON.parse(JSON.stringify(cur)); c.id = Date.now(); c.name += ' (copy)'; sc.push(c); cur = c; save(); draw(); };
        $('#wif_del').onclick = () => { if (!confirm(B('Delete this scenario?', 'حذف السيناريو؟'))) return; p.scenarios = sc.filter((s) => s !== cur); cur = p.scenarios[0] || null; last = null; save(); draw(); };
        $('#wif_k').onchange = (e) => { $('#wif_form').innerHTML = formFor(e.target.value); };
        $('#wif_addop').onclick = () => { const k = $('#wif_k').value, o = readOp(k, root); if (!o) return App.toast(B('Fill in all fields', 'املأ كل الحقول'), true); cur.ops.push(o); last = null; save(); draw(); };
        root.querySelectorAll('[data-rm]').forEach((a) => { a.onclick = () => { cur.ops.splice(+a.dataset.rm, 1); last = null; save(); draw(); }; });
        $('#wif_run').onclick = () => {
          if (!cur.ops.length) return App.toast(B('Add at least one change', 'أضف تغييراً واحداً على الأقل'), true);
          try { last = P6.runScenario(p, cur.ops); } catch (e) { console.error(e); return App.toast(String(e.message || e), true); }
          const out = $('#wif_out'); out.innerHTML = (last.warn.length ? `<p class="cmp-bad">⚠ ${esc(last.warn.join(' · '))}</p>` : '') + (last.tr.loops && last.tr.loops.length ? `<p class="cmp-bad">⚠ ${esc(B('Logic loop in scenario', 'حلقة منطقية في السيناريو'))}</p>` : '');
          out.appendChild(P6.compare.view(last.res, { cur: cur.name, oth: p.name + ' (' + B('current', 'الحالي') + ')' }));
          $('#wif_apply').disabled = false; $('#wif_xl').disabled = false;
        };
        $('#wif_apply').onclick = () => {
          if (!confirm(B('Apply this scenario to the live schedule? (Undo with Ctrl+Z)', 'تطبيق السيناريو على الجدول الفعلي؟ (تراجع بـ Ctrl+Z)'))) return;
          App.mutate(B('Apply what-if scenario', 'تطبيق سيناريو ماذا لو') + ': ' + cur.name, () => { P6.applyScenario(App.p, cur.ops); });
          App.toast(B('Scenario applied', 'تم تطبيق السيناريو'));
        };
        $('#wif_xl').onclick = () => { if (last) { const sh = P6.compare.sheets(last.res, last.tr, last.base, { cur: cur.name, oth: p.name }); sh.splice(1, 0, { name: 'Changes list', title: B('Scenario changes', 'تغييرات السيناريو'), cols: [{ h: '#', t: 'n', w: 5 }, { h: 'Type', w: 26 }, { h: 'Change', w: 70 }], rows: cur.ops.map((o, i) => [i + 1, KINDS[o.k](), describe(o)]) }); App.xlsxBook('WhatIf-' + cur.name.replace(/[^\w\-]+/g, '_') + '.xlsx', sh); } };
        $('#wif_all').onclick = () => {
          if (!sc.length) return;
          const rows = sc.map((s) => { try { const r = P6.runScenario(p, s.ops).res.sum; return { s, r }; } catch (e) { return { s, r: null }; } });
          const out = $('#wif_out');
          out.innerHTML = `<div class="tbl-scroll"><table class="mini cmpt"><thead><tr><th>${esc(B('Scenario', 'السيناريو'))}</th><th>${esc(B('Changes', 'تغييرات'))}</th><th>${esc(B('Project finish', 'نهاية المشروع'))}</th><th>${esc(B('Movement (d)', 'الحركة (يوم)'))}</th><th>${esc(B('Activities changed', 'أنشطة متغيرة'))}</th><th>${esc(B('Critical in/out', 'حرج دخل/خرج'))}</th></tr></thead><tbody>${rows.map(({ s, r }) => `<tr><td>${esc(s.name)}</td><td>${s.ops.length}</td><td>${r ? fd(r.cfin) : '–'}</td><td class="${r && r.dfin > 0 ? 'cmp-bad' : r && r.dfin < 0 ? 'cmp-good' : ''}">${r && r.dfin != null ? (r.dfin > 0 ? '+' : '') + r.dfin : '–'}</td><td>${r ? r.changed : ''}</td><td>${r ? r.critIn + '/' + r.critOut : ''}</td></tr>`).join('')}</tbody></table></div>`;
        };
      }
    }
    draw();
    D.modal({ title: B('What-If Scenarios', 'سيناريوهات ماذا لو'), cls: 'wide dsh-modal', body: root, sticky: true, buttons: [{ label: P6.t('close'), fn: () => {} }] });
  };
})(window);

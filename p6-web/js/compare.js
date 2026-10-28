/* P6 Web – Schedule Comparison. Compares the open schedule against another schedule (XER/PMXML file, a project in the database, or the baseline).
   Activities are matched by Activity ID. Reports added/deleted, date / duration / float / % / status changes, logic changes, critical-path entrants/leavers
   and the finish-date movement. Everything exports to a formatted multi-sheet Excel workbook. */
(function (g) {
  'use strict';
  const P6 = g.P6, App = g.App, D = App.dialogs;
  const esc = P6.esc, B = (en, ar) => (P6.dir() === 'rtl' ? ar : en);
  const key = (c) => String(c || '').trim().toLowerCase();
  const fd = (d) => (d == null ? '' : P6.fmtDate(d));

  /* cur/other: projects. Returns { sum, added, deleted, changed, logic, crit, miles } */
  P6.compare = function (cur, other) {
    const om = new Map(other.tasks.map((x) => [key(x.code), x])), cm = new Map(cur.tasks.map((x) => [key(x.code), x]));
    const oc = new Map(other.tasks.map((x) => [x.id, x.code])), cc = new Map(cur.tasks.map((x) => [x.id, x.code]));
    const wn = (p) => { const m = new Map(p.wbs.map((w) => [w.id, w])); return (id) => { const w = m.get(id); return w ? w.code : ''; }; };
    const cw = wn(cur);
    const added = [], deleted = [], changed = [], crit = [], miles = [];
    const cnt = { start: 0, finish: 0, dur: 0, pct: 0, float: 0, status: 0, name: 0, cons: 0 };
    for (const tk of cur.tasks) {
      const o = om.get(key(tk.code));
      if (!o) { added.push(tk); continue; }
      const ch = [];
      const add = (f, a, b, num) => { ch.push({ f, a, b, d: num }); };
      if ((o.es != null || tk.es != null) && o.es !== tk.es) { cnt.start++; add('Start', o.es, tk.es, tk.es != null && o.es != null ? tk.es - o.es : null); }
      if ((o.ef != null || tk.ef != null) && o.ef !== tk.ef) { cnt.finish++; add('Finish', o.ef, tk.ef, tk.ef != null && o.ef != null ? tk.ef - o.ef : null); }
      if (o.dur !== tk.dur) { cnt.dur++; add('Duration', o.dur, tk.dur, tk.dur - o.dur); }
      if ((o.pct || 0) !== (tk.pct || 0)) { cnt.pct++; add('% Complete', o.pct || 0, tk.pct || 0, (tk.pct || 0) - (o.pct || 0)); }
      if (o.tf !== tk.tf && (o.tf != null || tk.tf != null)) { cnt.float++; add('Total Float', o.tf, tk.tf, o.tf != null && tk.tf != null ? tk.tf - o.tf : null); }
      if (o.status !== tk.status) { cnt.status++; add('Status', o.status, tk.status, null); }
      if (o.name !== tk.name) { cnt.name++; add('Name', o.name, tk.name, null); }
      if ((o.ct || '') !== (tk.ct || '') || (o.cd || null) !== (tk.cd || null)) { cnt.cons++; add('Constraint', (o.ct || '') + (o.cd != null ? ' ' + fd(o.cd) : ''), (tk.ct || '') + (tk.cd != null ? ' ' + fd(tk.cd) : ''), null); }
      if (ch.length) changed.push({ t: tk, o, ch });
      if (!!o.crit !== !!tk.crit) crit.push({ t: tk, o, now: !!tk.crit });
      if ((tk.type === 'TT_Mile' || tk.type === 'TT_FinMile') && o.ef != null && tk.ef != null && o.ef !== tk.ef) miles.push({ t: tk, o, d: tk.ef - o.ef });
    }
    for (const o of other.tasks) if (!cm.has(key(o.code))) deleted.push(o);
    // logic
    const relKey = (r, codes) => key(codes.get(r.p)) + '>' + key(codes.get(r.s)) + '|' + (r.type || 'FS') + '|' + (r.lag || 0);
    const orel = new Map(other.rels.filter((r) => oc.has(r.p) && oc.has(r.s)).map((r) => [relKey(r, oc), r])), crel = new Map(cur.rels.filter((r) => cc.has(r.p) && cc.has(r.s)).map((r) => [relKey(r, cc), r]));
    const logic = [];
    for (const [k, r] of crel) if (!orel.has(k)) logic.push({ kind: 'Added', pred: cc.get(r.p), succ: cc.get(r.s), type: r.type || 'FS', lag: r.lag || 0 });
    for (const [k, r] of orel) if (!crel.has(k)) logic.push({ kind: 'Removed', pred: oc.get(r.p), succ: oc.get(r.s), type: r.type || 'FS', lag: r.lag || 0 });
    const fin = (p) => { let m = null; for (const x of p.tasks) if (x.ef != null && (m == null || x.ef > m)) m = x.ef; return m; };
    const ofin = fin(other), cfin = fin(cur);
    const lateF = changed.filter((c) => c.ch.some((x) => x.f === 'Finish' && x.d > 0)).length, earlyF = changed.filter((c) => c.ch.some((x) => x.f === 'Finish' && x.d < 0)).length;
    const sum = { cur: cur.tasks.length, other: other.tasks.length, added: added.length, deleted: deleted.length, changed: changed.length, logicAdd: logic.filter((x) => x.kind === 'Added').length, logicDel: logic.filter((x) => x.kind === 'Removed').length, critIn: crit.filter((x) => x.now).length, critOut: crit.filter((x) => !x.now).length, ofin, cfin, dfin: ofin != null && cfin != null ? cfin - ofin : null, lateF, earlyF, cnt, wbsOf: cw };
    return { sum, added, deleted, changed, logic, crit, miles };
  };

  /* Wraps the baseline of cur as a pseudo-project so it can be compared like any other schedule */
  function baselineAsProject(p) {
    const q = JSON.parse(JSON.stringify({ tasks: p.tasks, rels: p.rels, wbs: p.wbs }));
    q.tasks.forEach((x) => { x.es = x.bs; x.ef = x.bf; if (x.bdur != null) x.dur = x.bdur; });
    p.tasks.forEach((x, i) => { Object.assign(q.tasks[i], { tf: x.tf, crit: x.crit, pct: x.pct, status: x.status, name: x.name, ct: x.ct, cd: x.cd }); });
    return q;
  }

  function sheets(res, cur, other, names) {
    const wb = (x) => res.sum.wbsOf(x.wbs);
    const S = [];
    const s = res.sum;
    S.push({ name: 'Summary', title: B('Schedule Comparison', 'مقارنة الجداول'), subtitle: names.cur + '  vs  ' + names.oth, cols: [{ h: 'Metric', w: 42 }, { h: 'Value', w: 22, t: 'n' }], rows: [
      ['Activities (current)', s.cur], ['Activities (compared)', s.other], ['Added', s.added], ['Deleted', s.deleted], ['Activities with changes', s.changed],
      ['Start changed', s.cnt.start], ['Finish changed', s.cnt.finish], ['Duration changed', s.cnt.dur], ['% complete changed', s.cnt.pct], ['Total float changed', s.cnt.float], ['Status changed', s.cnt.status], ['Constraint changed', s.cnt.cons],
      ['Finish later', s.lateF], ['Finish earlier', s.earlyF], ['Logic added', s.logicAdd], ['Logic removed', s.logicDel], ['Became critical', s.critIn], ['No longer critical', s.critOut],
      ['Project finish (compared)', fd(s.ofin)], ['Project finish (current)', fd(s.cfin)], ['Finish movement (days)', s.dfin == null ? '' : s.dfin]
    ] });
    S.push({ name: 'Changes', title: B('Changed activities', 'الأنشطة المتغيرة'), cols: [{ h: 'Activity ID', w: 16 }, { h: 'Activity Name', w: 44 }, { h: 'WBS', w: 14 }, { h: 'Field', w: 14 }, { h: 'Before', w: 18 }, { h: 'After', w: 18 }, { h: 'Δ (days / pts)', w: 14, t: 'n' }],
      rows: res.changed.flatMap((c) => c.ch.map((x) => { const dt = x.f === 'Start' || x.f === 'Finish'; return [c.t.code, c.t.name, wb(c.t), x.f, dt ? fd(x.a) : x.a == null ? '' : x.a, dt ? fd(x.b) : x.b == null ? '' : x.b, x.d]; })),
      fill: (r) => (r[6] > 0 && /Finish|Start|Duration/.test(r[3]) ? '#FDE2E0' : r[6] < 0 && /Finish|Start|Duration/.test(r[3]) ? '#E3F4E1' : null) });
    S.push({ name: 'Added', title: B('Activities added', 'أنشطة مضافة'), cols: [{ h: 'Activity ID', w: 16 }, { h: 'Activity Name', w: 44 }, { h: 'WBS', w: 14 }, { h: 'Start', t: 'd', w: 14 }, { h: 'Finish', t: 'd', w: 14 }, { h: 'Duration', t: 'n', w: 10 }], rows: res.added.map((x) => [x.code, x.name, wb(x), x.es, x.ef, x.dur]) });
    S.push({ name: 'Deleted', title: B('Activities deleted', 'أنشطة محذوفة'), cols: [{ h: 'Activity ID', w: 16 }, { h: 'Activity Name', w: 44 }, { h: 'Start', t: 'd', w: 14 }, { h: 'Finish', t: 'd', w: 14 }, { h: 'Duration', t: 'n', w: 10 }], rows: res.deleted.map((x) => [x.code, x.name, x.es, x.ef, x.dur]) });
    S.push({ name: 'Logic', title: B('Logic changes', 'تغييرات العلاقات'), cols: [{ h: 'Change', w: 12 }, { h: 'Predecessor', w: 18 }, { h: 'Successor', w: 18 }, { h: 'Type', w: 8 }, { h: 'Lag', t: 'n', w: 8 }], rows: res.logic.map((x) => [x.kind, x.pred, x.succ, x.type, x.lag]), fill: (r) => (r[0] === 'Added' ? '#E3F4E1' : '#FDE2E0') });
    S.push({ name: 'Critical', title: B('Critical path movement', 'تغير المسار الحرج'), cols: [{ h: 'Activity ID', w: 16 }, { h: 'Activity Name', w: 44 }, { h: 'Now', w: 18 }, { h: 'Finish', t: 'd', w: 14 }, { h: 'Total Float', t: 'n', w: 12 }], rows: res.crit.map((x) => [x.t.code, x.t.name, x.now ? 'Became critical' : 'No longer critical', x.t.ef, x.t.tf]), fill: (r) => (r[2][0] === 'B' ? '#FDE2E0' : '#E3F4E1') });
    S.push({ name: 'Milestones', title: B('Milestone slippage', 'انزلاق المعالم'), cols: [{ h: 'Milestone ID', w: 16 }, { h: 'Name', w: 44 }, { h: 'Before', t: 'd', w: 14 }, { h: 'After', t: 'd', w: 14 }, { h: 'Slip (days)', t: 'n', w: 12 }], rows: res.miles.map((x) => [x.t.code, x.t.name, x.o.ef, x.t.ef, x.d]), fill: (r) => (r[4] > 0 ? '#FDE2E0' : '#E3F4E1') });
    return S;
  }

  function view(res, names) {
    const s = res.sum, el = document.createElement('div'); el.className = 'cmp';
    const card = (n, l, cls) => `<div class="cmpc ${cls || ''}"><b>${n}</b><span>${esc(l)}</span></div>`;
    const dd = s.dfin == null ? '–' : (s.dfin > 0 ? '+' : '') + s.dfin;
    const tabs = [
      ['ch', B('Changes', 'تغييرات') + ' (' + res.changed.length + ')'], ['ad', B('Added', 'مضاف') + ' (' + res.added.length + ')'], ['de', B('Deleted', 'محذوف') + ' (' + res.deleted.length + ')'],
      ['lg', B('Logic', 'العلاقات') + ' (' + res.logic.length + ')'], ['cr', B('Critical', 'الحرج') + ' (' + res.crit.length + ')'], ['ms', B('Milestones', 'المعالم') + ' (' + res.miles.length + ')']
    ];
    const wb = (x) => s.wbsOf(x.wbs);
    const tbl = (h, rows) => `<div class="tbl-scroll"><table class="mini cmpt"><thead><tr>${h.map((x) => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.slice(0, 400).join('') || `<tr><td colspan="${h.length}" style="text-align:center;color:#888">${esc(B('Nothing here', 'لا يوجد'))}</td></tr>`}</tbody></table></div>${rows.length > 400 ? `<p class="hint">${esc(B('Showing first 400 – export to Excel for all.', 'عرض أول 400 – صدّر Excel للكل.'))}</p>` : ''}`;
    const dcell = (x) => (x.f === 'Start' || x.f === 'Finish' ? fd(x.a) + ' → ' + fd(x.b) : x.a + ' → ' + x.b);
    const body = {
      ch: () => tbl([B('Activity', 'النشاط'), B('Name', 'الاسم'), B('Field', 'الحقل'), B('Before → After', 'قبل → بعد'), 'Δ'], res.changed.flatMap((c) => c.ch.map((x) => `<tr><td>${esc(c.t.code)}</td><td>${esc(c.t.name)}</td><td>${esc(x.f)}</td><td>${esc(dcell(x))}</td><td class="${x.d > 0 ? 'cmp-bad' : x.d < 0 ? 'cmp-good' : ''}">${x.d == null ? '' : (x.d > 0 ? '+' : '') + x.d}</td></tr>`))),
      ad: () => tbl([B('Activity', 'النشاط'), B('Name', 'الاسم'), 'WBS', B('Start', 'بداية'), B('Finish', 'نهاية')], res.added.map((x) => `<tr><td>${esc(x.code)}</td><td>${esc(x.name)}</td><td>${esc(wb(x))}</td><td>${fd(x.es)}</td><td>${fd(x.ef)}</td></tr>`)),
      de: () => tbl([B('Activity', 'النشاط'), B('Name', 'الاسم'), B('Start', 'بداية'), B('Finish', 'نهاية')], res.deleted.map((x) => `<tr><td>${esc(x.code)}</td><td>${esc(x.name)}</td><td>${fd(x.es)}</td><td>${fd(x.ef)}</td></tr>`)),
      lg: () => tbl([B('Change', 'التغيير'), B('Predecessor', 'السابق'), B('Successor', 'اللاحق'), B('Type', 'النوع'), 'Lag'], res.logic.map((x) => `<tr><td class="${x.kind === 'Added' ? 'cmp-good' : 'cmp-bad'}">${x.kind}</td><td>${esc(x.pred)}</td><td>${esc(x.succ)}</td><td>${x.type}</td><td>${x.lag}</td></tr>`)),
      cr: () => tbl([B('Activity', 'النشاط'), B('Name', 'الاسم'), B('Now', 'الآن'), B('Float', 'الفلوت')], res.crit.map((x) => `<tr><td>${esc(x.t.code)}</td><td>${esc(x.t.name)}</td><td class="${x.now ? 'cmp-bad' : 'cmp-good'}">${x.now ? B('Became critical', 'أصبح حرجاً') : B('No longer critical', 'لم يعد حرجاً')}</td><td>${x.t.tf == null ? '' : x.t.tf}</td></tr>`)),
      ms: () => tbl([B('Milestone', 'المعلم'), B('Name', 'الاسم'), B('Before', 'قبل'), B('After', 'بعد'), B('Slip', 'الانزلاق')], res.miles.map((x) => `<tr><td>${esc(x.t.code)}</td><td>${esc(x.t.name)}</td><td>${fd(x.o.ef)}</td><td>${fd(x.t.ef)}</td><td class="${x.d > 0 ? 'cmp-bad' : 'cmp-good'}">${x.d > 0 ? '+' : ''}${x.d}</td></tr>`))
    };
    el.innerHTML = `<p class="hint">${esc(names.cur)} <b>vs</b> ${esc(names.oth)}</p><div class="cmpcards">${card(dd, B('Finish movement (days)', 'حركة تاريخ النهاية (يوم)'), s.dfin > 0 ? 'bad' : s.dfin < 0 ? 'good' : '')}${card(s.changed, B('Changed', 'متغير'))}${card(s.added, B('Added', 'مضاف'))}${card(s.deleted, B('Deleted', 'محذوف'))}${card(s.logicAdd + '/' + s.logicDel, B('Logic +/−', 'علاقات +/−'))}${card(s.critIn + '/' + s.critOut, B('Critical in/out', 'حرج دخل/خرج'))}</div>
      <div class="cmptabs">${tabs.map((x, i) => `<button class="btn${i ? '' : ' pri'}" data-t="${x[0]}">${esc(x[1])}</button>`).join('')}</div><div class="cmpbody"></div>`;
    const show = (k) => { el.querySelector('.cmpbody').innerHTML = body[k](); el.querySelectorAll('.cmptabs button').forEach((b) => b.classList.toggle('pri', b.dataset.t === k)); };
    el.querySelectorAll('.cmptabs button').forEach((b) => { b.onclick = () => show(b.dataset.t); });
    show('ch');
    return el;
  }

  function showResult(cur, other, names) {
    const res = P6.compare(cur, other);
    D.modal({ title: B('Schedule Comparison', 'مقارنة الجداول'), cls: 'wide dsh-modal', body: view(res, names), buttons: [
      { label: B('Export to Excel', 'تصدير Excel'), cls: 'pri', fn: () => { App.xlsxBook('Schedule-Comparison.xlsx', sheets(res, cur, other, names)); return false; } },
      { label: P6.t('close'), fn: () => {} }] });
  }

  async function fromFile(file) {
    const buf = await file.arrayBuffer(), text = P6.decodeBuffer(buf), ext = file.name.split('.').pop().toLowerCase();
    let q;
    if (ext === 'xml' || /^\s*<\?xml/.test(text)) q = P6.fromPMXML(text);
    else { const x = P6.parseXER(text), list = P6.xerProjects(x); if (list.length > 1) { const id = await D.pickProject(list, file.name); if (!id) return null; q = P6.fromXER(x, id); } else q = P6.fromXER(x, list[0] && list[0].id); }
    q.name = q.name || file.name; return q;
  }

  App.scheduleCompare = async function () {
    const cur = App.p; if (!cur) return;
    let list = []; try { list = (await App.listProjects()).filter((x) => !(cur.dbId && x.id === cur.dbId)); } catch (e) { /* ignore */ }
    const hasBl = cur.tasks.some((x) => x.bs != null);
    const body = document.createElement('div');
    body.innerHTML = `<p class="hint">${esc(B('Compare the open schedule against an earlier update, another revision or the baseline. Activities are matched by Activity ID.', 'قارن الجدول المفتوح مع تحديث سابق أو نسخة أخرى أو الـ Baseline. المطابقة بالـ Activity ID.'))}</p>
      <div class="fld"><label>${esc(B('Compare with', 'قارن مع'))}</label><select id="cmp_src"><option value="file">${esc(B('A file (XER / PMXML)…', 'ملف (XER / PMXML)…'))}</option>${list.length ? `<option value="db">${esc(B('A project in the database', 'مشروع من قاعدة البيانات'))}</option>` : ''}${hasBl ? `<option value="bl">${esc(B('Current baseline', 'الـ Baseline الحالي'))}</option>` : ''}</select></div>
      <div class="fld" id="cmp_dbw" style="display:none"><label>${esc(B('Project', 'المشروع'))}</label><select id="cmp_db">${list.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select></div>
      <div class="fld" id="cmp_fw"><label>${esc(B('File', 'الملف'))}</label><input type="file" id="cmp_f" accept=".xer,.xml"></div>`;
    const sel = body.querySelector('#cmp_src'), sw = () => { body.querySelector('#cmp_dbw').style.display = sel.value === 'db' ? '' : 'none'; body.querySelector('#cmp_fw').style.display = sel.value === 'file' ? '' : 'none'; };
    sel.onchange = sw;
    D.modal({ title: B('Schedule Comparison', 'مقارنة الجداول'), cls: 'mid', body, buttons: [{ label: P6.t('cancel'), fn: () => {} }, { label: B('Compare', 'قارن'), cls: 'pri', fn: () => {
      const v = sel.value;
      (async () => {
        try {
          let q, nm;
          if (v === 'bl') { q = baselineAsProject(cur); nm = B('Baseline', 'Baseline') + (cur.blName ? ' – ' + cur.blName : ''); }
          else if (v === 'db') { const id = body.querySelector('#cmp_db').value; q = await App.loadProject(id); nm = (list.find((x) => x.id === id) || {}).name || id; }
          else { const f = body.querySelector('#cmp_f').files[0]; if (!f) { App.toast(B('Choose a file first', 'اختر ملفاً أولاً'), true); return; } q = await fromFile(f); if (!q) return; nm = f.name; }
          if (!q) return;
          showResult(cur, q, { cur: cur.name + ' (' + B('current', 'الحالي') + ')', oth: nm });
        } catch (e) { console.error(e); App.toast(String(e.message || e), true); }
      })();
    } }] });
  };
})(window);

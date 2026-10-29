/* P6 Web – Revised schedule / revision control. A revision register (Rev 0, 1, 2…) with reason, data date, status workflow, linked EOT events,
   pre-submission checks (open ends, negative float, hard constraints, lags, out-of-sequence, actuals frozen vs the previous revision, finish vs contract + EOT),
   compact snapshots for comparison (dates / logic only – not a full restore; use Backup for that) and an optional baseline snapshot.
   The contract baseline is never overwritten. */
(function (g) {
  'use strict';
  const P6 = g.P6, App = g.App, D = App.dialogs, X = P6.delay;
  const { esc, B, clone, fin, wdays, fd, ensure } = X;
  const REASONS = [['periodic', 'Periodic update', 'تحديث دوري'], ['eot', 'Delay / EOT', 'تأخير / EOT'], ['scope', 'Scope change / variation', 'تغيير نطاق / أمر تغيير'], ['recovery', 'Recovery programme', 'برنامج استرداد'], ['request', 'Contractor request', 'طلب المقاول'], ['other', 'Other', 'أخرى']];
  const STATUSES = ['Draft', 'Submitted', 'Approved', 'Approved as Noted', 'Rejected'];
  const reasonLbl = (k) => { const r = REASONS.find((x) => x[0] === k) || REASONS[5]; return B(r[1], r[2]); };

  function snapOf(p) {
    return {
      tasks: p.tasks.map((t) => ({ id: t.id, code: t.code, name: t.name, type: t.type, wbs: t.wbs, es: t.es, ef: t.ef, dur: t.dur, tf: t.tf, crit: !!t.crit, status: t.status, pct: t.pct || 0, ct: t.ct || '', cd: t.cd == null ? null : t.cd, as: t.as, af: t.af, bs: t.bs, bf: t.bf })),
      rels: p.rels.map((r) => ({ id: r.id, p: r.p, s: r.s, type: r.type || 'FS', lag: r.lag || 0 })), wbs: p.wbs.map((w) => ({ id: w.id, parent: w.parent, code: w.code, name: w.name }))
    };
  }
  const pseudo = (rev, p) => ({ name: rev.label, tasks: rev.snap.tasks, rels: rev.snap.rels, wbs: rev.snap.wbs, cals: p.cals, defCal: p.defCal });

  /* pre-submission checks: [{ id, label, pass, detail, items }] */
  X.revChecks = function (p) {
    const S = ensure(p), DA = P6.dash, dc = DA.dcma(p, p.tasks), c = (n) => dc.checks.find((x) => x.n === n);
    const out = [], add = (id, label, pass, detail) => out.push({ id, label, pass, detail });
    const lg = c(1); add('logic', B('No open ends (logic)', 'لا نهايات مفتوحة (المنطق)'), lg.items.length === 0, lg.items.length + ' ' + B('activities', 'نشاط'));
    const ng = c(7); add('negfloat', B('No negative float', 'لا فلوت سالب'), ng.items.length === 0, ng.items.length + ' ' + B('activities', 'نشاط'));
    const hc = c(5); add('constraints', B('No hard constraints', 'لا قيود صلبة'), hc.items.length === 0, hc.items.length);
    const bigLag = p.rels.filter((r) => (r.lag || 0) > 20 || (r.lag || 0) < 0); add('lags', B('Lags ≤ 20 days and no leads', 'Lag ≤ 20 يوم ولا leads'), bigLag.length === 0, bigLag.length + ' ' + B('relationships', 'علاقة'));
    const iv = c(9); add('dates', B('Actuals consistent with the data date', 'الفعلي متسق مع تاريخ البيانات'), iv.items.length === 0, iv.items.length + ' ' + B('activities', 'نشاط'));
    const oos = P6.oosDetect(p); add('oos', B('No out-of-sequence progress', 'لا تقدم خارج التسلسل'), oos.length === 0, oos.length + ' ' + B('relationships', 'علاقة'));
    const prev = (p.revs || []).filter((r) => r.snap).slice(-1)[0];
    if (prev) {
      const pm = new Map(prev.snap.tasks.map((t) => [t.id, t])), bad = [];
      for (const t of p.tasks) { const o = pm.get(t.id); if (!o) continue; if ((o.status === 'C' && (t.status !== 'C' || t.af !== o.af || t.as !== o.as)) || (o.as != null && t.as !== o.as)) bad.push(t); }
      add('frozen', B('Actuals unchanged vs ' + prev.label + ' (frozen)', 'الفعلي لم يتغير مقارنة بـ ' + prev.label + ' (مجمّد)'), bad.length === 0, bad.length + ' ' + B('activities changed', 'نشاط تغيّر'));
    }
    const cal = p.cals.find((x) => x.id === p.defCal) || p.cals[0], allowed = S.contractFinish != null ? P6.shift(cal, S.contractFinish, S.events.reduce((n, e) => n + (e.status !== 'Rejected' ? +e.approved || 0 : 0), 0)) : null, f = fin((() => { const t = clone(p); P6.schedule(t); return t; })());
    if (allowed != null) add('finish', B('Finish ≤ contract completion + approved EOT', 'النهاية ≤ الإنجاز التعاقدي + EOT المعتمد'), f <= allowed, fd(f) + ' vs ' + fd(allowed) + (f > allowed ? ' (+' + wdays(p, allowed, f) + ' wd)' : ''));
    return out;
  };

  function showCompare(p, a, b, nameA, nameB) {
    const res = P6.compare(a, b), el = P6.compare.view(res, { cur: nameA, oth: nameB });
    D.modal({ title: B('Revision comparison', 'مقارنة المراجعات'), cls: 'wide dsh-modal', body: el, buttons: [{ label: B('Export to Excel', 'تصدير Excel'), cls: 'pri', fn: () => { App.xlsxBook('Revision-Comparison.xlsx', P6.compare.sheets(res, a, b, { cur: nameA, oth: nameB })); return false; } }, { label: P6.t('close'), fn: () => {} }] });
  }

  function createDialog(done) {
    const p = App.p, S = ensure(p), n = (p.revs.reduce((m, r) => Math.max(m, r.no), -1)) + 1, checks = X.revChecks(p), fails = checks.filter((c) => !c.pass);
    const body = document.createElement('div'); body.className = 'wif'; body.dir = P6.dir();
    body.innerHTML = `<div class="dly-form"><label>${esc(B('Revision', 'المراجعة'))}<input id="r_lab" value="Rev ${n}"></label><label>${esc(B('Reason', 'السبب'))}<select id="r_rs">${REASONS.map((r) => `<option value="${r[0]}">${esc(B(r[1], r[2]))}</option>`).join('')}</select></label><label>${esc(B('Prepared by', 'أعدّه'))}<input id="r_by" value="${esc((S.meta && S.meta.by) || '')}"></label><label class="w3">${esc(B('Description of changes', 'وصف التغييرات'))}<textarea id="r_txt" rows="2"></textarea></label></div>
      <h4>${esc(B('Linked EOT events', 'أحداث EOT المرتبطة'))}</h4><div>${S.events.map((e) => `<label style="margin-inline-end:12px"><input type="checkbox" class="r_ev" value="${esc(e.id)}"> ${esc(e.id)}</label>`).join('') || `<span class="hint">–</span>`}</div>
      <h4>${esc(B('Pre-submission checks', 'فحوصات ما قبل التقديم'))}</h4><table class="mini cmpt"><tbody>${checks.map((c) => `<tr><td>${c.pass ? '✅' : '⚠️'}</td><td>${esc(c.label)}</td><td class="${c.pass ? 'cmp-good' : 'cmp-bad'}">${esc(String(c.detail))}</td></tr>`).join('')}</tbody></table>
      ${fails.length ? `<label class="cmp-bad"><input type="checkbox" id="r_sign"> ${esc(B('I sign off the exceptions above', 'أقرّ بالاستثناءات أعلاه'))}</label>` : ''}
      <h4>${esc(B('Baseline', 'الـ Baseline'))}</h4><label><input type="checkbox" id="r_bl"> ${esc(B('Also save this revision as a baseline snapshot (the contract baseline is kept)', 'احفظ هذه المراجعة كـ baseline أيضاً (الـ baseline التعاقدي يبقى)'))}</label><br><label><input type="checkbox" id="r_blact"> ${esc(B('…and make it the active baseline', '…واجعله الـ baseline النشط'))}</label>`;
    D.modal({ title: B('Create revision', 'إنشاء مراجعة'), cls: 'wide dsh-modal', body, sticky: true, buttons: [{ label: P6.t('cancel'), fn: () => {} }, { label: B('Create', 'إنشاء'), cls: 'pri', fn: () => {
      if (fails.length && !body.querySelector('#r_sign').checked) { App.toast(B('Tick the sign-off for the failed checks', 'أقرّ بالفحوصات الفاشلة أولاً'), true); return false; }
      const label = body.querySelector('#r_lab').value.trim() || 'Rev ' + n;
      if (p.revs.some((r) => r.label === label)) { App.toast(B('Revision label already used', 'اسم المراجعة مستخدم'), true); return false; }
      if (!p.imported) { /* schedule is current */ }
      const f = fin((() => { const t = clone(p); P6.schedule(t); return t; })()), now = new Date();
      const rev = { no: n, label, date: now.toLocaleDateString('en-GB'), dataDate: p.dataDate, finish: f, reason: body.querySelector('#r_rs').value, reasonText: body.querySelector('#r_txt').value, by: body.querySelector('#r_by').value, status: 'Draft', events: [...body.querySelectorAll('.r_ev:checked')].map((x) => x.value), checks: checks.map((c) => ({ id: c.id, pass: c.pass, detail: String(c.detail) })), exceptions: fails.length, log: [{ date: now.toLocaleString('en-GB'), status: 'Draft', comment: '' }], snap: snapOf(p) };
      if (body.querySelector('#r_bl').checked) { const bl = P6.snapshotBaseline(p, label, P6.metrics(p)); p.baselines.push(bl); rev.baselineId = bl.id; if (body.querySelector('#r_blact').checked) P6.assignBaseline(p, bl.id); }
      p.revs.push(rev); p.meta = p.meta || {}; p.meta.rev = label; X.save(); App.refresh(); done(); App.toast(B(label + ' created', 'تم إنشاء ' + label));
    } }] });
  }

  function statusDialog(rev, done) {
    const body = document.createElement('div'); body.className = 'wif'; body.dir = P6.dir();
    body.innerHTML = `<div class="dly-form"><label>${esc(B('Status', 'الحالة'))}<select id="s_st">${STATUSES.map((s) => `<option${s === rev.status ? ' selected' : ''}>${s}</option>`).join('')}</select></label><label class="w2">${esc(B('Comment / reference', 'تعليق / مرجع'))}<input id="s_c"></label></div>`;
    D.modal({ title: rev.label + ' – ' + B('status', 'الحالة'), cls: 'mid', body, buttons: [{ label: P6.t('cancel'), fn: () => {} }, { label: B('Save', 'حفظ'), cls: 'pri', fn: () => { rev.status = body.querySelector('#s_st').value; rev.log.push({ date: new Date().toLocaleString('en-GB'), status: rev.status, comment: body.querySelector('#s_c').value }); X.save(); done(); } }] });
  }

  X.tabs.push({ id: 'revisions', label: () => B('Revisions', 'المراجعات'), render(el, redo) {
    const p = App.p; ensure(p);
    const revs = p.revs.slice().sort((a, b) => a.no - b.no);
    el.innerHTML = `<div class="dly-bar"><button class="btn pri" id="rv_new">+ ${esc(B('Create revision from current schedule', 'إنشاء مراجعة من الجدول الحالي'))}</button><button class="btn" id="rv_chk">${esc(B('Run pre-submission checks', 'تشغيل فحوصات ما قبل التقديم'))}</button><button class="btn" id="rv_xl"${revs.length ? '' : ' disabled'}>${esc(B('Export register to Excel', 'تصدير السجل إلى Excel'))}</button></div>
      <div class="tbl-scroll" style="max-height:44vh"><table class="mini cmpt"><thead><tr><th>${esc(B('Revision', 'المراجعة'))}</th><th>${esc(B('Date', 'التاريخ'))}</th><th>${esc(B('Data date', 'تاريخ البيانات'))}</th><th>${esc(B('Completion', 'الإنجاز'))}</th><th>${esc(B('Δ vs previous (wd)', 'Δ عن السابقة'))}</th><th>${esc(B('Reason', 'السبب'))}</th><th>${esc(B('EOT', 'EOT'))}</th><th>${esc(B('Checks', 'الفحوصات'))}</th><th>${esc(B('Status', 'الحالة'))}</th><th></th></tr></thead><tbody>${revs.map((r, i) => `<tr data-no="${r.no}"><td><b>${esc(r.label)}</b>${r.baselineId ? ' <span class="dsh-chip">BL</span>' : ''}</td><td>${esc(r.date)}</td><td>${fd(r.dataDate)}</td><td>${fd(r.finish)}</td><td class="r ${i && wdays(p, revs[i - 1].finish, r.finish) > 0 ? 'cmp-bad' : ''}">${i ? (wdays(p, revs[i - 1].finish, r.finish) > 0 ? '+' : '') + wdays(p, revs[i - 1].finish, r.finish) : '–'}</td><td>${esc(reasonLbl(r.reason))}${r.reasonText ? ' – ' + esc(r.reasonText) : ''}</td><td>${esc((r.events || []).join(', '))}</td><td>${r.exceptions ? '⚠️ ' + r.exceptions : '✅'}</td><td>${esc(r.status)}</td><td style="white-space:nowrap"><button class="btn" data-a="st">${esc(B('Status', 'الحالة'))}</button> <button class="btn" data-a="cur">${esc(B('vs current', 'مقابل الحالي'))}</button>${i ? ` <button class="btn" data-a="prev">${esc(B('vs previous', 'مقابل السابقة'))}</button>` : ''} <button class="btn" data-a="del">✕</button></td></tr>`).join('') || `<tr><td colspan="10" style="text-align:center;color:#888">${esc(B('No revisions yet. Create Rev 0 from the approved baseline schedule, then one revision per update / EOT / recovery.', 'لا مراجعات بعد. أنشئ Rev 0 من الجدول المعتمد ثم مراجعة لكل تحديث / EOT / استرداد.'))}</td></tr>`}</tbody></table></div>
      <div id="rv_out"></div>
      <p class="hint">${esc(B('Revisions keep dates and logic for comparison and for the windows analysis (EOT tab) – they are not a full restore; use Projects ▸ Backup for that. Actuals must not change between revisions (checked). The contract baseline is never overwritten.', 'المراجعات تحفظ التواريخ والمنطق للمقارنة ولتحليل النوافذ (تبويب EOT) – وليست نسخة استعادة كاملة؛ استخدم Backup لذلك. يجب ألا يتغير الفعلي بين المراجعات (يُفحص). الـ baseline التعاقدي لا يُستبدل أبداً.'))}</p>`;
    const $ = (s) => el.querySelector(s);
    $('#rv_new').onclick = () => createDialog(redo);
    $('#rv_chk').onclick = () => { const cs = X.revChecks(p); $('#rv_out').innerHTML = `<table class="mini cmpt"><tbody>${cs.map((c) => `<tr><td>${c.pass ? '✅' : '⚠️'}</td><td>${esc(c.label)}</td><td class="${c.pass ? 'cmp-good' : 'cmp-bad'}">${esc(String(c.detail))}</td></tr>`).join('')}</tbody></table>`; };
    el.querySelectorAll('tbody tr[data-no]').forEach((tr) => {
      const idx = revs.findIndex((r) => r.no === +tr.dataset.no), r = revs[idx];
      tr.querySelectorAll('[data-a]').forEach((b) => { b.onclick = (ev) => { ev.stopPropagation(); const a = b.dataset.a;
        if (a === 'st') statusDialog(r, redo);
        else if (a === 'cur') showCompare(p, p, pseudo(r, p), p.name + ' (' + B('current', 'الحالي') + ')', r.label);
        else if (a === 'prev') showCompare(p, pseudo(r, p), pseudo(revs[idx - 1], p), r.label, revs[idx - 1].label);
        else if (a === 'del') { if (confirm(B('Delete ' + r.label + '? (the baseline snapshot, if any, is kept)', 'حذف ' + r.label + '؟ (الـ baseline إن وُجد يبقى)'))) { p.revs = p.revs.filter((x) => x !== r); X.save(); redo(); } }
      }; });
    });
    $('#rv_xl').onclick = () => App.xlsxBook('Revision-Register.xlsx', [
      { name: 'Register', title: B('Revision register', 'سجل المراجعات'), subtitle: p.name, cols: [{ h: 'Revision', w: 12 }, { h: 'Date', w: 12 }, { h: 'Data date', t: 'd', w: 14 }, { h: 'Completion', t: 'd', w: 14 }, { h: 'Reason', w: 24 }, { h: 'Description', w: 40 }, { h: 'Prepared by', w: 16 }, { h: 'EOT events', w: 22 }, { h: 'Check exceptions', t: 'n', w: 12 }, { h: 'Status', w: 16 }], rows: revs.map((r) => [r.label, r.date, r.dataDate, r.finish, reasonLbl(r.reason), r.reasonText, r.by, (r.events || []).join(', '), r.exceptions || 0, r.status]) },
      { name: 'Status log', title: B('Approval log', 'سجل الاعتماد'), cols: [{ h: 'Revision', w: 12 }, { h: 'Date', w: 22 }, { h: 'Status', w: 18 }, { h: 'Comment', w: 50 }], rows: revs.flatMap((r) => (r.log || []).map((l) => [r.label, l.date, l.status, l.comment])) },
      { name: 'Checks', title: B('Pre-submission checks', 'فحوصات ما قبل التقديم'), cols: [{ h: 'Revision', w: 12 }, { h: 'Check', w: 22 }, { h: 'Result', w: 10 }, { h: 'Detail', w: 40 }], rows: revs.flatMap((r) => (r.checks || []).map((c) => [r.label, c.id, c.pass ? 'PASS' : 'FAIL', c.detail])), fill: (r) => (r[2] === 'FAIL' ? '#FDE2E0' : null) }
    ]);
  } });
})(window);

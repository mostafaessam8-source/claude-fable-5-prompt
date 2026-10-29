/* P6 Web – Fix Out-of-Sequence. Detects progress recorded out of sequence per relationship type (FS/SS/FF/SF, with lag), shows what P6 would do under
   Retained Logic / Progress Override, proposes a correction per case, previews the impact on a copy and applies the chosen fixes with an audit log
   (p.oosLog) that can be exported for claims. Never deletes logic automatically. Loop and duplicate checks protect the network. */
(function (g) {
  'use strict';
  const P6 = g.P6, App = g.App, X = P6.delay;
  const { esc, B, clone, fin, wdays, fd, ensure } = X;

  /* detection: returns [{ r, P, S, sev, kase, why, fix }] */
  P6.oosDetect = function (p, opt) {
    opt = Object.assign({ skipHammock: true }, opt);
    const by = new Map(p.tasks.map((t) => [t.id, t])), out = [], dd = p.dataDate;
    const started = (t) => t.status !== 'NS' && (t.as != null || t.status === 'C'), done = (t) => t.status === 'C';
    for (const r of p.rels) {
      const Pt = by.get(r.p), St = by.get(r.s); if (!Pt || !St) continue;
      if (opt.skipHammock && (P6.isHammock(Pt) || P6.isHammock(St))) continue;
      if (done(Pt) && done(St)) continue;
      const type = r.type || 'FS', lag = r.lag || 0; let kase = null, sev = 0, why = '';
      if (type === 'FS') {
        if (started(St) && !done(Pt)) { kase = Pt.status === 'NS' ? 'pred-not-started' : 'pred-partial'; sev = done(St) ? 5 : Pt.status === 'NS' ? 4 : 3; why = B('Successor started while the predecessor is ' + (Pt.status === 'NS' ? 'not started' : 'unfinished'), 'اللاحق بدأ بينما السابق ' + (Pt.status === 'NS' ? 'لم يبدأ' : 'لم ينتهِ')); }
        else if (started(St) && done(Pt) && Pt.af != null && St.as != null && St.as < Pt.af + (lag > 0 ? lag : 0) + (lag < 0 ? lag : 0)) { kase = 'date'; sev = 2; why = B('Successor started before the predecessor finished (+lag)', 'اللاحق بدأ قبل انتهاء السابق (+lag)'); }
      } else if (type === 'SS') {
        if (started(St) && !started(Pt)) { kase = 'pred-not-started'; sev = done(St) ? 5 : 4; why = B('Successor started but the predecessor has not', 'اللاحق بدأ والسابق لم يبدأ'); }
        else if (started(St) && Pt.as != null && St.as != null && St.as < Pt.as + lag) { kase = 'date'; sev = 2; why = B('Successor started before predecessor start + lag', 'اللاحق بدأ قبل بداية السابق + lag'); }
      } else if (type === 'FF') {
        if (done(St) && !done(Pt)) { kase = 'succ-done-pred-open'; sev = 5; why = B('Successor completed while the predecessor is incomplete', 'اللاحق اكتمل والسابق غير مكتمل'); }
        else if (done(St) && done(Pt) && St.af != null && Pt.af != null && St.af < Pt.af + lag) { kase = 'date'; sev = 2; why = B('Successor finished before predecessor finish + lag', 'اللاحق انتهى قبل نهاية السابق + lag'); }
      } else if (type === 'SF') {
        if (done(St) && !started(Pt)) { kase = 'succ-done-pred-open'; sev = 5; why = B('Successor completed but the predecessor has not started', 'اللاحق اكتمل والسابق لم يبدأ'); }
        else if (done(St) && Pt.as != null && St.af != null && St.af < Pt.as + lag) { kase = 'date'; sev = 2; why = B('Successor finished before predecessor start + lag', 'اللاحق انتهى قبل بداية السابق + lag'); }
      }
      if (!kase) continue;
      // default fix per the planner guidance: only FS with a partly-done predecessor is auto-suggested; everything else is reviewed by a person
      const fix = type === 'FS' && kase === 'pred-partial' ? 'ss' : 'keep';
      out.push({ r, P: Pt, S: St, sev, kase, why, fix, type, lag });
    }
    return out.sort((a, b) => b.sev - a.sev || (a.S.as || 0) - (b.S.as || 0));
  };
  void 0;

  const ACT = { keep: () => B('Keep (document)', 'إبقاء (مع التوثيق)'), ss: () => B('FS → SS (keep lag)', 'FS → SS (مع نفس الـ lag)'), ssff: () => B('SS + FF pair', 'زوج SS + FF'), del: () => B('Delete logic', 'حذف العلاقة') };
  const REASON = [['data', 'Actual dates wrong – corrected', 'التواريخ الفعلية خاطئة – تم تصحيحها'], ['logic', 'Logic was wrong', 'المنطق كان خاطئاً'], ['overlap', 'Genuine overlap in the field', 'تداخل فعلي في الموقع'], ['other', 'Other', 'أخرى']];

  function applyFix(p, o, act) {
    const r = p.rels.find((q) => q.id === o.r.id); if (!r) return null;
    const old = (r.type || 'FS') + (r.lag ? ' ' + r.lag : '');
    if (act === 'del') { p.rels = p.rels.filter((q) => q !== r); return { from: old, to: B('deleted', 'محذوفة') }; }
    if (act === 'ss' || act === 'ssff') {
      if (p.rels.some((q) => q !== r && q.p === r.p && q.s === r.s && q.type === 'SS')) return { skipped: B('SS already exists between the pair', 'يوجد SS بين النشاطين بالفعل') };
      const wasFS = (r.type || 'FS') === 'FS'; r.type = 'SS';
      let to = 'SS' + (r.lag ? ' ' + r.lag : '');
      if ((act === 'ssff' || wasFS) && act === 'ssff' && !p.rels.some((q) => q.p === r.p && q.s === r.s && q.type === 'FF')) { p.rels.push({ id: P6.nextId(p), p: r.p, s: r.s, type: 'FF', lag: 0 }); to += ' + FF 0'; }
      return { from: old, to };
    }
    return null;
  }

  X.tabs.push({ id: 'oos', label: () => B('Fix Out-of-Sequence', 'تصحيح الأوت أوف سيكونس'), render(el, redo) {
    const p = App.p; ensure(p);
    const rows = P6.oosDetect(p), act = new Map(rows.map((o) => [o.r.id, o.fix])), why = new Map(rows.map((o) => [o.r.id, 'data'])), cm = new Map();
    const finNow = fin((() => { const t = clone(p); P6.schedule(t); return t; })());
    const optFin = (logic) => { const t = clone(p); t.schedOpts = Object.assign({ logic: 'retained', crit: 'tf', critFloat: 0, lagCal: 'pred', tfMode: 'finish', openCrit: false }, t.schedOpts, { logic }); t.retained = logic !== 'override'; P6.schedule(t); return fin(t); };
    const fRet = optFin('retained'), fOvr = optFin('override'), curLogic = (p.schedOpts && p.schedOpts.logic) || (p.retained === false ? 'override' : 'retained');
    const sevN = (s) => rows.filter((o) => o.sev === s).length;
    const sevChip = (s) => `<span class="dsh-chip" style="background:${s >= 5 ? '#c0392b' : s === 4 ? '#e67e22' : s === 3 ? '#d4ac0d' : '#7f8c8d'}22">${['', '', B('Low', 'منخفض'), B('Medium', 'متوسط'), B('High', 'مرتفع'), B('Critical', 'حرج')][s]}</span>`;
    el.innerHTML = `<div class="cmpcards"><div class="cmpc ${rows.length ? 'bad' : 'good'}"><b>${rows.length}</b><span>${esc(B('Out-of-sequence relationships', 'علاقات خارج التسلسل'))}</span></div><div class="cmpc"><b>${sevN(5)}</b><span>${esc(B('Critical', 'حرج'))}</span></div><div class="cmpc"><b>${sevN(4)}</b><span>${esc(B('High', 'مرتفع'))}</span></div><div class="cmpc"><b>${sevN(3) + sevN(2)}</b><span>${esc(B('Medium / low', 'متوسط / منخفض'))}</span></div></div>
      <div class="tbl-scroll" style="max-height:130px;margin-bottom:8px"><table class="mini cmpt"><thead><tr><th>${esc(B('Scheduling option (what P6 does with OOS progress)', 'خيار الجدولة (تعامل P6 مع التقدم خارج التسلسل)'))}</th><th>${esc(B('Project finish', 'نهاية المشروع'))}</th><th></th></tr></thead><tbody>
      <tr><td><b>Retained Logic</b> – ${esc(B('remaining work of the OOS successor waits for its predecessor (conservative)', 'العمل المتبقي للاحق ينتظر السابق (متحفظ)'))}</td><td>${fd(fRet)}</td><td>${curLogic === 'retained' ? '✓ ' + esc(B('current', 'الحالي')) : `<button class="btn" data-lg="retained">${esc(B('Use', 'استخدم'))}</button>`}</td></tr>
      <tr><td><b>Progress Override</b> – ${esc(B('remaining work ignores the OOS logic (can shorten the finish; logic is silently lost)', 'العمل المتبقي يتجاهل المنطق (قد يقصّر النهاية؛ ويضيع المنطق صامتاً)'))}</td><td>${fd(fOvr)}${fOvr !== fRet ? ' (' + (wdays(p, fRet, fOvr) > 0 ? '+' : '') + wdays(p, fRet, fOvr) + ' wd)' : ''}</td><td>${curLogic === 'override' ? '✓ ' + esc(B('current', 'الحالي')) : `<button class="btn" data-lg="override">${esc(B('Use', 'استخدم'))}</button>`}</td></tr></tbody></table></div>
      ${rows.length ? `<div class="dly-bar"><button class="btn" id="oo_auto">${esc(B('Reset to suggested fixes', 'العودة للإصلاحات المقترحة'))}</button><button class="btn" id="oo_prev">${esc(B('Preview impact', 'معاينة الأثر'))}</button><button class="btn pri" id="oo_apply">${esc(B('Apply selected fixes', 'طبّق الإصلاحات المختارة'))}</button><span id="oo_imp"></span></div>
      <div class="tbl-scroll" style="max-height:38vh"><table class="mini cmpt"><thead><tr><th>${esc(B('Severity', 'الخطورة'))}</th><th>${esc(B('Predecessor', 'السابق'))}</th><th>${esc(B('Pred. status', 'حالة السابق'))}</th><th>${esc(B('Rel.', 'العلاقة'))}</th><th>${esc(B('Successor', 'اللاحق'))}</th><th>${esc(B('Succ. actuals', 'فعلي اللاحق'))}</th><th>${esc(B('Issue', 'المشكلة'))}</th><th>${esc(B('Fix', 'الإصلاح'))}</th><th>${esc(B('Reason', 'السبب'))}</th><th>${esc(B('Comment', 'تعليق'))}</th></tr></thead><tbody>${rows.slice(0, 400).map((o) => `<tr data-id="${o.r.id}"><td>${sevChip(o.sev)}</td><td>${esc(o.P.code)} – ${esc(o.P.name)}</td><td>${esc(o.P.status)}${o.P.status === 'IP' ? ' ' + (o.P.pct || 0) + '%' : ''}</td><td>${o.type}${o.lag ? ' ' + (o.lag > 0 ? '+' : '') + o.lag : ''}</td><td>${esc(o.S.code)} – ${esc(o.S.name)}</td><td>${o.S.as != null ? fd(o.S.as) : ''}${o.S.af != null ? ' → ' + fd(o.S.af) : ''}</td><td>${esc(o.why)}</td><td><select class="oo_a">${Object.keys(ACT).map((k) => `<option value="${k}"${act.get(o.r.id) === k ? ' selected' : ''}>${esc(ACT[k]())}</option>`).join('')}</select></td><td><select class="oo_r">${REASON.map((x) => `<option value="${x[0]}">${esc(B(x[1], x[2]))}</option>`).join('')}</select></td><td><input class="oo_c" style="width:130px"></td></tr>`).join('')}</tbody></table></div>
      <p class="hint">${esc(B('Suggested: FS → SS only where the predecessor is partly done. Everything else is left to your judgement – fix the actual dates if they are wrong, delete the logic only if it was wrong. FS → SS drops the finish constraint: use "SS + FF pair" to keep it.', 'المقترح: تحويل FS إلى SS فقط حيث السابق منفّذ جزئياً. الباقي بحكمك – صحّح التواريخ الفعلية إن كانت خاطئة، واحذف العلاقة فقط إن كان المنطق خاطئاً. تحويل FS إلى SS يُسقط قيد النهاية: استخدم "زوج SS + FF" للإبقاء عليه.'))}</p>` : `<p class="hint">✓ ${esc(B('No out-of-sequence progress found.', 'لا يوجد تقدم خارج التسلسل.'))}</p>`}
      <h4>${esc(B('Audit log', 'سجل التعديلات'))} (${p.oosLog.length}) <button class="btn" id="oo_xl"${p.oosLog.length ? '' : ' disabled'}>${esc(B('Export to Excel', 'تصدير Excel'))}</button></h4>
      <div class="tbl-scroll" style="max-height:20vh"><table class="mini cmpt"><thead><tr><th>${esc(B('Date', 'التاريخ'))}</th><th>${esc(B('Predecessor → Successor', 'السابق ← اللاحق'))}</th><th>${esc(B('Change', 'التغيير'))}</th><th>${esc(B('Reason', 'السبب'))}</th><th>${esc(B('Comment', 'تعليق'))}</th><th>${esc(B('Finish before → after', 'النهاية قبل ← بعد'))}</th></tr></thead><tbody>${p.oosLog.slice().reverse().slice(0, 200).map((l) => `<tr><td>${esc(l.ts)}</td><td>${esc(l.pred)} → ${esc(l.succ)}</td><td>${esc(l.from)} → ${esc(l.to)}</td><td>${esc(l.reason)}</td><td>${esc(l.comment || '')}</td><td>${esc(l.finBefore)} → ${esc(l.finAfter)}</td></tr>`).join('') || `<tr><td colspan="6" style="color:#888;text-align:center">–</td></tr>`}</tbody></table></div>`;
    const $ = (s) => el.querySelector(s);
    const collect = () => { el.querySelectorAll('tbody tr[data-id]').forEach((tr) => { const id = +tr.dataset.id; act.set(id, tr.querySelector('.oo_a').value); why.set(id, tr.querySelector('.oo_r').value); cm.set(id, tr.querySelector('.oo_c').value); }); };
    el.querySelectorAll('[data-lg]').forEach((b) => { b.onclick = () => { App.mutate(B('Scheduling option', 'خيار الجدولة'), () => { p.schedOpts = Object.assign({ logic: 'retained', crit: 'tf', critFloat: 0, lagCal: 'pred', tfMode: 'finish', openCrit: false }, p.schedOpts, { logic: b.dataset.lg }); p.retained = b.dataset.lg !== 'override'; }); redo(); }; });
    if (rows.length) {
      $('#oo_auto').onclick = () => { rows.forEach((o) => act.set(o.r.id, o.fix)); el.querySelectorAll('.oo_a').forEach((s) => { s.value = act.get(+s.closest('tr').dataset.id); }); };
      const trial = () => { collect(); const t = clone(p); let n = 0, skip = []; for (const o of rows) { const a = act.get(o.r.id); if (a && a !== 'keep') { const rs = applyFix(t, o, a); if (rs && rs.skipped) skip.push(o.P.code + '→' + o.S.code + ': ' + rs.skipped); else n++; } } P6.schedule(t); return { t, n, skip }; };
      $('#oo_prev').onclick = () => { const { t, n, skip } = trial(), loops = t.loops && t.loops.length, after = fin(t), left = P6.oosDetect(t).length; $('#oo_imp').innerHTML = `<b>${n}</b> ${esc(B('fixes', 'إصلاح'))} → ${esc(B('finish', 'النهاية'))} ${fd(finNow)} → <b class="${after > finNow ? 'cmp-bad' : 'cmp-good'}">${fd(after)}</b> (${wdays(p, finNow, after) > 0 ? '+' : ''}${wdays(p, finNow, after)} wd) · ${esc(B('OOS left', 'متبقي OOS'))}: ${left}${loops ? ' · <span class="cmp-bad">⚠ ' + esc(B('creates a loop – blocked', 'يسبب حلقة – ممنوع')) + '</span>' : ''}${skip.length ? ' · ' + esc(skip.join('; ')) : ''}`; };
      $('#oo_apply').onclick = () => {
        const { t, n, skip } = trial(); if (t.loops && t.loops.length) return App.toast(B('These fixes create a logic loop – not applied', 'هذه الإصلاحات تسبب حلقة منطقية – لم تُطبّق'), true);
        const todo = rows.filter((o) => act.get(o.r.id) && act.get(o.r.id) !== 'keep'), kept = rows.filter((o) => act.get(o.r.id) === 'keep' && (cm.get(o.r.id) || why.get(o.r.id) !== 'data'));
        if (!todo.length && !kept.length) return App.toast(B('No fixes selected', 'لم تُختر إصلاحات'), true);
        const before = finNow, ts = new Date().toLocaleString('en-GB'), logs = [], rl = new Map(REASON.map((x) => [x[0], B(x[1], x[2])]));
        App.mutate(B('Fix out-of-sequence logic', 'تصحيح منطق الأوت أوف سيكونس'), () => {
          for (const o of todo) { const rs = applyFix(App.p, o, act.get(o.r.id)); if (rs && !rs.skipped) logs.push({ ts, pred: o.P.code, succ: o.S.code, from: rs.from, to: rs.to, reason: rl.get(why.get(o.r.id)), comment: cm.get(o.r.id) || '' }); }
          for (const o of kept) logs.push({ ts, pred: o.P.code, succ: o.S.code, from: o.type + (o.lag ? ' ' + o.lag : ''), to: B('kept', 'أُبقيت'), reason: rl.get(why.get(o.r.id)), comment: cm.get(o.r.id) || '' });
        });
        const after = fin(App.p); logs.forEach((l) => { l.finBefore = fd(before); l.finAfter = fd(after); }); App.p.oosLog = (App.p.oosLog || []).concat(logs); X.save();
        if (!App.cfg.auto) App.runSchedule();
        App.toast(B(n + ' fixes applied (logged)', 'تم تطبيق ' + n + ' إصلاح (موثّق)') + (skip.length ? ' – ' + skip.length + ' ' + B('skipped', 'تُخطّي') : '')); redo();
      };
    }
    const xl = $('#oo_xl'); if (xl) xl.onclick = () => App.xlsxBook('OOS-Fix-Log.xlsx', [{ name: 'OOS fixes', title: B('Out-of-sequence fix log', 'سجل تصحيح الأوت أوف سيكونس'), subtitle: p.name, cols: [{ h: 'Date', w: 20 }, { h: 'Predecessor', w: 16 }, { h: 'Successor', w: 16 }, { h: 'From', w: 14 }, { h: 'To', w: 16 }, { h: 'Reason', w: 32 }, { h: 'Comment', w: 40 }, { h: 'Finish before', w: 14 }, { h: 'Finish after', w: 14 }], rows: p.oosLog.map((l) => [l.ts, l.pred, l.succ, l.from, l.to, l.reason, l.comment, l.finBefore, l.finAfter]) }]);
  } });
})(window);

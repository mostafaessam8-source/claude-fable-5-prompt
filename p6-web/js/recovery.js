/* P6 Web – Recovery schedule. Given a target finish, finds the recovery actions that really bring the finish back (each action is tested by re-scheduling a copy)
   and builds an action register: logic clean-up (remove lags), fast-tracking (FS → SS + lag with an FF tail) and duration compression (with a cost premium).
   Greedy: best real-days-gained per unit of risk/cost first, repeated until the target is met or nothing helps. Gains are cumulative, not additive.
   Output: before/after, required vs achievable days, action register (owner / due), apply to the schedule, save as What-If scenario, Excel. */
(function (g) {
  'use strict';
  const P6 = g.P6, App = g.App, X = P6.delay;
  const { esc, B, clone, fin, wdays, fd, pd, ensure } = X;
  const RISK = { logic: 1, compress: 2, fast: 3 };
  const LV = { logic: () => B('Logic clean-up', 'تنظيف المنطق'), fast: () => B('Fast-track', 'تداخل (Fast-track)'), compress: () => B('Compress duration', 'ضغط المدة') };

  P6.recoveryPlan = function (p, o) {
    o = Object.assign({ target: null, overlapPct: 50, tail: 2, compressPct: 20, minDur: 1, premium: 25, levers: { logic: true, fast: true, compress: true }, nearFloat: 5, maxActions: 25, maxMs: 9000 }, o);
    const t0 = Date.now(), touched = new Set(), M = P6.metrics(p), cost = (id) => { const m = M.T.get(id); return m ? m.bc || 0 : 0; };
    let T = clone(p); P6.schedule(T); const F0 = fin(T); let Fc = F0;
    const gap0 = o.target != null ? wdays(p, o.target, F0) : 0, actions = []; let timedOut = false;
    while (actions.length < o.maxActions && (o.target == null || Fc > o.target)) {
      if (Date.now() - t0 > o.maxMs) { timedOut = true; break; }
      const open = T.tasks.filter((t) => t.status !== 'C' && !P6.isHammock(t) && t.tf != null && t.tf <= o.nearFloat).sort((a, b) => a.tf - b.tf).slice(0, 60), ids = new Set(open.map((t) => t.id)), by = new Map(T.tasks.map((t) => [t.id, t]));
      const cands = [];
      if (o.levers.logic) for (const r of T.rels) if ((r.lag || 0) > 0 && ids.has(r.s) && !touched.has(r.p + '>' + r.s)) { const a = by.get(r.p), b = by.get(r.s); cands.push({ key: r.p + '>' + r.s, lever: 'logic', op: { k: 'rel', from: a.code, to: b.code, type: r.type || 'FS', lag: 0 }, desc: `${a.code} → ${b.code}: lag ${r.lag} → 0`, cost: 0 }); }
      if (o.levers.fast) for (const r of T.rels) { const a = by.get(r.p), b = by.get(r.s); if (!a || !b || (r.type || 'FS') !== 'FS' || (r.lag || 0) > 0 || touched.has(r.p + '>' + r.s) || !ids.has(r.s) || a.status === 'C' || b.status !== 'NS' || P6.isMile(a) || P6.isMile(b)) continue; const rem = a.status === 'NS' ? a.dur : a.rem, lag = Math.max(1, Math.round((rem * o.overlapPct) / 100)); if (rem < 2 || lag >= rem) continue; cands.push({ key: r.p + '>' + r.s, lever: 'fast', op: { k: 'rel', from: a.code, to: b.code, type: 'SS', lag, ff: Math.min(o.tail, Math.max(0, b.dur - 1)) }, desc: `${a.code} → ${b.code}: FS → SS+${lag} (FF+${Math.min(o.tail, Math.max(0, b.dur - 1))})`, cost: 0 }); }
      if (o.levers.compress) for (const t of open) { if (P6.isMile(t)) continue; const cur = t.status === 'NS' ? t.dur : t.rem, nd = Math.max(o.minDur, Math.round(cur * (1 - o.compressPct / 100))); if (nd >= cur || cur < 2) continue; const newDur = t.status === 'NS' ? nd : t.dur - (cur - nd); cands.push({ lever: 'compress', op: { k: 'dur', code: t.code, mode: 'set', v: newDur }, desc: `${t.code}: ${t.status === 'NS' ? t.dur : t.rem} → ${nd} d`, cost: (cost(t.id) * o.premium) / 100 * ((cur - nd) / cur) }); }
      const maxCost = Math.max(1, ...cands.map((c) => c.cost));
      let best = null;
      for (const c of cands) {
        if (Date.now() - t0 > o.maxMs) { timedOut = true; break; }
        const X2 = clone(T); P6.applyScenario(X2, [c.op]); P6.schedule(X2); const f = fin(X2), gain = wdays(p, f, Fc) || 0;
        if (gain <= 0) continue; const score = gain / (RISK[c.lever] + (2 * c.cost) / maxCost);
        if (!best || score > best.score || (score === best.score && gain > best.gain)) best = Object.assign({}, c, { gain, score, f, T: X2 });
      }
      if (!best) break;
      if (best.key) touched.add(best.key);
      T = best.T; Fc = best.f; actions.push({ lever: best.lever, op: best.op, desc: best.desc, gain: best.gain, cum: wdays(p, Fc, F0), cost: best.cost, risk: RISK[best.lever], f: Fc });
      if (timedOut) break;
    }
    const achieved = wdays(p, Fc, F0) || 0, shortfall = o.target != null ? Math.max(0, wdays(p, o.target, Fc) || 0) : 0;
    return { F0, F1: Fc, gap: gap0, achieved, shortfall, actions, totalCost: actions.reduce((n, a) => n + a.cost, 0), timedOut, tr: T, opt: o };
  };

  X.tabs.push({ id: 'recovery', label: () => B('Recovery Schedule', 'جدول الاسترداد'), render(el, redo) {
    const p = App.p, S = ensure(p); p.recov = p.recov || {};
    const cal = p.cals.find((c) => c.id === p.defCal) || p.cals[0], appr = S.events.reduce((n, e) => n + (e.status !== 'Rejected' ? +e.approved || 0 : 0), 0);
    const blF = p.tasks.reduce((m, t) => (t.bf != null && t.bf > m ? t.bf : m), -Infinity);
    const defTarget = p.recov.target != null ? p.recov.target : S.contractFinish != null ? P6.shift(cal, S.contractFinish, appr) : isFinite(blF) ? blF : null;
    const R = Object.assign({ overlapPct: 50, tail: 2, compressPct: 20, premium: 25, nearFloat: 5, logic: true, fast: true, compress: true }, p.recov.opt);
    const num = (id, v, w) => `<input id="${id}" type="number" value="${v}" style="width:${w || 60}px">`;
    el.innerHTML = `<div class="dly-bar"><label>${esc(B('Target finish', 'تاريخ النهاية المستهدف'))} <input id="rc_t" value="${esc(fd(defTarget))}" placeholder="dd-mmm-yy" style="width:110px"></label><span class="hint" id="rc_gap"></span></div>
      <div class="dly-bar"><label><input type="checkbox" id="rc_l"${R.logic ? ' checked' : ''}> ${esc(LV.logic())}</label><label><input type="checkbox" id="rc_f"${R.fast ? ' checked' : ''}> ${esc(LV.fast())}: ${esc(B('overlap %', 'نسبة التداخل %'))} ${num('rc_op', R.overlapPct)} ${esc(B('FF tail (d)', 'ذيل FF (يوم)'))} ${num('rc_tl', R.tail, 45)}</label><label><input type="checkbox" id="rc_c"${R.compress ? ' checked' : ''}> ${esc(LV.compress())}: ${esc(B('compress %', 'نسبة الضغط %'))} ${num('rc_cp', R.compressPct)} ${esc(B('cost premium %', 'علاوة التكلفة %'))} ${num('rc_pr', R.premium)}</label><label>${esc(B('Near-critical float ≤', 'فلوت شبه حرج ≤'))} ${num('rc_nf', R.nearFloat, 45)}</label><button class="btn pri" id="rc_run">▶ ${esc(B('Build recovery plan', 'ابنِ خطة الاسترداد'))}</button></div><div id="rc_out"></div>
      <p class="hint">${esc(B('The target defaults to the contract completion + approved EOT (EOT tab). Each action is tested on a copy – the days shown are real gains on the critical path, and they are cumulative (parallel paths cap the total). Calendar / shift changes, extra resources and scope changes are not modelled – add them manually and re-run.', 'الهدف الافتراضي = الإنجاز التعاقدي + EOT المعتمد (تبويب EOT). كل إجراء يُختبر على نسخة – الأيام المعروضة مكاسب حقيقية على المسار الحرج، وهي تراكمية (المسارات المتوازية تحدّ من الإجمالي). تغيير التقاويم/الورديات وإضافة موارد وتغيير النطاق غير مُنمذجة – أضفها يدوياً وأعد التشغيل.'))}</p>`;
    const $ = (s) => el.querySelector(s);
    const base = clone(p); P6.schedule(base); const F0 = fin(base);
    const gapTxt = () => { const t = pd($('#rc_t').value); $('#rc_gap').textContent = t ? B('Forecast ', 'المتوقع ') + fd(F0) + ' → ' + (wdays(p, t, F0) > 0 ? B('behind by ', 'متأخر بـ ') + wdays(p, t, F0) + ' wd' : B('on target', 'ضمن الهدف')) : ''; };
    $('#rc_t').onchange = gapTxt; gapTxt();
    let res = null;
    function show() {
      const out = $('#rc_out'), r = res;
      out.innerHTML = (r.timedOut ? `<p class="cmp-bad">⚠ ${esc(B('Stopped at the time limit – partial plan.', 'توقف عند حد الوقت – خطة جزئية.'))}</p>` : '') + `<div class="cmpcards"><div class="cmpc ${r.gap > 0 ? 'bad' : 'good'}"><b>${r.gap}</b><span>${esc(B('Days to recover (wd)', 'أيام مطلوب استردادها'))}</span></div><div class="cmpc good"><b>${r.achieved}</b><span>${esc(B('Achievable by actions (wd)', 'الممكن بالإجراءات (يوم)'))}</span></div><div class="cmpc ${r.shortfall ? 'bad' : 'good'}"><b>${r.shortfall}</b><span>${esc(B('Shortfall (wd)', 'العجز (يوم)'))}</span></div><div class="cmpc"><b>${fd(r.F1)}</b><span>${esc(B('Finish after plan', 'النهاية بعد الخطة'))} (${fd(r.F0)})</span></div><div class="cmpc"><b>${Math.round(r.totalCost).toLocaleString()}</b><span>${esc(B('Extra cost (estimate)', 'تكلفة إضافية (تقدير)'))}</span></div></div>`
        + (r.shortfall ? `<p class="cmp-bad">⚠ ${esc(B('The listed levers cannot close the whole gap. Options: more compression %, resources / shifts, scope change, or a time-extension claim.', 'الإجراءات المتاحة لا تسد الفجوة كلها. الخيارات: نسبة ضغط أكبر، موارد/ورديات، تغيير نطاق، أو مطالبة بتمديد المدة.'))}</p>` : '')
        + `<div class="tbl-scroll" style="max-height:38vh"><table class="mini cmpt"><thead><tr><th></th><th>#</th><th>${esc(B('Lever', 'الإجراء'))}</th><th>${esc(B('Change', 'التغيير'))}</th><th>${esc(B('Days gained', 'المكسب'))}</th><th>${esc(B('Cumulative', 'التراكمي'))}</th><th>${esc(B('Risk', 'المخاطرة'))}</th><th>${esc(B('Extra cost', 'تكلفة إضافية'))}</th><th>${esc(B('Owner', 'المسؤول'))}</th><th>${esc(B('Due', 'الاستحقاق'))}</th></tr></thead><tbody>${r.actions.map((a, i) => `<tr><td><input type="checkbox" class="rc_k" data-i="${i}" checked></td><td>${i + 1}</td><td>${esc(LV[a.lever]())}</td><td>${esc(a.desc)}</td><td class="r cmp-good">+${a.gain}</td><td class="r">${a.cum}</td><td>${['', B('Low', 'منخفضة'), B('Medium', 'متوسطة'), B('High', 'مرتفعة')][a.risk]}</td><td class="r">${a.cost ? Math.round(a.cost).toLocaleString() : '–'}</td><td><input class="rc_o" data-i="${i}" style="width:90px"></td><td><input class="rc_d" data-i="${i}" style="width:80px"></td></tr>`).join('') || `<tr><td colspan="10" style="text-align:center;color:#888">${esc(B('No action brings the finish earlier', 'لا إجراء يقدّم النهاية'))}</td></tr>`}</tbody></table></div>
        <div class="dly-bar" style="margin-top:8px"><button class="btn" id="rc_eval">${esc(B('Re-evaluate selected', 'أعد تقييم المختار'))}</button><span id="rc_ev"></span><button class="btn pri" id="rc_apply"${r.actions.length ? '' : ' disabled'}>${esc(B('Apply selected to schedule', 'طبّق المختار على الجدول'))}</button><button class="btn" id="rc_scn"${r.actions.length ? '' : ' disabled'}>${esc(B('Save as What-If scenario', 'احفظ كسيناريو What-If'))}</button><button class="btn" id="rc_xl">${esc(B('Export to Excel', 'تصدير Excel'))}</button></div>`;
      const sel = () => [...out.querySelectorAll('.rc_k')].filter((c) => c.checked).map((c) => r.actions[+c.dataset.i]);
      $('#rc_eval').onclick = () => { const ops = sel().map((a) => a.op), T = clone(p); P6.applyScenario(T, ops); P6.schedule(T); const f = fin(T), t = pd($('#rc_t').value); $('#rc_ev').innerHTML = `${esc(B('Finish', 'النهاية'))} ${fd(f)} (${wdays(p, f, F0) > 0 ? '-' : ''}${Math.abs(wdays(p, f, F0))} wd)${t ? ' · ' + (f <= t ? '<b class="cmp-good">' + esc(B('target met', 'الهدف محقق')) + '</b>' : '<b class="cmp-bad">' + esc(B('short by ', 'عجز ')) + wdays(p, t, f) + ' wd</b>') : ''}`; };
      $('#rc_apply').onclick = () => { const ops = sel().map((a) => a.op); if (!ops.length) return; if (!confirm(B('Apply ' + ops.length + ' recovery actions to the live schedule? (Undo with Ctrl+Z)', 'تطبيق ' + ops.length + ' إجراء استرداد على الجدول الفعلي؟ (تراجع بـ Ctrl+Z)'))) return; App.mutate(B('Recovery plan', 'خطة الاسترداد'), () => { P6.applyScenario(App.p, ops); }); App.toast(B('Applied – create a revision in the Revisions tab', 'تم التطبيق – أنشئ مراجعة من تبويب المراجعات')); };
      $('#rc_scn').onclick = () => { p.scenarios = p.scenarios || []; p.scenarios.push({ id: Date.now(), name: 'Recovery plan ' + fd(P6.todayDay ? P6.todayDay() : p.dataDate), ops: JSON.parse(JSON.stringify(sel().map((a) => a.op))) }); X.save(); App.toast(B('Saved – Tools ▸ What-If Scenarios', 'تم الحفظ – Tools ▸ What-If Scenarios')); };
      $('#rc_xl').onclick = () => {
        const owners = [...out.querySelectorAll('.rc_o')].map((i) => i.value), dues = [...out.querySelectorAll('.rc_d')].map((i) => i.value), cmp = P6.compare(r.tr, base);
        App.xlsxBook('Recovery-Plan.xlsx', [{ name: 'Summary', title: B('Recovery schedule', 'جدول الاسترداد'), subtitle: p.name, cols: [{ h: 'Item', w: 40 }, { h: 'Value', w: 20, t: 'n' }], rows: [['Forecast finish (current)', fd(r.F0)], ['Target finish', fd(r.opt.target)], ['Days to recover (wd)', r.gap], ['Achievable by actions (wd)', r.achieved], ['Shortfall (wd)', r.shortfall], ['Finish after plan', fd(r.F1)], ['Extra cost (estimate)', Math.round(r.totalCost)]] },
          { name: 'Action register', title: B('Recovery action register', 'سجل إجراءات الاسترداد'), cols: [{ h: '#', t: 'n', w: 5 }, { h: 'Lever', w: 20 }, { h: 'Change', w: 50 }, { h: 'Days gained', t: 'n', w: 11 }, { h: 'Cumulative', t: 'n', w: 11 }, { h: 'Risk', w: 9 }, { h: 'Extra cost', t: 'm', w: 14 }, { h: 'Owner', w: 18, input: 1 }, { h: 'Due', w: 14, input: 1 }, { h: 'Status', w: 12, input: 1 }], rows: r.actions.map((a, i) => [i + 1, LV[a.lever](), a.desc, a.gain, a.cum, ['', 'Low', 'Medium', 'High'][a.risk], Math.round(a.cost), owners[i] || '', dues[i] || '', '']) }].concat(P6.compare.sheets(cmp, r.tr, base, { cur: 'Recovery plan', oth: 'Current' }).slice(1, 3)));
      };
    }
    $('#rc_run').onclick = () => {
      const t = pd($('#rc_t').value); if (t === undefined) return App.toast(B('Bad date', 'تاريخ غير صالح'), true);
      const opt = { overlapPct: +$('#rc_op').value || 50, tail: +$('#rc_tl').value || 0, compressPct: +$('#rc_cp').value || 20, premium: +$('#rc_pr').value || 0, nearFloat: +$('#rc_nf').value || 0, logic: $('#rc_l').checked, fast: $('#rc_f').checked, compress: $('#rc_c').checked };
      p.recov.target = t; p.recov.opt = opt; X.save();
      $('#rc_out').innerHTML = `<p class="hint">${esc(B('Testing recovery levers on copies of the schedule…', 'جارٍ اختبار إجراءات الاسترداد على نسخ من الجدول…'))}</p>`;
      setTimeout(() => { try { res = P6.recoveryPlan(p, { target: t, overlapPct: opt.overlapPct, tail: opt.tail, compressPct: opt.compressPct, premium: opt.premium, nearFloat: opt.nearFloat, levers: { logic: opt.logic, fast: opt.fast, compress: opt.compress } }); show(); } catch (e) { console.error(e); App.toast(String(e.message || e), true); } }, 30);
    };
    void redo;
  } });
})(window);

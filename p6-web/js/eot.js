/* P6 Web – EOT (Extension of Time): delay-event register, time-impact analysis and the delay report.
   Method (per SCL Protocol / AACE 29R-03 practice, simplified for an in-browser CPM):
   - Unimpacted schedule = the current schedule (re-scheduled). Each event's fragnet (What-If operations) is inserted on a copy.
   - Independent TIA: delay_i = finish(unimpacted + fragnet_i) - finish(unimpacted), in working days of the project calendar.
   - Cumulative TIA (chronological): excusable events (EC, ENC) are inserted one after another; entitlement_i = finish_i - finish_{i-1}.
     Non-excusable (NE) events are inserted in a second chain to show the contractor's own delay; overlap with excusable delay = concurrency
     (time but no money). Float is treated as project-owned: only days that move the completion date count.
   - Windows analysis between saved revisions attributes each window's slip to events whose activities were critical at the window start. */
(function (g) {
  'use strict';
  const P6 = g.P6, App = g.App, D = App.dialogs, X = P6.delay;
  const { esc, B, clone, fin, wdays, fd, pd, ensure } = X;

  const CAUSES = [['instr', 'Employer instruction / variation', 'تعليمات / أمر تغيير من صاحب العمل'], ['access', 'Late access to site', 'تأخر تسليم الموقع'], ['info', 'Late information / drawings', 'تأخر معلومات / مخططات'], ['items', 'Employer-supplied items', 'مواد / أعمال من صاحب العمل'], ['ground', 'Unforeseeable ground conditions', 'ظروف أرض غير متوقعة'], ['fm', 'Force majeure / exceptional event', 'قوة قاهرة / حدث استثنائي'], ['auth', 'Authorities / utilities', 'جهات حكومية / مرافق'], ['weather', 'Adverse weather', 'ظروف جوية سيئة'], ['contr', 'Contractor-caused', 'تأخير من المقاول'], ['third', 'Third party', 'طرف ثالث'], ['other', 'Other', 'أخرى']];
  const CLS = { EC: ['Excusable – compensable', 'معذور – مع تعويض', '#2e8b3e'], ENC: ['Excusable – non-compensable', 'معذور – بدون تعويض', '#d97706'], NE: ['Non-excusable', 'غير معذور (مسؤولية المقاول)', '#c0392b'] };
  const PARTY = [['emp', 'Employer', 'صاحب العمل'], ['eng', 'Engineer / PM', 'المهندس / مدير المشروع'], ['con', 'Contractor', 'المقاول'], ['sub', 'Sub-contractor', 'مقاول باطن'], ['neu', 'Neutral / external', 'محايد / خارجي']];
  const STAT = ['Draft', 'Notified', 'Submitted', 'Assessed', 'Agreed', 'Rejected'];
  const cause = (k) => (CAUSES.find((c) => c[0] === k) || CAUSES[CAUSES.length - 1]);
  const lab = (a) => B(a[1], a[2]);

  /* ---------- helpers ---------- */
  const opCodes = (ops) => { const s = new Set(); for (const o of ops || []) [o.succ, o.pred, o.code, o.from, o.to].forEach((c) => { if (c) s.add(String(c).toLowerCase()); }); return s; };
  const nominalDays = (ops) => (ops || []).reduce((n, o) => n + (o.k === 'event' ? +o.days || 0 : o.k === 'dur' && o.mode === 'add' ? +o.v || 0 : o.k === 'dur' && o.mode === 'set' ? 0 : 0), 0);
  const noticeInfo = (e, S) => {
    const a = e.aware, n = e.notice, pt = e.partic, nd = a != null && n != null ? n - a : null, pdd = a != null && pt != null ? pt - a : null;
    return { nd, pdd, lateN: nd != null && nd > S.noticeDays, lateP: pdd != null && pdd > S.particularsDays, missing: n == null };
  };
  const calWork = (p, a, b) => { const c = p.cals.find((x) => x.id === p.defCal) || p.cals[0]; let n = 0; for (let d = a; d <= b; d++) if (P6.isWork(c, d)) n++; return n; };

  X.opsLabel = (ops) => (ops || []).map((o) => P6.opUI.describe(o)).join(' | ');

  /* ---------- engine ---------- */
  X.eotAnalyse = function (p, optIn) {
    const S = ensure(p), opt = Object.assign({ barLate: S.barLate }, optIn);
    const evs = S.events.filter((e) => e.status !== 'Rejected' && (e.ops || []).length);
    const order = evs.slice().sort((a, b) => (a.start == null ? 1e9 : a.start) - (b.start == null ? 1e9 : b.start) || a.id.localeCompare(b.id));
    const base = clone(p); P6.schedule(base); const F0 = fin(base), byCode = new Map(base.tasks.map((t) => [String(t.code).toLowerCase(), t]));
    const warnings = [];
    const run = (T, ops, ev) => { const w = P6.applyScenario(T, ops); if (w.length) warnings.push(ev.id + ': ' + w.join(', ')); P6.schedule(T); return fin(T); };
    // independent TIA
    const ind = new Map();
    for (const e of order) { const T = clone(p), f1 = run(T, e.ops, e); ind.set(e.id, { f1, d: wdays(p, F0, f1) }); }
    // cumulative chains
    const barred = (e) => opt.barLate && noticeInfo(e, S).lateN;
    const exc = order.filter((e) => e.cls !== 'NE' && !barred(e)), non = order.filter((e) => e.cls === 'NE');
    const cumExc = new Map(); let T1 = clone(p), prev = F0;
    for (const e of exc) { const f = run(T1, e.ops, e); cumExc.set(e.id, { f, d: wdays(p, prev, f) }); prev = f; }
    const Fexc = prev;
    const cumAll = new Map(); let T2 = clone(p); prev = F0;
    for (const e of order.filter((x) => !barred(x) || x.cls === 'NE')) { const f = run(T2, e.ops, e); cumAll.set(e.id, { f, d: wdays(p, prev, f) }); prev = f; }
    const Fall = prev;
    // contractor-only chain (what the non-excusable events alone do) for the concurrency picture
    const T3 = clone(p); let fN = F0; for (const e of non) fN = run(T3, e.ops, e);
    const neWin = non.filter((e) => (cumAll.get(e.id) || {}).d > 0 && e.start != null && e.end != null);
    const rows = order.map((e) => {
      const codes = opCodes(e.ops), aff = [...codes].map((c) => byCode.get(c)).filter(Boolean), tfMin = aff.length ? Math.min(...aff.map((t) => (t.tf == null ? 1e9 : t.tf))) : null;
      const nom = nominalDays(e.ops), i = ind.get(e.id), ce = cumExc.get(e.id), ca = cumAll.get(e.id), ni = noticeInfo(e, S), isB = barred(e);
      let overlap = 0;
      if (e.cls !== 'NE' && ce && ce.d > 0 && e.start != null && e.end != null) for (const n of neWin) { const a = Math.max(e.start, n.start), b = Math.min(e.end, n.end); if (b >= a) overlap += calWork(p, a, b); }
      const assessed = e.cls === 'NE' || isB ? 0 : Math.max(0, ce ? ce.d : 0);
      const compens = e.cls === 'EC' ? Math.max(0, assessed - Math.min(assessed, overlap)) : 0;
      return { ev: e, nominal: nom, indep: i ? i.d : 0, cum: ce ? ce.d : null, cumAll: ca ? ca.d : null, floatAbsorbed: nom > 0 ? Math.max(0, nom - (i ? i.d : 0)) : 0, tf: tfMin, critical: (i && i.d > 0) || (tfMin != null && tfMin <= 0), overlap, assessed, compens, ni, barred: isB, f1: i ? i.f1 : null };
    });
    const totalExc = wdays(p, F0, Fexc) || 0, totalAll = wdays(p, F0, Fall) || 0;
    const blF = p.tasks.reduce((m, t) => (t.bf != null && t.bf > m ? t.bf : m), -Infinity);
    const contract = S.contractFinish != null ? S.contractFinish : isFinite(blF) ? blF : F0;
    const cal = p.cals.find((c) => c.id === p.defCal) || p.cals[0];
    const approved = S.events.reduce((n, e) => n + (e.status !== 'Rejected' && e.approved > 0 ? +e.approved : 0), 0);
    const revised = P6.shift(cal, contract, totalExc), revisedApproved = P6.shift(cal, contract, approved);
    return { F0, Fexc, Fall, FNonOnly: fN, rows, totalExc, totalAll, contract, revised, revisedApproved, approved, order, warnings, windows: X.windowsAnalysis(p, order), opt, base };
  };

  /* windows analysis between saved revisions (revision.js stores compact snapshots) */
  X.windowsAnalysis = function (p, order) {
    const revs = (p.revs || []).filter((r) => r.snap).slice().sort((a, b) => (a.dataDate || 0) - (b.dataDate || 0)), out = [];
    for (let i = 1; i < revs.length; i++) {
      const a = revs[i - 1], b = revs[i], slip = wdays(p, a.finish, b.finish), crit = new Set(a.snap.tasks.filter((t) => t.crit).map((t) => String(t.code).toLowerCase()));
      const inWin = order.filter((e) => e.start != null && e.start > (a.dataDate || -1e9) && e.start <= (b.dataDate || 1e9));
      const attr = inWin.filter((e) => [...opCodes(e.ops)].some((c) => crit.has(c)));
      out.push({ a, b, slip, events: inWin, attributed: attr, critCount: crit.size });
    }
    return out;
  };

  /* ---------- UI ---------- */
  const dfld = (id, v) => `<input id="${id}" value="${esc(fd(v))}" placeholder="dd-mmm-yy" style="width:110px">`;
  const chip = (t, c) => `<span class="dsh-chip" style="background:${c}1f;color:${c};border-color:${c}66">${esc(t)}</span>`;

  function editEvent(e0, done) {
    const p = App.p, S = ensure(p), isNew = !e0, e = e0 || { id: 'EOT-' + String(S.seq).padStart(2, '0'), title: '', desc: '', cause: 'instr', cls: 'EC', party: 'emp', clause: '', aware: null, notice: null, partic: null, start: null, end: null, claimed: 0, approved: 0, status: 'Draft', ops: [], notes: '' };
    const ops = (e.ops || []).slice();
    const body = document.createElement('div'); body.className = 'wif'; body.dir = P6.dir();
    const sel = (id, list, v, lbl) => `<select id="${id}">${list.map((x) => `<option value="${Array.isArray(x) ? x[0] : x}"${(Array.isArray(x) ? x[0] : x) === v ? ' selected' : ''}>${esc(lbl ? lbl(x) : x)}</option>`).join('')}</select>`;
    const dl = `<datalist id="wif_codes">${p.tasks.slice(0, 3000).map((t) => `<option value="${esc(t.code)}">${esc(t.name)}</option>`).join('')}</datalist>`;
    body.innerHTML = `${dl}<div class="dly-form">
      <label>ID<input id="e_id" value="${esc(e.id)}"></label><label class="w2">${esc(B('Title', 'العنوان'))}<input id="e_title" value="${esc(e.title)}"></label>
      <label class="w3">${esc(B('Description / facts', 'الوصف / الوقائع'))}<textarea id="e_desc" rows="2">${esc(e.desc)}</textarea></label>
      <label>${esc(B('Cause', 'السبب'))}${sel('e_cause', CAUSES, e.cause, lab)}</label><label>${esc(B('Classification', 'التصنيف'))}${sel('e_cls', Object.keys(CLS), e.cls, (k) => B(CLS[k][0], CLS[k][1]))}</label><label>${esc(B('Responsible party', 'الطرف المسؤول'))}${sel('e_party', PARTY, e.party, lab)}</label>
      <label>${esc(B('Contract clause', 'بند العقد'))}<input id="e_clause" value="${esc(e.clause)}" placeholder="FIDIC 8.5 / 13.1…"></label><label>${esc(B('Status', 'الحالة'))}${sel('e_status', STAT, e.status)}</label><label>${esc(B('Approved days', 'الأيام المعتمدة'))}<input id="e_appr" type="number" value="${e.approved || 0}" style="width:90px"></label>
      <label>${esc(B('Awareness date', 'تاريخ العلم بالحدث'))}${dfld('e_aware', e.aware)}</label><label>${esc(B('Notice sent', 'تاريخ الإخطار'))}${dfld('e_notice', e.notice)}</label><label>${esc(B('Particulars submitted', 'تاريخ تقديم التفاصيل'))}${dfld('e_part', e.partic)}</label>
      <label>${esc(B('Event start', 'بداية الحدث'))}${dfld('e_start', e.start)}</label><label>${esc(B('Event end', 'نهاية الحدث'))}${dfld('e_end', e.end)}</label><label>${esc(B('Claimed days', 'الأيام المطالب بها'))}<input id="e_claim" type="number" value="${e.claimed || 0}" style="width:90px"></label>
      <label class="w3">${esc(B('Notes', 'ملاحظات'))}<input id="e_notes" value="${esc(e.notes || '')}"></label></div>
      <h4>${esc(B('Fragnet – how the event delays the schedule', 'الـ Fragnet – كيف يؤثر الحدث على الجدول'))}</h4>
      <div class="wif-add"><select id="wif_k">${['event', 'dur', 'lag', 'rel', 'addrel', 'rmrel', 'cons'].map((k) => `<option value="${k}">${esc(P6.opUI.KINDS[k]())}</option>`).join('')}</select><span id="wif_form">${P6.opUI.formFor('event')}</span><button class="btn pri" id="e_addop">${esc(B('Add', 'أضف'))}</button></div>
      <div id="e_ops"></div>`;
    const $ = (s) => body.querySelector(s);
    const drawOps = () => { $('#e_ops').innerHTML = `<table class="mini cmpt"><tbody>${ops.map((o, i) => `<tr><td>${esc(P6.opUI.KINDS[o.k]())}</td><td>${esc(P6.opUI.describe(o))}</td><td><a data-rm="${i}" style="cursor:pointer;color:#c0392b">✕</a></td></tr>`).join('') || `<tr><td style="color:#888">${esc(B('No fragnet yet – add at least one change to analyse this event', 'لا يوجد Fragnet – أضف تغييراً واحداً على الأقل لتحليل الحدث'))}</td></tr>`}</tbody></table>`; body.querySelectorAll('[data-rm]').forEach((a) => { a.onclick = () => { ops.splice(+a.dataset.rm, 1); drawOps(); }; }); };
    drawOps();
    $('#wif_k').onchange = (ev) => { $('#wif_form').innerHTML = P6.opUI.formFor(ev.target.value); };
    $('#e_addop').onclick = () => { const o = P6.opUI.readOp($('#wif_k').value, body); if (!o) return App.toast(B('Fill in all fields', 'املأ كل الحقول'), true); ops.push(o); drawOps(); };
    D.modal({ title: isNew ? B('New EOT event', 'حدث EOT جديد') : e.id, cls: 'wide dsh-modal', body, sticky: true, buttons: [
      ...(isNew ? [] : [{ label: B('Delete', 'حذف'), fn: () => { if (!confirm(B('Delete this event?', 'حذف الحدث؟'))) return false; S.events = S.events.filter((x) => x !== e0); X.save(); done(); } }]),
      { label: P6.t('cancel'), fn: () => {} },
      { label: B('Save', 'حفظ'), cls: 'pri', fn: () => {
        const v = (id) => $('#' + id).value.trim(), dts = ['e_aware', 'e_notice', 'e_part', 'e_start', 'e_end'].map((id) => pd(v(id)));
        if (dts.some((d) => d === undefined)) { App.toast(B('Check the dates (dd-mmm-yy)', 'راجع التواريخ (dd-mmm-yy)'), true); return false; }
        if (!v('e_title')) { App.toast(B('Enter a title', 'اكتب عنواناً'), true); return false; }
        const id = v('e_id') || e.id; if (S.events.some((x) => x !== e0 && x.id === id)) { App.toast(B('ID already used', 'الـ ID مستخدم'), true); return false; }
        Object.assign(e, { id, title: v('e_title'), desc: v('e_desc'), cause: v('e_cause'), cls: v('e_cls'), party: v('e_party'), clause: v('e_clause'), status: v('e_status'), approved: +v('e_appr') || 0, aware: dts[0], notice: dts[1], partic: dts[2], start: dts[3], end: dts[4], claimed: +v('e_claim') || 0, notes: v('e_notes'), ops });
        if (isNew) { S.events.push(e); S.seq++; }
        X.save(); done();
      } }] });
  }

  /* ---------- tab: register ---------- */
  X.tabs.push({ id: 'register', label: () => B('EOT Register', 'سجل EOT'), render(el, redo) {
    const p = App.p, S = ensure(p);
    const blF = p.tasks.reduce((m, t) => (t.bf != null && t.bf > m ? t.bf : m), -Infinity);
    const head = `<div class="dly-bar"><button class="btn pri" id="eo_add">+ ${esc(B('New event', 'حدث جديد'))}</button><label>${esc(B('Contract completion date', 'تاريخ الإنجاز التعاقدي'))} ${dfld('eo_cf', S.contractFinish != null ? S.contractFinish : isFinite(blF) ? blF : null)}</label><label>${esc(B('Notice limit (days)', 'مهلة الإخطار (يوم)'))} <input id="eo_nd" type="number" value="${S.noticeDays}" style="width:60px"></label><label>${esc(B('Particulars limit (days)', 'مهلة التفاصيل (يوم)'))} <input id="eo_pd" type="number" value="${S.particularsDays}" style="width:60px"></label><label><input type="checkbox" id="eo_bar"${S.barLate ? ' checked' : ''}> ${esc(B('Late notice bars the claim', 'الإخطار المتأخر يُسقط المطالبة'))}</label><button class="btn" id="eo_go">▶ ${esc(B('Analyse', 'تحليل'))}</button></div>`;
    const sumClaimed = S.events.reduce((n, e) => n + (e.claimed || 0), 0), sumAppr = S.events.reduce((n, e) => n + (e.status !== 'Rejected' ? e.approved || 0 : 0), 0);
    const rows = S.events.map((e, i) => { const ni = noticeInfo(e, S), c = CLS[e.cls]; return `<tr data-i="${i}" style="cursor:pointer"><td>${esc(e.id)}</td><td>${esc(e.title)}</td><td>${esc(lab(cause(e.cause)))}</td><td>${chip(B(c[0], c[1]), c[2])}</td><td>${esc(lab(PARTY.find((x) => x[0] === e.party) || PARTY[4]))}</td><td>${esc(e.clause)}</td><td>${fd(e.start)}${e.end != null ? ' → ' + fd(e.end) : ''}</td><td>${ni.missing ? chip(B('No notice', 'بدون إخطار'), '#c0392b') : ni.lateN ? chip(B('Late +' + (ni.nd - S.noticeDays) + ' d', 'متأخر +' + (ni.nd - S.noticeDays) + ' يوم'), '#c0392b') : chip(B('On time', 'في الموعد'), '#2e8b3e')}</td><td class="r">${e.claimed || 0}</td><td class="r">${e.approved || 0}</td><td>${esc(e.status)}</td><td>${(e.ops || []).length ? '✓' : '<span style="color:#c0392b">–</span>'}</td></tr>`; }).join('');
    el.innerHTML = `${head}<div class="tbl-scroll" style="max-height:60vh"><table class="mini cmpt"><thead><tr><th>ID</th><th>${esc(B('Event', 'الحدث'))}</th><th>${esc(B('Cause', 'السبب'))}</th><th>${esc(B('Class', 'التصنيف'))}</th><th>${esc(B('Party', 'الطرف'))}</th><th>${esc(B('Clause', 'البند'))}</th><th>${esc(B('Period', 'الفترة'))}</th><th>${esc(B('Notice', 'الإخطار'))}</th><th>${esc(B('Claimed', 'مطالب'))}</th><th>${esc(B('Approved', 'معتمد'))}</th><th>${esc(B('Status', 'الحالة'))}</th><th>${esc(B('Fragnet', 'Fragnet'))}</th></tr></thead><tbody>${rows || `<tr><td colspan="12" style="text-align:center;color:#888">${esc(B('No events yet – press "New event"', 'لا أحداث بعد – اضغط "حدث جديد"'))}</td></tr>`}</tbody><tfoot><tr><td colspan="8"><b>${esc(B('Total', 'الإجمالي'))}</b></td><td class="r"><b>${sumClaimed}</b></td><td class="r"><b>${sumAppr}</b></td><td colspan="2"></td></tr></tfoot></table></div>
      <p class="hint">${esc(B('Each event needs a fragnet (how it delays the schedule) to be analysed. Notice dates are checked against the limits above (FIDIC 20.2.1: 28 days from awareness, full particulars within 84 days).', 'كل حدث يحتاج Fragnet (كيف يؤخر الجدول) ليتم تحليله. تُفحص تواريخ الإخطار مقابل المهل أعلاه (FIDIC 20.2.1: 28 يوماً من العلم، والتفاصيل الكاملة خلال 84 يوماً).'))}</p>`;
    const $ = (s) => el.querySelector(s);
    $('#eo_add').onclick = () => editEvent(null, redo);
    el.querySelectorAll('tbody tr[data-i]').forEach((tr) => { tr.onclick = () => editEvent(S.events[+tr.dataset.i], redo); });
    const sv = () => { const d = pd($('#eo_cf').value); if (d === undefined) return App.toast(B('Bad date', 'تاريخ غير صالح'), true); S.contractFinish = d; S.noticeDays = +$('#eo_nd').value || 28; S.particularsDays = +$('#eo_pd').value || 84; S.barLate = $('#eo_bar').checked; X.save(); };
    ['#eo_cf', '#eo_nd', '#eo_pd', '#eo_bar'].forEach((s) => { $(s).onchange = () => { sv(); redo(); }; });
    $('#eo_go').onclick = () => { sv(); App.delayTab = 'analysis'; redo(); };
  } });

  /* ---------- tab: analysis ---------- */
  function waterfall(res) {
    const steps = [{ l: B('Contract completion', 'الإنجاز التعاقدي'), d: res.contract, tot: true }];
    let run = res.contract; const cal = App.p.cals.find((c) => c.id === App.p.defCal) || App.p.cals[0];
    for (const r of res.rows) if (r.assessed > 0) { const nd = P6.shift(cal, run, r.assessed); steps.push({ l: r.ev.id + ' (+' + r.assessed + ')', d: nd, from: run }); run = nd; }
    steps.push({ l: B('Revised completion', 'الإنجاز المعدّل'), d: run, tot: true });
    const lo = Math.min(...steps.map((s) => s.from || s.d)), hi = Math.max(...steps.map((s) => s.d)), W = 720, rh = 22, lw = 190, sc = (d) => lw + ((d - lo) / Math.max(1, hi - lo)) * (W - lw - 70);
    return `<svg viewBox="0 0 ${W} ${steps.length * rh + 12}" style="width:100%;max-height:${steps.length * rh + 20}px" dir="ltr">${steps.map((s, i) => { const y = 6 + i * rh, x0 = s.from != null ? sc(s.from) : sc(lo), x1 = sc(s.d); return `<text x="4" y="${y + 14}" font-size="11" fill="#333">${esc(s.l)}</text><rect x="${x0.toFixed(1)}" y="${y + 3}" width="${Math.max(2, x1 - x0).toFixed(1)}" height="${rh - 8}" fill="${s.tot ? '#00778B' : '#d97706'}" rx="2"/><text x="${(x1 + 4).toFixed(1)}" y="${y + 14}" font-size="10" fill="#555">${esc(fd(s.d))}</text>`; }).join('')}</svg>`;
  }
  X.waterfall = waterfall;

  X.tabs.push({ id: 'analysis', label: () => B('Delay Analysis (TIA)', 'تحليل التأخير (TIA)'), render(el, redo) {
    const p = App.p, S = ensure(p);
    if (!S.events.some((e) => (e.ops || []).length && e.status !== 'Rejected')) { el.innerHTML = `<p class="hint">${esc(B('Add events with a fragnet in the EOT Register first.', 'أضف أحداثاً بها Fragnet في سجل EOT أولاً.'))}</p>`; return; }
    el.innerHTML = `<p class="hint">${esc(B('Running time-impact analysis…', 'جارٍ تشغيل تحليل الأثر الزمني…'))}</p>`;
    setTimeout(() => {
      let res; try { res = X.eotAnalyse(p); } catch (e) { console.error(e); el.innerHTML = `<p class="cmp-bad">${esc(String(e.message || e))}</p>`; return; }
      X.last = res;
      const cd = (n) => (n == null ? '–' : n > 0 ? '+' + n : String(n));
      const cards = `<div class="cmpcards"><div class="cmpc"><b>${fd(res.contract)}</b><span>${esc(B('Contract completion', 'الإنجاز التعاقدي'))}</span></div><div class="cmpc good"><b>${res.totalExc}</b><span>${esc(B('EOT entitlement (working days)', 'استحقاق EOT (أيام عمل)'))}</span></div><div class="cmpc"><b>${fd(res.revised)}</b><span>${esc(B('Revised completion (assessed)', 'الإنجاز المعدّل (المقيَّم)'))}</span></div><div class="cmpc ${res.approved ? 'good' : ''}"><b>${res.approved}</b><span>${esc(B('Approved so far (days)', 'المعتمد حتى الآن (يوم)'))} → ${fd(res.revisedApproved)}</span></div><div class="cmpc ${res.totalAll > res.totalExc ? 'bad' : ''}"><b>${cd(res.totalAll - res.totalExc)}</b><span>${esc(B('Contractor-caused delay (days)', 'تأخير بسبب المقاول (يوم)'))}</span></div></div>`;
      const trs = res.rows.map((r) => { const c = CLS[r.ev.cls]; return `<tr><td>${esc(r.ev.id)}</td><td>${esc(r.ev.title)}</td><td>${chip(B(c[0], c[1]), c[2])}</td><td class="r">${r.nominal || ''}</td><td class="r">${cd(r.indep)}</td><td class="r"><b>${r.cum == null ? '–' : cd(r.cum)}</b></td><td>${r.critical ? chip(B('Critical', 'حرج'), '#c0392b') : chip(B('Non-critical', 'غير حرج'), '#2e8b3e')}</td><td class="r">${r.tf == null ? '' : r.tf}</td><td class="r">${r.floatAbsorbed || ''}</td><td class="r">${r.overlap || ''}</td><td class="r"><b>${r.assessed}</b>${r.barred ? ' ⛔' : ''}</td><td class="r">${r.ev.cls === 'EC' ? r.compens : '–'}</td><td class="r">${r.ev.claimed || 0}</td></tr>`; }).join('');
      const win = res.windows.length ? `<h4>${esc(B('Windows analysis (between saved revisions)', 'تحليل النوافذ (بين المراجعات المحفوظة)'))}</h4><table class="mini cmpt"><thead><tr><th>${esc(B('Window', 'النافذة'))}</th><th>${esc(B('Data dates', 'تواريخ البيانات'))}</th><th>${esc(B('Finish', 'النهاية'))}</th><th>${esc(B('Slip (wd)', 'الانزلاق'))}</th><th>${esc(B('Events in window', 'أحداث النافذة'))}</th><th>${esc(B('On critical path', 'على المسار الحرج'))}</th></tr></thead><tbody>${res.windows.map((w) => `<tr><td>${esc(w.a.label)} → ${esc(w.b.label)}</td><td>${fd(w.a.dataDate)} → ${fd(w.b.dataDate)}</td><td>${fd(w.a.finish)} → ${fd(w.b.finish)}</td><td class="r ${w.slip > 0 ? 'cmp-bad' : ''}">${cd(w.slip)}</td><td>${esc(w.events.map((e) => e.id).join(', ')) || '–'}</td><td>${esc(w.attributed.map((e) => e.id).join(', ')) || '–'}</td></tr>`).join('')}</tbody></table>` : `<p class="hint">${esc(B('Windows analysis needs at least two saved revisions (Revisions tab).', 'تحليل النوافذ يحتاج مراجعتين محفوظتين على الأقل (تبويب المراجعات).'))}</p>`;
      el.innerHTML = `<div class="dly-bar"><label><input type="checkbox" id="an_bar"${S.barLate ? ' checked' : ''}> ${esc(B('Late notice bars the claim', 'الإخطار المتأخر يُسقط المطالبة'))}</label><button class="btn" id="an_store">${esc(B('Store assessed days in the register', 'احفظ الأيام المقيَّمة في السجل'))}</button><button class="btn" id="an_scn">${esc(B('Create What-If scenario from excusable events', 'أنشئ سيناريو What-If من الأحداث المعذورة'))}</button><button class="btn pri" id="an_rep">${esc(B('Delay report ▸', 'تقرير التأخير ▸'))}</button><button class="btn" id="an_xl">${esc(B('Export to Excel', 'تصدير Excel'))}</button></div>${res.warnings.length ? `<p class="cmp-bad">⚠ ${esc(res.warnings.join(' · '))}</p>` : ''}${cards}
        <div class="tbl-scroll" style="max-height:44vh"><table class="mini cmpt"><thead><tr><th>ID</th><th>${esc(B('Event', 'الحدث'))}</th><th>${esc(B('Class', 'التصنيف'))}</th><th>${esc(B('Nominal', 'اسمي'))}</th><th>${esc(B('Independent TIA', 'TIA مستقل'))}</th><th>${esc(B('Cumulative TIA', 'TIA تراكمي'))}</th><th>${esc(B('Critical?', 'حرج؟'))}</th><th>${esc(B('TF', 'فلوت'))}</th><th>${esc(B('Float absorbed', 'فلوت مستهلك'))}</th><th>${esc(B('Concurrent (wd)', 'تزامن (يوم)'))}</th><th>${esc(B('EOT days', 'أيام EOT'))}</th><th>${esc(B('Compensable', 'قابل للتعويض'))}</th><th>${esc(B('Claimed', 'مطالب'))}</th></tr></thead><tbody>${trs}</tbody><tfoot><tr><td colspan="10"><b>${esc(B('Total', 'الإجمالي'))}</b></td><td class="r"><b>${res.rows.reduce((n, r) => n + r.assessed, 0)}</b></td><td class="r"><b>${res.rows.reduce((n, r) => n + (r.ev.cls === 'EC' ? r.compens : 0), 0)}</b></td><td class="r"><b>${res.rows.reduce((n, r) => n + (r.ev.claimed || 0), 0)}</b></td></tr></tfoot></table></div>
        <h4>${esc(B('EOT build-up', 'تراكم EOT'))}</h4>${waterfall(res)}${win}
        <p class="hint">${esc(B('Method: unimpacted schedule = the current schedule. Cumulative TIA inserts the excusable events chronologically; entitlement of each event = movement of the completion date it causes (project-owned float). Concurrent = overlap with non-excusable delay: time without money. A simplified, indicative analysis – review before submission.', 'المنهج: الجدول غير المتأثر = الجدول الحالي. الـ TIA التراكمي يدخل الأحداث المعذورة زمنياً؛ استحقاق كل حدث = حركة تاريخ الإنجاز التي يسببها (الفلوت ملك المشروع). التزامن = تداخل مع تأخير غير معذور: وقت بدون تعويض. تحليل مبسّط استرشادي – راجعه قبل التقديم.'))}</p>`;
      const $ = (s) => el.querySelector(s);
      $('#an_bar').onchange = (e) => { S.barLate = e.target.checked; X.save(); redo(); };
      $('#an_store').onclick = () => { for (const r of res.rows) { r.ev.assessed = r.assessed; r.ev.compens = r.compens; if (!r.ev.approved && r.assessed) r.ev.approved = r.assessed; if (r.ev.status === 'Draft' || r.ev.status === 'Notified' || r.ev.status === 'Submitted') r.ev.status = 'Assessed'; } X.save(); App.toast(B('Stored in the register (approved days pre-filled – edit if different)', 'تم الحفظ في السجل (الأيام المعتمدة معبّأة – عدّلها إن اختلفت)')); redo(); };
      $('#an_scn').onclick = () => { const ops = res.order.filter((e) => e.cls !== 'NE').flatMap((e) => e.ops); p.scenarios = p.scenarios || []; p.scenarios.push({ id: Date.now(), name: 'EOT – excusable events', ops: JSON.parse(JSON.stringify(ops)) }); X.save(); App.toast(B('Scenario created – open Tools ▸ What-If Scenarios', 'تم إنشاء السيناريو – افتح Tools ▸ What-If Scenarios')); };
      $('#an_rep').onclick = () => { App.delayTab = 'report'; redo(); };
      $('#an_xl').onclick = () => X.exportEotXlsx(p, res);
    }, 30);
  } });

  X.exportEotXlsx = function (p, res) {
    const S = ensure(p), L = (c) => B(c[0], c[1]);
    const sh = [
      { name: 'Summary', title: B('EOT & delay analysis', 'تحليل التأخير وEOT') + ' – ' + p.name, cols: [{ h: 'Item', w: 44 }, { h: 'Value', w: 22, t: 'n' }], rows: [['Contract completion', fd(res.contract)], ['Unimpacted completion (current schedule)', fd(res.F0)], ['Completion with excusable events', fd(res.Fexc)], ['Completion with all events', fd(res.Fall)], ['EOT entitlement (working days)', res.totalExc], ['Revised completion (assessed)', fd(res.revised)], ['Approved days', res.approved], ['Revised completion (approved)', fd(res.revisedApproved)], ['Contractor-caused delay (working days)', res.totalAll - res.totalExc]] },
      { name: 'Event register', title: B('Delay event register', 'سجل أحداث التأخير'), cols: [{ h: 'ID', w: 10 }, { h: 'Title', w: 36 }, { h: 'Cause', w: 28 }, { h: 'Class', w: 24 }, { h: 'Party', w: 16 }, { h: 'Clause', w: 14 }, { h: 'Awareness', t: 'd', w: 13 }, { h: 'Notice', t: 'd', w: 13 }, { h: 'Notice days', t: 'n', w: 10 }, { h: 'Notice status', w: 12 }, { h: 'Start', t: 'd', w: 13 }, { h: 'End', t: 'd', w: 13 }, { h: 'Claimed', t: 'n', w: 9 }, { h: 'Approved', t: 'n', w: 9 }, { h: 'Status', w: 11 }, { h: 'Fragnet', w: 60 }], rows: S.events.map((e) => { const ni = noticeInfo(e, S); return [e.id, e.title, lab(cause(e.cause)), L(CLS[e.cls]), lab(PARTY.find((x) => x[0] === e.party) || PARTY[4]), e.clause, e.aware, e.notice, ni.nd, ni.missing ? 'No notice' : ni.lateN ? 'Late' : 'On time', e.start, e.end, e.claimed || 0, e.approved || 0, e.status, X.opsLabel(e.ops)]; }) },
      { name: 'TIA', title: B('Time impact analysis', 'تحليل الأثر الزمني'), cols: [{ h: 'ID', w: 10 }, { h: 'Event', w: 36 }, { h: 'Class', w: 24 }, { h: 'Nominal', t: 'n', w: 9 }, { h: 'Independent TIA', t: 'n', w: 12 }, { h: 'Cumulative TIA', t: 'n', w: 12 }, { h: 'Critical', w: 9 }, { h: 'TF', t: 'n', w: 7 }, { h: 'Float absorbed', t: 'n', w: 11 }, { h: 'Concurrent wd', t: 'n', w: 11 }, { h: 'EOT days', t: 'n', w: 9 }, { h: 'Compensable', t: 'n', w: 11 }, { h: 'Claimed', t: 'n', w: 9 }], rows: res.rows.map((r) => [r.ev.id, r.ev.title, L(CLS[r.ev.cls]), r.nominal, r.indep, r.cum, r.critical ? 'Yes' : 'No', r.tf, r.floatAbsorbed, r.overlap, r.assessed, r.ev.cls === 'EC' ? r.compens : '', r.ev.claimed || 0]) },
      { name: 'Windows', title: B('Windows analysis', 'تحليل النوافذ'), cols: [{ h: 'From', w: 16 }, { h: 'To', w: 16 }, { h: 'Data date from', t: 'd', w: 14 }, { h: 'Data date to', t: 'd', w: 14 }, { h: 'Finish from', t: 'd', w: 14 }, { h: 'Finish to', t: 'd', w: 14 }, { h: 'Slip wd', t: 'n', w: 9 }, { h: 'Events', w: 30 }, { h: 'On critical path', w: 30 }], rows: res.windows.map((w) => [w.a.label, w.b.label, w.a.dataDate, w.b.dataDate, w.a.finish, w.b.finish, w.slip, w.events.map((e) => e.id).join(', '), w.attributed.map((e) => e.id).join(', ')]) }
    ];
    App.xlsxBook('EOT-Delay-Analysis.xlsx', sh);
  };

  /* ---------- tab: report ---------- */
  X.buildReport = function (p, res, lang) {
    const S = ensure(p), ar = lang === 'ar', T = (en, a) => (ar ? a : en), meta = S.meta || {}, L = (c) => (ar ? c[1] : c[0]), lbl = (a) => (ar ? a[2] : a[1]);
    const cd = (n) => (n == null ? '–' : n > 0 ? '+' + n : String(n)), E = esc;
    const sec = (n, t, body) => `<section><h2>${n}. ${E(t)}</h2>${body}</section>`;
    const tbl = (h, rows, foot) => `<table><thead><tr>${h.map((x) => `<th>${E(x)}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${h.length}" class="c">–</td></tr>`}</tbody>${foot ? `<tfoot>${foot}</tfoot>` : ''}</table>`;
    const dates = (a, b) => (a != null ? fd(a) : '–') + (b != null ? ' → ' + fd(b) : '');
    const narr = (r) => {
      const e = r.ev, ni = r.ni, c = CLS[e.cls];
      const who = lbl(PARTY.find((x) => x[0] === e.party) || PARTY[4]), cz = lbl(cause(e.cause));
      const notice = e.notice != null ? T(`notified on ${fd(e.notice)}${ni.nd != null ? ` (${ni.nd} days after awareness – ${ni.lateN ? 'LATE against the ' + S.noticeDays + '-day limit' : 'within the ' + S.noticeDays + '-day limit'})` : ''}`, `تم الإخطار بتاريخ ${fd(e.notice)}${ni.nd != null ? ` (بعد ${ni.nd} يوماً من العلم – ${ni.lateN ? 'متأخر عن مهلة ' + S.noticeDays + ' يوماً' : 'ضمن مهلة ' + S.noticeDays + ' يوماً'})` : ''}`) : T('no notice has been recorded', 'لم يتم تسجيل إخطار');
      return T(`On ${fd(e.start)}, ${who} caused "${e.title}" (${cz}${e.clause ? ', clause ' + e.clause : ''}); ${notice}. The fragnet (${X.opsLabel(e.ops)}) was inserted into the unimpacted schedule: the independent impact on completion is ${cd(r.indep)} working day(s) and the cumulative impact is ${cd(r.cum)}. The affected activities were ${r.critical ? 'on' : 'not on'} the critical path${r.tf != null ? ` (total float ${r.tf} d)` : ''}${r.floatAbsorbed ? `; ${r.floatAbsorbed} day(s) were absorbed by float` : ''}. Classified as ${L(c)}${r.overlap ? `; concurrent with non-excusable delay for ${r.overlap} working day(s)` : ''}. Assessed entitlement: ${r.assessed} day(s) EOT, ${e.cls === 'EC' ? r.compens + ' day(s) with cost' : 'without cost'}${r.barred ? ' (claim barred for late notice)' : ''}.`,
        `بتاريخ ${fd(e.start)}، تسبّب ${who} في "${e.title}" (${cz}${e.clause ? '، البند ' + e.clause : ''})؛ ${notice}. تم إدخال الـ Fragnet (${X.opsLabel(e.ops)}) في الجدول غير المتأثر: الأثر المستقل على الإنجاز ${cd(r.indep)} يوم عمل والأثر التراكمي ${cd(r.cum)}. الأنشطة المتأثرة ${r.critical ? 'على' : 'ليست على'} المسار الحرج${r.tf != null ? ` (الفلوت ${r.tf} يوم)` : ''}${r.floatAbsorbed ? `؛ استهلك الفلوت ${r.floatAbsorbed} يوم` : ''}. التصنيف: ${L(c)}${r.overlap ? `؛ متزامن مع تأخير غير معذور لمدة ${r.overlap} يوم عمل` : ''}. الاستحقاق المقيَّم: ${r.assessed} يوم EOT، ${e.cls === 'EC' ? r.compens + ' يوم مع تعويض' : 'بدون تعويض'}${r.barred ? ' (سقطت المطالبة لتأخر الإخطار)' : ''}.`);
    };
    const upd = (p.revs || []).filter((r) => r.snap).sort((a, b) => (a.dataDate || 0) - (b.dataDate || 0));
    const totC = res.rows.reduce((n, r) => n + (r.ev.cls === 'EC' ? r.compens : 0), 0), totClaim = S.events.reduce((n, e) => n + (e.claimed || 0), 0);
    const parts = [];
    parts.push(sec(1, T('Executive summary', 'الملخص التنفيذي'), `<table class="kv"><tr><th>${T('Contract completion date', 'تاريخ الإنجاز التعاقدي')}</th><td>${fd(res.contract)}</td></tr><tr><th>${T('Extension of time claimed', 'مدة التمديد المطالب بها')}</th><td>${totClaim} ${T('days', 'يوم')}</td></tr><tr><th>${T('EOT assessed (working days)', 'EOT المقيَّم (أيام عمل)')}</th><td><b>${res.totalExc}</b></td></tr><tr><th>${T('Of which compensable', 'منها قابل للتعويض')}</th><td>${totC}</td></tr><tr><th>${T('Revised completion date (assessed)', 'تاريخ الإنجاز المعدّل (المقيَّم)')}</th><td><b>${fd(res.revised)}</b></td></tr><tr><th>${T('Approved so far', 'المعتمد حتى الآن')}</th><td>${res.approved} ${T('days', 'يوم')} → ${fd(res.revisedApproved)}</td></tr><tr><th>${T('Contractor-caused delay', 'التأخير بسبب المقاول')}</th><td>${res.totalAll - res.totalExc} ${T('working days', 'يوم عمل')}</td></tr></table>`));
    parts.push(sec(2, T('Method, assumptions and calendars', 'المنهج والافتراضات والتقاويم'), `<ul><li>${T('Unimpacted schedule: the current schedule of the project, re-scheduled (CPM) with data date ' + fd(p.dataDate) + '.', 'الجدول غير المتأثر: الجدول الحالي للمشروع بعد إعادة الجدولة (CPM) بتاريخ بيانات ' + fd(p.dataDate) + '.')}</li><li>${T('Time impact analysis: each event’s fragnet is inserted into a copy; the movement of the project completion date, in working days of the project calendar, is the delay. Cumulative TIA applies excusable events in chronological order.', 'تحليل الأثر الزمني: يُدخل الـ Fragnet لكل حدث في نسخة من الجدول؛ وحركة تاريخ إنجاز المشروع بأيام عمل تقويم المشروع هي التأخير. الـ TIA التراكمي يطبّق الأحداث المعذورة زمنياً.')}</li><li>${T('Float is treated as project-owned; only days that move the completion date are credited. Concurrent delay (excusable with non-excusable) gives time but not money.', 'الفلوت ملك المشروع؛ تُحتسب فقط الأيام التي تحرّك تاريخ الإنجاز. التأخير المتزامن (معذور مع غير معذور) يمنح وقتاً بلا تعويض.')}</li><li>${T('Notice limits: ' + S.noticeDays + ' days from awareness; particulars within ' + S.particularsDays + ' days.' + (S.barLate ? ' Late notice bars the claim.' : ' Late notice is flagged, not barred.'), 'مهل الإخطار: ' + S.noticeDays + ' يوماً من العلم؛ والتفاصيل خلال ' + S.particularsDays + ' يوماً.' + (S.barLate ? ' الإخطار المتأخر يُسقط المطالبة.' : ' الإخطار المتأخر يُنبَّه إليه فقط دون إسقاط.'))}</li></ul>`));
    parts.push(sec(3, T('Baseline and update register', 'سجل الـ Baseline والتحديثات'), tbl([T('Revision', 'المراجعة'), T('Data date', 'تاريخ البيانات'), T('Completion', 'الإنجاز'), T('Reason', 'السبب'), T('Status', 'الحالة')], upd.map((r) => `<tr><td>${E(r.label)}</td><td>${fd(r.dataDate)}</td><td>${fd(r.finish)}</td><td>${E(r.reasonText || r.reason || '')}</td><td>${E(r.status)}</td></tr>`))));
    parts.push(sec(4, T('Delay event register', 'سجل أحداث التأخير'), tbl(['ID', T('Event', 'الحدث'), T('Cause', 'السبب'), T('Class', 'التصنيف'), T('Clause', 'البند'), T('Notice', 'الإخطار'), T('Claimed', 'مطالب'), T('Assessed', 'مقيَّم')], res.rows.map((r) => `<tr><td>${E(r.ev.id)}</td><td>${E(r.ev.title)}</td><td>${E(lbl(cause(r.ev.cause)))}</td><td>${E(L(CLS[r.ev.cls]))}</td><td>${E(r.ev.clause)}</td><td>${r.ni.missing ? T('None', 'لا يوجد') : (r.ni.lateN ? '⚠ ' : '✓ ') + fd(r.ev.notice)}</td><td class="r">${r.ev.claimed || 0}</td><td class="r">${r.assessed}</td></tr>`))));
    parts.push(sec(5, T('Time impact analysis per event', 'تحليل الأثر الزمني لكل حدث'), tbl(['ID', T('Nominal', 'اسمي'), T('Independent', 'مستقل'), T('Critical?', 'حرج؟'), 'TF', T('Float absorbed', 'فلوت مستهلك'), T('Finish with event', 'النهاية مع الحدث')], res.rows.map((r) => `<tr><td>${E(r.ev.id)}</td><td class="r">${r.nominal || ''}</td><td class="r">${cd(r.indep)}</td><td>${r.critical ? T('Yes', 'نعم') : T('No', 'لا')}</td><td class="r">${r.tf == null ? '' : r.tf}</td><td class="r">${r.floatAbsorbed || ''}</td><td>${fd(r.f1)}</td></tr>`))));
    parts.push(sec(6, T('Cumulative EOT', 'EOT التراكمي'), tbl([T('Order', 'الترتيب'), 'ID', T('Event start', 'بداية الحدث'), T('Cumulative Δ (wd)', 'Δ تراكمي (يوم)'), T('EOT days', 'أيام EOT'), T('Compensable', 'قابل للتعويض')], res.rows.map((r, i) => `<tr><td>${i + 1}</td><td>${E(r.ev.id)}</td><td>${fd(r.ev.start)}</td><td class="r">${r.cum == null ? '–' : cd(r.cum)}</td><td class="r">${r.assessed}</td><td class="r">${r.ev.cls === 'EC' ? r.compens : '–'}</td></tr>`), `<tr><td colspan="4"><b>${T('Total', 'الإجمالي')}</b></td><td class="r"><b>${res.totalExc}</b></td><td class="r"><b>${totC}</b></td></tr>`) + `<div class="chart">${X.waterfall(res)}</div>`));
    parts.push(sec(7, T('Windows analysis', 'تحليل النوافذ'), res.windows.length ? tbl([T('Window', 'النافذة'), T('Data dates', 'تواريخ البيانات'), T('Completion', 'الإنجاز'), T('Slip (wd)', 'الانزلاق'), T('Events on critical path', 'أحداث على المسار الحرج')], res.windows.map((w) => `<tr><td>${E(w.a.label)} → ${E(w.b.label)}</td><td>${dates(w.a.dataDate, w.b.dataDate)}</td><td>${dates(w.a.finish, w.b.finish)}</td><td class="r">${cd(w.slip)}</td><td>${E(w.attributed.map((e) => e.id).join(', ')) || '–'}</td></tr>`)) : `<p>${T('Fewer than two saved revisions – not performed.', 'أقل من مراجعتين محفوظتين – لم يُجرَ.')}</p>`));
    parts.push(sec(8, T('Concurrency and float', 'التزامن والفلوت'), tbl(['ID', T('Class', 'التصنيف'), T('Concurrent with non-excusable (wd)', 'متزامن مع غير معذور (يوم)'), T('Float absorbed (d)', 'فلوت مستهلك (يوم)'), T('Compensable days', 'أيام قابلة للتعويض')], res.rows.map((r) => `<tr><td>${E(r.ev.id)}</td><td>${E(L(CLS[r.ev.cls]))}</td><td class="r">${r.overlap || 0}</td><td class="r">${r.floatAbsorbed || 0}</td><td class="r">${r.ev.cls === 'EC' ? r.compens : '–'}</td></tr>`))));
    parts.push(sec(9, T('Event narratives', 'السرد التفصيلي للأحداث'), res.rows.map((r) => `<div class="nar"><h3>${E(r.ev.id)} – ${E(r.ev.title)}</h3><p>${E(narr(r))}</p>${r.ev.desc ? `<p class="mut">${E(r.ev.desc)}</p>` : ''}</div>`).join('')));
    parts.push(sec(10, T('Fragnet appendix', 'ملحق الـ Fragnets'), tbl(['ID', T('Fragnet changes', 'تغييرات الـ Fragnet')], res.rows.map((r) => `<tr><td>${E(r.ev.id)}</td><td>${E(X.opsLabel(r.ev.ops))}</td></tr>`))));
    parts.push(sec(11, T('Reservations', 'التحفظات'), `<p>${T('This analysis is based on the schedule as held in the application and on the facts recorded in the event register. The contractor’s right to revise this assessment as further information becomes available is reserved. Results are indicative until agreed by the parties.', 'يستند هذا التحليل إلى الجدول الموجود في التطبيق وإلى الوقائع المسجلة في سجل الأحداث. يُحتفظ بالحق في تعديل هذا التقييم عند توفر معلومات إضافية. النتائج استرشادية إلى حين اتفاق الأطراف.')}</p>`));
    const meta2 = [[T('Project', 'المشروع'), p.name], [T('Contract no.', 'رقم العقد'), meta.contractNo], [T('Employer', 'صاحب العمل'), meta.employer], [T('Contractor', 'المقاول'), meta.contractor], [T('Prepared by', 'أعدّه'), meta.by], [T('Report date', 'تاريخ التقرير'), meta.date || new Date().toLocaleDateString('en-GB')], [T('Data date', 'تاريخ البيانات'), fd(p.dataDate)]].filter((x) => x[1]);
    const style = `body{font-family:"Segoe UI",Tahoma,Arial,sans-serif;color:#222;margin:0;padding:24px 32px;line-height:1.55;font-size:13px}h1{color:#00778B;margin:0 0 4px;font-size:24px}h2{color:#00778B;border-bottom:2px solid #00778B;padding-bottom:3px;margin:26px 0 8px;font-size:17px}h3{margin:12px 0 2px;font-size:14px}table{border-collapse:collapse;width:100%;margin:6px 0;font-size:12px}th{background:#00778B;color:#fff;padding:5px 8px;text-align:start}td{padding:4px 8px;border-bottom:1px solid #d9e6e9;vertical-align:top}td.r{text-align:end}td.c{text-align:center;color:#888}tfoot td{border-top:2px solid #00778B;background:#f2f8f9}table.kv th{width:42%;background:#eef6f7;color:#222}.mut{color:#666}.nar{page-break-inside:avoid}.chart{margin:10px 0}.meta{display:flex;flex-wrap:wrap;gap:4px 24px;margin:8px 0 14px;font-size:12px;color:#444}section{page-break-inside:auto}@media print{body{padding:0}h2{page-break-after:avoid}}`;
    return `<!doctype html><html lang="${ar ? 'ar' : 'en'}" dir="${ar ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${E(T('Delay & EOT Report', 'تقرير التأخير وتمديد المدة'))} – ${E(p.name)}</title><style>${style}</style></head><body><h1>${E(T('Delay & Extension of Time (EOT) Report', 'تقرير التأخير وتمديد المدة (EOT)'))}</h1><div class="meta">${meta2.map((x) => `<span><b>${E(x[0])}:</b> ${E(x[1])}</span>`).join('')}</div>${parts.join('')}<p class="mut" style="margin-top:24px">${E(P6.versionName())}</p></body></html>`;
  };

  X.tabs.push({ id: 'report', label: () => B('Delay Report', 'تقرير التأخير'), render(el, redo) {
    const p = App.p, S = ensure(p), m = S.meta;
    if (!S.events.some((e) => (e.ops || []).length && e.status !== 'Rejected')) { el.innerHTML = `<p class="hint">${esc(B('Add events with a fragnet in the EOT Register first.', 'أضف أحداثاً بها Fragnet في سجل EOT أولاً.'))}</p>`; return; }
    const f = (id, ph, v) => `<label>${esc(ph)}<input id="${id}" value="${esc(v || '')}"></label>`;
    el.innerHTML = `<div class="dly-bar">${f('rp_c', B('Contract no.', 'رقم العقد'), m.contractNo)}${f('rp_e', B('Employer', 'صاحب العمل'), m.employer)}${f('rp_k', B('Contractor', 'المقاول'), m.contractor)}${f('rp_b', B('Prepared by', 'أعدّه'), m.by)}<label>${esc(B('Language', 'اللغة'))}<select id="rp_l"><option value="en">English</option><option value="ar"${P6.dir() === 'rtl' ? ' selected' : ''}>العربية</option></select></label><button class="btn pri" id="rp_go">${esc(B('Generate report', 'إنشاء التقرير'))}</button><button class="btn" id="rp_print" disabled>${esc(B('Print / PDF', 'طباعة / PDF'))}</button><button class="btn" id="rp_dl" disabled>${esc(B('Download .html', 'تنزيل .html'))}</button></div><iframe id="rp_fr" style="width:100%;height:68vh;border:1px solid #cfe0e3;border-radius:8px;background:#fff"></iframe>`;
    const $ = (s) => el.querySelector(s); let html = '';
    $('#rp_go').onclick = () => {
      S.meta = { contractNo: $('#rp_c').value, employer: $('#rp_e').value, contractor: $('#rp_k').value, by: $('#rp_b').value }; X.save();
      $('#rp_fr').srcdoc = '<p style="font-family:sans-serif">…</p>';
      setTimeout(() => { try { const res = X.eotAnalyse(p); X.last = res; html = X.buildReport(p, res, $('#rp_l').value); $('#rp_fr').srcdoc = html; $('#rp_print').disabled = false; $('#rp_dl').disabled = false; } catch (e) { console.error(e); App.toast(String(e.message || e), true); } }, 30);
    };
    $('#rp_print').onclick = () => { const w = $('#rp_fr').contentWindow; w.focus(); w.print(); };
    $('#rp_dl').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' })); a.download = 'EOT-Delay-Report-' + p.name.replace(/[^\w\-]+/g, '_') + '-v' + P6.VERSION + '.html'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
    void redo;
  } });
})(window);

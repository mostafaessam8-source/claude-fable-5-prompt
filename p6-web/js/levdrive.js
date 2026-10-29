/* P6 Web – Resource Leveling and Driving Path.
   Leveling: serial, float-priority levelling of labour resources against a per-resource limit (hours/day). Not-started activities are pushed with an
   SNET constraint (original constraint kept in task.lv so "Clear leveling" restores it). Runs on a copy first; Apply writes it to the schedule (undoable).
   Driving path: traces back from a target activity through relationships with zero relationship float (plus optional "near driving" within N days). */
(function (g) {
  'use strict';
  const P6 = g.P6, App = g.App, D = App.dialogs;
  const esc = P6.esc, B = (en, ar) => (P6.dir() === 'rtl' ? ar : en);
  const fd = (d) => (d == null ? '' : P6.fmtDate(d));
  const clone = (p) => JSON.parse(JSON.stringify(p, (k, v) => (k === 'xer' ? undefined : v)));
  const calOf = (p, t) => p.cals.find((c) => c.id === t.cal) || p.cals.find((c) => c.id === p.defCal) || p.cals[0];

  /* ---------- demand ---------- */
  function demand(p, limits) {
    const dd = p.dataDate, byId = new Map(p.tasks.map((t) => [t.id, t])), dem = new Map(), who = new Map(), single = new Map();
    for (const a of p.asg) {
      if (!limits.has(a.rsrc)) continue;
      const t = byId.get(a.task); if (!t || t.status === 'C' || P6.isHammock(t) || t.es == null || t.ef == null) continue;
      const hrs = t.status === 'NS' ? a.qty : P6.asgSplit(a, t).rem, s = t.status === 'NS' ? t.es : Math.max(dd + 1, t.es), e = t.ef;
      if (!(hrs > 0) || e < s) continue;
      const cal = calOf(p, t), days = []; for (let d = s; d <= e; d++) if (P6.isWork(cal, d)) days.push(d);
      if (!days.length) days.push(s);
      const per = hrs / days.length;
      if (!dem.has(a.rsrc)) { dem.set(a.rsrc, new Map()); who.set(a.rsrc, new Map()); }
      const dm = dem.get(a.rsrc), wm = who.get(a.rsrc);
      single.set(a.rsrc, Math.max(single.get(a.rsrc) || 0, per));
      for (const d of days) { dm.set(d, (dm.get(d) || 0) + per); if (!wm.has(d)) wm.set(d, []); wm.get(d).push({ t, per }); }
    }
    return { dem, who, single };
  }
  const peakOf = (m) => { let x = 0; if (m) for (const v of m.values()) if (v > x) x = v; return x; };
  const overDays = (m, lim) => { let n = 0; if (m) for (const v of m.values()) if (v > lim + 1e-6) n++; return n; };

  /* P6.levelResources(p, { limits: {rsrcId: hoursPerDay}, withinFloat, maxMs }) -> result (p is not modified).
     Serial scheme: not-started activities are taken in early-start / least-float order and placed at the earliest start where the resources still fit
     under the limits given the activities already placed (started / completed ones count as fixed). */
  P6.levelResources = function (p, opt) {
    const limits = new Map(Object.entries(opt.limits || {}).filter(([, v]) => v > 0).map(([k, v]) => [+k, +v]));
    const base = clone(p); P6.schedule(base); const tr = clone(p); P6.schedule(tr);
    const before = demand(base, limits), t0 = Date.now(), maxMs = opt.maxMs || 8000; let timedOut = false;
    const origEs = new Map(base.tasks.map((t) => [t.id, [t.es, t.ef]])), dd = tr.dataDate;
    const asgOf = new Map(); for (const a of tr.asg) if (limits.has(a.rsrc)) { if (!asgOf.has(a.task)) asgOf.set(a.task, []); asgOf.get(a.task).push(a); }
    const workDays = (t, s, n) => { const cal = calOf(tr, t), out = []; for (let d = s, g = 0; out.length < n && g < 4000; d++, g++) if (P6.isWork(cal, d)) out.push(d); return out; };
    const spanDays = (t) => { const cal = calOf(tr, t), n = []; for (let d = t.es; d <= t.ef; d++) if (P6.isWork(cal, d)) n.push(d); return n.length || 1; };
    const prof = new Map(); [...limits.keys()].forEach((rid) => prof.set(rid, new Map()));
    const add = (t, days, sign) => { for (const a of asgOf.get(t.id) || []) { const hrs = t.status === 'NS' ? a.qty : P6.asgSplit(a, t).rem; if (!(hrs > 0)) continue; const per = hrs / days.length, m = prof.get(a.rsrc); for (const d of days) m.set(d, Math.max(0, (m.get(d) || 0) + sign * per)); } };
    const daysOf = (t) => { const cal = calOf(tr, t), s = t.status === 'NS' ? t.es : Math.max(dd + 1, t.es), out = []; for (let d = s; d <= t.ef; d++) if (P6.isWork(cal, d)) out.push(d); return out.length ? out : [s]; };
    const fits = (t, days) => (asgOf.get(t.id) || []).every((a) => { const hrs = t.status === 'NS' ? a.qty : 0; if (!(hrs > 0)) return true; const per = hrs / days.length, m = prof.get(a.rsrc), lim = Math.max(limits.get(a.rsrc), per); return days.every((d) => (m.get(d) || 0) + per <= lim + 1e-6); });
    // fixed activities: started / completed (remaining work) and anything that cannot move
    const movable = (t) => t.status === 'NS' && asgOf.has(t.id) && !P6.isMile(t) && !P6.isHammock(t) && (!t.ct || t.ct === 'SNET' || t.lv);
    for (const t of tr.tasks) if (asgOf.has(t.id) && t.status !== 'C' && t.es != null && !movable(t) && !P6.isHammock(t)) add(t, daysOf(t), 1);
    const pending = new Set(tr.tasks.filter((t) => movable(t) && t.es != null).map((t) => t.id)), moved = new Set(); let steps = 0;
    while (pending.size) {
      if (Date.now() - t0 > maxMs) { timedOut = true; break; }
      let t = null; for (const id of pending) { const x = tr.tasks.find((q) => q.id === id); if (!t || x.es < t.es || (x.es === t.es && (x.tf == null ? 1e9 : x.tf) < (t.tf == null ? 1e9 : t.tf))) t = x; }
      pending.delete(t.id); steps++;
      const n = spanDays(t); let s = t.es, days = workDays(t, s, n), tries = 0;
      while (!fits(t, days) && tries++ < 1500) { s++; days = workDays(t, s, n); }
      if (tries >= 1500) { add(t, daysOf(t), 1); continue; }
      const late = days[0] - t.es;
      if (late > 0 && !(opt.withinFloat && late > Math.max(0, t.tf || 0))) {
        if (!t.lv) t.lv = { ct: t.ct || '', cd: t.cd == null ? null : t.cd };
        t.ct = 'SNET'; t.cd = Math.max(days[0], t.lv.ct === 'SNET' && t.lv.cd != null ? t.lv.cd : 0); moved.add(t.id); P6.schedule(tr);
        // placed tasks may have shifted with their predecessors: rebuild the profile from current dates
        for (const m of prof.values()) m.clear();
        for (const x of tr.tasks) if (asgOf.has(x.id) && x.status !== 'C' && x.es != null && !P6.isHammock(x) && !pending.has(x.id)) add(x, daysOf(x), 1);
      } else add(t, daysOf(t), 1);
    }
    const after = demand(tr, limits);
    const fin = (q) => q.tasks.reduce((m, t) => (t.ef != null && t.ef > m ? t.ef : m), -Infinity);
    const moves = [...moved].map((id) => { const t = tr.tasks.find((x) => x.id === id), o = origEs.get(id); return { t, es0: o[0], ef0: o[1], delay: t.es - o[0], lv: t.lv, cd: t.cd }; }).filter((m) => m.delay > 0).sort((a, b) => a.es0 - b.es0);
    const rs = new Map(p.rsrc.map((r) => [r.id, r]));
    const rows = [...limits].map(([rid, lim]) => ({ r: rs.get(rid), lim, peak0: peakOf(before.dem.get(rid)), peak1: peakOf(after.dem.get(rid)), single: before.single.get(rid) || 0, over0: overDays(before.dem.get(rid), lim), over1: overDays(after.dem.get(rid), lim), d0: before.dem.get(rid), d1: after.dem.get(rid) }));
    return { moves, rows, fin0: fin(base), fin1: fin(tr), iters: steps, timedOut, tr, base };
  };

  P6.applyLeveling = function (p, moves) {
    for (const m of moves) { const t = p.tasks.find((x) => x.id === m.t.id); if (!t) continue; if (!t.lv) t.lv = m.lv; t.ct = 'SNET'; t.cd = m.cd; }
  };
  P6.clearLeveling = function (p) {
    let n = 0; for (const t of p.tasks) if (t.lv) { t.ct = t.lv.ct; t.cd = t.lv.cd; delete t.lv; n++; } return n;
  };

  function histogram(r) {
    const days = [...new Set([...(r.d0 ? r.d0.keys() : []), ...(r.d1 ? r.d1.keys() : [])])].sort((a, b) => a - b);
    if (!days.length) return '';
    const lo = days[0], hi = days[days.length - 1], span = hi - lo + 1, bw = span > 180 ? 7 : 1, n = Math.ceil(span / bw), W = 720, H = 150, bx = W / n;
    const agg = (m) => { const a = new Array(n).fill(0); if (m) for (const [d, v] of m) { const i = Math.floor((d - lo) / bw); if (v > a[i]) a[i] = v; } return a; };
    const a0 = agg(r.d0), a1 = agg(r.d1), mx = Math.max(r.lim * 1.15, ...a0, ...a1, 1), y = (v) => H - 18 - (v / mx) * (H - 24);
    const bars = (a, col, off, w) => a.map((v, i) => (v > 0 ? `<rect x="${(i * bx + off).toFixed(1)}" y="${y(v).toFixed(1)}" width="${Math.max(1, w).toFixed(1)}" height="${(H - 18 - y(v)).toFixed(1)}" fill="${col}"/>` : '')).join('');
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-height:170px" dir="ltr">${bars(a0, '#b9c4c6', 0, bx * 0.5)}${bars(a1, '#00778B', bx * 0.5, bx * 0.5)}<line x1="0" x2="${W}" y1="${y(r.lim)}" y2="${y(r.lim)}" stroke="#c0392b" stroke-width="1.5" stroke-dasharray="5 3"/><text x="4" y="${y(r.lim) - 3}" font-size="10" fill="#c0392b">limit ${r.lim} h/d</text><text x="2" y="${H - 4}" font-size="10" fill="#555">${fd(lo)}</text><text x="${W - 2}" y="${H - 4}" font-size="10" fill="#555" text-anchor="end">${fd(hi)}</text></svg>`;
  }

  App.levelResources = function () {
    const p = App.p; if (!p) return;
    const labor = p.rsrc.filter((r) => r.type === 'RT_Labor' && p.asg.some((a) => a.rsrc === r.id));
    if (!labor.length) return D.modal({ title: B('Level Resources', 'تسوية الموارد'), cls: 'mid', body: `<p>${esc(B('No labour resources are assigned to activities.', 'لا توجد موارد عمالة معيّنة على الأنشطة.'))}</p>`, buttons: [{ label: P6.t('close'), fn: () => {} }] });
    const base = clone(p); P6.schedule(base); const dm0 = demand(base, new Map(labor.map((r) => [r.id, 1e9]))).dem;
    const root = document.createElement('div'); root.className = 'wif'; root.dir = P6.dir(); let res = null, histRid = null;
    const nLv = p.tasks.filter((t) => t.lv).length;
    root.innerHTML = `<p class="hint">${esc(B('Set a daily limit (hours/day) per resource. Leave blank to ignore a resource. Activities with the most float are delayed first; started / completed / constrained activities are never moved.', 'حدّد حدّاً يومياً (ساعات/يوم) لكل مورد، واترك الخانة فارغة لتجاهل المورد. يتم تأخير الأنشطة الأكثر فلوت أولاً، ولا يتم تحريك الأنشطة التي بدأت أو اكتملت أو لها قيود.'))}</p>
      <div class="tbl-scroll" style="max-height:200px"><table class="mini cmpt"><thead><tr><th>${esc(B('Resource', 'المورد'))}</th><th>${esc(B('Peak now (h/day)', 'الذروة الحالية (س/يوم)'))}</th><th>${esc(B('Limit (h/day)', 'الحد (س/يوم)'))}</th></tr></thead><tbody>${labor.map((r) => `<tr><td>${esc(r.name)}</td><td>${peakOf(dm0.get(r.id)).toFixed(1)}</td><td><input type="number" min="0" step="0.5" data-r="${r.id}" value="${r.limit || ''}" style="width:90px"></td></tr>`).join('')}</tbody></table></div>
      <div class="wif-run"><label><input type="checkbox" id="lv_fl"> ${esc(B('Level only within float (keep the finish date)', 'التسوية داخل الفلوت فقط (الحفاظ على تاريخ النهاية)'))}</label></div>
      <div class="wif-run"><button class="btn pri" id="lv_run">▶ ${esc(B('Level', 'سوّي'))}</button><button class="btn" id="lv_apply" disabled>${esc(B('Apply to schedule', 'طبّق على الجدول'))}</button><button class="btn" id="lv_xl" disabled>${esc(B('Export to Excel', 'تصدير Excel'))}</button><button class="btn" id="lv_clr"${nLv ? '' : ' disabled'}>${esc(B('Clear leveling', 'إلغاء التسوية'))} (${nLv})</button></div><div id="lv_out"></div>`;
    const $ = (s) => root.querySelector(s);
    const limits = () => { const o = {}; root.querySelectorAll('[data-r]').forEach((i) => { const v = parseFloat(i.value); if (v > 0) o[i.dataset.r] = v; }); return o; };
    function show() {
      const s = res, out = $('#lv_out'), dF = s.fin1 - s.fin0, tot = s.rows.reduce((a, r) => a + r.over1, 0);
      const r0 = s.rows.find((r) => r.r.id === histRid) || s.rows[0]; histRid = r0.r.id;
      out.innerHTML = (s.timedOut ? `<p class="cmp-bad">⚠ ${esc(B('Stopped at the time limit – result is partial.', 'توقف عند حد الوقت – النتيجة جزئية.'))}</p>` : '')
        + `<div class="cmpcards"><div class="cmpc ${dF > 0 ? 'bad' : 'good'}"><b>${dF > 0 ? '+' : ''}${dF}</b><span>${esc(B('Finish movement (days)', 'حركة النهاية (يوم)'))}</span></div><div class="cmpc"><b>${s.moves.length}</b><span>${esc(B('Activities delayed', 'أنشطة مؤجلة'))}</span></div><div class="cmpc ${tot ? 'bad' : 'good'}"><b>${tot}</b><span>${esc(B('Overloaded days left', 'أيام زيادة حمل متبقية'))}</span></div><div class="cmpc"><b>${fd(s.fin1)}</b><span>${esc(B('New finish', 'النهاية الجديدة'))} (${fd(s.fin0)})</span></div></div>`
        + `<div class="tbl-scroll" style="max-height:140px"><table class="mini cmpt"><thead><tr><th>${esc(B('Resource', 'المورد'))}</th><th>${esc(B('Limit', 'الحد'))}</th><th>${esc(B('Peak before → after', 'الذروة قبل → بعد'))}</th><th>${esc(B('Over-limit days before → after', 'أيام التجاوز قبل → بعد'))}</th></tr></thead><tbody>${s.rows.map((r) => `<tr data-h="${r.r.id}" style="cursor:pointer"><td>${esc(r.r.name)}</td><td>${r.lim}</td><td>${r.peak0.toFixed(1)} → <b class="${r.peak1 > r.lim + 1e-6 ? 'cmp-bad' : 'cmp-good'}">${r.peak1.toFixed(1)}</b></td><td>${r.over0} → <b class="${r.over1 ? 'cmp-bad' : 'cmp-good'}">${r.over1}</b></td></tr>`).join('')}</tbody></table></div>`
        + (s.rows.some((r) => r.single > r.lim + 1e-6) ? `<p class="hint">ⓘ ${esc(B('Some activities alone need more than the limit (' + s.rows.filter((r) => r.single > r.lim + 1e-6).map((r) => r.r.name + ' ' + r.single.toFixed(0) + ' h/d').join(', ') + ') – they can only be separated from others, not reduced.', 'بعض الأنشطة وحدها تحتاج أكثر من الحد (' + s.rows.filter((r) => r.single > r.lim + 1e-6).map((r) => r.r.name + ' ' + r.single.toFixed(0) + ' س/يوم').join('، ') + ') – يمكن فصلها عن غيرها فقط، لا تقليلها.'))}</p>` : '')
        + `<p class="hint">${esc(r0.r.name)} – <span style="color:#8a9a9d">■</span> ${esc(B('before', 'قبل'))} <span style="color:#00778B">■</span> ${esc(B('after', 'بعد'))}</p>${histogram(r0)}`
        + `<div class="tbl-scroll" style="max-height:200px"><table class="mini cmpt"><thead><tr><th>${esc(B('Activity', 'النشاط'))}</th><th>${esc(B('Name', 'الاسم'))}</th><th>${esc(B('Start before → after', 'البداية قبل → بعد'))}</th><th>${esc(B('Delay (d)', 'التأخير (يوم)'))}</th><th>${esc(B('Float', 'الفلوت'))}</th></tr></thead><tbody>${s.moves.slice(0, 500).map((m) => `<tr><td>${esc(m.t.code)}</td><td>${esc(m.t.name)}</td><td>${fd(m.es0)} → ${fd(m.t.es)}</td><td class="cmp-bad">+${m.delay}</td><td>${m.t.tf == null ? '' : m.t.tf}</td></tr>`).join('') || `<tr><td colspan="5" style="text-align:center;color:#888">${esc(B('No overloads – nothing to level', 'لا يوجد تجاوز – لا شيء للتسوية'))}</td></tr>`}</tbody></table></div>`;
      out.querySelectorAll('[data-h]').forEach((tr) => { tr.onclick = () => { histRid = +tr.dataset.h; show(); }; });
      $('#lv_apply').disabled = !s.moves.length; $('#lv_xl').disabled = false;
    }
    $('#lv_run').onclick = () => {
      const lim = limits(); if (!Object.keys(lim).length) return App.toast(B('Enter a limit for at least one resource', 'أدخل حداً لمورد واحد على الأقل'), true);
      $('#lv_out').innerHTML = `<p class="hint">${esc(B('Leveling…', 'جارٍ التسوية…'))}</p>`;
      setTimeout(() => { try { res = P6.levelResources(p, { limits: lim, withinFloat: $('#lv_fl').checked }); show(); } catch (e) { console.error(e); App.toast(String(e.message || e), true); } }, 30);
    };
    $('#lv_apply').onclick = () => {
      if (!res || !res.moves.length) return; const lim = limits();
      App.mutate(B('Level resources', 'تسوية الموارد'), () => { labor.forEach((r) => { r.limit = lim[r.id] || 0; }); P6.applyLeveling(App.p, res.moves); });
      App.toast(B(res.moves.length + ' activities delayed by leveling', 'تم تأجيل ' + res.moves.length + ' نشاط بالتسوية')); if (App.p.tasks.some((t) => t.lv)) $('#lv_clr').disabled = false;
    };
    $('#lv_clr').onclick = () => { if (!confirm(B('Remove leveling delays from all activities?', 'إزالة تأخيرات التسوية من كل الأنشطة؟'))) return; let n = 0; App.mutate(B('Clear leveling', 'إلغاء التسوية'), () => { n = P6.clearLeveling(App.p); }); App.toast(B(n + ' activities restored', 'تمت استعادة ' + n + ' نشاط')); $('#lv_clr').disabled = true; };
    $('#lv_xl').onclick = () => {
      if (!res) return;
      App.xlsxBook('Resource-Leveling.xlsx', [
        { name: 'Summary', title: B('Resource leveling', 'تسوية الموارد'), subtitle: p.name, cols: [{ h: 'Resource', w: 28 }, { h: 'Limit h/day', t: 'n', w: 12 }, { h: 'Peak before', t: 'n', w: 12 }, { h: 'Peak after', t: 'n', w: 12 }, { h: 'Over-limit days before', t: 'n', w: 14 }, { h: 'Over-limit days after', t: 'n', w: 14 }], rows: res.rows.map((r) => [r.r.name, r.lim, +r.peak0.toFixed(2), +r.peak1.toFixed(2), r.over0, r.over1]) },
        { name: 'Delayed activities', title: B('Activities delayed by leveling', 'أنشطة مؤجلة بالتسوية'), subtitle: B('Project finish ', 'نهاية المشروع ') + fd(res.fin0) + ' → ' + fd(res.fin1), cols: [{ h: 'Activity ID', w: 16 }, { h: 'Activity Name', w: 46 }, { h: 'Start before', t: 'd', w: 14 }, { h: 'Start after', t: 'd', w: 14 }, { h: 'Finish after', t: 'd', w: 14 }, { h: 'Delay (days)', t: 'n', w: 12 }, { h: 'Total float', t: 'n', w: 11 }], rows: res.moves.map((m) => [m.t.code, m.t.name, m.es0, m.t.es, m.t.ef, m.delay, m.t.tf]) }
      ]);
    };
    D.modal({ title: B('Level Resources', 'تسوية الموارد'), cls: 'wide dsh-modal', body: root, sticky: true, buttons: [{ label: P6.t('close'), fn: () => {} }] });
  };

  /* ---------- driving path ---------- */
  P6.drivingPath = function (p, targetId, near) {
    const by = new Map(p.tasks.map((t) => [t.id, t])), preds = new Map();
    for (const r of p.rels) { if (!preds.has(r.s)) preds.set(r.s, []); preds.get(r.s).push(r); }
    const seen = new Map(), st = [targetId]; seen.set(targetId, { t: by.get(targetId), via: null, drive: true });
    while (st.length) {
      const id = st.pop();
      for (const r of preds.get(id) || []) {
        const pt = by.get(r.p); if (!pt || r.rf == null || r.rf > near) continue;
        const drive = r.rf <= 0 && seen.get(id).drive;
        if (!seen.has(r.p)) { seen.set(r.p, { t: pt, via: r, to: by.get(id), drive }); st.push(r.p); }
        else if (drive && !seen.get(r.p).drive) { Object.assign(seen.get(r.p), { via: r, to: by.get(id), drive: true }); st.push(r.p); }
      }
    }
    return [...seen.values()].sort((a, b) => (a.t.es || 0) - (b.t.es || 0) || (a.t.ef || 0) - (b.t.ef || 0));
  };

  App.drivingPath = function () {
    const p = App.p; if (!p) return;
    const sel = App.selTasks ? App.selTasks() : [], last = p.tasks.reduce((m, t) => (t.ef != null && (!m || t.ef > m.ef) ? t : m), null);
    const start = sel[0] || last; if (!start) return;
    const root = document.createElement('div'); root.className = 'wif'; root.dir = P6.dir(); let rows = [];
    root.innerHTML = `<datalist id="dp_codes">${p.tasks.slice(0, 3000).map((t) => `<option value="${esc(t.code)}">${esc(t.name)}</option>`).join('')}</datalist>
      <div class="wif-add"><label>${esc(B('Target activity', 'النشاط الهدف'))}</label><input id="dp_t" list="dp_codes" value="${esc(start.code)}" style="width:130px"><label>${esc(B('Include near-driving (float ≤ days)', 'تضمين شبه الحاكم (فلوت ≤ أيام)'))}</label><input id="dp_n" type="number" min="0" value="0" style="width:60px"><button class="btn pri" id="dp_go">${esc(B('Trace', 'تتبّع'))}</button><button class="btn" id="dp_sel">${esc(B('Select in table', 'تحديد في الجدول'))}</button><button class="btn" id="dp_xl">${esc(B('Export to Excel', 'تصدير Excel'))}</button></div><div id="dp_out"></div>`;
    const $ = (s) => root.querySelector(s);
    function run() {
      const t = p.tasks.find((x) => String(x.code).toLowerCase() === $('#dp_t').value.trim().toLowerCase()); if (!t) return App.toast(B('Activity not found', 'النشاط غير موجود'), true);
      if (p.imported || t.es == null) App.toast(B('Tip: press F9 to schedule first so relationship float is current.', 'تلميح: اضغط F9 للجدولة أولاً لتكون فلوت العلاقات محدّثة.'));
      const near = Math.max(0, parseInt($('#dp_n').value, 10) || 0); rows = P6.drivingPath(p, t.id, near);
      const nd = rows.filter((r) => r.drive).length, first = rows.reduce((m, r) => (r.t.es != null && (m == null || r.t.es < m) ? r.t.es : m), null);
      $('#dp_out').innerHTML = `<div class="cmpcards"><div class="cmpc"><b>${nd}</b><span>${esc(B('Driving activities', 'أنشطة حاكمة'))}</span></div><div class="cmpc"><b>${rows.length - nd}</b><span>${esc(B('Near-driving', 'شبه حاكمة'))}</span></div><div class="cmpc"><b>${first != null && t.ef != null ? t.ef - first : '–'}</b><span>${esc(B('Path span (days)', 'مدة المسار (يوم)'))}</span></div><div class="cmpc"><b>${fd(t.ef)}</b><span>${esc(B('Target finish', 'نهاية الهدف'))}</span></div></div>`
        + `<div class="tbl-scroll"><table class="mini cmpt"><thead><tr><th>${esc(B('Activity', 'النشاط'))}</th><th>${esc(B('Name', 'الاسم'))}</th><th>${esc(B('Start', 'بداية'))}</th><th>${esc(B('Finish', 'نهاية'))}</th><th>${esc(B('Drives', 'يحكم'))}</th><th>${esc(B('Rel. float', 'فلوت العلاقة'))}</th><th>${esc(B('Total float', 'الفلوت'))}</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.t.code)}</td><td>${esc(r.t.name)}</td><td>${fd(r.t.es)}</td><td>${fd(r.t.ef)}</td><td>${r.via ? esc(r.to.code) + ' (' + r.via.type + (r.via.lag ? (r.via.lag > 0 ? '+' : '') + r.via.lag : '') + ')' : '🎯'}</td><td>${r.via ? r.via.rf : ''}</td><td>${r.t.tf == null ? '' : r.t.tf}</td><td class="${r.drive ? 'cmp-bad' : ''}">${r.drive ? esc(B('Driving', 'حاكم')) : esc(B('Near', 'شبه'))}</td></tr>`).join('')}</tbody></table></div>`;
    }
    $('#dp_go').onclick = run;
    $('#dp_sel').onclick = () => { if (rows.length) { App.setSel(rows.map((r) => 't' + r.t.id)); App.refresh(); App.toast(B(rows.length + ' activities selected', 'تم تحديد ' + rows.length + ' نشاط')); } };
    $('#dp_xl').onclick = () => { if (rows.length) App.xlsxBook('Driving-Path.xlsx', [{ name: 'Driving path', title: B('Driving path to ', 'المسار الحاكم إلى ') + $('#dp_t').value, subtitle: p.name, cols: [{ h: 'Activity ID', w: 16 }, { h: 'Activity Name', w: 46 }, { h: 'Start', t: 'd', w: 13 }, { h: 'Finish', t: 'd', w: 13 }, { h: 'Drives', w: 14 }, { h: 'Rel. type', w: 9 }, { h: 'Lag', t: 'n', w: 7 }, { h: 'Rel. float', t: 'n', w: 10 }, { h: 'Total float', t: 'n', w: 10 }, { h: 'Kind', w: 10 }], rows: rows.map((r) => [r.t.code, r.t.name, r.t.es, r.t.ef, r.via ? r.to.code : 'TARGET', r.via ? r.via.type : '', r.via ? r.via.lag || 0 : '', r.via ? r.via.rf : '', r.t.tf, r.drive ? 'Driving' : 'Near']), fill: (r) => (r[9] === 'Driving' ? '#FDE2E0' : null) }]); };
    D.modal({ title: B('Driving Path', 'المسار الحاكم'), cls: 'wide dsh-modal', body: root, sticky: true, buttons: [{ label: P6.t('close'), fn: () => {} }] });
    run();
  };
})(window);

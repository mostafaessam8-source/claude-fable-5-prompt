/* Slides 7-8: monthly cash flow + S-curve, and the cash-flow matrix */
(function (G) {
  const Z = G.Z, F = Z.F, dt = Z.dt, A = Z.app;
  const ui = () => (A.s.ui.cf = A.s.ui.cf || { dim: A.mode ? 'phase' : 'group', per: A.mode ? 3 : 1, basis: 'cost' });
  const mxui = () => (A.s.ui.mx = A.s.ui.mx || { unit: 'k', heat: true });

  A.changes.status = (el) => { A.s.ui.status = dt.parse(el.value) || null; A.refilter(); };
  A.actions.clearStatus = () => { A.s.ui.status = null; A.refilter(); };
  A.actions.cfBasis = (el) => { ui().basis = el.dataset.b; A.refilter(); };
  A.actions.cfPer = (el) => { ui().per = +el.dataset.p; ui().sel = null; A.refilter(); };
  A.actions.cfSel = (el) => { ui().sel = +el.dataset.k; const t = document.querySelector('#tip'); if (t) t.style.display = 'none'; A.refilter(); };
  A.actions.cfClose = () => { ui().sel = null; A.refilter(); };
  A.actions.cfAdv = (el) => { ui().adv = el.dataset.v === '1'; A.refilter(); };
  A.actions.cfDim = (el) => { ui().dim = el.dataset.d; ui().sel = null; A.refilter(); };
  A.actions.mxUnit = (el) => { mxui().unit = el.dataset.u; A.refilter(); };
  A.actions.mxHeat = () => { mxui().heat = !mxui().heat; A.refilter(); };


  /* ---- export the current view (stack-by + period) to a SAR-styled Excel workbook ---- */
  A.actions.cfExport = () => {
    const M = A.s.M, u = ui(), dim = u.dim, per = u.per || 1, adv = u.adv !== false, pay = M.pay, X = Z.xlsx;
    const agg = Z.aggregate(M, A.vis, dim === 'all' ? 'all' : dim), P = periods(M, per), keys = ORDER[dim].filter((k) => agg.map[k]);
    const ar = A.isAr(), Lx = (en, a) => (ar ? a : en), nm = (t) => (ar ? Z.i18n.tr(t) : t), dfm = (d) => (ar ? Z.i18n.tr(dt.fmt(d)) : dt.fmt(d)), dmy = (d) => (ar ? Z.i18n.tr(dt.fmtMY(d).replace('-', ' 20')) : dt.fmtMY(d));
    const DN = { group: Lx('WBS group', 'مجموعة WBS'), epc: Lx('EPC category', 'فئة EPC'), phase: Lx('Phase', 'المرحلة'), all: Lx('Total only', 'الإجمالي فقط') };
    const PNm = { 1: Lx('Monthly', 'شهري'), 3: Lx('Quarterly', 'ربع سنوي'), 6: Lx('Half-yearly', 'نصف سنوي'), 12: Lx('Yearly', 'سنوي') };
    const C = (v, s, f) => ({ v, s, f }), n = P, tc = n + 1, L = (k) => X.col(k);
    const R = [];
    R.push([C(Lx('Zulfi Railway Station – Cash Flow', 'محطة قطار الزلفي – التدفقات النقدية'), 'title')]);
    R.push([C(ar ? `التقسيم: ${DN[dim]}  ·  العرض: ${PNm[per]}  ·  بالريال السعودي دون ضريبة القيمة المضافة  ·  أمر البدء ${dfm(M.start)}  ·  الإنجاز ${dfm(M.finish)}${adv ? `  ·  دفعة مقدمة ${pay.pct}% عند البدء تُسترد شهرياً من الشهر ${pay.from}` : ''}` : `Stack by: ${DN[dim]}  ·  View: ${PNm[per]}  ·  SAR excl. VAT  ·  NTP ${dt.fmt(M.start)}  ·  Completion ${dt.fmt(M.finish)}${adv ? `  ·  Advance ${pay.pct}% at NTP, recovered monthly from month ${pay.from}` : ''}`, 'sub')]);
    R.push([]);
    const PL = (k) => (ar ? { 1: 'ش', 3: 'ر', 6: 'ن', 12: 'س' }[per] + (k + 1) : pLabel(M, k, per));
    const hd = [C(Lx('Item', 'البند'), 'headL')], hs = [C('', 'headSub')];
    for (let k = 0; k < P; k++) { hd.push(C(PL(k), 'head')); hs.push(C(dmy(M.bs[k * per]) + (per > 1 ? ' – ' + dmy(M.bs[lastIdx(M, k, per) + 1] - 1) : ''), 'headSub')); }
    hd.push(C(Lx('Total', 'الإجمالي'), 'head')); hs.push(C('', 'headSub')); R.push(hd, hs);
    const first = R.length + 1; let sums = new Array(P).fill(0);
    keys.forEach((key) => {
      const row = [C(nm(seriesMeta(dim, key).name), 'lab')]; let t = 0;
      for (let k = 0; k < P; k++) { const v = sumP(agg.map[key], k, per); row.push(C(v, 'num')); sums[k] += v; t += v; }
      const r = R.length + 1; row.push(C(t, 'sNum', `SUM(B${r}:${L(n)}${r})`)); R.push(row);
    });
    const last = R.length, totRow = R.length + 1;
    const tot = [C(Lx('Total work cost', 'إجمالي تكلفة الأعمال'), 'sLab')]; let gt = 0;
    for (let k = 0; k < P; k++) { tot.push(C(sums[k], 'sNum', `SUM(${L(k + 1)}${first}:${L(k + 1)}${last})`)); gt += sums[k]; }
    tot.push(C(gt, 'sNum', `SUM(B${totRow}:${L(n)}${totRow})`)); R.push(tot);
    let netRow = totRow;
    if (adv) {
      const ain = [], rec = [], net = [];
      for (let k = 0; k < P; k++) { ain.push(sumP(pay.advIn, k, per)); rec.push(sumP(pay.rec, k, per)); }
      const aR = R.length + 1, rR = aR + 1; netRow = rR + 1;
      R.push([C(Lx('Advance payment received', 'الدفعة المقدمة المستلمة'), 'lab'), ...ain.map((v) => C(v, 'num')), C(ain.reduce((x, y) => x + y, 0), 'sNum', `SUM(B${aR}:${L(n)}${aR})`)]);
      R.push([C(Lx('Advance recovery', 'استرداد الدفعة المقدمة'), 'lab'), ...rec.map((v) => C(-v, 'neg')), C(-rec.reduce((x, y) => x + y, 0), 'sNum', `SUM(B${rR}:${L(n)}${rR})`)]);
      for (let k = 0; k < P; k++) net.push(sums[k] + ain[k] - rec[k]);
      R.push([C(Lx('Net payment', 'صافي الدفعة'), 'tLab'), ...net.map((v, k) => C(v, 'tNum', `${L(k + 1)}${totRow}+${L(k + 1)}${aR}+${L(k + 1)}${rR}`)), C(net.reduce((x, y) => x + y, 0), 'tNum', `SUM(B${netRow}:${L(n)}${netRow})`)]);
    }
    R.push([]);
    // cumulative blocks
    const cum = (label, src, pctLabel) => {
      const cr = R.length + 1, row = [C(label, 'zLab')]; let acc = 0, tv = src.reduce((x, y) => x + y, 0);
      src.forEach((v, k) => { acc += v; row.push(C(acc, 'zNum', k ? `${L(k)}${cr}+${L(k + 1)}${src === cs ? totRow : netRow}` : `${L(1)}${src === cs ? totRow : netRow}`)); });
      row.push(C('', 'zLab')); R.push(row);
      R.push([C(pctLabel, 'lab'), ...src.map((_, k) => C(tv ? src.slice(0, k + 1).reduce((x, y) => x + y, 0) / tv : 0, 'pct', `${L(k + 1)}${cr}/${L(n)}${src === cs ? totRow : netRow}`)), C('', 'lab')]);
    };
    const cs = sums.slice();
    cum(Lx('Cumulative work cost', 'تكلفة الأعمال التراكمية'), cs, Lx('Cumulative work cost %', 'نسبة تكلفة الأعمال التراكمية'));
    if (adv) { const net = sums.map((v, k) => v + sumP(pay.advIn, k, per) - sumP(pay.rec, k, per)); cum(Lx('Cumulative payments (with advance)', 'الدفعات التراكمية (مع الدفعة المقدمة)'), net, Lx('Cumulative payments %', 'نسبة الدفعات التراكمية')); }
    R.push([]);
    R.push([C(ar ? `المصدر: WBS / CBS / الجدول الزمني (26 شهراً) لمشروع محطة قطار الزلفي · تاريخ الإنشاء ${new Date().toISOString().slice(0, 10)} من العرض التفاعلي. تشمل التعديلات الحالية (التواريخ والافتراضات). الدفعة المقدمة على مستوى العقد كاملاً.` : `Source: Zulfi Railway Station WBS / CBS / 26-month schedule · generated ${new Date().toISOString().slice(0, 10)} from the interactive presentation. Scenario edits (dates, assumptions) are included. Filters on the presentation apply to the cost rows; advance payment is for the whole contract.`, 'note')]);
    const s1 = { name: 'Cash flow', cols: [34, ...new Array(P).fill(per === 1 ? 13 : 16), 16], rows: R, freeze: { x: 1, y: 5 }, rtl: ar, footer: Lx('Zulfi Railway Station – Cash flow', 'محطة قطار الزلفي – التدفقات النقدية') };
    // sheet 2: schedule
    const acts = A.visList(), S = [];
    S.push([C(Lx('Zulfi Railway Station – Schedule & cost register', 'محطة قطار الزلفي – الجدول وسجل التكلفة'), 'title')]);
    S.push([C(ar ? `${acts.length} نشاط · البدء ${dfm(M.start)} · بالريال دون الضريبة` : `${acts.length} activities · start ${dt.fmt(M.start)} · SAR excl. VAT`, 'sub')]); S.push([]);
    S.push((ar ? ['الرمز', 'النشاط', 'المرحلة', 'الفئة', 'البداية', 'النهاية', 'الأشهر', 'المبلغ (ريال)', 'طويل التوريد', 'النشاط السابق / الارتباط'] : ['WBS', 'Activity', 'Phase', 'EPC', 'Start', 'Finish', 'Months', 'Amount (SAR)', 'Long-lead', 'Predecessor / link']).map((h, i) => C(h, i === 1 || i === 9 ? 'headL' : 'head')));
    const f0 = S.length + 1;
    acts.forEach((a) => S.push([C(ar ? Z.i18n.tr(a.code) : a.code, 'lab'), C(ar ? Z.i18n.tr(a.name) : a.name, 'lab'), C(ar ? Z.i18n.tr(a.phase) : a.phase, 'lab'), C(ar ? Z.i18n.tr(Z.EPC_BY[a.epc].name) : a.epc, 'lab'), C(X.serial(dt.iso(a.s)), 'date'), C(X.serial(dt.iso(a.e + 1) ) - 1, 'date'), C(Math.round((a.dur / 30.4375) * 10) / 10, 'num'), C(Math.round(a.amount), 'num'), C(a.ll ? Lx('Yes', 'نعم') : '', 'lab'), C(a.pred || '', 'txt')]));
    S.push([C(Lx('Total', 'الإجمالي'), 'tLab'), C('', 'tLab'), C('', 'tLab'), C('', 'tLab'), C('', 'tLab'), C('', 'tLab'), C('', 'tLab'), C(Math.round(acts.reduce((x, a) => x + a.amount, 0)), 'tNum', `SUM(H${f0}:H${S.length})`), C('', 'tLab'), C('', 'tLab')]);
    const s2 = { name: 'Schedule', cols: [9, 50, 10, 8, 12, 12, 9, 15, 10, 60], rows: S, freeze: { x: 2, y: 4 }, rtl: ar, footer: Lx('Zulfi Railway Station – Schedule', 'محطة قطار الزلفي – الجدول') };
    const blob = X.blob([s1, s2]);
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `Zulfi-CashFlow-${dim === 'all' ? 'Total' : { group: 'WBSgroup', epc: 'EPC', phase: 'Phase' }[dim]}-${pn(per)[2]}${ar ? '-AR' : ''}.xlsx`;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  const seriesMeta = (dim, key) => {
    if (dim === 'group') { const g = Z.GROUP_BY[key]; return { name: key.replace('.0', '') + ' ' + g.name, color: F.groupColor(key) }; }
    if (dim === 'epc') return { name: Z.EPC_BY[key].name, color: F.epcColor(key) };
    if (dim === 'phase') return { name: key, color: F.phaseColor(key) };
    return { name: 'Monthly spend', color: 'var(--brand)' };
  };
  const ORDER = { group: Z.GROUPS.map((g) => g.code), epc: Z.EPC.map((e) => e.key), phase: ['Phase 1', 'Phase 2'], all: ['all'] };

  // baseline cumulative % for the same set of activities
  const baseCurve = (M, list) => {
    const codes = new Set(list.map((a) => a.code));
    const tot = new Array(M.N).fill(0);
    M.base.acts.forEach((a) => { if (codes.has(a.code)) a.m.forEach((v, k) => (tot[k] += v)); });
    const sum = tot.reduce((x, y) => x + y, 0);
    let c = 0; return tot.map((v) => (sum ? (c += v) / sum : 0));
  };

  /* period helpers: view the project by month (per=1) or quarter (per=3) */
  const periods = (M, per) => Math.ceil(M.N / per);
  const sumP = (arr, k, per) => { let t = 0; for (let i = k * per; i < Math.min(arr.length, (k + 1) * per); i++) t += arr[i]; return t; };
  const lastIdx = (M, k, per) => Math.min(M.N, (k + 1) * per) - 1;
  const PN = { 1: ['M', 'Month', 'Monthly', 'month'], 3: ['Q', 'Quarter', 'Quarterly', 'quarter (3 months)'], 6: ['H', 'Half-year', 'Half-yearly', 'half-year (6 months)'], 12: ['Y', 'Year', 'Yearly', 'year (12 months)'] };
  const pn = (per) => PN[per] || PN[3];
  const pLabel = (M, k, per) => (per === 1 ? 'M' + (k + 1) : pn(per)[0] + (k + 1));
  const pSub = (M, k, per) => (per === 1 ? dt.mon(M.bs[k]) : 'M' + (k * per + 1) + '–' + (lastIdx(M, k, per) + 1));
  const pTitle = (M, k, per) => (per === 1 ? 'Month ' + (k + 1) + ' · ' + dt.fmt(M.bs[k]) + ' → ' + dt.fmtShort(M.bs[k + 1] - 1)
    : pn(per)[1] + ' ' + (k + 1) + ' · M' + (k * per + 1) + '–M' + (lastIdx(M, k, per) + 1) + ' · ' + dt.fmtShort(M.bs[k * per]) + ' → ' + dt.fmtShort(M.bs[lastIdx(M, k, per) + 1] - 1));
  const statusX = (M, st, per, L, bw) => { const k = dt.bucketOf(M.start, st); return L + ((k + (st - M.bs[k]) / (M.bs[k + 1] - M.bs[k])) / per) * bw; };

  /* ---- reusable S-curve (also on the dashboard) ---- */
  F.scurve = function (M, agg, o) {
    o = o || {};
    const per = o.per || 1, P = periods(M, per);
    const w = o.w || 600, h = o.h || 260, L = o.L || 44, R = o.R || 14, T = 12, B = o.B || 34;
    const pw = w - L - R, ph = h - T - B, bw = pw / P;
    const X = (k) => L + (k + 0.5) * bw, Y = (p) => T + ph - p * ph;
    const base = o.baseArr || baseCurve(M, agg.list);
    const LB = o.labels || { cur: 'Cumulative', base: 'Baseline', spend: per === 1 ? 'Monthly spend' : 'Quarter spend' };
    const pct = []; const bpct = [];
    if (o.advPct) o.advPct = Array.from({ length: P }, (_, k) => o.advPct[lastIdx(M, k, per)]);
    for (let k = 0; k < P; k++) { pct.push(agg.pct[lastIdx(M, k, per)]); bpct.push(base[lastIdx(M, k, per)]); }
    let s = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" style="min-width:${w > 900 ? 780 : 0}px">`;
    [0, 0.25, 0.5, 0.75, 1].forEach((p) => (s += `<g class="grid"><line x1="${L}" x2="${w - R}" y1="${Y(p)}" y2="${Y(p)}"/></g><text x="${L - 6}" y="${Y(p) + 4}" text-anchor="end" style="font-size:11px">${p * 100}%</text>`));
    for (let k = 0; k < P; k++) if (per > 1 || k % (o.step || 3) === 0) s += `<text x="${X(k)}" y="${h - B + 15}" text-anchor="middle" style="font-size:11px">${pLabel(M, k, per)}</text>` + (o.dates === false ? '' : `<text x="${X(k)}" y="${h - B + 28}" text-anchor="middle" style="font-size:9.5px;fill:var(--mute)">${per === 1 ? dt.fmtMY(M.bs[k]) : pSub(M, k, per)}</text>`);
    const pts = pct.map((p, k) => [X(k), Y(p)]);
    const poly = (arr) => arr.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('');
    s += `<path d="${poly([[L, Y(0)], ...pts])} L${X(P - 1)},${Y(0)} L${L},${Y(0)}Z" fill="var(--brand)" opacity=".1"/>`;
    if (o.advPct) s += `<path d="${poly([[L, Y(0)], ...o.advPct.map((p, k) => [X(k), Y(p)])])}" fill="none" stroke="#111" stroke-width="2.4" stroke-dasharray="6 4"/>`;
    if (!o.noBase) s += `<path d="${poly([[L, Y(0)], ...bpct.map((p, k) => [X(k), Y(p)])])}" fill="none" stroke="#8a97a3" stroke-width="2" stroke-dasharray="5 4"/>`;
    s += `<path d="${poly([[L, Y(0)], ...pts])}" fill="none" stroke="var(--brand)" stroke-width="3" stroke-linejoin="round"/>`;
    const st = A.s.ui.status;
    if (st && st >= M.start && st < M.bs[M.N]) {
      const xf = statusX(M, st, per, L, bw), v = agg.sum ? Z.cumAt(M, agg.cum, st) / agg.sum : 0;
      s += `<line x1="${xf}" x2="${xf}" y1="${T}" y2="${T + ph}" stroke="var(--bad)" stroke-width="2"/><circle cx="${xf}" cy="${Y(v)}" r="5" fill="var(--bad)" stroke="#fff" stroke-width="2"/><text x="${xf + 6}" y="${T + 12}" style="font-size:11px;font-weight:700;fill:var(--bad)">${dt.fmtShort(st)} · ${F.pct(v)}</text>`;
    }
    for (let k = 0; k < P; k++) {
      const dv = pct[k] - bpct[k], spend = sumP(agg.total, k, per);
      s += `<rect class="hit" ${per === 1 ? `data-month="${k + 1}"` : ''} x="${L + k * bw}" y="${T}" width="${bw}" height="${ph}" fill="transparent" data-tip="${F.tip(pTitle(M, k, per), [['var(--brand)', LB.cur, F.pct(pct[k]) + ' · ' + F.M(agg.cum[lastIdx(M, k, per)])], ...(o.noBase ? [] : [['#8a97a3', LB.base, F.pct(bpct[k])]]), ...(o.advPct ? [['#111', 'Cumulative payments (with advance)', F.pct(o.advPct[k])]] : []), ['', LB.spend, F.sar(spend)], ...(o.noBase ? [] : [['', 'Δ vs baseline', (dv >= 0 ? '+' : '−') + Math.abs(dv * 100).toFixed(1) + ' pts']])])}"/>`;
      s += `<circle cx="${X(k)}" cy="${Y(pct[k])}" r="${per === 1 ? 2.6 : 3.6}" fill="var(--brand)" stroke="#fff" stroke-width="1" pointer-events="none"/>`;
    }
    return s + '</svg>';
  };

  /* ---- stacked columns (month or quarter) ---- */
  function stackChart(M, agg, dim, w, h, per, adv) {
    const P = periods(M, per);
    const L = 58, R = 14, T = 12, B = 38, pw = w - L - R, ph = h - T - B, bw = pw / P;
    const tot = []; for (let k = 0; k < P; k++) tot.push(sumP(agg.total, k, per));
    const ain = adv ? tot.map((_, k) => sumP(adv.advIn, k, per)) : [], arec = adv && !A.mode ? tot.map((_, k) => sumP(adv.rec, k, per)) : [];
    const up = tot.map((v, k) => v + (ain[k] || 0)), maxDn = Math.max(0, ...arec);
    const nice = F.nice(Math.max(...up, 1) + maxDn, 5), top = Math.ceil(Math.max(...up, 1) / nice.step) * nice.step, bot = Math.ceil(maxDn / nice.step) * nice.step;
    const span = top + bot, Y = (v) => T + ph - ((v + bot) / span) * ph;
    let s = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" style="min-width:780px">`;
    for (let v = -bot; v <= top + 1; v += nice.step) s += `<g class="grid"><line x1="${L}" x2="${w - R}" y1="${Y(v)}" y2="${Y(v)}"/></g><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" style="font-size:11px">${F.compact(v)}</text>`;
    if (bot) s += `<line x1="${L}" x2="${w - R}" y1="${Y(0)}" y2="${Y(0)}" stroke="#7d8b96" stroke-width="1.5"/>`;
    const keys = ORDER[dim].filter((k) => agg.map[k]);
    const gap = per === 1 ? 3 : 10;
    for (let k = 0; k < P; k++) {
      let acc = 0; const rows = [];
      keys.forEach((key) => {
        const v = sumP(agg.map[key], k, per); if (v <= 0) return;
        const y1 = Y(acc + v), y0 = Y(acc); acc += v;
        s += `<rect x="${L + k * bw + gap}" y="${y1}" width="${bw - gap * 2}" height="${Math.max(0, y0 - y1 - 1.5)}" fill="${seriesMeta(dim, key).color}" ${y0 - y1 > 8 ? 'rx="2"' : ''} stroke="#fff" stroke-width=".5"/>`;
        rows.push([seriesMeta(dim, key).color, seriesMeta(dim, key).name, F.n0(v)]);
      });
      if (adv && ain[k] > 0) { const y1 = Y(acc + ain[k]), y0 = Y(acc); s += `<rect x="${L + k * bw + gap}" y="${y1}" width="${bw - gap * 2}" height="${Math.max(0, y0 - y1 - 1.5)}" fill="#111827" rx="2"/>`; rows.push(['#111827', 'Advance payment received', F.n0(ain[k])]); }
      if (adv && arec[k] > 0) { s += `<rect x="${L + k * bw + gap}" y="${Y(0) + 1}" width="${bw - gap * 2}" height="${Math.max(0, Y(-arec[k]) - Y(0) - 1)}" fill="#e11d48" rx="2"/>`; rows.push(['#e11d48', 'Advance recovery', '− ' + F.n0(arec[k])]); }
      s += `<text x="${L + (k + 0.5) * bw}" y="${h - B + 14}" text-anchor="middle" style="font-size:11px">${pLabel(M, k, per)}</text><text x="${L + (k + 0.5) * bw}" y="${h - B + 27}" text-anchor="middle" style="font-size:9.5px;fill:var(--mute)">${pSub(M, k, per)}</text>`;
      s += `<rect class="hit" ${per === 1 && !A.mode ? `data-month="${k + 1}"` : `data-do="cfSel" data-k="${k}" style="cursor:pointer"`} x="${L + k * bw}" y="${T}" width="${bw}" height="${ph}" fill="transparent" data-tip="${F.tip(pTitle(M, k, per), [...rows.reverse(), ['', '<b>Total work cost</b>', '<b>' + F.sar(tot[k]) + '</b>'], ...(adv && !A.mode ? [['', '<b>Net payment</b>', '<b>' + F.sar(tot[k] + ain[k] - arec[k]) + '</b>']] : []), ['', 'Cumulative cost', F.pct(agg.pct[lastIdx(M, k, per)])]])}"/>`;
    }
    const st = A.s.ui.status;
    if (st && st >= M.start && st < M.bs[M.N]) { const xf = statusX(M, st, per, L, bw); s += `<line x1="${xf}" x2="${xf}" y1="${T}" y2="${T + ph}" stroke="var(--bad)" stroke-width="2"/>`; }
    return s + '</svg>';
  }

  /* ---- payments view: net payment per period ---- */
  function payChart(M, w, h, per) {
    const pay = M.pay, P = periods(M, per);
    const L = 58, R = 14, T = 12, B = 38, pw = w - L - R, ph = h - T - B, bw = pw / P;
    const up = [], dn = [];
    for (let k = 0; k < P; k++) { up.push(sumP(pay.net, k, per)); dn.push(0); }
    const maxUp = Math.max(...up, 1), maxDn = Math.max(...dn, 0);
    const nice = F.nice(maxUp + maxDn, 6), top = Math.ceil(maxUp / nice.step) * nice.step, bot = Math.ceil(maxDn / nice.step) * nice.step;
    const span = top + bot, Y = (v) => T + ph - ((v + bot) / span) * ph;
    let s = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" style="min-width:780px">`;
    for (let v = -bot; v <= top + 1; v += nice.step) s += `<g class="grid"><line x1="${L}" x2="${w - R}" y1="${Y(v)}" y2="${Y(v)}"/></g><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" style="font-size:11px">${F.compact(v)}</text>`;
    s += `<line x1="${L}" x2="${w - R}" y1="${Y(0)}" y2="${Y(0)}" stroke="#7d8b96" stroke-width="1.5"/>`;
    for (let k = 0; k < P; k++) {
      const work = sumP(M.totalM, k, per), adv = sumP(pay.advIn, k, per), rec = sumP(pay.rec, k, per), x = L + k * bw + (per === 1 ? 3 : 10), ww = bw - (per === 1 ? 6 : 20);
      s += `<rect x="${x}" y="${Y(sumP(pay.net, k, per))}" width="${ww}" height="${Math.max(0, Y(0) - Y(sumP(pay.net, k, per)) - 1)}" fill="var(--brand)" rx="2"/>`;
      const netv = work + adv - rec;
      s += `<text x="${L + (k + 0.5) * bw}" y="${h - B + 14}" text-anchor="middle" style="font-size:11px">${pLabel(M, k, per)}</text><text x="${L + (k + 0.5) * bw}" y="${h - B + 27}" text-anchor="middle" style="font-size:9.5px;fill:var(--mute)">${pSub(M, k, per)}</text>`;
      s += `<rect class="hit" ${per === 1 ? `data-month="${k + 1}"` : ''} x="${L + k * bw}" y="${T}" width="${bw}" height="${ph}" fill="transparent" data-tip="${F.tip(pTitle(M, k, per), [['var(--c1)', 'Advance received', F.sar(adv)], ['var(--c2)', 'Advance recovery', '− ' + F.sar(rec)], ['var(--brand)', '<b>Net payment</b>', '<b>' + F.sar(netv) + '</b>'], ['', 'Advance balance', F.sar(pay.balance[lastIdx(M, k, per)])]])}"/>`;
    }
    return s + '</svg>';
  }

  const lblS = 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--mute)';
  const basisSeg = () => '';
  function payView(M, per) {
    const pay = M.pay, dtp = (d) => dt.fmtMY(d);
    const pkI = pay.net.indexOf(Math.max(...pay.net));
    const kp = (k, v, d, extra) => `<div class="dstat" ${extra || ''}><div class="k">${k}</div><div class="v">${v}</div><div class="hint">${d}</div></div>`;
    const fake = { pct: pay.cumPct, cum: pay.cum, total: pay.net, sum: M.total, list: M.acts };
    return A.head('3b', 'Cash flow &amp; payments', 'Advance payment of ' + pay.pct + '% received at NTP and recovered in equal monthly deductions', 'Payment terms · applied to the total contract value') +
      `<div class="s-body" style="gap:12px">
        <div class="row" style="align-items:center;gap:14px;flex:none">${basisSeg('pay')}
          <span class="lbl" style="${lblS}">View</span>
          <span class="seg"><button data-do="cfPer" data-p="1" class="${per === 1 ? 'on' : ''}">Monthly</button><button data-do="cfPer" data-p="3" class="${per === 3 ? 'on' : ''}">Quarterly</button></span>
          <span class="hint">Edit the advance % and recovery start on the Assumptions slide.</span>
        </div>
        <div class="row grow" style="gap:16px">
          <div class="col grow" style="gap:12px">
            <div class="panel" style="flex:1.15"><div class="ph"><h3>${per === 1 ? 'Monthly' : 'Quarterly'} payments</h3><span class="sub">SAR · net payment after advance and recovery</span>
              </div>
              <div class="pb" style="padding-top:0">${payChart(M, 1090, 305, per)}</div></div>
            <div class="panel" style="flex:1"><div class="ph"><h3>Cumulative payments</h3></div>
              <div class="pb" style="padding-top:0">${F.scurve(M, fake, { w: 1090, h: A.mode ? 195 : 245, L: 58, R: 14, B: 36, step: 1, dates: false, per, noBase: true, labels: { cur: 'Cumulative payments', base: '', spend: 'Net payment' + (per === 1 ? '' : ' (' + pn(per)[1].toLowerCase() + ')') } })}</div></div>
          </div>
          <div class="col" style="width:372px;gap:12px">
            ${kp('Advance payment (' + pay.pct + '%)', F.sar(pay.amount), 'of ' + F.sar(M.total) + ' · received at NTP ' + dt.fmtShort(M.start))}
            ${kp('Monthly recovery', F.sar(pay.perMonth), `equal deductions · month ${pay.from} → ${M.N} (${pay.months} months)`)}
            <div class="row" style="gap:12px">${kp('Balance after 12 months', F.M(pay.balance[Math.min(11, M.N - 1)]), 'advance still to recover', 'style="flex:1"')}${kp('Balance at end', F.sar(pay.balance[M.N - 1]), 'fully recovered', 'style="flex:1"')}</div>
            ${kp('Net payment in month 1', F.sar(pay.net[0]), 'advance received − recovery + valuation')}
            ${kp('Peak net payment', `M${pkI + 1} <small>${dtp(M.bs[pkI])}</small>`, F.sar(pay.net[pkI]), `data-month="${pkI + 1}" style="cursor:pointer"`)}
            ${kp('Total payments', F.sar(pay.cum[M.N - 1]), 'equals the contract value – the advance nets to zero')}
            <div class="note info" style="margin-top:auto">${A.ed('note:pay', 'The advance is paid on account, not extra cost: total payments equal the contract value (excl. VAT). Payments are for the whole contract (filters do not apply).')}</div>
          </div>
        </div></div>`;
  }

  Z.registerSlide({
    id: 'cashflow', title: 'Cash flow & S-curve', desc: 'Monthly spend, cumulative %, vs baseline',
    render(M) {
      const u = ui(), dim = u.dim, st = A.s.ui.status, per = u.per || 1;
      const adv = u.adv !== false, pay = M.pay;
      const agg = Z.aggregate(M, A.vis, dim === 'all' ? 'all' : dim);
      const tot = agg.sum, y1 = agg.total.slice(0, 12).reduce((a, b) => a + b, 0), y2 = tot - y1;
      const pk = agg.total.indexOf(Math.max(...agg.total)), m50 = agg.pct.findIndex((p) => p >= 0.5);
      const keys = ORDER[dim].filter((k) => agg.map[k]);
      const dbtn = (d, t) => `<button data-do="cfDim" data-d="${d}" class="${dim === d ? 'on' : ''}">${t}</button>`;
      const atSt = st ? Z.cumAt(M, agg.cum, st) : null;
      const kp = (k, v, d, extra) => `<div class="dstat" ${extra || ''}><div class="k">${k}</div><div class="v">${v}</div><div class="hint">${d}</div></div>`;
      // period details: totals for the selected period and cumulative to its end, per series
      const selK = u.sel != null && u.sel < periods(M, per) ? u.sel : null;
      const detail = selK == null ? '' : (() => {
        const last = lastIdx(M, selK, per), n = (x) => F.n0(x);
        const cumTo = (arr) => { let t = 0; for (let i = 0; i <= last; i++) t += arr[i] || 0; return t; };
        const lines = keys.map((key) => ({ m: seriesMeta(dim, key), p: sumP(agg.map[key], selK, per), c: cumTo(agg.map[key]) })).filter((r) => r.p > 0 || r.c > 0);
        const tp = sumP(agg.total, selK, per), tc = agg.cum[last], ap = adv ? sumP(pay.advIn, selK, per) : 0, ac = adv ? cumTo(pay.advIn) : 0;
        const row = (name, color, a, b, strong) => `<tr style="${strong ? 'font-weight:800;border-top:2px solid var(--line)' : ''}"><td>${color ? `<i class="dot" style="background:${color}"></i>` : ''}${name}</td><td class="num">${n(a)}</td><td class="num">${tot0 ? F.pct(a / tot0) : ''}</td><td class="num">${n(b)}</td><td class="num">${tot0 ? F.pct(b / tot0) : ''}</td></tr>`;
        const tot0 = agg.sum;
        const body = lines.map((r) => row(r.m.name, r.m.color, r.p, r.c)).join('') + row(A.L('Total work cost', 'إجمالي تكلفة الأعمال'), '', tp, tc, true)
          + (adv ? row(A.L('Advance payment', 'الدفعة المقدمة'), '#111827', ap, ac) + row(A.L('Total incl. advance', 'الإجمالي شاملاً الدفعة المقدمة'), '', tp + ap, tc + ac, true) : '');
        return `<div style="position:absolute;inset:0;z-index:40;display:flex;align-items:flex-start;justify-content:center;padding:84px 24px 24px;overflow:auto"><div data-do="cfClose" style="position:fixed;inset:0;background:rgba(20,30,36,.45)"></div><div style="position:relative;background:#fff;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.35);max-width:880px;width:100%;padding:18px 22px 20px">
          <div class="row" style="align-items:center;gap:12px;margin-bottom:10px"><h3 style="margin:0;flex:1;font-size:18px;color:var(--brand-d)">${pTitle(M, selK, per)}</h3><button class="btn sm" data-do="cfClose">✕ ${A.L('Close', 'إغلاق')}</button></div>
          <div style="overflow-x:auto"><table class="tbl" style="width:100%;font-size:13px"><thead><tr><th>${A.L('Item', 'البند')}</th><th class="num" colspan="2">${A.L('Period total', 'إجمالي الفترة')}</th><th class="num" colspan="2">${A.L('Total to date', 'الإجمالي حتى تاريخه')}</th></tr>
          <tr><th></th><th class="num">${A.L('SAR', 'ريال')}</th><th class="num">${A.L('% of project', '% من المشروع')}</th><th class="num">${A.L('SAR', 'ريال')}</th><th class="num">${A.L('% of project', '% من المشروع')}</th></tr></thead><tbody>${body}</tbody></table></div>
        </div></div>`;
      })();
      return A.head('3b', 'Cash flow &amp; S-curve', 'Monthly cost-loaded spend and cumulative progress against the baseline plan', 'Sheet 3 · 26-Month Schedule (rows 80–86 + charts)') +
        `<div class="s-body" style="gap:12px">
          <div class="row" style="align-items:center;gap:14px;flex:none">
            ${basisSeg('cost')}
            <span class="lbl" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--mute)">Stack by</span>
            <span class="seg">${dbtn('group', 'WBS group')}${dbtn('epc', 'EPC category')}${dbtn('phase', 'Phase')}${dbtn('all', 'Total')}</span>
            <span class="lbl" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--mute);margin-left:10px">View</span>
            <span class="seg"><button data-do="cfPer" data-p="1" class="${per === 1 ? 'on' : ''}">Monthly</button><button data-do="cfPer" data-p="3" class="${per === 3 ? 'on' : ''}">Quarterly</button><button data-do="cfPer" data-p="6" class="${per === 6 ? 'on' : ''}">Half-year</button><button data-do="cfPer" data-p="12" class="${per === 12 ? 'on' : ''}">Yearly</button></span>
            <span class="lbl" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--mute);margin-left:10px">Advance payment</span>
            <span class="seg"><button data-do="cfAdv" data-v="1" class="${adv ? 'on' : ''}">Show</button><button data-do="cfAdv" data-v="0" class="${adv ? '' : 'on'}">Hide</button></span>
            <span class="lbl" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--mute);margin-left:10px">Status date</span>
            <input type="date" class="dinput" style="width:140px;height:30px" value="${st ? dt.iso(st) : ''}" min="${dt.iso(M.start)}" max="${dt.iso(M.bs[M.N] - 1)}" data-chg="status">
            ${st ? '<button class="btn sm" data-do="clearStatus">Clear</button>' : '<span class="hint">pick a date to read planned progress</span>'}
            <button class="btn sm" data-do="cfExport" style="margin-left:auto" title="Download the current view (stack-by and period) as a SAR-styled Excel table">⬇ Export Excel</button>
          </div>
          <div class="row grow" style="gap:16px">
            <div class="col grow" style="gap:12px">
              <div class="panel" style="flex:1.15"><div class="ph"><h3>${pn(per)[2]} spend</h3><span class="sub">SAR per project ${per === 1 ? 'month · click for detail' : pn(per)[3]}</span><div class="right legend" style="max-width:640px;justify-content:flex-end">${keys.map((k) => `<span><i class="dot" style="background:${seriesMeta(dim, k).color}"></i>${(A.isAr() ? seriesMeta(dim, k).name : seriesMeta(dim, k).name.replace(/^(\d) .*/, (m, d) => m.length > 24 ? m.slice(0, 22) + '…' : m))}</span>`).join('')}${adv ? '<span><i class="dot" style="background:#111827"></i>Advance payment</span>' + (A.mode ? '' : '<span><i class="dot" style="background:#e11d48"></i>Advance recovery</span>') : ''}</div></div><div class="pb" style="padding-top:0">${stackChart(M, agg, dim, 1090, A.mode ? 250 : 305, per, adv ? pay : null)}</div></div>
              <div class="panel" style="flex:1"><div class="ph"><h3>S-curve – cumulative % ${adv ? 'of payments (with advance)' : 'complete (cost)'}</h3>
                <div class="right legend">${adv ? '<span><i class="dot" style="background:var(--brand)"></i>Cumulative payments (advance at NTP' + (A.mode ? ')' : ', recovered monthly)') + '</span>' : '<span><i class="dot" style="background:var(--brand)"></i>Current plan</span><span><i class="dot" style="background:#8a97a3"></i>Baseline</span>'}</div></div>
                <div class="pb" style="padding-top:0">${(adv ? F.scurve(M, { pct: pay.cumPct, cum: pay.cum, total: pay.net, sum: M.total, list: agg.list }, { w: 1090, h: A.mode ? 195 : 245, L: 58, R: 14, B: 36, step: 1, dates: false, per, noBase: true, labels: { cur: 'Cumulative payments (with advance)', base: '', spend: 'Net payment' + (per === 1 ? '' : ' (' + pn(per)[1].toLowerCase() + ')') } }) : F.scurve(M, agg, { w: 1090, h: A.mode ? 195 : 245, L: 58, R: 14, B: 36, step: 1, dates: false, per }))}</div></div>
            </div>
            <div class="col" style="width:372px;gap:12px">
              ${A.mode ? '' : `<div class="col" style="gap:8px">${Z.phaseStrip(M, true)}</div>`}
              ${adv ? `<div class="row" style="gap:12px">${kp('Advance (' + pay.pct + '%)', F.M(pay.amount), 'received at NTP', 'style="flex:1"')}${A.mode ? '' : kp('Monthly recovery', F.M(pay.perMonth), 'M' + pay.from + '–M' + M.N, 'style="flex:1"')}</div>` : ''}
              ${kp('Total (selection)', F.sar(tot), `${agg.list.length} activities · ${F.pct(M.total ? tot / M.total : 0)} of project`)}
              <div class="row" style="gap:12px">${kp('Year 1 · M1–12', F.M(y1), F.pct(tot ? y1 / tot : 0) + ' of cost', 'style="flex:1"')}${kp('Year 2 · M13+', F.M(y2), F.pct(tot ? y2 / tot : 0) + ' of cost', 'style="flex:1"')}</div>
              ${kp('Peak month', `M${pk + 1} <small>${dt.fmtMY(M.bs[pk])}</small>`, F.sar(agg.total[pk]), `data-month="${pk + 1}" style="cursor:pointer"`)}
              ${kp('50% of cost reached', m50 >= 0 ? `M${m50 + 1} <small>${dt.fmtMY(M.bs[m50])}</small>` : '–', m50 >= 0 ? `cumulative ${F.pct(agg.pct[m50])}` : '')}
              ${kp('Planned progress at status date', st ? F.pct(tot ? atSt / tot : 0) : '–', st ? `${dt.fmt(st)} · ${F.sar(atSt)}` : 'choose a status date above', st ? 'style="border-color:var(--bad)"' : '')}
              <div class="note info" style="margin-top:auto">${A.ed('note:cf', 'Baseline = the original Excel plan re-based on the current start date. Move activities or change assumptions and the gap shows here.')}</div>
            </div>
          </div></div>` + detail;
    },
  });

  /* ------------------------------------------------------------ matrix */
  Z.registerSlide({
    id: 'matrix', title: 'Cash-flow matrix', desc: 'Activity × month heat-map (Excel grid)',
    render(M) {
      const u = mxui(), vis = A.visList();
      const fmt = (v) => (v < 0.5 ? '' : u.unit === 'sar' ? F.n0(v) : u.unit === 'k' ? F.n0(v / 1000) : (v / 1e6).toFixed(2));
      const maxCell = Math.max(...vis.flatMap((a) => a.m), 1);
      const cell = (v, a) => `<td class="c ${v < 0.5 ? 'z' : ''}" style="${u.heat && v >= 0.5 ? `background:rgba(0,119,139,${(0.07 + 0.78 * Math.sqrt(v / maxCell)).toFixed(2)});${v / maxCell > 0.45 ? 'color:#fff;' : ''}` : ''}">${v < 0.5 ? '·' : fmt(v)}</td>`;
      const SC = [0, 58, 292];
      let head = `<th class="stk" style="left:0;z-index:5;min-width:58px">WBS</th><th class="stk" style="left:58px;z-index:5;min-width:234px">Activity</th><th class="stk num" style="left:292px;z-index:5;min-width:92px">Total</th>`;
      for (let k = 0; k < M.N; k++) head += `<th class="m hit" data-month="${k + 1}" data-tip="${F.tip('Month ' + (k + 1), [['', 'From', dt.fmt(M.bs[k])], ['', 'To', dt.fmt(M.bs[k + 1] - 1)]])}">M${k + 1}<br><span style="font-weight:500;color:var(--mute)">${dt.fmtMY(M.bs[k])}</span></th>`;
      let body = '';
      Z.GROUPS.forEach((g) => {
        const ga = vis.filter((a) => a.group === g.code); if (!ga.length) return;
        const gm = new Array(M.N).fill(0); ga.forEach((a) => a.m.forEach((v, k) => (gm[k] += v)));
        body += `<tr class="g"><td class="stk" style="left:0">${g.code.replace('.0', '')}</td><td class="stk" style="left:58px" data-grp="${g.code}"><span style="cursor:pointer">${F.esc(g.name)}</span></td><td class="stk num" style="left:292px">${F.n0(gm.reduce((x, y) => x + y, 0))}</td>${gm.map((v) => `<td class="c" style="font-weight:700">${fmt(v) || '·'}</td>`).join('')}</tr>`;
        ga.forEach((a) => { body += `<tr class="act" data-act="${a.code}"><td class="stk" style="left:0;color:var(--brand-d);font-weight:700">${a.code}</td><td class="stk" style="left:58px;max-width:234px;overflow:hidden;text-overflow:ellipsis" title="${F.esc(a.desc)}">${F.esc(a.name)}</td><td class="stk num" style="left:292px">${F.n0(a.amount)}</td>${a.m.map((v) => cell(v, a)).join('')}</tr>`; });
      });
      const agg = Z.aggregate(M, A.vis, 'all');
      const ft = (label, vals, top, f) => `<tr class="tot"><td class="stk" style="left:0;bottom:${top}px;z-index:4"></td><td class="stk" style="left:58px;bottom:${top}px;z-index:4">${label}</td><td class="stk num" style="left:292px;bottom:${top}px;z-index:4">${f === 'sum' ? F.n0(agg.sum) : f === 'adv' ? F.n0(M.pay.amount) : f === 'rec' ? F.n0(-M.pay.amount) : f === 'net' ? F.n0(M.total) : ''}</td>${vals.map((v) => `<td class="c" style="bottom:${top}px">${f === 'pct' ? F.pct(v, 1) : v < 0 ? '−' + fmt(-v) : fmt(v) || '·'}</td>`).join('')}</tr>`;
      const ubtn = (k, t) => `<button data-do="mxUnit" data-u="${k}" class="${u.unit === k ? 'on' : ''}">${t}</button>`;
      return A.head('3c', 'Cash-flow matrix', 'Every activity’s cost spread across the project months – the Excel schedule grid, live', 'Sheet 3 · 26-Month Schedule (grid)') +
        `<div class="s-body" style="gap:10px"><div class="row" style="align-items:center;gap:14px;flex:none"><span class="lbl" style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--mute)">Units</span><span class="seg">${ubtn('sar', 'SAR')}${ubtn('k', 'SAR thousand')}${ubtn('m', 'SAR million')}</span>
          <button class="chip ${u.heat ? 'on' : ''}" data-do="mxHeat">Heat-map</button><span class="hint">Click a row for activity details, a month header for the month's breakdown.</span></div>
          <div class="panel grow"><div class="pb scroll hm" data-keep="matrix" style="padding:0"><table class="tbl hm"><thead><tr>${head}</tr></thead><tbody>${body || '<tr><td colspan="30" class="empty">No activities match the filters</td></tr>'}</tbody>
          <tfoot style="display:table-footer-group">${ft('Total monthly spend', agg.total, 130, 'sum')}${ft('Cumulative spend', agg.cum, 104)}${ft('Cumulative % complete', agg.pct, 78, 'pct')}${ft('Advance payment received', M.pay.advIn, 52, 'adv')}${ft('Advance recovery (−)', M.pay.rec.map((v) => -v), 26, 'rec')}${ft('Net payment', M.pay.net, 0, 'net')}</tfoot></table></div></div></div>`;
    },
  });
})(window);

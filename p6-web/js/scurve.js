/* P6 Web – S-Curve / time-phased distribution export to a SAR-styled Excel workbook.
   Choose the basis (cost or units), the timescale (day / week / month / quarter / year, any range), the resources and the WBS scope / level.
   Sheets: Summary (KPIs), S-Curve (planned / actual / forecast, cumulative and % with a native Excel line chart), then the distribution by WBS,
   by resource and resource ▸ WBS for the measures you tick (planned, actual, forecast). Values come from the same phasing engine as the
   Resource Assignments window. */
(function (g) {
  'use strict';
  const P6 = g.P6, App = g.App, D = App.dialogs;
  const esc = P6.esc, B = (en, ar) => (P6.dir() === 'rtl' ? ar : en), fmtD = P6.fmtDate;
  const SAR = { blue: '#00778B', red: '#CB2C30', yellow: '#F1B434', slate: '#768692', t05: '#F2F8F9', t10: '#E6F1F4' };
  const MEAS = { planned: ['', '', '', 'x', 'pv'], actual: ['', '', '', 'x', 'act'], forecast: ['', '', '', 'x', 'ac'] };
  const MNAME = { planned: ['Planned', 'المخطط'], actual: ['Actual', 'الفعلي'], forecast: ['Forecast', 'المتوقع (فعلي + متبقي)'] };
  const RTN = { RT_Labor: 'Labor', RT_Equip: 'Equipment', RT_Mat: 'Material' };

  function label(unit, q) {
    const y = P6.ymd(q.s);
    switch (unit) { case 'Month': return P6.MON[y.m] + '-' + String(y.y).slice(2); case 'Quarter': return 'Q' + (Math.floor(y.m / 3) + 1) + ' ' + y.y; case 'Year': return String(y.y); default: return fmtD(q.s); }
  }
  const sanitize = (s) => String(s || 'Project').replace(/[^\w\-]+/g, '_').slice(0, 40);

  function defaults() {
    const c = App.cfg; c.scurve = Object.assign({ basis: 'c', unit: 'Month', start: null, end: null, cum: false, level: 0, wbs: 0, sheets: { wbs: true, res: true, rw: false }, meas: { planned: true, actual: true, forecast: true }, rs: null, hideEmpty: true }, c.scurve);
    return c.scurve;
  }

  /* ---------- computation ---------- */
  function compute(o) {
    const p = App.p, K = App.assignKit, dd = p.dataDate, cost = o.basis === 'c';
    const wm = new Map(p.wbs.map((w) => [w.id, w])), kids = new Map(); p.wbs.forEach((w) => { if (w.parent != null && wm.has(w.parent)) { if (!kids.has(w.parent)) kids.set(w.parent, []); kids.get(w.parent).push(w.id); } });
    const roots = p.wbs.filter((w) => w.parent == null || !wm.has(w.parent));
    const sortKids = (ids) => ids.map((id) => wm.get(id)).sort((a, b) => (a.seq - b.seq) || String(a.code).localeCompare(String(b.code), undefined, { numeric: true }));
    const inScope = new Set(); const addSub = (id) => { inScope.add(id); (kids.get(id) || []).forEach(addSub); };
    if (o.wbs) addSub(o.wbs); else p.wbs.forEach((w) => inScope.add(w.id));
    const rs = o.rs ? new Set(o.rs) : null;
    const rows = K.rowsOf(p).filter((x) => (!rs || rs.has(x.r.id)) && x.t.wbs != null && inScope.has(x.t.wbs));
    let d0 = Infinity, d1 = -Infinity;
    for (const x of rows) { const tk = x.t; for (const d of [tk.es, tk.bs]) if (d != null) d0 = Math.min(d0, d); for (const d of [tk.ef, tk.bf]) if (d != null) d1 = Math.max(d1, d); }
    if (!isFinite(d0)) { d0 = dd; d1 = dd + 30; } d0 = Math.min(d0, dd); d1 = Math.max(d1, dd);
    if (o.start != null) d0 = o.start; if (o.end != null) d1 = o.end;
    const P = K.mkPeriods(o.unit, d0, d1), n = P.per.length, truncated = n >= 1500, dayCache = new Map();
    const need = new Set(['planned', 'actual', 'forecast']), leaf = new Map();
    for (const m of need) { const M = MEAS[m].slice(); M[3] = cost ? 'c' : 'u'; const arrs = new Map(); for (const x of rows) arrs.set(x, K.phaseRow(x, M, P, dayCache)); leaf.set(m, arrs); }
    const sumOf = (m, list) => { const out = new Float64Array(n); for (const x of list) { const v = leaf.get(m).get(x); for (let i = 0; i < n; i++) out[i] += v[i]; } return out; };
    const tot = { planned: sumOf('planned', rows), actual: sumOf('actual', rows), forecast: sumOf('forecast', rows) };
    let BAC = 0, PV = 0, EV = 0, AC = 0;
    for (const x of rows) { const b = cost ? x.N.bc : x.N.bu, tk = x.t; BAC += b; const s = tk.bs != null ? tk.bs : tk.es, e = tk.bf != null ? tk.bf : tk.ef; if (s != null && e != null) PV += b * Math.max(0, Math.min(1, (dd - s + 1) / Math.max(1, e - s + 1))); EV += b * (tk.status === 'C' ? 1 : (tk.pct || 0) / 100); AC += cost ? x.N.ac : x.N.au; }
    const ddIdx = P.per.findIndex((q) => dd >= q.s && dd < q.e);
    return { p, o, rows, P, n, wm, kids, roots, sortKids, leaf, sumOf, tot, BAC, PV, EV, AC, ddIdx, dd, truncated, cost };
  }

  /* ---------- sheet builders ---------- */
  const fmtC = (cost) => (cost ? 'c0' : 'f');
  function cumul(a) { const o = new Float64Array(a.length); let s = 0; for (let i = 0; i < a.length; i++) { s += a[i]; o[i] = s; } return o; }
  const nz = (v) => (Math.abs(v) < 1e-9 ? null : Math.round(v * 100) / 100);

  function sheetSummary(C) {
    const o = C.o, cost = C.cost, u = cost ? B('SAR', 'ريال') : B('units', 'وحدات');
    const pct = (v) => (C.BAC ? v / C.BAC : 0), spi = C.PV ? C.EV / C.PV : null, cpi = cost && C.AC ? C.EV / C.AC : null;
    const rows = [
      [B('Project', 'المشروع'), C.p.name], [B('Data date', 'تاريخ البيانات'), fmtD(C.dd)], [B('Basis', 'الأساس'), cost ? B('Cost', 'تكلفة') : B('Units', 'وحدات')], [B('Timescale', 'المقياس الزمني'), o.unit + ' (' + fmtD(C.P.per[0].s) + ' → ' + fmtD(C.P.per[C.n - 1].e - 1) + ')'],
      [B('Resources included', 'الموارد المشمولة'), o.rs ? o.rs.length + ' / ' + C.p.rsrc.length : B('All', 'الكل')], [B('WBS scope', 'نطاق WBS'), o.wbs ? (C.wm.get(o.wbs) || {}).name : B('Entire project', 'المشروع كله')], [B('Assignments', 'التعيينات'), C.rows.length],
      ['', ''], [B('Budget at completion (BAC)', 'الميزانية عند الإنجاز'), Math.round(C.BAC * 100) / 100], [B('Planned value to date (PV)', 'القيمة المخططة حتى الآن'), Math.round(C.PV * 100) / 100], [B('Earned value to date (EV)', 'القيمة المكتسبة حتى الآن'), Math.round(C.EV * 100) / 100], [B('Actual to date (AC)', 'الفعلي حتى الآن'), Math.round(C.AC * 100) / 100],
      [B('Planned % to date', '% المخطط حتى الآن'), Math.round(pct(C.PV) * 1000) / 10], [B('Earned % to date', '% المكتسب حتى الآن'), Math.round(pct(C.EV) * 1000) / 10], [B('Variance (points)', 'الانحراف (نقطة)'), Math.round((pct(C.EV) - pct(C.PV)) * 1000) / 10],
      ['SPI (EV / PV)', spi == null ? '' : Math.round(spi * 100) / 100], ['CPI (EV / AC)', cpi == null ? B('n/a (units)', 'غير متاح (وحدات)') : Math.round(cpi * 100) / 100],
    ];
    return { name: 'Summary', logo: true, tab: SAR.blue, title: B('S-Curve & distribution report', 'تقرير منحنى S والتوزيع'), subtitle: C.p.name + ' · ' + fmtD(C.dd), cols: [{ h: B('Item', 'البند'), w: 38 }, { h: B('Value', 'القيمة'), w: 46, t: 'n' }], rows, style: (r) => ({ bold: /^(Budget|Planned %|Earned %|SPI)/.test(r[0]) }), fill: (r, i) => (i % 2 ? SAR.t05 : null) };
  }

  function sheetCurve(C) {
    const o = C.o, cost = C.cost, per = C.P.per, rows = [];
    const cp = cumul(C.tot.planned), ca = cumul(C.tot.actual), cf = cumul(C.tot.forecast), bac = C.BAC || 1;
    for (let i = 0; i < C.n; i++) {
      const act = i <= C.ddIdx, fc = i >= C.ddIdx;
      rows.push([label(o.unit, per[i]), per[i].s, nz(C.tot.planned[i]), act ? nz(C.tot.actual[i]) : null, fc ? nz(C.tot.forecast[i]) : null, cp[i], act ? ca[i] : null, fc ? cf[i] : null, cp[i] / bac, act ? ca[i] / bac : null, fc ? cf[i] / bac : null, act ? (ca[i] - cp[i]) / bac : null]);
    }
    const m = cost ? 'm' : 'f';
    const cols = [{ h: B('Period', 'الفترة'), w: 13 }, { h: B('From', 'من'), w: 13, t: 'd' }, { h: B('Planned', 'مخطط'), w: 14, t: m }, { h: B('Actual', 'فعلي'), w: 14, t: m }, { h: B('Forecast', 'متوقع'), w: 14, t: m }, { h: B('Cum. Planned', 'تراكمي مخطط'), w: 15, t: m }, { h: B('Cum. Actual', 'تراكمي فعلي'), w: 15, t: m }, { h: B('Cum. Forecast', 'تراكمي متوقع'), w: 15, t: m }, { h: B('Cum. Planned %', '% المخطط'), w: 14, t: 'pp' }, { h: B('Cum. Actual %', '% الفعلي'), w: 14, t: 'pp' }, { h: B('Cum. Forecast %', '% المتوقع'), w: 14, t: 'pp' }, { h: B('Variance (pts)', 'الانحراف'), w: 13, t: 'pp' }];
    return { name: 'S-Curve', logo: true, tab: SAR.blue, title: 'S-Curve – ' + (cost ? B('cost', 'تكلفة') : B('units', 'وحدات')) + ' · ' + o.unit, subtitle: C.p.name + ' · ' + B('Data date ', 'تاريخ البيانات ') + fmtD(C.dd), cols, rows, fill: (r, i) => (i === C.ddIdx ? '#CFE3F5' : null),
      chart: { title: 'S-Curve – ' + C.p.name, catCol: 0, series: [{ col: 8, color: SAR.blue }, { col: 9, color: SAR.red }, { col: 10, color: SAR.yellow, dash: true }], anchor: { col: 13, row: 3, w: 820, h: 440 } } };
  }

  // aggregate leaf arrays by WBS node (direct rows + descendants) for a subset of rows
  function wbsAgg(C, list, m) {
    const direct = new Map(); for (const x of list) { if (!direct.has(x.t.wbs)) direct.set(x.t.wbs, []); direct.get(x.t.wbs).push(x); }
    const out = new Map(), cnt = new Map();
    const walk = (id) => { const a = C.sumOf(m, direct.get(id) || []); let c = (direct.get(id) || []).length; for (const k of C.kids.get(id) || []) { const r = walk(k); for (let i = 0; i < a.length; i++) a[i] += r.a[i]; c += r.c; } out.set(id, a); cnt.set(id, c); return { a, c }; };
    return { walk, out, cnt };
  }
  function wbsRows(C, list, m, cumulative) {
    const o = C.o, g = wbsAgg(C, list, m), rows = [], maxLv = o.level || 99;
    const rootIds = o.wbs ? [o.wbs] : C.roots.map((w) => w.id);
    rootIds.forEach((id) => g.walk(id));
    const emit = (id, depth) => {
      const w = C.wm.get(id), a = g.out.get(id); if (!a) return; if (o.hideEmpty && !g.cnt.get(id)) return;
      if (depth <= maxLv) { const v = cumulative ? cumul(a) : a, total = a.reduce((s, x) => s + x, 0); const row = [(w.code ? w.code + ' – ' : '') + w.name, nz(total), C.BAC ? total / C.BAC : null, ...Array.from(v, nz)]; row.d = depth; rows.push(row); }
      if (depth < maxLv) C.sortKids(C.kids.get(id) || []).forEach((k) => emit(k.id, depth + 1));
    };
    rootIds.forEach((id) => emit(id, 1));
    return rows;
  }
  function distCols(C, first) {
    const cost = C.cost, m = cost ? 'c0' : 'f';
    return [{ h: first, w: 52 }, { h: B('Total', 'الإجمالي'), w: 15, t: m }, { h: B('% of BAC', '% من الميزانية'), w: 11, t: 'pp' }, ...C.P.per.map((q) => ({ h: label(C.o.unit, q), w: C.o.unit === 'Day' ? 11 : 12, t: m }))];
  }
  const depthStyle = (r) => ({ bold: r.d <= 2 || r.band, indent: Math.max(0, (r.d || 1) - 1) });
  const depthFill = (r) => (r.band ? SAR.t10 : r.d === 1 ? SAR.t10 : r.d === 2 ? SAR.t05 : null);

  function sheetWbs(C, m) {
    const o = C.o, cum = o.cum, rows = wbsRows(C, C.rows, m, cum);
    return { name: 'WBS ' + MNAME[m][0], logo: true, tab: SAR.blue, title: B('Distribution by WBS – ', 'التوزيع حسب WBS – ') + MNAME[m][0] + (cum ? B(' (cumulative)', ' (تراكمي)') : ''), subtitle: C.p.name + ' · ' + o.unit + ' · ' + (C.cost ? B('cost', 'تكلفة') : B('units', 'وحدات')), cols: distCols(C, 'WBS'), rows, style: depthStyle, fill: depthFill, freezeCols: 3 };
  }
  function sheetRes(C, m) {
    const o = C.o, cum = o.cum, by = new Map(); for (const x of C.rows) { if (!by.has(x.r.id)) by.set(x.r.id, []); by.get(x.r.id).push(x); }
    const rows = [...by].sort((a, b) => a[1][0].r.name.localeCompare(b[1][0].r.name)).map(([id, list]) => { const r = list[0].r, a = C.sumOf(m, list), v = cum ? cumul(a) : a, total = a.reduce((s, x) => s + x, 0); const row = [(r.short ? r.short + ' – ' : '') + r.name + ' (' + RTN[r.type] + ')', nz(total), C.BAC ? total / C.BAC : null, ...Array.from(v, nz)]; row.d = 1; return row; });
    return { name: 'Resource ' + MNAME[m][0], logo: true, tab: SAR.blue, title: B('Distribution by resource – ', 'التوزيع حسب المورد – ') + MNAME[m][0] + (cum ? B(' (cumulative)', ' (تراكمي)') : ''), subtitle: C.p.name + ' · ' + o.unit, cols: distCols(C, B('Resource', 'المورد')), rows, style: depthStyle, fill: depthFill, freezeCols: 3 };
  }
  function sheetResWbs(C, m) {
    const o = C.o, cum = o.cum, by = new Map(); for (const x of C.rows) { if (!by.has(x.r.id)) by.set(x.r.id, []); by.get(x.r.id).push(x); }
    const rows = [];
    [...by].sort((a, b) => a[1][0].r.name.localeCompare(b[1][0].r.name)).forEach(([id, list]) => {
      const r = list[0].r, a = C.sumOf(m, list), v = cum ? cumul(a) : a, total = a.reduce((s, x) => s + x, 0);
      const band = [(r.short ? r.short + ' – ' : '') + r.name, nz(total), C.BAC ? total / C.BAC : null, ...Array.from(v, nz)]; band.band = true; band.d = 1; rows.push(band);
      for (const w of wbsRows(C, list, m, cum)) { w.d = w.d + 1; rows.push(w); }
    });
    return { name: 'Res x WBS ' + MNAME[m][0], logo: true, tab: SAR.blue, title: B('Resource ▸ WBS – ', 'المورد ▸ WBS – ') + MNAME[m][0] + (cum ? B(' (cumulative)', ' (تراكمي)') : ''), subtitle: C.p.name + ' · ' + o.unit, cols: distCols(C, B('Resource ▸ WBS', 'المورد ▸ WBS')), rows, style: depthStyle, fill: depthFill, freezeCols: 3 };
  }

  function build(o) {
    const C = compute(o); if (!C.rows.length) throw new Error(B('No assignments match the selection', 'لا توجد تعيينات تطابق الاختيار'));
    const sheets = [sheetSummary(C), sheetCurve(C)], ms = Object.keys(o.meas).filter((k) => o.meas[k]);
    if (o.sheets.wbs) ms.forEach((m) => sheets.push(sheetWbs(C, m)));
    if (o.sheets.res) ms.forEach((m) => sheets.push(sheetRes(C, m)));
    if (o.sheets.rw) ms.forEach((m) => sheets.push(sheetResWbs(C, m)));
    return { C, sheets };
  }
  App.sCurveBuild = build;

  /* ---------- preview window (live) + export ---------- */
  const fv = (t, v) => {
    if (v == null || v === '') return '';
    if (t === 'pp') return (v * 100).toFixed(1) + '%';
    if (t === 'c0') return Math.round(v).toLocaleString('en-US');
    if (t === 'm') return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (t === 'd') return fmtD(v);
    if (typeof v === 'number') return String(Math.round(v * 100) / 100);
    return String(v);
  };
  function chartSvg(C) {
    const per = C.P.per, n = per.length, W = 860, H = 300, L = 46, R = 14, T = 16, Bm = 52, w = W - L - R, h = H - T - Bm, bac = C.BAC || 1;
    const cp = cumul(C.tot.planned), ca = cumul(C.tot.actual), cf = cumul(C.tot.forecast);
    const mx = Math.max(1, ...Array.from(cp, (v) => v / bac), ...Array.from(cf, (v, i) => (i >= C.ddIdx ? v / bac : 0))), top = Math.ceil(mx * 10) / 10;
    const x = (i) => L + (n === 1 ? w / 2 : (i * w) / (n - 1)), y = (v) => T + h - (v / top) * h;
    const line = (arr, from, to, col, dash) => { const pts = []; for (let i = from; i <= to; i++) pts.push(x(i).toFixed(1) + ',' + y(arr[i] / bac).toFixed(1)); return pts.length > 1 ? `<polyline fill="none" stroke="${col}" stroke-width="2.4" ${dash ? 'stroke-dasharray="6 4"' : ''} points="${pts.join(' ')}"/>` : ''; };
    let grid = ''; for (let g = 0; g <= 5; g++) { const v = (top * g) / 5; grid += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#C8C9C7" stroke-width=".6"/><text x="${L - 6}" y="${y(v) + 3}" font-size="10" text-anchor="end" fill="#555">${Math.round(v * 100)}%</text>`; }
    const step = Math.max(1, Math.ceil(n / 14)); let xl = ''; for (let i = 0; i < n; i += step) xl += `<text transform="translate(${x(i)},${H - Bm + 14}) rotate(-35)" font-size="9" text-anchor="end" fill="#555">${esc(label(C.o.unit, per[i]))}</text>`;
    const dx = C.ddIdx >= 0 ? `<line x1="${x(C.ddIdx)}" x2="${x(C.ddIdx)}" y1="${T}" y2="${T + h}" stroke="#00778B" stroke-dasharray="3 3"/><text x="${x(C.ddIdx) + 4}" y="${T + 10}" font-size="10" fill="#00778B" text-anchor="start" direction="ltr">Data date</text>` : '';
    const leg = [['Planned', 'المخطط', SAR.blue], ['Actual', 'الفعلي', SAR.red], ['Forecast', 'المتوقع', SAR.yellow]].map((l, k) => `<rect x="${L + k * 120}" y="${H - 14}" width="14" height="4" fill="${l[2]}"/><text x="${L + k * 120 + 18}" y="${H - 9}" font-size="11" fill="#333" text-anchor="start" direction="ltr">${esc(l[0])}</text>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;background:#fff;border:1px solid #d9e6e9;border-radius:6px" dir="ltr">${grid}${xl}${dx}${line(cp, 0, n - 1, SAR.blue)}${line(ca, 0, Math.max(0, C.ddIdx), SAR.red)}${line(cf, Math.max(0, C.ddIdx), n - 1, SAR.yellow, true)}${leg}</svg>`;
  }
  function tableHtml(sh) {
    const MAXR = 400, MAXC = 140, cols = sh.cols.slice(0, MAXC), rows = sh.rows.slice(0, MAXR);
    const th = cols.map((c, i) => `<th${c.t && c.t !== 's' ? ' style="text-align:end"' : ''}>${esc(c.h)}</th>`).join('');
    const tr = rows.map((r, ri) => { const st = sh.style ? sh.style(r, ri) || {} : {}, fl = sh.fill ? sh.fill(r, ri) : null; return `<tr${fl ? ` style="background:${fl}"` : ''}>${cols.map((c, i) => `<td style="${c.t && c.t !== 's' ? 'text-align:end;' : ''}${st.bold ? 'font-weight:700;' : ''}${i === 0 && st.indent ? `padding-inline-start:${8 + st.indent * 14}px;` : ''}white-space:nowrap">${esc(fv(c.t, r[i]))}</td>`).join('')}</tr>`; }).join('');
    return `<div class="tbl-scroll" style="max-height:290px"><table class="mini cmpt scv-t"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>${sh.rows.length > MAXR || sh.cols.length > MAXC ? `<p class="hint">${esc(B('Preview shows the first ' + MAXR + ' rows / ' + MAXC + ' columns – Excel has everything.', 'المعاينة تعرض أول ' + MAXR + ' صف و ' + MAXC + ' عمود – ملف Excel فيه كل شيء.'))}</p>` : ''}`;
  }

  App.sCurveExport = function () {
    const p = App.p; if (!p) return; const o = defaults(), by = (id) => p.wbs.find((w) => w.id === id);
    const rsSel = new Set(o.rs || p.rsrc.map((r) => r.id)), usedR = new Set(p.asg.map((a) => a.rsrc)), list = p.rsrc.filter((r) => usedR.has(r.id));
    const depth = (w) => { let n = 1, x = w; while (x && x.parent != null && by(x.parent)) { n++; x = by(x.parent); } return n; }, maxDepth = Math.max(1, ...p.wbs.map(depth));
    const body = document.createElement('div'); body.dir = P6.dir(); let cur = 'S-Curve', timer = 0, last = null;
    const sel = (id, opts, v) => `<select id="${id}" class="inp">${opts.map(([k, l]) => `<option value="${k}"${String(v) === String(k) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    const wopts = [[0, B('Entire project', 'المشروع كله')], ...[...p.wbs].sort((a, b) => (a.seq - b.seq) || String(a.code).localeCompare(String(b.code), undefined, { numeric: true })).map((w) => [w.id, ' '.repeat((depth(w) - 1) * 3) + (w.code ? w.code + ' – ' : '') + w.name])];
    const ck = (id, v, l) => `<label class="chk"><input type="checkbox" id="${id}"${v ? ' checked' : ''}> ${esc(l)}</label>`;
    body.innerHTML = `<div class="scv"><div class="scv-opt"><div class="scv-f"><label>${esc(B('Basis', 'الأساس'))}</label>${sel('sc_b', [['c', B('Cost', 'تكلفة')], ['u', B('Units (hours / qty)', 'وحدات (ساعات / كمية)')]], o.basis)}</div>
      <div class="scv-f"><label>${esc(B('Timescale', 'المقياس الزمني'))}</label>${sel('sc_u', [['Day', B('Day', 'يوم')], ['Week', B('Week', 'أسبوع')], ['Month', B('Month', 'شهر')], ['Quarter', B('Quarter', 'ربع سنة')], ['Year', B('Year', 'سنة')]], o.unit)}</div>
      <div class="scv-f"><label>${esc(B('Start (blank = auto)', 'البداية (فارغ = تلقائي)'))}</label><input id="sc_s" class="inp" placeholder="dd-mmm-yy" value="${o.start != null ? esc(fmtD(o.start)) : ''}"></div>
      <div class="scv-f"><label>${esc(B('End (blank = auto)', 'النهاية (فارغ = تلقائي)'))}</label><input id="sc_e" class="inp" placeholder="dd-mmm-yy" value="${o.end != null ? esc(fmtD(o.end)) : ''}"></div>
      <div class="scv-f"><label>${esc(B('WBS scope', 'نطاق WBS'))}</label>${sel('sc_w', wopts, o.wbs)}</div>
      <div class="scv-f"><label>${esc(B('WBS level', 'مستوى WBS'))}</label>${sel('sc_l', [[0, B('All levels', 'كل المستويات')], ...Array.from({ length: maxDepth }, (_, i) => [i + 1, B('Level ', 'المستوى ') + (i + 1)])], o.level)}</div>
      <div class="scv-f"><label>${esc(B('Values in distribution', 'القيم في التوزيع'))}</label>${sel('sc_c', [['0', B('Per period', 'لكل فترة')], ['1', B('Cumulative', 'تراكمي')]], o.cum ? 1 : 0)}</div>
      ${ck('sc_he', o.hideEmpty, B('Hide WBS without assignments', 'إخفاء WBS بدون تعيينات'))}
      <b>${esc(B('Measures', 'المقاييس'))}</b>${ck('sc_mp', o.meas.planned, B('Planned', 'المخطط'))}${ck('sc_ma', o.meas.actual, B('Actual', 'الفعلي'))}${ck('sc_mf', o.meas.forecast, B('Forecast', 'المتوقع'))}
      <b>${esc(B('Distribution', 'التوزيع'))}</b>${ck('sc_dw', o.sheets.wbs, B('By WBS', 'حسب WBS'))}${ck('sc_dr', o.sheets.res, B('By resource', 'حسب المورد'))}${ck('sc_drw', o.sheets.rw, B('Resource ▸ WBS', 'المورد ▸ WBS'))}
      <b>${esc(B('Resources', 'الموارد'))}</b><div class="scv-q"><button class="btn sm" data-q="all">${esc(B('All', 'الكل'))}</button><button class="btn sm" data-q="none">${esc(B('None', 'لا شيء'))}</button><button class="btn sm" data-q="RT_Labor">${esc(B('Labor', 'عمالة'))}</button><button class="btn sm" data-q="RT_Equip">${esc(B('Equip.', 'معدات'))}</button><button class="btn sm" data-q="RT_Mat">${esc(B('Material', 'مواد'))}</button></div>
      <div class="scv-rl">${list.map((r) => `<label class="chk"><input type="checkbox" class="sc_r" data-id="${r.id}" data-t="${r.type}"${rsSel.has(r.id) ? ' checked' : ''}> ${esc((r.short ? r.short + ' – ' : '') + r.name)} <small>${esc(RTN[r.type] || '')}</small></label>`).join('')}</div></div>
      <div class="scv-pv"><div class="scv-kpi" id="scv_k"></div><div id="scv_c"></div><div class="scv-tabs" id="scv_t"></div><div id="scv_tb"></div></div></div>`;
    const m = D.modal({ title: B('S-Curve & distribution – preview', 'منحنى S والتوزيع – معاينة'), cls: 'wide dsh-modal', body, sticky: true, buttons: [{ label: P6.t('close'), fn: () => {} }, { label: B('Export to Excel', 'تصدير إلى Excel'), cls: 'pri', fn: () => { if (!last) return false; try { App.xlsxBook(sanitize(p.name) + '-S-Curve-' + o.unit + '.xlsx', last.sheets); App.toast(B('Excel exported: ' + last.sheets.length + ' sheets', 'تم التصدير: ' + last.sheets.length + ' شيت')); } catch (er) { console.error(er); App.toast(String(er.message || er), true); } return false; } }] });
    const mod = m.el.querySelector('.modal'); if (mod) { mod.style.width = 'min(1500px,97vw)'; mod.style.maxWidth = '97vw'; }
    const $ = (q) => body.querySelector(q);
    function read() {
      const ps = $('#sc_s').value.trim(), pe = $('#sc_e').value.trim(), s = ps ? P6.parseDate(ps) : null, e = pe ? P6.parseDate(pe) : null; if ((ps && s == null) || (pe && e == null)) return false;
      const ids = [...body.querySelectorAll('.sc_r')].filter((x) => x.checked).map((x) => +x.dataset.id);
      Object.assign(o, { basis: $('#sc_b').value, unit: $('#sc_u').value, cum: $('#sc_c').value === '1', start: s, end: e, level: +$('#sc_l').value, wbs: +$('#sc_w').value, hideEmpty: $('#sc_he').checked, meas: { planned: $('#sc_mp').checked, actual: $('#sc_ma').checked, forecast: $('#sc_mf').checked }, sheets: { wbs: $('#sc_dw').checked, res: $('#sc_dr').checked, rw: $('#sc_drw').checked }, rs: ids.length === list.length ? null : ids });
      o._ids = ids; return true;
    }
    function draw() {
      if (!read()) { $('#scv_k').innerHTML = `<span class="cmp-bad">${esc(B('Bad date', 'تاريخ غير صالح'))}</span>`; return; }
      if (!o._ids.length) { $('#scv_c').innerHTML = `<p class="hint">${esc(B('Select at least one resource', 'اختر مورداً واحداً على الأقل'))}</p>`; $('#scv_tb').innerHTML = ''; $('#scv_t').innerHTML = ''; $('#scv_k').innerHTML = ''; last = null; return; }
      App.saveCfg();
      try { last = build(o); } catch (er) { last = null; $('#scv_c').innerHTML = `<p class="cmp-bad">${esc(String(er.message || er))}</p>`; $('#scv_tb').innerHTML = ''; $('#scv_t').innerHTML = ''; $('#scv_k').innerHTML = ''; return; }
      const C = last.C, pct = (v) => (C.BAC ? Math.round((v / C.BAC) * 1000) / 10 : 0), spi = C.PV ? C.EV / C.PV : null, kp = (v, l, cls) => `<div class="cmpc ${cls || ''}"><b>${v}</b><span>${esc(l)}</span></div>`;
      $('#scv_k').innerHTML = kp(fv(C.cost ? 'c0' : 'f', C.BAC), B('Budget at completion', 'الميزانية عند الإنجاز')) + kp(pct(C.PV) + '%', B('Planned to date', 'المخطط حتى الآن')) + kp(pct(C.EV) + '%', B('Earned to date', 'المكتسب حتى الآن'), C.EV >= C.PV ? 'good' : 'bad') + kp(spi == null ? '–' : spi.toFixed(2), 'SPI', spi != null && spi < 1 ? 'bad' : 'good') + kp(C.rows.length, B('Assignments', 'التعيينات')) + kp(C.n + ' · ' + o.unit, B('Periods', 'الفترات'));
      $('#scv_c').innerHTML = chartSvg(C) + (C.truncated ? `<p class="hint">${esc(B('Periods capped at 1,500.', 'الفترات محدودة بـ 1500.'))}</p>` : '');
      const names = last.sheets.map((s) => s.name).filter((nm) => nm !== 'Summary' || true); if (!names.includes(cur)) cur = 'S-Curve';
      $('#scv_t').innerHTML = names.map((nm) => `<button class="btn sm${nm === cur ? ' pri' : ''}" data-s="${esc(nm)}">${esc(nm)}</button>`).join('');
      showSheet();
    }
    function showSheet() { if (!last) return; const sh = last.sheets.find((s) => s.name === cur) || last.sheets[1]; $('#scv_tb').innerHTML = `<div class="hint" style="margin:4px 0"><b>${esc(sh.title)}</b> · ${esc(sh.subtitle || '')}</div>` + tableHtml(sh); body.querySelectorAll('#scv_t [data-s]').forEach((b) => b.classList.toggle('pri', b.dataset.s === sh.name)); }
    const later = () => { clearTimeout(timer); timer = setTimeout(draw, 160); };
    body.addEventListener('change', later); body.addEventListener('input', (e) => { if (e.target.tagName === 'INPUT' && e.target.type === 'text') later(); });
    body.addEventListener('click', (ev) => {
      const q = ev.target.closest('[data-q]'); if (q) { const k = q.dataset.q; body.querySelectorAll('.sc_r').forEach((c) => { c.checked = k === 'all' ? true : k === 'none' ? false : c.dataset.t === k; }); return later(); }
      const sb = ev.target.closest('[data-s]'); if (sb) { cur = sb.dataset.s; showSheet(); }
    });
    draw();
  };
})(window);

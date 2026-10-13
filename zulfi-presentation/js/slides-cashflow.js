/* Slides 7-8: monthly cash flow + S-curve, and the cash-flow matrix */
(function (G) {
  const Z = G.Z, F = Z.F, dt = Z.dt, A = Z.app;
  const ui = () => (A.s.ui.cf = A.s.ui.cf || { dim: 'group', unit: 'k' });
  const mxui = () => (A.s.ui.mx = A.s.ui.mx || { unit: 'k', heat: true });

  A.changes.status = (el) => { A.s.ui.status = dt.parse(el.value) || null; A.refilter(); };
  A.actions.clearStatus = () => { A.s.ui.status = null; A.refilter(); };
  A.actions.cfDim = (el) => { ui().dim = el.dataset.d; A.refilter(); };
  A.actions.mxUnit = (el) => { mxui().unit = el.dataset.u; A.refilter(); };
  A.actions.mxHeat = () => { mxui().heat = !mxui().heat; A.refilter(); };

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

  /* ---- reusable S-curve (also on the dashboard) ---- */
  F.scurve = function (M, agg, o) {
    o = o || {};
    const w = o.w || 600, h = o.h || 260, L = o.L || 44, R = o.R || 14, T = 12, B = o.B || 34;
    const pw = w - L - R, ph = h - T - B, bw = pw / M.N;
    const X = (k) => L + (k + 0.5) * bw, Y = (p) => T + ph - p * ph;
    const base = baseCurve(M, agg.list);
    let s = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}">`;
    [0, 0.25, 0.5, 0.75, 1].forEach((p) => (s += `<g class="grid"><line x1="${L}" x2="${w - R}" y1="${Y(p)}" y2="${Y(p)}"/></g><text x="${L - 6}" y="${Y(p) + 4}" text-anchor="end" style="font-size:11px">${p * 100}%</text>`));
    for (let k = 0; k < M.N; k++) if (k % (o.step || 3) === 0) s += `<text x="${X(k)}" y="${h - B + 15}" text-anchor="middle" style="font-size:11px">M${k + 1}</text>` + (o.dates === false ? '' : `<text x="${X(k)}" y="${h - B + 28}" text-anchor="middle" style="font-size:9.5px;fill:var(--mute)">${dt.fmtMY(M.bs[k])}</text>`);
    const pts = agg.pct.map((p, k) => [X(k), Y(p)]);
    const poly = (arr) => arr.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('');
    s += `<path d="${poly([[X(0), Y(0)], ...pts])} L${X(M.N - 1)},${Y(0)} L${X(0)},${Y(0)}Z" fill="var(--brand)" opacity=".1"/>`;
    const bpts = base.map((p, k) => [X(k), Y(p)]);
    s += `<path d="${poly(bpts)}" fill="none" stroke="#8a97a3" stroke-width="2" stroke-dasharray="5 4"/>`;
    s += `<path d="${poly(pts)}" fill="none" stroke="var(--brand)" stroke-width="3" stroke-linejoin="round"/>`;
    const st = A.s.ui.status;
    if (st && st >= M.start && st < M.bs[M.N]) {
      const k = dt.bucketOf(M.start, st), xf = L + (k + (st - M.bs[k]) / (M.bs[k + 1] - M.bs[k])) * bw;
      const v = agg.sum ? Z.cumAt(M, agg.cum, st) / agg.sum : 0;
      s += `<line x1="${xf}" x2="${xf}" y1="${T}" y2="${T + ph}" stroke="var(--bad)" stroke-width="2"/><circle cx="${xf}" cy="${Y(v)}" r="5" fill="var(--bad)" stroke="#fff" stroke-width="2"/><text x="${xf + 6}" y="${T + 12}" style="font-size:11px;font-weight:700;fill:var(--bad)">${dt.fmtShort(st)} · ${F.pct(v)}</text>`;
    }
    pts.forEach((p, k) => {
      const dv = base[k] ? agg.pct[k] - base[k] : 0;
      s += `<rect class="hit" data-month="${k + 1}" x="${L + k * bw}" y="${T}" width="${bw}" height="${ph}" fill="transparent" data-tip="${F.tip('Month ' + (k + 1) + ' · ' + dt.fmtMY(M.bs[k]), [['var(--brand)', 'Cumulative', F.pct(agg.pct[k]) + ' · ' + F.M(agg.cum[k])], ['#8a97a3', 'Baseline', F.pct(base[k])], ['', 'Monthly spend', F.sar(agg.total[k])], ['', 'Δ vs baseline', (dv >= 0 ? '+' : '−') + Math.abs(dv * 100).toFixed(1) + ' pts']])}"/>`;
    });
    for (let k = 0; k < M.N; k += 1) s += `<circle cx="${X(k)}" cy="${Y(agg.pct[k])}" r="2.6" fill="var(--brand)" stroke="#fff" stroke-width="1" pointer-events="none"/>`;
    return s + '</svg>';
  };

  /* ---- stacked monthly columns ---- */
  function stackChart(M, agg, dim, w, h) {
    const L = 58, R = 14, T = 12, B = 38, pw = w - L - R, ph = h - T - B, bw = pw / M.N;
    const nice = F.nice(Math.max(...agg.total, 1), 5);
    const Y = (v) => T + ph - (v / nice.max) * ph;
    let s = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}">`;
    for (let v = 0; v <= nice.max + 1; v += nice.step) s += `<g class="grid"><line x1="${L}" x2="${w - R}" y1="${Y(v)}" y2="${Y(v)}"/></g><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" style="font-size:11px">${F.compact(v)}</text>`;
    const keys = ORDER[dim].filter((k) => agg.map[k]);
    for (let k = 0; k < M.N; k++) {
      let acc = 0; const rows = [];
      keys.forEach((key) => {
        const v = agg.map[key][k]; if (v <= 0) return;
        const y1 = Y(acc + v), y0 = Y(acc); acc += v;
        s += `<rect x="${L + k * bw + 3}" y="${y1}" width="${bw - 6}" height="${Math.max(0, y0 - y1 - 1.5)}" fill="${seriesMeta(dim, key).color}" ${y0 - y1 > 8 ? 'rx="2"' : ''} stroke="#fff" stroke-width=".5"/>`;
        rows.push([seriesMeta(dim, key).color, seriesMeta(dim, key).name, F.n0(v)]);
      });
      if (k % 1 === 0) s += `<text x="${L + (k + 0.5) * bw}" y="${h - B + 14}" text-anchor="middle" style="font-size:11px">M${k + 1}</text><text x="${L + (k + 0.5) * bw}" y="${h - B + 27}" text-anchor="middle" style="font-size:9.5px;fill:var(--mute)">${dt.mon(M.bs[k])}</text>`;
      s += `<rect class="hit" data-month="${k + 1}" x="${L + k * bw}" y="${T}" width="${bw}" height="${ph}" fill="transparent" data-tip="${F.tip('Month ' + (k + 1) + ' · ' + dt.fmt(M.bs[k]) + ' → ' + dt.fmtShort(M.bs[k + 1] - 1), [...rows.reverse(), ['', '<b>Total</b>', '<b>' + F.sar(agg.total[k]) + '</b>'], ['', 'Cumulative', F.pct(agg.pct[k])]])}"/>`;
    }
    const st = A.s.ui.status;
    if (st && st >= M.start && st < M.bs[M.N]) { const k = dt.bucketOf(M.start, st), xf = L + (k + (st - M.bs[k]) / (M.bs[k + 1] - M.bs[k])) * bw; s += `<line x1="${xf}" x2="${xf}" y1="${T}" y2="${T + ph}" stroke="var(--bad)" stroke-width="2"/>`; }
    return s + '</svg>';
  }

  Z.registerSlide({
    id: 'cashflow', title: 'Cash flow & S-curve', desc: 'Monthly spend, cumulative %, vs baseline',
    render(M) {
      const u = ui(), dim = u.dim, st = A.s.ui.status;
      const agg = Z.aggregate(M, A.vis, dim === 'all' ? 'all' : dim);
      const tot = agg.sum, y1 = agg.total.slice(0, 12).reduce((a, b) => a + b, 0), y2 = tot - y1;
      const pk = agg.total.indexOf(Math.max(...agg.total)), m50 = agg.pct.findIndex((p) => p >= 0.5);
      const keys = ORDER[dim].filter((k) => agg.map[k]);
      const dbtn = (d, t) => `<button data-do="cfDim" data-d="${d}" class="${dim === d ? 'on' : ''}">${t}</button>`;
      const atSt = st ? Z.cumAt(M, agg.cum, st) : null;
      const kp = (k, v, d, extra) => `<div class="dstat" ${extra || ''}><div class="k">${k}</div><div class="v">${v}</div><div class="hint">${d}</div></div>`;
      return A.head('3b', 'Cash flow &amp; S-curve', 'Monthly cost-loaded spend and cumulative progress against the baseline plan', 'Sheet 3 · 26-Month Schedule (rows 80–86 + charts)') +
        `<div class="s-body" style="gap:12px">
          <div class="row" style="align-items:center;gap:14px;flex:none">
            <span class="lbl" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--mute)">Stack by</span>
            <span class="seg">${dbtn('group', 'WBS group')}${dbtn('epc', 'EPC category')}${dbtn('phase', 'Phase')}${dbtn('all', 'Total')}</span>
            <span class="lbl" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--mute);margin-left:14px">Status date</span>
            <input type="date" class="dinput" style="width:140px;height:30px" value="${st ? dt.iso(st) : ''}" min="${dt.iso(M.start)}" max="${dt.iso(M.bs[M.N] - 1)}" data-chg="status">
            ${st ? '<button class="btn sm" data-do="clearStatus">Clear</button>' : '<span class="hint">pick a date to read planned progress</span>'}
            <div class="legend" style="margin-left:auto">${keys.map((k) => `<span><i class="dot" style="background:${seriesMeta(dim, k).color}"></i>${seriesMeta(dim, k).name}</span>`).join('')}</div>
          </div>
          <div class="row grow" style="gap:16px">
            <div class="col grow" style="gap:12px">
              <div class="panel" style="flex:1.15"><div class="ph"><h3>Monthly spend</h3><span class="sub">SAR per project month · click a column for the month's detail</span></div><div class="pb" style="padding-top:0">${stackChart(M, agg, dim, 1090, 305)}</div></div>
              <div class="panel" style="flex:1"><div class="ph"><h3>S-curve – cumulative % complete (cost)</h3>
                <div class="right legend"><span><i class="dot" style="background:var(--brand)"></i>Current plan</span><span><i class="dot" style="background:#8a97a3"></i>Baseline</span></div></div>
                <div class="pb" style="padding-top:0">${F.scurve(M, agg, { w: 1090, h: 245, L: 58, R: 14, B: 36, step: 1, dates: false })}</div></div>
            </div>
            <div class="col" style="width:372px;gap:12px">
              ${kp('Total (selection)', F.sar(tot), `${agg.list.length} activities · ${F.pct(M.total ? tot / M.total : 0)} of project`)}
              <div class="row" style="gap:12px">${kp('Year 1 · M1–12', F.M(y1), F.pct(tot ? y1 / tot : 0) + ' of cost', 'style="flex:1"')}${kp('Year 2 · M13+', F.M(y2), F.pct(tot ? y2 / tot : 0) + ' of cost', 'style="flex:1"')}</div>
              ${kp('Peak month', `M${pk + 1} <small>${dt.fmtMY(M.bs[pk])}</small>`, F.sar(agg.total[pk]), `data-month="${pk + 1}" style="cursor:pointer"`)}
              ${kp('Average monthly spend', F.M(tot / M.N), `over ${M.N} months`)}
              ${kp('50% of cost reached', m50 >= 0 ? `M${m50 + 1} <small>${dt.fmtMY(M.bs[m50])}</small>` : '–', m50 >= 0 ? `cumulative ${F.pct(agg.pct[m50])}` : '')}
              ${kp('Planned progress at status date', st ? F.pct(tot ? atSt / tot : 0) : '–', st ? `${dt.fmt(st)} · ${F.sar(atSt)}` : 'choose a status date above', st ? 'style="border-color:var(--bad)"' : '')}
              <div class="note info" style="margin-top:auto">Baseline = the original Excel plan re-based on the current start date. Move activities or change assumptions and the gap shows here.</div>
            </div>
          </div></div>`;
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
      const ft = (label, vals, top, f) => `<tr class="tot"><td class="stk" style="left:0;bottom:${top}px;z-index:4"></td><td class="stk" style="left:58px;bottom:${top}px;z-index:4">${label}</td><td class="stk num" style="left:292px;bottom:${top}px;z-index:4">${f === 'sum' ? F.n0(agg.sum) : ''}</td>${vals.map((v) => `<td class="c" style="bottom:${top}px">${f === 'pct' ? F.pct(v, 1) : fmt(v) || '·'}</td>`).join('')}</tr>`;
      const ubtn = (k, t) => `<button data-do="mxUnit" data-u="${k}" class="${u.unit === k ? 'on' : ''}">${t}</button>`;
      return A.head('3c', 'Cash-flow matrix', 'Every activity’s cost spread across the project months – the Excel schedule grid, live', 'Sheet 3 · 26-Month Schedule (grid)') +
        `<div class="s-body" style="gap:10px"><div class="row" style="align-items:center;gap:14px;flex:none"><span class="lbl" style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--mute)">Units</span><span class="seg">${ubtn('sar', 'SAR')}${ubtn('k', 'SAR thousand')}${ubtn('m', 'SAR million')}</span>
          <button class="chip ${u.heat ? 'on' : ''}" data-do="mxHeat">Heat-map</button><span class="hint">Click a row for activity details, a month header for the month's breakdown.</span></div>
          <div class="panel grow"><div class="pb scroll hm" data-keep="matrix" style="padding:0"><table class="tbl hm"><thead><tr>${head}</tr></thead><tbody>${body || '<tr><td colspan="30" class="empty">No activities match the filters</td></tr>'}</tbody>
          <tfoot style="display:table-footer-group">${ft('Total monthly spend', agg.total, 52, 'sum').replace(/<tr class="tot">/, '<tr class="tot">')}${ft('Cumulative spend', agg.cum, 26)}${ft('Cumulative % complete', agg.pct, 0, 'pct')}</tfoot></table></div></div></div>`;
    },
  });
})(window);

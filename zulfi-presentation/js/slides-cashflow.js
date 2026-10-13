/* Slides 7-8: monthly cash flow + S-curve, and the cash-flow matrix */
(function (G) {
  const Z = G.Z, F = Z.F, dt = Z.dt, A = Z.app;
  const ui = () => (A.s.ui.cf = A.s.ui.cf || { dim: 'group', per: 1 });
  const mxui = () => (A.s.ui.mx = A.s.ui.mx || { unit: 'k', heat: true });

  A.changes.status = (el) => { A.s.ui.status = dt.parse(el.value) || null; A.refilter(); };
  A.actions.clearStatus = () => { A.s.ui.status = null; A.refilter(); };
  A.actions.cfPer = (el) => { ui().per = +el.dataset.p; A.refilter(); };
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

  /* period helpers: view the project by month (per=1) or quarter (per=3) */
  const periods = (M, per) => Math.ceil(M.N / per);
  const sumP = (arr, k, per) => { let t = 0; for (let i = k * per; i < Math.min(arr.length, (k + 1) * per); i++) t += arr[i]; return t; };
  const lastIdx = (M, k, per) => Math.min(M.N, (k + 1) * per) - 1;
  const pLabel = (M, k, per) => (per === 1 ? 'M' + (k + 1) : 'Q' + (k + 1));
  const pSub = (M, k, per) => (per === 1 ? dt.mon(M.bs[k]) : 'M' + (k * per + 1) + '–' + (lastIdx(M, k, per) + 1));
  const pTitle = (M, k, per) => (per === 1 ? 'Month ' + (k + 1) + ' · ' + dt.fmt(M.bs[k]) + ' → ' + dt.fmtShort(M.bs[k + 1] - 1)
    : 'Quarter ' + (k + 1) + ' · M' + (k * per + 1) + '–M' + (lastIdx(M, k, per) + 1) + ' · ' + dt.fmtShort(M.bs[k * per]) + ' → ' + dt.fmtShort(M.bs[lastIdx(M, k, per) + 1] - 1));
  const statusX = (M, st, per, L, bw) => { const k = dt.bucketOf(M.start, st); return L + ((k + (st - M.bs[k]) / (M.bs[k + 1] - M.bs[k])) / per) * bw; };

  /* ---- reusable S-curve (also on the dashboard) ---- */
  F.scurve = function (M, agg, o) {
    o = o || {};
    const per = o.per || 1, P = periods(M, per);
    const w = o.w || 600, h = o.h || 260, L = o.L || 44, R = o.R || 14, T = 12, B = o.B || 34;
    const pw = w - L - R, ph = h - T - B, bw = pw / P;
    const X = (k) => L + (k + 0.5) * bw, Y = (p) => T + ph - p * ph;
    const base = baseCurve(M, agg.list);
    const pct = []; const bpct = [];
    for (let k = 0; k < P; k++) { pct.push(agg.pct[lastIdx(M, k, per)]); bpct.push(base[lastIdx(M, k, per)]); }
    let s = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" style="min-width:${w > 900 ? 780 : 0}px">`;
    [0, 0.25, 0.5, 0.75, 1].forEach((p) => (s += `<g class="grid"><line x1="${L}" x2="${w - R}" y1="${Y(p)}" y2="${Y(p)}"/></g><text x="${L - 6}" y="${Y(p) + 4}" text-anchor="end" style="font-size:11px">${p * 100}%</text>`));
    for (let k = 0; k < P; k++) if (per > 1 || k % (o.step || 3) === 0) s += `<text x="${X(k)}" y="${h - B + 15}" text-anchor="middle" style="font-size:11px">${pLabel(M, k, per)}</text>` + (o.dates === false ? '' : `<text x="${X(k)}" y="${h - B + 28}" text-anchor="middle" style="font-size:9.5px;fill:var(--mute)">${per === 1 ? dt.fmtMY(M.bs[k]) : pSub(M, k, per)}</text>`);
    const pts = pct.map((p, k) => [X(k), Y(p)]);
    const poly = (arr) => arr.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('');
    s += `<path d="${poly([[L, Y(0)], ...pts])} L${X(P - 1)},${Y(0)} L${L},${Y(0)}Z" fill="var(--brand)" opacity=".1"/>`;
    s += `<path d="${poly([[L, Y(0)], ...bpct.map((p, k) => [X(k), Y(p)])])}" fill="none" stroke="#8a97a3" stroke-width="2" stroke-dasharray="5 4"/>`;
    s += `<path d="${poly([[L, Y(0)], ...pts])}" fill="none" stroke="var(--brand)" stroke-width="3" stroke-linejoin="round"/>`;
    const st = A.s.ui.status;
    if (st && st >= M.start && st < M.bs[M.N]) {
      const xf = statusX(M, st, per, L, bw), v = agg.sum ? Z.cumAt(M, agg.cum, st) / agg.sum : 0;
      s += `<line x1="${xf}" x2="${xf}" y1="${T}" y2="${T + ph}" stroke="var(--bad)" stroke-width="2"/><circle cx="${xf}" cy="${Y(v)}" r="5" fill="var(--bad)" stroke="#fff" stroke-width="2"/><text x="${xf + 6}" y="${T + 12}" style="font-size:11px;font-weight:700;fill:var(--bad)">${dt.fmtShort(st)} · ${F.pct(v)}</text>`;
    }
    for (let k = 0; k < P; k++) {
      const dv = pct[k] - bpct[k], spend = sumP(agg.total, k, per);
      s += `<rect class="hit" ${per === 1 ? `data-month="${k + 1}"` : ''} x="${L + k * bw}" y="${T}" width="${bw}" height="${ph}" fill="transparent" data-tip="${F.tip(pTitle(M, k, per), [['var(--brand)', 'Cumulative', F.pct(pct[k]) + ' · ' + F.M(agg.cum[lastIdx(M, k, per)])], ['#8a97a3', 'Baseline', F.pct(bpct[k])], ['', per === 1 ? 'Monthly spend' : 'Quarter spend', F.sar(spend)], ['', 'Δ vs baseline', (dv >= 0 ? '+' : '−') + Math.abs(dv * 100).toFixed(1) + ' pts']])}"/>`;
      s += `<circle cx="${X(k)}" cy="${Y(pct[k])}" r="${per === 1 ? 2.6 : 3.6}" fill="var(--brand)" stroke="#fff" stroke-width="1" pointer-events="none"/>`;
    }
    return s + '</svg>';
  };

  /* ---- stacked columns (month or quarter) ---- */
  function stackChart(M, agg, dim, w, h, per) {
    const P = periods(M, per);
    const L = 58, R = 14, T = 12, B = 38, pw = w - L - R, ph = h - T - B, bw = pw / P;
    const tot = []; for (let k = 0; k < P; k++) tot.push(sumP(agg.total, k, per));
    const nice = F.nice(Math.max(...tot, 1), 5);
    const Y = (v) => T + ph - (v / nice.max) * ph;
    let s = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" style="min-width:780px">`;
    for (let v = 0; v <= nice.max + 1; v += nice.step) s += `<g class="grid"><line x1="${L}" x2="${w - R}" y1="${Y(v)}" y2="${Y(v)}"/></g><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" style="font-size:11px">${F.compact(v)}</text>`;
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
      s += `<text x="${L + (k + 0.5) * bw}" y="${h - B + 14}" text-anchor="middle" style="font-size:11px">${pLabel(M, k, per)}</text><text x="${L + (k + 0.5) * bw}" y="${h - B + 27}" text-anchor="middle" style="font-size:9.5px;fill:var(--mute)">${pSub(M, k, per)}</text>`;
      s += `<rect class="hit" ${per === 1 ? `data-month="${k + 1}"` : ''} x="${L + k * bw}" y="${T}" width="${bw}" height="${ph}" fill="transparent" data-tip="${F.tip(pTitle(M, k, per), [...rows.reverse(), ['', '<b>Total</b>', '<b>' + F.sar(tot[k]) + '</b>'], ['', 'Cumulative', F.pct(agg.pct[lastIdx(M, k, per)])]])}"/>`;
    }
    const st = A.s.ui.status;
    if (st && st >= M.start && st < M.bs[M.N]) { const xf = statusX(M, st, per, L, bw); s += `<line x1="${xf}" x2="${xf}" y1="${T}" y2="${T + ph}" stroke="var(--bad)" stroke-width="2"/>`; }
    return s + '</svg>';
  }

  Z.registerSlide({
    id: 'cashflow', title: 'Cash flow & S-curve', desc: 'Monthly spend, cumulative %, vs baseline',
    render(M) {
      const u = ui(), dim = u.dim, st = A.s.ui.status, per = u.per || 1;
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
            <span class="lbl" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--mute);margin-left:10px">View</span>
            <span class="seg"><button data-do="cfPer" data-p="1" class="${per === 1 ? 'on' : ''}">Monthly</button><button data-do="cfPer" data-p="3" class="${per === 3 ? 'on' : ''}">Quarterly</button></span>
            <span class="lbl" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--mute);margin-left:10px">Status date</span>
            <input type="date" class="dinput" style="width:140px;height:30px" value="${st ? dt.iso(st) : ''}" min="${dt.iso(M.start)}" max="${dt.iso(M.bs[M.N] - 1)}" data-chg="status">
            ${st ? '<button class="btn sm" data-do="clearStatus">Clear</button>' : '<span class="hint">pick a date to read planned progress</span>'}
          </div>
          <div class="row grow" style="gap:16px">
            <div class="col grow" style="gap:12px">
              <div class="panel" style="flex:1.15"><div class="ph"><h3>${per === 1 ? 'Monthly' : 'Quarterly'} spend</h3><span class="sub">SAR per project ${per === 1 ? 'month · click for detail' : 'quarter (3 months)'}</span><div class="right legend" style="max-width:640px;justify-content:flex-end">${keys.map((k) => `<span><i class="dot" style="background:${seriesMeta(dim, k).color}"></i>${seriesMeta(dim, k).name.replace(/^(\d) .*/, (m, d) => m.length > 24 ? m.slice(0, 22) + '…' : m)}</span>`).join('')}</div></div><div class="pb" style="padding-top:0">${stackChart(M, agg, dim, 1090, 305, per)}</div></div>
              <div class="panel" style="flex:1"><div class="ph"><h3>S-curve – cumulative % complete (cost)</h3>
                <div class="right legend"><span><i class="dot" style="background:var(--brand)"></i>Current plan</span><span><i class="dot" style="background:#8a97a3"></i>Baseline</span></div></div>
                <div class="pb" style="padding-top:0">${F.scurve(M, agg, { w: 1090, h: 245, L: 58, R: 14, B: 36, step: 1, dates: false, per })}</div></div>
            </div>
            <div class="col" style="width:372px;gap:12px">
              <div class="col" style="gap:8px">${Z.phaseStrip(M, true)}</div>
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

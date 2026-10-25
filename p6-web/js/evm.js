/* P6 Web – costs, units, earned value and multiple-float-path analysis. */
(function (g) {
  'use strict';
  const P6 = g.P6;
  const KINDS = { RT_Labor: 'L', RT_Equip: 'N', RT_Mat: 'M' };
  const BASE = ['bu', 'au', 'ru', 'bu_L', 'bu_N', 'bu_M', 'au_L', 'au_N', 'au_M', 'ru_L', 'ru_N', 'ru_M',
    'bc_L', 'bc_N', 'bc_M', 'bc_E', 'ac_L', 'ac_N', 'ac_M', 'ac_E', 'rc_L', 'rc_N', 'rc_M', 'rc_E', 'blc', 'pv', 'ev', 'pvu', 'evu', 'n'];

  const frac = (s, e, d) => (s == null || e == null ? 0 : d < s ? 0 : d >= e ? 1 : (d - s + 1) / (e - s + 1));

  // actual / remaining units of one assignment (derived from % complete unless edited by hand)
  function asgSplit(a, tk) {
    if (a.manual) return { act: +a.act || 0, rem: a.rem != null ? +a.rem : Math.max(0, a.qty - (+a.act || 0)) };
    const f = tk && tk.status === 'C' ? 1 : tk ? Math.min(1, (tk.pct || 0) / 100) : 0;
    return { act: a.qty * f, rem: a.qty * (1 - f) };
  }
  // % complete used for earned value, per the activity's "% complete type"
  function perfPct(tk, m) {
    if (tk.status === 'C') return 100;
    if (tk.pctType === 'phys') return tk.pct || 0;
    if (tk.pctType === 'units') return m.au + m.ru > 0 ? (100 * m.au) / (m.au + m.ru) : 0;
    return tk.status === 'NS' || !(tk.dur > 0) ? 0 : Math.max(0, Math.min(100, ((tk.dur - tk.rem) / tk.dur) * 100));
  }
  function blank() { const m = {}; BASE.forEach((k) => { m[k] = 0; }); return m; }
  function derive(m, extra) {
    m.bc = m.bc_L + m.bc_N + m.bc_M + m.bc_E;
    m.ac = m.ac_L + m.ac_N + m.ac_M + m.ac_E;
    m.rc = m.rc_L + m.rc_N + m.rc_M + m.rc_E;
    m.atc = m.ac + m.rc;
    ['L', 'N', 'M', 'E'].forEach((k) => { m['atc_' + k] = m['ac_' + k] + m['rc_' + k]; });
    m.atu = m.au + m.ru;
    ['L', 'N', 'M'].forEach((k) => { m['atu_' + k] = m['au_' + k] + m['ru_' + k]; });
    m.cvar = m.bc - m.atc;                          // cost variance (budget - at completion)
    m.uvar = m.bu - m.atu;                          // units variance
    m.sv = m.ev - m.pv; m.cv = m.ev - m.ac;
    m.svu = m.evu - m.pvu; m.spiu = m.pvu > 0 ? m.evu / m.pvu : null;
    m.spi = m.pv > 0 ? m.ev / m.pv : null; m.cpi = m.ac > 0 ? m.ev / m.ac : null;
    m.svi = m.pv > 0 ? m.sv / m.pv : null; m.cvi = m.ev > 0 ? m.cv / m.ev : null;
    m.eac = m.atc; m.etc = m.rc; m.vac = m.bc - m.eac;
    m.eacCpi = m.cpi ? m.ac + (m.bc - m.ev) / m.cpi : null;
    m.tcpi = m.bc - m.ac > 0 ? (m.bc - m.ev) / (m.bc - m.ac) : null;
    m.costPct = m.atc > 0 ? (100 * m.ac) / m.atc : 0;
    m.unitsPct = m.atu > 0 ? (100 * m.au) / m.atu : 0;
    m.perfPct = m.bc > 0 ? (100 * m.ev) / m.bc : (extra && extra.perf != null ? extra.perf : 0);
    return m;
  }

  P6.metrics = function (p) {
    const dd = p.dataDate;
    const rs = new Map(p.rsrc.map((r) => [r.id, r]));
    const byTask = new Map();
    for (const a of p.asg) { if (!byTask.has(a.task)) byTask.set(a.task, []); byTask.get(a.task).push(a); }
    const T = new Map();
    for (const tk of p.tasks) {
      const m = blank(); m.n = 1;
      for (const a of byTask.get(tk.id) || []) {
        const r = rs.get(a.rsrc); if (!r) continue;
        const k = KINDS[r.type] || 'L', price = a.price != null ? +a.price : P6.priceAt(r, tk.es), sp = asgSplit(a, tk);
        m['bu_' + k] += a.qty; m['au_' + k] += sp.act; m['ru_' + k] += sp.rem;
        m['bc_' + k] += a.qty * price; m['ac_' + k] += sp.act * price; m['rc_' + k] += sp.rem * price;
      }
      const ex = +tk.exp || 0, f = tk.status === 'C' ? 1 : Math.min(1, (tk.pct || 0) / 100);
      m.bc_E = ex; m.ac_E = ex * f; m.rc_E = ex * (1 - f);
      m.bu = m.bu_L + m.bu_N + m.bu_M; m.au = m.au_L + m.au_N + m.au_M; m.ru = m.ru_L + m.ru_N + m.ru_M;
      const bcTot = m.bc_L + m.bc_N + m.bc_M + m.bc_E;
      const perf = perfPct(tk, m);
      m.ev = (bcTot * perf) / 100;
      const blCost = tk.bcost != null ? tk.bcost : bcTot;
      const s = tk.bs != null ? tk.bs : tk.es, e = tk.bf != null ? tk.bf : tk.ef;
      m.pv = blCost * frac(s, e, dd);
      m.blc = blCost;
      const blU = tk.bunits != null ? tk.bunits : m.bu_L;
      m.pvu = blU * frac(s, e, dd); m.evu = (m.bu_L * perf) / 100;
      derive(m, { perf });
      m.perf = perf;
      m.durPct = tk.status === 'C' ? 100 : tk.status === 'NS' || !(tk.dur > 0) ? 0 : Math.max(0, Math.min(100, ((tk.dur - tk.rem) / tk.dur) * 100));
      m.schedPct = tk.es == null ? 0 : tk.status === 'C' ? 100 : 100 * frac(tk.es, tk.ef, dd);
      T.set(tk.id, m);
    }
    // WBS roll-up: add the additive fields, then derive again
    const kids = new Map(), by = new Map(p.wbs.map((w) => [w.id, w]));
    p.wbs.forEach((w) => kids.set(w.id, []));
    p.wbs.forEach((w) => { if (w.parent != null && kids.has(w.parent)) kids.get(w.parent).push(w.id); });
    const tby = new Map();
    for (const tk of p.tasks) { if (!tby.has(tk.wbs)) tby.set(tk.wbs, []); tby.get(tk.wbs).push(tk.id); }
    const W = new Map();
    const calc = (id) => {
      const m = blank();
      for (const tid of tby.get(id) || []) {
        const x = T.get(tid); BASE.forEach((k) => { m[k] += x[k]; });
      }
      for (const k of kids.get(id) || []) { const x = calc(k); BASE.forEach((q) => { m[q] += x[q]; }); }
      derive(m);
      W.set(id, m);
      return m;
    };
    p.wbs.forEach((w) => { if (w.parent == null || !by.has(w.parent)) calc(w.id); });
    return { T, W };
  };

  // ---------- multiple float paths (driving-relationship chains), approximate P6 behaviour ----------
  P6.floatPaths = function (p, maxPaths) {
    maxPaths = maxPaths || 10;
    const open = new Map(p.tasks.filter((x) => x.status !== 'C' && !P6.isHammock(x) && x.tf != null).map((x) => [x.id, x]));
    p.tasks.forEach((x) => { x.fp = null; x.fpo = null; });
    const drv = new Map();
    for (const r of p.rels) if (open.has(r.p) && open.has(r.s) && r.rf != null && r.rf <= 0) { if (!drv.has(r.s)) drv.set(r.s, []); drv.get(r.s).push(r.p); }
    const assigned = new Set();
    let path = 0;
    while (path < maxPaths && assigned.size < open.size) {
      let E = null;
      for (const x of open.values()) if (!assigned.has(x.id) && (E == null || x.tf < E.tf || (x.tf === E.tf && x.ef > E.ef))) E = x;
      if (!E) break;
      path++;
      const depth = new Map([[E.id, 0]]), q = [E.id]; assigned.add(E.id);
      for (let i = 0; i < q.length; i++) for (const pr of drv.get(q[i]) || []) if (!assigned.has(pr)) { assigned.add(pr); depth.set(pr, depth.get(q[i]) + 1); q.push(pr); }
      const mx = Math.max(...depth.values());
      for (const [id, d] of depth) { const tk = open.get(id); tk.fp = path; tk.fpo = mx - d + 1; }
    }
    return path;
  };
  P6.asgSplit = asgSplit;
  if (typeof module !== 'undefined' && module.exports) module.exports = P6;
})(typeof globalThis !== 'undefined' ? globalThis : window);

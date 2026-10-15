/* Zulfi Railway Station – scheduling & cost engine (DOM-free, testable in Node).
   Dates are integer "day numbers" (days since 1970-01-01, UTC) so there are no DST surprises.
   The baseline reproduces the Excel workbook exactly: every activity is month-aligned, cost is spread
   evenly (GEN / ENG / PROC) or on a triangular ramp (CONS) over the project-month buckets. */
(function (G) {
  const Z = (G.Z = G.Z || {});
  const D = G.ZULFI_DATA;
  const MS = 86400000;

  /* ------------------------------------------------------------------ dates */
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dt = {
    ymd(y, m, d) { return Math.floor(Date.UTC(y, m, d) / MS); },
    parts(day) { const x = new Date(day * MS); return { y: x.getUTCFullYear(), m: x.getUTCMonth(), d: x.getUTCDate() }; },
    parse(iso) { const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return p ? dt.ymd(+p[1], +p[2] - 1, +p[3]) : null; },
    iso(day) { const p = dt.parts(day); return p.y + '-' + String(p.m + 1).padStart(2, '0') + '-' + String(p.d).padStart(2, '0'); },
    fmt(day) { const p = dt.parts(day); return p.d + ' ' + MON[p.m] + ' ' + p.y; },
    fmtShort(day) { const p = dt.parts(day); return p.d + ' ' + MON[p.m] + ' ' + String(p.y).slice(2); },
    fmtMY(day) { const p = dt.parts(day); return MON[p.m] + '-' + String(p.y).slice(2); },
    mon(day) { return MON[dt.parts(day).m]; },
    addMonths(day, n) {
      const p = dt.parts(day);
      const t = p.y * 12 + p.m + n; const y = Math.floor(t / 12), m = ((t % 12) + 12) % 12;
      const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      return dt.ymd(y, m, Math.min(p.d, last));
    },
    // index of the project-month bucket that contains `d`
    bucketOf(start, d) {
      let k = Math.floor((d - start) / 30.4375);
      while (dt.addMonths(start, k + 1) <= d) k++;
      while (dt.addMonths(start, k) > d) k--;
      return k;
    },
  };
  Z.dt = dt;

  /* ------------------------------------------------------------- constants */
  Z.GROUPS = D.groups.map((g) => ({ code: g.code, name: g.name, amount: Math.round(g.amount) }));
  Z.GROUP_BY = Object.fromEntries(Z.GROUPS.map((g) => [g.code, g]));
  Z.ITEMS = D.items; Z.ITEM_BY = Object.fromEntries(D.items.map((i) => [i.key, i]));
  Z.EPC = [
    { key: 'GEN', name: 'General / Preliminaries', code: 'G.0' },
    { key: 'ENG', name: 'Engineering (Design)', code: 'E.0' },
    { key: 'PROC', name: 'Procurement of Materials', code: 'P.0' },
    { key: 'CONS', name: 'Installation & Construction', code: 'C.0' },
  ];
  Z.EPC_BY = Object.fromEntries(Z.EPC.map((e) => [e.key, e]));
  Z.DISC = {
    civil: { name: 'Civil & Site Works', applies: 'Main Building, Firefighting Building, Water Tank, Site Works & Utilities, Car Parking Sheds, Fence Works, Access Road, External Works' },
    mep: { name: 'MEP & Mechanical Equipment', applies: 'Substation & SEC Works, Generator Room, IT Equipment, Automatic Gate System' },
    rail: { name: 'Specialised Rail & Signalling Systems', applies: 'Signalling & Telecom, Railway Track Works, Railway Turnout Works' },
    fit: { name: 'Furniture / Fit-out', applies: 'Furniture, Fixtures & Equipment (FF&E)' },
  };
  Z.DEFAULT_A = {
    disc: { civil: 20, mep: 30, rail: 45, fit: 40 }, // materials %, construction = 100 - materials
    proc: [5, 15, 80], // vendor prequal, PO, manufacture & delivery
    stage: { concept: 15, prelim: 30, detail: 60 }, // raw design stage weights (sum 105 -> normalised)
    sub: { sub: 40, appr: 60 },
  };
  Z.cloneA = (a) => JSON.parse(JSON.stringify(a));
  Z.VAT = 0.15;
  Z.BASE_MONTHS = 26;

  /* ----------------------------------------------------------- activities */
  const ACTS = D.acts.map((a, i) => ({ ...a, idx: i }));
  const BY = Object.fromEntries(ACTS.map((a) => [a.code, a]));
  Z.ACT_DEFS = ACTS; Z.ACT_BY = BY;
  ACTS.forEach((a) => (a.succ = []));
  ACTS.forEach((a) => a.deps.forEach((p) => BY[p].succ.push(a.code)));
  // topological order (Kahn)
  Z.TOPO = (() => {
    const indeg = {}, out = [], q = [];
    ACTS.forEach((a) => (indeg[a.code] = a.deps.length));
    ACTS.forEach((a) => { if (!indeg[a.code]) q.push(a.code); });
    while (q.length) { const c = q.shift(); out.push(c); BY[c].succ.forEach((s) => { if (--indeg[s] === 0) q.push(s); }); }
    return out;
  })();
  Z.AUTO = '1.1'; // preliminaries span the whole project (auto-driven)

  /* ---------------------------------------------------------------- costs */
  function amountOf(a, A) {
    if (a.kind === 'gen') return a.amount; // fixed lump sums
    const norm = (arr) => { const s = arr.reduce((x, y) => x + y, 0) || 1; return arr.map((v) => v / s); };
    if (a.kind === 'eng') {
      const st = A.stage, tot = st.concept + st.prelim + st.detail || 1;
      const sub = A.sub, ss = sub.sub + sub.appr || 1;
      return Z.DESIGN_TOTAL * (st[a.stage] / tot) * (sub[a.sub] / ss);
    }
    const it = Z.ITEM_BY[a.item];
    const mat = Math.min(1, Math.max(0, A.disc[it.disc] / 100));
    if (a.kind === 'b') return it.total * (1 - mat);
    const w = norm(A.proc); const i = { a1: 0, a2: 1, a3: 2 }[a.kind];
    return it.total * mat * w[i];
  }
  Z.DESIGN_TOTAL = ACTS.filter((a) => a.kind === 'eng').reduce((s, a) => s + a.amount, 0);

  /* ------------------------------------------------------------ baseline */
  function baseDates(start) {
    const bs = [];
    for (let k = 0; k <= Z.BASE_MONTHS; k++) bs.push(dt.addMonths(start, k));
    const o = {};
    ACTS.forEach((a) => (o[a.code] = [bs[a.s - 1], bs[a.e] - 1]));
    return o;
  }

  /* ---------------------------------------------------------------- state */
  Z.DEFAULT_ADV = { pct: 10, from: 1 }; // advance payment: % of contract value, recovered in equal monthly deductions from this month to the last project month
  Z.DEFAULT_MS = { g1: 30, g2: 30 }; // days by which 'amount granted' precedes NTP (Phase 1) / the Phase 2 start
  Z.newState = (startIso) => ({ start: dt.parse(startIso || '2026-10-17'), ov: {}, A: Z.cloneA(Z.DEFAULT_A), link: 'two', adv: { ...Z.DEFAULT_ADV }, ms: { ...Z.DEFAULT_MS } });
  Z.cloneState = (s) => ({ start: s.start, ov: JSON.parse(JSON.stringify(s.ov)), A: Z.cloneA(s.A), link: s.link, adv: { ...(s.adv || Z.DEFAULT_ADV) }, ms: { ...(s.ms || Z.DEFAULT_MS) } });

  /* ------------------------------------------------------- distribution */
  function distribute(a, bs, N, amount) {
    const m = new Array(N).fill(0);
    if (!amount) return m;
    const s = a.s, e1 = a.e + 1;
    const cov = [];
    let first = -1;
    for (let k = 0; k < N; k++) {
      const lo = Math.max(s, bs[k]), hi = Math.min(e1, bs[k + 1]);
      const ov = hi > lo ? (hi - lo) / (bs[k + 1] - bs[k]) : 0;
      if (ov > 0) { if (first < 0) first = k; cov.push(ov); }
      else if (first >= 0) break;
    }
    if (first < 0) { m[Math.min(N - 1, Math.max(0, dt.bucketOf(bs[0], s)))] = amount; return m; }
    const n = cov.length;
    const w = cov.map((ov, j) => {
      if (a.epc !== 'CONS') return ov;
      const jj = j + 1; // slot index 1..n  (Excel: ((G-F)/2 - |m-(F+G)/2|) + 1)
      return (((n - 1) / 2 - Math.abs(jj - (n + 1) / 2)) + 1) * ov;
    });
    const sw = w.reduce((x, y) => x + y, 0) || 1;
    w.forEach((x, j) => (m[first + j] = (x / sw) * amount));
    return m;
  }

  /* -------------------------------------------------------------- compute */
  Z.compute = function (st) {
    const baseD = baseDates(st.start);
    // dates
    const dates = {};
    ACTS.forEach((a) => { dates[a.code] = st.ov[a.code] ? [st.ov[a.code][0], st.ov[a.code][1]] : [baseD[a.code][0], baseD[a.code][1]]; });
    // preliminaries span the whole project
    let fin = 0;
    ACTS.forEach((a) => { if (a.code !== Z.AUTO) fin = Math.max(fin, dates[a.code][1]); });
    dates[Z.AUTO] = [st.start, Math.max(fin, st.start)];
    const finish = dates[Z.AUTO][1];
    let N = Z.BASE_MONTHS; while (dt.addMonths(st.start, N) <= finish) N++;
    const bs = []; for (let k = 0; k <= N; k++) bs.push(dt.addMonths(st.start, k));

    const acts = ACTS.map((def) => {
      const a = { ...def };
      a.s = dates[a.code][0]; a.e = dates[a.code][1];
      a.bs = baseD[a.code][0]; a.be = baseD[a.code][1];
      a.dur = a.e - a.s + 1; a.bdur = a.be - a.bs + 1;
      a.amount = amountOf(def, st.A);
      a.changed = a.s !== a.bs || a.e !== a.be;
      a.ds = a.s - a.bs; a.de = a.e - a.be;
      a.m = distribute(a, bs, N, a.amount);
      return a;
    });
    const by = Object.fromEntries(acts.map((a) => [a.code, a]));

    // logic conflicts + float (critical path)
    const lagBase = (p, s) => by[s].bs - by[p].be;
    acts.forEach((a) => { a.conflict = false; a.conflictWith = []; });
    acts.forEach((s) => s.deps.forEach((p) => {
      if (s.code === Z.AUTO) return;
      if (s.s - by[p].e < Math.min(lagBase(p, s.code), 1)) { s.conflict = true; s.conflictWith.push(p); }
    }));
    const LF = {}, LS = {};
    for (let i = Z.TOPO.length - 1; i >= 0; i--) {
      const c = Z.TOPO[i], a = by[c];
      if (c === Z.AUTO) continue;
      let lf = fin;
      a.succ.forEach((sc) => { if (sc === Z.AUTO) return; lf = Math.min(lf, LS[sc] - Math.min(lagBase(c, sc), 1)); });
      LF[c] = lf; LS[c] = lf - a.dur + 1;
      a.float = lf - a.e; a.critical = a.float <= 0;
    }
    by[Z.AUTO].float = 0; by[Z.AUTO].critical = false;
    // float against the BASELINE completion date (negative = would finish after the baseline completion)
    const finB = baseD[Z.AUTO][1], LSb = {};
    for (let i = Z.TOPO.length - 1; i >= 0; i--) {
      const c = Z.TOPO[i], a = by[c];
      if (c === Z.AUTO) { a.floatB = 0; continue; }
      let lf = finB;
      a.succ.forEach((sc) => { if (sc === Z.AUTO) return; lf = Math.min(lf, LSb[sc] - Math.min(lagBase(c, sc), 1)); });
      LSb[c] = lf - a.dur + 1; a.floatB = lf - a.e;
    }

    // totals
    const totalM = new Array(N).fill(0);
    acts.forEach((a) => a.m.forEach((v, k) => (totalM[k] += v)));
    const total = acts.reduce((s, a) => s + a.amount, 0);
    let c = 0; const cum = totalM.map((v) => (c += v));
    const pct = cum.map((v) => v / total);

    // advance payment: received at NTP (month 1), recovered in equal monthly deductions until the last project month
    const adv = st.adv || Z.DEFAULT_ADV;
    const advAmt = total * Math.max(0, adv.pct) / 100;
    const recFrom = Math.min(Math.max(1, Math.round(adv.from || 1)), N);
    const nRec = N - recFrom + 1;
    const advIn = new Array(N).fill(0); advIn[0] = advAmt;
    const rec = new Array(N).fill(0); for (let k = recFrom - 1; k < N; k++) rec[k] = advAmt / nRec;
    const net = totalM.map((v, k) => v + advIn[k] - rec[k]);
    let cp = 0, bal = 0;
    const cumPay = net.map((v) => (cp += v));
    const balance = advIn.map((v, k) => (bal += v - rec[k]));
    const payment = { pct: adv.pct, amount: advAmt, from: recFrom, perMonth: nRec ? advAmt / nRec : 0, months: nRec, advIn, rec, net, cum: cumPay, cumPct: cumPay.map((v) => v / total), balance };

    // baseline monthly (for comparison): month-index based
    const baseActs = ACTS.map((def) => {
      const a = { ...def, s: baseD[def.code][0], e: baseD[def.code][1] };
      const bb = []; for (let k = 0; k <= Z.BASE_MONTHS; k++) bb.push(bs[k]);
      a.amount = amountOf(def, st.A); a.m = distribute(a, bb, Z.BASE_MONTHS, a.amount); return a;
    });

    const dm = (() => { const k = dt.bucketOf(st.start, finish + 1); const lo = dt.addMonths(st.start, k), hi = dt.addMonths(st.start, k + 1); return k + (finish + 1 - lo) / (hi - lo); })();
    const M = {
      st, acts, by, N, bs, start: st.start, finish, total, totalM, cum, pct,
      base: { acts: baseActs, by: Object.fromEntries(baseActs.map((a) => [a.code, a])), finish: baseD['1.1'][1] },
      durMonths: dm, pay: payment,
      changed: acts.filter((a) => a.changed),
    };
    M.base.totalM = new Array(Z.BASE_MONTHS).fill(0);
    baseActs.forEach((a) => a.m.forEach((v, k) => (M.base.totalM[k] += v)));
    c = 0; M.base.cum = M.base.totalM.map((v) => (c += v)); M.base.pct = M.base.cum.map((v) => v / total);
    M.conflicts = acts.filter((a) => a.conflict);
    M.criticalCount = acts.filter((a) => a.critical).length;
    return M;
  };

  /* ---------------------------------------------------------- aggregation */
  // sums monthly spend of filtered activities, optionally split by a dimension
  Z.aggregate = function (M, pred, dim) {
    const keys = [], map = {};
    const keyOf = (a) => (dim === 'group' ? a.group : dim === 'epc' ? a.epc : dim === 'phase' ? a.phase : dim === 'act' ? a.code : 'all');
    const list = M.acts.filter(pred);
    list.forEach((a) => {
      const k = keyOf(a);
      if (!map[k]) { map[k] = new Array(M.N).fill(0); keys.push(k); }
      a.m.forEach((v, i) => (map[k][i] += v));
    });
    const total = new Array(M.N).fill(0);
    keys.forEach((k) => map[k].forEach((v, i) => (total[i] += v)));
    const sum = total.reduce((x, y) => x + y, 0);
    let c = 0; const cum = total.map((v) => (c += v));
    return { keys, map, total, cum, sum, pct: cum.map((v) => (sum ? v / sum : 0)), list };
  };

  // planned cumulative spend on an arbitrary day (linear inside a month bucket)
  Z.cumAt = function (M, cum, day) {
    if (day < M.bs[0]) return 0;
    if (day >= M.bs[M.N]) return cum[M.N - 1] || 0;
    const k = dt.bucketOf(M.start, day);
    const prev = k > 0 ? cum[k - 1] : 0;
    return prev + ((cum[k] - prev) * (day - M.bs[k] + 1)) / (M.bs[k + 1] - M.bs[k]);
  };

  /* --------------------------------------------------------------- edits */
  Z.setActivity = function (st, code, ns, ne, opts) {
    opts = opts || {};
    const M0 = Z.compute(st);
    const before = {}; M0.acts.forEach((a) => (before[a.code] = [a.s, a.e]));
    const out = Z.cloneState(st);
    ns = Math.max(ns, out.start); ne = Math.max(ne, ns);
    const after = {}; Object.keys(before).forEach((c) => (after[c] = before[c].slice()));
    after[code] = [ns, ne];
    const mode = opts.link || st.link;
    if (mode !== 'off') {
      Z.TOPO.forEach((c) => {
        if (c === code || c === Z.AUTO) return;
        const a = BY[c]; if (!a.deps.length) return;
        let delta = -Infinity;
        a.deps.forEach((p) => { delta = Math.max(delta, after[p][1] - before[p][1]); });
        if (mode === 'push') delta = Math.max(0, delta);
        if (!isFinite(delta) || delta === 0) return;
        delta = Math.max(delta, out.start - before[c][0]);
        after[c] = [before[c][0] + delta, before[c][1] + delta];
      });
    }
    const baseD = baseDates(out.start);
    Object.keys(after).forEach((c) => {
      if (c === Z.AUTO) return;
      const b = baseD[c];
      if (after[c][0] === b[0] && after[c][1] === b[1]) delete out.ov[c];
      else out.ov[c] = after[c];
    });
    return out;
  };

  Z.resetActivity = (st, code) => { const o = Z.cloneState(st); delete o.ov[code]; return o; };

  Z.setStart = function (st, newStart) {
    const out = Z.cloneState(st);
    const old = st.start;
    const remap = (d) => {
      const k = dt.bucketOf(old, d);
      return dt.addMonths(newStart, k) + (d - dt.addMonths(old, k));
    };
    Object.keys(out.ov).forEach((c) => { out.ov[c] = [remap(out.ov[c][0]), remap(out.ov[c][1])]; });
    out.start = newStart;
    // drop overrides that equal the new baseline
    const baseD = baseDates(newStart);
    Object.keys(out.ov).forEach((c) => { if (out.ov[c][0] === baseD[c][0] && out.ov[c][1] === baseD[c][1]) delete out.ov[c]; });
    return out;
  };

  /* ---------------------------------------------------------- milestones */
  /* ------------------------------------------------------------ Phase 2 */
  Z.isP2 = (a) => a.phase === 'Phase 2';
  // analysis of the Phase 2 packages (Access Road, FF&E, Generator Room, Railway Track)
  Z.phase2 = function (M) {
    const l = M.acts.filter(Z.isP2);
    const start = Math.min(...l.map((a) => a.s)), baseStart = Math.min(...l.map((a) => a.bs));
    const minF = Math.min(...l.map((a) => a.floatB));
    return { list: l, start, baseStart, minFloat: minF, latest: start + minF, delay: M.finish - M.base.finish };
  };
  // Move the Phase 2 start (release). Later: Phase 2 activities starting before it are pushed (with their successors).
  // Earlier: the Phase 2 activities are pulled earlier by the same number of days (at-risk, before the Detailed Design gate).
  Z.setPhase2Start = function (st, day) {
    const bd = baseDates(st.start);
    const p2 = ACTS.filter(Z.isP2);
    const b0 = Math.min(...p2.map((a) => bd[a.code][0]));
    day = Math.max(day, st.start);
    let cur = Z.cloneState(st);
    p2.forEach((a) => delete cur.ov[a.code]);
    const delta = day - b0;
    if (delta < 0) {
      // pull only the packages whose procurement begins at the Phase 2 start (FF&E starts much later and is not pulled)
      const early = new Set(p2.filter((a) => bd[a.code][0] <= b0 + 45).map((a) => a.item));
      p2.filter((a) => early.has(a.item)).forEach((a) => (cur.ov[a.code] = [Math.max(st.start, bd[a.code][0] + delta), Math.max(st.start, bd[a.code][1] + delta)]));
      return cur;
    }
    if (delta === 0) return cur;
    Z.TOPO.filter((c) => Z.isP2(BY[c])).forEach((c) => {
      const m = Z.compute(cur).by[c];
      if (m.s < day) cur = Z.setActivity(cur, c, day, day + (m.e - m.s), { link: 'push' });
    });
    return cur;
  };

  /* ---------------------------------------------------------- milestones */
  Z.milestones = function (M) {
    const b = M.by, bb = M.base.by, st = M.st;
    const g1 = st.ms ? st.ms.g1 : 30, g2 = st.ms ? st.ms.g2 : 30;
    const P2 = Z.phase2(M);
    const minS = (f) => Math.min(...M.acts.filter(f).map((a) => a.s));
    const maxE = (f) => Math.max(...M.acts.filter(f).map((a) => a.e));
    const bminS = (f) => Math.min(...M.base.acts.filter(f).map((a) => a.s));
    const bmaxE = (f) => Math.max(...M.base.acts.filter(f).map((a) => a.e));
    const ll = (a) => a.ll && a.kind === 'a3';
    const list = [
      { k: 'grant1', name: 'Phase 1 amount granted (funds approved) – movable', d: M.start - g1, bd: M.start - Z.DEFAULT_MS.g1, nav: 'miles', edit: 'g1' },
      { k: 'ntp', name: 'NTP – Notice to Proceed (project start)', d: M.start, bd: M.start, code: '1.1' },
      { k: 'access', name: 'Access permits approved', d: b['1.2'].e, bd: bb['1.2'].e, code: '1.2' },
      { k: 'concept', name: 'Concept design approved', d: b['2.2'].e, bd: bb['2.2'].e, code: '2.2' },
      { k: 'prelim', name: 'Preliminary design approved', d: b['2.4'].e, bd: bb['2.4'].e, code: '2.4' },
      { k: 'proc', name: 'First procurement starts (Phase 1)', d: minS((a) => a.kind === 'a1' && a.phase === 'Phase 1'), bd: bminS((a) => a.kind === 'a1' && a.phase === 'Phase 1') },
      { k: 'grant2', name: 'Phase 2 amount granted (funds approved) – movable', d: P2.start - g2, bd: P2.baseStart - Z.DEFAULT_MS.g2, nav: 'phase2', edit: 'g2' },
      { k: 'p2', name: 'Phase 2 start (release) – movable', d: P2.start, bd: P2.baseStart, nav: 'phase2', edit: 'p2' },
      { k: 'p2late', name: 'Latest Phase 2 start to hold completion', d: P2.latest, bd: P2.baseStart, nav: 'phase2' },
      { k: 'detail', name: 'Detailed design approved', d: b['2.6'].e, bd: bb['2.6'].e, code: '2.6' },
      { k: 'permit', name: 'Work permit approved', d: b['1.3'].e, bd: bb['1.3'].e, code: '1.3' },
      { k: 'cons', name: 'Construction starts on site', d: minS((a) => a.kind === 'b'), bd: bminS((a) => a.kind === 'b') },
      { k: 'll', name: 'Long-lead deliveries complete', d: maxE(ll), bd: bmaxE(ll) },
      { k: 'fin', name: 'Practical completion', d: M.finish, bd: M.base.finish, code: '1.1' },
    ];
    list.forEach((m) => (m.delta = m.d - m.bd));
    return list;
  };

  /* ------------------------------------------------------------ sharing */
  Z.serialize = function (st) {
    const o = { s: dt.iso(st.start), l: st.link, ov: {}, A: st.A, adv: st.adv, ms: st.ms };
    Object.keys(st.ov).forEach((c) => (o.ov[c] = [dt.iso(st.ov[c][0]), dt.iso(st.ov[c][1])]));
    return JSON.stringify(o);
  };
  Z.deserialize = function (txt) {
    const o = JSON.parse(txt);
    const st = Z.newState(o.s); st.link = o.l || 'two';
    if (o.adv) st.adv = { ...Z.DEFAULT_ADV, ...o.adv }; if (o.ms) st.ms = { ...Z.DEFAULT_MS, ...o.ms };
    if (o.A) { const A = Z.cloneA(Z.DEFAULT_A); Object.assign(A.disc, o.A.disc); A.proc = o.A.proc || A.proc; Object.assign(A.stage, o.A.stage); Object.assign(A.sub, o.A.sub); st.A = A; }
    Object.keys(o.ov || {}).forEach((c) => { if (BY[c]) st.ov[c] = [dt.parse(o.ov[c][0]), dt.parse(o.ov[c][1])]; });
    return st;
  };
})(typeof window !== 'undefined' ? window : globalThis);

/* P6 Web – core: dates, calendars, model helpers and the CPM scheduling engine.
   Works in the browser (window.P6) and in Node (require) for tests. */
(function (g) {
  'use strict';
  const P6 = (g.P6 = g.P6 || {});
  const MS = 86400000;
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // ---------- dates (all dates are integer day numbers since 1970-01-01) ----------
  const toDay = (iso) => {
    if (!iso) return null;
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(iso));
    return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / MS) : null;
  };
  const fromDay = (d) => (d == null ? '' : new Date(d * MS).toISOString().slice(0, 10));
  const dow = (d) => (((d + 4) % 7) + 7) % 7; // 0 = Sunday
  const ymd = (d) => {
    const x = new Date(d * MS);
    return { y: x.getUTCFullYear(), m: x.getUTCMonth(), d: x.getUTCDate() };
  };
  const mkDay = (y, m, d) => Math.round(Date.UTC(y, m, d) / MS);
  const fmtDate = (d) => {
    if (d == null || !isFinite(d)) return '';
    const x = ymd(d);
    return String(x.d).padStart(2, '0') + '-' + MON[x.m] + '-' + String(x.y).slice(2);
  };
  function parseDate(s) {
    if (s == null) return null;
    s = String(s).replace(/[\u200e\u200f\u2066-\u2069]/g, '').trim();
    if (!s) return null;
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    if (m) return mkDay(+m[1], +m[2] - 1, +m[3]);
    m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/.exec(s);
    if (m) return mkDay(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1]);
    m = /^(\d{1,2})[\- ]([A-Za-z]{3})[a-z]*[\- ,]*(\d{2,4})$/.exec(s);
    if (m) {
      const mi = MON.findIndex((x) => x.toLowerCase() === m[2].toLowerCase());
      if (mi >= 0) return mkDay(m[3].length === 2 ? 2000 + +m[3] : +m[3], mi, +m[1]);
    }
    return null;
  }
  const todayDay = () => {
    const n = new Date();
    return mkDay(n.getFullYear(), n.getMonth(), n.getDate());
  };

  // ---------- calendars ----------
  // cal = { id, name, hrs, work:[Sun..Sat booleans], exc:{ day: true(work)|false(holiday) } }
  const WEEKS = {
    sunThu: [true, true, true, true, true, false, false],
    monFri: [false, true, true, true, true, true, false],
    satThu: [true, true, true, true, true, false, true],
    all7: [true, true, true, true, true, true, true]
  };
  function newCal(id, name, week) {
    return { id, name: name || 'Standard Calendar', hrs: 8, work: (week || WEEKS.sunThu).slice(), exc: {} };
  }
  function calOK(c) {
    if (c._ok === undefined) c._ok = c.work.some(Boolean) || Object.values(c.exc).some(Boolean);
    return c._ok;
  }
  const touchCal = (c) => { c._ok = undefined; };
  function isWork(c, d) {
    const e = c.exc[d];
    if (e !== undefined) return e;
    if (!calOK(c)) return true;
    return c.work[dow(d)];
  }
  const nextWork = (c, d) => {
    if (!isFinite(d)) return d;
    let n = 0;
    while (!isWork(c, d) && n++ < 4000) d++;
    return d;
  };
  const prevWork = (c, d) => {
    if (!isFinite(d)) return d;
    let n = 0;
    while (!isWork(c, d) && n++ < 4000) d--;
    return d;
  };
  function shift(c, d, k) {
    if (!isFinite(d)) return d;
    k = Math.round(k);
    const st = k >= 0 ? 1 : -1;
    let n = Math.abs(k), guard = 0;
    while (n > 0 && guard++ < 200000) {
      d += st;
      if (isWork(c, d)) n--;
    }
    return d;
  }
  const finishFromStart = (c, s, len) => (len <= 1 ? s : shift(c, s, Math.ceil(len) - 1));
  const startFromFinish = (c, f, len) => (len <= 1 ? f : shift(c, f, -(Math.ceil(len) - 1)));
  // number of working days in (a, b] (negative when b < a)
  function signedWork(c, a, b) {
    if (!isFinite(a) || !isFinite(b)) return 0;
    let n = 0;
    if (b >= a) { for (let d = a + 1; d <= b; d++) if (isWork(c, d)) n++; return n; }
    for (let d = b + 1; d <= a; d++) if (isWork(c, d)) n++;
    return -n;
  }
  // inclusive working days between two dates (used to derive a duration from start/finish)
  function durBetween(c, s, f) {
    if (f < s) return 0;
    let n = 0;
    for (let d = s; d <= f; d++) if (isWork(c, d)) n++;
    return n;
  }

  // ---------- model ----------
  function newProject(name, opts) {
    opts = opts || {};
    const ps = opts.planStart != null ? opts.planStart : todayDay();
    const cal = newCal(1, 'Standard Calendar', opts.week);
    return {
      id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: name || 'New Project',
      desc: '',
      planStart: ps,
      dataDate: ps,
      mustFinish: null,
      retained: true,
      critFloat: 0,
      cals: [cal],
      defCal: 1,
      wbs: [{ id: 1, parent: null, code: 'P1', name: name || 'New Project', seq: 0 }],
      tasks: [],
      rels: [],
      rsrc: [],
      asg: [],
      codeTypes: [], codeVals: [], pcTypes: [], pcVals: [], pcAssign: {}, udfs: [], floatPathMax: 10, roles: [], accounts: [], issues: [], thresholds: [], baselines: [], blPrimary: null,
      nid: 100,
      loops: [],
      xer: null
    };
  }
  const nextId = (p) => ++p.nid;
  function newRsrc(p, name, short, type) {
    return { id: nextId(p), name, short: short || String(name).slice(0, 8), type: type || 'RT_Labor', role: '', roles: [], unit: '', units: 8, price: 0, prices: [], notes: '', udf: {} };
  }
  // price in force on a given day (effective-dated price list, falls back to the flat price)
  function priceAt(r, day) {
    const l = r.prices;
    if (l && l.length) { let best = null; for (const x of l) if (x.date != null && day != null && x.date <= day && (!best || x.date > best.date)) best = x; if (!best) best = l.slice().sort((a, b) => (a.date || 0) - (b.date || 0))[0]; return +best.price || 0; }
    return +r.price || 0;
  }
  // ----- baselines (several named snapshots; one is the primary)
  function snapshotBaseline(p, name, M) {
    const tasks = {}, asg = {};
    for (const t of p.tasks) {
      const m = M && M.T.get(t.id);
      tasks[t.id] = { s: t.status === 'C' && t.as != null ? t.as : t.es, f: t.status === 'C' && t.af != null ? t.af : t.ef, d: t.dur, c: m ? m.bc : 0, u: m ? m.bu_L : 0 };
    }
    for (const a of p.asg) asg[a.id] = a.qty;
    return { id: nextId(p), name, date: todayDay(), tasks, asg };
  }
  function assignBaseline(p, id) {
    const b = p.baselines.find((x) => x.id === id);
    p.blPrimary = b ? b.id : null; p.blName = b ? b.name : '';
    for (const t of p.tasks) { const x = b && b.tasks[t.id]; t.bs = x ? x.s : null; t.bf = x ? x.f : null; t.bdur = x ? x.d : null; t.bcost = x ? x.c : null; t.bunits = x ? x.u : null; }
    for (const a of p.asg) { if (b && b.asg && b.asg[a.id] != null) a.bq = b.asg[a.id]; else delete a.bq; }
  }
  function ensureBaselines(p) {
    p.baselines = p.baselines || [];
    if (!p.baselines.length && p.tasks.some((t) => t.bs != null)) {
      const b = { id: nextId(p), name: p.blName || 'Baseline', date: todayDay(), tasks: {}, asg: {} };
      for (const t of p.tasks) if (t.bs != null) b.tasks[t.id] = { s: t.bs, f: t.bf, d: t.bdur != null ? t.bdur : t.dur, c: t.bcost != null ? t.bcost : 0, u: t.bunits != null ? t.bunits : 0 };
      for (const a of p.asg) if (a.bq != null) b.asg[a.id] = a.bq;
      p.baselines.push(b); p.blPrimary = b.id;
    }
    return p;
  }

  function newTask(p, wbsId, over) {
    const id = nextId(p);
    const cal = p.defCal;
    const t = {
      id, code: '', name: 'New Activity', wbs: wbsId, type: 'TT_Task', cal,
      dur: 5, rem: 5, pct: 0, pctType: 'dur', status: 'NS',
      as: null, af: null, ct: '', cd: null,
      es: null, ef: null, ls: null, lf: null, rs: null, tf: null, ff: null, crit: false,
      bs: null, bf: null, bdur: null, seq: id,
      steps: [], topics: [], docs: [], expenses: [], risks: [], discuss: [], exp: 0, dtype: 'DT_FixedDUR2', phys: 0, feedback: '', rev: false, codes: {}, udf: {}, bcost: null, bunits: null, fp: null, fpo: null
    };
    Object.assign(t, over || {});
    if (!t.code) t.code = autoCode(p);
    return t;
  }
  function autoCode(p) {
    let max = 0, w = 0;
    for (const t of p.tasks) {
      const m = /^([A-Za-z]*)(\d+)$/.exec(t.code);
      if (m) { const n = +m[2]; if (n > max) max = n; w = Math.max(w, m[2].length); }
    }
    const next = max ? max + 10 : 1000;
    let c = 'A' + next;
    while (p.tasks.some((t) => t.code === c)) c = 'A' + (++max + 10);
    return c;
  }

  // ---------- CPM ----------
  const isMile = (t) => t.type === 'TT_Mile' || t.type === 'TT_FinMile';
  const isFinMile = (t) => t.type === 'TT_FinMile';
  const isHammock = (t) => t.type === 'TT_LOE' || t.type === 'TT_WBS';

  function schedule(p) {
    p.cals.forEach(touchCal);
    const cals = new Map(p.cals.map((c) => [c.id, c]));
    const defCal = cals.get(p.defCal) || p.cals[0] || newCal(0);
    const N = new Map();
    for (const t of p.tasks) N.set(t.id, { t, cal: cals.get(t.cal) || defCal, preds: [], succs: [], done: false });
    for (const r of p.rels) {
      const a = N.get(r.p), b = N.get(r.s);
      if (!a || !b || a === b || isHammock(a.t) || isHammock(b.t)) continue;
      a.succs.push({ r, n: b });
      b.preds.push({ r, n: a });
    }
    // Kahn topological order
    const indeg = new Map();
    for (const n of N.values()) indeg.set(n, n.preds.length);
    const q = [], order = [];
    for (const n of N.values()) if (!indeg.get(n)) q.push(n);
    for (let i = 0; i < q.length; i++) {
      const n = q[i];
      order.push(n);
      for (const s of n.succs) {
        indeg.set(s.n, indeg.get(s.n) - 1);
        if (indeg.get(s.n) === 0) q.push(s.n);
      }
    }
    p.loops = [];
    if (order.length < N.size) {
      const seen = new Set(order);
      for (const n of N.values()) if (!seen.has(n)) { order.push(n); p.loops.push(n.t.code); }
    }

    const PS = p.planStart != null ? p.planStart : todayDay();
    const DD = Math.max(p.dataDate != null ? p.dataDate : PS, PS);

    // ----- forward pass
    for (const n of order) {
      const { t, cal } = n;
      if (isHammock(t)) { n.done = true; continue; }
      if (t.status === 'C') {
        t.as = t.as != null ? t.as : (t.es != null ? t.es : DD);
        t.af = t.af != null ? t.af : (t.ef != null ? t.ef : t.as);
        if (t.af < t.as) t.af = t.as;
        t.es = t.as; t.ef = t.af; t.rs = null; t.rem = 0; t.pct = 100;
        n.done = true;
        continue;
      }
      const mile = isMile(t), fm = isFinMile(t);
      const ip = t.status === 'IP';
      const len = mile ? 0 : (ip ? Math.max(0, t.rem) : Math.max(0, t.dur));
      let sLB = ip ? DD : Math.max(PS, DD), fLB = -Infinity;
      if (!(ip && !p.retained)) {
        for (const { r, n: pn } of n.preds) {
          if (!pn.done) continue;
          const pc = pn.cal, pt = pn.t;
          const predFin = isMile(pt) && !isFinMile(pt) ? prevWork(pc, pt.es - 1) : pt.ef;
          const predStart = pt.es;
          const lag = r.lag || 0;
          if (r.type === 'FS') {
            const c = shift(pc, predFin, lag);
            if (fm) fLB = Math.max(fLB, c); else sLB = Math.max(sLB, c + 1);
          } else if (r.type === 'SS') {
            const c = shift(pc, predStart, lag);
            if (fm) fLB = Math.max(fLB, c); else sLB = Math.max(sLB, c);
          } else if (r.type === 'FF') {
            const c = shift(pc, predFin, lag);
            if (mile && !fm) sLB = Math.max(sLB, c); else fLB = Math.max(fLB, c);
          } else {
            const c = shift(pc, predStart, lag);
            if (mile && !fm) sLB = Math.max(sLB, c); else fLB = Math.max(fLB, c);
          }
        }
      }
      if (t.ct === 'SNET' && t.cd != null) sLB = Math.max(sLB, t.cd);
      if (t.ct === 'FNET' && t.cd != null) fLB = Math.max(fLB, t.cd);
      let s, f;
      if (mile || len === 0) {
        s = f = nextWork(cal, Math.max(sLB, fLB));
      } else {
        s = nextWork(cal, sLB);
        f = finishFromStart(cal, s, len);
        if (fLB > f) { f = nextWork(cal, fLB); s = startFromFinish(cal, f, len); }
      }
      if (t.cd != null && (t.ct === 'MSO' || t.ct === 'MFO')) {
        if (t.ct === 'MSO') { s = nextWork(cal, t.cd); f = mile || len === 0 ? s : finishFromStart(cal, s, len); }
        else { f = nextWork(cal, t.cd); s = mile || len === 0 ? f : startFromFinish(cal, f, len); }
      }
      t.rs = s;
      t.es = ip && t.as != null ? t.as : s;
      t.ef = f;
      n.done = true;
    }

    // project end
    let pStart = Infinity, pEnd = -Infinity;
    for (const { t } of N.values()) {
      if (isHammock(t) || t.es == null) continue;
      pStart = Math.min(pStart, t.es);
      pEnd = Math.max(pEnd, t.ef);
    }
    if (!isFinite(pEnd)) { pStart = PS; pEnd = PS; }
    const projEnd = p.mustFinish != null ? p.mustFinish : pEnd;

    // ----- backward pass
    for (let i = order.length - 1; i >= 0; i--) {
      const n = order[i], { t, cal } = n;
      if (isHammock(t)) continue;
      if (t.status === 'C') { t.ls = t.es; t.lf = t.ef; t.tf = null; t.ff = null; t.crit = false; continue; }
      const mile = isMile(t), fm = isFinMile(t);
      const len = mile ? 0 : (t.status === 'IP' ? Math.max(0, t.rem) : Math.max(0, t.dur));
      let lfB = Infinity, lsB = Infinity, hasSucc = false;
      for (const { r, n: sn } of n.succs) {
        if (sn.t.status === 'C') continue;
        hasSucc = true;
        const st = sn.t, lag = r.lag || 0;
        const sStartEff = isFinMile(st) ? st.lf : prevWork(cal, st.ls - 1);
        const sFinEff = isMile(st) && !isFinMile(st) ? prevWork(cal, st.ls - 1) : st.lf;
        if (r.type === 'FS') lfB = Math.min(lfB, shift(cal, sStartEff, -lag));
        else if (r.type === 'SS') lsB = Math.min(lsB, shift(cal, isFinMile(st) ? st.lf : st.ls, -lag));
        else if (r.type === 'FF') lfB = Math.min(lfB, shift(cal, sFinEff, -lag));
        else lsB = Math.min(lsB, shift(cal, sFinEff, -lag));
      }
      if (!hasSucc) { if (mile && !fm) lsB = Math.min(lsB, projEnd); else lfB = Math.min(lfB, projEnd); }
      if (t.cd != null) {
        if (t.ct === 'SNLT' || t.ct === 'MSO') lsB = Math.min(lsB, t.cd);
        if (t.ct === 'FNLT' || t.ct === 'MFO') lfB = Math.min(lfB, t.cd);
      }
      let ls, lf;
      if (mile || len === 0) {
        if (fm) lf = prevWork(cal, Math.min(lfB, lsB));
        else lf = nextWork(cal, Math.min(lsB, isFinite(lfB) ? lfB + 1 : Infinity));
        ls = lf;
      } else {
        const fromLs = isFinite(lsB) ? finishFromStart(cal, prevWork(cal, lsB), len) : Infinity;
        lf = prevWork(cal, Math.min(lfB, fromLs));
        ls = startFromFinish(cal, lf, len);
      }
      t.ls = ls; t.lf = lf;
      t.tf = signedWork(cal, t.ef, lf);
      t.crit = t.tf <= (p.critFloat || 0);
      // free float
      let ff = Infinity;
      for (const { r, n: sn } of n.succs) {
        const st = sn.t;
        const lag = r.lag || 0;
        let g;
        const stStartEff = isFinMile(st) ? st.es : st.status === 'IP' ? st.rs : st.es;
        if (r.type === 'FS') g = isFinMile(st) ? signedWork(cal, t.ef, st.ef) : signedWork(cal, t.ef, st.status === 'IP' ? st.rs : st.es) - 1;
        else if (r.type === 'SS') g = signedWork(cal, t.es, stStartEff);
        else if (r.type === 'FF') g = signedWork(cal, t.ef, st.ef);
        else g = signedWork(cal, t.es, st.ef);
        ff = Math.min(ff, g - lag);
      }
      t.ff = isFinite(ff) ? Math.max(0, Math.min(ff, t.tf)) : Math.max(0, t.tf);
      for (const { r, n: sn } of n.succs) {
        const st = sn.t, lag = r.lag || 0;
        const sStart = st.status === 'IP' ? st.rs : st.es;
        let g;
        if (r.type === 'FS') g = isFinMile(st) ? signedWork(cal, t.ef, st.ef) : signedWork(cal, t.ef, sStart) - 1;
        else if (r.type === 'SS') g = signedWork(cal, t.es, isFinMile(st) ? st.es : sStart);
        else if (r.type === 'FF') g = signedWork(cal, t.ef, st.ef);
        else g = signedWork(cal, t.es, st.ef);
        r.rf = g - lag;
      }
      if (t.ct === 'ALAP' && t.status === 'NS' && t.tf > 0) {
        t.es = t.ls; t.rs = t.ls; t.ef = t.lf; t.tf = 0; t.ff = 0;
      }
    }
    for (const { t } of N.values()) {
      if (isHammock(t)) continue;
      if (t.steps && t.steps.length) { const w = t.steps.reduce((a, s) => a + (+s.wt || 1), 0); t.phys = w ? Math.round(t.steps.reduce((a, s) => a + (s.done ? (+s.wt || 1) : 0), 0) / w * 100) : 0; if (t.pctType === 'phys' && t.status !== 'C') { t.pct = t.phys; } }
      if (t.status === 'C') t.pct = 100;
      else if (t.pctType === 'phys' && t.steps && t.steps.length) { /* pct set from steps */ }
      else if (t.pctType === 'dur') t.pct = t.status === 'NS' || !(t.dur > 0) ? 0 : Math.max(0, Math.min(99, Math.round(((t.dur - t.rem) / t.dur) * 100)));
    }
    p.start = pStart; p.finish = pEnd;
    return p;
  }

  // ---------- WBS roll-up ----------
  function rollup(p) {
    const kids = new Map(), by = new Map();
    for (const w of p.wbs) { by.set(w.id, w); kids.set(w.id, []); }
    for (const w of p.wbs) if (w.parent != null && kids.has(w.parent)) kids.get(w.parent).push(w.id);
    const tasksBy = new Map();
    for (const t of p.tasks) {
      if (!tasksBy.has(t.wbs)) tasksBy.set(t.wbs, []);
      tasksBy.get(t.wbs).push(t);
    }
    const out = new Map();
    const calc = (id) => {
      const r = { es: Infinity, ef: -Infinity, bs: Infinity, bf: -Infinity, dur: 0, done: 0, crit: false, count: 0, tf: Infinity, as: Infinity, af: -Infinity, allC: true, nNS: 0, nIP: 0, nC: 0, nCrit: 0, rem: 0, ls: Infinity, lf: -Infinity };
      for (const t of tasksBy.get(id) || []) {
        if (t.es != null) { r.es = Math.min(r.es, t.es); r.ef = Math.max(r.ef, t.ef); }
        if (t.bs != null) { r.bs = Math.min(r.bs, t.bs); r.bf = Math.max(r.bf, t.bf); }
        if (t.as != null) r.as = Math.min(r.as, t.as);
        if (t.af != null) r.af = Math.max(r.af, t.af);
        const w = t.dur || 0;
        r.dur += w; r.done += w * (t.pct || 0) / 100;
        if (t.crit) r.crit = true;
        if (t.tf != null) r.tf = Math.min(r.tf, t.tf);
        if (t.status !== 'C') r.allC = false;
        r.count++;
        if (t.status === 'NS') r.nNS++; else if (t.status === 'IP') r.nIP++; else r.nC++;
        if (t.crit) r.nCrit++;
        r.rem += t.status === 'C' ? 0 : (t.rem || 0);
        if (t.ls != null && t.status !== 'C') { r.ls = Math.min(r.ls, t.ls); r.lf = Math.max(r.lf, t.lf); }
      }
      for (const k of kids.get(id) || []) {
        const c = calc(k);
        r.es = Math.min(r.es, c.es); r.ef = Math.max(r.ef, c.ef);
        r.bs = Math.min(r.bs, c.bs); r.bf = Math.max(r.bf, c.bf);
        r.as = Math.min(r.as, c.as); r.af = Math.max(r.af, c.af);
        r.dur += c.dur; r.done += c.done; r.crit = r.crit || c.crit; r.count += c.count;
        r.nNS += c.nNS; r.nIP += c.nIP; r.nC += c.nC; r.nCrit += c.nCrit; r.rem += c.rem; r.ls = Math.min(r.ls, c.ls); r.lf = Math.max(r.lf, c.lf);
        r.tf = Math.min(r.tf, c.tf);
        if (!c.allC || !c.count) r.allC = r.allC && c.allC;
      }
      r.pct = r.dur > 0 ? Math.round((r.done / r.dur) * 100) : 0;
      if (!isFinite(r.es)) { r.es = null; r.ef = null; }
      if (!isFinite(r.bs)) { r.bs = null; r.bf = null; }
      if (!isFinite(r.ls)) { r.ls = null; r.lf = null; }
      if (!isFinite(r.tf)) r.tf = null;
      out.set(id, r);
      return r;
    };
    for (const w of p.wbs) if (w.parent == null || !by.has(w.parent)) calc(w.id);
    return out;
  }

  // ---------- predecessor text  ("A1010", "A1020SS+2", "A1030 FF-1") ----------
  const relText = (p, t, withCode) => {
    const byId = new Map(p.tasks.map((x) => [x.id, x]));
    return p.rels
      .filter((r) => r.s === t.id)
      .map((r) => {
        const a = byId.get(r.p);
        if (!a) return '';
        return a.code + (r.type !== 'FS' || r.lag ? r.type : '') + (r.lag ? (r.lag > 0 ? '+' : '') + r.lag : '');
      })
      .filter(Boolean)
      .join(', ');
  };
  function parsePreds(p, text, self) {
    const byCode = new Map(p.tasks.map((x) => [x.code.toLowerCase(), x]));
    const out = [], bad = [];
    for (let tok of String(text || '').split(/[,;\n]+/)) {
      tok = tok.trim();
      if (!tok) continue;
      let a = byCode.get(tok.toLowerCase()), type = 'FS', lag = 0;
      if (!a) {
        const m = /^(.*?)\s*(FS|SS|FF|SF)?\s*([+-]\s*\d+(?:\.\d+)?)?\s*[dD]?$/i.exec(tok);
        if (m) {
          a = byCode.get(m[1].trim().toLowerCase());
          if (m[2]) type = m[2].toUpperCase();
          if (m[3]) lag = parseFloat(m[3].replace(/\s+/g, ''));
        }
      }
      if (!a || a === self) { bad.push(tok); continue; }
      out.push({ p: a.id, type, lag });
    }
    return { rels: out, bad };
  }

  // does adding p->s create a loop?
  function wouldLoop(p, from, to) {
    const adj = new Map();
    for (const r of p.rels) { if (!adj.has(r.p)) adj.set(r.p, []); adj.get(r.p).push(r.s); }
    const st = [to], seen = new Set();
    while (st.length) {
      const x = st.pop();
      if (x === from) return true;
      if (seen.has(x)) continue;
      seen.add(x);
      for (const y of adj.get(x) || []) st.push(y);
    }
    return false;
  }

  Object.assign(P6, {
    MS, MON, toDay, fromDay, dow, ymd, mkDay, fmtDate, parseDate, todayDay,
    WEEKS, newCal, touchCal, isWork, nextWork, prevWork, shift, finishFromStart, startFromFinish, signedWork, durBetween,
    newProject, newTask, nextId, newRsrc, priceAt, snapshotBaseline, assignBaseline, ensureBaselines, autoCode, schedule, rollup, relText, parsePreds, wouldLoop, isMile, isFinMile, isHammock
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = P6;
})(typeof globalThis !== 'undefined' ? globalThis : window);

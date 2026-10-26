/* P6 Web – Dashboard analytics engine (S-curve, SPI, manpower, look-ahead, out-of-sequence, areas of concern, risks).
   Pure functions over a project object: nothing here touches the DOM. */
(function (g) {
  'use strict';
  const P6 = g.P6, DA = (P6.dash = {});
  const frac = (s, e, d) => (s == null || e == null ? 0 : d < s ? 0 : d >= e ? 1 : (d - s + 1) / (e - s + 1));
  const isMs = (t) => P6.isMile(t);
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  DA.fmt = (d) => { if (d == null) return ''; const y = P6.ymd(d); return String(y.d).padStart(2, '0') + '-' + MON[y.m] + '-' + y.y; };
  DA.lbl = (d, gran) => { const y = P6.ymd(d); return gran === 'month' ? MON[y.m] + ' ' + String(y.y).slice(2) : String(y.d).padStart(2, '0') + ' ' + MON[y.m] + ' ' + String(y.y).slice(2); };
  DA.frac = frac;

  // ---------- filtering ----------
  DA.defaults = () => ({ wbs: 'all', status: 'all', crit: false, floatMax: '', type: 'all', rsrc: '', code: '', q: '', basis: 'auto', gran: 'auto', period: 14, ahead: 4, aocRatio: 1.5, aocDays: 5 });
  DA.subset = function (p, f) {
    let wset = null;
    if (f.wbs && f.wbs !== 'all') {
      const id = +f.wbs, kids = new Map(); p.wbs.forEach((w) => { if (w.parent != null) { if (!kids.has(w.parent)) kids.set(w.parent, []); kids.get(w.parent).push(w.id); } });
      wset = new Set(); const st = [id]; while (st.length) { const x = st.pop(); wset.add(x); (kids.get(x) || []).forEach((k) => st.push(k)); }
    }
    let rset = null; if (f.rsrc) { rset = new Set(p.asg.filter((a) => String(a.rsrc) === String(f.rsrc)).map((a) => a.task)); }
    const q = (f.q || '').trim().toLowerCase(), fm = f.floatMax === '' || f.floatMax == null ? null : +f.floatMax;
    const cv = f.code ? String(f.code).split(':') : null;
    return p.tasks.filter((t) => {
      if (P6.isHammock && P6.isHammock(t)) return false;
      if (wset && !wset.has(t.wbs)) return false;
      if (f.status && f.status !== 'all' && t.status !== f.status) return false;
      if (f.crit && !(t.crit && t.status !== 'C')) return false;
      if (fm != null && !(t.tf != null && t.tf <= fm)) return false;
      if (f.type === 'tasks' && isMs(t)) return false;
      if (f.type === 'ms' && !isMs(t)) return false;
      if (rset && !rset.has(t.id)) return false;
      if (cv && !((t.codes || {})[cv[0]] == cv[1])) return false;
      if (q && !(String(t.code).toLowerCase().includes(q) || String(t.name).toLowerCase().includes(q))) return false;
      return true;
    });
  };

  // ---------- weights (progress basis) ----------
  DA.basisOf = (p, f, M) => {
    if (f.basis && f.basis !== 'auto') return f.basis;
    let c = 0, u = 0; for (const m of M.T.values()) { c += m.bc; u += m.bu_L; }
    return c > 0 ? 'cost' : u > 0 ? 'hours' : 'duration';
  };
  DA.weights = (tasks, M, basis) => {
    const W = new Map();
    for (const t of tasks) {
      const m = M.T.get(t.id) || {};
      let w = basis === 'cost' ? (m.blc != null ? m.blc : m.bc) : basis === 'hours' ? (m.bu_L || 0) : Math.max(0, (t.bf != null && t.bs != null ? t.bf - t.bs + 1 : (t.ef != null && t.es != null ? t.ef - t.es + 1 : 0)));
      if (!(w > 0)) w = 0; W.set(t.id, w);
    }
    return W;
  };

  // ---------- buckets ----------
  DA.range = (tasks, dd) => {
    let lo = Infinity, hi = -Infinity;
    for (const t of tasks) for (const d of [t.bs, t.es, t.as]) if (d != null && d < lo) lo = d;
    for (const t of tasks) for (const d of [t.bf, t.ef, t.af]) if (d != null && d > hi) hi = d;
    if (!isFinite(lo)) lo = dd; if (!isFinite(hi)) hi = dd; return [Math.min(lo, dd), Math.max(hi, dd)];
  };
  DA.buckets = (lo, hi, gran) => {
    const out = [];
    if (gran === 'month') { let y = P6.ymd(lo); let d = P6.mkDay(y.y, y.m + 1, 1) - 1; while (d < hi + 30) { out.push(d); y = P6.ymd(d + 1); d = P6.mkDay(y.y, y.m + 1, 1) - 1; if (out.length > 400) break; } }
    else { let d = lo + 6 - ((P6.dow(lo) + 6) % 7); d = Math.max(d, lo); while (d < hi + 7) { out.push(d); d += 7; if (out.length > 900) break; } }
    // trim to the last bucket that covers hi
    const k = out.findIndex((x) => x >= hi); return k >= 0 ? out.slice(0, k + 1) : out;
  };
  DA.granOf = (lo, hi, f) => (f.gran && f.gran !== 'auto' ? f.gran : hi - lo > 540 ? 'month' : 'week');

  // ---------- S-curve / SPI ----------
  DA.curves = function (p, tasks, W, gran) {
    const dd = p.dataDate, [lo, hi] = DA.range(tasks, dd), B = DA.buckets(lo, hi, gran);
    let tot = 0; for (const t of tasks) tot += W.get(t.id) || 0;
    const planned = new Array(B.length).fill(0), actual = new Array(B.length).fill(null), fc = new Array(B.length).fill(null);
    for (const t of tasks) {
      const w = W.get(t.id) || 0; if (!w) continue;
      const bs = t.bs != null ? t.bs : t.es, bf = t.bf != null ? t.bf : t.ef;
      const as = t.as != null ? t.as : t.es, ef = t.af != null ? t.af : t.ef;
      const done = t.status === 'C' ? 1 : t.status === 'IP' ? Math.min(1, (t.pct || 0) / 100) : 0;
      const rs = t.status === 'NS' ? Math.max(dd + 1, t.es != null ? t.es : dd + 1) : dd + 1;
      B.forEach((d, i) => {
        planned[i] += w * frac(bs, bf, d);
        if (d <= dd) actual[i] = (actual[i] || 0) + w * (t.status === 'C' ? frac(as, ef, d) : t.status === 'IP' ? done * frac(as, dd, d) : 0);
        else fc[i] = (fc[i] || 0) + w * (done + (1 - done) * frac(rs, t.ef, d));
      });
    }
    // make forecast continuous with the last actual point
    let ev = 0; for (const t of tasks) { const w = W.get(t.id) || 0; ev += w * (t.status === 'C' ? 1 : t.status === 'IP' ? Math.min(1, (t.pct || 0) / 100) : 0); }
    const k = B.findIndex((d) => d > dd);
    const pct = (v) => (tot > 0 && v != null ? (100 * v) / tot : null);
    const pl = planned.map(pct), ac = actual.map(pct), fo = fc.map(pct);
    const spi = B.map((d, i) => (d <= dd && pl[i] > 0.05 && ac[i] != null ? ac[i] / pl[i] : null));
    // planned % and actual % exactly at the data date
    let pvDD = 0; for (const t of tasks) pvDD += (W.get(t.id) || 0) * frac(t.bs != null ? t.bs : t.es, t.bf != null ? t.bf : t.ef, dd);
    return { B, planned: pl, actual: ac, forecast: fo, spi, tot, evDD: pct(ev), pvDD: pct(pvDD), kDD: k, gran, lo, hi };
  };
  DA.taskSpi = (t, w, dd) => {
    const pv = w * frac(t.bs != null ? t.bs : t.es, t.bf != null ? t.bf : t.ef, dd), ev = w * (t.status === 'C' ? 1 : t.status === 'IP' ? Math.min(1, (t.pct || 0) / 100) : 0);
    return { pv, ev, spi: pv > 0 ? ev / pv : (ev > 0 ? 1.5 : null) };
  };

  // ---------- manpower (labour units) ----------
  DA.manpower = function (p, tasks, gran, M) {
    const dd = p.dataDate, [lo, hi] = DA.range(tasks, dd), B = DA.buckets(lo, hi, gran);
    const ids = new Set(tasks.map((t) => t.id)), tby = new Map(tasks.map((t) => [t.id, t])), rs = new Map(p.rsrc.map((r) => [r.id, r]));
    const per = new Map(); // resource id -> {name, act[], rem[], plan[]}
    const spread = (arr, qty, s, e) => { if (!(qty > 0) || s == null || e == null || e < s) return; const len = e - s + 1; B.forEach((d, i) => { const b0 = i ? B[i - 1] + 1 : -Infinity; const ov = Math.min(e, d) - Math.max(s, b0) + 1; if (ov > 0) arr[i] += qty * ov / len; }); };
    for (const a of p.asg) {
      if (!ids.has(a.task)) continue; const r = rs.get(a.rsrc); if (!r || r.type !== 'RT_Labor') continue; const t = tby.get(a.task);
      if (!per.has(r.id)) per.set(r.id, { id: r.id, name: r.name, act: new Array(B.length).fill(0), rem: new Array(B.length).fill(0), plan: new Array(B.length).fill(0), total: 0 });
      const x = per.get(r.id), sp = P6.asgSplit(a, t);
      spread(x.plan, a.qty, t.bs != null ? t.bs : t.es, t.bf != null ? t.bf : t.ef);
      spread(x.act, sp.act, t.as != null ? t.as : t.es, t.af != null ? t.af : Math.min(dd, t.ef != null ? t.ef : dd));
      spread(x.rem, sp.rem, t.status === 'NS' ? Math.max(dd + 1, t.es != null ? t.es : dd + 1) : dd + 1, t.ef);
      x.total += a.qty;
    }
    const list = [...per.values()].sort((a, b) => b.total - a.total);
    const sum = (k) => B.map((_, i) => list.reduce((s, x) => s + x[k][i], 0));
    return { B, list, act: sum('act'), rem: sum('rem'), plan: sum('plan'), gran };
  };

  // ---------- look-ahead / achieved ----------
  DA.lookahead = (p, tasks, ref, weeks) => {
    const end = ref + weeks * 7 - 1;
    return tasks.filter((t) => t.status !== 'C' && t.es != null && t.es <= end && t.ef >= ref).map((t) => ({
      t, kind: t.status === 'NS' ? (t.es >= ref ? 'Starting' : 'Late start') : (t.ef <= end ? 'Finishing' : 'Ongoing'), start: t.es, finish: t.ef
    })).sort((a, b) => a.start - b.start || a.finish - b.finish);
  };
  DA.achieved = (p, tasks, ref, days) => {
    const from = ref - days + 1;
    return { from, to: ref,
      completed: tasks.filter((t) => t.status === 'C' && t.af != null && t.af >= from && t.af <= ref).sort((a, b) => a.af - b.af),
      started: tasks.filter((t) => t.as != null && t.as >= from && t.as <= ref && t.status !== 'C'),
      progressed: tasks.filter((t) => t.status === 'IP' && (t.pct || 0) > 0) };
  };

  // ---------- out-of-sequence ----------
  // returns every relationship whose logic is violated by recorded progress, with a suggested fix
  DA.oos = function (p, tasks) {
    const byId = new Map(p.tasks.map((t) => [t.id, t])), sub = tasks ? new Set(tasks.map((t) => t.id)) : null, out = [];
    for (const r of p.rels) {
      const a = byId.get(r.p), b = byId.get(r.s); if (!a || !b) continue; if (sub && !sub.has(a.id) && !sub.has(b.id)) continue;
      let issue = '', days = 0;
      if (r.type === 'FS') {
        if (b.as != null && a.status !== 'C') { issue = a.status === 'IP' ? 'Successor started while predecessor still in progress' : 'Successor started but predecessor not started'; days = b.as - (a.as != null ? a.as : p.dataDate); }
        else if (b.as != null && a.af != null && a.af > b.as) { issue = 'Successor started before predecessor finished'; days = a.af - b.as; }
      } else if (r.type === 'SS') {
        if (b.as != null && a.as == null) { issue = 'Successor started but predecessor not started'; days = 0; }
        else if (b.as != null && a.as != null && a.as > b.as) { issue = 'Successor started before predecessor started'; days = a.as - b.as; }
      } else if (r.type === 'FF') {
        if (b.af != null && a.status !== 'C') { issue = 'Successor finished while predecessor not finished'; days = 0; }
        else if (b.af != null && a.af != null && a.af > b.af) { issue = 'Successor finished before predecessor finished'; days = a.af - b.af; }
      } else if (r.type === 'SF') {
        if (b.af != null && a.as == null) { issue = 'Successor finished but predecessor not started'; days = 0; }
      }
      if (issue) {
        const fix = r.type === 'FS' ? (a.status === 'IP' || (a.af != null && a.af > b.as) ? 'ss' : 'remove') : (r.type === 'SS' || r.type === 'FF' ? 'remove' : 'remove');
        out.push({ rel: r, pred: a, succ: b, issue, days: Math.max(0, days), fix: r.type === 'FS' && fix === 'ss' ? 'ss' : (r.type === 'FS' ? 'remove' : 'review') });
      }
    }
    return out;
  };

  // ---------- areas of concern ----------
  DA.aoc = function (p, tasks, f, oos) {
    const dd = p.dataDate, ratio = +f.aocRatio || 1.5, minD = +f.aocDays || 5, rows = [];
    const rels = p.rels, preds = new Map(), succs = new Map();
    rels.forEach((r) => { preds.set(r.s, (preds.get(r.s) || 0) + 1); succs.set(r.p, (succs.get(r.p) || 0) + 1); });
    const add = (rule, sev, t, metric, detail, action) => rows.push({ rule, sev, t, metric, detail, action });
    const plannedCal = (t) => (t.bs != null && t.bf != null ? t.bf - t.bs + 1 : Math.max(1, Math.round((t.dur || 1) * 7 / 5)));
    for (const t of tasks) {
      if (isMs(t)) { if (t.status !== 'C' && t.tf != null && t.tf < 0) add('Negative Float', 4, t, `${t.tf} d`, 'Milestone forecast beyond its constraint / target date', 'Review the driving path and recover time'); continue; }
      const pc = plannedCal(t);
      if (t.status === 'C' && t.as != null && t.af != null) {
        const ac = t.af - t.as + 1;
        if (ac / pc >= ratio && ac - pc >= minD) add('Duration Overrun (Completed)', ac / pc >= 3 ? 5 : ac / pc >= 2 ? 4 : 3, t, `${ac} d actual vs ${pc} d planned (${(ac / pc).toFixed(1)}x)`, `Took ${ac - pc} d longer than planned`, 'Re-baseline similar activities; record lessons learned');
      } else if (t.status === 'IP' && t.as != null) {
        const el = dd - t.as + 1;
        if (el / pc >= ratio && el - pc >= minD && (t.pct || 0) < 100) add('Overrunning In-Progress', el / pc >= 3 ? 5 : el / pc >= 2 ? 4 : 3, t, `${el} d elapsed vs ${pc} d planned, ${t.pct || 0}% done`, `Open for ${el - pc} d beyond its planned duration`, 'Confirm remaining duration and resources; escalate if stalled');
      }
      if (t.status === 'NS' && t.bs != null && t.bs < dd && dd - t.bs >= minD) { const dl = dd - t.bs; add('Late Start', dl > 30 ? 5 : dl > 14 ? 4 : 3, t, `${dl} d late (baseline start ${DA.fmt(t.bs)})`, 'Not started although its baseline start has passed', 'Mobilise or re-sequence; confirm predecessors and access'); }
      if (t.status !== 'C' && t.bf != null && t.bf < dd && t.status !== 'NS') { const dl = dd - t.bf; if (dl >= minD) add('Late Finish (Open)', dl > 30 ? 5 : dl > 14 ? 4 : 3, t, `${dl} d past baseline finish`, `Baseline finish ${DA.fmt(t.bf)} has passed`, 'Recovery plan / resource loading review'); }
      if (t.status !== 'C' && t.tf != null && t.tf < 0) add('Negative Float', t.tf <= -30 ? 5 : t.tf <= -10 ? 4 : 3, t, `${t.tf} d float`, 'Forecast later than the constraint or contract date', 'Compress or re-sequence the driving path');
      if (t.ct === 'MSO' || t.ct === 'MFO') add('Hard Constraint', t.crit ? 4 : 2, t, t.ct, 'Mandatory constraint overrides network logic', 'Replace with logic or soft constraint where possible');
      if ((t.dur || 0) > 60 && t.type !== 'TT_LOE' && t.type !== 'TT_WBS') add('Excessive Duration', 2, t, `${t.dur} d`, 'Activity longer than 60 days cannot be tracked precisely', 'Split into shorter, measurable activities');
      if (t.type !== 'TT_LOE' && t.status !== 'C' && (!preds.get(t.id) || !succs.get(t.id))) add('Open End', 2, t, !preds.get(t.id) ? 'No predecessor' : 'No successor', 'Logic gap: float will be overstated', 'Add the missing predecessor / successor');
    }
    const ids = new Set(tasks.map((t) => t.id)), by = new Map(p.tasks.map((t) => [t.id, t]));
    for (const r of rels) if (r.lag > 30 && (ids.has(r.p) || ids.has(r.s))) { const s = by.get(r.s); if (s) add('Long Lag', 2, s, `${r.type} +${r.lag} d`, `Lag from ${(by.get(r.p) || {}).code}`, 'Replace the lag with an explicit activity'); }
    for (const o of oos || []) add('Out-of-Sequence', o.days > 14 ? 4 : 3, o.succ, `${o.rel.type} from ${o.pred.code}`, o.issue, 'Fix the logic (Dashboard ▸ Out-of-Sequence)');
    return rows.sort((a, b) => b.sev - a.sev);
  };

  // ---------- risk register (project risks + auto-detected schedule risks) ----------
  DA.rating = (s) => (s >= 17 ? 'Extreme' : s >= 10 ? 'High' : s >= 5 ? 'Medium' : 'Low');
  DA.risks = function (p, tasks, k, aocRows, oos, mp) {
    const out = [], dd = p.dataDate; let n = 0; const id = () => 'AR-' + String(++n).padStart(2, '0');
    const add = (cat, name, pr, im, items, action, detail) => out.push({ id: id(), src: 'Auto-detected', cat, name, pr, im, score: pr * im, rating: DA.rating(pr * im), items, action, detail });
    const open = tasks.filter((t) => t.status !== 'C');
    const neg = open.filter((t) => t.tf != null && t.tf < 0);
    if (neg.length) { const m = Math.min(...neg.map((t) => t.tf)); add('Schedule', 'Forecast completion later than the contractual / constraint date', m <= -30 ? 5 : 4, m <= -30 ? 5 : 4, neg, 'Recovery programme: fast-track or crash the driving path', `Worst negative float ${m} days across ${neg.length} activities`); }
    if (k.spi != null && k.spi < 0.9) add('Progress', `Schedule performance below plan (SPI ${k.spi.toFixed(2)})`, k.spi < 0.75 ? 5 : 4, 4, tasks.filter((t) => { const x = k.taskSpi.get(t.id); return x && x.spi != null && x.spi < 0.9 && x.pv > 0; }), 'Increase resources / working hours on lagging work packages', `Earned ${k.ev.toFixed(1)}% vs planned ${k.pv.toFixed(1)}%`);
    if (oos.length) add('Schedule Quality', 'Progress recorded out of sequence: network logic and float are unreliable', 4, 3, oos.map((o) => o.succ), 'Correct logic (use Dashboard ▸ Out-of-Sequence auto-fix)', `${oos.length} relationships violated`);
    const late = aocRows.filter((r) => r.rule === 'Late Start').map((r) => r.t); if (late.length) add('Progress', 'Activities not started although baseline start has passed', late.length > 10 ? 5 : 4, 3, late, 'Confirm mobilisation, access and approvals', `${late.length} late starts`);
    const ov = aocRows.filter((r) => r.rule === 'Duration Overrun (Completed)').map((r) => r.t); if (ov.length) add('Planning', 'Actual durations are repeatedly longer than planned', ov.length > 10 ? 4 : 3, 3, ov, 'Revisit productivity assumptions for the remaining similar scope', `${ov.length} completed activities over-ran`);
    const stalled = aocRows.filter((r) => r.rule === 'Overrunning In-Progress').map((r) => r.t); if (stalled.length) add('Progress', 'In-progress activities are open far beyond their planned duration', 3, 4, stalled, 'Verify true remaining durations; check for stalled work', `${stalled.length} activities`);
    const crit = open.filter((t) => t.crit); if (open.length && crit.length / open.length > 0.3) add('Schedule', 'More than 30% of remaining activities are critical – little schedule flexibility', 4, 4, crit, 'Add logic review; look for parallel paths and buffers', `${crit.length} of ${open.length} remaining activities are critical`);
    const hard = open.filter((t) => (t.ct === 'MSO' || t.ct === 'MFO')); if (hard.length) add('Schedule Quality', 'Mandatory constraints override network logic', 3, 4, hard, 'Replace with logic or soft constraints', `${hard.length} activities`);
    const lead = open.filter((t) => /procure|manufactur|deliver|supply|long.?lead|shipping/i.test(t.name) && (t.tf == null || t.tf < 30)); if (lead.length) add('Procurement', 'Procurement / long-lead items with little or no float', 3, 4, lead, 'Expedite orders; confirm vendor delivery dates', `${lead.length} items with float < 30 d`);
    const open2 = tasks.filter((t) => t.status !== 'C' && !isMs(t)); if (mp && mp.avg > 0 && mp.peak / mp.avg > 2) add('Resources', `Labour peaking: peak ${Math.round(mp.peak)} h per period vs average ${Math.round(mp.avg)} h`, 3, 3, open2, 'Level resources / smooth the histogram', 'Peak-to-average ratio ' + (mp.peak / mp.avg).toFixed(1));
    const oe = aocRows.filter((r) => r.rule === 'Open End').map((r) => r.t); if (oe.length > 5) add('Schedule Quality', 'Open-ended activities overstate float', 3, 3, oe, 'Complete network logic', `${oe.length} open ends`);
    for (const t of p.tasks) for (const r of t.risks || []) out.push({ id: 'RR-' + r.id, src: 'Risk Register', cat: 'Register', name: r.name, pr: +r.prob || 1, im: +r.impact || 1, score: (+r.prob || 1) * (+r.impact || 1), rating: DA.rating((+r.prob || 1) * (+r.impact || 1)), items: [t], action: r.notes || '', detail: `Status: ${r.status || 'Open'}` });
    return out.sort((a, b) => b.score - a.score);
  };

  // ---------- one call for everything ----------
  DA.analyse = function (p, f) {
    const tasks = DA.subset(p, f), M = P6.metrics(p), basis = DA.basisOf(p, f, M), W = DA.weights(tasks, M, basis);
    const [lo, hi] = DA.range(tasks, p.dataDate), gran = DA.granOf(lo, hi, f), cur = DA.curves(p, tasks, W, gran), mp = DA.manpower(p, tasks, gran, M);
    const taskSpi = new Map(); let ev = 0, pv = 0, tot = 0;
    for (const t of tasks) { const w = W.get(t.id) || 0, x = DA.taskSpi(t, w, p.dataDate); taskSpi.set(t.id, x); ev += x.ev; pv += x.pv; tot += w; }
    const k = { ev: tot ? 100 * ev / tot : 0, pv: tot ? 100 * pv / tot : 0, spi: pv > 0 ? ev / pv : null, tot, taskSpi };
    const oos = DA.oos(p, tasks), aoc = DA.aoc(p, tasks, f, oos);
    const mpt = mp.plan.map((_, i) => mp.act[i] + mp.rem[i]); const nz = mpt.filter((x) => x > 0);
    const mpStat = { peak: nz.length ? Math.max(...mpt) : 0, avg: nz.length ? nz.reduce((a, b) => a + b, 0) / nz.length : 0 };
    const risks = DA.risks(p, tasks, k, aoc, oos, mpStat);
    return { tasks, M, W, basis, cur, mp, mpStat, k, oos, aoc, risks, gran };
  };
})(window);

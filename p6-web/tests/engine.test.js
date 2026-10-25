const assert = require('assert');
const P6 = require('../js/core.js'); require('../js/io.js');
const D = (s) => P6.toDay(s), F = (d) => P6.fromDay(d);
function mk(week) {
  const p = P6.newProject('T', { planStart: D('2026-01-05'), week: week || P6.WEEKS.monFri });
  const add = (code, dur, extra) => { const t = P6.newTask(p, 1, Object.assign({ code, dur, rem: dur }, extra)); p.tasks.push(t); return t; };
  const link = (a, b, type = 'FS', lag = 0) => p.rels.push({ id: P6.nextId(p), p: a.id, s: b.id, type, lag });
  return { p, add, link };
}
{ // basic CPM
  const { p, add, link } = mk();
  const A = add('A', 5), B = add('B', 3), C = add('C', 4), Dd = add('D', 2);
  link(A, B); link(A, C); link(B, Dd); link(C, Dd);
  P6.schedule(p);
  assert.equal(F(A.es), '2026-01-05'); assert.equal(F(A.ef), '2026-01-09');
  assert.equal(F(B.es), '2026-01-12'); assert.equal(F(B.ef), '2026-01-14');
  assert.equal(F(C.ef), '2026-01-15');
  assert.equal(F(Dd.es), '2026-01-16'); assert.equal(F(Dd.ef), '2026-01-19');
  assert.deepEqual([A, B, C, Dd].map((t) => t.tf), [0, 1, 0, 0]);
  assert.deepEqual([A, B, C, Dd].map((t) => t.crit), [true, false, true, true]);
  assert.equal(B.ff, 1);
}
{ // SS+lag, FF, milestones
  const { p, add, link } = mk();
  const A = add('A', 10), B = add('B', 4), M = add('M', 0, { type: 'TT_FinMile' }), S = add('S', 0, { type: 'TT_Mile' });
  link(S, A); link(A, B, 'SS', 2); link(B, M, 'FS');
  P6.schedule(p);
  assert.equal(F(S.es), '2026-01-05'); assert.equal(F(A.es), '2026-01-05');
  assert.equal(F(B.es), '2026-01-07');
  assert.equal(F(B.ef), '2026-01-12');
  assert.equal(F(M.ef), '2026-01-12');
  assert.equal(B.tf, 4);
}
{ // data date progress
  const { p, add, link } = mk();
  const A = add('A', 5), B = add('B', 5);
  link(A, B);
  A.status = 'C'; A.as = D('2026-01-05'); A.af = D('2026-01-12');
  p.dataDate = D('2026-01-14');
  P6.schedule(p);
  assert.equal(F(B.es), '2026-01-14'); assert.equal(F(B.ef), '2026-01-20');
  B.status = 'IP'; B.as = D('2026-01-14'); B.rem = 2; p.dataDate = D('2026-01-16');
  P6.schedule(p);
  assert.equal(F(B.rs), '2026-01-16'); assert.equal(F(B.ef), '2026-01-19'); assert.equal(B.pct, 60);
  B.status = 'NS'; B.as = null; B.rem = 5; B.ct = 'SNET'; B.cd = D('2026-02-02'); p.dataDate = D('2026-01-05');
  P6.schedule(p);
  assert.equal(F(B.es), '2026-02-02');
}
{ // sun-thu calendar, holiday
  const { p, add } = mk(P6.WEEKS.sunThu);
  p.planStart = p.dataDate = D('2026-01-08');
  const A = add('A', 3);
  p.cals[0].exc[D('2026-01-12')] = false;
  P6.schedule(p);
  assert.equal(F(A.ef), '2026-01-13');
}
{ // loops reported
  const { p, add, link } = mk();
  const A = add('A', 2), B = add('B', 2); link(A, B); link(B, A);
  P6.schedule(p); assert.ok(p.loops.length >= 1);
}
{ // predecessor text
  const { p, add } = mk();
  add('A1', 2); add('A2', 2); const C = add('A3', 2);
  const r = P6.parsePreds(p, 'A1, A2SS+1, A3 FF-2, zzz', C);
  assert.equal(r.rels.length, 2); assert.deepEqual(r.bad, ['A3 FF-2', 'zzz']);
  assert.equal(r.rels[1].type, 'SS'); assert.equal(r.rels[1].lag, 1);
}
{ // XER round trip
  const { p, add, link } = mk();
  const A = add('A1000', 5), B = add('A1010', 3);
  link(A, B, 'FS', 1);
  P6.schedule(p); A.bs = A.es; A.bf = A.ef;
  p.cals[0].exc[D('2026-02-01')] = false; p.cals[0].mod = true;
  const x = P6.parseXER(P6.toXER(p));
  assert.equal(x.tables.TASK.rows.length, 2);
  const q = P6.fromXER(x, '1');
  assert.equal(q.tasks.length, 2); assert.equal(q.rels.length, 1);
  assert.equal(q.rels[0].lag, 1); assert.equal(q.tasks[0].dur, 5);
  assert.equal(q.cals[0].exc[D('2026-02-01')], false);
  assert.deepEqual(q.cals[0].work, P6.WEEKS.monFri);
  P6.schedule(q);
  assert.equal(F(q.tasks[1].ef), F(B.ef));
}
{ // CSV
  const { p } = mk();
  const rows = P6.parseDelimited('Activity ID,Activity Name,Duration,Predecessors\nX1,"Dig, deep",5,\nX2,Pour,3,X1\n');
  const r = P6.importRows(p, rows, 1);
  assert.equal(r.added, 2); assert.equal(r.rels, 1);
  P6.schedule(p);
  assert.equal(F(p.tasks[1].es), '2026-01-12');
}
console.log('engine tests passed');

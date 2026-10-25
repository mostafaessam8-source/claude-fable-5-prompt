/* P6 Web – built-in sample project (railway station building) with baseline and progress. */
(function (g) {
  'use strict';
  const P6 = g.P6;
  P6.sampleProject = function () {
    const p = P6.newProject('Station Building – Sample', { planStart: P6.toDay('2026-03-01'), week: P6.WEEKS.sunThu });
    p.desc = 'Sample project: station building';
    p.wbs = [{ id: 1, parent: null, code: 'STN', name: 'Station Building – Sample', seq: 0 }];
    const W = {};
    const addW = (key, parentKey, code, name) => { const w = { id: P6.nextId(p), parent: parentKey ? W[parentKey] : 1, code, name, seq: p.wbs.length }; W[key] = w.id; p.wbs.push(w); };
    addW('pre', null, 'STN.1', 'Pre-construction');
    addW('civ', null, 'STN.2', 'Civil Works');
    addW('found', 'civ', 'STN.2.1', 'Substructure');
    addW('struct', 'civ', 'STN.2.2', 'Superstructure');
    addW('mep', null, 'STN.3', 'MEP Works');
    addW('fin', null, 'STN.4', 'Finishes');
    addW('ho', null, 'STN.5', 'Testing & Handover');
    // [wbs, code, name, dur, preds, type]
    const A = [
      ['pre', 'A1000', 'Notice to Proceed', 0, '', 'TT_Mile'],
      ['pre', 'A1010', 'Mobilization & site setup', 10, 'A1000'],
      ['pre', 'A1020', 'Shop drawings approval', 20, 'A1000'],
      ['pre', 'A1030', 'Procurement – reinforcement steel', 25, 'A1020'],
      ['pre', 'A1040', 'Procurement – MEP long-lead items', 60, 'A1020'],
      ['found', 'A2000', 'Site clearing & survey', 5, 'A1010'],
      ['found', 'A2010', 'Excavation', 12, 'A2000'],
      ['found', 'A2020', 'Blinding concrete', 4, 'A2010'],
      ['found', 'A2030', 'Footing reinforcement', 10, 'A2020, A1030'],
      ['found', 'A2040', 'Footing formwork', 8, 'A2020FS'],
      ['found', 'A2050', 'Pour footings', 6, 'A2030, A2040'],
      ['found', 'A2060', 'Curing & strip footings', 7, 'A2050'],
      ['found', 'A2070', 'Backfilling & compaction', 8, 'A2060'],
      ['struct', 'A3000', 'Columns – ground floor', 15, 'A2070'],
      ['struct', 'A3010', 'Slab – first floor', 18, 'A3000'],
      ['struct', 'A3020', 'Columns – first floor', 12, 'A3010'],
      ['struct', 'A3030', 'Roof slab', 18, 'A3020'],
      ['struct', 'A3040', 'Structural steel – canopy', 20, 'A3010SS+10'],
      ['struct', 'A3050', 'Structure complete', 0, 'A3030, A3040', 'TT_FinMile'],
      ['mep', 'A4000', 'MEP first-fix – ground floor', 20, 'A3010, A1040'],
      ['mep', 'A4010', 'MEP first-fix – first floor', 20, 'A3030FS-5, A4000SS+5'],
      ['mep', 'A4020', 'HVAC equipment installation', 15, 'A3030, A1040'],
      ['mep', 'A4030', 'Electrical panels & cabling', 25, 'A4010'],
      ['mep', 'A4040', 'Fire fighting system', 18, 'A4010'],
      ['mep', 'A4050', 'Low-current & signage systems', 14, 'A4030FS-5'],
      ['fin', 'A5000', 'Masonry & blockwork', 30, 'A3020'],
      ['fin', 'A5010', 'Plastering', 24, 'A5000, A4000'],
      ['fin', 'A5020', 'Waterproofing – roof', 8, 'A3030'],
      ['fin', 'A5030', 'Floor tiling & stone', 24, 'A5010'],
      ['fin', 'A5040', 'False ceiling', 14, 'A4010, A5010'],
      ['fin', 'A5050', 'Painting', 18, 'A5040, A5030SS+8'],
      ['fin', 'A5060', 'Doors, windows & glazing', 16, 'A5010'],
      ['fin', 'A5070', 'External works & landscaping', 20, 'A5020, A4040'],
      ['ho', 'A6000', 'Testing & commissioning', 15, 'A4030, A4040, A4020, A5050'],
      ['ho', 'A6010', 'Snagging & punch list', 10, 'A6000, A5060, A5070'],
      ['ho', 'A6020', 'As-built drawings & O&M manuals', 15, 'A5050'],
      ['ho', 'A6030', 'Final inspection & handover', 5, 'A6010, A6020, A4050'],
      ['ho', 'A6040', 'Project Complete', 0, 'A6030', 'TT_FinMile']
    ];
    A.forEach((a, i) => {
      const t = P6.newTask(p, W[a[0]], { code: a[1], name: a[2], dur: a[3], rem: a[3], type: a[5] || 'TT_Task', seq: i });
      p.tasks.push(t);
    });
    for (const a of A) {
      const t = p.tasks.find((x) => x.code === a[1]);
      for (const r of P6.parsePreds(p, a[4].replace('A2020FS', 'A2020'), t).rels) p.rels.push({ id: P6.nextId(p), p: r.p, s: t.id, type: r.type, lag: r.lag });
    }
    const R = {};
    [['FRM', 'Foreman', 'Site Foreman'], ['MSN', 'Mason', 'Mason'], ['HLP', 'Helper', 'Laborer'], ['ELC', 'Electrician', 'Electrician'], ['ENG', 'Site Engineer', 'Engineer'], ['EXC', 'Excavator', 'Equipment']].forEach(([s, n, r], i) => { const o = { id: P6.nextId(p), name: n, short: s, role: r, units: 8, type: i === 5 ? 'RT_Equip' : 'RT_Labor' }; R[s] = o.id; p.rsrc.push(o); });
    const assign = (code, ...rs) => { const tk = p.tasks.find((x) => x.code === code); if (tk) rs.forEach((s) => p.asg.push({ id: P6.nextId(p), task: tk.id, rsrc: R[s], qty: Math.max(1, tk.dur) * 8 })); };
    ['A2000', 'A2010', 'A2070'].forEach((c) => assign(c, 'EXC', 'HLP')); ['A2020', 'A2030', 'A2040', 'A2050', 'A2060'].forEach((c) => assign(c, 'MSN', 'HLP'));
    ['A3000', 'A3010', 'A3020', 'A3030', 'A3040'].forEach((c) => assign(c, 'MSN', 'FRM')); ['A4000', 'A4010', 'A4030', 'A4040', 'A4050'].forEach((c) => assign(c, 'ELC', 'HLP'));
    ['A5000', 'A5010', 'A5030', 'A5050'].forEach((c) => assign(c, 'MSN', 'HLP')); ['A1010', 'A6000', 'A6010', 'A6030'].forEach((c) => assign(c, 'ENG'));
    P6.schedule(p);
    for (const t of p.tasks) { t.bs = t.es; t.bf = t.ef; t.bdur = t.dur; }
    // progress up to the data date
    const done = ['A1000', 'A1010', 'A1020', 'A1030', 'A2000', 'A2010', 'A2020', 'A2040', 'A2030'];
    const code = (c) => p.tasks.find((t) => t.code === c);
    p.dataDate = P6.toDay('2026-05-14');
    for (const c of done) { const t = code(c); t.status = 'C'; t.as = t.es + (c === 'A1020' ? 3 : 0); t.af = t.ef + (c === 'A1020' ? 6 : c === 'A2010' ? 4 : 5); t.rem = 0; t.pct = 100; }
    code('A1000').as = code('A1000').af = p.planStart;
    code('A1040').status = 'IP'; code('A1040').as = P6.toDay('2026-04-02'); code('A1040').rem = 25;
    code('A2050').status = 'IP'; code('A2050').as = P6.toDay('2026-05-10'); code('A2050').rem = 3;
    P6.schedule(p);
    p.imported = false;
    return p;
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = P6;
})(typeof globalThis !== 'undefined' ? globalThis : window);

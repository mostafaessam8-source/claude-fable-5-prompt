/* Slides 9-10: Assumptions & weightages (editable) and the scenario summary */
(function (G) {
  const Z = G.Z, F = Z.F, dt = Z.dt, A = Z.app;

  A.changes.asm = (el) => {
    const key = el.dataset.k;
    if (key.startsWith('adv.') || key.startsWith('ms.')) {
      const lim = { 'adv.pct': [0, 100], 'adv.from': [1, 60], 'ms.g1': [0, 730], 'ms.g2': [0, 730] }[key] || [0, 100];
      const val = Math.round(Math.max(lim[0], Math.min(lim[1], parseFloat(el.value))));
      if (!isFinite(val)) { A.refilter(); return; }
      const st2 = Z.cloneState(A.s.st); const [g, f] = key.split('.'); st2[g][f] = val; A.setState(st2); return;
    }
    const v = Math.max(0, Math.min(100, parseFloat(el.value)));
    if (!isFinite(v)) { A.refilter(); return; }
    const st = Z.cloneState(A.s.st), path = el.dataset.k.split('.');
    if (path[0] === 'proc') st.A.proc[+path[1]] = v; else st.A[path[0]][path[1]] = v;
    A.setState(st);
  };
  A.actions.asmReset = () => { const st = Z.cloneState(A.s.st); st.A = Z.cloneA(Z.DEFAULT_A); st.adv = { ...Z.DEFAULT_ADV }; st.ms = { ...Z.DEFAULT_MS }; A.setState(st); };

  const inp = (k, v, max) => `<input class="ninput" type="number" min="0" max="${max || 100}" step="1" value="${+(+v).toFixed(2)}" data-chg="asm" data-k="${k}">`;
  const sumChip = (s) => (Math.abs(s - 100) < 0.001 ? '<span class="pill ok">= 100%</span>' : `<span class="pill warn">sums to ${+s.toFixed(2)}%</span>`);

  Z.registerSlide({
    id: 'assump', title: 'Assumptions & weightages', desc: 'Editable cost weightages & schedule gates',
    render(M) {
      const a = M.st.A, by = M.by;
      const disc = Object.entries(Z.DISC).map(([k, d]) => {
        const c = 100 - a.disc[k];
        return `<tr><td><b>${d.name}</b></td><td>${inp('disc.' + k, a.disc[k])} %</td><td class="num"><b>${+c.toFixed(2)}%</b> ${c <= a.disc[k] ? '<span class="pill warn">materials ≥ construction</span>' : ''}</td><td class="muted" style="max-width:300px;overflow:hidden;text-overflow:ellipsis;font-size:12px" title="${F.esc(d.applies)}">${d.applies}</td></tr>`;
      }).join('');
      const ps = a.proc.reduce((x, y) => x + y, 0), dsum = a.stage.concept + a.stage.prelim + a.stage.detail, ss = a.sub.sub + a.sub.appr;
      const dur = (c1, c2) => F.months((by[c2].e - by[c1].s + 1) / 30.4375);
      const procRows = [['Vendor Prequalification', 0], ['PO Issuance', 1], ['Manufacture and Delivery to Site', 2]].map(([n, i]) => `<tr><td>${n}</td><td>${inp('proc.' + i, a.proc[i])} %</td></tr>`).join('');
      const stRows = [['Concept Design', 'concept', '2.1', '2.2'], ['Preliminary Design', 'prelim', '2.3', '2.4'], ['Detailed Design', 'detail', '2.5', '2.6']].map(([n, k, c1, c2]) => `<tr><td>${n}<div class="hint">${dur(c1, c2)} months</div></td><td>${inp('stage.' + k, a.stage[k])} %</td><td class="num">${F.pct(a.stage[k] / (dsum || 1), 2)}</td></tr>`).join('');
      const p1a1 = M.acts.filter((x) => x.kind === 'a1' && x.phase === 'Phase 1'), p2a1 = M.acts.filter((x) => x.kind === 'a1' && x.phase === 'Phase 2');
      const lag = p1a1.length ? Math.min(...p1a1.map((x) => x.s)) - by['2.4'].e : 0;
      const gates = [
        ['Access permits (request submission & approval)', `${dt.fmtShort(by['1.2'].s)} → ${dt.fmtShort(by['1.2'].e)}`, '1.2'],
        ['Concept design – submission / approval', `${dt.fmtShort(by['2.1'].s)} / ${dt.fmtShort(by['2.2'].e)}`, '2.1'],
        ['Work permit approval (14 days)', `${dt.fmtShort(by['1.3'].s)} → ${dt.fmtShort(by['1.3'].e)}`, '1.3'],
        ['Work permit predecessor', 'FS: Detailed Design Approval (2.6) – ends ' + dt.fmtShort(by['2.6'].e), '2.6'],
        ['Construction commencement', 'Later of Work Permit OR own Manufacture & Delivery', null],
        ['Phase 1 procurement lag after Preliminary Design approval', `${lag} day${lag === 1 ? '' : 's'} (Excel: 15 days → next month)`, '2.4'],
        ['Phase 2 procurement gate', 'After Detailed Design approval · from ' + (p2a1.length ? dt.fmtShort(Math.min(...p2a1.map((x) => x.s))) : '–'), '2.6'],
        ['Long-lead threshold', '4+ months lead time · Signalling, Track, Turnout, Substation, Generator', null],
        ['Total project duration', `${F.months(M.durMonths)} months (${dt.fmtShort(M.start)} → ${dt.fmtShort(M.finish)}) · baseline 26`, null],
      ];
      const proc = M.acts.filter((x) => x.epc === 'PROC').reduce((s, x) => s + x.amount, 0), cons = M.acts.filter((x) => x.epc === 'CONS').reduce((s, x) => s + x.amount, 0);
      const eng = M.acts.filter((x) => x.epc === 'ENG').reduce((s, x) => s + x.amount, 0), gen = by['1.1'].amount + by['1.2'].amount + by['1.3'].amount;
      const parts = [['General', gen, 'var(--gen)'], ['Engineering', eng, 'var(--eng)'], ['Procurement', proc, 'var(--proc)'], ['Construction', cons, 'var(--cons)']];
      return A.head('4', 'Assumptions &amp; weightages', 'Edit any weightage – amounts, cash flow and S-curve recalculate; the total contract value stays fixed', 'Sheet 4 · Assumptions &amp; Weightages') +
        `<div class="s-body"><div class="row grow">
          <div class="col grow" style="gap:14px">
            <div class="panel"><div class="ph"><h3>1 · Discipline materials / construction split</h3><span class="sub">construction is always the higher share</span></div><div class="pb" style="padding-top:0"><table class="tbl tight"><thead><tr><th>Discipline</th><th>Materials</th><th class="num">Construction</th><th>Applies to</th></tr></thead><tbody>${disc}</tbody></table></div></div>
            <div class="row" style="gap:14px">
              <div class="panel" style="width:320px"><div class="ph"><h3>2 · Procurement stages</h3>${sumChip(ps)}</div><div class="pb" style="padding-top:0"><table class="tbl"><thead><tr><th>Stage</th><th>Weight</th></tr></thead><tbody>${procRows}</tbody></table><div class="hint" style="margin-top:6px">Within each item’s procurement share.</div></div></div>
              <div class="panel grow"><div class="ph"><h3>3 · Design stages</h3>${sumChip(dsum)}</div><div class="pb" style="padding-top:0"><table class="tbl"><thead><tr><th>Stage</th><th>Raw</th><th class="num">Normalised</th></tr></thead><tbody>${stRows}</tbody></table><div class="hint" style="margin-top:6px">Raw weights sum to 105% – normalised so design stays SAR ${F.n0(Z.DESIGN_TOTAL)}.</div></div></div>
              <div class="panel" style="width:230px"><div class="ph"><h3>4 · Sub-activity</h3></div><div class="pb" style="padding-top:0"><table class="tbl"><thead><tr><th>Sub-activity</th><th>Weight</th></tr></thead><tbody><tr><td>Submission</td><td>${inp('sub.sub', a.sub.sub)} %</td></tr><tr><td>Approval</td><td>${inp('sub.appr', a.sub.appr)} %</td></tr></tbody></table><div style="margin-top:6px">${sumChip(ss)}</div></div></div>
            </div>
            <div class="panel"><div class="ph"><h3>6 · Advance payment &amp; funding milestones</h3><span class="sub">taken from the total contract value</span></div><div class="pb" style="padding-top:0"><table class="tbl tight"><thead><tr><th>Item</th><th>Value</th><th>Result</th></tr></thead><tbody>
              <tr><td>Advance payment (received at NTP)</td><td>${inp('adv.pct', M.pay.pct)} % of contract</td><td><b>${F.sar(M.pay.amount)}</b></td></tr>
              <tr><td>Recovery starts in month (equal monthly deductions to the last month)</td><td>${inp('adv.from', M.pay.from, 60)} month</td><td><b>${F.sar(M.pay.perMonth)}</b> × ${M.pay.months} months</td></tr>
              <tr><td>Phase 1 amount granted – before NTP</td><td>${inp('ms.g1', M.st.ms.g1, 730)} days</td><td><b>${dt.fmt(M.start - M.st.ms.g1)}</b></td></tr>
              <tr><td>Phase 2 amount granted – before the Phase 2 start</td><td>${inp('ms.g2', M.st.ms.g2, 730)} days</td><td><b>${dt.fmt(Z.phase2(M).start - M.st.ms.g2)}</b></td></tr></tbody></table></div></div>
            <div class="row" style="align-items:center;gap:12px"><button class="btn" data-do="asmReset">Reset weightages to Excel values</button><span class="hint">Changes are saved in this browser and included in the share link.</span></div>
          </div>
          <div class="col" style="width:560px;gap:14px">
            <div class="panel grow" style="min-height:0"><div class="ph"><h3>5 · Schedule gates &amp; key assumptions</h3><span class="sub">live values</span></div><div class="pb scroll" style="padding-top:0"><table class="tbl tight"><thead><tr><th>Rule</th><th>Value now</th></tr></thead><tbody>${gates.map((g) => `<tr class="${g[2] ? 'act' : ''}" ${g[2] ? `data-act="${g[2]}"` : ''}><td class="wrap" style="width:230px">${g[0]}</td><td class="wrap"><b>${g[1]}</b></td></tr>`).join('')}</tbody></table></div></div>
            <div class="panel"><div class="ph"><h3>Impact on cost mix</h3><span class="sub">total stays SAR ${F.n0(M.total)}</span></div><div class="pb">
              <div style="display:flex;height:26px;border-radius:7px;overflow:hidden">${parts.map((p) => `<div style="width:${(p[1] / M.total) * 100}%;background:${p[2]}" data-tip="${F.tip(p[0], [['', 'Amount', F.sar(p[1])], ['', 'Share', F.pct(p[1] / M.total)]])}"></div>`).join('')}</div>
              <table class="tbl tight" style="margin-top:10px"><thead><tr><th>Discipline</th><th class="num">Materials</th><th class="num">Construction</th></tr></thead><tbody>${Object.entries(Z.DISC).map(([k, d]) => { const its = Z.ITEMS.filter((i) => i.disc === k).map((i) => i.key); const mt = M.acts.filter((x) => its.includes(x.item) && x.kind !== 'b').reduce((s, x) => s + x.amount, 0), cs = M.acts.filter((x) => its.includes(x.item) && x.kind === 'b').reduce((s, x) => s + x.amount, 0); return `<tr><td>${d.name}</td><td class="num">${F.M(mt)}</td><td class="num">${F.M(cs)}</td></tr>`; }).join('')}</tbody></table>
              <div class="legend" style="margin-top:8px">${parts.map((p) => `<span><i class="dot" style="background:${p[2]}"></i>${p[0]} <b style="color:var(--accent)">${F.pct(p[1] / M.total)}</b></span>`).join('')}</div></div></div>
          </div></div></div>`;
    },
  });

  /* ------------------------------------------------------- scenario */
  const csv = (M) => {
    const hdr = ['WBS', 'Activity', 'Phase', 'EPC', 'Amount_SAR', 'Start', 'Finish', 'Duration_days', 'Baseline_start', 'Baseline_finish', 'Start_shift_days', 'Finish_shift_days'];
    for (let k = 0; k < M.N; k++) hdr.push('M' + (k + 1) + ' ' + dt.fmtMY(M.bs[k]));
    const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
    const rows = M.acts.map((a) => [a.code, q(a.desc), a.phase, a.epc, Math.round(a.amount * 100) / 100, dt.iso(a.s), dt.iso(a.e), a.dur, dt.iso(a.bs), dt.iso(a.be), a.ds, a.de, ...a.m.map((v) => Math.round(v))]);
    return [hdr.join(','), ...rows.map((r) => r.join(','))].join('\n');
  };
  A.actions.exportCsv = () => {
    const blob = new Blob(['﻿' + csv(A.s.M)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'zulfi-schedule-' + dt.iso(A.s.M.start) + '.csv';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  A.actions.shareLink = () => {
    const url = location.href.split('#')[0] + '#s=' + btoa(unescape(encodeURIComponent(Z.serialize(A.s.st))));
    const done = () => { const b = document.querySelector('[data-do="shareLink"]'); if (b) { b.textContent = 'Link copied ✓'; setTimeout(() => A.refilter(), 1600); } };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => prompt('Copy this link', url)); else prompt('Copy this link', url);
  };

  Z.registerSlide({
    id: 'scenario', title: 'Scenario summary', desc: 'Baseline vs revised · changes · export',
    render(M) {
      const ag = Z.aggregate(M, () => true, 'all'), bt = M.base.totalM;
      const y1 = ag.total.slice(0, 12).reduce((a, b) => a + b, 0), by1 = bt.slice(0, 12).reduce((a, b) => a + b, 0);
      const pk = ag.total.indexOf(Math.max(...ag.total)), bpk = bt.indexOf(Math.max(...bt));
      const m50 = ag.pct.findIndex((p) => p >= 0.5), b50 = M.base.pct.findIndex((p) => p >= 0.5);
      const fd = M.finish - M.base.finish;
      const row = (k, b, r, d) => `<tr><td>${k}</td><td class="muted">${b}</td><td><b>${r}</b></td><td>${d}</td></tr>`;
      const ch = M.changed.filter((a) => a.code !== Z.AUTO);
      const crow = ch.map((a) => `<tr class="act" data-act="${a.code}"><td><b style="color:var(--brand-d)">${a.code}</b></td><td style="max-width:260px;overflow:hidden;text-overflow:ellipsis">${F.esc(a.name)}</td><td class="muted">${dt.fmtShort(a.bs)} → ${dt.fmtShort(a.be)}</td><td><b>${dt.fmtShort(a.s)} → ${dt.fmtShort(a.e)}</b></td><td>${F.deltaHtml(a.ds, ' d')}</td><td>${F.deltaHtml(a.de, ' d')}</td></tr>`).join('');
      const asmChanged = JSON.stringify(M.st.A) !== JSON.stringify(Z.DEFAULT_A);
      return A.head('5', 'Scenario summary', 'What changed versus the Excel baseline – and how to take it with you', 'Derived from all four sheets') +
        `<div class="s-body"><div class="kpis" style="grid-template-columns:repeat(4,1fr)">
          <div class="kpi"><div class="k">Project start</div><div class="v" style="font-size:24px">${dt.fmt(M.start)}</div><div class="d">anchor for all 26 monthly buckets</div></div>
          <div class="kpi ${fd > 0 ? 'warn' : ''}"><div class="k">Planned completion</div><div class="v" style="font-size:24px">${dt.fmt(M.finish)}</div><div class="d">${F.deltaHtml(fd)}</div></div>
          <div class="kpi alt"><div class="k">Activities moved</div><div class="v">${ch.length}<small>of ${M.acts.length - 1}</small></div><div class="d">${asmChanged ? 'Weightages edited too' : 'Weightages as per Excel'}</div></div>
          <div class="kpi ${M.conflicts.length ? 'warn' : ''}"><div class="k">Dependency conflicts</div><div class="v">${M.conflicts.length}</div><div class="d">${M.conflicts.length ? 'review in the Gantt' : 'all links respected'}</div></div>
        </div>
        <div class="row grow">
          <div class="col" style="width:640px;gap:14px">
            <div class="panel"><div class="ph"><h3>Baseline vs revised</h3></div><div class="pb" style="padding-top:0"><table class="tbl"><thead><tr><th>Metric</th><th>Baseline</th><th>Revised</th><th>Δ</th></tr></thead><tbody>
              ${row('Phase 2 start (release)', dt.fmtShort(Z.phase2(M).baseStart), dt.fmtShort(Z.phase2(M).start), F.deltaHtml(Z.phase2(M).start - Z.phase2(M).baseStart))}
              ${row('Advance payment', 'SAR ' + F.n0(M.pay.amount), 'SAR ' + F.n0(M.pay.amount), `<span class="delta zero">${M.pay.pct}% · ${F.n0(M.pay.perMonth)}/month</span>`)}
              ${row('Completion date', dt.fmtShort(M.base.finish), dt.fmtShort(M.finish), F.deltaHtml(fd))}
              ${row('Duration (months)', '26', F.months(M.durMonths), F.deltaHtml(Math.round((M.durMonths - 26) * 30.4375)))}
              ${row('Total cost (excl. VAT)', F.M(M.total), F.M(M.total), '<span class="delta zero">fixed</span>')}
              ${row('Year-1 spend (M1–12)', F.M(by1), F.M(y1), `<span class="delta ${y1 > by1 ? 'down' : y1 < by1 ? 'up' : 'zero'}">${y1 === by1 ? '–' : (y1 > by1 ? '+' : '−') + F.M(Math.abs(y1 - by1))}</span>`)}
              ${row('Peak month', `M${bpk + 1} · ${F.M(bt[bpk])}`, `M${pk + 1} · ${F.M(ag.total[pk])}`, '')}
              ${row('50% of cost reached', 'M' + (b50 + 1), m50 >= 0 ? 'M' + (m50 + 1) : '–', m50 >= 0 ? `${m50 - b50 >= 0 ? '+' : '−'}${Math.abs(m50 - b50)} mo` : '')}
            </tbody></table></div></div>
            <div class="panel grow"><div class="ph"><h3>Take it with you</h3></div><div class="pb" style="display:flex;flex-direction:column;gap:10px">
              <div class="row" style="flex-wrap:wrap;gap:10px"><button class="btn primary" data-do="shareLink">Copy share link</button><button class="btn" data-do="exportCsv">Export schedule (CSV)</button><button class="btn" onclick="Z.app.print()">Print / save PDF</button><button class="btn danger" data-do="resetAll">Reset everything to baseline</button></div>
              <div class="hint">The share link carries the start date, every moved activity and edited weightage – anyone who opens it sees the same scenario. Your edits are also remembered in this browser.</div></div></div>
          </div>
          <div class="panel grow"><div class="ph"><h3>Moved activities</h3><span class="sub">${ch.length} versus baseline</span></div><div class="pb scroll" data-keep="scen" style="padding:0">
            ${ch.length ? `<table class="tbl"><thead><tr><th>WBS</th><th>Activity</th><th>Baseline</th><th>Revised</th><th>Start Δ</th><th>Finish Δ</th></tr></thead><tbody>${crow}</tbody></table>` : '<div class="empty">No changes yet.<br>Edit a date on the Gantt slide, or change the project start in the top bar –<br>this list and every chart will update.</div>'}</div></div>
        </div></div>`;
    },
  });
})(window);

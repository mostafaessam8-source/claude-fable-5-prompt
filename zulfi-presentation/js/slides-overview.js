/* Slides 1-3: Cover, Dashboard, Milestones & key gates */
(function (G) {
  const Z = G.Z, F = Z.F, dt = Z.dt, A = Z.app;
  A.idx = (id) => A.slides.findIndex((s) => s.id === id);

  A.changes.start = (el) => { const d = dt.parse(el.value); if (d) A.setState(Z.setStart(A.s.st, d)); };

  const span = (list) => {
    if (!list.length) return null;
    return { s: Math.min(...list.map((a) => a.s)), e: Math.max(...list.map((a) => a.e)) };
  };
  const durText = (sp) => { if (!sp) return '–'; const M = A.s.M; const k = dt.bucketOf(M.start, sp.s); const k2 = dt.bucketOf(M.start, sp.e + 1); const lo = dt.addMonths(M.start, k2), hi = dt.addMonths(M.start, k2 + 1); const m = k2 - k + (sp.e + 1 - lo) / (hi - lo) - (sp.s - dt.addMonths(M.start, k)) / (dt.addMonths(M.start, k + 1) - dt.addMonths(M.start, k)); return F.months(m); };

  /* ------------------------------------------------------------ cover */
  Z.registerSlide({
    id: 'cover', title: 'Cover', desc: 'Project overview & start date', cls: 'cover',
    render(M) {
      const stat = (k, v) => `<div class="cstat"><div class="k">${k}</div><div class="v">${v}</div></div>`;
      const sec = [
        ['Section 1', 'Dashboard', 'Cost summary, WBS groups, phases & EPC split', 'dash'],
        ['Section 2', 'WBS & CBS', 'Structure, cost breakdown register & EPC categories', 'wbs'],
        ['Section 3', '26-Month Schedule', 'Gantt chart, S-curve & monthly cash flow', 'gantt'],
        ['Section 4', 'Assumptions & Weightages', 'Cost weightages, gates & scenario summary', 'assump'],
      ];
      const n = M.changed.length;
      return `<div class="cv" style="display:flex;flex:1;gap:50px">
        <div style="flex:1;display:flex;flex-direction:column">
          <div class="eyebrow">Saudi Arabia Railway Company</div>
          <h1>Zulfi Railway<br>Station</h1>
          <h2>Project Cost, WBS / CBS &amp; 26-Month Schedule</h2>
          <div class="cv-stats" style="margin-top:46px;display:grid;grid-template-columns:repeat(3,1fr);gap:16px;max-width:900px">
            ${stat('Total project cost (excl. VAT)', F.sar(M.total))}
            ${stat('Project duration', F.months(M.durMonths) + ' months')}
            ${stat('Planned completion', dt.fmt(M.finish))}
          </div>
          <div style="margin-top:auto">
            <div class="eyebrow" style="margin-bottom:12px">Agenda</div>
            <div class="agenda">${sec.map((s) => `<button data-nav="${A.idx(s[3])}"><em>${s[0]}</em><b>${s[1]}</b><span>${s[2]}</span></button>`).join('')}</div>
          </div>
        </div>
        <div class="cv-r" style="width:430px;display:flex;flex-direction:column;gap:18px;justify-content:center">
          <div class="startbox"><label for="coverStart">Project start date</label>
            <input type="date" id="coverStart" value="${dt.iso(M.start)}" data-chg="start">
            <div style="margin-top:12px;font-size:13px;line-height:1.5;opacity:.92">Change the start date and every activity, Gantt bar, S-curve, milestone and monthly cash-flow figure in this presentation moves with it.</div></div>
          <div class="cstat"><div class="k">Scenario</div><div class="v" style="font-size:20px">${n ? `Revised – ${n} activities moved` : 'Baseline (as per Excel workbook)'}</div>
            <div style="font-size:13px;opacity:.85;margin-top:6px">Use <b>Next</b> / <b>→</b> to move through the deck, <b>F</b> for full screen.</div></div>
          <div class="cstat"><div class="k">Planned window</div><div class="v" style="font-size:20px">${dt.fmt(M.start)} → ${dt.fmt(M.finish)}</div></div>
        </div></div>`;
    },
  });

  /* -------------------------------------------------------- dashboard */
  Z.registerSlide({
    id: 'dash', title: 'Dashboard', desc: 'Cost summary & key figures',
    render(M) {
      const vis = A.visList(), sum = (f) => vis.filter(f).reduce((s, a) => s + a.amount, 0);
      const tot = vis.reduce((s, a) => s + a.amount, 0), p1 = sum((a) => a.phase === 'Phase 1'), p2 = sum((a) => a.phase === 'Phase 2');
      const sp = span(vis), filt = A.filtered();
      const tag = filt ? ' <span class="pill warn">filtered</span>' : '';
      const kpi = (k, v, d, cls, nav, attrs) => `<div class="kpi ${cls || ''}" ${nav ? `data-nav="${A.idx(nav)}"` : ''} ${attrs || ''}><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
      const kp = `<div class="kpis" style="grid-template-columns:1.25fr 1fr 1.25fr 1.2fr 1fr 1fr">
        ${kpi('Total project cost (excl. VAT)' + tag, F.n0(tot) + '<small>SAR</small>', `${F.pct(tot / M.total)} of full contract`, '', 'wbsreg')}
        ${kpi('VAT (15%)', F.n0(tot * Z.VAT) + '<small>SAR</small>', 'Saudi standard rate', 'alt')}
        ${kpi('Total project cost (incl. VAT)', F.n0(tot * (1 + Z.VAT)) + '<small>SAR</small>', 'Contract value with VAT', '', 'wbsreg')}
        ${kpi('Project duration', sp ? durText(sp) + '<small>months</small>' : '–', sp ? `${dt.fmtShort(sp.s)} → ${dt.fmtShort(sp.e)}` : '', 'warn', 'gantt')}
        ${kpi('Phase 1 total (excl. VAT)', F.M(p1) + '<small>SAR</small>', `${F.pct(tot ? p1 / tot : 0)} of selection`, '', null, 'data-cat="phase:Phase 1" style="cursor:pointer"')}
        ${kpi('Phase 2 total (excl. VAT)', F.M(p2) + '<small>SAR</small>', `${F.pct(tot ? p2 / tot : 0)} of selection`, 'alt', null, 'data-cat="phase:Phase 2" style="cursor:pointer"')}
      </div>`;

      // WBS groups
      const gItems = Z.GROUPS.map((g) => {
        const v = vis.filter((a) => a.group === g.code).reduce((s, a) => s + a.amount, 0);
        return { label: g.code + '  ' + g.name, value: v, color: F.groupColor(g.code), attrs: `data-grp="${g.code}"`, valText: F.M(v), sub: F.pct(tot ? v / tot : 0), tip: F.tip(g.code + ' ' + g.name, [[F.groupColor(g.code), 'Amount', F.sar(v)], ['', 'Share of selection', F.pct(tot ? v / tot : 0)], ['', 'Activities', vis.filter((a) => a.group === g.code).length], ['', 'Click', 'for details']]) };
      });
      const phItems = ['Phase 1', 'Phase 2'].map((p) => { const v = sum((a) => a.phase === p); return { label: p, value: v, color: F.phaseColor(p), attrs: `data-cat="phase:${p}"`, tip: F.tip(p, [[F.phaseColor(p), 'Amount', F.sar(v)], ['', 'Share', F.pct(tot ? v / tot : 0)]]) }; });
      const epItems = Z.EPC.map((e) => { const v = sum((a) => a.epc === e.key); return { label: e.name, value: v, color: F.epcColor(e.key), attrs: `data-cat="epc:${e.key}"`, key: e.key, tip: F.tip(e.name, [[F.epcColor(e.key), 'Amount', F.sar(v)], ['', 'Share', F.pct(tot ? v / tot : 0)]]) }; });
      const leg = (items) => `<div class="legend" style="flex-direction:column;gap:9px;flex:1;min-width:0">${items.map((i) => `<span class="hit" ${i.attrs} style="display:block;line-height:1.25"><i class="dot" style="background:${i.color}"></i>${i.label.replace(' of Materials', '').replace('Installation & Construction', 'Construction').replace(' / Preliminaries', '').replace(' (Design)', '')}<br><b style="color:var(--accent);margin-left:16px">${F.M(i.value)}</b> <span class="muted">${F.pct(tot ? i.value / tot : 0)}</span></span>`).join('')}</div>`;

      const agg = Z.aggregate(M, A.vis, 'all');
      const y1 = agg.total.slice(0, 12).reduce((s, v) => s + v, 0), y2 = agg.total.slice(12).reduce((s, v) => s + v, 0);
      const peakI = agg.total.indexOf(Math.max(...agg.total));

      return A.head('1', 'Dashboard', 'Project cost at a glance – click any bar, slice or tile for details', 'Sheet 1 · Dashboard') +
        `<div class="s-body">${kp}
        <div class="row grow" style="min-height:0">
          <div class="panel" style="width:640px"><div class="ph"><h3>Cost by WBS group</h3><span class="sub">SAR, excl. VAT</span></div>
            <div class="pb">${F.hbars(gItems, { w: 606, rowH: 74, stack: true, valW: 110, minW: 460, max: Math.max(...gItems.map((i) => i.value), 1) })}</div></div>
          <div class="panel grow"><div class="ph"><h3>Cumulative spend – S-curve</h3><div class="right"><button class="btn sm" data-nav="${A.idx('cashflow')}">Open cash flow ›</button></div></div>
            <div class="pb">${F.scurve(M, agg, { w: 378, h: 440, L: 40, R: 8, step: 3 })}
              <div class="row" style="margin-top:8px;gap:10px">
                <div class="dstat grow"><div class="k">Year 1 (M1–12)</div><div class="v">${F.M(y1)}</div><div class="hint">${F.pct(agg.sum ? y1 / agg.sum : 0)} of cost</div></div>
                <div class="dstat grow"><div class="k">Year 2 (M13+)</div><div class="v">${F.M(y2)}</div><div class="hint">${F.pct(agg.sum ? y2 / agg.sum : 0)} of cost</div></div>
                <div class="dstat grow" data-month="${peakI + 1}" style="cursor:pointer"><div class="k">Peak month</div><div class="v">M${peakI + 1} <small>${dt.fmtMY(M.bs[peakI])}</small></div><div class="hint">${F.M(agg.total[peakI])}</div></div>
              </div></div></div>
          <div class="panel" style="width:430px"><div class="ph"><h3>Phase &amp; EPC split</h3></div>
            <div class="pb" style="display:flex;flex-direction:column;gap:6px">
              <div style="display:flex;align-items:center;gap:14px"><div style="width:160px;flex:none">${F.donut(phItems, { size: 160, center: [F.pct(tot ? p1 / tot : 0, 0), 'Phase 1'], bigSize: 24 })}</div>${leg(phItems)}</div>
              <div style="display:flex;align-items:center;gap:14px"><div style="width:160px;flex:none">${F.donut(epItems, { size: 160, center: [F.M(tot, 1), 'by EPC'], bigSize: 21 })}</div>${leg(epItems)}</div>
            </div></div>
        </div></div>`;
    },
  });

  /* -------------------------------------------------------- milestones */
  Z.registerSlide({
    id: 'miles', title: 'Milestones & key gates', desc: 'Design → permit → procurement → construction', cls: '',
    render(M) {
      const ms = Z.milestones(M);
      const X0 = 30, X1 = 1490, T = M.finish - M.start + 1;
      const x = (d) => X0 + ((d - M.start) / T) * (X1 - X0);
      const bands = [
        ['Design & approvals', M.acts.filter((a) => a.epc === 'ENG' || a.code === '1.2'), 'var(--eng)'],
        ['Work permit gate', M.acts.filter((a) => a.code === '1.3'), 'var(--c4)'],
        ['Procurement', M.acts.filter((a) => a.epc === 'PROC'), 'var(--proc)'],
        ['Installation & construction', M.acts.filter((a) => a.epc === 'CONS'), 'var(--cons)'],
      ];
      let svg = `<svg viewBox="0 0 1512 300" width="100%" height="300" style="min-width:900px">`;
      // quarter ticks
      for (let k = 0; k <= M.N; k += 3) { const d = M.bs[Math.min(k, M.N)]; svg += `<line x1="${x(d)}" x2="${x(d)}" y1="94" y2="258" stroke="#e6ecf0"/><text x="${x(d)}" y="276" text-anchor="middle" style="font-size:11px">${dt.fmtMY(d)}</text><text x="${x(d)}" y="290" text-anchor="middle" style="font-size:10px;fill:var(--mute)">M${k + 1}</text>`; }
      bands.forEach((b, i) => {
        const sp = span(b[1]); if (!sp) return;
        const y = 100 + i * 40;
        svg += `<g class="hit" data-cat="band:${i}" data-tip="${F.tip(b[0], [['', 'Start', dt.fmt(sp.s)], ['', 'Finish', dt.fmt(sp.e)], ['', 'Activities', b[1].length]])}"><rect x="${x(sp.s)}" y="${y}" width="${Math.max(6, x(sp.e + 1) - x(sp.s))}" height="26" rx="6" fill="${b[2]}" class="hv"/>${x(sp.e + 1) - x(sp.s) > 260 ? `<text x="${x(sp.s) + 9}" y="${y + 17.5}" style="fill:#fff;font-weight:700;font-size:12.5px">${b[0]}</text><text x="${Math.min(X1, x(sp.e + 1) - 8)}" y="${y + 17.5}" text-anchor="end" style="fill:#fff;font-size:11.5px">${dt.fmtShort(sp.s)} – ${dt.fmtShort(sp.e)}</text>` : `<text x="${x(sp.e + 1) + 8}" y="${y + 17.5}" style="font-weight:700;font-size:12.5px;fill:var(--accent)">${b[0]} · ${dt.fmtShort(sp.s)} – ${dt.fmtShort(sp.e)}</text>`}</g>`;
      });
      svg += `<line x1="${X0}" x2="${X1}" y1="62" y2="62" stroke="#9fb0bb" stroke-width="2"/>`;
      ms.forEach((m, i) => {
        const px = x(Math.min(m.d, M.finish)), lvl = i % 3, ly = 14 + lvl * 14 - (lvl === 0 ? 0 : 0);
        const anchor = i === 0 ? 'start' : i === ms.length - 1 ? 'end' : 'middle';
        svg += `<g class="hit" ${m.code ? `data-act="${m.code}"` : ''} data-tip="${F.tip(m.name, [['', 'Date', dt.fmt(m.d)], ['', 'Baseline', dt.fmt(m.bd)], ['', 'Variance', F.days(m.delta)]])}"><line x1="${px}" x2="${px}" y1="${ly + 6}" y2="62" stroke="#9fb0bb" stroke-dasharray="3 3"/><path d="M${px},54 l8,8 -8,8 -8,-8z" fill="${m.delta > 0 ? 'var(--bad)' : 'var(--brand)'}" stroke="#fff" stroke-width="2"/><text x="${px}" y="${ly}" text-anchor="${anchor}" style="font-size:11.5px;font-weight:700;fill:var(--accent)">${i + 1}</text></g>`;
      });
      svg += '</svg>';

      const ll = M.acts.filter((a) => a.ll && a.kind === 'a3');
      const llAmt = M.acts.filter((a) => a.ll).reduce((s, a) => s + a.amount, 0);
      const cons = M.acts.filter((a) => a.kind === 'b').sort((a, b) => a.dur - b.dur).slice(0, 4);
      const agg = Z.aggregate(M, () => true, 'all'), pk = agg.total.indexOf(Math.max(...agg.total));
      const tight = M.acts.filter((a) => a.kind === 'b' && a.e >= M.finish - 95);
      return A.head('1b', 'Milestones &amp; key gates', 'How the schedule gates drive the 26-month programme', 'Sheet 3 · Schedule + Sheet 4 · gates') +
        `<div class="s-body"><div class="panel"><div class="pb" style="padding-top:10px">${svg}</div></div>
        <div class="row grow">
          <div class="panel" style="width:830px"><div class="ph"><h3>Milestone register</h3><span class="sub">dates move with the start date and your edits</span></div><div class="pb scroll" style="padding-top:0">
            <table class="tbl"><thead><tr><th>#</th><th>Milestone</th><th>Date</th><th>Baseline</th><th>Variance</th></tr></thead><tbody>
            ${ms.map((m, i) => `<tr class="${m.code ? 'act' : ''}" ${m.code ? `data-act="${m.code}"` : ''}><td><b>${i + 1}</b></td><td>${m.name}</td><td><b>${dt.fmt(m.d)}</b></td><td class="muted">${dt.fmt(m.bd)}</td><td>${F.deltaHtml(m.delta)}</td></tr>`).join('')}
            </tbody></table></div></div>
          <div class="col grow" style="gap:12px">
            <div class="row" style="gap:12px">
              <div class="kpi ${M.conflicts.length ? 'warn' : ''} grow" data-do="goCrit" style="cursor:pointer"><div class="k">Critical activities</div><div class="v">${M.criticalCount}<small>of ${M.acts.length - 1}</small></div><div class="d">zero float to completion – click to filter</div></div>
              <div class="kpi alt grow" data-do="goLL" style="cursor:pointer"><div class="k">Long-lead items</div><div class="v">${M.acts.filter((a) => a.ll).length}<small>activities</small></div><div class="d">${F.M(llAmt)} SAR · last delivery ${ll.length ? dt.fmtShort(Math.max(...ll.map((a) => a.e))) : '–'}</div></div>
            </div>
            <div class="panel grow"><div class="ph"><h3>Schedule insights</h3></div><div class="pb" style="font-size:13.5px;line-height:1.55">
              <p style="margin:0 0 8px"><b>Tight tail-end:</b> ${tight.length} installation activities finish in the last ~3 months (${tight.slice(0, 4).map((a) => a.code).join(', ')}…). Shortest installation windows: ${cons.map((a) => `<a data-act="${a.code}" style="color:var(--brand-d);cursor:pointer;font-weight:700">${a.code} (${F.months(a.dur / 30.4)} mo)</a>`).join(', ')}.</p>
              <p style="margin:0 0 8px"><b>Peak spend:</b> month ${pk + 1} (${dt.fmtMY(M.bs[pk])}) at ${F.sar(agg.total[pk])}.</p>
              <p style="margin:0 0 8px"><b>Binding gate:</b> construction cannot start before the work permit on ${dt.fmt(M.by['1.3'].e)} – it follows detailed-design approval (${dt.fmt(M.by['2.6'].e)}).</p>
              ${M.conflicts.length ? `<div class="note bad">${M.conflicts.length} dependency conflict(s): ${M.conflicts.slice(0, 5).map((a) => a.code).join(', ')}${M.conflicts.length > 5 ? '…' : ''} start earlier than their predecessor allows. Open the Gantt to resolve.</div>` : '<div class="note ok">No dependency conflicts – all finish-to-start links are respected.</div>'}
            </div></div>
          </div></div></div>`;
    },
  });

  A.actions.goCrit = () => { A.s.f.crit = !A.s.f.crit; A.go(A.idx('gantt')); A.refilter(); };
  A.actions.goLL = () => { A.s.f.ll = !A.s.f.ll; A.go(A.idx('gantt')); A.refilter(); };
})(window);

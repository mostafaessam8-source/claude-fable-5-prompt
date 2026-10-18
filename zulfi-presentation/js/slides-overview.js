/* Slides 1-3: Cover, Dashboard, Milestones & key gates */
(function (G) {
  const Z = G.Z, F = Z.F, dt = Z.dt, A = Z.app;
  A.idx = (id) => A.slides.findIndex((s) => s.id === id);


  /* editable "Schedule insights" text: {tokens} are live values */
  const INS_TPL = `<p style="margin:0 0 8px"><b>Tight tail-end:</b> {tightCount} installation activities finish in the last ~3 months ({tightCodes}…). Shortest installation windows: {shortWin}.</p>
<p style="margin:0 0 8px"><b>Peak spend:</b> month {peakMonth} ({peakDate}) at {peakAmt}.</p>
<p style="margin:0 0 8px"><b>Phase 2:</b> must start by {p2latest} to hold completion{p2late}. Move the milestone in the register (row {p2row}) or on the Phase 2 slide.</p>
<p style="margin:0 0 8px"><b>Advance payment:</b> {advAmt} ({advPct}% of contract) at NTP, recovered {advPer} per month over {advMonths} months.</p>
<p style="margin:0 0 8px"><b>Binding gate:</b> construction cannot start before the work permit on {permitDate} – it follows detailed-design approval ({ddDate}).</p>`;
  const insTokens = (M, ms, P2, tight, cons, agg, pk) => ({
    tightCount: tight.length, tightCodes: tight.slice(0, 4).map((a) => a.code).join(', '),
    shortWin: cons.map((a) => `<a data-act="${a.code}" style="color:var(--brand-d);cursor:pointer;font-weight:700">${a.code} (${F.months(a.dur / 30.4)} ${A.L('mo', 'ش')})</a>`).join(', '),
    peakMonth: pk + 1, peakDate: dt.fmtMY(M.bs[pk]), peakAmt: F.sar(agg.total[pk]),
    p2latest: `<a data-nav="${A.idx('phase2')}" style="color:var(--ph2);cursor:pointer;font-weight:700">${dt.fmt(P2.latest)}</a>`,
    p2late: P2.delay > 0 ? (A.isAr() ? ` – البداية الحالية متأخرة ${P2.start - P2.baseStart} يوماً، والإنجاز <b style="color:var(--bad)">+${P2.delay} يوم</b>` : ` – currently released ${F.days(P2.start - P2.baseStart)} late, completion <b style="color:var(--bad)">${F.days(P2.delay)}</b>`) : '',
    p2row: ms.findIndex((m) => m.k === 'p2') + 1,
    advAmt: F.sar(M.pay.amount), advPct: M.pay.pct, advPer: F.sar(M.pay.perMonth), advMonths: M.pay.months,
    permitDate: dt.fmt(M.by['1.3'].e), ddDate: dt.fmt(M.by['2.6'].e),
  });

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
          ${A.ed('cv:h2', 'Project Cost, WBS / CBS &amp; 26-Month Schedule', null, { tag: 'h2' })}
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
            ${A.ed('cv:blurb', 'Change the start date and every activity, Gantt bar, S-curve, milestone and monthly cash-flow figure in this presentation moves with it.', null, { style: 'margin-top:12px;font-size:13px;line-height:1.5;opacity:.92' })}</div>
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
      const ms = Z.milestones(M), P2 = Z.phase2(M);
      const X0 = 245, X1 = 1490, t0 = Math.min(M.start, ...ms.map((m) => m.d)) - 4, T = M.finish - t0 + 1;
      const x = (d) => X0 + ((d - t0) / T) * (X1 - X0);
      const PH = (ph) => M.acts.filter((a) => a.phase === ph && a.code !== Z.AUTO);
      const bands = [
        ['Phase 1', PH('Phase 1'), 'var(--ph1)', 'phase:Phase 1'],
        ['Phase 2', PH('Phase 2'), 'var(--ph2)', 'phase:Phase 2'],
        ['Design & approvals', M.acts.filter((a) => a.epc === 'ENG' || a.code === '1.2'), 'var(--eng)', 'band:0'],
        ['Work permit gate', M.acts.filter((a) => a.code === '1.3'), 'var(--c4)', 'band:1'],
        ['Procurement', M.acts.filter((a) => a.epc === 'PROC'), 'var(--proc)', 'band:2'],
        ['Installation & construction', M.acts.filter((a) => a.epc === 'CONS'), 'var(--cons)', 'band:3'],
      ];
      const SHORT = { grant1: 'Phase 1 funds granted', ntp: 'NTP', access: 'Access permits', concept: 'Concept design', prelim: 'Preliminary design', proc: '1st procurement', grant2: 'Phase 2 funds granted', p2: 'Phase 2 start', p2late: 'Latest Phase 2 start', detail: 'Detailed design', permit: 'Work permit', cons: 'Construction start', ll: 'Long-lead done', fin: 'Completion' };
      const KEY = ['grant1', 'ntp', 'grant2', 'p2', 'p2late'];
      // one chronological list: milestones and activity bars together, earliest on top
      // each milestone sits directly under the band (phase / work package) it belongs to
      const OWN = { grant1: 0, ntp: 0, grant2: 1, p2: 1, p2late: 1, access: 2, concept: 2, prelim: 2, detail: 2, permit: 3, proc: 4, cons: 5, ll: 5, fin: 5 };
      const SHOWN = ['ntp', 'p2', 'fin'];
      const rows = [];
      bands.map((bd, bi) => ({ bd, bi, sp: span(bd[1]) })).filter((q) => q.sp && ![3].includes(q.bi)).sort((p, q) => p.sp.s - q.sp.s || p.bi - q.bi).forEach((q) => {
        rows.push({ t: 'b', d: q.sp.s, bd: q.bd, sp: q.sp });
        ms.map((m, i) => ({ m, i })).filter((o) => SHOWN.includes(o.m.k) && OWN[o.m.k] === q.bi).sort((a, b) => a.m.d - b.m.d).forEach((o) => rows.push({ t: 'm', d: o.m.d, m: o.m, i: o.i }));
      });
      const TOP = 34, RH = Math.max(23, Math.min(46, Math.floor(560 / rows.length))), K = RH / 23, FK = Math.min(1.3, 1 + (K - 1) * 0.35), BOT = TOP + rows.length * RH + 4, H = BOT + 40;
      let svg = `<svg viewBox="0 0 1512 ${H}" width="100%" height="${H}" style="min-width:900px" data-t0="${t0}" data-t="${T}" data-x0="${X0}" data-x1="${X1}" data-b1="${M.start}" data-b2="${P2.start}" data-top="${TOP}" data-rh="${RH}" data-n="${rows.length}" data-bot="${BOT}">`;
      rows.forEach((r, i) => { if (i % 2 === 0) svg += `<rect x="0" y="${TOP + i * RH}" width="1512" height="${RH}" fill="#f4f8fa"/>`; });
      svg += `<rect id="hrow" x="0" y="0" width="1512" height="${RH}" fill="var(--brand)" opacity=".10" style="display:none" pointer-events="none"/><rect id="hcol" x="0" y="${TOP - 4}" width="26" height="${BOT - TOP + 4}" fill="var(--brand)" opacity=".10" style="display:none" pointer-events="none"/>`;
      // date ruler – top and bottom
      for (let k = 0; k <= M.N; k += 3) { const d = M.bs[Math.min(k, M.N)]; if (d < t0) continue; svg += `<line x1="${x(d)}" x2="${x(d)}" y1="${TOP - 4}" y2="${BOT}" stroke="#d9e2e8"/><text x="${x(d)}" y="12" text-anchor="middle" style="font-size:11px">${dt.fmtMY(d)}</text><text x="${x(d)}" y="25" text-anchor="middle" style="font-size:10px;fill:var(--mute)">M${k + 1}</text><text x="${x(d)}" y="${BOT + 16}" text-anchor="middle" style="font-size:11px">${dt.fmtMY(d)}</text><text x="${x(d)}" y="${BOT + 29}" text-anchor="middle" style="font-size:10px;fill:var(--mute)">M${k + 1}</text>`; }
      svg += `<line x1="${X0}" x2="${X1}" y1="${BOT}" y2="${BOT}" stroke="#9fb0bb" stroke-width="2"/>`;
      ms.filter((m) => ['ntp', 'p2'].includes(m.k)).forEach((m) => {
        const c = m.k === 'ntp' ? 'var(--c3)' : m.k === 'p2' ? 'var(--ph2)' : 'var(--bad)';
        svg += `<line x1="${x(m.d)}" x2="${x(m.d)}" y1="${TOP - 4}" y2="${BOT}" stroke="${c}" stroke-width="1.5" stroke-dasharray="${m.k === 'ntp' ? '0' : '5 4'}" opacity=".6"/>`;
      });
      const mk = [];
      rows.forEach((r, i) => {
        const cy = TOP + i * RH + RH / 2;
        if (r.t === 'b') {
          const bd = r.bd, sp = r.sp, y = cy - 8 * K, h = 16 * K;
          const tip = F.tip(bd[0], [['', 'Start', dt.fmt(sp.s)], ['', 'Finish', dt.fmt(sp.e)], ['', 'Activities', bd[1].length]]);
          const w = Math.max(6, x(sp.e + 1) - x(sp.s));
          svg += `<text x="8" y="${cy + 4}" style="font-size:${(12 * FK).toFixed(1)}px;font-weight:700;fill:${bd[2]}">${bd[0].length > 30 ? bd[0].slice(0, 28) + '…' : bd[0]}</text><g class="hit" data-cat="${bd[3]}" data-tip="${tip}"><rect x="${x(sp.s)}" y="${y}" width="${w}" height="${h}" rx="${5 * K}" fill="${bd[2]}" class="hv"/>${w > 190 ? `<text x="${Math.min(X1, x(sp.e + 1) - 8)}" y="${cy + 4}" text-anchor="end" style="fill:#fff;font-size:${(11 * FK).toFixed(1)}px">${dt.fmtShort(sp.s)} – ${dt.fmtShort(sp.e)}</text>` : `<text x="${x(sp.e + 1) + 8}" y="${cy + 4}" style="font-weight:700;font-size:${(11 * FK).toFixed(1)}px;fill:var(--accent)">${dt.fmtShort(sp.s)} – ${dt.fmtShort(sp.e)}</text>`}</g>`;
          return;
        }
        const m = r.m, px = x(Math.min(m.d, M.finish)), txt = `◆ ${A.L(SHORT[m.k] || m.name, { ntp: 'أمر البدء', p2: 'بداية المرحلة الثانية', fin: 'الإنجاز' }[m.k] || m.name)}`;
        const col = m.delta > 0 ? 'var(--bad)' : m.k === 'grant1' || m.k === 'grant2' ? 'var(--c4)' : m.k === 'p2' || m.k === 'p2late' ? 'var(--ph2)' : m.k === 'ntp' ? 'var(--c3)' : 'var(--brand)';
        const late = px > X1 - 130, dl = `${dt.fmtShort(m.d)}${m.delta ? ' (' + F.days(m.delta) + ')' : ''}`;
        const drg = m.edit ? `data-grant="${m.edit}" data-day="${m.d}" style="cursor:ew-resize;touch-action:none"` : '';
        mk.push({ e: !!m.edit, h: `<g class="hit" ${drg} ${m.code ? `data-act="${m.code}"` : m.nav && m.nav !== 'miles' && !m.edit ? `data-nav="${A.idx(m.nav)}"` : ''} data-tip="${F.tip(m.name, [['', 'Date', dt.fmt(m.d)], ['', 'Baseline', dt.fmt(m.bd)], ['', 'Variance', F.days(m.delta)]])}"><rect x="0" y="${cy - RH / 2}" width="${X0 - 6}" height="${RH}" fill="transparent"/><text x="8" y="${cy + 4}" style="font-size:${(11.5 * FK).toFixed(1)}px;font-weight:${KEY.includes(m.k) ? 800 : 600};fill:${KEY.includes(m.k) ? col : 'var(--accent)'}">${txt}</text><path d="M${px},${cy - 8 * K} l${8 * K},${8 * K} ${-8 * K},${8 * K} ${-8 * K},${-8 * K}z" fill="${col}" stroke="#fff" stroke-width="2"/><text x="${late ? px - 13 : px + 13}" y="${cy + 4}" text-anchor="${late ? 'end' : 'start'}" style="font-size:${(11 * FK).toFixed(1)}px;font-weight:700;fill:${col}">${dl}</text></g>` });
      });
      svg += mk.filter((q) => !q.e).map((q) => q.h).join('') + mk.filter((q) => q.e).map((q) => q.h).join('');
      svg += `<g id="hdate" style="display:none" pointer-events="none"><line id="hline" x1="0" x2="0" y1="${TOP - 4}" y2="${BOT}" stroke="var(--brand-d)" stroke-width="1"/><rect id="hbox" x="0" y="${BOT + 4}" width="150" height="34" rx="6" fill="var(--brand-d)"/><text id="htxt" x="0" y="${BOT + 19}" text-anchor="middle" style="fill:#fff;font-size:12px;font-weight:800"></text><text id="htxt2" x="0" y="${BOT + 33}" text-anchor="middle" style="fill:#cfeef3;font-size:10px"></text></g>`;
      svg += '</svg>';

      const tab = (A.s.ui.ms = A.s.ui.ms || { tab: 'chart' }).tab;
      const ll = M.acts.filter((a) => a.ll && a.kind === 'a3');
      const llAmt = M.acts.filter((a) => a.ll).reduce((s, a) => s + a.amount, 0);
      const cons = M.acts.filter((a) => a.kind === 'b').sort((a, b) => a.dur - b.dur).slice(0, 4);
      const agg = Z.aggregate(M, () => true, 'all'), pk = agg.total.indexOf(Math.max(...agg.total));
      const tight = M.acts.filter((a) => a.kind === 'b' && a.e >= M.finish - 95);
      return A.head('1b', 'Milestones &amp; key gates', 'How the schedule gates drive the 26-month programme', 'Sheet 3 · Schedule + Sheet 4 · gates') +
        `<div class="s-body"><div class="row" style="align-items:center;gap:12px;flex:none"><span class="seg"><button data-do="msTab" data-t="chart" class="${tab === 'chart' ? 'on' : ''}">Timeline</button><button data-do="msTab" data-t="tables" class="${tab === 'tables' ? 'on' : ''}">Register &amp; insights</button></span><span class="hint">${tab === 'chart' ? 'Hover for the date ruler · drag the diamonds to test scenarios' : 'Milestone register, key figures and schedule insights'}</span></div>
        ${tab === 'chart' ? `<div class="panel"><div class="pb" style="padding-top:6px"><div class="hint" style="margin-bottom:2px">${A.isAr() ? 'اسحب معلم <b style="color:var(--ph2)">بداية المرحلة الثانية</b> لتجربة السيناريوهات.' : 'Drag the <b style="color:var(--ph2)">Phase 2 start</b> milestone to test scenarios.'}</div>${svg}</div></div>` : ''}
        <div class="row grow" ${tab === 'chart' ? 'style="display:none"' : ''}>
          <div class="panel" style="width:830px"><div class="ph"><h3>Milestone register</h3><span class="sub">dates move with the start date and your edits</span></div><div class="pb scroll" style="padding-top:0">
            <table class="tbl"><thead><tr><th>#</th><th>Milestone</th><th>Date</th><th>Baseline</th><th>Variance</th></tr></thead><tbody>
            ${ms.map((m, i) => `<tr class="${m.code || (m.nav && m.nav !== 'miles') ? 'act' : ''}" ${m.code ? `data-act="${m.code}"` : m.nav && m.nav !== 'miles' && !m.edit ? `data-nav="${A.idx(m.nav)}"` : ''} ${m.edit ? 'style="background:#f1eefc"' : ''}><td><b>${i + 1}</b></td><td>${m.name}</td><td>${m.edit === 'p2' ? `<input type="date" class="dinput" style="width:140px" value="${dt.iso(m.d)}" min="${dt.iso(M.start)}" data-chg="p2date" title="Move the Phase 2 start – the whole programme updates">` : m.edit ? `<input type="date" class="dinput" style="width:140px" value="${dt.iso(m.d)}" max="${dt.iso(m.edit === 'g1' ? M.start : P2.start)}" data-chg="grantdate" data-k="${m.edit}" title="Move the funds approval – it must be before its phase starts">` : `<b>${dt.fmt(m.d)}</b>`}</td><td class="muted">${dt.fmt(m.bd)}</td><td>${F.deltaHtml(m.delta)}</td></tr>`).join('')}
            </tbody></table></div></div>
          <div class="col grow" style="gap:12px">
            <div class="row" style="gap:12px">
              <div class="kpi ${M.conflicts.length ? 'warn' : ''} grow" data-do="goCrit" style="cursor:pointer"><div class="k">Critical activities</div><div class="v">${M.criticalCount}<small>of ${M.acts.length - 1}</small></div><div class="d">zero float to completion – click to filter</div></div>
              <div class="kpi alt grow" data-do="goLL" style="cursor:pointer"><div class="k">Long-lead items</div><div class="v">${M.acts.filter((a) => a.ll).length}<small>activities</small></div><div class="d">${F.M(llAmt)} SAR · last delivery ${ll.length ? dt.fmtShort(Math.max(...ll.map((a) => a.e))) : '–'}</div></div>
            </div>
            <div class="panel grow"><div class="ph"><h3>Schedule insights</h3></div><div class="pb scroll" style="font-size:13px;line-height:1.5">
              ${A.ed('ins:miles', INS_TPL, insTokens(M, ms, P2, tight, cons, agg, pk))}
              ${M.conflicts.length ? `<div class="note bad">${M.conflicts.length} dependency conflict(s): ${M.conflicts.slice(0, 5).map((a) => a.code).join(', ')}${M.conflicts.length > 5 ? '…' : ''} start earlier than their predecessor allows. Open the Gantt to resolve.</div>` : '<div class="note ok">No dependency conflicts – all finish-to-start links are respected.</div>'}
            </div></div>
          </div></div></div>`;
    },
  });


  /* ---- movable funds-granted milestones and Phase 2 start ---- */
  A.changes.grantdate = (el) => {
    const d = dt.parse(el.value); if (!d) return;
    const M = A.s.M, k = el.dataset.k, base = k === 'g1' ? M.start : Z.phase2(M).start;
    const st = Z.cloneState(A.s.st); st.ms[k] = Math.min(730, Math.max(0, base - d)); A.setState(st);
  };
  A.slides.find((s) => s.id === 'miles').after = (el) => {
    const svg = el.querySelector('svg[data-t0]'); if (!svg) return;
    const t0 = +svg.dataset.t0, T = +svg.dataset.t, X0 = +svg.dataset.x0, X1 = +svg.dataset.x1;
    const base = { g1: +svg.dataset.b1, g2: +svg.dataset.b2 };
    const dayAt = (cx) => { const pt = svg.createSVGPoint(); pt.x = cx; pt.y = 0; const sx = pt.matrixTransform(svg.getScreenCTM().inverse()).x; return Math.round(t0 + ((sx - X0) / (X1 - X0)) * T); };
    let drag = null;
    const tip = document.querySelector('#tip');
    const top = +svg.dataset.top, rh = +svg.dataset.rh, nR = +svg.dataset.n, bot = +svg.dataset.bot, M0 = A.s.M;
    const q = (id) => svg.querySelector('#' + id), hrow = q('hrow'), hcol = q('hcol'), hd = q('hdate');
    const toSvg = (e) => { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); };
    const showRuler = (e) => {
      if (drag) return;
      const p = toSvg(e);
      if (p.x < X0 || p.x > X1 || p.y < top - 4 || p.y > bot) { hrow.style.display = hcol.style.display = hd.style.display = 'none'; return; }
      const d = dayAt(e.clientX), k = Math.max(0, Math.min(M0.N - 1, dt.bucketOf(M0.start, d)));
      const row = Math.min(nR - 1, Math.max(0, Math.floor((p.y - top) / rh)));
      hrow.setAttribute('y', top + row * rh); hrow.style.display = '';
      // highlight the whole month column under the cursor
      const m0 = Math.max(M0.bs[k], t0), m1 = Math.min(M0.bs[k + 1], t0 + T);
      hcol.setAttribute('x', X0 + ((m0 - t0) / T) * (X1 - X0)); hcol.setAttribute('width', Math.max(2, ((m1 - m0) / T) * (X1 - X0))); hcol.style.display = '';
      const lx = X0 + ((d - t0) / T) * (X1 - X0);
      q('hline').setAttribute('x1', lx); q('hline').setAttribute('x2', lx);
      q('hbox').setAttribute('x', Math.min(1512 - 154, Math.max(2, lx - 75)));
      const cx = Math.min(1512 - 79, Math.max(77, lx));
      q('htxt').setAttribute('x', cx); q('htxt2').setAttribute('x', cx);
      q('htxt').textContent = A.isAr() ? '\u2066\u2067' + A.tr(dt.fmt(d)) + '\u2069\u2069' : dt.fmt(d); q('htxt2').textContent = A.L('Month ' + (k + 1) + ' of ' + M0.N, 'الشهر ' + (k + 1) + ' من ' + M0.N);
      hd.style.display = '';
    };
    svg.addEventListener('pointermove', showRuler);
    svg.addEventListener('pointerdown', showRuler);
    svg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hrow.style.display = hcol.style.display = hd.style.display = 'none'; });
    svg.querySelectorAll('[data-grant]').forEach((g) => {
      g.addEventListener('pointerdown', (e) => { drag = { g, k: g.dataset.grant, x0: e.clientX, moved: false, day: +g.dataset.day }; g.setPointerCapture(e.pointerId); e.preventDefault(); });
      g.addEventListener('pointermove', (e) => {
        if (!drag || drag.g !== g) return;
        if (Math.abs(e.clientX - drag.x0) > 3) drag.moved = true;
        if (!drag.moved) return;
        let d = dayAt(e.clientX), note = '';
        if (drag.k === 'p2') d = Math.max(d, A.s.M.start);
        else { if (d > base[drag.k]) { d = base[drag.k]; note = 'must be before the phase starts'; } d = Math.max(d, base[drag.k] - 730); }
        drag.day = d;
        g.setAttribute('transform', `translate(${((d - +g.dataset.day) * (X1 - X0)) / T},0)`);
        tip.innerHTML = A.tr(`<div class="t">${drag.k === 'p2' ? 'Phase 2 start' : drag.k === 'g1' ? 'Phase 1 funds granted' : 'Phase 2 funds granted'}</div><div class="r"><span>Date</span><b>${dt.fmt(d)}</b></div>${drag.k === 'p2' ? '' : `<div class="r"><span>Before phase start</span><b>${base[drag.k] - d} days</b></div>`}${note ? `<div style="color:#ffd27a">${note}</div>` : ''}`);
        tip.dataset.src = ''; tip.style.display = 'block';
        const r = document.querySelector('#stage').getBoundingClientRect();
        tip.style.left = (e.clientX - r.left) / A.scale + 14 + 'px'; tip.style.top = (e.clientY - r.top) / A.scale + 14 + 'px';
      });
      const end = () => {
        if (!drag) return; const d = drag; drag = null; tip.style.display = 'none';
        if (!d.moved) return;
        G.__ganttSuppress = true; setTimeout(() => (G.__ganttSuppress = false), 50);
        if (d.k === 'p2') A.setState(Z.setPhase2Start(A.s.st, d.day));
        else { const st = Z.cloneState(A.s.st); st.ms[d.k] = Math.max(0, base[d.k] - d.day); A.setState(st); }
      };
      g.addEventListener('pointerup', end); g.addEventListener('pointercancel', end);
    });
  };

  A.actions.msTab = (el) => { (A.s.ui.ms = A.s.ui.ms || {}).tab = el.dataset.t; A.refilter(); };
  A.actions.goCrit = () => { A.s.f.crit = !A.s.f.crit; A.go(A.idx('gantt')); A.refilter(); };
  A.actions.goLL = () => { A.s.f.ll = !A.s.f.ll; A.go(A.idx('gantt')); A.refilter(); };
})(window);

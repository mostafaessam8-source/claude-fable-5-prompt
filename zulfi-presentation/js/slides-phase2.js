/* Slide: why Phase 2 must start with Phase 1 – critical Phase 2 activities, the movable Phase 2 start milestone and scenarios */
(function (G) {
  const Z = G.Z, F = Z.F, dt = Z.dt, A = Z.app;
  const ITEMS = [['7.2', 'Railway Track Works (2,500 m)'], ['3.3', 'Furniture, Fixtures & Equipment'], ['6.1', 'Access Road (1,700 m)'], ['4.3', 'Generator Room']];

  /* editable explanation: {tokens} are live values */
  const WHY_TPL = `<p style="margin:0 0 7px"><b>1 · Railway Track is the longest path.</b> {trackAmt} SAR ({trackPct} of the contract): 8 months manufacture &amp; delivery and only 6 months installation, with {trackFloat}.</p>
<p style="margin:0 0 7px"><b>2 · Detailed Design is the gate.</b> Phase 2 procurement waits for Detailed Design approval ({ddDate}); Track, Access Road, Generator Room and FF&amp;E must be released with Phase 1 so they are inside the design from Concept stage.</p>
<p style="margin:0 0 7px"><b>3 · Every day late is a day of delay.</b> Zero float on the Track chain: Phase 2 released after {latest} moves completion one-for-one{delayNow}.</p>
<p style="margin:0 0 7px"><b>4 · The tail-end has no room.</b> Installation windows at the end are only 2–6 months, so slippage cannot be absorbed.</p>
<p style="margin:0"><b>5 · Funds first.</b> Phase 2 amount must be granted {g2} days before the start – by <b>{grantDate}</b>.</p>`;
  const whyTokens = (M, P, g2, delay, trackF) => {
    const trk = P.list.filter((a) => a.item === '7.2').reduce((s, a) => s + a.amount, 0);
    return {
      trackAmt: F.M(trk), trackPct: F.pct(trk / M.total, 0),
      trackFloat: trackF < 0 ? `<b style="color:var(--bad)">${-Math.round(trackF)} d late</b>` : `<b>${Math.round(trackF)} d</b> float`,
      ddDate: dt.fmtShort(M.by['2.6'].e), latest: dt.fmtShort(P.latest),
      delayNow: delay > 0 ? ` (now <b style="color:var(--bad)">${F.days(delay)}</b>)` : '', g2, grantDate: dt.fmtShort(P.start - g2),
    };
  };

  const apply = (day) => { if (day) A.setState(Z.setPhase2Start(A.s.st, day)); };
  A.changes.p2date = (el) => apply(dt.parse(el.value));
  A.changes.p2range = (el) => { const P = Z.phase2(A.s.M); apply(P.baseStart + (+el.value)); };
  A.actions.p2set = (el) => apply(+el.dataset.day);
  A.actions.p2reset = () => apply(Z.phase2(A.s.M).baseStart);

  Z.registerSlide({
    id: 'phase2', title: 'Why Phase 2 starts with Phase 1', desc: 'Critical Phase 2 activities & start scenarios',
    render(M) {
      const P = Z.phase2(M), st = M.st, g2 = st.ms.g2;
      const off = P.start - P.baseStart, delay = P.delay;
      const lo = M.start - P.baseStart, hi = 540;
      const p2amt = P.list.reduce((s, a) => s + a.amount, 0);
      const crit = P.list.filter((a) => a.floatB <= 45).sort((a, b) => a.floatB - b.floatB || a.s - b.s);
      const trackF = Math.min(...P.list.filter((a) => a.item === '7.2').map((a) => a.floatB));
      const state = off < 0 ? ['at risk – starts before the Detailed Design gate', 'var(--c4)'] : off === 0 ? ['baseline plan', 'var(--good)'] : ['released late – completion is exposed', 'var(--bad)'];
      const pre = (label, day, extra) => `<button class="chip ${Math.abs(day - P.start) < 1 ? 'on' : ''}" data-do="p2set" data-day="${day}" ${extra || ''}>${label}</button>`;
      const kpi = (k, v, d, cls) => `<div class="kpi ${cls || ''}"><div class="k">${k}</div><div class="v" style="font-size:24px">${v}</div><div class="d">${d}</div></div>`;

      // timeline of the four Phase 2 packages
      const t0 = M.start - 5, t1 = Math.max(M.finish, M.base.finish) + 20, W = 940, L = 235, R = 14, rowH = 46, top = 46;
      const x = (d) => L + ((d - t0) / (t1 - t0)) * (W - L - R);
      let svg = `<svg viewBox="0 0 ${W} ${top + ITEMS.length * rowH + 22}" width="100%" style="min-width:760px">`;
      for (let k = 0; k <= M.N; k += 3) { const d = M.bs[Math.min(k, M.N)]; svg += `<line x1="${x(d)}" x2="${x(d)}" y1="${top - 6}" y2="${top + ITEMS.length * rowH}" stroke="#e6ecf0"/><text x="${x(d)}" y="${top + ITEMS.length * rowH + 14}" text-anchor="middle" style="font-size:10.5px">${dt.fmtMY(d)}</text>`; }
      ITEMS.forEach(([key, name], i) => {
        const y = top + i * rowH, list = P.list.filter((a) => a.item === key), f = Math.min(...list.map((a) => a.floatB));
        svg += `<text x="0" y="${y + 19}" style="font-size:12.5px;font-weight:700;fill:var(--accent)">${key} ${F.esc(name)}</text><text x="0" y="${y + 34}" style="font-size:11px;fill:${f <= 0 ? 'var(--bad)' : f <= 45 ? 'var(--warn)' : 'var(--good)'};font-weight:700">${f <= 0 ? (f < 0 ? 'late ' + Math.abs(Math.round(f)) + ' d' : 'critical – 0 d float') : f <= 45 ? 'near-critical – ' + Math.round(f) + ' d' : Math.round(f) + ' d float'}</text>`;
        list.forEach((a) => {
          const col = a.kind === 'b' ? 'var(--cons)' : a.kind === 'a3' ? 'var(--proc)' : '#f3a888';
           if (a.changed) svg += `<rect x="${x(a.bs)}" y="${y + 31}" width="${Math.max(2, x(a.be + 1) - x(a.bs))}" height="3" fill="#99a6b0"/>`;
          svg += `<g class="hit" data-act="${a.code}" data-tip="${F.tip(a.code + ' · ' + F.esc(a.name), [['', 'Start', dt.fmt(a.s)], ['', 'Finish', dt.fmt(a.e)], ['', 'Float to baseline completion', Math.round(a.floatB) + ' d'], ['', 'Latest start', dt.fmt(a.s + a.floatB)]])}"><rect class="hv" x="${x(a.s)}" y="${y + 8}" width="${Math.max(3, x(a.e + 1) - x(a.s))}" height="20" rx="3" fill="${col}" ${a.ll ? 'opacity=".95"' : ''}/></g>`;
        });
      });
      const vline = (d, col, label, dy, dash, anchor) => `<line x1="${x(d)}" x2="${x(d)}" y1="${top - 20}" y2="${top + ITEMS.length * rowH}" stroke="${col}" stroke-width="2" ${dash ? 'stroke-dasharray="5 4"' : ''}/><text x="${x(d) + (anchor === 'end' ? -4 : 4)}" y="${top - 24 + dy}" text-anchor="${anchor || 'start'}" style="font-size:10.5px;font-weight:700;fill:${col}">${label}</text>`;
      svg += vline(M.start, 'var(--c3)', 'NTP ' + dt.fmtShort(M.start), 0);
      svg += vline(P.latest, 'var(--bad)', 'Latest start ' + dt.fmtShort(P.latest), 12, true, 'end');
      svg += vline(P.start, 'var(--ph2)', 'Phase 2 start ' + dt.fmtShort(P.start), 0);
      svg += vline(M.base.finish, '#8a97a3', 'Baseline completion', 0, true, 'end');
      if (delay > 0) svg += vline(M.finish, 'var(--bad)', 'Completion ' + dt.fmtShort(M.finish), 12, false, 'end');
      svg += '</svg>';

      const rows = crit.map((a) => {
        const f = Math.round(a.floatB);
        const pill = f < 0 ? `<span class="pill bad">late ${-f} d</span>` : f === 0 ? '<span class="pill crit">critical</span>' : `<span class="pill warn">${f} d float</span>`;
        return `<tr class="act" data-act="${a.code}"><td><b style="color:var(--brand-d)">${a.code}</b></td><td style="max-width:300px;overflow:hidden;text-overflow:ellipsis">${F.esc(a.name)}${a.ll ? ' <span class="pill ll">long-lead</span>' : ''}</td><td>${dt.fmtShort(a.s)}</td><td><b>${dt.fmtShort(a.s + a.floatB)}</b></td><td class="num">${F.compact(a.amount)}</td><td>${pill}</td></tr>`;
      }).join('');

      return A.head('1c', 'Why Phase 2 must start with Phase 1', 'The Phase 2 packages that drive the completion date – move the Phase 2 start and see the consequences', 'Sheet 3 + Sheet 4 · gates & long-lead') +
        `<div class="s-body" style="gap:12px">
          <div class="panel"><div class="pb" style="padding:12px 16px">
            <div class="row" style="align-items:center;gap:14px;flex-wrap:wrap">
              <b style="color:var(--ph2)">Move the Phase 2 start (release)</b>
              <input type="date" class="dinput" style="width:150px;height:32px" value="${dt.iso(P.start)}" min="${dt.iso(M.start)}" data-chg="p2date">
              <input type="range" id="p2range" min="${lo}" max="${hi}" step="1" value="${off}" style="width:300px;accent-color:var(--ph2)" data-chg="p2range">
              <span id="p2lbl" style="min-width:210px;font-weight:700;color:${state[1]}">${F.days(off)} · ${state[0]}</span>
              <span class="seg" style="border:0;gap:6px;background:none">${pre('With Phase 1 (NTP)', M.start)}${pre('Baseline', P.baseStart)}${pre('+1 month', dt.addMonths(P.baseStart, 1))}${pre('+3 months', dt.addMonths(P.baseStart, 3))}${pre('+6 months', dt.addMonths(P.baseStart, 6))}</span>
              <button class="btn sm" data-do="p2reset">Reset</button>
            </div>
          </div></div>
          <div class="kpis" style="grid-template-columns:repeat(4,1fr)">
            ${kpi('Phase 2 start (release)', dt.fmt(P.start), `baseline ${dt.fmtShort(P.baseStart)} · ${F.deltaHtml(off)}`, 'alt')}
            ${kpi('Latest start to hold completion', dt.fmt(P.latest), P.latest - P.start >= 0 ? `${Math.round(P.latest - P.start)} days of margin left` : `<b style="color:var(--bad)">${Math.round(P.start - P.latest)} days too late</b>`, P.latest - P.start >= 0 ? '' : 'warn')}
            ${kpi('Project completion', dt.fmt(M.finish), delay > 0 ? `<span class="delta up">${F.days(delay)} vs baseline ${dt.fmtShort(M.base.finish)}</span>` : `<span class="delta zero">on baseline ${dt.fmtShort(M.base.finish)}</span>`, delay > 0 ? 'warn' : '')}
            ${kpi('Phase 2 amount granted by', dt.fmt(P.start - g2), `${g2} days before the Phase 2 start · Phase 2 value ${F.M(p2amt)} SAR`, '')}
          </div>
          <div class="row grow" style="gap:14px">
            <div class="panel" style="width:960px"><div class="ph"><h3>Phase 2 packages on the programme</h3><span class="sub">click a bar for details</span><div class="right legend" style="font-size:11px"><span><i class="dot" style="background:#f3a888"></i>Prequal. / PO</span><span><i class="dot" style="background:var(--proc)"></i>Manufacture &amp; delivery</span><span><i class="dot" style="background:var(--cons)"></i>Installation</span><span><i class="dot" style="background:#99a6b0;height:3px;vertical-align:3px"></i>Baseline</span></div></div><div class="pb" style="padding-top:0;overflow-x:auto;overflow-y:hidden">${svg}</div></div>
            <div class="panel grow"><div class="ph"><h3>Why it must start with Phase 1</h3></div><div class="pb scroll" style="font-size:13px;line-height:1.5;padding-top:0">
              ${A.ed('why:p2', WHY_TPL, whyTokens(M, P, g2, delay, trackF))}
            </div></div>
          </div>
          <div class="panel" style="max-height:190px;flex:none"><div class="ph"><h3>Critical Phase 2 activities that must start early</h3><span class="sub">float to the baseline completion ≤ 45 days · ${crit.length} of ${P.list.length} Phase 2 activities</span></div>
            <div class="pb scroll" data-keep="p2tbl" style="padding-top:0"><table class="tbl tight"><thead><tr><th>WBS</th><th>Activity</th><th>Start</th><th>Must start by</th><th class="num">SAR</th><th>Status</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="empty">No critical Phase 2 activity</td></tr>'}</tbody></table></div></div>
        </div>`;
    },
    after(el) {
      const r = el.querySelector('#p2range'), l = el.querySelector('#p2lbl');
      if (r && l) r.addEventListener('input', () => { const P = Z.phase2(A.s.M); l.textContent = dt.fmt(P.baseStart + (+r.value)) + ' (' + F.days(+r.value) + ')'; });
    },
  });
})(window);

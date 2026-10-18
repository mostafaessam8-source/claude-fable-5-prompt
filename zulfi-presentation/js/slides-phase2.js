/* Slide: why Phase 2 must start with Phase 1 – critical Phase 2 activities, the movable Phase 2 start milestone and scenarios */
(function (G) {
  const Z = G.Z, F = Z.F, dt = Z.dt, A = Z.app;
  const CTX = [['7.3', 'Railway Turnout (Phase 1)'], ['7.4', 'Signalling & Telecom (Phase 1)']];
  const ITEMS = [['7.2', 'Railway Track Works (2,500 m)'], ['3.3', 'Furniture, Fixtures & Equipment'], ['6.1', 'Station Road (1,700 m)'], ['4.3', 'Generator Room']];

  /* editable explanation: {tokens} are live values */
  const WHY_TPL = `<p style="margin:0 0 12px"><b>1 · Railway Track is the longest job.</b><br>8 months to manufacture &amp; deliver + 6 months to install – {trackFloat}.</p>
<p style="margin:0 0 12px"><b>2 · Design comes first.</b><br>Phase 2 buying starts after Detailed Design approval ({ddDate}), so these packages must be released together with Phase 1.</p>
<p style="margin:0 0 12px"><b>3 · Every day late = a day of delay.</b><br>Latest Phase 2 start to keep the completion date: <b>{latest}</b>{delayNow}.</p>
<p style="margin:0 0 12px"><b>4 · Signalling comes after Track &amp; Turnout.</b><br>{sigCheck}</p>
<p style="margin:0"><b>5 · Funds first.</b><br>Phase 2 amount must be granted by <b>{grantDate}</b> ({g2} days before the start).</p>`;
  const whyTokens = (M, P, g2, delay, trackF) => {
    const trk = P.list.filter((a) => a.item === '7.2').reduce((s, a) => s + a.amount, 0);
    return {
      trackAmt: F.M(trk), trackPct: F.pct(trk / M.total, 0),
      trackFloat: trackF < 0 ? `<b style="color:var(--bad)">${-Math.round(trackF)} d late</b>` : `<b>${Math.round(trackF)} d</b> float`,
      overlapMonths: F.months((Math.min(Math.max(...M.acts.filter((a) => a.phase === 'Phase 1' && a.code !== Z.AUTO).map((a) => a.e)), M.finish) + 1 - P.start) / 30.4375),
      p1Now: (() => { const l = M.acts.filter((a) => a.phase === 'Phase 1' && a.code !== Z.AUTO && a.s <= P.start && a.e >= P.start).sort((x, y) => y.amount - x.amount).slice(0, 3); return l.length ? l.map((a) => a.code + ' ' + a.name.split(' – ').pop()).join(', ') : 'construction'; })(),
      critList: [...new Set(P.list.filter((a) => a.floatB <= 45).map((a) => Z.ITEM_BY[a.item].name.replace(/ \(.*\)/, '')))].join(', '),
      sigAmt: F.M(M.acts.filter((a) => a.item === '7.4').reduce((q, a) => q + a.amount, 0)) + ' SAR',
      sigCheck: (() => {
        const g = (it) => M.acts.find((a) => a.item === it && a.kind === 'b'), sg = g('7.4'), tk = g('7.2'), tn = g('7.3');
        const gap = sg.s - Math.max(tk.s, tn.s);
        const base = 'Trackside equipment (point machines, axle counters, signals) can only be installed once Track &amp; Turnout are laid.';
        return gap >= 0 ? base : base + ` <b style="color:var(--bad)">⚠ Now planned ${-gap} days before Track &amp; Turnout</b> – move it after them, or start Phase 2 earlier.`;
      })(),
      ddDate: dt.fmtShort(M.by['2.6'].e), latest: dt.fmtShort(P.latest),
      delayNow: delay > 0 ? (A.isAr() ? ` (الآن <b style="color:var(--bad)">+${delay} يوم</b>)` : ` (now <b style="color:var(--bad)">${F.days(delay)}</b>)`) : '', g2, grantDate: dt.fmtShort(P.start - g2),
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

      // timeline: two clear periods (Phase 1 alone / both together), one bar per phase, then the Phase 2 packages
      const t0 = M.start - 5, t1 = Math.max(M.finish, M.base.finish) + 20, W = 940, L = 128, R = 14, rowH = 50, pkTop = 96;
      const x = (d) => L + ((d - t0) / (t1 - t0)) * (W - L - R);
      const P1 = M.acts.filter((a) => a.phase === 'Phase 1' && a.code !== Z.AUTO);
      const p1End = Math.max(...P1.map((a) => a.e)), ovEnd = Math.min(p1End, M.finish), bot = pkTop + ITEMS.length * rowH + 6;
      const q2 = { s: P.start, e: Math.max(...P.list.map((a) => a.e)) };
      const aMonths = (P.start - M.start) / 30.4375, bMonths = (ovEnd + 1 - P.start) / 30.4375;
      let svg = `<svg viewBox="0 0 ${W} ${bot + 36}" width="100%" style="min-width:760px;touch-action:pan-y" data-rl="1" data-t0="${t0}" data-t1="${t1}" data-w="${W}" data-l="${L}" data-r="${R}" data-bot="${bot}" data-pk="${pkTop}" data-rh="${rowH}" data-n="${ITEMS.length}">`;
      svg += `<rect id="hcol" x="0" y="32" width="10" height="${bot - 32}" fill="var(--brand)" opacity=".12" style="display:none" pointer-events="none"/><rect id="hrow" x="${L}" y="0" width="${W - L - R}" height="20" fill="var(--brand)" opacity=".10" style="display:none" pointer-events="none"/>`;
      svg += `<rect x="${x(P.start)}" y="32" width="${Math.max(0, x(ovEnd + 1) - x(P.start))}" height="${bot - 32}" fill="var(--ph2)" opacity=".06"/>`;
      for (let k = 0; k <= M.N; k += 3) { const d = M.bs[Math.min(k, M.N)]; svg += `<line x1="${x(d)}" x2="${x(d)}" y1="32" y2="${bot}" stroke="#e6ecf0"/><text x="${x(d)}" y="${bot + 14}" text-anchor="middle" style="font-size:10.5px">${dt.fmtMY(d)}</text>`; }
      // period header
      svg += `<rect x="${x(P.start)}" y="2" width="${Math.max(6, x(ovEnd + 1) - x(P.start))}" height="26" rx="5" fill="#e3def9"/><text x="${(x(P.start) + x(ovEnd + 1)) / 2}" y="19" text-anchor="middle" style="font-size:12px;font-weight:800;fill:#4a3bb3">Phase 1 + Phase 2 together · ${F.months(bMonths)} months</text>`;
      // one bar per phase
      svg += `<text x="0" y="50" style="font-size:12.5px;font-weight:800;fill:var(--ph1)">Phase 1</text><rect x="${x(M.start)}" y="36" width="${x(p1End + 1) - x(M.start)}" height="20" rx="4" fill="var(--ph1)"/><text x="${x(M.start) + 8}" y="50" style="fill:#fff;font-size:11px;font-weight:700">${dt.fmtShort(M.start)} → ${dt.fmtShort(p1End)}</text>`;
      svg += `<text x="0" y="74" style="font-size:12.5px;font-weight:800;fill:var(--ph2)">Phase 2</text><rect x="${x(q2.s)}" y="60" width="${Math.max(4, x(q2.e + 1) - x(q2.s))}" height="20" rx="4" fill="var(--ph2)"/><text x="${x(q2.s) + 8}" y="74" style="fill:#fff;font-size:11px;font-weight:700">${dt.fmtShort(q2.s)} → ${dt.fmtShort(q2.e)}</text>`;
      // Phase 2 packages
      ITEMS.forEach(([key, name], i) => {
        const y = pkTop + i * rowH, list = P.list.filter((a) => a.item === key), f = Math.min(...list.map((a) => a.floatB));
        const first = Math.min(...list.map((a) => a.s)), short = { '7.2': 'Railway Track', '3.3': 'FF&E (Furniture)', '6.1': 'Station Road', '4.3': 'Generator Room' }[key];
        svg += `<text x="0" y="${y + 17}" style="font-size:12px;font-weight:700;fill:var(--accent)">${key} ${short}</text>`;
        const early = f <= 45 && first <= P.start + 45;
        const lab = f < 0 ? `late ${-Math.round(f)} d` : early ? `MUST START BY ${dt.fmtShort(first + f)}` : f <= 45 ? 'critical – cannot slip' : `${Math.round(f)} d float`;
        const col = f < 0 ? 'var(--bad)' : f <= 0 ? 'var(--bad)' : f <= 45 ? 'var(--warn)' : 'var(--good)';
        if (early || f < 0) svg += `<text x="${x(first) - 6}" y="${y + 17}" text-anchor="end" style="font-size:11px;font-weight:800;fill:${col}">${lab} ▶</text>`;
        else svg += `<text x="${x(first) - 6}" y="${y + 17}" text-anchor="end" style="font-size:10.5px;font-weight:700;fill:${col}">${lab}</text>`;
        const last = Math.max(...list.map((a) => a.e)), codes = list.map((a) => a.code);
        svg += `<g class="hit" data-act="${list[0].code}" data-tip="${F.tip(key + ' ' + short, [['', 'Start', dt.fmt(first)], ['', 'Finish', dt.fmt(last)], ['', 'Float to baseline completion', Math.round(f) + ' d'], ['', 'Latest start', dt.fmt(first + f)]])}"><rect class="hv" x="${x(first)}" y="${y + 3}" width="${Math.max(3, x(last + 1) - x(first))}" height="18" rx="4" fill="${col}"/></g>`;
      });
      svg += `<line x1="${x(P.start)}" x2="${x(P.start)}" y1="30" y2="${bot}" stroke="var(--ph2)" stroke-width="2"/>`;
      if (delay > 0) svg += `<line x1="${x(M.finish)}" x2="${x(M.finish)}" y1="30" y2="${bot}" stroke="var(--bad)" stroke-width="2"/><text x="${x(M.finish) - 4}" y="${bot + 30}" text-anchor="end" style="font-size:10.5px;font-weight:800;fill:var(--bad);paint-order:stroke;stroke:#fff;stroke-width:3px">New completion ${dt.fmtShort(M.finish)} (${F.days(delay)})</text>`;
      svg += `<g id="hdate" style="display:none" pointer-events="none"><line id="hline" x1="0" x2="0" y1="30" y2="${bot}" stroke="var(--brand-d)" stroke-width="1"/><rect id="hbox" x="0" y="2" width="170" height="26" rx="6" fill="var(--brand-d)"/><text id="htxt" x="0" y="13" text-anchor="middle" style="fill:#fff;font-size:11.5px;font-weight:800"></text><text id="htxt2" x="0" y="24" text-anchor="middle" style="fill:#cfeef3;font-size:9.5px"></text></g>`;
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
              <b style="color:var(--ph2)">Move the Phase 2 start</b>
              <input type="date" class="dinput" style="width:150px;height:32px" value="${dt.iso(P.start)}" min="${dt.iso(M.start)}" data-chg="p2date">
              <input type="range" id="p2range" min="${lo}" max="${hi}" step="1" value="${off}" style="width:300px;accent-color:var(--ph2)" data-chg="p2range">
              <span id="p2lbl" style="min-width:210px;font-weight:700;color:${state[1]}">${F.days(off)} · ${state[0]}</span>
              <span class="seg" style="border:0;gap:6px;background:none">${pre('With Phase 1 (NTP)', M.start)}${pre('Baseline', P.baseStart)}${pre('+1 month', dt.addMonths(P.baseStart, 1))}${pre('+3 months', dt.addMonths(P.baseStart, 3))}${pre('+6 months', dt.addMonths(P.baseStart, 6))}</span>
              <button class="btn sm" data-do="p2reset">Reset</button>
            </div>
          </div></div>
          <div class="kpis" style="grid-template-columns:repeat(4,1fr)">
            ${kpi('Phase 2 start', dt.fmt(P.start), `baseline ${dt.fmtShort(P.baseStart)} · ${F.deltaHtml(off)}`, 'alt')}
            ${kpi('Latest start to hold completion', dt.fmt(P.latest), P.latest - P.start >= 0 ? `${Math.round(P.latest - P.start)} days of margin left` : `<b style="color:var(--bad)">${Math.round(P.start - P.latest)} days too late</b>`, P.latest - P.start >= 0 ? '' : 'warn')}
            ${kpi('Project completion', dt.fmt(M.finish), delay > 0 ? `<span class="delta up">${F.days(delay)} vs baseline ${dt.fmtShort(M.base.finish)}</span>` : `<span class="delta zero">on baseline ${dt.fmtShort(M.base.finish)}</span>`, delay > 0 ? 'warn' : '')}
            ${kpi('Phase 2 amount granted by', dt.fmt(P.start - g2), `${g2} days before the Phase 2 start · Phase 2 value ${F.M(p2amt)} SAR`, '')}
          </div>
          <div class="row grow" style="gap:14px">
            <div class="panel" style="width:960px"><div class="ph"><h3>Phase 2 packages on the programme</h3><span class="sub">click a bar for details</span></div><div class="pb" style="padding-top:0;overflow-x:auto;overflow-y:hidden">${svg}</div></div>
            <div class="panel grow"><div class="ph"><h3>Why it must start with Phase 1</h3></div><div class="pb scroll" style="font-size:13.5px;line-height:1.45;padding:6px 16px 0">
              ${A.ed('why:p2', WHY_TPL, whyTokens(M, P, g2, delay, trackF))}
            </div></div>
          </div>
        </div>`;
    },
    after(el) {
      const svg = el.querySelector('svg[data-rl]');
      if (svg) {
        const M0 = A.s.M, d = svg.dataset, t0 = +d.t0, t1 = +d.t1, W = +d.w, L = +d.l, Rr = +d.r, bot = +d.bot, pk = +d.pk, rh = +d.rh, n = +d.n;
        const q = (id) => svg.querySelector('#' + id), hrow = q('hrow'), hcol = q('hcol'), hd = q('hdate');
        const x = (day) => L + ((day - t0) / (t1 - t0)) * (W - L - Rr);
        const iso = (t) => (A.isAr() ? '\u2066\u2067' + A.tr(t) + '\u2069\u2069' : t);
        const hide = () => { hrow.style.display = hcol.style.display = hd.style.display = 'none'; };
        const show = (e) => {
          const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const p = pt.matrixTransform(svg.getScreenCTM().inverse());
          if (p.x < L || p.x > W - Rr || p.y < 30 || p.y > bot) { hide(); return; }
          const day = Math.round(t0 + ((p.x - L) / (W - L - Rr)) * (t1 - t0)), k = Math.max(0, Math.min(M0.N - 1, dt.bucketOf(M0.start, day)));
          const row = p.y >= pk ? [pk + Math.min(n - 1, Math.floor((p.y - pk) / rh)) * rh, rh] : p.y < 58 ? [36, 22] : [60, 22];
          hrow.setAttribute('y', row[0]); hrow.setAttribute('height', row[1]); hrow.style.display = '';
          const m0 = Math.max(M0.bs[k], t0), m1 = Math.min(M0.bs[k + 1], t1);
          hcol.setAttribute('x', x(m0)); hcol.setAttribute('width', Math.max(2, x(m1) - x(m0))); hcol.style.display = '';
          const lx = x(day), cx = Math.min(W - 87, Math.max(L + 2, lx));
          q('hline').setAttribute('x1', lx); q('hline').setAttribute('x2', lx);
          q('hbox').setAttribute('x', cx - 85); q('htxt').setAttribute('x', cx); q('htxt2').setAttribute('x', cx);
          q('htxt').textContent = iso(dt.fmt(day)); q('htxt2').textContent = A.L('Month ' + (k + 1) + ' of ' + M0.N, 'الشهر ' + (k + 1) + ' من ' + M0.N);
          hd.style.display = '';
        };
        svg.addEventListener('pointermove', show);
        svg.addEventListener('pointerdown', show);
        svg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
      }
      const r = el.querySelector('#p2range'), l = el.querySelector('#p2lbl');
      if (r && l) r.addEventListener('input', () => { const P = Z.phase2(A.s.M); l.textContent = dt.fmt(P.baseStart + (+r.value)) + ' (' + F.days(+r.value) + ')'; });
    },
  });
})(window);

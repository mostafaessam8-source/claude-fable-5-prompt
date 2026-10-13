/* Slide 6: interactive Gantt chart – edit dates inline, drag bars, links highlight */
(function (G) {
  const Z = G.Z, F = Z.F, dt = Z.dt, A = Z.app;
  const LW = { code: 88, name: 200, s: 118, e: 118, dur: 60 };
  const LEFT = LW.code + LW.name + LW.s + LW.e + LW.dur;
  const RH = 25, HH = 59;
  const ui = () => (A.s.ui.g = A.s.ui.g || { zoom: 'fit', collapsed: [], base: true });

  A.actions.phaseFilter = (el) => { const f = A.s.f; f.phase = f.phase === el.dataset.p ? 'all' : el.dataset.p; A.refilter(); };
  // always-on Phase 1 / Phase 2 summary (whole project, ignores the filters) – click to filter by that phase
  Z.phaseStrip = (M, compact) => {
    const cur = A.s.f.phase;
    return ['Phase 1', 'Phase 2'].map((p) => {
      const l = M.acts.filter((a) => a.phase === p), v = l.reduce((s, a) => s + a.amount, 0);
      const s0 = Math.min(...l.map((a) => a.s)), e0 = Math.max(...l.map((a) => a.e)), c = F.phaseColor(p);
      return `<div class="hit" data-do="phaseFilter" data-p="${p}" title="Click to show only ${p}" style="display:flex;align-items:center;gap:12px;border:2px solid ${cur === p ? c : 'var(--line)'};background:${cur === p ? 'var(--brand-xl)' : '#fff'};border-left:8px solid ${c};border-radius:12px;padding:${compact ? '8px 12px' : '8px 16px'};cursor:pointer;flex:1;min-width:0">
        <div><div style="font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:${c}">${p}</div><div style="font-size:${compact ? 17 : 20}px;font-weight:800;color:var(--accent)">${F.M(v)} <span style="font-size:12px;color:var(--ink2);font-weight:600">SAR · ${F.pct(M.total ? v / M.total : 0, 0)}</span></div></div>
        <div style="font-size:12px;color:var(--ink2);line-height:1.35;margin-left:auto;text-align:right">${l.length} activities<br>${dt.fmtShort(s0)} → ${dt.fmtShort(e0)}</div></div>`;
    }).join('');
  };

  A.actions.gZoom = (el) => { ui().zoom = el.dataset.z; A.refilter(); };
  A.actions.gBase = () => { ui().base = !ui().base; A.refilter(); };
  A.actions.gToggle = (el) => { const u = ui(), g = el.dataset.g, i = u.collapsed.indexOf(g); if (i >= 0) u.collapsed.splice(i, 1); else u.collapsed.push(g); A.refilter(); };
  A.actions.gExpand = () => { ui().collapsed = []; A.refilter(); };
  A.actions.gCollapse = () => { ui().collapsed = Z.GROUPS.map((g) => g.code); A.refilter(); };

  A.changes.gdate = (el) => {
    const a = A.s.M.by[el.dataset.code], d = dt.parse(el.value);
    if (!d) { A.refilter(); return; }
    let ns = a.s, ne = a.e;
    if (el.dataset.w === 's') ns = d; else ne = d;
    A.edit(a.code, ns, ne);
  };

  const dims = (M) => {
    const u = ui(), t0 = M.start, t1 = M.bs[M.N];
    const avail = 1512 - LEFT - 16;
    const tlW = u.zoom === 'fit' ? avail : M.N * (u.zoom === 'wide' ? 54 : 84);
    return { t0, t1, tlW, ppd: tlW / (t1 - t0) };
  };
  A.ganttDims = dims;

  Z.registerSlide({
    id: 'gantt', title: 'Gantt chart', desc: 'Edit dates · drag bars · dependencies',
    render(M) {
      const u = ui(), { t0, tlW, ppd } = dims(M);
      const x = (d) => (d - t0) * ppd;
      const vis = A.visList();
      // header
      let head = '';
      let y = dt.parts(M.start).y;
      for (let yr = y; yr <= dt.parts(M.bs[M.N]).y; yr++) {
        const a = Math.max(t0, dt.ymd(yr, 0, 1)), b = Math.min(M.bs[M.N], dt.ymd(yr + 1, 0, 1));
        if (b > a) head += `<div class="gyear" style="left:${x(a)}px;width:${(b - a) * ppd}px">${yr}</div>`;
      }
      let stripes = '';
      for (let k = 0; k < M.N; k++) {
        const l = x(M.bs[k]), w = (M.bs[k + 1] - M.bs[k]) * ppd;
        head += `<div class="gmonth hit" data-month="${k + 1}" style="left:${l}px;width:${w}px;top:25px;height:34px;line-height:15px;padding-top:3px" data-tip="${F.tip('Month ' + (k + 1), [['', 'From', dt.fmt(M.bs[k])], ['', 'To', dt.fmt(M.bs[k + 1] - 1)]])}">${w >= 38 ? dt.mon(M.bs[k]) : ''}<br><span style="color:var(--mute);font-size:10px">${w >= 22 ? 'M' + (k + 1) : ''}</span></div>`;
        if (k % 2 === 0) stripes += `<div class="gstripe" style="left:${l}px;width:${w}px"></div>`;
      }
      const status = A.s.ui.status;
      const stLine = (top) => (status && status >= t0 && status <= M.bs[M.N] ? `<div class="gline" style="left:${x(status)}px"><span>${dt.fmtShort(status)}</span></div>` : '');
      let rows = '';
      Z.GROUPS.forEach((g) => {
        const ga = vis.filter((a) => a.group === g.code); if (!ga.length) return;
        const col = u.collapsed.includes(g.code);
        const s = Math.min(...ga.map((a) => a.s)), e = Math.max(...ga.map((a) => a.e)), gv = ga.reduce((q, a) => q + a.amount, 0);
        rows += `<div class="grow2 grp" data-row="${g.code}"><div class="gleft" style="width:${LEFT}px;grid-template-columns:${LW.code}px ${LW.name}px ${LW.s}px ${LW.e}px ${LW.dur}px">
          <div><button class="tw" data-do="gToggle" data-g="${g.code}">${col ? '▸' : '▾'}</button></div>
          <div class="hit" data-grp="${g.code}" title="${F.esc(g.name)}" style="cursor:pointer">${g.code.replace('.0', '')} · ${F.esc(g.name)}</div><div>${dt.fmtShort(s)}</div><div>${dt.fmtShort(e)}</div><div style="text-align:right">${F.compact(gv)}</div></div>
          <div class="gtl" style="width:${tlW}px"><div class="gsum" style="left:${x(s)}px;width:${Math.max(3, (e + 1 - s) * ppd)}px"></div></div></div>`;
        if (col) return;
        ga.forEach((a) => {
          const w = Math.max(4, (a.e + 1 - a.s) * ppd), cls = ['gbar', a.ll ? 'll' : '', a.critical ? 'crit' : '', a.conflict ? 'conf' : ''].join(' ');
          const auto = a.code === Z.AUTO;
          const tip = F.tip(`${a.code} · ${F.esc(a.name)}`, [['', 'Start', dt.fmt(a.s)], ['', 'Finish', dt.fmt(a.e)], ['', 'Amount', F.sar(a.amount)], ['', 'Float', a.critical ? 'critical (0 d)' : Math.round(a.float) + ' d'], ...(a.changed ? [['', 'vs baseline', `${F.days(a.ds)} start / ${F.days(a.de)} finish`]] : [])]);
          rows += `<div class="grow2 ${A.s.drawer && A.s.drawer.type === 'act' && A.s.drawer.id === a.code ? 'sel' : ''}" data-row="${a.code}"><div class="gleft" style="width:${LEFT}px;grid-template-columns:${LW.code}px ${LW.name}px ${LW.s}px ${LW.e}px ${LW.dur}px">
            <div class="hit" data-act="${a.code}" style="color:var(--brand-d);font-weight:700;cursor:pointer;padding-left:10px;display:flex;align-items:center;gap:6px"><span style="width:6px;height:16px;border-radius:2px;flex:none;background:${F.phaseColor(a.phase)}" title="${a.phase}"></span>${a.code}<span class="pill ${a.phase === 'Phase 1' ? 'p1' : 'p2'}" style="font-size:10px;padding:0 5px">${a.phase === 'Phase 1' ? 'P1' : 'P2'}</span></div>
            <div class="hit" data-act="${a.code}" title="${F.esc(a.desc)}" style="cursor:pointer">${F.esc(a.name)}</div>
            <div><input type="date" class="dinput ${a.ds ? 'chg' : ''}" style="width:112px;height:21px;font-size:11.5px;padding:0 3px" value="${dt.iso(a.s)}" ${auto ? 'disabled title="Spans the whole project"' : ''} data-chg="gdate" data-code="${a.code}" data-w="s"></div>
            <div><input type="date" class="dinput ${a.de ? 'chg' : ''}" style="width:112px;height:21px;font-size:11.5px;padding:0 3px" value="${dt.iso(a.e)}" ${auto ? 'disabled' : ''} data-chg="gdate" data-code="${a.code}" data-w="e"></div>
            <div style="text-align:right;color:var(--ink2)">${F.months(a.dur / 30.4375)}m</div></div>
            <div class="gtl" style="width:${tlW}px">
              ${u.base && a.changed ? `<div class="gghost" style="left:${x(a.bs)}px;width:${Math.max(3, (a.be + 1 - a.bs) * ppd)}px"></div>` : ''}
              <div class="${cls}" data-act="${a.code}" data-code="${a.code}" ${auto ? 'data-fixed="1"' : ''} style="left:${x(a.s)}px;width:${w}px;background:${F.epcColor(a.epc)}" data-tip="${tip}">${auto ? '' : '<span class="h l"></span><span class="h r"></span>'}<span class="lab" style="${x(a.s) + w > tlW - 54 ? 'left:auto;right:calc(100% + 6px)' : ''}">${F.compact(a.amount)}</span></div>
            </div></div>`;
        });
      });
      const nRows = (rows.match(/class="grow2/g) || []).length;
      const zbtn = (z, t) => `<button data-do="gZoom" data-z="${z}" class="${u.zoom === z ? 'on' : ''}">${t}</button>`;
      return A.head('3', 'Schedule – Gantt chart', 'Type a new date, or drag a bar / its ends – dependent activities, S-curve and cash flow all update live', 'Sheet 3 · 26-Month Schedule') +
        `<div class="s-body" style="gap:10px">
          <div class="row" style="gap:12px;flex:none">${Z.phaseStrip(M, true)}</div>
          <div class="row" style="align-items:center;gap:14px;flex:none">
            <span class="seg">${zbtn('fit', 'Fit')}${zbtn('wide', 'Wide')}${zbtn('xwide', 'Extra wide')}</span>
            <button class="chip ${u.base ? 'on' : ''}" data-do="gBase">Show baseline</button>
            <button class="btn sm" data-do="gExpand">Expand groups</button><button class="btn sm" data-do="gCollapse">Collapse groups</button>
            <div class="legend" style="margin-left:auto">${Z.EPC.map((e) => `<span><i class="dot" style="background:${F.epcColor(e.key)}"></i>${{ GEN: 'General', ENG: 'Engineering', PROC: 'Procurement', CONS: 'Construction' }[e.key]}</span>`).join('')}
              <span><i class="dot" style="background:var(--ph1)"></i>Phase 1</span><span><i class="dot" style="background:var(--ph2)"></i>Phase 2</span><span><i class="dot" style="background:repeating-linear-gradient(135deg,#aaa 0 3px,#fff 3px 6px)"></i>Long-lead</span><span><i class="dot" style="border:2px solid var(--bad);background:#fff"></i>Critical</span><span><i class="dot" style="border:2px dashed #8a1fbf;background:#fff"></i>Logic conflict</span><span><i class="dot" style="background:#99a6b0;height:3px;vertical-align:3px"></i>Baseline</span></div>
          </div>
          <div class="gantt" data-keep="gantt" id="gantt"><div class="gwrap" style="width:${LEFT + tlW}px">
            <div class="ghead"><div class="gleft" style="width:${LEFT}px;height:${HH}px;grid-template-columns:${LW.code}px ${LW.name}px ${LW.s}px ${LW.e}px ${LW.dur}px;font-size:11.5px;font-weight:700;text-transform:uppercase;color:var(--ink2)"><div>WBS</div><div>Activity</div><div>Start</div><div>Finish</div><div style="text-align:right">Dur</div></div>
              <div class="gtl" style="width:${tlW}px;height:${HH}px">${head}${stLine()}</div></div>
            <div style="position:relative">${rows || '<div class="empty">No activities match the filters</div>'}
              <div style="position:absolute;left:${LEFT}px;top:0;width:${tlW}px;height:${nRows * RH}px;pointer-events:none">${stripes}${stLine()}</div></div>
          </div></div>
          <div class="hint">Linking mode: <b>${{ two: 'Auto-link – successors move with the activity', push: 'Push delays only', off: 'Off – activities move independently' }[M.st.link]}</b> (change it in the top bar). Edits that break a finish-to-start link are outlined in purple.</div>
        </div>`;
    },
    after(el) { bindGantt(el); },
  });

  /* ---------------------------------------------------- drag & hover */
  function bindGantt(root) {
    const g = root.querySelector('#gantt'); if (!g) return;
    const M = A.s.M, { ppd } = dims(M);
    let drag = null;
    g.addEventListener('pointerdown', (e) => {
      const bar = e.target.closest('.gbar'); if (!bar || bar.dataset.fixed || e.button !== 0) return;
      const a = M.by[bar.dataset.code];
      drag = { bar, a, x0: e.clientX, mode: e.target.classList.contains('l') ? 'l' : e.target.classList.contains('r') ? 'r' : 'm', moved: false, l0: parseFloat(bar.style.left), w0: parseFloat(bar.style.width), ds: 0, de: 0 };
      bar.setPointerCapture(e.pointerId); e.preventDefault();
    });
    g.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dd = Math.round((e.clientX - drag.x0) / A.scale / ppd);
      if (Math.abs(e.clientX - drag.x0) > 3) drag.moved = true;
      if (!drag.moved) return;
      const a = drag.a; let ds = 0, de = 0;
      if (drag.mode === 'm') { ds = dd; de = dd; } else if (drag.mode === 'l') { ds = Math.min(dd, a.e - a.s); } else { de = Math.max(dd, a.s - a.e); }
      ds = Math.max(ds, M.start - a.s);
      drag.ds = ds; drag.de = de;
      drag.bar.style.left = drag.l0 + ds * ppd + 'px';
      drag.bar.style.width = Math.max(4, drag.w0 + (de - ds) * ppd) + 'px';
      const tip = document.querySelector('#tip');
      tip.innerHTML = `<div class="t">${a.code} · ${F.esc(a.name)}</div><div class="r"><span>Start</span><b>${dt.fmt(a.s + ds)}</b></div><div class="r"><span>Finish</span><b>${dt.fmt(a.e + de)}</b></div><div class="r"><span>Duration</span><b>${a.e + de - a.s - ds + 1} d</b></div>`;
      tip.dataset.src = ''; tip.style.display = 'block';
      const r = document.querySelector('#stage').getBoundingClientRect();
      tip.style.left = (e.clientX - r.left) / A.scale + 14 + 'px'; tip.style.top = (e.clientY - r.top) / A.scale + 14 + 'px';
    });
    const end = (e) => {
      if (!drag) return;
      const d = drag; drag = null;
      document.querySelector('#tip').style.display = 'none';
      if (d.moved) {
        G.__ganttSuppress = true; setTimeout(() => (G.__ganttSuppress = false), 50);
        if (d.ds || d.de) A.edit(d.a.code, d.a.s + d.ds, d.a.e + d.de); else A.refilter();
      }
    };
    g.addEventListener('pointerup', end); g.addEventListener('pointercancel', end);
    // relationship highlight
    g.addEventListener('mouseover', (e) => {
      const row = e.target.closest('.grow2'); g.querySelectorAll('.rp,.rs').forEach((n) => n.classList.remove('rp', 'rs'));
      if (!row || row.classList.contains('grp')) return;
      const a = M.by[row.dataset.row]; if (!a) return;
      a.deps.forEach((c) => { const n = g.querySelector(`[data-row="${c}"]`); if (n) n.classList.add('rp'); });
      a.succ.forEach((c) => { const n = g.querySelector(`[data-row="${c}"]`); if (n) n.classList.add('rs'); });
    });
    g.addEventListener('mouseleave', () => g.querySelectorAll('.rp,.rs').forEach((n) => n.classList.remove('rp', 'rs')));
  }
  // block the drawer click that follows a drag
  document.addEventListener('click', (e) => { if (G.__ganttSuppress) { e.stopPropagation(); e.preventDefault(); } }, true);
})(window);

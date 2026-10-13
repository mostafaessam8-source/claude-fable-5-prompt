/* Detail drawer content: activity, WBS group, BOQ item, month, category */
(function (G) {
  const Z = G.Z, F = Z.F, dt = Z.dt, A = Z.app;
  const pill = (c, t) => `<span class="pill ${c}">${t}</span> `;
  const stat = (k, v, extra) => `<div class="dstat"><div class="k">${k}</div><div class="v">${v}</div>${extra || ''}</div>`;
  const listItem = (a, right) => `<div class="it" data-act="${a.code}"><span class="c">${a.code}</span><span class="n" title="${F.esc(a.desc)}">${F.esc(a.name)}</span><span class="a">${right}</span></div>`;

  A.actions.nudge = (el) => {
    const a = A.s.M.by[el.dataset.code], unit = el.dataset.u, n = +el.dataset.n;
    let ns, ne;
    if (unit === 'm') { ns = dt.addMonths(a.s, n); ne = dt.addMonths(a.e + 1, n) - 1; } else { ns = a.s + n; ne = a.e + n; }
    A.edit(a.code, ns, ne);
  };

  A.drawers.act = (code, M) => {
    const a = M.by[code]; if (!a) return null;
    const auto = code === Z.AUTO;
    const preds = a.deps.map((c) => M.by[c]), succs = a.succ.map((c) => M.by[c]);
    const sibs = a.item ? M.acts.filter((x) => x.item === a.item) : (a.kind === 'eng' ? M.acts.filter((x) => x.kind === 'eng') : []);
    const tags = pill(a.phase === 'Phase 1' ? 'p1' : 'p2', a.phase) + pill(a.epc, Z.EPC_BY[a.epc].name) + (a.ll ? pill('ll', 'Long-lead') : '') + (a.critical ? pill('crit', 'Critical path') : '') + (a.changed ? pill('warn', 'Moved vs baseline') : '');
    const nb = (u, n, t) => `<button class="btn sm" data-do="nudge" data-code="${code}" data-u="${u}" data-n="${n}">${t}</button>`;
    const dstart = F.deltaHtml(a.ds), dend = F.deltaHtml(a.de);
    const html = `
      <h4>Cost</h4>
      <div class="dgrid">${stat('Amount (excl. VAT)', F.n0(a.amount) + ' <small>SAR</small>')}${stat('% of project', F.pct(a.amount / M.total, 2))}${stat('Duration', F.months(a.dur / 30.4375) + ' <small>months</small>', `<div class="hint">${a.dur} days</div>`)}${stat('Float to completion', a.critical ? '0 d' : Math.round(a.float) + ' d', `<div class="hint">${a.critical ? 'on the critical path' : 'schedule slack'}</div>`)}</div>
      <h4>Schedule – edit dates</h4>
      <div class="datefield"><div><label>Start</label><input type="date" value="${dt.iso(a.s)}" ${auto ? 'disabled' : ''} data-chg="gdate" data-code="${code}" data-w="s"></div><div><label>Finish</label><input type="date" value="${dt.iso(a.e)}" ${auto ? 'disabled' : ''} data-chg="gdate" data-code="${code}" data-w="e"></div></div>
      ${auto ? '<div class="note info" style="margin-top:10px">Preliminaries are cost-loaded evenly across the whole project, so these dates follow the project start and the latest finish.</div>' : `
      <div class="nudge">${nb('d', -7, '− 1 week')}${nb('d', 7, '+ 1 week')}${nb('m', -1, '− 1 month')}${nb('m', 1, '+ 1 month')}${a.changed ? `<button class="btn sm danger" data-do="resetAct" data-code="${code}">Reset to baseline</button>` : ''}</div>
      <div class="hint" style="margin-top:8px">Moving shifts the whole activity. Linking mode: <b>${{ two: 'successors move with it', push: 'delays are pushed to successors', off: 'successors stay put' }[M.st.link]}</b>.</div>`}
      <div class="hint" style="margin-top:8px">Baseline: ${dt.fmtShort(a.bs)} → ${dt.fmtShort(a.be)}${a.changed ? ` · start ${dstart} · finish ${dend}` : ''}</div>
      ${a.conflict ? `<div class="note bad" style="margin-top:10px">Logic conflict: starts before predecessor ${a.conflictWith.join(', ')} allows.</div>` : ''}
      <h4>Predecessors (${preds.length})</h4>
      ${preds.length ? `<div class="dlist">${preds.map((p) => listItem(p, 'ends ' + dt.fmtShort(p.e))).join('')}</div>` : '<div class="hint">Project start – no predecessor.</div>'}
      <div class="hint" style="margin-top:6px">Logic from Excel: ${F.esc(a.pred || 'Project Start')}</div>
      <h4>Successors (${succs.length})</h4>
      ${succs.length ? `<div class="dlist">${succs.map((p) => listItem(p, 'starts ' + dt.fmtShort(p.s))).join('')}</div>` : '<div class="hint">No successors.</div>'}
      ${sibs.length > 1 ? `<h4>${a.item ? 'Item chain – ' + F.esc(Z.ITEM_BY[a.item].name) : 'Design stages'}</h4><div class="dlist">${sibs.map((s) => `<div class="it" data-act="${s.code}" style="${s.code === code ? 'background:var(--brand-l)' : ''}"><span class="c">${s.code}</span><span class="n">${F.esc(s.name.split(' – ').pop())}</span><span class="a">${F.compact(s.amount)} · ${dt.fmtShort(s.s)}</span></div>`).join('')}</div>` : ''}
      <h4>Monthly spend</h4>
      ${F.miniBars(a.m, { w: 500, h: 80, label: (i) => 'M' + (i + 1), tip: (i, v) => F.tip('Month ' + (i + 1), [['', 'Spend', F.sar(v)]]) })}
      <h4>Reference</h4>
      <div style="font-size:13px;line-height:1.55"><b>Description:</b> ${F.esc(a.desc)}<br><b>BOQ ref:</b> ${F.esc(a.boq || '–')} · <b>Unit:</b> ${F.esc(a.unit || '–')}</div>`;
    return { code: 'WBS ' + a.code, title: F.esc(a.name), tags, html };
  };

  const monthBars = (M, list) => { const t = new Array(M.N).fill(0); list.forEach((a) => a.m.forEach((v, k) => (t[k] += v))); return F.miniBars(t, { w: 500, h: 80, label: (i) => 'M' + (i + 1), attr: (i) => `data-month="${i + 1}"`, tip: (i, v) => F.tip('Month ' + (i + 1) + ' · ' + dt.fmtMY(M.bs[i]), [['', 'Spend', F.sar(v)]]) }); };

  A.drawers.grp = (code, M) => {
    const g = Z.GROUP_BY[code]; if (!g) return null;
    const list = M.acts.filter((a) => a.group === code), tot = list.reduce((s, a) => s + a.amount, 0);
    const s = Math.min(...list.map((a) => a.s)), e = Math.max(...list.map((a) => a.e));
    const epc = Z.EPC.map((x) => [x, list.filter((a) => a.epc === x.key).reduce((q, a) => q + a.amount, 0)]).filter((x) => x[1] > 0);
    const html = `<div class="dgrid">${stat('Group amount', F.n0(tot) + ' <small>SAR</small>')}${stat('% of project', F.pct(tot / M.total, 2))}${stat('Starts', dt.fmt(s))}${stat('Finishes', dt.fmt(e))}</div>
      <h4>Cost by EPC category</h4>${epc.map(([x, v]) => `<div style="display:flex;align-items:center;gap:10px;margin:5px 0;font-size:13px"><span style="width:150px">${x.name}</span><span style="flex:1;background:var(--soft);height:10px;border-radius:5px"><i style="display:block;height:10px;border-radius:5px;width:${(v / tot) * 100}%;background:${F.epcColor(x.key)}"></i></span><b style="width:90px;text-align:right">${F.M(v)}</b></div>`).join('')}
      <h4>Monthly spend</h4>${monthBars(M, list)}
      <h4>Activities (${list.length})</h4><div class="dlist">${list.map((a) => listItem(a, F.compact(a.amount))).join('')}</div>`;
    return { code: 'WBS group ' + code, title: F.esc(g.name), tags: pill('p1', list.filter((a) => a.phase === 'Phase 1').length + ' in Phase 1') + pill('p2', list.filter((a) => a.phase === 'Phase 2').length + ' in Phase 2'), html };
  };

  A.drawers.item = (key, M) => {
    const it = Z.ITEM_BY[key]; if (!it) return null;
    const list = M.acts.filter((a) => a.item === key), tot = list.reduce((s, a) => s + a.amount, 0);
    const mat = list.filter((a) => a.kind !== 'b').reduce((s, a) => s + a.amount, 0);
    const html = `<div class="dgrid">${stat('Item amount', F.n0(tot) + ' <small>SAR</small>')}${stat('% of project', F.pct(tot / M.total, 2))}${stat('Materials / procurement', F.pct(tot ? mat / tot : 0, 0), `<div class="hint">${F.M(mat)} SAR</div>`)}${stat('Construction', F.pct(tot ? 1 - mat / tot : 0, 0), `<div class="hint">${F.M(tot - mat)} SAR</div>`)}</div>
      <div class="hint" style="margin-top:8px">Discipline: <b>${Z.DISC[it.disc].name}</b> · BOQ ${F.esc(list[0].boq)} · ${list[0].phase}</div>
      <h4>Procurement → construction chain</h4><div class="dlist">${list.map((a) => `<div class="it" data-act="${a.code}"><span class="c">${a.code}</span><span class="n">${F.esc(a.name.split(' – ').pop())}</span><span class="a">${F.compact(a.amount)} · ${dt.fmtShort(a.s)} → ${dt.fmtShort(a.e)}</span></div>`).join('')}</div>
      <h4>Monthly spend</h4>${monthBars(M, list)}`;
    return { code: 'BOQ item ' + key, title: F.esc(it.full || it.name), tags: pill(list[0].phase === 'Phase 1' ? 'p1' : 'p2', list[0].phase) + (list.some((a) => a.ll) ? pill('ll', 'Long-lead') : ''), html };
  };

  A.drawers.month = (id, M) => {
    const k = +id - 1; if (k < 0 || k >= M.N) return null;
    const list = M.acts.filter(A.vis), agg = Z.aggregate(M, A.vis, 'group');
    const active = list.filter((a) => a.m[k] > 0.5).sort((a, b) => b.m[k] - a.m[k]);
    const tot = agg.total[k];
    const html = `<div class="dgrid">${stat('Spend in month', F.n0(tot) + ' <small>SAR</small>')}${stat('Cumulative', F.pct(agg.pct[k]), `<div class="hint">${F.M(agg.cum[k])} SAR</div>`)}${stat('Baseline cumulative', k < Z.BASE_MONTHS ? F.pct(baseP(M, list, k)) : '100.0%')}${stat('Active activities', active.length)}</div>
      <h4>Spend by WBS group</h4>${agg.keys.map((g) => ({ g, v: agg.map[g][k] })).filter((x) => x.v > 0.5).map((x) => `<div style="display:flex;align-items:center;gap:10px;margin:5px 0;font-size:13px;cursor:pointer" data-grp="${x.g}"><span style="width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><i class="dot" style="background:${F.groupColor(x.g)}"></i>${x.g.replace('.0', '')} ${F.esc(Z.GROUP_BY[x.g].name)}</span><span style="flex:1;background:var(--soft);height:10px;border-radius:5px"><i style="display:block;height:10px;border-radius:5px;width:${(x.v / tot) * 100}%;background:${F.groupColor(x.g)}"></i></span><b style="width:80px;text-align:right">${F.compact(x.v)}</b></div>`).join('')}
      <h4>Activities spending this month</h4><div class="dlist">${active.map((a) => listItem(a, F.compact(a.m[k]))).join('') || '<div class="it">No spend</div>'}</div>
      <div class="nudge" style="margin-top:14px">${k > 0 ? `<button class="btn sm" data-month="${k}">‹ Month ${k}</button>` : ''}${k < M.N - 1 ? `<button class="btn sm" data-month="${k + 2}">Month ${k + 2} ›</button>` : ''}</div>`;
    return { code: 'Month ' + (k + 1) + ' of ' + M.N, title: `${dt.fmt(M.bs[k])} → ${dt.fmt(M.bs[k + 1] - 1)}`, tags: A.filtered() ? pill('warn', 'filtered selection') : '', html };
  };
  const baseP = (M, list, k) => { const codes = new Set(list.map((a) => a.code)); let c = 0, t = 0; M.base.acts.forEach((a) => { if (codes.has(a.code)) { a.m.forEach((v, i) => { t += v; if (i <= k) c += v; }); } }); return t ? c / t : 0; };

  A.drawers.cat = (id, M) => {
    const [type, val] = id.split(':');
    let list, title, code;
    if (type === 'phase') { list = M.acts.filter((a) => a.phase === val); title = val; code = 'Phase'; }
    else if (type === 'epc') { list = M.acts.filter((a) => a.epc === val); title = Z.EPC_BY[val].name; code = 'EPC category ' + Z.EPC_BY[val].code; }
    else { const defs = [(a) => a.epc === 'ENG' || a.code === '1.2', (a) => a.code === '1.3', (a) => a.epc === 'PROC', (a) => a.epc === 'CONS']; list = M.acts.filter(defs[+val]); title = ['Design & approvals', 'Work permit gate', 'Procurement', 'Installation & construction'][+val]; code = 'Programme stage'; }
    if (!list.length) return null;
    const tot = list.reduce((s, a) => s + a.amount, 0), grp = Z.GROUPS.map((g) => [g, list.filter((a) => a.group === g.code).reduce((q, a) => q + a.amount, 0)]).filter((x) => x[1] > 0);
    const html = `<div class="dgrid">${stat('Amount', F.n0(tot) + ' <small>SAR</small>')}${stat('% of project', F.pct(tot / M.total, 2))}${stat('Starts', dt.fmt(Math.min(...list.map((a) => a.s))))}${stat('Finishes', dt.fmt(Math.max(...list.map((a) => a.e))))}</div>
      <h4>By WBS group</h4>${grp.map(([g, v]) => `<div style="display:flex;align-items:center;gap:10px;margin:5px 0;font-size:13px;cursor:pointer" data-grp="${g.code}"><span style="width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><i class="dot" style="background:${F.groupColor(g.code)}"></i>${g.code.replace('.0', '')} ${F.esc(g.name)}</span><span style="flex:1;background:var(--soft);height:10px;border-radius:5px"><i style="display:block;height:10px;border-radius:5px;width:${(v / tot) * 100}%;background:${F.groupColor(g.code)}"></i></span><b style="width:80px;text-align:right">${F.M(v)}</b></div>`).join('')}
      <h4>Monthly spend</h4>${monthBars(M, list)}
      <h4>Activities (${list.length})</h4><div class="dlist">${list.map((a) => listItem(a, F.compact(a.amount))).join('')}</div>`;
    return { code, title: F.esc(title), tags: '', html };
  };
})(window);

/* Slides 4-5: WBS structure (treemap, EPC) and the CBS register table */
(function (G) {
  const Z = G.Z, F = Z.F, dt = Z.dt, A = Z.app;

  /* ----------------------------------------------------- WBS structure */
  Z.registerSlide({
    id: 'wbs', title: 'WBS structure & cost', desc: 'Treemap, cumulative % and EPC Level-0',
    render(M) {
      const vis = A.visList(), tot = vis.reduce((s, a) => s + a.amount, 0), all = M.total;
      // leaf nodes: BOQ items + the two lump groups
      const nodes = {};
      vis.forEach((a) => {
        const key = a.item || a.group;
        const n = nodes[key] || (nodes[key] = { key, group: a.group, value: 0, count: 0, isItem: !!a.item });
        n.value += a.amount; n.count++;
      });
      const items = Object.values(nodes).map((n) => {
        const nm = n.isItem ? Z.ITEM_BY[n.key].name : Z.GROUP_BY[n.key].name;
        const code = n.isItem ? n.key : n.key.replace('.0', '.0');
        return {
          label: `${code} ${nm}`, short: code, value: n.value, color: F.groupColor(n.group),
          attrs: n.isItem ? `data-item="${n.key}"` : `data-grp="${n.key}"`, valText: F.M(n.value) + ' · ' + F.pct(tot ? n.value / tot : 0),
          tip: F.tip(`${code} ${nm}`, [[F.groupColor(n.group), 'Amount', F.sar(n.value)], ['', 'Share', F.pct(tot ? n.value / tot : 0)], ['', 'Activities', n.count], ['', 'Click', 'for breakdown']]),
        };
      });
      // groups cumulative table
      let cum = 0;
      const grows = Z.GROUPS.map((g) => {
        const v = vis.filter((a) => a.group === g.code).reduce((s, a) => s + a.amount, 0); cum += v;
        return `<tr class="act" data-grp="${g.code}"><td><i class="dot" style="background:${F.groupColor(g.code)}"></i><b>${g.code}</b></td><td style="max-width:190px;overflow:hidden;text-overflow:ellipsis" title="${F.esc(g.name)}">${F.esc(g.name)}</td><td class="num">${F.n0(v)}</td><td class="num">${F.pct(tot ? v / tot : 0)}</td><td class="num">${F.pct(tot ? cum / tot : 0)}</td></tr>`;
      }).join('');
      // EPC level 0
      const emax = Math.max(...Z.EPC.map((e) => vis.filter((a) => a.epc === e.key).reduce((s, a) => s + a.amount, 0)), 1);
      const erows = Z.EPC.map((e) => {
        const v = vis.filter((a) => a.epc === e.key).reduce((s, a) => s + a.amount, 0);
        return `<tr class="act" data-cat="epc:${e.key}"><td><b>${e.code}</b></td><td>${e.name}</td><td class="num">${F.n0(v)}</td><td class="num"><div class="bar-cell"><span class="b" style="width:${(v / emax) * 90}px;background:${F.epcColor(e.key)}"></span>${F.pct(tot ? v / tot : 0)}</div></td></tr>`;
      }).join('');
      return A.head('2', 'WBS &amp; CBS structure', 'Work breakdown structure sized by cost – click any block for its cost breakdown and schedule', 'Sheet 2 · WBS &amp; CBS') +
        `<div class="s-body"><div class="row grow">
          <div class="panel grow"><div class="ph"><h3>Cost treemap</h3><span class="sub">area = SAR amount, colour = WBS group</span>
            <div class="right"><div class="legend">${Z.GROUPS.map((g) => `<span><i class="dot" style="background:${F.groupColor(g.code)}"></i>${g.code.replace('.0', '')}</span>`).join('')}</div></div></div>
            <div class="pb" style="padding-top:2px">${items.length ? F.treemap(items, 980, 700) : '<div class="empty">No activities match the filters</div>'}</div></div>
          <div class="col" style="width:540px">
            <div class="panel"><div class="ph"><h3>Level-1 WBS groups</h3><span class="sub">SAR excl. VAT</span></div><div class="pb scroll" style="padding-top:0">
              <table class="tbl"><thead><tr><th>WBS</th><th>Group</th><th class="num">Amount</th><th class="num">%</th><th class="num">Cum. %</th></tr></thead><tbody>${grows}</tbody>
              <tfoot><tr><td></td><td>Total</td><td class="num">${F.n0(tot)}</td><td class="num">${F.pct(all ? tot / all : 0)}</td><td></td></tr></tfoot></table></div></div>
            <div class="panel"><div class="ph"><h3>EPC Level-0 summary</h3><span class="sub">General · Engineering · Procurement · Construction</span></div><div class="pb" style="padding-top:0">
              <table class="tbl"><thead><tr><th>Code</th><th>Category</th><th class="num">Amount</th><th class="num">%</th></tr></thead><tbody>${erows}</tbody></table></div></div>
          </div></div></div>`;
    },
  });

  /* ------------------------------------------------------- CBS register */
  const COLS = [
    ['code', 'WBS', (a) => a.idx], ['desc', 'Description', (a) => a.desc], ['boq', 'BOQ ref', (a) => a.boq || ''], ['phase', 'Phase', (a) => a.phase],
    ['amount', 'Amount (SAR)', (a) => a.amount, 'num'], ['pct', '% total', (a) => a.amount, 'num'], ['cum', 'Cum. %', null, 'num'], ['ll', 'Long-lead', (a) => (a.ll ? 1 : 0)],
    ['epc', 'EPC', (a) => a.epc], ['s', 'Start', (a) => a.s], ['e', 'Finish', (a) => a.e], ['pred', 'Predecessor / logical link', (a) => a.pred || ''],
  ];
  const ui = () => (A.s.ui.reg = A.s.ui.reg || { col: 'code', dir: 1, collapsed: [] });

  A.actions.regSort = (el) => { const r = ui(); const c = el.dataset.col; if (r.col === c) r.dir = -r.dir; else { r.col = c; r.dir = c === 'amount' || c === 'pct' ? -1 : 1; } A.refilter(); };
  A.actions.regToggle = (el) => { const r = ui(), g = el.dataset.g, i = r.collapsed.indexOf(g); if (i >= 0) r.collapsed.splice(i, 1); else r.collapsed.push(g); A.refilter(); };
  A.actions.regExpand = () => { ui().collapsed = []; A.refilter(); };
  A.actions.regCollapse = () => { ui().collapsed = Z.GROUPS.map((g) => g.code); A.refilter(); };

  Z.registerSlide({
    id: 'wbsreg', title: 'CBS register', desc: 'Sortable cost breakdown with live dates',
    render(M) {
      const r = ui(), vis = A.visList(), tot = vis.reduce((s, a) => s + a.amount, 0);
      const grouped = r.col === 'code' && r.dir === 1;
      const colDef = COLS.find((c) => c[0] === r.col);
      let list = vis.slice();
      if (!grouped && colDef && colDef[2]) list.sort((a, b) => { const x = colDef[2](a), y = colDef[2](b); return (x < y ? -1 : x > y ? 1 : a.idx - b.idx) * r.dir; });
      else if (r.col === 'code' && r.dir === -1) list.reverse();
      let run = 0; const dtxt = (a, w) => `<td ${a.changed ? 'style="background:#fff7e0"' : ''}>${dt.fmtShort(a[w])}</td>`;
      const row = (a) => {
        run += a.amount;
        return `<tr class="act" data-act="${a.code}"><td><b style="color:var(--brand-d)">${a.code}</b></td><td style="max-width:340px;overflow:hidden;text-overflow:ellipsis" title="${F.esc(a.desc)}">${F.esc(a.desc)}${a.critical ? ' <i class="dot" style="background:var(--bad);margin:0 0 0 4px" title="On the critical path"></i>' : ''}</td><td>${a.boq || ''}</td><td><span class="pill ${a.phase === 'Phase 1' ? 'p1' : 'p2'}">${a.phase}</span></td><td class="num">${F.n0(a.amount)}</td><td class="num"><div class="bar-cell"><span class="b" style="width:${Math.min(60, (a.amount / M.total) * 1400)}px"></span>${F.pct(a.amount / M.total, 2)}</div></td><td class="num">${F.pct(M.total ? run / M.total : 0)}</td><td>${a.ll ? '<span class="pill ll">Yes</span>' : '<span class="muted">No</span>'}</td><td><span class="pill ${a.epc}">${a.epc}</span></td>${dtxt(a, 's')}${dtxt(a, 'e')}<td style="max-width:330px;overflow:hidden;text-overflow:ellipsis" title="${F.esc(a.pred || '')}">${F.esc(a.pred || '')}</td></tr>`;
      };
      let body = '';
      if (grouped) {
        Z.GROUPS.forEach((g) => {
          const ga = list.filter((a) => a.group === g.code); if (!ga.length) return;
          const gv = ga.reduce((s, a) => s + a.amount, 0), col = r.collapsed.includes(g.code);
          body += `<tr class="g" data-grp="${g.code}" style="cursor:pointer"><td><button class="tw" data-do="regToggle" data-g="${g.code}">${col ? '▸' : '▾'}</button> ${g.code}</td><td colspan="3">${F.esc(g.name)} <span class="muted" style="font-weight:500">· ${ga.length} activities</span></td><td class="num">${F.n0(gv)}</td><td class="num">${F.pct(gv / M.total, 2)}</td><td></td><td colspan="2"></td><td>${dt.fmtShort(Math.min(...ga.map((a) => a.s)))}</td><td>${dt.fmtShort(Math.max(...ga.map((a) => a.e)))}</td><td></td></tr>`;
          if (col) run += gv; else body += ga.map(row).join('');
        });
      } else body = list.map(row).join('');
      const head = COLS.map((c) => `<th class="${c[3] || ''} ${c[2] ? 'sort' : ''}" ${c[2] ? `data-do="regSort" data-col="${c[0]}"` : ''}>${c[1]}${r.col === c[0] ? (r.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('');
      return A.head('2b', 'CBS register', 'Every WBS line with cost, % of total, cumulative % and its live schedule dates', 'Sheet 2 · WBS &amp; CBS') +
        `<div class="s-body"><div class="panel grow"><div class="ph"><h3>Cost breakdown register</h3><span class="sub">click a header to sort · click a row for details · payment terms: ${M.pay.pct}% advance at NTP (SAR ${F.n0(M.pay.amount)}), recovered in equal monthly deductions</span>
          <div class="right"><button class="btn sm" data-do="regExpand">Expand all</button><button class="btn sm" data-do="regCollapse">Collapse all</button></div></div>
          <div class="pb scroll" data-keep="reg" style="padding:0 0 0"><table class="tbl"><thead><tr>${head}</tr></thead><tbody>${body || '<tr><td colspan="12" class="empty">No activities match the filters</td></tr>'}</tbody>
          <tfoot><tr><td colspan="12">Total excl. VAT: <b>${F.n0(tot)}</b> SAR &nbsp;·&nbsp; VAT 15%: <b>${F.n0(tot * Z.VAT)}</b> &nbsp;·&nbsp; Total incl. VAT: <b>${F.n0(tot * (1 + Z.VAT))}</b> SAR &nbsp;·&nbsp; ${vis.length} lines</td></tr></tfoot></table></div></div></div>`;
    },
  });
})(window);

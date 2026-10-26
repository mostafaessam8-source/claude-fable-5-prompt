/* P6 Web – Project Controls Dashboard window (SAR-style template). All text is English by design.
   Charts are plain SVG; every chart element, KPI and table row opens a detailed drill-down. */
(function (g) {
  'use strict';
  const P6 = g.P6, App = g.App, D = App.dialogs, DA = P6.dash;
  const esc = P6.esc;
  const C = { teal: '#00778B', dark: '#3D3935', light: '#E5F1F3', mid: '#7FB7C2', grey: '#8C8C8C', red: '#C0392B', amber: '#D98E04', green: '#2E8B57', orange: '#E67E22', line: '#D5DADD' };
  const F = () => (App.cfg.dash = Object.assign(DA.defaults(), App.cfg.dash || {}));
  const GC = () => (App.cfg.dashG = Object.assign({ mode: 'crit', n: 40 }, App.cfg.dashG || {}));
  const fd = DA.fmt, n0 = (v) => (v == null || !isFinite(v) ? '–' : Math.round(v).toLocaleString('en-US')), n1 = (v) => (v == null || !isFinite(v) ? '–' : v.toFixed(1)), n2 = (v) => (v == null || !isFinite(v) ? '–' : v.toFixed(2));
  const pc = (v) => (v == null ? '–' : v.toFixed(1) + '%');
  let A = null, P = null, ROOT = null; // current analysis, project, root element
  const SEL = {};                       // drill-down registry: key -> function
  let oosFix = {};
  const stName = { NS: 'Not Started', IP: 'In Progress', C: 'Completed' };
  const stCol = { NS: '#9aa5ab', IP: C.teal, C: C.green };
  const spiCol = (v) => (v == null ? C.grey : v >= 1 ? C.green : v >= 0.9 ? C.amber : C.red);
  const wbsOf = (t) => P.wbs.find((w) => w.id === t.wbs) || {};
  const prim = (t) => { const a = P.asg.find((q) => q.task === t.id); const r = a && P.rsrc.find((x) => x.id === a.rsrc); return r ? r.name : ''; };

  // ---------- small UI helpers ----------
  function tbl(cols, rows, o) {
    o = o || {};
    const head = cols.map((c) => `<th${c.w ? ` style="min-width:${c.w}px"` : ''}${c.al ? ` class="${c.al}"` : ''}>${esc(c.h)}</th>`).join('');
    const body = rows.slice(0, o.max || 400).map((r, i) => `<tr${o.rowAttr ? ' ' + o.rowAttr(r, i) : ''}${o.cls ? ` class="${o.cls(r)}"` : ''}>${cols.map((c) => { const v = c.get(r, i); return `<td${c.al ? ` class="${c.al}"` : ''}>${c.raw ? v : esc(v == null ? '' : v)}</td>`; }).join('')}</tr>`).join('');
    return `<div class="dsh-tw"><table class="dsh-t"><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${cols.length}" class="dsh-empty">No records</td></tr>`}</tbody></table></div>${rows.length > (o.max || 400) ? `<div class="dsh-note">Showing the first ${o.max || 400} of ${rows.length} rows</div>` : ''}`;
  }
  const chip = (txt, col) => `<span class="dsh-chip" style="background:${col}1f;color:${col};border-color:${col}66">${esc(txt)}</span>`;
  const sevChip = (s) => chip(['', 'Very Low', 'Low', 'Medium', 'High', 'Critical'][s] || s, [C.grey, C.grey, C.green, C.amber, C.orange, C.red][s] || C.grey);
  const ratChip = (r) => chip(r, { Low: C.green, Medium: C.amber, High: C.orange, Extreme: C.red }[r]);
  const goBtn = (t) => `<a class="dsh-go" data-go="${t.id}" title="Open in Activities">Open ▸</a>`;
  const actCols = () => [
    { h: 'Activity ID', get: (t) => t.code, w: 90 }, { h: 'Activity Name', get: (t) => t.name, w: 260 }, { h: 'WBS', get: (t) => wbsOf(t).code || '', w: 90 },
    { h: 'Status', get: (t) => chip(stName[t.status], stCol[t.status]), raw: 1 }, { h: '%', get: (t) => (t.status === 'C' ? 100 : t.pct || 0), al: 'r' },
    { h: 'Start', get: (t) => fd(t.es), al: 'r' }, { h: 'Finish', get: (t) => fd(t.ef), al: 'r' }, { h: 'BL Finish', get: (t) => fd(t.bf), al: 'r' },
    { h: 'Float', get: (t) => (t.tf == null ? '' : `<b style="color:${t.tf < 0 ? C.red : t.tf === 0 ? C.orange : C.dark}">${t.tf}</b>`), raw: 1, al: 'r' },
    { h: 'SPI', get: (t) => { const x = A.k.taskSpi.get(t.id); return x && x.spi != null ? `<b style="color:${spiCol(x.spi)}">${x.spi.toFixed(2)}</b>` : ''; }, raw: 1, al: 'r' }, { h: '', get: (t) => goBtn(t), raw: 1 }
  ];
  const actTable = (list) => tbl(actCols(), list, { cls: (t) => (t.crit && t.status !== 'C' ? 'crit' : '') });
  const kv = (rows) => `<div class="dsh-kv">${rows.map(([k, v, col]) => `<div><span>${esc(k)}</span><b${col ? ` style="color:${col}"` : ''}>${esc(v)}</b></div>`).join('')}</div>`;

  function detail(title, sub, body, extra) {
    const m = D.modal({ title, cls: 'wide dsh-modal', body: `<div class="dsh-dm" dir="ltr">${sub ? `<div class="dsh-sub">${sub}</div>` : ''}${body}</div>`, buttons: [{ label: 'Copy table', fn: (c, el) => { copyTable(el); return false; } }, { label: 'Close', cls: 'pri', fn: () => {} }].concat(extra || []) });
    m.el.addEventListener('click', (e) => { const go = e.target.closest('[data-go]'); if (go) { m.close(); goTo(+go.dataset.go); } const dd = e.target.closest('[data-card]'); if (dd) { m.close(); actCard(+dd.dataset.card); } });
    return m;
  }
  function copyTable(el) {
    const t = (el.querySelector('.dsh-t')); if (!t) return App.toast('No table to copy', true);
    const text = [...t.querySelectorAll('tr')].map((r) => [...r.children].map((c) => c.innerText.replace(/\s+/g, ' ').trim()).join('\t')).join('\r\n');
    navigator.clipboard.writeText(text).then(() => App.toast('Table copied – paste into Excel'));
  }
  function goTo(id) { App.showWin('activities'); setTimeout(() => { const k = 't' + id; if (!App.rowIdx.has(k)) return App.toast('Activity is hidden by the current Activities filter', true); App.setSel([k]); App.ensureVisible(App.rowIdx.get(k)); }, 60); }

  function actCard(id) {
    const t = P.tasks.find((x) => x.id === id); if (!t) return;
    const x = A.k.taskSpi.get(id) || {}, by = new Map(P.tasks.map((q) => [q.id, q]));
    const pr = P.rels.filter((r) => r.s === id), su = P.rels.filter((r) => r.p === id);
    const rt = (list, side) => tbl([{ h: 'Activity', get: (r) => (by.get(side === 'p' ? r.p : r.s) || {}).code }, { h: 'Name', get: (r) => (by.get(side === 'p' ? r.p : r.s) || {}).name, w: 240 }, { h: 'Type', get: (r) => r.type }, { h: 'Lag', get: (r) => r.lag, al: 'r' }, { h: 'Status', get: (r) => stName[(by.get(side === 'p' ? r.p : r.s) || {}).status] }, { h: 'Finish', get: (r) => fd((by.get(side === 'p' ? r.p : r.s) || {}).ef), al: 'r' }], list);
    const as = P.asg.filter((a) => a.task === id).map((a) => { const r = P.rsrc.find((q) => q.id === a.rsrc); return r ? `${r.name} (${a.qty} h)` : ''; }).filter(Boolean).join(', ') || '–';
    const planCal = t.bs != null && t.bf != null ? t.bf - t.bs + 1 : null, actCal = t.as != null ? (t.af != null ? t.af : P.dataDate) - t.as + 1 : null;
    detail(`${t.code} – ${t.name}`, `${chip(stName[t.status], stCol[t.status])} ${t.crit && t.status !== 'C' ? chip('Critical', C.red) : ''} ${chip('WBS ' + (wbsOf(t).code || ''), C.teal)}`,
      kv([['Planned start (BL)', fd(t.bs) || '–'], ['Planned finish (BL)', fd(t.bf) || '–'], ['Current start', fd(t.es)], ['Current finish', fd(t.ef)], ['Actual start', fd(t.as) || '–'], ['Actual finish', fd(t.af) || '–'],
        ['% complete', (t.status === 'C' ? 100 : t.pct || 0) + '%'], ['Original duration', (t.dur != null ? t.dur : '–') + ' d'], ['Remaining duration', (t.status === 'C' ? 0 : t.rem != null ? t.rem : '–') + ' d'], ['Total float', t.tf == null ? '–' : t.tf + ' d', t.tf < 0 ? C.red : null], ['Free float', t.ff == null ? '–' : t.ff + ' d'],
        ['Start variance vs BL', t.bs != null && t.es != null ? t.es - t.bs + ' d' : '–'], ['Finish variance vs BL', t.bf != null && t.ef != null ? t.ef - t.bf + ' d' : '–', t.bf != null && t.ef > t.bf ? C.red : null], ['SPI', x.spi != null ? x.spi.toFixed(2) : '–', spiCol(x.spi)],
        ['Planned calendar days', planCal != null ? planCal + ' d' : '–'], ['Actual / elapsed days', actCal != null ? actCal + ' d' : '–', actCal && planCal && actCal > planCal * 1.5 ? C.red : null], ['Constraint', t.ct || 'None'], ['Calendar', (P.cals.find((c) => c.id === t.cal) || {}).name || '–'], ['Resources', as]]) +
      `<h4>Predecessors (${pr.length})</h4>${rt(pr, 'p')}<h4>Successors (${su.length})</h4>${rt(su, 's')}<p><a class="dsh-go" data-go="${t.id}">Open in Activities ▸</a></p>`);
  }

  // ---------- SVG chart helpers ----------
  const niceMax = (v) => { if (!(v > 0)) return 1; const e = Math.pow(10, Math.floor(Math.log10(v))), m = v / e; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * e; };
  function axisFrame(W, H, L, R, T, Bm) { return { W, H, L, R, T, B: Bm, iw: W - L - R, ih: H - T - Bm }; }
  function tipAttr(s) { return ` data-tip="${esc(s)}"`; }
  function lineChart(o) {
    const f = axisFrame(o.W || 900, o.H || 320, 52, 18, 16, 38), n = o.B.length, x0 = o.B[0], x1 = o.B[n - 1];
    const X = (d) => f.L + ((d - x0) / Math.max(1, x1 - x0)) * f.iw, Y = (v) => f.T + f.ih - (v / o.yMax) * f.ih;
    let s = `<svg viewBox="0 0 ${f.W} ${f.H}" class="dsh-svg" preserveAspectRatio="xMidYMid meet">`;
    for (let i = 0; i <= 5; i++) { const v = (o.yMax * i) / 5, y = Y(v); s += `<line x1="${f.L}" x2="${f.W - f.R}" y1="${y}" y2="${y}" stroke="${C.line}"/><text x="${f.L - 8}" y="${y + 4}" text-anchor="end" class="ax">${o.yFmt ? o.yFmt(v) : Math.round(v)}</text>`; }
    const step = Math.max(1, Math.ceil(n / 11));
    o.B.forEach((d, i) => { if (i % step === 0) s += `<line x1="${X(d)}" x2="${X(d)}" y1="${f.T + f.ih}" y2="${f.T + f.ih + 4}" stroke="${C.grey}"/><text x="${X(d)}" y="${f.H - 18}" text-anchor="middle" class="ax">${esc(DA.lbl(d, o.gran))}</text>`; });
    for (const r of o.ref || []) { const y = Y(r.y); s += `<line x1="${f.L}" x2="${f.W - f.R}" y1="${y}" y2="${y}" stroke="${r.color}" stroke-dasharray="5 4" stroke-width="1.5"/><text x="${f.W - f.R - 4}" y="${y - 4}" text-anchor="end" class="ax" fill="${r.color}">${esc(r.label)}</text>`; }
    for (const z of o.zones || []) { const ya = Y(z.to), yb = Y(z.from); s += `<rect x="${f.L}" y="${ya}" width="${f.iw}" height="${yb - ya}" fill="${z.color}" opacity=".07"/>`; }
    for (const se of o.series) {
      const pts = o.B.map((d, i) => (se.vals[i] == null ? null : [X(d), Y(Math.min(o.yMax, se.vals[i]))]));
      let path = '', pen = false; pts.forEach((p) => { if (!p) { pen = false; return; } path += (pen ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); pen = true; });
      if (se.area) { const ok = pts.filter(Boolean); if (ok.length > 1) s += `<path d="M${ok[0][0]} ${Y(0)}L${ok.map((p) => p[0] + ' ' + p[1]).join('L')}L${ok[ok.length - 1][0]} ${Y(0)}Z" fill="${se.color}" opacity=".12"/>`; }
      s += `<path d="${path}" fill="none" stroke="${se.color}" stroke-width="${se.w || 2.4}"${se.dash ? ` stroke-dasharray="${se.dash}"` : ''} stroke-linejoin="round"/>`;
    }
    if (o.vline != null) { const x = X(o.vline.x); s += `<line x1="${x}" x2="${x}" y1="${f.T}" y2="${f.T + f.ih}" stroke="${C.red}" stroke-dasharray="4 3" stroke-width="1.5"/><text x="${x + 5}" y="${f.T + 11}" class="ax" fill="${C.red}" font-weight="700">${esc(o.vline.label)}</text>`; }
    const bw = f.iw / Math.max(1, n - 1);
    o.B.forEach((d, i) => { const tip = `<b>${DA.lbl(d, o.gran)}</b>` + o.series.filter((se) => se.vals[i] != null).map((se) => `<br><span style='color:${se.color}'>●</span> ${se.name}: <b>${o.vFmt ? o.vFmt(se.vals[i]) : se.vals[i].toFixed(1)}</b>`).join(''); s += `<rect class="hit" x="${X(d) - bw / 2}" y="${f.T}" width="${bw}" height="${f.ih}" fill="transparent" data-d="${o.drill}:${i}"${tipAttr(tip)}/>`; });
    return s + '</svg>' + legend(o.series.map((se) => [se.name, se.color, se.dash]));
  }
  const legend = (items) => `<div class="dsh-leg">${items.map(([n, c, d]) => `<span><i style="background:${d ? 'transparent' : c};border:2px ${d ? 'dashed' : 'solid'} ${c}"></i>${esc(n)}</span>`).join('')}</div>`;
  function barChart(o) {
    const f = axisFrame(o.W || 900, o.H || 300, 56, 18, 16, 44), n = o.cats.length;
    let ym = o.yMax || niceMax(Math.max(...o.cats.map((c) => c.stack.reduce((a, b) => a + b.v, 0)), ...(o.line || []).map((v) => v || 0), 0.0001) * 1.05);
    const Y = (v) => f.T + f.ih - (v / ym) * f.ih, bw = f.iw / Math.max(1, n), gap = Math.min(6, bw * 0.2);
    let s = `<svg viewBox="0 0 ${f.W} ${f.H}" class="dsh-svg">`;
    for (let i = 0; i <= 5; i++) { const v = (ym * i) / 5, y = Y(v); s += `<line x1="${f.L}" x2="${f.W - f.R}" y1="${y}" y2="${y}" stroke="${C.line}"/><text x="${f.L - 8}" y="${y + 4}" text-anchor="end" class="ax">${o.yFmt ? o.yFmt(v) : Math.round(v)}</text>`; }
    const step = Math.max(1, Math.ceil(n / 14));
    o.cats.forEach((c, i) => {
      let acc = 0; const x = f.L + i * bw + gap / 2;
      for (const sg of c.stack) { if (sg.v > 0) { const y1 = Y(acc + sg.v), y0 = Y(acc); s += `<rect x="${x}" y="${y1}" width="${Math.max(1, bw - gap)}" height="${Math.max(0.5, y0 - y1)}" fill="${sg.color}"${sg.op ? ` opacity="${sg.op}"` : ''}/>`; } acc += sg.v; }
      if (i % step === 0) s += `<text x="${x + (bw - gap) / 2}" y="${f.H - 24}" text-anchor="middle" class="ax">${esc(c.label)}</text>`;
      s += `<rect class="hit" x="${f.L + i * bw}" y="${f.T}" width="${bw}" height="${f.ih}" fill="transparent" data-d="${o.drill}:${i}"${tipAttr(c.tip || '')}/>`;
    });
    if (o.line) { let d = '', pen = false; o.line.forEach((v, i) => { if (v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + (f.L + i * bw + bw / 2).toFixed(1) + ' ' + Y(v).toFixed(1); pen = true; }); s += `<path d="${d}" fill="none" stroke="${o.lineColor || C.dark}" stroke-width="2.2" stroke-dasharray="6 4"/>`; }
    if (o.vline != null) { const x = f.L + o.vline.i * bw + bw; s += `<line x1="${x}" x2="${x}" y1="${f.T}" y2="${f.T + f.ih}" stroke="${C.red}" stroke-dasharray="4 3" stroke-width="1.5"/><text x="${x + 5}" y="${f.T + 11}" class="ax" fill="${C.red}" font-weight="700">${esc(o.vline.label)}</text>`; }
    return s + '</svg>' + (o.legend ? legend(o.legend) : '');
  }
  function donut(parts, label, sub) {
    const tot = parts.reduce((a, b) => a + b.v, 0) || 1, R = 70, r = 46, cx = 90, cy = 90; let a0 = -Math.PI / 2, s = `<svg viewBox="0 0 180 180" class="dsh-donut">`;
    parts.forEach((pt, i) => {
      if (!pt.v) return; const a1 = a0 + (pt.v / tot) * Math.PI * 2, big = a1 - a0 > Math.PI ? 1 : 0;
      const p = (rad, a) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
      if (pt.v === tot) { s += `<circle cx="${cx}" cy="${cy}" r="${(R + r) / 2}" fill="none" stroke="${pt.color}" stroke-width="${R - r}"${tipAttr(`<b>${pt.name}</b>: ${pt.v}`)} data-d="${pt.d}"/>`; }
      else { const [x0, y0] = p(R, a0), [x1, y1] = p(R, a1), [x2, y2] = p(r, a1), [x3, y3] = p(r, a0); s += `<path d="M${x0} ${y0}A${R} ${R} 0 ${big} 1 ${x1} ${y1}L${x2} ${y2}A${r} ${r} 0 ${big} 0 ${x3} ${y3}Z" fill="${pt.color}" data-d="${pt.d}"${tipAttr(`<b>${pt.name}</b>: ${pt.v} (${((100 * pt.v) / tot).toFixed(1)}%)`)}/>`; }
      a0 = a1;
    });
    return s + `<text x="${cx}" y="${cy - 2}" text-anchor="middle" class="dn-big">${esc(label)}</text><text x="${cx}" y="${cy + 16}" text-anchor="middle" class="ax">${esc(sub)}</text></svg>`;
  }

  // ---------- Gantt ----------
  function ganttSvg(list) {
    const rowH = 22, L = 300, W = 1160, T = 38, H = T + list.length * rowH + 8;
    let lo = Infinity, hi = -Infinity; for (const t of list) { for (const d of [t.es, t.bs, t.as]) if (d != null && d < lo) lo = d; for (const d of [t.ef, t.bf, t.af]) if (d != null && d > hi) hi = d; }
    if (!isFinite(lo)) return '<div class="dsh-empty">No activities match the filters</div>';
    lo -= 3; hi += 3; const span = hi - lo, X = (d) => L + ((d - lo) / span) * (W - L - 10);
    let s = `<svg viewBox="0 0 ${W} ${H}" class="dsh-svg dsh-gantt"><rect x="0" y="0" width="${W}" height="${T}" fill="${C.light}"/>`;
    const mths = []; let y = P6.ymd(lo); let d = P6.mkDay(y.y, y.m, 1); while (d <= hi) { mths.push(d); y = P6.ymd(d); d = P6.mkDay(y.y, y.m + 1, 1); }
    const px = (W - L - 10) / span, months = mths.length;
    mths.forEach((m, i) => { const x = X(Math.max(m, lo)), nx = X(i + 1 < mths.length ? mths[i + 1] : hi); const yy = P6.ymd(m); if (months <= 30 || yy.m % 3 === 0) s += `<text x="${(x + nx) / 2}" y="${T - 7}" text-anchor="middle" class="ax">${DA.lbl(m, 'month')}</text>`; s += `<line x1="${x}" x2="${x}" y1="${T - 18}" y2="${H}" stroke="${C.line}"/>`; });
    list.forEach((t, i) => {
      const y0 = T + i * rowH; if (i % 2) s += `<rect x="0" y="${y0}" width="${W}" height="${rowH}" fill="#f7f9fa"/>`;
      s += `<text x="8" y="${y0 + 15}" class="gl" data-card="${t.id}"><tspan font-weight="700">${esc(t.code)}</tspan> ${esc(String(t.name).slice(0, 38))}</text>`;
      const crit = t.crit && t.status !== 'C', col = t.status === 'C' ? C.green : crit ? C.red : C.teal;
      if (t.bs != null && t.bf != null) s += `<rect x="${X(t.bs)}" y="${y0 + 16}" width="${Math.max(2, X(t.bf + 1) - X(t.bs))}" height="3" fill="${C.grey}" opacity=".7"/>`;
      if (t.es != null) {
        const x1 = X(t.es), x2 = X(t.ef + 1), w = Math.max(3, x2 - x1), pct = t.status === 'C' ? 100 : t.pct || 0;
        const tip = `<b>${esc(t.code)}</b> ${esc(t.name)}<br>${fd(t.es)} → ${fd(t.ef)}<br>${pct}% · Float ${t.tf == null ? '–' : t.tf} d`;
        if (isMsT(t)) s += `<path d="M${x1} ${y0 + 3}l7 6l-7 6l-7 -6z" fill="${col}" data-card="${t.id}"${tipAttr(tip)}/>`;
        else s += `<g data-card="${t.id}"${tipAttr(tip)}><rect x="${x1}" y="${y0 + 4}" width="${w}" height="11" rx="2" fill="${col}" opacity=".35"/><rect x="${x1}" y="${y0 + 4}" width="${(w * pct) / 100}" height="11" rx="2" fill="${col}"/></g>`;
      }
    });
    const dd = P.dataDate, xd = X(dd + 1); s += `<line x1="${xd}" x2="${xd}" y1="${T - 18}" y2="${H}" stroke="${C.red}" stroke-width="1.6" stroke-dasharray="5 3"/><text x="${xd + 4}" y="11" class="ax" fill="${C.red}" font-weight="700">Data Date</text>`;
    // relationship lines between listed activities
    const ix = new Map(list.map((t, i) => [t.id, i]));
    P.rels.forEach((r) => { if (!ix.has(r.p) || !ix.has(r.s)) return; const a = list[ix.get(r.p)], b = list[ix.get(r.s)], ya = T + ix.get(r.p) * rowH + 10, yb = T + ix.get(r.s) * rowH + 10, xa = X((r.type === 'SS' || r.type === 'SF' ? a.es : a.ef + 1)), xb = X((r.type === 'FF' || r.type === 'SF' ? b.ef + 1 : b.es)); if (a.es == null || b.es == null) return; const mx = Math.max(xa + 6, Math.min(xb - 6, xa + 8)); s += `<path d="M${xa} ${ya}H${mx}V${yb}H${xb}" fill="none" stroke="${a.crit && b.crit ? C.red : C.grey}" stroke-width="1" opacity=".7"/>`; });
    return s + '</svg>';
  }
  const isMsT = (t) => P6.isMile(t);

  // ---------- section builders ----------
  const card = (id, title, sub, body, tools) => `<section class="dsh-card" id="dsh-${id}"><header><div><h3>${esc(title)}</h3>${sub ? `<small>${esc(sub)}</small>` : ''}</div>${tools ? `<div class="dsh-tools">${tools}</div>` : ''}</header><div class="dsh-body">${body}</div></section>`;
  const kpi = (key, label, value, sub, col, foot) => `<div class="dsh-kpi" data-d="kpi:${key}" style="border-top-color:${col || C.teal}"><div class="kl">${esc(label)}</div><div class="kv" style="color:${col || C.dark}">${value}</div><div class="ks">${sub || ''}</div>${foot || ''}</div>`;

  function build() {
    const f = F(), dd = P.dataDate, K = A.k, tasks = A.tasks, cur = A.cur;
    const cnt = { NS: 0, IP: 0, C: 0 }; tasks.forEach((t) => cnt[t.status]++);
    const open = tasks.filter((t) => t.status !== 'C'), crit = open.filter((t) => t.crit), neg = open.filter((t) => t.tf != null && t.tf < 0);
    const blFin = Math.max(...tasks.map((t) => (t.bf != null ? t.bf : -1e9))), fin = Math.max(...tasks.map((t) => (t.ef != null ? t.ef : -1e9)));
    const fv = isFinite(blFin) && blFin > -1e8 ? fin - blFin : null;
    const late = open.filter((t) => t.bs != null && t.bs < dd && t.status === 'NS' || (t.bf != null && t.bf < dd && t.status === 'IP'));
    const overall = tasks.length ? tasks.reduce((a, t) => a + (t.status === 'C' ? 100 : t.pct || 0), 0) / tasks.length : 0;
    const basisName = { cost: 'Budgeted cost', hours: 'Labour hours', duration: 'Duration' }[A.basis];
    const header = `<div class="dsh-head"><div><div class="dsh-eyebrow">PROJECT CONTROLS DASHBOARD</div><h2>${esc(P.name)}</h2><div class="dsh-meta">Data Date <b>${fd(dd)}</b> &nbsp;|&nbsp; Project ID <b>${esc((P.meta && P.meta.code) || '–')}</b> &nbsp;|&nbsp; Progress basis <b>${basisName}</b> &nbsp;|&nbsp; ${tasks.length} of ${P.tasks.length} activities in scope</div></div><div class="dsh-hbtn"><button data-act="print">Print / PDF</button><button data-act="reset">Reset filters</button></div></div>`;
    const wopts = P.wbs.map((w) => { let lv = 0, x = w; while (x && x.parent != null && lv < 8) { x = P.wbs.find((q) => q.id === x.parent); lv++; } return [w.id, ' '.repeat(lv) + (w.code ? w.code + ' – ' : '') + w.name]; });
    const sel = (id, val, opts) => `<select id="${id}">${opts.map(([v, l]) => `<option value="${esc(v)}"${String(val) === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    const labor = P.rsrc.filter((r) => r.type === 'RT_Labor').map((r) => [r.id, r.name]);
    const codes = []; (P.codeTypes || []).forEach((ct) => (P.codeVals || []).filter((v) => v.type === ct.id).forEach((v) => codes.push([ct.id + ':' + v.id, ct.name + ': ' + (v.short || '') + ' ' + (v.desc || v.name || '')])));
    const fl = (l, h) => `<label class="df"><span>${l}</span>${h}</label>`;
    const filters = `<div class="dsh-filters">${fl('WBS', sel('df_wbs', f.wbs, [['all', 'All WBS'], ...wopts]))}${fl('Status', sel('df_status', f.status, [['all', 'All'], ['NS', 'Not Started'], ['IP', 'In Progress'], ['C', 'Completed']]))}${fl('Type', sel('df_type', f.type, [['all', 'Tasks + Milestones'], ['tasks', 'Tasks only'], ['ms', 'Milestones only']]))}${fl('Max float (d)', `<input id="df_floatMax" type="number" value="${esc(f.floatMax)}" placeholder="any" style="width:70px">`)}${fl('Resource', sel('df_rsrc', f.rsrc, [['', 'All labour'], ...labor]))}${codes.length ? fl('Activity Code', sel('df_code', f.code, [['', 'All'], ...codes])) : ''}${fl('Progress basis', sel('df_basis', f.basis, [['auto', 'Auto'], ['cost', 'Budgeted cost'], ['hours', 'Labour hours'], ['duration', 'Duration']]))}${fl('Granularity', sel('df_gran', f.gran, [['auto', 'Auto'], ['week', 'Weekly'], ['month', 'Monthly']]))}${fl('Report period', sel('df_period', f.period, [[7, 'Last 7 days'], [14, 'Last 14 days'], [30, 'Last 30 days'], [60, 'Last 60 days']]))}${fl('Look-ahead', sel('df_ahead', f.ahead, [[2, '2 weeks'], [3, '3 weeks'], [4, '4 weeks'], [6, '6 weeks'], [8, '8 weeks'], [12, '12 weeks']]))}${fl('Search', `<input id="df_q" value="${esc(f.q)}" placeholder="ID or name" style="width:130px">`)}<label class="df chk"><input id="df_crit" type="checkbox"${f.crit ? ' checked' : ''}> Critical only</label></div>`;
    const nav = `<nav class="dsh-nav">${[['sum', 'Summary'], ['scurve', 'S-Curve'], ['spi', 'SPI'], ['wbs', 'Progress by WBS'], ['cp', 'Critical Path'], ['float', 'Float'], ['mp', 'Manpower'], ['la', 'Look-ahead'], ['ach', 'Achieved'], ['oos', 'Out-of-Sequence'], ['aoc', 'Areas of Concern'], ['risk', 'Risks']].map(([k, l]) => `<a data-nav="${k}">${l}</a>`).join('')}</nav>`;

    const kpis = `<div class="dsh-kpis" id="dsh-sum">${kpi('prog', 'Overall Progress (earned)', pc(K.ev), `Planned ${pc(K.pv)} · Variance <b style="color:${K.ev >= K.pv ? C.green : C.red}">${(K.ev - K.pv >= 0 ? '+' : '') + (K.ev - K.pv).toFixed(1)}%</b>`, K.ev >= K.pv ? C.green : C.red, `<div class="kbar"><i style="width:${Math.min(100, K.pv)}%;background:${C.grey}"></i><i style="width:${Math.min(100, K.ev)}%;background:${C.teal}"></i></div>`)}
      ${kpi('spi', 'Schedule Performance Index', K.spi == null ? '–' : K.spi.toFixed(2), K.spi == null ? 'No planned value yet' : K.spi >= 1 ? 'On or ahead of plan' : K.spi >= 0.9 ? 'Slightly behind plan' : 'Significantly behind plan', spiCol(K.spi))}
      ${kpi('fin', 'Forecast vs Baseline Finish', fv == null ? '–' : (fv > 0 ? '+' : '') + fv + ' d', `Forecast ${fd(fin)}${isFinite(blFin) && blFin > -1e8 ? ' · BL ' + fd(blFin) : ''}`, fv > 0 ? C.red : C.green)}
      ${kpi('acts', 'Activities', tasks.length.toLocaleString(), `${cnt.C} completed · ${cnt.IP} in progress · ${cnt.NS} not started`, C.teal)}
      ${kpi('crit', 'Critical Activities (open)', crit.length.toLocaleString(), `${open.length ? ((100 * crit.length) / open.length).toFixed(0) : 0}% of remaining activities`, crit.length ? C.red : C.green)}
      ${kpi('neg', 'Negative Float', neg.length.toLocaleString(), neg.length ? `Worst ${Math.min(...neg.map((t) => t.tf))} d` : 'None', neg.length ? C.red : C.green)}
      ${kpi('late', 'Late / Overdue', late.length.toLocaleString(), 'Should have started or finished by data date', late.length ? C.orange : C.green)}
      ${kpi('oos', 'Out-of-Sequence', A.oos.length.toLocaleString(), A.oos.length ? 'Logic violated by progress' : 'Logic consistent with progress', A.oos.length ? C.orange : C.green)}</div>`;

    const spiVals = cur.spi.map((v) => (v == null ? null : Math.min(2, v)));
    const sc = card('scurve', 'S-Curve – Cumulative Progress', `% of total ${basisName.toLowerCase()} · ${cur.gran === 'month' ? 'monthly' : 'weekly'} · click a point for the period detail`,
      lineChart({ B: cur.B, gran: cur.gran, yMax: 100, yFmt: (v) => v + '%', vFmt: (v) => v.toFixed(1) + '%', drill: 'curve', vline: { x: dd, label: 'Data Date' }, series: [{ name: 'Planned (Baseline)', color: C.grey, vals: cur.planned, dash: '6 4', w: 2.2 }, { name: 'Actual', color: C.teal, vals: cur.actual, area: 1, w: 3 }, { name: 'Forecast', color: C.amber, vals: cur.forecast, dash: '3 3', w: 2.4 }] }));
    const stat = card('status', 'Activity Status', 'click a segment for the list', `<div class="dsh-donwrap">${donut([{ name: 'Completed', v: cnt.C, color: C.green, d: 'status:C' }, { name: 'In Progress', v: cnt.IP, color: C.teal, d: 'status:IP' }, { name: 'Not Started', v: cnt.NS, color: '#b8c2c7', d: 'status:NS' }], tasks.length.toLocaleString(), 'activities')}<div class="dsh-dl">${[['Completed', cnt.C, C.green], ['In Progress', cnt.IP, C.teal], ['Not Started', cnt.NS, '#b8c2c7']].map(([n, v, c]) => `<div><i style="background:${c}"></i>${n}<b>${v}</b></div>`).join('')}<div class="dtot">Average % complete <b>${overall.toFixed(1)}%</b></div></div></div>`);
    const spic = card('spi', 'SPI Curve', 'Earned ÷ Planned value over time · green ≥ 1.0 · amber 0.9–1.0 · red < 0.9',
      lineChart({ B: cur.B, gran: cur.gran, yMax: 2, yFmt: (v) => v.toFixed(1), vFmt: (v) => v.toFixed(2), drill: 'spi', vline: { x: dd, label: 'Data Date' }, ref: [{ y: 1, label: 'SPI = 1.0', color: C.green }, { y: 0.9, label: '0.9', color: C.red }], zones: [{ from: 1, to: 2, color: C.green }, { from: 0.9, to: 1, color: C.amber }, { from: 0, to: 0.9, color: C.red }], series: [{ name: 'SPI (cumulative)', color: C.teal, vals: spiVals, area: 1, w: 3 }] }));
    // WBS progress
    const lvl1 = P.wbs.filter((w) => w.parent != null && P.wbs.find((q) => q.id === w.parent && q.parent == null)).length ? P.wbs.filter((w) => P.wbs.find((q) => q.id === w.parent && q.parent == null)) : P.wbs.filter((w) => w.parent == null);
    const wrows = lvl1.map((w) => { const ids = new Set(); const st = [w.id]; while (st.length) { const x = st.pop(); ids.add(x); P.wbs.filter((q) => q.parent === x).forEach((q) => st.push(q.id)); } const ts = tasks.filter((t) => ids.has(t.wbs)); let tot = 0, ev = 0, pv = 0; ts.forEach((t) => { const wgt = A.W.get(t.id) || 0, x = A.k.taskSpi.get(t.id); tot += wgt; ev += x.ev; pv += x.pv; }); return { w, ts, ev: tot ? (100 * ev) / tot : 0, pv: tot ? (100 * pv) / tot : 0, spi: pv > 0 ? ev / pv : null, share: A.k.tot ? (100 * tot) / A.k.tot : 0 }; }).filter((r) => r.ts.length).sort((a, b) => b.share - a.share);
    SEL.wrows = wrows;
    const wb = card('wbs', 'Progress by WBS (level 1)', 'planned vs earned · click a bar for the activities', `<div class="dsh-wb">${wrows.map((r, i) => `<div class="wr" data-d="wbs:${i}"${tipAttr(`<b>${esc(r.w.name)}</b><br>Planned ${r.pv.toFixed(1)}% · Earned ${r.ev.toFixed(1)}%<br>SPI ${r.spi == null ? '–' : r.spi.toFixed(2)} · ${r.ts.length} activities`)}><div class="wn">${esc(r.w.name)}<small>${r.share.toFixed(1)}% of scope</small></div><div class="wbar"><i class="p" style="width:${Math.min(100, r.pv)}%"></i><i class="a" style="width:${Math.min(100, r.ev)}%;background:${spiCol(r.spi)}"></i></div><div class="wv">${r.ev.toFixed(0)}% <small>/ ${r.pv.toFixed(0)}%</small></div></div>`).join('') || '<div class="dsh-empty">No data</div>'}</div>` + legend([['Planned', C.grey], ['Earned (colour = SPI)', C.teal]]));
    // critical gantt
    const g = GC(); const gl = A.tasks.filter((t) => t.status !== 'C' && (g.mode === 'all' ? true : g.mode === 'near' ? t.tf != null && t.tf <= 14 : t.crit)).sort((a, b) => (a.es || 0) - (b.es || 0) || (a.ef || 0) - (b.ef || 0)); SEL.glist = gl.slice(0, +g.n);
    const cp = card('cp', 'Critical Path Gantt', `${gl.length} activities match · showing ${Math.min(gl.length, +g.n)} · bars: current (fill = progress), grey = baseline · click for details`, ganttSvg(SEL.glist), `<select id="dg_mode"><option value="crit"${g.mode === 'crit' ? ' selected' : ''}>Critical (TF ≤ 0)</option><option value="near"${g.mode === 'near' ? ' selected' : ''}>Near-critical (TF ≤ 14)</option><option value="all"${g.mode === 'all' ? ' selected' : ''}>All open</option></select><select id="dg_n">${[20, 40, 60, 100].map((v) => `<option${+g.n === v ? ' selected' : ''}>${v}</option>`).join('')}</select>`);
    // float histogram
    const bins = [['< 0', (t) => t.tf < 0, C.red], ['0', (t) => t.tf === 0, C.orange], ['1–10', (t) => t.tf >= 1 && t.tf <= 10, C.amber], ['11–30', (t) => t.tf >= 11 && t.tf <= 30, '#9bbf3b'], ['31–60', (t) => t.tf >= 31 && t.tf <= 60, C.green], ['> 60', (t) => t.tf > 60, C.teal]];
    const fopen = open.filter((t) => t.tf != null); SEL.fbins = bins.map(([l, fn]) => fopen.filter(fn));
    const fh = card('float', 'Total Float Distribution (open activities)', 'days of float · click a bar for the activities', barChart({ H: 280, yMax: Math.max(5, Math.ceil(Math.max(...SEL.fbins.map((l) => l.length), 1) / 5) * 5), cats: bins.map(([l, fn, c], i) => ({ label: l, stack: [{ v: SEL.fbins[i].length, color: c }], tip: `<b>Float ${l} d</b><br>${SEL.fbins[i].length} activities` })), drill: 'float', yFmt: (v) => Math.round(v) }));
    // manpower
    const mp = A.mp, mpC = ['#00778B', '#3D3935', '#7FB7C2', '#D98E04', '#8C8C8C', '#2E8B57'];
    const top = mp.list.slice(0, 5), restIdx = mp.list.slice(5);
    const cats = mp.B.map((d, i) => {
      const stack = []; top.forEach((x, k) => { stack.push({ v: x.act[i], color: mpC[k], op: 1 }); });
      const other = restIdx.reduce((s, x) => s + x.act[i], 0); const remT = mp.rem[i], actT = mp.act[i];
      // actual period bars use the solid palette, remaining (future) bars use the same palette lightened
      const st2 = []; top.forEach((x, k) => { st2.push({ v: x.act[i] + x.rem[i], color: mpC[k], op: x.act[i] >= x.rem[i] ? 1 : 0.45 }); }); st2.push({ v: other + restIdx.reduce((s, x) => s + x.rem[i], 0), color: '#c9d1d5', op: 1 });
      const fte = (mp.act[i] + mp.rem[i]) / (8 * Math.max(1, (i ? d - mp.B[i - 1] : mp.gran === 'month' ? 30 : 7) * 5 / 7));
      return { label: DA.lbl(d, mp.gran), stack: st2, tip: `<b>${DA.lbl(d, mp.gran)}</b><br>Actual ${n0(actT)} h · Remaining ${n0(remT)} h<br>Planned (BL) ${n0(mp.plan[i])} h<br>≈ ${fte.toFixed(1)} FTE (8 h/day)` };
    });
    const ddI = mp.B.findIndex((d) => d >= dd);
    const mpTot = mp.act.map((v, i) => v + mp.rem[i]); const totH = mpTot.reduce((a, b) => a + b, 0);
    const mpc = card('mp', 'Manpower Histogram (labour units)', `${mp.gran === 'month' ? 'monthly' : 'weekly'} hours · solid = actual to date, light = remaining · dashed = baseline plan · click a bar for the resource breakdown`, mp.list.length ? barChart({ H: 300, cats, drill: 'mp', line: mp.plan.map((v) => v), lineColor: C.dark, vline: ddI >= 0 ? { i: ddI - 1 < 0 ? 0 : ddI - 1, label: 'Data Date' } : null, yFmt: (v) => n0(v), legend: [...top.map((x, k) => [x.name, mpC[k]]), ...(restIdx.length ? [['Other', '#c9d1d5']] : []), ['Baseline plan', C.dark, 1]] }) + `<div class="dsh-note">Total ${n0(totH)} h · Peak ${n0(A.mpStat.peak)} h · Average ${n0(A.mpStat.avg)} h per ${mp.gran} · Peak/Avg ${A.mpStat.avg ? (A.mpStat.peak / A.mpStat.avg).toFixed(1) : '–'}</div>` : '<div class="dsh-empty">No labour assignments in scope. Assign labour resources to activities to see the histogram.</div>');
    // look-ahead
    const la = DA.lookahead(P, tasks, dd + 1, +f.ahead); SEL.la = la;
    const wk = []; for (let i = 0; i < +f.ahead; i++) wk.push(dd + 1 + i * 7);
    const laTbl = `<div class="dsh-tw"><table class="dsh-t dsh-la"><thead><tr><th>Activity ID</th><th style="min-width:240px">Activity Name</th><th>WBS</th><th>Type</th><th class="r">Start</th><th class="r">Finish</th><th class="r">%</th><th class="r">Float</th>${wk.map((d) => `<th class="wk">${DA.lbl(d, 'week').slice(0, 6)}</th>`).join('')}</tr></thead><tbody>${la.slice(0, 250).map((r) => { const t = r.t; return `<tr class="${t.crit ? 'crit' : ''}" data-card="${t.id}"><td>${esc(t.code)}</td><td>${esc(t.name)}</td><td>${esc(wbsOf(t).code || '')}</td><td>${chip(r.kind, { Starting: C.teal, Finishing: C.green, Ongoing: C.mid, 'Late start': C.orange }[r.kind])}</td><td class="r">${fd(t.es)}</td><td class="r">${fd(t.ef)}</td><td class="r">${t.pct || 0}</td><td class="r"><b style="color:${t.tf < 0 ? C.red : C.dark}">${t.tf == null ? '' : t.tf}</b></td>${wk.map((d) => { const on = t.es <= d + 6 && t.ef >= d; return `<td class="wk">${on ? `<i style="background:${t.crit ? C.red : C.teal}"></i>` : ''}</td>`; }).join('')}</tr>`; }).join('')}</tbody></table></div>`;
    const lac = card('la', `${f.ahead}-Week Look-ahead`, `${fd(dd + 1)} → ${fd(dd + f.ahead * 7)} · ${la.length} activities · ${la.filter((r) => r.t.crit).length} critical`, `<div class="dsh-mini">${[['Starting', 'Starting', C.teal], ['Finishing', 'Finishing', C.green], ['Ongoing', 'Ongoing', C.mid], ['Late start', 'Late start', C.orange]].map(([k, l, c]) => `<div data-d="la:${k}"><b style="color:${c}">${la.filter((r) => r.kind === k).length}</b><span>${l}</span></div>`).join('')}<div data-d="la:crit"><b style="color:${C.red}">${la.filter((r) => r.t.crit).length}</b><span>Critical</span></div></div>` + laTbl);
    // achieved
    const ach = DA.achieved(P, tasks, dd, +f.period), nW = Math.min(12, Math.max(4, Math.ceil(f.period / 7) + 4)); const wEnds = []; for (let i = nW - 1; i >= 0; i--) wEnds.push(dd - i * 7);
    const compW = wEnds.map((d) => tasks.filter((t) => t.status === 'C' && t.af != null && t.af > d - 7 && t.af <= d)), planW = wEnds.map((d) => tasks.filter((t) => (t.bf != null) && t.bf > d - 7 && t.bf <= d && !isMsT(t)));
    SEL.achW = { wEnds, compW, planW };
    const delta = (() => { const k = cur.B.findIndex((d) => d >= dd); const k0 = cur.B.findIndex((d) => d >= dd - f.period); return k >= 0 && k0 >= 0 && cur.actual[k] != null && cur.actual[k0] != null ? cur.actual[k] - cur.actual[k0] : null; })();
    const acc = card('ach', `Achieved – Last ${f.period} Days`, `${fd(ach.from)} → ${fd(dd)} · click a bar or counter for the activities`, `<div class="dsh-mini"><div data-d="ach:completed"><b style="color:${C.green}">${ach.completed.length}</b><span>Completed</span></div><div data-d="ach:started"><b style="color:${C.teal}">${ach.started.length}</b><span>Started (still open)</span></div><div data-d="ach:progressed"><b style="color:${C.mid}">${ach.progressed.length}</b><span>In progress now</span></div><div><b>${delta == null ? '–' : delta.toFixed(1) + '%'}</b><span>Progress earned in period</span></div></div>` + barChart({ H: 240, yMax: Math.max(5, Math.ceil(Math.max(...compW.map((l) => l.length), ...planW.map((l) => l.length), 1) / 5) * 5), cats: wEnds.map((d, i) => ({ label: DA.lbl(d, 'week').slice(0, 6), stack: [{ v: compW[i].length, color: C.teal }], tip: `<b>Week ending ${fd(d)}</b><br>Completed ${compW[i].length} · Planned to finish ${planW[i].length}` })), line: planW.map((x) => x.length), lineColor: C.dark, drill: 'ach', legend: [['Completed (actual finish)', C.teal], ['Planned to finish (baseline)', C.dark, 1]] }));
    // OOS
    const oosRows = A.oos; const fixOpts = [['ss', 'Convert FS → SS'], ['remove', 'Remove relationship'], ['keep', 'Keep (review manually)']];
    oosRows.forEach((o) => { if (!oosFix[o.rel.id]) oosFix[o.rel.id] = o.fix === 'ss' ? 'ss' : o.fix === 'remove' ? 'remove' : 'keep'; });
    const oosBody = oosRows.length ? `<div class="dsh-note">Progress has been recorded out of sequence on ${oosRows.length} relationship(s). Pick a fix per row or use <b>Auto-fix</b>: FS→SS where the predecessor is partly done, remove the logic where the predecessor has not started, and leave non-FS cases for review. Changes can be undone (Ctrl+Z).</div>` + tbl([{ h: 'Predecessor', get: (o) => `${o.pred.code} – ${o.pred.name}`, w: 220 }, { h: 'Pred. status', get: (o) => `${stName[o.pred.status]} ${o.pred.status === 'IP' ? o.pred.pct + '%' : ''}` }, { h: 'Type', get: (o) => o.rel.type }, { h: 'Successor', get: (o) => `${o.succ.code} – ${o.succ.name}`, w: 220 }, { h: 'Succ. actual start', get: (o) => fd(o.succ.as), al: 'r' }, { h: 'Issue', get: (o) => o.issue, w: 220 }, { h: 'Days', get: (o) => o.days, al: 'r' }, { h: 'Fix', get: (o) => `<select data-fix="${o.rel.id}">${fixOpts.map(([v, l]) => `<option value="${v}"${oosFix[o.rel.id] === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`, raw: 1 }], oosRows, { rowAttr: (o) => `data-card="${o.succ.id}"`, max: 300 }) + `<div class="dsh-actions"><button data-act="oos-auto">Auto-fix all (recommended)</button><button data-act="oos-apply">Apply selected fixes</button><button data-act="oos-preview">Preview impact on finish date</button><button data-act="oos-override">Switch scheduling to Progress Override</button></div><div id="oos-prev"></div>` : `<div class="dsh-ok">No out-of-sequence progress detected: recorded actuals are consistent with the network logic.</div>`;
    const oosc = card('oos', 'Out-of-Sequence Analysis & Auto-Fix', `${oosRows.length} violations`, oosBody);
    // AoC
    const rules = [...new Set(A.aoc.map((r) => r.rule))]; const bySev = [5, 4, 3, 2].map((s) => A.aoc.filter((r) => r.sev === s).length);
    const aocc = card('aoc', 'Areas of Concern', `${A.aoc.length} findings across ${rules.length} categories · ratio ≥ ${f.aocRatio}x and ≥ ${f.aocDays} d to flag duration overruns`, `<div class="dsh-aocbar"><label>Overrun ratio <input id="df_aocRatio" type="number" step="0.1" value="${f.aocRatio}" style="width:60px"></label><label>Min. days <input id="df_aocDays" type="number" value="${f.aocDays}" style="width:60px"></label></div><div class="dsh-mini">${rules.map((r) => `<div data-d="aocr:${esc(r)}"><b>${A.aoc.filter((x) => x.rule === r).length}</b><span>${esc(r)}</span></div>`).join('')}</div><div class="dsh-chips">${[[5, 'Critical'], [4, 'High'], [3, 'Medium']].map(([s, l]) => `<span>${sevChip(s)} ${bySev[5 - s]}</span>`).join('')}</div>` + tbl([{ h: 'Severity', get: (r) => sevChip(r.sev), raw: 1 }, { h: 'Concern', get: (r) => r.rule, w: 170 }, { h: 'Activity', get: (r) => `${r.t.code} – ${r.t.name}`, w: 260 }, { h: 'WBS', get: (r) => wbsOf(r.t).code || '' }, { h: 'Measure', get: (r) => r.metric, w: 200 }, { h: 'Observation', get: (r) => r.detail, w: 220 }, { h: 'Recommended action', get: (r) => r.action, w: 240 }], A.aoc, { rowAttr: (r) => `data-card="${r.t.id}"`, max: 150 }));
    // risks
    const heat = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => []));
    A.risks.forEach((r) => heat[Math.min(4, Math.max(0, r.pr - 1))][Math.min(4, Math.max(0, r.im - 1))].push(r)); SEL.heat = heat;
    const hcol = (p, i) => { const s = p * i; return s >= 17 ? C.red : s >= 10 ? C.orange : s >= 5 ? C.amber : C.green; };
    const heatHtml = `<div class="dsh-heat"><div class="hy">Probability</div><div class="hg">${[5, 4, 3, 2, 1].map((p) => `<div class="hl">${p}</div>${[1, 2, 3, 4, 5].map((i) => `<div class="hc" style="background:${hcol(p, i)}${heat[p - 1][i - 1].length ? '' : '55'}" data-d="heat:${p}:${i}"${tipAttr(`P${p} × I${i} = ${p * i}<br>${heat[p - 1][i - 1].length} risk(s)`)}>${heat[p - 1][i - 1].length || ''}</div>`).join('')}`).join('')}<div></div>${[1, 2, 3, 4, 5].map((i) => `<div class="hl">${i}</div>`).join('')}</div><div class="hx">Impact</div></div>`;
    const riskc = card('risk', 'Risk Register & Heat Map', `${A.risks.length} risks · ${A.risks.filter((r) => r.src === 'Auto-detected').length} auto-detected from schedule analysis · ${A.risks.filter((r) => r.src === 'Risk Register').length} from the project risk register`, `<div class="dsh-two"><div>${heatHtml}</div>${tbl([{ h: 'ID', get: (r) => r.id }, { h: 'Risk', get: (r) => r.name, w: 300 }, { h: 'Category', get: (r) => r.cat }, { h: 'Source', get: (r) => r.src }, { h: 'P', get: (r) => r.pr, al: 'r' }, { h: 'I', get: (r) => r.im, al: 'r' }, { h: 'Score', get: (r) => r.score, al: 'r' }, { h: 'Rating', get: (r) => ratChip(r.rating), raw: 1 }, { h: 'Activities', get: (r) => r.items.length, al: 'r' }, { h: 'Mitigation / action', get: (r) => r.action, w: 280 }], A.risks, { rowAttr: (r, i) => `data-d="risk:${i}"`, max: 100 })}</div>`);
    return header + filters + nav + `<div class="dsh-grid">${kpis}<div class="dsh-row r21">${sc}${stat}</div><div class="dsh-row r11">${spic}${wb}</div>${cp}<div class="dsh-row r11">${fh}${mpc}</div>${lac}${acc}${oosc}${aocc}${riskc}</div><div class="dsh-foot">Generated ${new Date().toLocaleString('en-GB')} · P6 Web Schedule Studio · Earned = % complete × ${basisName.toLowerCase()} weight; Planned = baseline dates (current dates where no baseline); progress is spread linearly across each activity.</div>`;
  }

  // ---------- drill-downs ----------
  const periodTasks = (i) => { const B = A.cur.B, e = B[i], s = i ? B[i - 1] + 1 : B[0]; const pl = A.tasks.filter((t) => { const a = t.bs != null ? t.bs : t.es, b = t.bf != null ? t.bf : t.ef; return a != null && a <= e && b >= s; }), fin = A.tasks.filter((t) => t.status === 'C' && t.af != null && t.af >= s && t.af <= e), plFin = A.tasks.filter((t) => (t.bf != null ? t.bf : t.ef) >= s && (t.bf != null ? t.bf : t.ef) <= e); return { s, e, pl, fin, plFin }; };
  const DR = {
    curve(i) { const c = A.cur, x = periodTasks(+i); const act = c.actual[+i], pl = c.planned[+i], fo = c.forecast[+i];
      detail(`Period ending ${fd(x.e)}`, `${fd(x.s)} → ${fd(x.e)}`, kv([['Planned cumulative (BL)', pc(pl)], ['Actual cumulative', pc(act)], ['Forecast cumulative', pc(fo)], ['Variance (actual – planned)', act != null && pl != null ? (act - pl).toFixed(1) + '%' : '–', act != null && act < pl ? C.red : C.green], ['Planned to finish in period', x.plFin.length], ['Actually finished in period', x.fin.length], ['Activities active in period (BL)', x.pl.length]]) + `<h4>Planned to finish in this period (${x.plFin.length})</h4>${actTable(x.plFin)}<h4>Finished in this period (${x.fin.length})</h4>${actTable(x.fin)}`); },
    spi(i) { const c = A.cur, x = periodTasks(+i), v = c.spi[+i]; const behind = A.tasks.filter((t) => { const a = t.bs != null ? t.bs : t.es, b = t.bf != null ? t.bf : t.ef; return b != null && b <= x.e && t.status !== 'C'; });
      detail(`SPI at ${fd(x.e)}`, '', kv([['SPI (cumulative)', v == null ? 'n/a (before data date / no planned value)' : v.toFixed(2), spiCol(v)], ['Planned %', pc(c.planned[+i])], ['Actual %', pc(c.actual[+i])], ['Activities planned to be finished by then but still open', behind.length]]) + `<h4>Open activities whose baseline finish is on/before this date</h4>${actTable(behind)}`); },
    wbs(i) { const r = SEL.wrows[+i]; detail(`WBS – ${r.w.name}`, '', kv([['Planned %', pc(r.pv)], ['Earned %', pc(r.ev)], ['SPI', r.spi == null ? '–' : r.spi.toFixed(2), spiCol(r.spi)], ['Share of total scope', pc(r.share)], ['Activities', r.ts.length], ['Completed', r.ts.filter((t) => t.status === 'C').length], ['Critical (open)', r.ts.filter((t) => t.crit && t.status !== 'C').length]]) + actTable(r.ts.slice().sort((a, b) => { const x = A.k.taskSpi.get(a.id).spi, y = A.k.taskSpi.get(b.id).spi; return (x == null ? 9 : x) - (y == null ? 9 : y); }))); },
    float(i) { const l = SEL.fbins[+i]; detail(`Float bin ${['< 0', '0', '1–10', '11–30', '31–60', '> 60'][+i]} days`, `${l.length} open activities`, actTable(l.slice().sort((a, b) => a.tf - b.tf))); },
    status(s) { const l = A.tasks.filter((t) => t.status === s); detail(stName[s] + ' activities', `${l.length} activities`, actTable(l)); },
    kpi(k) {
      const open = A.tasks.filter((t) => t.status !== 'C'), K = A.k;
      if (k === 'prog' || k === 'spi') { const rows = SEL.wrows; detail(k === 'spi' ? 'SPI – worst performing activities' : 'Progress detail', '', kv([['Earned', pc(K.ev)], ['Planned', pc(K.pv)], ['SPI', K.spi == null ? '–' : K.spi.toFixed(2), spiCol(K.spi)]]) + `<h4>By WBS</h4>` + tbl([{ h: 'WBS', get: (r) => r.w.name, w: 260 }, { h: 'Planned %', get: (r) => r.pv.toFixed(1), al: 'r' }, { h: 'Earned %', get: (r) => r.ev.toFixed(1), al: 'r' }, { h: 'SPI', get: (r) => (r.spi == null ? '' : `<b style="color:${spiCol(r.spi)}">${r.spi.toFixed(2)}</b>`), raw: 1, al: 'r' }, { h: 'Activities', get: (r) => r.ts.length, al: 'r' }], rows) + `<h4>Lowest SPI activities (planned value > 0)</h4>` + actTable(A.tasks.filter((t) => (K.taskSpi.get(t.id) || {}).pv > 0 && K.taskSpi.get(t.id).spi != null && K.taskSpi.get(t.id).spi < 1).sort((a, b) => K.taskSpi.get(a.id).spi - K.taskSpi.get(b.id).spi).slice(0, 60))); }
      else if (k === 'fin') { const l = open.filter((t) => t.bf != null && t.ef != null && t.ef > t.bf).sort((a, b) => (b.ef - b.bf) - (a.ef - a.bf)).slice(0, 80); detail('Activities forecast later than baseline', `${l.length} (top 80 by slip)`, actTable(l)); }
      else if (k === 'acts') detail('All activities in scope', '', actTable(A.tasks));
      else if (k === 'crit') detail('Critical activities (open)', '', actTable(open.filter((t) => t.crit).sort((a, b) => a.es - b.es)));
      else if (k === 'neg') detail('Activities with negative float', '', actTable(open.filter((t) => t.tf != null && t.tf < 0).sort((a, b) => a.tf - b.tf)));
      else if (k === 'late') detail('Late / overdue activities', '', actTable(open.filter((t) => (t.status === 'NS' && t.bs != null && t.bs < P.dataDate) || (t.status === 'IP' && t.bf != null && t.bf < P.dataDate))));
      else if (k === 'oos') { document.getElementById('dsh-oos').scrollIntoView({ behavior: 'smooth' }); }
    },
    mp(i) { const mp = A.mp, B = mp.B[+i], s = +i ? mp.B[+i - 1] + 1 : mp.B[0];
      const rows = mp.list.map((x) => ({ name: x.name, act: x.act[+i], rem: x.rem[+i], plan: x.plan[+i] })).filter((r) => r.act + r.rem + r.plan > 0.01);
      const ts = A.tasks.filter((t) => t.es != null && t.es <= B && t.ef >= s && t.status !== 'C');
      detail(`Manpower – period ending ${fd(B)}`, `${fd(s)} → ${fd(B)}`, kv([['Actual hours', n0(mp.act[+i])], ['Remaining (forecast) hours', n0(mp.rem[+i])], ['Baseline plan hours', n0(mp.plan[+i])], ['Active open activities', ts.length]]) + `<h4>By resource</h4>` + tbl([{ h: 'Resource', get: (r) => r.name, w: 220 }, { h: 'Actual h', get: (r) => n0(r.act), al: 'r' }, { h: 'Remaining h', get: (r) => n0(r.rem), al: 'r' }, { h: 'Baseline h', get: (r) => n0(r.plan), al: 'r' }], rows) + `<h4>Open activities active in this period</h4>${actTable(ts)}`); },
    la(k) { const l = SEL.la.filter((r) => (k === 'crit' ? r.t.crit : r.kind === k)).map((r) => r.t); detail(k === 'crit' ? 'Critical activities in the look-ahead' : `Look-ahead – ${k}`, '', actTable(l)); },
    ach(k) { const a = DA.achieved(P, A.tasks, P.dataDate, +F().period); if (isNaN(+k)) { detail(`Achieved – ${k}`, `${fd(a.from)} → ${fd(a.to)}`, k === 'completed' ? tbl(actCols().concat([{ h: 'Finish var.', get: (t) => (t.bf != null && t.af != null ? t.af - t.bf + ' d' : ''), al: 'r' }]), a.completed) : actTable(a[k])); } else { const i = +k, d = SEL.achW.wEnds[i]; detail(`Week ending ${fd(d)}`, '', `<h4>Completed (${SEL.achW.compW[i].length})</h4>${actTable(SEL.achW.compW[i])}<h4>Planned to finish (${SEL.achW.planW[i].length})</h4>${actTable(SEL.achW.planW[i])}`); } },
    aocr(r) { const l = A.aoc.filter((x) => x.rule === r); detail(`Area of concern – ${r}`, `${l.length} findings`, tbl([{ h: 'Severity', get: (x) => sevChip(x.sev), raw: 1 }, { h: 'Activity', get: (x) => `${x.t.code} – ${x.t.name}`, w: 260 }, { h: 'Measure', get: (x) => x.metric, w: 220 }, { h: 'Observation', get: (x) => x.detail, w: 240 }, { h: 'Action', get: (x) => x.action, w: 240 }, { h: '', get: (x) => goBtn(x.t), raw: 1 }], l)); },
    heat(p, i) { const l = SEL.heat[+p - 1][+i - 1]; detail(`Risks – Probability ${p} × Impact ${i}`, `${l.length} risk(s)`, l.map((r) => riskHtml(r)).join('') || '<div class="dsh-empty">No risks in this cell</div>'); },
    risk(i) { const r = A.risks[+i]; detail(`${r.id} – ${r.name}`, `${ratChip(r.rating)} ${chip(r.src, C.teal)} ${chip(r.cat, C.grey)}`, riskHtml(r, 1)); }
  };
  function riskHtml(r, full) { return `<div class="dsh-risk">${full ? '' : `<h4>${esc(r.id)} – ${esc(r.name)} ${ratChip(r.rating)}</h4>`}${kv([['Probability', r.pr + ' / 5'], ['Impact', r.im + ' / 5'], ['Score', r.score], ['Rating', r.rating], ['Source', r.src], ['Category', r.cat]])}<p><b>Evidence:</b> ${esc(r.detail)}</p><p><b>Recommended action:</b> ${esc(r.action || '–')}</p><h4>Related activities (${r.items.length})</h4>${actTable(r.items)}</div>`; }

  // ---------- out-of-sequence actions ----------
  function applyOos(auto) {
    const rows = A.oos; if (!rows.length) return;
    if (auto) rows.forEach((o) => { oosFix[o.rel.id] = o.fix === 'ss' ? 'ss' : o.fix === 'remove' ? 'remove' : 'keep'; });
    const todo = rows.filter((o) => oosFix[o.rel.id] && oosFix[o.rel.id] !== 'keep'); if (!todo.length) return App.toast('No fixes selected', true);
    let nSS = 0, nRm = 0;
    App.mutate('Fix out-of-sequence logic', () => {
      for (const o of todo) { const r = P.rels.find((q) => q.id === o.rel.id); if (!r) continue; const a = oosFix[o.rel.id]; if (a === 'ss') { r.type = 'SS'; nSS++; } else if (a === 'remove') { P.rels = P.rels.filter((q) => q.id !== r.id); nRm++; } }
    });
    if (!App.cfg.auto) App.runSchedule();
    oosFix = {}; App.toast(`Logic fixed: ${nSS} converted to SS, ${nRm} removed`); render();
  }
  function previewOos() {
    const todo = A.oos.filter((o) => oosFix[o.rel.id] && oosFix[o.rel.id] !== 'keep');
    const trial = JSON.parse(JSON.stringify(P, (k, v) => (k === 'xer' ? undefined : v)));
    for (const o of todo) { const r = trial.rels.find((q) => q.id === o.rel.id); if (!r) continue; if (oosFix[o.rel.id] === 'ss') r.type = 'SS'; else trial.rels = trial.rels.filter((q) => q.id !== r.id); }
    const fin = (pp) => Math.max(...pp.tasks.map((t) => (t.ef != null ? t.ef : -1e9))), before = fin(P); P6.schedule(trial); const after = fin(trial);
    const negB = P.tasks.filter((t) => t.status !== 'C' && t.tf < 0).length, negA = trial.tasks.filter((t) => t.status !== 'C' && t.tf < 0).length;
    const remaining = DA.oos(trial).length;
    document.getElementById('oos-prev').innerHTML = `<div class="dsh-prev"><b>Impact preview (${todo.length} fixes):</b> project finish ${fd(before)} → <b style="color:${after > before ? C.red : C.green}">${fd(after)}</b> (${after - before >= 0 ? '+' : ''}${after - before} d) · activities with negative float ${negB} → ${negA} · out-of-sequence remaining ${remaining}</div>`;
  }

  // ---------- render / events ----------
  function render() { if (!ROOT || !App.p) return; P = App.p; const sy = ROOT.parentNode ? ROOT.parentNode.scrollTop : 0; A = DA.analyse(P, F()); ROOT.innerHTML = build(); if (ROOT.parentNode) ROOT.parentNode.scrollTop = sy; }
  let tip = null;
  function showTip(e, html) { if (!tip) { tip = document.createElement('div'); tip.id = 'dsh-tip'; document.body.appendChild(tip); } tip.innerHTML = html; tip.style.display = 'block'; const w = tip.offsetWidth; tip.style.left = Math.min(innerWidth - w - 8, e.clientX + 14) + 'px'; tip.style.top = Math.min(innerHeight - tip.offsetHeight - 8, e.clientY + 14) + 'px'; }
  const hideTip = () => { if (tip) tip.style.display = 'none'; };
  let timer = null; const later = (fn) => { clearTimeout(timer); timer = setTimeout(fn, 350); };

  App.renderDashboardWin = function (el) {
    ROOT = document.createElement('div'); ROOT.className = 'dsh'; ROOT.dir = 'ltr'; el.innerHTML = ''; el.appendChild(ROOT); el.classList.add('dsh-host');
    render();
    ROOT.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-nav]'); if (nav) { const t = document.getElementById('dsh-' + nav.dataset.nav); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      const act = e.target.closest('[data-act]'); if (act) {
        const a = act.dataset.act;
        if (a === 'reset') { App.cfg.dash = DA.defaults(); App.saveCfg(); render(); } else if (a === 'print') { document.body.classList.add('dsh-printing'); setTimeout(() => { window.print(); setTimeout(() => document.body.classList.remove('dsh-printing'), 500); }, 100); }
        else if (a === 'oos-auto') applyOos(true); else if (a === 'oos-apply') applyOos(false); else if (a === 'oos-preview') previewOos();
        else if (a === 'oos-override') { App.mutate('Progress Override', () => { P.schedOpts = Object.assign({ logic: 'retained', crit: 'tf', critFloat: 0, lagCal: 'pred', tfMode: 'finish', openCrit: false }, P.schedOpts, { logic: 'override' }); P.retained = false; }); if (!App.cfg.auto) App.runSchedule(); App.toast('Scheduling switched to Progress Override'); render(); }
        return;
      }
      if (e.target.closest('select,input')) return;
      const go = e.target.closest('[data-go]'); if (go) { goTo(+go.dataset.go); return; }
      const dr = e.target.closest('[data-d]'); if (dr) { const [k, ...a] = dr.dataset.d.split(':'); if (DR[k]) { hideTip(); DR[k](...a); } return; }
      const cd = e.target.closest('[data-card]'); if (cd) { hideTip(); actCard(+cd.dataset.card); }
    });
    ROOT.addEventListener('change', (e) => {
      const id = e.target.id || '', f = F();
      if (id.startsWith('df_')) { const k = id.slice(3); f[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; App.saveCfg(); render(); }
      else if (id === 'dg_mode' || id === 'dg_n') { const g = GC(); g[id === 'dg_mode' ? 'mode' : 'n'] = e.target.value; App.saveCfg(); render(); }
      else if (e.target.dataset.fix) oosFix[e.target.dataset.fix] = e.target.value;
    });
    ROOT.addEventListener('input', (e) => { if (e.target.id === 'df_q' || e.target.id === 'df_floatMax') later(() => { F()[e.target.id.slice(3)] = e.target.value; App.saveCfg(); const pos = e.target.selectionStart, id = e.target.id; render(); const i = document.getElementById(id); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch (er) { /* ignore */ } } }); });
    ROOT.addEventListener('mousemove', (e) => { const t = e.target.closest('[data-tip]'); if (t && t.dataset.tip) showTip(e, t.dataset.tip); else hideTip(); });
    ROOT.addEventListener('mouseleave', hideTip);
  };
  App.dashRefresh = render;
  App.dashAnalyse = () => DA.analyse(App.p, F());
})(window);

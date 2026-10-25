/* P6 Web – Group and Sort engine (multi-level grouping by any field) and the Group and Sort / Sort dialogs. */
(function (g) {
  'use strict';
  const P6 = g.P6, App = g.App, D = App.dialogs;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = P6.esc, t = (k, ...a) => P6.t(k, ...a);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const PAL = ['#c8f5c8', '#cfd4ff', '#ffd1f0', '#fff6b8', '#c9eef7', '#ffe0c2', '#e2d4f7', '#d9d9d9'];
  const WBS_PAL = ['#0000ff', '#66ff66', '#ffff00', '#0000ff', '#ff0000'];
  P6.contrast = (hex) => { const h = String(hex || '#fff').replace('#', ''); const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0'); const r = parseInt(n.slice(0, 2), 16), gg = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16); return (0.299 * r + 0.587 * gg + 0.114 * b) / 255 > 0.55 ? '#000' : '#fff'; };
  const newLevel = (by) => ({ by, indent: true, toLevel: 'All', interval: '', color: null, hideEmpty: false, alpha: false, show: { title: false, id: false, name: true } });
  P6.normSorts = (cfg) => (cfg.sorts && cfg.sorts.length ? cfg.sorts : [{ k: cfg.sort || 'code', dir: cfg.sortDir || 1 }]);
  P6.normGrp = (cfg) => {
    if (!cfg.grp) cfg.grp = { levels: cfg.group === 'none' ? [] : [newLevel('wbs')], totals: true, grand: false, summ: false, shrink: false, wbsColors: null };
    const G = cfg.grp; G.levels = G.levels || []; if (G.totals === undefined) G.totals = true;
    cfg.group = G.levels.length ? 'wbs' : 'none';
    return G;
  };
  // ----- group fields
  const DATE_INT = { Day: (d) => d, Week: (d) => d - P6.dow(d), Month: (d) => { const y = P6.ymd(d); return P6.mkDay(y.y, y.m, 1); }, Quarter: (d) => { const y = P6.ymd(d); return P6.mkDay(y.y, y.m - (y.m % 3), 1); }, Year: (d) => P6.mkDay(P6.ymd(d).y, 0, 1) };
  const dateLabel = (interval, d) => { const y = P6.ymd(d); return interval === 'Year' ? String(y.y) : interval === 'Quarter' ? 'Q' + (Math.floor(y.m / 3) + 1) + ' ' + y.y : interval === 'Month' ? P6.MON[y.m] + ' ' + y.y : P6.fmtDate(d); };
  P6.groupFields = function (p) {
    const base = [['wbs', 'WBS'], ['status', 'col_status'], ['type', 'col_type'], ['cal', 'col_cal'], ['crit', 'col_crit'], ['pct', 'col_pct'], ['es', 'col_es'], ['ef', 'col_ef'], ['tf', 'col_tf'], ['dur', 'col_dur'], ['primname', 'col_primname'], ['fp', 'col_fp'], ['cstr', 'col_cstr']];
    const out = base.map(([k, l]) => [k, l === 'WBS' ? 'WBS' : t(l)]);
    for (const ct of p.codeTypes || []) out.push(['ac:' + ct.id, ct.name]);
    for (const u of p.udfs || []) if (u.scope !== 'resource') out.push(['udf:' + u.id, u.name]);
    return out;
  };
  function keyOf(by, tk, ctx, L) {
    const none = { k: '￿', s: 1e15, label: t('grp_none') };
    const iv = parseFloat(L.interval);
    switch (by) {
      case 'status': return { k: tk.status, s: ['NS', 'IP', 'C'].indexOf(tk.status), label: t('st_' + tk.status) };
      case 'type': return { k: tk.type, s: 0, label: t('type_' + tk.type) };
      case 'cal': { const c = ctx.cals.get(tk.cal); return { k: String(tk.cal), s: 0, label: c ? c.name : '' }; }
      case 'crit': { const c = !!tk.crit && tk.status !== 'C'; return { k: c ? '1' : '0', s: c ? 0 : 1, label: c ? t('critical') : t('non_critical') }; }
      case 'primname': { const a = ctx.asgBy.get(tk.id); const r = a ? ctx.rs.get(a[0].rsrc) : null; return r ? { k: String(r.id), s: 0, label: r.name } : none; }
      case 'cstr': return tk.ct ? { k: tk.ct, s: 0, label: t('cs_' + tk.ct) } : none;
      case 'pct': case 'tf': case 'dur': case 'fp': {
        const v = by === 'pct' ? tk.pct : by === 'tf' ? tk.tf : by === 'dur' ? tk.dur : tk.fp; if (v == null) return none;
        if (iv > 0 && by !== 'fp') { const lo = Math.floor(v / iv) * iv; return { k: String(lo), s: lo, label: lo + ' – ' + (lo + iv) }; }
        return { k: String(v), s: v, label: String(Math.round(v * 100) / 100) };
      }
      case 'es': case 'ef': { const d = tk[by]; if (d == null) return none; const fn = DATE_INT[L.interval]; if (!fn) return { k: String(d), s: d, label: P6.fmtDate(d) }; const s = fn(d); return { k: String(s), s, label: dateLabel(L.interval, s) }; }
      default:
        if (/^ac:/.test(by)) { const id = (tk.codes || {})[by.slice(3)]; const v = ctx.codeVal.get(id); if (!v) return none; const sh = L.show || {}; const ct = (ctx.p.codeTypes.find((c) => c.id === v.type) || {}).name; const parts = []; if (sh.title) parts.push(ct + ':'); if (sh.id || (!sh.title && !sh.name)) parts.push(v.short); if (sh.name) parts.push(v.name); return { k: String(id), s: ctx.p.codeVals.indexOf(v), label: parts.join(' ').trim() || v.short }; }
        if (/^udf:/.test(by)) { const v = (tk.udf || {})[by.slice(4)]; if (v == null || v === '') return none; const u = ctx.p.udfs.find((x) => x.id === +by.slice(4)); const lab = u && u.ty === 'date' ? P6.fmtDate(v) : String(v); return { k: lab, s: typeof v === 'number' ? v : 0, label: lab }; }
        return none;
    }
  }
  // ----- aggregation for group bands
  function aggRu(ts) {
    const r = { es: Infinity, ef: -Infinity, bs: Infinity, bf: -Infinity, dur: 0, rem: 0, done: 0, count: ts.length, tf: Infinity, as: Infinity, af: -Infinity, allC: true, nNS: 0, nIP: 0, nC: 0, nCrit: 0, ls: Infinity, lf: -Infinity };
    for (const x of ts) {
      if (x.es != null) { r.es = Math.min(r.es, x.es); r.ef = Math.max(r.ef, x.ef); } if (x.bs != null) { r.bs = Math.min(r.bs, x.bs); r.bf = Math.max(r.bf, x.bf); }
      if (x.as != null) r.as = Math.min(r.as, x.as); if (x.af != null) r.af = Math.max(r.af, x.af);
      r.dur += x.dur || 0; r.done += (x.dur || 0) * (x.pct || 0) / 100; r.rem += x.status === 'C' ? 0 : x.rem || 0; if (x.tf != null) r.tf = Math.min(r.tf, x.tf);
      if (x.status !== 'C') r.allC = false; if (x.status === 'NS') r.nNS++; else if (x.status === 'IP') r.nIP++; else r.nC++; if (x.crit) r.nCrit++;
      if (x.ls != null && x.status !== 'C') { r.ls = Math.min(r.ls, x.ls); r.lf = Math.max(r.lf, x.lf); }
    }
    r.pct = r.dur > 0 ? Math.round((r.done / r.dur) * 100) : 0;
    ['es', 'bs', 'tf', 'ls'].forEach((k) => { if (!isFinite(r[k])) { r[k] = null; if (k === 'es') r.ef = null; if (k === 'bs') r.bf = null; if (k === 'ls') r.lf = null; } });
    return r;
  }
  function aggM(ts, T) { const m = P6.blankMetrics(); for (const x of ts) { const y = T.get(x.id); if (y) P6.METRIC_BASE.forEach((k) => { m[k] += y[k]; }); } return P6.deriveMetrics(m); }

  P6.buildRows = function (p, G, S, o) {
    const rows = []; S.levelColors = [];
    const ctx = S.ctx, all = p.tasks.filter(o.matches).sort(o.cmp);
    const reg = (id, ts) => { S.ru.set(id, aggRu(ts)); ctx.M.W.set(id, aggM(ts, ctx.M.T)); };
    const emit = (ts, depth) => { if (G.summ) return; for (const tk of ts) rows.push({ kind: 't', id: tk.id, level: depth, t: tk }); };
    const kids = new Map(); p.wbs.forEach((w) => kids.set(w.id, [])); const roots = [];
    for (const w of p.wbs) { if (w.parent != null && kids.has(w.parent)) kids.get(w.parent).push(w); else roots.push(w); }
    const ws = (a, b) => (a.seq - b.seq) || o.nat(a.code, b.code);
    const wpal = G.wbsColors || WBS_PAL;
    const level = (ts, li, depth, path) => {
      if (li >= G.levels.length) return emit(ts, depth);
      const L = G.levels[li];
      if (L.by === 'wbs') wbsLevel(ts, li, depth, path, L); else catLevel(ts, li, depth, path, L);
    };
    const wbsLevel = (ts, li, depth, path, L) => {
      const tby = new Map(); ts.forEach((tk) => { if (!tby.has(tk.wbs)) tby.set(tk.wbs, []); tby.get(tk.wbs).push(tk); });
      const showEmpty = li === 0 && !o.filtering && path === '' && ts.length === all.length;
      const cnt = new Map(); const count = (w) => { let n = (tby.get(w.id) || []).length; for (const k of kids.get(w.id)) n += count(k); cnt.set(w.id, n); return n; }; roots.forEach(count);
      const maxD = L.toLevel === 'All' || !L.toLevel ? Infinity : Math.max(1, parseInt(L.toLevel, 10) || 1) - 1;
      const sub = (w) => { const out = (tby.get(w.id) || []).slice(); for (const k of kids.get(w.id)) out.push(...sub(k)); return out; };
      const walk = (w, wd) => {
        if (!showEmpty && !cnt.get(w.id)) return;
        const lv = depth + wd, own = wd < maxD ? (tby.get(w.id) || []).slice().sort(o.cmp) : sub(w).sort(o.cmp);
        const ks = wd < maxD ? kids.get(w.id).slice().sort(ws) : [];
        rows.push({ kind: 'w', id: w.id, level: lv, w, hasKids: ks.length + own.length > 0 });
        S.levelColors[lv] = wpal[wd % wpal.length];
        if (S.collapsed.has(w.id) && !o.filtering) return;
        for (const k of ks) walk(k, wd + 1);
        level(own, li + 1, lv + 1, path + 'w' + w.id);
      };
      roots.slice().sort(ws).forEach((w) => walk(w, 0));
    };
    const catLevel = (ts, li, depth, path, L) => {
      const map = new Map();
      for (const tk of ts) { const v = keyOf(L.by, tk, ctx, L); if (!map.has(v.k)) map.set(v.k, { v, ts: [] }); map.get(v.k).ts.push(tk); }
      if (/^ac:/.test(L.by) && !L.hideEmpty) for (const v of p.codeVals.filter((x) => x.type === +L.by.slice(3))) { const k = String(v.id); if (!map.has(k)) map.set(k, { v: keyOf(L.by, { codes: { [L.by.slice(3)]: v.id } }, ctx, L), ts: [] }); }
      let list = [...map.values()];
      list.sort(L.alpha ? (a, b) => o.nat(a.v.label, b.v.label) : (a, b) => (a.v.s - b.v.s) || o.nat(a.v.label, b.v.label));
      const cd = L.indent === false ? depth : depth + 1, color = L.color || PAL[li % PAL.length];
      for (const grp of list) {
        const id = 'g:' + path + '/' + li + ':' + grp.v.k;
        reg(id, grp.ts); rows.push({ kind: 'g', id, level: depth, w: { id, name: grp.v.label, code: '' }, hasKids: true, color, pb: !!L.pbreak });
        S.levelColors[depth] = color;
        if (S.collapsed.has(id) && !o.filtering) continue;
        level(grp.ts, li + 1, cd, path + '/' + id);
      }
    };
    if (G.grand && G.levels.length) { reg('g:grand', all); rows.push({ kind: 'g', id: 'g:grand', level: 0, w: { id: 'g:grand', name: t('grand_total'), code: '' }, hasKids: false, color: '#bfbfbf' }); }
    level(all, 0, 0, '');
    return rows;
  };

  // ================= Group and Sort dialog =================
  D.groupSort = function () {
    const G = clone(P6.normGrp(App.cfg)); let selI = 0;
    const fields = P6.groupFields(App.p);
    const body = document.createElement('div'); body.className = 'grpdlg';
    const acOpt = () => (fields.some(([k]) => /^ac:/.test(k)) ? '' : `<option value="__codes">${esc(t('grp_defcodes'))}</option>`);
    const rowsHtml = () => {
      const out = []; const lv = G.levels;
      lv.forEach((L, i) => {
        const wbs = L.by === 'wbs', color = wbs ? (G.wbsColors || WBS_PAL)[0] : (L.color || PAL[i % PAL.length]);
        out.push(`<tr data-i="${i}" class="${selI === i ? 'on' : ''}"><td><select data-k="by">${fields.map(([k, l]) => `<option value="${esc(k)}"${L.by === k ? ' selected' : ''}>${esc(wbs && k === 'wbs' ? 'WBS ' + t('grp_level') + ' 1' : l)}</option>`).join('')}${acOpt()}<option value="">${esc(t('grp_none'))}</option></select></td><td style="text-align:center"><input type="checkbox" data-k="indent"${L.indent !== false ? ' checked' : ''}></td><td><input data-k="toLevel" value="${esc(wbs ? L.toLevel || 'All' : '')}"${wbs ? '' : ' disabled'} style="width:70px"></td><td><input data-k="interval" value="${esc(L.interval || '')}" placeholder="${/^(es|ef)$/.test(L.by) ? 'Month' : /^(pct|tf|dur)$/.test(L.by) ? '10' : ''}" style="width:90px"></td><td style="text-align:center"><input type="checkbox" data-k="pbreak"${L.pbreak ? ' checked' : ''}></td><td><input type="color" data-k="color" value="${color}"> <span style="color:#666;font-size:11px">8 Arial</span></td></tr>`);
        if (wbs) for (let w = 1; w < 5; w++) out.push(`<tr class="wl"><td style="color:#888;padding-inline-start:20px">WBS ${esc(t('grp_level'))} ${w + 1}</td><td></td><td></td><td></td><td></td><td><input type="color" data-w="${w}" value="${(G.wbsColors || WBS_PAL)[w]}"></td></tr>`);
      });
      if (lv.length < 8) out.push(`<tr data-i="${lv.length}" class="${selI === lv.length ? 'on' : ''}"><td><select data-k="by" data-new="1"><option value="">—</option>${fields.map(([k, l]) => `<option value="${esc(k)}">${esc(l)}</option>`).join('')}${acOpt()}</select></td><td></td><td></td><td></td><td></td><td></td></tr>`);
      return out.join('');
    };
    const draw = () => {
      const L = G.levels[selI] || null;
      body.innerHTML = `<div class="gd-wrap"><div class="gd-main"><fieldset><legend>${esc(t('grp_display'))}</legend><label class="chk"><input type="checkbox" id="gd_tot"${G.totals !== false ? ' checked' : ''}> ${esc(t('grp_totals'))}</label><label class="chk" style="margin-inline-start:22px"><input type="checkbox" id="gd_grand"${G.grand ? ' checked' : ''}${G.totals === false ? ' disabled' : ''}> ${esc(t('grp_grand'))}</label><label class="chk" style="margin-inline-start:22px"><input type="checkbox" id="gd_sum"${G.summ ? ' checked' : ''}> ${esc(t('grp_summ'))}</label><label class="chk"><input type="checkbox" id="gd_shr"${G.shrink ? ' checked' : ''}> ${esc(t('grp_shrink'))}</label></fieldset>
        <fieldset><legend>${esc(t('grp_by'))}</legend><div class="gd-tbl"><table class="mini"><thead><tr><th>${esc(t('grp_by'))}</th><th style="width:60px">${esc(t('grp_indent'))}</th><th style="width:90px">${esc(t('grp_tolevel'))}</th><th style="width:110px">${esc(t('grp_interval'))}</th><th style="width:70px">${esc(t('grp_pbreak'))}</th><th style="width:130px">${esc(t('grp_fontcolor'))}</th></tr></thead><tbody>${rowsHtml()}</tbody></table></div></fieldset>
        <fieldset><legend>${esc(t('grp_options'))}</legend><label class="chk"><input type="checkbox" id="go_he"${L && L.hideEmpty ? ' checked' : ''}${L && /^ac:/.test(L.by) ? '' : ' disabled'}> ${esc(t('grp_hideempty'))}</label><label class="chk"><input type="checkbox" id="go_al"${L && L.alpha ? ' checked' : ''}${L && L.by !== 'wbs' ? '' : ' disabled'}> ${esc(t('grp_alpha'))}</label><div style="margin-top:6px">${esc(t('grp_show'))}:</div>
        ${['title', 'id', 'name'].map((k) => `<label class="chk" style="margin-inline-start:12px"><input type="checkbox" data-sh="${k}"${L && L.show && L.show[k] ? ' checked' : ''}${L && /^ac:/.test(L.by) ? '' : ' disabled'}> ${esc(t('grp_show_' + k))}</label>`).join('')}</fieldset></div>
<div class="gd-side"><button class="btn pri" data-a="ok"><b class="gi" style="color:#2e9b2e">✔</b>${esc(t('ok'))}</button><button class="btn" data-a="cancel"><b class="gi" style="color:#d03a2f">⦸</b>${esc(t('cancel'))}</button><hr><button class="btn" data-a="apply"><b class="gi" style="color:#2f6fc4">▤</b>${esc(t('apply'))}</button><button class="btn" data-a="del"${L ? '' : ' disabled'}><b class="gi" style="color:#d03a2f">✖</b>${esc(t('delete'))}</button><hr><button class="btn" data-a="sort"><b class="gi" style="color:#2b3340">▭</b>${esc(t('grp_sort'))}…</button><button class="btn" data-a="default"><b class="gi" style="color:#2e9b2e">▶</b>${esc(t('default'))}</button><hr><button class="btn" data-a="help"><b class="gi" style="color:#e0a800">?</b>${esc(t('help'))}</button></div></div>`;
    };
    draw();
    const m = D.modal({ title: t('group_sort').replace('…', ''), cls: 'wide grpmodal', body, buttons: [], sticky: true });
    const apply = () => { App.cfg.grp = clone(G); App.saveCfg(); App.refresh(); App.drawLayoutBar && App.drawLayoutBar(); };
    body.addEventListener('change', (e) => {
      const x = e.target;
      if (x.value === '__codes') { m.close(); D.codes('acg'); return; }
      if (x.id === 'gd_tot') G.totals = x.checked; else if (x.id === 'gd_grand') G.grand = x.checked; else if (x.id === 'gd_sum') G.summ = x.checked; else if (x.id === 'gd_shr') G.shrink = x.checked;
      else if (x.id === 'go_he' && G.levels[selI]) G.levels[selI].hideEmpty = x.checked; else if (x.id === 'go_al' && G.levels[selI]) G.levels[selI].alpha = x.checked;
      else if (x.dataset.sh && G.levels[selI]) { G.levels[selI].show = G.levels[selI].show || {}; G.levels[selI].show[x.dataset.sh] = x.checked; }
      else if (x.dataset.w) { G.wbsColors = (G.wbsColors || WBS_PAL).slice(); G.wbsColors[+x.dataset.w] = x.value; }
      else if (x.dataset.k) {
        const i = +x.closest('tr').dataset.i; let L = G.levels[i];
        if (x.dataset.new) { if (x.value) { G.levels.push(newLevel(x.value)); selI = G.levels.length - 1; } }
        else if (x.dataset.k === 'by') { if (!x.value) G.levels.splice(i, 1); else L.by = x.value; if (L && L.by === 'wbs') L.toLevel = 'All'; }
        else if (x.dataset.k === 'indent') L.indent = x.checked; else if (x.dataset.k === 'pbreak') L.pbreak = x.checked; else if (x.dataset.k === 'color') { if (L.by === 'wbs') { G.wbsColors = (G.wbsColors || WBS_PAL).slice(); G.wbsColors[0] = x.value; } else L.color = x.value; }
        else L[x.dataset.k] = x.value;
      }
      draw();
    });
    body.addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-i]'); if (tr && !e.target.closest('input,select')) { selI = +tr.dataset.i; return draw(); }
      const b = e.target.closest('[data-a]'); if (!b || b.disabled) return; const a = b.dataset.a;
      if (a === 'ok') { apply(); m.close(); } else if (a === 'cancel') m.close(); else if (a === 'apply') apply();
      else if (a === 'del') { G.levels.splice(selI, 1); selI = Math.max(0, selI - 1); draw(); }
      else if (a === 'sort') D.sortDialog();
      else if (a === 'default') { const d = { levels: [newLevel('wbs')], totals: true, grand: false, summ: false, shrink: false, wbsColors: null }; Object.assign(G, d); selI = 0; draw(); }
      else if (a === 'help') D.modal({ title: t('help'), cls: 'mid', body: `<div style="line-height:1.8">${t('grp_help_html')}</div>`, buttons: [{ label: t('close'), cls: 'pri', fn: () => {} }] });
    });
  };

  // ================= Sort dialog =================
  D.sortDialog = function () {
    const cur = clone(P6.normSorts(App.cfg)); while (cur.length < 5) cur.push({ k: '', dir: 1 });
    const keys = Object.keys(App.ALL_COLS).filter((k) => App.ALL_COLS[k].sort || /^(code|name|es|ef|tf|dur|pct)$/.test(k));
    const body = document.createElement('div');
    const draw = () => { body.innerHTML = `<table class="mini"><thead><tr><th>${esc(t('sort_by'))}</th><th style="width:150px">${esc(t('order'))}</th></tr></thead><tbody>${cur.map((s, i) => `<tr data-i="${i}"><td><select data-k="k"><option value="">—</option>${keys.map((k) => `<option value="${esc(k)}"${s.k === k ? ' selected' : ''}>${esc(t('col_' + k))}</option>`).join('')}</select></td><td><select data-k="dir"><option value="1"${s.dir === 1 ? ' selected' : ''}>${esc(t('sort_asc'))}</option><option value="-1"${s.dir === -1 ? ' selected' : ''}>${esc(t('sort_desc'))}</option></select></td></tr>`).join('')}</tbody></table>`; };
    draw();
    D.modal({ title: t('grp_sort').replace('…', ''), cls: 'mid', body, buttons: [{ label: t('default'), fn: () => { App.cfg.sorts = null; App.cfg.sort = 'code'; App.cfg.sortDir = 1; App.saveCfg(); App.refresh(); } }, { label: t('cancel'), fn: () => {} }, { label: t('ok'), cls: 'pri', fn: () => { const s = cur.filter((x) => x.k).map((x) => ({ k: x.k, dir: +x.dir })); App.cfg.sorts = s.length ? s : null; if (s.length) { App.cfg.sort = s[0].k; App.cfg.sortDir = s[0].dir; } App.saveCfg(); App.refresh(); } }] });
    body.addEventListener('change', (e) => { const i = +e.target.closest('tr').dataset.i; cur[i][e.target.dataset.k] = e.target.dataset.k === 'dir' ? +e.target.value : e.target.value; });
  };
})(window);

/* P6 Web – Activity Usage Spreadsheet (bottom dock), Primavera P6 style.
   Mirrors the rows of the Activities table (WBS bands, groups, activities), time-phased on a changeable timescale, with the P6 "Fields" dialog:
   Available Options = Cumulative / Time Interval × Costs, Earned Value, Units  →  Selected Options (ordered).
   Every WBS / group row is the roll-up of its activities; several fields stack as sub-rows with a "Spreadsheet Field" column. Replaces App.renderUsageSheet. */
(function (g) {
  'use strict';
  const P6 = g.P6, App = g.App, D = App.dialogs;
  const esc = P6.esc, B = (en, ar) => (P6.dir() === 'rtl' ? ar : en);
  const F = () => App.cfg;

  /* ------------------------------------------------------------ field catalogue */
  // [key, sub-group, EN, AR, kind (c cost / u units), basis, resource filter]
  const DEFS = [
    ['bc_t', 'costs', 'Budgeted Total Cost', 'إجمالي التكلفة المخططة', 'c', 'bud', null], ['bc_l', 'costs', 'Budgeted Labor Cost', 'تكلفة العمالة المخططة', 'c', 'bud', 'RT_Labor'], ['bc_n', 'costs', 'Budgeted Nonlabor Cost', 'تكلفة المعدات المخططة', 'c', 'bud', 'RT_Equip'], ['bc_m', 'costs', 'Budgeted Material Cost', 'تكلفة المواد المخططة', 'c', 'bud', 'RT_Mat'], ['bc_e', 'costs', 'Budgeted Expense Cost', 'تكلفة المصروفات المخططة', 'c', 'bud', 'exp'],
    ['ac_t', 'costs', 'Actual Total Cost', 'إجمالي التكلفة الفعلية', 'c', 'act', null], ['ac_l', 'costs', 'Actual Labor Cost', 'تكلفة العمالة الفعلية', 'c', 'act', 'RT_Labor'], ['ac_n', 'costs', 'Actual Nonlabor Cost', 'تكلفة المعدات الفعلية', 'c', 'act', 'RT_Equip'], ['ac_m', 'costs', 'Actual Material Cost', 'تكلفة المواد الفعلية', 'c', 'act', 'RT_Mat'], ['ac_e', 'costs', 'Actual Expense Cost', 'تكلفة المصروفات الفعلية', 'c', 'act', 'exp'],
    ['rc_t', 'costs', 'Remaining Total Cost', 'إجمالي التكلفة المتبقية', 'c', 'rem', null], ['rc_l', 'costs', 'Remaining Labor Cost', 'تكلفة العمالة المتبقية', 'c', 'rem', 'RT_Labor'], ['rc_n', 'costs', 'Remaining Nonlabor Cost', 'تكلفة المعدات المتبقية', 'c', 'rem', 'RT_Equip'], ['rc_m', 'costs', 'Remaining Material Cost', 'تكلفة المواد المتبقية', 'c', 'rem', 'RT_Mat'], ['rc_e', 'costs', 'Remaining Expense Cost', 'تكلفة المصروفات المتبقية', 'c', 'rem', 'exp'],
    ['cc_t', 'costs', 'At Completion Total Cost', 'إجمالي التكلفة عند الإكمال', 'c', 'ac', null],
    ['pv_t', 'ev', 'Planned Value Cost', 'تكلفة القيمة المخططة', 'c', 'pv', null], ['ev_t', 'ev', 'Earned Value Cost', 'تكلفة القيمة المكتسبة', 'c', 'ev', null], ['sv_t', 'ev', 'Schedule Variance Cost', 'انحراف الجدول (تكلفة)', 'c', 'sv', null], ['cv_t', 'ev', 'Cost Variance (EV − Actual)', 'انحراف التكلفة (مكتسبة − فعلية)', 'c', 'cv', null],
    ['bu_t', 'units', 'Budgeted Units', 'الوحدات المخططة', 'u', 'bud', null], ['bu_l', 'units', 'Budgeted Labor Units', 'وحدات العمالة المخططة', 'u', 'bud', 'RT_Labor'], ['bu_n', 'units', 'Budgeted Nonlabor Units', 'وحدات المعدات المخططة', 'u', 'bud', 'RT_Equip'], ['bu_m', 'units', 'Budgeted Material Units', 'وحدات المواد المخططة', 'u', 'bud', 'RT_Mat'],
    ['au_t', 'units', 'Actual Units', 'الوحدات الفعلية', 'u', 'act', null], ['ru_t', 'units', 'Remaining Units', 'الوحدات المتبقية', 'u', 'rem', null], ['cu_t', 'units', 'At Completion Units', 'الوحدات عند الإكمال', 'u', 'ac', null],
    ['pv_u', 'units', 'Planned Value Units', 'وحدات القيمة المخططة', 'u', 'pv', null], ['ev_u', 'units', 'Earned Value Units', 'وحدات القيمة المكتسبة', 'u', 'ev', null]
  ];
  const SUBS = [['costs', 'Costs', 'التكاليف'], ['ev', 'Earned Value', 'القيمة المكتسبة'], ['units', 'Units', 'الوحدات']];
  const defOf = (fid) => { const cum = fid.startsWith('c:'), k = fid.slice(2), d = DEFS.find((x) => x[0] === k); return d ? { id: fid, cum, key: k, sub: d[1], en: (cum ? 'Cum ' : '') + d[2], ar: (cum ? 'تراكمي: ' : '') + d[3], kind: d[4], basis: d[5], flt: d[6] } : null; };
  const lab = (f) => B(f.en, f.ar);
  const DEFAULT_FIELDS = ['c:bc_t'];
  const cfg = () => { const c = F(); const u = c.usx = Object.assign({ fields: DEFAULT_FIELDS.slice(), unit: 'Month' }, c.usx); u.fields = (u.fields || []).filter((f) => defOf(f)); if (!u.fields.length) u.fields = DEFAULT_FIELDS.slice(); return u; };
  const ST = { sy: 0, sx: 0 };
  const fmt = (v, kind) => (v == null || !isFinite(v) || Math.abs(v) < 0.005 ? '' : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

  /* ------------------------------------------------------------ calculation */
  function makeEngine(p, P, dayCache) {
    const kit = App.assignKit, dd = p.dataDate, n = P.per.length;
    const xs = kit.rowsOf(p), byTask = new Map();
    for (const x of xs) { if (!byTask.has(x.t.id)) byTask.set(x.t.id, []); byTask.get(x.t.id).push(x); }
    const calOf = (tk) => p.cals.find((c) => c.id === tk.cal) || p.cals[0];
    const wdays = (tk, s, e) => { const cal = calOf(tk), l = []; for (let d = s; d <= e; d++) if (P6.isWork(cal, d)) l.push(d); return l; };
    const put = (out, list, amt) => { if (!list.length || !amt) return; const w = amt / list.length; for (const d of list) { const i = d >= P.s0 && d < P.e0 ? P.idx[d - P.s0] : -1; if (i >= 0) out[i] += w; } };
    function expArr(tk, basis) {
      const out = new Float64Array(n), tot = (tk.expenses || []).reduce((s, q) => s + (+q.budget || 0), 0); if (!tot || tk.es == null) return out;
      const pct = tk.status === 'C' ? 1 : (tk.pct || 0) / 100, early = wdays(tk, tk.es, tk.ef);
      const rem = (amt) => { let l = early.filter((d) => d > dd); if (!l.length && amt) l = [dd + 1]; put(out, l, amt); };
      if (basis === 'bud') put(out, early, tot);
      else if (basis === 'act') put(out, early.filter((d) => d <= dd), tot * pct);
      else if (basis === 'rem') rem(tot * (1 - pct));
      else if (basis === 'ac') { put(out, early.filter((d) => d <= dd), tot * pct); rem(tot * (1 - pct)); }
      else if (basis === 'pv') { const s = tk.bs != null ? tk.bs : tk.es, e = tk.bf != null ? tk.bf : tk.ef; put(out, wdays(tk, s, e), tot); }
      else if (basis === 'ev') put(out, early.filter((d) => d <= dd), tot * pct);
      return out;
    }
    const base = (tk, f, basis, flt, kind) => {
      const out = new Float64Array(n), M = ['', '', '', kind, basis];
      if (flt !== 'exp') for (const x of byTask.get(tk.id) || []) { if (flt && flt !== 'nl' && x.r.type !== flt) continue; const a = kit.phaseRow(x, M, P, dayCache); for (let i = 0; i < n; i++) out[i] += a[i]; }
      if (kind === 'c' && (flt == null || flt === 'exp')) { const e = expArr(tk, basis); for (let i = 0; i < n; i++) out[i] += e[i]; }
      return out;
    };
    const cache = new Map();
    const intervalOf = (tk, f) => {
      const key = tk.id + '|' + f.key; let v = cache.get(key); if (v) return v;
      if (f.basis === 'sv') { const a = base(tk, f, 'ev', null, 'c'), b = base(tk, f, 'pv', null, 'c'); v = a.map((q, i) => q - b[i]); }
      else if (f.basis === 'cv') { const a = base(tk, f, 'ev', null, 'c'), b = base(tk, f, 'act', null, 'c'); v = a.map((q, i) => q - b[i]); }
      else v = base(tk, f, f.basis, f.flt, f.kind);
      cache.set(key, v); return v;
    };
    return { intervalOf };
  }

  /* ------------------------------------------------------------ render */
  const PAL = ['#c8f5c8', '#c9f5f5', '#d7d7ff', '#fff6b8', '#ffe0c2'];
  App.renderUsageSheet = function (el) {
    const p = App.p, U = cfg(), o = App.gantt.o, kit = App.assignKit; if (!p || !kit) return;
    const fields = U.fields.map(defOf), nF = fields.length, rows = App.rows || [], RH = Math.max(18, (App.getRH && App.getRH()) || 22);
    const prev = el.querySelector('.usx-sc'); if (prev) { ST.sy = prev.scrollTop; ST.sx = prev.scrollLeft; }
    // timescale over the Gantt range
    let d0 = o.minDay, d1 = o.maxDay; for (const x of p.tasks) if (x.es != null) { if (x.es < d0) d0 = x.es; if (x.ef > d1) d1 = x.ef; }
    const P = kit.mkPeriods(U.unit, d0, d1), cw = { Day: 46, Week: 60, Month: 92, Quarter: 110, Year: 130 }[U.unit] || 92, n = P.per.length;
    const dayCache = new Map(), eng = makeEngine(p, P, dayCache);
    // tasks under every row
    const kids = new Map(); p.wbs.forEach((w) => kids.set(w.id, [])); p.wbs.forEach((w) => { if (w.parent != null && kids.has(w.parent)) kids.get(w.parent).push(w.id); });
    const tasksByWbs = new Map(); p.tasks.forEach((tk) => { if (!tasksByWbs.has(tk.wbs)) tasksByWbs.set(tk.wbs, []); tasksByWbs.get(tk.wbs).push(tk); });
    const wbsTasks = (id) => { const out = []; const walk = (i) => { out.push(...(tasksByWbs.get(i) || [])); (kids.get(i) || []).forEach(walk); }; walk(id); return out; };
    const rowTasks = (r, i) => {
      if (r.kind === 't') return [r.t];
      if (r.kind === 'w') return wbsTasks(r.w.id);
      const out = []; for (let j = i + 1; j < rows.length && rows[j].level > r.level; j++) { const q = rows[j]; if (q.kind === 't') out.push(q.t); else if (q.kind === 'w') out.push(...wbsTasks(q.w.id)); }
      return [...new Set(out)];
    };
    const rowCache = new Map();
    const rowArr = (i, f) => {
      const r = rows[i], key = r.kind + r.id + '|' + f.id; let v = rowCache.get(key); if (v) return v;
      v = new Float64Array(n); for (const tk of rowTasks(r, i)) { if (tk.es == null) continue; const a = eng.intervalOf(tk, f); for (let k = 0; k < n; k++) v[k] += a[k]; }
      if (f.cum) { let s = 0; for (let k = 0; k < n; k++) { s += v[k]; v[k] = s; } }
      rowCache.set(key, v); return v;
    };
    const wL = [130, 300].concat(nF > 1 ? [170] : []), lw = wL.reduce((a, b) => a + b, 0), tw = lw + n * cw, total = rows.length * nF;
    const dCol = P.per.findIndex((q) => p.dataDate >= q.s && p.dataDate < q.e);
    const tops = []; P.per.forEach((q) => { const l = tops[tops.length - 1]; if (l && l.t === q.top) l.n++; else tops.push({ t: q.top, n: 1 }); });
    const head = `<div class="usx-hd" style="width:${tw}px"><div class="usx-hl" style="width:${lw}px"><div style="width:${wL[0]}px">${esc(B('Activity ID', 'رقم النشاط'))}</div><div style="width:${wL[1]}px">${esc(B('Activity Name', 'اسم النشاط'))}</div>${nF > 1 ? `<div style="width:${wL[2]}px">${esc(B('Spreadsheet Field', 'حقل الجدول'))}</div>` : ''}</div>
      <div class="usx-hr"><div class="usx-ht">${tops.map((x) => `<div style="width:${x.n * cw}px">${esc(x.t)}</div>`).join('')}</div><div class="usx-hb">${P.per.map((q, i) => `<div class="${i === dCol ? 'usx-now' : ''}" style="width:${cw}px">${esc(q.bot)}</div>`).join('')}</div></div></div>`;
    el.style.display = 'flex'; el.style.flexDirection = 'column';
    el.innerHTML = `<div class="dockhead usx-dock">▽ ${esc(B('Activity Usage Spreadsheet', 'جدول استخدام النشاط'))}: ${esc(fields.map(lab).join(' · '))}<span class="usx-tools"><button class="btn sm" data-n="fields">${esc(B('Fields…', 'الحقول…'))}</button><label>${esc(B('Timescale', 'المقياس'))}: <select class="inp" data-n="unit" style="height:20px">${['Day', 'Week', 'Month', 'Quarter', 'Year'].map((u) => `<option value="${u}"${U.unit === u ? ' selected' : ''}>${esc(B(u, { Day: 'يوم', Week: 'أسبوع', Month: 'شهر', Quarter: 'ربع', Year: 'سنة' }[u]))}</option>`).join('')}</select></label><button class="btn sm" data-n="hide">▾</button></span></div>
      <div class="usx-sc" dir="ltr">${head}<div class="usx-bd" style="height:${total * RH}px;width:${tw}px"></div></div>`;
    const sc = el.querySelector('.usx-sc'), bd = el.querySelector('.usx-bd');
    const paint = () => {
      const top = sc.scrollTop - 40, h = sc.clientHeight, a = Math.max(0, Math.floor(top / RH) - 3), z = Math.min(total, Math.ceil((top + h) / RH) + 3), out = [];
      for (let s = a; s < z; s++) {
        const ri = Math.floor(s / nF), fi = s % nF, r = rows[ri], f = fields[fi]; if (!r) continue;
        const arr = rowArr(ri, f), isT = r.kind === 't', bg = isT ? '#fff' : (r.color || PAL[Math.min(4, r.level || 0)]);
        const code = isT ? r.t.code : r.kind === 'w' ? r.w.code : '', name = isT ? r.t.name : r.w.name, sel = App.sel && App.sel.has(r.kind + r.id);
        out.push(`<div class="usx-r${sel ? ' sel' : ''}${fi === nF - 1 ? ' last' : ''}" style="top:${s * RH}px;height:${RH}px;width:${tw}px;background:${bg}"><div class="usx-l" style="width:${lw}px;background:${sel ? '#0a64c8' : bg};${sel ? 'color:#fff;' : ''}"><div style="width:${wL[0]}px" dir="auto">${fi === 0 ? esc(code) : ''}</div><div style="width:${wL[1]}px;padding-inline-start:${6 + (r.level || 0) * 12}px;${isT ? '' : 'font-weight:600;'}" dir="auto">${fi === 0 ? esc(name) : ''}</div>${nF > 1 ? `<div style="width:${wL[2]}px">${esc(lab(f))}</div>` : ''}</div>${[...arr].map((v, k) => `<div class="usx-c${k === dCol ? ' usx-now' : ''}" style="width:${cw}px">${fmt(v, f.kind)}</div>`).join('')}</div>`);
      }
      bd.innerHTML = out.join('');
    };
    sc.scrollTop = ST.sy; sc.scrollLeft = ST.sx; paint();
    sc.onscroll = () => { ST.sy = sc.scrollTop; ST.sx = sc.scrollLeft; paint(); };
    bd.onclick = (e) => { const r = e.target.closest('.usx-r'); if (!r) return; const s = Math.round(parseFloat(r.style.top) / RH), row = rows[Math.floor(s / nF)]; if (row) { if (row.kind === 't') { App.selectRow(row, e); } else App.selectRow(row, e); } };
    el.onchange = (e) => { if (e.target.dataset.n === 'unit') { U.unit = e.target.value; App.saveCfg(); App.renderUsageSheet(el); } };
    el.onclick = (e) => { const b = e.target.closest('[data-n]'); if (!b || b.tagName === 'SELECT') return; if (b.dataset.n === 'fields') fieldsDialog(); else if (b.dataset.n === 'hide') App.setDock('none'); };
  };

  /* ------------------------------------------------------------ P6 "Fields" dialog */
  function fieldsDialog() {
    const U = cfg(); let sel = U.fields.slice(); const open = new Set(['c', 'i', 'c:costs']); let selAv = null, selSel = null;
    const body = document.createElement('div');
    const draw = () => {
      const tree = [['c', B('Cumulative', 'تراكمي')], ['i', B('Time Interval', 'فترة زمنية')]].map(([gk, gl]) => {
        const o1 = open.has(gk);
        return `<div class="usx-g1" data-tg="${gk}"><span class="usx-pm">${o1 ? '−' : '+'}</span>${esc(gl)}</div>` + (o1 ? SUBS.map(([sk, en, ar]) => {
          const key = gk + ':' + sk, o2 = open.has(key);
          return `<div class="usx-g2" data-tg="${key}"><span class="usx-pm">${o2 ? '−' : '+'}</span>${esc(B(en, ar))}</div>` + (o2 ? DEFS.filter((d) => d[1] === sk).map((d) => { const fid = gk + ':' + d[0], used = sel.includes(fid); return `<div class="usx-g3${selAv === fid ? ' on' : ''}${used ? ' used' : ''}" data-av="${fid}">${esc((gk === 'c' ? B('Cum ', 'تراكمي: ') : '') + B(d[2], d[3]))}</div>`; }).join('') : '');
        }).join('') : '');
      }).join('');
      body.innerHTML = `<div class="usx-fd"><div class="usx-box"><div class="usx-bh">▽ ${esc(B('Available Options', 'الخيارات المتاحة'))}</div><div class="usx-tree">${tree}</div></div>
        <div class="usx-mid"><button data-m="add">▶</button><button data-m="addall">▶▶</button><button data-m="rem">◀</button><button data-m="remall">◀◀</button></div>
        <div class="usx-box"><div class="usx-bh">${esc(B('Selected Options', 'الخيارات المحددة'))}</div><div class="usx-tree">${sel.map((fid) => `<div class="usx-g3${selSel === fid ? ' on' : ''}" data-se="${fid}">${esc(lab(defOf(fid)))}</div>`).join('')}</div></div>
        <div class="usx-mid"><button data-m="up">▲</button><button data-m="dn">▼</button></div></div>`;
    };
    draw();
    body.onclick = (e) => {
      const tg = e.target.closest('[data-tg]'), av = e.target.closest('[data-av]'), se = e.target.closest('[data-se]'), m = e.target.closest('[data-m]');
      if (tg) { const k = tg.dataset.tg; if (open.has(k)) open.delete(k); else open.add(k); }
      else if (av) { selAv = av.dataset.av; selSel = null; }
      else if (se) { selSel = se.dataset.se; selAv = null; }
      else if (m) {
        const a = m.dataset.m;
        if (a === 'add' && selAv && !sel.includes(selAv)) sel.push(selAv);
        else if (a === 'addall') { const all = []; ['c', 'i'].forEach((g1) => DEFS.forEach((d) => all.push(g1 + ':' + d[0]))); const gk = selAv ? selAv.slice(0, 1) : null; (gk ? all.filter((x) => x[0] === gk) : all).forEach((x) => { if (!sel.includes(x)) sel.push(x); }); }
        else if (a === 'rem' && selSel) { sel = sel.filter((x) => x !== selSel); selSel = null; }
        else if (a === 'remall') { sel = []; selSel = null; }
        else if (a === 'up' && selSel) { const i = sel.indexOf(selSel); if (i > 0) [sel[i - 1], sel[i]] = [sel[i], sel[i - 1]]; }
        else if (a === 'dn' && selSel) { const i = sel.indexOf(selSel); if (i >= 0 && i < sel.length - 1) [sel[i + 1], sel[i]] = [sel[i], sel[i + 1]]; }
      } else return;
      draw();
    };
    body.ondblclick = (e) => { const av = e.target.closest('[data-av]'), se = e.target.closest('[data-se]'); if (av && !sel.includes(av.dataset.av)) sel.push(av.dataset.av); else if (se) sel = sel.filter((x) => x !== se.dataset.se); draw(); };
    const apply = () => { U.fields = sel.length ? sel.slice() : DEFAULT_FIELDS.slice(); App.saveCfg(); App.redrawDock && App.redrawDock(); };
    D.modal({ title: B('Fields', 'الحقول'), cls: 'wide', body, buttons: [
      { label: 'OK', cls: 'pri', fn: () => { apply(); } },
      { label: B('Cancel', 'إلغاء'), fn: () => {} },
      { label: B('Apply', 'تطبيق'), fn: () => { apply(); return false; } },
      { label: B('Default', 'الافتراضي'), fn: () => { sel = DEFAULT_FIELDS.slice(); selSel = null; draw(); return false; } }] });
  }
  // the global "Bottom Layout Options" command opens the Fields dialog while this spreadsheet is the bottom pane
  const bo = D.bottomOptions; D.bottomOptions = function () { if (F().dock === 'usagesheet') return fieldsDialog(); return bo.apply(this, arguments); };
  App.usageFieldsDialog = fieldsDialog;
})(window);

/* P6 Web – Resource Assignments window, Primavera style: a grid of activity × resource assignments with multi-level Group and Sort (e.g. Resource ▸ WBS),
   a Columns dialog (Available / Selected options), and a time-phased spreadsheet on the right with a changeable timescale (Day … Year) and Display measure
   (units / costs, early / late, cumulative). Both panes are virtualized so thousands of assignments stay fast. Layout lives in cfg.ra. */
(function (g) {
  'use strict';
  const P6 = g.P6, App = g.App, D = App.dialogs;
  const esc = P6.esc, t = (k, ...a) => P6.t(k, ...a), B = (en, ar) => (P6.dir() === 'rtl' ? ar : en);
  const fmtD = P6.fmtDate, money = (v) => P6.fmtKind('money', v);
  const n2 = (v) => (v == null || !isFinite(v) ? '' : String(Math.round(v * 100) / 100));
  const RH = 24, ST = { sel: null, collapsed: new Set(), sy: 0, sxr: 0, sxl: 0 };
  const RT = { RT_Labor: ['Labor', 'عمالة'], RT_Equip: ['Nonlabor', 'معدات'], RT_Mat: ['Material', 'مواد'] };

  // ---------------------------------------------------------------- numbers
  function asgNums(a, tk, r) {
    const sp = P6.asgSplit(a, tk), price = a.price != null ? +a.price : P6.priceAt(r || {}, tk.es);
    return { bu: a.qty, au: sp.act, ru: sp.rem, acu: sp.act + sp.rem, bc: a.qty * price, ac: sp.act * price, rc: sp.rem * price, acc: (sp.act + sp.rem) * price, price };
  }

  // ---------------------------------------------------------------- field registry (columns)
  // [category, en, ar, width, align, get(row) -> text, agg, raw(row)]
  const CATS = [['gen', 'General', 'عام'], ['dates', 'Dates', 'التواريخ'], ['dur', 'Durations', 'المدد'], ['units', 'Units', 'الوحدات'], ['costs', 'Costs', 'التكاليف'], ['pct', 'Percent Completes', 'نسب الإنجاز'], ['ev', 'Earned Value', 'القيمة المكتسبة'], ['acg', 'Activity Codes', 'أكواد الأنشطة'], ['udf', 'User Defined', 'حقول المستخدم']];
  const dt = (d) => (d == null ? '' : fmtD(d));
  const STAT = { NS: ['Not Started', 'لم يبدأ'], IP: ['In Progress', 'جارٍ'], C: ['Completed', 'مكتمل'] };
  const TYPES = { TT_Task: 'Task Dependent', TT_Mile: 'Start Milestone', TT_FinMile: 'Finish Milestone', TT_Rsrc: 'Resource Dependent', TT_LOE: 'Level of Effort', TT_WBS: 'WBS Summary' };
  function wbsPath(row, p) { const m = row.wm; const out = []; let w = row.w; while (w) { out.unshift(w); w = w.parent != null ? m.get(w.parent) : null; } return out; }
  const BASE = {
    code: ['gen', 'Activity ID', 'رقم النشاط', 110, '', (x) => x.t.code, null, (x) => String(x.t.code)],
    name: ['gen', 'Activity Name', 'اسم النشاط', 250, '', (x) => x.t.name, null],
    wbscode: ['gen', 'WBS Code', 'كود WBS', 100, '', (x) => (x.w ? x.w.code : ''), null],
    wbsname: ['gen', 'WBS Name', 'اسم WBS', 180, '', (x) => (x.w ? x.w.name : ''), null],
    rid: ['gen', 'Resource ID', 'رقم المورد', 90, '', (x) => x.r.short || '', null],
    rname: ['gen', 'Resource Name', 'اسم المورد', 190, '', (x) => x.r.name, null],
    res: ['gen', 'Resource ID / Name', 'المورد', 260, '', (x) => ((x.r.short ? x.r.short + ' ' : '') + x.r.name).trim(), null],
    rtype: ['gen', 'Resource Type', 'نوع المورد', 100, '', (x) => B(...(RT[x.r.type] || ['', ''])), null],
    role: ['gen', 'Role', 'الدور', 140, '', (x) => { const ro = x.a.role != null ? x.pm.roles.get(x.a.role) : null; return ro ? ro.name : x.r.role || ''; }, null],
    acct: ['gen', 'Cost Account', 'حساب التكلفة', 150, '', (x) => { const c = x.a.acct != null ? x.pm.accts.get(x.a.acct) : null; return c ? c.code + ' – ' + c.name : ''; }, null],
    prim: ['gen', 'Primary Resource', 'المورد الأساسي', 110, 'c', (x) => (x.a.primary ? B('Yes', 'نعم') : ''), null],
    ratetype: ['gen', 'Rate Type', 'نوع السعر', 100, '', () => 'Standard Rate', null],
    cal: ['gen', 'Calendar', 'التقويم', 160, '', (x) => { const c = x.pm.cals.get(x.t.cal); return c ? c.name : ''; }, null],
    status: ['gen', 'Activity Status', 'حالة النشاط', 110, '', (x) => B(...(STAT[x.t.status] || ['', ''])), null],
    atype: ['gen', 'Activity Type', 'نوع النشاط', 130, '', (x) => TYPES[x.t.type] || x.t.type, null],
    uom: ['gen', 'Unit of Measure', 'وحدة القياس', 90, '', (x) => x.r.unit || '', null],
    start: ['dates', 'Start', 'البداية', 96, '', (x) => dt(x.a.as != null ? x.a.as : x.t.es), 'min', (x) => (x.a.as != null ? x.a.as : x.t.es)],
    finish: ['dates', 'Finish', 'النهاية', 96, '', (x) => dt(x.a.af != null ? x.a.af : x.t.ef), 'max', (x) => (x.a.af != null ? x.a.af : x.t.ef)],
    as: ['dates', 'Actual Start', 'البداية الفعلية', 96, '', (x) => dt(x.a.as != null ? x.a.as : x.t.as), 'min', (x) => (x.a.as != null ? x.a.as : x.t.as)],
    af: ['dates', 'Actual Finish', 'النهاية الفعلية', 96, '', (x) => dt(x.a.af != null ? x.a.af : x.t.af), 'max', (x) => (x.a.af != null ? x.a.af : x.t.af)],
    es: ['dates', 'Early Start', 'البداية المبكرة', 96, '', (x) => dt(x.t.es), 'min', (x) => x.t.es],
    ef: ['dates', 'Early Finish', 'النهاية المبكرة', 96, '', (x) => dt(x.t.ef), 'max', (x) => x.t.ef],
    ls: ['dates', 'Late Start', 'البداية المتأخرة', 96, '', (x) => dt(x.t.ls), 'min', (x) => x.t.ls],
    lf: ['dates', 'Late Finish', 'النهاية المتأخرة', 96, '', (x) => dt(x.t.lf), 'max', (x) => x.t.lf],
    bs: ['dates', 'Baseline Start', 'بداية الـ Baseline', 100, '', (x) => dt(x.t.bs), 'min', (x) => x.t.bs],
    bf: ['dates', 'Baseline Finish', 'نهاية الـ Baseline', 100, '', (x) => dt(x.t.bf), 'max', (x) => x.t.bf],
    dur: ['dur', 'Original Duration', 'المدة الأصلية', 90, 'r', (x) => n2(x.t.dur), null, (x) => x.t.dur],
    rem: ['dur', 'Remaining Duration', 'المدة المتبقية', 100, 'r', (x) => n2(x.t.status === 'C' ? 0 : x.t.rem), null, (x) => (x.t.status === 'C' ? 0 : x.t.rem)],
    tf: ['dur', 'Total Float', 'الفلوت', 80, 'r', (x) => (x.t.tf == null ? '' : n2(x.t.tf)), null, (x) => x.t.tf],
    bu: ['units', 'Budgeted Total Units', 'الوحدات المخططة', 120, 'r', (x) => n2(x.N.bu), 'sum', (x) => x.N.bu],
    au: ['units', 'Actual Total Units', 'الوحدات الفعلية', 120, 'r', (x) => n2(x.N.au), 'sum', (x) => x.N.au],
    ru: ['units', 'Remaining Total Units', 'الوحدات المتبقية', 120, 'r', (x) => n2(x.N.ru), 'sum', (x) => x.N.ru],
    acu: ['units', 'At Completion Total Units', 'الوحدات عند الإنجاز', 140, 'r', (x) => n2(x.N.acu), 'sum', (x) => x.N.acu],
    upt: ['units', 'Units / Time', 'وحدات / يوم', 90, 'r', (x) => n2(x.N.bu / Math.max(1, x.t.dur)), null, (x) => x.N.bu / Math.max(1, x.t.dur)],
    price: ['units', 'Price / Unit', 'سعر الوحدة', 90, 'r', (x) => n2(x.N.price), null, (x) => x.N.price],
    bc: ['costs', 'Budgeted Total Cost', 'التكلفة المخططة', 130, 'r', (x) => money(x.N.bc), 'sum', (x) => x.N.bc],
    ac: ['costs', 'Actual Total Cost', 'التكلفة الفعلية', 130, 'r', (x) => money(x.N.ac), 'sum', (x) => x.N.ac],
    rc: ['costs', 'Remaining Total Cost', 'التكلفة المتبقية', 130, 'r', (x) => money(x.N.rc), 'sum', (x) => x.N.rc],
    acc: ['costs', 'At Completion Total Cost', 'التكلفة عند الإنجاز', 150, 'r', (x) => money(x.N.acc), 'sum', (x) => x.N.acc],
    pct: ['pct', 'Activity % Complete', '% إنجاز النشاط', 110, 'r', (x) => n2(x.t.status === 'C' ? 100 : x.t.pct || 0) + '%', null, (x) => (x.t.status === 'C' ? 100 : x.t.pct || 0)],
    upct: ['pct', 'Units % Complete', '% إنجاز الوحدات', 110, 'r', (x) => n2(x.N.bu ? (100 * x.N.au) / x.N.bu : 0) + '%', null, (x) => (x.N.bu ? x.N.au / x.N.bu : 0)],
    cpct: ['pct', 'Cost % Complete', '% إنجاز التكلفة', 110, 'r', (x) => n2(x.N.bc ? (100 * x.N.ac) / x.N.bc : 0) + '%', null, (x) => (x.N.bc ? x.N.ac / x.N.bc : 0)],
    pv: ['ev', 'Planned Value Cost', 'القيمة المخططة', 130, 'r', (x) => money(x.pv), 'sum', (x) => x.pv],
    ev: ['ev', 'Earned Value Cost', 'القيمة المكتسبة', 130, 'r', (x) => money(x.ev), 'sum', (x) => x.ev],
    sv: ['ev', 'Schedule Variance Cost', 'انحراف الجدول', 130, 'r', (x) => money(x.ev - x.pv), 'sum', (x) => x.ev - x.pv],
    cv: ['ev', 'Cost Variance', 'انحراف التكلفة', 130, 'r', (x) => money(x.ev - x.N.ac), 'sum', (x) => x.ev - x.N.ac],
  };
  const DEF_COLS = ['code', 'name', 'res', 'rtype', 'start', 'finish', 'bu', 'bc'];
  function fields(p) {
    const F = Object.assign({}, BASE);
    for (const ct of p.codeTypes || []) F['ac:' + ct.id] = ['acg', ct.name, ct.name, 130, '', (x) => { const v = x.pm.codeVal.get((x.t.codes || {})[ct.id]); return v ? v.short || v.name || '' : ''; }, null];
    for (const u of p.udfs || []) if (u.scope !== 'resource') F['udf:' + u.id] = ['udf', u.name, u.name, 120, '', (x) => { const v = (x.t.udf || {})[u.id]; return v == null ? '' : u.ty === 'date' ? dt(v) : String(v); }, null];
    return F;
  }
  const labelOf = (F, k) => { const f = F[k]; return f ? B(f[1], f[2]) : k; };

  // ---------------------------------------------------------------- config
  function cfg() {
    const c = App.cfg; if (!c.ra) c.ra = {}; const R = c.ra;
    if (!R.cols || !R.cols.length) R.cols = DEF_COLS.map((k) => ({ k, w: BASE[k][3] }));
    if (!R.grp) R.grp = { levels: [P6.newGroupLevel('rsrc'), P6.newGroupLevel('wbs')], totals: true, grand: false, summ: false, shrink: false, wbsColors: null };
    if (!R.sorts) R.sorts = [{ k: 'code', dir: 1 }];
    R.measure = R.measure || 'ru'; if (R.cum == null) R.cum = false;
    R.ts = Object.assign({ unit: 'Month', w: 0, start: null, end: null }, R.ts);
    R.split = R.split || 0; R.showTS = R.showTS !== false;
    return R;
  }

  // ---------------------------------------------------------------- measures for the spreadsheet
  const MEAS = [
    ['bu', 'Budgeted Units', 'الوحدات المخططة', 'u', 'bud'], ['au', 'Actual Units', 'الوحدات الفعلية', 'u', 'act'], ['ru', 'Remaining Early Units', 'الوحدات المتبقية (مبكر)', 'u', 'rem'], ['rlu', 'Remaining Late Units', 'الوحدات المتبقية (متأخر)', 'u', 'reml'], ['acu', 'At Completion Units', 'الوحدات عند الإنجاز', 'u', 'ac'],
    ['bc', 'Budgeted Cost', 'التكلفة المخططة', 'c', 'bud'], ['ac', 'Actual Cost', 'التكلفة الفعلية', 'c', 'act'], ['rc', 'Remaining Early Cost', 'التكلفة المتبقية (مبكر)', 'c', 'rem'], ['rlc', 'Remaining Late Cost', 'التكلفة المتبقية (متأخر)', 'c', 'reml'], ['acc', 'At Completion Cost', 'التكلفة عند الإنجاز', 'c', 'ac'],
    ['pvc', 'Planned Value Cost', 'القيمة المخططة', 'c', 'pv'], ['evc', 'Earned Value Cost', 'القيمة المكتسبة', 'c', 'ev'],
  ];
  const measOf = (k) => MEAS.find((m) => m[0] === k) || MEAS[2];

  // ---------------------------------------------------------------- periods (timescale)
  function snap(unit, d) { const y = P6.ymd(d); switch (unit) { case 'Day': return d; case 'Week': return d - P6.dow(d); case 'Month': return P6.mkDay(y.y, y.m, 1); case 'Quarter': return P6.mkDay(y.y, y.m - (y.m % 3), 1); default: return P6.mkDay(y.y, 0, 1); } }
  function nextOf(unit, d) { const y = P6.ymd(d); switch (unit) { case 'Day': return d + 1; case 'Week': return d + 7; case 'Month': return P6.mkDay(y.y, y.m + 1, 1); case 'Quarter': return P6.mkDay(y.y, y.m + 3, 1); default: return P6.mkDay(y.y + 1, 0, 1); } }
  function mkPeriods(unit, d0, d1) {
    const per = []; let d = snap(unit, d0);
    while (d <= d1 && per.length < 1500) {
      const n = nextOf(unit, d), y = P6.ymd(d);
      const bot = unit === 'Day' || unit === 'Week' ? String(y.d) : unit === 'Month' ? P6.MON[y.m] : unit === 'Quarter' ? 'Q' + (Math.floor(y.m / 3) + 1) : String(y.y);
      const top = unit === 'Day' || unit === 'Week' ? P6.MON[y.m] + ' ' + String(y.y).slice(2) : unit === 'Month' || unit === 'Quarter' ? String(y.y) : '';
      per.push({ s: d, e: n, bot, top }); d = n;
    }
    const s0 = per.length ? per[0].s : d0, last = per.length ? per[per.length - 1].e : d0 + 1, idx = new Int32Array(Math.max(1, last - s0)).fill(-1);
    per.forEach((q, i) => { for (let x = q.s; x < q.e; x++) idx[x - s0] = i; });
    return { per, s0, e0: last, idx };
  }

  // ---------------------------------------------------------------- phasing
  function phaseRow(x, M, P, dayCache) {
    const out = new Float64Array(P.per.length), tk = x.t; if (tk.es == null || !P.per.length) return out;
    const dd = App.p.dataDate, cost = M[3] === 'c', N = x.N, tot = (b) => (cost ? N[{ bud: 'bc', act: 'ac', rem: 'rc' }[b]] : N[{ bud: 'bu', act: 'au', rem: 'ru' }[b]]);
    const days = (s, e) => { const key = tk.id + ':' + s + ':' + e; let v = dayCache.get(key); if (!v) { const cal = x.pm.cals.get(tk.cal) || App.p.cals[0], l = []; for (let d = s; d <= e; d++) if (P6.isWork(cal, d)) l.push(d); v = l; dayCache.set(key, v); } return v; };
    const put = (list, amt) => { if (!list.length || !amt) return; const w = amt / list.length; for (const d of list) { const i = d >= P.s0 && d < P.e0 ? P.idx[d - P.s0] : -1; if (i >= 0) out[i] += w; } };
    const basis = M[4];
    const early = days(tk.es, tk.ef);
    const rem = (s, e, amt) => { let l = days(s, e).filter((d) => d > dd); if (!l.length) { if (amt && e >= s && e <= dd) l = [dd + 1]; } put(l, amt); };
    if (basis === 'bud') put(early, tot('bud'));
    else if (basis === 'act') put(days(tk.es, Math.min(dd, tk.af != null ? tk.af : tk.ef)), tot('act'));
    else if (basis === 'rem') rem(tk.es, tk.ef, tot('rem'));
    else if (basis === 'reml') rem(tk.ls != null ? tk.ls : tk.es, tk.lf != null ? tk.lf : tk.ef, tot('rem'));
    else if (basis === 'ac') { put(days(tk.es, Math.min(dd, tk.af != null ? tk.af : tk.ef)), tot('act')); rem(tk.es, tk.ef, tot('rem')); }
    else if (basis === 'pv') { const s = tk.bs != null ? tk.bs : tk.es, e = tk.bf != null ? tk.bf : tk.ef; put(days(s, e), cost ? N.bc : N.bu); }
    else if (basis === 'ev') put(days(tk.es, Math.min(dd, tk.ef)), (cost ? N.bc : N.bu) * (tk.status === 'C' ? 1 : (tk.pct || 0) / 100));
    return out;
  }

  // ---------------------------------------------------------------- group keys
  const DATE_INT = { Day: (d) => d, Week: (d) => d - P6.dow(d), Month: (d) => snap('Month', d), Quarter: (d) => snap('Quarter', d), Year: (d) => snap('Year', d) };
  function gKey(by, x, L, F) {
    const none = { k: '￿', s: 1e15, label: B('(none)', '(بدون)') };
    const f = F[by]; const show = L.show || { name: true };
    switch (by) {
      case 'rsrc': { const parts = []; if (show.title) parts.push(B('Resource: ', 'المورد: ')); if (show.id && x.r.short) parts.push(x.r.short); if (show.name !== false || !show.id) parts.push((show.id && show.name !== false ? '– ' : '') + x.r.name); return { k: String(x.r.id), s: x.r.name.toLowerCase(), label: parts.join(' ').trim() || x.r.name }; }
      case 'acct': { const c = x.a.acct != null ? x.pm.accts.get(x.a.acct) : null; if (!c) return { k: '0', s: 'zzz', label: B('No Cost Account', 'بدون حساب تكلفة') }; const parts = []; if (show.title) parts.push(B('Cost Account: ', 'حساب التكلفة: ')); if (show.id) parts.push(c.code); if (show.name !== false || !show.id) parts.push((show.id ? '– ' : '') + c.name); return { k: String(c.id), s: c.code, label: parts.join(' ') }; }
      case 'role': { const v = BASE.role[5](x); return v ? { k: v, s: v.toLowerCase(), label: v } : none; }
      case 'rtype': return { k: x.r.type, s: x.r.type, label: B(...RT[x.r.type]) };
      case 'status': return { k: x.t.status, s: ['NS', 'IP', 'C'].indexOf(x.t.status), label: B(...STAT[x.t.status]) };
      case 'atype': return { k: x.t.type, s: x.t.type, label: TYPES[x.t.type] || x.t.type };
      case 'cal': { const c = x.pm.cals.get(x.t.cal); return { k: String(x.t.cal), s: c ? c.name : '', label: c ? c.name : '' }; }
      case 'es': case 'ef': { const d = x.t[by]; if (d == null) return none; const fn = DATE_INT[L.interval]; if (!fn) return { k: String(d), s: d, label: fmtD(d) }; const s = fn(d), y = P6.ymd(s); return { k: String(s), s, label: L.interval === 'Year' ? String(y.y) : L.interval === 'Quarter' ? 'Q' + (Math.floor(y.m / 3) + 1) + ' ' + y.y : L.interval === 'Month' ? P6.MON[y.m] + ' ' + y.y : fmtD(s) }; }
      default:
        if (/^ac:/.test(by)) { const v = x.pm.codeVal.get((x.t.codes || {})[by.slice(3)]); if (!v) return none; const parts = []; if (show.id) parts.push(v.short); if (show.name !== false || !show.id) parts.push(v.name || v.desc || v.short); return { k: String(v.id), s: (v.short || '').toLowerCase(), label: parts.filter(Boolean).join(' – ') || v.short }; }
        if (/^udf:/.test(by)) { const v = (x.t.udf || {})[by.slice(4)]; if (v == null || v === '') return none; return { k: String(v), s: String(v).toLowerCase(), label: String(v) }; }
        return f ? { k: '', s: '', label: '' } : none;
    }
  }
  function wbsChain(x) { const ch = wbsPath(x); return ch; }
  const wbsDepth = (x) => { let n = 0, w = x.w; while (w) { n++; w = w.parent != null ? x.wm.get(w.parent) : null; } return n; };

  // ---------------------------------------------------------------- tree building
  const PAL = ['#c8f5c8', '#cfd4ff', '#ffd1f0', '#fff6b8', '#c9eef7', '#ffe0c2', '#e2d4f7', '#d9d9d9'], WBS_PAL = ['#0000ff', '#66ff66', '#ffff00', '#0000ff', '#ff0000'];
  function buildTree(rows, R, F) {
    const G = R.grp, levels = G.levels.filter((L) => L.by); let idc = 0;
    const sortVal = (x, k) => { const f = F[k]; if (!f) return ''; const v = f[7] ? f[7](x) : f[5](x); return v == null ? '' : typeof v === 'number' ? v : String(v).toLowerCase(); };
    const cmp = (a, b) => { for (const s of R.sorts) { const x = sortVal(a, s.k), y = sortVal(b, s.k); let r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true }); if (x === '' && y !== '') r = 1; else if (y === '' && x !== '') r = -1; if (r) return r * s.dir; } return 0; };
    // expand the WBS level into nested steps
    const maxDepth = Math.max(1, ...rows.map(wbsDepth));
    const steps = [];
    levels.forEach((L, li) => {
      if (L.by === 'wbs') { const to = L.toLevel === 'All' || !L.toLevel ? maxDepth : Math.max(1, parseInt(L.toLevel, 10) || maxDepth); for (let d = 1; d <= Math.min(to, maxDepth); d++) steps.push({ L, li, wbs: d }); } else steps.push({ L, li });
    });
    function grow(list, si, path, lvIdx) {
      if (si >= steps.length) return list.sort(cmp).map((x) => ({ type: 'a', x }));
      const st = steps[si], buckets = new Map(), direct = [];
      for (const x of list) {
        let key;
        if (st.wbs) { const ch = wbsPath(x); const w = ch[st.wbs - 1]; if (!w) { direct.push(x); continue; } key = { k: 'w' + w.id, s: (w.seq != null ? String(w.seq).padStart(6, '0') : '') + w.code, label: show(st.L, w), w }; }
        else key = gKey(st.L.by, x, st.L, F);
        let b = buckets.get(key.k); if (!b) { b = { key, rows: [] }; buckets.set(key.k, b); } b.rows.push(x);
      }
      let bs = [...buckets.values()];
      bs.sort((a, b) => (st.L.alpha || st.wbs ? String(a.key.s).localeCompare(String(b.key.s), undefined, { numeric: true }) : typeof a.key.s === 'number' && typeof b.key.s === 'number' ? a.key.s - b.key.s : String(a.key.s).localeCompare(String(b.key.s), undefined, { numeric: true })));
      const out = bs.map((b) => { const id = path + '/' + b.key.k; return { type: 'g', id, level: si, L: st.L, li: st.li, wbs: st.wbs || 0, label: b.key.label, rows: b.rows, kids: grow(b.rows, si + 1, id, lvIdx) }; });
      if (direct.length) out.push(...grow(direct, si + 1, path + '/d', lvIdx));
      return out;
    }
    function show(L, w) { const s = L.show || {}; const parts = []; if (s.id) parts.push(w.code); if (s.name !== false || !s.id) parts.push(w.name); return (s.title ? B('WBS: ', 'WBS: ') : '') + parts.join(' – '); }
    void idc;
    return { steps, kids: grow(rows, 0, '', 0) };
  }
  function flatten(tree, R) {
    const out = [], G = R.grp;
    const walk = (nodes, depth) => { for (const n of nodes) { if (n.type === 'a') { if (!G.summ) out.push({ n, depth }); continue; } out.push({ n, depth }); if (!ST.collapsed.has(n.id)) walk(n.kids, depth + 1); } };
    walk(tree.kids, 0); return out;
  }

  // ---------------------------------------------------------------- main render
  function render(el) {
    const p = App.p, R = cfg(), F = fields(p);
    const pm = { cals: new Map(p.cals.map((c) => [c.id, c])), roles: new Map((p.roles || []).map((x) => [x.id, x])), accts: new Map((p.accounts || []).map((x) => [x.id, x])), codeVal: new Map((p.codeVals || []).map((v) => [v.id, v])) };
    const tm = new Map(p.tasks.map((x) => [x.id, x])), rm = new Map(p.rsrc.map((x) => [x.id, x])), wm = new Map(p.wbs.map((x) => [x.id, x])), dd = p.dataDate;
    const rows = [];
    for (const a of p.asg) { const tk = tm.get(a.task), r = rm.get(a.rsrc); if (!tk || !r) continue; const N = asgNums(a, tk, r); const bc = N.bc, s = tk.bs != null ? tk.bs : tk.es, e = tk.bf != null ? tk.bf : tk.ef; let pv = 0; if (s != null && e != null) pv = bc * Math.max(0, Math.min(1, (dd - s + 1) / Math.max(1, e - s + 1))); rows.push({ a, t: tk, r, w: wm.get(tk.wbs), wm, pm, N, pv, ev: bc * (tk.status === 'C' ? 1 : (tk.pct || 0) / 100) }); }
    const tree = buildTree(rows, R, F), flat = flatten(tree, R);
    // grand total row
    const gt = R.grp.grand ? { n: { type: 'grand', rows }, depth: 0 } : null; if (gt) flat.unshift(gt);
    // columns
    const cols = R.cols.filter((c) => F[c.k]).map((c) => Object.assign({}, c, { f: F[c.k] }));
    const lw = cols.reduce((s, c) => s + (c.w || c.f[3]), 0);
    // timescale
    let d0 = Infinity, d1 = -Infinity; for (const x of rows) { if (x.t.es != null) { d0 = Math.min(d0, x.t.es); d1 = Math.max(d1, x.t.ef); } }
    if (R.ts.start != null) d0 = R.ts.start; if (R.ts.end != null) d1 = R.ts.end; if (!isFinite(d0)) { d0 = dd; d1 = dd + 30; }
    if (R.ts.unit === 'Day' && d1 - d0 > 1000) d1 = d0 + 1000;
    const P = mkPeriods(R.ts.unit, d0, d1), cw = R.ts.w || { Day: 30, Week: 54, Month: 68, Quarter: 84, Year: 96 }[R.ts.unit], M = measOf(R.measure), dayCache = new Map(), cache = new Map();
    const leafArr = (x) => { let v = cache.get(x); if (!v) { v = phaseRow(x, M, P, dayCache); cache.set(x, v); } return v; };
    const sumArr = (list) => { const o = new Float64Array(P.per.length); for (const x of list) { const v = leafArr(x); for (let i = 0; i < o.length; i++) o[i] += v[i]; } return o; };
    const bandCache = new Map();
    const arrOf = (e) => { const n = e.n; let v; if (n.type === 'a') v = leafArr(n.x); else { v = bandCache.get(n); if (!v) { v = sumArr(n.rows); bandCache.set(n, v); } } if (R.cum) { const c = new Float64Array(v.length); let s = 0; for (let i = 0; i < v.length; i++) { s += v[i]; c[i] = s; } return c; } return v; };
    const fmtV = M[3] === 'c' ? (v) => (Math.abs(v) < 0.5 ? '' : money(v)) : (v) => (Math.abs(v) < 0.005 ? '' : n2(v));

    // ----- shell DOM
    const bar = `▽ ${esc(t('layout'))}: ${esc(t('lay_assign'))}<span class="ra-tools"><button class="btn sm" data-ra="grp">${esc(B('Group and Sort…', 'تجميع وترتيب…'))}</button><button class="btn sm" data-ra="cols">${esc(B('Columns…', 'الأعمدة…'))}</button><button class="btn sm" data-ra="ts">${esc(B('Timescale…', 'المقياس الزمني…'))}</button><button class="btn sm" data-ra="scx">${esc(B('S-Curve → Excel…', 'منحنى S → Excel…'))}</button><button class="btn sm" data-ra="exp">${esc(B('Expand all', 'فتح الكل'))}</button><button class="btn sm" data-ra="col">${esc(B('Collapse all', 'طي الكل'))}</button>
      <label style="margin-inline-start:8px">${esc(B('Timescale', 'المقياس'))}: <select class="inp" data-ra="unit" style="height:22px">${['Day', 'Week', 'Month', 'Quarter', 'Year'].map((u) => `<option value="${u}"${R.ts.unit === u ? ' selected' : ''}>${esc(B(u, { Day: 'يوم', Week: 'أسبوع', Month: 'شهر', Quarter: 'ربع', Year: 'سنة' }[u]))}</option>`).join('')}</select></label>
      <label>${esc(t('display'))}: <select class="inp" data-ra="meas" style="height:22px">${MEAS.map((m) => `<option value="${m[0]}"${R.measure === m[0] ? ' selected' : ''}>${esc(B(m[1], m[2]))}</option>`).join('')}</select></label>
      <label class="chk"><input type="checkbox" data-ra="cum"${R.cum ? ' checked' : ''}> ${esc(B('Cumulative', 'تراكمي'))}</label></span>`;
    const tabs = [['general', 'tab_general'], ['planning', 'tab_planning']], tab = App.wtab && App.wtab.assign || 'general';
    el.innerHTML = `<div class="wbox"><div class="wtop"><div class="dockhead ra-dock">${bar}</div>
      <div class="ra-split" id="ra_split"><div class="ra-left" id="ra_left"><div class="ra-lh" id="ra_lh"></div><div class="ra-lb" id="ra_lb"><div id="ra_ls"></div></div></div>
      <div class="ra-gut" id="ra_gut"></div>
      <div class="ra-right" id="ra_right"><div class="ra-rh" id="ra_rh"></div><div class="ra-rb" id="ra_rb"><div id="ra_rs"></div></div></div></div></div>
      <div class="wtabs">${tabs.map(([k, l]) => `<button class="dtab${tab === k ? ' on' : ''}" data-wt="${k}">${esc(t(l))}</button>`).join('')}</div><div class="wbottom" id="ra_bottom"></div></div>`;
    const $ = (s) => el.querySelector(s), lb = $('#ra_lb'), rb = $('#ra_rb'), lh = $('#ra_lh'), rh = $('#ra_rh'), ls = $('#ra_ls'), rs = $('#ra_rs');
    const left = $('#ra_left'), right = $('#ra_right'), split = $('#ra_split');
    const lwPx = Math.max(280, R.split || Math.min(lw + 20, Math.round(el.clientWidth * 0.62) || 700));
    left.style.width = lwPx + 'px'; right.style.display = R.showTS ? '' : 'none'; $('#ra_gut').style.display = R.showTS ? '' : 'none'; if (!R.showTS) left.style.width = 'auto', left.style.flex = '1';
    // headers
    const hdr = cols.map((c, i) => `<div class="ra-hc" style="width:${c.w || c.f[3]}px;${c.f[4] === 'r' ? 'text-align:right;' : c.f[4] === 'c' ? 'text-align:center;' : ''}" data-i="${i}" title="${esc(c.title || B(c.f[1], c.f[2]))}">${esc(c.title || B(c.f[1], c.f[2]))}<i class="ra-rz" data-i="${i}"></i></div>`).join('');
    lh.innerHTML = `<div class="ra-hr" style="width:${lw}px">${hdr}</div>`;
    // right header: two tiers
    const tops = []; P.per.forEach((q, i) => { const last = tops[tops.length - 1]; if (last && last.t === q.top) last.n++; else tops.push({ t: q.top, n: 1, i }); });
    const dayCol = P.per.findIndex((q) => dd >= q.s && dd < q.e);
    rh.innerHTML = `<div class="ra-hr" style="width:${P.per.length * cw + 90}px"><div class="ra-ht"><div class="ra-hc ra-tot" style="width:90px">${esc(B('Total', 'الإجمالي'))}</div>${tops.map((x) => `<div class="ra-hc" style="width:${x.n * cw}px">${esc(x.t)}</div>`).join('')}</div><div class="ra-hb"><div class="ra-hc ra-tot" style="width:90px" title="${esc(B(M[1], M[2]))}">${esc(M[3] === 'c' ? B('Cost', 'تكلفة') : B('Units', 'وحدات'))}</div>${P.per.map((q, i) => `<div class="ra-hc${i === dayCol ? ' dd' : ''}" style="width:${cw}px">${esc(q.bot)}</div>`).join('')}</div></div>`;
    // sizes
    const H = flat.length * RH; ls.style.height = rs.style.height = H + 'px'; ls.style.width = lw + 'px'; rs.style.width = P.per.length * cw + 90 + 'px';
    // first aggregated column (for band label span)
    let firstAgg = cols.findIndex((c) => c.f[6]); if (firstAgg < 0) firstAgg = cols.length; const spanW = cols.slice(0, Math.max(1, firstAgg)).reduce((s, c) => s + (c.w || c.f[3]), 0);
    const G = R.grp, bandStyle = (e) => { const L = e.n.L; let col; if (e.n.wbs) col = (G.wbsColors || WBS_PAL)[Math.min(4, (e.n.wbs || 1) - 1)]; else col = L.color || PAL[(e.n.li || 0) % PAL.length]; return `background:${col};color:${P6.contrast(col)};`; };
    const aggOf = (c, list) => { const f = c.f; if (!f[6]) return ''; if (f[6] === 'sum') { let s = 0; for (const x of list) s += f[7](x) || 0; return f[0] === 'costs' || f[0] === 'ev' ? money(s) : n2(s); } let best = null; for (const x of list) { const v = f[7](x); if (v == null) continue; if (best == null || (f[6] === 'min' ? v < best : v > best)) best = v; } return best == null ? '' : dt(best); };
    const cellL = (c, e) => { const w = c.w || c.f[3], al = c.f[4] === 'r' ? 'text-align:right;' : c.f[4] === 'c' ? 'text-align:center;' : ''; const v = e.n.type === 'a' ? c.f[5](e.n.x) : ''; return `<div class="ra-c" style="width:${w}px;${al}" dir="auto">${esc(v)}</div>`; };
    function rowL(e, i) {
      const top = i * RH, n = e.n;
      if (n.type === 'grand') return `<div class="ra-r ra-b ra-grand" style="top:${top}px;width:${lw}px"><div class="ra-c" style="width:${spanW}px"><b>${esc(B('Grand Total', 'الإجمالي العام'))}</b></div>${cols.slice(Math.max(1, firstAgg)).map((c) => `<div class="ra-c" style="width:${c.w || c.f[3]}px;text-align:${c.f[4] === 'r' ? 'right' : 'left'}"><b>${esc(aggOf(c, n.rows))}</b></div>`).join('')}</div>`;
      if (n.type === 'g') {
        const ind = G.levels[n.li] && G.levels[n.li].indent === false ? 0 : e.depth * 14, open = !ST.collapsed.has(n.id);
        return `<div class="ra-r ra-b${G.shrink ? ' shr' : ''}" data-g="${esc(n.id)}" style="top:${top}px;width:${lw}px;${bandStyle(e)}"><div class="ra-c" style="width:${spanW}px;padding-inline-start:${ind + 4}px"><span class="ra-pm" data-tog="${esc(n.id)}">${open ? '−' : '+'}</span><b>${esc(n.label)}</b></div>${R.grp.totals !== false ? cols.slice(Math.max(1, firstAgg)).map((c) => `<div class="ra-c" style="width:${c.w || c.f[3]}px;text-align:${c.f[4] === 'r' ? 'right' : 'left'}"><b>${esc(aggOf(c, n.rows))}</b></div>`).join('') : ''}</div>`;
      }
      const sel = ST.sel === n.x.a.id, ind = G.levels.length && G.levels[0].indent !== false ? e.depth * 14 : 0;
      return `<div class="ra-r${sel ? ' sel' : ''}" data-a="${n.x.a.id}" style="top:${top}px;width:${lw}px">${cols.map((c, ci) => (ci === 0 && ind ? `<div class="ra-c" style="width:${c.w || c.f[3]}px;padding-inline-start:${ind}px" dir="auto">${esc(c.f[5](n.x))}</div>` : cellL(c, e))).join('')}</div>`;
    }
    function rowR(e, i, c0, c1) {
      const top = i * RH, n = e.n, arr = arrOf(e), tot = R.cum ? arr[arr.length - 1] || 0 : arr.reduce((s, v) => s + v, 0);
      const bandish = n.type !== 'a', st = n.type === 'g' ? bandStyle(e) : n.type === 'grand' ? '' : '';
      let cells = `<div class="ra-c ra-tot" style="width:90px;text-align:right">${esc(fmtV(tot))}</div><div style="width:${c0 * cw}px;flex:none"></div>`;
      for (let i2 = c0; i2 < c1; i2++) cells += `<div class="ra-c" style="width:${cw}px;text-align:right${i2 === dayCol ? ';border-inline-start:1px solid #0b4a96' : ''}">${esc(fmtV(arr[i2]))}</div>`;
      return `<div class="ra-r${bandish ? ' ra-b' : ''}${n.type === 'a' && ST.sel === n.x.a.id ? ' sel' : ''}${n.type === 'grand' ? ' ra-grand' : ''}${n.type === 'g' && G.shrink ? ' shr' : ''}" style="top:${top}px;width:${P.per.length * cw + 90}px;${st}">${cells}</div>`;
    }
    function paint() {
      const sy = lb.scrollTop, hh = lb.clientHeight || 400, i0 = Math.max(0, Math.floor(sy / RH) - 4), i1 = Math.min(flat.length, Math.ceil((sy + hh) / RH) + 4);
      let html = ''; for (let i = i0; i < i1; i++) html += rowL(flat[i], i); ls.innerHTML = html;
      const sx = rb.scrollLeft, wv = rb.clientWidth || 600, c0 = Math.max(0, Math.floor(sx / cw) - 3), c1 = Math.min(P.per.length, Math.ceil((sx + wv) / cw) + 3);
      let h2 = ''; for (let i = i0; i < i1; i++) h2 += rowR(flat[i], i, c0, c1); rs.innerHTML = h2;
    }
    paint();
    lb.scrollTop = rb.scrollTop = ST.sy || 0; lb.scrollLeft = ST.sxl || 0; rb.scrollLeft = ST.sxr || 0;
    let busy = false;
    lb.addEventListener('scroll', () => { if (busy) return; busy = true; rb.scrollTop = lb.scrollTop; lh.scrollLeft = lb.scrollLeft; ST.sy = lb.scrollTop; ST.sxl = lb.scrollLeft; paint(); busy = false; });
    rb.addEventListener('scroll', () => { if (busy) return; busy = true; lb.scrollTop = rb.scrollTop; rh.scrollLeft = rb.scrollLeft; ST.sy = rb.scrollTop; ST.sxr = rb.scrollLeft; paint(); busy = false; });
    lh.scrollLeft = ST.sxl || 0; rh.scrollLeft = ST.sxr || 0;
    // splitter
    $('#ra_gut').onmousedown = (ev) => { ev.preventDefault(); const x0 = ev.clientX, w0 = left.offsetWidth; const mv = (e2) => { const w = Math.max(280, Math.min(split.clientWidth - 200, w0 + (P6.dir() === 'rtl' ? x0 - e2.clientX : e2.clientX - x0))); left.style.width = w + 'px'; R.split = w; }; const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); App.saveCfg(); paint(); }; document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up); };
    // column resize
    lh.onmousedown = (ev) => { const rz = ev.target.closest('.ra-rz'); if (!rz) return; ev.preventDefault(); const i = +rz.dataset.i, c = R.cols.find((q) => q.k === cols[i].k), x0 = ev.clientX, w0 = c.w || cols[i].f[3]; const mv = (e2) => { c.w = Math.max(40, w0 + (P6.dir() === 'rtl' ? x0 - e2.clientX : e2.clientX - x0)); }; const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); App.saveCfg(); render(el); }; document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up); };
    // clicks
    const select = (id) => { ST.sel = id; App.raSel = id; };
    const allBands = () => { const ids = []; const w = (nodes) => nodes.forEach((n) => { if (n.type === 'g') { ids.push(n.id); w(n.kids); } }); w(tree.kids); return ids; };
    el.onclick = (e) => {
      const tog = e.target.closest('[data-tog]'); if (tog) { const id = tog.dataset.tog; if (ST.collapsed.has(id)) ST.collapsed.delete(id); else ST.collapsed.add(id); return render(el); }
      const wt = e.target.closest('[data-wt]'); if (wt) { App.wtab = App.wtab || {}; App.wtab.assign = wt.dataset.wt; return render(el); }
      const b = e.target.closest('[data-ra]');
      if (b && b.tagName === 'BUTTON') {
        const a = b.dataset.ra;
        if (a === 'scx') return App.sCurveExport(); if (a === 'grp') return D.groupSort(grpOpts()); if (a === 'cols') return D.columns(colOpts()); if (a === 'ts') return tsDialog();
        if (a === 'exp') { ST.collapsed.clear(); return render(el); } if (a === 'col') { ST.collapsed = new Set(allBands()); return render(el); }
      }
      const row = e.target.closest('.ra-r[data-a]'); if (row) { select(+row.dataset.a); lb.querySelectorAll('.sel,.ra-r.sel').forEach((q) => q.classList.remove('sel')); paint(); drawBottom(); return; }
      const rowR2 = e.target.closest('.ra-r:not([data-a])'); void rowR2;
      const ab = e.target.closest('[data-a]'); if (ab && ab.tagName === 'BUTTON' && ab.dataset.a === 'accts') return App.accountsDialog();
    };
    // clicks on the right grid rows select too
    rs.onclick = (e) => { const r = e.target.closest('.ra-r'); if (!r) return; const i = Math.round(parseFloat(r.style.top) / RH), en = flat[i]; if (en && en.n.type === 'a') { select(en.n.x.a.id); paint(); drawBottom(); } };
    el.onchange = (e) => {
      const x = e.target;
      if (x.dataset.ra === 'unit') { R.ts.unit = x.value; R.ts.w = 0; App.saveCfg(); return render(el); }
      if (x.dataset.ra === 'meas') { R.measure = x.value; App.saveCfg(); return render(el); }
      if (x.dataset.ra === 'cum') { R.cum = x.checked; App.saveCfg(); return render(el); }
      if (x.dataset.f) return editField(x);
    };
    ls.ondblclick = (e) => {
      const r = e.target.closest('.ra-r[data-a]'); const c = e.target.closest('.ra-c'); if (!r || !c) return;
      const idx = [...r.children].indexOf(c), col = cols[idx]; if (!col || col.k !== 'bu') return;
      const a = p.asg.find((q) => q.id === +r.dataset.a); const v = prompt(B('Budgeted Total Units', 'الوحدات المخططة'), a.qty); if (v == null) return;
      App.mutate(t('edit'), () => { a.qty = Math.max(0, parseFloat(String(v).replace(',', '.')) || 0); if (a.manual) a.rem = Math.max(0, a.qty - (a.act || 0)); }, { noSched: true });
    };
    // ----- bottom details (General / Planning)
    const fld = (label, inner, cls) => `<div class="fld ${cls || ''}"><label>${esc(label)}</label>${inner}</div>`;
    const inp = (f, v, o) => `<input data-f="${f}" dir="auto" value="${esc(v == null ? '' : v)}"${o && o.ro ? ' readonly' : ''}>`;
    function drawBottom() {
      const bt = $('#ra_bottom'), cur = p.asg.find((q) => q.id === ST.sel && tm.has(q.task) && rm.has(q.rsrc)); if (!cur) { bt.innerHTML = `<div class="empty">${esc(B('Select an assignment', 'اختر تعييناً'))}</div>`; el.querySelectorAll('[data-wt]').forEach((q) => q.classList.toggle('on', q.dataset.wt === tab)); return; }
      const tk = tm.get(cur.task), r = rm.get(cur.rsrc), N = asgNums(cur, tk, r);
      if (tab === 'general') bt.innerHTML = `<div class="grid2">${fld(t('col_name'), inp('x', tk.code + ' · ' + tk.name, { ro: 1 }), 'w2')}
        ${fld(t('resource'), `<select data-f="rsrc">${p.rsrc.map((q) => `<option value="${q.id}"${q.id === cur.rsrc ? ' selected' : ''}>${esc((q.short || '') + ' ' + q.name)}</option>`).join('')}</select>`, 'w2')}
        ${fld(t('role'), `<select data-f="role"><option value="">—</option>${p.roles.map((q) => `<option value="${q.id}"${cur.role === q.id ? ' selected' : ''}>${esc(q.name)}</option>`).join('')}</select>`)}
        ${fld(t('cost_account'), `<select data-f="acct"><option value="">${esc(t('no_cost_account'))}</option>${p.accounts.map((q) => `<option value="${q.id}"${cur.acct === q.id ? ' selected' : ''}>${esc(q.code + ' – ' + q.name)}</option>`).join('')}</select><button class="btn sm" data-a="accts" style="margin-top:4px">${esc(t('cost_accounts'))}</button>`)}
        ${fld(t('price_unit'), inp('price', n2(N.price)))}${fld(t('rate_type'), `<select data-f="rate"><option>Standard Rate</option></select>`)}
        <label class="chk"><input type="checkbox" data-f="primary"${cur.primary ? ' checked' : ''}> ${esc(t('primary_resource'))}</label></div>`;
      else bt.innerHTML = `<div class="grid2">${fld(t('col_bu'), inp('qty', n2(cur.qty)))}${fld(t('col_au'), inp('act', n2(N.au)))}${fld(t('col_ru'), inp('rem', n2(N.ru)))}${fld(t('units_time'), inp('x1', n2(cur.qty / Math.max(1, tk.dur)) + 'h/d', { ro: 1 }))}${fld(t('col_dur'), inp('x2', n2(tk.dur), { ro: 1 }))}${fld(t('col_as'), inp('as', dt(cur.as != null ? cur.as : tk.as)))}${fld(t('col_af'), inp('af', dt(cur.af != null ? cur.af : tk.af)))}</div>`;
      el.querySelectorAll('[data-wt]').forEach((q) => q.classList.toggle('on', q.dataset.wt === tab));
    }
    function editField(x) {
      const cur = p.asg.find((q) => q.id === ST.sel); if (!cur) return; const tk = tm.get(cur.task), f = x.dataset.f;
      App.mutate(t('edit'), () => {
        const num = () => parseFloat(String(x.value).replace(',', '.')) || 0;
        if (f === 'rsrc') cur.rsrc = +x.value; else if (f === 'role') { if (x.value === '') delete cur.role; else cur.role = +x.value; }
        else if (f === 'acct') { if (x.value === '') delete cur.acct; else cur.acct = +x.value; }
        else if (f === 'price') cur.price = Math.max(0, num());
        else if (f === 'primary') { p.asg.forEach((q) => { if (q.task === cur.task) delete q.primary; }); if (x.checked) cur.primary = true; }
        else if (f === 'qty') { cur.qty = Math.max(0, num()); if (cur.manual) cur.rem = Math.max(0, cur.qty - (cur.act || 0)); }
        else if (f === 'act') { cur.manual = true; cur.act = Math.max(0, num()); cur.rem = Math.max(0, cur.qty - cur.act); }
        else if (f === 'rem') { const sp = P6.asgSplit(cur, tk); cur.manual = true; cur.act = sp.act; cur.rem = Math.max(0, num()); }
        else if (f === 'as' || f === 'af') cur[f] = x.value.trim() ? P6.parseDate(x.value) : null;
      }, { noSched: true });
    }
    drawBottom();
  }

  // ---------------------------------------------------------------- dialogs wiring
  function grpOpts() {
    const R = cfg(), F = fields(App.p), fl = [['rsrc', B('Resource', 'المورد')], ['wbs', 'WBS'], ['acct', B('Cost Account', 'حساب التكلفة')], ['role', B('Role', 'الدور')], ['rtype', B('Resource Type', 'نوع المورد')], ['status', B('Activity Status', 'حالة النشاط')], ['atype', B('Activity Type', 'نوع النشاط')], ['cal', B('Calendar', 'التقويم')], ['es', B('Start', 'البداية')], ['ef', B('Finish', 'النهاية')]];
    for (const k of Object.keys(F)) if (/^(ac|udf):/.test(k)) fl.push([k, labelOf(F, k)]);
    return { cfg: R, fields: () => fl, defaultBy: ['rsrc', 'wbs'], sortKeys: () => Object.keys(F), sortLabel: (k) => labelOf(F, k), defaultSort: 'code', after: () => { App.saveCfg(); App.renderWin(); } };
  }
  function colOpts() {
    const R = cfg(), F = fields(App.p);
    return {
      title: B('Columns', 'الأعمدة'), noCopy: true, label: (k) => labelOf(F, k), widthOf: (k) => (F[k] ? F[k][3] : 100),
      groups: () => CATS.map(([id, en, ar]) => ({ id, label: [en, ar], keys: Object.keys(F).filter((k) => F[k][0] === id) })),
      get: () => R.cols, defaults: () => DEF_COLS.map((k) => ({ k, w: BASE[k][3] })), set: (cols) => { R.cols = cols; App.saveCfg(); App.renderWin(); },
    };
  }
  function tsDialog() {
    const R = cfg(), body = document.createElement('div'); const ts = R.ts;
    body.innerHTML = `<div class="grid2"><div class="fld"><label>${esc(B('Bottom unit', 'وحدة المقياس'))}</label><select id="ts_u">${['Day', 'Week', 'Month', 'Quarter', 'Year'].map((u) => `<option${ts.unit === u ? ' selected' : ''}>${u}</option>`).join('')}</select></div>
      <div class="fld"><label>${esc(B('Column width (px, 0 = auto)', 'عرض العمود (0 = تلقائي)'))}</label><input id="ts_w" type="number" value="${ts.w || 0}"></div>
      <div class="fld"><label>${esc(B('Start date (blank = from project)', 'تاريخ البداية (فارغ = من المشروع)'))}</label><input id="ts_s" placeholder="dd-mmm-yy" value="${ts.start != null ? esc(fmtD(ts.start)) : ''}"></div>
      <div class="fld"><label>${esc(B('End date (blank = to project)', 'تاريخ النهاية (فارغ = حتى المشروع)'))}</label><input id="ts_e" placeholder="dd-mmm-yy" value="${ts.end != null ? esc(fmtD(ts.end)) : ''}"></div>
      <label class="chk"><input type="checkbox" id="ts_show"${R.showTS ? ' checked' : ''}> ${esc(B('Show the time-phased spreadsheet', 'إظهار جدول التوزيع الزمني'))}</label></div>`;
    D.modal({ title: B('Timescale', 'المقياس الزمني'), cls: 'mid', body, buttons: [{ label: t('cancel'), fn: () => {} }, { label: t('ok'), cls: 'pri', fn: (c, el) => {
      const q = (s) => el.querySelector(s), ps = q('#ts_s').value.trim(), pe = q('#ts_e').value.trim(), s = ps ? P6.parseDate(ps) : null, e = pe ? P6.parseDate(pe) : null;
      if ((ps && s == null) || (pe && e == null)) { App.toast(B('Bad date', 'تاريخ غير صالح'), true); return false; }
      ts.unit = q('#ts_u').value; ts.w = Math.max(0, parseInt(q('#ts_w').value, 10) || 0); ts.start = s; ts.end = e; R.showTS = q('#ts_show').checked; App.saveCfg(); App.renderWin();
    } }] });
  }
  // route the global menu / toolbar commands to this window while it is active
  const wrap = (name, make) => { const orig = D[name]; D[name] = function (O) { if (!O && App.win === 'assign') return orig(make()); return orig(O); }; };
  wrap('groupSort', grpOpts); wrap('columns', colOpts); wrap('sortDialog', grpOpts);
  const tsOrig = D.timescaleDialog; D.timescaleDialog = function () { if (App.win === 'assign') return tsDialog(); return tsOrig.apply(this, arguments); };

  function rowsOf(p) {
    const pm = { cals: new Map(p.cals.map((c) => [c.id, c])), roles: new Map((p.roles || []).map((x) => [x.id, x])), accts: new Map((p.accounts || []).map((x) => [x.id, x])), codeVal: new Map((p.codeVals || []).map((v) => [v.id, v])) };
    const tm = new Map(p.tasks.map((x) => [x.id, x])), rm = new Map(p.rsrc.map((x) => [x.id, x])), wm = new Map(p.wbs.map((x) => [x.id, x])), out = [];
    for (const a of p.asg) { const tk = tm.get(a.task), r = rm.get(a.rsrc); if (!tk || !r) continue; out.push({ a, t: tk, r, w: wm.get(tk.wbs), wm, pm, N: asgNums(a, tk, r), pv: 0, ev: 0 }); }
    return out;
  }
  App.assignKit = { rowsOf, mkPeriods, phaseRow, asgNums };
  App.renderAssignWin = render;
})(window);

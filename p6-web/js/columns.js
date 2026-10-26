/* P6 Web – column registry: every column Primavera offers in "Columns", grouped like P6, with real values behind them. */
(function (g) {
  'use strict';
  const P6 = g.P6;
  const D = (P6.colDefs = {});
  const ALL = (P6.ALL_COLS = {});
  const GROUPS = [
    ['acg', 'Activity Codes - Global', 'أكواد الأنشطة - عامة'], ['acp', 'Activity Codes - Project', 'أكواد الأنشطة - المشروع'], ['steps', 'Activity Steps', 'خطوات النشاط'],
    ['costs', 'Costs', 'التكاليف'], ['dates', 'Dates', 'التواريخ'], ['dur', 'Durations', 'المدد'], ['ev', 'Earned Value', 'القيمة المكتسبة'], ['fb', 'Feedback', 'الملاحظات الراجعة'],
    ['gen', 'General', 'عام'], ['lists', 'Lists', 'قوائم'], ['mfp', 'Multiple Float Paths', 'مسارات الفلوت المتعددة'], ['num', 'Number of Activities', 'عدد الأنشطة'],
    ['pct', 'Percent Completes', 'نسب الإنجاز'], ['pcode', 'Project Codes', 'أكواد المشروع'], ['units', 'Units', 'الوحدات'], ['udf', 'User Defined', 'حقول المستخدم']
  ];
  const fmtN = (n) => (n == null || !isFinite(n) ? '' : String(Math.round(n * 100) / 100));
  const money = (v) => (v == null || !isFinite(v) ? '' : (Math.round(v * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const KIND = {
    money, units: (v) => (v == null || !isFinite(v) ? '' : fmtN(v) + 'h'), pct: (v) => (v == null || !isFinite(v) ? '' : fmtN(v) + '%'),
    idx: (v) => (v == null || !isFinite(v) ? '' : (Math.round(v * 100) / 100).toFixed(2)), num: fmtN, date: (v) => P6.fmtDate(v), text: (v) => (v == null ? '' : String(v)),
    yn: (v) => (v ? 'Yes' : 'No'), days: (v) => fmtN(v)
  };
  const RIGHT = new Set(['money', 'units', 'pct', 'idx', 'num', 'date', 'days']);

  // def(key, group, [en, ar], kind, v(ctx, task), opts)   opts: vw(ctx, wbsRow) ed set opts sort w
  function def(k, group, label, kind, v, o) {
    o = o || {};
    D[k] = { k, group, label, kind, v, vw: o.vw, ed: o.ed, set: o.set, opts: o.opts, raw: o.raw, neg: o.neg, w: o.w || (kind === 'text' ? 130 : kind === 'date' ? 92 : 100), crit: o.crit, legacy: !!o.legacy };
    ALL[k] = { w: D[k].w, ed: o.ed || null, r: RIGHT.has(kind) ? 1 : 0, sort: o.sort !== false ? 1 : 0, group, dyn: o.dyn };
  }
  const mT = (c, tk) => c.M.T.get(tk.id), mW = (c, w) => c.M.W.get(w.id);
  function mdef(k, group, label, kind, fn, o) {
    def(k, group, label, kind, (c, tk) => fn(mT(c, tk), tk, c), Object.assign({ vw: (c, w) => fn(mW(c, w), null, c) }, o || {}));
  }
  const L = (en, ar) => [en, ar || en];

  // ---------- General ----------
  def('code', 'gen', L('Activity ID', 'رقم النشاط'), 'text', (c, tk) => tk.code, { ed: 'text', w: 230, legacy: 1 });
  def('name', 'gen', L('Activity Name', 'اسم النشاط'), 'text', (c, tk) => tk.name, { ed: 'text', w: 320, legacy: 1 });
  def('type', 'gen', L('Activity Type', 'نوع النشاط'), 'text', (c, tk) => P6.t('type_' + tk.type), { ed: 'sel', w: 110, legacy: 1 });
  def('status', 'gen', L('Activity Status', 'حالة النشاط'), 'text', (c, tk) => P6.t('st_' + tk.status), { ed: 'sel', w: 100, legacy: 1 });
  def('cal', 'gen', L('Calendar', 'التقويم'), 'text', (c, tk) => (c.p.cals.find((x) => x.id === tk.cal) || {}).name, { ed: 'sel', w: 130, legacy: 1 });
  def('wbs', 'gen', L('WBS Code', 'كود WBS'), 'text', (c, tk) => (c.wbs.get(tk.wbs) || {}).code, { ed: 'sel', w: 100, legacy: 1 });
  def('wbsname', 'gen', L('WBS Name', 'اسم WBS'), 'text', (c, tk) => (c.wbs.get(tk.wbs) || {}).name, { w: 160 });
  def('cstr', 'gen', L('Primary Constraint', 'القيد الأساسي'), 'text', (c, tk) => (tk.ct ? P6.t('cs_' + tk.ct) : ''), { ed: 'sel', w: 130, legacy: 1 });
  def('cdate', 'gen', L('Primary Constraint Date', 'تاريخ القيد الأساسي'), 'date', (c, tk) => (tk.ct ? tk.cd : null), { ed: 'date', legacy: 1 });
  def('dtype', 'gen', L('Duration Type', 'نوع المدة'), 'text', (c, tk) => P6.t('dt_' + (tk.dtype || 'DT_FixedDUR2')), { ed: 'sel', w: 160 });
  def('pctType', 'gen', L('% Complete Type', 'نوع نسبة الإنجاز'), 'text', (c, tk) => P6.t(tk.pctType === 'phys' ? 'pt_phys' : tk.pctType === 'units' ? 'pt_units' : 'pt_dur'), { ed: 'sel', w: 130 });
  def('crit', 'gen', L('Critical', 'حرج'), 'yn', (c, tk) => !!tk.crit && tk.status !== 'C', { w: 70 });
  def('prires', 'gen', L('Primary Resource ID', 'رقم المورد الرئيسي'), 'text', (c, tk) => { const a = c.asgBy.get(tk.id); return a ? (c.rs.get(a[0].rsrc) || {}).short : ''; });
  def('primname', 'gen', L('Primary Resource Name', 'اسم المورد الرئيسي'), 'text', (c, tk) => { const a = c.asgBy.get(tk.id); return a ? (c.rs.get(a[0].rsrc) || {}).name : ''; }, { w: 150 });
  def('notes', 'gen', L('Notes', 'ملاحظات'), 'text', (c, tk) => tk.notes || '', { ed: 'text', w: 180 });
  def('tf', 'gen', L('Total Float', 'الفلوت الكلي'), 'num', (c, tk) => tk.tf, { w: 92, legacy: 1, neg: 1, vw: (c, w) => (c.ru.get(w.id) || {}).tf });
  def('ff', 'gen', L('Free Float', 'الفلوت الحر'), 'num', (c, tk) => tk.ff, { w: 84, legacy: 1 });
  // ---------- Dates ----------
  def('es', 'dates', L('Start', 'البداية'), 'date', (c, tk) => tk.es, { ed: 'date', legacy: 1, vw: (c, w) => (c.ru.get(w.id) || {}).es });
  def('ef', 'dates', L('Finish', 'النهاية'), 'date', (c, tk) => tk.ef, { ed: 'date', legacy: 1, vw: (c, w) => (c.ru.get(w.id) || {}).ef });
  def('as', 'dates', L('Actual Start', 'البداية الفعلية'), 'date', (c, tk) => tk.as, { ed: 'date', legacy: 1, vw: (c, w) => { const r = c.ru.get(w.id) || {}; return isFinite(r.as) ? r.as : null; } });
  def('af', 'dates', L('Actual Finish', 'النهاية الفعلية'), 'date', (c, tk) => tk.af, { ed: 'date', legacy: 1, vw: (c, w) => { const r = c.ru.get(w.id) || {}; return r.allC && isFinite(r.af) ? r.af : null; } });
  def('esE', 'dates', L('Early Start', 'أبكر بداية'), 'date', (c, tk) => (tk.status === 'C' ? tk.as : tk.status === 'IP' && tk.rs != null ? tk.rs : tk.es), { vw: (c, w) => (c.ru.get(w.id) || {}).es });
  def('efE', 'dates', L('Early Finish', 'أبكر نهاية'), 'date', (c, tk) => tk.ef, { vw: (c, w) => (c.ru.get(w.id) || {}).ef });
  def('ls', 'dates', L('Late Start', 'أقصى بداية'), 'date', (c, tk) => (tk.status === 'C' ? null : tk.ls), { legacy: 1, vw: (c, w) => (c.ru.get(w.id) || {}).ls });
  def('lf', 'dates', L('Late Finish', 'أقصى نهاية'), 'date', (c, tk) => (tk.status === 'C' ? null : tk.lf), { legacy: 1, vw: (c, w) => (c.ru.get(w.id) || {}).lf });
  def('rs', 'dates', L('Remaining Early Start', 'بداية مبكرة متبقية'), 'date', (c, tk) => (tk.status === 'C' ? null : tk.rs != null ? tk.rs : tk.es));
  def('rf', 'dates', L('Remaining Early Finish', 'نهاية مبكرة متبقية'), 'date', (c, tk) => (tk.status === 'C' ? null : tk.ef));
  def('rls', 'dates', L('Remaining Late Start', 'أقصى بداية متبقية'), 'date', (c, tk) => (tk.status === 'C' ? null : tk.ls));
  def('rlf', 'dates', L('Remaining Late Finish', 'أقصى نهاية متبقية'), 'date', (c, tk) => (tk.status === 'C' ? null : tk.lf));
  def('bs', 'dates', L('BL Project Start', 'بداية البيزلاين'), 'date', (c, tk) => tk.bs, { legacy: 1, vw: (c, w) => (c.ru.get(w.id) || {}).bs });
  def('bf', 'dates', L('BL Project Finish', 'نهاية البيزلاين'), 'date', (c, tk) => tk.bf, { legacy: 1, vw: (c, w) => (c.ru.get(w.id) || {}).bf });
  def('dd', 'dates', L('Data Date', 'تاريخ البيانات'), 'date', (c) => c.p.dataDate, { vw: (c) => c.p.dataDate, sort: false });
  const dv = (a, b) => (a == null || b == null ? null : a - b);
  def('vs', 'dates', L('Variance - BL Project Start Date', 'انحراف بداية البيزلاين (يوم)'), 'num', (c, tk) => dv(tk.es, tk.bs), { w: 110, legacy: 1, neg: 1, vw: (c, w) => { const r = c.ru.get(w.id) || {}; return dv(r.es, r.bs); } });
  def('vf', 'dates', L('Variance - BL Project Finish Date', 'انحراف نهاية البيزلاين (يوم)'), 'num', (c, tk) => dv(tk.ef, tk.bf), { w: 110, legacy: 1, neg: 1, vw: (c, w) => { const r = c.ru.get(w.id) || {}; return dv(r.ef, r.bf); } });
  // ---------- Durations ----------
  const work = (c, tk, a, b) => (a == null || b == null ? null : P6.durBetween(c.cals.get(tk.cal) || c.p.cals[0], a, b));
  def('dur', 'dur', L('Original Duration', 'المدة الأصلية'), 'num', (c, tk) => tk.dur, { ed: 'num', legacy: 1, w: 92, vw: (c, w) => (c.ru.get(w.id) || {}).dur });
  def('rem', 'dur', L('Remaining Duration', 'المدة المتبقية'), 'num', (c, tk) => (tk.status === 'C' ? 0 : tk.rem), { ed: 'num', legacy: 1, w: 92, vw: (c, w) => (c.ru.get(w.id) || {}).rem });
  def('actd', 'dur', L('Actual Duration', 'المدة الفعلية'), 'num', (c, tk) => (tk.as == null ? null : work(c, tk, tk.as, tk.af != null ? tk.af : Math.max(tk.as, c.p.dataDate))));
  def('atcd', 'dur', L('At Completion Duration', 'المدة عند الإنجاز'), 'num', (c, tk) => (tk.status === 'C' ? work(c, tk, tk.as, tk.af) : tk.status === 'IP' && tk.as != null ? (work(c, tk, tk.as, Math.max(tk.as, c.p.dataDate)) || 0) + tk.rem : tk.dur));
  def('bld', 'dur', L('BL Project Duration', 'مدة البيزلاين'), 'num', (c, tk) => tk.bdur != null ? tk.bdur : work(c, tk, tk.bs, tk.bf));
  def('vdur', 'dur', L('Variance - BL Project Duration', 'انحراف المدة عن البيزلاين'), 'num', (c, tk) => { const a = c.D.atcd.v(c, tk), b = c.D.bld.v(c, tk); return a == null || b == null ? null : b - a; }, { neg: 1 });
  // ---------- Percent Completes ----------
  def('pct', 'pct', L('Activity % Complete', 'نسبة إنجاز النشاط'), 'pct', (c, tk) => tk.pct, { ed: 'num', legacy: 1, w: 100, vw: (c, w) => { const r = c.ru.get(w.id) || {}; return r.dur ? r.pct : null; } });
  mdef('durPct', 'pct', L('Duration % Complete', 'نسبة إنجاز المدة'), 'pct', (m, tk, c) => (tk ? m.durPct : null), { vw: (c, w) => { const r = c.ru.get(w.id) || {}; return r.dur ? Math.max(0, Math.min(100, ((r.dur - r.rem) / r.dur) * 100)) : null; } });
  def('phys', 'pct', L('Physical % Complete', 'نسبة الإنجاز الفعلي (Physical)'), 'pct', (c, tk) => (tk.pctType === 'phys' ? tk.pct : tk.phys), { ed: 'num', w: 120 });
  mdef('unitsPct', 'pct', L('Units % Complete', 'نسبة إنجاز الوحدات'), 'pct', (m) => (m.atu > 0 ? m.unitsPct : null));
  mdef('costPct', 'pct', L('Cost % Complete', 'نسبة إنجاز التكلفة'), 'pct', (m) => (m.atc > 0 ? m.costPct : null));
  mdef('schedPct', 'pct', L('Schedule % Complete', 'نسبة الإنجاز المجدول'), 'pct', (m, tk) => (tk ? m.schedPct : null), { vw: (c, w) => { const r = c.ru.get(w.id) || {}; if (r.es == null) return null; const d = c.p.dataDate; return d < r.es ? 0 : d >= r.ef ? 100 : (100 * (d - r.es + 1)) / (r.ef - r.es + 1); } });
  mdef('perfPct', 'pct', L('Performance % Complete', 'نسبة الأداء (Performance)'), 'pct', (m) => m.perf != null ? m.perf : m.perfPct);
  def('stepPct', 'pct', L('Steps % Complete', 'نسبة إنجاز الخطوات'), 'pct', (c, tk) => (tk.steps.length ? tk.phys : null));
  // ---------- Costs ----------
  const KC = [['', 'Total', 'الإجمالية'], ['_L', 'Labor', 'العمالة'], ['_N', 'Nonlabor', 'المعدات'], ['_M', 'Material', 'المواد'], ['_E', 'Expense', 'المصروفات']];
  [['bc', 'Budgeted', 'المخططة'], ['ac', 'Actual', 'الفعلية'], ['rc', 'Remaining', 'المتبقية'], ['atc', 'At Completion', 'عند الإنجاز']].forEach(([p, en, ar]) => {
    KC.forEach(([sfx, sen, sar]) => {
      const f = p + sfx;
      mdef(f, 'costs', L(en + ' ' + sen + ' Cost', 'التكلفة ' + ar + ' - ' + sar), 'money', (m) => m[f], p === 'bc' && sfx === '_E' ? { ed: 'num', set: (pp, tk, raw) => { const v = parseFloat(String(raw).replace(',', '.')); if (isNaN(v) || v < 0) return P6.t('err_num'); tk.exp = v; }, raw: (c, tk) => String(tk.exp || 0) } : {});
    });
  });
  mdef('blc', 'costs', L('BL Budgeted Total Cost', 'التكلفة المخططة (بيزلاين)'), 'money', (m) => m.blc);
  mdef('cvar', 'costs', L('Variance - BL Budgeted Total Cost', 'انحراف التكلفة عن البيزلاين'), 'money', (m) => m.cvar, { neg: 1 });
  // ---------- Units ----------
  [['b', 'Budgeted', 'المخططة'], ['a', 'Actual', 'الفعلية'], ['r', 'Remaining', 'المتبقية'], ['at', 'At Completion', 'عند الإنجاز']].forEach(([p, en, ar]) => {
    [['', 'Total', 'الإجمالية'], ['_L', 'Labor', 'العمالة'], ['_N', 'Nonlabor', 'المعدات'], ['_M', 'Material', 'المواد']].forEach(([sfx, sen, sar]) => {
      const f = p + 'u' + sfx;
      mdef(f, 'units', L(en + ' ' + sen + ' Units', 'الوحدات ' + ar + ' - ' + sar), 'units', (m) => m[f]);
    });
  });
  mdef('uvar', 'units', L('Variance - Budgeted Units', 'انحراف الوحدات'), 'units', (m) => m.uvar, { neg: 1 });
  // ---------- Earned Value ----------
  mdef('pv', 'ev', L('Planned Value Cost', 'القيمة المخططة (PV)'), 'money', (m) => m.pv);
  mdef('ev', 'ev', L('Earned Value Cost', 'القيمة المكتسبة (EV)'), 'money', (m) => m.ev);
  mdef('sv', 'ev', L('Schedule Variance', 'انحراف الجدول (SV)'), 'money', (m) => m.sv, { neg: 1 });
  mdef('cv', 'ev', L('Cost Variance', 'انحراف التكلفة (CV)'), 'money', (m) => m.cv, { neg: 1 });
  mdef('spi', 'ev', L('Schedule Performance Index', 'مؤشر أداء الجدول (SPI)'), 'idx', (m) => m.spi, { w: 120 });
  mdef('cpi', 'ev', L('Cost Performance Index', 'مؤشر أداء التكلفة (CPI)'), 'idx', (m) => m.cpi, { w: 120 });
  mdef('svi', 'ev', L('Schedule Variance Index', 'مؤشر انحراف الجدول'), 'idx', (m) => m.svi, { w: 120 });
  mdef('cvi', 'ev', L('Cost Variance Index', 'مؤشر انحراف التكلفة'), 'idx', (m) => m.cvi, { w: 120 });
  mdef('etc', 'ev', L('Estimate To Complete Cost', 'تقدير المتبقي (ETC)'), 'money', (m) => m.etc);
  mdef('eac', 'ev', L('Estimate At Completion Cost', 'تقدير عند الإنجاز (EAC)'), 'money', (m) => m.eac);
  mdef('eacCpi', 'ev', L('EAC - CPI based', 'EAC حسب CPI'), 'money', (m) => m.eacCpi);
  mdef('vac', 'ev', L('Variance At Completion', 'الانحراف عند الإنجاز (VAC)'), 'money', (m) => m.vac, { neg: 1 });
  mdef('tcpi', 'ev', L('To Complete Performance Index', 'مؤشر الأداء المطلوب (TCPI)'), 'idx', (m) => m.tcpi, { w: 130 });
  mdef('pvu', 'ev', L('Planned Value Labor Units', 'وحدات العمالة المخططة (PV)'), 'units', (m) => m.pvu);
  mdef('evu', 'ev', L('Earned Value Labor Units', 'وحدات العمالة المكتسبة (EV)'), 'units', (m) => m.evu);
  mdef('svu', 'ev', L('Schedule Variance Labor Units', 'انحراف الجدول - وحدات العمالة'), 'units', (m) => m.svu, { neg: 1 });
  mdef('spiu', 'ev', L('Schedule Performance Index Labor Units', 'مؤشر أداء الجدول - وحدات'), 'idx', (m) => m.spiu, { w: 150 });
  // ---------- Lists ----------
  const rtext = (c, tk, sel) => { const out = []; for (const r of c.p.rels) if ((sel === 'p' ? r.s : r.p) === tk.id) { const o = c.byId.get(sel === 'p' ? r.p : r.s); if (o) out.push(o.code + (r.type !== 'FS' || r.lag ? ' ' + r.type : '') + (r.lag ? (r.lag > 0 ? '+' : '') + r.lag + 'd' : '')); } return out; };
  def('pred', 'lists', L('Predecessors', 'السوابق'), 'text', (c, tk) => P6.relText(c.p, tk), { ed: 'text', w: 160, legacy: 1 });
  def('succ', 'lists', L('Successors', 'اللواحق'), 'text', (c, tk) => c.succText(tk), { w: 140, legacy: 1 });
  def('preddet', 'lists', L('Predecessor Details', 'تفاصيل السوابق'), 'text', (c, tk) => c.p.rels.filter((r) => r.s === tk.id).map((r) => { const o = c.byId.get(r.p); return o ? o.code + ' ' + o.name + ' (' + r.type + (r.lag ? (r.lag > 0 ? '+' : '') + r.lag : '') + ')' : ''; }).join('; '), { w: 260 });
  def('succdet', 'lists', L('Successor Details', 'تفاصيل اللواحق'), 'text', (c, tk) => c.p.rels.filter((r) => r.p === tk.id).map((r) => { const o = c.byId.get(r.s); return o ? o.code + ' ' + o.name + ' (' + r.type + (r.lag ? (r.lag > 0 ? '+' : '') + r.lag : '') + ')' : ''; }).join('; '), { w: 260 });
  def('resid', 'lists', L('Resource IDs', 'أرقام الموارد'), 'text', (c, tk) => (c.asgBy.get(tk.id) || []).map((a) => (c.rs.get(a.rsrc) || {}).short).filter(Boolean).join(', '), { w: 130 });
  def('res', 'lists', L('Resource Names', 'أسماء الموارد'), 'text', (c, tk) => (c.asgBy.get(tk.id) || []).map((a) => (c.rs.get(a.rsrc) || {}).name).filter(Boolean).join(', '), { w: 150, legacy: 1 });
  def('roles', 'lists', L('Resource Roles', 'أدوار الموارد'), 'text', (c, tk) => [...new Set((c.asgBy.get(tk.id) || []).map((a) => (c.rs.get(a.rsrc) || {}).role).filter(Boolean))].join(', '), { w: 150 });
  // ---------- Steps / Feedback / Float paths ----------
  def('nsteps', 'steps', L('Number of Steps', 'عدد الخطوات'), 'num', (c, tk) => tk.steps.length);
  def('nstepsC', 'steps', L('Steps Completed', 'الخطوات المكتملة'), 'num', (c, tk) => tk.steps.filter((s) => s.done).length);
  def('stepWt', 'steps', L('Steps Total Weight', 'مجموع أوزان الخطوات'), 'num', (c, tk) => tk.steps.reduce((a, s) => a + (+s.wt || 1), 0));
  def('stepPct2', 'steps', L('Steps % Complete', 'نسبة إنجاز الخطوات'), 'pct', (c, tk) => (tk.steps.length ? tk.phys : null));
  def('feedback', 'fb', L('Feedback', 'الملاحظات الراجعة'), 'text', (c, tk) => tk.feedback || '', { ed: 'text', w: 200 });
  def('rev', 'fb', L('Review Required', 'تحتاج مراجعة'), 'yn', (c, tk) => !!tk.rev, { ed: 'sel', w: 110 });
  def('fp', 'mfp', L('Float Path', 'مسار الفلوت'), 'num', (c, tk) => tk.fp, { w: 90 });
  def('fpo', 'mfp', L('Float Path Order', 'ترتيب مسار الفلوت'), 'num', (c, tk) => tk.fpo, { w: 110 });
  // ---------- Number of activities ----------
  const cnt = (f, wf) => (c, tk) => f(tk), cw = (k) => (c, w) => (c.ru.get(w.id) || {})[k];
  def('n', 'num', L('Number of Activities', 'عدد الأنشطة'), 'num', () => 1, { vw: cw('count') });
  def('nNS', 'num', L('Number of Not Started Activities', 'عدد الأنشطة التي لم تبدأ'), 'num', (c, tk) => (tk.status === 'NS' ? 1 : 0), { vw: cw('nNS'), w: 150 });
  def('nIP', 'num', L('Number of In Progress Activities', 'عدد الأنشطة قيد التنفيذ'), 'num', (c, tk) => (tk.status === 'IP' ? 1 : 0), { vw: cw('nIP'), w: 150 });
  def('nC', 'num', L('Number of Completed Activities', 'عدد الأنشطة المكتملة'), 'num', (c, tk) => (tk.status === 'C' ? 1 : 0), { vw: cw('nC'), w: 150 });
  def('nCrit', 'num', L('Number of Critical Activities', 'عدد الأنشطة الحرجة'), 'num', (c, tk) => (tk.crit && tk.status !== 'C' ? 1 : 0), { vw: cw('nCrit'), w: 150 });
  void cnt;
  D.pred.sortV = 1; delete D.stepPct2; delete ALL.stepPct2;
  // the Steps group re-uses the Steps % column
  D.stepPct.group = 'steps'; ALL.stepPct.group = 'steps';

  // ---------- dynamic: activity codes, project codes, user defined ----------
  P6.rebuildDynCols = function (p) {
    for (const k of Object.keys(D)) if (/^(ac|pc|udf):/.test(k)) { delete D[k]; delete ALL[k]; }
    for (const ct of p.codeTypes || []) {
      const k = 'ac:' + ct.id;
      def(k, ct.scope === 'project' ? 'acp' : 'acg', [ct.name, ct.name], 'text', (c, tk) => { const v = c.codeVal.get((tk.codes || {})[ct.id]); return v ? v.short : ''; }, { ed: 'sel', dyn: 1, w: 120 });
      D[k].ctype = ct.id; D[k].desc = (c, tk) => { const v = c.codeVal.get((tk.codes || {})[ct.id]); return v ? v.name : ''; };
    }
    for (const ct of p.pcTypes || []) {
      const k = 'pc:' + ct.id;
      def(k, 'pcode', [ct.name, ct.name], 'text', (c) => { const v = c.pcVal.get((c.p.pcAssign || {})[ct.id]); return v ? v.short : ''; }, { dyn: 1, w: 120, vw: (c) => { const v = c.pcVal.get((c.p.pcAssign || {})[ct.id]); return v ? v.short : ''; } });
    }
    for (const u of p.udfs || []) {
      const k = 'udf:' + u.id, kind = u.ty === 'date' ? 'date' : u.ty === 'number' ? 'num' : u.ty === 'cost' ? 'money' : 'text';
      def(k, 'udf', [u.name, u.name], kind, (c, tk) => { const v = (tk.udf || {})[u.id]; return v == null || v === '' ? null : v; }, { ed: u.ty === 'date' ? 'date' : u.ty === 'text' ? 'text' : 'num', dyn: 1, w: kind === 'text' ? 130 : 100 });
      D[k].udf = u;
    }
  };
  P6.colLabel = (k, lang) => { const d = D[k]; if (!d) return null; return d.label[lang === 'en' ? 0 : 1] || d.label[0]; };
  P6.colGroups = function (p) {
    return GROUPS.map(([id, en, ar]) => ({ id, label: [en, ar], keys: Object.keys(D).filter((k) => D[k].group === id).sort((a, b) => P6.colLabel(a, 'en').localeCompare(P6.colLabel(b, 'en'))) }));
  };
  P6.GROUPS = GROUPS;

  // ---------- evaluation context + cell renderer ----------
  P6.makeCtx = function (p, ru) {
    const byId = new Map(p.tasks.map((x) => [x.id, x]));
    const asgBy = new Map();
    for (const a of p.asg) { if (!asgBy.has(a.task)) asgBy.set(a.task, []); asgBy.get(a.task).push(a); }
    const succ = new Map();
    for (const r of p.rels) { const o = byId.get(r.s); if (!o) continue; if (!succ.has(r.p)) succ.set(r.p, []); succ.get(r.p).push(o.code + (r.type !== 'FS' || r.lag ? r.type : '') + (r.lag ? (r.lag > 0 ? '+' : '') + r.lag : '')); }
    return {
      p, ru, D, byId, asgBy, M: P6.metrics(p), wbs: new Map(p.wbs.map((w) => [w.id, w])), rs: new Map(p.rsrc.map((r) => [r.id, r])),
      cals: new Map(p.cals.map((c) => [c.id, c])), codeVal: new Map((p.codeVals || []).map((v) => [v.id, v])), pcVal: new Map((p.pcVals || []).map((v) => [v.id, v])),
      succText: (tk) => (succ.get(tk.id) || []).join(', ')
    };
  };
  // returns { text, cls, v } or null when the key is unknown
  P6.regCell = function (k, row, c) {
    const d = D[k]; if (!d) return null;
    let v;
    if (row.kind !== 't') {
      if (k === 'wbsname') v = row.w.name; else if (k === 'wbs') v = row.w.code; else if (!d.vw) return { text: '', cls: '', v: null };
      else v = d.vw(c, row.ak ? Object.assign({}, row.w, { id: row.ak }) : row.w);
    } else v = d.v(c, row.t);
    const text = d.kind === 'yn' ? (v == null ? '' : v ? P6.t('yes') : P6.t('no')) : (KIND[d.kind] || KIND.text)(v);
    let cls = RIGHT.has(d.kind) ? 'r' : '';
    if (d.neg && typeof v === 'number' && v < 0) cls += ' neg';
    if (d.kind === 'idx' && typeof v === 'number' && v < 1) cls += ' neg';
    return { text, cls, v };
  };
  // value used for sorting
  P6.colSortVal = function (k, tk, c) { const d = D[k]; if (!d) return null; const v = d.v(c, tk); return v == null ? null : v; };
  P6.fmtKind = (kind, v) => (KIND[kind] || KIND.text)(v);
  P6.rebuildDynCols({ codeTypes: [], pcTypes: [], udfs: [] });
  if (typeof module !== 'undefined' && module.exports) module.exports = P6;
})(typeof globalThis !== 'undefined' ? globalThis : window);

/* Drill-down details for the Project Director brief and the financial snapshot: every number / row / bar opens a card with the data behind it */
(function (G) {
  const Z = G.Z, F = Z.F, dt = Z.dt, A = Z.app;
  if (!G.ZMODE || !Z.dir) return;
  const { L, D, DS, sar, mil, mon, nm, NM, itemTot, P2_ITEMS, planOf, iso, dd, UI } = Z.dir;
  const isAr = () => A.isAr();
  const tr = (t) => (isAr() && Z.i18n ? Z.i18n.tr(t) : t);
  const MY = (M, k) => (isAr() ? tr(dt.fmtMY(M.bs[k]).replace('-', ' 20')) : dt.fmtMY(M.bs[k]));
  const n0 = (v) => F.n0(v);
  const pct = (v, d) => F.pct(v, d == null ? 1 : d);
  const lk = (k, t) => `<a class="dr-lk" ${dd(k)}>${t}</a>`;
  const tb = (heads, rows, nums) => `<div class="dr-sc"><table class="tbl dr-tbl"><thead><tr>${heads.map((h, i) => `<th class="${(nums || []).includes(i) ? 'num' : ''}">${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr${r.cls ? ` class="${r.cls}"` : ''}>${(r.c || r).map((c, i) => `<td class="${(nums || []).includes(i) ? 'num' : ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const sec = (t, h) => `<h4>${t}</h4>${h}`;
  const kv = (rows) => `<table class="dr-facts dr-kv">${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>`;
  const note = (t) => `<div class="dr-note">${t}</div>`;
  const p = (t) => `<p class="dr-p">${t}</p>`;
  const an = (a) => tr(a.name);
  const KIND = {
    a1: L('Prequalification', 'التأهيل (Prequalification)'), a2: L('PO issuance', 'إصدار أمر الشراء (PO)'), a3: L('Manufacture & delivery', 'التصنيع والتوريد (Manufacture & Delivery)'), b: L('Installation & construction', 'التركيب والإنشاء (Installation)'),
  };
  const kindOf = (a) => KIND[a.kind] || ({ ENG: L('Design', 'التصميم (Design)'), GEN: L('General', 'عام (General)') }[a.epc] || a.epc || '');
  const itemName = (k) => (NM[k] ? nm(k) : (Z.GROUPS.find((g) => g.code === k) ? tr(Z.GROUPS.find((g) => g.code === k).name) : k));
  const acts = (M) => M.acts.filter((a) => a.code !== Z.AUTO);
  const itemActs = (M, k) => acts(M).filter((a) => (a.item || a.group) === k);
  const fl = (a) => Math.round(a.floatB);
  const days = (d) => `${d} ${L('d', 'يوم')}`;
  const actRows = (list) => list.map((a) => [lk('act|' + a.code, a.code), an(a), kindOf(a), n0(a.amount), DS(a.s), DS(a.e), days(a.e - a.s + 1)]);
  const actHeads = () => [L('Code', 'الرمز'), L('Activity', 'النشاط'), L('Stage', 'المرحلة'), L('SAR', 'ريال'), L('Start', 'البداية'), L('Finish', 'النهاية'), L('Duration', 'المدة')];
  const sum = (arr, a, b) => arr.slice(a, b).reduce((s, v) => s + v, 0);
  const tot = (list) => list.reduce((s, a) => s + a.amount, 0);
  const rng = (list) => { const s = Math.min(...list.map((a) => a.s)), e = Math.max(...list.map((a) => a.e)); return DS(s) + ' – ' + DS(e); };
  const grpMap = (M) => { const g = {}; acts(M).forEach((a) => { const k = a.item || a.group; (g[k] = g[k] || []).push(a); }); return g; };
  const scen = (M, n) => { const plan = planOf(M), M2 = Z.compute(Z.setPhase2Start(A.s.st, n ? dt.addMonths(plan, n) : plan)); return M2; };

  /* ------------------------------------------------------------ renderers: { title, body } */
  const DET = {};

  DET.budget = (M) => {
    const p2 = P2_ITEMS.reduce((s, k) => s + itemTot(k), 0), p1 = M.total - p2;
    const epc = {}; M.acts.forEach((a) => (epc[a.epc] = (epc[a.epc] || 0) + a.amount));
    return {
      title: L('Total budget – breakdown', 'إجمالي الميزانية – التفصيل'),
      body: kv([[L('Total budget', 'إجمالي الميزانية'), sar(M.total)], [L('VAT', 'ضريبة القيمة المضافة (VAT)'), L('excluded', 'غير شاملة')], [L('Duration', 'المدة'), mon(M.finish - M.start + 1) + ' · ' + D(M.start) + ' → ' + D(M.finish)]]) +
        sec(L('By phase', 'حسب المرحلة'), tb([L('Phase', 'المرحلة'), L('SAR', 'ريال'), '%'], [[lk('phase|Phase 1', L('Phase 1', 'المرحلة الأولى (Phase 1)')), n0(p1), pct(p1 / M.total)], [lk('phase|Phase 2', L('Phase 2', 'المرحلة الثانية (Phase 2)')), n0(p2), pct(p2 / M.total)]], [1, 2])) +
        sec(L('By work package (WBS group)', 'حسب حزم الأعمال (WBS)'), tb([L('Code', 'الرمز'), L('Package', 'الحزمة'), L('SAR', 'ريال'), '%'], Z.GROUPS.map((g) => [lk('group|' + g.code, g.code.replace('.0', '')), tr(g.name), n0(g.amount), pct(g.amount / M.total)]), [2, 3])) +
        sec(L('By work category (EPC)', 'حسب فئة العمل (EPC)'), tb([L('Category', 'الفئة'), L('SAR', 'ريال'), '%'], Z.EPC.map((e) => [tr(e.name), n0(epc[e.key] || 0), pct((epc[e.key] || 0) / M.total)]), [1, 2])) +
        note(L('Phase 1 includes the preliminaries & general requirements, design and all packages other than the four Phase 2 packages.', 'تشمل المرحلة الأولى التمهيديات والمتطلبات العامة والتصميم وكل الحزم عدا حزم المرحلة الثانية الأربع.')),
    };
  };

  DET.phase = (M, ph) => {
    const g = grpMap(M), keys = Object.keys(g).filter((k) => g[k][0].phase === ph), total = ph === 'Phase 2' ? P2_ITEMS.reduce((s, k) => s + itemTot(k), 0) : M.total - P2_ITEMS.reduce((s, k) => s + itemTot(k), 0);
    return {
      title: (ph === 'Phase 2' ? L('Phase 2', 'المرحلة الثانية (Phase 2)') : L('Phase 1', 'المرحلة الأولى (Phase 1)')) + ' · ' + mil(total),
      body: tb([L('Package', 'الحزمة'), L('SAR', 'ريال'), L('Period', 'الفترة'), L('Activities', 'الأنشطة')], keys.map((k) => [lk('item|' + k, k + ' · ' + itemName(k)), n0(itemTot(k)), rng(g[k]), g[k].length]), [1, 3]) +
        (ph === 'Phase 1' ? note(L('Preliminaries & General (4.9 M) are spread over the project duration and are not tied to one activity.', 'التمهيديات والمتطلبات العامة (4.9 مليون) موزعة على مدة المشروع ولا ترتبط بنشاط واحد.')) : '') +
        sec(L('Open', 'عرض'), `<p>${lk('band|' + ph + ':', L('Timeline of this phase', 'الجدول الزمني لهذه المرحلة'))}</p>`),
    };
  };

  DET.sched = (M) => {
    const q = []; for (let k = 0; k < Math.ceil(M.N / 3); k++) { const a = k * 3, b = Math.min(M.N, a + 3), w = sum(M.totalM, a, b); q.push([lk('period|' + a + '-' + b, L('Q', 'ر') + (k + 1)), MY(M, a) + ' → ' + MY(M, b - 1), n0(w), pct(sum(M.totalM, 0, b) / M.total)]); }
    return {
      title: L('Schedule – key dates', 'الجدول الزمني – التواريخ الرئيسية'),
      body: kv([[L('NTP (start)', 'أمر المباشرة (NTP)'), D(M.start)], [L('Phase 2 planned start', 'بداية المرحلة الثانية المخططة'), D(Z.phase2(M).start)], [L('Practical completion', 'الإنجاز الفعلي'), D(M.finish)], [L('Duration', 'المدة'), mon(M.finish - M.start + 1)]]) +
        sec(L('Work value per quarter', 'قيمة الأعمال لكل ربع'), tb([L('Quarter', 'الربع'), L('Months', 'الأشهر'), L('Work value (SAR)', 'قيمة الأعمال (ريال)'), L('Cum. %', 'التراكمي %')], q, [2, 3])) +
        `<p>${lk('ms|ntp', L('Milestones', 'المعالم'))} · ${lk('phase|Phase 1', L('Phase 1 scope', 'نطاق المرحلة الأولى'))} · ${lk('phase|Phase 2', L('Phase 2 scope', 'نطاق المرحلة الثانية'))}</p>`,
    };
  };

  DET.fact = (M, id) => {
    const P = Z.phase2(M), a3 = Object.values(Z.ITEM_BY).filter((i) => /m²|m\)|lots|m,|Plot/.test(i.name));
    const T = {
      proj: [L('The project', 'المشروع'), p(L('A passenger railway station at Al-Zulfi on the Northern Railway network, to improve passenger services and connect Al-Zulfi to the railway network.', 'مشروع إنشاء محطة ركاب بمحافظة الزلفي ضمن شبكة قطار الشمال، بهدف تعزيز خدمات نقل الركاب وربط مدينة الزلفي بشبكة الخطوط الحديدية.')) + sec(L('Main quantities', 'أهم الكميات'), tb([L('Package', 'الحزمة'), L('SAR', 'ريال')], a3.map((i) => [lk('item|' + i.key, i.key + ' · ' + (NM[i.key] ? nm(i.key) : tr(i.name))), n0(i.total)]), [1]))],
      owner: [L('Owner – SAR', 'المالك (Owner) – الخطوط الحديدية السعودية'), p(L('Saudi Arabia Railways owns the project: it approves the designs and permits, issues the NTP and supervises execution and handover.', 'الخطوط الحديدية السعودية – سار هي مالك المشروع: تعتمد التصاميم والتصاريح، وتُصدر أمر المباشرة (NTP)، وتشرف على التنفيذ والتسليم.')) + note(L('General roles – confirm against the contract.', 'أدوار عامة – تُراجع مع العقد.'))],
      funder: [L('Funder – the Association', 'الجهة الممولة (Funder) – الجمعية'), p(L('The Riyadh Logistics Services Cooperative Association funds the project: the advance payment and the interim payments.', 'الجمعية التعاونية للخدمات اللوجستية بمنطقة الرياض هي الجهة الممولة: تدفع الدفعة المقدمة والمستخلصات الدورية.')) + kv([[L('Advance payment', 'الدفعة المقدمة'), sar(M.pay.amount) + ' (' + M.pay.pct + '%)'], [L('Phase 2 funds', 'تمويل المرحلة الثانية'), mil(P2_ITEMS.reduce((s, k) => s + itemTot(k), 0)) + ' · ' + L('approve by', 'يُعتمد قبل') + ' ' + D(P.start - M.st.ms.g2)], [L('Guarantees', 'الضمانات'), L('Part received; the remaining part to be submitted within one year, as agreed.', 'تم استلام جزء منها، ويُستكمل الجزء المتبقي خلال سنة وفق الترتيبات المتفق عليها.')]]) + `<p>${lk('ntp|2', L('Advance payment details', 'تفاصيل الدفعة المقدمة'))} · ${lk('ntp|4', L('Phase 2 funding', 'تمويل المرحلة الثانية'))}</p>`],
      contractor: [L('Contractor – Awj International', 'المقاول (Contractor) – شركة أوج الدولية'), p(L('The contract was awarded to Awj International Contracting after the technical and financial evaluation; signing is complete and preparation for execution is under way.', 'رُسّي المشروع على شركة أوج الدولية للمقاولات بعد التقييم الفني والمالي، واكتملت إجراءات توقيع العقد ويجري التجهيز لبدء التنفيذ.')) + kv([[L('Contract value', 'قيمة العقد'), sar(M.total) + ' · ' + L('excl. VAT', 'قبل الضريبة')], [L('Scope', 'النطاق'), L('Phase 1 and Phase 2', 'المرحلة الأولى والثانية')], [L('Period', 'المدة'), D(M.start) + ' → ' + D(M.finish)]])],
      start: [L('Start – NTP', 'بداية المشروع – أمر المباشرة (NTP)'), kv([[L('NTP date', 'تاريخ NTP'), D(M.start)], [L('Phase 1 funds approved by', 'اعتماد تمويل المرحلة الأولى قبل'), D(M.start - M.st.ms.g1)], [L('Advance payment', 'الدفعة المقدمة'), sar(M.pay.amount)]]) + `<p>${lk('ms|ntp', L('NTP milestone', 'معلم NTP'))} · ${lk('ntp|1', L('Contract note', 'الملاحظة التعاقدية'))}</p>`],
      finish: [L('Completion', 'الإنجاز (Completion)'), kv([[L('Practical completion', 'الإنجاز الفعلي'), D(M.finish)], [L('Months from NTP', 'الأشهر من NTP'), mon(M.finish - M.start + 1)]]) + sec(L('Last activities to finish', 'آخر الأنشطة انتهاءً'), tb([L('Code', 'الرمز'), L('Activity', 'النشاط'), L('Finish', 'النهاية')], acts(M).slice().sort((a, b) => b.e - a.e).slice(0, 8).map((a) => [lk('act|' + a.code, a.code), an(a), DS(a.e)]))) + `<p>${lk('ms|fin', L('Completion milestone', 'معلم الإنجاز'))}</p>`],
    }[id];
    return { title: T[0], body: T[1] };
  };

  DET.group = (M, code) => {
    const g = Z.GROUPS.find((x) => x.code === code), items = [...new Set(acts(M).filter((a) => a.group === code).map((a) => a.item || a.group))];
    return {
      title: code.replace('.0', '') + ' · ' + tr(g.name) + ' · ' + mil(g.amount),
      body: kv([[L('Share of budget', 'نسبة من الميزانية'), pct(g.amount / M.total)]]) + tb([L('Item', 'البند'), L('SAR', 'ريال'), L('Phase', 'المرحلة'), L('Period', 'الفترة')], items.map((k) => { const l = itemActs(M, k); return [lk('item|' + k, k + ' · ' + itemName(k)), n0(itemTot(k)), l[0] ? (l[0].phase === 'Phase 2' ? L('Phase 2', 'الثانية') : L('Phase 1', 'الأولى')) : '–', l.length ? rng(l) : '–']; }), [1]),
    };
  };

  DET.pkg = (M, keys) => ({
    title: keys.split(',').map(itemName).join(' + ').slice(0, 90),
    body: keys.split(',').map((k) => `<h4>${lk('item|' + k, k + ' · ' + itemName(k))} · ${mil(itemTot(k))}</h4>` + (itemActs(M, k).length ? tb(actHeads(), actRows(itemActs(M, k)), [3]) : note(L('Spread over the project duration (not tied to one activity).', 'موزعة على مدة المشروع (غير مرتبطة بنشاط واحد).')))).join(''),
  });

  DET.item = (M, k) => {
    const l = itemActs(M, k), P = Z.phase2(M), f = l.length ? Math.min(...l.map(fl)) : 0, isP2 = l[0] && l[0].phase === 'Phase 2', crit = ['7.2', '6.1'].includes(k);
    const first = l.length ? l[0] : null;
    return {
      title: k + ' · ' + itemName(k) + ' · ' + mil(itemTot(k)),
      body: kv([[L('Share of budget', 'نسبة من الميزانية'), pct(itemTot(k) / M.total)], [L('Phase', 'المرحلة'), isP2 ? L('Phase 2', 'الثانية') : L('Phase 1', 'الأولى')], [L('Period', 'الفترة'), l.length ? rng(l) : '–'], l.length ? [L('Margin to completion (float)', 'الهامش حتى الإنجاز (Float)'), crit ? L('Critical – zero margin', 'حرج – بلا هامش') : (f <= 0 ? L('Critical', 'حرج') : days(f))] : [L('Note', 'ملاحظة'), L('General item', 'بند عام')], l.some((a) => a.ll) ? [L('Long-lead', 'توريد طويل المدة (Long-lead)'), L('Yes – manufacturing & delivery', 'نعم – التصنيع والتوريد')] : [L('Long-lead', 'توريد طويل المدة'), L('No', 'لا')]]) +
        (l.length ? tb(actHeads().concat([L('Margin', 'الهامش')]), actRows(l).map((r, i) => r.concat([['7.2', '6.1'].includes(k) ? '0' : days(fl(l[i]))])), [3]) : note(L('Spread over the project duration (not tied to one activity).', 'موزعة على مدة المشروع (غير مرتبطة بنشاط واحد).'))) +
        (isP2 ? `<p>${lk('dep|0', L('Dependencies', 'الاعتماديات'))} · ${lk('why|0', L('Why it is critical', 'لماذا هو حرج'))}</p>` : ''),
    };
  };

  DET.act = (M, code) => {
    const a = M.by[code], pre = a.deps.map((c) => M.by[c]), suc = (a.succ || []).map((c) => M.by[c]).filter(Boolean);
    const mm = a.m.map((v, i) => [i, v]).filter((x) => x[1] > 0);
    return {
      title: a.code + ' · ' + an(a),
      body: p(tr(a.desc || a.name)) + kv([[L('Value', 'القيمة'), sar(a.amount)], [L('Start → finish', 'من → إلى'), D(a.s) + ' → ' + D(a.e)], [L('Duration', 'المدة'), days(a.e - a.s + 1) + ' (' + mon(a.e - a.s + 1) + ')'], [L('Excel baseline', 'خطة الإكسل الأساسية'), D(a.bs) + ' → ' + D(a.be)], [L('Margin to completion', 'الهامش حتى الإنجاز'), ['7.2', '6.1'].includes(a.item) && a.kind === 'b' ? L('0 d (critical)', '0 يوم (حرج)') : days(fl(a))], [L('Latest start', 'آخر بداية'), D(a.s + a.floatB)], [L('Phase / category', 'المرحلة / الفئة'), (a.phase === 'Phase 2' ? L('Phase 2', 'الثانية') : L('Phase 1', 'الأولى')) + ' · ' + kindOf(a)], a.ll ? [L('Long-lead', 'توريد طويل المدة'), L('Yes', 'نعم')] : [L('Long-lead', 'توريد طويل المدة'), L('No', 'لا')]]) +
        (pre.length ? sec(L('Needs (predecessors)', 'يعتمد على (السوابق)'), tb([L('Code', 'الرمز'), L('Activity', 'النشاط'), L('Finish', 'النهاية')], pre.map((x) => [lk('act|' + x.code, x.code), an(x), DS(x.e)]))) : '') +
        (suc.length ? sec(L('Unlocks (successors)', 'يفتح (اللواحق)'), tb([L('Code', 'الرمز'), L('Activity', 'النشاط'), L('Start', 'البداية')], suc.map((x) => [lk('act|' + x.code, x.code), an(x), DS(x.s)]))) : '') +
        (mm.length ? sec(L('Monthly spend', 'الصرف الشهري'), tb([L('Month', 'الشهر'), L('SAR', 'ريال')], mm.map(([i, v]) => [lk('month|' + i, MY(M, i)), n0(v)]), [1])) : ''),
    };
  };

  const MSX = {
    ntp: { t: L('NTP – Notice to Proceed', 'أمر المباشرة (NTP)'), d: (M) => M.start, w: L('Starts the contract period and releases the advance payment; the 26-month programme runs from this date.', 'يبدأ مدة العقد ويُصرف عنده الدفعة المقدمة، ومنه تُحسب مدة المشروع (26 شهراً).'), u: L('Design, access permits and mobilisation.', 'التصميم وتصاريح الدخول والتعبئة (Mobilisation).'), list: (M) => acts(M).filter((a) => a.s <= M.start + 31).slice(0, 8) },
    prelim: { t: L('Preliminary design approved', 'اعتماد التصميم الأولي (Preliminary Design)'), d: (M) => M.by['2.4'].e, w: L('Fixes the design basis; Phase 2 procurement starts right after it.', 'يثبّت أساس التصميم، وتبدأ بعده مشتريات المرحلة الثانية.'), u: L('First procurement and Phase 2 procurement (Prequalification).', 'أول المشتريات ومشتريات المرحلة الثانية (التأهيل).'), list: (M) => acts(M).filter((a) => a.group === '2.0') },
    proc: { t: L('First procurement starts', 'بدء أول مشتريات (Procurement)'), d: (M) => Math.min(...acts(M).filter((a) => a.kind === 'a1' && a.phase === 'Phase 1').map((a) => a.s)), w: L('Vendor prequalification for the first packages opens.', 'يبدأ تأهيل الموردين للحزم الأولى.'), u: L('Purchase orders, manufacturing & delivery.', 'أوامر الشراء ثم التصنيع والتوريد.'), list: (M) => acts(M).filter((a) => a.kind === 'a1' && a.phase === 'Phase 1').sort((x, y) => x.s - y.s).slice(0, 8) },
    detail: { t: L('Detailed design approved', 'اعتماد التصميم التفصيلي (Detailed Design)'), d: (M) => M.by['2.6'].e, w: L('Final approved design – required before the work permit.', 'التصميم النهائي المعتمد – شرط لتصريح العمل.'), u: L('Work permit, then installation.', 'تصريح العمل ثم التركيب.'), list: (M) => acts(M).filter((a) => a.group === '2.0') },
    permit: { t: L('Work permit approved', 'اعتماد تصريح العمل (Work Permit)'), d: (M) => M.by['1.3'].e, w: L('The governing gate: installation and construction cannot start before it.', 'البوابة الحاكمة: لا يبدأ التركيب والإنشاء قبلها.'), u: L('All installation & construction activities.', 'كل أنشطة التركيب والإنشاء.'), list: (M) => acts(M).filter((a) => a.code === '1.3') },
    cons: { t: L('Construction starts on site', 'بدء الإنشاء بالموقع (Construction)'), d: (M) => Math.min(...acts(M).filter((a) => a.kind === 'b').map((a) => a.s)), w: L('Site installation of the first packages.', 'بدء التركيب والإنشاء بالموقع للحزم الأولى.'), u: L('The remaining installation packages.', 'باقي حزم التركيب.'), list: (M) => acts(M).filter((a) => a.kind === 'b').sort((x, y) => x.s - y.s).slice(0, 8) },
    fin: { t: L('Practical completion', 'الإنجاز الفعلي (Completion)'), d: (M) => M.finish, w: L('End of the 26-month programme.', 'نهاية برنامج الـ26 شهراً.'), u: L('Handover.', 'التسليم.'), list: (M) => acts(M).slice().sort((x, y) => y.e - x.e).slice(0, 8) },
  };
  DET.ms = (M, id) => {
    const m = MSX[id], d = m.d(M), l = m.list(M), k = Math.min(M.N - 1, Math.max(0, dt.bucketOf(M.start, Math.min(d, M.finish))));
    return { title: m.t, body: kv([[L('Date', 'التاريخ'), D(d)], [L('Project month', 'شهر المشروع'), (k + 1) + ' / ' + M.N], [L('What it means', 'ماذا يعني'), m.w], [L('What it unlocks', 'ما الذي يفتحه'), m.u]]) + sec(L('Related activities', 'الأنشطة المرتبطة'), tb(actHeads(), actRows(l), [3])) };
  };

  DET.dep = (M, i) => {
    const P = Z.phase2(M), g2 = M.st.ms.g2, d24 = M.by['2.4'].e, d13 = M.by['1.3'].e;
    const T = [
      [L('Preliminary design approval', 'اعتماد التصميم الأولي'), p(L(`Phase 2 procurement (prequalification) starts after the preliminary design is approved on ${D(d24)}, in parallel with the detailed design (approved ${D(M.by['2.6'].e)}).`, `تبدأ مشتريات المرحلة الثانية (التأهيل) بعد اعتماد التصميم الأولي في ${D(d24)}، بالتوازي مع التصميم التفصيلي (يُعتمد ${D(M.by['2.6'].e)}).`)) + tb([L('Package', 'الحزمة'), L('Procurement starts', 'بدء المشتريات'), L('Gap after approval', 'بعد الاعتماد')], P2_ITEMS.map((k) => { const a = M.acts.find((x) => x.item === k && x.kind === 'a1'); return [lk('item|' + k, k + ' · ' + itemName(k)), DS(a.s), days(a.s - d24)]; }))],
      [L('Work permit gate', 'بوابة تصريح العمل'), p(L(`Installation cannot start before the work permit (${D(d13)}).`, `لا يبدأ التركيب والإنشاء قبل تصريح العمل (${D(d13)}).`)) + tb([L('Installation activity', 'نشاط التركيب'), L('Starts', 'يبدأ'), L('After the permit', 'بعد التصريح')], acts(M).filter((a) => a.kind === 'b').sort((x, y) => x.s - y.s).map((a) => [lk('act|' + a.code, a.code + ' · ' + an(a)), DS(a.s), days(a.s - d13)]))],
      [L('Signalling after Track & Turnout', 'الإشارات بعد السكة والتحويلات'), (() => { const g = (it) => M.acts.find((a) => a.item === it && a.kind === 'b'), sg = g('7.4'), tk = g('7.2'), tn = g('7.3'); return p(L('Trackside signalling equipment (point machines, axle counters, signals) can only be installed once the track and turnouts are laid.', 'معدات الإشارات على الخط (محركات التحويلات وعدادات المحاور والإشارات) لا تُركَّب إلا بعد فرش السكة والتحويلات.')) + tb([L('Installation', 'التركيب'), L('Starts', 'يبدأ'), L('Finishes', 'ينتهي')], [tk, tn, sg].map((a) => [lk('act|' + a.code, a.code + ' · ' + an(a)), DS(a.s), DS(a.e)])) + note(sg.s >= Math.max(tk.s, tn.s) ? L('Signalling starts after Track and Turnout – respected.', 'الإشارات تبدأ بعد السكة والتحويلات – مُلتزَم بها.') : L('Warning: signalling is planned before Track & Turnout.', 'تنبيه: الإشارات مخططة قبل السكة والتحويلات.')); })()],
      [L('Funding first', 'اعتماد التمويل أولاً'), p(L(`The Phase 2 amount (${mil(P2_ITEMS.reduce((s, k) => s + itemTot(k), 0))}) must be approved ${g2} days before the Phase 2 start.`, `يجب اعتماد مبلغ المرحلة الثانية (${mil(P2_ITEMS.reduce((s, k) => s + itemTot(k), 0))}) قبل بداية المرحلة الثانية بـ${g2} يوماً.`)) + kv([[L('Phase 2 start', 'بداية المرحلة الثانية'), D(P.start)], [L('Funds approved by', 'اعتماد التمويل قبل'), D(P.start - g2)], [L('Phase 1 funds approved by', 'اعتماد تمويل المرحلة الأولى قبل'), D(M.start - M.st.ms.g1)]]) + tb([L('Package', 'الحزمة'), L('SAR', 'ريال')], P2_ITEMS.map((k) => [lk('item|' + k, k + ' · ' + itemName(k)), n0(itemTot(k))]), [1])],
    ][i];
    return { title: T[0], body: T[1] };
  };

  DET.band = (M, key) => {
    const [ph, ep] = key.split(':'), l = acts(M).filter((a) => a.phase === ph && (!ep || a.epc === ep));
    const name = (ph === 'Phase 2' ? L('Phase 2', 'المرحلة الثانية') : L('Phase 1', 'المرحلة الأولى')) + (ep === 'PROC' ? ' · ' + L('Procurement', 'المشتريات') : ep === 'CONS' ? ' · ' + L('Construction', 'التنفيذ') : '');
    return { title: name + ' · ' + mil(tot(l)), body: kv([[L('Period', 'الفترة'), rng(l)], [L('Activities', 'الأنشطة'), l.length], [L('Value', 'القيمة'), sar(tot(l))]]) + tb(actHeads(), actRows(l.slice().sort((a, b) => a.s - b.s)), [3]) };
  };

  DET.scen = (M, n) => {
    const M2 = scen(M, +n), P2 = Z.phase2(M2), plan = planOf(M), base = scen(M, 0);
    const rows = P2_ITEMS.map((k) => { const l = M2.acts.filter((a) => a.item === k), b0 = base.acts.filter((a) => a.item === k); return [lk('item|' + k, k + ' · ' + itemName(k)), DS(Math.min(...l.map((a) => a.s))) + ' – ' + DS(Math.max(...l.map((a) => a.e))), (Math.max(...l.map((a) => a.e)) - Math.max(...b0.map((a) => a.e))) + ' ' + L('d', 'يوم')]; });
    return {
      title: L('Scenario – Phase 2 starts', 'سيناريو – بداية المرحلة الثانية') + ' ' + D(P2.start),
      body: kv([[L('Phase 2 start', 'بداية المرحلة الثانية'), D(P2.start) + (+n ? ` (+${n} ${L('months', 'أشهر')})` : ' (' + L('plan', 'الخطة') + ')')], [L('Project completion', 'إنجاز المشروع'), D(M2.finish)], [L('Delay vs plan', 'التأخير عن الخطة'), M2.finish - base.finish > 0 ? '+' + days(M2.finish - base.finish) : L('none', 'لا يوجد')]]) +
        sec(L('Phase 2 packages in this scenario', 'حزم المرحلة الثانية في هذا السيناريو'), tb([L('Package', 'الحزمة'), L('Period', 'الفترة'), L('Finish vs plan', 'النهاية مقابل الخطة')], rows, [2])) +
        note(L('Railway Track and Station Road have zero margin, so their delay moves the completion date day for day.', 'السكة وطريق المحطة بلا هامش، فتأخيرهما ينتقل إلى تاريخ الإنجاز يوماً بيوم.')) + `<p><button class="btn sm" data-do="drSc" data-m="${n}">${L('Apply this scenario', 'تطبيق هذا السيناريو')}</button></p>`,
    };
  };

  DET.why = (M, i) => {
    const P = Z.phase2(M), t = (k) => acts(M).filter((a) => a.item === k);
    const T = [
      [L('Zero margin on Track and Station Road', 'السكة وطريق المحطة بلا هامش'), p(L('Any delay in these two packages moves the project completion date by the same number of days.', 'أي تأخير في هاتين الحزمتين ينتقل إلى تاريخ إنجاز المشروع بنفس عدد الأيام.')) + tb([L('Activity', 'النشاط'), L('Start', 'البداية'), L('Finish', 'النهاية'), L('Margin', 'الهامش')], [...t('7.2'), ...t('6.1')].map((a) => [lk('act|' + a.code, a.code + ' · ' + an(a)), DS(a.s), DS(a.e), a.kind === 'b' ? '0' : days(fl(a))]))],
      [L('The track is the longest item', 'السكة أطول بند'), p(L('Railway Track has the longest manufacturing & delivery time (long-lead) before installation can start.', 'للسكة أطول مدة تصنيع وتوريد (Long-lead) قبل أن يبدأ التركيب.')) + tb([L('Stage', 'المرحلة'), L('Duration', 'المدة'), L('From', 'من'), L('To', 'إلى')], t('7.2').map((a) => [lk('act|' + a.code, a.code + ' · ' + kindOf(a)), mon(a.e - a.s + 1), DS(a.s), DS(a.e)]))],
      [L('Contractor continuity', 'استمرارية المقاول'), (() => { const p1 = acts(M).filter((a) => a.phase === 'Phase 1'), p2 = P.list; return p(L('Starting Phase 2 together with Phase 1 keeps crews and equipment employed; a gap between phases means idle crews, demobilisation and re-mobilisation.', 'بدء المرحلة الثانية مع الأولى يُبقي الفرق والمعدات عاملة، وأي فجوة بين المرحلتين تعني توقف الفرق وفك التعبئة وإعادتها (Demobilisation / Re-mobilisation).')) + tb([L('', ''), L('Start', 'البداية'), L('Finish', 'النهاية'), L('Duration', 'المدة')], [[L('Phase 1', 'المرحلة الأولى'), DS(Math.min(...p1.map((a) => a.s))), DS(Math.max(...p1.map((a) => a.e))), mon(Math.max(...p1.map((a) => a.e)) - Math.min(...p1.map((a) => a.s)) + 1)], [L('Phase 2', 'المرحلة الثانية'), DS(P.start), DS(Math.max(...p2.map((a) => a.e))), mon(Math.max(...p2.map((a) => a.e)) - P.start + 1)], [L('Overlap', 'التزامن'), DS(P.start), DS(M.finish), mon(M.finish + 1 - P.start)]]); })()],
    ][i];
    return { title: T[0], body: T[1] };
  };

  /* ------------------------------------------------------------ finance */
  const net = (M) => M.pay.net, per = (M, a, b) => { const w = sum(M.totalM, a, b), ad = sum(M.pay.advIn, a, b), rc = sum(M.pay.rec, a, b); return { w, ad, rc, net: w + ad - rc }; };
  DET.period = (M, key) => {
    const [a, b] = key.split('-').map(Number), r = per(M, a, b), P1 = Z.aggregate(M, () => true, 'phase').map;
    const rows = []; for (let k = a; k < b; k++) rows.push([lk('month|' + k, MY(M, k)), n0(M.totalM[k]), n0((P1['Phase 1'] || [])[k] || 0), n0((P1['Phase 2'] || [])[k] || 0), M.pay.advIn[k] ? n0(M.pay.advIn[k]) : '–', n0(M.pay.net[k]), pct(sum(M.pay.net, 0, k + 1) / M.total)]);
    rows.push({ cls: 'dr-tot', c: [L('Total', 'الإجمالي'), n0(r.w), n0(sum(P1['Phase 1'] || [], a, b)), n0(sum(P1['Phase 2'] || [], a, b)), r.ad ? n0(r.ad) : '–', n0(r.net), pct(sum(M.pay.net, 0, b) / M.total)] });
    return {
      title: L('Cash flow', 'التدفق النقدي') + ' · ' + L('months', 'الأشهر') + ' ' + (a + 1) + '–' + b + ' · ' + mil(r.net),
      body: kv([[L('Period', 'الفترة'), MY(M, a) + ' → ' + MY(M, b - 1)], [L('Net cash required', 'صافي النقد المطلوب'), sar(r.net)], [L('Share of budget (cumulative)', 'نسبة من الميزانية (تراكمي)'), pct(sum(M.pay.net, 0, b) / M.total)]]) +
        tb([L('Month', 'الشهر'), L('Work value', 'قيمة الأعمال'), L('Phase 1', 'الأولى'), L('Phase 2', 'الثانية'), L('Advance', 'الدفعة المقدمة'), L('Net cash', 'صافي النقد'), L('Cum. %', 'التراكمي %')], rows, [1, 2, 3, 4, 5, 6]) +
        note(L('Tap a month for its activities.', 'اضغط على أي شهر لعرض أنشطته.')),
    };
  };

  DET.month = (M, ks) => {
    const k = +ks, grp = Z.aggregate(M, () => true, 'group').map, ph = Z.aggregate(M, () => true, 'phase').map;
    const top = acts(M).filter((a) => a.m[k] > 0).sort((x, y) => y.m[k] - x.m[k]).slice(0, 12);
    return {
      title: MY(M, k) + ' · ' + L('month', 'الشهر') + ' ' + (k + 1) + ' / ' + M.N,
      body: kv([[L('Work value', 'قيمة الأعمال'), sar(M.totalM[k])], [L('Advance received', 'الدفعة المقدمة المستلمة'), sar(M.pay.advIn[k])], [L('Net cash required', 'صافي النقد المطلوب'), sar(M.pay.net[k])], [L('Cumulative net cash', 'تراكمي صافي النقد'), sar(sum(M.pay.net, 0, k + 1)) + ' · ' + pct(sum(M.pay.net, 0, k + 1) / M.total)]]) +
        sec(L('By phase', 'حسب المرحلة'), tb([L('Phase', 'المرحلة'), L('SAR', 'ريال')], ['Phase 1', 'Phase 2'].map((x) => [x === 'Phase 1' ? L('Phase 1', 'الأولى') : L('Phase 2', 'الثانية'), n0((ph[x] || [])[k] || 0)]), [1])) +
        sec(L('By work package', 'حسب حزمة الأعمال'), tb([L('Package', 'الحزمة'), L('SAR', 'ريال')], Z.GROUPS.filter((g) => ((grp[g.code] || [])[k] || 0) > 0).map((g) => [lk('group|' + g.code, g.code.replace('.0', '') + ' · ' + tr(g.name)), n0(grp[g.code][k])]), [1])) +
        sec(L('Largest activities this month', 'أكبر الأنشطة هذا الشهر'), tb([L('Code', 'الرمز'), L('Activity', 'النشاط'), L('SAR', 'ريال')], top.map((a) => [lk('act|' + a.code, a.code), an(a), n0(a.m[k])]), [2])) +
        `<p>${k > 0 ? lk('month|' + (k - 1), '‹ ' + MY(M, k - 1)) : ''} ${k < M.N - 1 ? lk('month|' + (k + 1), MY(M, k + 1) + ' ›') : ''}</p>`,
    };
  };

  DET.ntp = (M, i) => {
    const pay = M.pay, P = Z.phase2(M), r6 = per(M, 0, 6);
    const T = [
      null,
      [L('Contract period & key dates', 'مدة العقد والتواريخ الرئيسية'), p(L('The NTP date starts the contract period (26 months) and fixes the completion date.', 'تاريخ أمر المباشرة يبدأ مدة العقد (26 شهراً) ويحدد تاريخ الإنجاز.')) + kv([[L('Phase 1 funds approved by', 'اعتماد تمويل المرحلة الأولى قبل'), D(M.start - M.st.ms.g1)], [L('NTP & advance payment', 'أمر المباشرة والدفعة المقدمة'), D(M.start)], [L('End of month 6', 'نهاية الشهر 6'), D(M.bs[6] - 1)], [L('Phase 2 funds approved by', 'اعتماد تمويل المرحلة الثانية قبل'), D(P.start - M.st.ms.g2)], [L('Phase 2 start', 'بداية المرحلة الثانية'), D(P.start)], [L('End of month 12', 'نهاية الشهر 12'), D(M.bs[12] - 1)], [L('Practical completion', 'الإنجاز الفعلي'), D(M.finish)]])],
      [L('Advance payment', 'الدفعة المقدمة'), p(L(`The ${pay.pct}% advance payment is released at NTP against an advance payment guarantee.`, `تُصرف الدفعة المقدمة (${pay.pct}%) عند NTP مقابل ضمان الدفعة المقدمة (Advance Payment Guarantee).`)) + kv([[L('Advance', 'الدفعة المقدمة'), sar(pay.amount)], [L('Share of the contract', 'نسبة من قيمة العقد'), pay.pct + '%'], [L('Paid', 'تُصرف'), D(M.start) + ' (NTP)'], [L('Contract value', 'قيمة العقد'), sar(M.total)]]) + `<p>${lk('month|0', L('Month 1 cash flow', 'التدفق النقدي للشهر الأول'))}</p>`],
      [L('Late payments – what is exposed', 'تأخر الدفعات – ما الذي يتعرض'), p(L('Late advance or interim payments delay mobilisation and procurement and may entitle the contractor to an extension of time and cost claims (check the contract conditions).', 'تأخير الدفعة المقدمة أو المستخلصات يؤخر التعبئة والمشتريات، وقد يمنح المقاول حق المطالبة بتمديد المدة (Extension of Time) وبتعويضات (يُراجع مع شروط العقد).')) + sec(L('Payments due in the first months', 'الدفعات المستحقة في الأشهر الأولى'), tb([L('Month', 'الشهر'), L('Net cash', 'صافي النقد')], [0, 1, 2, 3, 4, 5].map((k) => [lk('month|' + k, MY(M, k)), n0(pay.net[k])]), [1])) + kv([[L('First 6 months total', 'إجمالي أول 6 أشهر'), sar(r6.net)]]) + `<p>${lk('period|0-6', L('Month-by-month detail', 'التفصيل شهراً بشهر'))}</p>`],
      [L('Phase 2 activation & its delay impact', 'تفعيل المرحلة الثانية وأثر تأخيرها'), p(L('Phase 2 funds must be approved 30 days before it starts. Every day of delay on Railway Track / Station Road moves completion by a day.', 'يجب اعتماد تمويل المرحلة الثانية قبل بدايتها بـ30 يوماً، وكل يوم تأخير في السكة وطريق المحطة = يوم تأخير في الإنجاز.')) + kv([[L('Phase 2 value', 'قيمة المرحلة الثانية'), sar(P2_ITEMS.reduce((s, k) => s + itemTot(k), 0))], [L('Funds approved by', 'اعتماد التمويل قبل'), D(P.start - M.st.ms.g2)], [L('Phase 2 start', 'بداية المرحلة الثانية'), D(P.start)]]) + tb([L('If Phase 2 starts', 'إذا بدأت المرحلة الثانية'), L('Completion', 'الإنجاز'), L('Delay', 'التأخير')], [0, 3, 6].map((n) => { const M2 = scen(M, n), d = M2.finish - scen(M, 0).finish; return [D(Z.phase2(M2).start), D(M2.finish), d > 0 ? '+' + days(d) : L('none', 'لا يوجد')]; }), [1, 2])],
    ][i];
    return { title: T[0], body: T[1] };
  };

  /* ------------------------------------------------------------ likely questions */
  const FAQ = () => {
    const M = A.s.M, P = Z.phase2(M), pay = M.pay, p2 = P2_ITEMS.reduce((s, k) => s + itemTot(k), 0), r6 = per(M, 0, 6), r12 = per(M, 0, 12), plan = planOf(M);
    const s3 = scen(M, 3), s6 = scen(M, 6), base = scen(M, 0), peak = M.totalM.indexOf(Math.max(...M.totalM));
    const fin = G.ZMODE.id === 'fin';
    const Q = (q, a, more) => ({ q, a: a + (more ? `<div class="dr-more">${more}</div>` : '') });
    const dirQ = [
      Q(L('What is the project and its budget?', 'ما هو المشروع وكم ميزانيته؟'), L(`A railway station at Al-Zulfi; total budget ${mil(M.total, 3)} excl. VAT, funded by the Association, owned by SAR, built by Awj.`, `محطة قطار الزلفي؛ الميزانية ${mil(M.total, 3)} قبل الضريبة، تمولها الجمعية وتملكها سار وينفذها المقاول أوج.`), lk('budget|all', L('Budget breakdown', 'تفصيل الميزانية'))),
      Q(L('When does it start and finish?', 'متى يبدأ وينتهي؟'), L(`NTP ${D(M.start)}, completion ${D(M.finish)} (${mon(M.finish - M.start + 1)}).`, `أمر المباشرة ${D(M.start)} والإنجاز ${D(M.finish)} (${mon(M.finish - M.start + 1)}).`), lk('sched|all', L('Schedule', 'الجدول الزمني')) + ' · ' + lk('ms|fin', L('Completion', 'الإنجاز'))),
      Q(L('Why two phases?', 'لماذا مرحلتان؟'), L(`Phase 1 (${mil(M.total - p2)}) is the main station works; Phase 2 (${mil(p2)}) is four long-lead packages: Railway Track, FF&E, Station Road, Generator Room, funded separately.`, `المرحلة الأولى (${mil(M.total - p2)}) أعمال المحطة الرئيسية، والثانية (${mil(p2)}) أربع حزم طويلة التوريد: السكة والأثاث وطريق المحطة وغرفة المولدات، وتُمول بشكل منفصل.`), lk('phase|Phase 1', L('Phase 1', 'المرحلة الأولى')) + ' · ' + lk('phase|Phase 2', L('Phase 2', 'المرحلة الثانية'))),
      Q(L('Why does Phase 2 start in April 2027?', 'لماذا تبدأ المرحلة الثانية في أبريل 2027؟'), L(`Its procurement follows the preliminary design approval (${D(M.by['2.4'].e)}); Railway Track and Station Road have zero margin, so starting later delays completion day for day.`, `لأن مشترياتها تتبع اعتماد التصميم الأولي (${D(M.by['2.4'].e)})، والسكة وطريق المحطة بلا هامش فأي تأخير في بدايتهما يؤخر الإنجاز يوماً بيوم.`), lk('dep|0', L('Dependency', 'الاعتماد')) + ' · ' + lk('why|0', L('Zero margin', 'بلا هامش'))),
      Q(L('What if Phase 2 is delayed?', 'ماذا لو تأخرت المرحلة الثانية؟'), L(`+3 months → completion ${D(s3.finish)} (+${s3.finish - base.finish} d); +6 months → ${D(s6.finish)} (+${s6.finish - base.finish} d).`, `+3 أشهر → الإنجاز ${D(s3.finish)} (+${s3.finish - base.finish} يوم)؛ +6 أشهر → ${D(s6.finish)} (+${s6.finish - base.finish} يوم).`), lk('scen|3', '+3') + ' · ' + lk('scen|6', '+6')),
      Q(L('Which activities are critical?', 'ما الأنشطة الحرجة؟'), L('Railway Track (7.2), Station Road (6.1) and FF&E (3.3) – zero margin to completion. Generator Room has a long margin.', 'السكة (7.2) وطريق المحطة (6.1) والأثاث (3.3) – بلا هامش حتى الإنجاز. غرفة المولدات لها هامش طويل.'), lk('why|0', L('Details', 'التفاصيل'))),
      Q(L('What is the longest procurement item?', 'ما أطول بند توريد؟'), L('The railway track: manufacturing & delivery before installation.', 'السكة الحديدية: التصنيع والتوريد قبل التركيب.'), lk('why|1', L('Track durations', 'مدد السكة'))),
      Q(L('What are the main dependencies?', 'ما الاعتماديات الرئيسية؟'), L('Preliminary design → Phase 2 procurement; work permit → installation; Track & Turnout → signalling; funding 30 days before Phase 2.', 'التصميم الأولي ← مشتريات المرحلة الثانية؛ تصريح العمل ← التركيب؛ السكة والتحويلات ← الإشارات؛ التمويل قبل المرحلة الثانية بـ30 يوماً.'), [0, 1, 2, 3].map((i) => lk('dep|' + i, '#' + (i + 1))).join(' · ')),
      Q(L('When does construction start on site?', 'متى يبدأ الإنشاء بالموقع؟'), L(`After the work permit (${D(M.by['1.3'].e)}); first installation ${D(MSX.cons.d(M))}.`, `بعد تصريح العمل (${D(M.by['1.3'].e)})؛ أول تركيب ${D(MSX.cons.d(M))}.`), lk('ms|permit', L('Work permit', 'تصريح العمل')) + ' · ' + lk('ms|cons', L('Construction start', 'بدء الإنشاء'))),
    ];
    const finQ = [
      Q(L('What cash is needed in the first 6 months?', 'كم النقد المطلوب في أول 6 أشهر؟'), L(`${sar(r6.net)} including the advance payment (${sar(r6.ad)}).`, `${sar(r6.net)} شاملاً الدفعة المقدمة (${sar(r6.ad)}).`), lk('period|0-6', L('Month by month', 'شهراً بشهر'))),
      Q(L('And for the first year?', 'وللسنة الأولى؟'), L(`${sar(r12.net)} – ${pct(sum(pay.net, 0, 12) / M.total, 0)} of the budget.`, `${sar(r12.net)} – ${pct(sum(pay.net, 0, 12) / M.total, 0)} من الميزانية.`), lk('period|0-12', L('Month by month', 'شهراً بشهر'))),
      Q(L('What is the advance payment?', 'ما الدفعة المقدمة؟'), L(`${pay.pct}% of the contract = ${sar(pay.amount)}, paid at NTP against an advance payment guarantee.`, `${pay.pct}% من قيمة العقد = ${sar(pay.amount)} تُصرف عند NTP مقابل ضمان الدفعة المقدمة.`), lk('ntp|2', L('Details', 'التفاصيل'))),
      Q(L('What is the peak monthly spend?', 'ما ذروة الصرف الشهري؟'), L(`${sar(M.totalM[peak])} in ${MY(M, peak)} (month ${peak + 1}).`, `${sar(M.totalM[peak])} في ${MY(M, peak)} (الشهر ${peak + 1}).`), lk('month|' + peak, L('That month', 'ذلك الشهر'))),
      Q(L('How much is spent per month on average?', 'كم المتوسط الشهري للصرف؟'), L(`${sar(M.total / M.N)} (work value over ${M.N} months).`, `${sar(M.total / M.N)} (قيمة الأعمال على ${M.N} شهراً).`), lk('sched|all', L('By quarter', 'حسب الربع'))),
      Q(L('What happens if payments are delayed?', 'ماذا لو تأخرت الدفعات؟'), L('Mobilisation and procurement slip; the contractor may claim an extension of time and costs (check the contract).', 'تتأخر التعبئة والمشتريات، وقد يطالب المقاول بتمديد المدة وتعويضات (يُراجع العقد).'), lk('ntp|3', L('Exposure', 'ما المعرّض'))),
      Q(L('When must Phase 2 funds be approved?', 'متى يجب اعتماد تمويل المرحلة الثانية؟'), L(`By ${D(P.start - M.st.ms.g2)} (30 days before it starts on ${D(P.start)}); value ${mil(p2)}.`, `قبل ${D(P.start - M.st.ms.g2)} (قبل بدايتها في ${D(P.start)} بـ30 يوماً)؛ قيمتها ${mil(p2)}.`), lk('ntp|4', L('Phase 2 activation', 'تفعيل المرحلة الثانية'))),
      Q(L('Do the figures include VAT?', 'هل الأرقام شاملة ضريبة القيمة المضافة؟'), L('No – all figures exclude VAT.', 'لا – كل الأرقام قبل ضريبة القيمة المضافة (VAT).')),
      Q(L('What guarantees are there?', 'ما الضمانات؟'), L('Part of the required guarantees was received from the Association; the remaining part is to be submitted within one year, as agreed.', 'تم استلام جزء من الضمانات المطلوبة من الجمعية، ويُقدَّم الجزء المتبقي خلال سنة وفق الاتفاق.'), lk('fact|funder', L('Funder', 'الجهة الممولة'))),
    ];
    return { title: L('Likely questions', 'أسئلة متوقعة'), body: (fin ? finQ : dirQ).map((x) => `<details class="dr-q"><summary>${x.q}</summary><div class="dr-a">${x.a}</div></details>`).join('') };
  };

  /* ------------------------------------------------------------ entry */
  Z.dirDetails = (M, k) => {
    if (!k) return '';
    const i = k.indexOf('|'), kind = k.slice(0, i), key = k.slice(i + 1);
    let d = null;
    try { d = kind === 'faq' ? FAQ() : DET[kind] ? DET[kind](M, key) : null; } catch (e) { d = { title: L('Details', 'التفاصيل'), body: p(String(e && e.message || e)) }; }
    if (!d) return '';
    const u = UI();
    return `<div class="dr-ov"><div class="dr-bd" data-do="drClose"></div><div class="dr-md"><div class="dr-mh">${u.h.length ? `<button class="btn sm" data-do="drBack">‹ ${L('Back', 'رجوع')}</button>` : ''}<h3>${d.title}</h3><button class="btn sm" data-do="drClose">✕ ${L('Close', 'إغلاق')}</button></div><div class="dr-mb">${d.body}</div></div></div>`;
  };
})(window);

/* Project Director brief (4 slides) + financial & cash-flow snapshot (1 slide): live figures from the schedule / cost model, Arabic with English terms in brackets */
(function (G) {
  const Z = G.Z, F = Z.F, dt = Z.dt, A = Z.app;
  if (!G.ZMODE || (G.ZMODE.id !== 'dir' && G.ZMODE.id !== 'fin')) return;
  // Latin terms in brackets are isolated so Arabic sentences keep their order
  const iso = (t) => t.replace(/\([^()]*[A-Za-z][^()]*\)/g, (m) => '\u2066' + m.replace(/ /g, '\u00A0') + '\u2069');
  const L = (en, ar) => (A.isAr() ? iso(ar) : en);
  const ED = (id, def, o) => A.ed(id, def, null, Object.assign({ native: true }, o || {}));
  // drill-down: every number / row / bar opens a details card (Z.dirDetails in director-details.js)
  const UI = () => (A.s.ui.dr = A.s.ui.dr || { k: null, h: [] });
  const dd = (k) => `data-do="drOpen" data-k="${k}"`;
  A.actions.drOpen = (el) => { const u = UI(); if (u.k) u.h.push(u.k); u.k = el.dataset.k; A.refilter(); };
  A.actions.drBack = () => { const u = UI(); u.k = u.h.pop() || null; A.refilter(); };
  A.actions.drClose = () => { const u = UI(); u.k = null; u.h = []; A.refilter(); };
  const hint = () => `<div class="dr-hint"><span>👆 ${L('Tap any number, row or bar for details', 'اضغط على أي رقم أو صف أو شريط لعرض التفاصيل')}</span><button class="chip" ${dd('faq|all')}>❓ ${L('Likely questions', 'أسئلة متوقعة')}</button></div>`;
  const mk = (def) => {
    const r = def.render;
    def.render = (M) => { const o = r(M); return o.replace('</p></div></div>', '</p></div></div>' + hint()) + (Z.dirDetails ? Z.dirDetails(M, UI().k) : ''); };
    return Z.registerSlide(Object.assign({ native: true }, def));
  };
  const D = (d) => (A.isAr() ? Z.i18n.tr(dt.fmt(d)) : dt.fmt(d));
  const DS = (d) => (A.isAr() ? Z.i18n.tr(dt.fmtShort(d)) : dt.fmtShort(d));
  const sar = (v) => F.n0(v) + ' ' + L('SAR', 'ريال');
  const mil = (v, d) => (v / 1e6).toFixed(d == null ? 2 : d) + ' ' + L('M SAR', 'مليون ريال');
  const mon = (days) => { const n = Math.round(days / 30.4375); return A.isAr() ? (n >= 3 && n <= 10 ? n + ' أشهر' : n + ' شهراً') : n + ' months'; };
  const card = (inner, cls, st) => `<div class="dr-card ${cls || ''}" style="${st || ''}">${inner}</div>`;
  const tile = (k, v, d, cls, key) => `<div class="c6-tile dd ${cls || ''}" ${key ? dd(key) : ''}><div class="k">${k}</div><div class="v" style="font-size:34px">${v}</div><div class="d">${d || ''}</div></div>`;
  const head = (id, t, sub) => A.mhead(id, t, sub);

  // scope names: Arabic with the engineering term in brackets
  const NM = {
    '1.0': ['التمهيديات والمتطلبات العامة', 'Preliminaries & General'], '2.0': ['أعمال التصميم', 'Design Works'],
    '3.1': ['المبنى الرئيسي', 'Main Building'], '3.2': ['معدات تقنية المعلومات', 'IT Equipment'], '3.3': ['الأثاث والتجهيزات', 'FF&E'],
    '4.1': ['المحطة الفرعية وأعمال الشركة السعودية للكهرباء', 'Substation & SEC Works'], '4.2': ['مبنى مكافحة الحريق', 'Firefighting Building'], '4.3': ['غرفة المولدات', 'Generator Room'], '4.4': ['خزان المياه الأرضي', 'Underground Water Tank'],
    '5.1': ['أعمال الموقع والمرافق تحت الأرض', 'Site Works & Utilities'], '5.2': ['مظلات المواقف', 'Car Parking Sheds'], '5.3': ['أعمال السور', 'Fence Works'], '5.4': ['نظام البوابة الآلية', 'Automatic Gate'],
    '6.1': ['طريق المحطة', 'Station Road'], '6.3': ['الأعمال الخارجية فوق الأرض', 'External Works'],
    '7.2': ['السكة الحديدية (خط التفافي 2,500 م)', 'Railway Track – Loop Line'], '7.3': ['أعمال التحويلات', 'Railway Turnouts'], '7.4': ['الإشارات والاتصالات', 'Signalling & Telecom'],
  };
  const nm = (k) => (A.isAr() ? iso(`${NM[k][0]} (${NM[k][1]})`) : NM[k][1]);
  const ga = (M, items) => M.acts.filter((a) => a.code !== Z.AUTO && items.includes(a.item || a.group));
  const span = (l) => (l.length ? { s: Math.min(...l.map((a) => a.s)), e: Math.max(...l.map((a) => a.e)) } : null);
  const itemTot = (k) => (Z.ITEM_BY[k] ? Z.ITEM_BY[k].total : (Z.GROUPS.find((g) => g.code === k) || { amount: 0 }).amount);
  const P2_ITEMS = ['7.2', '3.3', '6.1', '4.3'];
  const P1_ROWS = [['1.0'], ['2.0'], ['3.1', '3.2'], ['4.1', '4.2', '4.4'], ['5.1', '5.2', '5.3', '5.4'], ['6.3'], ['7.3'], ['7.4']];
  const planOf = (M) => Math.max(A.planP2(M.start), M.start);
  Z.dir = { L, ED, D, DS, sar, mil, mon, nm, NM, span, itemTot, P2_ITEMS, P1_ROWS, planOf, iso, dd, card, UI, ga };

  /* ---- scenario: move the Phase 2 start (relative to the plan) ---- */
  A.actions.drSc = (el) => {
    const M = A.s.M, plan = planOf(M), n = +el.dataset.m;
    A.setState(Z.setPhase2Start(A.s.st, n ? dt.addMonths(plan, n) : plan));
  };

  /* -------------------------------------------------------------- 1 overview */
  mk({
    id: 'd-overview', i18n: { en: ['Project overview', 'Executive summary & total budget'], ar: ['ملخص المشروع', 'ملخص تنفيذي والميزانية'] },
    render(M) {
      const p2 = P2_ITEMS.reduce((s, k) => s + itemTot(k), 0), p1 = M.total - p2, dur = M.N;
      const groups = Z.GROUPS.map((g) => ({ code: g.code, name: A.isAr() ? Z.i18n.tr(g.name) : g.name, v: g.amount })).sort((a, b) => b.v - a.v);
      const mx = groups[0].v;
      const facts = [
        ['proj', L('Project', 'المشروع'), L('Al-Zulfi railway station – Northern Railway network', 'محطة قطار الزلفي ضمن شبكة قطار الشمال')],
        ['owner', L('Owner', 'المالك (Owner)'), L('Saudi Arabia Railways – SAR', 'الخطوط الحديدية السعودية – سار')],
        ['funder', L('Funder', 'الجهة الممولة (Funder)'), L('Riyadh Logistics Services Cooperative Association', 'الجمعية التعاونية للخدمات اللوجستية بمنطقة الرياض')],
        ['contractor', L('Contractor', 'المقاول (Contractor)'), L('Awj International Contracting', 'شركة أوج الدولية للمقاولات')],
        ['start', L('Start (NTP)', 'بداية المشروع (NTP)'), D(M.start)],
        ['finish', L('Completion', 'الإنجاز (Completion)'), D(M.finish)],
      ].map(([id, k, v]) => `<tr class="dd" ${dd('fact|' + id)}><th>${k}</th><td>${v}</td></tr>`).join('');
      return head('d-overview', L('Project overview', 'ملخص تنفيذي للمشروع'), L('Project Overview & Total Budget', 'نظرة عامة على المشروع وإجمالي الميزانية (Project Overview & Total Budget)')) +
        `<div class="dr dr-1">
          <div class="dr-tiles">
            ${tile(L('Total budget (excl. VAT)', 'إجمالي الميزانية (قبل ضريبة القيمة المضافة)'), mil(M.total, 3), sar(M.total), 'key', 'budget|all')}
            ${tile(L('Phase 1', 'المرحلة الأولى (Phase 1)'), mil(p1), F.pct(p1 / M.total, 0) + ' ' + L('of budget', 'من الميزانية'), '', 'phase|Phase 1')}
            ${tile(L('Phase 2', 'المرحلة الثانية (Phase 2)'), mil(p2), F.pct(p2 / M.total, 0) + ' ' + L('of budget', 'من الميزانية'), 'alt', 'phase|Phase 2')}
            ${tile(L('Duration', 'مدة التنفيذ'), mon(M.finish - M.start + 1), D(M.start) + ' → ' + D(M.finish), 'alt', 'sched|all')}
          </div>
          <div class="dr-row">
            ${card(`<h3>${L('Project facts', 'بيانات المشروع')}</h3><table class="dr-facts">${facts}</table>`)}
            ${card(`<h3>${L('Budget by work package (WBS)', 'الميزانية حسب حزم الأعمال (WBS)')}</h3>${groups.map((g) => `<div class="dr-bar dd" ${dd('group|' + g.code)}><span>${g.code.replace('.0', '')} · ${g.name}</span><i style="width:${(g.v / mx) * 100}%"></i><b>${(g.v / 1e6).toFixed(1)}</b></div>`).join('')}<div class="dr-note">${L('Figures in million SAR, excluding VAT.', 'الأرقام بملايين الريالات دون ضريبة القيمة المضافة (VAT).')}</div>`, '', 'flex:1.25')}
          </div>
        </div>`;
    },
  });

  /* -------------------------------------------------------------- 2 phase 1 */
  mk({
    id: 'd-p1', i18n: { en: ['Phase 1 scope', 'Scope & milestones'], ar: ['نطاق المرحلة الأولى', 'النطاق والمعالم'] },
    render(M) {
      const p2 = P2_ITEMS.reduce((s, k) => s + itemTot(k), 0), p1 = M.total - p2;
      const rows = P1_ROWS.map((its) => {
        const sp = span(ga(M, its)), v = its.reduce((s, k) => s + itemTot(k), 0);
        return `<tr class="dd" ${dd('pkg|' + its.join(','))}><td>${its.map(nm).join('<br>')}</td><td class="num">${(v / 1e6).toFixed(2)}</td><td class="num">${sp ? DS(sp.s) + ' – ' + DS(sp.e) : '–'}</td></tr>`;
      }).join('');
      const b = M.by, firstProc = Math.min(...M.acts.filter((a) => a.kind === 'a1' && a.phase === 'Phase 1').map((a) => a.s));
      const cons = Math.min(...M.acts.filter((a) => a.kind === 'b').map((a) => a.s));
      const ms = [
        ['ntp', L('NTP – project start', 'أمر المباشرة (NTP) – بداية المشروع'), M.start],
        ['prelim', L('Preliminary design approved', 'اعتماد التصميم الأولي (Preliminary Design)'), b['2.4'].e],
        ['proc', L('First procurement starts', 'بدء أول مشتريات (Procurement)'), firstProc],
        ['detail', L('Detailed design approved', 'اعتماد التصميم التفصيلي (Detailed Design)'), b['2.6'].e],
        ['permit', L('Work permit approved', 'اعتماد تصريح العمل (Work Permit)'), b['1.3'].e],
        ['cons', L('Construction starts on site', 'بدء الإنشاء بالموقع (Construction)'), cons],
        ['fin', L('Practical completion', 'الإنجاز الفعلي (Completion)'), M.finish],
      ];
      return head('d-p1', L('Phase 1 scope & milestones', 'نطاق عمل المرحلة الأولى والمعالم'), L('Phase 1 Scope & Milestones', 'Phase 1 Scope & Milestones')) +
        `<div class="dr dr-row" style="flex:1;min-height:0">
          ${card(`<h3>${L('Phase 1 scope', 'نطاق المرحلة الأولى')} · <b>${mil(p1)}</b></h3><table class="tbl dr-tbl"><thead><tr><th>${L('Package', 'الحزمة')}</th><th class="num">${L('M SAR', 'مليون ريال')}</th><th class="num">${L('Period', 'الفترة')}</th></tr></thead><tbody>${rows}</tbody></table>`, '', 'flex:1.8')}
          ${card(`<h3>${L('Key milestones', 'المعالم الرئيسية')}</h3><ol class="dr-tl">${ms.map(([id, n, d], i) => `<li class="dd" ${dd('ms|' + id)}><span class="dot${i === 0 || i === ms.length - 1 ? ' k' : ''}"></span><div><b>${n}</b><em>${D(d)} · ${L('month', 'شهر')} ${dt.bucketOf(M.start, Math.min(d, M.finish)) + 1}</em></div></li>`).join('')}</ol>`)}
        </div>`;
    },
  });

  /* -------------------------------------------------------------- 3 phase 2 */
  mk({
    id: 'd-p2', i18n: { en: ['Phase 2 scope', 'Scope & dependencies'], ar: ['نطاق المرحلة الثانية', 'النطاق والاعتماديات'] },
    render(M) {
      const P = Z.phase2(M), p2 = P2_ITEMS.reduce((s, k) => s + itemTot(k), 0), crit = ['7.2', '6.1'];
      const rows = P2_ITEMS.map((k) => {
        const l = P.list.filter((a) => a.item === k), sp = span(l), f = Math.min(...l.map((a) => a.floatB)), c = crit.includes(k) || f <= 0;
        return `<tr class="dd" ${dd('item|' + k)}><td>${k} · ${nm(k)}</td><td class="num">${(itemTot(k) / 1e6).toFixed(2)}</td><td class="num">${DS(sp.s)} – ${DS(sp.e)}</td><td>${c ? `<span class="pill bad">${L('Critical', 'حرج')}</span>` : `<span class="pill ok">${L('float', 'هامش')} ${Math.round(f)} ${L('d', 'يوم')}</span>`}</td></tr>`;
      }).join('');
      const g2 = M.st.ms.g2;
      const deps = [
        [L('Preliminary design approval', 'اعتماد التصميم الأولي'), L(`Phase 2 procurement starts once it is approved (${D(M.by['2.4'].e)}), in parallel with the detailed design.`, `تبدأ مشتريات المرحلة الثانية فور اعتماده (${D(M.by['2.4'].e)}) بالتوازي مع التصميم التفصيلي (Detailed Design).`)],
        [L('Work permit gate', 'بوابة تصريح العمل (Work Permit)'), L(`Installation cannot start before the work permit (${D(M.by['1.3'].e)}).`, `لا يبدأ التركيب والإنشاء قبل اعتماد تصريح العمل (${D(M.by['1.3'].e)}).`)],
        [L('Signalling after Track & Turnout', 'الإشارات بعد السكة والتحويلات'), L('Trackside signalling equipment is installed only after the track and turnouts are laid.', 'تُركَّب معدات الإشارات على الخط (Signalling) بعد فرش السكة والتحويلات (Track & Turnout).')],
        [L('Funding first', 'اعتماد التمويل أولاً'), L(`The Phase 2 amount (${mil(p2)}) must be approved ${g2} days before the start (${D(P.start - g2)}).`, `يجب اعتماد مبلغ المرحلة الثانية (${mil(p2)}) قبل البداية بـ ${g2} يوماً (${D(P.start - g2)}).`)],
      ];
      return head('d-p2', L('Phase 2 scope & dependencies', 'نطاق عمل المرحلة الثانية والاعتماديات'), L('Phase 2 Scope & Dependencies', 'Phase 2 Scope & Dependencies')) +
        `<div class="dr dr-row" style="flex:1;min-height:0">
          ${card(`<h3>${L('Phase 2 packages', 'حزم المرحلة الثانية')} · <b>${mil(p2)}</b> · ${F.pct(p2 / M.total, 0)}</h3><table class="tbl dr-tbl"><thead><tr><th>${L('Package', 'الحزمة')}</th><th class="num">${L('M SAR', 'مليون ريال')}</th><th class="num">${L('Period', 'الفترة')}</th><th>${L('Status', 'الحالة')}</th></tr></thead><tbody>${rows}</tbody></table><div class="dr-note">${L('Planned start', 'البداية المخططة')}: <b>${D(P.start)}</b></div>
            <h3 style="margin-top:22px">${L('Package value (M SAR)', 'قيمة الحزم (مليون ريال)')}</h3>${P2_ITEMS.map((k) => `<div class="dr-bar dd" ${dd('item|' + k)}><span>${k} · ${A.isAr() ? NM[k][0] : NM[k][1]}</span><i style="width:${(itemTot(k) / itemTot('7.2')) * 100}%;background:${crit.includes(k) ? 'var(--sar-red)' : 'var(--sar-mid)'}"></i><b>${(itemTot(k) / 1e6).toFixed(1)}</b></div>`).join('')}`, '', 'flex:2.1')}
          ${card(`<h3>${L('Dependencies', 'الاعتماديات (Dependencies)')}</h3><ol class="dr-dep">${deps.map(([t, d], i) => `<li class="dd" ${dd('dep|' + i)}><b>${i + 1} · ${t}</b><span>${d}</span></li>`).join('')}</ol>`)}
        </div>`;
    },
  });

  /* -------------------------------------------------------------- 4 integration */
  mk({
    id: 'd-integ', i18n: { en: ['Phase integration', 'Why Phase 2 starts early'], ar: ['التكامل الزمني بين المرحلتين', 'لماذا تبدأ المرحلة الثانية مبكراً'] },
    render(M) {
      const P = Z.phase2(M), plan = planOf(M), off = P.start - plan, delay = P.delay;
      // Gantt: Phase 1 / Phase 2 bars with their own Procurement and Construction bars
      const W = 900, X0 = 190, X1 = W - 12, t0 = M.start - 5, t1 = Math.max(M.finish, M.base.finish) + 25, x = (d) => X0 + ((d - t0) / (t1 - t0)) * (X1 - X0);
      const sp = (l) => span(l);
      const pr = (ph, ep) => sp(M.acts.filter((a) => a.phase === ph && a.code !== Z.AUTO && (!ep || a.epc === ep)));
      const rows = [
        [L('Phase 1', 'المرحلة الأولى'), pr('Phase 1'), 'var(--ph1)', 0, 'Phase 1:'], [L('Procurement', 'المشتريات (Procurement)'), pr('Phase 1', 'PROC'), 'var(--ph1)', 1, 'Phase 1:PROC'], [L('Construction', 'التنفيذ (Construction)'), pr('Phase 1', 'CONS'), 'var(--ph1)', 1, 'Phase 1:CONS'],
        [L('Phase 2', 'المرحلة الثانية'), pr('Phase 2'), 'var(--ph2)', 0, 'Phase 2:'], [L('Procurement', 'المشتريات (Procurement)'), pr('Phase 2', 'PROC'), 'var(--ph2)', 1, 'Phase 2:PROC'], [L('Construction', 'التنفيذ (Construction)'), pr('Phase 2', 'CONS'), 'var(--ph2)', 1, 'Phase 2:CONS'],
      ];
      const RH = 46, TOP = 36, H = TOP + rows.length * RH + 40;
      let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="min-width:640px">`;
      for (let k = 0; k <= M.N; k += 3) { const d = M.bs[Math.min(k, M.N)]; svg += `<line x1="${x(d)}" x2="${x(d)}" y1="${TOP - 6}" y2="${H - 30}" stroke="#e1e9ee"/><text x="${x(d)}" y="${H - 14}" text-anchor="middle" style="font-size:13px">${A.isAr() ? Z.i18n.tr(dt.fmtMY(d)) : dt.fmtMY(d)}</text>`; }
      svg += `<rect x="${x(P.start)}" y="${TOP - 6}" width="${Math.max(0, x(M.finish + 1) - x(P.start))}" height="${rows.length * RH + 6}" fill="var(--ph2)" opacity=".07"/>`;
      rows.forEach(([n, s, col, sub, bk], i) => {
        if (!s) return; const y = TOP + i * RH, h = sub ? 16 : 26, yy = y + (RH - h) / 2;
        svg += `<g class="dd" ${dd('band|' + bk)}><rect x="0" y="${y}" width="${W}" height="${RH}" fill="transparent"/><text x="${sub ? 24 : 4}" y="${y + RH / 2 + 4}" style="font-size:${sub ? 15 : 17}px;font-weight:${sub ? 600 : 800};fill:${col}">${n}</text><rect x="${x(s.s)}" y="${yy}" width="${Math.max(4, x(s.e + 1) - x(s.s))}" height="${h}" rx="4" fill="${col}" ${sub ? 'fill-opacity=".45"' : ''}/>`;
        if (!sub) svg += `<text x="${x(s.e + 1) - 8}" y="${y + RH / 2 + 5}" text-anchor="end" style="fill:#fff;font-size:14px;font-weight:700">${DS(s.s)} → ${DS(s.e)}</text>`;
        svg += '</g>';
      });
      svg += `<line x1="${x(P.start)}" x2="${x(P.start)}" y1="${TOP - 10}" y2="${H - 30}" stroke="var(--ph2)" stroke-width="2.5"/><text x="${x(P.start) + 6}" y="${TOP - 12}" style="font-size:15px;font-weight:800;fill:var(--ph2)">${L('Phase 2 start', 'بداية المرحلة الثانية')} · ${DS(P.start)}</text>`;
      if (delay > 0) svg += `<line x1="${x(M.finish)}" x2="${x(M.finish)}" y1="${TOP - 6}" y2="${H - 30}" stroke="var(--bad)" stroke-width="2" stroke-dasharray="5 4"/>`;
      svg += '</svg>';
      // scenario table
      const sc = [0, 3, 6].map((n) => { const s2 = Z.setPhase2Start(A.s.st, n ? dt.addMonths(plan, n) : plan), M2 = Z.compute(s2); return { n, start: Z.phase2(M2).start, fin: M2.finish, d: M2.finish - M.base.finish }; });
      const chip = (n, label) => `<button class="chip ${Math.abs(P.start - (n ? dt.addMonths(plan, n) : plan)) < 1 ? 'on' : ''}" data-do="drSc" data-m="${n}">${label}</button>`;
      const crit = P.list.filter((a) => ['7.2', '6.1'].includes(a.item) && a.kind === 'b');
      const trackA3 = M.by['7.2a3'];
      const why = [
        L(`Railway Track and Station Road have zero margin: every day of delay moves the completion date by a day.`, `السكة (Railway Track) وطريق المحطة (Station Road) بلا هامش زمني (Zero Float): كل يوم تأخير = يوم تأخير في الإنجاز.`),
        L(`The track is the longest item: ${mon(trackA3.e - trackA3.s)} of manufacturing & delivery before installation.`, `السكة أطول بند: ${mon(trackA3.e - trackA3.s)} للتصنيع والتوريد (Long-lead) قبل التركيب.`),
        L(`Starting Phase 2 with Phase 1 keeps the contractor continuously engaged: ${mon(Math.min(M.finish, M.finish) + 1 - P.start)} of overlapping work instead of a gap between phases (idle crews, demobilisation and re-mobilisation).`, `بدء المرحلة الثانية مع الأولى يُبقي المقاول متواصل العمل: ${mon(M.finish + 1 - P.start)} من التزامن بدل فجوة بين المرحلتين (توقف الفرق، فك التعبئة وإعادتها – Demobilisation).`),
      ];
      return head('d-integ', L('Phase integration', 'خريطة التكامل الزمني بين المرحلتين'), L('Integrated Timeline – why Phase 2 must start early', 'التكامل الزمني (Integrated Timeline) – لماذا تبدأ المرحلة الثانية مبكراً')) +
        `<div class="dr dr-row" style="flex:1;min-height:0">
          <div class="col" style="flex:1.6;gap:14px;min-width:0">${card(`<h3>${L('Both phases on one timeline', 'المرحلتان على خط زمني واحد')}</h3><div style="overflow-x:auto;direction:ltr">${svg}</div>`, '', 'flex:none;overflow:visible')}
            ${card(`<div class="row" style="gap:8px;align-items:center;flex-wrap:wrap"><b style="color:var(--ph2)">${L('Test the Phase 2 start', 'جرّب بداية المرحلة الثانية')}:</b>${chip(0, L('Plan', 'الخطة') + ' · ' + DS(plan))}${chip(3, '+3 ' + L('months', 'أشهر'))}${chip(6, '+6 ' + L('months', 'أشهر'))}<span style="flex:1"></span><b style="color:${delay > 0 ? 'var(--bad)' : 'var(--good)'}">${L('Completion', 'الإنجاز')}: ${D(M.finish)}${delay > 0 ? ' (+' + delay + ' ' + L('d', 'يوم') + ')' : ''}</b></div>
              <table class="tbl dr-tbl" style="margin-top:8px"><thead><tr><th>${L('Phase 2 start', 'بداية المرحلة الثانية')}</th><th class="num">${L('Completion', 'الإنجاز')}</th><th class="num">${L('Delay vs plan', 'التأخير عن الخطة')}</th></tr></thead><tbody>${sc.map((r) => `<tr class="dd" ${dd('scen|' + r.n)}><td>${D(r.start)}</td><td class="num">${D(r.fin)}</td><td class="num">${r.d > 0 ? '<b style="color:var(--bad)">+' + r.d + ' ' + L('d', 'يوم') + '</b>' : L('none', 'لا يوجد')}</td></tr>`).join('')}</tbody></table>`)}
          </div>
          ${card(`<h3>${L('Why Phase 2 must start early', 'لماذا يجب أن تبدأ المرحلة الثانية مبكراً')}</h3><ol class="dr-dep">${why.map((t, i) => `<li class="dd" ${dd('why|' + i)}><b>${i + 1}</b><span>${t}</span></li>`).join('')}</ol><div class="dr-risk"><b>${L('Risk if delayed', 'مخاطر التأخير')}:</b> ${L('contractor stoppage between phases and a later completion date, day for day.', 'توقف المقاول بين المرحلتين وتأخر تاريخ الإنجاز يوماً بيوم.')}</div>`)}
        </div>`;
    },
  });

  /* -------------------------------------------------------------- 5 financial snapshot */
  mk({
    id: 'd-fin', i18n: { en: ['Financial snapshot', 'Budget & cash flow'], ar: ['الملخص المالي', 'الميزانية والتدفق النقدي'] },
    render(M) {
      const pay = M.pay, sum = (arr, a, b) => arr.slice(a, b).reduce((s, v) => s + v, 0);
      const per = (a, b) => { const w = sum(M.totalM, a, b), ad = sum(pay.advIn, a, b), rc = sum(pay.rec, a, b); return { w, ad, rc, net: w + ad - rc, cum: sum(pay.net, 0, b) }; };
      const r6 = per(0, 6), r12 = per(0, 12), r712 = per(6, 12), end6 = M.bs[6], end12 = M.bs[12];
      const row = (label, r, strong, key) => `<tr class="dd" ${dd('period|' + key)} style="${strong ? 'font-weight:800;background:#eef6f8' : ''}"><td>${label}</td><td class="num">${F.n0(r.w)}</td><td class="num">${r.ad ? F.n0(r.ad) : '–'}</td><td class="num"><b>${F.n0(r.net)}</b></td><td class="num">${F.pct(r.cum / M.total)}</td></tr>`;
      const nets = pay.net.slice(0, 12), mxn = Math.max(...nets, 1);
      const cols = `<h3 style="margin:20px 0 6px">${L('Net cash required per month – first year (M SAR)', 'صافي النقد المطلوب شهرياً – السنة الأولى (مليون ريال)')}</h3><div class="dr-cols">${nets.map((v, k) => `<div class="dd" ${dd('month|' + k)}><b>${(v / 1e6).toFixed(1)}</b><i style="height:${Math.max(3, (v / mxn) * 130)}px;background:${k < 6 ? 'var(--sar)' : 'var(--sar-mid)'}"></i><span>${k + 1}</span></div>`).join('')}</div>`;
      return head('d-fin', L('Financial snapshot', 'الملخص المالي والتدفق النقدي'), L('High-Level Financial & Cash Flow Snapshot', 'High-Level Financial & Cash Flow Snapshot')) +
        `<div class="dr dr-1">
          <div class="dr-tiles" style="grid-template-columns:repeat(3,1fr)">
            ${tile(L('Total project budget', 'إجمالي ميزانية المشروع'), mil(M.total, 3), L('excl. VAT', 'قبل ضريبة القيمة المضافة'), 'key', 'budget|all')}
            ${tile(L('Cash required – first 6 months', 'التدفق النقدي المطلوب – أول 6 أشهر'), mil(r6.net), L(`to ${D(end6 - 1)} · incl. ${pay.pct}% advance`, `حتى ${D(end6 - 1)} · شاملاً الدفعة المقدمة ${pay.pct}%`), '', 'period|0-6')}
            ${tile(L('Cash required – first year', 'التدفق النقدي المطلوب – السنة الأولى'), mil(r12.net), L(`to ${D(end12 - 1)} · ${F.pct(r12.cum / M.total, 0)} of budget`, `حتى ${D(end12 - 1)} · ${F.pct(r12.cum / M.total, 0)} من الميزانية`), 'alt', 'period|0-12')}
          </div>
          <div class="dr-row" style="flex:1;min-height:0">
            ${card(`<h3>${L('Cash flow (SAR)', 'التدفق النقدي (Cash Flow) – بالريال')}</h3><table class="tbl dr-tbl"><thead><tr><th>${L('Period', 'الفترة')}</th><th class="num">${L('Work value', 'قيمة الأعمال')}</th><th class="num">${L('Advance', 'الدفعة المقدمة')}</th><th class="num">${L('Net cash required', 'صافي النقد المطلوب')}</th><th class="num">${L('Cum. % budget', 'التراكمي % من الميزانية')}</th></tr></thead><tbody>
              ${row(L('Months 1–6', 'الأشهر 1–6'), r6, false, '0-6')}${row(L('Months 7–12', 'الأشهر 7–12'), r712, false, '6-12')}${row(L('First year', 'السنة الأولى (12 شهراً)'), r12, true, '0-12')}</tbody></table>
              ${cols}
              <div class="dr-note">${L(`Advance payment ${F.n0(pay.amount)} SAR (${pay.pct}%) is paid at NTP.`, `الدفعة المقدمة ${F.n0(pay.amount)} ريال (${pay.pct}%) تُصرف عند NTP.`)}</div>`, '', 'flex:1.75')}
            ${card(`<h3>${L('Contract note – NTP', 'ملاحظة تعاقدية – أمر المباشرة (NTP)')}</h3><ul class="dr-ntp">
              <li>${ED('fin:n1', L('The NTP date starts the contract period (26 months) and fixes the completion date.', 'تاريخ أمر المباشرة (Notice to Proceed) يبدأ مدة العقد (26 شهراً) ويحدد تاريخ الإنجاز.'), { tag: 'span' })} <button class="dr-i" ${dd('ntp|1')}>ⓘ</button></li>
              <li>${ED('fin:n2', L(`The ${pay.pct}% advance payment is released at NTP against an advance payment guarantee.`, `تُصرف الدفعة المقدمة (${pay.pct}%) عند NTP مقابل ضمان الدفعة المقدمة (Advance Payment Guarantee).`), { tag: 'span' })} <button class="dr-i" ${dd('ntp|2')}>ⓘ</button></li>
              <li>${ED('fin:n3', L('Late advance or interim payments delay mobilisation and procurement and may entitle the contractor to an extension of time and cost claims.', 'تأخير صرف الدفعة المقدمة أو المستخلصات يؤخر التعبئة والمشتريات، وقد يمنح المقاول حق المطالبة بتمديد المدة (Extension of Time) وبتعويضات.'), { tag: 'span' })} <button class="dr-i" ${dd('ntp|3')}>ⓘ</button></li>
              <li>${ED('fin:n4', L('Phase 2 activation needs its funds approved 30 days before it starts; every day of delay on Railway Track / Station Road moves completion by a day.', 'تفعيل المرحلة الثانية (Phase 2) يتطلب اعتماد تمويلها قبل البداية بـ30 يوماً، وكل يوم تأخير في السكة وطريق المحطة = يوم تأخير في الإنجاز.'), { tag: 'span' })} <button class="dr-i" ${dd('ntp|4')}>ⓘ</button></li></ul>
              <div class="dr-note">${L('Final wording to be checked against the contract conditions.', 'تُراجع الصياغة النهائية مع شروط العقد (Contract Conditions).')}</div>`)}
          </div>
        </div>`;
    },
  });
})(window);

/* Management update deck (Arabic / English): slides of the SAR-template presentation, built natively and fully editable */
(function (G) {
  const Z = G.Z, F = Z.F, dt = Z.dt, A = Z.app;
  if (!G.ZMODE) return;
  const L = (en, ar) => A.L(en, ar);
  const D = (d) => (A.isAr() ? Z.i18n.tr(dt.fmt(d)) : dt.fmt(d));
  const ED = (id, def, tokens, o) => A.ed(id, def, tokens, Object.assign({ native: true }, o || {}));
  const mkSlide = (def) => Z.registerSlide(Object.assign({ native: true }, def));
  const img = (n) => A.asset(n);
  const go = (id) => `data-nav="${A.idx(id)}"`;

  A.changes.advset = (el) => {
    const k = el.dataset.k, lim = { pct: [0, 100], from: [1, 60], per: [0, 1e10] }[k];
    let v = parseFloat(el.value); if (!isFinite(v)) { A.refilter(); return; }
    v = Math.max(lim[0], Math.min(lim[1], v)); if (k !== 'per') v = Math.round(v);
    const st = Z.cloneState(A.s.st); st.adv[k] = k === 'per' ? Math.round(v) : v; A.setState(st);
  };
  A.actions.advAuto = () => { const st = Z.cloneState(A.s.st); st.adv.per = 0; A.setState(st); };
  const AGENDA = [
    ['m-intro', ['Introduction', 'المقدمة']],
    ['m-about', ['About the project', 'نبذة عن المشروع']],
    ['m-status', ['Current project status', 'حالة المشروع الحالية']],
    ['m-cash6', ['Project cash flows during the first six months', 'التدفقات النقدية للمشروع خلال الأشهر الستة الأولى']],
    ['m-next', ['Next steps', 'الخطوات القادمة']],
  ];
  const split = (photo, inner, extra) => `<div class="m-split ${extra || ''}"><div class="m-photo"><img src="${img(photo)}" alt=""></div><div class="m-seam"></div><div class="m-panel">${inner}</div></div>`;

  /* ---------------------------------------------------------------- 1 cover */
  mkSlide({
    id: 'm-cover', cls: 'm-cover', bare: true, i18n: { en: ['Cover', 'Project update'], ar: ['الغلاف', 'عرض مستجدات المشروع'] },
    render() {
      return `<div class="mc-top"><img class="mc-logo" src="${img('sar-logo.png')}" alt="SAR"></div>
        <div class="mc-band"><i class="st l"></i><i class="st r"></i>
          <div class="mc-title">${ED('c:title', L('Al-Zulfi Railway Station Project<br>Progress Update', 'عرض مستجدات مشروع<br>محطة قطار الزلفي'), null, { tag: 'h1' })}
          ${ED('c:date', L('19 October 2026', '19 أكتوبر 2026'), null, { tag: 'div', style: 'font-size:26px;color:#768692;margin-top:16px' })}</div></div>
        <div class="mc-photo"><img src="${img('photo-cover.jpg')}" alt=""><i class="cut"></i></div>
        <div class="mc-foot"><span>${L('Internal', 'داخلي')}</span><span>SAR.COM.SA</span></div>`;
    },
  });

  /* ---------------------------------------------------------------- 2 agenda */
  mkSlide({
    id: 'm-agenda', i18n: { en: ['Agenda', 'Presentation agenda'], ar: ['أجندة العرض', 'محاور العرض'] },
    render() {
      const items = AGENDA.map(([id, t], i) => `<div class="ag-item" ${go(id)}><b>${i + 1}</b>${ED('ag:' + id, t[A.isAr() ? 1 : 0], null, { tag: 'span' })}</div>`).join('');
      return A.mhead('m-agenda', L('Presentation agenda', 'أجندة العرض'), L('Al-Zulfi Passenger Station', 'محطة ركاب الزلفي')) +
        split('photo-train.jpg', `<div class="ag-list">${items}</div>`, 'agpage');
    },
  });

  /* ---------------------------------------------------------------- 3 intro */
  mkSlide({
    id: 'm-intro', i18n: { en: ['Introduction', 'Purpose of this presentation'], ar: ['المقدمة', 'الغرض من العرض'] },
    render() {
      return A.mhead('m-intro', L('Introduction', 'المقدمة'), L('Al-Zulfi Passenger Station', 'محطة ركاب الزلفي')) +
        split('photo-platform.jpg', ED('intro:body', L('This presentation summarises the current position of the Al-Zulfi Railway Station project, the latest developments on the signing of the project contract, and the next steps to start project execution.', 'يقدم هذا العرض ملخصًا عن الوضع الحالي لمشروع محطة قطار الزلفي، وأبرز المستجدات المتعلقة بتوقيع عقد المشروع، إضافة إلى الخطوات القادمة لبدء تنفيذ المشروع.'), null, { tag: 'p', style: 'font-size:34px;line-height:1.85;margin:0' }));
    },
  });

  /* ---------------------------------------------------------------- 4 about */
  mkSlide({
    id: 'm-about', i18n: { en: ['About the project', 'Scope and parties'], ar: ['نبذة عن المشروع', 'النطاق والأطراف'] },
    render() {
      const row = (k, lab, v) => `<div class="ab-row"><span class="ab-k">${ED('ab:k' + k, lab, null, { tag: 'span' })}</span>${ED('ab:v' + k, v, null, { tag: 'span' })}</div>`;
      return A.mhead('m-about', L('About the project', 'نبذة عن المشروع'), L('Al-Zulfi Passenger Station', 'محطة ركاب الزلفي')) +
        split('photo-platform.jpg', ED('ab:body', L('A passenger station in Al-Zulfi Governorate on the Northern Railway network, to strengthen passenger transport services and connect Al-Zulfi with the railway network.', 'مشروع إنشاء محطة ركاب بمحافظة الزلفي ضمن شبكة قطار الشمال، بهدف تعزيز خدمات نقل الركاب وربط مدينة الزلفي بشبكة الخطوط الحديدية.'), null, { tag: 'p', style: 'font-size:30px;line-height:1.7;margin:0 0 26px' }) +
          row(1, L('Project owner', 'مالك المشروع'), L('Saudi Arabia Railways – SAR', 'الخطوط الحديدية السعودية – سار')) +
          row(2, L('Funding entity', 'الجهة الممولة'), L('Riyadh Logistics Services Cooperative Association', 'الجمعية التعاونية للخدمات اللوجستية بمنطقة الرياض')) +
          row(3, L('Contractor', 'المقاول'), L('Awj International Contracting Company', 'شركة أوج الدولية للمقاولات')));
    },
  });

  /* ---------------------------------------------------------------- 5 status */
  mkSlide({
    id: 'm-status', i18n: { en: ['Current project status', 'Where the project stands today'], ar: ['حالة المشروع الحالية', 'أين وصل المشروع اليوم'] },
    render() {
      const it = [
        [1, L('The tendering process and the technical and financial evaluation have been completed.', 'تم الانتهاء من إجراءات الطرح والتقييم الفني والمالي.')],
        [1, L('The project has been awarded to Awj International Contracting Company.', 'تم ترسية المشروع على شركة أوج الدولية للمقاولات.')],
        [1, L('The contract signing procedures have been completed by both parties.', 'تم الانتهاء من إجراءات توقيع العقد من قبل الطرفين.')],
        [1, L('The temporary project board has been installed; manufacture and installation of the project boards will be completed this week.', 'تم الانتهاء من تركيب اللوحة المؤقتة للمشروع على أن يتم الانتهاء من تصنيع وتركيب اللوحات الخاصة بالمشروع هذا الأسبوع.')],
        [0, L('Preparation and mobilisation for the project are currently under way, ahead of starting execution.', 'يجري حاليًا التجهيز والتحضير للمشروع، تمهيدًا لبدء التنفيذ.')],
      ];
      return A.mhead('m-status', L('Current project status', 'حالة المشروع الحالية'), L('Al-Zulfi Passenger Station', 'محطة ركاب الزلفي')) +
        split('photo-train.jpg', `<div class="st-list">${it.map(([done, t], i) => `<div class="st-item"><i class="${done ? 'ok' : 'wip'}">${done ? '✓' : '…'}</i>${ED('st:' + i, t, null, { tag: 'span' })}</div>`).join('')}</div>
          <div class="st-leg"><span><i class="ok">✓</i>${L('Completed', 'مكتمل')}</span><span><i class="wip">…</i>${L('In progress', 'قيد التنفيذ')}</span></div>`);
    },
  });

  /* ---------------------------------------------------------------- 9 first-six-months cash */
  mkSlide({
    id: 'm-cash6', i18n: { en: ['Cash flows – first 6 months', 'Funding required'], ar: ['التدفقات النقدية – أول 6 أشهر', 'التمويل المطلوب'] },
    render(M) {
      const pay = M.pay, n = Math.min(6, M.N), rows = [];
      let cum = 0, wt = 0, at = 0, rt = 0, nt = 0, mx = 1;
      for (let k = 0; k < n; k++) { const w = M.totalM[k], a = pay.advIn[k], r = pay.rec[k], net = pay.net[k]; cum += net; wt += w; at += a; nt += net; mx = Math.max(mx, net); rows.push([k, w, a, r, net, cum]); }
      const f0 = (v) => F.n0(v), cur = L('SAR', 'ريال');
      const tile = (k, v, d, cls) => `<div class="c6-tile ${cls || ''}"><div class="k">${k}</div><div class="v">${v}<small>${cur}</small></div><div class="d">${d}</div></div>`;
      const body = ED('c6:body', L(`<p>The cash-flow plan identifies the funding needed to execute the project during the first six months, including:</p>
<ul><li><b>Advance payment:</b> {advPct}% of the total contract value.</li><li><b>Interim payments:</b> the financial entitlements expected during the first six months, according to the execution plan.</li><li><b>Total financial requirement:</b> the total amounts to be made available to cover the cash flows in the period, including the advance payment.</li></ul>
<p class="req"><b>Financial requirements:</b> it is essential to make the required liquidity available to cover the cash flows of the first six months, including the {advPct}% advance payment, to ensure work continues without delay.</p>`, `<p>تهدف خطة التدفقات النقدية إلى تحديد الاحتياجات المالية اللازمة لتنفيذ المشروع خلال الأشهر الستة الأولى، بما يشمل:</p>
<ul><li><b>الدفعة المقدمة:</b> بنسبة {advPct}% من إجمالي قيمة العقد.</li><li><b>الدفعات المرحلية:</b> المستحقات المالية المتوقعة خلال الأشهر الستة الأولى، وفقًا لخطة تنفيذ المشروع.</li><li><b>إجمالي الاحتياج المالي:</b> إجمالي المبالغ المطلوب توفيرها لتغطية التدفقات النقدية خلال الفترة، بما في ذلك الدفعة المقدمة.</li></ul>
<p class="req"><b>المتطلبات المالية:</b> من الضروري توفير السيولة المالية اللازمة لتغطية التدفقات النقدية للأشهر الستة الأولى، بما في ذلك الدفعة المقدمة بنسبة {advPct}%، وذلك لضمان استمرارية تنفيذ الأعمال بدون تأخير.</p>`), { advPct: pay.pct }, { tag: 'div' });
      const tbl = `<table class="tbl c6-tbl"><thead><tr><th>${L('Month', 'الشهر')}</th><th>${L('Period', 'الفترة')}</th><th class="num">${L('Work value', 'قيمة الأعمال')}</th><th class="num">${L('Advance', 'الدفعة المقدمة')}</th><th class="num">${L('Net payment', 'صافي الدفعة')}</th><th class="num">${L('Cumulative', 'التراكمي')}</th></tr></thead><tbody>
        ${rows.map(([k, w, a, r, net, c]) => `<tr><td><b>${k + 1}</b></td><td>${A.isAr() ? Z.i18n.tr(dt.fmtMY(M.bs[k]).replace('-', ' 20')) : dt.fmtMY(M.bs[k])}</td><td class="num">${f0(w)}</td><td class="num">${a ? f0(a) : '–'}</td><td class="num"><div class="bar-cell"><span class="b" style="width:${Math.max(2, (net / mx) * 90)}px"></span><b>${f0(net)}</b></div></td><td class="num">${f0(c)}</td></tr>`).join('')}
        </tbody><tfoot><tr><td colspan="2">${L('Total – first six months', 'الإجمالي – الأشهر الستة الأولى')}</td><td class="num">${f0(wt)}</td><td class="num">${f0(at)}</td><td class="num">${f0(nt)}</td><td></td></tr></tfoot></table>`;
      return A.mhead('m-cash6', L('Project cash flows during the first six months', 'التدفقات النقدية للمشروع خلال الأشهر الستة الأولى'), L('Al-Zulfi Passenger Station', 'محطة ركاب الزلفي')) +
        `<div class="c6"><div class="c6-text"><div class="c6-panel">${body}</div></div>
          <div class="c6-right"><div class="c6-tiles">${tile(L('Advance payment', 'الدفعة المقدمة') + ` (${pay.pct}%)`, f0(at), L('received at NTP', 'تُستلم عند أمر البدء'))}${tile(L('Interim payments', 'الدفعات المرحلية'), f0(wt), L('work value, months 1–6', 'قيمة الأعمال، الأشهر 1–6'), 'alt')}${tile(L('Total requirement', 'إجمالي الاحتياج المالي'), f0(nt), '', 'key')}</div>
          <div class="c6-ctl"><label>${L('Advance %', 'نسبة الدفعة المقدمة %')}<input type="number" min="0" max="100" step="1" value="${pay.pct}" data-chg="advset" data-k="pct"></label></div>
          <div class="c6-note">${L('Figures are taken from the project cost and schedule model and update with any change to the start date or schedule.', 'الأرقام مأخوذة من نموذج تكلفة وجدول المشروع وتتحدث مع أي تعديل في تاريخ البدء أو الجدول.')}</div>
          <div class="c6-tblw">${tbl}</div></div></div>`;
    },
  });

  /* ---------------------------------------------------------------- 11 next steps */
  mkSlide({
    id: 'm-next', i18n: { en: ['Next steps', 'What happens next'], ar: ['الخطوات القادمة', 'ما الذي سيحدث بعد ذلك'] },
    render(M) {
      const dl = A.isAr() ? Z.i18n.tr(dt.fmtMY(M.bs[Math.min(6, M.N)]).replace('-', ' 20')) : (['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][dt.parts(M.bs[Math.min(6, M.N)]).m] + ' ' + dt.parts(M.bs[Math.min(6, M.N)]).y);
      const it = [
        [L('Install the main board of the project.', 'تركيب اللوحة الأساسية للمشروع.'), ''],
        [L('Provide the remaining part of the guarantees by the Riyadh Logistics Services Cooperative Association.', 'توفير الجزء المتبقي من الضمانات من قبل الجمعية التعاونية للخدمات اللوجستية بمنطقة الرياض.'), ''],
        [L(`Provide the liquidity needed to cover the cash flows of the first six months, including the ${M.pay.pct}% advance payment.`, `توفير السيولة المالية اللازمة لتغطية التدفقات النقدية للأشهر الستة الأولى، شاملةً الدفعة المقدمة بنسبة ${M.pay.pct}%.`), ''],
        [L('Complete the remaining preparations to start the project.', 'استكمال التجهيزات والتحضيرات المتبقية لبدء المشروع.'), ''],
        [L('Issue the Notice to Proceed letter.', 'إصدار خطاب الإشعار ببدء التنفيذ.'), ''],
      ];
      return A.mhead('m-next', L('Next steps', 'الخطوات القادمة'), L('Al-Zulfi Passenger Station', 'محطة ركاب الزلفي')) +
        split('photo-train.jpg', `<div class="nx-list">${it.map(([t, chip], i) => `<div class="nx-item"><b>${i + 1}</b><div>${ED('nx:' + i, t, null, { tag: 'span' })}${chip ? `<em class="chip-dl">${chip}</em>` : ''}</div></div>`).join('')}</div>`);
    },
  });

  /* ---------------------------------------------------------------- 12 thanks */
  mkSlide({
    id: 'm-thanks', cls: 'm-thanks', bare: true, i18n: { en: ['Thank you', 'Closing'], ar: ['شكراً', 'الختام'] },
    render() {
      return `<i class="tk-st l"></i><i class="tk-st r"></i>
        <div class="tk-title">${ED('tk:t', L('Thank You', 'شكراً'), null, { tag: 'h1' })}</div>
        <div class="tk-logo"><img src="${img('sar-logo-white-ar.png')}" alt="SAR"><span>SAR.COM.SA</span></div>`;
    },
  });
})(window);

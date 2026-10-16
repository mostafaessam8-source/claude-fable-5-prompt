/* Arabic translation layer for the slides reused from the main presentation (dates, units, labels, editable templates).
   Z.i18n.html(htmlString) translates the visible text of rendered HTML; unknown text is left unchanged. */
(function (G) {
  const Z = G.Z;
  const MONTHS = { Jan: 'يناير', Feb: 'فبراير', Mar: 'مارس', Apr: 'أبريل', May: 'مايو', Jun: 'يونيو', Jul: 'يوليو', Aug: 'أغسطس', Sep: 'سبتمبر', Oct: 'أكتوبر', Nov: 'نوفمبر', Dec: 'ديسمبر' };
  const MON_RE = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g;

  const MAP = {
    // generic
    'Excel source': 'مصدر البيانات', 'Back': 'السابق', 'Next': 'التالي', 'SAR': 'ريال', 'Total': 'الإجمالي', 'Phase': 'المرحلة', 'Baseline': 'الخطة الأساسية', 'Reset': 'إعادة ضبط', 'Start': 'البداية', 'Finish': 'النهاية', 'Date': 'التاريخ', 'Variance': 'الفرق', 'Activities': 'الأنشطة', 'activities': 'نشاط', 'on baseline': 'حسب الخطة', 'float': 'هامش', 'Clear': 'مسح', 'Show': 'إظهار', 'Hide': 'إخفاء', '–': '–', 'Phase 1': 'المرحلة الأولى', 'Phase 2': 'المرحلة الثانية',
    // milestones slide
    'Milestones & key gates': 'المعالم الرئيسية وبوابات المشروع',
    'How the schedule gates drive the 26-month programme': 'كيف تتحكم بوابات الجدول الزمني في برنامج المشروع (26 شهراً)',
    'Sheet 3 · Schedule + Sheet 4 · gates': '', 'Timeline': 'المخطط الزمني', 'Register & insights': 'السجل والملاحظات',
    'Hover for the date ruler · drag the diamonds to test scenarios': 'مرّر المؤشر لقراءة التاريخ · اسحب المعالم (◆) لتجربة السيناريوهات',
    'Milestone register, key figures and schedule insights': 'سجل المعالم والأرقام الرئيسية وملاحظات الجدول الزمني',
    'Design & approvals': 'التصاميم والموافقات', 'Procurement': 'المشتريات', 'Work permit gate': 'بوابة تصريح العمل', 'Installation & construction': 'التركيب والإنشاءات',
    'Milestone register': 'سجل المعالم', 'dates move with the start date and your edits': 'التواريخ تتحرك مع تاريخ البدء وتعديلاتك', 'Milestone': 'المعلم',
    'Critical activities': 'الأنشطة الحرجة', 'zero float to completion – click to filter': 'هامش زمني صفري حتى الإنجاز', 'Long-lead items': 'بنود طويلة التوريد', 'Schedule insights': 'ملاحظات الجدول الزمني',
    'No dependency conflicts – all finish-to-start links are respected.': 'لا توجد تعارضات في الارتباطات – كل علاقات (انتهاء ← بدء) محترمة.',
    'Phase 1 amount granted (funds approved) – movable': 'اعتماد مبلغ المرحلة الأولى (الموافقة على التمويل) – قابل للتحريك',
    'NTP – Notice to Proceed (project start)': 'أمر البدء – بداية المشروع',
    'Access permits approved': 'اعتماد تصاريح الدخول', 'Concept design approved': 'اعتماد التصميم المفاهيمي', 'Preliminary design approved': 'اعتماد التصميم الأولي',
    'First procurement starts (Phase 1)': 'بدء أول مشتريات (المرحلة الأولى)',
    'Phase 2 amount granted (funds approved) – movable': 'اعتماد مبلغ المرحلة الثانية (الموافقة على التمويل) – قابل للتحريك',
    'Phase 2 start (release) – movable': 'بدء المرحلة الثانية (الإفراج) – قابل للتحريك',
    'Latest Phase 2 start to hold completion': 'آخر موعد لبدء المرحلة الثانية دون تأخير الإنجاز',
    'Detailed design approved': 'اعتماد التصميم التفصيلي', 'Work permit approved': 'اعتماد تصريح العمل', 'Construction starts on site': 'بدء الإنشاء في الموقع',
    'Long-lead deliveries complete': 'اكتمال توريد المواد طويلة المدة', 'Practical completion': 'الإنجاز الفعلي',
    'Phase 1 funds granted': 'اعتماد مبلغ المرحلة الأولى', 'NTP': 'أمر البدء', 'Access permits': 'تصاريح الدخول', 'Concept design': 'التصميم المفاهيمي', 'Preliminary design': 'التصميم الأولي', '1st procurement': 'بدء المشتريات الأولى',
    'Phase 2 funds granted': 'اعتماد مبلغ المرحلة الثانية', 'Phase 2 start': 'بدء المرحلة الثانية', 'Latest Phase 2 start': 'آخر موعد لبدء المرحلة الثانية', 'Detailed design': 'التصميم التفصيلي', 'Work permit': 'تصريح العمل', 'Construction start': 'بدء الإنشاء', 'Long-lead done': 'وصول المواد طويلة التوريد', 'Completion': 'الإنجاز',
    'Move the funds approval – it must be before its phase starts': 'حرّك موعد اعتماد التمويل – يجب أن يسبق بداية مرحلته', 'Move the Phase 2 start – the whole programme updates': 'حرّك بداية المرحلة الثانية – يتحدث البرنامج كله',
    // phase 2 slide
    'Why Phase 2 must start with Phase 1': 'لماذا يجب أن تبدأ المرحلة الثانية مع المرحلة الأولى',
    'The Phase 2 packages that drive the completion date – move the Phase 2 start and see the consequences': 'حزم المرحلة الثانية التي تحدد موعد الإنجاز – حرّك بداية المرحلة الثانية وشاهد النتائج',
    'Sheet 3 + Sheet 4 · gates & long-lead': '', 'Move the Phase 2 start (release)': 'حرّك بداية المرحلة الثانية (الإفراج)', 'With Phase 1 (NTP)': 'مع المرحلة الأولى (أمر البدء)', '+1 month': '+1 شهر', '+3 months': '+3 أشهر', '+6 months': '+6 أشهر',
    'baseline plan': 'حسب الخطة الأساسية', 'at risk – starts before the Detailed Design gate': 'مخاطرة – يبدأ قبل بوابة التصميم التفصيلي', 'released late – completion is exposed': 'إفراج متأخر – الإنجاز معرّض للتأخير',
    'Phase 2 start (release)': 'بداية المرحلة الثانية (الإفراج)', 'Latest start to hold completion': 'آخر بداية للحفاظ على الإنجاز', 'Project completion': 'إنجاز المشروع', 'Phase 2 amount granted by': 'اعتماد مبلغ المرحلة الثانية بتاريخ',
    'Phase 2 packages on the programme': 'حزم المرحلة الثانية على البرنامج الزمني', 'click a bar for details': 'مرّر المؤشر على الشريط للتفاصيل',
    'Prequal. / PO': 'التأهيل / أمر الشراء', 'Manufacture & delivery': 'التصنيع والتوريد', 'Installation': 'التركيب', 'Float to baseline completion': 'الهامش حتى الإنجاز الأساسي', 'Latest start': 'آخر موعد للبداية',
    '7.2 Railway Track': '7.2 السكة الحديدية', '3.3 FF&E (Furniture)': '3.3 الأثاث والتجهيزات', '6.1 Access Road': '6.1 طريق الوصول', '4.3 Generator Room': '4.3 غرفة المولدات',
    'critical – cannot slip': 'حرج – لا يحتمل التأخير', 'Why it must start with Phase 1': 'لماذا يجب أن تبدأ مع المرحلة الأولى',
    'Trackside equipment (point machines, axle counters, signals) can only be installed once Track & Turnout are laid.': 'معدات الإشارات على الخط (محركات التحويلات وعدادات المحاور والإشارات الضوئية) لا يمكن تركيبها إلا بعد فرش السكة والتحويلات.',
    '– move it after them, or start Phase 2 earlier.': '– انقلها لما بعدهما، أو ابدأ المرحلة الثانية مبكراً.',
    'Railway Track': 'السكة الحديدية', 'Railway Turnout': 'تحويلات السكة', 'Signalling & Telecom': 'الإشارات والاتصالات',
    // cash flow slide
    'Cash flow & S-curve': 'التدفقات النقدية ومنحنى الإنجاز التراكمي', 'Monthly cost-loaded spend and cumulative progress against the baseline plan': 'الصرف الشهري المحمّل بالتكلفة والتقدم التراكمي مقابل الخطة الأساسية',
    'Sheet 3 · 26-Month Schedule (rows 80–86 + charts)': '', 'Stack by': 'تقسيم حسب', 'WBS group': 'مجموعة هيكل العمل', 'EPC category': 'فئة العمل', 'View': 'العرض', 'Monthly': 'شهري', 'Quarterly': 'ربع سنوي', 'Half-year': 'نصف سنوي', 'Yearly': 'سنوي',
    'Advance payment': 'الدفعة المقدمة', 'Status date': 'تاريخ المتابعة', 'pick a date to read planned progress': 'اختر تاريخاً لقراءة التقدم المخطط', '⬇ Export Excel': '⬇ تصدير إلى إكسل',
    'Monthly spend': 'الصرف الشهري', 'Quarterly spend': 'الصرف الربع سنوي', 'Quarter spend': 'الصرف الربع سنوي', 'Download the current view (stack-by and period) as a SAR-styled Excel table': 'تنزيل العرض الحالي (التقسيم والفترة) كجدول إكسل بقالب سار', 'Half-yearly spend': 'الصرف النصف سنوي', 'Yearly spend': 'الصرف السنوي',
    'SAR per project month · click for detail': 'بالريال لكل شهر من المشروع', 'SAR per project month': 'بالريال لكل شهر من المشروع', 'SAR per project quarter (3 months)': 'بالريال لكل ربع سنة (3 أشهر)', 'SAR per project half-year (6 months)': 'بالريال لكل نصف سنة (6 أشهر)', 'SAR per project year (12 months)': 'بالريال لكل سنة (12 شهراً)',
    'Advance recovery': 'استرداد الدفعة المقدمة', 'Advance payment received': 'الدفعة المقدمة المستلمة', 'Total work cost': 'إجمالي تكلفة الأعمال', 'Net payment': 'صافي الدفعة', 'Cumulative cost': 'التكلفة التراكمية',
    'Cumulative payments (with advance)': 'الدفعات التراكمية (مع الدفعة المقدمة)', 'Cumulative payments (advance at NTP, recovered monthly)': 'الدفعات التراكمية (دفعة مقدمة عند أمر البدء وتُسترد شهرياً)',
    'S-curve – cumulative % of payments (with advance)': 'منحنى الدفعات التراكمية (مع الدفعة المقدمة)', 'S-curve – cumulative % complete (cost)': 'منحنى الإنجاز التراكمي (التكلفة)',
    'Current plan': 'الخطة الحالية', 'Cumulative': 'التراكمي', 'Δ vs baseline': 'الفرق عن الخطة', 'received at NTP': 'تُستلم عند أمر البدء', 'Monthly recovery': 'الاسترداد الشهري',
    'Total (selection)': 'الإجمالي (المحدد)', 'Peak month': 'ذروة الصرف (الشهر)', '50% of cost reached': 'الوصول إلى 50% من التكلفة', 'Planned progress at status date': 'التقدم المخطط في تاريخ المتابعة', 'choose a status date above': 'اختر تاريخ المتابعة أعلاه',
    'General / Preliminaries': 'عام / تمهيدي', 'Engineering (Design)': 'الهندسة (التصميم)', 'Procurement of Materials': 'توريد المواد', 'Installation & Construction': 'التركيب والإنشاءات',
    '1 Preliminaries & General Requirements': '1 التمهيديات والمتطلبات العامة', '2 Design Works': '2 أعمال التصميم', '3 Main Building Works': '3 أعمال المبنى الرئيسي', '4 Ancillary Buildings': '4 المباني المساندة', '5 External & Site Development Works': '5 أعمال الموقع والأعمال الخارجية', '6 Roads & External Works': '6 الطرق والأعمال الخارجية', '7 Railway Track, Turnout & Signalling Works': '7 أعمال السكة والتحويلات والإشارات',
    'Preliminaries & General Requirements': 'التمهيديات والمتطلبات العامة', 'Design Works': 'أعمال التصميم', 'Main Building Works': 'أعمال المبنى الرئيسي', 'Ancillary Buildings': 'المباني المساندة', 'External & Site Development Works': 'أعمال الموقع والأعمال الخارجية', 'Roads & External Works': 'الطرق والأعمال الخارجية', 'Railway Track, Turnout & Signalling Works': 'أعمال السكة والتحويلات والإشارات',
  };
  // activity-name pieces used in tooltips ("7.2a1 · Railway Track – Vendor Prequalification")
  Object.assign(MAP, { 'Access Permits': 'تصاريح الدخول', 'Request Submission & Approval': 'تقديم الطلب والموافقة', 'Work Permit Approval': 'اعتماد تصريح العمل', 'Concept Design': 'التصميم المفاهيمي', 'Submission': 'التقديم', 'Approval': 'الاعتماد', 'Preliminary Design': 'التصميم الأولي', 'Detailed Design': 'التصميم التفصيلي', 'Main Building': 'المبنى الرئيسي', 'IT Equipment': 'معدات تقنية المعلومات', 'Substation & SEC': 'المحطة الفرعية وشركة الكهرباء', 'Firefighting Bldg': 'مبنى مكافحة الحريق', 'Water Tank': 'خزان المياه', 'Site Works & Utilities': 'أعمال الموقع والمرافق', 'Car Parking Sheds': 'مظلات مواقف السيارات', 'Fence Works': 'أعمال السور', 'Automatic Gate': 'البوابة الآلية', 'External Works': 'الأعمال الخارجية', 'Vendor Prequalification': 'التأهيل المسبق للموردين', 'PO Issuance': 'إصدار أمر الشراء', 'Manufacture and Delivery to Site': 'التصنيع والتوريد للموقع', 'Furniture (FF&E)': 'الأثاث والتجهيزات', 'Access Road': 'طريق الوصول', 'Generator Room': 'غرفة المولدات' });

  const TPL = {
    'ins:miles': `<p style="margin:0 0 8px"><b>ضيق في نهاية المشروع:</b> {tightCount} نشاط تركيب ينتهي خلال آخر ~3 أشهر ({tightCodes}…). أقصر فترات التركيب: {shortWin}.</p>
<p style="margin:0 0 8px"><b>ذروة الصرف:</b> الشهر {peakMonth} ({peakDate}) بقيمة {peakAmt}.</p>
<p style="margin:0 0 8px"><b>المرحلة الثانية:</b> يجب أن تبدأ قبل {p2latest} للحفاظ على موعد الإنجاز{p2late}. حرّك المعلم في السجل (الصف {p2row}) أو من شريحة المرحلة الثانية.</p>
<p style="margin:0 0 8px"><b>الدفعة المقدمة:</b> {advAmt} ({advPct}% من العقد) عند أمر البدء، وتُسترد بمبلغ {advPer} شهرياً على مدى {advMonths} شهراً.</p>
<p style="margin:0 0 8px"><b>البوابة الحاكمة:</b> لا يمكن بدء الإنشاء قبل تصريح العمل بتاريخ {permitDate} – وهو يلي اعتماد التصميم التفصيلي ({ddDate}).</p>`,
    'why:p2': `<p style="margin:0 0 12px"><b>1 · سكة القطار هي أطول بند.</b><br>8 أشهر للتصنيع والتوريد + 6 أشهر للتركيب – {trackFloat}.</p>
<p style="margin:0 0 12px"><b>2 · التصميم أولاً.</b><br>تبدأ مشتريات المرحلة الثانية بعد اعتماد التصميم التفصيلي ({ddDate})، لذلك يجب الإفراج عن هذه الحزم مع المرحلة الأولى.</p>
<p style="margin:0 0 12px"><b>3 · كل يوم تأخير = يوم تأخير في التسليم.</b><br>آخر موعد لبدء المرحلة الثانية للحفاظ على موعد الإنجاز: <b>{latest}</b>{delayNow}.</p>
<p style="margin:0 0 12px"><b>4 · الإشارات بعد السكة والتحويلات.</b><br>{sigCheck}</p>
<p style="margin:0"><b>5 · التمويل أولاً.</b><br>يجب اعتماد مبلغ المرحلة الثانية قبل <b>{grantDate}</b> ({g2} يوماً قبل البداية).</p>`,
    'note:cf': 'الخطة الأساسية = خطة إكسل الأصلية مُعاد توقيتها حسب تاريخ البدء الحالي. حرّك الأنشطة أو غيّر الافتراضات وستظهر الفروقات هنا.',
  };

  const dec = (t) => t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  const mon = (t) => t.replace(MON_RE, (m) => MONTHS[m]);
  // activity codes: 3.3b -> 3.3ب, 7.2a1 -> 7.2أ1 (no Latin letters in the Arabic deck)
  const codes = (t) => t.replace(/(^|[^\w.])(\d+\.\d+)([ab])(\d?)(?![A-Za-z])/g, (m, pre, n, l, d) => pre + n + (l === 'a' ? 'أ' : 'ب') + d);
  const amt = (v) => v.replace(/M$/, ' مليون').replace(/K$/, ' ألف');
  const RULES = [
    [/^([−-]?[\d.,]+[MK])$/, (m, v) => amt(v)],
    [/^M(\d+)$/, (m, n) => 'ش' + n],
    [/^M(\d+)[–-]M?(\d+)$/, (m, a, b) => 'ش' + a + '–ش' + b],
    [/^M(\d+)\+$/, (m, n) => 'ش' + n + '+'],
    [/^Q(\d+)$/, (m, n) => 'ر' + n], [/^H(\d+)$/, (m, n) => 'ن' + n], [/^Y(\d+)$/, (m, n) => 'س' + n],
    [/^◆ (\d+) · (.+)$/, (m, n, t) => '◆ ' + n + ' · ' + tx(t)],
    [/^(\d+) dependency conflict\(s\): (.*)$/, (m, n, r) => n + ' تعارض في الارتباطات: ' + r + ' تبدأ قبل ما تسمح به الأنشطة السابقة لها.'],
    [/^of (\d+)$/, (m, n) => 'من ' + n],
    [/^(\d+) days of margin left$/, (m, n) => 'يتبقى ' + n + ' يوم هامش'],
    [/^(\d+) days too late$/, (m, n) => 'متأخر ' + n + ' يوم'],
    [/^baseline (.+?) ?·?$/, (m, d) => 'الأساس ' + tx(d)],
    [/^on baseline (.+)$/, (m, d) => 'حسب الخطة ' + tx(d)],
    [/^([+−-]\d+ d) vs baseline (.+)$/, (m, a, d) => tx(a) + ' مقارنة بالأساس ' + tx(d)],
    [/^(\d+) days before the Phase 2 start$/, (m, n) => 'قبل بداية المرحلة الثانية بـ ' + n + ' يوم'],
    [/^Phase 2 value (.+)$/, (m, v) => 'قيمة المرحلة الثانية ' + tx(v)],
    [/^(.+?) \(now (.+)\)$/, (m, a, b) => a],
    [/^Phase 1 alone$/, () => 'المرحلة الأولى وحدها'],
    [/^Phase 1 \+ Phase 2 together$/, () => 'المرحلتان معاً'],
    [/^(\d+(?:\.\d)?) months?$/, (m, n) => n + ' شهراً'],
    [/^MUST START BY (.+?) ▶$/, (m, d) => 'يجب البدء قبل ' + tx(d) + ' ▶'],
    [/^late (\d+) d ▶$/, (m, n) => 'متأخر ' + n + ' يوم ▶'],
    [/^late (\d+) d$/, (m, n) => 'متأخر ' + n + ' يوم'],
    [/^(\d+) d late$/, (m, n) => 'متأخر ' + n + ' يوم'],
    [/^(\d+) d float$/, (m, n) => n + ' يوم هامش'],
    [/^New completion (.+?) \((.+)\)$/, (m, d, x) => 'الإنجاز الجديد ' + tx(d) + ' (' + tx(x) + ')'],
    [/^⚠ Now planned (\d+) days before Track & Turnout$/, (m, n) => '⚠ مجدولة حالياً قبل السكة والتحويلات بـ ' + n + ' يوم'],
    [/^([+−-]?\d+) d later$/, (m, n) => 'تأخير ' + n.replace(/^[+−-]/, '') + ' يوم'],
    [/^([+−-]?\d+) d earlier$/, (m, n) => 'تبكير ' + n.replace(/^[+−-]/, '') + ' يوم'],
    [/^([+−-]?\d+) d$/, (m, n) => n + ' يوم'],
    [/^(?:SAR )([−-]?[\d,.]+[MK]?)$/, (m, v) => amt(v) + ' ريال'],
    [/^([−-]?[\d,.]+M) SAR$/, (m, v) => amt(v) + ' ريال'],
    [/^Advance \((\d+)%\)$/, (m, p) => 'الدفعة المقدمة (' + p + '%)'],
    [/^(\d+) activities$/, (m, n) => n + ' نشاط'],
    [/^(\d+) activities · ([\d.]+)% of project$/, (m, n, p) => n + ' نشاط · ' + p + '% من المشروع'],
    [/^([\d.]+)% of cost$/, (m, p) => p + '% من التكلفة'],
    [/^cumulative ([\d.]+%)$/, (m, p) => 'تراكمي ' + p],
    [/^last delivery (.+)$/, (m, d) => 'آخر توريد ' + tx(d)],
    [/^Year (\d+) · (.+)$/, (m, n, r) => 'السنة ' + n + ' · ' + tx(r)],
    [/^Month (\d+) · (.+)$/, (m, n, r) => 'الشهر ' + n + ' · ' + tx(r)],
    [/^Quarter (\d+) · (.+)$/, (m, n, r) => 'الربع ' + n + ' · ' + tx(r)],
    [/^Half-year (\d+) · (.+)$/, (m, n, r) => 'النصف ' + n + ' · ' + tx(r)],
    [/^Net payment \((quarter|half-year|year)\)$/, (m, q) => 'صافي الدفعة (' + { quarter: 'الربع', 'half-year': 'النصف', year: 'السنة' }[q] + ')'],
    [/^([+−-]?[\d.]+) pts$/, (m, n) => n + ' نقطة'],
    [/^Trackside equipment.*$/, (m) => MAP['Trackside equipment (point machines, axle counters, signals) can only be installed once Track & Turnout are laid.'] || m],
    [/^([\d.]+[a-z]?\d?) · (.+)$/, (m, c, r) => codes(c) + ' · ' + tx(r)],
    [/^(.+?) \(([+−-]?\d+ d)\)$/, (m, a, b) => tx(a) + ' (' + tx(b) + ')'],
    [/^(\d+(?:\.\d)?) mo$/, (m, n) => n + ' ش'],
  ];

  // translate one plain text (decoded); returns null when nothing is known
  function core(t) {
    if (MAP[t] != null) return MAP[t];
    for (const [re, fn] of RULES) { const m = t.match(re); if (m) return fn(...m); }
    for (const sep of [' · ', ' – ', ' - ', ' → ']) {
      if (t.indexOf(sep) > 0) { const parts = t.split(sep), out = parts.map((p) => { const r = core(p.trim()); return r == null ? p : r; }); if (out.some((p, i) => p !== parts[i])) return out.join(sep); }
    }
    const withM = codes(mon(t)); if (withM !== t) return withM;
    return null;
  }
  const tx = (t) => { let r = core(t); if (r == null) r = t; return codes(mon(r)); };
  Z.i18n = {
    miss: new Set(),
    tr(t) { return tx(dec(t)); },
    tpl(id, def) { if (TPL[id]) return TPL[id]; return Z.i18n.html(def); },
    html(h) {
      let svg = 0;
      return String(h).replace(/(<[^>]*>)|([^<]+)/g, (all, tag, text) => {
        if (tag) {
          if (/^<svg[\s>]/i.test(tag)) svg++; else if (/^<\/svg/i.test(tag)) svg = Math.max(0, svg - 1);
          return tag.replace(/(title|placeholder|aria-label)="([^"]*)"/g, (m, a, v) => a + '="' + tx(dec(v)).replace(/"/g, '&quot;') + '"');
        }
        const lead = text.match(/^\s*/)[0], trail = text.match(/\s*$/)[0], c = text.trim();
        if (!c || !/[A-Za-z]/.test(c)) return text;
        const r = core(dec(c));
        if (r == null) { Z.i18n.miss.add(c); return text; }
        const out = codes(mon(r)).replace(/&/g, '&amp;');
        // chart text stays left-to-right as a whole (numbers + Arabic words in a predictable order)
        return lead + (svg ? '\u2066' + out + '\u2069' : out) + trail;
      });
    },
  };
})(window);

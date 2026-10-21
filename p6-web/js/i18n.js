/* P6 Web – Arabic / English strings. Format: key: [english, arabic] with {0},{1} placeholders. */
(function (g) {
  'use strict';
  const P6 = g.P6;
  const D = {
    // menus
    m_file: ['File', 'ملف'], m_edit: ['Edit', 'تحرير'], m_view: ['View', 'عرض'], m_project: ['Project', 'المشروع'], m_help: ['Help', 'مساعدة'],
    new_project: ['New project…', 'مشروع جديد…'], projects: ['Projects…', 'المشاريع المحفوظة…'], open_file: ['Open file (XER / XML / JSON)…', 'فتح ملف (XER / XML / JSON)…'],
    import_update: ['Import update – keep my baseline…', 'استيراد تحديث (XER) مع الاحتفاظ بالبيزلاين…'], import_baseline: ['Import baseline from file…', 'استيراد بيزلاين من ملف…'],
    import_csv: ['Import activities (CSV / Excel)…', 'استيراد أنشطة (CSV / Excel)…'], paste_import: ['Paste activities from Excel…', 'لصق أنشطة من Excel…'], load_sample: ['Load sample project', 'تحميل مشروع تجريبي'],
    export_xer: ['Export XER (Primavera P6)', 'تصدير XER (Primavera P6)'], export_csv: ['Export CSV (Excel)', 'تصدير CSV (Excel)'], export_json: ['Backup JSON (.p6web)', 'نسخة احتياطية JSON'], print: ['Print / PDF', 'طباعة / PDF'],
    undo: ['Undo', 'تراجع'], redo: ['Redo', 'إعادة'], add_activity: ['Add activity', 'إضافة نشاط'], add_milestone: ['Add milestone', 'إضافة معلم (Milestone)'], add_wbs: ['Add WBS', 'إضافة WBS'],
    duplicate: ['Duplicate', 'تكرار'], delete: ['Delete', 'حذف'], indent: ['Indent WBS', 'إزاحة WBS للداخل'], outdent: ['Outdent WBS', 'إزاحة WBS للخارج'], link: ['Link selected (FS)', 'ربط المحدد (FS)'], unlink: ['Unlink selected', 'فك الربط'],
    details: ['Activity details', 'تفاصيل النشاط'],
    zoom_in: ['Zoom in', 'تكبير'], zoom_out: ['Zoom out', 'تصغير'], zoom_fit: ['Fit project', 'ملاءمة المشروع'], go_datadate: ['Go to data date', 'الذهاب إلى Data Date'], go_today: ['Go to today', 'الذهاب إلى اليوم'],
    show_baseline: ['Show baseline bars', 'إظهار أشرطة البيزلاين'], show_critical: ['Highlight critical path', 'إبراز المسار الحرج'], show_rels: ['Show relationship lines', 'إظهار خطوط العلاقات'], show_labels: ['Show activity names', 'إظهار أسماء الأنشطة'], show_float: ['Show total float', 'إظهار الفلوت'],
    group_wbs: ['Group by WBS', 'تجميع حسب WBS'], expand_all: ['Expand all', 'فتح الكل'], collapse_all: ['Collapse all', 'طي الكل'], columns: ['Columns…', 'الأعمدة…'], toggle_details: ['Show / hide details', 'إظهار / إخفاء التفاصيل'],
    project_settings: ['Project settings…', 'إعدادات المشروع…'], calendars: ['Calendars…', 'التقاويم…'], wbs_tree: ['WBS structure…', 'هيكل WBS…'], resources: ['Resources…', 'الموارد…'],
    schedule: ['Schedule', 'جدولة'], auto_schedule: ['Auto-schedule on edit', 'جدولة تلقائية عند التعديل'], update_progress: ['Update progress…', 'تحديث التقدّم…'], baselines: ['Baselines…', 'البيزلاين…'], reports: ['Reports & S-curve…', 'التقارير ومنحنى S…'],
    guide: ['User guide', 'دليل الاستخدام'], shortcuts: ['Keyboard shortcuts', 'اختصارات لوحة المفاتيح'], about: ['About', 'حول'],
    // generic
    close: ['Close', 'إغلاق'], cancel: ['Cancel', 'إلغاء'], save: ['Save', 'حفظ'], create: ['Create', 'إنشاء'], add: ['Add', 'إضافة'], reset: ['Reset', 'إعادة ضبط'], import: ['Import', 'استيراد'], edit: ['Edit', 'تعديل'], search: ['Search…', 'بحث…'], show: ['Show', 'عرض'],
    move: ['Move activity', 'تحريك نشاط'], resize: ['Change duration', 'تغيير المدة'], move_to_wbs: ['Move to WBS', 'نقل إلى WBS'], selected: ['Selected', 'محدد'], activities: ['Activities', 'الأنشطة'],
    new_activity: ['New activity', 'نشاط جديد'], new_milestone: ['New milestone', 'معلم جديد'], new_wbs: ['New WBS', 'WBS جديد'], new_project_name: ['New project', 'مشروع جديد'], sample_name: ['Station Building – Sample', 'مبنى محطة – مشروع تجريبي'],
    // columns
    col_code: ['Activity ID', 'رقم النشاط'], col_name: ['Activity Name', 'اسم النشاط'], col_type: ['Type', 'النوع'], col_wbs: ['WBS', 'WBS'], col_status: ['Status', 'الحالة'],
    col_dur: ['Orig Dur', 'المدة الأصلية'], col_rem: ['Rem Dur', 'المدة المتبقية'], col_pct: ['% Complete', '% الإنجاز'], col_es: ['Start', 'البداية'], col_ef: ['Finish', 'النهاية'],
    col_as: ['Actual Start', 'البداية الفعلية'], col_af: ['Actual Finish', 'النهاية الفعلية'], col_ls: ['Late Start', 'أقصى بداية'], col_lf: ['Late Finish', 'أقصى نهاية'],
    col_tf: ['Total Float', 'الفلوت الكلي'], col_ff: ['Free Float', 'الفلوت الحر'], col_pred: ['Predecessors', 'السوابق'], col_succ: ['Successors', 'اللواحق'],
    col_cal: ['Calendar', 'التقويم'], col_cstr: ['Constraint', 'القيد'], col_cdate: ['Constraint Date', 'تاريخ القيد'],
    col_bs: ['BL Start', 'بداية البيزلاين'], col_bf: ['BL Finish', 'نهاية البيزلاين'], col_vs: ['Start Var', 'انحراف البداية'], col_vf: ['Finish Var', 'انحراف النهاية'], col_res: ['Resources', 'الموارد'],
    type_TT_Task: ['Task Dependent', 'نشاط'], type_TT_Mile: ['Start Milestone', 'معلم بداية'], type_TT_FinMile: ['Finish Milestone', 'معلم نهاية'], type_TT_LOE: ['Level of Effort', 'Level of Effort'], type_TT_Rsrc: ['Resource Dependent', 'معتمد على الموارد'], type_TT_WBS: ['WBS Summary', 'ملخص WBS'],
    st_NS: ['Not Started', 'لم يبدأ'], st_IP: ['In Progress', 'قيد التنفيذ'], st_C: ['Completed', 'مكتمل'],
    cs_SNET: ['Start On or After', 'يبدأ في أو بعد'], cs_SNLT: ['Start On or Before', 'يبدأ في أو قبل'], cs_FNET: ['Finish On or After', 'ينتهي في أو بعد'], cs_FNLT: ['Finish On or Before', 'ينتهي في أو قبل'], cs_MSO: ['Mandatory Start', 'بداية إلزامية'], cs_MFO: ['Mandatory Finish', 'نهاية إلزامية'], cs_ALAP: ['As Late As Possible', 'أقصى تأخير ممكن'],
    f_all: ['All activities', 'كل الأنشطة'], f_critical: ['Critical only', 'الحرجة فقط'], f_IP: ['In progress', 'قيد التنفيذ'], f_NS: ['Not started', 'لم تبدأ'], f_C: ['Completed', 'المكتملة'], f_late: ['Behind baseline', 'متأخرة عن البيزلاين'], f_neg: ['Negative float', 'فلوت سالب'],
    // details
    tab_general: ['General', 'عام'], tab_status: ['Status', 'الحالة والتقدم'], tab_rels: ['Relationships', 'العلاقات'], tab_res: ['Resources', 'الموارد'], tab_notes: ['Notes', 'ملاحظات'],
    select_hint: ['Select an activity or WBS to see its details here.', 'اختر نشاطاً أو WBS لعرض تفاصيله هنا.'], parent_wbs: ['Parent WBS', 'WBS الأب'], pct_type: ['% Complete type', 'نوع نسبة الإنجاز'],
    pt_dur: ['Duration', 'حسب المدة'], pt_phys: ['Physical', 'فعلي (Physical)'], pt_units: ['Units', 'حسب الوحدات'],
    predecessors: ['Predecessors', 'السوابق'], successors: ['Successors', 'اللواحق'], rel_type: ['Type', 'النوع'], lag: ['Lag (d)', 'التأخير (يوم)'], add_rel_ph: ['activity ID…', 'رقم النشاط…'],
    resource: ['Resource', 'المورد'], qty: ['Quantity', 'الكمية'], assign: ['Assign', 'تعيين'], new_resource: ['New resource…', 'مورد جديد…'], resource_name: ['Resource name', 'اسم المورد'],
    // status
    data_date: ['Data Date', 'تاريخ البيانات (Data Date)'], start: ['Start', 'البداية'], finish: ['Finish', 'النهاية'], progress: ['Progress', 'الإنجاز'], critical: ['Critical', 'حرجة'],
    auto_on: ['Auto-schedule', 'جدولة تلقائية'], auto_off: ['Manual schedule (F9)', 'جدولة يدوية (F9)'], saving: ['Saving…', 'جارٍ الحفظ…'], saved: ['Saved', 'تم الحفظ'],
    file_dates: ['File dates (press F9 to recalculate)', 'تواريخ الملف (F9 لإعادة الحساب)'], imported_hint: ['Dates are exactly as stored in the imported file until you edit or schedule.', 'التواريخ كما هي في الملف المستورد حتى تقوم بتعديل أو جدولة.'],
    loops_found: ['Logic loop: {0}', 'حلقة منطقية: {0}'], neg_float: ['Negative float', 'فلوت سالب'], baseline: ['Baseline', 'البيزلاين'], current_plan: ['Current plan', 'الخطة الحالية'], actual: ['Actual', 'الفعلي'],
    // messages
    resched_diff: ['Recalculated: {0} of {1} activities now have different dates than the imported P6 file (engine / calendar differences, or the file was not fully scheduled). Undo to restore.', 'تمت إعادة الحساب: {0} من {1} نشاط تختلف تواريخها عن ملف P6 المستورد (اختلاف المحرك/التقويم أو الملف لم يُجدول بالكامل). تراجع للاستعادة.'], resched_same: ['Recalculated – dates match the imported P6 file ✓', 'تمت إعادة الحساب – التواريخ مطابقة لملف P6 المستورد ✓'],
    undone: ['Undo: {0}', 'تم التراجع: {0}'], redone: ['Redo: {0}', 'تمت الإعادة: {0}'], scheduled: ['Schedule recalculated', 'تمت إعادة الجدولة'], linked: ['{0} links created', 'تم إنشاء {0} علاقة'],
    exported: ['File exported', 'تم تصدير الملف'], opened: ['Opened {0} – {1} activities', 'تم فتح {0} – {1} نشاط'], save_fail: ['Could not save to the browser storage', 'تعذّر الحفظ في ذاكرة المتصفح'],
    imported: ['Imported: {0} new, {1} updated, {2} links', 'تم الاستيراد: {0} جديد، {1} محدّث، {2} علاقة'], baseline_applied: ['Baseline imported for {0} activities', 'تم استيراد البيزلاين لعدد {0} نشاط'],
    update_applied: ['Update imported: {0} activities matched, {1} new', 'تم استيراد التحديث: {0} نشاط مطابق، {1} جديد'], cstr_set: ['Constraint "Start On or After" was set', 'تم ضبط قيد "يبدأ في أو بعد"'],
    confirm_delete: ['Delete {0} activities and {1} WBS elements?', 'حذف {0} نشاط و {1} عنصر WBS؟'], confirm_delete_project: ['Delete this saved project from the browser?', 'حذف هذا المشروع المحفوظ من المتصفح؟'], confirm_generic: ['Are you sure?', 'هل أنت متأكد؟'],
    err_code_empty: ['Activity ID cannot be empty', 'رقم النشاط لا يمكن أن يكون فارغاً'], err_code_dup: ['Activity ID "{0}" already exists', 'رقم النشاط "{0}" موجود مسبقاً'],
    err_date: ['Invalid date (use dd-Mon-yy or yyyy-mm-dd)', 'تاريخ غير صحيح (استخدم dd-Mon-yy أو yyyy-mm-dd)'], err_num: ['Invalid number', 'رقم غير صحيح'], err_finish_before: ['Finish is before start', 'النهاية قبل البداية'],
    err_pred: ['Unknown or invalid predecessor: {0}', 'سابقة غير معروفة أو غير صالحة: {0}'], err_loop: ['This would create a logic loop', 'هذا يسبب حلقة منطقية'], err_rel_exists: ['Relationship already exists', 'العلاقة موجودة مسبقاً'],
    err_link_sel: ['Select two or more activities first', 'حدد نشاطين أو أكثر أولاً'], err_wbs_only: ['Select a WBS element', 'حدد عنصر WBS'], err_indent: ['No previous sibling to indent under', 'لا يوجد عنصر سابق للإزاحة تحته'], err_outdent: ['Already at top level', 'العنصر في المستوى الأعلى'],
    err_root: ['The root WBS cannot be deleted', 'لا يمكن حذف جذر WBS'], err_ip_move: ['Activities in progress cannot be dragged; edit the remaining duration instead', 'لا يمكن سحب نشاط قيد التنفيذ؛ عدّل المدة المتبقية بدلاً من ذلك'],
    err_read: ['Could not read the file: {0}', 'تعذّرت قراءة الملف: {0}'], err_range: ['Range too long', 'المدى طويل جداً'], err_last_cal: ['At least one calendar is required', 'يلزم تقويم واحد على الأقل'], err_cal_used: ['Calendar is in use or is the default', 'التقويم مستخدم أو هو الافتراضي'],
    err_wbs_used: ['WBS contains activities; move them first', 'الـ WBS يحتوي أنشطة؛ انقلها أولاً'], err_csv_cols: ['Could not find an activity-name column', 'لم يتم العثور على عمود اسم النشاط'], err_csv_empty: ['No rows to import', 'لا توجد صفوف للاستيراد'],
    // projects dialog
    projects_hint: ['Projects are saved automatically in this browser. Export XER / JSON to keep a copy or move it to another device.', 'تُحفظ المشاريع تلقائياً في هذا المتصفح. صدّر XER / JSON لحفظ نسخة أو نقلها لجهاز آخر.'], no_projects: ['No saved projects yet.', 'لا توجد مشاريع محفوظة بعد.'],
    project_name: ['Project name', 'اسم المشروع'], project_desc: ['Description', 'الوصف'], plan_start: ['Planned start', 'بداية المشروع'], must_finish: ['Must finish by', 'يجب أن ينتهي قبل'], def_calendar: ['Default calendar', 'التقويم الافتراضي'],
    crit_float: ['Critical if float ≤ (days)', 'حرج إذا الفلوت ≤ (يوم)'], progress_logic: ['Progress logic', 'منطق التقدم'], retained: ['Retained Logic', 'Retained Logic'], override: ['Progress Override', 'Progress Override'],
    settings_hint: ['Data Date is the status date: unstarted work is scheduled on/after it. Changing it and pressing Schedule moves all remaining work.', 'الـ Data Date هو تاريخ التحديث: الأعمال غير المبدوءة تُجدول في أو بعد هذا التاريخ.'],
    workweek: ['Work week', 'أيام العمل'], wk_sunThu: ['Sunday – Thursday', 'الأحد – الخميس'], wk_monFri: ['Monday – Friday', 'الإثنين – الجمعة'], wk_satThu: ['Saturday – Thursday', 'السبت – الخميس'], wk_all7: ['7 days', '7 أيام'],
    calendar: ['Calendar', 'التقويم'], cal_name: ['Calendar name', 'اسم التقويم'], hours_day: ['Hours / day', 'ساعات / يوم'], exceptions: ['Exceptions (holidays / extra working days)', 'استثناءات (إجازات / أيام عمل إضافية)'], holiday: ['Holiday', 'إجازة'], workday: ['Working day', 'يوم عمل'],
    no_exceptions: ['No exceptions', 'لا توجد استثناءات'], new_calendar: ['New calendar', 'تقويم جديد'], set_default: ['Set as default', 'تعيين كافتراضي'], delete_calendar: ['Delete calendar', 'حذف التقويم'],
    d_sun: ['Sun', 'أحد'], d_mon: ['Mon', 'إثنين'], d_tue: ['Tue', 'ثلاثاء'], d_wed: ['Wed', 'أربعاء'], d_thu: ['Thu', 'خميس'], d_fri: ['Fri', 'جمعة'], d_sat: ['Sat', 'سبت'],
    visible_cols: ['Visible columns', 'الأعمدة الظاهرة'], available_cols: ['Available columns', 'الأعمدة المتاحة'],
    res_short: ['Short name', 'اسم مختصر'], res_type: ['Type', 'النوع'], assignments: ['Assignments', 'التعيينات'], no_resources: ['No resources', 'لا توجد موارد'], rt_RT_Labor: ['Labor', 'عمالة'], rt_RT_Equip: ['Equipment', 'معدات'], rt_RT_Mat: ['Material', 'مواد'],
    // update progress
    u_due: ['Starting by data date (+2 weeks)', 'تبدأ قبل الـ Data Date (+أسبوعين)'], u_open: ['All unfinished', 'كل غير المكتملة'], u_auto: ['Auto-progress as planned', 'تقدّم تلقائي حسب الخطة'],
    u_hint: ['Enter actual start, % complete and actual finish. "Auto-progress" fills everything planned before the data date as if it went to plan; then adjust the exceptions. Press Apply to update and reschedule.', 'أدخل البداية الفعلية ونسبة الإنجاز والنهاية الفعلية. زر "تقدّم تلقائي" يملأ كل ما كان مخططاً قبل الـ Data Date كأنه تم حسب الخطة، ثم عدّل الاستثناءات. اضغط تطبيق لتحديث الجدول وإعادة الجدولة.'],
    u_more: ['{0} more rows hidden – narrow the filter', 'يوجد {0} صف إضافي مخفي – ضيّق الفلتر'], u_done: ['{0} activities updated', 'تم تحديث {0} نشاط'], apply_schedule: ['Apply & Schedule', 'تطبيق وجدولة'],
    // baselines
    bl_status: ['{0} of {1} activities have baseline dates.', '{0} من {1} نشاط لها تواريخ بيزلاين.'], bl_save: ['Save current schedule as baseline', 'حفظ الجدول الحالي كبيزلاين'], bl_save_d: ['Copies current start / finish of every activity into the baseline.', 'ينسخ بداية ونهاية كل نشاط الحالية إلى البيزلاين.'],
    bl_import: ['Import baseline from another file…', 'استيراد بيزلاين من ملف آخر…'], bl_import_d: ['Choose an older XER – dates are matched by Activity ID.', 'اختر ملف XER أقدم – تتم المطابقة برقم النشاط.'], bl_clear: ['Clear baseline', 'مسح البيزلاين'], bl_clear_d: ['Removes all baseline dates.', 'يحذف كل تواريخ البيزلاين.'],
    bl_confirm: ['Overwrite the existing baseline with the current schedule?', 'استبدال البيزلاين الحالي بالجدول الحالي؟'], bl_saved: ['Baseline saved', 'تم حفظ البيزلاين'],
    // reports
    scurve: ['Cumulative progress (S-curve)', 'منحنى الإنجاز التراكمي (S-Curve)'], top_slips: ['Largest finish delays vs. baseline', 'أكبر تأخيرات النهاية مقارنة بالبيزلاين'], no_slips: ['No delays against baseline 🎉', 'لا توجد تأخيرات عن البيزلاين 🎉'], finish_var: ['Finish vs baseline', 'النهاية مقابل البيزلاين'],
    // csv
    paste_hint: ['Paste rows copied from Excel (or CSV text). First row = headers: Activity ID, Activity Name, Duration, Predecessors (e.g. A100, A110FS+2), Start, % Complete, WBS, Type. Existing IDs are updated.', 'الصق صفوفاً منسوخة من Excel (أو نص CSV). الصف الأول عناوين الأعمدة: Activity ID, Activity Name, Duration, Predecessors (مثال A100, A110FS+2), Start, % Complete, WBS, Type. الأرقام الموجودة تُحدَّث.'],
    target_wbs: ['Default WBS for new activities', 'WBS الافتراضي للأنشطة الجديدة'], rows_detected: ['{0} rows detected. Headers: {1}', 'تم اكتشاف {0} صف. العناوين: {1}'],
    pick_project: ['Choose a project', 'اختر مشروعاً'], pick_project_hint: ['{0} contains several projects:', 'الملف {0} يحتوي عدة مشاريع:'], baseline_copy: ['baseline copy', 'نسخة بيزلاين'],
    // guide
    sc_edit: ['Edit cell', 'تعديل الخلية'], sc_nav: ['Move between cells', 'التنقل بين الخلايا'], sc_multi: ['Multi-select rows', 'تحديد عدة صفوف'],
    guide_html: [
      '<h3>Quick start</h3><ol><li><b>Open</b> a P6 file: File → Open (XER, PMXML) or just drag it onto the page.</li><li><b>Edit</b> any cell by double-click / F2 / typing. Predecessors accept <code>A100, A110SS+2, A120FF-1</code>.</li><li>Drag a bar to move it, drag its right edge to change duration, drag the little dot at its end onto another bar to link.</li><li><b>Baseline:</b> Project → Baselines → Save current schedule.</li><li><b>Update:</b> Project → Update progress (set Data Date, actual start / % / finish) → Apply &amp; Schedule. Or import the updated XER with <i>Import update – keep my baseline</i>.</li><li><b>Export</b> XER to open it back in Primavera P6.</li></ol><p>Everything saves automatically in your browser. No data leaves your device.</p>',
      '<h3>بداية سريعة</h3><ol><li><b>افتح</b> ملف P6: ملف ← فتح ملف (XER أو PMXML) أو اسحب الملف وأفلته على الصفحة.</li><li><b>عدّل</b> أي خلية بالنقر المزدوج / F2 / الكتابة مباشرة. السوابق تقبل الصيغة <code>A100, A110SS+2, A120FF-1</code>.</li><li>اسحب الشريط لتحريكه، اسحب طرفه الأيمن لتغيير المدة، واسحب النقطة الصغيرة في نهايته إلى شريط آخر لعمل علاقة.</li><li><b>البيزلاين:</b> المشروع ← البيزلاين ← حفظ الجدول الحالي.</li><li><b>التحديث:</b> المشروع ← تحديث التقدّم (حدد Data Date والبداية الفعلية والنسبة والنهاية) ← تطبيق وجدولة. أو استورد ملف XER المحدّث بخيار <i>استيراد تحديث مع الاحتفاظ بالبيزلاين</i>.</li><li><b>التصدير:</b> صدّر XER لفتحه مجدداً في Primavera P6.</li></ol><p>كل شيء يُحفظ تلقائياً في متصفحك. لا تغادر بياناتك جهازك.</p>'
    ],
    about_html: [
      '<b>P6 Web – Schedule Studio</b><br>A free, static web app that reads and edits Primavera P6 schedules (XER / PMXML) entirely in your browser: CPM scheduling with calendars, constraints, FS/SS/FF/SF relationships with lags, baselines, progress updates, Gantt chart and S-curve.<br><br>Scheduling is a CPM re-implementation at day granularity; results can differ slightly from P6 in advanced cases (resource leveling, hour-level calendars, LOE). Always verify critical outputs in P6.',
      '<b>P6 Web – استوديو الجدولة</b><br>تطبيق ويب مجاني وثابت لقراءة وتعديل جداول Primavera P6 (XER / PMXML) بالكامل داخل متصفحك: حساب المسار الحرج مع التقاويم والقيود وعلاقات FS/SS/FF/SF والتأخير (Lag)، البيزلاين، تحديث التقدم، مخطط جانت ومنحنى S.<br><br>الجدولة إعادة تنفيذ لطريقة CPM على مستوى اليوم؛ قد تختلف النتائج قليلاً عن P6 في الحالات المتقدمة (توزيع الموارد، التقاويم بالساعات، LOE). راجع المخرجات الحرجة في P6 دائماً.'
    ]
  };
  let lang = 'ar';
  P6.setLang = (l) => { lang = l === 'en' ? 'en' : 'ar'; };
  P6.t = (k, ...a) => {
    const e = D[k];
    let s = e ? e[lang === 'ar' ? 1 : 0] : (k && k.startsWith('col_') ? k.slice(4) : k);
    if (s == null) s = e ? e[0] : k;
    return a.length ? String(s).replace(/\{(\d+)\}/g, (m, i) => (a[+i] == null ? '' : a[+i])) : s;
  };
  P6.i18n = D;
})(window);

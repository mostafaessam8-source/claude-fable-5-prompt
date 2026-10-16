/* Toolbar / edit-bar labels (Arabic + English) and the language switch for management.html */
(function (G) {
  const Z = G.Z, A = Z.app, I = A.icons, $ = (id) => document.getElementById(id);
  if (!G.ZMODE) return;
  const T = (t) => '<span class="t">' + t + '</span>';
  const set = (id, h) => { const e = $(id); if (e) e.innerHTML = h; };
  A.labels = () => {
    const L = A.L;
    $('brandT').textContent = L('Al-Zulfi Railway Station', 'محطة قطار الزلفي'); $('brandS').textContent = L('Management update', 'عرض مستجدات المشروع');
    $('lblStart').textContent = L('Project start', 'تاريخ بدء المشروع');
    set('mBack', I.prev + L('Back', 'السابق')); set('mNext', L('Next', 'التالي') + I.next); set('mSide', I.menu + L('Agenda', 'الأجندة'));
    set('bReset', I.reset + T(L('Reset', 'إعادة ضبط'))); set('bEdit', I.pencil + T(L('Edit', 'تعديل'))); set('bSide', I.menu + T(L('Agenda', 'الأجندة')));
    set('bBack', I.prev + T(L('Back', 'السابق'))); set('bNext', T(L('Next', 'التالي')) + I.next);
    set('bFull', I.full + T(L('Full screen', 'ملء الشاشة'))); set('bExit', I.exit + T(L('Exit full screen', 'إغلاق ملء الشاشة'))); set('bPrint', I.print + T(L('Print', 'طباعة')));
    set('mFilt', A.isAr() ? 'EN' : 'عربي'); set('bLang', A.isAr() ? 'English' : 'العربية'); $('bLang').title = L('Switch the whole presentation to Arabic', 'عرض كل العرض باللغة الإنجليزية');
    if ($('bGuide')) $('bGuide').textContent = L('Guide', 'الدليل');
    $('bEdit').title = L('Edit any text, delete slides, move milestones', 'تعديل أي نص، حذف الشرائح، تحريك المعالم');
    $('bReset').title = L('Reset dates, edits and deleted slides to the default', 'إعادة التواريخ والتعديلات والشرائح المحذوفة إلى الوضع الافتراضي');
    $('edTxt').innerHTML = A.isAr()
      ? '<b>وضع التعديل</b> · اضغط على أي نص (بحدود متقطعة) واكتب · <kbd>Ctrl</kbd>+<kbd>B</kbd> خط عريض · الوسوم الملونة <span class="tk">{…}</span> قيم حية تتحدث تلقائياً · اضغط على أي اسم (نشاط، معلم، عنوان، تسمية) لتغييره · اسحب المعالم في المخطط الزمني · يتم الحفظ تلقائياً'
      : '<b>Edit mode</b> · click any dashed text and type · <kbd>Ctrl</kbd>+<kbd>B</kbd> bold · coloured <span class="tk">{tags}</span> are live values · click any name (activity, milestone, heading, label) to rename it · drag milestones on the timeline · changes are saved automatically';
    $('edR1').textContent = L('Restore this slide', 'استرجاع هذه الشريحة'); $('edR2').textContent = L('Restore all text', 'استرجاع كل النصوص');
    $('edDel').textContent = L('Delete this slide', 'حذف هذه الشريحة'); $('edRestore').textContent = L('Restore deleted slides', 'استرجاع الشرائح المحذوفة'); $('edDone').textContent = L('Done', 'تم');
    $('linkSel').options[0].text = L('Auto-link', 'ربط تلقائي');
    if (!document.documentElement.requestFullscreen && !document.documentElement.webkitRequestFullscreen) $('bFull').style.display = 'none';
  };
  A.actions.resetDefault = () => {
    if (!confirm(A.L('Reset the presentation to its default?\n\nThis restores the start date, all edits, deleted slides and views.', 'إعادة العرض إلى الوضع الافتراضي؟\n\nسيتم استرجاع تاريخ البدء وكل التعديلات والشرائح المحذوفة.'))) return;
    A.s.st = Z.newState('2026-10-25'); A.s.ui = {}; A.s.drawer = null; A.hidden.clear(); A.saveHidden();
    try { localStorage.removeItem('zulfi-mgmt-v1'); } catch (e) { /* ignore */ }
    A.updateEdbar(); A.update();
  };
  A.actions.resetAll = A.actions.resetDefault;
  $('bReset').onclick = A.actions.resetDefault;
  $('bLang').onclick = () => A.setLang(A.isAr() ? 'en' : 'ar');
  $('mFilt').onclick = () => A.setLang(A.isAr() ? 'en' : 'ar'); $('mFilt').style.display = '';
  A.boot();
  A.labels(); A.updateEdbar();
})(window);

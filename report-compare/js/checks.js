/* Report Compare — the report checker.
 * Finds things that do not make sense in the weekly report: wrong roll-over of "last week" blocks, cumulative values that go down,
 * totals that do not add up, dates in the wrong order, stale labels, text copied from last week, formula errors, …
 * Rules read the values AFTER the reviewer's decisions, so an issue disappears the moment it is fixed.
 * Formula results are the ones cached in the file (Excel refreshes them when the downloaded report is opened); rules therefore
 * prefer the typed inputs and recompute the simple arithmetic themselves.
 * Pure logic, no DOM: runs in the browser (script tag) and in Node (tests).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./xl.js'), require('./diff.js'));
  else root.Checks = factory(root.Xl, root.Diff);
})(typeof self !== 'undefined' ? self : this, function (Xl, Diff) {
  'use strict';

  var PS = '1. Progress Status', SF = '2. Safety Status', SC = '3. Progress S-Curve', DL = '4. Deliverable Status', NC = '5. NCR Status',
    IP = '6. IPC Status', MP = '7. Manpower Status', CF = '9. Cashflow Status', DI = '10-13. Data Input';
  var REPORT_SHEETS = [PS, SF, SC, DL, NC, IP, MP, CF, DI];

  function nf(n) { if (n == null) return '–'; var a = Math.abs(n); return a >= 1000 ? Math.round(n).toLocaleString('en-US') : String(parseFloat(n.toFixed(4))); }
  function pc(n) { return (n * 100).toFixed(2).replace(/\.?0+$/, '') + '%'; }
  function dt(n) { return n == null ? '–' : Xl.formatNumber(n, 'dd-mmm-yyyy'); }
  function isoWeek(serial) {
    var d = new Date((serial - Xl.EPOCH) * 864e5), day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    var y0 = Date.UTC(d.getUTCFullYear(), 0, 1);
    return { week: Math.ceil(((d - y0) / 864e5 + 1) / 7), year: d.getUTCFullYear() };
  }

  /* run(cmp, cur, prev, view, opts) → [issue] */
  function run(cmp, curWb, prevWb, view, opts) {
    opts = opts || {};
    var issues = [], seen = {};
    function add(code, sev, sheet, a, en, ar, fix) {
      var id = code + '|' + sheet + '!' + a;
      if (seen[id]) return; seen[id] = 1;
      issues.push({ id: id, code: code, sev: sev, sheet: sheet, a: a, en: en, ar: ar, fix: fix || null });
    }
    var N = view.num, V = view.val, S = view.str, PN = view.prevNum;
    function isConst(sheet, a) { var c = view.eff(sheet, a); return !!c && c.f == null && c.k !== ''; }
    function col(c) { return Xl.numToCol(c); }

    /* ----- 1. Progress Status ----- */
    if (view.hasSheet(PS)) {
      var rd = N(PS, 'C7'), prd = PN(PS, 'C7'), st = N(PS, 'C4'), fin = N(PS, 'C5');
      if (rd == null) add('RD0', 'error', PS, 'C7', 'Report date is empty.', 'تاريخ التقرير فاضي.');
      else {
        if (st != null && rd < st) add('RD1', 'error', PS, 'C7', 'Report date ' + dt(rd) + ' is before the project start ' + dt(st) + '.', 'تاريخ التقرير ' + dt(rd) + ' قبل بداية المشروع ' + dt(st) + '.');
        if (prd != null) {
          if (rd <= prd) add('RD2', 'error', PS, 'C7', 'Report date ' + dt(rd) + ' is not after last week’s report date ' + dt(prd) + ' — did you forget to update it?', 'تاريخ التقرير ' + dt(rd) + ' مش بعد تاريخ تقرير الأسبوع الماضي ' + dt(prd) + ' — يمكن نسيت تحدّثه؟', { text: Xl.formatNumber(prd + 7, 'dd/mm/yyyy'), label: 'Set to ' + dt(prd + 7) + ' (+7 days)' });
          else if (rd - prd !== 7) add('RD3', 'warn', PS, 'C7', 'Report date is ' + (rd - prd) + ' days after last week’s (' + dt(prd) + '); weekly reports are normally 7 days apart.', 'الفرق بين تاريخ التقرير وتاريخ الأسبوع الماضي ' + (rd - prd) + ' يوم — المعتاد 7 أيام.');
        }
      }
      // project week / calendar week labels
      var pw = S(PS, 'K1'), cw = S(PS, 'M1'), ppw = view.prevVal(PS, 'K1'), pcw = view.prevVal(PS, 'M1');
      var pwN = (/(\d+)\s*$/.exec(pw) || [])[1], ppwN = ppw && (/(\d+)\s*$/.exec(String(ppw)) || [])[1];
      if (!pw) add('PW0', 'error', PS, 'K1', 'Project week is empty.', 'رقم أسبوع المشروع فاضي.');
      else if (pwN && ppwN) {
        if (+pwN === +ppwN) add('PW1', 'error', PS, 'K1', 'Project week ' + pw + ' is the same as last week’s — it should move forward by one.', 'أسبوع المشروع ' + pw + ' زي الأسبوع الماضي — لازم يزيد واحد.', { text: 'PW-' + (+ppwN + 1), label: 'Set to PW-' + (+ppwN + 1) });
        else if (+pwN !== +ppwN + 1) add('PW2', 'warn', PS, 'K1', 'Project week jumped from PW-' + ppwN + ' to ' + pw + '.', 'أسبوع المشروع اتنقل من PW-' + ppwN + ' إلى ' + pw + '.', { text: 'PW-' + (+ppwN + 1), label: 'Set to PW-' + (+ppwN + 1) });
      }
      var cwm = /CW-(\d+)-(\d+)/i.exec(cw);
      if (!cw) add('CW0', 'error', PS, 'M1', 'Calendar week is empty.', 'رقم الأسبوع الميلادي فاضي.');
      else if (!cwm) add('CW1', 'warn', PS, 'M1', 'Calendar week "' + cw + '" is not in the form CW-ww-yy.', 'الأسبوع الميلادي "' + cw + '" مش بصيغة CW-ww-yy.');
      else if (rd != null) {
        var iw = isoWeek(rd), wk = +cwm[1], yr = 2000 + +cwm[2], dd = (iw.year - yr) * 52 + (iw.week - wk);
        if (Math.abs(dd) > 1) add('CW2', 'warn', PS, 'M1', 'Calendar week ' + cw + ' does not match the report date ' + dt(rd) + ' (week ' + iw.week + ' of ' + iw.year + ') — looks left over from an older report.', 'الأسبوع الميلادي ' + cw + ' مش مطابق لتاريخ التقرير ' + dt(rd) + ' (أسبوع ' + iw.week + ' سنة ' + iw.year + ') — باين إنه متبقي من تقرير قديم.', { text: 'CW-' + (iw.week < 10 ? '0' : '') + iw.week + '-' + String(iw.year).slice(2), label: 'Set to CW-' + iw.week + '-' + String(iw.year).slice(2) });
        if (pcw && String(pcw) === cw && prd != null && rd !== prd) add('CW3', 'warn', PS, 'M1', 'Calendar week label is unchanged from last week.', 'الأسبوع الميلادي زي الأسبوع الماضي من غير تغيير.');
      }
      // contract value
      var cv = N(PS, 'F11'), eot = N(PS, 'F12'), rcv = N(PS, 'F13');
      if (cv != null && rcv != null && eot != null && Math.abs(cv + eot - rcv) > 1) add('CV1', 'error', PS, 'F13', 'Revised contract value ' + nf(rcv) + ' ≠ original ' + nf(cv) + ' + approved change ' + nf(eot) + ' (= ' + nf(cv + eot) + ').', 'قيمة العقد المعدلة ' + nf(rcv) + ' مش = الأصلية ' + nf(cv) + ' + التغيير المعتمد ' + nf(eot) + ' (= ' + nf(cv + eot) + ').', { text: String(cv + eot), label: 'Set to ' + nf(cv + eot) });
      // progress
      var pe = N(PS, 'E19'), pd = N(PS, 'D19'), pl = N(PS, 'A19'), pb = N(PS, 'B19');
      if (pe != null && (pe < 0 || pe > 1.0001)) add('PG1', 'error', PS, 'E19', 'Cumulative actual progress ' + pc(pe) + ' is outside 0–100%.', 'نسبة الإنجاز التراكمية الفعلية ' + pc(pe) + ' خارج 0–100%.');
      if (pd != null && (pd < 0 || pd > 1.0001)) add('PG2', 'error', PS, 'D19', 'Cumulative planned progress ' + pc(pd) + ' is outside 0–100%.', 'نسبة الإنجاز التراكمية المخططة ' + pc(pd) + ' خارج 0–100%.');
      var pEprev = PN(PS, 'E19'), pDprev = PN(PS, 'D19');
      if (pe != null && pEprev != null && pe < pEprev - 1e-9) add('PG3', 'error', PS, 'E19', 'Cumulative actual progress went DOWN: ' + pc(pEprev) + ' → ' + pc(pe) + '.', 'الإنجاز التراكمي الفعلي نزل: ' + pc(pEprev) + ' ← ' + pc(pe) + '.');
      if (pd != null && pDprev != null && pd < pDprev - 1e-9) add('PG4', 'error', PS, 'D19', 'Cumulative planned progress went DOWN: ' + pc(pDprev) + ' → ' + pc(pd) + '.', 'الإنجاز التراكمي المخطط نزل: ' + pc(pDprev) + ' ← ' + pc(pd) + '.');
      if (pl != null && pDprev != null && Math.abs(pl - pDprev) > 1e-6) add('PG5', 'error', PS, 'A19', '"Last week" planned ' + pc(pl) + ' does not equal last week’s report (' + pc(pDprev) + ').', 'المخطط "الأسبوع الماضي" ' + pc(pl) + ' مش مساوي لتقرير الأسبوع الماضي (' + pc(pDprev) + ').');
      if (pb != null && pEprev != null && Math.abs(pb - pEprev) > 1e-6) add('PG6', 'error', PS, 'B19', '"Last week" actual ' + pc(pb) + ' does not equal last week’s report (' + pc(pEprev) + ').', 'الفعلي "الأسبوع الماضي" ' + pc(pb) + ' مش مساوي لتقرير الأسبوع الماضي (' + pc(pEprev) + ').');
      // forecast vs report date
      var fc = N(PS, 'F5');
      var projDone = pe != null && pe >= 0.9995;
      if (rd != null && fc != null && fc < rd && !projDone) add('FC1', 'error', PS, 'F5', 'Forecast completion ' + dt(fc) + ' is already in the past (report date ' + dt(rd) + ') but progress is only ' + pc(pe) + '. Update the forecast.', 'تاريخ الانتهاء المتوقع ' + dt(fc) + ' فات (تاريخ التقرير ' + dt(rd) + ') والإنجاز ' + pc(pe) + ' بس. حدّث التوقع.');
      if (rd != null && fin != null && rd > fin && !projDone && (fc == null || fc <= fin)) add('FC2', 'warn', PS, 'C5', 'Report date is past the planned finish ' + dt(fin) + ' and the project is not complete, yet no later forecast/EOT is given.', 'تاريخ التقرير بعد تاريخ الانتهاء المخطط ' + dt(fin) + ' والمشروع لسه مخلصش، ومفيش توقع/تمديد أحدث.');
      // milestones
      for (var r = 29; r <= 40; r++) {
        var nm = S(PS, 'B' + r); if (!nm) continue;
        var cs = N(PS, 'C' + r), cf = N(PS, 'D' + r), as = N(PS, 'E' + r), af = N(PS, 'F' + r), gp = N(PS, 'G' + r), hp = N(PS, 'H' + r);
        if (cs != null && cf != null && cf < cs) add('MS1', 'error', PS, 'D' + r, '"' + nm + '": planned finish ' + dt(cf) + ' is before planned start ' + dt(cs) + '.', '"' + nm + '": الانتهاء المخطط ' + dt(cf) + ' قبل البداية المخططة ' + dt(cs) + '.');
        if (as != null && af != null && af < as) add('MS2', 'error', PS, 'F' + r, '"' + nm + '": actual/forecast finish ' + dt(af) + ' is before start ' + dt(as) + '.', '"' + nm + '": الانتهاء الفعلي/المتوقع ' + dt(af) + ' قبل البداية ' + dt(as) + '.');
        [['G', gp], ['H', hp]].forEach(function (x) { if (x[1] != null && (x[1] < 0 || x[1] > 1.0001)) add('MS3', 'error', PS, x[0] + r, '"' + nm + '": progress ' + pc(x[1]) + ' is outside 0–100%.', '"' + nm + '": النسبة ' + pc(x[1]) + ' خارج 0–100%.'); });
        if (hp != null && hp >= 0.9995 && af != null && rd != null && af > rd) add('MS4', 'warn', PS, 'F' + r, '"' + nm + '" is 100% complete but its finish date ' + dt(af) + ' is after the report date.', '"' + nm + '" مكتمل 100% لكن تاريخ انتهائه ' + dt(af) + ' بعد تاريخ التقرير.');
        if (hp != null && hp < 0.9995 && af != null && rd != null && af < rd) add('MS5', 'warn', PS, 'F' + r, '"' + nm + '" is only ' + pc(hp) + ' complete but its forecast finish ' + dt(af) + ' has already passed.', '"' + nm + '" مكتمل ' + pc(hp) + ' بس وتاريخ الانتهاء المتوقع ' + dt(af) + ' فات.');
      }
    }

    /* ----- 2. Safety ----- */
    if (view.hasSheet(SF)) {
      [['A', 'B', 'C', 'I', 5, 18], ['D', 'E', 'F', 'K', 5, 17]].forEach(function (g) {
        for (var r = g[4]; r <= g[5]; r++) {
          var lab = S(SF, g[0] + r) || ('row ' + r), wk = N(SF, g[1] + r), cum = N(SF, g[2] + r), last = N(SF, g[3] + r), pcum = PN(SF, g[2] + r);
          if (cum != null && last != null && cum < last) add('SF1', 'error', SF, g[2] + r, '"' + lab + '": cumulative ' + nf(cum) + ' is lower than last week’s cumulative ' + nf(last) + '.', '"' + lab + '": التراكمي ' + nf(cum) + ' أقل من تراكمي الأسبوع الماضي ' + nf(last) + '.');
          if (pcum != null && (last == null ? pcum !== 0 : Math.abs(last - pcum) > 1e-9)) add('SF2', 'error', SF, g[3] + r, '"' + lab + '": "last week" value ' + nf(last) + ' ≠ last week’s report cumulative ' + nf(pcum) + '.', '"' + lab + '": قيمة "الأسبوع الماضي" ' + nf(last) + ' مش = تراكمي تقرير الأسبوع الماضي ' + nf(pcum) + '.', { text: String(pcum), label: 'Set to ' + nf(pcum) });
          if (wk != null && wk < 0) add('SF3', 'error', SF, g[1] + r, '"' + lab + '": this-week figure is negative (' + nf(wk) + ').', '"' + lab + '": رقم الأسبوع سالب (' + nf(wk) + ').');
          if (isConst(SF, g[1] + r) && wk != null && cum != null && last != null && Math.abs(wk - (cum - last)) > 0.5) add('SF4', 'warn', SF, g[1] + r, '"' + lab + '": this week ' + nf(wk) + ' ≠ cumulative ' + nf(cum) + ' − last week ' + nf(last) + ' (= ' + nf(cum - last) + ').', '"' + lab + '": رقم الأسبوع ' + nf(wk) + ' مش = التراكمي ' + nf(cum) + ' − الأسبوع الماضي ' + nf(last) + ' (= ' + nf(cum - last) + ').', { text: String(cum - last), label: 'Set to ' + nf(cum - last) });
        }
      });
      var mh = N(SF, 'E16'), mpw = N(SF, 'F15');
      if (mh != null && mpw != null && mpw > 0 && mh > mpw * 84) add('SF5', 'warn', SF, 'E16', 'Man-hours this week (' + nf(mh) + ') are more than ' + nf(mpw) + ' people could work in 7 days × 12 h.', 'ساعات العمل هذا الأسبوع (' + nf(mh) + ') أكتر مما يقدر ' + nf(mpw) + ' فرد يشتغلوه في 7 أيام × 12 ساعة.');
    }

    /* ----- 4. Deliverables ----- */
    if (view.hasSheet(DL)) {
      var lastRows = {}, r2;
      for (r2 = 14; r2 <= 19; r2++) { var ln = S(DL, 'A' + r2); if (ln) lastRows[ln.toLowerCase()] = r2; }
      for (r2 = 5; r2 <= 10; r2++) {
        var nm2 = S(DL, 'A' + r2); if (!nm2) continue;
        var tot = N(DL, 'D' + r2), ap = N(DL, 'E' + r2) || 0, rj = N(DL, 'F' + r2) || 0, ur = N(DL, 'G' + r2) || 0, wkly = N(DL, 'C' + r2);
        if (tot != null && ap + rj + ur !== tot) add('DL1', 'error', DL, 'D' + r2, '"' + nm2 + '": Approved ' + nf(ap) + ' + Rejected ' + nf(rj) + ' + U/R ' + nf(ur) + ' = ' + nf(ap + rj + ur) + ', but total submitted is ' + nf(tot) + '.', '"' + nm2 + '": المعتمد ' + nf(ap) + ' + المرفوض ' + nf(rj) + ' + تحت المراجعة ' + nf(ur) + ' = ' + nf(ap + rj + ur) + ' لكن إجمالي المقدم ' + nf(tot) + '.');
        var lr = lastRows[nm2.toLowerCase()];
        if (lr) {
          var ltot = N(DL, 'D' + lr);
          if (tot != null && ltot != null && tot < ltot) add('DL2', 'error', DL, 'D' + r2, '"' + nm2 + '": total submitted ' + nf(tot) + ' is lower than last week’s ' + nf(ltot) + '.', '"' + nm2 + '": إجمالي المقدم ' + nf(tot) + ' أقل من الأسبوع الماضي ' + nf(ltot) + '.');
          if (isConst(DL, 'C' + r2) && wkly != null && tot != null && ltot != null && wkly !== tot - ltot) add('DL3', 'warn', DL, 'C' + r2, '"' + nm2 + '": weekly submissions ' + nf(wkly) + ' ≠ total ' + nf(tot) + ' − last week ' + nf(ltot) + '.', '"' + nm2 + '": المقدم الأسبوعي ' + nf(wkly) + ' مش = الإجمالي ' + nf(tot) + ' − الأسبوع الماضي ' + nf(ltot) + '.', { text: String(tot - ltot), label: 'Set to ' + nf(tot - ltot) });
        }
        // roll-over: last-week block equals last report's current block (matched by name)
        var pr = null;
        for (var q = 5; q <= 10; q++) { var pn = view.prevVal(DL, 'A' + q); if (pn && String(pn).toLowerCase() === nm2.toLowerCase()) pr = q; }
        if (lr && pr) ['B', 'D', 'E', 'F', 'G'].forEach(function (cl) {
          var a1 = N(DL, cl + lr), a0 = PN(DL, cl + pr);
          if (a0 != null && (a1 == null ? a0 !== 0 : a1 !== a0)) add('DL4', 'error', DL, cl + lr, '"' + nm2 + '" (last-week block): ' + nf(a1) + ' ≠ last week’s report value ' + nf(a0) + '.', '"' + nm2 + '" (جدول الأسبوع الماضي): ' + nf(a1) + ' مش = قيمة تقرير الأسبوع الماضي ' + nf(a0) + '.', { text: String(a0), label: 'Set to ' + nf(a0) });
        });
      }
    }

    /* ----- 5. NCR ----- */
    if (view.hasSheet(NC)) {
      var iss = N(NC, 'B5'), clo = N(NC, 'B6'), cll = N(NC, 'B8');
      if (iss != null && clo != null && clo > iss) add('NC1', 'error', NC, 'B6', 'Closed NCRs (' + nf(clo) + ') are more than issued (' + nf(iss) + ').', 'عدد الـ NCR المقفولة (' + nf(clo) + ') أكتر من المصدرة (' + nf(iss) + ').');
      if (clo != null && cll != null && cll > clo) add('NC2', 'error', NC, 'B8', 'Closed-late NCRs (' + nf(cll) + ') are more than closed (' + nf(clo) + ').', 'الـ NCR المقفولة متأخر (' + nf(cll) + ') أكتر من المقفولة (' + nf(clo) + ').');
      [['B5', 'issued', 'المصدرة'], ['B6', 'closed', 'المقفولة']].forEach(function (x) {
        var c0 = N(NC, x[0]), p0 = PN(NC, x[0]);
        if (c0 != null && p0 != null && c0 < p0) add('NC3', 'error', NC, x[0], 'Cumulative ' + x[1] + ' NCRs went down: ' + nf(p0) + ' → ' + nf(c0) + '.', 'إجمالي الـ NCR ' + x[2] + ' نزل: ' + nf(p0) + ' ← ' + nf(c0) + '.');
      });
    }

    /* ----- 6. IPC ----- */
    if (view.hasSheet(IP)) {
      var tcv = N(IP, 'C8'), cvv = N(IP, 'C9'), vo = N(IP, 'C12'), sub = N(IP, 'C10'), paid = N(IP, 'C11'), nsub = N(IP, 'B10'), npaid = N(IP, 'B11');
      if (tcv != null && cvv != null && vo != null && Math.abs(cvv + vo - tcv) > 1) add('IP1', 'error', IP, 'C8', 'Total contract value ' + nf(tcv) + ' ≠ contract value ' + nf(cvv) + ' + variation orders ' + nf(vo) + ' (= ' + nf(cvv + vo) + ').', 'إجمالي قيمة العقد ' + nf(tcv) + ' مش = قيمة العقد ' + nf(cvv) + ' + أوامر التغيير ' + nf(vo) + ' (= ' + nf(cvv + vo) + ').');
      if (sub != null && paid != null && paid > sub) add('IP2', 'error', IP, 'C11', 'Paid amount ' + nf(paid) + ' is more than submitted ' + nf(sub) + '.', 'المبلغ المدفوع ' + nf(paid) + ' أكبر من المقدم ' + nf(sub) + '.');
      if (tcv != null && sub != null && sub > tcv) add('IP3', 'error', IP, 'C10', 'Submitted amount ' + nf(sub) + ' exceeds the total contract value ' + nf(tcv) + '.', 'المبلغ المقدم ' + nf(sub) + ' أكبر من إجمالي قيمة العقد ' + nf(tcv) + '.');
      if (nsub != null && npaid != null && npaid > nsub) add('IP4', 'error', IP, 'B11', 'Paid IPC count ' + nf(npaid) + ' is more than submitted ' + nf(nsub) + '.', 'عدد المستخلصات المدفوعة ' + nf(npaid) + ' أكبر من المقدمة ' + nf(nsub) + '.');
      [['C10', 'submitted amount', 'المبلغ المقدم'], ['C11', 'paid amount', 'المبلغ المدفوع'], ['B10', 'submitted IPC count', 'عدد المستخلصات المقدمة'], ['B11', 'paid IPC count', 'عدد المستخلصات المدفوعة']].forEach(function (x) {
        var c0 = N(IP, x[0]), p0 = PN(IP, x[0]);
        if (c0 != null && p0 != null && c0 < p0) add('IP5', 'error', IP, x[0], 'Cumulative ' + x[1] + ' went down: ' + nf(p0) + ' → ' + nf(c0) + '.', x[2] + ' التراكمي نزل: ' + nf(p0) + ' ← ' + nf(c0) + '.');
      });
    }

    /* ----- 9. Cashflow ----- */
    if (view.hasSheet(CF)) {
      var cols = [];
      for (var c = 2; c <= 14; c++) if (V(CF, col(c) + '27') != null) cols.push(c);
      cols.forEach(function (c, i) {
        var L = col(c), pcL = i ? col(cols[i - 1]) : null;
        [[28, 30, 'plan', 'المخطط'], [29, 31, 'actual', 'الفعلي']].forEach(function (g) {
          var mon = N(CF, L + g[0]), cum = N(CF, L + g[1]);
          if (pcL) {
            var pcum = N(CF, pcL + g[1]);
            if (cum != null && pcum != null && cum < pcum) add('CF1', 'error', CF, L + g[1], 'Cumulative ' + g[2] + ' cashflow goes down: ' + nf(pcum) + ' → ' + nf(cum) + '.', 'التدفق النقدي التراكمي ' + g[3] + ' بينزل: ' + nf(pcum) + ' ← ' + nf(cum) + '.');
            if (mon != null && cum != null && pcum != null && Math.abs(cum - pcum - mon) > 1) add('CF2', 'warn', CF, L + g[1], 'Cumulative ' + g[2] + ' ' + nf(cum) + ' ≠ previous cumulative ' + nf(pcum) + ' + month ' + nf(mon) + ' (= ' + nf(pcum + mon) + ').', 'التراكمي ' + g[3] + ' ' + nf(cum) + ' مش = التراكمي السابق ' + nf(pcum) + ' + الشهر ' + nf(mon) + ' (= ' + nf(pcum + mon) + ').', isConst(CF, L + g[1]) ? { text: String(Math.round((pcum + mon) * 100) / 100), label: 'Set to ' + nf(pcum + mon) } : null);
          }
        });
        var hd = view.eff(CF, L + '27');
        if (hd && hd.k === 's' && cols.some(function (cc) { var h2 = view.eff(CF, col(cc) + '27'); return h2 && h2.k === 'n'; })) add('CF3', 'info', CF, L + '27', 'Month header "' + hd.v + '" is text while other months are dates.', 'عنوان الشهر "' + hd.v + '" نص بينما باقي الشهور تواريخ.');
      });
      var lastC = cols.length ? col(cols[cols.length - 1]) : null, tcv2 = N(IP, 'C8');
      if (lastC && tcv2 != null) { var lp = N(CF, lastC + '30'); if (lp != null && Math.abs(lp - tcv2) > 1) add('CF4', 'warn', CF, lastC + '30', 'Final cumulative plan ' + nf(lp) + ' ≠ total contract value ' + nf(tcv2) + '.', 'آخر تراكمي مخطط ' + nf(lp) + ' مش = إجمالي قيمة العقد ' + nf(tcv2) + '.'); }
    }

    /* ----- 3. S-Curve and 7. Manpower: series by week ----- */
    function series(sheet, dateRow, rows, label, labelAr, cumulative) {
      if (!view.hasSheet(sheet)) return;
      var colsS = [];
      for (var c = 2; c <= 60; c++) if (view.num(sheet, col(c) + dateRow) != null) colsS.push(c);
      colsS.forEach(function (c, i) {
        var d = view.num(sheet, col(c) + dateRow);
        if (i) { var gap = d - view.num(sheet, col(colsS[i - 1]) + dateRow); if (gap !== 7) add('SR1', 'warn', sheet, col(c) + dateRow, label + ': week-ending ' + dt(d) + ' is ' + gap + ' days after the previous column (expected 7).', label + ': نهاية الأسبوع ' + dt(d) + ' بعد العمود السابق بـ ' + gap + ' يوم (المتوقع 7).'); }
        rows.forEach(function (rw) {
          var v = view.num(sheet, col(c) + rw.row);
          if (v == null) return;
          if (rw.max != null && v > rw.max + 1e-6) add('SR2', 'error', sheet, col(c) + rw.row, label + ' "' + rw.name + '" ' + dt(d) + ': ' + (rw.pct ? pc(v) : nf(v)) + ' is above the maximum ' + (rw.pct ? pc(rw.max) : nf(rw.max)) + '.', label + ' "' + rw.name + '" ' + dt(d) + ': ' + (rw.pct ? pc(v) : nf(v)) + ' أعلى من الحد الأقصى.');
          if (v < 0) add('SR3', 'error', sheet, col(c) + rw.row, label + ' "' + rw.name + '" ' + dt(d) + ' is negative (' + nf(v) + ').', label + ' "' + rw.name + '" ' + dt(d) + ' سالب (' + nf(v) + ').');
          if (rw.cum && i) { var pv = view.num(sheet, col(colsS[i - 1]) + rw.row); if (pv != null && v < pv - 1e-9) add('SR4', 'error', sheet, col(c) + rw.row, label + ' cumulative "' + rw.name + '" goes down at ' + dt(d) + ': ' + (rw.pct ? pc(pv) : nf(pv)) + ' → ' + (rw.pct ? pc(v) : nf(v)) + '.', label + ' التراكمي "' + rw.name + '" بينزل عند ' + dt(d) + ': ' + (rw.pct ? pc(pv) : nf(pv)) + ' ← ' + (rw.pct ? pc(v) : nf(v)) + '.'); }
          // history must not be rewritten: same week-ending in last week's report
          if (view.hasPrevSheet(sheet) && !rw.noHistory) {
            var pcs = prevWb.byName[sheet], hit = null;
            for (var pc2 = 2; pc2 <= 60; pc2++) { var pdc = pcs.cells.get(col(pc2) + dateRow); if (pdc && pdc.k === 'n' && pdc.v === d) { hit = pc2; break; } }
            if (hit) { var pv2 = PN(sheet, col(hit) + rw.row); if (pv2 != null && Math.abs(pv2 - v) > 1e-9 * Math.max(1, Math.abs(v)) && d < (view.num(PS, 'C7') || 1e9) - 6) add('SR5', 'warn', sheet, col(c) + rw.row, label + ' "' + rw.name + '" for week ending ' + dt(d) + ' was ' + (rw.pct ? pc(pv2) : nf(pv2)) + ' in last week’s report and is now ' + (rw.pct ? pc(v) : nf(v)) + ' (history changed).', label + ' "' + rw.name + '" لأسبوع ' + dt(d) + ' كان ' + (rw.pct ? pc(pv2) : nf(pv2)) + ' في تقرير الأسبوع الماضي وبقى ' + (rw.pct ? pc(v) : nf(v)) + ' (التاريخ اتغيّر).', isConst(sheet, col(c) + rw.row) ? { text: String(pv2), label: 'Restore ' + (rw.pct ? pc(pv2) : nf(pv2)) } : null); }
          }
        });
      });
      return colsS;
    }
    series(SC, 29, [{ row: 32, name: 'Cum. planned', cum: true, max: 1, pct: true }, { row: 33, name: 'Cum. actual', cum: true, max: 1, pct: true }, { row: 30, name: 'Planned weekly', pct: true, noHistory: true }, { row: 31, name: 'Actual weekly', pct: true, noHistory: true }], 'S-Curve', 'منحنى S', true);
    var mpCols = series(MP, 26, [{ row: 27, name: 'Planned' }, { row: 28, name: 'Actual' }], 'Manpower', 'العمالة');
    if (mpCols && mpCols.length) {
      var rdn = N(PS, 'C7'), lastAct = null;
      mpCols.forEach(function (c) { if (N(MP, col(c) + '28') != null) lastAct = c; });
      if (lastAct != null && rdn != null) { var wd = N(MP, col(lastAct) + '26'); if (rdn - wd > 6 || wd - rdn > 6) add('MP1', 'warn', MP, col(lastAct) + '26', 'Latest manpower week-ending ' + dt(wd) + ' is not the current report week (report date ' + dt(rdn) + ').', 'آخر أسبوع عمالة ' + dt(wd) + ' مش هو أسبوع التقرير الحالي (تاريخ التقرير ' + dt(rdn) + ').'); }
      mpCols.forEach(function (c) {
        var a = N(MP, col(c) + '28'), p = N(MP, col(c) + '27');
        if (a != null && p != null && p > 0 && (a > 3 * p || a < p / 3)) add('MP2', 'info', MP, col(c) + '28', 'Actual manpower ' + nf(a) + ' is far from planned ' + nf(p) + ' (week ending ' + dt(N(MP, col(c) + '26')) + ').', 'العمالة الفعلية ' + nf(a) + ' بعيدة جدًا عن المخطط ' + nf(p) + ' (أسبوع ' + dt(N(MP, col(c) + '26')) + ').');
      });
    }

    /* ----- 10-13. Data input ----- */
    if (view.hasSheet(DI)) {
      var rdi = N(PS, 'C7');
      for (var r3 = 7; r3 <= 21; r3++) {
        var issue = S(DI, 'E' + r3), mit = S(DI, 'F' + r3), raised = N(DI, 'G' + r3), tgt = N(DI, 'I' + r3), stt = S(DI, 'J' + r3);
        if (!issue) continue;
        if (!mit) add('DI1', 'warn', DI, 'F' + r3, 'Area of concern #' + r3 + ' ("' + issue.slice(0, 40) + '…") has no mitigation action.', 'نقطة القلق رقم ' + (r3 - 6) + ' ("' + issue.slice(0, 40) + '…") مفيهاش إجراء تخفيف.');
        if (!stt) add('DI2', 'warn', DI, 'J' + r3, 'Area of concern in row ' + r3 + ' has no status.', 'نقطة القلق في الصف ' + r3 + ' من غير حالة.');
        if (raised != null && tgt != null && tgt < raised) add('DI3', 'error', DI, 'I' + r3, 'Target date ' + dt(tgt) + ' is before the date raised ' + dt(raised) + ' (row ' + r3 + ').', 'تاريخ الاستهداف ' + dt(tgt) + ' قبل تاريخ الإثارة ' + dt(raised) + ' (صف ' + r3 + ').');
        if (tgt != null && rdi != null && tgt < rdi && stt && !/closed|done|complete/i.test(stt)) add('DI4', 'warn', DI, 'I' + r3, 'Row ' + r3 + ' is "' + stt + '" but its target date ' + dt(tgt) + ' has passed — overdue, or update the status/date.', 'صف ' + r3 + ' حالته "' + stt + '" وتاريخ الاستهداف ' + dt(tgt) + ' فات — متأخر، أو حدّث الحالة/التاريخ.');
        if (raised != null && rdi != null && raised > rdi) add('DI5', 'error', DI, 'G' + r3, 'Date raised ' + dt(raised) + ' is after the report date ' + dt(rdi) + ' (row ' + r3 + ').', 'تاريخ الإثارة ' + dt(raised) + ' بعد تاريخ التقرير ' + dt(rdi) + ' (صف ' + r3 + ').');
      }
      // text that was not refreshed since last week
      [[7, 21, 'Weekly achievement', 'إنجاز الأسبوع'], [26, 45, 'Look-ahead activity', 'نشاط الأسبوع القادم']].forEach(function (g) {
        for (var r4 = g[0]; r4 <= g[1]; r4++) {
          var t = S(DI, 'B' + r4), p = view.prevVal(DI, 'B' + r4);
          if (t && p != null && String(p).trim() === t.trim() && t.length > 25) add('DI6', 'warn', DI, 'B' + r4, g[2] + ' #' + (r4 - g[0] + 1) + ' is identical to last week’s text — not updated?', g[3] + ' رقم ' + (r4 - g[0] + 1) + ' نفس نص الأسبوع الماضي بالظبط — اتحدّث؟');
        }
      });
    }

    /* ----- generic rules over the whole workbook ----- */
    curWb.sheets.forEach(function (sh) {
      sh.cells.forEach(function (cell, a) {
        var e = view.eff(sh.name, a);
        if (!e) return;
        if (e.k === 'e' && e.v !== '#N/A') add('GE1', 'error', sh.name, a, 'Formula error ' + e.v + '.', 'خطأ في المعادلة ' + e.v + '.');
        else if (e.f != null && /#REF!/.test(e.f)) add('GE2', 'error', sh.name, a, 'Formula refers to a deleted cell (#REF!).', 'المعادلة بتشير لخلية محذوفة (#REF!).');
        else if (e.f == null && e.k === 'n' && e.v !== 0 && Xl.isDateCell(e, curWb.styles) && (e.v < 36526 || e.v > 73050)) add('GE3', 'error', sh.name, a, 'Date ' + dt(e.v) + ' looks wrong (year ' + Xl.serialToParts(e.v).y + ').', 'التاريخ ' + dt(e.v) + ' شكله غلط (سنة ' + Xl.serialToParts(e.v).y + ').');
        else if (e.k === 's' && e.f == null && /^\s*[-+]?\d[\d,]*(\.\d+)?\s*%?\s*$/.test(e.v) && view.prevCell(sh.name, a) && view.prevCell(sh.name, a).k === 'n') add('GE4', 'warn', sh.name, a, 'Number "' + e.v.trim() + '" is stored as text (it was a number last week) — formulas will ignore it.', 'الرقم "' + e.v.trim() + '" متخزن كنص (كان رقم الأسبوع الماضي) — المعادلات هتتجاهله.', { text: e.v.trim(), label: 'Convert to a number' });
      });
    });
    cmp.changes.forEach(function (ch) {
      var e = view.eff(ch.sheet, ch.a);
      if (!e || ch.kind !== 'type' || !ch.prev || ch.prev.f == null || e.f != null) return;
      add('GE5', 'warn', ch.sheet, ch.a, 'A formula (=' + String(ch.prev.f).slice(0, 50) + ') was replaced by a typed value ' + Xl.formatCell(e, curWb.styles) + '.', 'معادلة (=' + String(ch.prev.f).slice(0, 50) + ') اتبدلت بقيمة مكتوبة ' + Xl.formatCell(e, curWb.styles) + '.');
    });
    cmp.changes.forEach(function (ch) {
      if (ch.kind !== 'modified' || REPORT_SHEETS.indexOf(ch.sheet) < 0) return;
      var e = view.eff(ch.sheet, ch.a), p = ch.prev;
      if (!e || e.k !== 'n' || !p || p.k !== 'n' || e.f != null || Xl.isDateCell(p, curWb.styles) || Math.abs(p.v) < 10 || p.v === 0) return;
      var ratio = e.v / p.v;
      if (ratio >= 3 || (ratio > 0 && ratio <= 1 / 3)) add('GE6', 'info', ch.sheet, ch.a, 'Large change: ' + Xl.formatCell(p, curWb.styles) + ' → ' + Xl.formatCell(e, curWb.styles) + ' (×' + ratio.toFixed(2) + '). Typo?', 'تغيّر كبير: ' + Xl.formatCell(p, curWb.styles) + ' ← ' + Xl.formatCell(e, curWb.styles) + ' (×' + ratio.toFixed(2) + '). غلطة كتابة؟');
    });

    var order = { error: 0, warn: 1, info: 2 };
    issues.sort(function (x, y) { return order[x.sev] - order[y.sev]; });
    return issues;
  }

  return { run: run, REPORT_SHEETS: REPORT_SHEETS };
});

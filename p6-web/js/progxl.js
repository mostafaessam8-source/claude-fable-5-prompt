/* P6 Web – Progress update through Excel. Export a template of the activities (inputs highlighted), fill it in the field, import it back:
   preview with validations, then apply actual start / finish / % complete / remaining duration to the schedule. Matches by Activity ID. */
(function (g) {
  'use strict';
  const P6 = g.P6, App = g.App, D = App.dialogs;
  const esc = P6.esc, B = (en, ar) => (P6.dir() === 'rtl' ? ar : en);
  const fd = (d) => (d == null ? '' : P6.fmtDate(d));
  const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9؀-ۿ]/g, '');
  const HEAD = { code: ['activityid', 'id', 'code', 'رقمالنشاط'], as: ['actualstart', 'as', 'بدايةفعلية'], af: ['actualfinish', 'af', 'نهايةفعلية'], pct: ['complete', 'completepct', 'pct', 'percentcomplete', 'نسبةالانجاز', 'نسبةالإنجاز'], rem: ['remainingduration', 'remaining', 'remdur', 'المتبقي'] };

  App.progressTemplate = function () {
    const p = App.p, DD = p.dataDate;
    const rows = p.tasks.filter((x) => x.status !== 'C' && !(P6.isHammock && P6.isHammock(x))).sort((a, b) => (a.es == null ? 1e9 : a.es) - (b.es == null ? 1e9 : b.es)).map((x) => {
      const w = p.wbs.find((q) => q.id === x.wbs);
      return [x.code, x.name, w ? w.code : '', x.status, x.es, x.ef, x.dur, x.pct || 0, x.as, null, null, null];
    });
    App.xlsxBook('Progress-Update-Template.xlsx', [{ name: 'Progress', title: p.name + ' – ' + B('Progress update', 'تحديث التقدم'), subtitle: B('Data date: ', 'تاريخ البيانات: ') + fd(DD) + B('  |  Fill the yellow columns only, then import it back via Tools ▸ Import Progress from Excel.', '  |  املأ الأعمدة الصفراء فقط ثم استوردها من Tools ▸ Import Progress from Excel.'),
      cols: [{ h: 'Activity ID', w: 16 }, { h: 'Activity Name', w: 46 }, { h: 'WBS', w: 14 }, { h: 'Status', w: 8 }, { h: 'Planned Start', t: 'd', w: 14 }, { h: 'Planned Finish', t: 'd', w: 14 }, { h: 'Orig Dur', t: 'n', w: 9 }, { h: 'Current %', t: 'n', w: 10 },
        { h: 'Actual Start', t: 'd', w: 14, input: 1 }, { h: 'Actual Finish', t: 'd', w: 14, input: 1 }, { h: '% Complete', t: 'n', w: 11, input: 1 }, { h: 'Remaining Duration', t: 'n', w: 12, input: 1 }], rows }]);
  };

  function toDay(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v > 20000 && v < 80000 ? Math.round(v) - 25569 : undefined; // Excel serial -> P6 day
    const s = String(v).trim(); if (!s) return null; const d = P6.parseDate(s); return d == null ? undefined : d;
  }
  function toNum(v) { if (v == null || v === '') return null; const n = typeof v === 'number' ? v : parseFloat(String(v).replace('%', '').replace(',', '.')); return isFinite(n) ? n : undefined; }

  // rows: array of arrays (first row containing an "Activity ID" header is the header)
  function parse(rows) {
    let hi = rows.findIndex((r) => (r || []).some((c) => HEAD.code.includes(norm(c))));
    if (hi < 0) throw new Error(B('No "Activity ID" column found', 'لم يتم العثور على عمود Activity ID'));
    const hdr = rows[hi].map(norm), col = {};
    for (const k of Object.keys(HEAD)) { const i = hdr.findIndex((h) => HEAD[k].includes(h)); if (i >= 0) col[k] = i; }
    if (col.as == null && col.af == null && col.pct == null && col.rem == null) throw new Error(B('No progress columns (Actual Start / Actual Finish / % Complete / Remaining Duration)', 'لا توجد أعمدة تقدم (Actual Start / Actual Finish / % Complete / Remaining Duration)'));
    const by = new Map(App.p.tasks.map((x) => [String(x.code).toLowerCase(), x])), DD = App.p.dataDate, out = [];
    for (let r = hi + 1; r < rows.length; r++) {
      const row = rows[r] || [], code = String(row[col.code] == null ? '' : row[col.code]).trim(); if (!code) continue;
      const v = { as: col.as != null ? toDay(row[col.as]) : null, af: col.af != null ? toDay(row[col.af]) : null, pct: col.pct != null ? toNum(row[col.pct]) : null, rem: col.rem != null ? toNum(row[col.rem]) : null };
      if (v.as == null && v.af == null && v.pct == null && v.rem == null) continue;
      const tk = by.get(code.toLowerCase()), errs = [], warn = [];
      if (!tk) errs.push(B('Unknown Activity ID', 'رقم نشاط غير موجود'));
      for (const k of ['as', 'af']) if (v[k] === undefined) errs.push(B('Bad date in ', 'تاريخ غير صالح في ') + (k === 'as' ? 'Actual Start' : 'Actual Finish'));
      if (v.pct === undefined) errs.push(B('Bad % Complete', '% غير صالح')); else if (v.pct != null && (v.pct < 0 || v.pct > 100)) errs.push(B('% Complete must be 0–100', 'النسبة يجب أن تكون 0–100'));
      if (v.rem === undefined) errs.push(B('Bad Remaining Duration', 'مدة متبقية غير صالحة')); else if (v.rem != null && v.rem < 0) errs.push(B('Remaining cannot be negative', 'المتبقي لا يمكن أن يكون سالباً'));
      if (typeof v.as === 'number' && typeof v.af === 'number' && v.af < v.as) errs.push(B('Actual Finish before Actual Start', 'النهاية الفعلية قبل البداية الفعلية'));
      if (typeof v.as === 'number' && v.as > DD) warn.push(B('Actual Start after data date', 'البداية الفعلية بعد تاريخ البيانات'));
      if (typeof v.af === 'number' && v.af > DD) warn.push(B('Actual Finish after data date', 'النهاية الفعلية بعد تاريخ البيانات'));
      if (tk && tk.status === 'C') warn.push(B('Already completed – will be overwritten', 'مكتمل بالفعل – سيتم الكتابة فوقه'));
      out.push({ code, tk, v, errs, warn, row: r + 1 });
    }
    return out;
  }

  function apply(items) {
    let n = 0;
    App.mutate(B('Import progress from Excel', 'استيراد التقدم من Excel'), () => {
      for (const it of items) {
        if (it.errs.length || !it.tk) continue;
        const tk = it.tk, v = it.v;
        if (v.as != null) tk.as = v.as;
        if (v.af != null || (v.pct != null && v.pct >= 100)) { if (v.af != null) tk.af = v.af; App.setStatus(tk, 'C'); if (v.af != null) tk.af = v.af; }
        else if (v.pct != null) App.setPct(tk, v.pct);
        else if (tk.status === 'NS' && (v.as != null || v.rem != null)) App.setStatus(tk, 'IP');
        if (v.as != null && tk.status === 'NS') App.setStatus(tk, 'IP');
        if (v.as != null) tk.as = v.as;
        if (v.rem != null && tk.status === 'IP') { tk.rem = v.rem; if (tk.pctType === 'dur' && tk.dur > 0 && v.pct == null) tk.pct = Math.max(0, Math.min(99, Math.round(100 * (1 - v.rem / tk.dur)))); }
        n++;
      }
    });
    App.toast(B(n + ' activities updated', 'تم تحديث ' + n + ' نشاط'));
  }

  function preview(items, fname) {
    const bad = items.filter((x) => x.errs.length), ok = items.length - bad.length, wr = items.filter((x) => !x.errs.length && x.warn.length).length;
    const body = document.createElement('div');
    body.innerHTML = `<p class="hint">${esc(fname)} – ${esc(B('Data date: ', 'تاريخ البيانات: ') + fd(App.p.dataDate))}</p>
      <div class="cmpcards"><div class="cmpc good"><b>${ok}</b><span>${esc(B('Ready to apply', 'جاهز للتطبيق'))}</span></div><div class="cmpc ${wr ? 'bad' : ''}"><b>${wr}</b><span>${esc(B('With warnings', 'بتحذيرات'))}</span></div><div class="cmpc ${bad.length ? 'bad' : ''}"><b>${bad.length}</b><span>${esc(B('Errors (skipped)', 'أخطاء (تُتجاهل)'))}</span></div></div>
      <div class="tbl-scroll"><table class="mini cmpt"><thead><tr><th>${esc(B('Row', 'صف'))}</th><th>ID</th><th>${esc(B('Name', 'الاسم'))}</th><th>Actual Start</th><th>Actual Finish</th><th>%</th><th>Rem</th><th>${esc(B('Notes', 'ملاحظات'))}</th></tr></thead><tbody>${items.slice(0, 500).map((x) => `<tr><td>${x.row}</td><td>${esc(x.code)}</td><td>${esc(x.tk ? x.tk.name : '')}</td><td>${typeof x.v.as === 'number' ? fd(x.v.as) : ''}</td><td>${typeof x.v.af === 'number' ? fd(x.v.af) : ''}</td><td>${x.v.pct == null || x.v.pct === undefined ? '' : x.v.pct}</td><td>${x.v.rem == null || x.v.rem === undefined ? '' : x.v.rem}</td><td class="${x.errs.length ? 'cmp-bad' : x.warn.length ? '' : 'cmp-good'}">${esc(x.errs.concat(x.warn).join('; ') || '✓')}</td></tr>`).join('')}</tbody></table></div>`;
    D.modal({ title: B('Import Progress from Excel', 'استيراد التقدم من Excel'), cls: 'wide dsh-modal', body, buttons: [{ label: P6.t('cancel'), fn: () => {} }, { label: B('Apply ' + ok + ' updates', 'طبّق ' + ok + ' تحديث'), cls: 'pri', fn: () => { if (!ok) return false; apply(items); } }] });
  }

  function csv(tx, sep) {
    const out = []; let row = [], cur = '', q = false;
    for (let i = 0; i < tx.length; i++) {
      const c = tx[i];
      if (q) { if (c === '"') { if (tx[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true; else if (c === sep) { row.push(cur); cur = ''; } else if (c === '\n') { row.push(cur.replace(/\r$/, '')); out.push(row); row = []; cur = ''; } else cur += c;
    }
    if (cur || row.length) { row.push(cur); out.push(row); }
    return out;
  }
  App.progressImport = function () {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.xlsx,.csv,.tsv,.txt';
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      try {
        let rows;
        if (/\.xlsx$/i.test(f.name)) rows = await P6.readXlsx(await f.arrayBuffer());
        else { const tx = P6.decodeBuffer(await f.arrayBuffer()), sep = tx.indexOf('\t') >= 0 ? '\t' : tx.split('\n')[0].split(';').length > tx.split('\n')[0].split(',').length ? ';' : ','; rows = csv(tx, sep); }
        preview(parse(rows), f.name);
      } catch (e) { console.error(e); App.toast(String(e.message || e), true); }
    };
    inp.click();
  };
  P6.parseProgressRows = parse;
})(window);

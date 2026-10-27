/* Design Gantt — the page: load the tracker, preview the chart, download the workbook with the Gantt sheet added. */
(function () {
  'use strict';
  var M = window.Model, X = window.XlsxGantt;
  var $ = function (id) { return document.getElementById(id); };
  var HC = { 'Actual': '#2e7d32', 'In progress': '#1e6fd9', 'Forecast': '#7e57c2', 'No dates': '#b0bec5' };
  var CODE = { A: '#2e7d32', B: '#6aa84f', C: '#e69a00', D: '#c62828' };
  var PPD = { day: 18, week: 4.6, month: 1.3 }; // pixels per day of the on-screen chart

  var S = { buf: null, name: '', model: null, scale: 'week', status: {}, project: '', q: '', collapsed: {}, sev: { error: true, warn: true, info: false } };

  function h(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function iso(n) { return M.serialToDate(n).toISOString().slice(0, 10); }
  function fromIso(s) { var p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); return p ? M.dateToSerial(new Date(Date.UTC(+p[1], +p[2] - 1, +p[3]))) : null; }
  function pct(v) { return v == null ? '–' : Math.round(v * 100) + '%'; }

  /* ---------- loading ---------- */
  function showError(msg) { var e = $('error'); e.textContent = msg; e.hidden = !msg; }

  async function loadFile(file) {
    showError('');
    try {
      if (!/\.xls[xm]$/i.test(file.name)) throw new Error('Please choose an Excel .xlsx workbook (this one is "' + file.name + '").');
      var buf = await file.arrayBuffer();
      var zip = await JSZip.loadAsync(buf);
      var model = await M.readWorkbook(zip);
      if (!model.projects.length) throw new Error('The tracker sheet was found but no project rows were read. Check that the project rows have the Programme cell filled.');
      S.buf = buf; S.name = file.name; S.model = model; S.collapsed = {}; S.status = {}; S.project = ''; S.q = '';
      $('fileName').textContent = file.name;
      $('dataDate').value = iso(model.meta.cut);
      $('drop').hidden = true; $('app').hidden = false; $('topActions').hidden = false;
      fillProjects(); render();
    } catch (err) {
      showError(err && err.message ? err.message : String(err));
      console.error(err);
    }
  }

  function fillProjects() {
    var sel = $('fProject');
    sel.innerHTML = '<option value="">All projects</option>' + S.model.projects.map(function (p, i) {
      return '<option value="' + i + '">' + h((p.code ? p.code + ' — ' : '') + p.name) + '</option>';
    }).join('');
    $('fStatus').innerHTML = Object.keys(HC).map(function (k) { return '<button type="button" class="chip" data-st="' + k + '"><i style="background:' + HC[k] + '"></i>' + k + '</button>'; }).join('');
    $('cFilter').innerHTML = [['error', 'Errors'], ['warn', 'Warnings'], ['info', 'Notes']].map(function (x) { return '<button type="button" class="chip" data-sev="' + x[0] + '">' + x[1] + '</button>'; }).join('');
  }

  /* ---------- rendering ---------- */
  function render() {
    renderKpis(); renderLegend(); renderGantt(); renderChecks(); renderRules();
  }

  function renderKpis() {
    var st = S.model.stats, m = S.model.meta, tot = st.elements;
    var stack = Object.keys(HC).map(function (k) { return '<i title="' + k + ' ' + st.counts[k] + '" style="width:' + (tot ? st.counts[k] / tot * 100 : 0) + '%;background:' + HC[k] + '"></i>'; }).join('');
    $('kpis').innerHTML =
      kpi('Projects / elements', st.projects + ' / ' + st.elements, 'lines in the chart', '#3d3935') +
      kpi('Actual', st.counts['Actual'], 'approval date reached', HC['Actual']) +
      kpi('In progress', st.counts['In progress'], 'submitted, approval ahead', HC['In progress']) +
      kpi('Forecast', st.counts['Forecast'], 'submission still ahead', HC['Forecast']) +
      kpi('SAR codes', ['A', 'B', 'C', 'D'].map(function (k) { return '<b style="color:' + CODE[k] + '">' + k + '</b> ' + st.codes[k]; }).join(' · '), st.codes.none + ' elements without a code', '#00778b').replace('class="v"', 'class="v" style="font-size:20px"') +
      kpi('Programme span', st.first ? M.fmtDate(st.first) : '–', st.last ? 'to ' + M.fmtDate(st.last) : 'no dates', '#00778b') +
      '<div class="kpi wide"><div class="l">Elements by status · data date ' + M.fmtDate(m.cut) + '</div><div class="stack">' + stack + '</div><div class="s" style="margin-top:6px">' +
      Object.keys(HC).map(function (k) { return '<span style="margin-right:12px"><b style="color:' + HC[k] + '">●</b> ' + k + ' ' + st.counts[k] + '</span>'; }).join('') + '</div></div>';
  }
  function kpi(l, v, s, c) { return '<div class="kpi" style="border-top-color:' + c + '"><div class="l">' + l + '</div><div class="v" style="color:' + c + '">' + v + '</div><div class="s">' + s + '</div></div>'; }

  function renderLegend() {
    var l = [['<i class="ms sub"></i>', 'Submission (actual)'], ['<i class="ms sub hollow"></i>', 'Submission (forecast)'], ['<i class="ms app"></i>', 'Approval (actual)'], ['<i class="ms app hollow"></i>', 'Approval (forecast)'],
      ['<i class="cd" style="background:' + CODE.A + '">A</i><i class="cd" style="background:' + CODE.B + '">B</i><i class="cd" style="background:' + CODE.C + '">C</i><i class="cd" style="background:' + CODE.D + '">D</i>', 'SAR review code'], ['<i class="dd"></i>', 'Data date']];
    $('legend').innerHTML = l.map(function (x) { return '<span>' + x[0] + x[1] + '</span>'; }).join('');
  }

  function passFilter(p, e) {
    var pi = S.model.projects.indexOf(p);
    if (S.project !== '' && +S.project !== pi) return false;
    var anyStatus = Object.keys(S.status).some(function (k) { return S.status[k]; });
    var q = S.q.trim().toLowerCase();
    if (!e) return !anyStatus && !q;
    if (anyStatus && !S.status[e.status]) return false;
    if (q && (e.name + ' ' + p.name + ' ' + p.code).toLowerCase().indexOf(q) < 0) return false;
    return true;
  }

  function renderGantt() {
    var m = S.model, items = M.buildItems(m, { filter: passFilter }), box = $('gantt');
    if (!items.length) { box.innerHTML = '<div class="g-empty">Nothing matches the filters.</div>'; $('rowHint').textContent = ''; return; }
    var ax = X.layout(items, m.meta.cut, S.scale), ppd = PPD[S.scale], x0 = ax.startOf(0), i;
    var totalW = (ax.endOf(ax.n - 1) + 1 - x0) * ppd;
    function X_(d) { return (d - x0) * ppd; }
    var hasKids = {};
    items.forEach(function (it, ix) { var nx = items[ix + 1]; if (nx && nx.lvl > it.lvl) hasKids[it.id] = true; });
    function hidden(it) { var parts = it.id.split('.'); for (var n = 1; n < parts.length; n++) if (S.collapsed[parts.slice(0, n).join('.')]) return true; return false; }

    var months = ax.groups.map(function (g) { var w = (ax.endOf(g.to) + 1 - ax.startOf(g.from)) * ppd; return '<div style="width:' + w + 'px">' + h(g.label) + '</div>'; }).join('');
    var units = '';
    for (i = 0; i < ax.n; i++) units += '<div style="width:' + (ax.endOf(i) + 1 - ax.startOf(i)) * ppd + 'px">' + (S.scale === 'day' || ppd * (ax.endOf(i) - ax.startOf(i) + 1) >= 14 ? ax.subLabel(i) : '') + '</div>';
    var out = ['<div class="g-head"><div class="g-left"><span>Project / element</span><span>Status</span><span>Submit</span><span>Appr.</span></div>' +
      '<div class="g-time" style="width:' + totalW + 'px"><div class="g-months">' + months + '</div><div class="g-units">' + units + '</div></div></div>'];

    var grid = ax.groups.map(function (g) { return '<i style="position:absolute;top:0;bottom:0;left:' + X_(ax.startOf(g.from)) + 'px;border-left:1px solid #dfe5e8"></i>'; }).join('');
    var shown = 0;
    items.forEach(function (it, ix) {
      if (hidden(it)) return;
      shown++;
      var cls = it.kind === 'project' ? 'p' : 'e', bars = '';
      it.ms.forEach(function (g) {
        var x = X_(g.d) + ppd / 2, top = it.kind === 'project' ? 9 : 8;
        if (g.t === 'app' && /^[ABCD]$/.test(it.code)) bars += '<div class="cd on" data-i="' + ix + '" style="left:' + (x - 9) + 'px;top:' + (top - 1) + 'px;background:' + CODE[it.code] + '">' + it.code + '</div>';
        else bars += '<div class="ms ' + g.t + (g.actual ? '' : ' hollow') + '" data-i="' + ix + '" style="left:' + (x - 8) + 'px;top:' + top + 'px"></div>';
      });
      var pill = '<span class="pill" style="background:' + HC[it.status] + '">' + it.status + '</span>';
      var tog = hasKids[it.id] ? '<button class="toggle" type="button" data-id="' + it.id + '" aria-label="Collapse or expand">' + (S.collapsed[it.id] ? '▸' : '▾') + '</button>' : '';
      out.push('<div class="g-row ' + cls + '" style="height:30px" data-i="' + ix + '"><div class="g-left" style="padding-left:' + it.lvl * 14 + 'px">' +
        '<div class="g-name"><div class="t">' + tog + '<span title="' + h(it.label) + '">' + h(it.label) + '</span></div></div>' + pill +
        '<div class="g-cell">' + (M.isNum(it.ps) ? M.fmtDate(it.ps).slice(0, 6) : '') + '</div><div class="g-cell">' + (M.isNum(it.pa) ? M.fmtDate(it.pa).slice(0, 6) : '') + '</div></div>' +
        '<div class="g-plot" style="width:' + totalW + 'px"><div class="g-grid"></div>' + grid + bars + '</div></div>');
    });
    box.innerHTML = out.join('');
    // data-date line spans all rows (absolute, inside the timeline column area)
    var dd = document.createElement('div'); dd.className = 'g-dd';
    var left = parseFloat(getComputedStyle(box).getPropertyValue('--lw')) || 430;
    dd.style.left = (left + X_(m.meta.cut) + ppd / 2) + 'px'; dd.innerHTML = '<span>Data date ' + M.fmtDate(m.meta.cut) + '</span>';
    box.appendChild(dd);
    box._items = items;
    $('rowHint').textContent = shown + ' of ' + items.length + ' lines shown · hover a bar for the dates · ' + (S.scale === 'day' ? 'daily' : S.scale === 'week' ? 'weekly' : 'monthly') + ' scale';
  }

  function renderChecks() {
    var all = S.model.checks, n = all.filter(function (k) { return k.sev !== 'info'; }).length;
    $('checkCount').textContent = n ? n : '';
    Array.prototype.forEach.call(document.querySelectorAll('#cFilter .chip'), function (b) { b.classList.toggle('on', !!S.sev[b.dataset.sev]); });
    var rows = all.filter(function (k) { return S.sev[k.sev]; });
    $('checksTable').innerHTML = '<thead><tr><th></th><th>Project</th><th>Element</th><th>Row</th><th>Finding</th></tr></thead><tbody>' +
      (rows.length ? rows.map(function (k) {
        return '<tr><td><span class="sev ' + k.sev + '">' + (k.sev === 'error' ? 'ERROR' : k.sev === 'warn' ? 'WARN' : 'NOTE') + '</span></td><td>' + h(k.project) + '</td><td>' + h(k.element) + '</td><td>' + k.row + '</td><td>' + h(k.msg) + '</td></tr>';
      }).join('') : '<tr><td colspan="5" style="padding:18px;color:#78909c">Nothing to report for this selection.</td></tr>') + '</tbody>';
  }

  function renderRules() {
    var m = S.model.meta;
    $('rules').innerHTML =
      '<li>Only the <b>Submission Date</b> and <b>Approval Date</b> columns are used. Each is either an actual or a forecast date: up to the data date it is actual, after it it is forecast.</li>' +
      '<li><b>Actual</b>: approval date reached. <b>In progress</b>: submission date reached, approval still ahead. <b>Forecast</b>: submission date still ahead.</li>' +
      '<li>A project shows the dates typed on its own row; if there are none, the span from its first submission to its last approval.</li>' +
      '<li>Data date used: <b>' + M.fmtDate(m.cut) + '</b> (workbook says ' + M.fmtDate(m.workbookDataDate) + '). Change it above to see the position on another date.</li>';
  }

  /* ---------- tooltip ---------- */
  function tipText(it) {
    var f = M.fmtDate, L = ['<b>' + h(it.label) + '</b>', it.status + (M.isNum(it.ps) && M.isNum(it.pa) ? ' · ' + (it.pa - it.ps) + ' days' : '')];
    L.push('Submission date: ' + (f(it.ps) || '–') + (M.isNum(it.ps) ? (it.ps <= S.model.meta.cut ? ' (actual)' : ' (forecast)') : ''));
    L.push('Approval date: ' + (f(it.pa) || '–') + (M.isNum(it.pa) ? (it.pa <= S.model.meta.cut ? ' (actual)' : ' (forecast)') : ''));
    L.push('SAR code: ' + (it.code || 'none yet'));
    if (it.notes) L.push('“' + it.notes.replace(/\s+/g, ' ').slice(0, 160) + '”');
    return L.join('\n');
  }
  function wireTip() {
    var tip = $('tip'), box = $('gantt');
    function move(ev) { tip.style.left = Math.min(window.innerWidth - tip.offsetWidth - 10, ev.clientX + 14) + 'px'; tip.style.top = Math.min(window.innerHeight - tip.offsetHeight - 10, ev.clientY + 16) + 'px'; }
    box.addEventListener('mousemove', function (ev) {
      var el = ev.target.closest && ev.target.closest('.g-bar,.g-code,.g-name');
      var row = ev.target.closest && ev.target.closest('.g-row');
      var tgt = el || row;
      if (!tgt || !box._items) { tip.hidden = true; return; }
      var ix = (tgt.dataset.i != null ? tgt : row).dataset.i;
      if (ix == null) { tip.hidden = true; return; }
      tip.innerHTML = tipText(box._items[+ix]).split('\n').map(function (l) { return '<div>' + (l.indexOf('<b>') === 0 ? l : h(l)) + '</div>'; }).join('');
      tip.hidden = false; move(ev);
    });
    box.addEventListener('mouseleave', function () { tip.hidden = true; });
    box.addEventListener('click', function (ev) {
      var t = ev.target.closest('.toggle'); if (!t) return;
      S.collapsed[t.dataset.id] = !S.collapsed[t.dataset.id]; renderGantt();
    });
  }

  /* ---------- download ---------- */
  async function download() {
    var btn = $('btnDownload'), old = btn.innerHTML;
    btn.disabled = true; btn.textContent = 'Building…';
    try {
      var zip = await JSZip.loadAsync(S.buf);
      var r = await X.build(zip, S.model, { scale: S.scale, sourceName: S.name });
      var blob = new Blob([r.bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = S.name.replace(/\.xls[xm]$/i, '') + '_Gantt.xlsx';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    } catch (err) { showError('Could not build the workbook: ' + (err && err.message ? err.message : err)); $('drop').hidden = false; console.error(err); }
    btn.disabled = false; btn.innerHTML = old;
  }

  /* ---------- wiring ---------- */
  function init() {
    var file = $('file'), box = $('dropBox');
    box.addEventListener('click', function () { file.click(); });
    box.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } });
    file.addEventListener('change', function () { if (file.files[0]) loadFile(file.files[0]); file.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) { document.addEventListener(ev, function (e) { e.preventDefault(); box.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { document.addEventListener(ev, function (e) { e.preventDefault(); box.classList.remove('over'); }); });
    document.addEventListener('drop', function (e) { var f = e.dataTransfer && e.dataTransfer.files[0]; if (f) loadFile(f); });
    $('btnChange').addEventListener('click', function () { $('drop').hidden = false; $('app').hidden = true; $('topActions').hidden = true; });
    $('btnDownload').addEventListener('click', download);
    $('btnPrint').addEventListener('click', function () { document.querySelector('[data-tab=gantt]').click(); window.print(); });

    function setCut(n) { if (n == null) return; M.recalc(S.model, n); $('dataDate').value = iso(n); render(); }
    $('dataDate').addEventListener('change', function () { setCut(fromIso(this.value)); });
    $('ddBook').addEventListener('click', function () { if (S.model.meta.workbookDataDate != null) setCut(S.model.meta.workbookDataDate); });
    $('ddToday').addEventListener('click', function () { setCut(M.dateToSerial(new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())))); });
    Array.prototype.forEach.call(document.querySelectorAll('.seg button'), function (b) {
      b.addEventListener('click', function () {
        S.scale = b.dataset.scale;
        Array.prototype.forEach.call(document.querySelectorAll('.seg button'), function (x) { x.classList.toggle('on', x === b); });
        renderGantt();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
      t.addEventListener('click', function () {
        Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (x) { x.classList.toggle('on', x === t); });
        ['gantt', 'checks', 'about'].forEach(function (n) { $('tab-' + n).hidden = n !== t.dataset.tab; });
      });
    });
    $('fProject').addEventListener('change', function () { S.project = this.value; renderGantt(); });
    $('fSearch').addEventListener('input', function () { S.q = this.value; renderGantt(); });
    $('fStatus').addEventListener('click', function (e) {
      var b = e.target.closest('.chip'); if (!b) return;
      S.status[b.dataset.st] = !S.status[b.dataset.st]; b.classList.toggle('on', S.status[b.dataset.st]); renderGantt();
    });
    $('cFilter').addEventListener('click', function (e) {
      var b = e.target.closest('.chip'); if (!b) return;
      S.sev[b.dataset.sev] = !S.sev[b.dataset.sev]; renderChecks();
    });
    $('btnCollapse').addEventListener('click', function () {
      var items = $('gantt')._items || []; S.collapsed = {};
      items.forEach(function (it, ix) { var nx = items[ix + 1]; if (nx && nx.lvl > it.lvl && it.lvl === 0) S.collapsed[it.id] = true; });
      renderGantt();
    });
    $('btnExpand').addEventListener('click', function () { S.collapsed = {}; renderGantt(); });
    wireTip();
  }
  init();
  window.__designGantt = { S: S, loadFile: loadFile };
})();

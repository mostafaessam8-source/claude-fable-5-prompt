/* Design Gantt — the page: load the tracker, preview the chart, download the workbook with the Gantt sheet added. */
(function () {
  'use strict';
  var M = window.Model, X = window.XlsxGantt;
  var $ = function (id) { return document.getElementById(id); };
  var HC = { 'Completed': '#2e7d32', 'In Progress': '#1e6fd9', 'At Risk': '#f5a300', 'Delayed': '#c62828', 'Not Started': '#b0bec5' };
  var CODE = X.CODE;
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
    var st = S.model.stats, m = S.model.meta, tot = 0, k;
    for (k in st.health) tot += st.health[k];
    var stack = Object.keys(HC).map(function (k2) { return '<i title="' + k2 + ' ' + st.health[k2] + '" style="width:' + (tot ? st.health[k2] / tot * 100 : 0) + '%;background:' + HC[k2] + '"></i>'; }).join('');
    var stages = st.byStage.map(function (b) {
      return '<div><span>' + M.STAGE_NAMES[b.k] + '</span><em><i style="width:' + (b.pct == null ? 0 : b.pct * 100) + '%"></i></em><b>' + pct(b.pct) + '</b></div>';
    }).join('');
    $('kpis').innerHTML =
      kpi('Programme progress', pct(st.programmePct), 'weighted ' + m.weights.map(function (w) { return Math.round(w * 100); }).join(' / ') + '%', '#00778b') +
      kpi('Projects / elements', st.projects + ' / ' + st.elements, st.openCD + ' open Code C/D · ' + st.approved + ' approved A', '#3d3935') +
      kpi('Delayed items', st.health['Delayed'], 'of ' + tot + ' design stages', HC['Delayed']) +
      kpi('At risk (≤ ' + m.window + ' d)', st.health['At Risk'], st.health['Not Started'] + ' not started', HC['At Risk']) +
      kpi('Latest forecast close', st.latestClose ? M.fmtDate(st.latestClose) : '–', 'data date ' + M.fmtDate(m.cut), '#5e35b1') +
      '<div class="kpi wide"><div class="l">Status of design stages</div><div class="stack">' + stack + '</div><div class="stage-bars">' + stages + '</div></div>';
  }
  function kpi(l, v, s, c) { return '<div class="kpi" style="border-top-color:' + c + '"><div class="l">' + l + '</div><div class="v" style="color:' + c + '">' + v + '</div><div class="s">' + s + '</div></div>'; }

  function renderLegend() {
    var l = [['#9aa9b3', 'Baseline'], ['#00778b', 'Actual (SAR reviewed)'], ['repeating-linear-gradient(135deg,#e69a00 0 4px,#fff3d6 4px 8px)', 'Under SAR review'],
      ['repeating-linear-gradient(135deg,rgba(0,119,139,.55) 0 3px,#ddf0f4 3px 7px)', 'Forecast'], ['repeating-linear-gradient(45deg,rgba(94,53,177,.55) 0 3px,#e8e1f5 3px 7px)', 'Current plan'],
      ['#2e7d32', 'Code A'], ['#6aa84f', 'Code B'], ['#e69a00', 'Code C'], ['#c62828', 'Code D / data date']];
    $('legend').innerHTML = l.map(function (x) { return '<span><i style="background:' + x[0] + '"></i>' + x[1] + '</span>'; }).join('');
  }

  function passFilter(p, e) {
    var pi = S.model.projects.indexOf(p);
    if (S.project !== '' && +S.project !== pi) return false;
    var anyStatus = Object.keys(S.status).some(function (k) { return S.status[k]; });
    var q = S.q.trim().toLowerCase();
    if (!e) return !anyStatus && !q;
    if (anyStatus && !S.status[e.health]) return false;
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
    var out = ['<div class="g-head"><div class="g-left"><span>Project / element / stage</span><span>Health</span><span>%</span><span>Var d</span></div>' +
      '<div class="g-time" style="width:' + totalW + 'px"><div class="g-months">' + months + '</div><div class="g-units">' + units + '</div></div></div>'];

    // faint month grid lines
    var gridStops = ax.groups.map(function (g) { return X_(ax.startOf(g.from)); });
    var grid = gridStops.map(function (px) { return '<i style="position:absolute;top:0;bottom:0;left:' + px + 'px;border-left:1px solid #dfe5e8"></i>'; }).join('');
    var shown = 0;
    items.forEach(function (it, ix) {
      if (hidden(it)) return;
      shown++;
      var cls = it.kind === 'project' ? 'p' : it.kind === 'element' ? 'e' : 's', two = !!it.base, ht = two ? 44 : 32;
      var bars = '';
      function bar(c, s, e, top, hh, extra) { return '<div class="g-bar ' + c + '" data-i="' + ix + '" style="left:' + X_(s) + 'px;width:' + Math.max(4, (e - s + 1) * ppd) + 'px;top:' + top + 'px;height:' + hh + 'px;' + (extra || '') + '"></div>'; }
      if (two) bars += bar('b-base', it.base[0], it.base[1], 8, 8);
      var aTop = two ? 22 : 9, aH = two ? 14 : 14;
      var order = { forecast: 1, fmile: 2, plan: 2, review: 3, actual: 4, sum: 5 };
      it.segs.slice().sort(function (a, b) { return order[a.t] - order[b.t]; }).forEach(function (g) {
        if (g.t === 'fmile') bars += '<div class="g-bar b-fmile" data-i="' + ix + '" style="left:' + (X_(g.s) + ppd / 2 - 5) + 'px;top:' + (aTop + 2) + 'px;height:10px"></div>';
        else bars += bar('b-' + g.t, g.s, g.e, aTop, aH);
      });
      if (it.codeAt) bars += '<div class="g-code" data-i="' + ix + '" style="left:' + (X_(it.codeAt.d) + ppd / 2 - 8) + 'px;top:' + (aTop - 1) + 'px;background:' + (CODE[it.codeAt.code] || '#999') + '">' + h(it.codeAt.code) + '</div>';
      var healthPill = it.health && it.health !== '-' ? '<span class="pill" style="background:' + HC[it.health] + (it.health === 'At Risk' ? ';color:#3d2a00' : '') + '">' + it.health + '</span>' : '<span></span>';
      var v = it.varDays == null ? '' : '<span class="' + (it.varDays > 0 ? 'var-late' : 'var-ok') + '">' + (it.varDays > 0 ? '+' : '') + it.varDays + '</span>';
      var sub = [];
      if (it.stage && it.kind !== 'stage') sub.push(it.stage);
      if (it.base) sub.push('BL ' + M.fmtDate(it.base[0]) + ' → ' + M.fmtDate(it.base[1]));
      var aS = null, aE = null; it.segs.forEach(function (g) { aS = aS == null ? g.s : Math.min(aS, g.s); aE = aE == null ? g.e : Math.max(aE, g.e); });
      if (aS != null) sub.push('Act/Fc ' + M.fmtDate(aS) + ' → ' + M.fmtDate(aE)); else sub.push('no dates yet');
      var tog = hasKids[it.id] ? '<button class="toggle" type="button" data-id="' + it.id + '" aria-label="Collapse or expand">' + (S.collapsed[it.id] ? '▸' : '▾') + '</button>' : '';
      out.push('<div class="g-row ' + cls + '" style="height:' + ht + 'px" data-i="' + ix + '"><div class="g-left" style="padding-left:' + it.lvl * 14 + 'px">' +
        '<div class="g-name"><div class="t">' + tog + '<span title="' + h(it.label) + '">' + h(it.label) + '</span>' + (it.code ? '<span class="pill" style="background:' + (CODE[it.code] || '#999') + '">' + h(it.code) + '</span>' : '') + '</div><div class="d">' + h(sub.join(' · ')) + '</div></div>' +
        healthPill + '<div class="g-cell">' + (it.pct == null ? '' : pct(it.pct)) + '</div><div class="g-cell">' + v + '</div></div>' +
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
    $('checksTable').innerHTML = '<thead><tr><th></th><th>Project</th><th>Element</th><th>Stage</th><th>Row</th><th>Finding</th></tr></thead><tbody>' +
      (rows.length ? rows.map(function (k) {
        return '<tr><td><span class="sev ' + k.sev + '">' + (k.sev === 'error' ? 'ERROR' : k.sev === 'warn' ? 'WARN' : 'NOTE') + '</span></td><td>' + h(k.project) + '</td><td>' + h(k.element) + '</td><td>' + h(k.stage) + '</td><td>' + k.row + '</td><td>' + h(k.msg) + '</td></tr>';
      }).join('') : '<tr><td colspan="6" style="padding:18px;color:#78909c">Nothing to report for this selection.</td></tr>') + '</tbody>';
  }

  function renderRules() {
    var m = S.model.meta, e = m.earned;
    $('rules').innerHTML =
      '<li><b>% earned</b> per design stage: submitted ' + pct(e.sub) + ', Code D ' + pct(e.D) + ', C ' + pct(e.C) + ', B ' + pct(e.B) + ', A ' + pct(e.A) + '. An element’s % is the stage-weighted average of the stages that have dates (' + M.STAGE_NAMES.map(function (n, i) { return n + ' ' + pct(m.weights[i]); }).join(', ') + '); a project’s % is the average of its elements.</li>' +
      '<li><b>Delayed</b>: not yet submitted and the baseline submission date has passed, or still open (no code, C or D) and the baseline approval date has passed.</li>' +
      '<li><b>At Risk</b>: the same dates fall within the next ' + m.window + ' days of the data date. <b>Completed</b>: Code A. <b>Not Started</b>: nothing submitted or reviewed.</li>' +
      '<li><b>Var (d)</b>: Code A/B → actual review minus baseline approval; otherwise forecast approval (or the data date if there is none) minus baseline approval. Positive = late.</li>' +
      '<li>Data date used: <b>' + M.fmtDate(m.cut) + '</b> (workbook says ' + M.fmtDate(m.workbookDataDate) + '). Change it above to see the position on another date.</li>';
  }

  /* ---------- tooltip ---------- */
  function tipText(it) {
    var L = [], d = it.dates, f = M.fmtDate;
    L.push('<b>' + h(it.label) + '</b>' + (it.stage ? ' · ' + h(it.stage) : ''));
    L.push((it.health && it.health !== '-' ? it.health : 'No dates') + (it.pct != null ? ' · ' + pct(it.pct) : '') + (it.code ? ' · Code ' + it.code : '') + (it.varDays != null ? ' · ' + (it.varDays > 0 ? '+' : '') + it.varDays + ' d vs baseline' : ''));
    if (it.base) L.push('Baseline: ' + f(it.base[0]) + ' → ' + f(it.base[1]));
    if (d) {
      if (d.as != null || d.ar != null) L.push('Actual: submitted ' + (f(d.as) || '–') + ' · SAR review ' + (f(d.ar) || 'pending'));
      if (d.fs != null || d.fa != null) L.push('Forecast: re-submit ' + (f(d.fs) || '–') + ' · approval ' + (f(d.fa) || '–'));
      if (d.ps != null || d.pa != null) L.push('Current plan: submit ' + (f(d.ps) || '–') + ' · approval ' + (f(d.pa) || '–'));
    }
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

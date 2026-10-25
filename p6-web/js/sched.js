/* P6 Web – Schedule dialog (F9), Schedule Options and the schedule log. */
(function (g) {
  'use strict';
  const P6 = g.P6, App = g.App, D = App.dialogs;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = P6.esc, t = (k, ...a) => P6.t(k, ...a);
  const fmtD = P6.fmtDate;
  App.schedLog = { text: '', html: '', at: null };
  const OPT_LABEL = () => {
    const o = App.p.schedOpts || {};
    return [[t('so_logic'), o.logic === 'override' ? t('so_override') : t('so_retained')], [t('so_crit'), o.crit === 'longest' ? t('so_longest') : t('so_tf') + ' ≤ ' + (o.critFloat || 0)], [t('so_lagcal'), t('lc_' + (o.lagCal || 'pred'))], [t('so_tfmode'), t('tm_' + (o.tfMode || 'finish'))], [t('so_openends'), o.openCrit ? t('yes') : t('no')]];
  };
  function buildLog(p, before) {
    const ts = p.tasks, cnt = (s) => ts.filter((x) => x.status === s).length;
    const neg = ts.filter((x) => x.status !== 'C' && x.tf != null && x.tf < 0), hasSucc = new Set(p.rels.map((r) => r.p)), hasPred = new Set(p.rels.map((r) => r.s));
    const open = ts.filter((x) => x.status !== 'C' && !hasSucc.has(x.id) && x.type !== 'TT_FinMile'), noPred = ts.filter((x) => x.status !== 'C' && !hasPred.has(x.id) && x.type !== 'TT_Mile');
    const cs = ts.filter((x) => x.ct);
    const L = [];
    L.push('P6 Web – ' + t('sched_log'), '='.repeat(60), t('f_name') + ': ' + p.name, t('run_date') + ': ' + new Date().toLocaleString(), t('data_date') + ': ' + fmtD(p.dataDate), '');
    L.push(t('sched_options') + ':'); OPT_LABEL().forEach(([k, v]) => L.push('  ' + k + ': ' + v)); L.push('');
    L.push(t('sched_results') + ':', '  ' + t('activities') + ': ' + ts.length + ' (' + t('st_NS') + ' ' + cnt('NS') + ', ' + t('st_IP') + ' ' + cnt('IP') + ', ' + t('st_C') + ' ' + cnt('C') + ')', '  ' + t('relationships') + ': ' + p.rels.length, '  ' + t('start') + ': ' + fmtD(p.start) + '   ' + t('finish') + ': ' + fmtD(p.finish), '  ' + t('critical') + ': ' + ts.filter((x) => x.crit && x.status !== 'C').length);
    if (before != null) L.push('  ' + t('sched_changed') + ': ' + before);
    L.push('  ' + t('sched_loops') + ': ' + ((p.loops || []).length ? p.loops.join(', ') : '0'));
    const sect = (title, list, extra) => { L.push('', title + ' (' + list.length + '):'); list.slice(0, 60).forEach((x) => L.push('  ' + x.code + '  ' + x.name + (extra ? '   ' + extra(x) : ''))); if (list.length > 60) L.push('  …'); };
    sect(t('chk_negfloat'), neg, (x) => 'TF=' + x.tf); sect(t('chk_nopred'), noPred); sect(t('chk_nosucc'), open); sect(t('sched_constraints'), cs, (x) => x.ct + ' ' + fmtD(x.cd));
    const text = L.join('\r\n');
    const html = '<!doctype html><meta charset="utf-8"><title>' + esc(t('sched_log')) + '</title><pre style="font:13px Consolas,monospace">' + esc(text) + '</pre>';
    return { text, html };
  }
  // runs a schedule with the choices of the dialog and writes the log
  App.scheduleWith = function (o) {
    const p = App.p;
    App.undo.push({ label: t('schedule'), snap: App.json(p) }); App.redo.length = 0;
    if (!o.own && o.dd != null) { p.dataDate = o.dd; if (p.planStart > o.dd) p.planStart = o.dd; }
    if (o.setFc && o.forecast != null) { p.dataDate = o.forecast; p.planStart = o.forecast; }
    const before = p.tasks.map((x) => x.es + '|' + x.ef);
    P6.schedule(p); p.imported = false;
    let changed = 0; p.tasks.forEach((x, i) => { if (before[i] !== x.es + '|' + x.ef) changed++; });
    const log = buildLog(p, changed);
    const prev = App.schedLog.text;
    App.schedLog = { text: o.append && prev ? prev + '\r\n\r\n' + log.text : log.text, html: log.html, at: Date.now() };
    App.scheduleSave(); App.refresh({ details: true });
    App.toast(t('scheduled') + (p.loops.length ? ' ⚠ ' + t('loops_found', p.loops.join(', ')) : ''), !!p.loops.length);
    if (o.log) {
      const base = String(o.file || 'SchedLog.TXT').split(/[\\/]/).pop() || 'SchedLog.TXT';
      const name = o.html ? base.replace(/\.[^.]*$/, '') + '.html' : base;
      App.download(name, o.html ? App.schedLog.html : App.schedLog.text, o.html ? 'text/html' : 'text/plain');
    }
  };
  D.viewLog = function () {
    if (!App.schedLog.text) return App.toast(t('no_log'), true);
    D.modal({ title: t('sched_log'), cls: 'wide', body: `<pre style="margin:0;max-height:60vh;overflow:auto;font:12.5px Consolas,monospace;white-space:pre-wrap" dir="ltr">${esc(App.schedLog.text)}</pre>`, buttons: [{ label: t('mi_savelog'), fn: () => { App.download('SchedLog.TXT', App.schedLog.text, 'text/plain'); return false; } }, { label: t('close'), cls: 'pri', fn: () => {} }] });
  };
  D.schedule = function () {
    const p = App.p, F = App.cfg;
    const s = (F.schedDlg = Object.assign({ own: true, dd: p.dataDate, forecast: null, setFc: false, log: true, html: false, file: 'SchedLog.TXT', append: false }, F.schedDlg));
    const body = document.createElement('div'); body.className = 'schdlg';
    const draw = () => {
      body.innerHTML = `<div class="sd-form"><div class="sd-row"><span>${esc(t('proj_to_sched'))}</span><input class="sd-box" readonly value="1"></div>
        <label class="chk"><input type="radio" name="sd_dd" value="own"${s.own ? ' checked' : ''}> ${esc(t('dd_own'))}</label>
        <div class="sd-row"><label class="chk"><input type="radio" name="sd_dd" value="apply"${!s.own ? ' checked' : ''}> ${esc(t('dd_apply'))}</label><input id="sd_dd" class="sd-box" dir="ltr" value="${esc(fmtD(s.dd))}"${s.own ? ' disabled' : ''}></div>
        <div class="sd-row"><span>${esc(t('fc_start'))}</span><input id="sd_fc" class="sd-box" dir="ltr" value="${esc(s.forecast != null ? fmtD(s.forecast) : '')}" placeholder="dd-Mon-yy"></div>
        <label class="chk" style="opacity:${s.forecast != null ? 1 : .5}"><input type="checkbox" id="sd_sfc"${s.setFc ? ' checked' : ''}${s.forecast != null ? '' : ' disabled'}> ${esc(t('set_dd_fc'))}</label><hr>
        <div style="display:flex;gap:24px"><label class="chk"><input type="checkbox" id="sd_log"${s.log ? ' checked' : ''}> ${esc(t('log_to_file'))}</label><label class="chk"><input type="checkbox" id="sd_html"${s.html ? ' checked' : ''}> ${esc(t('as_html'))}</label></div>
        <input id="sd_file" class="sd-path" dir="ltr" value="${esc(s.file)}">
        <div style="display:flex;gap:24px"><label class="chk"><input type="radio" name="sd_ap" value="ow"${!s.append ? ' checked' : ''}> ${esc(t('overwrite'))}</label><label class="chk"><input type="radio" name="sd_ap" value="ap"${s.append ? ' checked' : ''}> ${esc(t('append'))}</label></div></div>
        <div class="cd-btns"><button class="btn" data-a="cancel">⦸ ${esc(t('cancel'))}</button><button class="btn pri" data-a="run">▶ ${esc(t('schedule'))}</button><button class="btn" data-a="log">${esc(t('view_log'))}</button><button class="btn" data-a="help">? ${esc(t('help'))}</button><button class="btn" data-a="opts">▶ ${esc(t('options'))}…</button></div>`;
    };
    draw();
    const m = D.modal({ title: t('schedule'), cls: 'mid schmodal', body, buttons: [], sticky: true });
    const read = () => {
      s.own = body.querySelector('input[name=sd_dd]:checked').value === 'own';
      const d = P6.parseDate($('#sd_dd', body).value); if (d != null) s.dd = d;
      const fc = $('#sd_fc', body).value.trim(); s.forecast = fc ? P6.parseDate(fc) : null; s.setFc = !!$('#sd_sfc', body).checked && s.forecast != null;
      s.log = $('#sd_log', body).checked; s.html = $('#sd_html', body).checked; s.file = $('#sd_file', body).value; s.append = body.querySelector('input[name=sd_ap]:checked').value === 'ap';
    };
    body.addEventListener('change', (e) => { read(); if (e.target.name === 'sd_dd' || e.target.id === 'sd_fc') draw(); });
    body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a; read();
      if (a === 'cancel') m.close();
      else if (a === 'run') { m.close(); App.scheduleWith(s); }
      else if (a === 'log') D.viewLog();
      else if (a === 'opts') D.schedOptions();
      else if (a === 'help') D.modal({ title: t('help'), cls: 'mid', body: `<div style="line-height:1.8">${t('sched_help_html')}</div>`, buttons: [{ label: t('close'), cls: 'pri', fn: () => {} }] });
    });
  };
  D.schedOptions = function () {
    const p = App.p, o = Object.assign({ logic: 'retained', crit: 'tf', critFloat: 0, lagCal: 'pred', tfMode: 'finish', openCrit: false }, p.schedOpts);
    const opt = (v, l, c) => `<option value="${v}"${c === v ? ' selected' : ''}>${esc(l)}</option>`;
    const body = `<div class="grid2"><div class="fld w2"><label>${esc(t('so_logic'))}</label><select id="so_l">${opt('retained', t('so_retained'), o.logic)}${opt('override', t('so_override'), o.logic)}</select></div>
      <div class="fld"><label>${esc(t('so_crit'))}</label><select id="so_c">${opt('tf', t('so_tf'), o.crit)}${opt('longest', t('so_longest'), o.crit)}</select></div><div class="fld"><label>${esc(t('so_tf') + ' ≤')}</label><input id="so_cf" value="${o.critFloat || 0}"></div>
      <div class="fld"><label>${esc(t('so_lagcal'))}</label><select id="so_lc">${['pred', 'succ', '24h', 'proj'].map((k) => opt(k, t('lc_' + k), o.lagCal)).join('')}</select></div>
      <div class="fld"><label>${esc(t('so_tfmode'))}</label><select id="so_tm">${['finish', 'start', 'smallest'].map((k) => opt(k, t('tm_' + k), o.tfMode)).join('')}</select></div></div>
      <label class="chk" style="margin-top:12px"><input type="checkbox" id="so_oc"${o.openCrit ? ' checked' : ''}> ${esc(t('so_openends'))}</label>
      <label class="chk"><input type="checkbox" id="so_auto"${App.cfg.auto ? ' checked' : ''}> ${esc(t('auto_schedule'))}</label>`;
    D.modal({ title: t('sched_options'), cls: 'mid', body, buttons: [{ label: t('cancel'), fn: () => {} }, { label: t('ok'), cls: 'pri', fn: (c, el) => {
      App.mutate(t('sched_options'), () => { p.schedOpts = { logic: $('#so_l', el).value, crit: $('#so_c', el).value, critFloat: parseFloat($('#so_cf', el).value) || 0, lagCal: $('#so_lc', el).value, tfMode: $('#so_tm', el).value, openCrit: $('#so_oc', el).checked }; p.retained = p.schedOpts.logic !== 'override'; p.critFloat = p.schedOpts.critFloat; });
      App.cfg.auto = $('#so_auto', el).checked; App.saveCfg(); App.buildMenus();
    } }] });
  };
})(window);

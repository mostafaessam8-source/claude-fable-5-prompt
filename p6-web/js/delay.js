/* P6 Web – "Delay & Recovery" section: one window hosting the EOT register, delay analysis (TIA / windows), delay report,
   recovery schedule, revisions and the out-of-sequence fixer. Tabs register themselves in P6.delay.tabs and render into a container.
   Data lives in the project: p.eot (events + settings), p.revs (revision register), p.oosLog (audit log of logic fixes). */
(function (g) {
  'use strict';
  const P6 = g.P6, App = g.App;
  const esc = P6.esc, B = (en, ar) => (P6.dir() === 'rtl' ? ar : en);
  const clone = (p) => JSON.parse(JSON.stringify(p, (k, v) => (k === 'xer' ? undefined : v)));
  const fin = (q) => q.tasks.reduce((m, t) => (t.ef != null && t.ef > m ? t.ef : m), -Infinity);
  const defCal = (p) => p.cals.find((c) => c.id === p.defCal) || p.cals[0];
  /* working days from date a to date b on the project calendar (negative when b is earlier) */
  const wdays = (p, a, b) => (a == null || b == null || !isFinite(a) || !isFinite(b) ? null : P6.signedWork(defCal(p), a, b));
  const fd = (d) => (d == null || !isFinite(d) ? '' : P6.fmtDate(d));
  const pd = (s) => { s = String(s == null ? '' : s).trim(); if (!s) return null; const d = P6.parseDate(s); return d == null ? undefined : d; };

  function ensure(p) {
    p.eot = Object.assign({ events: [], seq: 1, contractFinish: null, noticeDays: 28, particularsDays: 84, barLate: false, mode: 'cum', meta: {} }, p.eot);
    p.revs = p.revs || []; p.oosLog = p.oosLog || [];
    return p.eot;
  }
  const D2 = (P6.delay = { clone, fin, wdays, fd, pd, ensure, tabs: [], B, esc });

  const css = () => {};
  void css;

  App.renderDelayWin = function (el) {
    const p = App.p; if (!p) return; ensure(p);
    el.innerHTML = '';
    const root = document.createElement('div'); root.className = 'dly'; root.dir = P6.dir(); el.appendChild(root); el.classList.add('dsh-host');
    const tabs = D2.tabs, cur = tabs.find((t) => t.id === App.delayTab) || tabs[0];
    root.innerHTML = `<div class="dly-tabs">${tabs.map((t) => `<button class="${t.id === cur.id ? 'on' : ''}" data-t="${t.id}">${esc(t.label())}</button>`).join('')}</div><div class="dly-body"></div>`;
    root.querySelectorAll('.dly-tabs button').forEach((b) => { b.onclick = () => { App.delayTab = b.dataset.t; App.renderDelayWin(el); }; });
    const body = root.querySelector('.dly-body');
    try { cur.render(body, () => App.renderDelayWin(el)); } catch (e) { console.error(e); body.innerHTML = `<p class="cmp-bad">${esc(String(e.message || e))}</p>`; }
  };
  App.openDelay = function (tab) { if (tab) App.delayTab = tab; App.openWin('delay'); if (App.win === 'delay') App.renderWin(); };
  D2.save = () => App.scheduleSave();
  D2.refresh = () => { if (App.win === 'delay') App.renderWin(); };
})(window);

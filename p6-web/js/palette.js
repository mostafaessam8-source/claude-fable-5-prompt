/* P6 Web – Command Palette (Ctrl+K): one box to run any menu command, open any window, jump to an activity, WBS or resource. */
(function (g) {
  'use strict';
  const P6 = g.P6, App = g.App;
  const esc = P6.esc, t = (k) => P6.t(k);
  const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[ً-ٰٟ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
  const clean = (s) => String(s || '').replace(/…|\.\.\./g, '').trim();
  let ov = null, items = [], sel = 0, recent = [];
  try { recent = JSON.parse(localStorage.getItem('p6web.recentCmd') || '[]'); } catch (e) { recent = []; }

  function commands() {
    const out = [], seen = new Set();
    const add = (cat, label, hint, fn, key) => { label = clean(label); if (!label || seen.has(cat + label)) return; seen.add(cat + label); out.push({ cat, label, hint: hint || '', fn, key: key || cat + ':' + label, n: norm(label) }); };
    let defs = []; try { defs = App.menuDefs ? App.menuDefs() : []; } catch (e) { defs = []; }
    for (const [mid, list] of defs) {
      const mname = t('m_' + mid);
      for (const it of list) {
        if (it === '-' || !it) continue;
        if (Array.isArray(it)) {
          const lab = t(it[0]);
          if (it[4]) { for (const s of it[4]) { if (s && s !== '-' && s.l && s.fn && !s.dis && !s.sub) add('Command', lab + ' › ' + s.l, mname, s.fn); } }
          else if (it[1] && !it[5]) add('Command', lab, mname + (it[2] ? '  ' + it[2] : ''), it[1]);
        }
      }
    }
    for (const w of Object.keys(App.WINS || {})) add('Window', t(App.WINS[w].title), 'Open window', () => App.openWin(w));
    add('Command', B('Toggle full screen', 'ملء الشاشة'), 'F11', () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); });
    add('Command', B('Switch theme', 'تغيير الثيم'), 'View', () => document.getElementById('themeBtn') && document.getElementById('themeBtn').click());
    add('Command', B('Switch language', 'تغيير اللغة'), 'View', () => document.getElementById('langBtn') && document.getElementById('langBtn').click());
    return out;
  }
  const B = (en, ar) => (App.cfg.lang === 'ar' ? ar : en);

  function search(q) {
    const nq = norm(q).trim(), res = [];
    const cmds = commands();
    if (!nq) { const r = recent.map((k) => cmds.find((c) => c.key === k)).filter(Boolean); return (r.length ? r : cmds.filter((c) => c.cat === 'Window')).slice(0, 12).map((c) => Object.assign({}, c, { cat: r.length ? 'Recent' : c.cat })); }
    const toks = nq.split(/\s+/);
    for (const c of cmds) {
      if (!toks.every((k) => c.n.includes(k))) continue;
      const score = (c.n.startsWith(nq) ? 100 : c.n.includes(nq) ? 60 : 30) - c.n.length * 0.1 + (recent.includes(c.key) ? 20 : 0);
      res.push(Object.assign({ score }, c));
    }
    if (App.p && nq.length >= 2) {
      let n = 0;
      for (const tk of App.p.tasks) {
        const a = norm(tk.code), b = norm(tk.name);
        if (toks.every((k) => a.includes(k) || b.includes(k))) { res.push({ cat: 'Activity', label: tk.code + ' – ' + tk.name, hint: P6.fmtDate(tk.es) + ' → ' + P6.fmtDate(tk.ef) + (tk.crit ? ' · critical' : ''), score: 40 + (a === nq ? 50 : a.startsWith(nq) ? 25 : 0), key: 'a:' + tk.id, fn: () => { App.showWin('activities'); setTimeout(() => { const k = 't' + tk.id; if (!App.rowIdx.has(k)) return App.toast(B('Hidden by the current filter', 'مخفي بالفلتر الحالي'), true); App.setSel([k]); App.ensureVisible(App.rowIdx.get(k)); }, 60); } }); if (++n >= 25) break; }
      }
      let m = 0;
      for (const w of App.p.wbs) { if (toks.every((k) => norm(w.name).includes(k) || norm(w.code).includes(k))) { res.push({ cat: 'WBS', label: (w.code ? w.code + ' – ' : '') + w.name, hint: 'WBS', score: 35, key: 'w:' + w.id, fn: () => { App.showWin('activities'); setTimeout(() => { const k = 'w' + w.id; if (!App.rowIdx.has(k)) return App.toast(B('Hidden by the current layout', 'مخفي بالتخطيط الحالي'), true); App.setSel([k]); App.ensureVisible(App.rowIdx.get(k)); }, 60); } }); if (++m >= 8) break; } }
      for (const r of App.p.rsrc) if (toks.every((k) => norm(r.name).includes(k))) res.push({ cat: 'Resource', label: r.name, hint: 'Resource', score: 30, key: 'r:' + r.id, fn: () => { App.wsel.resources = String(r.id); App.openWin('resources'); } });
    }
    return res.sort((a, b) => b.score - a.score).slice(0, 40);
  }

  function draw() {
    const list = ov.querySelector('.pal-list');
    list.innerHTML = items.length ? items.map((c, i) => `<div class="pal-it${i === sel ? ' on' : ''}" data-i="${i}"><span class="pal-cat pal-${c.cat}">${esc(c.cat)}</span><span class="pal-lb">${esc(c.label)}</span><span class="pal-h">${esc(c.hint)}</span></div>`).join('') : `<div class="pal-empty">${esc(B('No matches', 'لا توجد نتائج'))}</div>`;
    const on = list.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' });
  }
  function run(c) {
    close(); if (!c || !c.fn) return;
    recent = [c.key].concat(recent.filter((k) => k !== c.key)).slice(0, 8); try { localStorage.setItem('p6web.recentCmd', JSON.stringify(recent)); } catch (e) { /* ignore */ }
    setTimeout(() => { try { c.fn(); } catch (e) { App.toast(String(e.message || e), true); } }, 30);
  }
  function close() { if (ov) { ov.remove(); ov = null; } }
  App.openPalette = function () {
    if (ov) return close();
    ov = document.createElement('div'); ov.id = 'pal'; ov.dir = App.cfg.lang === 'ar' ? 'rtl' : 'ltr';
    ov.innerHTML = `<div class="pal-box"><input class="pal-in" placeholder="${esc(B('Type a command, activity ID or name, WBS, resource…', 'اكتب أمراً أو رقم/اسم نشاط أو WBS أو مورداً…'))}" autocomplete="off" spellcheck="false"><div class="pal-list"></div><div class="pal-foot">${esc(B('↑↓ navigate · Enter run · Esc close', '↑↓ تنقل · Enter تنفيذ · Esc إغلاق'))}</div></div>`;
    document.body.appendChild(ov);
    const inp = ov.querySelector('.pal-in'); items = search(''); sel = 0; draw(); inp.focus();
    inp.oninput = () => { items = search(inp.value); sel = 0; draw(); };
    inp.onkeydown = (e) => {
      if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); draw(); e.preventDefault(); } else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
      else if (e.key === 'Enter') { run(items[sel]); e.preventDefault(); } else if (e.key === 'Escape') { close(); e.preventDefault(); }
    };
    ov.addEventListener('mousedown', (e) => { const it = e.target.closest('.pal-it'); if (it) { run(items[+it.dataset.i]); e.preventDefault(); } else if (e.target === ov) close(); });
    ov.addEventListener('mousemove', (e) => { const it = e.target.closest('.pal-it'); if (it && +it.dataset.i !== sel) { sel = +it.dataset.i; ov.querySelectorAll('.pal-it').forEach((x, i) => x.classList.toggle('on', i === sel)); } });
  };
  addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK' && !e.shiftKey && !e.altKey) { if (!App.p) return; e.preventDefault(); e.stopImmediatePropagation(); App.openPalette(); }
  }, true);
  // visible entry point in the top bar
  const ensure = () => { const hd = document.getElementById('topbar'); if (!hd || document.getElementById('palBtn')) return; const b = document.createElement('button'); b.id = 'palBtn'; b.type = 'button'; b.title = 'Ctrl+K'; b.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M15 15l6 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg><span>Search anything</span><kbd>Ctrl K</kbd>'; b.onclick = App.openPalette; const sp = hd.querySelector('.spacer'); if (sp) sp.before(b); else hd.appendChild(b); };
  document.addEventListener('DOMContentLoaded', ensure); setTimeout(ensure, 300); setTimeout(ensure, 1500);
})(window);

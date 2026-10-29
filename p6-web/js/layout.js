/* P6 Web – arrange menus & toolbars (like P6's movable toolbars): View ▸ Arrange Menus & Toolbars (or right-click a bar) enters an arrange mode where
   every menu, every toolbar button / divider / box and every side-bar button can be dragged to a new place. Click an item to get ◀ ▶ (move one step),
   ✕ (hide) and ＋ (restore). The toolbar can dock at the top or the bottom. The layout is saved in the user's settings (cfg.ui) and re-applied whenever
   the bars are rebuilt. */
(function (g) {
  'use strict';
  const P6 = g.P6, App = g.App, B = (en, ar) => (P6.dir() === 'rtl' ? ar : en);
  const CONT = [{ id: 'menubar', sel: '#menubar', v: false }, { id: 'toolbar', sel: '#toolbar', v: false, rows: true }, { id: 'sideL', sel: '#sideL', v: true }, { id: 'sideR', sel: '#sideR', v: true }];
  const VER = 3;
  const UI = () => {
    const c = App.cfg; c.ui = Object.assign({ order: {}, hidden: {}, tbBottom: false, ver: 0 }, c.ui);
    if (c.ui.ver !== VER) { c.ui.order = {}; c.ui.hidden = {}; c.ui.ver = VER; }
    c.ui.order = c.ui.order || {}; c.ui.hidden = c.ui.hidden || {}; return c.ui;
  };
  const isSep = (n) => n.classList.contains('sep') || n.tagName === 'HR';
  let guard = false, arrange = false, drag = null, sel = null;
  const endGuard = () => { guard = false; CONT.forEach((c) => { const el = document.querySelector(c.sel); if (el && el.__arrObs) el.__arrObs.takeRecords(); }); };

  /* every child is a unit: [{ key, node }] with a stable key cached on first sight (bars are rebuilt in their pristine order) */
  function units(c, el) {
    const kids = [...el.children]; let sIdx = 0, sepIdx = 0;
    return kids.map((n, i) => {
      if (n.__gk) { if (n.classList.contains('split')) sIdx++; if (isSep(n)) sepIdx++; return { key: n.__gk, node: n }; }
      const key = n.classList.contains('menu') ? 'm:' + n.dataset.id : n.classList.contains('dly-top') ? 'x:dly' : n.classList.contains('dsh-top') ? 'x:dash' : n.id ? 'i:' + n.id : n.classList.contains('sbox') ? 'search' : n.classList.contains('split') ? 's#' + sIdx++ : isSep(n) ? 'sep#' + sepIdx++ : n.dataset.act ? 'a:' + n.dataset.act : 'g#' + i;
      n.__gk = key; return { key, node: n };
    });
  }

  function applyOne(c) {
    const el = document.querySelector(c.sel); if (!el) return;
    const ui = UI(), saved = ui.order[c.id] || [], hid = new Set(ui.hidden[c.id] || []);
    if (c.rows) { saved.filter((k) => /^brk#/.test(k)).forEach((k) => { if (![...el.children].some((n) => n.__gk === k)) { const b = document.createElement('i'); b.className = 'arr-brk'; b.__gk = k; guard = true; el.appendChild(b); endGuard(); } }); }
    const us = units(c, el), rank = new Map(saved.map((k, i) => [k, i]));
    const ord = us.map((x, i) => ({ x, i })).sort((a, b) => (rank.has(a.x.key) ? rank.get(a.x.key) : 1e6 + a.i) - (rank.has(b.x.key) ? rank.get(b.x.key) : 1e6 + b.i)).map((o) => o.x);
    const have = [...el.children];
    if (ord.some((x, i) => have[i] !== x.node)) { guard = true; ord.forEach((x) => el.appendChild(x.node)); endGuard(); }
    guard = true;
    if (c.rows) el.classList.toggle('multi', us.some((x) => /^brk#/.test(x.key)));
    us.forEach((x) => { x.node.classList.toggle('arr-hid', hid.has(x.key)); x.node.dataset.ag = x.key; x.node.dataset.c = c.id; if (arrange) x.node.draggable = true; else x.node.removeAttribute('draggable'); x.node.classList.toggle('arr-sel', !!(arrange && sel && sel.c === c.id && sel.key === x.key)); });
    endGuard();
  }
  const save = (c) => { const el = document.querySelector(c.sel); if (el) { UI().order[c.id] = units(c, el).map((x) => x.key); App.saveCfg(); } };
  const applyAll = () => { CONT.forEach(applyOne); document.getElementById('app').classList.toggle('tb-bottom', !!UI().tbBottom); if (arrange) popover(); };
  App.applyLayout = applyAll;

  let pend = 0;
  const schedule = () => { if (guard || pend) return; pend = requestAnimationFrame(() => { pend = 0; applyAll(); }); };
  function observe() { CONT.forEach((c) => { const el = document.querySelector(c.sel); if (el && !el.__arrObs) { el.__arrObs = new MutationObserver(() => schedule()); el.__arrObs.observe(el, { childList: true }); } }); }

  // ----- selection popover: ◀ ▶ ✕ (lives on <body>, not inside the bars) -----
  function popover() {
    let pop = document.getElementById('arrPop'); if (pop) pop.remove();
    if (!arrange || !sel) return;
    const c = CONT.find((x) => x.id === sel.c), el = document.querySelector(c.sel), n = el && [...el.children].find((k) => k.__gk === sel.key); if (!n) return;
    const isBrk = /^brk#/.test(sel.key), hid = (UI().hidden[c.id] || []).includes(sel.key), a = c.v ? ['▲', '▼'] : ['◀', '▶'], r = n.getBoundingClientRect();
    pop = document.createElement('div'); pop.id = 'arrPop'; pop.dir = 'ltr';
    pop.innerHTML = `<b class="mv" data-d="-1">${a[0]}</b><b class="mv" data-d="1">${a[1]}</b>${isBrk ? '' : c.rows ? `<b class="row">↵ ${B('New row from here', 'صف جديد من هنا')}</b>` : ''}<b class="x">${isBrk ? '✕ ' + B('Remove row break', 'إزالة فاصل الصف') : hid ? '＋ ' + B('Show', 'إظهار') : '✕ ' + B('Hide', 'إخفاء')}</b>`;
    document.body.appendChild(pop);
    const w = pop.offsetWidth; pop.style.left = Math.max(2, Math.min(innerWidth - w - 2, r.left + r.width / 2 - w / 2)) + 'px'; pop.style.top = Math.min(innerHeight - 30, r.bottom + 4) + 'px';
  }

  function moveSel(visual) {
    const c = CONT.find((x) => x.id === sel.c), el = document.querySelector(c.sel), us = units(c, el), i = us.findIndex((x) => x.key === sel.key); if (i < 0) return;
    const rtl = !c.v && getComputedStyle(el).direction === 'rtl', dom = rtl ? -visual : visual, j = i + dom; if (j < 0 || j >= us.length) return;
    guard = true; el.insertBefore(us[i].node, dom < 0 ? us[j].node : us[j].node.nextSibling); endGuard(); save(c); applyAll();
  }

  function addBreak() {
    const c = CONT.find((x) => x.id === sel.c), el = document.querySelector(c.sel), n = [...el.children].find((k) => k.__gk === sel.key); if (!n) return;
    const b = document.createElement('i'); b.className = 'arr-brk'; b.__gk = 'brk#' + Date.now(); guard = true; el.insertBefore(b, n); endGuard(); sel = { c: c.id, key: b.__gk }; save(c); applyAll();
  }
  function removeBreak() {
    const c = CONT.find((x) => x.id === sel.c), el = document.querySelector(c.sel), n = [...el.children].find((k) => k.__gk === sel.key); if (n) { guard = true; n.remove(); endGuard(); } sel = null; save(c); applyAll(); const pop = document.getElementById('arrPop'); if (pop && !sel) pop.remove();
  }
  App.twoRowToolbar = function () {
    const c = CONT[1], el = document.querySelector(c.sel), us = units(c, el); us.filter((x) => /^brk#/.test(x.key)).forEach((x) => x.node.remove());
    const at = us.find((x) => x.key === 'search'); if (!at) return; const b = document.createElement('i'); b.className = 'arr-brk'; b.__gk = 'brk#' + Date.now(); guard = true; el.insertBefore(b, at.node); endGuard(); save(c); applyAll();
  };

  function panel() {
    let p = document.getElementById('arrPanel'); if (p) p.remove(); if (!arrange) return;
    p = document.createElement('div'); p.id = 'arrPanel'; p.dir = P6.dir();
    p.innerHTML = `<b>⠿ ${B('Arrange mode', 'وضع الترتيب')}</b><span>${B('Drag any menu / button to a new place, or click it: ◀ ▶ move, ↵ starts a new toolbar row from it, ✕ hides.', 'اسحب أي قائمة / زرار لمكان جديد، أو اضغط عليه: ◀ ▶ تحريك، ↵ يبدأ صفاً جديداً من عنده، ✕ إخفاء.')}</span><button class="btn" id="arrRows">${B('Two-row toolbar', 'شريط أدوات بصفين')}</button><button class="btn" id="arrPos">${UI().tbBottom ? B('Toolbar: bottom', 'شريط الأدوات: أسفل') : B('Toolbar: top', 'شريط الأدوات: أعلى')}</button><button class="btn" id="arrRst">${B('Reset layout', 'إعادة الترتيب الافتراضي')}</button><button class="btn pri" id="arrDone">${B('Done', 'تم')}</button>`;
    document.body.appendChild(p);
    p.querySelector('#arrRows').onclick = () => App.twoRowToolbar();
    p.querySelector('#arrDone').onclick = () => App.arrangeMode(false);
    p.querySelector('#arrPos').onclick = () => { UI().tbBottom = !UI().tbBottom; App.saveCfg(); applyAll(); panel(); };
    p.querySelector('#arrRst').onclick = () => App.resetLayout();
  }

  App.arrangeMode = function (on) {
    arrange = on === undefined ? !arrange : !!on; sel = null;
    document.body.classList.toggle('arr-mode', arrange);
    document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open'));
    applyAll(); panel(); if (!arrange) { const pop = document.getElementById('arrPop'); if (pop) pop.remove(); }
  };
  App.resetLayout = function () { const ui = UI(); ui.order = {}; ui.hidden = {}; ui.tbBottom = false; App.saveCfg(); sel = null; if (App.buildMenus) App.buildMenus(); if (App.buildToolbar) App.buildToolbar(); applyAll(); if (arrange) panel(); App.toast(B('Layout reset', 'تمت إعادة الترتيب الافتراضي')); };

  // ----- drag & drop of the items themselves -----
  document.addEventListener('dragstart', (e) => { if (!arrange) return; const n = e.target.closest && e.target.closest('[data-ag]'); if (!n) return; drag = { c: n.dataset.c, key: n.dataset.ag }; sel = { c: n.dataset.c, key: n.dataset.ag }; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', n.dataset.ag); } catch (er) { /* ignore */ } n.classList.add('drag'); });
  document.addEventListener('dragend', () => { drag = null; document.querySelectorAll('.drag').forEach((h) => h.classList.remove('drag')); document.querySelectorAll('.arr-before,.arr-after').forEach((n) => n.classList.remove('arr-before', 'arr-after')); applyAll(); });
  const targetOf = (e) => { const n = e.target.closest && e.target.closest('[data-ag]'); return n && drag && n.dataset.c === drag.c ? n : null; };
  const beforeOf = (n, e) => { const c = CONT.find((x) => x.id === n.dataset.c), r = n.getBoundingClientRect(); if (c.v) return e.clientY < r.top + r.height / 2; const rtl = getComputedStyle(n.parentElement).direction === 'rtl'; return rtl ? e.clientX > r.left + r.width / 2 : e.clientX < r.left + r.width / 2; };
  document.addEventListener('dragover', (e) => {
    if (!arrange || !drag) return;
    { const c0 = CONT.find((x) => x.id === drag.c), el0 = c0 && document.querySelector(c0.sel); if (el0) { const r = el0.getBoundingClientRect(); if (c0.v) { if (e.clientY < r.top + 30) el0.scrollTop -= 18; else if (e.clientY > r.bottom - 30) el0.scrollTop += 18; } else if (e.clientX < r.left + 40) el0.scrollLeft -= 20; else if (e.clientX > r.right - 40) el0.scrollLeft += 20; } }
    const n = targetOf(e); if (!n) return; e.preventDefault();
    document.querySelectorAll('.arr-before,.arr-after').forEach((x) => x.classList.remove('arr-before', 'arr-after')); n.classList.add(beforeOf(n, e) ? 'arr-before' : 'arr-after');
  });
  document.addEventListener('drop', (e) => {
    if (!arrange || !drag) return; const n = targetOf(e); if (!n || n.dataset.ag === drag.key) return; e.preventDefault();
    const c = CONT.find((x) => x.id === drag.c), el = document.querySelector(c.sel), us = units(c, el), mv = us.find((x) => x.key === drag.key); if (!mv) return;
    guard = true; el.insertBefore(mv.node, beforeOf(n, e) ? n : n.nextSibling); endGuard(); save(c); applyAll();
  });

  // ----- click: select an item (instead of running it) / popover actions -----
  document.addEventListener('click', (e) => {
    if (!arrange) return;
    const pb = e.target.closest && e.target.closest('#arrPop b');
    if (pb) {
      if (pb.classList.contains('mv')) moveSel(+pb.dataset.d);
      else if (pb.classList.contains('row')) addBreak();
      else if (/^brk#/.test(sel.key)) removeBreak();
      else { const ui = UI(), set = new Set(ui.hidden[sel.c] || []); if (set.has(sel.key)) set.delete(sel.key); else set.add(sel.key); ui.hidden[sel.c] = [...set]; App.saveCfg(); applyAll(); }
      e.preventDefault(); e.stopPropagation(); return;
    }
    if (e.target.closest('#arrPanel')) return;
    const n = e.target.closest && e.target.closest('[data-ag]');
    if (n) { sel = { c: n.dataset.c, key: n.dataset.ag }; applyAll(); e.preventDefault(); e.stopPropagation(); return; }
    if (e.target.closest('#menubar,#toolbar,#sideL,#sideR,#projBtn,#langBtn,#themeBtn')) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  // right-click on a bar: quick access
  document.addEventListener('contextmenu', (e) => {
    const bar = e.target.closest && e.target.closest('#menubar,#toolbar,#sideL,#sideR'); if (!bar || arrange || !App.popMenu) return;
    e.preventDefault();
    App.popMenu([{ l: B('Arrange menus & toolbars…', 'ترتيب القوائم والأشرطة…'), fn: () => App.arrangeMode(true) }, { l: B('Reset layout', 'إعادة الترتيب الافتراضي'), fn: () => App.resetLayout() }], e.clientX, e.clientY);
  });

  // View menu entries
  const base = App.menuDefs;
  App.menuDefs = function () {
    const defs = base ? base.apply(App, arguments) : [];
    try { const v = defs.find((d) => d[0] === 'view'); if (v && !v[1].some((i) => Array.isArray(i) && i[0] === 'mi_arrange')) v[1].push('-', ['mi_arrange', () => App.arrangeMode(true)], ['mi_arrange_reset', () => App.resetLayout()]); } catch (e) { /* ignore */ }
    return defs;
  };

  function init() { observe(); applyAll(); setTimeout(() => { observe(); applyAll(); }, 800); setTimeout(applyAll, 2500); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0)); else setTimeout(init, 0);
})(window);

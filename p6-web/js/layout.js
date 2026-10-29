/* P6 Web – arrange menus & toolbars (like P6's movable toolbars): View ▸ Arrange Menus & Toolbars (or right-click a bar) enters an arrange mode where
   every menu, toolbar group and side-bar group gets a ⠿ handle: drag it to move, ✕ to hide (＋ to bring back). Toolbar can dock at the top or the bottom.
   The layout is saved in the user's settings (cfg.ui) and re-applied whenever the bars are rebuilt. */
(function (g) {
  'use strict';
  const P6 = g.P6, App = g.App, B = (en, ar) => (P6.dir() === 'rtl' ? ar : en);
  const CONT = [{ id: 'menubar', sel: '#menubar', v: false, each: true }, { id: 'toolbar', sel: '#toolbar', v: false }, { id: 'sideL', sel: '#sideL', v: true }, { id: 'sideR', sel: '#sideR', v: true }];
  const UI = () => { const c = App.cfg; c.ui = Object.assign({ order: {}, hidden: {}, tbBottom: false }, c.ui); c.ui.order = c.ui.order || {}; c.ui.hidden = c.ui.hidden || {}; return c.ui; };
  const isSep = (n) => n.classList.contains('sep') || n.tagName === 'HR';
  let guard = false, arrange = false, drag = null;
  const endGuard = () => { guard = false; CONT.forEach((c) => { const el = document.querySelector(c.sel); if (el && el.__arrObs) el.__arrObs.takeRecords(); }); };

  /* group the children of a container: [{ key, nodes }] */
  function groups(c, el) {
    const kids = [...el.children].filter((n) => !n.classList.contains('arr-h')), out = []; let cur = null, sIdx = 0;
    const keyOf = (n, i) => (n.classList.contains('menu') ? 'm:' + n.dataset.id : n.classList.contains('dly-top') ? 'x:dly' : n.classList.contains('dsh-top') ? 'x:dash' : n.id ? 'i:' + n.id : n.classList.contains('sbox') ? 'search' : n.classList.contains('split') ? 's#' + sIdx++ : n.dataset.act ? 'a:' + n.dataset.act : 'g#' + i);
    kids.forEach((n, i) => {
      if (c.each || n.classList.contains('split') || n.classList.contains('sbox')) { cur = null; out.push({ key: keyOf(n, i), nodes: [n] }); return; }
      if (isSep(n)) { if (cur) cur.nodes.push(n); else { cur = { key: 'g#' + i, nodes: [n] }; out.push(cur); } cur = null; return; }
      if (!cur) { cur = { key: keyOf(n, i), nodes: [] }; out.push(cur); }
      cur.nodes.push(n);
    });
    out.forEach((x) => { x.key = x.nodes[0].__gk || (x.nodes[0].__gk = x.key); });
    return out;
  }

  function applyOne(c) {
    const el = document.querySelector(c.sel); if (!el) return;
    const ui = UI(), saved = ui.order[c.id] || [], hid = new Set(ui.hidden[c.id] || []), gs = groups(c, el);
    const rank = new Map(saved.map((k, i) => [k, i]));
    const ord = gs.map((x, i) => ({ x, i })).sort((a, b) => (rank.has(a.x.key) ? rank.get(a.x.key) : 1e6 + a.i) - (rank.has(b.x.key) ? rank.get(b.x.key) : 1e6 + b.i)).map((o) => o.x);
    const want = ord.flatMap((x) => x.nodes), have = [...el.children].filter((n) => !n.classList.contains('arr-h'));
    if (want.some((n, i) => have[i] !== n)) { guard = true; want.forEach((n) => el.appendChild(n)); endGuard(); }
    guard = true;
    gs.forEach((x) => x.nodes.forEach((n) => { n.classList.toggle('arr-hid', hid.has(x.key)); n.dataset.ag = x.key; }));
    endGuard();
  }

  function decorate() {
    document.querySelectorAll('.arr-h').forEach((h) => h.remove());
    CONT.forEach((c) => {
      const el = document.querySelector(c.sel); if (!el) return;
      const hid = new Set(UI().hidden[c.id] || []);
      guard = true;
      groups(c, el).forEach((x) => {
        const h = document.createElement('span'); h.className = 'arr-h' + (c.v ? ' v' : ''); h.draggable = true; h.dataset.ag = x.key; h.dataset.c = c.id;
        const isH = hid.has(x.key);
        h.innerHTML = `<i title="${B('Drag to move', 'اسحب للتحريك')}">⠿</i><b title="${isH ? B('Show', 'إظهار') : B('Hide', 'إخفاء')}">${isH ? '＋' : '✕'}</b>`;
        el.insertBefore(h, x.nodes[0]);
        x.nodes.forEach((n) => { n.dataset.c = c.id; });
      });
      endGuard();
    });
  }

  function save(c) {
    const el = document.querySelector(c.sel); if (!el) return;
    UI().order[c.id] = groups(c, el).map((x) => x.key); App.saveCfg();
  }
  const applyAll = () => { CONT.forEach(applyOne); if (arrange) decorate(); document.getElementById('app').classList.toggle('tb-bottom', !!UI().tbBottom); };
  App.applyLayout = applyAll;

  // re-apply after any rebuild of the bars
  let pend = 0;
  const schedule = () => { if (guard || pend) return; pend = requestAnimationFrame(() => { pend = 0; applyAll(); }); };
  function observe() { CONT.forEach((c) => { const el = document.querySelector(c.sel); if (el && !el.__arrObs) { el.__arrObs = new MutationObserver(() => schedule()); el.__arrObs.observe(el, { childList: true }); } }); }

  function panel() {
    let p = document.getElementById('arrPanel'); if (p) p.remove(); if (!arrange) return;
    p = document.createElement('div'); p.id = 'arrPanel'; p.dir = P6.dir();
    p.innerHTML = `<b>⠿ ${B('Arrange mode', 'وضع الترتيب')}</b><span>${B('Drag the ⠿ handles to move menus / toolbar groups, ✕ hides, ＋ restores.', 'اسحب مقابض ⠿ لتحريك القوائم ومجموعات الأزرار، ✕ للإخفاء، ＋ للاستعادة.')}</span><button class="btn" id="arrPos">${UI().tbBottom ? B('Toolbar: bottom', 'شريط الأدوات: أسفل') : B('Toolbar: top', 'شريط الأدوات: أعلى')}</button><button class="btn" id="arrRst">${B('Reset layout', 'إعادة الترتيب الافتراضي')}</button><button class="btn pri" id="arrDone">${B('Done', 'تم')}</button>`;
    document.body.appendChild(p);
    p.querySelector('#arrDone').onclick = () => App.arrangeMode(false);
    p.querySelector('#arrPos').onclick = () => { UI().tbBottom = !UI().tbBottom; App.saveCfg(); applyAll(); panel(); };
    p.querySelector('#arrRst').onclick = () => App.resetLayout();
  }

  App.arrangeMode = function (on) {
    arrange = on === undefined ? !arrange : !!on;
    document.body.classList.toggle('arr-mode', arrange);
    if (typeof App.closeMenus === 'function') App.closeMenus();
    document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open'));
    if (arrange) decorate(); else document.querySelectorAll('.arr-h').forEach((h) => h.remove());
    panel();
  };
  App.resetLayout = function () { const ui = UI(); ui.order = {}; ui.hidden = {}; ui.tbBottom = false; App.saveCfg(); if (App.buildMenus) App.buildMenus(); if (App.buildToolbar) App.buildToolbar(); applyAll(); if (arrange) panel(); App.toast(B('Layout reset', 'تمت إعادة الترتيب الافتراضي')); };

  // ----- drag & drop -----
  document.addEventListener('dragstart', (e) => { const h = e.target.closest && e.target.closest('.arr-h'); if (!h || !arrange) return; drag = { c: h.dataset.c, key: h.dataset.ag }; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', h.dataset.ag); } catch (er) { /* ignore */ } h.classList.add('drag'); });
  document.addEventListener('dragend', () => { drag = null; document.querySelectorAll('.arr-h.drag').forEach((h) => h.classList.remove('drag')); document.querySelectorAll('.arr-before,.arr-after').forEach((n) => n.classList.remove('arr-before', 'arr-after')); });
  const targetOf = (e) => { const n = e.target.closest && e.target.closest('[data-ag]'); return n && drag && n.dataset.c === drag.c ? n : null; };
  const beforeOf = (n, e) => { const c = CONT.find((x) => x.id === n.dataset.c), r = n.getBoundingClientRect(); if (c.v) return e.clientY < r.top + r.height / 2; const rtl = getComputedStyle(n.parentElement).direction === 'rtl'; return rtl ? e.clientX > r.left + r.width / 2 : e.clientX < r.left + r.width / 2; };
  document.addEventListener('dragover', (e) => { if (!arrange || !drag) return; const n = targetOf(e); if (!n) return; e.preventDefault(); document.querySelectorAll('.arr-before,.arr-after').forEach((x) => x.classList.remove('arr-before', 'arr-after')); n.classList.add(beforeOf(n, e) ? 'arr-before' : 'arr-after'); });
  document.addEventListener('drop', (e) => {
    if (!arrange || !drag) return; const n = targetOf(e); if (!n || n.dataset.ag === drag.key) return; e.preventDefault();
    const c = CONT.find((x) => x.id === drag.c), el = document.querySelector(c.sel), gs = groups(c, el), mv = gs.find((x) => x.key === drag.key), tg = gs.find((x) => x.key === n.dataset.ag); if (!mv || !tg) return;
    const before = beforeOf(n, e), hMv = el.querySelector(`.arr-h[data-ag="${CSS.escape(mv.key)}"]`), anchor = before ? el.querySelector(`.arr-h[data-ag="${CSS.escape(tg.key)}"]`) : tg.nodes[tg.nodes.length - 1].nextSibling;
    guard = true; [hMv, ...mv.nodes].forEach((x) => el.insertBefore(x, anchor)); endGuard();
    save(c); applyAll();
  });
  document.addEventListener('click', (e) => {
    if (!arrange) return;
    const b = e.target.closest && e.target.closest('.arr-h b');
    if (b) { const h = b.parentElement, ui = UI(), c = h.dataset.c, set = new Set(ui.hidden[c] || []); if (set.has(h.dataset.ag)) set.delete(h.dataset.ag); else set.add(h.dataset.ag); ui.hidden[c] = [...set]; App.saveCfg(); applyAll(); e.preventDefault(); e.stopPropagation(); return; }
    if (e.target.closest('#arrPanel')) return;
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
  void P6;
})(window);

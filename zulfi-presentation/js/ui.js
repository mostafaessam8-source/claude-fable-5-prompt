/* Presentation shell: state, navigation, filters, full-screen, print, drawer, tooltip. */
(function (G) {
  const Z = G.Z, F = Z.F, dt = Z.dt;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const KEY = G.ZMODE ? 'zulfi-mgmt-v1' : 'zulfi-presentation-v1';
  const W = 1600, H = 900;

  const A = (Z.app = {
    slides: [], actions: {}, changes: {}, drawers: {},
    s: { st: null, M: null, slide: 0, drawer: null, f: { phase: 'all', epc: [], group: 'all', ll: false, crit: false, chg: false, q: '' }, ui: {} },
    scale: 1, dirty: new Set(),
  });
  Z.registerSlide = (def) => A.slides.push(def);
  /* ---- optional "deck" mode (management.html): own slide order, Arabic/English switch, deletable slides ---- */
  const MODE = G.ZMODE || null; A.mode = MODE;
  const LKEY = 'zulfi-lang-v1', HKEY = 'zulfi-hidden-v1';
  A.lang = 'en';
  if (MODE) { A.lang = MODE.lang || 'en'; try { const l = localStorage.getItem(LKEY); if (l === 'ar' || l === 'en') A.lang = l; } catch (e) { /* ignore */ } }
  A.isAr = () => A.lang === 'ar';
  A.asset = (n) => (G.ZASSETS && G.ZASSETS[n]) || 'assets/' + n;
  A.L = (en, ar) => (A.lang === 'ar' ? ar : en);
  A.tr = (h) => (MODE && MODE.translate && A.lang === 'ar' && Z.i18n ? Z.i18n.html(h) : h);
  A.hidden = new Set(); try { if (MODE) JSON.parse(localStorage.getItem(HKEY) || '[]').forEach((x) => A.hidden.add(x)); } catch (e) { /* ignore */ }
  A.saveHidden = () => { try { localStorage.setItem(HKEY, JSON.stringify([...A.hidden])); } catch (e) { /* ignore */ } };
  A.isGone = (i) => !!(A.slides[i] && A.hidden.has(A.slides[i].id));
  A.visIdx = () => A.slides.map((_, i) => i).filter((i) => !A.isGone(i));
  A.icons = {
    prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
    full: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    exit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>',
    print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M7 14h10v7H7z"/></svg>',
    reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
    pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 6h16M4 12h10M4 18h16"/></svg>',
    filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18l-7 8v6l-4-2v-4z"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  };

  /* ------------------------------------------------------------ filters */
  A.vis = (a) => {
    const f = A.s.f;
    if (f.phase !== 'all' && a.phase !== f.phase) return false;
    if (f.epc.length && !f.epc.includes(a.epc)) return false;
    if (f.group !== 'all' && a.group !== f.group) return false;
    if (f.ll && !a.ll) return false;
    if (f.crit && !a.critical) return false;
    if (f.chg && !a.changed) return false;
    if (f.q) { const q = f.q.toLowerCase(); if (!(a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || a.desc.toLowerCase().includes(q))) return false; }
    return true;
  };
  A.filtered = () => { const f = A.s.f; return f.phase !== 'all' || f.epc.length || f.group !== 'all' || f.ll || f.crit || f.chg || !!f.q; };
  A.visList = () => A.s.M.acts.filter(A.vis);

  A.renderFilters = () => {
    const f = A.s.f, M = A.s.M, vis = A.visList();
    const sum = vis.reduce((s, a) => s + a.amount, 0);
    $('#fDyn').innerHTML =
      `<span class="lbl">Phase</span><span class="seg">${['all', 'Phase 1', 'Phase 2'].map((p) => `<button data-fphase="${p}" class="${f.phase === p ? 'on' : ''}">${p === 'all' ? 'All' : p}</button>`).join('')}</span>
       <span class="sep"></span><span class="lbl">EPC</span>${Z.EPC.map((e) => `<button class="chip ${f.epc.includes(e.key) ? 'on' : ''}" data-fepc="${e.key}"><i style="background:${F.epcColor(e.key)}"></i>${e.key === 'GEN' ? 'General' : e.key === 'ENG' ? 'Engineering' : e.key === 'PROC' ? 'Procurement' : 'Construction'}</button>`).join('')}
       <span class="sep"></span><span class="lbl">WBS</span><select class="f-select" id="fGroup"><option value="all">All groups</option>${Z.GROUPS.map((g) => `<option value="${g.code}" ${f.group === g.code ? 'selected' : ''}>${g.code.replace('.0', '')} · ${F.esc(g.name)}</option>`).join('')}</select>
       <button class="chip ${f.ll ? 'on' : ''}" data-ftog="ll">Long-lead</button><button class="chip ${f.crit ? 'on' : ''}" data-ftog="crit">Critical path</button><button class="chip ${f.chg ? 'on' : ''}" data-ftog="chg">Changed</button>`;
    $('#fCount').innerHTML = `<b>${vis.length}</b> of ${M.acts.length} activities · ${F.sar(sum)}`;
    $('#fReset').style.display = A.filtered() ? '' : 'none';
  };

  /* ----------------------------------------------------------- compute */
  A.save = () => {
    try { localStorage.setItem(KEY, JSON.stringify({ ser: Z.serialize(A.s.st), slide: A.s.slide, f: A.s.f })); } catch (e) { /* ignore */ }
  };
  A.setState = (st) => { A.s.st = st; A.update(); };
  A.edit = (code, ns, ne) => A.setState(Z.setActivity(A.s.st, code, ns, ne));

  A.update = () => {
    const keepScroll = {};
    $$('[data-keep]').forEach((el) => (keepScroll[el.dataset.keep] = [el.scrollLeft, el.scrollTop]));
    A.s.M = Z.compute(A.s.st);
    A.dirty = new Set(A.slides.map((_, i) => i));
    A.renderChrome();
    A.renderSlide(A.s.slide, keepScroll);
    A.renderDrawer();
    A.save();
  };

  A.renderChrome = () => {
    const M = A.s.M, st = A.s.st;
    $('#startIn').value = dt.iso(st.start);
    $('#linkSel').value = st.link;
    const n = M.changed.length, fd = M.finish - M.base.finish;
    const sc = $('#scen');
    sc.className = 'tb-btn' + (n ? ' primary' : '');
    sc.innerHTML = A.tr(n ? `Revised · ${n} changed · finish ${fd === 0 ? 'unchanged' : F.days(fd)}` : 'Baseline schedule');
    A.renderFilters();
    const vi = A.visIdx(), pos = Math.max(0, vi.indexOf(A.s.slide)), first = pos <= 0, last = pos >= vi.length - 1;
    $('#slideNo').textContent = `${pos + 1} / ${vi.length}`;
    $('#mNo').textContent = `${pos + 1} / ${vi.length}`;
    $('#mBack').disabled = first; $('#mNext').disabled = last;
    $('#bBack').disabled = first;
    $('#bNext').disabled = last;
    $$('#side [data-go]').forEach((b) => { const k = +b.dataset.go; b.classList.toggle('on', k === A.s.slide); b.style.display = A.isGone(k) ? 'none' : ''; });
    $$('.slide').forEach((el, k) => { el.classList.toggle('gone', A.isGone(k)); const pn = el.querySelector('.mfoot .pn'); if (pn) pn.textContent = vi.indexOf(k) + 1; });
  };

  /* ---- editable text blocks: any text can be edited in 'Edit text' mode and is saved with the scenario ----
     A block is a template; {tokens} are replaced by live values, so edited sentences keep updating. */
  A.edDef = {};
  A.ed = (id, def, tokens, opts) => {
    opts = opts || {};
    const tag = opts.tag || 'div', st = A.s.st;
    if (MODE) { if (MODE.translate && A.lang === 'ar' && !opts.native && Z.i18n) { def = Z.i18n.tpl(id, def); if (tokens) { tokens = Object.assign({}, tokens); Object.keys(tokens).forEach((k) => { if (typeof tokens[k] === 'string') tokens[k] = Z.i18n.html(tokens[k]); }); } } id = id + '@' + A.lang; }
    const custom = !!(st && st.notes && st.notes[id] != null);
    A.edDef[id] = def;
    const tpl = custom ? st.notes[id] : def, editing = A.s.editText;
    const body = editing
      ? tpl.replace(/\{(\w+)\}/g, '<span class="tk" contenteditable="false">{$1}</span>')
      : tpl.replace(/\{(\w+)\}/g, (m, k) => (tokens && tokens[k] != null ? tokens[k] : m));
    return `<${tag} class="edtext${editing ? ' on' : ''}${custom ? ' edited' : ''}" data-ed="${id}" ${editing ? 'contenteditable="true" spellcheck="false"' : ''} ${opts.style ? `style="${opts.style}"` : ''}>${body}</${tag}>`;
  };
  const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'P', 'DIV', 'UL', 'OL', 'LI', 'SPAN', 'H1']);
  A.cleanHtml = (html) => {
    const box = document.createElement('div'); box.innerHTML = html;
    box.querySelectorAll('span.tk').forEach((n) => n.replaceWith(document.createTextNode(n.textContent)));
    (function walk(n) {
      Array.from(n.children).forEach((c) => {
        walk(c);
        if (!ALLOWED.has(c.tagName)) { c.replaceWith(...Array.from(c.childNodes)); return; }
        Array.from(c.attributes).forEach((a) => c.removeAttribute(a.name));
      });
    })(box);
    return box.innerHTML.replace(/\u00a0/g, ' ').trim();
  };
  A.saveEd = (el) => {
    const id = el.dataset.ed, st = A.s.st; st.notes = st.notes || {};
    const html = A.cleanHtml(el.innerHTML), norm = (t) => t.replace(/\s+/g, ' ').trim();
    const tmp = document.createElement('div'); tmp.innerHTML = A.edDef[id] || '';
    if (norm(html) === norm(tmp.innerHTML)) delete st.notes[id]; else st.notes[id] = html;
    el.classList.toggle('edited', st.notes[id] != null);
    A.save();
  };
  A.toggleEdit = () => {
    A.s.editText = !A.s.editText; $('#app').classList.toggle('editing', A.s.editText);
    $('#bEdit').classList.toggle('primary', A.s.editText);
    A.refilter();
  };
  A.actions.edDone = () => A.toggleEdit();
  A.actions.delSlide = () => {
    const vi = A.visIdx(); if (vi.length <= 1) return;
    if (!confirm(A.L('Delete this slide from the presentation? (You can bring deleted slides back with "Restore deleted slides".)', 'حذف هذه الشريحة من العرض؟ (يمكنك استرجاع الشرائح المحذوفة من زر «استرجاع الشرائح المحذوفة».)'))) return;
    const cur = A.s.slide; A.hidden.add(A.slides[cur].id); A.saveHidden();
    const nx = vi.find((k) => k > cur); A.go(nx != null ? nx : vi.filter((k) => k < cur).pop()); A.updateEdbar();
  };
  A.actions.restoreSlides = () => { A.hidden.clear(); A.saveHidden(); A.renderChrome(); A.updateEdbar(); };
  A.updateEdbar = () => { const b = $('#edRestore'); if (b) b.style.display = A.hidden.size ? '' : 'none'; };
  A.actions.edResetSlide = () => {
    if (!confirm(A.L('Restore the original text of this slide?', 'استرجاع النص الأصلي لهذه الشريحة؟'))) return;
    $$('#slide-' + A.s.slide + ' [data-ed]').forEach((el) => delete A.s.st.notes[el.dataset.ed]);
    A.save(); A.refilter();
  };
  A.actions.edResetAll = () => {
    if (!confirm(A.L('Restore the original text on ALL slides?', 'استرجاع النص الأصلي في كل الشرائح؟'))) return;
    A.s.st.notes = {}; A.save(); A.refilter();
  };

  A.head = (no, title, sub, src) => {
    if (MODE && MODE.num) { const m = MODE.num[no] || no; return `<div class="s-head m"><img class="hlogo" src="${A.asset('sar-logo.png')}" alt="SAR"><div class="ht">${A.ed('title:' + no, title, null, { tag: 'h1' })}<p>${A.ed('sub:' + no, sub, null, { tag: 'span' })}</p></div></div>`; }
    return `<div class="s-head"><div class="no">${no}</div><div>${A.ed('title:' + no, title, null, { tag: 'h1' })}<p>${A.ed('sub:' + no, sub, null, { tag: 'span' })}</p></div>${src ? `<div class="src">Excel source<br><b>${src}</b></div>` : ''}</div>`;
  };
  /* header + footer in the SAR template look, used by the deck's own slides */
  A.mhead = (key, title, sub) => `<div class="s-head m"><img class="hlogo" src="${A.asset('sar-logo.png')}" alt="SAR"><div class="ht">${A.ed('title:' + key, title, null, { tag: 'h1', native: true })}<p>${A.ed('sub:' + key, sub, null, { tag: 'span', native: true })}</p></div></div>`;

  A.renderSlide = (i, keepScroll) => {
    const el = $('#slide-' + i); if (!el) return;
    const def = A.slides[i];
    let html = def.render(A.s.M, A.s);
    if (MODE && MODE.translate && !def.native && A.lang === 'ar') html = Z.i18n.html(html);
    if (MODE && !def.bare) html += `<div class="mfoot"><span class="int">${A.L('Internal', 'Internal')}</span><b class="pn">${A.visIdx().indexOf(i) + 1}</b></div>`;
    el.innerHTML = html;
    A.dirty.delete(i);
    if (keepScroll) $$('[data-keep]', el).forEach((n) => { const k = keepScroll[n.dataset.keep]; if (k) { n.scrollLeft = k[0]; n.scrollTop = k[1]; } });
    if (def.after) def.after(el, A.s.M, A.s);
  };
  A.renderAll = () => A.slides.forEach((_, i) => A.renderSlide(i));

  /* --------------------------------------------------------- navigation */
  A.go = (i) => {
    i = Math.max(0, Math.min(A.slides.length - 1, i));
    if (A.isGone(i)) { const vi = A.visIdx(); i = vi.find((k) => k >= i) != null ? vi.find((k) => k >= i) : vi[vi.length - 1]; }
    A.s.slide = i;
    $$('.slide').forEach((s, k) => s.classList.toggle('active', k === i));
    if (A.dirty.has(i)) A.renderSlide(i);
    A.renderChrome(); A.save();
    $('#viewport').scrollTop = 0;
    try { history.replaceState(null, '', '#' + (i + 1)); } catch (e) { /* ignore */ }
  };
  A.next = () => { const vi = A.visIdx(), k = vi.find((x) => x > A.s.slide); if (k != null) A.go(k); };
  A.back = () => { const vi = A.visIdx().filter((x) => x < A.s.slide); if (vi.length) A.go(vi[vi.length - 1]); };

  /* ----------------------------------------------------------- scaling */
  A.fit = () => {
    const vp = $('#viewport');
    const mob = window.innerWidth < 900;
    if (mob !== A.mobile) {
      A.mobile = mob; $('#app').classList.toggle('mobile', mob);
      if (A.s.M && A.slides.length) { A.dirty = new Set(A.slides.map((_, i) => i)); A.renderSlide(A.s.slide); }
    }
    if (mob) { A.scale = 1; $('#stageBox').style.width = ''; $('#stageBox').style.height = ''; $('#stage').style.transform = 'none'; return; }
    const k = Math.min(vp.clientWidth / W, vp.clientHeight / H);
    A.scale = k;
    $('#stageBox').style.width = W * k + 'px'; $('#stageBox').style.height = H * k + 'px';
    $('#stage').style.transform = `scale(${k})`;
  };

  /* -------------------------------------------------------- fullscreen */
  A.isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  A.enterFull = () => { const el = $('#app'); (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el); };
  A.exitFull = () => { (document.exitFullscreen || document.webkitExitFullscreen || (() => {})).call(document); };
  A.syncFull = () => {
    const f = A.isFull();
    $('#bFull').style.display = f ? 'none' : ''; $('#bExit').style.display = f ? '' : 'none';
    setTimeout(A.fit, 50);
  };
  A.print = () => { A.renderAll(); setTimeout(() => window.print(), 80); };

  /* ------------------------------------------------------------ drawer */
  A.openDrawer = (type, id) => { A.s.drawer = { type, id }; A.renderDrawer(); };
  A.closeDrawer = () => { A.s.drawer = null; A.renderDrawer(); };
  A.renderDrawer = () => {
    const d = A.s.drawer, el = $('#drawer'), sc = $('#scrim');
    if (!d) { el.classList.remove('open'); sc.classList.remove('open'); return; }
    const fn = A.drawers[d.type]; if (!fn) return;
    const o = fn(d.id, A.s.M, A.s);
    if (!o) { A.closeDrawer(); return; }
    const keep = $('#drawer .db') ? $('#drawer .db').scrollTop : 0;
    el.innerHTML = `<div class="dh"><div class="cd">${o.code}</div><h2>${o.title}</h2><div>${o.tags || ''}</div><button class="x" data-do="closeDrawer" aria-label="Close">×</button></div><div class="db">${o.html}</div>`;
    el.classList.add('open'); sc.classList.add('open');
    $('#drawer .db').scrollTop = keep;
  };

  /* ----------------------------------------------------------- tooltip */
  function tipMove(e) {
    const t = e.target.closest ? e.target.closest('[data-tip]') : null;
    const tip = $('#tip');
    if (!t || !t.dataset.tip) { tip.style.display = 'none'; return; }
    if (tip.dataset.src !== t.dataset.tip) { tip.innerHTML = A.tr(t.dataset.tip); tip.dataset.src = t.dataset.tip; }
    tip.style.display = 'block';
    const r = $('#stage').getBoundingClientRect(), k = A.scale;
    let x = (e.clientX - r.left) / k + 16, y = (e.clientY - r.top) / k + 16;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    if (x + w > W - 8) x = (e.clientX - r.left) / k - w - 16;
    if (y + h > H - 8) y = (e.clientY - r.top) / k - h - 16;
    tip.style.left = Math.max(6, x) + 'px'; tip.style.top = Math.max(6, y) + 'px';
  }

  /* -------------------------------------------------------- built-in actions */
  A.actions.closeDrawer = () => A.closeDrawer();
  A.actions.resetDefault = () => {
    if (!confirm('Reset the presentation to its default?\n\nThis restores the project start date (25 Oct 2026), all activity dates, weightages, filters and views.')) return;
    A.s.st = Z.newState('2026-10-25');
    Object.assign(A.s.f, { phase: 'all', epc: [], group: 'all', ll: false, crit: false, chg: false, q: '' });
    A.s.ui = {}; A.s.drawer = null; $('#fQ').value = '';
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    A.update(); A.closeDrawer();
  };
  A.actions.resetAll = A.actions.resetDefault;
  A.actions.resetAct = (el) => A.setState(Z.resetActivity(A.s.st, el.dataset.code));

  function bind() {
    const stage = $('#stage');
    stage.addEventListener('click', (e) => {
      const t = e.target;
      if (A.s.editText && t.closest('[data-ed]')) return;
      const doEl = t.closest('[data-do]');
      if (doEl && A.actions[doEl.dataset.do]) { A.actions[doEl.dataset.do](doEl, e); return; }
      if (t.closest('input,select,textarea')) return;
      const nav = t.closest('[data-nav]'); if (nav) { A.go(+nav.dataset.nav); return; }
      if (MODE && MODE.noDrawer) return;
      const mapping = [['data-act', 'act'], ['data-grp', 'grp'], ['data-month', 'month'], ['data-cat', 'cat'], ['data-item', 'item']];
      for (const [attr, type] of mapping) {
        const el = t.closest('[' + attr + ']');
        if (el) { A.openDrawer(type, el.getAttribute(attr)); return; }
      }
    });
    stage.addEventListener('change', (e) => {
      const el = e.target.closest('[data-chg]');
      if (el && A.changes[el.dataset.chg]) A.changes[el.dataset.chg](el, e);
    });
    stage.addEventListener('input', (e) => { const el = e.target.closest && e.target.closest('[data-ed]'); if (el) el.dataset.dirty = '1'; });
    stage.addEventListener('focusout', (e) => { const el = e.target.closest && e.target.closest('[data-ed]'); if (el && A.s.editText && el.dataset.dirty) { delete el.dataset.dirty; A.saveEd(el); } });
    stage.addEventListener('paste', (e) => { const el = e.target.closest && e.target.closest('[data-ed]'); if (!el) return; e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain')); });
    $('#bEdit').onclick = A.toggleEdit; $('#edDone').onclick = A.toggleEdit;
    $('#edbar').addEventListener('click', (e) => { const b = e.target.closest('[data-do]'); if (b && A.actions[b.dataset.do]) A.actions[b.dataset.do](b, e); });
    $('#scrim').addEventListener('click', A.closeDrawer);
    stage.addEventListener('mousemove', tipMove);
    stage.addEventListener('mouseleave', () => ($('#tip').style.display = 'none'));

    // toolbar
    $('#bBack').onclick = A.back; $('#bNext').onclick = A.next;
    $('#bFull').onclick = A.enterFull; $('#bExit').onclick = A.exitFull; $('#bPrint').onclick = A.print;
    if ($('#bFilters')) $('#bFilters').onclick = () => { const f = $('#filters'); f.style.display = f.style.display === 'none' ? '' : 'none'; setTimeout(A.fit, 20); };
    $('#bReset').onclick = A.actions.resetDefault;
    $('#scen').onclick = () => A.go(A.slides.findIndex((s) => s.id === 'scenario'));
    $('#startIn').onchange = (e) => { const d = dt.parse(e.target.value); if (d) A.setState(Z.setStart(A.s.st, d)); else A.renderChrome(); };
    $('#linkSel').onchange = (e) => { const st = Z.cloneState(A.s.st); st.link = e.target.value; A.setState(st); };
    $('#bSide').onclick = () => { $('#side').classList.toggle('hide'); setTimeout(A.fit, 30); };
    $('#side').addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) { A.go(+b.dataset.go); if (window.innerWidth < 600) $('#side').classList.add('hide'); } });
    $('#mBack').onclick = A.back; $('#mNext').onclick = A.next;
    $('#mSide').onclick = () => $('#side').classList.toggle('hide');
    if ($('#mFilt')) $('#mFilt').onclick = () => $('#app').classList.toggle('showf');

    // filters
    const fb = $('#filters');
    fb.addEventListener('click', (e) => {
      const f = A.s.f, t = e.target.closest('button'); if (!t) return;
      if (t.dataset.fphase) f.phase = t.dataset.fphase;
      else if (t.dataset.fepc) { const i = f.epc.indexOf(t.dataset.fepc); if (i >= 0) f.epc.splice(i, 1); else f.epc.push(t.dataset.fepc); }
      else if (t.dataset.ftog) f[t.dataset.ftog] = !f[t.dataset.ftog];
      else if (t.id === 'fReset') { Object.assign(f, { phase: 'all', epc: [], group: 'all', ll: false, crit: false, chg: false, q: '' }); $('#fQ').value = ''; }
      else return;
      A.refilter();
    });
    fb.addEventListener('change', (e) => { if (e.target.id === 'fGroup') { A.s.f.group = e.target.value; A.refilter(); } });
    $('#fQ').addEventListener('input', (e) => { A.s.f.q = e.target.value.trim(); A.refilter(); });

    // keyboard
    document.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (e.target.isContentEditable) { if (e.key === 'Escape') e.target.blur(); return; }
      if (tag === 'input' || tag === 'select' || tag === 'textarea') { if (e.key === 'Escape') e.target.blur(); return; }
      const fwd = A.isAr() ? 'ArrowLeft' : 'ArrowRight', bwd = A.isAr() ? 'ArrowRight' : 'ArrowLeft';
      if (e.key === fwd || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) { e.preventDefault(); A.next(); }
      else if (e.key === bwd || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) { e.preventDefault(); A.back(); }
      else if (e.key === 'Home') A.go(A.visIdx()[0]); else if (e.key === 'End') A.go(A.visIdx().slice(-1)[0]);
      else if (e.key === 'Escape') { if (A.s.drawer) A.closeDrawer(); }
      else if (e.key === 'f' || e.key === 'F') { A.isFull() ? A.exitFull() : A.enterFull(); }
    });
    window.addEventListener('resize', A.fit);
    if (window.ResizeObserver) new ResizeObserver(() => A.fit()).observe($('#viewport'));
    document.addEventListener('fullscreenchange', A.syncFull); document.addEventListener('webkitfullscreenchange', A.syncFull);
    window.addEventListener('beforeprint', A.renderAll);
  }

  A.refilter = () => {
    A.dirty = new Set(A.slides.map((_, i) => i));
    A.renderFilters();
    const keep = {}; $$('[data-keep]').forEach((el) => (keep[el.dataset.keep] = [el.scrollLeft, el.scrollTop]));
    A.renderSlide(A.s.slide, keep); A.renderDrawer(); A.save();
  };

  /* -------------------------------------------------------------- boot */
  A.setLang = (l) => {
    A.lang = l; try { localStorage.setItem(LKEY, l); } catch (e) { /* ignore */ }
    A.applyLang(); A.dirty = new Set(A.slides.map((_, i) => i));
    A.renderChrome(); A.renderSlide(A.s.slide); A.renderDrawer();
  };
  A.applyLang = () => {
    document.documentElement.lang = A.lang; document.documentElement.dir = A.isAr() ? 'rtl' : 'ltr';
    document.body.classList.toggle('ar', A.isAr());
    if (A.labels) A.labels(); A.buildSide();
  };
  A.slideInfo = (s) => { const t = MODE && MODE.titles && MODE.titles[s.id]; if (t) return A.isAr() ? t.ar : t.en; if (s.i18n) return A.isAr() ? s.i18n.ar : s.i18n.en; return [s.title, s.desc]; };
  A.buildSide = () => {
    const SEC = MODE ? MODE.sec.map((x) => [A.isAr() ? x.ar : x.en, x.ids]) : [['Introduction', ['cover']], ['1 · Dashboard', ['dash', 'miles', 'phase2']], ['2 · WBS & CBS', ['wbs', 'wbsreg']], ['3 · 26-Month Schedule', ['gantt', 'cashflow', 'matrix']], ['4 · Assumptions & Scenario', ['assump', 'scenario']]];
    $('#side').innerHTML = SEC.map(([t, ids]) => `<div class="sec">${t}</div>` + ids.map((id) => { const i = A.slides.findIndex((s) => s.id === id); if (i < 0) return ''; const [ti, de] = A.slideInfo(A.slides[i]); return `<button data-go="${i}"><span class="n">${i + 1}</span><span>${ti}<small>${de}</small></span></button>`; }).join('')).join('');
    $$('#side [data-go]').forEach((b) => { b.style.display = A.isGone(+b.dataset.go) ? 'none' : ''; });
  };
  A.boot = () => {
    if (MODE && MODE.order) A.slides = MODE.order.map((id) => A.slides.find((s) => s.id === id)).filter(Boolean);
    // slides
    $('#stage').insertAdjacentHTML('afterbegin', A.slides.map((s, i) => `<section class="slide ${s.cls || ''}" id="slide-${i}"></section>`).join(''));
    A.applyLang();
    if (window.innerWidth < 600) $('#side').classList.add('hide');
    // restore state: share link > saved session > baseline
    let st = null, slide = 0;
    try {
      const h = location.hash;
      if (h.startsWith('#s=')) st = Z.deserialize(decodeURIComponent(escape(atob(h.slice(3)))));
      else {
        const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (saved) { st = Z.deserialize(saved.ser); slide = saved.slide || 0; }
        if (/^#\d+$/.test(h)) slide = +h.slice(1) - 1;
      }
    } catch (e) { st = null; }
    A.s.st = st || Z.newState('2026-10-25');
    A.s.M = Z.compute(A.s.st);
    A.s.slide = Math.max(0, Math.min(A.slides.length - 1, slide));
    $('#fQ').value = A.s.f.q || '';
    bind(); if (A.updateEdbar) A.updateEdbar(); A.fit(); A.syncFull();
    A.dirty = new Set(A.slides.map((_, i) => i));
    A.renderChrome(); A.go(A.s.slide);
    A.renderDrawer();
  };
})(window);

/* P6 Web – WBS window, Primavera P6 style: a WBS tree (expand / collapse), configurable columns, summary bars on a timescale,
   and full structure editing – add, delete, copy / cut / paste (with or without the activities), duplicate, drag & drop,
   move up / down, indent / outdent, renumber codes – plus the P6 bottom tabs (General, Notebook, Budget Log, Budget Summary,
   WBS Milestones, Earned Value). Replaces the plain table renderer in win.js (App.renderWbsWin). */
(function (g) {
  'use strict';
  const P6 = g.P6, App = g.App, D = App.dialogs;
  const esc = P6.esc, B = (en, ar) => (P6.dir() === 'rtl' ? ar : en), t = (k, ...a) => P6.t(k, ...a);
  const RH = 24, HH = 40, fmtD = (d) => (d == null || !isFinite(d) ? '' : P6.fmtDate(d)), money = (v) => P6.fmtKind('money', v || 0);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const STATUS = ['Planned', 'Active', 'Inactive', 'What-If', 'Requested', 'Template'];
  const WC = [['#0000ff', '#fff'], ['#66ff66', '#000'], ['#ffff00', '#000'], ['#0000ff', '#fff'], ['#ff0000', '#fff']];

  /* ------------------------------------------------------------ columns */
  const COLS = {
    code: { en: 'WBS Code', ar: 'كود WBS', w: 210, tree: 1, ed: 1 },
    name: { en: 'WBS Name', ar: 'اسم WBS', w: 360, ed: 1 },
    count: { en: 'Total Activities', ar: 'إجمالي الأنشطة', w: 100, r: 1, v: (x) => x.ru.count },
    status: { en: 'Status', ar: 'الحالة', w: 90, v: (x) => x.w.status || 'Active' },
    es: { en: 'Start', ar: 'البداية', w: 96, v: (x) => fmtD(x.ru.es) },
    ef: { en: 'Finish', ar: 'النهاية', w: 96, v: (x) => fmtD(x.ru.ef) },
    pct: { en: 'Activity % Complete', ar: '% إنجاز الأنشطة', w: 120, r: 1, v: (x) => (x.ru.pct || 0) + '%' },
    bc: { en: 'Budgeted Total Cost', ar: 'إجمالي التكلفة المخططة', w: 140, r: 1, v: (x) => money(x.m.bc) },
    ac: { en: 'Actual Total Cost', ar: 'التكلفة الفعلية', w: 130, r: 1, v: (x) => money(x.m.ac) },
    nns: { en: 'Not Started', ar: 'لم تبدأ', w: 80, r: 1, v: (x) => x.ru.nNS },
    nip: { en: 'In Progress', ar: 'جارية', w: 80, r: 1, v: (x) => x.ru.nIP },
    nc: { en: 'Completed', ar: 'مكتملة', w: 80, r: 1, v: (x) => x.ru.nC },
    ncrit: { en: 'Critical Activities', ar: 'أنشطة حرجة', w: 100, r: 1, v: (x) => x.ru.nCrit },
    tf: { en: 'Total Float', ar: 'الفلوت الكلي', w: 90, r: 1, v: (x) => (x.ru.tf == null || !isFinite(x.ru.tf) ? '' : x.ru.tf) },
    bs: { en: 'Baseline Start', ar: 'بداية الخط المرجعي', w: 110, v: (x) => fmtD(x.ru.bs) },
    bf: { en: 'Baseline Finish', ar: 'نهاية الخط المرجعي', w: 110, v: (x) => fmtD(x.ru.bf) },
    resp: { en: 'Responsible Manager', ar: 'المدير المسؤول', w: 150, v: (x) => x.w.resp || '' },
    as: { en: 'Anticipated Start', ar: 'البداية المتوقعة', w: 110, v: (x) => fmtD(x.w.antS) },
    af: { en: 'Anticipated Finish', ar: 'النهاية المتوقعة', w: 110, v: (x) => fmtD(x.w.antF) },
    lvl: { en: 'Level', ar: 'المستوى', w: 60, r: 1, v: (x) => x.lv + 1 },
    notes: { en: 'Notes', ar: 'ملاحظات', w: 200, v: (x) => (x.w.notes || '').replace(/\s+/g, ' ').slice(0, 80) }
  };
  const DEF_COLS = ['code', 'name', 'count', 'status'];
  const lab = (k) => B(COLS[k].en, COLS[k].ar);

  /* ------------------------------------------------------------ state */
  const ui = { sel: new Set(), cur: null, anchor: null, collapsed: new Map(), pid: null, clip: null, drag: null };
  const cfg = () => { const c = App.cfg; if (!c.wbsw) c.wbsw = {}; const w = c.wbsw; if (!w.cols) w.cols = DEF_COLS.map((k) => ({ k, w: COLS[k].w })); w.cols = w.cols.filter((c2) => COLS[c2.k]); if (!w.unit) w.unit = 'Month'; if (w.bars == null) w.bars = true; if (w.base == null) w.base = true; if (w.lvc == null) w.lvc = false; return w; };
  const colSet = () => ui.collapsed.get(App.p.id) || (ui.collapsed.set(App.p.id, new Set()), ui.collapsed.get(App.p.id));

  /* ------------------------------------------------------------ model helpers */
  function model() {
    const p = App.p, by = new Map(p.wbs.map((w) => [w.id, w])), kids = new Map(p.wbs.map((w) => [w.id, []]));
    const roots = [];
    for (const w of p.wbs) { if (w.parent != null && by.has(w.parent)) kids.get(w.parent).push(w); else roots.push(w); }
    const cmp = (a, b) => ((a.seq || 0) - (b.seq || 0)) || String(a.code).localeCompare(String(b.code), undefined, { numeric: true });
    kids.forEach((l) => l.sort(cmp)); roots.sort(cmp);
    return { p, by, kids, roots };
  }
  const sibs = (Mo, w) => (w.parent != null && Mo.by.has(w.parent) ? Mo.kids.get(w.parent) : Mo.roots);
  const isAnc = (Mo, a, b) => { for (let x = b; x; x = x.parent != null ? Mo.by.get(x.parent) : null) if (x.id === a.id) return true; return false; };   // a is b or ancestor of b
  const subtree = (Mo, w) => { const out = [w]; for (const k of Mo.kids.get(w.id) || []) out.push(...subtree(Mo, k)); return out; };
  const depthOf = (Mo, w) => { let d = 0; for (let x = w; x && x.parent != null && Mo.by.has(x.parent); x = Mo.by.get(x.parent)) d++; return d; };
  function visibleRows(Mo) {
    const out = [], cs = colSet();
    const walk = (w, lv) => { out.push({ w, lv, has: (Mo.kids.get(w.id) || []).length > 0 }); if (!cs.has(w.id)) for (const k of Mo.kids.get(w.id)) walk(k, lv + 1); };
    Mo.roots.forEach((r) => walk(r, 0));
    return out;
  }
  const topSel = (Mo) => { const ws = [...ui.sel].map((id) => Mo.by.get(id)).filter(Boolean); return ws.filter((w) => !ws.some((o) => o !== w && isAnc(Mo, o, w))); };
  const orderIdx = (Mo) => { const m = new Map(); let i = 0; const walk = (w) => { m.set(w.id, i++); (Mo.kids.get(w.id) || []).forEach(walk); }; Mo.roots.forEach(walk); return m; };
  const sortVis = (Mo, ws) => { const oi = orderIdx(Mo); return ws.slice().sort((a, b) => oi.get(a.id) - oi.get(b.id)); };
  const resq = (list) => list.forEach((w, i) => { w.seq = i + 1; });
  function uniqCode(Mo, parentId, code, self) {
    const list = (parentId != null && Mo.by.has(parentId) ? Mo.kids.get(parentId) : Mo.roots).filter((x) => x !== self);
    const have = new Set(list.map((x) => String(x.code)));
    if (!have.has(String(code))) return code;
    let n = 2; while (have.has(code + '-' + n)) n++; return code + '-' + n;
  }
  const nextCode = (Mo, par) => { const sl = par ? Mo.kids.get(par.id) : Mo.roots; let n = sl.length + 1, c; do { c = (par ? par.code + '.' : 'W') + n++; } while (sl.some((x) => String(x.code) === c)); return c; };

  /* ------------------------------------------------------------ commands */
  const cmds = {
    add() {
      const Mo = model(), p = Mo.p, par = ui.cur != null ? Mo.by.get(ui.cur) : Mo.roots[0]; let id;
      App.mutate(t('add_wbs'), () => { id = P6.nextId(p); const sl = par ? Mo.kids.get(par.id) : Mo.roots; p.wbs.push({ id, parent: par ? par.id : null, code: nextCode(Mo, par), name: t('new_wbs'), seq: sl.length + 1, status: 'Active' }); }, { noSched: true });
      if (par) colSet().delete(par.id); ui.sel = new Set([id]); ui.cur = id; ui.anchor = id; App.renderWin(); startEdit(id, 'name');
    },
    del() {
      const Mo = model(), ws = topSel(Mo); if (!ws.length) return;
      const roots = ws.filter((w) => w.parent == null || !Mo.by.has(w.parent));
      if (roots.length) return App.toast(t('err_root'), true);
      const ids = new Set(ws.flatMap((w) => subtree(Mo, w).map((x) => x.id))), tk = Mo.p.tasks.filter((x) => ids.has(x.wbs)), n = tk.length;
      const body = document.createElement('div');
      body.innerHTML = `<p style="margin:4px 0 10px">${esc(B('Delete', 'حذف'))} <b>${ids.size}</b> WBS · <b>${n}</b> ${esc(B('activities under it', 'نشاط تحتها'))}.</p><p class="hint">${esc(B('Choose what happens to the activities:', 'اختر مصير الأنشطة:'))}</p>`;
      const run = (moveUp) => App.mutate(t('delete'), () => {
        if (moveUp) { for (const w of ws) { const par = w.parent; Mo.p.tasks.forEach((x) => { if (subtree(Mo, w).some((q) => q.id === x.wbs)) x.wbs = par; }); } }
        else { const kill = new Set(tk.map((x) => x.id)); Mo.p.tasks = Mo.p.tasks.filter((x) => !kill.has(x.id)); Mo.p.rels = Mo.p.rels.filter((r) => !kill.has(r.p) && !kill.has(r.s)); Mo.p.asg = Mo.p.asg.filter((a) => !kill.has(a.task)); }
        Mo.p.wbs = Mo.p.wbs.filter((w) => !ids.has(w.id)); ui.sel.clear(); ui.cur = ws[0].parent; ui.anchor = ui.cur; if (ui.cur != null) ui.sel.add(ui.cur);
      });
      D.modal({ title: B('Delete WBS', 'حذف WBS'), cls: 'mid', body, buttons: [
        { label: B('Delete WBS and its activities', 'حذف الـ WBS مع أنشطته'), cls: 'pri', fn: () => { run(false); } },
        { label: B('Delete WBS, keep activities (move to parent)', 'حذف الـ WBS وإبقاء الأنشطة (نقلها للأب)'), fn: () => { run(true); } },
        { label: t('cancel') || 'Cancel', fn: () => {} }] });
    },
    up() { shift(-1); }, down() { shift(1); },
    indent() {
      const Mo = model(), ws = sortVis(Mo, topSel(Mo)); if (!ws.length) return; let n = 0;
      App.mutate(t('indent'), () => {
        const sel = new Set(ws.map((w) => w.id));
        for (const w of ws) {
          const sl = sibs(Mo, w), i = sl.indexOf(w); let np = null; for (let j = i - 1; j >= 0; j--) if (!sel.has(sl[j].id)) { np = sl[j]; break; }
          if (!np) continue; const old = sl.slice(); const nk = Mo.kids.get(np.id);
          sl.splice(i, 1); w.parent = np.id; w.code = uniqCode(Mo, np.id, w.code, w); nk.push(w); resq(nk); resq(old.filter((x) => x !== w)); colSet().delete(np.id); n++;
        }
      }, { noSched: true });
      if (!n) App.toast(B('Nothing to indent', 'لا يمكن زيادة المسافة'), true);
    },
    outdent() {
      const Mo = model(), ws = sortVis(Mo, topSel(Mo)).reverse(); if (!ws.length) return; let n = 0;
      App.mutate(t('outdent'), () => {
        for (const w of ws) {
          const par = w.parent != null ? Mo.by.get(w.parent) : null; if (!par || par.parent == null || !Mo.by.has(par.parent)) continue;
          const gp = Mo.by.get(par.parent), gl = Mo.kids.get(gp.id); Mo.kids.get(par.id).splice(Mo.kids.get(par.id).indexOf(w), 1);
          gl.splice(gl.indexOf(par) + 1, 0, w); w.parent = gp.id; w.code = uniqCode(Mo, gp.id, w.code, w); resq(gl); n++;
        }
      }, { noSched: true });
      if (!n) App.toast(B('Nothing to outdent', 'لا يمكن تقليل المسافة'), true);
    },
    renumber() {
      const Mo = model(), ws = topSel(Mo); const roots = ws.length ? ws : Mo.roots;
      App.mutate(B('Renumber WBS codes', 'إعادة ترقيم أكواد WBS'), () => {
        const walk = (w) => { (Mo.kids.get(w.id) || []).forEach((k, i) => { k.code = w.code + '.' + (i + 1); walk(k); }); };
        roots.forEach(walk);
      }, { noSched: true });
      App.toast(B('Codes renumbered under the selection', 'تمت إعادة الترقيم تحت المحدد'));
    },
    copy(structOnly, cut) {
      const Mo = model(), ws = sortVis(Mo, topSel(Mo)); if (!ws.length) return App.toast(B('Select a WBS first', 'حدّد WBS أولاً'), true);
      const ids = new Set(ws.flatMap((w) => subtree(Mo, w).map((x) => x.id)));
      const tasks = structOnly ? [] : Mo.p.tasks.filter((x) => ids.has(x.wbs)), tids = new Set(tasks.map((x) => x.id));
      ui.clip = { cut: !!cut, tops: ws.map((w) => w.id), wbs: clone(Mo.p.wbs.filter((w) => ids.has(w.id))), tasks: clone(tasks), rels: clone(Mo.p.rels.filter((r) => tids.has(r.p) && tids.has(r.s))), asg: clone(Mo.p.asg.filter((a) => tids.has(a.task))), pid: Mo.p.id };
      App.toast(cut ? B('Cut ' + ws.length + ' WBS', 'تم قص ' + ws.length + ' WBS') : B('Copied ' + ws.length + ' WBS' + (structOnly ? ' (structure only)' : ' with ' + tasks.length + ' activities'), 'تم نسخ ' + ws.length + ' WBS' + (structOnly ? ' (الهيكل فقط)' : ' مع ' + tasks.length + ' نشاط')));
      if (cut) App.renderWin();
    },
    cut() { cmds.copy(false, true); },
    paste(intoId, dupHere) {
      const c = ui.clip; if (!c) return App.toast(t('clip_empty'), true);
      const Mo = model(), tgt = Mo.by.get(intoId != null ? intoId : (ui.cur != null ? ui.cur : (Mo.roots[0] || {}).id));
      if (!tgt) return;
      if (c.cut && c.pid === Mo.p.id) { const mv = c.tops.map((i) => Mo.by.get(i)).filter(Boolean); ui.clip = null; return moveNodes(mv, tgt, 'in'); }
      const p = Mo.p, map = new Map(); let firstNew = null;
      const hasT = c.tasks.length > 0;
      App.mutate(t('paste'), () => {
        const par0 = tgt.id;
        const tops = new Set(c.tops);
        // clone in parent-first order
        const order = []; const idset = new Set(c.wbs.map((w) => w.id));
        const kidsOf = (id) => c.wbs.filter((w) => w.parent === id).sort((a, b) => (a.seq || 0) - (b.seq || 0));
        const walk = (w) => { order.push(w); kidsOf(w.id).forEach(walk); };
        c.tops.forEach((id) => { const w = c.wbs.find((x) => x.id === id); if (w) walk(w); });
        const Mx = model();
        for (const o of order) {
          const nid = P6.nextId(p), isTop = tops.has(o.id), parentNew = isTop ? par0 : map.get(o.parent);
          map.set(o.id, nid);
          const sl = Mx.kids.get(parentNew) || (Mx.kids.set(parentNew, []), Mx.kids.get(parentNew));
          let code = o.code, name = o.name;
          if (isTop && (dupHere || sl.some((x) => String(x.code) === String(code)))) { code = uniqCode(Mx, parentNew, code); if (dupHere) name = o.name + ' (copy)'; }
          const nw = Object.assign(clone(o), { id: nid, parent: parentNew, code, name, seq: sl.length + 1 }); sl.push(nw); p.wbs.push(nw);
          if (firstNew == null) firstNew = nid;
        }
        const tmap = new Map();
        for (const o of c.tasks) {
          const x = clone(o); x.id = P6.nextId(p); x.wbs = map.get(o.wbs); x.code = P6.autoCode(p); x.seq = Math.max(0, ...p.tasks.map((q) => q.seq)) + 1;
          x.status = 'NS'; x.as = null; x.af = null; x.rem = x.dur; x.pct = 0; x.bs = null; x.bf = null; if (!p.cals.some((q) => q.id === x.cal)) x.cal = p.defCal;
          p.tasks.push(x); tmap.set(o.id, x);
        }
        for (const r of c.rels) { const a = tmap.get(r.p), b = tmap.get(r.s); if (a && b) p.rels.push({ id: P6.nextId(p), p: a.id, s: b.id, type: r.type, lag: r.lag }); }
        for (const a of c.asg) { const tk = tmap.get(a.task); if (tk && p.rsrc.some((x) => x.id === a.rsrc)) p.asg.push(Object.assign(clone(a), { id: P6.nextId(p), task: tk.id })); }
        colSet().delete(par0);
      }, hasT ? {} : { noSched: true });
      if (firstNew != null) { ui.sel = new Set([...map.values()].slice(0, c.tops.length)); ui.cur = firstNew; ui.anchor = firstNew; App.renderWin(); }
    },
    dup() { const Mo = model(), ws = sortVis(Mo, topSel(Mo)); if (!ws.length) return; cmds.copy(false, false); const par = ws[0].parent; cmds.paste(par != null ? par : ws[0].id, true); },
    expandAll() { colSet().clear(); App.renderWin(); },
    collapseAll() { const Mo = model(), cs = colSet(); Mo.p.wbs.forEach((w) => { if ((Mo.kids.get(w.id) || []).length) cs.add(w.id); }); Mo.roots.forEach((r) => cs.delete(r.id)); App.renderWin(); },
    expandSub(open) { const Mo = model(), cs = colSet(); topSel(Mo).forEach((w) => subtree(Mo, w).forEach((x) => { if (open) cs.delete(x.id); else if ((Mo.kids.get(x.id) || []).length) cs.add(x.id); })); App.renderWin(); }
  };
  function shift(dir) {
    const Mo = model(), ws = sortVis(Mo, topSel(Mo)); if (!ws.length) return;
    const by = new Map(); ws.forEach((w) => { const k = w.parent == null ? 'r' : w.parent; if (!by.has(k)) by.set(k, []); by.get(k).push(w); });
    let moved = false;
    App.mutate(dir < 0 ? B('Move up', 'تحريك لأعلى') : B('Move down', 'تحريك لأسفل'), () => {
      by.forEach((sel, k) => {
        const sl = k === 'r' ? Mo.roots : Mo.kids.get(k), S = new Set(sel);
        if (dir < 0) { for (let i = 1; i < sl.length; i++) if (S.has(sl[i]) && !S.has(sl[i - 1])) { [sl[i - 1], sl[i]] = [sl[i], sl[i - 1]]; moved = true; } }
        else { for (let i = sl.length - 2; i >= 0; i--) if (S.has(sl[i]) && !S.has(sl[i + 1])) { [sl[i + 1], sl[i]] = [sl[i], sl[i + 1]]; moved = true; } }
        resq(sl);
      });
    }, { noSched: true });
    void moved;
  }
  /* move WBS nodes next to / into a target (used by drag & drop and cut-paste) */
  function moveNodes(nodes, tgt, pos) {
    const Mo = model(); nodes = sortVis(Mo, nodes.filter((w) => !nodes.some((o) => o !== w && isAnc(Mo, o, w))));
    if (!nodes.length) return;
    if (nodes.some((w) => isAnc(Mo, w, tgt))) return App.toast(t('err_loop'), true);
    if (pos !== 'in' && (tgt.parent == null || !Mo.by.has(tgt.parent))) pos = 'in';               // a single project root
    if (nodes.some((w) => w.parent == null || !Mo.by.has(w.parent))) return App.toast(t('err_root'), true);
    App.mutate(B('Move WBS', 'نقل WBS'), () => {
      const newPar = pos === 'in' ? tgt : Mo.by.get(tgt.parent), nl = Mo.kids.get(newPar.id);
      nodes.forEach((w) => { const ol = sibs(Mo, w), i = ol.indexOf(w); if (i >= 0) ol.splice(i, 1); const ni = nl.indexOf(w); if (ni >= 0) nl.splice(ni, 1); });
      let at = pos === 'in' ? nl.length : nl.indexOf(tgt) + (pos === 'after' ? 1 : 0); if (at < 0) at = nl.length;
      nodes.forEach((w, i) => { w.parent = newPar.id; w.code = uniqCode(Mo, newPar.id, w.code, w); nl.splice(at + i, 0, w); });
      resq(nl); nodes.forEach((w) => { /* keep old siblings in order */ });
      for (const w of Mo.p.wbs) { const l = sibs(Mo, w); if (l !== nl) resq(l); }
      colSet().delete(newPar.id);
    }, { noSched: true });
    ui.sel = new Set(nodes.map((w) => w.id)); ui.cur = nodes[0].id; ui.anchor = ui.cur; App.renderWin();
  }

  /* ------------------------------------------------------------ inline edit */
  let editing = null;
  function startEdit(id, k) {
    const root = document.querySelector('.wbw'); if (!root) return;
    const cell = root.querySelector(`.wbw-r[data-id="${id}"] .wbw-c[data-k="${k}"]`); if (!cell) return;
    const w = App.p.wbs.find((x) => x.id === id); if (!w) return;
    const inp = document.createElement('input'); inp.className = 'wbw-in'; inp.value = k === 'code' ? w.code : w.name; inp.dir = 'auto';
    const txt = cell.querySelector('.wbw-t') || cell; const old = txt.innerHTML; txt.innerHTML = ''; txt.appendChild(inp); inp.focus(); inp.select(); editing = id;
    let done = false;
    const fin = (ok) => {
      if (done) return; done = true; editing = null;
      if (ok && inp.value.trim() && inp.value.trim() !== (k === 'code' ? w.code : w.name)) {
        const v = inp.value.trim();
        if (k === 'code') { const Mo = model(); const par = w.parent; if ((par != null ? Mo.kids.get(par) : Mo.roots).some((x) => x !== w && String(x.code) === v)) { App.toast(B('This code already exists under the same parent', 'الكود موجود بالفعل تحت نفس الأب'), true); txt.innerHTML = old; return; } }
        App.mutate(t('edit'), () => { if (k === 'code') w.code = v; else w.name = v; }, { noSched: true });
      } else { txt.innerHTML = old; }
      const l = root.querySelector('.wbw-l'); if (l) l.focus();
    };
    inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') fin(true); else if (e.key === 'Escape') fin(false); else if (e.key === 'Tab') { e.preventDefault(); fin(true); } };
    inp.onblur = () => fin(true); inp.onclick = (e) => e.stopPropagation(); inp.ondblclick = (e) => e.stopPropagation();
  }

  /* ------------------------------------------------------------ timescale */
  const asKit = () => App.assignKit;
  function pxFn(P, cw) { return (d) => { if (d < P.s0) return 0; if (d >= P.e0) return P.per.length * cw; const i = P.idx[d - P.s0]; if (i < 0) return 0; const q = P.per[i]; return i * cw + ((d - q.s) / Math.max(1, q.e - q.s)) * cw; }; }

  /* ------------------------------------------------------------ render */
  function render(el) {
    const p = App.p; if (!p) return;
    if (ui.pid !== p.id) { ui.pid = p.id; ui.sel = new Set(); ui.cur = null; const Mo0 = model(); ui.collapsed.delete(p.id); const cs = colSet(); Mo0.p.wbs.forEach((w) => { if ((Mo0.kids.get(w.id) || []).length && depthOf(Mo0, w) >= 1) cs.add(w.id); }); }
    const C = cfg(), Mo = model(), rows = visibleRows(Mo);
    if (ui.cur == null || !Mo.by.has(ui.cur)) { ui.cur = rows[0] ? rows[0].w.id : null; ui.sel = new Set(ui.cur != null ? [ui.cur] : []); ui.anchor = ui.cur; }
    ui.sel = new Set([...ui.sel].filter((i) => Mo.by.has(i)));
    const ru = App.ru || P6.rollup(p), M = (App.getCtx() || {}).M || { W: new Map() };
    const X = (w, lv) => ({ w, lv, ru: ru.get(w.id) || {}, m: (M.W && M.W.get(w.id)) || {} });
    const cols = C.cols.map((c) => Object.assign({}, COLS[c.k], { k: c.k, w: c.w || COLS[c.k].w }));
    const lw = cols.reduce((s, c) => s + c.w, 0);
    const old = el.querySelector('.wbw-r-pane'), oldL = el.querySelector('.wbw-l'), keep = { top: old ? old.scrollTop : 0, lx: oldL ? oldL.scrollLeft : 0, rx: old ? old.scrollLeft : 0, tab: ui.tab };
    // timescale
    let d0 = Infinity, d1 = -Infinity; rows.forEach((r) => { const q = ru.get(r.w.id); if (q && q.es != null) { d0 = Math.min(d0, q.bs != null && C.base ? Math.min(q.es, q.bs) : q.es); d1 = Math.max(d1, q.bf != null && C.base ? Math.max(q.ef, q.bf) : q.ef); } });
    if (!isFinite(d0)) { d0 = p.dataDate || p.planStart || 0; d1 = d0 + 60; }
    const kit = asKit(), P = kit.mkPeriods(C.unit, d0 - 3, d1 + 25), cw = C.cw || { Day: 26, Week: 44, Month: 64, Quarter: 84, Year: 100 }[C.unit], px = pxFn(P, cw);
    const H = rows.length * RH, lwPx = Math.max(240, Math.min(C.split || lw + 6, Math.round((el.clientWidth || 1200) * 0.7)));

    const ctrl = (a, ic, tip, dis) => `<button class="wbw-b" data-a="${a}" title="${esc(tip)}"${dis ? ' disabled' : ''}>${ic}</button>`;
    const bar = `<div class="dockhead wbw-dock">▽ ${esc(B('Layout', 'التخطيط'))}: ${esc(t('win_wbs'))}<span class="wbw-tools">
      ${ctrl('add', '＋', B('Add WBS (Insert)', 'إضافة WBS (Insert)'))}${ctrl('del', '✕', B('Delete (Del)', 'حذف (Del)'))}<i class="wbw-sep"></i>
      ${ctrl('cut', '✂', B('Cut (Ctrl+X)', 'قص (Ctrl+X)'))}${ctrl('copy', '⧉', B('Copy with activities (Ctrl+C)', 'نسخ مع الأنشطة (Ctrl+C)'))}${ctrl('copys', '⧉s', B('Copy structure only', 'نسخ الهيكل فقط'))}${ctrl('paste', '📋', B('Paste into selected (Ctrl+V)', 'لصق داخل المحدد (Ctrl+V)'), !ui.clip)}${ctrl('dup', '⎘', B('Duplicate (Ctrl+D)', 'تكرار (Ctrl+D)'))}<i class="wbw-sep"></i>
      ${ctrl('up', '▲', B('Move up (Ctrl+↑)', 'تحريك لأعلى (Ctrl+↑)'))}${ctrl('down', '▼', B('Move down (Ctrl+↓)', 'تحريك لأسفل (Ctrl+↓)'))}${ctrl('outdent', '◀', B('Outdent (Ctrl+←)', 'تقليل المسافة (Ctrl+←)'))}${ctrl('indent', '▶', B('Indent (Ctrl+→)', 'زيادة المسافة (Ctrl+→)'))}${ctrl('renum', '1.2', B('Renumber codes under selection', 'إعادة ترقيم الأكواد'))}<i class="wbw-sep"></i>
      <button class="btn sm" data-a="cols">${esc(B('Columns…', 'الأعمدة…'))}</button><button class="btn sm" data-a="exp">${esc(B('Expand all', 'فتح الكل'))}</button><button class="btn sm" data-a="col">${esc(B('Collapse all', 'طي الكل'))}</button>
      <label>${esc(B('Timescale', 'المقياس'))}: <select class="inp" data-a="unit" style="height:22px">${['Day', 'Week', 'Month', 'Quarter', 'Year'].map((u) => `<option value="${u}"${C.unit === u ? ' selected' : ''}>${esc(B(u, { Day: 'يوم', Week: 'أسبوع', Month: 'شهر', Quarter: 'ربع', Year: 'سنة' }[u]))}</option>`).join('')}</select></label>
      <label class="chk"><input type="checkbox" data-a="bars"${C.bars ? ' checked' : ''}> ${esc(B('Bars', 'البارات'))}</label><label class="chk"><input type="checkbox" data-a="base"${C.base ? ' checked' : ''}> ${esc(B('Baseline', 'الخط المرجعي'))}</label><label class="chk"><input type="checkbox" data-a="lvc"${C.lvc ? ' checked' : ''}> ${esc(B('Level colours', 'ألوان المستويات'))}</label></span></div>`;
    const tabs = [['general', B('General', 'عام')], ['notes', B('Notebook', 'الملاحظات')], ['blog', B('Budget Log', 'سجل الميزانية')], ['bsum', B('Budget Summary', 'ملخص الميزانية')], ['ms', B('WBS Milestones', 'معالم WBS')], ['ev', B('Earned Value', 'القيمة المكتسبة')]];
    ui.tab = keep.tab || ui.tab || 'general';
    el.classList.add('wbw-host');
    el.innerHTML = `<div class="wbw" dir="ltr"><div class="wbw-top">${bar}
      <div class="wbw-split"><div class="wbw-l" tabindex="0" id="wbw_l" style="width:${lwPx}px"><div class="wbw-hd" style="width:${lw}px">${cols.map((c, i) => `<div class="wbw-h" data-i="${i}" style="width:${c.w}px;${c.r ? 'text-align:right;' : ''}">${esc(lab(c.k))}<i class="wbw-rz" data-i="${i}"></i></div>`).join('')}</div><div class="wbw-ls" style="height:${H}px;width:${lw}px" id="wbw_ls"></div></div>
      <div class="wbw-gut" id="wbw_gut"></div>
      <div class="wbw-r-pane" id="wbw_rp"${C.bars ? '' : ' style="display:none"'}><div class="wbw-hd2" style="width:${P.per.length * cw}px">${(() => { const tops = []; P.per.forEach((q) => { const l = tops[tops.length - 1]; if (l && l.t === q.top) l.n++; else tops.push({ t: q.top, n: 1 }); }); return `<div class="wbw-ht">${tops.map((x) => `<div class="wbw-h2" style="width:${x.n * cw}px">${esc(x.t)}</div>`).join('')}</div><div class="wbw-hb">${P.per.map((q) => `<div class="wbw-h2" style="width:${cw}px">${esc(q.bot)}</div>`).join('')}</div>`; })()}</div><div class="wbw-rs" style="height:${H}px;width:${P.per.length * cw}px" id="wbw_rs"></div></div></div></div>
      <div class="wtabs">${tabs.map(([k, l]) => `<button class="dtab${ui.tab === k ? ' on' : ''}" data-wt="${k}">${esc(l)}</button>`).join('')}</div><div class="wbottom" id="wbw_bot"></div></div>`;
    const $ = (s) => el.querySelector(s), L = $('#wbw_l'), RP = $('#wbw_rp'), LS = $('#wbw_ls'), RS = $('#wbw_rs');

    // ---- rows
    const ddX = p.dataDate != null && p.dataDate >= P.s0 && p.dataDate < P.e0 ? px(p.dataDate) : null;
    const lines = [], bars = [];
    rows.forEach((r, i) => {
      const x = X(r.w, r.lv), on = ui.sel.has(r.w.id), cur = ui.cur === r.w.id, top = i * RH;
      const lc = C.lvc ? WC[r.lv % 5] : null, st = lc && !on ? `background:${lc[0]};color:${lc[1]};font-weight:700;` : '';
      const cells = cols.map((c) => {
        let inner;
        if (c.tree) inner = `<span class="wbw-ind" style="width:${r.lv * 16}px"></span><span class="wbw-tg${r.has ? '' : ' nl'}" data-tog="${r.w.id}">${r.has ? (colSet().has(r.w.id) ? '+' : '−') : ''}</span><span class="wbw-ic${r.has ? ' fd' : ''}"></span><span class="wbw-t">${esc(r.w.code)}</span>`;
        else if (c.k === 'name') inner = `<span class="wbw-t">${esc(r.w.name)}</span>`;
        else inner = esc(c.v ? c.v(x) : '');
        return `<div class="wbw-c${c.r ? ' r' : ''}" data-k="${c.k}" style="width:${c.w}px" dir="auto">${inner}</div>`;
      }).join('');
      lines.push(`<div class="wbw-r${on ? ' sel' : ''}${cur ? ' cur' : ''}" draggable="true" data-id="${r.w.id}" style="top:${top}px;width:${lw}px;${st}">${cells}</div>`);
      const q = x.ru;
      let b = `<div class="wbw-rr${on ? ' sel' : ''}" data-id="${r.w.id}" style="top:${top}px;width:${P.per.length * cw}px">`;
      if (q && q.es != null) {
        const a = px(q.es), z = Math.max(a + 3, px(q.ef + 1)), pc = Math.min(100, q.pct || 0);
        if (C.base && q.bs != null) { const ba = px(q.bs), bz = Math.max(ba + 3, px(q.bf + 1)); b += `<i class="wbw-bb" style="left:${ba}px;width:${bz - ba}px"></i>`; }
        b += `<i class="wbw-bar${q.crit ? ' cr' : ''}" style="left:${a}px;width:${z - a}px"><u style="width:${pc}%"></u></i><span class="wbw-bl" style="left:${z + 4}px">${esc(fmtD(q.ef))}</span>`;
      }
      bars.push(b + '</div>');
    });
    LS.innerHTML = lines.join(''); RS.innerHTML = (ddX != null ? `<i class="wbw-dd" style="left:${ddX}px"></i>` : '') + bars.join('');

    // ---- scroll sync + sizes
    RP.scrollTop = keep.top; RP.scrollLeft = keep.rx; L.scrollLeft = keep.lx; L.scrollTop = keep.top;
    let lock = false; RP.onscroll = () => { if (!lock) { lock = true; L.scrollTop = RP.scrollTop; lock = false; } };
    L.onwheel = (e) => { if (e.shiftKey) return; RP.scrollTop += e.deltaY; e.preventDefault(); };
    if (!C.bars) { L.style.flex = '1'; L.style.width = 'auto'; $('#wbw_gut').style.display = 'none'; L.onwheel = null; L.style.overflowY = 'auto'; }
    // splitter
    $('#wbw_gut').onmousedown = (e) => { e.preventDefault(); const x0 = e.clientX, w0 = L.offsetWidth; const mv = (ev) => { C.split = Math.max(240, w0 + (ev.clientX - x0)); L.style.width = C.split + 'px'; }; const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); App.saveCfg(); }; addEventListener('mousemove', mv); addEventListener('mouseup', up); };
    // column resize
    el.querySelectorAll('.wbw-rz').forEach((h) => { h.onmousedown = (e) => { e.preventDefault(); e.stopPropagation(); const i = +h.dataset.i, x0 = e.clientX, w0 = C.cols[i].w || COLS[C.cols[i].k].w; const up = (ev) => { removeEventListener('mouseup', up); C.cols[i].w = Math.max(40, w0 + (P6.dir() === 'rtl' ? 0 : 1) * (ev.clientX - x0)); App.saveCfg(); App.renderWin(); }; addEventListener('mouseup', up); }; });
    // header drag to reorder columns
    el.querySelectorAll('.wbw-h').forEach((h) => { h.draggable = true; h.ondragstart = (e) => { ui.colDrag = +h.dataset.i; e.dataTransfer.setData('text/plain', 'col'); }; h.ondragover = (e) => { if (ui.colDrag != null) e.preventDefault(); }; h.ondrop = (e) => { if (ui.colDrag == null) return; e.preventDefault(); const a = ui.colDrag, b = +h.dataset.i; ui.colDrag = null; if (a === b) return; const [m] = C.cols.splice(a, 1); C.cols.splice(b, 0, m); App.saveCfg(); App.renderWin(); }; });

    // ---- selection / interaction
    const rowEl = (id) => el.querySelector(`.wbw-r[data-id="${id}"]`);
    const select = (id, e) => {
      const ids = rows.map((r) => r.w.id);
      if (e && e.shiftKey && ui.anchor != null) { const a = ids.indexOf(ui.anchor), b = ids.indexOf(id); if (a >= 0 && b >= 0) ui.sel = new Set(ids.slice(Math.min(a, b), Math.max(a, b) + 1)); }
      else if (e && (e.ctrlKey || e.metaKey)) { if (ui.sel.has(id)) ui.sel.delete(id); else ui.sel.add(id); ui.anchor = id; }
      else { ui.sel = new Set([id]); ui.anchor = id; }
      ui.cur = id; paint(); bottom();
    };
    const paint = () => { el.querySelectorAll('.wbw-r,.wbw-rr').forEach((n) => { const id = +n.dataset.id; n.classList.toggle('sel', ui.sel.has(id)); n.classList.toggle('cur', ui.cur === id); }); };
    const ensureVis = (id) => { const i = rows.findIndex((r) => r.w.id === id); if (i < 0) return; const y = i * RH, v = RP.style.display === 'none' ? L : RP; if (y < v.scrollTop) v.scrollTop = y; else if (y + RH > v.scrollTop + v.clientHeight - HH - 16) v.scrollTop = y + RH - v.clientHeight + HH + 16; };
    LS.onmousedown = (e) => { const tg = e.target.closest('[data-tog]'); if (tg) return; const r = e.target.closest('.wbw-r'); if (r && !(e.target.closest('.wbw-in'))) { if (e.button === 2 && ui.sel.has(+r.dataset.id)) return; select(+r.dataset.id, e); L.focus(); } };
    RS.onmousedown = (e) => { const r = e.target.closest('.wbw-rr'); if (r) { select(+r.dataset.id, e); L.focus(); } };
    LS.onclick = (e) => { const tg = e.target.closest('[data-tog]'); if (!tg) return; const id = +tg.dataset.tog, cs = colSet(); if (cs.has(id)) cs.delete(id); else cs.add(id); App.renderWin(); };
    LS.ondblclick = (e) => { const c = e.target.closest('.wbw-c'), r = e.target.closest('.wbw-r'); if (!c || !r || e.target.closest('[data-tog]')) return; const k = c.dataset.k; if (k === 'code' || k === 'name') startEdit(+r.dataset.id, k); else { const w = Mo.by.get(+r.dataset.id), cs = colSet(); if (w && (Mo.kids.get(w.id) || []).length) { if (cs.has(w.id)) cs.delete(w.id); else cs.add(w.id); App.renderWin(); } } };
    const ctx = (e) => {
      const r = e.target.closest('.wbw-r,.wbw-rr'); if (r && !ui.sel.has(+r.dataset.id)) select(+r.dataset.id); e.preventDefault();
      const has = ui.sel.size > 0, one = ui.sel.size === 1, tg = ui.cur;
      App.popMenu([
        { i: 'wbsadd', l: B('Add WBS', 'إضافة WBS'), k: 'Ins', fn: cmds.add }, '-',
        { i: 'cut', l: t('cut'), k: 'Ctrl+X', dis: !has, fn: cmds.cut }, { i: 'copy', l: B('Copy (with activities)', 'نسخ (مع الأنشطة)'), k: 'Ctrl+C', dis: !has, fn: () => cmds.copy(false) }, { l: B('Copy (structure only)', 'نسخ (الهيكل فقط)'), dis: !has, fn: () => cmds.copy(true) },
        { i: 'paste', l: B('Paste into selected', 'لصق داخل المحدد'), k: 'Ctrl+V', dis: !ui.clip || !one, fn: () => cmds.paste(tg) }, { l: B('Duplicate', 'تكرار'), k: 'Ctrl+D', dis: !has, fn: cmds.dup }, '-',
        { l: B('Move up', 'تحريك لأعلى'), k: 'Ctrl+↑', dis: !has, fn: cmds.up }, { l: B('Move down', 'تحريك لأسفل'), k: 'Ctrl+↓', dis: !has, fn: cmds.down },
        { i: 'indent', l: t('indent'), k: 'Ctrl+→', dis: !has, fn: cmds.indent }, { i: 'outdent', l: t('outdent'), k: 'Ctrl+←', dis: !has, fn: cmds.outdent }, { l: B('Renumber codes', 'إعادة ترقيم الأكواد'), dis: !has, fn: cmds.renumber }, '-',
        { l: B('Rename', 'إعادة تسمية'), k: 'F2', dis: !one, fn: () => startEdit(tg, 'name') }, { l: B('Expand subtree', 'فتح الفرع'), dis: !has, fn: () => cmds.expandSub(true) }, { l: B('Collapse subtree', 'طي الفرع'), dis: !has, fn: () => cmds.expandSub(false) }, '-',
        { i: 'del', l: t('delete'), k: 'Del', dis: !has, fn: cmds.del }
      ], e.clientX, e.clientY);
    };
    LS.oncontextmenu = ctx; RS.oncontextmenu = ctx;

    // ---- drag & drop (rows)
    let dropEl = null; const clearDrop = () => { el.querySelectorAll('.dr-in,.dr-bef,.dr-aft').forEach((n) => n.classList.remove('dr-in', 'dr-bef', 'dr-aft')); dropEl = null; };
    LS.ondragstart = (e) => { const r = e.target.closest('.wbw-r'); if (!r || editing != null) { e.preventDefault(); return; } const id = +r.dataset.id; if (!ui.sel.has(id)) { ui.sel = new Set([id]); ui.cur = id; paint(); } ui.drag = [...ui.sel]; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'wbs'); };
    LS.ondragover = (e) => {
      if (!ui.drag) return; const r = e.target.closest('.wbw-r'); if (!r) return; e.preventDefault(); clearDrop();
      const bb = r.getBoundingClientRect(), f = (e.clientY - bb.top) / bb.height, id = +r.dataset.id;
      r.dataset.pos = f < 0.25 ? 'before' : f > 0.75 ? 'after' : 'in'; r.classList.add(r.dataset.pos === 'in' ? 'dr-in' : r.dataset.pos === 'before' ? 'dr-bef' : 'dr-aft'); dropEl = id;
      const L2 = L.getBoundingClientRect(), y = e.clientY - L2.top; if (y < HH + 20) RP.scrollTop -= 14; else if (y > L2.height - 24) RP.scrollTop += 14;
    };
    LS.ondragleave = (e) => { if (!e.relatedTarget || !LS.contains(e.relatedTarget)) clearDrop(); };
    LS.ondrop = (e) => { if (!ui.drag) return; e.preventDefault(); const r = e.target.closest('.wbw-r'); const ids = ui.drag; ui.drag = null; if (!r) { clearDrop(); return; } const pos = r.dataset.pos || 'in', tgt = Mo.by.get(+r.dataset.id); clearDrop(); if (tgt) moveNodes(ids.map((i) => Mo.by.get(i)).filter(Boolean), tgt, pos); };
    LS.ondragend = () => { ui.drag = null; clearDrop(); };

    // ---- keyboard
    L.onkeydown = (e) => {
      if (editing != null || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      const k = e.key, mod = e.ctrlKey || e.metaKey; let used = true;
      const ids = rows.map((r) => r.w.id), ci = Math.max(0, ids.indexOf(ui.cur)), go = (i, ex) => { i = Math.max(0, Math.min(ids.length - 1, i)); const id = ids[i]; if (ex) { select(id, { shiftKey: true }); } else select(id); ensureVis(id); };
      if (mod && k === 'ArrowUp') cmds.up(); else if (mod && k === 'ArrowDown') cmds.down(); else if (mod && k === 'ArrowRight') cmds.indent(); else if (mod && k === 'ArrowLeft') cmds.outdent();
      else if (k === 'ArrowUp') go(ci - 1, e.shiftKey); else if (k === 'ArrowDown') go(ci + 1, e.shiftKey); else if (k === 'Home') go(0, e.shiftKey); else if (k === 'End') go(ids.length - 1, e.shiftKey);
      else if (k === 'PageUp') go(ci - 15, e.shiftKey); else if (k === 'PageDown') go(ci + 15, e.shiftKey);
      else if (k === 'ArrowRight' || k === '+' || k === 'Add') { const w = Mo.by.get(ui.cur); if (w && colSet().has(w.id)) { colSet().delete(w.id); App.renderWin(); } else if (k === 'ArrowRight') go(ci + 1); }
      else if (k === 'ArrowLeft' || k === '-' || k === 'Subtract') { const w = Mo.by.get(ui.cur); if (w && (Mo.kids.get(w.id) || []).length && !colSet().has(w.id)) { colSet().add(w.id); App.renderWin(); } else if (k === 'ArrowLeft' && w && w.parent != null) go(ids.indexOf(w.parent)); }
      else if (k === 'Insert') cmds.add(); else if (k === 'Delete') cmds.del(); else if (k === 'F2' || k === 'Enter') startEdit(ui.cur, 'name');
      else if (mod && k.toLowerCase() === 'c') cmds.copy(e.shiftKey); else if (mod && k.toLowerCase() === 'x') cmds.cut(); else if (mod && k.toLowerCase() === 'v') cmds.paste(); else if (mod && k.toLowerCase() === 'd') cmds.dup();
      else if (mod && k.toLowerCase() === 'a') { ui.sel = new Set(ids); paint(); }
      else used = false;
      if (used) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); }
    };

    // ---- toolbar
    el.querySelector('.wbw-dock').onclick = (e) => {
      const b = e.target.closest('[data-a]'); if (!b || b.disabled || b.tagName === 'SELECT' || b.tagName === 'INPUT') return;
      const a = b.dataset.a; if (a === 'add') cmds.add(); else if (a === 'del') cmds.del(); else if (a === 'cut') cmds.cut(); else if (a === 'copy') cmds.copy(false); else if (a === 'copys') cmds.copy(true); else if (a === 'paste') cmds.paste(); else if (a === 'dup') cmds.dup();
      else if (a === 'up') cmds.up(); else if (a === 'down') cmds.down(); else if (a === 'indent') cmds.indent(); else if (a === 'outdent') cmds.outdent(); else if (a === 'renum') cmds.renumber();
      else if (a === 'cols') colDialog(); else if (a === 'exp') cmds.expandAll(); else if (a === 'col') cmds.collapseAll();
    };
    el.querySelector('.wbw-dock').onchange = (e) => { const a = e.target.dataset.a; if (!a) return; if (a === 'unit') C.unit = e.target.value; else C[a] = e.target.checked; App.saveCfg(); App.renderWin(); };
    el.querySelectorAll('.wtabs [data-wt]').forEach((b) => { b.onclick = () => { ui.tab = b.dataset.wt; el.querySelectorAll('.wtabs .dtab').forEach((x) => x.classList.toggle('on', x === b)); bottom(); }; });

    // ---- bottom panel
    function bottom() {
      const bot = $('#wbw_bot'), w = ui.cur != null ? Mo.by.get(ui.cur) : null; if (!w) { bot.innerHTML = ''; return; }
      const x = X(w, 0), f = (l, inner, c) => `<div class="fld ${c || ''}"><label>${esc(l)}</label>${inner}</div>`, inp = (k, v, ro) => `<input data-f="${k}" dir="auto" value="${esc(v == null ? '' : v)}"${ro ? ' readonly' : ''}>`;
      const dIn = (k, v) => `<input data-f="${k}" dir="ltr" placeholder="dd-Mon-yy" value="${esc(fmtD(v))}">`;
      let h = '';
      if (ui.tab === 'general') {
        h = `<div class="grid2">${f(B('WBS Code', 'كود WBS'), inp('code', w.code))}${f(B('WBS Name', 'اسم WBS'), inp('name', w.name), 'w2')}
          ${f(B('Status', 'الحالة'), `<select data-f="status">${STATUS.map((s) => `<option${(w.status || 'Active') === s ? ' selected' : ''}>${s}</option>`).join('')}</select>`)}
          ${f(B('Responsible Manager', 'المدير المسؤول'), inp('resp', w.resp || ''), 'w2')}
          ${f(B('Parent WBS', 'WBS الأب'), `<select data-f="parent"><option value="">—</option>${Mo.p.wbs.filter((q) => !isAnc(Mo, w, q)).map((q) => `<option value="${q.id}"${w.parent === q.id ? ' selected' : ''}>${esc(q.code + ' – ' + q.name)}</option>`).join('')}</select>`)}
          ${f(B('Anticipated Start', 'البداية المتوقعة'), dIn('antS', w.antS))}${f(B('Anticipated Finish', 'النهاية المتوقعة'), dIn('antF', w.antF))}</div>`;
      } else if (ui.tab === 'notes') h = `<div class="fld"><label>${esc(B('Notebook', 'الملاحظات'))}</label><textarea data-f="notes" rows="6" dir="auto">${esc(w.notes || '')}</textarea></div>`;
      else if (ui.tab === 'blog') {
        const lg = w.budgetLog || [];
        h = `<table class="mini"><thead><tr><th style="width:110px">${esc(B('Date', 'التاريخ'))}</th><th style="width:140px">${esc(B('Amount', 'المبلغ'))}</th><th>${esc(B('Remarks', 'ملاحظات'))}</th><th style="width:26px"></th></tr></thead><tbody>${lg.map((q, i) => `<tr data-i="${i}"><td><input data-bl="d" dir="ltr" value="${esc(fmtD(q.d))}"></td><td><input data-bl="a" dir="ltr" class="r" value="${esc(q.a)}"></td><td><input data-bl="r" dir="auto" value="${esc(q.r || '')}"></td><td><button class="ib" data-bldel="${i}">×</button></td></tr>`).join('') || `<tr><td colspan="4" class="empty">${esc(t('empty_list'))}</td></tr>`}</tbody><tfoot><tr><td><b>${esc(B('Total', 'الإجمالي'))}</b></td><td class="r"><b>${money(lg.reduce((s, q) => s + (+q.a || 0), 0))}</b></td><td colspan="2"></td></tr></tfoot></table><button class="btn sm" data-bladd="1" style="margin-top:6px">+ ${esc(t('add'))}</button>`;
      } else if (ui.tab === 'bsum') {
        const lg = (w.budgetLog || []).reduce((s, q) => s + (+q.a || 0), 0), m = x.m;
        h = `<table class="mini"><tbody>${[[B('Budgeted total cost (activities)', 'إجمالي التكلفة المخططة (الأنشطة)'), money(m.bc)], [B('Actual total cost', 'التكلفة الفعلية'), money(m.ac)], [B('Approved budget (budget log)', 'الميزانية المعتمدة (السجل)'), money(lg)], [B('Variance (budget log − activities)', 'الفرق (السجل − الأنشطة)'), money(lg - (m.bc || 0))]].map(([a, b]) => `<tr><td style="width:300px">${esc(a)}</td><td class="r">${esc(b)}</td></tr>`).join('')}</tbody></table>`;
      } else if (ui.tab === 'ms') {
        const ids = new Set(subtree(Mo, w).map((q) => q.id)), ms = Mo.p.tasks.filter((q) => ids.has(q.wbs) && P6.isMile(q)).sort((a, b) => (a.es || 0) - (b.es || 0));
        h = `<table class="mini"><thead><tr><th style="width:110px">${esc(t('col_code'))}</th><th>${esc(t('col_name'))}</th><th style="width:110px">${esc(B('Date', 'التاريخ'))}</th><th style="width:90px">${esc(t('col_status'))}</th></tr></thead><tbody>${ms.map((q) => `<tr><td>${esc(q.code)}</td><td dir="auto">${esc(q.name)}</td><td>${esc(fmtD(q.type === 'TT_FinMile' ? q.ef : q.es))}</td><td>${esc(q.status)}</td></tr>`).join('') || `<tr><td colspan="4" class="empty">${esc(t('empty_list'))}</td></tr>`}</tbody></table>`;
      } else if (ui.tab === 'ev') {
        const q = x.ru, rem = q.rem;
        h = `<table class="mini"><tbody>${[[B('Activities', 'الأنشطة'), q.count], [B('Not started / In progress / Completed', 'لم تبدأ / جارية / مكتملة'), `${q.nNS} / ${q.nIP} / ${q.nC}`], [B('Critical activities', 'الأنشطة الحرجة'), q.nCrit], [B('Activity % complete (duration weighted)', 'نسبة الإنجاز (موزونة بالمدة)'), (q.pct || 0) + '%'], [B('Remaining duration (days)', 'المدة المتبقية (أيام)'), rem], [B('Start → Finish', 'البداية ← النهاية'), fmtD(q.es) + ' → ' + fmtD(q.ef)], [B('Baseline start → finish', 'بداية ← نهاية الخط المرجعي'), q.bs != null ? fmtD(q.bs) + ' → ' + fmtD(q.bf) : '—'], [B('Budgeted cost / Actual cost', 'التكلفة المخططة / الفعلية'), money(x.m.bc) + ' / ' + money(x.m.ac)]].map(([a, b]) => `<tr><td style="width:340px">${esc(a)}</td><td class="r">${esc(b)}</td></tr>`).join('')}</tbody></table>`;
      }
      bot.innerHTML = h;
      bot.onchange = (e) => {
        const xx = e.target;
        if (xx.dataset.bl != null) { const i = +xx.closest('tr').dataset.i; App.mutate(t('edit'), () => { const q = w.budgetLog[i]; if (xx.dataset.bl === 'd') { const d = P6.parseDate(xx.value); if (d != null) q.d = d; } else if (xx.dataset.bl === 'a') q.a = parseFloat(String(xx.value).replace(/,/g, '')) || 0; else q.r = xx.value; }, { noSched: true }); return; }
        const fld = xx.dataset.f; if (!fld) return;
        App.mutate(t('edit'), () => {
          if (fld === 'code') { const v = xx.value.trim(); if (!v) return; if (sibs(Mo, w).some((q) => q !== w && String(q.code) === v)) return B('This code already exists under the same parent', 'الكود موجود بالفعل تحت نفس الأب'); w.code = v; }
          else if (fld === 'parent') { const np = xx.value === '' ? null : +xx.value; if (np != null && isAnc(Mo, w, Mo.by.get(np))) return t('err_loop'); if (np == null) return B('A project needs a single root WBS', 'المشروع يحتاج WBS جذر واحد'); w.parent = np; w.seq = (Mo.kids.get(np) || []).length + 1; w.code = uniqCode(Mo, np, w.code, w); }
          else if (fld === 'antS' || fld === 'antF') { const d = xx.value.trim() ? P6.parseDate(xx.value) : null; w[fld] = d; }
          else w[fld] = xx.value;
        }, { noSched: true });
      };
      bot.onclick = (e) => {
        if (e.target.dataset.bladd) { App.mutate(t('add'), () => { w.budgetLog = w.budgetLog || []; w.budgetLog.push({ d: Mo.p.dataDate, a: 0, r: '' }); }, { noSched: true }); }
        else if (e.target.dataset.bldel != null) { App.mutate(t('delete'), () => { w.budgetLog.splice(+e.target.dataset.bldel, 1); }, { noSched: true }); }
      };
      bot.onkeydown = (e) => e.stopPropagation();
    }
    bottom();
    if (ui.focusAfter) { ui.focusAfter = false; }
  }

  /* ------------------------------------------------------------ columns dialog */
  function colDialog() {
    const C = cfg(), body = document.createElement('div');
    let sel = C.cols.map((c) => ({ k: c.k, w: c.w }));
    const draw = () => {
      const avail = Object.keys(COLS).filter((k) => !sel.some((s) => s.k === k));
      body.innerHTML = `<div class="wbw-cd"><div><h4>${esc(B('Available options', 'الأعمدة المتاحة'))}</h4><div class="wbw-cl">${avail.map((k) => `<div class="wbw-ci" data-add="${k}">${esc(lab(k))}<b>▶</b></div>`).join('')}</div></div>
        <div><h4>${esc(B('Selected options (order = column order)', 'الأعمدة المختارة (الترتيب = ترتيب الأعمدة)'))}</h4><div class="wbw-cl">${sel.map((s, i) => `<div class="wbw-ci" data-i="${i}"><span>${esc(lab(s.k))}</span><span><b data-up="${i}">▲</b><b data-dn="${i}">▼</b>${s.k === 'code' || s.k === 'name' ? '' : `<b data-rm="${i}">✕</b>`}</span></div>`).join('')}</div></div></div>`;
    };
    draw();
    body.onclick = (e) => {
      const a = e.target.closest('[data-add]'), u = e.target.closest('[data-up]'), d = e.target.closest('[data-dn]'), r = e.target.closest('[data-rm]');
      if (a) sel.push({ k: a.dataset.add, w: COLS[a.dataset.add].w }); else if (u) { const i = +u.dataset.up; if (i > 0) [sel[i - 1], sel[i]] = [sel[i], sel[i - 1]]; } else if (d) { const i = +d.dataset.dn; if (i < sel.length - 1) [sel[i + 1], sel[i]] = [sel[i], sel[i + 1]]; } else if (r) sel.splice(+r.dataset.rm, 1); else return;
      draw();
    };
    D.modal({ title: B('WBS Columns', 'أعمدة WBS'), cls: 'mid', body, buttons: [{ label: B('Defaults', 'الافتراضي'), fn: () => { C.cols = DEF_COLS.map((k) => ({ k, w: COLS[k].w })); App.saveCfg(); App.renderWin(); } }, { label: t('ok') || 'OK', cls: 'pri', fn: () => { if (sel.length) { C.cols = sel; App.saveCfg(); App.renderWin(); } } }, { label: t('cancel') || 'Cancel', fn: () => {} }] });
  }

  App.renderWbsWin = render;
  App.wbsCmds = cmds;
})(window);

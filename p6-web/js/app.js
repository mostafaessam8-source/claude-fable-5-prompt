/* P6 Web – application: state, persistence, table, details panel, commands, menus. */
(function (g) {
  'use strict';
  const P6 = g.P6;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = P6.esc;
  const t = (k, ...a) => P6.t(k, ...a);

  const ZOOMS = [60, 36, 20, 12, 6, 3, 1.6, 0.8, 0.4];
  const ALL_COLS = {
    code: { w: 90, ed: 'text', sort: 1 }, name: { w: 270, ed: 'text', sort: 1 },
    type: { w: 100, ed: 'sel' }, wbs: { w: 90 }, status: { w: 96, ed: 'sel' },
    dur: { w: 72, ed: 'num', r: 1, sort: 1 }, rem: { w: 72, ed: 'num', r: 1 }, pct: { w: 82, ed: 'num', r: 1, sort: 1 },
    es: { w: 90, ed: 'date', r: 1, sort: 1 }, ef: { w: 90, ed: 'date', r: 1, sort: 1 },
    as: { w: 90, ed: 'date', r: 1 }, af: { w: 90, ed: 'date', r: 1 },
    ls: { w: 90, r: 1 }, lf: { w: 90, r: 1 },
    tf: { w: 92, r: 1, sort: 1 }, ff: { w: 84, r: 1 },
    pred: { w: 160, ed: 'text' }, succ: { w: 140 },
    cal: { w: 130, ed: 'sel' }, cstr: { w: 110, ed: 'sel' }, cdate: { w: 90, ed: 'date', r: 1 },
    bs: { w: 90, r: 1 }, bf: { w: 90, r: 1 }, vs: { w: 66, r: 1 }, vf: { w: 66, r: 1 }, res: { w: 130 }
  };
  const DEF_COLS = ['code', 'name', 'dur', 'rem', 'pct', 'es', 'ef', 'tf', 'pred'];
  const TYPES = ['TT_Task', 'TT_Mile', 'TT_FinMile', 'TT_LOE'];
  const CSTRS = ['', 'SNET', 'SNLT', 'FNET', 'FNLT', 'MSO', 'MFO', 'ALAP'];

  const S = (g.App = {
    p: null, sel: new Set(), focus: null, anchor: null, cell: null, rows: [], rowIdx: new Map(), ru: new Map(),
    collapsed: new Set(), undo: [], redo: [], dirty: false, minDay: 0, maxDay: 0, tab: 'general',
    cfg: {
      lang: 'ar', theme: 'light', cols: DEF_COLS.map((k) => ({ k, w: ALL_COLS[k].w })), pxIdx: 3, tableW: 700, detH: 230, detOpen: true,
      show: { base: true, crit: true, rels: true, labels: true, float: false, today: true }, group: 'wbs', sort: 'code', sortDir: 1,
      auto: true, filter: { text: '', mode: 'all' }
    }
  });
  const CFG_KEY = 'p6web.cfg';
  function loadCfg() {
    try {
      const c = JSON.parse(localStorage.getItem(CFG_KEY) || 'null');
      if (c) { Object.assign(S.cfg, c); S.cfg.show = Object.assign({ base: true, crit: true, rels: true, labels: true, float: false, today: true }, c.show); S.cfg.filter = Object.assign({ text: '', mode: 'all' }, c.filter); }
    } catch (e) { /* ignore */ }
    if (!S.cfg.cols.every((c) => ALL_COLS[c.k])) S.cfg.cols = DEF_COLS.map((k) => ({ k, w: ALL_COLS[k].w }));
  }
  function saveCfg() { try { localStorage.setItem(CFG_KEY, JSON.stringify(S.cfg)); } catch (e) { /* ignore */ } }

  // ================= persistence (IndexedDB) =================
  let _db = null;
  function db() {
    if (_db) return _db;
    _db = new Promise((res, rej) => {
      let rq;
      try { rq = indexedDB.open('p6web', 1); } catch (e) { return rej(e); }
      rq.onupgradeneeded = () => { const d = rq.result; d.createObjectStore('projects', { keyPath: 'id' }); d.createObjectStore('raw'); };
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
    return _db;
  }
  const idb = (store, mode, fn) => db().then((d) => new Promise((res, rej) => { const tx = d.transaction(store, mode); const r = fn(tx.objectStore(store)); tx.oncomplete = () => res(r && r.result); tx.onerror = () => rej(tx.error); }));
  const json = (p) => JSON.stringify(p, (k, v) => (k === 'xer' ? undefined : v));
  let saveTimer = null, rawSaved = null;
  function scheduleSave() {
    S.dirty = true; updateStatus();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 700);
  }
  async function saveNow() {
    if (!S.p) return;
    try {
      const p = S.p;
      await idb('projects', 'readwrite', (st) => st.put({ id: p.id, name: p.name, updated: Date.now(), tasks: p.tasks.length, start: p.start, finish: p.finish, data: json(p) }));
      if (p.xer && rawSaved !== p.id) { await idb('raw', 'readwrite', (st) => st.put(p.xer, p.id)); rawSaved = p.id; }
      localStorage.setItem('p6web.last', p.id);
      S.dirty = false;
    } catch (e) { toast(t('save_fail'), true); }
    updateStatus();
  }
  async function listProjects() { try { return (await idb('projects', 'readonly', (st) => st.getAll())) || []; } catch (e) { return []; } }
  async function loadProject(id) {
    const rec = await idb('projects', 'readonly', (st) => st.get(id));
    if (!rec) return null;
    const p = JSON.parse(rec.data);
    try { p.xer = (await idb('raw', 'readonly', (st) => st.get(id))) || null; } catch (e) { p.xer = null; }
    rawSaved = p.xer ? id : null;
    return p;
  }
  async function deleteProject(id) { await idb('projects', 'readwrite', (st) => st.delete(id)); try { await idb('raw', 'readwrite', (st) => st.delete(id)); } catch (e) { /* ignore */ } }

  // ================= undo / mutate =================
  const snapshot = () => json(S.p);
  function restore(js) {
    const xer = S.p.xer;
    const p = JSON.parse(js);
    p.xer = xer;
    S.p = p;
  }
  function mutate(label, fn, opt) {
    opt = opt || {};
    const snap = snapshot();
    if (S.cfg.auto && S.p.imported && !opt.noSched) {
      // tell the user how far this engine's dates are from the dates stored in the imported P6 file
      const trial = JSON.parse(snap); P6.schedule(trial);
      const before = new Map(S.p.tasks.map((x) => [x.id, x]));
      let n = 0; for (const x of trial.tasks) { const b = before.get(x.id); if (b && (b.es !== x.es || b.ef !== x.ef)) n++; }
      setTimeout(() => toast(t(n ? 'resched_diff' : 'resched_same', n, S.p.tasks.length), n > 0), 50);
    }
    const r = fn();
    if (typeof r === 'string') { restore(snap); toast(r, true); refresh(); return false; }
    S.undo.push({ label, snap });
    if (S.undo.length > 60) S.undo.shift();
    S.redo = [];
    if (S.cfg.auto && !opt.noSched) { P6.schedule(S.p); S.p.imported = false; }
    scheduleSave();
    refresh(opt.refresh);
    return true;
  }
  function undo() {
    const u = S.undo.pop(); if (!u) return;
    S.redo.push({ label: u.label, snap: snapshot() });
    restore(u.snap); scheduleSave(); fixSel(); refresh({ details: true }); toast(t('undone', u.label));
  }
  function redo() {
    const u = S.redo.pop(); if (!u) return;
    S.undo.push({ label: u.label, snap: snapshot() });
    restore(u.snap); scheduleSave(); fixSel(); refresh({ details: true }); toast(t('redone', u.label));
  }
  function fixSel() {
    const ids = new Set(S.p.tasks.map((x) => 't' + x.id)); S.p.wbs.forEach((w) => ids.add('w' + w.id));
    for (const k of [...S.sel]) if (!ids.has(k)) S.sel.delete(k);
    if (S.focus && !ids.has(S.focus)) S.focus = null;
  }

  // ================= helpers =================
  const taskById = (id) => S.p.tasks.find((x) => x.id === id);
  const wbsById = (id) => S.p.wbs.find((x) => x.id === id);
  const calOf = (task) => S.p.cals.find((c) => c.id === task.cal) || S.p.cals.find((c) => c.id === S.p.defCal) || S.p.cals[0];
  const nat = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
  const fmtD = (d) => P6.fmtDate(d);
  const fmtN = (n) => (n == null || !isFinite(n) ? '' : (Math.round(n * 100) / 100).toString());
  const selTasks = () => [...S.sel].filter((k) => k[0] === 't').map((k) => taskById(+k.slice(1))).filter(Boolean);
  const selWbs = () => [...S.sel].filter((k) => k[0] === 'w').map((k) => wbsById(+k.slice(1))).filter(Boolean);
  const focusRow = () => (S.focus ? S.rows[S.rowIdx.get(S.focus)] : null);
  const focusTask = () => { const r = focusRow(); return r && r.kind === 't' ? r.t : null; };
  function toast(msg, err) {
    const d = document.createElement('div');
    d.className = 'toast' + (err ? ' err' : '');
    d.textContent = msg;
    $('#toasts').appendChild(d);
    setTimeout(() => d.remove(), err ? 4500 : 2600);
  }
  function download(name, data, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ================= view model =================
  function matchesFilter(tk) {
    const f = S.cfg.filter;
    if (f.mode === 'critical' && !tk.crit) return false;
    if (f.mode === 'IP' && tk.status !== 'IP') return false;
    if (f.mode === 'NS' && tk.status !== 'NS') return false;
    if (f.mode === 'C' && tk.status !== 'C') return false;
    if (f.mode === 'late' && !(tk.status !== 'C' && tk.bf != null && tk.ef != null && tk.ef > tk.bf)) return false;
    if (f.mode === 'neg' && !(tk.tf != null && tk.tf < 0)) return false;
    if (f.text) { const q = f.text.toLowerCase(); if (!(tk.code.toLowerCase().includes(q) || tk.name.toLowerCase().includes(q))) return false; }
    return true;
  }
  function sortVal(tk, k) {
    switch (k) {
      case 'code': return tk.code; case 'name': return tk.name; case 'es': return tk.es; case 'ef': return tk.ef;
      case 'tf': return tk.tf == null ? 1e9 : tk.tf; case 'dur': return tk.dur; case 'pct': return tk.pct; default: return tk.seq;
    }
  }
  function buildView() {
    const p = S.p;
    S.ru = P6.rollup(p);
    const filtering = !!(S.cfg.filter.text || S.cfg.filter.mode !== 'all');
    const cmp = (a, b) => {
      const va = sortVal(a, S.cfg.sort), vb = sortVal(b, S.cfg.sort);
      const c = typeof va === 'string' || typeof vb === 'string' ? nat(va, vb) : (va == null ? 1e12 : va) - (vb == null ? 1e12 : vb);
      return (c || nat(a.code, b.code)) * S.cfg.sortDir;
    };
    const rows = [];
    if (S.cfg.group === 'none') {
      for (const tk of p.tasks.filter(matchesFilter).sort(cmp)) rows.push({ kind: 't', id: tk.id, level: 0, t: tk });
    } else {
      const kids = new Map(); p.wbs.forEach((w) => kids.set(w.id, []));
      const roots = [];
      for (const w of p.wbs) { if (w.parent != null && kids.has(w.parent)) kids.get(w.parent).push(w); else roots.push(w); }
      const ws = (a, b) => (a.seq - b.seq) || nat(a.code, b.code);
      const tby = new Map();
      for (const tk of p.tasks) if (matchesFilter(tk)) { if (!tby.has(tk.wbs)) tby.set(tk.wbs, []); tby.get(tk.wbs).push(tk); }
      const cnt = new Map();
      const count = (w) => { let n = (tby.get(w.id) || []).length; for (const k of kids.get(w.id)) n += count(k); cnt.set(w.id, n); return n; };
      roots.forEach(count);
      const walk = (w, lv) => {
        if (filtering && !cnt.get(w.id)) return;
        const ks = kids.get(w.id).sort(ws), ts = (tby.get(w.id) || []).sort(cmp);
        rows.push({ kind: 'w', id: w.id, level: lv, w, hasKids: ks.length + ts.length > 0 });
        if (S.collapsed.has(w.id) && !filtering) return;
        for (const k of ks) walk(k, lv + 1);
        for (const tk of ts) rows.push({ kind: 't', id: tk.id, level: lv + 1, t: tk });
      };
      roots.sort(ws).forEach((w) => walk(w, 0));
    }
    S.rows = rows;
    S.rowIdx = new Map(rows.map((r, i) => [r.kind + r.id, i]));
    // timeline
    let mn = Infinity, mx = -Infinity;
    for (const tk of p.tasks) {
      for (const d of [tk.es, tk.bs, tk.as]) if (d != null && d < mn) mn = d;
      for (const d of [tk.ef, tk.bf, tk.af, tk.lf]) if (d != null && d > mx) mx = d;
    }
    if (!isFinite(mn)) { mn = p.planStart; mx = mn + 90; }
    mn = Math.min(mn, p.planStart, p.dataDate == null ? mn : p.dataDate);
    mx = Math.max(mx, p.dataDate == null ? mx : p.dataDate);
    S.minDay = mn - 21 - ((mn - 21 + 4) % 7 + 7) % 7 - 0;
    S.maxDay = mx + 90;
  }

  // ================= cell model =================
  const statusLabel = (s) => t('st_' + s);
  function cellOf(k, row) {
    const r = ALL_COLS[k] || {};
    const out = { text: '', cls: r.r ? 'r' : '', ro: !r.ed };
    if (row.kind === 'w') {
      const ru = S.ru.get(row.id) || {};
      out.ro = true;
      switch (k) {
        case 'code': out.text = row.w.code; out.ro = false; break;
        case 'name': out.text = row.w.name; out.ro = false; break;
        case 'dur': out.text = ru.dur ? fmtN(ru.dur) + 'd' : ''; break;
        case 'pct': out.text = ru.dur ? ru.pct + '%' : ''; break;
        case 'es': out.text = fmtD(ru.es); break; case 'ef': out.text = fmtD(ru.ef); break;
        case 'as': out.text = isFinite(ru.as) ? fmtD(ru.as) : ''; break;
        case 'af': out.text = ru.allC && isFinite(ru.af) ? fmtD(ru.af) : ''; break;
        case 'bs': out.text = fmtD(ru.bs); break; case 'bf': out.text = fmtD(ru.bf); break;
        case 'tf': out.text = ru.tf == null ? '' : fmtN(ru.tf) + 'd'; if (ru.tf != null && ru.tf < 0) out.cls += ' neg'; break;
        case 'vs': if (ru.bs != null && ru.es != null) out.text = fmtN(ru.es - ru.bs) + 'd'; break;
        case 'vf': if (ru.bf != null && ru.ef != null) { out.text = fmtN(ru.ef - ru.bf) + 'd'; if (ru.ef > ru.bf) out.cls += ' neg'; } break;
        default: break;
      }
      return out;
    }
    const tk = row.t;
    switch (k) {
      case 'code': out.text = tk.code; break;
      case 'name': out.text = tk.name; break;
      case 'type': out.text = t('type_' + tk.type); break;
      case 'wbs': out.text = (wbsById(tk.wbs) || {}).code || ''; break;
      case 'status': out.text = statusLabel(tk.status); out.cls += ' st-' + tk.status; break;
      case 'dur': out.text = fmtN(tk.dur) + 'd'; break;
      case 'rem': out.text = tk.status === 'C' ? '0d' : fmtN(tk.rem) + 'd'; break;
      case 'pct': out.text = tk.pct + '%'; break;
      case 'es': out.text = fmtD(tk.es); break; case 'ef': out.text = fmtD(tk.ef); break;
      case 'as': out.text = fmtD(tk.as); break; case 'af': out.text = fmtD(tk.af); break;
      case 'ls': out.text = tk.status === 'C' ? '' : fmtD(tk.ls); break; case 'lf': out.text = tk.status === 'C' ? '' : fmtD(tk.lf); break;
      case 'tf': out.text = tk.tf == null ? '' : fmtN(tk.tf) + 'd'; if (tk.tf != null && tk.tf < 0) out.cls += ' neg'; else if (tk.crit) out.cls += ' crit'; break;
      case 'ff': out.text = tk.ff == null ? '' : fmtN(tk.ff) + 'd'; break;
      case 'pred': out.text = P6.relText(S.p, tk); break;
      case 'succ': out.text = S.p.rels.filter((x) => x.p === tk.id).map((x) => { const b = taskById(x.s); return b ? b.code + (x.type !== 'FS' || x.lag ? x.type : '') + (x.lag ? (x.lag > 0 ? '+' : '') + x.lag : '') : ''; }).filter(Boolean).join(', '); break;
      case 'cal': out.text = (calOf(tk) || {}).name || ''; break;
      case 'cstr': out.text = tk.ct ? t('cs_' + tk.ct) : ''; break;
      case 'cdate': out.text = tk.ct ? fmtD(tk.cd) : ''; if (!tk.ct) out.ro = true; break;
      case 'bs': out.text = fmtD(tk.bs); break; case 'bf': out.text = fmtD(tk.bf); break;
      case 'vs': if (tk.bs != null && tk.es != null) out.text = fmtN(tk.es - tk.bs) + 'd'; if (tk.es > tk.bs) out.cls += ' neg'; break;
      case 'vf': if (tk.bf != null && tk.ef != null) out.text = fmtN(tk.ef - tk.bf) + 'd'; if (tk.ef > tk.bf) out.cls += ' neg'; break;
      case 'res': out.text = S.p.asg.filter((a) => a.task === tk.id).map((a) => (S.p.rsrc.find((r) => r.id === a.rsrc) || {}).name).filter(Boolean).join(', '); break;
      default: break;
    }
    if (P6.isMile(tk) && (k === 'dur' || k === 'rem') && false) out.text = '';
    return out;
  }
  function selectOpts(k, row) {
    if (k === 'type') return TYPES.map((x) => [x, t('type_' + x)]);
    if (k === 'status') return ['NS', 'IP', 'C'].map((x) => [x, statusLabel(x)]);
    if (k === 'cal') return S.p.cals.map((c) => [String(c.id), c.name]);
    if (k === 'cstr') return CSTRS.map((x) => [x, x ? t('cs_' + x) : '—']);
    if (k === 'wbs') return S.p.wbs.map((w) => [String(w.id), w.code + ' – ' + w.name]);
    return [];
  }
  function rawValue(k, row) {
    if (row.kind === 'w') return k === 'code' ? row.w.code : row.w.name;
    const tk = row.t;
    switch (k) {
      case 'dur': return fmtN(tk.dur); case 'rem': return fmtN(tk.status === 'C' ? 0 : tk.rem); case 'pct': return String(tk.pct);
      case 'es': return fmtD(tk.es); case 'ef': return fmtD(tk.ef); case 'as': return fmtD(tk.as); case 'af': return fmtD(tk.af); case 'cdate': return fmtD(tk.cd);
      case 'type': return tk.type; case 'status': return tk.status; case 'cal': return String(tk.cal); case 'cstr': return tk.ct || ''; case 'wbs': return String(tk.wbs);
      default: return cellOf(k, row).text;
    }
  }

  // ================= field editing =================
  function setStatus(tk, st) {
    const DD = S.p.dataDate;
    if (st === 'NS') { tk.status = 'NS'; tk.as = null; tk.af = null; tk.rem = tk.dur; tk.pct = 0; }
    else if (st === 'IP') {
      if (tk.status === 'C' || tk.status === 'NS') tk.rem = tk.rem > 0 && tk.rem <= tk.dur && tk.status !== 'C' ? tk.rem : tk.dur;
      tk.status = 'IP'; tk.af = null;
      if (tk.as == null) tk.as = tk.es != null && tk.es <= DD ? tk.es : DD;
    } else {
      tk.status = 'C';
      if (tk.as == null) tk.as = tk.es != null && tk.es <= DD ? tk.es : DD;
      if (tk.af == null) tk.af = tk.ef != null && tk.ef <= DD && tk.ef >= tk.as ? tk.ef : Math.max(DD, tk.as);
      tk.rem = 0; tk.pct = 100;
    }
  }
  function setPct(tk, v) {
    v = Math.max(0, Math.min(100, v));
    if (v >= 100) return setStatus(tk, 'C');
    if (v <= 0 && tk.pctType === 'dur') return setStatus(tk, 'NS');
    if (tk.status !== 'IP') setStatus(tk, 'IP');
    tk.pct = v;
    if (tk.pctType === 'dur') tk.rem = Math.round(tk.dur * (1 - v / 100) * 100) / 100;
  }
  // returns error text or undefined
  function applyField(tk, k, raw) {
    const num = () => { const v = parseFloat(String(raw).replace(',', '.')); return isFinite(v) ? v : NaN; };
    const date = () => { const s = String(raw).trim(); if (!s) return null; const d = P6.parseDate(s); return d == null ? undefined : d; };
    switch (k) {
      case 'code': {
        const c = String(raw).trim();
        if (!c) return t('err_code_empty');
        if (S.p.tasks.some((x) => x !== tk && x.code.toLowerCase() === c.toLowerCase())) return t('err_code_dup', c);
        tk.code = c; return;
      }
      case 'name': tk.name = String(raw); return;
      case 'type': {
        tk.type = raw;
        if (P6.isMile(tk)) { tk.dur = 0; tk.rem = 0; } else if (tk.dur === 0) { tk.dur = 1; tk.rem = tk.status === 'C' ? 0 : 1; }
        return;
      }
      case 'wbs': tk.wbs = +raw; return;
      case 'cal': tk.cal = isNaN(+raw) ? raw : +raw; return;
      case 'status': setStatus(tk, raw); return;
      case 'dur': {
        const v = num(); if (isNaN(v) || v < 0) return t('err_num');
        tk.dur = v; if (tk.status === 'NS') tk.rem = v; else if (tk.status === 'IP') tk.rem = Math.min(tk.rem, v);
        if (v === 0 && !P6.isMile(tk)) tk.type = 'TT_Mile';
        return;
      }
      case 'rem': {
        const v = num(); if (isNaN(v) || v < 0) return t('err_num');
        if (tk.status === 'C') return;
        if (tk.status === 'NS') { tk.dur = v; tk.rem = v; return; }
        tk.rem = v; if (v === 0) setStatus(tk, 'C'); else if (v > tk.dur) tk.dur = v;
        return;
      }
      case 'pct': { const v = num(); if (isNaN(v)) return t('err_num'); setPct(tk, v); return; }
      case 'es': {
        const d = date(); if (d === undefined) return t('err_date');
        if (d == null) { if (tk.status === 'NS') { tk.ct = ''; tk.cd = null; } return; }
        if (tk.status === 'NS') { tk.ct = 'SNET'; tk.cd = d; } else tk.as = d;
        return;
      }
      case 'ef': {
        const d = date(); if (d === undefined) return t('err_date');
        if (d == null) return;
        if (tk.status === 'C') { tk.af = Math.max(d, tk.as == null ? d : tk.as); return; }
        const cal = calOf(tk), st = tk.status === 'IP' ? tk.rs : tk.es;
        if (d < st) return t('err_finish_before');
        const n = Math.max(P6.isMile(tk) ? 0 : 1, P6.durBetween(cal, st, d));
        if (tk.status === 'IP') { tk.rem = n; } else { tk.dur = n; tk.rem = n; }
        return;
      }
      case 'as': {
        const d = date(); if (d === undefined) return t('err_date');
        if (d == null) { setStatus(tk, 'NS'); return; }
        tk.as = d; if (tk.status === 'NS') { setStatus(tk, 'IP'); tk.as = d; }
        if (tk.af != null && tk.af < d) tk.af = d;
        return;
      }
      case 'af': {
        const d = date(); if (d === undefined) return t('err_date');
        if (d == null) { if (tk.status === 'C') { tk.af = null; setStatus(tk, 'IP'); } return; }
        tk.af = d; if (tk.as == null || tk.as > d) tk.as = d;
        tk.status = 'C'; tk.rem = 0; tk.pct = 100;
        return;
      }
      case 'cstr': tk.ct = raw; if (!raw) tk.cd = null; else if (tk.cd == null) tk.cd = tk.es != null ? tk.es : S.p.planStart; return;
      case 'cdate': { const d = date(); if (d === undefined || d == null) return t('err_date'); tk.cd = d; return; }
      case 'pred': {
        const { rels, bad } = P6.parsePreds(S.p, raw, tk);
        S.p.rels = S.p.rels.filter((r) => r.s !== tk.id);
        for (const r of rels) {
          if (P6.wouldLoop(S.p, r.p, tk.id)) { bad.push(taskById(r.p).code + ' (loop)'); continue; }
          if (S.p.rels.some((q) => q.p === r.p && q.s === tk.id)) continue;
          S.p.rels.push({ id: P6.nextId(S.p), p: r.p, s: tk.id, type: r.type, lag: r.lag });
        }
        if (bad.length) return t('err_pred', bad.join(', '));
        return;
      }
      default: return;
    }
  }
  function editCell(row, k, raw) {
    if (row.kind === 'w') {
      return mutate(t('edit'), () => { if (k === 'code') row.w.code = String(raw); else row.w.name = String(raw); }, { noSched: true });
    }
    const tk = row.t;
    if (k === 'es' && tk.status === 'NS' && String(raw).trim()) toast(t('cstr_set'));
    return mutate(t('edit') + ' ' + t('col_' + k), () => applyField(tk, k, raw));
  }

  // ================= table =================
  const RH = 26;
  function totalColsW() { return S.cfg.cols.reduce((a, c) => a + c.w, 0); }
  function renderHead() {
    const h = $('#tHead');
    let s = `<div class="hin" style="width:${totalColsW()}px">`;
    for (const c of S.cfg.cols) {
      const d = ALL_COLS[c.k];
      const sorted = S.cfg.sort === c.k ? (S.cfg.sortDir > 0 ? ' ▲' : ' ▼') : '';
      s += `<div class="th${d.r ? ' r' : ''}" style="width:${c.w}px" data-k="${c.k}" title="${esc(t('col_' + c.k))}">${esc(t('col_' + c.k))}${sorted}<i class="rz" data-k="${c.k}"></i></div>`;
    }
    h.innerHTML = s + '</div>';
    $('#tRows').style.width = totalColsW() + 'px';
    syncHScroll();
  }
  function syncHScroll() { const hin = $('#tHead .hin'); if (hin) hin.style.transform = `translateX(${-$('#tBody').scrollLeft}px)`; }
  function renderRows() {
    const body = $('#tBody'), box = $('#tRows');
    const gs = $('#gScroll');
    const top = gs.scrollTop, H = gs.clientHeight || body.clientHeight;
    box.style.height = S.rows.length * RH + 'px';
    const r0 = Math.max(0, Math.floor(top / RH) - 6), r1 = Math.min(S.rows.length - 1, Math.ceil((top + H) / RH) + 6);
    body.scrollTop = top;
    let s = '';
    for (let i = r0; i <= r1; i++) {
      const row = S.rows[i], key = row.kind + row.id;
      const cls = 'tr' + (row.kind === 'w' ? ' wbs' : '') + (S.sel.has(key) ? ' sel' : '') + (S.focus === key ? ' focus' : '');
      s += `<div class="${cls}" style="top:${i * RH}px;width:${totalColsW()}px" data-i="${i}" data-key="${key}"${row.kind === 't' ? ' draggable="true"' : ''}>`;
      for (const c of S.cfg.cols) {
        const ci = cellOf(c.k, row);
        const cur = S.cell && S.cell.key === key && S.cell.k === c.k;
        let inner;
        if (c.k === 'name') {
          const pad = row.level * 16;
          let lead = '';
          if (row.kind === 'w') lead = `<span class="tw" data-tw="${row.id}">${row.hasKids ? (S.collapsed.has(row.id) ? '▸' : '▾') : ''}</span><i class="ico wbs"></i>`;
          else lead = `<i class="ico ${P6.isMile(row.t) ? 'mile' : row.t.status === 'C' ? 'done' : row.t.crit ? 'crit' : 'task'}"></i>`;
          inner = `<span style="padding-inline-start:${pad}px;display:inline-flex;align-items:center;min-width:0">${lead}<span style="unicode-bidi:plaintext;overflow:hidden;text-overflow:ellipsis">${esc(ci.text)}</span></span>`;
        } else inner = `<span style="unicode-bidi:plaintext">${esc(ci.text)}</span>`;
        s += `<div class="td ${ci.cls}${ci.ro ? ' ro' : ''}${cur ? ' cur' : ''}" style="width:${c.w}px" data-k="${c.k}">${inner}</div>`;
      }
      s += '</div>';
    }
    box.innerHTML = s;
  }

  // ----- selection
  function selectRow(row, e) {
    const key = row.kind + row.id;
    const i = S.rowIdx.get(key);
    if (e && e.shiftKey && S.anchor != null && S.rowIdx.has(S.anchor)) {
      const a = S.rowIdx.get(S.anchor);
      S.sel = new Set(S.rows.slice(Math.min(a, i), Math.max(a, i) + 1).map((r) => r.kind + r.id));
    } else if (e && (e.ctrlKey || e.metaKey)) {
      if (S.sel.has(key)) S.sel.delete(key); else S.sel.add(key);
      S.anchor = key;
    } else { S.sel = new Set([key]); S.anchor = key; }
    S.focus = key;
    selChanged();
  }
  function updateSelClasses() {
    document.querySelectorAll('#tRows .tr').forEach((tr) => {
      const k = tr.dataset.key;
      tr.classList.toggle('sel', S.sel.has(k)); tr.classList.toggle('focus', S.focus === k);
      tr.querySelectorAll('.td').forEach((td) => td.classList.toggle('cur', !!(S.cell && S.cell.key === k && S.cell.k === td.dataset.k)));
    });
  }
  function selChanged() {
    updateSelClasses();
    pushGantt();
    syncDetails();
    updateStatus(); updateToolbarState();
  }
  function ensureVisible(i) {
    const gs = $('#gScroll');
    const y = i * RH;
    if (y < gs.scrollTop) gs.scrollTop = y;
    else if (y + RH > gs.scrollTop + gs.clientHeight - 16) gs.scrollTop = y + RH - gs.clientHeight + 16;
  }

  // ----- inline editing
  let editing = null;
  function startEdit(key, k, initial) {
    const i = S.rowIdx.get(key); if (i == null) return;
    const row = S.rows[i];
    const col = ALL_COLS[k];
    const ci = cellOf(k, row);
    if (!col || !col.ed || ci.ro) return;
    if (row.kind === 'w' && k !== 'code' && k !== 'name') return;
    if (row.kind === 't' && row.t.status === 'C' && (k === 'rem')) return;
    ensureVisible(i);
    let td = $(`#tRows .tr[data-key="${key}"] .td[data-k="${k}"]`);
    if (!td) { renderRows(); td = $(`#tRows .tr[data-key="${key}"] .td[data-k="${k}"]`); }
    if (!td) return;
    let el;
    if (col.ed === 'sel') {
      el = document.createElement('select');
      for (const [v, l] of selectOpts(k, row)) { const o = document.createElement('option'); o.value = v; o.textContent = l; el.appendChild(o); }
      el.value = rawValue(k, row);
    } else {
      el = document.createElement('input');
      el.type = 'text'; el.value = initial != null ? initial : rawValue(k, row);
      if (col.ed === 'date') el.placeholder = 'dd-Mon-yy';
    }
    td.innerHTML = ''; td.classList.add('cur'); td.appendChild(el);
    el.focus(); if (el.select && initial == null) el.select();
    let done = false;
    const finish = (commit, move) => {
      if (done) return; done = true; editing = null;
      const val = el.value;
      if (commit && val !== rawValue(k, row)) editCell(row, k, val); else renderRows();
      if (move) moveCell(move.dx, move.dy, true); else $('#tBody').focus({ preventScroll: true });
    };
    el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      else if (e.key === 'Tab') { e.preventDefault(); finish(true, { dx: e.shiftKey ? -1 : 1, dy: 0 }); }
    });
    el.addEventListener('blur', () => finish(true));
    if (col.ed === 'sel') el.addEventListener('change', () => finish(true));
    editing = { finish };
  }
  function moveCell(dx, dy, edit) {
    const cols = S.cfg.cols;
    let ci = S.cell ? cols.findIndex((c) => c.k === S.cell.k) : 0;
    let ri = S.focus && S.rowIdx.has(S.focus) ? S.rowIdx.get(S.focus) : 0;
    ci = Math.max(0, Math.min(cols.length - 1, ci + dx));
    ri = Math.max(0, Math.min(S.rows.length - 1, ri + dy));
    const row = S.rows[ri]; if (!row) return;
    S.cell = { key: row.kind + row.id, k: cols[ci].k };
    S.sel = new Set([S.cell.key]); S.focus = S.cell.key; S.anchor = S.cell.key;
    ensureVisible(ri);
    selChanged();
    if (edit && dx !== 0) startEdit(S.cell.key, S.cell.k);
  }

  // ----- table events
  function bindTable() {
    const body = $('#tBody');
    body.tabIndex = 0;
    body.addEventListener('mousedown', (e) => {
      const tw = e.target.closest('[data-tw]');
      if (tw) { const id = +tw.dataset.tw; if (S.collapsed.has(id)) S.collapsed.delete(id); else S.collapsed.add(id); refresh(); e.preventDefault(); return; }
      const tr = e.target.closest('.tr'); if (!tr) return;
      if (e.target.closest('input,select')) return;
      const row = S.rows[+tr.dataset.i]; if (!row) return;
      const td = e.target.closest('.td');
      if (td) S.cell = { key: tr.dataset.key, k: td.dataset.k };
      if (e.button === 2 && S.sel.has(tr.dataset.key)) { S.focus = tr.dataset.key; return; }
      selectRow(row, e);
    });
    body.addEventListener('dblclick', (e) => {
      const td = e.target.closest('.td'), tr = e.target.closest('.tr');
      if (!td || !tr || e.target.closest('[data-tw]')) return;
      startEdit(tr.dataset.key, td.dataset.k);
    });
    body.addEventListener('contextmenu', (e) => {
      const tr = e.target.closest('.tr'); if (!tr) return;
      e.preventDefault();
      const row = S.rows[+tr.dataset.i];
      if (!S.sel.has(tr.dataset.key)) selectRow(row, null);
      showCtx(e.clientX, e.clientY);
    });
    body.addEventListener('wheel', (e) => { if (e.ctrlKey) return; const gs = $('#gScroll'); gs.scrollTop += e.deltaY; if (e.deltaX) body.scrollLeft += e.deltaX; e.preventDefault(); }, { passive: false });
    body.addEventListener('scroll', syncHScroll);
    body.addEventListener('keydown', (e) => {
      if (editing) return;
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === 'ArrowDown') { e.preventDefault(); moveCellOrRow(0, 1, e); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveCellOrRow(0, -1, e); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); moveCell(1, 0); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); moveCell(-1, 0); }
      else if (e.key === 'F2' || e.key === 'Enter') { e.preventDefault(); if (S.cell) startEdit(S.cell.key, S.cell.k); }
      else if (e.key === 'Delete') { e.preventDefault(); App.del(); }
      else if (e.key === 'Insert') { e.preventDefault(); App.addTask(); }
      else if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); S.sel = new Set(S.rows.map((r) => r.kind + r.id)); selChanged(); }
      else if (!mod && !e.altKey && e.key.length === 1 && S.cell) { const col = ALL_COLS[S.cell.k]; if (col && col.ed && col.ed !== 'sel') { e.preventDefault(); startEdit(S.cell.key, S.cell.k, e.key); } }
    });
    function moveCellOrRow(dx, dy, e) {
      if (e.shiftKey) {
        const ri = Math.max(0, Math.min(S.rows.length - 1, (S.rowIdx.get(S.focus) || 0) + dy));
        selectRow(S.rows[ri], { shiftKey: true }); ensureVisible(ri); S.cell = { key: S.focus, k: (S.cell || { k: 'name' }).k }; renderRows();
      } else moveCell(dx, dy);
    }
    // header: sort + resize
    const head = $('#tHead');
    head.addEventListener('click', (e) => {
      if (e.target.classList.contains('rz')) return;
      const th = e.target.closest('.th'); if (!th) return;
      const k = th.dataset.k; if (!ALL_COLS[k].sort) return;
      if (S.cfg.sort === k) S.cfg.sortDir *= -1; else { S.cfg.sort = k; S.cfg.sortDir = 1; }
      saveCfg(); refresh();
    });
    head.addEventListener('mousedown', (e) => {
      if (!e.target.classList.contains('rz')) return;
      const k = e.target.dataset.k, col = S.cfg.cols.find((c) => c.k === k), x0 = e.clientX, w0 = col.w;
      const mv = (ev) => { col.w = Math.max(40, w0 + ev.clientX - x0); renderHead(); renderRows(); };
      const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); saveCfg(); };
      window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
      e.preventDefault();
    });
    // drag rows into WBS
    let dragKeys = null;
    body.addEventListener('dragstart', (e) => {
      const tr = e.target.closest('.tr'); if (!tr || !tr.dataset.key.startsWith('t')) return e.preventDefault();
      if (!S.sel.has(tr.dataset.key)) selectRow(S.rows[+tr.dataset.i], null);
      dragKeys = selTasks().map((x) => x.id);
      e.dataTransfer.setData('text/plain', 'p6rows'); e.dataTransfer.effectAllowed = 'move';
    });
    body.addEventListener('dragover', (e) => { if (!dragKeys) return; const tr = e.target.closest('.tr'); if (!tr) return; e.preventDefault(); body.querySelectorAll('.dropt').forEach((x) => x.classList.remove('dropt')); tr.classList.add('dropt'); });
    body.addEventListener('drop', (e) => {
      if (!dragKeys) return;
      const tr = e.target.closest('.tr'); if (!tr) return; e.preventDefault();
      const row = S.rows[+tr.dataset.i]; const w = row.kind === 'w' ? row.id : row.t.wbs;
      const ids = dragKeys; dragKeys = null;
      mutate(t('move_to_wbs'), () => { S.p.tasks.forEach((x) => { if (ids.includes(x.id)) x.wbs = w; }); }, { noSched: true });
    });
    body.addEventListener('dragend', () => { dragKeys = null; body.querySelectorAll('.dropt').forEach((x) => x.classList.remove('dropt')); });
  }

  // ================= commands =================
  const API = S;
  Object.assign(API, {
    addTask() {
      const fr = focusRow();
      let wbs = fr ? (fr.kind === 'w' ? fr.id : fr.t.wbs) : (S.p.wbs.find((w) => w.parent == null) || S.p.wbs[0]).id;
      let id = null;
      mutate(t('add_activity'), () => {
        const tk = P6.newTask(S.p, wbs, { name: t('new_activity'), dur: 5, rem: 5, seq: S.p.tasks.length + 1 });
        tk.seq = Math.max(0, ...S.p.tasks.map((x) => x.seq)) + 1;
        S.p.tasks.push(tk); id = tk.id;
      });
      if (id != null) { S.collapsed.delete(wbs); refresh(); const key = 't' + id; S.sel = new Set([key]); S.focus = key; S.anchor = key; S.cell = { key, k: 'name' }; selChanged(); ensureVisible(S.rowIdx.get(key)); startEdit(key, 'name'); }
    },
    addMilestone() {
      const fr = focusRow(); let wbs = fr ? (fr.kind === 'w' ? fr.id : fr.t.wbs) : S.p.wbs[0].id; let id;
      mutate(t('add_milestone'), () => { const tk = P6.newTask(S.p, wbs, { name: t('new_milestone'), type: 'TT_Mile', dur: 0, rem: 0 }); tk.seq = Math.max(0, ...S.p.tasks.map((x) => x.seq)) + 1; S.p.tasks.push(tk); id = tk.id; });
      if (id != null) { const key = 't' + id; S.sel = new Set([key]); S.focus = key; selChanged(); startEdit(key, 'name'); }
    },
    addWbs() {
      const fr = focusRow();
      let parent = fr ? (fr.kind === 'w' ? fr.id : fr.t.wbs) : S.p.wbs[0].id;
      let id;
      mutate(t('add_wbs'), () => {
        const par = wbsById(parent);
        const n = S.p.wbs.filter((w) => w.parent === parent).length + 1;
        id = P6.nextId(S.p);
        S.p.wbs.push({ id, parent, code: (par ? par.code : 'W') + '.' + n, name: t('new_wbs'), seq: Math.max(0, ...S.p.wbs.map((w) => w.seq)) + 1 });
      }, { noSched: true });
      S.collapsed.delete(parent); refresh();
      const key = 'w' + id; S.sel = new Set([key]); S.focus = key; S.cell = { key, k: 'name' }; selChanged(); ensureVisible(S.rowIdx.get(key)); startEdit(key, 'name');
    },
    del() {
      const ts = selTasks(), ws = selWbs();
      if (!ts.length && !ws.length) return;
      const root = S.p.wbs.find((w) => w.parent == null);
      const wsx = ws.filter((w) => w !== root);
      if (ws.includes(root) && !ts.length && !wsx.length) return toast(t('err_root'), true);
      const desc = (id) => { const out = [id]; for (const w of S.p.wbs) if (w.parent === id) out.push(...desc(w.id)); return out; };
      const wids = new Set(wsx.flatMap((w) => desc(w.id)));
      const cascade = S.p.tasks.filter((x) => wids.has(x.wbs) && !ts.includes(x)).length;
      const msg = t('confirm_delete', ts.length + cascade, wsx.length);
      if (!confirm(msg)) return;
      mutate(t('delete'), () => {
        const kill = new Set(ts.map((x) => x.id));
        S.p.tasks.filter((x) => wids.has(x.wbs)).forEach((x) => kill.add(x.id));
        S.p.tasks = S.p.tasks.filter((x) => !kill.has(x.id));
        S.p.rels = S.p.rels.filter((r) => !kill.has(r.p) && !kill.has(r.s));
        S.p.asg = S.p.asg.filter((a) => !kill.has(a.task));
        S.p.wbs = S.p.wbs.filter((w) => !wids.has(w.id));
        S.sel.clear(); S.focus = null;
      });
    },
    duplicate() {
      const ts = selTasks(); if (!ts.length) return;
      mutate(t('duplicate'), () => {
        const map = new Map();
        for (const o of ts) {
          const c = JSON.parse(JSON.stringify(o));
          c.id = P6.nextId(S.p); c.code = P6.autoCode(S.p); c.name = o.name + ' (copy)'; c.seq = Math.max(...S.p.tasks.map((x) => x.seq)) + 1;
          c.status = 'NS'; c.as = null; c.af = null; c.rem = c.dur; c.pct = 0; c.bs = null; c.bf = null;
          S.p.tasks.push(c); map.set(o.id, c);
        }
        for (const r of [...S.p.rels]) {
          const a = map.get(r.p), b = map.get(r.s);
          if (a && b) S.p.rels.push({ id: P6.nextId(S.p), p: a.id, s: b.id, type: r.type, lag: r.lag });
          else if (b && !a) S.p.rels.push({ id: P6.nextId(S.p), p: r.p, s: b.id, type: r.type, lag: r.lag });
        }
        S.sel = new Set([...map.values()].map((x) => 't' + x.id));
      });
    },
    link(type) {
      const ts = selTasks().sort((a, b) => S.rowIdx.get('t' + a.id) - S.rowIdx.get('t' + b.id));
      if (ts.length < 2) return toast(t('err_link_sel'), true);
      let n = 0;
      mutate(t('link'), () => {
        for (let i = 0; i < ts.length - 1; i++) {
          const a = ts[i], b = ts[i + 1];
          if (S.p.rels.some((r) => r.p === a.id && r.s === b.id) || P6.wouldLoop(S.p, a.id, b.id)) continue;
          S.p.rels.push({ id: P6.nextId(S.p), p: a.id, s: b.id, type: type || 'FS', lag: 0 }); n++;
        }
      });
      toast(t('linked', n));
    },
    unlink() {
      const ids = new Set(selTasks().map((x) => x.id));
      if (!ids.size) return;
      mutate(t('unlink'), () => { S.p.rels = S.p.rels.filter((r) => !(ids.has(r.p) && ids.has(r.s)) ); if (ids.size === 1) S.p.rels = S.p.rels.filter((r) => !ids.has(r.s) && !ids.has(r.p) ? true : false); });
    },
    indent() { wbsMove(1); }, outdent() { wbsMove(-1); },
    collapseAll() { S.p.wbs.forEach((w) => { if (w.parent != null) S.collapsed.add(w.id); }); refresh(); },
    expandAll() { S.collapsed.clear(); refresh(); },
    schedule() {
      if (S.p.imported) { const trial = JSON.parse(snapshot()); P6.schedule(trial); let n = 0; const m = new Map(S.p.tasks.map((x) => [x.id, x])); for (const x of trial.tasks) { const b = m.get(x.id); if (b && (b.es !== x.es || b.ef !== x.ef)) n++; } if (n) toast(t('resched_diff', n, S.p.tasks.length), true); }
      S.undo.push({ label: t('schedule'), snap: snapshot() }); S.redo = [];
      P6.schedule(S.p); S.p.imported = false; scheduleSave(); refresh(); toast(t('scheduled') + (S.p.loops.length ? ' ⚠ ' + t('loops_found', S.p.loops.join(', ')) : '')); },
    doUndo: undo, doRedo: redo
  });
  function wbsMove(dir) {
    const ws = selWbs(); if (!ws.length) return toast(t('err_wbs_only'), true);
    const w = ws[0];
    mutate(dir > 0 ? t('indent') : t('outdent'), () => {
      const sibs = S.p.wbs.filter((x) => x.parent === w.parent).sort((a, b) => a.seq - b.seq);
      if (dir > 0) {
        const i = sibs.indexOf(w); if (i <= 0) return t('err_indent');
        w.parent = sibs[i - 1].id; w.seq = Math.max(0, ...S.p.wbs.map((x) => x.seq)) + 1;
      } else {
        const par = wbsById(w.parent); if (!par || par.parent == null) return t('err_outdent');
        w.parent = par.parent; w.seq = par.seq + 0.5;
      }
    }, { noSched: true });
  }

  // ----- gantt callbacks
  let gantt = null;
  function pushGantt(full) {
    if (!gantt) return;
    const px = ZOOMS[S.cfg.pxIdx];
    const o = { rows: S.rows, ru: S.ru, rowH: RH, px, minDay: S.minDay, maxDay: S.maxDay, sel: S.sel, show: S.cfg.show, p: S.p, rels: true };
    gantt.set(o);
  }
  function ganttCb() {
    return {
      onSelect(row, e) { selectRow(row, e); S.cell = { key: row.kind + row.id, k: 'name' }; },
      onOpen(row) { selectRow(row, null); App.showDetails(); },
      onCtx(row, e) { if (!S.sel.has(row.kind + row.id)) selectRow(row, null); showCtx(e.clientX, e.clientY); },
      onMove(tk, dDay) {
        if (tk.status === 'C') return;
        const cal = calOf(tk);
        const target = P6.nextWork(cal, (tk.status === 'IP' ? tk.rs : tk.es) + dDay);
        mutate(t('move'), () => {
          if (tk.status === 'IP') { /* progress override not supported by dragging */ return t('err_ip_move'); }
          tk.ct = 'SNET'; tk.cd = target;
        });
        toast(t('cstr_set'));
      },
      onResize(tk, fin) {
        const cal = calOf(tk);
        const st = tk.status === 'IP' ? tk.rs : tk.es;
        const n = Math.max(1, P6.durBetween(cal, st, fin));
        mutate(t('resize'), () => { if (tk.status === 'IP') tk.rem = n; else { tk.dur = n; tk.rem = n; } });
      },
      onLink(a, b, type) {
        if (S.p.rels.some((r) => r.p === a.id && r.s === b.id)) return toast(t('err_rel_exists'), true);
        if (P6.wouldLoop(S.p, a.id, b.id)) return toast(t('err_loop'), true);
        mutate(t('link'), () => { S.p.rels.push({ id: P6.nextId(S.p), p: a.id, s: b.id, type, lag: 0 }); });
      },
      onTip(id, e) {
        const tk = taskById(id); if (!tk) return;
        const tip = $('#tip');
        const row = (l, v) => v ? `<div><span style="opacity:.7">${esc(l)}:</span> <bdi dir="ltr"><b>${esc(v)}</b></bdi></div>` : '';
        tip.innerHTML = `<div style="font-weight:700;margin-bottom:3px">${esc(tk.code)} · ${esc(tk.name)}</div>` +
          row(t('col_es'), fmtD(tk.es)) + row(t('col_ef'), fmtD(tk.ef)) + row(t('col_dur'), fmtN(tk.dur) + 'd') + row(t('col_pct'), tk.pct + '%') +
          (tk.tf != null ? row(t('col_tf'), fmtN(tk.tf) + 'd') : '') + (tk.bs != null ? row(t('col_bs'), fmtD(tk.bs) + ' → ' + fmtD(tk.bf)) : '') + (tk.crit ? `<div style="color:#fca5a5">● ${esc(t('critical'))}</div>` : '');
        tip.hidden = false;
        const w = tip.offsetWidth, h = tip.offsetHeight;
        tip.style.left = Math.min(innerWidth - w - 8, e.clientX + 14) + 'px';
        tip.style.top = Math.min(innerHeight - h - 8, e.clientY + 16) + 'px';
      }
    };
  }

  // ================= context menu =================
  function showCtx(x, y) {
    const c = $('#ctx');
    const items = [
      ['add_activity', () => App.addTask()], ['add_milestone', () => App.addMilestone()], ['add_wbs', () => App.addWbs()], '-',
      ['duplicate', () => App.duplicate()], ['link', () => App.link()], ['unlink', () => App.unlink()], '-',
      ['details', () => App.showDetails()], ['indent', () => App.indent()], ['outdent', () => App.outdent()], '-', ['delete', () => App.del()]
    ];
    c.innerHTML = items.map((it, i) => (it === '-' ? '<hr>' : `<button class="it" data-i="${i}">${esc(t(it[0]))}</button>`)).join('');
    c.dir = P6.dir();
    c.hidden = false;
    c.style.left = Math.min(x, innerWidth - 230) + 'px'; c.style.top = Math.min(y, innerHeight - c.offsetHeight - 10) + 'px';
    c.onclick = (e) => { const b = e.target.closest('.it'); if (!b) return; c.hidden = true; items[+b.dataset.i][1](); };
  }

  // ================= details panel =================
  let detSig = '';
  function fld(label, inner, cls) { return `<div class="fld ${cls || ''}"><label>${esc(label)}</label>${inner}</div>`; }
  function inp(f, val, o) {
    o = o || {};
    return `<input data-f="${f}" value="${esc(val == null ? '' : val)}"${o.ro ? ' readonly' : ''}${o.ph ? ` placeholder="${o.ph}"` : ''} dir="auto">`;
  }
  function sel(f, val, opts) { return `<select data-f="${f}">${opts.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(val) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`; }
  function renderDetails() {
    const el = $('#details');
    const tabs = ['general', 'status', 'rels', 'res', 'notes'];
    const fr = focusRow();
    const title = fr ? (fr.kind === 't' ? fr.t.code + ' · ' + fr.t.name : fr.w.code + ' · ' + fr.w.name) : '';
    let head = `<div class="dtabs">${tabs.map((k) => `<button class="dtab${S.tab === k ? ' on' : ''}" data-tab="${k}">${esc(t('tab_' + k))}</button>`).join('')}<span class="dtitle" dir="auto">${esc(title)}</span><button class="ib" data-act="toggle" title="${esc(t('toggle_details'))}"><svg viewBox="0 0 24 24"><path d="${S.cfg.detOpen ? 'M6 9l6 6 6-6' : 'M6 15l6-6 6 6'}"/></svg></button></div>`;
    let body = '<div class="dbody">';
    const tk = fr && fr.kind === 't' ? fr.t : null;
    if (!fr) body += `<div class="empty">${esc(t('select_hint'))}</div>`;
    else if (fr.kind === 'w') {
      body += `<div class="grid2">${fld(t('col_code'), inp('w.code', fr.w.code))}${fld(t('col_name'), inp('w.name', fr.w.name), 'w2')}${fld(t('parent_wbs'), sel('w.parent', fr.w.parent == null ? '' : fr.w.parent, [['', '—'], ...S.p.wbs.filter((x) => x.id !== fr.w.id).map((x) => [x.id, x.code + ' – ' + x.name])]))}</div>`;
    } else if (S.tab === 'general') {
      body += `<div class="grid2">
        ${fld(t('col_code'), inp('code', tk.code))}${fld(t('col_name'), inp('name', tk.name), 'w2')}
        ${fld(t('col_type'), sel('type', tk.type, TYPES.map((x) => [x, t('type_' + x)])))}
        ${fld(t('col_wbs'), sel('wbs', tk.wbs, S.p.wbs.map((w) => [w.id, w.code + ' – ' + w.name])))}
        ${fld(t('col_cal'), sel('cal', tk.cal, S.p.cals.map((c) => [c.id, c.name])))}
        ${fld(t('col_dur'), inp('dur', fmtN(tk.dur)))}
        ${fld(t('col_cstr'), sel('cstr', tk.ct || '', CSTRS.map((x) => [x, x ? t('cs_' + x) : '—'])))}
        ${fld(t('col_cdate'), inp('cdate', fmtD(tk.cd), { ph: 'dd-Mon-yy' }))}
        ${fld(t('col_es'), inp('es', fmtD(tk.es)))}${fld(t('col_ef'), inp('ef', fmtD(tk.ef)))}
        ${fld(t('col_ls'), inp('ls', tk.status === 'C' ? '' : fmtD(tk.ls), { ro: 1 }))}${fld(t('col_lf'), inp('lf', tk.status === 'C' ? '' : fmtD(tk.lf), { ro: 1 }))}
        ${fld(t('col_tf'), inp('tf', tk.tf == null ? '' : fmtN(tk.tf) + 'd', { ro: 1 }))}${fld(t('col_ff'), inp('ff', tk.ff == null ? '' : fmtN(tk.ff) + 'd', { ro: 1 }))}
      </div>`;
    } else if (S.tab === 'status') {
      body += `<div class="grid2">
        ${fld(t('col_status'), sel('status', tk.status, ['NS', 'IP', 'C'].map((x) => [x, statusLabel(x)])))}
        ${fld(t('col_as'), inp('as', fmtD(tk.as), { ph: 'dd-Mon-yy' }))}${fld(t('col_af'), inp('af', fmtD(tk.af), { ph: 'dd-Mon-yy' }))}
        ${fld(t('col_pct'), inp('pct', tk.pct))}${fld(t('col_rem'), inp('rem', fmtN(tk.status === 'C' ? 0 : tk.rem)))}
        ${fld(t('pct_type'), sel('pctType', tk.pctType, [['dur', t('pt_dur')], ['phys', t('pt_phys')], ['units', t('pt_units')]]))}
        ${fld(t('col_bs'), inp('bs', fmtD(tk.bs), { ph: 'dd-Mon-yy' }))}${fld(t('col_bf'), inp('bf', fmtD(tk.bf), { ph: 'dd-Mon-yy' }))}
        ${fld(t('col_vs'), inp('vs', tk.bs != null && tk.es != null ? fmtN(tk.es - tk.bs) + 'd' : '', { ro: 1 }))}${fld(t('col_vf'), inp('vf', tk.bf != null && tk.ef != null ? fmtN(tk.ef - tk.bf) + 'd' : '', { ro: 1 }))}
      </div>`;
    } else if (S.tab === 'rels') {
      const preds = S.p.rels.filter((r) => r.s === tk.id), succs = S.p.rels.filter((r) => r.p === tk.id);
      const tbl = (list, isPred) => `<table class="mini"><thead><tr><th>${esc(t('col_code'))}</th><th>${esc(t('col_name'))}</th><th style="width:90px">${esc(t('rel_type'))}</th><th style="width:70px">${esc(t('lag'))}</th><th style="width:30px"></th></tr></thead><tbody>${list.map((r) => {
        const o = taskById(isPred ? r.p : r.s); if (!o) return '';
        return `<tr data-rel="${r.id}"><td><input data-rf="code" value="${esc(o.code)}" list="codes"></td><td dir="auto" style="color:var(--muted)">${esc(o.name)}</td><td>${sel2('type', r.type, ['FS', 'SS', 'FF', 'SF'])}</td><td><input data-rf="lag" value="${fmtN(r.lag)}"></td><td><button class="ib" data-rdel="${r.id}" title="${esc(t('delete'))}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></td></tr>`;
      }).join('')}<tr><td colspan="5"><input data-radd="${isPred ? 'p' : 's'}" list="codes" placeholder="+ ${esc(t('add_rel_ph'))}" style="border-color:var(--line)"></td></tr></tbody></table>`;
      body += `<datalist id="codes">${S.p.tasks.map((x) => `<option value="${esc(x.code)}">${esc(x.name)}</option>`).join('')}</datalist><div class="two"><div><b>${esc(t('predecessors'))}</b>${tbl(preds, true)}</div><div><b>${esc(t('successors'))}</b>${tbl(succs, false)}</div></div>`;
    } else if (S.tab === 'res') {
      const as = S.p.asg.filter((a) => a.task === tk.id);
      body += `<table class="mini"><thead><tr><th>${esc(t('resource'))}</th><th style="width:110px">${esc(t('qty'))}</th><th style="width:30px"></th></tr></thead><tbody>${as.map((a) => `<tr data-asg="${a.id}"><td>${sel2('rsrc', a.rsrc, S.p.rsrc.map((r) => [r.id, r.name]), true)}</td><td><input data-af="qty" value="${fmtN(a.qty)}"></td><td><button class="ib" data-adel="${a.id}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></td></tr>`).join('')}</tbody></table>
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><select class="inp" id="newAsg">${[['', '— ' + t('resource') + ' —'], ...S.p.rsrc.map((r) => [r.id, r.name])].map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select><button class="btn sm" data-act="addasg">${esc(t('assign'))}</button><button class="btn sm" data-act="newrsrc">${esc(t('new_resource'))}</button></div>`;
    } else if (S.tab === 'notes') {
      body += `<div class="fld"><label>${esc(t('tab_notes'))}</label><textarea data-f="notes" rows="6" dir="auto">${esc(tk.notes || '')}</textarea></div>`;
    }
    body += '</div>';
    el.innerHTML = head + body;
    el.classList.toggle('collapsed', !S.cfg.detOpen);
    detSig = detSignature();
  }
  function sel2(f, val, opts, num) { return `<select data-${num ? 'af' : 'rf'}="${f}">${opts.map((o) => { const v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o; return `<option value="${esc(v)}"${String(v) === String(val) ? ' selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`; }
  function detailsFocused() { const a = document.activeElement; return a && $('#details').contains(a) && /INPUT|SELECT|TEXTAREA/.test(a.tagName); }
  function detSignature() {
    const fr = focusRow();
    if (!fr) return 'none|' + S.tab;
    if (fr.kind === 'w') return 'w' + fr.id + '|' + S.p.wbs.length;
    const tk = fr.t;
    return ['t', tk.id, S.tab, S.cfg.detOpen, S.p.rels.filter((r) => r.s === tk.id || r.p === tk.id).map((r) => r.id + r.type + r.lag + r.p + r.s).join(), S.p.asg.filter((a) => a.task === tk.id).length, S.p.rsrc.length, S.p.cals.length, S.p.tasks.length, S.p.wbs.length].join('|');
  }
  function syncDetails() {
    const sig = detSignature();
    if (sig !== detSig && !(detailsFocused() && sig.split('|').slice(0, 3).join() === detSig.split('|').slice(0, 3).join() && !/rels|res/.test(S.tab))) return renderDetails();
    if (sig !== detSig) return renderDetails();
    // in-place value refresh
    const fr = focusRow(); if (!fr || fr.kind !== 't') return;
    const tk = fr.t;
    const vals = { code: tk.code, name: tk.name, dur: fmtN(tk.dur), cdate: fmtD(tk.cd), es: fmtD(tk.es), ef: fmtD(tk.ef), ls: tk.status === 'C' ? '' : fmtD(tk.ls), lf: tk.status === 'C' ? '' : fmtD(tk.lf), tf: tk.tf == null ? '' : fmtN(tk.tf) + 'd', ff: tk.ff == null ? '' : fmtN(tk.ff) + 'd', as: fmtD(tk.as), af: fmtD(tk.af), pct: String(tk.pct), rem: fmtN(tk.status === 'C' ? 0 : tk.rem), bs: fmtD(tk.bs), bf: fmtD(tk.bf), vs: tk.bs != null && tk.es != null ? fmtN(tk.es - tk.bs) + 'd' : '', vf: tk.bf != null && tk.ef != null ? fmtN(tk.ef - tk.bf) + 'd' : '', type: tk.type, wbs: String(tk.wbs), cal: String(tk.cal), cstr: tk.ct || '', status: tk.status, pctType: tk.pctType };
    $('#details').querySelectorAll('[data-f]').forEach((e) => { const f = e.dataset.f; if (f in vals && document.activeElement !== e && e.value !== vals[f]) e.value = vals[f]; });
    $('#details .dtitle').textContent = tk.code + ' · ' + tk.name;
  }
  function bindDetails() {
    const el = $('#details');
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.tab) { S.tab = b.dataset.tab; if (!S.cfg.detOpen) S.cfg.detOpen = true; renderDetails(); return; }
      if (b.dataset.act === 'toggle') { S.cfg.detOpen = !S.cfg.detOpen; saveCfg(); layoutDetails(); renderDetails(); return; }
      const tk = focusTask(); if (!tk) return;
      if (b.dataset.rdel) { const id = +b.dataset.rdel; mutate(t('unlink'), () => { S.p.rels = S.p.rels.filter((r) => r.id !== id); }); }
      else if (b.dataset.adel) { const id = +b.dataset.adel; mutate(t('delete'), () => { S.p.asg = S.p.asg.filter((a) => a.id !== id); }, { noSched: true }); }
      else if (b.dataset.act === 'addasg') { const v = +$('#newAsg').value; if (v) mutate(t('assign'), () => { S.p.asg.push({ id: P6.nextId(S.p), task: tk.id, rsrc: v, qty: 8 }); }, { noSched: true }); }
      else if (b.dataset.act === 'newrsrc') { const n = prompt(t('resource_name')); if (n) mutate(t('new_resource'), () => { S.p.rsrc.push({ id: P6.nextId(S.p), name: n, short: n.slice(0, 8), type: 'RT_Labor' }); }, { noSched: true }); }
    });
    el.addEventListener('change', (e) => {
      const x = e.target;
      const fr = focusRow(); if (!fr) return;
      if (fr.kind === 'w') {
        const f = x.dataset.f;
        mutate(t('edit'), () => { if (f === 'w.code') fr.w.code = x.value; else if (f === 'w.name') fr.w.name = x.value; else if (f === 'w.parent') { const np = x.value === '' ? null : +x.value; const desc = (id) => [id, ...S.p.wbs.filter((q) => q.parent === id).flatMap((q) => desc(q.id))]; if (np != null && desc(fr.w.id).includes(np)) return t('err_loop'); fr.w.parent = np; } }, { noSched: true });
        return;
      }
      const tk = fr.t;
      if (x.dataset.f) {
        const f = x.dataset.f;
        if (f === 'notes') return mutate(t('edit'), () => { tk.notes = x.value; }, { noSched: true });
        if (f === 'pctType') return mutate(t('edit'), () => { tk.pctType = x.value; });
        if (f === 'bs' || f === 'bf') {
          const d = P6.parseDate(x.value);
          return mutate(t('edit'), () => { tk[f] = x.value.trim() ? d : null; if (tk.bs != null && tk.bf != null) tk.bdur = P6.durBetween(calOf(tk), tk.bs, tk.bf); }, { noSched: true });
        }
        editCell({ kind: 't', t: tk }, f, x.value);
      } else if (x.dataset.rf) {
        const tr = x.closest('tr'); const rel = S.p.rels.find((r) => r.id === +tr.dataset.rel); if (!rel) return;
        const isPred = rel.s === tk.id;
        mutate(t('edit'), () => {
          if (x.dataset.rf === 'type') rel.type = x.value;
          else if (x.dataset.rf === 'lag') { const v = parseFloat(x.value.replace(',', '.')); if (isNaN(v)) return t('err_num'); rel.lag = v; }
          else if (x.dataset.rf === 'code') {
            const o = S.p.tasks.find((q) => q.code.toLowerCase() === x.value.trim().toLowerCase());
            if (!o || o === tk) return t('err_pred', x.value);
            const np = isPred ? o.id : tk.id, ns = isPred ? tk.id : o.id;
            if (P6.wouldLoop(S.p, np, ns) && !(rel.p === np && rel.s === ns)) return t('err_loop');
            rel.p = np; rel.s = ns;
          }
        });
      } else if (x.dataset.radd) {
        const o = S.p.tasks.find((q) => q.code.toLowerCase() === x.value.trim().toLowerCase());
        if (!o || o === tk) return toast(t('err_pred', x.value), true);
        const isPred = x.dataset.radd === 'p';
        const np = isPred ? o.id : tk.id, ns = isPred ? tk.id : o.id;
        if (S.p.rels.some((r) => r.p === np && r.s === ns)) return toast(t('err_rel_exists'), true);
        if (P6.wouldLoop(S.p, np, ns)) return toast(t('err_loop'), true);
        mutate(t('link'), () => { S.p.rels.push({ id: P6.nextId(S.p), p: np, s: ns, type: 'FS', lag: 0 }); });
      } else if (x.dataset.af) {
        const tr = x.closest('tr'); const a = S.p.asg.find((q) => q.id === +tr.dataset.asg); if (!a) return;
        mutate(t('edit'), () => { if (x.dataset.af === 'qty') a.qty = parseFloat(x.value) || 0; else a.rsrc = +x.value; }, { noSched: true });
      }
    });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur(); e.stopPropagation(); });
  }
  API.showDetails = () => { S.cfg.detOpen = true; saveCfg(); layoutDetails(); renderDetails(); };

  // ================= layout / splitters =================
  function layoutDetails() {
    const d = $('#details');
    d.style.height = S.cfg.detOpen ? S.cfg.detH + 'px' : '';
    d.classList.toggle('collapsed', !S.cfg.detOpen);
    $('#hsplit').style.display = S.cfg.detOpen ? '' : 'none';
    if (gantt) gantt.schedule();
  }
  function bindSplitters() {
    const vs = $('#vsplit');
    vs.addEventListener('mousedown', (e) => {
      const x0 = e.clientX, w0 = $('#tablePane').offsetWidth; vs.classList.add('drag');
      const mv = (ev) => { S.cfg.tableW = Math.max(160, Math.min(innerWidth - 200, w0 + ev.clientX - x0)); $('#tablePane').style.width = S.cfg.tableW + 'px'; };
      const up = () => { vs.classList.remove('drag'); window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); saveCfg(); gantt.schedule(); };
      window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); e.preventDefault();
    });
    const hs = $('#hsplit');
    hs.addEventListener('mousedown', (e) => {
      const y0 = e.clientY, h0 = $('#details').offsetHeight; hs.classList.add('drag');
      const mv = (ev) => { S.cfg.detH = Math.max(80, Math.min(innerHeight - 260, h0 - (ev.clientY - y0))); $('#details').style.height = S.cfg.detH + 'px'; };
      const up = () => { hs.classList.remove('drag'); window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); saveCfg(); gantt.schedule(); renderRows(); };
      window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); e.preventDefault();
    });
  }

  // ================= refresh =================
  function refresh(o) {
    if (!S.p) return;
    const prevMin = S.minDay;
    buildView();
    if (S.focus && !S.rowIdx.has(S.focus)) { S.focus = null; }
    for (const k of [...S.sel]) if (!S.rowIdx.has(k) && false) S.sel.delete(k);
    renderHead(); renderRows();
    if (gantt && prevMin !== S.minDay && prevMin) gantt.sc.scrollLeft += (prevMin - S.minDay) * ZOOMS[S.cfg.pxIdx];
    pushGantt();
    if (o && o.details) renderDetails(); else syncDetails();
    updateStatus(); updateToolbarState(); updateProjName();
  }
  function updateProjName() {
    const b = $('#projBtn'); if (!b || !S.p) return;
    b.textContent = '📁 ' + S.p.name; b.title = t('projects');
    document.title = S.p.name + ' – P6 Web';
  }
  function updateStatus() {
    const p = S.p; if (!p) return;
    const crit = p.tasks.filter((x) => x.crit).length;
    const done = p.tasks.filter((x) => x.status === 'C').length;
    const ru = S.ru.get((p.wbs.find((w) => w.parent == null) || {}).id) || {};
    $('#statusbar').innerHTML = [
      `<span>${esc(t('activities'))}: <b>${p.tasks.length}</b></span>`,
      `<span>${esc(t('selected'))}: <b>${S.sel.size}</b></span>`,
      `<span>${esc(t('data_date'))}: <b>${fmtD(p.dataDate)}</b></span>`,
      `<span>${esc(t('start'))}: <b>${fmtD(p.start)}</b></span><span>${esc(t('finish'))}: <b>${fmtD(p.finish)}</b></span>`,
      `<span>${esc(t('progress'))}: <b>${ru.pct || 0}%</b> (${done}/${p.tasks.length})</span>`,
      `<span>${esc(t('critical'))}: <b style="color:var(--danger)">${crit}</b></span>`,
      p.loops && p.loops.length ? `<span class="warn">⚠ ${esc(t('loops_found', p.loops.slice(0, 3).join(', ')))}</span>` : '',
      p.imported ? `<span title="${esc(t('imported_hint'))}">ⓘ ${esc(t('file_dates'))}</span>` : '',
      '<span class="spacer"></span>',
      `<span>${S.cfg.auto ? '⚡ ' + esc(t('auto_on')) : '⏸ ' + esc(t('auto_off'))}</span>`,
      `<span>${S.dirty ? '● ' + esc(t('saving')) : '✓ ' + esc(t('saved'))}</span>`
    ].join('');
  }

  // ================= toolbar & menus =================
  const IC = {
    undo: 'M3 7v6h6M3 13a9 9 0 1 0 3-7', redo: 'M21 7v6h-6M21 13a9 9 0 1 1-3-7', plus: 'M12 5v14M5 12h14', wbs: 'M3 7h6l2 2h10v10H3zM12 12v5M9.5 14.5h5',
    mile: 'M12 3l8 9-8 9-8-9z', trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6', indent: 'M3 6h18M11 12h10M11 18h10M3 9l4 3-4 3z', outdent: 'M3 6h18M11 12h10M11 18h10M7 9l-4 3 4 3z',
    link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1', unlink: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1M3 3l18 18',
    play: 'M7 4l13 8-13 8z', upd: 'M4 4v6h6M20 20v-6h-6M20 10a8 8 0 0 0-14-3L4 10M4 14a8 8 0 0 0 14 3l2-3', flag: 'M5 21V4M5 4h12l-2 4 2 4H5',
    zin: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5M11 8v6M8 11h6', zout: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5M8 11h6', fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
    today: 'M5 5h14v15H5zM5 10h14M9 3v4M15 3v4M12 13v3', search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5', fire: 'M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z',
    cols: 'M4 4h16v16H4zM9 4v16M15 4v16', dup: 'M8 8h12v12H8zM16 8V4H4v12h4', down: 'M12 4v12M6 12l6 6 6-6M4 21h16', up: 'M12 20V8M6 12l6-6 6 6M4 3h16', chart: 'M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-8',
    folder: 'M3 6h6l2 2h10v11H3z', cal: 'M5 5h14v15H5zM5 10h14M9 3v4M15 3v4', gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19 12l2-1-2-4-2 1-2-1V5h-4v2l-2 1-2-1-2 4 2 1v2l-2 1 2 4 2-1 2 1v2h4v-2l2-1 2 1 2-4-2-1z',
    expand: 'M6 9l6 6 6-6', collapse: 'M6 15l6-6 6 6', save: 'M5 4h12l3 3v13H5zM8 4v5h8V4M8 20v-6h8v6', help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.5 9.5a2.5 2.5 0 1 1 4 2c-1 .8-1.5 1.2-1.5 2.5M12 17v.5'
  };
  const ic = (n) => `<svg viewBox="0 0 24 24"><path d="${IC[n] || ''}"/></svg>`;
  P6.ic = ic;
  const TB = [
    ['undo', 'undo', () => App.doUndo()], ['redo', 'redo', () => App.doRedo()], '|',
    ['plus', 'add_activity', () => App.addTask()], ['mile', 'add_milestone', () => App.addMilestone()], ['wbs', 'add_wbs', () => App.addWbs()], ['trash', 'delete', () => App.del()], ['dup', 'duplicate', () => App.duplicate()], '|',
    ['indent', 'indent', () => App.indent()], ['outdent', 'outdent', () => App.outdent()], ['link', 'link', () => App.link()], ['unlink', 'unlink', () => App.unlink()], '|',
    ['play', 'schedule', () => App.schedule(), 'F9', 'pri'], ['upd', 'update_progress', () => App.dialogs.updateProgress()], ['flag', 'baselines', () => App.dialogs.baselines()], ['chart', 'reports', () => App.dialogs.reports()], '|',
    ['zout', 'zoom_out', () => zoom(1)], ['zin', 'zoom_in', () => zoom(-1)], ['fit', 'zoom_fit', () => zoomFit()], ['today', 'go_datadate', () => goDate(S.p.dataDate)], '|',
    ['fire', 'show_critical', () => toggleShow('crit'), '', 'crit'], ['cols', 'columns', () => App.dialogs.columns()], 'SEARCH'
  ];
  function buildToolbar() {
    const tb = $('#toolbar');
    tb.innerHTML = '';
    TB.forEach((it, i) => {
      if (it === '|') { const s = document.createElement('i'); s.className = 'sep'; tb.appendChild(s); return; }
      if (it === 'SEARCH') {
        const w = document.createElement('div'); w.className = 'sbox';
        w.innerHTML = `${ic('search')}<input id="q" placeholder="${esc(t('search'))}" value="${esc(S.cfg.filter.text)}">`;
        w.querySelector('svg').style.cssText = 'width:15px;height:15px;stroke:var(--muted);fill:none;stroke-width:2';
        tb.appendChild(w);
        const fs = document.createElement('select'); fs.className = 'sel'; fs.id = 'fmode';
        fs.innerHTML = ['all', 'critical', 'IP', 'NS', 'C', 'late', 'neg'].map((m) => `<option value="${m}">${esc(t('f_' + m))}</option>`).join('');
        fs.value = S.cfg.filter.mode; tb.appendChild(fs);
        const q = w.querySelector('input'); let tm;
        q.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => { S.cfg.filter.text = q.value; saveCfg(); refresh(); }, 160); });
        fs.addEventListener('change', () => { S.cfg.filter.mode = fs.value; saveCfg(); refresh(); });
        return;
      }
      const b = document.createElement('button');
      b.className = 'ib' + (it[4] === 'pri' ? ' pri' : ''); b.dataset.act = it[1]; b.dataset.i = i;
      b.title = t(it[1]) + (it[3] ? ' (' + it[3] + ')' : '');
      b.innerHTML = ic(it[0]) + (it[4] === 'pri' ? `<span>${esc(t(it[1]))}</span>` : '');
      b.onclick = it[2];
      tb.appendChild(b);
    });
  }
  function updateToolbarState() {
    const tb = $('#toolbar'); if (!tb) return;
    const q = (a) => tb.querySelector(`[data-act="${a}"]`);
    if (q('undo')) q('undo').disabled = !S.undo.length;
    if (q('redo')) q('redo').disabled = !S.redo.length;
    if (q('show_critical')) q('show_critical').classList.toggle('on', S.cfg.show.crit);
    if (q('indent')) q('indent').disabled = !selWbs().length;
    if (q('outdent')) q('outdent').disabled = !selWbs().length;
  }
  function toggleShow(k) { S.cfg.show[k] = !S.cfg.show[k]; saveCfg(); pushGantt(); updateToolbarState(); buildMenus(); }
  function zoom(dir) {
    const old = ZOOMS[S.cfg.pxIdx];
    const gs = $('#gScroll');
    const centerDay = S.minDay + (gs.scrollLeft + gs.clientWidth / 2) / old;
    S.cfg.pxIdx = Math.max(0, Math.min(ZOOMS.length - 1, S.cfg.pxIdx + dir));
    saveCfg(); pushGantt();
    gs.scrollLeft = (centerDay - S.minDay) * ZOOMS[S.cfg.pxIdx] - gs.clientWidth / 2;
  }
  function zoomFit() {
    const gs = $('#gScroll');
    const span = (S.p.finish || S.maxDay) - (S.p.start || S.minDay) + 14;
    const want = (gs.clientWidth - 30) / span;
    let idx = 0;
    ZOOMS.forEach((z, i) => { if (z <= want) idx = Math.max(idx, 0); });
    idx = ZOOMS.findIndex((z) => z <= want); if (idx < 0) idx = ZOOMS.length - 1;
    S.cfg.pxIdx = idx; saveCfg(); pushGantt();
    gs.scrollLeft = Math.max(0, ((S.p.start || S.minDay) - 7 - S.minDay) * ZOOMS[idx]);
  }
  function goDate(d) { if (d != null) gantt.scrollToDay(d, 0.35); }

  function menuDefs() {
    const sh = S.cfg.show, F = S.cfg;
    return [
      ['file', [
        ['new_project', () => App.dialogs.newProject()], ['projects', () => App.dialogs.projects(), 'Ctrl+O'], ['open_file', () => App.openFile()], ['import_update', () => App.openFile('update')],
        ['import_baseline', () => App.openFile('baseline')], ['import_csv', () => App.openFile('csv')], ['paste_import', () => App.dialogs.paste()], ['load_sample', () => App.loadSample()], '-',
        ['export_xer', () => App.exportXER(), 'Ctrl+S'], ['export_csv', () => App.exportCSV()], ['export_json', () => App.exportJSON()], ['print', () => print()]
      ]],
      ['edit', [
        ['undo', () => App.doUndo(), 'Ctrl+Z'], ['redo', () => App.doRedo(), 'Ctrl+Y'], '-',
        ['add_activity', () => App.addTask(), 'Insert'], ['add_milestone', () => App.addMilestone()], ['add_wbs', () => App.addWbs()], ['duplicate', () => App.duplicate()], ['delete', () => App.del(), 'Del'], '-',
        ['indent', () => App.indent()], ['outdent', () => App.outdent()], ['link', () => App.link()], ['unlink', () => App.unlink()]
      ]],
      ['view', [
        ['zoom_in', () => zoom(-1)], ['zoom_out', () => zoom(1)], ['zoom_fit', () => zoomFit()], ['go_datadate', () => goDate(S.p.dataDate)], ['go_today', () => goDate(P6.todayDay())], '-',
        ['show_baseline', () => toggleShow('base'), '', sh.base], ['show_critical', () => toggleShow('crit'), '', sh.crit], ['show_rels', () => toggleShow('rels'), '', sh.rels], ['show_labels', () => toggleShow('labels'), '', sh.labels], ['show_float', () => toggleShow('float'), '', sh.float], '-',
        ['group_wbs', () => { F.group = F.group === 'wbs' ? 'none' : 'wbs'; saveCfg(); refresh(); buildMenus(); }, '', F.group === 'wbs'], ['expand_all', () => App.expandAll()], ['collapse_all', () => App.collapseAll()], '-',
        ['columns', () => App.dialogs.columns()], ['toggle_details', () => { F.detOpen = !F.detOpen; saveCfg(); layoutDetails(); renderDetails(); }]
      ]],
      ['project', [
        ['project_settings', () => App.dialogs.settings()], ['calendars', () => App.dialogs.calendars()], ['wbs_tree', () => App.dialogs.wbs()], ['resources', () => App.dialogs.resources()], '-',
        ['schedule', () => App.schedule(), 'F9'], ['auto_schedule', () => { F.auto = !F.auto; saveCfg(); updateStatus(); buildMenus(); if (F.auto) App.schedule(); }, '', F.auto],
        ['update_progress', () => App.dialogs.updateProgress()], ['baselines', () => App.dialogs.baselines()], ['reports', () => App.dialogs.reports()]
      ]],
      ['help', [['guide', () => App.dialogs.help()], ['shortcuts', () => App.dialogs.shortcuts()], ['about', () => App.dialogs.about()]]]
    ];
  }
  function buildMenus() {
    const mb = $('#menubar');
    const open = mb.querySelector('.menu.open');
    const openId = open ? open.dataset.id : null;
    mb.innerHTML = '';
    for (const [id, items] of menuDefs()) {
      const m = document.createElement('div'); m.className = 'menu' + (openId === id ? ' open' : ''); m.dataset.id = id;
      m.innerHTML = `<button>${esc(t('m_' + id))}</button><div class="dd" dir="${P6.dir()}">${items.map((it, i) => (it === '-' ? '<hr>' : `<button class="it" data-i="${i}"><span class="ck">${it[3] ? '✓' : ''}</span>${esc(t(it[0]))}<span class="k">${esc(it[2] || '')}</span></button>`)).join('')}</div>`;
      m.querySelector('button').onclick = (e) => { e.stopPropagation(); const was = m.classList.contains('open'); mb.querySelectorAll('.menu').forEach((x) => x.classList.remove('open')); if (!was) m.classList.add('open'); };
      m.querySelector('.dd').onclick = (e) => { const b = e.target.closest('.it'); if (!b) return; m.classList.remove('open'); items[+b.dataset.i][1](); };
      m.addEventListener('mouseenter', () => { if (mb.querySelector('.menu.open') && !m.classList.contains('open')) { mb.querySelectorAll('.menu').forEach((x) => x.classList.remove('open')); m.classList.add('open'); } });
      mb.appendChild(m);
    }
  }

  // ================= files =================
  let pendingMode = null;
  API.openFile = function (mode) { pendingMode = mode || 'open'; const f = $('#fileInput'); f.value = ''; f.accept = mode === 'csv' ? '.csv,.tsv,.txt' : '.xer,.xml,.csv,.tsv,.txt,.json,.p6web'; f.click(); };
  async function handleFile(file, mode) {
    mode = mode || 'open';
    const name = file.name, ext = name.split('.').pop().toLowerCase();
    try {
      const buf = await file.arrayBuffer();
      const text = P6.decodeBuffer(buf);
      if (mode === 'csv' || ext === 'csv' || ext === 'tsv' || (ext === 'txt' && !/^ERMHDR/.test(text))) return App.dialogs.importCsv(text, name);
      let p;
      if (ext === 'json' || ext === 'p6web') { p = JSON.parse(text); if (!p.tasks) throw new Error('bad json'); p.xer = null; }
      else if (ext === 'xml' || /^\s*<\?xml/.test(text)) p = P6.fromPMXML(text);
      else {
        const x = P6.parseXER(text);
        const list = P6.xerProjects(x);
        if (list.length > 1) { const id = await App.dialogs.pickProject(list, name); if (!id) return; p = P6.fromXER(x, id); }
        else p = P6.fromXER(x, list[0] && list[0].id);
      }
      if (!p.name || p.name === 'Project') p.name = name.replace(/\.[^.]+$/, '');
      if (mode === 'baseline') return applyBaselineFrom(p);
      if (mode === 'update') return applyUpdate(p);
      openProject(p, name);
    } catch (e) { console.error(e); toast(t('err_read', e.message || e), true); }
  }
  function applyBaselineFrom(q) {
    const by = new Map(q.tasks.map((x) => [x.code.toLowerCase(), x]));
    let n = 0;
    mutate(t('import_baseline'), () => {
      for (const tk of S.p.tasks) { const o = by.get(tk.code.toLowerCase()); if (o) { tk.bs = o.status === 'C' && o.as != null ? o.as : o.es; tk.bf = o.status === 'C' && o.af != null ? o.af : o.ef; tk.bdur = o.dur; n++; } }
    }, { noSched: true });
    S.cfg.show.base = true; pushGantt(); toast(t('baseline_applied', n));
  }
  function applyUpdate(q) {
    const old = S.p, by = new Map(old.tasks.map((x) => [x.code.toLowerCase(), x]));
    let n = 0;
    q.tasks.forEach((tk) => { const o = by.get(tk.code.toLowerCase()); if (o) { tk.bs = o.bs; tk.bf = o.bf; tk.bdur = o.bdur; n++; } });
    q.id = old.id; q.name = old.name;
    S.undo.push({ label: t('import_update'), snap: snapshot() });
    const keepX = q.xer;
    S.p = q; S.p.xer = keepX || old.xer; rawSaved = null;
    scheduleSave(); fixSel(); refresh({ details: true });
    toast(t('update_applied', n, q.tasks.length - n));
  }
  function openProject(p, fname) {
    if (S.p && S.dirty) saveNow();
    S.p = p; S.sel.clear(); S.focus = null; S.cell = null; S.undo = []; S.redo = []; S.collapsed.clear(); rawSaved = null;
    if (S.cfg.group === 'wbs') for (const w of p.wbs) if (w.parent != null && p.wbs.filter((q) => q.parent == null).length === 1 && p.wbs.length > 60) S.collapsed.add(w.id);
    scheduleSave();
    refresh({ details: true });
    setTimeout(() => { zoomFit(); }, 30);
    if (fname) toast(t('opened', fname, p.tasks.length));
  }
  API.openProject = openProject;
  API.loadSample = () => { const p = P6.sampleProject(); p.name = t('sample_name'); openProject(p); };
  API.exportXER = () => {
    if (S.cfg.auto === false && S.p) { /* keep */ }
    download((S.p.name || 'project').replace(/[^\w؀-ۿ.-]+/g, '_') + '.xer', P6.toXER(S.p), 'text/plain');
    toast(t('exported'));
  };
  API.exportCSV = () => { download((S.p.name || 'project').replace(/[^\w؀-ۿ.-]+/g, '_') + '.csv', P6.toCSV(S.p), 'text/csv;charset=utf-8'); toast(t('exported')); };
  API.exportJSON = () => { download((S.p.name || 'project').replace(/[^\w؀-ۿ.-]+/g, '_') + '.p6web', json(S.p), 'application/json'); toast(t('exported')); };

  // ================= language / theme =================
  P6.dir = () => (S.cfg.lang === 'ar' ? 'rtl' : 'ltr');
  function applyLang() {
    P6.setLang(S.cfg.lang);
    document.documentElement.lang = S.cfg.lang; document.documentElement.dir = P6.dir();
    $('#langBtn').textContent = S.cfg.lang === 'ar' ? 'EN' : 'عربي';
    document.documentElement.dataset.theme = S.cfg.theme;
    $('#themeBtn').innerHTML = S.cfg.theme === 'dark' ? '☀' : '☾';
  }
  API.setLang = (l) => { S.cfg.lang = l; saveCfg(); applyLang(); buildMenus(); buildToolbar(); if (S.p) refresh({ details: true }); };

  // ================= boot =================
  API.boot = async function () {
    loadCfg();
    applyLang();
    $('#tablePane').style.width = S.cfg.tableW + 'px';
    gantt = new P6.Gantt($('#gHead'), $('#gScroll'));
    gantt.o.cb = ganttCb();
    API.gantt = gantt; API.S = S;
    gantt.sc.addEventListener('scroll', () => { renderRows(); }, { passive: true });
    bindTable(); bindDetails(); bindSplitters();
    buildMenus(); buildToolbar(); layoutDetails();
    $('#langBtn').onclick = () => API.setLang(S.cfg.lang === 'ar' ? 'en' : 'ar');
    $('#themeBtn').onclick = () => { S.cfg.theme = S.cfg.theme === 'dark' ? 'light' : 'dark'; saveCfg(); applyLang(); };
    $('#projBtn').onclick = () => API.dialogs.projects();
    document.addEventListener('click', (e) => { if (!e.target.closest('.menu')) document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open')); $('#ctx').hidden = true; });
    $('#fileInput').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) handleFile(f, pendingMode); });
    // drag & drop files
    let dc = 0;
    addEventListener('dragenter', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { dc++; $('#dropzone').hidden = false; } });
    addEventListener('dragleave', () => { if (--dc <= 0) { dc = 0; $('#dropzone').hidden = true; } });
    addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
    addEventListener('drop', (e) => { dc = 0; $('#dropzone').hidden = true; const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) { e.preventDefault(); handleFile(f, 'open'); } });
    // keyboard
    addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      const typing = /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '');
      if (e.key === 'F9') { e.preventDefault(); API.schedule(); }
      else if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); }
      else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); API.exportXER(); }
      else if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); API.dialogs.projects(); }
      else if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); const q = $('#q'); if (q) { q.focus(); q.select(); } }
      else if (mod && e.key.toLowerCase() === 'd' && !typing) { e.preventDefault(); API.duplicate(); }
      else if (e.key === 'Escape') { $('#ctx').hidden = true; }
    });
    addEventListener('wheel', (e) => { if (e.ctrlKey && e.target.closest && e.target.closest('#ganttPane')) { e.preventDefault(); zoom(e.deltaY > 0 ? 1 : -1); } }, { passive: false });
    addEventListener('beforeunload', () => { if (S.dirty) saveNow(); });
    addEventListener('resize', () => { renderRows(); gantt.schedule(); });
    // load project
    let p = null;
    try { const last = localStorage.getItem('p6web.last'); if (last) p = await loadProject(last); } catch (e) { p = null; }
    if (!p) { p = P6.sampleProject(); p.name = t('sample_name'); }
    S.p = p; refresh({ details: true });
    setTimeout(() => { zoomFit(); renderRows(); }, 40);
    // PWA-ish: keep an app-ready marker for tests
    document.body.dataset.ready = '1';
  };

  Object.assign(API, { mutate, refresh, toast, listProjects, loadProject, deleteProject, saveNow, selectRow, selTasks, selWbs, focusTask, taskById, wbsById, calOf, fmtD, fmtN, setStatus, setPct, applyField, handleFile, buildMenus, buildToolbar, goDate, scheduleSave, json, ALL_COLS, DEF_COLS, renderHead, renderRows, ZOOMS, restoreFrom: restore, download, matchesFilter });
  g.App.dialogs = {};
})(window);

/* P6 Web – shared online database on Google Drive.
   A tiny Google Apps Script web app (owned by you, stored in your Drive) acts as the server: it keeps one JSON file per project
   in a Drive folder. Anyone who has the connection link can open and edit the same projects. A local mirror in this browser
   lets you keep working offline; pending changes are pushed the next time the database is reachable. */
(function (g) {
  'use strict';
  const P6 = g.P6, App = g.App;

  // ---------- the Apps Script that the owner deploys (shown in Database Configuration) ----------
  App.GAS_CODE = `// P6 Web shared database – paste into https://script.google.com (New project), then Deploy > New deployment > Web app
// Execute as: Me   |   Who has access: Anyone
const FOLDER = 'P6WebDB';          // folder created in your Google Drive
const KEY = '';                     // optional access key: set a word here and enter the same word in P6 Web (empty = open to anyone with the link)
function folder_() { const it = DriveApp.getFoldersByName(FOLDER); return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER); }
function file_(name, create) { const f = folder_(), it = f.getFilesByName(name); if (it.hasNext()) return it.next(); return create ? f.createFile(name, '{}', 'application/json') : null; }
function read_(name, dflt) { const f = file_(name, false); if (!f) return dflt; try { return JSON.parse(f.getBlob().getDataAsString()); } catch (e) { return dflt; } }
function write_(name, obj) { file_(name, true).setContent(JSON.stringify(obj)); }
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function doGet() { const ix = read_('index.json', { projects: {}, eps: {} }); return out_({ ok: true, name: 'P6 Web database', projects: Object.keys(ix.projects).length, time: Date.now() }); }
function doPost(e) {
  const lock = LockService.getScriptLock(); lock.waitLock(25000);
  try {
    const q = JSON.parse(e.postData.contents);
    if (KEY && q.key !== KEY) return out_({ ok: false, error: 'Wrong access key' });
    const ix = read_('index.json', { projects: {}, eps: {} });
    if (q.op === 'ping') return out_({ ok: true, projects: Object.keys(ix.projects).length });
    if (q.op === 'list') return out_({ ok: true, list: Object.keys(ix.projects).map(function (k) { return ix.projects[k]; }) });
    if (q.op === 'get') { const f = read_('p_' + q.id + '.json', null); return out_(f ? { ok: true, rec: f.rec, raw: f.raw || null } : { ok: false, error: 'not found' }); }
    if (q.op === 'put') {
      const old = ix.projects[q.rec.id];
      if (!q.force && q.expect != null && old && old.updated !== q.expect) return out_({ ok: false, conflict: true, updated: old.updated });
      const meta = {}; Object.keys(q.rec).forEach(function (k) { if (k !== 'data') meta[k] = q.rec[k]; });
      const prev = read_('p_' + q.rec.id + '.json', {});
      write_('p_' + q.rec.id + '.json', { rec: q.rec, raw: q.raw != null ? q.raw : (prev.raw || null) });
      ix.projects[q.rec.id] = meta; write_('index.json', ix); return out_({ ok: true });
    }
    if (q.op === 'del') { const f = file_('p_' + q.id + '.json', false); if (f) f.setTrashed(true); delete ix.projects[q.id]; write_('index.json', ix); return out_({ ok: true }); }
    if (q.op === 'epsAll') return out_({ ok: true, list: Object.keys(ix.eps).map(function (k) { return ix.eps[k]; }) });
    if (q.op === 'epsPut') { ix.eps[q.node.id] = q.node; write_('index.json', ix); return out_({ ok: true }); }
    if (q.op === 'epsDel') { delete ix.eps[q.id]; write_('index.json', ix); return out_({ ok: true }); }
    return out_({ ok: false, error: 'unknown op' });
  } catch (err) { return out_({ ok: false, error: String(err) }); } finally { lock.releaseLock(); }
}`;

  // ---------- client driver ----------
  App.remoteDriver = function (entry) {
    const L = App.localStore;
    async function call(op, body) {
      const res = await fetch(entry.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ op, key: entry.key || '' }, body || {})) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json(); if (!j.ok && !j.conflict) throw new Error(j.error || 'Server error'); return j;
    }
    const isNet = (e) => !(e && /Wrong access key|not found/.test(e.message));
    // local mirror = the same alias's own IndexedDB (used as offline cache + queue of pending saves)
    async function pushPending() {
      let n = 0; const mirror = await L.list();
      for (const r of mirror) if (r.pending) { const got = await L.get(r.id); if (!got) continue; const rec = Object.assign({}, got.rec); delete rec.pending; try { const j = await call('put', { rec, raw: got.raw, force: true }); if (j.ok) { await L.put(rec, undefined); n++; } } catch (e) { break; } }
      return n;
    }
    return {
      kind: 'gdrive', entry,
      async ping() { return call('ping'); },
      async list() {
        try { await pushPending(); const j = await call('list'); return j.list || []; }
        catch (e) { if (!isNet(e)) throw e; return (await L.list()).map((r) => { const m = Object.assign({}, r); delete m.data; return m; }); }
      },
      async get(id) {
        try { const j = await call('get', { id }); const got = { rec: j.rec, raw: j.raw || null }; await L.put(j.rec, j.raw || undefined); return got; }
        catch (e) { if (!isNet(e)) throw e; return L.get(id); }
      },
      async put(rec, raw, opt) {
        opt = opt || {};
        await L.put(Object.assign({}, rec, { pending: true }), raw);
        try {
          const j = await call('put', { rec, raw: raw == null ? undefined : raw, expect: opt.expect, force: !!opt.force });
          if (j.conflict) { return { conflict: true }; }
          await L.put(rec, undefined); return { ok: true };
        } catch (e) { if (!isNet(e)) throw e; return { ok: true, offline: true }; }
      },
      async del(id) { await call('del', { id }); try { await L.del(id); } catch (e) { /* ignore */ } },
      async epsAll() { try { const j = await call('epsAll'); return j.list || []; } catch (e) { if (!isNet(e)) throw e; return L.epsAll(); } },
      async epsPut(n) { await call('epsPut', { node: n }); await L.epsPut(n); },
      async epsDel(id) { await call('epsDel', { id }); await L.epsDel(id); }
    };
  };

  // ---------- connection link: open it and the shared database is added and selected automatically ----------
  App.dbShareLink = function (entry) {
    const pay = { alias: entry.alias, driver: 'gdrive', url: entry.url, key: entry.key || '' };
    return location.origin + location.pathname + '#joindb=' + encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(pay)))));
  };
  App.joinFromHash = function () {
    const m = /#joindb=([^&]+)/.exec(location.hash); if (!m) return false;
    try {
      const pay = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1])))));
      if (!pay || pay.driver !== 'gdrive' || !/^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)[:\/])/.test(pay.url || '') || !/^[A-Za-z0-9 _-]{1,30}$/.test(pay.alias || '')) throw new Error('bad link');
      let l; try { l = JSON.parse(localStorage.getItem('p6web.dbs')) || []; } catch (e) { l = []; }
      if (!l.length) l = [{ alias: 'Default', driver: 'local' }];
      const ex = l.find((d) => d.url === pay.url); if (!ex) { let al = pay.alias, i = 2; while (l.some((d) => d.alias.toLowerCase() === al.toLowerCase())) al = pay.alias + ' ' + i++; l.push({ alias: al, driver: 'gdrive', url: pay.url, key: pay.key || '' }); localStorage.setItem('p6web.dbs', JSON.stringify(l)); localStorage.setItem('p6web.db', al); } else localStorage.setItem('p6web.db', ex.alias);
      history.replaceState(null, '', location.pathname + location.search); return true;
    } catch (e) { history.replaceState(null, '', location.pathname + location.search); return false; }
  };
})(window);

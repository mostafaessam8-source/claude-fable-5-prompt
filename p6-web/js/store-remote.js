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
const FOLDER = 'P6WebDB';          // folder created in your Google Drive (used when FOLDER_ID is empty)
const FOLDER_ID = '';               // optional: ID of an existing Drive folder to use instead (the part after /folders/ in its link)
const KEY = '';                     // optional access key: set a word here and enter the same word in P6 Web (empty = open to anyone with the link)
function folder_() { if (FOLDER_ID) return DriveApp.getFolderById(FOLDER_ID); const it = DriveApp.getFoldersByName(FOLDER); return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER); }
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
  App.remoteDriver = function (entry) { return entry.driver === 'gfolder' ? App.folderDriver(entry) : scriptDriver(entry); };
  function scriptDriver(entry) {
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
  }


  // ======================================================================================================
  // Google Drive FOLDER driver: paste a Drive folder link, sign in with Google, work directly in that folder.
  // Access is controlled by Drive sharing (share the folder with your team, or "anyone with the link – editor").
  // Needs an OAuth Client ID (Google Cloud Console, free) because a web page cannot read/write Drive without Google sign-in.
  // ======================================================================================================
  App.driveFolderId = (s) => { s = String(s || '').trim(); const m = /\/folders\/([A-Za-z0-9_-]{10,})/.exec(s) || /[?&]id=([A-Za-z0-9_-]{10,})/.exec(s) || /^([A-Za-z0-9_-]{15,})$/.exec(s); return m ? m[1] : null; };
  const SCOPE = 'https://www.googleapis.com/auth/drive';
  let TOK = null, EXP = 0;
  try { const t = JSON.parse(sessionStorage.getItem('p6web.gtok')); if (t && t.exp > Date.now()) { TOK = t.tok; EXP = t.exp; } } catch (e) { /* ignore */ }
  const haveTok = (en) => !!(en && en.testToken) || (TOK && Date.now() < EXP - 60000);
  const loadGsi = () => new Promise((res, rej) => { if (g.google && g.google.accounts && g.google.accounts.oauth2) return res(); const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.onload = () => res(); s.onerror = () => rej(new Error('Could not load Google sign-in (offline?)')); document.head.appendChild(s); });
  App.driveSignIn = function (en) {
    en = en || App.dbEntry();
    if (en.testToken) return Promise.resolve(en.testToken);
    return loadGsi().then(() => new Promise((res, rej) => {
      const c = g.google.accounts.oauth2.initTokenClient({ client_id: en.clientId, scope: SCOPE, callback: (r) => { if (r.error) return rej(new Error(r.error_description || r.error)); TOK = r.access_token; EXP = Date.now() + (r.expires_in || 3600) * 1000; try { sessionStorage.setItem('p6web.gtok', JSON.stringify({ tok: TOK, exp: EXP })); } catch (e) { /* ignore */ } App.driveBanner(false); res(TOK); }, error_callback: (e) => rej(new Error((e && e.type) || 'sign-in cancelled')) });
      c.requestAccessToken({ prompt: '' });
    }));
  };
  App.driveBanner = function (show) {
    let b = document.getElementById('drv-banner');
    if (!show) { if (b) b.remove(); return; }
    if (b) return;
    b = document.createElement('div'); b.id = 'drv-banner'; b.innerHTML = '<span>Shared Google Drive database: sign in with Google to load and save projects</span><button type="button">Sign in with Google</button>';
    b.querySelector('button').onclick = () => App.driveSignIn().then(() => { App.toast('Signed in – synced with Google Drive'); if (App.win === 'projects') App.renderWin(); App.listProjects(); }).catch((e) => App.toast('Sign-in failed: ' + e.message, true));
    document.body.appendChild(b);
  };
  App.folderDriver = function (entry) {
    const L = App.localStore, base = entry.apiBase || 'https://www.googleapis.com', F = entry.folder;
    const idMap = new Map(); // project/eps id -> drive file id
    class AuthErr extends Error {}
    async function api(path, opt) {
      opt = opt || {};
      if (!haveTok(entry)) { App.driveBanner(true); throw new AuthErr('Not signed in to Google'); }
      const tk = entry.testToken || TOK;
      const res = await fetch(base + path, Object.assign({}, opt, { headers: Object.assign({ Authorization: 'Bearer ' + tk }, opt.headers || {}) }));
      if (res.status === 401) { TOK = null; try { sessionStorage.removeItem('p6web.gtok'); } catch (e) { /* ignore */ } App.driveBanner(true); throw new AuthErr('Google session expired – sign in again'); }
      if (res.status === 403 || res.status === 404) throw new Error('Drive denied access (' + res.status + '). Check that the folder is shared with your Google account as Editor.');
      if (!res.ok) throw new Error('Drive error ' + res.status);
      return opt.raw ? res : res.json();
    }
    const isNet = (e) => e instanceof AuthErr || !/denied access/.test(e.message);
    const q = (s) => encodeURIComponent(s);
    async function listFiles(prefix) {
      let out = [], tok = '';
      do { const j = await api(`/drive/v3/files?q=${q(`'${F}' in parents and trashed=false and name contains '${prefix}'`)}&fields=${q('nextPageToken,files(id,name,description,modifiedTime)')}&pageSize=1000${tok ? '&pageToken=' + tok : ''}`); out = out.concat(j.files || []); tok = j.nextPageToken || ''; } while (tok);
      return out;
    }
    const metaOf = (rec) => { const m = {}; Object.keys(rec).forEach((k) => { if (k !== 'data' && k !== 'pending') m[k] = rec[k]; }); return m; };
    async function upload(fileId, name, description, content) {
      const bd = 'p6web' + Math.random().toString(36).slice(2), meta = fileId ? { description } : { name, parents: [F], description, mimeType: 'application/json' };
      const body = `--${bd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${bd}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${bd}--`;
      return api(`/upload/drive/v3/files${fileId ? '/' + fileId : ''}?uploadType=multipart&fields=id`, { method: fileId ? 'PATCH' : 'POST', headers: { 'Content-Type': `multipart/related; boundary=${bd}` }, body });
    }
    let pushing = false;
    async function refreshIds() { const fs = await listFiles('p_'); fs.forEach((f) => { try { const m = JSON.parse(f.description || '{}'); if (m.id) idMap.set(m.id, f.id); } catch (e) { /* ignore */ } }); return fs; }
    async function pushPending() { if (pushing) return; pushing = true; try { await pushPending0(); } finally { pushing = false; } }
    async function pushPending0() { const mirror = await L.list(); for (const r of mirror) if (r.pending) { const got = await L.get(r.id); if (!got) continue; const rec = Object.assign({}, got.rec); delete rec.pending; try { await drv.put(rec, got.raw, { force: true, direct: true }); await L.put(rec, undefined); } catch (e) { break; } } }
    const drv = {
      kind: 'gfolder', entry,
      async ping() { const j = await api(`/drive/v3/files/${F}?fields=${q('id,name,mimeType,capabilities(canEdit,canAddChildren)')}`); if (j.mimeType !== 'application/vnd.google-apps.folder') throw new Error('That link is a file, not a folder. Open the folder in Drive and copy its link.'); if (j.capabilities && !j.capabilities.canAddChildren) throw new Error('You can view this folder but not edit it. Ask the owner to share it as Editor.'); const n = (await listFiles('p_')).length; return { ok: true, name: j.name, projects: n }; },
      async list() {
        try { await pushPending(); const fs = await refreshIds(); return fs.map((f) => { try { return JSON.parse(f.description || '{}'); } catch (e) { return null; } }).filter((m) => m && m.id); }
        catch (e) { if (!isNet(e)) throw e; return (await L.list()).map((r) => { const m = Object.assign({}, r); delete m.data; return m; }); }
      },
      async get(id) {
        try {
          if (!idMap.has(id)) await refreshIds();
          const fid = idMap.get(id); if (!fid) return L.get(id);
          const res = await api(`/drive/v3/files/${fid}?alt=media`, { raw: true }), j = await res.json(); await L.put(j.rec, j.raw || undefined); return { rec: j.rec, raw: j.raw || null };
        } catch (e) { if (!isNet(e)) throw e; return L.get(id); }
      },
      async put(rec, raw, opt) {
        opt = opt || {};
        if (!opt.direct) await L.put(Object.assign({}, rec, { pending: true }), raw);
        try {
          if (!idMap.has(rec.id)) await refreshIds();
          const fid = idMap.get(rec.id);
          if (fid && !opt.force && opt.expect != null) { const cur = await api(`/drive/v3/files/${fid}?fields=description`); let m = {}; try { m = JSON.parse(cur.description || '{}'); } catch (e) { /* ignore */ } if (m.updated != null && m.updated !== opt.expect) return { conflict: true }; }
          let prevRaw = null; if (raw == null && fid) { try { const pr = await api(`/drive/v3/files/${fid}?alt=media`, { raw: true }); prevRaw = (await pr.json()).raw || null; } catch (e) { /* ignore */ } }
          const res = await upload(fid, 'p_' + rec.id + '.json', JSON.stringify(metaOf(rec)), JSON.stringify({ rec, raw: raw != null ? raw : prevRaw }));
          if (res && res.id) idMap.set(rec.id, res.id);
          if (!opt.direct) await L.put(rec, undefined); return { ok: true };
        } catch (e) { if (!isNet(e)) throw e; return { ok: true, offline: true }; }
      },
      async del(id) { if (!idMap.has(id)) await refreshIds(); const fid = idMap.get(id); if (fid) await api(`/drive/v3/files/${fid}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) }); idMap.delete(id); try { await L.del(id); } catch (e) { /* ignore */ } },
      async epsAll() { try { return (await listFiles('eps_')).map((f) => { try { const n = JSON.parse(f.description || '{}'); if (n.id) idMap.set('e:' + n.id, f.id); return n; } catch (e) { return null; } }).filter(Boolean); } catch (e) { if (!isNet(e)) throw e; return L.epsAll(); } },
      async epsPut(n) { let fid = idMap.get('e:' + n.id); if (!fid) await drv.epsAll(), fid = idMap.get('e:' + n.id); const res = await upload(fid, 'eps_' + n.id + '.json', JSON.stringify(n), JSON.stringify(n)); if (res && res.id) idMap.set('e:' + n.id, res.id); await L.epsPut(n); },
      async epsDel(id) { if (!idMap.has('e:' + id)) await drv.epsAll(); const fid = idMap.get('e:' + id); if (fid) await api(`/drive/v3/files/${fid}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) }); idMap.delete('e:' + id); await L.epsDel(id); }
    };
    return drv;
  };
  // after start-up: if the active database is a Drive folder and we are not signed in yet, offer the sign-in button
  App.driveCheck = function () { const en = App.dbEntry(); if (en.driver === 'gfolder' && !haveTok(en)) App.driveBanner(true); };

  // ---------- connection link: open it and the shared database is added and selected automatically ----------
  App.dbShareLink = function (entry) {
    const pay = entry.driver === 'gfolder' ? { alias: entry.alias, driver: 'gfolder', folder: entry.folder, clientId: entry.clientId } : { alias: entry.alias, driver: 'gdrive', url: entry.url, key: entry.key || '' };
    return location.origin + location.pathname + '#joindb=' + encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(pay)))));
  };
  App.joinFromHash = function () {
    const m = /#joindb=([^&]+)/.exec(location.hash); if (!m) return false;
    try {
      const pay = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1])))));
      const okAlias = /^[A-Za-z0-9 _-]{1,30}$/.test((pay && pay.alias) || '');
      if (!pay || !okAlias || !((pay.driver === 'gdrive' && /^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)[:\/])/.test(pay.url || '')) || (pay.driver === 'gfolder' && App.driveFolderId(pay.folder) && /^[\w.-]+\.apps\.googleusercontent\.com$/.test(pay.clientId || '')))) throw new Error('bad link');
      let l; try { l = JSON.parse(localStorage.getItem('p6web.dbs')) || []; } catch (e) { l = []; }
      if (!l.length) l = [{ alias: 'Default', driver: 'local' }];
      const same = (d) => (pay.driver === 'gfolder' ? d.folder === pay.folder : d.url === pay.url); const ex = l.find(same); if (!ex) { let al = pay.alias, i = 2; while (l.some((d) => d.alias.toLowerCase() === al.toLowerCase())) al = pay.alias + ' ' + i++; l.push(pay.driver === 'gfolder' ? { alias: al, driver: 'gfolder', folder: pay.folder, clientId: pay.clientId } : { alias: al, driver: 'gdrive', url: pay.url, key: pay.key || '' }); localStorage.setItem('p6web.dbs', JSON.stringify(l)); localStorage.setItem('p6web.db', al); } else localStorage.setItem('p6web.db', ex.alias);
      history.replaceState(null, '', location.pathname + location.search); return true;
    } catch (e) { history.replaceState(null, '', location.pathname + location.search); return false; }
  };
})(window);

/* P6 Web – login screen and Database Configuration (several named local databases), modelled on P6 Professional.
   Each database is a separate IndexedDB in this browser. The login name/password is a local convenience lock, not real security. */
(function (g) {
  'use strict';
  const P6 = g.P6, App = g.App, D = App.dialogs;
  const esc = P6.esc, ar = () => App.cfg.lang !== 'en', B = (en, arb) => (ar() ? arb : en);
  const LS = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }, del: (k) => { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } } };
  const SS = { get: (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } }, del: (k) => { try { sessionStorage.removeItem(k); } catch (e) { /* ignore */ } } };

  // ---------- database list ----------
  const DRIVER = 'local';
  const dbList = () => { try { const l = JSON.parse(LS.get('p6web.dbs')); if (Array.isArray(l) && l.length) return l; } catch (e) { /* ignore */ } return [{ alias: 'Default', driver: DRIVER }]; };
  const saveList = (l) => LS.set('p6web.dbs', JSON.stringify(l));
  App.dbList = dbList;
  const validAlias = (s) => /^[A-Za-z0-9 _-]{1,30}$/.test(s);
  const openNamed = (name) => new Promise((res, rej) => {
    const rq = indexedDB.open(name, 2);
    rq.onupgradeneeded = () => { const d = rq.result; ['projects', 'eps'].forEach((s) => { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' }); }); if (!d.objectStoreNames.contains('raw')) d.createObjectStore('raw'); };
    rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
  });
  const countProjects = async (name) => { const d = await openNamed(name); const n = await new Promise((r) => { const q = d.transaction('projects').objectStore('projects').count(); q.onsuccess = () => r(q.result); q.onerror = () => r(0); }); d.close(); return n; };
  const all = (d, s) => new Promise((r) => { const q = d.transaction(s).objectStore(s).getAll(); q.onsuccess = () => r(q.result); });
  const allKeys = (d, s) => new Promise((r) => { const q = d.transaction(s).objectStore(s).getAllKeys(); q.onsuccess = () => r(q.result); });
  const getOne = (d, s, k) => new Promise((r) => { const q = d.transaction(s).objectStore(s).get(k); q.onsuccess = () => r(q.result); });
  const putAll = (d, s, items, keys) => new Promise((r) => { const tx = d.transaction(s, 'readwrite'), st = tx.objectStore(s); items.forEach((v, i) => (keys ? st.put(v, keys[i]) : st.put(v))); tx.oncomplete = () => r(); });
  async function copyDb(src, dst) {
    const a = await openNamed(src), b = await openNamed(dst);
    await putAll(b, 'projects', await all(a, 'projects')); await putAll(b, 'eps', await all(a, 'eps'));
    const keys = await allKeys(a, 'raw'); const vals = []; for (const k of keys) vals.push(await getOne(a, 'raw', k)); await putAll(b, 'raw', vals, keys);
    a.close(); b.close();
  }
  const delDb = (name) => new Promise((res) => { const rq = indexedDB.deleteDatabase(name); rq.onsuccess = rq.onerror = rq.onblocked = () => res(); });
  async function foundDbs() {
    try { if (indexedDB.databases) return (await indexedDB.databases()).map((d) => d.name).filter((n) => n === 'p6web' || /^p6web-/.test(n)); } catch (e) { /* ignore */ }
    return [];
  }

  // ---------- passwords (local lock) ----------
  async function hash(s) { try { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('p6web:' + s)); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join(''); } catch (e) { let h = 5381; for (const c of 'p6web:' + s) h = ((h << 5) + h + c.charCodeAt(0)) | 0; return 'x' + h; } }
  const pwKey = (u) => 'p6web.pw.' + u.toLowerCase();

  // ---------- login screen ----------
  const logo = '<span class="lg-logo">P6</span>';
  App.loginScreen = function () {
    if (!App.cfg.loginMig) { App.cfg.loginMig = true; App.cfg.loginAtStart = false; App.saveCfg(); } // v2.4.1: no login screen by default (re-enable in Admin Preferences)
    if (SS.get('p6web.sess')) { App.cfg.user = SS.get('p6web.sess'); return Promise.resolve(); }
    if (App.cfg.loginAtStart !== true) { SS.set('p6web.sess', App.cfg.user || 'admin'); return Promise.resolve(); }
    return new Promise((resolve) => {
      const ov = document.createElement('div'); ov.id = 'loginov'; ov.dir = ar() ? 'rtl' : 'ltr';
      const dbs = dbList(), cur = App.dbAlias();
      ov.innerHTML = `<div class="lg-card"><div class="lg-title">${logo}<span>P6 Web</span><span class="lg-ic" id="lg_help" title="${esc(B('Help', 'مساعدة'))}">?</span></div>
        <div class="lg-body"><label>${esc(B('Login Name', 'اسم الدخول'))}</label><input id="lg_u" dir="ltr" value="${esc(LS.get('p6web.user') || 'admin')}" autocomplete="off">
        <label>${esc(B('Password', 'كلمة المرور'))}</label><input id="lg_p" type="password" dir="ltr" autocomplete="off">
        <div class="lg-adv" id="lg_adv">▶ <span>${esc(B('Advanced', 'متقدم'))}</span></div>
        <div id="lg_advbox" hidden><label>${esc(B('Database', 'قاعدة البيانات'))}</label><select id="lg_db">${dbs.map((d) => `<option value="${esc(d.alias)}"${d.alias === cur ? ' selected' : ''}>${esc(d.label || d.alias)}</option>`).join('')}</select></div>
        <div class="lg-err" id="lg_err" hidden></div>
        <div class="lg-btns"><button class="lg-btn pri" id="lg_go">${esc(B('Connect', 'اتصال'))}</button><button class="lg-btn" id="lg_off" disabled>${esc(B('Disconnect', 'قطع الاتصال'))}</button></div><hr>
        <a class="lg-link" id="lg_cfg">${esc(B('Edit database configuration', 'تعديل إعدادات قاعدة البيانات'))}</a></div>
        <div class="lg-foot">${esc(B('P6 Web – Schedule Studio. Data is stored in this browser. The login is a local convenience lock, not security.', 'P6 Web – Schedule Studio. البيانات محفوظة في هذا المتصفح. تسجيل الدخول قفل محلي للراحة وليس حماية حقيقية.'))}</div></div>`;
      document.body.appendChild(ov);
      const $ = (s) => ov.querySelector(s), err = (m) => { const e = $('#lg_err'); e.textContent = m; e.hidden = !m; };
      $('#lg_p').focus();
      $('#lg_adv').onclick = () => { const bx = $('#lg_advbox'); bx.hidden = !bx.hidden; $('#lg_adv').firstChild.textContent = bx.hidden ? '▶ ' : '▼ '; };
      const go = async () => {
        const u = $('#lg_u').value.trim(); if (!u) return err(B('Enter a login name', 'أدخل اسم الدخول'));
        // the login is only a local convenience lock: any password (or none) is accepted
        LS.set('p6web.user', u); SS.set('p6web.sess', u); App.cfg.user = u; App.saveCfg();
        const al = $('#lg_db').value;
        if (al !== App.dbAlias()) { LS.set('p6web.db', al); location.reload(); return; }
        ov.remove(); resolve();
      };
      $('#lg_go').onclick = go;
      ov.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      $('#lg_cfg').onclick = () => App.dialogs.dbConfig(true);
      $('#lg_help').onclick = () => alert(B('Enter any login name and any password (default: admin, empty password). Use Edit database configuration to add or switch between local databases.', 'أدخل أي اسم دخول (الافتراضي admin وبدون كلمة مرور). استخدم تعديل إعدادات قاعدة البيانات لإضافة قواعد بيانات محلية أو التبديل بينها.'));
    });
  };
  App.disconnect = function () { SS.del('p6web.sess'); location.reload(); };
  App.changePassword = function () {
    const u = App.cfg.user || 'admin';
    const body = document.createElement('div');
    body.innerHTML = `<div class="grid2"><div class="fld w2"><label>${esc(B('New password for', 'كلمة مرور جديدة لـ'))} ${esc(u)}</label><input id="cp_p" type="password" dir="ltr"></div></div><p class="hint">${esc(B('Leave empty to remove the password. This is a local lock stored in this browser only.', 'اتركها فارغة لإزالة كلمة المرور. هذا قفل محلي مخزن في هذا المتصفح فقط.'))}</p>`;
    D.modal({ title: B('Change Password', 'تغيير كلمة المرور'), cls: 'mid', body, buttons: [{ label: B('Cancel', 'إلغاء'), fn: () => {} }, { label: B('Save', 'حفظ'), cls: 'pri', fn: async (c, el) => { const v = el.querySelector('#cp_p').value; if (v) LS.set(pwKey(u), await hash(v)); else LS.del(pwKey(u)); App.toast(B('Saved', 'تم الحفظ')); } }] });
  };

  // ---------- Database Configuration ----------
  const DRIVERS = [
    ['local', 'P6 Web Local Database (IndexedDB)', true],
    ['gfolder', 'Google Drive folder – paste the folder link (sign in with Google)', true],
    ['gdrive', 'Google Drive – shared online database (Apps Script, no sign-in)', true],
    ['oracle', 'Oracle', false],
    ['mssql', 'Microsoft SQL Server/SQL Server Express', false],
    ['cloud', 'P6 Professional Cloud Connect', false],
    ['sqlite', 'P6 Professional Standalone (SQLite)', false]
  ];
  const drvName = (d) => (DRIVERS.find((x) => x[0] === d) || DRIVERS[0])[1];
  const unavailable = (d) => ({
    oracle: B('Oracle needs a database server and a driver. A web page cannot open a database connection by itself.', 'Oracle يحتاج سيرفر قاعدة بيانات ومشغّل. صفحة الويب لا تستطيع فتح اتصال بقاعدة بيانات بنفسها.'),
    mssql: B('SQL Server needs a database server and a driver. A web page cannot open a database connection by itself.', 'SQL Server يحتاج سيرفر قاعدة بيانات ومشغّل. صفحة الويب لا تستطيع فتح اتصال بقاعدة بيانات بنفسها.'),
    cloud: B('P6 Cloud Connect is Oracle\'s hosted service and requires Oracle credentials and their API.', 'P6 Cloud Connect خدمة مستضافة من Oracle وتحتاج حساباً وواجهتهم البرمجية.'),
    sqlite: B('Opening a P6 SQLite (.db) file needs a SQLite engine that is not bundled with this site. Export XER from P6 and use File ▸ Import instead.', 'فتح ملف P6 SQLite (.db) يحتاج محرك SQLite غير مضمّن في الموقع. صدّر XER من P6 واستخدم File ▸ Import.')
  })[d] + ' ' + B('Use "Google Drive – shared online database" for team work, or the local database.', 'استخدم «Google Drive – قاعدة بيانات مشتركة» للعمل الجماعي أو القاعدة المحلية.');

  function showScript() {
    const body = document.createElement('div');
    body.innerHTML = `<ol style="line-height:1.9;margin:0 0 8px;padding-inline-start:20px"><li>${esc(B('Open', 'افتح'))} <b>script.google.com</b> ${esc(B('with your Google account → New project.', 'بحسابك على جوجل ← New project.'))}</li><li>${esc(B('Delete the sample code, paste the script below, and Save. If you already created a Drive folder, put its ID (the part after /folders/ in the link) in FOLDER_ID.', 'احذف الكود التجريبي والصق السكربت التالي ثم Save. لو عندك مجلد جاهز على الدرايف ضع الـ ID بتاعه (الجزء بعد /folders/ في الرابط) في FOLDER_ID.'))}</li><li><b>Deploy → New deployment → Web app</b>: ${esc(B('Execute as', 'Execute as'))} <b>Me</b>, ${esc(B('Who has access', 'Who has access'))} <b>Anyone</b> → Deploy → ${esc(B('authorize when asked.', 'وافق على الصلاحيات.'))}</li><li>${esc(B('Copy the Web app URL (ends with /exec) into the "Web App URL" field here.', 'انسخ رابط Web app (ينتهي بـ /exec) إلى خانة Web App URL هنا.'))}</li></ol><textarea readonly style="width:100%;height:300px;font:12px Consolas,monospace;direction:ltr" id="gas_code">${esc(App.GAS_CODE)}</textarea><p class="hint">${esc(B('The data lives in a folder named P6WebDB in your Drive. Anyone with the connection link can read and edit projects; set the KEY line in the script to require a shared access key.', 'البيانات تُحفظ في مجلد P6WebDB على درايف الخاص بك. أي شخص معه رابط الاتصال يستطيع قراءة المشاريع وتعديلها؛ ضع كلمة في سطر KEY بالسكربت لطلب مفتاح وصول مشترك.'))}</p>`;
    D.modal({ title: B('Google Drive database – setup', 'قاعدة Google Drive – الإعداد'), cls: 'wide', body, buttons: [{ label: B('Copy script', 'نسخ السكربت'), fn: () => { navigator.clipboard.writeText(App.GAS_CODE).then(() => App.toast(B('Script copied', 'تم نسخ السكربت'))); return false; } }, { label: B('Close', 'إغلاق'), cls: 'pri', fn: () => {} }] });
  }
  function showFolderGuide() {
    const body = document.createElement('div'), origin = location.origin;
    body.innerHTML = `<p style="line-height:1.8">${esc(B('A web page cannot read or write your Google Drive from just a link: Google requires the user to sign in, and the site needs an OAuth Client ID. You create it once (free):', 'صفحة الويب لا تستطيع القراءة أو الكتابة في درايفك بالرابط وحده: جوجل تشترط تسجيل دخول المستخدم، والموقع يحتاج OAuth Client ID. تنشئه مرة واحدة (مجاني):'))}</p><ol style="line-height:1.9;padding-inline-start:20px"><li>${esc(B('Open', 'افتح'))} <b>console.cloud.google.com</b> → ${esc(B('create a project (any name).', 'أنشئ مشروعاً (أي اسم).'))}</li><li><b>APIs &amp; Services → Library</b> → ${esc(B('enable', 'فعّل'))} <b>Google Drive API</b>.</li><li><b>OAuth consent screen</b> → External → ${esc(B('fill the app name and your email → add your team\'s Google accounts under "Test users" (or Publish the app).', 'اكتب اسم التطبيق وبريدك ← أضف حسابات فريقك في "Test users" (أو انشر التطبيق).'))}</li><li><b>Credentials → Create credentials → OAuth client ID</b> → ${esc(B('type', 'النوع'))} <b>Web application</b> → <b>Authorized JavaScript origins</b>: <code dir="ltr">${esc(origin)}</code></li><li>${esc(B('Copy the Client ID (ends with .apps.googleusercontent.com) into the field here.', 'انسخ الـ Client ID (ينتهي بـ .apps.googleusercontent.com) إلى الخانة هنا.'))}</li><li>${esc(B('In Google Drive: right-click your folder → Share → give your team Editor access (or "Anyone with the link – Editor"). Paste that folder link here.', 'في Google Drive: كليك يمين على المجلد ← Share ← أعطِ فريقك صلاحية Editor (أو "Anyone with the link – Editor"). الصق رابط المجلد هنا.'))}</li></ol><p class="hint">${esc(B('Everyone signs in with their own Google account; Drive sharing decides who can open or edit the projects. Google may show an "unverified app" notice – choose Advanced → continue.', 'كل شخص يسجل دخوله بحسابه؛ ومشاركة Drive تحدد من يفتح أو يعدّل المشاريع. قد تعرض جوجل تنبيه "تطبيق غير موثّق" – اختر Advanced ثم متابعة.'))}</p>`;
    D.modal({ title: B('Google Drive folder – setup guide', 'مجلد Google Drive – دليل الإعداد'), cls: 'wide', body, buttons: [{ label: B('Close', 'إغلاق'), cls: 'pri', fn: () => {} }] });
  }
  App.showShareLink = function (en) {
    en = en || App.dbEntry(); if (en.driver !== 'gdrive' && en.driver !== 'gfolder') return App.toast(B('Only shared Google Drive databases have a link', 'الرابط متاح لقواعد Google Drive المشتركة فقط'), true);
    const link = App.dbShareLink(en), body = document.createElement('div');
    body.innerHTML = `<p>${esc(B('Send this link to your team. Opening it adds this shared database and selects it, so everyone works on the same projects.', 'أرسل هذا الرابط لفريقك. فتحه يضيف هذه القاعدة المشتركة ويختارها، فيعمل الجميع على نفس المشاريع.'))}</p><input id="sl" readonly dir="ltr" value="${esc(link)}" style="width:100%"><p class="hint">${esc(en.driver === 'gfolder' ? B('The link carries no secrets: each person must sign in with a Google account that the Drive folder is shared with.', 'الرابط لا يحمل أسراراً: كل شخص يسجل الدخول بحساب جوجل المشارَك معه مجلد Drive.') : en.key ? B('The link contains the access key – share it only with people who should have access.', 'الرابط يحتوي مفتاح الوصول – شاركه فقط مع من يجب أن يصل.') : B('No access key is set: anyone with the link can read, change and delete projects.', 'لا يوجد مفتاح وصول: أي شخص معه الرابط يستطيع القراءة والتعديل والحذف.'))}</p>`;
    D.modal({ title: B('Share database link', 'رابط مشاركة القاعدة'), cls: 'mid', body, buttons: [{ label: B('Copy link', 'نسخ الرابط'), cls: 'pri', fn: () => { navigator.clipboard.writeText(link).then(() => App.toast(B('Link copied', 'تم نسخ الرابط'))); return false; } }, { label: B('Close', 'إغلاق'), fn: () => {} }] });
  };

  D.dbConfig = function (fromLogin) {
    let list = dbList(), selA = App.dbAlias(), q = '', step = 1; let draft = null; let found = [];
    const body = document.createElement('div'); body.className = 'dbcfg';
    const draw = () => {
      const rows = list.filter((d) => d.alias.toLowerCase().includes(q.toLowerCase()));
      const cur = list.find((d) => d.alias === selA); const act = App.dbAlias();
      const left = `<div class="dc-left"><button class="lg-btn pri" id="dc_add">${esc(B('Add', 'إضافة'))}</button><input id="dc_q" class="dc-q" placeholder="🔍" value="${esc(q)}"><div class="dc-list">${rows.map((d) => `<div class="dc-row${d.alias === selA && !draft ? ' on' : ''}" data-a="${esc(d.alias)}"><span>${d.driver && d.driver !== 'local' ? '☁ ' : ''}${esc(d.label || d.alias)}${d.alias === act ? ' ●' : ''}</span><span class="dc-ic">${d.driver && d.driver !== 'local' ? '' : `<i data-copy="${esc(d.alias)}" title="${esc(B('Duplicate', 'نسخ'))}">⧉</i>`}<i data-del="${esc(d.alias)}" title="${esc(B('Delete', 'حذف'))}">🗑</i></span></div>`).join('')}</div></div>`;
      const drvSel = (d, dis) => `<label>${esc(B('Driver Type', 'نوع المشغّل'))}</label><select id="dc_drv"${dis ? ' disabled' : ''}>${DRIVERS.map(([v, l]) => `<option value="${v}"${d === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
      let right;
      if (draft && step === 2) {
        right = `<div class="dc-right"><p>${esc(B('Ready to add the database connection:', 'جاهز لإضافة اتصال قاعدة البيانات:'))}</p><p><b>${esc(draft.alias)}</b> — ${esc(drvName(draft.driver))}</p>${draft.driver === 'gfolder' ? `<p class="hint" dir="ltr">Drive folder ${esc(App.driveFolderId(draft.folderLink) || '')}</p>` : ''}${draft.driver === 'gdrive' ? `<p class="hint" dir="ltr">${esc(draft.url)}</p><p class="hint">${esc(B('After Finish you can copy the share link so your team can use the same database.', 'بعد الإنهاء يمكنك نسخ رابط المشاركة ليستخدم فريقك نفس القاعدة.'))}</p>` : ''}</div>`;
      } else if (draft && draft.driver === 'gfolder') {
        right = `<div class="dc-right">${drvSel('gfolder')}<label>${esc(B('Database Alias', 'اسم القاعدة (Alias)'))}</label><input id="dc_alias" dir="ltr" value="${esc(draft.alias)}"><label>${esc(B('Google Drive folder link', 'رابط مجلد Google Drive'))}</label><input id="dc_folder" dir="ltr" placeholder="https://drive.google.com/drive/folders/..." value="${esc(draft.folderLink || '')}"><label>${esc(B('OAuth Client ID', 'OAuth Client ID'))}</label><input id="dc_cid" dir="ltr" placeholder="123456-abc.apps.googleusercontent.com" value="${esc(draft.clientId || '')}"><p><button class="lg-btn pri" id="dc_guide">${esc(B('Setup guide…', 'دليل الإعداد…'))}</button></p><p class="hint">${esc(B('Projects are saved as files inside that folder. Test and Next will ask you to sign in with Google.', 'تُحفظ المشاريع كملفات داخل هذا المجلد. زرّا Test وNext سيطلبان منك تسجيل الدخول بحساب جوجل.'))}</p></div>`;
      } else if (draft && draft.driver === 'gdrive') {
        right = `<div class="dc-right">${drvSel('gdrive')}<label>${esc(B('Database Alias', 'اسم القاعدة (Alias)'))}</label><input id="dc_alias" dir="ltr" value="${esc(draft.alias)}"><label>${esc(B('Web App URL (Google Apps Script)', 'رابط Web App (Google Apps Script)'))}</label><input id="dc_url" dir="ltr" placeholder="https://script.google.com/macros/s/.../exec" value="${esc(draft.url || '')}"><label>${esc(B('Access key (optional)', 'مفتاح الوصول (اختياري)'))}</label><input id="dc_key" dir="ltr" value="${esc(draft.key || '')}"><p><button class="lg-btn pri" id="dc_script">${esc(B('Get setup script…', 'الحصول على سكربت الإعداد…'))}</button></p><p class="hint">${esc(B('Projects are stored as files in your Google Drive. Works online; while offline you keep working on a local copy that syncs later.', 'تُحفظ المشاريع كملفات في Google Drive الخاص بك. يعمل أونلاين؛ وبدون إنترنت تعمل على نسخة محلية تُزامَن لاحقاً.'))}</p></div>`;
      } else if (draft && !DRIVERS.find((x) => x[0] === draft.driver)[2]) {
        right = `<div class="dc-right">${drvSel(draft.driver)}<div class="dc-warn">${esc(unavailable(draft.driver))}</div></div>`;
      } else if (draft) {
        right = `<div class="dc-right">${drvSel('local')}
        <label>${esc(B('Database Alias', 'اسم القاعدة (Alias)'))}</label><input id="dc_alias" dir="ltr" value="${esc(draft.alias)}"${draft.mode === 'existing' && draft.pick ? ' readonly' : ''}>
        <label class="chk"><input type="radio" name="dc_m" value="existing"${draft.mode === 'existing' ? ' checked' : ''}> ${esc(B('Add a connection to an existing database', 'إضافة اتصال بقاعدة موجودة'))}</label>
        ${draft.mode === 'existing' ? `<select id="dc_pick" style="margin-inline-start:24px">${found.length ? found.map((n) => `<option value="${esc(n)}"${draft.pick === n ? ' selected' : ''}>${esc(n === 'p6web' ? 'Default (p6web)' : n.replace(/^p6web-/, ''))}</option>`).join('') : `<option value="">${esc(B('(none found)', '(لا يوجد)'))}</option>`}</select>` : ''}
        <label class="chk"><input type="radio" name="dc_m" value="new"${draft.mode === 'new' ? ' checked' : ''}> ${esc(B('Add a new database and connection', 'إضافة قاعدة جديدة واتصال'))}</label></div>`;
      } else {
        right = `<div class="dc-right">${drvSel(cur ? cur.driver || 'local' : 'local', false)}<label>${esc(B('Display name', 'الاسم المعروض'))}</label><input readonly value="${esc((cur && cur.label) || selA)}"><p><button class="lg-btn" id="dc_rename">${esc(B('Rename…', 'تغيير الاسم…'))}</button></p>${cur && cur.driver && cur.driver !== 'local' ? `<p class="hint" dir="ltr">${esc(cur.url || ('Drive folder ' + cur.folder))}</p><p><button class="lg-btn" id="dc_share">${esc(B('Share link…', 'رابط المشاركة…'))}</button>${cur.driver === 'gfolder' ? ` <button class="lg-btn pri" id="dc_signin">${esc(B('Sign in with Google', 'تسجيل الدخول بجوجل'))}</button>` : ''}</p>` : `<p class="hint">${esc(cur ? B('Stored in this browser: IndexedDB "', 'مخزنة في هذا المتصفح: IndexedDB "') + App.dbNameOf(selA) + '"' : '')}</p>`}${selA !== act ? `<button class="lg-btn" id="dc_use">${esc(B('Switch to this database', 'التبديل لهذه القاعدة'))}</button>` : `<p class="hint">${esc(B('This is the active database.', 'هذه هي القاعدة النشطة.'))}</p>`}</div>`;
      }
      const okDriver = !draft || DRIVERS.find((x) => x[0] === draft.driver)[2];
      const btns = `<div class="dc-btns"><button class="lg-btn pri" id="dc_test">${esc(B('Test', 'اختبار'))}</button><button class="lg-btn" id="dc_cancel">${esc(B('Cancel', 'إلغاء'))}</button><button class="lg-btn" id="dc_back"${draft && step === 2 ? '' : ' disabled'}>${esc(B('Back', 'رجوع'))}</button><button class="lg-btn pri" id="dc_next"${draft && okDriver ? '' : ' disabled'}>${esc(draft && step === 2 ? B('Finish', 'إنهاء') : B('Next', 'التالي'))}</button></div>`;
      body.innerHTML = `<div class="dc-main">${left}${right}</div>${btns}`;
    };
    draw();
    const m = D.modal({ title: B('Database Configuration', 'إعدادات قاعدة البيانات'), cls: 'wide dbmodal', body, buttons: [], sticky: true, onClose: () => { const s = document.getElementById('lg_db'); if (s) { const v = s.value; s.innerHTML = dbList().map((d) => `<option value="${esc(d.alias)}"${d.alias === v ? ' selected' : ''}>${esc(d.label || d.alias)}</option>`).join(''); } } });
    const toast = (s, e) => App.toast(s, e);
    const gfEntry = () => ({ alias: (draft.alias || '').trim(), driver: 'gfolder', folder: App.driveFolderId(draft.folderLink), clientId: (draft.clientId || '').trim() });
    const gfCheck = () => { const en = gfEntry(); if (!en.folder) return B('Paste the link of the Drive folder (it contains /folders/…)', 'الصق رابط مجلد Drive (يحتوي /folders/…)'); if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(en.clientId)) return B('The OAuth Client ID must end with .apps.googleusercontent.com – click “Setup guide…”', 'يجب أن ينتهي OAuth Client ID بـ .apps.googleusercontent.com – اضغط «دليل الإعداد…»'); return ''; };
    const gdEntry = () => ({ alias: (draft.alias || '').trim(), driver: 'gdrive', url: (draft.url || '').trim(), key: (draft.key || '').trim() });
    body.addEventListener('input', (e) => {
      if (e.target.id === 'dc_q') { q = e.target.value; const pos = e.target.selectionStart; draw(); const i = body.querySelector('#dc_q'); i.focus(); i.setSelectionRange(pos, pos); }
      else if (e.target.id === 'dc_alias' && draft) draft.alias = e.target.value; else if (e.target.id === 'dc_url' && draft) draft.url = e.target.value; else if (e.target.id === 'dc_folder' && draft) draft.folderLink = e.target.value; else if (e.target.id === 'dc_cid' && draft) draft.clientId = e.target.value; else if (e.target.id === 'dc_key' && draft) draft.key = e.target.value;
    });
    body.addEventListener('change', (e) => {
      if (e.target.id === 'dc_drv' && !draft) { (async () => { found = (await foundDbs()).filter((n) => !list.some((d) => App.dbNameOf(d.alias) === n)); const v = e.target.value; draft = { driver: v, mode: found.length ? 'existing' : 'new', alias: '', pick: found[0] || '', url: '', key: '' }; if (draft.pick && v === 'local') draft.alias = draft.pick.replace(/^p6web-/, ''); step = 1; draw(); })(); }
      else if (e.target.id === 'dc_drv' && draft) { draft.driver = e.target.value; if (draft.driver === 'local' && draft.mode === 'existing' && draft.pick) draft.alias = draft.pick.replace(/^p6web-/, ''); draw(); }
      else if (e.target.name === 'dc_m') { draft.mode = e.target.value; draft.pick = draft.mode === 'existing' ? (found[0] || '') : ''; if (draft.pick) draft.alias = draft.pick === 'p6web' ? 'Default' : draft.pick.replace(/^p6web-/, ''); draw(); }
      else if (e.target.id === 'dc_pick') { draft.pick = e.target.value; draft.alias = draft.pick === 'p6web' ? 'Default' : draft.pick.replace(/^p6web-/, ''); draw(); }
    });
    const bad = B('Invalid alias (letters, digits, space, _ and - only)', 'اسم غير صالح (حروف وأرقام ومسافة و _ و - فقط)'), dup = B('Alias already used', 'الاسم مستخدم');
    body.addEventListener('click', async (e) => {
      const cp = e.target.closest('[data-copy]'), dl = e.target.closest('[data-del]');
      if (cp) {
        e.stopPropagation(); const src = cp.dataset.copy; const nm = prompt(B('Alias for the copy', 'اسم النسخة'), src + ' copy'); if (!nm) return;
        if (!validAlias(nm) || list.some((d) => d.alias.toLowerCase() === nm.toLowerCase())) return toast(B('Invalid or duplicate alias (letters, digits, space, _ and - only)', 'اسم غير صالح أو مكرر (حروف وأرقام ومسافة و _ و - فقط)'), true);
        await copyDb(App.dbNameOf(src), App.dbNameOf(nm)); list = list.concat({ alias: nm, driver: DRIVER }); saveList(list); selA = nm; draw(); return toast(B('Database copied', 'تم نسخ القاعدة'));
      }
      if (dl) {
        e.stopPropagation(); const a = dl.dataset.del, en = list.find((d) => d.alias === a);
        if (a === 'Default') return toast(B('The Default database cannot be removed', 'لا يمكن حذف القاعدة الافتراضية'), true);
        if (a === App.dbAlias()) return toast(B('Switch to another database before deleting the active one', 'بدّل لقاعدة أخرى قبل حذف النشطة'), true);
        if (en && en.driver && en.driver !== 'local') { if (!confirm(B(`Remove the connection "${a}"? The data stays in Google Drive.`, `إزالة الاتصال "${a}"؟ تبقى البيانات في Google Drive.`))) return; }
        else if (!confirm(B(`Delete database "${a}" and ALL its projects? This cannot be undone.`, `حذف القاعدة "${a}" وكل مشاريعها؟ لا يمكن التراجع.`))) return;
        await delDb(App.dbNameOf(a)); list = list.filter((d) => d.alias !== a); saveList(list); if (selA === a) selA = App.dbAlias(); draw(); return;
      }
      const row = e.target.closest('.dc-row'); if (row && !draft) { selA = row.dataset.a; draw(); return; }
      const id = e.target.id;
      if (id === 'dc_add') { found = (await foundDbs()).filter((n) => !list.some((d) => App.dbNameOf(d.alias) === n)); draft = { driver: 'local', mode: found.length ? 'existing' : 'new', alias: '', pick: found[0] || '', url: '', key: '' }; if (draft.pick) draft.alias = draft.pick.replace(/^p6web-/, ''); step = 1; draw(); }
      else if (id === 'dc_cancel') { if (draft) { draft = null; step = 1; draw(); } else m.close(); }
      else if (id === 'dc_back') { step = 1; draw(); }
      else if (id === 'dc_use') { LS.set('p6web.db', selA); location.reload(); }
      else if (id === 'dc_script') showScript();
      else if (id === 'dc_guide') showFolderGuide();
      else if (id === 'dc_signin') { try { await App.driveSignIn(list.find((d) => d.alias === selA)); toast(B('Signed in with Google', 'تم تسجيل الدخول بجوجل')); } catch (er) { toast(B('Sign-in failed: ', 'فشل تسجيل الدخول: ') + er.message, true); } }
      else if (id === 'dc_rename') { const en = list.find((d) => d.alias === selA); if (!en) return; const nm = prompt(B('New display name', 'الاسم الجديد'), en.label || en.alias); if (nm == null) return; const v = nm.trim().slice(0, 30); if (!v) return toast(B('Enter a name', 'أدخل اسماً'), true); if (list.some((d) => d !== en && (d.label || d.alias).toLowerCase() === v.toLowerCase())) return toast(dup, true); en.label = v; saveList(list); draw(); toast(B('Renamed', 'تم تغيير الاسم')); if (typeof App.updateStatus === 'function') App.updateStatus(); }
      else if (id === 'dc_share') App.showShareLink(list.find((d) => d.alias === selA));
      else if (id === 'dc_test') {
        try {
          if (draft && draft.driver === 'gfolder') { const msg = gfCheck(); if (msg) return toast(msg, true); const en = gfEntry(); await App.driveSignIn(en); const j = await App.remoteDriver(en).ping(); toast(B(`Connected to “${j.name}” – ${j.projects} projects`, `تم الاتصال بالمجلد «${j.name}» – ${j.projects} مشروع`)); }
          else if (draft && draft.driver === 'gdrive') {
            const en = gdEntry(); if (/drive\.google\.com/.test(en.url)) return toast(B('That is a Drive folder link, not the Web App URL (it must end with /exec).', 'ده رابط مجلد وليس رابط Web App (يجب أن ينتهي بـ /exec).'), true); if (!/^https:\/\//.test(en.url)) return toast(B('Enter the Web App URL first', 'أدخل رابط Web App أولاً'), true);
            const j = await App.remoteDriver(en).ping(); toast(B(`Connected to Google Drive database – ${j.projects} projects`, `تم الاتصال بقاعدة Google Drive – ${j.projects} مشروع`));
          } else if (draft && !DRIVERS.find((x) => x[0] === draft.driver)[2]) toast(unavailable(draft.driver), true);
          else if (draft) {
            const al = (draft.alias || '').trim(); if (!validAlias(al)) return toast(bad, true);
            if (draft.mode === 'existing') toast(B(`Connection OK – ${await countProjects(draft.pick || App.dbNameOf(al))} projects`, `الاتصال سليم – ${await countProjects(draft.pick || App.dbNameOf(al))} مشروع`)); else toast(list.some((d) => d.alias.toLowerCase() === al.toLowerCase()) ? dup : B('Alias is available', 'الاسم متاح'), list.some((d) => d.alias.toLowerCase() === al.toLowerCase()));
          } else { const en = list.find((d) => d.alias === selA); if (en && en.driver === 'gfolder') { await App.driveSignIn(en); const j = await App.remoteDriver(en).ping(); toast(B(`Connected – ${j.projects} projects`, `الاتصال سليم – ${j.projects} مشروع`)); } else if (en && en.driver === 'gdrive') { const j = await App.remoteDriver(en).ping(); toast(B(`Connected – ${j.projects} projects`, `الاتصال سليم – ${j.projects} مشروع`)); } else toast(B(`Connection OK – ${await countProjects(App.dbNameOf(selA))} projects`, `الاتصال سليم – ${await countProjects(App.dbNameOf(selA))} مشروع`)); }
        } catch (er) { toast(B('Connection failed: ', 'فشل الاتصال: ') + er.message, true); }
      } else if (id === 'dc_next') {
        if (step === 1) {
          const al = (draft.alias || '').trim(); if (!validAlias(al)) return toast(bad, true);
          if (list.some((d) => d.alias.toLowerCase() === al.toLowerCase())) return toast(dup, true);
          if (draft.driver === 'gfolder') { const msg = gfCheck(); if (msg) return toast(msg, true); try { const en = gfEntry(); await App.driveSignIn(en); await App.remoteDriver(en).ping(); } catch (er) { return toast(B('Cannot open the folder: ', 'تعذر فتح المجلد: ') + er.message, true); } }
          if (draft.driver === 'gdrive') { if (/drive\.google\.com/.test(draft.url || '')) return toast(B('That is a Google Drive folder link. The Web App URL is different: it comes from Apps Script (Deploy → Web app) and ends with /exec. Click “Get setup script…” for the steps.', 'ده رابط مجلد على Google Drive. رابط Web App مختلف: بيطلع من Apps Script (Deploy ← Web app) وينتهي بـ /exec. اضغط «Get setup script…» لتشوف الخطوات.'), true);
          if (!/^https:\/\/script\.google\.com\/.+\/exec/.test((draft.url || '').trim())) return toast(B('The Web App URL must look like https://script.google.com/macros/s/…/exec', 'يجب أن يبدو رابط Web App هكذا: https://script.google.com/macros/s/…/exec'), true); try { await App.remoteDriver(gdEntry()).ping(); } catch (er) { return toast(B('Cannot reach the database: ', 'تعذر الوصول للقاعدة: ') + er.message, true); } }
          draft.alias = al; step = 2; draw();
        } else {
          if (draft.driver === 'gfolder') { const en = gfEntry(); list = list.concat(en); saveList(list); selA = en.alias; draft = null; step = 1; draw(); toast(B('Google Drive folder database added', 'تمت إضافة قاعدة مجلد Google Drive')); App.showShareLink(en); return; }
          if (draft.driver === 'gdrive') { const en = gdEntry(); list = list.concat(en); saveList(list); selA = en.alias; draft = null; step = 1; draw(); toast(B('Google Drive database added', 'تمت إضافة قاعدة Google Drive')); App.showShareLink(en); return; }
          const nm = App.dbNameOf(draft.alias);
          try { if (draft.mode === 'existing' && draft.pick && draft.pick !== nm) { await copyDb(draft.pick, nm); } else { (await openNamed(nm)).close(); } } catch (er) { return toast(er.message, true); }
          list = list.concat({ alias: draft.alias, driver: DRIVER }); saveList(list); selA = draft.alias; draft = null; step = 1; draw(); toast(B('Database connection added', 'تمت إضافة اتصال القاعدة'));
          if (fromLogin) { m.close(); }
        }
      }
    });
  };
})(window);

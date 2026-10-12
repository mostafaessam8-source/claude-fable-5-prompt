/* PTE-79 Express — core: store, helpers, router, TTS, SRS, XP */
(function () {
  "use strict";
  const PTE = (window.PTE = window.PTE || {});
  PTE.views = {};
  PTE.D = window.PTE_DATA || {};

  /* ---------- tiny DOM helper ---------- */
  PTE.h = function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === "class") el.className = v;
        else if (k === "html") el.innerHTML = v;
        else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
        else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
        else el.setAttribute(k, v === true ? "" : v);
      }
    }
    const add = (c) => {
      if (c === null || c === undefined || c === false) return;
      if (Array.isArray(c)) c.forEach(add);
      else if (c instanceof Node) el.appendChild(c);
      else el.appendChild(document.createTextNode(String(c)));
    };
    kids.forEach(add);
    return el;
  };
  const h = PTE.h;
  PTE.ar = (text, cls) => h("div", { class: "ar " + (cls || ""), dir: "rtl", lang: "ar" }, text);
  PTE.clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
  PTE.shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  PTE.pick = (a, n) => PTE.shuffle(a).slice(0, n);
  PTE.esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  PTE.norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
  PTE.ymd = (d) => { d = d || new Date(); const z = (n) => String(n).padStart(2, "0"); return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()); };
  PTE.parseYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  PTE.addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  PTE.daysBetween = (a, b) => Math.round((PTE.parseYmd(PTE.ymd(b)) - PTE.parseYmd(PTE.ymd(a))) / 86400000);
  PTE.fmtDate = (d) => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

  /* ---------- store ---------- */
  const KEY = "pte79.v1";
  const defaults = () => ({
    start: PTE.ymd(), done: {}, xp: 0, minutes: 0, log: {}, srs: {}, scores: {}, notes: {}, badges: {},
    settings: { rate: 0.95, showAr: true, minDay: false, voiceEn: "", voiceAr: "", driveRate: 0.9, examDate: "" },
    seen: {}, mockHistory: [], errors: []
  });
  let mem = null;
  PTE.store = {
    get() {
      if (mem) return mem;
      try { const raw = localStorage.getItem(KEY); mem = raw ? Object.assign(defaults(), JSON.parse(raw)) : defaults(); }
      catch (e) { mem = defaults(); }
      mem.settings = Object.assign(defaults().settings, mem.settings || {});
      return mem;
    },
    save() { try { localStorage.setItem(KEY, JSON.stringify(mem || defaults())); } catch (e) { /* private mode */ } },
    reset() { mem = defaults(); this.save(); },
    exportJson() { return JSON.stringify(this.get()); },
    importJson(t) { const o = JSON.parse(t); mem = Object.assign(defaults(), o); this.save(); }
  };
  const S = () => PTE.store.get();

  /* ---------- plan maths ---------- */
  PTE.plan = {
    startDate() { return PTE.parseYmd(S().start); },
    examDate() { const e = S().settings.examDate; return e ? PTE.parseYmd(e) : PTE.addDays(this.startDate(), 26 * 7 - 1); },
    dayIndex(date) { return PTE.daysBetween(this.startDate(), date || new Date()) + 1; }, // 1-based, can be <1 or >182
    clampDay(i) { return Math.max(1, Math.min(182, i)); },
    weekOf(i) { return Math.ceil(PTE.plan.clampDay(i) / 7); },
    dayInWeek(i) { return ((PTE.plan.clampDay(i) - 1) % 7) + 1; },
    station(w) { return PTE.D.stations[w - 1]; },
    phase(n) { return PTE.D.phases[n - 1]; },
    role(i) { return PTE.D.dayRoles[PTE.plan.dayInWeek(i) - 1]; },
    daysLeft() { return PTE.daysBetween(new Date(), this.examDate()); },
    dateOfDay(i) { return PTE.addDays(this.startDate(), i - 1); }
  };

  /* Task catalog: every task id -> route, label, minutes, icon */
  const T = (id, icon, en, ar, route, min, core) => ({ id, icon, en, ar, route, min, core: !!core });
  PTE.tasks = {
    diag: T("diag", "🧭", "Starting-point quiz (20 Qs)", "اختبار تحديد المستوى", "#/diagnostic", 15, true),
    srs: T("srs", "🧠", "Vocabulary review (SRS)", "مراجعة المفردات", "#/vocab/review", 10, true),
    phon: T("phon", "🔊", "Pronunciation lab", "معمل النطق", "#/phonetics", 10, true),
    drive: T("drive", "🚆", "Drive-mode lesson (audio)", "درس صوتي في وضع القيادة", "#/drive", 15, false),
    ra: T("ra", "📖", "Read Aloud ×4", "قراءة بصوت عالٍ ×٤", "#/speaking/ra", 12, true),
    rs: T("rs", "🔁", "Repeat Sentence ×8", "إعادة الجملة ×٨", "#/speaking/rs", 10, false),
    wfd: T("wfd", "✍️", "Write From Dictation ×8", "إملاء ×٨", "#/listening/wfd", 10, true),
    sst: T("sst", "🎧", "Summarize Spoken Text ×1", "تلخيص المسموع", "#/listening/sst", 12, false),
    hcs: T("hcs", "🎯", "Highlight Correct Summary ×2", "اختيار الملخص الصحيح", "#/listening/hcs", 8, false),
    swt: T("swt", "📝", "Summarize Written Text ×2", "تلخيص النص المكتوب", "#/writing/swt", 15, true),
    essay: T("essay", "🖋️", "Essay ×1 (20 min)", "مقال ×١", "#/writing/essay", 20, false),
    rfib: T("rfib", "🧩", "Reading & Writing Fill blanks ×3", "ملء الفراغات (قراءة وكتابة)", "#/reading/rfib", 10, true),
    ro: T("ro", "🔀", "Re-order Paragraphs ×3", "ترتيب الفقرات", "#/reading/ro", 10, false),
    rmcq: T("rmcq", "☑️", "Reading MCQ ×3", "اختيار من متعدد (قراءة)", "#/reading/mcq", 10, false),
    di: T("di", "📊", "Describe Image ×4", "وصف الصورة ×٤", "#/speaking/di", 12, true),
    rl: T("rl", "🎤", "Re-tell Lecture ×2", "إعادة المحاضرة ×٢", "#/speaking/rl", 10, false),
    asq: T("asq", "❓", "Answer Short Question ×10", "أسئلة قصيرة ×١٠", "#/speaking/asq", 6, false),
    grammar: T("grammar", "📘", "Grammar unit of the week", "قاعدة الأسبوع", "#/grammar", 15, true),
    quiz: T("quiz", "⚡", "Vocabulary games", "ألعاب المفردات", "#/vocab/games", 10, false),
    collo: T("collo", "🔗", "Collocations & word families", "المتلازمات وعائلات الكلمات", "#/vocab/browse", 10, false),
    mini: T("mini", "🏁", "Mini-mock (20 min)", "اختبار مصغر", "#/mock", 20, true),
    review: T("review", "📈", "Weekly review & reward", "مراجعة الأسبوع", "#/progress", 10, false),
    full: T("full", "🏆", "FULL MOCK (checkpoint)", "اختبار كامل", "#/mock", 90, true)
  };
  PTE.dayTasks = function (i) {
    i = PTE.plan.clampDay(i);
    const w = PTE.plan.weekOf(i), st = PTE.plan.station(w), role = PTE.plan.role(i);
    const list = i === 1 ? [PTE.tasks.diag, PTE.tasks.srs] : [PTE.tasks.srs];
    list.push(PTE.tasks.phon);
    role.tasks.forEach((id) => PTE.tasks[id] && list.push(PTE.tasks[id]));
    list.push(Object.assign({}, PTE.tasks.drive, { route: "#/drive/u" + String(w).padStart(2, "0"), en: "Drive lessons · Unit " + w + ": " + st.en }));
    if (/CHECKPOINT/.test(st.milestone) && PTE.plan.dayInWeek(i) === 7) { const k = list.findIndex((x) => x.id === "mini"); if (k >= 0) list[k] = PTE.tasks.full; }
    if (w >= 23 && PTE.plan.dayInWeek(i) === 7) { const k = list.findIndex((x) => x.id === "mini"); if (k >= 0) list[k] = PTE.tasks.full; }
    return list;
  };
  PTE.taskKey = (i, id) => "d" + i + ":" + id;
  PTE.isDone = (i, id) => !!S().done[PTE.taskKey(i, id)];
  PTE.todayIndex = () => PTE.plan.clampDay(PTE.plan.dayIndex(new Date()));
  /* mark the current-day task complete from any practice screen */
  PTE.completeTask = function (id, xp) {
    const i = PTE.todayIndex();
    const list = PTE.dayTasks(i);
    if (list.some((t) => t.id === id) && !PTE.isDone(i, id)) {
      S().done[PTE.taskKey(i, id)] = true; PTE.store.save();
      PTE.addXP(xp || 20, "Mission complete!");
      return true;
    }
    return false;
  };

  /* ---------- xp / levels / streak ---------- */
  PTE.ranks = [
    [0, "Ticket Clerk", "موظف التذاكر"], [200, "Signalman", "مراقب الإشارات"], [600, "Fireman", "مساعد المحرك"],
    [1300, "Assistant Driver", "مساعد السائق"], [2400, "Driver", "سائق"], [4000, "Senior Driver", "سائق أول"],
    [6200, "Station Master", "ناظر المحطة"], [9000, "Captain", "الكابتن"], [13000, "Express Legend", "أسطورة السكة"]
  ];
  PTE.rank = function () {
    const xp = S().xp; let r = PTE.ranks[0], next = PTE.ranks[1];
    for (let i = 0; i < PTE.ranks.length; i++) if (xp >= PTE.ranks[i][0]) { r = PTE.ranks[i]; next = PTE.ranks[i + 1] || null; }
    return { name: r[1], ar: r[2], from: r[0], next: next ? next[0] : null, nextName: next ? next[1] : "" };
  };
  PTE.addXP = function (n, why) {
    const before = PTE.rank().name;
    const s = S(); s.xp += n;
    const k = PTE.ymd(); s.log[k] = s.log[k] || { xp: 0, min: 0 }; s.log[k].xp += n;
    PTE.store.save(); PTE.refreshChrome();
    PTE.toast("+" + n + " XP" + (why ? " · " + why : ""));
    const after = PTE.rank().name;
    if (after !== before) PTE.toast("🎖️ New rank: " + after, 4000);
  };
  PTE.addMinutes = function (m) { const s = S(), k = PTE.ymd(); s.minutes += m; s.log[k] = s.log[k] || { xp: 0, min: 0 }; s.log[k].min += m; PTE.store.save(); };
  PTE.streak = function () {
    const log = S().log; let n = 0, d = new Date();
    if (!(log[PTE.ymd(d)] && (log[PTE.ymd(d)].xp > 0 || log[PTE.ymd(d)].min > 0))) d = PTE.addDays(d, -1);
    while (log[PTE.ymd(d)] && (log[PTE.ymd(d)].xp > 0 || log[PTE.ymd(d)].min > 0)) { n++; d = PTE.addDays(d, -1); }
    return n;
  };
  PTE.addScore = function (key, got, max) {
    const s = S(); s.scores[key] = s.scores[key] || [];
    s.scores[key].push({ t: Date.now(), got, max });
    if (s.scores[key].length > 60) s.scores[key].shift();
    PTE.store.save();
  };
  PTE.avgScore = function (key) {
    let a = S().scores[key] || [];
    if (key === "grammar") { a = []; Object.keys(S().scores).forEach((k) => { if (k.indexOf("grammar-") === 0) a = a.concat(S().scores[k]); }); a.sort((x, y) => x.t - y.t); }
    a = a.filter((x) => x.max > 0); if (!a.length) return null;
    const last = a.slice(-10); const g = last.reduce((x, y) => x + y.got, 0), m = last.reduce((x, y) => x + y.max, 0);
    return m ? Math.round((100 * g) / m) : null;
  };
  PTE.logError = function (item) { const s = S(); s.errors.push(Object.assign({ t: Date.now() }, item)); if (s.errors.length > 200) s.errors.shift(); PTE.store.save(); };

  /* ---------- toast ---------- */
  PTE.toast = function (msg, ms) {
    let box = document.getElementById("toasts");
    if (!box) { box = h("div", { id: "toasts", "aria-live": "polite" }); document.body.appendChild(box); }
    const t = h("div", { class: "toast" }, msg);
    box.appendChild(t);
    setTimeout(() => t.classList.add("out"), ms || 2200);
    setTimeout(() => t.remove(), (ms || 2200) + 400);
  };

  /* ---------- sounds (tiny WebAudio beeps) ---------- */
  let actx = null;
  PTE.beep = function (freq, ms, vol) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = freq || 880; g.gain.value = vol || 0.08;
      o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + (ms || 150) / 1000);
    } catch (e) { /* ignore */ }
  };
  PTE.ding = () => { PTE.beep(660, 110); setTimeout(() => PTE.beep(990, 160), 120); };
  PTE.buzz = () => PTE.beep(180, 220, 0.1);

  /* ---------- TTS ---------- */
  const tts = (PTE.tts = {
    voices: [], ready: false, token: 0, playing: false,
    load() {
      if (!("speechSynthesis" in window)) return;
      const fill = () => { tts.voices = speechSynthesis.getVoices() || []; tts.ready = tts.voices.length > 0; };
      fill();
      if (speechSynthesis.onvoiceschanged !== undefined) speechSynthesis.onvoiceschanged = fill;
    },
    has(lang) { return tts.voices.some((v) => v.lang.toLowerCase().startsWith(lang)); },
    voiceFor(lang) {
      const set = S().settings, want = lang === "ar" ? set.voiceAr : set.voiceEn;
      if (want) { const v = tts.voices.find((x) => x.name === want); if (v) return v; }
      const pref = lang === "ar" ? ["ar-eg", "ar-sa", "ar"] : ["en-gb", "en-us", "en-au", "en"];
      for (const p of pref) { const v = tts.voices.find((x) => x.lang.toLowerCase().replace("_", "-").startsWith(p)); if (v) return v; }
      return null;
    },
    chunks(text) {
      const parts = String(text).replace(/\s+/g, " ").match(/[^.!?؟;:]+[.!?؟;:]*/g) || [text];
      const out = []; let cur = "";
      parts.forEach((p) => { if ((cur + p).length > 180 && cur) { out.push(cur); cur = p; } else cur += p; });
      if (cur.trim()) out.push(cur);
      return out.map((x) => x.trim()).filter(Boolean);
    },
    cancel() { tts.token++; tts.playing = false; try { speechSynthesis.cancel(); } catch (e) { /* none */ } },
    /* speak(text, {lang:'en'|'ar', rate, pitch}) -> Promise (resolves when done or cancelled) */
    speak(text, o) {
      o = o || {};
      return new Promise((resolve) => {
        if (!("speechSynthesis" in window)) { resolve(false); return; }
        const my = ++tts.token; const lang = o.lang || "en"; const parts = tts.chunks(text); let i = 0;
        tts.playing = true;
        const next = () => {
          if (my !== tts.token || i >= parts.length) { if (my === tts.token) tts.playing = false; resolve(my === tts.token); return; }
          const u = new SpeechSynthesisUtterance(parts[i++]);
          const v = tts.voiceFor(lang); if (v) { u.voice = v; u.lang = v.lang; } else u.lang = lang === "ar" ? "ar-SA" : "en-GB";
          u.rate = o.rate || (lang === "ar" ? 0.95 : S().settings.rate); u.pitch = o.pitch || 1;
          u.onend = next; u.onerror = next;
          try { speechSynthesis.speak(u); } catch (e) { next(); }
        };
        next();
      });
    },
    wait(ms, token) { return new Promise((r) => setTimeout(r, ms)); }
  });
  PTE.say = (t, lang, rate) => tts.speak(t, { lang: lang || "en", rate });
  PTE.speakBtn = function (text, lang, label) {
    const b = h("button", { class: "btn mini speak", type: "button", "aria-label": "Listen", onclick: () => { PTE.say(text, lang); } }, "🔊" + (label ? " " + label : ""));
    return b;
  };

  /* ---------- SRS (Leitner) ---------- */
  const INTERVALS = [0, 1, 2, 4, 8, 16, 35, 70];
  PTE.srs = {
    allWords() {
      const D = PTE.D; return (D.vocabA || []).concat(D.vocabB || [], S().myWords || []);
    },
    byId(id) { return PTE.srs._map ? PTE.srs._map[id] : (PTE.srs._map = Object.fromEntries(PTE.srs.allWords().map((w) => [w.id, w])), PTE.srs._map[id]); },
    state(id) { return S().srs[id]; },
    due() {
      const today = PTE.ymd(), s = S().srs;
      return Object.keys(s).filter((id) => s[id].due <= today && PTE.srs.byId(id)).sort((a, b) => s[a].due.localeCompare(s[b].due));
    },
    newWords(n) {
      const s = S().srs; const w = PTE.srs.allWords(); const week = PTE.plan.weekOf(PTE.todayIndex()); const topic = PTE.plan.station(week).topic;
      const fresh = w.filter((x) => !s[x.id]);
      const pref = fresh.filter((x) => x.topic && topic && x.topic.toLowerCase().indexOf(topic.slice(0, 4)) >= 0);
      return pref.concat(fresh.filter((x) => pref.indexOf(x) < 0)).slice(0, n);
    },
    learn(id) { const s = S(); if (!s.srs[id]) { s.srs[id] = { box: 0, due: PTE.ymd(), reps: 0, lapses: 0 }; PTE.store.save(); } },
    grade(id, ok) {
      const s = S(); const st = (s.srs[id] = s.srs[id] || { box: 0, due: PTE.ymd(), reps: 0, lapses: 0 });
      st.reps++;
      if (ok) st.box = Math.min(INTERVALS.length - 1, st.box + 1); else { st.box = 0; st.lapses++; }
      st.due = PTE.ymd(PTE.addDays(new Date(), INTERVALS[st.box] || 0));
      PTE.store.save();
    },
    counts() {
      const s = S().srs, ids = Object.keys(s); const today = PTE.ymd();
      return { learned: ids.length, due: ids.filter((i) => s[i].due <= today).length, mastered: ids.filter((i) => s[i].box >= 5).length, total: PTE.srs.allWords().length };
    }
  };

  /* ---------- UI bits ---------- */
  PTE.bar = (pct, cls) => h("div", { class: "bar " + (cls || "") }, h("i", { style: { width: Math.max(0, Math.min(100, pct)) + "%" } }));
  PTE.card = (title, ...kids) => h("section", { class: "card" }, title ? h("h2", null, title) : null, kids);
  PTE.pageHead = function (en, ar, sub) {
    return h("header", { class: "pagehead" }, h("h1", null, en, h("span", { class: "ar-title", dir: "rtl", lang: "ar" }, ar)), sub ? h("p", { class: "sub" }, sub) : null);
  };
  /* collapsible Arabic explanation, respects settings */
  PTE.arBox = function (text, label) {
    if (!text) return null;
    const open = S().settings.showAr;
    const d = h("details", { class: "arbox", open: open ? "" : null }, h("summary", null, label || "شرح بالعربي · Arabic"), PTE.ar(text));
    return d;
  };
  PTE.back = (href, label) => h("a", { class: "back", href }, "← " + (label || "Back"));
  PTE.chips = (arr) => h("div", { class: "chips" }, arr.map((x) => h("span", { class: "chip" }, x)));
  PTE.fireworks = function () {
    const box = h("div", { class: "confetti" });
    const cols = ["#00778B", "#59CBE8", "#F1B434", "#CB2C30", "#71B2C9"];
    for (let i = 0; i < 40; i++) box.appendChild(h("i", { style: { left: Math.random() * 100 + "%", background: cols[i % 5], animationDelay: Math.random() * 0.4 + "s", transform: "rotate(" + Math.random() * 360 + "deg)" } }));
    document.body.appendChild(box); setTimeout(() => box.remove(), 2200);
  };

  /* generic multiple choice renderer: opts:[..], onPick(idx)->bool; returns element */
  PTE.choices = function (opts, check, after) {
    const wrap = h("div", { class: "choices" }); let locked = false;
    opts.forEach((o, i) => {
      const b = h("button", { class: "choice", type: "button", onclick: () => {
        if (locked) return; locked = true;
        const ok = check(i);
        b.classList.add(ok ? "good" : "bad");
        if (!ok) { const rr = check.correctIndex !== undefined ? check.correctIndex : null; if (rr !== null) wrap.children[rr].classList.add("good"); }
        ok ? PTE.ding() : PTE.buzz();
        if (ok && PTE.fx) { PTE.fx.spark(PTE.fx.pointer.x, PTE.fx.pointer.y, 10); PTE.fx.pop(b); }
        after && after(ok, i);
      } }, o);
      wrap.appendChild(b);
    });
    return wrap;
  };

  /* ---------- router ---------- */
  const NAV = [
    ["#/home", "🏠", "Home", "الرئيسية"], ["#/diagnostic", "🧭", "Start quiz", "اختبار المستوى"], ["#/today", "📅", "Today", "اليوم"], ["#/plan", "🗺️", "Plan", "الخطة"],
    ["#/vocab", "🧠", "Vocabulary", "المفردات"], ["#/phonetics", "🔊", "Phonetics", "الفوناتكس"], ["#/grammar", "📘", "Grammar", "القواعد"],
    ["#/speaking", "🎤", "Speaking", "المحادثة"], ["#/listening", "🎧", "Listening", "الاستماع"], ["#/writing", "📝", "Writing", "الكتابة"],
    ["#/reading", "📖", "Reading", "القراءة"], ["#/strategies", "🧭", "Strategies", "الاستراتيجيات"], ["#/mock", "🏁", "Mock tests", "اختبارات تجريبية"],
    ["#/drive", "🚆", "Drive mode", "وضع القيادة"], ["#/story", "📚", "Story", "القصة"], ["#/progress", "📈", "Progress", "التقدم"],
    ["#/glossary", "🔤", "Glossary", "المصطلحات"], ["#/settings", "⚙️", "Settings", "الإعدادات"]
  ];
  PTE.nav = NAV;
  const MOBILE = ["#/home", "#/today", "#/drive", "#/vocab", "#/more"];

  PTE.refreshChrome = function () {
    const xp = document.getElementById("hud-xp"), st = document.getElementById("hud-streak"), rk = document.getElementById("hud-rank"), dl = document.getElementById("hud-days");
    if (xp) xp.textContent = S().xp + " XP";
    if (st) st.textContent = "🔥 " + PTE.streak();
    if (rk) rk.textContent = PTE.rank().name;
    if (dl) { const d = PTE.plan.daysLeft(); dl.textContent = d > 0 ? d + " days to exam" : "Exam day!"; }
  };

  PTE.route = function () {
    const raw = (location.hash || "#/home").replace(/^#\/?/, "");
    const [path, query] = raw.split("?");
    const parts = path.split("/").filter(Boolean);
    const name = parts[0] || "home";
    const main = document.getElementById("main");
    tts.cancel();
    PTE.fx && PTE.fx.cleanup();
    if (PTE.onLeave) { try { PTE.onLeave(); } catch (e) { /* noop */ } PTE.onLeave = null; }
    PTE.clear(main);
    const view = PTE.views[name];
    document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", a.getAttribute("data-nav") === "#/" + name));
    document.body.setAttribute("data-view", name);
    try {
      if (!view) main.appendChild(h("div", { class: "card" }, h("h2", null, "Not found"), h("a", { class: "btn", href: "#/home" }, "Home")));
      else { const out = view(parts.slice(1), new URLSearchParams(query || "")); if (out) main.appendChild(out); }
    } catch (e) {
      console.error(e);
      main.appendChild(h("div", { class: "card" }, h("h2", null, "Something went wrong"), h("pre", null, String(e && e.stack || e)), h("a", { class: "btn", href: "#/home" }, "Home")));
    }
    window.scrollTo(0, 0);
    PTE.refreshChrome();
    PTE.fx && PTE.fx.enhance(main);
    const nm = document.getElementById("morepanel"); if (nm) nm.classList.remove("open");
  };

  PTE.buildChrome = function () {
    const side = document.getElementById("side"), bottom = document.getElementById("bottom"), top = document.getElementById("top");
    side.appendChild(h("a", { class: "brand", href: "#/home" }, h("span", { class: "logo" }, "🚆"), h("span", null, h("b", null, "PTE-79 Express"), h("small", null, "قطار PTE ٧٩"))));
    NAV.forEach((n) => side.appendChild(h("a", { href: n[0], "data-nav": n[0], class: "navlink" }, h("span", { class: "ic" }, n[1]), h("span", null, n[2], h("small", { dir: "rtl" }, n[3])))));
    top.appendChild(h("a", { class: "brand mini", href: "#/home" }, "🚆 PTE-79"));
    top.appendChild(h("div", { class: "hud" }, h("span", { id: "hud-rank", class: "pill" }), h("span", { id: "hud-xp", class: "pill" }), h("span", { id: "hud-streak", class: "pill" }), h("span", { id: "hud-days", class: "pill warn" })));
    MOBILE.forEach((m) => {
      if (m === "#/more") { bottom.appendChild(h("button", { class: "bnav", type: "button", onclick: () => document.getElementById("morepanel").classList.toggle("open") }, h("span", null, "☰"), h("em", null, "More"))); return; }
      const n = NAV.find((x) => x[0] === m);
      bottom.appendChild(h("a", { href: m, class: "bnav", "data-nav": m }, h("span", null, n[1]), h("em", null, n[2])));
    });
    const mp = h("div", { id: "morepanel", "data-lenis-prevent": "" }, NAV.filter((n) => MOBILE.indexOf(n[0]) < 0).map((n) => h("a", { href: n[0], class: "morelink" }, h("span", null, n[1]), h("span", null, n[2], h("small", { dir: "rtl" }, n[3])))));
    document.body.appendChild(mp);
  };

  PTE.boot = function () {
    tts.load();
    PTE.fx && PTE.fx.init();
    PTE.buildChrome();
    window.addEventListener("hashchange", PTE.route);
    PTE.route();
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
  };
})();

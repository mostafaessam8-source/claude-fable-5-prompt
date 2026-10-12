/* DRIVE MODE — hands-free, eyes-free audio lessons ("Radio Lines") for the car/commute.
   Segments are spoken by the browser TTS; giant buttons, media-session (headset / steering-wheel buttons),
   wake-lock + black-screen mode, optional voice commands. Audio only: never needs the screen while moving. */
(function () {
  "use strict";
  const PTE = window.PTE, h = PTE.h, S = () => PTE.store.get();
  const wc = (t) => PTE.countWords(t);

  /* ---------- segment helpers ---------- */
  let G = 0;
  const say = (text, lang, o) => Object.assign({ t: "say", text, lang: lang || "en", g: G }, o || {});
  const pause = (ms, label) => ({ t: "pause", ms, label, g: G });
  const cue = (label) => ({ t: "beep", label, g: G });
  const grp = () => ++G;
  const repeatGap = (text) => Math.max(2200, wc(text) * 520 + 1200);

  PTE.driveKit = { say, pause, cue, grp, repeatGap, reset: () => { G = 0; } };

  /* ---------- lines (each returns segments for a target number of minutes) ---------- */
  const LINES = [
    { id: "words", icon: "🧠", en: "Word Express", ar: "قطار الكلمات", desc: "Listen, repeat, remember — new and due words with Arabic meaning.",
      build(min) {
        const due = PTE.srs.due().map((id) => PTE.srs.byId(id)); const n = Math.max(4, Math.round(min * 1.6));
        const list = due.concat(PTE.srs.newWords(n)).filter(Boolean).slice(0, n); const out = [];
        out.push(say("Word Express. Listen, then repeat after the beep.", "en", { show: { en: "Word Express", ar: "قطار الكلمات" } }), say("قطار الكلمات. استمع ثم كرر بعد الصفارة.", "ar"));
        list.forEach((w) => { grp(); out.push(
          say(w.en, "en", { rate: 0.8, show: { en: w.en, ar: w.ar }, lbl: "WORD", learn: w.id }), cue("Repeat · كرر"), pause(repeatGap(w.en)),
          say(w.ar, "ar", { show: { en: w.en, ar: w.ar }, lbl: "MEANING" }), pause(500),
          say(w.ex, "en", { show: { en: w.ex, ar: w.exAr }, lbl: "EXAMPLE" }), cue("Repeat · كرر"), pause(repeatGap(w.ex)),
          say(w.exAr, "ar", { show: { en: w.ex, ar: w.exAr } }), pause(700)); });
        grp(); out.push(say("Great work. These words are now scheduled for review.", "en", { show: { en: "Words saved ✓", ar: "تم حفظ الكلمات للمراجعة" } }));
        return out;
      } },
    { id: "sounds", icon: "🔊", en: "Sound Lab", ar: "معمل الأصوات", desc: "Vowels, consonants and Arabic-speaker traps with repeat drills.",
      build(min) {
        const P = PTE.D.phonetics || {}; const sounds = PTE.pick([].concat(P.vowels || [], P.diphthongs || [], P.consonants || []), Math.max(3, Math.round(min / 1.5))); const out = [];
        out.push(say("Sound Lab. Repeat each word clearly after the beep.", "en", { show: { en: "Sound Lab", ar: "معمل الأصوات" } }));
        sounds.forEach((s) => { grp(); out.push(say("The sound: " + s.label, "en", { show: { en: "/" + s.ipa + "/ " + (s.label || ""), ar: "" }, lbl: "SOUND" }));
          s.ex.forEach((e) => out.push(say(e.w, "en", { rate: 0.75, show: { en: e.w, ar: "/" + e.ipa + "/" }, lbl: "REPEAT" }), cue("Repeat · كرر"), pause(1800)));
          out.push(say(s.ar, "ar", { show: { en: "/" + s.ipa + "/", ar: "" }, lbl: "TIP" }), pause(600)); });
        const tr = PTE.pick(P.arabicTraps || [], Math.max(1, Math.round(min / 6)));
        tr.forEach((t) => { grp(); out.push(say("Arabic speaker trap: " + t.title, "en", { show: { en: t.title, ar: t.titleAr }, lbl: "TRAP" }), say(t.problem, "ar", { show: { en: t.title, ar: "" } }), pause(500));
          (t.examples || []).slice(0, 3).forEach((e) => out.push(say(e.w, "en", { rate: 0.75, show: { en: e.w, ar: "/" + e.ipa + "/" } }), cue("Repeat · كرر"), pause(1800))); });
        return out;
      } },
    { id: "rs", icon: "🔁", en: "Repeat Sentence Drill", ar: "تدريب إعادة الجملة", desc: "Hear a sentence, repeat it aloud after the beep — exactly like the exam.",
      build(min) {
        const items = PTE.pick(PTE.D.bankSpeaking ? PTE.D.bankSpeaking.rs : [], Math.max(5, Math.round(min * 2.2))); const out = [];
        out.push(say("Repeat Sentence drill. Listen once, then repeat after the beep.", "en", { show: { en: "Repeat Sentence", ar: "إعادة الجملة" } }));
        items.forEach((it) => { grp(); out.push(say(it.text, "en", { rate: 0.95, show: { en: "🎧 Listen…", ar: "استمع" }, lbl: "LISTEN" }), cue("Repeat · كرر"), pause(Math.max(2500, wc(it.text) * 480 + 1500)),
          say("Model:", "en", { show: { en: it.text, ar: "" }, lbl: "MODEL" }), say(it.text, "en", { rate: 0.9, show: { en: it.text, ar: "" } }), pause(900)); });
        return out;
      } },
    { id: "dictation", icon: "✍️", en: "Dictation Drill", ar: "تدريب الإملاء", desc: "Hear a sentence, hold it in memory, check it against the spelling.",
      build(min) {
        const items = PTE.pick(PTE.D.bankLW ? PTE.D.bankLW.wfd : [], Math.max(5, Math.round(min * 1.8))); const out = [];
        out.push(say("Dictation drill. Listen, hold the sentence in your head, then I will spell the tricky words.", "en", { show: { en: "Write From Dictation", ar: "الإملاء" } }));
        items.forEach((it) => { grp(); out.push(say(it.text, "en", { rate: 0.95, show: { en: "🎧 Listen…", ar: "" }, lbl: "LISTEN" }), pause(3500, "Say it in your head"), say(it.text, "en", { rate: 0.8, show: { en: it.text, ar: "" }, lbl: "CHECK" }), cue("Repeat · كرر"), pause(wc(it.text) * 450 + 1200)); });
        return out;
      } },
    { id: "asq", icon: "❓", en: "Quick Quiz (Short Answers)", ar: "اختبار سريع", desc: "Short questions, think 4 seconds, then hear the answer.",
      build(min) {
        const items = PTE.pick(PTE.D.bankSpeaking ? PTE.D.bankSpeaking.asq : [], Math.max(8, Math.round(min * 3))); const out = [];
        out.push(say("Quick quiz. Answer out loud before you hear the answer.", "en", { show: { en: "Quick Quiz", ar: "اختبار سريع" } }));
        items.forEach((it) => { grp(); out.push(say(it.q, "en", { show: { en: it.q, ar: "" }, lbl: "QUESTION" }), cue("Answer · أجب"), pause(3500), say(it.a, "en", { show: { en: "✔ " + it.a, ar: "" }, lbl: "ANSWER" }), pause(600)); });
        return out;
      } },
    { id: "grammar", icon: "📘", en: "Grammar Radio", ar: "إذاعة القواعد", desc: "This week's grammar unit explained in Arabic, then an oral quiz.",
      build(min) {
        const gid = PTE.plan.station(PTE.plan.weekOf(PTE.todayIndex())).grammar; const g = (PTE.D.grammar || []).find((x) => x.id === gid) || (PTE.D.grammar || [])[0]; const out = [];
        if (!g) return [say("Grammar content is not available.", "en")];
        out.push(say("Grammar Radio. " + g.title, "en", { show: { en: g.title, ar: g.titleAr } }), say(g.why, "ar", { show: { en: g.title, ar: g.titleAr } }), pause(500));
        g.rules.slice(0, Math.max(2, Math.round(min / 3))).forEach((r) => { grp(); out.push(say(r.ar, "ar", { show: { en: r.en, ar: r.ar }, lbl: "RULE" }), say(r.en, "en", { show: { en: r.en, ar: r.ar } }), pause(700)); });
        g.examples.slice(0, Math.max(3, Math.round(min / 2))).forEach((e) => { grp(); out.push(say(e.en, "en", { show: { en: e.en, ar: e.ar }, lbl: "EXAMPLE" }), cue("Repeat · كرر"), pause(repeatGap(e.en)), say(e.ar, "ar", { show: { en: e.en, ar: e.ar } })); });
        const qs = g.exercises.filter((x) => x.type === "mcq").slice(0, Math.max(3, Math.round(min / 2.5)));
        out.push(say("Now a quick oral quiz. Choose A, B, C or D in your head.", "en", { show: { en: "Oral quiz", ar: "اختبار شفهي" } }));
        qs.forEach((q) => { grp(); const L = ["A", "B", "C", "D"]; out.push(say(q.q.replace(/_+/g, "blank"), "en", { show: { en: q.q, ar: "" }, lbl: "QUESTION" })); q.options.forEach((o, i) => out.push(say(L[i] + ". " + o, "en", { show: { en: L[i] + ". " + o, ar: "" } }), pause(250))); out.push(cue("Answer · أجب"), pause(4500), say("The answer is " + L[q.answer] + ". " + q.options[q.answer], "en", { show: { en: "✔ " + L[q.answer] + ". " + q.options[q.answer], ar: q.whyAr || "" }, lbl: "ANSWER" }), say(q.whyAr || q.why, q.whyAr ? "ar" : "en", { show: { en: "✔ " + q.options[q.answer], ar: q.whyAr || "" } }), pause(600)); });
        return out;
      } },
    { id: "listen", icon: "🎧", en: "Lecture & Summary", ar: "محاضرة وتلخيص", desc: "A short lecture, then think of the main idea, then hear a model summary.",
      build(min) {
        const items = PTE.pick(PTE.D.bankLW ? PTE.D.bankLW.sst : [], Math.max(1, Math.round(min / 3))); const out = [];
        out.push(say("Lecture and summary. Listen carefully. Then say the main idea aloud.", "en", { show: { en: "Lecture & Summary", ar: "محاضرة وتلخيص" } }));
        items.forEach((it) => { grp(); out.push(say("Lecture: " + it.title, "en", { show: { en: it.title, ar: "" }, lbl: "LECTURE" }), say(it.transcript, "en", { rate: 0.95, show: { en: "🎧 " + it.title, ar: "" } }), cue("Your turn · دورك"), pause(9000, "Say the main idea"), say("Model summary.", "en", { show: { en: "Model summary", ar: "" } }), say(it.model, "en", { rate: 0.95, show: { en: it.model, ar: it.ar || "" }, lbl: "MODEL" }), it.ar ? say(it.ar, "ar", { show: { en: it.title, ar: it.ar } }) : pause(100), pause(900)); });
        return out;
      } },
    { id: "templates", icon: "🗂️", en: "Templates Recital", ar: "حفظ القوالب", desc: "Speaking & essay templates read in chunks for you to repeat.",
      build(min) {
        const T = (PTE.D.strategies || {}).templates || {}; const out = []; const chunks = [];
        const add = (title, text) => { if (text) chunks.push([title, text]); };
        (T.di || []).slice(0, 5).forEach((d) => add("Describe Image: " + d.kind, d.template && d.template.replace(/\[[^\]]*\]/g, "blank")));
        if (T.rl) add("Re-tell Lecture", T.rl.template && T.rl.template.replace(/\[[^\]]*\]/g, "blank"));
        if (T.essay) { (T.essay.intro || []).slice(0, 2).forEach((x) => add("Essay introduction", x)); (T.essay.conclusion || []).slice(0, 2).forEach((x) => add("Essay conclusion", x)); (T.essay.linking || []).slice(0, 1).forEach((x) => add("Linking words", x)); }
        if (T.sst) add("Summarize Spoken Text", T.sst.template && T.sst.template.replace(/\[[^\]]*\]/g, "blank"));
        out.push(say("Templates recital. Repeat each template after the beep.", "en", { show: { en: "Templates", ar: "القوالب" } }));
        chunks.slice(0, Math.max(4, Math.round(min * 1.2))).forEach((c) => { grp(); const sentences = String(c[1]).split(/(?<=[.!?])\s+/).filter(Boolean); out.push(say(c[0], "en", { show: { en: c[0], ar: "" }, lbl: "TEMPLATE" })); sentences.forEach((sn) => out.push(say(sn, "en", { rate: 0.9, show: { en: sn, ar: "" } }), cue("Repeat · كرر"), pause(repeatGap(sn)))); });
        return out;
      } },
    { id: "story", icon: "📚", en: "Story Time", ar: "وقت القصة", desc: "This week's episode of the PTE-79 Express, in English and Arabic.",
      build() {
        const w = PTE.plan.weekOf(PTE.todayIndex()); const st = PTE.plan.station(w); const out = [];
        out.push(say("Episode " + w + ". " + st.en, "en", { show: { en: "Episode " + w + ": " + st.en, ar: st.ar } }));
        st.story.forEach((s, i) => { grp(); out.push(say(s, "en", { show: { en: s, ar: st.storyAr[i] } }), pause(500), say(st.storyAr[i], "ar", { show: { en: s, ar: st.storyAr[i] } }), pause(700)); });
        grp(); out.push(say("Riddle: " + st.riddle.clue, "en", { show: { en: "🧩 " + st.riddle.clue, ar: "لغز المحطة" } }), pause(8000, "Think…"), say("The answer is: " + st.riddle.answer, "en", { show: { en: "✔ " + st.riddle.answer, ar: "" } }));
        return out;
      } },
    { id: "mix", icon: "🚗", en: "Commute Mix", ar: "ميكس الطريق", desc: "A balanced mix: story, words, sounds, sentences, quick quiz. Best choice for a drive.",
      build(min) {
        const get = (id, m) => LINES.find((l) => l.id === id).build(m); const m = Math.max(5, min); let out = [];
        out = out.concat(get("story", 2).slice(0, 4), get("words", m * 0.3), get("sounds", m * 0.15), get("rs", m * 0.2), get("asq", m * 0.15), get("grammar", m * 0.2));
        out.push(grp() && say("That is the end of the Commute Mix. Well done, Captain.", "en", { show: { en: "Well done, Captain 🚆", ar: "أحسنت يا كابتن" } }));
        return out;
      } }
  ];

  /* ---------- engine ---------- */
  const D = { list: [], i: 0, token: 0, running: false, startedAt: 0, lineId: null, minutes: 10, rateMul: 1, wake: null, voiceCmd: false, recog: null, lesson: null, auto: true };
  let overlay = null, audioKeep = null;

  const SILENT = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAABErAAABAAgAZGF0YQAAAAA=";
  let nosleepVideo = null;
  function awakeStatus(txt, ok) { if (!overlay) return; const el = overlay.querySelector(".awake"); if (el) { el.textContent = txt; el.style.color = ok ? "#59CBE8" : "#F1B434"; } }
  function requestWake() {
    if (!("wakeLock" in navigator) || document.visibilityState !== "visible") return;
    navigator.wakeLock.request("screen").then((l) => {
      D.wake = l; awakeStatus("🔆 Screen kept awake · الشاشة لن تنطفئ", true);
      l.addEventListener("release", () => { D.wake = null; if (D.overlayOpen) { awakeStatus("⚠ Re-locking screen…", false); setTimeout(requestWake, 300); } });
    }).catch(() => { D.wake = null; });
  }
  /* "NoSleep" trick: a tiny muted looping video keeps the screen on where the Wake Lock API is missing or fails (older iPhones, home-screen apps, battery saver) */
  function startVideoKeepAwake() {
    try {
      if (!nosleepVideo) {
        const v = document.createElement("video"); v.setAttribute("playsinline", ""); v.setAttribute("muted", ""); v.muted = true; v.loop = true; v.setAttribute("aria-hidden", "true");
        v.style.cssText = "position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:.02;pointer-events:none;z-index:1";
        const m = document.createElement("source"); m.src = "icons/nosleep.mp4"; m.type = "video/mp4"; const w = document.createElement("source"); w.src = "icons/nosleep.webm"; w.type = "video/webm"; v.appendChild(m); v.appendChild(w); nosleepVideo = v;
      }
      (overlay || document.body).appendChild(nosleepVideo);
      const pr = nosleepVideo.play(); if (pr && pr.then) pr.then(() => { if (!D.wake) awakeStatus("🔆 Screen kept awake (video mode) · الشاشة لن تنطفئ", true); }).catch(() => awakeStatus("⚠ Tap the screen once to keep it awake · المس الشاشة مرة", false));
    } catch (e) { /* ignore */ }
  }
  function keepAlive(on) {
    try {
      if (on) {
        if (!audioKeep) { audioKeep = new Audio(SILENT); audioKeep.loop = true; audioKeep.volume = 0.01; }
        audioKeep.play().catch(() => {});
        if ("mediaSession" in navigator) {
          navigator.mediaSession.metadata = new MediaMetadata({ title: "PTE-79 Express — Drive mode", artist: "Captain Mostafa", album: "PTE Academy" });
          const set = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch (e) { /* unsupported */ } };
          set("play", () => toggle()); set("pause", () => toggle()); set("nexttrack", () => nextGroup()); set("previoustrack", () => prevGroup());
          set("seekforward", () => nextGroup()); set("seekbackward", () => repeatGroup());
        }
        requestWake(); startVideoKeepAwake();   /* both at once: belt and braces */
        awakeStatus("⏳ Keeping screen awake…", false);
        D.awakeTimer = setInterval(() => { if (!D.overlayOpen) return; if (!D.wake && "wakeLock" in navigator) requestWake(); if (nosleepVideo && nosleepVideo.paused) nosleepVideo.play().catch(() => {}); }, 15000);
      } else {
        clearInterval(D.awakeTimer);
        audioKeep && audioKeep.pause();
        if (nosleepVideo) { try { nosleepVideo.pause(); nosleepVideo.remove(); } catch (e) { /* ok */ } }
        if (D.wake) { D.wake.release().catch(() => {}); D.wake = null; }
        if ("mediaSession" in navigator) { ["play", "pause", "nexttrack", "previoustrack", "seekforward", "seekbackward"].forEach((a) => { try { navigator.mediaSession.setActionHandler(a, null); } catch (e) { /* ok */ } }); }
      }
    } catch (e) { /* ignore */ }
  }
  /* any touch also (re)starts the keep-awake video: some browsers only allow video.play() inside a user gesture */
  document.addEventListener("pointerdown", () => { if (D.overlayOpen && nosleepVideo && nosleepVideo.paused) nosleepVideo.play().catch(() => {}); }, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!D.overlayOpen) return;
    if (document.visibilityState === "visible") { requestWake(); if (nosleepVideo) nosleepVideo.play().catch(() => {}); if (D.running) runFrom(groupStart(D.i)); /* speech is often cut when the page was hidden: restart the current item */ }
  });

  const sleep = (ms, tok) => new Promise((res) => { const t0 = Date.now(); (function chk() { if (tok !== D.token || Date.now() - t0 >= ms) return res(tok === D.token); setTimeout(chk, 80); })(); });

  function paint(seg) {
    if (!overlay) return;
    const s = seg.show; const now = overlay.querySelector(".now");
    if (s) { now.querySelector(".lbl").textContent = seg.lbl || ""; now.querySelector(".en").textContent = s.en || ""; now.querySelector(".ar").textContent = s.ar || ""; }
    if (seg.t === "beep" || seg.t === "pause") { if (seg.label || seg.t === "beep") now.querySelector(".lbl").textContent = seg.label || "Your turn · دورك"; }
    overlay.querySelector(".dbar i").style.width = Math.round((100 * D.i) / Math.max(1, D.list.length)) + "%";
    overlay.querySelector(".cnt").textContent = Math.round((100 * D.i) / Math.max(1, D.list.length)) + "%";
  }

  async function runFrom(i) {
    const tok = ++D.token; PTE.tts.cancel(); D.token = tok; D.running = true; setPlayIcon(true);
    for (let k = i; k < D.list.length; k++) {
      if (tok !== D.token) return;
      D.i = k; const seg = D.list[k]; paint(seg);
      if (seg.t === "say") { if (seg.learn) PTE.srs.learn(seg.learn); const rate = (seg.rate || (seg.lang === "ar" ? 0.95 : S().settings.driveRate)) * D.rateMul; const ok = await PTE.tts.speak(seg.text, { lang: seg.lang, rate: Math.min(1.5, Math.max(0.5, rate)) }); if (!ok || tok !== D.token) return; }
      else if (seg.t === "beep") { PTE.beep(880, 200, 0.15); if (!(await sleep(350, tok))) return; }
      else if (seg.t === "pause") { if (!(await sleep(seg.ms, tok))) return; }
    }
    if (tok === D.token) finishLine();
  }

  function setPlayIcon(playing) { if (!overlay) return; overlay.querySelector(".main").textContent = playing ? "⏸" : "▶"; overlay.querySelector(".main").setAttribute("aria-label", playing ? "Pause" : "Play"); }
  function stopSpeech() { D.token++; PTE.tts.cancel(); D.running = false; setPlayIcon(false); }
  function toggle() { if (D.running) stopSpeech(); else runFrom(D.i); }
  function groupStart(i) { const g = D.list[i].g; while (i > 0 && D.list[i - 1].g === g) i--; return i; }
  function nextGroup() { const g = D.list[D.i].g; let k = D.i; while (k < D.list.length && D.list[k].g === g) k++; if (k >= D.list.length) return finishLine(); runFrom(k); }
  function prevGroup() { const s = groupStart(D.i); runFrom(s > 0 && D.i - s < 2 ? groupStart(s - 1) : s); }
  function repeatGroup() { runFrom(groupStart(D.i)); }

  function finishLine() {
    D.running = false; stopSpeech(); const mins = Math.max(1, Math.round((Date.now() - D.startedAt) / 60000));
    PTE.addMinutes(mins); PTE.addXP(20 + mins * 2, "Drive lesson"); PTE.completeTask("drive", 20);
    const ref = D.lesson; if (ref) { const dd = (S().driveDone = S().driveDone || {}); const prev = typeof dd[ref.les.id] === "object" ? dd[ref.les.id] : { n: 0 }; dd[ref.les.id] = { t: Date.now(), n: (prev.n || 0) + 1, min: mins }; PTE.store.save(); }
    const nxt = ref ? nextLesson(ref.unit, ref.les) : null;
    if (overlay) { const now = overlay.querySelector(".now"); now.querySelector(".lbl").textContent = "LESSON COMPLETE · انتهى الدرس"; now.querySelector(".en").textContent = ref ? "✔ " + ref.les.en : "Lesson complete 🎉 " + mins + " min"; now.querySelector(".ar").textContent = nxt && D.auto ? (nxt.newUnit ? "الوحدة التالية: " + nxt.unit.titleAr : "التالي: " + nxt.les.ar) : "أحسنت يا كابتن"; }
    if (ref && nxt && D.auto) {
      const tok = D.token; PTE.tts.speak(nxt.newUnit ? "Unit complete. Well done! Next: " + nxt.unit.title + ". " + nxt.les.en : "Lesson complete. Next: " + nxt.les.en, { lang: "en", rate: 0.95 }).then((ok) => { if (!ok || !D.overlayOpen || tok !== D.token) return; setTimeout(() => { if (D.overlayOpen && tok === D.token) startLesson(nxt.unit, nxt.les, true); }, 2500); });
    } else PTE.tts.speak(ref && !nxt ? "You finished this whole unit. Well done, Captain." : "Lesson complete. Well done, Captain.", { lang: "en" });
    PTE.fireworks();
  }
  function nextLesson(unit, les) {
    const us = PTE.driveUnits(); const i = unit.lessons.indexOf(les);
    if (i >= 0 && i < unit.lessons.length - 1) return { unit, les: unit.lessons[i + 1] };
    const ui = us.indexOf(unit); if (ui >= 0 && ui < us.length - 1) return { unit: us[ui + 1], les: us[ui + 1].lessons[0], newUnit: true };
    return null;
  }

  /* optional voice commands (beta) */
  function voiceCommands(on) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) { PTE.toast("Voice commands are not supported on this browser"); return false; }
    if (!on) { try { D.recog && (D.recog.onend = null, D.recog.stop()); } catch (e) { /* ok */ } D.recog = null; return false; }
    const r = new SR(); r.continuous = true; r.interimResults = false; r.lang = "en-US";
    r.onresult = (e) => { const t = e.results[e.results.length - 1][0].transcript.toLowerCase();
      if (/\b(next|skip)\b/.test(t)) nextGroup(); else if (/\b(pause|stop|wait)\b/.test(t)) { if (D.running) toggle(); } else if (/\b(play|resume|continue|go)\b/.test(t)) { if (!D.running) toggle(); } else if (/\b(repeat|again)\b/.test(t)) repeatGroup(); else if (/\b(back|previous)\b/.test(t)) prevGroup(); };
    r.onend = () => { if (D.recog === r && D.overlayOpen) { try { r.start(); } catch (e) { /* ok */ } } };
    try { r.start(); D.recog = r; return true; } catch (e) { return false; }
  }

  function openOverlay(line) {
    document.body.classList.add("drive-on"); D.overlayOpen = true;
    const sk = (txt, fn, cls, label) => h("button", { class: cls || "", type: "button", "aria-label": label || txt, onclick: fn }, txt);
    overlay = h("div", { class: "drive", role: "dialog", "aria-label": "Drive mode" },
      h("div", { class: "dtop" }, h("div", null, h("b", null, line.icon + " " + line.en), h("div", { style: { color: "#C8C9C7", fontSize: ".85rem" } }, "Eyes on the road · العين على الطريق"), h("div", { class: "awake", style: { fontSize: ".78rem", color: "#F1B434" } }, "")),
        h("div", { class: "row" }, h("span", { class: "cnt pill" }, "0%"), h("button", { class: "btn red mini", type: "button", onclick: closeOverlay }, "✕ Exit"))),
      h("div", { class: "dbar" }, h("i")),
      h("div", { class: "now", "aria-live": "polite" }, h("div", { class: "lbl" }, "READY"), h("div", { class: "en" }, "Press ▶ to start"), h("div", { class: "ar", dir: "rtl" }, "اضغط ▶ للبدء")),
      h("div", { class: "ctrls" }, sk("⏮", () => prevGroup(), "", "Previous"), sk("⏸", () => toggle(), "main", "Pause"), sk("⏭", () => nextGroup(), "", "Next")),
      h("div", { class: "ctrls", style: { gridTemplateColumns: "repeat(4,1fr)" } },
        sk("🔁", () => repeatGroup(), "", "Repeat this item"), sk("🐢", () => { D.rateMul = Math.max(0.6, D.rateMul - 0.1); PTE.toast("Speed " + Math.round(D.rateMul * 100) + "%"); }, "", "Slower"),
        sk("🐇", () => { D.rateMul = Math.min(1.3, D.rateMul + 0.1); PTE.toast("Speed " + Math.round(D.rateMul * 100) + "%"); }, "", "Faster"),
        sk("🌙", () => overlay.classList.add("dimmed"), "", "Black screen")),
      h("div", { class: "dim", onclick: () => overlay.classList.remove("dimmed") }, "🌙 Black-screen mode — audio keeps playing.\nTap anywhere to wake. · المس الشاشة للإيقاظ"));
    document.body.appendChild(overlay);
    keepAlive(true);
  }
  function closeOverlay() {
    stopSpeech(); voiceCommands(false); D.overlayOpen = false; keepAlive(false);
    document.body.classList.remove("drive-on"); if (overlay) overlay.remove(); overlay = null; PTE.route();
  }
  PTE.onDriveLeave = closeOverlay;

  function startOverlay(title, icon, list, ref) {
    D.list = list; D.i = 0; D.startedAt = Date.now(); D.rateMul = D.rateMul || 1; D.lesson = ref || null;
    if (!D.list.length) { PTE.toast("No content for this lesson yet"); return; }
    if (D.overlayOpen && overlay) { overlay.querySelector(".dtop b").textContent = icon + " " + title; D.token++; PTE.tts.cancel(); setPlayIcon(false); runFrom(0); return; }
    openOverlay({ icon, en: title }); if (D.voiceCmd) voiceCommands(true);
    runFrom(0);
  }
  function startLesson(unit, les, keep) {
    const sd = S(); sd.drive = sd.drive || {}; sd.drive.last = les.id; PTE.store.save();
    G = 0; startOverlay("Unit " + unit.n + " · Lesson " + les.no + "/" + unit.lessons.length + " — " + les.en, les.icon || unit.icon, les.build(), { unit, les });
  }
  function start(line, minutes) { G = 0; D.lineId = line.id; D.lesson = null; startOverlay(line.en, line.icon, line.build(minutes), null); }
  const doneSet = () => (S().driveDone = S().driveDone || {});
  function firstUndone(unit) { const dd = doneSet(); return unit.lessons.find((l) => !dd[l.id]) || null; }
  function continueTarget() {
    const units = PTE.driveUnits(); const last = (S().drive || {}).last; const dd = doneSet();
    if (last) { const u = units.find((x) => last.indexOf(x.id + "-") === 0); if (u) { const cur = u.lessons.find((l) => l.id === last); const nx = cur && dd[last] ? nextLesson(u, cur) : cur ? { unit: u, les: cur } : null; if (nx) return nx; } }
    for (const u of units) { const l = firstUndone(u); if (l) return { unit: u, les: l }; }
    return { unit: units[0], les: units[0].lessons[0] };
  }

  /* ---------- pages ---------- */
  function safety() { return h("div", { class: "safety" }, "🛑 SAFETY FIRST · السلامة أولاً: choose the lesson and press Start while PARKED, then put the phone away. Never touch or look at the screen while the vehicle is moving. Obey traffic laws. اختر الدرس وأنت متوقف ثم ضع الهاتف جانباً."); }
  const unitDone = (u) => u.lessons.filter((l) => doneSet()[l.id]).length;
  const thisWeek = () => PTE.plan.weekOf(PTE.todayIndex());

  PTE.views.drive = function (p) {
    const wrap = h("div"); const units = PTE.driveUnits(); const dd = doneSet();
    D.auto = S().settings.driveAuto !== false;

    /* ===== UNIT PAGE: the 9 lessons of one unit ===== */
    if (p[0]) {
      const ui = units.findIndex((x) => x.id === p[0]); if (ui < 0) return h("div", { class: "card" }, "Unit not found");
      const u = units[ui], done = unitDone(u), cur = firstUndone(u);
      wrap.appendChild(PTE.back("#/drive", "All units · كل الوحدات"));
      wrap.appendChild(PTE.pageHead(u.title, u.titleAr, u.phaseEn + " · " + u.desc));
      if (u.focusAr) wrap.appendChild(PTE.ar(u.focusAr));
      wrap.appendChild(safety());
      wrap.appendChild(h("div", { class: "card tint" }, h("div", { class: "row between" }, h("b", null, done + " / " + u.lessons.length + " lessons · دروس مكتملة"),
        h("button", { class: "btn", type: "button", onclick: () => startLesson(u, cur || u.lessons[0]) }, "▶ " + (done ? (cur ? "Continue" : "Replay unit") : "Start unit") + " · " + (done ? "كمّل" : "ابدأ الوحدة"))), PTE.bar((100 * done) / u.lessons.length)));
      wrap.appendChild(h("div", { class: "lessonmap" }, u.lessons.map((l) => {
        const d = dd[l.id]; const isCur = cur && cur.id === l.id;
        return h("button", { class: "lrow" + (d ? " done" : "") + (isCur ? " cur" : ""), type: "button", onclick: () => startLesson(u, l) },
          h("span", { class: "lno" }, d ? "✓" : String(l.no)),
          h("span", { class: "lbody" }, h("small", null, "Lesson " + l.no + " of " + u.lessons.length + " · " + l.roleEn), h("b", null, l.en.replace(/^[^:]+:\s*/, "")), h("span", { class: "ar", dir: "rtl" }, l.ar)),
          h("span", { class: "lmeta" }, l.icon, h("small", null, "~" + PTE.driveEst(l) + " min"), d && d.t ? h("small", null, "×" + d.n) : null));
      })));
      wrap.appendChild(h("div", { class: "row between" }, ui > 0 ? h("a", { class: "btn ghost", href: "#/drive/" + units[ui - 1].id }, "← Unit " + units[ui - 1].n) : h("span"), ui < units.length - 1 ? h("a", { class: "btn ghost", href: "#/drive/" + units[ui + 1].id }, "Unit " + units[ui + 1].n + " →") : null));
      return wrap;
    }

    /* ===== JOURNEY PAGE: phases -> units ===== */
    const noTTS = !("speechSynthesis" in window);
    wrap.appendChild(PTE.pageHead("Drive Mode 🚆", "وضع القيادة", "26 units · 9 lessons each · one clear path. / ٢٦ وحدة، في كل وحدة ٩ دروس بنفس الترتيب."));
    wrap.appendChild(safety());
    if (noTTS) wrap.appendChild(h("div", { class: "card danger" }, "This browser has no speech synthesis. Use Chrome on Android or Safari on iPhone."));
    const tgt = continueTarget(); const wk = thisWeek(); const wu = units[Math.min(wk, units.length) - 1];
    wrap.appendChild(h("div", { class: "hero" }, h("small", null, "You are here · أنت هنا"), h("h2", null, "Unit " + tgt.unit.n + " · " + tgt.unit.en), h("p", null, "Lesson " + tgt.les.no + " of " + tgt.unit.lessons.length + ": " + tgt.les.en), PTE.ar(tgt.les.ar),
      h("div", { class: "row", style: { marginTop: "10px" } }, h("button", { class: "btn big", type: "button", onclick: () => startLesson(tgt.unit, tgt.les) }, "▶ Start · ابدأ"), h("a", { class: "btn ghost", href: "#/drive/" + tgt.unit.id }, "Open unit · افتح الوحدة")),
      h("label", { class: "row", style: { color: "#fff", marginTop: "8px" } }, h("input", { type: "checkbox", checked: D.auto ? "" : null, onchange: (e) => { S().settings.driveAuto = e.target.checked; D.auto = e.target.checked; PTE.store.save(); } }), h("span", null, "Auto-play the next lesson · تشغيل الدرس التالي تلقائياً"))));
    if (wu && wu.id !== tgt.unit.id) wrap.appendChild(h("div", { class: "card warn" }, h("b", null, "📅 This week's plan says: Unit " + wu.n + " — " + wu.en), PTE.ar("حسب خطة هذا الأسبوع: الوحدة " + wu.n + " — " + wu.ar), h("a", { class: "btn mini", href: "#/drive/" + wu.id }, "Open Unit " + wu.n)));
    PTE.D.phases.forEach((ph) => {
      const us = units.filter((x) => x.phase === ph.n); const tot = us.reduce((a, x) => a + x.lessons.length, 0), dn = us.reduce((a, x) => a + unitDone(x), 0);
      wrap.appendChild(h("div", { class: "phasehead" }, h("div", null, h("b", null, "Phase " + ph.n + " · " + ph.en), h("div", { class: "ar", dir: "rtl" }, ph.ar)), h("small", null, "Units " + us[0].n + "–" + us[us.length - 1].n + " · " + dn + "/" + tot)));
      wrap.appendChild(h("div", { class: "unitgrid" }, us.map((u) => { const d = unitDone(u); const full = d === u.lessons.length;
        return h("a", { class: "unitcard p" + u.phase + (full ? " full" : "") + (u.n === wk ? " week" : "") + (u.id === tgt.unit.id ? " here" : ""), href: "#/drive/" + u.id },
          h("span", { class: "un" }, full ? "✓" : String(u.n)), h("b", null, u.en), h("span", { class: "ar", dir: "rtl" }, u.ar), h("small", null, d + " / " + u.lessons.length + (u.n === wk ? " · 📅 this week" : u.id === tgt.unit.id ? " · 📍 you are here" : "")), PTE.bar((100 * d) / u.lessons.length)); })));
    });
    const ar = PTE.tts.has("ar");
    wrap.appendChild(h("div", { class: "card tint", style: { marginTop: "16px" } }, h("h3", null, "Every unit has the same 9 lessons · كل وحدة بنفس الـ٩ دروس"),
      h("ol", null, PTE.LESSON_ROLES.map((r) => h("li", null, r[1] + " " + r[2] + " — ", h("span", { class: "ar", dir: "rtl", style: { display: "inline" } }, r[3])))),
      h("p", null, "Lessons play by themselves: English → Arabic → beep → you repeat out loud. A ✓ appears when a lesson ends and the next one starts on its own (switchable). Words you hear join your spaced-repetition schedule."),
      PTE.ar("كل وحدة فيها نفس الدروس بنفس الترتيب فلن تتوه. الدرس يعمل تلقائياً وينتقل للتالي وحده، وتظهر علامة ✓ عند الانتهاء."),
      !ar ? h("p", { class: "bad-t" }, "⚠ No Arabic voice found on this device: Arabic parts may be silent. Install an Arabic voice in your phone's text-to-speech settings (Google Text-to-Speech).") : null));
    const mins = h("div", { class: "row" }, [5, 10, 20, 30].map((m) => h("button", { class: "btn mini ghost", type: "button", onclick: () => { D.minutes = m; mins.querySelectorAll("button").forEach((x) => x.classList.add("ghost")); mins.children[[5, 10, 20, 30].indexOf(m)].classList.remove("ghost"); } }, m + " min")));
    wrap.appendChild(h("details", { class: "card" }, h("summary", null, h("b", null, "🚗 Quick random mixes · ميكس سريع (خارج الرحلة)")), mins,
      h("div", { class: "lines", style: { marginTop: "10px" } }, LINES.map((l) => h("button", { class: "line-card", type: "button", onclick: () => start(l, D.minutes) }, h("b", null, l.icon + " " + l.en), h("span", { class: "ar", dir: "rtl" }, l.ar), h("small", null, l.desc)))),
      h("label", { class: "row", style: { marginTop: "10px" } }, h("input", { type: "checkbox", onchange: (e) => { D.voiceCmd = e.target.checked; } }), h("span", null, "Voice commands (beta): say “next”, “pause”, “repeat”, “back” — best with a headset."))));
    wrap.appendChild(h("div", { class: "card danger" }, h("b", null, "📱 If your screen still turns off · لو الشاشة لسه بتقفل"),
      h("ol", null, h("li", null, "Press Start from inside the page (Chrome on Android / Safari on iPhone)."), h("li", null, "Android: Settings → Display → Screen timeout → 10 minutes or more; turn OFF Battery saver."), h("li", null, "iPhone: Settings → Display & Brightness → Auto-Lock → 5 minutes or Never; Low Power Mode OFF."), h("li", null, "Plug in the charger and look for “🔆 Screen kept awake” at the top of the lesson screen.")),
      PTE.ar("ارفع مهلة إطفاء الشاشة إلى ١٠ دقائق أو أكثر، وأغلق وضع توفير البطارية، ووصّل الشاحن، وابحث عن عبارة «الشاشة لن تنطفئ» أعلى شاشة الدرس.")));
    return wrap;
  };
})();

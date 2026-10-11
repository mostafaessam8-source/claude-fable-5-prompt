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
  const D = { list: [], i: 0, token: 0, running: false, startedAt: 0, lineId: null, minutes: 10, rateMul: 1, wake: null, voiceCmd: false, recog: null };
  let overlay = null, audioKeep = null;

  const SILENT = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAABErAAABAAgAZGF0YQAAAAA=";
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
        if ("wakeLock" in navigator) navigator.wakeLock.request("screen").then((l) => (D.wake = l)).catch(() => {});
      } else {
        audioKeep && audioKeep.pause();
        if (D.wake) { D.wake.release().catch(() => {}); D.wake = null; }
        if ("mediaSession" in navigator) { ["play", "pause", "nexttrack", "previoustrack", "seekforward", "seekbackward"].forEach((a) => { try { navigator.mediaSession.setActionHandler(a, null); } catch (e) { /* ok */ } }); }
      }
    } catch (e) { /* ignore */ }
  }
  document.addEventListener("visibilitychange", () => { if (D.running && document.visibilityState === "visible" && "wakeLock" in navigator && !D.wake) navigator.wakeLock.request("screen").then((l) => (D.wake = l)).catch(() => {}); });

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
    PTE.addMinutes(mins); PTE.addXP(20 + mins * 2, "Drive lesson"); PTE.completeTask("drive", 20); PTE.fireworks();
    if (overlay) { const now = overlay.querySelector(".now"); now.querySelector(".lbl").textContent = "ARRIVED · وصلنا"; now.querySelector(".en").textContent = "Lesson complete 🎉 " + mins + " min"; now.querySelector(".ar").textContent = "أحسنت يا كابتن"; }
    PTE.say("Lesson complete. Well done, Captain.", "en");
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
      h("div", { class: "dtop" }, h("div", null, h("b", null, line.icon + " " + line.en), h("div", { style: { color: "#C8C9C7", fontSize: ".85rem" } }, "Eyes on the road · العين على الطريق")),
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

  function start(line, minutes) {
    G = 0; D.list = line.build(minutes); D.i = 0; D.lineId = line.id; D.startedAt = Date.now(); D.rateMul = 1;
    if (!D.list.length) { PTE.toast("No content for this line yet"); return; }
    openOverlay(line); if (D.voiceCmd) voiceCommands(true);
    runFrom(0);
  }

  /* ---------- page ---------- */
  PTE.views.drive = function () {
    const wrap = h("div"); let minutes = D.minutes; const noTTS = !("speechSynthesis" in window);
    wrap.appendChild(PTE.pageHead("Drive Mode 🚆", "وضع القيادة", "Hands-free audio lessons while you drive or commute. / دروس صوتية بدون لمس الشاشة أثناء القيادة."));
    wrap.appendChild(h("div", { class: "safety" }, "🛑 SAFETY FIRST · السلامة أولاً: choose the lesson and press Start while PARKED, then put the phone away. Never touch or look at the screen while the vehicle is moving. Obey traffic laws. اختر الدرس وأنت متوقف ثم ضع الهاتف جانباً."));
    if (noTTS) wrap.appendChild(h("div", { class: "card danger" }, "This browser has no speech synthesis. Use Chrome on Android or Safari on iPhone."));
    const ar = PTE.tts.has("ar");
    wrap.appendChild(h("div", { class: "card tint" }, h("h3", null, "How it works · كيف يعمل"),
      h("ul", null, h("li", null, "Lessons are spoken automatically: English words, then Arabic meaning, then a beep — you REPEAT out loud."), h("li", null, "Big ⏮ ⏯ ⏭ buttons, plus your headset / steering-wheel media buttons (next, previous, play/pause)."), h("li", null, "🌙 Black-screen mode keeps the phone awake with a dark screen. Plug the phone into the car charger."), h("li", null, "Words you hear are added to your spaced-repetition schedule automatically.")),
      PTE.ar("الدرس يتكلم تلقائياً: كلمة إنجليزية ثم معناها بالعربي ثم صفارة، وأنت تكرر بصوت عالٍ. استخدم أزرار السماعة أو الدركسيون للتالي والسابق والإيقاف. وضع الشاشة السوداء يبقي الهاتف صاحياً."),
      !ar ? h("p", { class: "bad-t" }, "⚠ No Arabic voice found on this device: Arabic parts may be silent or read with an English voice. Install an Arabic voice in your phone's text-to-speech settings (Google Text-to-Speech), or Arabic will appear as text only.") : null));
    const mins = h("div", { class: "row" }, [5, 10, 20, 30].map((m) => { const b = h("button", { class: "btn" + (m === minutes ? "" : " ghost"), type: "button", onclick: () => { minutes = D.minutes = m; mins.querySelectorAll("button").forEach((x) => x.classList.add("ghost")); b.classList.remove("ghost"); } }, m + " min"); return b; }));
    wrap.appendChild(h("div", { class: "card" }, h("b", null, "Length · المدة"), mins,
      h("label", { class: "row", style: { marginTop: "10px" } }, h("input", { type: "checkbox", onchange: (e) => { D.voiceCmd = e.target.checked; } }), h("span", null, "Voice commands (beta): say “next”, “pause”, “repeat”, “back”. Works best with a headset. · أوامر صوتية تجريبية"))));
    wrap.appendChild(h("div", { class: "lines" }, LINES.map((l) => h("button", { class: "line-card", type: "button", onclick: () => start(l, minutes) }, h("b", null, l.icon + " " + l.en), h("span", { class: "ar", dir: "rtl" }, l.ar), h("small", null, l.desc)))));
    wrap.appendChild(h("div", { class: "card warn", style: { marginTop: "16px" } }, h("b", null, "ℹ️ Good to know"), h("p", null, "Speech uses your phone’s own text-to-speech voices; they keep playing with the screen on or black. Some phones stop speech if you lock the screen or switch apps — keep the page open. Install the site to your home screen (Chrome menu → Add to Home screen) for best results."),
      PTE.ar("الصوت يعتمد على أصوات هاتفك. بعض الهواتف توقف الصوت عند قفل الشاشة أو تبديل التطبيق، لذلك استخدم وضع الشاشة السوداء وأبقِ الصفحة مفتوحة، وثبّت الموقع على الشاشة الرئيسية.")));
    return wrap;
  };
})();

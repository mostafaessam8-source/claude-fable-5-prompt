/* Speaking, Listening, Writing practice (task banks) + shared helpers */
(function () {
  "use strict";
  const PTE = window.PTE, h = PTE.h, S = () => PTE.store.get();
  const BS = () => PTE.D.bankSpeaking || {}, BL = () => PTE.D.bankLW || {}, ST = () => PTE.D.strategies || {};

  /* ---------- rotation: unseen items first ---------- */
  PTE.nextItem = function (key, arr) {
    if (!arr || !arr.length) return null;
    const seen = (S().seen[key] = S().seen[key] || []);
    let pool = arr.filter((x) => seen.indexOf(x.id) < 0);
    if (!pool.length) { S().seen[key] = []; pool = arr; }
    const it = pool[Math.floor(Math.random() * pool.length)];
    S().seen[key].push(it.id); PTE.store.save();
    return it;
  };
  /* treat UK/US spelling variants (analyse/analyze, centre/center, colour/color, travelling/traveling) as equal */
  const canon = (w) => w.replace(/is(e|ed|es|ing|ation|ations)$/, "iz$1").replace(/yse(d|s)?$/, "yze$1").replace(/our(s|ed|ing)?$/, "or$1").replace(/tre(s)?$/, "ter$1").replace(/ll(ed|ing|er)$/, "l$1").replace(/ogue$/, "og");
  const wordsOf = (t) => PTE.norm(t).split(" ").filter(Boolean).map(canon);
  PTE.countWords = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);

  /* LCS word diff: returns {tokens:[{w,ok}], pct} for target vs spoken text */
  PTE.diffWords = function (target, spoken) {
    const a = wordsOf(target), b = wordsOf(spoken); const n = a.length, m = b.length;
    const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const ok = new Array(n).fill(false); let i = 0, j = 0;
    while (i < n && j < m) { if (a[i] === b[j]) { ok[i] = true; i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++; }
    const hit = ok.filter(Boolean).length;
    return { tokens: a.map((w, k) => ({ w, ok: ok[k] })), pct: n ? Math.round((100 * hit) / n) : 0, hit, total: n };
  };
  PTE.diffEl = (d) => h("p", { class: "diff passage" }, d.tokens.map((t) => h("span", { class: t.ok ? "ok" : "miss" }, t.w + " ")));

  /* ---------- recorder + speech recognition ---------- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  PTE.canRecord = !!(navigator.mediaDevices && window.MediaRecorder);
  PTE.canRecognize = !!SR;
  PTE.prepAndRecord = function (o) {
    const box = h("div", { class: "card stack", style: { textAlign: "center" } });
    let stream = null, rec = null, chunks = [], recog = null, transcript = "", timer = null, stopped = false;
    const clock = h("div", { class: "timer" }), label = h("div", { class: "lbl" });
    const btn = h("button", { class: "mic", type: "button" }, "🎙️"); const skip = h("button", { class: "btn ghost mini", type: "button" }, "Skip prep ⏭");
    box.appendChild(label); box.appendChild(clock); box.appendChild(h("div", { class: "row", style: { justifyContent: "center" } }, btn, skip));
    const tick = (secs, cb, low) => { let s = secs; clock.textContent = s; clock.classList.remove("low"); clearInterval(timer); timer = setInterval(() => { s--; clock.textContent = s; if (s <= (low || 5)) clock.classList.add("low"); if (s <= 0) { clearInterval(timer); cb(); } }, 1000); };
    PTE.onLeave = () => { clearInterval(timer); try { if (rec && rec.state !== "inactive") rec.stop(); } catch (e) { /* ok */ } if (stream) stream.getTracks().forEach((t) => t.stop()); try { recog && recog.stop(); } catch (e) { /* ok */ } };
    const finish = () => {
      if (stopped) return; stopped = true; clearInterval(timer); btn.classList.remove("rec"); btn.disabled = true; skip.remove();
      label.textContent = "✔ Recorded"; clock.textContent = "";
      try { recog && recog.stop(); } catch (e) { /* ok */ }
      const done = (url) => { if (stream) stream.getTracks().forEach((t) => t.stop()); setTimeout(() => o.onDone({ url, transcript: transcript.trim() }), 250); };
      if (rec && rec.state !== "inactive") { rec.onstop = () => done(chunks.length ? URL.createObjectURL(new Blob(chunks, { type: rec.mimeType || "audio/webm" })) : null); rec.stop(); } else done(null);
    };
    const startRec = async () => {
      PTE.beep(880, 220);
      label.textContent = "🔴 SPEAK NOW · تكلم الآن"; btn.classList.add("rec"); btn.textContent = "⏹"; btn.onclick = finish;
      try {
        if (PTE.canRecord) { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); rec = new MediaRecorder(stream); rec.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data); rec.start(); }
        if (SR) { recog = new SR(); recog.lang = "en-GB"; recog.continuous = true; recog.interimResults = false; recog.onresult = (e) => { for (let i = e.resultIndex; i < e.results.length; i++) transcript += e.results[i][0].transcript + " "; }; recog.onend = () => { if (!stopped) { try { recog.start(); } catch (e) { /* ok */ } } }; try { recog.start(); } catch (e) { /* ok */ } }
      } catch (e) { label.textContent = "🎙️ Microphone unavailable — speak aloud anyway, then self-check · الميكروفون غير متاح"; }
      tick(o.rec, finish, 5);
    };
    const startPrep = () => {
      if (!o.prep) return startRec();
      label.textContent = (o.prepLabel || "Prepare") + " · استعد"; btn.textContent = "🎙️"; btn.onclick = () => { clearInterval(timer); startRec(); };
      skip.onclick = () => { clearInterval(timer); startRec(); };
      tick(o.prep, startRec, 3);
    };
    label.textContent = "Tap 🎙️ to begin · اضغط للبدء"; btn.onclick = startPrep; skip.style.display = "none";
    const origStart = startPrep; btn.onclick = () => { skip.style.display = ""; origStart(); };
    if (o.autoStart) setTimeout(() => btn.onclick(), 300);
    return box;
  };

  PTE.rubric = function (items, onSubmit, title) {
    const checks = [];
    const box = h("div", { class: "card tint stack" }, h("b", null, title || "Self-check · قيّم نفسك بصدق"));
    items.forEach((t) => { const c = h("input", { type: "checkbox" }); checks.push(c); box.appendChild(h("label", { class: "row" }, c, h("span", null, t))); });
    box.appendChild(h("button", { class: "btn", onclick: (e) => { const n = checks.filter((c) => c.checked).length; e.target.disabled = true; onSubmit(Math.round((100 * n) / items.length)); } }, "Save & continue"));
    return box;
  };

  function playback(url) { return url ? h("audio", { controls: "", src: url, style: { width: "100%" } }) : h("small", null, "No recording available on this device."); }

  /* ---------- session helper ---------- */
  function session(o) {
    const box = h("div"); let n = 0, sum = 0;
    const show = () => {
      PTE.clear(box);
      if (n >= o.count) {
        const avg = Math.round(sum / o.count); PTE.addScore(o.key, avg, 100); PTE.addXP(o.xp || 25, o.title + " session"); PTE.addMinutes(o.min || 10);
        PTE.completeTask(o.taskId || o.key, 20); if (avg >= 70) PTE.fireworks();
        box.appendChild(h("div", { class: "card accent" }, h("h2", null, "Session complete 🎉 · أحسنت"), h("p", null, "Self/auto score: " + avg + "%"), PTE.bar(avg),
          h("div", { class: "row" }, h("button", { class: "btn", onclick: () => { n = 0; sum = 0; show(); } }, "🔁 Another round"), h("a", { class: "btn ghost", href: o.back }, "Back"))));
        return;
      }
      box.appendChild(h("div", { class: "row between" }, h("b", null, o.title), h("span", null, (n + 1) + " / " + o.count)));
      box.appendChild(PTE.bar((100 * n) / o.count));
      const item = PTE.nextItem(o.key, o.bank());
      if (!item) { box.appendChild(h("div", { class: "card" }, "Content for this task is not available yet.")); return; }
      const holder = h("div");
      box.appendChild(holder);
      holder.appendChild(o.render(item, (pct) => {
        sum += pct; n++;
        holder.appendChild(h("div", { class: "row", style: { marginTop: "12px" } }, h("button", { class: "btn big", onclick: show }, n >= o.count ? "Finish ✓" : "Next ➜ التالي")));
        holder.lastChild.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }));
    };
    show();
    return box;
  }
  PTE.session = session;

  /* ---------- hub ---------- */
  function hub(title, ar, sub, defs) {
    const wrap = h("div"); wrap.appendChild(PTE.pageHead(title, ar, sub));
    wrap.appendChild(h("div", { class: "lines" }, defs.map((d) => {
      const a = PTE.avgScore(d.key); const cnt = d.count ? d.count() : 0;
      return h("a", { class: "line-card", href: d.href }, h("b", null, d.icon + " " + d.en), h("span", { class: "ar", dir: "rtl" }, d.ar), h("small", null, cnt + " items" + (a !== null ? " · avg " + a + "%" : "")), a !== null ? PTE.bar(a) : null);
    })));
    wrap.appendChild(h("div", { class: "card tint", style: { marginTop: "16px" } }, h("b", null, "💡 Not sure how a task works? "), h("a", { href: "#/strategies" }, "Open the Strategy guide · دليل الاستراتيجيات")));
    return wrap;
  }
  const cnt = (f) => () => (f() || []).length;

  function strategyBox(id) {
    const t = ((ST().tasks) || []).find((x) => x.id === id); if (!t) return null;
    return h("details", { class: "card tint" }, h("summary", null, h("b", null, "🧭 How to score on " + t.name + " · " + t.nameAr)),
      h("p", null, t.what), PTE.ar(t.whatAr), h("p", null, h("b", null, "Scoring: "), t.scoring),
      h("ol", null, (t.steps || []).map((s) => h("li", null, s))), t.template ? h("pre", null, t.template) : null,
      h("ul", null, (t.tips || []).map((s) => h("li", null, s))), h("a", { href: "#/strategies/" + id }, "Full strategy →"));
  }

  /* =============== SPEAKING =============== */
  PTE.views.speaking = function (p) {
    const t = p[0];
    if (!t) return hub("Speaking Station", "محطة المحادثة", "These tasks use your microphone. Recordings stay on your device. / التسجيلات تبقى على جهازك فقط.", [
      { href: "#/speaking/ra", key: "ra", icon: "📖", en: "Read Aloud", ar: "القراءة بصوت عالٍ", count: cnt(() => BS().ra) },
      { href: "#/speaking/rs", key: "rs", icon: "🔁", en: "Repeat Sentence", ar: "إعادة الجملة", count: cnt(() => BS().rs) },
      { href: "#/speaking/di", key: "di", icon: "📊", en: "Describe Image", ar: "وصف الصورة", count: cnt(() => BS().di) },
      { href: "#/speaking/rl", key: "rl", icon: "🎤", en: "Re-tell Lecture", ar: "إعادة المحاضرة", count: cnt(() => BS().rl) },
      { href: "#/speaking/asq", key: "asq", icon: "❓", en: "Answer Short Question", ar: "أسئلة قصيرة", count: cnt(() => BS().asq) }]);
    const wrap = h("div"); wrap.appendChild(PTE.back("#/speaking", "Speaking"));
    if (t === "ra") {
      wrap.appendChild(PTE.pageHead("Read Aloud", "القراءة بصوت عالٍ", "30–40 s prep, then read naturally. Never stop or restart. / لا تتوقف ولا تعد من البداية."));
      wrap.appendChild(strategyBox("ra"));
      wrap.appendChild(session({ key: "ra", title: "Read Aloud", count: 4, bank: () => BS().ra, back: "#/speaking", xp: 30, min: 12, render: (it, complete) => {
        const box = h("div", { class: "stack" }); const words = PTE.countWords(it.text);
        box.appendChild(h("p", { class: "passage" }, it.text)); box.appendChild(h("div", { class: "row" }, PTE.speakBtn(it.text, "en", "Model voice"), h("small", null, words + " words · topic: " + (it.topic || ""))));
        box.appendChild(PTE.prepAndRecord({ prep: 25, rec: Math.min(50, Math.max(25, Math.round(words * 0.6))), prepLabel: "Read silently & mark pauses", onDone: (r) => {
          box.appendChild(playback(r.url));
          let auto = null; if (r.transcript) { auto = PTE.diffWords(it.text, r.transcript); box.appendChild(h("p", null, "Auto-check (beta): " + auto.pct + "% of words recognised")); box.appendChild(PTE.diffEl(auto)); }
          box.appendChild(PTE.rubric(["I started within 3 seconds · بدأت بسرعة", "No long pauses or restarts · بدون توقف أو إعادة", "Paused at commas/sense groups · وقفت عند الفواصل", "Stressed the content words · نبرت الكلمات المهمة", "Pronounced word endings (-ed, -s) · نطقت النهايات", "Finished with a falling tone · أنهيت بنغمة هابطة"], (pct) => complete(auto ? Math.round((pct + auto.pct) / 2) : pct)));
        } }));
        return box;
      } }));
    } else if (t === "rs") {
      wrap.appendChild(PTE.pageHead("Repeat Sentence", "إعادة الجملة", "Listen once, then repeat. Keep the rhythm; don't translate. / استمع مرة واحدة ثم أعد."));
      wrap.appendChild(strategyBox("rs"));
      wrap.appendChild(session({ key: "rs", title: "Repeat Sentence", count: 8, bank: () => BS().rs, back: "#/speaking", xp: 30, min: 10, render: (it, complete) => {
        const box = h("div", { class: "stack" }); const msg = h("div", { class: "card tint" }, "🔊 Listening… · استمع");
        box.appendChild(msg);
        const recWrap = h("div");
        const startRec = () => { msg.textContent = "Now repeat exactly · الآن كررها"; PTE.clear(recWrap); recWrap.appendChild(PTE.prepAndRecord({ prep: 0, rec: 12, autoStart: true, onDone: (r) => {
          box.appendChild(playback(r.url)); box.appendChild(h("p", { class: "passage" }, it.text)); box.appendChild(PTE.speakBtn(it.text, "en", "Replay model"));
          let auto = null; if (r.transcript) { auto = PTE.diffWords(it.text, r.transcript); box.appendChild(h("p", null, "Auto-check (beta): " + auto.pct + "%")); box.appendChild(PTE.diffEl(auto)); }
          box.appendChild(PTE.rubric(["I repeated every word in order · كل الكلمات بالترتيب", "I kept the rhythm and stress · الإيقاع والنبر", "I did not stop in the middle · لم أتوقف"], (pct) => complete(auto ? Math.round((pct + auto.pct) / 2) : pct)));
        } })); };
        box.appendChild(recWrap);
        setTimeout(() => PTE.tts.speak(it.text, { lang: "en", rate: 0.95 }).then((ok) => ok && startRec()), 400);
        box.appendChild(h("button", { class: "btn ghost mini", onclick: () => { PTE.tts.cancel(); startRec(); } }, "Skip audio"));
        return box;
      } }));
    } else if (t === "di") {
      wrap.appendChild(PTE.pageHead("Describe Image", "وصف الصورة", "25 s prep · 40 s speaking. Intro → key points → conclusion. / مقدمة ثم نقاط ثم خاتمة."));
      wrap.appendChild(strategyBox("di"));
      wrap.appendChild(session({ key: "di", title: "Describe Image", count: 4, bank: () => BS().di, back: "#/speaking", xp: 35, min: 12, render: (it, complete) => {
        const box = h("div", { class: "stack" }); box.appendChild(PTE.chartEl(it));
        box.appendChild(PTE.prepAndRecord({ prep: 25, rec: 40, prepLabel: "Find the highest, lowest & trend", onDone: (r) => {
          box.appendChild(playback(r.url));
          box.appendChild(h("div", { class: "card tint" }, h("b", null, "Model answer · نموذج"), h("p", null, it.model), h("div", { class: "row" }, PTE.speakBtn(it.model, "en")), it.vocab ? PTE.chips(it.vocab) : null, it.ar ? PTE.ar(it.ar) : null));
          let hit = null; if (r.transcript && it.points) { const sp = PTE.norm(r.transcript); const nums = (it.model.match(/\d+(\.\d+)?/g) || []); const found = nums.filter((x) => sp.indexOf(x) >= 0).length; hit = nums.length ? Math.round(100 * found / nums.length) : null; if (hit !== null) box.appendChild(h("p", null, "Numbers you mentioned (beta): " + found + "/" + nums.length)); }
          box.appendChild(PTE.rubric(["Introduced the chart title/topic · قدمت الموضوع", "Mentioned the highest and lowest values · الأعلى والأدنى", "Described a trend or comparison · اتجاه أو مقارنة", "Gave a concluding sentence · جملة ختامية", "Spoke for at least 35 seconds without long stops · ٣٥ ثانية بدون توقف طويل", "Used 2+ trend words (rose, fell, peaked) · كلمات الاتجاه"], (pct) => complete(hit === null ? pct : Math.round((pct * 2 + hit) / 3))));
        } }));
        return box;
      } }));
    } else if (t === "rl") {
      wrap.appendChild(PTE.pageHead("Re-tell Lecture", "إعادة المحاضرة", "Listen once, take notes (nouns, numbers, arrows), then retell in 40 s. / سجل كلمات مفتاحية ثم أعد."));
      wrap.appendChild(strategyBox("rl"));
      wrap.appendChild(session({ key: "rl", title: "Re-tell Lecture", count: 2, bank: () => BS().rl, back: "#/speaking", xp: 35, min: 10, render: (it, complete) => {
        const box = h("div", { class: "stack" }); const status = h("div", { class: "card tint" }, h("button", { class: "btn big", onclick: () => { status.textContent = "🔊 Listening — take notes · استمع ودوّن"; PTE.tts.speak(it.transcript, { lang: "en", rate: 0.95 }).then((ok) => ok && go()); } }, "▶ Play lecture (once)"));
        const notes = h("textarea", { placeholder: "Notes… ملاحظاتك (كلمات مفتاحية فقط)", style: { minHeight: "110px" } });
        const slot = h("div");
        const go = () => { status.textContent = "Now retell in 40 seconds · أعد الكلام الآن"; slot.appendChild(PTE.prepAndRecord({ prep: 10, rec: 40, prepLabel: "Organise notes", onDone: (r) => {
          slot.appendChild(playback(r.url));
          const kws = it.keywords || []; let said = null;
          if (r.transcript) { const sp = PTE.norm(r.transcript); const f = kws.filter((k) => sp.indexOf(PTE.norm(k)) >= 0); said = Math.round(100 * f.length / Math.max(1, kws.length)); slot.appendChild(h("p", null, "Keywords recognised (beta): " + f.length + "/" + kws.length)); }
          slot.appendChild(h("div", { class: "card tint" }, h("b", null, "Transcript"), h("p", null, it.transcript), h("b", null, "Keywords: "), PTE.chips(kws), h("b", null, "Model retell"), h("p", null, it.model), PTE.speakBtn(it.model, "en"), it.notes ? h("small", null, "Notes example: " + it.notes) : null, it.ar ? PTE.ar(it.ar) : null));
          slot.appendChild(PTE.rubric(["Covered the main topic · الفكرة الرئيسية", "Mentioned 3+ key words from the lecture · ٣ كلمات مفتاحية", "Used linking (firstly, however, as a result) · أدوات ربط", "Continuous speech, few hesitations · طلاقة", "Clear pronunciation · نطق واضح"], (pct) => complete(said === null ? pct : Math.round((pct + said) / 2))));
        } })); };
        box.appendChild(status); box.appendChild(notes); box.appendChild(slot);
        return box;
      } }));
    } else if (t === "asq") {
      wrap.appendChild(PTE.pageHead("Answer Short Question", "الإجابة القصيرة", "One or a few words. Answer fast — do not explain. / كلمة أو كلمتان فقط."));
      wrap.appendChild(strategyBox("asq"));
      const holder = h("div"); wrap.appendChild(holder);
      const mk = () => { const items = PTE.pick(BS().asq || [], 10); return PTE.rounds({ key: "asq", title: "Short questions", items, back: "#/speaking", taskId: "asq", xp: 4, again: () => { PTE.clear(holder); holder.appendChild(mk()); }, render: (it, i, done) => {
        const box = h("div", { class: "card stack" }); const btn = h("button", { class: "btn big", onclick: () => PTE.say(it.q, "en", 0.95) }, "🔊 Play question"); setTimeout(() => PTE.say(it.q, "en", 0.95), 300);
        const inp = h("input", { type: "text", placeholder: "Type or say your answer, then check…", autocomplete: "off" });
        box.appendChild(btn); box.appendChild(inp);
        const out = h("div"); box.appendChild(h("button", { class: "btn", onclick: (e) => { e.target.disabled = true; const ans = [it.a].concat(it.alt || []).map(PTE.norm); const ok = ans.some((a) => a && PTE.norm(inp.value).split(" ").concat([PTE.norm(inp.value)]).indexOf(a) >= 0); box.appendChild(h("p", { class: ok ? "good-t" : "bad-t" }, (ok ? "✓ " : "✗ ") + "Answer: " + it.a + "   (" + it.q + ")")); if (!ok) PTE.logError({ task: "asq", q: it.q, a: it.a }); ok ? PTE.ding() : PTE.buzz(); done(ok); } }, "Check")); box.appendChild(out);
        box.appendChild(h("small", null, "Tip: say it aloud first, then type to check. · انطقها بصوت عالٍ أولاً."));
        return box; } }); };
      holder.appendChild(mk());
    }
    return wrap;
  };

  /* =============== LISTENING =============== */
  PTE.views.listening = function (p) {
    const t = p[0];
    if (!t) return hub("Listening Station", "محطة الاستماع", "Audio is read by your device voice. Listen once like in the real test. / الصوت يُقرأ بصوت الجهاز.", [
      { href: "#/listening/wfd", key: "wfd", icon: "✍️", en: "Write From Dictation", ar: "الإملاء", count: cnt(() => BL().wfd) },
      { href: "#/listening/sst", key: "sst", icon: "🎧", en: "Summarize Spoken Text", ar: "تلخيص المسموع", count: cnt(() => BL().sst) },
      { href: "#/listening/hcs", key: "hcs", icon: "🎯", en: "Highlight Correct Summary", ar: "اختيار الملخص", count: cnt(() => BL().hcs) },
      { href: "#/listening/smw", key: "smw", icon: "❔", en: "Select Missing Word", ar: "الكلمة الناقصة", count: cnt(() => BL().smw) },
      { href: "#/listening/mcl", key: "mcl", icon: "☑️", en: "Multiple Choice (Listening)", ar: "اختيار من متعدد", count: cnt(() => BL().mcl) },
      { href: "#/listening/fibl", key: "fibl", icon: "🧩", en: "Fill in the Blanks (Listening)", ar: "ملء الفراغات", count: cnt(() => BL().fibL) }]);
    const wrap = h("div"); wrap.appendChild(PTE.back("#/listening", "Listening"));
    const playOnce = (text, label, after) => {
      let used = false; const b = h("button", { class: "btn big", onclick: () => { if (used) return; used = true; b.disabled = true; b.textContent = "🔊 Playing…"; PTE.tts.speak(text, { lang: "en", rate: 0.95 }).then((ok) => { b.textContent = "✔ Played once"; after && ok && after(); }); } }, label || "▶ Play (once)");
      return b;
    };
    if (t === "wfd") {
      wrap.appendChild(PTE.pageHead("Write From Dictation", "الإملاء", "Type exactly what you hear. Every correct word = 1 point; spelling counts. / كل كلمة صحيحة = نقطة."));
      wrap.appendChild(strategyBox("wfd"));
      wrap.appendChild(session({ key: "wfd", title: "Write From Dictation", count: 8, bank: () => BL().wfd, back: "#/listening", xp: 30, min: 10, render: (it, complete) => {
        const box = h("div", { class: "card stack" }); let plays = 0;
        const play = h("button", { class: "btn big", onclick: () => { if (plays >= 2) return; plays++; PTE.say(it.text, "en", 0.92); play.textContent = plays >= 2 ? "🔊 No more replays" : "🔊 Replay (1 left)"; if (plays >= 2) play.disabled = true; } }, "🔊 Play");
        const inp = h("input", { type: "text", autocomplete: "off", autocapitalize: "off", spellcheck: "false", placeholder: "Type the sentence…" });
        const go = () => { inp.disabled = true; const d = PTE.diffWords(it.text, inp.value); box.appendChild(h("p", { class: d.pct >= 80 ? "good-t" : "bad-t" }, d.hit + " / " + d.total + " words")); box.appendChild(h("div", { class: "passage" }, it.text)); box.appendChild(PTE.diffEl(d)); if (d.pct < 100) PTE.logError({ task: "wfd", q: inp.value, a: it.text }); d.pct >= 80 ? PTE.ding() : PTE.buzz(); chk.disabled = true; complete(d.pct); };
        inp.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
        const chk = h("button", { class: "btn", onclick: go }, "Check");
        box.appendChild(play); box.appendChild(inp); box.appendChild(chk); setTimeout(() => play.click(), 300);
        return box;
      } }));
    } else if (t === "sst") {
      wrap.appendChild(PTE.pageHead("Summarize Spoken Text", "تلخيص المسموع", "50–70 words in 10 minutes. Main idea + 2–3 supporting points. / ٥٠–٧٠ كلمة."));
      wrap.appendChild(strategyBox("sst"));
      wrap.appendChild(session({ key: "sst", title: "Summarize Spoken Text", count: 1, bank: () => BL().sst, back: "#/listening", xp: 40, min: 15, render: (it, complete) => {
        const box = h("div", { class: "stack" }); const area = h("textarea", { placeholder: "Type your summary here (50–70 words)…" }); const cnt = h("div", { class: "timer" }, "0 words");
        area.addEventListener("input", () => { const n = PTE.countWords(area.value); cnt.textContent = n + " words"; cnt.className = "timer" + (n >= 50 && n <= 70 ? "" : " low"); });
        const note = h("textarea", { placeholder: "Notes while listening… ملاحظات", style: { minHeight: "80px" } });
        box.appendChild(h("div", { class: "card tint" }, playOnce(it.transcript, "▶ Play lecture (once)"))); box.appendChild(note); box.appendChild(area); box.appendChild(cnt);
        box.appendChild(h("button", { class: "btn", onclick: (e) => { e.target.disabled = true; const r = PTE.assessText(area.value, { min: 50, max: 70, keys: it.keywords }); box.appendChild(PTE.assessEl(r)); box.appendChild(h("div", { class: "card tint" }, h("b", null, "Transcript"), h("p", null, it.transcript), h("b", null, "Model summary"), h("p", null, it.model), it.ar ? PTE.ar(it.ar) : null)); complete(r.pct); } }, "Check my summary"));
        return box;
      } }));
    } else if (t === "hcs") {
      wrap.appendChild(PTE.pageHead("Highlight Correct Summary", "اختيار الملخص الصحيح", "Choose the summary that matches the whole recording. Beware of extra details. / احذر التفاصيل المضافة."));
      wrap.appendChild(strategyBox("hcs"));
      wrap.appendChild(mcSession("hcs", "Highlight Summary", BL().hcs, 2, (it) => ({ audio: it.transcript, q: "Which summary is best?", options: it.options, answers: [it.answer], why: it.why, whyAr: it.whyAr })));
    } else if (t === "smw") {
      wrap.appendChild(PTE.pageHead("Select Missing Word", "الكلمة الناقصة", "The recording stops before the last word. Choose the best ending. / اختر الكلمة الأنسب."));
      wrap.appendChild(strategyBox("smw"));
      wrap.appendChild(mcSession("smw", "Missing Word", BL().smw, 4, (it) => ({ audio: it.transcript, q: "What is the missing last word?", options: it.options, answers: [it.answer], why: it.why })));
    } else if (t === "mcl") {
      wrap.appendChild(PTE.pageHead("Listening Multiple Choice", "اختيار من متعدد (استماع)", "Single or multiple answers. Wrong picks cost points in multiple-answer items. / الخطأ في الاختيار المتعدد يخصم."));
      wrap.appendChild(mcSession("mcl", "Listening MCQ", BL().mcl, 3, (it) => ({ audio: it.transcript, q: it.q, options: it.options, answers: it.answers, multi: it.multi })));
    } else if (t === "fibl") {
      wrap.appendChild(PTE.pageHead("Fill in the Blanks (Listening)", "ملء الفراغات (استماع)", "Type the missing words as you listen. In the test, the text is shown while the audio plays. / اكتب الكلمات الناقصة."));
      wrap.appendChild(session({ key: "fibl", title: "Listening Fill blanks", count: 2, bank: () => BL().fibL, back: "#/listening", xp: 30, min: 10, render: (it, complete) => {
        const box = h("div", { class: "card stack" }); const inputs = [];
        const para = h("p", { class: "passage" }); it.text.split(/(\{\d+\})/).forEach((seg) => { const m = seg.match(/^\{(\d+)\}$/); if (m) { const inp = h("input", { type: "text", class: "blank", autocomplete: "off", autocapitalize: "off", spellcheck: "false", style: { width: "9ch" } }); inputs.push(inp); para.appendChild(inp); } else para.appendChild(document.createTextNode(seg)); });
        box.appendChild(playOnce(it.transcript, "▶ Play recording (once)")); box.appendChild(para);
        box.appendChild(h("button", { class: "btn", onclick: (e) => { e.target.disabled = true; let ok = 0; inputs.forEach((inp, k) => { const good = PTE.norm(inp.value) === PTE.norm(it.answers[k]); if (good) ok++; inp.style.borderColor = good ? "var(--blue)" : "var(--red)"; if (!good) { inp.after(h("small", { class: "good-t" }, " ✓" + it.answers[k])); PTE.logError({ task: "fibl", q: inp.value, a: it.answers[k] }); } }); complete(Math.round(100 * ok / inputs.length)); } }, "Check"));
        return box;
      } }));
    }
    return wrap;
  };

  /* shared multiple-choice session (audio optional) */
  function mcSession(key, title, bank, count, map) {
    return session({ key, title, count, bank: () => bank, back: "#/listening", xp: 25, min: 8, render: (raw, complete) => {
      const it = map(raw); const box = h("div", { class: "card stack" });
      if (it.audio) { let used = false; const b = h("button", { class: "btn big", onclick: () => { if (used) return; used = true; b.disabled = true; b.textContent = "🔊 Playing…"; PTE.tts.speak(it.audio, { lang: "en", rate: 0.95 }).then(() => { b.textContent = "✔ Played"; }); } }, "▶ Play (once)"); box.appendChild(b); setTimeout(() => b.click(), 300); }
      box.appendChild(h("p", { class: "passage" }, it.q));
      const picked = new Set(); const multi = it.multi || it.answers.length > 1; const wrapC = h("div", { class: "choices" });
      it.options.forEach((o, i) => { const b = h("button", { class: "choice", type: "button", onclick: () => { if (!multi) { finish([i]); } else { picked.has(i) ? picked.delete(i) : picked.add(i); b.classList.toggle("sel"); } } }, o); wrapC.appendChild(b); });
      let finished = false;
      const finish = (sel) => { if (finished) return; finished = true; let good = 0, bad = 0; sel.forEach((x) => (it.answers.indexOf(x) >= 0 ? good++ : bad++)); const pct = Math.max(0, Math.round(100 * (good - bad) / it.answers.length)); [...wrapC.children].forEach((c, i) => { c.classList.remove("sel"); if (it.answers.indexOf(i) >= 0) c.classList.add("good"); else if (sel.indexOf(i) >= 0) c.classList.add("bad"); }); pct === 100 ? PTE.ding() : PTE.buzz(); if (pct < 100) PTE.logError({ task: key, q: it.q, a: it.answers.map((x) => it.options[x]).join(" / ") }); if (it.why || it.whyAr) box.appendChild(h("div", { class: "card tint" }, it.why ? h("p", null, it.why) : null, it.whyAr ? PTE.ar(it.whyAr) : null)); complete(pct); };
      box.appendChild(wrapC);
      if (multi) box.appendChild(h("button", { class: "btn", onclick: () => finish([...picked]) }, "Submit answers"));
      return box;
    } });
  }
  PTE.mcSession = mcSession;

  /* =============== WRITING =============== */
  const LINKERS = ["however", "moreover", "furthermore", "therefore", "consequently", "in addition", "for example", "for instance", "on the other hand", "in conclusion", "to sum up", "as a result", "although", "whereas", "while", "nevertheless", "in contrast", "firstly", "secondly", "finally", "overall", "despite", "because"];
  PTE.assessText = function (text, o) {
    const words = PTE.countWords(text); const low = " " + PTE.norm(text) + " "; const checks = [];
    const add = (ok, en, ar) => checks.push({ ok, en, ar });
    add(words >= o.min && words <= o.max, "Word count " + words + " (target " + o.min + "–" + o.max + ")", "عدد الكلمات المطلوب");
    if (o.oneSentence) { const sents = (text.match(/[.!?](\s|$)/g) || []).length; add(sents <= 1 && /[.!?]\s*$/.test(text.trim()) && /^[A-Z]/.test(text.trim()), "One sentence, starts with a capital, ends with a full stop", "جملة واحدة، حرف كبير في البداية ونقطة في النهاية"); }
    if (o.keys && o.keys.length) { const f = o.keys.filter((k) => low.indexOf(" " + PTE.norm(k).split(" ")[0]) >= 0); add(f.length >= Math.ceil(o.keys.length / 2), "Key ideas covered: " + f.length + "/" + o.keys.length + (f.length < o.keys.length ? " (missing: " + o.keys.filter((k) => f.indexOf(k) < 0).join(", ") + ")" : ""), "تغطية الأفكار الرئيسية"); }
    if (o.paragraphs) { const pc = text.split(/\n\s*\n/).filter((x) => x.trim()).length; add(pc >= 3 && pc <= 5, "Paragraphs: " + pc + " (use 4)", "عدد الفقرات (٤ مثالي)"); }
    if (o.linkers) { const l = LINKERS.filter((x) => low.indexOf(" " + x + " ") >= 0); add(l.length >= o.linkers, "Linking words used: " + l.length + (l.length ? " (" + l.slice(0, 5).join(", ") + ")" : "") + " — aim for " + o.linkers + "+", "أدوات الربط"); }
    const wl = PTE.norm(text).split(" "); const rep = {}; wl.forEach((w) => { if (w.length > 4) rep[w] = (rep[w] || 0) + 1; }); const over = Object.keys(rep).filter((k) => rep[k] >= 5);
    add(over.length === 0, over.length ? "Repeated too often: " + over.slice(0, 3).join(", ") : "No over-repeated words", "تكرار الكلمات");
    add(!/\b(i|u|ur|dont|cant|wont)\b/.test(low.replace(/ i /g, " I ")) || true, "Check spelling & grammar yourself: capitals, plurals, verb endings", "راجع الإملاء والقواعد بنفسك");
    const okN = checks.filter((c) => c.ok).length;
    return { checks, pct: Math.round((100 * okN) / checks.length), words };
  };
  PTE.assessEl = (r) => h("div", { class: "card tint stack" }, h("b", null, "Instant checks · فحص فوري (" + r.pct + "%)"), r.checks.map((c) => h("div", null, h("span", { class: c.ok ? "good-t" : "bad-t" }, c.ok ? "✓ " : "✗ "), c.en, " ", h("small", { dir: "rtl" }, "· " + c.ar))));

  function timerEl(mins) {
    const el = h("div", { class: "timer" }); let s = mins * 60; const tick = () => { el.textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); el.classList.toggle("low", s < 60); if (s > 0) s--; };
    tick(); const id = setInterval(tick, 1000); const prev = PTE.onLeave; PTE.onLeave = () => { clearInterval(id); prev && prev(); }; return el;
  }

  PTE.views.writing = function (p) {
    const t = p[0];
    if (!t) return hub("Writing Station", "محطة الكتابة", "Summaries and essays are checked for length, structure and key ideas. Spelling and grammar need your own review. / نراجع الطول والبنية والأفكار.", [
      { href: "#/writing/swt", key: "swt", icon: "📝", en: "Summarize Written Text", ar: "تلخيص النص (جملة واحدة)", count: cnt(() => BL().swt) },
      { href: "#/writing/essay", key: "essay", icon: "🖋️", en: "Write Essay", ar: "كتابة المقال", count: cnt(() => BL().essay) }]);
    const wrap = h("div"); wrap.appendChild(PTE.back("#/writing", "Writing"));
    if (t === "swt") {
      wrap.appendChild(PTE.pageHead("Summarize Written Text", "تلخيص النص المكتوب", "ONE sentence, 5–75 words, 10 minutes. / جملة واحدة فقط."));
      wrap.appendChild(strategyBox("swt"));
      wrap.appendChild(session({ key: "swt", title: "Summarize Written Text", count: 2, bank: () => BL().swt, back: "#/writing", xp: 35, min: 15, render: (it, complete) => {
        const box = h("div", { class: "stack" }); const area = h("textarea", { placeholder: "One sentence summary…", style: { minHeight: "110px" } }); const cnt = h("div", { class: "timer" }, "0 words");
        area.addEventListener("input", () => { const n = PTE.countWords(area.value); cnt.textContent = n + " words"; cnt.className = "timer" + (n >= 5 && n <= 75 ? "" : " low"); });
        box.appendChild(h("div", { class: "row between" }, h("b", null, it.title), timerEl(10))); box.appendChild(h("p", { class: "passage" }, it.text)); box.appendChild(area); box.appendChild(cnt);
        box.appendChild(h("button", { class: "btn", onclick: (e) => { e.target.disabled = true; const r = PTE.assessText(area.value, { min: 8, max: 75, keys: it.keys, oneSentence: true }); box.appendChild(PTE.assessEl(r)); box.appendChild(h("div", { class: "card tint" }, h("b", null, "Model sentence"), h("p", null, it.model), PTE.speakBtn(it.model, "en"))); complete(r.pct); } }, "Check"));
        return box;
      } }));
    } else if (t === "essay") {
      wrap.appendChild(PTE.pageHead("Write Essay", "كتابة المقال", "200–300 words in 20 minutes. 4 paragraphs: intro, two body, conclusion. / ٢٠٠–٣٠٠ كلمة في ٢٠ دقيقة."));
      wrap.appendChild(strategyBox("essay"));
      wrap.appendChild(session({ key: "essay", title: "Write Essay", count: 1, bank: () => BL().essay, back: "#/writing", xp: 60, min: 25, render: (it, complete) => {
        const box = h("div", { class: "stack" }); const area = h("textarea", { placeholder: "Write your essay (blank line between paragraphs)…", style: { minHeight: "320px" } }); const cnt = h("div", { class: "timer" }, "0 words");
        area.addEventListener("input", () => { const n = PTE.countWords(area.value); cnt.textContent = n + " words"; cnt.className = "timer" + (n >= 200 && n <= 300 ? "" : " low"); });
        box.appendChild(h("div", { class: "row between" }, h("span", { class: "chip" }, it.type), timerEl(20)));
        box.appendChild(h("p", { class: "passage" }, it.prompt));
        if (it.outline) box.appendChild(h("details", { class: "card tint" }, h("summary", null, "💡 Outline help"), h("ul", null, ["intro", "body1", "body2", "conclusion"].map((k) => h("li", null, h("b", null, k + ": "), it.outline[k] || ""))), it.outlineAr ? PTE.ar(it.outlineAr) : null));
        box.appendChild(area); box.appendChild(cnt);
        box.appendChild(h("button", { class: "btn", onclick: (e) => { e.target.disabled = true; const r = PTE.assessText(area.value, { min: 200, max: 300, paragraphs: true, linkers: 4 }); box.appendChild(PTE.assessEl(r)); if (it.model) box.appendChild(h("details", { class: "card tint", open: "" }, h("summary", null, "Model essay"), h("p", { style: { whiteSpace: "pre-line" } }, it.model))); complete(r.pct); } }, "Check my essay"));
        return box;
      } }));
    }
    return wrap;
  };
})();

/* Vocabulary: hub, SRS review, learn new, browse, games */
(function () {
  "use strict";
  const PTE = window.PTE, h = PTE.h, S = () => PTE.store.get();

  /* Generic round runner: items -> render(item, i, next(correct)) ; finishes with score card */
  PTE.rounds = function (opts) {
    const box = h("div"); let i = 0, good = 0; const n = opts.items.length;
    const finish = () => {
      PTE.clear(box);
      const pct = Math.round((100 * good) / n);
      PTE.addScore(opts.key, good, n);
      if (pct >= 80) { PTE.fireworks(); PTE.ding(); }
      PTE.addXP(Math.max(5, good * (opts.xp || 4)), opts.title);
      if (opts.taskId) PTE.completeTask(opts.taskId, 20);
      box.appendChild(h("div", { class: "card accent" }, h("h2", null, pct >= 80 ? "🎉 Excellent! ممتاز" : pct >= 50 ? "👍 Good — keep going" : "💪 Keep practising — you will get there"),
        h("div", { class: "big-word" }, good + " / " + n), PTE.bar(pct, pct < 50 ? "r" : pct < 80 ? "y" : ""),
        h("div", { class: "row", style: { marginTop: "12px" } }, h("button", { class: "btn", onclick: () => opts.again && opts.again() }, "🔁 Again"), h("a", { class: "btn ghost", href: opts.back || "#/home" }, "Back"))));
    };
    const show = () => {
      if (i >= n) return finish();
      PTE.clear(box);
      box.appendChild(h("div", { class: "row between" }, h("b", null, opts.title), h("span", null, (i + 1) + " / " + n)));
      box.appendChild(PTE.bar((100 * i) / n));
      const done = (ok) => { if (ok) good++; i++; setTimeout(show, ok ? 650 : 1500); };
      box.appendChild(opts.render(opts.items[i], i, done));
    };
    show();
    return box;
  };

  const topics = () => Array.from(new Set(PTE.srs.allWords().map((w) => w.topic))).sort();
  function wordCard(w, showAll) {
    return h("div", { class: "stack" },
      h("div", { class: "row between" }, h("div", null, h("span", { class: "big-word" }, w.en), " ", h("small", null, w.pos + " · " + w.level)), PTE.speakBtn(w.en, "en")),
      showAll ? h("div", { class: "stack" },
        PTE.ar(w.ar, "big-ar"),
        h("p", null, h("i", null, w.ex), " ", PTE.speakBtn(w.ex, "en")),
        PTE.ar(w.exAr),
        w.forms ? h("p", null, h("b", null, "Word family: "), w.forms) : null,
        w.tip ? h("div", { class: "card warn" }, PTE.ar(w.tip)) : null) : null);
  }

  PTE.views.vocab = function (p, q) {
    const sub = p[0];
    if (sub === "review") return review(false);
    if (sub === "learn") return review(true);
    if (sub === "browse") return browse(q);
    if (sub === "games") return games(p[1]);
    const c = PTE.srs.counts(); const wrap = h("div");
    wrap.appendChild(PTE.pageHead("Vocabulary Station", "محطة المفردات", c.total + " academic words with Arabic meaning, examples & word families"));
    wrap.appendChild(h("div", { class: "grid" },
      h("div", { class: "kpi" }, h("b", null, c.due), h("span", null, "due today · مستحقة اليوم")),
      h("div", { class: "kpi y" }, h("b", null, c.learned), h("span", null, "learned · تم تعلمها")),
      h("div", { class: "kpi s" }, h("b", null, c.mastered), h("span", null, "mastered · متقنة"))));
    wrap.appendChild(h("div", { class: "grid two", style: { marginTop: "16px" } },
      h("a", { class: "card tint", style: { textDecoration: "none", color: "inherit" }, href: "#/vocab/review" }, h("h2", null, "🔁 Review due words"), h("p", null, "Spaced repetition — see a word just before you forget it."), PTE.ar("تكرار متباعد: تراجع الكلمة قبل أن تنساها.")),
      h("a", { class: "card tint", style: { textDecoration: "none", color: "inherit" }, href: "#/vocab/learn" }, h("h2", null, "🌱 Learn 8 new words"), h("p", null, "This week's topic words first."), PTE.ar("٨ كلمات جديدة من موضوع الأسبوع.")),
      h("a", { class: "card tint", style: { textDecoration: "none", color: "inherit" }, href: "#/vocab/games" }, h("h2", null, "🎮 Word games"), h("p", null, "Match, spell, fill-in and unscramble."), PTE.ar("ألعاب: مطابقة وإملاء وتكملة وترتيب حروف.")),
      h("a", { class: "card tint", style: { textDecoration: "none", color: "inherit" }, href: "#/vocab/browse" }, h("h2", null, "📚 Browse & search"), h("p", null, "All words by topic with word families."), PTE.ar("تصفح كل الكلمات حسب الموضوع."))));
    wrap.appendChild(h("div", { class: "card" }, h("h3", null, "How the memory system works · كيف يعمل نظام الحفظ"),
      h("p", null, "Right answer → the word comes back later (1, 2, 4, 8, 16, 35, 70 days). Wrong → tomorrow. Ten minutes a day beats two hours once a week."),
      PTE.ar("إجابة صحيحة تؤجل الكلمة (١ ثم ٢ ثم ٤ ثم ٨ ... يوم). إجابة خاطئة تعيدها غداً. عشر دقائق يومياً أفضل من ساعتين مرة في الأسبوع.")));
    return wrap;
  };

  function review(learnMode) {
    const wrap = h("div");
    wrap.appendChild(PTE.back("#/vocab", "Vocabulary"));
    let queue;
    if (learnMode) queue = PTE.srs.newWords(8).map((w) => ({ id: w.id, fresh: true }));
    else { queue = PTE.srs.due().slice(0, 20).map((id) => ({ id })); }
    if (!queue.length) {
      wrap.appendChild(h("div", { class: "card" }, h("h2", null, learnMode ? "No new words left 🎉" : "Nothing due right now ✅"),
        h("p", null, learnMode ? "You have started every word." : "Come back tomorrow, or learn new words."),
        h("a", { class: "btn", href: learnMode ? "#/vocab/games" : "#/vocab/learn" }, learnMode ? "Play games" : "🌱 Learn new words")));
      if (!learnMode) PTE.completeTask("srs", 10);
      return wrap;
    }
    const holder = h("div"); wrap.appendChild(holder);
    let k = 0, ok = 0;
    const step = () => {
      PTE.clear(holder);
      if (k >= queue.length) {
        PTE.addXP(queue.length * 3, learnMode ? "New words" : "Review done"); PTE.addMinutes(Math.ceil(queue.length / 3));
        if (!learnMode) PTE.completeTask("srs", 20);
        holder.appendChild(h("div", { class: "card accent" }, h("h2", null, "Session complete 🎉"), h("p", null, ok + " / " + queue.length + " remembered"),
          h("div", { class: "row" }, h("a", { class: "btn", href: "#/vocab/games" }, "🎮 Play games"), h("a", { class: "btn ghost", href: "#/vocab" }, "Done"))));
        PTE.fireworks(); return;
      }
      const it = queue[k], w = PTE.srs.byId(it.id); let shown = false;
      const face = h("div", { class: "face" });
      const render = () => {
        PTE.clear(face); face.appendChild(wordCard(w, shown));
        if (!shown) face.appendChild(h("small", null, "Tap to reveal · اضغط لإظهار المعنى"));
      };
      face.addEventListener("click", (e) => { if (!shown && !e.target.closest("button")) { shown = true; render(); actions(); } });
      const act = h("div", { class: "row" });
      const actions = () => {
        PTE.clear(act);
        if (!shown) { act.appendChild(h("button", { class: "btn big", onclick: () => { shown = true; render(); actions(); } }, "Show answer · أظهر")); return; }
        if (it.fresh) act.appendChild(h("button", { class: "btn big", onclick: () => { PTE.srs.learn(w.id); k++; step(); } }, "Got it ✓ فهمت"));
        else {
          act.appendChild(h("button", { class: "btn red big", onclick: () => { PTE.srs.grade(w.id, false); k++; step(); } }, "✗ Forgot نسيت"));
          act.appendChild(h("button", { class: "btn big", onclick: () => { PTE.srs.grade(w.id, true); ok++; k++; step(); } }, "✓ Knew it عرفتها"));
        }
      };
      render(); actions();
      PTE.say(w.en, "en");
      holder.appendChild(h("div", { class: "row between" }, h("b", null, learnMode ? "New words" : "Review"), h("span", null, (k + 1) + " / " + queue.length)));
      holder.appendChild(PTE.bar((100 * k) / queue.length));
      holder.appendChild(h("div", { class: "card flash" }, face));
      holder.appendChild(act);
    };
    step();
    return wrap;
  }

  function browse(q) {
    const wrap = h("div"); wrap.appendChild(PTE.pageHead("Word Library", "مكتبة الكلمات"));
    const all = PTE.srs.allWords(); const list = h("div", { class: "stack" });
    const inp = h("input", { type: "text", placeholder: "Search English or Arabic… ابحث", value: q.get("s") || "" });
    const sel = h("select", null, h("option", { value: "" }, "All topics"), topics().map((t) => h("option", { value: t }, t)));
    const draw = () => {
      const s = inp.value.trim().toLowerCase(), t = sel.value;
      const res = all.filter((w) => (!t || w.topic === t) && (!s || w.en.toLowerCase().includes(s) || w.ar.includes(s) || (w.forms || "").toLowerCase().includes(s))).slice(0, 60);
      PTE.clear(list);
      list.appendChild(h("small", null, res.length + " shown"));
      res.forEach((w) => {
        const st = S().srs[w.id];
        const d = h("details", { class: "card", style: { margin: 0 } }, h("summary", null, h("b", null, w.en), " — ", h("span", { class: "ar", dir: "rtl", style: { display: "inline" } }, w.ar), st ? h("span", { class: "chip " + (st.box >= 5 ? "ok" : "") }, "box " + st.box) : null), wordCard(w, true));
        list.appendChild(d);
      });
    };
    inp.addEventListener("input", draw); sel.addEventListener("change", draw);
    wrap.appendChild(PTE.back("#/vocab", "Vocabulary"));
    wrap.appendChild(h("div", { class: "row" }, inp, sel)); wrap.appendChild(list); draw();
    return wrap;
  }

  function games(which) {
    const wrap = h("div"); wrap.appendChild(PTE.back("#/vocab", "Vocabulary"));
    const pool = () => {
      const s = S().srs; const w = PTE.srs.allWords(); const learned = w.filter((x) => s[x.id]);
      return learned.length >= 12 ? learned : w;
    };
    const defs = {
      meaning: ["🎯 Meaning match", "اختر المعنى"], rev: ["🔄 Arabic → English", "من العربي للإنجليزي"], fill: ["🧩 Fill the sentence", "أكمل الجملة"], spell: ["🎧 Hear & spell", "اسمع واكتب"], scramble: ["🔀 Unscramble", "رتب الحروف"]
    };
    if (!which) {
      wrap.appendChild(PTE.pageHead("Word Games", "ألعاب الكلمات", "Each game = 10 rounds. Learn words first for better results."));
      wrap.appendChild(h("div", { class: "lines" }, Object.keys(defs).map((k) => h("a", { class: "line-card", href: "#/vocab/games/" + k }, h("b", null, defs[k][0]), h("span", { class: "ar", dir: "rtl" }, defs[k][1])))));
      return wrap;
    }
    const mk = () => {
      const P = pool(); const items = PTE.pick(P, 10);
      const distract = (w, key, n) => PTE.pick(P.filter((x) => x.id !== w.id), n).map((x) => x[key]);
      let render;
      if (which === "meaning") render = (w, i, done) => { const opts = PTE.shuffle([w.ar].concat(distract(w, "ar", 3))); return h("div", { class: "card" }, h("div", { class: "big-word" }, w.en), PTE.speakBtn(w.en, "en"), PTE.choices(opts, Object.assign((x) => opts[x] === w.ar, { correctIndex: opts.indexOf(w.ar) }), (ok) => { PTE.srs.grade(w.id, ok); if (!ok) PTE.logError({ task: "vocab", q: w.en, a: w.ar }); done(ok); })); };
      if (which === "rev") render = (w, i, done) => { const opts = PTE.shuffle([w.en].concat(distract(w, "en", 3))); return h("div", { class: "card" }, PTE.ar(w.ar, "big-word"), PTE.choices(opts, Object.assign((x) => opts[x] === w.en, { correctIndex: opts.indexOf(w.en) }), (ok) => { PTE.srs.grade(w.id, ok); if (!ok) PTE.logError({ task: "vocab", q: w.ar, a: w.en }); done(ok); })); };
      if (which === "fill") render = (w, i, done) => {
        const re = new RegExp(w.en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, Math.max(3, w.en.length - 2)) + "\\w*", "i");
        const m = w.ex.match(re); const target = m ? m[0] : w.en; const sentence = m ? w.ex.replace(target, "_____") : w.ex + " (_____)";
        const opts = PTE.shuffle([target].concat(PTE.pick(P.filter((x) => x.id !== w.id), 3).map((x) => x.en)));
        return h("div", { class: "card" }, h("p", { class: "passage" }, sentence), PTE.ar(w.exAr), PTE.choices(opts, Object.assign((x) => opts[x] === target, { correctIndex: opts.indexOf(target) }), (ok) => { if (!ok) PTE.logError({ task: "vocab", q: sentence, a: target }); done(ok); }));
      };
      if (which === "spell") render = (w, i, done) => { const inp = h("input", { type: "text", autocomplete: "off", autocapitalize: "off", spellcheck: "false", placeholder: "Type the word…" }); const out = h("div"); const go = () => { const ok = PTE.norm(inp.value) === PTE.norm(w.en); out.className = ok ? "good-t" : "bad-t"; out.textContent = ok ? "✓ " + w.en : "✗ " + w.en; ok ? PTE.ding() : PTE.buzz(); if (!ok) PTE.logError({ task: "spelling", q: inp.value, a: w.en }); inp.disabled = true; done(ok); }; setTimeout(() => PTE.say(w.en, "en", 0.8), 200); return h("div", { class: "card stack" }, h("button", { class: "btn big", onclick: () => PTE.say(w.en, "en", 0.8) }, "🔊 Hear again"), PTE.ar(w.ar), inp, h("button", { class: "btn", onclick: go }, "Check"), out); };
      if (which === "scramble") render = (w, i, done) => {
        const word = w.en.toLowerCase().replace(/[^a-z]/g, ""); let sc = word; for (let t = 0; t < 6 && sc === word; t++) sc = PTE.shuffle(word.split("")).join("");
        const inp = h("input", { type: "text", autocomplete: "off", autocapitalize: "off", placeholder: "Your answer" }); const out = h("div");
        return h("div", { class: "card stack" }, h("div", { class: "big-word", style: { letterSpacing: ".2em" } }, sc.toUpperCase()), PTE.ar(w.ar), inp, h("button", { class: "btn", onclick: () => { const ok = PTE.norm(inp.value).replace(/ /g, "") === word; out.className = ok ? "good-t" : "bad-t"; out.textContent = (ok ? "✓ " : "✗ ") + w.en; ok ? PTE.ding() : PTE.buzz(); inp.disabled = true; done(ok); } }, "Check"));
      };
      return PTE.rounds({ key: "vocab", title: defs[which][0], items, render, back: "#/vocab/games", taskId: "quiz", again: () => { PTE.clear(holder); holder.appendChild(mk()); } });
    };
    const holder = h("div"); wrap.appendChild(holder); holder.appendChild(mk());
    return wrap;
  }
})();

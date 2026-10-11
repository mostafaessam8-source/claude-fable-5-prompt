/* Phonetics lab + Grammar */
(function () {
  "use strict";
  const PTE = window.PTE, h = PTE.h, S = () => PTE.store.get();
  const PH = () => PTE.D.phonetics || {};

  /* speak a text split on '//' with real pauses (sense groups) */
  async function speakGroups(marked) {
    const parts = marked.split("//").map((x) => x.trim()).filter(Boolean);
    for (const p of parts) { const ok = await PTE.tts.speak(p, { lang: "en", rate: 0.9 }); if (!ok) return; await new Promise((r) => setTimeout(r, 450)); }
  }
  PTE.speakGroups = speakGroups;

  function soundCard(s, kind) {
    return h("details", { class: "card", style: { margin: 0 } },
      h("summary", null, h("span", { class: "big-word ipa" }, "/" + s.ipa + "/"), " ", h("b", null, s.label || ""), s.voiced !== undefined ? h("span", { class: "chip" }, s.voiced ? "voiced" : "voiceless") : null),
      h("div", { class: "stack", style: { marginTop: "10px" } },
        h("div", { class: "row" }, s.ex.map((e) => h("button", { class: "btn mini speak", type: "button", onclick: () => PTE.say(e.w, "en", 0.8) }, "🔊 " + e.w + "  ", h("span", { class: "ipa" }, "/" + e.ipa + "/")))),
        PTE.ar(s.ar), s.trap ? h("div", { class: "card warn", style: { margin: 0 } }, h("b", null, "⚠ فخ للعرب"), PTE.ar(s.trap)) : null,
        s.place ? h("small", null, "Place: " + s.place) : null,
        s.sentence ? h("div", { class: "row" }, h("i", null, s.sentence), PTE.speakBtn(s.sentence, "en")) : null));
  }

  PTE.views.phonetics = function (p) {
    const sub = p[0], D = PH(); const wrap = h("div");
    const tabs = [["", "Lab"], ["vowels", "Vowels"], ["diphthongs", "Diphthongs"], ["consonants", "Consonants"], ["traps", "Arabic traps"], ["pairs", "Minimal pairs"], ["stress", "Stress"], ["rhythm", "Rhythm & linking"], ["practice", "Practice"]];
    wrap.appendChild(PTE.pageHead("Phonetics Lab", "معمل الفوناتكس", "Pronunciation = Oral fluency + Pronunciation scores in Speaking. Master the sounds first. / النطق يؤثر على درجات الكلام."));
    wrap.appendChild(h("div", { class: "tabs" }, tabs.map((t) => h("a", { class: "tab" + ((sub || "") === t[0] ? " active" : ""), href: "#/phonetics" + (t[0] ? "/" + t[0] : "") }, t[1]))));
    if (!sub) {
      wrap.appendChild(h("div", { class: "card accent" }, h("h2", null, "Why phonetics first? · ليه نبدأ بالصوتيات؟"),
        h("p", null, "In PTE, Read Aloud, Repeat Sentence, Describe Image and Re-tell Lecture are scored on content, oral fluency and pronunciation. Clear sounds, correct stress and smooth rhythm lift all four tasks."),
        PTE.ar("في PTE أربع مهام تتصحح على المحتوى والطلاقة والنطق. الأصوات الواضحة والنبر الصحيح والإيقاع المتصل يرفعون درجات المهام الأربعة. النطق المفهوم أهم من اللكنة المثالية."),
        h("div", { class: "row" }, h("a", { class: "btn", href: "#/phonetics/vowels" }, "Start: vowels"), h("a", { class: "btn ghost", href: "#/phonetics/traps" }, "Arabic traps"))));
      const chart = (title, arr) => h("div", { class: "card" }, h("h3", null, title), h("div", { class: "track" }, (arr || []).map((s) => h("button", { class: "stn", style: { borderColor: "var(--blue)", fontFamily: "'Segoe UI', 'DejaVu Sans', sans-serif" }, title: s.label, onclick: () => PTE.say(s.ex[0].w, "en", 0.8) }, s.ipa))), h("small", null, "Tap a symbol to hear an example word · اضغط الرمز للاستماع"));
      wrap.appendChild(chart("Vowels · الحروف المتحركة", D.vowels)); wrap.appendChild(chart("Diphthongs · الأصوات المركبة", D.diphthongs)); wrap.appendChild(chart("Consonants · الحروف الساكنة", D.consonants));
      return wrap;
    }
    if (sub === "vowels" || sub === "diphthongs" || sub === "consonants") {
      wrap.appendChild(h("div", { class: "stack" }, (D[sub] || []).map((s) => soundCard(s, sub))));
      wrap.appendChild(h("div", { style: { marginTop: "14px" } }, h("button", { class: "btn", onclick: () => { PTE.completeTask("phon", 20); PTE.addMinutes(8); PTE.toast("Pronunciation task logged ✓"); } }, "✓ I practised these sounds")));
      return wrap;
    }
    if (sub === "traps") {
      (D.arabicTraps || []).forEach((t) => wrap.appendChild(h("div", { class: "card" }, h("h2", null, t.title), PTE.ar(t.titleAr, "ar-title"), PTE.ar(t.problem),
        h("div", { class: "row" }, (t.examples || []).map((e) => h("button", { class: "btn mini speak", type: "button", onclick: () => PTE.say(e.w, "en", 0.75) }, "🔊 " + e.w, h("span", { class: "ipa" }, " /" + e.ipa + "/"), e.wrong ? h("small", null, " ≠ " + e.wrong) : null))),
        t.drill ? h("div", { class: "row", style: { marginTop: "8px" } }, h("i", null, "Drill: " + t.drill), PTE.speakBtn(t.drill, "en")) : null)));
      return wrap;
    }
    if (sub === "pairs") return wrap.appendChild(pairsGame(D)), wrap;
    if (sub === "stress") return stressView(wrap, D);
    if (sub === "rhythm") return rhythmView(wrap, D);
    if (sub === "practice") {
      wrap.appendChild(h("div", { class: "card" }, h("h2", null, "Read Aloud survival tips · نصائح"), h("ul", null, (D.readAloudTips || []).map((t) => h("li", { dir: "auto" }, t)))));
      wrap.appendChild(h("div", { class: "card" }, h("h2", null, "Tongue twisters · تمارين اللسان"), h("div", { class: "stack" }, (D.tongueTwisters || []).map((t) => h("div", { class: "row between" }, h("span", null, t.text, h("small", null, "  [" + t.focus + "]")), h("span", null, PTE.speakBtn(t.text, "en"), " ", h("button", { class: "btn mini", onclick: () => { PTE.say(t.text, "en", 0.6); } }, "🐢 slow"))))))); 
      wrap.appendChild(h("a", { class: "btn", href: "#/speaking/ra" }, "Now practise Read Aloud →"));
      return wrap;
    }
    return wrap;
  };

  function pairsGame(D) {
    const wrap = h("div");
    wrap.appendChild(h("div", { class: "card tint" }, h("h3", null, "Minimal pairs listening game · لعبة الأزواج"), PTE.ar("هتسمع كلمة واحدة من الزوج، اختار أنهي واحدة سمعتها. (ملحوظة: الصوت الاصطناعي بيساعد في التدريب لكنه مش بديل لمدرس.)")));
    const allPairs = [];
    (D.minimalPairs || []).forEach((g) => g.pairs.forEach((pr) => allPairs.push({ sounds: g.sounds, a: pr[0], b: pr[1] })));
    const holder = h("div"); wrap.appendChild(holder);
    const mk = () => PTE.rounds({
      key: "phon", title: "Which word did you hear?", items: PTE.pick(allPairs, 10), back: "#/phonetics/pairs", taskId: "phon", again: () => { PTE.clear(holder); holder.appendChild(mk()); },
      render: (it, i, done) => {
        const target = Math.random() < 0.5 ? it.a : it.b; const opts = [it.a, it.b];
        setTimeout(() => PTE.say(target, "en", 0.75), 250);
        return h("div", { class: "card stack" }, h("div", { class: "ipa" }, it.sounds), h("button", { class: "btn big", onclick: () => PTE.say(target, "en", 0.75) }, "🔊 Play"),
          PTE.choices(opts, Object.assign((x) => opts[x] === target, { correctIndex: opts.indexOf(target) }), (ok) => { if (!ok) PTE.logError({ task: "phonetics", q: it.a + " / " + it.b, a: target }); done(ok); }));
      }
    });
    holder.appendChild(mk());
    return wrap;
  }

  function stressView(wrap, D) {
    (D.wordStress || []).forEach((r) => wrap.appendChild(h("div", { class: "card" }, h("h3", null, r.rule), PTE.ar(r.ruleAr),
      h("div", { class: "row" }, (r.examples || []).map((e) => h("button", { class: "btn mini speak", type: "button", onclick: () => PTE.say(e.w, "en", 0.8) }, "🔊 " + e.stress))))));
    wrap.appendChild(h("div", { class: "card" }, h("h2", null, "Sentence stress · نبر الجملة"), PTE.ar("الكلمات المحتوى (أسماء، أفعال، صفات، ظروف) بتتنبر. الكلمات الوظيفية بتتقال سريعاً وبهدوء."),
      h("div", { class: "stack" }, (D.sentenceStress || []).map((s) => h("div", { class: "card tint", style: { margin: 0 } }, h("div", { class: "row between" }, h("b", null, s.marked), PTE.speakBtn(s.sentence, "en")), PTE.ar(s.note))))));
    return wrap;
  }

  function rhythmView(wrap, D) {
    wrap.appendChild(h("div", { class: "card tint" }, h("h2", null, "Sense groups · مجموعات المعنى"), PTE.ar("اقرأ في مجموعات كلمات (//) بدل كلمة كلمة. توقف قصير عند كل //، ولا تتوقف أبداً في منتصف مجموعة.")));
    (D.senseGroups || []).forEach((s) => wrap.appendChild(h("div", { class: "card" }, h("p", { class: "passage" }, s.marked.split("//").map((g, k) => h("span", { class: "grp" }, g.trim() + " ", h("b", { style: { color: "var(--red)" } }, k < s.marked.split("//").length - 1 ? "// " : "")))),
      h("div", { class: "row" }, h("button", { class: "btn mini", onclick: () => speakGroups(s.marked) }, "🔊 Listen with pauses"), PTE.speakBtn(s.text, "en", "no pauses")), s.noteAr ? PTE.ar(s.noteAr) : null)));
    wrap.appendChild(h("h2", null, "Linking · الربط"));
    (D.linking || []).forEach((l) => wrap.appendChild(h("div", { class: "card" }, h("b", null, l.rule), PTE.ar(l.ruleAr), h("div", { class: "row" }, (l.examples || []).map((e) => h("button", { class: "btn mini speak", onclick: () => PTE.say(e.text, "en", 0.85) }, "🔊 " + e.text + " → " + e.linked))))));
    wrap.appendChild(h("h2", null, "Intonation · التنغيم"));
    (D.intonation || []).forEach((l) => wrap.appendChild(h("div", { class: "card" }, h("b", null, l.pattern), PTE.ar(l.ruleAr), h("div", { class: "row" }, (l.examples || []).map((e) => h("button", { class: "btn mini speak", onclick: () => PTE.say(e.replace(/[↗↘→]/g, ""), "en", 0.9) }, "🔊 " + e))))));
    return wrap;
  }

  /* ---------------- GRAMMAR ---------------- */
  PTE.views.grammar = function (p) {
    const G = PTE.D.grammar || [];
    const wrap = h("div");
    if (!p[0]) {
      const cur = PTE.plan.station(PTE.plan.weekOf(PTE.todayIndex())).grammar;
      wrap.appendChild(PTE.pageHead("Grammar Station", "محطة القواعد", "16 units written for Arabic speakers: rules in Arabic, traps highlighted, exercises with explanations."));
      wrap.appendChild(h("div", { class: "grid two" }, G.map((g) => {
        const a = PTE.avgScore("grammar-" + g.id);
        return h("a", { class: "card tint", style: { margin: 0, textDecoration: "none", color: "inherit" }, href: "#/grammar/" + g.id },
          h("div", { class: "row between" }, h("b", null, g.title), h("span", { class: "chip" + (g.id === cur ? " hot" : "") }, g.id === cur ? "this week" : g.level)),
          PTE.ar(g.titleAr), a !== null ? PTE.bar(a) : h("small", null, "not started"));
      })));
      return wrap;
    }
    const g = G.find((x) => x.id === p[0]); if (!g) return h("div", { class: "card" }, "Unit not found");
    wrap.appendChild(PTE.back("#/grammar", "All units"));
    wrap.appendChild(PTE.pageHead(g.title, g.titleAr, g.level));
    wrap.appendChild(h("div", { class: "card warn" }, h("b", null, "Why it matters · لماذا مهمة؟"), PTE.ar(g.why)));
    wrap.appendChild(h("div", { class: "card" }, h("h2", null, "Explanation · الشرح"), PTE.ar(g.explainAr), PTE.arBox(null), h("details", null, h("summary", null, "English explanation"), h("p", { style: { whiteSpace: "pre-line" } }, g.explainEn)), g.story ? h("p", null, h("i", null, "📖 " + g.story)) : null));
    wrap.appendChild(h("div", { class: "card" }, h("h2", null, "Rules · القواعد"), h("ol", null, g.rules.map((r) => h("li", null, h("div", null, r.en), PTE.ar(r.ar))))));
    wrap.appendChild(h("div", { class: "card" }, h("h2", null, "Examples · أمثلة"), h("div", { class: "stack" }, g.examples.map((e) => h("div", { class: "row between" }, h("div", null, h("div", null, e.en), PTE.ar(e.ar)), PTE.speakBtn(e.en, "en"))))));
    wrap.appendChild(h("div", { class: "card danger" }, h("h2", null, "⚠ Arabic-speaker traps · أخطاء شائعة"), h("ul", null, g.traps.map((t) => h("li", { dir: "auto" }, t)))));
    const holder = h("div", { class: "card" }, h("h2", null, "Practice · تمارين (" + g.exercises.length + ")"));
    const start = () => {
      PTE.clear(holder);
      holder.appendChild(PTE.rounds({ key: "grammar-" + g.id, title: g.title, items: PTE.shuffle(g.exercises), xp: 5, back: "#/grammar", taskId: "grammar", again: start, render: (ex, i, done) => exercise(ex, done) }));
    };
    holder.appendChild(h("button", { class: "btn big", onclick: start }, "▶ Start exercises"));
    wrap.appendChild(holder);
    return wrap;
  };

  function showWhy(card, ex, ok) {
    card.appendChild(h("div", { class: "card tint" }, h("b", { class: ok ? "good-t" : "bad-t" }, ok ? "✓ Correct" : "✗ Not quite"), ex.why ? h("p", null, ex.why) : null, ex.whyAr ? PTE.ar(ex.whyAr) : null));
  }
  function exercise(ex, done) {
    const card = h("div", { class: "card stack" });
    const fin = (ok, given, ans) => { if (!ok) PTE.logError({ task: "grammar", q: ex.q || ex.words.join(" "), a: ans }); showWhy(card, ex, ok); done(ok); };
    if (ex.type === "mcq") {
      card.appendChild(h("p", { class: "passage" }, ex.q));
      card.appendChild(PTE.choices(ex.options, Object.assign((x) => x === ex.answer, { correctIndex: ex.answer }), (ok) => fin(ok, null, ex.options[ex.answer])));
    } else if (ex.type === "fill" || ex.type === "fix") {
      const answers = [].concat(ex.answer);
      card.appendChild(h("p", { class: "passage" }, ex.type === "fix" ? "Correct the mistake: " + ex.q : ex.q));
      const inp = h("input", { type: "text", autocomplete: "off", autocapitalize: "off", spellcheck: "false", placeholder: ex.type === "fix" ? "Type the corrected sentence" : "Type the missing word(s)" });
      const go = () => { const ok = answers.some((a) => PTE.norm(a) === PTE.norm(inp.value)); inp.disabled = true; ok ? PTE.ding() : PTE.buzz(); if (!ok) card.appendChild(h("p", { class: "good-t" }, "Answer: " + answers[0])); fin(ok, inp.value, answers[0]); btn.disabled = true; };
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
      const btn = h("button", { class: "btn", onclick: go }, "Check");
      card.appendChild(inp); card.appendChild(btn);
    } else if (ex.type === "order") {
      const pool = h("div", { class: "row" }), line = h("div", { class: "passage", style: { minHeight: "3em" } }); const chosen = [];
      PTE.shuffle(ex.words).forEach((w) => { const b = h("button", { class: "btn mini ghost", type: "button", onclick: () => { chosen.push(w); b.disabled = true; line.textContent = chosen.join(" "); } }, w); pool.appendChild(b); });
      card.appendChild(h("p", null, "Put the words in order · رتب الكلمات")); card.appendChild(line); card.appendChild(pool);
      const btn = h("button", { class: "btn", onclick: () => { const oa = [].concat(ex.answer); const ok = oa.some((a) => PTE.norm(chosen.join(" ")) === PTE.norm(a)); ok ? PTE.ding() : PTE.buzz(); if (!ok) card.appendChild(h("p", { class: "good-t" }, "Answer: " + oa[0])); btn.disabled = true; fin(ok, null, oa[0]); } }, "Check");
      card.appendChild(h("div", { class: "row" }, btn, h("button", { class: "btn ghost", type: "button", onclick: () => { chosen.length = 0; line.textContent = ""; pool.querySelectorAll("button").forEach((x) => (x.disabled = false)); } }, "Reset")));
    } else card.appendChild(h("p", null, JSON.stringify(ex)));
    return card;
  }
  PTE.exercise = exercise;
})();

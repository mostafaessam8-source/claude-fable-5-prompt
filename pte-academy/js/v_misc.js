/* Strategies, Glossary, Mock tests */
(function () {
  "use strict";
  const PTE = window.PTE, h = PTE.h, S = () => PTE.store.get();
  const SG = () => PTE.D.strategies || {};
  const bi = (o) => h("div", null, h("div", null, o.en), PTE.ar(o.ar));

  /* ---------------- STRATEGIES ---------------- */
  PTE.views.strategies = function (p) {
    const sub = p[0]; const D = SG(); const wrap = h("div");
    wrap.appendChild(PTE.pageHead("Strategy Guide", "دليل الاستراتيجيات", "Task-by-task methods, templates and exam-day checklist. / طرق كل سؤال والقوالب وقائمة يوم الامتحان."));
    const tabs = [["", "Overview"], ["tasks", "All tasks"], ["templates", "Templates"], ["mistakes", "Common mistakes"], ["examday", "Exam day"], ["mindset", "Mindset"]];
    wrap.appendChild(h("div", { class: "tabs" }, tabs.map((t) => h("a", { class: "tab" + ((sub || "") === t[0] ? " active" : ""), href: "#/strategies" + (t[0] ? "/" + t[0] : "") }, t[1]))));
    const task = (D.tasks || []).find((t) => t.id === sub);
    if (task) return wrap.appendChild(taskCard(task, true)), wrap;
    if (!sub) {
      wrap.appendChild(h("div", { class: "card accent" }, h("h2", null, "How the test is built · هيكل الامتحان"), (D.structure || []).map((s) => h("div", { class: "card tint" }, h("b", null, s.part + " · " + s.min + " min"), h("p", null, s.items), bi(s)))));
      const sc = D.scoring || {};
      wrap.appendChild(h("div", { class: "card" }, h("h2", null, "How you are scored · كيف يتم التصحيح"), sc.overview ? bi(sc.overview) : null,
        h("h3", null, "Enabling skills · المهارات المساندة"), h("div", { class: "stack" }, (sc.enabling || []).map((e) => h("div", null, h("b", null, e.skill), bi(e)))),
        h("h3", null, "Pitfalls · فخاخ"), h("ul", null, (sc.pitfalls || []).map((x) => h("li", null, bi(x))))));
      return wrap;
    }
    if (sub === "tasks") { const groups = D.tasks || []; wrap.appendChild(h("div", { class: "stack" }, groups.map((t) => taskCard(t, false)))); return wrap; }
    if (sub === "templates") {
      const T = D.templates || {};
      wrap.appendChild(h("div", { class: "card tint" }, h("p", null, "Templates are scaffolds: fill the slots with real information from the question. Never memorise a whole answer — the system detects off-topic text."), PTE.ar("القوالب هياكل تملأ فراغاتها بمعلومات السؤال الفعلية. لا تحفظ إجابة كاملة.")));
      (T.di || []).forEach((d) => wrap.appendChild(h("div", { class: "card" }, h("h3", null, "Describe Image — " + d.kind + ": " + (d.title || "")), h("pre", null, d.template), h("details", null, h("summary", null, "Example"), h("p", null, d.example), PTE.speakBtn(d.example, "en")))));
      if (T.rl) wrap.appendChild(h("div", { class: "card" }, h("h3", null, "Re-tell Lecture"), h("pre", null, T.rl.template), h("details", null, h("summary", null, "Example"), h("p", null, T.rl.example))));
      if (T.essay) wrap.appendChild(h("div", { class: "card" }, h("h3", null, "Essay (4 paragraphs)"), h("p", null, T.essay.structure), ["intro", "body", "conclusion", "linking"].map((k) => T.essay[k] ? h("div", null, h("b", null, k), h("ul", null, T.essay[k].map((x) => h("li", null, x)))) : null)));
      if (T.swt) wrap.appendChild(h("div", { class: "card" }, h("h3", null, "Summarize Written Text"), h("p", null, T.swt.method), h("ul", null, (T.swt.frames || []).map((x) => h("li", null, x))), h("details", null, h("summary", null, "Example"), h("p", null, T.swt.example))));
      if (T.sst) wrap.appendChild(h("div", { class: "card" }, h("h3", null, "Summarize Spoken Text"), h("pre", null, T.sst.template), h("details", null, h("summary", null, "Example"), h("p", null, T.sst.example))));
      return wrap;
    }
    if (sub === "mistakes") { wrap.appendChild(h("div", { class: "card danger" }, h("ol", null, (D.mistakes || []).map((m) => h("li", null, bi(m)))))); return wrap; }
    if (sub === "mindset") { wrap.appendChild(h("div", { class: "card accent" }, h("ol", null, (D.mindset || []).map((m) => h("li", null, bi(m)))))); return wrap; }
    if (sub === "examday") {
      const done = (S().badges.examday = S().badges.examday || {});
      wrap.appendChild(h("div", { class: "card" }, h("h2", null, "Exam-day checklist · قائمة يوم الامتحان"), h("div", { class: "stack" }, (D.examDay || []).map((x, i) => h("label", { class: "row", style: { alignItems: "flex-start", flexWrap: "nowrap" } }, h("input", { type: "checkbox", checked: done[i] ? "" : null, onchange: (e) => { done[i] = e.target.checked; PTE.store.save(); } }), bi(x))))));
      return wrap;
    }
    return wrap;
  };
  function taskCard(t, open) {
    const route = { ra: "speaking/ra", rs: "speaking/rs", di: "speaking/di", rl: "speaking/rl", asq: "speaking/asq", swt: "writing/swt", essay: "writing/essay", rfib: "reading/rfib", dfib: "reading/dfib", ro: "reading/ro", mcr: "reading/mcq", mcs: "reading/mcq", sst: "listening/sst", mcl: "listening/mcl", mcls: "listening/mcl", fibl: "listening/fibl", hcs: "listening/hcs", smw: "listening/smw", wfd: "listening/wfd" }[t.id];
    return h("details", { class: "card", open: open ? "" : null },
      h("summary", null, h("b", null, t.name), " · ", h("span", { class: "ar", dir: "rtl", style: { display: "inline" } }, t.nameAr), " ", h("span", { class: "chip" }, t.skills || "")),
      h("div", { class: "stack", style: { marginTop: "10px" } },
        h("p", null, h("b", null, "Time: "), t.time), h("p", null, t.what), PTE.ar(t.whatAr),
        h("p", null, h("b", null, "Scoring: "), t.scoring), PTE.ar(t.scoringAr),
        h("h4", null, "Steps · الخطوات"), h("ol", null, (t.steps || []).map((s, i) => h("li", null, s, t.stepsAr && t.stepsAr[i] ? PTE.ar(t.stepsAr[i]) : null))),
        t.template ? h("div", null, h("h4", null, "Template"), h("pre", null, t.template)) : null,
        h("h4", null, "Tips · نصائح"), h("ul", null, (t.tips || []).map((s, i) => h("li", null, s, t.tipsAr && t.tipsAr[i] ? PTE.ar(t.tipsAr[i]) : null))),
        h("h4", null, "Avoid · تجنب"), h("ul", null, (t.mistakes || []).map((s, i) => h("li", null, s, t.mistakesAr && t.mistakesAr[i] ? PTE.ar(t.mistakesAr[i]) : null))),
        h("div", { class: "card tint" }, h("b", null, "10-minute daily drill: "), t.drill, t.drillAr ? PTE.ar(t.drillAr) : null),
        route ? h("a", { class: "btn", href: "#/" + route }, "Practise " + t.name + " →") : null));
  }

  /* ---------------- GLOSSARY ---------------- */
  PTE.views.glossary = function () {
    const wrap = h("div"); wrap.appendChild(PTE.pageHead("Glossary", "قاموس المصطلحات", "Abbreviations you will see everywhere. / الاختصارات الشائعة."));
    const inp = h("input", { type: "text", placeholder: "Search… ابحث" }); const list = h("div", { class: "stack" });
    const draw = () => { const s = inp.value.toLowerCase(); PTE.clear(list); (SG().glossary || []).filter((g) => !s || JSON.stringify(g).toLowerCase().includes(s)).forEach((g) => list.appendChild(h("div", { class: "card", style: { margin: 0 } }, h("div", { class: "row between" }, h("b", null, g.abbr), h("span", null, g.full)), PTE.ar(g.ar)))); };
    inp.addEventListener("input", draw); wrap.appendChild(inp); wrap.appendChild(list); draw();
    return wrap;
  };


  /* ---------------- DIAGNOSTIC ---------------- */
  PTE.views.diagnostic = function () {
    const wrap = h("div"); wrap.appendChild(PTE.pageHead("Starting-point quiz", "اختبار تحديد المستوى", "20 questions: grammar, vocabulary, reading, listening. No stress — it only tells us where to start. / لا تقلق، هو فقط لتحديد نقطة البداية."));
    const D = PTE.D, G = (D.grammar || []).reduce((a, g) => a.concat(g.exercises.filter((e) => e.type === "mcq" || e.type === "fill").map((e) => Object.assign({ unit: g.title }, e))), []);
    const V = PTE.srs.allWords(), R = ((D.bankReading || {}).mcq || []).filter((x) => !x.multi), W = (D.bankLW || {}).wfd || [];
    const items = [].concat(PTE.pick(G, 8).map((e) => ({ k: "grammar", e })), PTE.pick(V, 6).map((w) => ({ k: "vocab", w })), PTE.pick(R, 3).map((r) => ({ k: "reading", r })), PTE.pick(W, 3).map((w) => ({ k: "listening", w })));
    const res = { grammar: [0, 0], vocab: [0, 0], reading: [0, 0], listening: [0, 0] };
    const holder = h("div"); wrap.appendChild(holder);
    let idx = 0;
    const next = () => {
      PTE.clear(holder);
      if (idx >= items.length) {
        const rep = Object.keys(res).map((k) => ({ k, pct: res[k][1] ? Math.round((100 * res[k][0]) / res[k][1]) : 0 }));
        const total = Math.round(rep.reduce((a, r) => a + r.pct, 0) / rep.length);
        S().diag = { t: Date.now(), rep, total }; PTE.store.save(); PTE.completeTask("diag", 40); PTE.addXP(40, "Starting-point quiz");
        const level = total >= 80 ? "Strong start — aim straight at 79+ with precision work." : total >= 55 ? "Solid base — the plan will build you steadily to B2/C1." : "Good that we checked! Stay on the foundations (sounds, core words, grammar) — the plan starts there on purpose.";
        const levelAr = total >= 80 ? "بداية قوية: ركز على الدقة والمهام." : total >= 55 ? "أساس جيد، الخطة ستبنيك تدريجياً." : "ممتاز أننا فحصنا! ابدأ بالأساسات (الأصوات والكلمات والقواعد) والخطة مصممة لذلك.";
        holder.appendChild(h("div", { class: "card accent" }, h("h2", null, "Your starting point · نقطة البداية: " + total + "%"), rep.map((r) => h("div", { class: "row between" }, h("span", null, r.k), h("span", { style: { flex: 1, margin: "0 10px" } }, PTE.bar(r.pct, r.pct < 50 ? "r" : r.pct < 75 ? "y" : "")), h("b", null, r.pct + "%"))), h("p", null, level), PTE.ar(levelAr),
          h("p", null, "Weakest area: " + rep.slice().sort((a, b) => a.pct - b.pct)[0].k + " — give it extra minutes this month."), h("a", { class: "btn", href: "#/today" }, "Go to today's missions")));
        PTE.fireworks(); return;
      }
      const it = items[idx]; holder.appendChild(h("div", { class: "row between" }, h("b", null, "Question " + (idx + 1) + " / " + items.length), h("span", { class: "chip" }, it.k)));
      holder.appendChild(PTE.bar((100 * idx) / items.length));
      const done = (ok) => { res[it.k][1]++; if (ok) res[it.k][0]++; idx++; setTimeout(next, ok ? 700 : 1700); };
      if (it.k === "grammar") holder.appendChild(PTE.exercise(it.e, done));
      else if (it.k === "vocab") { const opts = PTE.shuffle([it.w.ar].concat(PTE.pick(V.filter((x) => x.id !== it.w.id), 3).map((x) => x.ar))); holder.appendChild(h("div", { class: "card" }, h("div", { class: "big-word" }, it.w.en), PTE.choices(opts, Object.assign((x) => opts[x] === it.w.ar, { correctIndex: opts.indexOf(it.w.ar) }), done))); }
      else if (it.k === "reading") { const r = it.r; holder.appendChild(h("div", { class: "card stack" }, h("p", { class: "passage" }, r.passage), h("b", null, r.q), PTE.choices(r.options, Object.assign((x) => x === r.answers[0], { correctIndex: r.answers[0] }), done))); }
      else { const inp = h("input", { type: "text", autocomplete: "off", autocapitalize: "off", spellcheck: "false", placeholder: "Type what you hear…" }); const btn = h("button", { class: "btn", onclick: () => { btn.disabled = true; inp.disabled = true; const d = PTE.diffWords(it.w.text, inp.value); holder.appendChild(h("p", { class: d.pct >= 70 ? "good-t" : "bad-t" }, it.w.text)); done(d.pct >= 70); } }, "Check"); holder.appendChild(h("div", { class: "card stack" }, h("button", { class: "btn big", onclick: () => PTE.say(it.w.text, "en", 0.9) }, "🔊 Play"), inp, btn)); setTimeout(() => PTE.say(it.w.text, "en", 0.9), 300); }
    };
    next();
    return wrap;
  };

  /* ---------------- MOCK ---------------- */
  const MOCKS = {
    mini: { title: "Mini mock (about 25 min)", ar: "اختبار مصغر", sections: [
      { name: "Speaking", ar: "المحادثة", tasks: [["ra", "#/speaking/ra", "Read Aloud ×4", 1], ["rs", "#/speaking/rs", "Repeat Sentence ×8", 1], ["di", "#/speaking/di", "Describe Image ×4", 1]] },
      { name: "Writing", ar: "الكتابة", tasks: [["swt", "#/writing/swt", "Summarize Written Text ×2", 1]] },
      { name: "Reading", ar: "القراءة", tasks: [["rfib", "#/reading/rfib", "Fill blanks ×3", 1], ["ro", "#/reading/ro", "Re-order ×3", 1]] },
      { name: "Listening", ar: "الاستماع", tasks: [["wfd", "#/listening/wfd", "Dictation ×8", 1], ["hcs", "#/listening/hcs", "Highlight Summary ×2", 1]] }] },
    full: { title: "Full mock (about 2 hours)", ar: "اختبار كامل", sections: [
      { name: "Part 1 — Speaking", ar: "الجزء ١: المحادثة", tasks: [["ra", "#/speaking/ra", "Read Aloud ×4", 2], ["rs", "#/speaking/rs", "Repeat Sentence ×8", 2], ["di", "#/speaking/di", "Describe Image ×4", 2], ["rl", "#/speaking/rl", "Re-tell Lecture ×2", 2], ["asq", "#/speaking/asq", "Short Answers ×10", 1]] },
      { name: "Part 1 — Writing", ar: "الجزء ١: الكتابة", tasks: [["swt", "#/writing/swt", "Summarize Written Text ×2", 2], ["essay", "#/writing/essay", "Essay ×1", 2]] },
      { name: "Part 2 — Reading", ar: "الجزء ٢: القراءة", tasks: [["rfib", "#/reading/rfib", "R&W Fill blanks ×3", 2], ["dfib", "#/reading/dfib", "Reading Fill blanks ×2", 1], ["ro", "#/reading/ro", "Re-order ×3", 2], ["mcq", "#/reading/mcq", "Reading MCQ ×3", 2]] },
      { name: "Part 3 — Listening", ar: "الجزء ٣: الاستماع", tasks: [["sst", "#/listening/sst", "Summarize Spoken Text ×1", 2], ["mcl", "#/listening/mcl", "Listening MCQ ×3", 1], ["fibl", "#/listening/fibl", "Fill blanks ×2", 1], ["hcs", "#/listening/hcs", "Highlight Summary ×2", 1], ["smw", "#/listening/smw", "Missing Word ×4", 1], ["wfd", "#/listening/wfd", "Dictation ×8", 2]] }] }
  };
  PTE.views.mock = function (p) {
    const wrap = h("div"); wrap.appendChild(PTE.pageHead("Mock Tests", "اختبارات تجريبية", "A guided run through all task types. Scores come from the results you earn while running it. / نتيجتك تحسب من أدائك أثناء الاختبار."));
    if (p[0] === "result") return resultView();
    const act = S().mockActive;
    if (!act) {
      const t = PTE.dayTasks(PTE.todayIndex()).some((x) => x.id === "full");
      wrap.appendChild(h("div", { class: "grid two" }, ["mini", "full"].map((k) => h("div", { class: "card tint" + (k === "full" && t ? " warn" : "") , style: { margin: 0 } },
        h("h2", null, MOCKS[k].title), PTE.ar(MOCKS[k].ar), h("p", null, MOCKS[k].sections.map((s) => s.name).join(" → ")),
        h("button", { class: "btn big", onclick: () => { S().mockActive = { type: k, t: Date.now() }; PTE.store.save(); PTE.route(); } }, "▶ Start " + k + " mock")))));
      wrap.appendChild(h("div", { class: "card" }, h("h3", null, "Rules for a real mock · قواعد"), h("ul", null, ["Quiet room, headset, notepad and pen (a noteboard in the real test).", "Do not pause. Do not look at answers. Treat each item as the real thing.", "Play audio once; do not replay (except where the item allows).", "Afterwards, read your mistakes list in Progress and plan the repair week."]),
        PTE.ar("غرفة هادئة وسماعة وورقة. بدون إيقاف وبدون تلميحات. استمع للصوت مرة واحدة. بعد الاختبار راجع الأخطاء وخطط لأسبوع العلاج.")));
      const hist = S().mockHistory.slice(-5).reverse();
      if (hist.length) wrap.appendChild(h("div", { class: "card" }, h("h3", null, "Previous mocks"), h("table", { class: "tbl" }, h("tbody", null, hist.map((m) => h("tr", null, h("td", null, new Date(m.t).toLocaleDateString()), h("td", null, m.type), h("td", null, m.pct + "%")))))));
      return wrap;
    }
    const M = MOCKS[act.type];
    const since = (key) => (S().scores[key] || []).filter((x) => x.t >= act.t && x.max > 0);
    const avg = (key) => { const a = since(key); if (!a.length) return null; const g = a.reduce((x, y) => x + y.got, 0), m = a.reduce((x, y) => x + y.max, 0); return Math.round((100 * g) / m); };
    const elapsed = Math.round((Date.now() - act.t) / 60000);
    wrap.appendChild(h("div", { class: "card accent" }, h("b", null, M.title), h("p", null, "Elapsed: " + elapsed + " min. Run each section below. Come back here after each task."), PTE.bar(0)));
    const results = [];
    M.sections.forEach((sec) => {
      const rows = sec.tasks.map((t) => { const a = avg(t[0]); const n = since(t[0]).length; if (a !== null) results.push({ key: t[0], name: t[2], pct: a, sec: sec.name }); return h("li", null, h("a", { class: "task" + (n >= t[3] ? " done" : ""), href: t[1] }, h("span", { class: "t" }, t[2]), h("span", { class: "min" }, a === null ? "not started" : a + "% (" + n + "/" + t[3] + " sessions)"), h("span", { class: "tick" }, n >= t[3] ? "✓" : ""))); });
      wrap.appendChild(h("div", { class: "card" }, h("h3", null, sec.name), PTE.ar(sec.ar), h("ul", { class: "tasklist" }, rows)));
    });
    wrap.appendChild(h("div", { class: "row" },
      h("button", { class: "btn big", onclick: () => {
        if (!results.length) { PTE.toast("Complete at least one task first"); return; }
        const pct = Math.round(results.reduce((a, r) => a + r.pct, 0) / results.length);
        S().mockHistory.push({ t: Date.now(), type: act.type, pct, results }); delete S().mockActive; PTE.store.save();
        PTE.completeTask(act.type === "full" ? "full" : "mini", 60); PTE.addXP(act.type === "full" ? 150 : 60, "Mock finished"); PTE.fireworks();
        location.hash = "#/mock/result";
      } }, "🏁 Finish & see report"),
      h("button", { class: "btn ghost", onclick: () => { delete S().mockActive; PTE.store.save(); PTE.route(); } }, "Cancel mock")));
    return wrap;
  };
  function resultView() {
    const m = S().mockHistory[S().mockHistory.length - 1]; const wrap = h("div");
    wrap.appendChild(PTE.pageHead("Mock report", "تقرير الاختبار"));
    if (!m) return wrap;
    const est = Math.round(10 + m.pct * 0.8);
    wrap.appendChild(h("div", { class: "hero" }, h("h1", null, m.pct + "%"), h("p", null, "Practice accuracy across all tasks. Rough PTE-style estimate: " + est + " / 90 (guidance only)."), PTE.ar("هذه نسبة التدريب وليست درجة PTE الرسمية. التقدير تقريبي للاسترشاد فقط.")));
    const sorted = m.results.slice().sort((a, b) => a.pct - b.pct);
    wrap.appendChild(h("div", { class: "card" }, h("h2", null, "Weakest tasks first · الأضعف أولاً"), h("table", { class: "tbl" }, h("tbody", null, sorted.map((r) => h("tr", null, h("td", null, r.name), h("td", { style: { width: "40%" } }, PTE.bar(r.pct, r.pct < 60 ? "r" : r.pct < 80 ? "y" : "")), h("td", null, r.pct + "%")))))));
    wrap.appendChild(h("div", { class: "card warn" }, h("h3", null, "Next step · الخطوة التالية"), h("p", null, sorted.slice(0, 3).map((r) => r.name).join(", ") + " need extra practice this week."), PTE.ar("ركز هذا الأسبوع على المهام الأضعف في القائمة."), h("a", { class: "btn", href: "#/strategies/tasks" }, "Review strategies")));
    return wrap;
  }
})();

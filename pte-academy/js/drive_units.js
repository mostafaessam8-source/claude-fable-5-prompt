/* DRIVE MODE curriculum: named UNITS made of numbered, named, fixed LESSONS (same lesson = same script every time).
   Each lesson: { id, no, en, ar, build() -> segments }.  Built lazily from the data files. */
(function () {
  "use strict";
  const PTE = window.PTE;
  const K = () => PTE.driveKit;
  let NI = false; /* NI = building a part of a composite lesson: no per-part intro */
  const wc = (t) => PTE.countWords(t);
  const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
  const TOPIC_AR = { language: "اللغة", education: "التعليم", work: "العمل", emotions: "المشاعر", environment: "البيئة", science: "العلوم", health: "الصحة", "business & marketing": "الأعمال والتسويق", "economics & finance": "الاقتصاد والمال", "technology & AI": "التقنية والذكاء الاصطناعي", "society & culture": "المجتمع والثقافة", "psychology & social behaviour": "علم النفس والسلوك", "zoology & animals": "الحيوان", "art, architecture & design": "الفن والعمارة والتصميم", "history & geography": "التاريخ والجغرافيا", "media & communication": "الإعلام والتواصل", "law, government & politics": "القانون والحكم والسياسة" };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const intro = (unit, les) => { const k = K(); return [k.say(unit.en + ". Lesson " + les.no + ": " + les.en, "en", { show: { en: les.en, ar: les.ar }, lbl: unit.en.toUpperCase() + " · " + les.no }), k.say("الدرس " + les.no + ": " + les.ar, "ar", { show: { en: les.en, ar: les.ar } }), k.pause(500)]; };

  /* ---------- builders ---------- */
  function wordsLesson(unit, les, words) {
    const k = K(); k.reset(); const out = NI ? [] : intro(unit, les);
    words.forEach((w) => { k.grp(); out.push(
      k.say(w.en, "en", { rate: 0.8, show: { en: w.en, ar: w.ar }, lbl: "WORD", learn: w.id }), k.cue("Repeat · كرر"), k.pause(k.repeatGap(w.en)),
      k.say(w.ar, "ar", { show: { en: w.en, ar: w.ar }, lbl: "MEANING" }), k.pause(400),
      k.say(w.ex, "en", { show: { en: w.ex, ar: w.exAr }, lbl: "EXAMPLE" }), k.cue("Repeat · كرر"), k.pause(k.repeatGap(w.ex)),
      k.say(w.exAr, "ar", { show: { en: w.ex, ar: w.exAr } }), k.pause(500)); });
    k.grp(); out.push(k.say("Recap. Say the meaning before you hear it.", "en", { show: { en: "Recap · مراجعة", ar: "قل المعنى قبل أن تسمعه" } }));
    words.forEach((w) => { k.grp(); out.push(k.say(w.en, "en", { rate: 0.85, show: { en: w.en, ar: "؟" }, lbl: "RECAP" }), k.cue("Meaning · المعنى"), k.pause(2600), k.say(w.ar, "ar", { show: { en: w.en, ar: w.ar } }), k.pause(300)); });
    k.grp(); out.push(k.say("Well done. These words are saved in your review schedule.", "en", { show: { en: "Saved ✓", ar: "تم الحفظ في جدول المراجعة" } }));
    return out;
  }
  function soundsLesson(unit, les, sounds, traps) {
    const k = K(); k.reset(); const out = NI ? [] : intro(unit, les);
    (sounds || []).forEach((s) => { k.grp(); out.push(k.say("The sound: " + s.label, "en", { show: { en: "/" + s.ipa + "/  " + (s.label || ""), ar: "" }, lbl: "SOUND" }));
      s.ex.forEach((e) => out.push(k.say(e.w, "en", { rate: 0.75, show: { en: e.w, ar: "/" + e.ipa + "/" }, lbl: "REPEAT" }), k.cue("Repeat · كرر"), k.pause(1900)));
      out.push(k.say(s.ar, "ar", { show: { en: "/" + s.ipa + "/", ar: "" }, lbl: "TIP" }));
      if (s.trap) out.push(k.say(s.trap, "ar", { show: { en: "/" + s.ipa + "/", ar: "" }, lbl: "TRAP" }));
      if (s.sentence) out.push(k.say(s.sentence, "en", { rate: 0.85, show: { en: s.sentence, ar: "" }, lbl: "SENTENCE" }), k.cue("Repeat · كرر"), k.pause(k.repeatGap(s.sentence)));
      out.push(k.pause(400)); });
    (traps || []).forEach((t) => { k.grp(); out.push(k.say("Arabic speaker trap: " + t.title, "en", { show: { en: t.title, ar: t.titleAr }, lbl: "TRAP" }), k.say(t.problem, "ar", { show: { en: t.title, ar: t.titleAr } }), k.pause(500));
      (t.examples || []).forEach((e) => out.push(k.say(e.w, "en", { rate: 0.75, show: { en: e.w, ar: "/" + e.ipa + "/" } }), k.cue("Repeat · كرر"), k.pause(1900)));
      if (t.drill) out.push(k.say(t.drill, "en", { rate: 0.85, show: { en: t.drill, ar: "" }, lbl: "DRILL" }), k.cue("Repeat · كرر"), k.pause(k.repeatGap(t.drill))); });
    return out;
  }
  function pairsLesson(unit, les, groups) {
    const k = K(); k.reset(); const out = NI ? [] : intro(unit, les);
    groups.forEach((g) => { k.grp(); out.push(k.say("Minimal pairs: " + g.sounds.replace("/", "versus"), "en", { show: { en: g.sounds, ar: "أزواج الأصوات" }, lbl: "PAIRS" }));
      g.pairs.slice(0, 6).forEach((p) => out.push(k.say(p[0], "en", { rate: 0.7, show: { en: p[0] + "  /  " + p[1], ar: "" } }), k.pause(500), k.say(p[1], "en", { rate: 0.7, show: { en: p[0] + "  /  " + p[1], ar: "" } }), k.cue("Say both · قلهما"), k.pause(2600))); });
    return out;
  }
  function stressLesson(unit, les) {
    const k = K(); k.reset(); const P = PTE.D.phonetics || {}; const out = NI ? [] : intro(unit, les);
    (P.wordStress || []).slice(0, 5).forEach((r) => { k.grp(); out.push(k.say(r.rule, "en", { show: { en: r.rule, ar: r.ruleAr }, lbl: "RULE" }), k.say(r.ruleAr, "ar", { show: { en: r.rule, ar: r.ruleAr } })); (r.examples || []).slice(0, 4).forEach((e) => out.push(k.say(e.w, "en", { rate: 0.75, show: { en: e.stress, ar: "" } }), k.cue("Repeat · كرر"), k.pause(1800))); });
    (P.sentenceStress || []).slice(0, 5).forEach((s) => { k.grp(); out.push(k.say(s.sentence, "en", { rate: 0.85, show: { en: s.marked, ar: s.note }, lbl: "SENTENCE STRESS" }), k.cue("Repeat · كرر"), k.pause(k.repeatGap(s.sentence)), k.say(s.note, "ar", { show: { en: s.marked, ar: s.note } })); });
    return out;
  }
  function rhythmLesson(unit, les) {
    const k = K(); k.reset(); const P = PTE.D.phonetics || {}; const out = NI ? [] : intro(unit, les);
    (P.senseGroups || []).slice(0, 8).forEach((s) => { k.grp(); out.push(k.say("Read in groups.", "en", { show: { en: s.marked, ar: s.noteAr || "" }, lbl: "SENSE GROUPS" })); s.marked.split("//").map((x) => x.trim()).filter(Boolean).forEach((g) => out.push(k.say(g, "en", { rate: 0.9, show: { en: s.marked, ar: "" } }), k.cue("Repeat · كرر"), k.pause(k.repeatGap(g)))); });
    (P.linking || []).slice(0, 4).forEach((l) => { k.grp(); out.push(k.say(l.rule, "en", { show: { en: l.rule, ar: l.ruleAr }, lbl: "LINKING" }), k.say(l.ruleAr, "ar", { show: { en: l.rule, ar: l.ruleAr } })); (l.examples || []).slice(0, 3).forEach((e) => out.push(k.say(e.text, "en", { rate: 0.85, show: { en: e.text, ar: e.linked } }), k.cue("Repeat · كرر"), k.pause(2200))); });
    return out;
  }
  function grammarLesson(unit, les, g) {
    const k = K(); k.reset(); const out = NI ? [] : intro(unit, les);
    out.push(k.say(g.why, "ar", { show: { en: g.title, ar: g.titleAr }, lbl: "WHY" }), k.pause(500));
    k.grp(); out.push(k.say(g.explainAr, "ar", { show: { en: g.title, ar: g.titleAr }, lbl: "EXPLANATION" }), k.pause(600));
    g.rules.forEach((r) => { k.grp(); out.push(k.say(r.ar, "ar", { show: { en: r.en, ar: r.ar }, lbl: "RULE" }), k.say(r.en, "en", { show: { en: r.en, ar: r.ar } }), k.pause(600)); });
    g.examples.forEach((e) => { k.grp(); out.push(k.say(e.en, "en", { show: { en: e.en, ar: e.ar }, lbl: "EXAMPLE" }), k.cue("Repeat · كرر"), k.pause(k.repeatGap(e.en)), k.say(e.ar, "ar", { show: { en: e.en, ar: e.ar } })); });
    g.traps.slice(0, 3).forEach((t) => { k.grp(); out.push(k.say("Trap: " + t, "en", { show: { en: t, ar: "" }, lbl: "TRAP" }), k.pause(800)); });
    k.grp(); out.push(k.say("Oral quiz. Choose A, B, C or D in your head.", "en", { show: { en: "Oral quiz", ar: "اختبار شفهي" } }));
    g.exercises.filter((x) => x.type === "mcq").slice(0, 5).forEach((q) => { k.grp(); const L = ["A", "B", "C", "D"]; out.push(k.say(q.q.replace(/_+/g, "blank"), "en", { show: { en: q.q, ar: "" }, lbl: "QUESTION" })); q.options.forEach((o, i) => out.push(k.say(L[i] + ". " + o, "en", { show: { en: L[i] + ". " + o, ar: "" } }), k.pause(250))); out.push(k.cue("Answer · أجب"), k.pause(4500), k.say("The answer is " + L[q.answer] + ". " + q.options[q.answer], "en", { show: { en: "✔ " + L[q.answer] + ". " + q.options[q.answer], ar: q.whyAr || "" }, lbl: "ANSWER" }), k.say(q.whyAr || q.why, q.whyAr ? "ar" : "en", { show: { en: "✔ " + q.options[q.answer], ar: q.whyAr || "" } }), k.pause(600)); });
    return out;
  }
  function rsLesson(unit, les, items) {
    const k = K(); k.reset(); const out = NI ? [] : intro(unit, les); out.push(k.say("Listen once, then repeat after the beep.", "en", { show: { en: "Repeat Sentence", ar: "استمع مرة ثم كرر" } }));
    items.forEach((it) => { k.grp(); out.push(k.say(it.text, "en", { rate: 0.95, show: { en: "🎧 Listen…", ar: "استمع" }, lbl: "LISTEN" }), k.cue("Repeat · كرر"), k.pause(Math.max(2500, wc(it.text) * 480 + 1500)), k.say("Model:", "en", { show: { en: it.text, ar: "" }, lbl: "MODEL" }), k.say(it.text, "en", { rate: 0.9, show: { en: it.text, ar: "" } }), k.pause(800)); });
    return out;
  }
  function asqLesson(unit, les, items) {
    const k = K(); k.reset(); const out = NI ? [] : intro(unit, les); out.push(k.say("Answer out loud before you hear the answer.", "en", { show: { en: "Short answers", ar: "أجب بصوت عالٍ" } }));
    items.forEach((it) => { k.grp(); out.push(k.say(it.q, "en", { show: { en: it.q, ar: "" }, lbl: "QUESTION" }), k.cue("Answer · أجب"), k.pause(3500), k.say(it.a, "en", { show: { en: "✔ " + it.a, ar: "" }, lbl: "ANSWER" }), k.pause(500)); });
    return out;
  }
  function raLesson(unit, les, items) {
    const k = K(); k.reset(); const out = NI ? [] : intro(unit, les); out.push(k.say("Read-along. I read one sense group, you repeat it with the same rhythm.", "en", { show: { en: "Read Aloud · read-along", ar: "أقرأ مجموعة وتكررها بنفس الإيقاع" } }));
    items.forEach((it) => { k.grp(); out.push(k.say("Passage about " + (it.topic || "a topic"), "en", { show: { en: "Passage: " + (it.topic || ""), ar: "" }, lbl: "READ ALOUD" })); it.text.split(/(?<=[,.;])\s+/).filter(Boolean).forEach((seg) => out.push(k.say(seg, "en", { rate: 0.92, show: { en: seg, ar: "" } }), k.cue("Repeat · كرر"), k.pause(k.repeatGap(seg)))); });
    return out;
  }
  function dictationLesson(unit, les, items) {
    const k = K(); k.reset(); const out = NI ? [] : intro(unit, les); out.push(k.say("Listen, keep the sentence in your head, then check.", "en", { show: { en: "Dictation", ar: "اسمع واحفظ ثم تحقق" } }));
    items.forEach((it) => { k.grp(); out.push(k.say(it.text, "en", { rate: 0.95, show: { en: "🎧 Listen…", ar: "" }, lbl: "LISTEN" }), k.pause(3500, "Say it in your head"), k.say(it.text, "en", { rate: 0.8, show: { en: it.text, ar: "" }, lbl: "CHECK" }), k.cue("Repeat · كرر"), k.pause(wc(it.text) * 450 + 1200)); });
    return out;
  }
  function lectureLesson(unit, les, items) {
    const k = K(); k.reset(); const out = NI ? [] : intro(unit, les);
    items.forEach((it) => { k.grp(); out.push(k.say("Lecture: " + it.title, "en", { show: { en: it.title, ar: "" }, lbl: "LECTURE" }), k.say(it.transcript, "en", { rate: 0.95, show: { en: "🎧 " + it.title, ar: "" } }), k.cue("Your turn · دورك"), k.pause(9000, "Say the main idea"), k.say("Model summary.", "en", { show: { en: "Model summary", ar: "" } }), k.say(it.model, "en", { rate: 0.95, show: { en: it.model, ar: it.ar || "" }, lbl: "MODEL" }), it.ar ? k.say(it.ar, "ar", { show: { en: it.title, ar: it.ar } }) : k.pause(100), k.pause(900)); });
    return out;
  }
  function strategyLesson(unit, les, t) {
    const k = K(); k.reset(); const out = NI ? [] : intro(unit, les);
    out.push(k.say(t.what, "en", { show: { en: t.name, ar: t.nameAr }, lbl: "WHAT IT IS" }), k.say(t.whatAr, "ar", { show: { en: t.name, ar: t.nameAr } }), k.pause(500));
    out.push(k.say("Scoring. " + t.scoring, "en", { show: { en: "Scoring", ar: "التصحيح" }, lbl: "SCORING" }), k.say(t.scoringAr, "ar", { show: { en: "Scoring", ar: t.scoringAr } }), k.pause(600));
    (t.steps || []).forEach((s, i) => { k.grp(); out.push(k.say("Step " + (i + 1) + ". " + s, "en", { show: { en: s, ar: (t.stepsAr || [])[i] || "" }, lbl: "STEP " + (i + 1) }), (t.stepsAr || [])[i] ? k.say(t.stepsAr[i], "ar", { show: { en: s, ar: t.stepsAr[i] } }) : k.pause(100), k.pause(500)); });
    (t.tips || []).forEach((s, i) => { k.grp(); out.push(k.say("Tip. " + s, "en", { show: { en: s, ar: (t.tipsAr || [])[i] || "" }, lbl: "TIP" }), (t.tipsAr || [])[i] ? k.say(t.tipsAr[i], "ar", { show: { en: s, ar: t.tipsAr[i] } }) : k.pause(100), k.pause(400)); });
    (t.mistakes || []).forEach((s, i) => { k.grp(); out.push(k.say("Avoid. " + s, "en", { show: { en: s, ar: (t.mistakesAr || [])[i] || "" }, lbl: "AVOID" }), (t.mistakesAr || [])[i] ? k.say(t.mistakesAr[i], "ar", { show: { en: s, ar: t.mistakesAr[i] } }) : k.pause(100), k.pause(400)); });
    if (t.template) { k.grp(); const parts = String(t.template).replace(/\[[^\]]*\]/g, "blank").split(/(?<=[.!?])\s+/).filter(Boolean); out.push(k.say("Template. Repeat each sentence.", "en", { show: { en: "Template", ar: "القالب" }, lbl: "TEMPLATE" })); parts.forEach((p) => out.push(k.say(p, "en", { rate: 0.9, show: { en: p, ar: "" } }), k.cue("Repeat · كرر"), k.pause(k.repeatGap(p)))); }
    k.grp(); out.push(k.say("Daily drill. " + t.drill, "en", { show: { en: t.drill, ar: t.drillAr || "" }, lbl: "DAILY DRILL" }), t.drillAr ? k.say(t.drillAr, "ar", { show: { en: t.drill, ar: t.drillAr } }) : k.pause(100));
    return out;
  }
  function structureLesson(unit, les) {
    const k = K(); k.reset(); const S = PTE.D.strategies || {}; const out = NI ? [] : intro(unit, les);
    (S.structure || []).forEach((p) => { k.grp(); out.push(k.say(p.part + ". About " + p.min + " minutes. " + p.items, "en", { show: { en: p.part, ar: "" }, lbl: "TEST PARTS" }), k.say(p.en, "en", { show: { en: p.part, ar: p.ar } }), k.say(p.ar, "ar", { show: { en: p.part, ar: p.ar } }), k.pause(600)); });
    if (S.scoring && S.scoring.overview) { k.grp(); out.push(k.say(S.scoring.overview.en, "en", { show: { en: "Scoring overview", ar: S.scoring.overview.ar }, lbl: "SCORING" }), k.say(S.scoring.overview.ar, "ar", { show: { en: "Scoring overview", ar: S.scoring.overview.ar } })); }
    (S.scoring && S.scoring.enabling || []).forEach((e) => { k.grp(); out.push(k.say(e.skill + ". " + e.en, "en", { show: { en: e.skill, ar: e.ar }, lbl: "ENABLING SKILL" }), k.say(e.ar, "ar", { show: { en: e.skill, ar: e.ar } }), k.pause(400)); });
    return out;
  }
  function mindsetLesson(unit, les, arr, label) {
    const k = K(); k.reset(); const out = NI ? [] : intro(unit, les);
    arr.forEach((m) => { k.grp(); out.push(k.say(m.en, "en", { show: { en: m.en, ar: m.ar }, lbl: label }), k.say(m.ar, "ar", { show: { en: m.en, ar: m.ar } }), k.pause(500)); });
    return out;
  }
  function templatesLesson(unit, les, key) {
    const k = K(); k.reset(); const T = (PTE.D.strategies || {}).templates || {}; const out = NI ? [] : intro(unit, les); const rep = (txt) => String(txt).replace(/\[[^\]]*\]/g, "blank").split(/(?<=[.!?])\s+/).filter(Boolean);
    const addTpl = (title, txt) => { k.grp(); out.push(k.say(title, "en", { show: { en: title, ar: "" }, lbl: "TEMPLATE" })); rep(txt).forEach((p) => out.push(k.say(p, "en", { rate: 0.9, show: { en: p, ar: "" } }), k.cue("Repeat · كرر"), k.pause(k.repeatGap(p)))); };
    if (key === "di") (T.di || []).forEach((d) => { addTpl("Describe Image: " + d.kind, d.template); k.grp(); out.push(k.say("Example.", "en", { show: { en: "Example", ar: "" } }), k.say(d.example, "en", { rate: 0.92, show: { en: d.example, ar: "" } }), k.pause(700)); });
    if (key === "rl" && T.rl) { addTpl("Re-tell Lecture", T.rl.template); k.grp(); out.push(k.say(T.rl.example, "en", { rate: 0.92, show: { en: T.rl.example, ar: "" }, lbl: "EXAMPLE" })); }
    if (key === "essay" && T.essay) { k.grp(); out.push(k.say(T.essay.structure, "en", { show: { en: "Essay structure", ar: "" }, lbl: "STRUCTURE" })); ["intro", "conclusion", "linking"].forEach((n) => (T.essay[n] || []).slice(0, 4).forEach((x) => { k.grp(); out.push(k.say(cap(n) + ": " + x, "en", { rate: 0.9, show: { en: x, ar: "" }, lbl: n.toUpperCase() }), k.cue("Repeat · كرر"), k.pause(k.repeatGap(x))); })); }
    if (key === "swt" && T.swt) { k.grp(); out.push(k.say(T.swt.method, "en", { show: { en: "Summarize Written Text", ar: "" }, lbl: "METHOD" })); (T.swt.frames || []).forEach((f) => { k.grp(); out.push(k.say(f, "en", { rate: 0.9, show: { en: f, ar: "" } }), k.cue("Repeat · كرر"), k.pause(k.repeatGap(f))); }); if (T.swt.example) out.push(k.say(T.swt.example, "en", { rate: 0.92, show: { en: T.swt.example, ar: "" }, lbl: "EXAMPLE" })); }
    if (key === "sst" && T.sst) { addTpl("Summarize Spoken Text", T.sst.template); if (T.sst.example) { k.grp(); out.push(k.say(T.sst.example, "en", { rate: 0.92, show: { en: T.sst.example, ar: "" }, lbl: "EXAMPLE" })); } }
    return out;
  }
  function storyLesson(unit, les, st) {
    const k = K(); k.reset(); const out = NI ? [] : intro(unit, les);
    st.story.forEach((s, i) => { k.grp(); out.push(k.say(s, "en", { show: { en: s, ar: st.storyAr[i] } }), k.pause(500), k.say(st.storyAr[i], "ar", { show: { en: s, ar: st.storyAr[i] } }), k.pause(700)); });
    k.grp(); out.push(k.say("Riddle: " + st.riddle.clue, "en", { show: { en: "🧩 " + st.riddle.clue, ar: "لغز المحطة" }, lbl: "RIDDLE" }), k.pause(8000, "Think…"), k.say("The answer is: " + st.riddle.answer, "en", { show: { en: "✔ " + st.riddle.answer, ar: "" } }));
    return out;
  }

  /* ---------- extra builders ---------- */
  function grammarReview(unit, les, g, offset) {
    const k = K(); k.reset(); const out = NI ? [] : intro(unit, les);
    out.push(k.say("Quick grammar review: " + g.title, "en", { show: { en: g.title, ar: g.titleAr }, lbl: "REVIEW" }), k.say("مراجعة سريعة: " + g.titleAr, "ar", { show: { en: g.title, ar: g.titleAr } }));
    g.examples.slice(0, 3).forEach((e) => { k.grp(); out.push(k.say(e.en, "en", { show: { en: e.en, ar: e.ar }, lbl: "EXAMPLE" }), k.cue("Repeat · كرر"), k.pause(k.repeatGap(e.en)), k.say(e.ar, "ar", { show: { en: e.en, ar: e.ar } })); });
    const mcq = g.exercises.filter((x) => x.type === "mcq"); const qs = mcq.length ? Array.from({ length: Math.min(6, mcq.length) }, (_, i) => mcq[(offset * 3 + i) % mcq.length]) : [];
    k.grp(); out.push(k.say("Oral quiz. Choose A, B, C or D in your head.", "en", { show: { en: "Oral quiz", ar: "اختبار شفهي" } }));
    qs.forEach((q) => { k.grp(); const L = ["A", "B", "C", "D"]; out.push(k.say(q.q.replace(/_+/g, "blank"), "en", { show: { en: q.q, ar: "" }, lbl: "QUESTION" })); q.options.forEach((o, i) => out.push(k.say(L[i] + ". " + o, "en", { show: { en: L[i] + ". " + o, ar: "" } }), k.pause(250))); out.push(k.cue("Answer · أجب"), k.pause(4500), k.say("The answer is " + L[q.answer] + ". " + q.options[q.answer], "en", { show: { en: "✔ " + L[q.answer] + ". " + q.options[q.answer], ar: q.whyAr || "" }, lbl: "ANSWER" }), k.say(q.whyAr || q.why, q.whyAr ? "ar" : "en", { show: { en: "✔ " + q.options[q.answer], ar: q.whyAr || "" } }), k.pause(500)); });
    return out;
  }
  function twistersLesson(unit, les, items, tips) {
    const k = K(); k.reset(); const out = NI ? [] : intro(unit, les);
    items.forEach((t) => { k.grp(); out.push(k.say("Tongue twister. Focus: " + t.focus, "en", { show: { en: t.text, ar: "" }, lbl: "TWISTER" }), k.say(t.text, "en", { rate: 0.7, show: { en: t.text, ar: "" } }), k.cue("Repeat slowly · ببطء"), k.pause(k.repeatGap(t.text) + 1500), k.say(t.text, "en", { rate: 1, show: { en: t.text, ar: "" } }), k.cue("Now faster · أسرع"), k.pause(k.repeatGap(t.text))); });
    (tips || []).forEach((t) => { k.grp(); out.push(k.say(t, /[؀-ۿ]/.test(t) ? "ar" : "en", { show: { en: t, ar: "" }, lbl: "TIP" }), k.pause(500)); });
    return out;
  }
  function recapLesson(unit, les, words, asq) {
    const k = K(); k.reset(); const out = NI ? [] : intro(unit, les);
    out.push(k.say("Unit review. Say each meaning before you hear it.", "en", { show: { en: "Unit review", ar: "مراجعة الوحدة" } }));
    words.forEach((w) => { k.grp(); out.push(k.say(w.en, "en", { rate: 0.85, show: { en: w.en, ar: "؟" }, lbl: "RECALL", learn: w.id }), k.cue("Meaning · المعنى"), k.pause(2600), k.say(w.ar, "ar", { show: { en: w.en, ar: w.ar } }), k.pause(300)); });
    asq.forEach((it) => { k.grp(); out.push(k.say(it.q, "en", { show: { en: it.q, ar: "" }, lbl: "QUESTION" }), k.cue("Answer · أجب"), k.pause(3200), k.say(it.a, "en", { show: { en: "✔ " + it.a, ar: "" }, lbl: "ANSWER" }), k.pause(400)); });
    k.grp(); out.push(k.say("Unit complete. Well done, Captain.", "en", { show: { en: "Unit complete 🎉", ar: "أنهيت الوحدة يا كابتن" } }));
    return out;
  }
  /* run several part-builders as ONE lesson (no per-part intro), then renumber groups so next/prev skip whole items */
  function composite(unit, les, parts) {
    K().reset(); const out = intro(unit, les); let pi = 0; const seen = {}; let next = 100;
    NI = true;
    try { parts.forEach((fn) => { pi++; const seg = fn(); seg.forEach((sg) => { const key = pi + ":" + sg.g; if (!(key in seen)) seen[key] = next++; sg.g = seen[key]; out.push(sg); }); }); } finally { NI = false; }
    return out;
  }
  const deal = (arr, n) => { const out = Array.from({ length: n }, () => []); arr.forEach((x, i) => out[Math.min(n - 1, Math.floor((i * n) / arr.length))].push(x)); return out; };
  const nice = (ws) => ws.slice(0, 3).map((w) => w.en).join(", ") + (ws.length > 3 ? "…" : "");

  /* ---------- the journey: 26 UNITS (one per station), each with the SAME 9 LESSONS ---------- */
  let cache = null;
  PTE.LESSON_ROLES = [
    ["story", "📖", "Episode", "الحلقة"], ["wordsA", "🧠", "Words A", "كلمات أ"], ["wordsB", "🧠", "Words B", "كلمات ب"],
    ["sounds", "🔊", "Sound Lab", "معمل الأصوات"], ["grammar", "📘", "Grammar", "القواعد"], ["speaking", "🎤", "Speaking Gym", "صالة المحادثة"],
    ["listening", "🎧", "Listening Lab", "معمل الاستماع"], ["strategy", "🧭", "Exam Strategy", "استراتيجية الامتحان"], ["review", "🏁", "Unit Review", "مراجعة الوحدة"]
  ];
  PTE.driveUnits = function () {
    if (cache) return cache;
    const D = PTE.D, P = D.phonetics || {}, N = (D.stations || []).length || 26, units = [];
    const bs = D.bankSpeaking || {}, bl = D.bankLW || {}, S = D.strategies || {};

    /* vocabulary: station topic first, then fill sequentially — every word used once */
    const all = (D.vocabA || []).concat(D.vocabB || []); const used = {}; const wordsOf = [];
    (D.stations || []).forEach((st, i) => {
      const left = N - i, remaining = all.filter((w) => !used[w.id]); const take = Math.ceil(remaining.length / left);
      const key = (st.topic || "").slice(0, 4).toLowerCase(); const pref = key && key !== "mixe" ? remaining.filter((w) => (w.topic || "").toLowerCase().indexOf(key) === 0) : [];
      const pick = pref.slice(0, take); remaining.forEach((w) => { if (pick.length < take && pick.indexOf(w) < 0) pick.push(w); });
      pick.forEach((w) => (used[w.id] = true)); wordsOf.push(pick);
    });
    /* sound plan aligned with the plan phases */
    const V = P.vowels || [], DP = P.diphthongs || [], C = P.consonants || [];
    const soundsPlan = [V.slice(0, 6), V.slice(6, 12), DP, C.slice(0, 12), C.slice(12), [], ...Array(N - 6).fill([])];
    const traps = deal(P.arabicTraps || [], 17), trapAt = {}; (P.arabicTraps || []).forEach((t, i) => { const u = 3 + Math.floor((i * 17) / (P.arabicTraps.length || 1)); (trapAt[u] = trapAt[u] || []).push(t); });
    const pairAt = {}; (P.minimalPairs || []).forEach((g, i) => { const u = 1 + Math.floor((i * 22) / (P.minimalPairs.length || 1)); (pairAt[u] = pairAt[u] || []).push(g); });
    const twAt = deal(P.tongueTwisters || [], 4);
    /* banks dealt evenly over the units */
    const rsD = deal(bs.rs || [], N), raD = deal(bs.ra || [], N), asqD = deal(bs.asq || [], N), wfdD = deal(bl.wfd || [], N);
    const lecD = deal(bl.sst || [], 20);
    /* strategy items in a sensible order */
    const order = ["intro", "ra", "rs", "di", "rl", "asq", "wfd", "sst", "hcs", "smw", "mcl", "mcls", "fibl", "hiw", "swt", "essay", "rfib", "dfib", "ro", "mcr", "mcs"];
    const strat = [{ en: "How the PTE test is built and scored", ar: "هيكل الامتحان وطريقة التصحيح", fn: (u, l) => structureLesson(u, l) }];
    order.forEach((id) => { const t = (S.tasks || []).find((x) => x.id === id); if (t) strat.push({ en: t.name + " — method", ar: t.nameAr + " — الطريقة", fn: (u, l) => strategyLesson(u, l, t) }); });
    [["di", "Describe Image templates", "قوالب وصف الصورة"], ["rl", "Re-tell Lecture template", "قالب إعادة المحاضرة"], ["swt", "Summarize Written Text frames", "قوالب التلخيص"], ["sst", "Summarize Spoken Text template", "قالب تلخيص المسموع"], ["essay", "Essay sentence frames", "جمل المقال"]].forEach((x) => strat.push({ en: x[1], ar: x[2], fn: (u, l) => templatesLesson(u, l, x[0]) }));
    strat.push({ en: "Common mistakes of Arabic speakers", ar: "أخطاء شائعة للمتحدثين بالعربية", fn: (u, l) => mindsetLesson(u, l, S.mistakes || [], "MISTAKE") }, { en: "Exam-day checklist", ar: "قائمة يوم الامتحان", fn: (u, l) => mindsetLesson(u, l, S.examDay || [], "CHECK") }, { en: "Confidence & mindset", ar: "الثقة والعقلية", fn: (u, l) => mindsetLesson(u, l, S.mindset || [], "MINDSET") });
    const stratD = deal(strat, N);
    /* grammar: full lesson on first appearance of a unit id, quick review afterwards */
    const gSeen = {};

    (D.stations || []).forEach((st, i) => {
      const n = i + 1, pad = String(n).padStart(2, "0"); const ph = D.phases[st.phase - 1];
      const unit = { id: "u" + pad, n, phase: st.phase, icon: ["🛠️", "🚉", "🚄", "🏁"][st.phase - 1], en: st.en, ar: st.ar, desc: st.focus.split(" / ")[0], focusAr: st.focus.split(" / ")[1] || "", phaseEn: ph.en, lessons: [] };
      const ws = wordsOf[i], half = Math.ceil(ws.length / 2), wa = ws.slice(0, half), wb = ws.slice(half);
      const add = (role, en, ar, build) => { const r = PTE.LESSON_ROLES.find((x) => x[0] === role); const no = unit.lessons.length + 1; const les = { id: unit.id + "-" + no, no, role, icon: r[1], roleEn: r[2], en: r[2] + ": " + en, ar: r[3] + ": " + ar }; les.build = () => build(unit, les); unit.lessons.push(les); };
      unit.title = "Unit " + n + " · " + st.en; unit.titleAr = "الوحدة " + n + " · " + st.ar;

      add("story", st.en, st.ar, (u, l) => storyLesson(u, l, st));
      add("wordsA", nice(wa), "كلمات الوحدة", (u, l) => wordsLesson(u, l, wa));
      add("wordsB", nice(wb), "كلمات الوحدة", (u, l) => wordsLesson(u, l, wb));

      const snd = soundsPlan[i] || [], trp = trapAt[n] || [], prs = pairAt[n] || [], tw = i >= 22 ? twAt[i - 22] || [] : [];
      const sTitle = n === 6 ? "Rhythm, sense groups & linking" : (snd.length ? snd.map((x) => "/" + x.ipa + "/").slice(0, 6).join(" ") + (n === 5 ? " + stress" : "") : "") || (trp[0] ? trp[0].title : prs[0] ? prs[0].sounds : tw.length ? "tongue twisters" : "review");
      add("sounds", sTitle, snd.length ? "الأصوات والنطق" : trp[0] ? trp[0].titleAr : "النطق والإيقاع", (u, l) => composite(u, l, [
        () => (snd.length || trp.length) ? soundsLesson(u, l, snd, trp) : [],
        () => (n === 5 ? stressLesson(u, l) : n === 6 ? rhythmLesson(u, l) : []),
        () => (prs.length ? pairsLesson(u, l, prs) : []),
        () => (tw.length ? twistersLesson(u, l, tw, i === 25 ? (P.readAloudTips || []).slice(0, 6) : []) : [])
      ].filter(Boolean)));

      const g = (D.grammar || []).find((x) => x.id === st.grammar) || (D.grammar || [])[0];
      if (g && !gSeen[g.id]) { gSeen[g.id] = 1; add("grammar", g.title, g.titleAr, (u, l) => grammarLesson(u, l, g)); }
      else if (g) add("grammar", "review · " + g.title, "مراجعة · " + g.titleAr, (u, l) => grammarReview(u, l, g, n));

      const rs = rsD[i], ra = raD[i], asq = asqD[i];
      add("speaking", "Repeat · Read · Answer", "إعادة وقراءة وإجابة", (u, l) => composite(u, l, [() => rsLesson(u, l, rs), () => raLesson(u, l, ra), () => asqLesson(u, l, asq)]));

      const wf = wfD(i); const lec = i < 20 ? lecD[i] : [];
      add("listening", "Dictation" + (lec.length ? " + lecture" : ""), "إملاء" + (lec.length ? " ومحاضرة" : ""), (u, l) => composite(u, l, [() => dictationLesson(u, l, wf), () => (lec.length ? lectureLesson(u, l, lec) : [])]));

      const sd = stratD[i];
      add("strategy", sd.length ? sd[0].en + (sd.length > 1 ? " + " + (sd.length - 1) : "") : "review", sd.length ? sd[0].ar : "مراجعة", (u, l) => sd.length ? composite(u, l, sd.map((x) => () => x.fn(u, l))) : intro(u, l));

      add("review", "words & quick quiz", "الكلمات واختبار سريع", (u, l) => recapLesson(u, l, ws.slice(0, 14), (asqD[(i + 7) % N] || []).slice(0, 4)));
      units.push(unit);
    });
    function wfD(i) { return wfdD[i]; }
    cache = units; return units;
  };
  PTE.driveEst = function (les) { try { const seg = les.build(); let sec = 0; seg.forEach((s) => { if (s.t === "say") sec += s.text.split(/\s+/).length / 2.4; else if (s.t === "pause") sec += s.ms / 1000; else if (s.t === "beep") sec += 0.4; }); return Math.max(1, Math.round(sec / 60)); } catch (e) { return 5; } };
})();

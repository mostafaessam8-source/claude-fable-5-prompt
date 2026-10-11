/* DRIVE MODE curriculum: named UNITS made of numbered, named, fixed LESSONS (same lesson = same script every time).
   Each lesson: { id, no, en, ar, build() -> segments }.  Built lazily from the data files. */
(function () {
  "use strict";
  const PTE = window.PTE;
  const K = () => PTE.driveKit;
  const wc = (t) => PTE.countWords(t);
  const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
  const TOPIC_AR = { language: "اللغة", education: "التعليم", work: "العمل", emotions: "المشاعر", environment: "البيئة", science: "العلوم", health: "الصحة", "business & marketing": "الأعمال والتسويق", "economics & finance": "الاقتصاد والمال", "technology & AI": "التقنية والذكاء الاصطناعي", "society & culture": "المجتمع والثقافة", "psychology & social behaviour": "علم النفس والسلوك", "zoology & animals": "الحيوان", "art, architecture & design": "الفن والعمارة والتصميم", "history & geography": "التاريخ والجغرافيا", "media & communication": "الإعلام والتواصل", "law, government & politics": "القانون والحكم والسياسة" };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const intro = (unit, les) => { const k = K(); return [k.say(unit.en + ". Lesson " + les.no + ": " + les.en, "en", { show: { en: les.en, ar: les.ar }, lbl: unit.en.toUpperCase() + " · " + les.no }), k.say("الدرس " + les.no + ": " + les.ar, "ar", { show: { en: les.en, ar: les.ar } }), k.pause(500)]; };

  /* ---------- builders ---------- */
  function wordsLesson(unit, les, words) {
    const k = K(); k.reset(); const out = intro(unit, les);
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
    const k = K(); k.reset(); const out = intro(unit, les);
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
    const k = K(); k.reset(); const out = intro(unit, les);
    groups.forEach((g) => { k.grp(); out.push(k.say("Minimal pairs: " + g.sounds.replace("/", "versus"), "en", { show: { en: g.sounds, ar: "أزواج الأصوات" }, lbl: "PAIRS" }));
      g.pairs.slice(0, 6).forEach((p) => out.push(k.say(p[0], "en", { rate: 0.7, show: { en: p[0] + "  /  " + p[1], ar: "" } }), k.pause(500), k.say(p[1], "en", { rate: 0.7, show: { en: p[0] + "  /  " + p[1], ar: "" } }), k.cue("Say both · قلهما"), k.pause(2600))); });
    return out;
  }
  function stressLesson(unit, les) {
    const k = K(); k.reset(); const P = PTE.D.phonetics || {}; const out = intro(unit, les);
    (P.wordStress || []).slice(0, 5).forEach((r) => { k.grp(); out.push(k.say(r.rule, "en", { show: { en: r.rule, ar: r.ruleAr }, lbl: "RULE" }), k.say(r.ruleAr, "ar", { show: { en: r.rule, ar: r.ruleAr } })); (r.examples || []).slice(0, 4).forEach((e) => out.push(k.say(e.w, "en", { rate: 0.75, show: { en: e.stress, ar: "" } }), k.cue("Repeat · كرر"), k.pause(1800))); });
    (P.sentenceStress || []).slice(0, 5).forEach((s) => { k.grp(); out.push(k.say(s.sentence, "en", { rate: 0.85, show: { en: s.marked, ar: s.note }, lbl: "SENTENCE STRESS" }), k.cue("Repeat · كرر"), k.pause(k.repeatGap(s.sentence)), k.say(s.note, "ar", { show: { en: s.marked, ar: s.note } })); });
    return out;
  }
  function rhythmLesson(unit, les) {
    const k = K(); k.reset(); const P = PTE.D.phonetics || {}; const out = intro(unit, les);
    (P.senseGroups || []).slice(0, 8).forEach((s) => { k.grp(); out.push(k.say("Read in groups.", "en", { show: { en: s.marked, ar: s.noteAr || "" }, lbl: "SENSE GROUPS" })); s.marked.split("//").map((x) => x.trim()).filter(Boolean).forEach((g) => out.push(k.say(g, "en", { rate: 0.9, show: { en: s.marked, ar: "" } }), k.cue("Repeat · كرر"), k.pause(k.repeatGap(g)))); });
    (P.linking || []).slice(0, 4).forEach((l) => { k.grp(); out.push(k.say(l.rule, "en", { show: { en: l.rule, ar: l.ruleAr }, lbl: "LINKING" }), k.say(l.ruleAr, "ar", { show: { en: l.rule, ar: l.ruleAr } })); (l.examples || []).slice(0, 3).forEach((e) => out.push(k.say(e.text, "en", { rate: 0.85, show: { en: e.text, ar: e.linked } }), k.cue("Repeat · كرر"), k.pause(2200))); });
    return out;
  }
  function grammarLesson(unit, les, g) {
    const k = K(); k.reset(); const out = intro(unit, les);
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
    const k = K(); k.reset(); const out = intro(unit, les); out.push(k.say("Listen once, then repeat after the beep.", "en", { show: { en: "Repeat Sentence", ar: "استمع مرة ثم كرر" } }));
    items.forEach((it) => { k.grp(); out.push(k.say(it.text, "en", { rate: 0.95, show: { en: "🎧 Listen…", ar: "استمع" }, lbl: "LISTEN" }), k.cue("Repeat · كرر"), k.pause(Math.max(2500, wc(it.text) * 480 + 1500)), k.say("Model:", "en", { show: { en: it.text, ar: "" }, lbl: "MODEL" }), k.say(it.text, "en", { rate: 0.9, show: { en: it.text, ar: "" } }), k.pause(800)); });
    return out;
  }
  function asqLesson(unit, les, items) {
    const k = K(); k.reset(); const out = intro(unit, les); out.push(k.say("Answer out loud before you hear the answer.", "en", { show: { en: "Short answers", ar: "أجب بصوت عالٍ" } }));
    items.forEach((it) => { k.grp(); out.push(k.say(it.q, "en", { show: { en: it.q, ar: "" }, lbl: "QUESTION" }), k.cue("Answer · أجب"), k.pause(3500), k.say(it.a, "en", { show: { en: "✔ " + it.a, ar: "" }, lbl: "ANSWER" }), k.pause(500)); });
    return out;
  }
  function raLesson(unit, les, items) {
    const k = K(); k.reset(); const out = intro(unit, les); out.push(k.say("Read-along. I read one sense group, you repeat it with the same rhythm.", "en", { show: { en: "Read Aloud · read-along", ar: "أقرأ مجموعة وتكررها بنفس الإيقاع" } }));
    items.forEach((it) => { k.grp(); out.push(k.say("Passage about " + (it.topic || "a topic"), "en", { show: { en: "Passage: " + (it.topic || ""), ar: "" }, lbl: "READ ALOUD" })); it.text.split(/(?<=[,.;])\s+/).filter(Boolean).forEach((seg) => out.push(k.say(seg, "en", { rate: 0.92, show: { en: seg, ar: "" } }), k.cue("Repeat · كرر"), k.pause(k.repeatGap(seg)))); });
    return out;
  }
  function dictationLesson(unit, les, items) {
    const k = K(); k.reset(); const out = intro(unit, les); out.push(k.say("Listen, keep the sentence in your head, then check.", "en", { show: { en: "Dictation", ar: "اسمع واحفظ ثم تحقق" } }));
    items.forEach((it) => { k.grp(); out.push(k.say(it.text, "en", { rate: 0.95, show: { en: "🎧 Listen…", ar: "" }, lbl: "LISTEN" }), k.pause(3500, "Say it in your head"), k.say(it.text, "en", { rate: 0.8, show: { en: it.text, ar: "" }, lbl: "CHECK" }), k.cue("Repeat · كرر"), k.pause(wc(it.text) * 450 + 1200)); });
    return out;
  }
  function lectureLesson(unit, les, items) {
    const k = K(); k.reset(); const out = intro(unit, les);
    items.forEach((it) => { k.grp(); out.push(k.say("Lecture: " + it.title, "en", { show: { en: it.title, ar: "" }, lbl: "LECTURE" }), k.say(it.transcript, "en", { rate: 0.95, show: { en: "🎧 " + it.title, ar: "" } }), k.cue("Your turn · دورك"), k.pause(9000, "Say the main idea"), k.say("Model summary.", "en", { show: { en: "Model summary", ar: "" } }), k.say(it.model, "en", { rate: 0.95, show: { en: it.model, ar: it.ar || "" }, lbl: "MODEL" }), it.ar ? k.say(it.ar, "ar", { show: { en: it.title, ar: it.ar } }) : k.pause(100), k.pause(900)); });
    return out;
  }
  function strategyLesson(unit, les, t) {
    const k = K(); k.reset(); const out = intro(unit, les);
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
    const k = K(); k.reset(); const S = PTE.D.strategies || {}; const out = intro(unit, les);
    (S.structure || []).forEach((p) => { k.grp(); out.push(k.say(p.part + ". About " + p.min + " minutes. " + p.items, "en", { show: { en: p.part, ar: "" }, lbl: "TEST PARTS" }), k.say(p.en, "en", { show: { en: p.part, ar: p.ar } }), k.say(p.ar, "ar", { show: { en: p.part, ar: p.ar } }), k.pause(600)); });
    if (S.scoring && S.scoring.overview) { k.grp(); out.push(k.say(S.scoring.overview.en, "en", { show: { en: "Scoring overview", ar: S.scoring.overview.ar }, lbl: "SCORING" }), k.say(S.scoring.overview.ar, "ar", { show: { en: "Scoring overview", ar: S.scoring.overview.ar } })); }
    (S.scoring && S.scoring.enabling || []).forEach((e) => { k.grp(); out.push(k.say(e.skill + ". " + e.en, "en", { show: { en: e.skill, ar: e.ar }, lbl: "ENABLING SKILL" }), k.say(e.ar, "ar", { show: { en: e.skill, ar: e.ar } }), k.pause(400)); });
    return out;
  }
  function mindsetLesson(unit, les, arr, label) {
    const k = K(); k.reset(); const out = intro(unit, les);
    arr.forEach((m) => { k.grp(); out.push(k.say(m.en, "en", { show: { en: m.en, ar: m.ar }, lbl: label }), k.say(m.ar, "ar", { show: { en: m.en, ar: m.ar } }), k.pause(500)); });
    return out;
  }
  function templatesLesson(unit, les, key) {
    const k = K(); k.reset(); const T = (PTE.D.strategies || {}).templates || {}; const out = intro(unit, les); const rep = (txt) => String(txt).replace(/\[[^\]]*\]/g, "blank").split(/(?<=[.!?])\s+/).filter(Boolean);
    const addTpl = (title, txt) => { k.grp(); out.push(k.say(title, "en", { show: { en: title, ar: "" }, lbl: "TEMPLATE" })); rep(txt).forEach((p) => out.push(k.say(p, "en", { rate: 0.9, show: { en: p, ar: "" } }), k.cue("Repeat · كرر"), k.pause(k.repeatGap(p)))); };
    if (key === "di") (T.di || []).forEach((d) => { addTpl("Describe Image: " + d.kind, d.template); k.grp(); out.push(k.say("Example.", "en", { show: { en: "Example", ar: "" } }), k.say(d.example, "en", { rate: 0.92, show: { en: d.example, ar: "" } }), k.pause(700)); });
    if (key === "rl" && T.rl) { addTpl("Re-tell Lecture", T.rl.template); k.grp(); out.push(k.say(T.rl.example, "en", { rate: 0.92, show: { en: T.rl.example, ar: "" }, lbl: "EXAMPLE" })); }
    if (key === "essay" && T.essay) { k.grp(); out.push(k.say(T.essay.structure, "en", { show: { en: "Essay structure", ar: "" }, lbl: "STRUCTURE" })); ["intro", "conclusion", "linking"].forEach((n) => (T.essay[n] || []).slice(0, 4).forEach((x) => { k.grp(); out.push(k.say(cap(n) + ": " + x, "en", { rate: 0.9, show: { en: x, ar: "" }, lbl: n.toUpperCase() }), k.cue("Repeat · كرر"), k.pause(k.repeatGap(x))); })); }
    if (key === "swt" && T.swt) { k.grp(); out.push(k.say(T.swt.method, "en", { show: { en: "Summarize Written Text", ar: "" }, lbl: "METHOD" })); (T.swt.frames || []).forEach((f) => { k.grp(); out.push(k.say(f, "en", { rate: 0.9, show: { en: f, ar: "" } }), k.cue("Repeat · كرر"), k.pause(k.repeatGap(f))); }); if (T.swt.example) out.push(k.say(T.swt.example, "en", { rate: 0.92, show: { en: T.swt.example, ar: "" }, lbl: "EXAMPLE" })); }
    if (key === "sst" && T.sst) { addTpl("Summarize Spoken Text", T.sst.template); if (T.sst.example) { k.grp(); out.push(k.say(T.sst.example, "en", { rate: 0.92, show: { en: T.sst.example, ar: "" }, lbl: "EXAMPLE" })); } }
    return out;
  }
  function storyLesson(unit, les, st) {
    const k = K(); k.reset(); const out = intro(unit, les);
    st.story.forEach((s, i) => { k.grp(); out.push(k.say(s, "en", { show: { en: s, ar: st.storyAr[i] } }), k.pause(500), k.say(st.storyAr[i], "ar", { show: { en: s, ar: st.storyAr[i] } }), k.pause(700)); });
    k.grp(); out.push(k.say("Riddle: " + st.riddle.clue, "en", { show: { en: "🧩 " + st.riddle.clue, ar: "لغز المحطة" }, lbl: "RIDDLE" }), k.pause(8000, "Think…"), k.say("The answer is: " + st.riddle.answer, "en", { show: { en: "✔ " + st.riddle.answer, ar: "" } }));
    return out;
  }

  /* ---------- the curriculum ---------- */
  let cache = null;
  PTE.driveUnits = function () {
    if (cache) return cache;
    const D = PTE.D, P = D.phonetics || {}, units = []; const U = (o) => { o.lessons = []; units.push(o); return o; }; const L = (u, en, ar, build) => { const no = u.lessons.length + 1; const les = { id: u.id + "-" + no, no, en, ar }; les.build = () => build(u, les); u.lessons.push(les); };

    const u0 = U({ id: "strategy", icon: "🧭", en: "Exam Strategy Academy", ar: "أكاديمية استراتيجية الامتحان", desc: "How the test works and how to score on every task — start here." });
    L(u0, "How the PTE test is built and scored", "هيكل الامتحان وطريقة التصحيح", (u, l) => structureLesson(u, l));
    const order = ["intro", "ra", "rs", "di", "rl", "asq", "wfd", "sst", "hcs", "smw", "mcl", "mcls", "fibl", "hiw", "swt", "essay", "rfib", "dfib", "ro", "mcr", "mcs"];
    const tasks = (D.strategies && D.strategies.tasks) || []; order.forEach((id) => { const t = tasks.find((x) => x.id === id); if (t) L(u0, t.name + " — method & tips", t.nameAr + " — الطريقة والنصائح", (u, l) => strategyLesson(u, l, t)); });
    L(u0, "Common mistakes of Arabic speakers", "أخطاء شائعة للمتحدثين بالعربية", (u, l) => mindsetLesson(u, l, (D.strategies && D.strategies.mistakes) || [], "MISTAKE"));
    L(u0, "Exam-day checklist", "قائمة يوم الامتحان", (u, l) => mindsetLesson(u, l, (D.strategies && D.strategies.examDay) || [], "CHECK"));
    L(u0, "Confidence & mindset", "الثقة والعقلية", (u, l) => mindsetLesson(u, l, (D.strategies && D.strategies.mindset) || [], "MINDSET"));

    const u1 = U({ id: "sounds", icon: "🔊", en: "Sound Foundations", ar: "أساسيات الصوتيات", desc: "Vowels, diphthongs, consonants, Arabic-speaker traps, stress and rhythm." });
    chunk(P.vowels || [], 3).forEach((c, i) => L(u1, "Vowels " + (i + 1) + ": " + c.map((s) => "/" + s.ipa + "/").join("  "), "الحروف المتحركة " + (i + 1), (u, l) => soundsLesson(u, l, c)));
    chunk(P.diphthongs || [], 4).forEach((c, i) => L(u1, "Diphthongs " + (i + 1) + ": " + c.map((s) => "/" + s.ipa + "/").join("  "), "الأصوات المركبة " + (i + 1), (u, l) => soundsLesson(u, l, c)));
    chunk(P.consonants || [], 4).forEach((c, i) => L(u1, "Consonants " + (i + 1) + ": " + c.map((s) => "/" + s.ipa + "/").join("  "), "الحروف الساكنة " + (i + 1), (u, l) => soundsLesson(u, l, c)));
    chunk(P.arabicTraps || [], 3).forEach((c, i) => L(u1, "Arabic-speaker traps " + (i + 1) + ": " + c.map((t) => t.title).join(" · "), "فخاخ المتحدث العربي " + (i + 1), (u, l) => soundsLesson(u, l, [], c)));
    chunk(P.minimalPairs || [], 3).forEach((c, i) => L(u1, "Minimal pairs " + (i + 1) + ": " + c.map((g) => g.sounds).join(" · "), "أزواج الأصوات " + (i + 1), (u, l) => pairsLesson(u, l, c)));
    L(u1, "Word stress & sentence stress", "النبر على الكلمة والجملة", (u, l) => stressLesson(u, l));
    L(u1, "Sense groups, linking & rhythm", "مجموعات المعنى والربط والإيقاع", (u, l) => rhythmLesson(u, l));

    const u2 = U({ id: "words", icon: "🧠", en: "Word Express", ar: "قطار الكلمات", desc: "600 academic words by topic — listen, repeat, recap. 10 words per lesson." });
    const all = (D.vocabA || []).concat(D.vocabB || []); const topics = []; all.forEach((w) => { if (topics.indexOf(w.topic) < 0) topics.push(w.topic); });
    topics.forEach((tp) => chunk(all.filter((w) => w.topic === tp), 10).forEach((c, i) => L(u2, cap(tp) + " — part " + (i + 1), "كلمات " + (TOPIC_AR[tp] || tp) + " — الجزء " + (i + 1), (u, l) => wordsLesson(u, l, c))));

    const u3 = U({ id: "grammar", icon: "📘", en: "Grammar Radio", ar: "إذاعة القواعد", desc: "16 grammar units explained in Arabic with examples and an oral quiz." });
    (D.grammar || []).forEach((g) => L(u3, g.title, g.titleAr, (u, l) => grammarLesson(u, l, g)));

    const u4 = U({ id: "speaking", icon: "🎤", en: "Speaking Gym", ar: "صالة المحادثة", desc: "Repeat Sentence, Read Aloud read-alongs and short answers." });
    const bs = D.bankSpeaking || {};
    chunk(bs.rs || [], 10).forEach((c, i) => L(u4, "Repeat Sentence " + (i + 1), "إعادة الجملة " + (i + 1), (u, l) => rsLesson(u, l, c)));
    chunk(bs.ra || [], 4).forEach((c, i) => L(u4, "Read Aloud read-along " + (i + 1), "قراءة بصوت عالٍ " + (i + 1), (u, l) => raLesson(u, l, c)));
    chunk(bs.asq || [], 20).forEach((c, i) => L(u4, "Short Answer Quiz " + (i + 1), "اختبار الإجابة القصيرة " + (i + 1), (u, l) => asqLesson(u, l, c)));

    const u5 = U({ id: "listening", icon: "🎧", en: "Listening Lab", ar: "معمل الاستماع", desc: "Dictation drills and mini lectures with model summaries." });
    const bl = D.bankLW || {};
    chunk(bl.wfd || [], 10).forEach((c, i) => L(u5, "Dictation " + (i + 1), "الإملاء " + (i + 1), (u, l) => dictationLesson(u, l, c)));
    chunk(bl.sst || [], 2).forEach((c, i) => L(u5, "Lecture & Summary " + (i + 1), "محاضرة وتلخيص " + (i + 1), (u, l) => lectureLesson(u, l, c)));

    const u6 = U({ id: "templates", icon: "🗂️", en: "Templates Academy", ar: "أكاديمية القوالب", desc: "Speaking and writing templates read in chunks for you to repeat." });
    [["di", "Describe Image templates", "قوالب وصف الصورة"], ["rl", "Re-tell Lecture template", "قالب إعادة المحاضرة"], ["swt", "Summarize Written Text frames", "قوالب تلخيص النص"], ["sst", "Summarize Spoken Text template", "قالب تلخيص المسموع"], ["essay", "Essay sentence frames", "جمل المقال الجاهزة"]].forEach((x) => L(u6, x[1], x[2], (u, l) => templatesLesson(u, l, x[0])));

    const u7 = U({ id: "story", icon: "📚", en: "Story Season", ar: "موسم القصة", desc: "26 episodes of the PTE-79 Express with a riddle each." });
    (D.stations || []).forEach((st) => L(u7, "Episode " + st.n + ": " + st.en, "الحلقة " + st.n + ": " + st.ar, (u, l) => storyLesson(u, l, st)));

    cache = units; return units;
  };
  PTE.driveEst = function (les) { try { const seg = les.build(); let sec = 0; seg.forEach((s) => { if (s.t === "say") sec += s.text.split(/\s+/).length / 2.4; else if (s.t === "pause") sec += s.ms / 1000; else if (s.t === "beep") sec += 0.4; }); return Math.max(1, Math.round(sec / 60)); } catch (e) { return 5; } };
})();

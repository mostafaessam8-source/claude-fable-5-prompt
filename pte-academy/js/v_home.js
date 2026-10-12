/* Home, Today, Plan, Story, Progress, Settings */
(function () {
  "use strict";
  const PTE = window.PTE, h = PTE.h, S = () => PTE.store.get();

  function dayStatus(i) {
    const list = PTE.dayTasks(i); const n = list.filter((t) => PTE.isDone(i, t.id)).length;
    return { n, total: list.length, full: n === list.length, part: n > 0 };
  }
  function weekProgress(w) {
    let n = 0, tot = 0;
    for (let d = 1; d <= 7; d++) { const i = (w - 1) * 7 + d; const s = dayStatus(i); n += s.n; tot += s.total; }
    return tot ? Math.round((100 * n) / tot) : 0;
  }

  function taskRow(i, t, minMode) {
    const done = PTE.isDone(i, t.id);
    return h("li", null, h("a", { class: "task" + (done ? " done" : "") + (t.core ? " core" : ""), href: t.route + (t.route.indexOf("?") < 0 ? "" : "") },
      h("span", { class: "ico" }, t.icon),
      h("span", { class: "t" }, t.en, h("small", { dir: "rtl" }, t.ar)),
      h("span", { class: "min" }, t.min + " min"),
      h("button", { class: "tick", type: "button", "aria-label": "Mark done", onclick: (e) => {
        e.preventDefault(); e.stopPropagation();
        const k = PTE.taskKey(i, t.id), s = S();
        if (s.done[k]) delete s.done[k]; else { s.done[k] = true; PTE.addXP(15, t.en); PTE.addMinutes(t.min); }
        PTE.store.save(); PTE.route();
      } }, done ? "✓" : "")));
  }

  /* ---------------- TODAY ---------------- */
  PTE.views.today = function (p, q) {
    const real = PTE.plan.dayIndex(new Date());
    let i = q.get("d") ? parseInt(q.get("d"), 10) : PTE.plan.clampDay(real);
    i = PTE.plan.clampDay(i);
    const w = PTE.plan.weekOf(i), st = PTE.plan.station(w), role = PTE.plan.role(i), ph = PTE.plan.phase(st.phase);
    const minMode = S().settings.minDay;
    let list = PTE.dayTasks(i);
    if (minMode) list = list.filter((t) => t.core).slice(0, 4);
    const doneN = list.filter((t) => PTE.isDone(i, t.id)).length;
    const wrap = h("div");
    wrap.appendChild(PTE.pageHead("Day " + i + " · " + role.en, "اليوم " + i + " — " + role.ar, PTE.fmtDate(PTE.plan.dateOfDay(i)) + (real < 1 ? " · starts " + PTE.fmtDate(PTE.plan.startDate()) : "")));
    wrap.appendChild(h("div", { class: "hero" },
      h("small", { style: { color: "#E6F1F4" } }, "Phase " + ph.n + " · " + ph.en + " · Station " + w + "/26"),
      h("h2", null, "🚉 " + st.en),
      PTE.ar(st.ar, "ar-title"),
      h("p", null, st.focus.split(" / ")[0])
    ));
    wrap.appendChild(h("div", { class: "card" },
      h("div", { class: "row between" },
        h("h2", null, "Today's missions · مهام اليوم"),
        h("label", { class: "row" }, h("input", { type: "checkbox", checked: minMode ? "" : null, onchange: (e) => { S().settings.minDay = e.target.checked; PTE.store.save(); PTE.route(); } }), h("span", null, "Tired day · 10-minute mode يوم التعب"))
      ),
      PTE.bar((100 * doneN) / list.length),
      h("p", null, doneN + " / " + list.length + " done · " + list.reduce((a, t) => a + t.min, 0) + " min"),
      h("ul", { class: "tasklist" }, list.map((t) => taskRow(i, t, minMode)))
    ));
    wrap.appendChild(h("div", { class: "card tint" },
      h("h3", null, "🎯 Station goal · هدف المحطة"),
      h("p", null, st.milestone.split(" / ")[0]), PTE.ar(st.milestone.split(" / ")[1] || "")
    ));
    wrap.appendChild(h("div", { class: "row" },
      h("a", { class: "btn ghost", href: "#/today?d=" + Math.max(1, i - 1) }, "← Prev day"),
      h("a", { class: "btn ghost", href: "#/today?d=" + Math.min(182, i + 1) }, "Next day →"),
      h("a", { class: "btn", href: "#/drive" }, "🚆 Drive mode")
    ));
    return wrap;
  };

  /* ---------------- HOME ---------------- */
  PTE.views.home = function () {
    const i = PTE.todayIndex(), real = PTE.plan.dayIndex(new Date());
    const w = PTE.plan.weekOf(i), st = PTE.plan.station(w), ph = PTE.plan.phase(st.phase);
    const sc = PTE.srs.counts(); const dl = PTE.plan.daysLeft(); const list = PTE.dayTasks(i); const d = list.filter((t) => PTE.isDone(i, t.id)).length;
    const wrap = h("div");
    const rk = PTE.rank();
    wrap.appendChild(h("div", { class: "hero" },
      h("small", null, real < 1 ? "Journey starts " + PTE.fmtDate(PTE.plan.startDate()) : "Welcome back, Captain · أهلاً بالكابتن"),
      h("h1", null, "PTE-79 Express 🚆"),
      h("p", null, "26 stations. One destination: PTE score 79+. Today is day " + i + " of 182."),
      PTE.ar("٢٦ محطة ووجهة واحدة: درجة PTE ٧٩+. اليوم هو اليوم " + i + " من ١٨٢."),
      h("div", { class: "row", style: { marginTop: "10px" } },
        h("a", { class: "btn", href: "#/today" }, "▶ Start today's missions"),
        h("a", { class: "btn ghost", href: "#/drive" }, "🚆 Drive mode · وضع القيادة"))
    ));
    wrap.appendChild(h("div", { class: "grid" },
      h("div", { class: "kpi" }, h("b", null, dl > 0 ? dl : 0), h("span", null, "days to exam · يوم للامتحان")),
      h("div", { class: "kpi y" }, h("b", null, "🔥 " + PTE.streak()), h("span", null, "day streak · أيام متتالية")),
      h("div", { class: "kpi s" }, h("b", null, S().xp), h("span", null, "XP · " + rk.name)),
      h("div", { class: "kpi r" }, h("b", null, sc.due), h("span", null, "words due · كلمات للمراجعة"))
    ));
    wrap.appendChild(h("div", { class: "card accent", style: { marginTop: "16px" } },
      h("h2", null, "Station " + w + ": " + st.en + " — " + st.ar),
      h("p", null, "Phase " + ph.n + " · " + ph.en),
      PTE.bar((100 * d) / list.length), h("p", null, d + "/" + list.length + " missions today"),
      h("p", null, st.story[0]), PTE.ar(st.storyAr[0]),
      h("a", { class: "btn mini", href: "#/story?w=" + w }, "Read the episode · الحلقة")
    ));
    wrap.appendChild(h("div", { class: "card" },
      h("h2", null, "Your toolbox · أدواتك"),
      h("div", { class: "grid" }, [
        ["#/vocab", "🧠", "Vocabulary SRS", "مفردات " + (sc.total) + " كلمة"], ["#/phonetics", "🔊", "Phonetics Lab", "الفوناتكس"], ["#/grammar", "📘", "Grammar", "القواعد"],
        ["#/speaking", "🎤", "Speaking tasks", "المحادثة"], ["#/listening", "🎧", "Listening", "الاستماع"], ["#/writing", "📝", "Writing", "الكتابة"],
        ["#/reading", "📖", "Reading", "القراءة"], ["#/strategies", "🧭", "Strategies", "الاستراتيجيات"], ["#/mock", "🏁", "Mock tests", "اختبارات"]
      ].map((x) => h("a", { class: "card tint", style: { textDecoration: "none", color: "inherit", margin: 0 }, href: x[0] }, h("div", { style: { fontSize: "1.8rem" } }, x[1]), h("b", null, x[2]), h("div", { class: "ar", dir: "rtl" }, x[3]))))
    ));
    return wrap;
  };

  /* ---------------- PLAN ---------------- */
  PTE.views.plan = function (p, q) {
    const cur = PTE.plan.weekOf(PTE.todayIndex());
    const sel = q.get("w") ? parseInt(q.get("w"), 10) : cur;
    const wrap = h("div");
    wrap.appendChild(PTE.pageHead("Your 26-week plan", "خطتك لمدة ٢٦ أسبوعاً", "Exam target: " + PTE.fmtDate(PTE.plan.examDate()) + " · " + Math.max(0, PTE.plan.daysLeft()) + " days left"));
    PTE.D.phases.forEach((ph) => {
      wrap.appendChild(h("div", { class: "card" },
        h("h2", null, "Phase " + ph.n + ": " + ph.en), PTE.ar(ph.ar), h("p", null, ph.goal.split(" / ")[0]),
        h("div", { class: "track" }, PTE.D.stations.filter((s) => s.phase === ph.n).map((s) =>
          h("a", { class: "stn p" + s.phase + (s.n === cur ? " cur" : "") + (s.n < cur ? " past" : ""), href: "#/plan?w=" + s.n, title: s.en }, s.n)))
      ));
    });
    const st = PTE.plan.station(sel);
    const card = h("div", { class: "card accent" },
      h("h2", null, "Station " + sel + ": " + st.en), PTE.ar(st.ar),
      h("p", null, h("b", null, "Focus: "), st.focus.split(" / ")[0]), PTE.ar(st.focus.split(" / ")[1] || ""),
      h("p", null, h("b", null, "Milestone: "), st.milestone.split(" / ")[0]), PTE.ar(st.milestone.split(" / ")[1] || ""),
      PTE.bar(weekProgress(sel)), h("p", null, weekProgress(sel) + "% complete")
    );
    const grid = h("div", { class: "weekgrid" });
    for (let d = 1; d <= 7; d++) {
      const i = (sel - 1) * 7 + d, s = dayStatus(i), role = PTE.D.dayRoles[d - 1];
      grid.appendChild(h("a", { class: "dcell" + (i === PTE.todayIndex() ? " cur" : s.full ? " full" : s.part ? " part" : ""), href: "#/today?d=" + i },
        h("b", null, "D" + d), h("div", null, PTE.fmtDate(PTE.plan.dateOfDay(i)).split(" ").slice(0, 3).join(" ")), h("small", null, role.en)));
    }
    card.appendChild(grid);
    wrap.appendChild(card);
    wrap.appendChild(h("div", { class: "row" },
      h("a", { class: "btn ghost", href: "#/plan?w=" + Math.max(1, sel - 1) }, "← Week " + Math.max(1, sel - 1)),
      h("a", { class: "btn ghost", href: "#/plan?w=" + Math.min(26, sel + 1) }, "Week " + Math.min(26, sel + 1) + " →")));
    wrap.appendChild(h("div", { class: "card tint" }, h("h3", null, "The weekly rhythm · إيقاع الأسبوع"),
      h("table", { class: "tbl" }, h("thead", null, h("tr", null, h("th", null, "Day"), h("th", null, "Focus"), h("th", null, "Arabic"))),
        h("tbody", null, PTE.D.dayRoles.map((r) => h("tr", null, h("td", null, r.d), h("td", null, r.en), h("td", { dir: "rtl", class: "ar" }, r.ar))))),
      h("p", null, "Every day also includes: vocabulary review (SRS), a pronunciation warm-up, and an optional drive-mode audio lesson."),
      PTE.ar("كل يوم يشمل أيضاً: مراجعة المفردات، تسخين نطق، ودرساً صوتياً اختيارياً في وضع القيادة.")));
    return wrap;
  };

  /* ---------------- STORY ---------------- */
  PTE.views.story = function (p, q) {
    const cur = PTE.plan.weekOf(PTE.todayIndex()); const w = q.get("w") ? parseInt(q.get("w"), 10) : cur;
    const wrap = h("div"); wrap.appendChild(PTE.pageHead("The PTE-79 Express — Story", "قصة قطار PTE ٧٩", "One episode per station. Solve the riddle to earn bonus XP. / حلقة لكل محطة، وحل اللغز يمنحك نقاطاً."));
    const st = PTE.plan.station(w);
    const unlocked = w <= cur;
    wrap.appendChild(h("div", { class: "card accent" },
      h("h2", null, "Episode " + w + " — " + st.en), PTE.ar(st.ar),
      unlocked ? h("div", { class: "stack" },
        st.story.map((s, k) => h("div", null, h("p", null, s), PTE.ar(st.storyAr[k]))),
        h("div", { class: "row" }, PTE.speakBtn(st.story.join(" "), "en", "Listen"), PTE.speakBtn(st.storyAr.join(" "), "ar", "استمع"))
      ) : h("p", null, "🔒 This station unlocks in week " + w + ". Keep driving! / تفتح هذه المحطة في الأسبوع " + w)
    ));
    if (unlocked) {
      const key = "riddle" + w; const box = h("div");
      const solved = S().badges[key];
      const input = h("input", { type: "text", placeholder: "Your answer…", autocomplete: "off", disabled: solved ? "" : null });
      const out = h("div");
      const go = () => {
        const a = PTE.norm(input.value);
        if (a === PTE.norm(st.riddle.answer)) { PTE.ding(); PTE.fireworks(); S().badges[key] = true; PTE.store.save(); PTE.addXP(30, "Riddle solved!"); out.textContent = "✅ Correct: " + st.riddle.answer; out.className = "good-t"; }
        else { PTE.buzz(); out.textContent = "Not yet. Hint: " + st.riddle.hint; out.className = "bad-t"; }
      };
      box.appendChild(h("div", { class: "card warn" }, h("h3", null, "🧩 Station riddle · لغز المحطة"), h("p", null, st.riddle.clue),
        solved ? h("p", { class: "good-t" }, "✅ Solved: " + st.riddle.answer) : h("div", { class: "row" }, input, h("button", { class: "btn", onclick: go }, "Check")), out));
      wrap.appendChild(box);
    }
    wrap.appendChild(h("div", { class: "row" }, h("a", { class: "btn ghost", href: "#/story?w=" + Math.max(1, w - 1) }, "← Previous"), h("a", { class: "btn ghost", href: "#/story?w=" + Math.min(26, w + 1) }, "Next →")));
    return wrap;
  };

  /* ---------------- PROGRESS ---------------- */
  const BADGES = [
    ["first", "🎫", "First ticket", "أول تذكرة", () => S().xp > 0],
    ["w1", "🔥", "7-day streak", "٧ أيام متتالية", () => PTE.streak() >= 7],
    ["w30", "🚂", "30-day streak", "٣٠ يوماً متتالية", () => PTE.streak() >= 30],
    ["v100", "🧠", "100 words learned", "١٠٠ كلمة", () => PTE.srs.counts().learned >= 100],
    ["v300", "📚", "300 words learned", "٣٠٠ كلمة", () => PTE.srs.counts().learned >= 300],
    ["m50", "💪", "50 mastered words", "٥٠ كلمة متقنة", () => PTE.srs.counts().mastered >= 50],
    ["xp1k", "⭐", "1000 XP", "١٠٠٠ نقطة", () => S().xp >= 1000],
    ["xp5k", "🌟", "5000 XP", "٥٠٠٠ نقطة", () => S().xp >= 5000],
    ["mock", "🏁", "First mock completed", "أول اختبار", () => S().mockHistory.length > 0],
    ["mock3", "🏆", "3 mocks completed", "٣ اختبارات", () => S().mockHistory.length >= 3]
  ];
  PTE.views.progress = function () {
    const wrap = h("div"); wrap.appendChild(PTE.pageHead("Progress", "التقدم"));
    const cur = PTE.plan.weekOf(PTE.todayIndex()); const sc = PTE.srs.counts(); const rk = PTE.rank();
    wrap.appendChild(h("div", { class: "grid" },
      h("div", { class: "kpi" }, h("b", null, S().xp), h("span", null, "XP · " + rk.name + " · " + rk.ar)),
      h("div", { class: "kpi y" }, h("b", null, Math.round(S().minutes / 60 * 10) / 10 + " h"), h("span", null, "study time · وقت المذاكرة")),
      h("div", { class: "kpi s" }, h("b", null, sc.learned + "/" + sc.total), h("span", null, "words learned · كلمات")),
      h("div", { class: "kpi r" }, h("b", null, sc.mastered), h("span", null, "mastered · متقنة"))
    ));
    if (rk.next) wrap.appendChild(h("div", { class: "card" }, h("p", null, "Next rank: " + rk.nextName + " at " + rk.next + " XP"), PTE.bar(100 * (S().xp - rk.from) / (rk.next - rk.from))));
    /* skill averages */
    const skills = [["ra", "Read Aloud"], ["rs", "Repeat Sentence"], ["di", "Describe Image"], ["rl", "Re-tell Lecture"], ["asq", "Short Answer"], ["wfd", "Dictation"], ["sst", "Summarize Spoken"], ["swt", "Summarize Written"], ["essay", "Essay"], ["rfib", "R&W Fill blanks"], ["dfib", "Reading Fill blanks"], ["ro", "Re-order"], ["mcq", "Reading MCQ"], ["hcs", "Highlight Summary"], ["smw", "Missing Word"], ["mcl", "Listening MCQ"], ["fibl", "Listening Fill blanks"], ["grammar", "Grammar"], ["vocab", "Vocabulary games"], ["phon", "Phonetics"]];
    const rows = skills.map((s) => { const a = PTE.avgScore(s[0]); return h("tr", null, h("td", null, s[1]), h("td", null, a === null ? "—" : a + "%"), h("td", { style: { width: "40%" } }, PTE.bar(a || 0, a !== null && a < 60 ? "r" : a !== null && a < 80 ? "y" : ""))); });
    wrap.appendChild(h("div", { class: "card" }, h("h2", null, "Skill scores (last 10 attempts) · مستوى المهارات"), h("table", { class: "tbl" }, h("thead", null, h("tr", null, h("th", null, "Skill"), h("th", null, "Avg"), h("th", null, ""))), h("tbody", null, rows))));
    /* weekly completion */
    const wk = []; for (let w = 1; w <= Math.min(26, Math.max(cur, 1)); w++) wk.push(h("div", { class: "row between" }, h("span", null, "Week " + w), h("span", { style: { flex: 1, margin: "0 10px" } }, PTE.bar(weekProgress(w))), h("span", null, weekProgress(w) + "%")));
    wrap.appendChild(h("div", { class: "card" }, h("h2", null, "Weekly completion · إنجاز الأسابيع"), h("div", { class: "stack" }, wk)));
    /* mocks */
    if (S().mockHistory.length) wrap.appendChild(h("div", { class: "card" }, h("h2", null, "Mock history"), h("table", { class: "tbl" }, h("thead", null, h("tr", null, h("th", null, "Date"), h("th", null, "Type"), h("th", null, "Result"))),
      h("tbody", null, S().mockHistory.slice(-10).reverse().map((m) => h("tr", null, h("td", null, new Date(m.t).toLocaleDateString()), h("td", null, m.type), h("td", null, m.pct + "% (est. PTE " + Math.round(10 + m.pct * 0.8) + ")")))))));
    /* badges */
    const bd = BADGES.map((b) => { const ok = b[4](); return h("div", { class: "card tint", style: { margin: 0, opacity: ok ? 1 : 0.45, textAlign: "center" } }, h("div", { style: { fontSize: "2rem" } }, b[1]), h("b", null, b[2]), h("div", { class: "ar" }, b[3])); });
    wrap.appendChild(h("div", { class: "card" }, h("h2", null, "Badges · الأوسمة"), h("div", { class: "grid" }, bd)));
    wrap.appendChild(h("div", { class: "card warn" }, h("p", null, "ℹ️ Self-practice percentages are for guidance only; PTE's official AI scoring is different. Estimated PTE numbers are rough. / النسب للاسترشاد فقط وليست درجة PTE الرسمية.")));
    /* error log */
    const errs = S().errors.slice(-8).reverse();
    if (errs.length) wrap.appendChild(h("div", { class: "card" }, h("h2", null, "Recent mistakes · آخر الأخطاء"), h("ul", null, errs.map((e) => h("li", null, h("b", null, e.task || ""), " — ", e.q || "", " → ", h("span", { class: "good-t" }, e.a || ""))))));
    return wrap;
  };

  /* ---------------- SETTINGS ---------------- */
  PTE.views.settings = function () {
    const s = S().settings; const wrap = h("div"); wrap.appendChild(PTE.pageHead("Settings", "الإعدادات"));
    const en = PTE.tts.voices.filter((v) => /^en/i.test(v.lang)), ar = PTE.tts.voices.filter((v) => /^ar/i.test(v.lang));
    const vsel = (list, cur, set) => h("select", { onchange: (e) => { s[set] = e.target.value; PTE.store.save(); } }, h("option", { value: "" }, "Auto"), list.map((v) => h("option", { value: v.name, selected: v.name === cur ? "" : null }, v.name + " (" + v.lang + ")")));
    wrap.appendChild(h("div", { class: "card stack" },
      h("h2", null, "Plan"),
      h("label", null, "Start date · تاريخ البدء", h("input", { type: "date", value: S().start, onchange: (e) => { if (e.target.value) { S().start = e.target.value; PTE.store.save(); PTE.toast("Start date updated"); } } })),
      h("label", null, "Exam date (optional, shown in countdown) · موعد الامتحان", h("input", { type: "date", value: s.examDate || "", onchange: (e) => { s.examDate = e.target.value; PTE.store.save(); PTE.refreshChrome(); } })),
      h("small", null, "Default: your plan ends 26 weeks after the start date. / الافتراضي: تنتهي الخطة بعد ٢٦ أسبوعاً.")
    ));
    wrap.appendChild(h("div", { class: "card stack" },
      h("h2", null, "Voice & display · الصوت والعرض"),
      h("label", null, "English voice (accent)", vsel(en, s.voiceEn, "voiceEn")),
      h("label", null, "Arabic voice " + (ar.length ? "" : "(none found on this device — Arabic is shown as text)"), vsel(ar, s.voiceAr, "voiceAr")),
      h("label", null, "Speech speed · سرعة الصوت: " + s.rate, h("input", { type: "range", min: "0.6", max: "1.3", step: "0.05", value: s.rate, oninput: (e) => { s.rate = parseFloat(e.target.value); PTE.store.save(); } })),
      h("label", { class: "row" }, h("input", { type: "checkbox", checked: s.showAr ? "" : null, onchange: (e) => { s.showAr = e.target.checked; PTE.store.save(); } }), "Open Arabic explanations by default · فتح الشروحات العربية تلقائياً"),
      h("label", { class: "row" }, h("input", { type: "checkbox", checked: s.fx !== false ? "" : null, onchange: (e) => { if (PTE.fx) PTE.fx.setEnabled(e.target.checked); } }), "Animations & smooth scroll (GSAP / Lenis) · الحركات والتمرير الناعم"),
      h("label", { class: "row" }, h("input", { type: "checkbox", checked: s.selHelper !== false ? "" : null, onchange: (e) => { s.selHelper = e.target.checked; PTE.store.save(); } }), "Word helper: select any text to listen / translate · تحديد أي نص للنطق والترجمة"),
      h("label", { class: "row" }, h("input", { type: "checkbox", checked: s.autoTranslate ? "" : null, onchange: (e) => { s.autoTranslate = e.target.checked; PTE.store.save(); } }), "Translate automatically when I select · ترجمة تلقائية عند التحديد"),
      h("label", null, "Theme", h("select", { onchange: (e) => { const v = e.target.value; try { localStorage.setItem("pte79.theme", v); } catch (x) { /* none */ } if (v === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", v); } },
        ["auto", "light", "dark"].map((v) => h("option", { value: v }, v)))),
      h("button", { class: "btn", onclick: () => PTE.say("Hello Captain. This is your English voice.", "en") }, "🔊 Test English"),
      h("button", { class: "btn ghost", onclick: () => PTE.say("مرحباً يا كابتن، هذا هو الصوت العربي.", "ar") }, "🔊 اختبار العربي")
    ));
    const ta = h("textarea", { rows: 3, placeholder: "Paste backup JSON here to restore" });
    wrap.appendChild(h("div", { class: "card stack" }, h("h2", null, "Backup · نسخة احتياطية"),
      h("p", null, "Your progress lives only in this browser. Copy a backup now and then. / تقدمك محفوظ في هذا المتصفح فقط."),
      h("button", { class: "btn", onclick: async () => { try { await navigator.clipboard.writeText(PTE.store.exportJson()); PTE.toast("Backup copied"); } catch (e) { ta.value = PTE.store.exportJson(); PTE.toast("Copy from the box"); } } }, "Copy backup"),
      ta, h("button", { class: "btn ghost", onclick: () => { try { PTE.store.importJson(ta.value); PTE.toast("Restored"); PTE.route(); } catch (e) { PTE.toast("Invalid backup"); } } }, "Restore"),
      h("button", { class: "btn red", onclick: () => { if (confirm("Erase all progress? / مسح كل التقدم؟")) { PTE.store.reset(); PTE.route(); } } }, "Reset everything")
    ));
    return wrap;
  };
  try { const t = localStorage.getItem("pte79.theme"); if (t && t !== "auto") document.documentElement.setAttribute("data-theme", t); } catch (e) { /* ignore */ }
})();

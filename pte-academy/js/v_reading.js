/* Reading tasks + SVG chart renderer for Describe Image */
(function () {
  "use strict";
  const PTE = window.PTE, h = PTE.h, S = () => PTE.store.get();
  const BR = () => PTE.D.bankReading || {};
  const NS = "http://www.w3.org/2000/svg";
  const sv = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); for (const k in attrs || {}) e.setAttribute(k, attrs[k]); if (text !== undefined) e.textContent = text; return e; };
  const COLORS = ["#00778B", "#F1B434", "#71B2C9", "#CB2C30", "#768692", "#59CBE8"];

  /* ---------- Describe Image charts ---------- */
  PTE.chartEl = function (it) {
    const W = 600, H = 340; const svg = sv("svg", { viewBox: "0 0 " + W + " " + H, class: "chart", role: "img", "aria-label": it.title });
    const title = sv("text", { x: W / 2, y: 24, "text-anchor": "middle", "font-size": 16, "font-weight": 700 }, it.title); svg.appendChild(title);
    if (it.kind === "process") {
      const steps = it.steps || []; const bh = Math.min(48, (H - 50) / steps.length - 8);
      steps.forEach((s, i) => { const y = 42 + i * (bh + 8); svg.appendChild(sv("rect", { x: 30, y, width: W - 60, height: bh, rx: 6, fill: i % 2 ? "#E6F1F4" : "#F2F8F9", stroke: "#00778B" })); svg.appendChild(sv("text", { x: 44, y: y + bh / 2 + 5, "font-size": 12 }, s.length > 80 ? s.slice(0, 78) + "…" : s)); });
      svg.setAttribute("viewBox", "0 0 " + W + " " + H); return svg;
    }
    const labels = it.labels || [], series = it.series || [];
    if (it.kind === "table") {
      const cols = series.length + 1, cw = (W - 40) / cols, rh = 34; let y = 50;
      const cell = (txt, c, r, head) => { svg.appendChild(sv("rect", { x: 20 + c * cw, y: y + r * rh, width: cw, height: rh, fill: head ? "#00778B" : r % 2 ? "#F2F8F9" : "#fff", stroke: "#C8C9C7" })); svg.appendChild(sv("text", { x: 20 + c * cw + cw / 2, y: y + r * rh + 21, "text-anchor": "middle", "font-size": 12, fill: head ? "#fff" : "#3D3935", style: head ? "fill:#fff;font-weight:700" : "" }, String(txt).slice(0, 22))); };
      cell("", 0, 0, true); series.forEach((s, c) => cell(s.name, c + 1, 0, true));
      labels.forEach((l, r) => { cell(l, 0, r + 1, false); series.forEach((s, c) => cell(s.values[r], c + 1, r + 1, false)); });
      svg.setAttribute("viewBox", "0 0 " + W + " " + Math.max(H, 60 + (labels.length + 1) * rh)); return svg;
    }
    if (it.kind === "pie") {
      const vals = series[0].values, tot = vals.reduce((a, b) => a + b, 0), cx = 190, cy = 190, r = 110; let a0 = -Math.PI / 2;
      vals.forEach((v, i) => { const a1 = a0 + (2 * Math.PI * v) / tot; const large = a1 - a0 > Math.PI ? 1 : 0; const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0), x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
        svg.appendChild(sv("path", { d: "M" + cx + " " + cy + " L" + x0 + " " + y0 + " A" + r + " " + r + " 0 " + large + " 1 " + x1 + " " + y1 + " Z", fill: COLORS[i % COLORS.length], stroke: "#fff", "stroke-width": 2 }));
        const am = (a0 + a1) / 2; svg.appendChild(sv("text", { x: cx + r * 0.65 * Math.cos(am), y: cy + r * 0.65 * Math.sin(am) + 4, "text-anchor": "middle", "font-size": 12, "font-weight": 700, style: "fill:#fff;paint-order:stroke;stroke:#3D3935;stroke-width:2px" }, v + (it.unit || "")));
        svg.appendChild(sv("rect", { x: 350, y: 80 + i * 26, width: 14, height: 14, fill: COLORS[i % COLORS.length] })); svg.appendChild(sv("text", { x: 372, y: 92 + i * 26, "font-size": 13 }, labels[i])); a0 = a1; });
      return svg;
    }
    /* bar / line */
    const all = [].concat.apply([], series.map((s) => s.values)); const rawMax = Math.max.apply(null, all) * 1.05; const mag = Math.pow(10, Math.floor(Math.log10(rawMax / 4))); const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x * 4 >= rawMax); const max = step * 4, L = 56, R = W - 20, T = 56, B = H - 56; const pw = R - L, ph = B - T;
    for (let g = 0; g <= 4; g++) { const y = B - (ph * g) / 4; svg.appendChild(sv("line", { x1: L, x2: R, y1: y, y2: y, stroke: "#C8C9C7", "stroke-width": 1 })); svg.appendChild(sv("text", { x: L - 6, y: y + 4, "text-anchor": "end", "font-size": 11 }, Math.round((max * g) / 4))); }
    if (it.unit) svg.appendChild(sv("text", { x: 14, y: T - 8, "font-size": 11 }, it.unit));
    const n = labels.length, gw = pw / n;
    labels.forEach((l, i) => svg.appendChild(sv("text", { x: L + gw * i + gw / 2, y: B + 18, "text-anchor": "middle", "font-size": 12 }, l)));
    if (it.kind === "bar") {
      const bw = Math.min(46, (gw * 0.8) / series.length);
      series.forEach((s, k) => s.values.forEach((v, i) => { const x = L + gw * i + gw / 2 - (bw * series.length) / 2 + bw * k; const hh = (ph * v) / max; svg.appendChild(sv("rect", { x, y: B - hh, width: bw - 2, height: hh, fill: COLORS[k % COLORS.length] })); svg.appendChild(sv("text", { x: x + bw / 2 - 1, y: B - hh - 4, "text-anchor": "middle", "font-size": 10 }, v)); }));
    } else {
      series.forEach((s, k) => { const pts = s.values.map((v, i) => [L + gw * i + gw / 2, B - (ph * v) / max]); svg.appendChild(sv("polyline", { points: pts.map((p) => p.join(",")).join(" "), fill: "none", stroke: COLORS[k % COLORS.length], "stroke-width": 3 })); pts.forEach((p, i) => { svg.appendChild(sv("circle", { cx: p[0], cy: p[1], r: 4, fill: COLORS[k % COLORS.length] })); svg.appendChild(sv("text", { x: p[0], y: p[1] - 8, "text-anchor": "middle", "font-size": 10 }, s.values[i])); }); });
    }
    series.forEach((s, k) => { svg.appendChild(sv("rect", { x: L + k * 130, y: H - 26, width: 12, height: 12, fill: COLORS[k % COLORS.length] })); svg.appendChild(sv("text", { x: L + k * 130 + 18, y: H - 16, "font-size": 12 }, s.name)); });
    return svg;
  };

  function hubR(title, ar, sub, defs) {
    const wrap = h("div"); wrap.appendChild(PTE.pageHead(title, ar, sub));
    wrap.appendChild(h("div", { class: "lines" }, defs.map((d) => { const a = PTE.avgScore(d.key); return h("a", { class: "line-card", href: d.href }, h("b", null, d.icon + " " + d.en), h("span", { class: "ar", dir: "rtl" }, d.ar), h("small", null, (d.n || 0) + " items" + (a !== null ? " · avg " + a + "%" : "")), a !== null ? PTE.bar(a) : null); })));
    return wrap;
  }
  const strat = (id) => { const t = ((PTE.D.strategies || {}).tasks || []).find((x) => x.id === id); if (!t) return null; return h("details", { class: "card tint" }, h("summary", null, h("b", null, "🧭 Strategy · " + t.nameAr)), h("p", null, t.what), PTE.ar(t.whatAr), h("ol", null, (t.steps || []).map((s) => h("li", null, s))), h("ul", null, (t.tips || []).map((s) => h("li", null, s))), h("a", { href: "#/strategies/" + id }, "Full guide →")); };

  PTE.views.reading = function (p) {
    const t = p[0], B = BR();
    if (!t) return hubR("Reading Station", "محطة القراءة", "Reading also feeds your Writing, Vocabulary and Grammar scores. / القراءة تغذي الكتابة والمفردات والقواعد.", [
      { href: "#/reading/rfib", key: "rfib", icon: "🧩", en: "Reading & Writing: Fill in the blanks", ar: "ملء الفراغات (قائمة منسدلة)", n: (B.rfib || []).length },
      { href: "#/reading/dfib", key: "dfib", icon: "🧲", en: "Reading: Fill in the blanks (drag)", ar: "ملء الفراغات (سحب كلمات)", n: (B.dfib || []).length },
      { href: "#/reading/ro", key: "ro", icon: "🔀", en: "Re-order Paragraphs", ar: "ترتيب الفقرات", n: (B.ro || []).length },
      { href: "#/reading/mcq", key: "mcq", icon: "☑️", en: "Multiple Choice (Reading)", ar: "اختيار من متعدد", n: (B.mcq || []).length }]);
    const wrap = h("div"); wrap.appendChild(PTE.back("#/reading", "Reading"));
    if (t === "rfib") {
      wrap.appendChild(PTE.pageHead("R&W Fill in the Blanks", "ملء الفراغات (قراءة وكتابة)", "Choose the best word from each drop-down. Read the whole sentence first. Collocations and grammar are the keys."));
      wrap.appendChild(strat("rfib"));
      wrap.appendChild(PTE.session({ key: "rfib", title: "Fill in the blanks", count: 3, bank: () => B.rfib, back: "#/reading", xp: 25, min: 10, render: (it, complete) => {
        const box = h("div", { class: "card stack" }); const sels = []; const para = h("p", { class: "passage" });
        it.text.split(/(\{\d+\})/).forEach((seg) => { const m = seg.match(/^\{(\d+)\}$/); if (m) { const b = it.blanks[+m[1] - 1]; const sel = h("select", { class: "blank" }, h("option", { value: "-1" }, "▾ choose"), b.options.map((o, i) => h("option", { value: i }, o))); sels.push(sel); para.appendChild(sel); } else para.appendChild(document.createTextNode(seg)); });
        box.appendChild(h("b", null, it.title)); box.appendChild(para);
        box.appendChild(h("button", { class: "btn", onclick: (e) => { e.target.disabled = true; let ok = 0; sels.forEach((s, k) => { const b = it.blanks[k]; const good = +s.value === b.answer; if (good) ok++; s.style.borderColor = good ? "#00778B" : "#CB2C30"; if (!good) { s.after(h("small", { class: "good-t" }, " ✓" + b.options[b.answer])); PTE.logError({ task: "rfib", q: it.title + " #" + (k + 1), a: b.options[b.answer] }); } }); box.appendChild(h("div", { class: "card tint" }, h("p", null, it.tip), it.tipAr ? PTE.ar(it.tipAr) : null)); complete(Math.round(100 * ok / sels.length)); } }, "Check"));
        return box; } }));
    } else if (t === "dfib") {
      wrap.appendChild(PTE.pageHead("Reading Fill in the Blanks", "ملء الفراغات بالسحب", "Tap a word, then tap the blank. Some words are extra."));
      wrap.appendChild(strat("dfib"));
      wrap.appendChild(PTE.session({ key: "dfib", title: "Drag-style blanks", count: 2, bank: () => B.dfib, back: "#/reading", xp: 25, min: 10, render: (it, complete) => {
        const box = h("div", { class: "card stack" }); const slots = []; let held = null; const bank = h("div", { class: "row" }); const para = h("p", { class: "passage" });
        it.text.split(/(\{\d+\})/).forEach((seg) => { const m = seg.match(/^\{(\d+)\}$/); if (m) { const s = h("button", { class: "blank", type: "button", style: { minWidth: "100px" } }, "_____"); s.onclick = () => { if (held) { if (s._w) s._w.disabled = false; s._w = held; s.textContent = held.textContent; held.disabled = true; held.classList.remove("sel"); held = null; } else if (s._w) { s._w.disabled = false; s._w = null; s.textContent = "_____"; } }; slots.push(s); para.appendChild(s); } else para.appendChild(document.createTextNode(seg)); });
        it.words.forEach((w) => { const b = h("button", { class: "btn mini ghost", type: "button" }, w); b.onclick = () => { if (held) held.classList.remove("sel"); held = b; b.classList.add("sel"); }; bank.appendChild(b); });
        box.appendChild(para); box.appendChild(h("small", null, "Word bank · بنك الكلمات")); box.appendChild(bank);
        box.appendChild(h("button", { class: "btn", onclick: (e) => { e.target.disabled = true; let ok = 0; slots.forEach((s, k) => { const good = s._w && PTE.norm(s._w.textContent) === PTE.norm(it.answers[k]); if (good) ok++; s.style.borderColor = good ? "#00778B" : "#CB2C30"; if (!good) { s.after(h("small", { class: "good-t" }, " ✓" + it.answers[k])); PTE.logError({ task: "dfib", q: it.title, a: it.answers[k] }); } }); complete(Math.round(100 * ok / slots.length)); } }, "Check"));
        return box; } }));
    } else if (t === "ro") {
      wrap.appendChild(PTE.pageHead("Re-order Paragraphs", "ترتيب الفقرات", "Find the opening sentence first, then follow pronouns, dates and linking words."));
      wrap.appendChild(strat("ro"));
      wrap.appendChild(PTE.session({ key: "ro", title: "Re-order paragraphs", count: 3, bank: () => B.ro, back: "#/reading", xp: 25, min: 10, render: (it, complete) => {
        const box = h("div", { class: "card stack" }); let order = PTE.shuffle(it.paras.map((x, i) => i)); if (order.every((v, i) => v === i)) order.reverse();
        const list = h("div", { class: "stack" }); let locked = false;
        const draw = () => { PTE.clear(list); order.forEach((idx, pos) => list.appendChild(h("div", { class: "row", style: { alignItems: "stretch", flexWrap: "nowrap" } },
          h("div", { class: "passage", style: { flex: 1, fontSize: "1rem" } }, it.paras[idx]),
          locked ? h("b", { class: idx === pos ? "good-t" : "bad-t" }, idx === pos ? "✓" : "✗") : h("div", { style: { display: "flex", flexDirection: "column", gap: "4px" } },
            h("button", { class: "btn mini ghost", "aria-label": "Move up", disabled: pos === 0 ? "" : null, onclick: () => { [order[pos - 1], order[pos]] = [order[pos], order[pos - 1]]; draw(); } }, "▲"),
            h("button", { class: "btn mini ghost", "aria-label": "Move down", disabled: pos === order.length - 1 ? "" : null, onclick: () => { [order[pos + 1], order[pos]] = [order[pos], order[pos + 1]]; draw(); } }, "▼"))))); };
        draw(); box.appendChild(h("b", null, it.title || "")); box.appendChild(list);
        box.appendChild(h("button", { class: "btn", onclick: (e) => { e.target.disabled = true; locked = true; let pairs = 0; for (let i = 0; i < order.length - 1; i++) if (order[i + 1] === order[i] + 1) pairs++; const pct = Math.round(100 * pairs / (order.length - 1)); draw(); if (pct < 100) { box.appendChild(h("div", { class: "card tint" }, h("b", null, "Correct order:"), h("ol", null, it.paras.map((x) => h("li", null, x))))); PTE.logError({ task: "ro", q: it.title, a: "see order" }); } box.appendChild(h("div", { class: "card tint" }, h("p", null, it.clue), it.clueAr ? PTE.ar(it.clueAr) : null)); complete(pct); } }, "Check (pairs scoring)"));
        return box; } }));
    } else if (t === "mcq") {
      wrap.appendChild(PTE.pageHead("Reading Multiple Choice", "اختيار من متعدد (قراءة)", "Single answer or multiple answers (wrong picks cost points)."));
      wrap.appendChild(strat("mcs"));
      wrap.appendChild(PTE.session({ key: "mcq", title: "Reading MCQ", count: 3, bank: () => B.mcq, back: "#/reading", xp: 25, min: 10, render: (it, complete) => {
        const box = h("div", { class: "card stack" }); box.appendChild(h("p", { class: "passage" }, it.passage)); box.appendChild(h("b", null, it.q + (it.multi ? "  (select all that apply)" : "")));
        const picked = new Set(); const wrapC = h("div", { class: "choices" }); let done = false;
        const finish = (sel) => { if (done) return; done = true; let g = 0, b = 0; sel.forEach((x) => (it.answers.indexOf(x) >= 0 ? g++ : b++)); const pct = Math.max(0, Math.round(100 * (g - b) / it.answers.length)); [...wrapC.children].forEach((c, i) => { c.classList.remove("sel"); if (it.answers.indexOf(i) >= 0) c.classList.add("good"); else if (sel.indexOf(i) >= 0) c.classList.add("bad"); }); pct === 100 ? PTE.ding() : PTE.buzz(); if (pct < 100) PTE.logError({ task: "mcq", q: it.q, a: it.answers.map((x) => it.options[x]).join(" / ") }); box.appendChild(h("div", { class: "card tint" }, h("p", null, it.why), it.whyAr ? PTE.ar(it.whyAr) : null)); complete(pct); };
        it.options.forEach((o, i) => wrapC.appendChild(h("button", { class: "choice", type: "button", onclick: function () { if (!it.multi) finish([i]); else { picked.has(i) ? picked.delete(i) : picked.add(i); this.classList.toggle("sel"); } } }, o)));
        box.appendChild(wrapC); if (it.multi) box.appendChild(h("button", { class: "btn", onclick: () => finish([...picked]) }, "Submit"));
        return box; } }));
    }
    return wrap;
  };
})();

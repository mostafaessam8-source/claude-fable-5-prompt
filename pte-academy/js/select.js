/* Selection helper: select any word or sentence anywhere on the site -> a bottom sheet appears with
   🔊 listen (normal / slow) · 🌐 translate (EN⇄AR) · 📖 meaning (dictionary) · ➕ add to "My words" (joins spaced repetition).
   Offline-first: the 600 course words are looked up locally; online services (MyMemory / dictionaryapi.dev) are optional extras. */
(function () {
  "use strict";
  const PTE = window.PTE, h = PTE.h, S = () => PTE.store.get();
  const sel = (PTE.sel = { text: "", box: null });
  const isAr = (t) => /[؀-ۿ]/.test(t);
  const hasLetters = (t) => /[A-Za-z؀-ۿ]/.test(t);
  const CK = "pte79.tr.";

  /* ---------- local dictionary from the course words ---------- */
  let index = null;
  const stem = (w) => w.replace(/(ing|ed|es|s|ly)$/, "");
  function buildIndex() {
    index = {}; const add = (k, w) => { k = k.toLowerCase().trim(); if (k && !index[k]) index[k] = w; };
    PTE.srs.allWords().forEach((w) => { add(w.en, w); (w.forms || "").split(",").forEach((f) => add(f.replace(/\(.*?\)/g, ""), w)); });
    PTE.srs.allWords().forEach((w) => { const s = stem(w.en.toLowerCase()); if (s.length > 3 && !index[s]) index[s] = w; });
  }
  function localLookup(text) {
    if (!index) buildIndex(); const t = text.toLowerCase().replace(/[^a-z' -]/g, "").trim(); if (!t || t.indexOf(" ") >= 0 && t.split(" ").length > 3) return null;
    return index[t] || index[stem(t)] || null;
  }
  sel.rebuild = () => { index = null; PTE.srs._map = null; };

  /* ---------- online helpers (cached in localStorage) ---------- */
  const cget = (k) => { try { return JSON.parse(localStorage.getItem(CK + k)); } catch (e) { return null; } };
  const cset = (k, v) => { try { localStorage.setItem(CK + k, JSON.stringify(v)); } catch (e) { /* full/private */ } };
  async function timeoutFetch(url, ms) { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms || 7000); try { return await fetch(url, { signal: c.signal }); } finally { clearTimeout(t); } }
  async function translate(text, from, to) {
    const key = from + to + text.toLowerCase(); const hit = cget(key); if (hit) return hit;
    let out = null;
    try { const r = await timeoutFetch("https://api.mymemory.translated.net/get?q=" + encodeURIComponent(text) + "&langpair=" + from + "|" + to); const j = await r.json(); const t = j && j.responseData && j.responseData.translatedText; if (t && !/MYMEMORY WARNING|QUERY LENGTH/i.test(t)) out = t; } catch (e) { /* try next */ }
    if (!out) { try { const r = await timeoutFetch("https://translate.googleapis.com/translate_a/single?client=gtx&sl=" + from + "&tl=" + to + "&dt=t&q=" + encodeURIComponent(text)); const j = await r.json(); out = (j[0] || []).map((x) => x[0]).join(""); } catch (e) { /* offline */ } }
    if (out) cset(key, out); return out;
  }
  async function define(word) {
    const key = "def" + word.toLowerCase(); const hit = cget(key); if (hit) return hit;
    try { const r = await timeoutFetch("https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(word.toLowerCase())); if (!r.ok) return null; const j = await r.json(); const e = j[0]; const out = { phonetic: e.phonetic || ((e.phonetics || []).find((p) => p.text) || {}).text || "", meanings: (e.meanings || []).slice(0, 3).map((m) => ({ pos: m.partOfSpeech, def: m.definitions[0].definition, ex: m.definitions[0].example || "" })) }; cset(key, out); return out; } catch (e) { return null; }
  }

  /* ---------- my words ---------- */
  function addMyWord(en, ar, ex) {
    const s = S(); s.myWords = s.myWords || []; const k = en.toLowerCase();
    if (s.myWords.some((w) => w.en.toLowerCase() === k) || PTE.srs.allWords().some((w) => w.en.toLowerCase() === k && w.id)) { const ex2 = PTE.srs.allWords().find((w) => w.en.toLowerCase() === k); if (ex2) { PTE.srs.learn(ex2.id); PTE.toast("Added to review · أضيفت للمراجعة"); return; } }
    const w = { id: "u" + Date.now().toString(36), en, pos: "", ar: ar || "—", ex: ex || en, exAr: "", forms: "", topic: "my words", level: "mine", tip: "" };
    s.myWords.push(w); sel.rebuild(); PTE.srs.learn(w.id); PTE.store.save(); PTE.addXP(3, "New word"); PTE.toast("➕ Saved to My words · تم حفظ الكلمة");
  }

  /* ---------- the sheet ---------- */
  function ensure() {
    if (sel.box) return sel.box;
    sel.box = h("div", { id: "selsheet", role: "dialog", "aria-label": "Word helper", "data-lenis-prevent": "" });
    ["mousedown", "pointerdown"].forEach((ev) => sel.box.addEventListener(ev, (e) => { if (e.target.closest("button,a")) e.preventDefault(); })); /* keep the page selection on desktop */
    document.body.appendChild(sel.box); return sel.box;
  }
  const close = () => { if (sel.box) { sel.box.classList.remove("open"); } sel.text = ""; };
  sel.close = close;

  function show(text) {
    sel.text = text; const box = ensure(); PTE.clear(box);
    const arabic = isAr(text); const words = text.trim().split(/\s+/).length; const single = words === 1 && !arabic;
    const out = h("div", { class: "sel-out" });
    const local = !arabic && localLookup(text);
    const head = h("div", { class: "sel-head" }, h("b", { class: arabic ? "ar" : "", dir: arabic ? "rtl" : "ltr" }, text.length > 90 ? text.slice(0, 88) + "…" : text), h("button", { class: "sel-x", type: "button", "aria-label": "Close", onclick: close }, "✕"));
    const btn = (label, fn, cls) => h("button", { class: "btn mini " + (cls || ""), type: "button", onclick: fn }, label);
    const say = (slow) => PTE.say(text, arabic ? "ar" : "en", slow ? 0.6 : undefined);
    const doTranslate = async () => {
      const row = h("div", { class: "sel-row" }, h("small", null, "🌐 …")); out.appendChild(row);
      if (local && single) row.replaceChildren(h("div", null, h("b", null, "📚 Course word"), PTE.ar(local.ar), h("small", null, local.pos + (local.forms ? " · " + local.forms : "")), local.ex ? h("p", null, h("i", null, local.ex)) : null, local.exAr ? PTE.ar(local.exAr) : null));
      const tr = await translate(text, arabic ? "ar" : "en", arabic ? "en" : "ar");
      const res = h("div", { class: "sel-row" });
      if (tr) { res.appendChild(h("small", null, "🌐 " + (arabic ? "English" : "العربية"))); res.appendChild(arabic ? h("div", null, tr, " ", PTE.speakBtn(tr, "en")) : h("div", null, PTE.ar(tr), PTE.speakBtn(tr, "ar", "استمع"))); }
      else res.appendChild(h("div", null, h("small", { class: "bad-t" }, "Offline or service busy · لا يوجد اتصال"), " ", h("a", { href: "https://translate.google.com/?sl=" + (arabic ? "ar" : "en") + "&tl=" + (arabic ? "en" : "ar") + "&text=" + encodeURIComponent(text), target: "_blank", rel: "noopener" }, "Open Google Translate ↗")));
      if (local && single) row.after(res); else row.replaceWith(res);
      PTE.fx && PTE.fx.pop && PTE.fx.pop(res);
    };
    const doDefine = async () => {
      const row = h("div", { class: "sel-row" }, h("small", null, "📖 …")); out.appendChild(row);
      const d = await define(text.replace(/[^A-Za-z'-]/g, "")); PTE.clear(row);
      if (!d || !d.meanings.length) { row.appendChild(h("small", null, "No definition found / offline · لا يوجد تعريف")); return; }
      row.appendChild(h("div", null, h("b", null, text), " ", h("span", { class: "ipa" }, d.phonetic || ""), d.meanings.map((m) => h("p", null, h("span", { class: "chip" }, m.pos), " ", m.def, m.ex ? h("small", null, " — “" + m.ex + "”") : null))));
    };
    const doAdd = async () => {
      let ar = local && local.ar; if (!ar) { const t = await translate(text, arabic ? "ar" : "en", arabic ? "en" : "ar"); ar = t || "—"; }
      if (arabic) addMyWord(ar === "—" ? text : ar, text, text); else addMyWord(text, ar, local ? local.ex : text);
    };
    const bar = h("div", { class: "sel-bar" }, btn("🔊 Listen", () => say(false)), btn("🐢 Slow", () => say(true)), btn("🌐 Translate · ترجم", doTranslate, "yellow"), single ? btn("📖 Meaning", doDefine) : null, !arabic && words <= 3 ? btn("➕ My words", doAdd, "ghost") : null);
    box.appendChild(head); box.appendChild(bar); box.appendChild(out);
    box.classList.add("open");
    if (S().settings.autoTranslate) doTranslate();
    if (PTE.fx && window.gsap && !document.body.classList.contains("drive-on")) gsap.fromTo(box, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: "power2.out", clearProps: "transform,opacity" });
  }

  /* ---------- selection detection (debounced; works with long-press on mobile and double-click on desktop) ---------- */
  let timer = null;
  function check() {
    if (S().settings.selHelper === false) return;
    if (document.body.classList.contains("drive-on")) return;
    const s = window.getSelection && window.getSelection(); if (!s || s.isCollapsed || !s.rangeCount) return;
    const text = s.toString().replace(/\s+/g, " ").trim(); if (!text || text.length > 300 || !hasLetters(text)) return;
    const node = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement);
    if (!node || node.closest("#selsheet, #top, #side, #bottom, #morepanel, input, textarea, select, .drive, .timer")) return;
    if (text === sel.text && sel.box && sel.box.classList.contains("open")) return;
    show(text);
  }
  const later = () => { clearTimeout(timer); timer = setTimeout(check, 380); };
  document.addEventListener("selectionchange", later);
  document.addEventListener("mouseup", later); document.addEventListener("touchend", later, { passive: true });
  window.addEventListener("hashchange", close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
})();

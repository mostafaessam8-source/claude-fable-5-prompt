/* FX layer — GSAP + ScrollTrigger (animation), Lenis (smooth scroll), and vanilla ports of React Bits ideas:
   BlurText · CountUp · ShinyText · SpotlightCard · Magnet · ClickSpark · Squares-style moving tracks · AnimatedContent.
   Everything is progressive: no libs / reduced-motion / "Animations" switched off  ->  the site works exactly as before.
   Never active inside Drive mode (battery, no distractions). */
(function () {
  "use strict";
  const PTE = window.PTE, h = PTE.h;
  const has = () => !!(window.gsap);
  const reduce = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = () => window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const on = () => has() && !reduce() && PTE.store.get().settings.fx !== false;

  const fx = (PTE.fx = { lenis: null, cleanups: [], pointer: { x: 0, y: 0 }, ready: false });

  /* ---------- Lenis smooth scroll + GSAP ticker ---------- */
  fx.init = function () {
    if (fx.ready) return; fx.ready = true;
    if (window.gsap && window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
    if (!on()) return;
    if (window.Lenis) {
      try {
        fx.lenis = new Lenis({ duration: 1.05, smoothWheel: true, allowNestedScroll: true, autoRaf: false });
        document.documentElement.classList.add("lenis");
        gsap.ticker.add((t) => fx.lenis && fx.lenis.raf(t * 1000)); gsap.ticker.lagSmoothing(0);
        if (window.ScrollTrigger) fx.lenis.on("scroll", ScrollTrigger.update);
      } catch (e) { fx.lenis = null; }
    }
    document.addEventListener("pointermove", (e) => { fx.pointer.x = e.clientX; fx.pointer.y = e.clientY; }, { passive: true });
    document.addEventListener("pointerdown", (e) => { if (!on() || document.body.classList.contains("drive-on")) return; const t = e.target.closest && e.target.closest(".btn,.choice,.stn,.line-card,.bnav,.task,.navlink"); if (t) fx.spark(e.clientX, e.clientY); }, { passive: true });
    /* pause everything while Drive mode is open */
    new MutationObserver(() => { const d = document.body.classList.contains("drive-on"); if (fx.lenis) d ? fx.lenis.stop() : fx.lenis.start(); }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  };

  fx.cleanup = function () {
    fx.cleanups.forEach((f) => { try { f(); } catch (e) { /* ignore */ } }); fx.cleanups = [];
    if (window.ScrollTrigger) ScrollTrigger.getAll().forEach((t) => t.kill());
  };

  /* ---------- ClickSpark (React Bits) ---------- */
  fx.spark = function (x, y, n, color) {
    if (!on()) return; n = n || 8;
    const box = h("div", { class: "fx-sparks", "aria-hidden": "true" }); document.body.appendChild(box);
    const cols = ["#F1B434", "#59CBE8", "#FFFFFF", "#71B2C9"];
    for (let i = 0; i < n; i++) {
      const s = h("i", { style: { left: x + "px", top: y + "px", background: color || cols[i % cols.length] } }); box.appendChild(s);
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.4, d = 22 + Math.random() * 26;
      gsap.fromTo(s, { x: 0, y: 0, opacity: 1, scaleY: 1, rotation: (a * 180) / Math.PI }, { x: Math.cos(a) * d, y: Math.sin(a) * d, opacity: 0, scaleY: 0.2, duration: 0.55, ease: "power2.out" });
    }
    setTimeout(() => box.remove(), 700);
  };
  fx.burst = function () { fx.spark(fx.pointer.x || innerWidth / 2, fx.pointer.y || innerHeight / 2, 14); };

  /* ---------- helpers ---------- */
  function splitWords(el) {
    /* BlurText: wrap the words of the element's first text node in spans (Latin text only — Arabic letters must stay joined) */
    const node = Array.from(el.childNodes).find((n) => n.nodeType === 3 && n.textContent.trim()); if (!node) return [];
    const frag = document.createDocumentFragment(), spans = [];
    node.textContent.split(/(\s+)/).forEach((w) => { if (!w) return; if (/^\s+$/.test(w)) { frag.appendChild(document.createTextNode(w)); return; } const s = h("span", { class: "fx-w" }, w); spans.push(s); frag.appendChild(s); });
    node.replaceWith(frag); return spans;
  }

  /* ---------- per-page enhancement ---------- */
  fx.enhance = function (root) {
    if (!on() || document.body.classList.contains("drive-on")) return;
    const main = root || document.getElementById("main"); if (!main) return;
    try {
      if (fx.lenis) fx.lenis.scrollTo(0, { immediate: true, force: true });

      /* page transition */
      gsap.fromTo(main, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.4, ease: "power2.out", clearProps: "transform,opacity" });

      /* BlurText on page titles */
      main.querySelectorAll(".pagehead h1, .hero h1, .hero h2").forEach((el) => {
        const sp = splitWords(el); if (!sp.length) return;
        gsap.from(sp, { opacity: 0, filter: "blur(10px)", y: -14, duration: 0.6, ease: "power2.out", stagger: 0.07, clearProps: "filter,opacity,transform" });
      });

      /* ShinyText on hero kicker */
      main.querySelectorAll(".hero > small").forEach((el) => el.classList.add("fx-shiny"));

      /* Squares-style moving tracks inside heroes */
      main.querySelectorAll(".hero").forEach((hero) => {
        [0, 1, 2].forEach((i) => { const t = h("i", { class: "fx-track", "aria-hidden": "true", style: { right: 20 + i * 54 + "px" } }); hero.appendChild(t); gsap.to(t, { xPercent: i % 2 ? -60 : 60, duration: 5 + i * 1.7, repeat: -1, yoyo: true, ease: "sine.inOut" }); });
      });

      /* CountUp on KPI numbers */
      main.querySelectorAll(".kpi b, .big-word").forEach((el) => {
        const txt = el.textContent.trim(); const m = txt.match(/^(\D*)(\d+)(\D*)$/); if (!m) return; const end = +m[2]; if (end < 2 || end > 99999) return;
        const o = { v: 0 }; gsap.to(o, { v: end, duration: 1.1, ease: "power2.out", onUpdate: () => { el.textContent = m[1] + Math.round(o.v) + m[3]; }, onComplete: () => { el.textContent = txt; } });
      });

      /* animated progress bars */
      main.querySelectorAll(".bar i").forEach((i) => { const w = i.style.width || "0%"; gsap.fromTo(i, { width: "0%" }, { width: w, duration: 0.9, ease: "power2.out", delay: 0.15 }); });

      /* AnimatedContent / FadeContent: staggered reveal on scroll */
      const items = Array.from(main.querySelectorAll(".card, .line-card, .kpi, .task, .stn, .dcell, .tab")).slice(0, 80);
      const vh = innerHeight; let k = 0;
      items.forEach((el) => {
        if (el.closest(".drive") || el.closest("details:not([open])") || el.offsetParent === null) return; /* never hide what is not laid out (closed <details>) */
        const r = el.getBoundingClientRect();
        if (r.top < vh * 0.95) { gsap.from(el, { opacity: 0, y: 26, duration: 0.55, delay: 0.1 + Math.min(k++, 10) * 0.05, ease: "power2.out", clearProps: "transform,opacity" }); }
        else if (window.ScrollTrigger) { gsap.set(el, { opacity: 0, y: 30 }); let shown = false; const reveal = (fast) => { if (shown) return; shown = true; gsap.to(el, { opacity: 1, y: 0, duration: fast ? 0.01 : 0.55, ease: "power2.out", clearProps: "transform,opacity" }); }; ScrollTrigger.create({ trigger: el, start: "top 94%", onEnter: () => reveal(false), onLeave: () => reveal(true), onEnterBack: () => reveal(true) }); }
      });
      /* safety net: nothing may stay invisible (e.g. content changed height after layout) */
      const safety = setTimeout(() => { window.ScrollTrigger && ScrollTrigger.refresh(); }, 600); fx.cleanups.push(() => clearTimeout(safety));

      if (fine()) {
        /* SpotlightCard */
        main.querySelectorAll(".card, .line-card").forEach((el) => { el.classList.add("fx-spot"); el.addEventListener("pointermove", (e) => { const r = el.getBoundingClientRect(); el.style.setProperty("--mx", e.clientX - r.left + "px"); el.style.setProperty("--my", e.clientY - r.top + "px"); }, { passive: true }); });
        /* Magnet */
        main.querySelectorAll(".btn.big, .hero .btn").forEach((el) => {
          const mv = (e) => { const r = el.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); if (Math.abs(dx) < r.width / 2 + 50 && Math.abs(dy) < r.height / 2 + 50) gsap.to(el, { x: dx * 0.22, y: dy * 0.22, duration: 0.3, ease: "power2.out" }); else gsap.to(el, { x: 0, y: 0, duration: 0.4, ease: "power3.out" }); };
          window.addEventListener("pointermove", mv, { passive: true }); fx.cleanups.push(() => window.removeEventListener("pointermove", mv));
        });
      }
    } catch (e) { console.warn("fx", e); main.querySelectorAll("*").forEach((n) => { if (n.style && n.style.opacity === "0") n.style.opacity = ""; }); }
  };

  /* pop animation for results / correct answers (called from PTE.choices etc.) */
  fx.pop = function (el) { if (!on() || !el) return; gsap.fromTo(el, { scale: 0.96 }, { scale: 1, duration: 0.45, ease: "back.out(2.5)", clearProps: "transform" }); };
  fx.setEnabled = function (v) { PTE.store.get().settings.fx = v; PTE.store.save(); location.reload(); };
})();

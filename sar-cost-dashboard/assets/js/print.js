/*
 * A4 printing.
 *
 * "One page" mode (default, also used for Ctrl+P): every scroll area is expanded so all rows print,
 * the page is laid out, and the whole page is scaled to fit a single A4 sheet (portrait or landscape,
 * whichever gives the larger scale). The layout width is widened as the scale shrinks, so tables wrap
 * less and the sheet is filled as fully as possible.
 *
 * Scaling uses CSS `zoom`, which shrinks the real layout box. (A transform only shrinks the picture:
 * the unscaled box stays larger than the paper, and Chrome's print preview then shrinks the whole
 * document again and adds blank pages.) A small safety margin absorbs printer/font differences.
 *
 * "Full size" mode: same expansion, fitted to the A4 width only, flowing over as many pages as needed.
 */
(function () {
  "use strict";
  var MM = 96 / 25.4, MARGIN = 8, SAFE_W = 0.985, SAFE_H = 0.955; // MARGIN must match @page in styles.css
  var mode = "fit", active = false, headEl = null, sheet = null, styleEl = null, squeezed = [];

  /** Printable area of an A4 sheet in CSS px, less a safety margin. */
  function dims(orient) {
    var w = orient === "portrait" ? 210 : 297, h = orient === "portrait" ? 297 : 210;
    return { W: Math.floor((w - 2 * MARGIN) * MM * SAFE_W), H: Math.floor((h - 2 * MARGIN) * MM * SAFE_H) };
  }
  function setPage(orient) {
    if (!styleEl) { styleEl = document.createElement("style"); document.head.appendChild(styleEl); }
    styleEl.textContent = "@page { size: A4 " + orient + "; margin: " + MARGIN + "mm; }";
  }
  /** Apply zoom, then correct it using the real zoomed size (text rounding at small zoom adds height). */
  function applyZoom(z, d) {
    for (var k = 0; k < 8; k++) {
      sheet.style.zoom = z;
      var b = sheet.getBoundingClientRect();
      if (b.height <= d.H && b.width <= d.W) break;
      z = z * Math.min(d.H / b.height, d.W / b.width) * 0.995;
    }
  }
  /** Tall bar charts are made denser on paper (thinner bars), which lets the page print larger. */
  function squeezeCharts() {
    squeezed = [];
    sheet.querySelectorAll(".chart-box").forEach(function (b) {
      var h = b.offsetHeight;
      if (h > 380) { squeezed.push([b, b.style.height]); b.style.height = Math.max(300, Math.round(h * 0.68)) + "px"; }
    });
  }
  function main() { return document.getElementById("view"); } // <main class="content" id="view">

  function layoutAt(width) {
    var v = sheet;
    v.style.width = Math.round(width) + "px";
    UI.eachChart(function (c) { c.resize(); });
    return { w: v.scrollWidth, h: v.scrollHeight };
  }

  /**
   * Scale that fits the page into W×H. Laying the page out wider makes it shorter, so we search the
   * layout width Lw (from W up to 6×W) that maximises s(Lw) = min(W / contentWidth, H / contentHeight).
   * When fitHeight is false only the width is fitted (multi-page printing).
   */
  function fit(W, H, fitHeight) {
    function at(Lw) {
      var m = layoutAt(Lw);
      return { Lw: Lw, h: m.h, s: Math.min(1, W / Math.max(m.w, Lw), fitHeight ? H / m.h : 1) };
    }
    var best = at(W);
    if (fitHeight && best.s < 1) {
      var lo = W, hi = W * 6;
      for (var i = 0; i < 12; i++) {                 // bisection on the crossing W/Lw = H/h(Lw)
        var mid = Math.sqrt(lo * hi), r = at(mid);
        if (r.s > best.s) best = r;
        if (W / mid > H / r.h) lo = mid; else hi = mid;
        if (hi / lo < 1.01) break;
      }
    }
    var fin = at(best.Lw);
    return { s: fin.s, width: fin.Lw, h: fin.h };
  }

  function buildHead() {
    var title = (document.querySelector(".page-title h2") || {}).textContent || "";
    var sub = (document.querySelector(".page-title p") || {}).textContent || "";
    var rep = (document.getElementById("reportChip") || {}).textContent || "";
    var chips = Array.prototype.map.call(document.querySelectorAll(".filters .fchip"), function (c) { return c.textContent.replace(/\s*×\s*$/, ""); });
    var sel = Array.prototype.map.call(document.querySelectorAll(".filters select"), function (s) {
      var lab = s.closest(".filter").querySelector("label"); return (lab ? lab.textContent + ": " : "") + s.options[s.selectedIndex].text;
    });
    var filters = chips.concat(sel);
    var h = document.createElement("div");
    h.className = "print-head";
    h.innerHTML = '<img src="assets/img/sar-logo.png" alt="SAR"><div class="ph-title"><b>' + UI.esc(title) + "</b><span>" + UI.esc(sub) + '</span></div>' +
      '<div class="ph-meta"><span>' + UI.esc(rep.replace(/\s+/g, " ").trim()) + "</span>" +
      "<span>Filters: " + UI.esc(filters.length ? filters.join(" · ") : "All data (no filters)") + "</span>" +
      "<span>Printed " + UI.esc(new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })) + "</span></div>";
    return h;
  }

  function prepare() {
    if (active) return;
    active = true;
    var mc = main();
    document.body.classList.add("printing", mode === "fit" ? "print-fit" : "print-flow");
    // Move the page into a "sheet" wrapper that is laid out and scaled; <main> becomes the A4 frame.
    sheet = document.createElement("div");
    sheet.className = "print-sheet";
    while (mc.firstChild) sheet.appendChild(mc.firstChild);
    mc.appendChild(sheet);
    headEl = buildHead();
    sheet.insertBefore(headEl, sheet.firstChild);
    UI.eachChart(function (c) { c.options.devicePixelRatio = 2.5; });

    squeezeCharts();
    if (mode === "fit") {
      var L = dims("landscape"), P = dims("portrait");
      var fl = fit(L.W, L.H, true), fp = fit(P.W, P.H, true);
      var orient = fp.s > fl.s * 1.05 ? "portrait" : "landscape";
      var d = orient === "portrait" ? P : L;
      var r = fit(d.W, d.H, true);   // re-apply the chosen layout width
      setPage(orient);
      applyZoom(r.s, d);
    } else {
      var dl = dims("landscape"), rr = fit(dl.W, dl.H, false);
      setPage("landscape");
      if (rr.s < 1) sheet.style.zoom = rr.s;
    }
  }

  function restore() {
    if (!active) return;
    active = false;
    var mc = main();
    document.body.classList.remove("printing", "print-fit", "print-flow");
    if (headEl) { headEl.remove(); headEl = null; }
    squeezed.forEach(function (x) { x[0].style.height = x[1]; }); squeezed = [];
    if (sheet) { while (sheet.firstChild) mc.insertBefore(sheet.firstChild, sheet); sheet.remove(); sheet = null; }
    mc.style.width = ""; mc.style.height = "";
    UI.eachChart(function (c) { c.options.devicePixelRatio = undefined; c.resize(); });
    mode = "fit";
  }

  window.addEventListener("beforeprint", prepare);
  window.addEventListener("afterprint", restore);

  function print(m) {
    mode = m || "fit";
    prepare();
    // let the browser paint the prepared layout before opening the dialog
    setTimeout(function () { window.print(); setTimeout(restore, 300); }, 60);
  }

  /** Print button with a small menu, placed in the page's action bar. */
  function button() {
    var wrap = UI.el('<div class="print-wrap"><button class="icon-btn" type="button" title="Print this page on one A4 sheet">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z"/></svg><span>Print A4</span></button>' +
      '<button class="icon-btn ghost pw-more" type="button" title="More print options" aria-label="More print options">▾</button></div>');
    wrap.querySelector("button").addEventListener("click", function () { print("fit"); });
    wrap.querySelector(".pw-more").addEventListener("click", function (e) {
      e.stopPropagation();
      var old = wrap.querySelector(".ms-pop"); if (old) { old.remove(); return; }
      var pop = UI.el('<div class="ms-pop print-pop"><button type="button" data-m="fit"><b>A4 — whole page on one sheet</b><span>All data, scaled to fit a single A4 page (orientation chosen automatically)</span></button>' +
        '<button type="button" data-m="flow"><b>A4 — full size, multiple sheets</b><span>All data at readable size, fitted to the A4 width</span></button></div>');
      pop.querySelectorAll("[data-m]").forEach(function (b) { b.addEventListener("click", function () { pop.remove(); print(b.getAttribute("data-m")); }); });
      document.addEventListener("click", function off() { pop.remove(); document.removeEventListener("click", off); });
      wrap.appendChild(pop);
    });
    return wrap;
  }

  window.SARPrint = { print: print, button: button, prepare: function (m) { mode = m || "fit"; prepare(); }, restore: restore };
})();

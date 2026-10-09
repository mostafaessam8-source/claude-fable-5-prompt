/**
 * "Progress Slide" — one SAR-branded PowerPoint slide with a project's progress, for sharing outside SAR.
 * Pick a project (weekly progress report) → the form is filled from the dashboard data (overall progress, progress by
 * work stage, key dates, recent works, next steps, a site photo); edit any text, then download the .pptx.
 * Progress only: no S-curve, no planned %, no variance, no costs, no issues.
 * Layout = SAR template (LAYOUT_WIDE): logo + breadcrumb, title with the diagonal accent, SAR Blue baseline with the
 * circle node; colours and fonts from the SAR brand guidelines. Built with PptxGenJS (assets/vendor, loaded on demand).
 */
(function () {
  "use strict";
  var U = window.UI, esc = U.esc;
  var C = { blue: "00778B", black: "3D3935", slate: "768692", mid: "71B2C9", cool: "C8C9C7", tint05: "F2F8F9", tint10: "E6F1F4", white: "FFFFFF" };
  var F = "Diodrum Arabic";
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var MONL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  function iso(v) {
    if (v == null || v === "") return "";
    if (v instanceof Date) return isNaN(v) ? "" : v.toISOString().slice(0, 10);
    if (typeof v === "number") return v > 20000 && v < 80000 ? new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10) : "";
    var m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v)); return m ? m[1] : "";
  }
  function num(v) { var n = typeof v === "number" ? v : parseFloat(String(v == null ? "" : v).replace(/[,%]/g, "")); return isNaN(n) ? null : n; }
  function dLong(s) { s = iso(s); return s ? (+s.slice(8, 10)) + " " + MON[+s.slice(5, 7) - 1] + " " + s.slice(0, 4) : ""; }
  function dMonth(s) { s = iso(s); return s ? MON[+s.slice(5, 7) - 1] + " " + s.slice(0, 4) : ""; }
  function dFull(s) { s = iso(s); return s ? (+s.slice(8, 10)) + " " + MONL[+s.slice(5, 7) - 1] + " " + s.slice(0, 4) : ""; }
  function clip(t, n) { t = String(t || "").replace(/\s+/g, " ").trim().replace(/^[-•*\d.)\s]+/, ""); if (t.length <= n) return t; var c = t.slice(0, n), k = c.lastIndexOf(" "); return (k > n * 0.6 ? c.slice(0, k) : c).replace(/[,;:\-–(]+$/, "") + "…"; }
  function titleCase(s) {
    s = String(s || "").replace(/\s*-\s*(critical|weekly dashboard)\b.*$/i, "").replace(/\s+/g, " ").trim();
    if (s !== s.toUpperCase()) return s;
    return s.toLowerCase().replace(/(^|[\s\-–(\/])([a-z])/g, function (_, p, c) { return p + c.toUpperCase(); }).replace(/\b(Of|And|The|For|On|In|At|To)\b/g, function (w) { return w.toLowerCase(); }).replace(/^./, function (c) { return c.toUpperCase(); });
  }

  /* everything the slide needs for one project, from the dashboard data */
  function projectData(D, code) {
    var wk = D.t("Weekly_Report_Updates").filter(function (r) { return String(r["Project Code"]) === code; })
      .sort(function (a, b) { return iso(a["Report Date"]).localeCompare(iso(b["Report Date"])); });
    var w = wk[wk.length - 1] || {}, src = w["Source.Name"], card = D.t("Project_Cards").filter(function (c) { return c.Code === code; })[0] || {};
    var rd = iso(w["Report Date"]) || D.reportDate || new Date().toISOString().slice(0, 10);
    var ms = D.t("Project_Milestones_Progress_Combine").filter(function (x) { return x["Source.Name"] === src; });
    if (!ms.length) ms = D.t("Project_Milestones_Progress").filter(function (x) { return x["Source.Name"] === src; });
    var stages = ms.filter(function (x) { return !/^overall$/i.test(String(x.Description || x.WSB || "").trim()) && num(x["Actual Progress"]) != null; })
      .sort(function (a, b) { return (num(a.Sort) || 0) - (num(b.Sort) || 0); }).slice(0, 5)
      .map(function (x) { return { label: clip(x.Description || x.WSB, 40), v: Math.max(0, Math.min(1, num(x["Actual Progress"]))) }; });
    var ach = D.t("Weekly_Achievements").filter(function (y) { return y["Source.Name"] === src && y["Work Description"]; })
      .sort(function (a, b) { return (num(a["Sr. No."]) || 0) - (num(b["Sr. No."]) || 0); }).map(function (y) { return clip(y["Work Description"], 70); });
    if (!ach.length && w["Achievements Description"]) ach = [clip(w["Achievements Description"], 70)];
    var nxt = D.t("Lookahead_Activities").filter(function (y) { return y["Source.Name"] === src && y["Lookahead Activities (7 Days) Description"]; })
      .map(function (y) { return clip(y["Lookahead Activities (7 Days) Description"], 70); });
    var fe = iso(w["End Date (Forecast/Actual)"]), be = iso(w["End Date Baseline"]);
    return {
      code: code, src: src, rd: rd,
      title: titleCase(w["Project Name"] || card.Name || code),
      contractor: String(w.Contractor || "").split(/\s+\+\s+/)[0].trim(),
      overall: num(w["Actual (%) - Cumulative"]),
      stages: stages,
      start: iso(w["(Con) Contract Effective Date"]) || iso(w["Start Date (Forecast/Actual)"]) || iso(w["Start Date Baseline"]),
      finish: fe && fe >= rd ? fe : be || fe,           // a forecast already in the past is not shown as the target
      recent: ach.filter(function (t, i) { return ach.indexOf(t) === i; }).slice(0, 3),
      next: nxt.filter(function (t, i) { return nxt.indexOf(t) === i; }).slice(0, 3)
    };
  }

  function loadPptx() {
    if (window.PptxGenJS) return Promise.resolve(window.PptxGenJS);
    return new Promise(function (res, rej) {
      var keep = window.JSZip, s = document.createElement("script");
      s.src = "assets/vendor/pptxgen.bundle.js" + (window.SAR_VERSION ? "?v=" + window.SAR_VERSION : "");
      s.onload = function () { if (keep) window.JSZip = keep; window.PptxGenJS ? res(window.PptxGenJS) : rej(new Error("PptxGenJS did not load")); };
      s.onerror = function () { rej(new Error("assets/vendor/pptxgen.bundle.js is missing")); };
      document.head.appendChild(s);
    });
  }
  function b64(buf) { var u = new Uint8Array(buf), s = ""; for (var i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
  function logoData() {
    return fetch("assets/img/sar-logo.png").then(function (r) { return r.arrayBuffer(); }).then(function (buf) {
      return new Promise(function (res) {
        var data = "data:image/png;base64," + b64(buf), im = new Image();
        im.onload = function () { res({ data: data.slice(5), ratio: im.naturalWidth / im.naturalHeight }); };
        im.onerror = function () { res({ data: data.slice(5), ratio: 389 / 112 }); };
        im.src = data;
      });
    });
  }

  /* the slide (approved progress-update layout) */
  function build(P, d, logo, photo) {
    var pres = new P(); pres.layout = "LAYOUT_WIDE"; pres.title = d.code + " – Progress Update"; pres.company = "Saudi Arabia Railways";
    var s = pres.addSlide(), SH = pres.ShapeType;
    function wedge(o) {
      var flip = { BL: {}, BR: { flipH: true }, TL: { flipV: true }, TR: { flipH: true, flipV: true } }[o.corner || "TL"];
      var fill = o.transparency == null ? { color: o.color } : { color: o.color, transparency: o.transparency };
      s.addShape(SH.rtTriangle, Object.assign({ x: o.x, y: o.y, w: o.w, h: o.h, fill: fill, line: { color: o.color, width: 0 } }, flip));
    }
    function stripe(x, y, w, h, color) { s.addShape(SH.parallelogram, { x: x, y: y, w: w, h: h, fill: { color: color }, line: { color: color, width: 0 } }); }
    function head(x, y, w, t, col) { stripe(x, y + 0.03, 0.12, 0.24, col || C.blue); s.addText(t, { x: x + 0.2, y: y, w: w - 0.2, h: 0.3, fontSize: 12, bold: true, color: C.blue, fontFace: F, margin: 0 }); }
    // chrome: logo, breadcrumb, baseline rule with the circle node
    var lh = 0.30; s.addImage({ data: logo.data, x: 0.45, y: 0.30, w: +(lh * logo.ratio).toFixed(3), h: lh });
    s.addText("NSR Program  |  Project Progress Update", { x: 7.4, y: 0.30, w: 5.5, h: 0.25, align: "right", fontSize: 9, color: C.slate, fontFace: F, margin: 0 });
    s.addShape(SH.line, { x: 0.45, y: 6.95, w: 12.43, h: 0, line: { color: C.blue, width: 1 } });
    s.addShape(SH.ellipse, { x: 12.6, y: 6.83, w: 0.24, h: 0.24, fill: { color: C.white }, line: { color: C.blue, width: 1 } });
    // title
    stripe(0.45, 0.92, 0.20, 0.52, C.blue);
    s.addText(d.title, { x: 0.85, y: 0.88, w: 11.7, h: 0.5, fontSize: d.title.length > 60 ? 18 : 22, bold: true, color: C.blue, fontFace: F, margin: 0, valign: "middle", fit: "shrink" });
    s.addText(["Project " + d.code, "Progress update as of " + dFull(d.rd), d.contractor ? "Contractor: " + d.contractor : ""].filter(Boolean).join("  ·  "),
      { x: 0.85, y: 1.34, w: 11.7, h: 0.3, fontSize: 11, color: C.slate, fontFace: F, margin: 0 });
    // overall progress ring
    var act = Math.max(0, Math.min(100, (d.overall || 0) * 100));
    head(0.85, 1.85, 3.4, "Overall progress");
    s.addChart(pres.charts.DOUGHNUT, [{ name: "Progress", labels: ["Completed", "Remaining"], values: [act, 100 - act] }],
      { x: 0.85, y: 2.2, w: 3.3, h: 2.55, holeSize: 72, chartColors: [C.blue, C.tint10], showLegend: false, showValue: false, showPercent: false, showLabel: false, firstSliceAng: 0, dataBorder: { pt: 0, color: "FFFFFF" } });
    s.addText([{ text: (Math.round(act * 10) / 10) + "%", options: { fontSize: 24, bold: true, color: C.blue, breakLine: true } }, { text: "complete", options: { fontSize: 10, color: C.slate } }],
      { x: 0.85, y: 3.05, w: 3.3, h: 0.85, align: "center", valign: "middle", fontFace: F, margin: 0 });
    // progress by work stage
    var rx = 4.55, rw = 4.4, n = d.stages.length, gap = n > 4 ? 0.46 : 0.56;
    head(rx, 1.85, rw, "Progress by work stage");
    d.stages.forEach(function (st, i) {
      var y = 2.35 + i * gap, a = Math.max(0, Math.min(1, st.v));
      s.addText(st.label, { x: rx, y: y, w: rw - 0.8, h: 0.24, fontSize: 11, color: C.black, fontFace: F, margin: 0, valign: "middle" });
      s.addText(Math.round(a * 100) + "%", { x: rx + rw - 0.8, y: y, w: 0.8, h: 0.24, fontSize: 11, bold: true, color: C.blue, fontFace: F, margin: 0, align: "right", valign: "middle" });
      s.addShape(SH.rect, { x: rx, y: y + 0.29, w: rw, h: 0.13, fill: { color: C.tint10 }, line: { color: C.tint10, width: 0 } });
      s.addShape(SH.rect, { x: rx, y: y + 0.29, w: Math.max(0.04, rw * a), h: 0.13, fill: { color: a >= 0.999 ? C.slate : C.blue }, line: { width: 0, color: C.blue } });
    });
    // site photo with the diagonal cut
    if (photo) {
      var px = 9.3, py = 1.85, pw = 3.3, ph = 2.95;
      s.addImage({ data: photo.data, x: px, y: py, w: pw, h: ph, sizing: { type: "cover", w: pw, h: ph } });
      wedge({ x: px - 0.05 - 0.12, y: py, w: 0.85, h: ph, corner: "TL", color: C.blue });   // SAR Blue band along the cut
      wedge({ x: px - 0.05, y: py, w: 0.85, h: ph, corner: "TL", color: C.white });
      if (d.caption) s.addText(d.caption, { x: px + 0.9, y: py + ph + 0.05, w: pw - 0.9, h: 0.22, fontSize: 9, italic: true, color: C.slate, fontFace: F, margin: 0, align: "right" });
    }
    // key dates · recent works · next steps
    var by = 5.2, cw = 3.7, cg = 0.32;
    head(0.85, by, cw, "Key dates");
    [["Contract start", dLong(d.start)], ["Target completion", dMonth(d.finish)]].forEach(function (kv, i) {
      if (!kv[1]) return;
      var y = by + 0.42 + i * 0.5;
      s.addShape(SH.rect, { x: 0.85, y: y, w: cw, h: 0.42, fill: { color: C.tint05 }, line: { color: C.tint05, width: 0 } });
      s.addText(kv[0], { x: 1.0, y: y, w: 1.9, h: 0.42, fontSize: 11, color: C.slate, fontFace: F, margin: 0, valign: "middle" });
      s.addText(kv[1], { x: 2.8, y: y, w: cw - 2.1, h: 0.42, fontSize: 12, bold: true, color: C.black, fontFace: F, margin: 0, valign: "middle", align: "right" });
    });
    [["Recent works", d.recent, C.blue], ["Next steps", d.next, C.mid]].forEach(function (b, k) {
      var x = 0.85 + (k + 1) * (cw + cg), items = b[1].filter(Boolean).slice(0, 3);
      if (!items.length) return;
      head(x, by, cw, b[0], b[2]);
      s.addText(items.map(function (t, j) { return { text: t, options: { bullet: { code: "25A0" }, breakLine: j < items.length - 1 } }; }),
        { x: x, y: by + 0.42, w: cw, h: 1.15, fontSize: 11, color: C.black, fontFace: F, margin: 0, valign: "top", paraSpaceAfter: 4, fit: "shrink" });
    });
    s.addText("Source: contractor weekly progress report, " + dLong(d.rd), { x: 0.45, y: 7.02, w: 6, h: 0.22, fontSize: 9, color: C.slate, fontFace: F, margin: 0 });
    s.addText("SAR.COM.SA", { x: 10.4, y: 7.02, w: 2.0, h: 0.22, fontSize: 9, color: C.slate, fontFace: F, margin: 0, align: "right" });
    return pres;
  }

  function open() {
    var D = window.SARApp.D;
    var codes = []; D.t("Weekly_Report_Updates").forEach(function (r) { var c = String(r["Project Code"] || "").trim(); if (c && codes.indexOf(c) < 0) codes.push(c); });
    codes.sort();
    var body = U.modal("Progress Slide", "", true);
    if (!codes.length) { body.innerHTML = '<div class="note-box warn">No weekly progress reports loaded — import the PBI Weekly Report on Data Import first.</div>'; return; }
    var names = {}; D.t("Weekly_Report_Updates").forEach(function (r) { names[String(r["Project Code"])] = titleCase(r["Project Name"]); });
    body.innerHTML = '<div class="ps-wrap"><div class="ps-top"><label>Project <select class="ps-proj">' + codes.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c + " – " + names[c]) + "</option>"; }).join("") +
      '</select></label><span class="muted">One SAR slide with the project\'s progress only (no plan, variance or costs) — for sharing outside SAR. Edit any text below, then download.</span></div><div class="ps-form"></div></div>';
    var form = body.querySelector(".ps-form"), sel = body.querySelector(".ps-proj"), state = null, photos = [];
    function fill() {
      var d = state = projectData(D, sel.value);
      var ph = window.SARPhotos ? SARPhotos.load().then(function (st) { return SARPhotos.forProject(st, d.src, d.code) || []; }) : Promise.resolve([]);
      ph.then(function (list) {
        photos = list.map(function (p) { return { data: p.type + ";base64," + b64(p.data), url: URL.createObjectURL(new Blob([p.data], { type: p.type })) }; });
        form.innerHTML =
          '<div class="ps-grid"><label class="ps-wide">Title<input class="ps-title" value="' + esc(d.title) + '"></label>' +
          '<label>Contractor<input class="ps-con" value="' + esc(d.contractor) + '"></label>' +
          '<label>Overall progress (%)<input class="ps-ov" type="number" step="0.1" min="0" max="100" value="' + (d.overall == null ? "" : Math.round(d.overall * 1000) / 10) + '"></label>' +
          '<label>Contract start<input class="ps-start" type="date" value="' + esc(d.start) + '"></label>' +
          '<label>Target completion<input class="ps-fin" type="date" value="' + esc(d.finish) + '"></label></div>' +
          '<div class="ps-sub">Progress by work stage <span class="muted">(from the report\'s milestones; up to 5 · empty name = not shown)</span></div><div class="ps-stages">' +
          [0, 1, 2, 3, 4].map(function (i) { var st = d.stages[i] || { label: "", v: null }; return '<div class="ps-st"><input class="ps-sl" value="' + esc(st.label) + '" placeholder="Stage ' + (i + 1) + '"><input class="ps-sv" type="number" step="1" min="0" max="100" value="' + (st.v == null ? "" : Math.round(st.v * 100)) + '"><span>%</span></div>'; }).join("") + "</div>" +
          '<div class="ps-grid2"><label>Recent works <span class="muted">(one per line, max 3)</span><textarea class="ps-rec" rows="4">' + esc(d.recent.join("\n")) + '</textarea></label>' +
          '<label>Next steps <span class="muted">(one per line, max 3)</span><textarea class="ps-nxt" rows="4">' + esc(d.next.join("\n")) + "</textarea></label></div>" +
          '<div class="ps-sub">Site photo <span class="muted">' + (photos.length ? "(click to choose)" : "— none imported for this project (Data Import → weekly report .rar / .zip); the slide is made without one") + "</span></div>" +
          (photos.length ? '<div class="ps-photos">' + photos.map(function (p, i) { return '<img src="' + p.url + '" data-i="' + i + '" class="' + (i === 0 ? "on" : "") + '" alt="">'; }).join("") + '<button type="button" class="ps-nophoto">No photo</button></div>' +
            '<label class="ps-cap">Photo caption<input class="ps-capt" placeholder="optional, e.g. foundation works"></label>' : "") +
          '<div class="ps-acts"><button type="button" class="icon-btn" data-a="go"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v3h16v-3"/></svg><span>Download slide (.pptx)</span></button><span class="ps-msg muted"></span></div>';
        var pick = 0;
        form.querySelectorAll(".ps-photos img").forEach(function (im) { im.addEventListener("click", function () { pick = +im.getAttribute("data-i"); form.querySelectorAll(".ps-photos img, .ps-nophoto").forEach(function (x) { x.classList.remove("on"); }); im.classList.add("on"); }); });
        var np = form.querySelector(".ps-nophoto"); if (np) np.addEventListener("click", function () { pick = -1; form.querySelectorAll(".ps-photos img").forEach(function (x) { x.classList.remove("on"); }); np.classList.add("on"); });
        form.querySelector('[data-a="go"]').addEventListener("click", function () {
          var q = function (c) { return form.querySelector(c); }, msg = q(".ps-msg"), lines = function (c) { return q(c).value.split(/\n+/).map(function (t) { return t.trim(); }).filter(Boolean).slice(0, 3); };
          var d2 = Object.assign({}, state, { title: q(".ps-title").value.trim() || state.title, contractor: q(".ps-con").value.trim(), overall: num(q(".ps-ov").value) == null ? null : num(q(".ps-ov").value) / 100,
            start: q(".ps-start").value, finish: q(".ps-fin").value, recent: lines(".ps-rec"), next: lines(".ps-nxt"), caption: q(".ps-capt") ? q(".ps-capt").value.trim() : "",
            stages: Array.prototype.map.call(form.querySelectorAll(".ps-st"), function (r) { return { label: r.querySelector(".ps-sl").value.trim(), v: num(r.querySelector(".ps-sv").value) }; })
              .filter(function (x) { return x.label && x.v != null; }).map(function (x) { return { label: x.label, v: x.v / 100 }; }) });
          msg.textContent = "Building the slide…";
          Promise.all([loadPptx(), logoData()]).then(function (x) {
            var pres = build(x[0], d2, x[1], pick >= 0 ? photos[pick] : null), name = d2.code + " - Progress Update - " + d2.rd + ".pptx";
            return pres.writeFile({ fileName: name }).then(function () { msg.textContent = "✓ Saved " + name; });
          }).catch(function (e) { console.error(e); msg.innerHTML = '<span class="neg">' + esc(e.message) + "</span>"; });
        });
      });
    }
    sel.addEventListener("change", fill);
    fill();
  }
  var btn = document.getElementById("progSlideBtn");
  if (btn) btn.addEventListener("click", open);
  window.SARProgressSlide = { open: open, projectData: projectData };
})();

/* Design review: the "Engineering Drawings" sheet ("Engineering Log") of each project's weekly report workbook — the same
   .rar / .zip / .xlsx files the progress photos come from — read into the table Engineering_Drawings, and the
   management dashboard "Design Review" built from it.
   window.SARDesign = { fromWorkbook(buffer, file, code) → rows, classify(status, remarks, submitted) → bucket key,
                        model(D, target) → { docs, projects, ... }, page(ctx) } */
(function () {
  "use strict";
  var U = window.UI, esc = U.esc, fmt = U.fmt, C = U.C;

  /* ------------------------------ status buckets ------------------------------ */
  // order = how bad a status is for the design (worst first); "approved" buckets count as done
  var B = {
    D:  { label: "Rejected (Code D)", short: "Rejected", color: "#CB2C30", done: false, owner: "Contractor" },
    C:  { label: "Revise & resubmit (Code C)", short: "Revise & resubmit", color: "#F1B434", done: false, owner: "Contractor" },
    UR: { label: "Under SAR review", short: "Under review", color: "#59CBE8", done: false, owner: "SAR" },
    NR: { label: "Submitted – no status", short: "No status", color: "#C8C9C7", done: false, owner: "Report" },
    NS: { label: "Not submitted yet", short: "Not submitted", color: "#768692", done: false, owner: "Contractor" },
    B:  { label: "Approved with comments (Code B)", short: "Approved (B)", color: "#2A8C9C", done: true },
    AP: { label: "Approved", short: "Approved", color: "#00778B", done: true },
    A:  { label: "Approved (Code A)", short: "Approved (A)", color: "#005A69", done: true },
    X:  { label: "Superseded / cancelled", short: "Superseded", color: "#E6F1F4", done: false, out: true }
  };
  var ORDER = ["A", "AP", "B", "UR", "NR", "C", "D", "NS"];          // stacked-bar order (good → bad → not started)
  var RANK = { D: 1, C: 2, UR: 3, NR: 4, NS: 5, B: 6, AP: 7, A: 8, X: 9 };   // register order: what needs action first
  var SEVERITY = { D: 6, C: 5, UR: 4, NR: 3, B: 2, AP: 1, A: 0 };

  function one(t) {
    t = String(t || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (!t || t === "-" || t === "—") return null;
    if (/supers[e]+d|cancel|descop|void|withdrawn by sar|not required/.test(t)) return "X";
    if (/code\s*-?\s*d\b|^d\b|reject|not approved/.test(t)) return "D";
    if (/code\s*-?\s*c\b|^c\b|revise|resubmi|crs\s*rec|returned|comments? received/.test(t)) return "C";
    if (/under\s*(sar\s*)?review|^ur\b|submitted|pending|in review|awaiting/.test(t)) return "UR";
    if (/code\s*-?\s*a\s*\/\s*b|a\s*\/\s*b\b/.test(t)) return "AP";
    if (/code\s*-?\s*b\b|^b\b|with comment/.test(t)) return "B";
    if (/code\s*-?\s*a\b|^a\b/.test(t)) return "A";
    if (/approv|closed|accepted|no objection/.test(t)) return "AP";
    return "UR";   // any other wording on a submitted document: still with SAR
  }
  /* status (+ remarks) → bucket. A status listing several disciplines ("Str - Code A, Hydro under SAR review") takes the
     worst part. A generic status ("Approved", "Submitted to SAR", blank) takes the code named in the remarks. */
  function classify(status, remarks, submitted) {
    var st = String(status || "").trim(), rm = String(remarks || "").trim();
    var parts = st.split(/\s*(?:,|;|\/\/|\band\b)\s*/i).map(one).filter(Boolean), k = null;
    if (parts.indexOf("X") >= 0 && parts.length === 1) return "X";
    parts.forEach(function (p) { if (p !== "X" && (k == null || SEVERITY[p] > SEVERITY[k])) k = p; });
    var rc = /code\s*-?\s*([abcd])\b/i.exec(rm), rk = rc ? rc[1].toUpperCase() : null;
    if (/descop|supers[e]+d|cancel/i.test(rm) && !k) return "X";
    if (rk && (!k || k === "AP" || k === "UR" && /sent|received|issued|approved/i.test(rm))) k = rk;
    if (!k && /withdrawn|resubmi/i.test(rm)) k = "C";
    if (!k) return submitted ? "NR" : "NS";
    return k;
  }

  /* ------------------------------ reading the sheet ------------------------------ */
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function dateOf(XLSX, cell) {
    if (!cell || cell.v == null || cell.v === "") return "";
    if (cell.t === "d") { var d = cell.v instanceof Date ? cell.v : new Date(cell.v); return isNaN(d) ? "" : d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
    if (cell.t === "n") { if (cell.v < 367) return ""; var p = XLSX.SSF.parse_date_code(cell.v); return p.y + "-" + pad(p.m) + "-" + pad(p.d); }
    var s = String(cell.v).trim(), m;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return m[1] + "-" + pad(+m[2]) + "-" + pad(+m[3]);
    if ((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(s))) return m[3] + "-" + pad(+m[2]) + "-" + pad(+m[1]);   // d-m-yyyy
    var t = U.txtDate ? U.txtDate(s) : ""; return t || "";
  }
  function txt(cell) { if (!cell || cell.v == null) return ""; var s = String(cell.w != null && cell.t !== "s" ? cell.w : cell.v).replace(/\s+/g, " ").trim(); return s; }
  var COLS = [["report", /report\s*date/i, 0], ["code", /project\s*code/i, 1], ["cat", /categor|package|discipline/i, 2], ["desc", /descr|document|title/i, 3],
    ["sub", /submi.*date|date.*submi/i, 4], ["status", /status/i, 5], ["remarks", /remark|comment/i, 6], ["delay", /delay/i, -1]];
  /** rows of the project's engineering drawings sheet; [] when the workbook has none */
  function fromWorkbook(buffer, file, code) {
    var XLSX = window.XLSX; if (!XLSX) return [];
    var names = XLSX.read(buffer, { type: "array", bookSheets: true }).SheetNames || [];
    var sn = names.filter(function (n) { return /^\s*engineering\s*(drawings?|log|documents?|submittals?)\s*$/i.test(n); })[0] ||
      names.filter(function (n) { return /engineering|design\s*(log|submittal)/i.test(n); })[0];
    if (!sn) return [];
    var ws = XLSX.read(buffer, { type: "array", sheets: [sn], cellDates: false, cellNF: true }).Sheets[sn];
    if (!ws || !ws["!ref"]) return [];
    var r = XLSX.utils.decode_range(ws["!ref"]), at = {}, hr = r.s.r;
    function cell(R, c) { return ws[XLSX.utils.encode_cell({ r: R, c: c })]; }
    COLS.forEach(function (k) {   // header text first, else the column's usual place (A … G)
      for (var c = r.s.c; c <= Math.min(r.e.c, 20); c++) if (k[1].test(txt(cell(hr, c))) && !Object.keys(at).some(function (x) { return at[x] === c; })) { at[k[0]] = c; return; }
      if (k[2] >= 0 && !txt(cell(hr, k[2]))) at[k[0]] = k[2];
      else if (k[2] >= 0 && at[k[0]] == null) at[k[0]] = k[2];
    });
    var out = [], n = 0;
    for (var R = hr + 1; R <= r.e.r; R++) {
      var g = function (k) { return at[k] == null ? null : cell(R, at[k]); };
      var desc = txt(g("desc")), cat = txt(g("cat")), st = txt(g("status")), sub = dateOf(XLSX, g("sub"));
      if (!desc && !cat) continue;                       // empty / formula-only rows
      var dl = g("delay"), dv = dl && typeof dl.v === "number" ? dl.v : null;
      out.push({ "Source.Name": file, "Project Code": code || txt(g("code")), "Report Date": dateOf(XLSX, g("report")) || null, "Row": ++n,
        "Category": cat || null, "Engineering Document Description": desc || cat, "Submission Date": sub || null,
        "Status": st || null, "Remarks": txt(g("remarks")) || null, "Delay by Days": dv, "Sheet": sn });
    }
    return out;
  }

  /* ------------------------------ the model ------------------------------ */
  function days(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 864e5); }
  function keyOf(s) { return String(s || "").toLowerCase().replace(/rev(ision)?[\s.\-]*\d+|v\.?\s*\d+$|\(?rev[\s-]*[a-z0-9]+\)?/g, "").replace(/[^a-z0-9+]+/g, " ").trim(); }
  /**
   * Documents (latest submission of each, with its history), per project and portfolio figures.
   * target: SAR review time in days (review older than this = overdue).
   */
  function model(D, target) {
    target = target || 14;
    var rows = D.t("Engineering_Drawings"), rd = D.reportDate || new Date().toISOString().slice(0, 10);
    var wk = {}; D.t("Weekly_Report_Updates").forEach(function (w) { wk[w["Source.Name"]] = w; });
    var byKey = {}, list = [];
    rows.forEach(function (r) {
      var k = r["Source.Name"] + "|" + keyOf(r["Engineering Document Description"] || r.Category);
      var d = byKey[k];
      if (!d) { d = byKey[k] = { key: k, src: r["Source.Name"], code: String(r["Project Code"] || ""), hist: [] }; list.push(d); }
      d.hist.push(r);
    });
    var docs = list.map(function (d) {
      d.hist.sort(function (a, b) { return String(a["Submission Date"] || "9999").localeCompare(String(b["Submission Date"] || "9999")) || (a.Row - b.Row); });
      var subs = d.hist.filter(function (h) { return h["Submission Date"]; }), cur = d.hist[d.hist.length - 1];
      // a later row without a date (a planned resubmission) does not hide a dated one before it
      if (!cur["Submission Date"] && subs.length) cur = subs[subs.length - 1].Row > cur.Row ? subs[subs.length - 1] : cur;
      var w = wk[d.src] || {}, prd = cur["Report Date"] || w["Report Date"] || rd, k = classify(cur.Status, cur.Remarks, cur["Submission Date"]);
      var age = cur["Submission Date"] ? days(cur["Submission Date"], rd) : null;
      return { src: d.src, code: d.code, name: w["Project Name"] || "", cat: cur.Category || "", desc: cur["Engineering Document Description"] || "",
        sub: cur["Submission Date"] || "", first: subs.length ? subs[0]["Submission Date"] : "", status: cur.Status || "", remarks: cur.Remarks || "",
        k: k, cycles: subs.length, age: age, late: k === "UR" && age != null && age > target, rd: prd };
    });
    // a document returned C / D and later resubmitted under a new title ("Stage 2 Resubmittal …" after "Stage 2 Submittal …")
    // is closed by that resubmission: it no longer waits on the contractor, and the resubmission counts one more cycle
    function stage(c) { return String(c || "").toLowerCase().replace(/re-?submi\w*|submi\w*|package|\s+/g, " ").trim(); }
    docs.forEach(function (d) {
      if ((d.k !== "C" && d.k !== "D") || !d.sub) return;
      var nx = docs.filter(function (x) { return x !== d && x.src === d.src && x.sub > d.sub && /re-?submi/i.test(x.cat + " " + x.desc) && stage(x.cat) === stage(d.cat); })
        .sort(function (a, b) { return a.sub.localeCompare(b.sub); })[0];
      if (nx) { d.k = "X"; d.resubmitted = nx.sub; nx.cycles++; }
    });
    var active = docs.filter(function (d) { return !B[d.k].out; });
    var P = {};
    active.forEach(function (d) {
      var p = P[d.src] || (P[d.src] = { src: d.src, code: d.code, name: d.name, n: 0, c: {}, late: 0, lateX2: 0, oldest: 0, cyc: 0, resub: 0, cats: {} });
      p.n++; p.c[d.k] = (p.c[d.k] || 0) + 1; if (d.late) p.late++; if (d.k === "UR" && d.age > target * 2) p.lateX2++;
      if (d.k === "UR" && d.age > p.oldest) p.oldest = d.age;
      if (d.cycles > 1) { p.resub++; p.cyc += d.cycles - 1; }
      var cat = d.cat || "—"; (p.cats[cat] = p.cats[cat] || { n: 0, c: {} }).n++; p.cats[cat].c[d.k] = (p.cats[cat].c[d.k] || 0) + 1;
    });
    var projects = Object.keys(P).map(function (s) {
      var p = P[s], g = function (k) { return p.c[k] || 0; };
      p.approved = g("A") + g("AP") + g("B"); p.submitted = p.n - g("NS"); p.ur = g("UR"); p.cd = g("C") + g("D"); p.ns = g("NS"); p.nr = g("NR");
      p.appPct = p.submitted ? p.approved / p.submitted : null; p.cdPct = p.submitted ? p.cd / p.submitted : 0;
      p.health = health(p);
      return p;
    }).sort(function (a, b) { return a.code.localeCompare(b.code); });
    var T = { n: 0, c: {}, late: 0, oldest: 0 };
    projects.forEach(function (p) { T.n += p.n; T.late += p.late; if (p.oldest > T.oldest) T.oldest = p.oldest; Object.keys(p.c).forEach(function (k) { T.c[k] = (T.c[k] || 0) + p.c[k]; }); });
    var g = function (k) { return T.c[k] || 0; };
    T.approved = g("A") + g("AP") + g("B"); T.submitted = T.n - g("NS"); T.ur = g("UR"); T.cd = g("C") + g("D"); T.ns = g("NS"); T.nr = g("NR");
    var ages = active.filter(function (d) { return d.k === "UR" && d.age != null; }).map(function (d) { return d.age; });
    T.avgUr = ages.length ? Math.round(ages.reduce(function (s, x) { return s + x; }, 0) / ages.length) : null;
    return { docs: docs, active: active, projects: projects, T: T, rd: rd, target: target, superseded: docs.length - active.length };
  }
  /* design health per project (shown with its reasons):
     red   – a quarter or more of what was submitted came back C / D, or 3+ documents in SAR review beyond 2× the target
     amber – anything at C / D, any review beyond the target, or more than a quarter not submitted yet
     green – otherwise */
  function health(p) {
    var why = [], lvl = "green";
    function set(l, t) { why.push(t); if (l === "red" || lvl === "green") lvl = l === "red" ? "red" : lvl === "red" ? "red" : "amber"; }
    if (p.cdPct >= 0.25 && p.cd >= 2) set("red", Math.round(p.cdPct * 100) + "% of submissions returned C / D");
    else if (p.cd) set("amber", p.cd + " returned C / D");
    if (p.lateX2 >= 3) set("red", p.lateX2 + " in SAR review beyond twice the target");
    else if (p.late) set("amber", p.late + " in SAR review beyond target");
    if (p.n && p.ns / p.n > 0.25) set("amber", Math.round(p.ns / p.n * 100) + "% not submitted yet");
    return { lvl: lvl, why: why };
  }

  /* ------------------------------ decisions (plain words for management) ------------------------------ */
  function decisions(M) {
    var out = [];
    M.projects.forEach(function (p) {
      var lab = p.code;
      var lateDocs = M.active.filter(function (d) { return d.src === p.src && d.late; });
      if (p.late) out.push({ sev: p.oldest > M.target * 3 ? 3 : 2, who: "SAR", code: lab, src: p.src,
        text: p.late + " document" + (p.late === 1 ? "" : "s") + " waiting on SAR review beyond " + M.target + " days (oldest " + p.oldest + " days).",
        act: "Expedite the SAR review — assign reviewers / hold a review workshop with the designer." , docs: lateDocs });
      var dd = M.active.filter(function (d) { return d.src === p.src && d.k === "D"; }), cc = M.active.filter(function (d) { return d.src === p.src && d.k === "C"; });
      if (dd.length) out.push({ sev: 3, who: "Contractor", code: lab, src: p.src, text: dd.length + " submission" + (dd.length === 1 ? "" : "s") + " rejected (Code D).",
        act: "Escalate design quality with the contractor; agree a corrective plan and resubmission dates.", docs: dd });
      if (cc.length) out.push({ sev: cc.length >= 5 || p.cdPct >= 0.4 ? 3 : 2, who: "Contractor", code: lab, src: p.src,
        text: cc.length + " returned for revision (Code C) and not yet resubmitted.", act: "Get resubmission dates from the contractor and track them weekly.", docs: cc });
      var many = M.active.filter(function (d) { return d.src === p.src && d.cycles >= 3 && !B[d.k].done; });
      if (many.length) out.push({ sev: 2, who: "Both", code: lab, src: p.src, text: many.length + " document" + (many.length === 1 ? "" : "s") + " on a 3rd or later submission and still not approved.",
        act: "Hold a joint SAR–contractor meeting to close the open comments in one round.", docs: many });
      if (p.ns && p.ns / p.n > 0.25) out.push({ sev: 1, who: "Contractor", code: lab, src: p.src, text: p.ns + " of " + p.n + " planned documents not submitted yet.",
        act: "Ask for a submission schedule for the remaining documents.", docs: M.active.filter(function (d) { return d.src === p.src && d.k === "NS"; }) });
      if (p.nr) out.push({ sev: 1, who: "Report", code: lab, src: p.src, text: p.nr + " submitted document" + (p.nr === 1 ? " has" : "s have") + " no review status in the weekly report.",
        act: "Ask the project team to complete the Status column.", docs: M.active.filter(function (d) { return d.src === p.src && d.k === "NR"; }) });
    });
    return out.sort(function (a, b) { return b.sev - a.sev || a.code.localeCompare(b.code); });
  }

  /* ------------------------------ the page ------------------------------ */
  function el(h) { return U.el(h); }
  function add(host, h) { var e = el(h); host.appendChild(e); return e; }
  function panel(host, title, sub) { var p = el(U.panel(title, sub || "", "")); host.appendChild(p); return p; }
  function pct(v) { return v == null ? "—" : Math.round(v * 100) + "%"; }
  function badge(k) { return '<span class="ds-b ds-' + k + '">' + esc(B[k].short) + "</span>"; }
  function rag(l) { return '<span class="ds-rag ds-' + l + '" title="' + l + '"></span>'; }

  function page(ctx) {
    var D = ctx.D, v = ctx.view, st = ctx.state;
    st.target = st.target || 14;
    if (!D.t("Engineering_Drawings").length) {
      add(v, '<div class="note-box"><b>No design data yet.</b> On <a href="#/import">Data Import</a>, drop the weekly report files (the same <b>.rar / .zip</b> used for the progress photos). ' +
        "Each project's <b>Engineering Drawings</b> sheet (Report Date · Project Code · Category · Engineering Document Description · Submission Date · Status · Remarks) is read into this page.</div>");
      return;
    }
    var M = model(D, st.target), T = M.T;
    var proj = st.proj && M.projects.some(function (p) { return p.src === st.proj; }) ? st.proj : "";

    // controls
    var bar = add(v, '<div class="filters ds-bar"></div>');
    var ps = U.select({ label: "Project", value: proj, options: [{ value: "", label: "All projects (portfolio)" }].concat(M.projects.map(function (p) { return { value: p.src, label: p.code + " — " + (p.name || "") }; })),
      onChange: function (x) { st.proj = x; ctx.rerender(); } });
    ps.style.flex = "1"; ps.querySelector("select").style.maxWidth = "none"; bar.appendChild(ps);
    var ts = U.select({ label: "SAR review target", value: String(st.target), options: [7, 14, 21, 28].map(function (n) { return { value: String(n), label: n + " days" }; }),
      onChange: function (x) { st.target = +x; ctx.rerender(); } });
    bar.appendChild(ts);

    var docs = proj ? M.active.filter(function (d) { return d.src === proj; }) : M.active;
    var PP = proj ? M.projects.filter(function (p) { return p.src === proj; })[0] : null, S = PP || T;
    var appPct = S.submitted ? S.approved / S.submitted : null;

    // headline tiles
    var g = add(v, '<div class="grid g-6"></div>');
    g.innerHTML = U.tile({ value: S.n, label: "Design documents", note: (proj ? PP.code : M.projects.length + " projects") + " · latest revision of each" }) +
      U.tile({ value: pct(appPct), label: "Approved", color: "black", note: S.approved + " of " + S.submitted + " submitted (A / B)" }) +
      U.tile({ value: S.ur, label: "Under SAR review", color: "mid", note: (S.late ? "<b>" + S.late + "</b> beyond " + M.target + " days" : "none beyond " + M.target + " days") }) +
      U.tile({ value: S.cd, label: "Returned C / D", color: S.cd ? "red" : "slate", note: "With the contractor to revise" }) +
      U.tile({ value: S.ns, label: "Not submitted yet", color: "slate", note: S.nr ? S.nr + " submitted with no status" : "Planned in the register" }) +
      U.tile({ value: (proj ? PP.oldest : T.oldest) || 0, unit: " days", label: "Oldest in SAR review", color: (proj ? PP.oldest : T.oldest) > M.target * 2 ? "red" : "yellow",
        note: proj ? "" : "Average " + (T.avgUr == null ? "—" : T.avgUr + " days") });

    // decisions
    var dec = decisions(M).filter(function (x) { return !proj || x.src === proj; });
    var dp = panel(v, "Decisions needed", "Generated from the register · SAR review target " + M.target + " days · click an item for its documents");
    if (!dec.length) add(dp, '<div class="note-box ok">No design item needs a management decision — everything is approved or within the review target.</div>');
    else {
      var ul = add(dp, '<ol class="ds-dec"></ol>');
      dec.slice(0, proj ? 20 : 10).forEach(function (x) {
        var li = add(ul, '<li class="ds-s' + x.sev + '"><div class="ds-dh"><span class="ds-who ds-w-' + x.who.toLowerCase() + '">' + esc(x.who === "Both" ? "SAR + Contractor" : x.who === "Report" ? "Data" : "Action: " + x.who) +
          '</span> <b>' + esc(x.code) + "</b> · " + esc(x.text) + '</div><div class="ds-act">→ ' + esc(x.act) + "</div></li>");
        li.addEventListener("click", function () { docModal(x.code + " — " + x.text, x.docs, M); });
      });
      if (dec.length > (proj ? 20 : 10)) add(dp, '<p class="muted ds-more">' + (dec.length - (proj ? 20 : 10)) + " more — pick a project above to see all of its items.</p>");
    }

    // charts
    var g2 = add(v, '<div class="grid g-2"></div>');
    if (!proj) {
      var p1 = panel(g2, "Design status by project", "Latest revision of each document · click a bar to open the project");
      var box = add(p1, '<div class="chart-box"></div>'); box.style.height = Math.max(240, M.projects.length * 34 + 70) + "px";
      U.chart(box, { type: "bar", data: { labels: M.projects.map(function (p) { return p.code; }), datasets: ORDER.map(function (k) {
          return U.barDs(B[k].short, M.projects.map(function (p) { return p.c[k] || 0; }), B[k].color, { stack: "s", maxBarThickness: 22 }); }) },
        options: { indexAxis: "y", plugins: { legend: { position: "bottom" }, datalabels: { display: function (c) { return c.dataset.data[c.dataIndex] >= 3; }, color: function (c) { return /Under|Revise|No status/.test(c.dataset.label) ? C.black : "#fff"; }, font: { weight: "700", size: 10 } } },
          scales: { x: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, grid: { color: "rgba(200,201,199,.5)" } }, y: { stacked: true, grid: { display: false } } },
          onClick: function (e, els) { if (els.length) { st.proj = M.projects[els[0].index].src; ctx.rerender(); window.scrollTo(0, 0); } } } });
    } else {
      var cats = Object.keys(PP.cats).sort();
      var p1b = panel(g2, "Status by package / category", PP.code + " · latest revision of each document");
      var bx = add(p1b, '<div class="chart-box"></div>'); bx.style.height = Math.max(240, cats.length * 30 + 70) + "px";
      U.chart(bx, { type: "bar", data: { labels: cats.map(function (c) { return U.wrapLabel ? U.wrapLabel(c, 34) : c; }), datasets: ORDER.map(function (k) {
          return U.barDs(B[k].short, cats.map(function (c) { return PP.cats[c].c[k] || 0; }), B[k].color, { stack: "s", maxBarThickness: 22 }); }) },
        options: { indexAxis: "y", plugins: { legend: { position: "bottom" }, datalabels: { display: false } },
          scales: { x: { stacked: true, beginAtZero: true, ticks: { precision: 0 } }, y: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 } } } } } });
    }
    // SAR review ageing
    var bands = [[0, M.target, "Within " + M.target + " d"], [M.target + 1, 30, (M.target + 1) + "–30 d"], [31, 60, "31–60 d"], [61, 90, "61–90 d"], [91, 1e9, "> 90 d"]].filter(function (b) { return b[0] <= b[1]; });
    var urs = docs.filter(function (d) { return d.k === "UR" && d.age != null; });
    var p2 = panel(g2, "How long documents wait for SAR review", urs.length + " under review · days since submission at the report date");
    var b2 = add(p2, '<div class="chart-box"></div>');
    var srcs = proj ? [proj] : M.projects.filter(function (p) { return p.ur; }).map(function (p) { return p.src; });
    var pal = [C.blue, C.black, C.mid || "#71B2C9", C.slate, "#59CBE8", "#F1B434", "#CB2C30", "#4FA3B5", "#8A5A00", "#C8C9C7", "#005A69", "#3D3935"];
    U.chart(b2, { type: "bar", data: { labels: bands.map(function (b) { return b[2]; }), datasets: srcs.map(function (s, i) {
        var p = M.projects.filter(function (x) { return x.src === s; })[0];
        return U.barDs(p.code, bands.map(function (b) { return urs.filter(function (d) { return d.src === s && d.age >= b[0] && d.age <= b[1]; }).length; }), pal[i % pal.length], { stack: "a", maxBarThickness: 46 }); }) },
      options: { plugins: { legend: { position: "bottom", display: srcs.length > 1 }, datalabels: { display: false } },
        scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } } } });

    // submissions per month, coloured by today's status
    var months = U.uniq(docs.map(function (d) { return d.sub ? d.sub.slice(0, 7) : ""; }).filter(Boolean)).sort().slice(-18);
    if (months.length) {
      var p3 = panel(v, "Submissions per month", "Documents by month of their latest submission, coloured by today's status (last 18 months)");
      var b3 = add(p3, '<div class="chart-box short"></div>');
      U.chart(b3, { type: "bar", data: { labels: months.map(function (m) { return fmt.month(m + "-01"); }), datasets: ORDER.filter(function (k) { return k !== "NS"; }).map(function (k) {
          return U.barDs(B[k].short, months.map(function (m) { return docs.filter(function (d) { return d.k === k && d.sub && d.sub.slice(0, 7) === m; }).length; }), B[k].color, { stack: "m", maxBarThickness: 40 }); }) },
        options: { plugins: { legend: { position: "bottom" }, datalabels: { display: false } }, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } } } });
    }

    // project scorecard
    if (!proj) {
      var p4 = panel(v, "Project design scorecard", "Health: red = a quarter or more of submissions returned C / D · amber = any C / D, review beyond target, or > 25% not submitted · click a row to open the project");
      U.table(p4, { rows: M.projects, exportName: "NSR design scorecard " + M.rd, search: false, sort: null,
        columns: [
          { label: "", get: function (p) { return { red: 0, amber: 1, green: 2 }[p.health.lvl]; }, render: function (_, p) { return rag(p.health.lvl); } },
          { label: "Project", key: "code", render: function (_, p) { return "<b>" + esc(p.code) + '</b><div class="muted ds-nm">' + esc(p.name || "") + "</div>"; } },
          { label: "Documents", key: "n", type: "int" },
          { label: "Approved %", get: function (p) { return p.appPct; }, render: function (x, p) { return U.meter(x) + '<div class="muted ds-sm">' + p.approved + " of " + p.submitted + "</div>"; } },
          { label: "Under review", key: "ur", type: "int" },
          { label: "> target", key: "late", type: "int", render: function (x) { return x ? '<b class="neg">' + x + "</b>" : "0"; } },
          { label: "Oldest (days)", key: "oldest", type: "int" },
          { label: "C / D", key: "cd", type: "int", render: function (x) { return x ? '<b class="neg">' + x + "</b>" : "0"; } },
          { label: "Not submitted", key: "ns", type: "int" },
          { label: "Resubmitted docs", key: "resub", type: "int" },
          { label: "Why", get: function (p) { return p.health.why.join("; "); }, render: function (x) { return '<span class="ds-why">' + esc(x || "On track") + "</span>"; } }
        ],
        onRow: function (p) { st.proj = p.src; ctx.rerender(); window.scrollTo(0, 0); }, rowTitle: "Open this project's design status" });
    }

    // action lists
    var g3 = add(v, '<div class="grid g-2"></div>');
    var wSar = docs.filter(function (d) { return d.k === "UR"; }).sort(function (a, b) { return (b.age || 0) - (a.age || 0); });
    var wCon = docs.filter(function (d) { return d.k === "C" || d.k === "D"; }).sort(function (a, b) { return (b.k === "D") - (a.k === "D") || (b.age || 0) - (a.age || 0); });
    listPanel(g3, "Waiting on SAR", "Under review, longest first", wSar, M, true);
    listPanel(g3, "Waiting on the contractor", "Returned C / D, rejected first", wCon, M, false);

    // full register
    var p5 = panel(v, proj ? "Document register — " + PP.code : "Document register", "Latest revision of each document" + (M.superseded ? " · " + M.superseded + " superseded / cancelled not counted" : "") + " · Export CSV for the full list");
    U.table(p5, { rows: docs, exportName: "NSR design register " + (proj ? PP.code + " " : "") + M.rd, maxHeight: 560, sort: { key: "Status", dir: 1 },
      columns: [
        { label: "Project", key: "code" },
        { label: "Category", key: "cat", render: function (x) { return '<span class="ds-txt">' + esc(x) + "</span>"; } },
        { label: "Document", key: "desc", render: function (x) { return '<span class="ds-txt">' + esc(x) + "</span>"; } },
        { label: "Submitted", key: "sub", type: "date" },
        { label: "Status", get: function (d) { return RANK[d.k] + " " + B[d.k].short; }, render: function (_, d) { return badge(d.k); } },
        { label: "Days", key: "age", type: "int", render: function (x, d) { return x == null ? "" : d.late ? '<b class="neg">' + x + "</b>" : String(x); } },
        { label: "Subm.", key: "cycles", type: "int" },
        { label: "Status / remarks in the report", get: function (d) { return [d.status, d.remarks].filter(Boolean).join(" · "); }, render: function (x) { return '<span class="ds-txt muted">' + esc(x) + "</span>"; } }
      ] });
    add(v, '<p class="muted ds-foot">Source: each project\'s weekly report file, sheet “Engineering Drawings” (6203: “Engineering Log”). A document submitted more than once is counted once, at its latest submission. ' +
      "Status words are read as: A / Code A → Approved (A); B / Code B / approved with comments → Approved (B); Approved / Closed → Approved; C / revise & resubmit / CRS received → Code C; D / rejected → Code D; " +
      "under review / submitted / UR → Under SAR review; superseded / cancelled / descoped → not counted. A code in the remarks (e.g. “SAR sent CRS with Code B”) is used when the status is generic.</p>");
  }

  function listPanel(host, title, sub, list, M, sar) {
    var p = panel(host, title, sub + " · " + list.length);
    if (!list.length) { add(p, '<div class="empty-note">Nothing waiting.</div>'); return; }
    var ul = add(p, '<ul class="ds-list"></ul>');
    list.slice(0, 10).forEach(function (d) {
      add(ul, "<li>" + badge(d.k) + ' <b>' + esc(d.code) + "</b> " + esc(d.desc) + '<span class="ds-age' + (d.late || !sar && d.age > 30 ? " neg" : "") + '">' +
        (d.age == null ? "" : d.age + " d") + (d.cycles > 1 ? " · " + d.cycles + "× submitted" : "") + "</span></li>");
    });
    if (list.length > 10) { var m = add(p, '<button type="button" class="link-btn">All ' + list.length + " ›</button>"); m.addEventListener("click", function () { docModal(title, list, M); }); }
  }

  function docModal(title, list, M) {
    var body = U.modal(title, "", true);
    var host = document.createElement("div"); body.appendChild(host);
    U.table(host, { rows: list, search: list.length > 8, exportName: "NSR design " + title.slice(0, 40), autoHeight: true,
      columns: [{ label: "Project", key: "code" }, { label: "Category", key: "cat" }, { label: "Document", key: "desc", render: function (x) { return '<span class="ds-txt">' + esc(x) + "</span>"; } },
        { label: "Submitted", key: "sub", type: "date" }, { label: "Status", get: function (d) { return B[d.k].short; }, render: function (_, d) { return badge(d.k); } },
        { label: "Days", key: "age", type: "int" }, { label: "Subm.", key: "cycles", type: "int" }, { label: "Remarks", get: function (d) { return [d.status, d.remarks].filter(Boolean).join(" · "); } }] });
  }

  window.SARDesign = { fromWorkbook: fromWorkbook, classify: classify, model: model, decisions: decisions, page: page, BUCKETS: B };
})();

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
      return { key: d.key, src: d.src, code: d.code, name: w["Project Name"] || "", cat: cur.Category || "", desc: cur["Engineering Document Description"] || "",
        sub: cur["Submission Date"] || "", first: subs.length ? subs[0]["Submission Date"] : "", status: cur.Status || "", remarks: cur.Remarks || "",
        k: k, cycles: subs.length, age: age, late: k === "UR" && age != null && age > target, rd: prd, hist: d.hist, sheet: cur.Sheet || "" };
    });
    // a document returned C / D and later resubmitted under a new title ("Stage 2 Resubmittal …" after "Stage 2 Submittal …")
    // is closed by that resubmission: it no longer waits on the contractor, and the resubmission counts one more cycle
    function stage(c) { return String(c || "").toLowerCase().replace(/re-?submi\w*|submi\w*|package|\s+/g, " ").trim(); }
    docs.forEach(function (d) {
      if ((d.k !== "C" && d.k !== "D") || !d.sub) return;
      var nx = docs.filter(function (x) { return x !== d && x.src === d.src && x.sub > d.sub && /re-?submi/i.test(x.cat + " " + x.desc) && stage(x.cat) === stage(d.cat); })
        .sort(function (a, b) { return a.sub.localeCompare(b.sub); })[0];
      if (nx) { d.k = "X"; d.resubmitted = nx.sub; d.resubmittedAs = nx; nx.cycles++; nx.prev = (nx.prev || []).concat([d]); }
    });
    var active = docs.filter(function (d) { return !B[d.k].out; });
    var A = agg(active, target);
    A.projects.forEach(function (p) { active.forEach(function (d) { if (d.src === p.src) d.health = p.health.lvl; }); });
    return { docs: docs, active: active, projects: A.projects, T: A.T, rd: rd, target: target, superseded: docs.length - active.length };
  }
  /** per-project and total figures of a list of (active) documents */
  function agg(active, target) {
    var P = {};
    active.forEach(function (d) {
      var p = P[d.src] || (P[d.src] = { src: d.src, code: d.code, name: d.name, n: 0, c: {}, late: 0, lateX2: 0, oldest: 0, cyc: 0, resub: 0, cats: {}, urDays: 0 });
      p.n++; p.c[d.k] = (p.c[d.k] || 0) + 1; if (d.late) p.late++; if (d.k === "UR" && d.age > target * 2) p.lateX2++;
      if (d.k === "UR" && d.age != null) { p.urDays += d.age; if (d.age > p.oldest) p.oldest = d.age; }
      if (d.cycles > 1) { p.resub++; p.cyc += d.cycles - 1; }
      var cat = d.cat || "—"; (p.cats[cat] = p.cats[cat] || { n: 0, c: {} }).n++; p.cats[cat].c[d.k] = (p.cats[cat].c[d.k] || 0) + 1;
    });
    var projects = Object.keys(P).map(function (s) {
      var p = P[s], g = function (k) { return p.c[k] || 0; };
      p.approved = g("A") + g("AP") + g("B"); p.submitted = p.n - g("NS"); p.ur = g("UR"); p.cd = g("C") + g("D"); p.ns = g("NS"); p.nr = g("NR");
      p.appPct = p.submitted ? p.approved / p.submitted : null; p.cdPct = p.submitted ? p.cd / p.submitted : 0;
      p.avgUr = p.ur ? Math.round(p.urDays / p.ur) : null;
      p.health = health(p);
      return p;
    }).sort(function (a, b) { return a.code.localeCompare(b.code); });
    var T = { n: 0, c: {}, late: 0, oldest: 0 };
    projects.forEach(function (p) { T.n += p.n; T.late += p.late; if (p.oldest > T.oldest) T.oldest = p.oldest; Object.keys(p.c).forEach(function (k) { T.c[k] = (T.c[k] || 0) + p.c[k]; }); });
    var g = function (k) { return T.c[k] || 0; };
    T.approved = g("A") + g("AP") + g("B"); T.submitted = T.n - g("NS"); T.ur = g("UR"); T.cd = g("C") + g("D"); T.ns = g("NS"); T.nr = g("NR");
    var ages = active.filter(function (d) { return d.k === "UR" && d.age != null; }).map(function (d) { return d.age; });
    T.avgUr = ages.length ? Math.round(ages.reduce(function (s, x) { return s + x; }, 0) / ages.length) : null;
    return { projects: projects, T: T };
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
  /* who has to act on a document now */
  function owner(d) { return d.k === "UR" ? "SAR" : d.k === "C" || d.k === "D" || d.k === "NS" ? "Contractor" : d.k === "NR" ? "Project team (data)" : "Done"; }
  var NEXT = {
    UR: "SAR to complete the review and issue the code.", C: "Contractor to address the comments and resubmit.", D: "Contractor to rework the design and resubmit — escalate quality.",
    NS: "Contractor to submit (get a planned submission date).", NR: "Project team to record the review status in the weekly report.",
    A: "Approved — no action.", AP: "Approved — no action.", B: "Approved with comments — contractor to incorporate them in the next issue.", X: "Not counted (superseded / cancelled / resubmitted)."
  };

  /* ------------------------------ decisions (plain words for management) ------------------------------ */
  function decisions(M) {
    var out = [];
    M.projects.forEach(function (p) {
      var lab = p.code, mine = M.active.filter(function (d) { return d.src === p.src; });
      var lateDocs = mine.filter(function (d) { return d.late; });
      if (p.late) out.push({ kind: "late", sev: p.oldest > M.target * 3 ? 3 : 2, who: "SAR", code: lab, src: p.src,
        text: p.late + " document" + (p.late === 1 ? "" : "s") + " waiting on SAR review beyond " + M.target + " days (oldest " + p.oldest + " days).",
        act: "Expedite the SAR review — assign reviewers / hold a review workshop with the designer.", short: "Expedite the review", docs: lateDocs });
      var dd = mine.filter(function (d) { return d.k === "D"; }), cc = mine.filter(function (d) { return d.k === "C"; });
      if (dd.length) out.push({ kind: "D", sev: 3, who: "Contractor", code: lab, src: p.src, text: dd.length + " submission" + (dd.length === 1 ? "" : "s") + " rejected (Code D).",
        act: "Escalate design quality with the contractor; agree a corrective plan and resubmission dates.", short: "Escalate design quality (" + dd.length + " Code D)", docs: dd });
      if (cc.length) out.push({ kind: "C", sev: cc.length >= 5 || p.cdPct >= 0.4 ? 3 : 2, who: "Contractor", code: lab, src: p.src,
        text: cc.length + " returned for revision (Code C) and not yet resubmitted.", act: "Get resubmission dates from the contractor and track them weekly.", short: "Get resubmission dates (" + cc.length + " Code C)", docs: cc });
      var many = mine.filter(function (d) { return d.cycles >= 3 && !B[d.k].done; });
      if (many.length) out.push({ kind: "many", sev: 2, who: "Both", code: lab, src: p.src, text: many.length + " document" + (many.length === 1 ? "" : "s") + " on a 3rd or later submission and still not approved.",
        act: "Hold a joint SAR–contractor meeting to close the open comments in one round.", short: "Joint meeting — " + many.length + " on 3+ submissions", docs: many });
      if (p.ns && p.ns / p.n > 0.25) out.push({ kind: "NS", sev: 1, who: "Contractor", code: lab, src: p.src, text: p.ns + " of " + p.n + " planned documents not submitted yet.",
        act: "Ask for a submission schedule for the remaining documents.", short: "Get a submission schedule", docs: mine.filter(function (d) { return d.k === "NS"; }) });
      if (p.nr) out.push({ kind: "NR", sev: 1, who: "Report", code: lab, src: p.src, text: p.nr + " submitted document" + (p.nr === 1 ? " has" : "s have") + " no review status in the weekly report.",
        act: "Ask the project team to complete the Status column.", short: "Complete the status column", docs: mine.filter(function (d) { return d.k === "NR"; }) });
    });
    return out.sort(function (a, b) { return b.sev - a.sev || a.code.localeCompare(b.code); });
  }

  /* ------------------------------ small builders ------------------------------ */
  function el(h) { return U.el(h); }
  function add(host, h) { var e = el(h); host.appendChild(e); return e; }
  function panel(host, title, sub) { var p = el(U.panel(title, sub || "", "")); host.appendChild(p); return p; }
  function pct(v) { return v == null ? "—" : Math.round(v * 100) + "%"; }
  function badge(k) { return '<span class="ds-b ds-' + k + '">' + esc(B[k].short) + "</span>"; }
  function rag(l) { return '<span class="ds-rag ds-' + l + '" title="' + l + '"></span>'; }
  function plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }
  function hand(e, els) { var t = e && e.native && e.native.target; if (t) t.style.cursor = els.length ? "pointer" : "default"; }
  /* clicks on the labels of a horizontal bar chart's y axis (the project codes). Chart.js only reports clicks inside the
     plot area, so the canvas is listened to directly. onIndex(index, event) */
  function axisClicks(box, onIndex) {
    function at(ev) {
      var cv = box.querySelector("canvas"), c = cv && window.Chart && Chart.getChart(cv), sc = c && c.scales && c.scales.y; if (!sc) return -1;
      var r = cv.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
      if (x < 0 || x > sc.right || y < sc.top || y > sc.bottom) return -1;
      var i = Math.round(sc.getValueForPixel(y)); return i >= 0 && i < c.data.labels.length ? i : -1;
    }
    box.addEventListener("click", function (ev) { var i = at(ev); if (i >= 0) onIndex(i, ev); });   // the canvas is drawn later; events bubble up
    box.addEventListener("mousemove", function (ev) {
      var cv = box.querySelector("canvas"), c = cv && Chart.getChart(cv); if (!c) return;
      if (at(ev) >= 0) cv.style.cursor = "pointer"; else if (ev.clientX - cv.getBoundingClientRect().left < c.chartArea.left) cv.style.cursor = "default";
    });
  }
  /* the segment under the pointer (bar charts report every segment of the bar, first one first) */
  function hit(e, els, c) {
    if (!c || !c.getElementsAtEventForMode) return els;
    var h = c.getElementsAtEventForMode(e.native || e, "nearest", { intersect: true }, true);
    return h.length ? h : els.length ? [] : els;
  }
  function clickHint() { return "Click for the details"; }
  function bandsOf(target) {
    return [[0, target, "≤ " + target + " d"], [target + 1, 30, (target + 1) + "–30 d"], [31, 60, "31–60 d"], [61, 90, "61–90 d"], [91, 1e9, "> 90 d"]].filter(function (b) { return b[0] <= b[1]; });
  }
  var PAL = ["#00778B", "#3D3935", "#71B2C9", "#768692", "#59CBE8", "#F1B434", "#CB2C30", "#2A8C9C", "#8A5A00", "#C8C9C7", "#005A69", "#A05A2C"];

  /* ------------------------------ detail windows ------------------------------ */
  var CUR = null;   // { M, ctx, f } of the page on screen — the windows use it to filter the page
  /** a list of documents: summary line + table; a row opens the document */
  function listModal(title, list, note) {
    var M = CUR && CUR.M, body = U.modal(title, "", true);
    var per = {}, ages = list.filter(function (d) { return d.age != null; }).map(function (d) { return d.age; });
    list.forEach(function (d) { per[d.code] = (per[d.code] || 0) + 1; });
    var kc = {}; list.forEach(function (d) { kc[d.k] = (kc[d.k] || 0) + 1; });
    body.appendChild(el('<div class="ds-msum"><b>' + plural(list.length, "document") + "</b>" +
      (Object.keys(per).length > 1 ? " · " + Object.keys(per).sort().map(function (c) { return esc(c) + ": " + per[c]; }).join(" · ") : "") +
      (ages.length ? " · oldest <b>" + Math.max.apply(null, ages) + " days</b> · average " + Math.round(ages.reduce(function (a, b) { return a + b; }, 0) / ages.length) + " days since submission" : "") +
      (M && list.some(function (d) { return d.late; }) ? ' · <span class="neg">' + list.filter(function (d) { return d.late; }).length + " beyond the " + M.target + "-day review target</span>" : "") +
      (Object.keys(kc).length > 1 ? '<div class="ds-kc">' + Object.keys(kc).sort(function (a, b) { return RANK[a] - RANK[b]; }).map(function (k) { return badge(k) + " " + kc[k]; }).join(" &nbsp; ") + "</div>" : "") +
      (note ? '<div class="ds-act">→ ' + esc(note) + "</div>" : "") + "</div>"));
    if (CUR && Object.keys(per).length === 1 && list.length) {
      var pb = el('<button type="button" class="link-btn ds-mlink">Open the project ›</button>'); body.appendChild(pb);
      pb.addEventListener("click", function () { projModal(list[0].src); });
    }
    var host = document.createElement("div"); body.appendChild(host);
    docTable(host, list, { exportName: "NSR design " + title.slice(0, 40), autoHeight: true, search: list.length > 8,
      sort: Object.keys(kc).length === 1 ? { key: "age", dir: -1 } : { key: "Status", dir: 1 } });   // one status → longest waiting first
  }
  /** the document table used in the windows and the register; a row opens the document */
  function docTable(host, list, o) {
    var M = CUR && CUR.M;
    U.table(host, Object.assign({ rows: list, sort: { key: "Status", dir: 1 }, rowTitle: "Open this document",
      columns: [
        { label: "Project", key: "code" },
        { label: "Package / category", key: "cat", render: function (x) { return '<span class="ds-txt">' + esc(x) + "</span>"; } },
        { label: "Document", key: "desc", render: function (x) { return '<span class="ds-txt">' + esc(x) + "</span>"; } },
        { label: "Submitted", key: "sub", type: "date" },
        { label: "Status", get: function (d) { return RANK[d.k] + " " + B[d.k].short; }, render: function (_, d) { return badge(d.k); } },
        { label: "Days", key: "age", type: "int", render: function (x, d) { return x == null ? "" : d.late ? '<b class="neg">' + x + "</b>" : String(x); } },
        { label: "Subm.", key: "cycles", type: "int" },
        { label: "With", get: owner },
        { label: "Status / remarks in the report", get: function (d) { return [d.status, d.remarks].filter(Boolean).join(" · "); }, render: function (x) { return '<span class="ds-txt muted">' + esc(x) + "</span>"; } }
      ],
      onRow: function (d) { docModal(d); } }, o || {}));
    return M;
  }
  /** one document: what it is, where it stands, who acts next, and every submission */
  function docModal(d) {
    var M = CUR && CUR.M, body = U.modal(d.code + " · " + (d.desc || d.cat), "", true);
    var tgt = M ? M.target : 14;
    var g = el('<div class="grid g-4 ds-dinfo"></div>'); body.appendChild(g);
    g.innerHTML = U.info("Project", esc(d.code + (d.name ? " — " + d.name : ""))) + U.info("Package / category", esc(d.cat || "—")) +
      U.info("Status", badge(d.k) + (d.status ? ' <span class="muted">“' + esc(d.status) + "”</span>" : "")) + U.info("With", esc(owner(d))) +
      U.info("Latest submission", d.sub ? fmt.date(d.sub) : "—") + U.info("First submission", d.first ? fmt.date(d.first) : "—") +
      U.info("Days since submission", d.age == null ? "—" : (d.late ? '<b class="neg">' + d.age + "</b>" : String(d.age)) + (d.k === "UR" ? " (target " + tgt + ")" : "")) +
      U.info("Submissions", String(d.cycles || 0));
    body.appendChild(el('<div class="note-box' + (d.late || d.k === "D" ? " bad" : d.k === "C" || d.k === "NS" ? " warn" : "") + '" style="margin:12px 0"><b>Next step:</b> ' + esc(NEXT[d.k]) +
      (d.late ? " <b>" + (d.age - tgt) + " days beyond the review target.</b>" : "") + (d.remarks ? "<br><b>Remarks:</b> " + esc(d.remarks) : "") + "</div>"));
    var hist = (d.prev || []).map(function (x) { return { sub: x.sub, status: x.status, remarks: x.remarks, k: x.k === "X" ? classify(x.status, x.remarks, x.sub) : x.k, title: x.desc, rd: x.rd }; })
      .concat(d.hist.map(function (h) { return { sub: h["Submission Date"] || "", status: h.Status || "", remarks: h.Remarks || "", k: classify(h.Status, h.Remarks, h["Submission Date"]), title: h["Engineering Document Description"], rd: h["Report Date"] || "" }; }))
      .sort(function (a, b) { return String(a.sub || "9999").localeCompare(String(b.sub || "9999")); });
    body.appendChild(el('<h4 class="mh">Submission history</h4>'));
    var hh = document.createElement("div"); body.appendChild(hh);
    U.table(hh, { rows: hist, search: false, exportName: false, autoHeight: true, sort: null,
      columns: [{ label: "#", get: function (x) { return hist.indexOf(x) + 1; } }, { label: "Submitted", key: "sub", type: "date" },
        { label: "Status", get: function (x) { return B[x.k].short; }, render: function (_, x) { return badge(x.k); } }, { label: "As written", key: "status" },
        { label: "Remarks", key: "remarks", render: function (x) { return '<span class="ds-txt">' + esc(x || "") + "</span>"; } },
        { label: "Title", key: "title", render: function (x) { return '<span class="ds-txt muted">' + esc(x || "") + "</span>"; } }] });
    if (d.resubmittedAs) body.appendChild(el('<p class="muted ds-more">Resubmitted on ' + fmt.date(d.resubmitted) + " as “" + esc(d.resubmittedAs.desc) + "”.</p>"));
    var ob = el('<button type="button" class="link-btn ds-mlink">Open the project ›</button>'); body.appendChild(ob);
    ob.addEventListener("click", function () { projModal(d.src); });
    body.appendChild(el('<p class="muted ds-more">Source: ' + esc(d.src) + " · sheet “" + esc(d.sheet || "Engineering Drawings") + "”</p>"));
  }
  /** one project: health and why, figures, decisions, packages, documents */
  function projModal(src) {
    var M = CUR.M, p = M.projects.filter(function (x) { return x.src === src; })[0]; if (!p) return;
    var mine = M.active.filter(function (d) { return d.src === src; }), body = U.modal(p.code + " — " + (p.name || "") + " · design", "", true);
    var g = el('<div class="grid g-6"></div>'); body.appendChild(g);
    g.innerHTML = U.tile({ value: p.n, label: "Documents", note: "Latest revision of each" }) + U.tile({ value: pct(p.appPct), label: "Approved", color: "black", note: p.approved + " of " + p.submitted }) +
      U.tile({ value: p.ur, label: "Under SAR review", color: "mid", note: p.late + " beyond " + M.target + " d" }) + U.tile({ value: p.cd, label: "Returned C / D", color: p.cd ? "red" : "slate" }) +
      U.tile({ value: p.ns, label: "Not submitted", color: "slate" }) + U.tile({ value: p.oldest || 0, unit: " d", label: "Oldest in review", color: p.oldest > M.target * 2 ? "red" : "yellow", note: "Average " + (p.avgUr == null ? "—" : p.avgUr + " d") });
    tileClicks(g, [mine, mine.filter(isDone), mine.filter(function (d) { return d.k === "UR"; }), mine.filter(function (d) { return d.k === "C" || d.k === "D"; }), mine.filter(function (d) { return d.k === "NS"; }),
      mine.filter(function (d) { return d.k === "UR"; }).sort(function (a, b) { return b.age - a.age; }).slice(0, 1)], ["All documents", "Approved", "Under SAR review", "Returned C / D", "Not submitted", "Oldest in review"], p.code);
    body.appendChild(el('<div class="note-box' + (p.health.lvl === "red" ? " bad" : p.health.lvl === "amber" ? " warn" : " ok") + '" style="margin:12px 0">' + rag(p.health.lvl) + " <b>Design health: " + p.health.lvl + "</b>" +
      (p.health.why.length ? " — " + esc(p.health.why.join("; ")) : " — on track") + "</div>"));
    var dec = decisions({ projects: [p], active: mine, target: M.target });
    if (dec.length) {
      body.appendChild(el('<h4 class="mh">Decisions needed</h4>'));
      var ol = el('<ol class="ds-dec"></ol>'); body.appendChild(ol);
      dec.forEach(function (x) { var li = decItem(x); ol.appendChild(li); });
    }
    body.appendChild(el('<h4 class="mh">By package / category</h4>'));
    var cats = Object.keys(p.cats).sort().map(function (c) { var o = p.cats[c], gg = function (k) { return o.c[k] || 0; };
      return { cat: c, n: o.n, app: gg("A") + gg("AP") + gg("B"), ur: gg("UR"), cd: gg("C") + gg("D"), ns: gg("NS") }; });
    var ch = document.createElement("div"); body.appendChild(ch);
    U.table(ch, { rows: cats, search: false, exportName: false, autoHeight: true, sort: null, rowTitle: "Show this package's documents",
      columns: [{ label: "Package / category", key: "cat", render: function (x) { return '<span class="ds-txt">' + esc(x) + "</span>"; } }, { label: "Documents", key: "n", type: "int" },
        { label: "Approved", key: "app", type: "int" }, { label: "Under review", key: "ur", type: "int" }, { label: "C / D", key: "cd", type: "int" }, { label: "Not submitted", key: "ns", type: "int" }],
      onRow: function (r) { listModal(p.code + " · " + r.cat, mine.filter(function (d) { return (d.cat || "—") === r.cat; })); } });
    body.appendChild(el('<h4 class="mh">Documents</h4>'));
    var dh = document.createElement("div"); body.appendChild(dh);
    docTable(dh, mine, { exportName: "NSR design " + p.code, maxHeight: 420 });
    if (CUR.f) {
      var fb = el('<button type="button" class="icon-btn ds-mlink">Filter the page to ' + esc(p.code) + "</button>"); body.appendChild(fb);
      fb.addEventListener("click", function () { CUR.f.proj = [p.code]; document.querySelectorAll(".modal-back").forEach(function (m) { m.remove(); }); CUR.ctx.rerender(); window.scrollTo(0, 0); });
    }
  }
  function isDone(d) { return B[d.k].done; }
  function tileClicks(g, lists, titles, scope) {
    Array.prototype.forEach.call(g.children, function (t, i) {
      if (!lists[i]) return; t.classList.add("ds-click"); t.title = "Click for the details";
      t.addEventListener("click", function () { var l = lists[i]; if (l.length === 1 && /Oldest/.test(titles[i])) docModal(l[0]); else listModal((scope ? scope + " · " : "") + titles[i], l); });
    });
  }
  /* the page filter that shows a decision's documents */
  function decFilter(x, late) {
    var u = function (k) { return [B[k].short]; };
    return x.kind === "late" ? { proj: [x.code], status: u("UR"), age: late } : x.kind === "D" ? { proj: [x.code], status: u("D") } : x.kind === "C" ? { proj: [x.code], status: u("C") } :
      x.kind === "NS" ? { proj: [x.code], status: u("NS") } : x.kind === "NR" ? { proj: [x.code], status: u("NR") } : { proj: [x.code] };
  }
  function decItem(x, onPick) {
    var li = el('<li class="ds-s' + x.sev + '"><div class="ds-dh"><span class="ds-who ds-w-' + x.who.toLowerCase() + '">' + esc(x.who === "Both" ? "SAR + Contractor" : x.who === "Report" ? "Data" : "Action: " + x.who) +
      '</span> <b>' + esc(x.code) + "</b> · " + esc(x.text) + '</div><div class="ds-act">→ ' + esc(x.act) + "</div></li>");
    li.title = onPick ? "Filter the page to these documents" : "Click for the documents";
    li.addEventListener("click", function (e) { if (onPick) onPick(e); else listModal(x.code + " — " + x.text, x.docs, x.act); });
    return li;
  }

  /* ------------------------------ the page ------------------------------ */
  function page(ctx) {
    var D = ctx.D, v = ctx.view, st = ctx.state, K = window.SARPages && SARPages._kit;
    st.target = st.target || 14;
    if (!D.t("Engineering_Drawings").length) {
      add(v, '<div class="note-box"><b>No design data yet.</b> On <a href="#/import">Data Import</a>, drop the weekly report files (the same <b>.rar / .zip</b> used for the progress photos). ' +
        "Each project's <b>Engineering Drawings</b> sheet (Report Date · Project Code · Category · Engineering Document Description · Submission Date · Status · Remarks) is read into this page.</div>");
      return;
    }
    var M = model(D, st.target), bands = bandsOf(M.target);
    var nameOf = {}; M.projects.forEach(function (p) { nameOf[p.code] = p.name; });
    function band(d) { if (d.age == null) return "Not submitted"; for (var i = 0; i < bands.length; i++) if (d.age >= bands[i][0] && d.age <= bands[i][1]) return bands[i][2]; return ""; }
    var months = U.uniq(M.active.map(function (d) { return d.sub ? d.sub.slice(0, 7) + "-01" : ""; }).filter(Boolean)).sort().reverse();
    var defs = [
      { key: "proj", label: "Project", options: M.projects.map(function (p) { return p.code; }), display: function (c) { return c + (nameOf[c] ? " — " + nameOf[c] : ""); }, get: function (d) { return d.code; } },
      { key: "status", label: "Status", options: ORDER.slice().sort(function (a, b) { return RANK[a] - RANK[b]; }).map(function (k) { return B[k].short; }), get: function (d) { return B[d.k].short; } },
      { key: "age", label: "Days since submission", options: bands.map(function (b) { return b[2]; }).concat(["Not submitted"]), get: band },
      { key: "month", label: "Submitted (month)", options: months, display: function (m) { return fmt.month(m); }, get: function (d) { return d.sub ? d.sub.slice(0, 7) + "-01" : ""; } }
    ];
    if (st.proj) {   // a project picked from an older link / the scorecard
      var pk = M.projects.filter(function (p) { return p.src === st.proj; })[0]; st.f = st.f || {}; st.f.proj = pk ? [pk.code] : []; delete st.proj;
    }
    var f = K ? K.filterBar(ctx, defs, M.active) : {};
    var fbar = v.querySelector(".fbar");
    if (fbar) {   // the review target sits in the filter bar: it changes what counts as "late" everywhere
      var ts = U.select({ label: "SAR review target", value: String(st.target), options: [7, 14, 21, 28, 30, 45].map(function (n) { return { value: String(n), label: n + " days" }; }),
        onChange: function (x) { st.target = +x; ctx.rerender(); } });
      ts.classList.add("ds-tgt"); fbar.insertBefore(ts, fbar.querySelector(".filter-reset"));
      var hint = fbar.querySelector(".chips .hint"); if (hint) hint.textContent = "Tip: click any card, slice, bar, project or decision to filter the whole page · Ctrl + click to add · click a document for its details";
    }
    /* a click on a card, slice, bar, project or decision filters the whole page to it; Ctrl / ⌘ + click adds to the
       selection; clicking the same thing again clears it */
    function pick(patch, e) {
      var ev = e && e.native ? e.native : e, more = ev && (ev.ctrlKey || ev.metaKey);
      Object.keys(patch).forEach(function (key) {
        var cur = f[key] || (f[key] = []), vals = patch[key];
        if (more) vals.forEach(function (x) { var at = cur.indexOf(x); if (at < 0) cur.push(x); else cur.splice(at, 1); });
        else { var same = cur.length === vals.length && vals.every(function (x) { return cur.indexOf(x) >= 0; }); cur.length = 0; if (!same) vals.forEach(function (x) { cur.push(x); }); }
      });
      ctx.rerender();
    }
    function S_(ks) { return ks.map(function (k) { return B[k].short; }); }
    var late = bands.slice(1).map(function (b) { return b[2]; });
    var docs = K ? M.active.filter(function (d) { return K.passes(d, defs, f); }) : M.active;
    var A = agg(docs, M.target), S = A.T;
    var VM = { projects: A.projects, active: docs, target: M.target };
    CUR = { M: M, ctx: ctx, f: f };
    var one = A.projects.length === 1 ? A.projects[0] : null;
    var nF = defs.reduce(function (n, d) { return n + ((f[d.key] || []).length ? 1 : 0); }, 0);
    var scope = nF ? plural(docs.length, "document") + " match the filters" : "All " + M.projects.length + " projects";

    if (!docs.length) { add(v, '<div class="empty">No document matches the filters — use ↺ Reset filters.</div>'); return; }
    add(v, '<p class="ds-scope">' + esc(scope) + " · report date " + fmt.date(M.rd) + " · SAR review target " + M.target + " days · click any number, bar or project to filter the page · click a document for its details</p>");

    /* A · headline: five numbers */
    var g = add(v, '<div class="grid g-5 ds-kpi"></div>');
    var oldestDoc = docs.filter(function (d) { return d.k === "UR"; }).sort(function (a, b) { return b.age - a.age; })[0];
    var withCon = S.cd + S.ns;
    g.innerHTML = U.tile({ value: S.n, label: "Design documents", note: (one ? one.code : A.projects.length + " projects") + " · latest revision of each" }) +
      U.tile({ value: pct(S.submitted ? S.approved / S.submitted : null), label: "Approved", color: "black", note: S.approved + " of " + S.submitted + " submitted (Code A / B)" }) +
      U.tile({ value: S.ur, label: "With SAR (under review)", color: S.late ? "red" : "mid", note: "<b>" + S.late + "</b> beyond " + M.target + " days · average " + (S.avgUr == null ? "—" : S.avgUr + " d") }) +
      U.tile({ value: withCon, label: "With the contractor", color: withCon ? "yellow" : "slate", note: (S.c.D || 0) + " rejected · " + (S.c.C || 0) + " to revise · " + S.ns + " not submitted" }) +
      U.tile({ value: S.oldest || 0, unit: " days", label: "Longest SAR review", color: S.oldest > M.target * 2 ? "red" : "slate", note: oldestDoc ? esc(oldestDoc.code + " · " + (oldestDoc.desc.length > 34 ? oldestDoc.desc.slice(0, 33) + "…" : oldestDoc.desc)) : "—" });
    var tf = [function () { pick({ status: [], age: [], month: [] }); }, { status: S_(["A", "AP", "B"]) }, { status: S_(["UR"]) }, { status: S_(["C", "D", "NS"]) }, null];
    Array.prototype.forEach.call(g.children, function (t, i) {
      t.classList.add("ds-click");
      if (i === 4) { t.title = "Open this document"; if (oldestDoc) t.addEventListener("click", function () { docModal(oldestDoc); }); return; }
      t.title = i ? "Filter the page to these documents" : "Clear the status / days / month filters";
      t.addEventListener("click", function (e) { if (typeof tf[i] === "function") tf[i](); else pick(tf[i], e); });
    });

    /* B · one table for the projects (or the packages of the one project shown): status bar, the numbers and the next action */
    var dec = decisions(VM), top = {};
    dec.forEach(function (x) { (top[x.code] = top[x.code] || []).push(x); });
    var rows, byPkg = !!one;
    if (!byPkg) rows = A.projects.map(function (p) { return { key: p.code, src: p.src, label: p.code, sub: p.name, c: p.c, n: p.n, app: p.appPct, appN: p.approved, subN: p.submitted, ur: p.ur, late: p.late, oldest: p.oldest, con: p.cd + p.ns, cd: p.cd, ns: p.ns, h: hOf(M, p.src), acts: top[p.code] || [] }; })
      .sort(function (a, b) { var r = { red: 0, amber: 1, green: 2 }; return r[a.h.lvl] - r[b.h.lvl] || b.late - a.late || a.key.localeCompare(b.key); });
    else rows = Object.keys(one.cats).sort().map(function (c) {
      var l = docs.filter(function (d) { return (d.cat || "—") === c; }), q = agg(l, M.target).T;
      return { key: c, label: c, c: q.c, n: q.n, app: q.submitted ? q.approved / q.submitted : null, appN: q.approved, subN: q.submitted, ur: q.ur, late: q.late, oldest: q.oldest, con: q.cd + q.ns, cd: q.cd, ns: q.ns, docs: l };
    });
    var mp = panel(v, byPkg ? one.code + " — " + (one.name || "") + " · by package" : "Projects",
      byPkg ? "Click a coloured segment for those documents · ↺ Reset filters (or × on the project chip) to see all projects"
        : "Worst first · click a project to open its details · click a coloured segment to filter the page to that project and status (Ctrl + click to add)");
    if (byPkg) {   // the one project: health and its decisions in one line above its packages
      var oh = hOf(M, one.src), od = top[one.code] || [];
      add(mp, '<div class="ds-one">' + rag(oh.lvl) + " <b>Design health: " + oh.lvl + "</b>" + (oh.why.length ? " — " + esc(oh.why.join("; ")) : " — on track") +
        (od.length ? '<ul class="ds-acts">' + od.map(function (x) { return '<li class="ds-s' + x.sev + '"><span class="ds-who ds-w-' + x.who.toLowerCase() + '">' + esc(x.who === "Both" ? "SAR + Contractor" : x.who === "Report" ? "Data" : x.who) + "</span> " + esc(x.text) + ' <span class="ds-actx">→ ' + esc(x.act) + "</span></li>"; }).join("") + "</ul>" : "") + "</div>");
    }
    var max = Math.max.apply(null, rows.map(function (r) { return r.n; }).concat([1]));
    var tb = add(mp, '<div class="table-wrap auto-h"><table class="ds-mx ds-cmp"><thead><tr>' + (byPkg ? "" : "<th></th>") + "<th>" + (byPkg ? "Package / category" : "Project") + '</th><th class="ds-mx-bar">Status of the documents</th>' +
      "</tr></thead><tbody></tbody></table></div>").querySelector("tbody");
    function segsOf(c, n) {
      return ORDER.filter(function (k) { return c[k]; }).map(function (k) {
        return '<span class="ds-seg" data-k="' + k + '" style="flex:' + c[k] + ";background:" + B[k].color + (/UR|C|NR/.test(k) ? ";color:#3D3935" : "") + '" title="' + esc(B[k].short + ": " + c[k]) + '">' + (c[k] / n >= 0.08 ? c[k] : "") + "</span>";
      }).join("");
    }
    /* one project opened under its row: its figures, actions and packages */
    function expand(r) {
      var p = A.projects.filter(function (x) { return x.src === r.src; })[0], cats = p ? Object.keys(p.cats).sort() : [];
      var cmax = Math.max.apply(null, cats.map(function (c) { return p.cats[c].n; }).concat([1]));
      var h = '<div class="ds-exp">' +
        '<div class="ds-exp-h">' + rag(r.h.lvl) + " <b>" + esc(r.label + " — " + (r.sub || "")) + "</b>" + (r.h.why.length ? '<span class="muted"> · ' + esc(r.h.why.join("; ")) + "</span>" : '<span class="muted"> · on track</span>') + "</div>" +
        '<div class="ds-exp-k">' +
          "<div><b>" + pct(r.app) + "</b><span>approved · " + r.appN + " of " + r.subN + "</span></div>" +
          "<div><b>" + r.ur + "</b><span>with SAR" + (r.late ? ' · <em class="neg">' + r.late + " late</em>" : "") + "</span></div>" +
          "<div><b>" + (r.oldest ? r.oldest + " d" : "—") + "</b><span>longest SAR review</span></div>" +
          "<div><b>" + (r.con || 0) + "</b><span>with the contractor" + (r.con ? " · " + [r.cd ? r.cd + " C / D" : "", r.ns ? r.ns + " not submitted" : ""].filter(Boolean).join(" · ") : "") + "</span></div>" +
        "</div>" +
        (r.acts.length ? '<ul class="ds-acts">' + r.acts.map(function (x) { return '<li class="ds-s' + x.sev + '"><span class="ds-who ds-w-' + x.who.toLowerCase() + '">' + esc(x.who === "Both" ? "SAR + Contractor" : x.who === "Report" ? "Data" : x.who) +
          "</span> " + esc(x.text) + ' <span class="ds-actx">→ ' + esc(x.act) + "</span></li>"; }).join("") + "</ul>" : "") +
        (cats.length > 1 ? '<div class="ds-exp-p">' + cats.map(function (c) { var o = p.cats[c];
          return '<div class="ds-pk" data-cat="' + esc(c) + '"><span class="ds-pkn" title="' + esc(c) + '">' + esc(c) + '</span><span class="ds-sbar" style="width:' + Math.max(24, Math.round(o.n / cmax * 300)) + 'px">' + segsOf(o.c, o.n) + '</span><span class="ds-n">' + o.n + "</span></div>"; }).join("") + "</div>" : "") +
        '<div class="ds-exp-b"><button type="button" class="icon-btn ds-f">Filter the page to ' + esc(r.label) + '</button><button type="button" class="icon-btn ghost ds-det">All details & documents ›</button></div></div>';
      var x = el('<tr class="ds-xrow"><td colspan="3">' + h + "</td></tr>");
      x.addEventListener("click", function (e) {
        e.stopPropagation();
        if (e.target.closest(".ds-f")) { pick({ proj: [r.key] }, e); return; }
        if (e.target.closest(".ds-det")) { projModal(r.src); return; }
        var pk = e.target.closest(".ds-pk"); if (pk) { var c = pk.getAttribute("data-cat"), sg = e.target.closest(".ds-seg"), l = docs.filter(function (d) { return d.src === r.src && (d.cat || "—") === c; });
          listModal(r.key + " · " + c + (sg ? " · " + B[sg.getAttribute("data-k")].short : ""), sg ? l.filter(function (d) { return d.k === sg.getAttribute("data-k"); }) : l); }
      });
      return x;
    }
    st.open = st.open || {};
    rows.forEach(function (r) {
      var tr = el("<tr" + (byPkg ? "" : ' class="ds-row' + (st.open[r.key] ? " open" : "") + '"') + ">" + (byPkg ? "" : "<td>" + rag(r.h.lvl) + "</td>") +
        '<td class="ds-mx-name"><div class="ds-nmw" title="' + esc(r.label + (r.sub ? " — " + r.sub : "")) + '"><span class="ds-car">' + (byPkg ? "" : st.open[r.key] ? "▾" : "▸") + "</span><b>" + esc(r.label) + "</b>" + (r.sub ? ' <span class="muted">' + esc(r.sub) + "</span>" : "") + "</div></td>" +
        '<td class="ds-mx-bar"><div class="ds-sbar" style="width:' + Math.max(36, Math.round(r.n / max * 620)) + 'px">' + segsOf(r.c, r.n) + '</div><span class="ds-n">' + r.n + "</span></td></tr>");
      tb.appendChild(tr);
      var xr = !byPkg && st.open[r.key] ? expand(r) : null; if (xr) tb.appendChild(xr);
      tr.addEventListener("click", function (e) {
        var sg = e.target.closest(".ds-seg");
        if (byPkg) { listModal(one.code + " · " + r.key + (sg ? " · " + B[sg.getAttribute("data-k")].short : ""), sg ? r.docs.filter(function (d) { return d.k === sg.getAttribute("data-k"); }) : r.docs); return; }
        if (sg) { pick({ proj: [r.key], status: [B[sg.getAttribute("data-k")].short] }, e); return; }
        // the row opens / closes its details in place
        st.open[r.key] = !st.open[r.key]; tr.classList.toggle("open", !!st.open[r.key]); tr.querySelector(".ds-car").textContent = st.open[r.key] ? "▾" : "▸";
        if (st.open[r.key]) { xr = expand(r); tr.parentNode.insertBefore(xr, tr.nextSibling); } else if (xr) { xr.remove(); xr = null; }
      });
    });
    add(mp, '<div class="ds-legend">' + ORDER.filter(function (k) { return S.c[k]; }).map(function (k) { return '<span><i style="background:' + B[k].color + '"></i>' + esc(B[k].short) + "</span>"; }).join("") +
      (byPkg ? "" : '<span class="ds-rl">' + rag("red") + " ≥ 25% returned C / D or 3+ reviews beyond twice the target &nbsp; " + rag("amber") + " any C / D, late review or > 25% not submitted</span>") + "</div>");

    /* C · the documents to chase: longest with SAR · with the contractor */
    var g4 = add(v, '<div class="grid g-2"></div>');
    listPanel(g4, "Chase SAR — longest in review", docs.filter(function (d) { return d.k === "UR"; }).sort(function (a, b) { return (b.age || 0) - (a.age || 0); }), true);
    listPanel(g4, "Chase the contractor — returned C / D", docs.filter(function (d) { return d.k === "C" || d.k === "D"; }).sort(function (a, b) { return RANK[a.k] - RANK[b.k] || (b.age || 0) - (a.age || 0); }), false);

    /* D · every document, on demand */
    var rg = add(v, '<details class="panel ds-reg"' + (st.regOpen ? " open" : "") + '><summary><b>All documents</b> <span class="muted">· ' + plural(docs.length, "document") +
      (M.superseded ? " · " + M.superseded + " superseded / resubmitted not counted" : "") + " · search, sort, export · click a row for its history</span></summary></details>");
    function reg() { if (rg._done) return; rg._done = true; var h = add(rg, "<div></div>"); docTable(h, docs, { exportName: "NSR design register " + M.rd, maxHeight: 620 });
      add(rg, '<p class="muted ds-foot">Source: each project\'s weekly report file, sheet “Engineering Drawings” (6203: “Engineering Log”). A document submitted more than once counts once, at its latest submission. ' +
        "Status words are read onto one scale: A / B / approved · C / revise / CRS received · D / rejected · under review / submitted · not submitted; superseded / cancelled / descoped are not counted.</p>"); }
    if (st.regOpen) reg();
    rg.addEventListener("toggle", function () { st.regOpen = rg.open; if (rg.open) reg(); });
  }
  function hOf(M, src) { var p = M.projects.filter(function (x) { return x.src === src; })[0]; return p ? p.health : { lvl: "green", why: [] }; }

  function listPanel(host, title, list, sar) {
    var p = panel(host, title, plural(list.length, "document") + " · click one for its history");
    if (!list.length) { add(p, '<div class="empty-note">Nothing waiting.</div>'); return; }
    var ul = add(p, '<ul class="ds-list"></ul>'), groups = [], gi = {};
    list.forEach(function (d) {   // documents of one project with the same wait and the same title stem read as one line
      var key = d.code + "|" + d.k + "|" + d.age;   // same project, status and submission day
      if (gi[key]) gi[key].docs.push(d); else { gi[key] = { d: d, docs: [d] }; groups.push(gi[key]); }
    });
    groups.forEach(function (gr) {   // the shared start of the titles names the group
      var t = gr.docs.map(function (x) { return String(x.desc); }), pre = t[0];
      t.forEach(function (x) { var i = 0; while (i < pre.length && i < x.length && pre[i] === x[i]) i++; pre = pre.slice(0, i); });
      gr.stem = pre.replace(/[\s\-–(,]*\w{0,3}$/, "").trim() || gr.d.cat || "documents";
    });
    groups.slice(0, 8).forEach(function (gr) {
      var d = gr.d, n = gr.docs.length;
      var li = add(ul, "<li>" + badge(d.k) + ' <b>' + esc(d.code) + "</b> " + esc(n > 1 ? gr.stem + " — " + n + " documents" : d.desc) + '<span class="ds-age' + (d.late || !sar && d.age > 30 ? " neg" : "") + '">' +
        (d.age == null ? "" : d.age + " d") + (n === 1 && d.cycles > 1 ? " · " + d.cycles + "× submitted" : "") + "</span></li>");
      li.addEventListener("click", function () { if (n > 1) listModal(d.code + " · " + gr.stem, gr.docs, NEXT[d.k]); else docModal(d); });
    });
    if (groups.length > 8) { var m = add(p, '<button type="button" class="link-btn">All ' + list.length + " ›</button>"); m.addEventListener("click", function () { listModal(title, list, sar ? NEXT.UR : ""); }); }
  }

  window.SARDesign = { fromWorkbook: fromWorkbook, classify: classify, model: model, decisions: decisions, page: page, BUCKETS: B };
})();

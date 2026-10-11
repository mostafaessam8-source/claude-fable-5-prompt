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
      if (p.late) out.push({ sev: p.oldest > M.target * 3 ? 3 : 2, who: "SAR", code: lab, src: p.src,
        text: p.late + " document" + (p.late === 1 ? "" : "s") + " waiting on SAR review beyond " + M.target + " days (oldest " + p.oldest + " days).",
        act: "Expedite the SAR review — assign reviewers / hold a review workshop with the designer.", docs: lateDocs });
      var dd = mine.filter(function (d) { return d.k === "D"; }), cc = mine.filter(function (d) { return d.k === "C"; });
      if (dd.length) out.push({ sev: 3, who: "Contractor", code: lab, src: p.src, text: dd.length + " submission" + (dd.length === 1 ? "" : "s") + " rejected (Code D).",
        act: "Escalate design quality with the contractor; agree a corrective plan and resubmission dates.", docs: dd });
      if (cc.length) out.push({ sev: cc.length >= 5 || p.cdPct >= 0.4 ? 3 : 2, who: "Contractor", code: lab, src: p.src,
        text: cc.length + " returned for revision (Code C) and not yet resubmitted.", act: "Get resubmission dates from the contractor and track them weekly.", docs: cc });
      var many = mine.filter(function (d) { return d.cycles >= 3 && !B[d.k].done; });
      if (many.length) out.push({ sev: 2, who: "Both", code: lab, src: p.src, text: many.length + " document" + (many.length === 1 ? "" : "s") + " on a 3rd or later submission and still not approved.",
        act: "Hold a joint SAR–contractor meeting to close the open comments in one round.", docs: many });
      if (p.ns && p.ns / p.n > 0.25) out.push({ sev: 1, who: "Contractor", code: lab, src: p.src, text: p.ns + " of " + p.n + " planned documents not submitted yet.",
        act: "Ask for a submission schedule for the remaining documents.", docs: mine.filter(function (d) { return d.k === "NS"; }) });
      if (p.nr) out.push({ sev: 1, who: "Report", code: lab, src: p.src, text: p.nr + " submitted document" + (p.nr === 1 ? " has" : "s have") + " no review status in the weekly report.",
        act: "Ask the project team to complete the Status column.", docs: mine.filter(function (d) { return d.k === "NR"; }) });
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
  function decItem(x) {
    var li = el('<li class="ds-s' + x.sev + '"><div class="ds-dh"><span class="ds-who ds-w-' + x.who.toLowerCase() + '">' + esc(x.who === "Both" ? "SAR + Contractor" : x.who === "Report" ? "Data" : "Action: " + x.who) +
      '</span> <b>' + esc(x.code) + "</b> · " + esc(x.text) + '</div><div class="ds-act">→ ' + esc(x.act) + "</div></li>");
    li.title = "Click for the documents";
    li.addEventListener("click", function () { listModal(x.code + " — " + x.text, x.docs, x.act); });
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
      { key: "cat", label: "Package / category", options: U.uniq(M.active.map(function (d) { return d.cat || "—"; })).sort(), get: function (d) { return d.cat || "—"; } },
      { key: "status", label: "Status", options: ORDER.slice().sort(function (a, b) { return RANK[a] - RANK[b]; }).map(function (k) { return B[k].short; }), get: function (d) { return B[d.k].short; } },
      { key: "owner", label: "With (who acts)", options: ["SAR", "Contractor", "Project team (data)", "Done"], get: owner },
      { key: "age", label: "Days since submission", options: bands.map(function (b) { return b[2]; }).concat(["Not submitted"]), get: band },
      { key: "month", label: "Submitted (month)", options: months, display: function (m) { return fmt.month(m); }, get: function (d) { return d.sub ? d.sub.slice(0, 7) + "-01" : ""; } },
      { key: "health", label: "Project health", options: ["red", "amber", "green"], display: function (x) { return x.charAt(0).toUpperCase() + x.slice(1); }, get: function (d) { return d.health; } },
      { key: "cyc", label: "Submissions", options: ["0", "1", "2", "3+"], display: function (x) { return x === "0" ? "Not submitted" : x + (x === "1" ? " submission" : " submissions"); }, get: function (d) { return d.cycles >= 3 ? "3+" : String(d.cycles || 0); } }
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
      var hint = fbar.querySelector(".chips .hint"); if (hint) hint.textContent = "Tip: filter here · click any card, slice, bar, project or document for its details";
    }
    var docs = K ? M.active.filter(function (d) { return K.passes(d, defs, f); }) : M.active;
    var A = agg(docs, M.target), S = A.T;
    var VM = { projects: A.projects, active: docs, target: M.target };
    CUR = { M: M, ctx: ctx, f: f };
    var one = A.projects.length === 1 ? A.projects[0] : null;
    var nF = defs.reduce(function (n, d) { return n + ((f[d.key] || []).length ? 1 : 0); }, 0);
    var scope = nF ? plural(docs.length, "document") + " match the filters" : "All " + M.projects.length + " projects";

    var secs = [["ds-ov", "Overview"], ["ds-dec", "Decisions"], ["ds-sar", "SAR review"], ["ds-con", "Contractor"], ["ds-trend", "Trend"], ["ds-proj", "Projects"], ["ds-reg", "Register"]];
    var nav = add(v, '<nav class="sec-nav">' + secs.map(function (s) { return '<a href="#" data-s="' + s[0] + '">' + esc(s[1]) + "</a>"; }).join("") + "</nav>");
    nav.addEventListener("click", function (e) { var a = e.target.closest("a[data-s]"); if (!a) return; e.preventDefault(); var t = document.getElementById(a.getAttribute("data-s")); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); });
    function sec(id, title, sub) { var h = K ? K.secHead(v, title, sub) : add(v, "<h3>" + esc(title) + "</h3>"); h.id = id; return h; }
    if (!docs.length) { add(v, '<div class="empty">No document matches the filters — use ↺ Reset filters.</div>'); return; }

    /* 1 · Overview */
    sec("ds-ov", "Overview", esc(scope) + " · report date " + fmt.date(M.rd) + " · SAR review target " + M.target + " days · click any card, slice or bar for the details");
    var g = add(v, '<div class="grid g-7"></div>');
    var oldestDoc = docs.filter(function (d) { return d.k === "UR"; }).sort(function (a, b) { return b.age - a.age; })[0];
    g.innerHTML = U.tile({ value: S.n, label: "Design documents", note: (one ? one.code : A.projects.length + " projects") + " · latest revision of each" }) +
      U.tile({ value: pct(S.submitted ? S.approved / S.submitted : null), label: "Approved", color: "black", note: S.approved + " of " + S.submitted + " submitted (A / B)" }) +
      U.tile({ value: S.ur, label: "Under SAR review", color: "mid", note: "Average " + (S.avgUr == null ? "—" : S.avgUr + " days") }) +
      U.tile({ value: S.late, label: "Beyond " + M.target + " days", color: S.late ? "red" : "slate", note: "In SAR review longer than the target" }) +
      U.tile({ value: S.cd, label: "Returned C / D", color: S.cd ? "yellow" : "slate", note: (S.c.D || 0) + " rejected · " + (S.c.C || 0) + " to revise" }) +
      U.tile({ value: S.ns, label: "Not submitted yet", color: "slate", note: S.nr ? S.nr + " submitted with no status" : "Planned in the register" }) +
      U.tile({ value: S.oldest || 0, unit: " days", label: "Oldest in SAR review", color: S.oldest > M.target * 2 ? "red" : "yellow", note: oldestDoc ? esc(oldestDoc.code + " · " + (oldestDoc.desc.length > 34 ? oldestDoc.desc.slice(0, 33) + "…" : oldestDoc.desc)) : "" });
    tileClicks(g, [docs, docs.filter(isDone), docs.filter(function (d) { return d.k === "UR"; }), docs.filter(function (d) { return d.late; }),
      docs.filter(function (d) { return d.k === "C" || d.k === "D"; }), docs.filter(function (d) { return d.k === "NS" || d.k === "NR"; }), oldestDoc ? [oldestDoc] : null],
      ["All documents", "Approved", "Under SAR review", "Beyond the " + M.target + "-day review target", "Returned C / D", "Not submitted / no status", "Oldest in review"]);
    var g1 = add(v, '<div class="grid g-2"></div>');
    // status mix (doughnut) · who has the ball (bar)
    var p1 = panel(g1, "Status mix", "Latest status of each document · click a slice");
    var b1 = add(p1, '<div class="chart-box"></div>'), ks = ORDER.filter(function (k) { return S.c[k]; });
    U.chart(b1, { type: "doughnut", data: { labels: ks.map(function (k) { return B[k].short; }), datasets: [{ data: ks.map(function (k) { return S.c[k]; }), backgroundColor: ks.map(function (k) { return B[k].color; }), borderColor: "#fff", borderWidth: 2 }] },
      options: { cutout: "58%", plugins: { legend: { position: "right" }, datalabels: { display: function (c) { return c.dataset.data[c.dataIndex] / S.n >= 0.04; }, color: function (c) { return /UR|C|NR/.test(ks[c.dataIndex]) ? C.black : "#fff"; }, font: { weight: "700" } },
        tooltip: { callbacks: { label: function (c) { return " " + c.label + ": " + c.parsed + " (" + Math.round(c.parsed / S.n * 100) + "%)"; }, footer: clickHint } } },
        onHover: hand, onClick: function (e, els) { if (els.length) { var k = ks[els[0].index]; listModal(B[k].label, docs.filter(function (d) { return d.k === k; })); } } } });
    var owners = ["SAR", "Contractor", "Project team (data)", "Done"], oc = { SAR: C.mid, Contractor: C.yellow, "Project team (data)": C.gray, Done: C.blue };
    var p2 = panel(g1, "Who has to act", "Documents by whose court the ball is in · click a bar");
    var b2 = add(p2, '<div class="chart-box"></div>');
    U.chart(b2, { type: "bar", data: { labels: owners, datasets: [U.barDs("Documents", owners.map(function (o) { return docs.filter(function (d) { return owner(d) === o; }).length; }), owners.map(function (o) { return oc[o]; }), { maxBarThickness: 60 })] },
      options: { plugins: { legend: { display: false }, datalabels: { display: true, anchor: "end", align: "end", color: C.black, font: { weight: "700" } }, tooltip: { callbacks: { footer: clickHint } } }, layout: { padding: { top: 20 } },
        onHover: hand, onClick: function (e, els) { if (els.length) { var o = owners[els[0].index]; listModal("With " + o, docs.filter(function (d) { return owner(d) === o; }), o === "SAR" ? NEXT.UR : o === "Contractor" ? "Contractor to resubmit / submit." : ""); } },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 } } } } });

    /* 2 · Decisions */
    var dec = decisions(VM);
    sec("ds-dec", "Decisions needed", dec.length ? plural(dec.length, "item") + " · red = act now · click an item for its documents" : "nothing to decide");
    var dp = add(v, '<section class="panel"></section>');
    if (!dec.length) add(dp, '<div class="note-box ok">No design item needs a management decision — everything is approved or within the review target.</div>');
    else {
      var ul = add(dp, '<ol class="ds-dec"></ol>'), lim = st.decAll ? dec.length : 10;
      dec.slice(0, lim).forEach(function (x) { ul.appendChild(decItem(x)); });
      if (dec.length > 10) { var mb = add(dp, '<button type="button" class="link-btn ds-more">' + (st.decAll ? "Show fewer ▴" : "Show all " + dec.length + " ▾") + "</button>"); mb.addEventListener("click", function () { st.decAll = !st.decAll; ctx.rerender(); }); }
    }

    /* 3 · SAR review */
    var urs = docs.filter(function (d) { return d.k === "UR" && d.age != null; });
    sec("ds-sar", "SAR review", plural(urs.length, "document") + " waiting on SAR · " + S.late + " beyond " + M.target + " days · average " + (S.avgUr == null ? "—" : S.avgUr + " days"));
    var g3 = add(v, '<div class="grid g-2"></div>');
    var p3 = panel(g3, "How long documents wait for SAR review", "Days since submission at the report date · click a bar");
    var b3 = add(p3, '<div class="chart-box"></div>');
    var urP = A.projects.filter(function (p) { return p.ur; });
    U.chart(b3, { type: "bar", data: { labels: bands.map(function (b) { return b[2]; }), datasets: urP.map(function (p, i) {
        return U.barDs(p.code, bands.map(function (b) { return urs.filter(function (d) { return d.src === p.src && d.age >= b[0] && d.age <= b[1]; }).length; }), PAL[i % PAL.length], { stack: "a", maxBarThickness: 46 }); }) },
      options: { plugins: { legend: { position: "bottom", display: urP.length > 1 }, datalabels: { display: false }, tooltip: { callbacks: { footer: clickHint } } },
        onHover: hand, onClick: function (e, els) { if (!els.length) return; var b = bands[els[0].index];
          var l = urs.filter(function (d) { return d.age >= b[0] && d.age <= b[1]; }).sort(function (x, y) { return y.age - x.age; });
          listModal("Under SAR review " + b[2].replace(/ d$/, " days"), l, NEXT.UR); },
        scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } } } });
    var p4 = panel(g3, "Review time by project", "Average and oldest days in SAR review · the line is the " + M.target + "-day target · click a bar");
    var b4 = add(p4, '<div class="chart-box"></div>'); b4.style.height = Math.max(240, urP.length * 38 + 70) + "px";
    U.chart(b4, { type: "bar", data: { labels: urP.map(function (p) { return p.code; }), datasets: [
        U.barDs("Average days", urP.map(function (p) { return p.avgUr; }), C.mid, { maxBarThickness: 16 }), U.barDs("Oldest days", urP.map(function (p) { return p.oldest; }), C.blue, { maxBarThickness: 16 })] },
      options: { indexAxis: "y", plugins: { legend: { position: "bottom" }, datalabels: { display: true, anchor: "end", align: "end", color: C.black, font: { size: 10, weight: "700" } }, tooltip: { callbacks: { footer: clickHint } } },
        layout: { padding: { right: 30 } }, onHover: hand,
        onClick: function (e, els) { if (els.length) { var p = urP[els[0].index]; listModal(p.code + " · under SAR review", urs.filter(function (d) { return d.src === p.src; }).sort(function (a, b) { return b.age - a.age; }), NEXT.UR); } },
        scales: { x: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: function (c) { return c.tick && c.tick.value === M.target ? C.red : "rgba(200,201,199,.5)"; }, lineWidth: function (c) { return c.tick && c.tick.value === M.target ? 2 : 1; } },
          afterBuildTicks: function (ax) { if (!ax.ticks.some(function (t) { return t.value === M.target; })) { ax.ticks.push({ value: M.target }); ax.ticks.sort(function (a, b) { return a.value - b.value; }); } } }, y: { grid: { display: false } } } } });
    listPanel(v, "Waiting on SAR — longest first", docs.filter(function (d) { return d.k === "UR"; }).sort(function (a, b) { return (b.age || 0) - (a.age || 0); }), true);

    /* 4 · Contractor */
    var con = docs.filter(function (d) { return d.k === "C" || d.k === "D" || d.k === "NS"; });
    sec("ds-con", "Contractor", plural(S.cd, "document") + " returned C / D · " + S.ns + " not submitted · " + plural(docs.filter(function (d) { return d.cycles > 1; }).length, "document") + " resubmitted");
    var g4 = add(v, '<div class="grid g-2"></div>');
    var cp = A.projects.filter(function (p) { return p.cd || p.ns; }), ck = ["D", "C", "NS"];
    var p5 = panel(g4, "Returned and not submitted, by project", "Click a bar");
    var b5 = add(p5, '<div class="chart-box"></div>'); b5.style.height = Math.max(240, cp.length * 34 + 70) + "px";
    U.chart(b5, { type: "bar", data: { labels: cp.map(function (p) { return p.code; }), datasets: ck.map(function (k) { return U.barDs(B[k].short, cp.map(function (p) { return p.c[k] || 0; }), B[k].color, { stack: "c", maxBarThickness: 22 }); }) },
      options: { indexAxis: "y", plugins: { legend: { position: "bottom" }, datalabels: { display: function (c) { return c.dataset.data[c.dataIndex] > 0; }, color: function (c) { return c.datasetIndex === 1 ? C.black : "#fff"; }, font: { size: 10, weight: "700" } }, tooltip: { callbacks: { footer: clickHint } } },
        onHover: hand, onClick: function (e, els) { if (!els.length) return; var p = cp[els[0].index], k = ck[els[0].datasetIndex];
          var l = docs.filter(function (d) { return d.src === p.src && d.k === k; }); listModal(p.code + " · " + B[k].label, l.length ? l : docs.filter(function (d) { return d.src === p.src && ck.indexOf(d.k) >= 0; }), NEXT[k]); },
        scales: { x: { stacked: true, beginAtZero: true, ticks: { precision: 0 } }, y: { stacked: true, grid: { display: false } } } } });
    var cyc = ["1", "2", "3", "4+"], cycOf = function (d) { return d.cycles >= 4 ? "4+" : String(d.cycles); };
    var subd = docs.filter(function (d) { return d.cycles > 0; });
    var p6 = panel(g4, "Submissions needed per document", "How many times each document has been submitted · coloured by today's status · click a bar");
    var b6 = add(p6, '<div class="chart-box"></div>');
    U.chart(b6, { type: "bar", data: { labels: cyc.map(function (c) { return c === "1" ? "1st submission" : c === "4+" ? "4 or more" : c + " submissions"; }), datasets: ORDER.filter(function (k) { return k !== "NS"; }).map(function (k) {
        return U.barDs(B[k].short, cyc.map(function (c) { return subd.filter(function (d) { return d.k === k && cycOf(d) === c; }).length; }), B[k].color, { stack: "y", maxBarThickness: 60 }); }) },
      options: { plugins: { legend: { position: "bottom" }, datalabels: { display: false }, tooltip: { callbacks: { footer: clickHint } } },
        onHover: hand, onClick: function (e, els) { if (!els.length) return; var c = cyc[els[0].index]; listModal("Documents on " + (c === "1" ? "their 1st submission" : c + " submissions"), subd.filter(function (d) { return cycOf(d) === c; })); },
        scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } } } });
    listPanel(v, "Waiting on the contractor — rejected first", con.filter(function (d) { return d.k !== "NS"; }).sort(function (a, b) { return RANK[a.k] - RANK[b.k] || (b.age || 0) - (a.age || 0); }), false);

    /* 5 · Trend */
    var ms = U.uniq(docs.map(function (d) { return d.sub ? d.sub.slice(0, 7) : ""; }).filter(Boolean)).sort().slice(-18);
    sec("ds-trend", "Trend", "Submissions per month by month of the latest submission, coloured by today's status");
    if (ms.length) {
      var p7 = panel(v, "Submissions per month", "Last 18 months · click a bar");
      var b7 = add(p7, '<div class="chart-box short"></div>'), mk = ORDER.filter(function (k) { return k !== "NS"; });
      U.chart(b7, { type: "bar", data: { labels: ms.map(function (m) { return fmt.month(m + "-01"); }), datasets: mk.map(function (k) {
          return U.barDs(B[k].short, ms.map(function (m) { return docs.filter(function (d) { return d.k === k && d.sub && d.sub.slice(0, 7) === m; }).length; }), B[k].color, { stack: "m", maxBarThickness: 40 }); }) },
        options: { plugins: { legend: { position: "bottom" }, datalabels: { display: false }, tooltip: { callbacks: { footer: clickHint } } },
          onHover: hand, onClick: function (e, els) { if (!els.length) return; var m = ms[els[0].index], k = mk[els[0].datasetIndex];
            var all = docs.filter(function (d) { return d.sub && d.sub.slice(0, 7) === m; }), l = all.filter(function (d) { return d.k === k; });
            listModal("Submitted " + fmt.month(m + "-01") + (l.length ? " · " + B[k].short : ""), l.length ? l : all); },
          scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } } } });
    } else add(v, '<div class="empty-note">No submission dates in the filtered documents.</div>');

    /* 6 · Projects */
    sec("ds-proj", "Projects", plural(A.projects.length, "project") + " · health: red = a quarter or more of submissions returned C / D or 3+ in review beyond twice the target · amber = any C / D, review beyond target or > 25% not submitted");
    var g6 = add(v, '<div class="grid g-2-1"></div>');
    if (one) {
      var cats = Object.keys(one.cats).sort();
      var p8 = panel(g6, "Status by package / category", one.code + " · click a bar");
      var b8 = add(p8, '<div class="chart-box"></div>'); b8.style.height = Math.max(240, cats.length * 30 + 70) + "px";
      U.chart(b8, { type: "bar", data: { labels: cats.map(function (c) { return U.wrapLabel ? U.wrapLabel(c, 34) : c; }), datasets: ORDER.map(function (k) {
          return U.barDs(B[k].short, cats.map(function (c) { return one.cats[c].c[k] || 0; }), B[k].color, { stack: "s", maxBarThickness: 22 }); }) },
        options: { indexAxis: "y", plugins: { legend: { position: "bottom" }, datalabels: { display: false }, tooltip: { callbacks: { footer: clickHint } } },
          onHover: hand, onClick: function (e, els) { if (!els.length) return; var c = cats[els[0].index], k = ORDER[els[0].datasetIndex];
            var all = docs.filter(function (d) { return (d.cat || "—") === c; }), l = all.filter(function (d) { return d.k === k; });
            listModal(one.code + " · " + c + (l.length ? " · " + B[k].short : ""), l.length ? l : all); },
          scales: { x: { stacked: true, beginAtZero: true, ticks: { precision: 0 } }, y: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 } } } } } });
    } else {
      var p9 = panel(g6, "Design status by project", "Latest revision of each document · click a bar for the project");
      var b9 = add(p9, '<div class="chart-box"></div>'); b9.style.height = Math.max(240, A.projects.length * 34 + 70) + "px";
      U.chart(b9, { type: "bar", data: { labels: A.projects.map(function (p) { return p.code; }), datasets: ORDER.map(function (k) {
          return U.barDs(B[k].short, A.projects.map(function (p) { return p.c[k] || 0; }), B[k].color, { stack: "s", maxBarThickness: 22 }); }) },
        options: { indexAxis: "y", plugins: { legend: { position: "bottom" }, datalabels: { display: function (c) { return c.dataset.data[c.dataIndex] >= 3; }, color: function (c) { return /Under|Revise|No status/.test(c.dataset.label) ? C.black : "#fff"; }, font: { weight: "700", size: 10 } }, tooltip: { callbacks: { footer: clickHint } } },
          scales: { x: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, grid: { color: "rgba(200,201,199,.5)" } }, y: { stacked: true, grid: { display: false } } },
          onHover: hand, onClick: function (e, els) { if (els.length) projModal(A.projects[els[0].index].src); } } });
    }
    // health summary next to the chart
    var hp = panel(g6, "Design health", "Click a project");
    var hc = { red: [], amber: [], green: [] }; M.projects.forEach(function (p) { if (A.projects.some(function (x) { return x.src === p.src; })) hc[p.health.lvl].push(p); });
    ["red", "amber", "green"].forEach(function (l) {
      if (!hc[l].length) return;
      var box = add(hp, '<div class="ds-hl"><div class="ds-hlh">' + rag(l) + " <b>" + l.charAt(0).toUpperCase() + l.slice(1) + "</b> · " + hc[l].length + "</div></div>");
      hc[l].forEach(function (p) {
        var it = add(box, '<button type="button" class="ds-hp"><b>' + esc(p.code) + "</b> " + esc(p.name || "") + '<span class="muted">' + esc(p.health.why.join("; ") || "On track") + "</span></button>");
        it.addEventListener("click", function () { projModal(p.src); });
      });
    });
    var p10 = panel(v, "Project design scorecard", "Figures for the filtered documents · health for the whole project · click a row for the project");
    U.table(p10, { rows: A.projects, exportName: "NSR design scorecard " + M.rd, search: false, sort: null,
      columns: [
        { label: "", get: function (p) { var h = hOf(M, p.src); return { red: 0, amber: 1, green: 2 }[h.lvl]; }, render: function (_, p) { return rag(hOf(M, p.src).lvl); } },
        { label: "Project", key: "code", render: function (_, p) { return "<b>" + esc(p.code) + '</b><div class="muted ds-nm">' + esc(p.name || "") + "</div>"; } },
        { label: "Documents", key: "n", type: "int" },
        { label: "Approved %", get: function (p) { return p.appPct; }, render: function (x, p) { return U.meter(x) + '<div class="muted ds-sm">' + p.approved + " of " + p.submitted + "</div>"; } },
        { label: "Under review", key: "ur", type: "int" },
        { label: "> target", key: "late", type: "int", render: function (x) { return x ? '<b class="neg">' + x + "</b>" : "0"; } },
        { label: "Avg days", key: "avgUr", type: "int" },
        { label: "Oldest", key: "oldest", type: "int" },
        { label: "C / D", key: "cd", type: "int", render: function (x) { return x ? '<b class="neg">' + x + "</b>" : "0"; } },
        { label: "Not submitted", key: "ns", type: "int" },
        { label: "Resubmitted", key: "resub", type: "int" },
        { label: "Why", get: function (p) { return hOf(M, p.src).why.join("; "); }, render: function (x) { return '<span class="ds-why">' + esc(x || "On track") + "</span>"; } }
      ],
      onRow: function (p) { projModal(p.src); }, rowTitle: "Open this project's design status" });

    /* 7 · Register */
    sec("ds-reg", "Document register", plural(docs.length, "document") + " · latest revision of each" + (M.superseded ? " · " + M.superseded + " superseded / cancelled / resubmitted not counted" : "") + " · click a row for the document and its history");
    var p11 = add(v, '<section class="panel"></section>');
    docTable(p11, docs, { exportName: "NSR design register " + M.rd, maxHeight: 620 });
    add(v, '<p class="muted ds-foot">Source: each project\'s weekly report file, sheet “Engineering Drawings” (6203: “Engineering Log”). A document submitted more than once is counted once, at its latest submission. ' +
      "Status words are read as: A / Code A → Approved (A); B / Code B / approved with comments → Approved (B); Approved / Closed → Approved; C / revise & resubmit / CRS received → Code C; D / rejected → Code D; " +
      "under review / submitted / UR → Under SAR review; superseded / cancelled / descoped → not counted. A code in the remarks (e.g. “SAR sent CRS with Code B”) is used when the status is generic.</p>");
  }
  function hOf(M, src) { var p = M.projects.filter(function (x) { return x.src === src; })[0]; return p ? p.health : { lvl: "green", why: [] }; }

  function listPanel(host, title, list, sar) {
    var p = panel(host, title, plural(list.length, "document") + " · click a document for its details");
    if (!list.length) { add(p, '<div class="empty-note">Nothing waiting.</div>'); return; }
    var ul = add(p, '<ul class="ds-list ds-cols"></ul>');
    list.slice(0, 12).forEach(function (d) {
      var li = add(ul, "<li>" + badge(d.k) + ' <b>' + esc(d.code) + "</b> " + esc(d.desc) + '<span class="ds-age' + (d.late || !sar && d.age > 30 ? " neg" : "") + '">' +
        (d.age == null ? "" : d.age + " d") + (d.cycles > 1 ? " · " + d.cycles + "× submitted" : "") + "</span></li>");
      li.addEventListener("click", function () { docModal(d); });
    });
    if (list.length > 12) { var m = add(p, '<button type="button" class="link-btn">All ' + list.length + " ›</button>"); m.addEventListener("click", function () { listModal(title, list, sar ? NEXT.UR : ""); }); }
  }

  window.SARDesign = { fromWorkbook: fromWorkbook, classify: classify, model: model, decisions: decisions, page: page, BUCKETS: B };
})();

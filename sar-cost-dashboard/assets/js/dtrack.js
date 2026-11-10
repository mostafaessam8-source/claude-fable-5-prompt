/* Design Submission Tracker: the "Tracker" sheet of the ESS Design Submission Tracker workbook, read by the importer into
   Design_Tracker (one row per project P / element E) and Design_Tracker_Info (data date, at-risk window, earned-% rules).
   Each element has up to three design stages (Concept · Preliminary · Detailed). %, health and variance follow the
   workbook's own formulas, so the Detailed stage (which has no such columns in the sheet) is measured the same way.
   window.SARDesignTracker = { model(D) → { projects, elements, stages, ... }, page(ctx) } */
(function () {
  "use strict";
  var U = window.UI, esc = U.esc, fmt = U.fmt;
  var STAGES = ["Concept", "Preliminary", "Detailed"];
  var SHORT = { Concept: "C", Preliminary: "P", Detailed: "D" };
  var HEALTH = ["Delayed", "At Risk", "In Progress", "Not Started", "Completed"];            // worst first
  var HCOL = { "Completed": "#005A69", "In Progress": "#59CBE8", "At Risk": "#F1B434", "Delayed": "#CB2C30", "Not Started": "#768692" };
  var HRANK = { "Delayed": 1, "At Risk": 2, "In Progress": 3, "Not Started": 4, "Completed": 5 };

  function el(h) { var d = document.createElement("div"); d.innerHTML = h.trim(); return d.firstChild; }
  function add(host, h) { var e = el(h); host.appendChild(e); return e; }
  function panel(host, title, sub) { var p = el(U.panel(title, sub || "", "")); host.appendChild(p); return p; }
  function day(s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ""); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5 : null; }
  function iso(n) { return n == null ? null : new Date(n * 864e5).toISOString().slice(0, 10); }
  function num(v) { return typeof v === "number" ? v : v == null || v === "" || isNaN(+v) ? null : +v; }
  function d0(s) { return s ? fmt.date(s) : "—"; }
  function hBadge(h) { return h ? '<span class="dt-h" style="--h:' + HCOL[h] + '">' + esc(h) + "</span>" : '<span class="muted">—</span>'; }

  /* ------------------------------ model ------------------------------ */
  function settings(D) {
    var info = (D.t("Design_Tracker_Info") || [])[0] || {};
    var w = {}; String(info.Weights || "").split(";").forEach(function (p) { var kv = p.split("="); if (kv[0] && +kv[1]) w[kv[0]] = +kv[1]; });
    var earn = function (k, def) { var v = num(info["Earned " + k]); return v == null ? def : v; };
    return {
      dd: info["Data Date"] || null, win: num(info["At-Risk Window"]) || 14, sheet: info.Sheet || "Tracker",
      w: { Concept: w.Concept || 0.15, Preliminary: w.Preliminary || 0.3, Detailed: w.Detailed || 0.55 },
      earn: { sub: earn("submitted", 0.6), D: earn("D", 0.5), C: earn("C", 0.7), B: earn("B", 0.9), A: earn("A", 1) }
    };
  }
  /** one design stage of one row, measured with the workbook's formulas */
  function stageOf(r, s, S) {
    var g = function (k) { var v = r[s + " " + k]; return k === "SAR Code" ? v : day(v) != null ? v : null; };   // text in a date column is not a date (as COUNT in the workbook)
    var bs = g("Baseline Submission"), ba = g("Baseline Approval"), as = g("Actual Submission"), ar = g("Actual Review"),
      code = g("SAR Code") ? String(g("SAR Code")).trim().toUpperCase().charAt(0) : "", fs = g("Forecast Submission"), fa = g("Forecast Approval");
    var has = !!(bs || ba || as || ar || fs || fa || code);
    if (!has) return null;
    var pct = code === "A" ? S.earn.A : code === "B" ? S.earn.B : code === "C" ? S.earn.C : code === "D" ? S.earn.D : as ? S.earn.sub : 0;
    var dd = day(S.dd), open = !code || code === "C" || code === "D", h;
    if (pct >= 1) h = "Completed";
    else if ((!as && bs && day(bs) < dd) || (open && ba && day(ba) < dd)) h = "Delayed";
    else if ((!as && bs && day(bs) - dd <= S.win) || (open && ba && day(ba) - dd <= S.win)) h = "At Risk";
    else if (!as && !ar) h = "Not Started";
    else h = "In Progress";
    var v = null;
    if (ba) v = ar && (code === "A" || code === "B") ? day(ar) - day(ba) : fa ? day(fa) - day(ba) : dd - day(ba);
    return { stage: s, bs: bs, ba: ba, as: as, ar: ar, code: code, fs: fs, fa: fa, pct: pct, health: h, varD: v,
      waiting: as && !(code === "A" || code === "B") && (!ar || day(as) > day(ar)) ? dd - day(as) : null };
  }
  function weighted(list, S) {   // Σ weight × items × average % ÷ Σ weight × items (the workbook's programme total)
    var num_ = 0, den = 0;
    STAGES.forEach(function (s) {
      var xs = list.map(function (e) { return e.st[s]; }).filter(Boolean);
      if (!xs.length) return;
      var avg = xs.reduce(function (a, x) { return a + x.pct; }, 0) / xs.length;
      num_ += S.w[s] * xs.length * avg; den += S.w[s] * xs.length;
    });
    return den ? num_ / den : null;
  }
  function model(D) {
    var S = settings(D), rows = D.t("Design_Tracker") || [], byP = {}, order = [];
    rows.forEach(function (r) {
      var c = String(r["Project Code"]);
      if (!byP[c]) { byP[c] = { code: c, name: r.Project, prog: r.Programme, prow: null, els: [] }; order.push(c); }
      if (r.Level === "P" && !byP[c].prow) byP[c].prow = r; else byP[c].els.push(r);
    });
    var elements = [], projects = order.map(function (c) {
      var p = byP[c], src = p.els.length ? p.els : (p.prow ? [p.prow] : []);
      var els = src.map(function (r) {
        var st = {}, cur = null;
        STAGES.forEach(function (s) { var x = stageOf(r, s, S); if (x) { st[s] = x; cur = x; } });
        var e = { code: c, pname: p.name, name: r.Element, row: r, st: st, cur: cur, priority: r.Priority, subNo: r["Submittal No"],
          lastSub: r["Submission Date"], lastAppr: r["Approval Date"], status: r.Status, final: r["Code (final)"], notes: r.Notes };
        e.pct = weighted([e], S); e.health = cur ? cur.health : null;
        return e;
      }).filter(function (e) { return e.cur || e.status || e.notes; });
      els.forEach(function (e) { elements.push(e); });
      var cnt = {}; HEALTH.forEach(function (h) { cnt[h] = 0; }); els.forEach(function (e) { if (e.health) cnt[e.health]++; });
      var worst = HEALTH.filter(function (h) { return cnt[h]; })[0] || null;
      var fa = els.map(function (e) { return e.cur && e.cur.fa; }).filter(Boolean).sort().pop() || null;
      var starts = [];
      src.concat(p.prow ? [p.prow] : []).forEach(function (r) { STAGES.forEach(function (s) { if (r[s + " Baseline Submission"]) starts.push(r[s + " Baseline Submission"]); }); });
      var stg = {};
      STAGES.forEach(function (s) {
        var xs = els.map(function (e) { return e.st[s]; }).filter(Boolean);
        if (!xs.length) return;
        var h = HEALTH.filter(function (k) { return xs.some(function (x) { return x.health === k; }); })[0];
        stg[s] = { n: xs.length, pct: xs.reduce(function (a, x) { return a + x.pct; }, 0) / xs.length, health: h };
      });
      return { code: c, name: p.name, prog: p.prog, els: els, cnt: cnt, worst: worst, pct: weighted(els, S), stg: stg, lastFa: fa,
        end: (p.prow && p.prow["Project End Date"]) || null, start: starts.sort()[0] || null,
        maxVar: els.reduce(function (m, e) { return e.cur && e.cur.varD != null && e.cur.health !== "Completed" ? Math.max(m, e.cur.varD) : m; }, 0) || null,
        notes: p.prow && p.prow.Notes };
    }).filter(function (p) { return p.els.length; });
    var stages = STAGES.map(function (s) {
      var xs = elements.map(function (e) { return e.st[s]; }).filter(Boolean), cnt = {};
      HEALTH.forEach(function (h) { cnt[h] = xs.filter(function (x) { return x.health === h; }).length; });
      return { stage: s, w: S.w[s], n: xs.length, pct: xs.length ? xs.reduce(function (a, x) { return a + x.pct; }, 0) / xs.length : null, cnt: cnt,
        lastFa: xs.map(function (x) { return x.fa; }).filter(Boolean).sort().pop() || null };
    });
    return { S: S, projects: projects, elements: elements, stages: stages, pct: weighted(elements, S) };
  }

  /* ------------------------------ page ------------------------------ */
  function mixBar(cnt, n) {
    if (!n) return "";
    return '<div class="dt-mix" title="' + esc(HEALTH.filter(function (h) { return cnt[h]; }).map(function (h) { return cnt[h] + " " + h; }).join(" · ")) + '">' +
      HEALTH.slice().reverse().map(function (h) { return cnt[h] ? '<i style="width:' + (100 * cnt[h] / n).toFixed(2) + "%;background:" + HCOL[h] + '"></i>' : ""; }).join("") + "</div>";
  }
  function chip(x, s) {
    return x ? '<span class="dt-chip" style="--h:' + HCOL[x.health] + '" title="' + esc(s + " design · " + x.n + " item(s) · " + x.health) + '"><b>' + SHORT[s] + "</b>" + fmt.pct(x.pct, 0) + "</span>"
      : '<span class="dt-chip off" title="' + esc(s + " design not used") + '"><b>' + SHORT[s] + "</b>–</span>";
  }
  function elTable(host, list, exportName) {
    var cols = [
      { key: "code", label: "Code" }, { key: "name", label: "Element / package", get: function (e) { return e.name; } },
      { key: "stage", label: "Stage", get: function (e) { return e.cur ? e.cur.stage : ""; } },
      { key: "health", label: "Health", get: function (e) { return e.health || ""; }, render: function (v) { return hBadge(v); } },
      { key: "pct", label: "% earned", type: "pct", get: function (e) { return e.pct; } },
      { key: "bs", label: "Baseline submission", type: "date", get: function (e) { return e.cur && e.cur.bs; } },
      { key: "as", label: "Actual submission", type: "date", get: function (e) { return e.cur && e.cur.as; } },
      { key: "ar", label: "Actual review", type: "date", get: function (e) { return e.cur && e.cur.ar; } },
      { key: "sc", label: "SAR code", get: function (e) { return e.cur ? e.cur.code : ""; } },
      { key: "fa", label: "Forecast approval", type: "date", get: function (e) { return e.cur && e.cur.fa; } },
      { key: "var", label: "Var (days)", type: "int", get: function (e) { return e.cur ? e.cur.varD : null; } },
      { key: "wait", label: "Waiting on SAR (days)", type: "int", get: function (e) { return e.cur ? e.cur.waiting : null; } },
      { key: "subNo", label: "Submittal no", get: function (e) { return e.subNo; } },
      { key: "lastSub", label: "Latest submission", type: "date", get: function (e) { return e.lastSub; } },
      { key: "lastAppr", label: "Latest approval", type: "date", get: function (e) { return e.lastAppr; } },
      { key: "status", label: "Status", get: function (e) { return e.status; } },
      { key: "final", label: "Code", get: function (e) { return e.final; } },
      { key: "priority", label: "Priority", get: function (e) { return e.priority; } },
      { key: "notes", label: "Main challenges / notes", get: function (e) { return e.notes; } }];
    U.table(host, { columns: cols, rows: list, exportName: exportName, maxHeight: 560, onRow: function (e) { elModal(e); } });
  }
  function elModal(e) {
    var rows = STAGES.map(function (s) {
      var x = e.st[s];
      return "<tr><th>" + s + "</th>" + (x ? "<td>" + d0(x.bs) + "</td><td>" + d0(x.ba) + "</td><td>" + d0(x.as) + "</td><td>" + d0(x.ar) + "</td><td>" + esc(x.code || "—") +
        "</td><td>" + d0(x.fs) + "</td><td>" + d0(x.fa) + "</td><td>" + fmt.pct(x.pct, 0) + "</td><td>" + hBadge(x.health) + "</td><td>" + (x.varD == null ? "—" : x.varD) + "</td>"
        : '<td colspan="10" class="muted">not used</td>') + "</tr>";
    }).join("");
    U.modal(e.code + " · " + e.name, '<div class="dt-scroll"><table class="dt-st"><thead><tr><th>Stage</th><th>Baseline sub.</th><th>Baseline appr.</th><th>Actual sub.</th><th>Actual review</th>' +
      "<th>SAR code</th><th>Forecast sub.</th><th>Forecast appr.</th><th>%</th><th>Health</th><th>Var (d)</th></tr></thead><tbody>" + rows + "</tbody></table></div>" +
      '<div class="kv">' + [["Project", esc(e.code + " — " + e.pname)], ["Latest submittal", esc((e.subNo ? "No. " + e.subNo + " · " : "") + (e.lastSub ? fmt.date(e.lastSub) : "—"))],
        ["Latest approval", esc(e.lastAppr ? fmt.date(e.lastAppr) : "—")], ["Status / code", esc([e.status, e.final].filter(Boolean).join(" · ") || "—")],
        ["Priority", esc(e.priority || "—")], ["Main challenges / notes", esc(e.notes || "—")]].map(function (p) { return "<div>" + p[0] + "</div><div>" + p[1] + "</div>"; }).join("") + "</div>", true);
  }
  function gantt(host, projects, S) {
    var dates = [];
    projects.forEach(function (p) { [p.start, day(p.end) != null ? p.end : null].forEach(function (d) { if (d) dates.push(d); });
      p.els.forEach(function (e) { if (e.cur) [e.cur.as, e.cur.fs, e.cur.ar, e.cur.fa, e.cur.bs, e.cur.ba].forEach(function (d) { if (d) dates.push(d); }); }); });
    if (!dates.length) { add(host, '<div class="empty-note">No dates to draw.</div>'); return; }
    dates = dates.filter(function (d) { return day(d) != null; }).sort();
    if (!dates.length) { add(host, '<div class="empty-note">No dates to draw.</div>'); return; }
    var a = day(dates[0]), b = day(dates[dates.length - 1]), dd = day(S.dd);
    var y0 = new Date(a * 864e5), y1 = new Date(b * 864e5);
    a = Date.UTC(y0.getUTCFullYear(), y0.getUTCMonth(), 1) / 864e5; b = Date.UTC(y1.getUTCFullYear(), y1.getUTCMonth() + 1, 1) / 864e5;
    var X = function (s) { var v = typeof s === "number" ? s : day(s); return ((Math.min(Math.max(v, a), b) - a) / (b - a) * 100).toFixed(3) + "%"; };
    var months = []; for (var t = new Date(a * 864e5); t.getTime() / 864e5 < b; t = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 1))) months.push(t.getTime() / 864e5);
    var grid = months.map(function (m) { return '<span class="g-grid" style="left:' + X(m) + '"></span>'; }).join("") + (dd ? '<span class="dt-dd" style="left:' + X(dd) + '" title="Data date ' + esc(fmt.date(S.dd)) + '"></span>' : "");
    var h = '<div class="g-legend"><span><b class="dt-m sub act"></b>Submission (actual)</span><span><b class="dt-m sub"></b>Submission (forecast)</span>' +
      '<span><b class="dt-m apr act"></b>Approval (actual)</span><span><b class="dt-m apr"></b>Approval (forecast)</span><span><i class="dt-legbar"></i>Project period (first baseline → project end)</span>' +
      '<span><i style="background:#3D3935;width:2px"></i>Data date ' + esc(fmt.date(S.dd)) + "</span></div>";
    h += '<div class="dt-gantt" style="--tw:' + Math.max(560, months.length * 38) + 'px"><div class="dt-gr dt-gh"><div>Project / element</div><div class="dt-tr">' + months.map(function (m, i) {
      var d = new Date(m * 864e5), w = ((months[i + 1] || b) - m) / (b - a) * 100;
      return '<span style="left:' + X(m) + ";width:" + w.toFixed(3) + '%">' + d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }) + (d.getUTCMonth() === 0 || i === 0 ? " " + String(d.getUTCFullYear()).slice(2) : "") + "</span>";
    }).join("") + "</div></div>";
    function mk(cls, d, tip) { return d ? '<b class="dt-m ' + cls + '" style="left:' + X(d) + '" title="' + esc(tip + " " + fmt.date(d)) + '"></b>' : ""; }
    projects.forEach(function (p) {
      var pend = day(p.end) != null ? p.end : null;
      var bar = p.start ? '<i class="dt-pbar" style="left:' + X(p.start) + ";width:calc(" + X(pend || p.lastFa || p.start) + " - " + X(p.start) + ')"></i>' : "";
      h += '<div class="dt-gr dt-gp"><div><b>' + esc(p.code) + "</b> " + esc(p.name) + '</div><div class="dt-tr">' + grid + bar + (pend ? mk("end", pend, "Project end") : "") + "</div></div>";
      p.els.forEach(function (e) {
        var x = e.cur; if (!x) return;
        var apr = x.ar && (x.code === "A" || x.code === "B");
        h += '<div class="dt-gr" title="' + esc(e.name + " · " + x.stage + " · " + x.health) + '"><div><i class="dt-dot" style="background:' + HCOL[x.health] + '"></i>' + esc(e.name) +
          ' <span class="muted">' + SHORT[x.stage] + "</span></div><div class=\"dt-tr\">" + grid +
          (x.as ? mk("sub act", x.as, "Submitted") : mk("sub", x.fs || x.bs, x.fs ? "Forecast submission" : "Baseline submission")) +
          (apr ? mk("apr act", x.ar, "Approved") : mk("apr", x.fa || x.ba, x.fa ? "Forecast approval" : "Baseline approval")) + "</div></div>";
      });
    });
    add(host, "<div>" + h + "</div></div>");
  }

  function page(ctx) {
    var D = ctx.D, v = ctx.view, st = ctx.state, K = window.SARPages && SARPages._kit;
    if (!(D.t("Design_Tracker") || []).length) {
      add(v, '<div class="note-box"><b>No design tracker data yet.</b> On <a href="#/import">Data Import</a>, drop the <b>SAR ESS Design Submission Tracker</b> workbook. ' +
        "Its <b>Tracker</b> sheet (one row per project and per element, the Concept / Preliminary / Detailed stages side by side) is read into this page.</div>");
      return;
    }
    var M = model(D), S = M.S;
    var defs = [
      { key: "proj", label: "Project", options: M.projects.map(function (p) { return p.code; }), display: function (c) { var p = M.projects.filter(function (x) { return x.code === c; })[0]; return c + (p ? " — " + p.name : ""); }, get: function (e) { return e.code; } },
      { key: "health", label: "Health", options: HEALTH, get: function (e) { return e.health || ""; } },
      { key: "stage", label: "Current stage", options: STAGES, get: function (e) { return e.cur ? e.cur.stage : ""; } }];
    var f = K ? K.filterBar(ctx, defs, M.elements) : {};
    var pass = function (e) { return defs.every(function (d) { var sel = (st.f && st.f[d.key]) || []; return !sel.length || sel.indexOf(d.get(e)) >= 0; }); };
    var els = M.elements.filter(pass), codes = {}; els.forEach(function (e) { codes[e.code] = 1; });
    var projs = M.projects.filter(function (p) { return codes[p.code]; }).map(function (p) {
      var q = Object.assign({}, p, { els: p.els.filter(pass) }); q.cnt = {}; HEALTH.forEach(function (h) { q.cnt[h] = q.els.filter(function (e) { return e.health === h; }).length; }); return q;
    });
    add(v, '<div class="note-box dt-note">Source: <b>SAR ESS Design Submission Tracker</b> › ' + esc(S.sheet) + " · data date <b>" + esc(d0(S.dd)) + "</b> · " +
      "% earned per stage: submitted " + fmt.pct(S.earn.sub, 0) + " · Code D " + fmt.pct(S.earn.D, 0) + " · C " + fmt.pct(S.earn.C, 0) + " · B " + fmt.pct(S.earn.B, 0) + " · A " + fmt.pct(S.earn.A, 0) +
      " · stage weights " + STAGES.map(function (s) { return SHORT[s] + " " + fmt.pct(S.w[s], 0); }).join(" / ") + " · at risk = due within " + S.win + " days.</div>");

    // tiles
    var appr = els.filter(function (e) { return e.cur && (e.cur.code === "A" || e.cur.code === "B"); }).length;
    var cd = els.filter(function (e) { return e.cur && (e.cur.code === "C" || e.cur.code === "D"); }).length;
    var wait = els.filter(function (e) { return e.cur && e.cur.waiting != null; }), longest = wait.slice().sort(function (a, b) { return b.cur.waiting - a.cur.waiting; })[0];
    var late = els.filter(function (e) { return e.health === "Delayed"; }).length, risk = els.filter(function (e) { return e.health === "At Risk"; }).length;
    var tg = add(v, '<div class="grid g-6 dt-tiles"></div>');
    tg.innerHTML = U.tile({ label: "Elements tracked", value: els.length, note: projs.length + " projects", color: "" }) +
      U.tile({ label: "Weighted design progress", value: fmt.pct(M.projects.length === projs.length && els.length === M.elements.length ? M.pct : (function () {
        var n = 0, d = 0; STAGES.forEach(function (s) { var xs = els.map(function (e) { return e.st[s]; }).filter(Boolean); if (xs.length) { n += S.w[s] * xs.reduce(function (a, x) { return a + x.pct; }, 0); d += S.w[s] * xs.length; } }); return d ? n / d : null; })(), 1),
        note: "stages weighted " + STAGES.map(function (s) { return fmt.pct(S.w[s], 0); }).join(" / "), color: "blue" }) +
      U.tile({ label: "Approved (Code A / B)", value: appr, note: "current stage", color: "green" }) +
      U.tile({ label: "Returned (Code C / D)", value: cd, note: "to be resubmitted", color: cd ? "yellow" : "" }) +
      U.tile({ label: "Waiting on SAR", value: wait.length, note: longest ? "longest " + longest.cur.waiting + " days · " + esc(longest.code) : "none", color: wait.length ? "slate" : "" }) +
      U.tile({ label: "Delayed · at risk", value: late + " · " + risk, note: "against the baseline dates", color: late ? "red" : "" });
    if (longest) tg.lastChild.previousSibling.addEventListener("click", function () { elModal(longest); });

    // stage summary
    var sp = panel(v, "Design stages", "items with dates in each stage · % earned and health as in the workbook's control panel");
    add(sp, '<div class="dt-scroll"><table class="ds-mx dt-stg"><thead><tr><th>Stage</th><th class="num">Weight</th><th class="num">Items</th><th class="num">% earned</th>' +
      HEALTH.slice().reverse().map(function (h) { return '<th class="num">' + esc(h) + "</th>"; }).join("") + "<th>Status mix</th><th>Latest forecast approval</th></tr></thead><tbody>" +
      M.stages.map(function (s) {
        var xs = els.map(function (e) { return e.st[s.stage]; }).filter(Boolean), cnt = {}; HEALTH.forEach(function (h) { cnt[h] = xs.filter(function (x) { return x.health === h; }).length; });
        var pc = xs.length ? xs.reduce(function (a, x) { return a + x.pct; }, 0) / xs.length : null;
        return "<tr><td><b>" + s.stage + '</b></td><td class="num">' + fmt.pct(s.w, 0) + '</td><td class="num">' + xs.length + '</td><td class="num">' + (pc == null ? "—" : fmt.pct(pc, 1)) + "</td>" +
          HEALTH.slice().reverse().map(function (h) { return '<td class="num">' + (cnt[h] ? '<b style="color:' + HCOL[h] + '">' + cnt[h] + "</b>" : '<span class="muted">0</span>') + "</td>"; }).join("") +
          "<td>" + mixBar(cnt, xs.length) + "</td><td>" + d0(xs.map(function (x) { return x.fa; }).filter(Boolean).sort().pop()) + "</td></tr>";
      }).join("") + "</tbody></table></div>");

    // projects table (row opens its elements in place)
    var pp = panel(v, "Projects", "worst health first · C / P / D = stage % earned, coloured by the stage's worst health · click a row for its elements");
    projs.sort(function (a, b) { return (HRANK[a.worst] || 9) - (HRANK[b.worst] || 9) || (a.pct || 0) - (b.pct || 0); });
    st.open = st.open || {};
    var tb = add(pp, '<div class="dt-scroll"><table class="ds-mx dt-proj"><thead><tr><th></th><th>Project</th><th class="num">Elements</th><th class="num">% earned</th><th>Stages</th><th>Health of the elements</th>' +
      '<th class="num">Worst var (d)</th><th>Latest forecast approval</th><th>Project end</th></tr></thead><tbody></tbody></table></div>').querySelector("tbody");
    projs.forEach(function (p) {
      var n = p.els.length, tr = el('<table><tbody><tr class="dt-prow' + (st.open[p.code] ? " open" : "") + '"><td><i class="dt-dot" style="background:' + (HCOL[p.worst] || "#C8C9C7") + '"></i></td>' +
        "<td><b>▸ " + esc(p.code) + "</b> " + esc(p.name) + '</td><td class="num">' + n + '</td><td class="num"><b>' + (p.pct == null ? "—" : fmt.pct(p.pct, 1)) + "</b></td><td>" +
        STAGES.map(function (s) { return chip(p.stg[s], s); }).join("") + "</td><td>" + mixBar(p.cnt, n) + '</td><td class="num">' + (p.maxVar ? '<span class="neg">' + p.maxVar + "</span>" : "—") +
        "</td><td>" + d0(p.lastFa) + "</td><td>" + (day(p.end) != null ? d0(p.end) : esc(p.end || "—")) + "</td></tr></tbody></table>").querySelector("tr");
      tb.appendChild(tr);
      var det = el('<table><tbody><tr class="dt-det"><td colspan="9"></td></tr></tbody></table>').querySelector("tr");
      function fill() { var c = det.firstChild; c.innerHTML = ""; if (p.notes) add(c, '<div class="dt-pnote"><b>Notes:</b> ' + esc(p.notes) + "</div>"); var hh = add(c, "<div></div>"); elTable(hh, p.els, "Design tracker " + p.code); }
      if (st.open[p.code]) { tb.appendChild(det); fill(); }
      tr.addEventListener("click", function () {
        st.open[p.code] = !st.open[p.code]; tr.classList.toggle("open", !!st.open[p.code]);
        if (st.open[p.code]) { tr.parentNode.insertBefore(det, tr.nextSibling); fill(); U.hbars(det); } else if (det.parentNode) det.parentNode.removeChild(det);
      });
    });

    // milestone Gantt
    var gp = panel(v, "Milestone Gantt", "current stage of every element · project bar from the first baseline submission to the project end date");
    gantt(gp, projs, S);

    // register (folded)
    var rg = add(v, '<details class="dt-reg"' + (st.regOpen ? " open" : "") + "><summary>All elements (" + els.length + ")</summary><div></div></details>");
    function reg() { if (rg._done) return; rg._done = true; elTable(rg.querySelector("div"), els, "Design submission tracker"); }
    if (st.regOpen) reg();
    rg.addEventListener("toggle", function () { st.regOpen = rg.open; if (rg.open) reg(); });
  }

  window.SARDesignTracker = { model: model, page: page, stageOf: stageOf };
})();

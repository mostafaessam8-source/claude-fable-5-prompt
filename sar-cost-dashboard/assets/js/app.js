/* App core: dataset, derived lookups, routing, navigation, import page. */
(function () {
  "use strict";
  var U = window.UI, esc = U.esc, fmt = U.fmt, norm = SARImporter.normKey;

  var ICONS = {
    overview: '<path d="M3 13h8V3H3zm10 8h8V11h-8zM3 21h8v-6H3zm10-18v6h8V3z"/>',
    kpi: '<path d="M4 20V10m6 10V4m6 16v-7m4 7H2"/>',
    cost: '<path d="M12 2v20M17 6.5C17 4.6 14.8 3 12 3S7 4.6 7 6.5 9.2 10 12 10s5 1.6 5 3.5S14.8 17 12 17s-5-1.6-5-3.5"/>',
    chart: '<path d="M3 3v18h18M7 15l4-4 3 3 5-6"/>',
    curve: '<path d="M3 20c6 0 7-16 18-16M3 21h18"/>',
    table: '<path d="M3 5h18v14H3zM3 10h18M9 5v14"/>',
    project: '<path d="M4 4h16v16H4zM8 9h8M8 13h8M8 17h5"/>',
    gantt: '<path d="M4 5h9M7 10h11M5 15h7M10 20h10"/>',
    issue: '<path d="M12 3l10 18H2zM12 10v5m0 3v.5"/>',
    book: '<path d="M4 4h7a3 3 0 013 3v13a2 2 0 00-2-2H4zM20 4h-6M20 4v14h-6"/>',
    card: '<path d="M3 5h18v14H3zM7 9h4v4H7zM14 9h4M14 13h4M7 16h11"/>',
    close: '<path d="M9 12l2 2 4-4M4 4h16v16H4z"/>',
    upload: '<path d="M12 21V9m0 0l-4 4m4-4l4 4M4 7V4h16v3"/>'
  };

  var PAGES = [
    { id: "overview", group: "Overview", title: "Executive Overview", icon: "overview", sub: "Headline cost, progress and issue position across the NSR portfolio" },
    { id: "kpi-summary", group: "KPIs", title: "KPI Summary", icon: "kpi", sub: "NSR KPI scorecard — weight, achievement and result" },
    { id: "kpi-cost", group: "KPIs", title: "KPI Cost Summary", icon: "cost", sub: "CAPEX variance and non-KPI spending — budget vs forecast vs actual" },
    { id: "kpi-outlook", group: "Cost", title: "KPI Year-End Outlook", icon: "kpi", sub: "How the cost KPIs close the year — contractor Forecast Plan (invoicing plan) vs the Spend Plan" },
    { id: "cost", group: "Cost", title: "Cost Dashboard", icon: "table", sub: "Contract value, work confirmation and payments · 2026 Spend Plan vs Forecast Plan vs Actual · S-curve and detail tables" },
    { id: "spi-outlook", group: "Progress", title: "SPI & S-Curve Outlook", icon: "curve", sub: "Schedule Performance Index KPI to 31-Dec (ΣEV ÷ ΣPV from the project S-curves) and each project's progress S-curve" },
    { id: "weekly", group: "Progress", title: "Weekly Progress Summary", icon: "table", sub: "Planned vs actual progress, SPI and payments for every project" },
    { id: "project", group: "Progress", title: "Project Progress", icon: "project", sub: "Single-project weekly report card" },
    { id: "master-plan", group: "Progress", title: "Projects Master Plan", icon: "gantt", sub: "Milestone schedule for all projects" },
    { id: "timeline", group: "Progress", title: "Project Timeline", icon: "gantt", sub: "Milestone timeline for a single project" },
    { id: "project-cards", group: "Project Cards", title: "Project Cards", icon: "card", sub: "Every project card from the monthly EP – NSR Projects workbook — portfolio view and full card per project" },
    { id: "execution", group: "Project Cards", title: "Projects in Execution", icon: "chart", sub: "Every project card in the execution phase — SPI and progress from card sections 7 & 8, schedule, status, payments and 2026 spend" },
    { id: "portfolio-plan", group: "Project Cards", title: "Portfolio Master Plan", icon: "gantt", sub: "All projects → phases → activities: baseline vs revised baseline vs forecast, with critical path milestones" },
    { id: "closing", group: "Closing Phase", title: "Projects in Closing", icon: "close", sub: "Close-out status, checklist (AMP, handover, close-out report, retention, guarantees, final payment) and action plans" },
    { id: "blockades", group: "2027 Delivery Plan", title: "2027 Engineering Blockades", icon: "gantt", sub: "Shutdown, line-blockage and possession needs for the 2027 Delivery Plan — hours per day × days, lines, quarters and what Planning still needs" },
    { id: "issues", group: "Risks & Issues", title: "Issue Register", icon: "issue", sub: "NSR projects issue log" },
    { id: "abbreviations", group: "Reference", title: "Abbreviations", icon: "book", sub: "Project and report abbreviations" },
    { id: "import", group: "Data", title: "Data Import", icon: "upload", sub: "Update the dashboard from the Excel source files" }
  ];

  // A published weekly report (see publish.js) carries its data inside the file: no import, no stored data.
  var PUB = window.SAR_PUBLISHED || null;
  if (PUB) PAGES = PAGES.filter(function (p) { return p.id !== "import" && (!PUB.pages || PUB.pages.indexOf(p.id) >= 0); });   // a report may hold selected pages only

  /* ----------------------------- dataset -------------------------------- */
  var XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  var base = window.SAR_DEFAULT_DATA || { tables: {}, sources: {} };
  var dataset = { tables: {}, sources: {} };

  function mergeDataset(stored) {
    dataset = { tables: Object.assign({}, base.tables), sources: Object.assign({}, base.sources) };
    if (stored && stored.tables) {
      Object.assign(dataset.tables, stored.tables);
      Object.keys(stored.sources || {}).forEach(function (k) {
        dataset.sources[k] = Object.assign({ imported: true }, stored.sources[k]);
      });
    }
    buildLookups();
  }

  var D = {
    t: function (name) { return dataset.tables[name] || []; },
    has: function (name) { return (dataset.tables[name] || []).length > 0; },
    g: function (row, key) { return row ? row[norm(key)] : null; },
    sources: function () { return dataset.sources; },
    projects: {},   // Source.Name → { code, name, source }
    reportDate: null
  };

  function buildLookups() {
    // Revised Spend Plan (Budget 2026, "Spending Plan (VP)") joined onto the Spending Plan rows by ID + month;
    // the original "Spend Plan as per Budgeting" stays untouched.
    var rev = {}, revFY = {};
    D.hasRev = D.has("Rev_Spend_Plan");
    D.t("Rev_Spend_Plan").forEach(function (r) {
      var v = typeof r["Rev Spend Plan"] === "number" ? r["Rev Spend Plan"] : 0, id = String(r.ID);
      rev[id + "|" + r.Month] = (rev[id + "|" + r.Month] || 0) + v; revFY[id] = (revFY[id] || 0) + v;
    });
    var spIds = {};
    D.t("Spending_Plan").forEach(function (r) { spIds[String(r.ID)] = 1; r["Rev Spend Plan (Incr)"] = D.hasRev ? (rev[String(r.ID) + "|" + r.Month] || 0) : null; });
    D.t("KPI_Projects_Data").forEach(function (r) { r["Rev Spend Plan FTY 2026"] = D.hasRev ? (revFY[String(r.Code)] || 0) : null; });
    D.revOnly = Object.keys(revFY).filter(function (id) { return !spIds[id]; });           // in Budget 2026 but not in the Spending Plan
    D.revMissing = D.hasRev ? Object.keys(spIds).filter(function (id) { return !(id in revFY); }) : [];
    var P = {};
    D.t("MLS").forEach(function (r) {
      var s = r["Source.Name"]; if (!s) return;
      P[s] = { source: s, code: r.Code != null ? String(r.Code) : "", name: r["Project Name"] || s };
    });
    D.t("Weekly_Report_Updates").forEach(function (r) {
      var s = r["Source.Name"]; if (!s) return;
      P[s] = P[s] || { source: s };
      if (!P[s].code && r["Project Code"] != null) P[s].code = String(r["Project Code"]);
      P[s].weeklyName = r["Project Name"];
      if (!P[s].name) P[s].name = r["Project Name"];
    });
    D.projects = P;
    var dates = D.t("Weekly_Report_Updates").map(function (r) { return r["Report Date"]; }).filter(Boolean).sort();
    D.reportDate = dates.length ? dates[dates.length - 1] : null;
  }
  D.projectLabel = function (source) {
    var p = D.projects[source];
    if (!p) return String(source || "").replace(/\.xlsx$/i, "");
    return (p.code ? p.code + " — " : "") + p.name;
  };

  /* ----------------------------- header & nav --------------------------- */
  function renderHeader() {
    var rd = D.reportDate;
    document.getElementById("reportChip").innerHTML = rd
      ? "Report Date <strong>" + esc(fmt.date(rd)) + "</strong> · WK" + U.isoWeek(rd)
      : "Report Date <strong>—</strong>";
    var srcs = dataset.sources, latest = null, imported = false;
    Object.keys(srcs).forEach(function (k) {
      if (srcs[k].imported) imported = true;
      if (srcs[k].importedAt && (!latest || srcs[k].importedAt > latest)) latest = srcs[k].importedAt;
    });
    function when(iso) { return esc(new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })); }
    document.getElementById("dataStamp").innerHTML = PUB
      ? "Published <strong>" + when(PUB.publishedAt) + "</strong>" + (PUB.by ? " · " + esc(PUB.by) : "")
      : latest ? (imported ? "Imported " : "Baseline ") + "<strong>" + when(latest) + "</strong>" : "No data loaded";
    if (PUB) {
      document.querySelectorAll(".js-editor").forEach(function (e) { e.remove(); });
      document.querySelector(".brand .title h1").textContent = PUB.title;
      document.querySelector(".brand .title p").textContent = "Published weekly report · read-only snapshot";
    }
  }

  function renderNav(active) {
    var nav = document.getElementById("sidenav"), groups = [], h = "";
    PAGES.forEach(function (p) { if (groups.indexOf(p.group) < 0) groups.push(p.group); });
    groups.forEach(function (g) {
      h += '<div class="nav-group"><h6>' + esc(g) + "</h6>";
      PAGES.filter(function (p) { return p.group === g; }).forEach(function (p) {
        h += '<a class="nav-link' + (p.id === active ? " active" : "") + '" href="#/' + p.id + '"' + (p.id === active ? ' aria-current="page"' : "") +
          '><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + ICONS[p.icon] + "</svg>" + esc(p.title) + "</a>";
      });
      h += "</div>";
    });
    h += '<div class="nav-foot"><img src="assets/img/sar-vision2030.png" alt="SAR — Vision 2030">Projects Department · NSR<br>Cost Control &amp; Planning</div>';
    nav.innerHTML = h;
  }

  /* ----------------------------- routing -------------------------------- */
  var pageState = {};
  function route() {
    var id = (location.hash.replace(/^#\/?/, "") || "overview").split("?")[0];
    if (id === "cost-analysis" || id === "cost-scurve") id = "cost";   // merged into the Cost Dashboard
    if (id === "progress-scurve") id = "spi-outlook";                   // merged into the SPI & S-Curve Outlook
    var page = PAGES.filter(function (p) { return p.id === id; })[0] || PAGES[0];
    document.body.classList.remove("nav-open");
    renderNav(page.id);
    render(page);
  }

  function render(page) {
    var view = document.getElementById("view");
    U.destroyCharts();
    view.innerHTML = "";
    var head = U.el('<div class="page-head"><div class="page-title"><h2>' + esc(page.title) + "</h2><p>" + esc(page.sub) +
      '</p></div><div class="page-actions"></div></div>');
    view.appendChild(head);
    document.title = page.title + " | NSR Cost Control Dashboard";
    var ctx = {
      D: D, view: view, actions: head.querySelector(".page-actions"),
      state: pageState[page.id] || (pageState[page.id] = {}),
      rerender: function () { var y = window.scrollY; render(page); window.scrollTo(0, y); }
    };
    ctx.actions.appendChild(SARPrint.button());
    if (!PUB && page.id !== "import" && window.SARPublish) {   // publish just this page (or pick others in the dialog)
      var pb = U.el('<button type="button" class="icon-btn ghost js-editor" title="Publish a report with this page only — you can add other pages in the dialog">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15V3m0 0L8 7m4-4l4 4M4 15v6h16v-6"/></svg><span>Publish this page</span></button>');
      pb.addEventListener("click", function () { SARPublish.open({ pages: [page.id] }); });
      ctx.actions.appendChild(pb);
    }
    if (PUB && PUB.note && page.id === PAGES[0].id) {
      view.appendChild(U.el('<div class="note-box mgmt-note"><b>Management note — ' + esc(PUB.title) + "</b>" +
        (PUB.by ? '<span class="muted"> · ' + esc(PUB.by) + "</span>" : "") + "<p>" + esc(PUB.note).replace(/\n/g, "<br>") + "</p></div>"));
    }
    try {
      if (page.id === "import") renderImport(ctx);
      else if (!Object.keys(dataset.tables).length) renderNoData(view);
      else window.SARPages[page.id](ctx);
    } catch (e) {
      console.error(e);
      view.appendChild(U.el('<div class="note-box warn"><b>This page could not be drawn from the current data.</b><br>' + esc(e.message) +
        '<br>Check that the Excel tables keep their original names and column headers, then re-import.</div>'));
    }
    view.appendChild(U.el('<div class="footer-note"><span><b>SAR.COM.SA</b> &nbsp; Saudi Arabia Railways — Projects Department</span><span>Source: ' +
      esc(Object.keys(dataset.sources).map(function (k) { return dataset.sources[k].fileName; }).filter(Boolean).join(" · ") || "—") + "</span></div>"));
  }

  function renderNoData(view) {
    view.appendChild(U.el('<div class="note-box"><b>No data loaded yet.</b> Open <a href="#/import">Data Import</a> and drop the Excel files ' +
      "(PBI Weekly Report, EPBU 2026 Delivery Plan, Contract details, EP – NSR Projects, Projects in Closing phase, Budget 2026) to populate every page.</div>"));
  }

  /* ----------------------------- import page ---------------------------- */
  /* Cloud storage panel (private GitHub repository) */
  function cloudPanel(ctx, importFiles) {
    var C = window.SARCloud, box = U.el('<section class="panel cloud-panel"></section>');
    function dlBlob(name, buf, type) {
      var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([buf], { type: type || XLSX_MIME })); a.download = name;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
    }
    if (!C.connected()) {
      box.innerHTML = '<div class="panel-head"><h3>Cloud storage</h3><span class="sub">Keep every imported file in your private GitHub repository and download it from any device</span></div>' +
        '<div class="cloud-grid"><ol class="cloud-steps">' +
        '<li><a href="https://github.com/new?name=nsr-dashboard-data&amp;visibility=private&amp;description=NSR%20dashboard%20import%20files" target="_blank" rel="noopener">Create a <b>private</b> repository</a> named <b>nsr-dashboard-data</b> (once).</li>' +
        '<li><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Create a fine-grained token</a>: Repository access → <i>Only select repositories</i> → nsr-dashboard-data; Permissions → <b>Contents: Read and write</b>. Copy the token.</li>' +
        "<li>Enter both here, once on each device. The token is kept only in this browser.</li></ol>" +
        '<div class="cloud-form"><label>Repository<input type="text" class="cl-repo" placeholder="owner/nsr-dashboard-data" value="mostafaessam8-source/nsr-dashboard-data"></label>' +
        '<label>Access token<input type="password" class="cl-tok" placeholder="github_pat_…" autocomplete="off"></label>' +
        '<button type="button" class="icon-btn cl-go">Connect</button><div class="cl-msg muted"></div></div></div>';
      box.querySelector(".cl-go").addEventListener("click", function () {
        var m = box.querySelector(".cl-msg"); m.textContent = "Checking…";
        C.connect(box.querySelector(".cl-repo").value, box.querySelector(".cl-tok").value).then(function () {
          U.toast("Cloud storage connected."); ctx.rerender();
        }, function (e) { m.innerHTML = '<span class="neg">' + U.esc(e.message) + "</span>"; });
      });
      return box;
    }
    box.innerHTML = '<div class="panel-head"><h3>Cloud storage</h3><span class="sub">☁ ' + U.esc(C.config().repo) + ' (private) · every import is saved there automatically</span></div>' +
      '<div class="cloud-actions"><button type="button" class="icon-btn cl-load">Load latest files from cloud</button>' +
      '<button type="button" class="icon-btn ghost cl-push">Upload the files stored in this browser</button>' +
      '<button type="button" class="link-btn cl-off">Disconnect this device</button></div><div class="cl-list muted">Reading the cloud index…</div>';
    var list = box.querySelector(".cl-list");
    C.index().then(function (ix) {
      var changed = JSON.stringify(C._last || null) !== JSON.stringify(ix);
      C._last = ix;
      if (changed) { ctx.rerender(); return; }        // once, so the source cards can offer cloud downloads too
      var rows = Object.keys(ix.sources).map(function (k) { var e = ix.sources[k], spec = SARImporter.SOURCES[k];
        return { k: k, label: spec ? spec.label : k, e: e }; });
      if (ix.template) rows.push({ k: "__tpl", label: "Weekly PowerPoint template", e: { path: ix.template.path, fileName: ix.template.fileName, importedAt: ix.template.savedAt, size: ix.template.size } });
      if (!rows.length) { list.textContent = "No files in the cloud yet — import files (or use “Upload the files stored in this browser”)."; return; }
      list.className = "cl-list";
      list.innerHTML = '<table class="dt cl-tbl"><thead><tr><th>Source</th><th>File</th><th>Saved</th><th></th></tr></thead><tbody>' + rows.map(function (r, i) {
        return "<tr><td>" + U.esc(r.label) + "</td><td>" + U.esc(r.e.fileName) + "</td><td class='nowrap'>" + U.esc(new Date(r.e.importedAt).toLocaleString("en-GB")) +
          '</td><td><button type="button" class="icon-btn ghost cl-dl" data-i="' + i + '">Download</button></td></tr>';
      }).join("") + "</tbody></table>";
      list.querySelectorAll(".cl-dl").forEach(function (b) { b.addEventListener("click", function () {
        var r = rows[+b.getAttribute("data-i")]; b.disabled = true;
        C.download(r.e.path).then(function (buf) { dlBlob(r.e.fileName, buf, r.k === "__tpl" ? "application/vnd.openxmlformats-officedocument.presentationml.presentation" : null); },
          function (e) { U.toast(e.message, true); }).then(function () { b.disabled = false; });
      }); });
    }, function (e) { list.innerHTML = '<span class="neg">' + U.esc(e.message) + "</span> — check the token, or disconnect and connect again."; });
    box.querySelector(".cl-off").addEventListener("click", function () {
      if (!confirm("Disconnect cloud storage on this device? (Files stay in the repository.)")) return;
      C.disconnect(); ctx.rerender();
    });
    box.querySelector(".cl-load").addEventListener("click", function () {
      var b = this; b.disabled = true; U.toast("Downloading the latest files from the cloud…");
      C.index().then(function (ix) {
        var ks = Object.keys(ix.sources); if (!ks.length) { U.toast("No files in the cloud yet.", true); return; }
        return Promise.all(ks.map(function (k) { var e = ix.sources[k];
          return C.download(e.path).then(function (buf) { return new File([buf], e.fileName, { type: XLSX_MIME }); }); })).then(importFiles);
      }).catch(function (e) { U.toast(e.message, true); }).then(function () { b.disabled = false; });
    });
    box.querySelector(".cl-push").addEventListener("click", function () {
      var b = this; b.disabled = true;
      SARStore.load().then(function (st) {
        var ks = Object.keys((st && st.sources) || {}), n = 0;
        return ks.reduce(function (p, k) {
          return p.then(function () { return SARStore.get("file:" + k); }).then(function (f) {
            if (f && f.buffer) { n++; return C.uploadSource(k, f.name, f.buffer); }
          });
        }, Promise.resolve()).then(function () {
          return SARStore.get("pptTemplate").then(function (t) { if (t && t.buffer) { n++; return C.uploadTemplate(t.name, t.buffer); } });
        }).then(function () { U.toast(n ? n + " file(s) uploaded to the cloud." : "No stored files in this browser — import them first.", !n); ctx.rerender(); });
      }).catch(function (e) { U.toast(e.message, true); }).then(function () { b.disabled = false; });
    });
    return box;
  }

  function renderImport(ctx) {
    var view = ctx.view, S = SARImporter.SOURCES;
    view.appendChild(U.el('<div class="note-box" style="margin-bottom:16px">Drop one or more of the source workbooks. Each file is recognised by its content, not its name: the <b>Excel tables</b> inside it ' +
      "(the same tables Power BI reads), or — for <b>EP – NSR Projects &lt;Month&gt;.xlsx</b> — the <b>…_Project Card</b> sheets, whose section 12.1 <b>Issue Log</b> feeds the Issue Register " +
      "(projects can be added or removed freely). File names may change, but <b>table names, column headers and the Issue Log layout must stay as they are</b>. " +
      "Only the tables of the files you import are replaced; everything else keeps its current data. Imported data is saved in this browser.</div>"));

    var cloudIx = (window.SARCloud && SARCloud._last) || { sources: {}, template: null };
    if (window.SARCloud && !PUB) view.appendChild(cloudPanel(ctx, function (files) { handleFiles(files, { fromCloud: true }); }));

    var dz = U.el('<label class="dropzone" tabindex="0"><input type="file" accept=".xlsx,.xlsm" multiple hidden>' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 16V4m0 0L8 8m4-4l4 4M4 16v4h16v-4"/></svg>' +
      "<h3>Drop Excel files here or click to browse</h3><p>PBI Weekly Report.xlsx · EPBU 2026 Delivery Plan … .xlsx · Contract details.xlsx · EP - NSR Projects &lt;Month&gt;.xlsx · Projects in Closing phase.xlsx · Budget 2026.xlsx · PD_PPT_Data_Requirement_For_all_Program_&lt;date&gt;.xlsx · EPBU 2027 Engineering blockades -R&lt;nn&gt;.xlsx</p></label>");
    var input = dz.querySelector("input");
    ["dragenter", "dragover"].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add("over"); }); });
    ["dragleave", "drop"].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove("over"); }); });
    dz.addEventListener("drop", function (e) { handleFiles(e.dataTransfer.files); });
    dz.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
    input.addEventListener("change", function () { handleFiles(input.files); input.value = ""; });
    view.appendChild(dz);

    var log = U.el('<div class="log" style="margin-top:12px;display:none"></div>');
    view.appendChild(log);

    var grid = U.el('<div class="grid g-3" style="margin-top:16px"></div>');
    Object.keys(S).forEach(function (k) {
      var src = dataset.sources[k], spec = S[k];
      var li = Object.keys(spec.tables).map(function (t) {
        var rep = src && src.report ? src.report.filter(function (r) { return r.table === t; })[0] : null;
        var n = D.t(t).length;
        return "<li><span>" + esc(t) + (rep && rep.missing && rep.missing.length ? '<br><span class="missing">missing: ' + esc(rep.missing.join(", ")) + "</span>" : "") +
          "</span><span>" + (n ? U.badge(n + " rows").replace("badge ", "badge ok ") : '<span class="badge bad">missing</span>') + "</span></li>";
      }).join("");
      grid.appendChild(U.el('<div class="src-card' + (src ? " loaded" : "") + '"><h4>' + esc(spec.label) + '</h4><div class="fname">' +
        (src ? esc(src.fileName || "") + " · " + (src.imported ? "imported " : "baseline ") + esc(src.importedAt ? new Date(src.importedAt).toLocaleString("en-GB") : "") : "Not loaded") +
        '</div><div class="fname">Expected file: ' + esc(spec.file) + "</div><ul>" + li + "</ul>" +
        (src && (src.imported || cloudIx.sources[k]) ? '<button type="button" class="icon-btn ghost src-dl" data-src="' + esc(k) + '" title="Download the file you imported, update it in Excel and import it again">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v3h16v-3"/></svg><span>Download imported file</span></button>' +
          (src.hasFile || cloudIx.sources[k] ? "" : '<div class="src-dl-note">Imported before downloads were available — import this file once more to keep a downloadable copy.</div>') : "") + "</div>"));
    });
    view.appendChild(grid);
    grid.querySelectorAll(".src-dl").forEach(function (b) {
      b.addEventListener("click", function () {
        var k = b.getAttribute("data-src");
        SARStore.get("file:" + k).then(function (f) {
          if (f && f.buffer) return f;
          if (!(window.SARCloud && SARCloud.connected())) return null;
          return SARCloud.index().then(function (ix) { var e = ix.sources[k]; if (!e) return null;
            return SARCloud.download(e.path).then(function (buf) { return { name: e.fileName, buffer: buf }; }); });
        }).then(function (f) {
          if (!f || !f.buffer) { U.toast("This file was imported before downloads were available — import it once more, then download it.", true); return; }
          var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([f.buffer], { type: f.type || XLSX_MIME })); a.download = f.name;
          document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
        });
      });
    });
    if (D.hasRev) {   // Budget 2026 ↔ Spending Plan project check
      var spNames = {}; D.t("Spending_Plan").forEach(function (r) { spNames[String(r.ID)] = r["Project Name"]; });
      view.appendChild(U.el('<div class="note-box' + (D.revOnly.length ? " warn" : "") + '" style="margin-top:16px"><b>Budget 2026 (Rev Spend Plan) check:</b> ' +
        (D.revOnly.length ? "codes in Budget 2026 not found in the Spending Plan: <b>" + esc(D.revOnly.join(", ")) + "</b> (their Rev plan is not shown). " : "every Budget 2026 project matches a Spending Plan ID. ") +
        (D.revMissing.length ? "Spending Plan projects without a Rev plan (Rev = 0): " + esc(D.revMissing.map(function (id) { return id + " " + (spNames[id] || ""); }).join(", ")) + ". " : "") +
        "Riyadh Dry Port codes in Budget 2026 are mapped 0674C → 0674 (construction) and 0674D → 0674C (design).</div>"));
    }

    var reset = U.el('<button class="icon-btn ghost" type="button">Discard imports &amp; restore baseline data</button>');
    reset.addEventListener("click", function () {
      if (!confirm("Remove all imported data from this browser and return to the baseline dataset?")) return;
      SARStore.load().then(function (st) {
        return Promise.all(Object.keys((st && st.sources) || {}).map(function (k) { return SARStore.del("file:" + k); }));
      }).then(function () { return SARStore.clear(); }).then(function () { mergeDataset(null); renderHeader(); U.toast("Imported data cleared."); ctx.rerender(); });
    });
    ctx.actions.appendChild(reset);

    function write(line) { log.style.display = "block"; log.textContent += line + "\n"; log.scrollTop = log.scrollHeight; }

    function handleFiles(files, opts) {
      opts = opts || {};
      files = Array.prototype.slice.call(files || []);
      if (!files.length) return;
      log.textContent = "";
      SARStore.load().then(function (stored) {
        stored = stored || { tables: {}, sources: {} };
        var ok = 0, chain = Promise.resolve(), toCloud = [];
        files.forEach(function (f) {
          chain = chain.then(function () {
            write("Reading " + f.name + " …");
            var orig = null;
            return f.arrayBuffer().then(function (buf) { orig = buf.slice(0); return SARImporter.parseWorkbook(buf, XLSX, JSZip); }).then(function (res) {
              Object.assign(stored.tables, res.tables);
              stored.sources[res.source] = { fileName: f.name, importedAt: new Date().toISOString(), report: res.report, hasFile: true, size: f.size };
              if (!opts.fromCloud) toCloud.push({ source: res.source, name: f.name, buf: orig });
              // keep the original workbook so it can be downloaded, updated and imported again
              return SARStore.set("file:" + res.source, { name: f.name, type: f.type || XLSX_MIME, buffer: orig, savedAt: new Date().toISOString() }).catch(function () {
                stored.sources[res.source].hasFile = false;
              }).then(function () { return res; });
            }).then(function (res) {
              write("  ✓ recognised as: " + res.label);
              res.report.forEach(function (r) {
                write("    " + (r.status === "ok" ? "✓" : r.status === "warning" ? "!" : "✗") + " " + r.table + " — " + r.rows + " rows" +
                  (r.missing.length ? " (missing columns: " + r.missing.join(", ") + ")" : "") + (r.status === "missing" ? " (table not found)" : ""));
              });
              ok++;
            }).catch(function (e) { write("  ✗ " + e.message); });
          });
        });
        return chain.then(function () {
          if (!ok) { U.toast("No file could be imported — see the log.", true); return; }
          var up = Promise.resolve();
          if (toCloud.length && window.SARCloud && SARCloud.connected()) {
            write("Saving to cloud storage (" + SARCloud.config().repo + ") …");
            toCloud.forEach(function (t) {
              up = up.then(function () { return SARCloud.uploadSource(t.source, t.name, t.buf).then(function () { write("  ☁ saved " + t.name); },
                function (e) { write("  ✗ cloud: " + t.name + " — " + e.message); }); });
            });
          }
          return up.then(function () { return SARStore.save(stored); }).then(function () {
            mergeDataset(stored); renderHeader();
            U.toast(ok + " file(s) imported — dashboard updated.");
            var keep = log.textContent;
            ctx.rerender();
            var nl = document.querySelector(".log"); if (nl) { nl.style.display = "block"; nl.textContent = keep; }
          });
        });
      });
    }
  }

  /* ----------------------------- boot ----------------------------------- */
  document.getElementById("menuToggle").addEventListener("click", function () { document.body.classList.toggle("nav-open"); });
  document.getElementById("navBackdrop").addEventListener("click", function () { document.body.classList.remove("nav-open"); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") document.body.classList.remove("nav-open"); });
  window.addEventListener("hashchange", route);
  /** Navigate to a page with preset state, e.g. go("issues", { f: { code: ["0214"] } }). */
  function go(id, patch) {
    var st = pageState[id] || (pageState[id] = {});
    patch = patch || {};
    Object.keys(patch).forEach(function (k) {
      if (k === "f") { st.f = {}; Object.keys(patch.f).forEach(function (fk) { st.f[fk] = patch.f[fk].slice(); }); }
      else st[k] = patch[k];
    });
    if (location.hash === "#/" + id) route(); else location.hash = "#/" + id;
    window.scrollTo(0, 0);
  }
  window.SARApp = { D: D, PAGES: PAGES, go: go, published: PUB, dataset: function () { return dataset; } };

  var pubBtn = document.getElementById("publishBtn");
  if (pubBtn) pubBtn.addEventListener("click", function () { window.SARPublish.open(); });

  (PUB ? Promise.resolve(null) : SARStore.load()).then(function (stored) {
    mergeDataset(stored);
    renderHeader();
    route();
  });
})();

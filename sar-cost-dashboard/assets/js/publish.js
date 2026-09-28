/*
 * Publish — creates the weekly report: ONE self-contained .html file holding the dashboard code and
 * the currently loaded data. Management opens it in any browser; every page, filter, drill-down and
 * print works, and the Excel import is removed. Upload it to SharePoint / OneDrive / Teams / an intranet
 * folder and share the link, or attach it to an e-mail.
 */
(function () {
  "use strict";
  var U = window.UI, esc = U.esc, fmt = U.fmt;

  function loadKit() {
    if (window.SAR_PUBLISH_KIT) return Promise.resolve(window.SAR_PUBLISH_KIT);
    return new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = "assets/js/publish-kit.js" + (window.SAR_VERSION ? "?v=" + window.SAR_VERSION : "");            // <script> loading also works when opened from file://
      s.onload = function () { window.SAR_PUBLISH_KIT ? res(window.SAR_PUBLISH_KIT) : rej(new Error("publish kit is empty")); };
      s.onerror = function () { rej(new Error("assets/js/publish-kit.js is missing — run: node tools/build-publish-kit.js")); };
      document.head.appendChild(s);
    });
  }

  /** JSON safe to embed inside a <script> element. */
  function safeJson(o) {
    return JSON.stringify(o).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  }
  function safeCode(code) { return code.replace(/<\/script/gi, "<\\/script"); }

  function build(kit, dataset, meta) {
    var html = kit.html;
    // Drop every external script, then inline data + code before </body>.
    html = html.replace(/[ \t]*<!--[^>]*Baseline data[^>]*-->\s*\n/, "");
    html = html.replace(/[ \t]*<!--[^>]*Libraries are vendored[^>]*-->\s*\n/, "");
    html = html.replace(/[ \t]*<script\b[^>]*\bsrc=[^>]*><\/script>\s*\n?/g, "");
    html = html.replace(/<link rel="stylesheet" href="assets\/css\/styles\.css(?:\?v=[^"]*)?">/, function () { return "<style>\n" + kit.css + "\n</style>"; });
    html = html.replace(/<title>[\s\S]*?<\/title>/, "<title>" + esc(meta.title) + "</title>");
    var inline = "<script>window.SAR_DEFAULT_DATA = " + safeJson(dataset) + ";\nwindow.SAR_PUBLISHED = " + safeJson(meta) + ";</script>\n" +
      kit.scripts.map(function (s) { return "<script>/* " + s.name + " */\n" + safeCode(s.code) + "\n</script>"; }).join("\n") + "\n";
    html = html.replace("</body>", function () { return inline + "</body>"; });
    Object.keys(kit.images).forEach(function (p) { html = html.split(p).join(kit.images[p]); });
    return html;
  }

  function download(name, text) {
    var blob = new Blob([text], { type: "text/html;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  function open() {
    var D = window.SARApp.D, rd = D.reportDate, wk = U.isoWeek(rd);
    var title = "NSR Weekly Report — WK" + (wk || "") + (rd ? " (" + fmt.date(rd) + ")" : "");
    var body = U.modal("Publish weekly report", "", true);
    body.innerHTML =
      '<div class="pub-grid"><div>' +
      '<label class="fld">Report title<input id="pubTitle" type="text" value="' + esc(title) + '"></label>' +
      '<label class="fld">Prepared by<input id="pubBy" type="text" placeholder="Name / Cost Control & Planning"></label>' +
      '<label class="fld">Management note <span class="muted">(optional — shown at the top of the Executive Overview)</span>' +
      '<textarea id="pubNote" rows="5" placeholder="Key messages for this week: cost position, delays, decisions required…"></textarea></label>' +
      '<button class="icon-btn" id="pubGo" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v3h16v-3"/></svg><span>Create report file</span></button>' +
      '<div id="pubMsg" class="muted" style="margin-top:10px"></div></div>' +
      '<div class="pub-help"><h4>How it works</h4><ol>' +
      "<li><b>Create report file</b> saves one <code>.html</code> file with this week's data (report date " + esc(fmt.date(rd)) + ") built in, " +
      "with every page, filter, drill-down and A4 printing. The Excel import is not included.</li>" +
      "<li>Upload the file to a shared location, e.g. a <b>SharePoint / OneDrive / Teams</b> folder or the department intranet.</li>" +
      "<li>Use <b>Share → Copy link</b> and send the link to management. Anyone opening it sees the dashboard in their browser — nothing to install.</li>" +
      "</ol><p class='muted'>Tip: keep one file per week (the name includes the week number) so earlier reports stay available as an archive.</p>" +
      "<p class='muted'>Note: some SharePoint libraries download .html files instead of displaying them. The file still opens in the browser from Downloads; " +
      "for one-click viewing ask IT for an intranet/IIS folder that serves HTML.</p></div></div>";
    body.querySelector("#pubGo").addEventListener("click", function () {
      var msg = body.querySelector("#pubMsg");
      msg.textContent = "Building report…";
      var meta = {
        title: body.querySelector("#pubTitle").value.trim() || title,
        by: body.querySelector("#pubBy").value.trim(),
        note: body.querySelector("#pubNote").value.trim(),
        week: wk, reportDate: rd, publishedAt: new Date().toISOString()
      };
      loadKit().then(function (kit) {
        var ds = window.SARApp.dataset();
        var html = build(kit, { version: 1, tables: ds.tables, sources: ds.sources }, meta);
        var name = "NSR_Weekly_Report_WK" + (wk || "") + "_" + (rd || new Date().toISOString().slice(0, 10)) + ".html";
        download(name, html);
        msg.innerHTML = "✓ Saved <b>" + esc(name) + "</b> (" + Math.round(html.length / 1024) + " KB). Upload it and share the link.";
      }).catch(function (e) { msg.innerHTML = '<span class="neg">' + esc(e.message) + "</span>"; });
    });
  }

  window.SARPublish = { open: open, build: build, loadKit: loadKit };
})();

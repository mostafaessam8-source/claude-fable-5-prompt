/**
 * "Card Updates" page (Project Cards group): the monthly team-update cycle for EP - NSR Projects <Month>.xlsx.
 *   1 the current month's card file (imported on Data Import) → a team update page (.html) to share, or the form here
 *   2 the team's update files (.json) collected in this browser
 *   3 the new month's card file + those updates → the same workbook with the team's yellow cells filled in, plus a report
 */
(function () {
  "use strict";
  var U = window.UI, esc = U.esc, KEY = "cardUpdates";

  function loadKit() {
    if (window.SAR_PUBLISH_KIT) return Promise.resolve(window.SAR_PUBLISH_KIT);
    return new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = "assets/js/publish-kit.js" + (window.SAR_VERSION ? "?v=" + window.SAR_VERSION : "");
      s.onload = function () { window.SAR_PUBLISH_KIT ? res(window.SAR_PUBLISH_KIT) : rej(new Error("publish kit is empty")); };
      s.onerror = function () { rej(new Error("assets/js/publish-kit.js is missing — run: npm run release")); };
      document.head.appendChild(s);
    });
  }
  function getUpdates() { return SARStore.get(KEY).then(function (x) { return Array.isArray(x) ? x : []; }); }
  function setUpdates(list) { return SARStore.set(KEY, list); }
  function when(s) { return s ? new Date(s).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""; }
  function cellsOf(u) { return Object.keys(u.projects || {}).reduce(function (n, k) { return n + ((u.projects[k].cells || []).length); }, 0); }
  function dropzone(accept, title, sub, onFiles) {
    var dz = U.el('<label class="dropzone" tabindex="0"><input type="file" accept="' + accept + '" multiple hidden>' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 16V4m0 0L8 8m4-4l4 4M4 16v4h16v-4"/></svg><h3>' + title + "</h3><p>" + sub + "</p></label>");
    var input = dz.querySelector("input");
    ["dragenter", "dragover"].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add("over"); }); });
    ["dragleave", "drop"].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove("over"); }); });
    dz.addEventListener("drop", function (e) { onFiles(Array.prototype.slice.call(e.dataTransfer.files)); });
    input.addEventListener("change", function () { onFiles(Array.prototype.slice.call(input.files)); input.value = ""; });
    return dz;
  }
  var cache = { name: null, model: null };   // the extracted current month model (re-read when the file changes)

  function render(ctx) {
    var v = ctx.view, st = ctx.state;
    v.appendChild(U.el('<div class="note-box" style="margin-bottom:16px"><b>Monthly card update by the project teams.</b> ' +
      "① Create the team update page from the current month's <b>EP - NSR Projects</b> file and share it (SharePoint / Teams / e-mail). " +
      "Each project engineer opens it, picks a project and updates the <b>yellow cells</b> only, then sends back the small update file it downloads. " +
      "② Add the received update files here. ③ When the new month's file arrives, drop it in step 3: the team's values are written into the same yellow cells — " +
      "projects added or removed in the new file are handled automatically — and you download the updated workbook (format unchanged) and import it.</div>"));

    /* ---- 1 · current month → team page */
    var p1 = U.el(U.panel("1 · Team update page", "From the current month's card file", "", "")); v.appendChild(p1);
    var b1 = U.el('<div class="cu-step"><div class="empty-note">Reading the card file…</div></div>'); p1.appendChild(b1);
    SARStore.get("file:cards").then(function (f) {
      if (!f || !f.buffer) { b1.innerHTML = '<div class="empty-note">Import the current <b>EP - NSR Projects &lt;Month&gt;.xlsx</b> on Data Import first — its yellow cells become the team form.</div>'; return; }
      var ready = cache.name === f.name + f.savedAt && cache.model ? Promise.resolve(cache.model)
        : SARCardForm.extract(f.buffer.slice(0), f.name).then(function (m) { cache = { name: f.name + f.savedAt, model: m }; return m; });
      return ready.then(function (m) {
        var nf = m.projects.reduce(function (n, p) { return n + p.sections.reduce(function (k, s) { return k + s.rows.reduce(function (q, r) { return q + r.c.filter(function (c) { return !c.f; }).length; }, 0); }, 0); }, 0);
        b1.innerHTML = '<div class="cu-sum"><div><b>' + esc(f.name) + "</b><br><span class=\"muted\">" + m.projects.length + " projects · " + nf.toLocaleString("en-US") +
          ' yellow cells the team can update</span></div><div class="cu-sum-acts"><button type="button" class="icon-btn" data-a="html">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v3h16v-3"/></svg><span>Create team update page (.html)</span></button>' +
          '<button type="button" class="icon-btn ghost" data-a="here">' + (st.form ? "Hide the form" : "Open the form here") + "</button></div></div>" +
          '<div class="muted cu-note">The page holds this month\'s cards (read-only values for context) and works offline. Share it inside SAR only: it contains project data.</div>' +
          '<div class="cu-host"></div>';
        b1.querySelector('[data-a="html"]').addEventListener("click", function (ev) {
          var btn = ev.currentTarget; btn.disabled = true;
          loadKit().then(function (kit) {
            var self = (kit.scripts.filter(function (s) { return /cardform\.js$/.test(s.name); })[0] || {}).code;
            if (!self) throw new Error("The publish kit has no card form — run: npm run release");
            var html = SARCardForm.teamPage(m, kit, self), name = "NSR Project Cards - Team Update" + (m.month ? " - " + m.month : "") + ".html";
            SARCardForm.saveFile(name, html, "text/html;charset=utf-8");
            U.toast("Saved " + name + " — share it with the project teams.");
          }).catch(function (e) { U.toast(e.message, true); }).then(function () { btn.disabled = false; });
        });
        b1.querySelector('[data-a="here"]').addEventListener("click", function () { st.form = !st.form; ctx.rerender(); });
        if (st.form) SARCardForm.editor(b1.querySelector(".cu-host"), m, { onDownload: function (u) { addUpdates([{ name: "(this browser) " + (u.by || ""), data: u }]); } });
      });
    }).catch(function (e) { b1.innerHTML = '<div class="note-box warn">' + esc(e.message) + "</div>"; });

    /* ---- 2 · received updates */
    var p2 = U.el(U.panel("2 · Team updates received", "Update files (.json) from the project teams", "", "")); v.appendChild(p2);
    var list = U.el('<div class="cu-list"></div>');
    p2.appendChild(dropzone(".json", "Drop the team update files here", "NSR_Card_Updates_….json — one or many at once", function (files) {
      Promise.all(files.map(function (f) { return f.text().then(function (t) { return { name: f.name, data: JSON.parse(t) }; }).catch(function () { return { name: f.name, bad: true }; }); })).then(addUpdates);
    }));
    p2.appendChild(list);
    function addUpdates(items) {
      getUpdates().then(function (cur) {
        var n = 0, bad = [];
        items.forEach(function (it) {
          if (it.bad || !it.data || it.data.kind !== "sar-card-updates") { bad.push(it.name); return; }
          var id = it.data.by + "|" + it.data.savedAt;
          cur = cur.filter(function (x) { return x.id !== id; });
          cur.push({ id: id, name: it.name, addedAt: new Date().toISOString(), data: it.data }); n++;
        });
        return setUpdates(cur).then(function () {
          if (n) U.toast(n + " update file(s) added.");
          if (bad.length) U.toast("Not a card update file: " + bad.join(", "), true);
          drawList();
        });
      });
    }
    function drawList() {
      getUpdates().then(function (cur) {
        if (!cur.length) { list.innerHTML = '<div class="empty-note">No update files yet.</div>'; return; }
        cur.sort(function (a, b) { return String(b.data.savedAt).localeCompare(String(a.data.savedAt)); });
        list.innerHTML = '<table class="cu-tbl"><thead><tr><th>Updated by</th><th>Saved</th><th>Projects</th><th class="num">Cells</th><th>From file</th><th>Update file</th><th></th></tr></thead><tbody>' +
          cur.map(function (x) { var d = x.data;
            return "<tr><td>" + esc(d.by || "—") + "</td><td>" + esc(when(d.savedAt)) + "</td><td>" + esc(Object.keys(d.projects || {}).join(", ")) + '</td><td class="num">' + cellsOf(d) +
              "</td><td>" + esc(d.file || "") + "</td><td>" + esc(x.name) + '</td><td><button type="button" class="cu-x" data-id="' + esc(x.id) + '" title="Remove">✕</button></td></tr>'; }).join("") +
          '</tbody></table><div class="cu-list-acts"><button type="button" class="icon-btn ghost" data-a="clear">Remove all update files</button></div>';
        list.querySelectorAll(".cu-x").forEach(function (b) { b.addEventListener("click", function () {
          var id = b.getAttribute("data-id"); getUpdates().then(function (c) { return setUpdates(c.filter(function (x) { return x.id !== id; })); }).then(drawList); }); });
        list.querySelector('[data-a="clear"]').addEventListener("click", function () { if (confirm("Remove all received update files?")) setUpdates([]).then(drawList); });
      });
    }
    drawList();

    /* ---- 3 · apply to the new month */
    var p3 = U.el(U.panel("3 · Apply to the new month's file", "Writes the team's values into the yellow cells", "", "")); v.appendChild(p3);
    var out = U.el('<div class="cu-out"></div>');
    p3.appendChild(dropzone(".xlsx,.xlsm", "Drop the new month's EP - NSR Projects file here", "The file is not changed: you download an updated copy", function (files) {
      var f = files[0]; if (!f) return;
      out.innerHTML = '<div class="empty-note">Applying the updates to ' + esc(f.name) + " …</div>";
      Promise.all([f.arrayBuffer(), getUpdates()]).then(function (x) {
        if (!x[1].length) throw new Error("No team update files yet (step 2).");
        return SARCardForm.apply(x[0], x[1].map(function (u) { return u.data; }), f.name);
      }).then(function (res) { showResult(f.name, res); }).catch(function (e) { out.innerHTML = '<div class="note-box warn">' + esc(e.message) + "</div>"; });
    }));
    p3.appendChild(out);
    function showResult(fname, res) {
      var ok = res.report.filter(function (r) { return r.status === "applied"; }), sk = res.report.filter(function (r) { return r.status !== "applied"; });
      var newName = fname.replace(/(\.xls[xm])$/i, "") + " - team updates.xlsx";
      out.innerHTML = '<div class="cu-sum"><div><b>' + ok.length + " cells updated</b> in " + esc(fname) + (sk.length ? ' · <span class="neg">' + sk.length + " not applied</span>" : "") +
        '</div><div class="cu-sum-acts"><button type="button" class="icon-btn" data-a="xlsx"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v3h16v-3"/></svg><span>Download updated workbook</span></button>' +
        '<button type="button" class="icon-btn ghost" data-a="csv">Download change report (.csv)</button></div></div>' +
        '<div class="muted cu-note">Then import the updated workbook on Data Import. Formulas recalculate when it is opened in Excel.</div>' +
        '<table class="cu-tbl"><thead><tr><th>Project</th><th>Section · row</th><th>Column</th><th>Cell</th><th>In the new file</th><th>Team value</th><th>By</th><th>Result</th></tr></thead><tbody>' +
        sk.concat(ok).map(function (r) {
          return "<tr" + (r.status !== "applied" ? ' class="cu-skip"' : "") + "><td>" + esc(r.code) + "</td><td>" + esc((r.s || "") + " · " + (r.l || "")) + "</td><td>" + esc(r.h || "") + "</td><td>" + esc(r.moved || r.ref) +
            "</td><td>" + esc(r.now != null ? r.now : r.from || "") + "</td><td><b>" + esc(r.to) + "</b></td><td>" + esc(r.by || "") + (r.over ? '<div class="muted">replaces ' + esc(r.over) + "</div>" : "") +
            "</td><td>" + (r.status === "applied" ? '<span class="pos">applied</span>' : '<span class="neg">' + esc(r.why) + "</span>") + "</td></tr>";
        }).join("") + "</tbody></table>";
      out.querySelector('[data-a="xlsx"]').addEventListener("click", function () {
        var a = document.createElement("a"); a.href = URL.createObjectURL(res.blob); a.download = newName; document.body.appendChild(a); a.click(); a.remove();
      });
      out.querySelector('[data-a="csv"]').addEventListener("click", function () {
        var q = function (s) { return '"' + String(s == null ? "" : s).replace(/"/g, '""') + '"'; };
        var csv = ["Project,Section,Row,Column,Cell,In the new file,Team value,By,Result"].concat(res.report.map(function (r) {
          return [r.code, r.s, r.l, r.h, r.moved || r.ref, r.now != null ? r.now : r.from, r.to, r.by, r.status === "applied" ? "applied" : r.why].map(q).join(","); })).join("\r\n");
        SARCardForm.saveFile(fname.replace(/(\.xls[xm])$/i, "") + " - team updates report.csv", "\ufeff" + csv, "text/csv;charset=utf-8");
      });
    }
  }

  window.SARPages = window.SARPages || {};
  window.SARPages["card-updates"] = render;
})();

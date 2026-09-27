/* Shared UI toolkit: formatters, tables, slicers, tiles, charts, modal, toast. */
(function () {
  "use strict";

  var C = {
    blue: "#00778B", black: "#3D3935", slate: "#768692", sky: "#59CBE8",
    mid: "#71B2C9", gray: "#C8C9C7", red: "#CB2C30", yellow: "#F1B434",
    tint5: "#F2F8F9", tint10: "#E6F1F4", white: "#FFFFFF"
  };
  // Series roles are fixed across every chart: plan = SAR Blue, forecast = mid blue,
  // actual = yellow, contractor / invoice plan = slate.
  var SERIES = { plan: C.blue, forecast: C.mid, actual: C.yellow, invoice: C.slate, extra: C.sky, alert: C.red };

  /* ----------------------------- formatting ----------------------------- */
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function toNum(v) {
    if (isNum(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && !isNaN(+v.replace(/,/g, ""))) return +v.replace(/,/g, "");
    return null;
  }
  var nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  var nf2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var fmt = {
    money: function (v) { v = toNum(v); if (v === null) return ""; v = Math.round(v); return nf0.format(v === 0 ? 0 : v); },
    num: function (v, d) { v = toNum(v); if (v === null) return ""; return d ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : nf0.format(v); },
    int: function (v) { v = toNum(v); return v === null ? "" : nf0.format(v); },
    dec: function (v) { v = toNum(v); return v === null ? "" : nf2.format(v); },
    pct: function (v, d) { v = toNum(v); return v === null ? "" : (v * 100).toFixed(d == null ? 1 : d) + "%"; },
    m: function (v, d) { v = toNum(v); if (v === null) return ""; return (v / 1e6).toLocaleString("en-US", { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }); },
    short: function (v) {
      v = toNum(v); if (v === null) return "";
      var a = Math.abs(v);
      if (a >= 1e9) return (v / 1e9).toFixed(2) + "B";
      if (a >= 1e6) return (v / 1e6).toFixed(1) + "M";
      if (a >= 1e3) return (v / 1e3).toFixed(0) + "K";
      return nf0.format(v);
    },
    date: function (s) {
      if (!s) return "";
      var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
      if (!m) return String(s);
      return m[3] + "-" + MONTHS[+m[2] - 1] + "-" + m[1];
    },
    month: function (s) {
      var m = /^(\d{4})-(\d{2})/.exec(s || "");
      return m ? MONTHS[+m[2] - 1] + "-" + m[1].slice(2) : String(s || "");
    },
    text: function (v) { return v == null ? "" : String(v); }
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function el(html) {
    var t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function uniq(arr) {
    var s = {}, out = [];
    arr.forEach(function (v) { if (v != null && v !== "" && !s[v]) { s[v] = 1; out.push(v); } });
    return out;
  }
  function sum(rows, get) {
    var t = 0, any = false;
    rows.forEach(function (r) { var v = toNum(typeof get === "function" ? get(r) : r[get]); if (v !== null) { t += v; any = true; } });
    return any ? t : null;
  }
  function isoWeek(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ""); if (!m) return null;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    var day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day);
    var y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - y0) / 864e5 + 1) / 7);
  }

  /* status → badge class (icon dot + label, never colour alone) */
  function statusClass(s) {
    s = String(s || "").toLowerCase();
    if (/critical|delay|escalat|overdue|behind|high risk/.test(s)) return "bad";
    if (/pending|on ?going|in progress|at risk|high|medium|open/.test(s)) return "warn";
    if (/resolved|closed|complete|done/.test(s)) return "done";
    if (/on ?track|ahead|ok|low|approved/.test(s)) return "ok";
    return "";
  }
  function badge(s) { return s == null || s === "" ? "" : '<span class="badge ' + statusClass(s) + '">' + esc(s) + "</span>"; }

  /* ----------------------------- KPI tile ------------------------------- */
  function tile(o) {
    return '<div class="tile ' + (o.color || "") + '"><div class="band"><div class="value">' + o.value +
      (o.unit ? "<small>" + esc(o.unit) + "</small>" : "") + '</div></div><div class="foot"><div class="label">' +
      esc(o.label) + "</div>" + (o.note ? '<div class="note">' + o.note + "</div>" : "") + "</div></div>";
  }
  function info(k, v) { return '<div class="info"><div class="k">' + esc(k) + '</div><div class="v">' + (v === "" || v == null ? "—" : v) + "</div></div>"; }
  function panel(title, sub, body, tools) {
    return '<section class="panel"><div class="panel-head"><h3>' + esc(title) + "</h3>" +
      (sub ? '<span class="sub">' + sub + "</span>" : "") + '<div class="tools">' + (tools || "") + "</div></div>" + (body || "") + "</section>";
  }
  function meter(v, cls) {
    v = toNum(v);
    var w = v === null ? 0 : Math.max(0, Math.min(1, v)) * 100;
    return '<div class="cell-meter"><div class="meter ' + (cls || "") + '"><span style="width:' + w.toFixed(1) + '%"></span></div><b>' + fmt.pct(v) + "</b></div>";
  }

  /* ----------------------------- data table ----------------------------- */
  var TYPE_FMT = { money: fmt.money, num: fmt.num, int: fmt.int, dec: fmt.dec, pct: fmt.pct, date: fmt.date, text: fmt.text, m: fmt.m };
  var NUMERIC = { money: 1, num: 1, int: 1, dec: 1, pct: 1, m: 1 };

  function cellHtml(col, row) {
    var v = col.get ? col.get(row) : row[col.key];
    if (col.render) return col.render(v, row);
    if (col.type === "badge") return badge(v);
    if (col.type === "meter") return meter(v, col.meterCls);
    var s = esc((TYPE_FMT[col.type] || fmt.text)(v));
    if (col.signed && toNum(v) !== null && toNum(v) < -0.5) return '<span class="neg">' + s + "</span>";
    return s;
  }

  function csvCell(v) {
    if (v == null) return "";
    var s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  /**
   * Sortable, searchable table with optional totals row, CSV export and row click.
   * opts: { columns, rows, search, totals, onRow, exportName, autoHeight, emptyText, sort:{key,dir} }
   */
  function table(host, opts) {
    var state = { q: "", sortIdx: -1, dir: 1 };
    if (opts.sort) {
      opts.columns.forEach(function (c, i) { if ((c.key || c.label) === opts.sort.key) state.sortIdx = i; });
      state.dir = opts.sort.dir || 1;
    }
    var wrap = el('<div class="dt-host"></div>');
    var tools = el('<div class="table-tools"></div>');
    if (opts.search !== false) {
      var inp = el('<input type="search" placeholder="Search table…" aria-label="Search table">');
      inp.addEventListener("input", function () { state.q = inp.value.toLowerCase(); draw(); });
      tools.appendChild(inp);
    }
    var count = el('<span class="count"></span>');
    tools.appendChild(count);
    if (opts.exportName !== false) {
      var btn = el('<button class="link-btn" type="button">⤓ Export CSV</button>');
      btn.addEventListener("click", function () { exportCsv(current()); });
      tools.appendChild(btn);
    }
    wrap.appendChild(tools);
    var box = el('<div class="table-wrap' + (opts.autoHeight ? " auto-h" : "") + '"></div>');
    if (opts.maxHeight) box.style.maxHeight = opts.maxHeight + "px";
    wrap.appendChild(box);
    host.appendChild(wrap);

    function current() {
      var rows = opts.rows.slice();
      if (state.q) {
        rows = rows.filter(function (r) {
          return opts.columns.some(function (c) {
            var v = c.get ? c.get(r) : r[c.key];
            var s = (TYPE_FMT[c.type] || fmt.text)(v);
            return String(s).toLowerCase().indexOf(state.q) >= 0 || String(v == null ? "" : v).toLowerCase().indexOf(state.q) >= 0;
          });
        });
      }
      if (state.sortIdx >= 0) {
        var c = opts.columns[state.sortIdx];
        rows.sort(function (a, b) {
          var x = c.get ? c.get(a) : a[c.key], y = c.get ? c.get(b) : b[c.key];
          if (x == null || x === "") return 1; if (y == null || y === "") return -1;
          var nx = toNum(x), ny = toNum(y);
          if (nx !== null && ny !== null) return (nx - ny) * state.dir;
          return String(x).localeCompare(String(y), undefined, { numeric: true }) * state.dir;
        });
      }
      return rows;
    }

    function exportCsv(rows) {
      var lines = [opts.columns.map(function (c) { return csvCell(c.label); }).join(",")];
      rows.forEach(function (r) {
        lines.push(opts.columns.map(function (c) { return csvCell(c.get ? c.get(r) : r[c.key]); }).join(","));
      });
      var blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = (opts.exportName || "table") + ".csv";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    }

    function draw() {
      var rows = current();
      count.textContent = rows.length + " of " + opts.rows.length + " rows";
      var h = '<table class="dt"><thead><tr>';
      opts.columns.forEach(function (c, i) {
        var arrow = state.sortIdx === i ? (state.dir > 0 ? "▲" : "▼") : "";
        h += '<th data-i="' + i + '" class="' + (NUMERIC[c.type] ? "num" : "") + '" title="Sort by ' + esc(c.label) + '">' + esc(c.label) + '<span class="arrow">' + arrow + "</span></th>";
      });
      h += "</tr></thead><tbody>";
      if (!rows.length) h += '<tr><td colspan="' + opts.columns.length + '"><div class="empty">' + esc(opts.emptyText || "No rows match the current filters.") + "</div></td></tr>";
      rows.forEach(function (r, ri) {
        h += '<tr data-r="' + ri + '"' + (opts.onRow ? ' class="clickable" title="Click for full details"' : "") + ">";
        opts.columns.forEach(function (c) {
          var cls = [NUMERIC[c.type] ? "num" : "", c.wrap ? "wrap" : "", c.type === "date" || c.nowrap ? "nowrap" : ""];
          if (c.cls) cls.push(c.cls(c.get ? c.get(r) : r[c.key], r) || "");
          h += '<td class="' + cls.join(" ").trim() + '">' + cellHtml(c, r) + "</td>";
        });
        h += "</tr>";
      });
      h += "</tbody>";
      if (opts.totals && rows.length) {
        h += "<tfoot><tr>";
        opts.columns.forEach(function (c, i) {
          var t = "";
          if (i === 0) t = "Total";
          if (c.total === "sum") t = (TYPE_FMT[c.type] || fmt.money)(sum(rows, c.get || c.key));
          else if (typeof c.total === "function") t = c.total(rows);
          h += '<td class="' + (NUMERIC[c.type] ? "num" : "") + '">' + esc(t) + "</td>";
        });
        h += "</tr></tfoot>";
      }
      h += "</table>";
      box.innerHTML = h;
      box.querySelectorAll("th").forEach(function (th) {
        th.addEventListener("click", function () {
          var i = +th.getAttribute("data-i");
          if (state.sortIdx === i) state.dir = -state.dir; else { state.sortIdx = i; state.dir = 1; }
          draw();
        });
      });
      if (opts.onRow) box.querySelectorAll("tbody tr[data-r]").forEach(function (tr) {
        tr.addEventListener("click", function () { opts.onRow(rows[+tr.getAttribute("data-r")]); });
      });
    }
    draw();
    return { redraw: function (newRows) { if (newRows) opts.rows = newRows; draw(); } };
  }

  /* ----------------------------- slicers -------------------------------- */
  var openPop = null;
  document.addEventListener("click", function (e) {
    if (openPop && !openPop.contains(e.target)) { openPop.__close(); }
  });

  /** Multi-select slicer. `selected` is an array (mutated in place); empty = All. */
  function multiSelect(o) {
    var root = el('<div class="filter"><label>' + esc(o.label) + '</label><button type="button" class="ms-btn"></button></div>');
    var btn = root.querySelector(".ms-btn");
    var sel = o.selected;
    function caption() {
      btn.classList.toggle("active", sel.length > 0);
      btn.textContent = !sel.length ? "All" : sel.length === 1 ? String(sel[0]) : sel.length + " selected";
      btn.title = sel.length ? sel.join(", ") : "All";
    }
    caption();
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (root.querySelector(".ms-pop")) { root.__close(); return; }
      if (openPop) openPop.__close();
      var pop = el('<div class="ms-pop"><input type="search" placeholder="Search…"><div class="ms-actions"><button type="button" data-a="clear">Clear selection (show all)</button></div><ul></ul></div>');
      var ul = pop.querySelector("ul"), q = pop.querySelector("input");
      function list() {
        var term = q.value.toLowerCase();
        ul.innerHTML = o.options.filter(function (v) { return String(v).toLowerCase().indexOf(term) >= 0; }).map(function (v) {
          return '<li><label><input type="checkbox" value="' + esc(v) + '"' + (sel.indexOf(v) >= 0 ? " checked" : "") + "><span>" + esc(o.display ? o.display(v) : v) + "</span></label></li>";
        }).join("") || '<li><label class="muted">No matches</label></li>';
        ul.querySelectorAll("input").forEach(function (cb, idx) {
          cb.addEventListener("change", function () {
            var val = o.options.filter(function (v) { return String(v).toLowerCase().indexOf(term) >= 0; })[idx];
            var at = sel.indexOf(val);
            if (cb.checked && at < 0) sel.push(val); else if (!cb.checked && at >= 0) sel.splice(at, 1);
            caption(); o.onChange();
          });
        });
      }
      pop.addEventListener("click", function (ev) { ev.stopPropagation(); });
      pop.querySelector('[data-a="clear"]').addEventListener("click", function () {
        sel.length = 0; caption(); list(); o.onChange();
      });
      q.addEventListener("input", list);
      list();
      root.appendChild(pop);
      root.__close = function () { pop.remove(); openPop = null; };
      pop.__close = root.__close;
      openPop = pop;
      q.focus();
    });
    return root;
  }

  /** Single-select dropdown. */
  function select(o) {
    var root = el('<div class="filter"><label>' + esc(o.label) + '</label><select></select></div>');
    var s = root.querySelector("select");
    s.innerHTML = (o.allowAll ? '<option value="">All</option>' : "") + o.options.map(function (v) {
      var val = typeof v === "object" ? v.value : v, lab = typeof v === "object" ? v.label : v;
      return '<option value="' + esc(val) + '"' + (String(val) === String(o.value) ? " selected" : "") + ">" + esc(lab) + "</option>";
    }).join("");
    s.addEventListener("change", function () { o.onChange(s.value); });
    return root;
  }

  /* ----------------------------- charts --------------------------------- */
  var charts = [];
  function destroyCharts() { charts.forEach(function (c) { c.destroy(); }); charts = []; }

  if (window.Chart) {
    Chart.defaults.font.family = getComputedStyle(document.documentElement).getPropertyValue("--font") || "Segoe UI, Arial, sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.animation = false; // instant render; keeps print/PDF output complete
    Chart.defaults.color = C.black;
    Chart.defaults.borderColor = "rgba(200,201,199,.55)";
    Chart.defaults.maintainAspectRatio = false;
    Chart.defaults.plugins.legend.position = "top";
    Chart.defaults.plugins.legend.align = "start";
    Chart.defaults.plugins.legend.labels.boxWidth = 12;
    Chart.defaults.plugins.legend.labels.boxHeight = 12;
    Chart.defaults.plugins.legend.labels.padding = 14;
    Chart.defaults.plugins.tooltip.backgroundColor = C.black;
    Chart.defaults.plugins.tooltip.titleFont = { weight: "700" };
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 0;
    Chart.defaults.plugins.tooltip.boxPadding = 4;
    Chart.defaults.elements.bar.borderRadius = { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 };
    Chart.defaults.elements.line.borderWidth = 2;
    Chart.defaults.elements.point.radius = 0;
    Chart.defaults.elements.point.hoverRadius = 5;
    Chart.defaults.interaction.mode = "index";
    Chart.defaults.interaction.intersect = false;
    if (window.ChartDataLabels) {
      Chart.register(window.ChartDataLabels);
      Chart.defaults.plugins.datalabels = { display: false };
    }
  }

  /** Bar/column dataset with the house mark spec. */
  function barDs(label, data, color, extra) {
    return Object.assign({ label: label, data: data, backgroundColor: color, borderColor: C.white, borderWidth: 0,
      maxBarThickness: 34, categoryPercentage: 0.78, barPercentage: 0.9 }, extra || {});
  }
  function lineDs(label, data, color, extra) {
    return Object.assign({ type: "line", label: label, data: data, borderColor: color, backgroundColor: color,
      pointRadius: 0, pointHoverRadius: 5, tension: 0.25, spanGaps: true }, extra || {});
  }

  function moneyAxis() {
    return { beginAtZero: true, ticks: { callback: function (v) { return fmt.short(v); } }, grid: { color: "rgba(200,201,199,.5)" }, border: { display: false } };
  }
  function pctAxis(max) {
    return { beginAtZero: true, max: max, ticks: { callback: function (v) { return Math.round(v * 100) + "%"; } }, grid: { color: "rgba(200,201,199,.5)" }, border: { display: false } };
  }
  function shortLabel(n) {
    return function (v) { var s = String(this.getLabelForValue(v)); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
  }
  function catAxis() { return { grid: { display: false }, border: { color: C.gray }, ticks: { autoSkip: false } }; }

  function wrapLabel(s, n) {
    s = String(s || ""); n = n || 28;
    if (s.length <= n) return s;
    var words = s.split(" "), lines = [], cur = "";
    words.forEach(function (w) { if ((cur + " " + w).trim().length > n && cur) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim(); });
    if (cur) lines.push(cur);
    return lines.length > 3 ? lines.slice(0, 3).concat(["…"]) : lines;
  }

  function chart(host, cfg) {
    var box = typeof host === "string" ? document.querySelector(host) : host;
    box.innerHTML = "";
    var cv = document.createElement("canvas");
    box.appendChild(cv);
    var c = new Chart(cv, cfg);
    charts.push(c);
    return c;
  }

  function moneyTooltip() {
    return { callbacks: { label: function (ctx) { return " " + ctx.dataset.label + ": " + fmt.money(ctx.parsed[ctx.chart.options.indexAxis === "y" ? "x" : "y"]) + " SAR"; } } };
  }
  function pctTooltip() {
    return { callbacks: { label: function (ctx) { return " " + ctx.dataset.label + ": " + fmt.pct(ctx.parsed[ctx.chart.options.indexAxis === "y" ? "x" : "y"]); } } };
  }

  /* ----------------------------- modal / toast -------------------------- */
  function modal(title, bodyHtml) {
    var m = el('<div class="modal-back" role="dialog" aria-modal="true"><div class="modal"><header><h3>' + esc(title) +
      '</h3><button type="button" aria-label="Close">×</button></header><div class="body">' + bodyHtml + "</div></div></div>");
    function close() { m.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    m.addEventListener("click", function (e) { if (e.target === m) close(); });
    m.querySelector("header button").addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    document.body.appendChild(m);
  }
  /** Modal listing every non-empty field of a record, formatted by value shape. */
  function recordModal(title, row, groups) {
    var h = '<div class="kv">';
    function fv(k, v) {
      if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return fmt.date(v);
      if (isNum(v)) {
        if (/%|progress|spi/i.test(k) && Math.abs(v) <= 5) return /spi/i.test(k) ? v.toFixed(2) : fmt.pct(v);
        return Math.abs(v) >= 1000 ? fmt.money(v) : String(Math.round(v * 10000) / 10000);
      }
      return esc(v);
    }
    (groups || [{ title: "", keys: Object.keys(row) }]).forEach(function (g) {
      var keys = g.keys.filter(function (k) { return row[k] != null && row[k] !== ""; });
      if (!keys.length) return;
      if (g.title) h += "<h5>" + esc(g.title) + "</h5>";
      keys.forEach(function (k) { h += "<div>" + esc(k) + "</div><div>" + fv(k, row[k]) + "</div>"; });
    });
    modal(title, h + "</div>");
  }
  function toast(msg, isError) {
    var t = el('<div class="toast' + (isError ? " error" : "") + '" role="status">' + esc(msg) + "</div>");
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, isError ? 7000 : 3500);
  }

  window.UI = {
    C: C, SERIES: SERIES, fmt: fmt, esc: esc, el: el, uniq: uniq, sum: sum, toNum: toNum, isoWeek: isoWeek,
    badge: badge, statusClass: statusClass, tile: tile, info: info, panel: panel, meter: meter,
    table: table, multiSelect: multiSelect, select: select,
    chart: chart, destroyCharts: destroyCharts, barDs: barDs, lineDs: lineDs,
    moneyAxis: moneyAxis, shortLabel: shortLabel, pctAxis: pctAxis, catAxis: catAxis, wrapLabel: wrapLabel,
    moneyTooltip: moneyTooltip, pctTooltip: pctTooltip,
    modal: modal, recordModal: recordModal, toast: toast
  };
})();

/* Shared UI toolkit: formatters, tables, slicers, tiles, charts, modal, toast. */
(function () {
  "use strict";

  var C = {
    blue: "#00778B", black: "#3D3935", slate: "#768692", sky: "#59CBE8",
    mid: "#71B2C9", gray: "#C8C9C7", red: "#CB2C30", yellow: "#F1B434",
    tint5: "#F2F8F9", tint10: "#E6F1F4", white: "#FFFFFF"
  };
  // Series roles are fixed across every chart: plan = SAR Blue, forecast = mid blue,
  // actual = yellow, contractor / invoice plan = slate, revised spend plan = black.
  var SERIES = { plan: C.blue, rev: C.black, forecast: C.mid, actual: C.yellow, invoice: C.slate, extra: C.sky, alert: C.red };

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
    if (/critical|delay|escalat|overdue|behind|high risk|terminat/.test(s)) return "bad";
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
  var openPop = null; // the one open popover (slicer or sort panel)
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
    // sorts: ordered list of { i: columnIndex, dir: 1 | -1 } — first entry is the primary sort
    var state = { q: "", sorts: [] };
    if (opts.sort) {
      opts.columns.forEach(function (c, i) { if ((c.key || c.label) === opts.sort.key) state.sorts = [{ i: i, dir: opts.sort.dir || 1 }]; });
    }
    var wrap = el('<div class="dt-host"></div>');
    var tools = el('<div class="table-tools"></div>');
    if (opts.search !== false) {
      var inp = el('<input type="search" placeholder="Search table…" aria-label="Search table">');
      inp.addEventListener("input", function () { state.q = inp.value.toLowerCase(); draw(); });
      tools.appendChild(inp);
    }
    var sortWrap = el('<div class="sort-wrap"><button class="link-btn sort-btn" type="button" title="Sort by one or more columns">⇅ Sort</button></div>');
    sortWrap.querySelector("button").addEventListener("click", function (e) { e.stopPropagation(); toggleSortPanel(); });
    tools.appendChild(sortWrap);
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
    box.addEventListener("click", function (ev) {        // reading ruler: click a row to keep it marked (click again to clear)
      var tr = ev.target.closest && ev.target.closest("tbody tr"); if (!tr || !box.contains(tr)) return;
      var pin = !tr.classList.contains("dt-pin");
      Array.prototype.forEach.call(box.querySelectorAll("tr.dt-pin"), function (x) { x.classList.remove("dt-pin"); });
      if (pin) tr.classList.add("dt-pin");
    });

    function val(c, r) { return c.get ? c.get(r) : r[c.key]; }
    function cmp(c, a, b, dir) {
      var x = val(c, a), y = val(c, b);
      var ex = x == null || x === "", ey = y == null || y === "";
      if (ex && ey) return 0; if (ex) return 1; if (ey) return -1; // blanks always last
      var nx = toNum(x), ny = toNum(y);
      if (nx !== null && ny !== null) return (nx - ny) * dir;
      return String(x).localeCompare(String(y), undefined, { numeric: true }) * dir;
    }
    function current() {
      var rows = opts.rows.slice();
      if (state.q) {
        rows = rows.filter(function (r) {
          return opts.columns.some(function (c) {
            var v = val(c, r);
            var s = (TYPE_FMT[c.type] || fmt.text)(v);
            return String(s).toLowerCase().indexOf(state.q) >= 0 || String(v == null ? "" : v).toLowerCase().indexOf(state.q) >= 0;
          });
        });
      }
      if (state.sorts.length) {
        rows = rows.map(function (r, i) { return [r, i]; });
        rows.sort(function (a, b) {
          for (var k = 0; k < state.sorts.length; k++) {
            var s = state.sorts[k], d = cmp(opts.columns[s.i], a[0], b[0], s.dir);
            if (d) return d;
          }
          return a[1] - b[1];
        });
        rows = rows.map(function (p) { return p[0]; });
      }
      return rows;
    }

    /* Header click: plain click = sort by that column only (click again to reverse);
       Shift/Ctrl + click = add it as the next sort level (click again to reverse). */
    function headerSort(i, add) {
      var at = -1;
      state.sorts.forEach(function (s, k) { if (s.i === i) at = k; });
      if (add) {
        if (at >= 0) state.sorts[at].dir = -state.sorts[at].dir; else state.sorts.push({ i: i, dir: 1 });
      } else if (at === 0 && state.sorts.length === 1) state.sorts[0].dir = -state.sorts[0].dir;
      else state.sorts = [{ i: i, dir: 1 }];
      draw();
    }

    function toggleSortPanel() {
      var old = sortWrap.querySelector(".sort-pop");
      if (old) { old.__close(); return; }
      if (openPop) openPop.__close();
      var pop = el('<div class="ms-pop sort-pop"><div class="sort-title">Sort levels <span class="muted">— first level wins, next levels break ties</span></div><div class="sort-levels"></div>' +
        '<div class="ms-actions"><button type="button" data-a="add">+ Add level</button><button type="button" data-a="clear">Clear sort</button></div></div>');
      pop.addEventListener("click", function (e) { e.stopPropagation(); });
      var levels = pop.querySelector(".sort-levels");
      function colOptions(sel) {
        return opts.columns.map(function (c, i) { return '<option value="' + i + '"' + (i === sel ? " selected" : "") + ">" + esc(c.label) + "</option>"; }).join("");
      }
      function paint() {
        if (!state.sorts.length) { levels.innerHTML = '<div class="muted" style="padding:6px 12px;font-size:12px">No sort applied — add a level.</div>'; return; }
        levels.innerHTML = state.sorts.map(function (s, k) {
          return '<div class="sort-level" data-k="' + k + '"><span class="lvl">' + (k === 0 ? "Sort by" : "Then by") + '</span><select data-f="col">' + colOptions(s.i) +
            '</select><select data-f="dir"><option value="1"' + (s.dir > 0 ? " selected" : "") + '>A → Z / Low → High</option><option value="-1"' + (s.dir < 0 ? " selected" : "") +
            '>Z → A / High → Low</option></select><button type="button" class="x" title="Remove level">×</button></div>';
        }).join("");
        levels.querySelectorAll(".sort-level").forEach(function (row) {
          var k = +row.getAttribute("data-k");
          row.querySelector('[data-f="col"]').addEventListener("change", function (e) { state.sorts[k].i = +e.target.value; draw(); });
          row.querySelector('[data-f="dir"]').addEventListener("change", function (e) { state.sorts[k].dir = +e.target.value; draw(); });
          row.querySelector(".x").addEventListener("click", function () { state.sorts.splice(k, 1); paint(); draw(); });
        });
      }
      pop.querySelector('[data-a="add"]').addEventListener("click", function () {
        var used = state.sorts.map(function (s) { return s.i; }), next = 0;
        while (used.indexOf(next) >= 0 && next < opts.columns.length - 1) next++;
        state.sorts.push({ i: next, dir: 1 }); paint(); draw();
      });
      pop.querySelector('[data-a="clear"]').addEventListener("click", function () { state.sorts = []; paint(); draw(); });
      paint();
      sortWrap.appendChild(pop);
      pop.__close = function () { pop.remove(); openPop = null; };
      openPop = pop;
    }

    function exportCsv(rows) {
      var lines = [opts.columns.map(function (c) { return csvCell(c.label); }).join(",")];
      rows.forEach(function (r) {
        lines.push(opts.columns.map(function (c) { return csvCell(val(c, r)); }).join(","));
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
      var sb = sortWrap.querySelector(".sort-btn");
      sb.textContent = state.sorts.length ? "⇅ Sort (" + state.sorts.length + ")" : "⇅ Sort";
      sb.classList.toggle("on", state.sorts.length > 0);
      var h = '<table class="dt"><thead><tr>';
      opts.columns.forEach(function (c, i) {
        var arrow = "", lvl = -1;
        state.sorts.forEach(function (s, k) { if (s.i === i) { lvl = k; arrow = s.dir > 0 ? "▲" : "▼"; } });
        var badgeN = lvl >= 0 && state.sorts.length > 1 ? '<sup class="sort-n">' + (lvl + 1) + "</sup>" : "";
        h += '<th data-i="' + i + '" class="' + (NUMERIC[c.type] ? "num" : "") + (lvl >= 0 ? " sorted" : "") + '" title="Click to sort · Shift+click to add as another sort level">' +
          esc(c.label) + '<span class="arrow">' + arrow + badgeN + "</span></th>";
      });
      h += "</tr></thead><tbody>";
      if (!rows.length) h += '<tr><td colspan="' + opts.columns.length + '"><div class="empty">' + esc(opts.emptyText || "No rows match the current filters.") + "</div></td></tr>";
      rows.forEach(function (r, ri) {
        var rc = [opts.onRow ? "clickable" : "", opts.rowClass ? opts.rowClass(r) || "" : ""].join(" ").trim();
        h += '<tr data-r="' + ri + '"' + (rc ? ' class="' + rc + '"' : "") + (opts.onRow ? ' title="' + esc(opts.rowTitle || "Click for full details") + '"' : "") + ">";
        opts.columns.forEach(function (c) {
          var cls = [NUMERIC[c.type] ? "num" : "", c.wrap ? "wrap" : "", c.type === "date" || c.nowrap ? "nowrap" : ""];
          if (c.cls) cls.push(c.cls(val(c, r), r) || "");
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
        th.addEventListener("click", function (e) { headerSort(+th.getAttribute("data-i"), e.shiftKey || e.ctrlKey || e.metaKey); });
      });
      if (opts.onRow) box.querySelectorAll("tbody tr[data-r]").forEach(function (tr) {
        tr.addEventListener("click", function (e) { opts.onRow(rows[+tr.getAttribute("data-r")], e); });
      });
    }
    draw();
    return { redraw: function (newRows) { if (newRows) opts.rows = newRows; draw(); } };
  }

  /* ----------------------------- slicers -------------------------------- */
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
      var d = o.display || String;
      btn.textContent = !sel.length ? "All" : sel.length === 1 ? d(sel[0]) : sel.length + " selected";
      btn.title = sel.length ? sel.map(d).join(", ") : "All";
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
          return '<li><label><input type="checkbox" value="' + esc(v) + '"' + (sel.indexOf(v) >= 0 ? " checked" : "") + "><span>" + esc(o.display ? o.display(v) : v) + "</span>" +
            (o.counts ? '<em class="ms-n">' + (o.counts[v] || 0) + "</em>" : "") + "</label></li>";
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
  function eachChart(fn) { charts.forEach(fn); }

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
    // Legend swatches always show the solid series colour, even when some bars are dimmed by a selection.
    var baseLabels = Chart.defaults.plugins.legend.labels.generateLabels;
    Chart.defaults.plugins.legend.labels.generateLabels = function (chart) {
      return baseLabels(chart).map(function (l) {
        var ds = chart.data.datasets[l.datasetIndex], bg = ds && ds.backgroundColor;
        if (ds && ds.fcBorder && !ds.fcIdx) {   // dashed Forecast Plan swatch
          var b0 = Array.isArray(ds.fcBorder) ? ds.fcBorder.filter(function (c) { return String(c).length === 7; })[0] || String(ds.fcBorder[0]).slice(0, 7) : ds.fcBorder;
          l.fillStyle = fcFill(b0); l.strokeStyle = b0; l.lineWidth = 1.5; l.lineDash = [3, 2];
          return l;
        }
        if (Array.isArray(bg)) {
          var solid = bg.filter(function (c) { return typeof c === "string" && c.length === 7; })[0] || String(bg[0]).slice(0, 7);
          l.fillStyle = solid; l.strokeStyle = solid;
        }
        return l;
      });
    };
    Chart.register({ id: "fcDash", afterDatasetDraw: function (chart, args) {
      var ds = chart.data.datasets[args.index];
      if (!ds || !ds.fcBorder || (ds.type && ds.type !== "bar") || args.meta.hidden) return;
      var cx = chart.ctx, horiz = chart.options.indexAxis === "y";
      cx.save(); cx.setLineDash([5, 3]); cx.lineWidth = 1.6;
      args.meta.data.forEach(function (el, i) {
        if (ds.fcIdx && !ds.fcIdx[i]) return;
        var p = el.getProps(["x", "y", "base", "width", "height"], true);
        cx.strokeStyle = Array.isArray(ds.fcBorder) ? ds.fcBorder[i] : ds.fcBorder;
        if (horiz) cx.strokeRect(Math.min(p.x, p.base) + 0.8, p.y - p.height / 2 + 0.8, Math.abs(p.x - p.base) - 1.6, p.height - 1.6);
        else cx.strokeRect(p.x - p.width / 2 + 0.8, Math.min(p.y, p.base) + 0.8, p.width - 1.6, Math.abs(p.base - p.y) - 1.6);
      });
      cx.restore();
    } });
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
    return function (v) {
      var m = window.innerWidth < 600 ? Math.min(n, 16) : window.innerWidth < 900 ? Math.min(n, 24) : n; // narrower labels on phones
      var s = String(this.getLabelForValue(v)); return s.length > m ? s.slice(0, m - 1) + "…" : s;
    };
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

  /** Hex colour at reduced opacity — used to dim the bars that are not selected. */
  function fade(hex) { return hex.length === 7 ? hex + "40" : hex; }
  /* Forecast Plan (invoicing plan) is always drawn dashed: dashed lines, and bars with a light fill and a
     dashed outline (see the fcDash plugin). `fcIdx` limits the dashed look to some bars of a dataset. */
  function fcFill(c) { c = String(c); return c.slice(0, 7) + (c.length > 7 ? "14" : "40"); }
  function fcStyle(ds, fcIdx) {
    var bg = ds.backgroundColor, isArr = Array.isArray(bg);
    ds.fcBorder = bg; ds.fcIdx = fcIdx || null;
    ds.backgroundColor = isArr ? bg.map(function (c, i) { return !fcIdx || fcIdx[i] ? fcFill(c) : c; }) : fcFill(bg);
    return ds;
  }
  function fcBar(label, data, color, extra) { return fcStyle(barDs(label, data, color, extra)); }
  /** Per-bar colours: selected (or all, when nothing is selected) keep `color`, others fade. */
  function hl(color, keys, selected) {
    if (!selected || !selected.length) return color;
    return keys.map(function (k) { return selected.indexOf(k) >= 0 ? color : fade(color); });
  }
  /** Make a chart clickable: onPick(index, nativeEvent, datasetIndex). Adds a pointer cursor over marks. */
  function clickable(cfg, onPick) {
    cfg.options = cfg.options || {};
    cfg.options.onClick = function (evt, els) {
      if (!els.length) return;
      onPick(els[0].index, evt.native || evt, els[0].datasetIndex);
    };
    cfg.options.onHover = function (evt, els) {
      var t = evt.native && evt.native.target; if (t) t.style.cursor = els.length ? "pointer" : "default";
    };
    // pick the bar under the pointer, not the whole index column
    cfg.options.interaction = Object.assign({ mode: "nearest", intersect: true, axis: cfg.options.indexAxis === "y" ? "y" : "x" }, cfg.options.interaction || {});
    return cfg;
  }

  function moneyTooltip() {
    return { callbacks: { label: function (ctx) { return " " + ctx.dataset.label + ": " + fmt.money(ctx.parsed[ctx.chart.options.indexAxis === "y" ? "x" : "y"]) + " SAR"; } } };
  }
  function pctTooltip() {
    return { callbacks: { label: function (ctx) { return " " + ctx.dataset.label + ": " + fmt.pct(ctx.parsed[ctx.chart.options.indexAxis === "y" ? "x" : "y"]); } } };
  }

  /* ----------------------------- modal / toast -------------------------- */
  function modal(title, bodyHtml, wide) {
    var m = el('<div class="modal-back" role="dialog" aria-modal="true"><div class="modal' + (wide ? " wide" : "") + '"><header><h3>' + esc(title) +
      '</h3><button type="button" aria-label="Close">×</button></header><div class="body">' + bodyHtml + "</div></div></div>");
    function close() { m.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    m.addEventListener("click", function (e) { if (e.target === m) close(); });
    m.querySelector("header button").addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    document.body.appendChild(m);
    var body = m.querySelector(".body");
    body.close = close;
    return body;
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

  var EOT_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  /* "31-Dec-2025", "31-July-2026", "6 April 2027" → "2025-12-31" */
  function txtDate(s) {
    var m = /(\d{1,2})[\s\-\/]+([A-Za-z]{3,9})\.?[\s\-\/,]+(\d{4})/.exec(s || ""); if (!m) return "";
    var mi = EOT_MON.indexOf(m[2].slice(0, 1).toUpperCase() + m[2].slice(1, 3).toLowerCase()); if (mi < 0) return "";
    return m[3] + "-" + (mi < 9 ? "0" : "") + (mi + 1) + "-" + (+m[1] < 10 ? "0" : "") + +m[1];
  }
  /* Extension of Time per project: approved schedule-impact CRs from the card change log (13.1), plus an EOT that is
     still in process (an open schedule CR, or "EOT until <date>" in the weekly report's delay reason).
     card: the Project_Cards row; weekly: that project's weekly rows; dated: keep only extensions with a known end date
     → null, or { days, until, approved, pending: { days, until } } */
  function eot(card, weekly, dated) {
    card = card || {}; var res = { days: 0, until: "", approved: 0, pending: null };
    function until(r) { var t = [r["Comment / Notes"], r["Change Request (Description)"], r["Change Request Title"]].join(" "); return txtDate((/unti?ll?\s+(.+)/i.exec(t) || [])[1]); }
    (card.Changes || []).forEach(function (r) {
      var days = toNum(r["Schedule Impact Duration (Calendar Days)"]) || 0;
      if (!/^y/i.test(r["Schedule Impact?"] || "") && !days && !/\beot\b|extension of time/i.test(r["Change Request Title"] || "")) return;
      var st = r["CR Status"] || "", u = until(r);
      if (/reject|cancel|withdraw/i.test(st)) return;
      if (/approv|closed|signed/i.test(st)) { res.approved++; res.days += days; if (u > res.until) res.until = u; }
      else res.pending = { days: days, until: u > ((res.pending || {}).until || "") ? u : (res.pending || {}).until || "" };
    });
    // "EOT ... until <date>" written in the weekly delay reason, else in the newest PM feedback entry that mentions one
    function textEot(t) { var m = /\beot\d?\b[^.]*?\bunti?ll?\s+([^.;]+)/i.exec(t || ""); return m ? txtDate(m[1]) : ""; }
    if (!res.pending) (weekly || []).forEach(function (w) { var u = textEot(w["Reason for Delays"]); if (u && u > res.until) res.pending = { days: 0, until: u }; });
    if (!res.pending && !res.approved) { var u = textEot((card.Baseline || {}).PMFeedback); if (u) res.pending = { days: 0, until: u }; }
    if (res.pending && res.pending.until && res.until && res.pending.until <= res.until) res.pending = null;   // already covered by an approved EOT
    if (dated) { if (!res.until) { res.approved = 0; res.days = 0; } if (res.pending && !res.pending.until) res.pending = null; }
    return res.approved || res.pending ? res : null;
  }

  /* EOT status for one project, explained from the data:
     · completed, or BL finish not reached and forecast on time      → N/A
     · approved EOT (date from the change log, else BL finish + approved days ≈) still running → "Approved until …",
       flagged when the forecast already goes beyond it
     · approved EOT whose date has passed while the work is < 100 %   → expired
     · EOT in process (open CR, delay reason or PM feedback "EOT until …") → "In process until …"
     · BL finish passed, < 100 %, nothing recorded                    → "Not recorded – BL passed … ; forecast …"
     · BL finish still ahead but forecast later                       → "Likely needed"
     w: the latest weekly row; rd: report date (yyyy-mm-dd); f: date formatter.
     → { kind, text, brief, cause, cell, color }   (brief = one short line next to the BL / forecast dates, cell = a table column) */
  function eotStatus(card, w, rd, f) {
    card = card || {}; w = w || {};
    var be = w["End Date Baseline"] || "", fe = w["End Date (Forecast/Actual)"] || "", act = toNum(w["Actual (%) - Cumulative"]);
    var done = act != null && act >= 0.999, e = eot(card, [w]), cause = String(w["Reason for Delays"] || (card.Baseline || {}).DelayReason || "").replace(/\s+/g, " ").trim();
    var AMB = "C55A11", RED = "C00000";
    function days(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 864e5); }
    function fd(d) { return f(d); }
    function pc() { return act == null ? "" : (Math.round(act * 1000) / 10) + "% done"; }
    function addD(d, n) { var t = new Date(Date.parse(d) + n * 864e5); return t.toISOString().slice(0, 10); }
    var out = function (kind, text, cell, color, brief) { return { kind: kind, text: text, brief: brief || text, cause: cause, cell: cell, color: color || null }; };
    if (done) return out("done", "N/A", "N/A");
    var fcLate = fe && be && fe > be, fcTxt = fe ? "forecast " + fd(fe) + (fcLate ? " (+" + days(be, fe) + " d vs BL)" : "") : "no forecast date";
    if (e && e.approved) {
      var until = e.until, est = false;
      if (!until && e.days && be) { until = addD(be, e.days); est = true; }
      if (until) {
        var ut = (est ? "≈ " : "") + fd(until), dd = e.days ? " (+" + e.days + " days)" : "";
        if (rd && until < rd) return e.pending && e.pending.until
          ? out("expired", "Approved EOT ended " + ut + "; next EOT in process until " + fd(e.pending.until), "In process", AMB)
          : out("expired", "Approved EOT ended " + ut + " at " + pc() + "; " + fcTxt.replace(/ \(\+\d+ d vs BL\)/, ""), ut, RED,
            "Expired " + ut);
        if (fe && fe > until) return out("exceeds", "Approved until " + ut + dd + "; forecast " + fd(fe) + " is " + days(until, fe) + " d later – further EOT needed", ut, AMB,
          "Until " + ut + "; fcst +" + days(until, fe) + " d – more needed");
        return out("approved", "Approved until " + ut + dd, (est ? "≈" : "") + fd(until));
      }
      return out("approved", "Approved +" + e.days + " days", "N/A");
    }
    if (e && e.pending) {
      if (e.pending.until) return out("pending", "In process until " + fd(e.pending.until) + (fe && fe > e.pending.until ? "; forecast " + fd(fe) + " is later" : ""), "In process", AMB);
      return out("pending", "EOT request in process (no date yet); " + fcTxt, "In process", AMB);
    }
    if (be && rd && rd > be) return out("required", "Not recorded – BL finish " + fd(be) + " passed " + days(be, rd) + " d ago at " + pc() + "; " +
      (fe && fe >= rd ? fcTxt : "forecast not updated") + " – no EOT recorded yet", "N/A", null,
      "Not recorded – BL passed" + (fe && fe >= rd ? ", fcst +" + days(be, fe) + " d" : ", fcst not updated"));
    if (fcLate) return out("likely", "Likely needed – forecast " + fd(fe) + " is " + days(be, fe) + " d after BL finish " + fd(be), "N/A", null,
      "Likely needed – fcst +" + days(be, fe) + " d vs BL");
    return out("none", "N/A", "N/A");
  }

  /* Horizontal scroll bar ("ruler") above every wide table / chart box: it mirrors the box's own bottom bar, so a wide
     table can be moved left / right without scrolling down to its end. Shown only while the content is wider than the box. */
  var HBAR_SEL = ".table-wrap, .gantt, .sm-wrap, .cl-wrap, .cu-list, .cu-out";
  function hbar(box) {
    if (!box || box._hbar || !box.parentNode) return;
    var bar = el('<div class="hbar" aria-hidden="true"><div></div></div>'), lock = false, raf = 0;
    box._hbar = bar; box.parentNode.insertBefore(bar, box);
    function upd() {
      raf = 0; if (!bar.isConnected) return;
      var wide = box.scrollWidth > box.clientWidth + 2;
      bar.style.display = wide ? "" : "none";
      if (wide) { bar.firstChild.style.width = box.scrollWidth + "px"; bar.style.width = box.clientWidth + "px"; if (bar.scrollLeft !== box.scrollLeft) bar.scrollLeft = box.scrollLeft; }
    }
    function later() { if (!raf) raf = requestAnimationFrame(upd); }
    bar.addEventListener("scroll", function () { if (lock) { lock = false; return; } lock = true; box.scrollLeft = bar.scrollLeft; });
    box.addEventListener("scroll", function () { if (lock) { lock = false; return; } lock = true; bar.scrollLeft = box.scrollLeft; });
    if (window.ResizeObserver) { var ro = new ResizeObserver(later); ro.observe(box); if (box.firstElementChild) ro.observe(box.firstElementChild); }
    if (window.MutationObserver) new MutationObserver(function () { later(); if (window.ResizeObserver && box.firstElementChild) try { ro.observe(box.firstElementChild); } catch (e) { /* */ } }).observe(box, { childList: true, subtree: true });
    window.addEventListener("resize", later);
    later(); setTimeout(upd, 300);
  }
  function hbars(root) { Array.prototype.forEach.call((root || document).querySelectorAll(HBAR_SEL), hbar); }

  window.UI = {
    hbar: hbar, hbars: hbars,
    C: C, SERIES: SERIES, fmt: fmt, esc: esc, el: el, uniq: uniq, sum: sum, toNum: toNum, isoWeek: isoWeek,
    badge: badge, statusClass: statusClass, tile: tile, info: info, panel: panel, meter: meter,
    table: table, multiSelect: multiSelect, select: select,
    chart: chart, destroyCharts: destroyCharts, eachChart: eachChart, barDs: barDs, lineDs: lineDs, fcBar: fcBar, fcStyle: fcStyle,
    moneyAxis: moneyAxis, shortLabel: shortLabel, fade: fade, hl: hl, clickable: clickable, pctAxis: pctAxis, catAxis: catAxis, wrapLabel: wrapLabel,
    moneyTooltip: moneyTooltip, pctTooltip: pctTooltip,
    modal: modal, recordModal: recordModal, toast: toast, eot: eot, eotStatus: eotStatus
  };
})();

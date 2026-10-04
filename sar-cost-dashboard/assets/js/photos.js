/**
 * Progress photos from the per-project weekly report workbooks.
 *
 * Input: a .rar (WinRAR) or .zip archive of the weekly report files, or the .xlsx files themselves.
 * Each workbook's "Progress Photo" sheet is read: pictures floating on the sheet (xl/drawings) and pictures placed
 * in cells (xl/richData), in sheet order (top to bottom, left to right). The sheet's banner / logo on the first
 * small images (logos, icons) are skipped. Photos are scaled down and kept in this browser only (IndexedDB key "photos"),
 * keyed by the workbook file name (= weekly report Source.Name) and by the project code in that name.
 */
(function () {
  "use strict";
  var KEY = "photos", MAX_SIDE = 1280, QUALITY = 0.82, MIN_BYTES = 5000, MIN_W = 240, MIN_H = 160, PER_PROJECT = 8;
  var NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    NS_REL = "http://schemas.openxmlformats.org/package/2006/relationships",
    NS_XDR = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
    NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";

  function base() { var s = document.querySelector('script[src*="assets/js/photos.js"]'); return s ? s.getAttribute("src").replace(/assets\/js\/photos\.js.*$/, "") : ""; }
  var unrarReady = null;
  function loadUnrar() {
    if (unrarReady) return unrarReady;
    unrarReady = new Promise(function (res, rej) {
      if (window.SARUnrar) return res();
      var s = document.createElement("script"); s.src = base() + "assets/vendor/unrar.min.js"; s.onload = res;
      s.onerror = function () { unrarReady = null; rej(new Error("RAR reader could not be loaded")); };
      document.head.appendChild(s);
    }).then(function () { return fetch(base() + "assets/vendor/unrar.wasm"); })
      .then(function (r) { if (!r.ok) throw new Error("RAR reader could not be loaded"); return r.arrayBuffer(); });
    return unrarReady;
  }

  /* archive → [{ name, buffer }] of the Excel files inside (folders ignored) */
  function isRar(b) { var u = new Uint8Array(b, 0, 4); return u[0] === 0x52 && u[1] === 0x61 && u[2] === 0x72 && u[3] === 0x21; }
  function isZip(b) { var u = new Uint8Array(b, 0, 2); return u[0] === 0x50 && u[1] === 0x4b; }
  function xlsxName(n) { return /\.xls[xm]$/i.test(n) && !/(^|\/)~\$/.test(n); }
  function leaf(n) { return String(n).replace(/\\/g, "/").split("/").pop(); }
  function unpack(buf, name) {
    if (isRar(buf)) return loadUnrar().then(function (wasm) {
      return window.SARUnrar.createExtractorFromData({ data: buf, wasmBinary: wasm }).then(function (ex) {
        var out = [], r = ex.extract({ files: function (h) { return !h.flags.directory && xlsxName(h.name); } });
        for (var it = r.files[Symbol.iterator](), s = it.next(); !s.done; s = it.next()) {
          var f = s.value; if (f.extraction) out.push({ name: leaf(f.fileHeader.name), buffer: f.extraction.buffer.slice(f.extraction.byteOffset, f.extraction.byteOffset + f.extraction.byteLength) });
        }
        return out;
      });
    });
    if (!isZip(buf)) return Promise.reject(new Error(name + ": not a RAR, ZIP or Excel file"));
    return JSZip.loadAsync(buf).then(function (z) {
      if (z.file("[Content_Types].xml") && z.file("xl/workbook.xml")) return [{ name: leaf(name), buffer: buf, zip: z }];   // an Excel file itself
      var names = Object.keys(z.files).filter(function (n) { return !z.files[n].dir && xlsxName(n); });
      return Promise.all(names.map(function (n) { return z.file(n).async("arraybuffer").then(function (b) { return { name: leaf(n), buffer: b }; }); }));
    });
  }

  /* ------------------------------------------------------------ workbook → photos */
  function parse(s) { return new DOMParser().parseFromString(s, "application/xml"); }
  function dirOf(p) { return p.slice(0, p.lastIndexOf("/") + 1); }
  function join(from, t) {
    if (t.charAt(0) === "/") return t.slice(1);
    var a = (dirOf(from) + t).split("/"), o = [];
    a.forEach(function (x) { if (x === "..") o.pop(); else if (x !== ".") o.push(x); });
    return o.join("/");
  }
  function relsPath(p) { return dirOf(p) + "_rels/" + p.slice(p.lastIndexOf("/") + 1) + ".rels"; }
  function readXml(z, p) { var f = z.file(p); return f ? f.async("string").then(parse) : Promise.resolve(null); }
  function rels(z, part) {
    return readXml(z, relsPath(part)).then(function (d) {
      var m = {}; if (!d) return m;
      Array.prototype.forEach.call(d.getElementsByTagNameNS(NS_REL, "Relationship"), function (e) {
        m[e.getAttribute("Id")] = { type: e.getAttribute("Type") || "", target: e.getAttribute("TargetMode") === "External" ? null : join(part, e.getAttribute("Target")) };
      });
      return m;
    });
  }
  function kid(el, ns, n) { return el && el.getElementsByTagNameNS(ns, n)[0]; }
  function num(el) { return el ? +el.textContent || 0 : 0; }
  function cellRC(ref) { var m = /^([A-Z]+)(\d+)$/.exec(ref || ""); if (!m) return null; var c = 0; for (var i = 0; i < m[1].length; i++) c = c * 26 + m[1].charCodeAt(i) - 64; return { row: +m[2] - 1, col: c - 1 }; }

  /* photo sheets: "Progress Photo" first, then any other sheet named like it ("Progress Photo-", "Progress Photos") */
  function photoSheets(z) {
    return readXml(z, "xl/workbook.xml").then(function (wb) {
      if (!wb) return [];
      return rels(z, "xl/workbook.xml").then(function (wr) {
        var list = Array.prototype.map.call(wb.getElementsByTagNameNS(NS_MAIN, "sheet"), function (s) {
          return { name: s.getAttribute("name"), path: (wr[s.getAttributeNS(NS_R, "id")] || {}).target };
        }).filter(function (s) { return s.path && /^\s*progress\s*photo/i.test(s.name); });
        return list.sort(function (a, b) { return (/^\s*progress\s*photos?\s*$/i.test(b.name) ? 1 : 0) - (/^\s*progress\s*photos?\s*$/i.test(a.name) ? 1 : 0); });
      });
    });
  }
  /* pictures drawn on the sheet: [{ row, col, media }] */
  function drawingPics(z, sheetPath) {
    return rels(z, sheetPath).then(function (sr) {
      var drs = Object.keys(sr).map(function (k) { return sr[k]; }).filter(function (r) { return /\/drawing$/.test(r.type) && r.target; });
      return Promise.all(drs.map(function (dr) {
        return Promise.all([readXml(z, dr.target), rels(z, dr.target)]).then(function (x) {
          var d = x[0], rr = x[1], out = []; if (!d) return out;
          Array.prototype.forEach.call(d.documentElement.childNodes, function (a) {
            if (a.nodeType !== 1 || a.namespaceURI !== NS_XDR) return;
            var from = kid(a, NS_XDR, "from"), off = kid(a, NS_XDR, "pos");
            Array.prototype.forEach.call(a.getElementsByTagNameNS(NS_XDR, "pic"), function (p) {
              var blip = kid(p, NS_A, "blip"), id = blip && (blip.getAttributeNS(NS_R, "embed") || blip.getAttribute("r:embed"));
              if (!id || !rr[id] || !rr[id].target) return;
              out.push({ row: from ? num(kid(from, NS_XDR, "row")) : off ? +off.getAttribute("y") / 190500 : 0,
                col: from ? num(kid(from, NS_XDR, "col")) : off ? +off.getAttribute("x") / 609600 : 0, media: rr[id].target });
            });
          });
          return out;
        });
      })).then(function (a) { return [].concat.apply([], a); });
    });
  }
  /* pictures placed in cells (Excel "Place in Cell"): cell vm → value metadata → rich value → image relationship */
  function cellPics(z, sheetPath) {
    if (!z.file("xl/metadata.xml") || !z.file("xl/richData/rdrichvalue.xml")) return Promise.resolve([]);
    return Promise.all([z.file(sheetPath).async("string"), readXml(z, "xl/metadata.xml"), readXml(z, "xl/richData/rdrichvalue.xml"),
      readXml(z, "xl/richData/richValueRel.xml"), rels(z, "xl/richData/richValueRel.xml"), readXml(z, "xl/richData/rdrichvaluestructure.xml")]).then(function (x) {
      var sheet = x[0], md = x[1], rv = x[2], rvr = x[3], rvrRels = x[4], st = x[5];
      if (!md || !rv || !rvr) return [];
      var types = Array.prototype.map.call(md.getElementsByTagNameNS(NS_MAIN, "metadataType"), function (t) { return t.getAttribute("name"); });
      var fut = Array.prototype.filter.call(md.getElementsByTagNameNS(NS_MAIN, "futureMetadata"), function (f) { return f.getAttribute("name") === "XLRICHVALUE"; })[0];
      var rvbs = fut ? Array.prototype.map.call(fut.getElementsByTagNameNS(NS_MAIN, "bk"), function (bk) {
        var b = bk.getElementsByTagNameNS("*", "rvb")[0]; return b ? +b.getAttribute("i") : null; }) : [];
      var vmd = kid(md, NS_MAIN, "valueMetadata"), vms = vmd ? Array.prototype.map.call(vmd.getElementsByTagNameNS(NS_MAIN, "bk"), function (bk) {
        var rc = kid(bk, NS_MAIN, "rc"); return rc && types[+rc.getAttribute("t") - 1] === "XLRICHVALUE" ? rvbs[+rc.getAttribute("v")] : null; }) : [];
      var structs = st ? Array.prototype.map.call(st.getElementsByTagNameNS("*", "s"), function (s) {
        return Array.prototype.map.call(s.getElementsByTagNameNS("*", "k"), function (k) { return k.getAttribute("n"); }).indexOf("_rvRel:LocalImageIdentifier"); }) : [];
      var rvs = Array.prototype.map.call(rv.documentElement.getElementsByTagNameNS("*", "rv"), function (r) {
        var at = structs[+r.getAttribute("s")]; at = at == null || at < 0 ? 0 : at;
        var v = r.getElementsByTagNameNS("*", "v")[at]; return v ? +v.textContent : null; });
      var relIds = Array.prototype.map.call(rvr.documentElement.getElementsByTagNameNS("*", "rel"), function (r) { return r.getAttributeNS(NS_R, "id") || r.getAttribute("r:id"); });
      var out = [], re = /<c\b[^>]*?\br="([A-Z]+\d+)"[^>]*?\bvm="(\d+)"|<c\b[^>]*?\bvm="(\d+)"[^>]*?\br="([A-Z]+\d+)"/g, m;
      while ((m = re.exec(sheet))) {
        var ref = m[1] || m[4], vm = +(m[2] || m[3]), i = vms[vm - 1], img = i == null ? null : rvs[i], rel = img == null ? null : rvrRels[relIds[img]];
        var rc = cellRC(ref); if (rel && rel.target && rc) out.push({ row: rc.row, col: rc.col, media: rel.target });
      }
      return out;
    });
  }
  /* one picture → scaled JPEG */
  function shrink(bytes, type) {
    var blob = new Blob([bytes], { type: type });
    if (!window.createImageBitmap) return Promise.resolve(null);
    return createImageBitmap(blob).then(function (bm) {
      if (bm.width < MIN_W || bm.height < MIN_H) { if (bm.close) bm.close(); return null; }   // banner logo / icon, not a photo
      var k = Math.min(1, MAX_SIDE / Math.max(bm.width, bm.height)), w = Math.max(1, Math.round(bm.width * k)), h = Math.max(1, Math.round(bm.height * k));
      var c = document.createElement("canvas"); c.width = w; c.height = h;
      var g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.drawImage(bm, 0, 0, w, h); if (bm.close) bm.close();
      return new Promise(function (res) { c.toBlob(function (b) { res(b); }, "image/jpeg", QUALITY); }).then(function (b) {
        return b ? b.arrayBuffer().then(function (data) { return { type: "image/jpeg", data: data, w: w, h: h }; }) : null;
      });
    }).catch(function () { return null; });   // EMF / WMF / unreadable → skipped
  }
  var MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", bmp: "image/bmp", webp: "image/webp", tif: "image/tiff", tiff: "image/tiff" };
  function workbookPhotos(file) {
    var zp = file.zip ? Promise.resolve(file.zip) : JSZip.loadAsync(file.buffer);
    return zp.then(function (z) {
      return photoSheets(z).then(function (sheets) {
        var chain = Promise.resolve([]), sheetName = "";
        sheets.forEach(function (s) {
          chain = chain.then(function (got) {
            if (got.length) return got;
            return Promise.all([drawingPics(z, s.path), cellPics(z, s.path)]).then(function (x) {
              var seen = {}, pics = x[0].concat(x[1]).filter(function (p) {
                if (seen[p.media]) return false;   // the same picture placed twice
                var ext = p.media.split(".").pop().toLowerCase(); if (!MIME[ext]) return false;
                seen[p.media] = 1; return true;
              }).sort(function (a, b) { return a.row - b.row || a.col - b.col; });
              sheetName = s.name;
              var pick = Promise.resolve([]);
              pics.forEach(function (p) {
                pick = pick.then(function (acc) {
                  if (acc.length >= PER_PROJECT) return acc;
                  var f = z.file(p.media); if (!f) return acc;
                  return f.async("uint8array").then(function (b) {
                    if (b.length < MIN_BYTES) return acc;
                    return shrink(b, MIME[p.media.split(".").pop().toLowerCase()]).then(function (ph) { if (ph) acc.push(ph); return acc; });
                  });
                });
              });
              return pick;
            });
          });
        });
        return chain.then(function (photos) { return { file: file.name, code: codeOf(file.name), sheet: sheetName, found: sheets.length > 0, photos: photos }; });
      });
    });
  }
  /* "NSR_6200_Name.xlsx", "NSR-0745-Name.xlsx", "NSR_N003_Name.xlsx" → project code */
  function codeOf(name) {
    var m = /^[A-Za-z]+[\s_-]+([A-Za-z]?\d{3,4}[A-Za-z]?)(?=[\s_.-])/.exec(name) || /(?:^|[\s_-])([A-Za-z]?\d{3,4}[A-Za-z]?)(?=[\s_.-])/.exec(name);
    return m ? m[1].toUpperCase() : null;
  }

  /* ------------------------------------------------------------ store */
  function load() { return window.SARStore ? SARStore.get(KEY).then(function (x) { return x || null; }) : Promise.resolve(null); }
  /**
   * Import archives / workbooks. Projects found replace their previous photos; others are kept.
   * log(line) gets progress lines. Resolves { projects: n, photos: n }.
   */
  function importFiles(files, log) {
    log = log || function () {};
    var results = [], chain = Promise.resolve();
    files.forEach(function (f) {
      chain = chain.then(function () {
        log("Reading " + f.name + " …");
        return (f.arrayBuffer ? f.arrayBuffer() : Promise.resolve(f.buffer)).then(function (buf) { return unpack(buf, f.name); }).then(function (books) {
          if (!books.length) { log("  ✗ no Excel files inside"); return; }
          var c = Promise.resolve();
          books.forEach(function (b) {
            c = c.then(function () { return workbookPhotos(b); }).then(function (r) {
              results.push(r);
              log("  " + (r.photos.length ? "✓ " : r.found ? "! " : "– ") + r.file + (r.code ? " → " + r.code : "") + ": " +
                (r.photos.length ? r.photos.length + " photo" + (r.photos.length === 1 ? "" : "s") : r.found ? "no photos in “" + r.sheet + "”" : "no Progress Photo sheet"));
            }, function (e) { log("  ✗ " + b.name + ": " + e.message); });
          });
          return c;
        }).catch(function (e) { log("  ✗ " + e.message); });
      });
    });
    return chain.then(function () {
      var got = results.filter(function (r) { return r.photos.length; });
      if (!got.length) return { projects: 0, photos: 0 };
      return load().then(function (st) {
        st = st || { projects: {} };
        got.forEach(function (r) { st.projects[r.file] = { file: r.file, code: r.code, sheet: r.sheet, importedAt: new Date().toISOString(), photos: r.photos }; });
        st.updatedAt = new Date().toISOString();
        return SARStore.set(KEY, st).then(function () {
          return { projects: got.length, photos: got.reduce(function (s, r) { return s + r.photos.length; }, 0) };
        });
      });
    });
  }
  /* photos of a project: by its weekly report file name (Source.Name), else its code, else its base code ("6203A" → "6203") */
  function forProject(st, sourceName, code) {
    if (!st || !st.projects) return [];
    var p = st.projects, k;
    if (sourceName && p[sourceName]) return p[sourceName].photos;
    var c = String(code || "").toUpperCase(), b = c.replace(/[A-Z]$/, "");
    for (k in p) if (p[k].code === c) return p[k].photos;
    for (k in p) if (b && p[k].code === b) return p[k].photos;
    return [];
  }
  function clear() { return window.SARStore ? SARStore.del(KEY) : Promise.resolve(); }

  window.SARPhotos = { importFiles: importFiles, load: load, forProject: forProject, clear: clear, codeOf: codeOf, isArchiveName: function (n) { return /\.(rar|zip)$/i.test(n); } };
})();

/*
 * Minimal OOXML (PowerPoint) template engine — runs in the browser with JSZip + DOMParser.
 * It edits an existing .pptx in place so every slide keeps the template's exact formatting:
 *   - clone / delete slides (charts are cloned with their embedded workbooks; notes are dropped from clones)
 *   - replace text paragraph by paragraph, re-using each paragraph's own run formatting
 *   - fill tables (cell text, fill colour, cloning rows or row blocks)
 *   - rewrite chart data (cached values + the embedded Excel workbook, so "Edit Data" matches)
 */
(function () {
  "use strict";
  var NS = {
    p: "http://schemas.openxmlformats.org/presentationml/2006/main",
    a: "http://schemas.openxmlformats.org/drawingml/2006/main",
    r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    c: "http://schemas.openxmlformats.org/drawingml/2006/chart",
    rel: "http://schemas.openxmlformats.org/package/2006/relationships",
    ct: "http://schemas.openxmlformats.org/package/2006/content-types"
  };
  var REL = {
    slide: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide",
    notes: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide",
    chart: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart",
    image: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"
  };
  var CT_SLIDE = "application/vnd.openxmlformats-officedocument.presentationml.slide+xml";
  var XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';

  function dirOf(p) { return p.slice(0, p.lastIndexOf("/")); }
  function relsOf(p) { return dirOf(p) + "/_rels/" + p.slice(p.lastIndexOf("/") + 1) + ".rels"; }
  function resolve(base, target) {
    if (target.charAt(0) === "/") return target.slice(1);
    var parts = dirOf(base).split("/");
    target.split("/").forEach(function (s) { if (s === "..") parts.pop(); else if (s !== ".") parts.push(s); });
    return parts.join("/");
  }
  function relTarget(from, to) {               // relative path from part `from` to part `to`
    var a = dirOf(from).split("/"), b = to.split("/"), i = 0;
    while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
    var up = []; for (var k = i; k < a.length; k++) up.push("..");
    return up.concat(b.slice(i)).join("/");
  }

  /* ----------------------------------------------------------------------- package */
  function Pkg(zip) { this.zip = zip; this.docs = {}; this.raw = {}; }
  Pkg.open = function (buffer) {
    return JSZip.loadAsync(buffer).then(function (zip) {
      var pkg = new Pkg(zip), jobs = [];
      zip.forEach(function (path, f) { if (!f.dir && /\.(xml|rels)$/i.test(path)) jobs.push(f.async("string").then(function (s) { pkg.raw[path] = s; })); });
      return Promise.all(jobs).then(function () { return pkg; });
    });
  };
  Pkg.prototype.has = function (path) { return !!(this.docs[path] || this.raw[path] != null || this.zip.file(path)); };
  Pkg.prototype.xml = function (path) {
    if (this.docs[path]) return this.docs[path];
    var s = this.raw[path];
    if (s == null) throw new Error("Missing part " + path);
    var d = new DOMParser().parseFromString(s, "application/xml");
    if (d.getElementsByTagName("parsererror").length) throw new Error("Cannot parse " + path);
    this.docs[path] = d; return d;
  };
  Pkg.prototype.setRaw = function (path, s) { delete this.docs[path]; this.raw[path] = s; };
  Pkg.prototype.remove = function (path) { delete this.docs[path]; delete this.raw[path]; this.zip.remove(path); };
  Pkg.prototype.finish = function () {
    var self = this, ser = new XMLSerializer();
    Object.keys(this.docs).forEach(function (p) { self.raw[p] = XML_DECL + ser.serializeToString(self.docs[p]).replace(/^<\?xml[^>]*>\s*/, ""); });
    Object.keys(this.raw).forEach(function (p) { self.zip.file(p, self.raw[p]); });
    return this.zip.generateAsync({ type: "blob", compression: "DEFLATE", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
  };
  /* relationships of a part: [{ id, type, target (absolute path), mode, el }] */
  Pkg.prototype.rels = function (part) {
    var rp = relsOf(part); if (!this.has(rp)) return [];
    var d = this.xml(rp), out = [];
    Array.prototype.forEach.call(d.getElementsByTagNameNS(NS.rel, "Relationship"), function (el) {
      var ext = el.getAttribute("TargetMode") === "External";
      out.push({ id: el.getAttribute("Id"), type: el.getAttribute("Type"), target: ext ? el.getAttribute("Target") : resolve(part, el.getAttribute("Target")), external: ext, el: el });
    });
    return out;
  };
  Pkg.prototype.addRel = function (part, type, targetPath) {
    var rp = relsOf(part);
    if (!this.has(rp)) this.setRaw(rp, XML_DECL + '<Relationships xmlns="' + NS.rel + '"></Relationships>');
    var d = this.xml(rp), ids = Array.prototype.map.call(d.getElementsByTagNameNS(NS.rel, "Relationship"), function (e) { return +e.getAttribute("Id").replace(/\D/g, "") || 0; });
    var id = "rId" + (Math.max.apply(null, ids.concat([0])) + 1);
    var el = d.createElementNS(NS.rel, "Relationship");
    el.setAttribute("Id", id); el.setAttribute("Type", type); el.setAttribute("Target", relTarget(part, targetPath));
    d.documentElement.appendChild(el);
    return id;
  };
  Pkg.prototype.contentType = function (path) {
    var d = this.xml("[Content_Types].xml"), name = "/" + path, ov = d.getElementsByTagNameNS(NS.ct, "Override");
    for (var i = 0; i < ov.length; i++) if (ov[i].getAttribute("PartName") === name) return ov[i].getAttribute("ContentType");
    return null;
  };
  Pkg.prototype.setOverride = function (path, type) {
    var d = this.xml("[Content_Types].xml"), name = "/" + path, ov = d.getElementsByTagNameNS(NS.ct, "Override");
    for (var i = 0; i < ov.length; i++) if (ov[i].getAttribute("PartName") === name) { ov[i].setAttribute("ContentType", type); return; }
    var el = d.createElementNS(NS.ct, "Override"); el.setAttribute("PartName", name); el.setAttribute("ContentType", type);
    d.documentElement.appendChild(el);
  };
  Pkg.prototype.dropOverride = function (path) {
    var d = this.xml("[Content_Types].xml"), name = "/" + path, ov = d.getElementsByTagNameNS(NS.ct, "Override");
    for (var i = ov.length - 1; i >= 0; i--) if (ov[i].getAttribute("PartName") === name) ov[i].parentNode.removeChild(ov[i]);
  };
  Pkg.prototype.ensureDefault = function (ext, type) {
    var d = this.xml("[Content_Types].xml"), df = d.getElementsByTagNameNS(NS.ct, "Default");
    for (var i = 0; i < df.length; i++) if (df[i].getAttribute("Extension").toLowerCase() === ext) return;
    var el = d.createElementNS(NS.ct, "Default"); el.setAttribute("Extension", ext); el.setAttribute("ContentType", type);
    d.documentElement.insertBefore(el, d.documentElement.firstChild);
  };
  Pkg.prototype.freeName = function (dir, base, ext) {
    for (var n = 1; ; n++) { var p = dir + "/" + base + n + ext; if (!this.has(p)) return p; }
  };
  /* copy a binary/xml part to a new path (xml from the current state) */
  Pkg.prototype.copyPart = function (from, to) {
    var self = this;
    if (this.docs[from] || this.raw[from] != null) { var s = this.docs[from] ? new XMLSerializer().serializeToString(this.docs[from]) : this.raw[from]; this.setRaw(to, s); return Promise.resolve(); }
    return this.zip.file(from).async("uint8array").then(function (b) { self.zip.file(to, b); });
  };

  /* ---------------------------------------------------------------- slides */
  Pkg.prototype.slides = function () {     // ordered slide part paths
    var pres = this.xml("ppt/presentation.xml"), rels = this.rels("ppt/presentation.xml"), byId = {};
    rels.forEach(function (r) { byId[r.id] = r.target; });
    return Array.prototype.map.call(pres.getElementsByTagNameNS(NS.p, "sldId"), function (s) { return byId[s.getAttributeNS(NS.r, "id")]; });
  };
  Pkg.prototype._sldIdEl = function (path) {
    var pres = this.xml("ppt/presentation.xml"), rels = this.rels("ppt/presentation.xml"), rid = null;
    rels.forEach(function (r) { if (r.target === path) rid = r.id; });
    var list = pres.getElementsByTagNameNS(NS.p, "sldId");
    for (var i = 0; i < list.length; i++) if (list[i].getAttributeNS(NS.r, "id") === rid) return list[i];
    return null;
  };
  /**
   * Clone slide `src` (as it is in the ORIGINAL template, captured by snapshot()) and insert it after `after`.
   * Charts get their own copies (chart xml + rels + embedded workbook / style / colour parts). Notes are dropped.
   */
  Pkg.prototype.snapshot = function () {
    var self = this; this.orig = {};
    Object.keys(this.raw).forEach(function (p) { self.orig[p] = self.raw[p]; });
  };
  Pkg.prototype.cloneSlide = function (src, after) {
    var self = this, path = this.freeName("ppt/slides", "slide", ".xml"), jobs = [];
    this.setRaw(path, this.orig[src]);
    var srcRels = this.orig[relsOf(src)];
    var rd = new DOMParser().parseFromString(srcRels, "application/xml");
    Array.prototype.slice.call(rd.getElementsByTagNameNS(NS.rel, "Relationship")).forEach(function (el) {
      var type = el.getAttribute("Type");
      if (type === REL.notes) { el.parentNode.removeChild(el); return; }
      if (type === REL.chart) {
        var chartSrc = resolve(src, el.getAttribute("Target")), chartNew = self.freeName("ppt/charts", "chart", ".xml");
        self.setRaw(chartNew, self.orig[chartSrc] || self.raw[chartSrc]);
        self.setOverride(chartNew, self.contentType(chartSrc));
        var cr = self.orig[relsOf(chartSrc)];
        if (cr) {
          var cd = new DOMParser().parseFromString(cr, "application/xml");
          Array.prototype.forEach.call(cd.getElementsByTagNameNS(NS.rel, "Relationship"), function (ce) {
            if (ce.getAttribute("TargetMode") === "External") return;
            var t = resolve(chartSrc, ce.getAttribute("Target")), dir = dirOf(t), file = t.slice(t.lastIndexOf("/") + 1);
            var m = /^(.*?)(\d*)(\.[^.]+)$/.exec(file), np = self.freeName(dir, m[1] + "_c", m[3]);
            self.zip.file(np, "");                                   // reserve the name
            jobs.push(self.copyPart(t, np));
            var ct = self.contentType(t); if (ct) self.setOverride(np, ct);
            ce.setAttribute("Target", relTarget(chartNew, np));
          });
          self.setRaw(relsOf(chartNew), new XMLSerializer().serializeToString(cd));
        }
        el.setAttribute("Target", relTarget(path, chartNew));
      }
    });
    this.setRaw(relsOf(path), new XMLSerializer().serializeToString(rd));
    this.setOverride(path, CT_SLIDE);
    // register in presentation.xml after `after`
    var rid = this.addRel("ppt/presentation.xml", REL.slide, path);
    var pres = this.xml("ppt/presentation.xml"), lst = pres.getElementsByTagNameNS(NS.p, "sldIdLst")[0];
    var ids = Array.prototype.map.call(lst.getElementsByTagNameNS(NS.p, "sldId"), function (e) { return +e.getAttribute("id"); });
    var el = pres.createElementNS(NS.p, "p:sldId");
    el.setAttribute("id", String(Math.max.apply(null, ids) + 1)); el.setAttributeNS(NS.r, "r:id", rid);
    var ref = this._sldIdEl(after);
    if (ref && ref.nextSibling) lst.insertBefore(el, ref.nextSibling); else lst.appendChild(el);
    return Promise.all(jobs).then(function () { return path; });
  };
  /** Remove a slide with its notes and the chart parts only it uses. */
  Pkg.prototype.deleteSlide = function (path) {
    var self = this, el = this._sldIdEl(path);
    if (el) {
      var rid = el.getAttributeNS(NS.r, "id"); el.parentNode.removeChild(el);
      this.rels("ppt/presentation.xml").forEach(function (r) { if (r.id === rid) r.el.parentNode.removeChild(r.el); });
    }
    this.rels(path).forEach(function (r) {
      if (r.type === REL.notes || r.type === REL.chart) {
        self.rels(r.target).forEach(function (cr) { if (!cr.external && !/slides\/|slideLayouts\/|notesMasters\//.test(cr.target)) { self.remove(cr.target); self.dropOverride(cr.target); } });
        self.remove(relsOf(r.target)); self.remove(r.target); self.dropOverride(r.target);
      }
    });
    this.remove(relsOf(path)); this.remove(path); this.dropOverride(path);
  };
  /** Remove every part no longer reachable through relationships from the package root (after slide deletions). */
  Pkg.prototype.gc = function () {
    var self = this, seen = {};
    function relsFile(part) { return part === "" ? "_rels/.rels" : relsOf(part); }
    var queue = [""];
    while (queue.length) {
      var part = queue.shift(), rf = relsFile(part);
      if (!this.has(rf)) continue;
      seen[rf] = 1;
      var d = this.xml(rf);
      Array.prototype.forEach.call(d.getElementsByTagNameNS(NS.rel, "Relationship"), function (el) {
        if (el.getAttribute("TargetMode") === "External") return;
        var t = part === "" ? el.getAttribute("Target").replace(/^\//, "") : resolve(part, el.getAttribute("Target"));
        if (!seen[t]) { seen[t] = 1; queue.push(t); }
      });
    }
    var files = [];
    this.zip.forEach(function (p, f) { if (!f.dir) files.push(p); });
    Object.keys(this.raw).forEach(function (p) { if (files.indexOf(p) < 0) files.push(p); });
    files.forEach(function (p) {
      if (p === "[Content_Types].xml" || seen[p]) return;
      self.remove(p); self.dropOverride(p);
    });
  };
  /** Point an image relationship of a slide to a new media file. */
  Pkg.prototype.setImage = function (slide, rid, mediaPath) {
    this.rels(slide).forEach(function (r) { if (r.id === rid) r.el.setAttribute("Target", relTarget(slide, mediaPath)); });
  };

  /* ------------------------------------------------------------------ shapes & text */
  function kids(el, ns, name) { return Array.prototype.filter.call(el.childNodes, function (n) { return n.nodeType === 1 && n.namespaceURI === ns && (!name || n.localName === name); }); }
  function all(el, ns, name) { return Array.prototype.slice.call(el.getElementsByTagNameNS(ns, name)); }
  /** Shape (sp / graphicFrame / pic / grpSp / cxnSp) by its cNvPr id. */
  function shape(doc, id) {
    var nv = all(doc, NS.p, "cNvPr");
    for (var i = 0; i < nv.length; i++) if (nv[i].getAttribute("id") === String(id)) return nv[i].parentNode.parentNode;
    return null;
  }
  function shapesByName(doc, re) {
    return all(doc, NS.p, "cNvPr").filter(function (n) { return re.test(n.getAttribute("name") || ""); }).map(function (n) { return n.parentNode.parentNode; });
  }
  function removeEl(el) { if (el && el.parentNode) el.parentNode.removeChild(el); }
  function txBody(el) { return el.getElementsByTagNameNS(NS.p, "txBody")[0] || el.getElementsByTagNameNS(NS.a, "txBody")[0] || null; }
  function setColor(rPr, hex) {
    kids(rPr, NS.a).forEach(function (k) { if (/^(solidFill|gradFill|noFill|pattFill|blipFill|grpFill)$/.test(k.localName)) rPr.removeChild(k); });
    var d = rPr.ownerDocument, sf = d.createElementNS(NS.a, "a:solidFill"), c = d.createElementNS(NS.a, "a:srgbClr");
    c.setAttribute("val", hex); sf.appendChild(c);
    var ln = kids(rPr, NS.a, "ln")[0];
    if (ln) rPr.insertBefore(sf, ln.nextSibling); else rPr.insertBefore(sf, rPr.firstChild);
  }
  /**
   * Replace a text body's paragraphs. items: string | { text, color, bold, size } | array of runs [{...}].
   * Each new paragraph clones the template paragraph `tplIndex` (default: first with a run) incl. its run formatting.
   */
  function setParas(el, items, opt) {
    opt = opt || {};
    var tb = txBody(el); if (!tb) return;
    var ps = kids(tb, NS.a, "p");
    var tpl = ps[opt.tpl != null ? opt.tpl : 0];
    if (opt.tpl == null) for (var i = 0; i < ps.length; i++) if (kids(ps[i], NS.a, "r").length) { tpl = ps[i]; break; }
    var tplRun = tpl && kids(tpl, NS.a, "r")[0];
    if (!tplRun) {                                                 // empty box: build a run from endParaRPr
      var d0 = tb.ownerDocument; tplRun = d0.createElementNS(NS.a, "a:r");
      var epr = tpl && kids(tpl, NS.a, "endParaRPr")[0], rp = d0.createElementNS(NS.a, "a:rPr");
      if (epr) Array.prototype.forEach.call(epr.attributes, function (at) { rp.setAttribute(at.name, at.value); }), Array.prototype.forEach.call(epr.childNodes, function (n) { rp.appendChild(n.cloneNode(true)); });
      tplRun.appendChild(rp); tplRun.appendChild(d0.createElementNS(NS.a, "a:t"));
    }
    ps.forEach(function (p) { tb.removeChild(p); });
    (Array.isArray(items) ? items : [items]).forEach(function (it) {
      var p = tpl.cloneNode(true);
      kids(p, NS.a).forEach(function (k) { if (/^(r|br|fld)$/.test(k.localName)) p.removeChild(k); });
      var end = kids(p, NS.a, "endParaRPr")[0];
      var runs = Array.isArray(it) ? it : [it];
      // a right-to-left template paragraph mirrors brackets and moves leading codes ("[To be filled[", "– 0301Fire"): use LTR for Latin text
      var ppr = kids(p, NS.a, "pPr")[0], txt = runs.map(function (rr) { return rr == null ? "" : typeof rr === "object" ? String(rr.text == null ? "" : rr.text) : String(rr); }).join("");
      if (ppr && ppr.getAttribute("rtl") === "1" && !/[\u0590-\u08FF]/.test(txt)) ppr.setAttribute("rtl", "0");
      runs.forEach(function (rr) {
        if (rr == null) return;
        var o = typeof rr === "object" ? rr : { text: String(rr) };
        var r = (o.tplRun || tplRun).cloneNode(true), rPr = kids(r, NS.a, "rPr")[0], t = kids(r, NS.a, "t")[0];
        if (!rPr) { rPr = r.ownerDocument.createElementNS(NS.a, "a:rPr"); r.insertBefore(rPr, r.firstChild); }
        rPr.removeAttribute("dirty");
        if (o.color) setColor(rPr, o.color);
        if (o.bold != null) rPr.setAttribute("b", o.bold ? "1" : "0");
        if (o.size) rPr.setAttribute("sz", String(Math.round(o.size * 100)));
        t.textContent = o.text == null ? "" : String(o.text);
        if (/^\s|\s$/.test(t.textContent)) t.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
        if (end) p.insertBefore(r, end); else p.appendChild(r);
      });
      tb.appendChild(p);
    });
  }
  /** Set the text of the runs of paragraph `pi` in order (extra runs emptied). */
  function setRuns(el, pi, texts) {
    var tb = txBody(el); if (!tb) return;
    var p = kids(tb, NS.a, "p")[pi]; if (!p) return;
    var rs = kids(p, NS.a, "r");
    rs.forEach(function (r, i) {
      var t = kids(r, NS.a, "t")[0], v = texts[i];
      if (v == null) { if (i >= texts.length) p.removeChild(r); return; }
      var o = typeof v === "object" ? v : { text: String(v) };
      t.textContent = o.text;
      if (o.color) setColor(kids(r, NS.a, "rPr")[0] || r.insertBefore(r.ownerDocument.createElementNS(NS.a, "a:rPr"), r.firstChild), o.color);
    });
  }
  function text(el) { return el ? (el.textContent || "") : ""; }
  /** Shape fill colour (spPr solidFill). */
  function setFill(el, hex, lineHex) {
    var spPr = kids(el, NS.p, "spPr")[0]; if (!spPr) return;
    var d = el.ownerDocument;
    kids(spPr, NS.a).forEach(function (k) { if (/^(solidFill|gradFill|noFill|pattFill)$/.test(k.localName)) spPr.removeChild(k); });
    var sf = d.createElementNS(NS.a, "a:solidFill"), c = d.createElementNS(NS.a, "a:srgbClr"); c.setAttribute("val", hex); sf.appendChild(c);
    var geo = kids(spPr, NS.a, "prstGeom")[0] || kids(spPr, NS.a, "custGeom")[0];
    spPr.insertBefore(sf, geo ? geo.nextSibling : null);
    if (lineHex) { var ln = kids(spPr, NS.a, "ln")[0]; if (ln) { kids(ln, NS.a).forEach(function (k) { if (/Fill$/.test(k.localName)) ln.removeChild(k); }); var lf = d.createElementNS(NS.a, "a:solidFill"), lc = d.createElementNS(NS.a, "a:srgbClr"); lc.setAttribute("val", lineHex); lf.appendChild(lc); ln.insertBefore(lf, ln.firstChild); } }
  }
  function xfrm(el) { return el.getElementsByTagNameNS(NS.a, "xfrm")[0] || el.getElementsByTagNameNS(NS.p, "xfrm")[0]; }
  function pos(el) { var x = xfrm(el); if (!x) return null; var o = kids(x, NS.a, "off")[0], e = kids(x, NS.a, "ext")[0]; return { x: +o.getAttribute("x"), y: +o.getAttribute("y"), w: +e.getAttribute("cx"), h: +e.getAttribute("cy"), xfrm: x }; }
  function move(el, x, y) { var o = kids(xfrm(el), NS.a, "off")[0]; if (x != null) o.setAttribute("x", String(Math.round(x))); if (y != null) o.setAttribute("y", String(Math.round(y))); }

  /* ------------------------------------------------------------------ tables */
  function table(frame) { return frame.getElementsByTagNameNS(NS.a, "tbl")[0]; }
  function rows(tbl) { return kids(tbl, NS.a, "tr"); }
  function cells(tr) { return kids(tr, NS.a, "tc"); }
  function cellText(tc, items, opt) { setParas(tc, items, opt); }
  function cellFill(tc, hex) {
    var pr = kids(tc, NS.a, "tcPr")[0], d = tc.ownerDocument;
    if (!pr) { pr = d.createElementNS(NS.a, "a:tcPr"); tc.appendChild(pr); }
    kids(pr, NS.a).forEach(function (k) { if (/^(solidFill|gradFill|noFill|pattFill|blipFill|grpFill)$/.test(k.localName)) pr.removeChild(k); });
    if (!hex) return;
    var sf = d.createElementNS(NS.a, "a:solidFill"), c = d.createElementNS(NS.a, "a:srgbClr"); c.setAttribute("val", hex); sf.appendChild(c);
    var before = kids(pr, NS.a, "headers")[0] || kids(pr, NS.a, "extLst")[0] || null;
    pr.insertBefore(sf, before);
  }
  /** Keep the graphicFrame height equal to the sum of its row heights. */
  function fitTable(frame) {
    var tbl = table(frame), h = rows(tbl).reduce(function (s, tr) { return s + (+tr.getAttribute("h") || 0); }, 0), p = pos(frame);
    if (p && h) kids(p.xfrm, NS.a, "ext")[0].setAttribute("cy", String(h));
  }
  /** Make the table have `n` body rows from template rows [from, from+block) — cloned/removed in blocks. */
  function resizeRows(tbl, from, block, n) {
    var rs = rows(tbl), tpl = rs.slice(from, from + block), body = rs.slice(from);
    var after = rs[rs.length - 1];
    body.forEach(function (r) { tbl.removeChild(r); });
    var out = [];
    for (var i = 0; i < n; i++) tpl.forEach(function (r) { var c = r.cloneNode(true); tbl.appendChild(c); out.push(c); });
    return out;
  }

  /* ------------------------------------------------------------------ charts */
  function colName(i) { var s = ""; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  function setCache(parent, kind, values, fmt) {             // parent = c:cat | c:val | c:tx; kind 'str'|'num'
    var d = parent.ownerDocument;
    var ref = kids(parent, NS.c, kind === "str" ? "strRef" : "numRef")[0] || kids(parent, NS.c, "strRef")[0] || kids(parent, NS.c, "numRef")[0];
    if (!ref) { kids(parent, NS.c).forEach(function (k) { parent.removeChild(k); }); ref = d.createElementNS(NS.c, kind === "str" ? "c:strRef" : "c:numRef"); parent.appendChild(ref); ref.appendChild(d.createElementNS(NS.c, "c:f")); }
    var isNum = ref.localName === "numRef";
    var cache = kids(ref, NS.c, isNum ? "numCache" : "strCache")[0];
    if (!cache) { cache = d.createElementNS(NS.c, isNum ? "c:numCache" : "c:strCache"); ref.appendChild(cache); }
    kids(cache, NS.c).forEach(function (k) { if (k.localName !== "formatCode") cache.removeChild(k); });
    if (isNum && fmt) { var fc = kids(cache, NS.c, "formatCode")[0]; if (!fc) { fc = d.createElementNS(NS.c, "c:formatCode"); cache.insertBefore(fc, cache.firstChild); } fc.textContent = fmt; }
    var pc = d.createElementNS(NS.c, "c:ptCount"); pc.setAttribute("val", String(values.length)); cache.appendChild(pc);
    values.forEach(function (v, i) {
      if (v == null || v === "" || (typeof v === "number" && !isFinite(v))) return;
      var pt = d.createElementNS(NS.c, "c:pt"); pt.setAttribute("idx", String(i));
      var ve = d.createElementNS(NS.c, "c:v"); ve.textContent = String(v); pt.appendChild(ve); cache.appendChild(pt);
    });
    return ref;
  }
  /**
   * Rewrite a chart's data. data = { cats: [...], catFmt?, series: [{ name?, values: [...] }] } — series map to the
   * chart's c:ser elements in document order. The embedded workbook is rebuilt so "Edit Data" shows the same numbers.
   */
  Pkg.prototype.setChart = function (chartPath, data) {
    var d = this.xml(chartPath), sers = all(d, NS.c, "ser"), n = data.cats.length;
    var catsNumeric = data.cats.every(function (c) { return typeof c === "number"; });
    // value axes: drop the template's fixed bounds so the new figures are never clipped
    all(d, NS.c, "valAx").forEach(function (ax) { kids(ax, NS.c, "scaling").forEach(function (sc) { kids(sc, NS.c).forEach(function (k) { if (/^(max|min)$/.test(k.localName)) sc.removeChild(k); }); }); });
    sers.forEach(function (s, i) {
      var sd = data.series[i] || { values: [] }, col = colName(i + 1);
      var tx = kids(s, NS.c, "tx")[0];
      if (tx && sd.name != null) { var r = setCache(tx, "str", [sd.name]); kids(r, NS.c, "f")[0] && (kids(r, NS.c, "f")[0].textContent = "Sheet1!$" + col + "$1"); }
      var cat = kids(s, NS.c, "cat")[0];
      if (cat) { var cr = setCache(cat, catsNumeric ? "num" : "str", data.cats, data.catFmt); var cf = kids(cr, NS.c, "f")[0]; if (cf) cf.textContent = "Sheet1!$A$2:$A$" + (n + 1); }
      var val = kids(s, NS.c, "val")[0];
      if (val) { var vr = setCache(val, "num", sd.values || []); var vf = kids(vr, NS.c, "f")[0]; if (vf) vf.textContent = "Sheet1!$" + col + "$2:$" + col + "$" + (n + 1); }
    });
    // embedded workbook
    var self = this, emb = this.rels(chartPath).filter(function (r) { return /package$/.test(r.type) && /\.xlsx$/i.test(r.target); })[0];
    if (emb && window.XLSX) {
      var aoa = [[""].concat(data.series.map(function (s) { return s.name || ""; }))];
      data.cats.forEach(function (c, i) { aoa.push([c].concat(data.series.map(function (s) { var v = (s.values || [])[i]; return v == null ? null : v; }))); });
      var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Sheet1");
      self.zip.file(emb.target, XLSX.write(wb, { type: "array", bookType: "xlsx" }));
    }
  };
  Pkg.prototype.chartOf = function (slide, frame) {          // chart part path of a chart graphicFrame
    var c = frame.getElementsByTagNameNS(NS.c, "chart")[0]; if (!c) return null;
    var rid = c.getAttributeNS(NS.r, "id"), t = null;
    this.rels(slide).forEach(function (r) { if (r.id === rid) t = r.target; });
    return t;
  };

  window.PptxEngine = { NS: NS, REL: REL, Pkg: Pkg, shape: shape, shapesByName: shapesByName, removeEl: removeEl, setParas: setParas, setRuns: setRuns, text: text,
    setFill: setFill, pos: pos, move: move, table: table, rows: rows, cells: cells, cellText: cellText, cellFill: cellFill, fitTable: fitTable,
    resizeRows: resizeRows, kids: kids, all: all, relsOf: relsOf, resolve: resolve };
})();

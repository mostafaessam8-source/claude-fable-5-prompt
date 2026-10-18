/* Export the deck as an editable PowerPoint (.pptx) – no libraries, works offline.
   Every visible slide is read from the live DOM (current language, edits, scenario values) and written as native
   PowerPoint shapes / text boxes / pictures, so the result can be edited in PowerPoint. */
(function (G) {
  const Z = G.Z, A = Z.app;
  const SW = 12192000, SH = 6858000, STAGE_W = 1600, EMU = SW / STAGE_W; // EMU per stage pixel
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const FONT_LATIN = 'Diodrum Arabic', FONT_CS = '29LT Kaff';
  const ARABIC = /[؀-ۿ]/;

  const parseColor = (c) => {
    if (!c) return null;
    const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null;
    const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(parseFloat);
    const a = p.length > 3 ? p[3] : 1; if (!(a > 0)) return null;
    const h = (n) => ('0' + Math.round(n).toString(16)).slice(-2);
    return { hex: (h(p[0]) + h(p[1]) + h(p[2])).toUpperCase(), a };
  };
  const clr = (c, extraAlpha) => {
    const a = Math.max(0, Math.min(1, (c.a == null ? 1 : c.a) * (extraAlpha == null ? 1 : extraAlpha)));
    return `<a:srgbClr val="${c.hex}">${a < 0.995 ? `<a:alpha val="${Math.round(a * 100000)}"/>` : ''}</a:srgbClr>`;
  };

  function Slide() {
    this.xml = []; this.rels = []; this.id = 2; this.bg = null;
  }
  Slide.prototype.nid = function () { return ++this.id; };

  /* ---------------------------------------------------------------- geometry helpers */
  const geomRect = (round) => (round ? `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${round}"/></a:avLst></a:prstGeom>` : '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>');
  // polygon / polyline in EMU absolute coordinates -> shape bounds + custGeom
  const custGeom = (subpaths, closed) => {
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    subpaths.forEach((sp) => sp.forEach(([x, y]) => { minx = Math.min(minx, x); miny = Math.min(miny, y); maxx = Math.max(maxx, x); maxy = Math.max(maxy, y); }));
    const w = Math.max(1, Math.round(maxx - minx)), h = Math.max(1, Math.round(maxy - miny));
    const path = subpaths.map((sp) => sp.map(([x, y], i) => `<a:${i ? 'lnTo' : 'moveTo'}><a:pt x="${Math.round(x - minx)}" y="${Math.round(y - miny)}"/></a:${i ? 'lnTo' : 'moveTo'}>`).join('') + (closed ? '<a:close/>' : '')).join('');
    return { x: Math.round(minx), y: Math.round(miny), w, h, xml: `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${w}" h="${h}"${closed ? '' : ' fill="none"'}>${path}</a:path></a:pathLst></a:custGeom>` };
  };
  const lnXml = (color, wEmu, dash) => (color ? `<a:ln w="${Math.max(3175, Math.round(wEmu))}"><a:solidFill>${clr(color)}</a:solidFill>${dash ? '<a:prstDash val="dash"/>' : ''}</a:ln>` : '<a:ln><a:noFill/></a:ln>');

  Slide.prototype.shape = function (o) {
    // o: {x,y,w,h (EMU), geom (xml), fill (color obj|null), alpha, line:{color,w,dash}|null, text (txBody xml), name}
    const id = this.nid();
    this.xml.push(`<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(o.name || 'Shape ' + id)}"/><p:cNvSpPr${o.txBox ? ' txBox="1"' : ''}/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${Math.round(o.x)}" y="${Math.round(o.y)}"/><a:ext cx="${Math.max(1, Math.round(o.w))}" cy="${Math.max(1, Math.round(o.h))}"/></a:xfrm>${o.geom || geomRect()}${o.fill ? `<a:solidFill>${clr(o.fill, o.alpha)}</a:solidFill>` : '<a:noFill/>'}${o.line ? lnXml(o.line.color, o.line.w, o.line.dash) : '<a:ln><a:noFill/></a:ln>'}</p:spPr>${o.text || '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody>'}</p:sp>`);
  };
  Slide.prototype.pic = function (o) {
    const id = this.nid(), rid = 'rId' + (this.rels.length + 2);
    this.rels.push({ id: rid, media: o.media });
    this.xml.push(`<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${esc(o.name || 'Picture ' + id)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/>${o.crop ? `<a:srcRect l="${o.crop[0]}" t="${o.crop[1]}" r="${o.crop[2]}" b="${o.crop[3]}"/>` : ''}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${Math.round(o.x)}" y="${Math.round(o.y)}"/><a:ext cx="${Math.max(1, Math.round(o.w))}" cy="${Math.max(1, Math.round(o.h))}"/></a:xfrm>${o.geom || geomRect()}</p:spPr></p:pic>`);
  };

  /* ---------------------------------------------------------------- text */
  const textBody = (paras, o) => {
    o = o || {};
    return `<p:txBody><a:bodyPr wrap="${o.nowrap ? 'none' : 'square'}" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="${o.anchor || 't'}"><a:noAutofit/></a:bodyPr><a:lstStyle/>${paras}</p:txBody>`;
  };
  const runXml = (r) => {
    const ar = ARABIC.test(r.t);
    return `<a:r><a:rPr lang="${ar ? 'ar-SA' : 'en-US'}" sz="${r.sz}" b="${r.b ? 1 : 0}" i="${r.i ? 1 : 0}"${r.u ? ' u="sng"' : ''} dirty="0"><a:solidFill>${clr(r.c)}</a:solidFill>${r.hl ? `<a:highlight>${clr(r.hl)}</a:highlight>` : ''}<a:latin typeface="${esc(r.f || FONT_LATIN)}"/><a:ea typeface="${esc(r.f || FONT_LATIN)}"/><a:cs typeface="${esc(r.f || FONT_CS)}"/></a:rPr><a:t>${esc(r.t)}</a:t></a:r>`;
  };
  const paraXml = (runs, o) => {
    const lnS = o.lh ? `<a:lnSpc><a:spcPts val="${Math.round(o.lh)}"/></a:lnSpc>` : '';
    const body = runs.map((r) => (r.br ? '<a:br><a:rPr lang="en-US" dirty="0"/></a:br>' : runXml(r))).join('');
    const end = runs.length ? runs.filter((r) => !r.br).slice(-1)[0] : null;
    return `<a:p><a:pPr algn="${o.algn || 'l'}" rtl="${o.rtl ? 1 : 0}" marL="0" indent="0">${lnS}<a:spcBef><a:spcPts val="0"/></a:spcBef><a:spcAft><a:spcPts val="0"/></a:spcAft><a:buNone/></a:pPr>${body}${end ? `<a:endParaRPr lang="en-US" sz="${end.sz}" dirty="0"/>` : ''}</a:p>`;
  };

  /* ---------------------------------------------------------------- DOM → shapes */
  const INLINE = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'SPAN', 'A', 'SMALL', 'BR', 'KBD', 'SUB', 'SUP', 'MARK', 'LABEL']);
  const SKIP = new Set(['SCRIPT', 'STYLE', 'DEFS', 'TITLE']);
  const ptOf = (px) => px * 0.6; // 1 stage px = 0.6 pt on a 13.333in slide
  const num = (v) => parseFloat(v) || 0;

  function evalLen(tok, base) {
    tok = tok.trim();
    let m = tok.match(/^calc\((.+)\)$/);
    if (m) { const parts = m[1].split(/\s+([+-])\s+/); let v = evalLen(parts[0], base); for (let i = 1; i < parts.length; i += 2) v = parts[i] === '+' ? v + evalLen(parts[i + 1], base) : v - evalLen(parts[i + 1], base); return v; }
    if (/%$/.test(tok)) return (parseFloat(tok) / 100) * base;
    return parseFloat(tok) || 0;
  }
  function clipPoly(cs, w, h) {
    const cp = cs.clipPath; if (!cp || cp === 'none' || cp.indexOf('polygon') < 0) return null;
    const inner = cp.replace(/^polygon\(/, '').replace(/\)$/, '');
    const pts = []; let depth = 0, cur = '';
    for (const ch of inner) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && !depth) { pts.push(cur); cur = ''; } else cur += ch; }
    pts.push(cur);
    return pts.map((p) => { const t = []; let d = 0, c = ''; for (const ch of p.trim()) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ' ' && !d) { if (c) t.push(c); c = ''; } else c += ch; } if (c) t.push(c); return [evalLen(t[0], w), evalLen(t[1], h)]; });
  }

  const ctxFor = (stageRect, sc) => ({
    X: (sx) => (sx - stageRect.left) / sc * EMU,
    Y: (sy) => (sy - stageRect.top) / sc * EMU,
    L: (d) => d / sc * EMU,
    sc,
  });

  function mediaFor(img, store) {
    const key = img.currentSrc || img.src;
    if (store.cache.has(key)) return store.cache.get(key);
    const nw = img.naturalWidth, nh = img.naturalHeight; if (!nw || !nh) return null;
    const cv = document.createElement('canvas'); cv.width = nw; cv.height = nh;
    const g = cv.getContext('2d'); const png = /image\/png|\.png/i.test(key);
    if (!png) { g.fillStyle = '#fff'; g.fillRect(0, 0, nw, nh); }
    g.drawImage(img, 0, 0);
    let data;
    try { const url = cv.toDataURL(png ? 'image/png' : 'image/jpeg', 0.92); const b = atob(url.split(',')[1]); data = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) data[i] = b.charCodeAt(i); } catch (e) { return null; }
    const m = { name: 'image' + (store.media.length + 1) + (png ? '.png' : '.jpg'), data, nw, nh };
    store.media.push(m); store.cache.set(key, m); return m;
  }

  function boxShapes(el, cs, r, c, S, clipStack) {
    const bg = parseColor(cs.backgroundColor); let op = parseFloat(cs.opacity); if (!isFinite(op)) op = 1;
    const bw = [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].map(num);
    const bc = [cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor].map(parseColor);
    const bs = [cs.borderTopStyle, cs.borderRightStyle, cs.borderBottomStyle, cs.borderLeftStyle];
    const has = bw.map((w, i) => w > 0 && bs[i] !== 'none' && bc[i]);
    const anyB = has.some(Boolean), uniform = has.every(Boolean) && bw.every((w) => w === bw[0]) && bc.every((x) => x.hex === bc[0].hex);
    let x = c.X(r.left), y = c.Y(r.top), w = c.L(r.width), h = c.L(r.height);
    const rad = num(cs.borderTopLeftRadius);
    // transform (skew/rotate) → polygon of the four transformed corners
    let poly = null;
    if (cs.transform && cs.transform !== 'none' && (bg || anyB)) {
      const prev = el.style.transform; el.style.transform = 'none'; const r0 = el.getBoundingClientRect(); el.style.transform = prev;
      const m = new DOMMatrix(cs.transform), org = cs.transformOrigin.split(' ').map(num), ox = r0.left + org[0] * c.sc, oy = r0.top + org[1] * c.sc;
      poly = [[r0.left, r0.top], [r0.right, r0.top], [r0.right, r0.bottom], [r0.left, r0.bottom]].map(([px, py]) => { const dx = px - ox, dy = py - oy; return [c.X(ox + m.a * dx + m.c * dy), c.Y(oy + m.b * dx + m.d * dy)]; });
    }
    const cp = clipPoly(cs, r.width / c.sc, r.height / c.sc);
    if (cp) poly = cp.map(([px, py]) => [x + px * EMU, y + py * EMU]);
    if (bg || (anyB && uniform)) {
      let geom = geomRect(), gx = x, gy = y, gw = w, gh = h;
      if (poly) { const g = custGeom([poly], true); geom = g.xml; gx = g.x; gy = g.y; gw = g.w; gh = g.h; }
      else if (rad > 0) { const mn = Math.min(r.width, r.height) / c.sc; if (rad / c.sc >= mn / 2 - 1 && Math.abs(r.width - r.height) < 2) geom = '<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>'; else geom = geomRect(Math.min(50000, Math.round(rad / c.sc / mn * 100000))); }
      S.shape({ x: gx, y: gy, w: gw, h: gh, geom, fill: bg, alpha: op, line: anyB && uniform ? { color: bc[0], w: bw[0] / 1 * EMU } : null, name: el.className && typeof el.className === 'string' ? el.className.split(' ')[0] : el.tagName });
    }
    if (anyB && !uniform) { // single-side borders (accent bars, rules)
      const T = (i, ax, ay, aw, ah) => has[i] && S.shape({ x: ax, y: ay, w: aw, h: ah, fill: bc[i] });
      T(0, x, y, w, bw[0] * EMU); T(2, x, y + h - bw[2] * EMU, w, bw[2] * EMU); T(3, x, y, bw[3] * EMU, h); T(1, x + w - bw[1] * EMU, y, bw[1] * EMU, h);
    }
    // ::before accent (e.g. top bar, kpi stripe)
    const pb = getComputedStyle(el, '::before');
    if (pb && pb.content && pb.content !== 'none' && pb.content !== 'normal' && pb.position === 'absolute') {
      const pbg = parseColor(pb.backgroundColor);
      if (pbg) {
        const pw = r.width / c.sc, ph = r.height / c.sc;
        const left = pb.left !== 'auto' ? num(pb.left) : (pb.right !== 'auto' && pb.width !== 'auto' ? pw - num(pb.right) - num(pb.width) : 0);
        const top = pb.top !== 'auto' ? num(pb.top) : (pb.bottom !== 'auto' && pb.height !== 'auto' ? ph - num(pb.bottom) - num(pb.height) : 0);
        const width = pb.width !== 'auto' ? num(pb.width) : (pw - left - (pb.right !== 'auto' ? num(pb.right) : 0));
        const height = pb.height !== 'auto' ? num(pb.height) : (ph - top - (pb.bottom !== 'auto' ? num(pb.bottom) : 0));
        if (pb.display !== 'none' && width > 0 && height > 0) S.shape({ x: x + left * EMU, y: y + top * EMU, w: width * EMU, h: height * EMU, fill: pbg, name: 'accent' });
      }
    }
    return poly;
  }

  function textFor(el, cs, r, c, S) {
    // runs from child nodes
    const runs = [];
    const bulletLI = cs.display === 'list-item' && cs.listStyleType !== 'none';
    const famOf = (c2) => { const f = (c2.fontFamily || '').split(',')[0].replace(/["']/g, '').trim(); return f && !/^(29LT Kaff|Diodrum Arabic|Segoe UI|system-ui|sans-serif)$/i.test(f) ? f : ''; };
    const walkRuns = (n, pcs, inl) => {
      n.childNodes.forEach((ch) => {
        if (ch.nodeType === 3) {
          let t = ch.textContent.replace(/[⁦⁧⁩]/g, '').replace(/\s+/g, ' ');
          if (!t) return;
          const tt = pcs.textTransform === 'uppercase' ? t.toUpperCase() : t;
          const color = parseColor(pcs.color) || { hex: '3D3935', a: 1 };
          runs.push({ t: tt, sz: Math.max(100, Math.round(ptOf(num(pcs.fontSize)) * 100)), b: parseInt(pcs.fontWeight, 10) >= 600 || pcs.fontWeight === 'bold', i: pcs.fontStyle === 'italic', u: /underline/.test(pcs.textDecorationLine || ''), c: color, f: famOf(pcs), hl: inl ? parseColor(pcs.backgroundColor) : null });
        } else if (ch.nodeType === 1) {
          if (ch.tagName === 'BR') { runs.push({ br: true }); return; }
          const ccs = getComputedStyle(ch); if (ccs.display === 'none') return;
          walkRuns(ch, ccs, true);
        }
      });
    };
    walkRuns(el, cs);
    // trim
    while (runs.length && !runs[0].br && !runs[0].t.trim()) runs.shift();
    if (runs.length && !runs[0].br) runs[0].t = runs[0].t.replace(/^\s+/, '');
    while (runs.length && !runs[runs.length - 1].br && !runs[runs.length - 1].t.trim()) runs.pop();
    if (runs.length && !runs[runs.length - 1].br) runs[runs.length - 1].t = runs[runs.length - 1].t.replace(/\s+$/, '');
    if (!runs.length) return;
    if (bulletLI) runs.unshift({ t: '• ', sz: runs[0].sz, b: true, i: false, c: runs[0].c });
    const text = runs.map((q) => q.t || '').join('');
    const rtl = cs.direction === 'rtl' || (ARABIC.test(text) && cs.direction !== 'ltr' && false);
    // alignment
    let a = cs.textAlign;
    const grid = /grid/.test(cs.display), flex = /flex/.test(cs.display);
    let anchor = 't';
    if ((grid && cs.justifyItems === 'center') || (flex && cs.justifyContent === 'center' && cs.alignItems === 'center') || (grid && cs.placeItems === 'center')) { a = 'center'; anchor = 'ctr'; }
    else if (flex && cs.alignItems === 'center') anchor = 'ctr';
    else if (/table-cell/.test(cs.display) && cs.verticalAlign === 'middle') anchor = 'ctr';
    const algn = a === 'center' ? 'ctr' : a === 'right' ? 'r' : a === 'left' ? 'l' : a === 'justify' ? 'just' : a === 'end' ? (rtl ? 'l' : 'r') : (rtl ? 'r' : 'l');
    const fs = num(cs.fontSize), lhRaw = cs.lineHeight === 'normal' ? fs * 1.25 : num(cs.lineHeight);
    const pl = num(cs.paddingLeft) + num(cs.borderLeftWidth), pr = num(cs.paddingRight) + num(cs.borderRightWidth), pt = num(cs.paddingTop) + num(cs.borderTopWidth), pbm = num(cs.paddingBottom) + num(cs.borderBottomWidth);
    let x = c.X(r.left) + pl * EMU, y = c.Y(r.top) + pt * EMU, w = c.L(r.width) - (pl + pr) * EMU, h = c.L(r.height) - (pt + pbm) * EMU;
    // widen a little so PowerPoint's own font metrics do not add line breaks
    const lines0 = Math.round((r.height / c.sc - (pt + pbm)) / lhRaw), soft0 = lines0 > runs.filter((q) => q.br).length + 1;
    const extra = soft0 ? Math.min(w * 0.015, 50000) : Math.min(w * 0.06 + 40000, 400000);
    if (algn === 'l') w += extra; else if (algn === 'r') { x -= extra; w += extra; } else { x -= extra / 2; w += extra; }
    const paras = paraXml(runs, { algn, rtl, lh: ptOf(lhRaw) * 100 });
    // text that did not wrap in the browser must not wrap in PowerPoint either (its font metrics differ slightly)
    const brs = runs.filter((q) => q.br).length + 1, lines = Math.round((r.height / c.sc - (pt + pbm)) / lhRaw);
    const soft = lines > brs;
    S.shape({ x, y, w: Math.max(w, 1), h: Math.max(h, 1), txBox: true, text: textBody(paras, { anchor, nowrap: !soft || cs.whiteSpace === 'nowrap' }), name: 'Text' });
  }

  function isTextBlock(el, cs) {
    if (!el.textContent.trim()) return false;
    const d = cs.display;
    if (/flex|grid/.test(d) && el.children.length) return false;
    for (const ch of el.children) {
      if (!INLINE.has(ch.tagName)) return false;
      const ccs = getComputedStyle(ch);
      if (ch.tagName !== 'BR' && !/^inline/.test(ccs.display) && ccs.display !== 'none' && ccs.display !== 'contents') return false;
    }
    return true;
  }

  function svgShapes(svg, c, S, ov) {
    const els = svg.querySelectorAll('rect,line,circle,path,text,polygon,polyline');
    const pt = svg.createSVGPoint();
    els.forEach((el) => {
      if (el.closest('defs,clipPath,marker,pattern,mask')) return;
      const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return;
      let hidden = false; for (let p = el.parentNode; p && p !== svg; p = p.parentNode) { if (p.nodeType === 1 && getComputedStyle(p).display === 'none') { hidden = true; break; } } if (hidden) return;
      const ctm = el.getScreenCTM(); if (!ctm) return;
      if (ov) { const bb0 = el.getBoundingClientRect(), cx0 = (bb0.left + bb0.right) / 2, cy0 = (bb0.top + bb0.bottom) / 2; if (cx0 < ov.left - 1 || cx0 > ov.right + 1 || cy0 < ov.top - 1 || cy0 > ov.bottom + 1) return; }
      const tp = (x, y) => { pt.x = x; pt.y = y; const q = pt.matrixTransform(ctm); return [c.X(q.x), c.Y(q.y)]; };
      const op = parseFloat(cs.opacity) || 1;
      const fill = cs.fill && cs.fill !== 'none' ? parseColor(cs.fill) : null, stroke = cs.stroke && cs.stroke !== 'none' ? parseColor(cs.stroke) : null;
      const fa = fill ? Math.min(1, (parseFloat(cs.fillOpacity) || 1) * op) : 1, sa = stroke ? Math.min(1, (parseFloat(cs.strokeOpacity) || 1) * op) : 1;
      const sw = (parseFloat(cs.strokeWidth) || 1) * ctm.a / c.sc * EMU;
      const dash = cs.strokeDasharray && cs.strokeDasharray !== 'none';
      const line = stroke ? { color: Object.assign({}, stroke, { a: stroke.a * sa }), w: sw, dash } : null;
      const tag = el.tagName.toLowerCase();
      if (tag === 'text') {
        const raw = el.textContent.replace(/[⁦⁧⁩]/g, ''); const t = raw.replace(/\s+/g, ' ').trim(); if (!t || !fill) return;
        const bb = el.getBoundingClientRect(); if (bb.width <= 0) return;
        const fsPx = (parseFloat(cs.fontSize) || 12) * ctm.a / c.sc, anchor = cs.textAnchor, ar = ARABIC.test(t);
        let x = c.X(bb.left), w = c.L(bb.width), y = c.Y(bb.top), h = c.L(bb.height);
        const extra = Math.max(60000, w * 0.12);
        let algn = 'l';
        if (anchor === 'end') { algn = 'r'; x -= extra; w += extra; } else if (anchor === 'middle') { algn = 'ctr'; x -= extra / 2; w += extra; } else w += extra;
        const col = Object.assign({}, fill, { a: fill.a * fa });
        const fam = (cs.fontFamily || '').split(',')[0].replace(/["']/g, '').trim(); const run = { t: t, sz: Math.max(100, Math.round(ptOf(fsPx) * 100)), b: parseInt(cs.fontWeight, 10) >= 600, i: cs.fontStyle === 'italic', u: /underline/.test(cs.textDecorationLine || ''), c: col, f: /^(29LT Kaff|Diodrum Arabic|Segoe UI|system-ui|sans-serif|)$/i.test(fam) ? '' : fam };
        S.shape({ x, y, w, h, txBox: true, text: textBody(paraXml([run], { algn, rtl: ar, lh: 0 }), { anchor: 'ctr', nowrap: true }), name: 'Label' });
        return;
      }
      if (tag === 'rect') {
        if (!fill && !line) return;
        const q = [tp(num(el.getAttribute('x')), num(el.getAttribute('y'))), tp(num(el.getAttribute('x')) + num(el.getAttribute('width')), num(el.getAttribute('y')) + num(el.getAttribute('height')))];
        const rx = num(el.getAttribute('rx')), x = Math.min(q[0][0], q[1][0]), y = Math.min(q[0][1], q[1][1]), w = Math.abs(q[1][0] - q[0][0]), h = Math.abs(q[1][1] - q[0][1]);
        if (w < 1 || h < 1) return;
        S.shape({ x, y, w, h, geom: rx > 0 ? geomRect(Math.min(50000, Math.round(rx * ctm.a / c.sc * EMU / Math.min(w, h) * 100000))) : geomRect(), fill, alpha: fa, line, name: 'Bar' });
        return;
      }
      if (tag === 'circle') {
        const cx = num(el.getAttribute('cx')), cy = num(el.getAttribute('cy')), rr = num(el.getAttribute('r'));
        const a = tp(cx - rr, cy - rr), b = tp(cx + rr, cy + rr);
        S.shape({ x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]), geom: '<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>', fill, alpha: fa, line, name: 'Dot' });
        return;
      }
      let subs = [];
      if (tag === 'line') subs = [[tp(num(el.getAttribute('x1')), num(el.getAttribute('y1'))), tp(num(el.getAttribute('x2')), num(el.getAttribute('y2')))]];
      else if (tag === 'polygon' || tag === 'polyline') { const nums = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(parseFloat); const sp = []; for (let i = 0; i + 1 < nums.length; i += 2) sp.push(tp(nums[i], nums[i + 1])); subs = [sp]; }
      else if (tag === 'path') {
        const toks = (el.getAttribute('d') || '').match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) || []; let i = 0, cmd = '', cx = 0, cy = 0, sx = 0, sy = 0, sp = null;
        const nx = () => parseFloat(toks[i++]);
        while (i < toks.length) {
          if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
          else if (cmd === 'M') cmd = 'L'; else if (cmd === 'm') cmd = 'l';
          if (cmd === 'M' || cmd === 'm') { const x = nx(), y = nx(); cx = cmd === 'm' ? cx + x : x; cy = cmd === 'm' ? cy + y : y; sx = cx; sy = cy; sp = [tp(cx, cy)]; subs.push(sp); }
          else if (cmd === 'L' || cmd === 'l') { const x = nx(), y = nx(); cx = cmd === 'l' ? cx + x : x; cy = cmd === 'l' ? cy + y : y; (sp || (sp = (subs.push([]), subs[subs.length - 1]))).push(tp(cx, cy)); }
          else if (cmd === 'H' || cmd === 'h') { const x = nx(); cx = cmd === 'h' ? cx + x : x; sp && sp.push(tp(cx, cy)); }
          else if (cmd === 'V' || cmd === 'v') { const y = nx(); cy = cmd === 'v' ? cy + y : y; sp && sp.push(tp(cx, cy)); }
          else if (cmd === 'Z' || cmd === 'z') { cx = sx; cy = sy; if (sp) sp.closed = true; }
          else i++;
        }
        subs = subs.filter((q) => q.length > 1);
      }
      if (!subs.length || (!fill && !line)) return;
      const closed = tag !== 'line' && tag !== 'polyline' && subs.every((q) => q.closed || tag === 'polygon' || (fill && tag === 'path' && !q.closed && false));
      const useFill = fill && (tag !== 'line');
      // filled open paths (area under a curve) are closed implicitly by PowerPoint when filled
      const g = custGeom(subs, !!(closed || (useFill && tag === 'path')));
      S.shape({ x: g.x, y: g.y, w: g.w, h: g.h, geom: g.xml, fill: useFill ? fill : null, alpha: fa, line, name: tag === 'line' ? 'Line' : 'Path' });
    });
  }

  function walk(el, c, S, store, clip, ov) {
    if (el.nodeType !== 1 || SKIP.has(el.tagName.toUpperCase())) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return;
    if (el.id === 'tip' || el.classList.contains('ov-input')) return;
    const r = el.getBoundingClientRect();
    const cin = (rr) => !ov || ((rr.left + rr.right) / 2 >= ov.left - 1 && (rr.left + rr.right) / 2 <= ov.right + 1 && (rr.top + rr.bottom) / 2 >= ov.top - 1 && (rr.top + rr.bottom) / 2 <= ov.bottom + 1);
    if (el.tagName.toLowerCase() === 'svg') { svgShapes(el, c, S, ov); return; }
    if (r.width <= 0 || r.height <= 0) return;
    const vis = cin(r) || el.classList.contains('slide');
    if (!vis && !el.children.length) return;
    if (!el.classList.contains('slide') && (cs.overflowX !== 'visible' || cs.overflowY !== 'visible')) ov = ov ? { left: Math.max(ov.left, r.left), top: Math.max(ov.top, r.top), right: Math.min(ov.right, r.right), bottom: Math.min(ov.bottom, r.bottom) } : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    const isRoot = el.classList.contains('slide');
    let poly = null;
    if (!isRoot) { if (vis) poly = boxShapes(el, cs, r, c, S); }
    else {
      const bg = parseColor(cs.backgroundColor); if (bg) S.bg = bg;
      // slide-level ::before top bar
      boxShapes(el, Object.assign({ backgroundColor: 'rgba(0,0,0,0)', borderTopWidth: '0', borderRightWidth: '0', borderBottomWidth: '0', borderLeftWidth: '0', borderTopStyle: 'none', borderRightStyle: 'none', borderBottomStyle: 'none', borderLeftStyle: 'none', transform: 'none', clipPath: 'none', borderTopLeftRadius: '0' }, {}), r, c, S);
    }
    const ownClip = poly && cs.clipPath && cs.clipPath.indexOf('polygon') >= 0 ? { poly, r } : clip;
    if (el.tagName === 'IMG') {
      const m = mediaFor(el, store); if (!m) return;
      let x = c.X(r.left), y = c.Y(r.top), w = c.L(r.width), h = c.L(r.height), crop = null, geom = geomRect();
      const fit = cs.objectFit;
      if (fit === 'cover') {
        const ba = r.width / r.height, ia = m.nw / m.nh, pos = (cs.objectPosition || '50% 50%').split(' ');
        const px = parseFloat(pos[0]) / 100, py = parseFloat(pos[1]) / 100;
        if (ia > ba) { const vis = ba / ia, off = (1 - vis) * px; crop = [Math.round(off * 100000), 0, Math.round((1 - vis - off) * 100000), 0]; }
        else { const vis = ia / ba, off = (1 - vis) * py; crop = [0, Math.round(off * 100000), 0, Math.round((1 - vis - off) * 100000)]; }
      }
      if (clip && clip.poly) {
        const rel = clip.poly.map(([px, py]) => [px, py]); // absolute EMU polygon of the clipping ancestor
        const g = custGeom([rel], true);
        // picture box must equal the clip polygon bounds: re-crop accordingly
        const ox = (g.x - x) / w, oy = (g.y - y) / h, ow = g.w / w, oh = g.h / h;
        const base = crop || [0, 0, 0, 0], fw = 1 - (base[0] + base[2]) / 100000, fh = 1 - (base[1] + base[3]) / 100000;
        crop = [Math.round(base[0] + ox * fw * 100000), Math.round(base[1] + oy * fh * 100000), Math.round(base[2] + (1 - ox - ow) * fw * 100000), Math.round(base[3] + (1 - oy - oh) * fh * 100000)];
        x = g.x; y = g.y; w = g.w; h = g.h; geom = g.xml;
      }
      S.pic({ x, y, w, h, geom, crop, media: m, name: el.alt || 'Picture' });
      return;
    }
    if (el.tagName === 'INPUT') {
      const v = (el.value || '').toString(); if (v) textFor({ childNodes: [document.createTextNode(v)], textContent: v }, cs, r, c, S);
      return;
    }
    if (isTextBlock(el, cs)) { if (vis) textFor(el, cs, r, c, S); return; }
    Array.from(el.childNodes).forEach((ch) => {
      if (ch.nodeType === 1) { walk(ch, c, S, store, ownClip, ov); return; }
      if (ch.nodeType !== 3 || !ch.textContent.trim()) return;
      const rg = document.createRange(); rg.selectNodeContents(ch); const rr = rg.getBoundingClientRect(); if (rr.width <= 0 || rr.height <= 0) return;
      const pc = { fontSize: cs.fontSize, fontWeight: cs.fontWeight, fontStyle: cs.fontStyle, color: cs.color, textTransform: cs.textTransform, textDecorationLine: cs.textDecorationLine, direction: cs.direction, textAlign: 'start', display: 'block', lineHeight: cs.lineHeight, paddingLeft: '0', paddingRight: '0', paddingTop: '0', paddingBottom: '0', borderLeftWidth: '0', borderRightWidth: '0', borderTopWidth: '0', borderBottomWidth: '0', whiteSpace: 'nowrap', listStyleType: 'none', verticalAlign: 'top', justifyItems: 'normal', alignItems: 'normal', justifyContent: 'normal', placeItems: 'normal' };
      textFor({ childNodes: [ch], textContent: ch.textContent }, pc, rr, c, S);
    });
  }

  /* ---------------------------------------------------------------- package parts */
  const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const THEME = HEAD + `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="SAR"><a:themeElements><a:clrScheme name="SAR"><a:dk1><a:srgbClr val="3D3935"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="00778B"/></a:dk2><a:lt2><a:srgbClr val="F2F8F9"/></a:lt2><a:accent1><a:srgbClr val="00778B"/></a:accent1><a:accent2><a:srgbClr val="3D3935"/></a:accent2><a:accent3><a:srgbClr val="768692"/></a:accent3><a:accent4><a:srgbClr val="59CBE8"/></a:accent4><a:accent5><a:srgbClr val="71B2C9"/></a:accent5><a:accent6><a:srgbClr val="F1B434"/></a:accent6><a:hlink><a:srgbClr val="00778B"/></a:hlink><a:folHlink><a:srgbClr val="768692"/></a:folHlink></a:clrScheme><a:fontScheme name="SAR"><a:majorFont><a:latin typeface="${FONT_LATIN}"/><a:ea typeface=""/><a:cs typeface="${FONT_CS}"/></a:majorFont><a:minorFont><a:latin typeface="${FONT_LATIN}"/><a:ea typeface=""/><a:cs typeface="${FONT_CS}"/></a:minorFont></a:fontScheme><a:fmtScheme name="SAR"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
  const GRP = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
  const MASTER = HEAD + `<p:sldMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${GRP}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr algn="l"><a:defRPr sz="3200"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr algn="l"><a:defRPr sz="1800"/></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr algn="l"><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>`;
  const LAYOUT = HEAD + `<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${GRP}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
  const REL = (items) => HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + items.map((i) => `<Relationship Id="${i[0]}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${i[1]}" Target="${i[2]}"/>`).join('') + '</Relationships>';

  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  A.exportPptx = async () => {
    // phones: lay the deck out as on a laptop while the file is built, then go back to the phone layout
    const wasMobile = A.mobile; A.forceDesktop = true; if (wasMobile) { A.fit(); await nextFrame(); }
    const btn = document.getElementById('bPptx'), old = btn ? btn.innerHTML : '';
    const wasEdit = A.s.editText; if (wasEdit) { A.s.editText = false; document.getElementById('app').classList.remove('editing'); }
    const keepSlide = A.s.slide, drawer = A.s.drawer; A.s.drawer = null; A.renderDrawer();
    if (btn) { btn.disabled = true; btn.lastElementChild.textContent = A.L('Exporting…', 'جارٍ التصدير…'); }
    try {
      const idxs = A.visIdx(), store = { media: [], cache: new Map() }, slides = [];
      const stage = document.getElementById('stage');
      for (const i of idxs) {
        A.renderSlide(i);
        const el = document.getElementById('slide-' + i);
        document.querySelectorAll('.slide').forEach((s, k) => { s.classList.toggle('active', k === i); s.style.animation = 'none'; });
        document.getElementById('viewport').scrollTop = 0;
        await nextFrame();
        const stageRect = stage.getBoundingClientRect(), c = ctxFor(stageRect, A.scale || 1), S = new Slide();
        walk(el, c, S, store, null, null);
        slides.push(S);
      }
      document.querySelectorAll('.slide').forEach((s) => (s.style.animation = ''));
      // package
      const files = [];
      const ct = HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' + slides.map((_, n) => `<Override PartName="/ppt/slides/slide${n + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('') + '</Types>';
      files.push(['[Content_Types].xml', ct]);
      files.push(['_rels/.rels', REL([['rId1', 'officeDocument', 'ppt/presentation.xml']])]);
      files.push(['ppt/presentation.xml', HEAD + `<p:presentation ${NS} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((_, n) => `<p:sldId id="${256 + n}" r:id="rId${n + 3}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${SW}" cy="${SH}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`]);
      files.push(['ppt/_rels/presentation.xml.rels', REL([['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'], ['rId2', 'theme', 'theme/theme1.xml'], ...slides.map((_, n) => ['rId' + (n + 3), 'slide', `slides/slide${n + 1}.xml`])])]);
      files.push(['ppt/slideMasters/slideMaster1.xml', MASTER]);
      files.push(['ppt/slideMasters/_rels/slideMaster1.xml.rels', REL([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'theme', '../theme/theme1.xml']])]);
      files.push(['ppt/slideLayouts/slideLayout1.xml', LAYOUT]);
      files.push(['ppt/slideLayouts/_rels/slideLayout1.xml.rels', REL([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']])]);
      files.push(['ppt/theme/theme1.xml', THEME]);
      slides.forEach((S, n) => {
        const bg = S.bg ? `<p:bg><p:bgPr><a:solidFill>${clr(S.bg)}</a:solidFill><a:effectLst/></p:bgPr></p:bg>` : '';
        files.push([`ppt/slides/slide${n + 1}.xml`, HEAD + `<p:sld ${NS}><p:cSld>${bg}<p:spTree>${GRP}${S.xml.join('')}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`]);
        files.push([`ppt/slides/_rels/slide${n + 1}.xml.rels`, REL([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ...S.rels.map((q) => [q.id, 'image', '../media/' + q.media.name])])]);
      });
      store.media.forEach((m) => files.push(['ppt/media/' + m.name, m.data]));
      const blob = Z.zip(files);
      const out = new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(out);
      a.download = (A.mode ? 'Zulfi-Management-Update' : 'Zulfi-Presentation') + (A.mode ? (A.isAr() ? '-AR' : '-EN') : '') + '.pptx';
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
    } catch (e) {
      console.error(e); alert(A.L('Could not create the PowerPoint file: ', 'تعذّر إنشاء ملف PowerPoint: ') + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = old; }
      A.s.drawer = drawer; A.s.slide = keepSlide;
      if (wasEdit) { A.s.editText = true; document.getElementById('app').classList.add('editing'); }
      A.forceDesktop = false; if (wasMobile) A.fit();
      A.dirty = new Set(A.slides.map((_, i) => i)); A.go(keepSlide); A.renderDrawer();
    }
  };
})(window);

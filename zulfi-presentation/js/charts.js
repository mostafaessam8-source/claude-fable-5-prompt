/* Formatting helpers + small hand-written SVG chart builders (no external libraries). */
(function (G) {
  const Z = (G.Z = G.Z || {});
  const F = (Z.F = {});

  F.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  F.n0 = (v) => Math.round(v).toLocaleString('en-US');
  F.sar = (v) => 'SAR ' + F.n0(v);
  F.M = (v, d = 2) => (v / 1e6).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) + 'M';
  F.compact = (v) => {
    const a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M';
    if (a >= 1e3) return Math.round(v / 1e3) + 'K';
    return String(Math.round(v));
  };
  F.pct = (v, d = 1) => (v * 100).toFixed(d) + '%';
  F.days = (n) => (n === 0 ? '0 d' : (n > 0 ? '+' : '−') + Math.abs(n) + ' d');
  F.deltaCls = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : 'zero');
  F.deltaHtml = (n, unit) => `<span class="delta ${F.deltaCls(n)}">${n === 0 ? 'on baseline' : (n > 0 ? '+' : '−') + Math.abs(n) + (unit || ' d') + (n > 0 ? ' later' : ' earlier')}</span>`;
  F.months = (m) => (Math.abs(m - Math.round(m)) < 0.05 ? String(Math.round(m)) : m.toFixed(1));
  // tooltip payload for data-tip="" (HTML, attribute-escaped)
  F.tip = (title, rows) => F.esc(`<div class="t">${title}</div>` + (rows || []).map((r) => `<div class="r"><span>${r[0] ? `<i class="sw" style="background:${r[0]}"></i>` : ''}${r[1]}</span><b>${r[2]}</b></div>`).join(''));
  F.nice = (max, ticks = 5) => {
    if (max <= 0) return { max: 1, step: 0.25 };
    const raw = max / ticks, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
    return { max: Math.ceil(max / step) * step, step };
  };
  F.groupColor = (code) => `var(--c${parseInt(code, 10)})`;
  F.epcColor = (k) => `var(--${k.toLowerCase()})`;
  F.phaseColor = (p) => (p === 'Phase 1' ? 'var(--ph1)' : 'var(--ph2)');

  const arc = (cx, cy, r0, r1, a0, a1) => {
    const p = (r, a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const [x0, y0] = p(r1, a0), [x1, y1] = p(r1, a1), [x2, y2] = p(r0, a1), [x3, y3] = p(r0, a0);
    return `M${x0},${y0} A${r1},${r1} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${r0},${r0} 0 ${large} 0 ${x3},${y3} Z`;
  };

  /* ---- donut -------------------------------------------------------- */
  F.donut = function (items, o) {
    o = o || {};
    const size = o.size || 200, cx = size / 2, cy = size / 2, r1 = size / 2 - 4, r0 = r1 * (o.hole || 0.62);
    const total = items.reduce((s, i) => s + i.value, 0) || 1;
    let a = 0, out = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">`;
    items.forEach((it) => {
      if (it.value <= 0) return;
      const da = (it.value / total) * Math.PI * 2;
      const full = da >= Math.PI * 2 - 1e-6;
      const path = full ? arc(cx, cy, r0, r1, 0, Math.PI * 2 - 0.0001) : arc(cx, cy, r0, r1, a, a + da);
      out += `<path class="hit hv" d="${path}" fill="${it.color}" stroke="#fff" stroke-width="2" ${it.attrs || ''} data-tip="${it.tip || ''}"/>`;
      a += da;
    });
    if (o.center) out += `<text x="${cx}" y="${cy - 2}" text-anchor="middle" style="font-size:${o.bigSize || 22}px;font-weight:800;fill:var(--accent)">${o.center[0]}</text><text x="${cx}" y="${cy + 17}" text-anchor="middle" style="font-size:11.5px">${o.center[1] || ''}</text>`;
    return out + '</svg>';
  };

  /* ---- horizontal bars --------------------------------------------- */
  F.hbars = function (items, o) {
    o = o || {};
    const w = o.w || 600, rowH = o.rowH || 44, labelW = o.labelW || 230, valW = o.valW || (o.stack ? 120 : 118), pad = 4;
    const max = o.max || Math.max(...items.map((i) => i.value), 1);
    const h = items.length * rowH + pad * 2;
    const bw = w - labelW - valW;
    let out = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="xMinYMin meet">`;
    if (o.stack) {
      const bwS = w - valW; 
      items.forEach((it, i) => {
        const y = pad + i * rowH, len = Math.max(it.value > 0 ? 3 : 0, (it.value / max) * bwS);
        out += `<g class="hit" ${it.attrs || ''} data-tip="${it.tip || ''}"><rect x="0" y="${y}" width="${w}" height="${rowH}" fill="transparent"/>
          <text x="0" y="${y + 20}" style="font-size:13.5px;fill:var(--ink);font-weight:600">${F.esc(it.label)}</text>
          <text x="${w}" y="${y + 20}" text-anchor="end" style="font-size:12.5px">${it.sub || ''}</text>
          <rect class="hv" x="0" y="${y + 28}" width="${len}" height="26" rx="4" fill="${it.color}"/>
          <text x="${len + 8}" y="${y + 46}" style="font-size:13.5px;font-weight:700;fill:var(--accent)">${it.valText}</text></g>`;
      });
      return out + '</svg>';
    }
    items.forEach((it, i) => {
      const y = pad + i * rowH, len = Math.max(it.value > 0 ? 3 : 0, (it.value / max) * bw);
      out += `<g class="hit" ${it.attrs || ''} data-tip="${it.tip || ''}">
        <rect x="0" y="${y}" width="${w}" height="${rowH}" fill="transparent"/>
        <text x="0" y="${y + rowH / 2 + 4.5}" style="font-size:13px;fill:var(--ink)">${F.esc(it.label)}</text>
        <rect class="hv" x="${labelW}" y="${y + 9}" width="${len}" height="${rowH - 18}" rx="4" fill="${it.color}"/>
        <text x="${labelW + len + 8}" y="${y + rowH / 2 + 4.5}" style="font-size:13px;font-weight:700;fill:var(--accent)">${it.valText}</text>
        ${it.sub ? `<text x="${w}" y="${y + rowH / 2 + 4.5}" text-anchor="end" style="font-size:12px">${it.sub}</text>` : ''}
      </g>`;
    });
    return out + '</svg>';
  };

  /* ---- treemap (squarified) ---------------------------------------- */
  F.treemap = function (items, W, H) {
    const total = items.reduce((s, i) => s + i.value, 0);
    const nodes = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value).map((i) => ({ ...i, area: (i.value / total) * W * H }));
    const rects = [];
    (function squarify(list, x, y, w, h) {
      if (!list.length) return;
      const short = Math.min(w, h);
      const worst = (row, side) => { const s = row.reduce((a, n) => a + n.area, 0); const mx = Math.max(...row.map((n) => n.area)), mn = Math.min(...row.map((n) => n.area)); return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn)); };
      let row = [list[0]], i = 1;
      while (i < list.length && worst(row.concat(list[i]), short) <= worst(row, short)) row.push(list[i++]);
      const s = row.reduce((a, n) => a + n.area, 0);
      if (w >= h) {
        const cw = s / h; let yy = y;
        row.forEach((n) => { const nh = n.area / cw; rects.push({ n, x, y: yy, w: cw, h: nh }); yy += nh; });
        squarify(list.slice(i), x + cw, y, w - cw, h);
      } else {
        const ch = s / w; let xx = x;
        row.forEach((n) => { const nw = n.area / ch; rects.push({ n, x: xx, y, w: nw, h: ch }); xx += nw; });
        squarify(list.slice(i), x, y + ch, w, h - ch);
      }
    })(nodes, 0, 0, W, H);
    let out = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`;
    rects.forEach(({ n, x, y, w, h }) => {
      const tw = w - 14, chars = Math.floor(tw / 6.6);
      let t = n.label; if (t.length > chars) t = t.slice(0, Math.max(0, chars - 1)) + '…';
      out += `<g class="hit" ${n.attrs || ''} data-tip="${n.tip || ''}"><rect class="hv" x="${x + 1}" y="${y + 1}" width="${Math.max(0, w - 2)}" height="${Math.max(0, h - 2)}" rx="6" fill="${n.color}" stroke="#fff" stroke-width="1"/>`;
      if (w > 70 && h > 38) out += `<text x="${x + 9}" y="${y + 20}" style="fill:#fff;font-weight:700;font-size:12.5px">${F.esc(t)}</text><text x="${x + 9}" y="${y + 36}" style="fill:#fff;opacity:.92;font-size:12px">${n.valText}</text>`;
      else if (w > 44 && h > 22) out += `<text x="${x + 6}" y="${y + 15}" style="fill:#fff;font-weight:700;font-size:11px">${F.esc(n.short || '')}</text>`;
      out += '</g>';
    });
    return out + '</svg>';
  };

  /* ---- sparkline-like mini bars ------------------------------------ */
  F.miniBars = function (vals, o) {
    o = o || {};
    const w = o.w || 480, h = o.h || 90, max = Math.max(...vals, 1), bw = w / vals.length;
    let out = `<svg viewBox="0 0 ${w} ${h + 16}" width="100%">`;
    vals.forEach((v, i) => {
      const bh = (v / max) * h;
      out += `<rect x="${i * bw + 1.5}" y="${h - bh}" width="${bw - 3}" height="${Math.max(bh, v > 0 ? 1.5 : 0)}" rx="2" fill="${o.color || 'var(--brand)'}" ${o.attr ? o.attr(i) : ''} data-tip="${o.tip ? o.tip(i, v) : ''}"/>`;
      if (o.label && (bw > 16 || i % 2 === 0)) out += `<text x="${i * bw + bw / 2}" y="${h + 13}" text-anchor="middle" style="font-size:9.5px">${o.label(i)}</text>`;
    });
    return out + '</svg>';
  };
})(typeof window !== 'undefined' ? window : globalThis);

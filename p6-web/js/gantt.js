/* P6 Web – virtualized SVG Gantt chart with baseline, critical path, relationship lines and drag editing. */
(function (g) {
  'use strict';
  const P6 = g.P6;
  const NS = 'http://www.w3.org/2000/svg';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  class Gantt {
    constructor(headEl, scrollEl) {
      this.headEl = headEl; this.sc = scrollEl;
      this.o = { rows: [], rowH: 26, px: 12, minDay: 0, maxDay: 100, sel: new Set(), show: {}, cb: {} };
      this.wrap = document.createElement('div');
      this.wrap.style.cssText = 'position:relative;';
      this.svg = document.createElementNS(NS, 'svg');
      this.svg.setAttribute('class', 'gc gsvg');
      this.wrap.appendChild(this.svg);
      this.sc.appendChild(this.wrap);
      this.hsvg = document.createElementNS(NS, 'svg');
      this.hsvg.setAttribute('class', 'gh');
      this.headEl.appendChild(this.hsvg);
      this.pending = false;
      this.sc.addEventListener('scroll', () => this.schedule());
      new ResizeObserver(() => this.schedule()).observe(this.sc);
      this.bind();
    }
    set(o) {
      Object.assign(this.o, o);
      const { rows, rowH, px, minDay, maxDay } = this.o;
      this.wrap.style.width = Math.ceil((maxDay - minDay + 1) * px + 120) + 'px';
      this.wrap.style.height = rows.length * rowH + 'px';
      if (o.p || o.rels) {
        this.succMap = new Map(); this.predMap = new Map();
        for (const r of this.o.p.rels) {
          if (!this.predMap.has(r.s)) this.predMap.set(r.s, []);
          this.predMap.get(r.s).push(r);
          if (!this.succMap.has(r.p)) this.succMap.set(r.p, []);
          this.succMap.get(r.p).push(r);
        }
      }
      this.rowIdx = new Map();
      rows.forEach((r, i) => { if (r.kind === 't') this.rowIdx.set(r.id, i); });
      this.schedule();
    }
    schedule() {
      if (this.pending) return;
      this.pending = true;
      requestAnimationFrame(() => { this.pending = false; this.draw(); });
    }
    x(day) { return (day - this.o.minDay) * this.o.px - this.sc.scrollLeft; }
    dayAt(clientX) {
      const r = this.sc.getBoundingClientRect();
      return this.o.minDay + (clientX - r.left + this.sc.scrollLeft) / this.o.px;
    }
    scrollToDay(day, frac) {
      this.sc.scrollLeft = Math.max(0, (day - this.o.minDay) * this.o.px - this.sc.clientWidth * (frac == null ? 0.3 : frac));
    }

    // ---------- header ----------
    header(W, d0, d1) {
      const { px, minDay } = this.o;
      const X = (d) => (d - minDay) * px - this.sc.scrollLeft;
      let top = [], bot = [];
      const monthStart = (d) => { const y = P6.ymd(d); return P6.mkDay(y.y, y.m, 1); };
      const nextMonth = (d) => { const y = P6.ymd(d); return P6.mkDay(y.y, y.m + 1, 1); };
      const yearStart = (d) => P6.mkDay(P6.ymd(d).y, 0, 1);
      const nextYear = (d) => P6.mkDay(P6.ymd(d).y + 1, 0, 1);
      const walk = (start, next, label, arr) => { for (let d = start(d0); d <= d1; d = next(d)) arr.push([d, next(d), label(d)]); };
      const mLabel = (d) => { const y = P6.ymd(d); return P6.MON[y.m] + ' ' + y.y; };
      if (px >= 30) {
        walk(monthStart, nextMonth, mLabel, top);
        for (let d = d0; d <= d1; d++) { const y = P6.ymd(d); bot.push([d, d + 1, px >= 40 ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'][P6.dow(d)] + ' ' + y.d : String(y.d)]); }
      } else if (px >= 9) {
        walk(monthStart, nextMonth, mLabel, top);
        let d = d0 - P6.dow(d0);
        for (; d <= d1; d += 7) bot.push([d, d + 7, String(P6.ymd(d).d)]);
      } else if (px >= 2.2) {
        const qStart = (d) => { const y = P6.ymd(d); return P6.mkDay(y.y, y.m - (y.m % 3), 1); };
        const qNext = (d) => { const y = P6.ymd(d); return P6.mkDay(y.y, y.m - (y.m % 3) + 3, 1); };
        walk(qStart, qNext, (d) => { const y = P6.ymd(d); return 'Qtr ' + (Math.floor(y.m / 3) + 1) + ', ' + y.y; }, top);
        walk(monthStart, nextMonth, (d) => (px * 30 >= 56 ? P6.MON[P6.ymd(d).m] : P6.MON[P6.ymd(d).m][0]), bot);
      } else {
        walk(yearStart, nextYear, (d) => String(P6.ymd(d).y), top);
        for (let d = monthStart(d0); d <= d1; d = nextMonth(d)) {
          const y = P6.ymd(d);
          if (y.m % 3 === 0) bot.push([d, P6.mkDay(y.y, y.m + 3, 1), 'Q' + (y.m / 3 + 1)]);
        }
      }
      let s = `<rect x="0" y="0" width="${W}" height="46" fill="none"/>`;
      for (const [a, b, l] of top) {
        const x1 = X(a), x2 = X(b);
        s += `<line x1="${x1}" x2="${x1}" y1="0" y2="46" stroke="var(--line)"/><text x="${Math.max(x1, 0) + 6}" y="15" style="font-size:12px">${esc(l)}</text>`;
        void x2;
      }
      for (const [a, b, l] of bot) {
        const x1 = X(a), x2 = X(b);
        s += `<line x1="${x1}" x2="${x1}" y1="23" y2="46" stroke="var(--line)"/>`;
        if (x2 - x1 > 12 || l.length < 2) s += `<text x="${x1 + (x2 - x1) / 2}" y="39" text-anchor="middle" style="font-size:11px">${esc(l)}</text>`;
      }
      s += `<line x1="0" x2="${W}" y1="23" y2="23" stroke="var(--line)"/>`;
      return { svg: s, bot };
    }

    // ---------- body ----------
    draw() {
      const o = this.o, sc = this.sc;
      if (!o.p) return;
      const W = sc.clientWidth, H = sc.clientHeight, sx = sc.scrollLeft, sy = sc.scrollTop;
      if (!W || !H) return;
      const rh = o.rowH, px = o.px, rows = o.rows, sh = o.show || {};
      this.svg.setAttribute('width', W); this.svg.setAttribute('height', H);
      this.hsvg.setAttribute('width', W); this.hsvg.setAttribute('height', 46);
      const d0 = Math.floor(o.minDay + sx / px), d1 = Math.ceil(o.minDay + (sx + W) / px);
      const r0 = Math.max(0, Math.floor(sy / rh)), r1 = Math.min(rows.length - 1, Math.ceil((sy + H) / rh));
      const X = (d) => (d - o.minDay) * px - sx;
      const hd = this.header(W, d0, d1);
      this.hsvg.innerHTML = hd.svg;

      let s = `<defs><marker id="ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L8 4L0 8z" class="arrow"/></marker><marker id="ahc" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L8 4L0 8z" class="arrow crit"/></marker></defs>`;
      // non-working days of the default calendar
      if (px >= 5) {
        const cal = o.p.cals.find((c) => c.id === o.p.defCal) || o.p.cals[0];
        let run = null;
        for (let d = d0; d <= d1 + 1; d++) {
          const nw = d <= d1 && cal && !P6.isWork(cal, d);
          if (nw && run == null) run = d;
          if (!nw && run != null) { s += `<rect class="we" x="${X(run)}" y="0" width="${(d - run) * px}" height="${H}"/>`; run = null; }
        }
      }
      // grid
      for (const [a] of hd.bot) s += `<line class="gl" x1="${X(a)}" x2="${X(a)}" y1="0" y2="${H}"/>`;
      // rows
      for (let i = r0; i <= r1; i++) {
        const r = rows[i], y = i * rh - sy;
        if (r.kind === 'w') s += `<rect class="row-wbs" x="0" y="${y}" width="${W}" height="${rh}"/>`;
        if (o.spot && r.kind === 't' && o.spot.has(r.id)) s += `<rect class="row-spot" x="0" y="${y}" width="${W}" height="${rh}"/>`;
        if (o.sel.has(r.kind + r.id)) s += `<rect class="row-sel2" x="0" y="${y}" width="${W}" height="${rh}"/>`;
        s += `<line class="gl" x1="0" x2="${W}" y1="${y + rh}" y2="${y + rh}"/>`;
      }
      // data date / today
      if (o.p.dataDate != null) { const x = X(o.p.dataDate + 1); s += `<line class="dd-line" x1="${x}" x2="${x}" y1="0" y2="${H}"/>`; }
      const td = P6.todayDay();
      if (sh.today !== false && td >= o.minDay) { const x = X(td + 0.5); s += `<line class="td-line" x1="${x}" x2="${x}" y1="0" y2="${H}"/>`; }

      // bars
      const dd = o.p.dataDate;
      let bars = '';
      const rowY = (i) => i * rh - sy;
      for (let i = r0; i <= r1; i++) {
        const r = rows[i], y = rowY(i);
        const base = sh.base ? 1 : 0;
        const by = y + (base ? 3 : 6), bh = 12;
        if (r.kind === 'w') {
          const ru = o.ru.get(r.id);
          if (!ru || ru.es == null) continue;
          const x1 = X(ru.es), x2 = X(ru.ef + 1);
          if (x2 < -50 || x1 > W + 50) continue;
          bars += `<g class="bargrp" data-id="${r.id}" data-k="w"><path d="M${x1} ${y + 6}H${x2}V${y + 14}L${x2 - 4} ${y + 17}H${x2 - 6}L${x2 - 8} ${y + 14}H${x1 + 8}L${x1 + 6} ${y + 17}H${x1 + 4}L${x1} ${y + 14}Z" fill="var(--sum)"/></g>`;
          if (sh.labels) bars += `<text class="lbl" x="${x2 + 6}" y="${y + 15}">${esc(P6.fmtDate(ru.ef) + ', ' + r.w.name)}</text>`;
          if (base && ru.bs != null) bars += `<rect class="bar-base" x="${X(ru.bs)}" y="${y + 18}" width="${Math.max(2, (ru.bf - ru.bs + 1) * px)}" height="3"/>`;
          continue;
        }
        const t = r.t;
        if (t.es == null) continue;
        const mile = P6.isMile(t), fm = P6.isFinMile(t);
        const crit = t.crit && sh.crit !== false;
        const x1 = X(t.es), x2 = X(t.ef + 1);
        const cx = fm ? x2 : x1;
        if (mile) {
          if (cx < -30 || cx > W + 300) continue;
          const cy = by + bh / 2;
          bars += `<g class="bargrp bar" data-id="${t.id}" data-k="t"><path data-act="move" d="M${cx} ${cy - 8}l8 8l-8 8l-8 -8z" fill="${t.status === 'C' ? 'var(--bar-act)' : crit ? 'var(--bar-crit)' : 'var(--mile)'}"/>${t.status !== 'C' ? `<circle class="handle" data-act="link" cx="${cx + 14}" cy="${cy}" r="4"/>` : ''}</g>`;
          if (sh.labels) bars += `<text class="lbl" x="${cx + 22}" y="${cy + 4}">${esc(t.name)}</text>`;
        } else {
          const lastX = x2;
          if (lastX < -10 || x1 > W + 400) continue;
          const w = Math.max(3, x2 - x1);
          let inner = '';
          const kn = crit ? 'bar-c' : 'bar-n', ka = crit ? 'bar-ac' : 'bar-a';
          if (t.status === 'C') inner += `<rect data-act="move" class="${ka}" x="${x1}" y="${by}" width="${w}" height="${bh}" rx="2"/>`;
          else if (t.status === 'IP' && t.as != null) {
            const xr = Math.min(Math.max(X((t.rs != null ? t.rs : dd + 1)), x1), x2);
            inner += `<rect data-act="move" class="${ka}" x="${x1}" y="${by}" width="${Math.max(1, xr - x1)}" height="${bh}" rx="2"/>`;
            if (x2 > xr) inner += `<rect data-act="move" class="${kn}" x="${xr}" y="${by}" width="${x2 - xr}" height="${bh}" rx="2"/>`;
          } else inner += `<rect data-act="move" class="${kn}" x="${x1}" y="${by}" width="${w}" height="${bh}" rx="2"/>`;
          if (t.pct > 0 && t.status !== 'C') inner += `<rect pointer-events="none" x="${x1}" y="${by + 4}" width="${Math.max(0, w * t.pct / 100)}" height="4" fill="#fff" opacity=".55"/>`;
          if (t.status !== 'C') inner += `<rect data-act="resize" x="${x2 - 5}" y="${by}" width="6" height="${bh}" fill="transparent" style="cursor:ew-resize"/><circle class="handle" data-act="link" cx="${x2 + 9}" cy="${by + bh / 2}" r="4"/>`;
          bars += `<g class="bargrp bar" data-id="${t.id}" data-k="t">${inner}</g>`;
          if (sh.float && t.tf > 0 && t.lf != null) { const xf = X(t.lf + 1); if (xf > x2) bars += `<line class="fl" x1="${x2}" x2="${xf}" y1="${by + bh / 2}" y2="${by + bh / 2}"/>`; }
          if (sh.labels) bars += `<text class="lbl" x="${Math.max(x2, X(t.lf != null && sh.float && t.tf > 0 ? t.lf + 1 : t.ef + 1)) + 14}" y="${by + 10}">${esc(t.name)}</text>`;
        }
        if (base && t.bs != null) bars += `<rect class="bar-base" x="${X(t.bs)}" y="${y + 17}" width="${Math.max(mile ? 4 : 2, (t.bf - t.bs + 1) * px)}" height="4" rx="1"/>`;
      }

      // relationship lines
      let lines = '';
      if (sh.rels !== false && px >= 1.5) {
        const drawn = new Set();
        const lineFor = (rel) => {
          if (drawn.has(rel.id)) return;
          drawn.add(rel.id);
          const ia = this.rowIdx.get(rel.p), ib = this.rowIdx.get(rel.s);
          if (ia == null || ib == null) return;
          const a = rows[ia].t, b = rows[ib].t;
          if (a.es == null || b.es == null) return;
          const ya = rowY(ia) + (sh.base ? 9 : 12), yb = rowY(ib) + (sh.base ? 9 : 12);
          const aS = X(a.es) - (P6.isMile(a) ? 8 : 0) + 0, aF = P6.isFinMile(a) ? X(a.ef + 1) + 8 : P6.isMile(a) ? X(a.es) + 8 : X(a.ef + 1);
          const bS = P6.isFinMile(b) ? X(b.ef + 1) - 8 : P6.isMile(b) ? X(b.es) - 8 : X(b.es), bF = P6.isFinMile(b) ? X(b.ef + 1) + 8 : P6.isMile(b) ? X(b.es) + 8 : X(b.ef + 1);
          const crit = a.crit && b.crit && sh.crit !== false;
          const dir = yb >= ya ? 1 : -1;
          let d;
          const mid = ya + dir * (rh / 2 + 1);
          if (rel.type === 'FS') d = bS >= aF + 10 ? `M${aF} ${ya}H${aF + 5}V${yb}H${bS - 1}` : `M${aF} ${ya}H${aF + 5}V${mid}H${bS - 7}V${yb}H${bS - 1}`;
          else if (rel.type === 'SS') d = `M${aS} ${ya}H${Math.min(aS, bS) - 6}V${yb}H${bS - 1}`;
          else if (rel.type === 'FF') d = `M${aF} ${ya}H${Math.max(aF, bF) + 6}V${yb}H${bF + 1}`;
          else d = `M${aS} ${ya}H${aS - 6}V${mid}H${bF + 7}V${yb}H${bF + 1}`;
          const marker = rel.type === 'FS' || rel.type === 'SS' ? '' : '';
          void marker;
          lines += `<path class="lnk${crit ? ' crit' : ''}" d="${d}" marker-end="url(#${crit ? 'ahc' : 'ah'})"/>`;
        };
        for (let i = r0; i <= r1; i++) {
          const r = rows[i];
          if (r.kind !== 't') continue;
          for (const rel of this.predMap.get(r.id) || []) lineFor(rel);
          for (const rel of this.succMap.get(r.id) || []) lineFor(rel);
        }
      }
      this.svg.innerHTML = s + lines + bars + '<g id="gdrag"></g>';
      if (P6.onGanttDraw) P6.onGanttDraw();
    }

    // ---------- interaction ----------
    bind() {
      const svg = this.svg;
      const cb = () => this.o.cb || {};
      let drag = null;
      const rowAt = (clientY) => {
        const r = this.sc.getBoundingClientRect();
        return Math.floor((clientY - r.top + this.sc.scrollTop) / this.o.rowH);
      };
      svg.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        const grp = e.target.closest('.bargrp');
        const i = rowAt(e.clientY);
        const row = this.o.rows[i];
        if (!grp) { if (row) cb().onSelect && cb().onSelect(row, e); return; }
        const id = +grp.dataset.id;
        const rr = grp.dataset.k === 'w' ? this.o.rows.find((r) => r.kind === 'w' && r.id === id) : this.o.rows[this.rowIdx.get(id)];
        if (rr && cb().onSelect) cb().onSelect(rr, e);
        const act = e.target.dataset.act;
        if (!act || grp.dataset.k === 'w') return;
        const t = this.o.p.tasks.find((x) => x.id === id);
        if (!t) return;
        drag = { id, act, t, x0: e.clientX, y0: e.clientY, moved: false, day0: this.dayAt(e.clientX) };
        e.preventDefault();
      });
      window.addEventListener('mousemove', (e) => {
        if (!drag) return;
        const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
        if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
        drag.moved = true;
        this.hideTip();
        const layer = this.svg.querySelector('#gdrag');
        const t = drag.t, px = this.o.px, rh = this.o.rowH;
        const i = this.rowIdx.get(t.id);
        const y = i * rh - this.sc.scrollTop;
        if (drag.act === 'move') {
          const dDay = Math.round(dx / px);
          drag.dDay = dDay;
          layer.innerHTML = `<rect class="ghost" x="${this.x(t.es) + dDay * px}" y="${y + 6}" width="${Math.max(3, (t.ef - t.es + 1) * px)}" height="14" rx="2"/>`;
        } else if (drag.act === 'resize') {
          const f = Math.max(t.es, Math.floor(this.dayAt(e.clientX)));
          drag.fin = f;
          layer.innerHTML = `<rect class="ghost" x="${this.x(t.es)}" y="${y + 6}" width="${Math.max(3, (f - t.es + 1) * px)}" height="14" rx="2"/>`;
        } else {
          const x1 = this.x(t.ef + 1), r = this.sc.getBoundingClientRect();
          layer.innerHTML = `<line x1="${x1}" y1="${y + 13}" x2="${e.clientX - r.left}" y2="${e.clientY - r.top}" stroke="var(--accent)" stroke-width="2" stroke-dasharray="4 3"/>`;
        }
      });
      window.addEventListener('mouseup', (e) => {
        if (!drag) return;
        const d = drag; drag = null;
        const layer = this.svg.querySelector('#gdrag'); if (layer) layer.innerHTML = '';
        if (!d.moved) return;
        if (d.act === 'move' && d.dDay) cb().onMove && cb().onMove(d.t, d.dDay);
        else if (d.act === 'resize' && d.fin != null) cb().onResize && cb().onResize(d.t, d.fin);
        else if (d.act === 'link') {
          const row = this.o.rows[rowAt(e.clientY)];
          if (row && row.kind === 't' && row.id !== d.t.id) {
            const r = this.sc.getBoundingClientRect();
            const x = e.clientX - r.left + this.sc.scrollLeft;
            const bx = (row.t.es - this.o.minDay) * this.o.px, bw = (row.t.ef + 1 - row.t.es) * this.o.px;
            const toEnd = x > bx + bw / 2;
            cb().onLink && cb().onLink(d.t, row.t, toEnd ? 'FF' : 'FS');
          }
        }
      });
      svg.addEventListener('dblclick', (e) => {
        const grp = e.target.closest('.bargrp');
        const row = grp ? this.o.rows[this.rowIdx.get(+grp.dataset.id)] : this.o.rows[rowAt(e.clientY)];
        if (row && cb().onOpen) cb().onOpen(row);
      });
      svg.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const row = this.o.rows[rowAt(e.clientY)];
        if (row && cb().onCtx) cb().onCtx(row, e);
      });
      svg.addEventListener('mousemove', (e) => {
        if (drag) return;
        const grp = e.target.closest('.bargrp');
        if (!grp || grp.dataset.k !== 't') return this.hideTip();
        cb().onTip && cb().onTip(+grp.dataset.id, e);
      });
      svg.addEventListener('mouseleave', () => this.hideTip());
    }
    hideTip() { const t = document.getElementById('tip'); if (t) t.hidden = true; }
  }
  P6.Gantt = Gantt;
  P6.esc = esc;
})(window);

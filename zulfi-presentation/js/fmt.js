/* Word-style formatting toolbar for edit mode: font, size, bold, italic, underline, colour, highlight, alignment.
   - inside an editable text block (dashed box): formats the selected words
   - on any other text (click it first – chart labels, tiles, table cells…): formats that whole text */
(function (G) {
  const Z = G.Z, A = Z.app;
  const $ = (s, r) => (r || document).querySelector(s);
  const SAR = ['#00778B', '#3D3935', '#768692', '#59CBE8', '#71B2C9', '#C8C9C7', '#CB2C30', '#F1B434', '#FFFFFF', '#000000'];
  const FONTS = [['', 'SAR (default)', 'الخط الافتراضي (سار)'], ['Tahoma', 'Tahoma', 'Tahoma'], ['Segoe UI', 'Segoe UI', 'Segoe UI'], ['Arial', 'Arial', 'Arial'], ['Times New Roman', 'Times New Roman', 'Times New Roman'], ['Georgia', 'Georgia', 'Georgia'], ['Courier New', 'Courier New', 'Courier New'], ['Traditional Arabic', 'Traditional Arabic', 'Traditional Arabic'], ['Simplified Arabic', 'Simplified Arabic', 'Simplified Arabic']];
  const SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 60, 72];
  let savedRange = null, savedEd = null;

  const inEd = (n) => { const e = n && (n.nodeType === 1 ? n : n.parentElement); return e && e.closest ? e.closest('#stage [data-ed][contenteditable="true"]') : null; };
  document.addEventListener('selectionchange', () => {
    const s = document.getSelection(); if (!s || !s.rangeCount) return;
    const ed = inEd(s.anchorNode);
    if (ed) { savedRange = s.getRangeAt(0).cloneRange(); savedEd = ed; A.fmtMode = 'ed'; A.ovTarget && A.ovTarget.classList.remove('fmt-target'); A.ovTarget = null; }
  });

  const ovKey = (el) => 'ovs:' + (A.mode ? A.lang : 'en') + ':' + el.getAttribute('data-ovk');
  const withEd = (fn) => {
    const el = savedEd; if (!el || !document.body.contains(el) || !savedRange) return false;
    el.focus(); const s = document.getSelection(); s.removeAllRanges(); s.addRange(savedRange);
    document.execCommand('styleWithCSS', false, true);
    fn(el);
    if (s.rangeCount) savedRange = s.getRangeAt(0).cloneRange();
    el.dataset.dirty = '1'; A.saveEd(el); delete el.dataset.dirty;
    return true;
  };
  const withOv = (patch, toggle) => {
    const el = A.ovTarget; if (!el || !document.body.contains(el)) return false;
    const st = A.s.st; st.notes = st.notes || {}; const k = ovKey(el);
    let cur = {}; try { cur = st.notes[k] ? JSON.parse(st.notes[k]) : {}; } catch (e) { cur = {}; }
    if (patch.clear) { delete st.notes[k]; A.styleEl(el, {}); A.save(); return true; }
    if (toggle) { const cs = getComputedStyle(el); const now = toggle === 'b' ? parseInt(cs.fontWeight, 10) >= 600 : toggle === 'i' ? cs.fontStyle === 'italic' : /underline/.test(cs.textDecorationLine || ''); cur[toggle] = cur[toggle] == null ? !now : !cur[toggle]; }
    Object.assign(cur, patch); st.notes[k] = JSON.stringify(cur); A.styleEl(el, cur); A.save();
    return true;
  };
  const apply = (edFn, ovPatch, toggle) => { if (A.fmtMode === 'ov' && A.ovTarget) { if (withOv(ovPatch, toggle)) return; } if (!withEd(edFn)) withOv(ovPatch, toggle); };

  const act = {
    bold: () => apply(() => document.execCommand('bold'), {}, 'b'),
    italic: () => apply(() => document.execCommand('italic'), {}, 'i'),
    underline: () => apply(() => document.execCommand('underline'), {}, 'u'),
    color: (c) => apply(() => document.execCommand('foreColor', false, c), { c }),
    hilite: (c) => apply(() => document.execCommand('hiliteColor', false, c), { bg: c }),
    font: (f) => apply(() => { if (f) document.execCommand('fontName', false, f); else document.execCommand('removeFormat'); }, { f }),
    size: (px) => apply((el) => { document.execCommand('fontSize', false, '7'); el.querySelectorAll('span,font').forEach((n) => { if (n.style && n.style.fontSize === 'xxx-large') n.style.fontSize = px + 'px'; if (n.tagName === 'FONT' && n.getAttribute('size') === '7') { n.removeAttribute('size'); n.style.fontSize = px + 'px'; } }); }, { s: px }),
    align: (a) => apply(() => document.execCommand(a === 'center' ? 'justifyCenter' : a === 'right' ? 'justifyRight' : 'justifyLeft'), {}),
    clear: () => apply(() => document.execCommand('removeFormat'), { clear: true }),
  };

  const closeDD = () => document.querySelectorAll('.fmt-dd').forEach((d) => d.remove());
  const dd = (btn, items, onPick) => {
    closeDD(); const r = btn.getBoundingClientRect(), d = document.createElement('div'); d.className = 'fmt-dd';
    d.style.left = Math.max(4, Math.min(innerWidth - 170, r.left)) + 'px'; d.style.top = r.bottom + 4 + 'px';
    items.forEach(([v, label, style]) => { const i = document.createElement('div'); i.textContent = label; if (style) i.style.cssText = style; i.addEventListener('mousedown', (e) => e.preventDefault()); i.addEventListener('click', () => { onPick(v); closeDD(); }); d.appendChild(i); });
    document.body.appendChild(d);
  };

  A.renderFmt = () => {
    const bar = $('#fmtbar'); if (!bar) return;
    const L = A.L, sw = SAR.map((c) => `<button class="sw" data-c="${c}" style="background:${c}" title="${c}"></button>`).join('');
    bar.innerHTML = `<span class="lbl">${L('Format', 'التنسيق')}</span>
      <button class="fb wide" data-f="font">${L('Font', 'الخط')} ▾</button><button class="fb" data-f="size" style="min-width:64px">${L('Size', 'الحجم')} ▾</button>
      <span class="sep"></span>
      <button class="fb" data-f="bold" title="${L('Bold', 'عريض')}"><b>B</b></button><button class="fb" data-f="italic" title="${L('Italic', 'مائل')}"><i>I</i></button><button class="fb" data-f="underline" title="${L('Underline', 'تسطير')}"><u>U</u></button>
      <span class="sep"></span><span class="lbl">${L('Colour', 'اللون')}</span>${sw}<label class="fb" title="${L('Custom colour', 'لون مخصص')}" style="position:relative;overflow:hidden">🎨<input type="color" data-f="custom" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label>
      <span class="sep"></span><span class="lbl">${L('Highlight', 'تمييز')}</span><button class="sw" data-h="#FFF2A8" style="background:#FFF2A8" title="${L('Yellow', 'أصفر')}"></button><button class="sw" data-h="#CFEFF5" style="background:#CFEFF5"></button><button class="sw" data-h="#FFD9D9" style="background:#FFD9D9"></button><button class="fb" data-h="transparent" title="${L('No highlight', 'بدون تمييز')}">⌀</button>
      <span class="sep"></span>
      <button class="fb" data-f="alR" title="${L('Align right', 'محاذاة لليمين')}">⇥</button><button class="fb" data-f="alC" title="${L('Centre', 'توسيط')}">≡</button><button class="fb" data-f="alL" title="${L('Align left', 'محاذاة لليسار')}">⇤</button>
      <span class="sep"></span><button class="fb" data-f="clear" title="${L('Clear formatting', 'مسح التنسيق')}">Tx</button>
      <span class="lbl" style="margin-inline-start:8px">${L('Select words inside a dashed box, or click any text, then format', 'حدّد كلمات داخل مربع متقطع، أو اضغط على أي نص ثم نسّقه')}</span>`;
  };
  A.syncFmt = () => {};
  A.initFmt = () => {
    let bar = $('#fmtbar'); if (!bar) { bar = document.createElement('div'); bar.id = 'fmtbar'; const eb = $('#edbar'); (eb || $('#bar')).after(bar); }
    A.renderFmt();
    bar.addEventListener('mousedown', (e) => { if (!e.target.closest('input[type=color]')) e.preventDefault(); });
    bar.addEventListener('click', (e) => {
      const t = e.target.closest('[data-f],[data-c],[data-h]'); if (!t) return;
      if (t.dataset.c) return act.color(t.dataset.c);
      if (t.dataset.h) return act.hilite(t.dataset.h);
      const f = t.dataset.f;
      if (f === 'bold' || f === 'italic' || f === 'underline') return act[f]();
      if (f === 'font') return dd(t, FONTS.map(([v, en, ar]) => [v, A.L(en, ar), v ? `font-family:${v}` : '']), act.font);
      if (f === 'size') return dd(t, SIZES.map((n) => [n, String(n)]), act.size);
      if (f === 'alR') return act.align('right'); if (f === 'alC') return act.align('center'); if (f === 'alL') return act.align('left');
      if (f === 'clear') return act.clear();
    });
    bar.addEventListener('input', (e) => { if (e.target.dataset.f === 'custom') act.color(e.target.value); });
    document.addEventListener('mousedown', (e) => { if (!e.target.closest('.fmt-dd') && !e.target.closest('#fmtbar')) closeDD(); });
  };
})(window);

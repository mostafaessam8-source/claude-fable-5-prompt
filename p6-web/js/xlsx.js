/* P6 Web – "Export to Excel": builds a real .xlsx (no libraries) with WBS levels as Excel row groups (outline),
   WBS/group colours, indentation, true dates and numbers, frozen header and filter. */
(function (g) {
  'use strict';
  const P6 = g.P6, App = g.App, D = App.dialogs;
  const t = (k, ...a) => P6.t(k, ...a);
  const F = () => App.cfg;
  const enc = new TextEncoder();
  const xe = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

  // ---- minimal ZIP (store) ----
  const CRC = (() => { const tb = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; tb[n] = c >>> 0; } return tb; })();
  const crc32 = (u) => { let c = 0xffffffff; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function zip(files) {
    const parts = [], cen = []; let off = 0;
    const w16 = (a, v) => a.push(v & 255, (v >> 8) & 255), w32 = (a, v) => a.push(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255);
    for (const [name, text] of files) {
      const nm = enc.encode(name), data = enc.encode(text), crc = crc32(data), h = [];
      w32(h, 0x04034b50); w16(h, 20); w16(h, 0x0800); w16(h, 0); w16(h, 0); w16(h, 0x21); w32(h, crc); w32(h, data.length); w32(h, data.length); w16(h, nm.length); w16(h, 0);
      parts.push(new Uint8Array(h), nm, data);
      const c = []; w32(c, 0x02014b50); w16(c, 20); w16(c, 20); w16(c, 0x0800); w16(c, 0); w16(c, 0); w16(c, 0x21); w32(c, crc); w32(c, data.length); w32(c, data.length); w16(c, nm.length); w16(c, 0); w16(c, 0); w16(c, 0); w16(c, 0); w32(c, 0); w32(c, off);
      cen.push(new Uint8Array(c), nm); off += h.length + nm.length + data.length;
    }
    const csz = cen.reduce((a, b) => a + b.length, 0), e = []; w32(e, 0x06054b50); w16(e, 0); w16(e, 0); w16(e, files.length); w16(e, files.length); w32(e, csz); w32(e, off); w16(e, 0);
    return new Blob([...parts, ...cen, new Uint8Array(e)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  const colName = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const WCOL = [['#0000ff', '#ffffff'], ['#66ff66', '#000000'], ['#ffff00', '#000000'], ['#0000ff', '#ffffff'], ['#ff0000', '#ffffff']];
  const START_CT = ['SNET', 'SNLT', 'MSO'], FIN_CT = ['FNET', 'FNLT', 'MFO'];
  const argb = (hex) => 'FF' + String(hex).replace('#', '').toUpperCase().padStart(6, '0');

  App.exportXlsx = function (scope) {
    if (!App.p) return;
    const ctx = App.getCtx(), cols = F().cols, wpal = (F().grp && F().grp.wbsColors) || null;
    let rows = App.rows; const sel = rows.filter((r) => App.sel.has(r.kind + r.id));
    if (scope === 'sel' ? sel.length : scope !== 'all' && sel.length > 1) rows = sel;

    // style registry
    const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'], fillIx = new Map();
    const fonts = ['<font><sz val="11"/><name val="Calibri"/></font>'], fontIx = new Map();
    const fmts = new Map(), xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'], xfIx = new Map();
    const fillOf = (hex) => { if (!hex) return 0; if (!fillIx.has(hex)) { fillIx.set(hex, fills.length); fills.push(`<fill><patternFill patternType="solid"><fgColor rgb="${argb(hex)}"/><bgColor indexed="64"/></patternFill></fill>`); } return fillIx.get(hex); };
    const fontOf = (bold, color) => { const k = (bold ? 'b' : '') + (color || ''); if (!k) return 0; if (!fontIx.has(k)) { fontIx.set(k, fonts.length); fonts.push(`<font>${bold ? '<b/>' : ''}<sz val="11"/>${color ? `<color rgb="${argb(color)}"/>` : ''}<name val="Calibri"/></font>`); } return fontIx.get(k); };
    const fmtOf = (code) => { if (!code) return 0; if (!fmts.has(code)) fmts.set(code, 164 + fmts.size); return fmts.get(code); };
    const xf = (o) => {
      const key = [o.fill || '', o.bold ? 1 : 0, o.color || '', o.fmt || '', o.indent || 0, o.align || ''].join('|');
      if (!xfIx.has(key)) {
        xfIx.set(key, xfs.length);
        const al = o.indent || o.align ? `<alignment${o.align ? ` horizontal="${o.align}"` : o.indent ? ' horizontal="left"' : ''}${o.indent ? ` indent="${o.indent}"` : ''}/>` : '';
        xfs.push(`<xf numFmtId="${fmtOf(o.fmt)}" fontId="${fontOf(o.bold, o.color)}" fillId="${fillOf(o.fill)}" borderId="0" xfId="0" applyFill="1" applyFont="1" applyNumberFormat="1"${al ? ' applyAlignment="1"' : ''}>${al}</xf>`);
      }
      return xfIx.get(key);
    };

    const FMT = { money: '#,##0.00', days: '0.00', num: '0.00', idx: '0.00', units: '0.00"h"', pct: '0"%"', date: 'dd-mmm-yyyy' };
    const sheetRows = [];
    // header
    sheetRows.push(`<row r="1" ht="20" customHeight="1">${cols.map((c, i) => `<c r="${colName(i)}1" s="${xf({ fill: '#d9d9d9', bold: true, align: i === 0 ? 'left' : '' })}" t="inlineStr"><is><t>${xe(c.title || t('col_' + c.k))}</t></is></c>`).join('')}</row>`);
    let maxLv = 0;
    rows.forEach((row, ri) => {
      const rn = ri + 2, band = row.kind !== 't'; let bg = '', fg = '';
      if (band) { const lv = row.level % WCOL.length; bg = row.kind === 'g' ? row.color : wpal ? wpal[row.level % wpal.length] : WCOL[lv][0]; fg = row.kind === 'w' && !wpal ? WCOL[lv][1] : P6.contrast(bg); }
      const lvl = Math.min(7, Math.max(0, row.level || 0)); maxLv = Math.max(maxLv, lvl);
      const cells = cols.map((c, i) => {
        const r = P6.regCell(c.k, row, ctx), d = (P6.colDefs || {})[c.k] || {}; const ref = colName(i) + rn;
        const base = { fill: bg, bold: band, color: fg, indent: i === 0 ? Math.max(0, row.level || 0) : 0 };
        let text = r ? r.text : ''; if (band && i === 0 && row.w && !text) text = row.w.name;
        const tk = row.kind === 't' ? row.t : null;
        if (d.kind === 'date' && r && typeof r.v === 'number') {
          if (tk && ((c.k === 'es' && tk.type === 'TT_FinMile') || (c.k === 'ef' && P6.isMile(tk) && tk.type !== 'TT_FinMile'))) return `<c r="${ref}" s="${xf(base)}"/>`;
          return `<c r="${ref}" s="${xf(Object.assign({}, base, { fmt: FMT.date, align: i === 0 ? '' : 'right' }))}"><v>${r.v + 25569}</v></c>`;
        }
        if (r && typeof r.v === 'number' && isFinite(r.v) && FMT[d.kind] && d.kind !== 'date') return `<c r="${ref}" s="${xf(Object.assign({}, base, { fmt: FMT[d.kind] }))}"><v>${r.v}</v></c>`;
        if (text === '') return `<c r="${ref}" s="${xf(base)}"/>`;
        return `<c r="${ref}" s="${xf(base)}" t="inlineStr"><is><t xml:space="preserve">${xe(text)}</t></is></c>`;
      }).join('');
      sheetRows.push(`<row r="${rn}"${lvl ? ` outlineLevel="${lvl}"` : ''}>${cells}</row>`);
    });
    const last = colName(cols.length - 1), n = rows.length + 1;
    const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><outlinePr summaryBelow="0"/></sheetPr><dimension ref="A1:${last}${n}"/><sheetViews><sheetView workbookViewId="0"${App.cfg.lang === 'ar' ? '' : ''}><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15" outlineLevelRow="${maxLv}"/><cols>${cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.max(8, Math.min(70, Math.round(c.w / 6.5)))}" customWidth="1"/>`).join('')}</cols><sheetData>${sheetRows.join('')}</sheetData><autoFilter ref="A1:${last}${n}"/></worksheet>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${fmts.size ? `<numFmts count="${fmts.size}">${[...fmts].map(([c, id]) => `<numFmt numFmtId="${id}" formatCode="${xe(c)}"/>`).join('')}</numFmts>` : ''}<fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
    const sname = (App.p.name || 'Activities').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Activities';
    const files = [
      ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
      ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xe(sname)}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
      ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
      ['xl/styles.xml', styles], ['xl/worksheets/sheet1.xml', sheet]
    ];
    const blob = zip(files), name = (App.p.name || 'project').replace(/[^\w؀-ۿ.-]+/g, '_') + '.xlsx';
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    App.toast(t('xlsx_done', rows.length));
    return { blob, rows: rows.length };
  };
})(window);

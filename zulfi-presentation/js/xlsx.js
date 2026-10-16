/* Minimal .xlsx writer (no libraries, works offline): styled sheets, formulas, frozen panes, zip "store" */
(function (G) {
  const Z = G.Z;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const colL = (i) => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };
  const enc = new TextEncoder();

  /* SAR look: SAR Blue 00778B, SAR Black 3D3935 */
  const FONTS = [
    '<font><sz val="11"/><color rgb="FF3D3935"/><name val="Calibri"/></font>',
    '<font><b/><sz val="16"/><color rgb="FF00778B"/><name val="Calibri"/></font>',
    '<font><i/><sz val="10"/><color rgb="FF6B7780"/><name val="Calibri"/></font>',
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>',
    '<font><sz val="9"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>',
    '<font><b/><sz val="11"/><color rgb="FF3D3935"/><name val="Calibri"/></font>',
    '<font><sz val="9"/><color rgb="FF6B7780"/><name val="Calibri"/></font>',
  ];
  const FILLS = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FF00778B"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE3F1F4"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FF3D3935"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF5F8F9"/></patternFill></fill>'];
  const BORDERS = ['<border><left/><right/><top/><bottom/><diagonal/></border>',
    '<border><left style="thin"><color rgb="FFC9D3D8"/></left><right style="thin"><color rgb="FFC9D3D8"/></right><top style="thin"><color rgb="FFC9D3D8"/></top><bottom style="thin"><color rgb="FFC9D3D8"/></bottom><diagonal/></border>'];
  const NUM = { n0: 164, pct: 165, date: 166, neg: 167 };
  // [font, fill, border, numFmt, halign, wrap]
  const XF = {
    def: [0, 0, 0, 0], title: [1, 0, 0, 0], sub: [2, 0, 0, 0], head: [3, 2, 1, 0, 'center', 1], headL: [3, 2, 1, 0, 'left', 1], headSub: [4, 2, 1, 0, 'center'],
    lab: [0, 0, 1, 0, 'left'], num: [0, 0, 1, NUM.n0], neg: [0, 0, 1, NUM.neg], pct: [0, 0, 1, NUM.pct], date: [0, 0, 1, NUM.date, 'center'], txt: [0, 0, 1, 0, 'left', 1],
    sLab: [5, 3, 1, 0, 'left'], sNum: [5, 3, 1, NUM.n0], sPct: [5, 3, 1, NUM.pct], tLab: [3, 4, 1, 0, 'left'], tNum: [3, 4, 1, NUM.n0], tPct: [3, 4, 1, NUM.pct],
    zLab: [0, 5, 1, 0, 'left'], zNum: [0, 5, 1, NUM.n0], note: [6, 0, 0, 0],
  };
  const XFK = Object.keys(XF);
  const styles = () => {
    const x = XFK.map((k) => { const [f, fl, b, n, h, w] = XF[k]; return `<xf numFmtId="${n}" fontId="${f}" fillId="${fl}" borderId="${b}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"${h ? ` horizontal="${h}"` : ''}${w ? ' wrapText="1"' : ''}/></xf>`; }).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="4"><numFmt numFmtId="164" formatCode="#,##0"/><numFmt numFmtId="165" formatCode="0.0%"/><numFmt numFmtId="166" formatCode="dd\\-mmm\\-yy"/><numFmt numFmtId="167" formatCode="#,##0;[Red]\\-#,##0"/></numFmts><fonts count="${FONTS.length}">${FONTS.join('')}</fonts><fills count="${FILLS.length}">${FILLS.join('')}</fills><borders count="${BORDERS.length}">${BORDERS.join('')}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${XFK.length}">${x}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  };
  const sid = (k) => Math.max(0, XFK.indexOf(k));

  const sheetXml = (sh) => {
    const rows = sh.rows.map((r, ri) => {
      const h = sh.heights && sh.heights[ri] ? ` ht="${sh.heights[ri]}" customHeight="1"` : '';
      const cs = (r || []).map((c, ci) => {
        if (c == null) return '';
        const ref = colL(ci) + (ri + 1), s = ` s="${sid(c.s || 'def')}"`;
        if (c.f) return `<c r="${ref}"${s}><f>${esc(c.f)}</f><v>${c.v}</v></c>`;
        if (typeof c.v === 'number') return `<c r="${ref}"${s}><v>${c.v}</v></c>`;
        if (c.v === '' || c.v == null) return `<c r="${ref}"${s}/>`;
        return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(c.v)}</t></is></c>`;
      }).join('');
      return `<row r="${ri + 1}"${h}>${cs}</row>`;
    }).join('');
    const fr = sh.freeze ? `<pane xSplit="${sh.freeze.x || 0}" ySplit="${sh.freeze.y || 0}" topLeftCell="${colL(sh.freeze.x || 0)}${(sh.freeze.y || 0) + 1}" activePane="bottomRight" state="frozen"/>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><tabColor rgb="FF00778B"/><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView showGridLines="0" workbookViewId="0"${sh.rtl ? ' rightToLeft="1"' : ''}${sh.first ? ' tabSelected="1"' : ''}>${fr}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols>${sh.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${rows}</sheetData><pageMargins left="0.4" right="0.4" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/><headerFooter><oddFooter>&amp;L${esc(sh.footer || '')}&amp;RPage &amp;P of &amp;N</oddFooter></headerFooter></worksheet>`;
  };

  /* zip (stored) */
  const T = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc = (u) => { let c = 0xffffffff; for (let i = 0; i < u.length; i++) c = T[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const zip = (files) => {
    const parts = [], cen = []; let off = 0;
    const u16 = (v) => [v & 255, (v >> 8) & 255], u32 = (v) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
    files.forEach(([name, text]) => {
      const nb = enc.encode(name), d = enc.encode(text), c = crc(d);
      const lh = new Uint8Array([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(c), ...u32(d.length), ...u32(d.length), ...u16(nb.length), ...u16(0)]);
      parts.push(lh, nb, d);
      cen.push(new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(c), ...u32(d.length), ...u32(d.length), ...u16(nb.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), nb);
      off += lh.length + nb.length + d.length;
    });
    let cl = 0; cen.forEach((a) => (cl += a.length));
    const end = new Uint8Array([0x50, 0x4b, 5, 6, 0, 0, 0, 0, ...u16(files.length), ...u16(files.length), ...u32(cl), ...u32(off), 0, 0]);
    return new Blob([...parts, ...cen, end], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  };

  Z.xlsx = {
    col: colL,
    serial: (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000 + 25569; },
    blob(sheets) {
      sheets.forEach((s, i) => (s.first = i === 0));
      const ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>';
      const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
      const wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>';
      const wrels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
      return zip([['[Content_Types].xml', ct], ['_rels/.rels', rels], ['xl/workbook.xml', wb], ['xl/_rels/workbook.xml.rels', wrels], ['xl/styles.xml', styles()], ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)])]);
    },
  };
})(window);

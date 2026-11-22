/* P6 Web – generic Excel workbook writer (multi-sheet, styled header, typed cells) and a small .xlsx reader (no libraries).
   Writer: App.xlsxBook(fileName, sheets) – sheets = [{ name, title?, cols:[{h,w,t}], rows:[[...]], fill?:(row,i)=>hex }]
   Reader: P6.readXlsx(arrayBuffer) -> Promise<string[][]|number[][]> (first worksheet). */
(function (g) {
  'use strict';
  const P6 = g.P6, App = g.App;
  const xe = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const colName = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const argb = (h) => 'FF' + String(h).replace('#', '').toUpperCase().padStart(6, '0');

  // t: 's' text, 'n' number (0.##), 'i' integer, 'm' money #,##0.00, 'p' percent value (45 -> 45%), 'd' date (P6 day number -> real Excel date), 'f' fixed 2 decimals
  const FMT = { n: 'General', i: '0', m: '#,##0.00', p: '0.0"%"', pp: '0.0%', c0: '#,##0', d: 'dd-mmm-yyyy', f: '0.00' };


  // ---------- drawings: SAR logo picture and native line chart ----------
  const NSX = 'xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"';
  const PX = 9525;
  function chartXml(ch, q, rg) {
    const ref = (col, a, b) => `${q}!$${colName(col)}$${a}` + (b ? `:$${colName(col)}$${b}` : '');
    const ser = ch.series.map((s, i) => `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:strRef><c:f>${xe(ref(s.col, rg.hr))}</c:f></c:strRef></c:tx><c:spPr><a:ln w="${s.w || 28575}" cap="rnd"><a:solidFill><a:srgbClr val="${String(s.color).replace('#', '')}"/></a:solidFill>${s.dash ? '<a:prstDash val="dash"/>' : ''}<a:round/></a:ln></c:spPr><c:marker><c:symbol val="none"/></c:marker><c:cat><c:strRef><c:f>${xe(ref(ch.catCol, rg.first, rg.last))}</c:f></c:strRef></c:cat><c:val><c:numRef><c:f>${xe(ref(s.col, rg.first, rg.last))}</c:f></c:numRef></c:val><c:smooth val="0"/></c:ser>`).join('');
    const tx = (t, sz) => `<c:tx><c:rich><a:bodyPr/><a:p><a:pPr><a:defRPr sz="${sz}" b="1"><a:solidFill><a:srgbClr val="00778B"/></a:solidFill></a:defRPr></a:pPr><a:r><a:rPr lang="en-US" sz="${sz}" b="1"><a:solidFill><a:srgbClr val="00778B"/></a:solidFill></a:rPr><a:t>${xe(t)}</a:t></a:r></a:p></c:rich></c:tx>`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:roundedCorners val="0"/><c:chart><c:title>${tx(ch.title || '', 1400)}<c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/><c:plotArea><c:layout/><c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${ser}<c:marker val="1"/><c:axId val="50010"/><c:axId val="50020"/></c:lineChart><c:catAx><c:axId val="50010"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:txPr><a:bodyPr rot="-2700000"/><a:p><a:pPr><a:defRPr sz="900"/></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr><c:crossAx val="50020"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx><c:valAx><c:axId val="50020"/><c:scaling><c:orientation val="minMax"/><c:min val="0"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="C8C9C7"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="${ch.pct === false ? '#,##0' : '0%'}" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="50010"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx></c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
  }
  function addDrawings(files, sheets, nm) {
    let extra = '', logo = false;
    sheets.forEach((sh, i) => {
      if (!sh.chart && !sh.logo) return;
      const n = i + 1, q = "'" + nm(sh, i).replace(/'/g, "''") + "'", rels = [], anchors = []; let rid = 1;
      if (sh.logo) {
        logo = true; const w = 118, h = 36;
        rels.push(`<Relationship Id="rId${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/sarlogo.png"/>`);
        anchors.push(`<xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>38100</xdr:rowOff></xdr:from><xdr:ext cx="${w * PX}" cy="${h * PX}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${rid + 1}" name="SAR logo" descr="SAR logo"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId${rid}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${w * PX}" cy="${h * PX}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`);
        rid++;
      }
      if (sh.chart) {
        const a = sh.chart.anchor || { col: 12, row: 4, w: 760, h: 420 };
        files.push([`xl/charts/chart${n}.xml`, chartXml(sh.chart, q, sh._rng)]);
        rels.push(`<Relationship Id="rId${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${n}.xml"/>`);
        anchors.push(`<xdr:oneCellAnchor><xdr:from><xdr:col>${a.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${a.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="${a.w * PX}" cy="${a.h * PX}"/><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${rid + 1}" name="Chart ${n}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="rId${rid}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:oneCellAnchor>`);
        extra += `<Override PartName="/xl/charts/chart${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`;
      }
      files.push([`xl/drawings/drawing${n}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr ${NSX}>${anchors.join('')}</xdr:wsDr>`]);
      files.push([`xl/drawings/_rels/drawing${n}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`]);
      files.push([`xl/worksheets/_rels/sheet${n}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${n}.xml"/></Relationships>`]);
      extra += `<Override PartName="/xl/drawings/drawing${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`;
    });
    if (logo) { const bin = atob(P6.SAR_LOGO_B64 || ''), u = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k); files.push(['xl/media/sarlogo.png', u]); extra = '<Default Extension="png" ContentType="image/png"/>' + extra; }
    files[0][1] = files[0][1].replace('</Types>', extra + '</Types>');
  }

  App.buildXlsxBlob = function (sheets) {
    const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'], fillIx = new Map();
    const fonts = ['<font><sz val="11"/><name val="Calibri"/></font>', '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>', '<font><b/><sz val="14"/><color rgb="FF00778B"/><name val="Calibri"/></font>', '<font><b/><sz val="11"/><name val="Calibri"/></font>'];
    const fmts = new Map(), xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'], xfIx = new Map();
    const fillOf = (h) => { if (!h) return 0; if (!fillIx.has(h)) { fillIx.set(h, fills.length); fills.push(`<fill><patternFill patternType="solid"><fgColor rgb="${argb(h)}"/><bgColor indexed="64"/></patternFill></fill>`); } return fillIx.get(h); };
    const fmtOf = (c) => { if (!c || c === 'General') return 0; if (!fmts.has(c)) fmts.set(c, 164 + fmts.size); return fmts.get(c); };
    const xf = (o) => { const k = [o.fill || '', o.font || 0, o.fmt || '', o.wrap ? 1 : 0, o.al || '', o.indent || 0].join('|'); if (!xfIx.has(k)) { xfIx.set(k, xfs.length); xfs.push(`<xf numFmtId="${fmtOf(o.fmt)}" fontId="${o.font || 0}" fillId="${fillOf(o.fill)}" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1"${o.wrap || o.al || o.indent ? ' applyAlignment="1"><alignment' + (o.wrap ? ' wrapText="1"' : '') + (o.al || o.indent ? ` horizontal="${o.al || 'left'}"` : '') + (o.indent ? ` indent="${o.indent}"` : '') + ' vertical="top"/></xf>' : '/>'}`); } return xfIx.get(k); };
    const sheetXml = sheets.map((sh) => {
      const rows = []; let r = sh.logo ? 3 : 1;
      if (sh.title) { rows.push(`<row r="${r}" ht="24" customHeight="1"><c r="A${r}" s="${xf({ font: 2 })}" t="inlineStr"><is><t>${xe(sh.title)}</t></is></c></row>`); r += 1; if (sh.subtitle) { rows.push(`<row r="${r}"><c r="A${r}" t="inlineStr"><is><t>${xe(sh.subtitle)}</t></is></c></row>`); r += 1; } r += 1; }
      const hr = r;
      rows.push(`<row r="${r}" ht="20" customHeight="1">${sh.cols.map((c, i) => `<c r="${colName(i)}${r}" s="${xf({ fill: '#00778B', font: 1, wrap: 1 })}" t="inlineStr"><is><t>${xe(c.h)}</t></is></c>`).join('')}</row>`); r++;
      (sh.rows || []).forEach((row, ri) => {
        const bg = sh.fill ? sh.fill(row, ri) : null, stl = sh.style ? sh.style(row, ri) || {} : {};
        rows.push(`<row r="${r}">${sh.cols.map((c, i) => {
          const v = row[i], ref = colName(i) + r, t = c.t || 's', base = { font: stl.bold ? 3 : 0, indent: i === 0 ? stl.indent || 0 : 0, fill: bg || (c.input ? '#FFF8D6' : ''), fmt: FMT[t] && t !== 's' ? FMT[t] : '', wrap: t === 's' && c.wrap, al: t === 's' ? '' : '' };
          if (v == null || v === '') return `<c r="${ref}" s="${xf(base)}"/>`;
          if (t === 'd') return typeof v === 'number' ? `<c r="${ref}" s="${xf(Object.assign({}, base, { fmt: FMT.d }))}"><v>${v + 25569}</v></c>` : `<c r="${ref}" s="${xf(base)}" t="inlineStr"><is><t>${xe(v)}</t></is></c>`;
          if (t !== 's' && typeof v === 'number' && isFinite(v)) return `<c r="${ref}" s="${xf(base)}"><v>${v}</v></c>`;
          return `<c r="${ref}" s="${xf(base)}" t="inlineStr"><is><t xml:space="preserve">${xe(v)}</t></is></c>`;
        }).join('')}</row>`); r++;
      });
      const last = colName(sh.cols.length - 1); sh._rng = { hr, first: hr + 1, last: r - 1 };
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${sh.tab ? `<sheetPr><tabColor rgb="${argb(sh.tab)}"/></sheetPr>` : ''}<dimension ref="A1:${last}${r - 1}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0">${sh.freezeCols ? `<pane xSplit="${sh.freezeCols}" ySplit="${hr}" topLeftCell="${colName(sh.freezeCols)}${hr + 1}" activePane="bottomRight" state="frozen"/>` : `<pane ySplit="${hr}" topLeftCell="A${hr + 1}" activePane="bottomLeft" state="frozen"/>`}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${sh.cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.w || 14}" customWidth="1"/>`).join('')}</cols><sheetData>${rows.join('')}</sheetData><autoFilter ref="A${hr}:${last}${Math.max(hr, r - 1)}"/>${sh.chart || sh.logo ? '<drawing r:id="rId1"/>' : ''}</worksheet>`;
    });
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${fmts.size ? `<numFmts count="${fmts.size}">${[...fmts].map(([c, id]) => `<numFmt numFmtId="${id}" formatCode="${xe(c)}"/>`).join('')}</numFmts>` : ''}<fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
    const nm = (s, i) => (String(s.name || 'Sheet' + (i + 1)).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet' + (i + 1));
    const files = [
      ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
      ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xe(nm(s, i))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
      ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
      ['xl/styles.xml', styles]
    ].concat(sheetXml.map((x, i) => [`xl/worksheets/sheet${i + 1}.xml`, x]));
    addDrawings(files, sheets, nm);
    return P6.zipStore(files);
  };
  App.xlsxBook = function (fileName, sheets) {
    const blob = App.buildXlsxBlob(sheets), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fileName; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    return blob;
  };

  // ---------- reader ----------
  async function inflate(u8) { const ds = new DecompressionStream('deflate-raw'); const s = new Blob([u8]).stream().pipeThrough(ds); return new Uint8Array(await new Response(s).arrayBuffer()); }
  async function unzip(buf) {
    const u = new Uint8Array(buf), dv = new DataView(buf); let e = u.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('Not an .xlsx file');
    const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const files = {};
    for (let i = 0; i < n; i++) {
      const method = dv.getUint16(p + 10, true), csz = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(u.subarray(p + 46, p + 46 + nl)); p += 46 + nl + el + cl;
      const lh = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true), raw = u.subarray(lh, lh + csz);
      files[name] = async () => new TextDecoder().decode(method === 0 ? raw : await inflate(raw));
    }
    return files;
  }
  P6.readXlsx = async function (buf) {
    const z = await unzip(buf), dom = (s) => new DOMParser().parseFromString(s, 'application/xml');
    const ss = []; if (z['xl/sharedStrings.xml']) { dom(await z['xl/sharedStrings.xml']()).querySelectorAll('si').forEach((si) => ss.push([...si.querySelectorAll('t')].map((t) => t.textContent).join(''))); }
    let sheetFile = 'xl/worksheets/sheet1.xml';
    if (z['xl/workbook.xml'] && z['xl/_rels/workbook.xml.rels']) { const wb = dom(await z['xl/workbook.xml']()), rel = dom(await z['xl/_rels/workbook.xml.rels']()), sh = wb.querySelector('sheet'); if (sh) { const rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'); const rl = [...rel.querySelectorAll('Relationship')].find((r) => r.getAttribute('Id') === rid); if (rl) sheetFile = 'xl/' + rl.getAttribute('Target').replace(/^\//, '').replace(/^xl\//, ''); } }
    if (!z[sheetFile]) throw new Error('Worksheet not found');
    const x = dom(await z[sheetFile]()), rows = [];
    x.querySelectorAll('row').forEach((row) => {
      const arr = [];
      row.querySelectorAll('c').forEach((c) => {
        const ref = c.getAttribute('r') || '', m = /^([A-Z]+)/.exec(ref); if (!m) return; let ci = 0; for (const ch of m[1]) ci = ci * 26 + ch.charCodeAt(0) - 64; ci--;
        const t = c.getAttribute('t'), v = c.querySelector('v'); let val = null;
        if (t === 's') val = v ? ss[+v.textContent] : ''; else if (t === 'inlineStr') val = [...c.querySelectorAll('t')].map((q) => q.textContent).join(''); else if (v) val = t === 'str' || t === 'b' || t === 'e' ? v.textContent : parseFloat(v.textContent);
        arr[ci] = val;
      });
      rows[+(row.getAttribute('r') || rows.length + 1) - 1] = arr;
    });
    return Array.from(rows, (r) => r || []);
  };
})(window);

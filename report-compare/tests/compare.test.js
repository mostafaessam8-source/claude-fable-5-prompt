/* node report-compare/tests/compare.test.js [path/to/this-week.xlsx]
 * Without an argument it uses a tiny workbook built in memory. With a real report it also builds a synthetic "last week" from it,
 * compares, runs the checker, rejects / edits some cells, writes the report and reads it back. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const JSZip = require('../vendor/jszip.min.js');
const Xl = require('../js/xl.js');
const Diff = require('../js/diff.js');
const Checks = require('../js/checks.js');
const Writer = require('../js/writer.js');
const Fmt = require('../js/format.js');

function tiny(vals) {
  const z = new JSZip();
  z.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
  z.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  z.file('xl/workbook.xml', '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="S1" sheetId="1" r:id="rId1"/></sheets></workbook>');
  z.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
  const n = (r, v) => `<c r="${r}"><v>${v}</v></c>`, s = (r, t) => `<c r="${r}" t="inlineStr"><is><t>${t}</t></is></c>`;
  z.file('xl/worksheets/sheet1.xml', `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
    <row r="1">${n('A1', vals.a)}${s('B1', vals.b)}<c r="C1"><f>A1*2</f><v>${vals.a * 2}</v></c></row>
    <row r="2">${n('A2', 5)}<c r="C2"><f t="shared" ref="C2:C3" si="0">A2*2</f><v>10</v></c></row>
    <row r="3">${n('A3', 6)}<c r="C3"><f t="shared" si="0"/><v>12</v></c></row></sheetData></worksheet>`);
  return z;
}

async function small() {
  const pz = tiny({ a: 1, b: 'old' }), cz = tiny({ a: 2, b: 'new' });
  const prev = await Xl.readWorkbook(pz), cur = await Xl.readWorkbook(cz);
  assert.strictEqual(cur.byName.S1.cells.get('C3').f, 'A3*2', 'shared formula translated');
  const cmp = Diff.compare(prev, cur);
  assert.deepStrictEqual(cmp.changes.map(c => c.a + ':' + c.kind), ['A1:modified', 'B1:modified']);
  assert.strictEqual(cmp.auto.length, 1, 'C1 result moved (auto)');
  const dec = { 'S1!A1': { m: 'reject' }, 'S1!B1': { m: 'custom', v: 'mine' }, 'S1!C2': { m: 'custom', v: '=A2*3' } };
  const out = await Writer.build(JSZip, await cz.generateAsync({ type: 'uint8array' }), prev, cur, dec);
  const back = await Xl.readWorkbook(await JSZip.loadAsync(out.bytes));
  const sh = back.byName.S1;
  assert.strictEqual(sh.cells.get('A1').v, 1, 'rejected → last week value');
  assert.strictEqual(sh.cells.get('B1').v, 'mine');
  assert.strictEqual(sh.cells.get('C2').f, 'A2*3');
  assert.strictEqual(sh.cells.get('C3').f, 'A3*2', 'shared child kept its formula');
  const dec2 = { 'S1!B1': { m: 'custom', v: '=SUM(A2:A3)*2+A1' }, 'S1!C1': { m: 'custom', v: '=XLOOKUP(5,A2:A3,A2:A3)' } };
  const out2 = await Writer.build(JSZip, await cz.generateAsync({ type: 'uint8array' }), prev, cur, dec2);
  const x2 = await JSZip.loadAsync(out2.bytes), xml2 = await x2.file('xl/worksheets/sheet1.xml').async('string');
  assert(/<c r="B1"><f>SUM\(A2:A3\)\*2\+A1<\/f><v>24<\/v><\/c>/.test(xml2), 'typed formula is evaluated and its result cached: ' + xml2);
  assert(/<f>_xlfn\.XLOOKUP\(5,A2:A3,A2:A3\)<\/f><v>5<\/v>/.test(xml2), 'new functions get the _xlfn. prefix');
  assert.strictEqual(Diff.makeView(prev, cur, dec2).num('S1', 'B1'), 24);
  // a typed date in a General cell gets a date style
  const dz = tiny({ a: 1, b: 'x' });
  dz.file('xl/styles.xml', '<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>');
  dz.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  const dbytes = await dz.generateAsync({ type: 'uint8array' }), dwb = await Xl.readWorkbook(await JSZip.loadAsync(dbytes));
  const dout = await Writer.build(JSZip, dbytes, dwb, dwb, { 'S1!A1': { m: 'custom', v: '22/10/2026' } });
  const dback = await Xl.readWorkbook(await JSZip.loadAsync(dout.bytes)), dc = dback.byName.S1.cells.get('A1');
  assert.strictEqual(dc.v, 46317); assert(Xl.isDateCell(dc, dback.styles), 'typed date is shown as a date');
  assert.strictEqual(Writer.setTabColor('<worksheet><sheetPr><tabColor rgb="FF92D050"/><pageSetUpPr/></sheetPr></worksheet>', '#FF0000'), '<worksheet><sheetPr><tabColor rgb="FFFF0000"/><pageSetUpPr/></sheetPr></worksheet>');
  assert.strictEqual(Writer.setTabColor('<worksheet a="1"><dimension/></worksheet>', '#0070C0'), '<worksheet a="1"><sheetPr><tabColor rgb="FF0070C0"/></sheetPr><dimension/></worksheet>');
  assert.strictEqual(Writer.setTabColor('<worksheet><sheetPr codeName="S"><tabColor theme="4"/></sheetPr></worksheet>', null), '<worksheet><sheetPr codeName="S"></sheetPr></worksheet>');
  // a function the saving Excel did not know: stored as #NAME?, calculated by the tool
  const nz = tiny({ a: 1, b: 'x' });
  nz.file('xl/worksheets/sheet1.xml', '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><v>20</v></c><c r="B1"><v>5</v></c></row><row r="2"><c r="A2"><v>21</v></c><c r="B2"><v>7</v></c><c r="C2" t="e"><f>_xlfn.XLOOKUP(A2,A1:A2,B1:B2,1,0)</f><v>#NAME?</v></c><c r="D2" t="e"><f>FOO(1)</f><v>#NAME?</v></c></row></sheetData></worksheet>');
  const nwb = await Xl.readWorkbook(nz), nview = Diff.makeView(nwb, nwb, {});
  assert.strictEqual(nview.num('S1', 'C2'), 7, 'XLOOKUP stored as #NAME? is calculated'); assert(nview.eff('S1', 'C2').recalc);
  assert.strictEqual(nview.eff('S1', 'D2').k, 'e', 'an unknown function keeps the saved error');
  // format helpers
  assert.strictEqual(Fmt.bumpDecimals('0.00', 1), '0.000'); assert.strictEqual(Fmt.bumpDecimals('0.00', -1), '0.0'); assert.strictEqual(Fmt.bumpDecimals('General', 1), '0.0'); assert.strictEqual(Fmt.bumpDecimals('dd/mm/yyyy', 1), 'dd/mm/yyyy');
  assert.strictEqual(Fmt.bumpDecimals('#,##0.00;[Red](#,##0.00)', -1), '#,##0.0;[Red](#,##0.0)');
  const base = { name: 'Calibri', sz: 11, b: false, i: false, u: false, color: null, fill: null, h: '', v: '', wrap: false, indent: 0, nf: 'General', bd: { l: null, r: null, t: null, b: null } };
  const styled = Fmt.apply(base, { b: true, fill: '#FFFF00', bd: { b: { s: 'thick', c: '#4472C4' } } });
  assert(styled.b && styled.fill === '#FFFF00' && styled.bd.b.s === 'thick' && base.b === false, 'apply does not change the base');
  assert.deepStrictEqual(Fmt.mergeDelta({ b: true, bd: { l: { s: 'thin', c: '#000' } } }, { b: false, bd: { l: null, r: { s: 'thin', c: '#000' } } }), { b: false, bd: { l: null, r: { s: 'thin', c: '#000' } } });
  assert(/background-color:#FFFF00/.test(Fmt.cssOf(styled)) && /border-bottom:3px solid #4472C4/.test(Fmt.cssOf(styled)));
  assert.strictEqual(Diff.parseInput('50%').v, 0.5);
  assert.strictEqual(Diff.parseInput('1,250.5').v, 1250.5);
  assert.strictEqual(Diff.parseInput('22/10/2026').v, 46317);
  assert.strictEqual(Diff.parseInput("'007").v, '007');
  console.log('small workbook: ok');
}

async function real(file) {
  const bytes = fs.readFileSync(file);
  const curZip = await JSZip.loadAsync(bytes), cur = await Xl.readWorkbook(curZip);
  // synthetic "last week": the same report with the usual weekly differences
  const PS = '1. Progress Status', SF = '2. Safety Status', NC = '5. NCR Status', DI = '10-13. Data Input', DL = '4. Deliverable Status';
  const prevEdits = {
    [PS + '!C7']: { m: 'custom', v: '15/10/2026' }, [PS + '!K1']: { m: 'custom', v: 'PW-103' }, [PS + '!M1']: { m: 'custom', v: 'CW-37-26' },
    [NC + '!B5']: { m: 'custom', v: '2' }, [NC + '!B6']: { m: 'custom', v: '2' },
    [SF + '!C11']: { m: 'custom', v: '441' }, [SF + '!B11']: { m: 'custom', v: '' },
    [DI + '!B7']: { m: 'custom', v: 'Riprap Work was completed for RHL Km 100+000 (older text)' },
    [DL + '!D8']: { m: 'custom', v: '17' }
  };
  const prevBuild = await Writer.build(JSZip, bytes, cur, cur, prevEdits);
  if (process.env.SAVE_PREV) fs.writeFileSync(process.env.SAVE_PREV, prevBuild.bytes);
  const prevZip = await JSZip.loadAsync(prevBuild.bytes), prev = await Xl.readWorkbook(prevZip);
  const cmp = Diff.compare(prev, cur);
  console.log('changes', cmp.changes.length, 'auto', cmp.auto.length);
  cmp.changes.forEach(c => console.log('  ', c.id, c.kind, JSON.stringify(c.prev && c.prev.v), '→', JSON.stringify(c.cur && c.cur.v)));
  assert(cmp.changes.length >= 8, 'edited cells are found');
  assert(cmp.changes.some(c => c.id === NC + '!B5' && c.kind === 'modified'));

  const dec = {};
  let view = Diff.makeView(prev, cur, dec);
  let issues = Checks.run(cmp, cur, prev, view, {});
  console.log('issues', issues.length);
  issues.forEach(i => console.log('  ', i.sev.padEnd(5), i.code, i.sheet + '!' + i.a, '—', i.en.slice(0, 130), i.fix ? ' [fix ' + i.fix.text + ']' : ''));
  assert(issues.some(i => i.code === 'FC1'), 'forecast completion in the past');
  assert(issues.some(i => i.code === 'CW2'), 'stale calendar week');

  // reject the NCR change + a custom value + the quick fix of the first fixable issue
  dec[NC + '!B5'] = { m: 'reject' };
  dec[PS + '!C7'] = { m: 'accept' };
  dec[SF + '!B11'] = { m: 'custom', v: '7' };
  view = Diff.makeView(prev, cur, dec);
  assert.strictEqual(view.num(NC, 'B5'), 2);
  const out = await Writer.build(JSZip, bytes, prev, cur, dec);
  fs.writeFileSync('/tmp/xl/out.xlsx', out.bytes);
  const back = await Xl.readWorkbook(await JSZip.loadAsync(out.bytes));
  assert.strictEqual(back.byName[NC].cells.get('B5').v, 2);
  assert.strictEqual(back.byName[SF].cells.get('B11').v, 7);
  assert.strictEqual(back.byName[PS].cells.get('C7').v, cur.byName[PS].cells.get('C7').v, 'accepted cell untouched');
  // nothing else changed
  const cmp2 = Diff.compare(cur, back);
  console.log('cells that differ between this week and the output:', cmp2.changes.map(c => c.id).join(', '));
  assert.deepStrictEqual(cmp2.changes.map(c => c.id).sort(), [NC + '!B5', SF + '!B11'].sort());
  // sheet properties: hide / unhide, tab colour, the active tab stays visible
  const ops = { hidden: { 'List': false, [PS]: true }, color: { [NC]: '#FF0000', [SF]: null } };
  const oo = await Writer.build(JSZip, bytes, prev, cur, {}, ops), ob = await Xl.readWorkbook(await JSZip.loadAsync(oo.bytes));
  assert.strictEqual(ob.byName['List'].state, 'visible'); assert.strictEqual(ob.byName[PS].state, 'hidden'); assert.strictEqual(ob.byName[NC].tabColor, '#FF0000'); assert.strictEqual(ob.byName[SF].tabColor, null);
  const oz = await JSZip.loadAsync(oo.bytes), tabSel = []; for (const sh of ob.sheets) if (/tabSelected="1"/.test(await oz.file(sh.path).async('string'))) tabSel.push(sh.name);
  assert.strictEqual(tabSel.length, 1); assert(ob.byName[tabSel[0]].state === 'visible', 'the selected tab is a visible sheet');
  // formatting, merge, widths, heights, hidden, freeze panes and a real Excel table are written into the package
  const RK = 'Risk', fedits = {
    fmt: { [NC]: { B5: { fill: '#FFFF00', b: true, color: '#C00000', sz: 14, name: 'Arial', h: 'center', nf: '0.00%', bd: { b: { s: 'thick', c: '#0070C0' } } }, B6: { reset: true, i: true } } },
    layout: { merges: { [NC]: { add: [{ r1: 12, c1: 1, r2: 12, c2: 3 }], remove: [] } }, colw: { [NC]: { 1: 30 } }, rowh: { [NC]: { 5: 40 } }, rowHidden: { [NC]: { 13: true } }, colHidden: { [NC]: { 7: true } }, freeze: { [NC]: { r: 3, c: 2 }, 'S-Curve Data': null },
      tables: [{ sheet: RK, ref: 'A1:K5', name: 'RiskTbl', style: 'TableStyleMedium2', headers: true, stripes: true, cols: ['Report Date', 'Project Code', 'No', 'Risk', 'Risk Description', 'Impact', 'Probability', 'Owner', 'Mitigation', 'Date Raised', 'Status'] }] }
  };
  const fo = await Writer.build(JSZip, bytes, prev, cur, {}, null, fedits), fz = await JSZip.loadAsync(fo.bytes), fb = await Xl.readWorkbook(fz);
  const s5 = Fmt.fromXf(fb.styles, fb.byName[NC].cells.get('B5').s);
  assert(s5.b && s5.fill === '#FFFF00' && s5.color === '#C00000' && s5.sz === 14 && s5.name === 'Arial' && s5.h === 'center' && s5.nf === '0.00%' && s5.bd.b && s5.bd.b.s === 'thick', 'cell format written: ' + JSON.stringify(s5));
  assert(Fmt.fromXf(fb.styles, fb.byName[NC].cells.get('B6').s).i, 'reset + italic');
  assert(fb.byName[NC].merges.some(g => g.r1 === 12 && g.c1 === 1 && g.r2 === 12 && g.c2 === 3), 'merge written');
  assert(fb.byName[NC].cols.some(d => d.min <= 1 && d.max >= 1 && Math.abs(d.w - 30) < 0.01) && fb.byName[NC].cols.some(d => d.min <= 7 && d.max >= 7 && d.hidden), 'column width + hidden column');
  assert.strictEqual(fb.byName[NC].rows.get(5).ht, 40); assert(fb.byName[NC].rows.get(13).hidden, 'row height + hidden row');
  assert.deepStrictEqual(fb.byName[NC].freeze, { r: 3, c: 2 }); assert.strictEqual(fb.byName['S-Curve Data'].freeze, undefined, 'unfreeze');
  assert.deepStrictEqual(fb.byName[RK].tables.map(t => [t.name, t.ref, t.style]), [['RiskTbl', 'A1:K5', 'TableStyleMedium2']], 'table written');
  assert.strictEqual(fb.byName['10-13. Data Input'].tables.length, 4, 'existing tables are kept');
  const ct = await fz.file('[Content_Types].xml').async('string'); assert(/tables\/table6\.xml/.test(ct), 'table content type');
  const z2 = await JSZip.loadAsync(out.bytes);
  assert(!z2.file('xl/calcChain.xml'), 'calc chain removed');
  assert(/fullCalcOnLoad="1"/.test(await z2.file('xl/workbook.xml').async('string')));
  assert.strictEqual(Object.keys(z2.files).filter(n => /chart|drawing|media/.test(n)).length, Object.keys(curZip.files).filter(n => /chart|drawing|media/.test(n)).length, 'charts / pictures kept');
  const log = Writer.changeLog(cmp, dec, view, cur.styles);
  assert(log.split('\r\n').length === cmp.changes.length + 1);
  console.log('real workbook: ok');
}

function versionCheck() {   // the version shown in the page must be the newest entry of CHANGELOG.md
  const html = fs.readFileSync(require('path').join(__dirname, '../index.html'), 'utf8'), log = fs.readFileSync(require('path').join(__dirname, '../CHANGELOG.md'), 'utf8');
  const shown = /Version (\d+\.\d+) · build/.exec(html), newest = /^## (\d+\.\d+) — /m.exec(log);
  assert(shown && newest, 'version markers found');
  assert.strictEqual(shown[1], newest[1], 'index.html shows version ' + shown[1] + ' but the newest CHANGELOG entry is ' + newest[1] + ' — bump both on every update');
  console.log('version ' + shown[1] + ': ok');
}

(async () => {
  versionCheck();
  await small();
  const f = process.argv[2] || process.env.SAR_REPORT;
  if (f) await real(f);
})().catch(e => { console.error(e); process.exit(1); });

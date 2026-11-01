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

/* node design-gantt/tests/gantt.test.js — builds a tiny tracker workbook in memory, reads it, writes the Gantt sheet and checks the result.
 * Set SAR_TRACKER=/path/to/real.xlsx to run the same checks on a real workbook. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const JSZip = require('../vendor/jszip.min.js');
const M = require('../js/model.js');
const X = require('../js/xlsxgantt.js');

const D = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / 864e5) + M.EPOCH;
function tinyWorkbook() {
  const z = new JSZip();
  z.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
  z.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  z.file('xl/workbook.xml', '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="Tracker" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029"/></workbook>');
  z.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  z.file('xl/styles.xml', '<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>');
  const s = (r, t) => `<c r="${r}" t="inlineStr"><is><t>${t}</t></is></c>`, n = (r, v) => `<c r="${r}"><v>${v}</v></c>`;
  const hdr = ['Baseline submission', 'Baseline approval', 'Actual submission', 'Actual Review', 'SAR code', 'FORECAST re-submission', 'FORECAST approval'];
  const cols = ['D', 'E', 'F', 'G', 'H', 'I', 'J'];
  const rows = [];
  rows.push(`<row r="5">${s('A5', 'DATA DATE (cut-off)')}${n('C5', D(2026, 8, 31))}</row>`);
  rows.push(`<row r="6">${s('A6', 'AT-RISK WINDOW (days)')}${n('C6', 14)}${s('D6', 'Concept Design')}${n('F6', 1)}</row>`);
  rows.push(`<row r="7">${s('A7', '% EARNED — submitted')}${n('C7', 0.6)}</row><row r="8">${s('A8', '% EARNED — Code D')}${n('C8', 0.5)}</row><row r="9">${s('A9', '% EARNED — Code C')}${n('C9', 0.7)}</row><row r="10">${s('A10', '% EARNED — Code B')}${n('C10', 0.9)}</row><row r="11">${s('A11', '% EARNED — Code A')}${n('C11', 1)}</row>`);
  rows.push(`<row r="16">${s('D16', '1. CONCEPT DESIGN')}</row>`);
  rows.push(`<row r="17">${s('A17', 'Programme')}${s('B17', 'Project Code')}${s('C17', 'Project / Element — Package')}${hdr.map((h, i) => s(cols[i] + '17', h)).join('')}${s('K17', 'Main challenges / notes')}${s('L17', 'Lvl')}</row>`);
  rows.push(`<row r="18">${s('A18', 'NSR')}${s('B18', '9001')}${s('C18', 'Test Project')}${s('L18', 'P')}</row>`);
  rows.push(`<row r="19">${s('C19', 'Element 1')}${n('D19', D(2026, 3, 1))}${n('E19', D(2026, 3, 15))}${n('F19', D(2026, 3, 10))}${n('G19', D(2026, 4, 1))}${s('H19', 'D')}${n('I19', D(2026, 9, 1))}${n('J19', D(2026, 9, 20))}${s('K19', 'a note')}${s('L19', 'E')}</row>`);
  rows.push(`<row r="20">${s('C20', 'Element 2')}${n('D20', D(2026, 10, 1))}${n('E20', D(2026, 10, 20))}${s('L20', 'E')}</row>`);
  z.file('xl/worksheets/sheet1.xml', `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.join('')}</sheetData></worksheet>`);
  return z;
}

async function check(zip, label) {
  const model = await M.readWorkbook(zip);
  const out = await X.build(zip, model, { scale: 'week', sourceName: label });
  const z2 = await JSZip.loadAsync(out.bytes);
  const g = await z2.file('xl/worksheets/sheet2.xml') || null;
  const names = Object.keys(z2.files);
  return { model, out, z2, names };
}

(async () => {
  // 1. tiny workbook: stage maths follow the Tracker's own rules
  const t = await check(tinyWorkbook(), 'tiny.xlsx');
  const m = t.model;
  assert.strictEqual(m.projects.length, 1);
  assert.strictEqual(m.projects[0].elements.length, 2);
  const s1 = m.projects[0].elements[0].stages[0];
  assert.strictEqual(s1.code, 'D'); assert.strictEqual(s1.pct, 0.5); assert.strictEqual(s1.health, 'Delayed');
  assert.strictEqual(s1.varDays, D(2026, 9, 20) - D(2026, 3, 15));
  assert.strictEqual(m.projects[0].elements[1].stages[0].health, 'Not Started');
  // changing the data date re-derives the status
  M.recalc(m, D(2026, 9, 25));
  assert.strictEqual(m.projects[0].elements[1].stages[0].health, 'At Risk');
  M.recalc(m, D(2026, 10, 25));
  assert.strictEqual(m.projects[0].elements[1].stages[0].health, 'Delayed');

  // 2. the written workbook: a new Gantt sheet whose numbers are formulas and whose bars are conditional formats
  const xml = await t.z2.file(t.names.find(n => /worksheets\/sheet\d+\.xml$/.test(n) && n !== 'xl/worksheets/sheet1.xml')).async('string');
  assert(/<f>[^<]*Tracker[^<]*<\/f>/.test(xml), 'formulas read the Tracker sheet');
  assert(/<conditionalFormatting /.test(xml) && /type="expression"/.test(xml), 'bars are conditional formats');
  assert(!/calcChain/.test(await t.z2.file('[Content_Types].xml').async('string')));
  assert(/fullCalcOnLoad="1"/.test(await t.z2.file('xl/workbook.xml').async('string')));
  const wb = await t.z2.file('xl/workbook.xml').async('string');
  assert(/Gantt chart/.test(wb));
  const st = await t.z2.file('xl/styles.xml').async('string');
  assert(/<dxfs count="\d+">/.test(st));
  // every XML part must be well-formed enough for a strict parser: balanced counts
  assert.strictEqual((xml.match(/<row /g) || []).length, (xml.match(/<\/row>/g) || []).length);

  // 3. optional: a real workbook
  if (process.env.SAR_TRACKER) {
    const r = await check(await JSZip.loadAsync(fs.readFileSync(process.env.SAR_TRACKER)), process.env.SAR_TRACKER);
    assert(r.model.projects.length > 0 && r.out.items > 0);
    console.log('real workbook:', r.model.projects.length, 'projects,', r.out.items, 'lines');
  }
  console.log('design-gantt tests passed');
})().catch(e => { console.error(e); process.exit(1); });

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
  const rows = [];
  rows.push(`<row r="5">${s('A5', 'DATA DATE (cut-off)')}${n('C5', D(2026, 8, 31))}</row>`);
  rows.push(`<row r="17">${s('A17', 'Programme')}${s('B17', 'Project Code')}${s('C17', 'Project / Element — Package')}${s('D17', 'Submission Date')}${s('E17', 'Approval Date')}${s('F17', 'Main challenges / notes')}${s('G17', 'Lvl')}</row>`);
  rows.push(`<row r="18">${s('A18', 'NSR')}${s('B18', '9001')}${s('C18', 'Test Project')}${s('G18', 'P')}</row>`);
  rows.push(`<row r="19">${s('C19', 'Element 1')}${n('D19', D(2026, 8, 1))}${n('E19', D(2026, 8, 20))}${s('F19', 'a note')}${s('G19', 'E')}</row>`);
  rows.push(`<row r="20">${s('C20', 'Element 2')}${n('D20', D(2026, 8, 20))}${n('E20', D(2026, 9, 20))}${s('G20', 'E')}</row>`);
  rows.push(`<row r="21">${s('C21', 'Element 3')}${n('D21', D(2026, 10, 1))}${n('E21', D(2026, 10, 20))}${s('G21', 'E')}</row>`);
  rows.push(`<row r="22">${s('C22', 'Element 4')}${n('D22', D(2026, 10, 20))}${n('E22', D(2026, 10, 1))}${s('G22', 'E')}</row>`);
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
  // 1. tiny workbook: status follows the data date; only Submission / Approval Date are used
  const t = await check(tinyWorkbook(), 'tiny.xlsx');
  const m = t.model, els = m.projects[0].elements;
  assert.strictEqual(m.projects.length, 1); assert.strictEqual(els.length, 4);
  assert.deepStrictEqual(els.map(e => e.status), ['Actual', 'In progress', 'Forecast', 'Forecast']);
  assert.strictEqual(m.projects[0].eps, D(2026, 8, 1)); assert.strictEqual(m.projects[0].epa, D(2026, 10, 20));
  assert(m.checks.some(c => c.sev === 'error' && c.element === 'Element 4'), 'approval before submission is flagged');
  const ms = M.buildItems(m).find(i => i.label === 'Element 2').ms; // milestones, not bars
  assert.deepStrictEqual(ms.map(g => [g.t, g.actual]), [['sub', true], ['app', false]]);
  M.recalc(m, D(2026, 10, 10));
  assert.deepStrictEqual(m.projects[0].elements.map(e => e.status), ['Actual', 'Actual', 'In progress', 'Actual']);

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

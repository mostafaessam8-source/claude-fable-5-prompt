// Regenerates tests/fixtures/golden/*.xlsx: the tracker (baseline, and a scenario with
// progress typed in) recalculated by LibreOffice, i.e. by the workbook's own formulas.
// The engine tests compare against these. Needs `soffice` on the PATH.
//   node tests/tools/make-golden.mjs
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import ExcelJS from 'exceljs'
import { stripUnreadableParts } from '../../src/import/sanitize.ts'

const SRC = 'tests/fixtures/EWR_Phase2_Shutdown03_Progress_Tracker.xlsx'
const OUT = 'tests/fixtures/golden'
const TMP = '/tmp/golden-build'
mkdirSync(OUT, { recursive: true })
rmSync(TMP, { recursive: true, force: true })
mkdirSync(TMP, { recursive: true })

const utc = (s) => new Date(s + 'Z')
async function load() {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await stripUnreadableParts(readFileSync(SRC)))
  return wb
}

async function build(name, edit) {
  const wb = await load()
  const ws = wb.getWorksheet('Data Input')
  ws.getCell('M5').value = utc('2026-10-16T18:00:00') // deterministic cut-off instead of NOW()
  edit?.(ws)
  const f = `${TMP}/${name}.xlsx`
  await wb.xlsx.writeFile(f)
  execFileSync('soffice', ['--headless', '--convert-to', 'xlsx:Calc MS Excel 2007 XML', '--outdir', OUT, f], { stdio: 'ignore' })
}

await build('baseline')
await build('scenario', (ws) => {
  const set = (a, v) => (ws.getCell(a).value = v)
  // Location 1 (rows 27..): finished late, in progress, bad start date, finish without start.
  set('I27', utc('2026-10-16T00:00:00')); set('J27', 0)
  set('K27', utc('2026-10-16T00:00:00')); set('L27', 2 / 24)           // done 02:00, planned 01:00 -> delayed
  set('I28', utc('2026-10-16T00:00:00')); set('J28', 2 / 24); set('N28', 0.5)  // started 02:00, 50 %
  set('I29', utc('2026-10-15T00:00:00')); set('J29', 0)                // before possession -> bad dates
  set('K30', utc('2026-10-16T00:00:00')); set('L30', 5 / 24)           // finish, no start -> bad dates
  // Location 2 (rows 57..): finished early, then a 100 % typed with no actual finish.
  set('I57', utc('2026-10-16T00:00:00')); set('J57', 0)
  set('K57', utc('2026-10-16T00:00:00')); set('L57', 0.5 / 24)          // done 00:30, planned 01:00 -> ahead
  set('N58', 1)                                                        // 100 % without finish
  // Location 3 (rows 87..): started on time, 25 %; plus an activity started late.
  set('I87', utc('2026-10-16T00:00:00')); set('J87', 0); set('N87', 0.25)
  set('I89', utc('2026-10-16T10:00:00')); set('J89', 0)
})
console.log('golden files written to', OUT)

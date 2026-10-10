import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { computeProject, type ProjectResult } from '../src/engine/schedule'
import { exportXlsx } from '../src/export'
import { diBlock, reportRows } from '../src/export/positions'
import { parseWorkbook } from '../src/import/parse'
import { stripUnreadableParts } from '../src/import/sanitize'
import { parseLayout } from '../src/layout/parse'
import type { Project } from '../src/model/types'
import { totalAllLocations } from '../src/report/summary'
import { actual, at, project as mk } from './helpers'

const FIXTURE = readFileSync('tests/fixtures/EWR_Phase2_Shutdown03_Progress_Tracker.xlsx')
const SCENARIO = readFileSync('tests/fixtures/golden/scenario.xlsx')
const layoutsOf = (p: Project) => p.locations.map((l) => parseLayout(l.name, l.scope))

async function loadXlsx(bytes: Uint8Array) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load((await stripUnreadableParts(bytes)) as unknown as ExcelJS.Buffer)
  return wb
}

/** <col> widths/hidden from the raw sheet XML (exceljs does not expand grouped columns on load). */
async function sheetXml(bytes: Uint8Array, n: number) {
  return (await JSZip.loadAsync(bytes)).file(`xl/worksheets/sheet${n}.xml`)!.async('string')
}
function cols(xml: string) {
  const out = new Map<number, { width: number; hidden: boolean }>()
  for (const m of xml.matchAll(/<col\b([^>]*)\/>/g)) {
    const a = m[1]
    const min = Number(/min="(\d+)"/.exec(a)![1]), max = Number(/max="(\d+)"/.exec(a)![1])
    const width = Number(/width="([\d.]+)"/.exec(a)?.[1] ?? NaN)
    for (let c = min; c <= max; c++) out.set(c, { width, hidden: /hidden="(1|true)"/.test(a) })
  }
  return out
}

describe('round trip: import → export → re-import', () => {
  it.each([['tracker', FIXTURE], ['tracker with progress typed in', SCENARIO]])('%s: the model is identical', async (_n, file) => {
    const p1 = await parseWorkbook(file)
    const out = await exportXlsx(p1, layoutsOf(p1))
    const p2 = await parseWorkbook(out)
    expect(p2).toEqual(p1)
  })

  it('an edited site layout survives (it is carried by the location name and scope line)', async () => {
    const p1 = await parseWorkbook(FIXTURE)
    const lay = layoutsOf(p1)
    lay[1] = { ...lay[1], cells: 5, station: 'Station 40', otmp: 'ACME' }
    const p2 = await parseWorkbook(await exportXlsx(p1, lay))
    expect(layoutsOf(p2)).toEqual(lay)
    expect(p2.locations[0]).toEqual(p1.locations[0]) // untouched layouts keep their exact text
  })

  it('a changed possession window and an explicit cut-off survive', async () => {
    const p1 = await parseWorkbook(FIXTURE)
    p1.settings = { ...p1.settings, cutoff: at(7.5), cutoffDefaulted: false, duration: 3, unit: 'days',
      possessionEnd: at(72), ganttSpan: 72 }
    const p2 = await parseWorkbook(await exportXlsx(p1, layoutsOf(p1)))
    expect(p2.settings).toEqual(p1.settings)
  })
})

describe('the two Excel traps (§7.1)', () => {
  async function parts() {
    const p = await parseWorkbook(SCENARIO)
    const zip = await JSZip.loadAsync(await exportXlsx(p, layoutsOf(p)))
    const sheets = await Promise.all(
      Object.keys(zip.files).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f)).map((f) => zip.file(f)!.async('string')),
    )
    return { sheets, styles: await zip.file('xl/styles.xml')!.async('string') }
  }

  it('no conditional-format formula references another sheet', async () => {
    const { sheets } = await parts()
    const formulas = sheets.flatMap((x) => [...x.matchAll(/<cfRule\b[^>]*>([\s\S]*?)<\/cfRule>/g)].flatMap((m) => [...m[1].matchAll(/<formula>([\s\S]*?)<\/formula>/g)].map((f) => f[1])))
    expect(formulas.length).toBeGreaterThan(150)
    for (const f of formulas) {
      const noStrings = f.replace(/&quot;[^]*?&quot;/g, '').replace(/"[^"]*"/g, '') // "!*" is a wildcard, not a sheet ref
      expect(noStrings, f).not.toMatch(/!/)
      expect(f, f).not.toMatch(/'!|'&apos;!/)
    }
  })

  it('every conditional-format fill carries a bgColor', async () => {
    const { styles } = await parts()
    const dxfs = [...styles.matchAll(/<dxf>([\s\S]*?)<\/dxf>/g)].map((m) => m[1])
    const fills = dxfs.filter((d) => d.includes('<fill>'))
    expect(fills.length).toBeGreaterThan(5)
    for (const d of fills) expect(d).toMatch(/<bgColor\b/)
  })
})

describe('Data Input sheet', () => {
  it('has the §7.2 widths, hidden engine columns, TOT rows, notes, prompts and protection', async () => {
    const p = await parseWorkbook(FIXTURE)
    const bytes = await exportXlsx(p, layoutsOf(p))
    const wb = await loadXlsx(bytes)
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Report', 'Site Layouts', 'Data Input'])
    const ws = wb.getWorksheet('Data Input')!
    const widths = [5, 44, 15, 15, 8, 7.5, 7.5, 7, 12, 9, 12, 9, 9, 11, 21, 26]
    const c3 = cols(await sheetXml(bytes, 3))
    widths.forEach((w, i) => expect(c3.get(i + 1)?.width, `col ${i + 1}`).toBeCloseTo(w, 2))
    for (let c = 17; c <= 28; c++) expect(c3.get(c)?.hidden, `col ${c} hidden`).toBe(true)
    expect(await sheetXml(bytes, 3)).toMatch(/<sheetProtection\b[^>]*sheet="(1|true)"/)

    const zip = await JSZip.loadAsync(bytes)
    const comments = (await Promise.all(Object.keys(zip.files).filter((f) => /^xl\/comments\d*\.xml$/.test(f)).map((f) => zip.file(f)!.async('string')))).join('')
    const dvs = (ws as unknown as { dataValidations: { model: Record<string, ExcelJS.DataValidation> } }).dataValidations.model
    let inputs = 0
    for (let i = 0; i < 5; i++) {
      const b = diBlock(i, 26)
      expect(ws.getCell(`A${b.total}`).value).toBe('TOT')
      for (const col of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P']) {
        expect(comments, `header note ${col}${b.header}`).toContain(`ref="${col}${b.header}"`)
      }
      for (let r = b.first; r <= b.last; r++) {
        for (const col of ['B', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'N', 'P']) {
          const dv = dvs[`${col}${r}`]
          expect(dv, `${col}${r}`).toBeTruthy()
          expect(dv.showInputMessage, `${col}${r} prompt shown`).toBe(true)
          expect(dv.prompt, `${col}${r}`).toBeTruthy()
          expect(ws.getCell(`${col}${r}`).protection?.locked, `${col}${r} unlocked`).toBe(false)
          inputs++
        }
        for (const col of ['A', 'C', 'D', 'M', 'O']) expect(ws.getCell(`${col}${r}`).protection?.locked, `${col}${r} locked`).not.toBe(false)
      }
    }
    expect(inputs).toBe(5 * 26 * 11)
    expect(await sheetXml(bytes, 3)).not.toMatch(/<dataValidation\b[^>]*\n/) // line breaks escaped as &#10;
    expect(dvs['I27'].type).toBe('list')
    expect(dvs['I27'].prompt).toBe('Click the arrow and pick the date from the list.\nDo not type it.')
    expect(dvs['J27'].prompt).toContain('2 PM       ->  14:00')
    expect(dvs['N27'].prompt).toContain('Type the percentage, e.g. 60%')
    expect(dvs['G27'].formulae?.[0]).toMatch(/^\$AD\$2:\$AD\$5$/)
    // header colours: green on the input columns, slate on the calculated ones
    expect((ws.getCell('I26').fill as ExcelJS.FillPattern).fgColor?.argb).toBe('FF2E8B57')
    expect((ws.getCell('C26').fill as ExcelJS.FillPattern).fgColor?.argb).toBe('FF768692')
  })

  it('the Report sheet has 48 narrow Gantt columns, hidden helpers, landscape A4, a page per location', async () => {
    const p = await parseWorkbook(FIXTURE)
    const bytes = await exportXlsx(p, layoutsOf(p))
    const ws = (await loadXlsx(bytes)).getWorksheet('Report')!
    const xml = await sheetXml(bytes, 1)
    const c1 = cols(xml)
    for (let c = 11; c <= 58; c++) expect(c1.get(c)?.width, `col ${c}`).toBe(1.65)
    for (let c = 59; c <= 68; c++) expect(c1.get(c)?.hidden, `col ${c}`).toBe(true)
    expect(ws.pageSetup.orientation).toBe('landscape')
    expect(ws.pageSetup.paperSize).toBe(9)
    expect(ws.pageSetup.fitToWidth).toBe(1)
    const rows = reportRows(5, 26)
    expect(rows.page(0).header).toBe(37)
    expect(rows.page(1).header).toBe(97)
    expect(ws.pageSetup.printArea).toBe(`A1:BF${rows.last}`)
    // a light line between every Gantt column, on both the P and the A row of an activity
    const first = reportRows(5, 26).page(0).first
    for (const r of [first, first + 1]) for (const c of [11, 12, 30, 58]) {
      expect(ws.getCell(r, c).border?.left?.style, `Gantt line at ${r},${c}`).toBe('thin')
    }
    // ...and the same light line as the lowest-priority conditional format (the way the 6-hour lines are drawn)
    expect([...xml.matchAll(/<formula>TRUE<\/formula>/g)].length).toBeGreaterThanOrEqual(5)
    expect([...xml.matchAll(/<brk\b/g)]).toHaveLength(5) // after the cover + between the 5 location pages
    expect(xml).toMatch(/<pageSetup\b[^>]*orientation="landscape"/)
  })
})

// --- formulas vs the engine, both evaluated for real (LibreOffice recalculates the export) ---
const hasSoffice = spawnSync('soffice', ['--version']).status === 0

async function recalc(bytes: Uint8Array) {
  const dir = mkdtempSync(join(tmpdir(), 'xlsx-recalc-'))
  const src = join(dir, 'in.xlsx')
  writeFileSync(src, bytes)
  execFileSync('soffice', ['--headless', '--convert-to', 'xlsx:Calc MS Excel 2007 XML', '--outdir', join(dir, 'out'), src], { stdio: 'ignore', timeout: 180_000 })
  const wb = await loadXlsx(readFileSync(join(dir, 'out', 'in.xlsx')))
  const val = (sheet: string, a: string): unknown => {
    const v = wb.getWorksheet(sheet)!.getCell(a).value as { formula?: string; result?: unknown } | null
    return v && typeof v === 'object' && !(v instanceof Date) && 'formula' in v ? v.result : v
  }
  return { val, wb }
}
const minute = (d: unknown) => Math.round((d as Date).getTime() / 60_000)
const num = (v: unknown) => Number(v ?? 0)

function compare(p: Project, r: ProjectResult, val: (s: string, a: string) => unknown, label: string) {
  const m = p.activityRowsPerLocation
  p.locations.forEach((loc, i) => {
    const b = diBlock(i, m)
    const lr = r.locations[i]
    loc.activities.forEach((a, k) => {
      const e = lr.activities[k]
      const row = b.first + a.no - 1
      const at = `${label} ${loc.name} #${a.no} (row ${row})`
      expect(minute(val('Data Input', `C${row}`)), `${at} planned start`).toBe(minute(e.plannedStart))
      expect(minute(val('Data Input', `D${row}`)), `${at} planned finish`).toBe(minute(e.plannedFinish))
      expect(num(val('Data Input', `S${row}`)), `${at} effective %`).toBeCloseTo(e.effectivePct, 6)
      expect(num(val('Data Input', `T${row}`)), `${at} plan %`).toBeCloseTo(e.planPct, 6)
      expect(minute(val('Data Input', `W${row}`)), `${at} forecast`).toBe(minute(e.forecastFinish))
      expect(num(val('Data Input', `X${row}`)), `${at} own variance`).toBeCloseTo(e.ownVariance, 6)
      expect(num(val('Data Input', `Y${row}`)), `${at} carried`).toBeCloseTo(e.carried, 2)
      expect(val('Data Input', `O${row}`), `${at} status`).toBe(e.status)
    })
    // Report cover row + page total
    const sr = 13 + i
    expect(val('Report', `C${sr}`), `${label} ${loc.name} status`).toBe(lr.status)
    expect(num(val('Report', `F${sr}`)), `${label} ${loc.name} variance`).toBeCloseTo(Math.round(lr.variance * 10) / 10, 6)
    expect(num(val('Report', `I${sr}`)), `${label} ${loc.name} buffer`).toBeCloseTo(lr.bufferToHandback, 6)
    expect(num(val('Report', `G${sr}`)), `${label} ${loc.name} plan %`).toBeCloseTo(lr.planPct, 6)
    expect(num(val('Report', `H${sr}`)), `${label} ${loc.name} actual %`).toBeCloseTo(lr.actualPct, 6)
    expect(minute(val('Report', `E${sr}`)), `${label} ${loc.name} forecast finish`).toBe(minute(lr.forecastFinish))
  })
  const t = totalAllLocations(r.locations)
  const tr = 13 + p.locations.length
  expect(val('Report', `C${tr}`), `${label} ALL LOCATIONS status`).toBe(t.status)
  expect(num(val('Report', `H${tr}`)), `${label} ALL actual %`).toBeCloseTo(t.actualPct, 6)
  expect(num(val('Report', `G${tr}`)), `${label} ALL plan %`).toBeCloseTo(t.planPct, 6)
  expect(num(val('Report', `I${tr}`)), `${label} ALL buffer`).toBeCloseTo(t.bufferToHandback, 6)
}

/** One location chosen to hit every awkward formula path. */
function stressProject(cutoffH = 15): Project {
  const s = (h: number) => { const a = actual(h); return { actualStartDate: a.date, actualStartTime: a.time } }
  const f = (h: number) => { const a = actual(h); return { actualFinishDate: a.date, actualFinishTime: a.time } }
  const p = mk([
    { durationH: 4, ...s(0), ...f(5) },                      // 1 finished 1 h late
    { durationH: 4, pred: 1, lagH: 2 },                      // 2 2 h gap absorbs the 1 h slip → 0
    { durationH: 3, pred: 2, rel: 'SS', lagH: 1 },           // 3
    { durationH: 2, pred: 3, rel: 'FF' },                    // 4
    { durationH: 1, pred: 5 },                               // 5 link points at itself → ! CHECK LINK
    { durationH: 1, lagH: 10, ...s(-5) },                    // 6 started before possession → ! CHECK DATES
    { durationH: 6, pred: 4, rel: 'SF', lagH: 8 },           // 7
    { durationH: 2 },                                        // 8 (switched off below)
    { durationH: 2, pred: 8 },                               // 9 points at a switched-off row → ! CHECK LINK
    { durationH: null, pred: 4 },                            // 10 blank duration → ! CHECK DURATION
    { durationH: 2, pred: 4, ...s(12), pct: 1 },             // 11 100 % typed, no finish → Completed
    { durationH: 4, pred: 11, ...s(14), pct: 0.25 },         // 12 in progress
    { durationH: 2, pred: 12 },                              // 13 not started, behind
    { durationH: 2, pred: 13, lagH: 20 },                    // 14 not started, far in the future
    { durationH: 2, pred: 0, lagH: 16.5 },                   // 15 a parallel branch: nothing above delays it
    { durationH: 3, pred: 12, rel: 'SS', lagH: 5 },          // 16 start-to-start with the in-progress row 12
    { durationH: 2, pred: 13, rel: 'FF', lagH: 1 },          // 17 finish-to-finish with row 13
  ], { cutoff: at(cutoffH), possessionEnd: at(48) })
  p.locations[0].activities.splice(7, 1) // switch row 8 off: its number stays free
  return p
}

describe.skipIf(!hasSoffice)('Excel formulas agree with the engine (recalculated by LibreOffice)', () => {
  it('tracker with progress typed in: all 130 activities, cover and totals', async () => {
    const p = await parseWorkbook(SCENARIO)
    const { val } = await recalc(await exportXlsx(p, layoutsOf(p)))
    compare(p, computeProject(p), val, 'scenario')
  }, 240_000)

  it('remarks reach the Report sheet (a contractor note on any activity is read by everyone)', async () => {
    let p = await parseWorkbook(SCENARIO)
    p = { ...p, locations: p.locations.map((l, i) => i !== 1 ? l : { ...l, activities: l.activities.map((a) => a.no === 2 ? { ...a, remarks: 'Waiting for crane' } : a.no === 4 ? { ...a, remarks: 'Rain delay' } : a) }) }
    const { val } = await recalc(await exportXlsx(p, layoutsOf(p)))
    const line = String(val('Report', `A${reportRows(p.locationCount, p.activityRowsPerLocation).page(1).remarks}`))
    expect(line).toContain('REMARKS')
    expect(line).toContain('#2 Waiting for crane')
    expect(line).toContain('#4 Rain delay')
    expect(String(val('Report', `A${reportRows(p.locationCount, p.activityRowsPerLocation).page(0).remarks}`))).toContain('none')
  }, 240_000)

  it.each([[15, 'mid-possession'], [5, 'early, so the 2 h gap absorbs the 1 h slip']])('stress project, cut-off %s h (%s)', async (cutoff) => {
    const p = stressProject(cutoff)
    const r = computeProject(p)
    const { val } = await recalc(await exportXlsx(p, layoutsOf(p)))
    compare(p, r, val, `stress@${cutoff}`)
    const st = r.locations[0].activities.map((a) => a.status)
    for (const s of ['! CHECK LINK', '! CHECK DATES', '! CHECK DURATION', 'Completed']) expect(st).toContain(s)
    expect(r.locations[0].status).toBe('CHECK INPUT')
    if (cutoff === 5) {
      expect(r.locations[0].activities[0].carried).toBe(1)  // finished 1 h late
      expect(r.locations[0].activities[1].carried).toBe(0)  // ...absorbed by the 2 h planned gap
    }
  }, 240_000)

  it('no formula cell in the recalculated export is an error', async () => {
    const p = await parseWorkbook(SCENARIO)
    const { wb } = await recalc(await exportXlsx(p, layoutsOf(p)))
    const bad: string[] = []
    for (const ws of wb.worksheets) ws.eachRow((row) => row.eachCell((c) => {
      const v = c.value as { result?: unknown } | null
      if (v && typeof v === 'object' && !(v instanceof Date) && v.result && typeof v.result === 'object' && 'error' in (v.result as object)) bad.push(`${ws.name}!${c.address}`)
    }))
    expect(bad).toEqual([])
  }, 240_000)
})

describe('an edited activity list still exports and re-imports', () => {
  it('added and deleted activities survive a round trip', async () => {
    const p0 = (await import('../src/import/parse')).parseWorkbook
    const imported = await p0(FIXTURE)
    const { addActivity, deleteActivity } = await import('../src/links/edit')
    const res = computeProject(imported)
    let p = addActivity(imported, 0, 'Brand new', 2).project
    const gone = p.locations[1].activities[2].no
    p = deleteActivity(p, 1, gone, (n) => res.locations[1].activities.find((a) => a.no === n)!.plannedStartH)
    const bytes = await exportXlsx(p, layoutsOf(p))
    const back = await parseWorkbook(bytes)
    expect(back.activityRowsPerLocation).toBe(p.activityRowsPerLocation)
    expect(back.locations[0].activities.at(-1)!.name).toBe('Brand new')
    expect(back.locations[1].activities.map((a) => a.no)).toEqual(p.locations[1].activities.map((a) => a.no))
  }, 60000)
})

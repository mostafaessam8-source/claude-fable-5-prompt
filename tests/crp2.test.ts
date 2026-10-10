import { readFileSync } from 'node:fs'
import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { computeProject } from '../src/engine/schedule'
import { exportXlsx } from '../src/export'
import { ImportError, parseWorkbook } from '../src/import/parse'
import { parseHeaderDate, parseLocationLabel, reconstructLinks } from '../src/import/crp2'
import { stripUnreadableParts } from '../src/import/sanitize'
import { parseLayout } from '../src/layout/parse'

const FILE = readFileSync('tests/fixtures/crp2/CRP2_EWR_Shutdown03_Progress_Sheet.xlsx')

describe('CRP2 helpers', () => {
  it('reads the header dates and location labels', () => {
    expect(parseHeaderDate('16-Oct-2026 00.00 AM')?.toISOString()).toBe('2026-10-16T00:00:00.000Z')
    expect(parseHeaderDate('17-Oct-2026 12.30 PM')?.toISOString()).toBe('2026-10-17T12:30:00.000Z')
    expect(parseHeaderDate('nonsense')).toBeNull()
    expect(parseLocationLabel('LOCATION: C263 , TK 209+025 (Line 1 & Line 3)')).toEqual({ code: 'C263', chainage: 'KM 209+025', lines: 'Line 1 & Line 3' })
    expect(parseLocationLabel('LOCATION: C265 ,TK 210+525 (Line 1 & Line 3)').chainage).toBe('KM 210+525')
  })

  it('rebuilds links that reproduce every start time', () => {
    const items = [
      { startH: 0, durH: 1 },   // 1 first row
      { startH: 1, durH: 1 },   // 2 FS the row above
      { startH: 0, durH: 1 },   // 3 starts at 0: FS an earlier finish? no (nothing finishes at 0) → SS with row 1
      { startH: 2, durH: 3 },   // 4 FS row 2's finish (not the row above)
      { startH: 9, durH: 1 },   // 5 nothing lines up → a lag after the row above (finish 5)
      { startH: 9, durH: 2 },   // 6 SS with row 5
    ]
    expect(reconstructLinks(items)).toEqual([
      { pred: 0, rel: 'FS', lagH: 0 },
      { pred: 1, rel: 'FS', lagH: 0 },
      { pred: 1, rel: 'SS', lagH: 0 },
      { pred: 2, rel: 'FS', lagH: 0 },
      { pred: 4, rel: 'FS', lagH: 4 },
      { pred: 5, rel: 'SS', lagH: 0 },
    ])
  })
})

describe('CRP2 progress sheet import', () => {
  it('reads 5 locations x 26 activities with the possession window and names', async () => {
    const p = await parseWorkbook(FILE)
    expect(p.locationCount).toBe(5)
    expect(p.activityRowsPerLocation).toBe(26)
    expect(p.locations.map((l) => l.activities.length)).toEqual([26, 26, 26, 26, 26])
    expect(p.locations.map((l) => l.name)).toEqual([
      'C263  –  KM 209+025', 'C265  –  KM 210+525', 'C267  –  KM 212+400', 'C288  –  KM 337+391', 'C289  –  KM 338+491',
    ])
    const s = p.settings
    expect(s.projectName).toBe('EWR CULVERTS REPLACEMENT PHASE 2')
    expect(s.subtitle).toBe('Culvert Replacement  –  Shutdown 03')
    expect(s.possessionStart.toISOString()).toBe('2026-10-16T00:00:00.000Z')
    expect(s.duration).toBe(48) // header says 24 h, the "Day 2" cells say 2 days
    expect(s.possessionEnd.toISOString()).toBe('2026-10-18T00:00:00.000Z')
    expect(s.cutoffDefaulted).toBe(true)
    expect(p.locations[0].scope).toBe('Line 1 & Line 3')
    expect(parseLayout(p.locations[0].name, p.locations[0].scope)).toMatchObject({ code: 'C263', chainage: 'KM 209+025', lines: 'Line 1 & Line 3', cells: null })
  })

  it('does not hide what is wrong in the source', async () => {
    const w = (await parseWorkbook(FILE)).warnings.join('\n')
    expect(w).toMatch(/header says the possession finishes .*24 h.*Day 2.*48 h/)
    expect(w).toMatch(/Pre-Shutdown Arrangement.*not a duration/)
    expect(w).toMatch(/No Work Hours.*rest period/)
    expect(w).toMatch(/C267.*row 86.*duration is blank in the source/)
    expect(w).toMatch(/C267.*row 111.*duration is blank in the source/)
    expect(w).toMatch(/earlier than the row above.*\+24 h/)
    expect(w).toMatch(/span is -1\.00 h but No\. Hours is 2\.00 h/)
    expect(w).toMatch(/Cells, OTMP and base station are not in a CRP2 sheet/)
  })

  it('blank durations are imported as blank, so the app flags them', async () => {
    const p = await parseWorkbook(FILE)
    const blanks = p.locations[2].activities.filter((a) => a.durationH == null)
    expect(blanks.map((a) => a.sourceRow)).toEqual([86, 111])
    const r = computeProject(p)
    expect(r.locations[2].activities.filter((a) => a.status === '! CHECK DURATION')).toHaveLength(2)
    expect(r.locations[2].status).toBe('CHECK INPUT')
  })

  it("the engine reproduces the sheet's own planned start of every row (hours, to the minute)", async () => {
    const p = await parseWorkbook(FILE)
    const r = computeProject(p)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load((await stripUnreadableParts(FILE)) as unknown as ExcelJS.Buffer)
    const ws = wb.getWorksheet('Shutdown02 Progress')!
    const epoch = Date.UTC(1899, 11, 30)
    let checked = 0
    p.locations.forEach((l, i) => l.activities.forEach((a, k) => {
      const v = ws.getCell(`K${a.sourceRow}`).value as { result?: Date } | Date
      const d = v instanceof Date ? v : (v as { result?: Date }).result
      if (!(d instanceof Date)) return
      const expected = Math.round(((d.getTime() - epoch) / 3_600_000) * 60) / 60
      expect(r.locations[i].activities[k].plannedStartH, `${l.name} row ${a.sourceRow}`).toBeCloseTo(expected, 6)
      checked++
    }))
    expect(checked).toBeGreaterThan(120)
  })

  it('exports and re-imports to the same model', async () => {
    const p1 = await parseWorkbook(FILE)
    const p2 = await parseWorkbook(await exportXlsx(p1, p1.locations.map((l) => parseLayout(l.name, l.scope))))
    // import warnings describe the source file and are not stored in the workbook
    // (and sourceRow is the row in the file it came from, which differs by design)
    const norm = (p: typeof p1) => ({ ...p, warnings: [], locations: p.locations.map((l) => ({ ...l, activities: l.activities.map((a) => ({ ...a, sourceRow: 0 })) })) })
    expect(norm(p2)).toEqual(norm(p1))
  })

  it('anything else is rejected with the sheets it found', async () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('Budget').getCell('A1').value = 'hello'
    const bytes = new Uint8Array(await wb.xlsx.writeBuffer())
    await expect(parseWorkbook(bytes)).rejects.toThrow(/no "Data Input" sheet.*not a CRP2.*"Budget"/s)
    await expect(parseWorkbook(bytes)).rejects.toBeInstanceOf(ImportError)
  })
})

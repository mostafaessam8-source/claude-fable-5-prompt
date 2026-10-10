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
    expect(w).toMatch(/C267.*row 86.*No\. Hours is blank; the duration \(1\.0 h\) was taken from the sheet's planned start→finish/)
    expect(w).toMatch(/C267.*row 111.*no duration and no usable planned finish/)
    expect(w).toMatch(/typed start of 8\.0 h that shows only a time of day, so 32\.0 h \(\+24 h\) was used/)
    expect(w).toMatch(/row 176.*links to row 175, which has no times/)
    expect(w).toMatch(/differs from No\. Hours — the dates as shown in the sheet were kept/)
    expect(w).toMatch(/row 42.*the sheet's finish \(38\.0 h\) is not after its start \(39\.0 h\) — No\. Hours \(2\.0 h\) was used/)
    expect(w).toMatch(/Cells, OTMP and base station are not in a CRP2 sheet/)
  })

  it('a duration that is blank everywhere is imported blank, so the app flags it (never invented)', async () => {
    const p = await parseWorkbook(FILE)
    const blanks = p.locations[2].activities.filter((a) => a.durationH == null)
    expect(blanks.map((a) => a.sourceRow)).toEqual([111]) // row 86 has planned times: its span is used
    const r = computeProject(p)
    expect(r.locations[2].activities.filter((a) => a.status === '! CHECK DURATION')).toHaveLength(1)
    expect(r.locations[2].status).toBe('CHECK INPUT')
  })

  it('every location ends its last activity at 12 AM, the end of the possession (hour 48)', async () => {
    const r = computeProject(await parseWorkbook(FILE))
    for (const l of r.locations) {
      const last = l.activities[l.activities.length - 1]
      expect(last.name, l.name).toMatch(/^Finishing/)
      expect(last.plannedFinishH, l.name).toBe(48)
      expect(last.plannedFinish.toISOString(), l.name).toBe('2026-10-18T00:00:00.000Z')
      expect(l.plannedFinishH, l.name).toBe(48) // nothing finishes later
    }
  })

  it("keeps the dates the sheet shows: every row's start and finish equal its K / L times (mod 24 h)", async () => {
    const p = await parseWorkbook(FILE)
    const r = computeProject(p)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load((await stripUnreadableParts(FILE)) as unknown as ExcelJS.Buffer)
    const ws = wb.getWorksheet('Shutdown02 Progress')!
    const hv = (a: string) => {
      const v = ws.getCell(a).value as { result?: unknown } | Date | null
      const d = v instanceof Date ? v : (v as { result?: unknown } | null)?.result
      return d instanceof Date ? (d.getTime() - Date.UTC(1899, 11, 30)) / 3_600_000 : null
    }
    const mod = (x: number) => ((x % 24) + 24) % 24
    // rows whose own times are impossible in the sheet (finish before start, or a start linked to a rest row)
    const impossible = new Set([42, 75, 108, 141, 174, 176, 177, 178])
    let checked = 0
    p.locations.forEach((l, i) => l.activities.forEach((a, k) => {
      if (impossible.has(a.sourceRow)) return
      const kr = hv(`K${a.sourceRow}`), lr = hv(`L${a.sourceRow}`)
      const e = r.locations[i].activities[k]
      if (kr != null) expect(mod(e.plannedStartH), `${l.name} row ${a.sourceRow} start`).toBeCloseTo(mod(kr), 1)
      if (lr != null && a.durationH != null) expect(mod(e.plannedFinishH), `${l.name} row ${a.sourceRow} finish`).toBeCloseTo(mod(lr), 1)
      checked++
    }))
    expect(checked).toBeGreaterThan(110)
  })

  it('typed times that lost their +24 h are repaired, and what follows them with them', async () => {
    const p = await parseWorkbook(FILE)
    const r = computeProject(p)
    const startOf = (loc: number, row: number) => {
      const k = p.locations[loc].activities.findIndex((a) => a.sourceRow === row)
      return r.locations[loc].activities[k].plannedStartH
    }
    expect(startOf(1, 68)).toBe(26)  // C265: typed 2:00 AM → day 2
    expect(startOf(1, 69)).toBe(27)  // …and the row linked after it
    expect(startOf(1, 77)).toBe(28)  // …and the destressing linked to that (the sheet showed 4 h)
    expect(startOf(2, 103)).toBe(32) // C267: OTMP moves line 1→3 typed 8:00 AM
    expect(startOf(2, 105)).toBe(33)
    expect(startOf(2, 110)).toBe(41)
    expect(startOf(2, 112)).toBe(47)
    expect(startOf(4, 176)).toBe(36) // C289: linked to a rest row → starts with the OTMP return
    expect(startOf(0, 44)).toBe(39)  // C263 needed no repair: same start as the OTMP return
  })

  it('exports and re-imports to the same model', async () => {
    const p1 = await parseWorkbook(FILE)
    const p2 = await parseWorkbook(await exportXlsx(p1, p1.locations.map((l) => parseLayout(l.name, l.scope))))
    // import warnings describe the source file and are not stored in the workbook
    // (and sourceRow is the row in the file it came from, which differs by design)
    const norm = (p: typeof p1) => ({ ...p, warnings: [], source: undefined, locations: p.locations.map((l) => ({ ...l, activities: l.activities.map((a) => ({ ...a, sourceRow: 0 })) })) })
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

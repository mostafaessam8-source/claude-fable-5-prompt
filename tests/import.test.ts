import { readFileSync } from 'node:fs'
import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { ImportError, parseWorkbook } from '../src/import/parse'
import { stripUnreadableParts } from '../src/import/sanitize'

const FIXTURE = readFileSync('tests/fixtures/EWR_Phase2_Shutdown03_Progress_Tracker.xlsx')

describe('import', () => {
  it('reads 5 locations x 26 activities', async () => {
    const p = await parseWorkbook(FIXTURE)
    expect(p.locationCount).toBe(5)
    expect(p.activityRowsPerLocation).toBe(26)
    expect(p.locations).toHaveLength(5)
    for (const l of p.locations) expect(l.activities).toHaveLength(26)
    expect(p.locations.reduce((n, l) => n + l.activities.length, 0)).toBe(130)
    expect(p.locations[0].name).toMatch(/^C263/)
    expect(p.locations[0].activities[0]).toMatchObject({ no: 1, pred: 0, rel: 'FS', sourceRow: 27 })
    expect(p.locations[0].activities[25].sourceRow).toBe(52)
    expect(p.locations[1].activities[0].sourceRow).toBe(57)
  })

  it('reads settings and defaults the cut-off to possession start', async () => {
    const { settings: s } = await parseWorkbook(FIXTURE)
    expect(s.projectName).toBe('EWR CULVERTS REPLACEMENT PHASE 2')
    expect(s.possessionStart.toISOString()).toBe('2026-10-16T00:00:00.000Z')
    expect(s.possessionEnd.toISOString()).toBe('2026-10-18T00:00:00.000Z')
    expect(s.unit).toBe('hours')
    expect(s.cutoffDefaulted).toBe(true)
    expect(s.cutoff).toEqual(s.possessionStart)
    expect(s.ganttStart).toEqual(s.possessionStart)
  })

  it('rejects a block whose TOT marker is missing, naming the block', async () => {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load((await stripUnreadableParts(FIXTURE)) as unknown as ExcelJS.Buffer)
    wb.getWorksheet('Data Input')!.getCell('A83').value = 'XXX' // block 2 total row
    const bad = await wb.xlsx.writeBuffer()
    await expect(parseWorkbook(bad as ArrayBuffer)).rejects.toThrow(/Block 2 .*A83/)
    await expect(parseWorkbook(bad as ArrayBuffer)).rejects.toBeInstanceOf(ImportError)
  })
})

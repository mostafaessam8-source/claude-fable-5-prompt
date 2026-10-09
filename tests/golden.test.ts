/**
 * Cross-check against the workbook's own formulas, recalculated by LibreOffice
 * (see tests/tools/make-golden.mjs): planned dates to the minute for all 130 activities,
 * and — for a scenario with progress typed in — progress, forecast, variance and status.
 */
import { readFileSync } from 'node:fs'
import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { computeProject } from '../src/engine/schedule'
import { parseWorkbook } from '../src/import/parse'
import { stripUnreadableParts } from '../src/import/sanitize'

async function load(name: string) {
  const buf = readFileSync(`tests/fixtures/golden/${name}.xlsx`)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load((await stripUnreadableParts(buf)) as unknown as ExcelJS.Buffer)
  const ws = wb.getWorksheet('Data Input')!
  const val = (a: string) => {
    const v = ws.getCell(a).value as ExcelJS.CellValue & { result?: unknown }
    if (v && typeof v === 'object' && !(v instanceof Date) && 'formula' in v) return v.result // missing = 0 / ""
    return v
  }
  const result = computeProject(await parseWorkbook(buf))
  return { val, result }
}

const minute = (d: Date) => Math.round(d.getTime() / 60_000)
const hours = (d: unknown) => Number(d ?? 0)

describe('baseline: planned dates match the workbook', () => {
  it('all 130 planned starts and finishes agree to the minute', async () => {
    const { val, result } = await load('baseline')
    const p = await parseWorkbook(readFileSync('tests/fixtures/golden/baseline.xlsx'))
    let checked = 0
    p.locations.forEach((l, i) => {
      l.activities.forEach((a, k) => {
        const r = result.locations[i].activities[k]
        const c = val(`C${a.sourceRow}`) as Date
        const d = val(`D${a.sourceRow}`) as Date
        expect(c, `C${a.sourceRow}`).toBeInstanceOf(Date)
        expect(minute(r.plannedStart), `${l.name} #${a.no} start`).toBe(minute(c))
        expect(minute(r.plannedFinish), `${l.name} #${a.no} finish`).toBe(minute(d))
        checked++
      })
    })
    expect(checked).toBe(130)
  })
})

describe('scenario with progress: engine matches the workbook formulas', () => {
  it('effective %, plan %, forecast, own variance, carried slip and status', async () => {
    const { val, result } = await load('scenario')
    const p = await parseWorkbook(readFileSync('tests/fixtures/golden/scenario.xlsx'))
    expect(p.settings.cutoff.toISOString()).toBe('2026-10-16T18:00:00.000Z')
    let checked = 0
    p.locations.forEach((l, i) => {
      l.activities.forEach((a, k) => {
        const r = result.locations[i].activities[k]
        const at = `${l.name} #${a.no} (row ${a.sourceRow})`
        const row = a.sourceRow
        expect(r.effectivePct, `${at} S`).toBeCloseTo(hours(val(`S${row}`)), 9)
        expect(r.planPct, `${at} T`).toBeCloseTo(hours(val(`T${row}`)), 9)
        expect(minute(r.forecastFinish), `${at} W`).toBe(minute(val(`W${row}`) as Date))
        expect(r.ownVariance, `${at} X`).toBeCloseTo(hours(val(`X${row}`)), 9)
        expect(r.carried, `${at} Y`).toBeCloseTo(hours(val(`Y${row}`)), 9)
        expect(r.status, `${at} O`).toBe(val(`O${row}`))
        checked++
      })
    })
    expect(checked).toBe(130)
    // The scenario really exercises the interesting states.
    const statuses = new Set(result.locations.flatMap((l) => l.activities.map((a) => a.status)))
    for (const s of ['Completed - Delayed', 'Completed - Ahead', 'Completed', 'In Progress - BEHIND', '! CHECK DATES', 'NOT STARTED - LATE']) {
      expect(statuses, s).toContain(s)
    }
  })
})

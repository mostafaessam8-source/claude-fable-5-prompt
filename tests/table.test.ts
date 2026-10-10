import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { computeProject } from '../src/engine/schedule'
import { parseWorkbook } from '../src/import/parse'
import { applyTable, fmtCell, parseDateTime, parseTsv, TableError, toTable } from '../src/links/table'

const FIXTURE = readFileSync('tests/fixtures/EWR_Phase2_Shutdown03_Progress_Tracker.xlsx')
const origin = new Date(Date.UTC(2026, 9, 16))
const load = async () => { const p = await parseWorkbook(FIXTURE); return { p, r: computeProject(p) } }
const edit = (tsv: string, f: (cells: string[], i: number) => string[] | null) =>
  tsv.split('\n').map((l, i) => (i === 0 ? l.split('\t') : f(l.split('\t'), i))).filter((x): x is string[] => !!x).map((c) => c.join('\t')).join('\n')

describe('copy a table out and paste it back', () => {
  it('pasting what was copied changes nothing', async () => {
    const { p, r } = await load()
    for (let loc = 0; loc < p.locations.length; loc++) {
      const t = applyTable(p, loc, toTable(p, r, loc), { removeMissing: true })
      expect(t.changes, `location ${loc}`).toEqual([])
      expect(t.warnings).toEqual([])
      expect(t.project.locations[loc].activities.map((a) => [a.name, a.pred, a.rel, a.lagH, a.durationH])).toEqual(p.locations[loc].activities.map((a) => [a.name, a.pred, a.rel, a.lagH, a.durationH]))
      const r2 = computeProject(t.project).locations[loc].activities
      expect(r2.map((a) => a.plannedStartH)).toEqual(r.locations[loc].activities.map((a) => a.plannedStartH))
    }
  })

  it('edits in Excel: names, duration, link, lag, actuals, % and remarks', async () => {
    const { p, r } = await load()
    const tsv = edit(toTable(p, r, 0), (c, i) => {
      if (i === 2) { c[1] = 'Renamed in Excel'; c[2] = '3'; c[5] = '1.5' }
      if (i === 4) { c[8] = '16-Oct-2026 03:00'; c[10] = '40%'; c[11] = 'half done' }
      return c
    })
    const t = applyTable(p, 0, tsv, { removeMissing: true })
    const a2 = t.project.locations[0].activities[1], a4 = t.project.locations[0].activities[3]
    expect([a2.name, a2.durationH, a2.lagH]).toEqual(['Renamed in Excel', 3, 1.5])
    expect(a4.actualStartTime).toBe(3)
    expect(a4.pct).toBe(0.4)
    expect(a4.remarks).toBe('half done')
    expect(t.edited).toBe(2)
    expect(t.warnings).toEqual([])
  })

  it('reorder, delete and insert rows; numbers and links follow', async () => {
    const { p, r } = await load()
    const lines = toTable(p, r, 1).split('\n')
    const [h, ...rows] = lines
    const swapped = [h, rows[1], rows[0], ...rows.slice(2, 10), '\tBrand new\t2\t\tFS\t0\t\t\t\t\t\t', ...rows.slice(12)].join('\n')
    const t = applyTable(p, 1, swapped, { removeMissing: true })
    const acts = t.project.locations[1].activities
    expect(acts.map((a) => a.no)).toEqual(acts.map((_, i) => i + 1))
    expect(acts[0].name).toBe(p.locations[1].activities[1].name)
    expect(acts.some((a) => a.name === 'Brand new')).toBe(true)
    expect(t.added).toBe(1)
    expect(t.removed).toBe(2)
    // no date moved for anything that survived
    const olds = computeProject(p).locations[1].activities
    const before = new Map(olds.filter((a) => olds.filter((b) => b.name === a.name).length === 1).map((a) => [a.name, a.plannedStartH]))
    for (const a of computeProject(t.project).locations[1].activities) if (before.has(a.name)) expect(a.plannedStartH, a.name).toBeCloseTo(before.get(a.name)!, 5)
    // keeping the missing rows instead
    expect(applyTable(p, 1, swapped, { removeMissing: false }).project.locations[1].activities.length).toBe(acts.length + 2)
  })

  it('typing a planned start moves the lag, the link stays', async () => {
    const { p, r } = await load()
    const tsv = edit(toTable(p, r, 0), (c, i) => { if (i === 5) c[6] = '17-Oct-2026 10:00'; return c })
    const t = applyTable(p, 0, tsv, { removeMissing: true })
    const after = computeProject(t.project).locations[0].activities[4]
    expect(after.plannedStart.toISOString()).toBe('2026-10-17T10:00:00.000Z')
    expect(t.project.locations[0].activities[4].pred).toBe(p.locations[0].activities[4].pred)
    expect(t.changes.join('\n')).toMatch(/planned start/)
  })

  it('understands the dates Excel shows, in any column order', async () => {
    expect(parseDateTime('2026-10-16 01:30', false, origin)).toEqual(new Date(Date.UTC(2026, 9, 16, 1, 30)))
    expect(parseDateTime('16-Oct-26 1:30 PM', false, origin)).toEqual(new Date(Date.UTC(2026, 9, 16, 13, 30)))
    expect(parseDateTime('10/16/2026 12:00 AM', false, origin)).toEqual(new Date(Date.UTC(2026, 9, 16, 0, 0)))
    expect(parseDateTime('16/10/2026 14:00', true, origin)).toEqual(new Date(Date.UTC(2026, 9, 16, 14, 0)))
    expect(parseDateTime('Fri 16-Oct 01:00', false, origin)).toEqual(new Date(Date.UTC(2026, 9, 16, 1, 0)))
    expect(parseDateTime('46311.5', false, origin)).toEqual(new Date(Date.UTC(2026, 9, 16, 12, 0)))
    expect(parseDateTime('', false, origin)).toBeNull()
    expect(parseDateTime('soon', false, origin)).toBe('bad')
    expect(fmtCell(new Date(Date.UTC(2026, 9, 6, 1, 5)))).toBe('06-Oct-2026 01:05')
    const { p, r } = await load()
    const t = toTable(p, r, 0).split('\n')
    const cols = t[0].split('\t')
    // columns in another order, only some of them
    const pick = ['Remarks', '#', 'Activity']
    const reduced = [pick.join('\t'), ...t.slice(1).map((l) => { const c = l.split('\t'); return pick.map((k) => c[cols.indexOf(k)]).join('\t') })].join('\n')
    const x = applyTable(p, 0, reduced.replace(/^(OTMP[^\t]*)/m, '$1'), { removeMissing: true })
    expect(x.changes).toEqual([])
  })

  it('quoted cells, comma decimals, bad cells and non-tables', async () => {
    expect(parseTsv('a\t"b\tc"\t"d ""q"""\n1\t2\t3')).toEqual([['a', 'b\tc', 'd "q"'], ['1', '2', '3']])
    const { p, r } = await load()
    const tsv = edit(toTable(p, r, 0), (c, i) => { if (i === 3) { c[2] = '2,5'; c[10] = 'lots'; c[11] = 'line one\nline two' } return c })
    const t = applyTable(p, 0, tsv.replace('line one\nline two', '"line one\nline two"'), { removeMissing: true })
    expect(t.project.locations[0].activities[2].durationH).toBe(2.5)
    expect(t.project.locations[0].activities[2].remarks).toBe('line one\nline two')
    expect(t.warnings.some((w) => /% complete/.test(w))).toBe(true)
    expect(() => applyTable(p, 0, 'hello world', { removeMissing: true })).toThrow(TableError)
  })
})

// --- the formulas version, evaluated for real (LibreOffice recalculates a sheet built from the copied text) ---
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync as wf, readFileSync as rf } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import { patchActivity } from '../src/links/edit'

const hasSoffice = spawnSync('soffice', ['--version']).status === 0

/** What Excel does with pasted text: cells starting with "=" become formulas. Returns the recalculated sheet's cell texts. */
async function pasteAndRecalc(tsv: string, at = { row: 1, col: 1 }, tweak?: (ws: ExcelJS.Worksheet) => void) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('S')
  parseTsv(tsv).forEach((cells, i) => cells.forEach((v, j) => {
    if (v === '') return
    const c = ws.getCell(at.row + i, at.col + j)
    if (v.startsWith('=')) c.value = { formula: v.slice(1) }
    else if (/^-?\d+(\.\d+)?$/.test(v)) c.value = Number(v)
    else if (/^\d{2}-[A-Za-z]{3}-\d{4} \d{2}:\d{2}$/.test(v) && i === 0) c.value = new Date(Date.UTC(Number(v.slice(7, 11)), MON3.indexOf(v.slice(3, 6).toLowerCase()), Number(v.slice(0, 2)), Number(v.slice(12, 14)), Number(v.slice(15, 17)))) // the origin cell: Excel reads it as a date
    else c.value = v
  }))
  tweak?.(ws)
  const dir = mkdtempSync(join(tmpdir(), 'tbl-'))
  wf(join(dir, 'in.xlsx'), Buffer.from(await wb.xlsx.writeBuffer()))
  execFileSync('soffice', ['--headless', '--convert-to', 'xlsx:Calc MS Excel 2007 XML', '--outdir', join(dir, 'out'), join(dir, 'in.xlsx')], { stdio: 'ignore', timeout: 180_000 })
  const back = new ExcelJS.Workbook()
  await back.xlsx.readFile(join(dir, 'out', 'in.xlsx'))
  const w = back.getWorksheet('S')!
  const text = (r: number, c: number) => { const v = w.getCell(r, c).value as { result?: unknown } | unknown; return String(v && typeof v === 'object' && 'result' in (v as object) ? (v as { result: unknown }).result : v ?? '') }
  return { text, rf }
}
const MON3 = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

describe.skipIf(!hasSoffice)('Excel formulas in the copied table', () => {
  it('the planned dates agree with the app for every location', async () => {
    const { p, r } = await load()
    for (const loc of [0, 2]) {
      const { text } = await pasteAndRecalc(toTable(p, r, loc, { formulas: true }))
      r.locations[loc].activities.forEach((a, k) => {
        expect(text(2 + k, 7), `loc ${loc} #${a.no} start`).toBe(fmtCell(a.plannedStart))
        expect(text(2 + k, 8), `loc ${loc} #${a.no} finish`).toBe(fmtCell(a.plannedFinish))
      })
    }
  }, 240_000)

  it('changing a duration, a lag, a relationship in Excel moves what follows, exactly like the app', async () => {
    const { p, r } = await load()
    // the same three edits made in the app
    let q = patchActivity(p, 0, 2, { durationH: 4 })
    q = patchActivity(q, 0, 5, { lagH: 2 })
    q = patchActivity(q, 0, 9, { rel: 'SS' })
    const want = computeProject(q).locations[0].activities
    // ...and made in the pasted Excel sheet (Duration = column C, Rel = E, Lag = F)
    const { text } = await pasteAndRecalc(toTable(p, r, 0, { formulas: true }), { row: 1, col: 1 }, (ws) => {
      ws.getCell(3, 3).value = 4 // row of #2
      ws.getCell(6, 6).value = 2 // #5
      ws.getCell(10, 5).value = 'SS' // #9
    })
    want.forEach((a, k) => {
      expect(text(2 + k, 7), `#${a.no} start`).toBe(fmtCell(a.plannedStart))
      expect(text(2 + k, 8), `#${a.no} finish`).toBe(fmtCell(a.plannedFinish))
    })
    // and pasting that edited sheet back gives exactly the app's own result, with no stray date edits
    const copyBack = Array.from({ length: want.length + 1 }, (_, i) => Array.from({ length: 12 }, (_, j) => text(1 + i, 1 + j)).join('\t')).join('\n')
    const t = applyTable(p, 0, copyBack, { removeMissing: true })
    expect(t.warnings).toEqual([])
    expect(computeProject(t.project).locations[0].activities.map((a) => a.plannedStartH)).toEqual(want.map((a) => a.plannedStartH))
    expect(t.changes.filter((c) => /planned/.test(c))).toEqual([])
  }, 240_000)

  it('can be pasted anywhere: the formulas are written for the chosen top-left cell', async () => {
    const { p, r } = await load()
    const { text } = await pasteAndRecalc(toTable(p, r, 1, { formulas: true, anchor: 'C5' }), { row: 5, col: 3 })
    r.locations[1].activities.forEach((a, k) => expect(text(6 + k, 9), `#${a.no}`).toBe(fmtCell(a.plannedStart)))
  }, 240_000)
})

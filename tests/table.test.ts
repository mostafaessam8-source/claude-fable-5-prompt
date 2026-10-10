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

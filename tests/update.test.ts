import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { exportXlsx } from '../src/export'
import { applyUpdate, diffUpdate } from '../src/import/update'
import { parseWorkbook } from '../src/import/parse'
import { parseLayout } from '../src/layout/parse'
import { deleteActivity, patchActivity } from '../src/links/edit'

const FIXTURE = readFileSync('tests/fixtures/EWR_Phase2_Shutdown03_Progress_Tracker.xlsx')
const layoutsOf = (p: Awaited<ReturnType<typeof parseWorkbook>>) => p.locations.map((l) => parseLayout(l.name, l.scope))

describe('contractor update', () => {
  it('sees exactly what the contractor changed, and applying it gives their data', async () => {
    const base = await parseWorkbook(FIXTURE)
    // the "contractor" edits actuals, a remark and a duration, then sends the exported file back
    let theirs = patchActivity(base, 1, 3, { actualStartDate: new Date(Date.UTC(2026, 9, 16)), actualStartTime: 2.5, remarks: 'Waiting for crane' })
    theirs = patchActivity(theirs, 1, 4, { durationH: 7.5, pct: 0.4 })
    const returned = await parseWorkbook(await exportXlsx(theirs, layoutsOf(theirs)))
    const d = diffUpdate(base, returned)
    expect(d.updates.map((u) => `${u.loc}:${u.no}`).sort()).toEqual(['1:3', '1:4'])
    expect(d.updates.find((u) => u.no === 3)!.changes.map((c) => c.field).sort()).toEqual(['actualStart', 'remarks'])
    expect(d.updates.find((u) => u.no === 4)!.changes.map((c) => c.field).sort()).toEqual(['durationH', 'pct'])
    const applied = applyUpdate(base, d, new Set(['1:3', '1:4']))
    const a3 = applied.locations[1].activities.find((a) => a.no === 3)!
    expect(a3.remarks).toBe('Waiting for crane')
    expect(a3.actualStartTime).toBe(2.5)
    expect(applied.locations[1].activities.find((a) => a.no === 4)!.durationH).toBe(7.5)
    // only the chosen ones
    expect(applyUpdate(base, d, new Set(['1:3'])).locations[1].activities.find((a) => a.no === 4)!.durationH).toBe(base.locations[1].activities.find((a) => a.no === 4)!.durationH)
    // an identical file changes nothing
    expect(diffUpdate(base, base).updates).toEqual([])
  }, 60000)
  it('survives a renumbered project: matches by name and skips the link fields', async () => {
    const base = await parseWorkbook(FIXTURE)
    const returned = patchActivity(base, 0, 2, { remarks: 'Note' })
    const start = (n: number) => base.locations[0].activities.find((a) => a.no === n)!.lagH
    const mine = deleteActivity(base, 0, 1, start) // numbers shift by one
    const d = diffUpdate(mine, returned)
    const u = d.updates.find((x) => x.name === base.locations[0].activities[1].name)!
    expect(u.changes.map((c) => c.field)).toEqual(['remarks'])
    expect(d.notes.some((n) => /numbered differently/.test(n))).toBe(true)
  })
})

describe('offline copy plumbing', () => {
  it('the update file round-trips dates, and refuses anything else', async () => {
    const { updateFileText, parseUpdateFile, embed } = await import('../src/offline/offline')
    const base = await parseWorkbook(FIXTURE)
    const p = patchActivity(base, 0, 2, { actualStartDate: new Date(Date.UTC(2026, 9, 16)), actualStartTime: 1.5, remarks: 'ok </script> "quoted"' })
    const file = parseUpdateFile(updateFileText(p, layoutsOf(p), 'abc'))
    const back = file.project
    expect(back.locations[0].activities[1].actualStartDate).toEqual(new Date(Date.UTC(2026, 9, 16)))
    expect(diffUpdate(base, back).updates).toHaveLength(1)
    // a corrected site layout travels with the update and can be applied
    const mine = layoutsOf(base)
    const theirs = mine.map((l, i) => (i === 1 ? { ...l, kind: 'pipe' as const, cells: 2 } : l))
    const f2 = parseUpdateFile(updateFileText(base, theirs, 'abc'))
    const d2 = diffUpdate(base, f2.project, mine, f2.layouts)
    expect(d2.layouts).toHaveLength(1)
    expect(d2.layouts[0].changes.map((c) => c.field).sort()).toEqual(['cells', 'kind'])
    const { applyLayoutUpdate } = await import('../src/import/update')
    expect(applyLayoutUpdate(mine, d2, new Set(['layout:1']))[1]).toMatchObject({ kind: 'pipe', cells: 2 })
    expect(applyLayoutUpdate(mine, d2, new Set())[1].kind).toBe(mine[1].kind)
    expect(() => parseUpdateFile('{"hello":1}')).toThrow(/not a SAR update file/)
    expect(() => parseUpdateFile('nope')).toThrow(/not a SAR update file/)
    // embedded data can never close its <script> tag
    expect(embed({ id: 'x', preparedAt: '', project: p, layouts: layoutsOf(p) })).not.toContain('</script')
  }, 60000)
})

describe('a contractor who restructures the plan', () => {
  it('structure and settings changes are listed, field changes still merge', async () => {
    const { addActivity, deleteActivity, moveActivities } = await import('../src/links/edit')
    const { addLocation } = await import('../src/model/locations')
    const base = await parseWorkbook(FIXTURE)
    const lay = layoutsOf(base)
    const start = (n: number) => base.locations[0].activities.find((a) => a.no === n)!.lagH
    let t = addActivity(base, 0, 'Extra work', 2).project
    t = deleteActivity(t, 0, 3, start)
    t = moveActivities(t, 1, [5], 2, start).project
    t = { ...t, settings: { ...t.settings, duration: t.settings.duration + 24 } }
    t = patchActivity(t, 0, 1, { remarks: 'x' })
    const e = addLocation({ project: t, layouts: lay }, 'C999  –  KM 9')
    const d = diffUpdate(base, e.project, lay, e.layouts)
    const text = d.structure.join('\n')
    expect(text).toMatch(/activity added — #\d+ Extra work/)
    expect(text).toMatch(/activity removed/)
    expect(text).toMatch(/order of the activities changed/)
    expect(text).toMatch(/Location added: “C999/)
    expect(text).toMatch(/Possession duration/)
    expect(d.updates.some((u) => u.changes.some((c) => c.field === 'remarks'))).toBe(true)
    expect(diffUpdate(base, base, lay, lay).structure).toEqual([])
  }, 60000)
})

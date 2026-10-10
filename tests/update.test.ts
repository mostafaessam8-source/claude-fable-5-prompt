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
    const back = parseUpdateFile(updateFileText(p, layoutsOf(p), 'abc'))
    expect(back.locations[0].activities[1].actualStartDate).toEqual(new Date(Date.UTC(2026, 9, 16)))
    expect(diffUpdate(base, back).updates).toHaveLength(1)
    expect(() => parseUpdateFile('{"hello":1}')).toThrow(/not a SAR update file/)
    expect(() => parseUpdateFile('nope')).toThrow(/not a SAR update file/)
    // embedded data can never close its <script> tag
    expect(embed({ id: 'x', preparedAt: '', project: p, layouts: layoutsOf(p) })).not.toContain('</script')
  }, 60000)
})

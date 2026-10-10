import { describe, expect, it } from 'vitest'
import { computeProject } from '../src/engine/schedule'
import { patchActivity } from '../src/links/edit'
import type { Rel } from '../src/model/types'
import { dragPatch, linkFromHandles, MIN_DUR, relFromEdges, type DragMode } from '../src/report/dragmath'
import { project as mk } from './helpers'

/** activity 2 follows activity 1 (planned 0–4) with the given relationship; returns activity 2's planned [start, finish]. */
const make = (rel: Rel, lagH: number, durationH = 3) => mk([{ durationH: 4 }, { durationH, pred: 1, rel, lagH }])
const ends = (p: ReturnType<typeof make>) => { const a = computeProject(p).locations[0].activities[1]; return [a.plannedStartH, a.plannedFinishH] }
const dragged = (rel: Rel, lag: number, mode: DragMode, delta: number) => {
  const p = make(rel, lag)
  const a = p.locations[0].activities[1]
  return patchActivity(p, 0, 2, dragPatch(mode, rel, true, a.lagH, a.durationH!, delta))
}

describe('dragging a bar, for every relationship', () => {
  // base positions: FS lag 2 → [6,9] · SS lag 2 → [2,5] · FF lag 2 → finish 6, start 3 → [3,6] · SF lag 5 → start 0+5-3 = 2 → [2,5]
  const cases: [Rel, number][] = [['FS', 2], ['SS', 2], ['FF', 2], ['SF', 5]]
  it.each(cases)('%s: move shifts both ends, left moves only the start, right moves only the finish', (rel, lag) => {
    const [s0, f0] = ends(make(rel, lag))
    expect(ends(dragged(rel, lag, 'move', 1.5))).toEqual([s0 + 1.5, f0 + 1.5])
    expect(ends(dragged(rel, lag, 'left', 1))).toEqual([s0 + 1, f0])
    expect(ends(dragged(rel, lag, 'right', 2))).toEqual([s0, f0 + 2])
  })
  it.each(cases)('%s: a bar cannot be shrunk below the minimum duration, from either side', (rel, lag) => {
    const [s0, f0] = ends(make(rel, lag))
    const l = ends(dragged(rel, lag, 'left', 99))
    expect(l[1]).toBe(f0); expect(l[1] - l[0]).toBeCloseTo(MIN_DUR, 6)
    const r = ends(dragged(rel, lag, 'right', -99))
    expect(r[0]).toBe(s0); expect(r[1] - r[0]).toBeCloseTo(MIN_DUR, 6)
  })
  it('with no predecessor the lag is the start: it never goes before hour 0, and the finish stays when the left edge moves', () => {
    expect(dragPatch('move', 'FS', false, 2, 3, -5)).toEqual({ lagH: 0, durationH: 3 })
    expect(dragPatch('left', 'FS', false, 2, 3, -5)).toEqual({ lagH: 0, durationH: 5 }) // start 2→0, finish stays at 5
    expect(dragPatch('right', 'FS', false, 2, 3, 1)).toEqual({ lagH: 2, durationH: 4 })
  })
})

describe('linking by dragging between bar handles', () => {
  it('maps the two edges to a relationship', () => {
    expect(relFromEdges('finish', 'start')).toBe('FS')
    expect(relFromEdges('start', 'start')).toBe('SS')
    expect(relFromEdges('finish', 'finish')).toBe('FF')
    expect(relFromEdges('start', 'finish')).toBe('SF')
  })
  it('the earlier activity is always the predecessor, whichever way you drag', () => {
    expect(linkFromHandles({ k: 2, edge: 'finish' }, { k: 5, edge: 'start' })).toEqual({ predK: 2, succK: 5, rel: 'FS' })
    expect(linkFromHandles({ k: 5, edge: 'start' }, { k: 2, edge: 'finish' })).toEqual({ predK: 2, succK: 5, rel: 'FS' }) // reversed drag
    expect(linkFromHandles({ k: 5, edge: 'finish' }, { k: 2, edge: 'finish' })).toEqual({ predK: 2, succK: 5, rel: 'FF' })
    expect(linkFromHandles({ k: 3, edge: 'start' }, { k: 3, edge: 'finish' })).toBeNull() // same activity
  })
})

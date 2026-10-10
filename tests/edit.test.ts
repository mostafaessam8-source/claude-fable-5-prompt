import { describe, expect, it } from 'vitest'
import { computeProject } from '../src/engine/schedule'
import {
  addActivity, hoursToInput, inputToHours, setPlannedFinish, setPlannedStart, candidatePredecessors, deleteActivities, deleteActivity, duplicateActivities, insertActivityAfter, moveActivities, candidateSuccessors, dateToInput, inputToDate, inputToTime, lagToKeepStart, patchActivity,
  successorsOf, timeToInput,
} from '../src/links/edit'
import { project as mk } from './helpers'

/** 1: 0–2   2: 2–4 (after 1)   3: 2–3 (after 1)   4: 4–6 (after 2) */
const base = () => mk([{ durationH: 2 }, { durationH: 2, pred: 1 }, { durationH: 1, pred: 1 }, { durationH: 2, pred: 2 }])
const planned = (p: ReturnType<typeof base>) => computeProject(p).locations[0].activities.map((a) => [a.plannedStartH, a.plannedFinishH])

describe('editing an activity moves the plan through its links', () => {
  it('a longer duration pushes its successors and does not touch the input project', () => {
    const p = base()
    const q = patchActivity(p, 0, 2, { durationH: 5 })
    expect(planned(q)).toEqual([[0, 2], [2, 7], [2, 3], [7, 9]])
    expect(planned(p)).toEqual([[0, 2], [2, 4], [2, 3], [4, 6]]) // untouched
  })
  it('re-pointing a link recomputes the start; lag and relationship apply', () => {
    const q = patchActivity(base(), 0, 4, { pred: 3, rel: 'FS', lagH: 1 })
    expect(planned(q)[3]).toEqual([4, 6]) // 3 finishes at 3, +1 h lag
    const ss = patchActivity(base(), 0, 4, { pred: 2, rel: 'SS', lagH: 1 })
    expect(planned(ss)[3]).toEqual([3, 5])
    const ff = patchActivity(base(), 0, 4, { pred: 2, rel: 'FF', lagH: 0 })
    expect(planned(ff)[3]).toEqual([2, 4]) // finishes with 2 (4 h), duration 2 → starts at 2
  })
})

describe('who can be linked', () => {
  const p = base()
  it('finds successors, and only earlier activities can be predecessors', () => {
    expect(successorsOf(p, 0, 1).map((a) => a.no)).toEqual([2, 3])
    expect(successorsOf(p, 0, 4)).toEqual([])
    expect(candidatePredecessors(p, 0, 3).map((a) => a.no)).toEqual([1, 2])
    expect(candidatePredecessors(p, 0, 1)).toEqual([])
  })
  it('only later activities that do not already follow it can become successors', () => {
    expect(candidateSuccessors(p, 0, 1).map((a) => a.no)).toEqual([4])
    expect(candidateSuccessors(p, 0, 2).map((a) => a.no)).toEqual([3])
  })
})

describe('keeping a date while re-linking', () => {
  it('lag that reproduces a start for each relationship', () => {
    const pred = { startH: 2, finishH: 6 }
    expect(lagToKeepStart(7, 'FS', pred, 2)).toBe(1)
    expect(lagToKeepStart(7, 'SS', pred, 2)).toBe(5)
    expect(lagToKeepStart(7, 'FF', pred, 2)).toBe(3)
    expect(lagToKeepStart(7, 'SF', pred, 2)).toBe(7)
    expect(lagToKeepStart(7, 'FS', null, 2)).toBe(7) // possession start: the lag is the start itself
  })
  it('re-linking with that lag leaves every planned date unchanged', () => {
    const p = base()
    const before = planned(p)
    const r = computeProject(p).locations[0].activities
    // activity 4 now follows activity 3 instead of 2, keeping its date
    const lag = lagToKeepStart(r[3].plannedStartH, 'FS', { startH: r[2].plannedStartH, finishH: r[2].plannedFinishH }, r[3].durationH)
    expect(planned(patchActivity(p, 0, 4, { pred: 3, rel: 'FS', lagH: lag }))).toEqual(before)
  })
})

describe('date and time inputs', () => {
  it('round-trip', () => {
    const d = new Date(Date.UTC(2026, 9, 16))
    expect(dateToInput(d)).toBe('2026-10-16')
    expect(inputToDate('2026-10-16')).toEqual(d)
    expect(inputToDate('')).toBeNull()
    expect(dateToInput(null)).toBe('')
    expect(timeToInput(14.5)).toBe('14:30')
    expect(timeToInput(null)).toBe('')
    expect(inputToTime('08:15')).toBe(8.25)
    expect(inputToTime('')).toBeNull()
  })
})

import { actualProblems, splitDateTime } from '../src/links/edit'
describe('actual date helpers', () => {
  it('splits a wall-clock time into the model date + hours', () => {
    expect(splitDateTime(new Date(Date.UTC(2026, 9, 16, 14, 30)))).toEqual({ date: new Date(Date.UTC(2026, 9, 16)), time: 14.5 })
    expect(splitDateTime(new Date(Date.UTC(2026, 9, 17, 0, 0)))).toEqual({ date: new Date(Date.UTC(2026, 9, 17)), time: 0 })
  })
  it('says in words what is wrong with the actual dates', () => {
    const ps = new Date(Date.UTC(2026, 9, 16))
    const d = (h: number) => new Date(ps.getTime() + h * 3_600_000)
    expect(actualProblems({ actualStartDate: ps, actualFinishDate: null }, d(2), null, ps)).toEqual([])
    expect(actualProblems({ actualStartDate: ps, actualFinishDate: null }, d(-3), null, ps)).toEqual(['The actual start is before the possession start.'])
    expect(actualProblems({ actualStartDate: ps, actualFinishDate: ps }, d(5), d(3), ps)).toEqual(['The actual finish is before the actual start.'])
    expect(actualProblems({ actualStartDate: null, actualFinishDate: ps }, null, d(3), ps)).toEqual(['There is an actual finish but no actual start.'])
  })
})

describe('adding and deleting activities', () => {
  it('a new activity follows the last one and lengthens the blocks when needed', () => {
    const p = base()
    const { project: q, no } = addActivity(p, 0, 'Extra', 3)
    expect(no).toBe(5)
    expect(q.activityRowsPerLocation).toBe(5)
    expect(planned(q)[4]).toEqual([6, 9]) // after activity 4 (finishes at 6)
    expect(p.locations[0].activities).toHaveLength(4) // input untouched
  })
  it('deleting unlinks its successors without moving any date', () => {
    const p = base()
    const before = computeProject(p).locations[0].activities
    const q = deleteActivity(p, 0, 2, (n) => before.find((a) => a.no === n)!.plannedStartH)
    expect(q.locations[0].activities.map((a) => a.no)).toEqual([1, 2, 3])
    const after = computeProject(q).locations[0].activities
    expect(after.map((a) => [a.no, a.plannedStartH, a.plannedFinishH])).toEqual([[1, 0, 2], [2, 2, 3], [3, 4, 6]])
    expect(q.locations[0].activities[2].pred).toBe(0) // old 4 followed the deleted 2; the others are renumbered
    expect(q.locations[0].activities[1].pred).toBe(1)
  })
})

describe('reordering, bulk delete, duplicate, insert', () => {
  const starts = (p: ReturnType<typeof base>) => { const r = computeProject(p).locations[0].activities; return (n: number) => r.find((a) => a.no === n)!.plannedStartH }
  const names = (p: ReturnType<typeof base>) => p.locations[0].activities.map((a) => a.name)
  const named = () => { const p = base(); p.locations[0].activities.forEach((a) => (a.name = `A${a.no}`)); return p }

  it('moving an activity renumbers and keeps links that stay valid; the others keep their dates', () => {
    const p = named()
    // move 3 (follows 1) to the front: 3,1,2,4 → 1 is now after nothing, 3 is first so its predecessor 1 comes after it → unlinked at its start
    const r = moveActivities(p, 0, [3], 1, starts(p))
    expect(names(r.project)).toEqual(['A3', 'A1', 'A2', 'A4'])
    expect(r.unlinked).toEqual([3])
    expect(planned(r.project).map((x) => x[0])).toEqual([2, 0, 2, 4]) // every start unchanged (in the new order)
  })
  it('moving a block of several keeps their order', () => {
    const p = named()
    const r = moveActivities(p, 0, [1, 2], null, starts(p))
    expect(names(r.project)).toEqual(['A3', 'A4', 'A1', 'A2'])
    expect(r.project.locations[0].activities.map((a) => a.pred)).toEqual([0, 0, 0, 3])
  })
  it('a harmless reorder unlinks nothing', () => {
    const p = named()
    const r = moveActivities(p, 0, [3], 2, starts(p)) // 1,3,2,4
    expect(r.unlinked).toEqual([])
    expect(planned(r.project)).toEqual([[0, 2], [2, 3], [2, 4], [4, 6]])
  })
  it('bulk delete', () => {
    const p = named()
    const r = deleteActivities(p, 0, [2, 3], starts(p))
    expect(names(r.project)).toEqual(['A1', 'A4'])
    expect(r.unlinked).toEqual([4])
    expect(planned(r.project)).toEqual([[0, 2], [4, 6]])
  })
  it('duplicate and insert', () => {
    const p = named()
    const d = duplicateActivities(p, 0, [2], starts(p))
    expect(names(d.project)).toEqual(['A1', 'A2', 'A2 (copy)', 'A3', 'A4'])
    expect(d.project.locations[0].activities.map((a) => a.pred)).toEqual([0, 1, 1, 1, 2]) // the copy runs parallel to the original
    expect(d.firstNew).toBe(3)
    const i = insertActivityAfter(p, 0, 1, starts(p))
    expect(i.no).toBe(2)
    expect(names(i.project)[1]).toBe('New activity')
    expect(planned(i.project)[1]).toEqual([2, 3]) // follows activity 1
  })
})

describe('typing the planned dates keeps the links', () => {
  const t0 = new Date(Date.UTC(2026, 9, 16, 0, 0))
  const predOf = (p: ReturnType<typeof base>, no: number) => {
    const a = p.locations[0].activities.find((x) => x.no === no)!
    const r = computeProject(p).locations[0].activities
    const pr = a.pred ? r.find((x) => x.no === a.pred)! : null
    return { a, pred: pr ? { startH: pr.plannedStartH, finishH: pr.plannedFinishH } : null, own: r.find((x) => x.no === no)! }
  }
  for (const rel of ['FS', 'SS', 'FF', 'SF'] as const) {
    it(`${rel}: a typed start lands exactly there, link and duration unchanged`, () => {
      const p = patchActivity(base(), 0, 4, { pred: 2, rel, lagH: 0 })
      const { a, pred, own } = predOf(p, 4)
      const q = setPlannedStart(p, 0, 4, 9, rel, pred, own.durationH)
      const after = computeProject(q).locations[0].activities[3]
      expect(after.plannedStartH).toBeCloseTo(9, 5)
      expect(after.plannedFinishH).toBeCloseTo(9 + own.durationH, 5)
      const na = q.locations[0].activities[3]
      expect([na.pred, na.rel, na.durationH]).toEqual([a.pred, rel, a.durationH])
    })
    it(`${rel}: a typed finish sets the duration, the start does not move`, () => {
      const p = patchActivity(base(), 0, 4, { pred: 2, rel, lagH: 0 })
      const { pred, own } = predOf(p, 4)
      const q = setPlannedFinish(p, 0, 4, own.plannedStartH, own.plannedStartH + 5, rel, pred)!
      const after = computeProject(q).locations[0].activities[3]
      expect(after.plannedStartH).toBeCloseTo(own.plannedStartH, 5)
      expect(after.plannedFinishH).toBeCloseTo(own.plannedStartH + 5, 5)
    })
  }
  it('no predecessor: the lag is the start; a finish before the start is refused', () => {
    const p = base()
    expect(computeProject(setPlannedStart(p, 0, 1, 3, 'FS', null, 2)).locations[0].activities[0].plannedStartH).toBe(3)
    expect(setPlannedFinish(p, 0, 1, 0, 0, 'FS', null)).toBeNull()
  })
  it('datetime-local conversions round-trip', () => {
    expect(hoursToInput(t0, 25.5)).toBe('2026-10-17T01:30')
    expect(inputToHours(t0, '2026-10-17T01:30')).toBe(25.5)
    expect(inputToHours(t0, '')).toBeNull()
  })
})

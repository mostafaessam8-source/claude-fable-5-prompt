import { describe, expect, it } from 'vitest'
import { computeProject } from '../src/engine/schedule'
import {
  candidatePredecessors, candidateSuccessors, dateToInput, inputToDate, inputToTime, lagToKeepStart, patchActivity,
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

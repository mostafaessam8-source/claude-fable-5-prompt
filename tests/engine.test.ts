import { describe, expect, it } from 'vitest'
import { computeProject } from '../src/engine/schedule'
import { act, actual, at, project } from './helpers'

const run = (acts: Parameters<typeof project>[0], s: Parameters<typeof project>[1] = {}) =>
  computeProject(project(acts, s)).locations[0]

/** actual start/finish fields from hours-since-start. */
const startAt = (h: number) => {
  const a = actual(h)
  return { actualStartDate: a.date, actualStartTime: a.time }
}
const finishAt = (h: number) => {
  const a = actual(h)
  return { actualFinishDate: a.date, actualFinishTime: a.time }
}

describe('planned dates (§4.1)', () => {
  it('FS / SS / FF / SF with lag, and pred 0 = possession start', () => {
    const l = run([
      { durationH: 4 },                              // 1: 0–4
      { durationH: 3, pred: 1, rel: 'FS', lagH: 2 }, // 2: 6–9
      { durationH: 3, pred: 1, rel: 'SS', lagH: 1 }, // 3: 1–4
      { durationH: 3, pred: 1, rel: 'FF', lagH: 0 }, // 4: finish 4 → 1–4
      { durationH: 3, pred: 1, rel: 'SF', lagH: 5 }, // 5: start 0+5-3=2 → 2–5
      { durationH: 2, lagH: 10 },                    // 6: 10–12
    ])
    const s = l.activities.map((a) => [a.plannedStartH, a.plannedFinishH])
    expect(s).toEqual([[0, 4], [6, 9], [1, 4], [1, 4], [2, 5], [10, 12]])
    expect(l.activities[1].plannedStart).toEqual(at(6))
  })
  it('predecessors use the activity number, so switched-off rows keep their numbers', () => {
    const p = project([{ durationH: 2 }, { durationH: 2, pred: 1 }])
    p.locations[0].activities[1].no = 3 // row 2 was switched off
    p.locations[0].activities.push(act({ no: 4, name: 'x', pred: 3, durationH: 1 }))
    const l = computeProject(p).locations[0]
    expect(l.activities[2].plannedStartH).toBe(l.activities[1].plannedFinishH)
  })
})

describe('validation (§4.2) and progress (§4.3)', () => {
  it('link pointing at itself or below is flagged and forced to 0 %', () => {
    const l = run([{ durationH: 2 }, { durationH: 2, pred: 2, pct: 0.8 }])
    expect(l.activities[1].linkBad).toBe(true)
    expect(l.activities[1].effectivePct).toBe(0)
    expect(l.activities[1].status).toBe('! CHECK LINK')
    expect(l.status).toBe('CHECK INPUT')
  })
  it.each([
    ['start before possession', { ...startAt(-5) }],
    ['finish before start', { ...startAt(5), ...finishAt(3) }],
    ['finish without start', { ...finishAt(3) }],
  ])('dateBad: %s', (_n, f) => {
    const l = run([{ durationH: 2, pct: 0.5, ...f }])
    expect(l.activities[0].dateBad).toBe(true)
    expect(l.activities[0].effectivePct).toBe(0)
    expect(l.activities[0].status).toBe('! CHECK DATES')
    expect(l.actualPct).toBe(0)
  })
  it('blank duration is flagged, not invented', () => {
    const l = run([{ durationH: null }])
    expect(l.activities[0].durationBad).toBe(true)
    expect(l.activities[0].status).toBe('! CHECK DURATION')
    expect(l.status).toBe('CHECK INPUT')
  })
  it('an actual finish means 100 %; blank time is 00:00; pct otherwise', () => {
    const l = run([
      { durationH: 2, ...startAt(0), ...finishAt(2) },
      { durationH: 2, pred: 1, ...startAt(2), pct: 0.4 },
    ])
    expect(l.activities[0].effectivePct).toBe(1)
    expect(l.activities[1].effectivePct).toBe(0.4)
    expect(l.actualPct).toBeCloseTo(0.7)
  })
  it('planned % is clamped by the cut-off and weighted by duration', () => {
    const l = run([{ durationH: 2 }, { durationH: 6, pred: 1 }], { cutoff: at(5) })
    expect(l.activities[0].planPct).toBe(1)
    expect(l.activities[1].planPct).toBeCloseTo(0.5)
    expect(l.planPct).toBeCloseTo((2 * 1 + 6 * 0.5) / 8)
    expect(run([{ durationH: 0 }]).activities[0].planPct).toBe(0)
  })
})

describe('forecast and variance (§4.4)', () => {
  it('finished: actual finish; started: cut-off + remaining; not started: max(cut-off, plan) + dur', () => {
    const l = run(
      [
        { durationH: 2, ...startAt(0), ...finishAt(3) },
        { durationH: 4, pred: 1, ...startAt(3), pct: 0.5 },
        { durationH: 2, pred: 2 },
      ],
      { cutoff: at(5) },
    )
    expect(l.activities[0].forecastFinishH).toBe(3)
    expect(l.activities[0].ownVariance).toBe(1)
    expect(l.activities[1].forecastFinishH).toBe(5 + 2) // max(5,3)+4*(1-0.5)
    expect(l.activities[2].forecastFinishH).toBe(6 + 2) // planned start 6 > cut-off 5
  })
})

describe('carried slip (§4.5)', () => {
  const base = [
    { durationH: 4, ...startAt(0), ...finishAt(5) }, // finishes 1 h late
    { durationH: 4, pred: 1, lagH: 2 },              // 2 h planned gap
  ]
  it('a 2 h planned gap absorbs a 1 h slip: total reads on time', () => {
    const l = run(base, { cutoff: at(5) })
    expect(l.activities[0].carried).toBe(1)
    expect(l.activities[1].ownVariance).toBe(0)
    expect(l.activities[1].carried).toBe(0)
    expect(l.variance).toBe(0)
    expect(l.activities[1].carriedForecastFinishH).toBe(l.activities[1].plannedFinishH)
  })
  it('a slip bigger than the gap is only partly absorbed', () => {
    const l = run(
      [{ durationH: 4, ...startAt(0), ...finishAt(8) }, { durationH: 4, pred: 1, lagH: 2 }],
      { cutoff: at(8) },
    )
    expect(l.activities[0].carried).toBe(4)
    expect(l.activities[1].carried).toBe(2)
  })
  it('finishing early leaves the gain intact downstream', () => {
    const l = run(
      [
        { durationH: 4, ...startAt(0), ...finishAt(3) },
        { durationH: 4, pred: 1, lagH: 2 },
        { durationH: 2, pred: 2 },
      ],
      { cutoff: at(3) },
    )
    expect(l.activities.map((a) => a.carried)).toEqual([-1, -1, -1])
    expect(l.variance).toBe(-1)
    expect(l.status).toBe('AHEAD')
  })
  it('a started activity reports its own position, not the carry', () => {
    const l = run(
      [
        { durationH: 4, ...startAt(0), ...finishAt(6) },       // +2
        { durationH: 4, pred: 1, ...startAt(4), pct: 0 },       // started on plan, own 0
      ],
      { cutoff: at(6) },
    )
    expect(l.activities[1].carried).toBe(l.activities[1].ownVariance)
  })
})

describe('carried slip follows the predecessor LINK, not the row order', () => {
  it('a delay reaches what depends on it and not an unrelated parallel branch', () => {
    const l = run(
      [
        { durationH: 4, ...startAt(0), pct: 0.5 },      // 1 started on time; at its planned finish (4 h) it is half done: 2 h late
        { durationH: 2, pred: 1 },                      // 2 follows 1
        { durationH: 2, pred: 0, lagH: 6.5 },           // 3 independent branch, starts at 6.5 h
        { durationH: 1, pred: 2 },                      // 4 follows 2
      ],
      { cutoff: at(4) },
    )
    const c = l.activities.map((a) => a.carried)
    expect(c[0]).toBe(2)   // own position: 2 h behind
    expect(c[1]).toBe(2)   // follows 1, no gap
    expect(c[2]).toBe(0)   // NOT delayed by row 2 above it (a row-order carry would give 1.5)
    expect(c[3]).toBe(2)   // follows 2
  })

  it('the location forecast is its latest forecast activity, not the last row', () => {
    const l = run(
      [
        { durationH: 4, ...startAt(0), pct: 0.5 },      // 1: planned 0–4, 2 h late at the cut-off
        { durationH: 2, pred: 1 },                      // 2: planned 4–6, forecast 8
        { durationH: 2, pred: 0, lagH: 6.5 },           // 3: planned 6.5–8.5, unaffected → last row, ends 8.5
        { durationH: 1, pred: 2 },                      // 4: planned 6–7, forecast 9
      ],
      { cutoff: at(4) },
    )
    expect(l.plannedFinishH).toBe(8.5)
    expect(l.forecastFinishH).toBe(9)  // activity 4 at 7 + 2, later than the last row's 8.5
    expect(l.variance).toBe(0.5)       // the location ends 0.5 h after its planned 8.5
    expect(l.bufferToHandback).toBe(39)
  })

  it('a start-to-start link measures its gap start to start', () => {
    const l = run(
      [
        { durationH: 4, ...startAt(2) },                          // 1 planned 0–4, actually started at 2 (2 h late)
        { durationH: 2, pred: 1, rel: 'SS', lagH: 3 },            // 2 planned start 3: a 3 h gap start→start
      ],
      { cutoff: at(2) },
    )
    expect(l.activities[0].carried).toBe(2)
    expect(l.activities[1].carried).toBe(0) // the 3 h start-to-start gap absorbs the 2 h slip (FS maths would not)
  })

  it('a gain flows through the link', () => {
    const l = run(
      [
        { durationH: 4, ...startAt(0), ...finishAt(3) },  // finished 1 h early
        { durationH: 2, pred: 1 },
        { durationH: 2, pred: 0, lagH: 10 },
      ],
      { cutoff: at(3) },
    )
    expect(l.activities.map((a) => a.carried)).toEqual([-1, -1, 0])
  })
})

describe('activity status strings (§4.7)', () => {
  const st = (acts: Parameters<typeof project>[0], cutoff: number) =>
    run(acts, { cutoff: at(cutoff) }).activities[0].status
  it('Completed - Ahead', () => expect(st([{ durationH: 4, ...startAt(0), ...finishAt(3) }], 5)).toBe('Completed - Ahead'))
  it('Completed - On Time (within a minute)', () => {
    expect(st([{ durationH: 4, ...startAt(0), ...finishAt(4) }], 5)).toBe('Completed - On Time')
    const f = actual(4 + 1 / 60)
    expect(st([{ durationH: 4, ...startAt(0), actualFinishDate: f.date, actualFinishTime: f.time }], 5)).toBe('Completed - On Time')
  })
  it('Completed - Delayed', () => expect(st([{ durationH: 4, ...startAt(0), ...finishAt(6) }], 7)).toBe('Completed - Delayed'))
  it('Completed (100 % typed, no actual finish — as the workbook)', () =>
    expect(st([{ durationH: 4, ...startAt(0), pct: 1 }], 2)).toBe('Completed'))
  it('In Progress - On Track', () => expect(st([{ durationH: 4, ...startAt(0), pct: 0.5 }], 2)).toBe('In Progress - On Track'))
  it('In Progress - BEHIND', () => expect(st([{ durationH: 4, ...startAt(0), pct: 0.1 }], 6)).toBe('In Progress - BEHIND'))
  it('Not Started (cut-off before the planned start) — plain, not LATE', () => {
    const s = st([{ durationH: 4, lagH: 10 }], 2)
    expect(s).toBe('Not Started')
    expect(s).not.toBe('NOT STARTED - LATE')
  })
  it('NOT STARTED - LATE', () => expect(st([{ durationH: 4 }], 3)).toBe('NOT STARTED - LATE'))
})

describe('location totals and status (§4.6, §4.7)', () => {
  it('ON TIME with a comfortable buffer', () => {
    const l = run([{ durationH: 10 }], { cutoff: at(0) })
    expect(l.bufferToHandback).toBe(38)
    expect(l.status).toBe('ON TIME')
  })
  it('BEHIND when the carried variance is positive', () => {
    const l = run([{ durationH: 4, ...startAt(0), ...finishAt(6) }], { cutoff: at(6) })
    expect(l.variance).toBe(2)
    expect(l.forecastFinishH).toBe(6)
    expect(l.status).toBe('BEHIND')
  })
  it('TIGHT when the buffer is under 2 h', () => {
    expect(run([{ durationH: 47 }], { cutoff: at(0) }).status).toBe('TIGHT')
  })
  it('AT RISK when the baseline already overruns the hand-back, with zero progress', () => {
    const l = run([{ durationH: 30 }, { durationH: 30, pred: 1 }], { cutoff: at(0) })
    expect(l.variance).toBe(0)
    expect(l.bufferToHandback).toBe(-12)
    expect(l.status).toBe('AT RISK')
  })
  it('buffer is checked before variance', () => {
    const l = run([{ durationH: 40, ...startAt(0), ...finishAt(50) }], { cutoff: at(50) })
    expect(l.variance).toBeGreaterThan(0.1)
    expect(l.status).toBe('AT RISK')
  })
  it('possession in days: end = start + 2 days', () => {
    // buffer counts from possessionEnd, supplied already derived by the importer
    const l = run([{ durationH: 10 }], { duration: 2, unit: 'days', possessionEnd: at(48) })
    expect(l.bufferToHandback).toBe(38)
  })
})

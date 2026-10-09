import { describe, expect, it } from 'vitest'
import { computeProject } from '../src/engine/schedule'
import type { ActivityStatus } from '../src/engine/schedule'
import { parseLayout } from '../src/layout/parse'
import { activityTone, C } from '../src/report/brand'
import { fmtLong, fmtShort, fmtVariance } from '../src/report/format'
import { colsFor, ganttGeometry, ganttRow } from '../src/report/gantt'
import { totalAllLocations } from '../src/report/summary'
import { actual, at, project } from './helpers'

describe('status colours', () => {
  it('plain "Not Started" is not red; only "NOT STARTED - LATE" is', () => {
    expect(activityTone('Not Started').bg).not.toBe(C.red)
    expect(activityTone('NOT STARTED - LATE').bg).toBe(C.red)
    const all: ActivityStatus[] = ['Completed', 'Completed - Ahead', 'Completed - On Time', 'Completed - Delayed',
      'In Progress - On Track', 'In Progress - BEHIND', 'Not Started', 'NOT STARTED - LATE',
      '! CHECK LINK', '! CHECK DATES', '! CHECK DURATION']
    const red = all.filter((s) => activityTone(s).bg === C.red)
    expect(red).toEqual(['Completed - Delayed', 'NOT STARTED - LATE'])
  })
})

describe('formatting', () => {
  it('uses floating wall-clock time', () => {
    const d = new Date('2026-10-16T07:30:00Z')
    expect(fmtShort(d)).toBe('Fri 16-Oct 07:30')
    expect(fmtLong(d)).toBe('Friday 16-Oct-2026 07:30 AM')
    expect(fmtLong(new Date('2026-10-16T00:05:00Z'))).toBe('Friday 16-Oct-2026 12:05 AM')
  })
  it('variance wording', () => {
    expect(fmtVariance(620.4)).toBe('+620.4 h behind')
    expect(fmtVariance(-1)).toBe('-1.0 h ahead')
    expect(fmtVariance(0)).toBe('on time')
  })
})

describe('layout parsing', () => {
  it('splits name and scope', () => {
    expect(parseLayout('C263  –  KM 209+025', '1 cell  │  Main Line 1 & Main Line 3  │  TSO OTMP from Station 29')).toEqual({
      code: 'C263', chainage: 'KM 209+025', cells: 1, lines: 'Main Line 1 & Main Line 3', otmp: 'TSO', station: 'Station 29',
    })
    const p = parseLayout('C288  –  KM 337+391', '3 cells  │  Main Line 1 & Main Line 3  │  SABATCO OTMP from Station 35')
    expect(p).toMatchObject({ cells: 3, otmp: 'SABATCO', station: 'Station 35' })
  })
  it('leaves what it cannot find empty', () => {
    expect(parseLayout('X1', '')).toEqual({ code: 'X1', chainage: '', cells: null, lines: '', otmp: '', station: '' })
  })
})

describe('gantt geometry (§6.4)', () => {
  const run = (acts: Parameters<typeof project>[0], s = {}) => {
    const p = project(acts, s)
    return { r: computeProject(p), g: ganttGeometry(p.settings) }
  }
  it('a bar paints a column when start < colEnd && end > colStart', () => {
    const { g } = run([{ durationH: 1 }])
    expect(g.hoursPerColumn).toBe(1)
    expect(colsFor(0, 1, g)).toEqual({ c0: 0, c1: 0 })     // exactly one column
    expect(colsFor(0.5, 1.5, g)).toEqual({ c0: 0, c1: 1 })
    expect(colsFor(1, 1, g)).toBeNull()                    // zero length
    expect(colsFor(47.5, 60, g)).toEqual({ c0: 47, c1: 47 })
    expect(colsFor(48, 60, g)).toBeNull()                  // beyond the view
  })
  it('hours per column follows the span: 96 h / 48 = 2 h', () => {
    const { g } = run([{ durationH: 1 }], { ganttSpan: 4, ganttSpanUnit: 'days' })
    expect(g.hoursPerColumn).toBe(2)
  })
  it('planned bar only for an untouched on-plan activity', () => {
    const { r, g } = run([{ durationH: 3 }], { cutoff: at(0) })
    const row = ganttRow(r.locations[0].activities[0], g)
    expect(row.planned).toEqual({ kind: 'planned', c0: 0, c1: 2 })
    expect(row.actual).toBeNull()
    expect(row.forecast).toBeNull()
  })
  it('actual bar stops at the cut-off, with the forecast tail after it', () => {
    const s = actual(0)
    const { r, g } = run([{ durationH: 10, actualStartDate: s.date, actualStartTime: s.time, pct: 0.2 }], { cutoff: at(6) })
    const a = r.locations[0].activities[0]
    const row = ganttRow(a, g)
    // started 0, 20 % of 10 h = 2 h, cut-off 6 → ends at the cut-off (col 5 inclusive)
    expect(row.actual).toMatchObject({ c0: 0, c1: 5 })
    // forecast = 6 + 8 = 14 vs planned 10 → carried +4 → amber (behind)
    expect(row.actual!.kind).toBe('behind')
    expect(row.forecast).toEqual({ kind: 'forecast', c0: 6, c1: 13 })
  })
  it('a just-started activity still gets a visible 30-minute bar', () => {
    const s = actual(5)
    const { r, g } = run([{ lagH: 5, durationH: 10, actualStartDate: s.date, actualStartTime: s.time }], { cutoff: at(5) })
    expect(ganttRow(r.locations[0].activities[0], g).actual).toMatchObject({ c0: 5, c1: 5 })
  })
  it('finished late is red, finished on time is teal', () => {
    const s = actual(0)
    const f = (h: number) => actual(h)
    const late = run([{ durationH: 2, actualStartDate: s.date, actualStartTime: 0, actualFinishDate: f(4).date, actualFinishTime: f(4).time }], { cutoff: at(5) })
    expect(ganttRow(late.r.locations[0].activities[0], late.g).actual!.kind).toBe('done-late')
    const ok = run([{ durationH: 2, actualStartDate: s.date, actualStartTime: 0, actualFinishDate: f(2).date, actualFinishTime: f(2).time }], { cutoff: at(5) })
    expect(ganttRow(ok.r.locations[0].activities[0], ok.g).actual!.kind).toBe('done-ontime')
  })
  it('a not-started late activity forecasts from the cut-off', () => {
    const { r, g } = run([{ durationH: 2 }], { cutoff: at(10) })
    const row = ganttRow(r.locations[0].activities[0], g)
    expect(row.forecast).toEqual({ kind: 'forecast', c0: 10, c1: 11 })
  })
})

describe('ALL LOCATIONS total', () => {
  it('weights progress by hours; worst-case variance and buffer', () => {
    const a = computeProject(project([{ durationH: 10 }], { cutoff: at(0) })).locations[0]
    const b = computeProject(project([{ durationH: 30 }], { cutoff: at(0) })).locations[0]
    const t = totalAllLocations([a, b])
    expect(t.totalHours).toBe(40)
    expect(t.plannedFinishH).toBe(30)
    expect(t.bufferToHandback).toBe(18)
    expect(t.status).toBe('ON TIME')
  })
  it('AT RISK if any location overruns the hand-back', () => {
    const a = computeProject(project([{ durationH: 10 }], { cutoff: at(0) })).locations[0]
    const b = computeProject(project([{ durationH: 60 }], { cutoff: at(0) })).locations[0]
    expect(totalAllLocations([a, b]).status).toBe('AT RISK')
  })
})

import { applySettings } from '../src/model/settings'
describe('settings edit', () => {
  it('moving the start moves the derived end, the gantt view and a defaulted cut-off', () => {
    const p = { ...project([{ durationH: 1 }]) }
    p.settings.cutoffDefaulted = true
    const q = applySettings(p, { possessionStart: at(24), duration: 2, unit: 'days' })
    expect(q.settings.possessionEnd).toEqual(at(24 + 48))
    expect(q.settings.ganttStart).toEqual(at(24))
    expect(q.settings.cutoff).toEqual(at(24))
    const r = applySettings(q, { cutoff: at(30) })
    expect(r.settings.cutoff).toEqual(at(30))
    expect(r.settings.cutoffDefaulted).toBe(false)
  })
})

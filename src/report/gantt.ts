/** Bar geometry for the 48-column Gantt (brief §6.4). Pure. */
import type { ActivityResult } from '../engine/schedule'
import { toHours } from '../engine/schedule'
import type { Settings } from '../model/types'

export const GANTT_COLS = 48
export type BarKind = 'planned' | 'done-ontime' | 'done-late' | 'progress' | 'behind' | 'forecast'

/** Inclusive column range. */
export interface Bar { kind: BarKind; c0: number; c1: number }
export interface GanttRow {
  planned: Bar | null; actual: Bar | null; forecast: Bar | null
  /** Where the actual bar ends, in hours since the possession start (its finish, or the cut-off-based end of work in progress). */
  actualEndH: number | null
}

export interface GanttGeometry {
  /** Hours since possession start. */
  viewStartH: number
  hoursPerColumn: number
  cutoffH: number
  origin: Date
}

export function ganttGeometry(s: Settings): GanttGeometry {
  const spanH = s.ganttSpan * (s.ganttSpanUnit === 'days' ? 24 : 1)
  return {
    viewStartH: toHours(s.ganttStart, s.possessionStart),
    hoursPerColumn: spanH / GANTT_COLS,
    cutoffH: toHours(s.cutoff, s.possessionStart),
    origin: s.possessionStart,
  }
}

/** A bar paints column i when barStart < columnEnd && barEnd > columnStart. */
export function colsFor(startH: number, endH: number, g: GanttGeometry): { c0: number; c1: number } | null {
  let c0 = -1
  let c1 = -1
  for (let i = 0; i < GANTT_COLS; i++) {
    const cs = g.viewStartH + i * g.hoursPerColumn
    const ce = cs + g.hoursPerColumn
    if (startH < ce && endH > cs) {
      if (c0 < 0) c0 = i
      c1 = i
    }
  }
  return c0 < 0 ? null : { c0, c1 }
}

const MIN_ACTUAL_H = 0.5

export function ganttRow(a: ActivityResult, g: GanttGeometry): GanttRow {
  const planned = colsFor(a.plannedStartH, a.plannedFinishH, g)

  let actual: Bar | null = null
  let actualEndH: number | null = null
  if (a.actualStart && !a.dateBad) {
    const sH = toHours(a.actualStart, g.origin)
    const finished = a.actualFinish != null
    let eH = a.actualFinish
      ? toHours(a.actualFinish, g.origin)
      : Math.max(g.cutoffH, sH + a.durationH * a.effectivePct)
    eH = Math.max(eH, sH + MIN_ACTUAL_H)
    actualEndH = eH
    const kind: BarKind = finished || a.effectivePct >= 1
      ? a.status === 'Completed - Delayed' ? 'done-late' : 'done-ontime'
      : a.carried <= 0.1 ? 'progress' : 'behind'
    const c = colsFor(sH, eH, g)
    if (c) actual = { kind, ...c }
  }

  // Forecast tail: never before the cut-off; skipped for finished work, and for work that has
  // not started and is on plan (it would only repeat the planned bar).
  let forecast: Bar | null = null
  if (a.effectivePct < 1 && !a.dateBad && (a.started || Math.abs(a.carried) > 0.1)) {
    const endH = a.carriedForecastFinishH
    const startH = Math.max(g.cutoffH, actualEndH ?? endH - a.durationH)
    if (endH > startH) {
      const c = colsFor(startH, endH, g)
      if (c) forecast = { kind: 'forecast', ...c }
    }
  }

  return { planned: planned && { kind: 'planned', ...planned }, actual, forecast, actualEndH }
}

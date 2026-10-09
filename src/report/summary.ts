import { computeLocationStatus, type LocationResult, type LocationStatus } from '../engine/schedule'

export interface TotalResult {
  totalHours: number
  planPct: number
  actualPct: number
  /** Worst (largest) carried variance of any location. */
  variance: number
  plannedFinishH: number
  forecastFinishH: number
  /** Smallest buffer of any location. */
  bufferToHandback: number
  status: LocationStatus
}

/**
 * The cover's ALL LOCATIONS row. The brief does not define it; the possession can only be
 * handed back when every location is done, so the finish-side figures are the worst case:
 * progress is duration-weighted, variance/finish are the max, buffer the min, and the status
 * applies the usual location rules to those.
 */
export function totalAllLocations(locs: LocationResult[]): TotalResult {
  const totalHours = locs.reduce((n, l) => n + l.totalHours, 0)
  const w = (f: (l: LocationResult) => number) =>
    totalHours === 0 ? 0 : locs.reduce((n, l) => n + l.totalHours * f(l), 0) / totalHours
  const variance = locs.length ? Math.max(...locs.map((l) => l.variance)) : 0
  const bufferToHandback = locs.length ? Math.min(...locs.map((l) => l.bufferToHandback)) : 0
  return {
    totalHours,
    planPct: w((l) => l.planPct),
    actualPct: w((l) => l.actualPct),
    variance,
    plannedFinishH: locs.length ? Math.max(...locs.map((l) => l.plannedFinishH)) : 0,
    forecastFinishH: locs.length ? Math.max(...locs.map((l) => l.forecastFinishH)) : 0,
    bufferToHandback,
    status: computeLocationStatus(
      locs.flatMap((l) => l.activities),
      variance,
      bufferToHandback,
    ),
  }
}

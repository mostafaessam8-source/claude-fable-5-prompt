/**
 * Schedule maths (brief §4). Pure functions, no React.
 *
 * Internally everything is "hours since possession start" (h = 0 at the start of the
 * possession). Dates only appear at the edges, via `fromHours`.
 */
import type { LocationInput, Project, Settings } from '../model/types'

const HOUR_MS = 3_600_000
const MINUTE_H = 1 / 60

export type ActivityStatus =
  | '! CHECK LINK'
  | '! CHECK DATES'
  | '! CHECK DURATION'
  | 'Completed'
  | 'Completed - Ahead'
  | 'Completed - On Time'
  | 'Completed - Delayed'
  | 'In Progress - On Track'
  | 'In Progress - BEHIND'
  | 'Not Started'
  | 'NOT STARTED - LATE'

export type LocationStatus = 'CHECK INPUT' | 'AT RISK' | 'BEHIND' | 'TIGHT' | 'AHEAD' | 'ON TIME'

export interface ActivityResult {
  no: number
  name: string
  durationH: number
  /** Hours since possession start. */
  plannedStartH: number
  plannedFinishH: number
  plannedStart: Date
  plannedFinish: Date
  linkBad: boolean
  dateBad: boolean
  /** Duration blank in the source: flagged, never invented (§10). */
  durationBad: boolean
  actualStart: Date | null
  actualFinish: Date | null
  /** Has an actual start date (even if the row is flagged). */
  started: boolean
  effectivePct: number
  planPct: number
  forecastFinishH: number
  forecastFinish: Date
  /** The activity's own slip. Not what the report shows (see `carried`). */
  ownVariance: number
  /** Slip after absorption by planned gaps — the report's "Time Variance". */
  carried: number
  carriedForecastFinishH: number
  carriedForecastFinish: Date
  status: ActivityStatus
}

export interface LocationResult {
  name: string
  scope: string
  activities: ActivityResult[]
  totalHours: number
  planPct: number
  actualPct: number
  variance: number
  plannedFinishH: number
  plannedFinish: Date
  forecastFinishH: number
  forecastFinish: Date
  /** Hours between the forecast finish and the hand-back (negative = overrun). */
  bufferToHandback: number
  status: LocationStatus
}

export interface ProjectResult {
  settings: Settings
  /** Cut-off in hours since possession start. */
  cutoffH: number
  possessionEndH: number
  locations: LocationResult[]
}

export const toHours = (d: Date, origin: Date) => (d.getTime() - origin.getTime()) / HOUR_MS
export const fromHours = (h: number, origin: Date) => new Date(origin.getTime() + Math.round(h * HOUR_MS))

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
const round1 = (x: number) => Math.round(x * 10) / 10
/** Strip floating-point dust from hour arithmetic before threshold tests. */
const round3 = (x: number) => Math.round(x * 1000) / 1000

/** actualDate + actualTime (blank time = 00:00); null when the date is blank. */
function actualDateTime(date: Date | null, timeH: number | null): Date | null {
  if (!date) return null
  return new Date(date.getTime() + (timeH ?? 0) * HOUR_MS)
}

export function computeActivityStatus(a: {
  linkBad: boolean
  dateBad: boolean
  durationBad: boolean
  started: boolean
  effectivePct: number
  hasActualFinish: boolean
  finishH: number
  plannedFinishH: number
  plannedStartH: number
  carried: number
  cutoffH: number
}): ActivityStatus {
  if (a.linkBad) return '! CHECK LINK'
  if (a.dateBad) return '! CHECK DATES'
  if (a.durationBad) return '! CHECK DURATION'
  if (a.effectivePct >= 1) {
    // 100 % typed in without an actual finish: the workbook just says "Completed".
    if (!a.hasActualFinish) return 'Completed'
    if (a.finishH < a.plannedFinishH) return 'Completed - Ahead'
    if (a.finishH <= a.plannedFinishH + MINUTE_H) return 'Completed - On Time'
    return 'Completed - Delayed'
  }
  if (a.started) return a.carried <= 0.1 ? 'In Progress - On Track' : 'In Progress - BEHIND'
  return a.cutoffH < a.plannedStartH ? 'Not Started' : 'NOT STARTED - LATE'
}

export function computeLocationStatus(
  activities: Pick<ActivityResult, 'status'>[],
  variance: number,
  buffer: number,
): LocationStatus {
  if (activities.some((a) => a.status.startsWith('!'))) return 'CHECK INPUT'
  // Buffer before variance: a baseline that already overruns the hand-back is AT RISK.
  if (buffer < 0) return 'AT RISK'
  if (variance > 0.1) return 'BEHIND'
  if (buffer < 2) return 'TIGHT'
  if (variance < -0.1) return 'AHEAD'
  return 'ON TIME'
}

export function computeLocation(settings: Settings, loc: LocationInput): LocationResult {
  const origin = settings.possessionStart
  const cutoffH = toHours(settings.cutoff, origin)
  const endH = toHours(settings.possessionEnd, origin)

  const out: ActivityResult[] = []
  const byNo = new Map<number, ActivityResult>()

  // Pass 1 — planned dates, flags, progress, forecast, own variance (§4.1–4.4).
  for (const a of loc.activities) {
    const durationBad = a.durationH == null
    const dur = a.durationH ?? 0
    const pred = a.pred > 0 ? byNo.get(a.pred) : undefined
    // A predecessor at or below this row, or one that does not exist / is switched off.
    const linkBad = a.pred > 0 && (a.pred >= a.no || !pred)

    let start: number
    if (a.pred === 0 || !pred) start = a.lagH
    else {
      switch (a.rel) {
        case 'SS': start = pred.plannedStartH + a.lagH; break
        case 'FF': start = pred.plannedFinishH + a.lagH - dur; break
        case 'SF': start = pred.plannedStartH + a.lagH - dur; break
        default: start = pred.plannedFinishH + a.lagH // FS
      }
    }
    const finish = start + dur

    const actualStart = actualDateTime(a.actualStartDate, a.actualStartTime)
    const actualFinish = actualDateTime(a.actualFinishDate, a.actualFinishTime)
    const asH = actualStart && toHours(actualStart, origin)
    const afH = actualFinish && toHours(actualFinish, origin)

    const dateBad =
      (asH != null && asH < 0) ||
      (asH != null && afH != null && afH < asH) ||
      (afH != null && asH == null)

    const flagged = linkBad || dateBad || durationBad
    const effectivePct = flagged
      ? 0
      : actualFinish
        ? 1
        : clamp(a.pct ?? 0, 0, 1)
    // Like the workbook, a flagged row with an actual start still counts as started for
    // the forecast and the carry; its status reads "! CHECK ..." regardless.
    const started = asH != null
    const planPct = dur === 0 ? 0 : clamp((cutoffH - start) / dur, 0, 1)

    let forecastH: number
    if (effectivePct === 1) forecastH = afH ?? finish
    else if (started) forecastH = Math.max(cutoffH, asH!) + dur * (1 - effectivePct)
    else forecastH = Math.max(cutoffH, start) + dur
    const ownVariance = round1(forecastH - finish)

    const r: ActivityResult = {
      no: a.no,
      name: a.name,
      durationH: dur,
      plannedStartH: start,
      plannedFinishH: finish,
      plannedStart: fromHours(start, origin),
      plannedFinish: fromHours(finish, origin),
      linkBad,
      dateBad,
      durationBad,
      actualStart,
      actualFinish,
      started,
      effectivePct,
      planPct,
      forecastFinishH: forecastH,
      forecastFinish: fromHours(forecastH, origin),
      ownVariance,
      carried: 0,
      carriedForecastFinishH: finish,
      carriedForecastFinish: fromHours(finish, origin),
      status: 'Not Started',
    }
    out.push(r)
    byNo.set(a.no, r)
  }

  // Pass 2 — carried slip (§4.5) and statuses.
  out.forEach((r, k) => {
    if (k === 0) {
      r.carried = r.ownVariance
    } else if (r.started) {
      r.carried = r.ownVariance
    } else {
      const prev = out[k - 1]
      const gap = Math.max(0, r.plannedStartH - prev.plannedFinishH)
      // A gain is not absorbed. A gap can cancel a slip but never turn it into a gain
      // (the brief's §4.5 formula would give -1 for a 1 h slip over a 2 h gap; §9 wants 0).
      const absorbed = prev.carried > 0 ? Math.max(0, prev.carried - gap) : prev.carried
      r.carried = round3(r.ownVariance > 0 ? Math.max(r.ownVariance, absorbed) : absorbed)
    }
    r.carriedForecastFinishH = r.plannedFinishH + r.carried
    r.carriedForecastFinish = fromHours(r.carriedForecastFinishH, origin)
    r.status = computeActivityStatus({
      linkBad: r.linkBad,
      dateBad: r.dateBad,
      durationBad: r.durationBad,
      started: r.started,
      effectivePct: r.effectivePct,
      hasActualFinish: r.actualFinish != null,
      finishH: r.forecastFinishH,
      plannedFinishH: r.plannedFinishH,
      plannedStartH: r.plannedStartH,
      carried: r.carried,
      cutoffH,
    })
  })

  // Location totals (§4.6).
  const totalHours = out.reduce((n, r) => n + r.durationH, 0)
  const weighted = (f: (r: ActivityResult) => number) =>
    totalHours === 0 ? 0 : out.reduce((n, r) => n + r.durationH * f(r), 0) / totalHours
  const variance = out.length ? out[out.length - 1].carried : 0
  const plannedFinishH = out.length ? Math.max(...out.map((r) => r.plannedFinishH)) : 0
  const forecastFinishH = plannedFinishH + variance
  const bufferToHandback = round3(endH - forecastFinishH)

  return {
    name: loc.name,
    scope: loc.scope,
    activities: out,
    totalHours,
    planPct: weighted((r) => r.planPct),
    actualPct: weighted((r) => r.effectivePct),
    variance,
    plannedFinishH,
    plannedFinish: fromHours(plannedFinishH, origin),
    forecastFinishH,
    forecastFinish: fromHours(forecastFinishH, origin),
    bufferToHandback,
    status: computeLocationStatus(out, variance, bufferToHandback),
  }
}

export function computeProject(project: Project): ProjectResult {
  const { settings } = project
  return {
    settings,
    cutoffH: toHours(settings.cutoff, settings.possessionStart),
    possessionEndH: toHours(settings.possessionEnd, settings.possessionStart),
    locations: project.locations.map((l) => computeLocation(settings, l)),
  }
}


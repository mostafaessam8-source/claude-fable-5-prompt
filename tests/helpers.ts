import type { ActivityInput, LocationInput, Project, Settings } from '../src/model/types'

export const PS = new Date('2026-10-16T00:00:00Z')
const H = 3_600_000
export const at = (h: number) => new Date(PS.getTime() + h * H)

export function settings(over: Partial<Settings> = {}): Settings {
  const s: Settings = {
    projectName: 'T', reportTitle: 'T', subtitle: '', preparedBy: '',
    cutoff: PS, cutoffDefaulted: false,
    possessionStart: PS, duration: 48, unit: 'hours', possessionEnd: at(48),
    ganttStart: PS, ganttSpan: 48, ganttSpanUnit: 'hours',
    ...over,
  }
  return s
}

/** Activity with defaults; `no` is assigned by `project`. */
export function act(over: Partial<ActivityInput> = {}): ActivityInput {
  return {
    no: 0, sourceRow: 0, name: 'A', durationH: 1, pred: 0, rel: 'FS', lagH: 0,
    actualStartDate: null, actualStartTime: null, actualFinishDate: null, actualFinishTime: null,
    pct: null, remarks: '', ...over,
  }
}

/** Absolute actual date/time helpers: hours since possession start -> date + time-of-day. */
export function actual(h: number) {
  const d = at(h)
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  return { date: day, time: (d.getTime() - day.getTime()) / H }
}

export function project(acts: Partial<ActivityInput>[], s: Partial<Settings> = {}): Project {
  const loc: LocationInput = {
    name: 'L', scope: '',
    activities: acts.map((a, i) => act({ ...a, no: i + 1, sourceRow: 10 + i, name: a.name ?? `A${i + 1}` })),
  }
  return { settings: settings(s), locationCount: 1, activityRowsPerLocation: acts.length, locations: [loc], warnings: [] }
}

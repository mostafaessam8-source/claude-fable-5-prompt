/**
 * Shared model. All datetimes are "floating" wall-clock times held in a UTC Date
 * (Excel has no time zone), so always read them with the getUTC* accessors.
 */
export type Rel = 'FS' | 'SS' | 'FF' | 'SF'
export type HoursOrDays = 'hours' | 'days'

export interface Settings {
  projectName: string
  reportTitle: string
  subtitle: string
  preparedBy: string
  /** Data date. Falls back to possessionStart when M5 has no usable value. */
  cutoff: Date
  cutoffDefaulted: boolean
  possessionStart: Date
  duration: number
  unit: HoursOrDays
  /** Derived: possessionStart + duration. */
  possessionEnd: Date
  ganttStart: Date
  ganttSpan: number
  ganttSpanUnit: HoursOrDays
}

/** Input columns of one activity row (§3.3). Calculated columns are not imported. */
export interface ActivityInput {
  /** 1-based position inside the location block; predecessors refer to this. */
  no: number
  /** Source worksheet row, for error messages. */
  sourceRow: number
  name: string
  durationH: number | null
  pred: number
  rel: Rel
  lagH: number
  actualStartDate: Date | null
  /** Hours since midnight, or null when blank. */
  actualStartTime: number | null
  actualFinishDate: Date | null
  actualFinishTime: number | null
  /** 0–1, or null when blank. */
  pct: number | null
  remarks: string
}

export interface LocationInput {
  name: string
  scope: string
  activities: ActivityInput[]
}

export interface Project {
  settings: Settings
  locationCount: number
  activityRowsPerLocation: number
  locations: LocationInput[]
  /** Non-fatal things worth showing the user (§10). */
  warnings: string[]
}

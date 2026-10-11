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
  /** true: the data date is "now" (Excel's NOW()), refreshed while the app is open; false/absent: the stored `cutoff` date. */
  cutoffNow?: boolean
  /** Widths (px) of the report table's columns, when the user has dragged them. */
  tableCols?: number[]
  /** Widths (px) of the Activities tab's columns, when the user has dragged them. */
  activityCols?: number[]
  /** Widths (px) of the first 8 columns of the cover's summary table (the progress column takes the rest). */
  /** true: the Planned / Forecast columns of the report show start and finish (stacked in one cell), not only the finish. */
  dateRange?: boolean
  summaryCols?: number[]
  /** Heights (px) of the summary table's rows (header, each location, total); null = automatic. */
  summaryRows?: (number | null)[]
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
/** A further relationship of an activity (the first one is `pred` / `rel` / `lagH`): the activity starts when the LAST of them allows it. */
export interface ExtraLink { pred: number; rel: Rel; lagH: number }

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
  /** More predecessors besides the first (when an activity is linked to several). */
  more?: ExtraLink[]
  actualStartDate: Date | null
  /** Hours since midnight, or null when blank. */
  actualStartTime: number | null
  actualFinishDate: Date | null
  actualFinishTime: number | null
  /** 0–1, or null when blank. */
  pct: number | null
  remarks: string
  /** Height (px) of this activity's row on the report page, when dragged; absent = automatic. */
  rowH?: number
  /** Height (px) of this activity's row in the Activities tab, when dragged. */
  edH?: number
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
  /** Which kind of workbook this came from; a CRP2 sheet has no predecessor links, so Claude reviews them. */
  source?: 'tracker' | 'crp2'
}

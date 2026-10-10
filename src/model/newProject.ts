import { addUnits } from '../import/parse'
import { composeName, composeScope, type CulvertKind, type SiteLayout } from '../layout/parse'
import type { HoursOrDays, Project } from './types'

export interface NewProjectInput {
  projectName: string
  reportTitle?: string
  subtitle?: string
  preparedBy?: string
  possessionStart: Date
  duration: number
  unit: HoursOrDays
  /** First location: code and chainage ("C263", "KM 209+025"), and what the culvert is made of. */
  code: string
  chainage?: string
  kind?: CulvertKind
  count?: number | null
  length?: string
}

/** A blank project from scratch: the possession window and one location with a single starter activity. */
export function createProject(i: NewProjectInput): { project: Project; layouts: SiteLayout[] } {
  const layout: SiteLayout = {
    code: i.code.trim(), chainage: (i.chainage ?? '').trim(), cells: i.count ?? null, kind: i.kind ?? 'cell', length: (i.length ?? '').trim(), lines: '', otmp: '', station: '',
  }
  const name = composeName(layout) || 'Location 1'
  const project: Project = {
    settings: {
      projectName: i.projectName.trim(), reportTitle: (i.reportTitle ?? '').trim() || i.projectName.trim(), subtitle: (i.subtitle ?? '').trim(),
      preparedBy: (i.preparedBy ?? '').trim(),
      cutoff: i.possessionStart, cutoffDefaulted: true,
      possessionStart: i.possessionStart, duration: i.duration, unit: i.unit,
      possessionEnd: addUnits(i.possessionStart, i.duration, i.unit),
      ganttStart: i.possessionStart, ganttSpan: i.duration, ganttSpanUnit: i.unit,
    },
    locationCount: 1,
    activityRowsPerLocation: 1,
    locations: [{
      name, scope: composeScope(layout),
      activities: [{
        no: 1, sourceRow: 0, name: 'New activity', durationH: 1, pred: 0, rel: 'FS', lagH: 0,
        actualStartDate: null, actualStartTime: null, actualFinishDate: null, actualFinishTime: null, pct: null, remarks: '',
      }],
    }],
    warnings: [],
  }
  return { project, layouts: [layout] }
}

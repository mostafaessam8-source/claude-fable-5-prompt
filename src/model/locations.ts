import { composeName, parseLayout, type SiteLayout } from '../layout/parse'
import { DI_BLOCK0, DI_FIRST_LOCATION_ROW } from '../export/positions'
import type { ActivityInput, LocationInput, Project } from './types'

/** The workbook's location list sits above the first activity block, so it holds this many locations. */
export const MAX_LOCATIONS = DI_BLOCK0 - DI_FIRST_LOCATION_ROW

export interface Edited { project: Project; layouts: SiteLayout[] }

const withLocations = (project: Project, locations: LocationInput[], rows = project.activityRowsPerLocation): Project => ({
  ...project, locations, locationCount: locations.length, activityRowsPerLocation: Math.max(rows, ...locations.map((l) => l.activities.length)),
})

const starter = (): ActivityInput => ({
  no: 1, sourceRow: 0, name: 'New activity', durationH: 1, pred: 0, rel: 'FS', lagH: 0,
  actualStartDate: null, actualStartTime: null, actualFinishDate: null, actualFinishTime: null, pct: null, remarks: '',
})

/**
 * Rename a location (and optionally change its scope line). The site-layout facts keep everything the user entered:
 * only the code and chainage come from the new name, so the exported name and the layout agree.
 */
export function renameLocation({ project, layouts }: Edited, i: number, name: string, scope = project.locations[i].scope): Edited {
  const parsed = parseLayout(name, scope)
  const old = layouts[i] ?? parseLayout(project.locations[i].name, project.locations[i].scope)
  const layout: SiteLayout = { ...old, code: parsed.code, chainage: parsed.chainage }
  // the text typed is what the workbook gets as long as the layout it implies is the one stored
  return {
    project: withLocations(project, project.locations.map((l, j) => (j === i ? { ...l, name: composeName(layout) || name, scope } : l))),
    layouts: layouts.map((x, j) => (j === i ? layout : x)),
  }
}

/** A new location after `after` (or last) with one starter activity. */
export function addLocation({ project, layouts }: Edited, name: string, after = project.locations.length - 1): Edited {
  const at = after + 1
  const loc: LocationInput = { name, scope: '', activities: [starter()] }
  const locations = [...project.locations.slice(0, at), loc, ...project.locations.slice(at)]
  return { project: withLocations(project, locations), layouts: [...layouts.slice(0, at), parseLayout(name, ''), ...layouts.slice(at)] }
}

/** A copy of a location (activities, links, layout facts) without the actuals, right after the original. */
export function duplicateLocation({ project, layouts }: Edited, i: number, name: string): Edited {
  const src = project.locations[i]
  const loc: LocationInput = {
    ...src, name,
    activities: src.activities.map((a) => ({ ...a, sourceRow: 0, actualStartDate: null, actualStartTime: null, actualFinishDate: null, actualFinishTime: null, pct: null, remarks: '' })),
  }
  const base = layouts[i] ?? parseLayout(src.name, src.scope)
  const parsed = parseLayout(name, '')
  const layout: SiteLayout = { ...base, code: parsed.code, chainage: parsed.chainage }
  const at = i + 1
  return {
    project: withLocations(project, [...project.locations.slice(0, at), loc, ...project.locations.slice(at)]),
    layouts: [...layouts.slice(0, at), layout, ...layouts.slice(at)],
  }
}

/** Remove a location (the last one cannot be removed). */
export function deleteLocation({ project, layouts }: Edited, i: number): Edited {
  if (project.locations.length <= 1) return { project, layouts }
  return { project: withLocations(project, project.locations.filter((_, j) => j !== i)), layouts: layouts.filter((_, j) => j !== i) }
}

/** Move a location one place up (-1) or down (+1). */
export function moveLocation({ project, layouts }: Edited, i: number, dir: -1 | 1): Edited {
  const j = i + dir
  if (j < 0 || j >= project.locations.length) return { project, layouts }
  const swap = <T,>(a: T[]) => { const b = [...a]; [b[i], b[j]] = [b[j], b[i]]; return b }
  return { project: withLocations(project, swap(project.locations)), layouts: swap(layouts) }
}

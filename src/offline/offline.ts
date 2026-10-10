/**
 * The offline contractor copy: the whole app in ONE html file with the project embedded. The contractor fills in what
 * happened on site and saves a small update file; there is no Excel export in that copy. The file comes back here
 * through "Import contractor update", where every difference is reviewed before it is applied.
 */
import type { SiteLayout } from '../layout/parse'
import { reviver, replacer } from '../model/store'
import type { Project } from '../model/types'

export const DATA_ID = 'sar-offline-data'
export const UPDATE_FORMAT = 'sar-possession-update'

export interface OfflinePayload {
  /** Identifies this copy, so the browser keeps the contractor's work apart per file. */
  id: string
  preparedAt: string
  project: Project
  layouts: SiteLayout[]
}

/** The payload embedded in this page, or null in the normal app. */
function read(): OfflinePayload | null {
  try {
    const el = typeof document === 'undefined' ? null : document.getElementById(DATA_ID)
    return el?.textContent ? (JSON.parse(el.textContent, reviver) as OfflinePayload) : null
  } catch { return null }
}
export const OFFLINE = read()

/** JSON for a <script type="application/json"> element: "<" is escaped so the data can never close the tag. */
export const embed = (p: OfflinePayload) => JSON.stringify(p, replacer).replace(/</g, '\\u003c')

export function newId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

/** The file the contractor sends back. */
export function updateFileText(project: Project, layouts: SiteLayout[], offlineId: string): string {
  return JSON.stringify({ format: UPDATE_FORMAT, version: 1, offlineId, savedAt: new Date().toISOString(), project, layouts }, replacer, 1)
}

/** Read an update file back into a project; anything that is not one is an error, not a guess. */
export function parseUpdateFile(text: string): { project: Project; layouts: SiteLayout[] | null } {
  let j: { format?: string; project?: Project; layouts?: SiteLayout[] }
  try { j = JSON.parse(text, reviver) } catch { throw new Error('That file is not a SAR update file.') }
  if (j?.format !== UPDATE_FORMAT || !j.project || !Array.isArray(j.project.locations)) throw new Error('That file is not a SAR update file.')
  return { project: j.project, layouts: Array.isArray(j.layouts) ? j.layouts.map((l) => ({ ...l, kind: l.kind ?? 'cell', length: l.length ?? '' })) : null }
}

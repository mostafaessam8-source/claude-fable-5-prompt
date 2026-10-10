import type { SiteLayout } from '../layout/parse'
import type { Project } from './types'

const KEY = 'sar-possession-tracker/project/v1'

export interface Saved { project: Project; layouts: SiteLayout[] }

// Dates survive JSON as {"$date": iso}.
export const replacer = function (this: Record<string, unknown>, key: string, value: unknown) {
  return this[key] instanceof Date ? { $date: (this[key] as Date).toISOString() } : value
}
export const reviver = (_k: string, v: unknown) =>
  v && typeof v === 'object' && '$date' in v ? new Date((v as { $date: string }).$date) : v

export function saveProject(s: Saved, key = KEY) {
  try { localStorage.setItem(key, JSON.stringify(s, replacer)) } catch { /* storage unavailable */ }
}
export function loadProject(key = KEY): Saved | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const s = JSON.parse(raw, reviver) as Saved
    // layouts saved before the culvert type existed have no `kind`
    return { ...s, layouts: s.layouts.map((l) => ({ ...l, kind: l.kind ?? 'cell' })) }
  } catch { return null }
}
export function clearProject() {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}

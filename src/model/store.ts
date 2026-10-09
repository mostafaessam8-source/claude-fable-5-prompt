import type { SiteLayout } from '../layout/parse'
import type { Project } from './types'

const KEY = 'sar-possession-tracker/project/v1'

export interface Saved { project: Project; layouts: SiteLayout[] }

// Dates survive JSON as {"$date": iso}.
const replacer = function (this: Record<string, unknown>, key: string, value: unknown) {
  return this[key] instanceof Date ? { $date: (this[key] as Date).toISOString() } : value
}
const reviver = (_k: string, v: unknown) =>
  v && typeof v === 'object' && '$date' in v ? new Date((v as { $date: string }).$date) : v

export function saveProject(s: Saved) {
  try { localStorage.setItem(KEY, JSON.stringify(s, replacer)) } catch { /* storage unavailable */ }
}
export function loadProject(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw, reviver) as Saved) : null
  } catch { return null }
}
export function clearProject() {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}

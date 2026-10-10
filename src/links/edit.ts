/** Pure editing helpers for the activity panel: every edit returns a NEW project (the app recomputes from it). */
import type { ActivityInput, Project, Rel } from '../model/types'
import { startFromLink } from './diff'

export const RELS: Rel[] = ['FS', 'SS', 'FF', 'SF']

const round = (x: number) => Math.round(x * 60) / 60 // to the minute

/** Edit one activity's inputs. */
export function patchActivity(project: Project, loc: number, no: number, patch: Partial<ActivityInput>): Project {
  return {
    ...project,
    locations: project.locations.map((l, i) =>
      i !== loc ? l : { ...l, activities: l.activities.map((a) => (a.no === no ? { ...a, ...patch } : a)) }),
  }
}

/** Activities whose predecessor is `no` (the successors), in order. */
export function successorsOf(project: Project, loc: number, no: number): ActivityInput[] {
  return project.locations[loc].activities.filter((a) => a.pred === no)
}

/** Activities that may be chosen as the predecessor of `no`: earlier numbers only (the engine needs pred < no). */
export function candidatePredecessors(project: Project, loc: number, no: number): ActivityInput[] {
  return project.locations[loc].activities.filter((a) => a.no < no)
}

/** Activities that may become successors of `no`: later numbers that do not already follow it. */
export function candidateSuccessors(project: Project, loc: number, no: number): ActivityInput[] {
  return project.locations[loc].activities.filter((a) => a.no > no && a.pred !== no)
}

/** The lag that makes a link give `startH`, so (re)linking never has to move a date. */
export function lagToKeepStart(
  startH: number, rel: Rel, pred: { startH: number; finishH: number } | null, durH: number,
): number {
  if (!pred) return round(startH)
  return round(startH - startFromLink({ pred: 1, rel, lagH: 0 }, pred, durH))
}

// ---- <input type=date|time> conversions (floating wall-clock times, UTC accessors) ----
const p2 = (n: number) => String(n).padStart(2, '0')
export const dateToInput = (d: Date | null) =>
  d ? `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}` : ''
export const inputToDate = (s: string): Date | null => {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null
}
export const timeToInput = (h: number | null) => {
  if (h == null) return ''
  const m = Math.round(h * 60)
  return `${p2(Math.floor(m / 60) % 24)}:${p2(m % 60)}`
}
export const inputToTime = (s: string): number | null => {
  const m = s.match(/^(\d{1,2}):(\d{2})$/)
  return m ? Number(m[1]) + Number(m[2]) / 60 : null
}

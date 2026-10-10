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

/** A wall-clock Date → the model's (date at midnight, hours since midnight) pair. */
export function splitDateTime(d: Date): { date: Date; time: number } {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  return { date, time: Math.round(((d.getTime() - date.getTime()) / 3_600_000) * 60) / 60 }
}

/** What is wrong with the actual dates, in words (the engine flags the row and forces it to 0 %). */
export function actualProblems(
  a: Pick<ActivityInput, 'actualStartDate' | 'actualFinishDate'>,
  start: Date | null, finish: Date | null, possessionStart: Date,
): string[] {
  const out: string[] = []
  if (start && start < possessionStart) out.push('The actual start is before the possession start.')
  if (start && finish && finish < start) out.push('The actual finish is before the actual start.')
  if ((a.actualFinishDate || finish) && !start) out.push('There is an actual finish but no actual start.')
  return out
}

// ---- adding and removing activities ----
// An activity's `no` is its row slot in the workbook block (blank slots are switched-off rows), so deleting leaves a gap and nothing is renumbered.

/** Append a new activity to a location: it follows the last one (FS, no lag). Returns the project and the new activity's number. */
export function addActivity(project: Project, loc: number, name = 'New activity', durationH = 1): { project: Project; no: number } {
  const acts = project.locations[loc].activities
  const last = acts.length ? acts[acts.length - 1] : undefined
  const no = acts.reduce((m, a) => Math.max(m, a.no), 0) + 1
  const fresh: ActivityInput = {
    no, sourceRow: 0, name, durationH, pred: last ? last.no : 0, rel: 'FS', lagH: 0,
    actualStartDate: null, actualStartTime: null, actualFinishDate: null, actualFinishTime: null, pct: null, remarks: '',
  }
  return {
    no,
    project: {
      ...project,
      // every location block has the same number of rows in the workbook, so a longer location lengthens them all
      activityRowsPerLocation: Math.max(project.activityRowsPerLocation, no),
      locations: project.locations.map((l, i) => (i !== loc ? l : { ...l, activities: [...l.activities, fresh] })),
    },
  }
}

/**
 * Remove an activity. Whatever followed it is unlinked but keeps its planned start (`startHOf` gives the current one),
 * so deleting one activity never moves another.
 */
export function deleteActivity(project: Project, loc: number, no: number, startHOf: (no: number) => number): Project {
  return {
    ...project,
    locations: project.locations.map((l, i) => i !== loc ? l : {
      ...l,
      activities: l.activities.filter((a) => a.no !== no).map((a) =>
        a.pred === no ? { ...a, pred: 0, rel: 'FS' as Rel, lagH: round(startHOf(a.no)) } : a),
    }),
  }
}

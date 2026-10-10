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
 * Re-form a location's activity list from `order` (existing activities, or copies with a fresh `no`, in their new order):
 * numbers become 1..n again and every predecessor follows its activity to the new number.
 * An activity whose predecessor is gone, or now comes after it (the engine needs pred < no), is unlinked and keeps its
 * planned start (`startHOf` is the current one, by old number) — so restructuring never moves a date silently.
 * Returns the old numbers of the activities that were unlinked.
 */
export function restructure(
  project: Project, loc: number, order: ActivityInput[], startHOf: (oldNo: number) => number,
): { project: Project; unlinked: number[] } {
  const newNo = new Map(order.map((a, i) => [a.no, i + 1]))
  const unlinked: number[] = []
  const activities = order.map((a, i) => {
    const no = i + 1
    if (a.pred > 0) {
      const np = newNo.get(a.pred)
      if (np != null && np < no) return { ...a, no, pred: np }
      unlinked.push(a.no)
      return { ...a, no, pred: 0, rel: 'FS' as Rel, lagH: round(startHOf(a.no)) }
    }
    return { ...a, no }
  })
  return {
    unlinked,
    project: {
      ...project,
      activityRowsPerLocation: Math.max(project.activityRowsPerLocation, activities.length),
      locations: project.locations.map((l, j) => (j !== loc ? l : { ...l, activities })),
    },
  }
}

/** Remove activities. Whatever followed them is unlinked and keeps its planned start. */
export function deleteActivities(project: Project, loc: number, nos: number[], startHOf: (no: number) => number) {
  const gone = new Set(nos)
  return restructure(project, loc, project.locations[loc].activities.filter((a) => !gone.has(a.no)), startHOf)
}
export const deleteActivity = (project: Project, loc: number, no: number, startHOf: (no: number) => number): Project =>
  deleteActivities(project, loc, [no], startHOf).project

/** Move activities (keeping their relative order) so they sit just before `beforeNo` (null = at the end). */
export function moveActivities(
  project: Project, loc: number, nos: number[], beforeNo: number | null, startHOf: (no: number) => number,
) {
  const moving = new Set(nos)
  const acts = project.locations[loc].activities
  const block = acts.filter((a) => moving.has(a.no))
  const rest = acts.filter((a) => !moving.has(a.no))
  const at = beforeNo == null ? rest.length : rest.findIndex((a) => a.no === beforeNo)
  const i = at < 0 ? rest.length : at
  return restructure(project, loc, [...rest.slice(0, i), ...block, ...rest.slice(i)], startHOf)
}

/** Copies of activities, each right after the last selected one: same predecessor, no actuals. */
export function duplicateActivities(project: Project, loc: number, nos: number[], startHOf: (no: number) => number) {
  const pick = new Set(nos)
  const acts = project.locations[loc].activities
  const lastIdx = acts.reduce((m, a, i) => (pick.has(a.no) ? i : m), -1)
  let key = acts.reduce((m, a) => Math.max(m, a.no), 0)
  const copies = acts.filter((a) => pick.has(a.no)).map((a) => ({
    ...a, no: ++key, name: `${a.name} (copy)`, sourceRow: 0,
    actualStartDate: null, actualStartTime: null, actualFinishDate: null, actualFinishTime: null, pct: null, remarks: '',
  }))
  const r = restructure(project, loc, [...acts.slice(0, lastIdx + 1), ...copies, ...acts.slice(lastIdx + 1)], startHOf)
  return { ...r, firstNew: lastIdx + 2 }
}

/** A new activity right after `afterNo` (null = at the start); it follows that activity. Returns its new number. */
export function insertActivityAfter(project: Project, loc: number, afterNo: number | null, startHOf: (no: number) => number) {
  const acts = project.locations[loc].activities
  const idx = afterNo == null ? -1 : acts.findIndex((a) => a.no === afterNo)
  const key = acts.reduce((m, a) => Math.max(m, a.no), 0) + 1
  const fresh: ActivityInput = {
    no: key, sourceRow: 0, name: 'New activity', durationH: 1, pred: idx >= 0 ? acts[idx].no : 0, rel: 'FS', lagH: 0,
    actualStartDate: null, actualStartTime: null, actualFinishDate: null, actualFinishTime: null, pct: null, remarks: '',
  }
  const r = restructure(project, loc, [...acts.slice(0, idx + 1), fresh, ...acts.slice(idx + 1)], startHOf)
  return { ...r, no: idx + 2 }
}

// ---- typing the planned dates: the link stays, the lag (and for a finish, the duration) follows ----
const dp2 = (n: number) => String(n).padStart(2, '0')
/** `<input type="datetime-local">` value for hour `h` since `origin` (floating wall-clock). */
export function hoursToInput(origin: Date, h: number): string {
  const d = new Date(origin.getTime() + Math.round(h * 60) * 60000)
  return `${d.getUTCFullYear()}-${dp2(d.getUTCMonth() + 1)}-${dp2(d.getUTCDate())}T${dp2(d.getUTCHours())}:${dp2(d.getUTCMinutes())}`
}
/** Hours since `origin` for a datetime-local value, or null when it is incomplete. */
export function inputToHours(origin: Date, s: string): number | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) return null
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]))
  return round((t - origin.getTime()) / 3_600_000)
}

type PredTimes = { startH: number; finishH: number } | null

/** Move the whole activity to start at `startH`: duration and link stay, the lag becomes whatever makes the link give that start. */
export function setPlannedStart(project: Project, loc: number, no: number, startH: number, rel: Rel, pred: PredTimes, durH: number): Project {
  return patchActivity(project, loc, no, { lagH: lagToKeepStart(startH, rel, pred, durH) })
}

/**
 * Set the finish: the start stays, so the duration becomes finish − start, and the lag is recomputed
 * (a finish-driven link FF/SF depends on the duration) so the start does not move. Returns null when the finish is not after the start.
 */
export function setPlannedFinish(project: Project, loc: number, no: number, startH: number, finishH: number, rel: Rel, pred: PredTimes): Project | null {
  const dur = round(finishH - startH)
  if (dur < 0.25) return null
  return patchActivity(project, loc, no, { durationH: dur, lagH: lagToKeepStart(startH, rel, pred, dur) })
}

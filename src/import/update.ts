/**
 * A returned workbook (the contractor filled in actuals, remarks, maybe corrected a duration) compared with the
 * current project. Nothing is overwritten blindly: the differences come back as a reviewable list per activity.
 */
import { parseLayout } from '../layout/parse'
import { patchActivity } from '../links/edit'
import type { ActivityInput, Project } from '../model/types'

export type FieldKey = 'name' | 'durationH' | 'pred' | 'rel' | 'lagH' | 'actualStart' | 'actualFinish' | 'pct' | 'remarks'
/** Plan fields change the schedule; the rest records what happened on site. */
export const PLAN_FIELDS: FieldKey[] = ['name', 'durationH', 'pred', 'rel', 'lagH']
export const FIELD_LABEL: Record<FieldKey, string> = {
  name: 'Activity name', durationH: 'Duration (h)', pred: 'Predecessor', rel: 'Relationship', lagH: 'Lag (h)',
  actualStart: 'Actual start', actualFinish: 'Actual finish', pct: '% complete', remarks: 'Remarks',
}

export interface FieldChange { field: FieldKey; from: string; to: string; patch: Partial<ActivityInput> }
export interface ActivityUpdate { loc: number; no: number; name: string; changes: FieldChange[] }
export interface UpdateDiff {
  updates: ActivityUpdate[]
  /** Things in the file that could not be matched, for the reviewer to see. */
  notes: string[]
  /** Activities compared (matched). */
  matched: number
}

const p2 = (n: number) => String(n).padStart(2, '0')
const dt = (d: Date | null, t: number | null) => {
  if (!d) return ''
  const m = Math.round((t ?? 0) * 60)
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(Math.floor(m / 60) % 24)}:${p2(m % 60)}`
}
const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()
const num = (x: number | null) => (x == null ? '' : String(Math.round(x * 1000) / 1000))
const pct = (x: number | null) => (x == null ? '' : `${Math.round(x * 100)} %`)

type Spec = { field: FieldKey; show: (a: ActivityInput) => string; take: (a: ActivityInput) => Partial<ActivityInput> }
const SPECS: Spec[] = [
  { field: 'name', show: (a) => a.name, take: (a) => ({ name: a.name }) },
  { field: 'durationH', show: (a) => num(a.durationH), take: (a) => ({ durationH: a.durationH }) },
  { field: 'pred', show: (a) => (a.pred ? `#${a.pred}` : 'possession start'), take: (a) => ({ pred: a.pred }) },
  { field: 'rel', show: (a) => a.rel, take: (a) => ({ rel: a.rel }) },
  { field: 'lagH', show: (a) => num(a.lagH), take: (a) => ({ lagH: a.lagH }) },
  { field: 'actualStart', show: (a) => dt(a.actualStartDate, a.actualStartTime), take: (a) => ({ actualStartDate: a.actualStartDate, actualStartTime: a.actualStartTime }) },
  { field: 'actualFinish', show: (a) => dt(a.actualFinishDate, a.actualFinishTime), take: (a) => ({ actualFinishDate: a.actualFinishDate, actualFinishTime: a.actualFinishTime }) },
  { field: 'pct', show: (a) => pct(a.pct), take: (a) => ({ pct: a.pct }) },
  { field: 'remarks', show: (a) => a.remarks.trim(), take: (a) => ({ remarks: a.remarks.trim() }) },
]

export function diffUpdate(current: Project, incoming: Project): UpdateDiff {
  const notes: string[] = []
  const updates: ActivityUpdate[] = []
  let matched = 0
  const codeOf = (n: string, s: string) => norm(parseLayout(n, s).code)
  const used = new Set<number>()

  incoming.locations.forEach((il) => {
    let ci = current.locations.findIndex((l, i) => !used.has(i) && norm(l.name) === norm(il.name))
    if (ci < 0) ci = current.locations.findIndex((l, i) => !used.has(i) && codeOf(l.name, l.scope) && codeOf(l.name, l.scope) === codeOf(il.name, il.scope))
    if (ci < 0) { notes.push(`Location “${il.name}” is not in this project — skipped.`); return }
    used.add(ci)
    const cur = current.locations[ci]

    // pair activities: same name first (preferring the same number), then the same number for a renamed one
    const pairs: [ActivityInput, ActivityInput][] = []
    const taken = new Set<number>()
    const unpaired: ActivityInput[] = []
    for (const ia of il.activities) {
      const cands = cur.activities.filter((c) => !taken.has(c.no) && norm(c.name) === norm(ia.name))
      const hit = cands.find((c) => c.no === ia.no) ?? cands[0]
      if (hit) { taken.add(hit.no); pairs.push([hit, ia]) } else unpaired.push(ia)
    }
    for (const ia of unpaired) {
      const hit = cur.activities.find((c) => !taken.has(c.no) && c.no === ia.no && !il.activities.some((x) => norm(x.name) === norm(c.name)))
      if (hit) { taken.add(hit.no); pairs.push([hit, ia]) } else notes.push(`${il.name}: “${ia.name}” (#${ia.no}) is not in this project — skipped.`)
    }
    // link numbers only mean something when both sides number the activities alike
    const sameNumbering = pairs.every(([c, i]) => c.no === i.no)
    if (!sameNumbering) notes.push(`${il.name}: activities are numbered differently from the file, so predecessor/relationship/lag were not compared.`)

    for (const [c, i] of pairs) {
      matched++
      const changes: FieldChange[] = []
      for (const sp of SPECS) {
        if (!sameNumbering && (sp.field === 'pred' || sp.field === 'rel' || sp.field === 'lagH')) continue
        const from = sp.show(c), to = sp.show(i)
        if (from === to) continue
        if (sp.field === 'name' && !to) continue // a blank name would switch the row off
        changes.push({ field: sp.field, from, to, patch: sp.take(i) })
      }
      if (changes.length) updates.push({ loc: ci, no: c.no, name: c.name, changes })
    }
  })
  return { updates, notes, matched }
}

/** Apply the chosen activities' changes (keys `loc:no`) as one new project. */
export function applyUpdate(project: Project, diff: UpdateDiff, accepted: ReadonlySet<string>): Project {
  let p = project
  for (const u of diff.updates) {
    if (!accepted.has(`${u.loc}:${u.no}`)) continue
    p = patchActivity(p, u.loc, u.no, Object.assign({}, ...u.changes.map((c) => c.patch)))
  }
  return p
}

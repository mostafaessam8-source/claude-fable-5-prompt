/**
 * A returned workbook (the contractor filled in actuals, remarks, maybe corrected a duration) compared with the
 * current project. Nothing is overwritten blindly: the differences come back as a reviewable list per activity.
 */
import { parseLayout, type SiteLayout } from '../layout/parse'
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
/** Site-layout facts the contractor corrected (cells / pipes, lines, chainage…). */
export interface LayoutUpdate { loc: number; name: string; changes: { field: keyof SiteLayout; from: string; to: string }[]; patch: Partial<SiteLayout> }
const LAYOUT_FIELDS: (keyof SiteLayout)[] = ['code', 'chainage', 'kind', 'cells', 'lines', 'otmp', 'station']
export const LAYOUT_LABEL: Record<keyof SiteLayout, string> = {
  code: 'Code', chainage: 'Chainage', kind: 'Type', cells: 'Count', lines: 'Lines', otmp: 'OTMP', station: 'Base station',
}

export interface UpdateDiff {
  /** Added / removed / reordered activities and locations, and changed settings: these are only taken by replacing the project. */
  structure: string[]
  updates: ActivityUpdate[]
  layouts: LayoutUpdate[]
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

export function diffUpdate(current: Project, incoming: Project, curLayouts?: SiteLayout[], inLayouts?: SiteLayout[] | null): UpdateDiff {
  const notes: string[] = []
  const structure: string[] = []
  const layouts: LayoutUpdate[] = []
  const updates: ActivityUpdate[] = []
  let matched = 0
  const codeOf = (n: string, s: string) => norm(parseLayout(n, s).code)
  const used = new Set<number>()

  incoming.locations.forEach((il, ii) => {
    let ci = current.locations.findIndex((l, i) => !used.has(i) && norm(l.name) === norm(il.name))
    if (ci < 0) ci = current.locations.findIndex((l, i) => !used.has(i) && codeOf(l.name, l.scope) && codeOf(l.name, l.scope) === codeOf(il.name, il.scope))
    if (ci < 0) { structure.push(`Location added: “${il.name}” (${il.activities.length} activities)`); return }
    used.add(ci)
    const cur = current.locations[ci]
    const cl = curLayouts?.[ci], nl = inLayouts?.[ii]
    if (cl && nl) {
      const changes = LAYOUT_FIELDS.filter((f) => String(cl[f] ?? '') !== String(nl[f] ?? ''))
      if (changes.length) layouts.push({ loc: ci, name: cur.name, changes: changes.map((f) => ({ field: f, from: String(cl[f] ?? ''), to: String(nl[f] ?? '') })), patch: Object.fromEntries(changes.map((f) => [f, nl[f]])) })
    }

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
      if (hit) { taken.add(hit.no); pairs.push([hit, ia]) } else structure.push(`${il.name}: activity added — #${ia.no} ${ia.name}`)
    }
    for (const c of cur.activities) if (!taken.has(c.no)) structure.push(`${il.name}: activity removed — #${c.no} ${c.name}`)
    {
      const seq = pairs.map(([c]) => cur.activities.findIndex((x) => x.no === c.no))
      if (seq.some((v, i) => i && v < seq[i - 1])) structure.push(`${il.name}: the order of the activities changed`)
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
  current.locations.forEach((l, i) => { if (!used.has(i)) structure.push(`Location removed: “${l.name}”`) })
  if (incoming.locations.length === current.locations.length && structure.length === 0) {
    const order = incoming.locations.map((l) => current.locations.findIndex((c) => norm(c.name) === norm(l.name)))
    if (order.some((v, i) => i && v < order[i - 1])) structure.push('The order of the locations changed')
  }
  const a = current.settings, b = incoming.settings
  const same = (x: unknown, y: unknown) => (x instanceof Date && y instanceof Date ? x.getTime() === y.getTime() : x === y)
  const SETTINGS: [keyof typeof a, string][] = [['possessionStart', 'Possession start'], ['duration', 'Possession duration'], ['unit', 'Duration unit'], ['cutoff', 'Report cut-off'], ['ganttStart', 'Gantt start'], ['ganttSpan', 'Gantt span'], ['ganttSpanUnit', 'Gantt span unit'], ['projectName', 'Project name'], ['reportTitle', 'Report title'], ['subtitle', 'Subtitle'], ['preparedBy', 'Prepared by']]
  const show = (v: unknown) => (v instanceof Date ? dt(v, v.getUTCHours() + v.getUTCMinutes() / 60).replace(/ 00:00$/, '') || String(v) : String(v))
  for (const [k, label] of SETTINGS) if (!same(a[k], b[k])) structure.push(`${label}: ${show(a[k])} → ${show(b[k])}`)
  return { structure, updates, layouts, notes, matched }
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

/** Apply the accepted layout corrections (keys `layout:<loc>`). */
export function applyLayoutUpdate(layouts: SiteLayout[], diff: UpdateDiff, accepted: ReadonlySet<string>): SiteLayout[] {
  const out = layouts.map((l) => ({ ...l }))
  for (const u of diff.layouts) if (accepted.has(`layout:${u.loc}`)) Object.assign(out[u.loc], u.patch)
  return out
}

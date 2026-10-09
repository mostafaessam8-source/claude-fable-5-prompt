import type { Proposal } from './claude'
import type { SiteLayout } from './parse'

export type LayoutField = 'chainage' | 'cells' | 'lines' | 'otmp' | 'station'
export const FIELDS: LayoutField[] = ['chainage', 'cells', 'lines', 'otmp', 'station']

export interface FieldChange { field: LayoutField; from: string | number | null; to: string | number }
export interface RowDiff { index: number; code: string; changes: FieldChange[] }

const norm = (c: string) => c.replace(/\s+/g, '').toUpperCase()
const same = (a: unknown, b: unknown) =>
  String(a ?? '').replace(/\s+/g, ' ').trim().toLowerCase() === String(b ?? '').replace(/\s+/g, ' ').trim().toLowerCase()

/**
 * What Claude proposes versus what is in the form. A null (or blank) proposal means "not in the
 * text" and never produces a change, so nothing is cleared. Codes are matched ignoring case/spaces.
 */
export function diffProposals(layouts: SiteLayout[], proposals: Proposal[]) {
  const rows: RowDiff[] = []
  const unmatched: Proposal[] = []
  const seen = new Set<number>()
  for (const p of proposals) {
    const index = layouts.findIndex((l) => norm(l.code) === norm(p.code))
    if (index < 0 || seen.has(index)) { unmatched.push(p); continue }
    seen.add(index)
    const cur = layouts[index]
    const changes: FieldChange[] = []
    for (const field of FIELDS) {
      const to = p[field]
      if (to == null) continue
      if (!same(cur[field], to)) changes.push({ field, from: cur[field] === '' ? null : cur[field], to })
    }
    if (changes.length) rows.push({ index, code: cur.code, changes })
  }
  return { rows, unmatched }
}

/** Apply only the accepted rows (by location index); returns a new array. */
export function applyChanges(layouts: SiteLayout[], rows: RowDiff[], accepted: ReadonlySet<number>): SiteLayout[] {
  const out = layouts.map((l) => ({ ...l }))
  for (const r of rows) {
    if (!accepted.has(r.index)) continue
    for (const c of r.changes) (out[r.index] as unknown as Record<string, unknown>)[c.field] = c.to
  }
  return out
}

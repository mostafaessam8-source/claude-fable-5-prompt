import type { LocationResult } from '../engine/schedule'
import type { Project, Rel } from '../model/types'

/** A proposed link for one activity (from a review of the logic). */
export interface LinkProposal { no: number; pred: number; rel: Rel; lagH: number; reason: string }
export interface Link { pred: number; rel: Rel; lagH: number }
export interface LinkChange {
  /** "<location index>:<activity no>" */
  key: string
  loc: number
  no: number
  name: string
  from: Link
  to: Link
  reason: string
  /** false when the proposal would move the planned start (or is malformed): shown, never applicable. */
  ok: boolean
  why?: string
}

const TOL_H = 1 / 60 // one minute

/** The planned start a link would give. */
export function startFromLink(
  link: Link,
  pred: { startH: number; finishH: number } | null,
  durH: number,
): number {
  if (link.pred === 0 || !pred) return link.lagH
  switch (link.rel) {
    case 'SS': return pred.startH + link.lagH
    case 'FF': return pred.finishH + link.lagH - durH
    case 'SF': return pred.startH + link.lagH - durH
    default: return pred.finishH + link.lagH
  }
}

const same = (a: Link, b: Link) => a.pred === b.pred && a.rel === b.rel && Math.abs(a.lagH - b.lagH) < 1e-6

/**
 * Proposals that differ from the current link. Each is checked against the sheet: it is `ok` only if the
 * link reproduces the activity's planned start to the minute, so accepting it cannot move any date.
 */
export function checkProposals(project: Project, results: LocationResult[], locIndex: number, proposals: LinkProposal[]): LinkChange[] {
  const loc = project.locations[locIndex]
  const res = results[locIndex]
  const byNo = new Map(loc.activities.map((a, k) => [a.no, { a, r: res.activities[k] }]))
  const out: LinkChange[] = []
  const seen = new Set<number>()
  for (const p of proposals) {
    const cur = byNo.get(p.no)
    if (!cur || seen.has(p.no)) continue
    seen.add(p.no)
    const from: Link = { pred: cur.a.pred, rel: cur.a.rel, lagH: cur.a.lagH }
    const to: Link = { pred: p.pred, rel: p.rel, lagH: Math.round(p.lagH * 60) / 60 }
    if (same(from, to)) continue
    let ok = true
    let why: string | undefined
    const predAct = to.pred === 0 ? null : byNo.get(to.pred)
    if (to.pred !== 0 && (!predAct || to.pred >= p.no)) {
      ok = false
      why = `activity ${to.pred} is not an earlier activity of this location`
    } else {
      const start = startFromLink(to, predAct ? { startH: predAct.r.plannedStartH, finishH: predAct.r.plannedFinishH } : null, cur.r.durationH)
      if (Math.abs(start - cur.r.plannedStartH) > TOL_H) {
        ok = false
        why = `would start at ${start.toFixed(2)} h, but the sheet's planned start is ${cur.r.plannedStartH.toFixed(2)} h`
      }
    }
    out.push({ key: `${locIndex}:${p.no}`, loc: locIndex, no: p.no, name: cur.a.name, from, to, reason: p.reason, ok, why })
  }
  return out
}

/** Apply the accepted (and ok) changes; returns a new project. */
export function applyLinkChanges(project: Project, changes: LinkChange[], accepted: ReadonlySet<string>): Project {
  const take = new Map(changes.filter((c) => c.ok && accepted.has(c.key)).map((c) => [c.key, c]))
  if (take.size === 0) return project
  return {
    ...project,
    locations: project.locations.map((l, i) => ({
      ...l,
      activities: l.activities.map((a) => {
        const c = take.get(`${i}:${a.no}`)
        return c ? { ...a, pred: c.to.pred, rel: c.to.rel, lagH: c.to.lagH } : a
      }),
    })),
  }
}

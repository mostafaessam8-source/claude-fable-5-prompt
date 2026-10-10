import type { ProjectResult } from '../engine/schedule'
import type { Project } from '../model/types'
import { fmtShort } from '../report/format'
import type { Link } from './diff'

const linkText = (l: Link, nameOf: (no: number) => string) =>
  l.pred === 0 ? `possession start${l.lagH ? ` ${l.lagH > 0 ? '+' : ''}${l.lagH} h` : ''}`
    : `${l.rel} ← #${l.pred} ${nameOf(l.pred)}${l.lagH ? ` ${l.lagH > 0 ? '+' : ''}${l.lagH} h` : ''}`

/** Read-only view of every activity's predecessor link (the forecast follows these links). */
export function LinksReview({ project, result }: { project: Project; result: ProjectResult }) {
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <section>
        <h2 className="mb-2 bg-[#3D3935] px-3 py-1.5 text-sm font-bold text-white">RELATIONSHIPS — PREDECESSOR OF EACH ACTIVITY</h2>
        {project.locations.map((l, i) => {
          const names = new Map(l.activities.map((a) => [a.no, a.name]))
          const nameOf = (no: number) => names.get(no)?.slice(0, 40) ?? ''
          return (
            <details key={i} className="mb-2 border border-slate-300">
              <summary className="cursor-pointer bg-[#F2F8F9] px-2 py-1 text-sm font-semibold">{l.name}</summary>
              <table className="w-full text-xs">
                <tbody>
                  {l.activities.map((a, k) => {
                    const r = result.locations[i].activities[k]
                    return (
                      <tr key={a.no} className={k % 2 ? 'bg-[#F2F8F9]' : ''}>
                        <td className="w-8 px-2 text-slate-500">{a.no}</td>
                        <td className="px-2">{a.name}</td>
                        <td className="whitespace-nowrap px-2">{fmtShort(r.plannedStart)} → {fmtShort(r.plannedFinish)}</td>
                        <td className="px-2 text-[#00778B]">{linkText({ pred: a.pred, rel: a.rel, lagH: a.lagH }, nameOf)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </details>
          )
        })}
      </section>
    </main>
  )
}

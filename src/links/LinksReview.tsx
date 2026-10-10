import { useEffect, useRef, useState } from 'react'
import type { ProjectResult } from '../engine/schedule'
import { ClaudeError } from '../layout/claude'
import type { Project } from '../model/types'
import { fmtShort } from '../report/format'
import { askLinks } from './claude'
import { applyLinkChanges, checkProposals, type Link, type LinkChange } from './diff'

const PROXY = (import.meta.env.VITE_CLAUDE_PROXY_URL as string | undefined) || undefined
const KEY_STORE = 'sar-claude-key'
const readKey = () => { try { return sessionStorage.getItem(KEY_STORE) ?? '' } catch { return '' } }

const linkText = (l: Link, nameOf: (no: number) => string) =>
  l.pred === 0 ? `possession start${l.lagH ? ` ${l.lagH > 0 ? '+' : ''}${l.lagH} h` : ''}`
    : `${l.rel} ← #${l.pred} ${nameOf(l.pred)}${l.lagH ? ` ${l.lagH > 0 ? '+' : ''}${l.lagH} h` : ''}`

export function LinksReview({ project, result, onChange, autoRun, onAutoRunDone }: {
  project: Project
  result: ProjectResult
  onChange: (p: Project) => void
  autoRun: boolean
  onAutoRunDone: () => void
}) {
  const [apiKey, setApiKey] = useState(readKey)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [changes, setChanges] = useState<LinkChange[] | null>(null)
  const [accepted, setAccepted] = useState<Set<string>>(new Set())
  const canCall = !!PROXY || !!apiKey
  const started = useRef(false)

  async function review() {
    setError(null); setChanges(null)
    try { sessionStorage.setItem(KEY_STORE, apiKey) } catch { /* ignore */ }
    const all: LinkChange[] = []
    try {
      for (let i = 0; i < project.locations.length; i++) {
        setBusy(`Claude is reviewing ${project.locations[i].name}  (${i + 1} of ${project.locations.length})…`)
        const proposals = await askLinks(project.locations[i], result.locations[i], { proxyUrl: PROXY, apiKey: apiKey || undefined })
        all.push(...checkProposals(project, result.locations, i, proposals))
      }
      setChanges(all)
      setAccepted(new Set(all.filter((c) => c.ok).map((c) => c.key)))
    } catch (e) {
      setError(e instanceof ClaudeError ? e.message : `Request failed: ${(e as Error).message}`)
    } finally { setBusy(null) }
  }

  // Opening a CRP2 sheet sends it to Claude straight away (when a proxy / key is available).
  useEffect(() => {
    if (autoRun && canCall && !started.current) { started.current = true; onAutoRunDone(); void review() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, canCall])

  const toggle = (k: string) => setAccepted((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })
  const apply = () => { if (changes) { onChange(applyLinkChanges(project, changes, accepted)); setChanges(null) } }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <section>
        <h2 className="mb-2 bg-[#00778B] px-3 py-1.5 text-sm font-bold text-white">RELATIONSHIPS — REVIEWED BY CLAUDE</h2>
        <p className="mb-2 text-sm text-slate-700">
          The forecast follows each activity's predecessor link, so the links decide which activities a delay reaches and when the location finishes.
          The CRP2 sheet has start/finish times but no predecessors, so Claude proposes the logical one for each activity. A proposal is
          offered only if it reproduces the sheet's planned start <b>exactly</b>: accepting one can never move a date.
        </p>
        {!PROXY && (
          <label className="mb-2 block text-sm">Your Anthropic API key <span className="text-slate-500">(sessionStorage only; no proxy configured)</span>
            <input className="w-full rounded border border-slate-300 px-1.5 py-1 text-sm" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-ant-…" autoComplete="off" />
          </label>
        )}
        <button className="rounded bg-[#00778B] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50" disabled={!!busy || !canCall} onClick={review}>
          {busy ?? 'Ask Claude to review the relationships'}
        </button>
        {error && <p className="mt-2 border-l-4 border-[#CB2C30] bg-red-50 p-2 text-sm text-[#CB2C30]">{error}</p>}

        {changes && (
          <div className="mt-4">
            <h3 className="mb-1 font-semibold">Proposed relationships — nothing is applied until you accept</h3>
            {changes.length === 0 && <p className="text-sm text-slate-600">Claude agrees with every current link.</p>}
            {project.locations.map((l, i) => {
              const rows = changes.filter((c) => c.loc === i)
              if (!rows.length) return null
              const names = new Map(l.activities.map((a) => [a.no, a.name]))
              const nameOf = (no: number) => names.get(no)?.slice(0, 40) ?? ''
              return (
                <div key={i} className="mb-3">
                  <div className="bg-[#E6F1F4] px-2 py-1 text-sm font-bold text-[#00778B]">{l.name}</div>
                  {rows.map((c) => (
                    <label key={c.key} className={`flex gap-3 border border-slate-300 p-2 text-sm ${c.ok ? '' : 'bg-slate-50 text-slate-400'}`}>
                      <input type="checkbox" disabled={!c.ok} checked={c.ok && accepted.has(c.key)} onChange={() => toggle(c.key)} />
                      <div>
                        <b>#{c.no} {c.name}</b>
                        <div><s className="text-slate-400">{linkText(c.from, nameOf)}</s> → <b className={c.ok ? 'text-[#00778B]' : ''}>{linkText(c.to, nameOf)}</b></div>
                        {c.reason && <div className="text-xs text-slate-500">{c.reason}</div>}
                        {!c.ok && <div className="text-xs text-[#CB2C30]">Not applicable: {c.why}</div>}
                      </div>
                    </label>
                  ))}
                </div>
              )
            })}
            {changes.some((c) => c.ok) && (
              <button className="rounded bg-[#3D3935] px-4 py-1.5 text-sm font-semibold text-white" onClick={apply}>
                Apply {[...accepted].filter((k) => changes.some((c) => c.key === k && c.ok)).length} accepted
              </button>
            )}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 bg-[#3D3935] px-3 py-1.5 text-sm font-bold text-white">CURRENT LINKS</h2>
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

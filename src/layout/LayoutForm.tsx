import { useState } from 'react'
import { askClaude, ClaudeError, type Proposal } from './claude'
import { applyChanges, diffProposals, type RowDiff } from './diff'
import { OFFLINE } from '../offline/offline'
import type { CulvertKind, SiteLayout } from './parse'

const PROXY = (import.meta.env.VITE_CLAUDE_PROXY_URL as string | undefined) || undefined
const KEY_STORE = 'sar-claude-key'
const readKey = () => { try { return sessionStorage.getItem(KEY_STORE) ?? '' } catch { return '' } }

const input = 'w-full rounded border border-slate-300 px-1.5 py-1 text-sm'

export function LayoutForm({ layouts, names, onChange }: {
  layouts: SiteLayout[]
  names: string[]
  onChange: (l: SiteLayout[]) => void
}) {
  const [text, setText] = useState('')
  const [apiKey, setApiKey] = useState(readKey)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<RowDiff[] | null>(null)
  const [unmatched, setUnmatched] = useState<Proposal[]>([])
  const [accepted, setAccepted] = useState<Set<number>>(new Set())

  const edit = (i: number, patch: Partial<SiteLayout>) =>
    onChange(layouts.map((l, k) => (k === i ? { ...l, ...patch } : l)))

  async function ask() {
    setBusy(true); setError(null); setRows(null)
    try {
      try { sessionStorage.setItem(KEY_STORE, apiKey) } catch { /* ignore */ }
      const proposals = await askClaude(text, layouts.map((l, i) => ({ code: l.code, name: names[i] })), { proxyUrl: PROXY, apiKey: apiKey || undefined })
      const d = diffProposals(layouts, proposals)
      setRows(d.rows); setUnmatched(d.unmatched); setAccepted(new Set(d.rows.map((r) => r.index)))
    } catch (e) {
      setError(e instanceof ClaudeError ? e.message : `Request failed: ${(e as Error).message}`)
    } finally { setBusy(false) }
  }

  const toggle = (i: number) => setAccepted((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })
  const apply = () => { if (rows) { onChange(applyChanges(layouts, rows, accepted)); setRows(null) } }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <section>
        <h2 className="mb-2 bg-[#3D3935] px-3 py-1.5 text-sm font-bold text-white">SITE LAYOUT FACTS</h2>
        <table className="w-full text-sm">
          <thead className="bg-[#768692] text-white">
            <tr>{['Code', 'Chainage', 'Type', 'Count', 'Lines', 'OTMP', 'Base station'].map((h) => <th key={h} className="px-2 py-1 text-left">{h}</th>)}</tr>
          </thead>
          <tbody>
            {layouts.map((l, i) => (
              <tr key={i} className={i % 2 ? 'bg-[#F2F8F9]' : ''}>
                <td className="p-1"><input className={input} value={l.code} onChange={(e) => edit(i, { code: e.target.value })} /></td>
                <td className="p-1"><input className={input} value={l.chainage} onChange={(e) => edit(i, { chainage: e.target.value })} /></td>
                <td className="p-1 w-24"><select className={input} value={l.kind} aria-label="Culvert type" onChange={(e) => edit(i, { kind: e.target.value as CulvertKind })}>
                  <option value="cell">Cells</option><option value="pipe">Pipes</option></select></td>
                <td className="p-1 w-20"><input className={input} type="number" min={0} value={l.cells ?? ''}
                  onChange={(e) => edit(i, { cells: e.target.value === '' ? null : Math.max(0, Math.floor(Number(e.target.value))) })} /></td>
                <td className="p-1"><input className={input} value={l.lines} onChange={(e) => edit(i, { lines: e.target.value })} /></td>
                <td className="p-1 w-32"><input className={input} value={l.otmp} onChange={(e) => edit(i, { otmp: e.target.value })} /></td>
                <td className="p-1 w-36"><input className={input} value={l.station} onChange={(e) => edit(i, { station: e.target.value })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-xs text-slate-500">Pre-filled from the location name and scope line of the imported workbook. Edit freely.</p>
      </section>

      {!OFFLINE && (
      <section>
        <h2 className="mb-2 bg-[#00778B] px-3 py-1.5 text-sm font-bold text-white">ASK CLAUDE TO FILL THIS</h2>
        <textarea className={`${input} h-36 font-mono`} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Paste a scope note, a table from an email, a list of culverts…" />
        {!PROXY && (
          <label className="mt-2 block text-sm">Your Anthropic API key <span className="text-slate-500">(kept in this tab's sessionStorage only; no proxy configured)</span>
            <input className={input} type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-ant-…" autoComplete="off" />
          </label>
        )}
        <button className="mt-2 rounded bg-[#00778B] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          disabled={busy || !text.trim() || (!PROXY && !apiKey)} onClick={ask}>
          {busy ? 'Asking Claude…' : 'Ask Claude'}
        </button>
        {error && <p className="mt-2 border-l-4 border-[#CB2C30] bg-red-50 p-2 text-sm text-[#CB2C30]">{error}</p>}

        {rows && (
          <div className="mt-4">
            <h3 className="mb-1 font-semibold">Proposed changes — nothing is applied until you accept</h3>
            {rows.length === 0 && <p className="text-sm text-slate-600">Claude found nothing that differs from the form.</p>}
            {rows.map((r) => (
              <label key={r.index} className="mb-2 flex gap-3 border border-slate-300 p-2 text-sm">
                <input type="checkbox" checked={accepted.has(r.index)} onChange={() => toggle(r.index)} />
                <div>
                  <b>{r.code}</b>
                  <ul>{r.changes.map((c) => (
                    <li key={c.field}><span className="inline-block w-24 text-slate-500">{c.field}</span>
                      <s className="text-slate-400">{String(c.from ?? '—')}</s> → <b className="text-[#00778B]">{String(c.to)}</b></li>
                  ))}</ul>
                </div>
              </label>
            ))}
            {unmatched.length > 0 && <p className="text-xs text-slate-500">Ignored (no matching location): {unmatched.map((u) => u.code).join(', ')}</p>}
            {rows.length > 0 && (
              <button className="mt-1 rounded bg-[#3D3935] px-4 py-1.5 text-sm font-semibold text-white" onClick={apply}>
                Apply {accepted.size} accepted
              </button>
            )}
          </div>
        )}
      </section>
      )}
    </main>
  )
}

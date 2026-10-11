import { useEffect } from 'react'
import type { ProjectResult } from '../engine/schedule'
import { addLink, candidatePredecessors, lagToKeepStart, linksOf, patchActivity, RELS, removeLink, withLinks } from '../links/edit'
import type { ExtraLink, Project, Rel } from '../model/types'
import { useNarrow } from '../model/useNarrow'

export const LINKS_W = 380
const lab = 'block text-xs font-semibold text-slate-600'
const inp = 'mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-sm font-normal text-slate-900'

/** A side window with ALL the relationships of one activity: what it follows (several allowed) and what follows it. */
export function LinksPanel({ project, result, loc, no, onChange, onSelect, onClose }: {
  project: Project; result: ProjectResult; loc: number; no: number
  onChange: (p: Project) => void; onSelect: (no: number) => void; onClose: () => void
}) {
  const narrow = useNarrow(600)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const acts = project.locations[loc].activities
  const a = acts.find((x) => x.no === no)
  if (!a) return null
  const res = result.locations[loc].activities
  const resOf = (n: number) => res[acts.findIndex((x) => x.no === n)]
  const r = resOf(no)
  const links = linksOf(a)
  const setLinks = (next: ExtraLink[]) => onChange(patchActivity(project, loc, no, withLinks(next, r.plannedStartH)))
  const edit = (i: number, patch: Partial<ExtraLink>) => setLinks(links.map((l, k) => (k === i ? { ...l, ...patch } : l)))
  const followers = acts.filter((x) => linksOf(x).some((l) => l.pred === no))
  const used = new Set(links.map((l) => l.pred))
  const choices = candidatePredecessors(project, loc, no).filter((c) => !used.has(c.no))
  return (
    <aside style={{ width: narrow ? '100%' : LINKS_W, top: 'var(--hdr, 0px)' }} className="no-print fixed bottom-0 right-0 z-50 max-w-full overflow-y-auto border-l border-slate-300 bg-white text-slate-800 shadow-2xl" aria-label="Activity relationships">
      <div className="sticky top-0 z-10 flex items-start gap-2 bg-[#00778B] px-3 py-2 text-white">
        <div className="flex-1">
          <div className="text-xs opacity-80">{project.locations[loc].name}</div>
          <div className="text-sm font-bold">#{a.no} {a.name}</div>
          <div className="text-xs">starts when the LAST relationship allows it</div>
        </div>
        <button className="rounded border border-white/50 px-2 text-sm" onClick={onClose} title="Close (Esc)">✕</button>
      </div>
      <div className="space-y-3 p-3">
        <h3 className="bg-[#3D3935] px-2 py-1 text-xs font-bold text-white">THIS ACTIVITY FOLLOWS ({links.length})</h3>
        {links.length === 0 && <p className="text-xs text-slate-500">Nothing: it starts at hour {r.plannedStartH} from the possession start.</p>}
        {links.map((l, i) => {
          const p = acts.find((x) => x.no === l.pred)
          const pr = resOf(l.pred)
          return (
            <div key={`${l.pred}-${i}`} className="rounded bg-[#F2F8F9] p-2 text-xs">
              <label className={lab}>Predecessor
                <select className={inp} value={l.pred} onChange={(e) => edit(i, { pred: Number(e.target.value) })}>
                  {p && <option value={l.pred}>#{l.pred} {p.name}</option>}
                  {candidatePredecessors(project, loc, no).filter((c) => c.no !== l.pred && !used.has(c.no)).map((c) => <option key={c.no} value={c.no}>#{c.no} {c.name}</option>)}
                </select>
              </label>
              <div className="mt-1 grid grid-cols-[auto_1fr_auto] items-end gap-2">
                <label className={lab}>Type
                  <select className={inp} value={l.rel} onChange={(e) => edit(i, { rel: e.target.value as Rel })}>{RELS.map((x) => <option key={x}>{x}</option>)}</select>
                </label>
                <label className={lab}>Lag (h)
                  <input className={inp} type="number" step={0.25} value={l.lagH} onChange={(e) => edit(i, { lagH: Number(e.target.value) || 0 })} />
                </label>
                <button className="rounded border border-[#CB2C30] px-2 py-1 font-semibold text-[#CB2C30]" onClick={() => onChange(removeLink(project, loc, no, i, r.plannedStartH))}>Delete</button>
              </div>
              {pr && <button className="mt-1 text-[#00778B] underline" onClick={() => onSelect(l.pred)}>Open #{l.pred}</button>}
            </div>
          )
        })}
        <label className={lab}>Add a predecessor
          <select className={inp} value="" onChange={(e) => {
            const n = Number(e.target.value)
            if (!n) return
            const pr = resOf(n)
            onChange(addLink(project, loc, no, { pred: n, rel: 'FS', lagH: lagToKeepStart(r.plannedStartH, 'FS', { startH: pr.plannedStartH, finishH: pr.plannedFinishH }, r.durationH) }, r.plannedStartH))
          }}>
            <option value="">— choose —</option>
            {choices.map((c) => <option key={c.no} value={c.no}>#{c.no} {c.name}</option>)}
          </select>
        </label>
        <h3 className="bg-[#768692] px-2 py-1 text-xs font-bold text-white">FOLLOWED BY ({followers.length})</h3>
        {followers.length === 0 && <p className="text-xs text-slate-500">No activity follows this one.</p>}
        {followers.map((f) => {
          const idx = linksOf(f).findIndex((l) => l.pred === no)
          const l = linksOf(f)[idx]
          const fr = resOf(f.no)
          return (
            <div key={f.no} className="flex items-center gap-2 rounded bg-[#F2F8F9] p-2 text-xs">
              <div className="flex-1"><b>#{f.no} {f.name}</b><div className="text-slate-500">{l.rel}{l.lagH ? ` ${l.lagH > 0 ? '+' : ''}${l.lagH} h` : ''}</div></div>
              <button className="rounded border border-[#00778B] px-2 py-1 font-semibold text-[#00778B]" onClick={() => onSelect(f.no)}>Open</button>
              <button className="rounded border border-[#CB2C30] px-2 py-1 font-semibold text-[#CB2C30]" title="Delete this relationship"
                onClick={() => onChange(removeLink(project, loc, f.no, idx, fr.plannedStartH))}>Delete</button>
            </div>
          )
        })}
        <p className="text-xs text-slate-500">On the Gantt: drag from a dot of one bar to another bar to add a relationship; click an arrow (it turns red) and press Delete to remove it.</p>
      </div>
    </aside>
  )
}

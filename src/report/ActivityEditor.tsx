import { useEffect, useRef, useState } from 'react'
import type { ProjectResult } from '../engine/schedule'
import {
  candidatePredecessors, deleteActivities, duplicateActivities, hoursToInput, inputToHours, insertActivityAfter, moveActivities, patchActivity, RELS,
  setPlannedFinish, setPlannedStart,
} from '../links/edit'
import type { SiteLayout } from '../layout/parse'
import { addLocation, deleteLocation, duplicateLocation, MAX_LOCATIONS, moveLocation, renameLocation } from '../model/locations'
import type { Project, Rel } from '../model/types'
import { activityTone } from './brand'

const cell = 'border-b border-slate-200 px-1 py-0.5'
const field = 'w-full rounded border border-slate-300 px-1 py-0.5 text-xs'

/** Text input that commits on blur / Enter and reverts on Esc; a blank name is refused (a blank name switches the row off in the workbook). */
function NameInput({ value, onCommit, placeholder, blankOk }: { value: string; onCommit: (v: string) => void; placeholder?: string; blankOk?: boolean }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  const commit = () => { const t = v.trim(); if ((t || blankOk) && t !== value) onCommit(t); else setV(value) }
  return (
    <input className={field} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={commit} aria-label="Activity name"
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setV(value); (e.target as HTMLInputElement).blur() } }} />
  )
}

/**
 * The Activities tab: one location's activities as an editable list.
 * Rename, change the duration or the link in place; tick rows to delete, duplicate or move several at once;
 * drag a row by its handle to reorder (a block of ticked rows moves together). Undo is in the header.
 */
export function ActivityEditor({ project, layouts, result, onChange, onBoth }: {
  project: Project; layouts: SiteLayout[]; result: ProjectResult
  onChange: (p: Project) => void
  /** Location changes touch the project and the site layouts together. */
  onBoth: (e: { project: Project; layouts: SiteLayout[] }) => void
}) {
  const [loc, setLoc] = useState(0)
  const [sel, setSel] = useState<Set<number>>(new Set())
  const anchor = useRef<number | null>(null)
  const [dragging, setDragging] = useState<number[] | null>(null)
  const [drop, setDrop] = useState<number | null | undefined>(undefined) // undefined = no target, null = the end
  const [note, setNote] = useState<string | null>(null)
  const li = Math.min(loc, project.locations.length - 1)
  const acts = project.locations[li].activities
  const res = result.locations[li].activities
  const startH = (n: number) => res.find((a) => a.no === n)?.plannedStartH ?? 0
  const origin = result.settings.possessionStart
  const predTimes = (pred: number) => {
    const p = pred > 0 ? res.find((x) => x.no === pred) : undefined
    return p ? { startH: p.plannedStartH, finishH: p.plannedFinishH } : null
  }
  const nameOf = (n: number) => acts.find((a) => a.no === n)?.name ?? `#${n}`

  const done = (r: { project: Project; unlinked: number[] }, newSel: number[] = []) => {
    onChange(r.project)
    setSel(new Set(newSel))
    setNote(r.unlinked.length
      ? `${r.unlinked.length} activit${r.unlinked.length === 1 ? 'y' : 'ies'} lost ${r.unlinked.length === 1 ? 'its' : 'their'} predecessor (it was removed or now comes later) and ` +
        `kept ${r.unlinked.length === 1 ? 'its' : 'their'} planned start: ${r.unlinked.map(nameOf).join(', ')}. Undo restores everything.`
      : null)
  }
  const loc0 = project.locations[li]
  const cur = { project, layouts }
  const full = project.locations.length >= MAX_LOCATIONS
  const pickLoc = (i: number) => { setLoc(i); setSel(new Set()); setNote(null) }
  const uniqueName = (base: string) => {
    const names = new Set(project.locations.map((l) => l.name))
    let n = base, i = 2
    while (names.has(n)) n = `${base} ${i++}`
    return n
  }
  const picked = acts.filter((a) => sel.has(a.no)).map((a) => a.no)

  const toggle = (no: number, e: React.MouseEvent | React.ChangeEvent) => {
    const next = new Set(sel)
    const shift = (e.nativeEvent as MouseEvent).shiftKey
    if (shift && anchor.current != null) {
      const a = acts.findIndex((x) => x.no === anchor.current), b = acts.findIndex((x) => x.no === no)
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) next.add(acts[i].no)
    } else {
      if (next.has(no)) next.delete(no); else next.add(no)
      anchor.current = no
    }
    setSel(next)
  }

  const moveBlock = (nos: number[], beforeNo: number | null) => {
    const moving = new Set(nos)
    const rest = acts.filter((a) => !moving.has(a.no))
    const at = beforeNo == null ? rest.length : rest.findIndex((a) => a.no === beforeNo)
    const first = (at < 0 ? rest.length : at) + 1
    done(moveActivities(project, li, nos, beforeNo, startH), nos.map((_, i) => first + i))
  }
  const shiftSel = (dir: -1 | 1) => {
    if (!picked.length) return
    const idx = acts.map((a, i) => (sel.has(a.no) ? i : -1)).filter((i) => i >= 0)
    if (dir < 0 && idx[0] === 0) return
    if (dir > 0 && idx[idx.length - 1] === acts.length - 1) return
    // before the activity above the block, or just after the one below it (= before the one after that)
    const before = dir < 0 ? acts[idx[0] - 1].no : (acts[idx[idx.length - 1] + 2]?.no ?? null)
    moveBlock(picked, before)
  }
  const remove = () => {
    if (!picked.length) return
    if (!window.confirm(`Delete ${picked.length} activit${picked.length === 1 ? 'y' : 'ies'}?`)) return
    done(deleteActivities(project, li, picked, startH))
  }
  const insertBelow = () => {
    const after = picked.length ? picked[picked.length - 1] : acts.length ? acts[acts.length - 1].no : null
    const r = insertActivityAfter(project, li, after, startH)
    done(r, [r.no])
  }
  const copy = () => {
    if (!picked.length) return
    const r = duplicateActivities(project, li, picked, startH)
    done(r, picked.map((_, i) => r.firstNew + i))
  }

  const btn = 'rounded border border-slate-400 bg-white px-2 py-1 text-xs font-semibold disabled:opacity-40'
  const allOn = acts.length > 0 && picked.length === acts.length

  return (
    <main className="mx-auto max-w-[1450px] p-4">
      <section className="mb-3 border border-slate-300 bg-[#F2F8F9] p-2">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-[#00778B]">LOCATION</span>
          <div className="w-72"><NameInput value={loc0.name} onCommit={(name) => onBoth(renameLocation(cur, li, name))} /></div>
          <div className="w-96"><NameInput value={loc0.scope} placeholder="Scope line (e.g. 1 cell │ Main Line 1 │ TSO OTMP from Station 29)" blankOk onCommit={(scope) => onBoth(renameLocation(cur, li, loc0.name, scope))} /></div>
          <button className={btn} disabled={full} title={full ? `The workbook holds up to ${MAX_LOCATIONS} locations` : ''}
            onClick={() => { const e = addLocation(cur, uniqueName('New location'), li); onBoth(e); pickLoc(li + 1) }}>+ New location</button>
          <button className={btn} disabled={full} onClick={() => { onBoth(duplicateLocation(cur, li, uniqueName(`${loc0.name} (copy)`))); pickLoc(li + 1) }}>Duplicate</button>
          <button className={btn} disabled={li === 0} onClick={() => { onBoth(moveLocation(cur, li, -1)); pickLoc(li - 1) }}>◀ Earlier</button>
          <button className={btn} disabled={li >= project.locations.length - 1} onClick={() => { onBoth(moveLocation(cur, li, 1)); pickLoc(li + 1) }}>Later ▶</button>
          <button className={`${btn} border-[#CB2C30] text-[#CB2C30]`} disabled={project.locations.length <= 1}
            onClick={() => { if (window.confirm(`Delete the location “${loc0.name}” and its ${acts.length} activities?`)) { onBoth(deleteLocation(cur, li)); pickLoc(Math.max(0, li - 1)) } }}>Delete location</button>
        </div>
        <p className="text-[11px] text-slate-500">{project.locations.length} of {MAX_LOCATIONS} locations. The name is “code – chainage”; the Site layout tab edits the other facts.</p>
      </section>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select className="rounded border border-slate-300 px-2 py-1 text-sm font-semibold" value={li}
          onChange={(e) => pickLoc(Number(e.target.value))}>
          {project.locations.map((l, i) => <option key={i} value={i}>{l.name} ({l.activities.length})</option>)}
        </select>
        <button className={`${btn} border-[#00778B] text-[#00778B]`} onClick={insertBelow}>{picked.length ? '+ Insert below selection' : '+ Add activity'}</button>
        <button className={btn} disabled={!picked.length} onClick={copy}>Duplicate</button>
        <button className={btn} disabled={!picked.length} onClick={() => shiftSel(-1)}>▲ Up</button>
        <button className={btn} disabled={!picked.length} onClick={() => shiftSel(1)}>▼ Down</button>
        <button className={`${btn} border-[#CB2C30] text-[#CB2C30]`} disabled={!picked.length} onClick={remove}>Delete{picked.length ? ` (${picked.length})` : ''}</button>
        <span className="text-xs text-slate-500">Tick rows (Shift-click for a range), drag ⠿ to reorder. Ctrl+Z undoes.</span>
      </div>
      {note && (
        <p className="mb-2 flex items-start gap-2 border-l-4 border-[#F1B434] bg-amber-50 p-2 text-xs">
          <span className="flex-1">{note}</span><button className="font-bold" onClick={() => setNote(null)}>✕</button>
        </p>
      )}
      <table className="w-full table-fixed border-collapse text-xs" onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrop(undefined) }}>
        <colgroup>
          <col style={{ width: 26 }} /><col style={{ width: 28 }} /><col style={{ width: 34 }} /><col />
          <col style={{ width: 70 }} /><col style={{ width: 210 }} /><col style={{ width: 58 }} /><col style={{ width: 62 }} /><col style={{ width: 168 }} /><col style={{ width: 168 }} /><col style={{ width: 92 }} />
        </colgroup>
        <thead>
          <tr className="bg-[#3D3935] text-left text-white">
            <th className={cell} /><th className={cell}><input type="checkbox" checked={allOn} aria-label="Select all"
              onChange={() => setSel(allOn ? new Set() : new Set(acts.map((a) => a.no)))} /></th>
            <th className={cell}>#</th><th className={cell}>Activity</th><th className={cell}>Duration (h)</th><th className={cell}>Follows</th>
            <th className={cell}>Rel</th><th className={cell}>Lag (h)</th><th className={cell}>Planned start</th><th className={cell}>Planned finish</th><th className={cell}>Status</th>
          </tr>
        </thead>
        <tbody>
          {acts.map((a, k) => {
            const r = res[k]
            const tone = activityTone(r.status)
            const on = sel.has(a.no)
            const isDrag = dragging?.includes(a.no)
            const line = drop === a.no ? '2px solid #00778B' : undefined
            const edit = (patch: Partial<typeof a>) => onChange(patchActivity(project, li, a.no, patch))
            return (
              <tr key={a.no} data-no={a.no} className={on ? 'bg-[#E6F1F4]' : k % 2 ? 'bg-[#F2F8F9]' : ''}
                style={{ opacity: isDrag ? 0.4 : 1, borderTop: line }}
                onDragOver={(e) => {
                  if (!dragging) return
                  e.preventDefault()
                  const box = e.currentTarget.getBoundingClientRect()
                  setDrop(e.clientY < box.top + box.height / 2 ? a.no : (acts[k + 1]?.no ?? null))
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  const d = dragging, t = drop
                  setDragging(null); setDrop(undefined)
                  if (d && t !== undefined) moveBlock(d, t)
                }}>
                <td className={`${cell} cursor-grab select-none text-center text-slate-400`} draggable title="Drag to reorder"
                  onDragStart={(e) => {
                    const nos = on ? picked : [a.no]
                    if (!on) setSel(new Set([a.no]))
                    setDragging(nos)
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', nos.join(','))
                    const tr = e.currentTarget.closest('tr')
                    if (tr) e.dataTransfer.setDragImage(tr, 10, 10)
                  }}
                  onDragEnd={() => { setDragging(null); setDrop(undefined) }}>⠿</td>
                <td className={cell}><input type="checkbox" checked={on} onChange={(e) => toggle(a.no, e)} aria-label={`Select ${a.name}`} /></td>
                <td className={`${cell} text-slate-500`}>{a.no}</td>
                <td className={cell}><NameInput value={a.name} onCommit={(name) => edit({ name })} /></td>
                <td className={cell}>
                  <input className={field} type="number" min={0.25} step={0.25} value={a.durationH ?? ''} placeholder={r.durationBad ? 'missing' : ''}
                    onChange={(e) => { const v = Number(e.target.value); if (e.target.value !== '' && v > 0) edit({ durationH: v }) }} />
                </td>
                <td className={cell}>
                  <select className={field} value={a.pred} onChange={(e) => edit({ pred: Number(e.target.value) })}>
                    <option value={0}>— possession start —</option>
                    {candidatePredecessors(project, li, a.no).map((c) => <option key={c.no} value={c.no}>#{c.no} {c.name.slice(0, 40)}</option>)}
                  </select>
                </td>
                <td className={cell}><select className={field} value={a.rel} onChange={(e) => edit({ rel: e.target.value as Rel })}>{RELS.map((x) => <option key={x}>{x}</option>)}</select></td>
                <td className={cell}><input className={field} type="number" step={0.25} value={a.lagH} onChange={(e) => edit({ lagH: Number(e.target.value) || 0 })} /></td>
                <td className={cell}>
                  <input className={field} type="datetime-local" value={hoursToInput(origin, r.plannedStartH)} aria-label="Planned start"
                    onChange={(e) => { const h = inputToHours(origin, e.target.value); if (h != null) onChange(setPlannedStart(project, li, a.no, h, a.rel, predTimes(a.pred), r.durationH)) }} />
                </td>
                <td className={cell}>
                  <input className={field} type="datetime-local" value={hoursToInput(origin, r.plannedFinishH)} aria-label="Planned finish"
                    onChange={(e) => { const h = inputToHours(origin, e.target.value); const q = h == null ? null : setPlannedFinish(project, li, a.no, r.plannedStartH, h, a.rel, predTimes(a.pred)); if (q) onChange(q) }} />
                </td>
                <td className={cell}><span className="rounded px-1 font-bold" style={{ background: tone.bg, color: tone.fg }}>{r.status}</span></td>
              </tr>
            )
          })}
          {acts.length > 0 && drop === null && <tr><td colSpan={11} style={{ borderTop: '2px solid #00778B', height: 0, padding: 0 }} /></tr>}
        </tbody>
      </table>
      {acts.length === 0 && <p className="p-6 text-center text-slate-500">No activities here yet — use “+ Add activity”.</p>}
    </main>
  )
}

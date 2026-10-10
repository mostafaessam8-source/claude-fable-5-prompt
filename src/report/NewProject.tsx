import { useState } from 'react'
import { hoursToInput, inputToHours } from '../links/edit'
import { createProject, type NewProjectInput } from '../model/newProject'
import type { CulvertKind } from '../layout/parse'
import type { HoursOrDays } from '../model/types'

const f = 'w-full rounded border border-slate-300 px-2 py-1 text-sm'
const l = 'block text-xs font-semibold text-slate-600'

/** Start a project from nothing: the possession window and the first location; everything else is added in the app. */
export function NewProject({ hasProject, onCreate, onClose }: { hasProject: boolean; onCreate: (p: ReturnType<typeof createProject>) => void; onClose: () => void }) {
  const today = new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()))
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [by, setBy] = useState('')
  const [start, setStart] = useState(hoursToInput(today, 0))
  const [dur, setDur] = useState('48')
  const [unit, setUnit] = useState<HoursOrDays>('hours')
  const [code, setCode] = useState('')
  const [chain, setChain] = useState('')
  const [kind, setKind] = useState<CulvertKind>('cell')
  const [count, setCount] = useState('')

  const d = Number(dur)
  const st = inputToHours(today, start) != null ? new Date(today.getTime() + (inputToHours(today, start) as number) * 3_600_000) : null
  const ok = name.trim() !== '' && code.trim() !== '' && st != null && Number.isFinite(d) && d > 0
  const create = () => {
    if (!ok || !st) return
    const input: NewProjectInput = {
      projectName: name, reportTitle: title, preparedBy: by, possessionStart: st, duration: d, unit,
      code, chainage: chain, kind, count: count === '' ? null : Math.max(0, Math.floor(Number(count))),
    }
    onCreate(createProject(input))
  }

  return (
    <div className="no-print fixed inset-0 z-[70] flex items-start justify-center overflow-auto bg-black/40 p-6" role="dialog" aria-label="New project">
      <div className="w-full max-w-2xl bg-white shadow-2xl">
        <div className="flex items-center bg-[#00778B] px-4 py-2 text-white">
          <h2 className="flex-1 text-sm font-bold">NEW PROJECT</h2>
          <button onClick={onClose} title="Close">✕</button>
        </div>
        <div className="space-y-3 p-4">
          {hasProject && <p className="border-l-4 border-[#CB2C30] bg-red-50 p-2 text-xs text-[#CB2C30]">This replaces the project that is open now. Use <b>Save project (.json)</b> first if you want to keep it.</p>}
          <label className={l}>Project name<input className={f} value={name} onChange={(e) => setName(e.target.value)} placeholder="EWR CULVERTS REPLACEMENT PHASE 2" autoFocus /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className={l}>Report title (optional)<input className={f} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
            <label className={l}>Prepared by (optional)<input className={f} value={by} onChange={(e) => setBy(e.target.value)} /></label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className={`${l} col-span-1`}>Possession start<input className={f} type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></label>
            <label className={l}>Possession duration<input className={f} type="number" min={1} value={dur} onChange={(e) => setDur(e.target.value)} /></label>
            <label className={l}>Unit<select className={f} value={unit} onChange={(e) => setUnit(e.target.value as HoursOrDays)}><option value="hours">hours</option><option value="days">days</option></select></label>
          </div>
          <h3 className="bg-[#768692] px-2 py-1 text-xs font-bold text-white">FIRST LOCATION (more can be added later)</h3>
          <div className="grid grid-cols-4 gap-3">
            <label className={l}>Code<input className={f} value={code} onChange={(e) => setCode(e.target.value)} placeholder="C263" /></label>
            <label className={l}>Chainage<input className={f} value={chain} onChange={(e) => setChain(e.target.value)} placeholder="KM 209+025" /></label>
            <label className={l}>Type<select className={f} value={kind} onChange={(e) => setKind(e.target.value as CulvertKind)}><option value="cell">Cells</option><option value="pipe">Pipes</option></select></label>
            <label className={l}>Count<input className={f} type="number" min={0} value={count} onChange={(e) => setCount(e.target.value)} /></label>
          </div>
          <div className="flex justify-end gap-2">
            <button className="rounded border border-slate-400 px-3 py-1" onClick={onClose}>Cancel</button>
            <button className="rounded bg-[#00778B] px-3 py-1 font-semibold text-white disabled:opacity-40" disabled={!ok} onClick={create}>Create project</button>
          </div>
        </div>
      </div>
    </div>
  )
}

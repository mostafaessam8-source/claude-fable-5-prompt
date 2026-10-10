import { applySettings } from './model/settings'
import type { Project } from './model/types'

const p2 = (n: number) => String(n).padStart(2, '0')
const toInput = (d: Date) =>
  `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}T${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`
const fromInput = (s: string) => (s ? new Date(s + ':00Z') : null)

export function SettingsBar({ project, onChange }: { project: Project; onChange: (p: Project) => void }) {
  const s = project.settings
  const f = 'rounded border border-slate-300 px-1 py-0.5 text-sm'
  return (
    <div className="no-print flex flex-wrap items-end gap-4 bg-[#E6F1F4] p-3 text-sm">
      <label className="flex flex-col">Possession start
        <input className={f} type="datetime-local" value={toInput(s.possessionStart)}
          onChange={(e) => { const d = fromInput(e.target.value); if (d) onChange(applySettings(project, { possessionStart: d })) }} />
      </label>
      <label className="flex flex-col">Duration
        <span className="flex gap-1">
          <input className={`${f} w-20`} type="number" min={1} value={s.duration}
            onChange={(e) => { const n = Number(e.target.value); if (n > 0) onChange(applySettings(project, { duration: n })) }} />
          <select className={f} value={s.unit} onChange={(e) => onChange(applySettings(project, { unit: e.target.value as 'hours' | 'days' }))}>
            <option value="hours">hours</option><option value="days">days</option>
          </select>
        </span>
      </label>
      <label className="flex flex-col">Report cut-off (data date)
        <span className="flex gap-1">
          <input className={f} type="datetime-local" value={toInput(s.cutoff)}
            onChange={(e) => { const d = fromInput(e.target.value); if (d) onChange(applySettings(project, { cutoff: d })) }} />
          <button className="rounded border border-slate-300 px-2" onClick={() => onChange(applySettings(project, { cutoff: 'default' }))}>= start</button>
        </span>
      </label>
      <span className="text-slate-500">Row ruler: hover a row to follow it across the table and the Gantt; click to pin it.</span>
      <span className="text-slate-600">Hand-back: <b>{s.possessionEnd.toISOString().slice(0, 16).replace('T', ' ')}</b></span>
    </div>
  )
}

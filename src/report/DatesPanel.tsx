import { useEffect } from 'react'
import type { ProjectResult } from '../engine/schedule'
import { hoursToInput, inputToHours, patchActivity, setPlannedFinish, setPlannedStart, splitDateTime } from '../links/edit'
import type { Project } from '../model/types'
import { useNarrow } from '../model/useNarrow'
import { fmtShort } from './format'

export const DATES_W = 340
const lab = 'block text-xs font-semibold text-slate-600'
const inp = 'mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm font-normal text-slate-900'

/** A side window with the calendars of one activity: planned start / finish, actual start / finish (date + time) and the progress. */
export function DatesPanel({ project, result, loc, no, onChange, onClose }: {
  project: Project; result: ProjectResult; loc: number; no: number
  onChange: (p: Project) => void; onClose: () => void
}) {
  const narrow = useNarrow(600)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const acts = project.locations[loc].activities
  const k = acts.findIndex((x) => x.no === no)
  if (k < 0) return null
  const a = acts[k]
  const r = result.locations[loc].activities[k]
  const origin = result.settings.possessionStart
  const pr = a.pred > 0 ? result.locations[loc].activities.find((x) => x.no === a.pred) : undefined
  const predT = pr ? { startH: pr.plannedStartH, finishH: pr.plannedFinishH } : null
  const iso = (d: Date | null) => (d ? hoursToInput(origin, (d.getTime() - origin.getTime()) / 3_600_000) : '')
  const edit = (patch: Parameters<typeof patchActivity>[3]) => onChange(patchActivity(project, loc, no, patch))
  const actual = (kind: 'start' | 'finish', v: string) => {
    const h = inputToHours(origin, v)
    if (h == null) { edit(kind === 'start' ? { actualStartDate: null, actualStartTime: null } : { actualFinishDate: null, actualFinishTime: null }); return }
    const d = splitDateTime(new Date(origin.getTime() + Math.round(h * 60) * 60_000))
    edit(kind === 'start' ? { actualStartDate: d.date, actualStartTime: d.time } : { actualFinishDate: d.date, actualFinishTime: d.time, pct: 1 })
  }
  return (
    <aside style={{ width: narrow ? '100%' : DATES_W, top: 'var(--hdr, 0px)' }} className="no-print fixed bottom-0 right-0 z-50 max-w-full overflow-y-auto border-l border-slate-300 bg-white text-slate-800 shadow-2xl" aria-label="Activity dates">
      <div className="sticky top-0 z-10 flex items-start gap-2 bg-[#00778B] px-3 py-2 text-white">
        <div className="flex-1">
          <div className="text-xs opacity-80">{project.locations[loc].name}</div>
          <div className="text-sm font-bold">#{a.no} {a.name}</div>
          <div className="text-xs">forecast finish {fmtShort(r.carriedForecastFinish)}</div>
        </div>
        <button className="rounded border border-white/50 px-2 text-sm" onClick={onClose} title="Close (Esc)">✕</button>
      </div>
      <div className="space-y-3 p-3">
        <h3 className="bg-[#3D3935] px-2 py-1 text-xs font-bold text-white">PLANNED (the links stay, the lag / duration follow)</h3>
        <label className={lab}>Planned start
          <input className={inp} type="datetime-local" value={iso(r.plannedStart)}
            onChange={(e) => { const h = inputToHours(origin, e.target.value); if (h != null) onChange(setPlannedStart(project, loc, no, h, a.rel, predT, r.durationH)) }} />
        </label>
        <label className={lab}>Planned finish
          <input className={inp} type="datetime-local" value={iso(r.plannedFinish)}
            onChange={(e) => { const h = inputToHours(origin, e.target.value); const q = h == null ? null : setPlannedFinish(project, loc, no, r.plannedStartH, h, a.rel, predT); if (q) onChange(q) }} />
        </label>
        <h3 className="bg-[#768692] px-2 py-1 text-xs font-bold text-white">ACTUAL</h3>
        <label className={lab}>Actual start
          <input className={inp} type="datetime-local" value={iso(r.actualStart)} onChange={(e) => actual('start', e.target.value)} />
        </label>
        <label className={lab}>Actual finish (makes it 100 %)
          <input className={inp} type="datetime-local" value={iso(r.actualFinish)} onChange={(e) => actual('finish', e.target.value)} />
        </label>
        <label className={lab}>% complete
          <input className={inp} type="number" min={0} max={100} value={a.pct == null ? '' : Math.round(a.pct * 100)}
            onChange={(e) => edit({ pct: e.target.value === '' ? null : Math.min(1, Math.max(0, Number(e.target.value) / 100)) })} />
        </label>
        <div className="flex flex-wrap gap-2 text-xs">
          <button className="rounded border border-slate-400 px-2 py-1" onClick={() => edit({ actualStartDate: null, actualStartTime: null })}>Clear actual start</button>
          <button className="rounded border border-slate-400 px-2 py-1" onClick={() => edit({ actualFinishDate: null, actualFinishTime: null })}>Clear actual finish</button>
        </div>
      </div>
    </aside>
  )
}

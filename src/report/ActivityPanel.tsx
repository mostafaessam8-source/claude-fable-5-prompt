import { useEffect, useRef } from 'react'
import type { ProjectResult } from '../engine/schedule'
import { candidatePredecessors, candidateSuccessors, dateToInput, inputToDate, inputToTime, lagToKeepStart, patchActivity, RELS, successorsOf, timeToInput } from '../links/edit'
import type { ActivityInput, Project, Rel } from '../model/types'
import { activityTone } from './brand'
import { fmtShort, fmtVariance } from './format'

const inp = 'w-full rounded border border-slate-300 px-1.5 py-1 text-sm'
const lab = 'block text-xs font-semibold text-slate-500'
const h1 = (x: number) => `${x.toFixed(1)} h`

/** Click an activity → this panel: its times, its predecessor and its successors, all editable; the report updates live. */
export function ActivityPanel({ project, result, loc, no, onChange, onSelect, onClose }: {
  project: Project
  result: ProjectResult
  loc: number
  no: number
  onChange: (p: Project) => void
  onSelect: (no: number) => void
  onClose: () => void
}) {
  const acts = project.locations[loc].activities
  const k = acts.findIndex((a) => a.no === no)
  const baseStart = useRef<{ key: string; startH: number } | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  if (k < 0) return null

  const a = acts[k]
  const res = result.locations[loc].activities
  const r = res[k]
  const resOf = (n: number) => res[acts.findIndex((x) => x.no === n)]
  const key = `${loc}:${no}`
  // the planned start when the panel was opened on this activity: "keep the date" returns to it
  if (baseStart.current?.key !== key) baseStart.current = { key, startH: r.plannedStartH }
  const base = baseStart.current.startH

  const edit = (patch: Partial<ActivityInput>, n = no) => onChange(patchActivity(project, loc, n, patch))
  const num = (v: string): number | null => (v.trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v))
  const pred = a.pred > 0 ? acts.find((x) => x.no === a.pred) : undefined
  const predR = pred ? resOf(pred.no) : undefined
  const predTimes = predR ? { startH: predR.plannedStartH, finishH: predR.plannedFinishH } : null
  const succ = successorsOf(project, loc, no)
  const tone = activityTone(r.status)
  const when = (x: { plannedStart: Date; plannedFinish: Date; plannedStartH: number; plannedFinishH: number }) =>
    `${fmtShort(x.plannedStart)} → ${fmtShort(x.plannedFinish)}`

  return (
    <aside className="no-print fixed inset-y-0 right-0 z-50 w-[430px] max-w-full overflow-y-auto border-l border-slate-300 bg-white text-slate-800 shadow-2xl" aria-label="Activity details">
      <div className="sticky top-0 z-10 flex items-start gap-2 bg-[#00778B] px-3 py-2 text-white">
        <div className="flex-1">
          <div className="text-xs opacity-80">{project.locations[loc].name}</div>
          <div className="text-sm font-bold">#{a.no} {a.name}</div>
        </div>
        <button className="rounded border border-white/50 px-2 text-sm" onClick={onClose} title="Close (Esc)">✕</button>
      </div>

      <div className="space-y-4 p-3">
        {/* ---- this activity ---- */}
        <section>
          <h3 className="mb-1 bg-[#3D3935] px-2 py-1 text-xs font-bold text-white">THIS ACTIVITY</h3>
          <label className={lab}>Name<input className={inp} value={a.name} onChange={(e) => edit({ name: e.target.value })} /></label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className={lab}>Duration (h)
              <input className={inp} type="number" min={0} step={0.25} value={a.durationH ?? ''} onChange={(e) => edit({ durationH: num(e.target.value) })} />
            </label>
            <label className={lab}>% complete
              <input className={inp} type="number" min={0} max={100} value={a.pct == null ? '' : Math.round(a.pct * 100)}
                onChange={(e) => { const v = num(e.target.value); edit({ pct: v == null ? null : Math.min(1, Math.max(0, v / 100)) }) }} />
            </label>
          </div>
          <div className="mt-2 rounded bg-[#F2F8F9] p-2 text-xs">
            <div><b>Planned</b> {when(r)} <span className="text-slate-500">({h1(r.plannedStartH)} → {h1(r.plannedFinishH)})</span></div>
            <div><b>Forecast finish</b> {fmtShort(r.carriedForecastFinish)} <span className="text-slate-500">({fmtVariance(r.carried)})</span></div>
            <div className="mt-1"><span className="rounded px-1.5 py-0.5 text-[11px] font-bold" style={{ background: tone.bg, color: tone.fg }}>{r.status}</span></div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className={lab}>Actual start — date<input className={inp} type="date" value={dateToInput(a.actualStartDate)} onChange={(e) => edit({ actualStartDate: inputToDate(e.target.value) })} /></label>
            <label className={lab}>time<input className={inp} type="time" value={timeToInput(a.actualStartTime)} onChange={(e) => edit({ actualStartTime: inputToTime(e.target.value) })} /></label>
            <label className={lab}>Actual finish — date<input className={inp} type="date" value={dateToInput(a.actualFinishDate)} onChange={(e) => edit({ actualFinishDate: inputToDate(e.target.value) })} /></label>
            <label className={lab}>time<input className={inp} type="time" value={timeToInput(a.actualFinishTime)} onChange={(e) => edit({ actualFinishTime: inputToTime(e.target.value) })} /></label>
          </div>
          <label className={`${lab} mt-2`}>Remarks<input className={inp} value={a.remarks} onChange={(e) => edit({ remarks: e.target.value })} /></label>
        </section>

        {/* ---- predecessor ---- */}
        <section>
          <h3 className="mb-1 bg-[#768692] px-2 py-1 text-xs font-bold text-white">PREDECESSOR (what this one follows)</h3>
          <label className={lab}>Follows
            <select className={inp} value={a.pred} onChange={(e) => edit({ pred: Number(e.target.value) })}>
              <option value={0}>— possession start (hour 0) —</option>
              {candidatePredecessors(project, loc, no).map((c) => <option key={c.no} value={c.no}>#{c.no} {c.name}</option>)}
            </select>
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className={lab}>Relationship
              <select className={inp} value={a.rel} onChange={(e) => edit({ rel: e.target.value as Rel })}>
                {RELS.map((x) => <option key={x}>{x}</option>)}
              </select>
            </label>
            <label className={lab}>Lag (h, may be negative)
              <input className={inp} type="number" step={0.25} value={a.lagH} onChange={(e) => edit({ lagH: num(e.target.value) ?? 0 })} />
            </label>
          </div>
          {pred && predR ? (
            <div className="mt-2 rounded bg-[#F2F8F9] p-2 text-xs">
              <div><b>#{pred.no} {pred.name}</b></div>
              <div>Planned {when(predR)}</div>
              <div>Forecast finish {fmtShort(predR.carriedForecastFinish)} <span className="text-slate-500">({fmtVariance(predR.carried)})</span></div>
              <button className="mt-1 rounded border border-[#00778B] px-2 py-0.5 font-semibold text-[#00778B]" onClick={() => onSelect(pred.no)}>Open predecessor</button>
            </div>
          ) : <p className="mt-2 text-xs text-slate-500">Starts at the possession start{a.lagH ? ` ${a.lagH > 0 ? '+' : ''}${a.lagH} h` : ''}.</p>}
          {r.linkBad && <p className="mt-1 text-xs font-semibold text-[#CB2C30]">The link is not valid: the predecessor must be an earlier activity.</p>}
          <button className="mt-2 rounded border border-slate-400 px-2 py-0.5 text-xs"
            onClick={() => edit({ lagH: lagToKeepStart(base, a.rel, predTimes, r.durationH) })}
            title="Set the lag so this activity starts at the planned time it had when you opened it">
            Set the lag to keep the start I opened it with ({h1(base)})
          </button>
        </section>

        {/* ---- successors ---- */}
        <section>
          <h3 className="mb-1 bg-[#768692] px-2 py-1 text-xs font-bold text-white">SUCCESSORS (what follows this one)</h3>
          {succ.length === 0 && <p className="text-xs text-slate-500">Nothing follows this activity.</p>}
          {succ.map((s) => {
            const sr = resOf(s.no)
            return (
              <div key={s.no} className="mb-2 rounded border border-slate-300 p-2 text-xs">
                <div className="font-bold">#{s.no} {s.name}</div>
                <div className="text-slate-600">Planned {when(sr)} · forecast {fmtShort(sr.carriedForecastFinish)} ({fmtVariance(sr.carried)})</div>
                <div className="mt-1 grid grid-cols-[70px_80px_1fr] items-end gap-2">
                  <label className={lab}>Rel
                    <select className={inp} value={s.rel} onChange={(e) => edit({ rel: e.target.value as Rel }, s.no)}>{RELS.map((x) => <option key={x}>{x}</option>)}</select>
                  </label>
                  <label className={lab}>Lag (h)
                    <input className={inp} type="number" step={0.25} value={s.lagH} onChange={(e) => edit({ lagH: num(e.target.value) ?? 0 }, s.no)} />
                  </label>
                  <div className="flex gap-1">
                    <button className="rounded border border-[#00778B] px-2 py-1 font-semibold text-[#00778B]" onClick={() => onSelect(s.no)}>Open</button>
                    <button className="rounded border border-[#CB2C30] px-2 py-1 font-semibold text-[#CB2C30]" title="Stop following this activity; its planned start stays where it is"
                      onClick={() => edit({ pred: 0, rel: 'FS', lagH: lagToKeepStart(sr.plannedStartH, 'FS', null, sr.durationH) }, s.no)}>Unlink</button>
                  </div>
                </div>
              </div>
            )
          })}
          {candidateSuccessors(project, loc, no).length > 0 && (
            <label className={lab}>Link another activity so it follows this one
              <select className={inp} value="" onChange={(e) => {
                const n = Number(e.target.value)
                if (!n) return
                const sr = resOf(n)
                // finish-to-start, with the lag that keeps its planned start where it is (set the lag to 0 to make it follow)
                edit({ pred: no, rel: 'FS', lagH: lagToKeepStart(sr.plannedStartH, 'FS', { startH: r.plannedStartH, finishH: r.plannedFinishH }, sr.durationH) }, n)
              }}>
                <option value="">— choose —</option>
                {candidateSuccessors(project, loc, no).map((c) => <option key={c.no} value={c.no}>#{c.no} {c.name}</option>)}
              </select>
            </label>
          )}
        </section>
      </div>
    </aside>
  )
}

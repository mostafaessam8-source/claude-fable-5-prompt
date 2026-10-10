import { useEffect, useRef } from 'react'
import type { ProjectResult } from '../engine/schedule'
import {
  actualProblems, candidatePredecessors, deleteActivity, hoursToInput, inputToHours, setPlannedFinish, setPlannedStart, candidateSuccessors, dateToInput, inputToDate, inputToTime, lagToKeepStart, patchActivity,
  RELS, splitDateTime, successorsOf, timeToInput,
} from '../links/edit'
import type { ActivityInput, Project, Rel } from '../model/types'
import { OFFLINE } from '../offline/offline'
import { activityTone } from './brand'
import { fmtShort, fmtVariance } from './format'

export type PanelTab = 'baseline' | 'actual'
/** Width of the panel in px: the report leaves this much room on the right while the panel is open. */
export const PANEL_W = 430

const inp = 'w-full rounded border border-slate-300 px-1.5 py-1 text-sm'
const lab = 'block text-xs font-semibold text-slate-500'
const h1 = (x: number) => `${x.toFixed(1)} h`
const signed = (x: number) => `${x > 0 ? '+' : ''}${x.toFixed(1)} h`

/**
 * Click an activity → this panel, in two tabs:
 *   Baseline — the plan: duration, predecessor (relationship, lag) and successors;
 *   Actual   — what happened: actual start/finish, % complete, remarks, against the baseline.
 * Every edit recomputes the plan and the forecast and the report updates live.
 */
export function ActivityPanel({ project, result, loc, no, tab, onTab, onChange, onSelect, onClose }: {
  project: Project
  result: ProjectResult
  loc: number
  no: number
  tab: PanelTab
  onTab: (t: PanelTab) => void
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
  const when = (x: { plannedStart: Date; plannedFinish: Date }) => `${fmtShort(x.plannedStart)} → ${fmtShort(x.plannedFinish)}`
  const cutoff = result.settings.cutoff
  const origin = result.settings.possessionStart
  const hoursBetween = (x: Date, y: Date) => (x.getTime() - y.getTime()) / 3_600_000
  // patches (not edits): several changes must go out as ONE edit, or the second would overwrite the first
  const startPatch = (d: Date | null): Partial<ActivityInput> =>
    d ? { actualStartDate: splitDateTime(d).date, actualStartTime: splitDateTime(d).time } : { actualStartDate: null, actualStartTime: null }
  const finishPatch = (d: Date): Partial<ActivityInput> => ({ actualFinishDate: splitDateTime(d).date, actualFinishTime: splitDateTime(d).time, pct: 1 })
  const problems = actualProblems(a, r.actualStart, r.actualFinish, result.settings.possessionStart)

  const tabBtn = (t: PanelTab, label: string) => (
    <button key={t} onClick={() => onTab(t)}
      className={`flex-1 px-3 py-2 text-sm font-bold ${tab === t ? 'border-b-4 border-[#F1B434] bg-white text-[#00778B]' : 'bg-[#E6F1F4] text-slate-500'}`}>{label}</button>
  )

  return (
    <aside style={{ width: PANEL_W, top: 'var(--hdr, 0px)' }} className="no-print fixed bottom-0 right-0 z-50 max-w-full overflow-y-auto border-l border-slate-300 bg-white text-slate-800 shadow-2xl" aria-label="Activity details">
      <div className="sticky top-0 z-10">
        <div className="flex items-start gap-2 bg-[#00778B] px-3 py-2 text-white">
          <div className="flex-1">
            <div className="text-xs opacity-80">{project.locations[loc].name}</div>
            <div className="text-sm font-bold">#{a.no} {a.name}</div>
            <span className="mt-1 inline-block rounded px-1.5 py-0.5 text-[11px] font-bold" style={{ background: tone.bg, color: tone.fg }}>{r.status}</span>
            <span className="ml-2 text-xs">forecast {fmtShort(r.carriedForecastFinish)} ({fmtVariance(r.carried)})</span>
          </div>
          <button className="rounded border border-white/50 px-2 text-sm" onClick={onClose} title="Close (Esc)">✕</button>
        </div>
        <div className="flex border-b border-slate-300" role="tablist">{tabBtn('baseline', 'Baseline (plan)')}{tabBtn('actual', 'Actual')}</div>
      </div>

      {tab === 'baseline' && (
        <fieldset disabled={!!OFFLINE} className="m-0 min-w-0 space-y-4 border-0 p-3" role="tabpanel" aria-label="Baseline">
          <section>
            <h3 className="mb-1 bg-[#3D3935] px-2 py-1 text-xs font-bold text-white">THE ACTIVITY'S PLAN</h3>
            <label className={lab}>Name<input className={inp} value={a.name} onChange={(e) => edit({ name: e.target.value })} /></label>
            <label className={`${lab} mt-2`}>Duration (h)
              <input className={inp} type="number" min={0} step={0.25} value={a.durationH ?? ''} onChange={(e) => edit({ durationH: num(e.target.value) })} />
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className={lab}>Planned start
                <input className={inp} type="datetime-local" value={hoursToInput(origin, r.plannedStartH)}
                  onChange={(e) => { const h = inputToHours(origin, e.target.value); if (h != null) onChange(setPlannedStart(project, loc, no, h, a.rel, predTimes, r.durationH)) }} />
              </label>
              <label className={lab}>Planned finish
                <input className={inp} type="datetime-local" value={hoursToInput(origin, r.plannedFinishH)}
                  onChange={(e) => { const h = inputToHours(origin, e.target.value); const q = h == null ? null : setPlannedFinish(project, loc, no, r.plannedStartH, h, a.rel, predTimes); if (q) onChange(q) }} />
              </label>
            </div>
            <p className="mt-1 text-xs text-slate-500">Type a date and the link is kept: the lag changes so the link gives exactly that date (a new finish also sets the duration).</p>
          </section>

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

          {!OFFLINE && <section>
            <button className="rounded border border-[#CB2C30] px-2 py-1 text-xs font-semibold text-[#CB2C30]"
              onClick={() => {
                const nf = succ.length ? ` ${succ.length} activit${succ.length === 1 ? 'y that follows' : 'ies that follow'} it will be unlinked and keep their planned start.` : ''
                if (!window.confirm(`Delete #${a.no} ${a.name}?${nf}`)) return
                onChange(deleteActivity(project, loc, no, (n) => resOf(n).plannedStartH))
                onClose()
              }}>Delete this activity</button>
          </section>}
        </fieldset>
      )}

      {tab === 'actual' && (
        <div className="space-y-4 p-3" role="tabpanel" aria-label="Actual">
          <section>
            <h3 className="mb-1 bg-[#3D3935] px-2 py-1 text-xs font-bold text-white">ACTUAL vs BASELINE</h3>
            <table className="w-full text-xs">
              <thead><tr className="text-left text-slate-500"><th /><th>Baseline</th><th>Actual</th><th>Δ</th></tr></thead>
              <tbody>
                <tr>
                  <td className="font-semibold">Start</td><td>{fmtShort(r.plannedStart)}</td>
                  <td>{r.actualStart ? fmtShort(r.actualStart) : '—'}</td>
                  <td className="font-bold">{r.actualStart ? signed(hoursBetween(r.actualStart, r.plannedStart)) : ''}</td>
                </tr>
                <tr>
                  <td className="font-semibold">Finish</td><td>{fmtShort(r.plannedFinish)}</td>
                  <td>{r.actualFinish ? fmtShort(r.actualFinish) : '—'}</td>
                  <td className="font-bold">{r.actualFinish ? signed(hoursBetween(r.actualFinish, r.plannedFinish)) : ''}</td>
                </tr>
                <tr>
                  <td className="font-semibold">Duration</td><td>{h1(r.durationH)}</td>
                  <td>{r.actualStart && r.actualFinish ? h1(hoursBetween(r.actualFinish, r.actualStart)) : '—'}</td>
                  <td className="font-bold">{r.actualStart && r.actualFinish ? signed(hoursBetween(r.actualFinish, r.actualStart) - r.durationH) : ''}</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-1 text-xs text-slate-600">Forecast finish <b>{fmtShort(r.carriedForecastFinish)}</b> ({fmtVariance(r.carried)}) · progress counted: {Math.round(r.effectivePct * 100)} %</p>
          </section>

          <section>
            <h3 className="mb-1 bg-[#768692] px-2 py-1 text-xs font-bold text-white">WHAT HAPPENED</h3>
            <div className="grid grid-cols-2 gap-2">
              <label className={lab}>Actual start — date<input className={inp} type="date" value={dateToInput(a.actualStartDate)} onChange={(e) => edit({ actualStartDate: inputToDate(e.target.value) })} /></label>
              <label className={lab}>time<input className={inp} type="time" value={timeToInput(a.actualStartTime)} onChange={(e) => edit({ actualStartTime: inputToTime(e.target.value) })} /></label>
              <label className={lab}>Actual finish — date<input className={inp} type="date" value={dateToInput(a.actualFinishDate)} onChange={(e) => edit({ actualFinishDate: inputToDate(e.target.value) })} /></label>
              <label className={lab}>time<input className={inp} type="time" value={timeToInput(a.actualFinishTime)} onChange={(e) => edit({ actualFinishTime: inputToTime(e.target.value) })} /></label>
            </div>
            <label className={`${lab} mt-2`}>% complete (an actual finish makes it 100 %)
              <input className={inp} type="number" min={0} max={100} value={a.pct == null ? '' : Math.round(a.pct * 100)}
                onChange={(e) => { const v = num(e.target.value); edit({ pct: v == null ? null : Math.min(1, Math.max(0, v / 100)) }) }} />
            </label>
            <label className={`${lab} mt-2`}>Remarks<input className={inp} value={a.remarks} onChange={(e) => edit({ remarks: e.target.value })} /></label>
            {problems.map((m) => <p key={m} className="mt-1 text-xs font-semibold text-[#CB2C30]">{m} The row is flagged and counts as 0 %.</p>)}
          </section>

          <section>
            <h3 className="mb-1 bg-[#768692] px-2 py-1 text-xs font-bold text-white">QUICK ACTIONS</h3>
            <div className="flex flex-wrap gap-1 text-xs">
              <button className="rounded border border-slate-400 px-2 py-1" onClick={() => edit(startPatch(cutoff))}>Started at the report cut-off</button>
              <button className="rounded border border-slate-400 px-2 py-1" onClick={() => edit(startPatch(r.plannedStart))}>Started as planned</button>
              <button className="rounded border border-slate-400 px-2 py-1" onClick={() => edit({ ...(r.actualStart ? {} : startPatch(r.plannedStart)), ...finishPatch(cutoff) })}>Finished at the cut-off (100 %)</button>
              <button className="rounded border border-slate-400 px-2 py-1" onClick={() => edit({ ...(r.actualStart ? {} : startPatch(r.plannedStart)), ...finishPatch(r.plannedFinish) })}>Finished as planned (100 %)</button>
              <button className="rounded border border-[#CB2C30] px-2 py-1 text-[#CB2C30]"
                onClick={() => edit({ actualStartDate: null, actualStartTime: null, actualFinishDate: null, actualFinishTime: null, pct: null })}>Clear the actuals</button>
            </div>
            <p className="mt-1 text-xs text-slate-500">The report cut-off is {fmtShort(cutoff)} (change it in the settings bar above the report).</p>
          </section>
        </div>
      )}
    </aside>
  )
}

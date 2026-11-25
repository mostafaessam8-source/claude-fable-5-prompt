import { useState } from 'react'
import type { ProjectResult } from '../engine/schedule'
import { patchActivity } from '../links/edit'
import { applySettings, floatingNow } from '../model/settings'
import type { Project, ProtocolData } from '../model/types'
import { fmtLong, fmtShort, fmtVariance, hours1, pct } from '../report/format'
import { totalAllLocations } from '../report/summary'
import { DocFooter, DocHeader } from './DocBlocks'
import { docControl, DOC_DEFAULTS } from './docControl'
import { DELAY_CAUSES } from './lists'
import { LEVELS, LEVEL_INFO, levelOf, nextUpdate, worst, type Level } from './status'

type Form = 'status' | 'notice' | 'recovery' | 'raci' | 'doc'
const TEAL = '#00778B'
const lab = 'block text-xs font-semibold text-slate-600'
const inp = 'mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-sm font-normal'

/** A free-text field of a form: grows with its text, prints as plain text. */
function Field({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <textarea className="form-field" value={value} placeholder={placeholder} rows={1} onChange={(e) => onChange(e.target.value)} />
}

/** An A4 portrait page of the SAR protocol: document header, title, body, document footer. */
function FormPage({ project, title, page, children }: { project: Project; title: string; page: number; children: React.ReactNode }) {
  return (
    <section className="form-page">
      <DocHeader doc={docControl(project.settings)} logoH={30} size={9} />
      <h2 style={{ color: TEAL, fontSize: 16, fontWeight: 700, margin: '18px 0 12px 24px' }}>{title}</h2>
      <div style={{ margin: '0 24px' }}>{children}</div>
      <DocFooter doc={docControl(project.settings)} page={page} size={8} />
    </section>
  )
}

/** Label | value rows, like the appendices of the protocol. */
function Rows({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <table className="form-table">
      <tbody>{rows.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody>
    </table>
  )
}

function LevelTable() {
  return (
    <table className="form-table" style={{ marginTop: 16 }}>
      <thead><tr><th style={{ background: TEAL, color: '#fff' }}>Status</th><th style={{ background: TEAL, color: '#fff' }}>Trigger</th><th style={{ background: TEAL, color: '#fff' }}>Minimum Requirement</th><th style={{ background: TEAL, color: '#fff' }}>Update</th></tr></thead>
      <tbody>{LEVELS.map((l) => <tr key={l}><td style={{ background: LEVEL_INFO[l].bg, color: LEVEL_INFO[l].fg, fontWeight: 700 }}>{LEVEL_INFO[l].label}</td><td>{LEVEL_INFO[l].trigger}</td><td>{LEVEL_INFO[l].requirement}</td><td>every {LEVEL_INFO[l].everyMin >= 60 ? `${LEVEL_INFO[l].everyMin / 60} h` : `${LEVEL_INFO[l].everyMin} min`}</td></tr>)}</tbody>
    </table>
  )
}

const RACI: [string, ...string[]][] = [
  ['Executing works', 'R/A', 'I', 'I', 'C'], ['Monitor progress', 'R/A', 'C', 'I', 'I'], ['Identify/report delay', 'R/A', 'I/C', 'I', 'I'],
  ['Forecast/recovery', 'R/A', 'C', 'C', 'C'], ['Mobilize resources', 'R/A', 'I', 'I', 'I'], ['Internal coordination', 'C', 'R/A', 'C', 'C'],
  ['Operational decision', 'C', 'C', 'R/A', 'C'], ['Technical approval', 'C', 'C', 'I', 'R/A'], ['Final handback readiness', 'R', 'A', 'C', 'C'],
]

/** The "Protocol" tab: Appendix A-D of the SAR shutdown protocol, filled in from the tracker. Print it (Print / PDF) for the forms as A4 pages. */
export function ProtocolView({ project, result, onChange }: { project: Project; result: ProjectResult; onChange: (p: Project) => void }) {
  const [form, setForm] = useState<Form>('status')
  const [li, setLi] = useState(0)
  const [ai, setAi] = useState<number | null>(null)
  const now = floatingNow()
  const s = project.settings
  const levels = result.locations.map((l) => levelOf(l, result.cutoffH <= 0))
  const overall: Level = worst(levels)
  const total = totalAllLocations(result.locations)
  const lastOrNow = s.shutdown?.lastUpdate ?? now
  const next = nextUpdate(lastOrNow, overall)
  const proto: ProtocolData = project.protocol ?? {}
  const setProto = (p: ProtocolData) => onChange({ ...project, protocol: p })
  const loc = result.locations[Math.min(li, result.locations.length - 1)]
  const locIdx = Math.min(li, result.locations.length - 1)
  const acts = loc?.activities ?? []
  // the activity of the delay notification: the chosen one, else the first that is slipping, else the first
  const defaultA = Math.max(0, acts.findIndex((a) => a.carried > 0.1))
  const aIdx = ai != null && ai < acts.length ? ai : defaultA
  const act = acts[aIdx]
  const nKey = `${locIdx}:${act?.no}`
  const notice = proto.notices?.[nKey] ?? {}
  const plan = proto.plans?.[String(locIdx)] ?? {}
  const st = proto.status ?? {}
  const manager = s.shutdown?.manager || '—'
  const locLevel = loc ? levelOf(loc, result.cutoffH <= 0) : 'Green'
  const incomplete = (ls: typeof acts) => ls.filter((a) => a.effectivePct < 1)
  const tab = (f: Form, label: string) => (
    <button key={f} onClick={() => setForm(f)} className={`rounded px-3 py-1 text-sm font-semibold ${form === f ? 'bg-[#00778B] text-white' : 'border border-slate-300 bg-white text-slate-700'}`}>{label}</button>
  )

  return (
    <div className="protocol-wrap">
      <div className="no-print flex flex-wrap items-center gap-2 bg-white p-3">
        {tab('status', 'D · Shutdown Status Update')}{tab('notice', 'B · Delay Notification')}{tab('recovery', 'C · Recovery Plan')}{tab('raci', 'A · RACI')}{tab('doc', 'Document control')}
        {(form === 'notice' || form === 'recovery') && (
          <label className="ml-4 flex items-center gap-1 text-sm">Location
            <select className="rounded border border-slate-300 px-2 py-1" value={locIdx} onChange={(e) => { setLi(Number(e.target.value)); setAi(null) }}>
              {result.locations.map((l, i) => <option key={i} value={i}>{l.name}</option>)}
            </select>
          </label>
        )}
        {form === 'notice' && (
          <label className="flex items-center gap-1 text-sm">Activity
            <select className="max-w-xs rounded border border-slate-300 px-2 py-1" value={aIdx} onChange={(e) => setAi(Number(e.target.value))}>
              {acts.map((a, i) => <option key={a.no} value={i}>#{a.no} {a.name}{a.carried > 0.1 ? `  (+${hours1(a.carried)})` : ''}</option>)}
            </select>
          </label>
        )}
        <span className="ml-auto text-xs text-slate-500">Use <b>Print / PDF</b> for the form as an A4 page.</span>
      </div>

      {form === 'doc' && (
        <div className="no-print mx-auto max-w-xl space-y-2 p-4">
          <p className="text-sm text-slate-600">The document control block printed in the header and footer of every report page and form. Leave a field empty to use the protocol's own value.</p>
          {(['fn', 'dept', 'title', 'docNo', 'rev', 'effective'] as const).map((k) => (
            <label key={k} className={lab}>{{ fn: 'Function', dept: 'Department', title: 'Document title', docNo: 'Document no.', rev: 'Revision no.', effective: 'Effective date' }[k]}
              <input className={inp} value={s.shutdown?.doc?.[k] ?? ''} placeholder={DOC_DEFAULTS[k]}
                onChange={(e) => onChange(applySettings(project, { shutdown: { doc: { ...s.shutdown?.doc, [k]: e.target.value } } }))} />
            </label>
          ))}
        </div>
      )}

      {form === 'status' && (
        <FormPage project={project} title="Appendix D – Shutdown Status Update" page={1}>
          <Rows rows={[
            ['Project / Location', `${s.projectName} — ${result.locations.map((l) => l.name.split(/[–-]/)[0].trim()).join(', ')}`],
            ['Shutdown Ref', s.shutdown?.ref || '—'],
            ['Update Time', fmtLong(lastOrNow)],
            ['Overall Progress', pct(total.actualPct)],
            ['Planned', pct(total.planPct)],
            ['Variance', `${((total.actualPct - total.planPct) * 100).toFixed(0)} pts`],
            ['Delay', `${fmtVariance(total.variance)} (worst location)`],
            ['Current Forecast', `${fmtLong(result.locations.length ? result.locations.reduce((a, l) => (l.forecastFinish > a ? l.forecastFinish : a), result.locations[0].forecastFinish) : s.possessionEnd)}  ·  hand-back ${fmtLong(s.possessionEnd)}`],
            ['Outstanding Activities', `${result.locations.reduce((n, l) => n + incomplete(l.activities).length, 0)} not complete` + (result.locations.some((l) => l.activities.some((a) => a.carried > 0.1)) ? ` — slipping: ${result.locations.flatMap((l) => l.activities.filter((a) => a.carried > 0.1).map((a) => `${l.name.split(/[–-]/)[0].trim()} #${a.no}`)).slice(0, 10).join(', ')}` : '')],
            ['Recovery', <Field key="r" value={st.recovery ?? ''} onChange={(recovery) => setProto({ ...proto, status: { ...st, recovery } })} />],
            ['SAR Support', <Field key="s" value={st.sarSupport ?? ''} onChange={(sarSupport) => setProto({ ...proto, status: { ...st, sarSupport } })} />],
            ['Operational Impact', <Field key="o" value={st.operational ?? ''} onChange={(operational) => setProto({ ...proto, status: { ...st, operational } })} />],
            ['Next Update', next ? fmtLong(next) : 'log an update first (Report tab → Log update now)'],
            ['Status: Green / Yellow / Orange / Red', <span key="l" style={{ background: LEVEL_INFO[overall].bg, color: LEVEL_INFO[overall].fg, fontWeight: 800, padding: '1px 12px' }}>{LEVEL_INFO[overall].label}</span>],
          ]} />
          <LevelTable />
          <p style={{ fontSize: 10, marginTop: 10 }}><b>Note:</b> * Shutdown Status Update Template requires modification in accordance with the specific shutdown locations and approval obtained from SAR.</p>
        </FormPage>
      )}

      {form === 'notice' && loc && act && (
        <FormPage project={project} title="Appendix B – Delay Notification Template" page={1}>
          <Rows rows={[
            ['Project / Location', `${s.projectName} — ${loc.name}`],
            ['Shutdown Ref', s.shutdown?.ref || '—'],
            ['Date / Time', fmtLong(now)],
            ['Activity', `#${act.no} ${act.name}${act.holdPoint ? `  (hold point: ${act.holdPoint})` : ''}`],
            ['Delay', act.carried > 0.1 ? `${hours1(act.carried)} behind plan (planned finish ${fmtShort(act.plannedFinish)}, forecast ${fmtShort(act.carriedForecastFinish)})` : 'no delay at the moment'],
            ['Cause', (
              <select key="c" className="form-field" value={act.delayCause ?? ''} onChange={(e) => onChange(patchActivity(project, locIdx, act.no, { delayCause: e.target.value || undefined }))}>
                <option value="">—</option>{DELAY_CAUSES.map((c) => <option key={c}>{c}</option>)}
              </select>
            )],
            ['Impact / Milestone', <Field key="i" value={notice.impact ?? ''} placeholder={`Hand-back buffer ${hours1(loc.bufferToHandback)}; location forecast ${fmtShort(loc.forecastFinish)}`} onChange={(impact) => setProto({ ...proto, notices: { ...proto.notices, [nKey]: { ...notice, impact } } })} />],
            ['Original Handback', fmtLong(s.possessionEnd)],
            ['Current Forecast', fmtLong(loc.forecastFinish)],
            ['Recovery Action', <Field key="ra" value={notice.recovery ?? ''} onChange={(recovery) => setProto({ ...proto, notices: { ...proto.notices, [nKey]: { ...notice, recovery } } })} />],
            ['Additional Resources', <Field key="ar" value={notice.resources ?? ''} onChange={(resources) => setProto({ ...proto, notices: { ...proto.notices, [nKey]: { ...notice, resources } } })} />],
            ['SAR Support Required', <Field key="ss" value={notice.sarSupport ?? ''} placeholder="the exact action, the responsible department, the time it is needed and the consequence if not done" onChange={(sarSupport) => setProto({ ...proto, notices: { ...proto.notices, [nKey]: { ...notice, sarSupport } } })} />],
            ['Next Update', next ? fmtLong(next) : '—'],
            ['Contractor Responsible Manager', manager],
          ]} />
        </FormPage>
      )}

      {form === 'recovery' && loc && (
        <FormPage project={project} title="Appendix C – Recovery Plan Template" page={1}>
          <Rows rows={[
            ['Project / Location', `${s.projectName} — ${loc.name}`],
            ['Current Status', <span key="s"><b style={{ background: LEVEL_INFO[locLevel].bg, color: LEVEL_INFO[locLevel].fg, padding: '1px 10px' }}>{LEVEL_INFO[locLevel].label}</b> &nbsp; {loc.status} · buffer to hand-back {hours1(loc.bufferToHandback)} · actual {pct(loc.actualPct)} vs plan {pct(loc.planPct)}</span>],
            ['Delay / Root Cause', acts.filter((a) => a.carried > 0.1).map((a) => `#${a.no} ${a.name} (+${hours1(a.carried)})${a.delayCause ? ` — ${a.delayCause}` : ''}`).join('; ') || 'no delay at the moment'],
            ['Remaining Activities', `${incomplete(acts).length} of ${acts.length}: ${incomplete(acts).slice(0, 8).map((a) => `#${a.no}`).join(', ')}${incomplete(acts).length > 8 ? ' …' : ''}`],
            ['Critical Path', <Field key="cp" value={plan.criticalPath ?? ''} onChange={(criticalPath) => setProto({ ...proto, plans: { ...proto.plans, [locIdx]: { ...plan, criticalPath } } })} />],
            ['Recovery Measures', <Field key="m" value={plan.measures ?? ''} onChange={(measures) => setProto({ ...proto, plans: { ...proto.plans, [locIdx]: { ...plan, measures } } })} />],
            ['Additional Resources', <Field key="r" value={plan.resources ?? ''} onChange={(resources) => setProto({ ...proto, plans: { ...proto.plans, [locIdx]: { ...plan, resources } } })} />],
            ['Revised Forecast', `${fmtLong(loc.forecastFinish)}  ·  hand-back ${fmtLong(s.possessionEnd)}`],
            ['SAR Support Required', <Field key="ss" value={plan.sarSupport ?? ''} onChange={(sarSupport) => setProto({ ...proto, plans: { ...proto.plans, [locIdx]: { ...plan, sarSupport } } })} />],
            ['Update Frequency', `every ${LEVEL_INFO[locLevel].everyMin >= 60 ? `${LEVEL_INFO[locLevel].everyMin / 60} h` : `${LEVEL_INFO[locLevel].everyMin} min`} (${LEVEL_INFO[locLevel].label})`],
            ['Next Update', nextUpdate(lastOrNow, locLevel) ? fmtLong(nextUpdate(lastOrNow, locLevel)!) : '—'],
            ['Contractor Responsible Manager', manager],
          ]} />
        </FormPage>
      )}

      {form === 'raci' && (
        <FormPage project={project} title="Appendix A – RACI" page={1}>
          <table className="form-table">
            <thead><tr>{['Activity', 'Contractor', 'SAR PM', 'Operations', 'Engineering'].map((h) => <th key={h} style={{ background: TEAL, color: '#fff' }}>{h}</th>)}</tr></thead>
            <tbody>{RACI.map(([a, ...r]) => <tr key={a}><td style={{ fontWeight: 600 }}>{a}</td>{r.map((x, i) => <td key={i} style={{ textAlign: 'center' }}>{x}</td>)}</tr>)}</tbody>
          </table>
          <p style={{ fontSize: 10, marginTop: 8 }}>R = Responsible · A = Accountable · C = Consulted · I = Informed</p>
        </FormPage>
      )}
    </div>
  )
}

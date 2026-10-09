import type { ProjectResult } from '../engine/schedule'
import { fromHours } from '../engine/schedule'
import type { SiteLayout } from '../layout/parse'
import { C, locationTone } from './brand'
import { fmtLong, fmtShort, fmtVariance, hours1, pct, varianceTone } from './format'
import { totalAllLocations } from './summary'

const varColour = { late: C.red, early: C.blue, ok: C.black }

function Band({ children, bg = C.black, size = 11, pad = '4px 12px' }: { children: React.ReactNode; bg?: string; size?: number; pad?: string }) {
  return <div style={{ background: bg, color: '#fff', fontWeight: 700, fontSize: size, padding: pad, letterSpacing: 0.3 }}>{children}</div>
}

const COLS = '190px 84px 92px 92px 96px 44px 44px 76px 1fr'

export function Cover({ result }: { result: ProjectResult; layouts?: SiteLayout[] }) {
  const s = result.settings
  const origin = s.possessionStart
  const total = totalAllLocations(result.locations)
  const durH = result.possessionEndH
  const elapsed = Math.min(durH, Math.max(0, result.cutoffH))
  const remaining = durH - elapsed
  const dataDateFrac = Math.min(1, Math.max(0, result.cutoffH / durH))

  const head = ['Location', 'Status', 'Planned Finish', 'Forecast Finish', 'Time Variance', 'Plan %', 'Actual %', 'Buffer to Hand-back']
  const labelStyle = { color: C.blue, fontWeight: 700, fontSize: 9, textTransform: 'uppercase' as const, width: 150 }

  const row = (label: string, body: React.ReactNode, bg: string) => (
    <div style={{ display: 'flex', background: bg, padding: '3px 12px', fontSize: 11, alignItems: 'center' }}>
      <span style={labelStyle}>{label}</span>
      <span style={{ fontWeight: 700, color: C.black }}>{body}</span>
    </div>
  )

  return (
    <>
      <Band size={12} pad="5px 12px"><div style={{ textAlign: 'center' }}>{s.projectName}</div></Band>
      <div style={{ background: C.blue, color: '#fff', fontWeight: 800, fontSize: 24, textAlign: 'center', padding: '5px 0' }}>{s.reportTitle}</div>
      <div style={{ background: C.tint2, color: C.black, fontWeight: 700, fontSize: 11, textAlign: 'center', padding: '4px 0' }}>{s.subtitle}</div>
      <div style={{ marginTop: 6 }}>
        {row('Report generated', <>{fmtLong(s.cutoff)} <span style={{ fontWeight: 400, marginLeft: 18 }}>prepared by <b>{s.preparedBy}</b></span>
          {s.cutoffDefaulted && <span style={{ fontWeight: 400, marginLeft: 12, color: C.slate }}>(cut-off defaulted to possession start)</span>}</>, C.tint1)}
        {row('Possession window', <>{fmtLong(origin)} <span style={{ fontWeight: 400 }}>&nbsp;to&nbsp;</span> {fmtLong(s.possessionEnd)} <span style={{ marginLeft: 12 }}>= {hours1(durH)}</span></>, C.tint2)}
        {row('Elapsed / Remaining', <>{hours1(elapsed)} elapsed <span style={{ marginLeft: 18 }}>{hours1(remaining)} remaining</span></>, C.tint1)}
      </div>

      <div style={{ marginTop: 12 }}><Band>SUMMARY &nbsp;-&nbsp; ALL LOCATIONS</Band></div>
      <div style={{ display: 'grid', gridTemplateColumns: COLS, fontSize: 10 }}>
        {head.map((h) => (
          <div key={h} style={{ background: C.slate, color: '#fff', fontWeight: 700, fontSize: 9, textAlign: 'center', padding: '4px 2px', border: '1px solid #fff' }}>{h}</div>
        ))}
        <div style={{ background: C.slate, color: '#fff', fontWeight: 700, fontSize: 9, textAlign: 'center', padding: '4px 2px', border: '1px solid #fff' }}>
          PROGRESS 0 - 100% &nbsp; coloured bar = actual % &nbsp; black line = DATA DATE
        </div>

        {result.locations.map((l, i) => {
          const tone = locationTone(l.status)
          return <SummaryRow key={i} i={i} name={l.name} status={l.status} tone={tone}
            pf={fmtShort(l.plannedFinish)} ff={fmtShort(l.forecastFinish)} variance={l.variance}
            plan={l.planPct} actual={l.actualPct} buffer={l.bufferToHandback} frac={dataDateFrac} />
        })}
        <SummaryRow i={result.locations.length} total name="ALL LOCATIONS" status={total.status} tone={locationTone(total.status)}
          pf={fmtShort(fromHours(total.plannedFinishH, origin))} ff={fmtShort(fromHours(total.forecastFinishH, origin))}
          variance={total.variance} plan={total.planPct} actual={total.actualPct} buffer={total.bufferToHandback} frac={dataDateFrac} />
      </div>

      <div style={{ marginTop: 14 }}><Band size={9} pad="4px 10px">SITE LAYOUT &nbsp;-&nbsp; SCHEMATIC OVERVIEW</Band></div>
      <div id="layout-cards" style={{ display: 'flex', gap: 6, marginTop: 6 }} />
    </>
  )
}

interface RowProps {
  i: number; name: string; status: string; tone: { bg: string; fg: string }; pf: string; ff: string
  variance: number; plan: number; actual: number; buffer: number; frac: number; total?: boolean
}
function SummaryRow(p: RowProps) {
  const bg = p.total ? C.tint2 : p.i % 2 ? C.tint1 : '#fff'
  const cell = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    background: bg, border: '1px solid #DDE3E5', padding: '5px 4px', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: 10, ...extra,
  })
  const vt = varianceTone(p.variance)
  return (
    <>
      <div style={cell({ justifyContent: 'flex-start', fontWeight: 700, color: C.blue, fontSize: 11, borderTop: p.total ? `2px solid ${C.black}` : undefined })}>{p.name}</div>
      <div style={cell({ background: p.tone.bg, color: p.tone.fg, fontWeight: 700 })}>{p.status}</div>
      <div style={cell()}>{p.pf}</div>
      <div style={cell({ fontWeight: 700 })}>{p.ff}</div>
      <div style={cell({ fontWeight: 700, color: varColour[vt] })}>{fmtVariance(p.variance)}</div>
      <div style={cell({ color: C.slate, fontWeight: 700 })}>{pct(p.plan)}</div>
      <div style={cell({ color: C.blue, fontWeight: 700 })}>{pct(p.actual)}</div>
      <div style={cell({ fontWeight: 700, color: p.buffer < 0 ? '#fff' : C.black, background: p.buffer < 0 ? C.red : bg })}>{hours1(p.buffer)}</div>
      <div style={cell({ padding: 0, position: 'relative', justifyContent: 'flex-start',
        backgroundImage: `repeating-linear-gradient(90deg, transparent 0, transparent calc(10% - 1px), #DDE3E5 calc(10% - 1px), #DDE3E5 10%)` })}>
        <div style={{ height: '60%', width: `${Math.min(100, p.actual * 100)}%`, background: p.tone.bg, marginLeft: 0 }} />
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${p.frac * 100}%`, width: 2, background: C.black }} />
      </div>
    </>
  )
}

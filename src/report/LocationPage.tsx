import { useState, type CSSProperties } from 'react'
import { fromHours, type ProjectResult } from '../engine/schedule'
import { pageTitle, type SiteLayout } from '../layout/parse'
import { activityTone, barColour, C, locationTone } from './brand'
import { fmtBand, fmtShort, fmtVariance, hhmm, hours1, pct, varianceTone } from './format'
import { GANTT_COLS, ganttGeometry, ganttRow, type Bar } from './gantt'

const TABLE_COLS = [22, 156, 92, 78, 78, 74, 34, 34, 54] // px
const TABLE_W = TABLE_COLS.reduce((a, b) => a + b, 0)
const PA_W = 12
const GC = 10 // px per Gantt column
const HEAD_H = 20
const TOTAL_H = 22
const AVAIL_ROWS_H = 560

const varColour = { late: C.red, early: C.blue, ok: C.black }

const cellBase: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
  border: '1px solid #DDE3E5', padding: '0 3px', overflow: 'hidden', lineHeight: 1.1,
}

export function LocationPage({ result, index, layout }: { result: ProjectResult; index: number; layout?: SiteLayout }) {
  // Row ruler: hover shows an activity's row across the table AND the Gantt; a click pins it.
  const [hover, setHover] = useState<number | null>(null)
  const [pinned, setPinned] = useState<number | null>(null)
  const s = result.settings
  const loc = result.locations[index]
  const origin = s.possessionStart
  const g = ganttGeometry(s)
  const n = loc.activities.length
  const rh = Math.max(8, Math.min(18, Math.floor(AVAIL_ROWS_H / Math.max(1, 2 * n))))
  const tone = locationTone(loc.status)
  const late = loc.variance > 0.1
  const early = loc.variance < -0.1

  // Day bands (24 columns) and 6-column slot labels, from the view start.
  const colStart = (i: number) => fromHours(g.viewStartH + i * g.hoursPerColumn, origin)
  const bands = Array.from({ length: GANTT_COLS / 24 }, (_, b) => ({
    from: colStart(b * 24), to: colStart((b + 1) * 24), dark: b % 2 === 1,
  }))
  const slots = Array.from({ length: GANTT_COLS / 6 }, (_, k) => ({ from: colStart(k * 6), to: colStart((k + 1) * 6) }))
  const midnightCols = Array.from({ length: GANTT_COLS }, (_, i) => i).filter((i) => {
    const d = colStart(i)
    return i > 0 && d.getUTCHours() === 0 && d.getUTCMinutes() === 0
  })
  const cutoffX = (g.cutoffH - g.viewStartH) / g.hoursPerColumn * GC
  const bodyH = 2 * n * rh
  const active = pinned ?? hover
  const rowAt = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest('[data-row]')
    return el ? Number(el.getAttribute('data-row')) : null
  }

  const rows = loc.activities.map((a) => ({ a, bars: ganttRow(a, g) }))

  const barEl = (b: Bar, row: number, key: string, k: number) => (
    <div key={key} data-row={k} style={{ gridColumn: `${b.c0 + 2} / ${b.c1 + 3}`, gridRow: row, background: barColour[b.kind], margin: '1px 0', zIndex: 1 }} />
  )

  return (
    <div className="report-page" style={{ fontSize: 8.5 }}>
      <div style={{ background: C.blue, color: '#fff', fontWeight: 800, fontSize: 15, padding: '5px 12px', letterSpacing: 0.3 }}>
        {pageTitle(s.projectName, layout, loc.name, '  -  ')}
      </div>
      <div style={{ display: 'flex', height: 24, alignItems: 'center', fontWeight: 700, fontSize: 10 }}>
        <div style={{ width: TABLE_W + PA_W, background: C.grey, height: '100%', display: 'flex', alignItems: 'center', gap: 18, padding: '0 10px', color: C.black }}>
          {layout?.cells ? <span>{layout.cells} cell{layout.cells === 1 ? '' : 's'}</span> : null}
          <span>ACTUAL {pct(loc.actualPct)}</span>
          <span>PLANNED {pct(loc.planPct)}</span>
          <span>PLAN FINISH {fmtShort(loc.plannedFinish)}</span>
        </div>
        <div style={{ flex: 1, background: tone.bg, color: tone.fg, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 22 }}>
          <span>{loc.status}</span>
          <span>FORECAST {fmtShort(loc.forecastFinish)}</span>
          {(late || early) && <span>{hours1(Math.abs(loc.variance))} {late ? 'LATE' : 'EARLY'}</span>}
        </div>
      </div>

      <div style={{ display: 'flex', marginTop: 2, position: 'relative' }}
        onMouseOver={(e) => setHover(rowAt(e))} onMouseLeave={() => setHover(null)}
        onClick={(e) => { const k = rowAt(e); if (k != null) setPinned((p) => (p === k ? null : k)) }}>
        {active != null && (
          <div className="no-print" style={{ position: 'absolute', left: 0, right: 0, top: 2 * HEAD_H + 2 * active * rh, height: 2 * rh, zIndex: 6, pointerEvents: 'none',
            background: 'rgba(241,180,52,0.22)', borderTop: `1.5px solid ${C.amber}`, borderBottom: `1.5px solid ${C.amber}`,
            boxShadow: `inset 4px 0 0 ${pinned != null ? C.black : C.amber}` }} />
        )}
        {/* ---- table ---- */}
        <div style={{ display: 'grid', width: TABLE_W, flex: 'none',
          gridTemplateColumns: TABLE_COLS.map((w) => `${w}px`).join(' '),
          gridTemplateRows: `${HEAD_H}px ${HEAD_H}px repeat(${2 * n}, ${rh}px) ${TOTAL_H}px` }}>
          {['No', 'Activity', 'Status', 'Planned Finish', 'Forecast Finish', 'Time Variance', 'Plan %', 'Act. %', 'Buffer to Hand-back'].map((h, c) => (
            <div key={h} style={{ ...cellBase, gridRow: '1 / span 2', gridColumn: c + 1, background: C.slate, color: '#fff', fontWeight: 700, fontSize: 8 }}>{h}</div>
          ))}
          {rows.map(({ a }, k) => {
            const r = 3 + 2 * k
            const at = activityTone(a.status)
            const bg = k % 2 ? C.tint1 : '#fff'
            const span = (c: number, extra: CSSProperties, content: React.ReactNode) => (
              <div key={`${k}-${c}`} data-row={k} style={{ ...cellBase, gridRow: `${r} / span 2`, gridColumn: c, background: bg, ...extra }}>{content}</div>
            )
            return [
              span(1, { color: C.slate }, a.no),
              span(2, { justifyContent: 'flex-start', textAlign: 'left', fontWeight: 600, color: C.black, fontSize: a.name.length > 52 ? 7 : undefined }, a.name),
              span(3, { background: at.bg, color: at.fg, fontWeight: 700, fontSize: 7.5 }, a.status),
              span(4, {}, fmtShort(a.plannedFinish)),
              span(5, { fontWeight: 700 }, fmtShort(a.carriedForecastFinish)),
              span(6, { fontWeight: 700, color: varColour[varianceTone(a.carried)] }, fmtVariance(a.carried)),
              span(7, { color: C.slate, fontWeight: 700 }, pct(a.planPct)),
              span(8, { color: C.blue, fontWeight: 700 }, pct(a.effectivePct)),
              span(9, {}, ''),
            ]
          })}
          {/* total row */}
          {(() => {
            const r = 3 + 2 * n
            const t = (c: number, extra: CSSProperties, content: React.ReactNode, span = 1) => (
              <div key={`t${c}`} style={{ ...cellBase, gridRow: r, gridColumn: `${c} / span ${span}`, background: C.tint2, fontWeight: 700, borderTop: `2px solid ${C.black}`, ...extra }}>{content}</div>
            )
            return [
              t(1, { justifyContent: 'flex-start', textAlign: 'left', paddingLeft: 6 }, `TOTAL - ${layout?.code || loc.name}   (${loc.totalHours.toFixed(1)} activity hours)`, 2),
              t(3, { background: tone.bg, color: tone.fg }, loc.status),
              t(4, {}, fmtShort(loc.plannedFinish)),
              t(5, {}, fmtShort(loc.forecastFinish)),
              t(6, { color: varColour[varianceTone(loc.variance)] }, fmtVariance(loc.variance)),
              t(7, { color: C.slate }, pct(loc.planPct)),
              t(8, { color: C.blue }, pct(loc.actualPct)),
              t(9, { color: loc.bufferToHandback < 0 ? C.red : C.black }, hours1(loc.bufferToHandback)),
            ]
          })()}
        </div>

        {/* ---- gantt ---- */}
        <div style={{ position: 'relative', flex: 'none', width: PA_W + GANTT_COLS * GC }}>
          <div style={{ display: 'grid', gridTemplateColumns: `${PA_W}px repeat(${GANTT_COLS}, ${GC}px)`,
            gridTemplateRows: `${HEAD_H}px ${HEAD_H}px repeat(${2 * n}, ${rh}px) ${TOTAL_H}px` }}>
            <div style={{ gridRow: '1 / span 2', gridColumn: 1, background: C.slate }} />
            {bands.map((b, i) => (
              <div key={i} style={{ gridRow: 1, gridColumn: `${i * 24 + 2} / span 24`, background: b.dark ? C.black : C.blue, color: '#fff', fontWeight: 700, fontSize: 7.5,
                display: 'flex', alignItems: 'center', justifyContent: 'center', borderLeft: i ? '1px solid #fff' : undefined, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                {fmtBand(b.from)} &nbsp;to&nbsp; {fmtBand(b.to)}
              </div>
            ))}
            {slots.map((sl, k) => (
              <div key={k} style={{ gridRow: 2, gridColumn: `${k * 6 + 2} / span 6`, background: k % 2 ? C.tint2 : C.pale, color: C.black, fontWeight: 700, fontSize: 6.5,
                display: 'flex', alignItems: 'center', justifyContent: 'center', borderLeft: '1px solid #fff', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                {hhmm(sl.from)} - {hhmm(sl.to)}
              </div>
            ))}

            {/* row backgrounds + P / A labels */}
            {rows.map((_, k) => {
              const r = 3 + 2 * k
              return [
                <div key={`bg${k}`} data-row={k} style={{ gridRow: `${r} / span 2`, gridColumn: '1 / -1', background: k % 2 ? C.tint1 : '#fff', borderBottom: '1px solid #DDE3E5' }} />,
                <div key={`p${k}`} data-row={k} style={{ gridRow: r, gridColumn: 1, fontSize: 5.5, color: C.slate, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>P</div>,
                <div key={`a${k}`} data-row={k} style={{ gridRow: r + 1, gridColumn: 1, fontSize: 5.5, color: C.slate, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>A</div>,
              ]
            })}

            {/* bars: forecast first so the actual bar sits on top of it */}
            {rows.map(({ bars }, k) => {
              const r = 3 + 2 * k
              return [
                bars.planned && barEl(bars.planned, r, `pl${k}`, k),
                bars.forecast && barEl(bars.forecast, r + 1, `fc${k}`, k),
                bars.actual && barEl(bars.actual, r + 1, `ac${k}`, k),
              ]
            })}
          </div>

          {/* gridlines every column (light) / 6 h (stronger), midnight rule, cut-off line */}
          <div style={{ position: 'absolute', left: PA_W, top: 2 * HEAD_H, width: GANTT_COLS * GC, height: bodyH, pointerEvents: 'none',
            backgroundImage: `repeating-linear-gradient(90deg, transparent 0, transparent ${GC * 6 - 1}px, #AEB9BD ${GC * 6 - 1}px, #AEB9BD ${GC * 6}px), repeating-linear-gradient(90deg, transparent 0, transparent ${GC - 1}px, #E6ECEE ${GC - 1}px, #E6ECEE ${GC}px)` }} />
          {midnightCols.map((i) => (
            <div key={i} style={{ position: 'absolute', left: PA_W + i * GC - 1, top: 2 * HEAD_H, height: bodyH, width: 2, background: C.blue, opacity: 0.7, pointerEvents: 'none' }} />
          ))}
          {cutoffX >= 0 && cutoffX <= GANTT_COLS * GC && (
            <div style={{ position: 'absolute', left: PA_W + cutoffX - 1, top: 2 * HEAD_H, height: bodyH, width: 2, background: C.black, zIndex: 3, pointerEvents: 'none' }} />
          )}
        </div>
      </div>

      {/* legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 8, color: C.black, padding: '5px 4px' }}>
        <b>Planned (baseline)</b>
        <span>Black line = report cut-off</span>
        <span>Time Variance = Forecast vs Planned Finish</span>
        {([['planned', 'Planned'], ['done-ontime', 'Done on time'], ['done-late', 'Done late'], ['progress', 'In progress'], ['behind', 'Behind'], ['forecast', 'Forecast']] as const).map(([k, label]) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <i style={{ width: 14, height: 8, background: barColour[k], display: 'inline-block' }} />{label}
          </span>
        ))}
      </div>
    </div>
  )
}

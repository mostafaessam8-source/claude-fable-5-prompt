import { useRef, useState } from 'react'
import { SAR_LOGO_RATIO, SAR_LOGO_URL } from '../brand/logo'
import type { ProjectResult } from '../engine/schedule'
import { fromHours } from '../engine/schedule'
import { LayoutCards } from '../layout/LayoutCard'
import type { SiteLayout } from '../layout/parse'
import { C, locationTone } from './brand'
import { fmtLong, fmtShort, fmtVariance, hours1, pct, varianceTone } from './format'
import { totalAllLocations } from './summary'
import { SUM_COL_NAMES, SUM_MAX_COL, SUM_MAX_ROW, SUM_MIN_COL, SUM_MIN_ROW, summaryCols } from './columns'

const varColour = { late: C.red, early: C.blue, ok: C.black }

function Band({ children, bg = C.black, size = 11, pad = '4px 12px' }: { children: React.ReactNode; bg?: string; size?: number; pad?: string }) {
  return <div style={{ background: bg, color: '#fff', fontWeight: 700, fontSize: size, padding: pad, letterSpacing: 0.3 }}>{children}</div>
}

/** `onSummary` (editing / the viewer) turns on the resize handles of the summary table; `zoom` is the page's on-screen scale. */
export function Cover({ result, layouts, onSummary, zoom = 1 }: {
  result: ProjectResult; layouts: SiteLayout[]
  onSummary?: (cols: number[], rows: (number | null)[]) => void; zoom?: number
}) {
  const s = result.settings
  const origin = s.possessionStart
  const total = totalAllLocations(result.locations)
  const durH = result.possessionEndH
  const elapsed = Math.min(durH, Math.max(0, result.cutoffH))
  const remaining = durH - elapsed
  const dataDateFrac = Math.min(1, Math.max(0, result.cutoffH / durH))

  const cols = summaryCols(s.summaryCols)
  const nRows = result.locations.length + 2 // header, the locations, the total
  const rowsH: (number | null)[] = Array.from({ length: nRows }, (_, i) => s.summaryRows?.[i] ?? null)
  const COLS = `${cols.map((w) => `${w}px`).join(' ')} minmax(160px, 1fr)`
  const ROWS = rowsH.map((h) => (h ? `${h}px` : 'auto')).join(' ')
  const head = SUM_COL_NAMES.slice(0, 8)

  // ---- resize handles: pick a cell; thick lines on its edges drag the column (left / right) or the row (top / bottom) ----
  const grid = useRef<HTMLDivElement>(null)
  const [sel, setSel] = useState<{ r: number; c: number } | null>(null)
  const [hov, setHov] = useState<{ r: number; c: number } | null>(null) // the rulers: the row and column under the pointer
  const drag = useRef<null | { kind: 'col' | 'row'; i: number; p0: number; v0: number; prev?: number; rows: (number | null)[] }>(null)
  const cellBox = (r: number, c: number) => {
    const el = grid.current?.querySelector<HTMLElement>(`[data-r="${r}"][data-c="${c}"]`)
    return el ? { l: el.offsetLeft, t: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight } : null
  }
  const rowH = (r: number) => cellBox(r, 0)?.h ?? 0
  const start = (e: React.PointerEvent, kind: 'col' | 'row', i: number, boundary: boolean) => {
    e.stopPropagation(); e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const measured = Array.from({ length: nRows }, (_, r) => rowsH[r] ?? Math.round(rowH(r)))
    drag.current = kind === 'col'
      ? { kind, i, p0: e.clientX, v0: cols[i], prev: boundary ? cols[i - 1] : undefined, rows: rowsH }
      : { kind, i, p0: e.clientY, v0: measured[i], prev: boundary ? measured[i - 1] : undefined, rows: measured }
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || !onSummary) return
    if (d.kind === 'col') {
      const dx = (e.clientX - d.p0) / zoom
      if (d.prev != null) { // the line between this column and its left neighbour
        const gain = Math.round(Math.max(SUM_MIN_COL - d.v0, Math.min(SUM_MAX_COL - d.v0, d.prev - SUM_MIN_COL, -dx)))
        onSummary(cols.map((x, k) => (k === d.i ? d.v0 + gain : k === d.i - 1 ? d.prev! - gain : x)), d.rows)
      } else onSummary(cols.map((x, k) => (k === d.i ? Math.round(Math.min(SUM_MAX_COL, Math.max(SUM_MIN_COL, d.v0 + dx))) : x)), d.rows)
    } else {
      const dy = (e.clientY - d.p0) / zoom
      if (d.prev != null) {
        const gain = Math.round(Math.max(SUM_MIN_ROW - d.v0, Math.min(SUM_MAX_ROW - d.v0, d.prev - SUM_MIN_ROW, -dy)))
        onSummary(cols, d.rows.map((x, k) => (k === d.i ? d.v0 + gain : k === d.i - 1 ? d.prev! - gain : x)))
      } else onSummary(cols, d.rows.map((x, k) => (k === d.i ? Math.round(Math.min(SUM_MAX_ROW, Math.max(SUM_MIN_ROW, d.v0 + dy))) : x)))
    }
  }
  const end = (e: React.PointerEvent) => { drag.current = null; try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* released */ } }
  const rulers = () => {
    if (!hov) return null
    const b = cellBox(hov.r, hov.c), g = grid.current
    if (!b || !g) return null
    const bg = 'rgba(0,119,139,0.09)', line = `1.5px solid ${C.blue}`
    return (
      <>
        <div className="no-print" style={{ position: 'absolute', left: b.l, width: b.w, top: 0, height: g.offsetHeight, zIndex: 7, pointerEvents: 'none', background: bg, borderLeft: line, borderRight: line }} />
        <div className="no-print" style={{ position: 'absolute', top: b.t, height: b.h, left: 0, width: g.offsetWidth, zIndex: 7, pointerEvents: 'none', background: bg, borderTop: line, borderBottom: line }} />
      </>
    )
  }
  const handles = () => {
    if (!onSummary || !sel) return null
    const b = cellBox(sel.r, sel.c)
    if (!b) return null
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
    const t = 3 / zoom, pad = (coarse ? 8 : 4) / zoom
    const bar = (x: number, y: number, vert: boolean, len: number, cursor: string): React.CSSProperties => {
      const w = vert ? t + 2 * pad : len, h = vert ? len : t + 2 * pad
      return { position: 'absolute', left: x - w / 2, top: y - h / 2, width: w, height: h, boxSizing: 'border-box', padding: vert ? `0 ${pad}px` : `${pad}px 0`, backgroundClip: 'content-box', backgroundColor: C.blue, zIndex: 9, touchAction: 'none', cursor }
    }
    const last = sel.c === cols.length // the progress column: only the line on its left edge
    const rightCol = last ? null : sel.c
    return (
      <>
        <div className="no-print" style={{ position: 'absolute', left: b.l, top: b.t, width: b.w, height: b.h, zIndex: 8, pointerEvents: 'none', outline: `1.5px solid ${C.blue}`, outlineOffset: -1, background: 'rgba(0,119,139,0.10)' }} />
        {sel.c > 0 && <span className="no-print" role="slider" aria-label="Drag to change the column width" style={bar(b.l, b.t + b.h / 2, true, b.h, 'col-resize')}
          onPointerDown={(e) => (last ? start(e, 'col', sel.c - 1, false) : start(e, 'col', sel.c, true))} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />}
        {rightCol != null && <span className="no-print" role="slider" aria-label="Drag to change the column width" style={bar(b.l + b.w, b.t + b.h / 2, true, b.h, 'col-resize')}
          onPointerDown={(e) => start(e, 'col', rightCol, false)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />}
        {sel.r > 0 && <span className="no-print" role="slider" aria-label="Drag to change the row height" style={bar(b.l + b.w / 2, b.t, false, b.w, 'row-resize')}
          onPointerDown={(e) => start(e, 'row', sel.r, true)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />}
        <span className="no-print" role="slider" aria-label="Drag to change the row height (double-click: automatic)" style={bar(b.l + b.w / 2, b.t + b.h, false, b.w, 'row-resize')}
          onPointerDown={(e) => start(e, 'row', sel.r, false)} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
          onDoubleClick={() => onSummary(cols, rowsH.map((x, k) => (k === sel.r ? null : x)))} />
      </>
    )
  }
  const labelStyle = { color: C.blue, fontWeight: 700, fontSize: 9, textTransform: 'uppercase' as const, width: 150 }

  const row = (label: string, body: React.ReactNode, bg: string) => (
    <div style={{ display: 'flex', background: bg, padding: '3px 12px', fontSize: 11, alignItems: 'center' }}>
      <span style={labelStyle}>{label}</span>
      <span style={{ fontWeight: 700, color: C.black }}>{body}</span>
    </div>
  )

  return (
    <>
      {/* the SAR logo on white, with clear space of at least half its height on every side */}
      <div style={{ background: '#fff', padding: '12px 14px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <img src={SAR_LOGO_URL} alt="SAR - Saudi Arabia Railways" style={{ height: 40, width: 40 * SAR_LOGO_RATIO, display: 'block' }} />
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: C.slate }}>SAR.COM.SA</span>
      </div>
      <Band size={12} pad="5px 12px"><div style={{ textAlign: 'center' }}>{s.projectName}</div></Band>
      <div style={{ background: C.blue, color: '#fff', fontWeight: 800, fontSize: 24, textAlign: 'center', padding: '5px 0' }}>{s.reportTitle}</div>
      <div style={{ background: C.tint2, color: C.black, fontWeight: 700, fontSize: 11, textAlign: 'center', padding: '4px 0' }}>{s.subtitle}</div>
      <div style={{ marginTop: 6 }}>
        {row('Report generated', <>{fmtLong(s.cutoff)} <span style={{ fontWeight: 400, marginLeft: 18 }}>prepared by <b>{s.preparedBy}</b></span>
          {s.cutoffNow && <span style={{ fontWeight: 400, marginLeft: 12, color: C.slate }}>(cut-off = now, live)</span>}
</>, C.tint1)}
        {row('Possession window', <>{fmtLong(origin)} <span style={{ fontWeight: 400 }}>&nbsp;to&nbsp;</span> {fmtLong(s.possessionEnd)} <span style={{ marginLeft: 12 }}>= {hours1(durH)}</span></>, C.tint2)}
        {row('Elapsed / Remaining', <>{hours1(elapsed)} elapsed <span style={{ marginLeft: 18 }}>{hours1(remaining)} remaining</span></>, C.tint1)}
      </div>

      <div style={{ marginTop: 12 }}><Band>SUMMARY &nbsp;-&nbsp; ALL LOCATIONS</Band></div>
      <div ref={grid} style={{ display: 'grid', gridTemplateColumns: COLS, gridTemplateRows: ROWS, fontSize: 10, position: 'relative' }}
        onMouseMove={(e) => { const el = (e.target as HTMLElement).closest('[data-c]') as HTMLElement | null; const r = el ? Number(el.dataset.r) : -1, c = el ? Number(el.dataset.c) : -1; setHov((h) => (el ? (h && h.r === r && h.c === c ? h : { r, c }) : null)) }}
        onMouseLeave={() => setHov(null)}
        onClick={(e) => { if (!onSummary || (e.target as HTMLElement).closest('[role=slider]')) return; const el = (e.target as HTMLElement).closest('[data-c]') as HTMLElement | null; setSel(el ? { r: Number(el.dataset.r), c: Number(el.dataset.c) } : null) }}>
        {head.map((h, c) => (
          <div key={h} data-r={0} data-c={c} style={{ background: C.slate, color: '#fff', fontWeight: 700, fontSize: 9, textAlign: 'center', padding: '4px 2px', border: '1px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{h}</div>
        ))}
        <div data-r={0} data-c={8} style={{ background: C.slate, color: '#fff', fontWeight: 700, fontSize: 9, textAlign: 'center', padding: '4px 2px', border: '1px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          PROGRESS 0 - 100% &nbsp; coloured bar = actual % &nbsp; black line = DATA DATE
        </div>

        {result.locations.map((l, i) => {
          const tone = locationTone(l.status)
          return <SummaryRow key={i} i={i} r={i + 1} name={l.name} status={l.status} tone={tone}
            pf={fmtShort(l.plannedFinish)} ff={fmtShort(l.forecastFinish)} variance={l.variance}
            plan={l.planPct} actual={l.actualPct} buffer={l.bufferToHandback} frac={dataDateFrac} />
        })}
        <SummaryRow i={result.locations.length} r={result.locations.length + 1} total name="ALL LOCATIONS" status={total.status} tone={locationTone(total.status)}
          pf={fmtShort(fromHours(total.plannedFinishH, origin))} ff={fmtShort(fromHours(total.forecastFinishH, origin))}
          variance={total.variance} plan={total.planPct} actual={total.actualPct} buffer={total.bufferToHandback} frac={dataDateFrac} />
        {rulers()}
        {handles()}
      </div>

      <div style={{ marginTop: 14 }}><Band size={9} pad="4px 10px">SITE LAYOUT &nbsp;-&nbsp; SCHEMATIC OVERVIEW</Band></div>
      <LayoutCards layouts={layouts} />
    </>
  )
}

interface RowProps {
  i: number; r: number; name: string; status: string; tone: { bg: string; fg: string }; pf: string; ff: string
  variance: number; plan: number; actual: number; buffer: number; frac: number; total?: boolean
}
function SummaryRow(p: RowProps) {
  const bg = p.total ? C.tint2 : p.i % 2 ? C.tint1 : '#fff'
  let ci = 0
  const at = () => ({ 'data-r': p.r, 'data-c': ci++ })
  const cell = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    background: bg, border: '1px solid #DDE3E5', padding: '5px 4px', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: 10, ...extra,
  })
  const vt = varianceTone(p.variance)
  return (
    <>
      <div {...at()} style={cell({ justifyContent: 'flex-start', fontWeight: 700, color: C.blue, fontSize: 11, borderTop: p.total ? `2px solid ${C.black}` : undefined })}>{p.name}</div>
      <div {...at()} style={cell({ background: p.tone.bg, color: p.tone.fg, fontWeight: 700 })}>{p.status}</div>
      <div {...at()} style={cell()}>{p.pf}</div>
      <div {...at()} style={cell({ fontWeight: 700 })}>{p.ff}</div>
      <div {...at()} style={cell({ fontWeight: 700, color: varColour[vt] })}>{fmtVariance(p.variance)}</div>
      <div {...at()} style={cell({ color: C.slate, fontWeight: 700 })}>{pct(p.plan)}</div>
      <div {...at()} style={cell({ color: C.blue, fontWeight: 700 })}>{pct(p.actual)}</div>
      <div {...at()} style={cell({ fontWeight: 700, color: p.buffer < 0 ? '#fff' : C.black, background: p.buffer < 0 ? C.red : bg })}>{hours1(p.buffer)}</div>
      <div {...at()} style={cell({ padding: 0, position: 'relative', justifyContent: 'flex-start',
        backgroundImage: `repeating-linear-gradient(90deg, transparent 0, transparent calc(10% - 1px), #DDE3E5 calc(10% - 1px), #DDE3E5 10%)` })}>
        <div style={{ height: '60%', width: `${Math.min(100, p.actual * 100)}%`, background: p.tone.bg, marginLeft: 0 }} />
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${p.frac * 100}%`, width: 2, background: C.black }} />
      </div>
    </>
  )
}

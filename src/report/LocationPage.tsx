import { useRef, useState, type CSSProperties } from 'react'
import { fromHours, toHours, type ProjectResult } from '../engine/schedule'
import { pageTitle, unit, type SiteLayout } from '../layout/parse'
import { SAR_LOGO_RATIO, SAR_LOGO_URL } from '../brand/logo'
import { addActivity, lagToKeepStart, moveActivities, patchActivity, setPlannedFinish, splitDateTime } from '../links/edit'
import { fmtCell, parseDateTime } from '../links/table'
import { applySettings } from '../model/settings'
import { textWidth } from './measure'
import { COL_NAMES, DEFAULT_COLS, MAX_COL, MAX_ROW_H, MIN_COL, MIN_ROW_H, PAGE_H0, PAGE_INNER, pageWidth, rowLayout, tableColsOf } from './columns'
export { COL_NAMES, DEFAULT_COLS, pageWidth }
import type { ActivityInput, Project } from '../model/types'
import { activityTone, barColour, C, locationTone } from './brand'
import { fmtBand, fmtShort, fmtVariance, hhmm, hours1, pct, varianceTone } from './format'
import { actualDragPatch, dragPatch, linkFromHandles, MIN_DUR, type DragMode } from './dragmath'
import { GANTT_COLS, ganttGeometry, ganttRow, type Bar } from './gantt'

/** Default widths (px) of the table columns; each can be dragged wider or narrower (like an Excel column) and is saved with the project. */
const PA_W = 12
const HEAD_H = 20
const TOTAL_H = 22

const fmtDur = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1))
const varColour = { late: C.red, early: C.blue, ok: C.black }

/**
 * The largest font size (px) at which `text` fits a cell of the given size: words wrap, so a line holds about width / (0.56 × size) characters.
 * Used for the long names and remarks so they are never cut off by the row height.
 */
export function fitFont(text: string, widthPx: number, heightPx: number, max = 8.5, min = 5): number {
  const len = Math.max(1, text.length)
  for (let fs = max; fs >= min; fs -= 0.25) {
    const perLine = Math.max(1, Math.floor((widthPx - 6) / (0.56 * fs)))
    const lines = Math.ceil((len + 4) / perLine) // + a few characters: words that do not break where the maths says
    if (lines * fs * 1.12 <= heightPx - 1) return fs
  }
  return min
}

const cellBase: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
  border: '1px solid #DDE3E5', padding: '0 3px', overflow: 'hidden', lineHeight: 1.1,
}

export function LocationPage({ result, index, layout, selectedNo, onSelect, project, onChange, onStructure, onCols, onRowH, zoom = 1, showLinks = true }: {
  result: ProjectResult; index: number; layout?: SiteLayout
  /** Activity number selected on this page (its panel is open); the ruler stays on it. */
  selectedNo?: number | null
  /** `lane` is 'actual' when the click was on the actual (A) bar, so the panel opens on its Actual tab. */
  onSelect?: (no: number, lane?: 'baseline' | 'actual') => void
  /** The project being edited: the planned bars can be dragged, resized and linked. */
  project?: Project
  onChange?: (p: Project) => void
  /** Called after the activity list was reordered (numbers change, so an open panel must close). */
  onStructure?: () => void
  /** Lets a view-only page (no project) still change its column widths, for this session. */
  onCols?: (cols: number[]) => void
  /** Lets a view-only page change row heights, for this session: [{ no, h }] (h = undefined: automatic). */
  onRowH?: (updates: { no: number; h: number | undefined }[]) => void
  /** The CSS zoom the page is shown at (mouse movement is measured in screen pixels). */
  zoom?: number
  showLinks?: boolean
}) {
  // Row ruler: hover shows an activity's row across the table AND the Gantt; a click selects it (opens the panel).
  const [hover, setHover] = useState<number | null>(null)
  // Vertical ruler: the Gantt column (time) under the pointer, or the table column under the pointer.
  const [hoverCol, setHoverCol] = useState<number | null>(null)
  const [hoverTCol, setHoverTCol] = useState<number | null>(null)
  const ganttRef = useRef<HTMLDivElement>(null)
  // reorder by dragging the row number; rename by double-clicking the name
  const [dragNo, setDragNo] = useState<number | null>(null)
  const [dropK, setDropK] = useState<number | null>(null) // drop before row k (n = at the end)
  // inline cell editing: which row / column is being typed in
  const [cellEdit, setCellEdit] = useState<{ k: number; c: number } | null>(null)
  const s = result.settings
  const loc = result.locations[index]
  const origin = s.possessionStart
  const g = ganttGeometry(s)
  const cols = tableColsOf(s.tableCols)
  // Start + finish: Planned and Forecast are two columns each (Start | Finish), the grid gets 14 tracks for the 12 logical columns
  const range = !!s.dateRange
  const subs = (c0: number) => (range && (c0 === 5 || c0 === 6) ? 2 : 1)
  const tracks = cols.flatMap((w, c0) => Array<number>(subs(c0)).fill(w))
  const gs = (k: number) => k + (range ? (k > 6 ? 1 : 0) + (k > 7 ? 1 : 0) : 0) // first grid track of logical column k (1-based)
  const cx = (c0: number) => tracks.slice(0, gs(c0 + 1) - 1).reduce((a, b) => a + b, 0) // left edge of logical column c0
  const cw = (c0: number) => cols[c0] * subs(c0)
  const TABLE_W = tracks.reduce((a, b) => a + b, 0)
  const PAGE_X = pageWidth(s.tableCols, range)
  const GC = (PAGE_INNER + (PAGE_X - 1123) - TABLE_W - PA_W) / GANTT_COLS // px per Gantt column (the A4 default, or GC_PREF once the page has grown)
  const n = loc.activities.length
  // where each row sits: automatic heights that fit the A4 page, or the height a row was dragged to (the page grows when the rows outgrow it)
  const RL = rowLayout(loc.activities)
  const { heights: rowHs, tops: rowTops, bodyH } = RL
  const remarkItems = RL.long
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
  const selectedIdx = selectedNo == null ? -1 : loc.activities.findIndex((a) => a.no === selectedNo)
  const active = selectedIdx >= 0 ? selectedIdx : hover
  const rowAt = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest('[data-row]')
    return el ? Number(el.getAttribute('data-row')) : null
  }

  const rows = loc.activities.map((a) => ({ a, bars: ganttRow(a, g) }))
  const editable = !!project && !!onChange
  const canResize = editable || !!onCols || !!onRowH
  // the cell picked by a click / tap: round handles appear on its column's edges and its row's edges to widen / heighten them
  const [sel, setSel] = useState<{ k: number | null; c: number | null; x: number } | null>(null)
  const flexRef = useRef<HTMLDivElement>(null)
  const planEditable = editable
  const xOf = (h: number) => PA_W + ((h - g.viewStartH) / g.hoursPerColumn) * GC
  const rowY = (k: number) => 2 * HEAD_H + rowTops[k] + rowHs[k] / 4 // centre of an activity's planned (P) row

  // ---- drag a planned bar: move / resize its ends (changes the lag and the duration) ----
  const pageRef = useRef<HTMLDivElement>(null)
  const drag = useRef<null | { mode: DragMode; no: number; x0: number; base: Project; lag0: number; dur0: number; rel: Project['locations'][number]['activities'][number]['rel']; hasPred: boolean; moved: boolean; last: number }>(null)
  const justDragged = useRef(false)
  const startDrag = (e: React.PointerEvent, k: number, mode: DragMode) => {
    if (!project || e.button !== 0) return
    e.stopPropagation()
    const bar = (e.currentTarget as HTMLElement).closest('.gbar') as HTMLElement
    bar.setPointerCapture(e.pointerId)
    const pa = project.locations[index].activities[k]
    const ra = loc.activities[k]
    drag.current = { mode, no: pa.no, x0: e.clientX, base: project, lag0: pa.lagH, dur0: pa.durationH ?? ra.durationH, rel: pa.rel, hasPred: pa.pred > 0 && !ra.linkBad, moved: false, last: 0 }
  }
  const onDragMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || !onChange) return
    const dx = e.clientX - d.x0
    if (!d.moved && Math.abs(dx) < 3) return
    d.moved = true
    // whole columns (one hour at the default span), measured in layout pixels
    const delta = Math.round(dx / zoom / GC) * g.hoursPerColumn
    if (delta === d.last) return
    d.last = delta
    onChange(patchActivity(d.base, index, d.no, dragPatch(d.mode, d.rel, d.hasPred, d.lag0, d.dur0, delta)))
  }
  const onDragEnd = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* already released */ }
    if (d?.moved) { justDragged.current = true; setTimeout(() => { justDragged.current = false }, 0) }
  }

  // ---- drag the ACTUAL bar: move it, or move its start / finish (changes the actual dates) ----
  const adrag = useRef<null | { mode: DragMode; no: number; x0: number; base: Project; startH: number; finishH: number | null; endH: number; moved: boolean; last: number }>(null)
  const startActualDrag = (e: React.PointerEvent, k: number, mode: DragMode) => {
    const ra = loc.activities[k]
    if (!project || e.button !== 0 || !ra.actualStart) return
    e.stopPropagation(); e.preventDefault()
    ;(e.currentTarget as HTMLElement).closest('.gbar')!.setPointerCapture(e.pointerId)
    const startH = toHours(ra.actualStart, origin)
    adrag.current = {
      mode, no: ra.no, x0: e.clientX, base: project, startH,
      finishH: ra.actualFinish ? toHours(ra.actualFinish, origin) : null,
      endH: rows[k].bars.actualEndH ?? startH + MIN_DUR, moved: false, last: 0,
    }
  }
  const onActualMove = (e: React.PointerEvent) => {
    const d = adrag.current
    if (!d || !onChange) return
    const dx = e.clientX - d.x0
    if (!d.moved && Math.abs(dx) < 3) return
    d.moved = true
    const delta = Math.round(dx / zoom / GC) * g.hoursPerColumn
    if (delta === d.last) return
    d.last = delta
    const p = actualDragPatch(d.mode, d.startH, d.finishH, d.endH, delta)
    const st = splitDateTime(fromHours(p.startH, origin))
    const patch: Partial<ActivityInput> = { actualStartDate: st.date, actualStartTime: st.time }
    if (p.finishH != null) {
      const f = splitDateTime(fromHours(p.finishH, origin))
      Object.assign(patch, { actualFinishDate: f.date, actualFinishTime: f.time, pct: 1 }) // a finish means 100 %
    }
    onChange(patchActivity(d.base, index, d.no, patch))
  }
  const onActualEnd = (e: React.PointerEvent) => {
    const d = adrag.current
    adrag.current = null
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* already released */ }
    if (d?.moved) { justDragged.current = true; setTimeout(() => { justDragged.current = false }, 0) }
  }

  // ---- link: drag from a dot on one bar to a dot (or the bar) of another ----
  const [line, setLine] = useState<null | { x1: number; y1: number; x2: number; y2: number }>(null)
  const link = useRef<null | { k: number; edge: 'start' | 'finish'; x0: number; y0: number; x1: number; y1: number }>(null)
  const startLink = (e: React.PointerEvent, k: number, edge: 'start' | 'finish') => {
    if (!project || e.button !== 0) return
    e.stopPropagation(); e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const a = loc.activities[k]
    const x1 = xOf(edge === 'start' ? a.plannedStartH : a.plannedFinishH)
    link.current = { k, edge, x0: e.clientX, y0: e.clientY, x1, y1: rowY(k) }
    setLine({ x1, y1: rowY(k), x2: x1, y2: rowY(k) })
  }
  const onLinkMove = (e: React.PointerEvent) => {
    const l = link.current
    if (l) setLine({ x1: l.x1, y1: l.y1, x2: l.x1 + (e.clientX - l.x0) / zoom, y2: l.y1 + (e.clientY - l.y0) / zoom })
  }
  const onLinkEnd = (e: React.PointerEvent) => {
    const l = link.current
    link.current = null
    setLine(null)
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* already released */ }
    if (!l || !project || !onChange) return
    justDragged.current = true; setTimeout(() => { justDragged.current = false }, 0)
    const hit = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
    if (!hit || !pageRef.current?.contains(hit)) return
    const dot = hit.closest('[data-handle]') as HTMLElement | null
    const bar = hit.closest('.gbar') as HTMLElement | null
    let tk: number, te: 'start' | 'finish'
    if (dot) { tk = Number(dot.dataset.hrow); te = dot.dataset.handle as 'start' | 'finish' }
    else if (bar) { tk = Number(bar.dataset.row); const r = bar.getBoundingClientRect(); te = e.clientX < r.left + r.width / 2 ? 'start' : 'finish' }
    else return
    const made = linkFromHandles({ k: l.k, edge: l.edge }, { k: tk, edge: te })
    if (!made) return
    const pred = loc.activities[made.predK]
    const succ = loc.activities[made.succK]
    // keep the successor's planned start where it is: the lag is set to whatever reproduces it
    const lagH = lagToKeepStart(succ.plannedStartH, made.rel, { startH: pred.plannedStartH, finishH: pred.plannedFinishH }, succ.durationH)
    onChange(patchActivity(project, index, succ.no, { pred: pred.no, rel: made.rel, lagH }))
  }

  // dependency arrows: from the predecessor's end to the successor's end the relationship joins
  const arrows = !showLinks ? [] : loc.activities.flatMap((r, k) => {
    const pa = r // pred / rel come with the result, so a view-only page (no project) draws them too
    const j = pa.pred > 0 && !r.linkBad ? loc.activities.findIndex((x) => x.no === pa.pred) : -1
    if (j < 0) return []
    const p = loc.activities[j]
    const clamp = (x: number) => Math.min(PA_W + GANTT_COLS * GC, Math.max(PA_W, x))
    const x1 = clamp(xOf(pa.rel === 'FS' || pa.rel === 'FF' ? p.plannedFinishH : p.plannedStartH))
    const x2 = clamp(xOf(pa.rel === 'FS' || pa.rel === 'SS' ? r.plannedStartH : r.plannedFinishH))
    const y1 = rowY(j), y2 = rowY(k)
    const dir = y2 > y1 ? 1 : -1
    const d = x2 >= x1 + 8
      ? `M${x1},${y1} H${x1 + 4} V${y2} H${x2}`
      : `M${x1},${y1} H${x1 + 4} V${y1 + dir * (rowHs[j] / 2)} H${x2 - 4} V${y2} H${x2}`
    return [{ key: k, d, no: pa.no }]
  })

  const barEl = (b: Bar, row: number, key: string, k: number) => (
    <div key={key} data-row={k} data-lane="actual" style={{ gridColumn: `${b.c0 + 2} / ${b.c1 + 3}`, gridRow: row, background: barColour[b.kind], margin: '1px 0', zIndex: 1 }} />
  )
  /** The actual bar: drag it to move the actual dates, its left edge for the start, its right edge for the finish. */
  const actualBar = (b: Bar, row: number, k: number) => (
    <div key={`ac${k}`} data-row={k} data-lane="actual" className={editable ? 'gbar' : undefined}
      style={{ gridColumn: `${b.c0 + 2} / ${b.c1 + 3}`, gridRow: row, background: barColour[b.kind], margin: '1px 0', zIndex: 2, position: 'relative', ...(editable ? { cursor: 'grab', touchAction: 'none' } : {}) }}
      onPointerDown={editable ? (e) => startActualDrag(e, k, 'move') : undefined} onPointerMove={editable ? onActualMove : undefined}
      onPointerUp={editable ? onActualEnd : undefined} onPointerCancel={editable ? onActualEnd : undefined}>
      {editable && (
        <>
          <span className="gh gh-l" title="Drag: move the actual start" onPointerDown={(e) => startActualDrag(e, k, 'left')} />
          <span className="gh gh-r" title="Drag: move the actual finish (work in progress: sets one)" onPointerDown={(e) => startActualDrag(e, k, 'right')} />
        </>
      )}
    </div>
  )
  /** The planned bar: drag it to move, drag its ends to resize, drag a dot onto another bar to link. */
  const plannedBar = (b: Bar, row: number, k: number) => (
    <div key={`pl${k}`} data-row={k} className={planEditable ? 'gbar' : undefined}
      style={{ gridColumn: `${b.c0 + 2} / ${b.c1 + 3}`, gridRow: row, background: barColour[b.kind], margin: '1px 0', zIndex: 2, position: 'relative', ...(planEditable ? { cursor: 'grab', touchAction: 'none' } : {}) }}
      onPointerDown={planEditable ? (e) => startDrag(e, k, 'move') : undefined} onPointerMove={planEditable ? onDragMove : undefined}
      onPointerUp={planEditable ? onDragEnd : undefined} onPointerCancel={planEditable ? onDragEnd : undefined}>
      {planEditable && (
        <>
          <span className="gh gh-l" title="Drag: move the start, keep the finish" onPointerDown={(e) => startDrag(e, k, 'left')} />
          <span className="gh gh-r" title="Drag: move the finish, keep the start" onPointerDown={(e) => startDrag(e, k, 'right')} />
          <span className="gdot gdot-l" data-handle="start" data-hrow={k} title="Drag to another bar to link (from this start)"
            onPointerDown={(e) => startLink(e, k, 'start')} onPointerMove={onLinkMove} onPointerUp={onLinkEnd} onPointerCancel={onLinkEnd} />
          <span className="gdot gdot-r" data-handle="finish" data-hrow={k} title="Drag to another bar to link (from this finish)"
            onPointerDown={(e) => startLink(e, k, 'finish')} onPointerMove={onLinkMove} onPointerUp={onLinkEnd} onPointerCancel={onLinkEnd} />
        </>
      )}
    </div>
  )

  // ---- column widths: drag the right edge of a header cell (double-click: back to the default) ----
  const colDrag = useRef<null | { c: number; x0: number; w0: number; others: number; prevW?: number }>(null)
  const setCols = (next: number[]) => { if (onCols) onCols(next); else if (project && onChange) onChange(applySettings(project, { tableCols: next })) }
  /** `boundary`: the left handle of a column moves the line between it and its left neighbour (this one grows by what the neighbour gives up). */
  const startColResize = (e: React.PointerEvent, c: number, boundary = false) => {
    e.stopPropagation(); e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    colDrag.current = { c, x0: e.clientX, w0: cols[c], others: TABLE_W - cols[c], prevW: boundary ? cols[c - 1] : undefined }
  }
  const onColMove = (e: React.PointerEvent) => {
    const d = colDrag.current
    if (!d) return
    const dx = (e.clientX - d.x0) / zoom
    if (d.prevW != null) { // boundary with the left neighbour: this column grows when the line goes left
      const gain = Math.round(Math.max(MIN_COL - d.w0, Math.min(MAX_COL - d.w0, d.prevW - MIN_COL, -dx))) // limits: this stays within MIN..MAX, the neighbour keeps MIN_COL
      if (d.w0 + gain !== cols[d.c]) setCols(cols.map((x, i) => (i === d.c ? d.w0 + gain : i === d.c - 1 ? d.prevW! - gain : x)))
      return
    }
    const w = Math.round(Math.min(MAX_COL, Math.max(MIN_COL, d.w0 + dx)))
    if (w !== cols[d.c]) setCols(cols.map((x, i) => (i === d.c ? w : x)))
  }
  /** Excel's "autofit": the narrowest width that shows the whole text of the column on one line (the headers' longest word counts too). */
  const autoFit = (c: number): number => {
    const font = '600 8.5px Calibri, Lato, Inter, sans-serif'
    const texts: string[] = [COL_NAMES[c].split(' ').sort((a, b) => b.length - a.length)[0]]
    for (const a of loc.activities) {
      const actDur = a.actualStart && a.actualFinish && !a.dateBad ? (a.actualFinish.getTime() - a.actualStart.getTime()) / 3_600_000 : null
      texts.push([String(a.no), a.name, a.status, fmtDur(a.durationH), actDur == null ? '' : fmtDur(actDur), fmtShort(a.plannedFinish), fmtShort(a.carriedForecastFinish), fmtVariance(a.carried), pct(a.planPct), pct(a.effectivePct), a.remarks][c])
    }
    const w = Math.max(...texts.map((t) => textWidth(t, font))) + 12
    return Math.round(Math.min(MAX_COL, Math.max(MIN_COL, w)))
  }
  const onColEnd = (e: React.PointerEvent) => {
    colDrag.current = null
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* released */ }
    justDragged.current = true; setTimeout(() => { justDragged.current = false }, 0)
  }

  // ---- row heights: the handles on the top and bottom edges of the picked row ----
  const rowDrag = useRef<null | { k: number; y0: number; h0: number; prevH?: number }>(null)
  const setRowHeights = (ups: { no: number; h: number | undefined }[]) => {
    if (onRowH) onRowH(ups)
    else if (project && onChange) onChange(ups.reduce((p, u) => patchActivity(p, index, u.no, { rowH: u.h }), project))
  }
  /** `top`: the line between this row and the one above (this row grows by what the one above gives up); otherwise the bottom edge. */
  const startRowResize = (e: React.PointerEvent, k: number, top: boolean) => {
    e.stopPropagation(); e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    rowDrag.current = { k, y0: e.clientY, h0: rowHs[k], prevH: top ? rowHs[k - 1] : undefined }
  }
  const onRowMove = (e: React.PointerEvent) => {
    const d = rowDrag.current
    if (!d) return
    const dy = (e.clientY - d.y0) / zoom
    const no = loc.activities[d.k].no
    if (d.prevH != null) {
      const gain = Math.round(Math.max(MIN_ROW_H - d.h0, Math.min(MAX_ROW_H - d.h0, d.prevH - MIN_ROW_H, -dy)))
      if (d.h0 + gain !== rowHs[d.k]) setRowHeights([{ no, h: d.h0 + gain }, { no: loc.activities[d.k - 1].no, h: d.prevH - gain }])
      return
    }
    const h = Math.round(Math.min(MAX_ROW_H, Math.max(MIN_ROW_H, d.h0 + dy)))
    if (h !== rowHs[d.k]) setRowHeights([{ no, h }])
  }
  const onRowEnd = (e: React.PointerEvent) => {
    rowDrag.current = null
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* released */ }
    justDragged.current = true; setTimeout(() => { justDragged.current = false }, 0)
  }

  // ---- typing in a cell ----
  const commitCell = (k: number, c: number, raw: string) => {
    setCellEdit(null)
    if (!project || !onChange) return
    const a = loc.activities[k]
    const v = raw.trim()
    const num = Number(v.replace(',', '.'))
    const ok = v !== '' && Number.isFinite(num)
    const patch = (p: Partial<ActivityInput>) => onChange(patchActivity(project, index, a.no, p))
    if (c === 2) { if (v && v !== a.name) patch({ name: v }) }
    else if (c === 4) { if (ok && num > 0) patch({ durationH: num }) }
    else if (c === 5) {
      // the actual duration is finish − start: typing it sets the actual finish (so it needs an actual start)
      if (ok && num > 0 && a.actualStart) { const f = splitDateTime(new Date(a.actualStart.getTime() + Math.round(num * 60) * 60_000)); patch({ actualFinishDate: f.date, actualFinishTime: f.time, pct: 1 }) }
    } else if (c === 6) {
      const d = parseDateTime(v, false, origin)
      if (d && d !== 'bad') {
        const pa = project.locations[index].activities[k]
        const pr = pa.pred > 0 ? loc.activities.find((x) => x.no === pa.pred) : undefined
        const q = setPlannedFinish(project, index, a.no, a.plannedStartH, Math.round((d.getTime() - origin.getTime()) / 60_000) / 60, pa.rel, pr ? { startH: pr.plannedStartH, finishH: pr.plannedFinishH } : null)
        if (q) onChange(q)
      }
    } else if (c === 10) {
      if (v === '') patch({ pct: null }); else if (ok) patch({ pct: Math.min(1, Math.max(0, num / 100)) })
    } else if (c === 11) { if (v !== a.remarks) patch({ remarks: v }) }
  }

  return (
    <div ref={pageRef} className={`report-page${line ? ' linking' : ''}`} style={{ fontSize: 8.5, width: PAGE_X, height: RL.pageH, ['--ps' as string]: Math.min(1123 / PAGE_X, PAGE_H0 / RL.pageH) }}>
      {/* the SAR logo heads every page, on white */}
      <div style={{ background: '#fff', padding: '4px 10px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <img src={SAR_LOGO_URL} alt="SAR - Saudi Arabia Railways" style={{ height: 26, width: 26 * SAR_LOGO_RATIO, display: 'block' }} />
        <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, color: C.slate }}>SAR.COM.SA</span>
      </div>
      <div style={{ background: C.blue, color: '#fff', fontWeight: 800, fontSize: 15, padding: '5px 12px', letterSpacing: 0.3 }}>
        {pageTitle(s.projectName, layout, loc.name, '  -  ')}
      </div>
      <div style={{ display: 'flex', height: 24, alignItems: 'center', fontWeight: 700, fontSize: 10 }}>
        <div style={{ width: TABLE_W + PA_W, background: C.grey, height: '100%', display: 'flex', alignItems: 'center', gap: 18, padding: '0 10px', color: C.black }}>
          {layout?.cells ? <span>{layout.cells} {unit(layout.kind, layout.cells)}</span> : null}
          {layout?.length ? <span>LENGTH {layout.length}</span> : null}
          <span>ACTUAL {pct(loc.actualPct)}</span>
          <span>PLANNED {pct(loc.planPct)}</span>
          <span>PLAN FINISH {fmtShort(loc.plannedFinish)}</span>
          {(() => { // the buffer to hand-back, as a verdict: late (negative) / on time / ahead
            const b = loc.bufferToHandback
            const v = b < -0.05 ? { t: 'LATE', bg: C.red, fg: '#fff' } : b > 0.05 ? { t: 'AHEAD', bg: C.blue, fg: '#fff' } : { t: 'ON TIME', bg: C.amber, fg: C.black }
            return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>BUFFER TO HAND-BACK <b>{hours1(b)}</b>
              <span style={{ background: v.bg, color: v.fg, fontWeight: 700, fontSize: 9, padding: '1px 7px', borderRadius: 2 }}>{v.t}</span></span>
          })()}
          {planEditable && (
            <button className="no-print" style={{ marginLeft: 'auto', border: `1px solid ${C.blue}`, borderRadius: 3, padding: '1px 8px', background: '#fff', color: C.blue, fontWeight: 700, fontSize: 10, cursor: 'pointer' }}
              title="Add an activity at the end of this location (it follows the last one)"
              onClick={() => { const r = addActivity(project!, index); onChange!(r.project); onSelect?.(r.no, 'baseline') }}>+ Add activity</button>
          )}
        </div>
        <div style={{ flex: 1, background: tone.bg, color: tone.fg, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 22 }}>
          <span>{loc.status}</span>
          <span>FORECAST {fmtShort(loc.forecastFinish)}</span>
          {(late || early) && <span>{hours1(Math.abs(loc.variance))} {late ? 'LATE' : 'EARLY'}</span>}
        </div>
      </div>

      <div ref={flexRef} style={{ display: 'flex', marginTop: 2, position: 'relative' }}
        onMouseOver={(e) => setHover(rowAt(e))}
        onMouseMove={(e) => {
          const tc = (e.target as HTMLElement).closest('[data-tcol]')
          const gr = ganttRef.current
          if (tc) { setHoverTCol(Number(tc.getAttribute('data-tcol'))); setHoverCol(null) }
          else if (gr && gr.contains(e.target as Node)) {
            // screen pixels → layout pixels (the page may be shown zoomed)
            const c = Math.floor(((e.clientX - gr.getBoundingClientRect().left) / zoom - PA_W) / GC)
            setHoverCol(c >= 0 && c < GANTT_COLS ? c : null); setHoverTCol(null)
          } else { setHoverCol(null); setHoverTCol(null) }
        }}
        onMouseLeave={() => { setHover(null); setHoverCol(null); setHoverTCol(null) }}
        onDragOver={(e) => {
          if (dragNo == null) return
          const k = rowAt(e)
          if (k == null) return
          e.preventDefault()
          const box = (e.target as HTMLElement).closest('[data-row]')!.getBoundingClientRect()
          setDropK(e.clientY < box.top + box.height / 2 ? k : k + 1)
        }}
        onDrop={(e) => {
          e.preventDefault()
          const no = dragNo, k = dropK
          setDragNo(null); setDropK(null)
          if (no == null || k == null || !project || !onChange) return
          const before = k >= loc.activities.length ? null : loc.activities[k].no
          if (before === no) return
          const r = moveActivities(project, index, [no], before, (n) => loc.activities.find((a) => a.no === n)?.plannedStartH ?? 0)
          onChange(r.project); onStructure?.()
        }}
        onClick={(e) => { if (justDragged.current) return; const tc = (e.target as HTMLElement).closest('[data-tcol]'); const k = rowAt(e); if (canResize) setSel(tc || k != null ? { k, c: tc ? Number(tc.getAttribute('data-tcol')) : null, x: (e.clientX - flexRef.current!.getBoundingClientRect().left) / zoom } : null); if (k != null) onSelect?.(loc.activities[k].no, (e.target as HTMLElement).closest('[data-lane="actual"]') ? 'actual' : 'baseline') }}>
        {dropK != null && (
          <div className="no-print" style={{ position: 'absolute', left: 0, right: 0, top: 2 * HEAD_H + (dropK < n ? rowTops[dropK] : bodyH) - 1, height: 3, background: C.blue, zIndex: 8, pointerEvents: 'none' }} />
        )}
        {active != null && (
          <div className="no-print" style={{ position: 'absolute', left: 0, right: 0, top: 2 * HEAD_H + rowTops[active], height: rowHs[active], zIndex: 6, pointerEvents: 'none',
            background: 'rgba(241,180,52,0.22)', borderTop: `1.5px solid ${C.amber}`, borderBottom: `1.5px solid ${C.amber}`,
            boxShadow: `inset 4px 0 0 ${selectedIdx >= 0 ? C.black : C.amber}` }} />
        )}
        {hoverTCol != null && (
          <div className="no-print" style={{ position: 'absolute', left: cx(hoverTCol - 1), width: cw(hoverTCol - 1),
            top: 2 * HEAD_H, height: bodyH + TOTAL_H, zIndex: 5, pointerEvents: 'none',
            background: 'rgba(0,119,139,0.10)', borderLeft: `1.5px solid ${C.blue}`, borderRight: `1.5px solid ${C.blue}` }} />
        )}
        {canResize && sel && (() => {
          const { k, c } = sel
          const ci = c == null ? null : c - 1
          const x0 = ci == null ? 0 : cx(ci)
          const x1 = ci == null ? 0 : x0 + cw(ci)
          const yTop = k == null ? 0 : 2 * HEAD_H + rowTops[k]
          const yBot = k == null ? 0 : yTop + rowHs[k]
          // a handle is just a thicker stretch of the cell's edge (hit area wider than what is drawn)
          const t = Math.max(1.5, 3 / zoom), pad = Math.max(2, (matchMedia('(pointer: coarse)').matches ? 8 : 4) / zoom)
          const barStyle = (x: number, y: number, cursor: string, len: number): React.CSSProperties => {
            const vert = cursor === 'col-resize', w = vert ? t + 2 * pad : len, h = vert ? len : t + 2 * pad
            return { position: 'absolute', left: x - w / 2, top: y - h / 2, width: w, height: h, boxSizing: 'border-box', padding: vert ? `0 ${pad}px` : `${pad}px 0`, backgroundClip: 'content-box', backgroundColor: C.blue, zIndex: 9, touchAction: 'none', cursor }
          }
          // the handles sit around the picked cell: left / right = the column, top / bottom = the row (a header cell: the column only)
          const yMid = k == null ? HEAD_H : (yTop + yBot) / 2
          const xMid = ci != null ? (x0 + x1) / 2 : sel.x
                    const colLen = k == null ? HEAD_H : rowHs[k], rowLen = ci != null ? cw(ci) : 80
          return (
            <>
              {ci != null && <div className="no-print" style={{ position: 'absolute', left: x0, width: cw(ci), top: 2 * HEAD_H, height: bodyH + TOTAL_H, zIndex: 4, pointerEvents: 'none', background: 'rgba(0,119,139,0.08)', borderLeft: `1.5px solid ${C.blue}`, borderRight: `1.5px solid ${C.blue}` }} />}
              {ci != null && ci > 0 && (
                <span className="no-print" role="slider" aria-label={`Drag left to widen "${COL_NAMES[ci]}" (the column on its left gives up the space), right to narrow it`} style={barStyle(x0, yMid, 'col-resize', colLen)}
                  onPointerDown={(e) => startColResize(e, ci, true)} onPointerMove={onColMove} onPointerUp={onColEnd} onPointerCancel={onColEnd}></span>
              )}
              {ci != null && (
                <span className="no-print" role="slider" aria-label={`Drag right to widen "${COL_NAMES[ci]}", left to narrow it`} style={barStyle(x1, yMid, 'col-resize', colLen)}
                  onPointerDown={(e) => startColResize(e, ci, false)} onPointerMove={onColMove} onPointerUp={onColEnd} onPointerCancel={onColEnd}></span>
              )}
              {k != null && k > 0 && (
                <span className="no-print" role="slider" aria-label="Drag up to make this row taller (the row above gives up the space), down to make it shorter" style={barStyle(xMid, yTop, 'row-resize', rowLen)}
                  onPointerDown={(e) => startRowResize(e, k, true)} onPointerMove={onRowMove} onPointerUp={onRowEnd} onPointerCancel={onRowEnd}></span>
              )}
              {k != null && (
                <span className="no-print" role="slider" aria-label="Drag down to make this row taller, up to make it shorter (double-click: automatic height)" style={barStyle(xMid, yBot, 'row-resize', rowLen)}
                  onPointerDown={(e) => startRowResize(e, k, false)} onPointerMove={onRowMove} onPointerUp={onRowEnd} onPointerCancel={onRowEnd}
                  onDoubleClick={() => setRowHeights([{ no: loc.activities[k].no, h: undefined }])}></span>
              )}
            </>
          )
        })()}
        {/* ---- table ---- */}
        <div style={{ display: 'grid', width: TABLE_W, flex: 'none',
          gridTemplateColumns: tracks.map((w) => `${w}px`).join(' '),
          gridTemplateRows: `${HEAD_H}px ${HEAD_H}px ${rowHs.map((h) => `${h / 2}px ${h / 2}px`).join(' ')} ${TOTAL_H}px` }}>
          {COL_NAMES.map((h0, c) => { const two = subs(c) === 2; const h = two ? h0.split(' ')[0] : h0; return [
            <div key={h0} data-tcol={c + 1} style={{ ...cellBase, position: 'relative', gridRow: two ? 1 : '1 / span 2', gridColumn: two ? `${gs(c + 1)} / span 2` : gs(c + 1), background: C.slate, color: '#fff', fontWeight: 700, fontSize: 8 }}>
              {h}
              {canResize && (
                <span className="no-print col-rz" title="Drag to change the column width; double-click: fit the content (like Excel's autofit)"
                  onPointerDown={(e) => startColResize(e, c)} onPointerMove={onColMove} onPointerUp={onColEnd} onPointerCancel={onColEnd}
                  onDoubleClick={() => setCols(cols.map((x, i) => (i === c ? autoFit(c) : x)))} />
              )}
            </div>,
            ...(two ? ['Start', 'Finish'].map((t, j) => (
              <div key={`${h0}-${t}`} data-tcol={c + 1} style={{ ...cellBase, gridRow: 2, gridColumn: gs(c + 1) + j, background: C.slate, color: '#fff', fontWeight: 700, fontSize: 8, borderTop: '1px solid rgba(255,255,255,.5)' }}>{t}</div>
            )) : []),
          ] })}
          {rows.map(({ a }, k) => {
            const r = 3 + 2 * k
            const at = activityTone(a.status)
            const bg = k % 2 ? C.tint1 : '#fff'
            const span = (c: number, extra: CSSProperties, content: React.ReactNode, props: React.HTMLAttributes<HTMLDivElement> = {}, off = 0) => (
              <div key={`${k}-${c}-${off}`} data-row={k} data-tcol={c} style={{ ...cellBase, gridRow: `${r} / span 2`, gridColumn: gs(c) + off, background: bg, ...extra }} {...props}>{content}</div>
            )
            /** A cell that can be typed in: double-click it, or click it once its row is selected. */
            const ed = (c: number, shown: React.ReactNode, initial: string, extra: CSSProperties, hint: string, off = 0) => {
              const editing = cellEdit?.k === k && cellEdit.c === c
              return span(c, extra, editing ? (
                <input autoFocus defaultValue={initial} style={{ width: '100%', font: 'inherit', padding: '0 2px', textAlign: 'inherit', color: C.black }}
                  onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
                  onBlur={(e) => { if (e.target.dataset.cancel) setCellEdit(null); else commitCell(k, c, e.target.value) }}
                  onKeyDown={(e) => { const el = e.target as HTMLInputElement; if (e.key === 'Enter') el.blur(); if (e.key === 'Escape') { el.dataset.cancel = '1'; el.blur() } }} />
              ) : shown,
              planEditable ? { title: hint, onDoubleClick: () => setCellEdit({ k, c }),
                onClick: (e) => { if (selectedNo === a.no && !justDragged.current) { e.stopPropagation(); setCellEdit({ k, c }) } } } : {}, off)
            }
            const actDur = a.actualStart && a.actualFinish && !a.dateBad ? (a.actualFinish.getTime() - a.actualStart.getTime()) / 3_600_000 : null
            return [
              span(1, { color: C.slate, ...(planEditable ? { cursor: 'grab' } : {}) }, a.no,
                planEditable ? { draggable: true, title: 'Drag to reorder', onDragStart: (e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(a.no)); setDragNo(a.no) }, onDragEnd: () => { setDragNo(null); setDropK(null) } } : {}),
              ed(2, a.name, a.name, { justifyContent: 'flex-start', textAlign: 'left', fontWeight: 600, color: C.black, fontSize: fitFont(a.name, cols[1], rowHs[k]) }, 'Double-click (or click when selected) to rename'),
              span(3, { background: at.bg, color: at.fg, fontWeight: 700, fontSize: 7.5 }, a.status),
              ed(4, fmtDur(a.durationH), String(a.durationH), {}, 'Baseline duration in hours: double-click to edit'),
              ed(5, actDur == null ? '' : fmtDur(actDur), actDur == null ? '' : String(Math.round(actDur * 100) / 100), {}, 'Actual duration (finish − start): type hours to set the actual finish (needs an actual start)'),
              ...(range ? [span(6, {}, fmtShort(a.plannedStart))] : []),
              ed(6, fmtShort(a.plannedFinish), fmtCell(a.plannedFinish), {}, 'Planned finish: type a date (16-Oct-2026 14:30) — the start stays, the duration changes', range ? 1 : 0),
              ...(range ? [span(7, { fontWeight: 700 }, fmtShort(a.actualStart ?? new Date(a.carriedForecastFinish.getTime() - a.durationH * 3_600_000)))] : []),
              span(7, { fontWeight: 700 }, fmtShort(a.carriedForecastFinish), {}, range ? 1 : 0),
              span(8, { fontWeight: 700, color: varColour[varianceTone(a.carried)] }, fmtVariance(a.carried)),
              span(9, { color: C.slate, fontWeight: 700 }, pct(a.planPct)),
              ed(10, pct(a.effectivePct), String(Math.round(a.effectivePct * 100)), { color: C.blue, fontWeight: 700 }, '% complete: type 0 – 100'),
              ed(11, a.remarks, a.remarks, { justifyContent: 'flex-start', textAlign: 'left', fontSize: fitFont(a.remarks, cols[10], rowHs[k], 7), overflow: 'hidden', padding: '0 3px', color: C.black }, 'Remarks: double-click to write'),
            ]
          })}
          {/* total row */}
          {(() => {
            const r = 3 + 2 * n
            const t = (c: number, extra: CSSProperties, content: React.ReactNode, span = 1, off = 0) => (
              <div key={`t${c}-${off}`} data-tcol={c} style={{ ...cellBase, gridRow: r, gridColumn: `${gs(c) + off} / span ${span}`, background: C.tint2, fontWeight: 700, borderTop: `2px solid ${C.black}`, ...extra }}>{content}</div>
            )
            const actTotal = loc.activities.reduce((sum, a) => sum + (a.actualStart && a.actualFinish && !a.dateBad ? (a.actualFinish.getTime() - a.actualStart.getTime()) / 3_600_000 : 0), 0)
            return [
              t(1, { justifyContent: 'flex-start', textAlign: 'left', paddingLeft: 6 }, `TOTAL - ${layout?.code || loc.name}`, 2),
              t(3, { background: tone.bg, color: tone.fg }, loc.status),
              t(4, {}, fmtDur(loc.totalHours)),
              t(5, {}, actTotal ? fmtDur(actTotal) : ''),
              ...(range ? [t(6, {}, n ? fmtShort(new Date(Math.min(...loc.activities.map((x) => x.plannedStart.getTime())))) : '', 1, 0)] : []),
              t(6, {}, fmtShort(loc.plannedFinish), 1, range ? 1 : 0),
              ...(range ? [t(7, {}, n ? fmtShort(new Date(Math.min(...loc.activities.map((x) => (x.actualStart ?? new Date(x.carriedForecastFinish.getTime() - x.durationH * 3_600_000)).getTime())))) : '', 1, 0)] : []),
              t(7, {}, fmtShort(loc.forecastFinish), 1, range ? 1 : 0),
              t(8, { color: varColour[varianceTone(loc.variance)] }, fmtVariance(loc.variance)),
              t(9, { color: C.slate }, pct(loc.planPct)),
              t(10, { color: C.blue }, pct(loc.actualPct)),
              t(11, {}, ''),
            ]
          })()}
        </div>

        {/* ---- gantt ---- */}
        <div ref={ganttRef} data-gantt="" style={{ position: 'relative', flex: 'none', width: PA_W + GANTT_COLS * GC }}>
          {hoverCol != null && (
            <>
              <div className="no-print" style={{ position: 'absolute', left: PA_W + hoverCol * GC, width: GC, top: 2 * HEAD_H, height: bodyH + TOTAL_H, zIndex: 5, pointerEvents: 'none',
                background: 'rgba(0,119,139,0.13)', borderLeft: `1px solid ${C.blue}`, borderRight: `1px solid ${C.blue}` }} />
              <div className="no-print" style={{ position: 'absolute', zIndex: 7, pointerEvents: 'none', top: HEAD_H, height: HEAD_H, width: 92, textAlign: 'center',
                left: Math.min(PA_W + GANTT_COLS * GC - 92, Math.max(PA_W, PA_W + hoverCol * GC + GC / 2 - 46)),
                background: C.black, color: '#fff', fontSize: 8, fontWeight: 700, lineHeight: `${HEAD_H}px`, borderRadius: 2 }}>
                {fmtShort(colStart(hoverCol))}
              </div>
            </>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: `${PA_W}px repeat(${GANTT_COLS}, ${GC}px)`,
            gridTemplateRows: `${HEAD_H}px ${HEAD_H}px ${rowHs.map((h) => `${h / 2}px ${h / 2}px`).join(' ')} ${TOTAL_H}px` }}>
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
                bars.planned && plannedBar(bars.planned, r, k),
                bars.forecast && barEl(bars.forecast, r + 1, `fc${k}`, k),
                bars.actual && actualBar(bars.actual, r + 1, k),
              ]
            })}
          </div>

          {/* dependency arrows (they print too) and the link being drawn (screen only) */}
          <svg style={{ position: 'absolute', left: 0, top: 0, width: PA_W + GANTT_COLS * GC, height: 2 * HEAD_H + bodyH, pointerEvents: 'none', zIndex: 5 }}>
            <defs>
              <marker id={`arr${index}`} viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill={C.slate} /></marker>
            </defs>
            {arrows.map((a) => <path key={a.key} d={a.d} fill="none" stroke={C.slate} strokeWidth={1} opacity={0.75} markerEnd={`url(#arr${index})`} />)}
            {line && <path d={`M${line.x1},${line.y1} L${line.x2},${line.y2}`} stroke={C.blue} strokeWidth={1.5} strokeDasharray="3 2" fill="none" />}
          </svg>
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

      {remarkItems.length > 0 && (
        <div style={{ fontSize: 8, color: C.black, padding: '3px 6px', borderTop: `1px solid ${C.grey}`, lineHeight: '11px' }} aria-label="Remarks">
          <b style={{ color: C.blue }}>REMARKS (full text)&nbsp;&nbsp;</b>
          {remarkItems.map((a, i) => (
            <span key={a.no}>{i ? <span style={{ color: C.slate }}>&nbsp;&nbsp;│&nbsp;&nbsp;</span> : null}<b>#{a.no}</b> {a.remarks}</span>
          ))}
        </div>
      )}

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

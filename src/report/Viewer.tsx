import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { computeProject } from '../engine/schedule'
import type { SiteLayout } from '../layout/parse'
import { effectiveProject, floatingNow } from '../model/settings'
import type { Project } from '../model/types'
import { Cover } from './Cover'
import { LocationPage, pageWidth } from './LocationPage'
import { coverHeight, coverWidth, rowLayout } from './columns'

const BAR_H = 52

type FsDoc = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void }
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void }

/**
 * The view-only report for phones and tablets: one page per screen, scaled to fit, with previous / next buttons,
 * swipe, a page picker and a full-screen button. Nothing in it can be edited.
 */
export function Viewer({ project, layouts }: { project: Project; layouts: SiteLayout[] }) {
  // a live cut-off ("now") keeps moving while the viewer is open
  const [tick, setTick] = useState(() => Date.now())
  useEffect(() => {
    if (!project.settings.cutoffNow) return
    const t = setInterval(() => setTick(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [project.settings.cutoffNow])
  // column widths can be changed here for the session (the handles on a tapped column); they are not saved
  const [cols, setCols] = useState<number[] | undefined>(project.settings.tableCols)
  const [sum, setSum] = useState<{ cols?: number[]; rows?: (number | null)[] }>({}) // summary table sizes dragged here
  const [rowOv, setRowOv] = useState<Record<string, number | undefined>>({}) // row heights dragged here, by "location:activity"
  const result = useMemo(() => {
    const withRows = { ...project, settings: { ...project.settings, tableCols: cols, ...(sum.cols ? { summaryCols: sum.cols } : {}), ...(sum.rows ? { summaryRows: sum.rows } : {}) }, locations: project.locations.map((l, li) => ({ ...l, activities: l.activities.map((a) => (`${li}:${a.no}` in rowOv ? { ...a, rowH: rowOv[`${li}:${a.no}`] } : a)) })) }
    return computeProject(effectiveProject(withRows, floatingNow(new Date(tick))))
  }, [project, tick, cols, rowOv, sum])

  const titles = ['Summary', ...result.locations.map((l) => l.name)]
  const last = titles.length - 1
  const [i, setI] = useState(0)
  const go = useCallback((d: number) => setI((x) => Math.min(last, Math.max(0, x + d))), [last])

  // window size (the visual viewport: it follows the phone's browser bars)
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  useEffect(() => {
    const on = () => setSize({ w: window.visualViewport?.width ?? window.innerWidth, h: window.visualViewport?.height ?? window.innerHeight })
    on()
    window.addEventListener('resize', on)
    window.visualViewport?.addEventListener('resize', on)
    return () => { window.removeEventListener('resize', on); window.visualViewport?.removeEventListener('resize', on) }
  }, [])

  // full screen: the browser's own where it exists, otherwise a "bare" mode (no bars) that is just as good on an iPhone
  const [native, setNative] = useState(false)
  const [bare, setBare] = useState(false)
  const full = native || bare
  useEffect(() => {
    const on = () => setNative(!!(document.fullscreenElement || (document as FsDoc).webkitFullscreenElement))
    document.addEventListener('fullscreenchange', on)
    document.addEventListener('webkitfullscreenchange', on)
    return () => { document.removeEventListener('fullscreenchange', on); document.removeEventListener('webkitfullscreenchange', on) }
  }, [])
  const enterFull = async () => {
    const el = document.documentElement as FsEl
    try {
      if (el.requestFullscreen) await el.requestFullscreen()
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen()
      else { setBare(true); return }
      try { await (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape') } catch { /* not allowed here */ }
    } catch { setBare(true) }
  }
  const exitFull = async () => {
    setBare(false)
    try { (screen.orientation as unknown as { unlock?: () => void }).unlock?.() } catch { /* ignore */ }
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else (document as FsDoc).webkitExitFullscreen?.()
    } catch { /* already out */ }
  }

  // in full screen the bar fades away after a moment; a tap brings it back
  const [showBar, setShowBar] = useState(true)
  const hideTimer = useRef<number | undefined>(undefined)
  const poke = useCallback(() => {
    setShowBar(true)
    window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setShowBar(false), 3000)
  }, [])
  useEffect(() => { if (full) poke(); else { window.clearTimeout(hideTimer.current); setShowBar(true) } }, [full, poke, i])
  const barVisible = !full || showBar

  // keys and swipes
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') go(1)
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(-1)
      else if (e.key === 'Home') setI(0)
      else if (e.key === 'End') setI(last)
      else if (e.key === 'f' || e.key === 'F') (full ? exitFull() : enterFull())
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  })

  const PAGE_W = i === 0 ? coverWidth(result.settings.summaryCols, cols, result.settings.dateRange) : pageWidth(cols, result.settings.dateRange) // a location page grows when its columns were widened
  const PAGE_H = i === 0 ? coverHeight(result.settings.summaryRows) : rowLayout(result.locations[i - 1].activities).pageH // a location page grows taller when rows were made taller
  const availH = size.h - (full ? 0 : BAR_H)
  const s = Math.max(0.1, Math.min((size.w - 6) / PAGE_W, (availH - 6) / PAGE_H))

  // ---- zoom like a PDF: pinch with two fingers, drag to pan, double-tap to zoom in / back, wheel on a computer ----
  const [zv, setZv] = useState({ z: 1, x: 0, y: 0 })
  const zref = useRef(zv)
  const MAX_Z = 6
  const clampZ = (z: number, x: number, y: number) => {
    const zz = Math.min(MAX_Z, Math.max(1, z))
    const ox = Math.max(0, (PAGE_W * s * zz - size.w) / 2), oy = Math.max(0, (PAGE_H * s * zz - availH) / 2) // the page cannot be dragged off the screen
    return { z: zz, x: Math.min(ox, Math.max(-ox, x)), y: Math.min(oy, Math.max(-oy, y)) }
  }
  const applyZ = (z: number, x: number, y: number) => { const v = clampZ(z, x, y); zref.current = v; setZv(v) }
  useEffect(() => { applyZ(1, 0, 0) }, [i, full, size.w, size.h]) // eslint-disable-line react-hooks/exhaustive-deps
  const stage = useRef<HTMLDivElement>(null)
  const rel = (cx: number, cy: number) => { const r = stage.current!.getBoundingClientRect(); return { x: cx - (r.left + r.width / 2), y: cy - (r.top + r.height / 2) } } // from the stage centre
  const pts = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<null | { d0: number; z0: number; x0: number; y0: number; cx0: number; cy0: number }>(null)
  const tap = useRef<null | { x: number; y: number; moved: boolean; dx: number }>(null)
  const lastTap = useRef(0)
  const zoomAt = (cx: number, cy: number, factor: number) => {
    const { z, x, y } = zref.current
    const nz = Math.min(MAX_Z, Math.max(1, z * factor))
    applyZ(nz, cx - (cx - x) * (nz / z), cy - (cy - y) * (nz / z))
  }
  /** A tap puts the rulers there (the row, the table column or the Gantt time under the finger): the same highlight the mouse gives on a computer. */
  const ruler = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)
    if (!el) return
    for (const type of ['mouseover', 'mousemove', 'click']) el.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }))
  }
  const onDown = (e: React.PointerEvent) => {
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pts.current.size === 1) tap.current = { x: e.clientX, y: e.clientY, moved: false, dx: 0 }
    if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()]
      const m = rel((a.x + b.x) / 2, (a.y + b.y) / 2)
      pinch.current = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: zref.current.z, x0: zref.current.x, y0: zref.current.y, cx0: m.x, cy0: m.y }
      if (tap.current) tap.current.moved = true
    }
  }
  const onMove = (e: React.PointerEvent) => {
    const prev = pts.current.get(e.pointerId)
    if (!prev) return
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pts.current.size >= 2 && pinch.current) {
      const [a, b] = [...pts.current.values()]
      const g = pinch.current
      const nz = Math.min(MAX_Z, Math.max(1, g.z0 * (Math.hypot(a.x - b.x, a.y - b.y) / g.d0)))
      const m = rel((a.x + b.x) / 2, (a.y + b.y) / 2)
      // the point of the page that was under the fingers stays under them, wherever they go
      applyZ(nz, m.x - (g.cx0 - g.x0) * (nz / g.z0), m.y - (g.cy0 - g.y0) * (nz / g.z0))
      return
    }
    const t = tap.current
    if (t && Math.hypot(e.clientX - t.x, e.clientY - t.y) > 8) t.moved = true
    if (t) t.dx = e.clientX - t.x
    if (zref.current.z > 1.001) applyZ(zref.current.z, zref.current.x + (e.clientX - prev.x), zref.current.y + (e.clientY - prev.y))
  }
  const onUp = (e: React.PointerEvent) => {
    const wasPinch = pts.current.size >= 2
    pts.current.delete(e.pointerId)
    if (wasPinch) { pinch.current = null; pts.current.clear(); return }
    const t = tap.current
    tap.current = null
    if (!t) return
    if (!t.moved) {
      const now = Date.now()
      if (now - lastTap.current < 320) { // double tap: zoom in there, or back out
        lastTap.current = 0
        const c = rel(e.clientX, e.clientY)
        if (zref.current.z > 1.05) applyZ(1, 0, 0); else zoomAt(c.x, c.y, 2.5)
      } else { lastTap.current = now; ruler(e.clientX, e.clientY); if (full) poke() }
    } else if (zref.current.z <= 1.02 && Math.abs(t.dx) > 60) go(t.dx < 0 ? 1 : -1) // swipe to the next / previous page (only when not zoomed)
  }
  useEffect(() => {
    const el = stage.current
    if (!el) return
    const on = (e: WheelEvent) => { e.preventDefault(); const c = rel(e.clientX, e.clientY); zoomAt(c.x, c.y, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025))) }
    el.addEventListener('wheel', on, { passive: false })
    return () => el.removeEventListener('wheel', on)
  }) // eslint-disable-line react-hooks/exhaustive-deps
  const portrait = size.h > size.w * 1.1

  const btn = 'rounded bg-white/15 px-3 py-2 text-sm font-semibold text-white active:bg-white/30 disabled:opacity-30'
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#cfd6d8', overflow: 'hidden', userSelect: 'none', WebkitUserSelect: 'none' }}>
      <div ref={stage} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: availH, display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none', overflow: 'hidden' }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onTouchEnd={(e) => { if (e.cancelable) e.preventDefault() /* no emulated mouse events: they would clear the rulers */ }}>
        <div style={{ width: PAGE_W * s, height: PAGE_H * s, position: 'relative', boxShadow: '0 2px 10px rgba(0,0,0,.25)', transform: `translate(${zv.x}px, ${zv.y}px) scale(${zv.z})`, transformOrigin: 'center center' }}>
          <div style={{ width: PAGE_W, height: PAGE_H, transform: `scale(${s})`, transformOrigin: '0 0' }}>
            {i === 0
              ? <div className="report-page" style={{ width: PAGE_W, height: PAGE_H }}><Cover result={result} layouts={layouts} zoom={s * zv.z} onSummary={(c, r) => setSum({ cols: c, rows: r })} /></div>
              : <LocationPage result={result} index={i - 1} layout={layouts[i - 1]} onCols={setCols} onRowH={(ups) => setRowOv((o) => ({ ...o, ...Object.fromEntries(ups.map((u) => [`${i - 1}:${u.no}`, u.h])) }))} zoom={s * zv.z} />}
          </div>
        </div>
      </div>

      {portrait && !full && (
        <div style={{ position: 'absolute', top: 6, left: 0, right: 0, textAlign: 'center', pointerEvents: 'none' }}>
          <span style={{ background: 'rgba(61,57,53,.85)', color: '#fff', fontSize: 12, padding: '3px 10px', borderRadius: 12 }}>Rotate the phone for a bigger page</span>
        </div>
      )}

      {/* the control bar: previous / page picker / next / full screen */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: BAR_H, background: 'rgba(61,57,53,.94)', display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px',
        transition: 'opacity .25s, transform .25s', opacity: barVisible ? 1 : 0, transform: barVisible ? 'none' : 'translateY(100%)', pointerEvents: barVisible ? 'auto' : 'none',
      }}>
        <button className={btn} disabled={i === 0} onClick={() => go(-1)} aria-label="Previous page">◀ Prev</button>
        <select aria-label="Page" value={i} onChange={(e) => setI(Number(e.target.value))}
          style={{ flex: 1, minWidth: 0, background: 'rgba(255,255,255,.12)', color: '#fff', border: 0, borderRadius: 4, padding: '9px 6px', fontSize: 13, fontWeight: 600 }}>
          {titles.map((t, k) => <option key={k} value={k} style={{ color: '#000' }}>{k + 1} / {titles.length} · {t}</option>)}
        </select>
        <button className={btn} disabled={i === last} onClick={() => go(1)} aria-label="Next page">Next ▶</button>
        {zv.z > 1.05 && <button className={btn} onClick={() => applyZ(1, 0, 0)} aria-label="Fit to screen">Fit</button>}
        <button className={btn} style={{ background: '#00778B' }} onClick={() => (full ? exitFull() : enterFull())} aria-label={full ? 'Exit full screen' : 'Full screen'}>{full ? '✕ Exit full screen' : '⛶ Full screen'}</button>
      </div>

      {/* full screen with the bar hidden: a small page counter and an always-there way out */}
      {full && !barVisible && (
        <>
          <span style={{ position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)', background: 'rgba(61,57,53,.7)', color: '#fff', fontSize: 11, padding: '2px 8px', borderRadius: 10, pointerEvents: 'none' }}>{i + 1} / {titles.length}</span>
          <button onClick={exitFull} aria-label="Exit full screen" style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(61,57,53,.7)', color: '#fff', border: 0, borderRadius: 14, padding: '4px 10px', fontSize: 12 }}>✕</button>
        </>
      )}
    </div>
  )
}

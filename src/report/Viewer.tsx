import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { computeProject } from '../engine/schedule'
import type { SiteLayout } from '../layout/parse'
import { effectiveProject, floatingNow } from '../model/settings'
import type { Project } from '../model/types'
import { Cover } from './Cover'
import { LocationPage } from './LocationPage'

const PAGE_W = 1123
const PAGE_H = 794
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
  const result = useMemo(() => computeProject(effectiveProject(project, floatingNow(new Date(tick)))), [project, tick])

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
  const touch = useRef<{ x: number; y: number } | null>(null)

  const availH = size.h - (full ? 0 : BAR_H)
  const s = Math.max(0.1, Math.min((size.w - 6) / PAGE_W, (availH - 6) / PAGE_H))
  const portrait = size.h > size.w * 1.1

  const btn = 'rounded bg-white/15 px-3 py-2 text-sm font-semibold text-white active:bg-white/30 disabled:opacity-30'
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#cfd6d8', overflow: 'hidden', touchAction: 'pan-y pinch-zoom' }}
      onClick={() => full && poke()}
      onTouchStart={(e) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY } }}
      onTouchEnd={(e) => {
        const a = touch.current, t = e.changedTouches[0]
        touch.current = null
        if (!a) return
        const dx = t.clientX - a.x, dy = t.clientY - a.y
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1)
      }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: availH, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: PAGE_W * s, height: PAGE_H * s, position: 'relative', boxShadow: '0 2px 10px rgba(0,0,0,.25)' }}>
          <div style={{ width: PAGE_W, height: PAGE_H, transform: `scale(${s})`, transformOrigin: '0 0' }}>
            {i === 0
              ? <div className="report-page"><Cover result={result} layouts={layouts} /></div>
              : <LocationPage result={result} index={i - 1} layout={layouts[i - 1]} />}
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
      }} onClick={(e) => e.stopPropagation()}>
        <button className={btn} disabled={i === 0} onClick={() => go(-1)} aria-label="Previous page">◀ Prev</button>
        <select aria-label="Page" value={i} onChange={(e) => setI(Number(e.target.value))}
          style={{ flex: 1, minWidth: 0, background: 'rgba(255,255,255,.12)', color: '#fff', border: 0, borderRadius: 4, padding: '9px 6px', fontSize: 13, fontWeight: 600 }}>
          {titles.map((t, k) => <option key={k} value={k} style={{ color: '#000' }}>{k + 1} / {titles.length} · {t}</option>)}
        </select>
        <button className={btn} disabled={i === last} onClick={() => go(1)} aria-label="Next page">Next ▶</button>
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

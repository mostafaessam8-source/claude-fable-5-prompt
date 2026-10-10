/**
 * What dragging a planned Gantt bar means, per relationship. The planned start of an activity is
 *   FS: finish(pred) + lag   SS: start(pred) + lag   FF: finish(pred) + lag − dur   SF: start(pred) + lag − dur
 * (no predecessor: the lag is the start). So each handle is expressed as a change of the lag and/or the duration.
 */
import type { Rel } from '../model/types'

export type DragMode = 'move' | 'left' | 'right'
export const MIN_DUR = 0.25 // hours
const round = (x: number) => Math.round(x * 60) / 60

/**
 * The new lag and duration after dragging by `delta` hours.
 *  - move : both ends shift by delta (the lag moves; the duration stays)
 *  - left : the START moves by delta, the finish stays
 *  - right: the FINISH moves by delta, the start stays
 */
export function dragPatch(mode: DragMode, rel: Rel, hasPred: boolean, lag0: number, dur0: number, delta: number): { lagH: number; durationH: number } {
  const finishLinked = hasPred && (rel === 'FF' || rel === 'SF') // the lag fixes the FINISH, not the start
  if (mode === 'move') {
    const lag = hasPred ? lag0 + delta : Math.max(0, lag0 + delta) // with no predecessor the lag is the start: not before hour 0
    return { lagH: round(lag), durationH: dur0 }
  }
  if (mode === 'left') {
    let dd = Math.min(delta, dur0 - MIN_DUR)
    if (!hasPred) dd = Math.max(dd, -lag0)
    return finishLinked ? { lagH: lag0, durationH: round(dur0 - dd) } : { lagH: round(lag0 + dd), durationH: round(dur0 - dd) }
  }
  const dd = Math.max(delta, MIN_DUR - dur0)
  return finishLinked ? { lagH: round(lag0 + dd), durationH: round(dur0 + dd) } : { lagH: lag0, durationH: round(dur0 + dd) }
}

/** The relationship made by dragging from the predecessor's edge to the successor's edge. */
export function relFromEdges(predEdge: 'start' | 'finish', succEdge: 'start' | 'finish'): Rel {
  if (predEdge === 'finish') return succEdge === 'start' ? 'FS' : 'FF'
  return succEdge === 'start' ? 'SS' : 'SF'
}

/**
 * A link drawn between two handles. The predecessor must be the EARLIER activity, so the drag works from either
 * end: whichever bar has the smaller number is the predecessor. Null when both are the same activity.
 */
export function linkFromHandles(
  a: { k: number; edge: 'start' | 'finish' }, b: { k: number; edge: 'start' | 'finish' },
): { predK: number; succK: number; rel: Rel } | null {
  if (a.k === b.k) return null
  const [pred, succ] = a.k < b.k ? [a, b] : [b, a]
  return { predK: pred.k, succK: succ.k, rel: relFromEdges(pred.edge, succ.edge) }
}

/**
 * Dragging the ACTUAL bar changes the actual start / finish (hours since the possession start):
 *  - move : the start moves by delta, and the finish with it when there is one
 *  - left : the start moves by delta
 *  - right: the finish moves by delta; work still in progress has no finish, so its drawn end (`endH`) becomes one
 * The start never goes before hour 0 and the bar never shrinks below MIN_DUR.
 */
export function actualDragPatch(
  mode: DragMode, startH: number, finishH: number | null, endH: number, delta: number,
): { startH: number; finishH: number | null } {
  const r = (x: number) => Math.round(x * 60) / 60
  if (mode === 'move') {
    const s = Math.max(0, startH + delta)
    return { startH: r(s), finishH: finishH == null ? null : r(finishH + (s - startH)) }
  }
  if (mode === 'left') {
    const s = Math.min(Math.max(0, startH + delta), (finishH ?? endH) - MIN_DUR)
    return { startH: r(s), finishH: finishH == null ? null : r(finishH) }
  }
  return { startH: r(startH), finishH: r(Math.max((finishH ?? endH) + delta, startH + MIN_DUR)) }
}

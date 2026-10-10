import { useCallback, useRef, useState } from 'react'

/**
 * State with undo/redo. Edits that arrive in quick succession (a drag, typing) are one undo step:
 * a step is recorded only when the previous edit is older than `burstMs` or is a different kind of change (`sameKind` false).
 */
export function useHistory<T>(initial: T, sameKind: (a: T, b: T) => boolean = () => true, burstMs = 700) {
  const [present, setPresent] = useState<T>(initial)
  const past = useRef<T[]>([])
  const future = useRef<T[]>([])
  const last = useRef(0)
  const cur = useRef(present)
  const [, bump] = useState(0)

  const set = useCallback((next: T) => {
    const now = Date.now()
    if (now - last.current > burstMs || !sameKind(cur.current, next)) {
      past.current.push(cur.current)
      if (past.current.length > 100) past.current.shift()
    }
    last.current = now
    future.current = []
    cur.current = next
    setPresent(next)
  }, [burstMs, sameKind])

  /** Replace the state without making an undo step (a new import starts a fresh history). */
  const reset = useCallback((next: T) => {
    past.current = []; future.current = []; last.current = 0
    cur.current = next
    setPresent(next)
    bump((n) => n + 1)
  }, [])

  const undo = useCallback(() => {
    const p = past.current.pop()
    if (p === undefined) return
    future.current.push(cur.current)
    last.current = 0
    cur.current = p
    setPresent(p)
    bump((n) => n + 1)
  }, [])
  const redo = useCallback(() => {
    const f = future.current.pop()
    if (f === undefined) return
    past.current.push(cur.current)
    last.current = 0
    cur.current = f
    setPresent(f)
    bump((n) => n + 1)
  }, [])

  return { value: present, set, reset, undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0 }
}

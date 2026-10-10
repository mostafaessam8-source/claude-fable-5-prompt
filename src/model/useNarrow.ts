import { useEffect, useState } from 'react'

/** True on a phone-sized screen (narrower than `px`): the layout switches to the mobile one. */
export function useNarrow(px = 800): boolean {
  const q = typeof window === 'undefined' ? null : window.matchMedia(`(max-width: ${px - 1}px)`)
  const [narrow, setNarrow] = useState(!!q?.matches)
  useEffect(() => {
    if (!q) return
    const on = () => setNarrow(q.matches)
    on()
    q.addEventListener('change', on)
    return () => q.removeEventListener('change', on)
  }, [q])
  return narrow
}

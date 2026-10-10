import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { ProjectResult } from '../engine/schedule'
import type { SiteLayout } from '../layout/parse'
import { Cover } from './Cover'
import type { Project } from '../model/types'
import { ActivityPanel } from './ActivityPanel'
import { LocationPage } from './LocationPage'

export const PAGE_W = 1123 // A4 landscape at 96 dpi
export const PAGE_H = 794

export function ReportView({ result, layouts, project, onChange }: {
  result: ProjectResult; layouts: SiteLayout[]
  project: Project; onChange: (p: Project) => void
}) {
  const [selected, setSelected] = useState<{ loc: number; no: number } | null>(null)
  const close = useCallback(() => setSelected(null), [])
  const box = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const fit = () => setZoom(Math.min(1, (el.clientWidth - 8) / PAGE_W))
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <>
    <div ref={box} className="report-wrap">
      <div className="report-zoom" style={{ ['--z' as string]: zoom }}>
        <div className="report-page"><Cover result={result} layouts={layouts} /></div>
        {result.locations.map((_, i) => (
          <LocationPage key={i} result={result} index={i} layout={layouts[i]}
            selectedNo={selected?.loc === i ? selected.no : null} onSelect={(no) => setSelected({ loc: i, no })} />
        ))}
      </div>
    </div>
    {selected && (
      <ActivityPanel project={project} result={result} loc={selected.loc} no={selected.no}
        onChange={onChange} onSelect={(no) => setSelected({ loc: selected.loc, no })} onClose={close} />
    )}
    </>
  )
}
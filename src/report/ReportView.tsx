import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { ProjectResult } from '../engine/schedule'
import type { SiteLayout } from '../layout/parse'
import { Cover } from './Cover'
import type { Project } from '../model/types'
import { ActivityPanel, type PanelTab } from './ActivityPanel'
import { LocationPage } from './LocationPage'

export const PAGE_W = 1123 // A4 landscape at 96 dpi
export const PAGE_H = 794

export function ReportView({ result, layouts, project, onChange, showLinks = true }: {
  result: ProjectResult; layouts: SiteLayout[]
  project: Project; onChange: (p: Project) => void
  showLinks?: boolean
}) {
  const [selected, setSelected] = useState<{ loc: number; no: number; tab: PanelTab } | null>(null)
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
          <LocationPage key={i} result={result} index={i} layout={layouts[i]} project={project} onChange={onChange} zoom={zoom} showLinks={showLinks}
            selectedNo={selected?.loc === i ? selected.no : null} onSelect={(no, lane) => setSelected((s0) => ({ loc: i, no, tab: lane === 'actual' ? 'actual' : s0 && s0.loc === i && s0.no === no ? s0.tab : 'baseline' }))} />
        ))}
      </div>
    </div>
    {selected && (
      <ActivityPanel project={project} result={result} loc={selected.loc} no={selected.no} tab={selected.tab}
        onTab={(tab) => setSelected({ ...selected, tab })} onChange={onChange}
        onSelect={(no) => setSelected({ loc: selected.loc, no, tab: selected.tab })} onClose={close} />
    )}
    </>
  )
}
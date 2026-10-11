import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { ProjectResult } from '../engine/schedule'
import type { SiteLayout } from '../layout/parse'
import { Cover } from './Cover'
import type { Project } from '../model/types'
import { useNarrow } from '../model/useNarrow'
import { OFFLINE } from '../offline/offline'
import { DATES_W, DatesPanel } from './DatesPanel'
import { LINKS_W, LinksPanel } from './LinksPanel'
import { ActivityPanel, PANEL_W, type PanelTab } from './ActivityPanel'
import { LocationPage, pageWidth } from './LocationPage'
import { coverHeight, coverWidth } from './columns'
import { applySettings } from '../model/settings'

export const PAGE_W = 1123 // A4 landscape at 96 dpi
export const PAGE_H = 794

export type Selected = { loc: number; no: number; tab: PanelTab }

/** The details panel opens only from the button in the top bar (never by itself when a row is clicked / tapped). */
export function useManualPanel() {
  return true
}

export function ReportView({ result, layouts, project, onChange, showLinks = true, selected, setSelected, panelOpen, setPanelOpen, datesOpen, setDatesOpen, linksOpen, setLinksOpen }: {
  result: ProjectResult; layouts: SiteLayout[]
  project: Project; onChange: (p: Project) => void
  showLinks?: boolean
  selected: Selected | null; setSelected: (s: Selected | null | ((s: Selected | null) => Selected | null)) => void
  panelOpen: boolean; setPanelOpen: (b: boolean) => void
  datesOpen: boolean; setDatesOpen: (b: boolean) => void
  linksOpen: boolean; setLinksOpen: (b: boolean) => void
}) {
  const manual = useManualPanel()
  const show = !!selected && (!manual || panelOpen)
  const close = useCallback(() => { if (manual) setPanelOpen(false); else setSelected(null) }, [manual, setPanelOpen, setSelected])
  const dropSel = useCallback(() => { setSelected(null); setPanelOpen(false); setDatesOpen(false); setLinksOpen(false) }, [setSelected, setPanelOpen, setDatesOpen, setLinksOpen])
  const box = useRef<HTMLDivElement>(null)
  const narrow = useNarrow()
  const pageW = Math.max(pageWidth(project.settings.tableCols, project.settings.dateRange), coverWidth(project.settings.summaryCols, project.settings.tableCols, project.settings.dateRange)) // the widest page: widened columns make the pages wider
  const [zoom, setZoom] = useState(1)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    // on a phone the page is shown at least half size and scrolls sideways, instead of shrinking to a postage stamp
    const fit = () => setZoom(Math.min(1, Math.max(narrow ? 0.5 : 0, (el.clientWidth - 8) / pageW)))
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [narrow, pageW])

  return (
    <>
    <div ref={box} className="report-wrap" style={{ marginRight: !narrow ? (show ? PANEL_W : selected && datesOpen ? DATES_W : selected && linksOpen ? LINKS_W : 0) : 0 }}>
      <div className="report-zoom" style={{ ['--z' as string]: zoom }}>
        <div className="report-page" style={{ width: coverWidth(project.settings.summaryCols, project.settings.tableCols, project.settings.dateRange), height: coverHeight(project.settings.summaryRows), ['--ps' as string]: Math.min(1123 / coverWidth(project.settings.summaryCols, project.settings.tableCols, project.settings.dateRange), 794 / coverHeight(project.settings.summaryRows)) }}>
          <Cover result={result} layouts={layouts} zoom={zoom} onSummary={(summaryCols, summaryRows) => onChange(applySettings(project, { summaryCols, summaryRows }))} />
        </div>
        {result.locations.map((_, i) => (
          <LocationPage key={i} result={result} index={i} layout={layouts[i]} project={project} onChange={onChange} onStructure={dropSel} zoom={zoom} showLinks={showLinks}
            selectedNo={selected?.loc === i ? selected.no : null} onSelect={(no, lane) => setSelected((s0) => ({ loc: i, no, tab: lane === 'actual' || OFFLINE ? 'actual' : s0 && s0.loc === i && s0.no === no ? s0.tab : 'baseline' }))} />
        ))}
      </div>
    </div>
    {selected && show && project.locations[selected.loc]?.activities.some((a) => a.no === selected.no) && (
      <ActivityPanel project={project} result={result} loc={selected.loc} no={selected.no} tab={selected.tab}
        onTab={(tab) => setSelected({ ...selected, tab })} onChange={onChange}
        onSelect={(no) => setSelected({ loc: selected.loc, no, tab: selected.tab })} onClose={close} />
    )}
    {selected && datesOpen && !show && project.locations[selected.loc]?.activities.some((a) => a.no === selected.no) && (
      <DatesPanel project={project} result={result} loc={selected.loc} no={selected.no} onChange={onChange} onClose={() => setDatesOpen(false)} />
    )}
    {selected && linksOpen && !show && !datesOpen && project.locations[selected.loc]?.activities.some((a) => a.no === selected.no) && (
      <LinksPanel project={project} result={result} loc={selected.loc} no={selected.no} onChange={onChange}
        onSelect={(no) => setSelected({ loc: selected.loc, no, tab: selected.tab })} onClose={() => setLinksOpen(false)} />
    )}
    </>
  )
}
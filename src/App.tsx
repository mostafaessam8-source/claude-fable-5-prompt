import { useEffect, useMemo, useState } from 'react'
import { computeProject } from './engine/schedule'
import { exportXlsx } from './export'
import { cardsPng } from './export/raster'
import { ImportError, parseWorkbook } from './import/parse'
import { LayoutForm } from './layout/LayoutForm'
import { LinksReview } from './links/LinksReview'
import { parseLayout, type SiteLayout } from './layout/parse'
import { applyUpdate, diffUpdate, type UpdateDiff } from './import/update'
import { UpdateReview } from './report/UpdateReview'
import { ActivityEditor } from './report/ActivityEditor'
import { useHistory } from './model/history'
import { clearProject, loadProject, saveProject, type Saved } from './model/store'
import type { Project } from './model/types'
import { ReportView } from './report/ReportView'
import { SettingsBar } from './SettingsBar'

type Tab = 'import' | 'layout' | 'links' | 'report' | 'activities'

/** Edits that only move dates (a drag) merge into one undo step; adding, deleting, reordering or renaming activities each get their own. */
const sameShape = (x: Saved | null, y: Saved | null) => {
  const a = x?.project, b = y?.project
  return !!a && !!b && a.locations.length === b.locations.length && a.locations.every((l, i) => l.name === b.locations[i].name) &&
  a.locations.every((l, i) => l.activities.length === b.locations[i].activities.length && l.activities.every((x, k) => x.name === b.locations[i].activities[k].name))
}

export function App() {
  const saved = useMemo(loadProject, [])
  // project and site layouts share one history: adding, deleting or moving a location changes both
  const history = useHistory<Saved | null>(saved ?? null, sameShape)
  const project = history.value?.project ?? null
  const layouts = history.value?.layouts ?? []
  const setProject = (p: Project) => history.set({ project: p, layouts })
  const setLayouts = (l: SiteLayout[]) => { if (project) history.set({ project, layouts: l }) }
  const setBoth = (e: { project: Project; layouts: SiteLayout[] }) => history.set(e)
  const [tab, setTab] = useState<Tab>(saved ? 'report' : 'import')
  const [error, setError] = useState<string | null>(null)
  const [showLinks, setShowLinks] = useState(true)
  const [update, setUpdate] = useState<{ name: string; diff: UpdateDiff } | null>(null)

  // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y (not while typing in a field, which has its own undo)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select, [contenteditable]') || !(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); history.undo() }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); history.redo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [history.undo, history.redo])

  useEffect(() => { if (project) saveProject({ project, layouts }) }, [project, layouts])

  async function onFile(file: File | undefined) {
    if (!file) return
    setError(null)
    try {
      const p = await parseWorkbook(await file.arrayBuffer())
      history.reset({ project: p, layouts: p.locations.map((l) => parseLayout(l.name, l.scope)) })
      setTab('report')
    } catch (e) {
      setError(e instanceof ImportError ? e.message : `Unexpected error: ${(e as Error).message}`)
    }
  }

  /** The workbook the contractor sent back: compare it with the project and let the user review the differences. */
  async function onUpdateFile(file: File | undefined) {
    if (!file || !project) return
    setError(null)
    try {
      const incoming = await parseWorkbook(await file.arrayBuffer())
      setUpdate({ name: file.name, diff: diffUpdate(project, incoming) })
    } catch (e) {
      setError(e instanceof ImportError ? e.message : `Could not read that file: ${(e as Error).message}`)
    }
  }

  async function onExport() {
    if (!project) return
    setError(null)
    try {
      // The picture is a nicety: if the browser cannot rasterise it, export the workbook without it.
      const cards = await cardsPng(layouts).catch(() => undefined)
      const bytes = await exportXlsx(project, layouts, { cards })
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `${project.settings.projectName.replace(/[^\w.-]+/g, '_') || 'Possession'}_Progress_Tracker.xlsx`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (e) {
      setError(`Export failed: ${(e as Error).message}`)
    }
  }

  const result = useMemo(() => (project ? computeProject(project) : null), [project])
  const total = project?.locations.reduce((n, l) => n + l.activities.length, 0) ?? 0
  const tabBtn = (t: Tab, label: string) => (
    <button onClick={() => setTab(t)} className={`px-4 py-1.5 text-sm font-semibold ${tab === t ? 'bg-[#00778B] text-white' : 'bg-white text-[#3D3935]'}`}>{label}</button>
  )

  return (
    <div>
      <header className="no-print flex items-center gap-3 bg-[#3D3935] px-4 py-2 text-white">
        <h1 className="text-base font-bold">SAR Possession Tracker</h1>
        <span className="mr-4 text-[10px] text-white/60" title="Version of this deployed page: if it is older than your last merge, press Ctrl+F5">build {__BUILD__}</span>
        <input type="file" accept=".xlsx" onChange={(e) => onFile(e.target.files?.[0])} className="text-sm" />
        <span className="flex-1" />
        {project && <button className="rounded border border-white/40 px-2 py-1 text-sm disabled:opacity-30" disabled={!history.canUndo} onClick={history.undo} title="Undo (Ctrl+Z)">↶ Undo</button>}
        {project && <button className="rounded border border-white/40 px-2 py-1 text-sm disabled:opacity-30" disabled={!history.canRedo} onClick={history.redo} title="Redo (Ctrl+Shift+Z)">↷ Redo</button>}
        {project && (
          <label className="cursor-pointer rounded border border-[#F1B434] px-3 py-1 text-sm font-semibold text-[#F1B434]" title="Choose the workbook the contractor sent back: you review every difference before anything changes">
            Import contractor update
            <input type="file" accept=".xlsx" className="hidden" onChange={(e) => { onUpdateFile(e.target.files?.[0]); e.target.value = '' }} />
          </label>
        )}
        {project && <button className="rounded bg-[#F1B434] px-3 py-1 text-sm font-semibold text-[#3D3935]" onClick={onExport} title="Download the tracker workbook to send to the contractor: they fill in the yellow cells (actual dates, % complete, REMARKS) and send it back; use Import contractor update to bring it in">Export to Excel</button>}
        {project && <button className="rounded bg-[#00778B] px-3 py-1 text-sm font-semibold" onClick={() => window.print()}>Print / PDF</button>}
        {project && <button className="rounded border border-white/40 px-3 py-1 text-sm" onClick={() => { clearProject(); history.reset(null); setTab('import') }}>Clear</button>}
      </header>
      {update && project && (
        <UpdateReview project={project} diff={update.diff} fileName={update.name} onCancel={() => setUpdate(null)}
          onApply={(acc) => { setProject(applyUpdate(project, update.diff, acc)); setUpdate(null) }} />
      )}
      {error && <p className="no-print border-l-4 border-[#CB2C30] bg-red-50 p-3 text-[#CB2C30]">{error}</p>}
      {project && result && (
        <>
          <div className="no-print flex border-b border-slate-300">{tabBtn('report', 'Report')}{tabBtn('activities', 'Activities')}{tabBtn('layout', 'Site layout')}{tabBtn('links', 'Relationships')}{tabBtn('import', 'Imported data (JSON)')}</div>
          {tab === 'report' && (
            <>
              {project.warnings.length > 0 && (
                <div className="no-print flex items-center gap-3 border-l-4 border-[#F1B434] bg-amber-50 px-3 py-2 text-sm">
                  <span>
                    <b>{project.warnings.length} import warning{project.warnings.length === 1 ? '' : 's'}</b> — some can mean the source file itself has errors
                    (e.g. {project.warnings.find((w) => /earlier than the row above|blank in the source|span is/.test(w)) ?? project.warnings[0]})
                  </span>
                  <button className="shrink-0 rounded border border-amber-600 px-2 py-0.5 font-semibold" onClick={() => setTab('import')}>Show all</button>
                </div>
              )}
              <SettingsBar project={project} onChange={setProject} showLinks={showLinks} onShowLinks={setShowLinks} />
              <ReportView result={result} layouts={layouts} project={project} onChange={setProject} showLinks={showLinks} />
            </>
          )}
          {tab === 'activities' && (
            <ActivityEditor project={project} layouts={layouts} result={result} onChange={setProject} onBoth={setBoth} />
          )}
          {tab === 'layout' && (
            <LayoutForm layouts={layouts} names={project.locations.map((l) => l.name)} onChange={setLayouts} />
          )}
          {tab === 'links' && (
            <LinksReview project={project} result={result} />
          )}
          {tab === 'import' && (
            <main className="mx-auto max-w-5xl p-6">
              <p className="mb-2 font-semibold text-[#00778B]">
                {project.locations.length} locations × {project.activityRowsPerLocation} rows — {total} active activities
              </p>
              <div className="mb-3 max-h-72 overflow-auto">
                {project.warnings.map((w) => (
                  <p key={w} className="mb-1 border-l-4 border-[#F1B434] bg-amber-50 p-2 text-sm">{w}</p>
                ))}
              </div>
              <pre className="max-h-[70vh] overflow-auto bg-[#F2F8F9] p-3 text-xs">{JSON.stringify(project, null, 2)}</pre>
            </main>
          )}
        </>
      )}
      {!project && <p className="no-print p-6 text-slate-600">Choose a possession tracker .xlsx to begin.</p>}
    </div>
  )
}

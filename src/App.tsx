import { useEffect, useMemo, useState } from 'react'
import { computeProject } from './engine/schedule'
import { ImportError, parseWorkbook } from './import/parse'
import { LayoutForm } from './layout/LayoutForm'
import { parseLayout, type SiteLayout } from './layout/parse'
import { clearProject, loadProject, saveProject } from './model/store'
import type { Project } from './model/types'
import { ReportView } from './report/ReportView'
import { SettingsBar } from './SettingsBar'

type Tab = 'import' | 'layout' | 'report'

export function App() {
  const saved = useMemo(loadProject, [])
  const [project, setProject] = useState<Project | null>(saved?.project ?? null)
  const [layouts, setLayouts] = useState<SiteLayout[]>(saved?.layouts ?? [])
  const [tab, setTab] = useState<Tab>(saved ? 'report' : 'import')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { if (project) saveProject({ project, layouts }) }, [project, layouts])

  async function onFile(file: File | undefined) {
    if (!file) return
    setError(null)
    try {
      const p = await parseWorkbook(await file.arrayBuffer())
      setProject(p)
      setLayouts(p.locations.map((l) => parseLayout(l.name, l.scope)))
      setTab('report')
    } catch (e) {
      setError(e instanceof ImportError ? e.message : `Unexpected error: ${(e as Error).message}`)
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
        <h1 className="mr-4 text-base font-bold">SAR Possession Tracker</h1>
        <input type="file" accept=".xlsx" onChange={(e) => onFile(e.target.files?.[0])} className="text-sm" />
        <span className="flex-1" />
        {project && <button className="rounded bg-[#00778B] px-3 py-1 text-sm font-semibold" onClick={() => window.print()}>Print / PDF</button>}
        {project && <button className="rounded border border-white/40 px-3 py-1 text-sm" onClick={() => { clearProject(); setProject(null); setLayouts([]); setTab('import') }}>Clear</button>}
      </header>
      {error && <p className="no-print border-l-4 border-[#CB2C30] bg-red-50 p-3 text-[#CB2C30]">{error}</p>}
      {project && result && (
        <>
          <div className="no-print flex border-b border-slate-300">{tabBtn('report', 'Report')}{tabBtn('layout', 'Site layout')}{tabBtn('import', 'Imported data (JSON)')}</div>
          {tab === 'report' && (
            <>
              <SettingsBar project={project} onChange={setProject} />
              <ReportView result={result} layouts={layouts} />
            </>
          )}
          {tab === 'layout' && (
            <LayoutForm layouts={layouts} names={project.locations.map((l) => l.name)} onChange={setLayouts} />
          )}
          {tab === 'import' && (
            <main className="mx-auto max-w-5xl p-6">
              <p className="mb-2 font-semibold text-[#00778B]">
                {project.locations.length} locations × {project.activityRowsPerLocation} rows — {total} active activities
              </p>
              {project.warnings.map((w) => (
                <p key={w} className="mb-1 border-l-4 border-[#F1B434] bg-amber-50 p-2 text-sm">{w}</p>
              ))}
              <pre className="max-h-[70vh] overflow-auto bg-[#F2F8F9] p-3 text-xs">{JSON.stringify(project, null, 2)}</pre>
            </main>
          )}
        </>
      )}
      {!project && <p className="no-print p-6 text-slate-600">Choose a possession tracker .xlsx to begin.</p>}
    </div>
  )
}

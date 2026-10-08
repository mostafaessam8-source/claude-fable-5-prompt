import { useState } from 'react'
import { parseWorkbook, ImportError } from './import/parse'
import type { Project } from './model/types'

export function App() {
  const [project, setProject] = useState<Project | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onFile(file: File | undefined) {
    if (!file) return
    setError(null)
    try {
      setProject(await parseWorkbook(await file.arrayBuffer()))
    } catch (e) {
      setProject(null)
      setError(e instanceof ImportError ? e.message : `Unexpected error: ${(e as Error).message}`)
    }
  }

  const total = project?.locations.reduce((n, l) => n + l.activities.length, 0) ?? 0

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="bg-[#3D3935] px-4 py-2 text-lg font-bold text-white">
        SAR Possession Tracker — Step 1: import
      </h1>
      <input
        className="my-4 block"
        type="file"
        accept=".xlsx"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      {error && <p className="border-l-4 border-[#CB2C30] bg-red-50 p-3 text-[#CB2C30]">{error}</p>}
      {project && (
        <>
          <p className="mb-2 font-semibold text-[#00778B]">
            {project.locations.length} locations × {project.activityRowsPerLocation} rows —{' '}
            {total} active activities
          </p>
          {project.warnings.map((w) => (
            <p key={w} className="mb-1 border-l-4 border-[#F1B434] bg-amber-50 p-2 text-sm">{w}</p>
          ))}
          <pre className="max-h-[70vh] overflow-auto bg-[#F2F8F9] p-3 text-xs">
            {JSON.stringify(project, null, 2)}
          </pre>
        </>
      )}
    </main>
  )
}

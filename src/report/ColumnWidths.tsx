import { applySettings } from '../model/settings'
import type { Project } from '../model/types'
import { COL_NAMES, DEFAULT_COLS, MAX_COL, MIN_COL, tableColsOf } from './columns'

/** "Column Width…" for the report table: type the width (px) of every column, or put them all back. */
export function ColumnWidths({ project, onChange, onClose }: { project: Project; onChange: (p: Project) => void; onClose: () => void }) {
  const cols = tableColsOf(project.settings.tableCols)
  const set = (i: number, v: number) => onChange(applySettings(project, { tableCols: cols.map((x, k) => (k === i ? Math.min(MAX_COL, Math.max(MIN_COL, Math.round(v))) : x)) }))
  return (
    <div className="no-print fixed inset-0 z-[70] flex items-start justify-center overflow-auto bg-black/30 p-6" role="dialog" aria-label="Column widths" onClick={onClose}>
      <div className="w-full max-w-md bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center bg-[#00778B] px-4 py-2 text-white">
          <h2 className="flex-1 text-sm font-bold">REPORT TABLE — COLUMN WIDTHS (px)</h2>
          <button onClick={onClose} title="Close">✕</button>
        </div>
        <div className="space-y-1 p-4 text-sm">
          {COL_NAMES.map((n, i) => (
            <label key={n} className="flex items-center gap-3">
              <span className="w-40 text-slate-700">{n}</span>
              <input className="w-24 rounded border border-slate-300 px-2 py-1" type="number" min={MIN_COL} max={MAX_COL} value={cols[i]} aria-label={`${n} width`}
                onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v > 0) set(i, v) }} />
              <span className="text-xs text-slate-400">default {DEFAULT_COLS[i]}</span>
            </label>
          ))}
          <p className="pt-2 text-xs text-slate-500">You can also drag the right edge of a column header on the report. Past the A4 width the page simply grows wider (the Gantt keeps its size); printing scales it to fit the paper.</p>
          <div className="flex justify-end gap-2 pt-2">
            <button className="rounded border border-slate-400 px-3 py-1 disabled:opacity-40" disabled={!project.settings.tableCols} onClick={() => onChange(applySettings(project, { tableCols: null }))}>Reset all</button>
            <button className="rounded bg-[#00778B] px-3 py-1 font-semibold text-white" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    </div>
  )
}

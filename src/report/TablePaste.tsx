import { useMemo, useState } from 'react'
import { applyTable, TableError, type TableResult } from '../links/table'
import type { Project } from '../model/types'

/** Paste a table back from Excel: a live preview of everything it changes, then Apply (one Undo step). */
export function TablePaste({ project, loc, onApply, onClose }: { project: Project; loc: number; onApply: (p: Project) => void; onClose: () => void }) {
  const [text, setText] = useState('')
  const [removeMissing, setRemoveMissing] = useState(true)
  const [clipError, setClipError] = useState<string | null>(null)

  const out = useMemo<{ r: TableResult } | { error: string } | null>(() => {
    if (!text.trim()) return null
    try { return { r: applyTable(project, loc, text, { removeMissing }) } } catch (e) {
      return { error: e instanceof TableError ? e.message : `Could not read the table: ${(e as Error).message}` }
    }
  }, [text, removeMissing, project, loc])

  const readClipboard = async () => {
    setClipError(null)
    try { setText(await navigator.clipboard.readText()) } catch { setClipError('The browser did not allow reading the clipboard. Click in the box and press Ctrl+V instead.') }
  }
  const r = out && 'r' in out ? out.r : null
  const nothing = r && r.changes.length === 0

  return (
    <div className="no-print fixed inset-0 z-[60] flex items-start justify-center overflow-auto bg-black/40 p-6" role="dialog" aria-label="Paste table">
      <div className="w-full max-w-4xl bg-white shadow-2xl">
        <div className="flex items-center bg-[#00778B] px-4 py-2 text-white">
          <h2 className="flex-1 text-sm font-bold">PASTE THE TABLE BACK — {project.locations[loc].name}</h2>
          <button onClick={onClose} title="Close">✕</button>
        </div>
        <div className="space-y-3 p-4 text-sm">
          <p className="text-xs text-slate-600">
            Copy the whole table from Excel (<b>including the header row</b>) and paste it below. Rows are matched by the <b>#</b> column; the order of the rows becomes the order of the
            activities. A row with no # (or a new one) is a new activity; links (“Follows”) refer to the # values in your table.
          </p>
          <div className="flex gap-2">
            <button className="rounded border border-slate-400 px-2 py-1 text-xs font-semibold" onClick={readClipboard}>Read from clipboard</button>
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={removeMissing} onChange={(e) => setRemoveMissing(e.target.checked)} />
              Delete activities that are not in the pasted table</label>
          </div>
          {clipError && <p className="text-xs text-[#CB2C30]">{clipError}</p>}
          <textarea className="h-32 w-full rounded border border-slate-300 p-2 font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste here (Ctrl+V)…" aria-label="Pasted table" autoFocus />
          {out && 'error' in out && <p className="border-l-4 border-[#CB2C30] bg-red-50 p-2 text-xs text-[#CB2C30]">{out.error}</p>}
          {r && (
            <div className="space-y-2">
              <p>
                <b>{r.edited}</b> activit{r.edited === 1 ? 'y' : 'ies'} edited · <b>{r.added}</b> added · <b className={r.removed ? 'text-[#CB2C30]' : ''}>{r.removed}</b> removed.
                {nothing && ' The table is the same as what is on the site — nothing to change.'}
              </p>
              {r.unlinked.length > 0 && (
                <p className="border-l-4 border-[#F1B434] bg-amber-50 p-2 text-xs">
                  {r.unlinked.length} activit{r.unlinked.length === 1 ? 'y' : 'ies'} lost {r.unlinked.length === 1 ? 'its' : 'their'} predecessor (removed, unknown or now below) and keep their planned start: {r.unlinked.join(', ')}.
                </p>
              )}
              {r.warnings.length > 0 && (
                <ul className="max-h-24 list-disc overflow-auto border-l-4 border-[#F1B434] bg-amber-50 p-2 pl-6 text-xs">{r.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
              )}
              {r.changes.length > 0 && (
                <ul className="max-h-60 list-disc overflow-auto border border-slate-200 p-2 pl-6 text-xs">
                  {r.changes.slice(0, 200).map((c, i) => <li key={i}>{c}</li>)}
                  {r.changes.length > 200 && <li>… and {r.changes.length - 200} more</li>}
                </ul>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button className="rounded border border-slate-400 px-3 py-1" onClick={onClose}>Cancel</button>
            <button className="rounded bg-[#00778B] px-3 py-1 font-semibold text-white disabled:opacity-40" disabled={!r || !!nothing}
              onClick={() => { onApply(r!.project); onClose() }}>Apply</button>
          </div>
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { FIELD_LABEL, LAYOUT_LABEL, PLAN_FIELDS, type UpdateDiff } from '../import/update'
import type { Project } from '../model/types'

/** Review of a returned workbook: every changed activity with what it was and what the file says; tick what to take. */
export function UpdateReview({ project, diff, fileName, onApply, onReplace, onCancel }: {
  project: Project; diff: UpdateDiff; fileName: string
  onApply: (accepted: ReadonlySet<string>) => void
  /** Take the contractor's whole version (the only way to take added / removed / reordered activities and changed settings). */
  onReplace: () => void; onCancel: () => void
}) {
  const key = (u: { loc: number; no: number }) => `${u.loc}:${u.no}`
  const [on, setOn] = useState<Set<string>>(new Set([...diff.updates.map(key), ...diff.layouts.map((u) => `layout:${u.loc}`)]))
  const toggle = (k: string) => setOn((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const remarks = diff.updates.filter((u) => u.changes.some((c) => c.field === 'remarks')).length
  const plan = diff.updates.filter((u) => u.changes.some((c) => PLAN_FIELDS.includes(c.field))).length

  return (
    <div className="no-print fixed inset-0 z-[60] flex items-start justify-center overflow-auto bg-black/40 p-6" role="dialog" aria-label="Contractor update">
      <div className="w-full max-w-4xl bg-white shadow-2xl">
        <div className="flex items-center bg-[#00778B] px-4 py-2 text-white">
          <h2 className="flex-1 text-sm font-bold">CONTRACTOR UPDATE — {fileName}</h2>
          <button onClick={onCancel} title="Close">✕</button>
        </div>
        <div className="space-y-3 p-4 text-sm">
          <p>
            Compared {diff.matched} activities: <b>{diff.updates.length}</b> changed{diff.layouts.length ? <> · <b>{diff.layouts.length}</b> site layout{diff.layouts.length === 1 ? '' : 's'} corrected</> : null}
            {remarks ? <> · <b>{remarks}</b> with remarks</> : null}{plan ? <> · <b className="text-[#CB2C30]">{plan}</b> change the plan (duration / link)</> : null}.
            Nothing is applied until you press Apply; Undo restores it.
          </p>
          {diff.structure.length > 0 && (
            <div className="border-l-4 border-[#CB2C30] bg-red-50 p-2 text-xs">
              <b className="text-[#CB2C30]">Structure and settings changed ({diff.structure.length})</b>
              <ul className="mt-1 list-disc pl-5">{diff.structure.map((t) => <li key={t}>{t}</li>)}</ul>
              <p className="mt-1 text-slate-600">These come across only with “Take the contractor's version”. “Apply selected” below takes the per-activity changes and ignores them.</p>
            </div>
          )}
          {diff.notes.map((n) => <p key={n} className="border-l-4 border-[#F1B434] bg-amber-50 p-2 text-xs">{n}</p>)}
          {diff.updates.length === 0 && diff.layouts.length === 0 && diff.structure.length === 0 && <p className="p-4 text-center text-slate-500">The file has no differences from this project.</p>}
          <div className="flex gap-2 text-xs">
            <button className="rounded border border-slate-400 px-2 py-1" onClick={() => setOn(new Set([...diff.updates.map(key), ...diff.layouts.map((u) => `layout:${u.loc}`)]))}>Select all</button>
            <button className="rounded border border-slate-400 px-2 py-1" onClick={() => setOn(new Set())}>Select none</button>
          </div>
          <div className="max-h-[60vh] overflow-auto border border-slate-300">
            {diff.layouts.map((u) => (
              <label key={`layout:${u.loc}`} className="block cursor-pointer border-b border-slate-200 bg-[#F8FBFC] p-2 hover:bg-[#F2F8F9]">
                <span className="flex items-center gap-2">
                  <input type="checkbox" checked={on.has(`layout:${u.loc}`)} onChange={() => toggle(`layout:${u.loc}`)} />
                  <b className="text-[#00778B]">{u.name}</b><span>site layout</span>
                </span>
                <table className="ml-6 mt-1 text-xs">
                  <tbody>
                    {u.changes.map((c) => (
                      <tr key={c.field}>
                        <td className="pr-3 font-semibold text-slate-600">{LAYOUT_LABEL[c.field]}</td>
                        <td className="pr-2 text-slate-500 line-through">{c.from || '—'}</td><td className="pr-2">→</td><td className="font-semibold">{c.to || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </label>
            ))}
            {diff.updates.map((u) => (
              <label key={key(u)} className="block cursor-pointer border-b border-slate-200 p-2 hover:bg-[#F2F8F9]">
                <span className="flex items-center gap-2">
                  <input type="checkbox" checked={on.has(key(u))} onChange={() => toggle(key(u))} />
                  <b className="text-[#00778B]">{project.locations[u.loc].name}</b>
                  <span>#{u.no} {u.name}</span>
                </span>
                <table className="ml-6 mt-1 text-xs">
                  <tbody>
                    {u.changes.map((c) => (
                      <tr key={c.field}>
                        <td className={`pr-3 font-semibold ${PLAN_FIELDS.includes(c.field) ? 'text-[#CB2C30]' : 'text-slate-600'}`}>{FIELD_LABEL[c.field]}</td>
                        <td className="pr-2 text-slate-500 line-through">{c.from || '—'}</td>
                        <td className="pr-2">→</td>
                        <td className="font-semibold">{c.to || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button className="rounded border border-slate-400 px-3 py-1" onClick={onCancel}>Cancel</button>
            <button className="rounded border border-[#CB2C30] px-3 py-1 font-semibold text-[#CB2C30]" title="Replace this whole project (activities, links, settings, layouts) with the contractor's version; Undo restores yours"
              onClick={() => { if (window.confirm("Replace the whole project with the contractor's version? Undo restores yours.")) onReplace() }}>Take the contractor's version</button>
            <button className="rounded bg-[#00778B] px-3 py-1 font-semibold text-white disabled:opacity-40" disabled={on.size === 0} onClick={() => onApply(on)}>
              Apply selected ({on.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Copy a location's activities as a table (tab-separated, so it pastes straight into Excel), edit them there, and paste the
 * whole table back. Rows are identified by the "#" column; the order of the rows is the new order of the activities.
 */
import { computeProject, type ProjectResult } from '../engine/schedule'
import type { ActivityInput, Project, Rel } from '../model/types'
import { RELS, restructure, setPlannedFinish, setPlannedStart, splitDateTime } from './edit'

export const HEADERS = ['#', 'Activity', 'Duration (h)', 'Follows (#)', 'Rel', 'Lag (h)', 'Planned start', 'Planned finish', 'Actual start', 'Actual finish', '% complete', 'Remarks']
type Col = 'no' | 'name' | 'dur' | 'pred' | 'rel' | 'lag' | 'pstart' | 'pfinish' | 'astart' | 'afinish' | 'pct' | 'remarks'
const COL_KEYS: Col[] = ['no', 'name', 'dur', 'pred', 'rel', 'lag', 'pstart', 'pfinish', 'astart', 'afinish', 'pct', 'remarks']
const ALIASES: Record<Col, string[]> = {
  no: ['#', 'no', 'no.', 'number'], name: ['activity', 'name', 'activity name', 'description'],
  dur: ['duration (h)', 'duration', 'dur', 'dur (h)'], pred: ['follows (#)', 'follows', 'pred', 'pred no', 'predecessor'],
  rel: ['rel', 'relationship'], lag: ['lag (h)', 'lag'], pstart: ['planned start'], pfinish: ['planned finish'],
  astart: ['actual start', 'act start'], afinish: ['actual finish', 'act finish'], pct: ['% complete', '% comp', 'pct', 'complete'],
  remarks: ['remarks', 'remark', 'notes'],
}
const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const p2 = (n: number) => String(n).padStart(2, '0')
const MIN = 60_000

/** "16-Oct-2026 01:30": Excel reads it as a date-time whatever the language of the PC. */
export function fmtCell(d: Date | null): string {
  return d ? `${p2(d.getUTCDate())}-${MON[d.getUTCMonth()][0].toUpperCase()}${MON[d.getUTCMonth()].slice(1)}-${d.getUTCFullYear()} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}` : ''
}
const num = (x: number | null) => (x == null ? '' : String(Math.round(x * 1000) / 1000))

const cellText = (s: string) => (/[\t\n\r"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)

/** The table of one location, header row first. */
export function toTable(project: Project, result: ProjectResult, loc: number): string {
  const lines = [HEADERS.join('\t')]
  project.locations[loc].activities.forEach((a, k) => {
    const r = result.locations[loc].activities[k]
    lines.push([
      String(a.no), cellText(a.name), num(a.durationH), String(a.pred), a.rel, num(a.lagH),
      fmtCell(r.plannedStart), fmtCell(r.plannedFinish), fmtCell(r.actualStart), fmtCell(r.actualFinish),
      a.pct == null ? '' : `${Math.round(a.pct * 100)}%`, cellText(a.remarks),
    ].join('\t'))
  })
  return lines.join('\n')
}

/** Tab-separated text → rows of cells (double quotes may hold tabs and line breaks, as Excel writes them). */
export function parseTsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cur = '', q = false
  const s = text.replace(/\r\n?/g, '\n')
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += ch
    } else if (ch === '"' && cur === '') q = true
    else if (ch === '\t') { row.push(cur); cur = '' }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = '' }
    else cur += ch
  }
  row.push(cur); rows.push(row)
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

const parseNum = (s: string): number | null | 'bad' => {
  const t = s.trim().replace(/\s/g, '')
  if (t === '') return null
  const v = Number(/^-?\d+,\d+$/.test(t) ? t.replace(',', '.') : t)
  return Number.isFinite(v) ? v : 'bad'
}

/**
 * A date-time as Excel shows it. `dmy` says whether a slash date is day/month (guessed from the whole table).
 * Understands 2026-10-16 01:30, 16-Oct-2026 01:30, 16-Oct-26 1:30 PM, 10/16/2026 1:30 PM, an Excel serial number,
 * and the report's own "Fri 16-Oct 01:30" (no year: the possession's year is used).
 */
export function parseDateTime(raw: string, dmy: boolean, origin: Date): Date | null | 'bad' {
  let s = raw.trim()
  if (s === '') return null
  s = s.replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+/i, '')
  let time = ''
  const tm = s.match(/[\sT](\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?\s*$/i)
  let h = 0, mi = 0
  if (tm) {
    h = Number(tm[1]); mi = Number(tm[2])
    if (tm[3]) { const pm = tm[3].toLowerCase() === 'pm'; if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12 }
    time = tm[0]
    s = s.slice(0, s.length - time.length).trim()
  }
  if (h > 24 || mi > 59) return 'bad'
  const mk = (y: number, m: number, d: number) => {
    const t = Date.UTC(y, m, d, h, mi)
    const dt = new Date(t)
    return dt.getUTCMonth() === m && dt.getUTCDate() === d ? dt : 'bad'
  }
  const yr = (v: string) => (v.length <= 2 ? 2000 + Number(v) : Number(v))
  let m: RegExpMatchArray | null
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return mk(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if ((m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[a-z]*[-\s,]*(\d{2,4})?$/))) {
    const mon = MON.indexOf(m[2].toLowerCase())
    if (mon < 0) return 'bad'
    let y = m[3] ? yr(m[3]) : origin.getUTCFullYear()
    if (!m[3] && mon < origin.getUTCMonth() - 6) y += 1
    return mk(y, mon, Number(m[1]))
  }
  if ((m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/))) {
    const a = Number(m[1]), b = Number(m[2])
    return dmy ? mk(yr(m[3]), b - 1, a) : mk(yr(m[3]), a - 1, b)
  }
  if (!tm && (m = s.match(/^(\d{5})(\.\d+)?$/))) { // Excel serial date
    const t = Date.UTC(1899, 11, 30) + Math.round((Number(m[1]) + Number(m[2] ?? 0)) * 86400000 / MIN) * MIN
    return new Date(t)
  }
  return 'bad'
}

export interface TableChange { key: string; text: string }
export interface TableResult {
  project: Project
  /** One line per thing that changes, for the preview. */
  changes: string[]
  added: number
  removed: number
  edited: number
  unlinked: string[]
  warnings: string[]
}

export class TableError extends Error {}

/** Compare a pasted table with the location and build the project it asks for. Throws TableError when it is not a table. */
export function applyTable(project: Project, loc: number, text: string, opts: { removeMissing: boolean }): TableResult {
  const rows = parseTsv(text)
  const head = rows.findIndex((r) => r.some((c) => ALIASES.name.includes(c.trim().toLowerCase())))
  if (head < 0) throw new TableError('No header row found. Copy the table including its first row (the one with “Activity”).')
  const idx = new Map<Col, number>()
  rows[head].forEach((c, i) => {
    const t = c.trim().toLowerCase()
    for (const k of COL_KEYS) if (!idx.has(k) && ALIASES[k].includes(t)) idx.set(k, i)
  })
  const body = rows.slice(head + 1)
  if (body.length === 0) throw new TableError('The table has a header but no rows.')
  const cell = (r: string[], k: Col) => (idx.has(k) ? (r[idx.get(k)!] ?? '').trim() : null)

  const origin = project.settings.possessionStart
  const before = computeProject(project).locations[loc].activities
  const acts = project.locations[loc].activities
  const warnings: string[] = []
  const changes: string[] = []

  // day/month or month/day? decided by any slash date that can only be one of them
  const slash: string[] = []
  for (const r of body) for (const k of ['pstart', 'pfinish', 'astart', 'afinish'] as Col[]) { const v = cell(r, k); if (v && /^\d{1,2}[/.]\d{1,2}[/.]\d{2,4}/.test(v)) slash.push(v) }
  const dmy = slash.some((v) => Number(v.split(/[/.]/)[0]) > 12) && !slash.some((v) => Number(v.split(/[/.]/)[1]) > 12)

  const used = new Set<number>()
  let key = acts.reduce((m, a) => Math.max(m, a.no), 0)
  type Row = { a: ActivityInput; existing: ActivityInput | null; r: string[]; line: number }
  const built: Row[] = []
  body.forEach((r, n) => {
    const line = head + n + 2
    const noRaw = cell(r, 'no')
    const noV = noRaw ? parseNum(noRaw) : null
    let existing: ActivityInput | null = null
    let k: number
    if (typeof noV === 'number' && Number.isInteger(noV) && noV > 0 && !used.has(noV)) {
      k = noV
      existing = acts.find((a) => a.no === noV) ?? null
    } else k = ++key
    if (k > key) key = k
    used.add(k)
    const base: ActivityInput = existing ?? {
      no: k, sourceRow: 0, name: '', durationH: 1, pred: 0, rel: 'FS', lagH: 0,
      actualStartDate: null, actualStartTime: null, actualFinishDate: null, actualFinishTime: null, pct: null, remarks: '',
    }
    built.push({ a: { ...base, no: k }, existing, r, line })
  })

  const editedKeys = new Set<number>()
  const note = (b: Row, field: string, from: string, to: string) => changes.push(`#${b.existing?.no ?? '+'} ${b.a.name || '(new)'}: ${field} ${from || '—'} → ${to || '—'}`)
  const dateEdits: { row: Row; start: Date | null; finish: Date | null }[] = []

  for (const b of built) {
    const { a, existing, r, line } = b
    const bad = (col: string, v: string) => warnings.push(`Row ${line}, ${col}: “${v}” was not understood and was ignored.`)
    let touched = false
    const t = (field: string, from: string, to: string) => { touched = true; if (existing) note(b, field, from, to) }

    const name = cell(r, 'name')
    if (name !== null) {
      if (name === '') { if (!existing) { warnings.push(`Row ${line}: a new row needs an activity name — skipped.`); a.name = '' } } else if (name !== a.name) { t('name', a.name, name); a.name = name }
    }
    const dur = cell(r, 'dur')
    if (dur !== null && dur !== '') { const v = parseNum(dur); if (v === 'bad' || v === null || v <= 0) bad('Duration', dur); else if (v !== a.durationH) { t('duration', num(a.durationH), num(v)); a.durationH = v } }
    const pred = cell(r, 'pred')
    if (pred !== null) {
      const v = pred === '' ? 0 : parseNum(pred.replace(/^#/, ''))
      if (v === 'bad' || v === null || !Number.isInteger(v) || v < 0) bad('Follows', pred); else if (v !== a.pred) { t('follows', a.pred ? `#${a.pred}` : 'start', v ? `#${v}` : 'start'); a.pred = v }
    }
    const rel = cell(r, 'rel')
    if (rel) { const v = rel.toUpperCase() as Rel; if (!RELS.includes(v)) bad('Rel', rel); else if (v !== a.rel) { t('relationship', a.rel, v); a.rel = v } }
    const lag = cell(r, 'lag')
    if (lag !== null && lag !== '') { const v = parseNum(lag); if (v === 'bad' || v === null) bad('Lag', lag); else if (v !== a.lagH) { t('lag', num(a.lagH), num(v)); a.lagH = v } }
    for (const [col, label, fd, ft] of [['astart', 'Actual start', 'actualStartDate', 'actualStartTime'], ['afinish', 'Actual finish', 'actualFinishDate', 'actualFinishTime']] as const) {
      const v = cell(r, col)
      if (v === null) continue
      const d = parseDateTime(v, dmy, origin)
      if (d === 'bad') { bad(label, v); continue }
      const cur = a[fd] ? (a[fd] as Date).getTime() + (a[ft] ?? 0) * 3600_000 : null
      const nxt = d ? d.getTime() : null
      if ((cur == null ? null : Math.round(cur / MIN)) !== (nxt == null ? null : Math.round(nxt / MIN))) {
        t(label.toLowerCase(), cur == null ? '' : fmtCell(new Date(cur)), nxt == null ? '' : fmtCell(d as Date))
        if (d) { const sp = splitDateTime(d); (a as unknown as Record<string, unknown>)[fd] = sp.date; (a as unknown as Record<string, unknown>)[ft] = sp.time } else { (a as unknown as Record<string, unknown>)[fd] = null; (a as unknown as Record<string, unknown>)[ft] = null }
      }
    }
    const pct = cell(r, 'pct')
    if (pct !== null) {
      if (pct === '') { if (a.pct != null) { t('% complete', `${Math.round((a.pct ?? 0) * 100)}%`, ''); a.pct = null } } else {
        const v = parseNum(pct.replace('%', ''))
        if (v === 'bad' || v === null) bad('% complete', pct)
        else { const f = pct.includes('%') || v > 1 ? v / 100 : v; const c = Math.min(1, Math.max(0, f)); if (Math.abs(c - (a.pct ?? -1)) > 1e-9) { t('% complete', a.pct == null ? '' : `${Math.round(a.pct * 100)}%`, `${Math.round(c * 100)}%`); a.pct = c } }
      }
    }
    const rem = cell(r, 'remarks')
    if (rem !== null && rem !== a.remarks) { t('remarks', a.remarks, rem); a.remarks = rem }

    // planned dates: typed dates move the lag / duration, unless the link itself was edited in the same row
    const ps = cell(r, 'pstart'), pf = cell(r, 'pfinish')
    const linkEdited = !!existing && (a.pred !== existing.pred || a.rel !== existing.rel || a.lagH !== existing.lagH || a.durationH !== existing.durationH)
    if (existing && (ps || pf) && !linkEdited) {
      const old = before[acts.indexOf(existing)]
      const s = ps ? parseDateTime(ps, dmy, origin) : null, f = pf ? parseDateTime(pf, dmy, origin) : null
      if (s === 'bad') bad('Planned start', ps ?? ''); if (f === 'bad') bad('Planned finish', pf ?? '')
      const sd = s && s !== 'bad' && Math.round(s.getTime() / MIN) !== Math.round(old.plannedStart.getTime() / MIN) ? s : null
      const fd2 = f && f !== 'bad' && Math.round(f.getTime() / MIN) !== Math.round(old.plannedFinish.getTime() / MIN) ? f : null
      if (sd || fd2) dateEdits.push({ row: b, start: sd, finish: fd2 })
    } else if (existing && linkEdited && (ps || pf)) {
      const old = before[acts.indexOf(existing)]
      const s = ps ? parseDateTime(ps, dmy, origin) : null
      if (s && s !== 'bad' && Math.round(s.getTime() / MIN) !== Math.round(old.plannedStart.getTime() / MIN)) warnings.push(`Row ${line}: the planned dates were ignored because the duration / link was edited in the same row.`)
    }
    if (touched && existing) editedKeys.add(a.no)
    if (!existing) changes.push(`+ new activity “${a.name}”`)
  }

  const valid = built.filter((b) => b.a.name !== '')
  const missing = acts.filter((a) => !used.has(a.no))
  const order = [...valid.map((b) => b.a), ...(opts.removeMissing ? [] : missing)]
  for (const m of missing) if (opts.removeMissing) changes.push(`− removed #${m.no} ${m.name}`)
  const startOld = (n: number) => before[acts.findIndex((x) => x.no === n)]?.plannedStartH ?? 0
  const rs = restructure(project, loc, order, startOld)
  let p = rs.project
  const nameOfNo = (n: number) => acts.find((a) => a.no === n)?.name ?? `#${n}`

  // now the typed planned dates, one row at a time (a move changes what the rows after it follow)
  for (const e of dateEdits) {
    const no = order.findIndex((a) => a.no === e.row.a.no) + 1
    if (no <= 0) continue
    const hours = (d: Date) => Math.round((d.getTime() - origin.getTime()) / MIN) / 60
    for (const step of [e.start && 'start', e.finish && 'finish'] as const) {
      if (!step) continue
      const res = computeProject(p).locations[loc].activities
      const act = p.locations[loc].activities.find((a) => a.no === no)!
      const cur = res.find((x) => x.no === no)!
      const pr = act.pred > 0 ? res.find((x) => x.no === act.pred) : undefined
      const pt = pr ? { startH: pr.plannedStartH, finishH: pr.plannedFinishH } : null
      if (step === 'start') {
        const h = hours(e.start!)
        note(e.row, 'planned start', fmtCell(cur.plannedStart), fmtCell(e.start)); p = setPlannedStart(p, loc, no, h, act.rel, pt, cur.durationH)
      } else {
        const q = setPlannedFinish(p, loc, no, cur.plannedStartH, hours(e.finish!), act.rel, pt)
        if (q) { note(e.row, 'planned finish', fmtCell(cur.plannedFinish), fmtCell(e.finish)); p = q } else warnings.push(`Row ${e.row.line}: the planned finish is not after the planned start — ignored.`)
      }
    }
    if (e.row.existing) editedKeys.add(e.row.a.no)
  }

  return { project: p, changes, added: valid.filter((b) => !b.existing).length, removed: opts.removeMissing ? missing.length : 0, edited: editedKeys.size, unlinked: rs.unlinked.map(nameOfNo), warnings }
}

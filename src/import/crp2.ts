/**
 * Importer for the raw CRP2 "Progress Sheet" the tracker was made from (brief §10).
 *
 * What it relies on, and why:
 *  - Planned times are CUMULATIVE HOURS from the possession start (a value past 24:00 lands on
 *    1900-01-01). Columns K (start) and L (finish) are read as hours; the day label columns G/H
 *    are ignored — adding them would double-count.
 *  - Duration comes from column C ("No. Hours"). Where the sheet's own start→finish span disagrees,
 *    that is reported, never silently resolved.
 *  - The sheet holds start/finish times, not links. The tracker model needs predecessor/relationship/lag,
 *    so they are reconstructed from the times (see `reconstructLinks`) and reproduce them exactly.
 *  - It holds no cell counts, OTMP or station: those stay empty for the Site layout step.
 */
import type ExcelJS from 'exceljs'
import type { ActivityInput, LocationInput, Project, Rel } from '../model/types'
import { date, ImportError, isBlank, num, plain, text, timeOfDay, addUnits } from './cells'

const HEADER_TEXT = 'work description'
const EXCEL_EPOCH = Date.UTC(1899, 11, 30) // serial 0
const HOUR_MS = 3_600_000
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** A cell → hours (a time-of-day Date / serial number / "H:MM:SS" text), rounded to the minute. */
function hoursOf(v: unknown): number | null {
  let h: number | null = null
  if (v instanceof Date) h = (v.getTime() - EXCEL_EPOCH) / HOUR_MS
  else if (typeof v === 'number') h = v * 24
  else if (typeof v === 'string') {
    const m = v.trim().match(/^(\d+):(\d{2})(?::(\d{2}))?$/)
    if (m) h = Number(m[1]) + Number(m[2]) / 60 + Number(m[3] ?? 0) / 3600
  }
  return h == null || !Number.isFinite(h) ? null : Math.round(h * 60) / 60
}

function findSheet(wb: ExcelJS.Workbook): { ws: ExcelJS.Worksheet; headerRow: number } | null {
  for (const ws of wb.worksheets) {
    for (let r = 1; r <= Math.min(40, ws.rowCount); r++) {
      if (text(plain(ws.getCell(`B${r}`).value)).toLowerCase() === HEADER_TEXT) {
        // …and there must be LOCATION rows below it.
        for (let q = r + 1; q <= ws.rowCount; q++) {
          if (/^location\s*:/i.test(text(plain(ws.getCell(`A${q}`).value)))) return { ws, headerRow: r }
        }
      }
    }
  }
  return null
}

export const looksLikeCrp2 = (wb: ExcelJS.Workbook) => findSheet(wb) != null

/** "16-Oct-2026 00.00 AM" → a floating wall-clock Date (UTC accessors). */
export function parseHeaderDate(s: string): Date | null {
  const m = s.match(/(\d{1,2})-([A-Za-z]{3})[a-z]*-(\d{4})\s+(\d{1,2})[.:](\d{2})\s*(AM|PM)?/i)
  if (!m) return null
  const mon = MONTHS.indexOf(m[2].toLowerCase())
  if (mon < 0) return null
  let h = Number(m[4])
  const ap = m[6]?.toUpperCase()
  if (ap === 'PM' && h < 12) h += 12
  if (ap === 'AM' && h === 12) h = 0
  return new Date(Date.UTC(Number(m[3]), mon, Number(m[1]), h, Number(m[5])))
}

/** "C263 , TK 209+025 (Line 1 & Line 3)" → code, chainage, lines. */
export function parseLocationLabel(label: string) {
  const m = label.match(/^\s*(?:LOCATION\s*:)?\s*([A-Z]*\d+[A-Z]?)\s*,?\s*(?:(?:TK|KM)\s*)?([\d]+\+[\d]+|[\d.]+)?\s*(?:\((.*)\))?/i)
  if (!m) return { code: label.trim(), chainage: '', lines: '' }
  return { code: m[1].toUpperCase(), chainage: m[2] ? `KM ${m[2]}` : '', lines: (m[3] ?? '').trim() }
}

interface Raw {
  row: number
  name: string
  /** What the sheet's own start cell says: a link to another row's finish/start, or a typed time. */
  kLink: { kind: 'FS' | 'SS'; row: number } | null
  kRaw: number | null
  /** null = blank in the source: imported as such, so it shows ! CHECK DURATION. */
  durH: number | null
  startH: number
  actual: Pick<ActivityInput, 'actualStartDate' | 'actualStartTime' | 'actualFinishDate' | 'actualFinishTime' | 'pct' | 'remarks'>
}

const EPS = 1 / 120 // half a minute, in hours
const PARALLEL_H = 2 // a typed start up to this far before the row above is a parallel activity, not a missing day

/** "=L69" → finish-to-start with row 69; "=K69" → start-to-start; anything else → null (a typed time). */
export function linkOfFormula(f: string | undefined): { kind: 'FS' | 'SS'; row: number } | null {
  const m = f?.replace(/\$/g, '').trim().match(/^=?\s*([LK])(\d+)$/i)
  return m ? { kind: m[1].toUpperCase() === 'L' ? 'FS' : 'SS', row: Number(m[2]) } : null
}

/**
 * The sheet holds start/finish times only. Rebuild a predecessor link that reproduces each start:
 * finish-to-start with the row above, else with any earlier finish, else start-to-start with an
 * earlier start, else a lag measured from the row above (or from the possession start).
 */
export function reconstructLinks(items: { startH: number; durH: number | null }[]): { pred: number; rel: Rel; lagH: number }[] {
  const near = (a: number, b: number) => Math.abs(a - b) < EPS
  const round = (x: number) => Math.round(x * 60) / 60
  return items.map((it, k) => {
    const finish = (j: number) => items[j].startH + (items[j].durH ?? 0)
    if (k === 0) return { pred: 0, rel: 'FS' as Rel, lagH: round(it.startH) }
    if (near(it.startH, finish(k - 1))) return { pred: k, rel: 'FS' as Rel, lagH: 0 }
    for (let j = k - 2; j >= 0; j--) if (near(it.startH, finish(j))) return { pred: j + 1, rel: 'FS' as Rel, lagH: 0 }
    for (let j = k - 1; j >= 0; j--) if (near(it.startH, items[j].startH)) return { pred: j + 1, rel: 'SS' as Rel, lagH: 0 }
    if (near(it.startH, 0)) return { pred: 0, rel: 'FS' as Rel, lagH: 0 }
    return { pred: k, rel: 'FS' as Rel, lagH: round(it.startH - finish(k - 1)) }
  })
}

export function parseCrp2(wb: ExcelJS.Workbook): Project {
  const found = findSheet(wb)
  if (!found) throw new ImportError('This is not a CRP2 progress sheet.')
  const { ws } = found
  const warnings: string[] = []
  const at = (a: string) => plain(ws.getCell(a).value)
  const top = (re: RegExp) => {
    for (let r = 1; r <= 12; r++) for (let c = 1; c <= ws.columnCount; c++) {
      const t = text(plain(ws.getCell(r, c).value))
      const m = t.match(re)
      if (m) return { m, r, c }
    }
    return null
  }

  // ---- possession window ---------------------------------------------------------------
  const startHit = top(/Start\s*:\s*(.+)/i)
  const finishHit = top(/Finish\s*:\s*(.+)/i)
  const start = startHit && parseHeaderDate(startHit.m[1])
  if (!start) throw new ImportError('Could not read the possession start (a header cell like "Start : 16-Oct-2026 00.00 AM").')
  const headerEnd = finishHit && parseHeaderDate(finishHit.m[1])
  let durationH = headerEnd ? (headerEnd.getTime() - start.getTime()) / HOUR_MS : 24
  let maxDay = 0
  for (let r = 1; r <= 12; r++) for (let c = 1; c <= ws.columnCount; c++) {
    const d = text(plain(ws.getCell(r, c).value)).match(/^Day\s*(\d+)\b/i)
    if (d) maxDay = Math.max(maxDay, Number(d[1]))
  }
  if (maxDay * 24 > durationH) {
    warnings.push(
      `The header says the possession finishes ${headerEnd ? headerEnd.toISOString().slice(0, 16).replace('T', ' ') : '?'} (${durationH} h), ` +
        `but the sheet also has "Day ${maxDay}" cells, so ${maxDay * 24} h (${maxDay} days) was used. Change it in the settings bar if that is wrong.`,
    )
    durationH = maxDay * 24
  }

  const title = text(at('A1'))
  const projectName = title.split(/\s+-\s+SHUTDOWN/i)[0].trim() || title
  const sd = title.match(/SHUTDOWN\s*0*(\d+)/i)
  warnings.push('Report cut-off: the sheet only has =NOW(), so it defaults to the possession start.')

  const settings = {
    projectName,
    reportTitle: 'POSSESSION PROGRESS REPORT  -  PLANNED vs ACTUAL',
    subtitle: sd ? `Culvert Replacement  –  Shutdown ${sd[1].padStart(2, '0')}` : 'Culvert Replacement',
    preparedBy: '',
    cutoff: start,
    cutoffDefaulted: true,
    possessionStart: start,
    duration: durationH,
    unit: 'hours' as const,
    possessionEnd: addUnits(start, durationH, 'hours'),
    ganttStart: start,
    ganttSpan: durationH,
    ganttSpanUnit: 'hours' as const,
  }

  // ---- locations and activity rows -------------------------------------------------------
  const locRows: number[] = []
  for (let r = 1; r <= ws.rowCount; r++) if (/^location\s*:/i.test(text(plain(ws.getCell(`A${r}`).value)))) locRows.push(r)

  const locations: LocationInput[] = []
  locRows.forEach((lr, i) => {
    const end = (locRows[i + 1] ?? ws.rowCount + 1) - 1
    const label = parseLocationLabel(text(plain(ws.getCell(`A${lr}`).value)))
    const name = [label.code, label.chainage].filter(Boolean).join('  –  ')
    const raws: Raw[] = []

    for (let r = lr + 1; r <= end; r++) {
      const a = text(plain(ws.getCell(`A${r}`).value))
      const b = text(plain(ws.getCell(`B${r}`).value))
      if (!b || a === 'No' || b.toLowerCase() === HEADER_TEXT) continue
      const cRaw = plain(ws.getCell(`C${r}`).value)
      const durH = hoursOf(cRaw)
      if (durH == null && !isBlank(cRaw)) {
        warnings.push(`${name} row ${r} "${b}": "${text(cRaw)}" is not a duration (pre-shutdown work, outside the possession) — skipped.`)
        continue
      }
      if (durH == null && /^no work hours/i.test(b)) {
        warnings.push(`${name} row ${r} "${b}": rest period with no duration — skipped.`)
        continue
      }
      if (durH == null) {
        warnings.push(`${name} row ${r} "${b}": the duration is blank in the source — imported as blank (shows ! CHECK DURATION), not invented.`)
      }
      if (durH != null && durH < 0) continue
      const kRaw = hoursOf(plain(ws.getCell(`K${r}`).value))
      const kLink = linkOfFormula(ws.getCell(`K${r}`).formula)
      const finH = hoursOf(plain(ws.getCell(`L${r}`).value))
      if (durH != null && finH != null && kRaw != null && Math.abs(finH - kRaw - durH) > 1 / 60 + 1e-9) {
        warnings.push(
          `${name} row ${r} "${b}": planned start→finish span is ${(finH - kRaw).toFixed(2)} h but No. Hours is ${durH.toFixed(2)} h — ` +
            `the duration (No. Hours) was used; check the source.`,
        )
      }
      if (kRaw == null && !kLink) {
        warnings.push(`${name} row ${r} "${b}": no planned start — placed straight after the row above.`)
      }

      const pctRaw = num(plain(ws.getCell(`F${r}`).value))
      const pct = pctRaw == null ? null : pctRaw > 1 ? Math.min(1, pctRaw / 100) : pctRaw
      const dateOf = (col: string, timeCol: string) => {
        const v = plain(ws.getCell(`${col}${r}`).value)
        const d = date(v)
        if (!d) return { d: null as Date | null, t: null as number | null }
        const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
        const t = timeOfDay(plain(ws.getCell(`${timeCol}${r}`).value))
        const own = (d.getTime() - day.getTime()) / HOUR_MS
        return { d: day, t: t ?? (own > 0 ? Math.round(own * 3600) / 3600 : null) }
      }
      const s = dateOf('I', 'N')
      const f = dateOf('J', 'O')
      raws.push({
        row: r, name: b.replace(/\s+/g, ' '), durH, kLink, kRaw, startH: 0,
        actual: {
          actualStartDate: s.d, actualStartTime: s.t, actualFinishDate: f.d, actualFinishTime: f.t,
          pct, remarks: text(plain(ws.getCell(`S${r}`).value)),
        },
      })
    }

    // The sheet mixes rows linked by formula (=L69: start when row 69 finishes — the real logic) with typed
    // times. Typed times show only a time of day, so one past midnight can lack its +24 h and every row linked
    // after it inherits the error. So the schedule is rebuilt from the links with the No. Hours durations, and a
    // typed time is moved forward whole days until it is not hours behind the row above.
    const rowIdx = new Map(raws.map((x, k) => [x.row, k]))
    const explicit: ({ pred: number; rel: Rel } | null)[] = []
    raws.forEach((x, k) => {
      const ref = x.kLink ? rowIdx.get(x.kLink.row) : undefined
      let start: number
      if (x.kLink && ref != null && ref < k) {
        start = x.kLink.kind === 'FS' ? raws[ref].startH + (raws[ref].durH ?? 0) : raws[ref].startH
        explicit[k] = { pred: ref + 1, rel: x.kLink.kind }
      } else if (x.kLink && ref == null && k > 0) {
        // The link points at a row that has no times (e.g. the "No Work Hours" rest row): start together with
        // the row above, the way the sheet starts destressing together with the OTMP return movement.
        start = raws[k - 1].startH
        explicit[k] = { pred: k, rel: 'SS' }
        warnings.push(
          `${name} row ${x.row} "${x.name}": its start links to row ${x.kLink.row}, which has no times (a rest row), ` +
            `so it was started together with the row above (${start.toFixed(1)} h). Check the source.`,
        )
      } else {
        explicit[k] = null
        start = x.kRaw ?? (k > 0 ? raws[k - 1].startH + (raws[k - 1].durH ?? 0) : 0)
        if (k > 0 && x.kRaw != null) {
          let days = 0
          while (start + 24 * days < raws[k - 1].startH - PARALLEL_H && days < 3) days++
          start += 24 * days
        }
      }
      x.startH = Math.round(start * 60) / 60
      // Only typed times are worth a warning: a linked row simply follows its predecessor.
      if (!explicit[k] && x.kRaw != null && Math.abs(x.startH - x.kRaw) > 1 / 60) {
        warnings.push(
          `${name} row ${x.row} "${x.name}": the sheet has a typed start of ${x.kRaw.toFixed(1)} h that shows only a time of day, ` +
            `so ${x.startH.toFixed(1)} h (+${(x.startH - x.kRaw).toFixed(0)} h) was used. Check the source.`,
        )
      }
    })
    const links = reconstructLinks(raws)
    explicit.forEach((e, k) => { if (e) links[k] = { pred: e.pred, rel: e.rel, lagH: 0 } })
    const activities: ActivityInput[] = raws.map((x, k) => ({
      no: k + 1, sourceRow: x.row, name: x.name, durationH: x.durH,
      pred: links[k].pred, rel: links[k].rel, lagH: links[k].lagH, ...x.actual,
    }))
    locations.push({ name, scope: label.lines, activities })
  })

  if (locations.length === 0) throw new ImportError('No "LOCATION: …" rows were found.')
  warnings.push(
    'Rows whose start is linked by formula (=L69) were recomputed from those links with the No. Hours durations. ' +
      "Where the sheet's own typed finish times disagree with No. Hours (see the span warnings), later rows therefore start earlier than the sheet shows.",
  )
  const perLocation = Math.max(...locations.map((l) => l.activities.length))
  const counts = new Set(locations.map((l) => l.activities.length))
  if (counts.size > 1) warnings.push(`Locations have different activity counts (${[...counts].join(', ')}); every block is sized for ${perLocation}.`)
  warnings.push('Cells, OTMP and base station are not in a CRP2 sheet: fill them in on the Site layout tab.')

  return { settings, locationCount: locations.length, activityRowsPerLocation: perLocation, locations, warnings }
}

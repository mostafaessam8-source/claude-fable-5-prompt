import ExcelJS from 'exceljs'
import type {
  ActivityInput, HoursOrDays, LocationInput, Project, Rel, Settings,
} from '../model/types'
import { stripUnreadableParts } from './sanitize'

export class ImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImportError'
  }
}

const SHEET = 'Data Input'
const BLOCK0 = 25
const RELS: Rel[] = ['FS', 'SS', 'FF', 'SF']
const DAY_MS = 86_400_000

/** Unwrap formulas (cached result), rich text and hyperlinks to a plain value. */
function plain(v: ExcelJS.CellValue): unknown {
  if (v == null) return null
  if (v instanceof Date || typeof v !== 'object') return v
  if ('result' in v) return plain(v.result as ExcelJS.CellValue)
  if ('formula' in v || 'sharedFormula' in v) return null // formula never calculated
  if ('richText' in v) return v.richText.map((r) => r.text).join('')
  if ('text' in v) return String(v.text)
  if ('error' in v) return null
  return null
}

const text = (v: unknown): string => (v == null ? '' : String(v).trim())
const isBlank = (v: unknown) => v == null || (typeof v === 'string' && v.trim() === '')

function num(v: unknown): number | null {
  if (isBlank(v)) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const s = v.trim()
    if (s.endsWith('%')) {
      const n = Number(s.slice(0, -1))
      return Number.isFinite(n) ? n / 100 : null
    }
    const n = Number(s)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function date(v: unknown): Date | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v
  return null
}

/** A time-of-day cell → hours since midnight. Accepts Date, fraction of a day, "HH:MM". */
function timeOfDay(v: unknown): number | null {
  if (isBlank(v)) return null
  if (v instanceof Date) return v.getUTCHours() + v.getUTCMinutes() / 60 + v.getUTCSeconds() / 3600
  if (typeof v === 'number') return (v % 1) * 24
  if (typeof v === 'string') {
    const m = v.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
    if (m) return Number(m[1]) + Number(m[2]) / 60 + Number(m[3] ?? 0) / 3600
  }
  return null
}

function unit(v: unknown, cell: string): HoursOrDays {
  const s = text(v).toLowerCase()
  if (s === 'hours' || s === 'days') return s
  throw new ImportError(`Data Input!${cell} must be "hours" or "days" (found "${text(v)}").`)
}

export function addUnits(d: Date, n: number, u: HoursOrDays): Date {
  return new Date(d.getTime() + n * (u === 'days' ? DAY_MS : 3_600_000))
}

function readSettings(ws: ExcelJS.Worksheet, warnings: string[]): Settings {
  const at = (a: string) => plain(ws.getCell(a).value)
  const possessionStart = date(at('C8'))
  if (!possessionStart) throw new ImportError('Data Input!C8 (possession start) is not a date and time.')
  const duration = num(at('G8'))
  if (duration == null || duration <= 0) throw new ImportError('Data Input!G8 (duration) must be a positive number.')
  const durUnit = unit(at('K8'), 'K8')

  let cutoff = date(at('M5'))
  const cutoffDefaulted = cutoff == null
  if (!cutoff) {
    cutoff = possessionStart
    warnings.push('Report cut-off (M5) has no stored value (it is =NOW()); defaulted to the possession start.')
  }

  // C9 is normally =$C$8; with no cached result fall back to the possession start.
  const ganttStart = date(at('C9')) ?? possessionStart
  const ganttSpan = num(at('G9')) ?? duration
  const ganttSpanUnit = isBlank(at('K9')) ? durUnit : unit(at('K9'), 'K9')

  return {
    projectName: text(at('C4')),
    reportTitle: text(at('K4')),
    subtitle: text(at('C5')),
    preparedBy: text(at('I5')),
    cutoff,
    cutoffDefaulted,
    possessionStart,
    duration,
    unit: durUnit,
    possessionEnd: addUnits(possessionStart, duration, durUnit),
    ganttStart,
    ganttSpan,
    ganttSpanUnit,
  }
}

function readActivity(ws: ExcelJS.Worksheet, row: number, no: number, warnings: string[]): ActivityInput | null {
  const at = (c: string) => plain(ws.getCell(`${c}${row}`).value)
  const name = text(at('B'))
  if (!name) return null // switched off

  const durationH = num(at('E'))
  if (durationH == null) {
    warnings.push(`Row ${row} "${name}": duration (E) is blank — flagged, not defaulted.`)
  }
  const relRaw = text(at('G')).toUpperCase()
  const rel = (relRaw || 'FS') as Rel
  if (!RELS.includes(rel)) {
    throw new ImportError(`Data Input!G${row}: relationship "${relRaw}" must be one of FS, SS, FF, SF.`)
  }
  const pct = num(at('N'))
  if (pct != null && (pct < 0 || pct > 1)) {
    warnings.push(`Row ${row} "${name}": % complete (N) is ${pct}, outside 0–1.`)
  }

  return {
    no,
    sourceRow: row,
    name,
    durationH,
    pred: num(at('F')) ?? 0,
    rel,
    lagH: num(at('H')) ?? 0,
    actualStartDate: date(at('I')),
    actualStartTime: timeOfDay(at('J')),
    actualFinishDate: date(at('K')),
    actualFinishTime: timeOfDay(at('L')),
    pct,
    remarks: text(at('P')),
  }
}

export async function parseWorkbook(data: ArrayBuffer | Uint8Array): Promise<Project> {
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load((await stripUnreadableParts(data)) as unknown as ExcelJS.Buffer)
  } catch (e) {
    throw new ImportError(`Could not open the file as an .xlsx workbook: ${(e as Error).message}`)
  }
  const ws = wb.getWorksheet(SHEET)
  if (!ws) throw new ImportError(`Workbook has no "${SHEET}" sheet.`)

  const warnings: string[] = []
  const settings = readSettings(ws, warnings)

  const locationCount = num(plain(ws.getCell('M10').value))
  const perLocation = num(plain(ws.getCell('O10').value))
  if (!locationCount || locationCount < 1 || !Number.isInteger(locationCount)) {
    throw new ImportError('Data Input!M10 (number of locations) must be a whole number ≥ 1.')
  }
  if (!perLocation || perLocation < 1 || !Number.isInteger(perLocation)) {
    throw new ImportError('Data Input!O10 (activity rows per location) must be a whole number ≥ 1.')
  }

  const stride = perLocation + 4
  const locations: LocationInput[] = []
  for (let i = 0; i < locationCount; i++) {
    const listRow = 15 + i
    const name = text(plain(ws.getCell(`B${listRow}`).value))
    if (!name) throw new ImportError(`Location ${i + 1}: Data Input!B${listRow} (location name) is blank.`)
    const scope = text(plain(ws.getCell(`I${listRow}`).value))

    const band = BLOCK0 + i * stride
    const first = band + 2
    const last = first + perLocation - 1
    const totalRow = last + 1
    const marker = text(plain(ws.getCell(`A${totalRow}`).value))
    if (marker !== 'TOT') {
      throw new ImportError(
        `Block ${i + 1} ("${name}"): expected "TOT" in Data Input!A${totalRow} ` +
          `(band row ${band}, ${perLocation} activity rows from row ${first}) but found "${marker}". ` +
          `The block layout does not match M10/O10 — nothing was imported.`,
      )
    }

    const activities: ActivityInput[] = []
    for (let k = 0; k < perLocation; k++) {
      const a = readActivity(ws, first + k, k + 1, warnings)
      if (a) activities.push(a)
    }
    locations.push({ name, scope, activities })
  }

  return { settings, locationCount, activityRowsPerLocation: perLocation, locations, warnings }
}

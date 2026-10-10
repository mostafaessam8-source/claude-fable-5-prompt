import ExcelJS from 'exceljs'
import type {
  ActivityInput, HoursOrDays, LocationInput, Project, Rel, Settings,
} from '../model/types'
import { addUnits, ImportError, date, isBlank, num, plain, text, timeOfDay } from './cells'
import { looksLikeCrp2, parseCrp2 } from './crp2'
import { stripUnreadableParts } from './sanitize'

export { addUnits, ImportError }

const SHEET = 'Data Input'
const BLOCK0 = 25
const RELS: Rel[] = ['FS', 'SS', 'FF', 'SF']

function unit(v: unknown, cell: string): HoursOrDays {
  const s = text(v).toLowerCase()
  if (s === 'hours' || s === 'days') return s
  throw new ImportError(`Data Input!${cell} must be "hours" or "days" (found "${text(v)}").`)
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
  if (!ws) {
    // Not a tracker: try the raw CRP2 progress sheet the tracker was made from.
    if (looksLikeCrp2(wb)) return parseCrp2(wb)
    throw new ImportError(
      `Workbook has no "${SHEET}" sheet, and it is not a CRP2 progress sheet either ` +
        `(no sheet with a "Work Description" column and "LOCATION: …" rows). Sheets found: ${wb.worksheets.map((w) => `"${w.name}"`).join(', ')}.`,
    )
  }

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

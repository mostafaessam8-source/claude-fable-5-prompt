import type ExcelJS from 'exceljs'
import { locationStrings, type SiteLayout } from '../layout/parse'
import type { Project } from '../model/types'
import { cfFill, center, COL, font, left, box, solid, argb } from './styles'
import { colLetter, DI_FIRST_LOCATION_ROW, diBlock } from './positions'

// exceljs drops a width of exactly 9 (its default) from the file, so 9 is written as 9.001.
const WIDTHS = [5, 44, 15, 15, 8, 7.5, 7.5, 7, 12, 9.001, 12, 9.001, 9.001, 11, 21, 26]
const LIST = 30 // column AD: drop-down sources (rel / unit / possession dates)

const HEADERS: [string, string, string][] = [
  ['A', 'No', 'Activity number within this location. Predecessors refer to it. Calculated.'],
  ['B', 'ACTIVITY  (leave blank to switch the row off)', 'The work description shown on the report. Leave it blank to switch the row off: it then disappears from the tracker, the Gantt and the totals.'],
  ['C', 'Planned\nStart', 'Planned start, calculated from the predecessor, relationship and lag. Locked.'],
  ['D', 'Planned\nFinish', 'Planned finish = planned start + duration. Locked.'],
  ['E', 'DUR\n(h)', 'Planned duration in hours. Decimals are fine: 1.5 means one hour thirty.'],
  ['F', 'PRED\nNo', 'Number of the activity above that this one follows, within this location. 0 = starts at the possession start. It must point upwards, otherwise the status reads ! CHECK LINK.'],
  ['G', 'REL', 'Relationship to the predecessor: FS finish-to-start, SS start-to-start, FF finish-to-finish, SF start-to-finish.'],
  ['H', 'LAG\n(h)', 'Waiting time on the link, in hours. Negative = overlap.'],
  ['I', 'ACT START\nDate', 'Actual start date. Click the arrow and pick it from the list; do not type it.'],
  ['J', 'ACT START\nTime', 'Actual start time, 24-hour hh:mm, e.g. 14:30. Blank = 00:00.'],
  ['K', 'ACT FINISH\nDate', 'Actual finish date. Pick it from the list. Entering a finish makes the activity 100% complete.'],
  ['L', 'ACT FINISH\nTime', 'Actual finish time, 24-hour hh:mm.'],
  ['M', 'ACT\nDur', 'Actual duration in hours. Calculated.'],
  ['N', '% COMP', 'Percentage complete, e.g. 60%. Leave blank if not started. Becomes 100% automatically when an Actual Finish is entered.'],
  ['O', 'STATUS  (auto)', 'Status, calculated from the dates and progress. Locked.'],
  ['P', 'REMARKS', 'Free text: reason for a delay, who is on site. For the record only; changes no calculation.'],
]

const msg = (title: string, prompt: string, errTitle?: string, err?: string, strict = true): Partial<ExcelJS.DataValidation> => ({
  allowBlank: true, showInputMessage: true, promptTitle: title, prompt,
  showErrorMessage: strict, errorTitle: errTitle ?? title, error: err ?? '',
})

/** Number of possession dates offered in the date drop-down. */
export function possessionDateCount(startH: number, durH: number) {
  return Math.ceil((startH + durH) / 24) + 1
}

export async function writeDataInput(wb: ExcelJS.Workbook, project: Project, layouts: SiteLayout[]) {
  const ws = wb.addWorksheet('Data Input', {
    views: [{ state: 'frozen', ySplit: 14, topLeftCell: 'A15', showGridLines: false }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printArea: undefined },
  })
  const s = project.settings
  const n = project.locationCount
  const m = project.activityRowsPerLocation

  WIDTHS.forEach((w, i) => (ws.getColumn(i + 1).width = w))
  for (let c = 17; c <= LIST; c++) { ws.getColumn(c).hidden = true; ws.getColumn(c).width = 12 }

  const put = (addr: string, value: ExcelJS.CellValue, st: Partial<ExcelJS.Style> = {}, unlocked = false) => {
    const c = ws.getCell(addr)
    c.value = value
    Object.assign(c, st)
    c.protection = { locked: !unlocked }
    return c
  }
  const merged = (range: string, value: ExcelJS.CellValue, st: Partial<ExcelJS.Style>, unlocked = false) => {
    ws.mergeCells(range)
    return put(range.split(':')[0], value, st, unlocked)
  }
  const label = (range: string, text: string) =>
    merged(range, text, { fill: solid(COL.slate), font: font('#FFFFFF', 9, true), alignment: center, border: box })
  const input = (range: string, value: ExcelJS.CellValue, numFmt?: string, size = 10) => {
    const c = merged(range, value, { fill: solid(COL.yellow), font: font(COL.blue, size, true), alignment: center, border: box }, true)
    if (numFmt) c.numFmt = numFmt
    return c
  }
  const calc = (range: string, f: string, numFmt?: string) => {
    const c = merged(range, { formula: f }, { fill: solid(COL.tint1), font: font(COL.black, 10, true), alignment: center, border: box })
    if (numFmt) c.numFmt = numFmt
  }
  const band = (range: string, text: string, bg: string, size = 11) =>
    merged(range, text, { fill: solid(bg), font: font('#FFFFFF', size, true), alignment: { horizontal: 'left', vertical: 'middle' } })

  // ---- title + settings --------------------------------------------------------------
  band('A1:P1', '   SAR  -  POSSESSION PROGRESS REPORT   |   DATA INPUT AND SETTINGS', COL.blue, 13)
  ws.getRow(1).height = 27.75
  merged('A2:P2', '   Everything below drives the report. Yellow cells are yours to edit - every other cell is locked and calculated.',
    { font: font(COL.slate, 9), alignment: { horizontal: 'left', vertical: 'middle' } })

  label('A4:B4', 'PROJECT NAME'); input('C4:H4', s.projectName, undefined, 11)
  label('I4:J4', 'REPORT TITLE'); input('K4:P4', s.reportTitle, undefined, 11)
  label('A5:B5', 'SUBTITLE'); input('C5:F5', s.subtitle, undefined, 11)
  label('G5:H5', 'PREPARED BY'); input('I5:J5', s.preparedBy)
  label('K5:L5', 'REPORT CUT-OFF')
  // A defaulted cut-off means the source held =NOW(): keep it live for the site engineers.
  input('M5:P5', s.cutoffDefaulted ? ({ formula: 'NOW()' } as ExcelJS.CellValue) : s.cutoff, 'dd-mmm-yyyy hh:mm')

  band('A7:P7', '   POSSESSION WINDOW', COL.black)
  label('A8:B8', 'WINDOW STARTS'); input('C8:D8', s.possessionStart, 'dd-mmm-yyyy hh:mm')
  label('E8:F8', 'DURATION'); input('G8:H8', s.duration)
  label('I8:J8', 'UNIT'); input('K8', s.unit)
  label('L8:M8', 'WINDOW ENDS'); calc('N8:P8', '$C$8+$G$8*IF($K$8="days",1,1/24)', 'ddd dd-mmm-yyyy hh:mm')
  label('A9:B9', 'GANTT STARTS')
  const ganttSame = s.ganttStart.getTime() === s.possessionStart.getTime()
  input('C9:D9', ganttSame ? ({ formula: '$C$8' } as ExcelJS.CellValue) : s.ganttStart, 'dd-mmm-yyyy hh:mm')
  label('E9:F9', 'GANTT SPAN'); input('G9:H9', s.ganttSpan)
  label('I9:J9', 'UNIT'); input('K9', s.ganttSpanUnit)
  label('L9:M9', 'ONE COLUMN ='); calc('N9:P9', 'TEXT($G$9*IF($K$9="days",24,1)/48*60,"0")&" min"')
  label('A10:B10', 'TOTAL HOURS'); calc('C10:D10', '($N$8-$C$8)*24', '0.0')
  label('E10:F10', 'ELAPSED')
  calc('G10:J10', 'TEXT(MEDIAN(0,($M$5-$C$8)*24,$C$10),"0.0")&"  h  of  "&TEXT($C$10,"0.0")&" h"')
  label('K10:L10', 'LOCATIONS')
  put('M10', n, { fill: solid(COL.tint1), font: font(COL.black, 10, true), alignment: center, border: box })
  label('N10', 'ACTIVITIES')
  merged('O10:P10', m, { fill: solid(COL.tint1), font: font(COL.black, 10, true), alignment: center, border: box })
  merged('A11:P11', `   The Gantt is always 48 columns wide - a shorter span gives finer columns.   Delivered with ${n} locations x ${m} activities per location; blank an ACTIVITY name to switch that row off.`,
    { font: font(COL.slate, 9), alignment: { horizontal: 'left', vertical: 'middle' } })

  // ---- location list -----------------------------------------------------------------
  band('A13:P13', '   LOCATIONS', COL.black)
  put('A14', 'No', { fill: solid(COL.slate), font: font('#FFFFFF', 9, true), alignment: center, border: box })
  merged('B14:H14', 'LOCATION NAME', { fill: solid(COL.slate), font: font('#FFFFFF', 9, true), alignment: center, border: box })
  merged(`I14:P14`, 'SCOPE / SUB-TITLE SHOWN ON THE PAGE', { fill: solid(COL.slate), font: font('#FFFFFF', 9, true), alignment: center, border: box })
  project.locations.forEach((l, i) => {
    const r = DI_FIRST_LOCATION_ROW + i
    const str = locationStrings(l.name, l.scope, layouts[i])
    put(`A${r}`, i + 1, { font: font(COL.slate, 9), alignment: center, border: box })
    merged(`B${r}:H${r}`, str.name, { fill: solid(COL.yellow), font: font(COL.blue, 10, true), alignment: { horizontal: 'left', vertical: 'middle' }, border: box }, true)
    merged(`I${r}:P${r}`, str.scope, { fill: solid(COL.yellow), font: font(COL.black, 9), alignment: { horizontal: 'left', vertical: 'middle' }, border: box }, true)
    ws.getRow(r).height = 18
  })

  // ---- drop-down sources (hidden column AD) -------------------------------------------
  const L = colLetter(LIST)
  ;['FS', 'SS', 'FF', 'SF'].forEach((v, i) => (ws.getCell(`${L}${2 + i}`).value = v))
  ws.getCell(`${L}8`).value = 'hours'
  ws.getCell(`${L}9`).value = 'days'
  const startFracH = (s.possessionStart.getUTCHours() + s.possessionStart.getUTCMinutes() / 60)
  const durH = s.duration * (s.unit === 'days' ? 24 : 1)
  const nDates = possessionDateCount(startFracH, durH)
  for (let k = 0; k < nDates; k++) {
    const c = ws.getCell(`${L}${12 + k}`)
    c.value = { formula: `INT($C$8)+${k}` }
    c.numFmt = 'dd-mmm-yyyy'
  }
  const dateList = `$${L}$12:$${L}$${11 + nDates}`
  const relList = `$${L}$2:$${L}$5`
  const unitList = `$${L}$8:$${L}$9`
  ws.getCell('K8').dataValidation = { type: 'list', formulae: [unitList], ...msg('Unit', 'hours or days.', 'Unit', 'Choose hours or days.') }
  ws.getCell('K9').dataValidation = { type: 'list', formulae: [unitList], ...msg('Unit', 'hours or days.', 'Unit', 'Choose hours or days.') }

  // ---- activity blocks ---------------------------------------------------------------
  for (let i = 0; i < n; i++) {
    const b = diBlock(i, m)
    const nameCell = `$B$${DI_FIRST_LOCATION_ROW + i}`
    ws.mergeCells(`A${b.band}:P${b.band}`)
    put(`A${b.band}`, { formula: `IF(${nameCell}="","LOCATION ${i + 1}  -  not used","   LOCATION ${i + 1}  -  "&${nameCell})` },
      { fill: solid(COL.blue), font: font('#FFFFFF', 12, true), alignment: { horizontal: 'left', vertical: 'middle' } })
    ws.getRow(b.band).height = 24

    HEADERS.forEach(([col, text, note]) => {
      const green = 'IJKLNP'.includes(col)
      const c = put(`${col}${b.header}`, text, { fill: solid(green ? COL.green : COL.slate), font: font('#FFFFFF', 9, true), alignment: center, border: box })
      c.note = note
    })
    ws.getRow(b.header).height = 30

    const act = new Map(project.locations[i].activities.map((a) => [a.no, a]))
    for (let k = 1; k <= m; k++) {
      const r = b.first + k - 1
      const a = act.get(k)
      const f = b.first
      const l = b.last
      ws.getRow(r).height = 19.5
      const lock = (col: string, v: ExcelJS.CellValue, st: Partial<ExcelJS.Style>, nf?: string, unlocked = false) => {
        const c = put(`${col}${r}`, v, { alignment: center, border: box, ...st }, unlocked)
        if (nf) c.numFmt = nf
        return c
      }
      const calcSt = { font: font(COL.black, 9) }
      const inSt = (bold = false) => ({ fill: solid(COL.yellow), font: font(bold ? COL.black : COL.blue, 9, bold) })
      const inGreen = (bold = false, size = 9) => ({ fill: solid(COL.greenTint), font: font(COL.black, size, bold) })

      lock('A', { formula: `IF(OR($B${r}="",${k}>$O$10),"",${k})` }, calcSt)
      lock('B', a?.name ?? null, { ...inSt(), alignment: left }, undefined, true)
      const ref = (c: string) => `OFFSET($${c}$${b.header},$F${r},0)`
      lock('C', { formula:
        `IF(OR($B${r}="",${k}>$O$10),"",IF(OR($AB${r}=1,$F${r}=0),$C$8+$H${r}/24,` +
        `IF($G${r}="SS",${ref('C')}+$H${r}/24,IF($G${r}="FF",${ref('D')}+$H${r}/24-$E${r}/24,` +
        `IF($G${r}="SF",${ref('C')}+$H${r}/24-$E${r}/24,${ref('D')}+$H${r}/24)))))` }, calcSt, 'dd-mmm hh:mm')
      lock('D', { formula: `IF(OR($B${r}="",${k}>$O$10),"",$C${r}+$E${r}/24)` }, calcSt, 'dd-mmm hh:mm')
      lock('E', a?.durationH ?? null, inSt(true), '0.0', true)
      lock('F', a ? a.pred : null, inSt(), '0', true)
      lock('G', a ? a.rel : null, inSt(), undefined, true)
      lock('H', a ? a.lagH : null, inSt(), '0.0', true)
      lock('I', a?.actualStartDate ?? null, inGreen(), 'dd-mmm-yyyy', true)
      lock('J', a?.actualStartTime != null ? a.actualStartTime / 24 : null, inGreen(), 'hh:mm', true)
      lock('K', a?.actualFinishDate ?? null, inGreen(), 'dd-mmm-yyyy', true)
      lock('L', a?.actualFinishTime != null ? a.actualFinishTime / 24 : null, inGreen(), 'hh:mm', true)
      lock('M', { formula: `IF(OR($Q${r}="",$R${r}="",$V${r}=1),"",($R${r}-$Q${r})*24)` }, calcSt, '0.0')
      lock('N', a?.pct ?? null, inGreen(true, 10), '0%', true)
      lock('O', { formula:
        `IF(OR($B${r}="",${k}>$O$10),"",IF($AB${r}=1,"! CHECK LINK",IF($V${r}=1,"! CHECK DATES",IF($Z${r}=1,"! CHECK DURATION",` +
        `IF($S${r}=1,IF($R${r}="","Completed",IF($R${r}<$D${r},"Completed - Ahead",IF($R${r}<=$D${r}+1/1440,"Completed - On Time","Completed - Delayed"))),` +
        `IF($Q${r}<>"",IF($Y${r}<=0.1,"In Progress - On Track","In Progress - BEHIND"),IF($M$5<$C${r},"Not Started","NOT STARTED - LATE")))))))` },
        { fill: solid(COL.slate), font: font('#FFFFFF', 9, true) })
      lock('P', a?.remarks || null, { ...inSt(), alignment: left }, undefined, true)

      // hidden engine columns Q..AB
      const eng = (col: string, f: string, nf?: string) => { const c = ws.getCell(`${col}${r}`); c.value = { formula: f }; if (nf) c.numFmt = nf }
      eng('Q', `IF($I${r}="","",$I${r}+IF($J${r}="",0,$J${r}))`, 'dd-mmm-yyyy hh:mm')
      eng('R', `IF($K${r}="","",$K${r}+IF($L${r}="",0,$L${r}))`, 'dd-mmm-yyyy hh:mm')
      eng('S', `IF(OR($V${r}=1,$AB${r}=1,$Z${r}=1),0,IF($R${r}<>"",1,IF($N${r}="",0,MIN(1,MAX(0,$N${r})))))`)
      eng('T', `IF(OR($B${r}="",$E${r}=0),0,MEDIAN(0,($M$5-$C${r})/($E${r}/24),1))`)
      eng('U', `($S${r}-$T${r})*$E${r}`)
      eng('V', `IF(OR(AND($Q${r}<>"",$Q${r}<$C$8),AND($Q${r}<>"",$R${r}<>"",$R${r}<$Q${r}),AND($R${r}<>"",$Q${r}="")),1,0)`)
      eng('W', `IF($B${r}="","",IF($S${r}=1,IF($R${r}<>"",$R${r},$D${r}),IF($Q${r}<>"",MAX($M$5,$Q${r})+$E${r}/24*(1-$S${r}),MAX($M$5,$C${r})+$E${r}/24)))`, 'dd-mmm-yyyy hh:mm')
      eng('X', `IF($B${r}="","",ROUND(($W${r}-$D${r})*24,1))`)
      // Carried slip along the activity's own predecessor link (column F, relationship G): a delay reaches only
      // what depends on it. The gap that can absorb a slip is the planned slack between the two joined ends.
      // OFFSET (as in the planned-date formula) keeps Excel from seeing a circular reference through column Y.
      const off = (col: string) => `OFFSET($${col}$${b.header},$F${r},0)`
      const noLink = `OR($F${r}=0,$AB${r}=1)`
      const prevY = `IF(${noLink},0,N(${off('Y')}))`
      const gap = `IF(${noLink},0,MAX(0,IF($G${r}="SS",($C${r}-${off('C')})*24,IF($G${r}="FF",($D${r}-${off('D')})*24,` +
        `IF($G${r}="SF",($D${r}-${off('C')})*24,($C${r}-${off('D')})*24)))))`
      const absorb = `IF(${prevY}>0,MAX(0,${prevY}-${gap}),${prevY})`
      eng('Y', k === 1
        ? `IF($B${r}="","",$X${r})`
        : `IF($B${r}="","",IF($Q${r}<>"",$X${r},IF($X${r}>0,MAX($X${r},${absorb}),${absorb})))`)
      eng('AA', `IF($B${r}="","",$D${r}+$Y${r}/24)`, 'dd-mmm-yyyy hh:mm') // carried forecast finish of this activity
      eng('Z', `IF(AND($B${r}<>"",$E${r}=""),1,0)`)
      eng('AB', `IF($B${r}="",0,IF($F${r}=0,0,IF(OR($F${r}>=${k},$F${r}>$O$10),1,IFERROR(IF(INDEX($B$${f}:$B$${l},$F${r})="",1,0),1))))`)

      // validation with an input prompt on every input cell
      const dv = (col: string, v: ExcelJS.DataValidation) => { ws.getCell(`${col}${r}`).dataValidation = v }
      dv('B', { type: 'textLength', operator: 'between', formulae: [0, 200], ...msg('Activity name', 'The work description shown on the report.\nLeave it BLANK to switch this row off - it then disappears from the tracker, the Gantt and the totals.', undefined, undefined, false) } as ExcelJS.DataValidation)
      dv('E', { type: 'decimal', operator: 'between', formulae: [0, 168], ...msg('Planned duration  (hours)', 'How many hours this activity is planned to take.\nDecimals are fine:  1.5  means one hour thirty.', 'Duration', 'Type the planned hours, between 0 and 168.') } as ExcelJS.DataValidation)
      dv('F', { type: 'whole', operator: 'between', formulae: [0, 99], ...msg('Predecessor activity', 'The activity number this one follows, in this location.\n    0   starts at the possession start\n    3   driven by activity 3 above\nIt must point upwards, or the status reads ! CHECK LINK.', 'Predecessor', 'Type the number of an activity ABOVE this one, or 0.') } as ExcelJS.DataValidation)
      dv('G', { type: 'list', formulae: [relList], ...msg('Relationship', 'FS finish-to-start\nSS start-to-start\nFF finish-to-finish\nSF start-to-finish', 'Relationship', 'Choose FS, SS, FF or SF.'), allowBlank: false } as ExcelJS.DataValidation)
      dv('H', { type: 'decimal', operator: 'between', formulae: [-168, 168], ...msg('Lag  (hours)', 'Waiting time on the link, in hours.\n     0   no wait\n     2   start two hours after\n    -1   start one hour early (overlap)', 'Lag', 'Type the lag in hours, e.g. 2 or -1.') } as ExcelJS.DataValidation)
      for (const col of ['I', 'K']) {
        dv(col, { type: 'list', formulae: [dateList], ...msg('Actual date', 'Click the arrow and pick the date from the list.\nDo not type it.', 'Pick from the list', 'Use the drop-down arrow and pick one of the possession dates.') } as ExcelJS.DataValidation)
      }
      for (const col of ['J', 'L']) {
        dv(col, { type: 'time', operator: 'between', formulae: [0, 0.99999], ...msg('Actual time  (24-hour)', 'Type the hour and minute with a colon:\n    2 PM       ->  14:00\n    8 AM       ->  08:00\n    midnight   ->  00:00\nDo not type 8 or 1430.', 'Time format', 'Type the time as hh:mm in 24-hour format, for example 14:30.') } as ExcelJS.DataValidation)
      }
      dv('N', { type: 'decimal', operator: 'between', formulae: [0, 1], ...msg('% Complete', 'Type the percentage, e.g. 60%\nLeave blank if the activity has not started.\nIf you enter an Actual Finish, this becomes 100% automatically.', '% Complete', 'Type a percentage between 0% and 100%.') } as ExcelJS.DataValidation)
      dv('P', { type: 'textLength', operator: 'between', formulae: [0, 400], ...msg('Remarks', 'Free text - reason for a delay, who is on site, what is waiting.\nFor the record only; it changes no calculation.', undefined, undefined, false) } as ExcelJS.DataValidation)
    }

    // TOT row
    const t = b.total
    const f = b.first, l = b.last
    ws.getRow(t).height = 19.5
    for (let c = 1; c <= 16; c++) {
      const cell = ws.getCell(t, c)
      cell.fill = solid(COL.black); cell.font = font('#FFFFFF', 9, true); cell.alignment = center
      cell.protection = { locked: true }
    }
    ws.getCell(`A${t}`).value = 'TOT'
    const tot = (col: string, formula: string, nf?: string) => { const c = ws.getCell(`${col}${t}`); c.value = { formula }; if (nf) c.numFmt = nf }
    ws.getCell(`B${t}`).alignment = { horizontal: 'left', vertical: 'middle' }
    tot('B', `IF($B$${DI_FIRST_LOCATION_ROW + i}="","",$B$${DI_FIRST_LOCATION_ROW + i}&"   -   sum of activity hours")`)
    tot('D', `IF(COUNT($D${f}:$D${l})=0,"",MAX($D${f}:$D${l}))`, 'dd-mmm hh:mm')
    tot('E', `SUM($E${f}:$E${l})`, '0.0')
    tot('M', `SUM($M${f}:$M${l})`, '0.0')
    tot('N', `$S${t}`, '0%')
    tot('O', `IF($B$${DI_FIRST_LOCATION_ROW + i}="","",IF($X${t}<=0,"ON TRACK","BEHIND"))`)
    const hid = (col: string, formula: string, nf?: string) => { const c = ws.getCell(`${col}${t}`); c.value = { formula }; if (nf) c.numFmt = nf }
    hid('S', `IF($E${t}=0,0,SUMPRODUCT($E${f}:$E${l},$S${f}:$S${l})/$E${t})`)
    hid('T', `IF($E${t}=0,0,SUMPRODUCT($E${f}:$E${l},$T${f}:$T${l})/$E${t})`)
    hid('U', `$S${t}-$T${t}`)
    // The location finishes when its latest forecast activity does (not necessarily the last row).
    hid('W', `IF(COUNT($AA${f}:$AA${l})=0,"",MAX($AA${f}:$AA${l}))`, 'dd-mmm-yyyy hh:mm')
    hid('X', `IF($W${t}="",0,($W${t}-$D${t})*24)`)

    // status colours for the O column (exact strings; plain "Not Started" stays neutral)
    const rules: [string, string, string, string][] = [
      ['COUNTIF($O{r},"!*")>0', COL.red, '#FFFFFF', ''],
      ['COUNTIF($O{r},"Completed*Delayed")>0', COL.red, '#FFFFFF', ''],
      ['COUNTIF($O{r},"Completed*")>0', COL.blue, '#FFFFFF', ''],
      ['COUNTIF($O{r},"*BEHIND*")>0', COL.amber, COL.black, ''],
      ['COUNTIF($O{r},"In Progress*")>0', COL.sky, COL.black, ''],
      ['COUNTIF($O{r},"NOT STARTED - LATE")>0', COL.red, '#FFFFFF', ''],
    ]
    ws.addConditionalFormatting({
      ref: `O${f}:O${l}`,
      rules: rules.map(([fm, bg, fg], idx) => ({
        type: 'expression' as const, priority: i * 10 + idx + 1, formulae: [fm.replace('{r}', String(f))],
        style: { fill: cfFill(bg), font: { bold: true, color: { argb: argb(fg) } } },
      })),
    })
  }

  // Sheet protection: only the yellow/green input cells are unlocked.
  await ws.protect('', {})
  return ws
}

import type ExcelJS from 'exceljs'
import { pageTitle, type SiteLayout } from '../layout/parse'
import type { Project } from '../model/types'
import { cfFill, center, COL, font, left, box, bottomOnly, solid, argb } from './styles'
import { colLetter, diBlock, DI_FIRST_LOCATION_ROW, GANTT_COLS, R, reportRows } from './positions'

const D = "'Data Input'!"
const WIDTHS = [3.5, 29, 15.5, 14.5, 14.5, 13.5, 7, 7, 10.5, 2.3]
const STATUS_RULES: [string, string, string][] = [
  ['AT RISK', '8E1B1F', '#FFFFFF'], ['BEHIND', COL.red, '#FFFFFF'], ['TIGHT', COL.amber, COL.black],
  ['AHEAD', COL.sky, COL.black], ['ON TIME', COL.blue, '#FFFFFF'],
]
const columnLine = { style: 'thin' as const, color: { argb: 'FFC5D0D4' } }
const VAR_FMT = '+0.0" h behind";-0.0" h ahead";"on time"'
const DT = 'ddd dd-mmm hh:mm'

export function writeReport(wb: ExcelJS.Workbook, project: Project, layouts: SiteLayout[], cardsPng?: { data: Uint8Array; width: number; height: number }) {
  const n = project.locationCount
  const m = project.activityRowsPerLocation
  const rows = reportRows(n, m)
  const ws = wb.addWorksheet('Report', {
    views: [{ showGridLines: false }],
    properties: { defaultRowHeight: 15 },
    pageSetup: {
      orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.2, right: 0.2, top: 0.25, bottom: 0.25, header: 0.12, footer: 0.12 },
      printArea: `A1:${colLetter(R.G1)}${rows.last}`,
    },
  })
  WIDTHS.forEach((w, i) => (ws.getColumn(i + 1).width = w))
  for (let c = R.G0; c <= R.G1; c++) ws.getColumn(c).width = 1.65
  for (let c = R.H_HOURS; c <= R.H_FE; c++) { ws.getColumn(c).width = 11; ws.getColumn(c).hidden = true }
  const G0 = colLetter(R.G0), G1 = colLetter(R.G1)
  const gc = (i: number) => colLetter(R.G0 + i) // i = 0..47

  const set = (addr: string, v: ExcelJS.CellValue, st: Partial<ExcelJS.Style> = {}) => {
    const c = ws.getCell(addr)
    c.value = v
    Object.assign(c, st)
    return c
  }
  const merge = (range: string, v: ExcelJS.CellValue, st: Partial<ExcelJS.Style> = {}) => {
    ws.mergeCells(range)
    return set(range.split(':')[0], v, st)
  }
  const F = (formula: string): ExcelJS.CellValue => ({ formula })
  const full = (r: number) => `A${r}:${G1}${r}`

  // ---- row 1-2: helper values (hidden) -------------------------------------------------
  set('A1', F(`${D}$C$8`)).numFmt = 'dd-mmm-yyyy hh:mm'
  set('B1', F(`${D}$N$8`)).numFmt = 'dd-mmm-yyyy hh:mm'
  set('C1', F(`${D}$M$5`)).numFmt = 'dd-mmm-yyyy hh:mm'
  set('D1', F(`(${D}$C$9-${D}$C$8)*24`))
  set('E1', F(`${D}$G$9*IF(${D}$K$9="days",24,1)/48`))
  for (let i = 0; i < GANTT_COLS; i++) {
    set(`${gc(i)}1`, i)
    // row 2 = 1 when this Gantt column starts exactly at clock midnight
    set(`${gc(i)}2`, F(`IF(MOD(ROUND(($A$1+($D$1+${gc(i)}$1*$E$1)/24)*1440,0),1440)=0,1,0)`))
  }
  ws.getRow(1).hidden = true
  ws.getRow(2).hidden = true

  // ---- cover ---------------------------------------------------------------------------
  merge(full(3), F(`${D}$C$4`), { fill: solid(COL.black), font: font('#FFFFFF', 12, true), alignment: center }); ws.getRow(3).height = 21.75
  merge(full(4), F(`${D}$K$4`), { fill: solid(COL.blue), font: font('#FFFFFF', 22, true), alignment: center }); ws.getRow(4).height = 37.5
  merge(full(5), F(`${D}$C$5`), { fill: solid(COL.tint2), font: font(COL.blue, 11, true), alignment: center }); ws.getRow(5).height = 24
  const info = (r: number, label: string, f: string) => {
    merge(`A${r}:C${r}`, label, { fill: solid(COL.tint1), font: font(COL.blue, 10, true), alignment: { horizontal: 'left', vertical: 'middle' } })
    merge(`D${r}:${G1}${r}`, F(f), { fill: solid(COL.tint1), font: font(COL.black, 10, true), alignment: { horizontal: 'left', vertical: 'middle' } })
    ws.getRow(r).height = 21.75
  }
  info(7, 'REPORT GENERATED', `TEXT($C$1,"dddd  dd-mmm-yyyy   hh:mm")&"          prepared by  "&${D}$I$5`)
  info(8, 'POSSESSION WINDOW', `TEXT($A$1,"dddd dd-mmm-yyyy hh:mm")&"   to   "&TEXT($B$1,"dddd dd-mmm-yyyy hh:mm")&"    =  "&TEXT(($B$1-$A$1)*24,"0.0")&" hours"`)
  info(9, 'ELAPSED / REMAINING', `TEXT(MEDIAN(0,($C$1-$A$1)*24,($B$1-$A$1)*24),"0.0")&" h elapsed          "&TEXT(($B$1-$A$1)*24-MEDIAN(0,($C$1-$A$1)*24,($B$1-$A$1)*24),"0.0")&" h remaining"`)

  merge(full(11), '   SUMMARY  -  ALL LOCATIONS', { fill: solid(COL.black), font: font('#FFFFFF', 12, true), alignment: { horizontal: 'left', vertical: 'middle' } }); ws.getRow(11).height = 25.5
  const head = { fill: solid(COL.slate), font: font('#FFFFFF', 9, true), alignment: center, border: box }
  merge('A12:B12', 'Location', head)
  ;['Status', 'Planned\nFinish', 'Forecast\nFinish', 'Time\nVariance', 'Plan\n%', 'Actual\n%', 'Buffer to\nHand-back'].forEach((h, i) => set(`${colLetter(3 + i)}12`, h, head))
  merge(`${G0}12:${G1}12`, 'PROGRESS  0 - 100%          coloured bar = actual %          black line = DATA DATE', head)
  ws.getRow(12).height = 31.5

  const sumFirst = rows.sumFirst
  const sumLast = rows.sumTotal - 1
  const cellsText = (i: number) => {
    const c = layouts[i]?.cells
    return c == null ? '' : `   (${c} cell${c === 1 ? '' : 's'})`
  }
  project.locations.forEach((_, i) => {
    const r = sumFirst + i
    const b = diBlock(i, m)
    const range = (c: string) => `${D}${c}${b.first}:${c}${b.last}`
    const bg = i % 2 ? COL.tint1 : '#FFFFFF'
    const st = (extra: Partial<ExcelJS.Style> = {}) => ({ fill: solid(bg), font: font(COL.black, 10), alignment: center, border: box, ...extra })
    merge(`A${r}:B${r}`, F(`${D}$B$${DI_FIRST_LOCATION_ROW + i}&"${cellsText(i)}"`), st({ font: font(COL.blue, 11, true), alignment: { horizontal: 'left', vertical: 'middle' } }))
    set(`C${r}`, F(`IF(COUNTIF(${range('O')},"!*")>0,"CHECK INPUT",IF(I${r}<0,"AT RISK",IF(F${r}>0.1,"BEHIND",IF(I${r}<2,"TIGHT",IF(F${r}<-0.1,"AHEAD","ON TIME")))))`), st({ font: font(COL.black, 10, true) }))
    set(`D${r}`, F(`MAX(${range('D')})`), st()).numFmt = DT
    set(`E${r}`, F(`${D}W${b.total}`), st({ font: font(COL.black, 10, true) })).numFmt = DT
    set(`F${r}`, F(`ROUND(${D}X${b.total},1)`), st({ font: font(COL.black, 10, true) })).numFmt = VAR_FMT
    set(`G${r}`, F(`IF(SUM(${range('E')})=0,0,SUMPRODUCT(${range('E')},${range('T')})/SUM(${range('E')}))`), st({ font: font(COL.slate, 10, true) })).numFmt = '0%'
    set(`H${r}`, F(`IF(SUM(${range('E')})=0,0,SUMPRODUCT(${range('E')},${range('S')})/SUM(${range('E')}))`), st({ font: font(COL.blue, 10, true) })).numFmt = '0%'
    set(`I${r}`, F(`ROUND((${D}$N$8-E${r})*24,1)`), st({ font: font(COL.black, 10, true) })).numFmt = '0.0" h"'
    set(`${colLetter(R.H_HOURS)}${r}`, F(`SUM(${range('E')})`))
    ws.getRow(r).height = 25.5
  })
  const tr = rows.sumTotal
  const hrs = `${colLetter(R.H_HOURS)}${sumFirst}:${colLetter(R.H_HOURS)}${sumLast}`
  const tst = (extra: Partial<ExcelJS.Style> = {}) => ({ fill: solid(COL.tint2), font: font(COL.black, 10, true), alignment: center, border: { ...box, top: { style: 'medium' as const, color: { argb: argb(COL.black) } } }, ...extra })
  merge(`A${tr}:B${tr}`, '   ALL LOCATIONS', tst({ font: font(COL.blue, 11, true), alignment: { horizontal: 'left', vertical: 'middle' } }))
  set(`C${tr}`, F(`IF(COUNTIF(C${sumFirst}:C${sumLast},"CHECK INPUT")>0,"CHECK INPUT",IF(I${tr}<0,"AT RISK",IF(F${tr}>0.1,"BEHIND",IF(I${tr}<2,"TIGHT",IF(F${tr}<-0.1,"AHEAD","ON TIME")))))`), tst())
  set(`D${tr}`, F(`MAX(D${sumFirst}:D${sumLast})`), tst()).numFmt = DT
  set(`E${tr}`, F(`MAX(E${sumFirst}:E${sumLast})`), tst()).numFmt = DT
  set(`F${tr}`, F(`ROUND(MAX(F${sumFirst}:F${sumLast}),1)`), tst()).numFmt = VAR_FMT
  set(`G${tr}`, F(`IF(SUM(${hrs})=0,0,SUMPRODUCT(G${sumFirst}:G${sumLast},${hrs})/SUM(${hrs}))`), tst({ font: font(COL.slate, 10, true) })).numFmt = '0%'
  set(`H${tr}`, F(`IF(SUM(${hrs})=0,0,SUMPRODUCT(H${sumFirst}:H${sumLast},${hrs})/SUM(${hrs}))`), tst({ font: font(COL.blue, 10, true) })).numFmt = '0%'
  set(`I${tr}`, F(`ROUND(MIN(I${sumFirst}:I${sumLast}),1)`), tst()).numFmt = '0.0" h"'
  ws.getRow(tr).height = 25.5
  for (let r = sumFirst; r <= tr; r++) for (let c = R.G0; c <= R.G1; c++) {
    const cell = ws.getCell(r, c); cell.border = r === tr ? tst().border : bottomOnly
    cell.fill = solid(r === tr ? COL.tint2 : (r - sumFirst) % 2 ? COL.tint1 : '#FFFFFF')
  }
  merge(full(rows.siteBand), '   SITE LAYOUT  -  SCHEMATIC OVERVIEW', { fill: solid(COL.black), font: font('#FFFFFF', 10, true), alignment: { horizontal: 'left', vertical: 'middle' } })
  ws.getRow(rows.siteBand).height = 19.5
  for (let r = rows.picFirst; r < rows.picFirst + rows.picRows; r++) ws.getRow(r).height = 13.5
  if (cardsPng) {
    const id = wb.addImage({ buffer: cardsPng.data as unknown as ExcelJS.Buffer, extension: 'png' })
    const w = 1380
    ws.addImage(id, { tl: { col: 0, row: rows.picFirst - 1 }, ext: { width: w, height: Math.min(288, Math.round((w * cardsPng.height) / cardsPng.width)) } })
  }

  // ---- cover conditional formats (same-sheet references only) --------------------------
  let pri = 1
  const statusFill = (ref: string, cellRef: string, withFont: boolean) =>
    ws.addConditionalFormatting({
      ref,
      rules: STATUS_RULES.map(([name, bg, fg]) => ({
        type: 'expression' as const, priority: pri++, formulae: [`${cellRef}="${name}"`],
        style: { fill: cfFill(bg), ...(withFont ? { font: { bold: true, color: { argb: argb(fg) } } } : {}) },
      })),
    })
  const bar = (ref: string, firstRow: number) => {
    const cl = gc(0)
    const rules: ExcelJS.ConditionalFormattingRule[] = [{
      type: 'expression', priority: pri++,
      formulae: [`AND($A$1<>"",${cl}$1=ROUND(MEDIAN(0,($C$1-$A$1)/($B$1-$A$1),1)*48,0))`],
      style: { border: { left: { style: 'thick', color: { argb: 'FF000000' } } } },
    }]
    for (const [name, bg] of [['AT RISK', '8E1B1F'], ['BEHIND', COL.red], ['TIGHT', COL.amber], ['AHEAD', COL.sky]] as const) {
      rules.push({ type: 'expression', priority: pri++, formulae: [`AND($H${firstRow}>0,${cl}$1<$H${firstRow}*48,$C${firstRow}="${name}")`], style: { fill: cfFill(bg) } })
    }
    rules.push({ type: 'expression', priority: pri++, formulae: [`AND($H${firstRow}>0,${cl}$1<$H${firstRow}*48,TRUE)`], style: { fill: cfFill(COL.blue) } })
    ws.addConditionalFormatting({ ref, rules })
  }
  bar(`${G0}${sumFirst}:${G1}${tr}`, sumFirst)
  statusFill(`C${sumFirst}:C${tr}`, `$C${sumFirst}`, true)
  statusFill(`I${sumFirst}:I${tr}`, `$C${sumFirst}`, true)

  // ---- one page per location -----------------------------------------------------------
  const s = project.settings
  project.locations.forEach((loc, i) => {
    const pg = rows.page(i)
    const sr = sumFirst + i
    const b = diBlock(i, m)
    const lay = layouts[i]

    merge(full(pg.header), `   ${pageTitle(s.projectName, lay, loc.name, '    -    ')}`, { fill: solid(COL.blue), font: font('#FFFFFF', 15, true), alignment: { horizontal: 'left', vertical: 'middle' } })
    ws.getRow(pg.header).height = 26
    const cellsPart = lay?.cells != null ? `${lay.cells} cell${lay.cells === 1 ? '' : 's'}        ` : ''
    merge(`A${pg.strip}:I${pg.strip}`, F(`"   ${cellsPart}ACTUAL  "&TEXT(H${sr},"0%")&"        PLANNED  "&TEXT(G${sr},"0%")&"        PLAN FINISH  "&TEXT(D${sr},"ddd dd-mmm hh:mm")`), { fill: solid(COL.grey), font: font(COL.black, 10, true), alignment: { horizontal: 'left', vertical: 'middle' } })
    merge(`${G0}${pg.strip}:${G1}${pg.strip}`, F(`C${sr}&"        FORECAST  "&TEXT(E${sr},"ddd dd-mmm hh:mm")&"        "&TEXT(ABS(F${sr}),"0.0")&IF(F${sr}>0," h LATE",IF(F${sr}<0," h EARLY"," h"))`), { fill: solid(COL.slate), font: font('#FFFFFF', 11, true), alignment: center })
    ws.getRow(pg.strip).height = 22
    // the strip's right-hand block takes the status colour
    ws.addConditionalFormatting({
      ref: `${G0}${pg.strip}:${G1}${pg.strip}`,
      rules: STATUS_RULES.map(([name, bg, fg]) => ({
        type: 'expression' as const, priority: pri++, formulae: [`$C$${sr}="${name}"`],
        style: { fill: cfFill(bg), font: { bold: true, color: { argb: argb(fg) } } },
      })),
    })

    ;['No', 'Activity', 'Status', 'Planned\nFinish', 'Forecast\nFinish', 'Time\nVariance', 'Plan\n%', 'Act.\n%', 'Buffer to\nHand-back'].forEach((h, c) => {
      ws.mergeCells(pg.h1, c + 1, pg.h2, c + 1)
      set(`${colLetter(c + 1)}${pg.h1}`, h, head)
    })
    ws.mergeCells(pg.h1, R.SPACER, pg.h2, R.SPACER); set(`J${pg.h1}`, null, { fill: solid(COL.slate) })
    for (let d = 0; d < GANTT_COLS / 24; d++) {
      const c0 = R.G0 + d * 24
      merge(`${colLetter(c0)}${pg.h1}:${colLetter(c0 + 23)}${pg.h1}`,
        F(`UPPER(TEXT($A$1+($D$1+${d * 24}*$E$1)/24,"ddd  dd-mmm  hh:mm")&"  to  "&TEXT($A$1+($D$1+${(d + 1) * 24}*$E$1)/24,"ddd  dd-mmm  hh:mm"))`),
        { fill: solid(d % 2 ? COL.black : COL.blue), font: font('#FFFFFF', 8, true), alignment: center })
    }
    for (let k = 0; k < GANTT_COLS / 6; k++) {
      const c0 = R.G0 + k * 6
      merge(`${colLetter(c0)}${pg.h2}:${colLetter(c0 + 5)}${pg.h2}`,
        F(`TEXT($A$1+($D$1+${k * 6}*$E$1)/24,"hh:mm")&" - "&TEXT($A$1+($D$1+${(k + 1) * 6}*$E$1)/24,"hh:mm")`),
        { fill: solid(k % 2 ? COL.tint2 : COL.pale), font: font(COL.black, 7, true), alignment: center })
    }
    ws.getRow(pg.h1).height = 28
    ws.getRow(pg.h2).height = 15.75

    for (let k = 1; k <= m; k++) {
      const a = pg.first + 2 * (k - 1)
      const dr = b.first + k - 1
      const bg = k % 2 ? '#FFFFFF' : COL.tint1
      ws.getRow(a).height = 11.5
      ws.getRow(a + 1).height = 11.5
      const cellSt = (extra: Partial<ExcelJS.Style> = {}): Partial<ExcelJS.Style> => ({ fill: solid(bg), font: font(COL.black, 8), alignment: center, border: box, ...extra })
      const vm = (col: number, v: ExcelJS.CellValue, st: Partial<ExcelJS.Style>, nf?: string) => {
        ws.mergeCells(a, col, a + 1, col)
        const c = set(`${colLetter(col)}${a}`, v, st)
        if (nf) c.numFmt = nf
        ws.getCell(a + 1, col).border = box
      }
      const di = (c: string) => `${D}${c}${dr}`
      vm(1, F(di('A')), cellSt({ font: font(COL.slate, 8) }))
      vm(2, F(di('B')), cellSt({ font: font(COL.black, 8, true), alignment: left }))
      vm(3, F(di('O')), cellSt({ font: font(COL.black, 8, true) }))
      vm(4, F(di('D')), cellSt(), DT)
      vm(5, F(`IF(${di('B')}="","",${di('D')}+${di('Y')}/24)`), cellSt({ font: font(COL.black, 8, true) }), DT)
      vm(6, F(`IF(${di('B')}="","",${di('Y')})`), cellSt({ font: font(COL.black, 8, true) }), VAR_FMT)
      vm(7, F(di('T')), cellSt({ font: font(COL.slate, 8, true) }), '0%')
      vm(8, F(di('S')), cellSt({ font: font(COL.blue, 8, true) }), '0%')
      vm(9, null, cellSt())
      set(`J${a}`, 'P', { font: font(COL.slate, 5), alignment: center, fill: solid(bg) })
      set(`J${a + 1}`, 'A', { font: font(COL.slate, 5), alignment: center, fill: solid(bg) })
      for (let c = R.G0; c <= R.G1; c++) for (const rr of [a, a + 1]) {
        const cell = ws.getCell(rr, c)
        cell.fill = solid(bg)
        // a light line between every Gantt column (one hour each at the default 48 h span);
        // the 6-column, midnight and cut-off lines are drawn heavier on top by conditional formats
        cell.border = { left: columnLine, ...(c === R.G1 ? { right: columnLine } : {}), ...(rr === a + 1 ? bottomOnly : {}) }
      }

      // helper columns
      const H = (col: number, r: number) => `$${colLetter(col)}${r}`
      const hset = (col: number, r: number, v: ExcelJS.CellValue) => { ws.getCell(r, col).value = v }
      // P row: planned bar
      hset(R.H_START, a, F(`IF(${di('B')}="",-999,(${di('C')}-$A$1)*24)`))
      hset(R.H_END, a, F(`IF(${di('B')}="",-999,(${di('D')}-$A$1)*24)`))
      hset(R.H_FLAG, a, 1)
      hset(R.H_FS, a, -999)
      hset(R.H_FE, a, -999)
      hset(R.H_HOURS, a, F(`${di('Y')}`)) // carried variance, for the red/teal font rules
      // A row: actual bar + forecast tail
      const r = a + 1
      hset(R.H_AS, r, F(`IF(OR(${di('Q')}="",${di('V')}=1),"",${di('Q')})`))
      hset(R.H_AF, r, F(`IF(${di('R')}="","",${di('R')})`))
      hset(R.H_PCT, r, F(di('S')))
      hset(R.H_CAR, r, F(`IF(${di('Y')}="",0,${di('Y')})`))
      hset(R.H_START, r, F(`IF(${H(R.H_AS, r)}="",-999,(${H(R.H_AS, r)}-$A$1)*24)`))
      hset(R.H_END, r, F(`IF(${H(R.H_AS, r)}="",-999,(MAX(IF(${H(R.H_AF, r)}<>"",${H(R.H_AF, r)},MAX($C$1,${H(R.H_AS, r)}+${di('E')}*${H(R.H_PCT, r)}/24)),${H(R.H_AS, r)}+0.5/24)-$A$1)*24)`))
      hset(R.H_FLAG, r, F(`IF(${H(R.H_AS, r)}="",0,IF(${H(R.H_PCT, r)}>=1,IF(${di('O')}="Completed - Delayed",3,2),IF(${H(R.H_CAR, r)}<=0.1,4,5)))`))
      hset(R.H_FE, r, F(`IF(${di('B')}="",-999,(${di('D')}+${H(R.H_CAR, r)}/24-$A$1)*24)`))
      hset(R.H_FS, r, F(`IF(OR(${di('B')}="",${H(R.H_PCT, r)}>=1,${di('V')}=1),-999,IF(${H(R.H_AS, r)}<>"",MAX(($C$1-$A$1)*24,${H(R.H_END, r)}),IF(ABS(${H(R.H_CAR, r)})>0.1,MAX(($C$1-$A$1)*24,${H(R.H_FE, r)}-${di('E')}),-999)))`))
    }

    // total row
    const t = pg.total
    ws.getRow(t).height = 22
    const tt = (extra: Partial<ExcelJS.Style> = {}): Partial<ExcelJS.Style> => ({ fill: solid(COL.tint2), font: font(COL.black, 9, true), alignment: center, border: { ...box, top: { style: 'medium', color: { argb: argb(COL.black) } } }, ...extra })
    merge(`A${t}:B${t}`, F(`"  TOTAL  -  "&${D}$B$${DI_FIRST_LOCATION_ROW + i}`), tt({ alignment: { horizontal: 'left', vertical: 'middle' } }))
    for (const [c, nf] of [['C', ''], ['D', DT], ['E', DT], ['F', VAR_FMT], ['G', '0%'], ['H', '0%'], ['I', '0.0" h"']] as const) {
      const cell = set(`${c}${t}`, F(`${c}${sr}`), tt())
      if (nf) cell.numFmt = nf
    }
    merge(`${G0}${t}:${G1}${t}`,
      F(`"TOTAL  "&TEXT(SUM(${D}E${b.first}:E${b.last}),"0.0")&" activity hours          Possession elapsed  "&TEXT(MEDIAN(0,($C$1-$A$1)*24,($B$1-$A$1)*24),"0.0")&"  of  "&TEXT(($B$1-$A$1)*24,"0.0")&" h          Report cut-off  "&TEXT($C$1,"ddd dd-mmm hh:mm")`),
      tt({ alignment: { horizontal: 'left', vertical: 'middle' }, font: font(COL.black, 8, true) }))

    // legend
    const lr = pg.legend
    ws.getRow(lr).height = 16
    set(`B${lr}`, 'Planned (baseline)', { font: font(COL.black, 8, true) })
    set(`D${lr}`, 'Black line = report cut-off', { font: font(COL.black, 8) })
    set(`G${lr}`, 'Time Variance = Forecast vs Planned Finish', { font: font(COL.black, 8) })
    ;[[COL.grey, 'Planned'], [COL.blue, 'Done on time'], [COL.red, 'Done late'], [COL.sky, 'In progress'], [COL.amber, 'Behind'], [COL.pale, 'Forecast']].forEach(([hex, text], k) => {
      const c0 = R.G0 + 6 * k + 12
      ws.getCell(lr, c0).fill = solid(hex)
      merge(`${colLetter(c0 + 1)}${lr}:${colLetter(c0 + 5)}${lr}`, text, { font: font(COL.black, 8), alignment: { horizontal: 'left', vertical: 'middle' } })
    })

    // conditional formats: lines, then bars, then colours
    const gR = `${G0}${pg.first}:${G1}${pg.total - 1}`
    const cl = gc(0)
    const ph = pg.first
    const bar = (flag: number, bg: string) => ({
      type: 'expression' as const, priority: pri++,
      formulae: [`AND($${colLetter(R.H_START)}${ph}<>-999,$${colLetter(R.H_START)}${ph}<$D$1+(${cl}$1+1)*$E$1,$${colLetter(R.H_END)}${ph}>$D$1+${cl}$1*$E$1,$${colLetter(R.H_FLAG)}${ph}=${flag})`],
      style: { fill: cfFill(bg) },
    })
    ws.addConditionalFormatting({
      ref: gR,
      rules: [
        { type: 'expression', priority: pri++, formulae: [`AND($C$1>=$A$1,$C$1<=$B$1,${cl}$1=ROUND((($C$1-$A$1)*24-$D$1)/$E$1,0))`], style: { border: { left: { style: 'thick', color: { argb: 'FF000000' } } } } },
        { type: 'expression', priority: pri++, formulae: [`${cl}$2=1`], style: { border: { left: { style: 'medium', color: { argb: argb(COL.blue) } } } } },
        { type: 'expression', priority: pri++, formulae: [`MOD(${cl}$1,6)=0`], style: { border: { left: { style: 'thin', color: { argb: 'FF7F8F96' } } } } },
        bar(1, COL.grey), bar(2, COL.blue), bar(3, COL.red), bar(4, COL.sky), bar(5, COL.amber),
        { type: 'expression', priority: pri++, formulae: [`AND($${colLetter(R.H_FS)}${ph}<>-999,$${colLetter(R.H_FS)}${ph}<$D$1+(${cl}$1+1)*$E$1,$${colLetter(R.H_FE)}${ph}>$D$1+${cl}$1*$E$1)`], style: { fill: cfFill(COL.pale) } },
        // lowest priority: a light line between every column (each hour at the default span). Drawn as a
        // conditional format, like the 6-hour lines above it that override it, so Excel always renders it.
        { type: 'expression', priority: pri++, formulae: ['TRUE'], style: { border: { left: { style: 'thin', color: { argb: 'FFC5D0D4' } } } } },
      ],
    })
    // text colours / fills of the table columns (exact statuses; "Not Started" stays neutral)
    ws.addConditionalFormatting({
      ref: `C${pg.first}:C${pg.total - 1}`,
      rules: ([
        ['COUNTIF($C{r},"!*")>0', COL.red, '#FFFFFF'], ['COUNTIF($C{r},"Completed*Delayed")>0', COL.red, '#FFFFFF'],
        ['COUNTIF($C{r},"Completed*")>0', COL.blue, '#FFFFFF'], ['COUNTIF($C{r},"*BEHIND*")>0', COL.amber, COL.black],
        ['COUNTIF($C{r},"In Progress*")>0', COL.sky, COL.black], ['COUNTIF($C{r},"NOT STARTED - LATE")>0', COL.red, '#FFFFFF'],
      ] as const).map(([fm, bg, fg]) => ({ type: 'expression' as const, priority: pri++, formulae: [fm.replace('{r}', String(ph))], style: { fill: cfFill(bg), font: { bold: true, color: { argb: argb(fg) } } } })),
    })
    const vcol = `$${colLetter(R.H_HOURS)}${ph}`
    ws.addConditionalFormatting({
      ref: `F${pg.first}:F${pg.total - 1}`,
      rules: [
        { type: 'expression', priority: pri++, formulae: [`AND(ISNUMBER(${vcol}),${vcol}>0.1)`], style: { font: { color: { argb: argb(COL.red) } } } },
        { type: 'expression', priority: pri++, formulae: [`AND(ISNUMBER(${vcol}),${vcol}<-0.1)`], style: { font: { color: { argb: argb(COL.blue) } } } },
      ],
    })
    for (const col of ['C', 'I']) statusFill(`${col}${t}`, `$C$${sr}`, true)

    // one location per printed page
    if (i === 0) ws.getRow(pg.header - 1).addPageBreak()
    if (i < n - 1) ws.getRow(pg.legend + 1).addPageBreak()
  })
  return ws
}

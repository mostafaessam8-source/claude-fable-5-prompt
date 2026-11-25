/**
 * The live sheets of the SAR shutdown tracker workbook, driven by formulas from the Project / Locations / Plan sheets:
 *   Gantt             plan bar + actual / forecast bar per activity, status, variance, SAR level
 *   Status Update     Appendix D (progress, variance, delay, forecast, outstanding, SAR level, next update)
 *   Delay Notification  Appendix B for the activity picked from the list
 *   Recovery Plan     Appendix C for the culvert picked from the list
 * Nothing here is typed by the contractor except the yellow cells of the forms.
 */
import ExcelJS from 'exceljs'
import { SAR_LOGO_RATIO, sarLogoBytes } from '../brand/logo'
import { box, cfFill, center, font, solid } from '../export/styles'
import { DOC_DEFAULTS } from '../protocol/docControl'
import { LEVELS, LEVEL_INFO } from '../protocol/status'

const TEAL = '#00778B'
const INK = '#3D3935'
const DT = 'dd-mmm-yyyy hh:mm'
const DT_SHORT = 'dd-mmm hh:mm'
export const PLAN_FIRST = 2 // first data row of the Plan sheet
export const G_FIRST = 7 // first data row of the Gantt sheet (two rows per activity)

export function colName(n: number): string {
  let s = ''
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

interface Opts { hours: number; acts: number; /** how many activity rows have data (the print area stops there) */ used: number
  /** indexes (0-based, among the activities) where a new culvert starts: the Gantt prints one culvert per page */
  starts: number[]
}

/** The Gantt column a cell of the helper block lives in. */
const helper = (hours: number) => {
  const h0 = 13 + hours + 2
  return { AS: h0, AE: h0 + 1, FS: h0 + 2, FE: h0 + 3, W: h0 + 4, AP: h0 + 5, PP: h0 + 6, VAR: h0 + 7, FEN: h0 + 8, PF: h0 + 9, OV: h0 + 10, FIRST: h0 + 11, TOK: h0 + 12, REF: h0 + 13, REL: h0 + 14, PR: h0 + 15, PCAR: h0 + 16, GAP: h0 + 17 }
}

export function addGantt(wb: ExcelJS.Workbook, { hours, acts, used, starts }: Opts) {
  const ws = wb.addWorksheet('Gantt', { views: [{ state: 'frozen', xSplit: 6, ySplit: 6, showGridLines: false }] })
  const g0 = 14 // first Gantt column (N)
  const gEnd = 13 + hours
  const H = helper(hours)
  const lastRow = G_FIRST + 2 * acts - 1
  const L = (c: number) => colName(c)
  const widths = [9, 7, 36, 10, 11, 10, 12.5, 12.5, 6, 6, 18, 6.5, 1]
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })
  for (let c = g0; c <= gEnd; c++) ws.getColumn(c).width = 2.7
  ws.getColumn(gEnd + 1).width = 1
  for (let c = H.AS; c <= H.GAP; c++) { ws.getColumn(c).width = 12; ws.getColumn(c).hidden = true }

  // ---- header block: document control, title, report time / level / buffer ----
  ws.mergeCells(1, 1, 1, 12); ws.getCell(1, 1).value = { formula: '"Function: "&Project!$B$13&"      Department: "&Project!$B$14' }; ws.getCell(1, 1).font = font(INK, 9, true)
  ws.mergeCells(2, 1, 2, 12); ws.getCell(2, 1).value = { formula: '"Document Title: "&Project!$B$15' }; ws.getCell(2, 1).font = font(INK, 9)
  ws.getRow(1).height = 20; ws.getRow(2).height = 20
  const logo = wb.addImage({ buffer: sarLogoBytes() as unknown as ExcelJS.Buffer, extension: 'png' })
  ws.addImage(logo, { tl: { col: g0 - 1 + 0.2, row: 0.1 }, ext: { width: 190, height: Math.round(190 / SAR_LOGO_RATIO) } })
  ws.mergeCells(3, 1, 3, gEnd)
  const t = ws.getCell(3, 1)
  t.value = { formula: '"SHUTDOWN TRACKER  –  PLAN vs ACTUAL / FORECAST     "&Project!$B$4' }
  t.font = font('#FFFFFF', 13, true); t.fill = solid(TEAL); t.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }; ws.getRow(3).height = 26

  const lab = (r: number, c1: number, c2: number, v: string) => { if (c2 > c1) ws.mergeCells(r, c1, r, c2); const x = ws.getCell(r, c1); x.value = v; x.font = font(TEAL, 9, true); x.alignment = { vertical: 'middle', horizontal: 'right' } }
  const val = (r: number, c1: number, c2: number, f: string, nf?: string) => { if (c2 > c1) ws.mergeCells(r, c1, r, c2); const x = ws.getCell(r, c1); x.value = { formula: f }; x.font = font(INK, 10, true); x.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }; x.fill = solid('#E6F1F4'); if (nf) x.numFmt = nf }
  lab(4, 1, 2, 'REPORT TIME')
  val(4, 3, 3, 'IF(Project!$B$12<>"",Project!$B$12,IF(NOW()<Project!$B$10,Project!$B$10,MIN(NOW(),Project!$B$11)))', 'ddd dd-mmm-yyyy hh:mm')
  const CUT = '$C$4'
  lab(4, 4, 4, 'SAR LEVEL')
  const range = (c: number) => `$${L(c)}$${G_FIRST}:$${L(c)}$${lastRow}`
  val(4, 5, 6, `IF(SUM(${range(H.W)})=0,"",IF($H$4<0,"RED",IF(MAX(${range(H.FEN)})>MAX(${range(H.PF)})+0.1/24,"ORANGE",IF(OR($H$4<2,MAX(${range(H.VAR)})>0.1),"YELLOW","GREEN"))))`)
  lab(4, 7, 7, 'BUFFER (h)')
  val(4, 8, 8, `IF(SUM(${range(H.W)})=0,"",ROUND((Project!$B$11-MAX(${range(H.FEN)}))*24,1))`, '0.0')
  lab(4, 9, 9, 'POSSESSION')
  val(4, 10, 12, 'TEXT(Project!$B$10,"dd-mmm hh:mm")&"  →  "&TEXT(Project!$B$11,"dd-mmm hh:mm")')
  ws.getRow(4).height = 22

  // ---- day band (row 5) and the hours (row 6) ----
  const heads = ['Ref', 'Culvert', 'Activity', 'Crew / Team', 'Hold point', 'Line', 'Start', 'Finish', 'Dur (h)', '%', 'Status', 'Var (h)']
  heads.forEach((h, i) => { ws.mergeCells(5, i + 1, 6, i + 1); const c = ws.getCell(5, i + 1); c.value = h; c.fill = solid('#768692'); c.font = font('#FFFFFF', 9, true); c.alignment = center; c.border = box })
  for (let d = 0; d * 24 < hours; d++) {
    const c1 = g0 + d * 24, c2 = Math.min(gEnd, c1 + 23)
    ws.mergeCells(5, c1, 5, c2)
    const x = ws.getCell(5, c1)
    x.value = { formula: `TEXT(Project!$B$10+${d},"dddd dd-mmm-yyyy")` }
    x.fill = solid(d % 2 ? INK : TEAL); x.font = font('#FFFFFF', 9, true); x.alignment = center
  }
  for (let h = 0; h < hours; h++) {
    const c = ws.getCell(6, g0 + h)
    c.value = { formula: `Project!$B$10+${h}/24` }
    c.numFmt = 'hh'; c.fill = solid(h % 2 ? '#BFE3EA' : '#E6F1F4'); c.font = font(INK, 8, true); c.alignment = center; c.border = box
  }
  ws.getRow(6).height = 18

  // ---- two rows per activity: Plan, Actual / Forecast ----
  for (let i = 0; i < acts; i++) {
    const r = PLAN_FIRST + i, g1 = G_FIRST + 2 * i, g2 = g1 + 1
    const P = (col: string) => `Plan!$${col}${r}`
    const zebra = i % 2 ? '#F2F8F9' : '#FFFFFF'
    for (let c = 1; c <= 12; c++) for (const g of [g1, g2]) { const x = ws.getCell(g, c); x.fill = solid(zebra); x.border = box; x.font = font(INK, 9) }
    for (let c = g0; c <= gEnd; c++) for (const g of [g1, g2]) { const x = ws.getCell(g, c); x.border = { left: { style: 'hair', color: { argb: 'FFD5DDE0' } }, right: { style: 'hair', color: { argb: 'FFD5DDE0' } }, bottom: g === g2 ? { style: 'thin', color: { argb: 'FFC8C9C7' } } : undefined } }
    const merge2 = (c: number, f: string, nf?: string, bold = false) => {
      ws.mergeCells(g1, c, g2, c)
      const x = ws.getCell(g1, c); x.value = { formula: f }; x.alignment = { vertical: 'middle', horizontal: c === 3 ? 'left' : 'center', wrapText: true }
      if (nf) x.numFmt = nf
      x.font = font(INK, 9, bold)
    }
    merge2(1, `IF(${P('B')}="","",${P('B')})`)
    merge2(2, `IF(${P('A')}="","",${P('A')})`)
    merge2(3, `IF(${P('C')}="","",${P('C')}&IF(${P('D')}<>""," ("&LOWER(${P('D')})&")",""))`, undefined, true)
    merge2(4, `IF(${P('E')}="","",${P('E')})`)
    merge2(5, `IF(${P('L')}="","",LEFT(${P('L')},FIND(" ",${P('L')}&" ")-1)&IF(${P('M')}="Yes","  ◆SAR",""))`)
    ws.getCell(g1, 6).value = 'Plan'; ws.getCell(g2, 6).value = 'Actual / Fcst'
    for (const g of [g1, g2]) { ws.getCell(g, 6).alignment = { horizontal: 'center', vertical: 'middle' }; ws.getCell(g, 6).font = font(g === g1 ? INK : TEAL, 8, true) }
    // plan line
    const S = `$G${g1}`, F = `$H${g1}`, D = `$I${g1}`
    ws.getCell(g1, 7).value = { formula: `IF(${P('I')}="","",${P('I')})` }
    ws.getCell(g1, 8).value = { formula: `IF(${S}="","",IF(${P('J')}<>"",${P('J')},IF(${P('K')}<>"",${S}+${P('K')}/24,"")))` }
    ws.getCell(g1, 9).value = { formula: `IF(OR(${S}="",${F}=""),"",ROUND((${F}-${S})*24,2))` }
    ws.getCell(g1, 10).value = { formula: `IF(OR(${S}="",${F}=""),"",MAX(0,MIN(1,(${CUT}-${S})/(${F}-${S}))))` }
    // actual / forecast line
    const AS = P('O'), AF = P('P'), PC = `N(${P('Q')})`
    ws.getCell(g2, 7).value = { formula: `IF(OR(${S}="",${F}=""),"",IF(${AS}<>"",${AS},MAX(${CUT},${S})))` }
    ws.getCell(g2, 8).value = { formula: `IF(OR(${S}="",${F}=""),"",${F}+$${L(H.VAR)}${g1}/24)` }
    ws.getCell(g2, 9).value = { formula: `IF(AND(${AS}<>"",${AF}<>""),ROUND((${AF}-${AS})*24,2),"")` }
    ws.getCell(g2, 10).value = { formula: `IF(OR(${S}="",${F}=""),"",IF(${AF}<>"",1,${PC}))` }
    ws.getCell(g2, 12).value = { formula: `IF($H${g2}="","",$${L(H.VAR)}${g1})` }
    ws.mergeCells(g1, 11, g2, 11)
    ws.getCell(g1, 11).value = { formula: `IF(OR(${S}="",${F}=""),"",IF(${AF}<>"",IF(${AF}<${F}-1/1440,"Completed - Ahead",IF(${AF}<=${F}+1/1440,"Completed - On Time","Completed - Delayed")),IF(${AS}<>"",IF($L${g2}<=0.1,"In Progress - On Track","In Progress - BEHIND"),IF(${CUT}<${S},"Not Started","NOT STARTED - LATE"))))` }
    ws.getCell(g1, 11).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; ws.getCell(g1, 11).font = font(INK, 8, true)
    for (const [g, c] of [[g1, 7], [g1, 8], [g2, 7], [g2, 8]] as const) { ws.getCell(g, c).numFmt = DT_SHORT; ws.getCell(g, c).alignment = { horizontal: 'center', vertical: 'middle' } }
    ws.getCell(g2, 8).font = font('#5B6770', 9)
    ws.getCell(g1, 9).numFmt = '0.0'; ws.getCell(g2, 9).numFmt = '0.0'; ws.getCell(g1, 10).numFmt = '0%'; ws.getCell(g2, 10).numFmt = '0%'; ws.getCell(g2, 12).numFmt = '+0.0;-0.0;0.0'
    for (const [g, c] of [[g1, 9], [g2, 9], [g1, 10], [g2, 10], [g2, 12]] as const) ws.getCell(g, c).alignment = { horizontal: 'center', vertical: 'middle' }
    // helpers: the actual bar, the forecast bar, and the numbers the forms add up
    ws.getCell(g2, H.AS).value = { formula: `IF(${AS}="","",${AS})` }
    ws.getCell(g2, H.AE).value = { formula: `IF(${AS}="","",IF(${AF}<>"",${AF},MAX(${CUT},${AS})))` }
    ws.getCell(g2, H.FS).value = { formula: `IF(OR(${S}="",${AF}<>""),"",MAX(${CUT},IF(${AS}<>"",${AS},${S})))` }
    ws.getCell(g2, H.FE).value = { formula: `IF($H${g2}="","",$H${g2})` }
    ws.getCell(g1, H.W).value = { formula: `IF(ISNUMBER(${D}),${D},0)` }
    ws.getCell(g1, H.AP).value = { formula: `IF(ISNUMBER($J${g2}),$J${g2},0)` }
    ws.getCell(g1, H.PP).value = { formula: `IF(ISNUMBER($J${g1}),$J${g1},0)` }
    // the slip that reaches this activity (the app's "carried" variance): its own slip, or what its predecessor passes on after the planned gap absorbs part of it
    const pr = (c: number) => `$${L(c)}${g1}`
    const ownFE = `IF(${AF}<>"",${AF},IF(${AS}<>"",MAX(${CUT},${AS})+${D}/24*(1-${PC}),MAX(${CUT},${S})+${D}/24))`
    ws.getCell(g1, H.OV).value = { formula: `IF(OR(${S}="",${F}=""),0,ROUND((${ownFE}-${F})*24,1))` }
    ws.getCell(g1, H.FIRST).value = { formula: `IF(COUNTIF(Plan!$A$${PLAN_FIRST}:$A${r},Plan!$A${r})=1,1,0)` }
    ws.getCell(g1, H.TOK).value = { formula: `IF(Plan!$H${r}="","",TRIM(LEFT(SUBSTITUTE(Plan!$H${r},";",","),FIND(",",SUBSTITUTE(Plan!$H${r},";",",")&",")-1)))` }
    const pos = `MIN(IFERROR(SEARCH("FS",${pr(H.TOK)}),99),IFERROR(SEARCH("SS",${pr(H.TOK)}),99),IFERROR(SEARCH("FF",${pr(H.TOK)}),99),IFERROR(SEARCH("SF",${pr(H.TOK)}),99))`
    ws.getCell(g1, H.REF).value = { formula: `IF(${pr(H.TOK)}="","",IF(${pos}<99,TRIM(LEFT(${pr(H.TOK)},${pos}-1)),${pr(H.TOK)}))` }
    ws.getCell(g1, H.REL).value = { formula: `IF(${pr(H.TOK)}="","FS",IF(${pos}<99,UPPER(MID(${pr(H.TOK)},${pos},2)),"FS"))` }
    ws.getCell(g1, H.PR).value = { formula: `IF(${pr(H.REF)}="",0,IFERROR(MATCH(${pr(H.REF)},Plan!$B$1:$B$${PLAN_FIRST + acts + 40},0),0))` }
    const pg = `(7+2*(${pr(H.PR)}-${PLAN_FIRST}))`
    ws.getCell(g1, H.PCAR).value = { formula: `IF(OR(${pr(H.PR)}=0,${pr(H.PR)}>=${r}),0,OFFSET(${pr(H.PR)},-2*(${r}-${pr(H.PR)}),${H.VAR - H.PR}))` }
    ws.getCell(g1, H.GAP).value = { formula: `IF(OR(${pr(H.PR)}=0,${pr(H.PR)}>=${r},${S}="",${F}=""),0,MAX(0,ROUND(IF(${pr(H.REL)}="FS",${S}-INDEX(Gantt!$H:$H,${pg}),IF(${pr(H.REL)}="SS",${S}-INDEX(Gantt!$G:$G,${pg}),IF(${pr(H.REL)}="FF",${F}-INDEX(Gantt!$H:$H,${pg}),${F}-INDEX(Gantt!$G:$G,${pg}))))*24,3)))` }
    const absd = `IF(${pr(H.PCAR)}>0,MAX(0,${pr(H.PCAR)}-${pr(H.GAP)}),${pr(H.PCAR)})`
    ws.getCell(g1, H.VAR).value = { formula: `ROUND(IF(OR(${S}="",${F}=""),0,IF(OR(${pr(H.FIRST)}=1,${AS}<>""),${pr(H.OV)},IF(${pr(H.OV)}>0,MAX(${pr(H.OV)},${absd}),${absd}))),3)` }
    ws.getCell(g1, H.FEN).value = { formula: `IF(ISNUMBER($H${g2}),$H${g2},0)` }
    ws.getCell(g1, H.PF).value = { formula: `IF(ISNUMBER(${F}),${F},0)` }
  }

  // ---- the bars: conditional formats on the hour cells (same-sheet references only) ----
  const area = `${L(g0)}${G_FIRST}:${L(gEnd)}${lastRow}`
  const cl = L(g0)
  const A = (c: number) => `$${L(c)}${G_FIRST}`
  const act = `$F${G_FIRST}="Actual / Fcst"`
  let pri = 1
  const rule = (formula: string, bg: string) => ({ type: 'expression' as const, priority: pri++, formulae: [formula], style: { fill: cfFill(bg) } })
  ws.addConditionalFormatting({
    ref: area,
    rules: [
      rule(`AND($F${G_FIRST}="Plan",ISNUMBER($G${G_FIRST}),ISNUMBER($H${G_FIRST}),${cl}$6<$H${G_FIRST},${cl}$6+1/24>$G${G_FIRST})`, '#C8C9C7'),
      rule(`AND(${act},ISNUMBER(${A(H.AS)}),${cl}$6<${A(H.AE)},${cl}$6+1/24>${A(H.AS)},ISNUMBER(SEARCH("Delayed",$K${G_FIRST})))`, '#CB2C30'),
      rule(`AND(${act},ISNUMBER(${A(H.AS)}),${cl}$6<${A(H.AE)},${cl}$6+1/24>${A(H.AS)},ISNUMBER(SEARCH("Completed",$K${G_FIRST})))`, '#00778B'),
      rule(`AND(${act},ISNUMBER(${A(H.AS)}),${cl}$6<${A(H.AE)},${cl}$6+1/24>${A(H.AS)},ISNUMBER(SEARCH("BEHIND",$K${G_FIRST})))`, '#F1B434'),
      rule(`AND(${act},ISNUMBER(${A(H.AS)}),${cl}$6<${A(H.AE)},${cl}$6+1/24>${A(H.AS)})`, '#59CBE8'),
      rule(`AND(${act},ISNUMBER(${A(H.FS)}),${cl}$6<${A(H.FE)},${cl}$6+1/24>${A(H.FS)})`, '#BFE3EA'),
    ],
  })
  ws.addConditionalFormatting({ ref: `${cl}6:${L(gEnd)}6`, rules: [{ type: 'expression', priority: pri++, formulae: [`AND(${cl}$6<=${CUT},${cl}$6+1/24>${CUT})`], style: { fill: cfFill('#000000'), font: { bold: true, color: { argb: 'FFFFFFFF' } } } }] })
  const lvl = (ref: string, cell: string) => ws.addConditionalFormatting({ ref, rules: LEVELS.map((l) => ({ type: 'expression' as const, priority: pri++, formulae: [`${cell}="${LEVEL_INFO[l].label}"`], style: { fill: cfFill(LEVEL_INFO[l].bg), font: { bold: true, color: { argb: 'FF' + LEVEL_INFO[l].fg.replace('#', '').toUpperCase() } } } })) })
  lvl('E4:F4', '$E$4')
  ws.addConditionalFormatting({ ref: `K${G_FIRST}:K${lastRow}`, rules: [
    { type: 'expression', priority: pri++, formulae: [`OR(ISNUMBER(SEARCH("Delayed",$K${G_FIRST})),ISNUMBER(SEARCH("LATE",$K${G_FIRST})),ISNUMBER(SEARCH("BEHIND",$K${G_FIRST})))`], style: { fill: cfFill('#F8D7D8'), font: { bold: true, color: { argb: 'FFCB2C30' } } } },
    { type: 'expression', priority: pri++, formulae: [`ISNUMBER(SEARCH("Completed",$K${G_FIRST}))`], style: { fill: cfFill('#D9EEF1') } },
  ] })
  // one culvert per printed page: a page break above the first row of each culvert after the first
  for (const i of starts) if (i > 0 && i < used) ws.getRow(G_FIRST + 2 * i - 1).addPageBreak()
  ws.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '5:6', printArea: `A1:${L(gEnd)}${G_FIRST + 2 * Math.max(1, used) - 1}`, horizontalCentered: true, margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.4, header: 0.1, footer: 0.2 } }
  ws.headerFooter = { oddFooter: `&L${DOC_DEFAULTS.docNo}  Rev ${DOC_DEFAULTS.rev}  ${DOC_DEFAULTS.effective}&RPage &P of &N` }
  return { H, lastRow, g0, gEnd, helperRange: range }
}

/** A form sheet: SAR header, title, label | value rows (value = a formula or a yellow input cell), footer bar. */
function form(wb: ExcelJS.Workbook, name: string, title: string, rows: { label: string; formula?: string; nf?: string; input?: boolean; height?: number }[], pre?: (ws: ExcelJS.Worksheet) => number) {
  const ws = wb.addWorksheet(name, { views: [{ showGridLines: false }] })
  ws.columns = [{ width: 36 }, { width: 74 }, { width: 3 }, { width: 10 }]
  ws.mergeCells('A1:B1'); ws.getCell('A1').value = { formula: '"Function: "&Project!$B$13&"      Department: "&Project!$B$14' }; ws.getCell('A1').font = font(INK, 9, true)
  ws.mergeCells('A2:B2'); ws.getCell('A2').value = { formula: '"Document Title: "&Project!$B$15' }; ws.getCell('A2').font = font(INK, 9)
  const logo = wb.addImage({ buffer: sarLogoBytes() as unknown as ExcelJS.Buffer, extension: 'png' })
  ws.addImage(logo, { tl: { col: 1.74, row: 0.05 }, ext: { width: 175, height: Math.round(175 / SAR_LOGO_RATIO) } })
  ws.getRow(1).height = 22; ws.getRow(2).height = 22
  ws.mergeCells('A4:B4'); ws.getCell('A4').value = title; ws.getCell('A4').font = font(TEAL, 15, true); ws.getRow(4).height = 28
  let r = pre ? pre(ws) : 6
  const rowOf: Record<string, number> = {}
  for (const row of rows) {
    const a = ws.getCell(r, 1), b = ws.getCell(r, 2)
    a.value = row.label; a.font = font(INK, 10, true); a.fill = solid('#F2F8F9'); a.border = box; a.alignment = { vertical: 'top', horizontal: 'left', wrapText: true, indent: 1 }
    b.border = box; b.alignment = { vertical: 'top', horizontal: 'left', wrapText: true, indent: 1 }
    if (row.formula) b.value = { formula: row.formula }
    if (row.nf) b.numFmt = row.nf
    b.font = font(INK, 10)
    if (row.input) b.fill = solid('#FFF2CC')
    ws.getRow(r).height = row.height ?? (row.input ? 46 : 24)
    rowOf[row.label] = r
    r++
  }
  const foot = r + 14
  ws.mergeCells(foot, 1, foot, 2)
  const f = ws.getCell(foot, 1)
  f.value = { formula: '"Document No.: "&Project!$B$16&"        Rev. No.: "&Project!$B$17&"        Effective Date: "&Project!$B$18' }
  f.font = font('#FFFFFF', 9, true); f.fill = solid(TEAL); f.alignment = { vertical: 'middle', indent: 1 }; ws.getRow(foot).height = 20
  ws.pageSetup = { orientation: 'portrait', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 1, margins: { left: 0.5, right: 0.5, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } }
  return { ws, rowOf, next: r }
}

const FREQ = (levelCell: string) => `CHOOSE(MATCH(${levelCell},{"GREEN","YELLOW","ORANGE","RED"},0),2/24,1/24,1/24,0.5/24)`
const levelBlock = (ws: ExcelJS.Worksheet, row: number) => {
  ;['Status', 'Trigger', 'Minimum requirement'].forEach((h, i) => { const c = ws.getCell(row, i === 2 ? 2 : i + 1); c.value = h; c.fill = solid(TEAL); c.font = font('#FFFFFF', 10, true); c.border = box })
  ws.getCell(row, 2).value = 'Trigger  ·  minimum requirement  ·  update frequency'
  LEVELS.forEach((l, i) => {
    const a = ws.getCell(row + 1 + i, 1), b = ws.getCell(row + 1 + i, 2)
    a.value = LEVEL_INFO[l].label; a.fill = solid(LEVEL_INFO[l].bg); a.font = font(LEVEL_INFO[l].fg, 10, true); a.border = box
    b.value = `${LEVEL_INFO[l].trigger}  ·  ${LEVEL_INFO[l].requirement}  ·  every ${LEVEL_INFO[l].everyMin >= 60 ? `${LEVEL_INFO[l].everyMin / 60} h` : `${LEVEL_INFO[l].everyMin} min`}`; b.border = box; b.font = font(INK, 10)
  })
}

export function addForms(wb: ExcelJS.Workbook, g: ReturnType<typeof addGantt>, acts: number, defaults: { ref: string; code: string }) {
  const { H, lastRow } = g
  const R = (c: number) => `Gantt!$${colName(c)}$${G_FIRST}:$${colName(c)}$${lastRow}`
  const level = 'Gantt!$E$4'
  const pctSum = (a: number, w: number) => `IF(SUM(${R(w)})=0,0,SUMPRODUCT(${R(w)},${R(a)})/SUM(${R(w)}))`
  const lvlCF = (ws: ExcelJS.Worksheet, ref: string, cell: string) => ws.addConditionalFormatting({ ref, rules: LEVELS.map((l, i) => ({ type: 'expression' as const, priority: 100 + i, formulae: [`${cell}="${LEVEL_INFO[l].label}"`], style: { fill: cfFill(LEVEL_INFO[l].bg), font: { bold: true, color: { argb: 'FF' + LEVEL_INFO[l].fg.replace('#', '').toUpperCase() } } } })) })

  // ---- Appendix D: Shutdown Status Update ----
  const d = form(wb, 'Status Update', 'Appendix D – Shutdown Status Update', [
    { label: 'Project / Location', formula: 'Project!$B$4&"  —  "&_xlfn.TEXTJOIN(", ",TRUE,Locations!$A$2:$A$60)' },
    { label: 'Shutdown Ref', formula: 'IF(Project!$B$8="","—",Project!$B$8)' },
    { label: 'Update Time', formula: 'Gantt!$C$4', nf: DT },
    { label: 'Overall Progress', formula: pctSum(H.AP, H.W), nf: '0.0%' },
    { label: 'Planned', formula: pctSum(H.PP, H.W), nf: '0.0%' },
    { label: 'Variance', formula: `(${pctSum(H.AP, H.W)}-${pctSum(H.PP, H.W)})*100`, nf: '+0.0" pts";-0.0" pts";0.0" pts"' },
    { label: 'Delay', formula: `MAX(${R(H.VAR)})`, nf: '0.0" h behind (worst activity)"' },
    { label: 'Current Forecast', formula: `MAX(${R(H.FEN)})`, nf: DT },
    { label: 'Original Handback', formula: 'Project!$B$11', nf: DT },
    { label: 'Outstanding Activities', formula: `SUMPRODUCT((${R(H.W)}>0)*(${R(H.AP)}<1))&" of "&COUNTIF(${R(H.W)},">0")&" activities not complete  ·  "&COUNTIF(${R(H.VAR)},">0.1")&" behind plan"` },
    { label: 'Recovery', input: true },
    { label: 'SAR Support', input: true },
    { label: 'Operational Impact', input: true },
    { label: 'Next Update', formula: `IF(${level}="","",Gantt!$C$4+${FREQ(level)})`, nf: DT },
    { label: 'Status: Green / Yellow / Orange / Red', formula: level },
  ])
  lvlCF(d.ws, `B${d.rowOf['Status: Green / Yellow / Orange / Red']}`, `$B$${d.rowOf['Status: Green / Yellow / Orange / Red']}`)
  levelBlock(d.ws, d.next + 1)
  d.ws.getCell(d.next + 7, 1).value = 'Note: Shutdown Status Update Template requires modification in accordance with the specific shutdown locations and approval obtained from SAR.'
  d.ws.getCell(d.next + 7, 1).font = font(INK, 9)

  // ---- Appendix B: Delay Notification (pick the activity by its Ref) ----
  const sel = (ws: ExcelJS.Worksheet, label: string, list: string) => {
    ws.getCell(6, 1).value = label; ws.getCell(6, 1).font = font(TEAL, 10, true); ws.getCell(6, 1).fill = solid('#F2F8F9'); ws.getCell(6, 1).border = box
    const c = ws.getCell(6, 2); c.fill = solid('#FFF2CC'); c.border = box; c.font = font(INK, 11, true); c.dataValidation = { type: 'list', allowBlank: false, formulae: [list] }
    ws.getRow(6).height = 24
    return 8
  }
  const bSel = '$B$6'
  const m = `MATCH(${bSel},Plan!$B$1:$B$${PLAN_FIRST + acts + 40},0)`
  const g1 = `7+2*(${m}-${PLAN_FIRST})`
  const gv = (col: string, off: number) => `INDEX(Gantt!$${col}:$${col},${g1}+${off})`
  const b = form(wb, 'Delay Notification', 'Appendix B – Delay Notification Template', [
    { label: 'Project / Location', formula: `IFERROR(Project!$B$4&"  —  Culvert "&INDEX(Plan!$A:$A,${m}),"select the activity Ref above")` },
    { label: 'Shutdown Ref', formula: 'IF(Project!$B$8="","—",Project!$B$8)' },
    { label: 'Date / Time', formula: 'Gantt!$C$4', nf: DT },
    { label: 'Activity', formula: `IFERROR(${gv('C', 0)}&IF(${gv('E', 0)}<>"","   ["&${gv('E', 0)}&"]",""),"")` },
    { label: 'Delay', formula: `IFERROR(IF(${gv('L', 1)}>0.1,TEXT(${gv('L', 1)},"0.0")&" h behind plan (planned finish "&TEXT(${gv('H', 0)},"dd-mmm hh:mm")&", forecast "&TEXT(${gv('H', 1)},"dd-mmm hh:mm")&")","no delay at the moment"),"")` },
    { label: 'Cause', formula: `IFERROR(IF(INDEX(Plan!$N:$N,${m})="","— (pick it in the Plan sheet, column Delay cause)",INDEX(Plan!$N:$N,${m})),"")` },
    { label: 'Impact / Milestone', input: true },
    { label: 'Original Handback', formula: 'Project!$B$11', nf: DT },
    // the forecast finish of the culvert (when its work will really be done), not of this one activity
    { label: 'Current Forecast', formula: `IFERROR(_xlfn.MAXIFS(${R(H.FEN)},${R(2)},INDEX(Plan!$A:$A,${m})),"")`, nf: DT },
    { label: 'Recovery Action', input: true },
    { label: 'Additional Resources', input: true },
    { label: 'SAR Support Required', input: true, height: 58 },
    { label: 'Next Update', formula: `IF(${level}="","",Gantt!$C$4+${FREQ(level)})`, nf: DT },
    { label: 'Contractor Responsible Manager', formula: 'IF(Project!$B$9="","—",Project!$B$9)' },
  ], (ws) => sel(ws, 'Activity Ref (select)', `Plan!$B$${PLAN_FIRST}:$B$${PLAN_FIRST + acts + 40}`))
  b.ws.getCell('B6').value = defaults.ref

  // ---- Appendix C: Recovery Plan (pick the culvert) ----
  const cs = '$B$6'
  const mx = (col: number, fn: string) => `IFERROR(_xlfn.${fn}(${R(col)},${R(2)},${cs}),0)`
  const buf = `ROUND((Project!$B$11-${mx(H.FEN, 'MAXIFS')})*24,1)`
  const known = `COUNTIF(Locations!$A$2:$A$60,${cs})>0`
  const levelC = `IF(NOT(${known}),"",IF(${buf}<0,"RED",IF(${mx(H.FEN, 'MAXIFS')}>${mx(H.PF, 'MAXIFS')}+0.1/24,"ORANGE",IF(OR(${buf}<2,${mx(H.VAR, 'MAXIFS')}>0.1),"YELLOW","GREEN"))))`
  const c = form(wb, 'Recovery Plan', 'Appendix C – Recovery Plan Template', [
    { label: 'Project / Location', formula: `Project!$B$4&"  —  Culvert "&${cs}&IFERROR("  ("&INDEX(Locations!$B$2:$B$60,MATCH(${cs},Locations!$A$2:$A$60,0))&")","")` },
    { label: 'Current Status', formula: levelC },
    { label: 'Buffer to hand-back', formula: `IF(${known},${buf},"")`, nf: '0.0" h"' },
    { label: 'Delay / Root Cause', formula: `COUNTIFS(${R(2)},${cs},${R(H.VAR)},">0.1")&" activity(ies) behind plan; worst "&TEXT(${mx(H.VAR, 'MAXIFS')},"0.0")&" h"&IFERROR(" — "&INDEX(Plan!$N:$N,MATCH(1,INDEX((Plan!$A$2:$A$${PLAN_FIRST + acts + 40}=${cs})*(Plan!$N$2:$N$${PLAN_FIRST + acts + 40}<>""),0),0)+1),"")` },
    { label: 'Remaining Activities', formula: `COUNTIFS(${R(2)},${cs},${R(H.W)},">0",${R(H.AP)},"<1")&" activities not complete"` },
    { label: 'Critical Path', input: true },
    { label: 'Recovery Measures', input: true, height: 58 },
    { label: 'Additional Resources', input: true },
    { label: 'Revised Forecast', formula: `IF(${known},${mx(H.FEN, 'MAXIFS')},"")`, nf: DT },
    { label: 'SAR Support Required', input: true },
    { label: 'Update Frequency', formula: `IF($B$7="","",CHOOSE(MATCH($B$7,{"GREEN","YELLOW","ORANGE","RED"},0),"every 2 hours","every 1 hour","every 1 hour","every 30 minutes"))` },
    { label: 'Next Update', formula: `IF($B$7="","",Gantt!$C$4+${FREQ('$B$7')})`, nf: DT },
    { label: 'Contractor Responsible Manager', formula: 'IF(Project!$B$9="","—",Project!$B$9)' },
  ], (ws) => sel(ws, 'Culvert (select)', 'Locations!$A$2:$A$60'))
  c.ws.getCell('B6').value = defaults.code
  // the level sits in the 'Current Status' row, which is row 8 here: mirror it in B7 for the frequency formulas
  c.ws.getCell('B7').value = { formula: `B${c.rowOf['Current Status']}` }; c.ws.getCell('B7').font = font('#FFFFFF', 1)
  lvlCF(c.ws, `B${c.rowOf['Current Status']}`, `$B$${c.rowOf['Current Status']}`)
}

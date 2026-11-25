/**
 * The first sheet of the SAR tracker workbook: a one-page dashboard. The whole project on top (SAR level, progress, forecast,
 * buffer), then one row per culvert with its information (chainage, cells, length, lines), plan / forecast dates, buffer,
 * planned vs actual progress with bars and its SAR level, and the site layout cards under the table.
 */
import ExcelJS from 'exceljs'
import { SAR_LOGO_RATIO, sarLogoBytes } from '../brand/logo'
import type { CardsImage } from '../export/siteLayouts'
import { box, cfFill, center, font, solid } from '../export/styles'
import type { SiteLayout } from '../layout/parse'
import { DOC_DEFAULTS } from '../protocol/docControl'
import { LEVELS, LEVEL_INFO } from '../protocol/status'
import { colName, G_FIRST } from './trackerSheets'

const TEAL = '#00778B'
const INK = '#3D3935'
const DT = 'ddd dd-mmm hh:mm'

export function addDashboard(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, g: { H: Record<string, number>; lastRow: number }, culverts: SiteLayout[], cards?: (CardsImage | undefined)[]) {
  const { H, lastRow } = g
  ws.views = [{ showGridLines: false }]
  const R = (c: number) => `Gantt!$${colName(c)}$${G_FIRST}:$${colName(c)}$${lastRow}`
  const cb = R(2), w = R(H.W), pp = R(H.PP), ap = R(H.AP), fen = R(H.FEN), pf = R(H.PF), vr = R(H.VAR)
  const widths = [10, 17, 11, 9, 15, 15, 15, 9, 9, 9, 9, 11, 20, 20, 21]
  widths.forEach((x, i) => { ws.getColumn(i + 1).width = x })
  const N = widths.length

  // document header, title
  ws.mergeCells(1, 1, 1, 9); ws.getCell(1, 1).value = { formula: '"Function: "&Project!$B$13&"      Department: "&Project!$B$14' }; ws.getCell(1, 1).font = font(INK, 9, true)
  ws.mergeCells(2, 1, 2, 9); ws.getCell(2, 1).value = { formula: '"Document Title: "&Project!$B$15' }; ws.getCell(2, 1).font = font(INK, 9)
  ws.getRow(1).height = 22; ws.getRow(2).height = 22
  const logo = wb.addImage({ buffer: sarLogoBytes() as unknown as ExcelJS.Buffer, extension: 'png' })
  ws.addImage(logo, { tl: { col: N - 3.2, row: 0.1 }, ext: { width: 200, height: Math.round(200 / SAR_LOGO_RATIO) } })
  ws.mergeCells(3, 1, 3, N)
  const t = ws.getCell(3, 1)
  t.value = { formula: '"CULVERT PROGRESS SUMMARY   –   "&Project!$B$4&"   ·   "&TEXT(Project!$B$10,"dd-mmm-yyyy")&"  →  "&TEXT(Project!$B$11,"dd-mmm-yyyy")' }
  t.font = font('#FFFFFF', 14, true); t.fill = solid(TEAL); t.alignment = { vertical: 'middle', indent: 1 }; ws.getRow(3).height = 28

  // the whole project
  const strip: [string, string, string?][] = [
    ['REPORT TIME', 'Gantt!$C$4', 'ddd dd-mmm hh:mm'],
    ['SAR LEVEL', 'Gantt!$E$4'],
    ['PLANNED', `IF(SUM(${w})=0,"",SUMPRODUCT(${w},${pp})/SUM(${w}))`, '0.0%'],
    ['ACTUAL', `IF(SUM(${w})=0,"",SUMPRODUCT(${w},${ap})/SUM(${w}))`, '0.0%'],
    ['FORECAST FINISH', `IF(SUM(${w})=0,"",MAX(${fen}))`, DT],
    ['HAND-BACK', 'Project!$B$11', DT],
    ['BUFFER (h)', 'Gantt!$H$4', '0.0'],
  ]
  const spans = [[1, 2], [3, 4], [5, 5], [6, 6], [7, 8], [9, 10], [11, 12]]
  strip.forEach(([label, f, nf], i) => {
    const [c1, c2] = spans[i]
    if (c2 > c1) { ws.mergeCells(5, c1, 5, c2); ws.mergeCells(6, c1, 6, c2) }
    const a = ws.getCell(5, c1), v = ws.getCell(6, c1)
    a.value = label; a.font = font('#FFFFFF', 8, true); a.fill = solid('#768692'); a.alignment = center
    v.value = { formula: f }; v.font = font(INK, 12, true); v.fill = solid('#E6F1F4'); v.alignment = center
    if (nf) v.numFmt = nf
    for (let c = c1; c <= c2; c++) { ws.getCell(5, c).fill = solid('#768692'); ws.getCell(6, c).fill = solid('#E6F1F4'); ws.getCell(5, c).border = box; ws.getCell(6, c).border = box }
  })
  ws.getRow(6).height = 28

  // the culverts
  const head = ['Culvert', 'Chainage', 'Cells', 'Length', 'Plan start', 'Plan finish', 'Forecast finish', 'Buffer (h)', 'Planned %', 'Actual %', 'Var (pts)', 'SAR level', 'Planned', 'Actual', 'Site layout']
  const HR = 8
  head.forEach((h, i) => { const c = ws.getCell(HR, i + 1); c.value = h; c.fill = solid(TEAL); c.font = font('#FFFFFF', 10, true); c.alignment = center; c.border = box })
  ws.getRow(HR).height = 24
  const first = HR + 1
  const n = Math.max(1, culverts.length)
  for (let i = 0; i < n; i++) {
    const r = first + i, k = 2 + i // the Locations row of this culvert
    const zebra = i % 2 ? '#F2F8F9' : '#FFFFFF'
    const code = `$A${r}`
    const wsum = `SUMPRODUCT((${cb}=${code})*${w})`
    const mx = (c: string, fn: string) => `IFERROR(_xlfn.${fn}(${c},${cb},${code}),0)`
    const buf = `ROUND((Project!$B$11-${mx(fen, 'MAXIFS')})*24,1)`
    const cells: [number, string, string?][] = [
      [1, `IF(Locations!$A$${k}="","",Locations!$A$${k})`],
      [2, `IF(Locations!$A$${k}="","",Locations!$B$${k})`],
      [3, `IF(Locations!$D$${k}="","",Locations!$D$${k}&" "&IF(Locations!$C$${k}="pipe","PIPE","CELL")&IF(Locations!$D$${k}=1,"","S"))`],
      [4, `IF(Locations!$E$${k}="","",Locations!$E$${k})`],
      [5, `IF(${wsum}=0,"",IFERROR(_xlfn.MINIFS(Gantt!$G$${G_FIRST}:$G$${lastRow},${cb},${code}),""))`, DT],
      [6, `IF(${wsum}=0,"",${mx(pf, 'MAXIFS')})`, DT],
      [7, `IF(${wsum}=0,"",${mx(fen, 'MAXIFS')})`, DT],
      [8, `IF(${wsum}=0,"",${buf})`, '0.0'],
      [9, `IF(${wsum}=0,"",SUMPRODUCT((${cb}=${code})*${w}*${pp})/${wsum})`, '0%'],
      [10, `IF(${wsum}=0,"",SUMPRODUCT((${cb}=${code})*${w}*${ap})/${wsum})`, '0%'],
      [11, `IF(${wsum}=0,"",(J${r}-I${r})*100)`, '+0;-0;0'],
      [12, `IF(${wsum}=0,"",IF(${buf}<0,"RED",IF(Gantt!$C$4<=Project!$B$10,"GREEN",IF(${mx(fen, 'MAXIFS')}>${mx(pf, 'MAXIFS')}+0.1/24,"ORANGE",IF(OR(${buf}<2,${mx(vr, 'MAXIFS')}>0.1),"YELLOW","GREEN")))))`],
      [13, `IF(I${r}="","",I${r})`, '0%'],
      [14, `IF(J${r}="","",J${r})`, '0%'],
    ]
    cells.forEach(([c, f, nf]) => {
      const x = ws.getCell(r, c)
      x.value = { formula: f }; x.fill = solid(zebra); x.border = box
      x.font = font(c === 1 ? TEAL : INK, c === 1 ? 11 : 10, c === 1 || c === 12 || c === 10)
      x.alignment = { vertical: 'middle', horizontal: c === 2 ? 'left' : 'center', indent: c === 2 ? 1 : 0 }
      if (nf) x.numFmt = nf
    })
    ws.getRow(r).height = 86
    const card = cards?.[i]
    ws.getCell(r, 15).fill = solid(zebra); ws.getCell(r, 15).border = box
    if (card) {
      const id = wb.addImage({ buffer: card.data as unknown as ExcelJS.Buffer, extension: 'png' })
      ws.addImage(id, { tl: { col: 14.05, row: r - 1 + 0.07 }, ext: { width: 125, height: Math.round((125 * card.height) / card.width) } })
    }
  }
  const lastCulvert = first + n - 1
  const lvl = LEVELS.map((l, i) => ({ type: 'expression' as const, priority: 1 + i, formulae: [`$L${first}="${LEVEL_INFO[l].label}"`], style: { fill: cfFill(LEVEL_INFO[l].bg), font: { bold: true, color: { argb: 'FF' + LEVEL_INFO[l].fg.replace('#', '').toUpperCase() } } } }))
  ws.addConditionalFormatting({ ref: `L${first}:L${lastCulvert}`, rules: lvl })
  ws.addConditionalFormatting({ ref: 'B6:D6', rules: LEVELS.map((l, i) => ({ type: 'expression' as const, priority: 10 + i, formulae: [`$C$6="${LEVEL_INFO[l].label}"`], style: { fill: cfFill(LEVEL_INFO[l].bg), font: { bold: true, color: { argb: 'FF' + LEVEL_INFO[l].fg.replace('#', '').toUpperCase() } } } })) })
  // planned (grey) and actual (teal) progress as bars inside the cells
  for (const [col, color] of [['M', 'FFC8C9C7'], ['N', 'FF00778B']] as const) {
    ws.addConditionalFormatting({ ref: `${col}${first}:${col}${lastCulvert}`, rules: [{ type: 'dataBar', priority: 30, gradient: false, minLength: 0, maxLength: 100, cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }], color: { argb: color } } as never] })
  }
  ws.addConditionalFormatting({ ref: `H${first}:H${lastCulvert}`, rules: [{ type: 'expression', priority: 20, formulae: [`AND(ISNUMBER($H${first}),$H${first}<0)`], style: { fill: cfFill('#CB2C30'), font: { bold: true, color: { argb: 'FFFFFFFF' } } } }, { type: 'expression', priority: 21, formulae: [`AND(ISNUMBER($H${first}),$H${first}<2)`], style: { fill: cfFill('#FBE5A8') } }] })

  const lay = HR + n + 1
  const footRow = lay + 1
  ws.mergeCells(footRow, 1, footRow, N)
  const f = ws.getCell(footRow, 1)
  f.value = { formula: '"Document No.: "&Project!$B$16&"        Rev. No.: "&Project!$B$17&"        Effective Date: "&Project!$B$18' }
  f.font = font('#FFFFFF', 9, true); f.fill = solid(TEAL); f.alignment = { vertical: 'middle', indent: 1 }; ws.getRow(footRow).height = 20
  ws.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 1, horizontalCentered: true, margins: { left: 0.3, right: 0.3, top: 0.3, bottom: 0.3, header: 0.1, footer: 0.1 } }
  void DOC_DEFAULTS
}

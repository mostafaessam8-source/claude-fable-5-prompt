import type ExcelJS from 'exceljs'
import { unit, type SiteLayout } from '../layout/parse'
import type { Project } from '../model/types'
import { center, COL, font, left, box, solid } from './styles'

export interface CardsImage { data: Uint8Array; width: number; height: number }

export function writeSiteLayouts(wb: ExcelJS.Workbook, project: Project, layouts: SiteLayout[], img?: CardsImage) {
  const ws = wb.addWorksheet('Site Layouts', {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.3, bottom: 0.3, header: 0.5, footer: 0.5 } },
  })
  ws.getColumn(1).width = 2.5
  for (let c = 2; c <= 14; c++) ws.getColumn(c).width = 11

  const merge = (range: string, v: ExcelJS.CellValue, st: Partial<ExcelJS.Style>) => {
    ws.mergeCells(range)
    const c = ws.getCell(range.split(':')[0])
    c.value = v
    Object.assign(c, st)
  }
  merge('A2:N2', `${project.settings.projectName}  –  SITE LAYOUTS`, { fill: solid(COL.blue), font: font('#FFFFFF', 13, true), alignment: { horizontal: 'left', vertical: 'middle' } })
  ws.getRow(2).height = 26
  const codes = layouts.map((l) => l.code).filter(Boolean).join(' · ')
  merge('A3:N3', codes ? `CULVERTS ${codes}` : 'CULVERTS', { fill: solid(COL.tint2), font: font(COL.blue, 11, true), alignment: { horizontal: 'left', vertical: 'middle' } })

  const head = { fill: solid(COL.slate), font: font('#FFFFFF', 9, true), alignment: center, border: box }
  const body = (i: number, extra: Partial<ExcelJS.Style> = {}) => ({ fill: solid(i % 2 ? COL.tint1 : '#FFFFFF'), font: font(COL.black, 10), alignment: center, border: box, ...extra })
  const cols: [string, string][] = [['B:C', 'Code'], ['D:E', 'Chainage'], ['F:F', 'Culvert'], ['G:J', 'Lines'], ['K:L', 'OTMP'], ['M:M', 'Station'], ['N:N', 'Length']]
  const row = (r: number, vals: (string | number)[], st: (i: number) => Partial<ExcelJS.Style>) =>
    cols.forEach(([span, _], k) => {
      const [a, b] = span.split(':')
      if (a !== b) ws.mergeCells(`${a}${r}:${b}${r}`)
      const c = ws.getCell(`${a}${r}`)
      c.value = vals[k] as ExcelJS.CellValue
      Object.assign(c, st(k))
    })
  row(5, cols.map(([, h]) => h), () => head)
  layouts.forEach((l, i) => row(6 + i, [l.code, l.chainage, l.cells == null ? '' : `${l.cells} ${unit(l.kind, l.cells)}`, l.lines, l.otmp, l.station, l.length ?? ''], (k) => body(i, k === 3 ? { alignment: left } : {})))

  const imgRow = 6 + layouts.length + 1
  if (img) {
    const id = wb.addImage({ buffer: img.data as unknown as ExcelJS.Buffer, extension: 'png' })
    const w = 1000
    ws.addImage(id, { tl: { col: 1, row: imgRow }, ext: { width: w, height: Math.round((w * img.height) / img.width) } })
  }
  return ws
}

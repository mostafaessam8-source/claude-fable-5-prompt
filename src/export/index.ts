import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import type { SiteLayout } from '../layout/parse'
import type { Project } from '../model/types'
import { writeDataInput } from './dataInput'
import { writeReport } from './report'
import { writeSiteLayouts, type CardsImage } from './siteLayouts'

export interface ExportOptions {
  /** PNG of the five layout cards (rasterised in the browser). Optional: omitted in tests. */
  cards?: CardsImage
}

/** Report, Site Layouts and Data Input — the same three sheets and layout as the tracker. */
export async function buildWorkbook(source: Project, layouts: SiteLayout[], opts: ExportOptions = {}) {
  // no empty slots at the end of every block: the blocks are as long as the longest location's last activity number
  const rows = source.locations.reduce((m, l) => l.activities.reduce((n, a) => Math.max(n, a.no), m), 1)
  const project = rows < source.activityRowsPerLocation ? { ...source, activityRowsPerLocation: rows } : source
  const wb = new ExcelJS.Workbook()
  wb.creator = project.settings.preparedBy || 'SAR Possession Tracker'
  wb.created = new Date()
  // Excel recalculates every formula on open (nothing is cached), so the figures are always live.
  wb.calcProperties = { fullCalcOnLoad: true }
  writeReport(wb, project, layouts, opts.cards)
  writeSiteLayouts(wb, project, layouts, opts.cards)
  await writeDataInput(wb, project, layouts)
  wb.views = [{ x: 0, y: 0, width: 28800, height: 18000, activeTab: 0, firstSheet: 0, visibility: 'visible' }]
  return wb
}

/**
 * exceljs writes a literal line break inside the validation prompt attributes, which an XML
 * parser (Excel's included) normalises to a space. Escape them as &#10; so prompts keep their lines.
 */
export async function escapeAttributeNewlines(bytes: Uint8Array): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(bytes)
  for (const name of Object.keys(zip.files)) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) continue
    const xml = await zip.file(name)!.async('string')
    const fixed = xml.replace(/<dataValidation\b[^>]*>/g, (tag) => tag.replace(/\r?\n/g, '&#10;'))
    if (fixed !== xml) zip.file(name, fixed)
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

export async function exportXlsx(project: Project, layouts: SiteLayout[], opts: ExportOptions = {}): Promise<Uint8Array> {
  const wb = await buildWorkbook(project, layouts, opts)
  return escapeAttributeNewlines(new Uint8Array(await wb.xlsx.writeBuffer()))
}

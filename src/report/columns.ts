import { GANTT_COLS } from './gantt'

/** Default widths (px) of the report table's columns; each can be dragged wider or narrower (like an Excel column) and is saved with the project. */
export const DEFAULT_COLS = [22, 128, 62, 34, 36, 72, 72, 56, 30, 30, 106]
export const COL_NAMES = ['No', 'Activity', 'Status', 'Dur BL', 'Dur Actual', 'Planned Finish', 'Forecast Finish', 'Time Variance', 'Plan %', 'Act. %', 'Remarks']
/** px inside the A4 page (1123 wide): the table and the Gantt share it. */
export const PAGE_INNER = 1110
/** The Gantt never gets narrower than this per column: a wider table makes the PAGE wider instead (like a sheet that grows). */
export const GC_PREF = 8.5
export const MIN_COL = 18
export const MAX_COL = 700

/** Width (px) of a location page: A4 landscape, or wider when the columns were widened beyond what leaves the Gantt its width. */
/** The saved column widths; widths saved while the Buffer column still existed (12) lose that column's entry. */
export function tableColsOf(c: number[] | undefined | null): number[] {
  if (c && c.length === DEFAULT_COLS.length + 1) return c.filter((_, i) => i !== 10)
  return c && c.length === DEFAULT_COLS.length ? c : DEFAULT_COLS
}
export function pageWidth(tableCols: number[] | undefined, dateRange = false): number {
  const cs = tableColsOf(tableCols)
  const w = cs.reduce((a, b) => a + b, 0) + (dateRange ? cs[5] + cs[6] : 0) // start + finish columns: Planned and Forecast are two columns each
  return 1123 + Math.max(0, Math.ceil(w + 12 + GANTT_COLS * GC_PREF - PAGE_INNER))
}

/** Characters that fit the Remarks column in two lines; longer remarks are also written out under the table. */
export const LONG_REMARK = 52
/** The rows' share of the page height (the logo strip and the header bars take the rest). */
export const AVAIL_ROWS_H = 526
export const MIN_ROW_H = 12
export const MAX_ROW_H = 220
export const PAGE_H0 = 794

/**
 * Where every activity's row sits on a location page: the automatic height fits all rows into the A4 page; a row the user
 * dragged keeps its own height, and when the rows together outgrow the page the PAGE grows taller (like a sheet that grows).
 */
export function rowLayout(acts: { no?: number; remarks: string; rowH?: number }[]) {
  const n = acts.length
  const long = acts.filter((a) => a.remarks.length > LONG_REMARK)
  const chars = long.reduce((t, a) => t + String(a.no ?? '').length + a.remarks.length + 6, 0)
  const remarksH = long.length ? 14 + Math.ceil(chars / 200) * 11 : 0
  const rh = Math.max(8, Math.min(18, Math.floor((AVAIL_ROWS_H - remarksH) / Math.max(1, 2 * n))))
  const heights = acts.map((a) => (a.rowH ? Math.min(MAX_ROW_H, Math.max(MIN_ROW_H, a.rowH)) : 2 * rh))
  const tops: number[] = []
  let y = 0
  for (const h of heights) { tops.push(y); y += h }
  const extra = Math.max(0, y - 2 * rh * n)
  return { rh, heights, tops, bodyH: y, remarksH, extra, pageH: PAGE_H0 + extra, long }
}

/** The cover's summary table: default widths (px) of its first 8 columns; the progress column takes the rest. */
export const DEFAULT_SUM_COLS = [190, 84, 92, 92, 96, 44, 44, 76]
export const SUM_COL_NAMES = ['Location', 'Status', 'Planned Finish', 'Forecast Finish', 'Time Variance', 'Plan %', 'Actual %', 'Buffer to Hand-back', 'Progress']
export const SUM_MIN_COL = 24, SUM_MAX_COL = 420, SUM_MIN_ROW = 14, SUM_MAX_ROW = 200
const SUM_PROGRESS_MIN = 160
export function summaryCols(c: number[] | undefined): number[] { return c && c.length === DEFAULT_SUM_COLS.length ? c : DEFAULT_SUM_COLS }
/** Width of the cover page: as wide as the location pages (so all pages line up), or wider when the summary columns were widened. */
export function coverWidth(c: number[] | undefined, tableCols?: number[], dateRange = false): number {
  return Math.max(pageWidth(tableCols, dateRange), Math.ceil(summaryCols(c).reduce((a, b) => a + b, 0) + SUM_PROGRESS_MIN + 24))
}
/** Height of the cover page: A4 landscape, or taller by what the dragged summary rows add. */
export function coverHeight(rows: (number | null)[] | undefined): number {
  return 794 + Math.ceil((rows ?? []).reduce<number>((a, h) => a + (h ? Math.max(0, h - 22) : 0), 0))
}

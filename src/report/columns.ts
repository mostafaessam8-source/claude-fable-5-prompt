import { GANTT_COLS } from './gantt'

/** Default widths (px) of the report table's columns; each can be dragged wider or narrower (like an Excel column) and is saved with the project. */
export const DEFAULT_COLS = [22, 128, 62, 34, 36, 72, 72, 56, 30, 30, 40, 106]
export const COL_NAMES = ['No', 'Activity', 'Status', 'Dur BL', 'Dur Actual', 'Planned Finish', 'Forecast Finish', 'Time Variance', 'Plan %', 'Act. %', 'Buffer to Hand-back', 'Remarks']
/** px inside the A4 page (1123 wide): the table and the Gantt share it. */
export const PAGE_INNER = 1110
/** The Gantt never gets narrower than this per column: a wider table makes the PAGE wider instead (like a sheet that grows). */
export const GC_PREF = 8.5
export const MIN_COL = 18
export const MAX_COL = 700

/** Width (px) of a location page: A4 landscape, or wider when the columns were widened beyond what leaves the Gantt its width. */
export function pageWidth(tableCols: number[] | undefined): number {
  const w = (tableCols && tableCols.length === DEFAULT_COLS.length ? tableCols : DEFAULT_COLS).reduce((a, b) => a + b, 0)
  return 1123 + Math.max(0, Math.ceil(w + 12 + GANTT_COLS * GC_PREF - PAGE_INNER))
}

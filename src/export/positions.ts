/** Row/column maths shared by the writers and the tests. */

export const DI_FIRST_LOCATION_ROW = 15
export const DI_BLOCK0 = 25
export const GANTT_COLS = 48

export function diBlock(i: number, m: number) {
  const band = DI_BLOCK0 + i * (m + 4)
  return { band, header: band + 1, first: band + 2, last: band + m + 1, total: band + m + 2 }
}

export function colLetter(n: number): string {
  let s = ''
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s
  return s
}

/** Report sheet: A..I table, J = P/A letters, K..BF = 48 Gantt columns, BG..BP hidden helpers. */
export const R = {
  TABLE_COLS: 9,
  SPACER: 10, // J
  G0: 11, // K — first Gantt column
  G1: 58, // BF — last Gantt column
  H_HOURS: 59, // BG: total hours (cover rows) / carried variance (P rows)
  H_START: 60, // BH
  H_END: 61, // BI
  H_FLAG: 62, // BJ
  H_AS: 63, // BK actual start
  H_AF: 64, // BL actual finish
  H_PCT: 65, // BM
  H_CAR: 66, // BN
  H_FS: 67, // BO forecast start
  H_FE: 68, // BP forecast end
}

export function reportRows(n: number, m: number) {
  const sumFirst = 13
  const sumTotal = 13 + n
  const siteBand = 15 + n
  const picFirst = siteBand + 1
  const picRows = 16
  const page0 = siteBand + 1 + picRows
  const stride = 2 * m + 8 // + the remarks row under each page's legend
  const page = (i: number) => {
    const p = page0 + i * stride
    return { header: p, strip: p + 1, h1: p + 2, h2: p + 3, first: p + 4, total: p + 4 + 2 * m, legend: p + 5 + 2 * m, remarks: p + 6 + 2 * m }
  }
  return { sumFirst, sumTotal, siteBand, picFirst, picRows, page0, stride, page, last: page(n - 1).remarks }
}

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

/** Report sheet: A..I table, J = Dur BL, K = Dur Actual, L = remarks, M = P/A letters, N..BI = 48 Gantt columns, BJ..BS hidden helpers. */
export const R = {
  TABLE_COLS: 9,
  DUR_BL: 10, // J
  DUR_ACT: 11, // K
  REMARKS: 12, // L
  SPACER: 13, // M
  G0: 14, // N — first Gantt column
  G1: 61, // BI — last Gantt column
  H_HOURS: 62, // BJ: total hours (cover rows) / carried variance (P rows)
  H_START: 63, // BK
  H_END: 64, // BL
  H_FLAG: 65, // BM
  H_AS: 66, // BN actual start
  H_AF: 67, // BO actual finish
  H_PCT: 68, // BP
  H_CAR: 69, // BQ
  H_FS: 70, // BR forecast start
  H_FE: 71, // BS forecast end
}

export function reportRows(n: number, m: number) {
  const sumFirst = 13
  const sumTotal = 13 + n
  const siteBand = 15 + n
  const picFirst = siteBand + 1
  const picRows = 16
  const page0 = siteBand + 1 + picRows
  const stride = 2 * m + 9 // + the logo row above each page's header and the remarks row under its legend
  const page = (i: number) => {
    const p = page0 + i * stride
    return { logo: p, header: p + 1, strip: p + 2, h1: p + 3, h2: p + 4, first: p + 5, total: p + 5 + 2 * m, legend: p + 6 + 2 * m, remarks: p + 7 + 2 * m }
  }
  return { sumFirst, sumTotal, siteBand, picFirst, picRows, page0, stride, page, last: page(n - 1).remarks }
}

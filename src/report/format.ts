/** Display formatting. Datetimes are floating wall-clock times: always UTC accessors. */
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const p2 = (n: number) => String(n).padStart(2, '0')

export const hhmm = (d: Date) => `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`
/** "Tue 15-Sep 07:30" */
export const fmtShort = (d: Date) => `${DAYS[d.getUTCDay()]} ${p2(d.getUTCDate())}-${MONTHS[d.getUTCMonth()]} ${hhmm(d)}`
/** "Friday 09-Oct-2026 05:56 AM" */
export function fmtLong(d: Date) {
  const h = d.getUTCHours()
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${DAYS_LONG[d.getUTCDay()]} ${p2(d.getUTCDate())}-${MONTHS[d.getUTCMonth()]}-${d.getUTCFullYear()} ${p2(h12)}:${p2(d.getUTCMinutes())} ${h < 12 ? 'AM' : 'PM'}`
}
/** "SUN 13-SEP 07:30" */
export const fmtBand = (d: Date) => `${DAYS[d.getUTCDay()]} ${p2(d.getUTCDate())}-${MONTHS[d.getUTCMonth()]} ${hhmm(d)}`.toUpperCase()

export const pct = (x: number) => `${Math.round(x * 100)}%`
export const hours1 = (h: number) => `${h.toFixed(1)} h`

/** Time variance wording. Positive = behind. */
export function fmtVariance(v: number) {
  if (v > 0.1) return `+${v.toFixed(1)} h behind`
  if (v < -0.1) return `${v.toFixed(1)} h ahead`
  return 'on time'
}
export const varianceTone = (v: number): 'late' | 'early' | 'ok' => (v > 0.1 ? 'late' : v < -0.1 ? 'early' : 'ok')

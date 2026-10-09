/** Pre-fill of the site-layout facts from the imported location name and scope line (§5). */
export interface SiteLayout {
  code: string
  chainage: string
  cells: number | null
  lines: string
  otmp: string
  station: string
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim()

export function parseLayout(name: string, scope: string): SiteLayout {
  // "C263  –  KM 209+025"
  const [codePart, ...rest] = name.split(/\s*[–—-]\s+/)
  const code = clean(codePart ?? '')
  const chainage = clean(rest.join(' - '))
  // "1 cell │ Main Line 1 & Main Line 3 │ TSO OTMP from Station 29"
  const parts = scope.split(/[│|]/).map(clean).filter(Boolean)
  let cells: number | null = null
  let lines = ''
  let otmp = ''
  let station = ''
  for (const p of parts) {
    const c = p.match(/^(\d+)\s*cells?$/i)
    const o = p.match(/^(.+?)\s+OTMP(?:\s+from\s+(.+))?$/i)
    if (c) cells = Number(c[1])
    else if (o) {
      otmp = clean(o[1])
      station = clean(o[2] ?? '')
    } else if (!lines) lines = p
  }
  return { code, chainage, cells, lines, otmp, station }
}

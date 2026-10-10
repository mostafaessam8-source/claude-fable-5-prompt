/** Pre-fill of the site-layout facts from the imported location name and scope line (§5). */
/** What the culvert is made of: box cells or pipes. */
export type CulvertKind = 'cell' | 'pipe'
export const KINDS: CulvertKind[] = ['cell', 'pipe']
/** "cell" / "cells" / "pipe" / "pipes" */
export const unit = (kind: CulvertKind, n: number) => `${kind}${n === 1 ? '' : 's'}`

export interface SiteLayout {
  code: string
  chainage: string
  cells: number | null
  /** Cell or pipe — `cells` is the count of either. */
  kind: CulvertKind
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
  let kind: CulvertKind = 'cell'
  let lines = ''
  let otmp = ''
  let station = ''
  for (const p of parts) {
    const c = p.match(/^(\d+)\s*(cell|pipe)s?$/i)
    const o = p.match(/^(.+?)\s+OTMP(?:\s+from\s+(.+))?$/i)
    if (c) { cells = Number(c[1]); kind = c[2].toLowerCase() as CulvertKind }
    else if (o) {
      otmp = clean(o[1])
      station = clean(o[2] ?? '')
    } else if (!lines) lines = p
  }
  return { code, chainage, cells, kind, lines, otmp, station }
}

/** "C263  –  KM 209+025" */
export const composeName = (l: SiteLayout) => [l.code, l.chainage].filter(Boolean).join('  –  ')

/** "1 cell  │  Main Line 1 & Main Line 3  │  TSO OTMP from Station 29" */
export function composeScope(l: SiteLayout): string {
  const parts: string[] = []
  if (l.cells != null) parts.push(`${l.cells} ${unit(l.kind, l.cells)}`)
  if (l.lines) parts.push(l.lines)
  if (l.otmp) parts.push(`${l.otmp} OTMP${l.station ? ` from ${l.station}` : ''}`)
  return parts.join('  │  ')
}

const sameLayout = (a: SiteLayout, b: SiteLayout) =>
  a.code === b.code && a.chainage === b.chainage && a.cells === b.cells && a.kind === b.kind && a.lines === b.lines &&
  a.otmp === b.otmp && a.station === b.station

/**
 * The name/scope strings to write for a location. Untouched layouts keep the imported text
 * verbatim; edited ones are re-composed so that re-importing parses back to the same facts.
 */
export function locationStrings(name: string, scope: string, layout: SiteLayout | undefined) {
  if (!layout || sameLayout(layout, parseLayout(name, scope))) return { name, scope }
  return { name: composeName(layout) || name, scope: composeScope(layout) }
}

/** "PROJECT  -  CULVERT C263  -  KM 209+025  -  1 CELL  -  TSO OTMP / Station 29" */
export function pageTitle(project: string, l: SiteLayout | undefined, fallback: string, sep = ' - '): string {
  const bits = [project, `CULVERT ${l?.code || fallback}`]
  if (l?.chainage) bits.push(l.chainage)
  if (l?.cells) bits.push(`${l.cells} ${unit(l.kind, l.cells)}`.toUpperCase())
  if (l?.otmp) bits.push(`${l.otmp} OTMP${l.station ? ' / ' + l.station : ''}`)
  return bits.join(sep)
}

import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { askClaude, buildRequest, ClaudeError, FUNCTION_NAME, normalizeProposals, parseResponse, SYSTEM_PROMPT } from '../src/layout/claude'
import { applyChanges, diffProposals } from '../src/layout/diff'
import { LayoutCard } from '../src/layout/LayoutCard'
import type { SiteLayout } from '../src/layout/parse'

const L = (over: Partial<SiteLayout>): SiteLayout => ({ code: 'C263', chainage: 'KM 209+025', cells: 1, kind: 'cell', length: '', lines: 'Main Line 1 & Main Line 3', otmp: 'TSO', station: 'Station 29', ...over })
const P = (over = {}) => ({ code: 'C263', chainage: null, cells: null, kind: null, length: null, lines: null, otmp: null, station: null, ...over })

describe('request', () => {
  const req = buildRequest('C263 has 2 cells', [{ code: 'C263', name: 'C263 – KM 209+025' }])
  it('forces the tool call and tells the model not to invent', () => {
    expect(req.tool_choice).toEqual({ type: 'tool', name: FUNCTION_NAME })
    expect(req.tools[0].input_schema.properties.locations.items.required).toEqual(['code', 'chainage', 'cells', 'kind', 'length', 'lines', 'otmp', 'station'])
    expect(SYSTEM_PROMPT).toMatch(/return null/)
    expect(SYSTEM_PROMPT).toMatch(/Never invent/)
    expect(req.messages[0].content).toContain('<pasted_text>\nC263 has 2 cells')
  })
})

describe('response', () => {
  it('reads the tool call', () => {
    const out = parseResponse({ content: [{ type: 'text', text: 'ok' }, { type: 'tool_use', name: FUNCTION_NAME, input: { locations: [{ code: 'C263', chainage: null, cells: 2, lines: ' ', otmp: 'TSO', station: null }] } }] })
    expect(out).toEqual([P({ cells: 2, otmp: 'TSO' })])
  })
  it('rejects prose, API errors and malformed entries', () => {
    expect(() => parseResponse({ content: [{ type: 'text', text: '{"locations":[]}' }] })).toThrow(ClaudeError)
    expect(() => parseResponse({ error: { message: 'bad key' } })).toThrow('bad key')
    expect(() => normalizeProposals({ locations: [{ chainage: 'x' }] })).toThrow(/no location code/)
    expect(() => normalizeProposals({})).toThrow(ClaudeError)
  })
  it('treats a non-integer or negative cell count as unknown', () => {
    expect(normalizeProposals({ locations: [{ code: 'A', cells: 2.5 }, { code: 'B', cells: -1 }] }).map((p) => p.cells)).toEqual([null, null])
  })
})

describe('transport', () => {
  const ok = { content: [{ type: 'tool_use', name: FUNCTION_NAME, input: { locations: [] } }] }
  const resp = (b: unknown, status = 200) => ({ ok: status < 400, status, json: async () => b }) as Response
  it('posts to the proxy without any key', async () => {
    const f = vi.fn().mockResolvedValue(resp(ok))
    await askClaude('x', [], { proxyUrl: 'https://p.example/claude' }, f)
    expect(f.mock.calls[0][0]).toBe('https://p.example/claude')
    expect(JSON.stringify(f.mock.calls[0][1].headers)).not.toMatch(/x-api-key/)
  })
  it('falls back to the user key, direct', async () => {
    const f = vi.fn().mockResolvedValue(resp(ok))
    await askClaude('x', [], { apiKey: 'k' }, f)
    expect(f.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/messages')
    expect(f.mock.calls[0][1].headers['x-api-key']).toBe('k')
  })
  it('errors with neither, and on HTTP failure', async () => {
    await expect(askClaude('x', [], {})).rejects.toThrow(/No Claude proxy/)
    await expect(askClaude('x', [], { apiKey: 'k' }, vi.fn().mockResolvedValue(resp({ error: { message: 'nope' } }, 401)))).rejects.toThrow(/401.*nope/)
  })
})

describe('diff — never overwrite silently', () => {
  it('null fields never change anything; only real differences are listed', () => {
    const layouts = [L({}), L({ code: 'C265', chainage: 'KM 210+525', cells: 3 })]
    const { rows, unmatched } = diffProposals(layouts, [
      P({ cells: 2, otmp: 'tso' }),                       // cells differs; otmp same (case-insens.)
      P({ code: 'c 265', lines: 'ML1' }),                 // matched ignoring case/space
      P({ code: 'ZZ9', cells: 5 }),                       // no such location
    ])
    expect(rows).toEqual([
      { index: 0, code: 'C263', changes: [{ field: 'cells', from: 1, to: 2 }] },
      { index: 1, code: 'C265', changes: [{ field: 'lines', from: 'Main Line 1 & Main Line 3', to: 'ML1' }] },
    ])
    expect(unmatched.map((u) => u.code)).toEqual(['ZZ9'])
  })
  it('applies only accepted rows and leaves the input untouched', () => {
    const layouts = [L({}), L({ code: 'C265' })]
    const { rows } = diffProposals(layouts, [P({ cells: 4 }), P({ code: 'C265', cells: 6 })])
    const out = applyChanges(layouts, rows, new Set([1]))
    expect(out.map((l) => l.cells)).toEqual([1, 6])
    expect(layouts.map((l) => l.cells)).toEqual([1, 1])
  })
})

describe('layout card', () => {
  const html = (l: SiteLayout) => renderToStaticMarkup(createElement(LayoutCard, { layout: l }))
  it('draws one box per cell and the caption bar', () => {
    const h = html(L({ cells: 3, otmp: 'SABATCO', station: 'Station 35' }))
    expect(h).toContain('CELL 1'); expect(h).toContain('CELL 3'); expect(h).not.toContain('CELL 4')
    expect(h).toContain('3 CELLS')
    expect(h).toContain('SABATCO – Station 35')
    expect(h).toContain('C263  -  KM 209+025')
    expect(h).toContain('stroke-dasharray')
  })
  it('singular caption, and no boxes when the cell count is unknown', () => {
    expect(html(L({ cells: 1 }))).toContain('1 CELL<')
    const h = html(L({ cells: null }))
    expect(h).not.toContain('CELL 1')
  })
})

import { cardsSvg } from '../src/export/raster'
describe('cards picture for Excel', () => {
  it('lays the cards out side by side in one standalone SVG', () => {
    const { svg, width, height } = cardsSvg([L({}), L({ code: 'C265', cells: 3 }), L({ code: 'C267', cells: 2 })])
    expect(width).toBe(3 * 220 + 2 * 6)
    expect(height).toBe(190)
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/)
    expect(svg.match(/<svg /g)).toHaveLength(4) // outer + 3 cards
    expect(svg).toContain('x="226"'); expect(svg).toContain('x="452"')
    expect(svg).not.toMatch(/ style="width:100%/)
    expect(svg).toContain('CELL 3')
  })
})

describe('culvert type: cells or pipes', () => {
  it('parses, composes and round-trips the scope line', async () => {
    const { parseLayout, composeScope, locationStrings, pageTitle } = await import('../src/layout/parse')
    const l = parseLayout('C300  –  KM 1', '2 pipes  │  Main Line 1  │  TSO OTMP from Station 3')
    expect(l).toMatchObject({ cells: 2, kind: 'pipe' })
    expect(composeScope(l)).toBe('2 pipes  │  Main Line 1  │  TSO OTMP from Station 3')
    expect(composeScope({ ...l, cells: 1 })).toContain('1 pipe  │')
    expect(pageTitle('P', l, 'x')).toContain('2 PIPES')
    expect(locationStrings('C300  –  KM 1', '2 cells', { ...l, kind: 'pipe' }).scope).toContain('pipes') // an edited type is exported
    expect(parseLayout('X', '3 CELLS').kind).toBe('cell')
  })
  it('Claude may propose the type; unknown values are ignored', () => {
    expect(normalizeProposals({ locations: [{ code: 'A', kind: 'pipe', cells: 2 }, { code: 'B', kind: 'arch' }] }).map((p) => p.kind)).toEqual(['pipe', null])
    const rows = diffProposals([L({})], [P({ kind: 'pipe' })]).rows
    expect(rows[0].changes).toEqual([{ field: 'kind', from: 'cell', to: 'pipe' }])
  })
  it('the card draws pipes, not cells', () => {
    const h = renderToStaticMarkup(createElement(LayoutCard, { layout: L({ cells: 2, kind: 'pipe' }) }))
    expect(h).toContain('PIPE 1')
    expect(h).toContain('2 PIPES<')
    expect(h).not.toContain('CELL 1')
  })
})

describe('culvert length', () => {
  it('parses, composes, shows on the card and is proposed by Claude', async () => {
    const { parseLayout, composeScope, pageTitle } = await import('../src/layout/parse')
    const l = parseLayout('C300  –  KM 1', '2 pipes  │  Length 24 m  │  Main Line 1  │  TSO OTMP from Station 3')
    expect(l).toMatchObject({ length: '24 m', lines: 'Main Line 1', cells: 2 })
    expect(composeScope(l)).toBe('2 pipes  │  Length 24 m  │  Main Line 1  │  TSO OTMP from Station 3')
    expect(parseLayout('X', 'Main Line 1').length).toBe('')
    expect(pageTitle('P', l, 'x')).toContain('LENGTH 24 M')
    const h = renderToStaticMarkup(createElement(LayoutCard, { layout: { ...l, cells: 2 } }))
    expect(h).toContain('L 24 M')
    expect(normalizeProposals({ locations: [{ code: 'A', length: ' 12.5 m ' }] })[0].length).toBe('12.5 m')
    expect(diffProposals([L({})], [P({ length: '30 m' })]).rows[0].changes).toEqual([{ field: 'length', from: null, to: '30 m' }])
  })
})

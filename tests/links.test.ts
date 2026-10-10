import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { computeProject } from '../src/engine/schedule'
import { parseWorkbook } from '../src/import/parse'
import { ClaudeError } from '../src/layout/claude'
import { askLinks, buildLinksRequest, LINKS_FUNCTION, LINKS_SYSTEM, parseLinksResponse } from '../src/links/claude'
import { applyLinkChanges, checkProposals, startFromLink } from '../src/links/diff'
import { handle, validateBody, type Env } from '../worker'
import { project as mk } from './helpers'

const ORIGIN = 'https://me.github.io'
const env: Env = { ANTHROPIC_API_KEY: 'sk-secret', ALLOWED_ORIGINS: ORIGIN }

/** 1: 0–2   2: 2–4 (after 1)   3: 2–3 (also starts when 1 ends)   4: 4–6 */
const base = () => mk([
  { durationH: 2 },
  { durationH: 2, pred: 1 },
  { durationH: 1, pred: 1 },
  { durationH: 2, pred: 2 },
])
const proposal = (no: number, pred: number, rel: 'FS' | 'SS' | 'FF' | 'SF', lagH: number, reason = 'r') => ({ no, pred, rel, lagH, reason })
const check = (props: ReturnType<typeof proposal>[]) => {
  const p = base()
  return { p, ch: checkProposals(p, computeProject(p).locations, 0, props) }
}

describe('link maths', () => {
  const pred = { startH: 2, finishH: 6 }
  it('FS / SS / FF / SF / possession start', () => {
    expect(startFromLink({ pred: 1, rel: 'FS', lagH: 1 }, pred, 2)).toBe(7)
    expect(startFromLink({ pred: 1, rel: 'SS', lagH: 1 }, pred, 2)).toBe(3)
    expect(startFromLink({ pred: 1, rel: 'FF', lagH: 0 }, pred, 2)).toBe(4)
    expect(startFromLink({ pred: 1, rel: 'SF', lagH: 3 }, pred, 2)).toBe(3)
    expect(startFromLink({ pred: 0, rel: 'FS', lagH: 5 }, null, 2)).toBe(5)
  })
})

describe('proposals can never move a date', () => {
  it('accepts a different predecessor that reproduces the planned start', () => {
    // activity 4 starts at 4: FS after 2 (finish 4) — or FS after 3? (finish 3) + 1 h lag also gives 4
    const { ch } = check([proposal(4, 3, 'FS', 1)])
    expect(ch).toHaveLength(1)
    expect(ch[0]).toMatchObject({ no: 4, ok: true, from: { pred: 2, rel: 'FS', lagH: 0 }, to: { pred: 3, rel: 'FS', lagH: 1 } })
  })
  it('shows but blocks one that would move the start', () => {
    const { ch } = check([proposal(4, 3, 'FS', 0)]) // would start at 3, the sheet says 4
    expect(ch[0].ok).toBe(false)
    expect(ch[0].why).toMatch(/would start at 3\.00 h, but the sheet's planned start is 4\.00 h/)
  })
  it('blocks a predecessor that is not an earlier activity', () => {
    expect(check([proposal(2, 4, 'FS', 0)]).ch[0]).toMatchObject({ ok: false })
    expect(check([proposal(2, 2, 'FS', 0)]).ch[0]).toMatchObject({ ok: false })
    expect(check([proposal(2, 9, 'FS', 0)]).ch[0].why).toMatch(/not an earlier activity/)
  })
  it('ignores an unchanged link, an unknown activity and a repeat', () => {
    const { ch } = check([proposal(2, 1, 'FS', 0), proposal(99, 1, 'FS', 0), proposal(4, 3, 'FS', 1), proposal(4, 1, 'FS', 4)])
    expect(ch.map((c) => c.no)).toEqual([4])
  })
  it('applies only accepted, applicable changes — and the engine dates stay identical', () => {
    const { p, ch } = check([proposal(4, 3, 'FS', 1), proposal(3, 2, 'SS', 0)]) // 2nd is invalid? 3 starts at 2: SS with 2 → 2 ✓ ok
    expect(ch.every((c) => c.ok)).toBe(true)
    const before = computeProject(p).locations[0].activities.map((a) => [a.plannedStartH, a.plannedFinishH])
    const q = applyLinkChanges(p, ch, new Set(['0:4']))
    expect(q.locations[0].activities[3]).toMatchObject({ pred: 3, rel: 'FS', lagH: 1 })
    expect(q.locations[0].activities[2]).toMatchObject({ pred: 1 }) // 3 was not accepted
    expect(p.locations[0].activities[3].pred).toBe(2)               // input untouched
    expect(computeProject(q).locations[0].activities.map((a) => [a.plannedStartH, a.plannedFinishH])).toEqual(before)
    const blocked = checkProposals(p, computeProject(p).locations, 0, [proposal(4, 3, 'FS', 0)])
    expect(applyLinkChanges(p, blocked, new Set(['0:4']))).toBe(p) // a blocked change is never applied
  })
})

describe('the request and the answer', () => {
  it('forces the tool, states the hard rule, and lists planned times and current links', async () => {
    const p = base()
    const req = buildLinksRequest(p.locations[0], computeProject(p).locations[0])
    expect(req.tool_choice).toEqual({ type: 'tool', name: LINKS_FUNCTION })
    expect(LINKS_SYSTEM).toMatch(/reproduce the activity's planned start exactly/)
    expect(LINKS_SYSTEM).toMatch(/Never invent a time and never change a date/)
    expect(req.messages[0].content).toContain('4 | A4 | start 4 h, finish 6 h, duration 2 h | current link: pred 2 FS lag 0 h')
  })
  it('parses the tool call and rejects anything malformed', () => {
    const ok = { content: [{ type: 'tool_use', name: LINKS_FUNCTION, input: { links: [{ no: 4, pred: 3, rel: 'FS', lag_h: 1, reason: ' x ' }] } }] }
    expect(parseLinksResponse(ok)).toEqual([{ no: 4, pred: 3, rel: 'FS', lagH: 1, reason: 'x' }])
    const bad = (l: unknown) => () => parseLinksResponse({ content: [{ type: 'tool_use', name: LINKS_FUNCTION, input: { links: [l] } }] })
    expect(bad({ no: 4, pred: -1, rel: 'FS', lag_h: 0 })).toThrow(ClaudeError)
    expect(bad({ no: 4, pred: 1, rel: 'XX', lag_h: 0 })).toThrow(/invalid relationship/)
    expect(bad({ no: 4, pred: 1, rel: 'FS', lag_h: 'a' })).toThrow(/invalid lag/)
    expect(() => parseLinksResponse({ content: [{ type: 'text', text: '{}' }] })).toThrow(/structured tool call/)
  })
  it("passes the worker's validation and round-trips through it", async () => {
    const p = base()
    const answer = { content: [{ type: 'tool_use', name: LINKS_FUNCTION, input: { links: [{ no: 4, pred: 3, rel: 'FS', lag_h: 1, reason: 'follows 3' }] } }] }
    const anthropic = vi.fn().mockResolvedValue(new Response(JSON.stringify(answer), { status: 200, headers: { 'content-type': 'application/json' } }))
    const viaWorker = ((url: string, init: RequestInit) =>
      handle(new Request(url, { ...init, headers: { ...(init.headers as Record<string, string>), origin: ORIGIN } }), env, anthropic)) as unknown as typeof fetch
    expect(validateBody(buildLinksRequest(p.locations[0], computeProject(p).locations[0]))).toBeNull()
    const out = await askLinks(p.locations[0], computeProject(p).locations[0], { proxyUrl: 'https://proxy.example/' }, viaWorker)
    expect(out).toEqual([{ no: 4, pred: 3, rel: 'FS', lagH: 1, reason: 'follows 3' }])
  })
})

describe('on the real CRP2 sheet', () => {
  it('every link the importer built reproduces its planned start (so Claude starts from a valid base)', async () => {
    const p = await parseWorkbook(readFileSync('tests/fixtures/crp2/CRP2_EWR_Shutdown03_Progress_Sheet.xlsx'))
    expect(p.source).toBe('crp2')
    const r = computeProject(p)
    let n = 0
    p.locations.forEach((l, i) => {
      const byNo = new Map(l.activities.map((a, k) => [a.no, r.locations[i].activities[k]]))
      l.activities.forEach((a, k) => {
        const e = r.locations[i].activities[k]
        const pr = a.pred === 0 ? null : byNo.get(a.pred)!
        const s = startFromLink({ pred: a.pred, rel: a.rel, lagH: a.lagH }, pr && { startH: pr.plannedStartH, finishH: pr.plannedFinishH }, e.durationH)
        expect(s, `${l.name} #${a.no}`).toBeCloseTo(e.plannedStartH, 1)
        n++
      })
    })
    expect(n).toBe(130)
  })
})

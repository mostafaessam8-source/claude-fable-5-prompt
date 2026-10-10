import { describe, expect, it, vi } from 'vitest'
import { buildRequest } from '../src/layout/claude'
import { handle, MAX_BODY_BYTES, validateBody, type Env } from '../worker'

const ORIGIN = 'https://me.github.io'
const env: Env = { ANTHROPIC_API_KEY: 'sk-secret', ALLOWED_ORIGINS: `${ORIGIN}, http://localhost:5173` }
const good = () => buildRequest('C263 has 2 cells', [{ code: 'C263', name: 'C263 – KM 209+025' }])
const post = (body: unknown, origin: string | null = ORIGIN, raw?: string) =>
  new Request('https://proxy.example/', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) },
    body: raw ?? JSON.stringify(body),
  })
const upstreamOk = () => vi.fn().mockResolvedValue(new Response(JSON.stringify({ content: [] }), { status: 200, headers: { 'content-type': 'application/json' } }))

describe('worker proxy', () => {
  it('forwards the app request with the secret key, which never reaches the browser', async () => {
    const f = upstreamOk()
    const res = await handle(post(good()), env, f)
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(init.headers['x-api-key']).toBe('sk-secret')
    expect(init.headers['anthropic-version']).toBe('2023-06-01')
    expect(JSON.stringify([...res.headers])).not.toContain('sk-secret')
    expect(await res.text()).not.toContain('sk-secret')
  })

  it('answers the CORS preflight for an allowed origin only', async () => {
    const ok = await handle(new Request('https://p/', { method: 'OPTIONS', headers: { origin: ORIGIN } }), env, upstreamOk())
    expect(ok.status).toBe(204)
    expect(ok.headers.get('access-control-allow-methods')).toContain('POST')
    const bad = await handle(new Request('https://p/', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }), env, upstreamOk())
    expect(bad.status).toBe(403)
  })

  it('refuses unknown or missing origins without calling Anthropic', async () => {
    const f = upstreamOk()
    expect((await handle(post(good(), 'https://evil.example'), env, f)).status).toBe(403)
    expect((await handle(post(good(), null), env, f)).status).toBe(403)
    expect(f).not.toHaveBeenCalled()
  })

  it('refuses non-POST, bad JSON, oversize bodies', async () => {
    const f = upstreamOk()
    expect((await handle(new Request('https://p/', { method: 'GET', headers: { origin: ORIGIN } }), env, f)).status).toBe(405)
    expect((await handle(post(null, ORIGIN, '{nope'), env, f)).status).toBe(400)
    expect((await handle(post(null, ORIGIN, 'x'.repeat(MAX_BODY_BYTES + 1)), env, f)).status).toBe(413)
    expect(f).not.toHaveBeenCalled()
  })

  it('is not a general key to the API: other models, extra fields, tools and token counts are refused', () => {
    expect(validateBody(good())).toBeNull()
    expect(validateBody({ ...good(), model: 'claude-opus-5-5' })).toMatch(/model/)
    expect(validateBody({ ...good(), max_tokens: 100_000 })).toMatch(/max_tokens/)
    expect(validateBody({ ...good(), stream: true })).toMatch(/stream/)
    expect(validateBody({ ...good(), metadata: {} })).toMatch(/metadata/)
    expect(validateBody({ ...good(), tools: [] })).toMatch(/tool/)
    expect(validateBody({ ...good(), tools: [{ name: 'bash' }] })).toMatch(/tool/)
    expect(validateBody({ ...good(), tool_choice: { type: 'auto' } })).toMatch(/tool_choice/)
    expect(validateBody({ ...good(), messages: [...good().messages, ...good().messages] })).toMatch(/message/)
    expect(validateBody({ ...good(), messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }] })).toMatch(/message/)
    expect(validateBody([])).toMatch(/object/)
  })

  it('passes an upstream error through, and reports an unreachable API as 502', async () => {
    const err = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'overloaded' } }), { status: 529, headers: { 'content-type': 'application/json' } }))
    const r = await handle(post(good()), env, err)
    expect(r.status).toBe(529)
    expect(await r.text()).toContain('overloaded')
    const down = vi.fn().mockRejectedValue(new Error('net'))
    expect((await handle(post(good()), env, down)).status).toBe(502)
  })

  it('fails closed when it is not configured', async () => {
    expect((await handle(post(good()), { ...env, ALLOWED_ORIGINS: '' }, upstreamOk())).status).toBe(500)
    expect((await handle(post(good()), { ...env, ANTHROPIC_API_KEY: '' }, upstreamOk())).status).toBe(500)
  })
})

import { askClaude, FUNCTION_NAME } from '../src/layout/claude'
describe('client ↔ worker contract', () => {
  it("the app's real request passes the worker's validation and its answer parses", async () => {
    const answer = { content: [{ type: 'tool_use', name: FUNCTION_NAME, input: { locations: [{ code: 'C263', chainage: null, cells: 2, lines: null, otmp: null, station: null }] } }] }
    const anthropic = vi.fn().mockResolvedValue(new Response(JSON.stringify(answer), { status: 200, headers: { 'content-type': 'application/json' } }))
    // route the browser's fetch straight into the worker handler, as the browser would (it adds Origin)
    const viaWorker = ((url: string, init: RequestInit) =>
      handle(new Request(url, { ...init, headers: { ...(init.headers as Record<string, string>), origin: ORIGIN } }), env, anthropic)) as unknown as typeof fetch
    const out = await askClaude('C263 has 2 cells', [{ code: 'C263', name: 'C263 – KM 209+025' }], { proxyUrl: 'https://proxy.example/' }, viaWorker)
    expect(out).toEqual([{ code: 'C263', chainage: null, cells: 2, kind: null, length: null, lines: null, otmp: null, station: null }])
    expect(anthropic).toHaveBeenCalledOnce()
    expect(JSON.parse(anthropic.mock.calls[0][1].body).model).toBeTruthy()
  })
})

/**
 * Thin Cloudflare Worker proxy for the "Ask Claude to fill this" call.
 * The Anthropic key lives only here, as a Worker secret; the browser never sees it.
 *
 * It forwards ONLY the two request shapes the app sends (fixed model, ONE forced tool —
 * fill_site_layouts or suggest_links —, capped size), and only for allowed browser origins, so a leaked
 * URL cannot be used as a general-purpose key to the Messages API.
 */
import { FUNCTION_NAME, MODEL } from '../src/layout/claude'
import { LINKS_FUNCTION } from '../src/links/claude'

export interface Env {
  /** wrangler secret put ANTHROPIC_API_KEY */
  ANTHROPIC_API_KEY: string
  /** Comma-separated origins allowed to call this Worker, e.g. https://you.github.io */
  ALLOWED_ORIGINS: string
}

export const MAX_BODY_BYTES = 60_000
export const MAX_TOKENS = 4_000
const UPSTREAM = 'https://api.anthropic.com/v1/messages'
const ALLOWED_FIELDS = new Set(['model', 'max_tokens', 'system', 'tools', 'tool_choice', 'messages'])

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

function corsHeaders(origin: string): Record<string, string> {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'origin',
  }
}

/** Why a request body is refused, or null if it is the app's request. */
export function validateBody(b: unknown): string | null {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return 'Body must be a JSON object.'
  const o = b as Record<string, unknown>
  for (const k of Object.keys(o)) if (!ALLOWED_FIELDS.has(k)) return `Field "${k}" is not allowed.`
  if (o.model !== MODEL) return `Only model ${MODEL} is allowed.`
  if (typeof o.max_tokens !== 'number' || o.max_tokens < 1 || o.max_tokens > MAX_TOKENS) return `max_tokens must be 1..${MAX_TOKENS}.`
  const tools = o.tools as { name?: string }[] | undefined
  const allowedTools = [FUNCTION_NAME, LINKS_FUNCTION]
  if (!Array.isArray(tools) || tools.length !== 1 || !allowedTools.includes(tools[0]?.name ?? '')) return `Exactly one tool (${allowedTools.join(' or ')}) is allowed.`
  const tc = o.tool_choice as { type?: string; name?: string } | undefined
  if (tc?.type !== 'tool' || tc.name !== tools[0].name) return 'tool_choice must force the tool.'
  const msgs = o.messages as { role?: string; content?: unknown }[] | undefined
  if (!Array.isArray(msgs) || msgs.length !== 1 || msgs[0]?.role !== 'user' || typeof msgs[0].content !== 'string') return 'Exactly one user message with text content is allowed.'
  if (typeof o.system !== 'string') return 'system must be a string.'
  return null
}

export async function handle(req: Request, env: Env, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (allowed.length === 0) return json(500, { error: { message: 'ALLOWED_ORIGINS is not configured.' } })
  if (!env.ANTHROPIC_API_KEY) return json(500, { error: { message: 'ANTHROPIC_API_KEY is not configured.' } })

  const origin = req.headers.get('origin') ?? ''
  if (!allowed.includes(origin)) return json(403, { error: { message: 'Origin not allowed.' } })
  const cors = corsHeaders(origin)

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return json(405, { error: { message: 'POST only.' } }, cors)

  const text = await req.text()
  if (text.length > MAX_BODY_BYTES) return json(413, { error: { message: 'Request too large.' } }, cors)
  let body: unknown
  try { body = JSON.parse(text) } catch { return json(400, { error: { message: 'Invalid JSON.' } }, cors) }
  const problem = validateBody(body)
  if (problem) return json(400, { error: { message: problem } }, cors)

  let upstream: Response
  try {
    upstream = await fetchImpl(UPSTREAM, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: text,
    })
  } catch {
    return json(502, { error: { message: 'Could not reach the Anthropic API.' } }, cors)
  }
  return new Response(upstream.body, { status: upstream.status, headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json', ...cors } })
}

export default { fetch: (req: Request, env: Env) => handle(req, env) }

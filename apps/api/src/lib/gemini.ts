/**
 * Lesson 4.4 (from v1 Lessons 7/7b/16): call Gemini with retries and backup models.
 *   429 = this model's free quota is used up  → try the next model
 *   500/503 = "busy right now"                → wait 1 s, 2 s, 4 s (exponential backoff), retry
 *   anything else                             → stop with a clear message
 * The key is a Worker SECRET; the browser never sees it.
 */
export type GeminiEnv = { GEMINI_API_KEY?: string; GEMINI_MODEL?: string; GEMINI_BACKUP_MODELS?: string }

export class AiError extends Error {
  constructor(message: string, public busy = false, public status = 502) { super(message) }
}

type Part = { text: string } | { inline_data: { mime_type: string; data: string } }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function gemini(env: GeminiEnv, parts: Part[], opts: { schema?: object; temperature?: number; quick?: boolean } = {}) {
  if (!env.GEMINI_API_KEY) throw new AiError('GEMINI_API_KEY is not set (wrangler secret put GEMINI_API_KEY)', false, 500)
  const models = [env.GEMINI_MODEL || 'gemini-flash-latest',
    ...(env.GEMINI_BACKUP_MODELS || 'gemini-flash-lite-latest').split(',').map((m) => m.trim()).filter(Boolean)]
    .filter((m, i, all) => all.indexOf(m) === i)
  const body = JSON.stringify({
    contents: [{ parts }],
    generationConfig: { temperature: opts.temperature ?? 0.1, responseMimeType: 'application/json',
      ...(opts.schema ? { responseSchema: opts.schema } : {}) },
  })

  let status = 0, detail = ''
  for (const model of models) {
    const attempts = opts.quick ? 2 : 3
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY }, body,
      })
      status = res.status
      if (res.ok) {
        const data = await res.json() as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] }
        const text = (data.candidates?.[0]?.content?.parts ?? []).filter((p) => p.text && !p.thought).map((p) => p.text).join('')
        if (!text) throw new AiError('The AI returned no answer. Try again.')
        return parseJsonLoose(text)
      }
      detail = (await res.text()).slice(0, 300)
      if (status === 429) break                                  // quota: next model
      if (status !== 500 && status !== 503) break                // real error: stop trying this model…
      if (attempt < attempts) await sleep((opts.quick ? 1500 : 1000) * 2 ** (attempt - 1))
    }
    if (status !== 429 && status !== 500 && status !== 503) break   // …and the others
  }
  console.error(`Gemini ${status}: ${detail}`)
  if (status === 429) throw new AiError('AI free limit reached for today. Try again later, or type the details.', false, 429)
  if (status === 500 || status === 503) throw new AiError('The AI is very busy right now. Please try again in a minute.', true, 503)
  let reason = ''
  try { reason = (JSON.parse(detail) as { error?: { message?: string } }).error?.message ?? '' } catch { /* not JSON */ }
  throw new AiError(`The AI rejected the request: ${reason || 'check GEMINI_API_KEY'}`.slice(0, 200))
}

/** JSON.parse that survives ```json fences, extra text and [1]-style citation marks (v1) */
export function parseJsonLoose(text: string): Record<string, unknown> {
  const citation = /\s*\[\d+(,\s*\d+)*\]/g
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  if (!json) throw new AiError('The AI did not answer with JSON')
  let obj: unknown
  try { obj = JSON.parse(json) } catch {
    try { obj = JSON.parse(json.replace(citation, '')) } catch { throw new AiError('Could not understand the AI answer') }
  }
  if (Array.isArray(obj)) obj = obj[0]
  if (!obj || typeof obj !== 'object') throw new AiError('Could not understand the AI answer')
  const out = obj as Record<string, unknown>
  for (const k of Object.keys(out)) if (typeof out[k] === 'string') out[k] = (out[k] as string).replace(citation, '').trim()
  return out
}

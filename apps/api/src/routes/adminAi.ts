/**
 * Lesson 4.4: cover photos + AI for admins.
 *
 *   POST /api/admin/ai/read-cover   { imageBase64 }  → what Gemini reads on the cover (+ where the cover is)
 *   POST /api/admin/ai/lookup       { title, author… } → description, review summary, sources, spelling fixes
 *   PUT  /api/admin/covers          raw JPEG/PNG/WebP body (≤ 2 MB) → { url: "/covers/<id>.jpg" } in R2
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { asc } from 'drizzle-orm'
import type { AppEnv } from '../types'
import type { Db } from '../db/client'
import { categories } from '../db/schema'
import { problem } from '../lib/problem'
import { validationHook } from '../lib/validate'
import { AiError, gemini } from '../lib/gemini'
import { googleBooksDetails, searchTheWeb, type Page } from '../lib/websearch'
import { problemResponse } from '../lib/schemas'

export const adminAiRoutes = new OpenAPIHono<AppEnv>({ defaultHook: validationHook })
const secured = { security: [{ sessionCookie: [] }], tags: ['Admin: AI & covers'] }
const errors = { 400: problemResponse('Invalid input'), 401: problemResponse('Not signed in'), 403: problemResponse('Not an admin'),
  429: problemResponse('AI free quota used up'), 502: problemResponse('AI error'), 503: problemResponse('AI busy') }

const categoryNames = async (db: Db) => (await db.select({ name: categories.name }).from(categories).orderBy(asc(categories.name))).map((c) => c.name)
const clean = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const onlyKnown = (list: unknown, allowed: string[]) =>
  (Array.isArray(list) ? list : typeof list === 'string' ? list.split(',') : []).map((c) => String(c).trim()).filter((c) => allowed.includes(c)).slice(0, 3)

// ---------------------------------------------------------------- read the cover
const CoverDraft = z.object({
  title: z.string(), author: z.string(), titleSinglish: z.string(), authorSinglish: z.string(),
  translator: z.string(), originalTitle: z.string(), language: z.string(), isTranslation: z.boolean(),
  categories: z.array(z.string()), isbn: z.string(), publisher: z.string(), year: z.string(),
  confidence: z.number(), coverBox: z.array(z.number()).nullable().openapi({ description: '[ymin, xmin, ymax, xmax] on a 0–1000 scale' }),
}).openapi('CoverDraft')

adminAiRoutes.openapi(createRoute({
  ...secured, method: 'post', path: '/ai/read-cover', operationId: 'adminReadCover', summary: 'Read a cover photo with Gemini',
  request: { body: { required: true, content: { 'application/json': { schema: z.object({
    imageBase64: z.string().min(100).max(3_000_000, 'Photo too large — the app shrinks it first'),
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']).default('image/jpeg'),
  }) } } } },
  responses: { 200: { description: 'What the AI read', content: { 'application/json': { schema: CoverDraft } } }, ...errors },
}), async (c) => {
  const { imageBase64, mimeType } = c.req.valid('json')
  const allowed = await categoryNames(c.get('db'))
  const prompt = [
    'This is a photo of a book cover from a private library in Sri Lanka.',
    'Read the text on the cover exactly as printed.',
    'If the title or author is NOT in English letters (Sinhala, Tamil...), also give titleSinglish and',
    'authorSinglish: the same words written in English letters the way Sri Lankans type them in chat',
    '(e.g. "මඩොල් දූව" → "Madol Doowa", "මාර්ටින් වික්‍රමසිංහ" → "Martin Wickramasinghe").',
    'If the title is already in English letters, leave titleSinglish and authorSinglish empty.',
    'language = the language the book is written in (e.g. English, Sinhala, Tamil).',
    'isTranslation = true only if the cover says it is translated (e.g. "translated by", "පරිවර්තනය").',
    "translator = the translator's name if printed (often after \"පරිවර්තනය\" or \"translated by\"), else empty.",
    'If it is a translation, author = the ORIGINAL author when printed, and originalTitle = the original title if printed.',
    `categories = 1 to 3 items chosen ONLY from this list: ${allowed.join(', ')}.`,
    'Only give an ISBN if you can SEE it in the photo. Never guess an ISBN.',
    'Use an empty string for anything you cannot read.',
    'confidence = a number from 0 to 1: how sure you are about the title.',
    "coverBox = where the book cover is in the photo, as [ymin, xmin, ymax, xmax] scaled from 0 to 1000. Follow the cover's outer edges.",
  ].join('\n')
  const schema = {
    type: 'OBJECT',
    properties: Object.fromEntries([
      ...['title', 'author', 'titleSinglish', 'authorSinglish', 'translator', 'originalTitle', 'language', 'isbn', 'publisher', 'year'].map((k) => [k, { type: 'STRING' }]),
      ['categories', { type: 'ARRAY', items: { type: 'STRING' } }], ['isTranslation', { type: 'BOOLEAN' }],
      ['confidence', { type: 'NUMBER' }], ['coverBox', { type: 'ARRAY', items: { type: 'NUMBER' } }],
    ]),
    required: ['title', 'author', 'categories', 'language', 'isTranslation', 'confidence'],
  }
  try {
    const d = await gemini(c.env, [{ text: prompt }, { inline_data: { mime_type: mimeType, data: imageBase64 } }], { schema })
    let isbn = clean(d.isbn).replace(/[^0-9Xx]/g, '')
    if (isbn.length !== 10 && isbn.length !== 13) isbn = ''                  // a guessed/partial ISBN is worse than none
    const box = Array.isArray(d.coverBox) && d.coverBox.length === 4 ? d.coverBox.map(Number) : null
    return c.json({
      title: clean(d.title), author: clean(d.author), titleSinglish: clean(d.titleSinglish), authorSinglish: clean(d.authorSinglish),
      translator: clean(d.translator), originalTitle: clean(d.originalTitle), language: clean(d.language), isTranslation: d.isTranslation === true,
      categories: onlyKnown(d.categories, allowed), isbn, publisher: clean(d.publisher), year: clean(d.year).replace(/\D/g, '').slice(0, 4),
      confidence: Math.max(0, Math.min(1, Number(d.confidence) || 0)), coverBox: box,
    }, 200)
  } catch (err) {
    if (err instanceof AiError) return problem(c, err.status as 502, err.message, { busy: err.busy })
    throw err
  }
})

// ---------------------------------------------------------------- web lookup
const LookupBody = z.object({
  title: z.string().trim().min(1, 'Enter at least a title first').max(300),
  author: z.string().max(200).nullable().optional(), titleSinglish: z.string().max(300).nullable().optional(),
  authorSinglish: z.string().max(200).nullable().optional(), translator: z.string().max(200).nullable().optional(),
  language: z.string().max(40).nullable().optional(), isbn: z.string().max(20).nullable().optional(),
  publisher: z.string().max(200).nullable().optional(), isTranslation: z.boolean().optional(),
  answerLanguage: z.enum(['Sinhala', 'English', 'Tamil']).default('English'),
  imageBase64: z.string().max(3_000_000).optional().openapi({ description: 'optional cover photo — helps fix spelling' }),
})
const LookupResult = z.object({
  found: z.boolean(), mode: z.enum(['web', 'ai', 'googlebooks', 'sources', 'none']),
  description: z.string(), reviewSummary: z.string(), categories: z.array(z.string()),
  translator: z.string(), originalTitle: z.string(), originalAuthor: z.string(), publisher: z.string(), year: z.string(), isbn: z.string(),
  corrections: z.object({ title: z.string(), author: z.string(), titleSinglish: z.string(), authorSinglish: z.string() }),
  sources: z.array(z.object({ title: z.string(), url: z.string() })), notes: z.array(z.string()),
}).openapi('LookupResult')

adminAiRoutes.openapi(createRoute({
  ...secured, method: 'post', path: '/ai/lookup', operationId: 'adminWebLookup', summary: 'Search the web for a book and summarise it',
  request: { body: { required: true, content: { 'application/json': { schema: LookupBody } } } },
  responses: { 200: { description: 'What was found (found=false if nothing reliable)', content: { 'application/json': { schema: LookupResult } } }, ...errors },
}), async (c) => {
  const input = c.req.valid('json')
  const allowed = await categoryNames(c.get('db'))
  const answerIn = { Sinhala: 'in natural Sinhala (සිංහල, Unicode Sinhala script — not Singlish)', Tamil: 'in natural Tamil (தமிழ் script)', English: 'in English' }[input.answerLanguage]
  const known = (['title', 'author', 'titleSinglish', 'authorSinglish', 'translator', 'language', 'isbn', 'publisher'] as const)
    .filter((k) => input[k]).map((k) => `${k}: ${String(input[k]).slice(0, 200)}`).join('\n')
  const translationHint = input.isTranslation
    ? `Our copy IS a translation into ${input.language || 'another language'}.`
    : `Our copy is NOT marked as a translation: it is probably the original ${input.language ?? ''} edition. Then leave translator, originalTitle, originalAuthor EMPTY.`
  const photo = input.imageBase64 ? [{ inline_data: { mime_type: 'image/jpeg', data: input.imageBase64 } }] : []
  const prompt = [
    'Find information about this book.', translationHint, known, '',
    'Answer with ONLY a JSON object (no other text, no citation marks) with these keys:',
    '  found: true only if you are confident it is THIS book (same title and author)',
    `  description: 2-4 neutral sentences ${answerIn} about what the book is about`,
    `  reviewSummary: 1-2 sentences ${answerIn} on what readers or critics say (empty if unknown)`,
    `Write description and reviewSummary ${answerIn} even if the sources are in another language.`,
    '  originalTitle, originalAuthor: only if it is a translation', '  translator, publisher, year',
    `  categories: 1-3 items ONLY from: ${allowed.join(', ')}`,
    'Use empty strings for anything you do not know. Never invent facts.', '',
    'IMPORTANT: title and author above were read by an AI from a photo and may have spelling mistakes',
    `(common in Sinhala: similar letters like ව/ච, ද/ඳ, missing ් or ා). If the sources${photo.length ? ' and the attached cover photo' : ''} show the CORRECT spelling for THIS book, give:`,
    '  correctedTitle, correctedAuthor: the correct spelling, in the SAME script as printed on the cover',
    '  correctedTitleSinglish, correctedAuthorSinglish: the same in English letters, as Sri Lankans type them',
    'Leave the corrected fields EMPTY if the reading was already right or if you are not sure.',
  ].join('\n')

  const notes: string[] = []
  let info: Record<string, unknown> | null = null
  let mode: 'web' | 'ai' | 'googlebooks' | 'sources' | 'none' = 'none'
  let sources: { title: string; url: string }[] = []

  // 1. search ourselves, then let Gemini read ONLY those pages (RAG)
  const [pages, gb] = await Promise.all([searchTheWeb(input, c.env.TAVILY_API_KEY), googleBooksDetails(input)])
  if (pages.length) {
    const context = pages.map((p: Page, i: number) => `SOURCE ${i + 1}: ${p.title} (${p.url})\n${p.content.slice(0, 3000)}`).join('\n\n')
    const ask = (withPhoto: boolean) => gemini(c.env, [{ text: `${prompt}\n\nUse ONLY the sources below${withPhoto ? ' (and the photo)' : ''}. If they are about a different book, set found to false.\n\n${context}` }, ...(withPhoto ? photo : [])], { quick: true })
    try {
      let answer
      try { answer = await ask(photo.length > 0) } catch (err) {
        if (!(err instanceof AiError) || !err.busy || !photo.length) throw err
        answer = await ask(false)               // busy → a smaller request without the photo (v1 Lesson 16)
      }
      if (answer.found === true) { info = answer; mode = 'web'; sources = pages.map((p) => ({ title: p.title, url: p.url })) }
    } catch (err) { notes.push(`AI could not read the results (${(err as Error).message})`) }
  }
  // 2. nothing found in the sources → the model's own knowledge (skip if the AI is busy)
  if (!info && !notes.some((n) => n.includes('busy'))) {
    try {
      const answer = await gemini(c.env, [{ text: prompt }, ...photo], { quick: true, temperature: 0.2 })
      if (answer.found === true) { info = answer; mode = 'ai' }
    } catch (err) { notes.push(`AI unavailable (${(err as Error).message})`) }
  }
  // 3. AI down but pages found → give the raw text of the best page + the links
  if (!info && pages.length && notes.some((n) => n.includes('busy'))) {
    const best = pages.find((p) => p.title !== 'Google Books search') ?? pages[0]
    info = { found: true, description: best.content.replace(/\s+/g, ' ').slice(0, 700) }; mode = 'sources'
    sources = pages.map((p) => ({ title: p.title, url: p.url }))
  }
  const out = info ?? {}
  // 4. Google Books fills the gaps
  if (gb) {
    for (const k of ['description', 'publisher', 'year', 'isbn'] as const) if (!clean(out[k])) out[k] = gb[k]
    if (gb.link) sources.push({ title: 'Google Books', url: gb.link })
    if (mode === 'none') mode = 'googlebooks'
  }
  return c.json({
    found: mode !== 'none', mode, description: clean(out.description), reviewSummary: clean(out.reviewSummary),
    categories: onlyKnown(out.categories, allowed), translator: input.isTranslation ? clean(out.translator) : '',
    originalTitle: input.isTranslation ? clean(out.originalTitle) : '', originalAuthor: input.isTranslation ? clean(out.originalAuthor) : '',
    publisher: clean(out.publisher), year: clean(String(out.year ?? '')).replace(/\D/g, '').slice(0, 4), isbn: clean(out.isbn).replace(/[^0-9Xx]/g, ''),
    corrections: { title: clean(out.correctedTitle), author: clean(out.correctedAuthor), titleSinglish: clean(out.correctedTitleSinglish), authorSinglish: clean(out.correctedAuthorSinglish) },
    sources: sources.slice(0, 8), notes,
  }, 200)
})

// ---------------------------------------------------------------- upload a cover to R2
const TYPES: Record<string, { ext: string; magic: number[] }> = {
  'image/jpeg': { ext: 'jpg', magic: [0xff, 0xd8, 0xff] },
  'image/png': { ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47] },
  'image/webp': { ext: 'webp', magic: [0x52, 0x49, 0x46, 0x46] },       // "RIFF"
}

adminAiRoutes.openapi(createRoute({
  ...secured, method: 'put', path: '/covers', operationId: 'adminUploadCover', summary: 'Store a (polished) cover image in R2',
  request: { body: { required: true, content: { 'image/jpeg': { schema: z.string().openapi({ format: 'binary' }) } } } },
  responses: { 201: { description: 'Stored', content: { 'application/json': { schema: z.object({ url: z.string(), bytes: z.number().int() }) } } },
    ...errors, 413: problemResponse('Image larger than 2 MB'), 415: problemResponse('Not a JPEG, PNG or WebP image') },
}), async (c) => {
  const type = (c.req.header('content-type') ?? '').split(';')[0].trim()
  const t = TYPES[type]
  if (!t) return problem(c, 415, 'Send a JPEG, PNG or WebP image')
  const bytes = new Uint8Array(await c.req.arrayBuffer())
  if (bytes.length > 2 * 1024 * 1024) return problem(c, 413, 'The image is larger than 2 MB')
  // Trust the bytes, not the header: a real JPEG starts with FF D8 FF, a PNG with 89 50 4E 47…
  if (!t.magic.every((b, i) => bytes[i] === b)) return problem(c, 415, 'The file content is not a valid image')
  const key = `covers/${crypto.randomUUID()}.${t.ext}`
  await c.env.COVERS.put(key, bytes, { httpMetadata: { contentType: type, cacheControl: 'private, max-age=31536000, immutable' },
    customMetadata: { uploadedBy: c.get('user')!.id } })
  return c.json({ url: `/${key}`, bytes: bytes.length }, 201)
})

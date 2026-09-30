/**
 * Lesson 4.4 (from v1 Lesson 8): find text about a book on the web, for the AI to read ("RAG":
 * Retrieval-Augmented Generation — we search, the AI only summarises what we found).
 *   Tavily (if TAVILY_API_KEY is set, free key at tavily.com)  → else Wikipedia (English + Sinhala)
 *   + Google Books (no key) for similar titles and missing details
 * Every source is "nice to have": a failure returns [] and never breaks the lookup.
 */
export type Page = { title: string; url: string; content: string }
export type LookupInput = { title: string; author?: string | null; titleSinglish?: string | null; authorSinglish?: string | null; isbn?: string | null }

const UA = { 'user-agent': 'MyLibrary/2.0 (home library; https://library.bmcpthilakawansha.workers.dev)' }
const getJson = async <T>(url: string, init?: RequestInit): Promise<T | null> => {
  try {
    const res = await fetch(url, { ...init, headers: { ...UA, ...(init?.headers ?? {}) } })
    return res.ok ? ((await res.json()) as T) : null
  } catch { return null }
}

export async function tavilySearch(query: string, apiKey: string): Promise<Page[]> {
  const data = await getJson<{ results?: { title?: string; url?: string; content?: string }[] }>('https://api.tavily.com/search', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query, search_depth: 'basic', max_results: 5 }),
  })
  return (data?.results ?? []).filter((r) => r.url && r.content).map((r) => ({ title: r.title || r.url!, url: r.url!, content: r.content! }))
}

export async function wikipediaSearch(lang: 'en' | 'si', query: string): Promise<Page[]> {
  const base = `https://${lang}.wikipedia.org/w/api.php?format=json&action=query`
  const search = await getJson<{ query?: { search?: { title: string }[] } }>(`${base}&list=search&srlimit=2&srsearch=${encodeURIComponent(query)}`)
  const hits = search?.query?.search ?? []
  if (!hits.length) return []
  // prop=extracts&exintro&explaintext = "the first section as plain text"
  const pages = await getJson<{ query?: { pages?: Record<string, { title: string; extract?: string }> } }>(
    `${base}&prop=extracts&exintro=1&explaintext=1&titles=${encodeURIComponent(hits.map((h) => h.title).join('|'))}`)
  return Object.values(pages?.query?.pages ?? {}).filter((p) => p.extract).map((p) => ({
    title: `${p.title} — Wikipedia`, url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`, content: p.extract!,
  }))
}

type GbVolume = { volumeInfo: { title: string; subtitle?: string; authors?: string[]; publishedDate?: string; publisher?: string; description?: string; pageCount?: number; infoLink?: string; industryIdentifiers?: { type: string; identifier: string }[] } }
const gbQuery = (i: LookupInput) => {
  const isbn = (i.isbn ?? '').replace(/[^0-9Xx]/g, '')
  return isbn ? `isbn:${isbn}` : i.title ? `intitle:${i.title}${i.author ? ` inauthor:${i.author}` : ''}` : ''
}

/** Similar titles from Google Books → helps the AI fix a mis-read title (v1 Lesson 8e) */
export async function googleBooksCandidates(i: LookupInput): Promise<Page[]> {
  const q = [i.title, i.author].filter(Boolean).join(' ')
  if (!q) return []
  const data = await getJson<{ items?: GbVolume[] }>(`https://www.googleapis.com/books/v1/volumes?maxResults=5&q=${encodeURIComponent(q)}`)
  const lines = (data?.items ?? []).map(({ volumeInfo: v }) =>
    `- "${v.title}${v.subtitle ? ': ' + v.subtitle : ''}" by ${(v.authors ?? ['?']).join(', ')}${v.publishedDate ? ` (${v.publishedDate.slice(0, 4)})` : ''}`)
  return lines.length ? [{ title: 'Google Books search', url: `https://www.google.com/books?q=${encodeURIComponent(q)}`, content: 'Books with similar titles/authors:\n' + lines.join('\n') }] : []
}

/** Google Books details for the gaps (description, publisher, year, ISBN, link) */
export async function googleBooksDetails(i: LookupInput) {
  const q = gbQuery(i)
  if (!q) return null
  const data = await getJson<{ items?: GbVolume[] }>(`https://www.googleapis.com/books/v1/volumes?maxResults=1&q=${encodeURIComponent(q)}`)
  const v = data?.items?.[0]?.volumeInfo
  if (!v) return null
  const ids = v.industryIdentifiers ?? []
  return {
    description: (v.description ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1200),
    publisher: v.publisher ?? '', year: (v.publishedDate ?? '').slice(0, 4),
    isbn: (ids.find((x) => x.type === 'ISBN_13') ?? ids.find((x) => x.type === 'ISBN_10'))?.identifier ?? '',
    link: (v.infoLink ?? '').replace('http://', 'https://'),
  }
}

export async function searchTheWeb(i: LookupInput, tavilyKey?: string): Promise<Page[]> {
  const query = [i.title, i.author, i.titleSinglish, 'book'].filter(Boolean).join(' ')
  const candidates = googleBooksCandidates(i)
  if (tavilyKey) {
    const pages = await tavilySearch(query, tavilyKey)
    if (pages.length) return [...pages, ...(await candidates)]
  }
  const [en, si, gb] = await Promise.all([                  // in parallel: the slowest decides, not the sum
    wikipediaSearch('en', `${i.titleSinglish || i.title} ${i.authorSinglish || i.author || ''}`),
    /[඀-෿]/.test(i.title) ? wikipediaSearch('si', i.title) : Promise.resolve([]),
    candidates,
  ])
  return [...en, ...si, ...gb]
}

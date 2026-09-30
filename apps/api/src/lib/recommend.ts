/**
 * Lesson 4.2: "Recommended for you" — computed in ONE SQL query, then ranked here.
 *
 *  1. features  — every book is a bag of features: cat:Classic, author:martin wickramasinghe,
 *                 translator:…, lang:Sinhala (each with a weight: an author says more than a language)
 *  2. idf       — rare features matter more: idf = ln(N / books-with-feature).
 *                 A feature on more than half of all books (e.g. "Novel") is "too common":
 *                 it never becomes the reason, and its idf is close to 0 anyway.
 *  3. taste     — my signal per book: 5★ = +2, 4★ = +1, 3★ = +0.3, 1–2★ = −1, read/reading = +0.5
 *                 → taste(feature) = Σ signal × weight over the books I touched
 *  4. content   — score(candidate) = Σ taste × idf × weight over the candidate's features
 *  5. similar readers (collaborative filtering) — people who liked the same books as me;
 *                 cosine similarity = common / √(mine × theirs); their other liked books score Σ similarity
 *  6. popularity — Bayesian average rating (pulls books with only 1 rating towards the library mean)
 */
import { inArray, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { books } from '../db/schema'
import { bookColumnsFor } from './books'

type Row = { book_id: string; content: number; cf: number; bayes: number; n: number | null; top_f: string | null }

export async function recommend(db: Db, user: { id: string; role: string }, limit = 8) {
  const me = user.id
  const result = await db.execute(sql`
    with
    total as (select count(*)::float8 as n from books),
    feat as (
      select bc.book_id, 'cat:' || c.name as f, 1.0::float8 as w
        from book_categories bc join categories c on c.id = bc.category_id
      union all select id, 'author:' || lower(trim(author)), 1.5 from books where coalesce(trim(author), '') <> ''
      union all select id, 'translator:' || lower(trim(translator)), 1.0 from books where coalesce(trim(translator), '') <> ''
      union all select id, 'lang:' || language, 0.3 from books where language is not null
    ),
    idf as (
      select f, ln((select n from total) / count(distinct book_id)) as idf,
             count(distinct book_id) > (select n from total) / 2 as too_common
      from feat group by f
    ),
    signal as (
      select b.id as book_id,
        coalesce(case when r.rating >= 5 then 2 when r.rating = 4 then 1 when r.rating = 3 then 0.3 when r.rating <= 2 then -1 end,
                 case when rs.status in ('read', 'reading') then 0.5 else 0 end)::float8 as s
      from books b
      left join ratings r on r.book_id = b.id and r.user_id = ${me}
      left join reading_status rs on rs.book_id = b.id and rs.user_id = ${me}
      where r.user_id is not null or rs.user_id is not null
    ),
    taste as (
      select feat.f, sum(signal.s * feat.w) as pref
      from signal join feat using (book_id) group by feat.f having sum(signal.s * feat.w) > 0
    ),
    cand as (select id as book_id from books where id not in (select book_id from signal)),
    content as (
      select feat.book_id, sum(taste.pref * idf.idf * feat.w) as score,
        (array_agg(feat.f order by taste.pref * idf.idf * feat.w desc) filter (where not idf.too_common))[1] as top_f
      from feat join taste using (f) join idf using (f)
      where feat.book_id in (select book_id from cand) group by feat.book_id
    ),
    liked as (
      select user_id, book_id from ratings where rating >= 4
      union select user_id, book_id from reading_status where status = 'read'
    ),
    mine as (select book_id from liked where user_id = ${me}),
    sim as (
      select l.user_id, count(*)::float8 / sqrt((select count(*) from mine)
             * (select count(*) from liked l2 where l2.user_id = l.user_id)) as sim
      from liked l where l.user_id <> ${me} and l.book_id in (select book_id from mine) group by l.user_id
    ),
    cf as (
      select l.book_id, sum(sim.sim) as score from liked l join sim using (user_id)
      where l.book_id in (select book_id from cand) group by l.book_id
    ),
    pop as (
      select book_id, (3 * (select coalesce(avg(rating), 3) from ratings) + sum(rating))::float8 / (3 + count(*)) as bayes,
             count(*)::int as n
      from ratings group by book_id
    )
    select cand.book_id, coalesce(content.score, 0)::float8 as content, coalesce(cf.score, 0)::float8 as cf,
           coalesce(pop.bayes, 0)::float8 as bayes, pop.n, content.top_f
    from cand left join content using (book_id) left join cf using (book_id) left join pop using (book_id)`)
  const rows = (result as unknown as { rows: Row[] }).rows.map((r) => ({ ...r, content: Number(r.content), cf: Number(r.cf), bayes: Number(r.bayes) }))

  // Combine the three signals on the same 0–1 scale
  const maxContent = Math.max(0, ...rows.map((r) => r.content))
  const maxCf = Math.max(0, ...rows.map((r) => r.cf))
  const personal = maxContent > 0 || maxCf > 0
  const scored = rows.map((r) => {
    const c = maxContent ? r.content / maxContent : 0
    const f = maxCf ? r.cf / maxCf : 0
    const p = r.bayes ? (r.bayes - 1) / 4 : 0
    return { ...r, c, f, score: personal ? 0.6 * c + 0.3 * f + 0.1 * p : p }
  })
    // weak matches are left out (a vague "maybe" is worse than no suggestion)
    .filter((r) => (personal ? r.c >= 0.15 || r.f >= 0.3 : r.bayes > 0))
    .sort((a, b) => b.score - a.score)

  // Diversity: at most 2 picks per reason (e.g. per author), then fill up with the rest
  const key = (r: (typeof ranked)[number]) => (r.f > r.c ? 'similar-readers' : r.top_f ?? 'other')
  const ranked = scored
  const picked: typeof ranked = []
  const perKey = new Map<string, number>()
  for (const r of ranked) {
    if (picked.length === limit) break
    const k = key(r)
    if ((perKey.get(k) ?? 0) < 2) { picked.push(r); perKey.set(k, (perKey.get(k) ?? 0) + 1) }
  }
  for (const r of ranked) if (picked.length < limit && !picked.includes(r)) picked.push(r)
  if (!picked.length) return []

  const found = await db.select(bookColumnsFor(user.role === 'admin', me)).from(books)
    .where(inArray(books.id, picked.map((r) => r.book_id)))
  const byId = new Map(found.map((b) => [b.id, b]))

  return picked.filter((r) => byId.has(r.book_id)).map((r) => {
    const book = byId.get(r.book_id)!
    return { book, score: Math.round(r.score * 100) / 100, reason: reasonFor(r, book) }
  })
}

/** The human sentence: the strongest NOT-too-common feature, or the collaborative signal */
function reasonFor(r: { c: number; f: number; top_f: string | null; n: number | null }, book: { author: string | null; translator: string | null; language: string | null }) {
  if (r.f > r.c && r.f > 0) return 'Readers with similar taste enjoyed it'
  const f = r.top_f ?? ''
  if (f.startsWith('author:')) return `Because you liked other books by ${book.author}`
  if (f.startsWith('translator:')) return `Translated by ${book.translator}, like books you enjoyed`
  if (f.startsWith('cat:')) return `Because you like ${f.slice(4)}`
  if (f.startsWith('lang:')) return `Because you read ${book.language} books`
  if (r.c === 0 && r.f === 0) return (r.n ?? 0) > 1 ? 'Highly rated by readers' : 'Popular in the library'
  return 'Similar to books you liked'
}

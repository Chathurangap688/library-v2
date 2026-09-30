/**
 * Lesson 2.1: SQL pieces reused by the book endpoints (list, detail, and later MCP tools).
 */
import { getTableColumns, sql, type SQL } from 'drizzle-orm'
import { books } from '../db/schema'

// Everything EXCEPT the private purchase fields (admins get those in Phase 3)
const { purchasedFrom, purchaseDate, price, notes, addedBy, ...publicBookColumns } = getTableColumns(books)
void purchasedFrom; void purchaseDate; void price; void notes; void addedBy
export { publicBookColumns }

// Calculated columns (sub-queries): one value per book row.
// Inside a sub-query we write books.id in full: a bare "id" would be read as the
// id of the inner table (categories.id) — a classic SQL scoping trap.
export const bookExtras = {
  categories: sql<string[]>`(select coalesce(array_agg(c.name order by c.name), '{}')
      from book_categories bc join categories c on c.id = bc.category_id
      where bc.book_id = books.id)`,
  available: sql<number>`(books.copies - (select count(*) from loans l
      where l.book_id = books.id and l.returned_at is null))::int`,
  avgRating: sql<number | null>`(select round(avg(r.rating), 1)::float8 from ratings r where r.book_id = books.id)`,
  ratingCount: sql<number>`(select count(*) from ratings r where r.book_id = books.id)::int`,
}

/**
 * Singlish "loose key" — the same rules as v1 (Lesson 7c), but in SQL:
 * lower-case, th→t dh→d …, v→w, drop everything that is not a–z/0–9, "aa"→"a".
 * So "Madol Doova", "madoldowa" and "MADOL-DUWA" become almost the same key.
 */
export function singlishKeySql(value: SQL | string) {
  const v = typeof value === 'string' ? sql`${value}` : value
  return sql`regexp_replace(regexp_replace(translate(
      regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
        lower(${v}), 'th', 't', 'g'), 'dh', 'd', 'g'), 'kh', 'k', 'g'), 'gh', 'g', 'g'),
        'ph', 'p', 'g'), 'bh', 'b', 'g'), 'sh', 's', 'g'), 'ch', 'c', 'g'),
      'v', 'w'), '[^a-z0-9]', '', 'g'), '(.)\\1+', '\\1', 'g')`
}

/** Same rules in TypeScript, for the search text the user typed */
export function singlishKey(text: string) {
  return text.toLowerCase()
    .replace(/th/g, 't').replace(/dh/g, 'd').replace(/kh/g, 'k').replace(/gh/g, 'g')
    .replace(/ph/g, 'p').replace(/bh/g, 'b').replace(/sh/g, 's').replace(/ch/g, 'c')
    .replace(/v/g, 'w').replace(/[^a-z0-9]/g, '').replace(/(.)\1+/g, '$1')
}

// All the text a search looks in (Sinhala and English)
export const searchText = sql`concat_ws(' ', ${books.title}, ${books.titleSinglish}, ${books.author},
  ${books.authorSinglish}, ${books.translator}, ${books.originalTitle}, ${books.originalAuthor},
  ${books.publisher}, ${books.isbn})`

// The Latin-letter fields, for the loose Singlish match
export const searchLatin = sql`concat_ws(' ', ${books.titleSinglish}, ${books.authorSinglish},
  ${books.originalTitle}, ${books.originalAuthor}, ${books.title}, ${books.author})`

// Lesson 3.3: the private fields — added to the SELECT only when an admin asks
export const adminBookColumns = {
  purchasedFrom: books.purchasedFrom,
  purchaseDate: books.purchaseDate,
  price: books.price,
  notes: books.notes,
  addedByName: sql<string | null>`(select coalesce(u.name, u.email) from users u where u.id = books.added_by)`,
}

/** Which columns this user may see */
export const bookColumnsFor = (isAdmin: boolean) =>
  isAdmin ? { ...publicBookColumns, ...bookExtras, ...adminBookColumns } : { ...publicBookColumns, ...bookExtras }

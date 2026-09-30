/**
 * Lesson 1.3 — copy the Google Sheet (downloaded as .xlsx) into Neon.
 *
 *   npm run db:import                 → DRY RUN: does everything, then ROLLBACK (nothing saved)
 *   npm run db:import -- --commit     → really saves (replaces ALL data in the new tables)
 *
 * Everything happens in ONE transaction: either every row is imported, or none.
 * Safe to run again later — it empties the tables first and loads a fresh copy.
 */
import ExcelJS from 'exceljs'
import pg from 'pg'

const FILE = process.argv.find((a) => a.endsWith('.xlsx')) ?? '../../data/library-export.xlsx'
const COMMIT = process.argv.includes('--commit')

try { process.loadEnvFile('.dev.vars') } catch { /* DATABASE_URL may already be set */ }
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing (put it in apps/api/.dev.vars)')

type Row = Record<string, unknown>
const warnings: string[] = []
const warn = (msg: string) => warnings.push(msg)

// ---------- reading the workbook ----------
/** A cell can be text, a number, a Date, a formula result or rich text → plain value */
function plain(v: unknown): unknown {
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] }
    if ('result' in o) return plain(o.result)
    if (o.richText) return o.richText.map((p) => p.text).join('')
    if ('text' in o) return plain(o.text)
  }
  return v
}

async function readSheets(file: string) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file)
  const sheets: Record<string, Row[]> = {}
  wb.eachSheet((ws) => {
    const headers = (ws.getRow(1).values as unknown[]).map((h) => String(plain(h) ?? '').trim())
    const rows: Row[] = []
    ws.eachRow((row, n) => {
      if (n === 1) return
      const obj: Row = {}
      ;(row.values as unknown[]).forEach((v, i) => { if (headers[i]) obj[headers[i]] = plain(v) })
      if (Object.values(obj).some((v) => v !== null && v !== undefined && v !== '')) rows.push(obj)
    })
    sheets[ws.name] = rows
  })
  return sheets
}

// ---------- cleaning helpers ----------
const text = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v).trim(); return s === '' ? null : s }
const email = (v: unknown) => text(v)?.toLowerCase() ?? null
const bool = (v: unknown) => v === true || ['true', 'yes', '1'].includes(String(v).trim().toLowerCase())
function int(v: unknown, what: string) {
  const s = text(v); if (s === null) return null
  const m = s.match(/\d{1,4}/)
  if (!m) { warn(`${what}: "${s}" is not a number → left empty`); return null }
  if (m[0] !== s) warn(`${what}: "${s}" stored as ${m[0]}`)
  return Number(m[0])
}
function when(v: unknown, what: string) {
  if (v === null || v === undefined || v === '') return null
  const d = v instanceof Date ? v : new Date(String(v))
  if (isNaN(d.getTime())) { warn(`${what}: "${v}" is not a date → left empty`); return null }
  return d
}
function json(v: unknown, what: string) {
  const s = text(v); if (s === null) return null
  // Parse to check it is valid, then send it as JSON TEXT (pg would turn a JS array into a Postgres array)
  try { return JSON.stringify(JSON.parse(s)) } catch { warn(`${what}: webSources is not valid JSON → left empty`); return null }
}

// ---------- the import ----------
async function main() {
  const s = await readSheets(FILE)
  for (const name of ['Books', 'Users', 'Reading', 'Ratings', 'Loans']) {
    if (!s[name]) throw new Error(`Sheet "${name}" not found in ${FILE}`)
  }

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  const q = (sql: string, params: unknown[] = []) => client.query(sql, params)

  try {
    await q('begin')
    // Empty the new tables (children first is handled by CASCADE)
    await q(`truncate loans, ratings, reading_status, book_categories, books, categories, users
             restart identity cascade`)

    // 1. users — email → new uuid
    const userId = new Map<string, string>()
    for (const u of s.Users) {
      const e = email(u.email); if (!e) { warn('Users: a row without email was skipped'); continue }
      const role = text(u.role) === 'admin' ? 'admin' : 'user'
      const status = text(u.status) === 'pending' ? 'pending' : 'active'
      const r = await q(`insert into users (email, name, picture, role, status, created_at, last_login_at)
                         values ($1,$2,$3,$4,$5, coalesce($6, now()), $7) returning id`,
        [e, text(u.name), text(u.picture), role, status, when(u.createdAt, `User ${e}`), when(u.lastLogin, `User ${e}`)])
      userId.set(e, r.rows[0].id)
    }
    /** An email used in another sheet but missing from Users → create it (pending) so nothing is lost */
    async function userFor(v: unknown, where: string) {
      const e = email(v); if (!e) return null
      if (!userId.has(e)) {
        warn(`${where}: ${e} is not in Users → added as a pending user`)
        const r = await q(`insert into users (email, status) values ($1, 'pending') returning id`, [e])
        userId.set(e, r.rows[0].id)
      }
      return userId.get(e)!
    }

    // 2. categories — every name used by any book
    const categoryId = new Map<string, number>()
    const names = new Set(s.Books.flatMap((b) => String(b.categories ?? '').split(',').map((c) => c.trim()).filter(Boolean)))
    for (const name of [...names].sort()) {
      const r = await q('insert into categories (name) values ($1) returning id', [name])
      categoryId.set(name, r.rows[0].id)
    }

    // 3. books — old id ("bdcc45c6f") → new uuid
    const bookId = new Map<string, string>()
    const seenIsbn = new Set<string>()
    for (const b of s.Books) {
      const old = text(b.id), title = text(b.title)
      if (!old || !title) { warn('Books: a row without id or title was skipped'); continue }
      const label = `Book "${title}"`
      let isbn = text(b.isbn)?.replace(/[^0-9Xx]/g, '') || null
      if (isbn && seenIsbn.has(isbn)) { warn(`${label}: ISBN ${isbn} used twice → cleared on this row`); isbn = null }
      if (isbn) seenIsbn.add(isbn)
      const copies = Math.max(1, int(b.copies, label) ?? 1)
      const price = text(b.price)?.replace(/[^0-9.]/g, '') || null
      const r = await q(`insert into books (title, title_singlish, author, author_singlish, language, is_translation,
          translator, original_title, original_author, isbn, publisher, year, description, review_summary, web_sources,
          cover_url, copies, shelf, purchased_from, purchase_date, price, notes, added_by, created_at, updated_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
                coalesce($24, now()), coalesce($25, now())) returning id`,
        [title, text(b.titleSinglish), text(b.author), text(b.authorSinglish), text(b.language), bool(b.isTranslation),
          text(b.translator), text(b.originalTitle), text(b.originalAuthor), isbn, text(b.publisher),
          int(b.year, label), text(b.description), text(b.reviewSummary), json(b.webSources, label),
          text(b.coverUrl), copies, text(b.shelf), text(b.purchasedFrom), when(b.purchaseDate, label), price,
          text(b.notes), await userFor(b.addedBy, label), when(b.addedAt, label), when(b.updatedAt, label)])
      const id = r.rows[0].id as string
      bookId.set(old, id)
      for (const c of String(b.categories ?? '').split(',').map((x) => x.trim()).filter(Boolean)) {
        await q('insert into book_categories (book_id, category_id) values ($1,$2) on conflict do nothing', [id, categoryId.get(c)])
      }
    }
    const book = (v: unknown, where: string) => {
      const id = bookId.get(String(v ?? '').trim())
      if (!id) warn(`${where}: unknown book id "${v}" → row skipped`)
      return id
    }

    // 4. reading status
    let reading = 0
    for (const r of s.Reading) {
      const b = book(r.bookId, 'Reading'); const u = await userFor(r.email, 'Reading'); if (!b || !u) continue
      const st = ['to_read', 'reading', 'read'].includes(String(r.status)) ? String(r.status) : 'to_read'
      await q(`insert into reading_status (user_id, book_id, status, updated_at) values ($1,$2,$3, coalesce($4, now()))
               on conflict (user_id, book_id) do update set status = excluded.status`, [u, b, st, when(r.updatedAt, 'Reading')])
      reading++
    }

    // 5. ratings (only 1–5)
    let rated = 0
    for (const r of s.Ratings) {
      const b = book(r.bookId, 'Ratings'); const u = await userFor(r.email, 'Ratings'); if (!b || !u) continue
      const n = Math.round(Number(r.rating))
      if (!(n >= 1 && n <= 5)) { warn(`Ratings: rating "${r.rating}" is not 1–5 → skipped`); continue }
      const t = when(r.updatedAt, 'Ratings')
      await q(`insert into ratings (user_id, book_id, rating, review, created_at, updated_at)
               values ($1,$2,$3,$4, coalesce($5, now()), coalesce($5, now()))
               on conflict (user_id, book_id) do update set rating = excluded.rating, review = excluded.review`,
        [u, b, n, text(r.review), t])
      rated++
    }

    // 6. loans (returnedAt empty = still out)
    let lent = 0
    for (const l of s.Loans) {
      const b = book(l.bookId, 'Loans'); const u = await userFor(l.email, 'Loans'); if (!b || !u) continue
      await q(`insert into loans (book_id, user_id, borrowed_at, returned_at, lent_by, returned_by)
               values ($1,$2, coalesce($3, now()), $4, $5, $6)`,
        [b, u, when(l.borrowedAt, 'Loans'), when(l.returnedAt, 'Loans'),
          await userFor(l.assignedBy, 'Loans'), await userFor(l.returnedBy, 'Loans')])
      lent++
    }

    // Lesson 4.5: the on_loan counter = number of open loans per book
    await q(`update books set on_loan = (select count(*) from loans l where l.book_id = books.id and l.returned_at is null)`)

    // Sanity check straight from the database
    const check = await q(`select
        (select count(*) from users)::int users, (select count(*) from books)::int books,
        (select count(*) from categories)::int categories, (select count(*) from book_categories)::int book_categories,
        (select count(*) from reading_status)::int reading, (select count(*) from ratings)::int ratings,
        (select count(*) from loans where returned_at is null)::int open_loans`)
    console.log('\nIn the database now:', check.rows[0])
    console.log(`From the sheets:      users ${s.Users.length}, books ${s.Books.length}, reading ${reading}/${s.Reading.length}, ratings ${rated}/${s.Ratings.length}, loans ${lent}/${s.Loans.length}`)
    console.log('Skipped on purpose:   Sessions (' + (s.Sessions?.length ?? 0) + ' rows) — everyone signs in again via Asgardeo')
    if (warnings.length) console.log('\nWarnings:\n - ' + warnings.join('\n - '))

    if (COMMIT) { await q('commit'); console.log('\n✅ Imported and SAVED.') }
    else { await q('rollback'); console.log('\n🧪 Dry run only — nothing was saved. Run again with --commit to save.') }
  } catch (err) {
    await q('rollback')
    console.error('\n❌ Import failed, nothing was saved:', err)
    process.exitCode = 1
  } finally {
    await client.end()
  }
}

main()

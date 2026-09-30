/** Lesson 2.3: one book — /books/:id (the id comes from the URL) */
import { Link, useNavigate, useParams } from 'react-router'
import { useBook } from '../api/hooks'
import { Cover } from '../components/Cover'
import { Stars } from '../components/Stars'
import { MyReading } from '../components/MyReading'
import { LendingBox, MyLoanNote } from '../components/LendingBox'

export function BookPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data: book, isPending, isError, error } = useBook(id)

  if (isPending) return <p className="muted">Loading…</p>
  if (isError) return <div className="empty"><p className="bad">{error.message}</p><Link to="/">← Back to the catalogue</Link></div>

  const facts: [string, string | number | null][] = [
    ['Author', book.author], ['Language', book.language], ['Translator', book.translator],
    ['Original title', book.originalTitle], ['Original author', book.originalAuthor],
    ['Publisher', book.publisher], ['Year', book.year], ['ISBN', book.isbn], ['Shelf', book.shelf],
  ]

  return (
    <article className="book-page">
      {/* Back = the previous page (keeps your search), or the catalogue if opened directly */}
      <div className="page-actions">
        <button type="button" className="link back" onClick={() => (history.length > 1 ? navigate(-1) : navigate('/'))}>← Back</button>
        {/* Lesson 4.3: only admins get the private fields — so their presence means "admin" */}
        {'price' in book && <Link className="btn-small" to={`/books/${book.id}/edit`}>✎ Edit book</Link>}
      </div>

      <div className="book-page-grid">
        <Cover url={book.coverUrl} title={book.title} large />
        <div>
          <h1>{book.title}</h1>
          {book.titleSinglish && <p className="muted">{book.titleSinglish}</p>}
          <p><Stars value={book.avgRating} count={book.ratingCount} /></p>
          <p className={book.available > 0 ? 'good' : 'bad'}>
            {book.available > 0 ? `✓ Available (${book.available} of ${book.copies})` : '✗ All copies are on loan'}
          </p>
          <MyLoanNote book={book} />
          <div className="chips">
            {book.categories.map((c) => <Link key={c} className="chip" to={`/?category=${encodeURIComponent(c)}`}>{c}</Link>)}
            {book.isTranslation && <span className="chip chip-tr">Translation</span>}
          </div>
          <dl className="facts">
            {facts.filter(([, v]) => v !== null && v !== '').map(([k, v]) => (
              <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
        </div>
      </div>

      {/* key: start the form fresh when a DIFFERENT book is shown (not after my own save) */}
      <MyReading key={book.id} book={book} />

      {/* Lesson 4.5: only admins receive openLoans */}
      {book.openLoans && <LendingBox book={book} />}

      {/* Lesson 3.3: the API only sends these fields to admins */}
      {'price' in book && (
        <section className="admin-box">
          <h2>Purchase details <span className="role-chip">Admin</span></h2>
          <dl className="facts">
            <div><dt>Bought from</dt><dd>{book.purchasedFrom ?? '—'}</dd></div>
            <div><dt>Purchase date</dt><dd>{book.purchaseDate ?? '—'}</dd></div>
            <div><dt>Price</dt><dd>{book.price ? `LKR ${Number(book.price).toLocaleString()}` : '—'}</dd></div>
            <div><dt>Added by</dt><dd>{book.addedByName ?? '—'}</dd></div>
            {book.notes && <div><dt>Notes</dt><dd>{book.notes}</dd></div>}
          </dl>
        </section>
      )}

      {book.description && <section><h2>About this book</h2><p className="prose">{book.description}</p></section>}
      {book.reviewSummary && <section><h2>What readers say</h2><p className="prose">{book.reviewSummary}</p></section>}

      <section>
        <h2>Ratings ({book.ratings.length})</h2>
        {book.ratings.length === 0 && <p className="muted">Nobody has rated this book yet.</p>}
        <ul className="ratings">
          {book.ratings.map((r, i) => (
            <li key={i}>
              <Stars value={r.rating} /> <strong>{r.name ?? 'A reader'}</strong>
              <span className="muted small"> · {new Date(r.updatedAt).toLocaleDateString()}</span>
              {r.review && <p>{r.review}</p>}
            </li>
          ))}
        </ul>
      </section>

      {book.webSources && book.webSources.length > 0 && (
        <section>
          <h2>Sources</h2>
          <ul className="sources">
            {book.webSources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>)}
          </ul>
        </section>
      )}
    </article>
  )
}

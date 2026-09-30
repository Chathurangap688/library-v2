/** Lesson 4.1: /my-books — my shelves as tabs (?shelf=read), reusing the same book grid */
import { useSearchParams } from 'react-router'
import { useBooks, useShelves, type ReadingState } from '../api/hooks'
import { BookCard } from '../components/BookCard'
import { Pagination } from '../components/Pagination'
import { SHELF_LABELS } from '../components/shelves'

type Tab = ReadingState | 'rated'
const TABS: Tab[] = ['reading', 'to_read', 'read', 'rated']
const label = (t: Tab) => (t === 'rated' ? 'My ratings' : SHELF_LABELS[t])

export function MyBooksPage() {
  const [params, setParams] = useSearchParams()
  const shelf = (TABS.includes(params.get('shelf') as Tab) ? params.get('shelf') : 'reading') as Tab
  const page = Number(params.get('page')) || 1
  const counts = useShelves()
  const books = useBooks({ shelf, page, pageSize: 24, sort: shelf === 'rated' ? 'rating' : 'title' })

  return (
    <section>
      <h1>My books</h1>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={t === shelf} onClick={() => setParams({ shelf: t })}>
            {label(t)} <span className="muted">{counts.data ? counts.data[t] : ''}</span>
          </button>
        ))}
      </div>
      {books.isError && <p className="bad">{books.error.message}</p>}
      {books.data && books.data.items.length === 0 && <div className="empty muted">Nothing here yet. Open a book and use “My reading”.</div>}
      <div className="grid">{books.data?.items.map((b) => <BookCard key={b.id} book={b} />)}</div>
      {books.data && <Pagination page={books.data.page} pages={books.data.pages} onChange={(p) => setParams({ shelf, page: String(p) })} />}
    </section>
  )
}

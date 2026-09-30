/** Lesson 4.1: /my-books — my shelves as tabs (?shelf=read), reusing the same book grid */
import { useSearchParams } from 'react-router'
import { useInfiniteBooks, useMyLoans, useShelves, type ReadingState } from '../api/hooks'
import { BookCard } from '../components/BookCard'
import { LoadMore } from '../components/LoadMore'
import { SHELF_LABELS } from '../components/shelves'

type Tab = ReadingState | 'rated' | 'borrowed'
const TABS: Tab[] = ['reading', 'to_read', 'read', 'rated', 'borrowed']
const label = (t: Tab) => (t === 'rated' ? 'My ratings' : t === 'borrowed' ? 'Borrowed' : SHELF_LABELS[t])

export function MyBooksPage() {
  const [params, setParams] = useSearchParams()
  const shelf = (TABS.includes(params.get('shelf') as Tab) ? params.get('shelf') : 'reading') as Tab
  const counts = useShelves()
  const myLoans = useMyLoans()                           // Lesson 4.5: the "Borrowed" count
  const books = useInfiniteBooks({ shelf, pageSize: 24, sort: shelf === 'rated' ? 'rating' : 'title' })
  const items = books.data?.pages.flatMap((p) => p.items) ?? []
  const total = books.data?.pages[0]?.total ?? 0

  return (
    <section>
      <h1>My books</h1>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={t === shelf} onClick={() => setParams({ shelf: t })}>
            {label(t)} <span className="muted">{t === 'borrowed' ? myLoans.data?.open.length ?? '' : counts.data ? counts.data[t] : ''}</span>
          </button>
        ))}
      </div>
      {books.isError && <p className="bad">{books.error.message}</p>}
      {books.data && !books.isPlaceholderData && total === 0 && <div className="empty muted">Nothing here yet. Open a book and use “My reading”.</div>}
      <div className={'grid' + (books.isPlaceholderData ? ' is-fetching' : '')}>{items.map((b) => <BookCard key={b.id} book={b} />)}</div>
      {books.data && !books.isPlaceholderData && (
        <LoadMore hasMore={books.hasNextPage} loading={books.isFetchingNextPage} shown={items.length} total={total}
          onMore={() => books.fetchNextPage({ cancelRefetch: false })} />
      )}
    </section>
  )
}

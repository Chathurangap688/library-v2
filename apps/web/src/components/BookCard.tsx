import { Link } from 'react-router'
import type { Book } from '../api/client'
import { Cover } from './Cover'
import { Stars } from './Stars'
import { SHELF_LABELS } from './shelves'

export function BookCard({ book }: { book: Book }) {
  const out = book.available <= 0
  return (
    <Link to={`/books/${book.id}`} className={'book-card' + (out ? ' is-out' : '')}>
      <div className="book-cover-wrap">
        <Cover url={book.coverUrl} title={book.title} />
        {out && <span className="badge badge-out">On loan</span>}
        {book.isTranslation && <span className="badge badge-tr">Translation</span>}
        {book.myStatus && <span className={`badge badge-me badge-${book.myStatus}`}>{book.myStatus === 'read' ? '✓ ' : ''}{SHELF_LABELS[book.myStatus]}</span>}
      </div>
      <div className="book-body">
        <h3 className="book-title">{book.title}</h3>
        {book.titleSinglish && <p className="muted small">{book.titleSinglish}</p>}
        <p className="book-author">{book.author ?? 'Unknown author'}</p>
        <Stars value={book.avgRating} count={book.ratingCount} />
        {book.myRating && <span className="muted small">You: {'★'.repeat(book.myRating)}</span>}
      </div>
    </Link>
  )
}

/**
 * Lesson 4.1: "My reading" box on the book page — my shelf + my rating and review.
 * Controlled inputs: React state holds what I am typing; nothing is sent until "Save".
 */
import { useState } from 'react'
import type { BookDetail } from '../api/client'
import { useDeleteRating, useSetRating, useSetStatus } from '../api/hooks'
import { SHELF_LABELS, SHELVES } from './shelves'

export function MyReading({ book }: { book: BookDetail }) {
  const setStatus = useSetStatus()
  const setRating = useSetRating()
  const deleteRating = useDeleteRating()
  const [stars, setStars] = useState<number>(book.myRating ?? 0)
  const [hover, setHover] = useState(0)
  const [review, setReview] = useState(book.myReview ?? '')
  const [saved, setSaved] = useState<string | null>(null)

  const error = setStatus.error ?? setRating.error ?? deleteRating.error
  const busy = setStatus.isPending || setRating.isPending || deleteRating.isPending
  const dirty = stars !== (book.myRating ?? 0) || review.trim() !== (book.myReview ?? '')

  return (
    <section className="my-reading" aria-label="My reading">
      <h2>My reading</h2>
      <div className="segmented" role="group" aria-label="My shelf">
        {SHELVES.map((s) => (
          <button key={s} type="button" aria-pressed={book.myStatus === s} disabled={busy}
            onClick={() => setStatus.mutate({ id: book.id, status: book.myStatus === s ? null : s })}>
            {book.myStatus === s ? '✓ ' : ''}{SHELF_LABELS[s]}
          </button>
        ))}
      </div>
      <p className="muted small">{book.myStatus ? 'Click again to take it off your shelves.' : 'Not on your shelves yet.'}</p>

      <div className="rate">
        <span className="rate-label">My rating</span>
        <span className="star-input" onMouseLeave={() => setHover(0)} role="radiogroup" aria-label="My rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n} star${n > 1 ? 's' : ''}`}
              className={(hover || stars) >= n ? 'on' : ''} onMouseEnter={() => setHover(n)} onClick={() => setStars(n)}>★</button>
          ))}
        </span>
      </div>
      <textarea value={review} onChange={(e) => setReview(e.target.value)} maxLength={2000} rows={3}
        placeholder="A few words about the book (optional, visible to other readers)" aria-label="My review" />
      <div className="rate-actions">
        <button type="button" className="btn-small primary" disabled={!stars || !dirty || busy}
          onClick={() => setRating.mutate({ id: book.id, rating: stars, review: review.trim() || null }, { onSuccess: () => setSaved('Rating saved — the book is on your "Read" shelf') })}>
          {book.myRating ? 'Update rating' : 'Save rating'}
        </button>
        {book.myRating !== null && (
          <button type="button" className="btn-small" disabled={busy}
            onClick={() => deleteRating.mutate(book.id, { onSuccess: () => { setStars(0); setReview(''); setSaved('Rating removed') } })}>Remove my rating</button>
        )}
        {saved && !dirty && <span className="good small" role="status">{saved}</span>}
        {error && <span className="bad small" role="alert">{error.message}</span>}
      </div>
    </section>
  )
}

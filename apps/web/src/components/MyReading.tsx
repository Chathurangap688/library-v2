/**
 * Lesson 4.1: "My reading" box on the book page — my shelf + my rating and review.
 * Clicking a star SAVES right away (with whatever review is typed). The review text still has
 * its own "Save review" button: saving on every key press would spam the API and other readers.
 * The stars change on screen immediately ("optimistic"); if the save fails they jump back.
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
  const reviewDirty = review.trim() !== (book.myReview ?? '')

  function save(rating: number, message: string) {
    setRating.mutate({ id: book.id, rating, review: review.trim() || null }, {
      onSuccess: () => setSaved(message),
      onError: () => setStars(book.myRating ?? 0),       // undo the optimistic stars
    })
  }
  function rate(n: number) {
    if (n === stars && !reviewDirty) return             // same star again: nothing to save
    setStars(n); setSaved(null)
    save(n, book.myRating ? `Rating updated to ${n}★` : `Rated ${n}★ — the book is on your "Read" shelf`)
  }

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
              className={(hover || stars) >= n ? 'on' : ''} onMouseEnter={() => setHover(n)} onClick={() => rate(n)}>★</button>
          ))}
        </span>
        {setRating.isPending && <span className="muted small">Saving…</span>}
      </div>
      <textarea value={review} onChange={(e) => setReview(e.target.value)} maxLength={2000} rows={3}
        placeholder="A few words about the book (optional, visible to other readers)" aria-label="My review" />
      <div className="rate-actions">
        {reviewDirty && (
          <button type="button" className="btn-small primary" disabled={!stars || busy} title={stars ? '' : 'Pick the stars first'}
            onClick={() => save(stars, 'Review saved')}>
            {stars ? 'Save review' : 'Pick stars to save'}
          </button>
        )}
        {book.myRating !== null && (
          <button type="button" className="btn-small" disabled={busy}
            onClick={() => deleteRating.mutate(book.id, { onSuccess: () => { setStars(0); setReview(''); setSaved('Rating removed') } })}>Remove my rating</button>
        )}
        {saved && !reviewDirty && !busy && <span className="good small" role="status">{saved}</span>}
        {error && <span className="bad small" role="alert">{error.message}</span>}
      </div>
    </section>
  )
}

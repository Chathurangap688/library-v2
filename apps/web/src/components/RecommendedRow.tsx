/** Lesson 4.2: a horizontal row of suggestions, each card with its reason underneath */
import { useRecommendations } from '../api/hooks'
import { BookCard } from './BookCard'

export function RecommendedRow() {
  const recs = useRecommendations(8)
  if (recs.isPending || recs.isError || recs.data.length === 0) return null   // nice to have: never block the page
  return (
    <section className="recs" aria-label="Recommended for you">
      <h2>Recommended for you</h2>
      <div className="recs-row">
        {recs.data.map((r) => (
          <div key={r.book.id} className="rec">
            <BookCard book={r.book} />
            <p className="rec-reason">{r.reason}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

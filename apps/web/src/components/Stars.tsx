// Lesson 2.3: a tiny presentational component — props in, markup out.
export function Stars({ value, count }: { value: number | null; count?: number }) {
  if (value === null) return <span className="stars muted">No ratings yet</span>
  const full = Math.round(value)
  return (
    <span className="stars" aria-label={`${value} out of 5`}>
      {'★'.repeat(full)}<span className="muted">{'★'.repeat(5 - full)}</span>
      <span className="muted small"> {value.toFixed(1)}{count !== undefined ? ` (${count})` : ''}</span>
    </span>
  )
}

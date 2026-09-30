/**
 * Infinite scroll trigger. An invisible "sentinel" sits under the grid; when it comes within
 * 600px of the screen, IntersectionObserver tells us and we fetch the next page — before the
 * reader actually reaches the bottom, so the scroll feels continuous.
 * (IntersectionObserver is better than listening to every "scroll" event: the browser does the
 *  geometry off the main thread and only calls us when the visibility changes.)
 * The button stays as a fallback: keyboard users, and screens so tall the sentinel never leaves view.
 */
import { useEffect, useRef } from 'react'

type Props = { hasMore: boolean; loading: boolean; onMore: () => void; shown: number; total: number }

export function LoadMore({ hasMore, loading, onMore, shown, total }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  // keep the latest props in a ref, so the observer is created once and never sees stale values
  const latest = useRef({ hasMore, loading, onMore })
  useEffect(() => { latest.current = { hasMore, loading, onMore } })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver((entries) => {
      const { hasMore, loading, onMore } = latest.current
      if (entries[0].isIntersecting && hasMore && !loading) onMore()
    }, { rootMargin: '600px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // After a page arrives the sentinel may STILL be in view (big screen): the observer won't fire
  // again because nothing "changed", so check once more whenever loading finishes.
  useEffect(() => {
    const el = ref.current
    if (!el || loading || !hasMore) return
    if (el.getBoundingClientRect().top < window.innerHeight + 600) latest.current.onMore()
  }, [loading, hasMore])

  if (total === 0) return null
  return (
    <div ref={ref} className="load-more" aria-live="polite">
      {hasMore
        ? <button type="button" onClick={onMore} disabled={loading}>{loading ? 'Loading more…' : 'Load more'}</button>
        : <span className="muted small">That's all — {total} book{total === 1 ? '' : 's'}</span>}
      {hasMore && <span className="muted small">Showing {shown} of {total}</span>}
    </div>
  )
}

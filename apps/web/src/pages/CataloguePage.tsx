/**
 * Lesson 2.3: the catalogue. All filters live in the URL (?q=madol&category=War&page=2),
 * so a search can be bookmarked, shared, and survives a page reload or the Back button.
 */
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useBooks, useCategories, useLanguages, type BookFilters } from '../api/hooks'
import { BookCard } from '../components/BookCard'
import { Pagination } from '../components/Pagination'
import { RecommendedRow } from '../components/RecommendedRow'

const SORTS = [
  { value: 'title', label: 'Title A–Z' },
  { value: 'newest', label: 'Newest added' },
  { value: 'rating', label: 'Top rated' },
] as const

export function CataloguePage() {
  const [params, setParams] = useSearchParams()

  // Read the filters from the URL
  const filters: BookFilters = {
    q: params.get('q') || undefined,
    language: params.get('language') || undefined,
    category: params.getAll('category'),
    translations: params.get('translations') === 'true' ? 'true' : undefined,
    available: params.get('available') === 'true' ? 'true' : undefined,
    hideRead: params.get('hideRead') === 'true' ? 'true' : undefined,     // Lesson 4.1
    sort: (params.get('sort') as BookFilters['sort']) || 'title',
    page: Number(params.get('page')) || 1,
    pageSize: 24,
  }
  const picked = filters.category as string[]

  /** Change one filter in the URL; any filter change starts again at page 1 */
  function update(key: string, value: string | string[] | undefined, keepPage = false) {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete(key)
      for (const v of Array.isArray(value) ? value : value ? [value] : []) next.append(key, v)
      if (!keepPage) next.delete('page')
      return next
    }, { replace: key === 'q' })              // typing should not fill the Back-button history
  }

  // Search box: wait 300 ms after the last key press before asking the server ("debounce").
  // (No dependency list on purpose: every render restarts the timer; it only acts when the
  //  typed text differs from the URL.)
  const [text, setText] = useState(filters.q ?? '')
  useEffect(() => {
    const t = setTimeout(() => { if (text.trim() !== (filters.q ?? '')) update('q', text.trim() || undefined) }, 300)
    return () => clearTimeout(t)
  })

  const books = useBooks(filters)
  const categories = useCategories()
  const languages = useLanguages()

  const toggleCategory = (name: string) =>
    update('category', picked.includes(name) ? picked.filter((c) => c !== name) : [...picked, name])

  const anyFilter = params.toString() !== '' && !(params.size === 1 && params.has('page'))

  return (
    <>
      <section className="toolbar" aria-label="Search and filters">
        <input className="search" type="search" placeholder="Search title, author… (සිංහල / Singlish)"
          value={text} onChange={(e) => setText(e.target.value)} aria-label="Search" />

        <select value={filters.language ?? ''} onChange={(e) => update('language', e.target.value || undefined)} aria-label="Language">
          <option value="">All languages</option>
          {languages.data?.map((l) => l.language && <option key={l.language} value={l.language}>{l.language} ({l.bookCount})</option>)}
        </select>

        <details className="multi">
          <summary>{picked.length ? `Categories (${picked.length})` : 'All categories'}</summary>
          <div className="multi-list">
            {categories.data?.map((c) => (
              <label key={c.id}>
                <input type="checkbox" checked={picked.includes(c.name)} onChange={() => toggleCategory(c.name)} />
                {c.name} <span className="muted">({c.bookCount})</span>
              </label>
            ))}
          </div>
        </details>

        <select value={filters.sort} onChange={(e) => update('sort', e.target.value === 'title' ? undefined : e.target.value)} aria-label="Sort">
          {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>

        <label className="check">
          <input type="checkbox" checked={filters.translations === 'true'}
            onChange={(e) => update('translations', e.target.checked ? 'true' : undefined)} /> Translations
        </label>
        <label className="check">
          <input type="checkbox" checked={filters.available === 'true'}
            onChange={(e) => update('available', e.target.checked ? 'true' : undefined)} /> Available now
        </label>
        <label className="check">
          <input type="checkbox" checked={filters.hideRead === 'true'}
            onChange={(e) => update('hideRead', e.target.checked ? 'true' : undefined)} /> Hide books I've read
        </label>
        {anyFilter && <button type="button" className="link" onClick={() => { setText(''); setParams({}) }}>Clear all</button>}
      </section>

      {/* Lesson 4.2: suggestions on the plain first page only (not while searching or filtering) */}
      {!anyFilter && <RecommendedRow />}

      <p className="muted count" aria-live="polite">
        {books.isPending ? 'Loading books…'
          : books.isError ? '' : `${books.data.total} book${books.data.total === 1 ? '' : 's'}`}
        {books.isFetching && !books.isPending ? ' · updating…' : ''}
      </p>

      {books.isError && <p className="bad">Could not load books: {books.error.message}</p>}

      {books.data && books.data.items.length === 0 && (
        <div className="empty">No books match. <button type="button" className="link" onClick={() => { setText(''); setParams({}) }}>Clear the filters</button></div>
      )}

      <div className={'grid' + (books.isFetching ? ' is-fetching' : '')}>
        {books.data?.items.map((b) => <BookCard key={b.id} book={b} />)}
      </div>

      {books.data && (
        <Pagination page={books.data.page} pages={books.data.pages}
          onChange={(p) => { update('page', p === 1 ? undefined : String(p), true); window.scrollTo({ top: 0 }) }} />
      )}
    </>
  )
}

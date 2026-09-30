/**
 * Lesson 4.3: add a book (/admin/books/new) or edit one (/books/:id/edit) — admins only.
 * One form, two modes. The API checks everything again; this form just helps:
 *   · field errors from the API (400) appear under the right field
 *   · possible duplicates show while you type (same ISBN, or same title + author)
 *   · Singlish title/author are filled in by the server when you leave them empty
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import type { BookDetail, BookInput } from '../api/client'
import { ApiError, useAddCopy, useBook, useCategories, useDeleteBook, useDuplicates, useLanguages, useSaveBook } from '../api/hooks'

type Form = Record<string, string | boolean | string[]>
const TEXT_FIELDS = ['title', 'titleSinglish', 'author', 'authorSinglish', 'language', 'translator', 'originalTitle', 'originalAuthor',
  'isbn', 'publisher', 'year', 'copies', 'shelf', 'coverUrl', 'description', 'reviewSummary', 'purchasedFrom', 'purchaseDate', 'price', 'notes'] as const

function toForm(b?: BookDetail): Form {
  const f: Form = { isTranslation: b?.isTranslation ?? false, categories: b?.categories ?? [] }
  for (const k of TEXT_FIELDS) {
    const v = (b as Record<string, unknown> | undefined)?.[k]
    f[k] = v === null || v === undefined ? '' : String(v)
  }
  if (!b) { f.copies = '1'; f.language = 'Sinhala' }
  return f
}

/** Form strings → the API's types ('' = empty; numbers as numbers) */
function toInput(f: Form, editing: boolean): BookInput {
  const s = (k: string) => (f[k] as string).trim()
  const orNull = (k: string) => s(k) || null
  return {
    title: s('title'), titleSinglish: orNull('titleSinglish'), author: orNull('author'), authorSinglish: orNull('authorSinglish'),
    language: orNull('language'), isTranslation: f.isTranslation as boolean,
    translator: f.isTranslation ? orNull('translator') : null, originalTitle: f.isTranslation ? orNull('originalTitle') : null,
    originalAuthor: f.isTranslation ? orNull('originalAuthor') : null,
    isbn: orNull('isbn'), publisher: orNull('publisher'), year: s('year') ? Number(s('year')) : null,
    copies: s('copies') ? Number(s('copies')) : editing ? undefined : 1, shelf: orNull('shelf'), coverUrl: orNull('coverUrl'),
    description: orNull('description'), reviewSummary: orNull('reviewSummary'),
    categories: f.categories as string[],
    purchasedFrom: orNull('purchasedFrom'), purchaseDate: orNull('purchaseDate'), price: orNull('price'), notes: orNull('notes'),
  }
}

export function BookFormPage() {
  const { id } = useParams()
  const editing = Boolean(id)
  const existing = useBook(id ?? '', editing)
  if (editing && existing.isPending) return <p className="muted">Loading…</p>
  if (editing && existing.isError) return <p className="bad">{existing.error.message}</p>
  return <BookForm key={id ?? 'new'} book={existing.data} />
}

function BookForm({ book }: { book?: BookDetail }) {
  const navigate = useNavigate()
  const save = useSaveBook(); const addCopy = useAddCopy(); const del = useDeleteBook()
  const categories = useCategories(); const languages = useLanguages()
  const [form, setForm] = useState<Form>(() => toForm(book))
  const [newCat, setNewCat] = useState('')
  const [fixed, setFixed] = useState<Set<string>>(new Set())      // fields edited since the last failed save
  const set = (k: string, v: string | boolean | string[]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setFixed((prev) => new Set(prev).add(k))                       // hide that field's old error while typing
  }

  // Ask about duplicates 500 ms after typing stops (only the fields that matter)
  const [dupQuery, setDupQuery] = useState({})
  useEffect(() => {
    const t = setTimeout(() => setDupQuery({ title: (form.title as string).trim() || undefined, author: (form.author as string).trim() || undefined,
      isbn: (form.isbn as string).trim() || undefined, excludeId: book?.id }), 500)
    return () => clearTimeout(t)
  }, [form.title, form.author, form.isbn, book?.id])
  const dups = useDuplicates(dupQuery)

  const err = save.error instanceof ApiError ? save.error : null
  const fieldError = (k: string) => (fixed.has(k) ? undefined : err?.errors.find((e) => e.field === k)?.message)
  const cats = form.categories as string[]
  const toggleCat = (name: string) => set('categories', cats.includes(name) ? cats.filter((c) => c !== name) : [...cats, name])

  const input = (k: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className={'field' + (fieldError(k) ? ' has-error' : '')}>
      <span>{label}</span>
      <input value={form[k] as string} onChange={(e) => set(k, e.target.value)} {...props} />
      {fieldError(k) && <small className="bad">{fieldError(k)}</small>}
    </label>
  )

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFixed(new Set())
    save.mutate({ id: book?.id, input: toInput(form, Boolean(book)) }, { onSuccess: (saved) => navigate(`/books/${saved.id}`) })
  }

  return (
    <form className="book-form" onSubmit={onSubmit} noValidate>
      <h1>{book ? `Edit: ${book.title}` : 'Add a book'}</h1>

      {dups.data && dups.data.length > 0 && (
        <div className="warn" role="status">
          <strong>Already in the library?</strong>
          <ul>
            {dups.data.map((d) => (
              <li key={d.id}>
                <Link to={`/books/${d.id}`} target="_blank">{d.title}</Link>{d.author ? ` — ${d.author}` : ''} ({d.copies} cop{d.copies === 1 ? 'y' : 'ies'})
                {' · '}{d.match === 'isbn' ? 'same ISBN' : 'same title and author'}
                {!book && <> {' · '}<button type="button" className="link" disabled={addCopy.isPending}
                  onClick={() => addCopy.mutate(d.id, { onSuccess: () => navigate(`/books/${d.id}`) })}>Add a copy to this book instead</button></>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <fieldset>
        <legend>Book</legend>
        <div className="form-grid">
          {input('title', 'Title *', { required: true, autoFocus: !book })}
          {input('titleSinglish', 'Title in Singlish', { placeholder: 'Filled in automatically if empty' })}
          {input('author', 'Author')}
          {input('authorSinglish', 'Author in Singlish', { placeholder: 'Filled in automatically if empty' })}
          {input('language', 'Language', { list: 'langs' })}
          {input('publisher', 'Publisher')}
          {input('year', 'Year', { inputMode: 'numeric' })}
          {input('isbn', 'ISBN', { inputMode: 'numeric' })}
          {input('copies', 'Copies', { type: 'number', min: 1, max: 99 })}
          {input('shelf', 'Shelf / location', { placeholder: 'e.g. Rack B, shelf 2' })}
          {input('coverUrl', 'Cover image URL', { type: 'url', placeholder: 'Photo upload comes in Lesson 4.4' })}
        </div>
        <datalist id="langs">{languages.data?.map((l) => l.language && <option key={l.language} value={l.language} />)}<option value="English" /><option value="Tamil" /></datalist>

        <label className="check"><input type="checkbox" checked={form.isTranslation as boolean} onChange={(e) => set('isTranslation', e.target.checked)} /> This book is a translation</label>
        {form.isTranslation && (
          <div className="form-grid">
            {input('translator', 'Translator')}
            {input('originalTitle', 'Original title')}
            {input('originalAuthor', 'Original author')}
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend>Categories</legend>
        <div className="chips pick">
          {[...new Set([...(categories.data?.map((c) => c.name) ?? []), ...cats])].sort().map((name) => (
            <button key={name} type="button" className={'chip' + (cats.includes(name) ? ' on' : '')} aria-pressed={cats.includes(name)} onClick={() => toggleCat(name)}>{name}</button>
          ))}
        </div>
        <div className="row">
          <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="New category" aria-label="New category"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (newCat.trim()) { toggleCat(newCat.trim()); setNewCat('') } } }} />
          <button type="button" className="btn-small" disabled={!newCat.trim()} onClick={() => { toggleCat(newCat.trim()); setNewCat('') }}>Add</button>
        </div>
      </fieldset>

      <fieldset>
        <legend>About</legend>
        <label className="field"><span>Description</span><textarea rows={4} value={form.description as string} onChange={(e) => set('description', e.target.value)} /></label>
        <label className="field"><span>What readers say</span><textarea rows={3} value={form.reviewSummary as string} onChange={(e) => set('reviewSummary', e.target.value)} /></label>
      </fieldset>

      <fieldset>
        <legend>Purchase <span className="role-chip">Admins only</span></legend>
        <div className="form-grid">
          {input('purchasedFrom', 'Bought from', { placeholder: 'e.g. Sarasavi, Vijitha Yapa' })}
          {input('purchaseDate', 'Purchase date', { type: 'date' })}
          {input('price', 'Price (LKR)', { inputMode: 'decimal' })}
        </div>
        <label className="field"><span>Notes</span><textarea rows={2} value={form.notes as string} onChange={(e) => set('notes', e.target.value)} /></label>
      </fieldset>

      {save.error && <p className="bad" role="alert">
        {err && err.errors.length ? 'Please fix the fields marked in red.' : save.error.message}
      </p>}
      <div className="form-actions">
        {book && <button type="button" className="btn-small danger" disabled={del.isPending}
          onClick={() => { if (confirm(`Remove "${book.title}"? Its ratings and shelf entries are deleted too.`)) del.mutate(book.id, { onSuccess: () => navigate('/') }) }}>Remove book</button>}
        {del.error && <span className="bad small">{del.error.message}</span>}
        <span className="spacer" />
        <button type="button" className="btn-small" onClick={() => navigate(-1)}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : book ? 'Save changes' : 'Add book'}</button>
      </div>
    </form>
  )
}

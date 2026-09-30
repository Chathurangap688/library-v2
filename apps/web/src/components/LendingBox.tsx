/**
 * Lesson 4.5: on the book page.
 *   Admins:  who has the copies now (with "Mark returned") + "Lend to…"
 *   Readers: "You have this book since …" (and a gentle reminder when it is overdue)
 */
import { useState } from 'react'
import type { BookDetail } from '../api/client'
import { useAdminUsers, useLend, useReturnLoan } from '../api/hooks'

const days = (since: string) => Math.floor((Date.now() - new Date(since).getTime()) / 86_400_000)

export function MyLoanNote({ book, loanDays = 14 }: { book: BookDetail; loanDays?: number }) {
  if (!book.myLoanSince) return null
  const d = days(book.myLoanSince)
  return (
    <p className={d > loanDays ? 'bad' : 'good'} role="status">
      📖 You have this book since {new Date(book.myLoanSince).toLocaleDateString()} ({d} day{d === 1 ? '' : 's'})
      {d > loanDays ? ' — please bring it back soon 🙏' : ''}
    </p>
  )
}

export function LendingBox({ book }: { book: BookDetail }) {
  const users = useAdminUsers()
  const lend = useLend(); const giveBack = useReturnLoan()
  const [userId, setUserId] = useState('')
  const loans = book.openLoans ?? []
  const has = new Set(loans.map((l) => l.userId))
  const candidates = (users.data ?? []).filter((u) => u.status === 'active' && !has.has(u.id))
  const error = lend.error ?? giveBack.error

  return (
    <section className="admin-box">
      <h2>Lending <span className="role-chip">Admin</span></h2>
      <p className="muted">{book.available} of {book.copies} cop{book.copies === 1 ? 'y' : 'ies'} free</p>
      {loans.length > 0 && (
        <ul className="loan-list">
          {loans.map((l) => (
            <li key={l.id} className={l.overdue ? 'is-overdue' : ''}>
              <span><strong>{l.name ?? l.email}</strong> · since {new Date(l.borrowedAt).toLocaleDateString()} · {l.days} day{l.days === 1 ? '' : 's'}{l.overdue ? ' · overdue' : ''}</span>
              <button type="button" className="btn-small" disabled={giveBack.isPending} onClick={() => giveBack.mutate(l.id)}>Mark returned</button>
            </li>
          ))}
        </ul>
      )}
      <div className="row-wrap">
        <select value={userId} onChange={(e) => setUserId(e.target.value)} aria-label="Lend to" disabled={book.available <= 0}>
          <option value="">{book.available > 0 ? 'Lend to…' : 'No free copy'}</option>
          {candidates.map((u) => <option key={u.id} value={u.id}>{u.name ?? u.email}</option>)}
        </select>
        <button type="button" className="btn-small primary" disabled={!userId || book.available <= 0 || lend.isPending}
          onClick={() => lend.mutate({ bookId: book.id, userId }, { onSuccess: () => setUserId('') })}>Lend</button>
      </div>
      {error && <p className="bad small" role="alert">{error.message}</p>}
    </section>
  )
}

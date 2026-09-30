/** Lesson 4.5: /admin/loans — every book that is out, longest first; overdue in red */
import { Link, useSearchParams } from 'react-router'
import { useAdminLoans, useLoanSummary, useReturnLoan } from '../api/hooks'
import { Cover } from '../components/Cover'

type Status = 'open' | 'overdue' | 'returned'
const TABS: { key: Status; label: string }[] = [{ key: 'open', label: 'Out now' }, { key: 'overdue', label: 'Overdue' }, { key: 'returned', label: 'Returned' }]

export function LoansPage() {
  const [params, setParams] = useSearchParams()
  const status = (TABS.some((t) => t.key === params.get('status')) ? params.get('status') : 'open') as Status
  const summary = useLoanSummary(true); const loans = useAdminLoans(status); const giveBack = useReturnLoan()

  return (
    <section>
      <h1>Loans</h1>
      {summary.data && <p className="muted">{summary.data.open} book{summary.data.open === 1 ? '' : 's'} out · {summary.data.overdue} overdue (more than {summary.data.loanDays} days)</p>}
      <div className="tabs" role="tablist">
        {TABS.map((t) => <button key={t.key} type="button" role="tab" aria-selected={t.key === status} onClick={() => setParams({ status: t.key })}>{t.label}{t.key === 'overdue' && summary.data?.overdue ? ` (${summary.data.overdue})` : ''}</button>)}
      </div>
      {loans.isError && <p className="bad">{loans.error.message}</p>}
      {loans.data?.length === 0 && <div className="empty muted">{status === 'overdue' ? 'Nothing overdue 🎉' : 'Nothing here.'}</div>}
      <ul className="loan-rows">
        {loans.data?.map((l) => (
          <li key={l.id} className={l.overdue ? 'is-overdue' : ''}>
            <Link to={`/books/${l.bookId}`} className="loan-cover"><Cover url={l.coverUrl} title={l.title} /></Link>
            <div className="loan-info">
              <Link to={`/books/${l.bookId}`}><strong>{l.title}</strong></Link>
              <span>{l.name ?? l.email}</span>
              <span className="muted small">
                {new Date(l.borrowedAt).toLocaleDateString()}{l.returnedAt ? ` → ${new Date(l.returnedAt).toLocaleDateString()}` : ''} · {l.days} day{l.days === 1 ? '' : 's'}
                {l.lentByName ? ` · lent by ${l.lentByName}` : ''}
              </span>
            </div>
            {l.overdue && <span className="badge-inline bad">Overdue</span>}
            {!l.returnedAt && <button type="button" className="btn-small" disabled={giveBack.isPending} onClick={() => giveBack.mutate(l.id)}>Mark returned</button>}
          </li>
        ))}
      </ul>
    </section>
  )
}

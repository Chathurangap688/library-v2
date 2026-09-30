/**
 * Lesson 3.3: /admin/users — activate new readers, manage admins, remove users.
 * The buttons are only convenience: the SERVER checks every rule again (requireAdmin,
 * "not yourself", "no open loans"), so a hand-made request cannot get around them.
 */
import { useState } from 'react'
import type { AdminUser, Me } from '../api/client'
import { useAdminUsers, useDeleteUser, useUpdateUser } from '../api/hooks'

export function AdminUsersPage({ me }: { me: Me }) {
  const users = useAdminUsers()
  const update = useUpdateUser()
  const remove = useDeleteUser()
  const [message, setMessage] = useState<string | null>(null)

  const run = async (label: string, action: () => Promise<unknown>) => {
    setMessage(null)
    try { await action(); setMessage(label) } catch (e) { setMessage('✗ ' + (e as Error).message) }
  }
  const busy = update.isPending || remove.isPending

  if (users.isPending) return <p className="muted">Loading users…</p>
  if (users.isError) return <p className="bad">{users.error.message}</p>

  const pending = users.data.filter((u) => u.status === 'pending')
  const others = users.data.filter((u) => u.status !== 'pending')

  const row = (u: AdminUser) => {
    const self = u.id === me.id
    return (
      <li key={u.id} className={'user-row' + (u.status === 'pending' ? ' is-pending' : '')}>
        {u.picture ? <img className="avatar" src={u.picture} alt="" referrerPolicy="no-referrer" /> : <span className="avatar avatar-empty">{(u.name ?? u.email).slice(0, 1)}</span>}
        <div className="user-info">
          <strong>{u.name ?? '(no name yet)'}</strong>{self && <span className="muted small"> (you)</span>}
          <span className="muted small">{u.email}</span>
          <span className="muted small">
            {u.role === 'admin' ? 'Admin' : 'Reader'} · {u.readCount} read · {u.openLoans} on loan ·{' '}
            {u.linked && u.lastLoginAt ? `last sign-in ${new Date(u.lastLoginAt).toLocaleDateString()}` : 'not signed in to v2 yet'}
          </span>
        </div>
        <div className="user-actions">
          {u.status === 'pending'
            ? <button type="button" className="btn-small primary" disabled={busy}
                onClick={() => run(`✓ ${u.name ?? u.email} can now use the library`, () => update.mutateAsync({ id: u.id, status: 'active' }))}>Activate</button>
            : !self && <button type="button" className="btn-small" disabled={busy}
                onClick={() => run(`${u.name ?? u.email} is waiting again`, () => update.mutateAsync({ id: u.id, status: 'pending' }))}>Deactivate</button>}
          {!self && u.status === 'active' && (u.role === 'admin'
            ? <button type="button" className="btn-small" disabled={busy} onClick={() => run('Admin role removed', () => update.mutateAsync({ id: u.id, role: 'user' }))}>Remove admin</button>
            : <button type="button" className="btn-small" disabled={busy} onClick={() => run(`${u.name ?? u.email} is now an admin`, () => update.mutateAsync({ id: u.id, role: 'admin' }))}>Make admin</button>)}
          {!self && <button type="button" className="btn-small danger" disabled={busy}
            onClick={() => { if (confirm(`Remove ${u.name ?? u.email}? Their reading list and ratings are deleted too.`)) run('User removed', () => remove.mutateAsync(u.id)) }}>Remove</button>}
        </div>
      </li>
    )
  }

  return (
    <section>
      <h1>Users</h1>
      <p className="muted">{users.data.length} accounts · {pending.length} waiting for approval</p>
      {message && <p className={message.startsWith('✗') ? 'bad' : 'good'} role="status">{message}</p>}
      {pending.length > 0 && <><h2>Waiting for approval</h2><ul className="user-list">{pending.map(row)}</ul></>}
      <h2>Active</h2>
      <ul className="user-list">{others.map(row)}</ul>
    </section>
  )
}

/** Lesson 3.2: signed in, but an admin has not activated the account yet */
import type { Me } from '../api/client'
import { SignOutButton } from '../components/SignOutButton'

export function PendingPage({ me, onCheck, checking }: { me: Me; onCheck: () => void; checking: boolean }) {
  return (
    <div className="gate">
      <div className="gate-card">
        {me.picture && <img className="avatar-lg" src={me.picture} alt="" referrerPolicy="no-referrer" />}
        <h1>Hi {me.name ?? me.email}!</h1>
        <p>Your account is waiting for an admin to activate it.</p>
        <p className="muted small">Signed in as {me.email}. Ask the library admin, then check again.</p>
        <button type="button" className="btn-primary" onClick={onCheck} disabled={checking}>
          {checking ? 'Checking…' : 'Check again'}
        </button>
        <SignOutButton />
      </div>
    </div>
  )
}

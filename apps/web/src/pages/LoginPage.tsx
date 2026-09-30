/** Lesson 3.2: what a visitor sees before signing in (the library is private) */
import { signInHref } from '../auth'

export function LoginPage() {
  const error = new URLSearchParams(window.location.search).get('login_error')
  return (
    <div className="gate">
      <div className="gate-card">
        <div className="gate-logo" aria-hidden="true">📚</div>
        <h1>My Library</h1>
        <p className="muted">A private home library. Sign in to browse the books, mark what you've read and rate them.</p>
        {error && <p className="bad" role="alert">{error}</p>}
        <a className="btn-primary" href={signInHref()}>Sign in with Google</a>
        <p className="muted small">Sign-in is handled by Asgardeo. New accounts need an admin to activate them.</p>
      </div>
    </div>
  )
}

/**
 * Lesson 2.3 + 3.2: the app shell.
 * First we ask the API "who am I?" (/api/me):
 *   not signed in → LoginPage     pending → PendingPage     active → the library
 */
import { Link, NavLink, Route, Routes } from 'react-router'
import { useMe } from './api/hooks'
import { SignOutButton } from './components/SignOutButton'
import { CataloguePage } from './pages/CataloguePage'
import { BookPage } from './pages/BookPage'
import { StatusPage } from './pages/StatusPage'
import { LoginPage } from './pages/LoginPage'
import { PendingPage } from './pages/PendingPage'

export default function App() {
  const me = useMe()

  if (me.isPending) return <div className="gate"><p className="muted">Loading…</p></div>
  if (me.isError) return <div className="gate"><p className="bad">Could not reach the library: {me.error.message}</p><button type="button" onClick={() => me.refetch()}>Try again</button></div>
  if (!me.data) return <LoginPage />
  if (me.data.status !== 'active') return <PendingPage me={me.data} onCheck={() => me.refetch()} checking={me.isFetching} />

  const user = me.data
  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">📚 My Library</Link>
        <nav>
          <NavLink to="/" end>Catalogue</NavLink>
          <NavLink to="/status">Status</NavLink>
        </nav>
        <div className="user">
          {user.picture && <img className="avatar" src={user.picture} alt="" referrerPolicy="no-referrer" />}
          <span className="user-name">{user.name ?? user.email}</span>
          {user.role === 'admin' && <span className="role">Admin</span>}
          <SignOutButton className="link on-dark" />
        </div>
      </header>
      <main className="shell">
        <Routes>
          <Route path="/" element={<CataloguePage />} />
          <Route path="/books/:id" element={<BookPage />} />
          <Route path="/status" element={<StatusPage />} />
          <Route path="*" element={<div className="empty"><h1>Page not found</h1><Link to="/">← Catalogue</Link></div>} />
        </Routes>
      </main>
    </>
  )
}

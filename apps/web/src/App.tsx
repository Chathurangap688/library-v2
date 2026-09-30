/**
 * Lesson 2.3: the app shell + routes (React Router).
 *   /             the catalogue
 *   /books/:id    one book
 *   /status       system status
 */
import { Link, NavLink, Route, Routes } from 'react-router'
import { CataloguePage } from './pages/CataloguePage'
import { BookPage } from './pages/BookPage'
import { StatusPage } from './pages/StatusPage'

export default function App() {
  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">📚 My Library</Link>
        <nav>
          <NavLink to="/" end>Catalogue</NavLink>
          <NavLink to="/status">Status</NavLink>
        </nav>
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

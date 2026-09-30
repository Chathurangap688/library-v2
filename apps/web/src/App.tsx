import { useEffect, useState } from 'react'
import { api } from './api/client'
import './App.css'

type Status = { service: string; time: string; books: number }

function App() {
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Runs once when the page opens. Lesson 2.2: the calls are TYPED from openapi.json.
  useEffect(() => {
    Promise.all([api.GET('/api/health'), api.GET('/api/books', { params: { query: { pageSize: 1 } } })])
      .then(([health, books]) => {
        if (!health.data) throw new Error('API not reachable')
        if (!books.data) throw new Error(books.error?.detail ?? 'Could not load books')
        setStatus({ service: health.data.service, time: health.data.time, books: books.data.total })
      })
      .catch((err: Error) => setError(err.message))
  }, [])

  return (
    <main className="shell">
      <h1>My Library v2</h1>
      <p className="muted">Phase 2 · the API is described by OpenAPI and this page uses its generated types.</p>

      <section className="card">
        <h2>API status</h2>
        {error && <p className="bad">✗ {error}</p>}
        {!error && !status && <p className="muted">Checking…</p>}
        {status && (
          <>
            <p className="good">
              ✓ {status.service} is up <span className="muted">({new Date(status.time).toLocaleString()})</span>
            </p>
            <p>📚 {status.books} books in the database</p>
            <p><a href="/api/docs">Open the API docs →</a></p>
          </>
        )}
      </section>
    </main>
  )
}

export default App

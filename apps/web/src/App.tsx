import { useEffect, useState } from 'react'
import './App.css'

// The shape of the JSON that GET /api/health returns (see apps/api/src/index.ts)
type Health = { ok: boolean; service: string; time: string }

function App() {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Runs once when the page opens: ask the API if it is alive.
  useEffect(() => {
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error('HTTP ' + res.status)
        return res.json() as Promise<Health>
      })
      .then(setHealth)
      .catch((err: Error) => setError(err.message))
  }, [])

  return (
    <main className="shell">
      <h1>My Library v2</h1>
      <p className="muted">Phase 0 · the Worker serves this page and the API from one address.</p>

      <section className="card">
        <h2>API status</h2>
        {error && <p className="bad">✗ API not reachable: {error}</p>}
        {!error && !health && <p className="muted">Checking…</p>}
        {health && (
          <p className="good">
            ✓ {health.service} is up <span className="muted">({new Date(health.time).toLocaleString()})</span>
          </p>
        )}
      </section>
    </main>
  )
}

export default App

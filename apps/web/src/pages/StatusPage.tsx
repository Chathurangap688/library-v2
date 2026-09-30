/** Lesson 0.2/2.2: the system status page — now at /status */
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'

export function StatusPage() {
  const health = useQuery({ queryKey: ['health'], queryFn: async () => (await api.GET('/api/health')).data ?? null })
  const db = useQuery({ queryKey: ['health-db'], queryFn: async () => (await api.GET('/api/health/db')).data ?? null })
  return (
    <section className="card">
      <h1>System status</h1>
      <p>{health.data ? <span className="good">✓ API up</span> : health.isPending ? 'Checking API…' : <span className="bad">✗ API down</span>}</p>
      <p>{db.data ? <span className="good">✓ Database up ({db.data.ms} ms)</span> : db.isPending ? 'Checking database…' : <span className="bad">✗ Database down</span>}</p>
      <p><a href="/api/docs">API docs (Swagger) →</a></p>
    </section>
  )
}

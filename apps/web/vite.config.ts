import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Lesson 0.2: the app is always served from the ROOT of the Worker address,
  // so asset links are /assets/… (the Worker forwards them to GitHub Pages).
  base: '/',
  server: {
    // Local development: `npm run dev:web` (5173) forwards /api to `npm run dev:api` (8787),
    // so the React code can always call '/api/…' — same as in production.
    proxy: { '/api': 'http://localhost:8787' },
  },
})

/**
 * Lesson 3.2: the BFF ("backend for frontend") login routes. The browser never sees
 * a token — only our HttpOnly session cookie.
 *
 *   GET  /auth/login?returnTo=/books/…  → redirect to Asgardeo (Google sign-in)
 *   GET  /auth/callback                 → Asgardeo sends the user back here with a code
 *   POST /auth/logout                   → end our session + Asgardeo's, back to /
 */
import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { finishLogin, logoutUrl, startLogin } from '../auth/oidc'
import { createSession, destroySession, readSession, savePendingLogin, takePendingLogin } from '../auth/session'
import { upsertUserFromClaims } from '../auth/users'

export const authRoutes = new Hono<AppEnv>()

// Only allow returning to a path on OUR site (never ?returnTo=https://evil.example)
const safePath = (p: string | undefined) => (p && p.startsWith('/') && !p.startsWith('//') ? p : '/')

authRoutes.get('/login', async (c) => {
  const { url, state, nonce, codeVerifier } = await startLogin(c.env)
  await savePendingLogin(c, state, { nonce, codeVerifier, returnTo: safePath(c.req.query('returnTo')) })
  return c.redirect(url.href, 302)
})

authRoutes.get('/callback', async (c) => {
  const callbackUrl = new URL(c.req.url)
  // The user pressed "Cancel" / denied access at Asgardeo
  if (callbackUrl.searchParams.get('error')) {
    return c.redirect(`/?login_error=${encodeURIComponent(callbackUrl.searchParams.get('error_description') ?? 'Sign-in was cancelled')}`, 302)
  }
  const pending = await takePendingLogin(c, callbackUrl.searchParams.get('state') ?? undefined)
  if (!pending) return c.redirect('/?login_error=' + encodeURIComponent('Sign-in expired, please try again'), 302)

  try {
    // Our callback URL must be the registered one (APP_ORIGIN), whatever host served the request
    const registered = new URL(`${c.env.APP_ORIGIN}/auth/callback${callbackUrl.search}`)
    const { claims, idToken } = await finishLogin(c.env, registered, {
      state: callbackUrl.searchParams.get('state')!, nonce: pending.nonce, codeVerifier: pending.codeVerifier,
    })
    const user = await upsertUserFromClaims(c.get('db'), c.env, claims)
    await createSession(c, { userId: user.id, idToken })
    return c.redirect(pending.returnTo, 302)
  } catch (err) {
    // Log the full reason (see it with `npx wrangler tail` or Workers → Logs), show a short one
    const e = err as Error & { code?: string; cause?: unknown; error?: string; error_description?: string }
    console.error('login callback failed:', e.name, e.code ?? '', e.message, JSON.stringify(e.cause ?? e.error ?? ''))
    const reason = e.error_description ?? e.error ?? e.message ?? 'unknown error'
    return c.redirect('/?login_error=' + encodeURIComponent(`Sign-in failed: ${reason}`), 302)
  }
})

authRoutes.post('/logout', async (c) => {
  const session = await readSession(c)
  if (session) await destroySession(c, session.id)
  // 303 = "now GET this URL" (the right answer to a POST)
  return c.redirect(await logoutUrl(c.env, session?.idToken), 303)
})

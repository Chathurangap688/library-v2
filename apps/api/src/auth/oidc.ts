/**
 * Lesson 3.2: talking to Asgardeo with OpenID Connect (Authorization Code + PKCE).
 * oauth4webapi does the protocol checks for us (state, PKCE, nonce, ID-token signature,
 * issuer, audience, expiry) — the things that are easy to get subtly wrong by hand.
 */
import * as oauth from 'oauth4webapi'
import type { Bindings } from '../types'

// Asgardeo's issuer for our organisation: https://api.asgardeo.io/t/mylibrary/oauth2/token
export function issuerUrl(env: Bindings) {
  const base = env.ASGARDEO_BASE_URL ?? `https://api.asgardeo.io/t/${env.ASGARDEO_ORG}`
  return new URL(`${base}/oauth2/token`)
}

// A test IdP on http://localhost is allowed; everything else must be https
const insecureOk = (env: Bindings) => (env.ASGARDEO_BASE_URL ?? '').startsWith('http://localhost')

// The discovery document (endpoints + keys URL) — fetched once, then kept in memory
let cached: { issuer: string; as: oauth.AuthorizationServer } | undefined
export async function authServer(env: Bindings) {
  const issuer = issuerUrl(env)
  if (cached?.issuer === issuer.href) return cached.as
  const res = await oauth.discoveryRequest(issuer, { [oauth.allowInsecureRequests]: insecureOk(env) })
  const as = await oauth.processDiscoveryResponse(issuer, res)
  cached = { issuer: issuer.href, as }
  return as
}

export const client = (env: Bindings): oauth.Client => ({ client_id: env.ASGARDEO_CLIENT_ID })
export const redirectUri = (env: Bindings) => `${env.APP_ORIGIN}/auth/callback`

/** Step 1: build the URL that sends the browser to Asgardeo's login page */
export async function startLogin(env: Bindings) {
  const as = await authServer(env)
  const codeVerifier = oauth.generateRandomCodeVerifier()   // PKCE: a one-time secret we keep
  const state = oauth.generateRandomState()                 // ties the answer to THIS request (CSRF)
  const nonce = oauth.generateRandomNonce()                 // ties the ID token to THIS login (replay)
  const url = new URL(as.authorization_endpoint!)
  url.search = new URLSearchParams({
    client_id: env.ASGARDEO_CLIENT_ID,
    redirect_uri: redirectUri(env),
    response_type: 'code',
    scope: 'openid profile email',
    state, nonce,
    code_challenge: await oauth.calculatePKCECodeChallenge(codeVerifier),   // hash of the verifier
    code_challenge_method: 'S256',
  }).toString()
  return { url, state, nonce, codeVerifier }
}

/** Step 2: Asgardeo sent the browser back with ?code=…&state=… → swap the code for tokens */
export async function finishLogin(env: Bindings, callbackUrl: URL, expected: { state: string; nonce: string; codeVerifier: string }) {
  const as = await authServer(env)
  const params = oauth.validateAuthResponse(as, client(env), callbackUrl, expected.state)
  const res = await oauth.authorizationCodeGrantRequest(as, client(env), oauth.ClientSecretBasic(env.ASGARDEO_CLIENT_SECRET),
    params, redirectUri(env), expected.codeVerifier, { [oauth.allowInsecureRequests]: insecureOk(env) })
  const tokens = await oauth.processAuthorizationCodeResponse(as, client(env), res,
    { expectedNonce: expected.nonce, requireIdToken: true })
  const claims = oauth.getValidatedIdTokenClaims(tokens)!    // signature, iss, aud, exp, nonce: all checked
  return { claims, idToken: tokens.id_token! }
}

/** Logout at Asgardeo too (otherwise the next "Sign in" would log you straight back in) */
export async function logoutUrl(env: Bindings, idToken: string | undefined) {
  const as = await authServer(env)
  if (!as.end_session_endpoint) return `${env.APP_ORIGIN}/`
  const url = new URL(as.end_session_endpoint)
  url.search = new URLSearchParams({
    client_id: env.ASGARDEO_CLIENT_ID,
    post_logout_redirect_uri: `${env.APP_ORIGIN}/`,
    ...(idToken ? { id_token_hint: idToken } : {}),
  }).toString()
  return url.href
}

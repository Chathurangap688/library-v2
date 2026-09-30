// Lesson 3.2: signing in is a full-page trip to Asgardeo (not a fetch), then back to this page
export function signInHref() {
  const here = window.location.pathname + window.location.search
  return `/auth/login?returnTo=${encodeURIComponent(here)}`
}

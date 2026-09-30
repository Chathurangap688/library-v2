// Lesson 3.2: signing out is a POST form — a plain link could be triggered by another site (CSRF)
export function SignOutButton({ className = 'link' }: { className?: string }) {
  return (
    <form method="post" action="/auth/logout" className="inline">
      <button type="submit" className={className}>Sign out</button>
    </form>
  )
}

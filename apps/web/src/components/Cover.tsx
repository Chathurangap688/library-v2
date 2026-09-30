import { useState } from 'react'

// Cover photo with a neat fallback when there is no image (or it fails to load)
export function Cover({ url, title, large }: { url: string | null; title: string; large?: boolean }) {
  const [broken, setBroken] = useState(false)
  const cls = large ? 'cover cover-large' : 'cover'
  if (!url || broken) return <div className={cls + ' cover-empty'} aria-hidden="true">{title.slice(0, 1)}</div>
  return <img className={cls} src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
}

/**
 * Lesson 4.4: the cover box at the top of the book form.
 *   📷 / 🖼 pick a photo → Gemini reads it → crop + polish → upload to R2 → web lookup
 * Each step reports its progress; a failed step never stops the next useful one
 * (no AI? the photo is still saved and you can type the details).
 */
import { useRef, useState } from 'react'
import type { CoverDraft, LookupResult } from '../api/client'
import { useLookup, useReadCover, useUploadCover } from '../api/hooks'
import { loadImage, polishCover, shrinkForAi } from '../lib/image'

type LookupInput = Parameters<ReturnType<typeof useLookup>['mutateAsync']>[0]
type Props = {
  coverUrl: string
  onCover: (url: string) => void
  onDraft: (d: CoverDraft) => void
  onLookup: (r: LookupResult) => void
  lookupInput: () => LookupInput          // the form's current title, author… (read at click time)
  defaultAnswerLanguage: 'Sinhala' | 'English'
}

export function CoverPanel({ coverUrl, onCover, onDraft, onLookup, lookupInput, defaultAnswerLanguage }: Props) {
  const readCover = useReadCover(); const upload = useUploadCover(); const lookup = useLookup()
  const [preview, setPreview] = useState<string | null>(null)
  const [steps, setSteps] = useState<string[]>([])
  const [answerLanguage, setAnswerLanguage] = useState<'Sinhala' | 'English'>(defaultAnswerLanguage)
  const photo = useRef<string | undefined>(undefined)          // the small photo, reused by "Look up on the web"
  const camera = useRef<HTMLInputElement>(null); const gallery = useRef<HTMLInputElement>(null)
  const busy = readCover.isPending || upload.isPending || lookup.isPending
  const log = (line: string) => setSteps((s) => [...s, line])

  async function runLookup(extra?: Partial<LookupInput>) {
    const input = { ...lookupInput(), ...extra }
    if (!input.title?.trim()) { log('✗ Type a title first, then look it up.'); return }
    log('🔎 Searching the web…')
    try {
      const r = await lookup.mutateAsync({ ...input, answerLanguage, imageBase64: photo.current })
      onLookup(r)
      log(r.found ? `✓ Found (${{ web: 'web sources', ai: 'AI knowledge', googlebooks: 'Google Books', sources: 'raw web text — the AI was busy', none: '' }[r.mode]})` : '– Nothing reliable found on the web')
    } catch (e) { log('✗ Web lookup: ' + (e as Error).message) }
  }

  async function onPick(file: File | undefined) {
    if (!file) return
    setSteps([])
    try {
      const img = await loadImage(file)
      setPreview(img.src)
      photo.current = shrinkForAi(img)
      // 1. read the cover
      log('🤖 Reading the cover… (5–15 s)')
      let draft: CoverDraft | null = null
      try {
        draft = await readCover.mutateAsync(photo.current)
        onDraft(draft)
        log(draft.confidence < 0.6 ? `⚠ Read "${draft.title}" — the AI was not sure, please check the title` : `✓ Read "${draft.title}"`)
      } catch (e) { log('✗ ' + (e as Error).message + ' — type the details yourself') }
      // 2. crop + polish + upload (even without the AI: then the whole photo is used)
      log('🖼 Saving the cover…')
      const blob = await polishCover(img, draft?.coverBox ?? null)
      setPreview(URL.createObjectURL(blob))
      const url = await upload.mutateAsync(blob)
      onCover(url)
      log(`✓ Cover saved (${Math.round(blob.size / 1024)} KB)`)
      // 3. web lookup with what the AI read
      if (draft?.title) await runLookup({ title: draft.title, author: draft.author, titleSinglish: draft.titleSinglish, authorSinglish: draft.authorSinglish, language: draft.language, isTranslation: draft.isTranslation })
    } catch (e) { log('✗ ' + (e as Error).message) }
  }

  const shown = preview ?? (coverUrl || null)
  return (
    <fieldset className="cover-panel">
      <legend>Cover</legend>
      <div className="cover-panel-grid">
        <div className="cover-slot">{shown ? <img src={shown} alt="Cover" referrerPolicy="no-referrer" /> : <span className="muted">No cover yet</span>}</div>
        <div className="cover-actions">
          <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = '' }} />
          <input ref={gallery} type="file" accept="image/*" hidden onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = '' }} />
          <div className="row-wrap">
            <button type="button" className="btn-small primary" disabled={busy} onClick={() => camera.current?.click()}>📷 Take a photo</button>
            <button type="button" className="btn-small" disabled={busy} onClick={() => gallery.current?.click()}>🖼 Choose from gallery</button>
          </div>
          <div className="row-wrap">
            <button type="button" className="btn-small" disabled={busy} onClick={() => { setSteps([]); runLookup() }}>🔎 Look up on the web</button>
            <label className="small muted">Description in{' '}
              <select value={answerLanguage} onChange={(e) => setAnswerLanguage(e.target.value as 'Sinhala' | 'English')}>
                <option>Sinhala</option><option>English</option>
              </select>
            </label>
          </div>
          <ul className="steps" aria-live="polite">{steps.map((s, i) => <li key={i} className={s.startsWith('✗') ? 'bad' : s.startsWith('⚠') ? 'warn-text' : ''}>{s}</li>)}</ul>
          <p className="muted small">Only empty fields are filled in — what you typed is never overwritten.</p>
        </div>
      </div>
    </fieldset>
  )
}

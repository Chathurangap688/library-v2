/**
 * Lesson 4.3: Sinhala → Latin letters (from v1, Lesson 7c) — used to fill in
 * titleSinglish / authorSinglish automatically, so English-keyboard search finds new books.
 * Each consonant carries an "a" (ක = ka); a vowel sign REPLACES that "a" (කි = ki);
 * the hal mark ් removes it (ක් = k).
 */
const CONSONANTS: Record<string, string> = {
  'ක': 'k', 'ඛ': 'kh', 'ග': 'g', 'ඝ': 'gh', 'ඞ': 'ng', 'ඟ': 'ng', 'ච': 'ch', 'ඡ': 'chh',
  'ජ': 'j', 'ඣ': 'jh', 'ඤ': 'ny', 'ඥ': 'gn', 'ට': 't', 'ඨ': 'th', 'ඩ': 'd', 'ඪ': 'dh',
  'ණ': 'n', 'ඬ': 'nd', 'ත': 'th', 'ථ': 'th', 'ද': 'd', 'ධ': 'dh', 'න': 'n', 'ඳ': 'nd',
  'ප': 'p', 'ඵ': 'ph', 'බ': 'b', 'භ': 'bh', 'ම': 'm', 'ඹ': 'mb', 'ය': 'y', 'ර': 'r',
  'ල': 'l', 'ව': 'w', 'ශ': 'sh', 'ෂ': 'sh', 'ස': 's', 'හ': 'h', 'ළ': 'l', 'ෆ': 'f',
}
const VOWELS: Record<string, string> = {
  'අ': 'a', 'ආ': 'aa', 'ඇ': 'ae', 'ඈ': 'aae', 'ඉ': 'i', 'ඊ': 'ii', 'උ': 'u', 'ඌ': 'uu',
  'ඍ': 'ru', 'එ': 'e', 'ඒ': 'ee', 'ඓ': 'ai', 'ඔ': 'o', 'ඕ': 'oo', 'ඖ': 'au',
}
const SIGNS: Record<string, string> = {
  'ා': 'aa', 'ැ': 'ae', 'ෑ': 'aae', 'ි': 'i', 'ී': 'ii', 'ු': 'u', 'ූ': 'uu', 'ෘ': 'ru',
  'ෙ': 'e', 'ේ': 'ee', 'ෛ': 'ai', 'ො': 'o', 'ෝ': 'oo', 'ෞ': 'au', 'ෲ': 'ruu',
}

export const hasSinhala = (text: string) => /[඀-෿]/.test(text)

export function sinhalaToLatin(text: string) {
  const chars = [...text.normalize('NFC')]       // NFC joins "ෙ + ා" into "ො"
  let out = ''
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i], next = chars[i + 1]
    if (CONSONANTS[ch]) {
      out += CONSONANTS[ch]
      if (next === '්') i++                               // hal mark: no vowel
      else if (next && SIGNS[next]) { out += SIGNS[next]; i++ }
      else if (next !== '‍') out += 'a'              // default "a" (not before a joiner)
    } else if (VOWELS[ch]) out += VOWELS[ch]
    else if (ch === 'ං') out += 'n'
    else if (ch !== '‍' && ch !== '්') out += ch      // spaces, English letters, numbers
  }
  // "madol doowa" → "Madol Doowa"
  return out.replace(/\s+/g, ' ').trim().replace(/(^|\s)\S/g, (m) => m.toUpperCase())
}

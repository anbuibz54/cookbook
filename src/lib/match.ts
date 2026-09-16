import { normalizeForSearch } from './text'

/**
 * The key two wordings of the same thing must share.
 *
 * Pantry lines, shopping lines and recipe ingredients are all written by hand
 * (or by an AI reading a video), so "trứng gà", "Trứng Gà" and "trứng gà ta"
 * have to land on the same shelf. Diacritics and case go first; then a small
 * set of words that describe HOW an ingredient arrives rather than WHAT it is.
 *
 * Deliberately shallow: it strips noise, it does not try to understand. Two
 * genuinely different things ("trứng gà" vs "trứng vịt") must never collapse,
 * so nothing is dropped from the middle of a name and nothing is stemmed.
 */
const NOISE = new Set([
  // prep, written into ingredient names all the time
  'bam', 'nhuyen', 'thai', 'lat', 'soi', 'nho', 'khuc', 'mieng', 'vua', 'an',
  // grades and origin, which do not change what to cook or what to buy
  'ta', 'cong', 'nghiep', 'loai', 'tuoi', 'ngon', 'sach',
])

export function matchKey(name: string): string {
  const words = normalizeForSearch(name)
    .replace(/[(),.]/g, ' ')
    .split(' ')
    .filter(Boolean)

  // Trailing noise only: "thịt ba chỉ thái lát" → "thit ba chi", but "lát
  // gừng" keeps its first word.
  while (words.length > 1 && NOISE.has(words[words.length - 1])) words.pop()

  return words.join(' ')
}

/** Does the pantry line `have` cover the recipe's `need`? Names only, no amounts. */
export function covers(have: string, need: string): boolean {
  if (have === need) return true
  // "thịt ba chỉ" in the fridge covers "thịt ba chỉ heo" in a recipe, and the
  // other way round — one is the other plus a qualifier.
  return (
    have.startsWith(`${need} `) ||
    need.startsWith(`${have} `) ||
    have.endsWith(` ${need}`) ||
    need.endsWith(` ${have}`)
  )
}

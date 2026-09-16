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
/*
 * Only words that can never be part of WHAT the ingredient is. Diacritics are
 * gone by the time this runs, which is where the traps are: "lát" (a slice)
 * and "lạt" (unsalted) are both "lat", so dropping it turned "bơ lạt" into
 * "bơ" and matched "bơ mặn"; "tươi" turned "sữa tươi" into "sữa" and matched
 * "sữa đặc"; "ăn" turned "dầu ăn" into "dầu" and matched "dầu hào"; "nhỏ" is
 * "nho", a grape. None of those words may be in this list. `pnpm check:match`
 * holds each of those pairs apart.
 */
const NOISE = new Set(['bam', 'nhuyen', 'thai', 'soi', 'khuc', 'mieng'])

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

/**
 * Does the pantry line `have` cover the recipe's `need`? Names only, no amounts.
 *
 * Only a PREFIX relation counts: "thịt ba chỉ" covers "thịt ba chỉ heo" and the
 * other way round, because Vietnamese puts the qualifier after the noun.
 *
 * A suffix match used to count too, and it was wrong in exactly the way that
 * matters: "sữa tươi không đường" ends in "đường", so milk in the fridge made
 * every recipe needing sugar look covered. The head noun comes first; a shared
 * last word says nothing.
 */
export function covers(have: string, need: string): boolean {
  if (have === need) return true
  return have.startsWith(`${need} `) || need.startsWith(`${have} `)
}

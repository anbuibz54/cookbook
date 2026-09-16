import { normalizeForSearch } from './text'

/**
 * Which ingredients a step's text talks about.
 *
 * The schema does not link steps to ingredients — the AI would have to get
 * that right on every import, and a wrong link is worse than none. Matching
 * the written text costs nothing, but only if it stays conservative: this list
 * is read at the stove, so a MISSING line is a small loss and a WRONG line
 * ("muối" shown because the step said "trứng muối") is a ruined cake.
 *
 * Hence full-name matching, with two narrow concessions to how recipes are
 * actually written:
 *
 *  - a trailing qualifier may be dropped ("bột mì số 8" is written as "rây bột
 *    mì vào", "chà bông gà" as "rắc chà bông"), never more than that;
 *  - a one-word ingredient must stand alone — "muối" does not match inside
 *    "trứng muối", because that pair is part of another ingredient's name.
 *
 * Known misses, accepted: "đường cát trắng" written as "đường", "sốt
 * mayonnaise" as "mayonnaise". Add them to the recipe's wording, not to this
 * matcher's guesswork.
 */

/** Words that only narrow an ingredient, so a name still means itself without them. */
const QUALIFIERS = new Set([
  'so', 'loai', 'tuoi', 'kho', 'ga', 'ta', 'lat', 'nguyen', 'chat', 'trang', 'xanh', 'do',
])

function isQualifier(word: string) {
  return QUALIFIERS.has(word) || /^\d+$/.test(word)
}

/** The full name, then shorter forms made by dropping trailing qualifiers. */
function candidates(words: string[]): string[] {
  const out = [words.join(' ')]
  const rest = [...words]
  while (rest.length > 2 && isQualifier(rest[rest.length - 1])) {
    rest.pop()
    out.push(rest.join(' '))
  }
  return out
}

export function mentionedIn<T extends { name: string }>(body: string, ingredients: T[]): T[] {
  const text = ` ${normalizeForSearch(body)} `
  const names = ingredients.map((i) => normalizeForSearch(i.name).split(' ').filter(Boolean))

  // Every adjacent word pair across all ingredient names: "trứng muối" is one
  // of them (from "lòng đỏ trứng muối"), which is what disqualifies "muối".
  const pairs = new Set<string>()
  for (const words of names) {
    for (let i = 1; i < words.length; i++) pairs.add(`${words[i - 1]} ${words[i]}`)
  }

  return ingredients.filter((_, index) => {
    const words = names[index]
    if (words.length === 0) return false

    if (words.length === 1) {
      const word = words[0]
      let at = text.indexOf(` ${word} `)
      while (at !== -1) {
        const before = text.slice(0, at).trim().split(' ').pop() ?? ''
        if (!pairs.has(`${before} ${word}`)) return true
        at = text.indexOf(` ${word} `, at + 1)
      }
      return false
    }

    return candidates(words).some((name) => text.includes(` ${name} `) || text.includes(` ${name},`))
  })
}

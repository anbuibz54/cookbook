/**
 * Units: what the cook writes → grams nutrition can multiply.
 *
 * Deliberately a small, closed table. An unknown unit is not an error — the
 * line just has no gram weight until someone gives one, and nutrition reports
 * it as a gap.
 *
 * Vietnamese kitchen units are mapped to their usual metric meaning. "Chén"
 * and "bát" vary by household; 200 ml is the common rice-bowl assumption and
 * is exactly the kind of number to override with an explicit gram weight.
 */

type UnitDef =
  | { kind: 'mass'; grams: number }
  | { kind: 'volume'; ml: number }

const UNITS: Record<string, UnitDef> = {
  g: { kind: 'mass', grams: 1 },
  kg: { kind: 'mass', grams: 1000 },
  mg: { kind: 'mass', grams: 0.001 },
  // The historical lạng was 37.5 g; at the market today "1 lạng thịt" is 100 g.
  lạng: { kind: 'mass', grams: 100 },

  ml: { kind: 'volume', ml: 1 },
  l: { kind: 'volume', ml: 1000 },
  tsp: { kind: 'volume', ml: 5 },
  tbsp: { kind: 'volume', ml: 15 },
  cup: { kind: 'volume', ml: 240 },
  chén: { kind: 'volume', ml: 200 },
  bát: { kind: 'volume', ml: 200 },
}

/** Everything people actually type, folded onto the table above. */
const ALIASES: Record<string, string> = {
  gram: 'g', grams: 'g', gr: 'g', gam: 'g',
  kilogram: 'kg', kilo: 'kg', ký: 'kg', ki: 'kg', lang: 'lạng',
  lit: 'l', lít: 'l', liter: 'l', litre: 'l',
  mililit: 'ml', mililít: 'ml',
  teaspoon: 'tsp', 'muỗng cà phê': 'tsp', 'thìa cà phê': 'tsp', mcf: 'tsp', mcp: 'tsp', tcf: 'tsp',
  tablespoon: 'tbsp', 'muỗng canh': 'tbsp', 'thìa canh': 'tbsp', mc: 'tbsp', tbs: 'tbsp',
  cups: 'cup', cốc: 'cup', ly: 'cup',
  'chén ăn cơm': 'chén',
  trái: 'quả', chiếc: 'cái', cloves: 'clove', slices: 'slice', pieces: 'piece',
}

export function canonicalUnit(unit: string | null | undefined): string | null {
  if (!unit) return null
  const u = unit.trim().toLowerCase().replace(/\.$/, '')
  if (!u) return null
  if (UNITS[u] || COUNT_PORTIONS[u]) return u
  return ALIASES[u] ?? unit.trim()
}

/* -------------------------------------------------------------------------- */
/* Portions                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Count words → the portion keys that describe one of them, most typical first.
 * "1 quả trứng" is a medium-to-large egg; "1 tép tỏi" is a clove.
 *
 * A bare number with no unit ("2 trứng gà") is treated like `cái`.
 */
const COUNT_PORTIONS: Record<string, string[]> = {
  quả: ['medium', 'large', 'fruit', 'egg', 'each', 'whole', 'small', 'piece'],
  củ: ['medium', 'large', 'bulb', 'each', 'whole', 'small'],
  tép: ['clove'],
  nhánh: ['clove', 'stalk', 'sprig'],
  lát: ['slice'],
  lá: ['leaf'],
  cây: ['stalk', 'stick'],
  cọng: ['stalk', 'sprig'],
  cái: ['each', 'piece', 'medium', 'large', 'fruit', 'egg', 'whole', 'unit'],
  miếng: ['piece', 'slice', 'fillet'],
  bó: ['bunch'],
  bắp: ['ear', 'head', 'medium'],
  đùi: ['thigh', 'drumstick', 'leg'],
  cánh: ['wing'],
  'phi lê': ['fillet'],
  // English, for recipes imported as written.
  clove: ['clove'], slice: ['slice'], piece: ['piece'], large: ['large'],
  medium: ['medium'], small: ['small'], each: ['each'], stalk: ['stalk'], leaf: ['leaf'],
}

const PORTION_KEYS: [RegExp, string][] = [
  [/^cups?\b/, 'cup'],
  [/^(tbsp|tablespoons?)\b/, 'tbsp'],
  [/^(tsp|teaspoons?)\b/, 'tsp'],
  [/^fl\.? ?oz\b/, 'floz'],
  [/^(ml|milliliters?)\b/, 'ml'],
  [/^(extra large|jumbo)\b/, 'large'],
  [/^(large|medium|small)\b/, ''], // keep the word itself
  [/^cloves?\b/, 'clove'],
  [/^slices?\b/, 'slice'],
  [/^(leaf|leaves)\b/, 'leaf'],
  [/^stalks?\b/, 'stalk'],
  [/^sprigs?\b/, 'sprig'],
  [/^pieces?\b/, 'piece'],
  [/^(each|unit|item)\b/, 'each'],
  [/^fruits?\b/, 'fruit'],
  [/^eggs?\b/, 'egg'],
  [/^(bulb|head|bunch|stick|ear|fillet|filet|breast|thigh|drumstick|wing|leg|whole)s?\b/, ''],
]

/**
 * Normalise a dataset's portion wording ("cup, chopped", "tablespoon",
 * "medium (2-1/2\" dia)", "3 cloves") to a key, or null for portions we cannot
 * use in a recipe (oz, serving, package, container…).
 */
export function portionKey(text: string): string | null {
  const t = text.trim().toLowerCase().replace(/^[\d.\s/]+/, '')
  for (const [pattern, key] of PORTION_KEYS) {
    const m = t.match(pattern)
    if (m) return key || m[0].replace(/s$/, '').replace('filet', 'fillet')
  }
  return null
}

export type Portion = { unit: string; label: string; grams: number }

const PLAIN_VOLUME_LABELS = new Set([
  'cup', 'cups', 'tbsp', 'tablespoon', 'tablespoons', 'tsp', 'teaspoon', 'teaspoons',
  'fl oz', 'milliliter', 'ml',
])

/** ml in one unit, for volume portion keys. */
const PORTION_ML: Record<string, number> = { cup: 240, tbsp: 15, tsp: 5, floz: 29.57, ml: 1 }

/**
 * g/ml from the food's plain volume portions ("cup", not "cup, chopped" —
 * chopped vegetables are mostly air). Null if there is none.
 */
export function densityFromPortions(portions: Portion[]): number | null {
  // Plain = the label is only the unit word ("cup", "tablespoon"). "tbsp
  // chopped" and "cup, sliced" measure cut pieces with air between them.
  // Largest measure first: weighing a cup is more precise than a teaspoon.
  const plain = portions
    .filter((p) => PORTION_ML[p.unit] && PLAIN_VOLUME_LABELS.has(p.label.trim().toLowerCase()))
    .sort((a, b) => PORTION_ML[b.unit] - PORTION_ML[a.unit])[0]
  if (!plain) return null
  return plain.grams / PORTION_ML[plain.unit]
}

/* -------------------------------------------------------------------------- */
/* Grams                                                                       */
/* -------------------------------------------------------------------------- */

export type GramsResult = { grams: number; source: 'mass' | 'volume' | 'portion' } | null

export type FoodForGrams = {
  densityGPerMl: number | null
  portions: Portion[]
}

/**
 * Grams for a quantity, if the unit and the linked food can determine it.
 *
 * Order, best first:
 *  1. mass unit                          exact
 *  2. volume unit × food density         good
 *  3. a portion with exactly this unit   good ("1 tbsp butter = 14.2 g")
 *  4. count word × typical portion       typical size ("1 quả trứng" → medium)
 *
 * Ranges use the midpoint — nutrition wants one number, and the midpoint is
 * the least wrong one.
 */
export function gramsFor(
  quantity: number | null | undefined,
  quantityMax: number | null | undefined,
  unit: string | null | undefined,
  food: FoodForGrams | null | undefined,
): GramsResult {
  if (quantity == null) return null
  const amount = quantityMax != null ? (quantity + quantityMax) / 2 : quantity
  const code = canonicalUnit(unit) ?? 'cái'
  const def = UNITS[code]

  if (def?.kind === 'mass') return { grams: amount * def.grams, source: 'mass' }
  if (!food) return null

  if (def?.kind === 'volume') {
    if (food.densityGPerMl != null) {
      return { grams: amount * def.ml * food.densityGPerMl, source: 'volume' }
    }
    const same = pickPortion(food.portions, [code])
    if (same) return { grams: amount * same.grams, source: 'portion' }
    return null
  }

  const keys = COUNT_PORTIONS[code]
  const portion = keys ? pickPortion(food.portions, keys) : undefined
  return portion ? { grams: amount * portion.grams, source: 'portion' } : null
}

/** First key with a portion wins; within a key, the plainest label (shortest). */
function pickPortion(portions: Portion[], keys: string[]): Portion | undefined {
  for (const key of keys) {
    const matches = portions.filter((p) => p.unit === key)
    if (matches.length) return matches.sort((a, b) => a.label.length - b.label.length)[0]
  }
  return undefined
}

/** Friendly display for scaled quantities: 0.5 → "½", 1.3333 → "1⅓", 12.25 → "12.25". */
export function formatQuantity(n: number): string {
  const whole = Math.floor(n)
  const frac = n - whole
  const fractions: [number, string][] = [
    [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾'],
  ]
  if (whole < 20) {
    for (const [value, glyph] of fractions) {
      if (Math.abs(frac - value) < 0.02) return whole === 0 ? glyph : `${whole}${glyph}`
    }
  }
  if (Math.abs(frac) < 0.01) return String(whole)
  if (Math.abs(1 - frac) < 0.01) return String(whole + 1)
  return String(Math.round(n * 100) / 100)
}

/**
 * Units: what the cook writes → something nutrition can multiply.
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
  gram: 'g', grams: 'g', gr: 'g', 'gam': 'g',
  kilogram: 'kg', kilo: 'kg', ký: 'kg', ki: 'kg', lang: 'lạng',
  lit: 'l', lít: 'l', liter: 'l', litre: 'l',
  mililit: 'ml', 'mililít': 'ml',
  teaspoon: 'tsp', 'muỗng cà phê': 'tsp', 'thìa cà phê': 'tsp', 'mcf': 'tsp', 'mcp': 'tsp', 'tcf': 'tsp',
  tablespoon: 'tbsp', 'muỗng canh': 'tbsp', 'thìa canh': 'tbsp', 'mc': 'tbsp', 'tbs': 'tbsp',
  cups: 'cup', 'cốc': 'cup', 'ly': 'cup',
  'chén ăn cơm': 'chén',
}

export function canonicalUnit(unit: string | null | undefined): string | null {
  if (!unit) return null
  const u = unit.trim().toLowerCase().replace(/\.$/, '')
  if (!u) return null
  if (UNITS[u]) return u
  return ALIASES[u] ?? unit.trim()
}

export type GramsResult = { grams: number; source: 'mass' | 'volume' } | null

/**
 * Grams for a quantity, if the unit alone (or unit + density) determines it.
 * Ranges use the midpoint — nutrition wants one number, and the midpoint is
 * the least wrong one.
 */
export function gramsFor(
  quantity: number | null | undefined,
  quantityMax: number | null | undefined,
  unit: string | null | undefined,
  densityGPerMl: number | null | undefined,
): GramsResult {
  if (quantity == null) return null
  const code = canonicalUnit(unit)
  const def = code ? UNITS[code] : undefined
  if (!def) return null

  const amount = quantityMax != null ? (quantity + quantityMax) / 2 : quantity

  if (def.kind === 'mass') return { grams: amount * def.grams, source: 'mass' }
  if (densityGPerMl == null) return null
  return { grams: amount * def.ml * densityGPerMl, source: 'volume' }
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

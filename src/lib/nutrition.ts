/**
 * Recipe nutrition, computed on read from ingredient grams × food per-100 g.
 *
 * Not stored. It is cheap to compute, and a stored copy would go stale the day
 * a food's numbers are corrected (an AI estimate replaced by USDA data).
 *
 * Honesty is the feature: every result says how much of the recipe it covers
 * and how good the underlying numbers are, so "412 kcal" never silently means
 * "412 kcal from the three ingredients we could match".
 */

export type NutrientTotals = {
  kcal: number
  proteinG: number
  fatG: number
  carbsG: number
  fiberG: number
  sugarG: number
  sodiumMg: number
}

export type NutritionLine = {
  name: string
  optional: boolean
  grams: number | null
  gramsSource: 'mass' | 'volume' | 'estimate' | null
  food: {
    source: 'usda' | 'vn_fct' | 'label' | 'ai_estimate'
    kcal: number
    proteinG: number
    fatG: number
    carbsG: number
    fiberG: number | null
    sugarG: number | null
    sodiumMg: number | null
  } | null
}

export type Confidence = 'good' | 'approximate' | 'rough'

export type RecipeNutrition = {
  total: NutrientTotals
  perServing: NutrientTotals
  servings: number
  /** Non-optional lines that contributed / all non-optional lines. */
  counted: number
  countable: number
  /** Non-optional lines with no food link or no gram weight, by name. */
  missing: string[]
  /**
   * good        every counted line is lab data with a measured weight
   * approximate some weights are estimates, or some foods came off a label
   * rough       at least one food's numbers are an AI estimate
   */
  confidence: Confidence
}

const zero = (): NutrientTotals => ({
  kcal: 0, proteinG: 0, fatG: 0, carbsG: 0, fiberG: 0, sugarG: 0, sodiumMg: 0,
})

/**
 * Optional lines ("thêm ớt nếu thích") are left out of the totals: the card
 * describes the recipe as written, and optional means not necessarily eaten.
 */
export function computeNutrition(lines: NutritionLine[], servings: number): RecipeNutrition {
  const total = zero()
  const missing: string[] = []
  let counted = 0
  let countable = 0
  let confidence: Confidence = 'good'

  for (const line of lines) {
    if (line.optional) continue
    countable++

    if (!line.food || line.grams == null) {
      missing.push(line.name)
      continue
    }

    counted++
    const f = line.food
    const k = line.grams / 100
    total.kcal += f.kcal * k
    total.proteinG += f.proteinG * k
    total.fatG += f.fatG * k
    total.carbsG += f.carbsG * k
    total.fiberG += (f.fiberG ?? 0) * k
    total.sugarG += (f.sugarG ?? 0) * k
    total.sodiumMg += (f.sodiumMg ?? 0) * k

    if (f.source === 'ai_estimate') confidence = 'rough'
    else if (confidence === 'good' && (f.source === 'label' || line.gramsSource === 'estimate')) {
      confidence = 'approximate'
    }
  }

  const s = servings > 0 ? servings : 1
  const perServing = Object.fromEntries(
    Object.entries(total).map(([key, value]) => [key, value / s]),
  ) as NutrientTotals

  return { total, perServing, servings: s, counted, countable, missing, confidence }
}

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  good: 'Số liệu tốt',
  approximate: 'Ước lượng',
  rough: 'Ước lượng thô (có số AI đoán)',
}

export function round(n: number, digits = 0) {
  const p = 10 ** digits
  return Math.round(n * p) / p
}

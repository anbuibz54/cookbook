/**
 * Recipes: create, read, search, update-with-history.
 *
 * Every function takes `userId` and scopes by it — this is the one
 * authorization path, for the web app and MCP alike.
 *
 * Ingredients and steps are replaced wholesale on update rather than diffed.
 * A recipe has tens of lines, not thousands; "send me the whole list" is also
 * what both a form and a model produce naturally, and a diff protocol would be
 * one more thing for either to get wrong.
 *
 * No `next/*` imports.
 */

import { and, arrayContains, asc, desc, eq, ilike } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../db'
import { foods, recipeIngredients, recipeSteps, recipeVersions, recipes } from '../db/schema'
import { foodsByIds, likePattern } from '../foods/service'
import { normalizeForSearch } from '@/lib/text'
import { canonicalUnit, gramsFor } from '@/lib/units'
import { computeNutrition, type RecipeNutrition } from '@/lib/nutrition'

/* -------------------------------------------------------------------------- */
/* Input                                                                       */
/* -------------------------------------------------------------------------- */

const optionalText = z.string().trim().min(1).nullish()

export const ingredientInput = z
  .object({
    section: optionalText,
    name: z.string().trim().min(1, 'Every ingredient needs a name.'),
    quantity: z.number().positive().nullish(),
    quantityMax: z.number().positive().nullish(),
    unit: optionalText,
    note: optionalText,
    optional: z.boolean().default(false),
    foodId: z.uuid().nullish(),
    /** Only needed when the unit alone cannot say (quả, củ, nhánh…). */
    grams: z.number().positive().nullish(),
  })
  .refine((i) => i.quantityMax == null || (i.quantity != null && i.quantityMax > i.quantity), {
    message: 'quantity_max must be larger than quantity.',
  })

export const stepInput = z.object({
  section: optionalText,
  body: z.string().trim().min(1, 'A step cannot be empty.'),
  timerSeconds: z.number().int().positive().max(7 * 24 * 3600).nullish(),
})

const headerFields = {
  title: z.string().trim().min(1, 'A recipe needs a title.'),
  summary: optionalText,
  servings: z.number().positive().max(1000),
  yieldLabel: optionalText,
  prepMinutes: z.number().int().min(0).max(100_000).nullish(),
  cookMinutes: z.number().int().min(0).max(100_000).nullish(),
  cuisine: optionalText,
  tags: z.array(z.string().trim().min(1)).max(30),
  notes: optionalText,
  sourceUrl: z.url().nullish(),
  sourceLabel: optionalText,
}

export const createRecipeInput = z.object({
  ...headerFields,
  servings: headerFields.servings.default(1),
  tags: headerFields.tags.default([]),
  ingredients: z.array(ingredientInput).min(1, 'A recipe needs at least one ingredient.').max(200),
  steps: z.array(stepInput).min(1, 'A recipe needs at least one step.').max(100),
  authoredBy: z.enum(['human', 'ai']).default('human'),
})

export const updateRecipeInput = z.object({
  title: headerFields.title.optional(),
  summary: headerFields.summary,
  servings: headerFields.servings.optional(),
  yieldLabel: headerFields.yieldLabel,
  prepMinutes: headerFields.prepMinutes,
  cookMinutes: headerFields.cookMinutes,
  cuisine: headerFields.cuisine,
  tags: headerFields.tags.optional(),
  notes: headerFields.notes,
  sourceUrl: headerFields.sourceUrl,
  sourceLabel: headerFields.sourceLabel,
  ingredients: createRecipeInput.shape.ingredients.optional(),
  steps: createRecipeInput.shape.steps.optional(),
  changeNote: optionalText,
})

export type CreateRecipeInput = z.output<typeof createRecipeInput>
export type UpdateRecipeInput = z.output<typeof updateRecipeInput>
type Channel = 'web' | 'mcp'

/* -------------------------------------------------------------------------- */
/* Read                                                                        */
/* -------------------------------------------------------------------------- */

export type RecipeRow = typeof recipes.$inferSelect

export type FullRecipe = {
  recipe: RecipeRow
  ingredients: (typeof recipeIngredients.$inferSelect & {
    food: typeof foods.$inferSelect | null
  })[]
  steps: (typeof recipeSteps.$inferSelect)[]
  nutrition: RecipeNutrition
}

export async function getRecipe(db: Db, userId: string, recipeId: string): Promise<FullRecipe | null> {
  if (!z.uuid().safeParse(recipeId).success) return null

  const [recipe] = await db
    .select()
    .from(recipes)
    .where(and(eq(recipes.id, recipeId), eq(recipes.userId, userId)))
    .limit(1)
  if (!recipe) return null

  const [ingredientRows, steps] = await Promise.all([
    db
      .select({ line: recipeIngredients, food: foods })
      .from(recipeIngredients)
      .leftJoin(foods, eq(recipeIngredients.foodId, foods.id))
      .where(eq(recipeIngredients.recipeId, recipe.id))
      .orderBy(asc(recipeIngredients.position)),
    db
      .select()
      .from(recipeSteps)
      .where(eq(recipeSteps.recipeId, recipe.id))
      .orderBy(asc(recipeSteps.position)),
  ])

  const ingredients = ingredientRows.map((r) => ({ ...r.line, food: r.food }))

  const nutrition = computeNutrition(
    ingredients.map((i) => ({
      name: i.name,
      optional: i.optional,
      grams: i.grams,
      gramsSource: i.gramsSource,
      food: i.food,
    })),
    recipe.servings,
  )

  return { recipe, ingredients, steps, nutrition }
}

export async function listRecipes(
  db: Db,
  userId: string,
  { search, tag, limit = 50 }: { search?: string; tag?: string; limit?: number } = {},
): Promise<RecipeRow[]> {
  const conditions = [eq(recipes.userId, userId)]
  const needle = search ? normalizeForSearch(search) : ''
  if (needle) conditions.push(ilike(recipes.searchText, likePattern(needle)))
  if (tag?.trim()) conditions.push(arrayContains(recipes.tags, [tag.trim()]))

  return db
    .select()
    .from(recipes)
    .where(and(...conditions))
    .orderBy(desc(recipes.updatedAt))
    .limit(limit)
}

/* -------------------------------------------------------------------------- */
/* Write                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Resolve food links and gram weights for a list of ingredient inputs.
 *
 * A food id the user cannot see is dropped, not rejected, and reported back —
 * the recipe still saves, and the caller learns which link did not take.
 *
 * Grams precedence: a mass unit is exact and wins; then volume × density; an
 * explicitly supplied weight is used only when the unit cannot say.
 */
async function resolveIngredients(
  db: Pick<Db, 'select'>,
  userId: string,
  lines: CreateRecipeInput['ingredients'],
) {
  const ids = [...new Set(lines.map((l) => l.foodId).filter((id): id is string => Boolean(id)))]
  const visible = await foodsByIds(db, userId, ids)
  const droppedFoodIds: string[] = []

  const rows = lines.map((line, position) => {
    const food = line.foodId ? visible.get(line.foodId) : undefined
    if (line.foodId && !food) droppedFoodIds.push(line.foodId)

    const fromUnit = gramsFor(line.quantity, line.quantityMax, line.unit, food?.densityGPerMl)
    const grams = fromUnit?.grams ?? line.grams ?? null
    const gramsSource = fromUnit?.source ?? (line.grams != null ? ('estimate' as const) : null)

    return {
      position,
      section: line.section ?? null,
      name: line.name,
      quantity: line.quantity ?? null,
      quantityMax: line.quantityMax ?? null,
      unit: canonicalUnit(line.unit),
      note: line.note ?? null,
      optional: line.optional,
      foodId: food?.id ?? null,
      grams,
      gramsSource,
    }
  })

  return { rows, droppedFoodIds }
}

function searchTextFor(
  header: Pick<RecipeRow, 'title' | 'cuisine' | 'tags'>,
  ingredientNames: string[],
) {
  return normalizeForSearch(header.title, header.cuisine, ...header.tags, ...ingredientNames)
}

export type SaveResult = { recipeId: string; droppedFoodIds: string[] }

export async function createRecipe(
  db: Db,
  userId: string,
  input: CreateRecipeInput,
  channel: Channel,
): Promise<SaveResult> {
  return db.transaction(async (tx) => {
    const { rows, droppedFoodIds } = await resolveIngredients(tx, userId, input.ingredients)

    const [recipe] = await tx
      .insert(recipes)
      .values({
        userId,
        title: input.title,
        summary: input.summary ?? null,
        servings: input.servings,
        yieldLabel: input.yieldLabel ?? null,
        prepMinutes: input.prepMinutes ?? null,
        cookMinutes: input.cookMinutes ?? null,
        cuisine: input.cuisine ?? null,
        tags: input.tags,
        notes: input.notes ?? null,
        sourceUrl: input.sourceUrl ?? null,
        sourceLabel: input.sourceLabel ?? null,
        sourceChannel: channel,
        authoredBy: input.authoredBy,
        searchText: searchTextFor(
          { title: input.title, cuisine: input.cuisine ?? null, tags: input.tags },
          input.ingredients.map((i) => i.name),
        ),
      })
      .returning({ id: recipes.id })

    await tx.insert(recipeIngredients).values(rows.map((r) => ({ ...r, recipeId: recipe.id })))
    await tx.insert(recipeSteps).values(
      input.steps.map((s, position) => ({
        recipeId: recipe.id,
        position,
        section: s.section ?? null,
        body: s.body,
        timerSeconds: s.timerSeconds ?? null,
      })),
    )

    return { recipeId: recipe.id, droppedFoodIds }
  })
}

/**
 * Update a recipe, snapshotting the previous version first.
 *
 * Fields left `undefined` are kept. Nullable text fields passed as `null` are
 * cleared. `ingredients` / `steps`, when present, replace the whole list.
 */
export async function updateRecipe(
  db: Db,
  userId: string,
  recipeId: string,
  input: UpdateRecipeInput,
  channel: Channel,
): Promise<SaveResult | null> {
  const before = await getRecipe(db, userId, recipeId)
  if (!before) return null

  return db.transaction(async (tx) => {
    await tx.insert(recipeVersions).values({
      recipeId,
      snapshot: {
        recipe: before.recipe,
        // Without the joined food: a snapshot records what the recipe said,
        // and the food's own numbers may be corrected later.
        ingredients: before.ingredients.map((line) => ({ ...line, food: undefined })),
        steps: before.steps,
      },
      changeNote: input.changeNote ?? null,
      sourceChannel: channel,
    })

    let droppedFoodIds: string[] = []
    let ingredientNames = before.ingredients.map((i) => i.name)

    if (input.ingredients) {
      const resolved = await resolveIngredients(tx, userId, input.ingredients)
      droppedFoodIds = resolved.droppedFoodIds
      ingredientNames = input.ingredients.map((i) => i.name)
      await tx.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, recipeId))
      await tx.insert(recipeIngredients).values(resolved.rows.map((r) => ({ ...r, recipeId })))
    }

    if (input.steps) {
      await tx.delete(recipeSteps).where(eq(recipeSteps.recipeId, recipeId))
      await tx.insert(recipeSteps).values(
        input.steps.map((s, position) => ({
          recipeId,
          position,
          section: s.section ?? null,
          body: s.body,
          timerSeconds: s.timerSeconds ?? null,
        })),
      )
    }

    const header = {
      title: input.title,
      summary: input.summary,
      servings: input.servings,
      yieldLabel: input.yieldLabel,
      prepMinutes: input.prepMinutes,
      cookMinutes: input.cookMinutes,
      cuisine: input.cuisine,
      tags: input.tags,
      notes: input.notes,
      sourceUrl: input.sourceUrl,
      sourceLabel: input.sourceLabel,
    }
    const merged = {
      title: header.title ?? before.recipe.title,
      cuisine: header.cuisine !== undefined ? header.cuisine : before.recipe.cuisine,
      tags: header.tags ?? before.recipe.tags,
    }

    await tx
      .update(recipes)
      .set({
        ...Object.fromEntries(Object.entries(header).filter(([, v]) => v !== undefined)),
        searchText: searchTextFor(merged, ingredientNames),
        updatedAt: new Date(),
      })
      .where(and(eq(recipes.id, recipeId), eq(recipes.userId, userId)))

    return { recipeId, droppedFoodIds }
  })
}

export async function deleteRecipe(db: Db, userId: string, recipeId: string): Promise<boolean> {
  if (!z.uuid().safeParse(recipeId).success) return false
  const rows = await db
    .delete(recipes)
    .where(and(eq(recipes.id, recipeId), eq(recipes.userId, userId)))
    .returning({ id: recipes.id })
  return rows.length > 0
}

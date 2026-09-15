/**
 * The MCP tool surface.
 *
 * **The descriptions are the prompt.** They are all a model that cannot see
 * this codebase knows about the product, so the rules (link foods, be honest
 * about estimates, credit sources) are written out rather than assumed.
 *
 * The main job: the user watches a cooking video or reads a recipe somewhere,
 * tells their AI client "save this", and it lands here structured, with
 * nutrition. Video understanding happens in the client, not on this server.
 *
 * Deliberately absent: delete_recipe. Deleting is rare and belongs in the app,
 * where it can be seen; a model misreading "remove the chilli" as "remove the
 * recipe" should not be possible.
 *
 * No `next/*` imports. The transport is wired up in the route handler.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { Db } from '../db'
import type { Principal } from './tokens'
import {
  createRecipe,
  createRecipeInput,
  getRecipe,
  listRecipes,
  updateRecipe,
  updateRecipeInput,
  type FullRecipe,
} from '../recipes/service'
import { createFood, createFoodInput, foodLabel, searchFoods } from '../foods/service'
import { formatQuantity } from '@/lib/units'
import { CONFIDENCE_LABEL, round, type RecipeNutrition } from '@/lib/nutrition'

function text(body: string) {
  return { content: [{ type: 'text' as const, text: body }] }
}

/* -------------------------------------------------------------------------- */
/* Wire shapes (snake_case for models, camelCase inside)                        */
/* -------------------------------------------------------------------------- */

const ingredientShape = z.object({
  section: z.string().optional().describe('Group heading, e.g. "Nước dùng", "Nhân", "Topping". Omit if the recipe has no groups.'),
  name: z.string().describe('What the cook reads, in Vietnamese: "hành tím", "bột mì đa dụng".'),
  quantity: z.number().optional().describe('Omit for "vừa ăn" / to taste.'),
  quantity_max: z.number().optional().describe('Upper end of a range: "2–3 quả" → quantity 2, quantity_max 3.'),
  unit: z.string().optional().describe('g, kg, ml, l, tsp, tbsp, cup, chén, lạng — or a count word: quả, củ, tép, nhánh, lá, cái. Omit for a bare count.'),
  note: z.string().optional().describe('Prep or detail: "băm nhuyễn", "để ở nhiệt độ phòng".'),
  optional: z.boolean().optional().describe('True for "nếu thích" ingredients. Excluded from nutrition.'),
  food_id: z.string().optional().describe('Food id from search_foods / create_food. This is what makes nutrition work — link every ingredient that is not water or a negligible pinch.'),
  grams: z.number().optional().describe('Estimated weight in grams of this line as written. REQUIRED for nutrition when the unit is a count or unknown (1 quả trứng ≈ 50, 1 củ hành tây ≈ 150, 1 tép tỏi ≈ 5). Ignored when the unit is already a mass.'),
})

const stepShape = z.object({
  section: z.string().optional().describe('Group heading, same as ingredients.'),
  body: z.string().describe('One action, in Vietnamese, in your own words.'),
  timer_seconds: z.number().int().optional().describe('If the step waits a set time ("ủ 30 phút" → 1800). Powers a one-tap timer in cook mode.'),
})

const headerShape = {
  title: z.string().describe('Dish name in Vietnamese, as the user would search for it.'),
  summary: z.string().optional().describe('One or two sentences on what makes this version this version.'),
  servings: z.number().optional().describe('How many servings the quantities make. Defaults to 1.'),
  yield_label: z.string().optional().describe('What one serving is: "phần", "cái", "ổ 20 cm".'),
  prep_minutes: z.number().int().optional(),
  cook_minutes: z.number().int().optional(),
  cuisine: z.string().optional().describe('"Việt", "Pháp", "Nhật"…'),
  tags: z.array(z.string()).optional().describe('Lowercase Vietnamese tags: "bánh", "món chính", "chay", "nướng", "tết".'),
  notes: z.string().optional().describe('Tips, storage, substitutions. Markdown.'),
  source_url: z.string().optional().describe('The video or page this came from. Always set it when there is one.'),
  source_label: z.string().optional().describe('Who to credit: the channel or author name, or "Mẹ".'),
}

const optionalHeaderShape = Object.fromEntries(
  Object.entries(headerShape).map(([k, v]) => [k, v.optional()]),
) as { [K in keyof typeof headerShape]: z.ZodOptional<(typeof headerShape)[K]> }

type IngredientWire = z.infer<typeof ingredientShape>
type StepWire = z.infer<typeof stepShape>

function ingredientFromWire(i: IngredientWire) {
  return {
    section: i.section, name: i.name, quantity: i.quantity, quantityMax: i.quantity_max,
    unit: i.unit, note: i.note, optional: i.optional, foodId: i.food_id, grams: i.grams,
  }
}

function stepFromWire(s: StepWire) {
  return { section: s.section, body: s.body, timerSeconds: s.timer_seconds }
}

/* -------------------------------------------------------------------------- */
/* Rendering                                                                   */
/* -------------------------------------------------------------------------- */

function nutritionSummary(n: RecipeNutrition): string {
  const p = n.perServing
  const lines = [
    `Nutrition per serving (${n.counted}/${n.countable} ingredients counted, ${CONFIDENCE_LABEL[n.confidence]}):`,
    `  ${round(p.kcal)} kcal · protein ${round(p.proteinG, 1)} g · fat ${round(p.fatG, 1)} g · carbs ${round(p.carbsG, 1)} g · sugar ${round(p.sugarG, 1)} g · sodium ${round(p.sodiumMg)} mg`,
  ]
  if (n.missing.length) {
    lines.push(`  Not counted (no food link or no grams): ${n.missing.join(', ')}`)
  }
  return lines.join('\n')
}

/** The editable form: exactly the shape update_recipe accepts, so a model can round-trip it. */
function recipeToWire(full: FullRecipe) {
  const r = full.recipe
  return {
    id: r.id,
    title: r.title,
    summary: r.summary ?? undefined,
    servings: r.servings,
    yield_label: r.yieldLabel ?? undefined,
    prep_minutes: r.prepMinutes ?? undefined,
    cook_minutes: r.cookMinutes ?? undefined,
    cuisine: r.cuisine ?? undefined,
    tags: r.tags,
    notes: r.notes ?? undefined,
    source_url: r.sourceUrl ?? undefined,
    source_label: r.sourceLabel ?? undefined,
    authored_by: r.authoredBy,
    ingredients: full.ingredients.map((i) => ({
      section: i.section ?? undefined,
      name: i.name,
      quantity: i.quantity ?? undefined,
      quantity_max: i.quantityMax ?? undefined,
      unit: i.unit ?? undefined,
      note: i.note ?? undefined,
      optional: i.optional || undefined,
      food_id: i.foodId ?? undefined,
      food: i.food ? `${foodLabel(i.food)} [${i.food.source}]` : undefined,
      grams: i.grams != null ? round(i.grams, 1) : undefined,
    })),
    steps: full.steps.map((s) => ({
      section: s.section ?? undefined,
      body: s.body,
      timer_seconds: s.timerSeconds ?? undefined,
    })),
  }
}

function scaledIngredientList(full: FullRecipe, servings: number): string {
  const factor = servings / full.recipe.servings
  return full.ingredients
    .map((i) => {
      if (i.quantity == null) return `- ${i.name}${i.note ? ` (${i.note})` : ''}: vừa ăn`
      const q = formatQuantity(i.quantity * factor)
      const qMax = i.quantityMax != null ? `–${formatQuantity(i.quantityMax * factor)}` : ''
      return `- ${i.name}${i.note ? ` (${i.note})` : ''}: ${q}${qMax}${i.unit ? ` ${i.unit}` : ''}`
    })
    .join('\n')
}

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0]
  const path = issue.path.length ? `${issue.path.join('.')}: ` : ''
  return `${path}${issue.message}`
}

/* -------------------------------------------------------------------------- */
/* Server                                                                      */
/* -------------------------------------------------------------------------- */

export function buildMcpServer(db: Db, principal: Principal, baseUrl: string) {
  const server = new McpServer(
    { name: 'cookbook', version: '0.1.0' },
    {
      instructions: [
        "Cookbook is the user's personal recipe book. The user is Vietnamese: write recipe content in Vietnamese unless they ask otherwise.",
        '',
        'Typical job: the user shares a video, a page, a photo or their own description and asks you to save it. Extract the recipe yourself, then call create_recipe once with everything structured.',
        '',
        'Nutrition only works through food links. Before create_recipe, call search_foods for each real ingredient (search in Vietnamese or English, without diacritics is fine) and pass the food_id. If nothing fits, call create_food with source "ai_estimate" — and never label an estimate as anything better.',
        '',
        'For count units (quả, củ, tép, cái) also pass `grams`, your best estimate of the weight. Mass units need nothing extra.',
        '',
        'Before creating a recipe, call search_recipes to check it is not already saved; if it is, prefer update_recipe with a change_note.',
      ].join('\n'),
    },
  )

  /* ------------------------------------------------------------------ */

  server.registerTool(
    'search_recipes',
    {
      title: 'Search recipes',
      description: [
        "Search the user's saved recipes by title, tag, cuisine or ingredient name. Diacritics are ignored (\"banh bo\" finds \"bánh bò\").",
        '',
        'Call before create_recipe to avoid duplicates, and to answer "what can I make with X?".',
      ].join('\n'),
      inputSchema: {
        search: z.string().optional().describe('Words to look for. Omit to list the most recently updated recipes.'),
        tag: z.string().optional().describe('Exact tag, e.g. "bánh".'),
      },
    },
    async ({ search, tag }) => {
      const found = await listRecipes(db, principal.userId, { search, tag, limit: 30 })
      if (found.length === 0) {
        return text(search || tag ? 'No recipes match.' : 'No recipes saved yet.')
      }
      return text(
        found
          .map((r) => `${r.id}  ${r.title}${r.tags.length ? `  [${r.tags.join(', ')}]` : ''}`)
          .join('\n'),
      )
    },
  )

  /* ------------------------------------------------------------------ */

  server.registerTool(
    'get_recipe',
    {
      title: 'Read a recipe',
      description: [
        'Return one recipe in full, with nutrition per serving.',
        '',
        'The JSON is exactly the shape update_recipe accepts: to change a recipe, edit this JSON and send the fields you changed (ingredients and steps must be sent as whole lists).',
        '',
        'Pass `servings` to also get a scaled ingredient list for cooking. The JSON always stays at the base quantities — do not send scaled numbers back to update_recipe unless the user wants the base recipe changed.',
      ].join('\n'),
      inputSchema: {
        recipe_id: z.string().describe('Recipe id from search_recipes.'),
        servings: z.number().positive().optional().describe('Scale the ingredient list to this many servings.'),
      },
    },
    async ({ recipe_id, servings }) => {
      const full = await getRecipe(db, principal.userId, recipe_id)
      if (!full) return text(`No recipe ${recipe_id}.`)

      const parts = [
        `${baseUrl}/recipes/${full.recipe.id}`,
        nutritionSummary(full.nutrition),
      ]
      if (servings && servings !== full.recipe.servings) {
        parts.push(
          `Scaled to ${formatQuantity(servings)} ${full.recipe.yieldLabel ?? 'servings'} (base ${full.recipe.servings}):\n${scaledIngredientList(full, servings)}`,
        )
      }
      parts.push(JSON.stringify(recipeToWire(full), null, 2))
      return text(parts.join('\n\n'))
    },
  )

  /* ------------------------------------------------------------------ */

  server.registerTool(
    'create_recipe',
    {
      title: 'Save a new recipe',
      description: [
        "Save a recipe to the user's cookbook in one call.",
        '',
        'Checklist before calling:',
        '1. search_recipes — is it already saved? Then update_recipe instead.',
        '2. search_foods for each real ingredient and put the food_id on the line; create_food (source "ai_estimate") only when nothing fits.',
        '3. For count units give `grams`.',
        '4. Set source_url and source_label whenever it came from a video, page or person.',
        '',
        'Write steps in your own words, one action per step, in Vietnamese. Do not paste a creator\'s text verbatim.',
        '',
        'Set authored_by "ai" when you extracted or drafted the recipe, "human" when the user dictated it. The result reports nutrition coverage — if ingredients are missing from it, fix them with update_recipe.',
      ].join('\n'),
      inputSchema: {
        ...headerShape,
        ingredients: z.array(ingredientShape).describe('In the order they are used.'),
        steps: z.array(stepShape),
        authored_by: z.enum(['human', 'ai']).describe('"ai" if you extracted or drafted it; "human" if the user dictated it.'),
      },
    },
    async (args) => {
      const parsed = createRecipeInput.safeParse({
        title: args.title,
        summary: args.summary,
        servings: args.servings,
        yieldLabel: args.yield_label,
        prepMinutes: args.prep_minutes,
        cookMinutes: args.cook_minutes,
        cuisine: args.cuisine,
        tags: args.tags,
        notes: args.notes,
        sourceUrl: args.source_url,
        sourceLabel: args.source_label,
        ingredients: args.ingredients.map(ingredientFromWire),
        steps: args.steps.map(stepFromWire),
        authoredBy: args.authored_by,
      })
      if (!parsed.success) return text(`Rejected — ${firstIssue(parsed.error)}`)

      const saved = await createRecipe(db, principal.userId, parsed.data, 'mcp')
      const full = await getRecipe(db, principal.userId, saved.recipeId)

      const parts = [`Saved "${parsed.data.title}"\n${saved.recipeId}\n${baseUrl}/recipes/${saved.recipeId}`]
      if (full) parts.push(nutritionSummary(full.nutrition))
      if (saved.droppedFoodIds.length) {
        parts.push(`These food_id values were not found and were not linked: ${saved.droppedFoodIds.join(', ')}`)
      }
      return text(parts.join('\n\n'))
    },
  )

  /* ------------------------------------------------------------------ */

  server.registerTool(
    'update_recipe',
    {
      title: 'Change a recipe',
      description: [
        'Change a saved recipe. The previous version is kept in its history, so always say what changed in `change_note` ("bớt đường 20%", "thêm bước ủ bột").',
        '',
        'Send only the fields that change. `ingredients` and `steps`, if sent, REPLACE the whole list — call get_recipe first and send the complete edited list, never just the changed line.',
      ].join('\n'),
      inputSchema: {
        recipe_id: z.string(),
        change_note: z.string().describe('What changed and why, in a few words.'),
        ...optionalHeaderShape,
        ingredients: z.array(ingredientShape).optional().describe('The complete new list.'),
        steps: z.array(stepShape).optional().describe('The complete new list.'),
      },
    },
    async (a) => {
      const parsed = updateRecipeInput.safeParse({
        title: a.title,
        summary: a.summary,
        servings: a.servings,
        yieldLabel: a.yield_label,
        prepMinutes: a.prep_minutes,
        cookMinutes: a.cook_minutes,
        cuisine: a.cuisine,
        tags: a.tags,
        notes: a.notes,
        sourceUrl: a.source_url,
        sourceLabel: a.source_label,
        ingredients: a.ingredients?.map(ingredientFromWire),
        steps: a.steps?.map(stepFromWire),
        changeNote: a.change_note,
      })
      if (!parsed.success) return text(`Rejected — ${firstIssue(parsed.error)}`)

      const saved = await updateRecipe(db, principal.userId, a.recipe_id, parsed.data, 'mcp')
      if (!saved) return text(`No recipe ${a.recipe_id}.`)

      const full = await getRecipe(db, principal.userId, saved.recipeId)
      const parts = [`Updated ${saved.recipeId}\n${baseUrl}/recipes/${saved.recipeId}`]
      if (full) parts.push(nutritionSummary(full.nutrition))
      if (saved.droppedFoodIds.length) {
        parts.push(`These food_id values were not found and were not linked: ${saved.droppedFoodIds.join(', ')}`)
      }
      return text(parts.join('\n\n'))
    },
  )

  /* ------------------------------------------------------------------ */

  server.registerTool(
    'search_foods',
    {
      title: 'Find a food for nutrition',
      description: [
        'Search the nutrition reference for an ingredient, to get a food_id for create_recipe / update_recipe.',
        '',
        'Search short and generic: "trung ga" not "2 quả trứng gà ta". Try the English name if Vietnamese finds nothing. Diacritics are ignored.',
        '',
        'Prefer sources in this order: usda / vn_fct (lab data) > label > ai_estimate. Values are per 100 g edible portion.',
      ].join('\n'),
      inputSchema: {
        query: z.string().min(1).describe('Ingredient name, Vietnamese or English.'),
      },
    },
    async ({ query }) => {
      const found = await searchFoods(db, principal.userId, { query, limit: 10 })
      if (found.length === 0) {
        return text(`No food matches "${query}". Try another name, or create_food with source "ai_estimate".`)
      }
      return text(
        found
          .map((f) =>
            `${f.id}  ${foodLabel(f)}  [${f.source}]  ${round(f.kcal)} kcal, P ${round(f.proteinG, 1)} / F ${round(f.fatG, 1)} / C ${round(f.carbsG, 1)} per 100 g${f.densityGPerMl ? `, ${f.densityGPerMl} g/ml` : ''}`,
          )
          .join('\n'),
      )
    },
  )

  /* ------------------------------------------------------------------ */

  server.registerTool(
    'create_food',
    {
      title: 'Add a food to the nutrition reference',
      description: [
        'Add a food when search_foods has nothing suitable. Values are per 100 g of the edible part.',
        '',
        '**Be honest about the source.** "label" only when the numbers were read from a real nutrition label the user showed you. Anything you know or infer is "ai_estimate" — the app shows estimates as estimates, and that honesty is the point.',
        '',
        'Search first, including the English name: a duplicate food splits nutrition data and nothing merges it later.',
        '',
        'Give density_g_per_ml for liquids and powders measured by spoon or cup (nước mắm ≈ 1.2, dầu ăn ≈ 0.92, bột mì ≈ 0.53), so volume units convert to grams.',
      ].join('\n'),
      inputSchema: {
        name_vi: z.string().optional().describe('Vietnamese name, e.g. "nước mắm".'),
        name_en: z.string().optional().describe('English name, e.g. "fish sauce".'),
        aliases: z.array(z.string()).optional().describe('Other names people search for.'),
        source: z.enum(['label', 'ai_estimate']),
        kcal: z.number(),
        protein_g: z.number(),
        fat_g: z.number(),
        carbs_g: z.number(),
        fiber_g: z.number().optional(),
        sugar_g: z.number().optional(),
        sodium_mg: z.number().optional(),
        density_g_per_ml: z.number().optional(),
      },
    },
    async (a) => {
      const parsed = createFoodInput.safeParse({
        nameVi: a.name_vi,
        nameEn: a.name_en,
        aliases: a.aliases,
        source: a.source,
        kcal: a.kcal,
        proteinG: a.protein_g,
        fatG: a.fat_g,
        carbsG: a.carbs_g,
        fiberG: a.fiber_g,
        sugarG: a.sugar_g,
        sodiumMg: a.sodium_mg,
        densityGPerMl: a.density_g_per_ml,
      })
      if (!parsed.success) return text(`Rejected — ${firstIssue(parsed.error)}`)

      const food = await createFood(db, principal.userId, parsed.data)
      return text(`Created food ${foodLabel(food)} [${food.source}]\n${food.id}`)
    },
  )

  return server
}

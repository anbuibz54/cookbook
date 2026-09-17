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
import { createWish, streakCards, wishInput } from '../motivation/service'
import { createMeal, mealInput, proposeMeal, recipeChoices } from '../journal/service'
import { vnDate } from '@/lib/dates'
import { normalizeForSearch } from '@/lib/text'
import {
  listPantry,
  pantryItemInput,
  removePantryItems,
  savePantryItems,
  suggestFromPantry,
} from '../pantry/service'
import {
  addShoppingItems,
  assignStore,
  listShopping,
  saveStore,
  shoppingItemInput,
  storeInput,
  STORE_KINDS,
  STORE_LABEL,
} from '../shopping/service'
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
  grams: z.number().optional().describe('Estimated weight in grams of this line as written. Only used when the server cannot work it out: mass units are exact, and count units (quả, củ, tép, lát, cái…) use the food\'s measured portions when search_foods lists one. Give it for sizes that differ from typical ("1 củ hành tây to" ≈ 250) or when the food has no matching portion.'),
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
        'Count units (quả, củ, tép, lát, cái) are converted with the food\'s measured portions when it has them (search_foods lists them). Pass `grams` yourself only when the food has no matching portion or the size is clearly not typical.',
        '',
        'Before creating a recipe, call search_recipes to check it is not already saved; if it is, prefer update_recipe with a change_note.',
        '',
        'The kitchen side: list_pantry / save_pantry_items track what the user has, suggest_from_pantry says what that makes cookable (exact arithmetic, done by the app — do not redo it yourself), and the shopping tools cover what is missing. Sorting the shopping list by shop is the one part that needs your web search.',
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
        '3. For count units give `grams` when the linked food lists no matching portion.',
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
        'Search short and generic: "trung ga" not "2 quả trứng gà ta". Every word must match, in any order. Diacritics are ignored.',
        '',
        'Two lab datasets are loaded: vn_fct (Bảng thành phần thực phẩm Việt Nam — Vietnamese names, covers rau răm, mắm tôm, giò lụa, lá lốt…) and usda (USDA FoodData Central — English descriptions like "Egg, whole, raw, fresh", ~270 common ones also have Vietnamese names). If a Vietnamese search finds nothing, try the English name.',
        '',
        'When both datasets match: if the recipe measures the ingredient by count or spoon (quả, tép, muỗng) pick the one that lists matching portions, so grams are worked out for you; otherwise prefer vn_fct for Vietnamese ingredients. Pick the raw / unprepared form unless the recipe uses a prepared one.',
        '',
        'Trust order: usda / vn_fct (lab data) > label > ai_estimate. Values are per 100 g edible portion.',
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
          .map((f) => {
            const portions = f.portions
              .filter((p) => !/^(cup|floz|ml)$/.test(p.unit))
              .slice(0, 5)
              .map((p) => `1 ${p.label} = ${round(p.grams, 1)} g`)
            return [
              `${f.id}  ${foodLabel(f)}  [${f.source}]`,
              `  ${round(f.kcal)} kcal, P ${round(f.proteinG, 1)} / F ${round(f.fatG, 1)} / C ${round(f.carbsG, 1)} per 100 g` +
                (f.densityGPerMl ? `, ${round(f.densityGPerMl, 2)} g/ml` : ''),
              portions.length ? `  portions: ${portions.join('; ')}` : null,
            ]
              .filter(Boolean)
              .join('\n')
          })
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

  /* ------------------------------------------------------------------ */
  /* Pantry                                                              */
  /* ------------------------------------------------------------------ */

  server.registerTool(
    'list_pantry',
    {
      title: "What is in the user's kitchen",
      description: [
        'List what the user currently has, soonest expiry first.',
        '',
        'Read this before suggesting what to cook, before adding to the shopping list (never make them buy what they already have), and before saving pantry changes, so you update the right line.',
      ].join('\n'),
      inputSchema: {},
    },
    async () => {
      const items = await listPantry(db, principal.userId)
      if (items.length === 0) return text('Tủ lạnh đang trống (chưa có gì được ghi vào).')
      return text(
        items
          .map((i) => {
            const amount = i.quantity != null ? `${i.quantity}${i.unit ? ` ${i.unit}` : ''}` : 'có'
            return `${i.id}  ${i.name}  ${amount}${i.grams != null ? ` (~${round(i.grams)} g)` : ''}${
              i.expiresOn ? `  HSD ${i.expiresOn}` : ''
            }${i.note ? `  — ${i.note}` : ''}`
          })
          .join('\n'),
      )
    },
  )

  server.registerTool(
    'save_pantry_items',
    {
      title: 'Put things in the kitchen',
      description: [
        'Record what the user has just bought, or corrects you about ("tủ còn 5 quả trứng, nửa bó hành").',
        '',
        'One row per thing: sending the same name again REPLACES that line, it does not add a second one. Send the amount the user has NOW, not the amount they added.',
        '',
        'Write names the way a Vietnamese kitchen says them, without prep words: "thịt ba chỉ", not "thịt ba chỉ thái lát". Link food_id from search_foods when you can — it makes matching against recipes exact.',
        '',
        'Always ask for or carry over `expires_on` for fresh things (rau, thịt, sữa); it is what lets the app suggest cooking them before they go off. Omit it for rice, sugar, fish sauce.',
      ].join('\n'),
      inputSchema: {
        items: z.array(
          z.object({
            name: z.string().describe('Tên nguyên liệu, ví dụ "trứng gà".'),
            quantity: z.number().optional().describe('Bỏ trống nếu chỉ biết là "còn".'),
            unit: z.string().optional().describe('g, kg, ml, quả, củ, bó, hộp…'),
            expires_on: z.string().optional().describe('Hạn dùng dạng YYYY-MM-DD.'),
            note: z.string().optional().describe('Ví dụ "ngăn đá", "đã bóc vỏ".'),
            food_id: z.string().optional().describe('Từ search_foods, nếu có.'),
          }),
        ),
      },
    },
    async ({ items }) => {
      const parsed = z.array(pantryItemInput).safeParse(
        items.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          expiresOn: i.expires_on,
          note: i.note,
          foodId: i.food_id,
        })),
      )
      if (!parsed.success) return text(`Rejected — ${firstIssue(parsed.error)}`)

      const saved = await savePantryItems(db, principal.userId, parsed.data)
      return text(`Đã ghi ${saved.length} thứ vào tủ.\n${baseUrl}/pantry`)
    },
  )

  server.registerTool(
    'remove_pantry_items',
    {
      title: 'Take things out of the kitchen',
      description: [
        'Remove pantry lines the user has used up or thrown away. Pass the names they used, or ids from list_pantry.',
        '',
        'Cooking does NOT go through this tool — the app asks the user what was used up after they finish a recipe, so they can keep what is left over.',
      ].join('\n'),
      inputSchema: {
        names: z.array(z.string()).optional().describe('Tên như người dùng nói: ["hành lá", "trứng gà"].'),
        ids: z.array(z.string()).optional().describe('Id từ list_pantry.'),
      },
    },
    async ({ names, ids }) => {
      const removed = await removePantryItems(db, principal.userId, { names, ids })
      return text(removed === 0 ? 'Không tìm thấy thứ nào khớp.' : `Đã bỏ ${removed} thứ khỏi tủ.`)
    },
  )

  server.registerTool(
    'suggest_from_pantry',
    {
      title: 'What can be cooked with what is in the kitchen',
      description: [
        "Match the pantry against the user's own recipes: what is cookable now, and what each one is missing.",
        '',
        'The ranking is exact set arithmetic done by the app, not a guess — trust it over your own reading of the pantry, and do not invent recipes the user has not saved. If nothing is close, say so and offer to save a recipe that fits what they have.',
        '',
        'Ingredients with no amount ("muối", "vừa ăn") are ignored on purpose; nobody shops for those.',
      ].join('\n'),
      inputSchema: {},
    },
    async () => {
      const suggestions = await suggestFromPantry(db, principal.userId)
      if (suggestions.length === 0) {
        return text('Chưa gợi ý được: tủ trống, hoặc không công thức nào dùng những thứ đang có.')
      }
      return text(
        suggestions
          .map((s) => {
            const missing = s.missing.length
              ? `thiếu ${s.missing.length}: ${s.missing.map((m) => `${m.name}${m.short ? ' (không đủ)' : ''}`).join(', ')}`
              : 'đủ nguyên liệu'
            const expiring = s.usesExpiring.length ? `  · dùng đồ sắp hết hạn: ${s.usesExpiring.join(', ')}` : ''
            return `${s.recipeId}  ${s.title}  [${s.have}/${s.needed}] ${missing}${expiring}`
          })
          .join('\n'),
      )
    },
  )

  /* ------------------------------------------------------------------ */
  /* Shopping                                                            */
  /* ------------------------------------------------------------------ */

  server.registerTool(
    'get_shopping_list',
    {
      title: 'Read the shopping list',
      description: [
        'The current list, with the shop each line is assigned to and the recipe it came from.',
        '',
        'Call this before assign_shopping_stores (you need the item ids) and before adding, to avoid duplicating a line.',
      ].join('\n'),
      inputSchema: {},
    },
    async () => {
      const lines = await listShopping(db, principal.userId)
      if (lines.length === 0) return text('Danh sách đi chợ đang trống.')
      return text(
        lines
          .map((l) => {
            const amount = l.quantity != null ? `${l.quantity}${l.unit ? ` ${l.unit}` : ''}` : ''
            const where = l.store ? `[${STORE_LABEL[l.store.kind]} · ${l.store.name}]` : '[chưa phân loại]'
            return `${l.id}  ${l.name} ${amount}  ${where}${l.boughtAt ? '  (đã mua)' : ''}${
              l.recipeTitle ? `  ← ${l.recipeTitle}` : ''
            }`
          })
          .join('\n'),
      )
    },
  )

  server.registerTool(
    'add_to_shopping_list',
    {
      title: 'Add to the shopping list',
      description: [
        'Add what the user needs to buy. Lines with the same name merge into one, so it is safe to add the missing ingredients of several recipes in a row.',
        '',
        'Call list_pantry first: never add something the kitchen already has. suggest_from_pantry already tells you exactly what each recipe is missing — pass those names and amounts through, with recipe_id so the list says why each line is there.',
      ].join('\n'),
      inputSchema: {
        items: z.array(
          z.object({
            name: z.string(),
            quantity: z.number().optional(),
            unit: z.string().optional(),
            note: z.string().optional().describe('Ví dụ "loại không đường", "mua con to".'),
            food_id: z.string().optional(),
            recipe_id: z.string().optional().describe('Công thức cần món này.'),
          }),
        ),
      },
    },
    async ({ items }) => {
      const parsed = z.array(shoppingItemInput).safeParse(
        items.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          note: i.note,
          foodId: i.food_id,
          recipeId: i.recipe_id,
        })),
      )
      if (!parsed.success) return text(`Rejected — ${firstIssue(parsed.error)}`)

      const { added, merged } = await addShoppingItems(db, principal.userId, parsed.data)
      return text(`Đã thêm ${added} món, gộp ${merged} món trùng.\n${baseUrl}/shopping`)
    },
  )

  server.registerTool(
    'assign_shopping_stores',
    {
      title: 'Sort the shopping list by where to buy it',
      description: [
        'Put each line of the list in a shop, so the user walks one route instead of wandering.',
        '',
        '**This is the part that needs you.** Use your web search to work it out, in this order:',
        '1. Put everything a convenience chain reliably stocks at "bhx" (Bách Hóa Xanh) — packaged goods, dairy, eggs, common vegetables, basic meat.',
        '2. Send the rest to "cho" (the wet market): live/fresh seafood, unusual cuts, herbs by the bunch, anything a chain rarely carries. Chợ is the fallback, not the first choice.',
        '3. Use "sieu_thi" only for things needing a big supermarket (imported baking goods, cheese) and "online" for what neither carries.',
        '',
        'Then search for the nearest real branch and market to the area the user gives you, and pass its `name`, `address` and a `maps_url` (a normal google.com/maps link that opens that place). If the user has not said where they live, ASK before guessing a district — a map link to the wrong side of the city is worse than none.',
        '',
        'Only name a branch you actually found in search results. Do not invent an address, and do not fabricate a maps link from a made-up place id — a plain search-style Google Maps URL for the real name and street is fine.',
      ].join('\n'),
      inputSchema: {
        assignments: z.array(
          z.object({
            item_ids: z.array(z.string()).describe('Id từ get_shopping_list.'),
            kind: z.enum(STORE_KINDS).describe('bhx | cho | sieu_thi | online'),
            store_name: z.string().describe('Tên chi nhánh thật, ví dụ "Bách Hóa Xanh Nguyễn Thị Thập".'),
            address: z.string().optional(),
            maps_url: z.string().optional().describe('Link Google Maps mở đúng chỗ đó.'),
          }),
        ),
      },
    },
    async ({ assignments }) => {
      const results: string[] = []
      for (const assignment of assignments) {
        const parsed = storeInput.safeParse({
          kind: assignment.kind,
          name: assignment.store_name,
          address: assignment.address,
          mapsUrl: assignment.maps_url,
        })
        if (!parsed.success) return text(`Rejected — ${firstIssue(parsed.error)}`)

        const store = await saveStore(db, principal.userId, parsed.data)
        const moved = await assignStore(db, principal.userId, assignment.item_ids, store.id)
        results.push(`${STORE_LABEL[store.kind]} · ${store.name}: ${moved} món`)
      }
      return text(`${results.join('\n')}\n\n${baseUrl}/shopping`)
    },
  )

  server.registerTool(
    'add_wish',
    {
      title: 'Pin a dish to the wish board',
      description:
        'Pin a dish the user WANTS TO COOK one day to their "Muốn chinh phục" board — for "ghim món này", ' +
        '"để dành nấu sau", or a video they liked but are not saving as a recipe yet. Not for saving a recipe ' +
        '(that is create_recipe). If the recipe is already in the sổ (search_recipes), pass recipe_id. ' +
        'Pass the video/page link as source_url. The app marks the wish conquered by itself when the user ' +
        'logs a meal with this dish — never try to do that.',
      inputSchema: {
        title: z.string().optional().describe('Tên món tiếng Việt. Bỏ trống khi có recipe_id.'),
        recipe_id: z.string().optional(),
        source_url: z.string().optional(),
        note: z.string().optional().describe('Ngắn, lời của người dùng nếu có.'),
      },
    },
    async ({ title, recipe_id, source_url, note }) => {
      const parsed = wishInput.safeParse({ title, recipeId: recipe_id, sourceUrl: source_url, note })
      if (!parsed.success) return text(`Rejected — ${firstIssue(parsed.error)}`)
      try {
        const wish = await createWish(db, principal.userId, parsed.data)
        return text(`Đã ghim “${wish.title}”.\n\n${baseUrl}/achievements`)
      } catch (error) {
        return text(`Rejected — ${error instanceof Error ? error.message : 'could not save'}`)
      }
    },
  )

  /* ------------------------------------------------------------------ journal */

  const dishShape = z.object({
    name: z.string().describe('Tên món như người dùng nói: "canh chua cá lóc".'),
    recipe_id: z.string().optional().describe('Id từ search_recipes nếu món có trong sổ. Bỏ trống thì app tự khớp theo đúng tên công thức.'),
  })

  /** A dish's recipe: the id given (if it is the user's), else a recipe with exactly this title. */
  async function resolveDishes(dishes: z.infer<typeof dishShape>[]) {
    const recipes = await recipeChoices(db, principal.userId)
    return dishes.map((d) => {
      const byId = d.recipe_id ? recipes.find((r) => r.id === d.recipe_id) : undefined
      const byTitle = recipes.find((r) => normalizeForSearch(r.title) === normalizeForSearch(d.name))
      const recipe = byId ?? byTitle
      return { name: recipe?.title ?? d.name.trim(), recipeId: recipe?.id ?? null }
    })
  }

  server.registerTool(
    'propose_meal',
    {
      title: 'Prepare logging a meal',
      description:
        'Step 1 of logging what the user cooked ("tối nay nấu canh chua", "vừa làm bánh táo xong"). Returns what the ' +
        'recipes in the sổ say was used from the pantry and what was probably bought, the full pantry with ids, and ' +
        'the streaks that can be ticked. Nothing is saved.\n\n' +
        'Then SHOW the user the proposed pantry use in plain words and ask them to confirm or correct amounts before ' +
        'calling log_meal — logging takes food out of the pantry, and the user decided "hỏi rồi mới trừ". For dishes ' +
        'without a recipe, propose pantry items yourself from the pantry list, but only ids that are on it. ' +
        'Seasoning with no amount ("nước mắm vừa ăn") should not be deducted unless the user says it ran out.',
      inputSchema: {
        dishes: z.array(dishShape).min(1).max(10),
      },
    },
    async ({ dishes }) => {
      const resolved = await resolveDishes(dishes)
      const recipeIds = resolved.map((d) => d.recipeId).filter((id): id is string => Boolean(id))
      const [proposal, pantry, streaks] = await Promise.all([
        proposeMeal(db, principal.userId, recipeIds),
        listPantry(db, principal.userId),
        streakCards(db, principal.userId),
      ])
      const today = vnDate()
      const usable = pantry.filter((p) => p.expiresOn == null || p.expiresOn >= today)
      const amount = (q: number | null, u: string | null) => (q != null ? `${formatQuantity(q)}${u ? ` ${u}` : ''}` : 'còn')

      const lines = [
        'Món:',
        ...resolved.map((d) => `- ${d.name}${d.recipeId ? ` (công thức ${d.recipeId})` : ' (không có công thức)'}`),
        '',
        'Đề xuất dùng từ tủ (theo công thức):',
        ...(proposal.used.length
          ? proposal.used.map(
              (u) => `- ${u.pantryItemId} · ${u.name} · dùng ${u.amount || '(không ghi lượng — mặc định không trừ)'}${u.have ? ` · tủ còn ${u.have}` : ''} · cho ${u.forDish}`,
            )
          : ['- (không có)']),
        '',
        'Đề xuất mua thêm (công thức cần, tủ không có):',
        ...(proposal.bought.length ? proposal.bought.map((b) => `- ${b.name} · ${b.amount} · cho ${b.forDish}`) : ['- (không có)']),
        '',
        'Tủ lạnh hiện có (id · tên · lượng):',
        ...(usable.length ? usable.map((p) => `- ${p.id} · ${p.name} · ${amount(p.quantity, p.unit)}`) : ['- (trống)']),
        '',
        'Streak tick được khi ghi bữa (id · tên · hôm nay):',
        ...(streaks.filter((s) => s.trigger === 'tick').map((s) => `- ${s.id} · ${s.name} · ${s.doneToday ? 'đã tick' : 'chưa tick'}`) || []),
        ...streaks.filter((s) => s.trigger !== 'tick').map((s) => `- (tự tính) ${s.name}`),
      ]
      return text(lines.join('\n'))
    },
  )

  server.registerTool(
    'log_meal',
    {
      title: 'Log a meal and update the pantry',
      description:
        'Step 2: save the meal to the journal and apply it to the kitchen, after the user confirmed (see propose_meal). ' +
        'In one transaction: the journal entry, pantry deductions, ticks on matching shopping-list lines, ticked ' +
        'streaks, and wishes on the "muốn chinh phục" board this meal conquers.\n\n' +
        'Amounts are free text like the app: "400 g", "2 quả", "nửa bó", "hết" (used it all). An empty amount records ' +
        'the item without deducting. Deduction happens in grams when both sides can be weighed, else in the pantry\'s ' +
        'own unit; otherwise the item is left untouched and reported — tell the user which. Photos can only be added ' +
        'in the app.',
      inputSchema: {
        dishes: z.array(dishShape).min(1).max(10),
        cooked_on: z.string().optional().describe('YYYY-MM-DD, Vietnam date. Default today. "tối qua" = yesterday.'),
        note: z.string().optional().describe('Lời người dùng về bữa ăn, nếu có.'),
        used: z
          .array(z.object({ pantry_item_id: z.string(), amount: z.string() }))
          .optional()
          .describe('Pantry items used, ids from propose_meal / list_pantry, as the user confirmed.'),
        bought: z
          .array(z.object({ name: z.string(), amount: z.string().optional() }))
          .optional()
          .describe('Bought for this meal (not added to the pantry).'),
        streak_ids: z.array(z.string()).optional().describe('Tick streaks the user wants counted (ids from propose_meal).'),
      },
    },
    async ({ dishes, cooked_on, note, used, bought, streak_ids }) => {
      const parsed = mealInput.safeParse({
        cookedOn: cooked_on ?? vnDate(),
        dishes: await resolveDishes(dishes),
        note: note ?? null,
        used: (used ?? []).map((u) => ({ pantryItemId: u.pantry_item_id, amount: u.amount })),
        bought: (bought ?? []).map((b) => ({ name: b.name, amount: b.amount ?? '' })),
        streakIds: streak_ids ?? [],
      })
      if (!parsed.success) return text(`Rejected — ${firstIssue(parsed.error)}`)
      if (parsed.data.cookedOn > vnDate()) return text('Rejected — cooked_on is in the future.')

      const result = await createMeal(db, principal.userId, parsed.data, null)
      const { reduced, removed, unchanged } = result.pantry
      const lines = [
        `Đã ghi bữa ${parsed.data.dishes.map((d) => d.name).join(', ')} (${parsed.data.cookedOn}).`,
        reduced.length ? `Trừ bớt trong tủ: ${reduced.join(', ')}.` : null,
        removed.length ? `Đã hết, bỏ khỏi tủ: ${removed.join(', ')}.` : null,
        unchanged.length ? `Chưa trừ được (khác đơn vị với trong tủ): ${unchanged.join(', ')}.` : null,
        result.conquered.length ? `Chinh phục món trên bảng: ${result.conquered.join(', ')}!` : null,
        '',
        `${baseUrl}/journal/${result.entryId}`,
      ]
      return text(lines.filter((l) => l !== null).join('\n'))
    },
  )

  return server
}

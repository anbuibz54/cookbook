/**
 * Import the shared nutrition reference into `cookbook.foods`.
 *
 *   pnpm foods:import [path/to/.data/usda]
 *
 * 1. USDA FoodData Central — Foundation Foods and SR Legacy, CSV releases,
 *    unzipped under `.data/usda/` (gitignored). Download from
 *    https://fdc.nal.usda.gov/download-datasets/ — public domain (CC0).
 * 2. Vietnamese names from `data/foods-vi.json`, matched on the exact USDA
 *    description. Marked `name_vi_reviewed = false`: machine-translated.
 * 3. The Vietnamese Food Composition Table, if `.data/vn-fct/vn-fct.json`
 *    exists (made by scripts/parse-vn-fct.py; copyrighted, never committed).
 *
 * Idempotent: foods upsert on (source, source_ref) and their portions are
 * replaced, so re-running after a new USDA release or an edit to the names
 * file is safe. Recipe links survive because food ids do not change.
 *
 * Streams the big CSVs line by line; the whole SR Legacy nutrient table is
 * never in memory at once.
 */

import { createReadStream, existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '../src/server/db/index.ts'
import { foodPortions, foods } from '../src/server/db/schema.ts'
import { normalizeForSearch } from '../src/lib/text.ts'
import { densityFromPortions, portionKey, type Portion } from '../src/lib/units.ts'

const root = process.argv[2] ?? '.data/usda'

/* -------------------------------------------------------------------------- */
/* CSV                                                                         */
/* -------------------------------------------------------------------------- */

/** RFC 4180 fields on one line. USDA's CSVs quote every field and have no embedded newlines. */
function parseLine(line: string): string[] {
  const out: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { out.push(field); field = '' }
    else field += c
  }
  out.push(field)
  return out
}

async function eachRow(file: string, fn: (row: Record<string, string>) => void) {
  const lines = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity })
  let header: string[] | null = null
  for await (const line of lines) {
    if (!line) continue
    const cells = parseLine(line.replace(/^﻿/, ''))
    if (!header) { header = cells; continue }
    const row: Record<string, string> = {}
    header.forEach((h, i) => { row[h] = cells[i] ?? '' })
    fn(row)
  }
}

/** The release folders unzip one level deeper than their zip name. */
function datasetDirs(): string[] {
  if (!existsSync(root)) throw new Error(`No ${root}. Download and unzip the USDA CSV releases there first.`)
  const found: string[] = []
  const walk = (dir: string, depth: number) => {
    if (existsSync(join(dir, 'food.csv')) && existsSync(join(dir, 'food_nutrient.csv'))) found.push(dir)
    else if (depth < 3) for (const e of readdirSync(dir, { withFileTypes: true })) if (e.isDirectory()) walk(join(dir, e.name), depth + 1)
  }
  walk(root, 0)
  if (found.length === 0) throw new Error(`No USDA CSV release found under ${root}.`)
  return found
}

/* -------------------------------------------------------------------------- */
/* USDA                                                                        */
/* -------------------------------------------------------------------------- */

const DATA_TYPES = new Set(['foundation_food', 'sr_legacy_food'])

/**
 * Dropped: not ingredients. Baby food, fast food and restaurant dishes are
 * finished meals under brand names, and would crowd "egg" searches with
 * "McDONALD'S, Egg McMUFFIN".
 */
const SKIP_CATEGORIES = new Set([
  'Baby Foods',
  'Fast Foods',
  'Meals, Entrees, and Side Dishes',
  'Restaurant Foods',
  'American Indian/Alaska Native Foods',
])

/** FDC nutrient ids. Energy has three encodings depending on dataset; see pickEnergy. */
const N = {
  energy: '1008', energyAtwaterGeneral: '2047', energyAtwaterSpecific: '2048',
  protein: '1003', fat: '1004', carbs: '1005', carbsSummation: '1050',
  fiber: '1079', sugars: '2000', sugarsNlea: '1063', sodium: '1093',
} as const
const WANTED = new Set<string>(Object.values(N))

type Parsed = {
  fdcId: string
  dataType: string
  description: string
  category: string
  nutrients: Map<string, number>
  portions: Portion[]
}

async function readDataset(dir: string): Promise<Parsed[]> {
  const categories = new Map<string, string>()
  await eachRow(join(dir, 'food_category.csv'), (r) => categories.set(r.id, r.description))

  const units = new Map<string, string>()
  await eachRow(join(dir, 'measure_unit.csv'), (r) => units.set(r.id, r.name))

  const byId = new Map<string, Parsed>()
  await eachRow(join(dir, 'food.csv'), (r) => {
    if (!DATA_TYPES.has(r.data_type)) return
    const category = categories.get(r.food_category_id) ?? ''
    if (SKIP_CATEGORIES.has(category)) return
    byId.set(r.fdc_id, {
      fdcId: r.fdc_id, dataType: r.data_type, description: r.description.trim(), category,
      nutrients: new Map(), portions: [],
    })
  })

  await eachRow(join(dir, 'food_nutrient.csv'), (r) => {
    if (!WANTED.has(r.nutrient_id)) return
    const food = byId.get(r.fdc_id)
    const amount = Number(r.amount)
    if (food && r.amount !== '' && Number.isFinite(amount)) food.nutrients.set(r.nutrient_id, amount)
  })

  await eachRow(join(dir, 'food_portion.csv'), (r) => {
    const food = byId.get(r.fdc_id)
    if (!food) return
    const unitName = r.measure_unit_id === '9999' ? '' : (units.get(r.measure_unit_id) ?? '')
    const label = [unitName, r.modifier, r.portion_description].map((s) => s?.trim()).filter(Boolean).join(', ')
    const key = portionKey(label)
    const amount = Number(r.amount) || 1
    const grams = Number(r.gram_weight)
    if (!key || !(grams > 0)) return
    food.portions.push({ unit: key, label, grams: grams / amount })
  })

  return [...byId.values()]
}

/**
 * SR Legacy reports energy as 1008. Foundation Foods mostly reports the
 * Atwater calculations instead (2047 general, 2048 specific). Only when a food
 * has none of them is energy computed from macros with 4/9/4.
 */
function toRow(f: Parsed) {
  const n = f.nutrients
  const protein = n.get(N.protein)
  const fat = n.get(N.fat)
  if (protein == null || fat == null) return null

  const energy = n.get(N.energy) ?? n.get(N.energyAtwaterGeneral) ?? n.get(N.energyAtwaterSpecific)
  let carbs = n.get(N.carbs) ?? n.get(N.carbsSummation)
  let carbsDerived = false
  if (carbs == null) {
    if (energy == null) return null
    carbs = Math.max(0, (energy - 4 * protein - 9 * fat) / 4)
    carbsDerived = true
  }
  const kcal = energy ?? 4 * protein + 9 * fat + 4 * carbs

  return {
    source: 'usda' as const,
    sourceRef: f.fdcId,
    nameEn: f.description,
    category: f.category,
    kcal,
    proteinG: protein,
    fatG: fat,
    carbsG: carbs,
    fiberG: n.get(N.fiber) ?? null,
    sugarG: n.get(N.sugars) ?? n.get(N.sugarsNlea) ?? null,
    sodiumMg: n.get(N.sodium) ?? null,
    densityGPerMl: densityFromPortions(f.portions),
    extra: {
      fdcDataType: f.dataType,
      ...(energy == null ? { kcalDerived: true } : {}),
      ...(carbsDerived ? { carbsDerived: true } : {}),
    },
    searchText: normalizeForSearch(f.description),
  }
}

/* -------------------------------------------------------------------------- */
/* Write                                                                       */
/* -------------------------------------------------------------------------- */

const BATCH = 500

async function upsertUsda(parsed: Parsed[]) {
  const rows = parsed.map((f) => ({ f, row: toRow(f) })).filter((x) => x.row != null)
  const skipped = parsed.length - rows.length

  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    const saved = await db
      .insert(foods)
      .values(chunk.map((x) => x.row!))
      .onConflictDoUpdate({
        target: [foods.source, foods.sourceRef],
        // Vietnamese names, aliases and review state belong to the names file
        // and to people, not to USDA — never overwritten here.
        set: {
          nameEn: sql`excluded.name_en`,
          category: sql`excluded.category`,
          kcal: sql`excluded.kcal`,
          proteinG: sql`excluded.protein_g`,
          fatG: sql`excluded.fat_g`,
          carbsG: sql`excluded.carbs_g`,
          fiberG: sql`excluded.fiber_g`,
          sugarG: sql`excluded.sugar_g`,
          sodiumMg: sql`excluded.sodium_mg`,
          densityGPerMl: sql`excluded.density_g_per_ml`,
          extra: sql`excluded.extra`,
        },
      })
      .returning({ id: foods.id, sourceRef: foods.sourceRef })

    const idByRef = new Map(saved.map((s) => [s.sourceRef, s.id]))
    const ids = saved.map((s) => s.id)
    await db.delete(foodPortions).where(inArray(foodPortions.foodId, ids))
    const portions = chunk.flatMap((x) =>
      x.f.portions.map((p) => ({ foodId: idByRef.get(x.f.fdcId)!, unit: p.unit, label: p.label, grams: p.grams })),
    )
    for (let j = 0; j < portions.length; j += 2000) {
      await db.insert(foodPortions).values(portions.slice(j, j + 2000))
    }
    process.stdout.write(`\r  ${Math.min(i + BATCH, rows.length)}/${rows.length} foods`)
  }
  process.stdout.write('\n')
  return { imported: rows.length, skipped }
}

type NameEntry = { en: string; vi: string; aliases?: string[] }

/**
 * Apply `data/foods-vi.json`. Each entry names one USDA description exactly;
 * a description that matches nothing is reported, never guessed at.
 */
async function applyVietnameseNames() {
  const entries: NameEntry[] = JSON.parse(readFileSync('data/foods-vi.json', 'utf8'))
  const unmatched: string[] = []
  let applied = 0

  let keptReviewed = 0

  // The file is the source of truth for unreviewed names: clear them first, so
  // a name moved to a different USDA row or deleted from the file does not linger.
  await db
    .update(foods)
    .set({ nameVi: null, aliases: [], searchText: sql`lower(${foods.nameEn})` })
    .where(and(eq(foods.source, 'usda'), isNull(foods.userId), eq(foods.nameViReviewed, false), sql`${foods.nameVi} is not null`))

  for (const e of entries) {
    const aliases = e.aliases ?? []
    const target = and(eq(foods.source, 'usda'), isNull(foods.userId), eq(foods.nameEn, e.en))

    // The same description can exist in both Foundation and SR Legacy. Name
    // only one, or "tỏi" returns two near-identical rows: the one with portion
    // weights (usable for "3 tép tỏi"), and on a tie the newer Foundation data.
    const matches = await db
      .select({
        id: foods.id,
        reviewed: foods.nameViReviewed,
        dataType: sql<string>`${foods.extra}->>'fdcDataType'`,
      })
      .from(foods)
      .where(target)
    if (matches.length === 0) { unmatched.push(e.en); continue }

    // Counted in a separate query on purpose: a correlated subquery here
    // rendered `foods.id` unqualified, which bound to `food_portions.id` and
    // counted zero for every row — silently naming the portion-less duplicate.
    const counts = await db
      .select({ foodId: foodPortions.foodId, n: sql<number>`count(*)::int` })
      .from(foodPortions)
      .where(inArray(foodPortions.foodId, matches.map((m) => m.id)))
      .groupBy(foodPortions.foodId)
    const portionCount = new Map(counts.map((c) => [c.foodId, Number(c.n)]))

    const best = matches.sort(
      (a, b) =>
        (portionCount.get(b.id) ?? 0) - (portionCount.get(a.id) ?? 0) ||
        Number(b.dataType === 'foundation_food') - Number(a.dataType === 'foundation_food'),
    )[0]

    // A name someone has reviewed (and maybe corrected) in the app wins over the file.
    if (best.reviewed) { keptReviewed++; continue }

    await db
      .update(foods)
      .set({ nameVi: e.vi, aliases, searchText: normalizeForSearch(e.vi, ...aliases, e.en) })
      .where(eq(foods.id, best.id))
    applied++
  }

  return { entries: entries.length, applied, keptReviewed, unmatched }
}

/* -------------------------------------------------------------------------- */
/* Vietnamese Food Composition Table                                           */
/* -------------------------------------------------------------------------- */

type VnFood = {
  code: number
  name_vi: string
  name_en: string
  group: string | null
  waste_pct: number | null
  water_g: number | null
  kcal: number | null
  protein_g: number | null
  fat_g: number | null
  carbs_g: number | null
  fiber_g: number | null
  sugar_g: number | null
  sodium_mg: number | null
}

const VN_FCT = '.data/vn-fct/vn-fct.json'

/**
 * Bảng thành phần thực phẩm Việt Nam (Viện Dinh dưỡng, 2007), parsed from the
 * PDF by scripts/parse-vn-fct.py. Copyrighted: the parsed file lives in the
 * gitignored .data/ and is imported only into this private database.
 *
 * Its Vietnamese names are the institute's own, so they count as reviewed.
 * A "-" for fat in the table (mostly leafy vegetables) means not analysed;
 * it is stored as 0 and flagged, since those foods are near fat-free and the
 * table's own energy value already reflects that.
 */
async function upsertVnFct() {
  const rows = (JSON.parse(readFileSync(VN_FCT, 'utf8')) as VnFood[])
    .filter((f) => f.kcal != null && f.protein_g != null && f.carbs_g != null)
    .map((f) => {
      const nameVi = f.name_vi.charAt(0).toLowerCase() + f.name_vi.slice(1)
      const nameEn = f.name_en && f.name_en !== '-' ? f.name_en.replace(/\.$/, '') : null
      return {
        source: 'vn_fct' as const,
        sourceRef: String(f.code),
        nameVi,
        nameViReviewed: true,
        nameEn,
        category: f.group,
        kcal: f.kcal!,
        proteinG: f.protein_g!,
        fatG: f.fat_g ?? 0,
        carbsG: f.carbs_g!,
        fiberG: f.fiber_g,
        sugarG: f.sugar_g,
        sodiumMg: f.sodium_mg,
        densityGPerMl: null,
        extra: {
          wastePct: f.waste_pct,
          waterG: f.water_g,
          ...(f.fat_g == null ? { fatNotMeasured: true } : {}),
        },
        searchText: normalizeForSearch(nameVi, nameEn),
      }
    })

  for (let i = 0; i < rows.length; i += BATCH) {
    await db
      .insert(foods)
      .values(rows.slice(i, i + BATCH))
      .onConflictDoUpdate({
        target: [foods.source, foods.sourceRef],
        set: {
          nameVi: sql`excluded.name_vi`,
          nameEn: sql`excluded.name_en`,
          category: sql`excluded.category`,
          kcal: sql`excluded.kcal`,
          proteinG: sql`excluded.protein_g`,
          fatG: sql`excluded.fat_g`,
          carbsG: sql`excluded.carbs_g`,
          fiberG: sql`excluded.fiber_g`,
          sugarG: sql`excluded.sugar_g`,
          sodiumMg: sql`excluded.sodium_mg`,
          extra: sql`excluded.extra`,
          searchText: sql`excluded.search_text`,
        },
      })
  }
  return rows.length
}

/* -------------------------------------------------------------------------- */

for (const dir of datasetDirs()) {
  console.log(`Reading ${dir}`)
  const parsed = await readDataset(dir)
  const { imported, skipped } = await upsertUsda(parsed)
  console.log(`  imported ${imported}, skipped ${skipped} without protein/fat data`)
}

if (existsSync('data/foods-vi.json')) {
  const names = await applyVietnameseNames()
  console.log(
    `Vietnamese names: ${names.applied} foods from ${names.entries} entries` +
      (names.keptReviewed ? `, ${names.keptReviewed} already reviewed and left alone` : ''),
  )
  if (names.unmatched.length) {
    console.log(`  ${names.unmatched.length} descriptions matched no USDA food:\n  - ${names.unmatched.join('\n  - ')}`)
  }
}

if (existsSync(VN_FCT)) {
  console.log(`Vietnamese Food Composition Table: ${await upsertVnFct()} foods`)
} else {
  console.log(`Skipping the Vietnamese table: no ${VN_FCT} (run scripts/parse-vn-fct.py first)`)
}

const bySource = await db
  .select({ source: foods.source, count: sql<number>`count(*)::int` })
  .from(foods)
  .where(isNull(foods.userId))
  .groupBy(foods.source)
console.log(`Reference foods in database: ${bySource.map((s) => `${s.source} ${s.count}`).join(', ')}`)
process.exit(0)

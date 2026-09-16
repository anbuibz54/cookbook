# Cookbook

Context file for Claude Code. Framework rules live in `AGENTS.md` — this is
Next.js 16, which differs from older versions in ways that matter.

@AGENTS.md

## What this is

A personal recipe book — beautiful, detailed, honest nutrition — that an AI
client can write into over MCP. Personal first; other people may use it later
(every row is already scoped by `user_id`).

Main flow: the user sees a dish (a video, a page, mum's dictation), tells Claude
"save this", Claude extracts it and calls `create_recipe` with foods linked.
**Video understanding happens in the AI client, not here** (for now — video
analysis is deferred). Other in-app AI features are wanted later (see Deferred).

The user is Vietnamese: UI copy and recipe content are Vietnamese.

Sister repo: `../bakery` (the bakery's ordering site). Its products will point at
recipes here for nutrition labels, cost, and bake-day production lists.

## Stack

Same as LifeOS (`C:\D\LifeOS`) — read its CLAUDE.md for the reasoning; the rules
carry over unchanged:

- Next.js (App Router) + TypeScript, Vercel. PWA later.
- Supabase Postgres via Drizzle; Supabase Auth; `@modelcontextprotocol/sdk`,
  streamable HTTP, **stateless**, bearer token per user.
- All data access goes through `src/server/`. **Nothing in `src/server/` imports
  `next/*`.** Route handlers and server actions are thin.
- Session pooler (5432) for runtime and migrations. Never 6543.
- Every foreign key gets an index. Migrations only go forward.

### Shared database — read before touching migrations

This app lives in the **LifeOS Supabase project**. LifeOS owns `public`; the
bakery owns `bakery`; this app owns `cookbook`.

- Declare everything through `cookbook.table(...)` / `cookbook.enum(...)` in
  `src/server/db/schema.ts`. A bare `pgTable`/`pgEnum` lands in `public`, where
  LifeOS already has enums with the same names.
- `drizzle.config.ts` sets `schemaFilter: ['cookbook']` and keeps the migration
  journal in `cookbook.__drizzle_migrations`. Do not remove either — a shared
  journal makes the migrator silently skip migrations.
- **Gotcha, hit once:** drizzle-kit creates the `cookbook` schema (for its journal)
  *before* running migration 0000, so a generated `CREATE SCHEMA "cookbook"`
  fails. 0000 was edited to `CREATE SCHEMA IF NOT EXISTS`. Only matters again if
  migrations are ever squashed/regenerated from scratch.
- Always read the generated SQL before `pnpm db:migrate`: it must not mention
  `public` or `bakery`.
- There is no staging database. It is LifeOS's production data.
- Pool `max: 3` — three apps share the pooler's connection limit.

Auth users are shared with LifeOS (same login). There is no sign-up page here.

## Schema (`src/server/db/schema.ts`)

- **recipes** — header. `servings` is a number (scaling divides by it);
  `yield_label` says what a serving is. `search_text` is normalised (no
  diacritics, `đ`→`d`) and rewritten on every save.
- **recipe_ingredients** — ordered, optional `section`. `quantity` null = "vừa
  ăn", never scales. `food_id` nullable: unlinked is normal, it shows as a
  nutrition gap. `grams` + `grams_source` (`mass` exact / `volume` via density /
  `estimate`).
- **recipe_steps** — ordered, optional `section`, `timer_seconds`.
- **recipe_versions** — append-only jsonb snapshot of the *previous* recipe,
  written on every update with a `change_note`. The "tweaks" history.
- **foods** — nutrients per 100 g edible portion. `user_id` null = shared
  reference data; set = user-added. `source` ranks trust: `usda`, `vn_fct` >
  `label` > `ai_estimate`. `name_vi_reviewed` false = machine-translated name
  (numbers unaffected). `extra` holds dataset specifics (`fdcDataType`,
  `wastePct` = thải bỏ %, `fatNotMeasured`).
- **food_portions** — measured weight of one household unit per food ("1
  large" egg = 50 g, "1 clove" garlic = 3 g), `unit` normalised by
  `portionKey` in `src/lib/units.ts`. From USDA only.
- **users**, **mcp_tokens** — as LifeOS (hash-only tokens, prefix `cookbook_`).

### Nutrition (`src/lib/nutrition.ts`)

Computed on read, never stored (a stored copy goes stale when a food's numbers
are corrected). Every result carries coverage (`counted/countable`, `missing`)
and a confidence (`good` / `approximate` / `rough`). **Honesty is the feature**:
never show a kcal number without its coverage and confidence. Optional
ingredients are excluded.

Grams precedence: mass unit (exact) > volume × food density > portion with the
same unit > count word × typical portion (`quả` → medium, `tép` → clove) >
supplied estimate. Portion-derived weights make a recipe `approximate`.
Units table: `src/lib/units.ts` (includes muỗng canh/cà phê, chén, lạng = 100 g).

### Reference data (`pnpm foods:import`)

`scripts/import-foods.mts`, idempotent (upsert on `source, source_ref`; food ids
stay stable so recipe links survive a re-import):

1. **USDA FoodData Central** — Foundation Foods + SR Legacy CSVs unzipped under
   `.data/usda/` (gitignored; download from fdc.nal.usda.gov/download-datasets).
   Public domain. ~7,150 foods after dropping baby/fast/restaurant food.
   Energy: 1008, else Atwater 2047/2048, else 4/9/4.
2. **Vietnamese names** — `data/foods-vi.json` (committed): exact USDA
   description → `vi` + aliases, ~270 common ingredients, AI-translated so
   `name_vi_reviewed = false`. When a description exists in both USDA datasets,
   the row with portions gets the name. A name reviewed in the app is never
   overwritten by the file.
3. **Bảng thành phần thực phẩm Việt Nam** (Viện Dinh dưỡng, 2007) — 524 foods.
   `python scripts/parse-vn-fct.py <pdf> .data/vn-fct/vn-fct.json` (pdfplumber;
   converts the TCVN3-encoded names), then the import picks it up.
   **Copyrighted: the parsed JSON stays in `.data/`, never commit it.** No portions.

Search (`searchFoods`): all words must match; ranked user foods → name starts
with the query as whole words → phrase anywhere → has a Vietnamese name → shorter.

## MCP (`src/server/mcp/server.ts`)

Six tools: `search_recipes`, `get_recipe` (optional scaling), `create_recipe`,
`update_recipe` (full-list replacement, snapshots history), `search_foods`,
`create_food`. **Descriptions are the prompt** — the product rules (link foods,
label estimates honestly, credit sources, rewrite steps in own words) live there.

Deliberately absent: `delete_recipe` (belongs in the app, where it is visible).

`get_recipe` returns JSON in exactly the shape `update_recipe` accepts, so a model
can round-trip it.

Tokens: Settings page in the app, or `pnpm mcp:token <email> [name]`.
Connect Claude Code:
`claude mcp add --transport http cookbook http://localhost:3100/api/mcp --header "Authorization: Bearer <token>"`

## Commands

- `pnpm dev` — port 3100 (LifeOS uses 3000)
- `pnpm typecheck` / `pnpm lint` / `pnpm build`
- `pnpm db:generate` → read the SQL → `pnpm db:migrate`
- `COOKBOOK_TOKEN=… pnpm mcp:smoke [baseUrl] [--keep]` — end-to-end MCP test
  against a running server. Checks nutrition arithmetic, scaling, diacritic
  search, update history, and USDA portion/density conversion (needs the
  reference import); deletes its `[smoke]` rows afterwards.
- `pnpm foods:import` — reference data, see above.
- The dev machine is short on memory: stop `pnpm dev` when done, and don't run
  it alongside a big import.

## Design (decided 2026-09-16)

Mockups: artifact "Sổ công thức UI" — sources in `design/mockups/*.dc.html`
(edit those and re-seed with the `design` skill; the assembled `.html` is
gitignored).

Two voices in one system:

- **Playful** (home, primary buttons, add button): Baloo 2, 2px `ink` borders,
  offset shadow (`shadow-pop`), colour tiles.
- **Data-dense** (recipe, list): Lexend body, JetBrains Mono for every digit,
  white cards with a thin `line` border, gram/kcal table.

Palette "Hồng sữa" — tokens in `globals.css`, used through Tailwind (`bg-surface`,
`text-muted`, `border-line`, `bg-primary`…): background `#FBF1F0`, surface white,
ink `#241A1C`, muted `#756468`, line `#E9D9D8`, primary/fat `#D9607E`, protein
`#4E9E86`, carbs `#E0A93C`. **Protein / fat / carbs must keep distinct hues** —
the energy bar is only readable by colour. Light mode only; cook mode gets its
own dark screen rather than an inverted theme.

Screens built: `/` home, `/recipes` list, `/recipes/[id]` detail (servings
stepper scales quantities client-side; per-serving nutrition stays fixed),
`/recipes/[id]/cook` cook mode, `/recipes/new` (explains that recipes arrive
via Claude), `/settings`.

### Cook mode

Its own dark screen (`--cook-*` tokens), not an inverted theme. Three things
that are easy to get wrong and are already decided:

- The countdown stores a **deadline**, not a decremented counter: phones
  throttle timers when the screen dims, and a counter drifts silently.
- The timer is `<StepTimer key={step.id}>`, so changing step remounts a fresh
  stopped timer instead of resetting state in an effect.
- Wake Lock is re-requested on `visibilitychange` (the lock dies when the page
  hides) and the "màn hình luôn sáng" line only shows when a lock is held.

"Nguyên liệu nhắc trong bước này" is matched from the step's text
(`src/lib/cook.ts`) — steps are not linked to ingredients in the schema.
**Conservative on purpose: a missing line is fine, a wrong one is not.**
`pnpm check:cook` locks that behaviour in, including two accepted misses.

## Deferred — do not build yet
- In-app AI (Claude API): paste text/photo → structured recipe, suggestions.
  Wanted, not yet scoped.
- Video analysis (in-app). Deferred by the user.
- Reviewing machine-translated food names in the app (flip `name_vi_reviewed`).
- Using `wastePct` for as-bought quantities ("1 kg cá" includes bones).
- Recipe editing form in the web app, delete, photos (Supabase Storage),
  cook mode, sharing, meal plans, shopping lists, cost per serving.
- Deploy (Vercel) — see LifeOS `docs/DEPLOY.md` for the checklist.

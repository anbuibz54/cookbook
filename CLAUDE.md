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
  reference data (future USDA / Vietnamese table import); set = user-added.
  `source` ranks trust: `usda`, `vn_fct` > `label` > `ai_estimate`.
- **users**, **mcp_tokens** — as LifeOS (hash-only tokens, prefix `cookbook_`).

### Nutrition (`src/lib/nutrition.ts`)

Computed on read, never stored (a stored copy goes stale when a food's numbers
are corrected). Every result carries coverage (`counted/countable`, `missing`)
and a confidence (`good` / `approximate` / `rough`). **Honesty is the feature**:
never show a kcal number without its coverage and confidence. Optional
ingredients are excluded.

Grams precedence: mass unit (exact) > volume × food density > supplied estimate.
Units table: `src/lib/units.ts` (includes muỗng canh/cà phê, chén, lạng = 100 g).

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
  search, update history; deletes its `[smoke]` rows afterwards.

## Deferred — do not build yet

- **UI design.** Current pages are deliberately plain placeholders (tokens in
  `globals.css`); the real design is still to be discussed with the user.
- In-app AI (Claude API): paste text/photo → structured recipe, suggestions.
  Wanted, not yet scoped.
- Video analysis (in-app). Deferred by the user.
- USDA FoodData Central + Vietnamese food composition table import into `foods`
  (`user_id` null). Until then foods come from `create_food`.
- Recipe editing form in the web app, delete, photos (Supabase Storage),
  cook mode, sharing, meal plans, shopping lists, cost per serving.
- Deploy (Vercel) — see LifeOS `docs/DEPLOY.md` for the checklist.

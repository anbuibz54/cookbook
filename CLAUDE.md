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

## Kitchen: pantry, suggestions, shopping

**The split that defines this feature: the app decides WHAT, Claude decides
WHERE.** "Which recipes can I cook" is set arithmetic against the pantry
(`suggestFromPantry`) — exact, instant, free, and it must stay that way; an LLM
would occasionally invent an ingredient you have. Sorting the shopping list by
shop needs web search and local knowledge, so it is Claude's, through
`assign_shopping_stores`. The app never calls a search engine.

- **pantry_items** — one row per thing (unique on `match_key`). Amounts and
  `expires_on` are optional: "còn hành lá" is a valid entry and still answers
  "nấu được món này không".
- **Matching** (`src/lib/match.ts`): `matchKey` strips diacritics, case and a
  few *trailing* prep words ("thịt ba chỉ thái lát" → "thit ba chi"); `covers`
  only accepts a PREFIX relation (qualifiers come after the noun). **A false
  match is the dangerous failure** — it tells you that you have something you
  do not. Two that shipped and were fixed: a suffix rule made "sữa tươi không
  đường" cover "đường"; noise words that collide once diacritics are gone
  ("lạt"/"lát", "tươi", "ăn", "nhỏ"/"nho") turned "bơ lạt" into "bơ".
  `pnpm check:match` holds these pairs apart; add a case before changing either
  function, and run `pnpm rekey:match` afterwards — the key is stored.
- Expired pantry items (`expires_on` before today, in Vietnam's calendar) do not
  count as available.
- Suggestions ignore optional lines and lines with no amount ("muối, vừa ăn"):
  nobody shops for those, and counting them makes every recipe look short.
  Ranking: fewest missing → uses something expiring within 3 days → most
  recently updated.
- **stores** — four fixed kinds (`bhx`, `cho`, `sieu_thi`, `online`) so the list
  groups the same way weekly; branch name, address and Maps URL come from Claude.
- **shopping_items** — same-name lines merge (amounts add when the unit matches,
  otherwise the second amount lands in the note). `bought_at` is a soft tick.
- After cooking, the pantry is updated by logging the meal (see Journal).
  `/recipes/[id]/done` only redirects to `/log?recipe=<id>` now.

## Journal (phase 1 of "nhật ký & động lực", built 2026-09-16)

The daily log, and the moment the pantry learns what was used. Mockups: page
"Nhật ký & động lực" in the design canvas. Planned phases: 1 journal (done) →
2 streaks, goals, wish board, photo wall, "Thành tích" tab (done) → 3 in-app AI (done)
(multi-provider, keys encrypted per user) → 4 web push reminders per streak
(Supabase `pg_cron` + `pg_net`, enabled by the user) → 5 monthly share card.

- **journal_entries** (`cooked_on` is a Vietnam-calendar date, see
  `src/lib/dates.ts`), **journal_dishes** (`recipe_id` null = no recipe;
  kept per dish so "món mới" can be counted), **journal_items** (`used` from
  the pantry / `bought`; copies of name and amount, not live links).
- `/log`: pick dishes → `proposeMeal` (recipe × pantry, same matching and
  expiry rules as suggestions, **no AI**) → cook ticks and edits → `createMeal`
  does entry + pantry + shopping ticks in ONE transaction.
- The amount box is free text (`src/lib/amount.ts`, `pnpm check:amount`):
  "400 g", "2 quả", "nửa bó", "hết". Subtraction happens in grams when both
  sides weigh, else in the pantry unit when it matches, else not at all and the
  saved banner names the item. Blank = record only. "Vừa ăn" lines start
  unticked: ticking "nước mắm" must never empty the bottle.
- Bought items tick open shopping lines one way only ("hành lá tươi" ticks
  "hành lá"; "hành" does not tick "hành tây").
- Deleting a meal does not refill the pantry, and the confirm says so.
- **Photos**: private bucket `cookbook-photos` (`pnpm storage:ensure`), path
  `<userId>/journal/<uuid>.jpg`, shrunk on the phone to 1600 px JPEG
  (`src/lib/photo.ts`) before a Server Action upload (body limit 5 MB in
  `next.config.ts`). Served by `/api/photos/[...path]`, which checks the path
  is the caller's and caches forever — paths are never reused.

## Motivation (phase 2, built 2026-09-16)

`src/server/motivation/service.ts`, screens `/achievements` (5th tab),
`/streaks/new` (`?preset=com-nha|nhat-ky|mon-moi`), `/streaks/[id]`, `/goals/new`,
`/wishes/new`; compact streak cards on Hôm nay.

- **Derive, do not store.** Only two things are stored: ticks for `tick`
  streaks (**streak_checkins**, cascade with the meal that ticked them) and the
  meal that conquered a wish (**wishes.conquered_entry_id**, set null when that
  meal is deleted). Streak days for `any_meal`/`new_dish`, goal progress and
  "món mới" are computed from the journal on every read, so deleting or
  back-dating a meal can never leave a number lying.
- **Món mới** (`dishHistory`): a dish is new when neither its recipe nor its
  normalised name appears in an earlier meal (`dishKeys`).
- **Streak rules** (`src/lib/streaks.ts`, pure, `pnpm check:streaks`): kinds
  `daily`, `daily_rest` (N misses per Mon–Sun week), `weekly` (N days per
  week, counted in weeks). Today never breaks a streak. Expect to get the
  weekday arithmetic in a test case wrong before the code — two cases were.
- **Goals**: `meals`, `new_dishes`, `tagged` (distinct recipes with the tag)
  over a date range; shown until 30 days after they end.
- **Wishes** are conquered inside the meal transaction (`conquerWishes`):
  same recipe, or same normalised name. MCP `add_wish` lets Claude pin one.
- `remind_at` is stored per streak ("HH:MM", Vietnam time) for phase 4; no
  notification is sent yet and the form says so.

## In-app AI (phase 3, built 2026-09-16)

`src/server/ai/`. The user brings their own provider and key; the app never
ships one.

- **ai_providers**: kind `anthropic` | `azure`, `model` (Anthropic model id, or
  the Azure DEPLOYMENT name), `endpoint` (Azure/Foundry resource URL, stored
  without `/openai/v1`), at most one `active` per user (partial unique index).
- **Keys**: AES-256-GCM under `AI_KEYS_SECRET` (`crypto.ts`), hint = last 4
  characters. Decrypted only inside `providers.ts` to build a model; no action
  or page ever returns a key. **Vercel needs the same AI_KEYS_SECRET as the
  machine that saved a key** — the database is shared, so a key saved locally is
  read by production. Losing the secret = users re-enter keys.
- **Vercel AI SDK v7** (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/azure`):
  `generateText({ output: Output.object({ schema }) })` (generateObject is
  deprecated), `instructions` not `system`, images as
  `{ type: 'file', mediaType, data }`. Azure/Foundry: `createAzure({ baseURL:
  `${endpoint}/openai/v1` })`, `providerOptions.azure.reasoningEffort: 'low'`.
  Structured-output schemas use `.nullable()`, never optional (Azure strict mode).
- Settings saves AND tests (a 1-word call) in one go, so a bad key shows where
  it was typed. `pnpm ai:from-env <email>` saves the `AZURE_OPENAI_*` values
  from .env.local as a user's provider.
- **Meal log** (`meal.ts`, button on /log when there is a photo or a dish
  without a recipe): the model guesses dishes from the photo, pantry use and
  purchases. Guards: pantry items only by code from the list it was given
  (unknown codes dropped); items already proposed from recipes are dropped;
  "bought" items the pantry already has are dropped. **AI pantry rows arrive
  unticked** (a wrong guess would empty the fridge); AI purchase rows ticked.
  The prompt makes it name the dish from the photo BEFORE reading the pantry —
  without that, gpt-5.4-nano called a canh chua "bún gà" because the fridge
  held chicken. nano is weak at recognising dishes; gpt-5.4-mini is the
  suggested upgrade. A call takes ~15 s with a photo.

## MCP (`src/server/mcp/server.ts`)

Fourteen tools. Recipes: `search_recipes`, `get_recipe` (optional scaling),
`create_recipe`, `update_recipe` (full-list replacement, snapshots history).
Foods: `search_foods`, `create_food`. Kitchen: `list_pantry`,
`save_pantry_items`, `remove_pantry_items`, `suggest_from_pantry`,
`get_shopping_list`, `add_to_shopping_list`, `assign_shopping_stores`.
Motivation: `add_wish`.

**Descriptions are the prompt** — the product rules (link foods, label estimates
honestly, credit sources, rewrite steps in own words, ask where the user lives
before guessing a district, never invent a branch address) live there.

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
- `pnpm check:match`, `pnpm check:cook` — the two name matchers; no database.
- `pnpm check:amount` — the meal-log amount parser; no database.
- `pnpm check:streaks` — streak rules; no database.
- `pnpm storage:ensure` — creates/refreshes the private photo bucket.
- `pnpm ai:from-env <email>` — saves .env.local's Azure settings as that user's AI provider.
- `pnpm seed:test` — (re)creates `cookbook.test@example.com` with sample data,
  password in `.env.local`. Wipes only that account. Resetting the password
  signs out any open session of it. Use it to check screens in a real browser;
  checking by eye found five bugs the smoke test could not.
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

Screens built: `/` "Hôm nay" (log CTA + journal feed; settings via the gear),
`/log`, `/journal/[id]`, `/achievements` + streak/goal/wish forms, `/recipes` list, `/recipes/[id]` detail (servings
stepper scales quantities client-side; per-serving nutrition stays fixed),
`/recipes/[id]/cook` cook mode (last step → `/log?recipe=`),
`/pantry`, `/shopping`, `/recipes/new` (explains that recipes arrive via
Claude), `/settings` (reached from the gear on Hôm nay, not the tab bar).

### Navigation

- **Tab bar lives in the root layout** (`TabBar`, shown only on `/`, `/recipes`,
  `/pantry`, `/shopping`, `/achievements`, `/settings`). Pages under it pad with `pb-32`. Do not
  render it from a page again — it would slide with the page.
- **Every page wraps its root in `<PageTransition>`**, and every internal link
  says what kind of move it is: `transitionTypes={['nav-forward']}` going deeper,
  `['nav-back']` coming out, `['tab']` between tabs. A new link without a type
  simply does not animate — acceptable, but tag it.
- **Every database-backed route has a `loading.tsx`** in the shape of the real
  screen (`src/components/skeleton.tsx`). Without one, a tap waits silently for
  the server. Cook mode's skeleton is dark on purpose.

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

## Phone: installable web app, not native (decided 2026-09-16)

Installable PWA: `src/app/manifest.ts`, icons drawn at build time
(`icon.tsx`, `apple-icon.tsx`, `icon-maskable/route.tsx` — no image files to
keep in sync), offline reading via `public/sw.js` (network first, cache as
fallback; never `/api/`, never a URL with a query string). iOS needs BOTH the
manifest and `appleWebApp.capable` in layout metadata, or an installed icon
opens in a browser tab. `proxy.ts` must keep excluding these paths — a manifest
redirected to /login silently kills installability.

**What a PWA cannot do, and why native is still on the table:** no alarm when a
timer ends while the app is closed (the 45-minute bake), no share sheet from
TikTok/YouTube, no widgets. Native would mean rewriting the UI in React Native
plus an API layer, and on iPhone either 99 USD/year or reinstalling every 7
days. Decide after the user has cooked with it a few times — the expected
verdict is that only the timer alarm is missed, which an Expo shell around this
web UI could add without a rewrite.

## Deferred — do not build yet
- More in-app AI: paste text/photo → structured recipe (today recipes arrive
  via MCP). Claude as a provider needs an API key (sk-ant-api03); a Claude
  subscription OAuth token cannot be used by this app.
- Video analysis (in-app). Deferred by the user.
- Reviewing machine-translated food names in the app (flip `name_vi_reviewed`).
- Using `wastePct` for as-bought quantities ("1 kg cá" includes bones).
- Recipe editing form in the web app, delete, photos (Supabase Storage),
  cook mode, sharing, meal plans, shopping lists, cost per serving.
- Deploy (Vercel) — see LifeOS `docs/DEPLOY.md` for the checklist.

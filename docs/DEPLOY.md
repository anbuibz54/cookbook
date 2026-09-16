# Deploy, and installing it on an iPhone

Vercel + the Supabase project LifeOS already uses. Free on both.

**Why deploy before testing on a phone.** `pnpm dev` only serves `localhost`.
Reaching it over the LAN (`http://192.168.x.x:3100`) works for a quick look but
is not a fair test: service workers and the Wake Lock API both require a secure
context, so over plain HTTP there is no offline reading and the cook-mode screen
goes dark like any web page. An HTTPS deployment is the shortest path to the
real thing.

---

## 1. Push, then import

```
git push                       # first push opens a browser login
```

On vercel.com: **Add New → Project → Import** `anbuibz54/cookbook`. Framework
detection handles the rest; there is no `vercel.json`.

Five environment variables (Production, Preview and Development), copied from
`.env.local`:

| Name | Value |
|---|---|
| `DATABASE_URL` | Supabase **session** pooler, port **5432** |
| `DIRECT_URL` | the same |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` |
| `SUPABASE_SECRET_KEY` | `sb_secret_…` — server only, never `NEXT_PUBLIC_` |

> **Port 5432, not 6543.** The transaction pooler hangs under query depth with
> postgres.js — the measurements are in LifeOS's `src/server/db/index.ts`. Using
> 6543 gives you a page that loads forever.

Migrations do **not** run on deploy, deliberately: a failed migration mid-deploy
is worse than a deploy that does not ship. Run `pnpm db:migrate` locally first —
the database is shared, so a deploy of new code against an old schema is the
only real risk here.

## 2. Supabase URL configuration

Authentication → URL Configuration:

- **Site URL**: `https://<project>.vercel.app`
- **Redirect URLs**: `https://<project>.vercel.app/**`, plus
  `http://localhost:3100/**` for local work.

Sign-in here is email + password only (accounts are created in LifeOS), so this
matters less than it does there — but email links land on these URLs.

## 3. Point Claude at the deployed MCP endpoint

Settings → create a token, then:

```
claude mcp add --transport http cookbook https://<project>.vercel.app/api/mcp \
  --header "Authorization: Bearer <token>"
```

Local and deployed share one database, so a recipe saved from either shows up in
both. Whether the Claude iPhone app can add this as a custom connector has not
been checked — its connectors generally expect OAuth rather than a bearer
header. Claude Code on the laptop works today.

## 4. Install on the iPhone

Open the deployed URL **in Safari** (Chrome on iOS cannot install), Share →
**Thêm vào MH chính**.

Quirks worth knowing before they surprise you:

- **An installed web app has its own cookie jar.** You will be asked to sign in
  again inside it, even though Safari is already signed in. Once.
- **No vibration.** iOS gives web pages no vibration API, so the cook-mode timer
  rings with a sound instead (three beeps). The sound is prepared when you tap
  **Bắt đầu** — iOS only allows audio to start from a tap.
- **The alarm only reaches you while the app is open.** The countdown itself
  stays correct across a locked screen (it stores a deadline, not a counter),
  but iOS will not let a web app ring in the background. This is the one gap
  worth going native for; see CLAUDE.md.
- **Keeping the screen on** works from iOS 16.4. The "màn hình luôn sáng" line
  in cook mode only appears when the lock was actually granted.
- Offline reading covers pages you have already opened, through `public/sw.js`.

## 5. Check after deploying

- [ ] `/login` renders, email + password sign-in works
- [ ] home shows recipes, `/pantry` and `/shopping` load
- [ ] Settings → create a token, `pnpm mcp:smoke https://<project>.vercel.app`
      passes against the deployed URL
- [ ] the iPhone installs it and opens without browser chrome
- [ ] cook mode: start a one-minute timer, lock the phone, come back — the
      countdown is right

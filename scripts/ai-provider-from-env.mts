/**
 * Save the Azure OpenAI settings from .env.local as a user's AI provider,
 * encrypted like the Settings screen does, then test it.
 *
 *   pnpm ai:from-env <email>
 *
 * Reads AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_API_KEY / AZURE_OPENAI_DEPLOYMENT.
 * The key is encrypted with THIS machine's AI_KEYS_SECRET; production reads it
 * only if Vercel has the same secret. Replaces an existing Azure provider with
 * the same endpoint and deployment instead of adding a duplicate.
 */

import { and, eq } from 'drizzle-orm'
import { db } from '../src/server/db/index.ts'
import { aiProviders, users } from '../src/server/db/schema.ts'
import { normalizeEndpoint, saveProvider, testProvider } from '../src/server/ai/providers.ts'

const email = process.argv[2]
const { AZURE_OPENAI_ENDPOINT: endpoint, AZURE_OPENAI_API_KEY: apiKey, AZURE_OPENAI_DEPLOYMENT: model } = process.env
if (!email) throw new Error('Usage: pnpm ai:from-env <email>')
if (!endpoint || !apiKey || !model) throw new Error('Set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY and AZURE_OPENAI_DEPLOYMENT.')

const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()))
if (!user) throw new Error(`No cookbook user ${email}. Sign in to the app once first.`)

const [existing] = await db
  .select({ id: aiProviders.id })
  .from(aiProviders)
  .where(
    and(
      eq(aiProviders.userId, user.id),
      eq(aiProviders.kind, 'azure'),
      eq(aiProviders.endpoint, normalizeEndpoint(endpoint)),
      eq(aiProviders.model, model),
    ),
  )

const saved = await saveProvider(
  db,
  user.id,
  { kind: 'azure', label: 'Azure OpenAI', endpoint, model, apiKey },
  existing?.id,
)
const result = await testProvider(db, user.id, saved.id)
console.log(`${existing ? 'updated' : 'added'} ${saved.label} · ${saved.model} (key …${saved.apiKeyHint}) — ${result.message}`)
process.exit(result.ok ? 0 : 1)

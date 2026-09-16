/**
 * AI providers the user configured, and turning the active one into a model.
 *
 * Two kinds for now — Anthropic (Claude) and Azure OpenAI / Microsoft Foundry —
 * both through the Vercel AI SDK, so features call `activeModel()` and never
 * care which one it is. Adding a kind = one enum value + one branch in
 * `languageModel`.
 *
 * Keys: encrypted on the way in (crypto.ts), decrypted only here, only to
 * build a model, never returned by any function a page can call.
 *
 * No `next/*` imports.
 */

import { createAnthropic } from '@ai-sdk/anthropic'
import { createAzure } from '@ai-sdk/azure'
import { generateText, type LanguageModel } from 'ai'
import { and, asc, eq, ne } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../db'
import { aiProviders } from '../db/schema'
import { decryptKey, encryptKey } from './crypto'

type ProviderRow = typeof aiProviders.$inferSelect

/** What pages may see: everything except the ciphertext. */
export type AiProvider = Omit<ProviderRow, 'apiKeyEnc'>

export const DEFAULT_MODEL = { anthropic: 'claude-sonnet-5', azure: 'gpt-5.4-nano' } as const
export const KIND_LABEL = { anthropic: 'Claude', azure: 'Azure OpenAI' } as const

export const providerInput = z
  .object({
    kind: z.enum(['anthropic', 'azure']),
    label: z.string().trim().max(40).nullish(),
    endpoint: z.string().trim().max(300).nullish(),
    model: z.string().trim().min(1, 'Thiếu tên model / deployment.').max(100),
    /** Blank on edit = keep the saved key. */
    apiKey: z.string().trim().max(500).nullish(),
  })
  .superRefine((p, ctx) => {
    if (p.kind === 'azure') {
      if (!p.endpoint) ctx.addIssue({ code: 'custom', path: ['endpoint'], message: 'Azure cần endpoint của resource.' })
      else if (!/^https:\/\/[^/\s]+/.test(p.endpoint)) {
        ctx.addIssue({ code: 'custom', path: ['endpoint'], message: 'Endpoint phải bắt đầu bằng https://' })
      }
    }
  })

export type ProviderInput = z.output<typeof providerInput>

const visible = {
  id: aiProviders.id,
  userId: aiProviders.userId,
  kind: aiProviders.kind,
  label: aiProviders.label,
  endpoint: aiProviders.endpoint,
  model: aiProviders.model,
  apiKeyHint: aiProviders.apiKeyHint,
  active: aiProviders.active,
  lastCheckedAt: aiProviders.lastCheckedAt,
  lastError: aiProviders.lastError,
  createdAt: aiProviders.createdAt,
  updatedAt: aiProviders.updatedAt,
}

export async function listProviders(db: Db, userId: string): Promise<AiProvider[]> {
  return db.select(visible).from(aiProviders).where(eq(aiProviders.userId, userId)).orderBy(asc(aiProviders.createdAt))
}

/**
 * "https://x.services.ai.azure.com", ".../openai", ".../openai/v1" and a
 * bare resource name all mean the same resource; store one form.
 */
export function normalizeEndpoint(input: string): string {
  let url = input.trim().replace(/\/+$/, '')
  if (!/^https?:\/\//.test(url)) url = `https://${url}.openai.azure.com`
  return url.replace(/\/openai(\/v1)?$/i, '')
}

/** Create, or update when `id` is given. The first provider becomes active. */
export async function saveProvider(db: Db, userId: string, input: ProviderInput, id?: string): Promise<AiProvider> {
  const base = {
    kind: input.kind,
    label: input.label || KIND_LABEL[input.kind],
    endpoint: input.kind === 'azure' && input.endpoint ? normalizeEndpoint(input.endpoint) : null,
    model: input.model,
    updatedAt: new Date(),
  }
  const key = input.apiKey ? { apiKeyEnc: encryptKey(input.apiKey), apiKeyHint: input.apiKey.slice(-4) } : null

  if (id) {
    const [row] = await db
      .update(aiProviders)
      // A changed key or endpoint has not been checked yet.
      .set({ ...base, ...(key ?? {}), lastCheckedAt: null, lastError: null })
      .where(and(eq(aiProviders.id, id), eq(aiProviders.userId, userId)))
      .returning(visible)
    if (!row) throw new Error('Không tìm thấy cấu hình này.')
    return row
  }

  if (!key) throw new Error('Nhập API key nhé.')
  const existing = await listProviders(db, userId)
  const [row] = await db
    .insert(aiProviders)
    .values({ userId, ...base, ...key, active: !existing.some((p) => p.active) })
    .returning(visible)
  return row
}

export async function setActiveProvider(db: Db, userId: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(aiProviders).set({ active: false }).where(and(eq(aiProviders.userId, userId), ne(aiProviders.id, id)))
    await tx.update(aiProviders).set({ active: true }).where(and(eq(aiProviders.userId, userId), eq(aiProviders.id, id)))
  })
}

export async function deleteProvider(db: Db, userId: string, id: string): Promise<void> {
  const [removed] = await db
    .delete(aiProviders)
    .where(and(eq(aiProviders.id, id), eq(aiProviders.userId, userId)))
    .returning({ active: aiProviders.active })
  // Deleting the active one hands over to the oldest remaining, if any.
  if (removed?.active) {
    const [next] = await listProviders(db, userId)
    if (next) await setActiveProvider(db, userId, next.id)
  }
}

function languageModel(row: ProviderRow): LanguageModel {
  const apiKey = decryptKey(row.apiKeyEnc)
  if (row.kind === 'anthropic') return createAnthropic({ apiKey })(row.model)
  // Foundry and Azure OpenAI both serve the v1 API under /openai/v1; the
  // model id is the DEPLOYMENT name.
  return createAzure({ baseURL: `${row.endpoint}/openai/v1`, apiKey })(row.model)
}

/**
 * Settings that keep calls cheap and short. GPT-5 family models on Azure
 * think by default; reading a meal photo does not need it.
 */
export function providerOptions(kind: ProviderRow['kind']) {
  return kind === 'azure' ? { azure: { reasoningEffort: 'low' as const } } : undefined
}

export type ActiveModel = { model: LanguageModel; kind: ProviderRow['kind']; label: string; modelId: string }

export async function activeModel(db: Db, userId: string): Promise<ActiveModel | null> {
  const [row] = await db
    .select()
    .from(aiProviders)
    .where(and(eq(aiProviders.userId, userId), eq(aiProviders.active, true)))
  if (!row) return null
  return { model: languageModel(row), kind: row.kind, label: row.label, modelId: row.model }
}

/** Human-sized reason for a failed call. Provider messages are long and English. */
export function describeAiError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const status = (error as { statusCode?: number })?.statusCode
  if (status === 401 || status === 403 || /unauthori|invalid.*key|access denied/i.test(message)) {
    return 'Key không đúng hoặc không có quyền.'
  }
  if (status === 404 || /deployment.*not found|DeploymentNotFound|not_found_error|model.*not found/i.test(message)) {
    return 'Không tìm thấy model / deployment với tên này.'
  }
  if (status === 429 || /rate limit|quota|credit balance/i.test(message)) return 'Hết lượt hoặc hết tiền trong tài khoản AI.'
  if (/timeout|aborted/i.test(message)) return 'AI trả lời quá lâu, thử lại nhé.'
  if (/fetch failed|ENOTFOUND|ECONNREFUSED/i.test(message)) return 'Không kết nối được tới endpoint.'
  return message.length > 160 ? `${message.slice(0, 160)}…` : message
}

/** A tiny real call, and its outcome recorded on the row. */
export async function testProvider(db: Db, userId: string, id: string): Promise<{ ok: boolean; message: string }> {
  const [row] = await db.select().from(aiProviders).where(and(eq(aiProviders.id, id), eq(aiProviders.userId, userId)))
  if (!row) return { ok: false, message: 'Không tìm thấy cấu hình này.' }

  let result: { ok: boolean; message: string }
  try {
    const started = Date.now()
    await generateText({
      model: languageModel(row),
      prompt: 'Reply with the single word: ok',
      providerOptions: providerOptions(row.kind),
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(30_000),
    })
    result = { ok: true, message: `Kết nối được (${((Date.now() - started) / 1000).toFixed(1)} giây).` }
  } catch (error) {
    result = { ok: false, message: describeAiError(error) }
  }

  await db
    .update(aiProviders)
    .set({ lastCheckedAt: new Date(), lastError: result.ok ? null : result.message })
    .where(eq(aiProviders.id, id))
  return result
}

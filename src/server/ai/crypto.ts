/**
 * Encryption for AI provider keys at rest. AES-256-GCM under AI_KEYS_SECRET
 * (32 random bytes, base64), which lives only in the server environment.
 *
 * A database dump alone yields no usable key. Changing the secret makes every
 * saved key unreadable — the user re-enters them; nothing else breaks.
 *
 * Format: `v1:<iv>:<tag>:<ciphertext>`, each part base64.
 *
 * No `next/*` imports.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

export class MissingSecretError extends Error {
  constructor() {
    super('Máy chủ chưa có AI_KEYS_SECRET nên chưa lưu được key AI.')
  }
}

function secret(): Buffer {
  const raw = process.env.AI_KEYS_SECRET
  if (!raw) throw new MissingSecretError()
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error('AI_KEYS_SECRET must be 32 bytes, base64-encoded.')
  return key
}

export function encryptKey(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', secret(), iv)
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), body.toString('base64')].join(':')
}

export function decryptKey(stored: string): string {
  const [version, iv, tag, body] = stored.split(':')
  if (version !== 'v1' || !iv || !tag || !body) throw new Error('Unreadable stored key.')
  const decipher = createDecipheriv('aes-256-gcm', secret(), Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8')
}

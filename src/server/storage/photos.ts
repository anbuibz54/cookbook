/**
 * Meal photos in Supabase Storage.
 *
 * One private bucket, `cookbook-photos`, in the Supabase project shared with
 * LifeOS — the bucket name is prefixed so it cannot collide with theirs. Files
 * live under `<userId>/…`; the service-role client bypasses Storage policies,
 * so THIS module is the access check: every read takes the caller's id and
 * refuses a path outside their folder.
 *
 * Photos arrive already shrunk by the phone (see `src/lib/photo.ts`), so there
 * is no resizing here. Paths are never reused — a new photo is a new file — so
 * the image route may cache forever.
 *
 * No `next/*` imports.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const PHOTO_BUCKET = 'cookbook-photos'
export const PHOTO_MAX_BYTES = 4 * 1024 * 1024
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

let client: SupabaseClient | undefined
function storage() {
  client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  })
  return client.storage.from(PHOTO_BUCKET)
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

/** Store a photo; returns its path. Throws on a type or size the app does not accept. */
export async function uploadPhoto(userId: string, folder: string, file: Blob): Promise<string> {
  if (!PHOTO_TYPES.includes(file.type as (typeof PHOTO_TYPES)[number])) {
    throw new Error('Ảnh phải là JPEG, PNG hoặc WebP.')
  }
  if (file.size > PHOTO_MAX_BYTES) throw new Error('Ảnh lớn quá 4 MB.')

  const path = `${userId}/${folder}/${crypto.randomUUID()}.${EXT[file.type]}`
  const { error } = await storage().upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw error
  return path
}

export function ownsPhoto(userId: string, path: string) {
  return path.startsWith(`${userId}/`) && !path.includes('..')
}

/** The bytes of one of the caller's photos, or null. */
export async function readPhoto(userId: string, path: string): Promise<Blob | null> {
  if (!ownsPhoto(userId, path)) return null
  const { data, error } = await storage().download(path)
  if (error) return null
  return data
}

/** Best effort: a leftover file costs a few hundred KB, a failed delete must not block the user. */
export async function removePhotos(userId: string, paths: string[]) {
  const mine = paths.filter((p) => ownsPhoto(userId, p))
  if (mine.length > 0) await storage().remove(mine)
}

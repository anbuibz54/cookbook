/**
 * Create the private photo bucket if it is missing. Idempotent.
 *
 *   pnpm storage:ensure
 *
 * The Supabase project is shared with LifeOS: this only ever creates or
 * updates `cookbook-photos`, never lists or touches another bucket's files.
 */

import { createClient } from '@supabase/supabase-js'
import { PHOTO_BUCKET, PHOTO_MAX_BYTES, PHOTO_TYPES } from '../src/server/storage/photos.ts'

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
})

const options = { public: false, fileSizeLimit: PHOTO_MAX_BYTES, allowedMimeTypes: [...PHOTO_TYPES] }
const { data } = await admin.storage.getBucket(PHOTO_BUCKET)

if (data) {
  const { error } = await admin.storage.updateBucket(PHOTO_BUCKET, options)
  if (error) throw error
  console.log(`bucket ${PHOTO_BUCKET} exists, settings refreshed (private)`)
} else {
  const { error } = await admin.storage.createBucket(PHOTO_BUCKET, options)
  if (error) throw error
  console.log(`bucket ${PHOTO_BUCKET} created (private)`)
}

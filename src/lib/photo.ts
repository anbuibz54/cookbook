/**
 * Shrink a photo on the phone before it is uploaded.
 *
 * An iPhone photo is 3–5 MB; a meal card needs ~1600 px. Doing it here keeps
 * uploads fast on mobile data, keeps Storage small, and keeps the request under
 * the Server Action body limit. `createImageBitmap` with `from-image` applies
 * the EXIF rotation, so portrait shots do not arrive sideways.
 *
 * Browser only.
 */

const MAX_EDGE = 1600
const QUALITY = 0.82

export async function shrinkPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Không xử lý được ảnh này.')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY))
  if (!blob) throw new Error('Không xử lý được ảnh này.')
  return blob
}

import { getSessionUser } from '@/lib/auth/dal'
import { readPhoto } from '@/server/storage/photos'

/**
 * Serves the caller's own photos from the private bucket.
 *
 * A stable URL (unlike a signed one, which changes every render) so the
 * browser caches each photo once. Safe to cache forever: a path is never
 * reused for a different image.
 */
export async function GET(_request: Request, { params }: RouteContext<'/api/photos/[...path]'>) {
  const session = await getSessionUser()
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { path } = await params
  const photo = await readPhoto(session.user.id, path.map(decodeURIComponent).join('/'))
  if (!photo) return new Response('Not found', { status: 404 })

  return new Response(photo, {
    headers: {
      'Content-Type': photo.type || 'image/jpeg',
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  })
}

/** Where the app serves a stored photo (see src/app/api/photos). */
export function photoUrl(path: string) {
  return `/api/photos/${path.split('/').map(encodeURIComponent).join('/')}`
}

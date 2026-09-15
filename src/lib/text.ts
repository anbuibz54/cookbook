/**
 * Search normalisation for Vietnamese.
 *
 * NFD splits "ắ" into "a" + combining marks, which are then dropped. "đ" is
 * its own letter, not a d with a mark, so NFD leaves it alone — it needs an
 * explicit mapping or "dau" never finds "đậu".
 */
export function normalizeForSearch(...parts: (string | null | undefined)[]): string {
  return parts
    .filter((p): p is string => Boolean(p))
    .join(' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

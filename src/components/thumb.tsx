/**
 * Stand-in for a dish photo until photo upload exists.
 *
 * The tone is derived from the recipe id, so a recipe keeps the same colour
 * everywhere and a list does not turn into one flat grey column. Food tones
 * on purpose — these are not brand colours and should not be reused as such.
 */
const TONES = ['#e4cfa4', '#d9b08a', '#f2d68c', '#c99670', '#d9a35b', '#e8dcc8', '#e7c9a8']

export function Thumb({ id, className = '' }: { id: string; className?: string }) {
  let hash = 0
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) % 997

  return (
    <div
      aria-hidden="true"
      className={className}
      style={{ background: TONES[hash % TONES.length] }}
    />
  )
}

import { ViewTransition } from 'react'

/**
 * Wraps a page so navigations animate by MEANING, not by default:
 *
 *  - `nav-forward`  going deeper (list → recipe → cook mode): slides left
 *  - `nav-back`     coming back out: slides right
 *  - `tab`          switching tabs, same level: a short crossfade
 *
 * Links opt in with `transitionTypes`. Anything untyped — the browser back
 * button, a server action's redirect, `router.refresh()` — does not animate,
 * which is the honest answer when we do not know the direction.
 *
 * Must wrap each page, not a layout: layouts persist across navigations, so
 * enter and exit never fire there. The tab bar lives in the layout for exactly
 * that reason — it should not move. Keyframes are in globals.css.
 */
const MOTION = {
  'nav-forward': 'nav-forward',
  'nav-back': 'nav-back',
  tab: 'tab-fade',
  default: 'none',
}

export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter={MOTION} exit={MOTION} default="none">
      {children}
    </ViewTransition>
  )
}

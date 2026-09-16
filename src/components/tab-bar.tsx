'use client'

import Link, { useLinkStatus } from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * Bottom navigation. Rendered once in the root layout, so it stays put while
 * pages slide underneath it; it hides itself on screens that are not tab
 * destinations (a recipe, cook mode, login).
 *
 * Every tab is a flex slot. The current one grows and reveals its label, the
 * rest stay icon-sized; with no current tab (Settings) all four share the
 * width evenly instead of bunching to the left. `flex-grow` animates, so moving
 * between tabs is a slide of the highlight rather than a jump.
 */
const TABS = [
  {
    href: '/',
    label: 'Trang chủ',
    icon: <path d="M4 11l8-6 8 6v8H4z" />,
  },
  {
    href: '/recipes',
    label: 'Sổ',
    icon: (
      <>
        <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
        <path d="M9 8h6" />
      </>
    ),
  },
  {
    href: '/pantry',
    label: 'Tủ lạnh',
    icon: (
      <>
        <path d="M6 3h12v18H6z" />
        <path d="M6 10h12" />
        <path d="M9 6.5v1.5M9 13v2" />
      </>
    ),
  },
  {
    href: '/shopping',
    label: 'Đi chợ',
    icon: (
      <>
        <path d="M4 7h16l-1.5 12H5.5z" />
        <path d="M9 7a3 3 0 0 1 6 0" />
      </>
    ),
  },
]

/** Pages that show the bar. Exact matches: `/recipes/[id]` is a detail screen, not a tab. */
const WITH_BAR = new Set(['/', '/recipes', '/pantry', '/shopping', '/settings'])

/** A dot that only appears if this tab's navigation is slow (see .tab-pending in globals.css). */
function PendingDot() {
  const { pending } = useLinkStatus()
  return (
    <span
      aria-hidden="true"
      data-pending={pending}
      className="tab-pending absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-primary"
    />
  )
}

export function TabBar() {
  const pathname = usePathname()
  if (!WITH_BAR.has(pathname)) return null

  return (
    <nav
      aria-label="Điều hướng chính"
      style={{ viewTransitionName: 'tab-bar', paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-20 px-[18px] pt-2"
    >
      <div className="pointer-events-auto mx-auto flex w-full max-w-md gap-1.5 rounded-full border-2 border-ink bg-surface p-1.5 shadow-pop-sm">
        {TABS.map((tab) => {
          const active = pathname === tab.href
          return (
            <Link
              key={tab.href}
              href={tab.href}
              transitionTypes={['tab']}
              aria-current={active ? 'page' : undefined}
              aria-label={tab.label}
              style={{ flexGrow: active ? 2.6 : 1 }}
              className={`relative flex h-11 min-w-11 basis-0 items-center justify-center overflow-hidden rounded-full text-sm font-medium transition-[flex-grow,background-color,color] duration-300 ease-out motion-reduce:transition-none ${
                active ? 'bg-ink text-background' : 'text-muted hover:text-ink'
              }`}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="shrink-0"
              >
                {tab.icon}
              </svg>
              <span
                aria-hidden="true"
                className={`overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin] duration-300 ease-out motion-reduce:transition-none ${
                  active ? 'ml-2 max-w-24 opacity-100' : 'ml-0 max-w-0 opacity-0'
                }`}
              >
                {tab.label}
              </span>
              <PendingDot />
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

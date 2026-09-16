'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * Bottom navigation, pill-shaped with the playful border.
 *
 * Four tabs do not fit as icon + label at phone width, so only the current tab
 * carries its label — the others stay icons with an accessible name. Settings
 * is reached from the home screen's card, not from here.
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

export function TabBar() {
  const pathname = usePathname()

  return (
    <nav className="sticky bottom-0 z-10 mx-auto flex w-full max-w-md gap-1.5 rounded-full border-2 border-ink bg-surface p-1.5">
      {TABS.map((tab) => {
        const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            aria-label={tab.label}
            className={`flex h-11 items-center justify-center gap-2 rounded-full text-sm font-medium ${
              active ? 'grow bg-ink text-background' : 'w-11 shrink-0 text-muted'
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
            {active ? tab.label : null}
          </Link>
        )
      })}
    </nav>
  )
}

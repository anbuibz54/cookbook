'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * Bottom navigation, pill-shaped with the playful border and shadow.
 *
 * Three tabs, all of which lead somewhere real — the mockup's "Đi chợ" is not
 * built yet, so Settings (where MCP tokens live) takes the third slot.
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
    href: '/settings',
    label: 'Kết nối AI',
    icon: (
      <>
        <path d="M12 3v4M12 17v4M4.9 7.5l3.4 2M15.7 14.5l3.4 2M4.9 16.5l3.4-2M15.7 9.5l3.4-2" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
  },
]

export function TabBar() {
  const pathname = usePathname()

  return (
    <nav className="sticky bottom-0 z-10 mx-auto flex w-full max-w-md gap-2 rounded-full border-2 border-ink bg-surface p-1.5">
      {TABS.map((tab) => {
        const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`flex h-11 grow items-center justify-center gap-2 rounded-full text-sm font-medium ${
              active ? 'bg-ink text-background' : 'text-muted'
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
            >
              {tab.icon}
            </svg>
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}

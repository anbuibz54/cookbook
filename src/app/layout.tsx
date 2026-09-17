import type { Metadata, Viewport } from 'next'
import { Baloo_2, JetBrains_Mono, Lexend } from 'next/font/google'
import { ServiceWorker } from '@/components/service-worker'
import { OfflineSync } from '@/components/offline-sync'
import { TabBar } from '@/components/tab-bar'
import './globals.css'

/**
 * Three faces, each with a job (mockup "Sổ công thức UI"):
 * Baloo 2 for headings and the big buttons, Lexend for reading, JetBrains
 * Mono wherever digits line up (grams, kcal, timers). All three carry the
 * Vietnamese subset — stacked diacritics (ặ, ổ) must not collide.
 */
const baloo = Baloo_2({
  variable: '--font-baloo',
  subsets: ['latin', 'vietnamese'],
  weight: ['600', '700', '800'],
  display: 'swap',
})

const lexend = Lexend({
  variable: '--font-lexend',
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600'],
  display: 'swap',
})

const jetbrains = JetBrains_Mono({
  variable: '--font-jetbrains',
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Sổ công thức',
  description: 'Sổ công thức nấu ăn, tủ lạnh và đi chợ.',
  applicationName: 'Sổ công thức',
  appleWebApp: {
    // iOS ignores the manifest's display mode; this is what makes an installed
    // icon open without browser chrome.
    capable: true,
    title: 'Sổ công thức',
    statusBarStyle: 'default',
  },
  // Amounts and timings in a recipe should not become phone numbers or dates.
  formatDetection: { telephone: false, date: false, address: false, email: false },
}

export const viewport: Viewport = {
  // Lets the layout paint under the notch; the pages already pad for it.
  viewportFit: 'cover',
  themeColor: '#fbf1f0',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="vi"
      className={`${baloo.variable} ${lexend.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">
        {children}
        {/* In the layout, not the pages: it must not slide with them. */}
        <TabBar />
        <ServiceWorker />
        <OfflineSync />
      </body>
    </html>
  )
}

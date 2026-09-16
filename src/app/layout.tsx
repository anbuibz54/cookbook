import type { Metadata, Viewport } from 'next'
import { Baloo_2, JetBrains_Mono, Lexend } from 'next/font/google'
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
  description: 'Sổ công thức nấu ăn của riêng mình.',
  formatDetection: { telephone: false, date: false, address: false, email: false },
}

export const viewport: Viewport = {
  viewportFit: 'cover',
  themeColor: '#fbf1f0',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="vi"
      className={`${baloo.variable} ${lexend.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">{children}</body>
    </html>
  )
}

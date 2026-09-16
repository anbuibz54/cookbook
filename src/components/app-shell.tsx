import Link from 'next/link'
import { signOut } from '@/app/(auth)/actions'
import { PageTransition } from '@/components/page-transition'

/** Frame for secondary screens (Settings). The tab bar comes from the root layout. */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <PageTransition>
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-[18px] pt-6 pb-32">
        <header className="flex items-center justify-between gap-4">
          <Link
            href="/"
            transitionTypes={['tab']}
            className="font-display text-[30px] leading-none font-extrabold"
          >
            Sổ công thức
          </Link>
          <form action={signOut}>
            <button type="submit" className="text-sm text-muted hover:text-ink">
              Đăng xuất
            </button>
          </form>
        </header>
        {children}
      </div>
    </PageTransition>
  )
}

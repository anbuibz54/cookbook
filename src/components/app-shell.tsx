import Link from 'next/link'
import { signOut } from '@/app/(auth)/actions'
import { TabBar } from '@/components/tab-bar'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-[18px] pt-6 pb-6">
      <header className="flex items-center justify-between gap-4">
        <Link href="/" className="font-display text-[30px] leading-none font-extrabold">
          Sổ công thức
        </Link>
        <form action={signOut}>
          <button type="submit" className="text-sm text-muted hover:text-ink">
            Đăng xuất
          </button>
        </form>
      </header>
      {children}
      <div className="grow" />
      <TabBar />
    </div>
  )
}

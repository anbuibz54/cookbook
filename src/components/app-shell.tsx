import Link from 'next/link'
import { signOut } from '@/app/(auth)/actions'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-20">
      <header className="flex items-center justify-between gap-4 py-5">
        <Link href="/" className="text-lg font-semibold">
          Cookbook
        </Link>
        <nav className="flex items-center gap-4 text-sm text-muted">
          <Link href="/settings" className="hover:text-foreground">
            Kết nối AI
          </Link>
          <form action={signOut}>
            <button type="submit" className="hover:text-foreground">
              Đăng xuất
            </button>
          </form>
        </nav>
      </header>
      {children}
    </div>
  )
}

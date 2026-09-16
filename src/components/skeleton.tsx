/**
 * Placeholder blocks for `loading.tsx` screens.
 *
 * Every page reads the database, so without these a tap on a tab waits in
 * silence until the server answers. A loading file makes the navigation
 * commit immediately and shows the SHAPE of what is coming — same widths,
 * same card borders — so nothing jumps when the real content lands.
 *
 * The pulse respects reduced motion; the shapes alone already say "loading".
 */
export function Bone({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`rounded-xl bg-line-soft motion-safe:animate-pulse ${className}`} />
}

/** The frame every loading screen shares, announced once for screen readers. */
export function LoadingFrame({
  children,
  withTabBar = false,
}: {
  children: React.ReactNode
  withTabBar?: boolean
}) {
  return (
    <div
      role="status"
      aria-label="Đang tải"
      className={`mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-[18px] pt-6 ${withTabBar ? 'pb-32' : 'pb-10'}`}
    >
      {children}
    </div>
  )
}

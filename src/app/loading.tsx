import { Bone, LoadingFrame } from '@/components/skeleton'

/**
 * Shared by every tab screen (home, Sổ, Tủ lạnh, Đi chợ, Settings) until one
 * of them needs its own shape: a title, a search pill, a card of rows.
 */
export default function Loading() {
  return (
    <LoadingFrame withTabBar>
      <Bone className="h-8 w-48" />
      <Bone className="h-12 w-full rounded-full" />
      <div className="grid grid-cols-2 gap-3">
        <Bone className="h-[86px] rounded-[18px]" />
        <Bone className="h-[86px] rounded-[18px]" />
      </div>
      <div className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface p-3.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="grid grid-cols-[48px_minmax(0,1fr)] items-center gap-3">
            <Bone className="size-12" />
            <div className="flex flex-col gap-2">
              <Bone className="h-4 w-3/4" />
              <Bone className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </LoadingFrame>
  )
}

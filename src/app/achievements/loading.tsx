import { Bone, LoadingFrame } from '@/components/skeleton'

/** Thành tích's shape: title, three stat boxes, streak cards, the wish grid. */
export default function Loading() {
  return (
    <LoadingFrame withTabBar>
      <Bone className="h-8 w-40" />
      <div className="grid grid-cols-3 gap-2.5">
        {[0, 1, 2].map((i) => (
          <Bone key={i} className="h-[68px] rounded-2xl" />
        ))}
      </div>
      <Bone className="h-6 w-24" />
      {[0, 1].map((i) => (
        <Bone key={i} className="h-[110px] rounded-[18px]" />
      ))}
      <Bone className="h-6 w-40" />
      <div className="grid grid-cols-2 gap-3">
        <Bone className="h-[170px] rounded-[18px]" />
        <Bone className="h-[170px] rounded-[18px]" />
      </div>
    </LoadingFrame>
  )
}

import { Bone, LoadingFrame } from '@/components/skeleton'

/** The recipe screen's shape: thumbnail and title, the nutrition card, the ingredient table. */
export default function Loading() {
  return (
    <LoadingFrame>
      <div className="grid grid-cols-[100px_minmax(0,1fr)] items-center gap-3.5 pt-12">
        <Bone className="size-25 rounded-2xl" />
        <div className="flex flex-col gap-2">
          <Bone className="h-7 w-4/5" />
          <Bone className="h-3 w-1/2" />
        </div>
      </div>
      <div className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface p-4">
        <Bone className="h-5 w-32" />
        <Bone className="h-11 w-24" />
        <Bone className="h-3 w-full rounded-md" />
        <div className="grid grid-cols-3 gap-2">
          <Bone className="h-10" />
          <Bone className="h-10" />
          <Bone className="h-10" />
        </div>
      </div>
      <div className="flex flex-col gap-2.5 rounded-[18px] border border-line bg-surface p-4">
        <Bone className="h-5 w-28" />
        {[0, 1, 2, 3, 4].map((i) => (
          <Bone key={i} className="h-4 w-full" />
        ))}
      </div>
    </LoadingFrame>
  )
}

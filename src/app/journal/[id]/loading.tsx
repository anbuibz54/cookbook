import { Bone, LoadingFrame } from '@/components/skeleton'

/** A meal's shape: the photo, the title, a card of items. */
export default function Loading() {
  return (
    <LoadingFrame>
      <Bone className="size-11 rounded-full" />
      <Bone className="aspect-[4/3] w-full rounded-[20px]" />
      <Bone className="h-3 w-40" />
      <Bone className="h-8 w-3/4" />
      <div className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface p-4">
        <Bone className="h-5 w-40" />
        {[0, 1, 2].map((i) => (
          <Bone key={i} className="h-4 w-full" />
        ))}
      </div>
    </LoadingFrame>
  )
}

import { Bone, LoadingFrame } from '@/components/skeleton'

/** The log screen's shape: header, photo box, the "Nấu gì?" field, a card of rows. */
export default function Loading() {
  return (
    <LoadingFrame>
      <Bone className="mx-auto h-6 w-28" />
      <Bone className="h-[200px] rounded-[20px]" />
      <Bone className="h-4 w-20" />
      <Bone className="h-[50px] rounded-[14px]" />
      <div className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface p-4">
        <Bone className="h-5 w-40" />
        {[0, 1, 2].map((i) => (
          <Bone key={i} className="h-9 w-full" />
        ))}
      </div>
    </LoadingFrame>
  )
}

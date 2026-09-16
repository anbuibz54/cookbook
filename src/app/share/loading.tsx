import { Bone, LoadingFrame } from '@/components/skeleton'

/** The share screen's shape: header, month switcher, a 4:5 card, the button. */
export default function Loading() {
  return (
    <LoadingFrame>
      <Bone className="mx-auto h-6 w-28" />
      <Bone className="h-10 w-full" />
      <Bone className="aspect-[4/5] w-full rounded-[20px]" />
      <Bone className="h-14 rounded-full" />
    </LoadingFrame>
  )
}

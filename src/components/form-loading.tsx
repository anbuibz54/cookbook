import { Bone, LoadingFrame } from './skeleton'

/** Shared by the small create/edit forms (streak, goal, wish): header, a few fields, a button. */
export function FormLoading({ fields = 4 }: { fields?: number }) {
  return (
    <LoadingFrame>
      <Bone className="mx-auto h-6 w-32" />
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Bone className="h-3 w-20" />
          <Bone className="h-[50px] rounded-[14px]" />
        </div>
      ))}
      <Bone className="mt-2 h-14 rounded-full" />
    </LoadingFrame>
  )
}

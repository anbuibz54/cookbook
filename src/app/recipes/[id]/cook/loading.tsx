/**
 * Cook mode loads on its own dark ground: flashing the pink recipe skeleton
 * between the recipe and a dark screen would be a white flash in a dim kitchen.
 */
export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Đang mở chế độ nấu"
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 bg-cook-bg px-[18px] pt-5 pb-6"
    >
      <div className="h-4 w-24 rounded-md bg-cook-surface motion-safe:animate-pulse" />
      <div className="h-1.5 w-full rounded-full bg-cook-line" />
      <div className="h-8 w-5/6 rounded-lg bg-cook-surface motion-safe:animate-pulse" />
      <div className="h-8 w-2/3 rounded-lg bg-cook-surface motion-safe:animate-pulse" />
      <div className="mx-auto mt-4 size-60 rounded-full border-[14px] border-cook-line" />
    </div>
  )
}

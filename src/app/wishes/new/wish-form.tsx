'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { createWishAction } from '@/app/_actions/motivation'

const inputClass =
  'h-[50px] rounded-[14px] border border-line bg-surface px-3.5 text-base outline-none placeholder:text-placeholder focus-visible:border-ink'

/** Pin a dish to the wish board: from the sổ, a video link, or just a name. */
export function WishForm({ recipes }: { recipes: { id: string; title: string }[] }) {
  const [state, formAction, pending] = useActionState(createWishAction, {})

  return (
    <form action={formAction} className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-[18px] pt-3 pb-10">
      <header className="grid h-13 grid-cols-[64px_minmax(0,1fr)_64px] items-center">
        <Link href="/achievements" transitionTypes={['nav-back']} className="py-3 text-muted hover:text-ink">
          Hủy
        </Link>
        <h1 className="text-center font-display text-xl font-extrabold">Ghim món</h1>
      </header>

      <p className="text-sm text-pretty text-muted">
        Món muốn nấu thử một ngày nào đó. Lần đầu ghi bữa có món này, nó tự thành “Đã chinh phục” kèm ảnh của bạn.
      </p>

      {recipes.length ? (
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Chọn từ sổ</span>
          <select name="recipeId" defaultValue="" className={inputClass}>
            <option value="">Không chọn</option>
            {recipes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">{recipes.length ? 'Hoặc gõ tên món' : 'Tên món'}</span>
        <input
          name="title"
          maxLength={80}
          placeholder="Bánh mì cuộn quế"
          className="h-[50px] rounded-[14px] border-2 border-ink bg-surface px-3.5 text-base outline-none placeholder:text-placeholder"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">Link video hoặc bài viết</span>
        <input name="sourceUrl" type="url" inputMode="url" placeholder="https://youtube.com/…" className={inputClass} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">Ghi chú</span>
        <input name="note" maxLength={300} placeholder="Làm dịp sinh nhật vợ" className={inputClass} />
      </label>

      {state.error ? (
        <p role="alert" className="text-sm text-primary">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-1 flex h-14 items-center justify-center rounded-full border-2 border-ink bg-ink font-display text-xl font-extrabold text-background shadow-pop-primary disabled:opacity-60"
      >
        {pending ? 'Đang lưu…' : 'Ghim lên bảng'}
      </button>
    </form>
  )
}

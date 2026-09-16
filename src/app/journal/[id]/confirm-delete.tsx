'use client'

import { useFormStatus } from 'react-dom'

function Button() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="h-11 w-full text-sm text-muted hover:text-primary disabled:opacity-60">
      {pending ? 'Đang xoá…' : 'Xoá bữa này'}
    </button>
  )
}

/** Deleting a meal does not refill the pantry — the question says so, so nobody expects it to. */
export function ConfirmDelete({ action }: { action: () => Promise<void> }) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm('Xoá bữa này khỏi nhật ký? Tủ lạnh sẽ không được cộng lại.')) e.preventDefault()
      }}
    >
      <Button />
    </form>
  )
}

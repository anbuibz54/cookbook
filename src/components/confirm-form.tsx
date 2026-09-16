'use client'

import { useFormStatus } from 'react-dom'

function Button({ label, pendingLabel, className }: { label: React.ReactNode; pendingLabel: string; className: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className={`${className} disabled:opacity-60`}>
      {pending ? pendingLabel : label}
    </button>
  )
}

/**
 * A one-button form that asks first. The question should say what will NOT
 * happen too ("tủ lạnh sẽ không được cộng lại"), so nobody expects an undo.
 */
export function ConfirmForm({
  action,
  question,
  label,
  pendingLabel = 'Đang xoá…',
  className = 'h-11 w-full text-sm text-muted hover:text-primary',
  ariaLabel,
}: {
  action: () => Promise<void>
  question: string
  label: React.ReactNode
  pendingLabel?: string
  className?: string
  ariaLabel?: string
}) {
  return (
    <form
      action={action}
      aria-label={ariaLabel}
      onSubmit={(e) => {
        if (!window.confirm(question)) e.preventDefault()
      }}
    >
      <Button label={label} pendingLabel={pendingLabel} className={className} />
    </form>
  )
}

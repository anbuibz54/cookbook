'use client'

import { useActionState } from 'react'
import { signIn, type AuthFormState } from '../actions'

const initial: AuthFormState = { error: null }

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signIn, initial)

  return (
    <form action={action} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Email</span>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full rounded-md border border-line bg-surface px-3 py-2 outline-none focus-visible:border-primary"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Mật khẩu</span>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-md border border-line bg-surface px-3 py-2 outline-none focus-visible:border-primary"
        />
      </label>

      {state.error ? (
        <p role="alert" className="text-sm text-primary">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-ink px-3 py-2 font-medium text-background disabled:opacity-60"
      >
        {pending ? 'Đang đăng nhập…' : 'Đăng nhập'}
      </button>
    </form>
  )
}

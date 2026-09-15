'use client'

import { useActionState } from 'react'
import { mintToken, type TokenResult } from '@/app/_actions/tokens'

const initial: TokenResult = { token: null, error: null }

export function MintTokenForm({ endpoint }: { endpoint: string }) {
  const [state, action, pending] = useActionState(mintToken, initial)

  return (
    <div className="space-y-4">
      <form action={action} className="flex flex-wrap gap-2">
        <input
          id="token-name"
          name="name"
          placeholder="Tên, ví dụ: claude laptop"
          className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 outline-none focus-visible:border-accent"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 font-medium text-background disabled:opacity-60"
        >
          Tạo token
        </button>
      </form>

      {state.error ? <p role="alert" className="text-sm text-accent">{state.error}</p> : null}

      {state.token ? (
        <div className="space-y-2 rounded-lg border border-line bg-surface p-4 text-sm">
          <p className="font-medium">Token chỉ hiện một lần. Chép lại ngay:</p>
          <p className="text-muted">Claude Code, chạy trong terminal:</p>
          <pre className="overflow-x-auto rounded-md bg-background p-3 text-xs">
            {`claude mcp add --transport http cookbook ${endpoint} --header "Authorization: Bearer ${state.token}"`}
          </pre>
        </div>
      ) : null}
    </div>
  )
}

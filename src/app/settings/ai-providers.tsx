'use client'

import { useActionState, useState, useTransition } from 'react'
import {
  deleteProviderAction,
  saveProviderAction,
  setActiveProviderAction,
  testProviderAction,
  type ProviderFormState,
} from '@/app/_actions/ai'

export type ProviderView = {
  id: string
  kind: 'anthropic' | 'azure'
  label: string
  endpoint: string | null
  model: string
  apiKeyHint: string
  active: boolean
  checked: boolean
  lastError: string | null
}

const DEFAULT_MODEL = { anthropic: 'claude-sonnet-5', azure: 'gpt-5.4-nano' }
const KIND_LABEL = { anthropic: 'Claude', azure: 'Azure OpenAI' }

const inputClass =
  'h-11 w-full min-w-0 rounded-xl border border-line bg-surface px-3 text-[15px] outline-none placeholder:text-placeholder focus-visible:border-ink'

function ProviderForm({ provider, onDone }: { provider?: ProviderView; onDone: () => void }) {
  const [kind, setKind] = useState<ProviderView['kind']>(provider?.kind ?? 'azure')
  const [state, formAction, pending] = useActionState(
    async (prev: ProviderFormState, form: FormData) => {
      const next = await saveProviderAction(provider?.id ?? null, prev, form)
      if (next.saved) onDone()
      return next
    },
    {},
  )

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-[18px] border-2 border-ink bg-surface p-4">
      {provider ? (
        <input type="hidden" name="kind" value={kind} />
      ) : (
        <div className="flex gap-2">
          {(['azure', 'anthropic'] as const).map((k) => (
            <label
              key={k}
              className={`flex h-9 cursor-pointer items-center rounded-full px-3.5 text-sm has-focus-visible:outline-2 ${
                kind === k ? 'bg-ink text-background' : 'border border-line'
              }`}
            >
              <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
              {KIND_LABEL[k]}
            </label>
          ))}
        </div>
      )}

      {kind === 'azure' ? (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Endpoint của resource</span>
          <input
            name="endpoint"
            defaultValue={provider?.endpoint ?? ''}
            required
            inputMode="url"
            autoComplete="off"
            placeholder="https://ten-resource.services.ai.azure.com"
            className={`${inputClass} font-mono text-[13px]`}
          />
        </label>
      ) : null}

      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">{kind === 'azure' ? 'Tên deployment' : 'Model'}</span>
        <input
          name="model"
          defaultValue={provider?.model ?? DEFAULT_MODEL[kind]}
          key={kind}
          required
          autoComplete="off"
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">API key</span>
        <input
          name="apiKey"
          type="password"
          required={!provider}
          autoComplete="off"
          placeholder={provider ? `để trống = giữ key …${provider.apiKeyHint}` : kind === 'anthropic' ? 'sk-ant-api03-…' : ''}
          className={`${inputClass} font-mono text-[13px]`}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">Tên gợi nhớ (không bắt buộc)</span>
        <input name="label" defaultValue={provider?.label ?? ''} maxLength={40} placeholder={KIND_LABEL[kind]} className={inputClass} />
      </label>

      {kind === 'anthropic' ? (
        <p className="text-xs text-pretty text-muted">
          Cần API key từ console.anthropic.com. Token đăng nhập của gói Claude Pro/Max (sk-ant-oat…) không dùng được ở đây.
        </p>
      ) : null}

      {state.error ? (
        <p role="alert" className="text-sm text-primary">
          {state.error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2.5">
        <button type="button" onClick={onDone} className="h-11 rounded-full border border-line text-sm">
          Thôi
        </button>
        <button type="submit" disabled={pending} className="h-11 rounded-full bg-ink text-sm font-medium text-background disabled:opacity-60">
          {pending ? 'Đang lưu và thử…' : 'Lưu và thử'}
        </button>
      </div>
    </form>
  )
}

function ProviderCard({ provider }: { provider: ProviderView }) {
  const [editing, setEditing] = useState(false)
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null)
  const [pending, startTransition] = useTransition()

  if (editing) return <ProviderForm provider={provider} onDone={() => setEditing(false)} />

  const status = test
    ? test
    : provider.lastError
      ? { ok: false, message: provider.lastError }
      : provider.checked
        ? { ok: true, message: 'Đã kết nối' }
        : null

  return (
    <div
      className={`flex flex-col gap-2.5 rounded-[18px] bg-surface px-4 py-3.5 ${
        provider.active ? 'border-2 border-ink shadow-pop-sm' : 'border border-line'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="font-semibold">{provider.label}</span>
          <span className="truncate text-xs text-muted">
            {KIND_LABEL[provider.kind]} · {provider.model} · key …{provider.apiKeyHint}
            {provider.active ? ' · đang dùng' : ''}
          </span>
        </div>
        {status ? (
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ${
              status.ok ? 'bg-tile-mint text-ink' : 'bg-warn-bg text-warn-ink'
            }`}
          >
            {status.ok ? (test ? 'OK' : 'Đã kết nối') : 'Lỗi'}
          </span>
        ) : null}
      </div>
      {status && (test || !status.ok) ? <p className="text-xs text-pretty text-muted">{status.message}</p> : null}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {provider.active ? null : (
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => setActiveProviderAction(provider.id))}
            className="h-9 text-primary hover:underline"
          >
            Dùng cái này
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setTest(null)
              setTest(await testProviderAction(provider.id))
            })
          }
          className="h-9 hover:underline disabled:opacity-60"
        >
          {pending ? 'Đang thử…' : 'Thử kết nối'}
        </button>
        <button type="button" onClick={() => setEditing(true)} className="h-9 hover:underline">
          Sửa
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (window.confirm(`Xoá cấu hình “${provider.label}”? Key đã lưu sẽ bị xoá.`)) {
              startTransition(() => deleteProviderAction(provider.id))
            }
          }}
          className="h-9 text-muted hover:text-primary"
        >
          Xoá
        </button>
      </div>
    </div>
  )
}

/** "AI trong app": the user's own providers, one active. Keys are write-only from here. */
export function AiProviders({ providers }: { providers: ProviderView[] }) {
  const [adding, setAdding] = useState(false)

  return (
    <div className="flex flex-col gap-3">
      {providers.map((p) => (
        <ProviderCard key={p.id} provider={p} />
      ))}
      {adding ? (
        <ProviderForm onDone={() => setAdding(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-[18px] border-2 border-dashed border-line p-3.5 text-sm text-muted hover:border-ink hover:text-ink"
        >
          + Thêm nhà cung cấp
        </button>
      )}
      <p className="text-xs text-pretty text-muted">
        Key được mã hoá trước khi lưu, chỉ hiện 4 ký tự cuối và không bao giờ gửi xuống trình duyệt. Mỗi lần nhờ AI soạn
        bữa tốn vài trăm đồng hoặc ít hơn, tính vào tài khoản AI của bạn.
      </p>
    </div>
  )
}

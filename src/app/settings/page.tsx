import { headers } from 'next/headers'
import { AppShell } from '@/components/app-shell'
import { requireUser } from '@/lib/auth/dal'
import { db } from '@/server/db'
import { listTokens } from '@/server/mcp/tokens'
import { revokeTokenAction } from '@/app/_actions/tokens'
import { listProviders } from '@/server/ai/providers'
import { AiProviders } from './ai-providers'
import { MintTokenForm } from './mint-token-form'

export default async function SettingsPage() {
  const { user } = await requireUser()
  const [tokens, providers] = await Promise.all([listTokens(db, user.id), listProviders(db, user.id)])

  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const protocol = h.get('x-forwarded-proto') ?? 'http'
  const endpoint = `${protocol}://${host}/api/mcp`

  return (
    <AppShell>
      <div className="space-y-8">
        <section className="space-y-3">
          <header className="space-y-1">
            <h1 className="text-2xl font-semibold">AI trong app</h1>
            <p className="text-muted">
              Dùng khi ghi bữa: đoán món từ ảnh, soạn đồ đã dùng cho món không có công thức. Món có trong sổ thì app tự
              tính, không gọi AI.
            </p>
          </header>
          <AiProviders
            providers={providers.map((p) => ({
              id: p.id,
              kind: p.kind,
              label: p.label,
              endpoint: p.endpoint,
              model: p.model,
              apiKeyHint: p.apiKeyHint,
              active: p.active,
              checked: p.lastCheckedAt != null,
              lastError: p.lastError,
            }))}
          />
        </section>

        <header className="space-y-2">
          <h2 className="text-2xl font-semibold">Kết nối Claude qua MCP</h2>
          <p className="text-muted">
            Tạo token rồi thêm cookbook vào Claude. Sau đó chỉ cần nói “lưu công thức này” là xong.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="font-semibold">Tạo token</h2>
          <MintTokenForm endpoint={endpoint} />
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold">Token đang có</h2>
          {tokens.length === 0 ? (
            <p className="text-sm text-muted">Chưa có token nào.</p>
          ) : (
            <ul className="divide-y divide-line border-y border-line text-sm">
              {tokens.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-4 py-3">
                  <div>
                    <p className={t.revokedAt ? 'text-muted line-through' : 'font-medium'}>{t.name}</p>
                    <p className="text-muted">
                      Tạo {t.createdAt.toLocaleDateString('vi-VN')}
                      {t.lastUsedAt ? ` · dùng lần cuối ${t.lastUsedAt.toLocaleDateString('vi-VN')}` : ' · chưa dùng'}
                    </p>
                  </div>
                  {t.revokedAt ? (
                    <span className="text-muted">Đã thu hồi</span>
                  ) : (
                    <form action={revokeTokenAction.bind(null, t.id)}>
                      <button type="submit" className="text-primary hover:underline">
                        Thu hồi
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  )
}

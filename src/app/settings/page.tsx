import { headers } from 'next/headers'
import { AppShell } from '@/components/app-shell'
import { requireUser } from '@/lib/auth/dal'
import { db } from '@/server/db'
import { listTokens } from '@/server/mcp/tokens'
import { revokeTokenAction } from '@/app/_actions/tokens'
import { listProviders } from '@/server/ai/providers'
import { AiProviders } from './ai-providers'
import { PushSettings } from './push-settings'
import { listStreaks } from '@/server/motivation/service'
import { MintTokenForm } from './mint-token-form'

export default async function SettingsPage() {
  const { user } = await requireUser()
  const [tokens, providers, streaks] = await Promise.all([
    listTokens(db, user.id),
    listProviders(db, user.id),
    listStreaks(db, user.id),
  ])

  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const protocol = h.get('x-forwarded-proto') ?? 'http'
  const endpoint = `${protocol}://${host}/api/mcp`

  return (
    <AppShell>
      <div className="space-y-8">
        <section className="space-y-3">
          <header className="space-y-1">
            <h1 className="text-2xl font-semibold">Thông báo nhắc</h1>
            <p className="text-muted">Mỗi streak có giờ nhắc riêng, đặt khi tạo hoặc sửa streak. Đã làm trong ngày thì không nhắc.</p>
          </header>
          <PushSettings reminders={streaks.filter((s) => s.remindAt).length} />
        </section>

        <section className="space-y-3">
          <header className="space-y-1">
            <h2 className="text-2xl font-semibold">AI trong app</h2>
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
            Sau khi kết nối, chỉ cần nói với Claude “lưu công thức này”, “tối nay nấu canh chua” là xong.
          </p>
        </header>

        <section className="space-y-2 rounded-[18px] border border-line bg-surface p-4">
          <h2 className="font-semibold">Claude trên điện thoại, claude.ai, Claude Desktop</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-pretty">
            <li>Mở claude.ai (trên web, làm một lần) → Cài đặt → Connectors → Add custom connector.</li>
            <li>
              Dán địa chỉ: <span className="font-mono break-all">{endpoint}</span>, không cần điền OAuth Client ID/Secret.
            </li>
            <li>Bấm Connect, đăng nhập tài khoản này và bấm “Cho phép”.</li>
          </ol>
          <p className="text-xs text-muted">
            Kết nối xong dùng được luôn trên app Claude điện thoại. Kết nối hiện trong “Token đang có”, thu hồi ở đó.
          </p>
        </section>

        <h2 className="pt-2 font-semibold">Claude Code (dùng token)</h2>

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

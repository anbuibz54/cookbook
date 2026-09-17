import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/dal'
import { db } from '@/server/db'
import { getClient, redirectAllowed } from '@/server/oauth/service'
import { approveAction, denyAction } from './actions'

const one = (value: string | string[] | undefined) => (typeof value === 'string' ? value : '')

function Problem({ text }: { text: string }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-3 px-[18px]">
      <h1 className="font-display text-2xl font-extrabold">Không kết nối được</h1>
      <p className="text-pretty text-muted">{text}</p>
    </div>
  )
}

/**
 * The OAuth consent screen: Claude (on the phone, on claude.ai) asks to use the
 * cookbook on the signed-in user's behalf. Signed-out visitors are sent to
 * /login by the proxy and come back here with the full query string.
 *
 * A bad client or redirect URI is shown here, never redirected to — sending an
 * error to an unverified URL is how open redirects happen.
 */
export default async function AuthorizePage({ searchParams }: PageProps<'/oauth/authorize'>) {
  const { user } = await requireUser()
  const q = await searchParams
  const clientId = one(q.client_id)
  const redirectUri = one(q.redirect_uri)
  const state = one(q.state)

  const client = clientId ? await getClient(db, clientId) : null
  if (!client) return <Problem text="Ứng dụng này chưa đăng ký với Sổ công thức. Thử kết nối lại từ đầu trong Claude." />
  if (!redirectAllowed(client, redirectUri)) {
    return <Problem text="Địa chỉ quay về không khớp với ứng dụng đã đăng ký, nên tui không gửi quyền truy cập đi." />
  }

  const fail = (error: string, description: string) => {
    const url = new URL(redirectUri)
    url.searchParams.set('error', error)
    url.searchParams.set('error_description', description)
    if (state) url.searchParams.set('state', state)
    redirect(url.toString())
  }
  if (one(q.response_type) !== 'code') fail('unsupported_response_type', 'Only response_type=code is supported.')
  if (one(q.code_challenge_method) !== 'S256' || !one(q.code_challenge)) {
    fail('invalid_request', 'PKCE with code_challenge_method=S256 is required.')
  }

  const host = new URL(redirectUri).host

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-5 px-[18px] py-10">
      <div className="flex flex-col gap-4 rounded-[22px] border-2 border-ink bg-surface p-5 shadow-pop">
        <span className="self-start rounded-full bg-tile-mint px-3 py-1 text-xs font-medium">Yêu cầu kết nối</span>
        <h1 className="font-display text-[26px] leading-tight font-extrabold text-balance">
          {client.name} muốn dùng Sổ công thức của bạn
        </h1>
        <p className="text-sm text-muted">
          Đang đăng nhập: <span className="text-ink">{user.email}</span>
        </p>
        <div className="flex flex-col gap-1.5 text-[15px]">
          <span className="font-medium">Sau khi cho phép, ứng dụng này có thể:</span>
          <ul className="flex flex-col gap-1 text-pretty">
            <li>· Đọc, lưu và sửa công thức trong sổ</li>
            <li>· Xem và cập nhật tủ lạnh, danh sách đi chợ</li>
            <li>· Ghi bữa ăn vào nhật ký, tick streak, ghim món muốn nấu</li>
          </ul>
        </div>
        <p className="text-xs text-pretty text-muted">
          Quyền truy cập sẽ được gửi về <span className="font-mono text-ink">{host}</span>. Muốn ngắt kết nối thì vào Cài
          đặt → Token đang có → Thu hồi.
        </p>
        <form className="grid grid-cols-2 gap-2.5">
          <input type="hidden" name="client_id" value={client.clientId} />
          <input type="hidden" name="redirect_uri" value={redirectUri} />
          <input type="hidden" name="state" value={state} />
          <input type="hidden" name="code_challenge" value={one(q.code_challenge)} />
          <button formAction={denyAction} className="h-12 rounded-full border border-line text-[15px]">
            Từ chối
          </button>
          <button
            formAction={approveAction}
            className="h-12 rounded-full border-2 border-ink bg-ink font-medium text-background shadow-pop-primary"
          >
            Cho phép
          </button>
        </form>
      </div>
    </div>
  )
}

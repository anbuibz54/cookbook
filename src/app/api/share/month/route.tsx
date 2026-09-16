import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { getSessionUser } from '@/lib/auth/dal'
import { vnDate } from '@/lib/dates'
import { db } from '@/server/db'
import { MONTH, monthRecap } from '@/server/motivation/recap'
import { readPhoto } from '@/server/storage/photos'

/**
 * The monthly share card as a PNG, 1080×1350 (4:5, what Instagram and Zalo
 * show uncropped). `?m=YYYY-MM`, default this month.
 *
 * Fonts are static TTFs in assets/fonts (OFL): the image renderer cannot read
 * woff2 or variable fonts, and its built-in font has no Vietnamese marks.
 * Photos are the user's own, read from private Storage and inlined.
 */
const fonts = Promise.all(
  ['Baloo2-ExtraBold.ttf', 'Lexend-Regular.ttf', 'Lexend-SemiBold.ttf', 'JetBrainsMono-Medium.ttf'].map((file) =>
    readFile(join(process.cwd(), 'assets/fonts', file)),
  ),
)

const S = 2.5 // design is 432×540, rendered at 2.5×
const px = (n: number) => n * S

const INK = '#241A1C'
const MUTED = '#756468'
const BG = '#FBF1F0'
const PINK = '#D9607E'
// Inner card width: 432 − 2·22 outer padding − 2·20 inner padding − 2·3 border = 342.
const INNER = 342
const TILE = (INNER - 2 * 6) / 3

const TONES = ['#C99670', '#D9A35B', '#E7C9A8', '#F2D68C', '#D9B08A', '#E4CFA4']

async function inline(userId: string, path: string) {
  const blob = await readPhoto(userId, path)
  if (!blob) return null
  const base64 = Buffer.from(await blob.arrayBuffer()).toString('base64')
  return `data:${blob.type || 'image/jpeg'};base64,${base64}`
}

export async function GET(request: Request) {
  const session = await getSessionUser()
  if (!session) return new Response('Unauthorized', { status: 401 })

  const param = new URL(request.url).searchParams.get('m')
  const month = param && MONTH.test(param) ? param : vnDate().slice(0, 7)
  const recap = await monthRecap(db, session.user.id, month)
  const images = await Promise.all(recap.photos.map((p) => inline(session.user.id, p.path)))
  const [baloo, lexend, lexendSemi, mono] = await fonts

  const tiles = Array.from({ length: 6 }, (_, i) => images[i] ?? null)

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: px(14),
          padding: px(22),
          background: PINK,
          fontFamily: 'Lexend',
          color: INK,
        }}
      >
        <div
          style={{
            flexGrow: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: px(14),
            padding: px(20),
            background: BG,
            border: `${px(3)}px solid ${INK}`,
            borderRadius: px(26),
            boxShadow: `${px(6)}px ${px(6)}px 0 ${INK}`,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: px(13), color: MUTED }}>{recap.label}</span>
            {recap.badge ? (
              <span
                style={{
                  display: 'flex',
                  background: '#E0A93C',
                  border: `${px(2)}px solid ${INK}`,
                  borderRadius: 999,
                  padding: `${px(2)}px ${px(10)}px`,
                  fontSize: px(12),
                  fontWeight: 600,
                  transform: 'rotate(4deg)',
                }}
              >
                {recap.badge}
              </span>
            ) : null}
          </div>

          <span style={{ fontFamily: 'Baloo 2', fontSize: px(40), lineHeight: 0.95 }}>
            {recap.meals} bữa nhà nấu
          </span>

          <div style={{ display: 'flex', flexWrap: 'wrap', width: px(INNER), gap: px(6), borderRadius: px(14), overflow: 'hidden' }}>
            {tiles.map((src, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  width: px(TILE),
                  height: px(TILE),
                  background: TONES[i],
                  overflow: 'hidden',
                }}
              >
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element -- rendered to PNG by next/og, not a page
                  <img src={src} alt="" width={px(TILE)} height={px(TILE)} style={{ objectFit: 'cover' }} />
                ) : null}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: px(6), marginTop: 'auto' }}>
            {recap.stats.map((stat) => (
              <div key={stat.label} style={{ display: 'flex', flexDirection: 'column', width: px(TILE) }}>
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: px(22) }}>{stat.value}</span>
                <span style={{ fontSize: px(11), color: MUTED, lineHeight: 1.3 }}>{stat.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: BG }}>
          <span style={{ fontFamily: 'Baloo 2', fontSize: px(18) }}>Sổ công thức</span>
          <span style={{ fontSize: px(13) }}>bánh nhà làm, cơm nhà nấu</span>
        </div>
      </div>
    ),
    {
      width: px(432),
      height: px(540),
      fonts: [
        { name: 'Baloo 2', data: baloo, weight: 800, style: 'normal' },
        { name: 'Lexend', data: lexend, weight: 400, style: 'normal' },
        { name: 'Lexend', data: lexendSemi, weight: 600, style: 'normal' },
        { name: 'JetBrains Mono', data: mono, weight: 500, style: 'normal' },
      ],
      headers: { 'Cache-Control': 'private, no-store' },
    },
  )
}

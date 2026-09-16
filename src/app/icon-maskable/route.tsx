import { ImageResponse } from 'next/og'

/**
 * The maskable variant: Android crops installed icons to whatever shape the
 * launcher uses, so the drawing sits inside the safe circle (80% of the canvas)
 * on a full-bleed ground instead of on its own white card.
 */
export const contentType = 'image/png'

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#D9607E',
        }}
      >
        <svg width="300" height="300" viewBox="0 0 512 512" fill="none">
          <path
            d="M150 256c0-62 47-106 106-106s106 44 106 106z"
            fill="#FBF1F0"
            stroke="#241A1C"
            strokeWidth="22"
            strokeLinejoin="round"
          />
          <path
            d="M160 274h192l-24 136a26 26 0 0 1-26 22H210a26 26 0 0 1-26-22z"
            fill="#FFFFFF"
            stroke="#241A1C"
            strokeWidth="22"
            strokeLinejoin="round"
          />
          <path d="M218 306l-8 104M294 306l8 104" stroke="#241A1C" strokeWidth="16" strokeLinecap="round" />
          <circle cx="256" cy="118" r="20" fill="#241A1C" />
        </svg>
      </div>
    ),
    { width: 512, height: 512 },
  )
}

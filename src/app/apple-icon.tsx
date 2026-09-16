import { ImageResponse } from 'next/og'

/**
 * iOS home screen icon. Safari rounds the corners itself and does not mask, so
 * this one is the plain drawing on an opaque ground — a transparent icon comes
 * out black on an iPhone.
 */
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#FBF1F0',
        }}
      >
        <svg width="132" height="132" viewBox="0 0 512 512" fill="none">
          <path
            d="M150 256c0-62 47-106 106-106s106 44 106 106z"
            fill="#D9607E"
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
    size,
  )
}

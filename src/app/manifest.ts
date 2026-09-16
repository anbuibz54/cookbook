import type { MetadataRoute } from 'next'

/**
 * What makes the site installable on a phone.
 *
 * `start_url: '/'` is the home screen, which is where someone opening the app
 * in a kitchen wants to land. `display: standalone` drops the browser chrome —
 * the reason to install at all.
 *
 * Note for iPhone: Safari ignores `display` here and reads
 * `appleWebApp.capable` from the page metadata instead (see layout.tsx); both
 * have to be set or an installed icon opens in a normal browser tab.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Sổ công thức',
    short_name: 'Sổ công thức',
    description: 'Sổ công thức nấu ăn, tủ lạnh và đi chợ.',
    lang: 'vi',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#fbf1f0',
    theme_color: '#fbf1f0',
    categories: ['food', 'lifestyle'],
    icons: [
      { src: '/icon', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Tủ lạnh', url: '/pantry' },
      { name: 'Đi chợ', url: '/shopping' },
    ],
  }
}

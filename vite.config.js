import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// R3-008: PWA 対応（vite-plugin-pwa）
// - アプリ名: カラクリ庭
// - テーマカラー: #B53E3A (vermilion)
// - バックグラウンドカラー: #2B2A28 (ink)
// - 静的アセット（JS/CSS/フォント等）のみキャッシュ。Firestore データはキャッシュしない。
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'カラクリ庭',
        short_name: 'カラクリ庭',
        description: '物理連鎖 × 最少手数最適化 × 和テイストのじっくり解くパズル',
        theme_color: '#B53E3A',
        background_color: '#2B2A28',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'ja',
        start_url: '/',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2,woff,ttf}'],
        // Firestore など外部 API はキャッシュしない（DB 一貫性のため）
        navigateFallbackDenylist: [/^\/__/, /\/firestore\.googleapis\.com/, /\/identitytoolkit\.googleapis\.com/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
})

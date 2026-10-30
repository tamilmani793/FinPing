import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

const base = process.env.BASE_PATH || '/'

// What this build is, so Settings can say which version is installed: when it was built, from which commit and branch, and
// which CI run (GitHub sets these; on a computer they come from git)
const git = cmd => { try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return '' } }
const buildInfo = {
  time: new Date().toISOString(),
  commit: (process.env.GITHUB_SHA || git('git rev-parse HEAD')).slice(0, 7),
  branch: process.env.BUILD_BRANCH || process.env.GITHUB_REF_NAME || git('git rev-parse --abbrev-ref HEAD'),
  run: process.env.GITHUB_RUN_NUMBER || '',
  dirty: !process.env.GITHUB_SHA && !!git('git status --porcelain'),
}

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __BUILD_INFO__: JSON.stringify(buildInfo) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'FinPing',
        short_name: 'FinPing',
        description: 'SMS-driven personal finance tracker for India',
        theme_color: '#090A0F',
        background_color: '#090A0F',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ],
        shortcuts: [
          { name: 'Dashboard', url: base, description: 'Open financial dashboard' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}']
      }
    })
  ]
})

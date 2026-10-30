import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/inter/800.css'
import './index.css'
import { applyTheme, watchSystemTheme } from './lib/theme'
import { db } from './db/schema'

// colours are applied before the first paint so there is no flash of the wrong theme
applyTheme()
watchSystemTheme()

const mount = () => ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// The saved data can come from a NEWER version of the app (for example a test build of another branch was opened on this device or in
// this browser). An older build cannot read it, and used to show a blank screen. Say so instead; nothing is deleted.
const newerData = () => {
  document.getElementById('root').innerHTML = '<div style="font-family:system-ui,sans-serif;max-width:420px;margin:0 auto;padding:36px 24px;line-height:1.5;color:#2a2018">' +
    '<h2 style="margin:0 0 8px">Your data is from a newer version</h2>' +
    '<p>This copy of FinPing is older than the one that last saved your data here, so it cannot open it. <b>Nothing has been deleted.</b></p>' +
    '<p>Open or install the newer version (the branch or APK you used last) and your data will be there. To use this older version anyway, first export a backup from the newer one, then clear this site\'s data and restore the backup.</p></div>'
}
db.open().then(mount).catch(e => (/VersionError/i.test(String(e?.name) + String(e?.message)) ? newerData() : mount()))

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

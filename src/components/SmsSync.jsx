import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { isNative, hasSmsPermission, requestSmsPermission, syncInbox, listenForSms } from '../lib/nativeSms'

// Runs the SMS sync on the native Android app; renders a status banner everywhere.
export function useSmsSync() {
  const { showNotification } = useStore()
  const [state, setState] = useState(isNative() ? 'checking' : 'web') // web | checking | needs | on

  const start = async () => {
    const n = await syncInbox()
    if (n > 0) showNotification(`${n} SMS added`, 'success')
    await listenForSms(r => { if (r.status === 'success') showNotification(r.message, 'success') })
    setState('on')
  }

  useEffect(() => {
    if (!isNative()) return
    hasSmsPermission().then(ok => (ok ? start() : setState('needs')))
    const onVisible = () => { if (document.visibilityState === 'visible') syncInbox().catch(() => {}) }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  const enable = async () => {
    if (await requestSmsPermission()) await start()
    else showNotification('SMS permission denied', 'error')
  }

  return { state, enable }
}

export function SmsBanner({ state, enable }) {
  const box = { background: 'var(--indigo-bg)', border: '1px solid var(--indigo-border)', borderRadius: 12, padding: '10px 12px', margin: '10px 16px 0', display: 'flex', gap: 10, alignItems: 'center' }
  if (state === 'checking') return null
  if (state === 'needs') {
    return (
      <div style={box}>
        <div style={{ fontSize: 20 }}>📡</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Allow SMS access</div>
          <div style={{ fontSize: 11, color: 'var(--txt2)' }}>FinPing reads bank SMS on your phone to track spends. Nothing leaves the device.</div>
        </div>
        <button className="btn-primary" style={{ height: 32, fontSize: 12, padding: '0 12px' }} onClick={enable}>Allow</button>
      </div>
    )
  }
  if (state === 'on') {
    return (
      <div style={box}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--mint)' }} />
        <div style={{ fontSize: 12, color: 'var(--txt2)' }}>SMS sync on — new bank SMS are added automatically</div>
      </div>
    )
  }
  return (
    <div style={box}>
      <div style={{ fontSize: 20 }}>📱</div>
      <div style={{ fontSize: 12, color: 'var(--txt2)' }}>Automatic SMS sync needs the FinPing Android app. In the browser, use Paste SMS.</div>
    </div>
  )
}

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

// Small status in the top-right corner of the header: green when SMS sync is running, grey/amber when it is not.
export function SyncPill({ state }) {
  if (state === 'checking') return null
  const on = state === 'on'
  const color = on ? 'var(--mint)' : state === 'needs' ? 'var(--amber)' : 'var(--txt3)'
  return (
    <div title={on ? 'New bank SMS are added automatically' : 'SMS sync is off'} style={{ display: 'flex', alignItems: 'center', gap: 5, background: on ? 'var(--mint-bg)' : 'var(--bg2)', border: `1px solid ${on ? 'var(--mint-border)' : 'var(--border2)'}`, borderRadius: 9999, padding: '3px 9px', fontSize: 10, fontWeight: 700, color: on ? 'var(--mint-dim)' : 'var(--txt2)', whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      {on ? 'Sync on' : 'Sync off'}
    </div>
  )
}

// The full explanation is only shown while SMS permission is missing. Once it is granted it goes away.
export function SmsPermissionCard({ state, enable }) {
  if (state !== 'needs') return null
  return (
    <div style={{ background: 'var(--indigo-bg)', border: '1px solid var(--indigo-border)', borderRadius: 12, padding: '10px 12px', margin: '0 0 12px', display: 'flex', gap: 10, alignItems: 'center' }}>
      <div style={{ fontSize: 20 }}>📡</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Allow SMS access</div>
        <div style={{ fontSize: 11, color: 'var(--txt2)' }}>FinPing reads bank SMS on your phone to track spends. Nothing leaves the device.</div>
      </div>
      <button className="btn-primary" style={{ height: 32, fontSize: 12, padding: '0 12px' }} onClick={enable}>Allow</button>
    </div>
  )
}

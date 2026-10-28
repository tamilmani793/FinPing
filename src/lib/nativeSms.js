import { Capacitor, registerPlugin } from '@capacitor/core'
import { ingestSMS } from './ingestSMS'

const FinSms = registerPlugin('FinSms')
const LAST_SYNC_KEY = 'finping_last_sms_sync'
const BANK_HINT = /(?:rs\.?|inr|₹)\s?[\d,]+|debited|credited|spent|emi|sip|statement/i

export const isNative = () => Capacitor.isNativePlatform()

export async function hasSmsPermission() {
  if (!isNative()) return false
  return (await FinSms.hasSms()).granted
}

export async function requestSmsPermission() {
  if (!isNative()) return false
  return (await FinSms.requestSms()).granted
}

// Read inbox messages since the last sync and apply them. Returns how many were applied.
// rescanDays re-reads that many days back regardless of the last sync (messages already applied are skipped).
export async function syncInbox({ firstRunDays = 30, rescanDays = 0 } = {}) {
  if (!(await hasSmsPermission())) return 0
  const last = rescanDays > 0 ? Date.now() - rescanDays * 864e5 : Number(localStorage.getItem(LAST_SYNC_KEY)) || Date.now() - firstRunDays * 864e5
  const { messages } = await FinSms.readInbox({ sinceMs: last, limit: 1000 })
  let applied = 0
  for (const m of [...messages].sort((a, b) => a.date - b.date)) {
    if (!BANK_HINT.test(m.body || '')) continue
    const r = await ingestSMS(m.body, { address: m.address, date: m.date })
    if (r.status === 'success') applied++
  }
  localStorage.setItem(LAST_SYNC_KEY, String(Date.now()))
  return applied
}

// Live: new SMS while the app is open. Returns an unsubscribe function.
export async function listenForSms(onResult) {
  if (!(await hasSmsPermission())) return () => {}
  await FinSms.startListening()
  const handle = await FinSms.addListener('smsReceived', async m => {
    if (!BANK_HINT.test(m.body || '')) return
    const r = await ingestSMS(m.body, { address: m.address, date: m.date })
    localStorage.setItem(LAST_SYNC_KEY, String(Date.now()))
    if (onResult) onResult(r)
  })
  return () => handle.remove()
}

import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { db } from '../db/schema'

// Everything the app keeps lives in IndexedDB (+ a few small localStorage keys: name, picture, theme). A full backup is
// one JSON file with all of it, so it can be restored on a fresh install.
const LOCAL_KEYS = ['finping_user_name', 'finping_profile_photo', 'finping_palette', 'finping_mode', 'finping_options', 'finping_last_sms_sync']
const LAST_BACKUP_KEY = 'finping_last_backup'

// Dates become { $date: ISO } so they come back as real Date objects.
function stringify(obj) {
  return JSON.stringify(obj, function (key, value) {
    const raw = this[key]
    if (raw instanceof Date) return isNaN(raw) ? null : { $date: raw.toISOString() }
    return value
  })
}
const parse = text => JSON.parse(text, (k, v) => (v && typeof v === 'object' && typeof v.$date === 'string' ? new Date(v.$date) : v))

export const lastBackupAt = () => {
  const v = localStorage.getItem(LAST_BACKUP_KEY)
  return v ? new Date(Number(v)) : null
}

export async function buildFullBackup() {
  const tables = {}
  for (const t of db.tables) tables[t.name] = await t.toArray()
  const local = {}
  for (const k of LOCAL_KEYS) { const v = localStorage.getItem(k); if (v != null) local[k] = v }
  return {
    json: stringify({ app: 'FinPing', kind: 'full', version: 1, dbVersion: db.verno, exportedAt: new Date(), localStorage: local, tables }),
    counts: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])),
  }
}

export const backupFileName = () => `finping-backup-${new Date().toISOString().slice(0, 10)}.json`

// Android: write to cache and open the share sheet (Drive, Files, WhatsApp, email...).
// Browser: normal file download. Returns 'shared' | 'downloaded'.
export async function exportBackup() {
  const { json } = await buildFullBackup()
  const name = backupFileName()
  let how
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({ path: name, data: json, directory: Directory.Cache, encoding: Encoding.UTF8 })
    await Share.share({ title: 'FinPing backup', text: 'FinPing backup file', files: [uri], dialogTitle: 'Save your FinPing backup' })
    how = 'shared'
  } else {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    how = 'downloaded'
  }
  localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()))
  return how
}

// Reads a backup without applying it, so the UI can show what it contains.
export function inspectBackup(text) {
  let data
  try { data = parse(text) } catch (e) { throw new Error('That is not a valid backup file') }
  if (!data || data.app !== 'FinPing' || data.kind !== 'full' || typeof data.tables !== 'object') {
    throw new Error('This is not a FinPing backup file')
  }
  if (data.dbVersion > db.verno) throw new Error('This backup is from a newer version of the app. Update the app first.')
  return { data, counts: Object.fromEntries(Object.entries(data.tables).map(([k, v]) => [k, v.length])), exportedAt: data.exportedAt }
}

// Replaces ALL current data with the backup (original ids are kept, so links between records survive).
export async function restoreBackup(text) {
  const { data } = inspectBackup(text)
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) {
      await t.clear()
      const rows = data.tables[t.name]
      if (Array.isArray(rows) && rows.length) await t.bulkPut(rows)
    }
  })
  for (const k of LOCAL_KEYS) {
    if (data.localStorage?.[k] != null) localStorage.setItem(k, data.localStorage[k])
  }
  localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()))
}

import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { db } from '../db/schema'

// Salary documents (offer letter, payslips, Form 16...). The file is kept INSIDE the app on this phone, as text in the same local
// database as everything else, so it is part of the backup file and is never uploaded anywhere.

export const DOC_KINDS = [
  { value: 'payslip', label: 'Payslip' }, { value: 'offer', label: 'Offer letter' }, { value: 'appointment', label: 'Appointment letter' },
  { value: 'hike', label: 'Hike / appraisal letter' }, { value: 'form16', label: 'Form 16 / tax' }, { value: 'relieving', label: 'Relieving / experience letter' },
  { value: 'bank', label: 'Bank / PF statement' }, { value: 'other', label: 'Other' },
]
export const MAX_DOC_BYTES = 8 * 1024 * 1024 // per file: keeps the local database and the backup file a sensible size
const OK = /^(application\/pdf|image\/(png|jpe?g|webp|heic|heif)|application\/(msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document)|text\/plain)$/i

export const fmtSize = b => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }
// "Payslip_Oct2026.pdf", "salary-2026-10.pdf", "10-2026 payslip.pdf" -> 'YYYY-MM' (or '' when it cannot tell)
export function guessMonth(name) {
  const s = String(name || '').toLowerCase()
  let m = s.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s._-]*(?:'|’)?(20\d\d|\d\d)\b/)
  if (m) return `${m[2].length === 2 ? 2000 + +m[2] : m[2]}-${String(MONTHS[m[1]]).padStart(2, '0')}`
  m = s.match(/(20\d\d)[\s._-](0[1-9]|1[0-2])\b/)
  if (m) return `${m[1]}-${m[2]}`
  m = s.match(/\b(0[1-9]|1[0-2])[\s._-](20\d\d)\b/)
  return m ? `${m[2]}-${m[1]}` : ''
}

const readAsDataURL = file => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new Error('Could not read that file')); r.readAsDataURL(file) })

// Saves each picked file. Returns { added, skipped: [{ name, why }] }.
export async function addDocs(files, { kind, jobId = null, month = '', note = '' }) {
  const out = { added: 0, skipped: [] }
  for (const f of files) {
    if (f.size > MAX_DOC_BYTES) { out.skipped.push({ name: f.name, why: `larger than ${fmtSize(MAX_DOC_BYTES)}` }); continue }
    if (f.type && !OK.test(f.type)) { out.skipped.push({ name: f.name, why: 'only PDF, images, Word or text files' }); continue }
    const data = await readAsDataURL(f)
    await db.salaryDocs.add({ kind, jobId, month: kind === 'payslip' ? (month || guessMonth(f.name)) : '', name: f.name, mime: f.type || 'application/octet-stream', size: f.size, note, data, addedAt: new Date() })
    out.added++
  }
  return out
}

export async function updateDoc(id, patch) { await db.salaryDocs.update(id, patch) }
export async function deleteDoc(id) { await db.salaryDocs.delete(id) }

// the list without the (large) file contents
export async function listDocs() { return (await db.salaryDocs.toArray()).map(({ data, ...rest }) => rest) }

// Opens a saved file: a normal tab in the browser; on Android it is handed to the share sheet so a PDF viewer / gallery can open it.
export async function openDoc(id) {
  const d = await db.salaryDocs.get(id)
  if (!d) throw new Error('That file is no longer saved')
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({ path: d.name.replace(/[^\w.\- ]+/g, '_'), data: d.data.split(',')[1], directory: Directory.Cache })
    await Share.share({ title: d.name, files: [uri], dialogTitle: d.name })
    return
  }
  const bin = atob(d.data.split(',')[1]); const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const url = URL.createObjectURL(new Blob([bytes], { type: d.mime }))
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

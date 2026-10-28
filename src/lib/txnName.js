import { narrationInfo, fallbackName } from './statement'

const UNNAMED = /^(unknown|na|n\/a|-+)$/i

// The name to show for a transaction. If it was saved without a usable name but a bank statement line is attached to it,
// the name is read from that line, so "Unknown" does not stay on screen when the bank has told us who it was.
export function txnName(t) {
  const m = String(t?.merchant || '').trim()
  if (m && !UNNAMED.test(m)) return m
  if (t?.bankNarration) {
    const info = narrationInfo(t.bankNarration).merchant
    return info && info !== 'Unknown' ? info : (fallbackName(t.bankNarration) || m || 'Unknown')
  }
  return m || 'Unknown'
}

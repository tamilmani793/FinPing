import { db } from '../db/schema'

// Banks often send two SMS for one transaction (e.g. "Update INR debited amount of 13387" and
// "Payment Alert Deducted 13387"). Two transactions are treated as the SAME one when they have the
// same direction and amount, land within a few minutes of each other, and nothing contradicts them:
// different account digits, or two different merchants, mean they really are separate payments.
export const DUP_WINDOW_MS = 5 * 60 * 1000

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const noMerchant = m => !m || /^unknown$/i.test(String(m).trim())

export function isSameTransaction(a, b, windowMs = DUP_WINDOW_MS) {
  if (a.type !== b.type) return false
  if (Math.abs((a.amount || 0) - (b.amount || 0)) > 0.009) return false
  if (Math.abs(new Date(a.date) - new Date(b.date)) > windowMs) return false
  if (a.accountLast4 && b.accountLast4 && a.accountLast4 !== b.accountLast4) return false
  // A loan EMI we recorded is named after the loan ("Car Loan EMI"), while the bank's own alert names
  // whatever it likes ("towards SBI loan"), so names are not compared for those.
  const loanEntry = a.kind === 'loan_payment' || b.kind === 'loan_payment' || a.kind === 'loan_received' || b.kind === 'loan_received'
  if (!loanEntry && !noMerchant(a.merchant) && !noMerchant(b.merchant) && norm(a.merchant) !== norm(b.merchant)) return false
  return true
}

// An existing, already-saved transaction that the new one duplicates (card payments are handled separately).
export async function findDuplicate(candidate, windowMs = DUP_WINDOW_MS) {
  const t = new Date(candidate.date).getTime()
  const near = await db.transactions.where('date').between(new Date(t - windowMs), new Date(t + windowMs), true, true).toArray()
  return near.find(x => x.kind !== 'card_payment' && isSameTransaction(x, candidate, windowMs)) || null
}

// Folds the second SMS into the first: keeps one entry, but fills in anything the first one lacked.
export async function mergeDuplicate(existing, extra, smsText) {
  const patch = { extraSMS: [...(existing.extraSMS || []), smsText].filter(Boolean) }
  if (noMerchant(existing.merchant) && !noMerchant(extra.merchant)) patch.merchant = extra.merchant
  if ((!existing.category || existing.category === 'General') && extra.category && extra.category !== 'General') patch.category = extra.category
  if (!existing.accountLast4 && extra.accountLast4) patch.accountLast4 = extra.accountLast4
  if (!existing.bank && extra.bank) patch.bank = extra.bank
  if (existing.cardId == null && extra.cardId != null) patch.cardId = extra.cardId
  await db.transactions.update(existing.id, patch)
}

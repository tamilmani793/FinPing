import { parseSMS } from './smsParser'

// Pure helpers (no database) for deciding which saved transactions are really the same payment.
// Banks often send several SMS for one payment, but people also genuinely pay the same amount twice
// in a row (4 ATM withdrawals of 8,000; 4 payments of 4,000). So "same amount, same minute" is NOT
// enough: the evidence inside the messages decides.
export const DUP_WINDOW_MS = 5 * 60 * 1000
const BARE_WINDOW_MS = 30 * 1000
const DAY = 24 * 60 * 60 * 1000

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const noMerchant = m => !m || /^unknown$/i.test(String(m).trim())

// What an SMS tells us about WHICH payment it is.
export function smsSignals(text) {
  const s = String(text || '')
  // reference numbers that follow a label ("Ref 193627762227", "RRN 663921434996", "UPI 627761638974",
  // "Reference Number is 665871797702"). Bare 10-digit numbers are phone numbers, so they are ignored.
  const refs = new Set()
  for (const m of s.matchAll(/\b(?:ref(?:erence)?(?:\s*(?:no|number))?\.?|rrn|utr|upi)\b\s*(?:is|:|-|#)?\s*(\d{9,14})\b/gi)) refs.add(m[1])
  // running balance the bank quotes: two entries with different balances cannot be one payment
  const bal = s.match(/\b(?:avl\.?\s*bal(?:ance)?|available\s*bal(?:ance)?|total\s*balance|bal(?:ance)?)\b\s*(?:is|of|:)?\s*(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d+)?)/i)
  // the time of the transaction written inside the SMS ("On 2026-10-19:12:49:16", "14-10-2026 09:14:14")
  let stamp = null
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})[:\sT](\d{2}):(\d{2}):(\d{2})/)
  const dmy = s.match(/(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/)
  if (iso) stamp = new Date(+iso[1], +iso[2] - 1, +iso[3], +iso[4], +iso[5], +iso[6]).getTime()
  else if (dmy) stamp = new Date(+dmy[3], +dmy[2] - 1, +dmy[1], +dmy[4], +dmy[5], +dmy[6]).getTime()
  // standing-instruction style alerts can trail each other by hours
  const mandate = /\b(?:ach|nach|umrn|e-?mandate|auto-?\s?pay|standing instruction)\b/i.test(s)
  return { refs, balance: bal ? parseFloat(bal[1].replace(/,/g, '')) : null, stamp, mandate }
}

const sameLocalDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString()
const shares = (x, y) => [...x].some(v => y.has(v))

export function isSameTransaction(a, b, windowMs = DUP_WINDOW_MS) {
  if (a.type !== b.type) return false
  if (Math.abs((a.amount || 0) - (b.amount || 0)) > 0.009) return false
  const sa = smsSignals(a.rawSMS), sb = smsSignals(b.rawSMS)

  if (shares(sa.refs, sb.refs)) return true                 // same reference number: certainly the same payment
  if (sa.refs.size && sb.refs.size) return false            // two different references: two payments
  if (sa.balance != null && sb.balance != null && Math.abs(sa.balance - sb.balance) > 0.009) return false
  if (sa.stamp != null && sb.stamp != null && Math.abs(sa.stamp - sb.stamp) > 2000) return false

  if (a.accountLast4 && b.accountLast4 && a.accountLast4 !== b.accountLast4) return false
  // A loan EMI we recorded is named after the loan ("Car Loan EMI") while the bank's own alert names it
  // another way, so names are not compared for those.
  const loanEntry = ['loan_payment', 'loan_received'].includes(a.kind) || ['loan_payment', 'loan_received'].includes(b.kind)
  if (!loanEntry && !noMerchant(a.merchant) && !noMerchant(b.merchant) && norm(a.merchant) !== norm(b.merchant)) return false

  const dt = Math.abs(new Date(a.date) - new Date(b.date))
  // an EMI is posted on its due date, while the bank's alert carries the real debit time: same day is close enough
  if (loanEntry && dt <= 30 * 60 * 60 * 1000) return true
  // Nothing inside either message tells the payments apart (no reference, balance or time stamp): only a copy that
  // arrives within seconds is the same alert. Four genuine payments of the same amount a minute or two apart stay four.
  const bare = !sa.refs.size && !sb.refs.size && sa.balance == null && sb.balance == null && sa.stamp == null && sb.stamp == null
  if (dt <= (bare ? Math.min(windowMs, BARE_WINDOW_MS) : windowMs)) return true
  return sa.mandate && sb.mandate && sameLocalDay(a.date, b.date)
}

// Which of several copies to keep: the one that is linked to a card/account and says who was paid.
export const keepScore = t => (t.cardId != null ? 4 : 0) + (noMerchant(t.merchant) ? 0 : 2) + (t.category && t.category !== 'General' ? 1 : 0) + (t.parsedBy === 'manual' || t.userEdited ? 3 : 0) + (t.stmtKey ? 1 : 0)

// ids of the other side of an own-account transfer: a debit and a credit that quote the same reference
export function transferPairs(txns) {
  const out = []
  const sig = new Map(txns.map(t => [t.id, smsSignals(t.rawSMS)]))
  for (let i = 0; i < txns.length; i++) {
    for (let j = i + 1; j < txns.length; j++) {
      const a = txns[i], b = txns[j]
      if (a.type === b.type || Math.abs(a.amount - b.amount) > 0.009) continue
      if (Math.abs(new Date(a.date) - new Date(b.date)) > DAY) continue
      if (shares(sig.get(a.id).refs, sig.get(b.id).refs)) out.push([a.id, b.id])
    }
  }
  return out
}

const sameBank = (a, b) => !!a && !!b && String(a).toLowerCase().split(' ')[0] === String(b).toLowerCase().split(' ')[0]

// Works out what a clean-up should do, without touching anything.
//   remove:   saved rows that were never money movements (OTPs, failed payments, reminders, bill notices...)
//   payments: rows that are really a credit-card bill payment -> { id, cardId }
//   merge:    [{ keep, drop }] duplicates of one payment
//   transfers: [idA, idB] own-account transfers (excluded from income/expense totals)
export function planCleanup(txns, cards) {
  const plan = { remove: [], payments: [], merge: [], transfers: [] }
  const creditCards = cards.filter(c => !c.draft && (!c.cardType || c.cardType === 'credit'))
  const gone = new Set()
  const rows = txns.filter(t => t.kind !== 'card_payment' && t.kind !== 'loan_payment' && t.kind !== 'loan_received')

  for (const t of rows) {
    if (!t.rawSMS || t.parsedBy === 'manual') continue
    const p = parseSMS(t.rawSMS, '', new Date(t.date))
    if (p && (p.type === 'transaction' || p.type === 'cashback_credited')) continue // a real money movement
    if (p && p.type === 'payment_received') {
      // the issuer confirming a card bill payment: it belongs on that card as a payment, not as a spend
      const candidates = creditCards.filter(c => (p.cardLast4 ? c.cardLast4 === p.cardLast4 : sameBank(c.bank, p.bank)))
      if (candidates.length === 1) { plan.payments.push({ id: t.id, cardId: candidates[0].id }); gone.add(t.id); continue }
    }
    plan.remove.push(t.id); gone.add(t.id)
  }

  // duplicates among what is left, oldest first
  const left = rows.filter(t => !gone.has(t.id)).sort((a, b) => new Date(a.date) - new Date(b.date))
  const groups = []
  for (const t of left) {
    let g = null
    for (let i = groups.length - 1; i >= 0; i--) {
      if (new Date(t.date) - new Date(groups[i][0].date) > DAY) break
      if (groups[i].some(x => isSameTransaction(x, t))) { g = groups[i]; break }
    }
    if (g) g.push(t); else groups.push([t])
  }
  const dropped = new Set()
  for (const g of groups) {
    if (g.length < 2) continue
    const keep = [...g].sort((a, b) => keepScore(b) - keepScore(a) || new Date(a.date) - new Date(b.date))[0]
    for (const t of g) if (t.id !== keep.id) { plan.merge.push({ keep: keep.id, drop: t.id }); dropped.add(t.id) }
  }
  plan.transfers = transferPairs(left.filter(t => !dropped.has(t.id)))
  return plan
}

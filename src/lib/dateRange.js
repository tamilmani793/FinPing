import { txnName } from './txnName'
import { startOfDay, endOfDay, startOfMonth, endOfMonth, subDays, subMonths } from 'date-fns'

// One set of date filters for the whole app (History, a card's transactions, Charts). A filter is { period, from, to, month, year }:
//   period  one of the values below   from / to  the dates of 'custom'   month (0-11) / year  the month of 'pick'
// rangeFor() turns it into [start, end]; either end is null when the filter is open-ended (all time, or a custom range with no date yet).
export const PERIOD_OPTIONS = [
  { value: 'month', label: 'This month' },
  { value: 'lastmonth', label: 'Last month' },
  { value: 'pick', label: 'Pick a month' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '3m', label: 'Last 3 months' },
  { value: 'fy', label: 'Current financial year' },
  { value: 'pfy', label: 'Previous financial year' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom dates' },
]
export const periodLabel = v => PERIOD_OPTIONS.find(p => p.value === v)?.label || ''

// Indian financial year: 1 April to 31 March
export const fyStart = now => new Date(now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1, 3, 1)

export function rangeFor(f, now = new Date()) {
  const { period, from, to, month, year } = f
  if (period === 'month') return [startOfMonth(now), endOfDay(now)]
  if (period === 'lastmonth') { const m = subMonths(now, 1); return [startOfMonth(m), endOfMonth(m)] }
  if (period === 'pick') { const m = new Date(year ?? now.getFullYear(), month ?? now.getMonth(), 1); return [startOfMonth(m), endOfMonth(m)] }
  if (period === '7d') return [startOfDay(subDays(now, 6)), endOfDay(now)]
  if (period === '30d') return [startOfDay(subDays(now, 29)), endOfDay(now)]
  if (period === '3m') return [startOfDay(subMonths(now, 3)), endOfDay(now)]
  if (period === 'fy') return [fyStart(now), endOfDay(now)]
  if (period === 'pfy') { const s = fyStart(now); return [new Date(s.getFullYear() - 1, 3, 1), new Date(s.getFullYear(), 2, 31, 23, 59, 59, 999)] }
  if (period === 'custom') return [from ? startOfDay(new Date(from + 'T12:00:00')) : null, to ? endOfDay(new Date(to + 'T12:00:00')) : null]
  return [null, null]
}

export const defaultFilter = (now = new Date()) => ({ period: 'month', from: '', to: '', month: now.getMonth(), year: now.getFullYear(), dir: 'both', q: '', acct: 'all' })

// does a transaction match what was typed in the search box? Every word has to match, and a word can be
//   a name      paytm            found in its name, bank text, category or note
//   an amount   2000, 2,000, ₹2000   the amount contains it (so 2000 also finds 12000.50; type the full figure to narrow it)
//   a range     500-1000, >500, <500, >=500, <=500   the amount is in that range
export function matchesSearch(t, q) {
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const hay = [txnName(t), t.merchant, t.bankNarration, t.description, t.category, t.notes].filter(Boolean).join(' ').toLowerCase()
  const amt = Number(t.amount) || 0
  const plain = String(Math.round(amt * 100) / 100)
  const n = x => Number(String(x).replace(/[₹,]/g, ''))
  return words.every(w => {
    const range = w.match(/^([₹\d,.]+)-([₹\d,.]+)$/)
    if (range && n(range[1]) <= n(range[2])) return amt >= n(range[1]) && amt <= n(range[2])
    const cmp = w.match(/^(>=|<=|>|<)([₹\d,.]+)$/)
    if (cmp && Number.isFinite(n(cmp[2]))) { const v = n(cmp[2]); return cmp[1] === '>' ? amt > v : cmp[1] === '<' ? amt < v : cmp[1] === '>=' ? amt >= v : amt <= v }
    const digits = w.replace(/[₹,]/g, '')
    if (/^\d+(\.\d+)?$/.test(digits) && plain.includes(digits)) return true
    return hay.includes(w)
  })
}

// the transactions inside the date range, the direction (money in / money out / both) and the search words
// f.acct: 'all', 'type:credit' / 'type:debit' / 'type:account' (every card or account of that kind), or one card / account id.
// `cards` is the list of cards and accounts, needed to tell their kinds apart.
export const accountKind = c => (c?.cardType === 'debit' ? 'debit' : c?.cardType === 'account' ? 'account' : 'credit')
export function filterTxns(list, f, now = new Date(), cards = []) {
  const [a, b] = rangeFor(f, now)
  const acct = f.acct || 'all'
  const kindOf = new Map(cards.map(c => [c.id, accountKind(c)]))
  return list.filter(t => {
    if (acct !== 'all') {
      if (acct.startsWith('type:')) { if (t.cardId == null || kindOf.get(t.cardId) !== acct.slice(5)) return false } else if (String(t.cardId ?? '') !== acct) return false
    }
    const d = new Date(t.date)
    if (a && d < a) return false
    if (b && d > b) return false
    if (f.dir === 'in' && t.type !== 'credit') return false
    if (f.dir === 'out' && t.type !== 'debit') return false
    return matchesSearch(t, f.q)
  })
}

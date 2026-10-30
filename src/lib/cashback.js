// Cashback credited to a card, read from its transactions: bank statement lines, card SMS and anything you added. A credit counts when it is
// filed under Cashback, or when its bank text says cashback / reward credit (older entries that were never categorised); a cashback taken
// back later (a "Cashback_Reversal" debit) is subtracted.
const CB = /cash\s?back|cash\s?points?|reward points? (?:credit|redemption)|swiggy money|statement credit/i
const NOT_CB = /payment received|thank you|bill pay|autopay|refund of (?!cash)/i

export const isCashback = t => (t.category === 'Cashback') || (t.type === 'credit' && !t.kind && !t.isExcluded && CB.test(`${t.bankNarration || ''} ${t.merchant || ''}`) && !NOT_CB.test(t.bankNarration || ''))
export const signed = t => (t.type === 'credit' ? t.amount : -t.amount)

export function cashbackSummary(txns, since = null) {
  const all = txns.filter(isCashback).filter(t => !since || new Date(t.date) >= since).sort((a, b) => new Date(b.date) - new Date(a.date))
  const months = new Map()
  for (const t of all) { const d = new Date(t.date); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; months.set(k, (months.get(k) || 0) + signed(t)) }
  return { entries: all, net: all.reduce((a, t) => a + signed(t), 0), first: all.length ? new Date(all[all.length - 1].date) : null, months: [...months].map(([key, amount]) => ({ key, amount })) }
}

// Cashback credited to a card, read from its transactions: bank statement lines, card SMS and anything you added. A credit counts when it is
// filed under Cashback, or when its bank text says cashback / reward credit (older entries that were never categorised); a cashback taken
// back later (a "Cashback_Reversal" debit) is subtracted.
const CB = /cash\s?back|cash\s?points?|reward points? (?:credit|redemption)|swiggy money|statement credit/i
const NOT_CB = /payment received|thank you|bill pay|autopay|refund of (?!cash)/i

export const isCashback = t => (t.category === 'Cashback') || (t.type === 'credit' && !t.kind && !t.isExcluded && CB.test(`${t.bankNarration || ''} ${t.merchant || ''}`) && !NOT_CB.test(t.bankNarration || ''))
// which rate a cashback line belongs to ("10% Swiggy Cashback", "Reinstating_Diff_5%_Swiggy_Cashback", "ADJ_5% ..."): 1, 5, 10, or 0 when its text names none
export const cashbackTier = t => { const m = `${t.bankNarration || ''} ${t.merchant || ''}`.match(/(\d{1,2})\s*%/); return m ? Number(m[1]) : 0 }
export const signed = t => (t.type === 'credit' ? t.amount : -t.amount)

export function cashbackSummary(txns, since = null) {
  const all = txns.filter(isCashback).filter(t => !since || new Date(t.date) >= since).sort((a, b) => new Date(b.date) - new Date(a.date))
  const months = new Map()
  const tiersAll = {}
  for (const t of all) {
    const d = new Date(t.date); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const m = months.get(k) || { amount: 0, tiers: {} }
    m.amount += signed(t); const tier = cashbackTier(t); m.tiers[tier] = (m.tiers[tier] || 0) + signed(t); tiersAll[tier] = (tiersAll[tier] || 0) + signed(t)
    months.set(k, m)
  }
  return { entries: all, net: all.reduce((a, t) => a + signed(t), 0), first: all.length ? new Date(all[all.length - 1].date) : null, tiers: tiersAll, months: [...months].map(([key, m]) => ({ key, amount: m.amount, tiers: m.tiers })) }
}

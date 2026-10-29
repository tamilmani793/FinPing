// Money in / money out for the totals on Home and Analytics.
// On a credit card a credit is not income: a refund, a reversal or cashback takes money OFF what was spent. So card credits are
// subtracted from spending, and only credits on bank accounts (or entries with no card) count as income.
// Card bill payments and transfers are already marked excluded and never reach these totals.
export const isCreditCard = c => !c.cardType || c.cardType === 'credit'

export function flowOf(txns, cards) {
  const cc = new Set(cards.filter(isCreditCard).map(c => c.id))
  let spent = 0, income = 0, refunds = 0
  for (const t of txns) {
    if (t.type === 'debit') spent += t.amount
    else if (cc.has(t.cardId)) { spent -= t.amount; refunds += t.amount }
    else income += t.amount
  }
  return { spent: Math.max(0, spent), income, refunds }
}

// what one transaction adds to spending (negative for a card credit); null when it is income
export const spendOf = (t, cc) => (t.type === 'debit' ? t.amount : cc.has(t.cardId) ? -t.amount : 0)

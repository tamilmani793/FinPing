// The rewards rules engine: what a card SHOULD have earned on a spend. Pure functions, no database, no network. See rewardTypes.d.ts for
// the shapes. Everything is calculated on the phone from the card's own rules and the transaction's category / MCC / merchant.

/** @typedef {import('./rewardTypes').CardRewardRules} CardRewardRules */
/** @typedef {import('./rewardTypes').ExpectedReward} ExpectedReward */

export const EMPTY_TOTALS = () => ({ earned: 0, byRule: {} })

export const DEFAULT_RULES = cardId => ({
  cardId, enabled: true, rewardType: 'cashback', base: { value: 1, per: 100, blockBased: false }, minSpend: 0, capPerCycle: null, rounding: 'floor',
  accelerated: [], exclusions: { mccs: [], categories: [], merchants: [] },
})

const unitOf = type => (type === 'cashback' ? 0.01 : 1) // cashback is paid to the paisa, points in whole numbers
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0)

// the reward for `amount` at a rate, before caps
function rewardAt(amount, rate, rounding, type) {
  const per = num(rate?.per), value = num(rate?.value)
  if (!(per > 0) || !(value > 0) || !(amount > 0)) return 0
  const raw = rate.blockBased ? Math.floor(amount / per) * value : (amount / per) * value
  const unit = unitOf(type)
  const f = rounding === 'ceil' ? Math.ceil : rounding === 'round' ? Math.round : Math.floor
  return Math.round(f(raw / unit + 1e-9) * unit * 100) / 100
}

const rateOf = r => (num(r?.per) > 0 ? num(r.value) / num(r.per) : 0)

// does this transaction fall under a rule's mccs / categories / merchants?
//   - an MCC on the transaction is matched exactly; without one, the category you mapped that MCC to stands in for it
export function matchesRule(match, txn, mccMap = {}) {
  if (!match) return null
  const mcc = txn.mcc != null && txn.mcc !== '' ? String(txn.mcc) : ''
  const category = txn.category || ''
  for (const code of match.mccs || []) {
    if (mcc) { if (String(code) === mcc) return `MCC ${code}` } else if (category && mccMap[String(code)]?.category === category) return `MCC ${code} (${category})`
  }
  if (category && (match.categories || []).includes(category)) return category
  const text = `${txn.merchant || ''} ${txn.bankNarration || ''}`.toLowerCase()
  for (const w of match.merchants || []) { const k = String(w).trim().toLowerCase(); if (k && text.includes(k)) return w }
  return null
}

/**
 * What the card should earn on one spend.
 * @param {{amount:number,type:string,category?:string,mcc?:number|string,merchant?:string,bankNarration?:string}} transaction
 * @param {CardRewardRules|null|undefined} cardRules
 * @param {{earned:number,byRule:Record<string,number>}} [currentCycleTotal] reward already earned earlier in the same billing cycle
 * @param {Record<string,{category:string}>} [mccMap] MCC code -> { category }
 * @returns {ExpectedReward}
 */
export function calculateExpectedReward(transaction, cardRules, currentCycleTotal = EMPTY_TOTALS(), mccMap = {}) {
  const none = (kind, reason, type = cardRules?.rewardType || 'cashback') => ({ amount: 0, type, rule: { id: kind, label: reason, kind }, multiplier: 0, capped: false, reason })
  if (!cardRules || cardRules.enabled === false) return none('none', 'No reward rules for this card')
  const type = cardRules.rewardType === 'points' ? 'points' : 'cashback'
  const amount = num(transaction?.amount)
  if (transaction?.type !== 'debit' || !(amount > 0)) return none('none', 'Not a spend', type)

  const excluded = matchesRule(cardRules.exclusions, transaction, mccMap)
  if (excluded) return none('excluded', `Excluded: ${excluded}`, type)
  if (amount < num(cardRules.minSpend)) return none('minSpend', `Below the minimum spend of ₹${cardRules.minSpend}`, type)

  const totals = currentCycleTotal || EMPTY_TOTALS()
  const baseRate = rateOf(cardRules.base)
  const rounding = cardRules.rounding || 'floor'

  // the best accelerated rule that applies (highest rate wins); its own minimum spend and its own cycle cap are honoured
  let best = null
  for (const rule of cardRules.accelerated || []) {
    if (matchesRule(rule, transaction, mccMap) == null) continue
    if (amount < num(rule.minSpend)) continue
    if (!best || rateOf(rule.rate) > rateOf(best.rate)) best = rule
  }

  let result
  if (best) {
    const raw = rewardAt(amount, best.rate, rounding, type)
    const left = best.capPerCycle != null && best.capPerCycle !== '' ? Math.max(0, num(best.capPerCycle) - num(totals.byRule?.[best.id])) : Infinity
    if (left <= 0) {
      // the accelerated cap is used up: the base rate applies from here
      result = { amount: rewardAt(amount, cardRules.base, rounding, type), rule: { id: 'base', label: 'Base rate (accelerated cap reached)', kind: 'base' }, multiplier: 1, capped: true, reason: `${best.label} cap reached for this cycle` }
    } else {
      const amt = Math.min(raw, left)
      result = { amount: Math.round(amt * 100) / 100, rule: { id: best.id, label: best.label, kind: 'accelerated' }, multiplier: baseRate > 0 ? Math.round((rateOf(best.rate) / baseRate) * 100) / 100 : 0, capped: raw > left, reason: raw > left ? `${best.label} capped at ${best.capPerCycle}` : undefined }
    }
  } else {
    result = { amount: rewardAt(amount, cardRules.base, rounding, type), rule: { id: 'base', label: 'Base rate', kind: 'base' }, multiplier: 1, capped: false }
  }

  // the card's overall cap for the cycle
  if (cardRules.capPerCycle != null && cardRules.capPerCycle !== '') {
    const left = Math.max(0, num(cardRules.capPerCycle) - num(totals.earned))
    if (result.amount > left) result = { ...result, amount: Math.round(left * 100) / 100, capped: true, reason: `Card cap of ${cardRules.capPerCycle} per cycle reached` }
  }
  return { ...result, type }
}

// a reward for display: "✨ +₹25" for cashback, "🪙 +15 Pts" for points
export const rewardPill = r => (r && r.amount > 0 ? (r.type === 'points' ? `🪙 +${Math.round(r.amount).toLocaleString('en-IN')} Pts` : `✨ +₹${r.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`) : null)

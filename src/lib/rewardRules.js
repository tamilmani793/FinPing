// The rewards rules engine: what a card SHOULD have earned on a spend. Pure functions, no database, no network. See rewardTypes.d.ts for
// the shapes. Everything is calculated on the phone from the card's own rules and the transaction's category / MCC / merchant.

/** @typedef {import('./rewardTypes').CardRewardRules} CardRewardRules */
/** @typedef {import('./rewardTypes').ExpectedReward} ExpectedReward */

export const EMPTY_TOTALS = () => ({ earned: 0, byRule: {} })

// capPeriod: caps reset every billing cycle ('billingCycle') or every calendar month ('calendarMonth', HDFC Millennia and UPI RuPay)
export const DEFAULT_RULES = cardId => ({
  cardId, enabled: true, rewardType: 'cashback', base: { value: 1, per: 100, blockBased: false }, minSpend: 0, capPerCycle: null, rounding: 'floor',
  capPeriod: 'billingCycle', baseCap: null, spendBlock: 0, pointValue: null,
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

// the rate as shown on a transaction: cashback "5%", points "5 pts/₹100"
// a points card with a known rupee value per point is shown as a percentage too (5 pts per ₹100 at ₹1 a point = 5%)
const rateShort = (rate, type, pointValue) => (type === 'points' && num(pointValue) > 0 ? `${Math.round(num(rate?.value) * num(pointValue) / (num(rate?.per) || 100) * 10000) / 100}%` : type === 'points' ? `${num(rate?.value)} pt${num(rate?.value) === 1 ? '' : 's'}/₹${num(rate?.per)}` : `${Math.round(num(rate?.value) / (num(rate?.per) || 100) * 10000) / 100}%`)
const rateOf = r => (num(r?.per) > 0 ? num(r.value) / num(r.per) : 0)

// Online or in a shop? Cards such as SBI Cashback pay more on online spends. The bank decides this from the network's own flag, which the
// phone never sees, so it is worked out from what we have: your choice on the transaction wins, then the way it was paid (UPI, net banking,
// wallet), a web address or "online/ecom" in the text, and well-known online-only brands. Anything else counts as in a shop.
const ONLINE_TEXT = /\becom\b|e-?com\b|\bonline\b|www\.|\.com\b|\.in\b|\.co\b|razorpay|payu|billdesk|ccavenue|cashfree|\bpaytm\b|phonepe|gpay|google ?pay/i
const ONLINE_BRANDS = ['amazon', 'flipkart', 'myntra', 'ajio', 'nykaa', 'meesho', 'swiggy', 'zomato', 'zepto', 'blinkit', 'bigbasket', 'instamart', 'makemytrip', 'goibibo', 'cleartrip', 'irctc',
  'yatra', 'bookmyshow', 'netflix', 'spotify', 'hotstar', 'primevideo', 'google', 'apple', 'microsoft', 'uber', 'rapido', 'pharmeasy', 'tata1mg', 'lenskart', 'tatacliq', 'airbnb', 'agoda', 'booking.com']
export function isOnline(txn) {
  if (txn?.channel === 'online') return true
  if (txn?.channel === 'offline') return false
  if (['UPI', 'NetBanking', 'Wallet'].includes(txn?.paymentMode)) return true
  const text = `${txn?.merchant || ''} ${txn?.bankNarration || ''}`.toLowerCase()
  if (ONLINE_TEXT.test(text)) return true
  const flat = text.replace(/[^a-z0-9.]/g, '')
  return ONLINE_BRANDS.some(b => flat.includes(b))
}

// does this transaction fall under a rule's mccs / categories / merchants?
//   - an MCC is matched only against the MCC on the transaction itself. A spend with no MCC is never matched by code: standing in a whole category for a
//     code made every Shopping spend look like a bookstore (MCC 5942) and lose its cashback. Categories and merchant words are matched on their own.
export function matchesRule(match, txn, mccMap = {}) {
  if (!match) return null
  // a rule for online (or in-shop) spends only: with nothing else listed, that is all it needs; with a list, the spend must also be on it
  if (match.channel) {
    if ((match.channel === 'online') !== isOnline(txn)) return null
    if (!(match.mccs || []).length && !(match.categories || []).length && !(match.merchants || []).length) return match.channel === 'online' ? 'online' : 'in shops'
  }
  const mcc = txn.mcc != null && txn.mcc !== '' ? String(txn.mcc) : ''
  const category = txn.category || ''
  for (const code of match.mccs || []) {
    if (mcc && String(code) === mcc) return `MCC ${code}`
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
  // some cards earn only on whole blocks of the spend (HDFC Millennia: multiples of ₹100, the remainder earns nothing)
  const block = num(cardRules.spendBlock)
  const earnable = block > 0 ? Math.floor(amount / block) * block : amount
  if (!(earnable > 0)) return none('minSpend', `Below the spend block of ₹${block}`, type)

  // the best accelerated rule that applies (highest rate wins); its own minimum spend and its own cycle cap are honoured.
  // A rule can leave out merchants / MCCs that would otherwise match it (HSBC Live+: Amazon, Flipkart and Myntra stay at the base rate).
  let best = null
  for (const rule of cardRules.accelerated || []) {
    if (matchesRule(rule, transaction, mccMap) == null) continue
    if (matchesRule({ mccs: rule.excludeMccs, merchants: rule.excludeMerchants }, transaction, mccMap) != null) continue
    if (amount < num(rule.minSpend)) continue
    if (!best || rateOf(rule.rate) > rateOf(best.rate)) best = rule
  }

  // the base rate, held to its own cap when the card has one (HDFC Millennia 1% category, SBI offline 1%)
  const baseResult = (label = 'Base rate') => {
    const raw = rewardAt(earnable, cardRules.base, rounding, type)
    const left = cardRules.baseCap != null && cardRules.baseCap !== '' ? Math.max(0, num(cardRules.baseCap) - num(totals.byRule?.base)) : Infinity
    const amt = Math.min(raw, left)
    return { amount: Math.round(amt * 100) / 100, rule: { id: 'base', label, kind: 'base' }, multiplier: 1, rate: rateShort(cardRules.base, type, cardRules.pointValue), capped: raw > left, reason: raw > left ? `Base rate capped at ${cardRules.baseCap}` : undefined }
  }

  let result
  if (best) {
    const raw = rewardAt(earnable, best.rate, rounding, type)
    const left = best.capPerCycle != null && best.capPerCycle !== '' ? Math.max(0, num(best.capPerCycle) - num(totals.byRule?.[best.id])) : Infinity
    if (left <= 0) {
      // the accelerated cap is used up: the base rate applies from here
      result = { ...baseResult('Base rate (accelerated cap reached)'), capped: true, reason: `${best.label} cap reached for this period` }
    } else {
      const amt = Math.min(raw, left)
      result = { amount: Math.round(amt * 100) / 100, rule: { id: best.id, label: best.label, kind: 'accelerated' }, multiplier: baseRate > 0 ? Math.round((rateOf(best.rate) / baseRate) * 100) / 100 : 0, rate: rateShort(best.rate, type, cardRules.pointValue), capped: raw > left, reason: raw > left ? `${best.label} capped at ${best.capPerCycle}` : undefined }
    }
  } else {
    result = baseResult()
  }

  // the card's overall cap for the cycle
  if (cardRules.capPerCycle != null && cardRules.capPerCycle !== '') {
    const left = Math.max(0, num(cardRules.capPerCycle) - num(totals.earned))
    if (result.amount > left) result = { ...result, amount: Math.round(left * 100) / 100, capped: true, reason: `Card cap of ${cardRules.capPerCycle} per cycle reached` }
  }
  const channel = (cardRules.accelerated || []).some(a => a.channel) ? (isOnline(transaction) ? 'online' : 'offline') : undefined
  return { ...result, type, ...(channel ? { channel } : {}) }
}

// ---- the rules in plain words (shown at the top of the Reward rules sheet) ----
const rupees = n => '₹' + Number(n).toLocaleString('en-IN')
const rateWords = (rate, type) => (type === 'points' ? `${num(rate?.value)} point${num(rate?.value) === 1 ? '' : 's'} per ${rupees(rate?.per)}` : `${num(rate?.value)}%`)
const nameList = (items, max = 4) => (items.length <= max ? items.join(', ') : `${items.slice(0, max).join(', ')} and ${items.length - max} more`)
const whatOf = m => {
  const seen = new Set() // "cult.fit" and "cultfit" are one merchant to read
  const merchants = (m.merchants || []).filter(x => { const k = String(x).toLowerCase().replace(/[^a-z0-9]/g, ''); if (seen.has(k)) return false; seen.add(k); return true })
  const parts = [...(m.categories || []), ...merchants.map(x => x.replace(/\b\w/g, c => c.toUpperCase()))]
  const codes = (m.mccs || []).length
  if (codes) parts.push(`${codes} merchant code${codes === 1 ? '' : 's'}`)
  if (m.channel) parts.push(m.channel === 'online' ? 'online spends' : 'spends in shops')
  return parts.length ? nameList(parts) : 'nothing selected yet'
}

/** @returns {{ icon: string, text: string }[]} one line per thing the card does */
export function describeRules(rules) {
  if (!rules) return []
  const type = rules.rewardType === 'points' ? 'points' : 'cashback'
  const per = rules.capPeriod === 'calendarMonth' ? 'calendar month' : 'billing cycle'
  const cap = v => (v != null && v !== '' ? ` (up to ${type === 'points' ? v + ' points' : rupees(v)} a ${per})` : '')
  const lines = []
  for (const a of rules.accelerated || []) {
    let t = `${rateWords(a.rate, type)} on ${whatOf(a)}${cap(a.capPerCycle)}`
    if (num(a.minSpend) > 0) t += `, on spends of ${rupees(a.minSpend)} or more`
    const out = [...(a.excludeMerchants || []), ...((a.excludeMccs || []).length ? [`${a.excludeMccs.length} merchant codes`] : [])]
    if (out.length) t += `, but not ${nameList(out, 3)}`
    lines.push({ icon: '⭐', text: t })
  }
  let base = `${rateWords(rules.base, type)} on everything else${cap(rules.baseCap)}`
  if (num(rules.minSpend) > 0) base += `, on spends of ${rupees(rules.minSpend)} or more`
  if (num(rules.spendBlock) > 0) base += `. Only whole ${rupees(rules.spendBlock)} count: ${rupees(rules.spendBlock * 12 + Math.round(rules.spendBlock / 2))} earns on ${rupees(rules.spendBlock * 12)}`
  lines.push({ icon: '➕', text: base })
  const ex = rules.exclusions || {}
  const exWhat = [...(ex.categories || []), ...(ex.merchants || [])]
  if ((ex.mccs || []).length) exWhat.push(`${ex.mccs.length} merchant codes`)
  if (exWhat.length) lines.push({ icon: '🚫', text: `Nothing on ${nameList(exWhat, 6)}` })
  if (rules.capPerCycle != null && rules.capPerCycle !== '') lines.push({ icon: '🔒', text: `At most ${type === 'points' ? rules.capPerCycle + ' points' : rupees(rules.capPerCycle)} in total a ${per}` })
  lines.push({ icon: '🔁', text: `Caps start again every ${per}${rules.rounding === 'floor' || !rules.rounding ? '; rewards are rounded down' : ''}` })
  return lines
}

// a reward for display:"✨ +₹25" for cashback, "🪙 +15 Pts" for points
// the percentage / rate follows when the tag carries it: "✨ +₹62 · 5%"; a spend held back by a cap says so
export const rewardPill = r => (r && r.amount > 0 ? (r.type === 'points' ? `🪙 +${Math.round(r.amount).toLocaleString('en-IN')} Pts` : `✨ +₹${r.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`) + (r.rate ? ` · ${r.rate}` : '') + (r.capped ? ' (cap)' : '') + (r.channel ? (r.channel === 'online' ? ' · Online' : ' · In shop') : '') : null)

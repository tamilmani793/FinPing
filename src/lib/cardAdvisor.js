import { differenceInCalendarDays, endOfMonth, startOfMonth, subMonths } from 'date-fns'
import { calculateExpectedReward } from './rewardRules'
import { rulesFor } from './rewardTagging'
import { feeWaiverSpend, isCardPayment } from './cardStats'
import { isCashback } from './cashback'

// Which card to use for what, how much reward was missed by using another, and how far each card is from its fee waiver.
// Everything is worked out from the cards' own reward rules, on the phone.
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0)
export const isCreditCard = c => !c.draft && (!c.cardType || c.cardType === 'credit')
// UPI payments work only on RuPay credit cards (a Visa or Mastercard cannot be used for UPI)
export const canPayUpi = card => /rupay/i.test(card?.network || '')
export const UPI_CATEGORY = 'UPI Scan & Pay'
const isUpiSpend = t => t.paymentMode === 'UPI' || t.category === UPI_CATEGORY

// a reward in rupees: cashback as it is, points at the card's value per point
export function rupees(r, rules, card) {
  if (!r || !(r.amount > 0)) return 0
  return r.type === 'points' ? r.amount * (num(rules?.pointValue) || num(card?.pointValue) || 1) : r.amount
}

// the cards that have reward rules switched on, with the rules in force on `date`
export function usableCards(cards, rulesRows, date = new Date()) {
  return cards.filter(isCreditCard).map(card => {
    const row = rulesRows.find(r => r.cardId === card.id)
    const rules = row ? rulesFor(row, date) : null
    return rules && rules.enabled !== false ? { card, rules } : null
  }).filter(Boolean)
}

const earn = (u, txn) => { const r = calculateExpectedReward(txn, u.rules); return { r, value: rupees(r, u.rules, u.card) } }
const cap = (rules, n) => `${rules.rewardType === 'points' ? `${n} points` : `₹${n}`} ${rules.capPeriod === 'calendarMonth' ? 'a month' : 'a cycle'}`
const names = list => { const l = list.map(x => String(x).replace(/\b\w/g, c => c.toUpperCase())); return l.length > 3 ? `${l.slice(0, 3).join(', ')} and ${l.length - 3} more` : l.join(', ') }

// The conditions that come with a reward: what it applies to, the smallest spend that earns it, and any cap.
export function conditionsOf(rules, r, skipScope = false) {
  const acc = r?.rule?.kind === 'accelerated' ? (rules.accelerated || []).find(a => a.id === r.rule.id) : null
  const parts = []
  if (acc) {
    const onlyMerchants = (acc.merchants || []).length && !(acc.categories || []).length && !(acc.mccs || []).length
    if (onlyMerchants) { if (!skipScope) parts.push(`only on ${names(acc.merchants)}`) }
    else if ((acc.categories || []).length && !(acc.merchants || []).length) parts.push(`on all ${acc.categories.join(', ')}`)
    if (num(acc.minSpend) > 0) parts.push(`min spend ₹${acc.minSpend} per spend`)
    if (acc.capPerCycle != null && acc.capPerCycle !== '') parts.push(`cap ${cap(rules, acc.capPerCycle)}`)
    if (acc.channel) parts.push(acc.channel === 'online' ? 'online only' : 'in shops only')
  } else {
    if (num(rules.minSpend) > 0) parts.push(`min spend ₹${rules.minSpend} per spend`)
    if (num(rules.spendBlock) > 0) parts.push(`earns on each ₹${rules.spendBlock}`)
    if (rules.baseCap != null && rules.baseCap !== '') parts.push(`cap ${cap(rules, rules.baseCap)}`)
  }
  return parts.join(' · ')
}

// A typical merchant code for each category, so a card whose rule is written by MCC (HSBC Live+ pays 10% on dining, grocery and utility codes) is judged as the bank would
const REP_MCC = {
  'Food & Dining': 5812, 'Grocery': 5411, 'Shopping': 5311, 'Utilities & Bills': 4900, 'Travel': 4722, 'Transport': 4121, 'Fuel': 5541,
  'Entertainment': 7832, 'Health': 5912, 'Education': 8299, 'Insurance': 6300, 'Rent': 6513, 'Jewellery & Gold': 5944, 'Government & Tax': 9399, 'Gaming & Gambling': 7995,
}
function bestOf(pool, txn, skipScope = false) {
  let top = null, second = null
  for (const u of pool) {
    const { r, value } = earn(u, txn)
    const e = { card: u.card, value, rate: r.rate || '', label: r.rule?.label || '', cond: conditionsOf(u.rules, r, skipScope), kind: r.rule?.kind, reason: value > 0 ? '' : r.reason || '' }
    if (!top || value > top.value) { second = top; top = e } else if (!second || value > second.value) second = e
  }
  return { top, second }
}

// For ₹1,000 spent in each category, online and in a shop: the card that earns the most, and the runner-up.
// UPI spends can only go on a RuPay card.
export function bestByCategory(cards, rulesRows, categories, sample = 1000) {
  const usable = usableCards(cards, rulesRows)
  return categories.map(category => {
    const pool = category === UPI_CATEGORY ? usable.filter(u => canPayUpi(u.card)) : usable
    return {
      category, upiOnly: category === UPI_CATEGORY,
      online: bestOf(pool, { type: 'debit', amount: sample, category, mcc: REP_MCC[category], merchant: '', channel: 'online' }),
      shop: bestOf(pool, { type: 'debit', amount: sample, category, mcc: REP_MCC[category], merchant: '', channel: 'offline' }),
    }
  }).filter(r => (r.online.top?.value || 0) > 0 || (r.shop.top?.value || 0) > 0)
}

// Brands that a card pays extra on, named in the card's own rules (Swiggy, Amazon, Flipkart...): the best card for each.
export function bestByMerchant(cards, rulesRows, sample = 1000) {
  const usable = usableCards(cards, rulesRows)
  const seen = new Map()
  for (const u of usable) {
    for (const a of u.rules.accelerated || []) {
      const label = String(a.label || '').toLowerCase()
      for (const m of a.merchants || []) {
        const key = String(m).toLowerCase().replace(/[^a-z0-9]/g, '')
        // only brands the rule names in its heading (the long lists hold spellings and sub-brands too)
        if (key.length < 3 || seen.has(key) || !label.includes(String(m).toLowerCase())) continue
        seen.set(key, m)
      }
    }
  }
  return [...seen.values()].map(m => {
    const { top, second } = bestOf(usable, { type: 'debit', amount: sample, category: '', merchant: m, channel: 'online' }, true)
    return { merchant: String(m).replace(/\b\w/g, c => c.toUpperCase()), top, second }
  }).filter(r => r.top?.kind === 'accelerated' && r.top.value > 0).sort((a, b) => b.top.value - a.top.value)
}

// Last month's card spends: what each earned, against the most any of your cards would have earned on the same spend (caps ignored, so an estimate).
// Each row keeps its transactions so they can be listed.
export function missedRewards(txns, cards, rulesRows, now = new Date()) {
  const from = startOfMonth(subMonths(now, 1)), to = endOfMonth(subMonths(now, 1))
  const cardIds = new Set(cards.filter(isCreditCard).map(c => c.id))
  const spends = txns.filter(t => cardIds.has(t.cardId) && t.type === 'debit' && !t.isExcluded && !isCardPayment(t) && !isCashback(t) && new Date(t.date) >= from && new Date(t.date) <= to)
  const byKey = new Map()
  let total = 0, spent = 0, earned = 0
  for (const t of spends.sort((a, b) => new Date(a.date) - new Date(b.date))) {
    const all = usableCards(cards, rulesRows, t.date)
    const own = all.find(u => u.card.id === t.cardId)
    // a UPI spend can only have gone on a RuPay card
    const usable = isUpiSpend(t) ? all.filter(u => canPayUpi(u.card) || u.card.id === t.cardId) : all
    const actual = t.expectedReward?.amount > 0 && own ? rupees(t.expectedReward, own.rules, own.card) : own ? earn(own, t).value : 0
    let top = null
    for (const u of usable) { const v = earn(u, t).value; if (!top || v > top.value) top = { card: u.card, value: v } }
    spent += t.amount; earned += actual
    const gap = top && top.card.id !== t.cardId ? top.value - actual : 0
    if (gap < 0.5) continue
    total += gap
    const category = t.category || 'General', key = `${category}|${t.cardId}|${top.card.id}`
    const e = byKey.get(key) || { category, usedId: t.cardId, betterId: top.card.id, missed: 0, count: 0, spent: 0, txns: [] }
    e.missed += gap; e.count += 1; e.spent += t.amount
    e.txns.push({ id: t.id, date: t.date, merchant: t.merchant, amount: t.amount, actual, best: top.value, gap })
    byKey.set(key, e)
  }
  return { from, to, total, spent, earned, rows: [...byKey.values()].sort((a, b) => b.missed - a.missed), count: spends.length }
}

// Annual-fee waiver: for each card that charges a fee, the spend this card year against the waiver amount, and what to spend each month to make it.
export function feeWaiverRows(cards, txns, now = new Date()) {
  return cards.filter(c => isCreditCard(c) && c.isLTF === false && num(c.totalAnnualFee) > 0).map(card => {
    const mine = txns.filter(t => t.cardId === card.id)
    const th = num(card.feeWaiverThreshold)
    const w = feeWaiverSpend(card, mine, now, th)
    const left = Math.max(0, th - w.spent)
    const days = Math.max(0, differenceInCalendarDays(w.end, now))
    const months = Math.max(1, Math.ceil(days / 30))
    return { card, fee: num(card.totalAnnualFee), threshold: th, spent: w.spent, left, met: th > 0 && w.spent >= th, end: w.end, days, perMonth: left / months, hasIssueDate: w.hasIssueDate }
  }).sort((a, b) => a.days - b.days)
}

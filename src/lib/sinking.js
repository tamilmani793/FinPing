import { addMonths, differenceInCalendarDays, differenceInCalendarMonths, startOfDay } from 'date-fns'
import { isLive, monthlyEquivalent } from './policies'
import { isCreditCard } from './cardAdvisor'

// Yearly costs turned into a monthly amount to set aside, so a premium or annual fee never arrives as a surprise.
// The list is built from what the app already knows (insurance premiums, card annual fees) plus anything you add yourself (vehicle service...).
export const SINKING_CYCLES = [
  { id: 'm12', label: 'Every year', months: 12 }, { id: 'm6', label: 'Every 6 months', months: 6 }, { id: 'm3', label: 'Every 3 months', months: 3 },
]
const monthsOf = id => SINKING_CYCLES.find(c => c.id === id)?.months || 12

// the next date a card's annual fee is charged: the anniversary of its issue date
const nextAnniversary = (d, now) => {
  if (!d) return null
  const base = new Date(d); let next = new Date(now.getFullYear(), base.getMonth(), base.getDate())
  if (next < startOfDay(now)) next = new Date(now.getFullYear() + 1, base.getMonth(), base.getDate())
  return next
}

export function sinkingItems({ policies = [], cards = [], items = [] }, now = new Date()) {
  const out = []
  const push = (key, source, title, sub, perPeriod, months, next) => {
    if (!(perPeriod > 0)) return
    const yearly = perPeriod * (12 / months)
    // had you been setting aside the monthly amount since the last bill: months since it, up to the period
    const last = next ? addMonths(next, -months) : null
    const elapsed = last ? Math.min(months, Math.max(0, differenceInCalendarMonths(now, last) + (now.getDate() >= last.getDate() ? 0 : -1))) : 0
    const monthly = yearly / 12
    out.push({ key, source, title, sub, perPeriod, months, yearly, monthly, next, daysLeft: next ? differenceInCalendarDays(next, startOfDay(now)) : null, savedSoFar: Math.round(monthly * elapsed) })
  }
  for (const p of policies) {
    if (!isLive(p, now) || !p.premium) continue
    const months = p.frequency === 'monthly' ? 1 : p.frequency === 'quarterly' ? 3 : p.frequency === 'half-yearly' ? 6 : 12
    if (months === 1) continue // a monthly premium is already a monthly cost
    push('p' + p.id, 'policy', p.name || p.insurer || 'Insurance', `${p.insurer || ''}${p.type ? ' · ' + p.type : ''} premium`.replace(/^ · /, ''), p.premium, months, p.nextDueDate ? new Date(p.nextDueDate) : null)
  }
  for (const c of cards) {
    if (!isCreditCard(c) || c.isLTF !== false || !(Number(c.totalAnnualFee) > 0)) continue
    push('c' + c.id, 'card', `${c.name || c.bank}${c.cardLast4 ? ` ••${c.cardLast4}` : ''}`, 'Card annual fee', Number(c.totalAnnualFee), 12, nextAnniversary(c.annualFeeDate || c.issueDate, now))
  }
  for (const i of items) push('s' + i.id, 'own', i.name, i.note || 'Your own', Number(i.amount), monthsOf(i.cycle), i.nextDue ? new Date(i.nextDue) : null)
  const total = out.reduce((s, x) => s + x.monthly, 0)
  return { items: out.sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999)), monthlyTotal: total, yearlyTotal: total * 12, savedTotal: out.reduce((s, x) => s + x.savedSoFar, 0) }
}

export { monthlyEquivalent }

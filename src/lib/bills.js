import { addDays, addMonths, differenceInCalendarDays, endOfDay, format, startOfDay, subDays } from 'date-fns'
import { cycleDates, cycleSet, isStatementPaid } from './cycle'
import { isLive } from './policies'
import { isCardPayment } from './cardStats'
import { isCashback, signed } from './cashback'

export const KINDS = [
  { id: 'electricity', label: 'Electricity', icon: '⚡' },
  { id: 'mobile', label: 'Mobile recharge', icon: '📱' },
  { id: 'broadband', label: 'Broadband / internet', icon: '🌐' },
  { id: 'gas', label: 'Gas cylinder', icon: '🔥' },
  { id: 'water', label: 'Water', icon: '💧' },
  { id: 'dth', label: 'DTH / OTT', icon: '📺' },
  { id: 'rent', label: 'Rent / maintenance', icon: '🏠' },
  { id: 'other', label: 'Other', icon: '🧾' },
]
export const kindOf = id => KINDS.find(k => k.id === id) || (id === 'card' ? { id, label: 'Credit card', icon: '💳' } : id === 'insurance' ? { id, label: 'Insurance', icon: '🛡' } : { id, label: 'Bill', icon: '🧾' })

// how often a bill comes round: months, or days (a prepaid recharge lasts 28 / 56 / 84 days)
export const CYCLES = [
  { id: 'm1', label: 'Every month', months: 1 }, { id: 'm2', label: 'Every 2 months', months: 2 }, { id: 'm3', label: 'Every 3 months', months: 3 },
  { id: 'm6', label: 'Every 6 months', months: 6 }, { id: 'm12', label: 'Every year', months: 12 },
  { id: 'd28', label: 'Every 28 days', days: 28 }, { id: 'd56', label: 'Every 56 days', days: 56 }, { id: 'd84', label: 'Every 84 days', days: 84 },
  { id: 'once', label: 'One time' },
]
const cycleOf = id => CYCLES.find(c => c.id === id) || CYCLES[0]
export const cycleLabel = id => cycleOf(id).label
export const advance = (date, cycleId) => {
  const c = cycleOf(cycleId)
  if (c.months) return addMonths(new Date(date), c.months)
  if (c.days) return addDays(new Date(date), c.days)
  return null
}
const monthsIn = cycleId => cycleOf(cycleId).months || (cycleOf(cycleId).days ? cycleOf(cycleId).days / 30 : 1)

export const GAS_LEAD_DAYS = 5 // book this many days before the cylinder is expected to run out

const byDate = (a, b) => new Date(a.date) - new Date(b.date) || a.id - b.id
const ymd = d => format(new Date(d), 'yyyy-MM-dd')

// Electricity: units and amount for each bill, per month and per unit, and how each compares with the one before.
export function usageRows(bill, entries) {
  const per = monthsIn(bill.cycle)
  const list = entries.filter(e => e.units > 0).sort(byDate)
  const rows = list.map((e, i) => {
    const perMonth = e.units / per
    // compared with the bill before it only when that bill is the neighbouring one (a gap of years says nothing about a change)
    const prev = i > 0 && differenceInCalendarDays(new Date(e.date), new Date(list[i - 1].date)) <= per * 30 * 1.7 + 15 ? list[i - 1].units / per : null
    return { ...e, perMonth, rate: e.amount > 0 ? e.amount / e.units : null, change: prev ? ((perMonth - prev) / prev) * 100 : null }
  }).reverse()
  const recent = rows.slice(0, 6)
  const avgPerMonth = recent.length ? recent.reduce((s, r) => s + r.perMonth, 0) / recent.length : null
  return { rows, avgPerMonth, highest: rows.reduce((m, r) => (!m || r.units > m.units ? r : m), null) }
}

// Gas: how long each cylinder lasts (start to next start), the one in use now, and when to book the next.
export function gasStats(entries, now = new Date()) {
  const today = startOfDay(now)
  const started = entries.filter(e => e.startedOn).sort((a, b) => new Date(a.startedOn) - new Date(b.startedOn))
  const lasted = started.slice(1).map((e, i) => differenceInCalendarDays(new Date(e.startedOn), new Date(started[i].startedOn))).filter(d => d > 0)
  const avgDays = lasted.length ? Math.round(lasted.reduce((s, d) => s + d, 0) / lasted.length) : null
  const current = started.length ? started[started.length - 1] : null
  const daysUsed = current ? differenceInCalendarDays(today, new Date(current.startedOn)) : null
  const runsOut = current && avgDays ? addDays(new Date(current.startedOn), avgDays) : null
  const waiting = entries.filter(e => e.bookedOn && !e.startedOn).sort((a, b) => new Date(b.bookedOn) - new Date(a.bookedOn))[0] || null
  // already booked and waiting for delivery: nothing more to book
  const bookBy = waiting || !runsOut ? null : addDays(runsOut, -GAS_LEAD_DAYS)
  return { lasted, avgDays, current, daysUsed, runsOut, bookBy, waiting, count: started.length }
}

const stateOf = (due, now) => {
  if (!due) return 'none'
  const d = differenceInCalendarDays(startOfDay(new Date(due)), startOfDay(now))
  return d < 0 ? 'overdue' : d <= 7 ? 'soon' : 'later'
}

// Every bill in one list: credit cards (from their statements), insurance premiums, and the bills you added here.
export function collectBills({ bills = [], entries = [], cards = [], policies = [] }, now = new Date()) {
  const items = []
  for (const c of cards) {
    if (c.draft || (c.cardType && c.cardType !== 'credit') || !cycleSet(c)) continue
    const dates = cycleDates(c, now)
    const paid = isStatementPaid(c, dates)
    const amount = c.pendingDue ?? c.statementBalance ?? 0
    items.push(paid
      ? { key: 'c' + c.id, source: 'card', kind: 'card', card: c, title: `${c.name || c.bank}${c.cardLast4 ? ` ••${c.cardLast4}` : ''}`, sub: `Statement paid · next bill ${format(dates.nextStatementDate, 'd MMM yyyy')}`, due: dates.nextDueDate, amount: null, state: 'paid' }
      : { key: 'c' + c.id, source: 'card', kind: 'card', card: c, title: `${c.name || c.bank}${c.cardLast4 ? ` ••${c.cardLast4}` : ''}`, sub: `Statement bill${c.minimumDue ? ` · minimum ${Math.round(c.minimumDue)}` : ''}`, due: dates.dueDate, amount, state: stateOf(dates.dueDate, now) })
  }
  for (const p of policies) {
    if (!isLive(p, now) || !p.nextDueDate) continue
    items.push({ key: 'p' + p.id, source: 'policy', kind: 'insurance', title: p.name || p.insurer || 'Insurance', sub: `${p.insurer || ''}${p.type ? ' · ' + p.type : ''} premium`.replace(/^ · /, ''), due: p.nextDueDate, amount: p.premium || 0, state: stateOf(p.nextDueDate, now) })
  }
  for (const b of bills) {
    if (b.status === 'closed') continue
    const mine = entries.filter(e => e.billId === b.id)
    let due = b.nextDue || null, sub = `${cycleLabel(b.cycle)}${b.provider ? ' · ' + b.provider : ''}`, amount = b.amount || null
    if (b.kind === 'gas') {
      const g = gasStats(mine, now)
      if (g.waiting) { due = null; sub = `Booked ${format(new Date(g.waiting.bookedOn), 'd MMM yyyy')}, waiting for delivery` }
      else if (g.bookBy) { due = g.bookBy; sub = `Book the next cylinder · one lasts about ${g.avgDays} days` }
      else if (g.current) { due = null; sub = `In use for ${g.daysUsed} days${g.avgDays ? '' : ' · log one more cylinder to learn how long one lasts'}` }
      else sub = 'No cylinder logged yet'
    }
    let entryId = null
    if (b.kind === 'electricity') {
      // each electricity bill carries its own due date: the next one due is the oldest unpaid bill you logged
      const unpaid = mine.filter(e => e.dueDate && !e.paid).sort((a, c) => new Date(a.dueDate) - new Date(c.dueDate))[0]
      due = unpaid ? unpaid.dueDate : null
      amount = unpaid ? unpaid.amount : b.amount || null
      entryId = unpaid ? unpaid.id : null
      sub = unpaid ? `Bill dated ${format(new Date(unpaid.date), 'd MMM yyyy')}${b.provider ? ' · ' + b.provider : ''}` : `${b.provider || cycleLabel(b.cycle)} · no unpaid bill logged`
    }
    items.push({ key: 'b' + b.id, source: 'bill', kind: b.kind, title: b.name, sub, due, amount, state: stateOf(due, now), bill: b, entryId })
  }
  const rank = { overdue: 0, soon: 1, later: 2, none: 3, paid: 4 }
  return items.sort((a, b) => rank[a.state] - rank[b.state] || (a.due ? new Date(a.due) : 0) - (b.due ? new Date(b.due) : 0))
}

// A card's statements, newest first, worked out from its transactions and its billing cycle: spends in the cycle, what was paid
// before the next statement, the reward the spends earned, and cashback credited during the cycle. The first row is the open
// cycle (spends since the last statement, not billed yet).
export function cardStatements(card, txns, count = 12, now = new Date()) {
  const dates = cycleDates(card, now)
  if (!dates.statementDate) return []
  const earnedOf = list => list.reduce((s, t) => s + (t.type === 'debit' && t.expectedReward?.amount > 0 ? t.expectedReward.amount : 0), 0)
  const rewardType = txns.find(t => t.expectedReward?.type)?.expectedReward.type || 'cashback'
  const rows = []
  const openList = txns.filter(t => !isCardPayment(t) && new Date(t.date) > endOfDay(dates.statementDate))
  if (openList.length) {
    const spendList = openList.filter(t => t.type === 'debit' && !isCashback(t))
    rows.push({ key: 'open', open: true, from: addDays(dates.statementDate, 1), to: now, spends: spendList.reduce((s, t) => s + t.amount, 0), count: spendList.length,
      earned: earnedOf(openList), rewardType, credited: openList.filter(isCashback).reduce((s, t) => s + signed(t), 0), payments: 0 })
  }
  let d = dates.statementDate
  for (let i = 0; i < count && d; i++) {
    const prev = cycleDates(card, subDays(d, 1)).statementDate
    if (!prev) break
    const lo = endOfDay(prev), hi = endOfDay(d), nextS = cycleDates(card, d).nextStatementDate
    const inCycle = txns.filter(t => new Date(t.date) > lo && new Date(t.date) <= hi && !isCardPayment(t))
    const pays = txns.filter(t => isCardPayment(t) && new Date(t.date) > hi && new Date(t.date) <= endOfDay(nextS))
    const spendList = inCycle.filter(t => t.type === 'debit' && !isCashback(t))
    const spends = spendList.reduce((s, t) => s + t.amount, 0)
    if (spends || pays.length) {
      rows.push({ key: format(d, 'yyyy-MM-dd'), statementDate: d, dueDate: cycleDates(card, d).dueDate, from: addDays(prev, 1), to: d, spends, count: spendList.length,
        refunds: inCycle.filter(t => t.type === 'credit' && !isCashback(t)).reduce((s, t) => s + t.amount, 0), earned: earnedOf(inCycle), rewardType,
        credited: inCycle.filter(isCashback).reduce((s, t) => s + signed(t), 0), payments: pays.reduce((s, t) => s + t.amount, 0), paymentsCount: pays.length })
    }
    d = prev
  }
  // how much of the limit each cycle's spends used, and how the spends compare with the statement before (the open cycle is only part of a month, so it is not compared)
  const limit = card.creditLimit || 0
  rows.forEach((r, i) => {
    r.usePct = limit > 0 ? (r.spends / limit) * 100 : null
    const prev = rows[i + 1]
    r.change = !r.open && prev && prev.spends > 0 ? ((r.spends - prev.spends) / prev.spends) * 100 : null
    r.changeAmount = !r.open && prev ? r.spends - prev.spends : null
  })
  return rows
}

export { ymd }

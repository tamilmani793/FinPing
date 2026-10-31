import { addDays, endOfMonth, format, startOfDay, subMonths } from 'date-fns'
import { db } from '../db/schema'
import { cycleDates } from './cycle'
import { cycleKeyFor, getRules } from './rewardTagging'

// Rewards Audit. Two kinds of card, settled differently, so they are audited differently:
//
//  POINTS WALLET (HDFC Millennia, HDFC UPI RuPay...) - points are earned over a CALENDAR MONTH (1st to last day, caps reset each month) and the bank
//    adds them to the points wallet in the first week of the next month. Nothing is credited to the statement balance. Each month is compared
//    with the "points earned" printed on the statement that covers the settlement week; a month whose settlement week is still ahead is
//    "pending" (points still to come). The points are redeemed later as a cashback credit (less a fee), tracked in the wallet summary.
//
//  STATEMENT CREDIT (SBI Cashback, HDFC Swiggy, HSBC Live+) - cashback is added up over one STATEMENT CYCLE (previous statement date + 1 day to this
//    statement date, caps reset each cycle) and credited straight to the card account some days after that statement date: the amount you should
//    see as a cashback credit on the next statement. Credits are matched to the cycle they settle (oldest unsettled cycle first).
//
// The "expected" side is always the sum of the expected-reward tags on the spends (caps and excluded merchants already applied there).

const r2 = n => Math.round(n * 100) / 100
const REDEMPTION = /redemption|redeem/i
const FEE = /redemption fee|cashback redemption/i
const isDateKey = k => /^\d{4}-\d\d-\d\d$/.test(k)
const keyDate = k => (isDateKey(k) ? new Date(k + 'T12:00:00') : endOfMonth(new Date(k + '-01T12:00:00')))
const text = t => `${t.bankNarration || ''} ${t.merchant || ''}`

export async function buildAudit(cardId, now = new Date()) {
  const card = await db.creditCards.get(cardId)
  const rules = await getRules(cardId)
  if (!card || !rules) return { card, rules, rows: [] }
  const type = rules.rewardType === 'points' ? 'points' : 'cashback'
  const mode = type === 'points' ? 'wallet' : 'statement'
  const monthly = rules.capPeriod === 'calendarMonth' // spends are added up over the calendar month
  const lag = Number(rules.creditLagDays) > 0 ? Number(rules.creditLagDays) : 10 // days after the statement by which the cashback is credited
  const txns = (await db.transactions.where('cardId').equals(cardId).toArray()).sort((a, b) => new Date(a.date) - new Date(b.date))
  const stmts = await db.reward_statements.where('cardId').equals(cardId).toArray()
  const stmtByKey = new Map(stmts.map(s => [s.cycleKey, s]))
  const cycles = new Map()
  const get = key => { if (!cycles.has(key)) cycles.set(key, { cycleKey: key, expected: 0, credited: 0, redeemed: 0, credits: [], spends: [], earning: 0, statement: null }); return cycles.get(key) }

  // what each spend should earn
  for (const t of txns) {
    if (t.expectedReward?.cycleKey) {
      const c = get(t.expectedReward.cycleKey)
      c.expected += t.expectedReward.amount || 0
      if (t.expectedReward.amount > 0) { c.earning++; c.spends.push(t) }
    }
  }

  const redemptions = []
  if (mode === 'wallet') {
    // points are redeemed as "CASHBACK FOR REDEMPTION OF POINTS" credits, each with a redemption fee (+ GST) debited the same day
    for (const t of txns) {
      if (t.category !== 'Cashback' && !(t.type === 'debit' && FEE.test(text(t)))) continue
      const key = monthly ? format(new Date(t.date), 'yyyy-MM') : cycleKeyFor(card, t.date)
      const c = get(key)
      if (t.type === 'credit' && REDEMPTION.test(text(t))) { c.redeemed += t.amount; c.credits.push(t); redemptions.push(t) }
      else if (t.type === 'credit') c.credits.push(t)
    }
  } else if (monthly) {
    // a calendar-month cashback card: the cashback for the month is credited in the first days of the next one
    for (const t of txns) {
      if (t.category !== 'Cashback') continue
      const dt = new Date(t.date)
      const c = get(format(dt.getDate() <= 10 ? subMonths(dt, 1) : dt, 'yyyy-MM'))
      c.credited += t.type === 'credit' ? t.amount : -t.amount
      c.credits.push(t)
    }
  } else {
    // statement cycles: a credit settles the cycle whose statement date is up to `lag` days before it; with several candidates the oldest
    // cycle that still expects more is settled first
    const open = key => { const c = get(key); return c.expected - c.credited }
    for (const t of txns) {
      if (t.category !== 'Cashback') continue
      const d = new Date(t.date)
      const cands = []
      if (card.cycleSet) {
        let s = cycleDates(card, d).statementDate
        for (let i = 0; i < 3 && s; i++) {
          const gap = Math.round((startOfDay(d) - startOfDay(s)) / 86400000)
          if (gap > 0 && gap <= lag) cands.unshift(format(s, 'yyyy-MM-dd'))
          s = cycleDates(card, addDays(s, -1)).statementDate
        }
      }
      const key = cands.length ? (t.type === 'credit' ? (cands.find(k => open(k) > 0.5) || cands[cands.length - 1]) : cands[cands.length - 1]) : cycleKeyFor(card, t.date)
      const c = get(key)
      c.credited += t.type === 'credit' ? t.amount : -t.amount
      c.credits.push(t)
    }
  }
  for (const s of stmts) if (mode === 'statement' || !monthly) get(s.cycleKey).statement = s

  const latestStatement = stmts.map(s => s.cycleKey).sort().pop() || null
  const tol = 1 // within 1 point / ₹1 is rounding, not a discrepancy
  const rows = [...cycles.values()].map(c => {
    let actual = null, status, settleBy = null, statement = c.statement, destination
    if (mode === 'wallet') {
      destination = 'Points wallet'
      // the points of a calendar month are added in the first week of the next month; they show as "earned" on the statement covering that week
      const settleOn = monthly ? new Date(Number(c.cycleKey.slice(0, 4)), Number(c.cycleKey.slice(5, 7)), 7, 23, 59) : keyDate(c.cycleKey)
      settleBy = settleOn
      if (monthly) { statement = stmtByKey.get(cycleKeyFor(card, settleOn)) || null; c.statement = statement }
      actual = statement?.earned ?? null
      if (actual == null) status = settleOn > now ? 'pending' : 'unknown'
    } else {
      destination = 'Statement credit'
      const due = monthly ? addDays(endOfMonth(keyDate(c.cycleKey)), 10) : addDays(keyDate(c.cycleKey), lag)
      settleBy = due
      actual = c.credited > 0 || c.expected > 0 ? r2(c.credited) : null
      if (actual === 0 && c.expected > 0 && due > now) { actual = null; status = 'pending' }
    }
    const diff = actual == null ? null : r2(actual - c.expected)
    if (!status) status = actual == null ? 'unknown' : Math.abs(diff) <= tol ? 'match' : diff < 0 ? 'short' : 'over'
    return {
      cycleKey: c.cycleKey, type, mode, destination, settleBy, expected: r2(c.expected), actual, diff, status, earning: c.earning, statement,
      redeemed: c.redeemed > 0 ? r2(c.redeemed) : null, credits: c.credits.sort((a, b) => new Date(a.date) - new Date(b.date)),
      topSpends: c.spends.sort((a, b) => (b.expectedReward.amount || 0) - (a.expectedReward.amount || 0)).slice(0, 20),
    }
  }).filter(r => r.expected > 0 || r.actual != null || r.redeemed != null || r.status === 'pending').sort((a, b) => b.cycleKey.localeCompare(a.cycleKey))

  // the points wallet: what the bank says it holds, what is still to be added, and what has been redeemed
  let wallet = null
  if (mode === 'wallet') {
    const sorted = [...stmts].sort((a, b) => a.cycleKey.localeCompare(b.cycleKey))
    const last = sorted[sorted.length - 1] || null
    const perPoint = Number(rules.pointValue ?? card.pointValue) > 0 ? Number(rules.pointValue ?? card.pointValue) : 1
    const fees = txns.filter(t => t.type === 'debit' && FEE.test(text(t))).reduce((a, t) => a + t.amount, 0)
    // GST on the redemption fee: the small CGST / SGST debits dated within a day of a redemption
    const taxes = txns.filter(t => t.type === 'debit' && /^(c|s|i)gst/i.test(text(t).trim()) && t.amount <= 10 && redemptions.some(r => Math.abs(new Date(r.date) - new Date(t.date)) <= 86400000 * 4)).reduce((a, t) => a + t.amount, 0)
    wallet = {
      closing: last?.closing ?? card.rewardPoints ?? null, closingAt: last?.cycleKey || null, earnedOnStatements: r2(sorted.reduce((a, s) => a + (s.earned || 0), 0)), statements: sorted.length,
      pending: r2(rows.filter(r => r.status === 'pending').reduce((a, r) => a + r.expected, 0)), pendingMonths: rows.filter(r => r.status === 'pending').map(r => r.cycleKey),
      redeemedCount: redemptions.length, redeemedRupees: r2(redemptions.reduce((a, t) => a + t.amount, 0)), fees: r2(fees), taxes: r2(taxes), perPoint,
      redemptions: redemptions.map(t => ({ id: t.id, date: t.date, amount: t.amount })).sort((a, b) => new Date(b.date) - new Date(a.date)),
    }
  }
  return { card, rules, rows, monthly, mode, wallet }
}

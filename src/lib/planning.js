import { differenceInCalendarMonths, format, startOfMonth, subMonths } from 'date-fns'
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import { isCardPayment } from './cardStats'
import { buildPf, epsPension, loadPfInputs } from './pf'
import { ppfCurrent } from './ppf'
import { isLive } from './policies'

// Planning: goals, the retirement projection and the insurance cover check. All of it is worked out on the phone from what the app already holds.
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0)

// future value of a lump sum and of a monthly saving, at an annual return, over n months
export const fvLump = (amount, annualPct, months) => amount * Math.pow(1 + annualPct / 1200, months)
export const fvStepUp = (monthly, annualPct, years, raisePct) => { // a monthly saving that goes up by raisePct every year (a pay rise): each year's saving grows from then on
  let t = 0; const r = annualPct / 1200
  for (let y = 0; y < years; y++) { const m = monthly * Math.pow(1 + raisePct / 100, y); t += (r > 0 ? m * ((Math.pow(1 + r, 12) - 1) / r) : m * 12) * Math.pow(1 + r, 12 * (years - 1 - y)) }
  return t
}
export const fvMonthly = (monthly, annualPct, months) => { const r = annualPct / 1200; return r > 0 ? monthly * ((Math.pow(1 + r, months) - 1) / r) : monthly * months }

// what you spend in a month, from the last six full months (card payments, transfers and investments are not spending)
export function avgMonthlySpend(txns, now = new Date()) {
  const from = startOfMonth(subMonths(now, 6)), to = startOfMonth(now)
  const spends = txns.filter(t => t.type === 'debit' && !t.isExcluded && !isCardPayment(t) && !['Transfer', 'Investment', 'Card Payment'].includes(t.category) && new Date(t.date) >= from && new Date(t.date) < to)
  const months = new Set(spends.map(t => format(new Date(t.date), 'yyyy-MM'))).size
  return months ? spends.reduce((s, t) => s + t.amount, 0) / months : 0
}
// what goes into investments each month (a rough SIP), from the last three full months
export function avgMonthlyInvest(txns, now = new Date()) {
  const from = startOfMonth(subMonths(now, 3)), to = startOfMonth(now)
  const rows = txns.filter(t => t.type === 'debit' && !t.isExcluded && t.category === 'Investment' && new Date(t.date) >= from && new Date(t.date) < to)
  return Math.round(rows.reduce((s, t) => s + t.amount, 0) / 3)
}

// everything a goal or the retirement projection can draw on, with its value today
export function useAssets() {
  return useLiveQuery(async () => {
    const [cards, invs, txns, pfIn, policies, records] = await Promise.all([db.creditCards.toArray(), db.investments.toArray(), db.transactions.toArray(), loadPfInputs(), db.policies.toArray(), db.salaryRecords.toArray()])
    const pf = buildPf(pfIn)
    const accounts = cards.filter(c => c.cardType === 'account' && c.accountBalance != null).map(c => ({ key: 'bank:' + c.id, label: `${c.name || c.bank}`, value: c.accountBalance, group: 'Bank accounts' }))
    const inv = invs.map(i => ({ key: 'inv:' + i.id, id: i.id, type: i.type, label: i.name + (i.last4 ? ` ••${i.last4}` : ''), value: i.type === 'PPF' ? ppfCurrent(i) : (i.currentValue || 0), group: i.type === 'PPF' || i.type === 'NPS' ? 'Retirement' : ['MutualFund', 'Stock'].includes(i.type) ? 'Market' : 'Safe' }))
    const epf = pf.empty ? 0 : (pf.epfBalance || 0)
    const sources = [...accounts, ...(epf > 0 ? [{ key: 'epf', label: 'Provident fund (EPF)', value: epf, group: 'Retirement' }] : []), ...inv]
    const lastPf = pf.months?.length ? pf.months[pf.months.length - 1] : null
    return { pf, sources, byKey: Object.fromEntries(sources.map(s => [s.key, s])), epf, epfMonthly: lastPf ? lastPf.ee + lastPf.er : 0, inv, txns, policies, records, avgSpend: avgMonthlySpend(txns), avgInvest: avgMonthlyInvest(txns), ppfYearly: ppfThisYear(invs) }
  }, [], null)
}

// ── goals ──
export const GOAL_TYPES = [
  { id: 'emergency', label: 'Emergency fund', icon: '🛟', hint: 'Months of expenses kept aside' },
  { id: 'down', label: 'Down payment', icon: '🏠', hint: 'A house, a car or any big purchase' },
  { id: 'retirement', label: 'Retirement corpus', icon: '🌴', hint: 'What you want by the time you stop working' },
  { id: 'other', label: 'Other goal', icon: '🎯', hint: 'Anything with an amount and a date' },
]
export const goalTarget = (g, avgSpend) => (g.type === 'emergency' ? num(g.months || 6) * avgSpend : num(g.target))

export function goalProgress(g, assets, now = new Date()) {
  const current = (g.sources || []).reduce((s, k) => s + (assets.byKey[k]?.value || 0), 0)
  const target = goalTarget(g, assets.avgSpend)
  const months = g.targetDate ? Math.max(0, differenceInCalendarMonths(new Date(g.targetDate), now)) : null
  const ret = g.returnPct ?? 8, monthly = num(g.monthly)
  const projected = months != null ? fvLump(current, ret, months) + fvMonthly(monthly, ret, months) : current
  const factor = months > 0 ? fvMonthly(1, ret, months) : 0
  const needMonthly = months > 0 && factor > 0 ? Math.max(0, (target - fvLump(current, ret, months)) / factor) : null
  return {
    current, target, months, projected, needMonthly, monthly,
    pct: target > 0 ? Math.min(100, (current / target) * 100) : 0,
    coveredMonths: assets.avgSpend > 0 ? current / assets.avgSpend : null,
    onTrack: months != null ? projected >= target : current >= target,
    shortfall: Math.max(0, target - projected),
  }
}

// ── retirement ──
// What you saved on the Retirement page is only what you changed. Anything you left alone comes from the app (your latest payslip, your recent
// investing) and from the starting assumptions below; "Reset" removes your changes and goes back to exactly that.
export const RETIRE_BASICS = { age: 30, retireAt: 60, lifeTo: 85, inflation: 6, postReturn: 7 }
export const PART_START = { // the starting rise (a pay rise, for the provident fund) and expected return of each kind of money
  epf: { label: 'Provident fund', raise: 7, rate: 8.25, note: 'Your PF follows your pay: it rises with each increment.' },
  ppf: { label: 'PPF', raise: 0, rate: 7.1, note: 'Deposits are capped at ₹1.5 lakh a year.' },
  nps: { label: 'NPS', raise: 0, rate: 10, note: 'The pension account you add to each month.' },
  market: { label: 'Mutual funds and stocks', raise: 0, rate: 11, note: 'Your SIPs and shares.' },
  other: { label: 'Gold and deposits', raise: 0, rate: 6, note: 'Gold, fixed deposits and the rest. No new money is assumed.' },
}
export const PART_KEYS = Object.keys(PART_START)
export const ppfThisYear = (invs, now = new Date()) => {
  const start = new Date(now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1, 3, 1)
  return invs.filter(i => i.type === 'PPF').reduce((t, i) => t + (i.entries || []).filter(e => !e.opening && new Date(e.date) >= start).reduce((x, e) => x + num(e.amount), 0), 0)
}
export function retirementProjection(saved, a) {
  const b = { ...RETIRE_BASICS, ...Object.fromEntries(Object.entries(saved).filter(([k, v]) => k in RETIRE_BASICS && v !== '' && v != null)) }
  const n = Math.max(0, (num(b.retireAt) - num(b.age)) * 12), years = Math.round(n / 12)
  const sum = types => a.inv.filter(i => types.includes(i.type)).reduce((t, i) => t + i.value, 0)
  const now = { epf: a.epf, ppf: sum(['PPF']), nps: sum(['NPS']), market: sum(['MutualFund', 'Stock']), other: sum(['Gold', 'FD', 'Other']) }
  const monthly0 = { epf: a.epfMonthly, ppf: a.ppfYearly / 12, nps: 0, market: a.avgInvest, other: 0 }
  const parts = PART_KEYS.map(key => {
    const mine = (saved.parts || {})[key] || {}
    const initial = { monthly: Math.round(monthly0[key]), raise: PART_START[key].raise, rate: PART_START[key].rate }
    const v = { monthly: mine.monthly ?? initial.monthly, raise: mine.raise ?? initial.raise, rate: mine.rate ?? initial.rate }
    const at = fvLump(now[key], num(v.rate), n) + fvStepUp(num(v.monthly), num(v.rate), years, num(v.raise))
    let putIn = 0; for (let y = 0; y < years; y++) putIn += num(v.monthly) * 12 * Math.pow(1 + num(v.raise) / 100, y)
    return { key, label: PART_START[key].label, note: PART_START[key].note, now: now[key], ...v, initial, edited: Object.keys(mine).length > 0, at, putIn: Math.round(putIn), growth: Math.round(at - now[key] - putIn), years }
  })
  const corpus = parts.reduce((t, p) => t + p.at, 0)
  const expense = saved.expense === '' || saved.expense == null ? a.avgSpend : num(saved.expense)
  const annualAtRetire = expense * 12 * Math.pow(1 + num(b.inflation) / 100, years)
  const stay = Math.max(1, num(b.lifeTo) - num(b.retireAt))
  const g = (1 + num(b.postReturn) / 100) / (1 + num(b.inflation) / 100) - 1 // growth after inflation while the money is being spent
  const need = Math.abs(g) < 1e-9 ? annualAtRetire * stay : annualAtRetire * ((1 - Math.pow(1 + g, -stay)) / g)
  // the EPS pension: paid from 58 (50 to 57 early, 59 or 60 later), the same rupees every month, so it is not raised with inflation. What it will pay from then to the age you plan to
  // spend until is worth less at retirement than its total, so it is brought back at the after-retiring return and taken off what you must have saved.
  const startAge = Math.min(60, Math.max(58, num(b.retireAt))), endAge = num(b.lifeTo)
  const eps = a.pf ? epsPension(a.pf, num(b.age), num(b.retireAt), startAge) : null
  let epsPV = 0
  if (eps && eps.pension > 0) {
    const r = num(b.postReturn) / 1200, months = Math.max(0, (endAge - startAge) * 12), gap0 = Math.max(0, (startAge - num(b.retireAt)) * 12)
    const annuity = r > 0 ? (1 - Math.pow(1 + r, -months)) / r : months
    epsPV = eps.pension * annuity / Math.pow(1 + r, gap0)
  }
  const gap = need - epsPV - corpus
  const market = parts.find(p => p.key === 'market')
  const extraMonthly = gap > 0 && n > 0 ? gap / fvMonthly(1, num(market.rate), n) : 0
  const curve = []
  for (let y = 0; y <= years; y++) curve.push({ age: num(b.age) + y, corpus: Math.round(parts.reduce((t, p) => t + fvLump(p.now, p.rate, y * 12) + fvStepUp(num(p.monthly), num(p.rate), y, num(p.raise)), 0)) })
  return { basics: b, edited: PART_KEYS.some(k => (saved.parts || {})[k]) || Object.entries(saved).some(([k, v]) => (k in RETIRE_BASICS || k === 'expense') && v !== undefined && v !== '' && v != null), parts, corpus, need, gap, eps: eps && eps.pension > 0 ? { ...eps, startAge, pv: epsPV } : null, epsPV, expense, annualAtRetire, years, extraMonthly, curve }
}

// ── insurance cover ──
export function coverCheck(a, s) {
  const live = a.policies.filter(p => isLive(p))
  const termCover = live.filter(p => p.type === 'Term insurance').reduce((t, p) => t + num(p.sumAssured), 0)
  const healthCover = live.filter(p => p.type === 'Health insurance').reduce((t, p) => t + num(p.sumAssured), 0)
  // income: the last twelve payslips' gross, or the average of what there is, unless you typed it
  const recs = [...a.records].sort((x, y) => String(y.month).localeCompare(String(x.month))).slice(0, 12)
  const fromPay = recs.length ? (recs.reduce((t, r) => t + num(r.gross), 0) / recs.length) * 12 : 0
  const income = s.income === '' || s.income == null ? fromPay : num(s.income)
  const needTerm = income * num(s.multiple || 10)
  return { termCover, healthCover, income, fromPay, needTerm, termGap: Math.max(0, needTerm - termCover), healthGap: Math.max(0, num(s.healthTarget) - healthCover), months: recs.length }
}

// settings kept on the phone (and in the backup): your age, the inflation you assume, the cover multiple...
export function useSaved(key, defaults) {
  const [v, set] = useState(() => { try { return { ...defaults, ...JSON.parse(localStorage.getItem(key) || '{}') } } catch (e) { return { ...defaults } } })
  const save = patch => set(p => { const n = { ...p, ...patch }; try { localStorage.setItem(key, JSON.stringify(n)) } catch (e) {} return n })
  const reset = () => { try { localStorage.removeItem(key) } catch (e) {} set({ ...defaults }) }
  return [v, save, reset]
}

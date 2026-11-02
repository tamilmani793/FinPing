import { accountKind } from './dateRange'

// Advisory engine. Reads the transactions you filtered (period + accounts) and finds money that left without you choosing it:
//   ACTUAL     a fee, charge, interest or tax the bank really debited (found from the SMS / statement text or the Fees & Charges category)
//   ESTIMATED  a cost your spends probably triggered but the data does not show as its own line (SBI wallet-load fee, fuel surcharge outside
//              the waiver window, cash-advance fee on a credit card). These are labelled as estimates: bank rules differ by card.
// Each finding carries what happened, why it happens, and how to avoid it. Pure functions, no database access.

const r2 = n => Math.round(n * 100) / 100
const GST = 1.18
const FUEL_WAIVER = [400, 4000] // most cards waive the 1% fuel surcharge between about ₹400 and ₹4,000 a fill
const SBI_WALLET_FREE = 1000 // SBI Card charges ~1% on wallet loads above ₹1,000 a month

export const SEVERITY = { high: 'Costly', medium: 'Worth fixing', low: 'Small leak' }

const text = t => `${t.bankNarration || ''} ${t.merchant || ''} ${t.description || ''} ${t.notes || ''}`.replace(/\s+/g, ' ')
const FEE_WORD = /\b(?:fee|fees|charge|charges|chrg|chrgs|chg|chgs)\b/i

// The kinds of charge we can recognise by their wording, in the order they are tried (first match wins).
export const CHARGE_TYPES = [
  { id: 'interest', label: 'Interest / finance charges', severity: 'high', re: /finance (?:charge|chg)|interest (?:charge|debit|on)|retail interest|revolving|fin\.? ?chg|int\.? ?chg|interest amt/i,
    why: 'You carried a balance past the due date, so the bank charged interest (usually 3.3–3.9% a month) from the purchase date, not the due date.',
    tip: 'Pay the Total Amount Due (never the Minimum) by the due date. Set an auto-debit for the total due, not the minimum.' },
  { id: 'late', label: 'Late payment fee', severity: 'high', re: /late (?:payment|pay|fee|chg|charge)|\blpc\b|overdue (?:charge|fee)|payment (?:default|delay)/i,
    why: 'The payment reached the card after the due date.',
    tip: 'Turn on auto-debit and add a reminder 3 days before every due date. Pay a day early: UPI and bank transfers can take a day to post.' },
  { id: 'overlimit', label: 'Over-limit fee', severity: 'high', re: /over ?limit|limit exceed/i,
    why: 'Spends went above the credit limit.',
    tip: 'Keep usage under 70% of the limit. Ask the bank for a limit increase instead of crossing it.' },
  { id: 'cashadv', label: 'Cash advance / ATM fee', severity: 'high', re: /cash advance|cash adv|cash withdrawal (?:fee|charge)|atm (?:txn |transaction |withdrawal )?(?:fee|charge|chg)|atm fee|non[- ]?home atm/i,
    why: 'Cash taken from an ATM on a credit card costs a fee and interest from day one. A debit-card ATM beyond the free limit also costs a fee.',
    tip: 'Never withdraw cash on a credit card. On the debit card use your own bank ATMs and stay within the free monthly transactions.' },
  { id: 'annual', label: 'Annual / joining / renewal fee', severity: 'medium', re: /annual (?:fee|chg|charge)|membership fee|joining fee|renewal fee|card (?:fee|annual)|yearly fee|annual maintenance fee for (?:the )?card/i,
    why: 'The yearly card fee was billed, usually because the spend target for the waiver was not met.',
    tip: 'Note the waiver target (for example ₹1–2 lakh a year) and track it. Before renewal date call the bank and ask for a waiver or a lifetime-free version; if refused, downgrade or close the card.' },
  { id: 'amc', label: 'Account maintenance / minimum balance', severity: 'medium', re: /\bamc\b|annual maintenance|non[- ]?maintenance|min(?:imum)? (?:avg|average|bal|balance)|\bmab\b|\bqab\b|\bavb\b|debit card (?:amc|annual|yearly)|dc (?:amc|annual)/i,
    why: 'The account or debit card fell short of the balance the bank wants, or carried a yearly fee.',
    tip: 'Keep the required average balance, or move to a zero-balance / salary account. Ask the bank to waive the debit card yearly fee against your spends.' },
  { id: 'sms', label: 'SMS / alert charges', severity: 'low', re: /sms (?:alert|charge|banking|service|chg)|alert (?:charge|fee|chg)|\bsms chrg/i,
    why: 'Banks bill a few rupees every quarter for SMS alerts.',
    tip: 'Switch to app notifications and turn off paid SMS alerts at the bank. It is a small amount, but it repeats for years.' },
  { id: 'forex', label: 'Foreign currency mark-up', severity: 'medium', re: /forex|cross[- ]?currency|mark[- ]?up|\bdcc\b|currency conversion|international (?:txn|transaction|usage)/i,
    why: 'A spend in a foreign currency (or on a foreign site) was charged a 2–3.5% mark-up plus GST.',
    tip: 'For foreign spends use a zero mark-up forex card or a card with a low mark-up. When a terminal asks to pay in INR, say no (dynamic currency conversion is the worst rate).' },
  { id: 'transfer', label: 'Transfer / cheque charges', severity: 'low', re: /(?:imps|neft|rtgs|chq|cheque|\bdd\b|demand draft|fund transfer)[^a-z0-9]{0,6}(?:fee|charge|chg|chrg)|(?:fee|charge|chg|chrg)[^a-z0-9]{0,6}(?:imps|neft|rtgs|chq|cheque)/i,
    why: 'Some accounts charge for IMPS, cheque books or demand drafts.',
    tip: 'Use UPI (free) or NEFT (usually free online) instead of IMPS for large transfers, and order cheque books only when needed.' },
  { id: 'emi', label: 'EMI / processing / foreclosure fees', severity: 'medium', re: /processing (?:fee|charge)|foreclosure|pre[- ]?closure|convenience (?:fee|charge)|emi (?:fee|charge|processing)|loan (?:fee|charge)|part[- ]?payment (?:fee|charge)/i,
    why: 'Converting a purchase to EMI or closing a loan early carries a one-time fee plus GST.',
    tip: 'Compare the total cost (interest + processing fee + GST) before converting to EMI. Prefer no-cost EMI offers where the fee is waived, and check the foreclosure charge before taking a loan.' },
  { id: 'surcharge', label: 'Fuel surcharge (billed)', severity: 'medium', re: /fuel surcharge|surcharge/i,
    why: 'Petrol pumps pass on a 1% (+GST) surcharge on card payments outside the waiver window.',
    tip: 'Fill between about ₹400 and ₹4,000 so the surcharge is waived, or pay by UPI / a fuel card where the pump offers it. Check that the waiver credit appears on the next statement.' },
  { id: 'gst', label: 'GST on charges', severity: 'low', re: /\b(?:igst|cgst|sgst)\b|\bgst\b(?! number)/i,
    why: '18% GST is added to every bank fee, so each fee above costs 18% more than its face value.',
    tip: 'Cut the fees themselves and the GST disappears too.' },
  { id: 'duplicate', label: 'Statement copy / other service charges', severity: 'low', re: /duplicate (?:statement|passbook)|statement (?:copy|fee|charge)|passbook (?:fee|charge)|document (?:fee|charge)|service (?:fee|charge)/i,
    why: 'Paper statements, duplicate copies and service requests are billed.',
    tip: 'Use e-statements and the bank app instead of branch requests.' },
]
const OTHER = { id: 'other', label: 'Other bank fees', severity: 'low', why: 'A debit worded as a fee or charge that does not match a known type.', tip: 'Open each one, find what it is for and ask the bank to explain or reverse it if you did not agree to it.' }
const REVERSAL = /reversal|reversed|waiver|waived|refund(?:ed)? (?:of )?(?:fee|charge)|(?:fee|charge)s? (?:refund|reversal)|chargeback|rev\b/i

// what kind of charge is this transaction? (null when it is not a charge)
export function chargeType(t) {
  if (t.type !== 'debit') return null
  const s = text(t)
  for (const c of CHARGE_TYPES) if (c.re.test(s)) return c
  if (t.category === 'Fees & Charges') return OTHER
  if (FEE_WORD.test(s) && (Number(t.amount) || 0) < 5000 && !/\bemi\b|loan repay|insurance|premium|credit card payment|bill ?pay/i.test(s)) return OTHER
  return null
}

const isReversal = t => t.type === 'credit' && REVERSAL.test(text(t)) && (FEE_WORD.test(text(t)) || /surcharge|interest|gst/i.test(text(t)))
const monthOf = t => { const d = new Date(t.date); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
const isSbi = c => /\bsbi\b/i.test(`${c?.bank || ''} ${c?.name || ''}`)
const cardName = c => c?.name || c?.bank || 'Account'

// Finds everything. `txns` are the transactions already filtered by period and account; `cards` is the list of cards and accounts.
export function runAdvisory(txns, cards = []) {
  const cardById = new Map(cards.map(c => [c.id, c]))
  const found = new Map()
  const add = (type, t, extra = {}) => {
    if (!found.has(type.id)) found.set(type.id, { key: type.id, id: type.id, label: type.label, severity: type.severity, why: type.why, tip: type.tip, actual: 0, estimated: 0, reversed: 0, items: [], notes: [] })
    const f = found.get(type.id)
    f.items.push({ txn: t, amount: Number(t.amount) || 0, estimate: !!extra.estimate, cost: extra.cost ?? (Number(t.amount) || 0) })
    if (extra.estimate) f.estimated += extra.cost; else f.actual += Number(t.amount) || 0
    return f
  }

  // 1. charges the bank really debited, and credits that took one back
  const reversals = []
  for (const t of txns) {
    const c = chargeType(t)
    if (c) add(c, t)
    else if (isReversal(t)) reversals.push(t)
  }
  for (const t of reversals) {
    const target = found.get(CHARGE_TYPES.find(c => c.re.test(text(t)))?.id) || [...found.values()].sort((a, b) => b.actual - a.actual)[0]
    if (target) { target.reversed += Number(t.amount) || 0; target.notes.push(`${r2(Number(t.amount) || 0)} was reversed by the bank (${(t.bankNarration || t.merchant || '').slice(0, 40)})`) }
  }

  // 2. SBI wallet loads: ~1% + GST on loads above ₹1,000 in a month, and no rewards on the load
  const spends = txns.filter(t => t.type === 'debit' && !t.isExcluded)
  const walletByCardMonth = new Map()
  for (const t of spends) {
    const card = cardById.get(t.cardId)
    if (t.category !== 'Wallet Load' || accountKind(card) !== 'credit') continue
    const k = `${t.cardId}|${monthOf(t)}`
    if (!walletByCardMonth.has(k)) walletByCardMonth.set(k, [])
    walletByCardMonth.get(k).push(t)
  }
  const walletType = { id: 'walletload', label: 'Wallet loads on a credit card', severity: 'high',
    why: 'Loading a wallet (Paytm, Amazon Pay, PhonePe, Mobikwik...) from a credit card is treated as cash-like. SBI Card charges about 1% + GST on loads above ₹1,000 a month, and most cards give no rewards or cashback on the load.',
    tip: 'Do not top up wallets from a credit card. Pay the merchant directly by UPI or card, or load the wallet from your bank account. If you must load it, keep the month under ₹1,000 on SBI cards.' }
  for (const [k, list] of walletByCardMonth) {
    const card = cardById.get(list[0].cardId)
    const total = list.reduce((s, t) => s + (Number(t.amount) || 0), 0)
    if (isSbi(card) && total > SBI_WALLET_FREE) {
      const cost = r2(total * 0.01 * GST)
      const f = add(walletType, list[0], { estimate: true, cost })
      f.items[f.items.length - 1].amount = total
      f.items[f.items.length - 1].group = list
      f.items[f.items.length - 1].label = `${cardName(card)} · ${list.length} load${list.length === 1 ? '' : 's'} in ${k.split('|')[1]}`
      f.notes.push(`${cardName(card)}: ₹${total.toLocaleString('en-IN')} loaded in ${k.split('|')[1]} → about ₹${cost.toLocaleString('en-IN')} fee (1% + GST)`)
    } else if (!isSbi(card)) {
      const f = add(walletType, list[0], { estimate: true, cost: 0 })
      f.items[f.items.length - 1].amount = total
      f.items[f.items.length - 1].group = list
      f.items[f.items.length - 1].label = `${cardName(card)} · ${list.length} load${list.length === 1 ? '' : 's'} in ${k.split('|')[1]} (no rewards earned)`
    }
  }

  // 3. fuel on a credit card outside the waiver window (skipped for a card whose real surcharge lines are already above)
  const surchargeCards = new Set((found.get('surcharge')?.items || []).map(i => i.txn.cardId))
  const fuelType = { id: 'fuelsurcharge', label: 'Fuel surcharge (estimated)', severity: 'medium',
    why: `Fuel bought on a credit card outside about ₹${FUEL_WAIVER[0]}–₹${FUEL_WAIVER[1].toLocaleString('en-IN')} usually carries a 1% + GST surcharge, which is never waived and also earns no reward.`,
    tip: `Keep each fill between ₹${FUEL_WAIVER[0]} and ₹${FUEL_WAIVER[1].toLocaleString('en-IN')}. For a bigger tank, split into two fills or pay by UPI. Pick a fuel card for the pump you use most.` }
  for (const t of spends) {
    const card = cardById.get(t.cardId)
    if (t.category !== 'Fuel' || accountKind(card) !== 'credit' || surchargeCards.has(t.cardId)) continue
    const amt = Number(t.amount) || 0
    if (amt >= FUEL_WAIVER[0] && amt <= FUEL_WAIVER[1]) continue
    add(fuelType, t, { estimate: true, cost: r2(amt * 0.01 * GST) })
  }

  // 4. cash taken on a credit card
  const cashType = { id: 'cashcard', label: 'Cash withdrawn on a credit card (estimated)', severity: 'high',
    why: 'A credit-card ATM withdrawal costs 2.5% (minimum ₹500) + GST and interest at ~3.5% a month from the same day, with no interest-free period.',
    tip: 'Use the debit card or UPI cash withdrawal. In an emergency, a short personal loan or a card EMI is cheaper than cash advance.' }
  for (const t of spends) {
    const card = cardById.get(t.cardId)
    if (t.category !== 'ATM Withdrawal' || accountKind(card) !== 'credit') continue
    add(cashType, t, { estimate: true, cost: r2(Math.max(500, (Number(t.amount) || 0) * 0.025) * GST) })
  }

  // 5. the same fee billed twice on one day
  for (const f of found.values()) {
    if (f.estimated && !f.actual) continue
    const seen = new Map()
    for (const it of f.items) {
      if (it.estimate) continue
      const d = new Date(it.txn.date)
      const k = `${it.txn.cardId}|${d.toDateString()}|${it.amount}`
      seen.set(k, (seen.get(k) || 0) + 1)
    }
    const dup = [...seen.values()].filter(n => n > 1).length
    if (dup) f.notes.push(`${dup} identical charge${dup === 1 ? '' : 's'} on the same day: check that you were not billed twice`)
  }

  const findings = [...found.values()]
    .map(f => ({ ...f, actual: r2(f.actual), estimated: r2(f.estimated), reversed: r2(f.reversed), net: r2(Math.max(0, f.actual - f.reversed) + f.estimated), count: f.items.length }))
    .filter(f => f.actual > 0 || f.estimated > 0 || f.id === 'walletload')
    .sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.severity] - { high: 0, medium: 1, low: 2 }[b.severity]) || b.net - a.net)
  const totals = findings.reduce((s, f) => ({ actual: s.actual + Math.max(0, f.actual - f.reversed), estimated: s.estimated + f.estimated, reversed: s.reversed + f.reversed }), { actual: 0, estimated: 0, reversed: 0 })
  return { findings, totals: { actual: r2(totals.actual), estimated: r2(totals.estimated), reversed: r2(totals.reversed), all: r2(totals.actual + totals.estimated) }, checked: txns.length }
}

import { db } from '../db/schema'
import { splitPayment, lastRepaymentDate } from './loanMath'
import { accrualUntil, rebuildSchedule } from './loanSchedule'

const DEBT_DATES = ['startDate', 'endDate', 'interestFrom']
const REPAY_DATES = ['date']
const round2 = n => Math.round(n * 100) / 100

const revive = (row, fields) => {
  const out = { ...row }
  for (const f of fields) if (out[f]) out[f] = new Date(out[f])
  return out
}

// Merges an older debts-only backup file (kept so those files can still be restored from Settings). Debts already present (same name, lender and principal) are
// kept as they are, and repayments already present (same debt, date and amount) are skipped.
// Links to bank accounts are dropped: those accounts have different ids on another install.
export async function importDebts(jsonText) {
  let data
  try { data = JSON.parse(jsonText) } catch (e) { throw new Error('That is not valid JSON') }
  if (!data || data.kind !== 'debts' || !Array.isArray(data.debts)) throw new Error('This is not a FinPing debt backup')

  const existing = await db.debts.toArray()
  const same = (a, b) => a.name === b.name && (a.lender || '') === (b.lender || '') && Number(a.principal) === Number(b.principal)
  const idMap = new Map()
  let addedDebts = 0, addedRepayments = 0

  await db.transaction('rw', db.debts, db.debtRepayments, async () => {
    for (const raw of data.debts) {
      const { id: oldId, ...rest } = revive(raw, DEBT_DATES)
      const match = existing.find(d => same(d, rest))
      if (match) { idMap.set(oldId, match.id); continue }
      const newId = await db.debts.add({ ...rest, debitAccountId: null })
      idMap.set(oldId, newId)
      existing.push({ ...rest, id: newId })
      addedDebts++
    }
    const repayments = await db.debtRepayments.toArray()
    for (const raw of data.debtRepayments || []) {
      const { id, debtId, accountId, accountTxnId, accountTxnOwned, accountDelta, ...rest } = revive(raw, REPAY_DATES)
      const newDebtId = idMap.get(debtId)
      if (!newDebtId) continue
      const t = new Date(rest.date).getTime()
      if (repayments.some(r => r.debtId === newDebtId && new Date(r.date).getTime() === t && r.amount === rest.amount)) continue
      await db.debtRepayments.add({ ...rest, debtId: newDebtId })
      addedRepayments++
    }
  })
  return { addedDebts, addedRepayments }
}

const blank = v => v === '' || v == null
const isLent = debt => debt.type === 'FriendLent' // money you lent out: "received" reduces what you are owed

// An EMI or money received is no longer posted to a bank account from here: the bank's own SMS (or statement import) adds
// that line and moves the balance, so doing it again would count it twice.
const NO_ACCOUNT = { accountId: null, accountTxnId: null, accountTxnOwned: false, accountDelta: 0 }
async function postToAccount() { return NO_ACCOUNT }
async function findTwin() { return null }

// Records a payment (EMI) against a debt. Interest and principal can be given; when BOTH are left blank
// and the loan has an interest rate, the payment is split automatically: daily interest on the
// balance for the days since the last payment, and the remainder reduces principal.
// accountId: the bank account it was debited from (defaults to the loan's own "debit from" account).
// Used for payments typed in and for EMI SMS (source 'sms').
export async function recordRepayment(debtId, { amount, principal, interest, date, notes = '', source = 'manual', rawSMS = null, accountId, installmentNo = null, statementDate = null }) {
  const amt = Number(amount)
  if (!(amt > 0)) throw new Error('Enter the amount paid')
  const payDate = date ? new Date(date) : new Date()
  const debt0 = await db.debts.get(debtId)
  const twin = debt0 ? await findTwin(debtId, accountId, { type: 'debit', amount: amt, date: payDate, label: `${debt0.name} EMI` }) : null

  return db.transaction('rw', db.debts, db.debtRepayments, db.transactions, db.creditCards, async () => {
    const debt = await db.debts.get(debtId)
    if (!debt) throw new Error('Debt not found')

    // A payment typed in (not an EMI that posted itself). You can split it into principal and interest; with no
    // split, all of it is principal. Interest on the old balance up to the payment date is kept aside and charged
    // with the next EMI (less any interest paid now); after it, interest runs on the lower balance.
    const part = source === 'manual' && installmentNo == null
    let interestPart, principalPart
    if (part) {
      const owed = Math.max(0, round2(debt.currentOutstanding || 0))
      if (blank(interest) && blank(principal)) {
        principalPart = Math.min(amt, owed)
        interestPart = round2(amt - principalPart) // only when paying more than is owed (pre-closure with interest)
      } else {
        // one part typed: the other is whatever is left of the amount
        principalPart = blank(principal) ? null : round2(Number(principal))
        interestPart = blank(interest) ? round2(amt - principalPart) : round2(Math.min(Math.max(Number(interest) || 0, 0), amt))
        if (principalPart == null) principalPart = round2(amt - interestPart)
        if (!(principalPart >= 0)) throw new Error('Principal cannot be negative')
        if (Math.abs(principalPart + interestPart - amt) > 0.011) throw new Error(`Principal ${principalPart} + interest ${interestPart} must add up to the amount paid (${amt})`)
        if (principalPart > owed + 0.005) throw new Error(`Principal cannot be more than what is still owed (${owed})`)
      }
    } else if (blank(interest) && blank(principal) && debt.interestRate > 0) {
      const last = lastRepaymentDate(await db.debtRepayments.where('debtId').equals(debtId).toArray())
      const sp = splitPayment(debt, amt, payDate, last)
      interestPart = sp.interest
      principalPart = sp.principal
    } else {
      interestPart = Math.min(Math.max(Number(interest) || 0, 0), amt)
      principalPart = blank(principal) ? amt - interestPart : Number(principal)
      if (!(principalPart >= 0) || principalPart + interestPart > amt + 0.005) throw new Error('Principal + interest cannot exceed the amount paid')
    }

    const acct = await postToAccount(debt, blank(accountId) ? debt.debitAccountId : Number(accountId), twin, {
      type: 'debit', amount: amt, date: payDate, source, rawSMS, notes, label: `${debt.name} EMI`, category: 'EMI', excluded: false,
    })
    const outstanding = Math.max(0, round2((debt.currentOutstanding || 0) - principalPart))
    // each posting keeps what was left afterwards, so the ledger reads: EMI, interest, principal, balance
    const undoInfo = {}
    const patch = {}
    if (part) {
      undoInfo.carryBefore = debt.accruedInterest || 0
      undoInfo.interestFromBefore = debt.interestFrom || null
      patch.accruedInterest = Math.max(0, round2((debt.accruedInterest || 0) + accrualUntil(debt, payDate) - interestPart))
      if (Array.isArray(debt.schedule) && outstanding > 0.005) {
        undoInfo.scheduleBefore = debt.schedule
        patch.schedule = rebuildSchedule(debt, outstanding)
        patch.tenureMonths = patch.schedule.length
      }
    } else if (installmentNo != null || source === 'auto') patch.accruedInterest = 0 // the EMI has charged it
    // each posting keeps what was left afterwards, so the ledger reads: EMI, interest, principal, balance
    await db.debtRepayments.add({ debtId, direction: 'out', date: payDate, amount: amt, principal: principalPart, interest: interestPart, outstandingAfter: outstanding, installmentNo, statementDate, source, rawSMS, notes, ...undoInfo, ...acct })
    await db.debts.update(debtId, {
      currentOutstanding: outstanding,
      totalPaid: (debt.totalPaid || 0) + principalPart,
      totalInterestPaid: (debt.totalInterestPaid || 0) + interestPart,
      interestFrom: payDate, // interest is counted again from this payment
      ...patch,
      ...(outstanding === 0 ? { status: 'closed' } : {}),
    })
    return { interest: interestPart, principal: principalPart }
  })
}

export const addManualRepayment = (debtId, fields) => recordRepayment(debtId, fields)

// Money received on a loan. For a loan you took: the lender paid it out to you (a disbursal or top-up),
// so what you owe and the amount borrowed go up. For money you lent to someone: they paid you back,
// so what you are still owed goes down. Either way it is credited to the account it landed in.
export async function recordReceipt(debtId, { amount, date, notes = '', accountId }) {
  const amt = Number(amount)
  if (!(amt > 0)) throw new Error('Enter the amount received')
  const payDate = date ? new Date(date) : new Date()
  const debt0 = await db.debts.get(debtId)
  const lentLabel = debt0 ? (isLent(debt0) ? `${debt0.name} — repaid to you` : `${debt0.name} — loan received`) : ''
  const twin = debt0 ? await findTwin(debtId, accountId, { type: 'credit', amount: amt, date: payDate, label: lentLabel }) : null

  return db.transaction('rw', db.debts, db.debtRepayments, db.transactions, db.creditCards, async () => {
    const debt = await db.debts.get(debtId)
    if (!debt) throw new Error('Debt not found')
    const lent = isLent(debt)
    const outstandingDelta = lent ? -Math.min(amt, debt.currentOutstanding || 0) : amt
    const principalDelta = lent ? 0 : amt

    const acct = await postToAccount(debt, blank(accountId) ? debt.debitAccountId : Number(accountId), twin, {
      type: 'credit', amount: amt, date: payDate, source: 'manual', rawSMS: null, notes,
      label: lent ? `${debt.name} — repaid to you` : `${debt.name} — loan received`, category: lent ? 'Loan repaid to you' : 'Loan received', excluded: true, // not income
    })
    const outstanding = Math.max(0, round2((debt.currentOutstanding || 0) + outstandingDelta))
    await db.debtRepayments.add({ debtId, direction: 'in', date: payDate, amount: amt, principal: 0, interest: 0, outstandingAfter: outstanding, outstandingDelta, principalDelta, source: 'manual', rawSMS: null, notes, ...acct })
    await db.debts.update(debtId, {
      currentOutstanding: outstanding,
      principal: (debt.principal || 0) + principalDelta,
      interestFrom: payDate,
      ...(outstanding === 0 ? { status: 'closed' } : { status: 'active' }),
    })
  })
}

// Deletes a repayment / receipt and puts the loan (and the bank account it touched) back as it was.
export async function undoRepayment(repaymentId) {
  await db.transaction('rw', db.debts, db.debtRepayments, db.transactions, db.creditCards, async () => {
    const r = await db.debtRepayments.get(repaymentId)
    if (!r) return
    const debt = await db.debts.get(r.debtId)
    if (debt) {
      if (r.direction === 'in') {
        await db.debts.update(debt.id, {
          currentOutstanding: Math.max(0, (debt.currentOutstanding || 0) - (r.outstandingDelta || 0)),
          principal: Math.max(0, (debt.principal || 0) - (r.principalDelta || 0)),
          status: 'active',
        })
      } else {
        await db.debts.update(debt.id, {
          currentOutstanding: (debt.currentOutstanding || 0) + (r.principal ?? r.amount),
          totalPaid: Math.max(0, (debt.totalPaid || 0) - (r.principal ?? r.amount)),
          totalInterestPaid: Math.max(0, (debt.totalInterestPaid || 0) - (r.interest || 0)),
          status: 'active',
        })
      }
    }
    // Take back what it did to the bank account.
    if (r.accountId != null && r.accountDelta) {
      const acct = await db.creditCards.get(r.accountId)
      if (acct && acct.accountBalance != null) await db.creditCards.update(acct.id, { accountBalance: round2(acct.accountBalance - r.accountDelta) })
    }
    if (r.accountTxnId != null && r.accountTxnOwned) await db.transactions.delete(r.accountTxnId)
    await db.debtRepayments.delete(repaymentId)
    // Interest runs from the payment before this one again.
    if (debt) {
      await db.debts.update(debt.id, {
        interestFrom: r.interestFromBefore ?? lastRepaymentDate(await db.debtRepayments.where('debtId').equals(debt.id).toArray()),
        ...(r.carryBefore != null ? { accruedInterest: r.carryBefore } : {}),
        // a part payment that re-worked a bank schedule: put the schedule back
        ...(r.scheduleBefore ? { schedule: r.scheduleBefore, tenureMonths: r.scheduleBefore.length } : {}),
      })
    }
  })
}

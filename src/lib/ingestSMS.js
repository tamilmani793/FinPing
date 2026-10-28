import { db } from '../db/schema'
import { parseSMS, isCreditCardSMS, detectCardKind, extractAvailableLimit } from './smsParser'
import { shiftAvailable, setLimitFields, groupOf } from './cards'
import { cycleDates } from './cycle'
import { recordRepayment } from './debtBackup'
import { findDuplicate, mergeDuplicate, pairTransfer } from './dedupe'

// Finds the card by its last four digits (preferring the same bank), or creates it.
// kind = what the SMS says: 'credit' | 'debit' | 'unknown'. Once a card exists, the type the
// user (or an earlier SMS) set on it wins over the wording of later SMS.
export async function findOrCreateCard(parsed, kind, create = true) {
  if (!parsed.cardLast4) return null
  // Bank accounts and cards live in the same list but never match each other, even with the same last four digits.
  const isAccount = kind === 'account'
  const matches = (await db.creditCards.where('cardLast4').equals(parsed.cardLast4).toArray()).filter(c => (c.cardType === 'account') === isAccount)
  const existing = matches.find(c => c.bank === parsed.bank) || matches[0]
  if (existing) {
    // A card created from an ambiguous SMS becomes credit/debit as soon as an SMS says so.
    if (existing.cardType === 'unknown' && (kind === 'credit' || kind === 'debit')) {
      await db.creditCards.update(existing.id, { cardType: kind })
      return db.creditCards.get(existing.id)
    }
    return existing
  }
  if (!create) return null // only link to what already exists
  const bank = parsed.bank || 'Bank'
  const id = await db.creditCards.add({
    name: isAccount ? `${bank} account ••${parsed.cardLast4}` : `${bank} ••${parsed.cardLast4}`, bank, cardLast4: parsed.cardLast4,
    cardType: kind === 'credit' || kind === 'debit' || kind === 'account' ? kind : 'unknown',
    network: '', variant: '', partner: '', rewardMode: 'cashback', pointValue: 1,
    annualFee: 0, annualFeeGST: 0, totalAnnualFee: 0, feeWaiverThreshold: 0, isLTF: true,
    billingCycleDate: 1, paymentDueDays: 20,
    currentBalance: 0, creditLimit: 0, availableCredit: 0, statementBalance: 0, minimumDue: 0,
    rewardRules: [{ id: 'BASE', matchType: 'BASE', targets: [], rate: 0.01, cap: 0, capPeriod: 'uncapped' }],
  })
  return db.creditCards.get(id)
}

const isCredit = card => !card.cardType || card.cardType === 'credit' // cards saved before types existed were all credit

// kind: 'spend' (also refunds, via a negative delta) raises/lowers unbilled spends;
//       'payment' pays down the pending statement due.
async function adjustCard(card, delta, kind = 'spend') {
  const fresh = await db.creditCards.get(card.id)
  const patch = { currentBalance: Math.max(0, (fresh.currentBalance || 0) + delta) }
  if (kind === 'spend') patch.unbilled = Math.max(0, (fresh.unbilled || 0) + delta)
  else patch.pendingDue = Math.max(0, (fresh.pendingDue ?? fresh.statementBalance ?? 0) + delta)
  await db.creditCards.update(card.id, patch)
  if (kind === 'payment' && patch.pendingDue === 0) {
    await db.creditCards.update(card.id, { statusPaid: true, statusCycle: cycleDates(fresh).key || null })
  }
  await shiftAvailable(card.id, -delta) // a spend lowers the (possibly shared) available credit
}

// The bank's own "Available limit" is the source of truth for what is still available.
async function applyBankLimit(cardId, availableLimit) {
  if (availableLimit == null) return
  const fresh = await db.creditCards.get(cardId)
  await setLimitFields(fresh, { availableCredit: availableLimit })
  const shared = groupOf(fresh, await db.creditCards.toArray()).length > 1
  // A single card's balance can be derived from limit - available; a shared pool's cannot.
  if (!shared && fresh.creditLimit > 0) await db.creditCards.update(cardId, { currentBalance: Math.max(0, fresh.creditLimit - availableLimit) })
}

// The one credit card a bank has, when an SMS names the issuer but not the card number.
// With two or more cards from that bank there is no way to tell which, so nothing is guessed.
async function soleCardOfBank(bank) {
  if (!bank || bank === 'Unknown Bank') return null
  const first = bank.toLowerCase().split(' ')[0]
  const cards = (await db.creditCards.toArray()).filter(c => !c.draft && (!c.cardType || c.cardType === 'credit') && String(c.bank || '').toLowerCase().split(' ')[0] === first)
  return cards.length === 1 ? cards[0] : null
}

// A debit-card spend (or refund) moves the linked bank account's balance. If the SMS reports the
// account balance itself ("Avl Bal"), that is the truth; otherwise the amount is taken off the
// last known balance. An account with no balance entered yet is left alone.
async function applyToLinkedAccount(accountId, type, amount, reportedBalance) {
  const acct = await db.creditCards.get(accountId)
  if (!acct || acct.cardType !== 'account') return
  if (reportedBalance != null) { await db.creditCards.update(accountId, { accountBalance: reportedBalance }); return }
  if (acct.accountBalance == null) return
  const next = acct.accountBalance + (type === 'debit' ? -amount : amount)
  await db.creditCards.update(accountId, { accountBalance: Math.round(next * 100) / 100 })
}

// A spend / credit entered by hand against a card or account has the same effect an SMS would have.
export async function applyTxnToCard(card, type, amount) {
  if (card.cardType === 'account') {
    if (card.accountBalance == null) return
    await db.creditCards.update(card.id, { accountBalance: Math.round((card.accountBalance + (type === 'debit' ? -amount : amount)) * 100) / 100 })
  } else if (card.cardType === 'debit') {
    if (card.linkedAccountId != null) await applyToLinkedAccount(card.linkedAccountId, type, amount, null)
  } else if (isCredit(card)) {
    await adjustCard(card, type === 'debit' ? amount : -amount)
  }
}

// Parse one SMS and apply it to local data. Returns { status, message }.
// meta = { address, date } with date in epoch ms. Safe to call twice for the same SMS.
export async function ingestSMS(rawText, meta = {}) {
  const text = (rawText || '').trim()
  const receivedAt = new Date(meta.date || Date.now())
  const key = `${receivedAt.getTime()}|${text}`

  if (await db.smsLog.where('key').equals(key).first()) return { status: 'duplicate', message: 'Already processed' }

  const log = (parseStatus, parsedEntityType) =>
    db.smsLog.add({ key, rawText: text, sender: meta.address || '', receivedAt, parseStatus, parsedEntityType })

  const parsed = parseSMS(text, meta.address || '', receivedAt)
  if (!parsed) { await log('ignored'); return { status: 'ignored', message: 'Not a financial SMS' } }

  switch (parsed.type) {
    case 'transaction':
    case 'cashback_credited': {
      const isCashback = parsed.type === 'cashback_credited'
      const kind = detectCardKind(text)
      let card = kind ? await findOrCreateCard(parsed, kind) : null
      // "Rs. 1200 credited to your CASHBACK SBI Card account" names the issuer but no card number
      if (!card && kind === 'credit') card = await soleCardOfBank(parsed.bank)
      // No card mentioned, only an account number: it is a bank account (savings / current), not a card.
      if (!card && parsed.accountLast4) card = await findOrCreateCard({ ...parsed, cardLast4: parsed.accountLast4 }, 'account')
      const type = isCashback ? 'credit' : (parsed.transactionType || 'debit')

      // The bank may send two different SMS for one transaction. Keep a single entry, fill in anything the
      // first one lacked, and don't move any balance a second time.
      const dup = isCashback ? null : await findDuplicate({ date: receivedAt, amount: parsed.amount, type, merchant: parsed.merchant, accountLast4: parsed.accountLast4 || parsed.cardLast4, rawSMS: text })
      if (dup) {
        await mergeDuplicate(dup, { merchant: parsed.merchant, category: parsed.category, bank: parsed.bank, accountLast4: parsed.accountLast4 || parsed.cardLast4, cardId: card ? card.id : null }, text)
        // Figures the bank reports as absolute ("Avl Bal", "Avl Limit") are still safe to take from the second SMS.
        if (card && card.cardType === 'account' && parsed.availableLimit != null) await db.creditCards.update(card.id, { accountBalance: parsed.availableLimit })
        if (card && isCredit(card)) await applyBankLimit(card.id, parsed.availableLimit)
        await log('duplicate', 'transaction')
        return { status: 'duplicate', message: `₹${parsed.amount} — same transaction as an earlier SMS` }
      }

      const newTxn = {
        date: receivedAt, amount: parsed.amount || 0, type,
        merchant: isCashback ? 'Cashback Credit' : (parsed.merchant || 'Unknown'),
        category: isCashback ? 'Cashback' : (parsed.category || 'General'),
        paymentMode: card && card.cardType !== 'account' ? (card.cardType === 'debit' ? 'Debit Card' : card.cardType === 'unknown' ? 'Card' : 'Credit Card') : (parsed.paymentMode || 'Other'), bank: parsed.bank || '', accountLast4: parsed.accountLast4 || parsed.cardLast4 || null,
        cardId: card ? card.id : null, rawSMS: text, parsedBy: 'auto',
        tags: [], notes: '', isExcluded: false, createdAt: new Date(),
      }
      newTxn.id = await db.transactions.add(newTxn)
      await pairTransfer(newTxn) // your own money moving between two of your accounts is not income or spending
      // A bank account keeps the balance the bank reports ("Avl Bal").
      if (card && card.cardType === 'account' && parsed.availableLimit != null) await db.creditCards.update(card.id, { accountBalance: parsed.availableLimit })
      // A debit card spends from the bank account it is linked to.
      if (card && card.cardType === 'debit' && card.linkedAccountId != null && !isCashback) {
        await applyToLinkedAccount(card.linkedAccountId, type, parsed.amount || 0, parsed.availableLimit)
      }
      // Only credit cards carry a balance / limit. Debit and not-yet-typed cards just collect their spends.
      if (card && isCredit(card) && !isCashback) {
        await adjustCard(card, type === 'debit' ? parsed.amount : -parsed.amount)
        await applyBankLimit(card.id, parsed.availableLimit)
      }
      await log('saved', 'transaction')
      return { status: 'success', message: `₹${parsed.amount} ${type === 'debit' ? 'spent at' : 'from'} ${parsed.merchant || 'Unknown'}` }
    }
    case 'payment_received': {
      let card = isCreditCardSMS(text) ? await findOrCreateCard(parsed, 'credit') : null
      // "SBI Card bill of INR 100 paid ..." names the issuer but not the card number
      if (!card && parsed.billPaid) card = await soleCardOfBank(parsed.bank)
      // A payment is often confirmed twice (once when received, once when posted): same card, same amount, a few hours apart.
      // But two ₹100 payments are two payments if the bank's "available limit" differs between them
      // (it rises by ₹100 with each one), so that figure decides whenever both messages carry it.
      const alreadyPaid = card && await db.transactions.where('cardId').equals(card.id)
        .filter(t => {
          if (t.kind !== 'card_payment' || Math.abs(t.amount - (parsed.amount || 0)) > 0.01) return false
          if (Math.abs(new Date(t.date) - receivedAt) > 6 * 60 * 60 * 1000) return false
          const theirs = extractAvailableLimit(t.rawSMS || '')
          if (theirs != null && parsed.availableLimit != null) return Math.abs(theirs - parsed.availableLimit) < 0.01
          return true
        }).first()
      if (alreadyPaid) {
        await applyBankLimit(card.id, parsed.availableLimit)
        await log('duplicate', 'payment_received')
        return { status: 'duplicate', message: 'Card payment already recorded' }
      }
      if (card) {
        // Keep the payment as its own entry so the card's payment history can list it. It is flagged
        // excluded so it never counts as income in the totals.
        await db.transactions.add({
          date: receivedAt, amount: parsed.amount || 0, type: 'credit', merchant: 'Card payment', category: 'Card Payment',
          paymentMode: 'Credit Card', bank: parsed.bank || '', accountLast4: parsed.cardLast4 || null, cardId: card.id,
          rawSMS: text, parsedBy: 'auto', kind: 'card_payment', tags: [], notes: '', isExcluded: true, createdAt: new Date(),
        })
        await adjustCard(card, -(parsed.amount || 0), 'payment')
        await applyBankLimit(card.id, parsed.availableLimit)
      }
      await log('saved', 'payment_received')
      return { status: 'success', message: `Card payment of ₹${parsed.amount} recorded` }
    }
    case 'statement': {
      const card = isCreditCardSMS(text) ? await findOrCreateCard(parsed, 'credit') : null
      if (card) {
        await db.creditCards.update(card.id, { statementBalance: parsed.totalDue || 0, pendingDue: parsed.totalDue || 0, unbilled: 0, currentBalance: parsed.totalDue || 0, minimumDue: parsed.minimumDue || 0, statusPaid: false, statusCycle: cycleDates(card, receivedAt).key || null, statementCycleKey: cycleDates(card, receivedAt).key || null })
      }
      await log('saved', 'statement')
      return { status: 'success', message: `Statement: ₹${parsed.totalDue} due` }
    }
    case 'emi': {
      const debts = await db.debts.where('status').equals('active').toArray()
      // The loan account number in the SMS is the surest match; otherwise EMI amount + lender.
      const flat = s => String(s || '').replace(/[\s\-]/g, '').toLowerCase()
      const haystack = flat(text)
      const bank = (parsed.bank || '').toLowerCase()
      const sameLender = d => {
        const l = (d.lender || '').toLowerCase()
        if (!bank || bank === 'unknown bank') return true
        return l.includes(bank.split(' ')[0]) || (bank.startsWith('state bank') && l.includes('sbi'))
      }
      // Banks mask or shorten account numbers (XX778899), so the last digits are what is compared.
      const tail = d => flat(d.loanAccountNo).slice(-6)
      const debt = debts.find(d => d.loanAccountNo && tail(d).length >= 4 && haystack.includes(tail(d)))
        || debts.find(d => d.emiAmount && Math.abs(d.emiAmount - parsed.amount) < 1 && sameLender(d))
      if (debt) {
        // Interest for the days since the last payment comes off first; only the rest lowers the principal.
        await recordRepayment(debt.id, { amount: parsed.amount, date: receivedAt, source: 'sms', rawSMS: text })
        await log('saved', 'emi')
        return { status: 'success', message: `EMI ₹${parsed.amount} applied to ${debt.name}` }
      }
      await log('needs_review', 'emi')
      return { status: 'review', message: 'EMI detected — add the loan under Debt to track it' }
    }
    default:
      await log('needs_review', parsed.type)
      return { status: 'review', message: `Detected ${parsed.type.replace(/_/g, ' ')}` }
  }
}

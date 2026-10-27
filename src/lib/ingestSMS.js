import { db } from '../db/schema'
import { parseSMS, isCreditCardSMS, detectCardKind } from './smsParser'
import { shiftAvailable, setLimitFields, groupOf } from './cards'

// Finds the card by its last four digits (preferring the same bank), or creates it.
// kind = what the SMS says: 'credit' | 'debit' | 'unknown'. Once a card exists, the type the
// user (or an earlier SMS) set on it wins over the wording of later SMS.
async function findOrCreateCard(parsed, kind) {
  if (!parsed.cardLast4) return null
  const matches = await db.creditCards.where('cardLast4').equals(parsed.cardLast4).toArray()
  const existing = matches.find(c => c.bank === parsed.bank) || matches[0]
  if (existing) {
    // A card created from an ambiguous SMS becomes credit/debit as soon as an SMS says so.
    if (existing.cardType === 'unknown' && (kind === 'credit' || kind === 'debit')) {
      await db.creditCards.update(existing.id, { cardType: kind })
      return db.creditCards.get(existing.id)
    }
    return existing
  }
  const bank = parsed.bank || 'Bank'
  const id = await db.creditCards.add({
    name: `${bank} ••${parsed.cardLast4}`, bank, cardLast4: parsed.cardLast4,
    cardType: kind === 'credit' || kind === 'debit' ? kind : 'unknown',
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
    const stmts = await db.creditCardStatements.where('cardId').equals(card.id).toArray()
    stmts.sort((x, y) => new Date(y.statementDate || 0) - new Date(x.statementDate || 0))
    if (stmts[0]) await db.creditCardStatements.update(stmts[0].id, { isPaid: true })
  }
  await shiftAvailable(card.id, -delta) // a spend lowers the (possibly shared) available credit
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
      const card = kind ? await findOrCreateCard(parsed, kind) : null
      const type = isCashback ? 'credit' : (parsed.transactionType || 'debit')
      await db.transactions.add({
        date: receivedAt, amount: parsed.amount || 0, type,
        merchant: isCashback ? 'Cashback Credit' : (parsed.merchant || 'Unknown'),
        category: isCashback ? 'Cashback' : (parsed.category || 'General'),
        paymentMode: card ? (card.cardType === 'debit' ? 'Debit Card' : card.cardType === 'unknown' ? 'Card' : 'Credit Card') : (parsed.paymentMode || 'Other'), bank: parsed.bank || '', accountLast4: parsed.accountLast4 || parsed.cardLast4 || null,
        cardId: card ? card.id : null, rawSMS: text, parsedBy: 'auto',
        tags: [], notes: '', isExcluded: false, createdAt: new Date(),
      })
      // Only credit cards carry a balance / limit. Debit and not-yet-typed cards just collect their spends.
      if (card && isCredit(card) && !isCashback) {
        await adjustCard(card, type === 'debit' ? parsed.amount : -parsed.amount)
        // The bank's own "Avl Limit" is the source of truth for what is still available.
        if (parsed.availableLimit != null) {
          const fresh = await db.creditCards.get(card.id)
          await setLimitFields(fresh, { availableCredit: parsed.availableLimit })
          const shared = groupOf(fresh, await db.creditCards.toArray()).length > 1
          // A single card's balance can be derived from limit - available; a shared pool's cannot.
          if (!shared && fresh.creditLimit > 0) await db.creditCards.update(card.id, { currentBalance: Math.max(0, fresh.creditLimit - parsed.availableLimit) })
        }
      }
      await log('saved', 'transaction')
      return { status: 'success', message: `₹${parsed.amount} ${type === 'debit' ? 'spent at' : 'from'} ${parsed.merchant || 'Unknown'}` }
    }
    case 'payment_received': {
      const card = isCreditCardSMS(text) ? await findOrCreateCard(parsed, 'credit') : null
      if (card) await adjustCard(card, -(parsed.amount || 0), 'payment')
      await log('saved', 'payment_received')
      return { status: 'success', message: `Card payment of ₹${parsed.amount} recorded` }
    }
    case 'statement': {
      const card = isCreditCardSMS(text) ? await findOrCreateCard(parsed, 'credit') : null
      if (card) {
        await db.creditCards.update(card.id, { statementBalance: parsed.totalDue || 0, pendingDue: parsed.totalDue || 0, unbilled: 0, currentBalance: parsed.totalDue || 0, minimumDue: parsed.minimumDue || 0 })
      }
      await log('saved', 'statement')
      return { status: 'success', message: `Statement: ₹${parsed.totalDue} due` }
    }
    case 'emi': {
      const debts = await db.debts.where('status').equals('active').toArray()
      const debt = debts.find(d => d.emiAmount && Math.abs(d.emiAmount - parsed.amount) < 1 &&
        (!parsed.bank || (d.lender || '').toLowerCase().includes(parsed.bank.split(' ')[0].toLowerCase())))
      if (debt) {
        await db.debtRepayments.add({ debtId: debt.id, date: receivedAt, amount: parsed.amount, principal: parsed.amount, interest: 0, source: 'sms', rawSMS: text, notes: '' })
        await db.debts.update(debt.id, {
          currentOutstanding: Math.max(0, debt.currentOutstanding - parsed.amount),
          totalPaid: (debt.totalPaid || 0) + parsed.amount,
        })
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

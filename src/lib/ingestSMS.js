import { db } from '../db/schema'
import { parseSMS } from './smsParser'

async function findOrCreateCard(parsed) {
  if (!parsed.cardLast4) return null
  const existing = await db.creditCards.where('cardLast4').equals(parsed.cardLast4).first()
  if (existing) return existing
  const bank = parsed.bank || 'Bank'
  const id = await db.creditCards.add({
    name: `${bank} ••${parsed.cardLast4}`, bank, cardLast4: parsed.cardLast4,
    network: '', rewardMode: 'cashback', pointValue: 1,
    annualFee: 0, annualFeeGST: 0, totalAnnualFee: 0, feeWaiverThreshold: 0, isLTF: true,
    billingCycleDate: 1, paymentDueDays: 20,
    currentBalance: 0, creditLimit: 0, availableCredit: 0, statementBalance: 0, minimumDue: 0,
    rewardRules: [{ id: 'BASE', matchType: 'BASE', targets: [], rate: 0.01, cap: 0, capPeriod: 'uncapped' }],
  })
  return db.creditCards.get(id)
}

async function adjustCard(card, delta) {
  const currentBalance = Math.max(0, (card.currentBalance || 0) + delta)
  const patch = { currentBalance }
  if (card.creditLimit > 0) patch.availableCredit = Math.max(0, card.creditLimit - currentBalance)
  await db.creditCards.update(card.id, patch)
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
      const isCard = parsed.paymentMode === 'Card' || (isCashback && parsed.cardLast4)
      const card = isCard ? await findOrCreateCard(parsed) : null
      const type = isCashback ? 'credit' : (parsed.transactionType || 'debit')
      await db.transactions.add({
        date: receivedAt, amount: parsed.amount || 0, type,
        merchant: isCashback ? 'Cashback Credit' : (parsed.merchant || 'Unknown'),
        category: isCashback ? 'Cashback' : (parsed.category || 'General'),
        paymentMode: parsed.paymentMode || 'Card', bank: parsed.bank || '',
        cardId: card ? card.id : null, rawSMS: text, parsedBy: 'auto',
        tags: [], notes: '', isExcluded: false, createdAt: new Date(),
      })
      if (card && !isCashback) await adjustCard(card, type === 'debit' ? parsed.amount : -parsed.amount)
      await log('saved', 'transaction')
      return { status: 'success', message: `₹${parsed.amount} ${type === 'debit' ? 'spent at' : 'from'} ${parsed.merchant || 'Unknown'}` }
    }
    case 'payment_received': {
      const card = await findOrCreateCard(parsed)
      if (card) await adjustCard(card, -(parsed.amount || 0))
      await log('saved', 'payment_received')
      return { status: 'success', message: `Card payment of ₹${parsed.amount} recorded` }
    }
    case 'statement': {
      const card = await findOrCreateCard(parsed)
      if (card) {
        const patch = { statementBalance: parsed.totalDue || 0, currentBalance: parsed.totalDue || 0, minimumDue: parsed.minimumDue || 0 }
        if (card.creditLimit > 0) patch.availableCredit = Math.max(0, card.creditLimit - (parsed.totalDue || 0))
        await db.creditCards.update(card.id, patch)
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

import Dexie from 'dexie'

export const db = new Dexie('FinTrackIndia')

db.version(1).stores({
  transactions: '++id, date, type, merchant, category, paymentMode, bank, cardId, parsedBy, createdAt, *tags',
  creditCards: '++id, name, bank, cardLast4, network, rewardMode',
  creditCardTransactions: '++id, cardId, date, merchant, category, capStatus, isBilled, statementMonth, createdAt',
  creditCardStatements: '++id, cardId, statementDate, dueDate, isPaid',
  debts: '++id, name, type, lender, status',
  debtRepayments: '++id, debtId, date, source',
  investments: '++id, name, type, source',
  smsLog: '++id, receivedAt, parseStatus, parsedEntityType',
  budgets: '++id, category, month, year',
  tags: '++id, name'
})

// v2: wipe all previously seeded demo data
db.version(2).stores({}).upgrade(async tx => {
  for (const t of tx.db.tables) await t.clear()
})

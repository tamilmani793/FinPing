import { db } from '../db/schema'

// Lists you can rearrange (debts, cards, accounts) keep their place in a numeric `sortOrder` field.
// Items that have none yet (new ones) come after the ordered ones, in the order they already had.
export function bySortOrder(list) {
  const has = x => Number.isFinite(x?.sortOrder)
  return (list || [])
    .map((x, i) => ({ x, i }))
    .sort((a, b) => {
      if (has(a.x) && has(b.x)) return a.x.sortOrder - b.x.sortOrder || (a.x.id ?? 0) - (b.x.id ?? 0)
      if (has(a.x)) return -1
      if (has(b.x)) return 1
      return a.i - b.i
    })
    .map(o => o.x)
}

// Writes the new place of each item: 0, 1, 2…
export async function saveOrder(table, items) {
  await db.transaction('rw', db[table], async () => {
    for (let i = 0; i < items.length; i++) await db[table].update(items[i].id, { sortOrder: i })
  })
}

// Cards and accounts as one list (Home): credit cards, then debit cards, then bank accounts, each in its own saved order
const rank = c => (c.cardType === 'debit' ? 1 : c.cardType === 'account' ? 2 : c.cardType === 'unknown' ? 3 : 0)
export function orderCards(cards) {
  return [0, 1, 2, 3].flatMap(r => bySortOrder((cards || []).filter(c => rank(c) === r)))
}

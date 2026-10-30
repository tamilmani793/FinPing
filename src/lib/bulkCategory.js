import { db } from '../db/schema'
import { tagAllCards } from './rewardTagging'

// Moves several transactions to another category in one go. It counts as your own change (so a bank statement import will not undo it)
// and the card reward tags are worked out again, since the category can change what a card should earn.
export async function moveToCategory(rows, category) {
  const todo = rows.filter(t => t.category !== category)
  for (const t of todo) await db.transactions.update(t.id, { category, userEdited: true, editedFields: [...new Set([...(t.editedFields || []), 'category'])] })
  if (todo.length) tagAllCards().catch(() => {})
  return todo.length
}

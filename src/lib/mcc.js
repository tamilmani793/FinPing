import { db } from '../db/schema'
import codes from '../data/mccCodes.json'

// The Merchant Category Code dictionary (table mcc_master). It is bundled with the app at build time (src/data/mccCodes.json) and copied
// into the local database the first time it is needed; nothing is ever fetched, and no transaction text is ever sent anywhere to "guess"
// an MCC. You can map any code to a different FinPing category; your mapping is kept when the built-in list grows.

export async function seedMcc() {
  const have = new Set((await db.mcc_master.toCollection().primaryKeys()).map(Number))
  const fresh = codes.filter(c => !have.has(c.code)).map(c => ({ code: c.code, name: c.name, category: c.category, defaultCategory: c.category, custom: false }))
  if (fresh.length) await db.mcc_master.bulkAdd(fresh)
  return fresh.length
}

// { '5411': { code, name, category, ... } } for the rules engine
export async function getMccMap() {
  await seedMcc()
  const map = {}
  for (const m of await db.mcc_master.toArray()) map[String(m.code)] = m
  return map
}

export async function setMccCategory(code, category) {
  const m = await db.mcc_master.get(Number(code))
  if (!m) return
  await db.mcc_master.update(m.code, { category, custom: category !== (m.defaultCategory ?? m.category) })
}

export async function resetMcc(code) {
  const m = await db.mcc_master.get(Number(code))
  if (!m) return
  if (m.userAdded) { await db.mcc_master.delete(m.code); return }
  await db.mcc_master.update(m.code, { category: m.defaultCategory ?? m.category, custom: false })
}

export async function addCustomMcc({ code, name, category }) {
  const c = Number(code)
  if (!Number.isInteger(c) || c < 1 || c > 9999) throw new Error('An MCC is a 4-digit number')
  if (await db.mcc_master.get(c)) throw new Error(`MCC ${c} is already in the list; change its category instead`)
  await db.mcc_master.add({ code: c, name: (name || '').trim() || `Custom MCC ${c}`, category, defaultCategory: category, custom: true, userAdded: true })
}

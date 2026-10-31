import { db } from '../db/schema'
import { getList, setList, isCustomised, LEGACY_CATEGORIES, reloadOptions } from './options'
import { RULES_KEY } from './merchantRules'
import { tagAllCards } from './rewardTagging'

// The category list was simplified (Food Delivery -> Food & Dining, E-Commerce -> Shopping, Travel Online -> Travel, plus Fees & Charges and
// Gaming & Gambling). This brings everything already saved on the phone to the new names, once: transactions, the MCC dictionary, cards'
// reward exclusions, each card's reward rules, the merchant rules and a customised category list. Nothing is deleted.

const NEW_CATEGORIES = [['Fees & Charges', '🧾'], ['Gaming & Gambling', '🎰']]

// names reward rules once used for "what earns nothing" that are just other words for a category
const EXCLUSION_WORDS = {
  wallet: ['Wallet Load'], 'wallet/gift/prepaid loads and vouchers': ['Wallet Load'], 'gift cards': ['Wallet Load'], 'prepaid card': ['Wallet Load'],
  government: ['Government & Tax'], 'education and government': ['Education', 'Government & Tax'],
  jewellery: ['Jewellery & Gold'], 'jewellery and antiques': ['Jewellery & Gold'],
  'emi (easyemi, smartemi, dial an emi)': ['EMI'], 'merchant emi': ['EMI'], 'instant emi (iemi)': ['EMI'],
  'cash advance': ['ATM Withdrawal'], 'quasi cash': ['ATM Withdrawal'], atm: ['ATM Withdrawal'], 'card bill payment': ['Card Payment'],
  'fees and charges': ['Fees & Charges'], 'financial charges': ['Fees & Charges'], utility: ['Utilities & Bills'],
  'digital gaming': ['Gaming & Gambling'], gambling: ['Gaming & Gambling'], 'balance transfer': ['Transfer'], 'money transfer': ['Transfer'],
}
const KNOWN = new Set(['Food & Dining', 'Grocery', 'Shopping', 'Utilities & Bills', 'Travel', 'Transport', 'Fuel', 'Entertainment', 'Health', 'Education', 'Insurance', 'Rent', 'EMI', 'Investment',
  'Government & Tax', 'Jewellery & Gold', 'Wallet Load', 'ATM Withdrawal', 'UPI Scan & Pay', 'Fees & Charges', 'Gaming & Gambling', 'Transfer', 'Cashback', 'Salary', 'General', 'Card Payment'])

const rename = n => LEGACY_CATEGORIES[n] || n
const unique = a => [...new Set(a)]

// a list of category names from a rule: renamed, synonyms folded in, anything that is not a category kept as plain text
function tidyNames(names, otherSpendTypes) {
  const cats = [], other = [...(otherSpendTypes || [])]
  for (const n of names || []) {
    const k = String(n).trim().toLowerCase()
    const mapped = EXCLUSION_WORDS[k]
    if (mapped) cats.push(...mapped)
    else if (KNOWN.has(rename(n))) cats.push(rename(n))
    else other.push(n)
  }
  return { cats: unique(cats), other: unique(other) }
}

function tidyExclusions(ex) {
  if (!ex) return ex
  const { cats, other } = tidyNames(ex.categories, ex.otherSpendTypes)
  return { ...ex, categories: cats, ...(other.length ? { otherSpendTypes: other } : {}) }
}
const tidyAccelerated = list => (list || []).map(a => ({ ...a, categories: unique((a.categories || []).map(rename)) }))
const tidyVersion = v => ({ ...v, accelerated: tidyAccelerated(v.accelerated), exclusions: tidyExclusions(v.exclusions) })

export async function migrateSimpleCategories() {
  let changed = 0
  // 1. transactions
  for (const [from, to] of Object.entries(LEGACY_CATEGORIES)) changed += await db.transactions.where('category').equals(from).modify({ category: to })
  // 2. the MCC dictionary (your own mappings follow too)
  await db.mcc_master.toCollection().modify(m => {
    const c = rename(m.category), d = rename(m.defaultCategory ?? m.category)
    if (c !== m.category || d !== m.defaultCategory) { m.category = c; if (m.defaultCategory != null) m.defaultCategory = d; changed++ }
  })
  // 3. cards: the categories each card leaves out of rewards
  await db.creditCards.filter(c => Array.isArray(c.excludedCategories)).modify(c => {
    const next = unique(c.excludedCategories.map(rename))
    if (next.join('|') !== c.excludedCategories.join('|')) { c.excludedCategories = next; changed++ }
  })
  // 4. each card's reward rules, and the earlier versions kept with them
  await db.card_reward_rules.toCollection().modify(r => {
    const t = tidyVersion(r)
    r.accelerated = t.accelerated; r.exclusions = t.exclusions
    r.history = (r.history || []).map(tidyVersion)
    changed++
  })
  // 5. merchants you told the app to always file under one category
  try {
    const raw = JSON.parse(localStorage.getItem(RULES_KEY) || '{}') || {}
    const next = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, rename(v)]))
    localStorage.setItem(RULES_KEY, JSON.stringify(next))
  } catch { /* nothing saved */ }
  // 6. a category list you customised: new names in place, the two new categories added when missing
  if (isCustomised('categories')) {
    const list = getList('categories').map(c => ({ ...c, name: rename(c.name) }))
    const seen = new Set()
    const merged = list.filter(c => (seen.has(c.name) ? false : (seen.add(c.name), true)))
    for (const [name, icon] of NEW_CATEGORIES) if (!seen.has(name)) merged.push({ name, icon })
    setList('categories', merged)
  }
  reloadOptions()
  tagAllCards().catch(() => {}) // category names changed, so the expected rewards are worked out again
  return changed
}

import { useSyncExternalStore } from 'react'
import { db } from '../db/schema'
import { BANKS, NETWORKS, PARTNERS, EXCLUSION_CATEGORIES, variantsFor } from './cardCatalog'
import { INDIAN_CARDS, catalogEntries } from './indianCards'
import { POLICY_TYPES, INSURERS, POLICY_CATALOG } from './policies'

// Every dropdown in the app reads its choices from here. The built-in choices are the starting point; anything
// you change in Profile -> Dropdown options is kept on this phone (and in your backup) and replaces the built-in list.
//
//   kind 'text'  : a list of names                                  (banks, networks, insurers...)
//   kind 'rich'  : names with an extra field (icon, bank, partner)  (categories, debt types, card names)

const STORE_KEY = 'finping_options'

// default Debt types: id (kept on saved debts) / label / icon
const DEBT_TYPES = [
  ['HomeLoan', 'Home loan', '🏠'], ['MortgageLoan', 'Mortgage / loan against property', '🏘'], ['GoldLoan', 'Gold loan', '🪙'],
  ['CarLoan', 'Car loan', '🚗'], ['TwoWheelerLoan', 'Two-wheeler loan', '🏍'], ['PersonalLoan', 'Personal loan', '💼'],
  ['EducationLoan', 'Education loan', '🎓'], ['BusinessLoan', 'Business loan', '🏢'], ['LoanAgainstSecurities', 'Loan against shares / mutual funds', '📈'],
  ['CreditCardEMI', 'Credit card EMI', '💳'], ['DebitCardEMI', 'Debit card EMI', '💳'], ['ConsumerEMI', 'No-cost / consumer durable EMI', '📱'],
  ['Overdraft', 'Overdraft', '🏦'], ['CreditLine', 'Credit line / Buy-now-pay-later', '🧾'], ['FriendBorrowed', 'Borrowed from friend / family', '🤝'],
  ['FriendLent', 'Lent to friend / family', '🤲'], ['Other', 'Other', '📄'],
].map(([id, label, icon]) => ({ id, label, icon }))

const CATEGORIES = [
  ['Food Delivery', '🍔'], ['E-Commerce', '🛍'], ['Utilities & Bills', '⚡'], ['Transport', '🚗'], ['Health', '💊'], ['Fuel', '⛽'], ['Rent', '🏠'],
  ['Grocery', '🥦'], ['Travel Online', '✈️'], ['Entertainment', '🎬'], ['Insurance', '🛡'], ['EMI', '🏦'], ['Investment', '📈'], ['UPI Scan & Pay', '📲'],
  ['Cashback', '💚'], ['Salary', '💼'], ['Transfer', '🔁'], ['General', '💳'],
].map(([name, icon]) => ({ name, icon }))

// the app itself relies on these names, so they cannot be renamed or removed
export const LOCKED_CATEGORIES = ['General', 'Cashback', 'Card Payment', 'EMI', 'Transfer']

const CARD_NAMES = catalogEntries().map(e => ({ bank: e.bank, name: e.label, partner: e.partner }))
const DEBIT_NAMES = {
  'HDFC Bank': ['Millennia', 'Regalia', 'Platinum', 'Rewards', 'Easy Shop', 'Classic', 'RuPay Platinum', 'Business'],
  'ICICI Bank': ['Coral', 'Platinum Chip', 'Sapphiro', 'Rubyx', 'Expressions', 'Instant Banking', 'Manchester United', 'Business'],
  'State Bank of India': ['Classic', 'Global International', 'Platinum', 'Gold', 'Prime', 'Signature', 'My Card', 'RuPay'],
  'Axis Bank': ['Titanium', 'Platinum', 'Signature', 'Priority', 'Burgundy', 'Rewards', 'RuPay Select'],
  'Kotak Bank': ['811', 'Platinum', 'Privy League', 'Classic', 'RuPay', 'Business'],
  'IDFC First Bank': ['Millennia', 'Wealth', 'Select', 'Classic'],
  'Yes Bank': ['Platinum', 'Signature', 'Prosperity', 'Rewards', 'RuPay'],
  'IndusInd Bank': ['Platinum', 'Signature', 'Millennia', 'RuPay'],
  'Bank of Baroda': ['Classic', 'Platinum', 'Millennia', 'RuPay'],
  PNB: ['Classic', 'Platinum', 'Gold', 'RuPay Platinum', 'RuPay Select'],
  'Federal Bank': ['Classic', 'Platinum', 'Signature', 'Select'],
  'Standard Chartered': ['Platinum', 'Priority', 'Titanium'],
  HSBC: ['Premier', 'Advance', 'Platinum'],
  'RBL Bank': ['Classic', 'Platinum', 'Signature'],
  'AU Small Finance Bank': ['Classic', 'Platinum', 'Signature'],
}
const BRAND = { 'HDFC Bank': 'HDFC', 'ICICI Bank': 'ICICI', 'State Bank of India': 'SBI', 'Axis Bank': 'Axis', 'Kotak Bank': 'Kotak', 'IDFC First Bank': 'IDFC First', 'Yes Bank': 'Yes Bank', 'IndusInd Bank': 'IndusInd', 'Bank of Baroda': 'BoB', 'Federal Bank': 'Federal', 'Standard Chartered': 'Standard Chartered', 'RBL Bank': 'RBL', 'AU Small Finance Bank': 'AU' }
// "HDFC Platinum Debit": the name carries the bank so it reads clearly on the Accounts screen
const DEBIT_CARD_NAMES = Object.entries(DEBIT_NAMES).flatMap(([bank, names]) => names.map(n => ({ bank, name: `${BRAND[bank] || bank} ${n} Debit`, partner: '' })))
const VARIANTS = [...new Set(variantsFor('', 'credit').concat(variantsFor('', 'debit')))]

// who you borrow from: the banks plus finance companies, card and pay-later lenders, and people
const LENDERS_EXTRA = [
  'Bajaj Finance', 'LIC Housing Finance', 'HDFC Ltd', 'Tata Capital', 'Aditya Birla Finance', 'Mahindra Finance', 'Shriram Finance', 'L&T Finance',
  'PNB Housing Finance', 'Home First Finance', 'Piramal Finance', 'Hero FinCorp', 'Poonawalla Fincorp', 'Muthoot Finance', 'Manappuram Finance',
  'IIFL Finance', 'Navi', 'KreditBee', 'Money View', 'Paytm Postpaid', 'LazyPay', 'Simpl', 'Amazon Pay Later', 'Employer', 'Friend / family', 'Chit fund',
]

export const OPTION_LISTS = {
  banks: { title: 'Bank names', hint: 'Banks and issuers offered when you add a card or account', kind: 'text', icon: '🏦', defaults: () => [...new Set([...BANKS, ...INDIAN_CARDS.map(b => b.bank)])] },
  lenders: { title: 'Lenders', hint: 'Banks, finance companies and people you borrow from or lend to', kind: 'text', icon: '🏛', defaults: () => [...new Set([...BANKS, ...INDIAN_CARDS.map(b => b.bank), ...LENDERS_EXTRA])] },
  cardNames: { title: 'Credit card names', hint: 'The cards you can pick from when adding a credit card', kind: 'rich', icon: '💳', defaults: () => CARD_NAMES },
  debitCardNames: { title: 'Debit card names', hint: 'The cards you can pick from when adding a debit card', kind: 'rich', icon: '💳', defaults: () => DEBIT_CARD_NAMES },
  networks: { title: 'Card networks', hint: 'Visa, Mastercard, RuPay…', kind: 'text', icon: '🌐', defaults: () => [...NETWORKS] },
  variants: { title: 'Card variants', hint: 'Signature, Platinum, World Elite…', kind: 'text', icon: '🏅', defaults: () => VARIANTS },
  partners: { title: 'Co-brand partners', hint: 'Amazon Pay, Swiggy, PhonePe…', kind: 'text', icon: '🤝', defaults: () => [...PARTNERS] },
  exclusions: { title: 'Reward exclusions', hint: 'Spend types that usually earn no rewards; each card keeps its own ticked list', kind: 'text', icon: '🚫', defaults: () => [...EXCLUSION_CATEGORIES] },
  debtTypes: { title: 'Debt types', hint: 'Kinds of loans and EMIs', kind: 'rich', icon: '🏦', defaults: () => DEBT_TYPES },
  categories: { title: 'Transaction categories', hint: 'Renaming a category also renames it on every transaction', kind: 'rich', icon: '🏷', defaults: () => CATEGORIES },
  insurers: { title: 'Insurers', hint: 'Insurance companies offered when you add a policy', kind: 'text', icon: '🛡', defaults: () => [...INSURERS] },
  policyNames: { title: 'Policy names', hint: 'Known policies: picking one in the form fills in its insurer and type', kind: 'rich', icon: '📋', defaults: () => POLICY_CATALOG },
  policyTypes: { title: 'Policy types', hint: 'Term, health, vehicle…', kind: 'text', icon: '📄', defaults: () => [...POLICY_TYPES] },
}

// ── storage ─────────────────────────────────────────────
let overrides = null
const load = () => {
  if (overrides) return overrides
  try { overrides = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {} } catch (e) { overrides = {} }
  return overrides
}
let version = 0
const listeners = new Set()
const emit = () => { version++; listeners.forEach(l => l()) }
const persist = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(load())) } catch (e) {} emit() }

// Called after a backup restore wrote the raw JSON into localStorage
export const reloadOptions = () => { overrides = null; emit() }

export const isCustomised = key => Array.isArray(load()[key])

export function getList(key) {
  const own = load()[key]
  return Array.isArray(own) ? own : OPTION_LISTS[key].defaults()
}
export function setList(key, items) { load()[key] = items; persist() }
export function resetList(key) { delete load()[key]; persist() }

// React: the current list, re-rendering when it is edited
export function useOptions(key) {
  useSyncExternalStore(l => { listeners.add(l); return () => listeners.delete(l) }, () => version)
  return getList(key)
}

// Names only (for text lists, or the `name` / `label` of rich ones)
export const nameOf = (key, item) => (typeof item === 'string' ? item : key === 'debtTypes' ? item.label : item.name)
export const useOptionNames = key => useOptions(key).map(i => nameOf(key, i))

// ── transaction categories ───────────────────────────────
const aliases = () => load().categoryAliases || {}

// A category name the parsers produce, mapped through your renames / removals ("Fuel" -> "Petrol" ...)
export function canonCategory(name) {
  const map = aliases()
  let n = name, guard = 0
  while (map[n] && guard++ < 5) n = map[n]
  return n
}

export const categoryIcon = (list, name) => list.find(c => c.name === name)?.icon || '💳'

export async function renameCategory(oldName, newName) {
  const next = newName.trim()
  if (!next || next === oldName) return
  if (LOCKED_CATEGORIES.includes(oldName)) throw new Error(`“${oldName}” is used by the app and cannot be renamed`)
  const list = getList('categories')
  if (list.some(c => c.name.toLowerCase() === next.toLowerCase() && c.name !== oldName)) throw new Error(`A category called “${next}” already exists`)
  setList('categories', list.map(c => (c.name === oldName ? { ...c, name: next } : c)))
  const a = { ...aliases(), [oldName]: next }
  load().categoryAliases = a
  // every transaction, and every card that excluded it from rewards, follows the new name
  await db.transactions.where('category').equals(oldName).modify({ category: next })
  await db.creditCards.filter(c => Array.isArray(c.excludedCategories) && c.excludedCategories.includes(oldName)).modify(c => { c.excludedCategories = c.excludedCategories.map(x => (x === oldName ? next : x)) })
  if (isCustomised('exclusions')) setList('exclusions', getList('exclusions').map(x => (x === oldName ? next : x)))
  persist()
}

export async function removeCategory(name) {
  if (LOCKED_CATEGORIES.includes(name)) throw new Error(`“${name}” is used by the app and cannot be removed`)
  setList('categories', getList('categories').filter(c => c.name !== name))
  load().categoryAliases = { ...aliases(), [name]: 'General' }
  await db.transactions.where('category').equals(name).modify({ category: 'General' })
  persist()
}

export function addCategory(name, icon) {
  const n = name.trim()
  if (!n) throw new Error('Enter a name')
  const list = getList('categories')
  if (list.some(c => c.name.toLowerCase() === n.toLowerCase())) throw new Error(`A category called “${n}” already exists`)
  setList('categories', [...list, { name: n, icon: icon || '💳' }])
  // adding back a name that was removed earlier stops mapping it to General
  const a = { ...aliases() }; delete a[n]; load().categoryAliases = a
  persist()
}

// ── debt types ───────────────────────────────────────────
export const debtTypeId = (label, existing) => {
  const base = label.trim().replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : '')) || 'Custom'
  let id = base, i = 2
  while (existing.some(t => t.id === id)) id = base + i++
  return id
}
export function useDebtTypes() {
  const list = useOptions('debtTypes')
  return { list, icons: Object.fromEntries(list.map(t => [t.id, t.icon])), labels: Object.fromEntries(list.map(t => [t.id, t.label])) }
}
